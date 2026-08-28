// Pegar la lista de Magna en vez de teclearla línea por línea.
//
// (2026-08-28) Una cotización de garantía trae 17 motores. Teclear 17 chasis
// de 17 caracteres a mano es donde se cuela el error que nadie ve: un dígito
// cambiado en un VIN no rompe nada, se factura, y aparece cuando Magna
// rechaza la línea semanas después.
//
// >>> POR QUE NO SE LEE POR POSICION DE COLUMNA <<<
// La lista llega como Magna la mande. La primera que llegó venía así:
//
//     | Imagen | VIN                   | ID orden |
//     | 1      | **MD2A76BX9TWG47363** | **1631** |
//
// Columnas al revés que el formulario (chasis antes que orden), una columna
// de más, y los valores en negrita de markdown. Amarrarse a "la columna 1 es
// la orden" es garantizar que la próxima lista no entre.
//
// Se lee por la FORMA del dato:
//   - El chasis es lo único de 17 caracteres alfanuméricos que hay ahí.
//   - La orden es el número más largo que quede en la fila.
//
// Ese "más largo" es lo que separa el 1631 del 1 de la columna Imagen. Un
// número de orden siempre tiene más dígitos que un contador de fila; si
// algún día empatan, gana el de más a la derecha, que es donde los IDs se
// ponen en cualquier tabla.

// 17 caracteres. Se aceptan I, O y Q aunque el estándar del VIN las prohíbe:
// si alguien tecleó una O donde iba un 0 queremos verlo en pantalla para
// corregirlo, no que la línea desaparezca en silencio.
const CHASIS = /^[A-Z0-9]{17}$/;
const SOLO_DIGITOS = /^\d{1,9}$/;

// Una fila de cabecera o el separador de markdown (| --- | --- |). No son
// errores: son parte del formato, y avisar de ellas sería ruido.
const ES_DECORADO = (linea) => {
  const limpio = linea.replace(/[|\s:-]/g, '');
  if (!limpio) return true;                       // separador o línea vacía
  return /^(imagen|vin|chasis|no\.?orden|idorden|orden|repuestos|manoobra|no\.?)+$/i.test(limpio);
};

const celdas = (linea) => linea
  // El markdown envuelve los valores en asteriscos y las tablas en tuberías.
  .replace(/\*\*/g, '')
  // Se parte por CUALQUIER espacio, no por dos o más: un chasis y su orden
  // pegados con un solo espacio quedaban en la misma celda y la moto se
  // perdía. Ni el chasis ni el número de orden llevan espacios dentro, así
  // que partir de más no rompe nada.
  .split(/[|\t;,]+|\s+/)
  .map((c) => c.trim())
  .filter(Boolean);

/**
 * Convierte lo pegado en líneas de cotización.
 *
 * Acepta tabla de markdown, copiado de Excel o Sheets (tabuladores), CSV, o
 * simplemente el chasis y la orden separados por espacios.
 *
 * @param {string} texto lo que el usuario pegó
 * @returns {{lineas: Array, ignoradas: string[], repetidos: string[]}}
 */
export function parsearLineasPegadas(texto) {
  const lineas = [];
  const ignoradas = [];
  const vistos = new Map();
  const repetidos = [];

  for (const cruda of String(texto || '').split(/\r?\n/)) {
    const linea = cruda.trim();
    if (!linea || ES_DECORADO(linea)) continue;

    const partes = celdas(linea);
    const chasis = partes.map((p) => p.toUpperCase()).find((p) => CHASIS.test(p));

    if (!chasis) {
      // Tiene contenido pero no se le ve un chasis. Se devuelve para que se
      // vea en pantalla: callarla es perder una moto de la cotización.
      ignoradas.push(linea);
      continue;
    }

    // De lo que queda, el número más largo. Empate: el de más a la derecha.
    const numeros = partes.filter((p) => SOLO_DIGITOS.test(p) && p.toUpperCase() !== chasis);
    let orden = '';
    for (const n of numeros) {
      if (n.length >= (orden.length || 0)) orden = n;
    }

    // El mismo chasis dos veces es NORMAL: una moto vuelve al taller por otra
    // reparación y cada visita es su propia orden. Confirmado por el dueño
    // con MD2A76BX9TWG47363, que tuvo dos (órdenes 1631 y 2744).
    //
    // Por eso esto avisa pero JAMAS descarta. Quitar el repetido "por
    // limpieza" seria borrar una reparación de la factura de Magna.
    //
    // Se sigue diciendo porque el otro caso —un dígito mal copiado que hace
    // que dos motos distintas parezcan la misma— se ve exactamente igual, y
    // ese sí hay que cazarlo.
    if (vistos.has(chasis)) {
      repetidos.push(`${chasis} (órdenes ${vistos.get(chasis)} y ${orden || '?'})`);
    } else {
      vistos.set(chasis, orden || '?');
    }

    lineas.push({ numero_orden: orden, chasis });
  }

  return { lineas, ignoradas, repetidos };
}
