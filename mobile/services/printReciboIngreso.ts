import { printTicket, type TicketLine } from './bluetoothPrinter';
import type { ClienteRecibo, EmpresaRecibo, FacturaPendiente, FormaPagoRecibo } from '@/src/services/reciboIngresoService';

const fmt = (n: number) => Number(n || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const only = (value?: string | null) => String(value || '').trim();
const clean = (value?: string | null) => only(value).replace(/[^\x20-\x7E]/g, '');

function padLeft(s: string, n: number) {
  return s.length >= n ? s.slice(0, n) : ' '.repeat(n - s.length) + s;
}

function padRight(s: string, n: number) {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

export async function printReciboIngreso(
  recibo: {
    numero: string;
    fecha: string;
    cliente: ClienteRecibo | null;
    facturas: FacturaPendiente[];
    totalBalance: number;
    totalPago: number;
    formaPago: FormaPagoRecibo;
    empresa?: EmpresaRecibo | null;
  },
  { width = 32 } = {}
) {
  const lines: TicketLine[] = [];
  const empresa = recibo.empresa || {};
  const nombre = clean(empresa.razon_social || empresa.nombre || 'REPUESTOS MORLA');
  const dir1 = clean(empresa.direccion1);
  const dir2 = clean(empresa.direccion2);
  const tel = clean(empresa.telefono);
  const rnc = clean(empresa.rnc);
  const cliente = clean(recibo.cliente?.nombre || 'CLIENTE');
  const pago = recibo.formaPago;
  const docs = recibo.facturas.filter((f) => Number(f.abono || 0) > 0);
  const balanceActual = Math.max(0, Number(recibo.totalBalance || 0) - Number(recibo.totalPago || 0));

  lines.push({ type: 'text', text: nombre, align: 'center', bold: true });
  if (dir1) lines.push({ type: 'text', text: dir1, align: 'center' });
  if (dir2) lines.push({ type: 'text', text: dir2, align: 'center' });
  if (tel) lines.push({ type: 'text', text: tel, align: 'center' });
  if (rnc) lines.push({ type: 'text', text: `RNC: ${rnc}`, align: 'center' });
  lines.push({ type: 'text', text: `Recibo #${clean(recibo.numero)}`, align: 'center', bold: true });
  lines.push({ type: 'text', text: `Fecha:${recibo.fecha}  Valido`, align: 'center' });
  lines.push({ type: 'text', text: cliente, align: 'center' });
  lines.push({ type: 'text', text: `Monto:${fmt(recibo.totalPago)}` });
  lines.push({ type: 'sep' });

  const idW = 10;
  const balW = 10;
  const payW = width - idW - balW;
  lines.push({
    type: 'text',
    text: padRight('ID Doc.', idW) + padLeft('Balance', balW) + padLeft('Monto Pago', payW),
  });
  lines.push({ type: 'sep', char: '-' });

  docs.forEach((f) => {
    const id = clean(f.numero || f.referencia || 'DOC');
    lines.push({
      type: 'text',
      text: padRight(id, idW) + padLeft(fmt(f.monto_pendiente), balW) + padLeft(fmt(f.abono), payW),
    });
  });

  lines.push({ type: 'sep' });
  lines.push({
    type: 'text',
    text: padRight('Totales:', idW) + padLeft(fmt(recibo.totalBalance), balW) + padLeft(fmt(recibo.totalPago), payW),
    bold: true,
  });
  lines.push({ type: 'text', text: `FORMA DE PAGO:` });
  lines.push({ type: 'text', text: clean(pago.forma).toUpperCase() });
  if (pago.forma === 'Tarjeta') {
    lines.push({ type: 'text', text: `MONTO TC:${fmt(pago.monto)} NUM:${clean(pago.referencia)}` });
  } else if (pago.forma === 'Transferencia') {
    lines.push({ type: 'text', text: `TRANSF:${fmt(pago.monto)} REF:${clean(pago.referencia)}` });
  } else {
    lines.push({ type: 'text', text: `EFECTIVO:${fmt(pago.monto)}` });
  }
  if (pago.banco) lines.push({ type: 'text', text: `BANCO: ${clean(pago.banco)}` });
  if (pago.observaciones) lines.push({ type: 'text', text: clean(pago.observaciones) });
  lines.push({ type: 'text', text: `Balance actual: ${fmt(balanceActual)}` });

  lines.push({ type: 'feed', lines: 2 });
  lines.push({ type: 'text', text: '________________________', align: 'center' });
  lines.push({ type: 'text', text: 'Firma', align: 'center' });
  lines.push({ type: 'text', text: 'Gracias por su compra', align: 'center' });
  lines.push({ type: 'text', text: 'Motoflow Mobile', align: 'center' });

  await printTicket(lines, { cut: true, width });
}
