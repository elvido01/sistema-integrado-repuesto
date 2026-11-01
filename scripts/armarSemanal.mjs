// ============================================================
// PIEZAS DE LA SEMANA — el video horizontal del fin de semana
// ============================================================
// (01/11/2026) Idea del dueño a partir de su video de Repuestos Morla
// (youtu.be/CgnYbFVq1wk): repasar en 2–4 minutos las piezas publicadas en la
// semana, una por una, diciendo qué es y cuánto cuesta. Para YouTube y
// Facebook, sábado o domingo (sql/piezas_de_la_semana.sql).
//
// Decisiones del dueño (01/11):
//   · el precio SÍ va en la voz y en pantalla (solo aquí: los reels diarios
//     siguen sin precio hablado). Lo pone el código, no el modelo: la frase
//     del precio se añade al final con el número del catálogo, y si el
//     modelo o el dueño escribieron un precio, se quita (sinPrecio);
//   · solo horizontal 1920×1080;
//   · se arma con la foto de la pieza (la misma de su reel), sin tomas IA:
//     solo se paga la voz y unas líneas de gpt-4o-mini.
//
// El montaje, por pieza: la foto desenfocada de fondo, la pieza nítida en
// una tarjeta blanca con borde naranja (con un acercamiento lento) a la
// izquierda y, a la derecha, "PIEZA 3 DE 8", el nombre, el código y el
// precio en oro. Intro con el logo y "PIEZAS DE LA SEMANA"; cierre con el
// WhatsApp. Voz, música bajo la voz y -14 LUFS, igual que los reels.
// ============================================================

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  correr, duracionDe, rutaFiltro, archivoTexto, letrero, grabarVoz, musicaDe, bajar, sinPrecio,
  FUENTE_TITULO, FUENTE_TEXTO, ORO, NARANJA, FPS, VOZ,
} from './armarReel.mjs';

const FFMPEG = process.env.FFMPEG_CMD || 'ffmpeg';
const W = 1920, H = 1080;
// creativo-escena no acepta videos de más de 40 MB.
const MAX_BYTES = 38 * 1024 * 1024;
const H264_TROZO = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS)];

// La voz de este formato: la del video de referencia, un presentador que
// enseña las piezas a un cliente. No el locutor de anuncio de los reels.
const VOZ_SEMANAL = {
  voz: process.env.SEMANAL_VOZ || VOZ,
  instrucciones: 'Eres el presentador de una tienda de repuestos de motos en República Dominicana, '
    + 'mostrando las piezas de la semana a tus clientes en un video. Acento dominicano, tono cercano, '
    + 'claro y con buena energía, ritmo ágil pero sin gritar. Di los precios con claridad.',
};

// ── Textos ─────────────────────────────────────────────────────────────
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaLarga = (iso) => {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return { d, mes: MESES[m - 1], a };
};
export function rangoTexto(desde, hasta) {
  const x = fechaLarga(desde), y = fechaLarga(hasta);
  return x.mes === y.mes ? `Del ${x.d} al ${y.d} de ${y.mes}` : `Del ${x.d} de ${x.mes} al ${y.d} de ${y.mes}`;
}

export const precioEntero = (precio) => Math.round(Number(precio) || 0);
export const precioPantalla = (precio) => `RD$ ${precioEntero(precio).toLocaleString('en-US')}`;

// La frase del precio, rotando para que no suene a máquina.
const FRASES_PRECIO = ['Tiene un costo de', 'Su precio es de', 'Te sale en', 'Está en'];
export function vozConPrecio(texto, precio, i) {
  const base = sinPrecio(texto).trim();
  const fin = `${FRASES_PRECIO[i % FRASES_PRECIO.length]} ${precioEntero(precio).toLocaleString('en-US')} pesos.`;
  return base ? `${base.replace(/[.!?]*$/, '.')} ${fin}` : fin;
}

// Si el modelo no responde, una frase sencilla con el nombre de la pieza.
const minus = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
export function vozDeRespaldo(pieza, i) {
  const ARRANQUES = ['Aquí tenemos', 'También tenemos', 'Seguimos con', 'Mira esta pieza:', 'Disponible:'];
  return `${ARRANQUES[i % ARRANQUES.length]} ${minus(pieza.descripcion)}.`;
}

// Nombre en renglones de hasta `max` letras, sin cortar palabras ni perder
// ninguna (si no cabe en 3, el último renglón se alarga).
export function partirNombre(texto, max) {
  const out = [];
  for (const p of String(texto || '').trim().split(/\s+/).filter(Boolean)) {
    if (out.length && (`${out[out.length - 1]} ${p}`).length <= max) out[out.length - 1] += ` ${p}`;
    else if (out.length < 3) out.push(p);
    else out[out.length - 1] += ` ${p}`;
  }
  return out;
}

// ── El guion: una o dos frases por pieza, sin precio ───────────────────
async function escribirVoces({ piezas, empresa, telefono, rango, log }) {
  const key = process.env.OPENAI_API_KEY;
  const respaldo = {
    intro: `¡Saludos! Estas son las piezas de la semana en ${empresa || 'nuestra tienda'}. Te decimos qué es cada una y cuánto cuesta.`,
    cierre: `Estas y muchas piezas más están disponibles en ${empresa || 'nuestra tienda'}. `
      + `Si buscas algo en específico, déjalo en los comentarios${telefono ? ` o escríbenos por WhatsApp al ${telefono}` : ''}.`,
    piezas: Object.fromEntries(piezas.map((p, i) => [p.producto_id, vozDeRespaldo(p, i)])),
  };
  if (!key) return respaldo;
  const prompt = [
    `Escribe la voz de un video "Piezas de la semana" de ${empresa || 'una tienda de repuestos de motos'} en República Dominicana (${rango}).`,
    'Para CADA pieza, UNA o DOS frases cortas (máximo 25 palabras en total) que digan qué es y para qué moto o uso sirve,',
    'como alguien que la enseña en la mano: "Aquí tenemos…", "También…", "Seguimos con…" (varía los arranques).',
    'Usa SOLO lo que dice la descripción (marca, modelo de moto, tipo de pieza). NO inventes medidas, materiales ni garantías.',
    'Los números del nombre como 5100, 10W40, 4T o 6001 son de la pieza, no modelos de moto.',
    'NO digas el precio ni la palabra "precio" ni "pesos": el precio se añade después.',
    'Escribe las abreviaturas como se dicen (ej. "CG200" → "CG 200"). Español dominicano natural, sin emojis.',
    `Además: "intro" (una frase de saludo que presente las piezas de la semana de ${empresa || 'la tienda'}) y`,
    `"cierre" (dos frases: hay muchas piezas más disponibles; pidan lo que buscan en los comentarios${telefono ? ` o por WhatsApp al ${telefono}` : ''}).`,
    'Responde SOLO JSON: {"intro": "...", "piezas": [{"id": "<id>", "voz": "..."}], "cierre": "..."}',
    '',
    'Piezas:',
    ...piezas.map((p) => `- id ${p.producto_id}: ${p.descripcion} (código ${p.codigo || '-'})`),
  ].join('\n');
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.SEMANAL_MODELO || 'gpt-4o-mini', temperature: 0.7,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = JSON.parse((await r.json()).choices?.[0]?.message?.content || '{}');
    const porId = Object.fromEntries((j.piezas || []).map((x) => [String(x.id), String(x.voz || '').trim()]));
    return {
      intro: sinPrecio(j.intro) || respaldo.intro,
      cierre: sinPrecio(j.cierre) || respaldo.cierre,
      piezas: Object.fromEntries(piezas.map((p, i) => [p.producto_id, sinPrecio(porId[p.producto_id]) || respaldo.piezas[p.producto_id] || vozDeRespaldo(p, i)])),
    };
  } catch (e) {
    log(`  semanal: el guion por IA no salió (${e.message}); va el de respaldo`);
    return respaldo;
  }
}

// ── Montaje ─────────────────────────────────────────────────────────────
const fondoDesenfocado = (entrada) => `${entrada}scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},`
  + 'boxblur=30:3,eq=brightness=-0.32:saturation=0.85,setsar=1';

async function renderizar({ dir, nombre, entradas, partes, dur }) {
  const guion = path.join(dir, `f_${nombre}.txt`);
  await writeFile(guion, partes.join(';'), 'utf8');
  const salida = path.join(dir, `${nombre}.mp4`);
  await correr(FFMPEG, ['-v', 'error', '-y', ...entradas, '-filter_complex_script', guion,
    '-map', '[out]', '-frames:v', String(Math.round(dur * FPS)), ...H264_TROZO, '-an', salida], { timeout: 600_000 });
  return salida;
}

const aparecer = (desde, d = 0.3) => `if(lt(t,${desde}),0,min(1,(t-${desde})/${d}))`;
const texto = async (dir, t, { tam, color = 'white', x, y, fuente = FUENTE_TEXTO, desde = 0.2, borde = 3 }) =>
  `drawtext=fontfile='${rutaFiltro(fuente)}':expansion=none:textfile='${await archivoTexto(dir, t)}'`
  + `:fontsize=${tam}:fontcolor=${color}:borderw=${borde}:bordercolor=black@0.75:shadowcolor=black@0.6:shadowx=3:shadowy=4`
  + `:x=${x}:y=${y}:alpha='${aparecer(desde)}'`;

// Una pieza: fondo desenfocado, tarjeta con la pieza y los datos a la derecha.
async function segmentoPieza({ dir, i, total, pieza, foto, dur }) {
  const n = Math.round(dur * FPS);
  const X = 1000;
  const largo = String(pieza.descripcion || '').length;
  const tam = largo > 48 ? 62 : 74;
  const lineas = partirNombre(pieza.descripcion, tam > 70 ? 21 : 25);
  const lh = Math.round(tam * 1.12);
  const yNombre = 250;
  const yCodigo = yNombre + lineas.length * lh + 16;
  const yBarra = yCodigo + 64;
  const yPrecio = yBarra + 30;
  const partes = [
    `${fondoDesenfocado('[0:v]')}[bg]`,
    // La pieza: entra completa en 820×820, sobre blanco; acercamiento lento
    // (al doble de tamaño para que no tiemble) y borde naranja.
    `[1:v]scale=820:820:force_original_aspect_ratio=decrease,pad=860:860:(ow-iw)/2:(oh-ih)/2:white,setsar=1,`
      + `scale=1720:1720,zoompan=z='1+0.06*on/${n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${n}:s=860x860:fps=${FPS},`
      + `pad=876:876:8:8:${NARANJA}[pz]`,
    `[bg][pz]overlay=x=110:y=(H-h)/2:shortest=0[b0]`,
  ];
  const filtros = [
    await texto(dir, `PIEZA ${i + 1} DE ${total}`, { tam: 40, color: NARANJA, x: X, y: 186, desde: 0.15 }),
  ];
  for (const [k, l] of lineas.entries()) {
    filtros.push(await texto(dir, l, { tam, x: X, y: yNombre + k * lh, fuente: FUENTE_TITULO, desde: 0.25 + k * 0.08, borde: 4 }));
  }
  if (pieza.codigo) filtros.push(await texto(dir, `Código ${pieza.codigo}`, { tam: 38, color: '0xC8C8C8', x: X, y: yCodigo, desde: 0.45 }));
  filtros.push(`drawbox=x=${X}:y=${yBarra}:w=520:h=6:color=${NARANJA}:t=fill:enable='gte(t,0.5)'`);
  filtros.push(await texto(dir, precioPantalla(pieza.precio), { tam: 150, color: ORO, x: X, y: yPrecio, fuente: FUENTE_TITULO, desde: 0.6, borde: 5 }));
  filtros.push(await texto(dir, 'ITBIS incluido', { tam: 38, color: '0xDDDDDD', x: X + 6, y: yPrecio + 168, desde: 0.75 }));
  filtros.push(`fade=t=in:st=0:d=0.25,fade=t=out:st=${(dur - 0.25).toFixed(2)}:d=0.25`);
  partes.push(`[b0]${filtros.join(',')}[out]`);
  return renderizar({ dir, nombre: `pieza_${String(i + 1).padStart(2, '0')}`, dur, partes,
    entradas: ['-loop', '1', '-t', dur.toFixed(2), '-i', foto, '-i', foto] });
}

// Intro y cierre: fondo desenfocado, logo y letras centradas.
async function placa({ dir, nombre, fondo, logo, dur, lineas }) {
  const entradas = ['-loop', '1', '-t', dur.toFixed(2), '-i', fondo];
  const partes = [`${fondoDesenfocado('[0:v]')},eq=brightness=-0.08[b0]`];
  let v = '[b0]';
  if (logo) {
    // -loop: el logo es un solo cuadro; sin repetirlo, el fundido lo deja transparente.
    entradas.push('-loop', '1', '-t', dur.toFixed(2), '-i', logo);
    partes.push(`[1:v]scale=-1:300,format=rgba,fade=t=in:st=0:d=0.4:alpha=1[lg]`, `${v}[lg]overlay=x=(W-w)/2:y=H*0.08[b1]`);
    v = '[b1]';
  }
  const filtros = [];
  for (const [k, l] of lineas.entries()) {
    const desde = 0.3 + k * 0.2;
    if (l.letrero) filtros.push(...await letrero(dir, l.texto, { y: `h*${l.y}`, tam: l.tam || 130, alpha: aparecer(desde) }));
    else filtros.push(await texto(dir, l.texto, { tam: l.tam || 56, color: l.color || 'white', x: '(w-text_w)/2', y: `h*${l.y}`, fuente: l.fuente || FUENTE_TEXTO, desde }));
  }
  filtros.push(`fade=t=in:st=0:d=0.3,fade=t=out:st=${(dur - 0.3).toFixed(2)}:d=0.3`);
  partes.push(`${v}${filtros.join(',')}[out]`);
  return renderizar({ dir, nombre, dur, partes, entradas });
}

// La voz de un tramo, con un respiro al empezar y rellenada hasta su largo.
async function audioTramo({ dir, nombre, voz, dur }) {
  const salida = path.join(dir, `${nombre}.wav`);
  const args = voz
    ? ['-i', voz, '-af', `adelay=350:all=1,apad`, '-t', dur.toFixed(3)]
    : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', dur.toFixed(3)];
  await correr(FFMPEG, ['-v', 'error', '-y', ...args, '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le', salida]);
  return salida;
}

/**
 * Arma el video. Devuelve { video_url, duracion, guion, avisos }.
 *  semanal     lo que da hermes.equipo_semanal_tomar (piezas ya filtradas)
 *  raiz        carpeta del equipo (música en raiz/musica)
 *  subirVideo  (Buffer) => url pública
 *  grabar      (texto, archivo, voz) => mp3; se cambia solo en las pruebas
 */
export async function armarSemanal({ semanal, raiz, subirVideo, log = () => {}, grabar = grabarVoz }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'semanal-'));
  const avisos = [];
  try {
    const empresa = semanal.empresa || '';
    const telefono = semanal.telefono || '';
    const rango = rangoTexto(semanal.desde, semanal.hasta);

    // 1. Las fotos. La que no baja se salta con aviso.
    const piezas = [];
    for (const [k, p] of (semanal.piezas || []).entries()) {
      try {
        const ext = (String(p.foto_url).match(/\.(png|jpe?g|webp)(?:\?|$)/i)?.[1] || 'jpg').toLowerCase();
        piezas.push({ ...p, foto: await bajar(p.foto_url, path.join(dir, `foto_${k + 1}.${ext}`)) });
      } catch (e) {
        avisos.push(`${p.descripcion}: no se pudo bajar la foto (${e.message}); va sin ella.`);
      }
    }
    if (piezas.length < 2) throw new Error(`Solo hay ${piezas.length} pieza(s) con foto. ${avisos.join(' ')}`);
    log(`  semanal: ${piezas.length} piezas (${rango})`);

    // 2. Las voces: las corregidas por el dueño mandan; el resto, del modelo.
    const faltan = piezas.filter((p) => !String(p.voz || '').trim());
    const ia = await escribirVoces({ piezas: faltan.length ? faltan : piezas.slice(0, 1), empresa, telefono, rango, log });
    const guion = {
      intro: ia.intro,
      cierre: ia.cierre,
      piezas: piezas.map((p, i) => {
        const voz = String(p.voz || '').trim() || ia.piezas[p.producto_id] || vozDeRespaldo(p, i);
        return { producto_id: p.producto_id, descripcion: p.descripcion, voz: sinPrecio(voz), voz_final: vozConPrecio(voz, p.precio, i) };
      }),
    };

    // 3. Grabar y medir cada voz.
    const tramos = [];
    const vozIntro = path.join(dir, 'voz_intro.mp3');
    await grabar(guion.intro, vozIntro, VOZ_SEMANAL);
    tramos.push({ tipo: 'intro', voz: vozIntro, dur: Math.max(4.5, (await duracionDe(vozIntro)) + 1.0) });
    for (const [i, g] of guion.piezas.entries()) {
      const f = path.join(dir, `voz_${i + 1}.mp3`);
      await grabar(g.voz_final, f, VOZ_SEMANAL);
      tramos.push({ tipo: 'pieza', i, voz: f, dur: Math.max(5, (await duracionDe(f)) + 0.9) });
    }
    const vozCierre = path.join(dir, 'voz_cierre.mp3');
    await grabar(guion.cierre, vozCierre, VOZ_SEMANAL);
    tramos.push({ tipo: 'cierre', voz: vozCierre, dur: Math.max(6, (await duracionDe(vozCierre)) + 1.5) });
    log(`  semanal: ${tramos.length} voces grabadas`);

    // 4. Los tramos de video y su audio.
    const logo = semanal.logo_url ? await bajar(semanal.logo_url, path.join(dir, 'logo.png')).catch(() => null) : null;
    const videos = [], audios = [];
    for (const t of tramos) {
      let v;
      if (t.tipo === 'intro') {
        v = await placa({ dir, nombre: 'intro', fondo: piezas[0].foto, logo, dur: t.dur, lineas: [
          { texto: 'PIEZAS DE LA SEMANA', y: 0.40, tam: 150, letrero: true },
          { texto: rango, y: 0.72, tam: 56 },
          ...(empresa ? [{ texto: empresa, y: 0.82, tam: 46, color: '0xDDDDDD' }] : []),
        ] });
      } else if (t.tipo === 'cierre') {
        v = await placa({ dir, nombre: 'cierre', fondo: piezas[piezas.length - 1].foto, logo, dur: t.dur, lineas: [
          { texto: '¿BUSCAS OTRA PIEZA?', y: 0.38, tam: 130, letrero: true },
          { texto: 'Escríbenos o déjalo en los comentarios', y: 0.66, tam: 52 },
          ...(telefono ? [{ texto: `WhatsApp ${telefono}`, y: 0.76, tam: 76, fuente: FUENTE_TITULO, color: ORO }] : []),
        ] });
      } else {
        v = await segmentoPieza({ dir, i: t.i, total: piezas.length, pieza: piezas[t.i], foto: piezas[t.i].foto, dur: t.dur });
      }
      videos.push(v);
      audios.push(await audioTramo({ dir, nombre: `a_${videos.length}`, voz: t.voz, dur: t.dur }));
    }
    const total = tramos.reduce((s, t) => s + t.dur, 0);
    log(`  semanal: ${videos.length} tramos montados, ${total.toFixed(1)} s`);

    const listaV = path.join(dir, 'lista_v.txt');
    await writeFile(listaV, videos.map((c) => `file '${c.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
    const mudo = path.join(dir, 'mudo.mp4');
    await correr(FFMPEG, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listaV, '-c', 'copy', mudo]);
    const listaA = path.join(dir, 'lista_a.txt');
    await writeFile(listaA, audios.map((c) => `file '${c.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
    const voz = path.join(dir, 'voz.wav');
    await correr(FFMPEG, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listaA, '-c', 'copy', voz]);

    // 5. Mezcla final: voz + música bajo la voz (sidechain), -14 LUFS, y el
    // logo chico arriba a la derecha mientras pasan las piezas.
    const musica = await musicaDe(raiz);
    const entradas = ['-i', mudo, '-i', voz];
    let filtroA;
    if (musica) {
      entradas.push('-stream_loop', '-1', '-i', musica);
      filtroA = '[1:a]volume=1.5,asplit=2[v][vsc];'
        + `[2:a]volume=0.32,afade=t=out:st=${(total - 2).toFixed(2)}:d=2[m0];`
        + '[m0][vsc]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[m];'
        + '[v][m]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]';
    } else {
      filtroA = '[1:a]volume=1.5,loudnorm=I=-14:TP=-1.5:LRA=11[a]';
      avisos.push('Va sin música: no hay pistas en equipo\\musica.');
    }
    const iniPiezas = tramos[0].dur;
    const finPiezas = total - tramos[tramos.length - 1].dur;
    let filtroV;
    if (logo) {
      entradas.push('-i', logo);
      const nLogo = musica ? 3 : 2;
      filtroV = `[${nLogo}:v]scale=-1:110,format=rgba,colorchannelmixer=aa=0.9[lg];`
        + `[0:v][lg]overlay=x=W-w-40:y=36:enable='between(t,${iniPiezas.toFixed(2)},${finPiezas.toFixed(2)})'[vout]`;
    } else {
      filtroV = '[0:v]null[vout]';
    }
    const guionAV = path.join(dir, 'f_final.txt');
    await writeFile(guionAV, `${filtroV};${filtroA}`, 'utf8');

    // La tasa de bits sale del límite de subida (40 MB): más largo, menos bits.
    let kbps = Math.max(700, Math.min(4500, Math.floor((MAX_BYTES * 8) / total / 1000) - 180));
    const final = path.join(dir, 'semanal.mp4');
    let bytes;
    for (let intento = 0; intento < 3; intento += 1) {
      await correr(FFMPEG, ['-v', 'error', '-y', ...entradas, '-filter_complex_script', guionAV,
        '-map', '[vout]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast',
        '-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.3)}k`, '-bufsize', `${kbps * 2}k`,
        '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
        '-t', total.toFixed(2), '-movflags', '+faststart', final], { timeout: 900_000 });
      bytes = await readFile(final);
      if (bytes.length <= MAX_BYTES + 1024 * 1024) break;
      kbps = Math.floor(kbps * 0.75);
      log(`  semanal: ${(bytes.length / 1048576).toFixed(1)} MB, rehaciendo a ${kbps} kbps`);
    }
    if (bytes.length > 40 * 1024 * 1024) throw new Error(`El video pesa ${(bytes.length / 1048576).toFixed(1)} MB; el máximo es 40.`);
    log(`  semanal: ${total.toFixed(1)} s, ${(bytes.length / 1048576).toFixed(1)} MB, ${kbps} kbps`);

    const video_url = await subirVideo(bytes);
    return { video_url, duracion: Math.round(total * 10) / 10, guion, avisos };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
