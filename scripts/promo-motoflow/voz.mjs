// ============================================================
// PROMO MOTOFLOW — voz en off por escena (OpenAI gpt-4o-mini-tts)
// ============================================================
// (20/10/2026) Una pista por escena del guion; la duración de cada escena
// del video sale de su pista (escenas.html se ajusta a estos tiempos).
// La clave es la de Hermes (AppData/Local/hermes/.env), igual que armar.mjs.
//
// Uso: node scripts/promo-motoflow/voz.mjs <carpeta-salida> [--rehacer]
// ============================================================
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const AQUI = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const SALIDA = process.argv[2] || 'C:/RepuestosMorla/Videos/motoflow-promo-01';
const REHACER = process.argv.includes('--rehacer');
const VOZ = 'onyx';
const INSTRUCCIONES = 'Locutor de un anuncio de redes sociales en República Dominicana. Acento dominicano natural, '
  + 'cercano, con energía y confianza, sonrisa en la voz. Ritmo ágil pero claro, sin gritar ni sonar a vendedor exagerado. '
  + 'Las preguntas suenan a pregunta de verdad.';

function clave() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  for (const l of readFileSync('C:/Users/PC/AppData/Local/hermes/.env', 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*OPENAI_API_KEY\s*=\s*"?([^"\s]+)"?/);
    if (m) return m[1];
  }
  throw new Error('Sin OPENAI_API_KEY');
}

const guion = JSON.parse(readFileSync(path.join(AQUI, 'guion.json'), 'utf8'));
mkdirSync(path.join(SALIDA, 'voz'), { recursive: true });
const tiempos = [];
for (const [i, e] of guion.escenas.entries()) {
  const mp3 = path.join(SALIDA, 'voz', `${i + 1}-${e.id}.mp3`);
  if (REHACER || !existsSync(mp3)) {
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clave()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: VOZ, input: e.voz, response_format: 'mp3', instructions: INSTRUCCIONES }),
    });
    if (!r.ok) throw new Error(`TTS ${r.status}: ${(await r.text()).slice(0, 200)}`);
    writeFileSync(mp3, Buffer.from(await r.arrayBuffer()));
  }
  const d = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3]).stdout.toString());
  tiempos.push({ id: e.id, archivo: mp3, dur: Math.round(d * 100) / 100 });
  console.log(`${e.id.padEnd(8)} ${d.toFixed(2)} s`);
}
writeFileSync(path.join(SALIDA, 'tiempos.json'), JSON.stringify(tiempos, null, 2));
console.log('total', tiempos.reduce((s, t) => s + t.dur, 0).toFixed(1), 's');
