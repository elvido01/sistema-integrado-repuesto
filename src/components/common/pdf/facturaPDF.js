import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatInTimeZone } from '@/lib/dateUtils';
import { formatCurrency } from './pdfUtils';

export const generateFacturaPDF = (factura) => {
  const pageWidth = 226.77; // 80mm
  const margin = 10;
  const col1X = margin;
  const col2X = col1X + 40;

  const renderContent = (doc) => {
    let currentY = 20;

    const detalles = factura.facturas_detalle || [];
    const cliente = factura.clientes || {};
    const vendedor = factura.perfiles || {};

    // --- Header ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text("REPUESTOS MORLA", pageWidth / 2, currentY, { align: 'center' });
    currentY += 14;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text("Av. Duarte, esq. Baldemiro Rijo", pageWidth / 2, currentY, { align: 'center' });
    currentY += 11;
    doc.text("Higuey, Rep. Dom.", pageWidth / 2, currentY, { align: 'center' });
    currentY += 11;
    doc.text("809-390-5965", pageWidth / 2, currentY, { align: 'center' });
    currentY += 18;

    doc.setFontSize(10);
    doc.text("FACTURA", pageWidth / 2, currentY, { align: 'center' });
    currentY += 18;

    // --- Invoice & Client Details ---
    doc.setFontSize(9);

    // Line 1: Numero and Time
    doc.text("Numero :", col1X, currentY);
    const numeroStr = `FT-${String(factura.numero || 'N/A').padStart(7, '0')}`;
    doc.text(numeroStr, col2X, currentY);

    const horaStr = formatInTimeZone(new Date(factura.fecha), 'HH:mm');
    doc.text(horaStr, pageWidth - margin, currentY, { align: 'right' });
    currentY += 11;

    // Line 1.5: Client Name
    const genericIds = ['00000000-0000-0000-0000-000000000000', '2749fa36-3d7c-4bdf-ad61-df88eda8365a'];
    const isGeneric = !cliente.id || genericIds.includes(cliente.id) || (cliente.nombre?.toUpperCase().includes('GENERICO'));

    doc.setFont('helvetica', 'bold');
    doc.text("Cliente :", col1X, currentY);
    const displayNombre = (isGeneric && factura.manual_cliente_nombre)
      ? factura.manual_cliente_nombre.toUpperCase()
      : (cliente.nombre || 'CLIENTE GENERICO').toUpperCase();
    doc.text(displayNombre, col2X, currentY);
    doc.setFont('helvetica', 'normal');
    currentY += 11;

    // Line 2: Fecha
    const fechaStr = formatInTimeZone(new Date(factura.fecha), 'd/L/yyyy');
    doc.text("Fecha :", col1X, currentY);
    doc.text(fechaStr, col2X, currentY);
    currentY += 11;

    // Line 3: Vence
    doc.text("Vence :", col1X, currentY);
    doc.setFont('helvetica', 'bold');
    doc.text(factura.forma_pago === 'CREDITO' ? `Crédito ${factura.dias_credito} días` : 'CONTADO', col2X, currentY);
    doc.setFont('helvetica', 'normal');
    currentY += 15;

    // Client Info
    doc.text("Direccion :", col1X, currentY);
    if (cliente.direccion) {
      const addressLines = doc.splitTextToSize(cliente.direccion, pageWidth - col2X - margin);
      doc.text(addressLines, col2X, currentY);
      currentY += (addressLines.length * 11);
    } else {
      currentY += 11;
    }

    doc.text("Tel. :", col1X, currentY);
    if (cliente.telefono) {
      doc.text(cliente.telefono, col2X, currentY);
    }
    currentY += 10;

    // Separator before table
    doc.setLineDashPattern([2, 2], 0);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 12;

    // --- Table ---
    doc.setFontSize(9);
    doc.text("Descripcion de la Mercancia", margin, currentY);
    currentY += 10;

    const tableHead = [['CANT.', 'PRECIO', 'ITBIS', 'MONTO']];
    const tableBody = [];

    detalles.forEach(item => {
      // Line 1: Description in Upper Case and Bold
      tableBody.push([{
        content: (item.descripcion || '').toUpperCase(),
        colSpan: 4,
        styles: { fontStyle: 'bold', halign: 'left', cellPadding: { top: 5, bottom: 1, left: 0, right: 0 } }
      }]);

      // Line 2: Stats
      const isExempt = (item.itbis || 0) < 0.01;
      tableBody.push([
        { content: `${item.cantidad} UND`, styles: { halign: 'left', cellPadding: { top: 1, bottom: 2, left: 0, right: 0 } } },
        { content: formatCurrency(item.precio), styles: { halign: 'right' } },
        { content: formatCurrency(item.itbis), styles: { halign: 'right' } },
        { content: `${formatCurrency(item.importe)}${isExempt ? ' E' : ''}`, styles: { halign: 'right' } }
      ]);
    });

    autoTable(doc, {
      head: tableHead,
      body: tableBody,
      startY: currentY,
      theme: 'plain',
      styles: {
        fontSize: 9,
        cellPadding: 0,
        overflow: 'linebreak',
        font: 'helvetica'
      },
      headStyles: {
        halign: 'left',
        fontStyle: 'normal',
        cellPadding: { bottom: 5, top: 2 }
      },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' }
      },
      margin: { left: margin, right: margin },
      didDrawPage: function (data) {
        // Draw dashed lines for header
        const tableStart = data.settings.startY;
        doc.setLineDashPattern([2, 2], 0);
        doc.line(margin, tableStart - 8, pageWidth - margin, tableStart - 8);
        doc.line(margin, tableStart + 12, pageWidth - margin, tableStart + 12);
      }
    });

    currentY = doc.lastAutoTable.finalY + 10;
    doc.setLineDashPattern([2, 2], 0);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 15;

    // --- Totals ---
    const valuesX = pageWidth - margin;
    const labelsX = valuesX - 60;

    const addTotalRow = (label, value, isBold = false) => {
      if (isBold) doc.setFont('helvetica', 'bold');
      doc.text(label, labelsX, currentY, { align: 'right' });
      doc.text(value, valuesX, currentY, { align: 'right' });
      if (isBold) doc.setFont('helvetica', 'normal');
      currentY += 11;
    };

    // Label on the left
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text("Valores en", margin + 10, currentY);
    doc.text("DOP", margin + 15, currentY + 10);
    doc.setFont('helvetica', 'normal');

    addTotalRow("Sub-Total :", formatCurrency(factura.subtotal));
    addTotalRow("Descuento en Items :", formatCurrency(factura.descuento));
    addTotalRow("Otros Descuento :", formatCurrency(0));
    addTotalRow("Recargo :", formatCurrency(0));
    addTotalRow("ITBIS :", formatCurrency(factura.itbis));

    doc.text("==========", valuesX, currentY, { align: 'right' });
    currentY += 10;

    doc.setFontSize(10);
    addTotalRow("TOTAL :", formatCurrency(factura.total), true);
    doc.setFontSize(9);
    currentY += 10;

    // Separator before payments
    doc.setLineDashPattern([2, 2], 0);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 15;

    // --- Payment Info ---
    if (factura.forma_pago === 'CONTADO') {
      addTotalRow("PAGADO :", formatCurrency(factura.monto_recibido));
      addTotalRow("CAMBIO :", formatCurrency(factura.cambio));
    }
    currentY += 15;

    // --- Footer ---
    doc.setFontSize(8);
    doc.text(`Le Atendio: ${vendedor?.email?.split('@')[0] || 'N/A'}`, margin, currentY);
    currentY += 10;
    doc.text(`Vendedor: ${factura.vendedor || 'REPUESTOS MORLA'}`, margin, currentY);
    currentY += 20; // Bottom margin

    return currentY;
  };

  // First pass to calculate height
  const tempDoc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: [pageWidth, 3000] // Long temporary paper
  });
  const finalHeight = renderContent(tempDoc);

  // Second pass with exact height
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: [pageWidth, finalHeight]
  });
  renderContent(doc);

  // Open PDF in new tab
  doc.output('dataurlnewwindow', { filename: `Factura-FT-${factura.numero}.pdf` });
};