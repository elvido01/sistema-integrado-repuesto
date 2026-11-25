const e=a=>String(a??"").replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]),r=a=>Number(a||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),g=a=>`RC-${String(a).padStart(6,"0")}`,f=a=>a?new Date(`${String(a).slice(0,10)}T12:00:00`).toLocaleDateString("es-DO",{day:"2-digit",month:"2-digit",year:"numeric"}):"",v=a=>a?new Date(a).toLocaleTimeString("es-DO",{hour:"2-digit",minute:"2-digit",timeZone:"America/Santo_Domingo"}):"",D="Este recibo no es comprobante fiscal. Si necesita factura con crédito fiscal para su declaración de gastos educativos, solicítela en caja.",y=D;function z(a){var p;const{colegio:t,pago:o}=a,c=a.estudiantes.flatMap(i=>i.lineas.map(d=>({...d,est:i.nombre}))),s=a.estudiantes.length>1,n=a.estudiantes.reduce((i,d)=>i+Number(d.pendiente||0),0);return`<!doctype html><html><head><meta charset="utf-8"><title>${e(g(o.numero))}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  body { margin: 0; padding: 6px 8px 14px; width: 72mm; font-family: Consolas, "Courier New", monospace; font-size: 13px; line-height: 1.4; color: #000; }
  .c { text-align: center; } .b { font-weight: 700; } .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .r { display: flex; justify-content: space-between; gap: 6px; } .tot { font-size: 14px; font-weight: 700; }
  .peq { font-size: 11.5px; } img { width: 56px; height: 56px; display: block; margin: 0 auto 4px; filter: grayscale(1); }
  .anulado { border: 2px solid #000; text-align: center; font-weight: 700; padding: 2px; margin: 4px 0; }
</style></head><body>
  ${t.logo_url?`<img src="${e(t.logo_url)}" alt="">`:""}
  <div class="c b">${e(t.nombre)}</div>
  <div class="c peq">${t.rnc?`RNC ${e(t.rnc)}<br>`:""}${e(t.direccion||"")}${t.telefono?`<br>Tel. ${e(t.telefono)}`:""}</div>
  <div class="sep"></div>
  <div class="c b" style="font-size:13px;letter-spacing:1px">RECIBO DE INGRESO</div>
  ${o.anulado?'<div class="anulado">ANULADO</div>':""}
  <div class="r"><span>No.</span><b>${e(g(o.numero))}</b></div>
  <div class="r"><span>Fecha</span><span>${e(f(o.fecha))} ${e(v(o.created_at))}</span></div>
  ${o.recibo_ingreso?`<div class="r peq"><span>Ref. caja</span><span>${e(o.recibo_ingreso)}</span></div>`:""}
  <div class="sep"></div>
  ${a.estudiantes.map(i=>`<div>Estudiante: <b>${e(i.nombre)}</b></div><div>Curso: ${e(i.curso)}${i.tanda?` · ${e(i.tanda)}`:""}</div>`).join("")}
  <div>${a.familia.tutor_nombre?"Tutor":"Familia"}: ${e(a.familia.tutor_nombre||a.familia.madre_nombre||a.familia.padre_nombre||a.familia.nombre)}</div>
  <div>Año escolar: ${e(((p=a.anio)==null?void 0:p.nombre)||"")}</div>
  <div class="sep"></div>
  ${c.map(i=>`<div class="r"><span>${e(i.descripcion)}${s?` (${e(i.est.split(" ")[0])})`:""}</span><span>${i.moneda==="USD"?`US$${r(i.monto_moneda)}`:r(Number(i.monto)+Number(i.descuento||0))}</span></div>`).join("")}
  ${Number(o.descuento)>0?`<div class="r"><span>Subtotal</span><span>${r(o.subtotal)}</span></div><div class="r"><span>Desc. año completo${o.descuento_pct?` ${Number(o.descuento_pct)}%`:""}${o.descuento_base&&Math.abs(Number(o.descuento_base)-Number(o.subtotal))>.005?` de ${r(o.descuento_base)}`:""}</span><span>-${r(o.descuento)}</span></div>`:o.anio_completo?'<div class="peq">Año completo con descuento en las mensualidades</div>':""}
  <div class="sep"></div>
  <div class="r tot"><span>TOTAL RD$</span><span>${r(o.total)}</span></div>
  ${o.tasa_usd&&c.some(i=>i.moneda==="USD")?`<div class="peq">Tasa US$: ${r(o.tasa_usd)}</div>`:""}
  ${(o.formas_pago||[]).filter(i=>Number(i.monto)>0).map(i=>`<div class="r"><span>${e(i.forma)}${i.referencia?` #${e(i.referencia)}`:""}</span><span>${r(i.monto)}</span></div>`).join("")}
  <div class="sep"></div>
  <div class="r"><span>Pendiente del año</span><span>${r(n)}</span></div>
  ${a.proximoPago?`<div class="peq">Próximo pago: ${e(a.proximoPago)}</div>`:""}
  <div class="sep"></div>
  ${o.usuario?`<div class="peq">Atendido por: ${e(o.usuario)}</div>`:""}
  <div class="peq" style="margin-top:4px">${e(y)}</div>
  <div class="c" style="margin-top:8px">¡Gracias!</div>
</body></html>`}function S(a){const{colegio:t,pago:o}=a,c=(n,p,i,d)=>`<div class="cel ${n}"><div class="k">${e(p)}</div><div class="v">${i}</div><div class="e">${d}</div></div>`,s=n=>{var i;const p=(n.tarjeta||[]).map(d=>{const b=d.descripcion.replace(/^Mensualidad /,"").replace(/ \d{4}$/,"").replace("Reservación de cupo","Reserv. cupo").replace("Sistema Bilingüe","Sist. Bilingüe"),m=d.moneda==="USD"?`US$ ${r(d.monto)}`:r(d.monto);return d.esteRecibo?c("hoy",b,m,"✓ este recibo"):d.estado==="pagado"?c("ok",b,m,"✓ pagado"):d.estado==="parcial"?c("pend",b,m,`Abonado ${r(d.pagado)}`):c("pend",b,m,"Pendiente")}).join("");return`
      <div class="datos">
        <div><span>Estudiante</span><b>${e(n.nombre)}</b> <i class="chip">${n.condicion==="nuevo"?"Nuevo ingreso":"Continuante"}</i></div>
        <div><span>Curso / Tanda</span><b>${e(n.curso)}${n.tanda?` · ${e(n.tanda)}`:""}</b></div>
        <div><span>Tarifa mensual</span><b>RD$ ${r(n.tarifa)}${Number(n.beca_pct)>0?` · beca ${Number(n.beca_pct)}%`:""}</b></div>
      </div>
      <table class="det"><tr><th>Concepto</th><th class="m">Monto RD$</th></tr>
        ${n.lineas.map(d=>`<tr><td>${e(d.descripcion)}${d.moneda==="USD"?` (US$ ${r(d.monto_moneda)})`:""}</td><td class="m">${r(Number(d.monto)+Number(d.descuento||0))}</td></tr>`).join("")}
      </table>
      ${p?`<h2>Tarjeta de pagos ${e(((i=a.anio)==null?void 0:i.nombre)||"")}</h2><div class="tarjeta">${p}</div>`:""}
      <div class="pend-est">Pendiente del año de ${e(n.nombre.split(" ")[0])}: <b>RD$ ${r(n.pendiente)}</b></div>`};return`<!doctype html><html><head><meta charset="utf-8"><title>${e(g(o.numero))}</title>
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
    ${t.logo_url?`<img src="${e(t.logo_url)}" alt="">`:""}
    <div>
      <h1>${e(t.nombre)}</h1>
      ${t.slogan?`<div class="lema">“${e(t.slogan)}”</div>`:""}
      <div class="dat">${t.rnc?`RNC ${e(t.rnc)} · `:""}${e(t.direccion||"")}${t.telefono?`<br>Tel. ${e(t.telefono)}`:""}</div>
    </div>
    <div class="num">
      <div class="t">RECIBO DE INGRESO</div>
      <div class="n">${e(g(o.numero))}</div>
      <div class="f">${e(f(o.fecha))} · ${e(v(o.created_at))}</div>
      ${o.recibo_ingreso?`<div class="f">Ref. caja ${e(o.recibo_ingreso)}</div>`:""}
      ${o.anulado?'<div class="anulado">ANULADO</div>':""}
    </div>
  </div>
  <div class="fam">Familia <b>${e(a.familia.nombre)}</b>${[a.familia.madre_nombre,a.familia.padre_nombre,a.familia.tutor_nombre].filter(Boolean).length?` · ${e([a.familia.madre_nombre,a.familia.padre_nombre,a.familia.tutor_nombre].filter(Boolean).join(" / "))}`:""}${a.familia.telefono?` · ${e(a.familia.telefono)}`:""}</div>
  ${a.estudiantes.map(s).join("")}
  ${Number(o.descuento)>0?`<div class="total" style="font-size:13px;font-weight:600;border-top:1px solid #16325c"><span>Subtotal</span><span>RD$ ${r(o.subtotal)}</span></div>
  <div class="total" style="font-size:13px;font-weight:600;border-top:0;margin-top:0;padding-top:2px"><span>Descuento año completo${o.descuento_pct?` ${Number(o.descuento_pct)}%`:""}${o.descuento_base&&Math.abs(Number(o.descuento_base)-Number(o.subtotal))>.005?` de ${r(o.descuento_base)}`:""}</span><span>-RD$ ${r(o.descuento)}</span></div>`:""}
  <div class="total"><span>TOTAL PAGADO${o.anio_completo?" (año completo con descuento)":""}</span><span>RD$ ${r(o.total)}</span></div>
  <div class="pago">
    <div>Forma de pago: <b>${(o.formas_pago||[]).filter(n=>Number(n.monto)>0).map(n=>`${e(n.forma)} ${r(n.monto)}${n.referencia?` #${e(n.referencia)}`:""}`).join(" · ")}</b></div>
    ${o.tasa_usd&&a.estudiantes.some(n=>n.lineas.some(p=>p.moneda==="USD"))?`<div>Tasa US$: <b>${r(o.tasa_usd)}</b></div>`:""}
    ${a.proximoPago?`<div>Próximo pago: <b>${e(a.proximoPago)}</b></div>`:""}
  </div>
  <div class="pie">
    <div class="nota">${e(y)} ${e(a.reglaRecargo||"")}</div>
    <div class="firma">Recibido por${o.usuario?` · ${e(o.usuario)}`:""}</div>
  </div>
</body></html>`}const x=`
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
`,h=(a,t,o)=>`
  <div class="cab">
    ${a!=null&&a.logo_url?`<img src="${e(a.logo_url)}" alt="">`:""}
    <div><h1>${e((a==null?void 0:a.nombre)||"")}</h1>
      <div class="dat">${a!=null&&a.rnc?`RNC ${e(a.rnc)} · `:""}${e((a==null?void 0:a.direccion)||"")}${a!=null&&a.telefono?` · Tel. ${e(a.telefono)}`:""}</div></div>
    <div class="tit"><div class="t">${e(t)}</div><div class="f">${e(o||"")}</div></div>
  </div>`;function w(a){const t=a.familia||{};let o=0,c=0,s=0;const n=a.estudiantes.map(i=>{const d=i.cargos.filter(l=>l.moneda!=="USD").reduce((l,$)=>l+$.pendiente,0),b=i.cargos.filter(l=>l.moneda==="USD").reduce((l,$)=>l+$.pendiente,0);o+=d,c+=b,s+=i.cargos.filter(l=>l.moneda!=="USD"&&l.vencido).reduce((l,$)=>l+$.pendiente,0);const m=i.cargos.map(l=>{const $=l.estado==="pagado"?'<span class="verde">Pagado</span>':l.vencido?'<span class="rojo">Vencido</span>':l.estado==="parcial"?"Abonado":"Pendiente",u=_=>`${l.moneda==="USD"?"US$ ":""}${r(_)}`;return`<tr><td>${e(l.descripcion)}${l.anio?` <span class="sub">(${e(l.anio)})</span>`:""}</td>
        <td class="m">${u(l.monto)}</td><td class="m">${Number(l.descuento)>0?u(l.descuento):""}</td>
        <td class="m">${u(l.pagado)}</td><td class="m">${l.pendiente>0?u(l.pendiente):""}</td><td>${$}</td></tr>`}).join("");return`<h2>${e(i.nombre)} <span class="sub">· Mat. ${e(i.matricula)} · ${e(i.curso||"")}${i.tanda?` · ${e(i.tanda)}`:""} · RD$ ${r(i.tarifa)}${Number(i.beca_pct)>0?` (beca ${Number(i.beca_pct)}%)`:""}${i.estado!=="activo"?` · ${e(i.estado)}`:""}</span></h2>
      <table><tr><th>Concepto</th><th class="m">Monto</th><th class="m">Descuento</th><th class="m">Pagado</th><th class="m">Pendiente</th><th>Estado</th></tr>
      ${m||'<tr><td colspan="6" class="sub">Sin cargos</td></tr>'}
      <tr class="s"><td colspan="4">Pendiente de ${e(i.nombre.split(" ")[0])}</td><td class="m">${r(d)}${b>0?`<br>US$ ${r(b)}`:""}</td><td></td></tr></table>`}).join(""),p=(a.pagos||[]).map(i=>`<tr class="${i.anulado?"an":""}"><td>${e(g(i.numero))}</td><td>${e(f(i.fecha))}</td><td class="m">${r(i.total)}</td></tr>`).join("");return`<!doctype html><html><head><meta charset="utf-8"><title>Estado de cuenta ${e(t.nombre||"")}</title><style>${x}</style></head><body>
  ${h(a.colegio,"Estado de cuenta",`Al ${f(a.fecha)}`)}
  <div style="margin:8px 0 2px">Familia <b>${e(t.nombre||"")}</b>${[t.madre_nombre,t.padre_nombre,t.tutor_nombre].filter(Boolean).length?` · ${e([t.madre_nombre,t.padre_nombre,t.tutor_nombre].filter(Boolean).join(" / "))}`:""}${t.telefono?` · ${e(t.telefono)}`:""}</div>
  ${n}
  <table style="margin-top:14px"><tr class="t"><td>TOTAL PENDIENTE DE LA FAMILIA</td><td class="m">RD$ ${r(o)}${c>0?` + US$ ${r(c)}`:""}</td></tr>
  ${s>0?`<tr><td class="rojo">De eso, vencido</td><td class="m rojo">RD$ ${r(s)}</td></tr>`:""}</table>
  ${p?`<h2>Últimos pagos</h2><table><tr><th>Recibo</th><th>Fecha</th><th class="m">Total RD$</th></tr>${p}</table>`:""}
  <div class="nota">${e(a.reglaRecargo||"")}</div>
</body></html>`}function N({colegio:a,titulo:t,subtitulo:o,columnas:c,filas:s,total:n,nota:p,horizontal:i}){const d=(m,l)=>{const $=l[m.k];return m.m?`<td class="m">${$===""||$==null?"":r($)}</td>`:`<td>${e($??"")}</td>`},b=s.map(m=>m._grupo?`<tr class="g"><td colspan="${c.length}">${e(m._grupo)}</td></tr>`:`<tr class="${m._sub?"s":""}${m._anulado?" an":""}">${c.map(l=>d(l,m)).join("")}</tr>`).join("");return`<!doctype html><html><head><meta charset="utf-8"><title>${e(t)}</title><style>${x}${i?"@page { size: letter landscape; margin: 10mm; }":""}</style></head><body>
  ${h(a,t,o)}
  <table><tr>${c.map(m=>`<th${m.m?' class="m"':""}>${e(m.t)}</th>`).join("")}</tr>
  ${b||`<tr><td colspan="${c.length}" class="sub">Sin datos</td></tr>`}
  ${n?`<tr class="t">${c.map(m=>d(m,n)).join("")}</tr>`:""}</table>
  ${p?`<div class="nota">${e(p)}</div>`:""}
</body></html>`}function j(a){var s,n,p;const t=a.factura||{},o=String(t.estado||"").toUpperCase()==="ANULADA",c=String(((s=a.cliente)==null?void 0:s.rnc)||"").replace(/\D/g,"").length===9;return`<!doctype html><html><head><meta charset="utf-8"><title>Factura ${e(t.ncf||"")}</title><style>${x}
  .caja { display: flex; justify-content: space-between; gap: 16px; margin: 12px 0; }
  .caja > div { border: 1px solid #d7dce3; border-radius: 6px; padding: 8px 10px; flex: 1; font-size: 12px; line-height: 1.6; }
  .caja span { color: #5b6472; font-size: 10.5px; text-transform: uppercase; }
  .ncf { font-family: Consolas, monospace; font-size: 15px; font-weight: 800; color: #b3261e; }
  .anul { color: #b3261e; font-weight: 800; letter-spacing: 2px; font-size: 16px; text-align: center; border: 2px solid #b3261e; padding: 4px; margin-top: 8px; }
  .firma { width: 220px; border-top: 1px solid #333; text-align: center; padding-top: 4px; font-size: 11px; color: #5b6472; margin: 40px 0 0 auto; }
</style></head><body>
  ${h(a.colegio,"Factura de crédito fiscal",`No. ${t.numero||""}`)}
  ${o?'<div class="anul">ANULADA</div>':""}
  <div class="caja">
    <div><span>NCF</span><br><b class="ncf">${e(t.ncf||"")}</b><br><span>Válido hasta</span> ${e(f(a.vence)||"—")}<br><span>Fecha</span> ${e(f(t.fecha))}</div>
    <div><span>Cliente</span><br><b>${e(((n=a.cliente)==null?void 0:n.nombre)||"")}</b><br><span>${c?"RNC":"Cédula"}</span> ${e(((p=a.cliente)==null?void 0:p.rnc)||"")}<br><span>Forma de pago</span> ${e(String(t.forma_pago||"").replace(/ - RECIBO$/,""))} (pagado)</div>
  </div>
  <table><tr><th>Descripción</th><th class="m">Cant.</th><th class="m">Precio</th><th class="m">ITBIS</th><th class="m">Importe RD$</th></tr>
    ${(a.lineas||[]).map(i=>`<tr><td>${e(i.descripcion)}</td><td class="m">1</td><td class="m">${r(i.importe)}</td><td class="m">E</td><td class="m">${r(i.importe)}</td></tr>`).join("")}
    <tr class="s"><td colspan="4">Subtotal</td><td class="m">${r(t.total)}</td></tr>
    <tr class="s"><td colspan="4">ITBIS (exento, art. 344 núm. 7 del Código Tributario)</td><td class="m">0.00</td></tr>
    <tr class="t"><td colspan="4">TOTAL</td><td class="m">RD$ ${r(t.total)}</td></tr>
  </table>
  <div class="nota">${e(t.notas||"")}<br>E = exento de ITBIS. Válida para deducción de gastos educativos (Ley 179-09) a nombre del contribuyente indicado.</div>
  <div class="firma">Firma autorizada</div>
</body></html>`}function T(a){var p;const t=a.est||{},o=a.fam||{},c=i=>i==null||i===""?"&nbsp;":e(i),s=(i,d,b=1)=>`<div class="cp" style="grid-column: span ${b}"><span>${e(i)}</span><b>${c(d)}</b></div>`,n=(i,d)=>`
    <h2>${d}</h2>
    <div class="g">
      ${s("Nombre",o[`${i}_nombre`],3)}${s("Ocupación",o[`${i}_profesion`])}${s("Lugar de trabajo",o[`${i}_trabajo`],2)}
      ${s("Celular",o[`${i}_celular`],2)}${s("Teléfono",o[`${i}_telefono`],2)}${s("Correo",o[`${i}_correo`],2)}
    </div>`;return`<!doctype html><html><head><meta charset="utf-8"><title>Ficha ${e(t.apellidos||"")} ${e(t.nombres||"")}</title>
<style>${x}
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
  ${h(a.colegio,"Ficha de inscripción",`Año escolar ${a.anio||""}`)}
  <div class="top">
    <div class="foto">${a.foto?`<img src="${a.foto}" alt="">`:"FOTO"}</div>
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
    ${s("Familia",o.nombre,3)}${s("Los padres están",o.estado_padres)}${s("Teléfono residencial",o.telefono_residencial,2)}
    ${s("Dirección residencial",o.direccion,4)}${s("Sector",o.sector,2)}
    ${(p=a.hermanos)!=null&&p.length?s("Hermanos en el colegio",a.hermanos.join(" · "),6):""}
  </div>
  ${n("madre","Madre")}
  ${n("padre","Padre")}
  <h2>Tutor (si no es el padre ni la madre)</h2>
  <div class="g">${s("Nombre",o.tutor_nombre,3)}${s("Teléfono",o.tutor_telefono)}${s("Dirección",o.tutor_direccion,2)}</div>
  ${t.notas?`<h2>Notas</h2><div>${e(t.notas)}</div>`:""}
  <div class="firmas"><div>Firma del padre, madre o tutor</div><div>Firma y sello del colegio</div></div>
  <div class="nota">Impreso el ${e(a.fecha||"")}. Datos confidenciales del estudiante y su familia.</div>
</body></html>`}export{D as N,j as a,z as b,N as c,w as e,T as f,g as n,S as r};
