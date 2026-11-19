// Testers de la app Android (camino A, 19/11/2026). Piezas puras de la
// función android-tester: se prueban en tests/androidTesters.test.js.

export const PAQUETE_ANDROID = 'com.motoflow.app';
export const ENLACE_PRUEBA = `https://play.google.com/apps/testing/${PAQUETE_ANDROID}`;
export const ENLACE_TIENDA = `https://play.google.com/store/apps/details?id=${PAQUETE_ANDROID}`;
// Plan B (19/11): Play no aceptó el grupo de Cloud Identity (motoflow.com.do);
// el tester de la pista es un grupo gratis de Google Groups al que cada quien
// se une con un toque. Un grupo @googlegroups.com no se maneja por API.
export const ENLACE_GRUPO = 'https://groups.google.com/g/motoflow-android';
const ESPERA_REENVIO_MS = 10 * 60 * 1000;   // no mandar el mismo correo más de una vez cada 10 min
export const TOPE_CORREOS_DIA = 80;         // Resend gratis: 100/día; margen para otros envíos

export function correoValido(email) {
  const e = String(email || '').trim().toLowerCase();
  return e.length <= 120 && /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e) ? e : null;
}

/** ¿Se le puede mandar el correo otra vez? */
export function puedeReenviar(correoEnviadoAt, ahora = Date.now()) {
  if (!correoEnviadoAt) return true;
  const t = Date.parse(correoEnviadoAt);
  return !Number.isFinite(t) || ahora - t >= ESPERA_REENVIO_MS;
}

/** Cloud Identity: 200 = agregado; 409 ALREADY_EXISTS = ya estaba (también vale). */
export function membresiaOk(status, body) {
  if (status >= 200 && status < 300) return true;
  return status === 409 || body?.error?.status === 'ALREADY_EXISTS';
}

/** El correo que le llega a la persona. */
export function correoBienvenida(email) {
  const subject = 'Tu enlace para instalar MotoFlow en Android';
  const text = [
    'Hola:',
    '',
    `Ya estás anotado como tester de MotoFlow con ${email}.`,
    'Desde tu teléfono Android, con esa misma cuenta de Google:',
    '',
    `1. Únete al grupo de testers (pulsa "Unirse al grupo"): ${ENLACE_GRUPO}`,
    `2. Acepta la prueba: ${ENLACE_PRUEBA}`,
    `3. Instala la app: ${ENLACE_TIENDA}`,
    '',
    'Déjala instalada al menos 14 días y ábrela de vez en cuando: así nos ayudas a publicarla para todos.',
    'Si el enlace dice que no tienes acceso, espera unos minutos y vuelve a abrirlo.',
    '',
    'Gracias,',
    'MotoFlow',
  ].join('\n');
  const boton = (href, txt, fondo) => `<a href="${href}" style="display:inline-block;background:${fondo};color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:8px;margin:6px 0">${txt}</a>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
<div style="max-width:480px;margin:0 auto;padding:24px">
<div style="background:#fff;border-radius:12px;padding:24px">
<h2 style="margin:0 0 8px">MotoFlow para Android</h2>
<p style="margin:0 0 16px;color:#4b5563">Ya estás anotado como tester con <b>${email}</b>. Ábrelo desde tu <b>teléfono Android</b> con esa misma cuenta de Google:</p>
<p style="margin:0">1. Únete al grupo de testers (pulsa "Unirse al grupo")</p>
${boton(ENLACE_GRUPO, 'Unirme al grupo', '#2563eb')}
<p style="margin:12px 0 0">2. Acepta la prueba</p>
${boton(ENLACE_PRUEBA, 'Convertirme en tester', '#059669')}
<p style="margin:12px 0 0">3. Instala la app</p>
${boton(ENLACE_TIENDA, 'Instalar desde Google Play', '#111827')}
<p style="margin:16px 0 0;font-size:13px;color:#6b7280">Déjala instalada al menos 14 días y ábrela de vez en cuando: así nos ayudas a publicarla para todos. Si el enlace dice que no tienes acceso, espera unos minutos y vuelve a abrirlo.</p>
</div></div></body></html>`;
  return { subject, text, html };
}
