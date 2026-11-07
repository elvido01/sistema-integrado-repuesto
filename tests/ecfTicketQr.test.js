import { describe, it, expect, vi, beforeEach } from 'vitest';

// Lo que sale hacia la impresora: texto nativo (printRawEscPos) o imagen (printHtmlSmart).
const crudos = [];
const imagenes = [];
let impresora = 'Star TSP100 Cutter (TSP143)';
let agenteFalla = false;
vi.mock('@/services/printerAdapter', () => ({
  findReceiptPrinter: vi.fn(async () => impresora),
  printRawEscPos: vi.fn(async (nombre, escpos) => { if (agenteFalla) throw new Error('agente caído'); crudos.push({ nombre, escpos }); }),
  setPreferredBackend: vi.fn(),
  getPreferredBackend: vi.fn(() => 'agent'),
}));
vi.mock('@/lib/printHtmlSmart', () => ({
  printHtmlSmart: vi.fn(async (html) => { imagenes.push(html); return { backend: 'agent' }; }),
  printViaBrowser: vi.fn((html) => imagenes.push(html)),
  isSilentPrintEnabled: () => true,
}));
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
const ESC = '\x1B', GS = '\x1D';

describe('ticket de e-CF por el agente (fuentes nativas)', () => {
  beforeEach(() => { crudos.length = 0; imagenes.length = 0; impresora = 'Star TSP100 Cutter (TSP143)'; agenteFalla = false; });

  it('Star: texto nativo con el QR del modo Star, el e-NCF y el código de seguridad', async () => {
    const { imprimirFactura } = await import('../src/lib/printPOS.js');
    await imprimirFactura({ ...venta }, { printFormat: 'pos_4inch', printMethod: 'agent' });
    expect(imagenes).toHaveLength(0);
    expect(crudos).toHaveLength(1);
    const { escpos } = crudos[0];
    expect(escpos).toContain(ESC + GS + 'yS0');            // QR modo Star
    expect(escpos).toContain('consultatimbrefc');
    expect(escpos).not.toContain(GS + 'v0');               // no la imagen que salía basura
    expect(escpos).toContain('E320000000054');
    expect(escpos).toContain('jSux58');
  });

  it('otra marca (Epson): QR ESC/POS estándar', async () => {
    impresora = 'EPSON TM-T20';
    const { imprimirFactura } = await import('../src/lib/printPOS.js');
    await imprimirFactura({ ...venta }, { printFormat: 'pos_4inch', printMethod: 'agent' });
    expect(crudos[0].escpos).toContain(GS + '(k');
    expect(crudos[0].escpos).not.toContain(ESC + GS + 'yS0');
  });

  it('si el agente falla, sale el ticket como imagen (con su QR)', async () => {
    agenteFalla = true;
    const { imprimirFactura } = await import('../src/lib/printPOS.js');
    await imprimirFactura({ ...venta }, { printFormat: 'pos_4inch', printMethod: 'agent', onError: () => {} });
    await new Promise((r) => setTimeout(r, 50));
    expect(imagenes).toHaveLength(1);
    expect(imagenes[0]).toContain('data:image/png;base64');
  });
});

describe('ticket nativo: hora, cliente genérico y monto', () => {
  it('hora de la venta en AM/PM, sin Direccion/Tel vacíos y sin la E', async () => {
    const { buildFacturaEscPos } = await import('../src/services/escposReceipt.ts');
    const t = buildFacturaEscPos({ ...venta, fecha: '2026-11-07T23:22:00Z', clientes: { nombre: 'CLIENTE GENERICO', direccion: '', telefono: 'N/A' },
      facturas_detalle: [{ descripcion: 'PIEZA', cantidad: 1, precio: 100, importe: 100 }] }, {});
    expect(t).toContain('07:22 PM');
    expect(t).not.toContain('Direccion');
    expect(t).not.toContain('Tel. :');
    expect(t).not.toMatch(/100\.00 E/);
  });
  it('con dirección y teléfono, sí salen', async () => {
    const { buildFacturaEscPos } = await import('../src/services/escposReceipt.ts');
    const t = buildFacturaEscPos({ ...venta, clientes: { nombre: 'JUAN', direccion: 'Calle 1', telefono: '809-555-1234' } }, {});
    expect(t).toContain('Direccion : Calle 1');
    expect(t).toContain('Tel. : 809-555-1234');
  });
});
