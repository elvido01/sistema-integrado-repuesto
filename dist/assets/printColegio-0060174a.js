const a=e=>String(e??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]),l=e=>Number(e||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),g=e=>`RC-${String(e).padStart(6,"0")}`,f=e=>e?new Date(`${String(e).slice(0,10)}T12:00:00`).toLocaleDateString("es-DO",{day:"2-digit",month:"2-digit",year:"numeric"}):"",v=e=>e?new Date(e).toLocaleTimeString("es-DO",{hour:"2-digit",minute:"2-digit",timeZone:"America/Santo_Domingo"}):"",z="Este recibo no es comprobante fiscal. Si necesita factura con crédito fiscal para su declaración de gastos educativos, solicítela en caja.",y=z;function D(e){var p;const{colegio:t,pago:i}=e,c=e.estudiantes.flatMap(o=>o.lineas.map(d=>({...d,est:o.nombre}))),s=e.estudiantes.length>1,n=e.estudiantes.reduce((o,d)=>o+Number(d.pendiente||0),0);return`<!doctype html><html><head><meta charset="utf-8"><title>${a(g(i.numero))}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  body { margin: 0; padding: 6px 8px 14px; width: 72mm; font-family: Consolas, "Courier New", monospace; font-size: 13px; line-height: 1.4; color: #000; }
  .c { text-align: center; } .b { font-weight: 700; } .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .r { display: flex; justify-content: space-between; gap: 6px; } .tot { font-size: 14px; font-weight: 700; }
  .peq { font-size: 11.5px; } img { width: 56px; height: 56px; display: block; margin: 0 auto 4px; filter: grayscale(1); }
  .anulado { border: 2px solid #000; text-align: center; font-weight: 700; padding: 2px; margin: 4px 0; }
</style></head><body>
  ${t.logo_url?`<img src="${a(t.logo_url)}" alt="">`:""}
  <div class="c b">${a(t.nombre)}</div>
  <div class="c peq">${t.rnc?`RNC ${a(t.rnc)}<br>`:""}${a(t.direccion||"")}${t.telefono?`<br>Tel. ${a(t.telefono)}`:""}</div>
  <div class="sep"></div>
  <div class="c b" style="font-size:13px;letter-spacing:1px">RECIBO DE INGRESO</div>
  ${i.anulado?'<div class="anulado">ANULADO</div>':""}
  <div class="r"><span>No.</span><b>${a(g(i.numero))}</b></div>
  <div class="r"><span>Fecha</span><span>${a(f(i.fecha))} ${a(v(i.created_at))}</span></div>
  ${i.recibo_ingreso?`<div class="r peq"><span>Ref. caja</span><span>${a(i.recibo_ingreso)}</span></div>`:""}
  <div class="sep"></div>
  ${e.estudiantes.map(o=>`<div>Estudiante: <b>${a(o.nombre)}</b></div><div>Curso: ${a(o.curso)}${o.tanda?` · ${a(o.tanda)}`:""}</div>`).join("")}
  <div>${e.familia.tutor_nombre?"Tutor":"Familia"}: ${a(e.familia.tutor_nombre||e.familia.madre_nombre||e.familia.padre_nombre||e.familia.nombre)}</div>
  <div>Año escolar: ${a(((p=e.anio)==null?void 0:p.nombre)||"")}</div>
  <div class="sep"></div>
  ${c.map(o=>`<div class="r"><span>${a(o.descripcion)}${s?` (${a(o.est.split(" ")[0])})`:""}</span><span>${o.moneda==="USD"?`US$${l(o.monto_moneda)}`:l(o.monto)}</span></div>`).join("")}
  ${i.anio_completo?'<div class="peq">Año completo con descuento en las mensualidades</div>':""}
  <div class="sep"></div>
  <div class="r tot"><span>TOTAL RD$</span><span>${l(i.total)}</span></div>
  ${i.tasa_usd&&c.some(o=>o.moneda==="USD")?`<div class="peq">Tasa US$: ${l(i.tasa_usd)}</div>`:""}
  ${(i.formas_pago||[]).filter(o=>Number(o.monto)>0).map(o=>`<div class="r"><span>${a(o.forma)}${o.referencia?` #${a(o.referencia)}`:""}</span><span>${l(o.monto)}</span></div>`).join("")}
  <div class="sep"></div>
  <div class="r"><span>Pendiente del año</span><span>${l(n)}</span></div>
  ${e.proximoPago?`<div class="peq">Próximo pago: ${a(e.proximoPago)}</div>`:""}
  <div class="sep"></div>
  ${i.usuario?`<div class="peq">Atendido por: ${a(i.usuario)}</div>`:""}
  <div class="peq" style="margin-top:4px">${a(y)}</div>
  <div class="c" style="margin-top:8px">¡Gracias!</div>
</body></html>`}function S(e){const{colegio:t,pago:i}=e,c=(n,p,o,d)=>`<div class="cel ${n}"><div class="k">${a(p)}</div><div class="v">${o}</div><div class="e">${d}</div></div>`,s=n=>{var o;const p=(n.tarjeta||[]).map(d=>{const $=d.descripcion.replace(/^Mensualidad /,"").replace(/ \d{4}$/,"").replace("Reservación de cupo","Reserv. cupo").replace("Sistema Bilingüe","Sist. Bilingüe"),m=d.moneda==="USD"?`US$ ${l(d.monto)}`:l(d.monto);return d.esteRecibo?c("hoy",$,m,"✓ este recibo"):d.estado==="pagado"?c("ok",$,m,"✓ pagado"):d.estado==="parcial"?c("pend",$,m,`Abonado ${l(d.pagado)}`):c("pend",$,m,"Pendiente")}).join("");return`
      <div class="datos">
        <div><span>Estudiante</span><b>${a(n.nombre)}</b> <i class="chip">${n.condicion==="nuevo"?"Nuevo ingreso":"Continuante"}</i></div>
        <div><span>Curso / Tanda</span><b>${a(n.curso)}${n.tanda?` · ${a(n.tanda)}`:""}</b></div>
        <div><span>Tarifa mensual</span><b>RD$ ${l(n.tarifa)}${Number(n.beca_pct)>0?` · beca ${Number(n.beca_pct)}%`:""}</b></div>
      </div>
      <table class="det"><tr><th>Concepto</th><th class="m">Monto RD$</th></tr>
        ${n.lineas.map(d=>`<tr><td>${a(d.descripcion)}${d.moneda==="USD"?` (US$ ${l(d.monto_moneda)})`:""}</td><td class="m">${l(d.monto)}</td></tr>`).join("")}
      </table>
      ${p?`<h2>Tarjeta de pagos ${a(((o=e.anio)==null?void 0:o.nombre)||"")}</h2><div class="tarjeta">${p}</div>`:""}
      <div class="pend-est">Pendiente del año de ${a(n.nombre.split(" ")[0])}: <b>RD$ ${l(n.pendiente)}</b></div>`};return`<!doctype html><html><head><meta charset="utf-8"><title>${a(g(i.numero))}</title>
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
      <div class="n">${a(g(i.numero))}</div>
      <div class="f">${a(f(i.fecha))} · ${a(v(i.created_at))}</div>
      ${i.recibo_ingreso?`<div class="f">Ref. caja ${a(i.recibo_ingreso)}</div>`:""}
      ${i.anulado?'<div class="anulado">ANULADO</div>':""}
    </div>
  </div>
  <div class="fam">Familia <b>${a(e.familia.nombre)}</b>${[e.familia.madre_nombre,e.familia.padre_nombre,e.familia.tutor_nombre].filter(Boolean).length?` · ${a([e.familia.madre_nombre,e.familia.padre_nombre,e.familia.tutor_nombre].filter(Boolean).join(" / "))}`:""}${e.familia.telefono?` · ${a(e.familia.telefono)}`:""}</div>
  ${e.estudiantes.map(s).join("")}
  <div class="total"><span>TOTAL PAGADO${i.anio_completo?" (año completo con descuento)":""}</span><span>RD$ ${l(i.total)}</span></div>
  <div class="pago">
    <div>Forma de pago: <b>${(i.formas_pago||[]).filter(n=>Number(n.monto)>0).map(n=>`${a(n.forma)} ${l(n.monto)}${n.referencia?` #${a(n.referencia)}`:""}`).join(" · ")}</b></div>
    ${i.tasa_usd&&e.estudiantes.some(n=>n.lineas.some(p=>p.moneda==="USD"))?`<div>Tasa US$: <b>${l(i.tasa_usd)}</b></div>`:""}
    ${e.proximoPago?`<div>Próximo pago: <b>${a(e.proximoPago)}</b></div>`:""}
  </div>
  <div class="pie">
    <div class="nota">${a(y)} ${a(e.reglaRecargo||"")}</div>
    <div class="firma">Recibido por${i.usuario?` · ${a(i.usuario)}`:""}</div>
  </div>
</body></html>`}const u=`
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
`,h=(e,t,i)=>`
  <div class="cab">
    ${e!=null&&e.logo_url?`<img src="${a(e.logo_url)}" alt="">`:""}
    <div><h1>${a((e==null?void 0:e.nombre)||"")}</h1>
      <div class="dat">${e!=null&&e.rnc?`RNC ${a(e.rnc)} · `:""}${a((e==null?void 0:e.direccion)||"")}${e!=null&&e.telefono?` · Tel. ${a(e.telefono)}`:""}</div></div>
    <div class="tit"><div class="t">${a(t)}</div><div class="f">${a(i||"")}</div></div>
  </div>`;function w(e){const t=e.familia||{};let i=0,c=0,s=0;const n=e.estudiantes.map(o=>{const d=o.cargos.filter(r=>r.moneda!=="USD").reduce((r,b)=>r+b.pendiente,0),$=o.cargos.filter(r=>r.moneda==="USD").reduce((r,b)=>r+b.pendiente,0);i+=d,c+=$,s+=o.cargos.filter(r=>r.moneda!=="USD"&&r.vencido).reduce((r,b)=>r+b.pendiente,0);const m=o.cargos.map(r=>{const b=r.estado==="pagado"?'<span class="verde">Pagado</span>':r.vencido?'<span class="rojo">Vencido</span>':r.estado==="parcial"?"Abonado":"Pendiente",x=_=>`${r.moneda==="USD"?"US$ ":""}${l(_)}`;return`<tr><td>${a(r.descripcion)}${r.anio?` <span class="sub">(${a(r.anio)})</span>`:""}</td>
        <td class="m">${x(r.monto)}</td><td class="m">${Number(r.descuento)>0?x(r.descuento):""}</td>
        <td class="m">${x(r.pagado)}</td><td class="m">${r.pendiente>0?x(r.pendiente):""}</td><td>${b}</td></tr>`}).join("");return`<h2>${a(o.nombre)} <span class="sub">· Mat. ${a(o.matricula)} · ${a(o.curso||"")}${o.tanda?` · ${a(o.tanda)}`:""} · RD$ ${l(o.tarifa)}${Number(o.beca_pct)>0?` (beca ${Number(o.beca_pct)}%)`:""}${o.estado!=="activo"?` · ${a(o.estado)}`:""}</span></h2>
      <table><tr><th>Concepto</th><th class="m">Monto</th><th class="m">Descuento</th><th class="m">Pagado</th><th class="m">Pendiente</th><th>Estado</th></tr>
      ${m||'<tr><td colspan="6" class="sub">Sin cargos</td></tr>'}
      <tr class="s"><td colspan="4">Pendiente de ${a(o.nombre.split(" ")[0])}</td><td class="m">${l(d)}${$>0?`<br>US$ ${l($)}`:""}</td><td></td></tr></table>`}).join(""),p=(e.pagos||[]).map(o=>`<tr class="${o.anulado?"an":""}"><td>${a(g(o.numero))}</td><td>${a(f(o.fecha))}</td><td class="m">${l(o.total)}</td></tr>`).join("");return`<!doctype html><html><head><meta charset="utf-8"><title>Estado de cuenta ${a(t.nombre||"")}</title><style>${u}</style></head><body>
  ${h(e.colegio,"Estado de cuenta",`Al ${f(e.fecha)}`)}
  <div style="margin:8px 0 2px">Familia <b>${a(t.nombre||"")}</b>${[t.madre_nombre,t.padre_nombre,t.tutor_nombre].filter(Boolean).length?` · ${a([t.madre_nombre,t.padre_nombre,t.tutor_nombre].filter(Boolean).join(" / "))}`:""}${t.telefono?` · ${a(t.telefono)}`:""}</div>
  ${n}
  <table style="margin-top:14px"><tr class="t"><td>TOTAL PENDIENTE DE LA FAMILIA</td><td class="m">RD$ ${l(i)}${c>0?` + US$ ${l(c)}`:""}</td></tr>
  ${s>0?`<tr><td class="rojo">De eso, vencido</td><td class="m rojo">RD$ ${l(s)}</td></tr>`:""}</table>
  ${p?`<h2>Últimos pagos</h2><table><tr><th>Recibo</th><th>Fecha</th><th class="m">Total RD$</th></tr>${p}</table>`:""}
  <div class="nota">${a(e.reglaRecargo||"")}</div>
</body></html>`}function j({colegio:e,titulo:t,subtitulo:i,columnas:c,filas:s,total:n,nota:p,horizontal:o}){const d=(m,r)=>{const b=r[m.k];return m.m?`<td class="m">${b===""||b==null?"":l(b)}</td>`:`<td>${a(b??"")}</td>`},$=s.map(m=>m._grupo?`<tr class="g"><td colspan="${c.length}">${a(m._grupo)}</td></tr>`:`<tr class="${m._sub?"s":""}${m._anulado?" an":""}">${c.map(r=>d(r,m)).join("")}</tr>`).join("");return`<!doctype html><html><head><meta charset="utf-8"><title>${a(t)}</title><style>${u}${o?"@page { size: letter landscape; margin: 10mm; }":""}</style></head><body>
  ${h(e,t,i)}
  <table><tr>${c.map(m=>`<th${m.m?' class="m"':""}>${a(m.t)}</th>`).join("")}</tr>
  ${$||`<tr><td colspan="${c.length}" class="sub">Sin datos</td></tr>`}
  ${n?`<tr class="t">${c.map(m=>d(m,n)).join("")}</tr>`:""}</table>
  ${p?`<div class="nota">${a(p)}</div>`:""}
</body></html>`}function T(e){var s,n,p;const t=e.factura||{},i=String(t.estado||"").toUpperCase()==="ANULADA",c=String(((s=e.cliente)==null?void 0:s.rnc)||"").replace(/\D/g,"").length===9;return`<!doctype html><html><head><meta charset="utf-8"><title>Factura ${a(t.ncf||"")}</title><style>${u}
  .caja { display: flex; justify-content: space-between; gap: 16px; margin: 12px 0; }
  .caja > div { border: 1px solid #d7dce3; border-radius: 6px; padding: 8px 10px; flex: 1; font-size: 12px; line-height: 1.6; }
  .caja span { color: #5b6472; font-size: 10.5px; text-transform: uppercase; }
  .ncf { font-family: Consolas, monospace; font-size: 15px; font-weight: 800; color: #b3261e; }
  .anul { color: #b3261e; font-weight: 800; letter-spacing: 2px; font-size: 16px; text-align: center; border: 2px solid #b3261e; padding: 4px; margin-top: 8px; }
  .firma { width: 220px; border-top: 1px solid #333; text-align: center; padding-top: 4px; font-size: 11px; color: #5b6472; margin: 40px 0 0 auto; }
</style></head><body>
  ${h(e.colegio,"Factura de crédito fiscal",`No. ${t.numero||""}`)}
  ${i?'<div class="anul">ANULADA</div>':""}
  <div class="caja">
    <div><span>NCF</span><br><b class="ncf">${a(t.ncf||"")}</b><br><span>Válido hasta</span> ${a(f(e.vence)||"—")}<br><span>Fecha</span> ${a(f(t.fecha))}</div>
    <div><span>Cliente</span><br><b>${a(((n=e.cliente)==null?void 0:n.nombre)||"")}</b><br><span>${c?"RNC":"Cédula"}</span> ${a(((p=e.cliente)==null?void 0:p.rnc)||"")}<br><span>Forma de pago</span> ${a(String(t.forma_pago||"").replace(/ - RECIBO$/,""))} (pagado)</div>
  </div>
  <table><tr><th>Descripción</th><th class="m">Cant.</th><th class="m">Precio</th><th class="m">ITBIS</th><th class="m">Importe RD$</th></tr>
    ${(e.lineas||[]).map(o=>`<tr><td>${a(o.descripcion)}</td><td class="m">1</td><td class="m">${l(o.importe)}</td><td class="m">E</td><td class="m">${l(o.importe)}</td></tr>`).join("")}
    <tr class="s"><td colspan="4">Subtotal</td><td class="m">${l(t.total)}</td></tr>
    <tr class="s"><td colspan="4">ITBIS (exento, art. 344 núm. 7 del Código Tributario)</td><td class="m">0.00</td></tr>
    <tr class="t"><td colspan="4">TOTAL</td><td class="m">RD$ ${l(t.total)}</td></tr>
  </table>
  <div class="nota">${a(t.notas||"")}<br>E = exento de ITBIS. Válida para deducción de gastos educativos (Ley 179-09) a nombre del contribuyente indicado.</div>
  <div class="firma">Firma autorizada</div>
</body></html>`}function C(e){var p;const t=e.est||{},i=e.fam||{},c=o=>o==null||o===""?"&nbsp;":a(o),s=(o,d,$=1)=>`<div class="cp" style="grid-column: span ${$}"><span>${a(o)}</span><b>${c(d)}</b></div>`,n=(o,d)=>`
    <h2>${d}</h2>
    <div class="g">
      ${s("Nombre",i[`${o}_nombre`],3)}${s("Ocupación",i[`${o}_profesion`])}${s("Lugar de trabajo",i[`${o}_trabajo`],2)}
      ${s("Celular",i[`${o}_celular`],2)}${s("Teléfono",i[`${o}_telefono`],2)}${s("Correo",i[`${o}_correo`],2)}
    </div>`;return`<!doctype html><html><head><meta charset="utf-8"><title>Ficha ${a(t.apellidos||"")} ${a(t.nombres||"")}</title>
<style>${u}
  .top { display: flex; gap: 14px; margin-top: 10px; }
  .foto { width: 30mm; height: 38mm; border: 1px solid #9aa1ab; display: flex; align-items: center; justify-content: center; color: #9aa1ab; font-size: 10px; flex-shrink: 0; overflow: hidden; }
  .foto img { width: 100%; height: 100%; object-fit: cover; }
  .g { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px 10px; }
  .top .g { flex: 1; align-content: start; }
  .cp { border-bottom: 1px solid #c6ccd4; padding: 1px 0 2px; min-width: 0; }
  .cp span { display: block; font-size: 8.5px; color: #5b6472; text-transform: uppercase; letter-spacing: .3px; }
  .cp b { display: block; font-size: 11.5px; font-weight: 600; min-height: 15px; overflow-wrap: anywhere; }
  h2 { border-bottom: 2px solid #16325c; padding-bottom: 2px; margin: 12px 0 6px; text-transform: uppercase; letter-spacing: .4px; }
  .firmas { display: flex; gap: 40px; margin-top: 46px; }
  .firmas div { flex: 1; border-top: 1px solid #1b2330; text-align: center; padding-top: 3px; font-size: 10.5px; }
</style></head><body>
  ${h(e.colegio,"Ficha de inscripción",`Año escolar ${e.anio||""}`)}
  <div class="top">
    <div class="foto">${e.foto?`<img src="${e.foto}" alt="">`:"FOTO"}</div>
    <div class="g">
      ${s("Matrícula",t.matricula)}${s("Apellidos",t.apellidos,3)}${s("Estado",t.estado,2)}
      ${s("Nombres",t.nombres,4)}${s("Fecha de nacimiento",t.fecha_nacimiento)}${s("Edad",t.edad!=null?`${t.edad} años`:"")}
      ${s("Lugar de nacimiento",t.lugar_nacimiento,3)}${s("Núm. de hermanos",t.numero_hermanos)}${s("Edades de los hermanos",t.edades_hermanos)}${s("Posición en la familia",t.posicion_familia)}
    </div>
  </div>
  <h2>Inscripción</h2>
  <div class="g">
    ${s("Curso",t.curso,2)}${s("Tanda",t.tanda)}${s("Sección",t.seccion)}${s("Condición",t.condicion,2)}
    ${s("Mensualidad RD$",t.mensualidad)}${s("Beca",t.beca_pct>0?`${t.beca_pct}%`:"No")}${s("Motivo de la beca",t.beca_motivo,2)}${s("Sala de Tareas",t.sala_tareas?"Sí":"No",2)}
  </div>
  <h2>Familia</h2>
  <div class="g">
    ${s("Familia",i.nombre,3)}${s("Los padres están",i.estado_padres)}${s("Teléfono residencial",i.telefono_residencial,2)}
    ${s("Dirección residencial",i.direccion,4)}${s("Sector",i.sector,2)}
    ${(p=e.hermanos)!=null&&p.length?s("Hermanos en el colegio",e.hermanos.join(" · "),6):""}
  </div>
  ${n("madre","Madre")}
  ${n("padre","Padre")}
  <h2>Tutor (si no es el padre ni la madre)</h2>
  <div class="g">${s("Nombre",i.tutor_nombre,3)}${s("Teléfono",i.tutor_telefono)}${s("Dirección",i.tutor_direccion,2)}</div>
  ${t.notas?`<h2>Notas</h2><div>${a(t.notas)}</div>`:""}
  <div class="firmas"><div>Firma del padre, madre o tutor</div><div>Firma y sello del colegio</div></div>
  <div class="nota">Impreso el ${a(e.fecha||"")}. Datos confidenciales del estudiante y su familia.</div>
</body></html>`}export{z as N,T as a,D as b,j as c,w as e,C as f,g as n,S as r};
