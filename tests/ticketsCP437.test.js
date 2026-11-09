import { describe, it, expect } from 'vitest';
import { buildFacturaEscPos, buildCotizacionEscPos, ESC_TABLA_437 } from '../src/services/escposReceipt';
import { ajustarParaImpresora } from '../src/services/printerAdapter';

// (09/11/2026) Los tickets de Morla con ñ y tildes (tabla 437), como el del colegio.
describe('tickets con ñ y tildes', () => {
  const empresa = { nombre: 'REPUESTOS MORLA', direccion: 'Av. Duarte, Higüey', telefono: '809-390-5965', rnc: '028-0099156-0' };

  it('la factura empieza con la tabla 437 y el encabezado conserva la ü (una sola conversión)', () => {
    const t = buildFacturaEscPos({ numero: 1, fecha: '2026-11-09', total: 100, cliente_nombre: 'JOSÉ MUÑOZ' }, empresa);
    expect(t.startsWith('\x1B@' + ESC_TABLA_437)).toBe(true);
    expect(t).toContain('Hig\x81ey');
  });

  it('la cotización también; en la Star se cambia FS . por ESC GS t 1', () => {
    const t = buildCotizacionEscPos({ numero: 2, cliente_nombre: 'Peña' }, [{ descripcion: 'Cañón', cantidad: 1, precio_unitario: 10, importe: 10 }], empresa);
    expect(t).toContain('PE\xA5A');   // el ticket va en mayúsculas: Ñ = 0xA5
    expect(t).toContain('CA\xA5ON');
    const star = ajustarParaImpresora('Star TSP100 Cutter (TSP143)', t);
    expect(star).toContain('\x1B\x1Dt\x01');
    expect(star).not.toContain('\x1C.');
  });
});

describe('ticket sin letras especiales', () => {
  it('no lleva el aviso de tabla: sale como antes', async () => {
    const { buildCotizacionEscPos, ESC_TABLA_437 } = await import('../src/services/escposReceipt');
    const t = buildCotizacionEscPos({ numero: 3, cliente_nombre: 'JUAN PEREZ' }, [{ descripcion: 'ACEITE 20W50', cantidad: 1, precio_unitario: 10, importe: 10 }],
      { nombre: 'REPUESTOS MORLA', direccion: 'Av. Duarte' });
    expect(t).not.toContain(ESC_TABLA_437);
    expect(/[\x80-\xFF]/.test(t)).toBe(false);
  });
});
