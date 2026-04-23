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

export const generateTransaccionesReportePDF = (transactions, filters, totals, empresa = {}) => {
    const doc = new jsPDF('portrait');
    const pageWidth = doc.internal.pageSize.width;
    const margin = 10;

    // --- Header ---
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(empresa.nombre || 'Mi Empresa', margin, 15);

    doc.setFontSize(12);
    doc.text("LISTA DE TRANSACCIONES DIARIAS", margin, 22);

    // Filters Info
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const fDesde = formatDate(filters.fechaDesde);
    const fHasta = formatDate(filters.fechaHasta);
    doc.text(`Periodo: ${fDesde} al ${fHasta}`, margin, 28);

    doc.text(`Fecha Impresión: ${formatInTimeZone(new Date(), 'dd/MM/yyyy hh:mm:ss a')}`, pageWidth - margin, 15, { align: 'right' });

    // --- Table ---
    const tableColumn = ["FECHA", "TRANS.", "NCF", "CLIENTE", "NOMBRE", "DESCRIPCION", "DEBITOS", "CREDITOS"];
    const tableRows = transactions.map(t => {
        const codigo = t.cliente_codigo || '';
        const codigoVisible = codigo.length > 13 ? '' : codigo;
        return [
            formatInTimeZone(t.fecha, 'dd/MM/yyyy hh:mm a'),
            t.transaccion,
            t.ncf || '',
            codigoVisible,
            (t.cliente_nombre || '').substring(0, 30),
            (t.descripcion || '').substring(0, 40),
            formatCurrency(t.debito),
            formatCurrency(t.credito)
        ];
    });

    autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 32,
        theme: 'grid',
        styles: { fontSize: 7, font: 'helvetica', cellPadding: 1.5 },
        headStyles: { fillColor: [4, 53, 115], textColor: 255, fontSize: 7 },
        columnStyles: {
            0: { cellWidth: 28 },
            1: { cellWidth: 18 },
            2: { cellWidth: 18 },
            3: { cellWidth: 22 },
            6: { halign: 'right' },
            7: { halign: 'right' }
        },
        margin: { left: margin, right: margin }
    });

    const finalY = doc.lastAutoTable.finalY + 10;

    // --- Totals ---
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(margin, finalY, pageWidth - margin, finalY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text("TOTALES GENERALES:", pageWidth - margin - 80, finalY + 7, { align: 'right' });
    doc.text(formatCurrency(totals.debitos), pageWidth - margin - 35, finalY + 7, { align: 'right' });
    doc.text(formatCurrency(totals.creditos), pageWidth - margin, finalY + 7, { align: 'right' });

    doc.output('dataurlnewwindow', { filename: `ReporteTransacciones-${fDesde}.pdf` });
};
