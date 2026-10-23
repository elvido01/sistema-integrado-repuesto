// Voz de Hermes — lo más cerca del JARVIS de Iron Man que da el navegador.
//
// Qué se puede y qué no, para que no haya sorpresas:
//
// SE PUEDE elegir la mejor voz instalada, bajarle el tono y medir el ritmo.
// El salto de calidad más grande no es el tono: es usar una voz NEURONAL.
// Windows trae "Microsoft Álvaro Online (Natural)" y parecidas, que suenan a
// persona; las viejas de SAPI suenan a robot por mucho que se ajusten. Por
// eso aquí se puntúa fuerte "Natural", "Online" y "Neural" en el nombre.
//
// NO SE PUEDE ponerle el filtro metálico ni el eco de la película: el
// navegador no deja pasar la salida de speechSynthesis por Web Audio. Lo que
// sale es la voz cruda del sistema.
//
// Y lo que más hace al personaje no es el timbre sino la manera: frases
// cortas, calma, nada de floritura. Eso vive en las instrucciones del
// agente, no aquí.

import { supabase } from '@/lib/customSupabaseClient';

const CLAVE_VOZ = 'motoflow_voz_hermes';

// Masculinas LATINAS que suelen venir en Windows/Chrome, de mejor a peor.
// Jorge es la mexicana neuronal y es la que más se parece al doblaje;
// Emilio es dominicana, por si se prefiere el acento de la casa.
const NOMBRES_BUENOS = ['jorge', 'alonso', 'emilio', 'gonzalo', 'tomas', 'tomás', 'lorenzo', 'diego'];

// El JARVIS de Iron Man en Latinoamérica está doblado en español NEUTRO, con
// base mexicana. Nada de castellano: el acento de España rompe el personaje
// para un oído dominicano.
function puntuarIdioma(lang) {
  if (lang === 'es-mx' || lang === 'es-us' || lang === 'es-419') return 50;  // el neutro del doblaje
  if (lang === 'es-do') return 45;                                          // la casa
  if (/^es-(co|pe|cl|ar|ve|gt|cr|pa|ec|bo|uy|py|sv|hn|ni|pr|cu)$/.test(lang)) return 35;
  if (lang === 'es-es') return 5;                                           // castellano: último recurso
  if (lang.startsWith('es')) return 25;
  return -1;
}

function puntuar(v) {
  const nombre = (v.name || '').toLowerCase();
  const lang = (v.lang || '').toLowerCase();

  const pi = puntuarIdioma(lang);
  if (pi < 0) return -1;                // fuera de español, no sirve
  let p = pi;

  // Lo que más pesa: que sea neuronal. Cambia por completo el resultado —
  // una voz vieja de SAPI suena a robot por mucho que se le ajuste el tono.
  if (/natural|neural|online/.test(nombre)) p += 100;

  const i = NOMBRES_BUENOS.findIndex((n) => nombre.includes(n));
  if (i >= 0) p += 30 - i * 2;
  if (/female|mujer|dalia|paloma|sabina|helena|laura|elvira|catalina|salome/.test(nombre)) p -= 60;

  // Las locales responden al instante; las de red a veces se cortan.
  if (v.localService) p += 5;

  return p;
}

export function listarVoces() {
  if (!('speechSynthesis' in window)) return [];
  return window.speechSynthesis.getVoices()
    .filter((v) => (v.lang || '').toLowerCase().startsWith('es'))
    .map((v) => ({ nombre: v.name, lang: v.lang, puntos: puntuar(v), neuronal: /natural|neural|online/i.test(v.name) }))
    .sort((a, b) => b.puntos - a.puntos);
}

export function vozElegida() {
  try { return window.localStorage.getItem(CLAVE_VOZ) || null; } catch { return null; }
}

export function elegirVoz(nombre) {
  try {
    if (nombre) window.localStorage.setItem(CLAVE_VOZ, nombre);
    else window.localStorage.removeItem(CLAVE_VOZ);
  } catch { /* almacenamiento lleno */ }
}

export function resolverVoz() {
  if (!('speechSynthesis' in window)) return null;
  const voces = window.speechSynthesis.getVoices();
  if (!voces.length) return null;         // aún no cargaron; ver alListarVoces

  const preferida = vozElegida();
  if (preferida) {
    const v = voces.find((x) => x.name === preferida);
    if (v) return v;
  }

  let mejor = null, mejorP = -1;
  for (const v of voces) {
    const p = puntuar(v);
    if (p > mejorP) { mejor = v; mejorP = p; }
  }
  return mejorP >= 0 ? mejor : null;
}

// Chrome carga las voces de forma asíncrona: la primera llamada a
// getVoices() suele devolver vacío. Sin esto, el primer mensaje sale con la
// voz por defecto del sistema y solo a partir del segundo suena bien.
export function alListarVoces(cb) {
  if (!('speechSynthesis' in window)) return () => {};
  if (window.speechSynthesis.getVoices().length) cb();
  const h = () => cb();
  window.speechSynthesis.addEventListener('voiceschanged', h);
  return () => window.speechSynthesis.removeEventListener('voiceschanged', h);
}

// Ritmo y tono. El 0.78 de tono salió demasiado grave —"cavernoso" más que
// "máquina"—; 0.95 deja la voz clara y solo un punto por debajo de lo
// natural, que es como suena JARVIS. Ajustables desde el panel porque esto
// depende de la voz instalada y no hay forma de acertarlo a ciegas.
const RITMO_DEF = 0.92;
const TONO_DEF = 0.95;
const CLAVE_AJUSTES = 'motoflow_voz_ajustes';

export function ajustes() {
  try {
    const j = JSON.parse(window.localStorage.getItem(CLAVE_AJUSTES) || '{}');
    return {
      ritmo: Number(j.ritmo) || RITMO_DEF,
      tono: Number(j.tono) || TONO_DEF,
      pitidos: j.pitidos !== false,
      // La voz de mayordomo (servidor) viene encendida; se apaga desde el panel.
      neuronal: j.neuronal !== false,
      vozNeural: j.vozNeural || 'onyx',
    };
  } catch { return { ritmo: RITMO_DEF, tono: TONO_DEF, pitidos: true, neuronal: true, vozNeural: 'onyx' }; }
}

export function guardarAjustes(a) {
  try { window.localStorage.setItem(CLAVE_AJUSTES, JSON.stringify({ ...ajustes(), ...a })); } catch { /* nada */ }
}

// ── El toque metálico ───────────────────────────────────────
// OJO: la voz NO se puede filtrar. El navegador no deja capturar la salida
// de speechSynthesis, asi que no hay forma de meterle reverberación ni
// ecualización — el timbre es el que traiga la voz del sistema.
//
// Lo que sí se puede es lo que de verdad hace reconocible a JARVIS: los
// pitidos de la interfaz. Un blip corto al escuchar y otro al terminar.
// Eso es Web Audio generando tonos, y no toca la voz para nada.
let ctxAudio = null;
function audio() {
  try {
    ctxAudio = ctxAudio || new (window.AudioContext || window.webkitAudioContext)();
    if (ctxAudio.state === 'suspended') ctxAudio.resume();
    return ctxAudio;
  } catch { return null; }
}

function blip({ desde = 880, hasta = 1320, dur = 0.14, vol = 0.05 } = {}) {
  const ctx = audio();
  if (!ctx) return;
  const t = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(desde, t);
  osc.frequency.exponentialRampToValueAtTime(hasta, t + dur);

  // Pasa-banda estrecho: es lo que le da el color "digital" en vez de
  // sonar a pitido de microondas.
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.frequency.value = (desde + hasta) / 2;
  filtro.Q.value = 6;

  const gan = ctx.createGain();
  gan.gain.setValueAtTime(0, t);
  gan.gain.linearRampToValueAtTime(vol, t + 0.012);
  gan.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  osc.connect(filtro).connect(gan).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const pitidoEscucha = () => blip({ desde: 660, hasta: 1180, dur: 0.13 });
export const pitidoFin = () => blip({ desde: 1180, hasta: 620, dur: 0.18, vol: 0.04 });

// ── LA VOZ DE MAYORDOMO (23/10/2026) ────────────────────────
// Lo de arriba dice que el navegador no da para más, y es verdad: por eso la
// voz buena ya no sale del navegador. La función jarvis-voz convierte el texto
// con gpt-4o-mini-tts y unas instrucciones de "mayordomo de película" (grave,
// serena, trata de señor). Suena a persona y se le puede medir el nivel, así
// que la esfera dibuja la onda mientras habla.
//
// NUNCA deja mudo a nadie: sin red, sin sesión o con el proveedor caído se
// vuelve a speechSynthesis en la misma llamada. Se apaga con el ajuste
// `neuronal: false` en el panel de voz.
//
// Partida en frases: la primera se pide sola para que empiece a sonar en un
// par de segundos, y mientras suena se pide la siguiente.

export const VOCES_NEURONALES = [
  { id: 'onyx', nombre: 'Mayordomo grave (onyx)' },
  { id: 'ash', nombre: 'Mayordomo claro (ash)' },
  { id: 'echo', nombre: 'Sereno (echo)' },
  { id: 'ballad', nombre: 'Narrador (ballad)' },
];

let sesionVoz = 0;               // sube al callar: lo que esté en vuelo se descarta
let audioNeural = null;
let controlador = null;
const cacheFrases = new Map();   // frase corta -> Blob ("Un momento…" no se cobra dos veces)
const oyentesNivel = new Set();
let nivelActual = 0;

export function alNivelVoz(cb) {
  oyentesNivel.add(cb);
  return () => oyentesNivel.delete(cb);
}
function emitirNivel(n) {
  nivelActual = n;
  oyentesNivel.forEach((f) => { try { f(n); } catch { /* un oyente roto no para la voz */ } });
}
export const nivelVoz = () => nivelActual;

function partirEnFrases(t) {
  const frases = t.match(/[^.!?¿¡;:\n]+[.!?;:\n]*/g)?.map((s) => s.trim()).filter(Boolean) || [t];
  const trozos = [];
  let actual = '';
  for (const f of frases) {
    // El primero corto, para empezar rápido; los demás hasta ~280 letras.
    const tope = trozos.length === 0 ? 140 : 280;
    if (actual && (actual.length + f.length + 1) > tope) { trozos.push(actual); actual = f; }
    else actual = actual ? `${actual} ${f}` : f;
  }
  if (actual) trozos.push(actual);
  // Un trozo suelto más largo que el máximo del servidor se corta a la fuerza.
  return trozos.flatMap((x) => (x.length <= 1100 ? [x] : x.match(/.{1,1100}(\s|$)/g) || [x]));
}

async function pedirAudio(trozo, voz, sesion) {
  const clave = `${voz}|${trozo}`;
  if (cacheFrases.has(clave)) return cacheFrases.get(clave);
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('sin_sesion');
  // fetch directo y no functions.invoke: invoke lee 'audio/mpeg' como TEXTO
  // y el audio llegaría roto.
  controlador = new AbortController();
  const base = import.meta.env.VITE_SUPABASE_URL?.trim();
  const r = await fetch(`${base}/functions/v1/jarvis-voz`, {
    method: 'POST',
    signal: controlador.signal,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ texto: trozo, voz }),
  });
  if (sesion !== sesionVoz) throw new Error('cancelado');
  const blob = r.ok ? await r.blob() : null;
  if (!blob?.size || !(blob.type || '').startsWith('audio')) throw new Error(`jarvis-voz ${r.status}`);
  if (trozo.length <= 80) {
    cacheFrases.set(clave, blob);
    if (cacheFrases.size > 40) cacheFrases.delete(cacheFrases.keys().next().value);
  }
  return blob;
}

function sonarBlob(blob, sesion) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    audioNeural = a;
    let analizador = null, datos = null, raf = 0;
    try {
      const ctx = audio();
      if (ctx) {
        const fuente = ctx.createMediaElementSource(a);
        analizador = ctx.createAnalyser();
        analizador.fftSize = 256;
        datos = new Uint8Array(analizador.frequencyBinCount);
        fuente.connect(analizador).connect(ctx.destination);
      }
    } catch { analizador = null; /* sin Web Audio suena igual, solo sin onda */ }
    const medir = () => {
      if (!analizador) return;
      analizador.getByteTimeDomainData(datos);
      let suma = 0;
      for (let i = 0; i < datos.length; i += 1) { const v = (datos[i] - 128) / 128; suma += v * v; }
      emitirNivel(Math.min(1, Math.sqrt(suma / datos.length) * 3.2));
      raf = requestAnimationFrame(medir);
    };
    const fin = (ok) => {
      cancelAnimationFrame(raf);
      emitirNivel(0);
      URL.revokeObjectURL(url);
      if (audioNeural === a) audioNeural = null;
      if (ok) resolve(); else reject(new Error('reproduccion'));
    };
    a.onended = () => fin(true);
    a.onerror = () => fin(false);
    a.onpause = () => { if (sesion !== sesionVoz) fin(true); };
    a.play().then(() => { if (analizador) raf = requestAnimationFrame(medir); }).catch(() => fin(false));
  });
}

async function hablarNeural(limpio, { alEmpezar, alTerminar }, sesion, aj) {
  const trozos = partirEnFrases(limpio);
  let empezo = false;
  let siguiente = pedirAudio(trozos[0], aj.vozNeural, sesion);
  for (let i = 0; i < trozos.length; i += 1) {
    let blob;
    try {
      blob = await siguiente;
    } catch (e) {
      if (sesion !== sesionVoz) return;
      // Falló el servidor: lo que falta se dice con la voz del sistema.
      hablarSistema(trozos.slice(i).join(' '), { alEmpezar: empezo ? undefined : alEmpezar, alTerminar });
      return;
    }
    if (sesion !== sesionVoz) return;
    if (i + 1 < trozos.length) siguiente = pedirAudio(trozos[i + 1], aj.vozNeural, sesion);
    if (!empezo) {
      empezo = true;
      if (aj.pitidos) blip({ desde: 980, hasta: 1460, dur: 0.1, vol: 0.035 });
      alEmpezar?.();
    }
    try {
      await sonarBlob(blob, sesion);
    } catch {
      if (sesion !== sesionVoz) return;
      hablarSistema(trozos.slice(i).join(' '), { alTerminar });
      return;
    }
    if (sesion !== sesionVoz) return;
  }
  if (aj.pitidos) pitidoFin();
  alTerminar?.();
}

export function hablar(texto, opciones = {}) {
  if (!texto) return null;
  callar();
  const a = ajustes();
  const limpio = limpiarParaVoz(texto);
  if (a.neuronal && navigator.onLine !== false) {
    const sesion = sesionVoz;
    hablarNeural(limpio, opciones, sesion, a).catch(() => {
      if (sesion === sesionVoz) hablarSistema(limpio, opciones);
    });
    return { neuronal: true };
  }
  return hablarSistema(limpio, opciones);
}

function hablarSistema(texto, { alEmpezar, alTerminar } = {}) {
  if (!('speechSynthesis' in window) || !texto) { alTerminar?.(); return null; }
  window.speechSynthesis.cancel();

  const a = ajustes();
  const u = new SpeechSynthesisUtterance(texto);
  const voz = resolverVoz();
  if (voz) { u.voice = voz; u.lang = voz.lang; } else { u.lang = 'es-MX'; }
  u.rate = a.ritmo;
  u.pitch = a.tono;
  u.volume = 1;
  u.onstart = () => { if (a.pitidos) blip({ desde: 980, hasta: 1460, dur: 0.1, vol: 0.035 }); alEmpezar?.(); };
  u.onend = () => { if (a.pitidos) pitidoFin(); alTerminar?.(); };
  u.onerror = () => alTerminar?.();
  window.speechSynthesis.speak(u);
  return u;
}

export function callar() {
  sesionVoz += 1;
  try { controlador?.abort(); } catch { /* nada en vuelo */ }
  if (audioNeural) {
    const a = audioNeural;
    audioNeural = null;
    try { a.pause(); } catch { /* ya parado */ }
  }
  emitirNivel(0);
  try { window.speechSynthesis?.cancel(); } catch { /* nada */ }
}

// El texto que se lee no es el que se muestra. Los símbolos de formato se
// pronuncian ("asterisco asterisco") y arruinan el efecto; los montos suenan
// mejor dichos como los dice una persona.
function limpiarParaVoz(t) {
  return String(t)
    .replace(/[*_`#>]/g, ' ')
    .replace(/\bRD\$\s*/gi, ' ')
    .replace(/(\d) ?,(\d{3})/g, '$1$2')     // 1,400 -> 1400, que se lee bien
    .replace(/\s{2,}/g, ' ')
    .trim();
}
