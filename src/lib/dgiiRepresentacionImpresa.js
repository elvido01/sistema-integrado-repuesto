import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';

const TIPO_LABELS = {
  31: 'Factura de Credito Fiscal Electronica',
  32: 'Factura de Consumo Electronica',
  33: 'Nota de Debito Electronica',
  34: 'Nota de Credito Electronica',
  41: 'Comprobante Electronico de Compras',
  43: 'Comprobante Electronico de Gastos Menores',
  44: 'Comprobante Electronico Regimenes Especiales',
  45: 'Comprobante Electronico Gubernamental',
  46: 'Comprobante Electronico para Exportaciones',
  47: 'Comprobante Electronico para Pagos al Exterior',
};

const textFromXml = (doc, tagName) => {
  const node = Array.from(doc.getElementsByTagName('*')).find((el) => el.localName === tagName);
  return node?.textContent?.trim() || '';
};

const formatMoney = (value) => {
  const number = Number(String(value || '0').replace(/,/g, '')) || 0;
  return number.toFixed(2);
};

const moneyNumber = (value) => Number(String(value || '0').replace(/,/g, '')) || 0;

const formatDgiiDate = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [yyyy, mm, dd] = raw.split('-');
    return `${dd}-${mm}-${yyyy}`;
  }
  return raw.replace(/\//g, '-');
};

const formatDgiiDateTime = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const [datePart, timePart = '00:00:00'] = raw.replace('T', ' ').split(' ');
  return `${formatDgiiDate(datePart)} ${timePart.slice(0, 8)}`;
};

const safeFileName = (value) => String(value || 'representacion').replace(/[^\w.-]+/g, '_');

const truncate = (doc, text, maxWidth) => {
  const value = String(text || '');
  if (doc.getTextWidth(value) <= maxWidth) return value;
  let out = value;
  while (out.length > 4 && doc.getTextWidth(`${out}...`) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
};

const getItems = (doc) => Array.from(doc.getElementsByTagName('*'))
  .filter((el) => el.localName === 'Item')
  .map((item) => {
    const get = (name) => Array.from(item.children).find((el) => el.localName === name)?.textContent?.trim() || '';
    return {
      linea: get('NumeroLinea'),
      nombre: get('NombreItem'),
      cantidad: get('CantidadItem'),
      unidad: get('UnidadMedida'),
      indicador: get('IndicadorFacturacion'),
      precio: get('PrecioUnitarioItem'),
      itbis: get('ITBIS'),
      descuento: get('MontoDescuento'),
      monto: get('MontoItem'),
    };
  });

export function parseEcfXml(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const parserError = doc.getElementsByTagName('parsererror')[0];
  if (parserError) throw new Error('El XML firmado no se pudo leer para generar la representacion impresa.');

  const signatureValue = textFromXml(doc, 'SignatureValue');
  const tipo = textFromXml(doc, 'TipoeCF');
  const montoTotal = formatMoney(textFromXml(doc, 'MontoTotal'));
  const montoGravadoTotal = formatMoney(textFromXml(doc, 'MontoGravadoTotal'));
  const fechaFirma = textFromXml(doc, 'FechaHoraFirma');
  const rncComprador = textFromXml(doc, 'RNCComprador');
  const identificadorExtranjero = textFromXml(doc, 'IdentificadorExtranjero');

  return {
    tipo,
    tipoLabel: TIPO_LABELS[tipo] || `Comprobante Electronico tipo ${tipo}`,
    encf: textFromXml(doc, 'eNCF'),
    rncEmisor: textFromXml(doc, 'RNCEmisor'),
    razonSocialEmisor: textFromXml(doc, 'RazonSocialEmisor'),
    nombreComercial: textFromXml(doc, 'NombreComercial'),
    direccionEmisor: textFromXml(doc, 'DireccionEmisor'),
    municipioEmisor: textFromXml(doc, 'Municipio'),
    provinciaEmisor: textFromXml(doc, 'Provincia'),
    telefonoEmisor: textFromXml(doc, 'TelefonoEmisor'),
    correoEmisor: textFromXml(doc, 'CorreoEmisor'),
    fechaEmision: formatDgiiDate(textFromXml(doc, 'FechaEmision')),
    fechaVencimiento: formatDgiiDate(textFromXml(doc, 'FechaVencimientoSecuencia')),
    rncComprador,
    identificadorExtranjero,
    razonSocialComprador: textFromXml(doc, 'RazonSocialComprador'),
    direccionComprador: textFromXml(doc, 'DireccionComprador'),
    totalItbis: formatMoney(textFromXml(doc, 'TotalITBIS')),
    montoTotal,
    montoGravadoTotal,
    montoExento: formatMoney(textFromXml(doc, 'MontoExento')),
    valorPagar: formatMoney(textFromXml(doc, 'ValorPagar') || montoTotal),
    totalItbisRetenido: formatMoney(textFromXml(doc, 'TotalITBISRetenido')),
    totalIsrRetencion: formatMoney(textFromXml(doc, 'TotalISRRetencion')),
    ncfModificado: textFromXml(doc, 'NCFModificado'),
    rncOtroContribuyente: textFromXml(doc, 'RNCOtroContribuyente'),
    fechaNcfModificado: formatDgiiDate(textFromXml(doc, 'FechaNCFModificado')),
    codigoModificacion: textFromXml(doc, 'CodigoModificacion'),
    razonModificacion: textFromXml(doc, 'RazonModificacion'),
    fechaFirma: formatDgiiDateTime(fechaFirma),
    codigoSeguridad: signatureValue.slice(0, 6),
    items: getItems(doc),
  };
}

export function normalizeRepresentacionData(data) {
  const tipo = String(data.tipo || data.tipo_ecf || '').trim();
  const montoTotal = formatMoney(data.montoTotal || data.monto_total || data.total);
  const totalItbis = formatMoney(data.totalItbis || data.total_itbis);
  const montoExento = formatMoney(data.montoExento || data.monto_exento);
  const montoGravadoTotal = formatMoney(data.montoGravadoTotal || data.monto_gravado_total);
  const subtotalCalculado = moneyNumber(montoGravadoTotal) + moneyNumber(montoExento);
  const subtotal = subtotalCalculado > 0
    ? formatMoney(subtotalCalculado)
    : formatMoney(Math.max(0, moneyNumber(montoTotal) - moneyNumber(totalItbis)));
  return {
    ambiente: String(data.ambiente || data.environment || '').trim(),
    tipo,
    tipoLabel: data.tipoLabel || TIPO_LABELS[tipo] || `Comprobante Electronico tipo ${tipo}`,
    encf: String(data.encf || data.eNCF || data.ENCF || '').trim(),
    rncEmisor: String(data.rncEmisor || data.rnc_emisor || '').replace(/\D/g, ''),
    razonSocialEmisor: data.razonSocialEmisor || data.razon_social_emisor || '',
    nombreComercial: data.nombreComercial || data.nombre_comercial || '',
    direccionEmisor: data.direccionEmisor || data.direccion_emisor || '',
    municipioEmisor: data.municipioEmisor || data.municipio_emisor || '',
    provinciaEmisor: data.provinciaEmisor || data.provincia_emisor || '',
    telefonoEmisor: data.telefonoEmisor || data.telefono_emisor || '',
    correoEmisor: data.correoEmisor || data.correo_emisor || '',
    fechaEmision: formatDgiiDate(data.fechaEmision || data.fecha_emision || ''),
    fechaVencimiento: formatDgiiDate(data.fechaVencimiento || data.fecha_vencimiento || data.fechaVencimientoSecuencia || data.fecha_vencimiento_secuencia || ''),
    rncComprador: String(data.rncComprador || data.rnc_comprador || '').replace(/\D/g, ''),
    identificadorExtranjero: data.identificadorExtranjero || data.identificador_extranjero || '',
    razonSocialComprador: data.razonSocialComprador || data.razon_social_comprador || '',
    direccionComprador: data.direccionComprador || data.direccion_comprador || '',
    totalItbis,
    montoTotal,
    montoGravadoTotal,
    montoExento,
    subtotal,
    valorPagar: formatMoney(data.valorPagar || data.valor_pagar || montoTotal),
    totalItbisRetenido: formatMoney(data.totalItbisRetenido || data.total_itbis_retenido),
    totalIsrRetencion: formatMoney(data.totalIsrRetencion || data.total_isr_retencion),
    ncfModificado: data.ncfModificado || data.ncf_modificado || data.NCFModificado || '',
    rncOtroContribuyente: String(data.rncOtroContribuyente || data.rnc_otro_contribuyente || data.RNCOtroContribuyente || '').replace(/\D/g, ''),
    fechaNcfModificado: formatDgiiDate(data.fechaNcfModificado || data.fecha_ncf_modificado || data.FechaNCFModificado || ''),
    codigoModificacion: String(data.codigoModificacion || data.codigo_modificacion || data.CodigoModificacion || '').trim(),
    razonModificacion: data.razonModificacion || data.razon_modificacion || data.RazonModificacion || '',
    fechaFirma: formatDgiiDateTime(data.fechaFirma || data.fecha_firma || ''),
    codigoSeguridad: String(data.codigoSeguridad || data.codigo_seguridad || '').trim().slice(0, 6),
    items: Array.isArray(data.items) && data.items.length ? data.items : [{
      linea: '1',
      nombre: data.nombreItem || data.nombre_item || `SIMULACION E-CF TIPO ${tipo}`,
      cantidad: '1',
      precio: montoTotal,
      monto: montoTotal,
    }],
  };
}

export function buildDgiiQrUrl(data) {
  const monto = formatMoney(data.montoTotal);
  const isFacturaConsumoMenor = data.tipo === '32' && Number(monto) < 250000;
  const ambiente = String(data.ambiente || '').trim();
  const isProduccion = !ambiente || ambiente === 'Produccion';
  const ambientePath = ambiente.toLowerCase();
  const baseUrl = isProduccion
    ? (isFacturaConsumoMenor
      ? 'https://fc.dgii.gov.do/ecf/ConsultaTimbreFC'
      : 'https://ecf.dgii.gov.do/ecf/consultatimbre')
    : `https://ecf.dgii.gov.do/${ambientePath}/consultatimbre`;

  const compradorId = data.rncComprador || data.identificadorExtranjero || '';
  const params = [
    ['rncemisor', data.rncEmisor],
  ];
  if (!isFacturaConsumoMenor && compradorId) {
    params.push(['rnccomprador', compradorId]);
  }
  params.push(['encf', data.encf]);
  if (!isFacturaConsumoMenor) {
    params.push(['fechaemision', data.fechaEmision]);
  }
  params.push(['montototal', monto]);
  if (!isFacturaConsumoMenor) {
    params.push(['fechafirma', data.fechaFirma]);
  }
  params.push(['codigoseguridad', data.codigoSeguridad]);

  const search = new URLSearchParams(params);
  return `${baseUrl}?${search.toString()}`;
}

export function getRepresentacionQrUrl(inputData) {
  return buildDgiiQrUrl(normalizeRepresentacionData(inputData));
}

const labelValue = (doc, label, value, x, y, maxWidth = 72) => {
  doc.setFont('helvetica', 'bold');
  doc.text(label, x, y);
  doc.setFont('helvetica', 'normal');
  doc.text(truncate(doc, value || '-', maxWidth), x, y + 5);
};

const getDisplayItemItbis = (item, data) => {
  const itemItbis = Number(String(item.itbis || '0').replace(/,/g, '')) || 0;
  if (itemItbis > 0) return formatMoney(itemItbis);
  if ((data.items || []).length === 1 && Number(data.totalItbis) > 0) return formatMoney(data.totalItbis);
  return '0.00';
};

export async function generateRepresentacionImpresaPdfFromData(inputData, options = {}) {
  const data = normalizeRepresentacionData({ ...inputData, ambiente: inputData?.ambiente || options.ambiente });
  if (!data.rncEmisor || !data.encf || !data.montoTotal || !data.codigoSeguridad) {
    throw new Error('Faltan datos obligatorios para el QR: RNC emisor, e-NCF, monto total o codigo de seguridad.');
  }
  const qrUrl = buildDgiiQrUrl(data);
  const qrDataUrl = await QRCode.toDataURL(qrUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 220,
  });

  const doc = new jsPDF({ unit: 'mm', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const tableWidth = pageWidth - margin * 2;
  const footerReserve = 78;

  const drawHeader = () => {
    let headerY = 14;
    const rightHeaderX = pageWidth - margin;
    const rightHeaderY = 16;

    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(truncate(doc, data.nombreComercial || data.razonSocialEmisor || 'Representacion Impresa e-CF', 92), margin, headerY);
    doc.text(truncate(doc, data.tipoLabel, 78), rightHeaderX, rightHeaderY, { align: 'right' });
    headerY += 5;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(truncate(doc, data.razonSocialEmisor || data.nombreComercial, 92), margin, headerY);
    doc.setFont('helvetica', 'bold');
    doc.text(`e-NCF: ${data.encf}`, rightHeaderX, rightHeaderY + 6, { align: 'right' });
    doc.text(`Tipo e-CF: ${data.tipo}`, rightHeaderX, rightHeaderY + 12, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    headerY += 5;

    doc.text(`RNC: ${data.rncEmisor || '-'}`, margin, headerY);
    if (data.fechaVencimiento) doc.text(`Fecha Vencimiento: ${data.fechaVencimiento}`, rightHeaderX, rightHeaderY + 18, { align: 'right' });
    headerY += 5;
    doc.text(truncate(doc, `Direccion: ${data.direccionEmisor || '-'}`, 120), margin, headerY);
    headerY += 5;
    doc.text(`Municipio: ${data.municipioEmisor || '-'}   Provincia: ${data.provinciaEmisor || '-'}`, margin, headerY);
    headerY += 5;
    doc.text(`Fecha Emision: ${data.fechaEmision || '-'}${data.telefonoEmisor ? `   Tel: ${data.telefonoEmisor}` : ''}`, margin, headerY);
    headerY += 5;
    if (data.correoEmisor) doc.text(truncate(doc, data.correoEmisor, 120), margin, headerY);
    headerY += 4;

    doc.setDrawColor(20, 83, 45);
    doc.setLineWidth(0.4);
    doc.line(margin, headerY, pageWidth - margin, headerY);
    headerY += 7;

    if ((data.tipo === '33' || data.tipo === '34') && data.ncfModificado) {
      doc.setFillColor(255, 250, 235);
      doc.rect(margin, headerY, tableWidth, 22, 'F');
      headerY += 6;
      labelValue(doc, 'e-NCF Modificado', data.ncfModificado, margin + 3, headerY, 54);
      labelValue(doc, 'Fecha NCF Modificado', data.fechaNcfModificado, margin + 62, headerY, 42);
      labelValue(doc, 'Codigo Modificacion', data.codigoModificacion, margin + 111, headerY, 32);
      headerY += 11;
      labelValue(doc, 'Razon Modificacion', data.razonModificacion, margin + 3, headerY, 126);
      headerY += 11;
    }

    doc.setFillColor(245, 247, 250);
    doc.rect(margin, headerY, tableWidth, 28, 'F');
    headerY += 6;
    labelValue(doc, 'Comprador', data.razonSocialComprador, margin + 3, headerY, 86);
    labelValue(doc, 'RNC / ID', data.rncComprador || data.identificadorExtranjero, margin + 96, headerY, 44);
    headerY += 12;
    labelValue(doc, 'Direccion', data.direccionComprador, margin + 3, headerY, 132);
    headerY += 16;

    return headerY;
  };

  const drawPageNumber = () => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text(`Pag. ${doc.internal.getNumberOfPages()}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  };

  const drawTableHeader = (startY) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Detalle', margin, startY);
    startY += 5;
    doc.setFillColor(30, 64, 91);
    doc.rect(margin, startY, tableWidth, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text('#', margin + 2, startY + 5);
    doc.text('Descripcion', margin + 12, startY + 5);
    doc.text('Cant.', margin + 104, startY + 5);
    doc.text('Und.', margin + 119, startY + 5);
    doc.text('Precio', margin + 132, startY + 5);
    doc.text('ITBIS', margin + 151, startY + 5);
    doc.text('Monto', margin + 167, startY + 5);
    doc.setTextColor(0, 0, 0);
    return startY + 8;
  };

  const addContinuationPage = () => {
    drawPageNumber();
    doc.addPage();
    let nextY = 16;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(truncate(doc, data.nombreComercial || data.razonSocialEmisor, 92), margin, nextY);
    doc.text(`e-NCF: ${data.encf}`, pageWidth - margin, nextY, { align: 'right' });
    nextY += 8;
    return drawTableHeader(nextY);
  };

  let y = drawHeader();
  y = drawTableHeader(y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  for (const item of data.items) {
    if (y > pageHeight - footerReserve) {
      y = addContinuationPage();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
    }
    doc.text(String(item.linea || ''), margin + 2, y + 5);
    doc.text(truncate(doc, `${item.indicador === '4' ? 'E ' : ''}${item.nombre || ''}`, 80), margin + 12, y + 5);
    doc.text(String(item.cantidad || ''), margin + 104, y + 5);
    doc.text(String(item.unidad || ''), margin + 119, y + 5);
    doc.text(formatMoney(item.precio), margin + 132, y + 5);
    doc.text(getDisplayItemItbis(item, data), margin + 151, y + 5);
    doc.text(formatMoney(item.monto), margin + 167, y + 5);
    doc.setDrawColor(230, 234, 240);
    doc.line(margin, y + 7, pageWidth - margin, y + 7);
    y += 8;
  }
  if (!data.items.length) {
    doc.text('Sin detalle de items en el XML.', margin + 2, y + 5);
    y += 8;
  }

  if (y > pageHeight - footerReserve) {
    y = addContinuationPage();
  }

  y += 3;
  const totalsY = Math.max(y, pageHeight - 96);
  const totalsX = pageWidth - margin - 78;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Sub-Total', totalsX, totalsY);
  doc.text(`RD$ ${data.subtotal}`, pageWidth - margin, totalsY, { align: 'right' });
  doc.text('Total ITBIS', totalsX, totalsY + 6);
  doc.text(`RD$ ${data.totalItbis}`, pageWidth - margin, totalsY + 6, { align: 'right' });
  doc.text('Valor a Pagar', totalsX, totalsY + 12);
  doc.text(`RD$ ${data.valorPagar}`, pageWidth - margin, totalsY + 12, { align: 'right' });
  if (Number(data.totalItbisRetenido) > 0) {
    doc.text('ITBIS Retenido', totalsX, totalsY + 18);
    doc.text(`RD$ ${data.totalItbisRetenido}`, pageWidth - margin, totalsY + 18, { align: 'right' });
  }
  if (Number(data.totalIsrRetencion) > 0) {
    doc.text('ISR Retenido', totalsX, totalsY + 24);
    doc.text(`RD$ ${data.totalIsrRetencion}`, pageWidth - margin, totalsY + 24, { align: 'right' });
  }

  const qrSize = 42;
  const qrX = margin + 2;
  const qrY = pageHeight - 70;
  doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Codigo de Seguridad', qrX, qrY + qrSize + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(data.codigoSeguridad || '-', qrX + 35, qrY + qrSize + 6);
  doc.setFont('helvetica', 'bold');
  doc.text('Fecha Firma Digital', qrX, qrY + qrSize + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(data.fechaFirma || '-', qrX + 35, qrY + qrSize + 12);

  drawPageNumber();

  const fileName = options.fileName || `${safeFileName(data.encf)}_RI.pdf`;
  return { doc, data, qrUrl, fileName };
}

export async function generateRepresentacionImpresaPdf(xml, options = {}) {
  return generateRepresentacionImpresaPdfFromData({ ...parseEcfXml(xml), ambiente: options.ambiente }, options);
}

export async function downloadRepresentacionImpresa(xml, options = {}) {
  const { doc, fileName } = await generateRepresentacionImpresaPdf(xml, options);
  doc.save(fileName);
}

export async function downloadRepresentacionImpresaFromData(data, options = {}) {
  const { doc, fileName } = await generateRepresentacionImpresaPdfFromData(data, options);
  doc.save(fileName);
}
