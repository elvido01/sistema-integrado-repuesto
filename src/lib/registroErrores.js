// ============================================================
// registroErrores.js — anota en errores_app los errores de la web
// ============================================================
// (10/10/2026) Plan de comercialización. Sin servicios de terceros: los
// errores no controlados (window 'error' y promesas sin catch) van a la
// tabla errores_app (sql/errores_app.sql), que solo lee el superadmin.
//
// Reglas para no molestar ni inundar:
//   • el mismo mensaje se anota UNA vez por sesión;
//   • máximo 20 errores por sesión;
//   • nunca lanza: si falla el insert (sin sesión, sin tabla), se calla.
// Uso explícito en un flujo importante:
//   registrarError('ventas.emitirECF', err, { factura: 12 })
// ============================================================
import { supabase } from '@/lib/customSupabaseClient';

// eslint-disable-next-line no-undef
const VERSION = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'dev';
const vistos = new Set();
let enviados = 0;
const TOPE = 20;

// Ruido conocido del navegador / extensiones que no es de MotoFlow.
const IGNORAR = [
  /ResizeObserver loop/i,
  /Script error\.?$/i,
  /chrome-extension:\/\//i,
  /Failed to fetch dynamically imported module/i, // versión vieja en caché: Ctrl+F5
];

export function registrarError(origen, err, detalle = null) {
  try {
    const mensaje = String(err?.message || err || 'error sin mensaje').slice(0, 2000);
    if (IGNORAR.some((re) => re.test(mensaje))) return;
    const clave = `${origen}|${mensaje}`;
    if (vistos.has(clave) || enviados >= TOPE) return;
    vistos.add(clave);
    enviados += 1;
    const pila = String(err?.stack || '').split('\n').slice(0, 8).join('\n');
    Promise.resolve(
      supabase.from('errores_app').insert({
        origen: String(origen).slice(0, 100),
        mensaje,
        detalle: { ...(detalle || {}), pila: pila || undefined },
        url: typeof location !== 'undefined' ? location.pathname : null,
        version: VERSION,
      })
    ).catch(() => {});
  } catch (_) { /* nunca romper la app por anotar un error */ }
}

export function instalarRegistroErrores() {
  if (typeof window === 'undefined' || window.__mfErroresInstalado) return;
  window.__mfErroresInstalado = true;
  window.addEventListener('error', (e) => {
    registrarError('window', e?.error || e?.message, { archivo: e?.filename, linea: e?.lineno });
  });
  window.addEventListener('unhandledrejection', (e) => {
    registrarError('promesa', e?.reason);
  });
}
