// facturaCartaPDF.js — La factura en HOJA CARTA (8.5 x 11) como PDF de verdad.
//
// El generador que existía (facturaPDF.js) produce el ticket térmico de 80mm:
// sirve para el mostrador, no para mandarle una factura a una empresa. Y la
// hoja carta solo existía como HTML que abría el diálogo de impresión — no
// dejaba un archivo que se pueda adjuntar a un correo o a WhatsApp.
//
// >>> LA ESTRUCTURA ES LA DE UNA ORDEN DE COMPRA CORPORATIVA <<<
// Copiada de la orden de compra de Magna, que es el documento con el que se
// van a cotejar estas facturas: emisor arriba a la izquierda, el recuadro
// del documento arriba a la derecha (No / NCF / Fecha / Condición / Moneda),
// el bloque "Señores" con el cliente, y la tabla con Pos, Código, Cant, Un,
// Precio, Descuento e Importe. Cuando los dos papeles se leen igual, cotejar
// es cuestión de segundos.
//
// >>> EL IMPORTE DE LA LÍNEA VA SIN ITBIS <<<
// Como en la orden de Magna: la línea muestra 17,620.00 y el ITBIS aparece
// una sola vez en los totales. En la base, facturas_detalle.importe viene
// CON ITBIS (20,791.60) y precio sin él, así que aquí se resta.
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
 * @param {'abrir'|'descargar'} accion
 */
export const generateFacturaCartaPDF = (factura, empresa = {}, accion = 'abrir') => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 14;
  const R = W - M;

  const detalles = factura.facturas_detalle || [];
  const cliente = factura.clientes || {};

  // ---------- EMISOR (arriba a la izquierda) ----------
  // Manda el nombre con el que se autorizó el NCF: es el que la DGII espera
  // ver, no necesariamente el rótulo del local.
  const emisor = factura.nombre_emisor_ncf || empresa.razon_social || empresa.nombre || 'Mi Empresa';
  const comercial = String(empresa.nombre || '').trim();

  let y = 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(String(emisor).toUpperCase(), M, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  // El nombre comercial debajo, solo si es distinto del fiscal.
  if (comercial && comercial.toUpperCase() !== String(emisor).trim().toUpperCase()) {
    doc.text(comercial, M, y);
    y += 4;
  }
  [empresa.direccion, empresa.ciudad, empresa.telefono ? `Tel: ${empresa.telefono}` : null]
    .filter(Boolean)
    .forEach((linea) => { doc.text(String(linea), M, y); y += 4; });
  if (empresa.rnc) {
    doc.setFont('helvetica', 'bold');
    doc.text(`RNC: ${empresa.rnc}`, M, y);
    y += 4;
  }
  const yEmisorFin = y;

  // ---------- RECUADRO DEL DOCUMENTO (arriba a la derecha) ----------
  const numeroStr = `FT-${String(factura.numero || 'N/A').padStart(7, '0')}`;
  const boxW = 78;
  const boxX = R - boxW;
  let by = 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(tituloComprobante(factura), boxX + boxW / 2, by + 4, { align: 'center', maxWidth: boxW });
  by += 7;

  const filasDoc = [
    ['No', numeroStr],
    factura.ncf ? ['NCF', String(factura.ncf)] : null,
    ['Fecha', formatInTimeZone(new Date(factura.fecha), 'dd/LL/yyyy')],
    ['Pág.', '1/1'],
    ['Condición', factura.forma_pago === 'CREDITO'
      ? `Crédito ${factura.dias_credito || 0} días` : 'Contado'],
    ['Moneda', 'RD$'],
  ].filter(Boolean);

  const filaH = 5.2;
  const boxH = filasDoc.length * filaH;
  doc.setLineWidth(0.3);
  doc.rect(boxX, by, boxW, boxH);
  doc.line(boxX + 24, by, boxX + 24, by + boxH);   // separador de columnas

  filasDoc.forEach(([etiqueta, valor], i) => {
    const fy = by + filaH * i;
    if (i > 0) doc.line(boxX, fy, boxX + boxW, fy);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(etiqueta, boxX + 2, fy + 3.6);
    // El NCF resaltado: es lo primero que se busca al recibir la factura.
    const esNcf = etiqueta === 'NCF';
    doc.setFont('helvetica', esNcf ? 'bold' : 'normal');
    doc.setFontSize(esNcf ? 9.5 : 8.5);
    doc.text(String(valor), boxX + 26, fy + 3.7);
  });

  y = Math.max(yEmisorFin, by + boxH) + 7;

  // ---------- SEÑORES (el cliente) ----------
  const genericIds = ['00000000-0000-0000-0000-000000000000', '2749fa36-3d7c-4bdf-ad61-df88eda8365a'];
  const isGeneric = !cliente.id || genericIds.includes(cliente.id)
    || (cliente.nombre || '').toUpperCase().includes('GENERICO');
  const clienteNombre = (isGeneric && factura.manual_cliente_nombre)
    ? factura.manual_cliente_nombre.toUpperCase()
    : (cliente.nombre || 'CLIENTE GENERICO').toUpperCase();
  const rncCliente = cliente.rnc && cliente.rnc !== '000000000' ? cliente.rnc : null;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Señores', M, y);
  y += 4.5;
  doc.setFontSize(8.5);
  // RNC y nombre en la misma línea, como los identifica Magna en su orden.
  doc.text(`${rncCliente ? rncCliente + '  ' : ''}${clienteNombre}`, M, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  [cliente.direccion, cliente.telefono ? `Tel ${cliente.telefono}` : null]
    .filter(Boolean)
    .forEach((linea) => {
      doc.splitTextToSize(String(linea), 110).forEach((l) => { doc.text(l, M, y); y += 4; });
    });

  y += 3;

  // ---------- CONCEPTO ----------
  // Va ANTES de la tabla, igual que en la orden de Magna: dice de qué se
  // trata el documento completo antes de entrar al detalle.
  if (factura.notas) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.splitTextToSize(String(factura.notas), R - M).forEach((l) => {
      doc.text(l, M, y); y += 4;
    });
    y += 2;
  }

  // ---------- TABLA ----------
  autoTable(doc, {
    startY: y,
    head: [['Pos', 'Código', 'Descripción', 'Cant', 'Un', 'Precio', 'Descuento', 'Importe']],
    body: detalles.map((it, i) => {
      // El importe de la línea SIN ITBIS: en la base viene con el impuesto
      // adentro y el impuesto se muestra una sola vez, en los totales.
      const sinItbis = (Number(it.importe) || 0) - (Number(it.itbis) || 0);
      return [
        String(i + 1).padStart(4, '0'),
        String(it.codigo || ''),
        String(it.descripcion || '').toUpperCase(),
        String(it.cantidad ?? ''),
        'UND',
        money(it.precio),
        money(it.descuento),
        money(sinItbis),
      ];
    }),
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, lineColor: [90, 90, 90], lineWidth: 0.1 },
    headStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold', halign: 'center', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 11, halign: 'center' },
      1: { cellWidth: 22 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 12, halign: 'right' },
      4: { cellWidth: 9, halign: 'center' },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 20, halign: 'right' },
      7: { cellWidth: 24, halign: 'right' },
    },
    margin: { left: M, right: M },
  });

  y = doc.lastAutoTable.finalY + 5;

  // ---------- TOTALES ----------
  const totalRow = (etiqueta, valor, negrita = false, size = 9) => {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.text(etiqueta, R - 30, y, { align: 'right' });
    doc.text(money(valor), R, y, { align: 'right' });
    y += size > 9 ? 6 : 4.6;
  };

  totalRow('Subtotal', factura.subtotal);
  totalRow('Descuentos', factura.descuento || 0);
  totalRow('Otros Cargos', factura.recargo || 0);
  totalRow('ITBIS', factura.itbis);
  doc.setLineWidth(0.3);
  doc.line(R - 55, y - 3, R, y - 3);
  y += 0.5;
  totalRow('Total', factura.total, true, 11);

  // A crédito, lo que de verdad queda debiendo.
  if (factura.forma_pago === 'CREDITO') {
    const pendiente = factura.monto_pendiente != null
      ? factura.monto_pendiente
      : (Number(factura.total) || 0) - (Number(factura.monto_recibido) || 0);
    if (Number(factura.monto_recibido) > 0) totalRow('Abono', factura.monto_recibido);
    totalRow('Pendiente', pendiente, true);
  }

  // ---------- FIRMAS + PIE ----------
  const yFirma = Math.max(y + 16, H - 26);
  doc.setLineWidth(0.3);
  doc.line(M, yFirma, M + 58, yFirma);
  doc.line(R - 58, yFirma, R, yFirma);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('Entregado por', M + 29, yFirma + 3.5, { align: 'center' });
  doc.text('Recibido conforme', R - 29, yFirma + 3.5, { align: 'center' });

  doc.setFontSize(6.5);
  doc.text(
    'Esta factura es un comprobante fiscal válido. Conserve el original para fines de deducción.',
    W / 2, H - 10, { align: 'center' }
  );

  // ---------- SALIDA ----------
  const archivo = `${tituloComprobante(factura).replace(/ /g, '_')}_${factura.ncf || numeroStr}.pdf`;
  if (accion === 'descargar') {
    doc.save(archivo);
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
