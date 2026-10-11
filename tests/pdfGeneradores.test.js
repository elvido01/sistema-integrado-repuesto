// Prueba de humo de TODOS los PDF con la versión de jsPDF instalada.
// (11/10/2026) Al subir jsPDF 3 → 4 (arreglos de seguridad): cada generador
// se corre con datos de ejemplo y tiene que entregar un PDF de verdad.
// No mira el diseño (eso se ve imprimiendo), sino que nada reviente.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import jsPDF from 'jspdf';

let salidas = [];
beforeAll(() => {
  // En Node no hay navegador: save/abrir guardan los bytes aquí.
  jsPDF.API.save = function () { salidas.push(this.output('arraybuffer')); return this; };
  globalThis.window = globalThis.window || { open: () => null, location: { origin: 'http://localhost' } };
  globalThis.window.open = () => null;
  globalThis.document = globalThis.document || {
    createElement: () => ({ click() {}, style: {}, setAttribute() {}, appendChild() {} }),
    body: { appendChild() {}, removeChild() {} },
  };
  if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:prueba';
});
beforeEach(() => { salidas = []; });

const empresa = { nombre: 'EMPRESA PRUEBA', rnc: '131880681', direccion: 'C/ 1', telefono: '809-000-0000' };
const cliente = { nombre: 'TALLER EL MECANICO', rnc: '131880681', codigo: 'C-1', direccion: 'Higuey', telefono: '809' };
const linea = (i) => ({
  codigo: `P-${i}`, descripcion: `PIEZA ${i}`, cantidad: 2, precio: 250, precio_unitario: 250, costo: 120,
  costo_unitario: 120, itbis: 45, itbis_pct: 0.18, importe: 500, total: 590, subtotal: 500, descuento: 0,
  producto: { codigo: `P-${i}`, descripcion: `PIEZA ${i}` }, productos: { codigo: `P-${i}`, descripcion: `PIEZA ${i}` },
});
const lineas = [linea(1), linea(2), linea(3)];
const doc = {
  id: 'x', numero: 7, fecha: '2026-10-11T12:00:00Z', created_at: '2026-10-11T12:00:00Z', subtotal: 1500, itbis: 270,
  descuento: 0, total: 1770, monto: 1770, forma_pago: 'CONTADO', estado: 'PAGADA', notas: 'nota',
  cliente, clientes: cliente, cliente_nombre: cliente.nombre, vendedor: 'ANA', ncf: 'B0100000001', tipo_ncf: '01',
  detalles: lineas, items: lineas, factura_detalle: lineas, lineas, concepto: 'PAGO', descripcion: 'GASTO',
  suplidor: { nombre: 'PEDRO RACING' }, almacen: { nombre: 'PRINCIPAL' }, monto_recibido: 2000, cambio: 230,
};

const esPdf = async (promesa) => {
  const r = await promesa;
  const bytes = salidas.at(-1) || (r instanceof ArrayBuffer ? r : null);
  if (bytes) expect(new TextDecoder().decode(new Uint8Array(bytes).slice(0, 5))).toBe('%PDF-');
  return r;
};

describe('generadores de PDF con jsPDF ' + (jsPDF.version || ''), () => {
  const casos = [
    ['comision', async () => (await import('@/components/common/pdf/comisionPDF')).generateComisionPDF(
      [{ ...doc, comision: 50, porcentaje: 5, vendedor: 'ANA' }], { vendedorName: 'ANA', startDate: '2026-10-01', endDate: '2026-10-11' })],
    ['compra', async () => (await import('@/components/common/pdf/compraPDF')).generateCompraPDF(doc, { nombre: 'PEDRO RACING' }, lineas, { nombre: 'ANA' }, empresa)],
    ['cotizacion', async () => (await import('@/components/common/pdf/cotizacionPDF')).generateCotizacionPDF(doc, cliente, lineas)],
    ['cotizacionMagna', async () => (await import('@/components/common/pdf/cotizacionMagnaPDF')).generateCotizacionMagnaPDF(doc, lineas)],
    ['devolucion', async () => (await import('@/components/common/pdf/devolucionPDF')).generateDevolucionPDF(doc, doc, cliente, lineas)],
    ['entrada', async () => (await import('@/components/common/pdf/entradaPDF')).generateEntradaPDF(doc, { nombre: 'PRINCIPAL' }, lineas, empresa)],
    ['salida', async () => (await import('@/components/common/pdf/salidaPDF')).generateSalidaPDF(doc, { nombre: 'PRINCIPAL' }, lineas, empresa)],
    ['facturaCarta', async () => (await import('@/components/common/pdf/facturaCartaPDF')).generateFacturaCartaPDF(doc, empresa, 'descargar')],
    ['factura', async () => (await import('@/components/common/pdf/facturaPDF')).generateFacturaPDF(doc, empresa)],
    ['gastoDiario', async () => (await import('@/components/common/pdf/gastoDiarioPDF')).generateGastoDiarioPDF(doc, empresa)],
    ['historicoCliente', async () => (await import('@/components/common/pdf/historicoClientePDF')).generateHistoricoClientePDF(
      { cliente, movimientos: lineas.map((l) => ({ ...doc, ...l })), facturas: [doc], recibos: [] }, empresa)],
    ['listaChasis', async () => (await import('@/components/common/pdf/listaChasisPDF')).generateListaChasisPDF(
      [{ chasis: 'ABC123', modelo: 'CG150', color: 'ROJO', marca: 'HONDA', ano: 2026 }], {}, empresa)],
    ['orden', async () => (await import('@/components/common/pdf/orderPDF')).generateOrderPDF(doc, { nombre: 'PEDRO RACING' }, lineas, empresa)],
    ['pagoCompromiso', async () => (await import('@/components/common/pdf/pagoCompromisoPDF')).generatePagoCompromisoPDF(doc, empresa)],
    ['pagoSuplidor', async () => (await import('@/components/common/pdf/pagoSuplidorPDF')).generatePagoSuplidorPDF(
      doc, 'PEDRO RACING', [{ ...doc, monto_aplicado: 500 }], [{ forma: 'EFECTIVO', monto: 500 }], empresa)],
    ['pedido', async () => (await import('@/components/common/pdf/pedidoPDF')).generatePedidoPDF(doc, cliente, { nombre: 'ANA' }, lineas)],
    ['recibo', async () => (await import('@/components/common/pdf/reciboPDF')).generateReciboPDF(
      doc, cliente, [{ ...doc, monto_abonado: 500, factura_numero: 7 }], [{ forma: 'EFECTIVO', monto: 500 }])],
    ['reciboFinanciera', async () => (await import('@/components/common/pdf/reciboPagoFinancieraPDF')).generateReciboPagoFinancieraPDF(
      doc, cliente, [{ concepto: 'CUOTA 1', monto: 500 }], empresa)],
    ['transacciones', async () => (await import('@/components/common/pdf/transaccionesReportePDF')).generateTransaccionesReportePDF(
      [doc, { ...doc, numero: 8 }], { startDate: '2026-10-01', endDate: '2026-10-11' }, { total: 3540, contado: 3540, credito: 0 }, empresa)],
    ['representacionDGII', async () => {
      const { generateRepresentacionImpresaPdfFromData } = await import('@/lib/dgiiRepresentacionImpresa');
      const { doc: pdf } = await generateRepresentacionImpresaPdfFromData({
        tipo: '31', encf: 'E310000000001', rncEmisor: '131880681', razonSocialEmisor: 'EMPRESA PRUEBA',
        rncComprador: '101000000', razonSocialComprador: 'CLIENTE', fechaEmision: '11-10-2026',
        montoTotal: 1770, totalItbis: 270, montoGravadoTotal: 1500, codigoSeguridad: 'Ab12Cd',
        fechaFirma: '11-10-2026 12:00:00', ambiente: 'Produccion', items: lineas,
      });
      return pdf.output('arraybuffer');
    }],
  ];

  for (const [nombre, correr] of casos) {
    it(`${nombre}: sale un PDF`, async () => {
      await esPdf(correr());
    });
  }
});
