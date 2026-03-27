import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatInTimeZone } from '@/lib/dateUtils';
import { formatCurrency } from './pdfUtils';

export const generateFacturaPDF = (factura, empresa = {}) => {
  // Papel térmico de 80mm (3.15 pulgadas) = ~226.77pt
  const pageWidth = 226;
  const marginLeft = 8;
  const marginRight = 35;
  const contentWidth = pageWidth - marginLeft - marginRight;

  const renderContent = (doc) => {
    let currentY = 15;

    const detalles = factura.facturas_detalle || [];
    const cliente = factura.clientes || {};
    const vendedor = factura.perfiles || {};

    // --- Header ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(empresa.nombre || 'Mi Empresa', pageWidth / 2, currentY, { align: 'center' });
    currentY += 12;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (empresa.direccion) {
      doc.text(empresa.direccion, pageWidth / 2, currentY, { align: 'center' });
      currentY += 10;
    }
    if (empresa.telefono) {
      doc.text(empresa.telefono, pageWidth / 2, currentY, { align: 'center' });
      currentY += 10;
    }
    if (empresa.rnc) {
      doc.text(`RNC: ${empresa.rnc}`, pageWidth / 2, currentY, { align: 'center' });
      currentY += 10;
    }
    currentY += 3;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text("FACTURA", pageWidth / 2, currentY, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    currentY += 13;

    // --- Invoice & Client Details (same order as POS) ---
    const labelX = marginLeft;
    const valueX = marginLeft + 42;
    const rightX = pageWidth - marginRight;

    doc.setFontSize(10);

    // Line 1: Numero + Hora (same line)
    doc.text("Numero :", labelX, currentY);
    const numeroStr = `FT-${String(factura.numero || 'N/A').padStart(7, '0')}`;
    doc.text(numeroStr, valueX, currentY);
    const horaStr = formatInTimeZone(new Date(factura.fecha), 'hh:mm a');
    doc.text(horaStr, rightX, currentY, { align: 'right' });
    currentY += 12;

    // Fecha
    const fechaStr = formatInTimeZone(new Date(factura.fecha), 'd/L/yyyy');
    doc.text("Fecha :", labelX, currentY);
    doc.text(fechaStr, valueX, currentY);
    currentY += 12;

    // Vence
    doc.text("Vence :", labelX, currentY);
    doc.setFont('helvetica', 'bold');
    doc.text(factura.forma_pago === 'CREDITO' ? `Crédito ${factura.dias_credito} días` : 'CONTADO', valueX, currentY);
    doc.setFont('helvetica', 'normal');
    currentY += 12;

    // Cliente
    const genericIds = ['00000000-0000-0000-0000-000000000000', '2749fa36-3d7c-4bdf-ad61-df88eda8365a'];
    const isGeneric = !cliente.id || genericIds.includes(cliente.id) || (cliente.nombre?.toUpperCase().includes('GENERICO'));
    doc.setFont('helvetica', 'bold');
    doc.text("Cliente :", labelX, currentY);
    const displayNombre = (isGeneric && factura.manual_cliente_nombre)
      ? factura.manual_cliente_nombre.toUpperCase()
      : (cliente.nombre || 'CLIENTE GENERICO').toUpperCase();
    doc.text(displayNombre, valueX, currentY);
    doc.setFont('helvetica', 'normal');
    currentY += 12;

    // Direccion
    doc.text("Direccion :", labelX, currentY);
    const direccionStr = cliente.direccion || 'N/A';
    const addressLines = doc.splitTextToSize(direccionStr, contentWidth - 42);
    doc.text(addressLines, valueX, currentY);
    currentY += (addressLines.length * 11);
    currentY += 1;

    // Tel
    doc.text("Tel. :", labelX, currentY);
    doc.text(cliente.telefono || 'N/A', valueX, currentY);
    currentY += 12;

    // --- Separator ---
    doc.setLineDashPattern([2, 2], 0);
    doc.line(marginLeft, currentY, rightX, currentY);
    currentY += 10;

    // --- Table ---
    doc.setFontSize(10);
    doc.text("Descripcion de la Mercancia", marginLeft, currentY);
    currentY += 11;

    const tableHead = [['CANT.', 'PRECIO', 'ITBIS', 'MONTO']];
    const tableBody = [];

    detalles.forEach(item => {
      // Line 1: Description (full width)
      tableBody.push([{
        content: (item.descripcion || '').toUpperCase(),
        colSpan: 4,
        styles: { fontStyle: 'bold', halign: 'left', cellPadding: { top: 4, bottom: 1, left: 0, right: 0 } }
      }]);

      // Line 2: Stats
      const isExempt = (item.itbis || 0) < 0.01;
      tableBody.push([
        { content: `${item.cantidad} UND`, styles: { halign: 'left', cellPadding: { top: 1, bottom: 1, left: 0, right: 0 } } },
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
        fontSize: 10,
        cellPadding: { top: 1, bottom: 1, left: 0, right: 0 },
        overflow: 'linebreak',
        font: 'helvetica'
      },
      headStyles: {
        fontStyle: 'normal',
        cellPadding: { bottom: 3, top: 1 }
      },
      columnStyles: {
        0: { cellWidth: 30, halign: 'left' },
        1: { cellWidth: 42, halign: 'right' },
        2: { cellWidth: 42, halign: 'right' },
        3: { cellWidth: 69, halign: 'right' }
      },
      margin: { left: marginLeft, right: marginRight },
      didDrawPage: function (data) {
        const tableStart = data.settings.startY;
        doc.setLineDashPattern([2, 2], 0);
        doc.line(marginLeft, tableStart - 4, rightX, tableStart - 4);
        doc.line(marginLeft, tableStart + 11, rightX, tableStart + 11);
      }
    });

    currentY = doc.lastAutoTable.finalY + 6;
    doc.setLineDashPattern([2, 2], 0);
    doc.line(marginLeft, currentY, rightX, currentY);
    currentY += 10;

    // --- Totals (same layout as POS) ---
    doc.setFontSize(10);

    const totValuesX = rightX;
    const totLabelsX = totValuesX - 50;

    const addTotalRow = (label, value, isBold = false, fontSize = 10) => {
      doc.setFontSize(fontSize);
      if (isBold) doc.setFont('helvetica', 'bold');
      else doc.setFont('helvetica', 'normal');
      doc.text(label, totLabelsX, currentY, { align: 'right' });
      doc.text(value, totValuesX, currentY, { align: 'right' });
      currentY += (fontSize > 11 ? 14 : 12);
    };

    // Sub-Total row
    addTotalRow("Sub-Total :", formatCurrency(factura.subtotal));
    addTotalRow("Descuento en Items :", formatCurrency(factura.descuento));
    addTotalRow("Otros Descuento :", formatCurrency(0));
    addTotalRow("Recargo :", formatCurrency(0));

    // "Valores en DOP" label on the left (like POS)
    const valoresY = currentY;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text("Valores en", marginLeft + 2, valoresY);
    doc.text("DOP", marginLeft + 5, valoresY + 11);
    doc.setFont('helvetica', 'normal');

    // ITBIS
    addTotalRow("ITBIS :", formatCurrency(factura.itbis));

    // Separator ==========
    doc.setFontSize(10);
    doc.text("==========", totValuesX, currentY, { align: 'right' });
    currentY += 8;

    // TOTAL
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text("TOTAL :", totLabelsX, currentY, { align: 'right' });
    doc.text(formatCurrency(factura.total), totValuesX, currentY, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    currentY += 14;

    // --- Separator ---
    doc.setLineDashPattern([2, 2], 0);
    doc.line(marginLeft, currentY, rightX, currentY);
    currentY += 10;

    // --- Payment Info ---
    doc.setFontSize(10);
    if (factura.forma_pago === 'CONTADO') {
      doc.setFont('helvetica', 'bold');
      doc.text("PAGADO:", totLabelsX, currentY, { align: 'right' });
      doc.text(formatCurrency(factura.monto_recibido), totValuesX, currentY, { align: 'right' });
      currentY += 10;
      doc.text("CAMBIO:", totLabelsX, currentY, { align: 'right' });
      doc.text(formatCurrency(factura.cambio), totValuesX, currentY, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      currentY += 12;
    }

    // --- Separator ---
    doc.setLineDashPattern([2, 2], 0);
    doc.line(marginLeft, currentY, rightX, currentY);
    currentY += 10;

    // --- Footer ---
    doc.setFontSize(10);
    doc.text(`Le Atendio : ${vendedor?.email?.split('@')[0] || 'N/A'}`, marginLeft, currentY);
    currentY += 11;
    doc.text(`Vendedor : ${factura.vendedor || empresa.nombre || 'N/A'}`, marginLeft, currentY);
    currentY += 14;
    doc.setFontSize(10);
    doc.text("*** GRACIAS POR SU COMPRA ***", pageWidth / 2, currentY, { align: 'center' });
    currentY += 15;

    return currentY;
  };

  // First pass to calculate height
  const tempDoc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: [pageWidth, 3000]
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
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const pdfWindow = window.open('', '_blank');
  if (pdfWindow) {
    pdfWindow.document.write(`
      <html>
        <head>
          <title>Factura-FT-${factura.numero}</title>
          <style>body { margin: 0; padding: 0; overflow: hidden; }</style>
        </head>
        <body>
          <embed src="${url}#toolbar=1&navpanes=0&scrollbar=1" type="application/pdf" width="100%" height="100%" />
        </body>
      </html>
    `);
    pdfWindow.document.close();
  } else {
    window.open(url, '_blank');
  }
};
