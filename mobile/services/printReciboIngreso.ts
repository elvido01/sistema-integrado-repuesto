import { printTicket, type TicketLine } from './bluetoothPrinter';
import type { ClienteRecibo, EmpresaRecibo, FacturaPendiente, FormaPagoRecibo } from '@/src/services/reciboIngresoService';

const fmt = (n: number) => Number(n || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const only = (value?: string | null) => String(value || '').trim();
const clean = (value?: string | null) => only(value).replace(/[^\x20-\x7E]/g, '');

function leftRight(left: string, right: string, width: number) {
  const l = clean(left);
  const r = clean(right);
  const spaces = Math.max(1, width - l.length - r.length);
  return l + ' '.repeat(spaces) + r;
}

function padRight(s: string, n: number) {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

function padLeft(s: string, n: number) {
  return s.length >= n ? s.slice(0, n) : ' '.repeat(n - s.length) + s;
}

function docRow(ref: string, balance: string, paid: string, width: number) {
  const refW = width >= 36 ? 9 : 8;
  const balanceW = width >= 36 ? 10 : 9;
  const paidW = width - refW - balanceW;
  return padRight(clean(ref), refW) + padLeft(clean(balance), balanceW) + padLeft(clean(paid), paidW);
}

export async function printReciboIngreso(
  recibo: {
    numero: string;
    fecha: string;
    cliente: ClienteRecibo | null;
    facturas: FacturaPendiente[];
    balanceAnterior?: number;
    balanceActual?: number;
    totalBalance: number;
    totalPago: number;
    formaPago: FormaPagoRecibo;
    empresa?: EmpresaRecibo | null;
  },
  { width = 32 } = {}
) {
  const lines: TicketLine[] = [];
  const empresa = recibo.empresa || {};
  const nombre = clean(empresa.razon_social || empresa.nombre || 'MotoFlow');
  const dir1 = clean(empresa.direccion1);
  const dir2 = clean(empresa.direccion2);
  const tel = clean(empresa.telefono);
  const rnc = clean(empresa.rnc);
  const cliente = clean(recibo.cliente?.nombre || 'CLIENTE');
  const pago = recibo.formaPago;
  const docs = recibo.facturas.filter((f) => Number(f.abono || 0) > 0);
  const balanceAnterior = Number(recibo.balanceAnterior ?? recibo.totalBalance ?? 0);
  const balanceActual = Number(recibo.balanceActual ?? Math.max(0, balanceAnterior - Number(recibo.totalPago || 0)));

  lines.push({ type: 'text', text: nombre, align: 'center', bold: true });
  if (dir1) lines.push({ type: 'text', text: dir1, align: 'center' });
  if (dir2) lines.push({ type: 'text', text: dir2, align: 'center' });
  if (tel) lines.push({ type: 'text', text: tel, align: 'center' });
  if (rnc) lines.push({ type: 'text', text: `RNC: ${rnc}`, align: 'center' });
  lines.push({ type: 'text', text: 'RECIBO DE INGRESO', align: 'center', bold: true });
  lines.push({ type: 'feed', lines: 1 });
  lines.push({ type: 'text', text: leftRight(`No. Recibo: ${clean(recibo.numero)}`, recibo.fecha, width) });
  lines.push({ type: 'text', text: `CLIENTE: ${cliente.toUpperCase()}`, bold: true });
  lines.push({ type: 'sep' });

  lines.push({ type: 'text', text: 'FACTURAS ABONADAS:', bold: true });
  lines.push({ type: 'text', text: docRow('REFER.', 'BALANCE', 'MONTO PAGADO', width) });
  docs.forEach((f) => {
    const id = clean(f.numero || f.referencia || 'DOC');
    lines.push({
      type: 'text',
      text: docRow(id, fmt(f.monto_pendiente), fmt(f.abono), width),
    });
  });

  lines.push({ type: 'sep' });
  lines.push({ type: 'text', text: 'DETALLE DE PAGO:', bold: true });
  if (pago.forma === 'Tarjeta') {
    const label = pago.referencia ? `TARJETA (${clean(pago.referencia)})` : 'TARJETA';
    lines.push({ type: 'text', text: leftRight(label, fmt(pago.monto), width) });
  } else if (pago.forma === 'Transferencia') {
    const label = pago.referencia ? `TRANSFERENCIA (${clean(pago.referencia)})` : 'TRANSFERENCIA';
    lines.push({ type: 'text', text: leftRight(label, fmt(pago.monto), width) });
  } else {
    lines.push({ type: 'text', text: leftRight('EFECTIVO', fmt(pago.monto), width) });
  }
  if (pago.banco) lines.push({ type: 'text', text: `BANCO: ${clean(pago.banco)}` });
  if (pago.observaciones) lines.push({ type: 'text', text: clean(pago.observaciones) });
  lines.push({ type: 'sep' });
  lines.push({ type: 'text', text: leftRight('Balance Anterior:', fmt(balanceAnterior), width) });
  lines.push({ type: 'text', text: leftRight('TOTAL PAGADO:', fmt(recibo.totalPago), width), bold: true });
  lines.push({ type: 'text', text: leftRight('Balance Actual:', fmt(balanceActual), width), bold: true });

  lines.push({ type: 'feed', lines: 2 });
  lines.push({ type: 'text', text: '________________________', align: 'center' });
  lines.push({ type: 'text', text: 'Firma', align: 'center' });
  lines.push({ type: 'text', text: '*** GRACIAS POR SU PAGO ***', align: 'center', bold: true });
  lines.push({ type: 'text', text: 'Motoflow Mobile', align: 'center' });

  await printTicket(lines, { cut: true, width });
}
