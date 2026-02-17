import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { generateHeader, formatCurrency, formatDate, PAGE_WIDTH, MARGIN } from './pdfUtils';

export const generateReciboPDF = (recibo, client, abonos, formasPago) => {
    const doc = new jsPDF();
    generateHeader(doc, "RECIBO DE INGRESO", recibo.numero);

    // Client Info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("CLIENTE:", MARGIN, 80);
    doc.setFont('helvetica', 'normal');
    doc.text((client?.nombre || 'CLIENTE GENERICO').toUpperCase(), MARGIN, 86);
    doc.text(client?.direccion || 'N/A', MARGIN, 92);
    doc.text(`Tel: ${client?.telefono || 'N/A'}`, MARGIN, 98);

    // Recibo Info
    doc.setFont('helvetica', 'bold');
    doc.text("FECHA:", 140, 86);
    doc.setFont('helvetica', 'normal');
    doc.text(formatDate(recibo.fecha), 170, 86);

    // Table 1: Abonos a Facturas
    doc.setFont('helvetica', 'bold');
    doc.text("FACTURAS ABONADAS:", MARGIN, 115);

    const abonosColumn = ["Referencia", "Saldo Anterior", "Monto Abono", "Saldo Restante"];
    const abonosRows = abonos.map(a => [
        a.referencia || 'N/A',
        formatCurrency(a.monto_pendiente),
        formatCurrency(a.monto_abono),
        formatCurrency(a.monto_pendiente - a.monto_abono)
    ]);

    autoTable(doc, {
        head: [abonosColumn],
        body: abonosRows,
        startY: 120,
        theme: 'grid',
        headStyles: {
            fillColor: [4, 53, 115], // morla-blue
            textColor: 255,
            fontStyle: 'bold'
        },
        columnStyles: {
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right' }
        }
    });

    // Table 2: Formas de Pago
    const finalY1 = doc.lastAutoTable.finalY + 15;
    doc.setFont('helvetica', 'bold');
    doc.text("DETALLE DE PAGO:", MARGIN, finalY1);

    const pagosColumn = ["Forma de Pago", "Referencia/Banco", "Monto"];
    const pagosRows = formasPago.map(f => [
        f.forma.toUpperCase(),
        f.referencia || '---',
        formatCurrency(f.monto)
    ]);

    autoTable(doc, {
        head: [pagosColumn],
        body: pagosRows,
        startY: finalY1 + 5,
        theme: 'grid',
        headStyles: {
            fillColor: [100, 100, 100],
            textColor: 255,
            fontStyle: 'bold'
        },
        columnStyles: {
            2: { halign: 'right' }
        }
    });

    // Totals & Balance Summary
    const finalY2 = doc.lastAutoTable.finalY + 20;
    const totalsX = 140;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("Balance Anterior:", totalsX, finalY2);
    doc.setFont('helvetica', 'normal');
    doc.text(formatCurrency(recibo.balanceAnterior), 200, finalY2, { align: 'right' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text("TOTAL PAGADO:", totalsX, finalY2 + 15);
    doc.text(formatCurrency(recibo.totalPagado), 200, finalY2 + 15, { align: 'right' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("Balance Actual:", totalsX, finalY2 + 30);
    doc.setFont('helvetica', 'normal');
    doc.text(formatCurrency(recibo.balanceActual), 200, finalY2 + 30, { align: 'right' });

    // Signature lines
    const signatureY = finalY2 + 60;
    doc.line(MARGIN, signatureY, MARGIN + 60, signatureY);
    doc.text("Firma Cliente", MARGIN + 10, signatureY + 5);

    doc.line(130, signatureY, 190, signatureY);
    doc.text("Cajero / Cobrador", 145, signatureY + 5);

    doc.output('dataurlnewwindow', { filename: `Recibo_${recibo.numero || 'N_A'}.pdf` });
};
