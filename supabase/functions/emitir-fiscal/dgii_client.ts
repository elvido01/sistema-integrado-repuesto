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

const DGII_BASES = {
  TesteCF: "https://ecf.dgii.gov.do/testecf",
  CerteCF: "https://ecf.dgii.gov.do/certecf",
  Produccion: "https://ecf.dgii.gov.do/ecf",
};

function baseUrl(ambiente) {
  const url = DGII_BASES[ambiente];
  if (!url) throw new Error(`Ambiente DGII desconocido: ${ambiente}. Use TesteCF | CerteCF | Produccion`);
  return url;
}

// ────────────────────────────────────────────────
// 1. GET semilla
// ────────────────────────────────────────────────
export async function getSemilla(ambiente) {
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
  const url = `${baseUrl(ambiente)}/Autenticacion/api/Autenticacion/ValidarSemilla`;

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
export async function enviarEcf(xmlFirmado, token, ambiente) {
  const url = `${baseUrl(ambiente)}/Recepcion/api/Recepcion/RecepcionECF`;

  const form = new FormData();
  form.append("xml", new Blob([xmlFirmado], { type: "application/xml" }), "ecf.xml");

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
  const url = `${baseUrl(ambiente)}/ConsultaResultado/api/Consultas/Estado?trackId=${encodeURIComponent(trackId)}`;
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
  const url = `${baseUrl(ambiente)}/Anulacion/api/Anulaciones/AnularRangoNCF`;
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
export async function enviarRfce(rfceFirmado, token, ambiente) {
  const url = `${baseUrl(ambiente)}/RFCE/api/RFCE/EnvioFC`;
  const form = new FormData();
  form.append("xml", new Blob([rfceFirmado], { type: "application/xml" }), "rfce.xml");

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` },
    body: form,
  });
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!resp.ok) {
    throw new Error(`DGII RFCE ${resp.status}: ${JSON.stringify(data).slice(0, 400)}`);
  }
  return data;
}
