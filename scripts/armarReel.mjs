// ============================================================
// ARMAR UN REEL — Parte 2 de "Estilo de tus reels"
// ============================================================
// (2026-10-04) El reel de cada promoción. Lo pide el worker del
// Comercial-Creativo justo después de montar las dos imágenes, con la receta
// de un reel modelo que le da la base (hermes.equipo_reel_para: rota los
// formatos para que no salgan todos iguales).
//
//   1. GUION     el motor del Creativo escribe tomas, letras y voz con los
//                datos REALES de la pieza (nada de milímetros inventados).
//   2. TOMAS     3-4 imágenes de estudio desde la foto real (creativo-escena,
//                modo "toma"). Sin texto: las letras van encima.
//   3. VOZ       OpenAI TTS en español del Caribe.
//   4. MONTAJE   ffmpeg: intro con logo, tomas con movimiento de cámara y
//                letras, cierre con WhatsApp y el 5% del código, subtítulos.
//   5. SUBIDA    creativo-escena, modo "video" → bucket ai-marketing.
//
// Es la "opción A" que eligió el dueño: imágenes con movimiento de cámara,
// no video generado por IA. La pieza es siempre la de la foto.
// ============================================================

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const FFMPEG = process.env.FFMPEG_CMD || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_CMD || 'ffprobe';
const FPS = 30;
const W = 1080, H = 1920;
const NARANJA = '0xF5A623';
const FUENTE_TITULO = process.env.REEL_FUENTE_TITULO || 'C:/Windows/Fonts/impact.ttf';
const FUENTE_TEXTO = process.env.REEL_FUENTE_TEXTO || 'C:/Windows/Fonts/arialbd.ttf';
const MOVIMIENTOS = ['acercar', 'alejar', 'izquierda', 'derecha', 'subir', 'bajar'];

const correr = (cmd, args, { timeout = 300_000 } = {}) => new Promise((resolve, reject) => {
  const hijo = spawn(cmd, args, { shell: false, windowsHide: true });
  let out = '', err = '';
  const reloj = setTimeout(() => { hijo.kill(); reject(new Error(`${cmd} tardó demasiado`)); }, timeout);
  hijo.stdout.on('data', (d) => { out += d; });
  hijo.stderr.on('data', (d) => { err += d; });
  hijo.on('error', (e) => { clearTimeout(reloj); reject(new Error(`No se pudo ejecutar ${cmd}: ${e.message}`)); });
  hijo.on('close', (code) => {
    clearTimeout(reloj);
    if (code !== 0) return reject(new Error(`${cmd} salió con ${code}: ${(err || out).trim().slice(-400)}`));
    resolve(out);
  });
});

const duracionDe = async (archivo) => Number(String(await correr(FFPROBE, ['-v', 'error',
  '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', archivo])).trim()) || 0;

// Rutas dentro de un filtro de ffmpeg: barras normales y los dos puntos de
// la unidad escapados. Sin esto, "C:" corta la opción en Windows.
const rutaFiltro = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:');

// Los textos van por archivo (textfile=), así no hay comillas que escapar.
let nTexto = 0;
const archivoTexto = async (dir, texto) => {
  nTexto += 1;
  const f = path.join(dir, `t${nTexto}.txt`);
  await writeFile(f, String(texto), 'utf8');
  return rutaFiltro(f);
};

const limpioTexto = (t, max) => String(t ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// ── 1. EL GUION ─────────────────────────────────────────────────────────
export const promptGuion = ({ para, empresa, telefono }) => {
  const r = { ...(para.receta || {}) };
  delete r.voz_original;   // sus palabras no se copian: ni se le enseñan
  const p = para.producto || {};
  return [
    `Eres el director creativo de ${empresa || 'Repuestos Morla'}, tienda de repuestos de moto en Higüey, República Dominicana.`,
    'Vas a escribir el guion de un ANUNCIO en REEL vertical (TikTok, Instagram, YouTube Shorts) de UNA pieza:',
    'un comercial que VENDE, con energía de anuncio de radio, no un video explicativo.',
    'siguiendo la RECETA de un reel que le gustó al dueño. Copias la receta (ritmo, tipo de tomas, estructura),',
    'NUNCA su marca, su producto ni sus frases.',
    '',
    'LA PIEZA (datos reales del sistema, son lo ÚNICO que puedes afirmar):',
    `- Descripción: ${p.descripcion}`,
    `- Código: ${p.codigo}`,
    p.marca ? `- Marca: ${p.marca}` : '',
    p.modelos ? `- Motos compatibles: ${p.modelos}` : '- Motos compatibles: (no registradas; no las inventes)',
    `- Precio de catálogo (SOLO para letra en pantalla, NUNCA en la voz): RD$ ${Number(p.precio || 0).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`,
    '',
    'LA RECETA:',
    '```json', JSON.stringify(r, null, 1), '```',
    para.nota_dueno ? `Nota del dueño sobre este formato: ${para.nota_dueno}` : '',
    '',
    'Devuelve SOLO este JSON, sin texto alrededor:',
    '{',
    '  "titular": "2 a 4 PALABRAS EN MAYÚSCULAS para la apertura (ej. LLEGÓ EL PISTÓN)",',
    '  "tomas": [',
    '    { "escena": "in ENGLISH, what the camera sees: the product + setting + angle (e.g. a hand holding the part close to camera, dark garage behind, red rim light)",',
    `      "movimiento": "uno de: ${MOVIMIENTOS.join(', ')}",`,
    '      "texto": "2 o 3 PALABRAS DE IMPACTO EN MAYÚSCULAS (ej. FRENA SEGURO, YA LLEGÓ, ORIGINAL), o null" }',
    '  ],',
    '  "voz": "el locutor: 30 a 45 palabras (entre 15 y 22 segundos), frases MUY cortas",',
    '  "cierre": "frase corta para la última pantalla (ej. YA DISPONIBLE EN HIGÜEY)",',
    '  "descripcion_redes": "texto para TikTok y YouTube: 1-2 frases + 3-5 hashtags (#repuestosmoto #higuey ...)"',
    '}',
    'Reglas:',
    '- 4 tomas, distintas entre sí, como pide la receta. La pieza SIEMPRE es la protagonista. Al menos 3 llevan "texto".',
    '- La voz es de COMERCIAL: primera frase = gancho fuerte (exclamación o pregunta al motoconchista, ej. "¡Tu moto merece lo mejor!"),',
    '  luego 1 o 2 beneficios en frases de 3 a 7 palabras, un toque de urgencia ("¡Ya llegó!", "¡No te quedes sin la tuya!"),',
    '  y cierre con llamado a la acción. Nada de explicaciones largas ni de leer el nombre del catálogo completo.',
    '- NO inventes medidas, cilindradas, materiales, certificaciones ni motos que no estén arriba.',
    '  Si la receta pide datos técnicos y no los hay, habla de lo que sí se sabe (para qué moto, que está disponible).',
    '- PROHIBIDO mencionar el precio, "pesos", cifras de dinero o la palabra "precio" en la VOZ (decisión del dueño).',
    '  Si conviene, el precio va como "texto" de UNA toma, EXACTAMENTE el de catálogo.',
    '- La voz termina invitando a venir o escribir al WhatsApp, y diciendo que si dicen que lo vieron en las redes',
    '  se lo llevan con 5% de descuento.',
    r.voz && r.voz.hay === false
      ? '- Esta receta NO lleva voz: deja "voz" con UNA frase corta (se usará solo como letra), y apóyate en "texto" de cada toma.'
      : '',
    telefono ? `- El WhatsApp de la tienda es ${telefono} (el montador lo pone en el cierre; no hace falta dictarlo).` : '',
  ].filter(Boolean).join('\n');
};

const leerJson = (bruto) => {
  const t = String(bruto || '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error(`El guion no vino en JSON: ${t.slice(0, 160)}`);
  return JSON.parse(t.slice(a, b + 1));
};

// (04/10/2026) El dueño no quiere el precio en la voz. El guion ya lo
// prohíbe; esto lo garantiza: fuera la frase que lo traiga.
const HABLA_DE_PRECIO = /RD\s*\$|\$\s*\d|\bpesos?\b|\bprecio\b|\d+[.,]\d{2}\b/i;
export function sinPrecio(voz) {
  // Un punto entre cifras (399.98) no corta la frase.
  const frases = String(voz || '').match(/[¡¿]?(?:[^.!?]|[.,](?=\d))+[.!?]*/g) || [];
  return frases.map((f) => f.trim()).filter((f) => f && !HABLA_DE_PRECIO.test(f)).join(' ');
}

export function normalizarGuion(g) {
  const tomas = (Array.isArray(g?.tomas) ? g.tomas : [])
    .filter((t) => t && limpioTexto(t.escena, 400))
    .slice(0, 4)
    .map((t, i) => ({
      escena: limpioTexto(t.escena, 400),
      movimiento: MOVIMIENTOS.includes(t.movimiento) ? t.movimiento : MOVIMIENTOS[i % 2],
      texto: t.texto ? limpioTexto(t.texto, 28).toUpperCase() : null,
    }));
  if (tomas.length < 2) throw new Error('El guion trajo menos de 2 tomas.');
  return {
    titular: limpioTexto(g.titular, 30).toUpperCase() || 'YA DISPONIBLE',
    tomas,
    voz: sinPrecio(limpioTexto(g.voz, 600)),
    cierre: limpioTexto(g.cierre, 34).toUpperCase() || 'YA DISPONIBLE EN HIGÜEY',
    descripcion_redes: limpioTexto(g.descripcion_redes, 400),
  };
}

// ── 3. LA VOZ ───────────────────────────────────────────────────────────
// (04/10/2026) "Le falta una voz más comercial": locutor de anuncio, no de
// tutorial. La voz se cambia sin tocar código con REEL_VOZ (ash, onyx,
// verse, ballad, echo...).
export const VOZ = process.env.REEL_VOZ || 'ash';
export const INSTRUCCIONES_VOZ = 'Eres locutor de anuncios comerciales de radio y televisión en República Dominicana. '
  + 'Acento caribeño dominicano, voz con mucha energía, entusiasmo y seguridad, como un anuncio de tienda que vende. '
  + 'Ritmo rápido y con pegada: remata cada frase corta con fuerza, sube la emoción en las exclamaciones, '
  + 'pausas cortas y dramáticas antes del llamado a la acción. Sonríe al hablar. Nunca suenes leído ni monótono.';
async function grabarVoz(texto, archivo) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Falta OPENAI_API_KEY para la voz.');
  const pedir = (cuerpo) => fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  let r = await pedir({
    model: 'gpt-4o-mini-tts', voice: VOZ, input: texto, response_format: 'mp3',
    instructions: INSTRUCCIONES_VOZ,
  });
  // Si el modelo nuevo no está, el clásico: la voz es menos expresiva pero sale.
  if (!r.ok) r = await pedir({ model: 'tts-1', voice: 'onyx', input: texto, response_format: 'mp3' });
  if (!r.ok) throw new Error(`TTS ${r.status}: ${(await r.text()).slice(0, 200)}`);
  await writeFile(archivo, Buffer.from(await r.arrayBuffer()));
}

// ── 4. EL MONTAJE ───────────────────────────────────────────────────────
// El movimiento de cámara sobre una imagen quieta. Se trabaja al doble de
// resolución para que el zoom no tiemble.
function movimiento(tipo, n) {
  const c = `iw/2-(iw/zoom/2)`, m = `ih/2-(ih/zoom/2)`;
  const p = `on/${n}`;
  switch (tipo) {
    case 'alejar':    return { z: `1.14-0.14*${p}`, x: c, y: m };
    case 'izquierda': return { z: '1.14', x: `(iw-iw/zoom)*(1-${p})`, y: m };
    case 'derecha':   return { z: '1.14', x: `(iw-iw/zoom)*${p}`, y: m };
    case 'subir':     return { z: '1.14', x: c, y: `(ih-ih/zoom)*(1-${p})` };
    case 'bajar':     return { z: '1.14', x: c, y: `(ih-ih/zoom)*${p}` };
    default:          return { z: `1+0.14*${p}`, x: c, y: m };   // acercar
  }
}

const H264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', String(FPS)];

// (04/10/2026) "Más comercial": cada toma se corta en DOS planos (el abierto
// con su movimiento y un acercamiento con golpe de zoom) y cada corte entra
// con un destello. Con 4 tomas son 8 cortes de ~2 s: ritmo de anuncio.
async function clipToma({ dir, i, imagen, dur, mov, texto, cerrado = false }) {
  const n = Math.max(2, Math.round(dur * FPS));
  const { z, x, y } = cerrado
    ? { z: `1.35+0.10*on/${n}`, x: 'iw/2-(iw/zoom/2)', y: 'ih*0.42-(ih/zoom/2)' }
    : movimiento(mov, n);
  const filtros = [
    `scale=-2:${H * 2},crop=${W * 2}:${H * 2}`,
    `zoompan=z='${z}':x='${x}':y='${y}':d=${n}:s=${W}x${H}:fps=${FPS}`,
    'eq=contrast=1.08:saturation=1.15',
  ];
  if (texto) {
    filtros.push(`drawtext=fontfile='${rutaFiltro(FUENTE_TITULO)}':expansion=none:textfile='${await archivoTexto(dir, texto)}'`
      + `:fontsize=124:fontcolor=white:borderw=6:bordercolor=black@0.9:box=1:boxcolor=${NARANJA}@0.92:boxborderw=22`
      + `:x=(w-text_w)/2:y=h*0.12:alpha='if(lt(t,0.12),t/0.12,1)'`);
  }
  filtros.push(`fade=t=in:st=0:d=0.12:color=white,fade=t=out:st=${Math.max(0, dur - 0.08).toFixed(2)}:d=0.08`);
  const lado = cerrado ? 'b' : 'a';
  const guion = path.join(dir, `f_toma${i}${lado}.txt`);
  await writeFile(guion, filtros.join(','), 'utf8');
  const salida = path.join(dir, `clip_${String(i + 1).padStart(2, '0')}${lado}.mp4`);
  await correr(FFMPEG, ['-v', 'error', '-y', '-i', imagen, '-filter_script:v', guion,
    '-frames:v', String(n), ...H264, '-an', salida]);
  return salida;
}

// Intro y cierre: fondo oscuro, logo y letras. Sin logo, solo letras.
async function clipPlaca({ dir, nombre, dur, logo, lineas }) {
  const n = Math.round(dur * FPS);
  const entradas = ['-f', 'lavfi', '-i', `color=c=0x0b0b0f:s=${W}x${H}:d=${dur}:r=${FPS}`];
  let v = '[0:v]';
  const partes = [];
  if (logo) {
    // -loop: el logo es UN cuadro; sin repetirlo, el fundido lo deja
    // transparente para siempre (pasó en la primera prueba).
    entradas.push('-loop', '1', '-t', String(dur), '-i', logo);
    partes.push(`[1:v]scale=640:-1,format=rgba,fade=t=in:st=0:d=0.4:alpha=1[lg]`,
      `${v}[lg]overlay=x=(W-w)/2:y=H*0.24[b0]`);
    v = '[b0]';
  }
  let k = 0;
  for (const l of lineas) {
    k += 1;
    const sig = `[b${k}]`;
    partes.push(`${v}drawtext=fontfile='${rutaFiltro(l.fuente || FUENTE_TITULO)}':expansion=none:textfile='${await archivoTexto(dir, l.texto)}'`
      + `:fontsize=${l.tam || 96}:fontcolor=${l.color || 'white'}:borderw=4:bordercolor=black@0.7`
      + `:x=(w-text_w)/2:y=h*${l.y}:alpha='if(lt(t,${0.2 + k * 0.15}),0,min(1,(t-${0.2 + k * 0.15})/0.3))'${sig}`);
    v = sig;
  }
  partes.push(`${v}fade=t=in:st=0:d=0.2,fade=t=out:st=${(dur - 0.25).toFixed(2)}:d=0.25[out]`);
  const guion = path.join(dir, `f_${nombre}.txt`);
  await writeFile(guion, partes.join(';'), 'utf8');
  const salida = path.join(dir, `${nombre}.mp4`);
  await correr(FFMPEG, ['-v', 'error', '-y', ...entradas, '-filter_complex_script', guion,
    '-map', '[out]', '-frames:v', String(n), ...H264, '-an', salida]);
  return salida;
}

// Los subtítulos: la voz en trozos de 4-6 palabras, repartidos por largo.
export function trozosSubtitulo(texto, desde, dur) {
  const palabras = String(texto || '').split(/\s+/).filter(Boolean);
  const trozos = [];
  for (let i = 0; i < palabras.length;) {
    let j = Math.min(palabras.length, i + 5);
    // No cortar dejando una palabra sola al final.
    if (palabras.length - j === 1) j += 1;
    trozos.push(palabras.slice(i, j).join(' '));
    i = j;
  }
  const total = trozos.reduce((s, t) => s + t.length, 0) || 1;
  let t = desde;
  return trozos.map((tx) => {
    const d = (tx.length / total) * dur;
    const r = { texto: tx, desde: t, hasta: t + d };
    t += d;
    return r;
  });
}

async function musicaDe(raiz) {
  const dir = path.join(raiz, 'musica');
  if (!existsSync(dir)) return null;
  const pistas = (await readdir(dir)).filter((f) => /\.(mp3|m4a|wav)$/i.test(f));
  return pistas.length ? path.join(dir, pistas[Math.floor(Math.random() * pistas.length)]) : null;
}

const bajar = async (url, archivo) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No se pudo bajar ${url}: HTTP ${r.status}`);
  await writeFile(archivo, Buffer.from(await r.arrayBuffer()));
  return archivo;
};

/**
 * Arma el reel. Devuelve { video_url, formato, modelo_id, guion, duracion, avisos }.
 *  para        lo que da hermes.equipo_reel_para (receta + pieza)
 *  pensar      (prompt) => texto, el motor del Creativo
 *  pedirToma   ({ toma }) => Buffer PNG, por creativo-escena
 *  subirVideo  (Buffer) => url pública
 */
export async function armarReel({ para, logoUrl, telefono, empresa, raiz, pensar, pedirToma, subirVideo, log = () => {} }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'reel-armar-'));
  const avisos = [];
  try {
    const conVoz = para.receta?.voz?.hay !== false;
    log(`  reel: formato ${para.formato}`);

    // 1. Guion
    const guion = normalizarGuion(leerJson(await pensar(promptGuion({ para, empresa, telefono }))));
    log(`  reel: guion con ${guion.tomas.length} tomas`);

    // 2. Tomas, en paralelo (cada una tarda casi un minuto)
    const resultados = await Promise.allSettled(guion.tomas.map((t) => pedirToma({ toma: t.escena })));
    const tomas = [];
    for (const [i, r] of resultados.entries()) {
      if (r.status !== 'fulfilled') { avisos.push(`Toma ${i + 1} no salió: ${r.reason?.message || r.reason}`); continue; }
      const f = path.join(dir, `toma_${i + 1}.png`);
      await writeFile(f, r.value);
      tomas.push({ ...guion.tomas[i], imagen: f });
    }
    if (tomas.length < 2) throw new Error(`Solo salieron ${tomas.length} tomas. ${avisos.join(' ')}`);
    log(`  reel: ${tomas.length} tomas listas`);

    // 3. Voz
    let vozDur = 0;
    const voz = path.join(dir, 'voz.mp3');
    if (conVoz && guion.voz) {
      await grabarVoz(guion.voz, voz);
      vozDur = await duracionDe(voz);
      log(`  reel: voz ${vozDur.toFixed(1)} s`);
    }

    // 4. Tiempos (04/10/2026, dueño): de 15 a 30 segundos. La voz manda; si
    // con ella se pasa de 30, se acelera hasta un 25% (en un anuncio sigue
    // sonando natural). Sin voz, ~2 s por corte.
    const INTRO = 1.2, CIERRE = 2.6, ARRANQUE_VOZ = 0.3, MIN = 15, MAX = 30;
    if (vozDur && ARRANQUE_VOZ + vozDur + 0.3 > MAX - 0.5) {
      const factor = Math.min(1.25, (ARRANQUE_VOZ + vozDur + 0.3) / (MAX - 0.5));
      const rapida = path.join(dir, 'voz_rapida.mp3');
      await correr(FFMPEG, ['-v', 'error', '-y', '-i', voz, '-filter:a', `atempo=${factor.toFixed(3)}`, rapida]);
      await correr(FFMPEG, ['-v', 'error', '-y', '-i', rapida, '-c', 'copy', voz]);
      vozDur = await duracionDe(voz);
      log(`  reel: voz acelerada x${factor.toFixed(2)} -> ${vozDur.toFixed(1)} s`);
    }
    const cortes = tomas.length * 2;
    const totalDeseado = Math.min(MAX + 2, Math.max(MIN, vozDur ? ARRANQUE_VOZ + vozDur + 0.3 : INTRO + cortes * 2 + CIERRE));
    const cuerpo = Math.max(totalDeseado - INTRO - CIERRE, cortes * 1.4);
    const porCorte = cuerpo / cortes;
    const total = INTRO + cuerpo + CIERRE;

    const logo = logoUrl ? await bajar(logoUrl, path.join(dir, 'logo.png')).catch(() => null) : null;
    const clips = [];
    clips.push(await clipPlaca({ dir, nombre: 'intro', dur: INTRO, logo,
      lineas: [{ texto: guion.titular, y: logo ? 0.60 : 0.45, tam: 120, color: NARANJA }] }));
    for (const [i, t] of tomas.entries()) {
      clips.push(await clipToma({ dir, i, imagen: t.imagen, dur: porCorte, mov: t.movimiento, texto: t.texto }));
      clips.push(await clipToma({ dir, i, imagen: t.imagen, dur: porCorte, mov: t.movimiento, texto: null, cerrado: true }));
    }
    clips.push(await clipPlaca({ dir, nombre: 'cierre', dur: CIERRE, logo,
      lineas: [
        { texto: guion.cierre, y: 0.58, tam: 92, color: NARANJA },
        ...(telefono ? [{ texto: `WhatsApp ${telefono}`, y: 0.68, tam: 70, fuente: FUENTE_TEXTO }] : []),
        { texto: 'Di que lo viste aquí: 5% de descuento', y: 0.76, tam: 52, fuente: FUENTE_TEXTO, color: '0xDDDDDD' },
      ] }));
    log('  reel: clips montados');

    const lista = path.join(dir, 'lista.txt');
    await writeFile(lista, clips.map((c) => `file '${c.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
    const mudo = path.join(dir, 'mudo.mp4');
    await correr(FFMPEG, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', mudo]);

    // Subtítulos de la voz, encima de todo.
    // En la placa de cierre no van subtítulos: la placa ya dice el llamado
    // y el subtítulo le tapaba la línea del 5% (prueba del 04/10).
    const finCuerpo = INTRO + cuerpo;
    const subs = (vozDur ? trozosSubtitulo(guion.voz, ARRANQUE_VOZ, vozDur) : [])
      .filter((x) => x.desde < finCuerpo - 0.2)
      .map((x) => ({ ...x, hasta: Math.min(x.hasta, finCuerpo) }));
    const filtrosV = [];
    for (const s of subs) {
      filtrosV.push(`drawtext=fontfile='${rutaFiltro(FUENTE_TEXTO)}':expansion=none:textfile='${await archivoTexto(dir, s.texto)}'`
        + `:fontsize=62:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=18`
        + `:x=(w-text_w)/2:y=h*0.80:enable='between(t,${s.desde.toFixed(2)},${s.hasta.toFixed(2)})'`);
    }
    const guionV = path.join(dir, 'f_subs.txt');
    await writeFile(guionV, filtrosV.length ? filtrosV.join(',') : 'null', 'utf8');

    // Audio: voz (con un respiro al empezar) + música baja si hay pistas en
    // hermes\equipo\musica. Sin nada, silencio: TikTok pide pista igual.
    const musica = await musicaDe(raiz);
    const entradasA = [];
    let filtroA;
    if (vozDur) entradasA.push('-i', voz);
    if (musica) entradasA.push('-stream_loop', '-1', '-i', musica);
    const iv = 1, im = vozDur ? 2 : 1;
    if (vozDur && musica) {
      filtroA = `[${iv}:a]adelay=${Math.round(ARRANQUE_VOZ * 1000)}:all=1,volume=1.6[v];`
        + `[${im}:a]volume=0.13,afade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2[m];[v][m]amix=inputs=2:duration=longest:normalize=0[a]`;
    } else if (vozDur) {
      filtroA = `[${iv}:a]adelay=${Math.round(ARRANQUE_VOZ * 1000)}:all=1,volume=1.6,apad[a]`;
    } else if (musica) {
      filtroA = `[${im}:a]volume=0.5,afade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2[a]`;
    } else {
      entradasA.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
      filtroA = '[1:a]anull[a]';
    }
    const final = path.join(dir, 'reel.mp4');
    await correr(FFMPEG, ['-v', 'error', '-y', '-i', mudo, ...entradasA,
      '-filter_script:v', guionV, '-filter_complex', filtroA,
      '-map', '0:v', '-map', '[a]', ...H264, '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
      '-t', total.toFixed(2), '-movflags', '+faststart', final]);
    const bytes = await readFile(final);
    log(`  reel: ${total.toFixed(1)} s, ${(bytes.length / 1048576).toFixed(1)} MB${musica ? '' : ' (sin música: no hay pistas en equipo\\musica)'}`);
    if (!musica) avisos.push('El reel va sin música de fondo: ponle el sonido en TikTok al publicar el borrador.');

    // 5. Subida
    const video_url = await subirVideo(bytes);
    return { video_url, formato: para.formato, modelo_id: para.modelo_id, guion, duracion: Math.round(total * 10) / 10, avisos };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
