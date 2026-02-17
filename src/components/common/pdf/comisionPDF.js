import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { generateHeader, formatCurrency, formatDate, PAGE_WIDTH, MARGIN } from './pdfUtils';

export const generateComisionPDF = (comisiones, filters) => {
    const doc = new jsPDF();

    // Header
    generateHeader(doc, "REPORTE DE COMISIONES", "");

    // Report Info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("VENDEDOR:", MARGIN, 80);
    doc.setFont('helvetica', 'normal');
    doc.text(filters.vendedorName || 'N/A', MARGIN + 25, 80);

    doc.setFont('helvetica', 'bold');
    doc.text("PERÍODO:", MARGIN, 88);
    doc.setFont('helvetica', 'normal');
    doc.text(`${formatDate(filters.fechaDesde)} al ${formatDate(filters.fechaHasta)}`, MARGIN + 25, 88);

    doc.setFont('helvetica', 'bold');
    doc.text("TIPO:", MARGIN, 96);
    doc.setFont('helvetica', 'normal');
    const tipoLabel = filters.tipoReporte === 'ventas' ? 'COMISIONES POR VENTAS' : 'COMISIONES POR COBROS';
    const filtroLabel = filters.filtroPago === 'todas' ? 'TODAS' : (filters.filtroPago === 'credito' ? 'CRÉDITO' : 'CONTADO');
    doc.text(`${tipoLabel} (${filtroLabel})`, MARGIN + 25, 96);

    // Table - Summary Only
    const tableColumn = ["Fecha", "Factura", "Cliente", "Nombre Vendedor", "Monto", "Impuestos", "%", "A Pagar"];

    const totalMonto = comisiones.reduce((acc, curr) => acc + (curr.monto_factura || 0), 0);
    const totalImpuestos = comisiones.reduce((acc, curr) => acc + (curr.monto_itbis || 0), 0);
    const totalAPagar = comisiones.reduce((acc, curr) => acc + (curr.valor_comision || 0), 0);

    const tableRows = [
        [
            "", // Fecha
            "", // Factura
            "", // Cliente
            filters.vendedorName,
            formatCurrency(totalMonto),
            formatCurrency(totalImpuestos),
            "", // %
            formatCurrency(totalAPagar)
        ]
    ];

    autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 110,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: {
            fillColor: [10, 30, 58], // morla-blue (0a1e3a)
            textColor: 255,
            fontStyle: 'bold'
        },
        columnStyles: {
            4: { halign: 'right' },
            5: { halign: 'right' },
            6: { halign: 'center' },
            7: { halign: 'right' }
        }
    });

    // Totals Section
    const finalY = doc.lastAutoTable.finalY;
    const totalsX = 130;
    const totalsY = finalY + 15;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');

    doc.text("TOTALES -->", MARGIN, totalsY);

    doc.text("Monto Total:", totalsX, totalsY);
    doc.setFont('helvetica', 'normal');
    doc.text(formatCurrency(totalMonto), PAGE_WIDTH - MARGIN, totalsY, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.text("Impuestos:", totalsX, totalsY + 10);
    doc.setFont('helvetica', 'normal');
    doc.text(formatCurrency(totalImpuestos), PAGE_WIDTH - MARGIN, totalsY + 10, { align: 'right' });

    doc.setDrawColor(0);
    doc.line(totalsX, totalsY + 15, PAGE_WIDTH - MARGIN, totalsY + 15);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text("A PAGAR:", totalsX, totalsY + 25);
    doc.text(formatCurrency(totalAPagar), PAGE_WIDTH - MARGIN, totalsY + 25, { align: 'right' });

    doc.save(`Comisiones_${filters.vendedorName.replace(/\s+/g, '_')}_${formatDate(filters.fechaHasta).replace(/\//g, '-')}.pdf`);
};
