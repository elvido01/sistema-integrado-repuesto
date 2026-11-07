// =====================================================================
// Página web del colegio (07/11/2026): reglas que comparten la página
// pública (SitioColegioPublico), su configuración y las tareas.
// SQL: sql/centros_educativos_pagina_web.sql
// =====================================================================

export const BUCKET_TAREAS = 'edu-tareas';
export const MAX_ARCHIVO = 10 * 1024 * 1024; // 10 MB (igual que el bucket)

// Extensión → tipo (el bucket solo acepta estos; nada de videos).
export const TIPOS_ARCHIVO = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
export const ACEPTA_ARCHIVOS = Object.keys(TIPOS_ARCHIVO).map((e) => `.${e}`).join(',');

/** Extensión en minúscula ('' si no tiene). */
export function extension(nombre) {
  const m = /\.([a-z0-9]+)$/i.exec(String(nombre || ''));
  return m ? m[1].toLowerCase() : '';
}

/** null si el archivo sirve; si no, el motivo para enseñarle al maestro. */
export function problemaArchivo(file) {
  if (!file) return 'Escoge un archivo';
  const ext = extension(file.name);
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', '3gp', 'm4v'].includes(ext)) {
    return 'Los videos no se suben: ponga el enlace de YouTube.';
  }
  if (!TIPOS_ARCHIVO[ext]) return 'Ese tipo de archivo no se acepta. Use PDF, Word, Excel, PowerPoint o imagen.';
  if (file.size > MAX_ARCHIVO) return `El archivo pesa ${formatoBytes(file.size)}; el máximo es 10 MB.`;
  return null;
}

/** Nombre seguro para la ruta en el bucket (sin tildes ni espacios). */
export function nombreSeguro(nombre) {
  const ext = extension(nombre);
  const base = String(nombre || 'archivo').replace(/\.[^.]+$/, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'archivo';
  return ext ? `${base}.${ext}` : base;
}

export function formatoBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(0)} KB`;
  if (v < 1024 * 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} MB`;
  return `${(v / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** "Colegio Nuestra Señora" → "colegio-nuestra-senora" (lo que pide el slug). */
export function slugDe(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '');
}

/**
 * Dominio limpio como lo guarda la base: sin http, sin www, sin ruta, en
 * minúscula y con la ñ pasada a xn-- (que es como lo manda el navegador).
 */
export function limpiarDominio(texto) {
  let s = String(texto || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^https?:\/\//, '').replace(/[/?#:].*$/, '');
  try { s = new URL(`http://${s}`).hostname; } catch { /* se queda como está */ }
  return s.replace(/^www\./, '');
}

/** ¿Es un dominio de un cliente (no MotoFlow, no Cloudflare, no local)? */
export function esDominioPropio(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h || h === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return false;
  if (h.endsWith('.pages.dev') || h.includes('motoflow')) return false;
  return true;
}

/** El enlace trae una sesión (recuperar contraseña, confirmar correo): va al sistema. */
export function urlDeAutenticacion(hash, search) {
  return /access_token=|type=recovery|error_description=/.test(String(hash || ''))
    || /[?&](code|token_hash)=/.test(String(search || ''));
}

/** Requisitos: uno por línea, sin viñetas ni líneas vacías. */
export function listaRequisitos(texto) {
  return String(texto || '').split(/\r?\n/).map((l) => l.replace(/^\s*([-•*·]|\d+[.)])\s*/, '').trim()).filter(Boolean);
}

/** Número para wa.me: solo dígitos; los de 10 dígitos de RD llevan el 1. */
export function enlaceWhatsapp(numero) {
  const d = String(numero || '').replace(/\D/g, '');
  if (!d) return null;
  return `https://wa.me/${d.length === 10 ? `1${d}` : d}`;
}

/** Enlace de red social: acepta la dirección completa o el @usuario. */
export function enlaceRed(valor, red) {
  const v = String(valor || '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  const usuario = v.replace(/^@/, '').replace(/^(www\.)?(facebook|instagram)\.com\//i, '');
  return red === 'instagram' ? `https://instagram.com/${usuario}` : `https://facebook.com/${usuario}`;
}
