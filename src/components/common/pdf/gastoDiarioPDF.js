import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatInTimeZone } from '@/lib/dateUtils';

const formatCurrency = (value) =>
  (parseFloat(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (date) => {
  if (!date) return 'N/A';
  try {
    return formatInTimeZone(new Date(date), 'dd/MM/yyyy');
  } catch (e) {
    return 'N/A';
  }
};

// Comprobante de un Gasto Diario (salida de efectivo de caja).
// Mismo estilo que generatePagoCompromisoPDF, con espacio para firma.
export const generateGastoDiarioPDF = (gasto, empresa = {}) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const margin = 14;

  // Numero legible basado en la fecha/hora (los gastos no llevan secuencia propia)
  const numero = gasto.numero || formatInTimeZone(new Date(Date.now()), 'yyyyMMdd-HHmmss');

  // --- Header ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(empresa.nombre || 'Mi Empresa', margin, 20);

  doc.setFontSize(12);
  doc.text('COMPROBANTE DE GASTO', margin, 28);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  if (empresa.direccion) doc.text(empresa.direccion, pageWidth / 2, 12, { align: 'center' });
  if (empresa.telefono) doc.text(empresa.telefono, pageWidth / 2, 17, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`NUMERO : ${numero}`, pageWidth - margin, 20, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`FECHA : ${formatDate(gasto.fecha || new Date())}`, pageWidth - margin, 26, { align: 'right' });

  // --- Tipo de gasto ---
  doc.setLineWidth(0.5);
  doc.line(margin, 38, pageWidth - margin, 38);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('TIPO DE GASTO:', margin, 48);
  doc.setFont('helvetica', 'normal');
  doc.text(String(gasto.tipo_gasto || 'N/A').toUpperCase(), margin + 32, 48);

  // --- Tabla: descripcion + monto ---
  autoTable(doc, {
    head: [['DESCRIPCION', 'MONTO']],
    body: [[gasto.descripcion || '---', formatCurrency(gasto.monto)]],
    startY: 56,
    theme: 'grid',
    headStyles: { fillColor: [4, 53, 115], textColor: 255 },
    columnStyles: { 1: { halign: 'right' } },
  });

  let currentY = doc.lastAutoTable.finalY + 15;

  // --- Total ---
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL:', 140, currentY);
  doc.text(formatCurrency(gasto.monto), pageWidth - margin, currentY, { align: 'right' });

  // --- Firmas ---
  const signatureY = currentY + 35;
  doc.line(margin, signatureY, margin + 60, signatureY);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Autorizado por', margin + 16, signatureY + 5);

  doc.line(130, signatureY, 190, signatureY);
  doc.text('Recibido por', 145, signatureY + 5);

  doc.output('dataurlnewwindow', { filename: `Gasto-${numero}.pdf` });
};
