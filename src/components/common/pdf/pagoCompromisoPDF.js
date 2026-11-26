import jsPDF from 'jspdf';
import { openPdf } from './openPdf';
import autoTable from 'jspdf-autotable';
import { formatInTimeZone } from '@/lib/dateUtils';
import { pieEmpresa, RESERVA_PIE, espacioPara } from './pieEmpresa';

const formatCurrency = (value) => {
    return (parseFloat(value) || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
};

const formatDate = (date) => {
    if (!date) return 'N/A';
    try {
        // Una fecha pelada ('2026-11-26') leída con new Date() es medianoche UTC =
        // 8 PM del día ANTERIOR aquí: el comprobante salía con un día de menos.
        const soloFecha = String(date).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (soloFecha) return `${soloFecha[3]}/${soloFecha[2]}/${soloFecha[1]}`;
        return formatInTimeZone(new Date(date), 'dd/MM/yyyy');
    } catch (e) {
        return 'N/A';
    }
};

// Comprobante de pago de un compromiso general (luz, nómina, préstamo, etc.).
// Sigue el mismo estilo que generatePagoSuplidorPDF para mantener consistencia.
export const generatePagoCompromisoPDF = (pago, empresa = {}) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const margin = 14;

    // Número legible basado en la fecha/hora del pago (los compromisos no llevan
    // secuencia propia en BD).
    const numero = pago.numero || formatInTimeZone(new Date(pago.fecha_pago || Date.now()), 'yyyyMMdd-HHmmss');

    // --- Header ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(empresa.nombre || 'Mi Empresa', margin, 20);

    doc.setFontSize(12);
    doc.text("COMPROBANTE DE PAGO", margin, 28);

    // Address/Contact
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    // (26/11/2026) Dirección y teléfono van al pie de cada página (pieEmpresa).

    // Right Header Section
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`NUMERO : ${numero}`, pageWidth - margin, 20, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(`FECHA : ${formatDate(pago.fecha_pago || new Date())}`, pageWidth - margin, 26, { align: 'right' });

    // --- Concepto ---
    doc.setLineWidth(0.5);
    doc.line(margin, 38, pageWidth - margin, 38);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("CONCEPTO:", margin, 48);
    doc.setFont('helvetica', 'normal');
    doc.text((pago.nombre || 'N/A').toUpperCase(), margin + 25, 48);

    if (pago.tipo) {
        doc.setFont('helvetica', 'bold');
        doc.text("TIPO:", margin, 56);
        doc.setFont('helvetica', 'normal');
        doc.text(String(pago.tipo).toUpperCase(), margin + 25, 56);
    }

    // --- Tabla: Detalle del pago ---
    const tableColumn = ["CONCEPTO", "FORMA DE PAGO", "REFERENCIA", "MONTO"];
    const tableRows = [[
        (pago.nombre || 'N/A').toUpperCase(),
        (pago.forma_pago || 'EFECTIVO').toUpperCase(),
        pago.referencia_pago || '---',
        formatCurrency(pago.monto)
    ]];

    autoTable(doc, {
        margin: { bottom: RESERVA_PIE },   // que la tabla no se meta debajo del pie
        head: [tableColumn],
        body: tableRows,
        startY: 66,
        theme: 'grid',
        headStyles: { fillColor: [4, 53, 115], textColor: 255 },
        columnStyles: { 3: { halign: 'right' } }
    });

    // Total y firmas juntos y por encima del pie.
    let currentY = espacioPara(doc, doc.lastAutoTable.finalY + 15, 38);

    // --- Totales ---
    const totalsX = 140;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text("TOTAL PAGADO:", totalsX, currentY);
    doc.text(formatCurrency(pago.monto), pageWidth - margin, currentY, { align: 'right' });

    if (pago.recurrente) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`* Compromiso recurrente (${pago.frecuencia || 'mensual'}). Se renueva al pagarlo.`, margin, currentY);
    }

    // --- Firmas ---
    const signatureY = currentY + 30;
    doc.line(margin, signatureY, margin + 60, signatureY);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text("Entregado por", margin + 18, signatureY + 5);

    doc.line(130, signatureY, 190, signatureY);
    doc.text("Recibido por", 145, signatureY + 5);

    pieEmpresa(doc, empresa);
    openPdf(doc, `PagoCompromiso-${numero}.pdf`);
};
