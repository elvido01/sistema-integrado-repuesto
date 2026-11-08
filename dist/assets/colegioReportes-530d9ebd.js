import{d2 as P,s as $,c_ as M,c$ as U,d3 as E,d4 as H,d0 as I}from"./index-6de5c398.js";const a=e=>String(e??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]),l=e=>Number(e||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),w=e=>`RC-${String(e).padStart(6,"0")}`,_=e=>e?new Date(`${String(e).slice(0,10)}T12:00:00`).toLocaleDateString("es-DO",{day:"2-digit",month:"2-digit",year:"numeric"}):"",O=e=>e?new Date(e).toLocaleTimeString("es-DO",{hour:"2-digit",minute:"2-digit",timeZone:"America/Santo_Domingo"}):"",F="Este recibo no es comprobante fiscal. Si necesita factura con crédito fiscal para su declaración de gastos educativos, solicítela en caja.";function Q(e){var m;const{colegio:t,pago:i}=e,r=e.estudiantes.flatMap(o=>o.lineas.map(s=>({...s,est:o.nombre}))),p=e.estudiantes.length>1,n=e.estudiantes.reduce((o,s)=>o+Number(s.pendiente||0),0);return`<!doctype html><html><head><meta charset="utf-8"><title>${a(w(i.numero))}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  body { margin: 0; padding: 6px 8px 14px; width: 72mm; font-family: Consolas, "Courier New", monospace; font-size: 11.5px; line-height: 1.4; color: #000; }
  .c { text-align: center; } .b { font-weight: 700; } .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .r { display: flex; justify-content: space-between; gap: 6px; } .tot { font-size: 14px; font-weight: 700; }
  .peq { font-size: 10px; } img { width: 56px; height: 56px; display: block; margin: 0 auto 4px; filter: grayscale(1); }
  .anulado { border: 2px solid #000; text-align: center; font-weight: 700; padding: 2px; margin: 4px 0; }
</style></head><body>
  ${t.logo_url?`<img src="${a(t.logo_url)}" alt="">`:""}
  <div class="c b">${a(t.nombre)}</div>
  <div class="c peq">${t.rnc?`RNC ${a(t.rnc)}<br>`:""}${a(t.direccion||"")}${t.telefono?`<br>Tel. ${a(t.telefono)}`:""}</div>
  <div class="sep"></div>
  <div class="c b" style="font-size:13px;letter-spacing:1px">RECIBO DE INGRESO</div>
  ${i.anulado?'<div class="anulado">ANULADO</div>':""}
  <div class="r"><span>No.</span><b>${a(w(i.numero))}</b></div>
  <div class="r"><span>Fecha</span><span>${a(_(i.fecha))} ${a(O(i.created_at))}</span></div>
  ${i.recibo_ingreso?`<div class="r peq"><span>Ref. caja</span><span>${a(i.recibo_ingreso)}</span></div>`:""}
  <div class="sep"></div>
  ${e.estudiantes.map(o=>`<div>Estudiante: <b>${a(o.nombre)}</b></div><div>Curso: ${a(o.curso)}${o.tanda?` · ${a(o.tanda)}`:""}</div>`).join("")}
  <div>${e.familia.tutor_nombre?"Tutor":"Familia"}: ${a(e.familia.tutor_nombre||e.familia.madre_nombre||e.familia.padre_nombre||e.familia.nombre)}</div>
  <div>Año escolar: ${a(((m=e.anio)==null?void 0:m.nombre)||"")}</div>
  <div class="sep"></div>
  ${r.map(o=>`<div class="r"><span>${a(o.descripcion)}${p?` (${a(o.est.split(" ")[0])})`:""}</span><span>${o.moneda==="USD"?`US$${l(o.monto_moneda)}`:l(o.monto)}</span></div>`).join("")}
  ${i.anio_completo?'<div class="peq">Año completo con descuento en las mensualidades</div>':""}
  <div class="sep"></div>
  <div class="r tot"><span>TOTAL RD$</span><span>${l(i.total)}</span></div>
  ${i.tasa_usd&&r.some(o=>o.moneda==="USD")?`<div class="peq">Tasa US$: ${l(i.tasa_usd)}</div>`:""}
  ${(i.formas_pago||[]).filter(o=>Number(o.monto)>0).map(o=>`<div class="r"><span>${a(o.forma)}${o.referencia?` #${a(o.referencia)}`:""}</span><span>${l(o.monto)}</span></div>`).join("")}
  <div class="sep"></div>
  <div class="r"><span>Pendiente del año</span><span>${l(n)}</span></div>
  ${e.proximoPago?`<div class="peq">Próximo pago: ${a(e.proximoPago)}</div>`:""}
  <div class="sep"></div>
  ${i.usuario?`<div class="peq">Atendido por: ${a(i.usuario)}</div>`:""}
  <div class="peq" style="margin-top:4px">${a(F)}</div>
  <div class="c" style="margin-top:8px">¡Gracias!</div>
</body></html>`}function W(e){const{colegio:t,pago:i}=e,r=(n,m,o,s)=>`<div class="cel ${n}"><div class="k">${a(m)}</div><div class="v">${o}</div><div class="e">${s}</div></div>`,p=n=>{var o;const m=(n.tarjeta||[]).map(s=>{const b=s.descripcion.replace(/^Mensualidad /,"").replace(/ \d{4}$/,"").replace("Reservación de cupo","Reserv. cupo").replace("Sistema Bilingüe","Sist. Bilingüe"),c=s.moneda==="USD"?`US$ ${l(s.monto)}`:l(s.monto);return s.esteRecibo?r("hoy",b,c,"✓ este recibo"):s.estado==="pagado"?r("ok",b,c,"✓ pagado"):s.estado==="parcial"?r("pend",b,c,`Abonado ${l(s.pagado)}`):r("pend",b,c,"Pendiente")}).join("");return`
      <div class="datos">
        <div><span>Estudiante</span><b>${a(n.nombre)}</b> <i class="chip">${n.condicion==="nuevo"?"Nuevo ingreso":"Continuante"}</i></div>
        <div><span>Curso / Tanda</span><b>${a(n.curso)}${n.tanda?` · ${a(n.tanda)}`:""}</b></div>
        <div><span>Tarifa mensual</span><b>RD$ ${l(n.tarifa)}${Number(n.beca_pct)>0?` · beca ${Number(n.beca_pct)}%`:""}</b></div>
      </div>
      <table class="det"><tr><th>Concepto</th><th class="m">Monto RD$</th></tr>
        ${n.lineas.map(s=>`<tr><td>${a(s.descripcion)}${s.moneda==="USD"?` (US$ ${l(s.monto_moneda)})`:""}</td><td class="m">${l(s.monto)}</td></tr>`).join("")}
      </table>
      ${m?`<h2>Tarjeta de pagos ${a(((o=e.anio)==null?void 0:o.nombre)||"")}</h2><div class="tarjeta">${m}</div>`:""}
      <div class="pend-est">Pendiente del año de ${a(n.nombre.split(" ")[0])}: <b>RD$ ${l(n.pendiente)}</b></div>`};return`<!doctype html><html><head><meta charset="utf-8"><title>${a(w(i.numero))}</title>
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
    ${t.logo_url?`<img src="${a(t.logo_url)}" alt="">`:""}
    <div>
      <h1>${a(t.nombre)}</h1>
      ${t.slogan?`<div class="lema">“${a(t.slogan)}”</div>`:""}
      <div class="dat">${t.rnc?`RNC ${a(t.rnc)} · `:""}${a(t.direccion||"")}${t.telefono?`<br>Tel. ${a(t.telefono)}`:""}</div>
    </div>
    <div class="num">
      <div class="t">RECIBO DE INGRESO</div>
      <div class="n">${a(w(i.numero))}</div>
      <div class="f">${a(_(i.fecha))} · ${a(O(i.created_at))}</div>
      ${i.recibo_ingreso?`<div class="f">Ref. caja ${a(i.recibo_ingreso)}</div>`:""}
      ${i.anulado?'<div class="anulado">ANULADO</div>':""}
    </div>
  </div>
  <div class="fam">Familia <b>${a(e.familia.nombre)}</b>${[e.familia.madre_nombre,e.familia.padre_nombre,e.familia.tutor_nombre].filter(Boolean).length?` · ${a([e.familia.madre_nombre,e.familia.padre_nombre,e.familia.tutor_nombre].filter(Boolean).join(" / "))}`:""}${e.familia.telefono?` · ${a(e.familia.telefono)}`:""}</div>
  ${e.estudiantes.map(p).join("")}
  <div class="total"><span>TOTAL PAGADO${i.anio_completo?" (año completo con descuento)":""}</span><span>RD$ ${l(i.total)}</span></div>
  <div class="pago">
    <div>Forma de pago: <b>${(i.formas_pago||[]).filter(n=>Number(n.monto)>0).map(n=>`${a(n.forma)} ${l(n.monto)}${n.referencia?` #${a(n.referencia)}`:""}`).join(" · ")}</b></div>
    ${i.tasa_usd&&e.estudiantes.some(n=>n.lineas.some(m=>m.moneda==="USD"))?`<div>Tasa US$: <b>${l(i.tasa_usd)}</b></div>`:""}
    ${e.proximoPago?`<div>Próximo pago: <b>${a(e.proximoPago)}</b></div>`:""}
  </div>
  <div class="pie">
    <div class="nota">${a(F)} ${a(e.reglaRecargo||"")}</div>
    <div class="firma">Recibido por${i.usuario?` · ${a(i.usuario)}`:""}</div>
  </div>
</body></html>`}const R=`
  @page { size: letter; margin: 12mm; }
  * { box-sizing: border-box; } body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; font-size: 12px; color: #1b2330; }
  .cab { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #16325c; padding-bottom: 8px; }
  .cab img { width: 64px; height: 64px; object-fit: contain; }
  .cab h1 { margin: 0; font-family: Georgia, serif; font-style: italic; font-size: 19px; color: #16325c; }
  .dat { color: #5b6472; font-size: 10.5px; margin-top: 2px; line-height: 1.45; }
  .tit { margin-left: auto; text-align: right; } .tit .t { font-size: 14px; font-weight: 800; color: #16325c; letter-spacing: .5px; text-transform: uppercase; }
  .tit .f { font-size: 11px; color: #5b6472; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th { background: #16325c; color: #fff; font-size: 10.5px; text-align: left; padding: 5px 7px; }
  td { padding: 4px 7px; border-bottom: 1px solid #e1e5ea; font-size: 11.5px; vertical-align: top; }
  .m { text-align: right; font-family: Consolas, monospace; white-space: nowrap; }
  tr.g td { background: #eef3fb; color: #16325c; font-weight: 800; border-bottom: 1px solid #9fb6dc; padding-top: 7px; }
  tr.s td { font-weight: 700; background: #f7f8fa; } tr.t td { font-weight: 800; border-top: 2px solid #16325c; font-size: 12.5px; }
  tr.an td { color: #9aa1ab; text-decoration: line-through; }
  .rojo { color: #b3261e; } .verde { color: #2e8b3e; }
  h2 { font-size: 12.5px; color: #16325c; margin: 14px 0 2px; } .sub { font-size: 11px; color: #5b6472; }
  .nota { font-size: 10px; color: #5b6472; margin-top: 14px; line-height: 1.45; }
`,C=(e,t,i)=>`
  <div class="cab">
    ${e!=null&&e.logo_url?`<img src="${a(e.logo_url)}" alt="">`:""}
    <div><h1>${a((e==null?void 0:e.nombre)||"")}</h1>
      <div class="dat">${e!=null&&e.rnc?`RNC ${a(e.rnc)} · `:""}${a((e==null?void 0:e.direccion)||"")}${e!=null&&e.telefono?` · Tel. ${a(e.telefono)}`:""}</div></div>
    <div class="tit"><div class="t">${a(t)}</div><div class="f">${a(i||"")}</div></div>
  </div>`;function G(e){const t=e.familia||{};let i=0,r=0,p=0;const n=e.estudiantes.map(o=>{const s=o.cargos.filter(d=>d.moneda!=="USD").reduce((d,u)=>d+u.pendiente,0),b=o.cargos.filter(d=>d.moneda==="USD").reduce((d,u)=>d+u.pendiente,0);i+=s,r+=b,p+=o.cargos.filter(d=>d.moneda!=="USD"&&d.vencido).reduce((d,u)=>d+u.pendiente,0);const c=o.cargos.map(d=>{const u=d.estado==="pagado"?'<span class="verde">Pagado</span>':d.vencido?'<span class="rojo">Vencido</span>':d.estado==="parcial"?"Abonado":"Pendiente",h=D=>`${d.moneda==="USD"?"US$ ":""}${l(D)}`;return`<tr><td>${a(d.descripcion)}${d.anio?` <span class="sub">(${a(d.anio)})</span>`:""}</td>
        <td class="m">${h(d.monto)}</td><td class="m">${Number(d.descuento)>0?h(d.descuento):""}</td>
        <td class="m">${h(d.pagado)}</td><td class="m">${d.pendiente>0?h(d.pendiente):""}</td><td>${u}</td></tr>`}).join("");return`<h2>${a(o.nombre)} <span class="sub">· Mat. ${a(o.matricula)} · ${a(o.curso||"")}${o.tanda?` · ${a(o.tanda)}`:""} · RD$ ${l(o.tarifa)}${Number(o.beca_pct)>0?` (beca ${Number(o.beca_pct)}%)`:""}${o.estado!=="activo"?` · ${a(o.estado)}`:""}</span></h2>
      <table><tr><th>Concepto</th><th class="m">Monto</th><th class="m">Descuento</th><th class="m">Pagado</th><th class="m">Pendiente</th><th>Estado</th></tr>
      ${c||'<tr><td colspan="6" class="sub">Sin cargos</td></tr>'}
      <tr class="s"><td colspan="4">Pendiente de ${a(o.nombre.split(" ")[0])}</td><td class="m">${l(s)}${b>0?`<br>US$ ${l(b)}`:""}</td><td></td></tr></table>`}).join(""),m=(e.pagos||[]).map(o=>`<tr class="${o.anulado?"an":""}"><td>${a(w(o.numero))}</td><td>${a(_(o.fecha))}</td><td class="m">${l(o.total)}</td></tr>`).join("");return`<!doctype html><html><head><meta charset="utf-8"><title>Estado de cuenta ${a(t.nombre||"")}</title><style>${R}</style></head><body>
  ${C(e.colegio,"Estado de cuenta",`Al ${_(e.fecha)}`)}
  <div style="margin:8px 0 2px">Familia <b>${a(t.nombre||"")}</b>${[t.madre_nombre,t.padre_nombre,t.tutor_nombre].filter(Boolean).length?` · ${a([t.madre_nombre,t.padre_nombre,t.tutor_nombre].filter(Boolean).join(" / "))}`:""}${t.telefono?` · ${a(t.telefono)}`:""}</div>
  ${n}
  <table style="margin-top:14px"><tr class="t"><td>TOTAL PENDIENTE DE LA FAMILIA</td><td class="m">RD$ ${l(i)}${r>0?` + US$ ${l(r)}`:""}</td></tr>
  ${p>0?`<tr><td class="rojo">De eso, vencido</td><td class="m rojo">RD$ ${l(p)}</td></tr>`:""}</table>
  ${m?`<h2>Últimos pagos</h2><table><tr><th>Recibo</th><th>Fecha</th><th class="m">Total RD$</th></tr>${m}</table>`:""}
  <div class="nota">${a(e.reglaRecargo||"")}</div>
</body></html>`}function X({colegio:e,titulo:t,subtitulo:i,columnas:r,filas:p,total:n,nota:m,horizontal:o}){const s=(c,d)=>{const u=d[c.k];return c.m?`<td class="m">${u===""||u==null?"":l(u)}</td>`:`<td>${a(u??"")}</td>`},b=p.map(c=>c._grupo?`<tr class="g"><td colspan="${r.length}">${a(c._grupo)}</td></tr>`:`<tr class="${c._sub?"s":""}${c._anulado?" an":""}">${r.map(d=>s(d,c)).join("")}</tr>`).join("");return`<!doctype html><html><head><meta charset="utf-8"><title>${a(t)}</title><style>${R}${o?"@page { size: letter landscape; margin: 10mm; }":""}</style></head><body>
  ${C(e,t,i)}
  <table><tr>${r.map(c=>`<th${c.m?' class="m"':""}>${a(c.t)}</th>`).join("")}</tr>
  ${b||`<tr><td colspan="${r.length}" class="sub">Sin datos</td></tr>`}
  ${n?`<tr class="t">${r.map(c=>s(c,n)).join("")}</tr>`:""}</table>
  ${m?`<div class="nota">${a(m)}</div>`:""}
</body></html>`}function V(e){var p,n,m;const t=e.factura||{},i=String(t.estado||"").toUpperCase()==="ANULADA",r=String(((p=e.cliente)==null?void 0:p.rnc)||"").replace(/\D/g,"").length===9;return`<!doctype html><html><head><meta charset="utf-8"><title>Factura ${a(t.ncf||"")}</title><style>${R}
  .caja { display: flex; justify-content: space-between; gap: 16px; margin: 12px 0; }
  .caja > div { border: 1px solid #d7dce3; border-radius: 6px; padding: 8px 10px; flex: 1; font-size: 12px; line-height: 1.6; }
  .caja span { color: #5b6472; font-size: 10.5px; text-transform: uppercase; }
  .ncf { font-family: Consolas, monospace; font-size: 15px; font-weight: 800; color: #b3261e; }
  .anul { color: #b3261e; font-weight: 800; letter-spacing: 2px; font-size: 16px; text-align: center; border: 2px solid #b3261e; padding: 4px; margin-top: 8px; }
  .firma { width: 220px; border-top: 1px solid #333; text-align: center; padding-top: 4px; font-size: 11px; color: #5b6472; margin: 40px 0 0 auto; }
</style></head><body>
  ${C(e.colegio,"Factura de crédito fiscal",`No. ${t.numero||""}`)}
  ${i?'<div class="anul">ANULADA</div>':""}
  <div class="caja">
    <div><span>NCF</span><br><b class="ncf">${a(t.ncf||"")}</b><br><span>Válido hasta</span> ${a(_(e.vence)||"—")}<br><span>Fecha</span> ${a(_(t.fecha))}</div>
    <div><span>Cliente</span><br><b>${a(((n=e.cliente)==null?void 0:n.nombre)||"")}</b><br><span>${r?"RNC":"Cédula"}</span> ${a(((m=e.cliente)==null?void 0:m.rnc)||"")}<br><span>Forma de pago</span> ${a(String(t.forma_pago||"").replace(/ - RECIBO$/,""))} (pagado)</div>
  </div>
  <table><tr><th>Descripción</th><th class="m">Cant.</th><th class="m">Precio</th><th class="m">ITBIS</th><th class="m">Importe RD$</th></tr>
    ${(e.lineas||[]).map(o=>`<tr><td>${a(o.descripcion)}</td><td class="m">1</td><td class="m">${l(o.importe)}</td><td class="m">E</td><td class="m">${l(o.importe)}</td></tr>`).join("")}
    <tr class="s"><td colspan="4">Subtotal</td><td class="m">${l(t.total)}</td></tr>
    <tr class="s"><td colspan="4">ITBIS (exento, art. 344 núm. 7 del Código Tributario)</td><td class="m">0.00</td></tr>
    <tr class="t"><td colspan="4">TOTAL</td><td class="m">RD$ ${l(t.total)}</td></tr>
  </table>
  <div class="nota">${a(t.notas||"")}<br>E = exento de ITBIS. Válida para deducción de gastos educativos (Ley 179-09) a nombre del contribuyente indicado.</div>
  <div class="firma">Firma autorizada</div>
</body></html>`}const q={reservacion:1,inscripcion:1,utileria:2,bilingue:3,mensualidad:4,sala_tareas:5,recargo:6,otro:7};let v=null;async function L(e){if((v==null?void 0:v.tenantId)===e&&Date.now()-v.t<3e5)return v.datos;const{data:t,error:i}=await $.from("config_empresa").select("nombre, rnc, direccion1, direccion2, telefono, logo_url, slogan").eq("tenant_id",e).maybeSingle();if(i)throw i;const r=t||{},p={nombre:r.nombre,rnc:r.rnc,direccion:[r.direccion1,r.direccion2].filter(Boolean).join(", "),telefono:r.telefono,logo_url:r.logo_url,slogan:r.slogan};return t&&(v={tenantId:e,datos:p,t:Date.now()}),p}async function J(e,t){var N,A;const[i,r,p,n,m]=await Promise.all([$.from("edu_familias").select("*").eq("id",e).eq("tenant_id",t).single(),$.from("edu_estudiantes").select("*").eq("familia_id",e).eq("tenant_id",t).order("matricula"),$.from("edu_anios").select("*").eq("tenant_id",t).order("anio_inicio"),$.from("edu_config").select("*").eq("tenant_id",t).maybeSingle(),L(t)]);if(i.error)throw i.error;if(r.error)throw r.error;const o=new Map((p.data||[]).map(g=>[g.id,g])),s=(p.data||[]).find(g=>g.actual),b=(r.data||[]).map(g=>g.id),[c,d,u]=await Promise.all([b.length?$.from("edu_cargos").select("*").in("estudiante_id",b).eq("tenant_id",t).neq("estado","anulado"):Promise.resolve({data:[]}),$.from("edu_cursos").select("id, nombre").eq("tenant_id",t),$.from("edu_pagos").select("numero, fecha, total, anulado").eq("familia_id",e).eq("tenant_id",t).order("numero",{ascending:!1}).limit(8)]);if(c.error)throw c.error;const h=new Map((d.data||[]).map(g=>[g.id,g.nombre])),D=M(),k=(r.data||[]).map(g=>{const j=(c.data||[]).filter(f=>f.estudiante_id===g.id).filter(f=>{var x;return f.anio_id===(s==null?void 0:s.id)||U(f)>0||f.tipo==="reservacion"&&((x=o.get(f.anio_id))==null?void 0:x.anio_inicio)>((s==null?void 0:s.anio_inicio)??0)}).sort((f,x)=>{var z,S;return(((z=o.get(f.anio_id))==null?void 0:z.anio_inicio)??0)-(((S=o.get(x.anio_id))==null?void 0:S.anio_inicio)??0)||q[f.tipo]-q[x.tipo]||String(f.periodo||"").localeCompare(String(x.periodo||""))}).map(f=>{var S,T;const x=U(f),z=f.vence||E(f.created_at);return{descripcion:f.descripcion,anio:f.anio_id!==(s==null?void 0:s.id)?(S=o.get(f.anio_id))==null?void 0:S.nombre:"",moneda:f.moneda,monto:Number(f.monto),descuento:Number(f.descuento),pagado:Number(f.pagado),pendiente:x,estado:f.estado,vencido:x>0&&H(z,D)>0&&!(((T=o.get(f.anio_id))==null?void 0:T.anio_inicio)>((s==null?void 0:s.anio_inicio)??0))}});return{nombre:`${g.nombres} ${g.apellidos}`,matricula:g.matricula,curso:h.get(g.curso_id)||"",tanda:I[g.tanda]||"",tarifa:g.tarifa_mensual,beca_pct:g.beca_pct,estado:g.estado,cargos:j}}).filter(g=>g.estado==="activo"||g.cargos.some(j=>j.pendiente>0)),y=i.data,B=((N=n.data)==null?void 0:N.dia_limite_pago)||5;return{colegio:m,fecha:D,estudiantes:k,pagos:u.data||[],familia:{...y,telefono:y.tutor_telefono||y.madre_celular||y.padre_celular||y.telefono_residencial||""},reglaRecargo:((A=n.data)==null?void 0:A.recargo_monto)>0?`Pagos del 1 al ${B} de cada mes; desde el día 1 del mes siguiente se aplica un recargo de RD$${Number(n.data.recargo_monto).toLocaleString("en-US")}.`:""}}async function Y(e,t){const i=await J(e,t);await P(G(i),{tipo:"carta"})}async function Z(e,t){var b;const[i,r]=await Promise.all([$.from("facturas").select("numero, ncf, fecha, total, notas, forma_pago, estado, clientes(nombre, rnc), facturas_detalle(descripcion, importe, created_at)").eq("id",e).eq("tenant_id",t).single(),L(t)]);if(i.error)throw i.error;const p=i.data,n=String(p.ncf||""),m=Number(n.slice(3));let o=null;if(m){const{data:c}=await $.from("secuencias_ncf").select("fecha_vencimiento").eq("tenant_id",t).eq("serie",n.slice(0,1)).eq("tipo_ncf",n.slice(1,3)).lte("secuencia_desde",m).gte("secuencia_hasta",m).order("created_at",{ascending:!1}).limit(1);o=((b=c==null?void 0:c[0])==null?void 0:b.fecha_vencimiento)||null}const s=[...p.facturas_detalle||[]].sort((c,d)=>String(c.created_at).localeCompare(String(d.created_at)));return{colegio:r,factura:{...p,fecha:E(p.fecha)},vence:o,cliente:p.clientes||{},lineas:s}}async function ee(e,t){const i=await Z(e,t);await P(V(i),{tipo:"carta"})}export{Y as a,Q as b,X as c,L as d,ee as i,w as n,W as r};
