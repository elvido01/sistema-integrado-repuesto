// @ts-nocheck
// deno-lint-ignore-file
//
// ============================================================
// dgii-receptor — Servicios web de RECEPTOR e-CF (Ley 32-23)
// ============================================================
// Todo Emisor Electronico debe ser tambien Receptor: exponer los
// servicios estandar "emisor-receptor" que la DGII prueba en los
// pasos 8-11 de la certificacion y que luego usan otros emisores
// para entregarnos sus e-CF.
//
// Rutas (sufijos FIJOS por la DGII — en el portal solo se declara
// la base, ej: zdvxowpuklbypweyqqki.supabase.co/functions/v1/dgii-receptor):
//
//   GET  <base>/fe/autenticacion/api/semilla
//        → XML SemillaModel (valor + fecha). El emisor la firma con
//          su certificado y la devuelve en validacioncertificado.
//
//   POST <base>/fe/autenticacion/api/validacioncertificado
//        → multipart campo "xml" con la semilla firmada.
//        → JSON { token, expira, expedido } (igual que la DGII).
//
//   POST <base>/fe/recepcion/api/ecf
//        → multipart campo "xml" con el e-CF firmado.
//        → XML ARECF FIRMADO (Acuse de Recibo, Formato v1.0):
//            Estado 0 = e-CF Recibido · 1 = No Recibido
//            CodigoMotivoNoRecibido: 1 espec, 2 firma, 3 duplicado, 4 RNC
//          Solo se reciben tipos 31/33/34/44 (dgii-ecf: excludedEncfType).
//
//   POST <base>/fe/aprobacioncomercial/api/ecf
//        → multipart con el ACECF del comprador.
//        → JSON { estado: "OK" } (la DGII no valida esta respuesta,
//          solo que respondamos; Proceso de Certificacion paso 11).
//
// SEGURIDAD:
//   - Funcion PUBLICA (deploy --no-verify-jwt): la DGII no manda JWT.
//   - Semilla y token son HMAC-SHA256 stateless con DGII_MASTER_KEY
//     (mismo secret que emitir-fiscal). Semilla vence a los 15 min,
//     token a la hora.
//   - El token se valida si viene (Authorization: Bearer), pero NO se
//     rechaza la recepcion si falta: la URL de autenticacion es
//     OPCIONAL en el flujo DGII y el probador puede llamar directo.
//   - Toda llamada queda auditada en public.dgii_recepciones
//     (sql/dgii_receptor.sql). Los self-tests del runner mandan
//     header "x-selftest: 1" y quedan marcados es_prueba.
//
// FIRMA DEL ARECF: se reutiliza el firmador oficial del proyecto
// (signXmlGenerico, byte-identico a la spec "Firmado de e-CF") con el
// certificado .p12 del tenant cuyo RNC coincide con el RNCComprador
// del e-CF recibido (integraciones_fiscales.config.rnc_emisor).
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import forge from "https://esm.sh/node-forge@1.3.1";
import { signXmlGenerico } from "../emitir-fiscal/dgii_signer.ts";

const VERSION = "1.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Tipos que un receptor NO recibe (dgii-ecf SenderReceiver)
const TIPOS_EXCLUIDOS = ["32", "41", "43", "45", "46", "47"];

// ────────────────────────────────────────────────
// Fechas en horario de Santo Domingo (UTC-4 fijo)
// ────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");

function ahoraSD() {
  return new Date(Date.now() - 4 * 3600 * 1000); // leer con getUTC*
}

// dd-MM-yyyy HH:mm:ss (FechaHoraAcuseRecibo del ARECF)
function fechaHoraDgii() {
  const d = ahoraSD();
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

// ISO con offset -04:00 (fecha de la semilla, formato estilo DGII)
function fechaIsoSD(date = null) {
  const d = date ? new Date(date.getTime() - 4 * 3600 * 1000) : ahoraSD();
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.0000000-04:00`;
}

// ────────────────────────────────────────────────
// HMAC stateless (semilla y token) con DGII_MASTER_KEY
// ────────────────────────────────────────────────
let _hmacKey = null;
async function getHmacKey() {
  if (_hmacKey) return _hmacKey;
  const raw = Deno.env.get("DGII_MASTER_KEY");
  if (!raw) throw new Error("DGII_MASTER_KEY no esta configurada");
  const bytes = Uint8Array.from(atob(raw.trim()), (c) => c.charCodeAt(0));
  _hmacKey = await crypto.subtle.importKey(
    "raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return _hmacKey;
}

function b64url(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacB64url(text) {
  const key = await getHmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return b64url(new Uint8Array(sig));
}

// Semilla: "<epochMs>.<rand>.<hmac>" — verificable sin estado
async function generarSemillaValor() {
  const cuerpo = `${Date.now()}.${crypto.randomUUID().replace(/-/g, "")}`;
  return `${cuerpo}.${await hmacB64url(cuerpo)}`;
}

async function validarSemillaValor(valor, maxEdadMs = 15 * 60 * 1000) {
  const partes = String(valor || "").trim().split(".");
  if (partes.length !== 3) return { ok: false, error: "semilla malformada" };
  const cuerpo = `${partes[0]}.${partes[1]}`;
  if (await hmacB64url(cuerpo) !== partes[2]) return { ok: false, error: "semilla no emitida por este servicio" };
  const edad = Date.now() - Number(partes[0]);
  if (!(edad >= 0 && edad <= maxEdadMs)) return { ok: false, error: "semilla vencida" };
  return { ok: true };
}

// Token: "<payloadB64url>.<hmac>" con { iat, exp } en epoch ms
async function generarToken() {
  const iat = Date.now();
  const exp = iat + 60 * 60 * 1000; // 1 hora, igual que DGII
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ iat, exp })));
  const token = `${payload}.${await hmacB64url(payload)}`;
  return { token, expedido: fechaIsoSD(new Date(iat)), expira: fechaIsoSD(new Date(exp)) };
}

async function validarToken(authHeader) {
  const m = String(authHeader || "").match(/Bearer\s+(.+)/i);
  if (!m) return null; // sin token — tolerado
  try {
    const [payload, firma] = m[1].trim().split(".");
    if (!payload || !firma || await hmacB64url(payload) !== firma) return false;
    const { exp } = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return Date.now() <= Number(exp);
  } catch (_) {
    return false;
  }
}

// ────────────────────────────────────────────────
// Parsing del request y del XML
// ────────────────────────────────────────────────
async function leerXmlDelRequest(req) {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    let campo = form.get("xml") || form.get("file") || form.get("archivo");
    if (!campo) {
      for (const [, v] of form.entries()) {
        if (v instanceof File) { campo = v; break; }
      }
    }
    if (campo instanceof File) return await campo.text();
    if (typeof campo === "string") return campo;
    return "";
  }
  return await req.text();
}

function xmlField(xml, tag) {
  const re = new RegExp(`<(?:[A-Za-z0-9_]+:)?${tag}[^>]*>(.*?)</(?:[A-Za-z0-9_]+:)?${tag}>`, "is");
  const m = String(xml || "").match(re);
  return m?.[1]?.trim() ?? "";
}

const escXml = (s) => String(s || "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ────────────────────────────────────────────────
// Certificado .p12 del tenant (copia minima de emitir-fiscal —
// misma logica de descifrado AES-256-GCM y parseo con forge)
// ────────────────────────────────────────────────
async function getAesKey() {
  const raw = Deno.env.get("DGII_MASTER_KEY");
  if (!raw) throw new Error("DGII_MASTER_KEY no esta configurada");
  const bytes = Uint8Array.from(atob(raw.trim()), (c) => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("DGII_MASTER_KEY debe ser 32 bytes en base64");
  return await crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function decryptPassword(ciphertextB64, ivB64) {
  const key = await getAesKey();
  const ct = Uint8Array.from(atob(ciphertextB64), (c) => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

async function loadP12(supabase, config) {
  const { data: blob, error } = await supabase.storage
    .from("certificados-dgii")
    .download(config.certificado_storage_path);
  if (error) throw new Error(`No se pudo bajar el .p12: ${error.message}`);
  const buf = new Uint8Array(await blob.arrayBuffer());
  const password = await decryptPassword(config.certificado_password_enc, config.certificado_password_iv);
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bin), false, password);
  const cert = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0]?.cert;
  const privateKey =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0]?.key;
  if (!cert || !privateKey) throw new Error("El .p12 no contiene cert o clave privada");
  return { cert, privateKey };
}

// Busca la integracion dgii_directo cuyo RNC coincide con rncComprador;
// si ninguna coincide, prefiere la de ambiente CerteCF (la que se esta
// certificando) y por ultimo la primera activa con certificado.
async function resolverReceptor(supabase, rncComprador) {
  const { data: rows, error } = await supabase
    .from("integraciones_fiscales")
    .select("tenant_id, config")
    .eq("proveedor", "dgii_directo")
    .eq("activo", true);
  if (error) throw new Error(`integraciones_fiscales: ${error.message}`);
  const conCert = (rows || []).filter((r) => r.config?.certificado_storage_path);
  const limpio = (s) => String(s || "").replace(/\D/g, "");
  return (
    conCert.find((r) => limpio(r.config?.rnc_emisor) === limpio(rncComprador)) ||
    conCert.find((r) => r.config?.ambiente === "CerteCF") ||
    conCert[0] ||
    null
  );
}

// ────────────────────────────────────────────────
// Auditoria en dgii_recepciones (no bloqueante)
// ────────────────────────────────────────────────
async function logRecepcion(supabase, req, fila) {
  try {
    await supabase.from("dgii_recepciones").insert({
      ...fila,
      raw_xml: fila.raw_xml?.slice(0, 100000) || null,
      respuesta_xml: fila.respuesta_xml?.slice(0, 100000) || null,
      headers: Object.fromEntries(req.headers),
      ip: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null,
      es_prueba: req.headers.get("x-selftest") === "1",
    });
  } catch (e) {
    console.warn("[dgii-receptor] no se pudo auditar:", e.message);
  }
}

const jsonResp = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const xmlResp = (xml, status = 200) =>
  new Response(xml, {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
  });

// ────────────────────────────────────────────────
// Handlers por ruta
// ────────────────────────────────────────────────
async function handleSemilla(supabase, req) {
  const valor = await generarSemillaValor();
  const xml =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<SemillaModel xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<valor>${valor}</valor>` +
    `<fecha>${fechaIsoSD()}</fecha>` +
    `</SemillaModel>`;
  await logRecepcion(supabase, req, { tipo: "SEMILLA", estado: "emitida", respuesta_xml: xml });
  return xmlResp(xml);
}

async function handleValidacionCertificado(supabase, req) {
  const xml = await leerXmlDelRequest(req);
  const valor = xmlField(xml, "valor");
  const check = await validarSemillaValor(valor);
  if (!check.ok) {
    await logRecepcion(supabase, req, { tipo: "TOKEN", estado: "rechazado", motivo: check.error, raw_xml: xml });
    return jsonResp({ error: check.error }, 401);
  }
  // Nota: no validamos la cadena del certificado del emisor aqui; la DGII
  // exige el flujo semilla→token, la confianza real esta en que el e-CF
  // recibido viene firmado. (Endurecer en produccion si se quiere.)
  const tok = await generarToken();
  await logRecepcion(supabase, req, { tipo: "TOKEN", estado: "emitido", raw_xml: xml });
  return jsonResp(tok);
}

async function handleRecepcionEcf(supabase, req) {
  const xml = await leerXmlDelRequest(req);
  const tokenValido = await validarToken(req.headers.get("authorization"));

  const encf = xmlField(xml, "eNCF");
  const tipoEcf = xmlField(xml, "TipoeCF");
  const rncEmisor = xmlField(xml, "RNCEmisor");
  const rncComprador = xmlField(xml, "RNCComprador");

  if (!xml.trim() || !encf || !rncEmisor) {
    await logRecepcion(supabase, req, {
      tipo: "ECF", estado: "1", motivo: "1 - XML sin eNCF/RNCEmisor",
      encf, tipo_ecf: tipoEcf, rnc_emisor: rncEmisor, rnc_comprador: rncComprador,
      token_valido: tokenValido, raw_xml: xml,
    });
    return jsonResp({ error: "XML de e-CF invalido o incompleto" }, 400);
  }

  const receptor = await resolverReceptor(supabase, rncComprador);
  if (!receptor) {
    await logRecepcion(supabase, req, {
      tipo: "ECF", estado: "error", motivo: "sin integracion dgii_directo con certificado",
      encf, tipo_ecf: tipoEcf, rnc_emisor: rncEmisor, rnc_comprador: rncComprador,
      token_valido: tokenValido, raw_xml: xml,
    });
    return jsonResp({ error: "Receptor sin certificado configurado" }, 500);
  }
  const rncReceptor = String(receptor.config?.rnc_emisor || "").replace(/\D/g, "");

  // Reglas del Formato Acuse de Recibo v1.0 (mismo orden que dgii-ecf)
  let estado = "0";
  let motivo = null; // 1 espec · 2 firma · 3 duplicado · 4 RNC comprador
  const tieneFirma = /<(\w+:)?Signature\b/.test(xml);

  if (!tieneFirma) {
    estado = "1"; motivo = "2";
  } else if (tipoEcf && TIPOS_EXCLUIDOS.includes(tipoEcf)) {
    estado = "1"; motivo = "1";
  } else if (rncComprador && rncReceptor && rncComprador.replace(/\D/g, "") !== rncReceptor) {
    estado = "1"; motivo = "4";
  } else if (req.headers.get("x-selftest") !== "1") {
    // Duplicado: ya recibimos este eNCF del mismo emisor con Estado 0
    const { data: dup } = await supabase
      .from("dgii_recepciones")
      .select("id")
      .eq("tipo", "ECF").eq("encf", encf).eq("rnc_emisor", rncEmisor)
      .eq("estado", "0").eq("es_prueba", false)
      .limit(1);
    if (dup?.length) { estado = "1"; motivo = "3"; }
  }

  const arecfSinFirma =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<ARECF xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">` +
    `<DetalleAcusedeRecibo>` +
    `<Version>1.0</Version>` +
    `<RNCEmisor>${escXml(rncEmisor)}</RNCEmisor>` +
    `<RNCComprador>${escXml(rncComprador || rncReceptor)}</RNCComprador>` +
    `<eNCF>${escXml(encf)}</eNCF>` +
    `<Estado>${estado}</Estado>` +
    (motivo ? `<CodigoMotivoNoRecibido>${motivo}</CodigoMotivoNoRecibido>` : "") +
    `<FechaHoraAcuseRecibo>${fechaHoraDgii()}</FechaHoraAcuseRecibo>` +
    `</DetalleAcusedeRecibo>` +
    `</ARECF>`;

  const { cert, privateKey } = await loadP12(supabase, receptor.config);
  const { xmlFirmado } = await signXmlGenerico(arecfSinFirma, cert, privateKey);
  const arecf = xmlFirmado.startsWith("<?xml")
    ? xmlFirmado
    : `<?xml version="1.0" encoding="utf-8"?>${xmlFirmado}`;

  await logRecepcion(supabase, req, {
    tipo: "ECF", tenant_id: receptor.tenant_id, estado, motivo,
    encf, tipo_ecf: tipoEcf, rnc_emisor: rncEmisor, rnc_comprador: rncComprador,
    token_valido: tokenValido, raw_xml: xml, respuesta_xml: arecf,
  });

  return xmlResp(arecf);
}

async function handleAprobacionComercial(supabase, req) {
  const xml = await leerXmlDelRequest(req);
  const tokenValido = await validarToken(req.headers.get("authorization"));
  const encf = xmlField(xml, "eNCF");
  const rncEmisor = xmlField(xml, "RNCEmisor");
  const rncComprador = xmlField(xml, "RNCComprador");
  const estadoAC = xmlField(xml, "Estado");

  const ok = !!(xml.trim() && encf);
  // Respuesta del receptor segun Proceso de Certificacion paso 11:
  // "OK" satisfactorio · "Error"/"Incorrecto" si no.
  const respuesta = ok ? "OK" : "Error";

  const receptor = await resolverReceptor(supabase, rncComprador).catch(() => null);

  await logRecepcion(supabase, req, {
    tipo: "ACECF", tenant_id: receptor?.tenant_id || null,
    estado: respuesta, motivo: ok ? (estadoAC ? `EstadoAC=${estadoAC}` : null) : "XML sin eNCF",
    encf, rnc_emisor: rncEmisor, rnc_comprador: rncComprador,
    token_valido: tokenValido, raw_xml: xml,
  });

  return jsonResp({ estado: respuesta }, ok ? 200 : 400);
}

// ────────────────────────────────────────────────
// Router
// ────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const path = new URL(req.url).pathname.toLowerCase().replace(/\/+$/, "");

  try {
    if (path.endsWith("/fe/autenticacion/api/semilla") && req.method === "GET") {
      return await handleSemilla(supabase, req);
    }
    if (path.endsWith("/fe/autenticacion/api/validacioncertificado") && req.method === "POST") {
      return await handleValidacionCertificado(supabase, req);
    }
    if (path.endsWith("/fe/recepcion/api/ecf") && req.method === "POST") {
      return await handleRecepcionEcf(supabase, req);
    }
    if (path.endsWith("/fe/aprobacioncomercial/api/ecf") && req.method === "POST") {
      return await handleAprobacionComercial(supabase, req);
    }

    // Healthcheck / descubrimiento
    if (req.method === "GET") {
      return jsonResp({
        ok: true,
        service: "dgii-receptor",
        version: VERSION,
        rutas: [
          "GET  fe/autenticacion/api/semilla",
          "POST fe/autenticacion/api/validacioncertificado",
          "POST fe/recepcion/api/ecf",
          "POST fe/aprobacioncomercial/api/ecf",
        ],
        timestamp: new Date().toISOString(),
      });
    }

    await logRecepcion(supabase, req, {
      tipo: "DESCONOCIDO", estado: "404", motivo: `${req.method} ${path}`,
      raw_xml: await req.text().catch(() => null),
    });
    return jsonResp({ error: "Ruta no reconocida", path }, 404);
  } catch (e) {
    console.error("[dgii-receptor] error:", e);
    await logRecepcion(supabase, req, { tipo: "ERROR", estado: "500", motivo: String(e?.message || e) });
    return jsonResp({ error: e?.message || "Error interno" }, 500);
  }
});
