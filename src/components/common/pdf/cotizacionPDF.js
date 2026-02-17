import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { generateHeader, formatCurrency, formatDate } from './pdfUtils';

const CLIENTE_GENERICO_INFO = {
  nombre: 'Cliente Genérico',
  rnc: 'N/A',
  direccion: 'N/A',
  telefono: 'N/A',
};

export const generateCotizacionPDF = (cotizacion, cliente, details) => {
  const doc = new jsPDF();
  generateHeader(doc, "COTIZACIÓN", cotizacion.numero);

  const genericIds = ['00000000-0000-0000-0000-000000000000', '2749fa36-3d7c-4bdf-ad61-df88eda8365a'];
  const isGeneric = !cliente?.id || genericIds.includes(cliente.id) || (cliente.nombre?.toUpperCase().includes('GENERICO'));

  const displayNombre = (isGeneric && cotizacion.manual_cliente_nombre)
    ? cotizacion.manual_cliente_nombre.toUpperCase()
    : (cliente?.nombre || 'CLIENTE GENERICO').toUpperCase();

  const displayCliente = (isGeneric && cotizacion.manual_cliente_nombre)
    ? { ...CLIENTE_GENERICO_INFO, nombre: displayNombre }
    : (cliente?.id ? cliente : CLIENTE_GENERICO_INFO);

  // Client Info
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text("CLIENTE:", 14, 80);
  doc.setFont('helvetica', 'normal');
  doc.text(displayNombre, 14, 86);
  doc.text(`RNC: ${displayCliente.rnc || ''}`, 14, 92);
  doc.text(displayCliente.direccion || '', 14, 98);
  doc.text(`Tel: ${displayCliente.telefono || ''}`, 14, 104);

  // Cotizacion Info
  doc.setFont('helvetica', 'bold');
  doc.text("FECHA COTIZACIÓN:", 140, 86);
  doc.text("VÁLIDA HASTA:", 140, 92);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDate(cotizacion.fecha_cotizacion), 185, 86);
  doc.text(formatDate(cotizacion.fecha_vencimiento), 185, 92);

  // Table
  const tableColumn = ["Código", "Descripción", "Cant.", "Precio U.", "Desc. %", "Importe"];
  const tableRows = [];

  details.forEach(item => {
    const itemData = [
      item.codigo,
      item.descripcion,
      formatCurrency(item.cantidad),
      formatCurrency(item.precio_unitario),
      formatCurrency(item.descuento_pct),
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
      fillColor: [251, 191, 36], // amber-400
      textColor: 0,
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
  doc.text(formatCurrency(cotizacion.subtotal), 200, totalsY, { align: 'right' });
  doc.text(formatCurrency(cotizacion.descuento_total), 200, totalsY + 15, { align: 'right' });
  doc.text(formatCurrency(cotizacion.itbis_total), 200, totalsY + 30, { align: 'right' });
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(formatCurrency(cotizacion.total_cotizacion), 200, totalsY + 47, { align: 'right' });

  // Notes
  if (cotizacion.notas) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("Notas:", 14, totalsY);
    doc.setFont('helvetica', 'normal');
    const splitNotes = doc.splitTextToSize(cotizacion.notas, 120);
    doc.text(splitNotes, 14, totalsY + 15);
  }

  doc.save(`Cotizacion_${cotizacion.numero || 'N_A'}.pdf`);
};