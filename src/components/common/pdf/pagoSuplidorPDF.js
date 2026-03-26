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

export const generatePagoSuplidorPDF = (pago, suplidor, detalles, formasPago) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const margin = 14;

    // --- Header ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text("MotoFlow", margin, 20);

    doc.setFontSize(12);
    doc.text("COMPROBANTE DE PAGO A SUPLIDOR", margin, 28);

    // Address/Contact
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text("Av. Duarte, esq. Baldemiro Rijo", pageWidth / 2, 12, { align: 'center' });
    doc.text("Higuey, Rep. Dom.", pageWidth / 2, 17, { align: 'center' });
    doc.text("809-390-5965", pageWidth / 2, 22, { align: 'center' });

    // Right Header Section
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`NUMERO : ${String(pago.numero || '').padStart(7, '0')}`, pageWidth - margin, 20, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(`FECHA : ${formatDate(pago.fecha)}`, pageWidth - margin, 26, { align: 'right' });

    // --- Supplier Info ---
    doc.setLineWidth(0.5);
    doc.line(margin, 38, pageWidth - margin, 38);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("SUPLIDOR:", margin, 48);
    doc.setFont('helvetica', 'normal');
    doc.text((suplidor || 'N/A').toUpperCase(), margin + 25, 48);

    // --- Table 1: Compras Abonadas ---
    doc.setFont('helvetica', 'bold');
    doc.text("DETALLE DE FACTURAS ABONADAS:", margin, 65);

    const tableColumn = ["FECHA", "REFERENCIA", "MONTO PENDIENTE", "MONTO ABONADO"];
    const tableRows = detalles.map(d => [
        formatDate(d.fecha_emision),
        d.referencia || 'N/A',
        formatCurrency(d.monto_pendiente),
        formatCurrency(d.monto_abonado)
    ]);

    autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 70,
        theme: 'grid',
        headStyles: { fillColor: [4, 53, 115], textColor: 255 },
        columnStyles: {
            2: { halign: 'right' },
            3: { halign: 'right' }
        }
    });

    let currentY = doc.lastAutoTable.finalY + 15;

    // --- Table 2: Formas de Pago ---
    doc.setFont('helvetica', 'bold');
    doc.text("FORMAS DE PAGO:", margin, currentY);

    const paymentColumn = ["FORMA", "REFERENCIA/BANCO", "MONTO"];
    const paymentRows = formasPago.map(f => [
        f.forma.toUpperCase(),
        f.referencia || '---',
        formatCurrency(f.monto)
    ]);

    autoTable(doc, {
        head: [paymentColumn],
        body: paymentRows,
        startY: currentY + 5,
        theme: 'grid',
        headStyles: { fillColor: [100, 100, 100], textColor: 255 },
        columnStyles: { 2: { halign: 'right' } }
    });

    currentY = doc.lastAutoTable.finalY + 15;

    // --- Totals ---
    const totalsX = 140;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text("TOTAL PAGADO:", totalsX, currentY);
    doc.text(formatCurrency(pago.total_pagado), pageWidth - margin, currentY, { align: 'right' });

    // --- Signatures ---
    const signatureY = currentY + 30;
    doc.line(margin, signatureY, margin + 60, signatureY);
    doc.setFontSize(9);
    doc.text("Entregado por", margin + 18, signatureY + 5);

    doc.line(130, signatureY, 190, signatureY);
    doc.text("Recibido por (Suplidor)", 140, signatureY + 5);

    doc.output('dataurlnewwindow', { filename: `PagoSuplidor-${pago.numero}.pdf` });
};
