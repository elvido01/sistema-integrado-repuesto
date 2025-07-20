import { formatInTimeZone } from '@/lib/dateUtils';

export const ITBIS_RATE = 0.18;
export const PAGE_WIDTH = 595.28; // A4 width in points
export const MARGIN = 40;

export const generateHeader = (doc, title, number, config = {}) => {
  const { logoUrl } = config;

  if (logoUrl) {
    // Custom logo logic can be added here
  }

  doc.setFontSize(20);
  doc.setTextColor(4, 53, 115); // morla-blue
  doc.setFont('helvetica', 'bold');
  doc.text("Repuestos Morla", MARGIN, 50);

  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(title, PAGE_WIDTH - MARGIN, 50, { align: 'right' });
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Nº: ${number || 'N/A'}`, PAGE_WIDTH - MARGIN, 65, { align: 'right' });
  
  doc.setDrawColor(200, 200, 200);
  doc.line(MARGIN, 75, PAGE_WIDTH - MARGIN, 75);
};

export const generateClientInfo = (doc, client, startY = 90) => {
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text("CLIENTE:", MARGIN, startY);
  doc.setFont('helvetica', 'normal');
  doc.text(client?.nombre || '', MARGIN, startY + 12);
  doc.text(`RNC: ${client?.rnc || ''}`, MARGIN, startY + 24);
  doc.text(client?.direccion || '', MARGIN, startY + 36);
  doc.text(`Tel: ${client?.telefono || ''}`, MARGIN, startY + 48);
};

export const generateTotals = (doc, totals, finalY) => {
  const totalsX = PAGE_WIDTH / 2;
  const totalsY = finalY + 20;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');

  if (typeof totals.yOffset !== 'number') {
    totals.yOffset = 0;
  }

  const addTotalRow = (label, value, isBold = false, isLarge = false) => {
    doc.setFontSize(isLarge ? 12 : 10);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.text(label, totalsX, totalsY + totals.yOffset);
    doc.text(value, PAGE_WIDTH - MARGIN, totalsY + totals.yOffset, { align: 'right' });
    totals.yOffset += isLarge ? 20 : 15;
  };

  addTotalRow("Sub-Total:", totals.subtotal.toFixed(2));
  addTotalRow("Descuento:", `(${totals.descuento.toFixed(2)})`);
  addTotalRow("ITBIS:", totals.itbis.toFixed(2));

  doc.setLineWidth(1.5);
  doc.line(totalsX, totalsY + totals.yOffset - 5, PAGE_WIDTH - MARGIN, totalsY + totals.yOffset - 5);

  addTotalRow("TOTAL:", totals.total.toFixed(2), true, true);

  return totalsY + totals.yOffset;
};

export const formatCurrency = (value) => {
    return (parseFloat(value) || 0).toFixed(2);
};

export const formatDate = (date) => {
    return date ? formatInTimeZone(new Date(date), 'dd/MM/yyyy') : 'N/A';
};
