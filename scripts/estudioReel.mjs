// ============================================================
// ESTUDIAR UN REEL MODELO — sacarle la receta
// ============================================================
// (2026-10-04) "Estilo de tus reels": el dueño pega el enlace de un reel que
// le gusta y aquí se convierte en una RECETA que el Creativo puede imitar
// (formato, tomas, guion, texto en pantalla, música). Ver
// sql/equipo_reels_modelo.sql.
//
// Corre en la PC, dentro del worker del Comercial-Creativo, cuando la cola
// está vacía. Usa lo que la PC ya tiene: yt-dlp para bajarlo, ffmpeg para las
// tomas y el audio, Whisper (OpenAI) para la voz y el motor del Creativo
// para mirar y escribir.
//
// >>> SE COPIA LA RECETA, NO EL CONTENIDO <<<
// El reel es de otra tienda. La receta describe CÓMO está hecho; su
// producto, su marca y sus frases quedan en "no_copiar" para que el que lo
// imite sepa qué no tocar.
// ============================================================

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const YTDLP = process.env.YTDLP_CMD || 'yt-dlp';
const FFMPEG = process.env.FFMPEG_CMD || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_CMD || 'ffprobe';
const MAX_TOMAS = 12;

export const FORMATOS_REEL = [
  'comercial_estudio',    // logo, humo, luz de color sobre negro, voz técnica
  'en_las_manos',         // una mano la sostiene frente a la cámara, taller detrás
  'pregunta_que_ensena',  // empieza con una pregunta y explica
  'colores_variantes',    // todas las versiones en fila, letras grandes
  'empaque_detalle',      // la pieza en su empaque, tomas de cerca, compatibles
  'vitrina_giratoria',    // gira sola en un podio con reflejo
  'otro',
];

const correr = (cmd, args, { timeout = 180_000 } = {}) => new Promise((resolve, reject) => {
  const hijo = spawn(cmd, args, { shell: false, windowsHide: true });
  let out = '', err = '';
  const reloj = setTimeout(() => { hijo.kill(); reject(new Error(`${cmd} tardó demasiado`)); }, timeout);
  hijo.stdout.on('data', (d) => { out += d; });
  hijo.stderr.on('data', (d) => { err += d; });
  hijo.on('error', (e) => { clearTimeout(reloj); reject(new Error(`No se pudo ejecutar ${cmd}: ${e.message}`)); });
  hijo.on('close', (code) => {
    clearTimeout(reloj);
    if (code !== 0) return reject(new Error(`${cmd} salió con ${code}: ${(err || out).trim().slice(-300)}`));
    resolve(out);
  });
});

// Los CORTES de verdad: donde cambia la escena. Las tomas se sacan en el
// medio de cada plano, así la receta cuenta los planos que tiene el reel y
// no tramos parejos que parten una toma en dos.
const cortesDe = (archivo) => new Promise((resolve) => {
  const hijo = spawn(FFMPEG, ['-hide_banner', '-i', archivo, '-vf', "select='gt(scene,0.2)',showinfo",
    '-an', '-f', 'null', '-'], { shell: false, windowsHide: true });
  let err = '';
  hijo.stderr.on('data', (d) => { err += d; });
  hijo.on('error', () => resolve([]));
  hijo.on('close', () => {
    const t = [...err.matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1])).filter((x) => x > 0.3);
    // Un fundido dispara varios "cortes" seguidos: cuentan como uno.
    resolve(t.filter((x, i) => i === 0 || x - t[i - 1] >= 0.6));
  });
});

// Los planos a partir de los cortes. Si hay más de MAX_TOMAS, se juntan los
// más cortos (un parpadeo de 0.2 s no es un plano que valga la pena mirar).
const planosDe = (cortes, duracion) => {
  let bordes = [0, ...cortes.filter((c) => c < duracion - 0.3), duracion];
  let planos = bordes.slice(0, -1).map((a, i) => ({ desde: a, hasta: bordes[i + 1] }));
  while (planos.length > MAX_TOMAS) {
    let i = 0;
    planos.forEach((p, k) => { if (p.hasta - p.desde < planos[i].hasta - planos[i].desde) i = k; });
    const j = i === planos.length - 1 ? i - 1 : i + 1;
    const [a, b] = [Math.min(i, j), Math.max(i, j)];
    planos.splice(a, 2, { desde: planos[a].desde, hasta: planos[b].hasta });
  }
  // Un plano largo (vitrina giratoria de 15 s, o fundidos que el detector
  // no ve) se mira cada ~6 s: lo que importa ahí es lo que va cambiando.
  planos = planos.flatMap((p) => {
    const largo = p.hasta - p.desde;
    const partes = Math.min(4, Math.ceil(largo / 6));
    if (partes <= 1) return [p];
    return Array.from({ length: partes }, (_, k) => ({
      desde: p.desde + (k * largo) / partes, hasta: p.desde + ((k + 1) * largo) / partes, mismo_plano: true }));
  }).slice(0, MAX_TOMAS + 2);
  return planos.map((p) => ({ ...p, desde: Math.round(p.desde * 10) / 10, hasta: Math.round(p.hasta * 10) / 10 }));
};

const duracionDe = async (archivo) => {
  const out = await correr(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', archivo]);
  return Number(String(out).trim()) || 0;
};

const tieneAudio = async (archivo) => {
  const out = await correr(FFPROBE, ['-v', 'error', '-select_streams', 'a',
    '-show_entries', 'stream=index', '-of', 'csv=p=0', archivo]);
  return String(out).trim().length > 0;
};

// Whisper con marcas de tiempo. Sin clave o sin audio, el estudio sigue: la
// receta sale de las tomas y se dice que no hubo voz.
const transcribir = async (audio) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { texto: '', segmentos: [], aviso: 'sin OPENAI_API_KEY: no se escuchó la voz' };
  const form = new FormData();
  form.append('file', new Blob([await readFile(audio)], { type: 'audio/mpeg' }), 'audio.mp3');
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  form.append('language', 'es');
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
  });
  if (!r.ok) return { texto: '', segmentos: [], aviso: `Whisper ${r.status}` };
  const j = await r.json();
  // Whisper, con música de fondo, se inventa créditos de subtítulos que
  // nadie dijo ("Subtítulos realizados por la comunidad de Amara.org").
  const inventado = /amara\.org|subt[ií]tulos (realizados|por)/i;
  const segmentos = (j.segments || []).map((s) => ({
    desde: Math.round(s.start * 10) / 10, hasta: Math.round(s.end * 10) / 10, texto: String(s.text || '').trim(),
  })).filter((s) => s.texto && !inventado.test(s.texto));
  return { texto: segmentos.map((s) => s.texto).join(' '), segmentos };
};

export const promptEstudio = ({ duracion, tomas, transcripcion, nota }) => [
  'Eres el director creativo de Repuestos Morla, una tienda de repuestos de moto en Higüey, República Dominicana.',
  `Te paso ${tomas.length} tomas de un reel de OTRA tienda (en orden, con su segundo) y lo que dice la voz.`,
  'Tu trabajo: escribir la RECETA de ese reel para que nuestro equipo haga reels con el mismo formato',
  'pero con NUESTRAS piezas, NUESTRO logo y NUESTROS textos.',
  '',
  `Duración: ${duracion.toFixed(1)} s`,
  'Planos (una imagen por plano, en este orden):',
  ...tomas.map((t) => `  #${t.n}: del segundo ${t.desde} al ${t.hasta}${t.mismo_plano ? ' (tramo de un plano largo o de un fundido suave)' : ''}`),
  '',
  'Voz (Whisper):',
  transcripcion.segmentos.length
    ? transcripcion.segmentos.map((s) => `[${s.desde}-${s.hasta}s] ${s.texto}`).join('\n')
    : '(sin voz: solo música o silencio)',
  ...(nota ? ['', `Nota del dueño sobre este reel: ${nota}`] : []),
  '',
  'Devuelve SOLO un JSON, sin texto alrededor, con esta forma:',
  '{',
  `  "formato": "uno de: ${FORMATOS_REEL.join(', ')}",`,
  '  "titulo": "una línea: qué es este reel (ej. Comercial de estudio de un kit de cilindro)",',
  '  "para_que_piezas": "qué tipo de piezas lucen con este formato y cuáles no",',
  '  "duracion_s": 30,',
  '  "ritmo": "cuántos cortes, rápido o lento, transiciones",',
  '  "escenario": "fondo, luz, colores, superficie, humo, reflejos",',
  '  "voz": { "hay": true, "tono": "...", "estructura": ["gancho: ...", "dato técnico: ...", "cierre: ..."] },',
  '  "texto_en_pantalla": "qué letras salen, cuándo, cómo se animan",',
  '  "musica": "tipo de música y energía",',
  '  "tomas": [ { "seg": "0-3", "que_se_ve": "...", "movimiento": "zoom, giro, paneo, fijo...", "texto": null } ],',
  '  "apertura": "cómo engancha en los primeros 2 segundos",',
  '  "cierre": "cómo termina (marca, llamado a la acción)",',
  '  "lo_que_lo_hace_funcionar": ["...", "..."],',
  '  "no_copiar": ["su marca", "su producto", "sus frases exactas", "..."]',
  '}',
  'Reglas:',
  '- Una entrada en "tomas" por cada plano de la lista, con sus mismos segundos.',
  '- "que_se_ve" describe lo que se ve EN ESTE REEL con nombres genéricos (campana de clutch, mano, humo, logo de la marca),',
  '  sin nombres de marca. NO pongas "Repuestos Morla" en ninguna toma: el logo que sale es el de ellos.',
  '- "texto" es la letra que se LEE en pantalla en ese plano, en plantilla (ej. "+ [VENTAJA]"), o null si no hay.',
  '- "movimiento": lo que hace la cámara o la pieza. Si con una imagen no se sabe, escribe lo más probable y dilo.',
  '- Las estructuras de voz van como PLANTILLA (ej. "Llegó [pieza] para [moto]"), no con sus palabras.',
  'Escribe en español dominicano neutro. Sé concreto: esto lo va a seguir una máquina.',
].join('\n');

/**
 * Estudia un reel. `pensar(prompt, tomas)` es el motor del Creativo:
 * tomas = [{ ruta, b64, mime }]. Devuelve { receta, formato, titulo,
 * duracion, miniatura, avisos }.
 */
export async function estudiarReel({ url, nota = null, pensar, log = () => {} }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'reel-modelo-'));
  const avisos = [];
  try {
    const video = path.join(dir, 'video.mp4');
    await correr(YTDLP, ['--no-playlist', '--no-warnings', '-f', 'bv*[height<=720]+ba/b[height<=720]/b',
      '--merge-output-format', 'mp4', '-o', video, url], { timeout: 240_000 });
    if (!(await stat(video).catch(() => null))) throw new Error('yt-dlp no dejó el video (¿es privado?).');

    const duracion = await duracionDe(video);
    if (!duracion) throw new Error('El video no tiene duración legible.');
    log(`  reel: ${duracion.toFixed(1)} s`);

    // Una toma en el medio de cada plano de verdad.
    const planos = planosDe(await cortesDe(video), duracion);
    log(`  planos: ${planos.length}`);
    const tomas = [];
    for (const [i, p] of planos.entries()) {
      const ruta = path.join(dir, `toma_${String(i + 1).padStart(2, '0')}.jpg`);
      // A veces el video termina antes que el audio y ffmpeg no encuentra
      // imagen en ese segundo (pasó con DPe_HakjkOj): se prueba más atrás y,
      // si tampoco, se sigue sin esa toma.
      let seg = null;
      for (const t of [(p.desde + p.hasta) / 2, p.desde + 0.2, Math.max(0, p.desde - 0.5)]) {
        const ok = await correr(FFMPEG, ['-v', 'error', '-ss', Math.min(duracion - 0.1, t).toFixed(2), '-i', video,
          '-frames:v', '1', '-vf', 'scale=512:-2', '-q:v', '4', '-y', ruta]).then(() => true, () => false);
        if (ok && (await stat(ruta).catch(() => null))?.size) { seg = Math.min(duracion - 0.1, t); break; }
      }
      if (seg === null) continue;
      tomas.push({ n: tomas.length + 1, seg: Math.round(seg * 10) / 10, desde: p.desde, hasta: p.hasta,
        mismo_plano: !!p.mismo_plano, ruta, mime: 'image/jpeg',
        b64: (await readFile(ruta)).toString('base64') });
    }

    if (!tomas.length) throw new Error('No se pudo sacar ninguna imagen del video.');
    const mini = path.join(dir, 'mini.jpg');
    await correr(FFMPEG, ['-v', 'error', '-ss', Math.min(1, duracion / 3).toFixed(2), '-i', video,
      '-frames:v', '1', '-vf', 'scale=240:-2', '-q:v', '6', '-y', mini]);
    const miniatura = `data:image/jpeg;base64,${(await readFile(mini)).toString('base64')}`;

    let transcripcion = { texto: '', segmentos: [] };
    if (await tieneAudio(video)) {
      const audio = path.join(dir, 'audio.mp3');
      await correr(FFMPEG, ['-v', 'error', '-i', video, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', '-y', audio]);
      transcripcion = await transcribir(audio);
      if (transcripcion.aviso) avisos.push(transcripcion.aviso);
      log(`  voz: ${transcripcion.segmentos.length} frase(s)`);
    }

    const bruto = await pensar(promptEstudio({ duracion, tomas, transcripcion, nota }), tomas);
    const limpio = String(bruto || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    let receta;
    try { receta = JSON.parse(limpio.slice(limpio.indexOf('{'), limpio.lastIndexOf('}') + 1)); }
    catch { throw new Error(`El motor no devolvió una receta legible: ${limpio.slice(0, 160)}`); }

    receta.voz_original = transcripcion.texto || null;
    if (avisos.length) receta.avisos = avisos;
    const formato = FORMATOS_REEL.includes(receta.formato) ? receta.formato : 'otro';
    return { receta, formato, titulo: receta.titulo || null, duracion: Math.round(duracion * 10) / 10, miniatura };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// Para probar a mano:  node scripts/estudioReel.mjs <url>   (solo baja y saca tomas)
if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`) {
  const url = process.argv[2];
  const r = await estudiarReel({
    url, log: console.log,
    pensar: async (prompt, tomas) => { console.log(prompt); console.log(tomas.map((t) => t.ruta)); return '{"formato":"otro","titulo":"prueba"}'; },
  });
  console.log({ ...r, miniatura: `${r.miniatura.length} chars` });
}
