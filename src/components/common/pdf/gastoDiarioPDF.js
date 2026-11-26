import jsPDF from 'jspdf';
import { openPdf } from './openPdf';
import autoTable from 'jspdf-autotable';
import { formatInTimeZone } from '@/lib/dateUtils';
import { pieEmpresa, RESERVA_PIE, espacioPara } from './pieEmpresa';

const formatCurrency = (value) =>
  (parseFloat(value) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (date) => {
  if (!date) return 'N/A';
  try {
    // Una fecha pelada ('2026-11-26') leída con new Date() es medianoche UTC =
    // 8 PM del día ANTERIOR aquí: el comprobante salía con un día de menos.
    const soloFecha = String(date).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (soloFecha) return `${soloFecha[3]}/${soloFecha[2]}/${soloFecha[1]}`;
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
  // (26/11/2026) Dirección y teléfono van al pie de cada página (pieEmpresa).

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
    margin: { bottom: RESERVA_PIE },   // que la tabla no se meta debajo del pie
    head: [['DESCRIPCION', 'MONTO']],
    body: [[gasto.descripcion || '---', formatCurrency(gasto.monto)]],
    startY: 56,
    theme: 'grid',
    headStyles: { fillColor: [4, 53, 115], textColor: 255 },
    columnStyles: { 1: { halign: 'right' } },
  });

  // Total y firmas juntos y por encima del pie.
  let currentY = espacioPara(doc, doc.lastAutoTable.finalY + 15, 42);

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

  pieEmpresa(doc, empresa);
  openPdf(doc, `Gasto-${numero}.pdf`);
};
