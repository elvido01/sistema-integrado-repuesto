// ============================================================
// ¿QUÉ PIEZA ANUNCIA EL SUPLIDOR?
// ============================================================
// (2026-10-04) "Lo que anuncia tu suplidor" (sql/videos_del_suplidor.sql):
// el dueño pega el reel de Pedro Racing y aquí se averigua QUÉ pieza es,
// para buscarla en el catálogo. Corre en el worker del Comercial-Creativo,
// con la cola vacía, igual que el estudio de los reels modelo.
//
// Mira tres cosas: el texto de la publicación (suele nombrar la pieza), lo
// que dice la voz y 6 tomas. Devuelve la pieza en palabras de mostrador
// dominicano ("BANDA DELANTERA PLATINA"), que es como está escrito el
// catálogo; con eso la base busca candidatas y el dueño confirma.
// ============================================================

import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { correr, duracionDe, tieneAudio, transcribir, cortesDe, planosDe } from './estudioReel.mjs';

const YTDLP = process.env.YTDLP_CMD || 'yt-dlp';
const FFMPEG = process.env.FFMPEG_CMD || 'ffmpeg';

export const promptPieza = ({ texto, cuenta, transcripcion, tomas }) => [
  'Eres dependiente experto de una tienda de repuestos de moto en República Dominicana.',
  `Un suplidor mayorista${cuenta ? ` (${cuenta})` : ''} publicó este video anunciando una pieza.`,
  'Dime QUÉ pieza es, para buscarla en nuestro catálogo.',
  '',
  'Texto de la publicación:', texto ? texto.slice(0, 1500) : '(sin texto)',
  '',
  'Voz:', transcripcion || '(sin voz)',
  '',
  `Van ${tomas} imágenes del video, en orden.`,
  '',
  'Devuelve SOLO este JSON:',
  '{',
  '  "es_pieza": true,',
  '  "pieza": "nombre de la pieza en español, claro (ej. protector decorativo de barras de horquilla)",',
  '  "busqueda": "2 a 5 palabras como estaría escrita en el catálogo de una tienda dominicana, en MAYÚSCULAS',
  '               (ej. PROTECTOR BARRA, BANDA DELANTERA PLATINA, CULATA CG150)",',
  '  "marca": "marca visible o null",',
  '  "motos": ["modelos de moto que se ven o se nombran"],',
  '  "colores": ["colores en que se ve"],',
  '  "notas": "una línea con lo que distingue la pieza"',
  '}',
  'Si el video no anuncia una pieza concreta (es un saludo, una moto completa, un evento), pon "es_pieza": false.',
  'No inventes: si no se sabe la marca o la moto, null o lista vacía.',
].join('\n');

/**
 * Estudia el video del suplidor. `pensar(prompt, tomas)` es el motor del
 * Creativo. Devuelve { pieza, busqueda, detalles, cuenta, texto, miniatura }.
 */
export async function estudiarVideoSuplidor({ url, pensar, log = () => {} }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'video-suplidor-'));
  try {
    const video = path.join(dir, 'video.mp4');
    await correr(YTDLP, ['--no-playlist', '--no-warnings', '--write-info-json',
      '-f', 'bv*[height<=720]+ba/b[height<=720]/b', '--merge-output-format', 'mp4', '-o', video, url],
    { timeout: 240_000 });
    if (!(await stat(video).catch(() => null))) throw new Error('yt-dlp no dejó el video (¿es privado?).');

    // El texto de la publicación y quién la hizo, del info.json de yt-dlp.
    let info = {};
    try { info = JSON.parse(await readFile(path.join(dir, 'video.info.json'), 'utf8')); } catch { /* sin info */ }
    const texto = String(info.description || '').trim();
    const cuenta = info.channel || info.uploader_id || info.uploader || null;

    const duracion = await duracionDe(video);
    const planos = planosDe(await cortesDe(video), duracion).slice(0, 6);
    const tomas = [];
    for (const [i, p] of planos.entries()) {
      const ruta = path.join(dir, `toma_${i + 1}.jpg`);
      const ok = await correr(FFMPEG, ['-v', 'error', '-ss', Math.min(duracion - 0.2, (p.desde + p.hasta) / 2).toFixed(2),
        '-i', video, '-frames:v', '1', '-vf', 'scale=512:-2', '-q:v', '4', '-y', ruta]).then(() => true, () => false);
      if (ok && (await stat(ruta).catch(() => null))?.size) {
        tomas.push({ ruta, seg: p.desde, mime: 'image/jpeg', b64: (await readFile(ruta)).toString('base64') });
      }
    }
    if (!tomas.length) throw new Error('No se pudo sacar ninguna imagen del video.');

    const mini = path.join(dir, 'mini.jpg');
    await correr(FFMPEG, ['-v', 'error', '-ss', Math.min(1.5, duracion / 3).toFixed(2), '-i', video,
      '-frames:v', '1', '-vf', 'scale=240:-2', '-q:v', '6', '-y', mini]);
    const miniatura = `data:image/jpeg;base64,${(await readFile(mini)).toString('base64')}`;

    let voz = '';
    if (await tieneAudio(video)) {
      const audio = path.join(dir, 'audio.mp3');
      await correr(FFMPEG, ['-v', 'error', '-i', video, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', '-y', audio]);
      voz = (await transcribir(audio)).texto || '';
    }
    log(`  video del suplidor: ${duracion.toFixed(1)} s, ${tomas.length} tomas, texto ${texto.length} letras`);

    const bruto = await pensar(promptPieza({ texto, cuenta, transcripcion: voz, tomas: tomas.length }), tomas);
    const t = String(bruto || '');
    let j;
    try { j = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); }
    catch { throw new Error(`El motor no dijo qué pieza es: ${t.slice(0, 160)}`); }

    const pieza = j.es_pieza === false ? 'No anuncia una pieza concreta' : String(j.pieza || '').trim();
    return {
      pieza,
      busqueda: j.es_pieza === false ? '' : String(j.busqueda || j.pieza || '').trim(),
      detalles: { marca: j.marca || null, motos: j.motos || [], colores: j.colores || [], notas: j.notas || null,
        es_pieza: j.es_pieza !== false, voz: voz || null },
      cuenta, texto, miniatura,
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
