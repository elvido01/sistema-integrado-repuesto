import { printTicket, type TicketLine } from './bluetoothPrinter';

export type ReciboFinancieraPrintData = {
  numero: string;
  fecha: string;
  clienteNombre: string;
  clienteCodigo?: string | null;
  totalPagado: number;
  sobrante?: number;
  balanceAnterior: number;
  balanceActual: number;
  formaPago: string;
  cuenta?: string | null;
  banco?: string | null;
  comentarios?: string | null;
  cobrador?: string | null;
  detalles?: ReciboFinancieraDetalle[];
};

export type ReciboFinancieraDetalle = {
  cuotaId?: string;
  documento: string;
  referencia: string;
  fecha: string;
  monto: number;
  abono: number;
  pendiente: number;
  abonoCapital?: number;
  abonoInteres?: number;
  abonoMora?: number;
};

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const clean = (value?: string | null) => String(value || '').replace(/[^\x20-\x7E]/g, '').trim();

const ticketDate = (value?: string | null) => {
  const raw = clean(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  return `${match[3]}-${match[2]}-${match[1]}`;
};

function leftRight(left: string, right: string, width: number) {
  const l = clean(left);
  const r = clean(right);
  const spaces = Math.max(1, width - l.length - r.length);
  return l + ' '.repeat(spaces) + r;
}

export async function printReciboFinanciera(recibo: ReciboFinancieraPrintData, { width = 48 } = {}) {
  const lines: TicketLine[] = [];
  const forma = clean(recibo.formaPago || 'Efectivo').toUpperCase();
  const detallesAfectados = (recibo.detalles || []).filter((item) => Number(item.abono || 0) > 0);

  lines.push({ type: 'text', text: 'MOTOPRESTAMOS LOS NARANJOS', align: 'center', bold: true });
  lines.push({ type: 'text', text: 'RECIBO DE PAGO', align: 'center', bold: true });
  lines.push({ type: 'feed', lines: 1 });
  lines.push({ type: 'text', text: leftRight(`No. Recibo: ${clean(recibo.numero)}`, ticketDate(recibo.fecha), width) });
  lines.push({ type: 'text', text: `MONTO: ${fmt(recibo.totalPagado)}`, bold: true });
  if (recibo.cobrador) lines.push({ type: 'text', text: `COBRADOR: ${clean(recibo.cobrador)}` });
  lines.push({ type: 'feed', lines: 1 });
  lines.push({ type: 'text', text: 'HEMOS RECIBIDO DE:' });
  lines.push({ type: 'text', text: clean(recibo.clienteNombre).toUpperCase(), bold: true });
  if (recibo.clienteCodigo) lines.push({ type: 'text', text: `CODIGO: ${clean(recibo.clienteCodigo)}` });
  lines.push({ type: 'feed', lines: 1 });
  lines.push({ type: 'text', text: 'POR CONCEPTO DE:' });
  lines.push({ type: 'text', text: clean(recibo.comentarios).toUpperCase(), bold: true });
  lines.push({ type: 'sep' });
  if (detallesAfectados.length) {
    detallesAfectados.forEach((item) => {
      lines.push({ type: 'text', text: `Documento : ${clean(item.documento)}` });
      lines.push({ type: 'text', text: `Referencia: ${clean(item.referencia)}` });
      lines.push({ type: 'text', text: `Fecha: ${ticketDate(item.fecha)}` });
      lines.push({ type: 'text', text: `Monto: ${fmt(item.monto)}` });
      lines.push({ type: 'text', text: `Abono: ${fmt(item.abono)}`, bold: true });
      lines.push({ type: 'text', text: `Pendiente: ${fmt(item.pendiente)}` });
      lines.push({ type: 'feed', lines: 1 });
    });
    lines.push({ type: 'sep' });
  }
  lines.push({ type: 'text', text: leftRight('Balance Anterior:', fmt(recibo.balanceAnterior), width) });
  lines.push({ type: 'text', text: leftRight('Abono a Cuenta:', fmt(recibo.totalPagado), width), bold: true });
  if (Number(recibo.sobrante || 0) > 0) {
    lines.push({ type: 'text', text: leftRight('Sobrante:', fmt(Number(recibo.sobrante || 0)), width) });
  }
  lines.push({ type: 'text', text: leftRight('Balance Actual:', fmt(recibo.balanceActual), width), bold: true });
  lines.push({ type: 'feed', lines: 1 });
  lines.push({ type: 'text', text: forma });
  if (recibo.cuenta) lines.push({ type: 'text', text: `REF: ${clean(recibo.cuenta)}` });
  if (recibo.banco) lines.push({ type: 'text', text: `BANCO: ${clean(recibo.banco)}` });
  lines.push({ type: 'feed', lines: 2 });
  lines.push({ type: 'text', text: '________________________', align: 'center' });
  lines.push({ type: 'text', text: 'Firma', align: 'center' });
  lines.push({ type: 'text', text: '*** GRACIAS POR SU PAGO ***', align: 'center', bold: true });
  lines.push({ type: 'text', text: 'Motoflow Mobile', align: 'center' });

  await printTicket(lines, { cut: true, width });
}
