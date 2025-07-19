import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { formatInTimeZone } from '@/lib/dateUtils';
import { formatCurrency } from './pdfUtils';

export const generateFacturaPDF = (factura) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: [226.77, 841.89] // 80mm width, standard receipt height
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  let currentY = 20;

  const detalles = factura.facturas_detalle || [];
  const cliente = factura.clientes || {};
  const vendedor = factura.perfiles || {};

  // --- Header ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text("REPUESTOS MORLA", pageWidth / 2, currentY, { align: 'center' });
  currentY += 12;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text("Av. Duarte, esq. Baldemiro Rijo", pageWidth / 2, currentY, { align: 'center' });
  currentY += 10;
  doc.text("Higuey, Rep. Dom.", pageWidth / 2, currentY, { align: 'center' });
  currentY += 10;
  doc.text("809-390-5965", pageWidth / 2, currentY, { align: 'center' });
  currentY += 15;

  doc.setFontSize(10);
  doc.text("FACTURA", pageWidth / 2, currentY, { align: 'center' });
  currentY += 15;

  // --- Invoice & Client Details ---
  doc.setFontSize(8);
  const col1X = margin;
  const col2X = col1X + 40;

  const addDetailRow = (label, value, valueX) => {
    doc.text(label, col1X, currentY);
    doc.text(value, valueX || col2X, currentY);
    currentY += 10;
  };

  addDetailRow("Numero:", `FT-${String(factura.numero || 'N/A').padStart(7, '0')}`);
  
  const fechaStr = formatInTimeZone(new Date(factura.fecha), 'dd/MM/yyyy');
  const horaStr = formatInTimeZone(new Date(factura.fecha), 'HH:mm');
  doc.text("Fecha:", col1X, currentY);
  doc.text(fechaStr, col2X, currentY);
  doc.text(horaStr, pageWidth - margin, currentY, { align: 'right' });
  currentY += 10;

  addDetailRow("Vence:", factura.forma_pago === 'CREDITO' ? `Crédito ${factura.dias_credito} días` : 'CONTADO');
  currentY += 5;

  if (cliente.rnc) addDetailRow("RNC:", cliente.rnc);
  addDetailRow("Cliente:", cliente.nombre || 'Cliente Genérico');
  if (cliente.direccion) {
    const addressLines = doc.splitTextToSize(cliente.direccion, pageWidth - col2X - margin);
    doc.text("Direccion:", col1X, currentY);
    doc.text(addressLines, col2X, currentY);
    currentY += (addressLines.length * 10);
  }
  if (cliente.telefono) addDetailRow("Tel.:", cliente.telefono);
  
  currentY += 5;
  doc.setLineDashPattern([1, 1], 0);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 10;

  // --- Table ---
  doc.text("Descripcion de la Mercancia", margin, currentY);
  currentY += 10;
  
  const tableHead = [['CANT.', 'PRECIO', 'ITBIS', 'MONTO']];
  const tableBody = [];

  detalles.forEach(item => {
    tableBody.push([{ content: item.descripcion, colSpan: 4, styles: { fontStyle: 'bold' } }]);
    const isExempt = (item.itbis || 0) < 0.01;
    tableBody.push([
      `${item.cantidad} UND`,
      formatCurrency(item.precio),
      formatCurrency(item.itbis),
      `${formatCurrency(item.importe)} ${isExempt ? 'E' : ''}`
    ]);
  });

  doc.autoTable({
    head: tableHead,
    body: tableBody,
    startY: currentY,
    theme: 'plain',
    styles: {
      fontSize: 8,
      cellPadding: 0.5,
    },
    headStyles: {
      halign: 'left',
      fontStyle: 'normal',
    },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
    didParseCell: function (data) {
        if (data.row.index % 2 === 0 && data.section === 'body') { // Description row
            data.cell.styles.halign = 'left';
        }
    }
  });

  currentY = doc.autoTable.previous.finalY + 5;
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 10;

  // --- Totals ---
  const totalsX = pageWidth / 2 - 20;
  const valuesX = pageWidth - margin;

  const addTotalRowFinal = (label, value) => {
    doc.text(label, totalsX, currentY, { align: 'right' });
    doc.text(value, valuesX, currentY, { align: 'right' });
    currentY += 10;
  };

  addTotalRowFinal("Sub-Total:", formatCurrency(factura.subtotal));
  addTotalRowFinal("Descuento en Items:", formatCurrency(factura.descuento));
  addTotalRowFinal("Otros Descuento:", formatCurrency(0));
  addTotalRowFinal("Recargo:", formatCurrency(0));
  addTotalRowFinal("ITBIS:", formatCurrency(factura.itbis));
  
  doc.setFont('helvetica', 'bold');
  doc.text("Valores en", totalsX - 20, currentY);
  doc.text("DOP", totalsX - 20, currentY + 8);
  doc.text("==========", valuesX, currentY, { align: 'right' });
  currentY += 10;
  addTotalRowFinal("TOTAL:", formatCurrency(factura.total));
  doc.setFont('helvetica', 'normal');
  currentY += 10;

  // --- Payment Info ---
  if (factura.forma_pago === 'CONTADO') {
    addTotalRowFinal("PAGADO:", formatCurrency(factura.monto_recibido));
    addTotalRowFinal("CAMBIO:", formatCurrency(factura.cambio));
  }
  currentY += 10;

  // --- Footer ---
  doc.text(`Le Atendio: ${vendedor?.email?.split('@')[0] || 'N/A'}`, margin, currentY);
  currentY += 10;
  doc.text(`Vendedor: ${factura.vendedor || 'REPUESTOS MORLA'}`, margin, currentY);

  // Open PDF in new tab
  doc.output('dataurlnewwindow', { filename: `Factura-FT-${factura.numero}.pdf` });
};