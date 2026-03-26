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
        return formatInTimeZone(new Date(date), 'dd/MM/yyyy hh:mm a');
    } catch (e) {
        return 'N/A';
    }
};

export const generateEntradaPDF = (entrada, almacen, detalles) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const margin = 14;

    // --- Header ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text("MotoFlow", margin, 20);

    doc.setFontSize(12);
    doc.text("COMPROBANTE DE ENTRADA / AJUSTE", margin, 28);

    // Address/Contact
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text("Av. Duarte, esq. Baldemiro Rijo", pageWidth / 2, 12, { align: 'center' });
    doc.text("Higuey, Rep. Dom.", pageWidth / 2, 17, { align: 'center' });

    // Right Header Section
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`NUMERO : ${String(entrada.numero || '').padStart(7, '0')}`, pageWidth - margin, 20, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(`FECHA : ${formatDate(entrada.fecha)}`, pageWidth - margin, 26, { align: 'right' });

    // --- Info Section ---
    doc.setLineWidth(0.5);
    doc.line(margin, 38, pageWidth - margin, 38);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("ALMACEN:", margin, 48);
    doc.setFont('helvetica', 'normal');
    const almacenNombre = typeof almacen === 'object' ? (almacen.nombre || 'N/A') : (almacen || 'N/A');
    doc.text(almacenNombre.toUpperCase(), margin + 25, 48);

    doc.setFont('helvetica', 'bold');
    doc.text("CONCEPTO:", margin, 54);
    doc.setFont('helvetica', 'normal');
    doc.text(entrada.concepto || 'AJUSTE', margin + 25, 54);

    if (entrada.referencia) {
        doc.setFont('helvetica', 'bold');
        doc.text("REF:", margin, 60);
        doc.setFont('helvetica', 'normal');
        doc.text(entrada.referencia, margin + 25, 60);
    }

    // --- Table: Items ---
    const tableColumn = ["CODIGO", "DESCRIPCION", "CANT.", "UND", "COSTO U.", "IMPORTE"];
    const tableRows = detalles.map(d => [
        d.codigo,
        (d.descripcion || '').toUpperCase(),
        d.cantidad,
        d.unidad || 'UND',
        formatCurrency(d.costo_unitario),
        formatCurrency(d.importe)
    ]);

    autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 70,
        theme: 'grid',
        headStyles: { fillColor: [0, 100, 0], textColor: 255 },
        columnStyles: {
            2: { halign: 'center' },
            4: { halign: 'right' },
            5: { halign: 'right' }
        }
    });

    let currentY = doc.lastAutoTable.finalY + 15;

    // --- Summary & Signature ---
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL ITEMS: ${detalles.reduce((sum, d) => sum + Number(d.cantidad), 0)}`, margin, currentY);
    doc.text(`VALOR TOTAL: ${formatCurrency(entrada.total_costo || 0)}`, pageWidth - margin, currentY, { align: 'right' });

    if (entrada.notas) {
        currentY += 10;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.text(`Notas: ${entrada.notas}`, margin, currentY);
    }

    const signatureY = currentY + 30;
    doc.line(margin, signatureY, margin + 60, signatureY);
    doc.setFont('helvetica', 'normal');
    doc.text("Entregado por", margin + 18, signatureY + 5);

    doc.line(130, signatureY, 190, signatureY);
    doc.text("Recibido por (Almacén)", 140, signatureY + 5);

    doc.output('dataurlnewwindow', { filename: `Entrada-${entrada.numero}.pdf` });
};
