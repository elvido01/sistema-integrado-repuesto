import jsPDF from 'jspdf';
import { openPdf } from './openPdf';
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

export const generatePagoSuplidorPDF = (pago, suplidor, detalles, formasPago, empresa = {}) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const margin = 14;

    // --- Header ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(empresa.nombre || 'Mi Empresa', margin, 20);

    doc.setFontSize(12);
    doc.text("COMPROBANTE DE PAGO A SUPLIDOR", margin, 28);

    // Address/Contact
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (empresa.direccion) doc.text(empresa.direccion, pageWidth / 2, 12, { align: 'center' });
    if (empresa.telefono) doc.text(empresa.telefono, pageWidth / 2, 17, { align: 'center' });

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

    // Pago en dólares: cada factura US$ muestra su abono en dólares y su
    // equivalente en pesos a la tasa del día
    const esPagoUSD = Number(pago.tasa_cambio) > 0 && Number(pago.total_usd) > 0;

    const tableColumn = ["FECHA", "REFERENCIA", "MONTO PENDIENTE", "MONTO ABONADO"];
    const tableRows = detalles.map(d => {
        const filaUSD = Number(d.abonado_usd) > 0;
        return [
            formatDate(d.fecha_emision),
            d.referencia || 'N/A',
            filaUSD ? `US$ ${formatCurrency(d.pendiente_usd)}` : formatCurrency(d.monto_pendiente),
            filaUSD ? `US$ ${formatCurrency(d.abonado_usd)} = RD$ ${formatCurrency(d.monto_abonado)}` : formatCurrency(d.monto_abonado)
        ];
    });

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
    if (esPagoUSD) {
        doc.setFontSize(10);
        doc.text("TOTAL EN US$:", totalsX, currentY);
        doc.text(`US$ ${formatCurrency(pago.total_usd)}`, pageWidth - margin, currentY, { align: 'right' });
        currentY += 6;
        doc.text("TASA DEL DIA:", totalsX, currentY);
        doc.text(formatCurrency(pago.tasa_cambio), pageWidth - margin, currentY, { align: 'right' });
        currentY += 7;
        doc.setFontSize(11);
        doc.text("TOTAL PAGADO RD$:", totalsX, currentY);
        doc.text(formatCurrency(pago.total_pagado), pageWidth - margin, currentY, { align: 'right' });
    } else {
        doc.text("TOTAL PAGADO:", totalsX, currentY);
        doc.text(formatCurrency(pago.total_pagado), pageWidth - margin, currentY, { align: 'right' });
    }

    // --- Signatures ---
    const signatureY = currentY + 30;
    doc.line(margin, signatureY, margin + 60, signatureY);
    doc.setFontSize(9);
    doc.text("Entregado por", margin + 18, signatureY + 5);

    doc.line(130, signatureY, 190, signatureY);
    doc.text("Recibido por (Suplidor)", 140, signatureY + 5);

    openPdf(doc, `PagoSuplidor-${pago.numero}.pdf`);
};
