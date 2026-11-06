// Recibos del colegio: ticket (80 mm) y hoja carta con la tarjeta de pagos
// del año. Diseño aprobado por el colegio (ejemplos del 06/11/2026).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n2 = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dinero = (v, moneda = 'DOP') => `${moneda === 'USD' ? 'US$ ' : ''}${n2(v)}`;
export const numeroRecibo = (n) => `RC-${String(n).padStart(6, '0')}`;
const fechaDO = (f) => (f ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const horaDO = (t) => (t ? new Date(t).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santo_Domingo' }) : '');

const NOTA_FISCAL = 'Este recibo no es comprobante fiscal. Si necesita factura con crédito fiscal para su declaración de gastos educativos, solicítela en caja.';

/**
 * datos = {
 *   colegio: { nombre, rnc, direccion, telefono, logo_url, slogan },
 *   pago: { numero, fecha, created_at, total, formas_pago[], tasa_usd, anio_completo, anulado, usuario },
 *   familia: { nombre, madre_nombre, padre_nombre, tutor_nombre, telefono },
 *   anio: { nombre },
 *   estudiantes: [{ id, nombre, curso, tanda, condicion, tarifa, beca_pct,
 *                   lineas: [{ descripcion, moneda, monto_moneda, monto }],
 *                   tarjeta: [{ descripcion, moneda, monto, pagado, estado }], pendiente }],
 *   proximoPago: 'diciembre, del 1 al 5', reglaRecargo: 'Pagos del 1 al 5…'
 * }
 */
export function reciboColegioTicketHTML(d) {
  const { colegio: c, pago: p } = d;
  const lineas = d.estudiantes.flatMap((e) => e.lineas.map((l) => ({ ...l, est: e.nombre })));
  const varios = d.estudiantes.length > 1;
  const pendiente = d.estudiantes.reduce((s, e) => s + Number(e.pendiente || 0), 0);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(numeroRecibo(p.numero))}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  body { margin: 0; padding: 6px 8px 14px; width: 72mm; font-family: Consolas, "Courier New", monospace; font-size: 11.5px; line-height: 1.4; color: #000; }
  .c { text-align: center; } .b { font-weight: 700; } .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .r { display: flex; justify-content: space-between; gap: 6px; } .tot { font-size: 14px; font-weight: 700; }
  .peq { font-size: 10px; } img { width: 56px; height: 56px; display: block; margin: 0 auto 4px; filter: grayscale(1); }
  .anulado { border: 2px solid #000; text-align: center; font-weight: 700; padding: 2px; margin: 4px 0; }
</style></head><body>
  ${c.logo_url ? `<img src="${esc(c.logo_url)}" alt="">` : ''}
  <div class="c b">${esc(c.nombre)}</div>
  <div class="c peq">${c.rnc ? `RNC ${esc(c.rnc)}<br>` : ''}${esc(c.direccion || '')}${c.telefono ? `<br>Tel. ${esc(c.telefono)}` : ''}</div>
  <div class="sep"></div>
  <div class="c b" style="font-size:13px;letter-spacing:1px">RECIBO DE INGRESO</div>
  ${p.anulado ? '<div class="anulado">ANULADO</div>' : ''}
  <div class="r"><span>No.</span><b>${esc(numeroRecibo(p.numero))}</b></div>
  <div class="r"><span>Fecha</span><span>${esc(fechaDO(p.fecha))} ${esc(horaDO(p.created_at))}</span></div>
  ${p.recibo_ingreso ? `<div class="r peq"><span>Ref. caja</span><span>${esc(p.recibo_ingreso)}</span></div>` : ''}
  <div class="sep"></div>
  ${d.estudiantes.map((e) => `<div>Estudiante: <b>${esc(e.nombre)}</b></div><div>Curso: ${esc(e.curso)}${e.tanda ? ` · ${esc(e.tanda)}` : ''}</div>`).join('')}
  <div>${d.familia.tutor_nombre ? 'Tutor' : 'Familia'}: ${esc(d.familia.tutor_nombre || d.familia.madre_nombre || d.familia.padre_nombre || d.familia.nombre)}</div>
  <div>Año escolar: ${esc(d.anio?.nombre || '')}</div>
  <div class="sep"></div>
  ${lineas.map((l) => `<div class="r"><span>${esc(l.descripcion)}${varios ? ` (${esc(l.est.split(' ')[0])})` : ''}</span><span>${l.moneda === 'USD' ? `US$${n2(l.monto_moneda)}` : n2(l.monto)}</span></div>`).join('')}
  ${p.anio_completo ? '<div class="peq">Año completo con descuento en las mensualidades</div>' : ''}
  <div class="sep"></div>
  <div class="r tot"><span>TOTAL RD$</span><span>${n2(p.total)}</span></div>
  ${p.tasa_usd && lineas.some((l) => l.moneda === 'USD') ? `<div class="peq">Tasa US$: ${n2(p.tasa_usd)}</div>` : ''}
  ${(p.formas_pago || []).filter((f) => Number(f.monto) > 0).map((f) => `<div class="r"><span>${esc(f.forma)}${f.referencia ? ` #${esc(f.referencia)}` : ''}</span><span>${n2(f.monto)}</span></div>`).join('')}
  <div class="sep"></div>
  <div class="r"><span>Pendiente del año</span><span>${n2(pendiente)}</span></div>
  ${d.proximoPago ? `<div class="peq">Próximo pago: ${esc(d.proximoPago)}</div>` : ''}
  <div class="sep"></div>
  ${p.usuario ? `<div class="peq">Atendido por: ${esc(p.usuario)}</div>` : ''}
  <div class="peq" style="margin-top:4px">${esc(NOTA_FISCAL)}</div>
  <div class="c" style="margin-top:8px">¡Gracias!</div>
</body></html>`;
}

export function reciboColegioHojaHTML(d) {
  const { colegio: c, pago: p } = d;
  const fila = (cls, k, v, e) => `<div class="cel ${cls}"><div class="k">${esc(k)}</div><div class="v">${v}</div><div class="e">${e}</div></div>`;
  const bloqueEstudiante = (e) => {
    const tarjeta = (e.tarjeta || []).map((t) => {
      const corto = t.descripcion.replace(/^Mensualidad /, '').replace(/ \d{4}$/, '').replace('Reservación de cupo', 'Reserv. cupo').replace('Sistema Bilingüe', 'Sist. Bilingüe');
      const v = t.moneda === 'USD' ? `US$ ${n2(t.monto)}` : n2(t.monto);
      if (t.esteRecibo) return fila('hoy', corto, v, '✓ este recibo');
      if (t.estado === 'pagado') return fila('ok', corto, v, '✓ pagado');
      if (t.estado === 'parcial') return fila('pend', corto, v, `Abonado ${n2(t.pagado)}`);
      return fila('pend', corto, v, 'Pendiente');
    }).join('');
    return `
      <div class="datos">
        <div><span>Estudiante</span><b>${esc(e.nombre)}</b> <i class="chip">${e.condicion === 'nuevo' ? 'Nuevo ingreso' : 'Continuante'}</i></div>
        <div><span>Curso / Tanda</span><b>${esc(e.curso)}${e.tanda ? ` · ${esc(e.tanda)}` : ''}</b></div>
        <div><span>Tarifa mensual</span><b>RD$ ${n2(e.tarifa)}${Number(e.beca_pct) > 0 ? ` · beca ${Number(e.beca_pct)}%` : ''}</b></div>
      </div>
      <table class="det"><tr><th>Concepto</th><th class="m">Monto RD$</th></tr>
        ${e.lineas.map((l) => `<tr><td>${esc(l.descripcion)}${l.moneda === 'USD' ? ` (US$ ${n2(l.monto_moneda)})` : ''}</td><td class="m">${n2(l.monto)}</td></tr>`).join('')}
      </table>
      ${tarjeta ? `<h2>Tarjeta de pagos ${esc(d.anio?.nombre || '')}</h2><div class="tarjeta">${tarjeta}</div>` : ''}
      <div class="pend-est">Pendiente del año de ${esc(e.nombre.split(' ')[0])}: <b>RD$ ${n2(e.pendiente)}</b></div>`;
  };
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(numeroRecibo(p.numero))}</title>
<style>
  @page { size: letter; margin: 12mm; }
  * { box-sizing: border-box; } body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; font-size: 12.5px; color: #1b2330; }
  .cab { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid #16325c; padding-bottom: 10px; }
  .cab img { width: 80px; height: 80px; object-fit: contain; }
  .cab h1 { margin: 0; font-family: Georgia, serif; font-style: italic; font-size: 22px; color: #16325c; }
  .lema { color: #2e8b3e; font-weight: 600; font-size: 11.5px; } .dat { color: #5b6472; font-size: 11px; margin-top: 3px; line-height: 1.5; }
  .num { margin-left: auto; text-align: right; border: 2px solid #16325c; border-radius: 8px; padding: 6px 12px; min-width: 160px; }
  .num .t { font-size: 10.5px; font-weight: 700; color: #16325c; letter-spacing: 1px; } .num .n { font-size: 19px; font-weight: 800; color: #b3261e; font-family: Consolas, monospace; }
  .num .f { font-size: 11px; color: #5b6472; } .anulado { color: #b3261e; font-weight: 800; letter-spacing: 2px; }
  .fam { margin: 10px 0 4px; font-size: 12px; color: #5b6472; } .fam b { color: #1b2330; }
  .datos { display: grid; grid-template-columns: 1.6fr 1fr 1fr; gap: 4px 16px; margin: 12px 0 8px; }
  .datos span { display: block; font-size: 10px; color: #5b6472; text-transform: uppercase; letter-spacing: .5px; } .datos b { font-size: 13px; }
  .chip { font-style: normal; font-size: 10px; font-weight: 700; padding: 1px 7px; border-radius: 20px; background: #e7f3ea; color: #2e8b3e; }
  table { width: 100%; border-collapse: collapse; } .det th { background: #16325c; color: #fff; font-size: 11px; text-align: left; padding: 6px 9px; }
  .det td { padding: 5px 9px; border-bottom: 1px solid #d7dce3; } .m { text-align: right; font-family: Consolas, monospace; }
  .total { display: flex; justify-content: space-between; font-weight: 800; font-size: 15px; border-top: 2px solid #16325c; padding: 8px 9px 4px; margin-top: 12px; }
  .pago { display: flex; flex-wrap: wrap; gap: 4px 22px; font-size: 12px; color: #5b6472; margin: 2px 9px 12px; } .pago b { color: #1b2330; }
  h2 { font-size: 12px; color: #16325c; margin: 10px 0 6px; letter-spacing: .5px; text-transform: uppercase; }
  .tarjeta { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; }
  .cel { border: 1px solid #d7dce3; border-radius: 6px; padding: 5px 6px; min-height: 54px; font-size: 10.5px; break-inside: avoid; }
  .cel .k { font-weight: 700; font-size: 10px; color: #16325c; text-transform: uppercase; } .cel .v { font-family: Consolas, monospace; font-size: 11px; margin-top: 2px; }
  .cel .e { margin-top: 2px; font-size: 10px; font-weight: 700; } .ok { background: #f0f8f2; border-color: #b9dfc2; } .ok .e { color: #2e8b3e; }
  .hoy { background: #eef3fb; border-color: #9fb6dc; } .hoy .e { color: #16325c; } .pend .e { color: #8a6d00; }
  .pend-est { margin: 6px 0 14px; font-size: 12px; color: #5b6472; } .pend-est b { color: #1b2330; }
  .pie { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 22px; }
  .firma { width: 220px; border-top: 1px solid #333; text-align: center; padding-top: 4px; font-size: 11px; color: #5b6472; }
  .nota { font-size: 10px; color: #5b6472; max-width: 420px; line-height: 1.45; }
</style></head><body>
  <div class="cab">
    ${c.logo_url ? `<img src="${esc(c.logo_url)}" alt="">` : ''}
    <div>
      <h1>${esc(c.nombre)}</h1>
      ${c.slogan ? `<div class="lema">“${esc(c.slogan)}”</div>` : ''}
      <div class="dat">${c.rnc ? `RNC ${esc(c.rnc)} · ` : ''}${esc(c.direccion || '')}${c.telefono ? `<br>Tel. ${esc(c.telefono)}` : ''}</div>
    </div>
    <div class="num">
      <div class="t">RECIBO DE INGRESO</div>
      <div class="n">${esc(numeroRecibo(p.numero))}</div>
      <div class="f">${esc(fechaDO(p.fecha))} · ${esc(horaDO(p.created_at))}</div>
      ${p.recibo_ingreso ? `<div class="f">Ref. caja ${esc(p.recibo_ingreso)}</div>` : ''}
      ${p.anulado ? '<div class="anulado">ANULADO</div>' : ''}
    </div>
  </div>
  <div class="fam">Familia <b>${esc(d.familia.nombre)}</b>${[d.familia.madre_nombre, d.familia.padre_nombre, d.familia.tutor_nombre].filter(Boolean).length ? ` · ${esc([d.familia.madre_nombre, d.familia.padre_nombre, d.familia.tutor_nombre].filter(Boolean).join(' / '))}` : ''}${d.familia.telefono ? ` · ${esc(d.familia.telefono)}` : ''}</div>
  ${d.estudiantes.map(bloqueEstudiante).join('')}
  <div class="total"><span>TOTAL PAGADO${p.anio_completo ? ' (año completo con descuento)' : ''}</span><span>RD$ ${n2(p.total)}</span></div>
  <div class="pago">
    <div>Forma de pago: <b>${(p.formas_pago || []).filter((f) => Number(f.monto) > 0).map((f) => `${esc(f.forma)} ${n2(f.monto)}${f.referencia ? ` #${esc(f.referencia)}` : ''}`).join(' · ')}</b></div>
    ${p.tasa_usd && d.estudiantes.some((e) => e.lineas.some((l) => l.moneda === 'USD')) ? `<div>Tasa US$: <b>${n2(p.tasa_usd)}</b></div>` : ''}
    ${d.proximoPago ? `<div>Próximo pago: <b>${esc(d.proximoPago)}</b></div>` : ''}
  </div>
  <div class="pie">
    <div class="nota">${esc(NOTA_FISCAL)} ${esc(d.reglaRecargo || '')}</div>
    <div class="firma">Recibido por${p.usuario ? ` · ${esc(p.usuario)}` : ''}</div>
  </div>
</body></html>`;
}

export { dinero };
