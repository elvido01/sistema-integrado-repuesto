// Lo que Hermes "ve" de la pantalla.
//
// No es una captura: es el panel abierto y los datos que esa pantalla YA
// tiene cargados. Se eligió así a propósito — una imagen obliga a pedir
// permiso cada vez, cuesta bastante más por consulta y encima lee peor un
// número que si se lo pasan como dato. Hermes no necesita ver los píxeles
// del cierre de caja; necesita saber que estás en el cierre del 07/08 y que
// el efectivo da 69,092.
//
// Cada pantalla publica su resumen cuando quiere. La que no publique nada
// deja igual el nombre del panel, que ya sirve para "¿qué es esto?".

let contexto = { panel: null, titulo: null, datos: null, en: null };
// Los módulos que existen y a los que el usuario tiene acceso. El agente los
// necesita para poder abrirlos: sin la lista inventaría nombres de pantallas
// que no existen. Se publica desde PanelContext, que es quien la tiene.
let modulos = [];
const oyentes = new Set();

export function publicarModulos(lista) { modulos = lista || []; }
export function leerModulos() { return modulos; }

function avisar() {
  for (const f of oyentes) { try { f(contexto); } catch { /* un oyente roto no rompe a los demás */ } }
}

// La llama PanelContext al cambiar de pestaña. Al cambiar de panel se BORRAN
// los datos del anterior: que Hermes hable del cierre de caja mientras miras
// Ventas sería peor que no saber nada.
export function panelActivo(panel, titulo) {
  // Las entidades señaladas también se van: la cotización que se estaba
  // mirando en Ventas no es "esa" cuando ya estás en Compras.
  contexto = { panel, titulo, datos: null, entidades: {}, en: new Date().toISOString() };
  avisar();
}

// La llama cada pantalla con lo que tenga a mano. Objeto plano y pequeño:
// esto viaja en cada pregunta y se paga por token.
export function publicarDatos(datos) {
  contexto = { ...contexto, datos, en: new Date().toISOString() };
  avisar();
}

export function limpiarDatos() {
  contexto = { ...contexto, datos: null };
  avisar();
}

// ── LO QUE EL USUARIO TIENE SELECCIONADO ──────────────────────────────
// (2026-08-17) `datos` es el resumen que cada pantalla quiera publicar, y
// cada una lo arma a su manera. Eso sirve para "¿qué es esto?", pero no
// para resolver un "mándala a facturar": para eso hace falta saber que HAY
// una cotización señalada y CUÁL es, con su id, en un campo que se llame
// igual en las 76 pantallas.
//
// Por eso las entidades van aparte y con nombres fijos. Es lo que convierte
// "esa", "la", "ese cliente" en un identificador de verdad — y lo que
// impide que el modelo se invente uno, que es el fallo caro.
//
// Se acumula: una pantalla puede señalar el cliente al elegirlo y la
// cotización un segundo después, sin borrar lo anterior. Al cambiar de
// panel se limpia todo, igual que `datos`.
export function señalar(entidades) {
  contexto = {
    ...contexto,
    entidades: { ...(contexto.entidades || {}), ...(entidades || {}) },
    en: new Date().toISOString(),
  };
  avisar();
}

// Alias sin acento: los nombres con eñe dan guerra al importarlos desde
// archivos que no son UTF-8 y no vale la pena discutirlo en cada pantalla.
export const senalar = señalar;

export function olvidarEntidad(nombre) {
  if (!contexto.entidades) return;
  const resto = { ...contexto.entidades };
  delete resto[nombre];
  contexto = { ...contexto, entidades: resto };
  avisar();
}

export function leerContexto() {
  return contexto;
}

// Lo mismo, pero diciendo lo que ES.
//
// El objeto de arriba viaja tal cual al agente, y un campo llamado "datos"
// que vale null se lee como "MotoFlow no tiene los datos". Hermes contestaba
// literalmente eso —"MotoFlow no me ha enviado los datos de mercancías"— y
// se negaba a cotizar, mientras por Telegram, sin este contexto, consultaba
// la base y acertaba precio y existencia a la primera. El contexto no le
// faltaba: le sobraba, mal entendido.
//
// Así que el paquete se explica solo. Cuesta unos pocos tokens por pregunta
// y evita la respuesta más cara de todas: la que no se da.
export function contextoParaAgente(modulos) {
  const c = contexto;
  return {
    ...c,
    // La lista de módulos como JSON pesaba 3,941 caracteres —el 87% del
    // paquete— y viajaba entera en CADA pregunta. Mil tokens de entrada
    // para decir siempre lo mismo. Como texto plano baja a menos de la
    // cuarta parte y se lee igual de bien: "inicio:Inicio, ventas:Ventas".
    modulos: (modulos || []).map((m) => `${m.id}:${m.nombre}`).join(', '),
    // Lo que el usuario tiene señalado AHORA. Solo se manda lo que existe:
    // un objeto lleno de nulls le enseña al modelo que casi nada se sabe, y
    // aprende a no mirarlo.
    entidades: Object.fromEntries(
      Object.entries(c.entidades || {}).filter(([, v]) => v != null && v !== ''),
    ),
    // El nombre largo es a propósito: se lee antes que 'datos'.
    esto_es: 'Solo indica DONDE esta parado el usuario, que tiene señalado en pantalla y que modulos puede abrir.',
    como_usar_entidades: 'Si el usuario dice "esa", "la", "ese cliente" o "mandala a facturar", se refiere a lo que este en "entidades". Usa ESE identificador; nunca inventes uno ni adivines por el nombre.',
    no_es: 'NO es la fuente de datos del negocio. Que "datos" venga en null significa que esta pantalla no publica nada, no que el dato no exista.',
    donde_consultar: 'Precios, existencia y catalogo: hermes.buscar_producto(texto, limite) y hermes.catalogo_resumen(). Lo demas, las vistas del schema hermes (ya filtradas a esta empresa). Consulta antes de responder; no contestes un precio sin haberlo consultado.',
  };
}

export function alCambiarContexto(f) {
  oyentes.add(f);
  return () => oyentes.delete(f);
}
