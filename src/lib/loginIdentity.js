// Identidad de login: permite que los colaboradores entren con SOLO un nombre
// de usuario (sin correo). Por dentro Supabase Auth necesita un email unico, asi
// que derivamos un "email sintetico" deterministico a partir del usuario:
//     rafa  ->  rafa@usuario.motoflow.app
// Ese correo NO es real y nunca se le envia nada; es solo el identificador.
//
// Compatibilidad: si el texto ya trae '@' se asume que es un correo real (las
// cuentas viejas siguen entrando con su correo de siempre).
export const USERNAME_EMAIL_DOMAIN = 'usuario.motoflow.app';

// Convierte lo que el usuario teclea (usuario o correo) al email de login.
export const toLoginEmail = (raw) => {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return '';
  if (v.includes('@')) return v; // ya es un correo real
  return `${v}@${USERNAME_EMAIL_DOMAIN}`;
};

// Usuario valido: letras/numeros/._- (min 3). Sin espacios ni @.
export const isUsernameValido = (raw) => /^[a-z0-9._-]{3,}$/.test(String(raw || '').trim().toLowerCase());

// Para mostrar: si el email es sintetico, devuelve solo el usuario.
export const usernameDesdeEmail = (email) => {
  const v = String(email || '').toLowerCase();
  const suf = `@${USERNAME_EMAIL_DOMAIN}`;
  return v.endsWith(suf) ? v.slice(0, -suf.length) : v;
};
