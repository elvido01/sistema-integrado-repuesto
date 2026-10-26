import{u as St,l as Dt,a9 as Ot,r as v,as as Xa,at as q,bp as At,s as N,j as o,H as Rt,m as Mt,az as Ft,aL as at,L as Z,d as G,aZ as It,y as Pt,I as ha,G as ja,J as ya,K as Ca,N as Na,O as K,D as ua,b1 as Lt,W as Vt,e as qt,ax as kt,a_ as z,X as Gt}from"./index-230fcf79.js";import{P as zt,a as Ut,b as Ht}from"./popover-c5c6e56b.js";import{C as Jt}from"./calendar-69b3fbb8.js";import{T as tt,a as ot,b as U,c as O,d as et,e as D,f as Bt}from"./table-fc87fac3.js";import{C as Wt}from"./coins-aa5ad797.js";import{P as st}from"./printer-49041e36.js";import"./index-aa52c212.js";import"./index-8a91dab5.js";import"./chevron-left-8ce0512a.js";const Ea=[{label:"2,000",value:2e3},{label:"1,000",value:1e3},{label:"500",value:500},{label:"200",value:200},{label:"100",value:100},{label:"50",value:50},{label:"25",value:25},{label:"20",value:20},{label:"10",value:10},{label:"5",value:5},{label:"1",value:1},{label:"Cent.",value:0},{label:"Tarjetas",value:0,tipo:"tarjeta"},{label:"Cheques",value:0,tipo:"cheque"},{label:"Tarjetas/Cheques",value:0,tipo:"tarjeta"},{label:"Dólares",value:0,tipo:"dolar"},{label:"Tasa del día",value:0,tipo:"tasa"},{label:"Otros",value:0,tipo:"otro"}],Yt=new Set(["20","Cent.","Otros","Tarjetas","Cheques"]),Q=Ea.filter(x=>!Yt.has(x.label)),X=(x,E)=>{const L=Number(E==null?void 0:E[x.label])||0;return x.tipo==="tasa"?0:x.tipo==="dolar"?L*(Number(E==null?void 0:E["Tasa del día"])||0):x.tipo?L:L*x.value},c=x=>new Intl.NumberFormat("es-DO",{style:"decimal",minimumFractionDigits:2,maximumFractionDigits:2}).format(x||0),it=x=>String((x==null?void 0:x.estado)||"").toUpperCase()!=="ANULADA",lt=x=>{const E=String((x==null?void 0:x.forma_pago)||"").toUpperCase(),L=String((x==null?void 0:x.tipo_pago)||"").toUpperCase(),y=String((x==null?void 0:x.notas)||"").toUpperCase();return E==="EFECTIVO"||y.includes("POS_MOVIL")||y.includes("POS MOVIL")||y.includes("MOVIL")||y.includes("MÓVIL")||L.includes("MOVIL")},io=()=>{const{toast:x}=St(),{user:E,profile:L,empresa:y,tenantId:u}=Dt(),{closePanel:aa,activePanel:_a}=Ot(),[w,ct]=v.useState(Xa()),[H,wa]=v.useState(1),ta=Math.max(1,parseInt(y==null?void 0:y.turnos_caja_dia,10)||1),k=ta<=1,[$a,nt]=v.useState([]),[$,Ta]=v.useState("ALL"),[J,oa]=v.useState(!1),[Sa,Da]=v.useState(!1),[ea,Oa]=v.useState(!1),[sa,rt]=v.useState(!0),[Aa,dt]=v.useState([]),[B,pt]=v.useState(!1),[W,xt]=v.useState(null),[Ra,bt]=v.useState(()=>localStorage.getItem("cierre_caja_paper")||""),mt=t=>{bt(t),localStorage.setItem("cierre_caja_paper",t)},[s,ft]=v.useState(null),[V,Y]=v.useState(Q.reduce((t,a)=>({...t,[a.label]:0}),{}));v.useEffect(()=>{(async()=>{const{data:a,error:r}=await N.from("perfiles").select("id, nombre_completo, email").order("nombre_completo");!r&&a&&(nt(a),Ta("ALL"))})()},[E]);const I=v.useCallback(async t=>{const a=!!t;if(!w&&!a)return;a||Oa(!0);const r=t||q(w),{desde:d,hasta:p}=At(r);let i=[],b=[],h=[],n=[],_=[],R=[],ra=[],da=[],M=[];try{let e=N.from("facturas").select("id, total, itbis, subtotal, descuento, forma_pago, tipo_pago, monto_recibido, cambio, fecha, created_at, notas, estado").eq("tenant_id",u).gte("fecha",d).lte("fecha",p);$&&$!=="ALL"&&(e=e.eq("usuario_id",$));const{data:l,error:f}=await e;f?console.warn("Error cargando ventas:",f.message):i=(l||[]).filter(it);let m=N.from("facturas").select("id, total, itbis, subtotal, descuento, forma_pago, tipo_pago, monto_recibido, cambio, fecha, created_at, notas, estado").eq("tenant_id",u).gte("created_at",d).lte("created_at",p);$&&$!=="ALL"&&(m=m.eq("usuario_id",$));const{data:T,error:g}=await m;if(g)console.warn("Error cargando ventas moviles:",g.message);else{const F=new Set(i.map(j=>j.id)),S=(T||[]).filter(it).filter(j=>lt(j)&&!F.has(j.id));i=[...i,...S]}}catch(e){console.warn("Exception cargando ventas:",e)}try{const{data:e,error:l}=await N.from("devoluciones").select("total_devolucion, facturas!inner(forma_pago)").eq("tenant_id",u).ilike("facturas.forma_pago","contado").eq("fecha_devolucion",r);l?console.warn("Error cargando devoluciones:",l.message):b=e||[]}catch(e){console.warn("Exception cargando devoluciones:",e)}try{const{data:e,error:l}=await N.from("recibos_ingreso").select("monto_pagado, fecha, created_at, origen, formas_pago").eq("tenant_id",u).eq("anulado",!1).eq("fecha",r);if(l){console.warn("Error cargando recibos por fecha:",l.message);const{data:f,error:m}=await N.from("recibos_ingreso").select("monto_pagado, created_at, origen, formas_pago").eq("tenant_id",u).eq("anulado",!1).gte("created_at",d).lte("created_at",p);m?console.warn("Error cargando recibos por created_at:",m.message):h=f||[]}else h=e||[];console.log(`Recibos encontrados para ${r}:`,h.length,h)}catch(e){console.warn("Exception cargando recibos:",e)}try{const{data:e,error:l}=await N.from("pagos_suplidores").select("monto_pagado, formas_pago").eq("tenant_id",u).eq("anulado",!1).gte("created_at",d).lte("created_at",p);l?console.warn("Error cargando pagos suplidores:",l.message):n=e||[]}catch(e){console.warn("Exception cargando pagos suplidores:",e)}try{const{data:e,error:l}=await N.from("gastos_diarios").select("monto, descripcion, tipo_gasto, afecta_caja, cuenta_bancaria_id, es_tercero, concepto_tercero").eq("tenant_id",u).eq("fecha",r).eq("anulado",!1);if(l)console.warn("Error cargando gastos diarios:",l.message);else{const f=(e||[]).filter(g=>!g.cuenta_bancaria_id&&g.afecta_caja!==!1);R=f.filter(g=>g.es_tercero===!0);const m=g=>/n[oó]mina/i.test(String(g.tipo_gasto||"")),T=f.filter(g=>g.es_tercero!==!0);ra=T.filter(m),_=T.filter(g=>!m(g))}}catch(e){console.warn("Exception cargando gastos diarios:",e)}let pa=0;try{const{data:e,error:l}=await N.from("compras").select("numero, total_compra, forma_pago, estado, pagos, created_at").eq("tenant_id",u).ilike("forma_pago","contado").gte("created_at",d).lte("created_at",p);l?console.warn("Error cargando compras de contado:",l.message):pa=(e||[]).filter(f=>(f.estado||"")!=="ANULADA").reduce((f,m)=>{const T=Array.isArray(m.pagos)?m.pagos:[];return T.length===0?f+(parseFloat(m.total_compra)||0):f+T.filter(g=>String((g==null?void 0:g.tipo)??"01")==="01"||String((g==null?void 0:g.forma)||"").toLowerCase().includes("efectivo")).reduce((g,F)=>g+(parseFloat(F==null?void 0:F.monto)||0),0)},0)}catch(e){console.warn("Exception cargando compras de contado:",e)}try{const{data:e,error:l}=await N.from("prestamos").select("numero, monto_capital, created_at, clientes(nombre)").eq("tenant_id",u).ilike("desembolso","efectivo").gte("created_at",d).lte("created_at",p);l?console.warn("Error cargando préstamos en efectivo:",l.message):da=e||[]}catch(e){console.warn("Exception cargando préstamos en efectivo:",e)}try{const{data:e,error:l}=await N.from("compromisos").select("id, nombre, monto, tipo, forma_pago, fecha_pago").eq("tenant_id",u).eq("activo",!1).gte("fecha_pago",d).lte("fecha_pago",p);if(l)console.warn("Error cargando compromisos pagados:",l.message);else{M=(e||[]).filter(m=>String(m.forma_pago||"Efectivo").toLowerCase().includes("efectivo"));const f=M.filter(m=>String(m.tipo||"").toLowerCase()==="nomina").map(m=>m.id);if(f.length>0){const{data:m}=await N.from("nominas").select("id, compromiso_id, nomina_detalle(neto, pagado_at, gasto_id, empleados(nombre))").eq("tenant_id",u).in("compromiso_id",f).neq("estado","anulada"),T=(m||[]).flatMap(S=>(S.nomina_detalle||[]).map(j=>j.gasto_id)).filter(Boolean),g=new Set;if(T.length>0){const{data:S}=await N.from("gastos_diarios").select("id, anulado").in("id",T);for(const j of S||[])j.anulado&&g.add(j.id)}const F={};for(const S of m||[])F[S.compromiso_id]=(S.nomina_detalle||[]).map(j=>{var P;return{nombre:((P=j.empleados)==null?void 0:P.nombre)||"Empleado",monto:Number(j.neto)||0,yaEnGastos:!!j.gasto_id&&!g.has(j.gasto_id),pagadoAt:j.pagado_at||null}}).filter(j=>j.monto>0).sort((j,P)=>P.monto-j.monto);M=M.map(S=>{const j=F[S.id]||null,P=(j||[]).filter(va=>va.yaEnGastos).reduce((va,Tt)=>va+Tt.monto,0);return{...S,empleados:j,cubierto:P,monto_efectivo:Math.max((parseFloat(S.monto)||0)-P,0)}})}}}catch(e){console.warn("Exception cargando compromisos pagados:",e)}let xa=[];try{const{data:e,error:l}=await N.from("caja_depositos").select("id, monto_caja, moneda, tasa, monto_cuenta, concepto, cuenta_id, created_at, cuentas_bancarias(banco, alias)").eq("tenant_id",u).eq("fecha",r).eq("anulado",!1).order("created_at");l?console.warn("Error cargando efectivo movido a cuentas:",l.message):xa=(e||[]).map(f=>({...f,cuenta:f.cuentas_bancarias?`${f.cuentas_bancarias.banco}${f.cuentas_bancarias.alias?` — ${f.cuentas_bancarias.alias}`:""}`:"cuenta"}))}catch(e){console.warn("Exception cargando efectivo movido a cuentas:",e)}const ba=i.filter(e=>{const l=String(e.forma_pago||"").toUpperCase();return l==="CONTADO"||l==="EFECTIVO"}),Va=ba.reduce((e,l)=>e+(parseFloat(l.total)||0),0),qa=ba.filter(lt).reduce((e,l)=>e+(parseFloat(l.total)||0),0),ht=e=>{const l=String(e.tipo_pago||"").toUpperCase();return!l||l.includes("EFECTIVO")},ka=ba.filter(e=>!ht(e)).reduce((e,l)=>e+(parseFloat(l.total)||0),0),Ga=Math.max(0,Va-qa-ka),jt=i.filter(e=>String(e.forma_pago||"").toUpperCase()==="CREDITO").reduce((e,l)=>e+(parseFloat(l.total)||0),0),yt=i.reduce((e,l)=>e+(parseFloat(l.total)||0),0),Ct=i.reduce((e,l)=>e+(parseFloat(l.itbis)||0),0),Nt=i.reduce((e,l)=>e+(parseFloat(l.descuento)||0),0),za=b.reduce((e,l)=>e+(parseFloat(l.total_devolucion)||0),0),ma=h.reduce((e,l)=>e+(parseFloat(l.monto_pagado)||0),0),Ua=h.filter(e=>String(e.origen||"").toLowerCase()==="movil").reduce((e,l)=>e+(parseFloat(l.monto_pagado)||0),0),ut=Math.max(0,ma-Ua),Et=e=>{const l=Array.isArray(e.formas_pago)?e.formas_pago:null;return!l||!l.length?parseFloat(e.monto_pagado)||0:l.reduce((f,m)=>f+(String(m.forma||"").toLowerCase().includes("efectivo")&&parseFloat(m.monto)||0),0)},fa=h.reduce((e,l)=>e+Et(l),0),_t=Math.max(0,ma-fa),Ha=_.reduce((e,l)=>e+(parseFloat(l.monto)||0),0),Ja=R.reduce((e,l)=>e+(parseFloat(l.monto)||0),0),Ba=ra.reduce((e,l)=>e+(parseFloat(l.monto)||0),0),Wa=da.reduce((e,l)=>e+(parseFloat(l.monto_capital)||0),0),Ya=e=>e.monto_efectivo!==void 0?parseFloat(e.monto_efectivo)||0:parseFloat(e.monto)||0;M=M.filter(e=>Ya(e)>0);const Za=M.reduce((e,l)=>e+Ya(l),0),Ka=xa.reduce((e,l)=>e+(parseFloat(l.monto_caja)||0),0),Qa=n.reduce((e,l)=>{const f=(l.formas_pago||[]).filter(m=>m.forma==="Efectivo").reduce((m,T)=>m+(parseFloat(T.monto)||0),0);return e+f},0),wt=i.filter(e=>e.forma_pago==="CONTADO").reduce((e,l)=>e+(parseFloat(l.cambio)||0),0),$t=i.length,ga={totalVentas:yt,totalVentasContado:Va,totalVentasContadoCaja:Ga,totalVentasContadoMovil:qa,totalVentasContadoNoEfectivo:ka,totalVentasCredito:jt,totalItbis:Ct,totalDescuento:Nt,totalDevoluciones:za,totalRecibos:ma,totalRecibosMovil:Ua,totalRecibosCaja:ut,totalRecibosEfectivo:fa,totalRecibosOtrasFormas:_t,totalGastosDiarios:Ha,gastosDiarios:_,totalPagosTerceros:Ja,pagosTerceros:R,totalPagosNomina:Ba,pagosNomina:ra,totalPrestamosEfectivo:Wa,prestamosEfectivo:da,totalCompromisosEfectivo:Za,compromisosEfectivo:M,totalEfectivoMovido:Ka,efectivoMovido:xa,totalPagosSuplidores:Qa,cambioEntregado:wt,cantFacturas:$t,comprasContadoEfectivo:pa,efectivoEnCaja:Ga+fa-za-Qa-Ha-Ja-Ba-Wa-Za-pa-Ka};return a||(ft(ga),Oa(!1)),ga},[w,$,u]);v.useEffect(()=>{I()},[I]),v.useEffect(()=>{const t=()=>{document.hidden||I()};return window.addEventListener("focus",t),document.addEventListener("visibilitychange",t),()=>{window.removeEventListener("focus",t),document.removeEventListener("visibilitychange",t)}},[I]);const Ma=(t,a)=>{if(t.tipo){Y(d=>({...d,[t.label]:a}));return}const r=parseInt(a,10);Y(d=>({...d,[t.label]:isNaN(r)?0:r}))};v.useEffect(()=>{N.rpc("get_tasa_dia").then(({data:t})=>{const a=Number(t)||0;a>0&&Y(r=>Number(r["Tasa del día"])>0?r:{...r,"Tasa del día":a})},()=>{})},[]);const A=v.useMemo(()=>Q.reduce((t,a)=>t+X(a,V),0),[V]),ia=async()=>{var t;Da(!0);try{const a=$==="ALL"?"Todos los Cajeros":((t=$a.find(b=>b.id===$))==null?void 0:t.nombre_completo)||"N/A",r={tenant_id:u,fecha:q(w),turno:H,cajero_id:$==="ALL"?E==null?void 0:E.id:$,cajero_nombre:a,total_ventas:(s==null?void 0:s.totalVentas)||0,total_ventas_contado:(s==null?void 0:s.totalVentasContado)||0,total_ventas_contado_caja:(s==null?void 0:s.totalVentasContadoCaja)||0,total_ventas_contado_movil:(s==null?void 0:s.totalVentasContadoMovil)||0,total_ventas_credito:(s==null?void 0:s.totalVentasCredito)||0,total_itbis:(s==null?void 0:s.totalItbis)||0,total_descuento:(s==null?void 0:s.totalDescuento)||0,total_devoluciones:(s==null?void 0:s.totalDevoluciones)||0,total_recibos:(s==null?void 0:s.totalRecibos)||0,total_gastos_diarios:(s==null?void 0:s.totalGastosDiarios)||0,cambio_entregado:(s==null?void 0:s.cambioEntregado)||0,efectivo_en_caja:(s==null?void 0:s.efectivoEnCaja)||0,total_desglose:A,diferencia:A-((s==null?void 0:s.efectivoEnCaja)||0),desglose:Object.fromEntries(Object.entries(V).map(([b,h])=>[b,Number(h)||0])),usuario_id:E==null?void 0:E.id,detalle:s||null},{data:d,error:p}=await N.from("cierres_caja").insert([r]).select("id").single();if(p)throw p;const i=(s==null?void 0:s.efectivoEnCaja)||0;if(W&&i>0&&(d!=null&&d.id)){const{error:b}=await N.rpc("registrar_movimiento_bancario",{p_cuenta_id:W,p_tipo:"ENTRADA",p_monto:i,p_concepto:`Cierre de caja — turno ${H} (${q(w)})`,p_referencia:null,p_origen_tipo:"cierre_caja",p_origen_id:d.id,p_fecha:q(w)});b&&x({variant:"destructive",title:"Cierre grabado, pero no se registró en la cuenta",description:b.message})}else i>0&&!W&&x({variant:"destructive",title:"El efectivo NO entró a ninguna cuenta",description:`Se cerró la caja con ${c(i)} pero no había cuenta seleccionada. Regístralo a mano en Cuentas Bancarias.`});sa&&Fa(r,s),x({title:"Cierre de Caja",description:`El cierre del turno ${H} ha sido registrado exitosamente.`}),Y(b=>({...Q.reduce((h,n)=>({...h,[n.label]:0}),{}),"Tasa del día":b["Tasa del día"]||0})),oa(!1),k||wa(b=>Math.min(b+1,ta)),I()}catch(a){console.error("Error saving cierre:",a),x({variant:"destructive",title:"Error",description:a.message||"No se pudo registrar el cierre de caja."})}finally{Da(!1)}},C=({label:t,value:a,bold:r,isCount:d,siempre:p})=>p||Number(a)>0?o.jsxs("div",{className:`flex justify-between items-center py-1 ${r?"border-t-2 border-morla-blue pt-2":""}`,children:[o.jsx("span",{className:`text-sm ${r?"font-bold text-morla-blue":"text-gray-600"}`,children:t}),o.jsx("span",{className:`font-mono text-sm ${r?"font-bold text-morla-blue text-base":"text-gray-800"}`,children:d?a:c(a)})]}):null,la=({label:t,value:a})=>o.jsxs("div",{className:"flex justify-between items-center py-1.5 mt-1 border-t-2 border-gray-800",children:[o.jsx("span",{className:"text-sm font-bold text-gray-800 uppercase tracking-wide",children:t}),o.jsx("span",{className:"font-mono text-sm font-bold text-gray-900",children:c(a)})]}),ca=t=>(Number(t==null?void 0:t.totalGastosDiarios)||0)+(Number(t==null?void 0:t.totalPagosNomina)||0)+(Number(t==null?void 0:t.totalPagosTerceros)||0)+(Number(t==null?void 0:t.totalPrestamosEfectivo)||0)+(Number(t==null?void 0:t.totalPagosSuplidores)||0)+(Number(t==null?void 0:t.totalCompromisosEfectivo)||0)+(Number(t==null?void 0:t.comprasContadoEfectivo)||0)+(Number(t==null?void 0:t.totalDevoluciones)||0),na=t=>(Number((t==null?void 0:t.totalVentasContadoCaja)??(t==null?void 0:t.totalVentasContado))||0)+(Number((t==null?void 0:t.totalRecibosEfectivo)??(t==null?void 0:t.totalRecibos))||0),gt=(t,a)=>{const r=ca(a),d=na(a),p=(i,b,h=!1,n=!1)=>n||Number(b)>0?`<tr${h?' class="bold"':""}><td>${i}</td><td class="num">${c(b)}</td></tr>`:"";return`
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8">
        <style>
          @page { size: letter; margin: 14mm; }
          html, body { margin: 0; padding: 0; background: #fff; }
          body { font-family: Arial, Helvetica, sans-serif; font-size: 12.5px; color: #000; }
          h1 { font-size: 22px; margin: 0; }
          .sub { font-size: 14px; letter-spacing: 2px; font-weight: bold; margin-top: 2px; }
          .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #000; padding-bottom: 8px; }
          .meta { text-align: right; font-size: 12px; line-height: 1.5; }
          .cols { display: flex; gap: 28px; margin-top: 16px; }
          .col { flex: 1; }
          .sec { font-weight: bold; font-size: 13px; border-bottom: 2px solid #000; padding-bottom: 3px; margin: 14px 0 6px; text-transform: uppercase; }
          table { width: 100%; border-collapse: collapse; }
          td, th { padding: 3px 2px; border-bottom: 1px solid #ddd; }
          th { text-align: left; border-bottom: 1px solid #000; font-size: 11px; }
          .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
          .bold { font-weight: bold; }
          .grande { font-size: 15px; font-weight: bold; }
          .caja { border: 2px solid #000; padding: 6px 10px; display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; margin-top: 10px; }
          .cuadre-final { border: 2px solid #000; margin-top: 14px; }
          .cuadre-final .linea { display: flex; justify-content: space-between; padding: 4px 10px; font-size: 13px; }
          .cuadre-final .total { font-size: 16px; font-weight: bold; padding: 7px 10px; }
          .linea-fuerte { display: flex; justify-content: space-between; border-top: 2px solid #000; margin-top: 4px; padding: 5px 2px 0; font-size: 14px; font-weight: bold; }
          .firmas { display: flex; gap: 60px; margin-top: 60px; }
          .firmas div { flex: 1; border-top: 1px solid #000; text-align: center; padding-top: 4px; font-size: 11px; }
        </style>
      </head>
      <body onload="window.print()">
        <div class="head">
          <div>
            <h1>${((y==null?void 0:y.nombre)||"MotoFlow").toUpperCase()}</h1>
            <div class="sub">CIERRE DE CAJA</div>
          </div>
          <div class="meta">
            <div><b>Fecha:</b> ${z(t.fecha)}</div>
            <div><b>Turno:</b> ${t.turno}</div>
            <div><b>Cajero:</b> ${t.cajero_nombre}</div>
            ${t._reimpresion?'<div style="color:#b45309;font-weight:bold">REIMPRESIÓN</div>':""}
          </div>
        </div>
        ${t._reimpresion?`<div style="margin-top:8px;padding:4px 8px;border:1px solid #b45309;color:#b45309;font-size:11px">
          Copia del cierre grabado el ${z(t.created_at||t.fecha)}. No es un cierre nuevo.
          ${t._reconstruido?"<br>Este cierre es anterior al guardado del detalle: el desglose se reconstruyó con los movimientos de esa fecha. Los totales de caja y el conteo de billetes son los que quedaron grabados.":""}
          ${t._descuadre?`<br><b>Ojo:</b> hoy esa fecha da ${c(t._descuadre)} de efectivo, distinto de los ${c(t.efectivo_en_caja)} que se grabaron. Manda lo grabado.`:""}
        </div>`:""}

        <div class="cols">
          <div class="col">
            <!-- Arriba SOLO lo que entró: ventas y cobros. Lo que salió va
                 abajo, cada cosa con su desglose. Mezclar entradas y salidas
                 en una sola lista obligaba a leerla dos veces. -->
            <div class="sec">Entradas del día</div>
            <table><tbody>
              ${p("Ventas Contado Caja",a==null?void 0:a.totalVentasContadoCaja)}
              ${p("Ventas Contado Móvil",a==null?void 0:a.totalVentasContadoMovil)}
              ${p("Ventas por Transferencia/Tarjeta",a==null?void 0:a.totalVentasContadoNoEfectivo)}
              ${p("Ventas Crédito",a==null?void 0:a.totalVentasCredito)}
              ${p("Total Ventas",a==null?void 0:a.totalVentas,!0)}
              ${Number(a==null?void 0:a.totalRecibosMovil)>0?`
              ${p("Recibos Ingreso Caja",a==null?void 0:a.totalRecibosCaja)}
              ${p("Recibos Ingreso Móvil",a==null?void 0:a.totalRecibosMovil)}`:""}
              ${p("Recibos Ingreso (total)",a==null?void 0:a.totalRecibos,!0)}
              ${Number(a==null?void 0:a.totalRecibosOtrasFormas)>0?`
              ${p("· Recibos en Efectivo",a==null?void 0:a.totalRecibosEfectivo)}
              ${p("· Recibos Transf/Cheque/Tarjeta",a==null?void 0:a.totalRecibosOtrasFormas)}`:""}
            </tbody></table>
            <!-- De todo lo que entró, lo que de verdad llegó a la gaveta. -->
            <div class="linea-fuerte"><span>TOTAL INGRESO EN CAJA</span><span>${c(d)}</span></div>

            ${((a==null?void 0:a.gastosDiarios)||[]).length?`
            <div class="sec">Desglose de Gastos</div>
            <table><tbody>
              ${a.gastosDiarios.map(i=>`<tr><td>${i.tipo_gasto||"GASTO"}${i.descripcion?` — ${i.descripcion}`:""}</td><td class="num">${c(i.monto)}</td></tr>`).join("")}
              <tr class="bold"><td>Total Gastos</td><td class="num">${c(a==null?void 0:a.totalGastosDiarios)}</td></tr>
            </tbody></table>`:""}

            ${((a==null?void 0:a.pagosNomina)||[]).length?`
            <div class="sec">Nómina pagada hoy (efectivo)</div>
            <table><tbody>
              ${a.pagosNomina.map(i=>`<tr><td>${i.descripcion||"NÓMINA"}</td><td class="num">${c(i.monto)}</td></tr>`).join("")}
              <tr class="bold"><td>Total Nómina</td><td class="num">${c(a==null?void 0:a.totalPagosNomina)}</td></tr>
            </tbody></table>`:""}

            ${((a==null?void 0:a.pagosTerceros)||[]).length?`
            <div class="sec">Pagos a terceros (no son gastos de la empresa)</div>
            <table><tbody>
              ${a.pagosTerceros.map(i=>`<tr><td>${i.concepto_tercero||"TERCERO"}${i.descripcion?` — ${i.descripcion}`:""}</td><td class="num">${c(i.monto)}</td></tr>`).join("")}
              <tr class="bold"><td>Total entregado a terceros</td><td class="num">${c(a==null?void 0:a.totalPagosTerceros)}</td></tr>
            </tbody></table>`:""}

            ${((a==null?void 0:a.prestamosEfectivo)||[]).length?`
            <div class="sec">Préstamos (Efectivo)</div>
            <table><tbody>
              ${a.prestamosEfectivo.map(i=>{var b;return`<tr><td>${((b=i.clientes)==null?void 0:b.nombre)||"PRÉSTAMO"}${i.numero?` — ${i.numero}`:""}</td><td class="num">${c(i.monto_capital)}</td></tr>`}).join("")}
              <tr class="bold"><td>Total Préstamos</td><td class="num">${c(a==null?void 0:a.totalPrestamosEfectivo)}</td></tr>
            </tbody></table>`:""}

            ${((a==null?void 0:a.compromisosEfectivo)||[]).length?`
            <div class="sec">Compromisos (Efectivo)</div>
            <table><tbody>
              ${a.compromisosEfectivo.map(i=>`
                <tr><td>${i.nombre||"COMPROMISO"}${i.tipo?` — ${i.tipo}`:""}</td><td class="num">${c(i.monto_efectivo!==void 0?i.monto_efectivo:i.monto)}</td></tr>
                ${(i.empleados||[]).map(b=>`<tr><td style="padding-left:14px;color:#555">· ${b.nombre}${b.yaEnGastos?` <i>(ya salió ${b.pagadoAt?z(b.pagadoAt):"antes"}, en Gastos)</i>`:""}</td><td class="num" style="color:#555">${c(b.monto)}</td></tr>`).join("")}
              `).join("")}
              <tr class="bold"><td>Total Compromisos</td><td class="num">${c(a==null?void 0:a.totalCompromisosEfectivo)}</td></tr>
            </tbody></table>`:""}

            <!-- Las salidas que no tienen desglose propio. Si están en cero no
                 aparecen, pero cuando existen tienen que verse: si no, el
                 GASTO TOTAL de abajo saldría con dinero que no se explica. -->
            ${Number(a==null?void 0:a.totalDevoluciones)>0||Number(a==null?void 0:a.totalPagosSuplidores)>0||Number(a==null?void 0:a.comprasContadoEfectivo)>0?`
            <div class="sec">Otras salidas</div>
            <table><tbody>
              ${p("Devoluciones",a==null?void 0:a.totalDevoluciones)}
              ${p("Pagos Suplidores (Efectivo)",a==null?void 0:a.totalPagosSuplidores)}
              ${p("Compras de contado (Efectivo)",a==null?void 0:a.comprasContadoEfectivo)}
            </tbody></table>`:""}

            <div class="linea-fuerte"><span>GASTO TOTAL</span><span>${c(r)}</span></div>

            ${((a==null?void 0:a.efectivoMovido)||[]).length?`
            <!-- (24/10/2026) No es gasto: el efectivo pasó a una cuenta (compra de
                 dólares, depósito). Va aparte para que el cuadre se vea entero. -->
            <div class="sec">Efectivo movido a cuentas (no es gasto)</div>
            <table><tbody>
              ${a.efectivoMovido.map(i=>`<tr><td>${i.cuenta}${i.moneda&&i.moneda!=="DOP"?` — US$${Number(i.monto_cuenta).toLocaleString("es-DO",{minimumFractionDigits:2})} a ${Number(i.tasa)}`:""}${i.concepto?` · ${i.concepto}`:""}</td><td class="num">${c(i.monto_caja)}</td></tr>`).join("")}
            </tbody></table>
            <div class="linea-fuerte"><span>EFECTIVO MOVIDO A CUENTAS</span><span>${c(a==null?void 0:a.totalEfectivoMovido)}</span></div>`:""}

            <!-- El cierre termina en un solo recuadro: lo que entró, lo que
                 salió y lo que debe haber en la gaveta. La resta a la vista,
                 en vez de un número suelto arriba que hay que ir a comprobar. -->
            <div class="cuadre-final">
              <div class="linea total"><span>EFECTIVO EN CAJA</span><span>${c(a==null?void 0:a.efectivoEnCaja)}</span></div>
            </div>
          </div>

          <div class="col">
            <div class="sec">Desglose del Dinero en Caja</div>
            <table>
              <thead><tr><th>Denominación</th><th class="num">Cant.</th><th class="num">Valor</th></tr></thead>
              <tbody>
                ${Ea.filter(i=>Number(t.desglose[i.label]||0)>0&&(i.tipo!=="tasa"||Number(t.desglose.Dólares||0)>0)).map(i=>{const b=t.desglose[i.label]||0,h=X(i,t.desglose);return`<tr><td>${i.label}</td><td class="num">${b}</td><td class="num">${i.tipo==="tasa"?"":c(h)}</td></tr>`}).join("")}
                <tr class="grande"><td colspan="2">Total Desglose</td><td class="num">${c(t.total_desglose)}</td></tr>
                <tr class="grande"><td colspan="2">Diferencia${t.diferencia<0?" (FALTANTE)":t.diferencia>0?" (SOBRANTE)":""}</td><td class="num">${c(t.diferencia)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="firmas">
          <div>Cajero</div>
          <div>Supervisor</div>
        </div>
      </body>
      </html>
    `},Fa=(t,a)=>{const r=(Ra||(y==null?void 0:y.formato_cierre_caja)||"pos_80mm")==="carta",d=ca(a),p=na(a),i=(n,_,R={})=>R.siempre||Number(_)>0?`<div class="row${R.total?" total-row":""}"><span>${n}:</span><span${R.bold?' class="bold"':""}>${c(_)}</span></div>`:"",b=r?gt(t,a):`
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8">
        <style>
          @page { margin: 0; size: 80mm auto; }
          html, body { margin: 0; padding: 0; background-color: #fff; }
          body {
            width: 68mm; margin: 0; padding: 2mm 4mm;
            box-sizing: border-box; line-height: 1.2;
            font-family: Arial, Helvetica, sans-serif; font-size: 14px;
            font-weight: 700; letter-spacing: 0.2px; color: #000;
            -webkit-print-color-adjust: exact;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .bold { font-weight: 900; }
          .separator { border-top: 1px dashed #000; margin: 3px 0; }
          h1 { font-size: 19px; margin: 0; font-weight: 900; }
          p { margin: 1px 0; }
          .row { display: flex; justify-content: space-between; margin-bottom: 1px; }
          .total-row { font-weight: 900; font-size: 16px; border-top: 2px solid #000; padding-top: 3px; margin-top: 4px; }
        </style>
      </head>
      <body onload="window.print()">
        <div class="text-center">
          <h1 class="bold">${((y==null?void 0:y.nombre)||"MotoFlow").toUpperCase()}</h1>
          <p style="margin: 2px 0; font-size: 13px;">CIERRE DE CAJA</p>
          ${t._reimpresion?'<p class="bold" style="margin:2px 0;font-size:12px;">** REIMPRESION **</p>':""}
        </div>
        <div class="separator"></div>
        <div class="row"><span>Fecha:</span><span>${z(t.fecha)}</span></div>
        <div class="row"><span>Turno:</span><span>${t.turno}</span></div>
        <div class="row"><span>Cajero:</span><span>${t.cajero_nombre}</span></div>
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">ENTRADAS DEL DIA</div>
        ${i("Ventas Contado Caja",a==null?void 0:a.totalVentasContadoCaja)}
        ${i("Cuenta Contado Móvil",a==null?void 0:a.totalVentasContadoMovil)}
        ${i("Ventas Transf./Tarjeta",a==null?void 0:a.totalVentasContadoNoEfectivo)}
        ${i("Ventas Crédito",a==null?void 0:a.totalVentasCredito)}
        ${i("Total Ventas",a==null?void 0:a.totalVentas,{bold:!0})}
        ${Number(a==null?void 0:a.totalRecibosMovil)>0?`
        ${i("Recibos Ingreso Caja",a==null?void 0:a.totalRecibosCaja)}
        ${i("Recibos Ingreso Móvil",a==null?void 0:a.totalRecibosMovil)}`:""}
        ${i("Recibos Ingreso (total)",a==null?void 0:a.totalRecibos)}
        ${Number(a==null?void 0:a.totalRecibosOtrasFormas)>0?`
        ${i("&nbsp;&nbsp;En Efectivo",a==null?void 0:a.totalRecibosEfectivo,{siempre:!0})}
        ${i("&nbsp;&nbsp;Transf/Cheque/Tarjeta",a==null?void 0:a.totalRecibosOtrasFormas)}`:""}
        <div class="row total-row"><span>TOTAL INGRESO EN CAJA:</span><span>${c(p)}</span></div>
        ${((a==null?void 0:a.gastosDiarios)||[]).length?`
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">DESGLOSE DE GASTOS</div>
        ${a.gastosDiarios.map(n=>`
          <div class="row">
            <span style="max-width: 70%;">${n.tipo_gasto||"GASTO"}${n.descripcion?` — ${n.descripcion}`:""}</span>
            <span>${c(n.monto)}</span>
          </div>`).join("")}
        <div class="row" style="border-top: 1px solid #000; padding-top: 2px; margin-top: 2px;">
          <span>Total Gastos:</span><span>${c(a==null?void 0:a.totalGastosDiarios)}</span>
        </div>`:""}
        ${((a==null?void 0:a.pagosNomina)||[]).length?`
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">NOMINA PAGADA HOY</div>
        ${a.pagosNomina.map(n=>`
          <div class="row">
            <span style="max-width: 70%;">${n.descripcion||"NOMINA"}</span>
            <span>${c(n.monto)}</span>
          </div>`).join("")}
        <div class="row" style="border-top: 1px solid #000; padding-top: 2px; margin-top: 2px;">
          <span>Total Nomina:</span><span>${c(a==null?void 0:a.totalPagosNomina)}</span>
        </div>`:""}
        ${((a==null?void 0:a.pagosTerceros)||[]).length?`
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">PAGOS A TERCEROS</div>
        ${a.pagosTerceros.map(n=>`
          <div class="row">
            <span style="max-width: 70%;">${n.concepto_tercero||"TERCERO"}${n.descripcion?` — ${n.descripcion}`:""}</span>
            <span>${c(n.monto)}</span>
          </div>`).join("")}
        <div class="row" style="border-top: 1px solid #000; padding-top: 2px; margin-top: 2px;">
          <span>Total a terceros:</span><span>${c(a==null?void 0:a.totalPagosTerceros)}</span>
        </div>`:""}
        ${((a==null?void 0:a.prestamosEfectivo)||[]).length?`
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">PRÉSTAMOS (EFECTIVO)</div>
        ${a.prestamosEfectivo.map(n=>{var _;return`
          <div class="row">
            <span style="max-width: 70%;">${((_=n.clientes)==null?void 0:_.nombre)||n.numero||"PRÉSTAMO"}</span>
            <span>${c(n.monto_capital)}</span>
          </div>`}).join("")}
        <div class="row" style="border-top: 1px solid #000; padding-top: 2px; margin-top: 2px;">
          <span>Total Préstamos:</span><span>${c(a==null?void 0:a.totalPrestamosEfectivo)}</span>
        </div>`:""}
        ${((a==null?void 0:a.compromisosEfectivo)||[]).length?`
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">COMPROMISOS (EFECTIVO)</div>
        ${a.compromisosEfectivo.map(n=>`
          <div class="row">
            <span style="max-width: 70%;">${n.nombre||"COMPROMISO"}</span>
            <span>${c(n.monto_efectivo!==void 0?n.monto_efectivo:n.monto)}</span>
          </div>
          ${(n.empleados||[]).map(_=>`
          <div class="row">
            <span style="max-width: 70%; padding-left: 8px;">· ${_.nombre}${_.yaEnGastos?" (en Gastos)":""}</span>
            <span>${c(_.monto)}</span>
          </div>`).join("")}`).join("")}
        <div class="row" style="border-top: 1px solid #000; padding-top: 2px; margin-top: 2px;">
          <span>Total Compromisos:</span><span>${c(a==null?void 0:a.totalCompromisosEfectivo)}</span>
        </div>`:""}
        ${Number(a==null?void 0:a.totalDevoluciones)>0||Number(a==null?void 0:a.totalPagosSuplidores)>0||Number(a==null?void 0:a.comprasContadoEfectivo)>0?`
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">OTRAS SALIDAS</div>
        ${i("Devoluciones",a==null?void 0:a.totalDevoluciones)}
        ${i("Pagos Suplidores",a==null?void 0:a.totalPagosSuplidores)}
        ${i("Compras de contado",a==null?void 0:a.comprasContadoEfectivo)}`:""}
        <div class="separator"></div>
        <div class="row total-row"><span>GASTO TOTAL:</span><span>${c(d)}</span></div>
        ${((a==null?void 0:a.efectivoMovido)||[]).length?`
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">EFECTIVO MOVIDO A CUENTAS (NO ES GASTO)</div>
        ${a.efectivoMovido.map(n=>`
          <div class="row">
            <span style="max-width: 70%;">${n.cuenta}${n.moneda&&n.moneda!=="DOP"?` (US$${Number(n.monto_cuenta).toLocaleString("es-DO",{minimumFractionDigits:2})} a ${Number(n.tasa)})`:""}</span>
            <span>${c(n.monto_caja)}</span>
          </div>`).join("")}
        <div class="row total-row"><span>MOVIDO A CUENTAS:</span><span>${c(a==null?void 0:a.totalEfectivoMovido)}</span></div>`:""}
        <div class="row total-row"><span>EFECTIVO EN CAJA:</span><span>${c(a==null?void 0:a.efectivoEnCaja)}</span></div>
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">DESGLOSE DINERO EN CAJA</div>
        <div class="row" style="font-size: 12px; border-bottom: 1px solid #000; margin-bottom: 2px;">
          <span style="flex: 1;">DENOM.</span>
          <span class="text-right" style="width: 42px;">CANT.</span>
          <span class="text-right" style="width: 84px;">VALOR</span>
        </div>
        ${Ea.filter(n=>Number(t.desglose[n.label]||0)>0&&(n.tipo!=="tasa"||Number(t.desglose.Dólares||0)>0)).map(n=>{const _=t.desglose[n.label]||0,R=X(n,t.desglose);return`<div class="row">
            <span style="flex: 1;">${n.label}</span>
            <span class="text-right" style="width: 42px;">${_}</span>
            <span class="text-right" style="width: 84px;">${n.tipo==="tasa"?"":c(R)}</span>
          </div>`}).join("")}
        <div class="row total-row"><span>Total Desglose:</span><span>${c(t.total_desglose)}</span></div>
        <div class="row" style="margin-top: 6px; font-weight: 900; font-size: 16px;">
          <span>Diferencia${t.diferencia<0?" (FALTANTE)":t.diferencia>0?" (SOBRANTE)":""}:</span>
          <span>${c(t.diferencia)}</span>
        </div>
        <div class="separator"></div>
        <p class="text-center" style="margin-top: 10px; font-size: 13px;">*** FIN DEL CIERRE ***</p>
      </body>
      </html>
    `,h=document.createElement("iframe");h.style.cssText="position:fixed;right:0;bottom:0;width:0;height:0;border:0;",document.body.appendChild(h),h.contentWindow.document.open(),h.contentWindow.document.write(b),h.contentWindow.document.close(),setTimeout(()=>{document.body.contains(h)&&document.body.removeChild(h)},3e3)},Ia=v.useCallback(async()=>{if(!u)return;const{data:t,error:a}=await N.from("cierres_caja").select("*").eq("tenant_id",u).order("created_at",{ascending:!1}).limit(60);a||dt(t||[])},[u]);v.useEffect(()=>{B&&Ia()},[B,Ia]);const[Pa,La]=v.useState(null),vt=async t=>{La(t.id);try{const a=!t.detalle,r=t.detalle||await I(t.fecha);if(!r)throw new Error("No se pudo armar el desglose de esa fecha.");const d=Math.abs((Number(r.efectivoEnCaja)||0)-(Number(t.efectivo_en_caja)||0)),p=a?{...r,efectivoEnCaja:t.efectivo_en_caja}:r;Fa({...t,_reimpresion:!0,_reconstruido:a,_descuadre:a&&d>.01?r.efectivoEnCaja:null},p)}catch(a){x({variant:"destructive",title:"No se pudo reimprimir",description:a.message})}finally{La(null)}};return v.useEffect(()=>{const t=a=>{_a==="cierre-caja"&&(a.key==="Escape"&&a.defaultPrevented||(a.key==="F8"&&J&&(a.preventDefault(),ia()),a.key==="Escape"&&(a.preventDefault(),J?oa(!1):aa("cierre-caja"))))};return window.addEventListener("keydown",t),()=>window.removeEventListener("keydown",t)},[J,ia,aa,_a]),o.jsxs(o.Fragment,{children:[o.jsx(Rt,{children:o.jsx("title",{children:"Cierre de Caja — MotoFlow"})}),o.jsx(Mt.div,{initial:{opacity:0,y:20},animate:{opacity:1,y:0},className:"p-1 md:p-4 bg-gray-100 min-h-full flex flex-col",children:o.jsxs("div",{className:"bg-white p-4 rounded-lg shadow-md flex-grow flex flex-col",children:[o.jsxs("div",{className:"bg-morla-blue text-white py-1.5 rounded-t-lg mb-3 relative",children:[o.jsx("h1",{className:"text-white font-black tracking-[0.25em] italic uppercase text-base drop-shadow-sm text-center",children:"CIERRE DE CAJA"}),o.jsx("button",{type:"button",onClick:()=>I(),disabled:ea,title:"Actualizar los montos del día",className:"absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-white/20 disabled:opacity-50",children:o.jsx(Ft,{className:`w-4 h-4 ${ea?"animate-spin":""}`})})]}),w&&q(w)!==q(Xa())&&o.jsxs("div",{className:"mb-3 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900",children:[o.jsxs("b",{children:["Estás cerrando una fecha pasada: ",at(w,"dd/MM/yyyy"),"."]})," ","Las cifras son las de ese día. Si ya vendiste hoy, el efectivo de la gaveta incluye lo de hoy y no va a cuadrar con el conteo."]}),o.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-4 gap-x-4 gap-y-2 px-3 py-2 border rounded-lg mb-3",children:[o.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[o.jsx(Z,{className:"font-bold text-xs shrink-0",children:"Fecha"}),o.jsxs(zt,{children:[o.jsx(Ut,{asChild:!0,children:o.jsxs(G,{variant:"outline",className:It("flex-1 min-w-0 h-8 justify-start text-left font-normal text-sm px-2",!w&&"text-muted-foreground"),children:[o.jsx(Pt,{className:"mr-1.5 h-3.5 w-3.5 shrink-0"}),w?at(w,"dd/MM/yyyy"):o.jsx("span",{children:"Seleccione"})]})}),o.jsx(Ht,{className:"w-auto p-0",children:o.jsx(Jt,{mode:"single",selected:w,onSelect:ct,initialFocus:!0})})]})]}),!k&&o.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[o.jsx(Z,{className:"font-bold text-xs shrink-0",children:"Turno"}),o.jsx(ha,{type:"number",min:"1",max:ta,value:H,onChange:t=>wa(parseInt(t.target.value,10)||1),onFocus:t=>t.target.select(),className:"flex-1 min-w-0 h-8 text-center font-bold px-2"})]}),o.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[o.jsx(Z,{className:"font-bold text-xs shrink-0",children:"Caja"}),o.jsxs(ja,{value:"caja1",disabled:!0,children:[o.jsx(ya,{className:"flex-1 min-w-0 h-8 text-sm px-2",children:o.jsx(Ca,{})}),o.jsx(Na,{children:o.jsx(K,{value:"caja1",children:"Caja No. 1"})})]})]}),o.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[o.jsx(Z,{className:"font-bold text-xs shrink-0",children:"Cajero"}),o.jsxs(ja,{value:$,onValueChange:Ta,children:[o.jsx(ya,{className:"flex-1 min-w-0 h-8 text-sm px-2",children:o.jsx(Ca,{placeholder:"Seleccione cajero"})}),o.jsxs(Na,{children:[o.jsx(K,{value:"ALL",className:"font-bold text-morla-blue",children:"📊 Todos los Cajeros (Consolidado)"}),$a.map(t=>o.jsx(K,{value:t.id,children:t.nombre_completo||t.email},t.id))]})]})]})]}),ea?o.jsx("div",{className:"flex-grow flex items-center justify-center",children:o.jsx(ua,{className:"h-8 w-8 animate-spin text-morla-blue"})}):s?o.jsxs("div",{className:"grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4",children:[o.jsxs("div",{className:"border rounded-lg p-4 bg-gradient-to-br from-slate-50 to-blue-50",children:[o.jsx("h2",{className:"font-bold text-sm uppercase text-gray-500 tracking-wider mb-3",children:$==="ALL"?"Resumen Total del Día":"Resumen del Turno"}),o.jsxs("div",{className:"space-y-2",children:[o.jsx(C,{label:"Cantidad de Facturas",value:s.cantFacturas,isCount:!0,siempre:!0}),o.jsx(C,{label:"Ventas Contado Caja",value:s.totalVentasContadoCaja}),o.jsx(C,{label:"Cuenta Contado Móvil",value:s.totalVentasContadoMovil}),o.jsx(C,{label:"Ventas por Transferencia/Tarjeta",value:s.totalVentasContadoNoEfectivo}),o.jsx(C,{label:"Ventas Crédito",value:s.totalVentasCredito}),o.jsx(C,{label:"Total Ventas",value:s.totalVentas,bold:!0}),Number(s.totalRecibosMovil)>0&&o.jsxs(o.Fragment,{children:[o.jsx(C,{label:"Recibos de Ingreso Caja",value:s.totalRecibosCaja}),o.jsx(C,{label:"Recibos de Ingreso Móvil",value:s.totalRecibosMovil})]}),o.jsx(C,{label:"Recibos de Ingreso (total)",value:s.totalRecibos}),Number(s.totalRecibosOtrasFormas)>0&&o.jsxs(o.Fragment,{children:[o.jsx(C,{label:"· Recibos en Efectivo",value:s.totalRecibosEfectivo}),o.jsx(C,{label:"· Recibos Transf/Cheque/Tarjeta",value:s.totalRecibosOtrasFormas})]}),o.jsx(la,{label:"Total ingreso en caja",value:na(s)}),o.jsx(C,{label:"Gastos Diarios",value:s.totalGastosDiarios}),o.jsx(C,{label:"Nómina (Efectivo)",value:s.totalPagosNomina}),(s.pagosNomina||[]).length>0&&o.jsx("div",{className:"mt-1 mb-1 ml-3 pl-3 border-l-2 border-gray-200",children:s.pagosNomina.map(t=>o.jsxs("div",{className:"flex justify-between items-center py-0.5",children:[o.jsx("span",{className:"text-xs text-gray-500 truncate pr-2",title:t.descripcion,children:String(t.descripcion||"Nómina").split("—").pop().trim()}),o.jsx("span",{className:"font-mono text-xs text-gray-600 shrink-0",children:c(t.monto)})]},t.id||t.descripcion))}),o.jsx(C,{label:"Pagos a terceros (GPS, seguro...)",value:s.totalPagosTerceros}),o.jsx(C,{label:"Préstamos (Efectivo)",value:s.totalPrestamosEfectivo}),o.jsx(C,{label:"Compromisos (Efectivo)",value:s.totalCompromisosEfectivo}),(s.compromisosEfectivo||[]).filter(t=>(t.empleados||[]).length>0).map(t=>o.jsxs("div",{className:"mt-1 mb-1 ml-3 pl-3 border-l-2 border-gray-200",children:[o.jsx("p",{className:"text-[11px] font-semibold text-gray-400 uppercase tracking-wide",children:t.nombre}),t.empleados.map((a,r)=>o.jsxs("div",{className:"flex justify-between items-center py-0.5",children:[o.jsx("span",{className:`text-xs truncate pr-2 ${a.yaEnGastos?"text-gray-400 line-through":"text-gray-500"}`,children:a.nombre}),o.jsx("span",{className:`font-mono text-xs shrink-0 ${a.yaEnGastos?"text-gray-400 line-through":"text-gray-600"}`,children:c(a.monto)})]},`${t.id}-${r}`)),Number(t.cubierto)>0&&o.jsxs("p",{className:"text-[10px] text-amber-700 leading-snug mt-0.5",children:[c(t.cubierto)," ya salió como gasto el día de cada pago; aquí solo entra"," ",c(t.monto_efectivo),"."]})]},t.id)),o.jsx(C,{label:"Devoluciones",value:s.totalDevoluciones}),o.jsx(C,{label:"Pagos a Suplidores (Efectivo)",value:s.totalPagosSuplidores}),o.jsx(C,{label:"Compras de contado (Efectivo)",value:s.comprasContadoEfectivo}),o.jsx(la,{label:"Gasto total",value:ca(s)}),(s.efectivoMovido||[]).length>0&&o.jsxs(o.Fragment,{children:[o.jsx("div",{className:"mt-2 mb-1 ml-3 pl-3 border-l-2 border-emerald-200",children:s.efectivoMovido.map(t=>o.jsxs("div",{className:"flex justify-between items-center py-0.5",children:[o.jsxs("span",{className:"text-xs text-gray-500 truncate pr-2",children:[t.cuenta,t.moneda&&t.moneda!=="DOP"?` (US$${Number(t.monto_cuenta).toLocaleString("es-DO",{minimumFractionDigits:2})} a ${Number(t.tasa)})`:"",t.concepto?` · ${t.concepto}`:""]}),o.jsx("span",{className:"font-mono text-xs text-gray-600 shrink-0",children:c(t.monto_caja)})]},t.id))}),o.jsx(la,{label:"Efectivo movido a cuentas (no es gasto)",value:s.totalEfectivoMovido})]}),o.jsxs("div",{className:"flex justify-between items-center py-2 mt-2 bg-morla-blue/10 rounded px-3 border border-morla-blue/30",children:[o.jsx("span",{className:"font-bold text-morla-blue",children:"Efectivo en Caja"}),o.jsx("span",{className:"font-bold text-morla-blue text-lg font-mono",children:c(s.efectivoEnCaja)})]})]})]}),o.jsx("div",{className:"border rounded-lg p-4 flex flex-col",children:J?o.jsxs("div",{className:"flex flex-col h-full",children:[o.jsxs("div",{className:"flex items-center justify-between gap-3 mb-2",children:[o.jsx("h3",{className:"font-bold text-sm uppercase tracking-widest text-gray-600",children:"DESGLOSE DE MONEDAS"}),o.jsxs(ja,{value:"DOP",disabled:!0,children:[o.jsx(ya,{className:"w-32 h-7 text-xs",children:o.jsx(Ca,{})}),o.jsx(Na,{children:o.jsx(K,{value:"DOP",children:"DOP - PESO"})})]})]}),o.jsx(Lt,{className:"flex-grow border rounded-lg max-h-[380px]",children:o.jsxs(tt,{children:[o.jsx(ot,{className:"bg-gray-200 sticky top-0 z-10",children:o.jsxs(U,{className:"h-8",children:[o.jsx(O,{className:"w-20 h-8 py-1 font-bold text-xs",children:"MONEDA"}),o.jsx(O,{className:"w-24 h-8 py-1 font-bold text-center text-xs",children:"CANTIDAD"}),o.jsx(O,{className:"h-8 py-1 text-right font-bold text-xs",children:"VALOR"})]})}),o.jsx(et,{children:Q.filter(t=>t.tipo!=="tasa").map(t=>{const a=V[t.label]??0,r=X(t,V);return o.jsxs(U,{className:"hover:bg-yellow-50/50",children:[o.jsx(D,{className:"py-0.5 font-semibold text-right pr-4 text-sm whitespace-nowrap",children:t.label}),o.jsx(D,{className:"py-0.5 text-center",children:o.jsx(ha,{type:"number",min:"0",step:t.tipo?"0.01":"1",value:a,onChange:d=>Ma(t,d.target.value),onFocus:d=>d.target.select(),onClick:d=>d.target.select(),className:"w-20 mx-auto text-center h-6 text-sm px-1"})}),o.jsx(D,{className:"py-0.5 text-right font-mono text-sm",children:t.tipo==="dolar"?o.jsxs("div",{className:"flex items-center justify-end gap-2",children:[o.jsx("span",{className:"text-xs text-gray-600 font-sans font-semibold whitespace-nowrap",children:"Tasa del día"}),o.jsx(ha,{type:"number",min:"0",step:"0.01",value:V["Tasa del día"]??"",onChange:d=>Ma({label:"Tasa del día",tipo:"tasa"},d.target.value),onFocus:d=>d.target.select(),onClick:d=>d.target.select(),className:"w-20 text-center h-6 text-sm px-1"}),o.jsx("span",{className:"min-w-[90px]",children:c(r)})]}):c(r)})]},t.label)})}),o.jsx(Bt,{className:"sticky bottom-0 bg-yellow-100 z-10",children:o.jsxs(U,{className:"font-bold",children:[o.jsx(D,{colSpan:2,className:"py-1 text-right text-red-600 uppercase text-sm",children:"TOTAL ==>"}),o.jsx(D,{className:"py-1 text-right text-red-600 font-mono text-base",children:c(A)})]})})]})}),o.jsx("div",{className:"mt-2 px-2.5 py-2 bg-blue-50 border border-blue-200 rounded-lg",children:o.jsx(Vt,{value:W,onChange:xt,moneda:"DOP",contexto:"cierre_caja",label:"Depositar en",inline:!0})}),o.jsxs("div",{className:"mt-3 flex items-center justify-between",children:[o.jsxs("label",{className:"flex items-center gap-2 text-sm cursor-pointer",children:[o.jsx("input",{type:"checkbox",checked:sa,onChange:t=>rt(t.target.checked),className:"rounded"}),o.jsx(st,{className:"h-4 w-4"}),"Imprimir ?"]}),sa&&o.jsxs("select",{value:Ra||(y==null?void 0:y.formato_cierre_caja)||"pos_80mm",onChange:t=>mt(t.target.value),className:"h-9 border border-slate-300 rounded px-2 text-xs font-bold bg-white",title:"Papel del impreso — se recuerda en esta PC",children:[o.jsx("option",{value:"pos_80mm",children:"📑 Ticket 80mm"}),o.jsx("option",{value:"carta",children:"📄 Carta (8.5 x 11)"})]}),o.jsxs(G,{onClick:ia,disabled:Sa,className:"bg-morla-blue hover:bg-morla-blue/90 text-white gap-2",children:[Sa?o.jsx(ua,{className:"h-4 w-4 animate-spin"}):o.jsx(qt,{className:"h-4 w-4"}),"F8 - Grabar y Cerrar ",k?"Caja":"Turno"]})]}),s&&o.jsxs("div",{className:`mt-3 p-3 rounded-lg text-center font-bold text-sm ${A-s.efectivoEnCaja===0?"bg-green-100 text-green-700":A-s.efectivoEnCaja<0?"bg-red-100 text-red-700":"bg-yellow-100 text-yellow-700"}`,children:["Diferencia: ",c(A-s.efectivoEnCaja),A-s.efectivoEnCaja===0&&" ✓ Cuadra",A-s.efectivoEnCaja<0&&" (Faltante)",A-s.efectivoEnCaja>0&&" (Sobrante)"]})]}):o.jsxs("div",{className:"flex-grow flex flex-col items-center justify-center gap-4",children:[o.jsxs(G,{onClick:()=>oa(!0),size:"lg",className:"bg-morla-blue hover:bg-morla-blue/90 text-white px-8 py-6 text-base gap-3 shadow-lg",children:[o.jsx(Wt,{className:"h-5 w-5"}),"Contar Efectivo y Cerrar ",k?"Caja":"Turno"]}),o.jsxs("p",{className:"text-xs text-gray-400 text-center max-w-[260px]",children:["Se cuentan los billetes y al grabar el desglose ",k?"la caja queda cerrada":"el turno queda cerrado","."]})]})})]}):null,o.jsxs("div",{className:"mt-4 border rounded-lg",children:[o.jsxs("button",{type:"button",onClick:()=>pt(t=>!t),className:"w-full flex items-center justify-between px-4 py-2 text-left hover:bg-gray-50 transition-colors",children:[o.jsx("span",{className:"text-sm font-semibold text-gray-700",children:"Cierres anteriores"}),o.jsx(kt,{className:`h-4 w-4 text-gray-400 transition-transform ${B?"rotate-180":""}`})]}),B&&o.jsxs("div",{className:"border-t max-h-72 overflow-y-auto",children:[Aa.length===0?o.jsx("p",{className:"px-4 py-3 text-sm text-gray-400 italic",children:"No hay cierres grabados."}):o.jsxs(tt,{children:[o.jsx(ot,{children:o.jsxs(U,{children:[o.jsx(O,{className:"text-xs",children:"Fecha"}),o.jsx(O,{className:"text-xs",children:"Turno"}),o.jsx(O,{className:"text-xs",children:"Cajero"}),o.jsx(O,{className:"text-xs text-right",children:"Efectivo"}),o.jsx(O,{className:"text-xs text-right",children:"Contado"}),o.jsx(O,{className:"text-xs text-right",children:"Diferencia"}),o.jsx(O,{className:"text-xs text-right",children:" "})]})}),o.jsx(et,{children:Aa.map(t=>{const a=Number(t.diferencia)||0;return o.jsxs(U,{children:[o.jsx(D,{className:"text-sm py-1.5",children:z(t.fecha)}),o.jsx(D,{className:"text-sm py-1.5",children:t.turno}),o.jsx(D,{className:"text-sm py-1.5 max-w-[160px] truncate",title:t.cajero_nombre,children:t.cajero_nombre}),o.jsx(D,{className:"text-sm py-1.5 text-right font-mono",children:c(t.efectivo_en_caja)}),o.jsx(D,{className:"text-sm py-1.5 text-right font-mono",children:c(t.total_desglose)}),o.jsx(D,{className:`text-sm py-1.5 text-right font-mono ${Math.abs(a)<.005?"text-green-600":a<0?"text-red-600":"text-amber-600"}`,children:c(a)}),o.jsx(D,{className:"text-right py-1.5",children:o.jsxs(G,{size:"sm",variant:"outline",className:"h-7 gap-1.5 text-xs",disabled:Pa===t.id,onClick:()=>vt(t),children:[Pa===t.id?o.jsx(ua,{className:"h-3.5 w-3.5 animate-spin"}):o.jsx(st,{className:"h-3.5 w-3.5"})," Reimprimir"]})})]},t.id)})})]}),o.jsx("p",{className:"px-4 py-2 text-[11px] text-gray-400 italic border-t",children:"Sale marcado como reimpresión. Los cierres grabados desde hoy salen idénticos al original; los anteriores reconstruyen el desglose con los movimientos de esa fecha, y el efectivo y el conteo de billetes son siempre los que quedaron grabados."})]})]}),o.jsx("div",{className:"mt-auto pt-4 flex justify-end items-center space-x-4 border-t",children:o.jsxs(G,{variant:"outline",onClick:()=>aa("cierre-caja"),className:"gap-2",children:[o.jsx(Gt,{className:"h-4 w-4"})," ESC - Salir"]})})]})})]})};export{io as default};
