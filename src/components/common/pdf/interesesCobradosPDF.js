import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { openPdf } from './openPdf';
import { formatInTimeZone, formatFechaDMY } from '@/lib/dateUtils';

const fmt = (v) => (v == null || v === '' ? '—' : (parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fdate = (d) => (d ? formatFechaDMY(String(d).slice(0, 10)) : '');

// (12/11/2026) "Interés cobrado o acreditado" en A4 horizontal, como el del SiiF.
export const generateInteresesCobradosPDF = (rows = [], filtros = {}, totales = {}, empresa = {}) => {
  const doc = new jsPDF('landscape');
  const pageWidth = doc.internal.pageSize.width;
  const margin = 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text((empresa.nombre || 'Financiera').toUpperCase(), margin, 13);
  doc.setFontSize(12);
  doc.text(filtros.tipo === 'acreditado' ? 'INTERÉS ACREDITADO (NOTAS DE CRÉDITO)' : 'INTERÉS COBRADO (RECIBOS DE INGRESO)',
    pageWidth / 2, 19, { align: 'center' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Impresión: ${formatInTimeZone(new Date(), 'dd/MM/yyyy hh:mm a')}`, pageWidth - margin, 13, { align: 'right' });
  doc.text(`Desde ${fdate(filtros.desde)} hasta ${fdate(filtros.hasta)}${filtros.cliente ? ` · Cliente: ${filtros.cliente}` : ''}`, margin, 25);

  const conCargos = rows.some((r) => Number(r.cargos) > 0);
  const head = ['FECHA', 'TRANSACCIÓN', 'CLIENTE', 'DESCRIPCIÓN', 'CAPITAL', 'INTERÉS', 'ATRASO', ...(conCargos ? ['CARGOS'] : []), 'TOTAL'];
  const body = rows.map((r) => [
    fdate(r.fecha), r.transaccion || '', (r.cliente || '').substring(0, 30), (r.descripcion || '').replace(/\s+/g, ' ').substring(0, 46),
    fmt(r.capital), fmt(r.interes), fmt(r.atraso), ...(conCargos ? [fmt(r.cargos)] : []), fmt(r.total),
  ]);
  body.push([
    { content: `TOTAL (${rows.length})`, colSpan: 4, styles: { fontStyle: 'bold', halign: 'right' } },
    fmt(totales.capital), fmt(totales.interes), fmt(totales.atraso), ...(conCargos ? [fmt(totales.cargos)] : []), fmt(totales.total),
  ].map((c) => (typeof c === 'string' ? { content: c, styles: { fontStyle: 'bold' } } : c)));

  const numCols = {};
  for (let i = 4; i < head.length; i++) numCols[i] = { halign: 'right' };

  autoTable(doc, {
    head: [head],
    body,
    startY: 28,
    theme: 'grid',
    styles: { fontSize: 7, font: 'helvetica', cellPadding: 1.2 },
    headStyles: { fillColor: [4, 53, 115], textColor: 255, fontSize: 7 },
    columnStyles: numCols,
    margin: { left: margin, right: margin },
  });

  if (totales.sinDesglose > 0) {
    let y = doc.lastAutoTable.finalY + 5;
    if (y > doc.internal.pageSize.height - 8) { doc.addPage(); y = 15; }
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.text(`${totales.sinDesglose} cobro(s) sin desglose de capital/interés (pagos viejos del SiiF): cuentan solo en el TOTAL.`,
      margin, y);
  }

  openPdf(doc, `intereses_${filtros.tipo || 'cobrado'}_${filtros.desde}_${filtros.hasta}.pdf`);
};
