import { formatInTimeZone } from '@/lib/dateUtils';
import { getEmpresaPrintConfig } from '@/lib/printPOS';

export const ITBIS_RATE = 0.18;
export const PAGE_WIDTH = 595.28; // A4 width in points
export const MARGIN = 40;

// >>> LA CABECERA DICE DE QUIÉN ES EL DOCUMENTO (29/09/2026) <<<
// Decía "MotoFlow" fijo: un pedido de Repuestos Morla salía con el nombre del
// sistema, no el de la empresa. Ahora sale la empresa activa (la misma que
// usan los tickets, cargada en MainLayout con setEmpresaPrintConfig).
//
// Y medía en PUNTOS (PAGE_WIDTH 595, margen 40) sobre documentos creados con
// `new jsPDF()`, que miden en MILÍMETROS (A4 = 210). El título y el número se
// imprimían fuera del papel, y el nombre empezaba a 4 cm del borde. Aquí se
// mide el papel del propio documento, sea cual sea su unidad.
export const generateHeader = (doc, title, number, config = {}) => {
  const ancho = doc.internal.pageSize.getWidth();
  const mm = doc.internal.scaleFactor ? 72 / 25.4 / doc.internal.scaleFactor : 1; // 1 mm en unidades del doc
  const margen = 14 * mm;

  const empresa = getEmpresaPrintConfig();
  const nombre = (config.nombre || (empresa.nombre !== 'Sistema' ? empresa.nombre : '') || 'MotoFlow').trim();
  const datos = [empresa.rnc && `RNC: ${empresa.rnc}`, empresa.telefono && `Tel: ${empresa.telefono}`]
    .filter(Boolean).join('   ');

  // El nombre ocupa como mucho la mitad izquierda, para no pisar el título.
  doc.setFontSize(16);
  doc.setTextColor(37, 99, 235);
  doc.setFont('helvetica', 'bold');
  const lineas = doc.splitTextToSize(nombre, ancho / 2 - margen).slice(0, 2);
  doc.text(lineas, margen, 45);
  if (datos) {
    doc.setFontSize(9);
    doc.setTextColor(90, 90, 90);
    doc.setFont('helvetica', 'normal');
    doc.text(datos, margen, 45 + 7 * lineas.length);
  }

  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(title, ancho - margen, 50, { align: 'right' });
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Nº: ${number || 'N/A'}`, ancho - margen, 65, { align: 'right' });

  doc.setDrawColor(200, 200, 200);
  doc.line(margen, 75, ancho - margen, 75);
};

export const generateClientInfo = (doc, client, startY = 90) => {
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text("CLIENTE:", MARGIN, startY);
  doc.setFont('helvetica', 'normal');
  doc.text(client?.nombre || '', MARGIN, startY + 12);
  doc.text(`RNC: ${client?.rnc || ''}`, MARGIN, startY + 24);
  doc.text(client?.direccion || '', MARGIN, startY + 36);
  doc.text(`Tel: ${client?.telefono || ''}`, MARGIN, startY + 48);
};

export const generateTotals = (doc, totals, finalY) => {
  const totalsX = PAGE_WIDTH / 2;
  const totalsY = finalY + 20;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');

  if (typeof totals.yOffset !== 'number') {
    totals.yOffset = 0;
  }

  const addTotalRow = (label, value, isBold = false, isLarge = false) => {
    doc.setFontSize(isLarge ? 12 : 10);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.text(label, totalsX, totalsY + totals.yOffset);
    doc.text(value, PAGE_WIDTH - MARGIN, totalsY + totals.yOffset, { align: 'right' });
    totals.yOffset += isLarge ? 20 : 15;
  };

  addTotalRow("Sub-Total:", totals.subtotal.toFixed(2));
  addTotalRow("Descuento:", `(${totals.descuento.toFixed(2)})`);
  addTotalRow("ITBIS:", totals.itbis.toFixed(2));

  doc.setLineWidth(1.5);
  doc.line(totalsX, totalsY + totals.yOffset - 5, PAGE_WIDTH - MARGIN, totalsY + totals.yOffset - 5);

  addTotalRow("TOTAL:", totals.total.toFixed(2), true, true);

  return totalsY + totals.yOffset;
};

export const formatCurrency = (value) => {
    return (parseFloat(value) || 0).toFixed(2);
};

export const formatDate = (date) => {
    return date ? formatInTimeZone(new Date(date), 'dd/MM/yyyy') : 'N/A';
};
