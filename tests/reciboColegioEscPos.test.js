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

  it('anulado se marca', () => {
    expect(buildReciboColegioEscPos({ ...datos, pago: { ...datos.pago, anulado: true } })).toContain('ANULADO');
  });
});
