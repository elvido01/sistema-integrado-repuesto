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
//   4. MONTAJE   ffmpeg, según la PLANTILLA del guion (16/10/2026: anuncio,
//                ¿le sirve?, ¿cuánto cuesta?, POV, ¿sabías que?, vitrina):
//                la pieza con el gancho en el primer cuadro, tomas con
//                movimiento y letras, pantalla especial, cierre, subtítulos.
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

// ── LAS PLANTILLAS DE MONTAJE (16/10/2026) ──────────────────────────────
// "Los reels son prácticamente idénticos": la receta del reel modelo cambiaba
// las tomas, pero el molde era siempre el mismo (logo, 4 fotos con zoom,
// cierre, locutor de anuncio y 5%). Y YouTube deja sin monetizar lo
// "repetitivo o producido en masa" desde julio de 2025. Cada plantilla cambia
// la ESTRUCTURA: el gancho, el ritmo, la voz, la duración y la pantalla
// especial (lista de motos, precio). Todas abren con la PIEZA en el primer
// cuadro (antes abría el logo sobre negro: era la miniatura del reel).
export const PLANTILLAS = {
  anuncio: {
    nombre: 'Anuncio', tomas: 4, cortes: 2, min: 15, max: 30, cierre: 2.6, descuento: true, voz: 'ash',
    instrucciones: 'Eres locutor de anuncios comerciales de radio y televisión en República Dominicana. '
      + 'Acento caribeño dominicano, voz con mucha energía, entusiasmo y seguridad, como un anuncio de tienda que vende. '
      + 'Ritmo rápido y con pegada: remata cada frase corta con fuerza, sube la emoción en las exclamaciones, '
      + 'pausas cortas y dramáticas antes del llamado a la acción. Sonríe al hablar. Nunca suenes leído ni monótono.',
  },
  le_sirve: {
    nombre: '¿Le sirve a tu moto?', tomas: 3, cortes: 1, min: 14, max: 26, cierre: 2.4, extra: 'lista', voz: 'onyx',
    instrucciones: 'Eres el vendedor del mostrador de una tienda de repuestos de moto en República Dominicana. '
      + 'Acento dominicano, seguro y amable, hablándole directo al cliente que pregunta si la pieza le sirve. '
      + 'Ritmo ágil y natural, sin gritar, como en una conversación.',
  },
  cuanto_cuesta: {
    nombre: '¿Cuánto crees que cuesta?', tomas: 3, cortes: 2, min: 12, max: 24, cierre: 2.4, extra: 'precio', descuento: true, voz: 'verse',
    instrucciones: 'Eres un presentador dominicano jugando con el público en un video corto. Tono divertido y de suspenso, '
      + 'retando al que mira a adivinar. Acento dominicano, cercano, con una pausa antes de la revelación.',
  },
  pov: {
    nombre: 'POV: llegas a Morla', tomas: 4, cortes: 1, min: 9, max: 18, cierre: 2.0, voz: 'coral', ganchoPov: true,
    instrucciones: 'Voz joven dominicana, natural y cercana, como contándole una historia corta a un amigo en TikTok. '
      + 'Nada de locutor ni de anuncio: relajada, con humor, frases muy cortas.',
  },
  sabias_que: {
    nombre: '¿Sabías que…?', tomas: 3, cortes: 2, min: 15, max: 30, cierre: 2.4, voz: 'nova',
    instrucciones: 'Eres una experta en motos de República Dominicana explicando algo útil en un video corto. '
      + 'Tono claro, cálido y seguro, como una buena maestra; acento dominicano; ritmo medio, sin prisa y sin exagerar.',
  },
  vitrina: {
    nombre: 'Vitrina sin voz', tomas: 3, cortes: 2, min: 8, max: 11, cierre: 1.8, sinVoz: true,
  },
};

// Las motos compatibles de verdad. get_nombres_modelos trae ruido de la
// migración ("17", "12", "PORTA PLACA" en un porta placa, "UNIVERSAL"):
// fuera los números solos, lo universal y lo que es el nombre de la pieza.
export function motosDe(producto) {
  const desc = String(producto?.descripcion || '').toUpperCase().trim();
  const vistas = new Set();
  return String(producto?.modelos || '').split(',')
    .map((m) => m.replace(/\s+/g, ' ').trim().toUpperCase())
    .filter((m) => m && /[A-Z]/.test(m) && m.length <= 22 && !/UNIVERSAL|GENERIC|VARIOS|TODAS/.test(m)
      && !desc.startsWith(m) && !vistas.has(m) && vistas.add(m))
    .slice(0, 8);
}

// El precio que paga el cliente. En MotoFlow el precio de catálogo YA
// incluye el ITBIS (convención del POS, useVentas: el ITBIS se desglosa de
// adentro). Lo confirmó el dueño el 16/10 con FT-4463: botella CG a
// 2,140.01 de catálogo = 2,140.01 en caja.
export function precioFinal(producto) {
  const precio = Number(producto?.precio || 0);
  if (!(precio > 0)) return null;
  return `RD$ ${Math.round(precio).toLocaleString('en-US')}`;
}

// Las que se pueden hacer con esta pieza: "¿Le sirve?" pide al menos 2 motos
// reales; "¿Cuánto cuesta?" pide precio; la vitrina no sirve con
// los videos del dueño (su gracia es la voz que describe lo que se ve).
export function plantillasPosibles(para) {
  return Object.keys(PLANTILLAS).filter((k) => {
    if (k === 'le_sirve') return motosDe(para.producto).length >= 2;
    if (k === 'cuanto_cuesta') return !!precioFinal(para.producto);
    if (k === 'vitrina') return !para.clips?.length;
    return true;
  });
}

// Rotación: la que hace más tiempo que no sale (historial local del
// Creativo), sin repetir nunca la última. Empate: al azar.
const HISTORIAL = path.resolve(import.meta.dirname, '..', 'run', 'reel_plantillas.json');
export async function elegirPlantilla(para, { historial = null } = {}) {
  let usadas = historial;
  if (!usadas) {
    try { usadas = JSON.parse(await readFile(HISTORIAL, 'utf8')); } catch { usadas = []; }
  }
  const posibles = plantillasPosibles(para);
  const ultima = usadas[usadas.length - 1];
  const candidatas = posibles.filter((k) => k !== ultima);
  const lista = candidatas.length ? candidatas : posibles;
  const hace = (k) => { const i = usadas.lastIndexOf(k); return i < 0 ? Infinity : usadas.length - i; };
  const mayor = Math.max(...lista.map(hace));
  const mejores = lista.filter((k) => hace(k) === mayor);
  return mejores[Math.floor(Math.random() * mejores.length)];
}
async function anotarPlantilla(k) {
  let usadas = [];
  try { usadas = JSON.parse(await readFile(HISTORIAL, 'utf8')); } catch { /* primera vez */ }
  usadas.push(k);
  try { await writeFile(HISTORIAL, JSON.stringify(usadas.slice(-30)), 'utf8'); } catch { /* sin carpeta run: rota igual al azar */ }
}

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
// Lo que pide cada plantilla: el encargo, el titular, el largo de la voz y
// sus reglas. La receta del reel modelo queda para el estilo de las tomas.
const ENCARGO = {
  anuncio: [
    'Vas a escribir el guion de un ANUNCIO en REEL vertical (TikTok, Instagram, YouTube Shorts) de UNA pieza:',
    'un comercial que VENDE, con energía de anuncio de radio, no un video explicativo.',
  ],
  le_sirve: [
    'Vas a escribir el guion de un REEL vertical (TikTok, Instagram, YouTube Shorts) de UNA pieza en formato "¿LE SIRVE A TU MOTO?":',
    'responde la pregunta que más hacen los clientes. Abre con la pieza y la pregunta; las tomas muestran la pieza; después',
    'el montador pone una pantalla con la LISTA de motos compatibles (sale de los datos: no la escribas tú).',
    'La voz le habla al cliente ("¿Tienes una X o una Y? Esta pieza te sirve"), nombra 2 o 3 motos de la lista y lo invita',
    'a escribir por WhatsApp con el modelo de su moto si no la ve.',
  ],
  cuanto_cuesta: [
    'Vas a escribir el guion de un REEL vertical (TikTok, Instagram, YouTube Shorts) de UNA pieza en formato "¿CUÁNTO CREES QUE CUESTA?":',
    'un juego con el público. Abre retando a adivinar el precio; las tomas muestran la pieza desde varios ángulos mientras',
    'la voz da pistas de qué es y para qué sirve; al final el montador REVELA el precio en pantalla.',
    'La voz termina con algo como "¿Acertaste? Mira el precio en pantalla", sin decirlo.',
  ],
  pov: [
    'Vas a escribir el guion de un REEL vertical en formato "POV" de TikTok, de UNA pieza: en primera persona, como si el que',
    'mira fuera el cliente que llega a la tienda buscando esta pieza. El titular es el texto POV que va encima de las primeras',
    'tomas. Cortes rápidos. La voz es una mini historia con humor que termina en que en la tienda la tenían.',
  ],
  sabias_que: [
    'Vas a escribir el guion de un REEL vertical educativo en formato "¿SABÍAS QUE…?", sobre UNA pieza: enseña algo útil',
    '(para qué sirve, cómo saber cuándo cambiarla o un cuidado básico). NO es un anuncio. Abre con una pregunta que dé',
    'curiosidad. SOLO consejos generales y seguros que cualquier mecánico confirmaría; sin cifras (kilómetros, medidas, horas)',
    'que no estén en los datos. Termina con que en la tienda la tienes.',
  ],
  vitrina: [
    'Vas a escribir el guion de una VITRINA SIN VOZ de UNA pieza: 8 a 10 segundos, solo música y letras rápidas, para que',
    'se repita en bucle. Cada toma es un ángulo distinto de la pieza con 1 a 3 palabras de impacto.',
  ],
};
const TITULAR = {
  anuncio: '2 a 4 PALABRAS EN MAYÚSCULAS para la apertura (ej. LLEGÓ EL PISTÓN)',
  le_sirve: 'la pregunta de apertura, 2 a 5 PALABRAS EN MAYÚSCULAS (ej. ¿LE SIRVE A TU CG?)',
  cuanto_cuesta: '¿CUÁNTO CREES QUE CUESTA? o una variante de hasta 5 palabras EN MAYÚSCULAS',
  pov: 'el texto POV en minúsculas como en TikTok, máximo 60 letras (ej. pov: tu moto no prende y llegas a morla)',
  sabias_que: 'la pregunta de apertura, 3 a 6 PALABRAS EN MAYÚSCULAS (ej. ¿SABÍAS ESTO DE TU CADENA?)',
  vitrina: '2 o 3 PALABRAS EN MAYÚSCULAS',
};
const LARGO_VOZ = {
  anuncio: 'el locutor: 30 a 45 palabras (entre 15 y 22 segundos), frases MUY cortas',
  le_sirve: 'el vendedor: 28 a 40 palabras, frases cortas',
  cuanto_cuesta: 'el presentador: 22 a 35 palabras, frases cortas',
  pov: 'la historia: 12 a 25 palabras, frases muy cortas',
  sabias_que: 'la explicación: 40 a 55 palabras (20 a 26 segundos), frases claras',
  vitrina: 'null (no lleva voz)',
};

export const promptGuion = ({ para, empresa, telefono, plantilla = 'anuncio' }) => {
  const r = { ...(para.receta || {}) };
  delete r.voz_original;   // sus palabras no se copian: ni se le enseñan
  const p = para.producto || {};
  const P = PLANTILLAS[plantilla] || PLANTILLAS.anuncio;
  const motos = motosDe(p);
  const conDescuento = P.descuento && !para.sin_descuento;
  return [
    `Eres el director creativo de ${empresa || 'Repuestos Morla'}, tienda de repuestos de moto en Higüey, República Dominicana.`,
    ...(ENCARGO[plantilla] || ENCARGO.anuncio),
    'Toma de la RECETA de un reel que le gustó al dueño el ESTILO de las tomas (escenario, luz, ángulos, ritmo);',
    'la estructura la manda el formato de arriba. NUNCA copies su marca, su producto ni sus frases.',
    '',
    'LA PIEZA (datos reales del sistema, son lo ÚNICO que puedes afirmar):',
    `- Descripción: ${p.descripcion}`,
    `- Código: ${p.codigo}`,
    p.marca ? `- Marca: ${p.marca}` : '',
    motos.length ? `- Motos compatibles: ${motos.join(', ')}` : '- Motos compatibles: (no registradas: NO menciones ninguna moto ni modelo)',
    '',
    'LA RECETA:',
    '```json', JSON.stringify(r, null, 1), '```',
    para.nota_dueno ? `Nota del dueño sobre este formato: ${para.nota_dueno}` : '',
    '',
    'Devuelve SOLO este JSON, sin texto alrededor:',
    '{',
    `  "titular": "${TITULAR[plantilla] || TITULAR.anuncio}",`,
    '  "tomas": [',
    '    { "escena": "in ENGLISH, what the camera sees: the product + setting + angle (e.g. a hand holding the part close to camera, dark garage behind, red rim light)",',
    `      "movimiento": "uno de: ${MOVIMIENTOS.join(', ')}",`,
    '      "texto": "2 o 3 PALABRAS DE IMPACTO EN MAYÚSCULAS (ej. FRENA SEGURO, YA LLEGÓ, ORIGINAL), o null" }',
    '  ],',
    `  "voz": "${LARGO_VOZ[plantilla] || LARGO_VOZ.anuncio}",`,
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
      `- ${P.tomas} tomas, distintas entre sí. La pieza SIEMPRE es la protagonista.`
        + (P.ganchoPov ? ' Las tomas van SIN "texto" (null), salvo la última (ej. LA TENÍAN).' : ` Al menos ${P.tomas - 1} llevan "texto".`),
    ]),
    ...(plantilla === 'anuncio' ? [
      '- La voz es de COMERCIAL: primera frase = gancho fuerte (exclamación o pregunta al motoconchista, ej. "¡Tu moto merece lo mejor!"),',
      '  luego 1 o 2 beneficios en frases de 3 a 7 palabras, un toque de urgencia ("¡Ya llegó!", "¡No te quedes sin la tuya!"),',
      '  y cierre con llamado a la acción. Nada de explicaciones largas ni de leer el nombre del catálogo completo.',
    ] : P.sinVoz ? [] : [
      '- La primera frase de la voz es el gancho y tiene que entenderse sola en 2 segundos. Nada de leer el nombre del catálogo completo.',
    ]),
    '- En la VOZ, las abreviaturas del catálogo se dicen completas o no se dicen: JGO = juego, DEL. = delantero, TRAS. = trasero;',
    '  y la marca de la pieza solo si suena natural. Di la pieza como la nombra un motoconchista ("las botellas de la CG").',
    '- NO inventes medidas, cilindradas, materiales, certificaciones ni motos que no estén arriba.',
    '- Los números y siglas del NOMBRE de la pieza (ej. 5100, 7100, 10W40, 20W50, 4T, 2T, SAE, 6203) son parte del nombre',
    '  o de la especificación, NUNCA modelos de moto. "Compatible con modelos 5100" es un error grave.',
    '  Solo nombra motos que estén en "Motos compatibles".',
    '  Si la receta pide datos técnicos y no los hay, habla de lo que sí se sabe (para qué moto, que está disponible).',
    '- PROHIBIDO mencionar el precio, "pesos", cifras de dinero o la palabra "precio" en la VOZ (decisión del dueño).',
    '  Tampoco pongas el precio en el "texto" de las tomas: si el formato lo revela, lo pone el montador.',
    P.sinVoz ? '' : conDescuento
      ? '- La voz termina invitando a venir o escribir al WhatsApp, y diciendo que si dicen que lo vieron en las redes se lo llevan con 5% de descuento.'
      : '- La voz termina invitando a venir o escribir al WhatsApp. NO menciones descuento, rebaja, oferta de precio ni código.',
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
  // (16/10/2026) La plantilla viaja dentro del guion: el dueño lo aprueba y
  // el reel se arma después, con la MISMA plantilla. Los guiones de antes no
  // la traen: son anuncios.
  const plantilla = PLANTILLAS[g.plantilla] ? g.plantilla : 'anuncio';
  const P = PLANTILLAS[plantilla];
  return {
    plantilla,
    titular: P.ganchoPov
      ? limpioTexto(g.titular, 60).toLowerCase() || 'pov: llegas a la tienda'
      : limpioTexto(g.titular, 30).toUpperCase() || 'YA DISPONIBLE',
    tomas,
    voz: P.sinVoz ? '' : sinPrecio(limpioTexto(g.voz, 600)),
    cierre: limpioTexto(g.cierre, 34).toUpperCase() || 'YA DISPONIBLE EN HIGÜEY',
    descripcion_redes: limpioTexto(g.descripcion_redes, 400),
    // La lista de "¿Le sirve?" y el precio de "¿Cuánto cuesta?" salen de los
    // datos (no de la IA); el dueño los puede corregir en el Paso 2.
    ...(plantilla === 'le_sirve' ? {
      motos: (Array.isArray(g.motos) ? g.motos : String(g.motos || '').split(','))
        .map((m) => limpioTexto(m, 22).toUpperCase()).filter(Boolean).slice(0, 8),
    } : {}),
    ...(plantilla === 'cuanto_cuesta' ? { precio_texto: limpioTexto(g.precio_texto, 20) } : {}),
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
async function grabarVoz(texto, archivo, P = PLANTILLAS.anuncio) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Falta OPENAI_API_KEY para la voz.');
  const pedir = (cuerpo) => fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  let r = await pedir({
    // El anuncio conserva su voz (REEL_VOZ); las demás plantillas, la suya.
    model: 'gpt-4o-mini-tts', voice: P === PLANTILLAS.anuncio ? VOZ : (P.voz || VOZ), input: texto, response_format: 'mp3',
    instructions: P.instrucciones || INSTRUCCIONES_VOZ,
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

// El gancho puede ser una pregunta larga ("¿CUÁNTO CREES QUE CUESTA?"): con
// letra de 140 la primera línea se salía por los lados.
const tamLetrero = (texto) => {
  const resto = String(texto || '').trim().split(/\s+/).slice(0, -1).join(' ').length;
  return resto > 18 ? 104 : resto > 12 ? 120 : 140;
};

const H264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-r', String(FPS)];

// (04/10/2026) "Más comercial": cada toma se corta en DOS planos (el abierto
// con su movimiento y un acercamiento con golpe de zoom) y cada corte entra
// con un destello. Con 4 tomas son 8 cortes de ~2 s: ritmo de anuncio.
async function clipToma({ dir, i, imagen, dur, mov, texto, cerrado = false, pov = false }) {
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
    // La letra de las piezas (plata + oro), entrando de golpe; el POV, en su caja.
    filtros.push(...(pov ? await filtrosPov(dir, texto)
      : await letrero(dir, texto, { y: 'h*0.10', tam: tamLetrero(texto), alpha: 'if(lt(t,0.12),t/0.12,1)' })));
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
async function clipVideo({ dir, i, archivo, durClip, momento, dur, texto, pov = false }) {
  const base = { inicio: 0.05, medio: 0.4, final: 0.72 }[momento] ?? 0.05;
  const desde = Math.max(0, Math.min(durClip * base, durClip - dur - 0.05));
  const filtros = [
    `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${FPS}`,
    'eq=contrast=1.05:saturation=1.1',
  ];
  if (texto) {
    filtros.push(...(pov ? await filtrosPov(dir, texto)
      : await letrero(dir, texto, { y: 'h*0.10', tam: tamLetrero(texto), alpha: 'if(lt(t,0.12),t/0.12,1)' })));
  }
  filtros.push(`fade=t=in:st=0:d=0.1:color=white,fade=t=out:st=${Math.max(0, dur - 0.08).toFixed(2)}:d=0.08`);
  const guion = path.join(dir, `f_video${i}.txt`);
  await writeFile(guion, filtros.join(','), 'utf8');
  const salida = path.join(dir, `clip_${String(i + 1).padStart(2, '0')}v.mp4`);
  await correr(FFMPEG, ['-v', 'error', '-y', '-stream_loop', '-1', '-ss', desde.toFixed(2), '-i', archivo,
    '-filter_script:v', guion, '-t', dur.toFixed(2), ...H264, '-an', salida]);
  return salida;
}

// (16/10/2026) El texto POV: minúsculas blancas sobre caja negra, arriba,
// como lo escribe la gente en TikTok. Partido en renglones de ~22 letras.
const FUENTE_SIMBOLOS = existsSync('C:/Windows/Fonts/seguisym.ttf') ? 'C:/Windows/Fonts/seguisym.ttf' : null;
export function renglones(texto, max = 22) {
  const out = [];
  for (const p of String(texto || '').split(/\s+/).filter(Boolean)) {
    if (out.length && (out[out.length - 1] + ' ' + p).length <= max) out[out.length - 1] += ` ${p}`;
    else out.push(p);
  }
  return out.slice(0, 3);
}
async function filtrosPov(dir, texto) {
  const filtros = [];
  for (const [k, l] of renglones(texto).entries()) {
    filtros.push(`drawtext=fontfile='${rutaFiltro(FUENTE_TEXTO)}':expansion=none`
      + `:textfile='${await archivoTexto(dir, l)}':fontsize=66:fontcolor=white:box=1:boxcolor=black@0.78:boxborderw=16`
      + `:x=(w-text_w)/2:y=h*0.11+${k * 96}`);
  }
  return filtros;
}

// El fondo de las pantallas especiales: la toma desenfocada y oscurecida,
// con la pieza nítida arriba. Devuelve las partes del filter_complex.
const fondoConPieza = (alto) => [
  `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=24:2,eq=brightness=-0.28:saturation=0.9,setsar=1[bg]`,
  `[1:v]scale=w=720:h=${alto}:force_original_aspect_ratio=decrease[pz]`,
  `[bg][pz]overlay=x=(W-w)/2:y=H*0.06[b0]`,
];
async function pantallaEspecial({ dir, nombre, fondo, dur, partes }) {
  const n = Math.round(dur * FPS);
  const guion = path.join(dir, `f_${nombre}.txt`);
  await writeFile(guion, partes.join(';'), 'utf8');
  const salida = path.join(dir, `${nombre}.mp4`);
  await correr(FFMPEG, ['-v', 'error', '-y', '-loop', '1', '-t', dur.toFixed(2), '-i', fondo,
    '-loop', '1', '-t', dur.toFixed(2), '-i', fondo, '-filter_complex_script', guion,
    '-map', '[out]', '-frames:v', String(n), ...H264, '-an', salida]);
  return salida;
}

// "¿Le sirve a tu moto?": la pieza arriba y la lista de motos, una por una
// con su ✔. Más de 4 motos: dos columnas.
async function clipLista({ dir, fondo, titulo, motos, dur }) {
  const partes = fondoConPieza(700);
  let v = '[b0]';
  partes.push(`${v}${(await letrero(dir, titulo, { y: 'h*0.405', tam: 104 })).join(',')}[b1]`);
  v = '[b1]';
  const dosColumnas = motos.length > 4;
  for (const [k, moto] of motos.entries()) {
    const col = dosColumnas ? k % 2 : 0;
    const fila = dosColumnas ? Math.floor(k / 2) : k;
    const x = dosColumnas ? (col ? 'w*0.54' : 'w*0.10') : 'w*0.22';
    const y = `h*${(0.535 + fila * 0.066).toFixed(3)}`;
    const desde = (0.35 + k * 0.3).toFixed(2);
    const alpha = `if(lt(t,${desde}),0,min(1,(t-${desde})/0.2))`;
    const marca = FUENTE_SIMBOLOS
      ? `drawtext=fontfile='${rutaFiltro(FUENTE_SIMBOLOS)}':expansion=none:textfile='${await archivoTexto(dir, '✔')}'`
        + `:fontsize=62:fontcolor=${ORO}:x=${x}:y=${y}:alpha='${alpha}',`
      : '';
    const sig = `[c${k}]`;
    partes.push(`${v}${marca}drawtext=fontfile='${rutaFiltro(FUENTE_TITULO)}':expansion=none`
      + `:textfile='${await archivoTexto(dir, moto)}':fontsize=66:fontcolor=white:borderw=4:bordercolor=black@0.8`
      + `:x=${x}+80:y=${y}:alpha='${alpha}'${sig}`);
    v = sig;
  }
  partes.push(`${v}fade=t=in:st=0:d=0.15:color=white,fade=t=out:st=${(dur - 0.12).toFixed(2)}:d=0.12[out]`);
  return pantallaEspecial({ dir, nombre: 'lista', fondo, dur, partes });
}

// "¿Cuánto crees que cuesta?": la pieza, un redoble y el precio FINAL.
async function clipPrecio({ dir, fondo, precio, dur }) {
  const partes = fondoConPieza(760);
  const aparece = 'if(lt(t,0.7),0,min(1,(t-0.7)/0.15))';
  partes.push(`[b0]drawtext=fontfile='${rutaFiltro(FUENTE_TEXTO)}':expansion=none:textfile='${await archivoTexto(dir, 'EL PRECIO ES…')}'`
    + `:fontsize=64:fontcolor=0xDDDDDD:borderw=3:bordercolor=black@0.8:x=(w-text_w)/2:y=h*0.50[b1]`);
  partes.push(`[b1]${(await letrero(dir, precio, { y: 'h*0.555', tam: 150, alpha: aparece })).join(',')}[b2]`);
  partes.push(`[b2]drawtext=fontfile='${rutaFiltro(FUENTE_TEXTO)}':expansion=none:textfile='${await archivoTexto(dir, 'ITBIS incluido')}'`
    + `:fontsize=50:fontcolor=0xDDDDDD:x=(w-text_w)/2:y=h*0.735:alpha='${aparece}'[b3]`);
  partes.push(`[b3]fade=t=in:st=0:d=0.15:color=white,fade=t=out:st=${(dur - 0.12).toFixed(2)}:d=0.12[out]`);
  return pantallaEspecial({ dir, nombre: 'precio', fondo, dur, partes });
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
  // (16/10/2026) Cada guion sale con su plantilla, rotando (ver PLANTILLAS).
  const plantilla = para.plantilla && plantillasPosibles(para).includes(para.plantilla)
    ? para.plantilla : await elegirPlantilla(para);
  const conDatos = (bruto) => {
    const g = { ...leerJson(bruto), plantilla };
    if (plantilla === 'le_sirve') g.motos = motosDe(para.producto);
    if (plantilla === 'cuanto_cuesta') g.precio_texto = precioFinal(para.producto);
    return normalizarGuion(g);
  };
  let g;
  if (!para.clips?.length) {
    g = conDatos(await pensar(promptGuion({ para, empresa, telefono, plantilla })));
  } else {
    // Con video del dueño: el guion se escribe MIRANDO sus clips.
    const dir = await mkdtemp(path.join(tmpdir(), 'reel-guion-'));
    try {
      const clips = await verClips(para.clips, dir);
      const conInfo = { ...para, clips_info: clips.map((c) => ({ n: c.n, dur: c.dur })) };
      const imagenes = clips.flatMap((c) => c.frames);
      g = conDatos(await pensar(promptGuion({ para: conInfo, empresa, telefono, plantilla }), imagenes));
      // El modelo a veces nombra "Clip 3" con un solo clip: se reparte entre
      // los que de verdad hay, para que el dueño vea en el Paso 2 lo real.
      g.tomas = g.tomas.map((t) => ({ ...t, clip: ((Math.max(1, t.clip) - 1) % clips.length) + 1 }));
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
  await anotarPlantilla(plantilla);
  return g;
}

export async function armarReel({ para, guion: guionDado = null, logoUrl, telefono, empresa, raiz, pensar, pedirToma, subirVideo, log = () => {} }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'reel-armar-'));
  const avisos = [];
  try {
    // 1. Guion: el que aprobó el dueño o, si no hay, uno nuevo. La plantilla
    // viene dentro del guion (los de antes del 16/10 son anuncios).
    const guion = guionDado ? normalizarGuion(guionDado) : await escribirGuion({ para, empresa, telefono, pensar });
    const P = PLANTILLAS[guion.plantilla] || PLANTILLAS.anuncio;
    // La receta sin voz manda solo en el anuncio: las demás plantillas son
    // con voz por diseño (salvo la vitrina).
    const conVoz = !P.sinVoz && (guion.plantilla !== 'anuncio' || para.receta?.voz?.hay !== false);
    log(`  reel: plantilla ${guion.plantilla} · receta ${para.formato} · ${guion.tomas.length} tomas`);

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
      await grabarVoz(guion.voz, voz, P);
      vozDur = await duracionDe(voz);
      log(`  reel: voz ${vozDur.toFixed(1)} s`);
    }

    // 4. Tiempos. Cada plantilla tiene su largo (la vitrina, 8 a 11 s; el
    // anuncio, 15 a 30). La voz manda; si se pasa del máximo, se acelera
    // hasta un 25%. Sin voz: cortes rápidos.
    const CIERRE = P.cierre, ARRANQUE_VOZ = 0.3, MIN = P.min, MAX = P.max;
    if (vozDur && ARRANQUE_VOZ + vozDur + 0.3 > MAX - 0.5) {
      const factor = Math.min(1.25, (ARRANQUE_VOZ + vozDur + 0.3) / (MAX - 0.5));
      const rapida = path.join(dir, 'voz_rapida.mp3');
      await correr(FFMPEG, ['-v', 'error', '-y', '-i', voz, '-filter:a', `atempo=${factor.toFixed(3)}`, rapida]);
      await correr(FFMPEG, ['-v', 'error', '-y', '-i', rapida, '-c', 'copy', voz]);
      vozDur = await duracionDe(voz);
      log(`  reel: voz acelerada x${factor.toFixed(2)} -> ${vozDur.toFixed(1)} s`);
    }
    // La pantalla especial de la plantilla (si hay con qué hacerla).
    const motos = P.extra === 'lista' ? (guion.motos || []) : [];
    const extra = P.extra === 'lista' && motos.length >= 2 ? 'lista'
      : P.extra === 'precio' && guion.precio_texto ? 'precio' : null;
    const durExtra = extra === 'lista' ? Math.min(4.2, Math.max(2.6, 1.3 + 0.3 * motos.length))
      : extra === 'precio' ? 3.2 : 0;
    // Con clips cada toma es UN corte (ya hay movimiento real); con imágenes,
    // los que diga la plantilla (dos = abierto + acercamiento).
    const porToma = conClips ? 1 : P.cortes;
    const cortes = tomas.length * porToma;
    const porCorteSinVoz = P.sinVoz ? 1.1 : 2;
    const totalDeseado = Math.min(MAX + 2, Math.max(MIN, vozDur
      ? ARRANQUE_VOZ + vozDur + 0.3
      : cortes * porCorteSinVoz + durExtra + CIERRE));
    const cuerpo = Math.max(totalDeseado - CIERRE - durExtra, cortes * 1.0);
    const porCorte = cuerpo / cortes;
    const finCuerpo = cuerpo + durExtra;          // ahí empieza el cierre
    const total = finCuerpo + CIERRE;

    // 5. Los cortes. El PRIMER cuadro es la pieza con el gancho encima (antes
    // era el logo sobre negro, y esa era la miniatura del reel).
    const logo = logoUrl ? await bajar(logoUrl, path.join(dir, 'logo.png')).catch(() => null) : null;
    const clips = [];
    for (const [i, t] of tomas.entries()) {
      const ultima = i === tomas.length - 1;
      // POV: el texto POV en los dos primeros cortes; la letra de la toma,
      // solo en la última. Resto: el gancho en el primer corte.
      const gancho = P.ganchoPov ? (i < 2 ? guion.titular : null) : (i === 0 ? guion.titular : null);
      const letraToma = P.ganchoPov ? (ultima ? t.texto : null) : t.texto;
      if (conClips) {
        clips.push(await clipVideo({ dir, i, archivo: t.archivo, durClip: t.durClip, momento: t.momento,
          dur: porCorte, texto: gancho || letraToma, pov: !!(gancho && P.ganchoPov) }));
        continue;
      }
      if (porToma === 2) {
        // Abierto (con el gancho en la primera toma) y acercamiento (con la
        // letra de la toma si el abierto llevó el gancho).
        clips.push(await clipToma({ dir, i, imagen: t.imagen, dur: porCorte, mov: t.movimiento,
          texto: gancho || letraToma, pov: !!(gancho && P.ganchoPov) }));
        clips.push(await clipToma({ dir, i, imagen: t.imagen, dur: porCorte, mov: t.movimiento,
          texto: gancho ? letraToma : null, cerrado: true }));
      } else {
        clips.push(await clipToma({ dir, i, imagen: t.imagen, dur: porCorte, mov: MOVIMIENTOS[(i + 2) % MOVIMIENTOS.length],
          texto: gancho || letraToma, pov: !!(gancho && P.ganchoPov) }));
      }
    }
    if (extra) {
      let fondo = tomas[0].imagen;
      if (!fondo) {
        fondo = path.join(dir, 'fondo.png');
        await correr(FFMPEG, ['-v', 'error', '-y', '-ss', (tomas[0].durClip * 0.4).toFixed(2), '-i', tomas[0].archivo,
          '-frames:v', '1', fondo]);
      }
      clips.push(extra === 'lista'
        ? await clipLista({ dir, fondo, titulo: 'SIRVE PARA', motos, dur: durExtra })
        : await clipPrecio({ dir, fondo, precio: guion.precio_texto, dur: durExtra }));
    }
    const conDescuento = P.descuento && !para.sin_descuento;
    clips.push(await clipPlaca({ dir, nombre: 'cierre', dur: CIERRE, logo,
      lineas: [
        { texto: guion.cierre, y: 0.555, tam: 104, letrero: true },
        ...(telefono ? [{ texto: `WhatsApp ${telefono}`, y: 0.71, tam: 78, fuente: FUENTE_TEXTO }] : []),
        // El 5% solo en las plantillas que venden directo y si la promoción
        // lo lleva (16/10: ya no en todos los reels).
        { texto: conDescuento ? 'Di que lo viste aquí: 5% de descuento' : 'Visítanos o escríbenos',
          y: 0.78, tam: 58, fuente: FUENTE_TEXTO, color: '0xDDDDDD' },
      ] }));
    log(`  reel: ${clips.length} cortes montados${extra ? ` + pantalla ${extra}` : ''}`);

    const lista = path.join(dir, 'lista.txt');
    await writeFile(lista, clips.map((c) => `file '${c.replace(/\\/g, '/')}'`).join('\n'), 'utf8');
    const mudo = path.join(dir, 'mudo.mp4');
    await correr(FFMPEG, ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', mudo]);

    // Subtítulos de la voz, encima de todo. En la placa de cierre no van: la
    // placa ya dice el llamado y el subtítulo le tapaba la línea del 5%.
    const subs = (vozDur ? trozosSubtitulo(guion.voz, ARRANQUE_VOZ, vozDur) : [])
      .filter((x) => x.desde < finCuerpo - 0.2)
      .map((x) => ({ ...x, hasta: Math.min(x.hasta, finCuerpo) }));
    const filtrosV = [];
    for (const s of subs) {
      filtrosV.push(`drawtext=fontfile='${rutaFiltro(FUENTE_TEXTO)}':expansion=none:textfile='${await archivoTexto(dir, s.texto)}'`
        + `:fontsize=70:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=18`
        + `:x=(w-text_w)/2:y=h*0.80:enable='between(t,${s.desde.toFixed(2)},${s.hasta.toFixed(2)})'`);
    }

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

    // Video: subtítulos y, encima, el logo chico en la esquina mientras no
    // está la placa de cierre (16/10: el logo dejó de ser el primer cuadro).
    // El logo entra el ÚLTIMO, así los números de las entradas de audio no cambian.
    const nEntradas = 1 + entradasA.filter((x) => x === '-i').length;
    let filtroV = `[0:v]${filtrosV.length ? filtrosV.join(',') : 'null'}[vs]`;
    const entradasL = [];
    if (logo) {
      entradasL.push('-i', logo);
      filtroV += `;[${nEntradas}:v]scale=170:-1,format=rgba,colorchannelmixer=aa=0.85[lg];`
        + `[vs][lg]overlay=x=W-w-36:y=40:enable='lt(t,${finCuerpo.toFixed(2)})'[vout]`;
    } else {
      filtroV += ';[vs]null[vout]';
    }
    const guionAV = path.join(dir, 'f_final.txt');
    await writeFile(guionAV, `${filtroV};${filtroA}`, 'utf8');
    const final = path.join(dir, 'reel.mp4');
    await correr(FFMPEG, ['-v', 'error', '-y', '-i', mudo, ...entradasA, ...entradasL,
      '-filter_complex_script', guionAV,
      '-map', '[vout]', '-map', '[a]', ...H264, '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
      '-t', total.toFixed(2), '-movflags', '+faststart', final]);
    const bytes = await readFile(final);
    log(`  reel: ${total.toFixed(1)} s, ${(bytes.length / 1048576).toFixed(1)} MB${musica ? '' : ' (sin música: no hay pistas en equipo\\musica)'}`);
    if (!musica) avisos.push('El reel va sin música de fondo: ponle el sonido en TikTok al publicar el borrador.');

    // 6. Subida
    const video_url = await subirVideo(bytes);
    return { video_url, formato: para.formato, plantilla: guion.plantilla, modelo_id: para.modelo_id, guion,
      duracion: Math.round(total * 10) / 10, avisos };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
