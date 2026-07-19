// Utilidades puras de JID/teléfono de WhatsApp (sin DOM — testeables).
// El JID es el identificador real del chat: <telefono>@c.us (individual),
// <id>@g.us (grupo). El teléfono del JID es la ÚNICA fuente confiable de
// número para contactos guardados (el título del chat trae el nombre).

// '18097695965@c.us' → { phone, tipo:'individual' } | '@g.us' → grupo
export function parseJid(jid) {
  const s = String(jid || '').trim();
  if (!s) return { phone: null, tipo: 'desconocido' };
  if (/@g\.us$/i.test(s)) return { phone: null, tipo: 'grupo' };
  const m = s.match(/^(\d{7,15})@(c\.us|s\.whatsapp\.net)$/i);
  if (m) return { phone: m[1], tipo: 'individual' };
  return { phone: null, tipo: 'desconocido' };
}

// Solo dígitos, conservando el código de país tal como venga (18097695965)
export function normalizarDigitosIntl(valor) {
  return String(valor || '').replace(/\D/g, '');
}

// data-id legacy de WhatsApp Web: 'false_18095551234@c.us_HASH' (el formato
// nuevo es solo hex y no trae número). Ignora grupos (@g.us).
export function extraerTelefonoLegacyDataId(dataId) {
  const m = String(dataId || '').match(/(?:true|false)_(\d{7,15})@c\.us/i);
  return m ? m[1] : null;
}

// Réplica exacta del name-key del espejo (whatsappDom.js):
// lower → [^a-z0-9]+ → '-' → trim '-' → 40 chars. Sirve para que el servidor
// migre la conversación vieja 'whatsapp:name:<slug>' cuando aparece el número.
export function slugNombreChat(nombre) {
  const slug = String(nombre || 'chat')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'chat';
}

// Regla del directorio de contactos: solo se pisa el nombre cuando el actual
// está vacío o es un teléfono disfrazado de nombre y el nuevo es un nombre real.
export function nombreMasUtil(actual, nuevo) {
  const a = String(actual || '').trim();
  const n = String(nuevo || '').trim();
  if (!n || /^\+?[\d\s()-]+$/.test(n)) return false;
  return !a || /^\+?[\d\s()-]+$/.test(a);
}
