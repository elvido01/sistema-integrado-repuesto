// ============================================================
// VIDEO LARGO HORIZONTAL CON VOZ EN OFF (1920x1080) — Repuestos Morla
// ============================================================
// (16/10/2026) Videos informativos de 4 a 8 minutos para el canal de
// YouTube (2 por semana). El dueño lee el guion con su micrófono en el
// grabador (grabador.mjs) y aquí se monta: por sección, fondo con la foto
// desenfocada, número, título y puntos que van apareciendo, fotos de los
// productos reales de la tienda y SU voz. Sección sin grabar → voz de IA
// (OpenAI, la que ya se paga para los reels) para no detenerse.
//
// Carpeta de cada video (C:\RepuestosMorla\Videos\NN-tema\):
//   guion.json   titulo, secciones[{id,titulo,puntos,productos,voz}], miniatura
//   fotos.json   { "DESCRIPCION DEL PRODUCTO": "url de la foto" }
//   voz\sN.wav   la grabación del dueño de la sección N (la deja el grabador)
//   salida\      video.mp4 y miniatura.jpg
//
// Uso suelto: node scripts/video-largo/armar.mjs "C:\RepuestosMorla\Videos\01-aceite"
// ============================================================
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HERMES = 'C:/Users/PC/AppData/Local/hermes';
const FUENTES = `${HERMES}/equipo/fuentes`;
const MUSICA = `${HERMES}/equipo/musica`;
const TITULO = `${FUENTES}/BarlowCondensed-BlackItalic.ttf`;
const TEXTO = `${FUENTES}/BarlowCondensed-Bold.ttf`;
const W = 1920, H = 1080, FPS = 30;
const ORO = '0xFFB21E', PLATA = '0xF4F4F4', NARANJA = '0xF5A623';
const LOGO_URL = 'https://zdvxowpuklbypweyqqki.supabase.co/storage/v1/object/public/product-images/company/logo_empresa_1774028578651.png';
const WHATSAPP = '809-390-5965';
const FFMPEG = process.env.FFMPEG_CMD || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_CMD || 'ffprobe';
const VOZ_IA = 'onyx';
const INSTRUCCIONES_IA = 'Eres el dueño de una tienda de repuestos de moto en República Dominicana explicándole a tus clientes en un video de YouTube. '
  + 'Tono cercano, claro y seguro, como hablando en el mostrador con un cliente de confianza. Acento dominicano natural. '
  + 'Ritmo medio, pausas naturales entre ideas. Nada de locutor de anuncio ni de exagerar.';

export const correr = (cmd, args) => new Promise((res, rej) => {
  const h = spawn(cmd, args, { windowsHide: true }); let err = '';
  h.stderr.on('data', (d) => { err += d; });
  h.on('error', (e) => rej(new Error(`No se pudo ejecutar ${cmd}: ${e.message}`)));
  h.on('close', (c) => (c === 0 ? res() : rej(new Error(`${cmd}: ${err.slice(-600)}`))));
});
const salida = (cmd, args) => new Promise((res, rej) => {
  const h = spawn(cmd, args, { windowsHide: true }); let out = '';
  h.stdout.on('data', (d) => { out += d; });
  h.on('close', (c) => (c === 0 ? res(out) : rej(new Error(cmd))));
});
export const duracion = async (f) => Number(await salida(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]));
const rf = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:');

function claveOpenAI() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  try {
    for (const l of readFileSync(`${HERMES}/.env`, 'utf8').split(/\r?\n/)) {
      const m = l.match(/^\s*OPENAI_API_KEY\s*=\s*"?([^"\s]+)"?/);
      if (m) return m[1];
    }
  } catch { /* sin .env */ }
  return null;
}

// Limpia la grabación del micrófono: quita el ruido de fondo y los silencios
// del principio y del final, acorta las pausas largas (deja medio segundo),
// comprime un poco y nivela a -16 LUFS (lo normal para voz en YouTube).
export async function limpiarGrabacion(entrada, salidaWav) {
  await correr(FFMPEG, ['-v', 'error', '-y', '-i', entrada, '-af', [
    'highpass=f=80', 'afftdn=nf=-25',
    'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15',
    'areverse', 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.3', 'areverse',
    'silenceremove=stop_periods=-1:stop_duration=0.9:stop_threshold=-45dB:stop_silence=0.5',
    'acompressor=threshold=-20dB:ratio=3:attack=10:release=200',
    'loudnorm=I=-16:TP=-1.5:LRA=11',
  ].join(','), '-ar', '48000', '-ac', '1', salidaWav]);
  return duracion(salidaWav);
}

export function leerVideo(dir) {
  const guion = JSON.parse(readFileSync(path.join(dir, 'guion.json'), 'utf8'));
  const fotos = existsSync(path.join(dir, 'fotos.json')) ? JSON.parse(readFileSync(path.join(dir, 'fotos.json'), 'utf8')) : {};
  return { guion, fotos };
}
export const archivoVoz = (dir, i) => path.join(dir, 'voz', `s${i}.wav`);

export async function armarVideo(dir, { log = console.log } = {}) {
  const TMP = path.join(dir, 'tmp'); mkdirSync(TMP, { recursive: true });
  const OUT = path.join(dir, 'salida'); mkdirSync(OUT, { recursive: true });
  let nt = 0;
  const txt = (t) => { nt += 1; const f = path.join(TMP, `t${nt}.txt`); writeFileSync(f, t, 'utf8'); return rf(f); };
  const bajar = async (url, f) => {
    if (!existsSync(f)) writeFileSync(f, Buffer.from(await (await fetch(url)).arrayBuffer()));
    return f;
  };
  async function vozIA(texto, f) {
    if (existsSync(f)) return f;
    const key = claveOpenAI();
    if (!key) throw new Error('Falta tu grabación de una sección y no hay clave de OpenAI para la voz de respaldo.');
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: VOZ_IA, input: texto, response_format: 'mp3', instructions: INSTRUCCIONES_IA }),
    });
    if (!r.ok) throw new Error(`Voz de IA: ${r.status} ${(await r.text()).slice(0, 200)}`);
    writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    return f;
  }
  // Título como en las piezas: primera parte plata, última palabra en oro.
  function titulo(texto, { x, y, tam, alpha }) {
    const p = texto.trim().split(/\s+/); const acento = p.pop(); const resto = p.join(' ');
    const c = `fontfile='${rf(TITULO)}':expansion=none:borderw=4:bordercolor=0x0a0a0a@0.85:shadowcolor=black@0.7:shadowx=4:shadowy=6:alpha='${alpha}'`;
    const f = [];
    if (resto) f.push(`drawtext=${c}:textfile='${txt(resto)}':fontsize=${Math.round(tam * 0.8)}:fontcolor=${PLATA}:x=${x}:y=${y}`);
    f.push(`drawtext=${c}:textfile='${txt(acento)}':fontsize=${tam}:fontcolor=${ORO}:x=${x}:y=${resto ? `${y}+${Math.round(tam * 0.82)}` : y}`);
    return f;
  }

  async function seccion(s, i, fotosLocales, fondo, logo, d) {
    const n = Math.round(d * FPS);
    // Sin productos propios, los de la tienda van rotando a la derecha.
    let prods = (s.productos || []).map((p) => fotosLocales[p]).filter(Boolean);
    const todas = Object.values(fotosLocales);
    if (!prods.length && s.id !== 'cierre' && todas.length) prods = [todas[i % todas.length], todas[(i + 1) % todas.length]].filter((v, k, a) => a.indexOf(v) === k);
    const entradas = ['-loop', '1', '-t', d.toFixed(2), '-i', fondo, '-loop', '1', '-t', d.toFixed(2), '-i', logo];
    for (const p of prods) entradas.push('-loop', '1', '-t', d.toFixed(2), '-i', p);
    const ancho = s.id === 'cierre' || s.id === 'gancho' ? W : 1080;
    const g = [`[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=30:2,eq=brightness=-0.32:saturation=0.85,setsar=1,`
      + `drawbox=x=0:y=0:w=${ancho}:h=${H}:color=black@0.45:t=fill,drawbox=x=96:y=${H - 70}:w=520:h=4:color=${NARANJA}@0.9:t=fill[b0]`];
    let v = '[b0]';
    prods.forEach((_, k) => {
      if (s.id === 'gancho') {
        const x = Math.round(W / 2 - (prods.length * 520) / 2 + k * 520 + 30);
        g.push(`[${k + 2}:v]scale=w=460:h=560:force_original_aspect_ratio=decrease,pad=iw+16:ih+16:8:8:color=${NARANJA},format=rgba,`
          + `fade=t=in:st=${(0.3 + k * 0.5).toFixed(2)}:d=0.4:alpha=1[p${k}]`);
        g.push(`${v}[p${k}]overlay=x=${x}:y=${Math.round(H * 0.34)}[o${k}]`);
      } else {
        const t0 = (d / prods.length) * k, t1 = (d / prods.length) * (k + 1);
        g.push(`[${k + 2}:v]scale=w=600:h=740:force_original_aspect_ratio=decrease,pad=iw+16:ih+16:8:8:color=${NARANJA},format=rgba,`
          + `fade=t=in:st=${t0.toFixed(2)}:d=0.35:alpha=1,fade=t=out:st=${Math.max(t0, t1 - 0.35).toFixed(2)}:d=0.35:alpha=1[p${k}]`);
        g.push(`${v}[p${k}]overlay=x=1180+(640-w)/2:y=(${H}-h)/2+40:enable='between(t,${t0.toFixed(2)},${t1.toFixed(2)})'[o${k}]`);
      }
      v = `[o${k}]`;
    });
    const f = [];
    if (s.id === 'gancho') {
      f.push(...titulo(s.titulo.toUpperCase(), { x: '(w-text_w)/2', y: 'h*0.06', tam: 120, alpha: 'min(1,t/0.4)' }));
    } else if (s.id === 'cierre') {
      f.push(`drawtext=fontfile='${rf(TITULO)}':expansion=none:textfile='${txt('REPUESTOS MORLA · HIGÜEY')}':fontsize=110:fontcolor=${ORO}:borderw=4:bordercolor=black@0.8:x=(w-text_w)/2:y=h*0.60:alpha='min(1,t/0.5)'`);
      f.push(`drawtext=fontfile='${rf(TEXTO)}':expansion=none:textfile='${txt(`WhatsApp ${WHATSAPP}  ·  Suscríbete para más`)}':fontsize=60:fontcolor=white:x=(w-text_w)/2:y=h*0.75:alpha='if(lt(t,1),0,min(1,t-1))'`);
    } else {
      f.push(`drawtext=fontfile='${rf(TEXTO)}':expansion=none:textfile='${txt(String(i).padStart(2, '0'))}':fontsize=54:fontcolor=${NARANJA}:x=100:y=110:alpha='min(1,t/0.3)'`);
      f.push(...titulo(s.titulo.toUpperCase(), { x: 100, y: 170, tam: 104, alpha: 'min(1,t/0.4)' }));
      (s.puntos || []).forEach((p, k) => {
        const t0 = ((d - 1) / (s.puntos.length + 0.5)) * (k + 0.6);
        const a = `if(lt(t,${t0.toFixed(2)}),0,min(1,(t-${t0.toFixed(2)})/0.3))`;
        const y = 470 + k * 120;
        f.push(`drawbox=x=104:y=${y + 18}:w=26:h=26:color=${NARANJA}:t=fill:enable='gte(t,${t0.toFixed(2)})'`);
        f.push(`drawtext=fontfile='${rf(TEXTO)}':expansion=none:textfile='${txt(p)}':fontsize=66:fontcolor=white:borderw=3:bordercolor=black@0.7:x=160:y=${y}:alpha='${a}'`);
      });
    }
    f.push(`drawtext=fontfile='${rf(TEXTO)}':expansion=none:textfile='${txt('Repuestos Morla · Higüey')}':fontsize=40:fontcolor=0xDDDDDD:x=100:y=${H - 130}`);
    g.push(`${v}${f.join(',')}[tx]`);
    g.push('[1:v]scale=200:-1,format=rgba,colorchannelmixer=aa=0.9[lg]');
    g.push(`[tx][lg]overlay=x=W-w-50:y=40,fade=t=in:st=0:d=0.3,fade=t=out:st=${(d - 0.3).toFixed(2)}:d=0.3[out]`);
    const gf = path.join(TMP, `g${i}.txt`); writeFileSync(gf, g.join(';'), 'utf8');
    const out = path.join(TMP, `s${i}.mp4`);
    await correr(FFMPEG, ['-v', 'error', '-y', ...entradas, '-filter_complex_script', gf, '-map', '[out]', '-frames:v', String(n),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-r', String(FPS), out]);
    return out;
  }

  async function miniatura(guion, fotosLocales, fondo, logo) {
    const m = guion.miniatura || {};
    const ps = (m.productos || []).map((p) => fotosLocales[p]).filter(Boolean);
    const p1 = ps[0] || Object.values(fotosLocales)[0], p2 = ps[1] || Object.values(fotosLocales)[1] || p1;
    const g = [
      '[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,boxblur=20:2,eq=brightness=-0.35,drawbox=x=0:y=0:w=760:h=720:color=black@0.5:t=fill[b]',
      '[2:v]scale=w=380:h=560:force_original_aspect_ratio=decrease[a]', '[3:v]scale=w=340:h=500:force_original_aspect_ratio=decrease[c]',
      '[b][c]overlay=x=760:y=170[b1]', '[b1][a]overlay=x=900:y=110[b2]',
      `[b2]drawtext=fontfile='${rf(TITULO)}':expansion=none:textfile='${txt(m.linea1 || '')}':fontsize=118:fontcolor=${PLATA}:borderw=6:bordercolor=black:x=40:y=150,`
        + `drawtext=fontfile='${rf(TITULO)}':expansion=none:textfile='${txt(m.linea2 || guion.titulo)}':fontsize=150:fontcolor=${ORO}:borderw=6:bordercolor=black:x=40:y=270,`
        + `drawtext=fontfile='${rf(TEXTO)}':expansion=none:textfile='${txt(m.banda || 'REPUESTOS MORLA')}':fontsize=64:fontcolor=white:box=1:boxcolor=0xC62828:boxborderw=14:x=48:y=470[b3]`,
      '[1:v]scale=170:-1[lg]', '[b3][lg]overlay=x=40:y=24[out]',
    ];
    const gf = path.join(TMP, 'gmini.txt'); writeFileSync(gf, g.join(';'), 'utf8');
    await correr(FFMPEG, ['-v', 'error', '-y', '-i', fondo, '-i', logo, '-i', p1, '-i', p2, '-filter_complex_script', gf,
      '-map', '[out]', '-frames:v', '1', path.join(OUT, 'miniatura.jpg')]);
  }

  const { guion, fotos } = leerVideo(dir);
  const fotosLocales = {};
  for (const [k, u] of Object.entries(fotos)) {
    fotosLocales[k] = await bajar(u, path.join(TMP, `f_${k.replace(/[^A-Z0-9]+/gi, '_')}.jpg`));
  }
  if (!Object.keys(fotosLocales).length) throw new Error('El video no tiene fotos de productos (fotos.json).');
  const logo = await bajar(LOGO_URL, path.join(TMP, 'logo.png'));
  const listaFotos = Object.values(fotosLocales);

  const clips = [], audios = [], avisos = [];
  let total = 0;
  for (const [i, s] of guion.secciones.entries()) {
    let a = archivoVoz(dir, i);
    if (!existsSync(a)) {
      a = await vozIA(s.voz, path.join(TMP, `ia${i}.mp3`));
      avisos.push(`Sección ${i} (${s.titulo}) va con voz de IA: no estaba grabada.`);
    }
    const d = (await duracion(a)) + 0.9;
    log(`Sección ${i} · ${s.titulo}: ${d.toFixed(1)} s${a.includes(`${path.sep}tmp${path.sep}ia`) ? ' (voz IA)' : ' (tu voz)'}`);
    clips.push(await seccion(s, i, fotosLocales, listaFotos[i % listaFotos.length], logo, d));
    audios.push({ a, d });
    total += d;
  }
  log('Uniendo las secciones…');
  const lista = path.join(TMP, 'lista.txt');
  writeFileSync(lista, clips.map((c) => `file '${c.replace(/\\/g, '/')}'`).join('\n'));
  const mudo = path.join(TMP, 'mudo.mp4');
  await correr(FFMPEG, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', mudo]);

  // Voz: cada sección entra 0.4 s después de su corte; música baja que se
  // agacha sola cuando hablas.
  const ins = [], fx = []; let t = 0;
  audios.forEach(({ a, d }, k) => { ins.push('-i', a); fx.push(`[${k + 1}:a]aresample=48000,adelay=${Math.round((t + 0.4) * 1000)}:all=1[a${k}]`); t += d; });
  const nV = audios.length;
  const musica = existsSync(MUSICA) ? readdirSync(MUSICA).filter((f) => /\.(mp3|m4a|wav)$/i.test(f)) : [];
  let mezcla = `${audios.map((_, k) => `[a${k}]`).join('')}amix=inputs=${nV}:normalize=0[voz]`;
  if (musica.length) {
    ins.push('-stream_loop', '-1', '-i', path.join(MUSICA, musica[Math.floor(Math.random() * musica.length)]));
    mezcla += `;[voz]asplit=2[v1][vsc];[${nV + 1}:a]volume=0.20,afade=t=out:st=${(total - 2).toFixed(2)}:d=2[m0];`
      + '[m0][vsc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[m];[v1][m]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5[a]';
  } else {
    mezcla += ';[voz]loudnorm=I=-14:TP=-1.5[a]';
  }
  const fxf = path.join(TMP, 'audio.txt'); writeFileSync(fxf, [...fx, mezcla].join(';'));
  const final = path.join(OUT, 'video.mp4');
  log('Poniendo la voz y la música…');
  await correr(FFMPEG, ['-v', 'error', '-y', '-i', mudo, ...ins, '-filter_complex_script', fxf, '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', total.toFixed(2), '-movflags', '+faststart', final]);
  log('Haciendo la miniatura…');
  await miniatura(guion, fotosLocales, listaFotos[0], logo);
  return { video: final, miniatura: path.join(OUT, 'miniatura.jpg'), minutos: total / 60, avisos };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const dir = process.argv[2];
  if (!dir) { console.error('Uso: node armar.mjs "C:\\RepuestosMorla\\Videos\\01-aceite"'); process.exit(1); }
  const r = await armarVideo(dir);
  console.log(`LISTO ${r.video} (${r.minutos.toFixed(1)} min)`);
  r.avisos.forEach((a) => console.log(`AVISO ${a}`));
}
