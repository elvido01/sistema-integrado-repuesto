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
const oyentes = new Set();

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

export function alCambiarContexto(f) {
  oyentes.add(f);
  return () => oyentes.delete(f);
}
