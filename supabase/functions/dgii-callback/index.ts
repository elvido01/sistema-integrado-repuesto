// @ts-nocheck
// deno-lint-ignore-file
//
// ============================================================
// dgii-callback — Endpoint publico para recibir respuestas DGII
// ============================================================
// DGII llama a este endpoint asincrono con dos tipos de payloads:
//
//   1) ARECF (Acuse de Recibo de e-CF)
//      - DGII lo manda despues de procesar el e-CF que enviamos.
//      - Contiene el resultado: aceptado / rechazado / aceptado_condicional.
//      - Ruta convencional: POST /functions/v1/dgii-callback
//      - Body: XML o JSON con TrackId + estado + mensajes.
//
//   2) AECF (Aprobacion Comercial Electronica)
//      - SOLO para B2B (Tipo 31). El comprador aprueba/rechaza la factura.
//      - DGII lo reenvia al emisor.
//      - Body: XML firmado por el comprador.
//
// CONFIGURACION DGII:
//   En la Oficina Virtual, cada emisor debe declarar su URL de callback.
//   En nuestro caso:
//     https://zdvxowpuklbypweyqqki.supabase.co/functions/v1/dgii-callback
//
// SEGURIDAD:
//   - Funcion PUBLICA (deploy --no-verify-jwt). DGII no tiene token Supabase.
//   - La autenticidad se valida verificando que el TrackId existe en
//     documentos_fiscales (solo nosotros lo conocemos).
//   - Se podria reforzar verificando la firma del payload, pero DGII
//     usa IPs publicas dinamicas asi que IP-allowlist no es viable.
//
// IMPORTANTE: el endpoint debe responder 200 RAPIDO. DGII reintenta si
// el response tarda; toda la logica pesada queda en background.
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ────────────────────────────────────────────────
// Helpers de extraccion
// ────────────────────────────────────────────────

// Extrae texto entre tags XML simples (sin namespaces, primer match)
function xmlField(xml, tag) {
  const re = new RegExp(`<(?:[A-Za-z0-9_]+:)?${tag}[^>]*>(.*?)</(?:[A-Za-z0-9_]+:)?${tag}>`, "is");
  const m = xml.match(re);
  return m?.[1]?.trim() ?? null;
}

// Heuristica para detectar si el payload es ARECF, AECF u otro
function detectarTipo(payload) {
  if (typeof payload === "string") {
    if (/<\s*ARECF\b/i.test(payload)) return "ARECF";
    if (/<\s*AECF\b/i.test(payload))  return "AECF";
    if (/<\s*ANECF\b/i.test(payload)) return "ANECF"; // Anulacion
    return "XML_DESCONOCIDO";
  }
  if (typeof payload === "object" && payload) {
    if (payload.trackId || payload.TrackId) return "ARECF_JSON";
    return "JSON_DESCONOCIDO";
  }
  return "DESCONOCIDO";
}

// Normaliza estado DGII a nuestro vocabulario
function normalizarEstado(raw) {
  const s = String(raw || "").toLowerCase().trim();
  if (s.includes("aceptado_condicional") || s.includes("condicional") || s === "2") return "aceptado_condicional";
  if (s.includes("aceptado") || s === "1") return "aceptado";
  if (s.includes("rechazado") || s === "0") return "rechazado";
  return s || "desconocido";
}

// ────────────────────────────────────────────────
// Procesamiento de ARECF (Acuse de Recibo)
// ────────────────────────────────────────────────
async function procesarArecf(supabase, payload, rawBody) {
  let trackId, estado, encf, mensajes;

  if (typeof payload === "string") {
    // XML
    trackId  = xmlField(payload, "TrackId");
    estado   = xmlField(payload, "Estado") || xmlField(payload, "Codigo");
    encf     = xmlField(payload, "eNCF") || xmlField(payload, "ENCF");
    // Mensajes pueden ser multiples — los guardamos crudos
    mensajes = (payload.match(/<(?:[A-Za-z0-9_]+:)?Mensaje[^>]*>(.*?)<\/(?:[A-Za-z0-9_]+:)?Mensaje>/gis) || [])
      .map(m => m.replace(/<[^>]+>/g, "").trim());
  } else {
    // JSON
    trackId  = payload.trackId || payload.TrackId;
    estado   = payload.estado  || payload.Estado || payload.codigo;
    encf     = payload.eNCF    || payload.encf || payload.ENCF;
    mensajes = payload.mensajes || payload.Mensajes || [];
  }

  if (!trackId) {
    return { ok: false, error: "ARECF sin TrackId" };
  }

  // Buscar el documento por TrackId (RLS no aplica a service_role)
  const { data: doc, error: findErr } = await supabase
    .from("documentos_fiscales")
    .select("id, tenant_id, encf, estado_dgii")
    .eq("track_id", trackId)
    .maybeSingle();

  if (findErr) {
    console.error("[dgii-callback] error buscando doc:", findErr);
    return { ok: false, error: findErr.message };
  }
  if (!doc) {
    // Puede que el ARECF llegue antes de que persistamos el TrackId
    // — guardamos el callback para reintento posterior. Por ahora
    // devolvemos 200 igual asi DGII no reintenta indefinidamente.
    console.warn("[dgii-callback] ARECF sin documento_fiscal correspondiente. TrackId:", trackId);
    return { ok: true, warning: "TrackId no encontrado", trackId };
  }

  const estadoNormalizado = normalizarEstado(estado);

  const { error: updErr } = await supabase
    .from("documentos_fiscales")
    .update({
      estado_dgii: estadoNormalizado,
      arecf_recibido_at: new Date().toISOString(),
      arecf_payload: typeof payload === "object" ? payload : { raw_xml: payload },
      dgii_messages: mensajes && mensajes.length > 0 ? mensajes : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", doc.id);

  if (updErr) {
    console.error("[dgii-callback] error update doc:", updErr);
    return { ok: false, error: updErr.message };
  }

  return {
    ok: true,
    tipo: "ARECF",
    documento_id: doc.id,
    trackId,
    estado: estadoNormalizado,
    encf: encf || doc.encf,
  };
}

// ────────────────────────────────────────────────
// Procesamiento de AECF (Aprobacion Comercial B2B)
// ────────────────────────────────────────────────
async function procesarAecf(supabase, xml) {
  const trackId  = xmlField(xml, "TrackId");
  const encf     = xmlField(xml, "eNCF") || xmlField(xml, "ENCF");
  const estado   = xmlField(xml, "Estado");

  if (!trackId && !encf) {
    return { ok: false, error: "AECF sin TrackId ni eNCF" };
  }

  let q = supabase.from("documentos_fiscales").select("id, tenant_id");
  if (trackId)    q = q.eq("track_id", trackId);
  else if (encf)  q = q.eq("encf", encf);

  const { data: doc } = await q.maybeSingle();
  if (!doc) {
    console.warn("[dgii-callback] AECF sin documento_fiscal. TrackId:", trackId, "eNCF:", encf);
    return { ok: true, warning: "TrackId/eNCF no encontrado" };
  }

  const estadoComercial = (() => {
    const s = String(estado || "").toLowerCase();
    if (s.includes("aprobado") || s === "1") return "aprobado";
    if (s.includes("rechazado") || s === "0") return "rechazado";
    return s || "recibido";
  })();

  const { error: updErr } = await supabase
    .from("documentos_fiscales")
    .update({
      aecf_estado: estadoComercial,
      aecf_recibido_at: new Date().toISOString(),
      aecf_payload: { raw_xml: xml },
      updated_at: new Date().toISOString(),
    })
    .eq("id", doc.id);

  if (updErr) return { ok: false, error: updErr.message };

  return { ok: true, tipo: "AECF", documento_id: doc.id, estado: estadoComercial };
}

// ────────────────────────────────────────────────
// Persistencia de auditoria — toda llamada de DGII
// se guarda cruda para troubleshooting.
// ────────────────────────────────────────────────
async function guardarAuditoria(supabase, req, payloadType, rawBody, resultado) {
  try {
    await supabase.from("dgii_callbacks_log").insert({
      tipo: payloadType,
      raw_body: rawBody?.slice(0, 50000) || null,  // limitar a 50KB
      headers: Object.fromEntries(req.headers),
      resultado: resultado,
      ip: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || null,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    // No bloqueante: si la tabla no existe, lo logueamos y seguimos.
    console.warn("[dgii-callback] no se pudo guardar auditoria:", e.message);
  }
}

// ────────────────────────────────────────────────
// Handler principal
// ────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Acceso GET de healthcheck (util para que DGII verifique que la URL responde)
  if (req.method === "GET") {
    return new Response(JSON.stringify({
      ok: true,
      service: "dgii-callback",
      ready: true,
      timestamp: new Date().toISOString(),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Leer body — DGII puede mandar XML o JSON segun endpoint/version
  const contentType = req.headers.get("content-type") || "";
  let payload;
  let rawBody = "";

  try {
    if (contentType.includes("multipart/form-data")) {
      // multipart con un campo "xml"
      const form = await req.formData();
      const xmlField = form.get("xml");
      if (xmlField instanceof File) rawBody = await xmlField.text();
      else if (typeof xmlField === "string") rawBody = xmlField;
      payload = rawBody;
    } else if (contentType.includes("application/json")) {
      rawBody = await req.text();
      payload = JSON.parse(rawBody);
    } else {
      // por defecto asumimos XML/text
      rawBody = await req.text();
      payload = rawBody;
    }
  } catch (e) {
    console.error("[dgii-callback] no se pudo parsear body:", e);
    return new Response(JSON.stringify({ ok: false, error: "Body invalido" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const tipo = detectarTipo(payload);
  let resultado;

  try {
    if (tipo === "ARECF" || tipo === "ARECF_JSON") {
      resultado = await procesarArecf(supabase, payload, rawBody);
    } else if (tipo === "AECF") {
      resultado = await procesarAecf(supabase, payload);
    } else {
      resultado = { ok: true, warning: `Tipo no manejado: ${tipo}`, raw_preview: rawBody.slice(0, 200) };
    }
  } catch (e) {
    console.error("[dgii-callback] error procesando:", e);
    resultado = { ok: false, error: e.message };
  }

  // Auditoria (no bloqueante)
  guardarAuditoria(supabase, req, tipo, rawBody, resultado);

  // SIEMPRE 200 a DGII — los reintentos masivos saturan el sistema.
  // Errores se registran en la tabla de auditoria.
  return new Response(JSON.stringify(resultado), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
