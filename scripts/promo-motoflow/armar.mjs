// ============================================================
// PROMO MOTOFLOW — arma el video vertical (1080x1920, 30 fps)
// ============================================================
// (20/10/2026) Anuncio para redes con el enlace de registro (15 días gratis)
// en el primer comentario. Pantallas animadas con datos de ejemplo
// (escenas.html), voz IA (voz.mjs) y música de Hermes.
//
//   node scripts/promo-motoflow/voz.mjs   <carpeta>     ← primero, la voz
//   node scripts/promo-motoflow/armar.mjs <carpeta>
//
// Pasos: limpia y acelera un poco cada pista de voz → calcula la línea de
// tiempo (cada escena dura lo que su voz) → captura los cuadros con el
// navegador → mezcla voz + música → video.mp4 y portada.jpg en <carpeta>.
// ============================================================
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const AQUI = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const DIR = process.argv[2] || 'C:/RepuestosMorla/Videos/motoflow-promo-01';
const BROWSER = 'C:/Users/PC/.claude/skills/browser-automation/browser.mjs';
const MUSICA = 'C:/Users/PC/AppData/Local/hermes/equipo/musica/electronica-energetica.mp3';
const TEMPO = 1.06;        // la voz de la IA es pausada para un anuncio
const AIRE = 0.35;         // silencio entre escenas
const COLA = 1.6;          // la última escena se queda un poco más

const run = (cmd, args, env) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${cmd}: ${(r.stderr || r.stdout || '').slice(-800)}`);
  return r.stdout;
};
const dur = (f) => Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]));

const tiempos = JSON.parse(readFileSync(path.join(DIR, 'tiempos.json'), 'utf8'));
const TMP = path.join(DIR, 'tmp'); mkdirSync(TMP, { recursive: true });

// 1. Voz: sin silencios en las puntas, un poco más ágil, nivelada.
let t = 0.4;
const escenas = [];
for (const [i, v] of tiempos.entries()) {
  const wav = path.join(TMP, `v${i + 1}.wav`);
  run('ffmpeg', ['-v', 'error', '-y', '-i', v.archivo, '-af', [
    'silenceremove=start_periods=1:start_threshold=-45dB',
    'areverse', 'silenceremove=start_periods=1:start_threshold=-45dB', 'areverse',
    `atempo=${TEMPO}`, 'loudnorm=I=-15:TP=-1.5:LRA=9',
  ].join(','), '-ar', '48000', '-ac', '1', wav]);
  const d = dur(wav);
  const ultima = i === tiempos.length - 1;
  const largo = d + (ultima ? COLA : AIRE);
  escenas.push({ id: v.id, inicio: Math.round(t * 100) / 100, dur: Math.round(largo * 100) / 100, wav, voz: d });
  t += largo;
}
const total = Math.round(t * 100) / 100;
writeFileSync(path.join(DIR, 'linea.json'), JSON.stringify({ total, escenas }, null, 2));
console.log('Línea de tiempo:', escenas.map((e) => `${e.id} ${e.inicio}s`).join(' · '), `· total ${total}s`);

// --vista: solo unos cuadros sueltos (uno al final de cada escena) para revisar.
const VISTA = process.argv.includes('--vista')
  ? escenas.map((e) => (e.inicio + e.dur - 0.5).toFixed(2)).join(',') : '';

// 2. Cuadros
const url = 'file:///' + path.join(AQUI, 'escenas.html').replace(/\\/g, '/');
console.log('Capturando cuadros…');
console.log(run('node', [BROWSER, url, '--script', path.join(AQUI, 'cuadros.mjs'), '--timeout', '60000'], { PROMO_DIR: DIR, PROMO_VISTA: VISTA }).split('\n').filter((l) => /script|cuadros|error/i.test(l)).join('\n'));

if (VISTA) { console.log('Vista en', path.join(DIR, 'cuadros')); process.exit(0); }

// 3. Audio: cada voz en su inicio + música por debajo que se apaga al final.
const entradas = [];
const filtros = [];
escenas.forEach((e, i) => {
  entradas.push('-i', e.wav);
  filtros.push(`[${i}:a]adelay=${Math.round(e.inicio * 1000)}|${Math.round(e.inicio * 1000)}[v${i}]`);
});
const im = escenas.length;
entradas.push('-stream_loop', '-1', '-i', MUSICA);
filtros.push(`${escenas.map((_, i) => `[v${i}]`).join('')}amix=inputs=${im}:normalize=0[voz]`);
filtros.push(`[${im}:a]atrim=0:${total},volume=0.16,afade=t=in:d=0.6,afade=t=out:st=${(total - 1.8).toFixed(2)}:d=1.8[mus]`);
filtros.push(`[voz][mus]amix=inputs=2:normalize=0,alimiter=limit=0.95[a]`);
const audio = path.join(TMP, 'audio.wav');
run('ffmpeg', ['-v', 'error', '-y', ...entradas, '-filter_complex', filtros.join(';'), '-map', '[a]', '-t', String(total), '-ar', '48000', audio]);

// 4. Video final
const mp4 = path.join(DIR, 'video.mp4');
run('ffmpeg', ['-v', 'error', '-y', '-framerate', '30', '-i', path.join(DIR, 'cuadros', 'c%05d.jpg'), '-i', audio,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
  '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', mp4]);
// Portada: el precio con los 15 días gratis ya en pantalla.
const p = escenas.find((e) => e.id === 'precio');
run('ffmpeg', ['-v', 'error', '-y', '-ss', String(p.inicio + 3.4), '-i', mp4, '-frames:v', '1', '-q:v', '2', path.join(DIR, 'portada.jpg')]);
console.log('Listo:', mp4, `${dur(mp4).toFixed(1)} s`);
