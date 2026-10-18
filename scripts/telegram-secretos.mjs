// ============================================================
// Copia el bot de Telegram de Hermes a los secretos de Supabase, para que
// las funciones puedan avisarle al dueño al teléfono (18/10/2026: avisos de
// la ventana de 24 h de Instagram/Messenger, omni-avisos-ventana).
// TELEGRAM_CHAT_ID = el único usuario permitido del bot (TELEGRAM_ALLOWED_USERS):
// en un chat privado, el id del chat es el id del usuario.
// Nada se imprime: solo los nombres.
//   node scripts/telegram-secretos.mjs
// ============================================================
import { readFileSync } from 'node:fs';
import { leerToken } from './secretoLocal.mjs';

const ENV = 'C:/Users/PC/AppData/Local/hermes/.env';
const PROD = 'zdvxowpuklbypweyqqki';
const leer = (n) => {
  for (const l of readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const m = l.match(new RegExp(`^\\s*${n}\\s*=\\s*"?([^"\\s]+)"?`));
    if (m) return m[1];
  }
  return null;
};

const token = leer('TELEGRAM_BOT_TOKEN');
const chat = (leer('TELEGRAM_ALLOWED_USERS') || '').split(/[,;]/)[0].trim();
if (!token || !chat) { console.error('Falta TELEGRAM_BOT_TOKEN o TELEGRAM_ALLOWED_USERS en el .env de Hermes'); process.exit(1); }
const r = await fetch(`https://api.supabase.com/v1/projects/${PROD}/secrets`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${leerToken('SUPABASE_ACCESS_TOKEN')}`, 'Content-Type': 'application/json' },
  body: JSON.stringify([{ name: 'TELEGRAM_BOT_TOKEN', value: token }, { name: 'TELEGRAM_CHAT_ID', value: chat }]),
});
console.log(r.ok ? 'Secretos TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID guardados en Supabase' : `Error ${r.status}: ${(await r.text()).slice(0, 200)}`);
