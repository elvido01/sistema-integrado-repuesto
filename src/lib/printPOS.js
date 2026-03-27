import { formatInTimeZone } from './dateUtils';

const formatCurrency = (value) => {
  return (parseFloat(value) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

// ── Configuración de empresa para encabezados de impresión ──
let _empresaConfig = { nombre: 'Sistema', direccion: '', ciudad: '', telefono: '' };

export const setEmpresaPrintConfig = (empresa) => {
  if (empresa) {
    _empresaConfig = {
      nombre: empresa.nombre || 'Sistema',
      direccion: empresa.direccion || '',
      ciudad: empresa.ciudad || '',
      telefono: empresa.telefono || '',
    };
  }
};

const getHeaderHTML = () => {
  const lines = [`<h1 class="bold">${_empresaConfig.nombre}</h1>`];
  if (_empresaConfig.direccion) lines.push(`<p>${_empresaConfig.direccion}</p>`);
  if (_empresaConfig.ciudad) lines.push(`<p>${_empresaConfig.ciudad}</p>`);
  if (_empresaConfig.telefono) lines.push(`<p class="num">${_empresaConfig.telefono}</p>`);
  return lines.join('\n        ');
};

export const printFacturaPOS = (factura, printFormat = 'pos_4inch') => {
  const details = factura.facturas_detalle || [];
  const client = factura.clientes || {};
  const seller = factura.perfiles || {};
  const fechaStr = formatInTimeZone(new Date(factura.fecha), 'd/L/yyyy');
  const horaStr = formatInTimeZone(new Date(factura.fecha), 'hh:mm a');
  const numeroStr = `FT-${String(factura.numero || 'N/A').padStart(7, '0')}`;

  const is4inch = printFormat === 'pos_4inch';
  const pageWidth = is4inch ? '100mm' : '80mm';
  const bodyWidth = is4inch ? '88mm' : '72mm';
  const baseFontSize = is4inch ? '15px' : '14px';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @page {
          margin: 0;
          size: ${pageWidth} auto;
        }
        html, body {
          margin: 0;
          padding: 0;
          background-color: #fff;
        }
        body {
          width: ${bodyWidth};
          margin: 0 auto;
          padding: 2mm 4mm;
          box-sizing: border-box;
          font-family: Arial, Helvetica, sans-serif;
          font-size: ${baseFontSize};
          font-weight: 700;
          line-height: 1.2;
          color: #000;
          letter-spacing: 0.2px;
          -webkit-print-color-adjust: exact;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .header { margin-bottom: 4px; }
        .header h1 { font-size: 20px; margin: 0; font-weight: 900; letter-spacing: 0.5px; }
        .header p { margin: 1px 0; font-size: 13px; color: #000; }
        
        .section { margin-bottom: 4px; }
        .row { display: flex; justify-content: space-between; margin-bottom: 1px; font-size: 14px; }
        .client-info-row { display: flex; gap: 6px; margin-bottom: 1px; font-size: 14px; }
        .separator { border-top: 1px dashed #000; margin: 4px 0; height: 0; }
        .double-separator { border-top: 2px double #000; margin: 4px 0; height: 0; }
        
        .num { font-family: Arial, Helvetica, sans-serif; }
        
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th { text-align: left; padding-bottom: 2px; font-size: 13px; border-bottom: 1px solid #000; }
        .item-name { text-transform: uppercase; padding-top: 4px; font-size: 14px; word-wrap: break-word; line-height: 1.2; }
        .item-details { padding-bottom: 2px; font-size: 15px; }
        .item-details td.text-right { font-family: Arial, Helvetica, sans-serif; }
        
        .totals-container { margin-top: 4px; padding-top: 2px; }
        .totals-row { display: flex; justify-content: flex-end; margin-bottom: 1px; font-size: 14px; }
        .totals-label { text-align: right; padding-right: 6px; flex: 1; }
        .totals-value { text-align: right; width: 80px; font-variant-numeric: tabular-nums; font-family: Arial, Helvetica, sans-serif; }
        
        .grand-total { font-size: 17px; margin-top: 2px; padding-top: 4px; font-weight: 900; border-top: 2px solid #000; }
        .footer { margin-top: 8px; font-size: 13px; line-height: 1.2; padding-top: 4px; }
      </style>
    </head>
    <body onload="window.print()">
      <div class="header text-center">
        ${getHeaderHTML()}
        <div style="margin-top: 4px; font-size: 16px; letter-spacing: 1px;">FACTURA</div>
      </div>

      <div class="section">
        <div class="row">
          <span>Numero : <span class="num">${numeroStr}</span></span>
          <span class="text-right num">${horaStr}</span>
        </div>
        <div class="row">
          <span>Fecha  : <span class="num">${fechaStr}</span></span>
        </div>
        <div class="row">
          <span>Vence  : <strong>${factura.forma_pago === 'CREDITO' ? `Crédito ${factura.dias_credito} días` : 'CONTADO'}</strong></span>
        </div>

        <div class="client-info-row" style="margin-top: 2px;">
          <span>Cliente :</span>
          <span>
            ${(() => {
      const genericIds = ['00000000-0000-0000-0000-000000000000', '2749fa36-3d7c-4bdf-ad61-df88eda8365a'];
      const isGeneric = !client.id || genericIds.includes(client.id) || (client.nombre?.toUpperCase().includes('GENERICO'));
      return (isGeneric && factura.manual_cliente_nombre)
        ? factura.manual_cliente_nombre.toUpperCase()
        : (client.nombre || 'CLIENTE GENERICO').toUpperCase();
    })()}
          </span>
        </div>

        <div class="client-info-row">
          <span>Direccion : ${client.direccion || 'N/A'}</span>
        </div>
        <div class="client-info-row">
          <span>Tel. : ${client.telefono || 'N/A'}</span>
        </div>
      </div>

      <div class="separator"></div>
      <div style="font-size: 13px; font-weight: normal; margin-bottom: 2px;">Descripcion de la Mercancia</div>
      <table>
        <thead>
          <tr>
            <th width="22%">CANT.</th>
            <th width="28%" class="text-right">PRECIO</th>
            <th width="20%" class="text-right">ITBIS</th>
            <th width="30%" class="text-right">MONTO</th>
          </tr>
        </thead>
        <tbody>
          ${details.map(item => `
            <tr>
              <td colspan="4" class="item-name" style="padding-top: 4px;">${(item.descripcion || '').toUpperCase()}</td>
            </tr>
            <tr class="item-details">
              <td width="22%" style="white-space: nowrap;">${item.cantidad} UND</td>
              <td width="28%" class="text-right">${formatCurrency(item.precio)}</td>
              <td width="20%" class="text-right">${formatCurrency(item.itbis)}</td>
              <td width="30%" class="text-right">${formatCurrency(item.importe)}${(item.itbis || 0) < 0.01 ? ' E' : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="separator"></div>

      <div class="totals-container">
        <div class="totals-row">
          <div class="totals-label">Sub-Total :</div>
          <div class="totals-value">${formatCurrency(factura.subtotal)}</div>
        </div>
        <div class="totals-row">
          <div class="totals-label">Descuento en Items :</div>
          <div class="totals-value">${formatCurrency(factura.descuento)}</div>
        </div>
        <div class="totals-row">
          <div class="totals-label">Otros Descuento :</div>
          <div class="totals-value">${formatCurrency(0)}</div>
        </div>
        <div class="totals-row">
          <div class="totals-label">Recargo :</div>
          <div class="totals-value">${formatCurrency(0)}</div>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <div style="width: 70px; font-weight: normal; font-size: 12px; margin-top: 2px;">
            Valores en<br/>DOP
          </div>
          <div style="flex-grow: 1;">
            <div class="totals-row">
              <div class="totals-label">ITBIS :</div>
              <div class="totals-value">${formatCurrency(factura.itbis)}</div>
            </div>
            
            <div class="row" style="justify-content: flex-end; margin: 2px 0;">
              <span style="letter-spacing: -1px;">==========</span>
            </div>

            <div class="totals-row grand-total">
              <div class="totals-label">TOTAL :</div>
              <div class="totals-value">${formatCurrency(factura.total)}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="separator"></div>

      ${factura.forma_pago === 'CONTADO' ? `
        <div class="totals-container">
          <div class="totals-row">
            <div class="totals-label">PAGADO:</div>
            <div class="totals-value">${formatCurrency(factura.monto_recibido)}</div>
          </div>
          <div class="totals-row">
            <div class="totals-label">CAMBIO:</div>
            <div class="totals-value">${formatCurrency(factura.cambio)}</div>
          </div>
        </div>
        <div class="separator"></div>
      ` : ''}

      <div class="footer">
        <p>Le Atendio : ${seller?.email?.split('@')[0] || 'N/A'}</p>
        <p>Vendedor : ${factura.vendedor || _empresaConfig.nombre}</p>
        <p class="text-center" style="margin-top: 5px;">*** GRACIAS POR SU COMPRA ***</p>
      </div>
    </body>
    </html>
  `;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  iframe.contentWindow.document.open();
  iframe.contentWindow.document.write(html);
  iframe.contentWindow.document.close();

  // Remove after some time
  setTimeout(() => {
    if (document.body.contains(iframe)) {
      document.body.removeChild(iframe);
    }
  }, 3000);
};

export const printDevolucionPOS = (devolucion, factura, cliente, details) => {
  const fechaStr = formatInTimeZone(new Date(devolucion.fecha_devolucion), 'd/L/yyyy');
  const horaStr = formatInTimeZone(new Date(), 'hh:mm a');
  const numeroStr = `DV-${String(devolucion.numero || 'N/A').padStart(7, '0')}`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @page {
          margin: 0;
          size: 80mm auto;
        }
        html, body {
          margin: 0;
          padding: 0;
          background-color: #fff;
        }
        body {
          width: 78mm;
          margin: 0 auto;
          padding: 2mm 3mm;
          box-sizing: border-box;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 11px;
          line-height: 1.2;
          color: #000;
          -webkit-print-color-adjust: exact;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .bold { font-weight: bold; }
        .header { margin-bottom: 8px; }
        .header h1 { font-size: 15px; margin: 0; font-weight: 800; }
        .header p { margin: 1px 0; font-size: 10px; color: #333; }
        
        .section { margin-bottom: 8px; }
        .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        .client-info-row { display: flex; gap: 4px; margin-bottom: 2px; }
        .separator { border-top: 1px dashed #000; margin: 4px 0; height: 0; }
        .double-separator { border-top: 2px double #000; margin: 6px 0; height: 0; }
        
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th { text-align: left; font-weight: bold; padding-bottom: 2px; font-size: 11px; }
        .item-name { font-weight: bold; text-transform: uppercase; padding-top: 4px; font-size: 11px; word-wrap: break-word; }
        .item-details { padding-bottom: 4px; font-size: 10px; }
        
        .totals-container { margin-top: 8px; padding-top: 4px; }
        .totals-row { display: flex; justify-content: flex-end; margin-bottom: 2px; }
        .totals-label { text-align: right; padding-right: 8px; flex: 1; }
        .totals-value { text-align: right; width: 100px; }
        
        .grand-total { font-size: 13px; margin-top: 4px; padding-top: 4px; font-weight: bold; }
        .footer { margin-top: 15px; font-size: 10px; line-height: 1.2; padding-top: 4px; }
      </style>
    </head>
    <body onload="window.print()">
      <div class="header text-center">
        ${getHeaderHTML()}
        <div style="margin-top: 4px;" class="bold underline text-lg">DEVOLUCION</div>
      </div>

      <div class="section">
        <div class="row">
          <span>Numero : <span class="bold">${numeroStr}</span></span>
          <span class="text-right">${horaStr}</span>
        </div>
        <div class="row">
          <span>Fecha  : ${fechaStr}</span>
        </div>
        <div class="row">
          <span>Factura Orig. : <span class="bold">${factura.numero}</span></span>
        </div>

        <div class="client-info-row" style="margin-top: 4px;">
          <span class="bold">Cliente :</span>
          <span class="bold">${(cliente.nombre || 'CLIENTE GENERICO').toUpperCase()}</span>
        </div>

        <div class="client-info-row">
          <span>Direccion : ${cliente.direccion || 'N/A'}</span>
        </div>
        <div class="client-info-row">
          <span>Tel. : ${cliente.telefono || 'N/A'}</span>
        </div>
      </div>

      <div class="separator"></div>
      <div style="font-size: 10px; font-weight: bold; margin-bottom: 4px;">Descripcion de la Mercancia</div>
      <table>
        <thead>
          <tr>
            <th width="15%">CANT.</th>
            <th width="55%">DESCRIPCION</th>
            <th width="30%" class="text-right">IMPORTE</th>
          </tr>
        </thead>
        <tbody>
          ${details.map(item => `
            <tr>
              <td width="15%">${item.cantidad} UND</td>
              <td width="55%" class="item-name" style="padding-top: 4px;">${(item.descripcion || '').toUpperCase()}</td>
              <td width="30%" class="text-right">${formatCurrency(item.importe)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="separator"></div>

      <div class="totals-container">
        <div style="display: flex; justify-content: space-between;">
          <div style="width: 100px; font-weight: bold; font-size: 10px; margin-top: 4px;">
            Valores en<br/>DOP
          </div>
          <div style="flex-grow: 1;">
            <div class="totals-row">
              <div class="totals-label">Sub-Total :</div>
              <div class="totals-value">${formatCurrency(devolucion.subtotal)}</div>
            </div>
            <div class="totals-row">
              <div class="totals-label">Descuento :</div>
              <div class="totals-value">-${formatCurrency(devolucion.descuento_total)}</div>
            </div>
            <div class="totals-row">
              <div class="totals-label">ITBIS :</div>
              <div class="totals-value">${formatCurrency(devolucion.itbis_total)}</div>
            </div>
            
            <div class="row" style="justify-content: flex-end; margin: 4px 0;">
              <span style="letter-spacing: -1px;">==========</span>
            </div>

            <div class="totals-row grand-total">
              <div class="totals-label">TOTAL DEV.:</div>
              <div class="totals-value">${formatCurrency(devolucion.total_devolucion)}</div>
            </div>
          </div>
        </div>
      </div>


      <div class="separator"></div>

      ${devolucion.notas ? `
        <div class="section">
          <span class="bold uppercase text-[10px]">Notas:</span>
          <p style="margin-top: 2px; font-size: 10px;">${devolucion.notas}</p>
        </div>
        <div class="separator"></div>
      ` : ''}

      <div class="footer">
        <p>Le Atendio : ${devolucion.usuario_id || 'N/A'}</p>
        <p>Vendedor : ${_empresaConfig.nombre}</p>
        <p class="text-center" style="margin-top: 8px;">COMPROBANTE DE DEVOLUCION</p>
        <p class="text-center" style="font-size: 9px; margin-top: 4px;">Este documento acredita el ingreso de la mercancía al almacén.</p>
      </div>
    </body>
    </html>
  `;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  iframe.contentWindow.document.open();
  iframe.contentWindow.document.write(html);
  iframe.contentWindow.document.close();

  // Remove after some time
  setTimeout(() => {
    if (document.body.contains(iframe)) {
      document.body.removeChild(iframe);
    }
  }, 3000);
};

export const printReciboPOS = (reciboData) => {
  const { numero, fecha, clienteNombre, balanceAnterior, totalPagado, balanceActual, abonos, formasPago } = reciboData;
  const fechaStr = formatInTimeZone(new Date(fecha), 'd/L/yyyy');
  const horaStr = formatInTimeZone(new Date(), 'hh:mm a');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @page { margin: 0; size: 80mm auto; }
        body {
          width: 78mm; margin: 0 auto; padding: 2mm 3mm;
          font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 1.2; color: #000;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .bold { font-weight: bold; }
        .header { margin-bottom: 8px; }
        .header h1 { font-size: 15px; margin: 0; font-weight: 800; }
        .header p { margin: 1px 0; font-size: 10px; color: #333; }
        .separator { border-top: 1px dashed #000; margin: 4px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 4px; }
        th { text-align: left; font-size: 10px; border-bottom: 1px solid #000; }
        td { font-size: 10px; padding: 2px 0; }
        .total-row { font-weight: bold; font-size: 12px; margin-top: 6px; display: flex; justify-content: space-between; }
      </style>
    </head>
    <body onload="window.print()">
      <div class="header text-center">
        ${getHeaderHTML()}
        <div style="margin-top: 4px; font-weight: bold; text-decoration: underline;">RECIBO DE INGRESO</div>
      </div>

      <div style="margin-bottom: 6px;">
        <div style="display: flex; justify-content: space-between;">
          <span>Numero: <span class="bold">${numero}</span></span>
          <span>${horaStr}</span>
        </div>
        <div>Fecha: ${fechaStr}</div>
        <div style="margin-top: 4px;"><span class="bold">CLIENTE:</span> ${clienteNombre.toUpperCase()}</div>
      </div>

      <div class="separator"></div>
      <div class="bold" style="font-size: 10px; margin-bottom: 2px;">FACTURAS ABONADAS:</div>
      <table>
        <thead>
          <tr>
            <th width="60%">REFERENCIA</th>
            <th width="40%" class="text-right">ABONO</th>
          </tr>
        </thead>
        <tbody>
          ${abonos.map(a => `
            <tr>
              <td>${a.referencia}</td>
              <td class="text-right">${formatCurrency(a.monto_abono)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="separator"></div>
      <div class="bold" style="font-size: 10px; margin-bottom: 2px;">DETALLE DE PAGO:</div>
      <table>
        <tbody>
          ${formasPago.map(f => `
            <tr>
              <td>${f.forma.toUpperCase()} ${f.referencia ? `(${f.referencia})` : ''}</td>
              <td class="text-right">${formatCurrency(f.monto)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="separator"></div>
      <div style="margin-top: 4px;">
        <div style="display: flex; justify-content: space-between; font-size: 10px;">
          <span>Balance Anterior:</span>
          <span>${formatCurrency(balanceAnterior)}</span>
        </div>
        <div class="total-row">
          <span>TOTAL PAGADO:</span>
          <span>${formatCurrency(totalPagado)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10px; margin-top: 2px;">
          <span>Balance Actual:</span>
          <span class="bold">${formatCurrency(balanceActual)}</span>
        </div>
      </div>

      <div class="text-center" style="margin-top: 15px; font-size: 10px;">
        <p>*** GRACIAS POR SU PAGO ***</p>
        <p>Le Atendio: ${_empresaConfig.nombre}</p>
      </div>
    </body>
    </html>
  `;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  iframe.contentWindow.document.open();
  iframe.contentWindow.document.write(html);
  iframe.contentWindow.document.close();
  setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 3000);
};

export const printRecibo4Pulgadas = (reciboData) => {
  const { numero, fecha, clienteNombre, balanceAnterior, totalPagado, balanceActual, abonos, formasPago } = reciboData;
  const fechaStr = formatInTimeZone(new Date(fecha), 'd/L/yyyy');
  const horaStr = formatInTimeZone(new Date(), 'hh:mm a');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @page { margin: 0; size: 101.6mm auto; }
        body {
          width: 98mm; margin: 0 auto; padding: 3mm 4mm;
          font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.3; color: #000;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .bold { font-weight: bold; }
        .header { margin-bottom: 10px; border-bottom: 2px solid #000; padding-bottom: 5px; }
        .header h1 { font-size: 18px; margin: 0; font-weight: 900; }
        .header p { margin: 2px 0; font-size: 11px; }
        .separator { border-top: 1px dashed #000; margin: 6px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 5px; }
        th { text-align: left; font-size: 11px; border-bottom: 1px solid #000; padding: 2px 0; }
        td { font-size: 11px; padding: 3px 0; }
        .total-row { font-weight: bold; font-size: 14px; margin-top: 8px; display: flex; justify-content: space-between; border-top: 1px solid #000; padding-top: 4px; }
        .footer { margin-top: 20px; text-align: center; font-size: 11px; border-top: 1px dashed #ccc; padding-top: 10px; }
      </style>
    </head>
    <body onload="window.print()">
      <div class="header text-center">
        ${getHeaderHTML()}
        <div style="margin-top: 6px; font-weight: bold; font-size: 13px;">RECIBO DE INGRESO</div>
      </div>

      <div style="margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between;">
          <span>No. Recibo: <span class="bold">${numero}</span></span>
          <span>${fechaStr} ${horaStr}</span>
        </div>
        <div style="margin-top: 5px;"><span class="bold">CLIENTE:</span> ${clienteNombre.toUpperCase()}</div>
      </div>

      <div class="bold" style="font-size: 11px; margin-bottom: 3px; background: #eee; padding: 2px;">FACTURAS ABONADAS:</div>
      <table>
        <thead>
          <tr>
            <th width="70%">REFERENCIA</th>
            <th width="30%" class="text-right">ABONO</th>
          </tr>
        </thead>
        <tbody>
          ${abonos.map(a => `
            <tr>
              <td>${a.referencia}</td>
              <td class="text-right">${formatCurrency(a.monto_abono)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="separator"></div>
      <div class="bold" style="font-size: 11px; margin-bottom: 3px; background: #eee; padding: 2px;">DETALLE DE PAGO:</div>
      <table>
        <tbody>
          ${formasPago.map(f => `
            <tr>
              <td>${f.forma.toUpperCase()} ${f.referencia ? `(${f.referencia})` : ''}</td>
              <td class="text-right">${formatCurrency(f.monto)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="margin-top: 10px; background: #f9f9f9; padding: 5px; border: 1px solid #ddd;">
        <div style="display: flex; justify-content: space-between; font-size: 11px;">
          <span>Balance Anterior:</span>
          <span>${formatCurrency(balanceAnterior)}</span>
        </div>
        <div class="total-row">
          <span>TOTAL PAGADO:</span>
          <span>${formatCurrency(totalPagado)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 4px;">
          <span class="bold">Balance Actual:</span>
          <span class="bold">${formatCurrency(balanceActual)}</span>
        </div>
      </div>

      <div class="footer">
        <p>*** GRACIAS POR SU PREFERENCIA ***</p>
        <p>Recibido por: __________________________</p>
      </div>
    </body>
    </html>
  `;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  iframe.contentWindow.document.open();
  iframe.contentWindow.document.write(html);
  iframe.contentWindow.document.close();
  setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 3000);
};

export const printCotizacionPOS = (cotizacion, detalles, paperSize = '4inch') => {
  const fechaStr = cotizacion.fecha_cotizacion
    ? formatInTimeZone(new Date(cotizacion.fecha_cotizacion), 'd/L/yyyy')
    : 'N/A';
  const horaStr = formatInTimeZone(new Date(), 'hh:mm a');
  const numeroStr = `COT-${String(cotizacion.numero || 'N/A').padStart(7, '0')}`;

  // Calculate totals from details  — same logic as factura
  let subtotal = 0;
  let itbisTotal = 0;
  let descuentoItems = 0;
  const itemRows = detalles.map(d => {
    const importe = parseFloat(d.importe) || 0;
    const itbisPct = parseFloat(d.productos?.itbis_pct) || 0.18;
    const base = importe / (1 + itbisPct);
    const itbis = importe - base;
    subtotal += base;
    itbisTotal += itbis;
    descuentoItems += parseFloat(d.descuento) || 0;
    return { ...d, _itbis: itbis };
  });
  const total = parseFloat(cotizacion.total_cotizacion) || (subtotal + itbisTotal);

  // Paper size config
  const is4inch = paperSize === '4inch';
  const pageWidth = is4inch ? '101.6mm' : '80mm';
  const bodyWidth = is4inch ? '88mm' : '72mm';
  const bodyPadding = is4inch ? '2mm 4mm' : '2mm 4mm';
  const baseFontSize = is4inch ? '15px' : '14px';
  const headerFontSize = is4inch ? '22px' : '20px';
  const subFontSize = is4inch ? '13px' : '13px';
  const totalFontSize = is4inch ? '18px' : '17px';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @page {
          margin: 0;
          size: ${pageWidth} auto;
        }
        html, body {
          margin: 0;
          padding: 0;
          background-color: #fff;
        }
        body {
          width: ${bodyWidth};
          margin: 0 auto;
          padding: ${bodyPadding};
          box-sizing: border-box;
          font-family: Arial, Helvetica, sans-serif;
          font-size: ${baseFontSize};
          font-weight: 700;
          line-height: 1.2;
          color: #000;
          letter-spacing: 0.2px;
          -webkit-print-color-adjust: exact;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .header { margin-bottom: 4px; }
        .header h1 { font-size: ${headerFontSize}; margin: 0; font-weight: 900; letter-spacing: 0.5px; }
        .header p { margin: 1px 0; font-size: ${subFontSize}; color: #000; }
        
        .section { margin-bottom: 4px; }
        .row { display: flex; justify-content: space-between; margin-bottom: 1px; font-size: 14px; }
        .client-info-row { display: flex; gap: 6px; margin-bottom: 1px; font-size: 14px; }
        .separator { border-top: 1px dashed #000; margin: 4px 0; height: 0; }
        
        .num { font-family: Arial, Helvetica, sans-serif; }
        
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th { text-align: left; padding-bottom: 2px; font-size: ${baseFontSize}; border-bottom: 1px solid #000; }
        .item-name { text-transform: uppercase; padding-top: 4px; font-size: ${baseFontSize}; word-wrap: break-word; line-height: 1.2; }
        .item-details { padding-bottom: 2px; font-size: 15px; }
        .item-details td.text-right { font-family: Arial, Helvetica, sans-serif; }
        
        .totals-container { margin-top: 4px; padding-top: 2px; }
        .totals-row { display: flex; justify-content: flex-end; margin-bottom: 1px; font-size: 14px; }
        .totals-label { text-align: right; padding-right: 6px; flex: 1; }
        .totals-value { text-align: right; width: 80px; font-variant-numeric: tabular-nums; font-family: Arial, Helvetica, sans-serif; }
        
        .grand-total { font-size: ${totalFontSize}; margin-top: 2px; padding-top: 4px; font-weight: 900; border-top: 2px solid #000; }
        .footer { margin-top: 8px; font-size: ${subFontSize}; line-height: 1.2; padding-top: 4px; }
      </style>
    </head>
    <body onload="window.print()">
      <div class="header text-center">
        ${getHeaderHTML()}
        <div style="margin-top: 4px; font-size: 16px; letter-spacing: 1px;">COTIZACION</div>
      </div>

      <div class="section">
        <div class="row">
          <span>Numero : <span class="num">${numeroStr}</span></span>
          <span class="text-right num">${horaStr}</span>
        </div>
        <div class="row">
          <span>Fecha  : <span class="num">${fechaStr}</span></span>
        </div>
        <div class="row">
          <span>Vigencia : 15 dias</span>
        </div>

        <div class="client-info-row" style="margin-top: 4px;">
          <span>Cliente :</span>
          <span>${(cotizacion.cliente_nombre || 'CLIENTE GENERICO').toUpperCase()}</span>
        </div>
        ${cotizacion.vendedor_nombre ? `
        <div class="client-info-row">
          <span>Vendedor : ${cotizacion.vendedor_nombre}</span>
        </div>
        ` : ''}
      </div>

      <div class="separator"></div>
      <div style="font-size: ${subFontSize}; font-weight: normal; margin-bottom: 2px;">Descripcion de la Mercancia</div>
      <table>
        <thead>
          <tr>
            <th width="22%">CANT.</th>
            <th width="28%" class="text-right">PRECIO</th>
            <th width="20%" class="text-right">ITBIS</th>
            <th width="30%" class="text-right">MONTO</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows.map(item => `
            <tr>
              <td colspan="4" class="item-name" style="padding-top: 4px;">${(item.descripcion || '').toUpperCase()}</td>
            </tr>
            <tr class="item-details">
              <td width="22%" style="white-space: nowrap;">${item.cantidad} UND</td>
              <td width="28%" class="text-right">${formatCurrency(item.precio_unitario)}</td>
              <td width="20%" class="text-right">${formatCurrency(item._itbis)}</td>
              <td width="30%" class="text-right">${formatCurrency(item.importe)}${(item._itbis || 0) < 0.01 ? ' E' : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="separator"></div>

      <div class="totals-container">
        <div class="totals-row">
          <div class="totals-label">Sub-Total :</div>
          <div class="totals-value">${formatCurrency(subtotal)}</div>
        </div>
        <div class="totals-row">
          <div class="totals-label">Descuento en Items :</div>
          <div class="totals-value">${formatCurrency(descuentoItems)}</div>
        </div>
        <div class="totals-row">
          <div class="totals-label">Otros Descuento :</div>
          <div class="totals-value">${formatCurrency(0)}</div>
        </div>
        <div class="totals-row">
          <div class="totals-label">Recargo :</div>
          <div class="totals-value">${formatCurrency(0)}</div>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <div style="width: 70px; font-weight: normal; font-size: 12px; margin-top: 2px;">
            Valores en<br/>DOP
          </div>
          <div style="flex-grow: 1;">
            <div class="totals-row">
              <div class="totals-label">ITBIS :</div>
              <div class="totals-value">${formatCurrency(itbisTotal)}</div>
            </div>
            
            <div class="row" style="justify-content: flex-end; margin: 2px 0;">
              <span style="letter-spacing: -1px;">==========</span>
            </div>

            <div class="totals-row grand-total">
              <div class="totals-label">TOTAL :</div>
              <div class="totals-value">${formatCurrency(total)}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="separator"></div>

      <div class="footer text-center">
        <p style="font-weight: bold; margin-bottom: 3px;">*** COTIZACION — NO ES FACTURA ***</p>
        <p>Los precios estan sujetos a cambios sin previo aviso.</p>
        <p style="margin-top: 5px;">${_empresaConfig.nombre}</p>
      </div>
    </body>
    </html>
  `;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  iframe.contentWindow.document.open();
  iframe.contentWindow.document.write(html);
  iframe.contentWindow.document.close();
  setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 3000);
};

// ═══════════════════════════════════════════════════════════
// Cotización Magna (ELVIDO MANUEL CAMINERO MORLA)
// ═══════════════════════════════════════════════════════════

export const printCotizacionMagnaPOS = (cotizacion, paperSize = '4inch', lines = []) => {
  const fechaStr = cotizacion.fecha
    ? formatInTimeZone(new Date(cotizacion.fecha), 'd/L/yyyy')
    : 'N/A';
  const horaStr = formatInTimeZone(new Date(), 'hh:mm a');
  const numeroStr = `MAG-${String(cotizacion.numero || 'N/A').padStart(7, '0')}`;

  const subtotal = parseFloat(cotizacion.subtotal) || 0;
  const itbis = parseFloat(cotizacion.itbis) || 0;
  const total = parseFloat(cotizacion.total) || 0;

  // ── Letter size (8.5 x 11) ──
  if (paperSize === 'letter') {
    return printCotizacionMagnaLetter(cotizacion, { fechaStr, horaStr, numeroStr, subtotal, itbis, total }, lines);
  }

  const is4inch = paperSize === '4inch';
  const pageWidth = is4inch ? '101.6mm' : '80mm';
  const bodyWidth = is4inch ? '88mm' : '72mm';
  const baseFontSize = is4inch ? '15px' : '14px';
  const headerFontSize = is4inch ? '20px' : '18px';
  const subFontSize = is4inch ? '13px' : '12px';
  const totalFontSize = is4inch ? '18px' : '17px';

  // Generate lines HTML for POS
  const linesHtml = lines.map((l, i) => {
    const rep = parseFloat(l.valor_repuestos) || 0;
    const mo = parseFloat(l.valor_mano_obra) || 0;
    return `
      ${i > 0 ? '<div class="separator"></div>' : ''}
      <div class="section">
        <div class="row"><span style="font-weight:900">No. Orden: ${l.numero_orden || 'N/A'}</span></div>
        <div class="row"><span>Chasis: ${l.chasis || 'N/A'}</span></div>
        <div class="row"><span>Repuestos:</span><span class="num">${formatCurrency(rep)}</span></div>
        <div class="row"><span>Mano Obra:</span><span class="num">${formatCurrency(mo)}</span></div>
      </div>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @page {
          margin: 0;
          size: ${pageWidth} auto;
        }
        html, body {
          margin: 0;
          padding: 0;
          background-color: #fff;
        }
        body {
          width: ${bodyWidth};
          margin: 0 auto;
          padding: 2mm 4mm;
          box-sizing: border-box;
          font-family: Arial, Helvetica, sans-serif;
          font-size: ${baseFontSize};
          font-weight: 700;
          line-height: 1.2;
          color: #000;
          letter-spacing: 0.2px;
          -webkit-print-color-adjust: exact;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .header { margin-bottom: 4px; }
        .header h1 { font-size: ${headerFontSize}; margin: 0; font-weight: 900; letter-spacing: 0.5px; }
        .header p { margin: 1px 0; font-size: ${subFontSize}; color: #000; }

        .section { margin-bottom: 4px; }
        .row { display: flex; justify-content: space-between; margin-bottom: 1px; font-size: 14px; }
        .separator { border-top: 1px dashed #000; margin: 4px 0; height: 0; }
        .num { font-family: Arial, Helvetica, sans-serif; }

        .totals-container { margin-top: 4px; padding-top: 2px; }
        .totals-row { display: flex; justify-content: flex-end; margin-bottom: 1px; font-size: 14px; }
        .totals-label { text-align: right; padding-right: 6px; flex: 1; }
        .totals-value { text-align: right; width: 100px; font-variant-numeric: tabular-nums; font-family: Arial, Helvetica, sans-serif; }

        .grand-total { font-size: ${totalFontSize}; margin-top: 2px; padding-top: 4px; font-weight: 900; border-top: 2px solid #000; }
        .footer { margin-top: 8px; font-size: ${subFontSize}; line-height: 1.2; padding-top: 4px; }
      </style>
    </head>
    <body onload="window.print()">
      <div class="header text-center">
        <h1>ELVIDO MANUEL CAMINERO MORLA</h1>
        <p class="num" style="margin-top: 4px; font-weight: bold;">RNC: 028-0099156-0</p>
        <div style="margin-top: 6px; font-size: 16px; letter-spacing: 1px;">COTIZACIÓN</div>
      </div>

      <div class="separator"></div>

      <div class="section text-center" style="font-size: ${subFontSize}; line-height: 1.3;">
        <div style="font-weight: 900;">Cliente: Magna Motors S.A</div>
        <div>Av. J.K. Kennedy Esq. Abraham Lincoln, edificio magna</div>
        <div>Rnc: 101055571</div>
        <div>Tel: 809-544-1500</div>
      </div>

      <div class="separator"></div>

      <div class="section">
        <div class="row">
          <span>Numero : <span class="num">${numeroStr}</span></span>
          <span class="text-right num">${horaStr}</span>
        </div>
        <div class="row">
          <span>Fecha  : <span class="num">${fechaStr}</span></span>
        </div>
      </div>

      <div class="separator"></div>

      ${linesHtml}

      <div class="separator" style="border-top: 2px solid #000;"></div>

      <div class="totals-container">
        <div class="totals-row">
          <div class="totals-label">Sub-Total :</div>
          <div class="totals-value">${formatCurrency(subtotal)}</div>
        </div>
        <div class="totals-row">
          <div class="totals-label">ITBIS (18%) :</div>
          <div class="totals-value">${formatCurrency(itbis)}</div>
        </div>

        <div class="row" style="justify-content: flex-end; margin: 2px 0;">
          <span style="letter-spacing: -1px;">==========</span>
        </div>

        <div class="totals-row grand-total">
          <div class="totals-label">TOTAL :</div>
          <div class="totals-value">${formatCurrency(total)}</div>
        </div>
      </div>

      <div class="separator"></div>

      ${cotizacion.notas ? `
        <div class="section" style="font-size: 12px; font-weight: normal;">
          <span style="font-weight: bold;">Notas:</span> ${cotizacion.notas}
        </div>
        <div class="separator"></div>
      ` : ''}

      <div class="footer text-center">
        <p style="font-weight: bold; margin-bottom: 3px;">*** COTIZACIÓN — NO ES FACTURA ***</p>
        <p>Los precios están sujetos a cambios sin previo aviso.</p>
        <p style="margin-top: 5px;">ELVIDO MANUEL CAMINERO MORLA</p>
      </div>
    </body>
    </html>
  `;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  iframe.contentWindow.document.open();
  iframe.contentWindow.document.write(html);
  iframe.contentWindow.document.close();
  setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 3000);
};

// ── Helper: Letter-size (8.5 x 11) print for Cotización Magna ──
const printCotizacionMagnaLetter = (cotizacion, vals, lines = []) => {
  const { fechaStr, horaStr, numeroStr, subtotal, itbis, total } = vals;

  // Generate table rows HTML
  const rowsHtml = lines.map(l => {
    const rep = parseFloat(l.valor_repuestos) || 0;
    const mo = parseFloat(l.valor_mano_obra) || 0;
    return `
      <tr>
        <td>${l.numero_orden || 'N/A'}</td>
        <td>${l.chasis || 'N/A'}</td>
        <td>${formatCurrency(rep)}</td>
        <td>${formatCurrency(mo)}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @page {
          margin: 15mm 20mm;
          size: letter portrait;
        }
        html, body {
          margin: 0; padding: 0;
          background: #fff;
        }
        body {
          font-family: Arial, Helvetica, sans-serif;
          font-size: 14px;
          color: #000;
          line-height: 1.4;
          padding: 0 10mm;
        }
        .text-center { text-align: center; }
        .text-right  { text-align: right; }

        .header {
          text-align: center;
          border-bottom: 3px double #000;
          padding-bottom: 12px;
          margin-bottom: 20px;
        }
        .header h1 {
          font-size: 26px; margin: 0; font-weight: 900;
          letter-spacing: 1px;
        }
        .header h2 {
          font-size: 20px; margin: 4px 0 0 0; font-weight: 800;
        }
        .header .rnc {
          font-size: 14px; margin-top: 6px; font-weight: 700;
        }
        .header .doc-type {
          font-size: 18px; margin-top: 10px;
          letter-spacing: 2px; font-weight: 700;
          text-decoration: underline;
        }

        .meta-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 16px;
          font-size: 13px;
        }
        .meta-row .label { font-weight: 600; color: #333; }
        .meta-row .value { font-weight: 700; }

        .separator { border-top: 1px solid #000; margin: 16px 0; }

        /* ── Main data table with column headers ── */
        .data-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 10px;
        }
        .data-table th {
          background: #f0f0f0;
          border: 1px solid #000;
          padding: 10px 12px;
          font-size: 13px;
          font-weight: 800;
          text-align: center;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .data-table td {
          border: 1px solid #000;
          padding: 10px 12px;
          font-size: 14px;
          font-weight: 700;
          text-align: center;
          font-variant-numeric: tabular-nums;
        }

        /* ── Totals section ── */
        .totals-section {
          width: 50%;
          margin-left: auto;
          margin-top: 24px;
        }
        .totals-row {
          display: flex;
          justify-content: space-between;
          padding: 5px 0;
          font-size: 14px;
        }
        .totals-row .label { font-weight: 600; }
        .totals-row .value { font-weight: 700; font-variant-numeric: tabular-nums; }
        .totals-row.grand {
          border-top: 2px solid #000;
          margin-top: 6px;
          padding-top: 10px;
          font-size: 18px;
          font-weight: 900;
        }

        .notas {
          margin-top: 20px;
          padding: 10px;
          border: 1px solid #ccc;
          border-radius: 4px;
          font-size: 13px;
          background: #fafafa;
        }

        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 12px;
          color: #555;
          border-top: 1px dashed #999;
          padding-top: 12px;
        }
        .footer p { margin: 3px 0; }

        .signature-area {
          display: flex;
          justify-content: space-between;
          margin-top: 50px;
          padding: 0 40px;
        }
        .signature-line {
          width: 200px;
          border-top: 1px solid #000;
          text-align: center;
          padding-top: 4px;
          font-size: 12px;
        }
      </style>
    </head>
    <body onload="window.print()">
      <div class="header">
        <h1>ELVIDO MANUEL CAMINERO MORLA</h1>
        <div class="rnc">RNC: 028-0099156-0</div>
        <div class="doc-type">COTIZACIÓN</div>
        <div style="margin-top: 10px; font-size: 13px; line-height: 1.4;">
          <div style="font-weight: 800;">Cliente: Magna Motors S.A</div>
          <div>Av. J.K. Kennedy Esq. Abraham Lincoln, edificio magna</div>
          <div>Rnc: 101055571 &nbsp;|&nbsp; Tel: 809-544-1500</div>
        </div>
      </div>

      <div class="meta-row">
        <div><span class="label">Número:</span> <span class="value">${numeroStr}</span></div>
        <div><span class="label">Fecha:</span> <span class="value">${fechaStr}  ${horaStr}</span></div>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th>No. Orden</th>
            <th>Chasis</th>
            <th>Valor Repuestos</th>
            <th>Valor Mano de Obra</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="totals-section">
        <div class="totals-row">
          <span class="label">Sub-Total:</span>
          <span class="value">${formatCurrency(subtotal)}</span>
        </div>
        <div class="totals-row">
          <span class="label">ITBIS (18%):</span>
          <span class="value">${formatCurrency(itbis)}</span>
        </div>
        <div class="totals-row grand">
          <span class="label">TOTAL:</span>
          <span class="value">${formatCurrency(total)}</span>
        </div>
      </div>

      ${cotizacion.notas ? `
        <div class="notas">
          <strong>Notas:</strong> ${cotizacion.notas}
        </div>
      ` : ''}

      <div class="signature-area">
        <div class="signature-line">Elaborado por</div>
        <div class="signature-line">Aprobado por</div>
      </div>

      <div class="footer">
        <p style="font-weight: bold;">*** COTIZACIÓN — NO ES FACTURA ***</p>
        <p>Los precios están sujetos a cambios sin previo aviso.</p>
        <p style="margin-top: 8px; font-weight: 600;">ELVIDO MANUEL CAMINERO MORLA</p>
      </div>
    </body>
    </html>
  `;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  iframe.contentWindow.document.open();
  iframe.contentWindow.document.write(html);
  iframe.contentWindow.document.close();
  setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 3000);
};

// ═══════════════════════════════════════════════════════════
// QZ Tray ESC/POS Printing (native Star SP100 output)
// ═══════════════════════════════════════════════════════════

const RECEIPT_PRINTER_NAMES = [
  "Star TSP100 Cutter (TSP143) (Copiar 4)",
  "Star TSP100 Cutter (TSP143) (Copia 4)",
  "TSP143 (Copia 4)",
  "TSP143 (Copiar 4)",
  "Star TSP143",
  "TSP143",
];

/**
 * Print factura via QZ Tray (raw ESC/POS → Star SP100 native font).
 * Falls back to browser print on error.
 */
export const printFacturaQZ = async (factura) => {
  try {
    const { buildFacturaEscPos } = await import('@/services/escposReceipt');
    const { qzFindReceiptPrinter, qzPrintRawEscPos } = await import('@/services/qzTrayService');

    const printerName = await qzFindReceiptPrinter(RECEIPT_PRINTER_NAMES);
    const escpos = buildFacturaEscPos(factura);

    console.log("[QZ-POS] Imprimiendo factura via ESC/POS...");
    await qzPrintRawEscPos(printerName, escpos);
    console.log("[QZ-POS] Factura enviada exitosamente.");
    return true;
  } catch (err) {
    console.error("[QZ-POS] Error al imprimir factura:", err);
    throw err;
  }
};

/**
 * Print cotización via QZ Tray (raw ESC/POS → Star SP100 native font).
 */
export const printCotizacionQZ = async (cotizacion, detalles) => {
  try {
    const { buildCotizacionEscPos } = await import('@/services/escposReceipt');
    const { qzFindReceiptPrinter, qzPrintRawEscPos } = await import('@/services/qzTrayService');

    const printerName = await qzFindReceiptPrinter(RECEIPT_PRINTER_NAMES);
    const escpos = buildCotizacionEscPos(cotizacion, detalles);

    console.log("[QZ-POS] Imprimiendo cotización via ESC/POS...");
    await qzPrintRawEscPos(printerName, escpos);
    console.log("[QZ-POS] Cotización enviada exitosamente.");
    return true;
  } catch (err) {
    console.error("[QZ-POS] Error al imprimir cotización:", err);
    throw err;
  }
};

export const printCompraPOS = (compra, suplidor, detalles, paperSize = '4inch') => {
  const fechaStr = compra.fecha
    ? formatInTimeZone(new Date(compra.fecha), 'd/L/yyyy')
    : 'N/A';
  const horaStr = formatInTimeZone(new Date(), 'hh:mm a');
  const numeroStr = `OC-${String(compra.numero || 'N/A').padStart(7, '0')}`;

  // Paper size config
  const is4inch = paperSize === '4inch';
  const pageWidth = is4inch ? '101.6mm' : '80mm';
  const bodyWidth = is4inch ? '88mm' : '72mm';
  const bodyPadding = is4inch ? '2mm 4mm' : '2mm 4mm';
  const baseFontSize = is4inch ? '15px' : '14px';
  const headerFontSize = is4inch ? '22px' : '20px';
  const subFontSize = is4inch ? '13px' : '12px';
  const totalFontSize = is4inch ? '18px' : '17px';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @page {
          margin: 0;
          size: ${pageWidth} auto;
        }
        html, body {
          margin: 0;
          padding: 0;
          background-color: #fff;
        }
        body {
          width: ${bodyWidth};
          margin: 0 auto;
          padding: ${bodyPadding};
          box-sizing: border-box;
          font-family: Arial, Helvetica, sans-serif;
          font-size: ${baseFontSize};
          font-weight: 700;
          line-height: 1.2;
          color: #000;
          letter-spacing: 0.2px;
          -webkit-print-color-adjust: exact;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .header { margin-bottom: 4px; }
        .header h1 { font-size: ${headerFontSize}; margin: 0; font-weight: 900; letter-spacing: 0.5px; }
        .header p { margin: 1px 0; font-size: ${subFontSize}; color: #000; }
        
        .section { margin-bottom: 4px; }
        .row { display: flex; justify-content: space-between; margin-bottom: 1px; font-size: 14px; }
        .client-info-row { display: flex; gap: 6px; margin-bottom: 1px; font-size: 14px; }
        .separator { border-top: 1px dashed #000; margin: 4px 0; height: 0; }
        
        .num { font-family: Arial, Helvetica, sans-serif; }
        
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th { text-align: left; padding-bottom: 2px; font-size: ${baseFontSize}; border-bottom: 1px solid #000; }
        .item-name { text-transform: uppercase; padding-top: 4px; font-size: ${baseFontSize}; word-wrap: break-word; line-height: 1.2; }
        .item-details { padding-bottom: 2px; font-size: 15px; }
        .item-details td.text-right { font-family: Arial, Helvetica, sans-serif; }
        
        .totals-container { margin-top: 4px; padding-top: 2px; }
        .totals-row { display: flex; justify-content: flex-end; margin-bottom: 1px; font-size: 14px; }
        .totals-label { text-align: right; padding-right: 6px; flex: 1; }
        .totals-value { text-align: right; width: 100px; font-variant-numeric: tabular-nums; font-family: Arial, Helvetica, sans-serif; }
        
        .grand-total { font-size: ${totalFontSize}; margin-top: 2px; padding-top: 4px; font-weight: 900; border-top: 2px solid #000; }
        .footer { margin-top: 8px; font-size: ${subFontSize}; line-height: 1.2; padding-top: 4px; }
      </style>
    </head>
    <body onload="window.print()">
      <div class="header text-center">
        ${getHeaderHTML()}
        <div style="margin-top: 4px; font-size: 16px; letter-spacing: 1px;">COMPRA DE MERCANCIA</div>
      </div>

      <div class="section">
        <div class="row">
          <span>Numero : <span class="num">${numeroStr}</span></span>
          <span class="text-right num">${horaStr}</span>
        </div>
        <div class="row">
          <span>Fecha  : <span class="num">${fechaStr}</span></span>
        </div>
        <div class="client-info-row" style="margin-top: 4px;">
          <span>Suplidor:</span>
          <span>${(suplidor?.nombre || 'N/A').toUpperCase()}</span>
        </div>
        <div class="client-info-row">
          <span>NCF: ${compra.ncf || 'N/A'}</span>
        </div>
        <div class="client-info-row">
          <span>REF: ${compra.referencia || 'N/A'}</span>
        </div>
      </div>

      <div class="separator"></div>
      <table>
        <thead>
          <tr>
            <th width="20%">CANT.</th>
            <th width="35%" class="text-right">COSTO</th>
            <th width="15%" class="text-right">DESC</th>
            <th width="30%" class="text-right">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${detalles.map(item => `
            <tr>
              <td colspan="4" class="item-name" style="padding-top: 4px;">${(item.descripcion || '').toUpperCase()}</td>
            </tr>
            <tr class="item-details">
              <td width="20%">${item.cantidad} ${item.unidad || 'UND'}</td>
              <td width="35%" class="text-right">${formatCurrency(item.costo_unitario)}</td>
              <td width="15%" class="text-right">${(item.descuento_pct || 0)}%</td>
              <td width="30%" class="text-right">${formatCurrency(item.importe)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="separator"></div>

      <div class="totals-container">
        <div class="totals-row">
          <div class="totals-label">Exento :</div>
          <div class="totals-value">${formatCurrency(compra.total_exento || 0)}</div>
        </div>
        <div class="totals-row">
          <div class="totals-label">Gravado :</div>
          <div class="totals-value">${formatCurrency(compra.total_gravado || 0)}</div>
        </div>
        <div class="totals-row">
          <div class="totals-label">ITBIS :</div>
          <div class="totals-value">${formatCurrency(compra.itbis_total || 0)}</div>
        </div>
        
        <div class="row" style="justify-content: flex-end; margin: 2px 0;">
          <span style="letter-spacing: -1px;">==========</span>
        </div>

        <div class="totals-row grand-total">
          <div class="totals-label">TOTAL :</div>
          <div class="totals-value">${formatCurrency(compra.total_compra || 0)}</div>
        </div>
      </div>

      <div class="separator"></div>

      <div class="footer text-center">
        <p style="font-weight: bold; margin-bottom: 3px;">*** COMPRA DE MERCANCIA ***</p>
        <p>${_empresaConfig.nombre}</p>
      </div>
    </body>
    </html>
  `;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  iframe.contentWindow.document.open();
  iframe.contentWindow.document.write(html);
  iframe.contentWindow.document.close();
  setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 3000);
};

export const printOrdenCompraPOS = (orden, suplidor, detalles, paperSize = '4inch') => {
  const fechaStr = orden.fecha_orden
    ? formatInTimeZone(new Date(orden.fecha_orden), 'd/L/yyyy')
    : 'N/A';
  const vencimientoStr = orden.fecha_vencimiento
    ? formatInTimeZone(new Date(orden.fecha_vencimiento), 'd/L/yyyy')
    : 'N/A';
  const horaStr = formatInTimeZone(new Date(), 'hh:mm a');
  const numeroStr = String(orden.numero || 'N/A').padStart(7, '0');

  // Paper size config
  const is4inch = paperSize === '4inch';
  const pageWidth = is4inch ? '101.6mm' : '80mm';
  const bodyWidth = is4inch ? '88mm' : '72mm';
  const bodyPadding = is4inch ? '2mm 4mm' : '2mm 4mm';
  const baseFontSize = is4inch ? '15px' : '14px';
  const headerFontSize = is4inch ? '22px' : '20px';
  const subFontSize = is4inch ? '13px' : '12px';
  const totalFontSize = is4inch ? '18px' : '17px';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @page {
          margin: 0;
          size: ${pageWidth} auto;
        }
        html, body {
          margin: 0;
          padding: 0;
          background-color: #fff;
        }
        body {
          width: ${bodyWidth};
          margin: 0 auto;
          padding: ${bodyPadding};
          box-sizing: border-box;
          font-family: Arial, Helvetica, sans-serif;
          font-size: ${baseFontSize};
          font-weight: 700;
          line-height: 1.2;
          color: #000;
          letter-spacing: 0.2px;
          -webkit-print-color-adjust: exact;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .header { margin-bottom: 4px; }
        .header h1 { font-size: ${headerFontSize}; margin: 0; font-weight: 900; letter-spacing: 0.5px; }
        .header p { margin: 1px 0; font-size: ${subFontSize}; color: #000; }
        
        .section { margin-bottom: 4px; }
        .row { display: flex; justify-content: space-between; margin-bottom: 1px; font-size: 14px; }
        .client-info-row { display: flex; gap: 6px; margin-bottom: 1px; font-size: 14px; }
        .separator { border-top: 1px dashed #000; margin: 4px 0; height: 0; }
        
        .num { font-family: Arial, Helvetica, sans-serif; }
        
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th { text-align: left; padding-bottom: 2px; font-size: ${baseFontSize}; border-bottom: 1px solid #000; }
        .item-name { text-transform: uppercase; padding-top: 4px; font-size: ${baseFontSize}; word-wrap: break-word; line-height: 1.2; }
        .item-details { padding-bottom: 2px; font-size: 15px; }
        .item-details td.text-right { font-family: Arial, Helvetica, sans-serif; }
        
        .totals-container { margin-top: 4px; padding-top: 2px; }
        .totals-row { display: flex; justify-content: flex-end; margin-bottom: 1px; font-size: 14px; }
        .totals-label { text-align: right; padding-right: 6px; flex: 1; }
        .totals-value { text-align: right; width: 100px; font-variant-numeric: tabular-nums; font-family: Arial, Helvetica, sans-serif; }
        
        .grand-total { font-size: ${totalFontSize}; margin-top: 2px; padding-top: 4px; font-weight: 900; border-top: 2px solid #000; }
        .footer { margin-top: 8px; font-size: ${subFontSize}; line-height: 1.2; padding-top: 4px; }
      </style>
    </head>
    <body onload="window.print()">
      <div class="header text-center">
        ${getHeaderHTML()}
        <div style="margin-top: 4px; font-size: 16px; letter-spacing: 1px;">ORDEN DE COMPRA</div>
      </div>

      <div class="section">
        <div class="row">
          <span>Numero : <span class="num">${numeroStr}</span></span>
          <span class="text-right num">${horaStr}</span>
        </div>
        <div class="row">
          <span>Fecha  : <span class="num">${fechaStr}</span></span>
        </div>
        <div class="row">
          <span>Vence  : <span class="num">${vencimientoStr}</span></span>
        </div>
        <div class="client-info-row" style="margin-top: 4px;">
          <span>Suplidor:</span>
          <span>${(suplidor?.nombre || 'N/A').toUpperCase()}</span>
        </div>
        <div class="client-info-row">
          <span>RNC: ${suplidor?.rnc || 'N/A'}</span>
        </div>
      </div>

      <div class="separator"></div>
      <table>
        <thead>
          <tr>
            <th width="20%">CANT.</th>
            <th width="35%" class="text-right">PRECIO</th>
            <th width="15%" class="text-right">DESC</th>
            <th width="30%" class="text-right">IMPORTE</th>
          </tr>
        </thead>
        <tbody>
          ${detalles.map(item => `
            <tr>
              <td colspan="4" class="item-name" style="padding-top: 4px;">${(item.descripcion || '').toUpperCase()}</td>
            </tr>
            <tr class="item-details">
              <td width="20%">${item.cantidad} ${item.unidad || 'UND'}</td>
              <td width="35%" class="text-right">${formatCurrency(item.precio)}</td>
              <td width="15%" class="text-right">${item.descuento_pct || 0}%</td>
              <td width="30%" class="text-right">${formatCurrency(item.importe)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="separator"></div>

      <div class="totals-container">
        <div class="totals-row">
          <div class="totals-label">Exento :</div>
          <div class="totals-value">${formatCurrency(orden.total_exento || 0)}</div>
        </div>
        <div class="totals-row">
          <div class="totals-label">Gravado :</div>
          <div class="totals-value">${formatCurrency(orden.total_gravado || 0)}</div>
        </div>
        <div class="totals-row">
          <div class="totals-label">Descuento :</div>
          <div class="totals-value">${formatCurrency(orden.descuento_total || 0)}</div>
        </div>
        <div class="totals-row">
          <div class="totals-label">ITBIS :</div>
          <div class="totals-value">${formatCurrency(orden.itbis_total || 0)}</div>
        </div>
        
        <div class="row" style="justify-content: flex-end; margin: 2px 0;">
          <span style="letter-spacing: -1px;">==========</span>
        </div>

        <div class="totals-row grand-total">
          <div class="totals-label">TOTAL :</div>
          <div class="totals-value">${formatCurrency(orden.total_orden || 0)}</div>
        </div>
      </div>

      <div class="separator"></div>

      <div class="footer text-center">
        <p style="font-weight: bold; margin-bottom: 3px;">*** ORDEN DE COMPRA ***</p>
        <p>${_empresaConfig.nombre}</p>
      </div>
    </body>
    </html>
  `;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  iframe.contentWindow.document.open();
  iframe.contentWindow.document.write(html);
  iframe.contentWindow.document.close();
  setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 3000);
};
