// Lista de Transacciones (hoja carta) — réplica del reporte del sistema
// viejo: encabezado fecha | empresa + título | página, eco de filtros,
// tabla con banda gris y fila de totales.
import { formatInTimeZone } from '@/lib/dateUtils';

const fmt = (v) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

// data: { empresa, filtros: { desde, hasta, clienteNombre, transaccion,
//         numero, descripcion }, transacciones: [...], totales: { debitos, creditos } }
export const printListaTransacciones = ({ empresa, filtros = {}, transacciones = [], totales = {} }) => {
  const hoy = formatInTimeZone(new Date(), 'd/M/yyyy');
  const f = (d) => (d ? formatInTimeZone(d, 'd/M/yyyy') : '');

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8">
      <style>
        @page { size: letter; margin: 10mm 12mm; }
        html, body { margin: 0; padding: 0; background: #fff; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; }
        .head { display: flex; align-items: flex-start; }
        .head .fecha { width: 110px; font-size: 11px; }
        .head .centro { flex: 1; text-align: center; }
        .head .centro h1 { margin: 0; font-size: 16px; letter-spacing: 1px; }
        .head .centro .sub { font-weight: bold; font-size: 12px; }
        .head .pag { width: 110px; text-align: right; font-size: 11px; }
        .filtros { margin: 10px 0 8px; display: flex; }
        .filtros .col { flex: 1; }
        .filtros .kv { display: flex; margin-bottom: 1px; }
        .filtros .k { width: 120px; text-align: right; padding-right: 6px; }
        .filtros .v { font-weight: bold; }
        table { width: 100%; border-collapse: collapse; }
        thead { display: table-header-group; }
        th { background: #d9d9d9; text-align: left; font-size: 10.5px; padding: 3px 4px; font-weight: bold; font-style: italic; }
        th.num, td.num { text-align: right; }
        td { padding: 2px 4px; font-size: 10.5px; vertical-align: top; }
        tr.total td { background: #d9d9d9; font-weight: bold; border-top: 1px solid #999; padding: 4px; }
      </style>
    </head>
    <body onload="window.print()">
      <div class="head">
        <div class="fecha">${hoy}</div>
        <div class="centro">
          <h1>${esc((empresa?.nombre || '')).toUpperCase()}</h1>
          <div class="sub">Lista de Transacciones</div>
        </div>
        <div class="pag">Pagina 1</div>
      </div>

      <div class="filtros">
        <div class="col">
          <div class="kv"><span class="k">Codigo Cliente :</span><span class="v">${esc(filtros.clienteNombre || '')}</span></div>
          <div class="kv"><span class="k">Fecha Desde :</span><span class="v">${f(filtros.desde)}</span></div>
          <div class="kv"><span class="k">Hasta :</span><span class="v">${f(filtros.hasta)}</span></div>
          <div class="kv"><span class="k">Descripcion :</span><span class="v">${esc(filtros.descripcion || '')}</span></div>
        </div>
        <div class="col">
          <div class="kv"><span class="k">Transaccion :</span><span class="v">${esc(filtros.transaccion || 'Todas')}</span></div>
          <div class="kv"><span class="k">Numero :</span><span class="v">${esc(filtros.numero || '')}</span></div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 62px;">Fecha</th>
            <th style="width: 84px;">Transaccion</th>
            <th style="width: 70px;">Referencia</th>
            <th style="width: 92px;">Cliente</th>
            <th style="width: 140px;">Nombre</th>
            <th>Descripcion</th>
            <th class="num" style="width: 70px;">Debitos</th>
            <th class="num" style="width: 78px;">Creditos</th>
          </tr>
        </thead>
        <tbody>
          ${transacciones.map((t) => `
            <tr>
              <td>${t.fecha ? formatInTimeZone(t.fecha, 'd/M/yyyy') : ''}</td>
              <td>${esc(t.transaccion)}</td>
              <td>${esc(t.ncf || '')}</td>
              <td>${esc(t.cliente_codigo || '')}</td>
              <td>${esc((t.cliente_nombre || '').slice(0, 26))}</td>
              <td>${esc((t.descripcion || '').slice(0, 46))}</td>
              <td class="num">${Number(t.debito) > 0 ? fmt(t.debito) : ''}</td>
              <td class="num">${Number(t.credito) > 0 ? fmt(t.credito) : ''}</td>
            </tr>`).join('')}
          <tr class="total">
            <td colspan="6"></td>
            <td class="num">${fmt(totales.debitos)}</td>
            <td class="num">${fmt(totales.creditos)}</td>
          </tr>
        </tbody>
      </table>
    </body>
    </html>
  `;

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  iframe.contentWindow.document.open();
  iframe.contentWindow.document.write(html);
  iframe.contentWindow.document.close();
  setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 3000);
};
