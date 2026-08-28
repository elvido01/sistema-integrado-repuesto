// Cotización Magna en PDF, para mandársela a Magna por donde sea.
//
// (2026-08-28) El módulo ya imprimía (F6), pero imprimir no es compartir:
// para mandarle la cotización a Magna había que imprimirla en papel y sacarle
// una foto, o "imprimir a PDF" desde el diálogo del navegador y buscar dónde
// lo dejó Windows.
//
// >>> ES EL MISMO DOCUMENTO QUE SE IMPRIME <<<
// Mismo encabezado, mismos datos de Magna, mismo orden de columnas que
// printCotizacionMagnaLetter. Si el papel y el PDF dicen cosas distintas,
// alguien va a cobrar por uno y cuadrar por el otro.

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { openPdf } from './openPdf';
import { formatInTimeZone } from '@/lib/dateUtils';

const fmt = (v) => (parseFloat(v) || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

// Los datos de Magna son fijos: este módulo existe solo para ellos, y son
// los mismos que ya salen impresos.
const MAGNA = {
  nombre: 'Magna Motors S.A',
  direccion: 'Av. J.K. Kennedy Esq. Abraham Lincoln, edificio magna',
  rnc: '101055571',
  telefono: '809-544-1500',
};

const EMISOR = {
  nombre: 'ELVIDO MANUEL CAMINERO MORLA',
  rnc: '028-0099156-0',
};

export const generateCotizacionMagnaPDF = (cotizacion, lines = []) => {
  const doc = new jsPDF();                       // A4 vertical
  const ancho = doc.internal.pageSize.width;
  const margen = 14;
  const numero = `MAG-${String(cotizacion?.numero || 'N/A').padStart(7, '0')}`;
  const facturada = String(cotizacion?.estado || '').toLowerCase() === 'facturada';

  const fecha = cotizacion?.fecha
    ? formatInTimeZone(new Date(`${String(cotizacion.fecha).slice(0, 10)}T00:00:00`), 'dd/MM/yyyy')
    : '';

  // ── Quién emite ────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(EMISOR.nombre, ancho / 2, 18, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`RNC: ${EMISOR.rnc}`, ancho / 2, 23.5, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('COTIZACIÓN', ancho / 2, 31, { align: 'center' });

  doc.setDrawColor(190);
  doc.setLineWidth(0.4);
  doc.line(margen, 35, ancho - margen, 35);

  // ── A quién va ─────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Cliente: ${MAGNA.nombre}`, margen, 42);
  doc.setFont('helvetica', 'normal');
  doc.text(MAGNA.direccion, margen, 47);
  doc.text(`RNC: ${MAGNA.rnc}   |   Tel: ${MAGNA.telefono}`, margen, 52);

  doc.setFont('helvetica', 'bold');
  doc.text(`Número: ${numero}`, ancho - margen, 42, { align: 'right' });
  doc.text(`Fecha: ${fecha}`, ancho - margen, 47, { align: 'right' });
  // El estado va en el papel: una cotización ya facturada que circula sin
  // decirlo se vuelve a cobrar.
  doc.setTextColor(facturada ? 21 : 180, facturada ? 128 : 120, facturada ? 61 : 0);
  doc.text(facturada ? 'FACTURADA' : 'PENDIENTE', ancho - margen, 52, { align: 'right' });
  doc.setTextColor(0);

  // ── El detalle ─────────────────────────────────────────────────
  const filas = lines.map((l) => [
    l.numero_orden || '',
    l.chasis || '',
    fmt(l.valor_repuestos),
    fmt(l.valor_mano_obra),
    fmt((parseFloat(l.valor_repuestos) || 0) + (parseFloat(l.valor_mano_obra) || 0)),
  ]);

  autoTable(doc, {
    startY: 58,
    head: [['No. Orden', 'Chasis', 'Repuestos', 'Mano de Obra', 'Importe']],
    body: filas,
    theme: 'grid',
    margin: { left: margen, right: margen },
    styles: { fontSize: 8.5, cellPadding: 2, lineColor: [210, 210, 210], textColor: [20, 20, 20] },
    headStyles: { fillColor: [14, 27, 51], textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: [246, 248, 251] },
    columnStyles: {
      0: { cellWidth: 24 },
      // El chasis en monoespaciada: 17 caracteres alfanuméricos donde hay que
      // poder distinguir el 0 de la O de un vistazo, que es lo que Magna
      // coteja contra su sistema.
      1: { cellWidth: 52, font: 'courier' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right', fontStyle: 'bold' },
    },
  });

  // ── Los totales ────────────────────────────────────────────────
  const subtotal = parseFloat(cotizacion?.subtotal) || 0;
  const itbis = parseFloat(cotizacion?.itbis) || 0;
  const total = parseFloat(cotizacion?.total) || 0;
  const totalRepuestos = lines.reduce((s, l) => s + (parseFloat(l.valor_repuestos) || 0), 0);
  const totalManoObra = lines.reduce((s, l) => s + (parseFloat(l.valor_mano_obra) || 0), 0);

  let y = (doc.lastAutoTable?.finalY || 58) + 8;
  const izq = ancho - margen - 70;

  const fila = (etiqueta, valor, { fuerte = false, grande = false } = {}) => {
    // Si los totales no caben, hoja nueva: partir un total por la mitad es
    // la clase de detalle que hace que Magna devuelva el documento.
    if (y > doc.internal.pageSize.height - 20) {
      doc.addPage();
      y = 20;
    }
    doc.setFont('helvetica', fuerte ? 'bold' : 'normal');
    doc.setFontSize(grande ? 11 : 9);
    doc.text(etiqueta, izq, y);
    doc.text(valor, ancho - margen, y, { align: 'right' });
    y += grande ? 7 : 5.5;
  };

  fila('Total Repuestos:', `RD$ ${fmt(totalRepuestos)}`);
  fila('Total Mano de Obra:', `RD$ ${fmt(totalManoObra)}`);
  fila('Subtotal:', `RD$ ${fmt(subtotal)}`);
  fila('ITBIS (18%):', `RD$ ${fmt(itbis)}`);

  doc.setDrawColor(14, 27, 51);
  doc.setLineWidth(0.6);
  doc.line(izq, y - 3, ancho - margen, y - 3);
  y += 2;
  fila('TOTAL:', `RD$ ${fmt(total)}`, { fuerte: true, grande: true });

  if (cotizacion?.notas) {
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Notas:', margen, y);
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(String(cotizacion.notas), ancho - margen * 2), margen, y + 5);
  }

  // ── Pie, en todas las hojas ────────────────────────────────────
  const hojas = doc.internal.getNumberOfPages();
  for (let i = 1; i <= hojas; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    doc.text(
      `${lines.length} línea(s)  ·  Generado ${formatInTimeZone(new Date(), 'dd/MM/yyyy hh:mm a')}`,
      margen, doc.internal.pageSize.height - 8,
    );
    doc.text(`Página ${i} de ${hojas}`, ancho - margen, doc.internal.pageSize.height - 8, { align: 'right' });
    doc.setTextColor(0);
  }

  openPdf(doc, `Cotizacion_Magna_${numero}.pdf`);
};
