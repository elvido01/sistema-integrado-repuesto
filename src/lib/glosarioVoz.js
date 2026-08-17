// El vocabulario con el que Jarvis escucha.
//
// >>> POR QUE HACE FALTA <<<
// Un transcriptor generico oye "Pruss 200" y escribe "prusia 200"; oye
// "millero" y escribe "mi yerno". No es que sea malo: es que nunca ha
// trabajado en un taller de motores dominicano. Si se le dan las palabras
// ANTES de escuchar, las reconoce.
//
// >>> POR QUE DINAMICO Y NO UN DICCIONARIO <<<
// El parametro `prompt` de la API de transcripcion tiene un tope de ~224
// tokens. No caben 3,700 productos, ni falta. Lo que sirve es lo que esta
// en pantalla AHORA: si estas cotizando a Sander una Loncin Pruss 200, esas
// tres palabras valen mas que el catalogo entero.
//
// Por eso el glosario se arma en tres capas y se corta por presupuesto:
//
//   1. NUCLEO      — el oficio. Fijo, corto, siempre viaja.
//   2. PANTALLA    — cliente, cotizacion, producto que se estan mirando.
//   3. RECIENTE    — lo ultimo que se busco o se nombro en la conversacion.
//
// La capa 2 pesa mas que la 1: lo especifico gana a lo generico. Si algo
// hay que soltar por falta de espacio, se suelta del nucleo.

// El oficio. Estas son las que un modelo generico escribe mal casi siempre.
// Cortas a proposito: cada una que sobra le quita el puesto a un nombre de
// cliente, que es lo que de verdad no puede adivinar.
const NUCLEO = [
  'MotoFlow', 'cotización', 'factura', 'pedido', 'existencia', 'repuesto',
  'Loncin', 'Pruss', 'Platina', 'Stryker', 'TVS', 'Apache', 'Bajaj',
  'caliper', 'catalina', 'millero', 'culata', 'careta', 'guardalodo',
];

// Presupuesto. La API corta el prompt por tokens, no por caracteres; 4 chars
// por token es la regla de dedo de siempre y aqui sobra con eso, porque el
// corte se hace con margen.
const TOPE_CHARS = 700;

const limpiar = (v) => String(v ?? '').trim();

// Un termino sirve si aporta algo que el modelo no adivinaria solo.
// "12" o "de" no aportan; "CT-000097" y "Sander" si.
function util(t) {
  const s = limpiar(t);
  if (s.length < 3 || s.length > 40) return false;
  if (/^\d+$/.test(s)) return false;               // numeros sueltos, no
  if (/^(el|la|los|las|de|del|para|con|sin|por)$/i.test(s)) return false;
  return true;
}

// Quita repetidos sin distinguir mayusculas ni acentos, pero CONSERVA la
// primera forma vista: al modelo hay que darle "Pruss", no "pruss".
function unicos(lista) {
  const visto = new Set();
  const salida = [];
  for (const t of lista) {
    const s = limpiar(t);
    if (!util(s)) continue;
    const clave = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (visto.has(clave)) continue;
    visto.add(clave);
    salida.push(s);
  }
  return salida;
}

// De un objeto de pantalla cualquiera, saca lo que suena a nombre propio.
// Se mira por NOMBRE de campo y no por valor: es lo unico estable entre 76
// pantallas que publican cada una lo suyo.
const CAMPOS = [
  'cliente', 'cliente_nombre', 'nombre_cliente', 'selected_customer_name',
  'producto', 'descripcion', 'producto_nombre', 'marca', 'modelo',
  'cotizacion', 'numero', 'ncf', 'factura', 'pedido', 'vendedor', 'cobrador',
  'suplidor', 'proveedor',
];

function deObjeto(obj, prof = 0) {
  if (!obj || typeof obj !== 'object' || prof > 2) return [];
  const salida = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (typeof v === 'object') {
      // Solo las primeras filas de una lista: lo que se ve sin bajar.
      const hijos = Array.isArray(v) ? v.slice(0, 5) : [v];
      for (const h of hijos) salida.push(...deObjeto(h, prof + 1));
      continue;
    }
    const nombre = k.toLowerCase();
    if (!CAMPOS.some((c) => nombre.includes(c))) continue;
    // Una descripcion larga se parte: "FAROL DELANTERO PLATINA 100" aporta
    // tres palabras, no una frase que nadie va a decir entera.
    for (const parte of String(v).split(/[\s,/·|-]+/)) salida.push(parte);
    salida.push(String(v));
  }
  return salida;
}

/**
 * Arma el glosario para UNA transcripcion.
 *
 * Todo es opcional: si no llega nada, devuelve el nucleo y ya. Nunca lanza
 * — si esto se cae, la nota de voz se queda sin transcribir, y eso es peor
 * que transcribir sin pistas.
 *
 * @param {object}   ctx           lo que publica pantallaContexto
 * @param {string[]} recientes     terminos de la conversacion / ultima busqueda
 * @returns {string} texto para el parametro `prompt` del STT
 */
export function terminosDeGlosario(ctx = null, recientes = []) {
  try {
    const dePantalla = unicos([
      ...(Array.isArray(recientes) ? recientes : []),
      ...deObjeto(ctx?.datos ?? ctx),
      limpiar(ctx?.titulo),
    ]);

    // Lo de pantalla primero: si hay que cortar, se corta del nucleo.
    const todo = unicos([...dePantalla, ...NUCLEO]);

    const elegidas = [];
    let largo = 0;
    for (const t of todo) {
      if (largo + t.length + 2 > TOPE_CHARS) break;
      elegidas.push(t);
      largo += t.length + 2;
    }
    return elegidas;
  } catch {
    return [];
  }
}

export function armarGlosario(ctx = null, recientes = []) {
  const elegidas = terminosDeGlosario(ctx, recientes);
  if (!elegidas.length) return 'Español de República Dominicana. Venta de motocicletas y repuestos.';
  // El encabezado importa tanto como la lista: le dice al modelo en que
  // idioma y de que se esta hablando, que es la mitad del trabajo.
  return [
    'Español de República Dominicana. Taller y venta de motocicletas y repuestos.',
    `Términos: ${elegidas.join(', ')}.`,
  ].join(' ');
}

/**
 * Los terminos que valen de lo ultimo hablado.
 *
 * Se sacan del texto y no de la base: nombres propios, codigos y numeros de
 * documento, que es lo que suele repetirse ("mandala a facturar" viene
 * despues de que alguien dijo CT-000097).
 */
export function terminosDeConversacion(mensajes = [], cuantos = 12) {
  try {
    const texto = (mensajes || []).slice(-6).map((m) => m?.content || '').join(' ');
    const encontrados = [
      // Documentos: CT-000097, FT-3506, PT-0026576, AB-0010603
      ...(texto.match(/\b[A-Z]{2}-\d{3,7}\b/g) || []),
      // Nombres propios y marcas: dos mayusculas seguidas o palabra Capitalizada
      ...(texto.match(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}\b/g) || []),
    ];
    return unicos(encontrados).slice(0, cuantos);
  } catch {
    return [];
  }
}

// ── CORREGIR DESPUES DE OIR ──────────────────────────────────────────
//
// >>> POR QUE NO BASTA CON EL GLOSARIO <<<
// (2026-08-17) El glosario se le da al transcriptor ANTES de escuchar, y
// eso es una SUGERENCIA, no una regla. Con "Sander" en la lista, el
// servidor escribio igual "Sandel". Peor: Chrome lo habia oido bien, y el
// desempate se queda con el del servidor.
//
// Aqui se arregla despues, que es donde si se puede: si una palabra dicha
// se parece muchisimo a un termino que esta EN PANTALLA o que se acaba de
// nombrar, era ese termino. "Sandel" -> "Sander".
//
// >>> DELIBERADAMENTE CORTO DE ALCANCE <<<
// Distancia 1 en palabras de 5+ letras, distancia 2 solo de 8 en adelante.
// Con eso entra "Sandel"->"Sander" y "platino"->"platina", y NO entra
// "frudo"->"Pruss", que esta a 3 de distancia. Preferimos dejar pasar un
// fallo a inventar una correccion: cambiar la palabra equivocada en una
// orden de facturar cuesta mas que transcribirla mal, porque la busqueda
// del catalogo aguanta una letra mala y una palabra cambiada no.

const sinTildes = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Distancia de edicion con corte: en cuanto se pasa del tope se abandona,
// que es lo normal — casi ninguna pareja de palabras se parece.
function distancia(a, b, tope) {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  let previa = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    let mejor = i;
    for (let j = 1; j <= b.length; j++) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1;
      fila[j] = Math.min(previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + coste);
      if (fila[j] < mejor) mejor = fila[j];
    }
    if (mejor > tope) return tope + 1;
    previa = fila;
  }
  return previa[b.length];
}

const topeDe = (largo) => (largo >= 8 ? 2 : largo >= 5 ? 1 : 0);

/**
 * Cambia las palabras que casi son un termino conocido por el termino.
 *
 * Nunca lanza y, ante la duda, devuelve lo que le dieron: una correccion
 * inventada es peor que una palabra mal oida.
 *
 * @param {string}   texto     lo que se transcribio
 * @param {string[]} terminos  los de terminosDeGlosario()
 */
export function corregirConGlosario(texto, terminos = []) {
  try {
    const t = String(texto ?? '');
    if (!t.trim() || !Array.isArray(terminos) || !terminos.length) return t;

    // Solo terminos de UNA palabra: los compuestos no se pueden casar contra
    // una palabra suelta sin adivinar donde empieza y termina.
    const candidatos = terminos
      .filter((x) => x && !/\s/.test(x) && x.length >= 5)
      .map((x) => ({ original: x, plano: sinTildes(x) }));
    if (!candidatos.length) return t;

    // Como se escribe de verdad cada termino, buscable sin tildes.
    const canonica = new Map();
    for (const c of candidatos) if (!canonica.has(c.plano)) canonica.set(c.plano, c.original);

    // Se respeta como venia dictada la palabra si iba toda en mayusculas.
    const comoVenia = (palabra, termino) => (
      palabra === palabra.toUpperCase() && palabra !== palabra.toLowerCase()
        ? termino.toUpperCase()
        : termino
    );

    return t.replace(/[\p{L}\p{N}-]+/gu, (palabra) => {
      const plano = sinTildes(palabra);
      if (plano.length < 5) return palabra;

      // Ya ES el termino: no hay nada que adivinar. Se devuelve como lo
      // escribe la casa —"cotizacion" -> "cotización"— y sobre todo se sale
      // de aqui, porque sin esta salida dos terminos parecidos entre si se
      // corregian el uno al otro segun el orden de la lista.
      if (canonica.has(plano)) return comoVenia(palabra, canonica.get(plano));

      const tope = topeDe(plano.length);
      if (tope < 1) return palabra;

      let mejor = null;
      let mejorD = tope + 1;
      let empate = false;
      for (const c of candidatos) {
        const d = distancia(plano, c.plano, tope);
        if (d > tope) continue;
        if (d < mejorD) { mejorD = d; mejor = c; empate = false; }
        else if (d === mejorD && c.plano !== mejor?.plano) empate = true;
      }
      // Dos candidatos igual de cerca: no hay forma de saber cual, y elegir
      // a cara o cruz es exactamente lo que no queremos.
      if (!mejor || empate) return palabra;

      return comoVenia(palabra, mejor.original);
    });
  } catch {
    return String(texto ?? '');
  }
}

export const _internos = { NUCLEO, TOPE_CHARS, util, unicos, deObjeto, distancia, topeDe };
