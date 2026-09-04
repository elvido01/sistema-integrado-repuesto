// Informe de Préstamo (hoja carta) — réplica exacta de la estructura del
// "Informe de Prestamo" del sistema viejo (SiiF):
//   encabezado (fecha | empresa + titulo | pagina), caja del prestamo |
//   caja del cliente, Vehiculo en Garantia | Inmueble en Garantia,
//   Garante | Comentarios, y la tabla GENERADO / PAGADO / PENDIENTE.
import { formatInTimeZone } from '@/lib/dateUtils';
import { supabase } from '@/lib/customSupabaseClient';

const fmt = (v) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const fdate = (d) => {
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  return m ? `${Number(m[3])}/${Number(m[2])}/${m[1]}` : String(d);
};
const cap = (s) => { const t = String(s || ''); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; };

// data: { empresa, prestamo, cliente, valorCuota,
//         totales: { capital: {gen, pag}, intereses: {gen, pag},
//                    atrasos: {gen, pag}, otros: {gen, pag} } }
export const printInformePrestamo = ({ empresa, prestamo, cliente, valorCuota, totales }) => {
  const hoy = formatInTimeZone(new Date(), 'd/M/yyyy');
  const t = totales || {};
  const fila = (label, tt = {}) => {
    const gen = Number(tt.gen) || 0;
    const pag = Number(tt.pag) || 0;
    return `<tr>
      <td class="lbl">${label} :</td>
      <td class="num">${fmt(gen)}</td>
      <td class="num">${fmt(pag)}</td>
      <td class="num">${fmt(gen - pag)}</td>
    </tr>`;
  };
  const totGen = ['capital', 'intereses', 'atrasos', 'otros'].reduce((a, k) => a + (Number(t[k]?.gen) || 0), 0);
  const totPag = ['capital', 'intereses', 'atrasos', 'otros'].reduce((a, k) => a + (Number(t[k]?.pag) || 0), 0);

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8">
      <style>
        @page { size: letter; margin: 12mm; }
        html, body { margin: 0; padding: 0; background: #fff; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 12.5px; color: #000; }
        .head { display: flex; align-items: flex-start; border-bottom: 3px double #000; padding-bottom: 4px; }
        .head .fecha { width: 120px; font-size: 12px; }
        .head .centro { flex: 1; text-align: center; }
        .head .centro h1 { margin: 0; font-size: 17px; letter-spacing: 1px; }
        .head .centro .sub { font-weight: bold; font-size: 13px; }
        .head .pag { width: 120px; text-align: right; font-size: 12px; }
        .fila2 { display: flex; gap: 18px; margin-top: 16px; }
        .box { border: 1px solid #444; border-radius: 10px; padding: 10px 14px; flex: 1; min-height: 40px; }
        .box .titulo { font-weight: bold; font-style: italic; margin: -20px 0 6px 6px; background: #fff; display: inline-block; padding: 0 6px; }
        .kv { display: flex; margin-bottom: 3px; }
        .kv .k { width: 46%; text-align: right; padding-right: 8px; }
        .kv .v { flex: 1; font-weight: bold; }
        table.tot { width: 78%; margin: 26px auto 0; border-collapse: collapse; }
        table.tot th { font-style: italic; font-weight: bold; text-align: right; padding: 3px 10px; }
        table.tot td { padding: 3px 10px; }
        table.tot .lbl { text-align: right; font-weight: bold; width: 130px; }
        table.tot .num { text-align: right; font-variant-numeric: tabular-nums; width: 140px; }
        table.tot tr.total td { border-top: 1px solid #000; font-weight: bold; padding-top: 6px; }
      </style>
    </head>
    <body onload="window.print()">
      <div class="head">
        <div class="fecha">${hoy}</div>
        <div class="centro">
          <h1>${String(empresa?.nombre || '').toUpperCase()}</h1>
          <div class="sub">Informe de Prestamo</div>
        </div>
        <div class="pag">Pagina 1</div>
      </div>

      <div class="fila2">
        <div class="box">
          <div class="kv"><span class="k">Prestamo No. :</span><span class="v">${prestamo?.numero || ''}</span></div>
          <div class="kv"><span class="k">Fecha :</span><span class="v">${fdate(prestamo?.fecha_inicio)}</span></div>
          <div class="kv"><span class="k">Capital Prestado :</span><span class="v">${fmt(prestamo?.monto_capital)}</span></div>
          <!-- La tasa guardada es SIEMPRE mensual: la amortización la
               reparte por período (ver mesesPorCuota en amortizacion.js).
               Rotularla con la frecuencia de PAGO hacía que un préstamo
               diario imprimiera "3.00% Diario" — 840% al año, en el papel
               que se le entrega al cliente. La forma de pago va abajo. -->
          <div class="kv"><span class="k">Tasa de Interes :</span><span class="v">${fmt(prestamo?.tasa_interes)}% Mensual</span></div>
          <div class="kv"><span class="k">Cargos por Atraso :</span><span class="v">${fmt(prestamo?.mora_pct)}%</span></div>
          <div class="kv"><span class="k">Tipo de Prestamo :</span><span class="v">${cap(prestamo?.tipo)} (${prestamo?.metodo_interes === 'simple' ? 'Interes Simple' : cap(prestamo?.metodo_interes)})</span></div>
          <div class="kv"><span class="k">Cant. de Cuotas :</span><span class="v">${prestamo?.plazo_cuotas || ''}</span></div>
          <div class="kv"><span class="k">Forma de Pago :</span><span class="v">${cap(prestamo?.frecuencia)}</span></div>
          <div class="kv"><span class="k">Valor de las Cuotas :</span><span class="v">${fmt(valorCuota)}</span></div>
        </div>
        <div class="box">
          <div class="kv"><span class="k">Cedula :</span><span class="v">${cliente?.rnc || ''}</span></div>
          <div class="kv"><span class="k">Nombre :</span><span class="v">${cliente?.nombre || ''}</span></div>
          <div class="kv"><span class="k">Fecha Nacimiento :</span><span class="v">${fdate(cliente?.fecha_nacimiento) || ''}</span></div>
          <div class="kv"><span class="k">Sexo :</span><span class="v">${cliente?.sexo || ''}</span></div>
          <div class="kv"><span class="k">Estado Civil :</span><span class="v">${cliente?.estado_civil || ''}</span></div>
          <div class="kv"><span class="k">Direccion :</span><span class="v">${cliente?.direccion || ''}</span></div>
          <div class="kv" style="margin-top: 10px;"><span class="k">Telefonos :</span><span class="v">${cliente?.telefono || ''}</span></div>
        </div>
      </div>

      <div class="fila2" style="margin-top: 26px;">
        <div class="box">
          <div class="titulo">Vehiculo en Garantia</div>
          ${prestamo?.garantia ? `<div style="margin: 0 0 6px 6px; font-weight: bold;">${prestamo.garantia}</div>` : ''}
          ${['Tipo', 'Marca', 'Modelo', 'Año', 'Color', 'Chasis', 'Matricula', 'Placa'].map((k) => `<div class="kv"><span class="k" style="width: 30%;">${k} :</span><span class="v"></span></div>`).join('')}
        </div>
        <div class="box">
          <div class="titulo">Inmueble en Garantia</div>
        </div>
      </div>

      <div class="fila2" style="margin-top: 26px;">
        <div class="box">
          <div class="titulo">Garante</div>
          <div class="kv"><span class="k" style="width: 30%;">Cedula :</span><span class="v"></span></div>
          <div class="kv"><span class="k" style="width: 30%;">Nombre :</span><span class="v"></span></div>
          <div class="kv"><span class="k" style="width: 30%;">Direccion :</span><span class="v"></span></div>
          <div class="kv" style="margin-top: 10px;"><span class="k" style="width: 30%;">Telefonos :</span><span class="v"></span></div>
        </div>
        <div class="box">
          <div class="titulo">Comentarios</div>
          <div style="margin-left: 6px; white-space: pre-wrap;">${prestamo?.notas || ''}</div>
        </div>
      </div>

      <table class="tot">
        <thead>
          <tr><th></th><th>GENERADO</th><th>PAGADO</th><th>PENDIENTE</th></tr>
        </thead>
        <tbody>
          ${fila('Capital', t.capital)}
          ${fila('Intereses', t.intereses)}
          ${fila('Atrasos', t.atrasos)}
          ${fila('Otros', t.otros)}
          <tr class="total">
            <td class="lbl">Total :</td>
            <td class="num">${fmt(totGen)}</td>
            <td class="num">${fmt(totPag)}</td>
            <td class="num">${fmt(totGen - totPag)}</td>
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

// Arma el informe desde la BD y lo manda a imprimir (hoja carta). Lo usan
// tanto la reimpresion (lista de Prestamos) como la creacion (Nuevo Prestamo),
// para que ambos saquen exactamente el mismo documento.
export const imprimirInformePrestamo = async ({ prestamoId, clienteId, empresa }) => {
  if (!prestamoId) return;
  const [{ data: full }, { data: cli }, { data: cuotas }, { data: cargos }] = await Promise.all([
    supabase.from('prestamos').select('*').eq('id', prestamoId).single(),
    clienteId
      ? supabase.from('clientes').select('*').eq('id', clienteId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('prestamo_cuotas')
      .select('numero_cuota, capital, interes, monto_cuota, capital_pagado, interes_pagado, mora_pagada')
      .eq('prestamo_id', prestamoId).order('numero_cuota'),
    supabase.from('prestamo_cargos')
      .select('tipo, monto, monto_pagado, anulado')
      .eq('prestamo_id', prestamoId),
  ]);

  const qs = cuotas || [];
  const cgs = (cargos || []).filter((c) => !c.anulado);
  const moraCargos = cgs.filter((c) => String(c.tipo || '').toUpperCase() === 'MR');
  const otrosCargos = cgs.filter((c) => String(c.tipo || '').toUpperCase() !== 'MR');
  const sum = (arr, k) => arr.reduce((a, x) => a + (Number(x[k]) || 0), 0);
  const moraPagada = sum(qs, 'mora_pagada');

  printInformePrestamo({
    empresa,
    prestamo: full,
    cliente: cli,
    valorCuota: qs[0]?.monto_cuota || 0,
    totales: {
      capital: { gen: sum(qs, 'capital'), pag: sum(qs, 'capital_pagado') },
      intereses: { gen: sum(qs, 'interes'), pag: sum(qs, 'interes_pagado') },
      atrasos: { gen: moraPagada + sum(moraCargos, 'monto'), pag: moraPagada + sum(moraCargos, 'monto_pagado') },
      otros: { gen: sum(otrosCargos, 'monto'), pag: sum(otrosCargos, 'monto_pagado') },
    },
  });
};
