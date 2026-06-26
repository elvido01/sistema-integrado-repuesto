import jsPDF from 'jspdf';
import { openPdf } from './openPdf';
import autoTable from 'jspdf-autotable';
import { formatInTimeZone } from '@/lib/dateUtils';

const fmt = (v) => (parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fdate = (d) => { try { return d ? formatInTimeZone(new Date(`${String(d).slice(0,10)}T00:00:00`), 'dd/MM/yyyy') : ''; } catch { return ''; } };

// Histórico de Cliente (libro mayor) en A4 vertical.
// data: { cliente, desde, hasta, ultimo_pago, saldo_inicial, movimientos[] }
export const generateHistoricoClientePDF = (data, empresa = {}) => {
  const doc = new jsPDF('portrait');
  const pageWidth = doc.internal.pageSize.width;
  const margin = 10;
  const movs = data?.movimientos || [];

  // Encabezado
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text((empresa.nombre || 'MotoPréstamos').toUpperCase(), margin, 14);
  doc.setFontSize(13);
  doc.text('HISTÓRICO DE CLIENTE', pageWidth / 2, 21, { align: 'center' });

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Impresión: ${formatInTimeZone(new Date(), 'dd/MM/yyyy hh:mm a')}`, pageWidth - margin, 14, { align: 'right' });

  // Datos del cliente
  const c = data?.cliente || {};
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Cliente: `, margin, 30);
  doc.setFont('helvetica', 'normal');
  doc.text(`${c.codigo || ''}  ${c.nombre || ''}`, margin + 14, 30);
  if (c.direccion) doc.text(`${c.direccion}`, margin, 35);
  doc.text(`Periodo: ${fdate(data?.desde)} al ${fdate(data?.hasta)}`, pageWidth - margin, 30, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(180, 0, 0);
  doc.text(`Último Pago: ${fdate(data?.ultimo_pago) || 'N/A'}`, pageWidth - margin, 35, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  // Tabla con balance corrido
  let saldo = Number(data?.saldo_inicial) || 0;
  const rows = [];
  // fila de saldo inicial
  rows.push(['', '', '', 'BALANCE ANTERIOR', '', '', fmt(saldo)]);
  movs.forEach((m) => {
    saldo = Math.round((saldo + (Number(m.debito) || 0) - (Number(m.credito) || 0)) * 100) / 100;
    rows.push([
      fdate(m.fecha),
      m.transaccion || '',
      m.referencia || '',
      (m.descripcion || '').substring(0, 42),
      (Number(m.debito) || 0) ? fmt(m.debito) : '',
      (Number(m.credito) || 0) ? fmt(m.credito) : '',
      fmt(saldo),
    ]);
  });

  const totDeb = movs.reduce((a, m) => a + (Number(m.debito) || 0), 0);
  const totCre = movs.reduce((a, m) => a + (Number(m.credito) || 0), 0);

  autoTable(doc, {
    head: [['FECHA', 'TRANSACCIÓN', 'REFERENCIA', 'DESCRIPCIÓN', 'DÉBITOS', 'CRÉDITOS', 'BALANCE']],
    body: rows,
    startY: 40,
    theme: 'grid',
    styles: { fontSize: 7, font: 'helvetica', cellPadding: 1.3 },
    headStyles: { fillColor: [4, 53, 115], textColor: 255, fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 24 },
      2: { cellWidth: 24 },
      4: { halign: 'right', cellWidth: 24 },
      5: { halign: 'right', cellWidth: 24 },
      6: { halign: 'right', cellWidth: 26, fontStyle: 'bold' },
    },
    margin: { left: margin, right: margin },
  });

  const finalY = doc.lastAutoTable.finalY + 8;
  doc.setDrawColor(0); doc.setLineWidth(0.4);
  doc.line(pageWidth - margin - 90, finalY - 4, pageWidth - margin, finalY - 4);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('TOTALES →', pageWidth - margin - 92, finalY, { align: 'right' });
  doc.text(fmt(totDeb), pageWidth - margin - 50, finalY, { align: 'right' });
  doc.text(fmt(totCre), pageWidth - margin - 26, finalY, { align: 'right' });
  doc.text(fmt(saldo), pageWidth - margin, finalY, { align: 'right' });

  openPdf(doc, `Historico-${c.codigo || c.nombre || 'cliente'}.pdf`);
};
