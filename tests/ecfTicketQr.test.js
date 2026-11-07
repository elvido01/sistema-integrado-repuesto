import { describe, it, expect, vi, beforeEach } from 'vitest';

// El ticket que sale hacia el agente (printHtmlSmart) se captura aquí.
const enviados = [];
vi.mock('@/lib/printHtmlSmart', () => ({
  printHtmlSmart: vi.fn(async (html, opts) => { enviados.push({ html, opts }); return { backend: 'agent' }; }),
  printViaBrowser: vi.fn((html) => enviados.push({ html, opts: { navegador: true } })),
  isSilentPrintEnabled: () => true,
}));
vi.mock('../src/lib/printHtmlSmart', () => ({
  printHtmlSmart: vi.fn(async (html, opts) => { enviados.push({ html, opts }); return { backend: 'agent' }; }),
  printViaBrowser: vi.fn((html) => enviados.push({ html, opts: { navegador: true } })),
  isSilentPrintEnabled: () => true,
}));
// Sin base: completarExtras y la consulta de respaldo no encuentran nada.
vi.mock('@/lib/customSupabaseClient', () => {
  const q = { select: () => q, eq: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: null, error: null }), then: (r) => r({ data: [], error: null }) };
  return { supabase: { from: () => q } };
});

// Lo que devuelve emitir-fiscal en producción (E320000000054 de Morla, 07/11).
const impresion = {
  encf: 'E320000000054', ambiente: 'Produccion', tipo_ecf: '32', rnc_emisor: '02800991560',
  fecha_firma: '07-11-2026 18:01:25', monto_total: '400.00', fecha_emision: '07-11-2026',
  rnc_comprador: null, codigo_seguridad: 'jSux58', fecha_vencimiento: null,
};
const venta = {
  id: 'dfabf338-c393-41ec-896c-c02403853b1a', numero: 4861, fecha: '2026-11-07T18:01:20Z',
  ncf: 'E320000000054', encf: 'E320000000054', impresion_ecf: impresion,
  subtotal: 338.98, itbis: 61.02, total: 400, facturas_detalle: [{ descripcion: 'PIEZA', cantidad: 1, precio: 400, importe: 400 }],
  clientes: { nombre: 'CLIENTE GENERICO' },
};

describe('ticket de e-CF por el agente', () => {
  beforeEach(() => { enviados.length = 0; });

  it('venta en vivo (agente, sin diálogo): el ticket lleva el QR y el código de seguridad', async () => {
    const { imprimirFactura } = await import('../src/lib/printPOS.js');
    await imprimirFactura({ ...venta }, { printFormat: 'pos_4inch', printMethod: 'agent' });
    await new Promise((r) => setTimeout(r, 50));
    expect(enviados).toHaveLength(1);
    const { html } = enviados[0];
    expect(html).toContain('data:image/png;base64');
    expect(html).toContain('jSux58');
  });

  it('reimpresión (la factura viene de la base: sin impresion_ecf)', async () => {
    const { imprimirFactura } = await import('../src/lib/printPOS.js');
    const { impresion_ecf, encf, ...deLaBase } = venta;
    await imprimirFactura(deLaBase, { printFormat: 'pos_4inch', printMethod: 'agent' });
    await new Promise((r) => setTimeout(r, 50));
    expect(enviados).toHaveLength(1);
  });
});
