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
  contexto = { panel, titulo, datos: null, en: new Date().toISOString() };
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
    modulos: modulos || [],
    // El nombre largo es a propósito: se lee antes que 'datos'.
    esto_es: 'Solo indica DONDE esta parado el usuario y que modulos puede abrir.',
    no_es: 'NO es la fuente de datos del negocio. Que "datos" venga en null significa que esta pantalla no publica nada, no que el dato no exista.',
    donde_consultar: 'Precios, existencia y catalogo: hermes.buscar_producto(texto, limite) y hermes.catalogo_resumen(). Lo demas, las vistas del schema hermes (ya filtradas a esta empresa). Consulta antes de responder; no contestes un precio sin haberlo consultado.',
  };
}

export function alCambiarContexto(f) {
  oyentes.add(f);
  return () => oyentes.delete(f);
}
