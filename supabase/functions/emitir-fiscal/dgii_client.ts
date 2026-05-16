// @ts-nocheck
// deno-lint-ignore-file
//
// ============================================================
// Cliente HTTP a servicios DGII (e-CF)
// ============================================================
// Implementa el flujo de autenticacion (semilla → firma → token)
// y los servicios principales del API de DGII para e-CF:
//
//   - getSemilla(ambiente)            — GET semilla (challenge)
//   - authenticate(p12, ambiente)     — firma semilla + obtiene token
//   - enviarEcf(xml, token, ambiente) — POST e-CF firmado → TrackId
//   - consultarEstado(trackId, ...)   — GET estado del e-CF
//
// AMBIENTES (urls base):
//   TesteCF    — pruebas iniciales
//   CerteCF    — set de 25 pruebas oficiales para certificacion
//   Produccion — emision real
// ============================================================

import { signEcfXml, signXmlGenerico } from "./dgii_signer.ts";

// CRITICO: las paths son case-sensitive. Estos valores estan tomados
// de la libreria dgii-ecf (victors1681) que esta validada contra DGII
// en produccion. NO cambiar el casing.
const DGII_BASES = {
  TesteCF: "https://ecf.dgii.gov.do/TesteCF",
  CerteCF: "https://ecf.dgii.gov.do/CerteCF",
  Produccion: "https://ecf.dgii.gov.do/eCF",
};

// El RFCE/RFCS (Resumen de Facturas Consumo) usa un host DIFERENTE:
// fc.dgii.gov.do (no ecf.dgii.gov.do). Confirmado en dgii-ecf source.
const DGII_BASES_FC = {
  TesteCF: "https://fc.dgii.gov.do/TesteCF",
  CerteCF: "https://fc.dgii.gov.do/CerteCF",
  Produccion: "https://fc.dgii.gov.do/eCF",
};

function baseUrlFc(ambiente) {
  const url = DGII_BASES_FC[ambiente];
  if (!url) throw new Error(`Ambiente DGII desconocido: ${ambiente}`);
  return url;
}

function baseUrl(ambiente) {
  const url = DGII_BASES[ambiente];
  if (!url) throw new Error(`Ambiente DGII desconocido: ${ambiente}. Use TesteCF | CerteCF | Produccion`);
  return url;
}

// ────────────────────────────────────────────────
// 1. GET semilla
// ────────────────────────────────────────────────
export async function getSemilla(ambiente) {
  // Endpoint: Autenticacion/api/Autenticacion/Semilla (case-sensitive)
  const url = `${baseUrl(ambiente)}/Autenticacion/api/Autenticacion/Semilla`;
  const resp = await fetch(url, {
    method: "GET",
    headers: { "Accept": "application/xml,text/xml" },
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`DGII semilla ${resp.status}: ${txt.slice(0, 200)}`);
  }
  // DGII devuelve un XML simple: <SeedResponse><seed>...</seed><expira>...</expira></SeedResponse>
  // o variantes. Lo retornamos crudo para firmarlo tal cual.
  return await resp.text();
}

// ────────────────────────────────────────────────
// 2. Validar semilla (POST semilla firmada → token)
// ────────────────────────────────────────────────
export async function validarSemilla(semillaFirmada, ambiente) {
  // OJO: aqui es 'autenticacion' minuscula (validado contra dgii-ecf)
  const url = `${baseUrl(ambiente)}/autenticacion/api/Autenticacion/ValidarSemilla`;

  // El endpoint espera multipart/form-data con un campo "xml"
  const form = new FormData();
  form.append("xml", new Blob([semillaFirmada], { type: "application/xml" }), "semilla.xml");

  const resp = await fetch(url, { method: "POST", body: form });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`DGII validar semilla ${resp.status}: ${txt.slice(0, 300)}`);
  }
  const data = await resp.json();
  // Esperado: { token: "...", expira: "...", expedido: "..." }
  if (!data?.token) {
    throw new Error(`DGII validar semilla: respuesta sin token: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

// ────────────────────────────────────────────────
// API combinada: autenticar (orchestrador)
// Devuelve { token, expira }
// ────────────────────────────────────────────────
export async function authenticate(cert, privateKey, ambiente) {
  const semilla = await getSemilla(ambiente);
  // signXmlGenerico detecta el tag raiz (no es <ECF> en este caso)
  const { xmlFirmado: semillaFirmada } = await signXmlGenerico(semilla, cert, privateKey);
  const auth = await validarSemilla(semillaFirmada, ambiente);
  return { token: auth.token, expira: auth.expira, expedido: auth.expedido };
}

// ────────────────────────────────────────────────
// 3. Enviar e-CF firmado → TrackId
// ────────────────────────────────────────────────
export async function enviarEcf(xmlFirmado, token, ambiente, fileName) {
  // Endpoint correcto: recepcion/api/FacturasElectronicas (no RecepcionECF)
  const url = `${baseUrl(ambiente)}/recepcion/api/FacturasElectronicas`;

  // CRITICO: el filename debe ser <RNC><eNCF>.xml — DGII rechaza si no.
  const fName = fileName || "ecf.xml";
  const form = new FormData();
  form.append("xml", new Blob([xmlFirmado], { type: "application/xml" }), fName);

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` },
    body: form,
  });

  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!resp.ok) {
    throw new Error(`DGII RecepcionECF ${resp.status}: ${JSON.stringify(data).slice(0, 400)}`);
  }
  // Esperado: { trackId: "...", codigo: ..., mensaje: ..., estado: ... }
  return data;
}

// ────────────────────────────────────────────────
// 4. Consultar estado por TrackId
// ────────────────────────────────────────────────
export async function consultarEstado(trackId, token, ambiente) {
  const url = `${baseUrl(ambiente)}/consultaresultado/api/Consultas/Estado?trackId=${encodeURIComponent(trackId)}`;
  const resp = await fetch(url, {
    method: "GET",
    headers: { "Authorization": `Bearer ${token}` },
  });
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!resp.ok) {
    throw new Error(`DGII ConsultaEstado ${resp.status}: ${JSON.stringify(data).slice(0, 400)}`);
  }
  return data;
}

// ────────────────────────────────────────────────
// API end-to-end: firmar (asumimos ya firmado) y enviar
// ────────────────────────────────────────────────
export async function enviarEcfCompleto(xmlFirmado, cert, privateKey, ambiente) {
  const auth = await authenticate(cert, privateKey, ambiente);
  const recepcion = await enviarEcf(xmlFirmado, auth.token, ambiente);
  return {
    token: auth.token,
    trackId: recepcion.trackId,
    recepcion,
  };
}

// ────────────────────────────────────────────────
// 5. Enviar ANECF (Anulacion) firmado
// ────────────────────────────────────────────────
export async function enviarAnulacion(anecfFirmado, token, ambiente) {
  const url = `${baseUrl(ambiente)}/anulacionrangos/api/operaciones/anularrango`;
  const form = new FormData();
  form.append("xml", new Blob([anecfFirmado], { type: "application/xml" }), "anecf.xml");

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` },
    body: form,
  });
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!resp.ok) {
    throw new Error(`DGII Anulacion ${resp.status}: ${JSON.stringify(data).slice(0, 400)}`);
  }
  return data;
}

// ────────────────────────────────────────────────
// 6. Enviar RFCE (Resumen Facturas Consumo) firmado
// ────────────────────────────────────────────────
export async function enviarRfce(rfceFirmado, token, ambiente, fileName) {
  // OJO: usa host fc.dgii.gov.do (NO ecf.dgii.gov.do) — endpoint
  // separado para resumenes de facturas de consumo.
  const url = `${baseUrlFc(ambiente)}/recepcionfc/api/recepcion/ecf`;

  // CRITICO: el servidor IIS de DGII requiere Content-Length explicito.
  // Sin esto devuelve 411 (Length Required) o 400 con HTML page.
  // Tambien el filename debe ser <RNC><eNCF>.xml.
  const fName = fileName || "rfce.xml";
  const boundary = "----MotoFlowDgii" + Date.now().toString(16);
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="xml"; filename="${fName}"\r\n` +
    `Content-Type: application/xml\r\n\r\n`
  );
  const xmlBytes = enc.encode(rfceFirmado);
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + xmlBytes.length + tail.length);
  body.set(head, 0);
  body.set(xmlBytes, head.length);
  body.set(tail, head.length + xmlBytes.length);

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    body,
  });
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!resp.ok) {
    throw new Error(`DGII RFCE ${resp.status}: ${JSON.stringify(data).slice(0, 400)}`);
  }
  return data;
}

export async function enviarAprobacionComercial(acecfFirmado, token, ambiente, fileName) {
  const url = `${baseUrl(ambiente)}/aprobacioncomercial/api/aprobacioncomercial`;
  const fName = fileName || "acecf.xml";
  const form = new FormData();
  form.append("xml", new Blob([acecfFirmado], { type: "application/xml" }), fName);

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/json",
    },
    body: form,
  });
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!resp.ok) {
    throw new Error(`DGII AprobacionComercial ${resp.status}: ${JSON.stringify(data).slice(0, 400)}`);
  }
  return data;
}
