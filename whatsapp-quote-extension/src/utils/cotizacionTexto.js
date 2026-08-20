// El texto de la cotización que se le manda al cliente por el chat.
//
// >>> POR QUE ESTÁ EN SU PROPIO ARCHIVO <<<
// Porque es dinero escrito para un cliente, y eso se prueba. Vivía dentro
// de App.jsx, donde no se podía tocar sin abrir React entero.
//
// >>> EL PROBLEMA QUE VIENE A ARREGLAR <<<
// (2026-08-20) La cotización salía así:
//
//     TIMON PLATINA 100/125 ES KS 125 CBS BAJAJ  1 x RD$1,100.01
//     AMORTIGUADOR TRASERO PLATINA 100 BAJAJ  2 x RD$2,086.28
//     Total: RD$5,272.57
//
// Dos cosas mal, y las dos confunden al que paga:
//
//   1. RD$2,086.28 es el precio de UNO, pero la línea cuesta RD$4,172.56 y
//      ese número no aparece por ningún lado. El cliente no sabe si va a
//      pagar dos mil o cuatro mil, y el Total no le cuadra con lo que lee.
//   2. Descripción y montos pegados en el mismo renglón. Con dos piezas
//      parecidas —las dos "PLATINA ... BAJAJ"— hay que leer con cuidado
//      para saber qué número es de cuál.
//
// Ahora cada pieza va en su bloque y el importe de la línea se dice entero.
// Cuando la cantidad es 1 no se desglosa: repetir el mismo número dos veces
// es ruido, y el ruido también se lee mal.

const money = new Intl.NumberFormat('es-DO', {
  style: 'currency',
  currency: 'DOP',
  minimumFractionDigits: 2,
});

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** Una pieza, en las líneas que le tocan. */
export function lineaDeCotizacion(line) {
  const cantidad = num(line?.cantidad, 1);
  const precio = num(line?.precio, 0);
  const descripcion = String(line?.descripcion || '').trim() || 'Artículo';

  if (cantidad === 1) {
    return `${descripcion}\n${money.format(precio)}`;
  }
  return `${descripcion}\n${cantidad} x ${money.format(precio)} c/u = ${money.format(cantidad * precio)}`;
}

/** El mensaje completo. `totals.total` manda: es lo que se va a cobrar. */
export function formatQuoteMessage(chat, lines, totals) {
  const bloques = (lines || []).map(lineaDeCotizacion).join('\n\n');

  return [
    'Hola, esta es tu cotizacion:',
    '',
    bloques,
    '',
    `Total: ${money.format(num(totals?.total, 0))}`,
    '',
    'Quedo atento para confirmar disponibilidad y entrega.',
  ].join('\n');
}
