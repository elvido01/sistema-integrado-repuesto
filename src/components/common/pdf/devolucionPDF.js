import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { generateHeader, formatCurrency, formatDate } from './pdfUtils';

export const generateDevolucionPDF = (devolucion, factura, cliente, details) => {
  const doc = new jsPDF();
  generateHeader(doc, "COMPROBANTE DE DEVOLUCIÓN", devolucion.numero);

  // Client Info
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text("CLIENTE:", 14, 80);
  doc.setFont('helvetica', 'normal');
  doc.text(cliente.nombre || '', 14, 86);
  doc.text(`RNC: ${cliente.rnc || ''}`, 14, 92);
  doc.text(cliente.direccion || '', 14, 98);
  doc.text(`Tel: ${cliente.telefono || ''}`, 14, 104);

  // Devolucion Info
  doc.setFont('helvetica', 'bold');
  doc.text("FECHA DEVOLUCIÓN:", 140, 86);
  doc.text("FACTURA ORIGINAL:", 140, 92);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDate(devolucion.fecha_devolucion), 185, 86);
  doc.text(`${factura.numero}`, 185, 92);

  // Table
  const tableColumn = ["Código", "Descripción", "Cant. Devuelta", "Precio", "Descuento", "ITBIS", "Importe"];
  const tableRows = [];

  details.forEach(item => {
    const importe = (item.precio * item.cantidad) - (item.descuento) + (item.itbis);
    const itemData = [
      item.codigo,
      item.descripcion,
      formatCurrency(item.cantidad),
      formatCurrency(item.precio),
      formatCurrency(item.descuento),
      formatCurrency(item.itbis),
      formatCurrency(importe),
    ];
    tableRows.push(itemData);
  });

  doc.autoTable({
    head: [tableColumn],
    body: tableRows,
    startY: 115,
    theme: 'grid',
    headStyles: {
      fillColor: [220, 53, 69], // destructive color
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
  doc.text("TOTAL DEVUELTO:", totalsX, totalsY + 47);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(formatCurrency(devolucion.subtotal), 200, totalsY, { align: 'right' });
  doc.text(formatCurrency(devolucion.descuento_total), 200, totalsY + 15, { align: 'right' });
  doc.text(formatCurrency(devolucion.itbis_total), 200, totalsY + 30, { align: 'right' });
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(devolucion.total_devolucion), 200, totalsY + 47, { align: 'right' });

  // Notes
  if(devolucion.notas) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("Notas:", 14, totalsY);
    doc.setFont('helvetica', 'normal');
    const splitNotes = doc.splitTextToSize(devolucion.notas, 120);
    doc.text(splitNotes, 14, totalsY + 15);
  }

  doc.save(`Devolucion_${devolucion.numero || 'N_A'}.pdf`);
};