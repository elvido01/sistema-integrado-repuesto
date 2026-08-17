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
export function armarGlosario(ctx = null, recientes = []) {
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

    // El encabezado importa tanto como la lista: le dice al modelo en que
    // idioma y de que se esta hablando, que es la mitad del trabajo.
    return [
      'Español de República Dominicana. Taller y venta de motocicletas y repuestos.',
      `Términos: ${elegidas.join(', ')}.`,
    ].join(' ');
  } catch {
    return 'Español de República Dominicana. Venta de motocicletas y repuestos.';
  }
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

export const _internos = { NUCLEO, TOPE_CHARS, util, unicos, deObjeto };
