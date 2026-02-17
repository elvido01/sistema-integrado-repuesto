import { formatInTimeZone } from './dateUtils';

const formatCurrency = (value) => {
  return (parseFloat(value) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

export const printFacturaPOS = (factura) => {
  const details = factura.facturas_detalle || [];
  const client = factura.clientes || {};
  const seller = factura.perfiles || {};
  const fechaStr = formatInTimeZone(new Date(factura.fecha), 'd/L/yyyy');
  const horaStr = formatInTimeZone(new Date(factura.fecha), 'HH:mm');
  const numeroStr = `FT-${String(factura.numero || 'N/A').padStart(7, '0')}`;

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
          padding: 2mm 3mm; /* Slightly more space */
          box-sizing: border-box;
          font-family: Verdana, Tahoma, Geneva, sans-serif;
          font-size: 11px;
          line-height: 1.2;
          color: #000; /* Solid black for thermal contrast */
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
        <h1 class="bold">REPUESTOS MORLA</h1>
        <p>Av. Duarte, esq. Baldemiro Rijo</p>
        <p>Higuey, Rep. Dom.</p>
        <p>809-390-5965</p>
        <div style="margin-top: 4px;" class="bold">FACTURA</div>
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
          <span>Vence  : <span class="bold">${factura.forma_pago === 'CREDITO' ? `Crédito ${factura.dias_credito} días` : 'CONTADO'}</span></span>
        </div>

        <div class="client-info-row" style="margin-top: 4px;">
          <span class="bold">Cliente :</span>
          <span class="bold">
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
      <div style="font-size: 10px; font-weight: bold; margin-bottom: 4px;">Descripcion de la Mercancia</div>
      <table>
        <thead>
          <tr>
            <th width="15%">CANT.</th>
            <th width="35%" class="text-right">PRECIO</th>
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
              <td width="15%">${item.cantidad} UND</td>
              <td width="35%" class="text-right">${formatCurrency(item.precio)}</td>
              <td width="20%" class="text-right">${formatCurrency(item.itbis)}</td>
              <td width="30%" class="text-right">${formatCurrency(item.importe)}${(item.itbis || 0) < 0.01 ? ' E' : ''}</td>
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
            <div class="totals-row">
              <div class="totals-label">ITBIS :</div>
              <div class="totals-value">${formatCurrency(factura.itbis)}</div>
            </div>
            
            <div class="row" style="justify-content: flex-end; margin: 4px 0;">
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
        <p>Vendedor : ${factura.vendedor || 'REPUESTOS MORLA'}</p>
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
  const horaStr = formatInTimeZone(new Date(), 'HH:mm');
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
          font-family: Verdana, Tahoma, Geneva, sans-serif;
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
        <h1 class="bold">REPUESTOS MORLA</h1>
        <p>Av. Duarte, esq. Baldemiro Rijo</p>
        <p>Higuey, Rep. Dom.</p>
        <p>809-390-5965</p>
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
        <p>Vendedor : REPUESTOS MORLA</p>
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
  const horaStr = formatInTimeZone(new Date(), 'HH:mm');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @page { margin: 0; size: 80mm auto; }
        body {
          width: 78mm; margin: 0 auto; padding: 2mm 3mm;
          font-family: Verdana, Tahoma, Geneva, sans-serif; font-size: 11px; line-height: 1.2; color: #000;
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
        <h1 class="bold">REPUESTOS MORLA</h1>
        <p>Av. Duarte, esq. Baldemiro Rijo, Higuey</p>
        <p>Tel: 809-390-5965</p>
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
        <p>Le Atendio: REPUESTOS MORLA</p>
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
  const horaStr = formatInTimeZone(new Date(), 'HH:mm');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @page { margin: 0; size: 101.6mm auto; }
        body {
          width: 98mm; margin: 0 auto; padding: 3mm 4mm;
          font-family: Verdana, Tahoma, Geneva, sans-serif; font-size: 12px; line-height: 1.3; color: #000;
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
        <h1 class="bold">REPUESTOS MORLA</h1>
        <p>Av. Duarte, esq. Baldemiro Rijo, Higuey</p>
        <p>Tel: 809-390-5965</p>
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
  const horaStr = formatInTimeZone(new Date(), 'HH:mm');
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
  const bodyWidth = is4inch ? '98mm' : '78mm';
  const bodyPadding = is4inch ? '3mm 4mm' : '2mm 3mm';
  const baseFontSize = is4inch ? '12px' : '11px';
  const headerFontSize = is4inch ? '18px' : '15px';
  const subFontSize = is4inch ? '11px' : '10px';
  const totalFontSize = is4inch ? '15px' : '13px';

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
          font-family: Verdana, Tahoma, Geneva, sans-serif;
          font-size: ${baseFontSize};
          line-height: 1.2;
          color: #000;
          -webkit-print-color-adjust: exact;
        }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .bold { font-weight: bold; }
        .header { margin-bottom: 8px; }
        .header h1 { font-size: ${headerFontSize}; margin: 0; font-weight: 800; }
        .header p { margin: 1px 0; font-size: ${subFontSize}; color: #333; }
        
        .section { margin-bottom: 8px; }
        .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        .client-info-row { display: flex; gap: 4px; margin-bottom: 2px; }
        .separator { border-top: 1px dashed #000; margin: 4px 0; height: 0; }
        
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th { text-align: left; font-weight: bold; padding-bottom: 2px; font-size: ${baseFontSize}; }
        .item-name { font-weight: bold; text-transform: uppercase; padding-top: 4px; font-size: ${baseFontSize}; word-wrap: break-word; }
        .item-details { padding-bottom: 4px; font-size: ${subFontSize}; }
        
        .totals-container { margin-top: 8px; padding-top: 4px; }
        .totals-row { display: flex; justify-content: flex-end; margin-bottom: 2px; }
        .totals-label { text-align: right; padding-right: 8px; flex: 1; }
        .totals-value { text-align: right; width: 100px; }
        
        .grand-total { font-size: ${totalFontSize}; margin-top: 4px; padding-top: 4px; font-weight: bold; }
        .footer { margin-top: 15px; font-size: ${subFontSize}; line-height: 1.2; padding-top: 4px; }
      </style>
    </head>
    <body onload="window.print()">
      <div class="header text-center">
        <h1 class="bold">REPUESTOS MORLA</h1>
        <p>Av. Duarte, esq. Baldemiro Rijo</p>
        <p>Higuey, Rep. Dom.</p>
        <p>809-390-5965</p>
        <div style="margin-top: 4px;" class="bold">COTIZACION</div>
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
          <span>Vigencia : <span class="bold">15 dias</span></span>
        </div>

        <div class="client-info-row" style="margin-top: 4px;">
          <span class="bold">Cliente :</span>
          <span class="bold">${(cotizacion.cliente_nombre || 'CLIENTE GENERICO').toUpperCase()}</span>
        </div>
        ${cotizacion.vendedor_nombre ? `
        <div class="client-info-row">
          <span>Vendedor : ${cotizacion.vendedor_nombre}</span>
        </div>
        ` : ''}
      </div>

      <div class="separator"></div>
      <div style="font-size: ${subFontSize}; font-weight: bold; margin-bottom: 4px;">Descripcion de la Mercancia</div>
      <table>
        <thead>
          <tr>
            <th width="15%">CANT.</th>
            <th width="35%" class="text-right">PRECIO</th>
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
              <td width="15%">${item.cantidad} UND</td>
              <td width="35%" class="text-right">${formatCurrency(item.precio_unitario)}</td>
              <td width="20%" class="text-right">${formatCurrency(item._itbis)}</td>
              <td width="30%" class="text-right">${formatCurrency(item.importe)}${(item._itbis || 0) < 0.01 ? ' E' : ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="separator"></div>

      <div class="totals-container">
        <div style="display: flex; justify-content: space-between;">
          <div style="width: 100px; font-weight: bold; font-size: ${subFontSize}; margin-top: 4px;">
            Valores en<br/>DOP
          </div>
          <div style="flex-grow: 1;">
            <div class="totals-row">
              <div class="totals-label">Sub-Total :</div>
              <div class="totals-value">${formatCurrency(subtotal)}</div>
            </div>
            <div class="totals-row">
              <div class="totals-label">Descuento en Items:</div>
              <div class="totals-value">${formatCurrency(descuentoItems)}</div>
            </div>
            <div class="totals-row">
              <div class="totals-label">Otros Descuento:</div>
              <div class="totals-value">${formatCurrency(0)}</div>
            </div>
            <div class="totals-row">
              <div class="totals-label">Recargo :</div>
              <div class="totals-value">${formatCurrency(0)}</div>
            </div>
            <div class="totals-row">
              <div class="totals-label">ITBIS :</div>
              <div class="totals-value">${formatCurrency(itbisTotal)}</div>
            </div>
            
            <div class="row" style="justify-content: flex-end; margin: 4px 0;">
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
        <p style="margin-top: 5px;">REPUESTOS MORLA</p>
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
