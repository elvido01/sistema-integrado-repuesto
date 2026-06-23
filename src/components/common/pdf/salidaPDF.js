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
        return formatInTimeZone(new Date(date), 'dd/MM/yyyy hh:mm a');
    } catch (e) {
        return 'N/A';
    }
};

export const generateSalidaPDF = (salida, almacen, detalles, empresa = {}) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const margin = 14;

    // --- Header ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(empresa.nombre || 'Mi Empresa', margin, 20);

    doc.setFontSize(12);
    doc.text("COMPROBANTE DE SALIDA / AJUSTE", margin, 28);

    // Address/Contact
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (empresa.direccion) doc.text(empresa.direccion, pageWidth / 2, 12, { align: 'center' });
    if (empresa.telefono) doc.text(empresa.telefono, pageWidth / 2, 17, { align: 'center' });

    // Right Header Section
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`NUMERO : ${String(salida.numero || '').padStart(7, '0')}`, pageWidth - margin, 20, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text(`FECHA : ${formatDate(salida.fecha)}`, pageWidth - margin, 26, { align: 'right' });

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
    doc.text(salida.concepto || 'AJUSTE', margin + 25, 54);

    if (salida.referencia) {
        doc.setFont('helvetica', 'bold');
        doc.text("REF:", margin, 60);
        doc.setFont('helvetica', 'normal');
        doc.text(salida.referencia, margin + 25, 60);
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
        headStyles: { fillColor: [150, 0, 0], textColor: 255 },
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
    doc.text(`COSTO TOTAL: ${formatCurrency(salida.total_costo || 0)}`, pageWidth - margin, currentY, { align: 'right' });

    if (salida.notas) {
        currentY += 10;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        doc.text(`Notas: ${salida.notas}`, margin, currentY);
    }

    const signatureY = currentY + 30;
    doc.line(margin, signatureY, margin + 60, signatureY);
    doc.setFont('helvetica', 'normal');
    doc.text("Autorizado por", margin + 18, signatureY + 5);

    openPdf(doc, `Salida-${salida.numero}.pdf`);
};
