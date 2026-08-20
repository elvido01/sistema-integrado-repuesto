// El texto de la cotización que le llega al cliente por WhatsApp.
//
// (2026-08-20) El dueño mandó una captura señalando "2 x RD$2,086.28": ese
// número es el precio de UNO, la línea costaba RD$4,172.56, y ese importe no
// salía por ningún lado. El cliente no podía saber si iba a pagar dos mil o
// cuatro mil, y el Total no le cuadraba con lo que estaba leyendo.
//
// Lo que se prueba aquí no es el formato bonito: es que los números que ve
// quien paga se puedan sumar con la vista y den el Total.

import { describe, it, expect } from 'vitest';
import { formatQuoteMessage, lineaDeCotizacion } from '../whatsapp-quote-extension/src/utils/cotizacionTexto.js';

const timon = { descripcion: 'TIMON PLATINA 100/125 ES KS 125 CBS BAJAJ', cantidad: 1, precio: 1100.01 };
const amort = { descripcion: 'AMORTIGUADOR TRASERO PLATINA 100 BAJAJ', cantidad: 2, precio: 2086.28 };

describe('cada línea dice lo que cuesta', () => {
  it('con cantidad 1 no repite el número dos veces', () => {
    // "1 x RD$1,100.01 c/u = RD$1,100.01" es ruido, y el ruido se lee mal.
    const linea = lineaDeCotizacion(timon);
    expect(linea).toBe('TIMON PLATINA 100/125 ES KS 125 CBS BAJAJ\nRD$1,100.01');
    expect(linea).not.toContain('c/u');
  });

  it('con más de uno dice el precio de uno Y lo que cuesta la línea', () => {
    // Era el fallo exacto de la captura: faltaba el 4,172.56.
    const linea = lineaDeCotizacion(amort);
    expect(linea).toContain('2 x RD$2,086.28 c/u');
    expect(linea).toContain('RD$4,172.56');
  });

  it('la descripción va en su propio renglón', () => {
    // Con dos piezas parecidas —las dos "PLATINA ... BAJAJ"— pegar
    // descripción y monto obligaba a leer con cuidado para saber qué número
    // era de cuál.
    expect(lineaDeCotizacion(amort).split('\n')[0]).toBe(amort.descripcion);
  });

  it('sin descripción no sale una línea huérfana con un precio suelto', () => {
    expect(lineaDeCotizacion({ cantidad: 1, precio: 500 })).toBe('Artículo\nRD$500.00');
  });
});

describe('el mensaje completo', () => {
  const mensaje = formatQuoteMessage({}, [timon, amort], { total: 5272.57 });

  it('los importes que se ven suman el Total', () => {
    // La prueba que de verdad importa: que el cliente pueda cuadrarlo solo.
    const importes = mensaje.match(/RD\$[\d,]+\.\d{2}/g).map((s) => Number(s.replace(/[^\d.]/g, '')));
    const total = Number(mensaje.match(/Total: RD\$([\d,]+\.\d{2})/)[1].replace(/,/g, ''));
    // 1,100.01 (línea) + 4,172.56 (línea) = 5,272.57
    expect(1100.01 + 4172.56).toBeCloseTo(total, 2);
    expect(importes).toContain(4172.56);
    expect(total).toBe(5272.57);
  });

  it('cada pieza va en su bloque, separada de la siguiente', () => {
    expect(mensaje).toContain(`${timon.descripcion}\nRD$1,100.01\n\n${amort.descripcion}`);
  });

  it('sin artículos no revienta ni promete nada', () => {
    const vacio = formatQuoteMessage({}, [], { total: 0 });
    expect(vacio).toContain('Total: RD$0.00');
  });

  it('con basura en los números no escribe NaN al cliente', () => {
    // Un NaN en una cotización es peor que un error: se manda y nadie lo ve
    // hasta que el cliente pregunta.
    const raro = formatQuoteMessage({}, [{ descripcion: 'PIEZA', cantidad: 'dos', precio: null }], { total: undefined });
    expect(raro).not.toContain('NaN');
    expect(raro).toContain('Total: RD$0.00');
  });
});
