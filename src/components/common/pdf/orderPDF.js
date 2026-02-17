import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatDate } from './pdfUtils';

export const generateOrderPDF = (order, supplier, details) => {
  const doc = new jsPDF();
  const PAGE_WIDTH = doc.internal.pageSize.getWidth();
  const MARGIN = 14;

  // --- HEADER SECTION ---
  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(0, 0, 0);
  doc.text("REPUESTOS MORLA", MARGIN, 20);

  doc.setFontSize(10);
  doc.setFont('times', 'normal');
  doc.text("Av. Duarte, esq. Baldemiro Rijo", MARGIN, 25);
  doc.text("Higuey, Rep. Dom.", MARGIN, 30);
  doc.text("Tel. 809-390-5965, Fax", MARGIN, 35);
  doc.text("RNC:", MARGIN, 40);

  // Document Title & Number (Right Aligned)
  doc.setFont('times', 'bold');
  doc.setFontSize(24);
  doc.text("ORDEN DE COMPRA", PAGE_WIDTH - MARGIN, 20, { align: 'right' });

  doc.setFontSize(12);
  doc.text(`Numero : ${order.numero || 'N/A'}`, PAGE_WIDTH - MARGIN, 30, { align: 'right' });

  // Date and Contact Rows
  doc.setFontSize(11);
  doc.text("Fecha", PAGE_WIDTH - 65, 48);
  doc.setFont('times', 'bold');
  const dateStr = formatDate(order.fecha_orden);
  doc.text(dateStr, PAGE_WIDTH - MARGIN, 48, { align: 'right' });
  doc.line(PAGE_WIDTH - 50, 50, PAGE_WIDTH - MARGIN, 50); // Underline for date

  doc.setFont('times', 'normal');
  doc.text("Contacto", PAGE_WIDTH - 85, 62);
  doc.setFont('times', 'bold');
  // Moving supplier phone to Contacto as requested
  doc.text(`${supplier.telefono || ''}`, PAGE_WIDTH - MARGIN, 62, { align: 'right' });
  doc.line(PAGE_WIDTH - 65, 64, PAGE_WIDTH - MARGIN, 64); // Underline for contact placeholder

  // --- SUPPLIER INFO BOX ---
  const boxY = 48;
  const boxWidth = 100; // Smaller as requested
  const boxHeight = 35; // Reduced height since phone moved

  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.roundedRect(MARGIN, boxY, boxWidth, boxHeight, 5, 5, 'D');

  const boxX = MARGIN + 4;
  let currentY = boxY + 8;
  const lineSpacing = 8; // Slightly more space

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  // RNC
  doc.setFont('times', 'normal');
  doc.text(`RNC :`, boxX, currentY);
  doc.setFont('times', 'bold');
  doc.text(`${supplier.rnc || ''}`, boxX + 22, currentY);
  doc.line(boxX + 22, currentY + 1, boxX + boxWidth - 8, currentY + 1);
  currentY += lineSpacing;

  // Nombre
  doc.setFont('times', 'normal');
  doc.text(`Nombre`, boxX, currentY);
  doc.setFont('times', 'bold');
  doc.text(`${(supplier.nombre || '').toUpperCase()}`, boxX + 22, currentY);
  doc.line(boxX + 22, currentY + 1, boxX + boxWidth - 8, currentY + 1);
  currentY += lineSpacing;

  // Direccion
  doc.setFont('times', 'normal');
  doc.text(`Direccion`, boxX, currentY);
  doc.setFont('times', 'bold');
  const dir = (supplier.direccion || '').toUpperCase();
  const splitDir = doc.splitTextToSize(dir, boxWidth - 30);
  doc.text(splitDir[0] || '', boxX + 22, currentY);
  doc.line(boxX + 22, currentY + 1, boxX + boxWidth - 8, currentY + 1);
  // User asked to remove one line, so we only draw one line for address
  // currentY += lineSpacing; // This line is removed as per the instruction to reduce box height and remove phone

  // --- ITEMS TABLE ---
  const tableColumn = ["CANTIDAD", "REFERENCIA", "DESCRIPCION", "PRECIO UNITARIO", "Desc.", "ITBIS", "TOTAL"];
  const tableRows = details.map(item => [
    `${item.cantidad} UND`,
    item.codigo || '',
    (item.descripcion || '').toUpperCase(),
    formatCurrency(item.precio),
    formatCurrency((item.descuento_pct / 100) * item.precio * item.cantidad),
    formatCurrency((item.itbis_pct / 100) * (item.precio * item.cantidad * (1 - item.descuento_pct / 100))),
    formatCurrency(item.importe)
  ]);

  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: 88, // Shifted up
    theme: 'plain', // Clean look without row grids
    styles: {
      font: 'times',
      fontSize: 9,
      cellPadding: 2,
      textColor: [0, 0, 0], // Solid black text
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      lineWidth: 0.1,
      lineColor: [0, 0, 0],
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center' }, // CANTIDAD
      1: { halign: 'left' },   // REFERENCIA
      2: { halign: 'left' },   // DESCRIPCION
      3: { halign: 'right' },  // PRECIO
      4: { halign: 'right' },  // Desc
      5: { halign: 'right' },  // ITBIS
      6: { halign: 'right' },  // TOTAL
    }
  });

  // --- FOOTER SECTION ---
  const finalY = doc.lastAutoTable.finalY + 10;

  // Signature line
  doc.line(MARGIN, finalY + 30, MARGIN + 80, finalY + 30);
  doc.setFont('times', 'italic');
  doc.setFontSize(10);
  doc.text("Autorizado por", MARGIN + 40, finalY + 35, { align: 'center' });

  // Totals Box (Right Side)
  const totalsX = PAGE_WIDTH - 85;
  const totalsWidth = 71;
  const totalsHeight = 50;

  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.rect(totalsX, finalY, totalsWidth, totalsHeight, 'D');

  doc.setFont('times', 'normal');
  doc.setFontSize(10);

  let totalY = finalY + 8;
  const totalRowSpacing = 9;

  const drawTotalRow = (label, value, isBold = false) => {
    doc.setFont('times', isBold ? 'bold' : 'normal');
    if (isBold) doc.setFontSize(11); else doc.setFontSize(10);
    doc.text(label, totalsX + 40, totalY, { align: 'right' });
    doc.text(value, PAGE_WIDTH - MARGIN - 2, totalY, { align: 'right' });
    totalY += totalRowSpacing;
  };

  drawTotalRow("Total Exento", formatCurrency(order.total_exento || 0));
  drawTotalRow("Total Gravado", formatCurrency(order.total_gravado || 0));
  drawTotalRow("Descuento", formatCurrency(order.descuento_total || 0));
  drawTotalRow("ITBIS", formatCurrency(order.itbis_total || 0));

  doc.setLineWidth(0.2);
  doc.line(totalsX + 5, totalY - 4, PAGE_WIDTH - MARGIN - 2, totalY - 4);

  drawTotalRow("Total de la Orden", formatCurrency(order.total_orden || 0), true);

  doc.save(`Orden_Compra_${order.numero || 'N_A'}.pdf`);
};