import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { generateHeader, formatCurrency, formatDate } from './pdfUtils';

export const generateOrderPDF = (order, supplier, details) => {
  const doc = new jsPDF();
  generateHeader(doc, "ORDEN DE COMPRA", order.numero);

  // Supplier Info
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text("PROVEEDOR:", 14, 80);
  doc.setFont('helvetica', 'normal');
  doc.text(supplier.nombre || '', 14, 86);
  doc.text(`RNC: ${supplier.rnc || ''}`, 14, 92);
  doc.text(supplier.direccion || '', 14, 98);
  doc.text(`Tel: ${supplier.telefono || ''}`, 14, 104);

  // Order Info
  doc.setFont('helvetica', 'bold');
  doc.text("FECHA ORDEN:", 140, 86);
  doc.text("FECHA VENCE:", 140, 92);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDate(order.fecha_orden), 170, 86);
  doc.text(formatDate(order.fecha_vencimiento), 170, 92);

  // Table
  const tableColumn = ["Código", "Descripción", "Cant.", "Unidad", "Precio", "ITBIS%", "Importe"];
  const tableRows = [];

  details.forEach(item => {
    const itemData = [
      item.codigo,
      item.descripcion,
      formatCurrency(item.cantidad),
      item.unidad,
      formatCurrency(item.precio),
      formatCurrency(item.itbis_pct),
      formatCurrency(item.importe),
    ];
    tableRows.push(itemData);
  });

  doc.autoTable({
    head: [tableColumn],
    body: tableRows,
    startY: 115,
    theme: 'grid',
    headStyles: {
      fillColor: [22, 163, 74], // green-600
      textColor: 255,
      fontStyle: 'bold'
    }
  });

  // Totals
  const finalY = doc.autoTable.previous.finalY;
  const totalsX = 140;
  const totalsY = finalY + 20;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  
  doc.text("Sub-Total:", totalsX, totalsY);
  doc.text("Descuento:", totalsX, totalsY + 15);
  doc.text("ITBIS:", totalsX, totalsY + 30);
  doc.setFontSize(12);
  doc.text("TOTAL:", totalsX, totalsY + 47);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(formatCurrency(order.total_gravado + order.total_exento), 200, totalsY, { align: 'right' });
  doc.text(formatCurrency(order.descuento_total), 200, totalsY + 15, { align: 'right' });
  doc.text(formatCurrency(order.itbis_total), 200, totalsY + 30, { align: 'right' });
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(order.total_orden), 200, totalsY + 47, { align: 'right' });

  // Notes
  if(order.notas) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("Notas:", 14, totalsY);
    doc.setFont('helvetica', 'normal');
    const splitNotes = doc.splitTextToSize(order.notas, 120);
    doc.text(splitNotes, 14, totalsY + 15);
  }

  doc.save(`Orden_Compra_${order.numero || 'N_A'}.pdf`);
};