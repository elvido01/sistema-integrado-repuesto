// ============================================================
// PROMO MOTOFLOW — tomas de una persona usando el sistema (gpt-image-2)
// ============================================================
// (20/10/2026) El dueño pidió una escena con una persona usándolo. Se
// generan fotos verticales (1088x1920) de un mostrador de repuestos en RD;
// la pantalla del equipo se deja con una interfaz genérica azul porque
// encima, en escenas.html, flotan las tarjetas reales de MotoFlow.
//
// Uso: node scripts/promo-motoflow/imagenes.mjs <carpeta> [--rehacer]
// ============================================================
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';

const AQUI = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const DIR = process.argv[2] || 'C:/RepuestosMorla/Videos/motoflow-promo-01';
const REHACER = process.argv.includes('--rehacer');

function clave() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  for (const l of readFileSync('C:/Users/PC/AppData/Local/hermes/.env', 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*OPENAI_API_KEY\s*=\s*"?([^"\s]+)"?/);
    if (m) return m[1];
  }
  throw new Error('Sin OPENAI_API_KEY');
}

const COMUN = 'Photorealistic commercial photo, vertical 9:16, shot on a full-frame camera, 35mm lens, shallow depth of field, '
  + 'warm natural light, clean modern look, high detail, no text, no logos, no watermarks. '
  + 'Setting: a tidy motorcycle spare parts store in the Dominican Republic, shelves with boxed parts, tires, chains and oil bottles softly blurred behind. ';

const TOMAS = [
  { id: 'mostrador', prompt: COMUN + 'A friendly Dominican man in his early 30s, short hair, wearing a dark blue polo shirt, stands behind the store counter '
    + 'smiling while using a modern laptop; the laptop screen shows a clean blue-and-white point of sale dashboard (abstract, no readable text). '
    + 'A customer in a motorcycle helmet is slightly out of focus in the foreground holding a boxed brake part. Leave clear empty space in the lower third of the frame.' },
  { id: 'celular', prompt: COMUN + 'Close-up over the shoulder of a young Dominican woman store employee holding a smartphone in one hand, '
    + 'the phone screen shows a clean chat inbox app with colorful round contact icons (abstract, no readable text). She is smiling, '
    + 'the parts counter and shelves are blurred behind. Leave clear empty space in the upper third of the frame.' },
];

mkdirSync(path.join(DIR, 'img'), { recursive: true });
for (const t of TOMAS) {
  const f = path.join(DIR, 'img', `${t.id}.png`);
  if (!REHACER && existsSync(f)) { console.log('ya está', t.id); continue; }
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${clave()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-2', prompt: t.prompt, size: '1088x1920', quality: 'high', n: 1 }),
  });
  if (!r.ok) throw new Error(`imagen ${t.id}: ${r.status} ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  writeFileSync(f, Buffer.from(d.data[0].b64_json, 'base64'));
  // escenas.html las lee al lado suyo
  copyFileSync(f, path.join(AQUI, `toma-${t.id}.png`));
  console.log('ok', t.id, d.usage ? JSON.stringify(d.usage) : '');
}
