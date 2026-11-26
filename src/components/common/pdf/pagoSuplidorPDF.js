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

    // (26/11/2026) Dirección y teléfono van al PIE de cada página. Arriba se
    // encimaban con el nombre de la empresa y salían repetidos cuando la
    // empresa tiene el mismo texto en los dos campos (Motopréstamos).

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
            // El salto va puesto a proposito: dejado a la columna, partia por
            // donde le tocaba ("US$ 1,146.28 = RD$" / "67,515.89") y el
            // numero en pesos quedaba huerfano en la linea de abajo.
            filaUSD
                ? `US$ ${formatCurrency(d.abonado_usd)}
= RD$ ${formatCurrency(d.monto_abonado)}`
                : formatCurrency(d.monto_abonado)
        ];
    });

    autoTable(doc, {
        margin: { bottom: RESERVA_PIE },   // que la tabla no se meta debajo del pie
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

    // El título y al menos el encabezado de su tabla, juntos y por encima del pie.
    let currentY = espacioPara(doc, doc.lastAutoTable.finalY + 15, 22);

    // --- Table 2: Formas de Pago ---
    doc.setFont('helvetica', 'bold');
    doc.text("FORMAS DE PAGO:", margin, currentY);

    const paymentColumn = ["FORMA", "REFERENCIA/BANCO", "MONTO"];
    const paymentRows = formasPago.map(f => [
        String(f.forma || '').toUpperCase(),
        f.referencia || '---',
        formatCurrency(f.monto)
    ]);

    autoTable(doc, {
        margin: { bottom: RESERVA_PIE },   // que la tabla no se meta debajo del pie
        head: [paymentColumn],
        body: paymentRows,
        startY: currentY + 5,
        theme: 'grid',
        headStyles: { fillColor: [100, 100, 100], textColor: 255 },
        columnStyles: { 2: { halign: 'right' } }
    });

    currentY = doc.lastAutoTable.finalY + 15;

    // --- Totals ---
    // (2026-08-28) "TOTAL PAGADO RD$:" salia montado encima del numero: la
    // etiqueta arrancaba en un x fijo (140) y con un total de siete cifras el
    // valor empezaba antes de que la etiqueta terminara. En un comprobante que
    // se firma, el total ilegible es justo lo que no puede pasar.
    //
    // Se dibuja al reves: primero se mide el valor mas ancho, y las etiquetas
    // se alinean a la DERECHA justo antes de donde empieza la columna de
    // numeros. Asi no hay monto que las alcance.
    const filas = esPagoUSD
        ? [
            ['TOTAL EN US$:', `US$ ${formatCurrency(pago.total_usd)}`, 10],
            ['TASA DEL DIA:', formatCurrency(pago.tasa_cambio), 10],
            ['TOTAL PAGADO RD$:', formatCurrency(pago.total_pagado), 11],
          ]
        : [['TOTAL PAGADO:', formatCurrency(pago.total_pagado), 11]];

    const valorX = pageWidth - margin;
    const anchoValor = Math.max(...filas.map(([, valor, tam]) => {
        doc.setFontSize(tam);
        return doc.getTextWidth(valor);
    }));
    const etiquetaX = valorX - anchoValor - 4;  // 4mm de aire entre las dos

    // (26/11/2026) Los totales (~13 mm) tampoco se salen de la hoja.
    if (currentY + 14 > doc.internal.pageSize.height - RESERVA_PIE) {
        doc.addPage();
        currentY = 30;
    }
    doc.setFont('helvetica', 'bold');
    filas.forEach(([etiqueta, valor, tam], i) => {
        const y = currentY + (i === 2 ? 13 : i * 6);
        doc.setFontSize(tam);
        doc.text(etiqueta, etiquetaX, y, { align: 'right' });
        doc.text(valor, valorX, y, { align: 'right' });
        currentY = y;
    });

    // --- Signatures ---
    let signatureY = currentY + 30;
    // (26/11/2026) Firmas + etiquetas (~6 mm) no pueden caer en el pie ni
    // salirse de la hoja: si no caben, van en una página nueva.
    const altoHoja = doc.internal.pageSize.height;
    if (signatureY + 6 > altoHoja - RESERVA_PIE) {
        doc.addPage();
        signatureY = 40;
    }
    doc.line(margin, signatureY, margin + 60, signatureY);
    doc.setFontSize(9);
    doc.text("Entregado por", margin + 18, signatureY + 5);

    doc.line(130, signatureY, 190, signatureY);
    doc.text("Recibido por (Suplidor)", 140, signatureY + 5);

    // --- Pie de página: dirección y teléfono, sin repetir ---
    pieEmpresa(doc, empresa, margin);

    openPdf(doc, `PagoSuplidor-${pago.numero}.pdf`);
};
