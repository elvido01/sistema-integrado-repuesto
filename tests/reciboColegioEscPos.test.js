import { describe, it, expect } from 'vitest';
import { buildReciboColegioEscPos } from '@/services/escposReceipt';

const datos = {
  colegio: { nombre: 'Colegio de Prueba', rnc: '000000000', direccion: 'Calle Ejemplo #1', telefono: '809-000-0000' },
  pago: { numero: 12, fecha: '2026-11-08', created_at: '2026-11-08T18:15:00Z', total: 7000, recibo_ingreso: 'RI-000001',
    usuario: 'Cajera Prueba', formas_pago: [{ forma: 'Efectivo', monto: 7000 }, { forma: 'Tarjeta', monto: 0 }] },
  familia: { madre_nombre: 'MARIA PEREZ' }, anio: { nombre: '2027-2028' },
  estudiantes: [
    { nombre: 'JUAN PEREZ', curso: '1ro de Secundaria', tanda: 'Matutina', pendiente: 1500, lineas: [{ descripcion: 'Reservación de cupo', monto: 3500 }] },
    { nombre: 'ANA PEREZ', curso: '5to de Primaria', tanda: 'Matutina', pendiente: 0, lineas: [{ descripcion: 'Reservación de cupo', monto: 3500 }] },
  ],
};

describe('recibo del colegio con letras de la impresora', () => {
  const s = buildReciboColegioEscPos(datos);
  const lineas = s.split('\n');

  it('trae lo mismo que el ticket de imagen', () => {
    expect(s).toContain('RECIBO DE INGRESO');
    expect(s).toContain('RC-000012');
    expect(s).toContain('08/11/2026 02:15 PM');
    expect(s).toContain('RI-000001');
    expect(s).toContain('(JUAN)');
    expect(s).toContain('7,000.00');
    expect(s).toContain('1,500.00');            // pendiente del año
    expect(s).toContain('Atendido por: Cajera Prueba');
    expect(s).not.toContain('Tarjeta');         // forma de pago en cero no sale
  });

  it('ninguna línea pasa de 42 columnas (como la factura de Morla)', () => {
    const visibles = lineas.map((l) => l.replace(/\x1b[@E][\x00\x01]?|\x1ba[\x00-\x02]|\x1bd.|\x1dV./g, ''));
    for (const l of visibles) expect(l.length).toBeLessThanOrEqual(42);
  });

  it('solo ASCII (la impresora no tiene tildes) y termina con corte', () => {
    expect(/[^\x00-\x7f]/.test(s)).toBe(false);
    expect(s.endsWith('\x1dV\x00')).toBe(true);
  });

  it('textos largos pasan a la línea siguiente y nada se pierde', () => {
    const largo = buildReciboColegioEscPos({
      ...datos,
      colegio: { ...datos.colegio, direccion: 'Calle Duarte #45, Sector Los Jardines del Norte, Santiago de los Caballeros' },
      pago: { ...datos.pago, formas_pago: [{ forma: 'Transferencia Banco Popular', referencia: 'TRX-2026110812345678', monto: 7000 }] },
      estudiantes: [{ nombre: 'JUAN', curso: 'x', pendiente: 0, lineas: [{ descripcion: '   ', monto: 7000 }] }],
    });
    const vis = largo.split('\n').map((l) => l.replace(/\x1b[@E][\x00\x01]?|\x1ba[\x00-\x02]|\x1bd.|\x1dV./g, ''));
    for (const l of vis) expect(l.length).toBeLessThanOrEqual(42);
    expect(largo).toContain('Caballeros');           // la dirección no se corta
    expect(largo).toContain('TRX-2026110812345678');
    expect(largo).toContain('(sin descripcion)');    // la línea sin descripción sí sale con su monto
  });

  it('anulado se marca', () => {
    expect(buildReciboColegioEscPos({ ...datos, pago: { ...datos.pago, anulado: true } })).toContain('ANULADO');
  });
});

import { logoEscPos } from '@/services/escposReceipt';

describe('logo en el ticket', () => {
  // cuadro negro de 16x10
  const logo = { w: 16, h: 10, negro: () => true };

  it('Star: bandas de 24 puntos (ESC X) centradas y deja la impresora como estaba', () => {
    const s = logoEscPos(logo, 'star');
    const b = Array.from(s, (c) => c.charCodeAt(0));
    expect(b.slice(0, 5)).toEqual([0x1b, 0x40, 0x1b, 0x33, 12]);
    expect(s.split('X').length - 1).toBe(1);   // 10 filas = 1 banda de 24
    const n = (576 - 16) / 2 + 16;                  // relleno para centrar + ancho
    expect(b[6]).toBe(0x58); expect(b[7] + b[8] * 256).toBe(n);
    expect(b.length).toBe(5 + 4 + n * 3 + 1 + 2);   // 3 bytes por columna
    expect(b.filter((x, i) => x === 0x1b && b[i + 1] === 0x58).length).toBe(1);
    expect(b.slice(-2)).toEqual([0x1b, 0x40]);
    expect(s.endsWith('@')).toBe(true);
  });

  it('otras impresoras: GS v 0 con el tamaño correcto', () => {
    const s = logoEscPos(logo, 'escpos');
    const b = Array.from(s, (c) => c.charCodeAt(0));
    const i = b.indexOf(0x76);
    expect(b.slice(i - 1, i + 7)).toEqual([0x1d, 0x76, 0x30, 0, 2, 0, 10, 0]);   // 2 bytes de ancho, 10 de alto
  });
});
