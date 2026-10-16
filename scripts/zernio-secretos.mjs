// ============================================================
// Copia la llave de Zernio del .env de Hermes a los secretos de Supabase y
// crea (una vez) el secreto con el que se firman los avisos del webhook.
// Nada se imprime: solo los nombres.
//   node scripts/zernio-secretos.mjs
// ============================================================
import { readFileSync, appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
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

const llave = leer('ZERNIO_API_KEY');
if (!llave) { console.error('No hay ZERNIO_API_KEY en el .env de Hermes'); process.exit(1); }
let secreto = leer('ZERNIO_WEBHOOK_SECRET');
if (!secreto) {
  secreto = randomBytes(32).toString('hex');
  appendFileSync(ENV, `\nZERNIO_WEBHOOK_SECRET=${secreto}\n`);
  console.log('ZERNIO_WEBHOOK_SECRET creado en el .env de Hermes');
}
const r = await fetch(`https://api.supabase.com/v1/projects/${PROD}/secrets`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${leerToken('SUPABASE_ACCESS_TOKEN')}`, 'Content-Type': 'application/json' },
  body: JSON.stringify([{ name: 'ZERNIO_API_KEY', value: llave }, { name: 'ZERNIO_WEBHOOK_SECRET', value: secreto }]),
});
console.log(r.ok ? 'Secretos ZERNIO_API_KEY y ZERNIO_WEBHOOK_SECRET guardados en Supabase' : `Error ${r.status}: ${(await r.text()).slice(0, 200)}`);
