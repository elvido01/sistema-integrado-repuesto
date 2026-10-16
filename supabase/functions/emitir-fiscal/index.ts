// @ts-nocheck
// deno-lint-ignore-file
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import forge from "https://esm.sh/node-forge@1.3.1";
import { buildEcfXml, facturaToEcfInput, notaToEcfInput, buildAnecfXml, buildRfceXml, buildAcecfXml, rncValidoDgii, compradorIdentificado, tipoEcfDeCliente } from "./dgii_xml_builder.ts";
import { buildEcfFromTestRow, buildRfceFromTestRow } from "./dgii_certif_builder.ts";
import { signEcfXml, signXmlGenerico } from "./dgii_signer.ts";
import { buildRfceDesdeEcf } from "./dgii_rfce_produccion.ts";
import { dgiiFetch, multipartXml, authenticate, enviarEcf, consultarEstado, consultarTrackIds, enviarAnulacion, enviarRfce, enviarAprobacionComercial } from "./dgii_client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const normalizeDgiiDate = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  let m = raw.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-20${m[3]}`;
  m = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return raw;
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return raw;
};

// ============================================================
// resolveEmisorConfig
// ============================================================
// Devuelve el config del emisor con fallback automatico a config_empresa.
// Sin esto, cada tenant nuevo requeria UPDATE manual de SQL para meter
// direccion/email/telefono (sino DGII rechaza con "400 DireccionEmisor").
//
// Mapping config_empresa -> emisor:
//   rnc          -> rnc_emisor       (si falta en integ.config)
//   nombre       -> nombre_emisor    (si falta en integ.config)
//   direccion1   -> direccion        (si falta)
//   telefono     -> telefono         (si falta)
//   email        -> email            (si falta)
//
// Los campos municipio/provincia/nombre_comercial NO estan en
// config_empresa todavia — siguen requiriendo seteo manual en
// integraciones_fiscales.config hasta que el uploader los pida.
//
// integ.config SIEMPRE gana sobre config_empresa (es el origen
// "fiscal", mas autoritativo).
async function resolveEmisorConfig(supabase, tenantId, integConfig) {
  if (!tenantId) return integConfig || {};
  const cfg = { ...(integConfig || {}) };

  // Si ya tiene todos los campos criticos, no hace falta tocar nada.
  const needsFallback =
    !cfg.direccion || !cfg.email || !cfg.telefono ||
    !cfg.rnc_emisor || !cfg.nombre_emisor;
  if (!needsFallback) return cfg;

  try {
    const { data: empresa } = await supabase
      .from("config_empresa")
      .select("rnc, nombre, direccion1, email, telefono")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!empresa) return cfg;

    if (!cfg.rnc_emisor && empresa.rnc) cfg.rnc_emisor = empresa.rnc;
    if (!cfg.nombre_emisor && empresa.nombre) cfg.nombre_emisor = empresa.nombre;
    if (!cfg.direccion && empresa.direccion1) cfg.direccion = empresa.direccion1;
    if (!cfg.telefono && empresa.telefono) cfg.telefono = empresa.telefono;
    if (!cfg.email && empresa.email) cfg.email = empresa.email;
    if (!cfg.nombre_comercial && empresa.nombre) cfg.nombre_comercial = empresa.nombre;
  } catch (err) {
    console.warn("[resolveEmisorConfig] fallback config_empresa fallo:", err.message);
  }
  return cfg;
}

// ============================================================
// CONTRATO EmisorAdapter
// ============================================================
// Cada proveedor de facturación electrónica implementa este contrato.
// El handler principal selecciona el adapter según `integraciones_fiscales.proveedor`
// y llama estos dos métodos. Para agregar un nuevo proveedor:
//   1. Implementar las dos funciones (testConnection, emitirFactura).
//   2. Registrarlo en ADAPTADORES con su key (ej. "alegra", "dgii_directo").
//   3. Insertar fila en integraciones_fiscales con `proveedor = '<key>'` y
//      `config` con los datos que el adapter espera.
//
// CONTRATO:
//
//   testConnection(config) -> { ok: boolean, ...info }
//     Valida credenciales/config. NO emite nada. Lanza si falla.
//
//   emitirFactura(supabase, config, factura, detalles, cliente) -> {
//     proveedor_invoice_id: string,    // id que devuelve el proveedor / TrackId DGII
//     proveedor_number:     string,    // numero comercial / fullNumber
//     ncf:                  string,    // NCF / e-NCF asignado
//     request_payload:      object,    // lo que enviamos (para auditoria)
//     response_payload:     object,    // lo que recibimos (para auditoria)
//   }
//     - Recibe el cliente Supabase (service role) por si necesita persistir
//       datos del proveedor en tablas (ej. fiscal_contact_id en clientes).
//     - Recibe `config` desde integraciones_fiscales.config (ya parseado).
//     - Lanza Error con mensaje legible si falla; el handler lo registra.
// ============================================================

// ============================================================
// HELPERS: Cifrado AES-256-GCM para passwords de certificado
// ============================================================
// El password del .p12 se almacena en integraciones_fiscales.config
// cifrado con AES-256-GCM. La master key (32 bytes en base64) vive
// en la variable de entorno DGII_MASTER_KEY del edge function. La
// edge function nunca expone la clave al frontend.
//
// Para generar la master key una sola vez (en consola local):
//   openssl rand -base64 32
// Y configurarla:
//   supabase secrets set DGII_MASTER_KEY=<base64-output>

async function getMasterKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("DGII_MASTER_KEY");
  if (!raw) {
    throw new Error(
      "DGII_MASTER_KEY no esta configurada. Genera una con `openssl rand -base64 32` y registrala con `supabase secrets set DGII_MASTER_KEY=...`"
    );
  }
  const keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  if (keyBytes.byteLength !== 32) {
    throw new Error("DGII_MASTER_KEY debe ser 32 bytes (256 bits) en base64");
  }
  return await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptPassword(plain: string): Promise<{ iv: string; ciphertext: string }> {
  const key = await getMasterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96 bits para GCM
  const enc = new TextEncoder();
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plain)
  );
  return {
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ct))),
  };
}

async function decryptPassword(ciphertextB64: string, ivB64: string): Promise<string> {
  const key = await getMasterKey();
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(ciphertextB64), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// ============================================================
// HELPERS: Log de documentos fiscales (e-CF) en BD + Storage
// ============================================================
// Cada e-CF emitido genera una fila en `documentos_fiscales`
// (proveedor='dgii_directo'). El XML firmado se guarda en el
// bucket privado `ecf-xmls` con path:
//   <tenant_id>/<año>/<mes>/<encf>.xml
// para retencion legal de 10 anos.

async function logEcfStart(supabase, params) {
  // params: { tenantId, factura_id, tipo_ecf, encf, ambiente }
  const { data, error } = await supabase
    .from("documentos_fiscales")
    .insert({
      tenant_id: params.tenantId,
      factura_id: params.factura_id || null,
      proveedor: "dgii_directo",
      tipo_documento: "factura",
      tipo_ecf: params.tipo_ecf,
      encf: params.encf,
      ambiente: params.ambiente,
      estado: "procesando",
      ncf: params.encf,
    })
    .select()
    .single();
  if (error) throw new Error(`Error iniciando log e-CF: ${error.message}`);
  return data;
}

async function logEcfXmlGenerated(supabase, docId, xmlPath, requestPayload) {
  const { error } = await supabase
    .from("documentos_fiscales")
    .update({
      xml_firmado_path: xmlPath,
      request_payload: requestPayload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", docId);
  if (error) throw new Error(`Error registrando XML: ${error.message}`);
}

async function logEcfSent(supabase, docId, trackId) {
  const { error } = await supabase
    .from("documentos_fiscales")
    .update({
      track_id: trackId,
      estado_dgii: "enviado",
      estado: "emitido",
      emitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", docId);
  if (error) throw new Error(`Error registrando envio: ${error.message}`);
}

async function logEcfArecf(supabase, docId, estado, payload) {
  // estado: 'aceptado' | 'rechazado' | 'aceptado_condicional'
  const { error } = await supabase
    .from("documentos_fiscales")
    .update({
      estado_dgii: estado,
      arecf_recibido_at: new Date().toISOString(),
      arecf_payload: payload,
      dgii_messages: payload?.mensajes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", docId);
  if (error) throw new Error(`Error registrando ARECF: ${error.message}`);
}

// (10/10/2026) Revisión automática de los e-CF que quedaron "enviado".
// El E31 no se acepta en el acto: la DGII lo valida después y nadie volvía a
// preguntar; uno rechazado más tarde quedaba como bueno en MotoFlow. Lo
// llama una tarea programada (x-cron-secret) cada 10 minutos. Autentica una
// vez por empresa; si falta el TrackId (se perdió al guardar) lo recupera
// por el e-NCF. Rechazado → aviso a quien hizo la venta.
const normalizarEstadoDgii = (est) => {
  const e = String(est?.estado || est?.Estado || est?.codigo || "").toLowerCase();
  if (e.includes("condicional")) return "aceptado_condicional";
  if (e.includes("aceptado") || e === "1") return "aceptado";
  if (e.includes("rechaz") || e === "0") return "rechazado";
  return "enviado";
};

async function revisarPendientesDgii(supabase) {
  const desde = new Date(Date.now() - 15 * 86400000).toISOString();
  const { data: docs, error } = await supabase
    .from("documentos_fiscales")
    .select("id, tenant_id, factura_id, encf, track_id, tipo_ecf, ambiente, emitido_por, emitted_at")
    .eq("proveedor", "dgii_directo")
    .eq("estado", "emitido")
    .eq("estado_dgii", "enviado")
    .eq("ambiente", "Produccion")
    .gte("emitted_at", desde)
    .lte("emitted_at", new Date(Date.now() - 60000).toISOString())
    .order("emitted_at", { ascending: true })
    .limit(40);
  if (error) throw new Error(`revisar pendientes: ${error.message}`);
  const resumen = { revisados: 0, aceptados: 0, rechazados: 0, siguen: 0, errores: [] };
  const porEmpresa = new Map();
  for (const d of docs || []) {
    if (String(d.track_id || "").startsWith("RFCE-")) continue; // el RFCE contesta en el acto
    if (!porEmpresa.has(d.tenant_id)) porEmpresa.set(d.tenant_id, []);
    porEmpresa.get(d.tenant_id).push(d);
  }
  for (const [tenantId, lista] of porEmpresa) {
    try {
      const { data: integ } = await supabase.from("integraciones_fiscales").select("config")
        .eq("tenant_id", tenantId).eq("proveedor", "dgii_directo").maybeSingle();
      if (!integ?.config) throw new Error("sin config DGII");
      const { cert, privateKey } = await loadAndParseP12(supabase, integ.config);
      const auth = await authenticate(cert, privateKey, "Produccion");
      for (const d of lista) {
        resumen.revisados++;
        try {
          let track = d.track_id;
          if (!track) {
            const t = await consultarTrackIds(integ.config.rnc_emisor, d.encf, auth.token, "Produccion");
            const arr = Array.isArray(t) ? t : (t?.trackIds || t?.TrackIds || []);
            const ult = arr[arr.length - 1];
            track = ult?.trackId || ult?.TrackId || null;
            if (track) {
              const { error: e } = await supabase.from("documentos_fiscales").update({ track_id: track }).eq("id", d.id);
              if (e) resumen.errores.push(`${d.encf}: guardar track: ${e.message}`);
            }
          }
          if (!track) { resumen.siguen++; continue; }
          const est = await consultarEstado(track, auth.token, "Produccion");
          const norm = normalizarEstadoDgii(est);
          if (norm === "enviado") { resumen.siguen++; continue; }
          await logEcfArecf(supabase, d.id, norm, est);
          if (norm === "rechazado") {
            resumen.rechazados++;
            const { data: f } = await supabase.from("facturas").select("numero").eq("id", d.factura_id).maybeSingle();
            const motivo = JSON.stringify(est?.mensajes || est?.Mensajes || est).slice(0, 400);
            if (d.emitido_por) {
              const { error: e } = await supabase.from("notificaciones").insert({
                tenant_id: tenantId, user_id: d.emitido_por, tipo: "ecf_rechazado",
                titulo: `La DGII rechazó el ${d.encf} (factura #${f?.numero ?? "?"})`,
                mensaje: `Hay que corregir y volver a emitir. Motivo: ${motivo}`,
              });
              if (e) resumen.errores.push(`${d.encf}: aviso: ${e.message}`);
            }
          } else resumen.aceptados++;
        } catch (e) {
          resumen.errores.push(`${d.encf}: ${String(e?.message || e).slice(0, 200)}`);
        }
      }
    } catch (e) {
      resumen.errores.push(`empresa ${String(tenantId).slice(0, 8)}: ${String(e?.message || e).slice(0, 200)}`);
    }
  }
  return resumen;
}

// (16/10/2026) Comprador real de una venta financiada por terceros (Caminero →
// MotoPréstamos). Al grabar, procesar_financiamiento_terceros le pone a la
// factura la ficha de la financiera (la CxC es de ella) y deja al comprador
// solo como nombre: sin esto el e-CF salía sin cédula y el de RD$250,000 o más
// no se podía emitir. El comprador se toma de la solicitud ("SOLICITUD #N" en
// las notas de la factura) y, si ahí falta el documento, de su carta de ruta.
async function compradorReal(supabase, factura, cliente) {
  if (compradorIdentificado(cliente?.rnc)) return cliente;
  const m = String(factura?.notas || "").match(/SOLICITUD #(\d+)/);
  if (!m) return cliente;
  const { data: sol } = await supabase.from("solicitudes_compras")
    .select("id, cliente_id, cliente_nombre, cliente_rnc")
    .eq("tenant_id", factura.tenant_id).eq("numero", Number(m[1]))
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!sol) return cliente;
  let ficha = null;
  if (sol.cliente_id) {
    const { data } = await supabase.from("clientes").select("*").eq("id", sol.cliente_id).maybeSingle();
    ficha = data;
  }
  let doc = [sol.cliente_rnc, ficha?.rnc, ficha?.codigo].find((d) => compradorIdentificado(d)) || null;
  if (!doc) {
    const { data: cartas } = await supabase.from("cartas_ruta").select("cliente_cedula")
      .eq("solicitud_id", sol.id).order("created_at", { ascending: false }).limit(5);
    doc = (cartas || []).map((c) => c.cliente_cedula).find((d) => compradorIdentificado(d)) || null;
  }
  if (!doc) return cliente;
  return {
    ...(ficha || cliente || {}),
    nombre: String(sol.cliente_nombre || "").trim() || ficha?.nombre || factura.manual_cliente_nombre || cliente?.nombre,
    rnc: String(doc).trim(),
    tipo_ncf: ficha?.tipo_ncf || "02",
  };
}

// (10/10/2026) Cola de reintento. Una venta de una empresa con e-CF en
// PRODUCCIÓN que quedó sin comprobante (la DGII falló, se cayó la conexión)
// se vuelve a emitir sola, reusando el e-NCF y el XML que ya tomó. Ventanas:
// de 3 minutos (deja terminar la venta en curso) a 72 horas. Salta anuladas
// y devueltas. Máximo 10 por vuelta (límite de tiempo de la función).
const MAX_INTENTOS_ECF = 6;
async function reintentarPendientesDgii(supabase) {
  const resumen = { candidatas: 0, emitidas: [], fallidas: [] };
  const { data: integs } = await supabase
    .from("integraciones_fiscales").select("tenant_id")
    .eq("proveedor", "dgii_directo").eq("activo", true).eq("modo", "produccion");
  let restantes = 10;
  for (const { tenant_id } of integs || []) {
    if (restantes <= 0) break;
    const { data: facts } = await supabase
      .from("facturas").select("id, numero, usuario_id, created_at")
      .eq("tenant_id", tenant_id).is("ncf", null).neq("estado", "ANULADA").eq("es_saldo_inicial", false)
      .gte("created_at", new Date(Date.now() - 72 * 3600000).toISOString())
      .lte("created_at", new Date(Date.now() - 3 * 60000).toISOString())
      .order("created_at", { ascending: true }).limit(30);
    if (!facts?.length) continue;
    const ids = facts.map((f) => f.id);
    const { data: devs } = await supabase.from("devoluciones").select("factura_id").in("factura_id", ids);
    const devueltas = new Set((devs || []).map((d) => d.factura_id));
    const { data: docs } = await supabase.from("documentos_fiscales")
      .select("factura_id, estado, retry_count").in("factura_id", ids);
    const docDe = new Map((docs || []).map((d) => [d.factura_id, d]));
    for (const f of facts) {
      if (restantes <= 0) break;
      const d = docDe.get(f.id);
      if (devueltas.has(f.id) || d?.estado === "emitido") continue;
      if ((d?.retry_count || 0) >= MAX_INTENTOS_ECF) continue;
      restantes--; resumen.candidatas++;
      try {
        const r = await emitirFacturaFiscal(supabase, tenant_id, f.id, null);
        resumen.emitidas.push(`#${f.numero} ${r.ncf}`);
        if (f.usuario_id) {
          await supabase.from("notificaciones").insert({
            tenant_id, user_id: f.usuario_id, tipo: "ecf_emitido_tarde",
            titulo: `La factura #${f.numero} ya tiene su e-CF (${r.ncf})`,
            mensaje: "Se emitió después de la venta porque la DGII no respondió a tiempo. Reimprímela desde Transacciones y entrégale la nueva al cliente.",
          });
        }
      } catch (e) {
        const msg = String(e?.message || e).slice(0, 300);
        resumen.fallidas.push(`#${f.numero}: ${msg}`);
        const intentos = (d?.retry_count || 0) + 1;
        if (intentos >= MAX_INTENTOS_ECF && f.usuario_id) {
          await supabase.from("notificaciones").insert({
            tenant_id, user_id: f.usuario_id, tipo: "ecf_no_emitido",
            titulo: `La factura #${f.numero} sigue SIN e-CF tras ${intentos} intentos`,
            mensaje: `Hay que revisarla a mano. Último error: ${msg}`,
          });
        }
      }
    }
  }
  return resumen;
}

// (10/10/2026) Salud DGII de cada empresa, una vez al día (plan, paso 4).
// Certificado: se abre el .p12 y se lee su vencimiento (no está guardado en
// otro lado). Secuencias: lo que queda del rango autorizado y su fecha de
// vencimiento. Avisa con alertas_avisar (campana del superadmin y, si es
// urgente, chat de Hermes). El título lleva el "escalón" (30/15/7 días) para
// que cada escalón avise una vez y no todos los días.
async function saludDgii(supabase) {
  const resumen = { empresas: 0, avisos: [] };
  const avisar = async (tenant, titulo, mensaje, urgente, cadaHoras) => {
    const { error } = await supabase.rpc("alertas_avisar", {
      p_tipo: "alerta_dgii", p_tenant: tenant, p_titulo: titulo, p_mensaje: mensaje,
      p_urgente: urgente, p_cada_horas: cadaHoras,
    });
    resumen.avisos.push(error ? `ERROR aviso: ${error.message}` : titulo);
  };
  const { data: integs } = await supabase.from("integraciones_fiscales")
    .select("tenant_id, config, modo").eq("proveedor", "dgii_directo").eq("activo", true);
  for (const integ of integs || []) {
    resumen.empresas++;
    const { data: emp } = await supabase.from("config_empresa").select("nombre")
      .eq("tenant_id", integ.tenant_id).maybeSingle();
    const nombre = emp?.nombre || String(integ.tenant_id).slice(0, 8);
    // Certificado
    try {
      const { cert } = await loadAndParseP12(supabase, integ.config);
      const dias = Math.ceil((cert.validity.notAfter.getTime() - Date.now()) / 86400000);
      const fecha = cert.validity.notAfter.toISOString().slice(0, 10);
      if (dias <= 30) {
        const escalon = dias <= 0 ? "VENCIDO" : dias <= 7 ? "vence en 7 días o menos" : dias <= 15 ? "vence en 15 días o menos" : "vence en 30 días o menos";
        await avisar(integ.tenant_id, `Certificado digital de ${nombre}: ${escalon}`,
          `Vence el ${fecha} (${dias} días). Renuévalo con la entidad certificadora y súbelo en Configuración → DGII. Sin certificado vigente la empresa NO puede emitir e-CF.`,
          dias <= 7, dias <= 7 ? 24 : 24 * 20);
      }
    } catch (e) {
      await avisar(integ.tenant_id, `No se pudo abrir el certificado digital de ${nombre}`,
        `MotoFlow no puede firmar sus e-CF: ${String(e?.message || e).slice(0, 200)}. Revisa el archivo y la contraseña en Configuración → DGII.`,
        true, 24);
    }
    if (integ.modo !== "produccion") continue;
    // Secuencias de producción
    const { data: secs } = await supabase.from("ecf_secuencias")
      .select("tipo_ecf, desde, hasta, ultimo").eq("tenant_id", integ.tenant_id)
      .eq("ambiente", "Produccion").eq("activo", true);
    for (const s of secs || []) {
      const total = Number(s.hasta) - Number(s.desde) + 1;
      const quedan = Number(s.hasta) - Number(s.ultimo);
      if (quedan <= Math.max(5, Math.ceil(total * 0.1))) {
        await avisar(integ.tenant_id, `Secuencia E${s.tipo_ecf} de ${nombre} se está agotando`,
          `Quedan ${quedan} de ${total} números (hasta E${s.tipo_ecf}${String(s.hasta).padStart(10, "0")}). Solicita un nuevo rango en la Oficina Virtual de la DGII y cárgalo en MotoFlow antes de que se acabe.`,
          quedan <= 2, quedan <= 2 ? 24 : 72);
      }
    }
    // Vencimiento de las secuencias (DD-MM-YYYY en la config)
    const m = String(integ.config?.fecha_vencimiento_secuencia || "").match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (m) {
      const vence = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 23, 59));
      const dias = Math.ceil((vence.getTime() - Date.now()) / 86400000);
      if (dias <= 30) {
        await avisar(integ.tenant_id, `Las secuencias e-CF de ${nombre} vencen ${dias <= 0 ? "YA" : "pronto"}`,
          `Fecha de vencimiento: ${m[0]} (${dias} días). Solicita las nuevas en la Oficina Virtual de la DGII.`,
          dias <= 7, dias <= 7 ? 24 : 24 * 7);
      }
    }
  }
  return resumen;
}

async function logEcfAecf(supabase, docId, estado, payload) {
  // estado: 'aprobado' | 'rechazado' (B2B tipo 31)
  const { error } = await supabase
    .from("documentos_fiscales")
    .update({
      aecf_estado: estado,
      aecf_recibido_at: new Date().toISOString(),
      aecf_payload: payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", docId);
  if (error) throw new Error(`Error registrando AECF: ${error.message}`);
}

async function logEcfError(supabase, docId, errorMessage) {
  const { error } = await supabase
    .from("documentos_fiscales")
    .update({
      estado: "error",
      error_message: errorMessage,
      retry_count: 1, // se incrementa via stored procedure si reintentamos
      updated_at: new Date().toISOString(),
    })
    .eq("id", docId);
  if (error) console.error("[emitir-fiscal] Error registrando error:", error);
}

async function uploadSignedXml(supabase, tenantId, encf, xmlString) {
  // path: <tenant>/<año>/<mes>/<encf>.xml
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const path = `${tenantId}/${year}/${month}/${encf}.xml`;

  // upsert: true — el XML para un mismo e-NCF es determinístico. Si la
  // misma operación se reintenta (timeout, auth DGII falló, etc.) no
  // queremos que el storage bloquee el retry. En producción, si el
  // e-NCF es realmente nuevo (correlativo único), nunca habrá colisión.
  const { error: upErr } = await supabase.storage
    .from("ecf-xmls")
    .upload(path, new Blob([xmlString], { type: "application/xml" }), {
      upsert: true,
      contentType: "application/xml",
    });
  if (upErr) throw new Error(`Error subiendo XML firmado: ${upErr.message}`);
  return path;
}

// ============================================================
// HELPERS: Carga y parsing del certificado .p12 (DGII)
// ============================================================
// loadAndParseP12 baja el .p12 del Storage, descifra el password,
// y parsea el archivo con node-forge para devolver:
//   - cert     : objeto X.509 del emisor (uso en metadata)
//   - privateKey: clave privada (para firma XAdES-BES en futuro)
//   - metadata : { subject_cn, issuer_cn, valid_from, valid_to, serial }
// La password en plaintext NUNCA sale de esta funcion.

async function loadAndParseP12(supabase, config) {
  const path = config?.certificado_storage_path;
  const ctEnc = config?.certificado_password_enc;
  const ivEnc = config?.certificado_password_iv;
  if (!path) throw new Error("No hay certificado_storage_path en la config");
  if (!ctEnc || !ivEnc) throw new Error("No hay password cifrado en la config");

  // 1. Bajar el .p12 desde Storage privado
  const { data: blob, error: dlErr } = await supabase.storage
    .from("certificados-dgii")
    .download(path);
  if (dlErr) throw new Error(`No se pudo bajar el .p12: ${dlErr.message}`);
  const buf = new Uint8Array(await blob.arrayBuffer());

  // 2. Descifrar el password con la master key
  const password = await decryptPassword(ctEnc, ivEnc);

  // 3. Parsear el .p12 con node-forge
  let p12;
  try {
    // forge necesita el DER como binary string
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const p12Asn1 = forge.asn1.fromDer(bin);
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
  } catch (e) {
    throw new Error(`No se pudo abrir el .p12 (password incorrecto o archivo invalido): ${e.message}`);
  }

  // 4. Extraer cert y private key
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const cert = certBags[forge.pki.oids.certBag]?.[0]?.cert;
  if (!cert) throw new Error("El .p12 no contiene certificado X.509");

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const privateKey = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key
    ?? p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0]?.key;
  if (!privateKey) throw new Error("El .p12 no contiene la clave privada");

  // 5. Metadata legible
  const getField = (name, attrs) => attrs.getField(name)?.value || null;
  const metadata = {
    subject_cn:  getField("CN", cert.subject),
    subject_o:   getField("O",  cert.subject),
    subject_c:   getField("C",  cert.subject),
    issuer_cn:   getField("CN", cert.issuer),
    issuer_o:    getField("O",  cert.issuer),
    valid_from:  cert.validity.notBefore.toISOString(),
    valid_to:    cert.validity.notAfter.toISOString(),
    serial:      cert.serialNumber,
    self_signed: cert.subject.hash === cert.issuer.hash,
  };

  return { cert, privateKey, metadata };
}

// ============================================================
// ADAPTER: ALEGRA
// ============================================================
// Estado: ✅ producción. Funciona con la API REST de Alegra.
// Config esperada:
//   { user: string, token: string }

async function alegraFetch(path, method, user, token, payload) {
  const basic = btoa(`${user}:${token}`);
  const resp = await fetch(`https://api.alegra.com/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Alegra ${resp.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function alegraTestConnection(config) {
  const result = await alegraFetch("/companies", "GET", config.user, config.token);
  return { ok: true, company: result.name || result.id };
}

async function alegraGetOrCreateContact(supabase, config, cliente) {
  // Si ya tiene fiscal_contact_id, retornarlo
  if (cliente.fiscal_contact_id) return cliente.fiscal_contact_id;

  const payload = {
    name: [{ firstName: cliente.nombre }],
    identification: cliente.rnc || undefined,
    phonePrimary: cliente.telefono || undefined,
    email: cliente.email || undefined,
    address: { address: cliente.direccion || undefined },
    type: ["client"],
  };

  const resp = await alegraFetch("/contacts", "POST", config.user, config.token, payload);
  const contactId = String(resp.id);

  // Guardar fiscal_contact_id en clientes
  await supabase
    .from("clientes")
    .update({ fiscal_contact_id: contactId, updated_at: new Date().toISOString() })
    .eq("id", cliente.id);

  return contactId;
}

async function alegraEmitirFactura(supabase, config, factura, detalles, cliente) {
  // 1. Obtener/crear contacto
  let contactId = null;
  if (cliente && cliente.id !== "00000000-0000-0000-0000-000000000000") {
    contactId = await alegraGetOrCreateContact(supabase, config, cliente);
  }

  // 2. Preparar líneas
  const items = detalles.map((d) => ({
    name: d.descripcion || "Producto",
    quantity: d.cantidad,
    price: d.precio,
    discount: d.descuento_monto || 0,
    tax: [{ percentage: (d.itbis_pct || 0.18) * 100 }],
  }));

  // 3. Crear factura
  const invoicePayload = {
    date: new Date(factura.fecha).toISOString().split("T")[0],
    dueDate: factura.forma_pago === "CREDITO"
      ? new Date(new Date(factura.fecha).getTime() + (factura.dias_credito || 30) * 86400000).toISOString().split("T")[0]
      : new Date(factura.fecha).toISOString().split("T")[0],
    client: contactId ? { id: contactId } : undefined,
    items,
    paymentMethod: factura.forma_pago === "CONTADO" ? "cash" : "credit",
    observations: factura.notas || "",
  };

  const resp = await alegraFetch("/invoices", "POST", config.user, config.token, invoicePayload);

  return {
    proveedor_invoice_id: String(resp.id || ""),
    proveedor_number: resp.numberTemplate?.fullNumber || resp.number || null,
    ncf: resp.stamp?.trackId || null,
    response_payload: resp,
    request_payload: invoicePayload,
  };
}

// ============================================================
// ADAPTER: DGII DIRECTO
// ============================================================
// Estado: 🚧 stub — pendiente Fase 3 del proyecto de integración nativa
// con DGII (ver feat/dgii-directo).
//
// Config esperada (cuando se implemente):
//   {
//     rnc_emisor:                 string,
//     nombre_emisor:              string,
//     ambiente:                  'TesteCF' | 'CerteCF' | 'Produccion',
//     certificado_storage_path:   string,   // path en Supabase Storage al .p12 cifrado
//     certificado_password_enc:   string,   // password del .p12 cifrado con AES-256-GCM
//     callback_url:               string,   // endpoint publico para ARECF/AECF
//   }
//
// Pasos pendientes de implementacion:
//   - Cargar .p12 desde storage + descifrar password.
//   - Generar XML por tipo de e-CF (31, 32, 33, 34, 41, 43, 44, 45, 46, 47).
//   - Firma XAdES-BES con el certificado.
//   - POST a endpoint de DGII (Recepcion / Anulacion / Consulta).
//   - Recibir TrackId, persistir, polling de estado.
//   - Almacenar XML firmado en Storage por 10 anos.

// testConnection: valida que el .p12 se pueda abrir con la password
// y que los campos del config esten completos. NO contacta DGII (eso
// requiere que ya este declarado el callback URL en OFV).
async function dgiiDirectoTestConnection(config) {
  if (!config?.rnc_emisor) throw new Error("rnc_emisor no configurado");
  if (!config?.nombre_emisor) throw new Error("nombre_emisor no configurado");
  if (!config?.certificado_storage_path) throw new Error("Sube tu .p12 primero");
  if (!config?.certificado_password_enc) throw new Error("Falta password cifrado");
  // No podemos llamar loadAndParseP12 aqui sin supabase client — lo hace
  // la accion dgii_validate_certificate. testConnection solo valida campos.
  return {
    ok: true,
    rnc: config.rnc_emisor,
    ambiente: config.ambiente || "TesteCF",
    note: "Use 'Validar' para parsear el .p12 y 'Enviar a DGII' para una prueba real.",
  };
}

// emitirFactura: flujo completo end-to-end para DGII directo.
// 1. Genera e-NCF (correlativo del tenant)
// 2. Construye XML segun tipo (31 B2B / 32 B2C, segun cliente)
// 3. Carga .p12 y firma con XAdES-BES
// 4. Sube XML firmado al bucket ecf-xmls (retencion 10 anos)
// 5. Autentica con DGII (semilla -> firma -> token JWT)
// 6. POST RecepcionECF -> recibe TrackId
// 7. Retorna en el formato del contrato EmisorAdapter
async function dgiiDirectoEmitirFactura(supabase, config, factura, detalles, cliente, opts = {}) {
  // opts (10/10/2026, cola de reintento):
  //   encfPrevio / xmlPathPrevio: el e-NCF (y el XML firmado) que ya tomó un
  //     intento fallido de ESTA factura. Se reusan: otro número dejaría un
  //     hueco en la secuencia, y el mismo XML conserva código de seguridad/QR.
  //   alAsignar(info): avisa en cuanto hay e-NCF (y luego XML) para guardarlo
  //     antes de hablar con la DGII.
  // 1. Determinar tipo y generar eNCF correlativo
  let tipoEcf = tipoEcfDeCliente(cliente);  // mismo criterio que el builder
  const ambiente = config.ambiente || "TesteCF";
  const esReintento = !!opts.encfPrevio;

  // Correlativo atómico de ESTA empresa. (10/10/2026) get_next_encf la sacaba
  // del usuario de la sesión, que aquí no existe (service key): "Sin tenant en
  // sesion" en todos los intentos. sql/dgii_encf_por_empresa.sql
  let encf = opts.encfPrevio || null;
  if (encf) {
    tipoEcf = String(encf).slice(1, 3); // el número manda: mismo tipo del primer intento
  } else {
    // (14/10/2026) La DGII rechaza el E32 de RD$250,000 o más sin comprador
    // identificado (código 1381, "RNCComprador ... es obligatorio") y el número
    // queda gastado: D Mario FT-6, E320000000002, RD$514,999. Se frena ANTES
    // de tomar el número.
    if (tipoEcf === "32" && Number(factura.total || 0) >= 250000 && !compradorIdentificado(cliente?.rnc)) {
      throw new Error(
        "Factura de consumo de RD$250,000 o más: la DGII exige la cédula, el RNC o el pasaporte del cliente. " +
        "Asígnale a la venta un cliente con su documento y vuelve a emitir. No se gastó ningún número.",
      );
    }
    const { data: nuevo, error: encfErr } = await supabase.rpc("get_next_encf_empresa", {
      p_tenant: factura.tenant_id,
      p_tipo_ecf: tipoEcf,
      p_ambiente: ambiente,
    });
    if (encfErr || !nuevo) {
      throw new Error(
        `No se pudo asignar e-NCF (${tipoEcf}/${ambiente}): ${encfErr?.message || "secuencia agotada o no configurada en ecf_secuencias"}`
      );
    }
    encf = nuevo;
    await opts.alAsignar?.({ encf });
  }

  // 2-3. Cargar .p12; XML: el MISMO del intento anterior si quedó guardado
  const { cert, privateKey } = await loadAndParseP12(supabase, config);
  let xmlFirmado = null, digestValue = "", signatureValue = "", xmlPath = null;
  if (opts.xmlPathPrevio) {
    const { data: blob } = await supabase.storage.from("ecf-xmls").download(opts.xmlPathPrevio);
    if (blob) {
      xmlFirmado = await blob.text();
      xmlPath = opts.xmlPathPrevio;
      signatureValue = (xmlFirmado.match(/<SignatureValue>([^<]+)</) || [])[1] || "";
      digestValue = (xmlFirmado.match(/<DigestValue>([^<]+)</) || [])[1] || "";
    }
  }
  if (!xmlFirmado) {
    const input = facturaToEcfInput(factura, detalles, cliente, config, encf);
    const xmlSinFirmar = buildEcfXml(input.tipo_ecf, input);
    const firmado = await signEcfXml(xmlSinFirmar, cert, privateKey);
    xmlFirmado = firmado.xmlFirmado; digestValue = firmado.digestValue; signatureValue = firmado.signatureValue;
    // 4. Guardar XML firmado en Storage privado
    xmlPath = await uploadSignedXml(supabase, factura.tenant_id, encf, xmlFirmado);
    await opts.alAsignar?.({ encf, xml_path: xmlPath });
  }

  // (10/10/2026) Lo que el recibo necesita para la representación impresa:
  // QR (consultatimbre), código de seguridad y fecha de firma. Se guarda en
  // documentos_fiscales.request_payload.impresion para reimprimir igual.
  const delXml = (tag) => (xmlFirmado.match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) || [])[1] || null;
  const impresion = {
    encf,
    tipo_ecf: tipoEcf,
    ambiente,
    codigo_seguridad: String(signatureValue || "").slice(0, 6),
    fecha_firma: delXml("FechaHoraFirma"),
    fecha_emision: delXml("FechaEmision"),
    fecha_vencimiento: delXml("FechaVencimientoSecuencia"),
    monto_total: delXml("MontoTotal"),
    rnc_emisor: delXml("RNCEmisor"),
    rnc_comprador: delXml("RNCComprador"),
  };

  // 5. Autenticar con DGII
  const auth = await authenticate(cert, privateKey, ambiente);
  const rncArchivo = String(config.rnc_emisor || "").replace(/\D/g, "");
  const fileName = `${rncArchivo}${encf}.xml`;

  // 6a. (10/10/2026) Consumo < RD$250,000: NO va a la recepción normal. Va su
  //     RESUMEN (RFCE) al canal de resúmenes, con el mismo código de seguridad
  //     que imprime el QR. El e-CF completo ya quedó firmado y guardado (paso 4).
  //     Mismo camino que la DGII aceptó en la certificación (Paso 2 y 4).
  const montoTotal = Number((xmlFirmado.match(/<MontoTotal>([^<]+)<\/MontoTotal>/) || [])[1] || 0);
  if (tipoEcf === "32" && montoTotal < 250000) {
    const codigoSeguridad = String(signatureValue || "").slice(0, 6);
    const rfce = buildRfceDesdeEcf(xmlFirmado, codigoSeguridad);
    const { xmlFirmado: rfceFirmado } = await signEcfXml(rfce, cert, privateKey);
    const respuesta = await enviarRfce(rfceFirmado, auth.token, ambiente, fileName);
    const estadoRfce = String(respuesta?.estado || respuesta?.Estado || "").toLowerCase();
    if (estadoRfce.includes("rechaz")) {
      throw new Error(`DGII rechazó el resumen (RFCE) de ${encf}: ${JSON.stringify(respuesta?.mensajes || respuesta).slice(0, 400)}`);
    }
    return {
      proveedor_invoice_id: `RFCE-${encf}`,
      proveedor_number: encf,
      ncf: encf,
      request_payload: {
        tipo_ecf: tipoEcf,
        ambiente,
        via: "rfce",
        impresion,
        xml_path: xmlPath,
        codigo_seguridad: codigoSeguridad,
        digest_value: digestValue,
        signature_value: signatureValue.slice(0, 100) + "...",
      },
      response_payload: respuesta,
    };
  }

  // 6b. Enviar e-CF. En un reintento, primero se pregunta si la DGII ya lo
  //     tiene (el intento anterior pudo llegar y caerse después): reenviarlo
  //     sería un duplicado.
  let recepcion = null;
  if (esReintento) {
    try {
      const t = await consultarTrackIds(config.rnc_emisor, encf, auth.token, ambiente);
      const arr = Array.isArray(t) ? t : (t?.trackIds || t?.TrackIds || []);
      const ult = arr[arr.length - 1];
      const tid = ult?.trackId || ult?.TrackId;
      if (tid) recepcion = { trackId: tid, ya_recibido: true, consulta: ult };
    } catch (_) { /* si la consulta falla, se envía normal */ }
  }
  if (!recepcion) recepcion = await enviarEcf(xmlFirmado, auth.token, ambiente, fileName);
  const trackId = recepcion.trackId || recepcion.TrackId || recepcion.trackid;
  if (!trackId) {
    throw new Error(
      `DGII no devolvio TrackId. Respuesta: ${JSON.stringify(recepcion).slice(0, 300)}`
    );
  }

  // 7. Retornar en formato EmisorAdapter (lo persiste el handler en
  //    documentos_fiscales con la columna ncf=encf y track_id=trackId)
  return {
    proveedor_invoice_id: trackId,
    proveedor_number: encf,
    ncf: encf,
    request_payload: {
      tipo_ecf: tipoEcf,
      ambiente,
      impresion,
      xml_path: xmlPath,
      digest_value: digestValue,
      signature_value: signatureValue.slice(0, 100) + "...",
    },
    response_payload: recepcion,
  };
}

// ============================================================
// (10/10/2026) Emitir una factura: la usa la venta (acción emitir_factura) y
// la cola de reintento (dgii_reintentar_pendientes). Devuelve el resultado o
// lanza.
// ============================================================
async function emitirFacturaFiscal(supabase, tenantId, factura_id, callerUserId) {

  // 1. Cargar integración del tenant
  const { data: integ, error: integError } = await supabase
    .from("integraciones_fiscales")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("activo", true)
    .single();

  if (integError || !integ) {
    throw new Error("No hay integración fiscal activa para esta empresa");
  }

  const adaptador = ADAPTADORES[integ.proveedor];
  if (!adaptador) throw new Error(`Proveedor '${integ.proveedor}' no soportado`);

  // 2. Cargar factura
  const { data: factura, error: facturaError } = await supabase
    .from("facturas")
    .select("*")
    .eq("id", factura_id)
    .eq("tenant_id", tenantId)
    .single();

  if (facturaError || !factura) throw new Error("Factura no encontrada");

  // 3. Verificar que no esté ya emitida
  const { data: existingDoc } = await supabase
    .from("documentos_fiscales")
    .select("id, estado")
    .eq("factura_id", factura_id)
    .eq("estado", "emitido")
    .maybeSingle();

  if (existingDoc) {
    throw new Error("Esta factura ya tiene un documento fiscal emitido");
  }

  // 4. Cargar detalles
  const { data: detalles } = await supabase
    .from("facturas_detalle")
    .select("*")
    .eq("factura_id", factura_id);

  if (!detalles?.length) throw new Error("Factura sin detalle");

  // 5. Cargar cliente
  let cliente = null;
  if (factura.cliente_id) {
    const { data: clienteData } = await supabase
      .from("clientes")
      .select("*")
      .eq("id", factura.cliente_id)
      .single();
    cliente = clienteData;
  }
  cliente = await compradorReal(supabase, factura, cliente);

  // 6. Registro. (10/10/2026) Si un intento anterior de ESTA factura falló,
  //    se reusa su fila: guarda el e-NCF (y el XML) que ya tomó.
  const { data: previo } = await supabase
    .from("documentos_fiscales")
    .select("id, estado, retry_count, request_payload, updated_at")
    .eq("factura_id", factura.id)
    .in("estado", ["error", "procesando"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previo?.estado === "procesando" && Date.now() - new Date(previo.updated_at).getTime() < 3 * 60 * 1000) {
    throw new Error("Esta factura ya se está emitiendo en este momento; espera un minuto.");
  }
  let docFiscal;
  if (previo) {
    const { data: reusado, error: reErr } = await supabase
      .from("documentos_fiscales")
      .update({
        estado: "procesando", error_message: null,
        retry_count: (previo.retry_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", previo.id)
      .select()
      .single();
    if (reErr || !reusado) throw new Error(`Error retomando el documento fiscal: ${reErr?.message || "sin fila"}`);
    docFiscal = reusado;
  } else {
    // Fase 3.3: guardar emitido_por para trazabilidad (art. 38 NES DGII).
    const { data: nuevo, error: docError } = await supabase
      .from("documentos_fiscales")
      .insert({
        tenant_id: tenantId,
        factura_id: factura.id,
        proveedor: integ.proveedor,
        tipo_documento: "factura",
        estado: "procesando",
        emitido_por: callerUserId,
      })
      .select()
      .single();
    if (docError) throw new Error(`Error creando documento fiscal: ${docError.message}`);
    docFiscal = nuevo;
  }
  const asignadoAntes = docFiscal.request_payload?.encf_asignado || null;
  const xmlAntes = docFiscal.request_payload?.xml_path_asignado || null;
  // Guarda el e-NCF/XML en cuanto existen, ANTES de hablar con la DGII.
  const alAsignar = async (info) => {
    const rp = { ...(docFiscal.request_payload || {}), encf_asignado: info.encf };
    if (info.xml_path) rp.xml_path_asignado = info.xml_path;
    docFiscal.request_payload = rp;
    const { error: e } = await supabase.from("documentos_fiscales")
      .update({ request_payload: rp, updated_at: new Date().toISOString() })
      .eq("id", docFiscal.id);
    if (e) console.error("guardar e-NCF asignado:", e.message);
  };

  // 7. Emitir via adaptador
  try {
    const configEmisor = await resolveEmisorConfig(supabase, tenantId, integ.config);
    const resultado = await adaptador.emitirFactura(
      supabase, configEmisor, factura, detalles, cliente,
      { encfPrevio: asignadoAntes, xmlPathPrevio: xmlAntes, alAsignar },
    );

    // 8. Actualizar como emitido
    // Para DGII directo, persistir tambien tipo_ecf, track_id, xml_path, ambiente
    const updatePayload = {
      estado: "emitido",
      proveedor_invoice_id: resultado.proveedor_invoice_id,
      proveedor_number: resultado.proveedor_number,
      ncf: resultado.ncf,
      request_payload: resultado.request_payload,
      response_payload: resultado.response_payload,
      emitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (integ.proveedor === "dgii_directo") {
      updatePayload.track_id = resultado.proveedor_invoice_id;  // mismo valor
      updatePayload.encf = resultado.ncf;
      updatePayload.tipo_ecf = resultado.request_payload?.tipo_ecf || null;
      updatePayload.ambiente = resultado.request_payload?.ambiente || null;
      updatePayload.xml_firmado_path = resultado.request_payload?.xml_path || null;
      // El RFCE contesta en el acto (Aceptado / Aceptado Condicional);
      // el e-CF normal queda "enviado" hasta consultar su TrackId.
      // (10/10/2026) La DGII contesta "Aceptado" / "Aceptado Condicional" y el
      // CHECK de la columna solo admite aceptado | aceptado_condicional | ...:
      // sin normalizar, el update fallaba callado y la fila se quedaba
      // en "procesando" sin e-NCF (primera venta real de D Mario).
      const estadoInmediato = (() => {
        if (resultado.request_payload?.via !== "rfce") return "";
        const e = String(resultado.response_payload?.estado || resultado.response_payload?.Estado || "").toLowerCase();
        if (e.includes("condicional")) return "aceptado_condicional";
        if (e.includes("aceptado")) return "aceptado";
        if (e.includes("rechaz")) return "rechazado";
        return "";
      })();
      updatePayload.estado_dgii = estadoInmediato || "enviado";
    }
    const { error: updErr } = await supabase
      .from("documentos_fiscales")
      .update(updatePayload)
      .eq("id", docFiscal.id);
    if (updErr) {
      // El comprobante YA salió a la DGII: no se puede perder el e-NCF.
      console.error("documentos_fiscales update:", updErr.message);
      // Respaldo SIN las columnas con índice único (encf, track_id): fue un
      // índice único el que tumbó el update del E310000000001 de D Mario.
      // ncf y request_payload.impresion bastan para reimprimir y rastrear.
      const { error: updErr2 } = await supabase.from("documentos_fiscales").update({
        estado: "emitido", ncf: resultado.ncf,
        tipo_ecf: updatePayload.tipo_ecf ?? null, ambiente: updatePayload.ambiente ?? null,
        request_payload: resultado.request_payload, response_payload: resultado.response_payload,
        error_message: `update parcial: ${updErr.message}`.slice(0, 500),
        emitted_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", docFiscal.id);
      if (updErr2) console.error("documentos_fiscales update de respaldo:", updErr2.message);
    }

    if (resultado.ncf) {
      await supabase
        .from("facturas")
        .update({ ncf: resultado.ncf })
        .eq("id", factura.id);
    }

    return {
      ok: true,
      factura_id: factura.id,
      proveedor_invoice_id: resultado.proveedor_invoice_id,
      proveedor_number: resultado.proveedor_number,
      ncf: resultado.ncf,
      impresion: resultado.request_payload?.impresion || null,
    };

  } catch (emitError) {
    // Marcar como error
    await supabase
      .from("documentos_fiscales")
      .update({
        estado: "error",
        error_message: emitError.message,
        retry_count: (docFiscal.retry_count || 0) + (previo ? 0 : 1),
        updated_at: new Date().toISOString(),
      })
      .eq("id", docFiscal.id);

    throw emitError;
  }
}

// ============================================================
// REGISTRO DE PROVEEDORES
// ============================================================
const ADAPTADORES = {
  alegra: {
    testConnection: alegraTestConnection,
    emitirFactura: alegraEmitirFactura,
  },
  dgii_directo: {
    testConnection: dgiiDirectoTestConnection,
    emitirFactura: dgiiDirectoEmitirFactura,
  },
  // Agregar aqui futuros adapters: alanube, dgmax, voxel, etc.
};

// ============================================================
// HANDLER PRINCIPAL
// ============================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verificar autenticacion. Hay dos modos:
    //   1) Usuario normal con JWT — el tenant viene del profile.
    //   2) Cron / service-role con service_role key — el tenant
    //      viene de body.service_tenant_id o del header X-Tenant-Id.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No autorizado");
    const token = authHeader.replace("Bearer ", "");

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isServiceRole = !!serviceKey && token === serviceKey;

    // ── ACTION: dgii_revisar_pendientes ── (tarea programada, todas las empresas)
    // La clave x-cron-secret (secreto CRON_SECRET_FISCAL) SOLO abre esta acción.
    if (action === "dgii_revisar_pendientes" || action === "dgii_reintentar_pendientes" || action === "dgii_salud") {
      const cronSecret = Deno.env.get("CRON_SECRET_FISCAL") ?? "";
      const esCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
      if (!esCron && !isServiceRole) throw new Error("No autorizado");
      const resumen = action === "dgii_revisar_pendientes"
        ? await revisarPendientesDgii(supabase)
        : action === "dgii_salud"
          ? await saludDgii(supabase)
          : await reintentarPendientesDgii(supabase);
      return new Response(JSON.stringify({ ok: true, ...resumen }), { status: 200, headers: corsHeaders });
    }

    let tenantId;
    // Fase 3.3: ID del caller para trazabilidad (emitido_por).
    // En modo service_role queda NULL (cron / system).
    let callerUserId: string | null = null;
    if (isServiceRole) {
      // Modo cron/system: confiar en body.service_tenant_id o header X-Tenant-Id
      tenantId = body.service_tenant_id || req.headers.get("X-Tenant-Id");
      if (!tenantId) {
        throw new Error("service_tenant_id requerido cuando se usa service_role");
      }
    } else {
      // Modo usuario normal: validar JWT y leer profile
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) throw new Error("Token inválido");
      callerUserId = user.id;

      // (10/10/2026) La EMPRESA ACTIVA, no profiles.tenant_id. El dueño trabaja
      // varias empresas y su perfil no tiene una fija: con profiles.tenant_id
      // la primera factura real de D Mario ni se intentó ("Usuario sin
      // tenant"). get_user_tenant() con la sesión del usuario resuelve la
      // empresa activa y comprueba que tenga acceso a ella.
      const comoUsuario = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } },
      );
      const { data: tenantActivo } = await comoUsuario.rpc("get_user_tenant");
      if (!tenantActivo) throw new Error("Usuario sin empresa activa");
      tenantId = tenantActivo;
    }

    // ── ACTION: test_connection ──
    if (action === "test_connection") {
      const { proveedor, config } = body;
      const adaptador = ADAPTADORES[proveedor];
      if (!adaptador) throw new Error(`Proveedor '${proveedor}' no soportado`);

      const result = await adaptador.testConnection(config);
      return new Response(JSON.stringify({ ok: true, ...result }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    // ── ACTION: emitir_factura ──
    if (action === "emitir_factura") {
      const { factura_id } = body;
      if (!factura_id) throw new Error("factura_id es requerido");
      const r = await emitirFacturaFiscal(supabase, tenantId, factura_id, callerUserId);
      return new Response(JSON.stringify(r), { status: 200, headers: corsHeaders });
    }

    // ── ACTION: dgii_save_certificate_meta ──
    // Llamada por el frontend DESPUES de subir el .p12 al Storage privado
    // (path: <tenant_id>/certificado.p12). Recibe el password en plaintext,
    // lo cifra con la master key y lo guarda en integraciones_fiscales.config.
    if (action === "dgii_save_certificate_meta") {
      const {
        rnc_emisor, nombre_emisor, ambiente, callback_url,
        fecha_vencimiento_secuencia, certificado_password, storage_path,
        municipio, provincia, nombre_comercial,
      } = body;

      if (!certificado_password) throw new Error("certificado_password es requerido");
      if (!storage_path) throw new Error("storage_path es requerido");

      // Cifrar password
      const { iv, ciphertext } = await encryptPassword(certificado_password);

      const config = {
        rnc_emisor: rnc_emisor || null,
        nombre_emisor: nombre_emisor || null,
        nombre_comercial: nombre_comercial || null,
        municipio: municipio || null,
        provincia: provincia || null,
        ambiente: ambiente || "TesteCF",
        callback_url: callback_url || null,
        fecha_vencimiento_secuencia: normalizeDgiiDate(fecha_vencimiento_secuencia),
        certificado_storage_path: storage_path,
        certificado_password_enc: ciphertext,
        certificado_password_iv: iv,
      };

      // Upsert en integraciones_fiscales (una fila por tenant + proveedor)
      const { data: existente } = await supabase
        .from("integraciones_fiscales")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();

      if (existente) {
        const { error: updErr } = await supabase
          .from("integraciones_fiscales")
          .update({ config, activo: true, updated_at: new Date().toISOString() })
          .eq("id", existente.id);
        if (updErr) throw new Error(`Error guardando config: ${updErr.message}`);
      } else {
        const { error: insErr } = await supabase
          .from("integraciones_fiscales")
          .insert({
            tenant_id: tenantId,
            proveedor: "dgii_directo",
            config,
            activo: true,
          });
        if (insErr) throw new Error(`Error creando integracion: ${insErr.message}`);
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: corsHeaders,
      });
    }

    // ── ACTION: dgii_test_xml_generation ──
    // DEV/QA: dado un factura_id existente, genera el XML del e-CF
    // que se enviaria a DGII (sin firmar, sin enviar). Util para
    // inspeccionar visualmente que el XML tiene la forma correcta
    // antes de avanzar con firma y envio.
    if (action === "dgii_update_config_meta") {
      const {
        rnc_emisor, nombre_emisor, ambiente, callback_url, fecha_vencimiento_secuencia,
        municipio, provincia, nombre_comercial,
      } = body;
      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("id, config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.id) throw new Error("No hay configuracion DGII directo para este tenant");

      const config = {
        ...(integ.config || {}),
        rnc_emisor: rnc_emisor || integ.config?.rnc_emisor || null,
        nombre_emisor: nombre_emisor || integ.config?.nombre_emisor || null,
        nombre_comercial: nombre_comercial || integ.config?.nombre_comercial || null,
        municipio: municipio || integ.config?.municipio || null,
        provincia: provincia || integ.config?.provincia || null,
        ambiente: ambiente || integ.config?.ambiente || "TesteCF",
        callback_url: callback_url || null,
        fecha_vencimiento_secuencia: normalizeDgiiDate(fecha_vencimiento_secuencia),
      };

      const { error: updErr } = await supabase
        .from("integraciones_fiscales")
        .update({ config, activo: true, updated_at: new Date().toISOString() })
        .eq("id", integ.id);
      if (updErr) throw new Error(`Error guardando config: ${updErr.message}`);

      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: corsHeaders,
      });
    }

    if (action === "dgii_test_xml_generation") {
      const { factura_id, encf_override } = body;
      if (!factura_id) throw new Error("factura_id requerido");

      // Cargar config del emisor
      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("No hay config DGII directo para este tenant");

      // Cargar factura + detalles + cliente
      const { data: factura, error: fErr } = await supabase
        .from("facturas")
        .select("*")
        .eq("id", factura_id)
        .eq("tenant_id", tenantId)
        .single();
      if (fErr || !factura) throw new Error("Factura no encontrada");

      const { data: detalles } = await supabase
        .from("facturas_detalle")
        .select("*")
        .eq("factura_id", factura_id);
      if (!detalles?.length) throw new Error("Factura sin detalle");

      let cliente = null;
      if (factura.cliente_id) {
        const { data: c } = await supabase
          .from("clientes")
          .select("*")
          .eq("id", factura.cliente_id)
          .maybeSingle();
        cliente = c;
      }
      cliente = await compradorReal(supabase, factura, cliente);

      // Determinar tipo_ecf basado en si el cliente tiene RNC (B2B=31, B2C=32)
      const detectedTipo = tipoEcfDeCliente(cliente);  // mismo criterio que el builder
      // Generar e-NCF de prueba que coincida con el tipo detectado
      const encf = encf_override || `E${detectedTipo}0000000001`;

      let xml, input;
      try {
        const configEmisor = await resolveEmisorConfig(supabase, tenantId, integ.config);
        input = facturaToEcfInput(factura, detalles, cliente, configEmisor, encf);
        xml = buildEcfXml(input.tipo_ecf, input);
      } catch (xmlErr) {
        // Error con contexto: que datos teniamos
        throw new Error(
          `Generando XML: ${xmlErr.message} | factura.numero=${factura.numero} cliente_id=${factura.cliente_id || 'null'} detalles=${detalles?.length || 0} config_keys=${Object.keys(integ.config || {}).join(',')}`
        );
      }

      return new Response(JSON.stringify({
        ok: true,
        encf,
        tipo_ecf: input.tipo_ecf,
        xml,
        input,  // util para debugging
      }), { status: 200, headers: corsHeaders });
    }

    // ── ACTION: dgii_test_xml_sign ──
    // DEV/QA: toma una factura, genera el XML del e-CF, lo FIRMA
    // con el .p12 cargado y devuelve el XML firmado para inspeccion.
    // Sin enviar a DGII todavia. Util para validar el chunk 3d.
    if (action === "dgii_test_xml_sign") {
      const { factura_id, encf_override } = body;
      if (!factura_id) throw new Error("factura_id requerido");

      // 1. Cargar config del emisor
      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("No hay config DGII directo para este tenant");

      // 2. Cargar factura + detalles + cliente
      const { data: factura, error: fErr } = await supabase
        .from("facturas")
        .select("*")
        .eq("id", factura_id)
        .eq("tenant_id", tenantId)
        .single();
      if (fErr || !factura) throw new Error("Factura no encontrada");

      const { data: detalles } = await supabase
        .from("facturas_detalle")
        .select("*")
        .eq("factura_id", factura_id);
      if (!detalles?.length) throw new Error("Factura sin detalle");

      let cliente = null;
      if (factura.cliente_id) {
        const { data: c } = await supabase
          .from("clientes")
          .select("*")
          .eq("id", factura.cliente_id)
          .maybeSingle();
        cliente = c;
      }
      cliente = await compradorReal(supabase, factura, cliente);

      // 3. Generar XML
      const tipoEcf = tipoEcfDeCliente(cliente);  // mismo criterio que el builder
      const encf = encf_override || `E${tipoEcf}0000000001`;

      let xml, input;
      try {
        const configEmisor = await resolveEmisorConfig(supabase, tenantId, integ.config);
        input = facturaToEcfInput(factura, detalles, cliente, configEmisor, encf);
        xml = buildEcfXml(input.tipo_ecf, input);
      } catch (xmlErr) {
        throw new Error(
          `Generando XML: ${xmlErr.message} | factura.numero=${factura.numero} cliente_id=${factura.cliente_id || 'null'} detalles=${detalles?.length || 0}`
        );
      }

      // 4. Cargar el .p12 + descifrar password + parsear (cert + privateKey)
      const { cert, privateKey, metadata } = await loadAndParseP12(supabase, integ.config);

      // 5. Firmar el XML
      let firmado;
      try {
        firmado = await signEcfXml(xml, cert, privateKey);
      } catch (signErr) {
        throw new Error(`Firmando XML: ${signErr.message}`);
      }

      return new Response(JSON.stringify({
        ok: true,
        encf,
        tipo_ecf: input.tipo_ecf,
        xml_sin_firmar: xml,
        xml_firmado: firmado.xmlFirmado,
        digest_value: firmado.digestValue,
        signature_value_preview: firmado.signatureValue.slice(0, 80) + "...",
        cert_metadata: metadata,
      }), { status: 200, headers: corsHeaders });
    }

    // ── ACTION: dgii_test_nota_xml ──
    // DEV/QA: simula una nota (33 o 34) sobre una factura existente.
    // El usuario pasa: factura_id_original, tipo ('33' o '34'),
    // codigo_modificacion (1-6), razon (opcional), e items del ajuste
    // (si no se pasan, asume 100% devolucion = todos los items originales).
    if (action === "dgii_test_nota_xml") {
      const {
        factura_id_original,
        tipo: tipoSolicitado,
        codigo_modificacion,
        razon_modificacion,
        items_ajuste,
        encf_override,
      } = body;
      if (!factura_id_original) throw new Error("factura_id_original requerido");

      const tipo = (tipoSolicitado === "33" || tipoSolicitado === "debito") ? "33" : "34";

      // 1. Cargar config del emisor
      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("No hay config DGII directo");

      // 2. Cargar factura original (que se modifica)
      const { data: facturaOrig } = await supabase
        .from("facturas")
        .select("*")
        .eq("id", factura_id_original)
        .eq("tenant_id", tenantId)
        .single();
      if (!facturaOrig) throw new Error("Factura original no encontrada");

      // 3. Necesitamos su e-NCF. Si la factura ya fue emitida via DGII directo,
      //    tendra documentos_fiscales con encf. Si no, el ncf de la factura.
      let encfOriginal = facturaOrig.ncf;
      if (!encfOriginal || !encfOriginal.match(/^E\d{12}$/)) {
        // buscar en documentos_fiscales
        const { data: docOrig } = await supabase
          .from("documentos_fiscales")
          .select("encf")
          .eq("factura_id", factura_id_original)
          .eq("tenant_id", tenantId)
          .not("encf", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        encfOriginal = docOrig?.encf;
      }
      if (!encfOriginal || !encfOriginal.match(/^E\d{12}$/)) {
        // Fallback: usar un encf placeholder de prueba (E31...)
        encfOriginal = "E310000000001";
      }

      // 4. Items del ajuste — si no se pasan, usamos todos los detalles
      //    de la factura original (devolucion total)
      let itemsNota = items_ajuste;
      if (!Array.isArray(itemsNota) || itemsNota.length === 0) {
        const { data: detalles } = await supabase
          .from("facturas_detalle")
          .select("*")
          .eq("factura_id", factura_id_original);
        itemsNota = (detalles || []).map(d => ({
          descripcion: d.descripcion,
          cantidad: d.cantidad,
          precio: d.precio,
          descuento: d.descuento,
          itbis_pct: d.itbis_pct,
          importe: d.importe,
        }));
      }

      // 5. Cargar cliente (si la factura era B2B)
      let cliente = null;
      if (facturaOrig.cliente_id) {
        const { data: c } = await supabase
          .from("clientes")
          .select("*")
          .eq("id", facturaOrig.cliente_id)
          .maybeSingle();
        cliente = c;
      }
      cliente = await compradorReal(supabase, facturaOrig, cliente);

      // 6. e-NCF de la nota (placeholder para test)
      const encf = encf_override || `E${tipo}0000000001`;

      // 7. Generar input + XML
      let xml, input;
      try {
        const configEmisor = await resolveEmisorConfig(supabase, tenantId, integ.config);
        input = notaToEcfInput(
          { fecha: new Date().toISOString(), items: itemsNota, tipo: tipo === "33" ? "debito" : "credito" },
          { ncf: encfOriginal, fecha: facturaOrig.fecha, numero: facturaOrig.numero, cliente_id: facturaOrig.cliente_id },
          cliente,
          configEmisor,
          encf,
          { codigo_modificacion: codigo_modificacion || "3", razon_modificacion: razon_modificacion || null }
        );
        xml = buildEcfXml(input.tipo_ecf, input);
      } catch (xmlErr) {
        throw new Error(
          `Generando XML Tipo ${tipo}: ${xmlErr.message} | factura_orig=${facturaOrig.numero} encf_orig=${encfOriginal} items=${itemsNota.length}`
        );
      }

      return new Response(JSON.stringify({
        ok: true,
        encf,
        tipo_ecf: tipo,
        encf_modificado: encfOriginal,
        codigo_modificacion: input.referencia.codigo_modificacion,
        xml,
        input,
      }), { status: 200, headers: corsHeaders });
    }

    // ── ACTION: dgii_sign_external_xml ──
    // Firma cualquier XML externo (ej. el XML de postulacion FI-GDF-016
    // que genera DGII en OFV) con el .p12 del tenant. Util para tramites
    // administrativos en OFV que requieren firma del emisor.
    if (action === "dgii_sign_external_xml") {
      const { xml } = body;
      if (!xml || typeof xml !== "string") throw new Error("xml requerido (string)");

      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("Sube tu .p12 primero en Configuracion → Integracion Fiscal");

      const { cert, privateKey } = await loadAndParseP12(supabase, integ.config);
      const { xmlFirmado, digestValue, signatureValue, _diag } = await signXmlGenerico(xml, cert, privateKey);

      return new Response(JSON.stringify({
        ok: true,
        xml_firmado: xmlFirmado,
        // DEBUG: info para diagnosticar "Firma Invalida"
        _debug: {
          xml_input_length: xml.length,
          xml_input_first100: xml.substring(0, 100),
          xml_input_has_crlf: xml.includes("\r\n"),
          xml_input_has_xmldecl: xml.startsWith("<?xml"),
          digest_value: digestValue,
          signature_value_preview: signatureValue?.slice(0, 60),
          xml_firmado_length: xmlFirmado.length,
          // bytes exactos canonicalizados (base64) para verificar offline
          canonical1_b64: _diag?.canonical1_b64,
          canonical1_len: _diag?.canonical1_len,
          canonicalSignedInfo_b64: _diag?.canonicalSignedInfo_b64,
          canonicalSignedInfo_len: _diag?.canonicalSignedInfo_len,
        },
      }), { status: 200, headers: corsHeaders });
    }

    // ── ACTION: dgii_certif_send_row ──
    // Procesa UNA fila del set de pruebas DGII (Paso 2 certificacion).
    // El frontend parsea el xlsx y manda fila por fila para mostrar
    // progreso en UI sin timeouts.
    //
    // Body: { row: <fila xlsx>, kind: 'ECF' | 'RFCE' }
    // Returns: { ok, encf, tipo_ecf, track_id, estado_dgii, xml_firmado, errors? }
    if (action === "dgii_certif_send_row") {
      const { row, kind, ecf_row } = body;
      if (!row) throw new Error("row requerido");
      const sheetKind = (kind || "ECF").toUpperCase();
      const tipoEcf = String(row.TipoeCF || "").trim();
      const encf = String(row.ENCF || "").trim();
      if (!tipoEcf || !encf) throw new Error("La fila no tiene TipoeCF/ENCF");

      // 1. Cargar config + cert
      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("Config DGII directo ausente. Sube tu .p12 primero.");
      // El set oficial del Portal de Certificacion DGII debe correr siempre
      // contra CerteCF, aunque el certificado tenga TesteCF configurado para
      // pruebas iniciales/pre-certificacion.
      const ambiente = "CerteCF";

      // 2. Para RFCE: derivar CodigoSeguridadeCF de la firma del ECF Tipo 32
      //    correspondiente (estilo dgii-ecf: primeros 6 chars del SignatureValue).
      //    NO agregamos salt — la spec DGII pide que el mismo ECF se envie
      //    despues del RFCE (Fase 4). Si el RFCE usa codigo derivado del
      //    SignatureValue del ECF original, ambos comparten el mismo codigo
      //    y DGII los matchea correctamente.
      let codigoSegRfce = null;
      let manualEcfForRfce = null;
      if (sheetKind === "RFCE") {
        if (!ecf_row) {
          return new Response(JSON.stringify({
            ok: false,
            step: "build",
            error: "Para RFCE se requiere ecf_row (fila ECF correspondiente con mismo ENCF)",
            encf, tipo_ecf: tipoEcf,
          }), { status: 200, headers: corsHeaders });
        }
        try {
          const xmlEcf = buildEcfFromTestRow(ecf_row);
          const { cert, privateKey } = await loadAndParseP12(supabase, integ.config);
          const signedEcf = await signEcfXml(xmlEcf, cert, privateKey);
          codigoSegRfce = (signedEcf.signatureValue || "").slice(0, 6);
          if (!codigoSegRfce || codigoSegRfce.length !== 6) {
            throw new Error(`No se pudo extraer codigo de seguridad valido (got: '${codigoSegRfce}')`);
          }
          const rncManual = String(ecf_row.RNCEmisor || integ.config.rnc_emisor || "").replace(/\D/g, "");
          const encfManual = String(ecf_row.ENCF || encf).trim();
          manualEcfForRfce = {
            xml_firmado: signedEcf.xmlFirmado,
            xml_firmado_length: signedEcf.xmlFirmado.length,
            signature_prefix: codigoSegRfce,
            rnc_emisor: rncManual,
            encf: encfManual,
            file_name: `${rncManual}${encfManual}.xml`,
          };
        } catch (e) {
          return new Response(JSON.stringify({
            ok: false,
            step: "derive_codigo",
            error: e.message,
            encf, tipo_ecf: tipoEcf,
          }), { status: 200, headers: corsHeaders });
        }
      }

      // 3. Generar XML segun kind (RFCE recibe codigo derivado)
      let xmlSinFirmar;
      let codigoSegDebug = null;
      try {
        if (sheetKind === "RFCE") {
          // Inyectar el codigo derivado en la row antes de buildear
          xmlSinFirmar = buildRfceFromTestRow({ ...row, CodigoSeguridadeCF: codigoSegRfce });
        } else {
          xmlSinFirmar = buildEcfFromTestRow(row);
        }
        const m = xmlSinFirmar.match(/<CodigoSeguridadeCF>([^<]+)<\/CodigoSeguridadeCF>/);
        codigoSegDebug = m?.[1] || null;
      } catch (e) {
        return new Response(JSON.stringify({
          ok: false,
          step: "build",
          error: e.message,
          encf, tipo_ecf: tipoEcf,
        }), { status: 200, headers: corsHeaders });
      }

      // 3. Firmar
      let xmlFirmado;
      try {
        const { cert, privateKey } = await loadAndParseP12(supabase, integ.config);
        const signed = await signEcfXml(xmlSinFirmar, cert, privateKey);
        xmlFirmado = signed.xmlFirmado;

        // 4. Auth + enviar
        // CRITICO: filename debe ser <RNC><eNCF>.xml (DGII rechaza otros).
        const rncEmisor = String(row.RNCEmisor || integ.config.rnc_emisor || "").replace(/\D/g, "");
        const fileName = `${rncEmisor}${encf}.xml`;
        const auth = await authenticate(cert, privateKey, ambiente);
        const recepcion = sheetKind === "RFCE"
          ? await enviarRfce(xmlFirmado, auth.token, ambiente, fileName)
          : await enviarEcf(xmlFirmado, auth.token, ambiente, fileName);

        return new Response(JSON.stringify({
          ok: true,
          encf,
          tipo_ecf: tipoEcf,
          kind: sheetKind,
          ambiente,
          track_id: recepcion.trackId || recepcion.TrackId || null,
          estado_dgii: recepcion.estado || recepcion.Estado || "enviado",
          response_payload: recepcion,
          xml_firmado_length: xmlFirmado.length,
          codigo_seguridad: codigoSegDebug,
          manual_ecf: manualEcfForRfce,
        }), { status: 200, headers: corsHeaders });
      } catch (e) {
        return new Response(JSON.stringify({
          ok: false,
          step: "send",
          error: e.message,
          encf, tipo_ecf: tipoEcf,
          xml_firmado_length: xmlFirmado?.length || 0,
          codigo_seguridad: codigoSegDebug,
        }), { status: 200, headers: corsHeaders });
      }
    }

    // ── ACTION: dgii_certif_sign_only ──
    // Genera + firma el XML de un caso (Fase 4 ECF Tipo 32 < 250K) pero NO
    // lo envia a DGII. El XML firmado se devuelve para que el frontend lo
    // descargue y el usuario lo suba MANUALMENTE en el portal DGII (cajita
    // "Facturas de consumo < 250Mil").
    if (action === "dgii_certif_sign_only") {
      const { row } = body;
      if (!row) throw new Error("row requerido");

      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("Config DGII directo ausente");

      const xmlSinFirmar = buildEcfFromTestRow(row);
      const { cert, privateKey } = await loadAndParseP12(supabase, integ.config);
      const signed = await signEcfXml(xmlSinFirmar, cert, privateKey);
      const encf = String(row.ENCF || "").trim();
      const rncEmisor = String(row.RNCEmisor || integ.config.rnc_emisor || "").replace(/\D/g, "");
      const fileName = `${rncEmisor}${encf}.xml`;

      return new Response(JSON.stringify({
        ok: true,
        xml_firmado: signed.xmlFirmado,
        xml_firmado_length: signed.xmlFirmado.length,
        encf,
        tipo_ecf: String(row.TipoeCF),
        ambiente: "CerteCF",
        rnc_emisor: rncEmisor,
        file_name: fileName,
      }), { status: 200, headers: corsHeaders });
    }

    // Paso 3 certificacion: genera, firma y envia una Aprobacion Comercial (ACECF).
    if (action === "dgii_certif_send_acecf_row") {
      const { row } = body;
      if (!row) throw new Error("row requerido");

      const pick = (...keys) => {
        for (const key of keys) {
          if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") return row[key];
        }
        return "";
      };
      const cleanRnc = (v) => String(v || "").replace(/\D/g, "");
      const normalizeDate = (v) => {
        if (v instanceof Date) return v;
        if (typeof v === "number") {
          const epoch = new Date(Date.UTC(1899, 11, 30));
          return new Date(epoch.getTime() + v * 86400000);
        }
        return v;
      };
      const normalizeMonto = (v) => Number(String(v || "0").replace(/,/g, "")) || 0;

      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("Config DGII directo ausente. Sube tu .p12 primero.");

      const input = {
        rnc_emisor: cleanRnc(pick("RNCEmisor", "RNC Emisor", "RNC del Emisor", "RncEmisor")),
        encf: String(pick("eNCF", "ENCF", "NCFElectronico", "NCF Electronico")).trim(),
        fecha_emision: pick("FechaEmision", "Fecha Emision"),
        monto_total: normalizeMonto(pick("MontoTotal", "Monto Total")),
        rnc_comprador: cleanRnc(pick("RNCComprador", "RNC Comprador", "RNC del Comprador", "RncComprador") || integ.config.rnc_emisor),
        estado: String(pick("Estado", "EstadoAprobacion", "Estado Aprobacion") || "1").trim(),
        detalle_motivo_rechazo: pick("DetalleMotivoRechazo", "Detalle Motivo Rechazo", "MotivoRechazo", "Motivo Rechazo"),
        fecha_hora_aprobacion_comercial: normalizeDate(
          pick("FechaHoraAprobacionComercial", "Fecha Hora Aprobacion Comercial") || new Date()
        ),
      };

      let xmlSinFirmar;
      let xmlFirmado;
      try {
        xmlSinFirmar = buildAcecfXml(input);
        const { cert, privateKey } = await loadAndParseP12(supabase, integ.config);
        const signed = await signXmlGenerico(xmlSinFirmar, cert, privateKey);
        xmlFirmado = signed.xmlFirmado;

        const ambiente = "CerteCF";
        const auth = await authenticate(cert, privateKey, ambiente);
        const fileName = `${input.rnc_comprador}${input.encf}.xml`;
        const recepcion = await enviarAprobacionComercial(xmlFirmado, auth.token, ambiente, fileName);

        return new Response(JSON.stringify({
          ok: true,
          encf: input.encf,
          ambiente,
          estado_aprobacion: input.estado,
          response_payload: recepcion,
          xml_firmado_length: xmlFirmado.length,
        }), { status: 200, headers: corsHeaders });
      } catch (e) {
        return new Response(JSON.stringify({
          ok: false,
          step: xmlSinFirmar ? "send" : "build",
          error: e.message,
          encf: input.encf,
          xml_firmado_length: xmlFirmado?.length || 0,
        }), { status: 200, headers: corsHeaders });
      }
    }

    // Paso 4 certificacion: genera comprobantes simulados "reales" por tipo
    // y los envia a CerteCF. Para Tipo 32 < 250K envia RFCE y devuelve el
    // e-CF completo firmado para subirlo manualmente en el portal.
    if (action === "dgii_simulacion_send_case") {
      const { caso } = body;
      if (!caso?.tipo || !caso?.encf) throw new Error("caso.tipo y caso.encf son requeridos");

      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("Config DGII directo ausente. Sube tu .p12 primero.");

      const cfg = integ.config || {};
      const ambiente = "CerteCF";
      const pad = (n) => String(n).padStart(2, "0");
      const today = new Date();
      const fechaEmision = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
      const fechaDgii = `${pad(today.getDate())}-${pad(today.getMonth() + 1)}-${today.getFullYear()}`;
      // FechaVencimientoSecuencia es OBLIGATORIO en el XSD DGII. Prioridad:
      //   1) la del caso (viene del xlsx oficial DGII del Paso 4 — la correcta)
      //   2) la configurada por el tenant
      //   3) fallback a 5 años futuro (no recomendado — DGII puede rechazar)
      const fechaVencimientoSecuencia = normalizeDgiiDate(caso.fecha_vencimiento_secuencia
        || cfg.fecha_vencimiento_secuencia
        || cfg.fecha_vencimiento_ecf
        || `31-12-${today.getFullYear() + 5}`);
      const emisor = {
        rnc: String(cfg.rnc_emisor || "").replace(/\D/g, ""),
        razon_social: cfg.nombre_emisor || "EMPRESA CERTIFICACION",
        nombre_comercial: cfg.nombre_comercial || cfg.nombre_emisor || "EMPRESA CERTIFICACION",
        direccion: cfg.direccion || "DIRECCION CERTIFICACION",
        municipio: "010100",
        provincia: "010000",
        telefono: cfg.telefono ? [cfg.telefono] : [],
        email: cfg.email || null,
      };
      const compradorB2B = {
        rnc: "131880681",
        razon_social: "COMPRADOR CERTIFICACION SRL",
        direccion: "AVENIDA PRUEBA 1",
        email: "comprador@example.com",
      };
      const resolveAmounts = (casoActual, tipoActual, gravado = true) => {
        const fallbackBase = tipoActual === "32" ? 250000 : 1000;
        const explicitBase = Number(casoActual.monto_base || 0);
        const explicitTotal = Number(casoActual.monto || casoActual.monto_total || 0);
        const explicitItbis = Number(casoActual.total_itbis || casoActual.itbis_total || 0);

        if (!gravado) {
          const total = explicitTotal || explicitBase || fallbackBase;
          return { base: total, itbis: 0, total };
        }

        const base = explicitBase || (explicitTotal ? Number((explicitTotal / 1.18).toFixed(2)) : fallbackBase);
        const itbis = explicitItbis || Number((base * 0.18).toFixed(2));
        const total = explicitTotal || Number((base + itbis).toFixed(2));
        return { base, itbis, total };
      };
      const item = (descripcion, amounts, gravado = true) => {
        // En e-CF, MontoItem es base sin ITBIS. El ITBIS vive en Totales.
        const base = Number(amounts.base || 0);
        return {
          descripcion,
          cantidad: 1,
          precio_unitario: base,
          indicador_facturacion: gravado ? "1" : "4",
          monto_item: base,
          unidad_medida: "43",
        };
      };
      const totals = (amounts, gravado = true) => ({
        monto_gravado_total: gravado ? amounts.base : 0,
        monto_gravado_18: gravado ? amounts.base : 0,
        monto_exento: gravado ? 0 : amounts.total,
        itbis_total: gravado ? amounts.itbis : null,
        total_itbis_18: gravado ? amounts.itbis : 0,
        monto_total: amounts.total,
      });
      const baseInput = (tipo, casoActual, comprador, opts = {}) => {
        const gravado = opts.gravado !== false;
        const amounts = resolveAmounts(casoActual, tipo, gravado);
        return ({
        tipo_ecf: tipo,
        encf: caso.encf,
        fecha_emision: fechaEmision,
        fecha_vencimiento_secuencia: fechaVencimientoSecuencia,
        emisor,
        comprador,
        items: [item(`SIMULACION E-CF TIPO ${tipo}`, amounts, gravado)],
        totales: totals(amounts, gravado),
        forma_pago: "01",
        referencia: opts.referencia || null,
        });
      };

      const { cert, privateKey } = await loadAndParseP12(supabase, cfg);
      const auth = await authenticate(cert, privateKey, ambiente);

      try {
        let xmlSinFirmar;
        let sendKind = "ECF";
        let manualEcf = null;
        const tipo = String(caso.tipo);
        if (caso.rfce) {
          const ecfInput = baseInput("32", caso, null);
          const xmlEcf = buildEcfXml("32", ecfInput);
          const signedEcf = await signEcfXml(xmlEcf, cert, privateKey);
          const codigoSeg = (signedEcf.signatureValue || "").slice(0, 6);
          const fileNameEcf = `${emisor.rnc}${caso.encf}.xml`;
          manualEcf = {
            xml_firmado: signedEcf.xmlFirmado,
            xml_firmado_length: signedEcf.xmlFirmado.length,
            file_name: fileNameEcf,
            encf: caso.encf,
            rnc_emisor: emisor.rnc,
            signature_prefix: codigoSeg,
          };
          xmlSinFirmar = buildRfceFromTestRow({
            TipoeCF: "32",
            ENCF: caso.encf,
            TipoIngresos: "01",
            TipoPago: "1",
            RNCEmisor: emisor.rnc,
            RazonSocialEmisor: emisor.razon_social,
            FechaEmision: fechaDgii,
            MontoGravadoTotal: ecfInput.totales.monto_gravado_total,
            MontoGravadoI1: ecfInput.totales.monto_gravado_18,
            TotalITBIS: ecfInput.totales.itbis_total,
            TotalITBIS1: ecfInput.totales.total_itbis_18,
            MontoTotal: ecfInput.totales.monto_total,
            CodigoSeguridadeCF: codigoSeg,
          });
          sendKind = "RFCE";
        } else if (tipo === "33" || tipo === "34") {
          if (!caso.referencia?.encf) throw new Error(`Tipo ${tipo} requiere referencia.encf`);
          xmlSinFirmar = buildEcfXml(tipo, baseInput(tipo, caso, compradorB2B, {
            referencia: {
              encf_modificado: caso.referencia.encf,
              fecha_ncf_modificado: caso.referencia.fecha || fechaDgii,
              codigo_modificacion: "3",
              razon_modificacion: tipo === "33" ? "Cargo posterior de simulacion" : "Descuento de simulacion",
            },
          }));
        } else {
          const comprador = ["31", "44", "45"].includes(tipo)
            ? compradorB2B
            : tipo === "32"
              ? compradorB2B
            : tipo === "41"
              ? { rnc: "131880681", razon_social: "VENDEDOR SIMULACION SRL", direccion: "DIRECCION VENDEDOR" }
              : ["46", "47"].includes(tipo)
                ? { id_extranjero: "EXT12345", razon_social: "FOREIGN CUSTOMER LLC", pais_destino: "US", direccion: "FOREIGN ADDRESS" }
                : null;
          const gravado = !["43", "44", "46", "47"].includes(tipo);
          const input = baseInput(tipo, caso, comprador, { gravado });
          if (tipo === "46") {
            const monto = Number(input.totales.monto_total || 0);
            input.items = input.items.map((it) => ({
              ...it,
              indicador_facturacion: "3",
              monto_item: monto,
              precio_unitario: monto,
            }));
            input.totales = {
              monto_gravado_total: monto,
              monto_gravado_0: monto,
              itbis_total: 0,
              total_itbis_0: 0,
              monto_total: monto,
              monto_periodo: monto,
              valor_pagar: monto,
            };
          }
          if (tipo === "44") {
            input.totales.monto_periodo = input.totales.monto_total;
            input.totales.valor_pagar = input.totales.monto_total;
          }
          if (tipo === "41") {
            const baseRetencion = Number(input.totales.monto_gravado_18 || input.totales.monto_gravado_total || 0);
            const itbisRetenido = Number((baseRetencion * 0.18).toFixed(2));
            const isrRetenido = Number((baseRetencion * 0.10).toFixed(2));
            input.items = input.items.map((it) => ({
              ...it,
              indicador_bien_servicio: "2",
              indicador_agente_retencion: "1",
              monto_itbis_retenido: itbisRetenido,
              monto_isr_retenido: isrRetenido,
            }));
            input.totales.total_itbis_retenido = itbisRetenido;
            input.totales.total_isr_retencion = isrRetenido;
          }
          if (tipo === "47") {
            const monto = Number(input.totales.monto_total || 0);
            const isrRetenido = Number((monto * 0.27).toFixed(2));
            input.items = input.items.map((it) => ({
              ...it,
              indicador_bien_servicio: "2",
              indicador_agente_retencion: "1",
              monto_itbis_retenido: "0.00",
              monto_isr_retenido: isrRetenido,
            }));
            input.totales.monto_periodo = monto;
            input.totales.valor_pagar = input.totales.monto_total;
            input.totales.total_isr_retencion = isrRetenido;
          }
          xmlSinFirmar = buildEcfXml(tipo, input);
        }

        const signed = sendKind === "RFCE"
          ? await signEcfXml(xmlSinFirmar, cert, privateKey)
          : await signEcfXml(xmlSinFirmar, cert, privateKey);
        const fileName = `${emisor.rnc}${caso.encf}.xml`;

        // Modo "solo firmar" (sign_only): genera y firma el XML pero NO lo
        // envía a DGII. Útil cuando el Paso 4 ya está cerrado en DGII pero
        // necesitamos el XML para subirlo manualmente al Paso 5 (RI).
        if (caso.sign_only === true) {
          return new Response(JSON.stringify({
            ok: true,
            tipo,
            encf: caso.encf,
            ambiente,
            kind: sendKind,
            track_id: null,
            estado_dgii: "sign_only",
            sign_only: true,
            response_payload: { mode: "sign_only", note: "XML firmado sin enviar a DGII" },
            xml_firmado_length: signed.xmlFirmado.length,
            xml_firmado: signed.xmlFirmado,
            file_name: fileName,
            manual_ecf: manualEcf,
          }), { status: 200, headers: corsHeaders });
        }

        const recepcion = sendKind === "RFCE"
          ? await enviarRfce(signed.xmlFirmado, auth.token, ambiente, fileName)
          : await enviarEcf(signed.xmlFirmado, auth.token, ambiente, fileName);

        return new Response(JSON.stringify({
          ok: true,
          tipo,
          encf: caso.encf,
          ambiente,
          kind: sendKind,
          track_id: recepcion.trackId || recepcion.TrackId || null,
          estado_dgii: recepcion.estado || recepcion.Estado || "enviado",
          response_payload: recepcion,
          xml_firmado_length: signed.xmlFirmado.length,
          xml_firmado: signed.xmlFirmado,
          file_name: fileName,
          manual_ecf: manualEcf,
        }), { status: 200, headers: corsHeaders });
      } catch (e) {
        return new Response(JSON.stringify({
          ok: false,
          step: "send",
          error: e.message,
          tipo: caso.tipo,
          encf: caso.encf,
        }), { status: 200, headers: corsHeaders });
      }
    }

    // ── ACTION: dgii_certif_check_status ──
    // Consulta el estado en DGII de un TrackId previamente enviado.
    // ── ACTION: dgii_certif_trackids ──
    // Solo lectura: para cada e-NCF, los TrackId que tiene la DGII (CerteCF por
    // defecto). Dice si un comprobante del set se recibio y en que estado, aunque
    // el XML firmado se haya perdido.
    // ── ACTION: dgii_probar_autenticacion ── (10/10/2026, diagnóstico)
    // Solo AUTENTICA (semilla → firma → validar) contra el ambiente pedido y
    // devuelve la respuesta cruda de la DGII. No emite ni gasta e-NCF.
    if (action === "dgii_probar_autenticacion") {
      const { data: integ } = await supabase
        .from("integraciones_fiscales").select("config")
        .eq("tenant_id", tenantId).eq("proveedor", "dgii_directo").maybeSingle();
      if (!integ?.config) throw new Error("Sin config DGII directo");
      const { cert, privateKey } = await loadAndParseP12(supabase, integ.config);
      const bases = { TesteCF: "https://ecf.dgii.gov.do/TesteCF", CerteCF: "https://ecf.dgii.gov.do/CerteCF", Produccion: "https://ecf.dgii.gov.do/eCF" };
      const resultados = [];
      for (const amb of (body.ambientes || ["CerteCF", "Produccion"])) {
        const r = { ambiente: amb, relay: !!Deno.env.get("DGII_RELAY_URL") && !!Deno.env.get("DGII_RELAY_KEY") };
        try {
          const rs = await dgiiFetch(`${bases[amb]}/Autenticacion/api/Autenticacion/Semilla`, { headers: { Accept: "application/xml,text/xml" } });
          const semilla = await rs.text();
          r.semilla_status = rs.status;
          r.semilla = semilla.slice(0, 300);
          const { xmlFirmado: firmado } = await signXmlGenerico(semilla, cert, privateKey);
          // body.basura: manda un XML sin firmar (separa bloqueo por IP de bloqueo por contenido)
          const xmlFirmado = body.basura ? "<SemillaModel><valor>x</valor></SemillaModel>" : firmado;
          if (body.devolver_firmado) r.firmado = firmado;
          for (const ruta of ["autenticacion/api/Autenticacion/ValidarSemilla", "Autenticacion/api/Autenticacion/ValidarSemilla"]) {
            const mp = multipartXml(xmlFirmado, "semilla.xml");
            const rv = await dgiiFetch(`${bases[amb]}/${ruta}`, { method: "POST", headers: mp.headers, body: mp.body });
            const txt = await rv.text();
            (r.validar ||= []).push({ ruta, status: rv.status, headers: Object.fromEntries(rv.headers), cuerpo: txt.slice(0, 600) });
          }
        } catch (e) { r.error = String(e?.message || e); }
        resultados.push(r);
      }
      return new Response(JSON.stringify({ ok: true, resultados }), { status: 200, headers: corsHeaders });
    }

    if (action === "dgii_certif_trackids") {
      const encfs = Array.isArray(body.encfs) ? body.encfs.slice(0, 60) : [];
      if (!encfs.length) throw new Error("encfs requerido");
      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("Config DGII directo ausente");
      const ambiente = body.ambiente || "CerteCF";
      const rnc = String(integ.config.rnc_emisor || "").replace(/\D/g, "");
      const { cert, privateKey } = await loadAndParseP12(supabase, integ.config);
      const auth = await authenticate(cert, privateKey, ambiente);
      const resultados = [];
      for (const encf of encfs) {
        resultados.push({ encf, trackids: await consultarTrackIds(rnc, String(encf), auth.token, ambiente) });
      }
      return new Response(JSON.stringify({ ok: true, ambiente, rnc, resultados }), { status: 200, headers: corsHeaders });
    }

    if (action === "dgii_certif_check_status") {
      const { track_id } = body;
      if (!track_id) throw new Error("track_id requerido");

      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("Config DGII directo ausente");
      const ambiente = "CerteCF";

      const { cert, privateKey } = await loadAndParseP12(supabase, integ.config);
      const auth = await authenticate(cert, privateKey, ambiente);
      const estado = await consultarEstado(track_id, auth.token, ambiente);

      return new Response(JSON.stringify({
        ok: true,
        track_id,
        ambiente,
        estado,
      }), { status: 200, headers: corsHeaders });
    }

    // ── ACTION: dgii_send_to_dgii ──
    // FLUJO COMPLETO: factura → XML → firma → auth DGII → envio → TrackId
    // Tambien escribe en documentos_fiscales y guarda el XML en Storage.
    if (action === "dgii_send_to_dgii") {
      const { factura_id, encf_override } = body;
      if (!factura_id) throw new Error("factura_id requerido");

      // 1. Cargar config
      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("No hay config DGII directo");
      const ambiente = integ.config.ambiente || "TesteCF";

      // 2. Cargar factura + detalles + cliente
      const { data: factura } = await supabase
        .from("facturas").select("*").eq("id", factura_id).eq("tenant_id", tenantId).single();
      if (!factura) throw new Error("Factura no encontrada");

      const { data: detalles } = await supabase
        .from("facturas_detalle").select("*").eq("factura_id", factura_id);
      if (!detalles?.length) throw new Error("Factura sin detalle");

      let cliente = null;
      if (factura.cliente_id) {
        const { data: c } = await supabase
          .from("clientes").select("*").eq("id", factura.cliente_id).maybeSingle();
        cliente = c;
      }

      // 3. Generar e-NCF (en test usamos placeholder; en produccion get_next_encf)
      const isB2B = !!(cliente?.rnc);
      const tipoEcf = isB2B ? "31" : "32";
      const encf = encf_override || `E${tipoEcf}0000000001`;

      // 4. Iniciar log
      const docFiscal = await logEcfStart(supabase, {
        tenantId, factura_id, tipo_ecf: tipoEcf, encf, ambiente,
      });

      try {
        // 5. Generar XML
        const configEmisor = await resolveEmisorConfig(supabase, tenantId, integ.config);
        const input = facturaToEcfInput(factura, detalles, cliente, configEmisor, encf);
        const xmlSinFirmar = buildEcfXml(input.tipo_ecf, input);

        // 6. Cargar .p12 y firmar
        const { cert, privateKey } = await loadAndParseP12(supabase, integ.config);
        const { xmlFirmado } = await signEcfXml(xmlSinFirmar, cert, privateKey);

        // 7. Guardar XML firmado en Storage (para retencion 10 anos)
        const xmlPath = await uploadSignedXml(supabase, tenantId, encf, xmlFirmado);
        await logEcfXmlGenerated(supabase, docFiscal.id, xmlPath, { input });

        // 8. Autenticar contra DGII y enviar
        const auth = await authenticate(cert, privateKey, ambiente);
        const recepcion = await enviarEcf(xmlFirmado, auth.token, ambiente);
        const trackId = recepcion.trackId || recepcion.TrackId || recepcion.trackid;

        if (!trackId) {
          throw new Error(`DGII no devolvio TrackId. Respuesta: ${JSON.stringify(recepcion).slice(0, 300)}`);
        }

        // 9. Registrar envio
        await logEcfSent(supabase, docFiscal.id, trackId);

        return new Response(JSON.stringify({
          ok: true,
          encf,
          tipo_ecf: tipoEcf,
          ambiente,
          trackId,
          xml_path: xmlPath,
          recepcion,
          documento_id: docFiscal.id,
        }), { status: 200, headers: corsHeaders });

      } catch (err) {
        await logEcfError(supabase, docFiscal.id, err.message || String(err));
        throw err;
      }
    }

    // ── ACTION: dgii_emitir_nota_credito ──
    // FLUJO COMPLETO Tipo 34: devolucion -> factura original -> XML Tipo 34
    // -> firma -> auth DGII -> envio -> TrackId. Persiste en documentos_fiscales.
    //
    // Body: { devolucion_id, codigo_modificacion?, razon_modificacion? }
    // Default codigo_modificacion = "1" (anulacion total / devolucion).
    if (action === "dgii_emitir_nota_credito") {
      const { devolucion_id, codigo_modificacion, razon_modificacion } = body;
      if (!devolucion_id) throw new Error("devolucion_id requerido");

      // 1. Cargar config DGII
      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("No hay config DGII directo. Configura el certificado primero.");
      const ambiente = integ.config.ambiente || "TesteCF";

      // 2. Cargar devolucion + detalles
      const { data: devolucion, error: devErr } = await supabase
        .from("devoluciones")
        .select("*")
        .eq("id", devolucion_id)
        .eq("tenant_id", tenantId)
        .single();
      if (devErr || !devolucion) throw new Error("Devolucion no encontrada");

      const { data: devDetalles } = await supabase
        .from("devoluciones_detalle")
        .select("*")
        .eq("devolucion_id", devolucion_id);
      if (!devDetalles?.length) throw new Error("Devolucion sin detalle");

      // 3. Cargar factura original
      const { data: facturaOrig, error: fOrigErr } = await supabase
        .from("facturas")
        .select("*")
        .eq("id", devolucion.factura_id)
        .eq("tenant_id", tenantId)
        .single();
      if (fOrigErr || !facturaOrig) throw new Error("Factura original no encontrada");

      // 4. Buscar e-NCF original (puede estar en facturas.ncf o documentos_fiscales)
      let encfOriginal = facturaOrig.ncf;
      if (!encfOriginal || !encfOriginal.match(/^E\d{12}$/)) {
        const { data: docOrig } = await supabase
          .from("documentos_fiscales")
          .select("encf, tipo_ecf")
          .eq("factura_id", devolucion.factura_id)
          .eq("tenant_id", tenantId)
          .eq("estado", "emitido")
          .not("encf", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        encfOriginal = docOrig?.encf;
      }
      if (!encfOriginal || !encfOriginal.match(/^E\d{12}$/)) {
        throw new Error(
          `La factura original (${facturaOrig.numero}) no tiene e-NCF DGII. Solo se pueden emitir Notas de Credito sobre facturas que se emitieron antes con e-CF.`
        );
      }

      // 5. Cargar cliente
      let cliente = null;
      if (facturaOrig.cliente_id) {
        const { data: c } = await supabase
          .from("clientes")
          .select("*")
          .eq("id", facturaOrig.cliente_id)
          .maybeSingle();
        cliente = c;
      }
      cliente = await compradorReal(supabase, facturaOrig, cliente);

      // 6. Asignar e-NCF Tipo 34 (correlativo)
      const tipoEcf = "34";
      const { data: encfNuevo, error: encfErr } = await supabase.rpc("get_next_encf_empresa", {
        p_tenant: tenantId,
        p_tipo_ecf: tipoEcf,
        p_ambiente: ambiente,
      });
      if (encfErr || !encfNuevo) {
        throw new Error(
          `No se pudo asignar e-NCF Tipo 34 (${ambiente}): ${encfErr?.message || "secuencia agotada o no configurada en ecf_secuencias"}`
        );
      }

      // 7. Iniciar log
      const docFiscal = await logEcfStart(supabase, {
        tenantId,
        factura_id: devolucion.factura_id,
        tipo_ecf: tipoEcf,
        encf: encfNuevo,
        ambiente,
      });

      try {
        // 8. Mapear devoluciones_detalle -> items para notaToEcfInput
        const itemsNota = devDetalles.map((d) => ({
          descripcion: d.descripcion || d.producto_descripcion || "Item devuelto",
          cantidad: Number(d.cantidad) || 0,
          precio: Number(d.precio) || 0,
          descuento: Number(d.descuento) || 0,
          itbis_pct: d.itbis_pct,
          importe: Number(d.importe) || 0,
        }));

        // 9. Build XML + firma + envio
        const configEmisor = await resolveEmisorConfig(supabase, tenantId, integ.config);
        const input = notaToEcfInput(
          {
            fecha: devolucion.fecha_devolucion || new Date().toISOString(),
            items: itemsNota,
            tipo: "credito",
          },
          {
            ncf: encfOriginal,
            fecha: facturaOrig.fecha,
            numero: facturaOrig.numero,
            cliente_id: facturaOrig.cliente_id,
          },
          cliente,
          configEmisor,
          encfNuevo,
          {
            codigo_modificacion: codigo_modificacion || "1",
            razon_modificacion: razon_modificacion || devolucion.notas || "Devolucion de mercancia",
          }
        );
        const xmlSinFirmar = buildEcfXml(input.tipo_ecf, input);

        const { cert, privateKey } = await loadAndParseP12(supabase, integ.config);
        const { xmlFirmado } = await signEcfXml(xmlSinFirmar, cert, privateKey);

        const xmlPath = await uploadSignedXml(supabase, tenantId, encfNuevo, xmlFirmado);
        await logEcfXmlGenerated(supabase, docFiscal.id, xmlPath, { input });

        const auth = await authenticate(cert, privateKey, ambiente);
        const recepcion = await enviarEcf(xmlFirmado, auth.token, ambiente);
        const trackId = recepcion.trackId || recepcion.TrackId || recepcion.trackid;
        if (!trackId) {
          throw new Error(`DGII no devolvio TrackId. Respuesta: ${JSON.stringify(recepcion).slice(0, 300)}`);
        }

        await logEcfSent(supabase, docFiscal.id, trackId);

        // 10. Linkear la devolucion con el documento fiscal (si hay columna)
        try {
          await supabase
            .from("devoluciones")
            .update({ documento_fiscal_id: docFiscal.id, encf: encfNuevo })
            .eq("id", devolucion_id);
        } catch (linkErr) {
          // No bloquear si las columnas no existen — solo loguear
          console.warn("[dgii_emitir_nota_credito] no se pudo linkear devolucion:", linkErr.message);
        }

        return new Response(JSON.stringify({
          ok: true,
          encf: encfNuevo,
          tipo_ecf: tipoEcf,
          encf_modificado: encfOriginal,
          ambiente,
          trackId,
          xml_path: xmlPath,
          documento_id: docFiscal.id,
        }), { status: 200, headers: corsHeaders });
      } catch (err) {
        await logEcfError(supabase, docFiscal.id, err.message || String(err));
        throw err;
      }
    }

    // ── ACTION: dgii_consultar_estado ──
    // Dado un TrackId, consulta a DGII el estado actual del e-CF.
    if (action === "dgii_consultar_estado") {
      const { track_id, documento_id } = body;
      if (!track_id) throw new Error("track_id requerido");

      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("No hay config DGII directo");
      const ambiente = integ.config.ambiente || "TesteCF";

      const { cert, privateKey } = await loadAndParseP12(supabase, integ.config);
      const auth = await authenticate(cert, privateKey, ambiente);
      const estado = await consultarEstado(track_id, auth.token, ambiente);

      // Normalizar estado para nuestra columna estado_dgii
      const estadoNormalizado = (() => {
        const e = String(estado.estado || estado.codigo || "").toLowerCase();
        if (e.includes("aceptado_condicional") || e.includes("condicional")) return "aceptado_condicional";
        if (e.includes("aceptado") || e === "1") return "aceptado";
        if (e.includes("rechazado") || e === "0") return "rechazado";
        return "enviado";
      })();

      // Si nos dieron un documento_id, actualizamos la fila
      if (documento_id) {
        await logEcfArecf(supabase, documento_id, estadoNormalizado, estado);
      }

      return new Response(JSON.stringify({
        ok: true,
        track_id,
        ambiente,
        estado: estadoNormalizado,
        respuesta: estado,
      }), { status: 200, headers: corsHeaders });
    }

    // ── ACTION: dgii_list_documentos ──
    // Devuelve los documentos fiscales del tenant (con filtros opcionales).
    // Util para una pestaña/lista de "e-CF emitidos" en el frontend.
    if (action === "dgii_list_documentos") {
      const { tipo_ecf, estado, desde, hasta, limit } = body;
      let query = supabase
        .from("documentos_fiscales")
        .select("id, factura_id, tipo_ecf, encf, track_id, estado, estado_dgii, aecf_estado, ambiente, emitted_at, arecf_recibido_at, error_message, xml_firmado_path, created_at")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .order("created_at", { ascending: false })
        .limit(Math.min(parseInt(limit) || 100, 500));

      if (tipo_ecf) query = query.eq("tipo_ecf", tipo_ecf);
      if (estado)   query = query.eq("estado", estado);
      if (desde)    query = query.gte("created_at", desde);
      if (hasta)    query = query.lte("created_at", hasta);

      const { data, error } = await query;
      if (error) throw new Error(`Error listando documentos: ${error.message}`);

      return new Response(JSON.stringify({ ok: true, documentos: data || [] }), {
        status: 200, headers: corsHeaders,
      });
    }

    // ── ACTION: dgii_validate_certificate ──
    // Carga el .p12 desde Storage, descifra el password con la master key,
    // parsea el certificado con node-forge y devuelve metadata. Tambien
    // persiste la metadata en integraciones_fiscales.config.metadata.
    if (action === "dgii_validate_certificate") {
      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("id, config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();

      if (!integ) throw new Error("No hay configuracion DGII directo para este tenant");

      const { metadata } = await loadAndParseP12(supabase, integ.config);

      // Persistir metadata en config para mostrarla sin re-cargar el .p12
      const newConfig = { ...(integ.config || {}), metadata };
      await supabase
        .from("integraciones_fiscales")
        .update({ config: newConfig, updated_at: new Date().toISOString() })
        .eq("id", integ.id);

      return new Response(JSON.stringify({ ok: true, metadata }), {
        status: 200, headers: corsHeaders,
      });
    }

    // ── ACTION: dgii_delete_certificate ──
    // Elimina el .p12 del Storage y la fila de integraciones_fiscales
    // para el proveedor 'dgii_directo' del tenant. Deja el sistema
    // como si nunca se hubiera configurado.
    if (action === "dgii_delete_certificate") {
      // 1. Cargar la integracion existente para conocer el path
      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("id, config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();

      // 2. Borrar el archivo del Storage si esta el path
      if (integ?.config?.certificado_storage_path) {
        const path = integ.config.certificado_storage_path;
        const { error: rmErr } = await supabase.storage
          .from("certificados-dgii")
          .remove([path]);
        if (rmErr) {
          // No bloqueante: dejamos log y seguimos limpiando la BD
          console.warn("[emitir-fiscal] no se pudo borrar del storage:", rmErr.message);
        }
      }

      // 3. Borrar la fila de integraciones_fiscales
      if (integ?.id) {
        const { error: delErr } = await supabase
          .from("integraciones_fiscales")
          .delete()
          .eq("id", integ.id);
        if (delErr) throw new Error(`Error borrando integracion: ${delErr.message}`);
      }

      return new Response(JSON.stringify({ ok: true, deleted: !!integ?.id }), {
        status: 200, headers: corsHeaders,
      });
    }

    // ── ACTION: dgii_certificate_info ──
    // Devuelve metadata del certificado actual del tenant (si existe).
    // No descifra el password ni descarga el .p12 — solo info publica.
    if (action === "dgii_certificate_info") {
      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config, activo, updated_at")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();

      if (!integ) {
        return new Response(JSON.stringify({ ok: true, configured: false }), {
          status: 200, headers: corsHeaders,
        });
      }

      const cfg = integ.config || {};
      return new Response(JSON.stringify({
        ok: true,
        configured: !!cfg.certificado_storage_path,
        rnc_emisor: cfg.rnc_emisor,
        nombre_emisor: cfg.nombre_emisor,
        nombre_comercial: cfg.nombre_comercial || null,
        municipio: cfg.municipio || null,
        provincia: cfg.provincia || null,
        ambiente: cfg.ambiente,
        callback_url: cfg.callback_url,
        fecha_vencimiento_secuencia: cfg.fecha_vencimiento_secuencia || null,
        storage_path: cfg.certificado_storage_path,
        metadata: cfg.metadata || null,
        activo: integ.activo,
        updated_at: integ.updated_at,
      }), { status: 200, headers: corsHeaders });
    }

    // ── ACTION: dgii_anular_ecf ──
    // Anula uno o varios e-NCF previamente emitidos. Genera un ANECF
    // firmado y lo envia al endpoint de anulaciones.
    if (action === "dgii_anular_ecf") {
      const { ncf_inicial, ncf_final, fecha_anulacion } = body;
      if (!ncf_inicial) throw new Error("ncf_inicial requerido");

      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("No hay config DGII directo");
      const ambiente = integ.config.ambiente || "TesteCF";

      // 1. Generar ANECF
      const anecfInput = {
        rnc_emisor: integ.config.rnc_emisor,
        fecha_anulacion: fecha_anulacion || new Date().toISOString(),
        ncf_inicial,
        ncf_final: ncf_final || ncf_inicial,
      };
      const anecfXml = buildAnecfXml(anecfInput);

      // 2. Cargar .p12 + firmar
      const { cert, privateKey } = await loadAndParseP12(supabase, integ.config);
      const { xmlFirmado } = await signXmlGenerico(anecfXml, cert, privateKey);

      // 3. Autenticar y enviar
      const auth = await authenticate(cert, privateKey, ambiente);
      const respuesta = await enviarAnulacion(xmlFirmado, auth.token, ambiente);

      // 4. Marcar las filas en documentos_fiscales como anuladas
      // Fase 0.7: NO sobreescribir filas en estados terminales DGII
      // (aceptado / aceptado_condicional). Anular un e-CF ya aceptado
      // por DGII tiene implicaciones legales y no debe pasar silencioso.
      const { data: anuladas, error: updErr } = await supabase
        .from("documentos_fiscales")
        .update({
          estado: "anulado",
          estado_dgii: "anulado",
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenantId)
        .gte("encf", ncf_inicial)
        .lte("encf", ncf_final || ncf_inicial)
        .not("estado_dgii", "in", "(aceptado,aceptado_condicional)")
        .select("id, encf, estado_dgii");

      if (updErr) {
        console.error("[dgii_anular_ecf] error actualizando documentos_fiscales:", updErr);
      }

      // Recolectar e-NCFs que NO se actualizaron (ya estaban aceptados)
      const { data: bloqueados } = await supabase
        .from("documentos_fiscales")
        .select("encf, estado_dgii")
        .eq("tenant_id", tenantId)
        .gte("encf", ncf_inicial)
        .lte("encf", ncf_final || ncf_inicial)
        .in("estado_dgii", ["aceptado", "aceptado_condicional"]);

      if (bloqueados && bloqueados.length > 0) {
        console.warn(
          `[dgii_anular_ecf] AVISO: ${bloqueados.length} e-CF ya aceptados por DGII NO fueron anulados localmente. Anulacion sigue valida en DGII; revisar manualmente:`,
          bloqueados.map(b => b.encf).join(", ")
        );
      }

      return new Response(JSON.stringify({
        ok: true,
        ambiente,
        ncf_inicial,
        ncf_final: ncf_final || ncf_inicial,
        respuesta,
        anuladas_localmente: anuladas?.length ?? 0,
        ya_aceptadas_dgii_no_modificadas: bloqueados?.length ?? 0,
        bloqueados: bloqueados?.map(b => b.encf) ?? [],
      }), { status: 200, headers: corsHeaders });
    }

    // ── ACTION: dgii_enviar_rfce ──
    // Envia un Resumen de Facturas de Consumo (Tipo 32) en batch.
    // Toma todos los e-CF Tipo 32 del rango de fechas que aun no se
    // hayan reportado, los firma juntos en un RFCE y envia a DGII.
    if (action === "dgii_enviar_rfce") {
      const { fecha_inicio, fecha_fin } = body;
      if (!fecha_inicio || !fecha_fin) throw new Error("fecha_inicio y fecha_fin requeridos");

      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("No hay config DGII directo");
      const ambiente = integ.config.ambiente || "TesteCF";

      // 1. Cargar todos los Tipo 32 del rango que aun no fueron incluidos en RFCE
      const { data: docs, error: docsErr } = await supabase
        .from("documentos_fiscales")
        .select("id, encf, factura_id")
        .eq("tenant_id", tenantId)
        .eq("tipo_ecf", "32")
        .gte("emitted_at", fecha_inicio)
        .lte("emitted_at", fecha_fin)
        .is("track_id", null);  // no enviados aun (RFCE no asigna trackId individual)
      if (docsErr) throw new Error(`Error cargando docs: ${docsErr.message}`);
      if (!docs?.length) throw new Error("No hay e-CF Tipo 32 pendientes en el rango");

      // 2. Cargar las facturas para obtener montos
      const facturaIds = docs.map(d => d.factura_id).filter(Boolean);
      const { data: facturas } = await supabase
        .from("facturas")
        .select("id, total, itbis, subtotal")
        .in("id", facturaIds);
      const factById = new Map((facturas || []).map(f => [f.id, f]));

      const facturasResumen = docs.map(d => {
        const f = factById.get(d.factura_id) || {};
        return {
          encf: d.encf,
          monto_total: Number(f.total) || 0,
          total_itbis: Number(f.itbis) || 0,
          monto_gravado: Number(f.subtotal) || 0,
        };
      });

      // 3. Generar RFCE
      const rfceInput = {
        rnc_emisor: integ.config.rnc_emisor,
        fecha_inicio,
        fecha_fin,
        facturas: facturasResumen,
      };
      const rfceXml = buildRfceXml(rfceInput);

      // 4. Cargar .p12 + firmar
      const { cert, privateKey } = await loadAndParseP12(supabase, integ.config);
      const { xmlFirmado } = await signXmlGenerico(rfceXml, cert, privateKey);

      // 5. Autenticar y enviar
      const auth = await authenticate(cert, privateKey, ambiente);
      const respuesta = await enviarRfce(xmlFirmado, auth.token, ambiente);

      // 6. Marcar todos los docs como enviados via RFCE
      const trackId = respuesta.trackId || respuesta.TrackId || `RFCE-${Date.now()}`;
      await supabase
        .from("documentos_fiscales")
        .update({
          track_id: trackId,
          estado_dgii: "enviado_rfce",
          estado: "emitido",
          updated_at: new Date().toISOString(),
        })
        .in("id", docs.map(d => d.id));

      return new Response(JSON.stringify({
        ok: true,
        ambiente,
        cantidad_resumenes: facturasResumen.length,
        track_id: trackId,
        respuesta,
      }), { status: 200, headers: corsHeaders });
    }

    throw new Error(`Acción '${action}' no reconocida. Use: test_connection, emitir_factura, dgii_save_certificate_meta, dgii_certificate_info, dgii_validate_certificate, dgii_delete_certificate, dgii_list_documentos, dgii_test_xml_generation, dgii_test_xml_sign, dgii_test_nota_xml, dgii_send_to_dgii, dgii_consultar_estado, dgii_anular_ecf, dgii_enviar_rfce`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("[emitir-fiscal] ERROR:", errorMessage);
    if (errorStack) console.error("[emitir-fiscal] STACK:", errorStack);
    return new Response(JSON.stringify({
      ok: false,
      error: errorMessage,
      // Include stack in dev/test for easier debugging (remove in production)
      _debug_stack: errorStack || null,
    }), { status: 400, headers: corsHeaders });
  }
});
