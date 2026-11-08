import{c_ as C,s as $,cV as H,c$ as O,cX as G,d0 as I,d1 as E,d2 as P,d3 as V}from"./index-246aaf33.js";const o=e=>String(e??"").replace(/[&<>"']/g,a=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[a]),m=e=>Number(e||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),S=e=>`RC-${String(e).padStart(6,"0")}`,y=e=>e?new Date(`${String(e).slice(0,10)}T12:00:00`).toLocaleDateString("es-DO",{day:"2-digit",month:"2-digit",year:"numeric"}):"",L=e=>e?new Date(e).toLocaleTimeString("es-DO",{hour:"2-digit",minute:"2-digit",timeZone:"America/Santo_Domingo"}):"",M="Este recibo no es comprobante fiscal. Si necesita factura con crédito fiscal para su declaración de gastos educativos, solicítela en caja.";function ae(e){var p;const{colegio:a,pago:t}=e,d=e.estudiantes.flatMap(i=>i.lineas.map(r=>({...r,est:i.nombre}))),n=e.estudiantes.length>1,s=e.estudiantes.reduce((i,r)=>i+Number(r.pendiente||0),0);return`<!doctype html><html><head><meta charset="utf-8"><title>${o(S(t.numero))}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  body { margin: 0; padding: 6px 8px 14px; width: 72mm; font-family: Consolas, "Courier New", monospace; font-size: 11.5px; line-height: 1.4; color: #000; }
  .c { text-align: center; } .b { font-weight: 700; } .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .r { display: flex; justify-content: space-between; gap: 6px; } .tot { font-size: 14px; font-weight: 700; }
  .peq { font-size: 10px; } img { width: 56px; height: 56px; display: block; margin: 0 auto 4px; filter: grayscale(1); }
  .anulado { border: 2px solid #000; text-align: center; font-weight: 700; padding: 2px; margin: 4px 0; }
</style></head><body>
  ${a.logo_url?`<img src="${o(a.logo_url)}" alt="">`:""}
  <div class="c b">${o(a.nombre)}</div>
  <div class="c peq">${a.rnc?`RNC ${o(a.rnc)}<br>`:""}${o(a.direccion||"")}${a.telefono?`<br>Tel. ${o(a.telefono)}`:""}</div>
  <div class="sep"></div>
  <div class="c b" style="font-size:13px;letter-spacing:1px">RECIBO DE INGRESO</div>
  ${t.anulado?'<div class="anulado">ANULADO</div>':""}
  <div class="r"><span>No.</span><b>${o(S(t.numero))}</b></div>
  <div class="r"><span>Fecha</span><span>${o(y(t.fecha))} ${o(L(t.created_at))}</span></div>
  ${t.recibo_ingreso?`<div class="r peq"><span>Ref. caja</span><span>${o(t.recibo_ingreso)}</span></div>`:""}
  <div class="sep"></div>
  ${e.estudiantes.map(i=>`<div>Estudiante: <b>${o(i.nombre)}</b></div><div>Curso: ${o(i.curso)}${i.tanda?` · ${o(i.tanda)}`:""}</div>`).join("")}
  <div>${e.familia.tutor_nombre?"Tutor":"Familia"}: ${o(e.familia.tutor_nombre||e.familia.madre_nombre||e.familia.padre_nombre||e.familia.nombre)}</div>
  <div>Año escolar: ${o(((p=e.anio)==null?void 0:p.nombre)||"")}</div>
  <div class="sep"></div>
  ${d.map(i=>`<div class="r"><span>${o(i.descripcion)}${n?` (${o(i.est.split(" ")[0])})`:""}</span><span>${i.moneda==="USD"?`US$${m(i.monto_moneda)}`:m(i.monto)}</span></div>`).join("")}
  ${t.anio_completo?'<div class="peq">Año completo con descuento en las mensualidades</div>':""}
  <div class="sep"></div>
  <div class="r tot"><span>TOTAL RD$</span><span>${m(t.total)}</span></div>
  ${t.tasa_usd&&d.some(i=>i.moneda==="USD")?`<div class="peq">Tasa US$: ${m(t.tasa_usd)}</div>`:""}
  ${(t.formas_pago||[]).filter(i=>Number(i.monto)>0).map(i=>`<div class="r"><span>${o(i.forma)}${i.referencia?` #${o(i.referencia)}`:""}</span><span>${m(i.monto)}</span></div>`).join("")}
  <div class="sep"></div>
  <div class="r"><span>Pendiente del año</span><span>${m(s)}</span></div>
  ${e.proximoPago?`<div class="peq">Próximo pago: ${o(e.proximoPago)}</div>`:""}
  <div class="sep"></div>
  ${t.usuario?`<div class="peq">Atendido por: ${o(t.usuario)}</div>`:""}
  <div class="peq" style="margin-top:4px">${o(M)}</div>
  <div class="c" style="margin-top:8px">¡Gracias!</div>
</body></html>`}function oe(e){const{colegio:a,pago:t}=e,d=(s,p,i,r)=>`<div class="cel ${s}"><div class="k">${o(p)}</div><div class="v">${i}</div><div class="e">${r}</div></div>`,n=s=>{var i;const p=(s.tarjeta||[]).map(r=>{const b=r.descripcion.replace(/^Mensualidad /,"").replace(/ \d{4}$/,"").replace("Reservación de cupo","Reserv. cupo").replace("Sistema Bilingüe","Sist. Bilingüe"),l=r.moneda==="USD"?`US$ ${m(r.monto)}`:m(r.monto);return r.esteRecibo?d("hoy",b,l,"✓ este recibo"):r.estado==="pagado"?d("ok",b,l,"✓ pagado"):r.estado==="parcial"?d("pend",b,l,`Abonado ${m(r.pagado)}`):d("pend",b,l,"Pendiente")}).join("");return`
      <div class="datos">
        <div><span>Estudiante</span><b>${o(s.nombre)}</b> <i class="chip">${s.condicion==="nuevo"?"Nuevo ingreso":"Continuante"}</i></div>
        <div><span>Curso / Tanda</span><b>${o(s.curso)}${s.tanda?` · ${o(s.tanda)}`:""}</b></div>
        <div><span>Tarifa mensual</span><b>RD$ ${m(s.tarifa)}${Number(s.beca_pct)>0?` · beca ${Number(s.beca_pct)}%`:""}</b></div>
      </div>
      <table class="det"><tr><th>Concepto</th><th class="m">Monto RD$</th></tr>
        ${s.lineas.map(r=>`<tr><td>${o(r.descripcion)}${r.moneda==="USD"?` (US$ ${m(r.monto_moneda)})`:""}</td><td class="m">${m(r.monto)}</td></tr>`).join("")}
      </table>
      ${p?`<h2>Tarjeta de pagos ${o(((i=e.anio)==null?void 0:i.nombre)||"")}</h2><div class="tarjeta">${p}</div>`:""}
      <div class="pend-est">Pendiente del año de ${o(s.nombre.split(" ")[0])}: <b>RD$ ${m(s.pendiente)}</b></div>`};return`<!doctype html><html><head><meta charset="utf-8"><title>${o(S(t.numero))}</title>
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
    ${a.logo_url?`<img src="${o(a.logo_url)}" alt="">`:""}
    <div>
      <h1>${o(a.nombre)}</h1>
      ${a.slogan?`<div class="lema">“${o(a.slogan)}”</div>`:""}
      <div class="dat">${a.rnc?`RNC ${o(a.rnc)} · `:""}${o(a.direccion||"")}${a.telefono?`<br>Tel. ${o(a.telefono)}`:""}</div>
    </div>
    <div class="num">
      <div class="t">RECIBO DE INGRESO</div>
      <div class="n">${o(S(t.numero))}</div>
      <div class="f">${o(y(t.fecha))} · ${o(L(t.created_at))}</div>
      ${t.recibo_ingreso?`<div class="f">Ref. caja ${o(t.recibo_ingreso)}</div>`:""}
      ${t.anulado?'<div class="anulado">ANULADO</div>':""}
    </div>
  </div>
  <div class="fam">Familia <b>${o(e.familia.nombre)}</b>${[e.familia.madre_nombre,e.familia.padre_nombre,e.familia.tutor_nombre].filter(Boolean).length?` · ${o([e.familia.madre_nombre,e.familia.padre_nombre,e.familia.tutor_nombre].filter(Boolean).join(" / "))}`:""}${e.familia.telefono?` · ${o(e.familia.telefono)}`:""}</div>
  ${e.estudiantes.map(n).join("")}
  <div class="total"><span>TOTAL PAGADO${t.anio_completo?" (año completo con descuento)":""}</span><span>RD$ ${m(t.total)}</span></div>
  <div class="pago">
    <div>Forma de pago: <b>${(t.formas_pago||[]).filter(s=>Number(s.monto)>0).map(s=>`${o(s.forma)} ${m(s.monto)}${s.referencia?` #${o(s.referencia)}`:""}`).join(" · ")}</b></div>
    ${t.tasa_usd&&e.estudiantes.some(s=>s.lineas.some(p=>p.moneda==="USD"))?`<div>Tasa US$: <b>${m(t.tasa_usd)}</b></div>`:""}
    ${e.proximoPago?`<div>Próximo pago: <b>${o(e.proximoPago)}</b></div>`:""}
  </div>
  <div class="pie">
    <div class="nota">${o(M)} ${o(e.reglaRecargo||"")}</div>
    <div class="firma">Recibido por${t.usuario?` · ${o(t.usuario)}`:""}</div>
  </div>
</body></html>`}const T=`
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
`,N=(e,a,t)=>`
  <div class="cab">
    ${e!=null&&e.logo_url?`<img src="${o(e.logo_url)}" alt="">`:""}
    <div><h1>${o((e==null?void 0:e.nombre)||"")}</h1>
      <div class="dat">${e!=null&&e.rnc?`RNC ${o(e.rnc)} · `:""}${o((e==null?void 0:e.direccion)||"")}${e!=null&&e.telefono?` · Tel. ${o(e.telefono)}`:""}</div></div>
    <div class="tit"><div class="t">${o(a)}</div><div class="f">${o(t||"")}</div></div>
  </div>`;function X(e){const a=e.familia||{};let t=0,d=0,n=0;const s=e.estudiantes.map(i=>{const r=i.cargos.filter(c=>c.moneda!=="USD").reduce((c,u)=>c+u.pendiente,0),b=i.cargos.filter(c=>c.moneda==="USD").reduce((c,u)=>c+u.pendiente,0);t+=r,d+=b,n+=i.cargos.filter(c=>c.moneda!=="USD"&&c.vencido).reduce((c,u)=>c+u.pendiente,0);const l=i.cargos.map(c=>{const u=c.estado==="pagado"?'<span class="verde">Pagado</span>':c.vencido?'<span class="rojo">Vencido</span>':c.estado==="parcial"?"Abonado":"Pendiente",x=h=>`${c.moneda==="USD"?"US$ ":""}${m(h)}`;return`<tr><td>${o(c.descripcion)}${c.anio?` <span class="sub">(${o(c.anio)})</span>`:""}</td>
        <td class="m">${x(c.monto)}</td><td class="m">${Number(c.descuento)>0?x(c.descuento):""}</td>
        <td class="m">${x(c.pagado)}</td><td class="m">${c.pendiente>0?x(c.pendiente):""}</td><td>${u}</td></tr>`}).join("");return`<h2>${o(i.nombre)} <span class="sub">· Mat. ${o(i.matricula)} · ${o(i.curso||"")}${i.tanda?` · ${o(i.tanda)}`:""} · RD$ ${m(i.tarifa)}${Number(i.beca_pct)>0?` (beca ${Number(i.beca_pct)}%)`:""}${i.estado!=="activo"?` · ${o(i.estado)}`:""}</span></h2>
      <table><tr><th>Concepto</th><th class="m">Monto</th><th class="m">Descuento</th><th class="m">Pagado</th><th class="m">Pendiente</th><th>Estado</th></tr>
      ${l||'<tr><td colspan="6" class="sub">Sin cargos</td></tr>'}
      <tr class="s"><td colspan="4">Pendiente de ${o(i.nombre.split(" ")[0])}</td><td class="m">${m(r)}${b>0?`<br>US$ ${m(b)}`:""}</td><td></td></tr></table>`}).join(""),p=(e.pagos||[]).map(i=>`<tr class="${i.anulado?"an":""}"><td>${o(S(i.numero))}</td><td>${o(y(i.fecha))}</td><td class="m">${m(i.total)}</td></tr>`).join("");return`<!doctype html><html><head><meta charset="utf-8"><title>Estado de cuenta ${o(a.nombre||"")}</title><style>${T}</style></head><body>
  ${N(e.colegio,"Estado de cuenta",`Al ${y(e.fecha)}`)}
  <div style="margin:8px 0 2px">Familia <b>${o(a.nombre||"")}</b>${[a.madre_nombre,a.padre_nombre,a.tutor_nombre].filter(Boolean).length?` · ${o([a.madre_nombre,a.padre_nombre,a.tutor_nombre].filter(Boolean).join(" / "))}`:""}${a.telefono?` · ${o(a.telefono)}`:""}</div>
  ${s}
  <table style="margin-top:14px"><tr class="t"><td>TOTAL PENDIENTE DE LA FAMILIA</td><td class="m">RD$ ${m(t)}${d>0?` + US$ ${m(d)}`:""}</td></tr>
  ${n>0?`<tr><td class="rojo">De eso, vencido</td><td class="m rojo">RD$ ${m(n)}</td></tr>`:""}</table>
  ${p?`<h2>Últimos pagos</h2><table><tr><th>Recibo</th><th>Fecha</th><th class="m">Total RD$</th></tr>${p}</table>`:""}
  <div class="nota">${o(e.reglaRecargo||"")}</div>
</body></html>`}function te({colegio:e,titulo:a,subtitulo:t,columnas:d,filas:n,total:s,nota:p,horizontal:i}){const r=(l,c)=>{const u=c[l.k];return l.m?`<td class="m">${u===""||u==null?"":m(u)}</td>`:`<td>${o(u??"")}</td>`},b=n.map(l=>l._grupo?`<tr class="g"><td colspan="${d.length}">${o(l._grupo)}</td></tr>`:`<tr class="${l._sub?"s":""}${l._anulado?" an":""}">${d.map(c=>r(c,l)).join("")}</tr>`).join("");return`<!doctype html><html><head><meta charset="utf-8"><title>${o(a)}</title><style>${T}${i?"@page { size: letter landscape; margin: 10mm; }":""}</style></head><body>
  ${N(e,a,t)}
  <table><tr>${d.map(l=>`<th${l.m?' class="m"':""}>${o(l.t)}</th>`).join("")}</tr>
  ${b||`<tr><td colspan="${d.length}" class="sub">Sin datos</td></tr>`}
  ${s?`<tr class="t">${d.map(l=>r(l,s)).join("")}</tr>`:""}</table>
  ${p?`<div class="nota">${o(p)}</div>`:""}
</body></html>`}function Z(e){var n,s,p;const a=e.factura||{},t=String(a.estado||"").toUpperCase()==="ANULADA",d=String(((n=e.cliente)==null?void 0:n.rnc)||"").replace(/\D/g,"").length===9;return`<!doctype html><html><head><meta charset="utf-8"><title>Factura ${o(a.ncf||"")}</title><style>${T}
  .caja { display: flex; justify-content: space-between; gap: 16px; margin: 12px 0; }
  .caja > div { border: 1px solid #d7dce3; border-radius: 6px; padding: 8px 10px; flex: 1; font-size: 12px; line-height: 1.6; }
  .caja span { color: #5b6472; font-size: 10.5px; text-transform: uppercase; }
  .ncf { font-family: Consolas, monospace; font-size: 15px; font-weight: 800; color: #b3261e; }
  .anul { color: #b3261e; font-weight: 800; letter-spacing: 2px; font-size: 16px; text-align: center; border: 2px solid #b3261e; padding: 4px; margin-top: 8px; }
  .firma { width: 220px; border-top: 1px solid #333; text-align: center; padding-top: 4px; font-size: 11px; color: #5b6472; margin: 40px 0 0 auto; }
</style></head><body>
  ${N(e.colegio,"Factura de crédito fiscal",`No. ${a.numero||""}`)}
  ${t?'<div class="anul">ANULADA</div>':""}
  <div class="caja">
    <div><span>NCF</span><br><b class="ncf">${o(a.ncf||"")}</b><br><span>Válido hasta</span> ${o(y(e.vence)||"—")}<br><span>Fecha</span> ${o(y(a.fecha))}</div>
    <div><span>Cliente</span><br><b>${o(((s=e.cliente)==null?void 0:s.nombre)||"")}</b><br><span>${d?"RNC":"Cédula"}</span> ${o(((p=e.cliente)==null?void 0:p.rnc)||"")}<br><span>Forma de pago</span> ${o(String(a.forma_pago||"").replace(/ - RECIBO$/,""))} (pagado)</div>
  </div>
  <table><tr><th>Descripción</th><th class="m">Cant.</th><th class="m">Precio</th><th class="m">ITBIS</th><th class="m">Importe RD$</th></tr>
    ${(e.lineas||[]).map(i=>`<tr><td>${o(i.descripcion)}</td><td class="m">1</td><td class="m">${m(i.importe)}</td><td class="m">E</td><td class="m">${m(i.importe)}</td></tr>`).join("")}
    <tr class="s"><td colspan="4">Subtotal</td><td class="m">${m(a.total)}</td></tr>
    <tr class="s"><td colspan="4">ITBIS (exento, art. 344 núm. 7 del Código Tributario)</td><td class="m">0.00</td></tr>
    <tr class="t"><td colspan="4">TOTAL</td><td class="m">RD$ ${m(a.total)}</td></tr>
  </table>
  <div class="nota">${o(a.notas||"")}<br>E = exento de ITBIS. Válida para deducción de gastos educativos (Ley 179-09) a nombre del contribuyente indicado.</div>
  <div class="firma">Firma autorizada</div>
</body></html>`}function J(e){var p;const a=e.est||{},t=e.fam||{},d=i=>i==null||i===""?"&nbsp;":o(i),n=(i,r,b=1)=>`<div class="cp" style="grid-column: span ${b}"><span>${o(i)}</span><b>${d(r)}</b></div>`,s=(i,r)=>`
    <h2>${r}</h2>
    <div class="g">
      ${n("Nombre",t[`${i}_nombre`],3)}${n("Ocupación",t[`${i}_profesion`])}${n("Lugar de trabajo",t[`${i}_trabajo`],2)}
      ${n("Celular",t[`${i}_celular`],2)}${n("Teléfono",t[`${i}_telefono`],2)}${n("Correo",t[`${i}_correo`],2)}
    </div>`;return`<!doctype html><html><head><meta charset="utf-8"><title>Ficha ${o(a.apellidos||"")} ${o(a.nombres||"")}</title>
<style>${T}
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
  ${N(e.colegio,"Ficha de inscripción",`Año escolar ${e.anio||""}`)}
  <div class="top">
    <div class="foto">${e.foto?`<img src="${e.foto}" alt="">`:"FOTO"}</div>
    <div class="g">
      ${n("Matrícula",a.matricula)}${n("Apellidos",a.apellidos,3)}${n("Estado",a.estado,2)}
      ${n("Nombres",a.nombres,4)}${n("Fecha de nacimiento",a.fecha_nacimiento)}${n("Edad",a.edad!=null?`${a.edad} años`:"")}
      ${n("Lugar de nacimiento",a.lugar_nacimiento,3)}${n("Núm. de hermanos",a.numero_hermanos)}${n("Edades de los hermanos",a.edades_hermanos)}${n("Posición en la familia",a.posicion_familia)}
    </div>
  </div>
  <h2>Inscripción</h2>
  <div class="g">
    ${n("Curso",a.curso,2)}${n("Tanda",a.tanda)}${n("Sección",a.seccion)}${n("Condición",a.condicion,2)}
    ${n("Mensualidad RD$",a.mensualidad)}${n("Beca",a.beca_pct>0?`${a.beca_pct}%`:"No")}${n("Motivo de la beca",a.beca_motivo,2)}${n("Sala de Tareas",a.sala_tareas?"Sí":"No",2)}
  </div>
  <h2>Familia</h2>
  <div class="g">
    ${n("Familia",t.nombre,3)}${n("Los padres están",t.estado_padres)}${n("Teléfono residencial",t.telefono_residencial,2)}
    ${n("Dirección residencial",t.direccion,4)}${n("Sector",t.sector,2)}
    ${(p=e.hermanos)!=null&&p.length?n("Hermanos en el colegio",e.hermanos.join(" · "),6):""}
  </div>
  ${s("madre","Madre")}
  ${s("padre","Padre")}
  <h2>Tutor (si no es el padre ni la madre)</h2>
  <div class="g">${n("Nombre",t.tutor_nombre,3)}${n("Teléfono",t.tutor_telefono)}${n("Dirección",t.tutor_direccion,2)}</div>
  ${a.notas?`<h2>Notas</h2><div>${o(a.notas)}</div>`:""}
  <div class="firmas"><div>Firma del padre, madre o tutor</div><div>Firma y sello del colegio</div></div>
  <div class="nota">Impreso el ${o(e.fecha||"")}. Datos confidenciales del estudiante y su familia.</div>
</body></html>`}const U={reservacion:1,inscripcion:1,utileria:2,bilingue:3,mensualidad:4,sala_tareas:5,recargo:6,otro:7};let _=null;async function A(e){if((_==null?void 0:_.tenantId)===e&&Date.now()-_.t<3e5)return _.datos;const{data:a,error:t}=await $.from("config_empresa").select("nombre, rnc, direccion1, direccion2, telefono, logo_url, slogan").eq("tenant_id",e).maybeSingle();if(t)throw t;const d=a||{},n={nombre:d.nombre,rnc:d.rnc,direccion:[d.direccion1,d.direccion2].filter(Boolean).join(", "),telefono:d.telefono,logo_url:d.logo_url,slogan:d.slogan};return a&&(_={tenantId:e,datos:n,t:Date.now()}),n}async function K(e,a){var R,q;const[t,d,n,s,p]=await Promise.all([$.from("edu_familias").select("*").eq("id",e).eq("tenant_id",a).single(),$.from("edu_estudiantes").select("*").eq("familia_id",e).eq("tenant_id",a).order("matricula"),$.from("edu_anios").select("*").eq("tenant_id",a).order("anio_inicio"),$.from("edu_config").select("*").eq("tenant_id",a).maybeSingle(),A(a)]);if(t.error)throw t.error;if(d.error)throw d.error;const i=new Map((n.data||[]).map(g=>[g.id,g])),r=(n.data||[]).find(g=>g.actual),b=(d.data||[]).map(g=>g.id),[l,c,u]=await Promise.all([b.length?$.from("edu_cargos").select("*").in("estudiante_id",b).eq("tenant_id",a).neq("estado","anulado"):Promise.resolve({data:[]}),$.from("edu_cursos").select("id, nombre").eq("tenant_id",a),$.from("edu_pagos").select("numero, fecha, total, anulado").eq("familia_id",e).eq("tenant_id",a).order("numero",{ascending:!1}).limit(8)]);if(l.error)throw l.error;const x=new Map((c.data||[]).map(g=>[g.id,g.nombre])),h=I(),B=(d.data||[]).map(g=>{const j=(l.data||[]).filter(f=>f.estudiante_id===g.id).filter(f=>{var v;return f.anio_id===(r==null?void 0:r.id)||E(f)>0||f.tipo==="reservacion"&&((v=i.get(f.anio_id))==null?void 0:v.anio_inicio)>((r==null?void 0:r.anio_inicio)??0)}).sort((f,v)=>{var z,D;return(((z=i.get(f.anio_id))==null?void 0:z.anio_inicio)??0)-(((D=i.get(v.anio_id))==null?void 0:D.anio_inicio)??0)||U[f.tipo]-U[v.tipo]||String(f.periodo||"").localeCompare(String(v.periodo||""))}).map(f=>{var D,F;const v=E(f),z=f.vence||P(f.created_at);return{descripcion:f.descripcion,anio:f.anio_id!==(r==null?void 0:r.id)?(D=i.get(f.anio_id))==null?void 0:D.nombre:"",moneda:f.moneda,monto:Number(f.monto),descuento:Number(f.descuento),pagado:Number(f.pagado),pendiente:v,estado:f.estado,vencido:v>0&&V(z,h)>0&&!(((F=i.get(f.anio_id))==null?void 0:F.anio_inicio)>((r==null?void 0:r.anio_inicio)??0))}});return{nombre:`${g.nombres} ${g.apellidos}`,matricula:g.matricula,curso:x.get(g.curso_id)||"",tanda:O[g.tanda]||"",tarifa:g.tarifa_mensual,beca_pct:g.beca_pct,estado:g.estado,cargos:j}}).filter(g=>g.estado==="activo"||g.cargos.some(j=>j.pendiente>0)),w=t.data,k=((R=s.data)==null?void 0:R.dia_limite_pago)||5;return{colegio:p,fecha:h,estudiantes:B,pagos:u.data||[],familia:{...w,telefono:w.tutor_telefono||w.madre_celular||w.padre_celular||w.telefono_residencial||""},reglaRecargo:((q=s.data)==null?void 0:q.recargo_monto)>0?`Pagos del 1 al ${k} de cada mes; desde el día 1 del mes siguiente se aplica un recargo de RD$${Number(s.data.recargo_monto).toLocaleString("en-US")}.`:""}}async function ie(e,a){const t=await K(e,a);await C(X(t),{tipo:"carta"})}const Q={casados:"Casados",union_libre:"Unión libre",separados:"Separados",divorciados:"Divorciados",fallecidos:"Fallecidos",otro:"Otro"};async function W(e){if(!e)return"";try{const{data:a,error:t}=await $.storage.from("edu-fotos").download(e);return t||!a?"":await new Promise(d=>{const n=new FileReader;n.onload=()=>d(n.result),n.onerror=()=>d(""),n.readAsDataURL(a)})}catch{return""}}async function ne(e,a){var x;const{data:t,error:d}=await $.from("edu_estudiantes").select("*").eq("id",e).eq("tenant_id",a).single();if(d)throw d;const[n,s,p,i,r,b]=await Promise.all([$.from("edu_familias").select("*").eq("id",t.familia_id).eq("tenant_id",a).maybeSingle(),$.from("edu_cursos").select("id, nombre").eq("tenant_id",a),$.from("edu_anios").select("nombre").eq("tenant_id",a).eq("actual",!0).maybeSingle(),$.from("edu_estudiantes").select("id, nombres, curso_id, estado").eq("familia_id",t.familia_id).eq("tenant_id",a).neq("id",t.id),A(a),W(t.foto_path)]);if(n.error)throw n.error;const l=new Map((s.data||[]).map(h=>[h.id,h.nombre])),c=n.data||{},u=J({colegio:r,anio:((x=p.data)==null?void 0:x.nombre)||"",fecha:new Date().toLocaleString("es-DO",{timeZone:"America/Santo_Domingo"}),foto:b,est:{...t,fecha_nacimiento:t.fecha_nacimiento?new Date(`${t.fecha_nacimiento}T12:00:00`).toLocaleDateString("es-DO",{day:"2-digit",month:"2-digit",year:"numeric"}):"",edad:H(t.fecha_nacimiento),curso:l.get(t.curso_id)||"",tanda:O[t.tanda]||t.tanda||"",condicion:t.condicion==="nuevo"?"Nuevo ingreso":"Continuante",mensualidad:Number(t.tarifa_mensual||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),beca_pct:Number(t.beca_pct||0),estado:G[t.estado]||t.estado},fam:{...c,estado_padres:Q[c.estado_padres]||""},hermanos:(i.data||[]).filter(h=>h.estado==="activo"||h.estado==="por_confirmar").map(h=>`${h.nombres} (${l.get(h.curso_id)||""})`)});await C(u,{tipo:"carta"})}async function Y(e,a){var b;const[t,d]=await Promise.all([$.from("facturas").select("numero, ncf, fecha, total, notas, forma_pago, estado, clientes(nombre, rnc), facturas_detalle(descripcion, importe, created_at)").eq("id",e).eq("tenant_id",a).single(),A(a)]);if(t.error)throw t.error;const n=t.data,s=String(n.ncf||""),p=Number(s.slice(3));let i=null;if(p){const{data:l}=await $.from("secuencias_ncf").select("fecha_vencimiento").eq("tenant_id",a).eq("serie",s.slice(0,1)).eq("tipo_ncf",s.slice(1,3)).lte("secuencia_desde",p).gte("secuencia_hasta",p).order("created_at",{ascending:!1}).limit(1);i=((b=l==null?void 0:l[0])==null?void 0:b.fecha_vencimiento)||null}const r=[...n.facturas_detalle||[]].sort((l,c)=>String(l.created_at).localeCompare(String(c.created_at)));return{colegio:d,factura:{...n,fecha:P(n.fecha)},vence:i,cliente:n.clientes||{},lineas:r}}async function se(e,a){const t=await Y(e,a);await C(Z(t),{tipo:"carta"})}export{se as a,ie as b,ae as c,A as d,te as e,ne as i,S as n,oe as r};
