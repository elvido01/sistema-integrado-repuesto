import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { generateHeader, formatCurrency, formatDate } from './pdfUtils';

export const generatePedidoPDF = (pedido, cliente, vendedor, details) => {
  const doc = new jsPDF();
  generateHeader(doc, "PEDIDO / PRE-FACTURA", pedido.numero);

  // Client Info
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text("CLIENTE:", 14, 80);
  doc.setFont('helvetica', 'normal');

  const genericIds = ['00000000-0000-0000-0000-000000000000', '2749fa36-3d7c-4bdf-ad61-df88eda8365a'];
  const isGeneric = !cliente || !cliente.id || genericIds.includes(cliente.id) || (cliente.nombre?.toUpperCase().includes('GENERICO'));

  const displayNombre = (isGeneric && pedido.manual_cliente_nombre)
    ? pedido.manual_cliente_nombre.toUpperCase()
    : (cliente?.nombre || 'CLIENTE GENERICO').toUpperCase();

  doc.text(displayNombre, 14, 86);

  doc.text(`RNC: ${cliente?.rnc || ''}`, 14, 92);
  doc.text(cliente?.direccion || '', 14, 98);
  doc.text(`Tel: ${cliente?.telefono || ''}`, 14, 104);

  // Pedido Info
  doc.setFont('helvetica', 'bold');
  doc.text("FECHA PEDIDO:", 140, 86);
  doc.text("VENDEDOR:", 140, 92);
  doc.text("ESTADO:", 140, 98);

  doc.setFont('helvetica', 'normal');
  doc.text(formatDate(pedido.fecha), 175, 86);
  doc.text(vendedor?.nombre || 'N/A', 175, 92);
  doc.setFont('helvetica', 'bold');
  doc.text(pedido.estado || 'Pendiente', 175, 98);
  doc.setFont('helvetica', 'normal');

  // Table
  const tableColumn = ["Código", "Descripción", "Cant.", "Unidad", "Precio", "Desc.", "ITBIS", "Importe"];
  const tableRows = [];

  details.forEach(item => {
    const itemData = [
      item.codigo,
      item.descripcion,
      formatCurrency(item.cantidad),
      item.unidad,
      formatCurrency(item.precio),
      formatCurrency(item.descuento),
      formatCurrency(item.itbis),
      formatCurrency(item.importe),
    ];
    tableRows.push(itemData);
  });

  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: 115,
    theme: 'grid',
    headStyles: {
      fillColor: [4, 53, 115], // morla-blue
      textColor: 255,
      fontStyle: 'bold'
    }
  });

  // Totals
  const finalY = doc.lastAutoTable.finalY;
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
  doc.text(formatCurrency(pedido.subtotal), 200, totalsY, { align: 'right' });
  doc.text(formatCurrency(pedido.descuento_total), 200, totalsY + 15, { align: 'right' });
  doc.text(formatCurrency(pedido.itbis_total), 200, totalsY + 30, { align: 'right' });
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(pedido.monto_total), 200, totalsY + 47, { align: 'right' });

  // Notes
  if (pedido.notas) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("Notas:", 14, totalsY);
    doc.setFont('helvetica', 'normal');
    const splitNotes = doc.splitTextToSize(pedido.notas, 120);
    doc.text(splitNotes, 14, totalsY + 15);
  }

  doc.save(`Pedido_${pedido.numero || 'N_A'}.pdf`);
};