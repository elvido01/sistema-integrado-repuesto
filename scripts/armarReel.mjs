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
// (04/10/2026) "Las letras tienen que parecerse a las de las imágenes": las
// piezas usan una letra gruesa, cursiva y estrecha (racing). La más parecida
// libre es Barlow Condensed (Google Fonts, OFL), en hermes\equipo\fuentes.
// Si no está, Impact.
const DIR_FUENTES = path.resolve(import.meta.dirname, '..', 'fuentes');
const fuente = (archivo, respaldo) => {
  const f = path.join(DIR_FUENTES, archivo);
  return existsSync(f) ? f : respaldo;
};
const FUENTE_TITULO = process.env.REEL_FUENTE_TITULO || fuente('BarlowCondensed-BlackItalic.ttf', 'C:/Windows/Fonts/impact.ttf');
const FUENTE_TEXTO = process.env.REEL_FUENTE_TEXTO || fuente('BarlowCondensed-Bold.ttf', 'C:/Windows/Fonts/arialbd.ttf');
// Los dos tonos del titular de las piezas: plata arriba, la palabra clave en oro.
const PLATA = '0xF4F4F4';
const ORO = '0xFFB21E';
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

// El titular como en las piezas: la primera parte en plata y la ÚLTIMA
// palabra, más grande, en oro; borde oscuro y sombra. Devuelve filtros
// drawtext para encadenar con comas.
async function letrero(dir, texto, { y, tam = 130, alpha = null }) {
  const palabras = String(texto || '').trim().split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  const acento = palabras.pop();
  const resto = palabras.join(' ');
  const comun = `fontfile='${rutaFiltro(FUENTE_TITULO)}':expansion=none:borderw=5:bordercolor=0x0a0a0a@0.85`
    + `:shadowcolor=black@0.75:shadowx=5:shadowy=7:x=(w-text_w)/2${alpha ? `:alpha='${alpha}'` : ''}`;
  const filtros = [];
  if (resto) {
    filtros.push(`drawtext=${comun}:textfile='${await archivoTexto(dir, resto)}'`
      + `:fontsize=${Math.round(tam * 0.78)}:fontcolor=${PLATA}:y=${y}`);
  }
  filtros.push(`drawtext=${comun}:textfile='${await archivoTexto(dir, acento)}'`
    + `:fontsize=${resto ? Math.round(tam * 1.08) : tam}:fontcolor=${ORO}`
    + `:y=${resto ? `${y}+${Math.round(tam * 0.8)}` : y}`);
  return filtros;
}

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
    p.modelos ? `- Motos compatibles: ${p.modelos}` : '- Motos compatibles: (no registradas: NO menciones ninguna moto ni modelo)',
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
    ...(para.clips_info?.length ? [
      `- El reel se hace con ${para.clips_info.length} VIDEO(S) REALES que grabó el dueño: ${para.clips_info.map((c) => `Clip ${c.n} (${c.dur.toFixed(1)} s)`).join(', ')}.`,
      '  Te paso 3 imágenes de cada clip (inicio, medio y final), en orden. NO inventes escenas: cada toma usa un clip.',
      '  Formato de cada toma: { "clip": 1, "momento": "inicio|medio|final", "texto": "2 o 3 PALABRAS o null" }.',
      '  Entre 5 y 8 tomas, alternando clips y momentos para que haya ritmo. Al menos 3 llevan "texto".',
      '  Describe en la voz lo que de verdad se ve en los clips (la pieza en la mano, puesta en la moto…).',
    ] : [
      '- 4 tomas, distintas entre sí, como pide la receta. La pieza SIEMPRE es la protagonista. Al menos 3 llevan "texto".',
    ]),
    '- La voz es de COMERCIAL: primera frase = gancho fuerte (exclamación o pregunta al motoconchista, ej. "¡Tu moto merece lo mejor!"),',
    '  luego 1 o 2 beneficios en frases de 3 a 7 palabras, un toque de urgencia ("¡Ya llegó!", "¡No te quedes sin la tuya!"),',
    '  y cierre con llamado a la acción. Nada de explicaciones largas ni de leer el nombre del catálogo completo.',
    '- NO inventes medidas, cilindradas, materiales, certificaciones ni motos que no estén arriba.',
    '- Los números y siglas del NOMBRE de la pieza (ej. 5100, 7100, 10W40, 20W50, 4T, 2T, SAE, 6203) son parte del nombre',
    '  o de la especificación, NUNCA modelos de moto. "Compatible con modelos 5100" es un error grave.',
    '  Solo nombra motos que estén en "Motos compatibles".',
    '  Si la receta pide datos técnicos y no los hay, habla de lo que sí se sabe (para qué moto, que está disponible).',
    '- PROHIBIDO mencionar el precio, "pesos", cifras de dinero o la palabra "precio" en la VOZ (decisión del dueño).',
    '  Si conviene, el precio va como "texto" de UNA toma, EXACTAMENTE el de catálogo.',
    para.sin_descuento
      ? '- La voz termina invitando a venir o escribir al WhatsApp. Esta promoción NO tiene descuento: no menciones descuento, rebaja, oferta de precio ni código.'
      : '- La voz termina invitando a venir o escribir al WhatsApp, y diciendo que si dicen que lo vieron en las redes se lo llevan con 5% de descuento.',
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

const MOMENTOS = ['inicio', 'medio', 'final'];

export function normalizarGuion(g) {
  // Con video del dueño las tomas son "Clip N + momento" (hasta 8 cortes);
  // con tomas de IA, una escena por toma (hasta 4, cada una cuesta).
  const deClip = (Array.isArray(g?.tomas) ? g.tomas : []).some((t) => Number(t?.clip) > 0);
  const tomas = (Array.isArray(g?.tomas) ? g.tomas : [])
    .filter((t) => t && (deClip ? Number(t.clip) > 0 : limpioTexto(t.escena, 400)))
    .slice(0, deClip ? 8 : 4)
    .map((t, i) => (deClip ? {
      clip: Math.round(Number(t.clip)),
      momento: MOMENTOS.includes(t.momento) ? t.momento : MOMENTOS[i % 3],
      texto: t.texto ? limpioTexto(t.texto, 28).toUpperCase() : null,
    } : {
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
    // La letra de las piezas (plata + oro), entrando de golpe.
    filtros.push(...await letrero(dir, texto, { y: 'h*0.10', tam: 140, alpha: 'if(lt(t,0.12),t/0.12,1)' }));
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

// (04/10/2026) Un corte de un VIDEO del dueño: se llena el vertical sin
// deformar (recorta lo que sobra), sin su sonido (va la voz y la música), con
// la letra de la toma y el mismo destello de entrada que los demás cortes.
// Si el clip es más corto que el corte, se repite.
async function clipVideo({ dir, i, archivo, durClip, momento, dur, texto }) {
  const base = { inicio: 0.05, medio: 0.4, final: 0.72 }[momento] ?? 0.05;
  const desde = Math.max(0, Math.min(durClip * base, durClip - dur - 0.05));
  const filtros = [
    `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${FPS}`,
    'eq=contrast=1.05:saturation=1.1',
  ];
  if (texto) {
    filtros.push(...await letrero(dir, texto, { y: 'h*0.10', tam: 140, alpha: 'if(lt(t,0.12),t/0.12,1)' }));
  }
  filtros.push(`fade=t=in:st=0:d=0.1:color=white,fade=t=out:st=${Math.max(0, dur - 0.08).toFixed(2)}:d=0.08`);
  const guion = path.join(dir, `f_video${i}.txt`);
  await writeFile(guion, filtros.join(','), 'utf8');
  const salida = path.join(dir, `clip_${String(i + 1).padStart(2, '0')}v.mp4`);
  await correr(FFMPEG, ['-v', 'error', '-y', '-stream_loop', '-1', '-ss', desde.toFixed(2), '-i', archivo,
    '-filter_script:v', guion, '-t', dur.toFixed(2), ...H264, '-an', salida]);
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
    const aparece = `if(lt(t,${0.2 + k * 0.15}),0,min(1,(t-${0.2 + k * 0.15})/0.3))`;
    if (l.letrero) {
      partes.push(`${v}${(await letrero(dir, l.texto, { y: `h*${l.y}`, tam: l.tam || 130, alpha: aparece })).join(',')}${sig}`);
      v = sig;
      continue;
    }
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
    // Hasta 5 palabras, pero nunca más de ~30 letras: "¡Atención
    // motoconchista! Protege tu moto" se salía por los lados (04/10).
    let j = i + 1;
    while (j < palabras.length && j - i < 5 && palabras.slice(i, j + 1).join(' ').length <= 30) j += 1;
    // No cortar dejando una palabra sola al final, si cabe.
    if (palabras.length - j === 1 && palabras.slice(i, j + 1).join(' ').length <= 34) j += 1;
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
// (04/10/2026) El dueño quiere VER y corregir el guion antes de gastar en
// tomas y voz. Por eso son dos pasos: con las imágenes se escribe solo el
// guion (centavos); el reel se arma cuando él pulsa "Hacer el reel", con el
// guion tal como lo dejó (sql/reels_con_guion_aprobado.sql).
export async function verClips(urls, dir, { conImagenes = true } = {}) {
  const clips = [];
  for (const [k, url] of (urls || []).entries()) {
    const ext = (String(url).match(/\.(mp4|mov|webm|m4v|3gp)(?:\?|$)/i)?.[1] || 'mp4').toLowerCase();
    const archivo = path.join(dir, `clip_${k + 1}.${ext}`);
    await bajar(url, archivo);
    const dur = await duracionDe(archivo);
    if (!dur) throw new Error(`El clip ${k + 1} no se puede leer.`);
    const frames = [];
    if (conImagenes) {
      for (const [j, f] of [0.2, 0.5, 0.8].entries()) {
        const ruta = path.join(dir, `clip_${k + 1}_${j + 1}.jpg`);
        await correr(FFMPEG, ['-v', 'error', '-ss', (dur * f).toFixed(2), '-i', archivo, '-frames:v', '1',
          '-vf', 'scale=384:-2', '-q:v', '4', '-y', ruta]);
        frames.push({ ruta, mime: 'image/jpeg', b64: (await readFile(ruta)).toString('base64') });
      }
    }
    clips.push({ n: k + 1, url, archivo, dur, frames });
  }
  return clips;
}

export async function escribirGuion({ para, empresa, telefono, pensar }) {
  if (!para.clips?.length) {
    return normalizarGuion(leerJson(await pensar(promptGuion({ para, empresa, telefono }))));
  }
  // Con video del dueño: el guion se escribe MIRANDO sus clips.
  const dir = await mkdtemp(path.join(tmpdir(), 'reel-guion-'));
  try {
    const clips = await verClips(para.clips, dir);
    const conInfo = { ...para, clips_info: clips.map((c) => ({ n: c.n, dur: c.dur })) };
    const imagenes = clips.flatMap((c) => c.frames);
    const g = normalizarGuion(leerJson(await pensar(promptGuion({ para: conInfo, empresa, telefono }), imagenes)));
    // El modelo a veces nombra "Clip 3" con un solo clip: se reparte entre
    // los que de verdad hay, para que el dueño vea en el Paso 2 lo real.
    g.tomas = g.tomas.map((t) => ({ ...t, clip: ((Math.max(1, t.clip) - 1) % clips.length) + 1 }));
    return g;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function armarReel({ para, guion: guionDado = null, logoUrl, telefono, empresa, raiz, pensar, pedirToma, subirVideo, log = () => {} }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'reel-armar-'));
  const avisos = [];
  try {
    const conVoz = para.receta?.voz?.hay !== false;
    log(`  reel: formato ${para.formato}`);

    // 1. Guion: el que aprobó el dueño o, si no hay, uno nuevo.
    const guion = guionDado ? normalizarGuion(guionDado) : await escribirGuion({ para, empresa, telefono, pensar });
    log(`  reel: guion con ${guion.tomas.length} tomas`);

    // 2. Tomas. Con video del dueño, sus clips (gratis); si no, imágenes de
    // estudio en paralelo (cada una tarda casi un minuto y cuesta).
    const conClips = !!para.clips?.length;
    const tomas = [];
    let videos = [];
    if (conClips) {
      videos = await verClips(para.clips, dir, { conImagenes: false });
      for (const t of guion.tomas) {
        const v = videos[(Math.max(1, t.clip || 1) - 1) % videos.length];
        tomas.push({ ...t, archivo: v.archivo, durClip: v.dur });
      }
    }
    const resultados = conClips ? [] : await Promise.allSettled(guion.tomas.map((t) => pedirToma({ toma: t.escena })));
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
    // Con clips cada toma es UN corte (ya hay movimiento real); con imágenes,
    // dos (abierto y acercamiento) para que tenga ritmo de anuncio.
    const cortes = conClips ? tomas.length : tomas.length * 2;
    const totalDeseado = Math.min(MAX + 2, Math.max(MIN, vozDur ? ARRANQUE_VOZ + vozDur + 0.3 : INTRO + cortes * 2 + CIERRE));
    const cuerpo = Math.max(totalDeseado - INTRO - CIERRE, cortes * 1.4);
    const porCorte = cuerpo / cortes;
    const total = INTRO + cuerpo + CIERRE;

    const logo = logoUrl ? await bajar(logoUrl, path.join(dir, 'logo.png')).catch(() => null) : null;
    const clips = [];
    clips.push(await clipPlaca({ dir, nombre: 'intro', dur: INTRO, logo,
      lineas: [{ texto: guion.titular, y: logo ? 0.57 : 0.42, tam: 140, letrero: true }] }));
    for (const [i, t] of tomas.entries()) {
      if (conClips) {
        clips.push(await clipVideo({ dir, i, archivo: t.archivo, durClip: t.durClip, momento: t.momento,
          dur: porCorte, texto: t.texto }));
        continue;
      }
      clips.push(await clipToma({ dir, i, imagen: t.imagen, dur: porCorte, mov: t.movimiento, texto: t.texto }));
      clips.push(await clipToma({ dir, i, imagen: t.imagen, dur: porCorte, mov: t.movimiento, texto: null, cerrado: true }));
    }
    clips.push(await clipPlaca({ dir, nombre: 'cierre', dur: CIERRE, logo,
      lineas: [
        { texto: guion.cierre, y: 0.555, tam: 104, letrero: true },
        ...(telefono ? [{ texto: `WhatsApp ${telefono}`, y: 0.71, tam: 78, fuente: FUENTE_TEXTO }] : []),
        // Sin descuento (decisión del dueño por promoción) no se promete nada.
        { texto: para.sin_descuento ? 'Visítanos o escríbenos' : 'Di que lo viste aquí: 5% de descuento',
          y: 0.78, tam: 58, fuente: FUENTE_TEXTO, color: '0xDDDDDD' },
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
        + `:fontsize=70:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=18`
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
      // La música (nivelada a -14 LUFS en equipo\musica) va presente y se
      // agacha sola cuando habla el locutor (sidechain), como en la radio.
      filtroA = `[${iv}:a]adelay=${Math.round(ARRANQUE_VOZ * 1000)}:all=1,volume=1.6,asplit=2[v][vsc];`
        + `[${im}:a]volume=0.45,afade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2[m0];`
        + `[m0][vsc]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=350[m];`
        + `[v][m]amix=inputs=2:duration=longest:normalize=0[a]`;
    } else if (vozDur) {
      filtroA = `[${iv}:a]adelay=${Math.round(ARRANQUE_VOZ * 1000)}:all=1,volume=1.6,apad[a]`;
    } else if (musica) {
      filtroA = `[${im}:a]volume=0.9,afade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2[a]`;
    } else {
      entradasA.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
      filtroA = '[1:a]anull[a]';
    }
    // Todo el audio a -14 LUFS, el nivel de TikTok/Instagram: sin esto el
    // reel sonaba más bajito que los videos de al lado (prueba 04/10: -18).
    filtroA = filtroA.replace(/\[a\]$/, ',loudnorm=I=-14:TP=-1.5:LRA=11[a]');
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
