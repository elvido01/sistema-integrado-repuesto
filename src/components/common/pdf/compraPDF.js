import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatInTimeZone } from '@/lib/dateUtils';

const formatCurrency = (value) => {
    return (parseFloat(value) || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

const formatDate = (date) => {
    if (!date) return 'N/A';
    try {
        return formatInTimeZone(new Date(date), 'dd/MM/yyyy');
    } catch (e) {
        return 'N/A';
    }
};

export const generateCompraPDF = (compra, suplidor, detalles, usuario) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const margin = 14;

    // --- Header ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text("REPUESTOS MORLA", margin, 20);

    doc.setFontSize(12);
    doc.text("COMPRA DE MERCANCIAS", margin, 28);

    // Address/Contact (Mirroring other Morla PDFs)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text("Av. Duarte, esq. Baldemiro Rijo", pageWidth / 2, 12, { align: 'center' });
    doc.text("Higuey, Rep. Dom.", pageWidth / 2, 17, { align: 'center' });
    doc.text("809-390-5965", pageWidth / 2, 22, { align: 'center' });

    // Right Header Section
    doc.setFontSize(9);
    doc.text(`Pagina : ${doc.internal.getNumberOfPages()}`, pageWidth - margin, 12, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`Numero : ${String(compra.numero || '').padStart(7, '0')}`, pageWidth - margin, 20, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.text(`REFERENCIA : ${compra.referencia || ''}`, pageWidth - margin, 26, { align: 'right' });
    doc.text(`NCF : ${compra.ncf || ''}`, pageWidth - margin, 32, { align: 'right' });

    // --- Supplier & Dates Section ---
    doc.setLineWidth(0.5);
    doc.line(margin, 38, pageWidth - margin, 38);

    let currentY = 45;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("Suplidor :", margin, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(suplidor?.rnc || 'N/A', margin + 20, currentY);

    doc.setFont('helvetica', 'bold');
    doc.text("Fecha :", 140, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(formatDate(compra.fecha), 155, currentY);

    currentY += 6;
    doc.setFont('helvetica', 'bold');
    doc.text("Nombre :", margin, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text((suplidor?.nombre || 'N/A').toUpperCase(), margin + 20, currentY);

    doc.setFont('helvetica', 'bold');
    doc.text("Vence :", 140, currentY);
    doc.setFont('helvetica', 'normal');
    // Calculate vence based on dias_credito if needed, or use a field if available
    const venceDate = new Date(compra.fecha);
    if (compra.dias_credito) {
        venceDate.setDate(venceDate.getDate() + parseInt(compra.dias_credito));
    }
    doc.text(formatDate(venceDate), 155, currentY);

    currentY += 10;

    // --- Table ---
    const tableColumn = ["CODIGO", "DESCRIPCION", "CANT.", "UND", "PRECIO/U", "DESC.", "ITBIS", "TOTAL"];
    const tableRows = detalles.map(item => [
        item.codigo,
        (item.descripcion || '').toUpperCase(),
        item.cantidad,
        item.unidad || 'UND',
        formatCurrency(item.costo_unitario),
        `${(item.descuento_pct || 0).toFixed(2)}%`,
        formatCurrency(item.importe - (item.importe / (1 + (item.itbis_pct || 0.18)))), // ITBIS amount
        formatCurrency(item.importe)
    ]);

    autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: currentY,
        theme: 'plain',
        styles: {
            fontSize: 8,
            cellPadding: 2,
            font: 'helvetica'
        },
        headStyles: {
            fontStyle: 'bold',
            textColor: 0,
            fillColor: 255,
            lineWidth: 0.1,
            lineColor: 150
        },
        columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 'auto' },
            2: { halign: 'center', cellWidth: 15 },
            3: { halign: 'center', cellWidth: 15 },
            4: { halign: 'right', cellWidth: 25 },
            5: { halign: 'right', cellWidth: 15 },
            6: { halign: 'right', cellWidth: 20 },
            7: { halign: 'right', cellWidth: 25 },
        },
        margin: { left: margin, right: margin },
        didDrawPage: (data) => {
            // Line below header rows
            doc.setLineWidth(0.1);
            doc.line(margin, data.settings.startY + 7, pageWidth - margin, data.settings.startY + 7);
        }
    });

    let finalY = doc.lastAutoTable.finalY + 10;

    // --- Footer Section ---
    // Left side: Signature
    doc.setFontSize(9);
    doc.line(margin, finalY + 20, margin + 60, finalY + 20);
    doc.text("Realizada por", margin + 15, finalY + 25);

    // Right side: Totals Box
    const boxWidth = 70;
    const boxX = pageWidth - margin - boxWidth;
    const boxStartY = finalY;

    // Rounded rectangle for totals
    doc.setDrawColor(150);
    doc.setLineWidth(0.2);
    doc.roundedRect(boxX, boxStartY, boxWidth + 5, 45, 3, 3);

    const addTotalLine = (label, value, yOffset, isBold = false) => {
        doc.setFont('helvetica', isBold ? 'bold' : 'normal');
        doc.text(`${label}:`, boxX + 5, boxStartY + yOffset);
        doc.text(value, pageWidth - margin - 2, boxStartY + yOffset, { align: 'right' });
    };

    addTotalLine("Total Exento", formatCurrency(compra.total_exento), 10);
    addTotalLine("Total Gravado", formatCurrency(compra.total_gravado), 17);
    addTotalLine("Descuento", formatCurrency(compra.descuento_total), 24);
    addTotalLine("ITBIS", formatCurrency(compra.itbis_total), 31);

    doc.setLineWidth(0.1);
    doc.line(boxX + 2, boxStartY + 35, boxX + boxWidth + 3, boxStartY + 35);

    addTotalLine("Total de la Compra", formatCurrency(compra.total_compra), 40, true);

    // Open PDF
    doc.output('dataurlnewwindow', { filename: `Compra-${compra.numero}.pdf` });
};
