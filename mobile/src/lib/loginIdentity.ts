// Identidad de login (movil): los colaboradores entran con SOLO un usuario,
// sin correo. Por dentro Supabase Auth usa un email sintetico deterministico:
//     rafa  ->  rafa@usuario.motoflow.app
// Si el texto ya trae '@' se asume que es un correo real (cuentas viejas).
// Debe coincidir con src/lib/loginIdentity.js de la web.
export const USERNAME_EMAIL_DOMAIN = 'usuario.motoflow.app';

export const toLoginEmail = (raw: string): string => {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return '';
  if (v.includes('@')) return v;
  return `${v}@${USERNAME_EMAIL_DOMAIN}`;
};
