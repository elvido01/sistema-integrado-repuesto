import jsPDF from 'jspdf';
import { openPdf } from './openPdf';
import autoTable from 'jspdf-autotable';
import { formatInTimeZone } from '@/lib/dateUtils';

const fmt = (v) => (parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fdate = (d) => { try { return d ? formatInTimeZone(new Date(`${String(d).slice(0,10)}T00:00:00`), 'dd/MM/yyyy') : ''; } catch { return ''; } };

// Recibo de Pago de préstamo (reimpresión) en A4.
// pago: fila de prestamo_pagos; cliente: {codigo,nombre,direccion,telefono};
// lineas: [{referencia, capital, interes, mora, total}]
export const generateReciboPagoFinancieraPDF = (pago, cliente = {}, lineas = [], empresa = {}) => {
  const doc = new jsPDF('portrait');
  const pageWidth = doc.internal.pageSize.width;
  const margin = 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text((empresa.nombre || 'MotoPréstamos').toUpperCase(), margin, 16);
  doc.setFontSize(13);
  doc.text('RECIBO DE PAGO', pageWidth / 2, 24, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Recibo Nº: ${pago?.numero || ''}`, pageWidth - margin, 16, { align: 'right' });
  doc.text(`Fecha: ${fdate(pago?.fecha)}`, pageWidth - margin, 22, { align: 'right' });

  // Cliente
  doc.setFont('helvetica', 'bold');
  doc.text('CLIENTE:', margin, 36);
  doc.setFont('helvetica', 'normal');
  doc.text(`${cliente?.codigo || ''}  ${(cliente?.nombre || '').toUpperCase()}`, margin + 22, 36);
  if (cliente?.direccion) doc.text(cliente.direccion, margin, 42);
  if (pago?.cobrador) doc.text(`Cobrador: ${pago.cobrador}`, pageWidth - margin, 42, { align: 'right' });

  const body = (lineas || []).map((l) => [
    l.referencia || '',
    fmt(l.capital), fmt(l.interes), fmt(l.mora), fmt(l.total),
  ]);
  if (body.length === 0) body.push(['—', '0.00', '0.00', '0.00', fmt(pago?.total_pagado)]);

  autoTable(doc, {
    head: [['Referencia', 'Capital', 'Interés', 'Mora', 'Abono']],
    body,
    startY: 50,
    theme: 'grid',
    styles: { fontSize: 9, font: 'helvetica', cellPadding: 2 },
    headStyles: { fillColor: [4, 53, 115], textColor: 255 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    margin: { left: margin, right: margin },
  });

  const finalY = doc.lastAutoTable.finalY + 14;
  const x = pageWidth - margin - 70;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Balance Anterior:', x, finalY, { align: 'right' });
  doc.text(fmt(pago?.balance_anterior), pageWidth - margin, finalY, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL PAGADO:', x, finalY + 12, { align: 'right' });
  doc.text(fmt(pago?.total_pagado), pageWidth - margin, finalY + 12, { align: 'right' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Balance Actual:', x, finalY + 24, { align: 'right' });
  doc.text(fmt(pago?.balance_actual), pageWidth - margin, finalY + 24, { align: 'right' });

  const sigY = finalY + 60;
  doc.line(margin, sigY, margin + 60, sigY);
  doc.text('Firma Cliente', margin + 12, sigY + 5);
  doc.line(pageWidth - margin - 60, sigY, pageWidth - margin, sigY);
  doc.text('Cobrador', pageWidth - margin - 40, sigY + 5);

  openPdf(doc, `Recibo-Pago-${pago?.numero || 'NA'}.pdf`);
};
