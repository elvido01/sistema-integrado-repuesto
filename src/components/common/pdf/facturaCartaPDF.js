// facturaCartaPDF.js — La factura en HOJA CARTA (8.5 x 11) como PDF de verdad.
//
// El generador que existía (facturaPDF.js) produce el ticket térmico de 80mm:
// sirve para el mostrador, no para mandarle una factura a una empresa. Y la
// hoja carta solo existía como HTML que abría el diálogo de impresión — no
// dejaba un archivo que se pueda adjuntar a un correo o a WhatsApp.
//
// Este arma el PDF con el mismo contenido fiscal que la hoja impresa:
// el tipo de comprobante en el título, el NCF en su recuadro, y el emisor
// con la razón social cuando difiere del nombre comercial.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatInTimeZone } from '@/lib/dateUtils';

const money = (v) => new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(Number(v) || 0);

// El título tiene que decir QUÉ comprobante es. El tipo se lee del propio
// NCF (B01... -> 01): una de crédito fiscal titulada "Factura de Consumo"
// no le sirve al comprador para deducir.
const TITULOS_NCF = {
  '01': 'FACTURA DE CRÉDITO FISCAL',
  '02': 'FACTURA DE CONSUMO',
  '03': 'NOTA DE DÉBITO',
  '04': 'NOTA DE CRÉDITO',
  '11': 'COMPROBANTE DE COMPRAS',
  '14': 'COMPROBANTE GUBERNAMENTAL',
  '15': 'COMPROBANTE PARA EXPORTACIONES',
};

export const tituloComprobante = (factura) => {
  const tipo = String(factura?.ncf || '').length >= 3
    ? String(factura.ncf).substring(1, 3)
    : (factura?.tipo_ncf || '');
  return TITULOS_NCF[tipo] || 'FACTURA';
};

/**
 * @param {object} factura  con facturas_detalle y clientes
 * @param {object} empresa  config_empresa
 * @param {'abrir'|'descargar'} accion  abrir en pestaña o bajar el archivo
 */
export const generateFacturaCartaPDF = (factura, empresa = {}, accion = 'abrir') => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const M = 15;                       // margen
  const R = W - M;                    // borde derecho
  let y = 16;

  const detalles = factura.facturas_detalle || [];
  const cliente = factura.clientes || {};

  // ---------- EMISOR ----------
  // Manda el nombre con el que se autorizó el NCF; ese es el que la DGII
  // espera ver, no necesariamente el rótulo del local.
  const emisor = factura.nombre_emisor_ncf || empresa.nombre || 'Mi Empresa';
  const razon = String(empresa.razon_social || '').trim();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(String(emisor).toUpperCase(), W / 2, y, { align: 'center' });
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  // Quien responde ante la DGII. Solo si difiere: repetirlo no aporta.
  if (razon && razon.toUpperCase() !== String(emisor).trim().toUpperCase()) {
    doc.text(razon, W / 2, y, { align: 'center' });
    y += 4.5;
  }
  [empresa.direccion, empresa.ciudad, empresa.telefono ? `Tel: ${empresa.telefono}` : null]
    .filter(Boolean)
    .forEach((linea) => {
      doc.text(String(linea), W / 2, y, { align: 'center' });
      y += 4.5;
    });
  if (empresa.rnc) {
    doc.setFont('helvetica', 'bold');
    doc.text(`RNC: ${empresa.rnc}`, W / 2, y, { align: 'center' });
    y += 4.5;
  }

  y += 3;
  doc.setLineWidth(0.5);
  doc.line(M, y, R, y);
  y += 7;

  // ---------- TÍTULO + NCF ----------
  const numeroStr = `FT-${String(factura.numero || 'N/A').padStart(7, '0')}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(tituloComprobante(factura), M, y);
  doc.setFontSize(10);
  doc.text(`Nº ${numeroStr}`, R, y, { align: 'right' });
  y += 6;

  if (factura.ncf) {
    // Recuadro: es lo primero que busca quien recibe la factura.
    const h = 9;
    doc.setLineWidth(0.6);
    doc.rect(M, y, R - M, h);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('NCF', M + 4, y + 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(String(factura.ncf), M + 16, y + 6.3);
    y += h + 6;
  }

  // ---------- CLIENTE ----------
  const genericIds = ['00000000-0000-0000-0000-000000000000', '2749fa36-3d7c-4bdf-ad61-df88eda8365a'];
  const isGeneric = !cliente.id || genericIds.includes(cliente.id)
    || (cliente.nombre || '').toUpperCase().includes('GENERICO');
  const clienteNombre = (isGeneric && factura.manual_cliente_nombre)
    ? factura.manual_cliente_nombre.toUpperCase()
    : (cliente.nombre || 'CLIENTE GENERICO').toUpperCase();
  const rncCliente = cliente.rnc && cliente.rnc !== '000000000' ? cliente.rnc : 'N/A';

  const fila = (etiqueta, valor, x1, x2) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(etiqueta, x1, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(valor || 'N/A'), x2, y);
  };

  const medio = M + (R - M) / 2;
  fila('Nombre/Razón Social:', clienteNombre, M, M + 36);
  fila('Fecha:', formatInTimeZone(new Date(factura.fecha), 'd/L/yyyy'), medio + 10, medio + 25);
  y += 5;
  fila('RNC:', rncCliente, M, M + 36);
  fila('Condición:', factura.forma_pago === 'CREDITO'
    ? `Crédito ${factura.dias_credito || 0} días` : 'Contado', medio + 10, medio + 25);
  y += 5;
  fila('Dirección:', cliente.direccion || 'N/A', M, M + 36);
  y += 5;
  fila('Teléfono:', cliente.telefono || 'N/A', M, M + 36);
  y += 6;

  // ---------- ITEMS ----------
  autoTable(doc, {
    startY: y,
    head: [['Descripción', 'Cant.', 'Precio Un.', 'ITBIS', 'Total']],
    body: detalles.map((it) => [
      String(it.descripcion || '').toUpperCase(),
      String(it.cantidad ?? ''),
      money(it.precio),
      money(it.itbis),
      money(it.importe),
    ]),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, lineColor: [120, 120, 120], lineWidth: 0.1 },
    headStyles: { fillColor: [235, 235, 235], textColor: 20, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 16, halign: 'center' },
      2: { cellWidth: 26, halign: 'right' },
      3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' },
    },
    margin: { left: M, right: M },
  });

  y = doc.lastAutoTable.finalY + 6;

  // ---------- TOTALES ----------
  const totalRow = (etiqueta, valor, negrita = false, size = 10) => {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.text(etiqueta, R - 42, y, { align: 'right' });
    doc.text(money(valor), R, y, { align: 'right' });
    y += size > 10 ? 7 : 5.5;
  };

  totalRow('Sub-Total:', factura.subtotal);
  if (Number(factura.descuento) > 0) totalRow('Descuento:', factura.descuento);
  totalRow('ITBIS:', factura.itbis);
  doc.setLineWidth(0.4);
  doc.line(R - 60, y - 3.5, R, y - 3.5);
  y += 1;
  totalRow('TOTAL:', factura.total, true, 12);

  // A crédito, lo que de verdad queda debiendo.
  if (factura.forma_pago === 'CREDITO') {
    const pendiente = factura.monto_pendiente != null
      ? factura.monto_pendiente
      : (Number(factura.total) || 0) - (Number(factura.monto_recibido) || 0);
    if (Number(factura.monto_recibido) > 0) totalRow('Abono:', factura.monto_recibido);
    totalRow('Pendiente:', pendiente, true);
  }

  y += 4;

  // ---------- NOTAS ----------
  if (factura.notas) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Notas:', M, y);
    doc.setFont('helvetica', 'normal');
    const lineas = doc.splitTextToSize(String(factura.notas), R - M - 14);
    doc.text(lineas, M + 14, y);
    y += lineas.length * 4.5 + 4;
  }

  // ---------- FIRMAS ----------
  const yFirma = Math.max(y + 14, doc.internal.pageSize.getHeight() - 32);
  doc.setLineWidth(0.3);
  doc.line(M, yFirma, M + 60, yFirma);
  doc.line(R - 60, yFirma, R, yFirma);
  doc.setFontSize(8);
  doc.text('Entregado por', M + 30, yFirma + 4, { align: 'center' });
  doc.text('Recibido conforme', R - 30, yFirma + 4, { align: 'center' });

  // ---------- SALIDA ----------
  const archivo = `${tituloComprobante(factura).replace(/ /g, '_')}_${factura.ncf || numeroStr}.pdf`;
  if (accion === 'descargar') {
    doc.save(archivo);                     // queda el archivo para adjuntar
    return;
  }
  const url = URL.createObjectURL(doc.output('blob'));
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(`<html><head><title>${archivo}</title>
      <style>body{margin:0;padding:0;overflow:hidden}</style></head>
      <body><embed src="${url}#toolbar=1&navpanes=0" type="application/pdf" width="100%" height="100%"/></body></html>`);
    win.document.close();
  } else {
    window.open(url, '_blank');
  }
};
