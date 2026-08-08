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

// Ritmo y tono del personaje: pausado y grave, nunca acelerado. JARVIS no
// tiene prisa ni levanta la voz.
export const RITMO = 0.88;
export const TONO = 0.78;

export function hablar(texto, { alEmpezar, alTerminar } = {}) {
  if (!('speechSynthesis' in window) || !texto) return null;
  window.speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(limpiarParaVoz(texto));
  const voz = resolverVoz();
  if (voz) { u.voice = voz; u.lang = voz.lang; } else { u.lang = 'es-MX'; }
  u.rate = RITMO;
  u.pitch = TONO;
  u.volume = 1;
  u.onstart = () => alEmpezar?.();
  u.onend = () => alTerminar?.();
  u.onerror = () => alTerminar?.();
  window.speechSynthesis.speak(u);
  return u;
}

export function callar() {
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
