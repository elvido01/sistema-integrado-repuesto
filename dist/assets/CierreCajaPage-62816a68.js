import{u as $t,l as Tt,a9 as St,r as g,as as Ka,at as q,bp as Dt,s as N,j as t,H as At,m as Ot,az as Rt,aL as Qa,L as Z,d as G,aZ as Ft,y as Pt,I as ga,G as va,J as ha,K as ja,N as ya,O as K,D as Ca,b1 as It,W as Mt,e as Lt,ax as Vt,a_ as z,X as qt}from"./index-8c003f61.js";import{P as kt,a as Gt,b as zt}from"./popover-bcec4a37.js";import{C as Ut}from"./calendar-e19b1b71.js";import{T as Xa,a as at,b as U,c as A,d as tt,e as D,f as Ht}from"./table-432b6ff2.js";import{C as Jt}from"./coins-02c03ae2.js";import{P as ot}from"./printer-8be13ca1.js";import"./index-57f81e0a.js";import"./index-811e671f.js";import"./chevron-left-65131ca4.js";const Na=[{label:"2,000",value:2e3},{label:"1,000",value:1e3},{label:"500",value:500},{label:"200",value:200},{label:"100",value:100},{label:"50",value:50},{label:"25",value:25},{label:"20",value:20},{label:"10",value:10},{label:"5",value:5},{label:"1",value:1},{label:"Cent.",value:0},{label:"Tarjetas",value:0,tipo:"tarjeta"},{label:"Cheques",value:0,tipo:"cheque"},{label:"Tarjetas/Cheques",value:0,tipo:"tarjeta"},{label:"Dólares",value:0,tipo:"dolar"},{label:"Tasa del día",value:0,tipo:"tasa"},{label:"Otros",value:0,tipo:"otro"}],Bt=new Set(["20","Cent.","Otros","Tarjetas","Cheques"]),Q=Na.filter(x=>!Bt.has(x.label)),X=(x,u)=>{const L=Number(u==null?void 0:u[x.label])||0;return x.tipo==="tasa"?0:x.tipo==="dolar"?L*(Number(u==null?void 0:u["Tasa del día"])||0):x.tipo?L:L*x.value},n=x=>new Intl.NumberFormat("es-DO",{style:"decimal",minimumFractionDigits:2,maximumFractionDigits:2}).format(x||0),et=x=>String((x==null?void 0:x.estado)||"").toUpperCase()!=="ANULADA",st=x=>{const u=String((x==null?void 0:x.forma_pago)||"").toUpperCase(),L=String((x==null?void 0:x.tipo_pago)||"").toUpperCase(),j=String((x==null?void 0:x.notas)||"").toUpperCase();return u==="EFECTIVO"||j.includes("POS_MOVIL")||j.includes("POS MOVIL")||j.includes("MOVIL")||j.includes("MÓVIL")||L.includes("MOVIL")},eo=()=>{const{toast:x}=$t(),{user:u,profile:L,empresa:j,tenantId:E}=Tt(),{closePanel:aa,activePanel:ua}=St(),[w,lt]=g.useState(Ka()),[H,Ea]=g.useState(1),ta=Math.max(1,parseInt(j==null?void 0:j.turnos_caja_dia,10)||1),k=ta<=1,[_a,it]=g.useState([]),[$,wa]=g.useState("ALL"),[J,oa]=g.useState(!1),[$a,Ta]=g.useState(!1),[ea,Sa]=g.useState(!1),[sa,nt]=g.useState(!0),[Da,ct]=g.useState([]),[B,rt]=g.useState(!1),[W,dt]=g.useState(null),[Aa,pt]=g.useState(()=>localStorage.getItem("cierre_caja_paper")||""),xt=o=>{pt(o),localStorage.setItem("cierre_caja_paper",o)},[s,bt]=g.useState(null),[V,Y]=g.useState(Q.reduce((o,a)=>({...o,[a.label]:0}),{}));g.useEffect(()=>{(async()=>{const{data:a,error:r}=await N.from("perfiles").select("id, nombre_completo, email").order("nombre_completo");!r&&a&&(it(a),wa("ALL"))})()},[u]);const I=g.useCallback(async o=>{const a=!!o;if(!w&&!a)return;a||Sa(!0);const r=o||q(w),{desde:d,hasta:p}=Dt(r);let i=[],b=[],v=[],c=[],_=[],R=[],ca=[],ra=[],F=[];try{let e=N.from("facturas").select("id, total, itbis, subtotal, descuento, forma_pago, tipo_pago, monto_recibido, cambio, fecha, created_at, notas, estado").eq("tenant_id",E).gte("fecha",d).lte("fecha",p);$&&$!=="ALL"&&(e=e.eq("usuario_id",$));const{data:l,error:C}=await e;C?console.warn("Error cargando ventas:",C.message):i=(l||[]).filter(et);let m=N.from("facturas").select("id, total, itbis, subtotal, descuento, forma_pago, tipo_pago, monto_recibido, cambio, fecha, created_at, notas, estado").eq("tenant_id",E).gte("created_at",d).lte("created_at",p);$&&$!=="ALL"&&(m=m.eq("usuario_id",$));const{data:T,error:f}=await m;if(f)console.warn("Error cargando ventas moviles:",f.message);else{const P=new Set(i.map(h=>h.id)),S=(T||[]).filter(et).filter(h=>st(h)&&!P.has(h.id));i=[...i,...S]}}catch(e){console.warn("Exception cargando ventas:",e)}try{const{data:e,error:l}=await N.from("devoluciones").select("total_devolucion, facturas!inner(forma_pago)").eq("tenant_id",E).ilike("facturas.forma_pago","contado").eq("fecha_devolucion",r);l?console.warn("Error cargando devoluciones:",l.message):b=e||[]}catch(e){console.warn("Exception cargando devoluciones:",e)}try{const{data:e,error:l}=await N.from("recibos_ingreso").select("monto_pagado, fecha, created_at, origen, formas_pago").eq("tenant_id",E).eq("anulado",!1).eq("fecha",r);if(l){console.warn("Error cargando recibos por fecha:",l.message);const{data:C,error:m}=await N.from("recibos_ingreso").select("monto_pagado, created_at, origen, formas_pago").eq("tenant_id",E).eq("anulado",!1).gte("created_at",d).lte("created_at",p);m?console.warn("Error cargando recibos por created_at:",m.message):v=C||[]}else v=e||[];console.log(`Recibos encontrados para ${r}:`,v.length,v)}catch(e){console.warn("Exception cargando recibos:",e)}try{const{data:e,error:l}=await N.from("pagos_suplidores").select("monto_pagado, formas_pago").eq("tenant_id",E).eq("anulado",!1).gte("created_at",d).lte("created_at",p);l?console.warn("Error cargando pagos suplidores:",l.message):c=e||[]}catch(e){console.warn("Exception cargando pagos suplidores:",e)}try{const{data:e,error:l}=await N.from("gastos_diarios").select("monto, descripcion, tipo_gasto, afecta_caja, cuenta_bancaria_id, es_tercero, concepto_tercero").eq("tenant_id",E).eq("fecha",r).eq("anulado",!1);if(l)console.warn("Error cargando gastos diarios:",l.message);else{const C=(e||[]).filter(f=>!f.cuenta_bancaria_id&&f.afecta_caja!==!1);R=C.filter(f=>f.es_tercero===!0);const m=f=>/n[oó]mina/i.test(String(f.tipo_gasto||"")),T=C.filter(f=>f.es_tercero!==!0);ca=T.filter(m),_=T.filter(f=>!m(f))}}catch(e){console.warn("Exception cargando gastos diarios:",e)}let da=0;try{const{data:e,error:l}=await N.from("compras").select("numero, total_compra, forma_pago, estado, pagos, created_at").eq("tenant_id",E).ilike("forma_pago","contado").gte("created_at",d).lte("created_at",p);l?console.warn("Error cargando compras de contado:",l.message):da=(e||[]).filter(C=>(C.estado||"")!=="ANULADA").reduce((C,m)=>{const T=Array.isArray(m.pagos)?m.pagos:[];return T.length===0?C+(parseFloat(m.total_compra)||0):C+T.filter(f=>String((f==null?void 0:f.tipo)??"01")==="01"||String((f==null?void 0:f.forma)||"").toLowerCase().includes("efectivo")).reduce((f,P)=>f+(parseFloat(P==null?void 0:P.monto)||0),0)},0)}catch(e){console.warn("Exception cargando compras de contado:",e)}try{const{data:e,error:l}=await N.from("prestamos").select("numero, monto_capital, created_at, clientes(nombre)").eq("tenant_id",E).ilike("desembolso","efectivo").gte("created_at",d).lte("created_at",p);l?console.warn("Error cargando préstamos en efectivo:",l.message):ra=e||[]}catch(e){console.warn("Exception cargando préstamos en efectivo:",e)}try{const{data:e,error:l}=await N.from("compromisos").select("id, nombre, monto, tipo, forma_pago, fecha_pago").eq("tenant_id",E).eq("activo",!1).gte("fecha_pago",d).lte("fecha_pago",p);if(l)console.warn("Error cargando compromisos pagados:",l.message);else{F=(e||[]).filter(m=>String(m.forma_pago||"Efectivo").toLowerCase().includes("efectivo"));const C=F.filter(m=>String(m.tipo||"").toLowerCase()==="nomina").map(m=>m.id);if(C.length>0){const{data:m}=await N.from("nominas").select("id, compromiso_id, nomina_detalle(neto, pagado_at, gasto_id, empleados(nombre))").eq("tenant_id",E).in("compromiso_id",C).neq("estado","anulada"),T=(m||[]).flatMap(S=>(S.nomina_detalle||[]).map(h=>h.gasto_id)).filter(Boolean),f=new Set;if(T.length>0){const{data:S}=await N.from("gastos_diarios").select("id, anulado").in("id",T);for(const h of S||[])h.anulado&&f.add(h.id)}const P={};for(const S of m||[])P[S.compromiso_id]=(S.nomina_detalle||[]).map(h=>{var M;return{nombre:((M=h.empleados)==null?void 0:M.nombre)||"Empleado",monto:Number(h.neto)||0,yaEnGastos:!!h.gasto_id&&!f.has(h.gasto_id),pagadoAt:h.pagado_at||null}}).filter(h=>h.monto>0).sort((h,M)=>M.monto-h.monto);F=F.map(S=>{const h=P[S.id]||null,M=(h||[]).filter(fa=>fa.yaEnGastos).reduce((fa,wt)=>fa+wt.monto,0);return{...S,empleados:h,cubierto:M,monto_efectivo:Math.max((parseFloat(S.monto)||0)-M,0)}})}}}catch(e){console.warn("Exception cargando compromisos pagados:",e)}const pa=i.filter(e=>{const l=String(e.forma_pago||"").toUpperCase();return l==="CONTADO"||l==="EFECTIVO"}),La=pa.reduce((e,l)=>e+(parseFloat(l.total)||0),0),Va=pa.filter(st).reduce((e,l)=>e+(parseFloat(l.total)||0),0),gt=e=>{const l=String(e.tipo_pago||"").toUpperCase();return!l||l.includes("EFECTIVO")},qa=pa.filter(e=>!gt(e)).reduce((e,l)=>e+(parseFloat(l.total)||0),0),ka=Math.max(0,La-Va-qa),vt=i.filter(e=>String(e.forma_pago||"").toUpperCase()==="CREDITO").reduce((e,l)=>e+(parseFloat(l.total)||0),0),ht=i.reduce((e,l)=>e+(parseFloat(l.total)||0),0),jt=i.reduce((e,l)=>e+(parseFloat(l.itbis)||0),0),yt=i.reduce((e,l)=>e+(parseFloat(l.descuento)||0),0),Ga=b.reduce((e,l)=>e+(parseFloat(l.total_devolucion)||0),0),xa=v.reduce((e,l)=>e+(parseFloat(l.monto_pagado)||0),0),za=v.filter(e=>String(e.origen||"").toLowerCase()==="movil").reduce((e,l)=>e+(parseFloat(l.monto_pagado)||0),0),Ct=Math.max(0,xa-za),Nt=e=>{const l=Array.isArray(e.formas_pago)?e.formas_pago:null;return!l||!l.length?parseFloat(e.monto_pagado)||0:l.reduce((C,m)=>C+(String(m.forma||"").toLowerCase().includes("efectivo")&&parseFloat(m.monto)||0),0)},ba=v.reduce((e,l)=>e+Nt(l),0),ut=Math.max(0,xa-ba),Ua=_.reduce((e,l)=>e+(parseFloat(l.monto)||0),0),Ha=R.reduce((e,l)=>e+(parseFloat(l.monto)||0),0),Ja=ca.reduce((e,l)=>e+(parseFloat(l.monto)||0),0),Ba=ra.reduce((e,l)=>e+(parseFloat(l.monto_capital)||0),0),Wa=e=>e.monto_efectivo!==void 0?parseFloat(e.monto_efectivo)||0:parseFloat(e.monto)||0;F=F.filter(e=>Wa(e)>0);const Ya=F.reduce((e,l)=>e+Wa(l),0),Za=c.reduce((e,l)=>{const C=(l.formas_pago||[]).filter(m=>m.forma==="Efectivo").reduce((m,T)=>m+(parseFloat(T.monto)||0),0);return e+C},0),Et=i.filter(e=>e.forma_pago==="CONTADO").reduce((e,l)=>e+(parseFloat(l.cambio)||0),0),_t=i.length,ma={totalVentas:ht,totalVentasContado:La,totalVentasContadoCaja:ka,totalVentasContadoMovil:Va,totalVentasContadoNoEfectivo:qa,totalVentasCredito:vt,totalItbis:jt,totalDescuento:yt,totalDevoluciones:Ga,totalRecibos:xa,totalRecibosMovil:za,totalRecibosCaja:Ct,totalRecibosEfectivo:ba,totalRecibosOtrasFormas:ut,totalGastosDiarios:Ua,gastosDiarios:_,totalPagosTerceros:Ha,pagosTerceros:R,totalPagosNomina:Ja,pagosNomina:ca,totalPrestamosEfectivo:Ba,prestamosEfectivo:ra,totalCompromisosEfectivo:Ya,compromisosEfectivo:F,totalPagosSuplidores:Za,cambioEntregado:Et,cantFacturas:_t,comprasContadoEfectivo:da,efectivoEnCaja:ka+ba-Ga-Za-Ua-Ha-Ja-Ba-Ya-da};return a||(bt(ma),Sa(!1)),ma},[w,$,E]);g.useEffect(()=>{I()},[I]),g.useEffect(()=>{const o=()=>{document.hidden||I()};return window.addEventListener("focus",o),document.addEventListener("visibilitychange",o),()=>{window.removeEventListener("focus",o),document.removeEventListener("visibilitychange",o)}},[I]);const Oa=(o,a)=>{if(o.tipo){Y(d=>({...d,[o.label]:a}));return}const r=parseInt(a,10);Y(d=>({...d,[o.label]:isNaN(r)?0:r}))};g.useEffect(()=>{N.rpc("get_tasa_dia").then(({data:o})=>{const a=Number(o)||0;a>0&&Y(r=>Number(r["Tasa del día"])>0?r:{...r,"Tasa del día":a})},()=>{})},[]);const O=g.useMemo(()=>Q.reduce((o,a)=>o+X(a,V),0),[V]),la=async()=>{var o;Ta(!0);try{const a=$==="ALL"?"Todos los Cajeros":((o=_a.find(b=>b.id===$))==null?void 0:o.nombre_completo)||"N/A",r={tenant_id:E,fecha:q(w),turno:H,cajero_id:$==="ALL"?u==null?void 0:u.id:$,cajero_nombre:a,total_ventas:(s==null?void 0:s.totalVentas)||0,total_ventas_contado:(s==null?void 0:s.totalVentasContado)||0,total_ventas_contado_caja:(s==null?void 0:s.totalVentasContadoCaja)||0,total_ventas_contado_movil:(s==null?void 0:s.totalVentasContadoMovil)||0,total_ventas_credito:(s==null?void 0:s.totalVentasCredito)||0,total_itbis:(s==null?void 0:s.totalItbis)||0,total_descuento:(s==null?void 0:s.totalDescuento)||0,total_devoluciones:(s==null?void 0:s.totalDevoluciones)||0,total_recibos:(s==null?void 0:s.totalRecibos)||0,total_gastos_diarios:(s==null?void 0:s.totalGastosDiarios)||0,cambio_entregado:(s==null?void 0:s.cambioEntregado)||0,efectivo_en_caja:(s==null?void 0:s.efectivoEnCaja)||0,total_desglose:O,diferencia:O-((s==null?void 0:s.efectivoEnCaja)||0),desglose:Object.fromEntries(Object.entries(V).map(([b,v])=>[b,Number(v)||0])),usuario_id:u==null?void 0:u.id,detalle:s||null},{data:d,error:p}=await N.from("cierres_caja").insert([r]).select("id").single();if(p)throw p;const i=(s==null?void 0:s.efectivoEnCaja)||0;if(W&&i>0&&(d!=null&&d.id)){const{error:b}=await N.rpc("registrar_movimiento_bancario",{p_cuenta_id:W,p_tipo:"ENTRADA",p_monto:i,p_concepto:`Cierre de caja — turno ${H} (${q(w)})`,p_referencia:null,p_origen_tipo:"cierre_caja",p_origen_id:d.id,p_fecha:q(w)});b&&x({variant:"destructive",title:"Cierre grabado, pero no se registró en la cuenta",description:b.message})}else i>0&&!W&&x({variant:"destructive",title:"El efectivo NO entró a ninguna cuenta",description:`Se cerró la caja con ${n(i)} pero no había cuenta seleccionada. Regístralo a mano en Cuentas Bancarias.`});sa&&Fa(r,s),x({title:"Cierre de Caja",description:`El cierre del turno ${H} ha sido registrado exitosamente.`}),Y(b=>({...Q.reduce((v,c)=>({...v,[c.label]:0}),{}),"Tasa del día":b["Tasa del día"]||0})),oa(!1),k||Ea(b=>Math.min(b+1,ta)),I()}catch(a){console.error("Error saving cierre:",a),x({variant:"destructive",title:"Error",description:a.message||"No se pudo registrar el cierre de caja."})}finally{Ta(!1)}},y=({label:o,value:a,bold:r,isCount:d,siempre:p})=>p||Number(a)>0?t.jsxs("div",{className:`flex justify-between items-center py-1 ${r?"border-t-2 border-morla-blue pt-2":""}`,children:[t.jsx("span",{className:`text-sm ${r?"font-bold text-morla-blue":"text-gray-600"}`,children:o}),t.jsx("span",{className:`font-mono text-sm ${r?"font-bold text-morla-blue text-base":"text-gray-800"}`,children:d?a:n(a)})]}):null,Ra=({label:o,value:a})=>t.jsxs("div",{className:"flex justify-between items-center py-1.5 mt-1 border-t-2 border-gray-800",children:[t.jsx("span",{className:"text-sm font-bold text-gray-800 uppercase tracking-wide",children:o}),t.jsx("span",{className:"font-mono text-sm font-bold text-gray-900",children:n(a)})]}),ia=o=>(Number(o==null?void 0:o.totalGastosDiarios)||0)+(Number(o==null?void 0:o.totalPagosNomina)||0)+(Number(o==null?void 0:o.totalPagosTerceros)||0)+(Number(o==null?void 0:o.totalPrestamosEfectivo)||0)+(Number(o==null?void 0:o.totalPagosSuplidores)||0)+(Number(o==null?void 0:o.totalCompromisosEfectivo)||0)+(Number(o==null?void 0:o.comprasContadoEfectivo)||0)+(Number(o==null?void 0:o.totalDevoluciones)||0),na=o=>(Number((o==null?void 0:o.totalVentasContadoCaja)??(o==null?void 0:o.totalVentasContado))||0)+(Number((o==null?void 0:o.totalRecibosEfectivo)??(o==null?void 0:o.totalRecibos))||0),mt=(o,a)=>{const r=ia(a),d=na(a),p=(i,b,v=!1,c=!1)=>c||Number(b)>0?`<tr${v?' class="bold"':""}><td>${i}</td><td class="num">${n(b)}</td></tr>`:"";return`
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
            <h1>${((j==null?void 0:j.nombre)||"MotoFlow").toUpperCase()}</h1>
            <div class="sub">CIERRE DE CAJA</div>
          </div>
          <div class="meta">
            <div><b>Fecha:</b> ${z(o.fecha)}</div>
            <div><b>Turno:</b> ${o.turno}</div>
            <div><b>Cajero:</b> ${o.cajero_nombre}</div>
            ${o._reimpresion?'<div style="color:#b45309;font-weight:bold">REIMPRESIÓN</div>':""}
          </div>
        </div>
        ${o._reimpresion?`<div style="margin-top:8px;padding:4px 8px;border:1px solid #b45309;color:#b45309;font-size:11px">
          Copia del cierre grabado el ${z(o.created_at||o.fecha)}. No es un cierre nuevo.
          ${o._reconstruido?"<br>Este cierre es anterior al guardado del detalle: el desglose se reconstruyó con los movimientos de esa fecha. Los totales de caja y el conteo de billetes son los que quedaron grabados.":""}
          ${o._descuadre?`<br><b>Ojo:</b> hoy esa fecha da ${n(o._descuadre)} de efectivo, distinto de los ${n(o.efectivo_en_caja)} que se grabaron. Manda lo grabado.`:""}
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
            <div class="linea-fuerte"><span>TOTAL INGRESO EN CAJA</span><span>${n(d)}</span></div>

            ${((a==null?void 0:a.gastosDiarios)||[]).length?`
            <div class="sec">Desglose de Gastos</div>
            <table><tbody>
              ${a.gastosDiarios.map(i=>`<tr><td>${i.tipo_gasto||"GASTO"}${i.descripcion?` — ${i.descripcion}`:""}</td><td class="num">${n(i.monto)}</td></tr>`).join("")}
              <tr class="bold"><td>Total Gastos</td><td class="num">${n(a==null?void 0:a.totalGastosDiarios)}</td></tr>
            </tbody></table>`:""}

            ${((a==null?void 0:a.pagosNomina)||[]).length?`
            <div class="sec">Nómina pagada hoy (efectivo)</div>
            <table><tbody>
              ${a.pagosNomina.map(i=>`<tr><td>${i.descripcion||"NÓMINA"}</td><td class="num">${n(i.monto)}</td></tr>`).join("")}
              <tr class="bold"><td>Total Nómina</td><td class="num">${n(a==null?void 0:a.totalPagosNomina)}</td></tr>
            </tbody></table>`:""}

            ${((a==null?void 0:a.pagosTerceros)||[]).length?`
            <div class="sec">Pagos a terceros (no son gastos de la empresa)</div>
            <table><tbody>
              ${a.pagosTerceros.map(i=>`<tr><td>${i.concepto_tercero||"TERCERO"}${i.descripcion?` — ${i.descripcion}`:""}</td><td class="num">${n(i.monto)}</td></tr>`).join("")}
              <tr class="bold"><td>Total entregado a terceros</td><td class="num">${n(a==null?void 0:a.totalPagosTerceros)}</td></tr>
            </tbody></table>`:""}

            ${((a==null?void 0:a.prestamosEfectivo)||[]).length?`
            <div class="sec">Préstamos (Efectivo)</div>
            <table><tbody>
              ${a.prestamosEfectivo.map(i=>{var b;return`<tr><td>${((b=i.clientes)==null?void 0:b.nombre)||"PRÉSTAMO"}${i.numero?` — ${i.numero}`:""}</td><td class="num">${n(i.monto_capital)}</td></tr>`}).join("")}
              <tr class="bold"><td>Total Préstamos</td><td class="num">${n(a==null?void 0:a.totalPrestamosEfectivo)}</td></tr>
            </tbody></table>`:""}

            ${((a==null?void 0:a.compromisosEfectivo)||[]).length?`
            <div class="sec">Compromisos (Efectivo)</div>
            <table><tbody>
              ${a.compromisosEfectivo.map(i=>`
                <tr><td>${i.nombre||"COMPROMISO"}${i.tipo?` — ${i.tipo}`:""}</td><td class="num">${n(i.monto_efectivo!==void 0?i.monto_efectivo:i.monto)}</td></tr>
                ${(i.empleados||[]).map(b=>`<tr><td style="padding-left:14px;color:#555">· ${b.nombre}${b.yaEnGastos?` <i>(ya salió ${b.pagadoAt?z(b.pagadoAt):"antes"}, en Gastos)</i>`:""}</td><td class="num" style="color:#555">${n(b.monto)}</td></tr>`).join("")}
              `).join("")}
              <tr class="bold"><td>Total Compromisos</td><td class="num">${n(a==null?void 0:a.totalCompromisosEfectivo)}</td></tr>
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

            <div class="linea-fuerte"><span>GASTO TOTAL</span><span>${n(r)}</span></div>

            <!-- El cierre termina en un solo recuadro: lo que entró, lo que
                 salió y lo que debe haber en la gaveta. La resta a la vista,
                 en vez de un número suelto arriba que hay que ir a comprobar. -->
            <div class="cuadre-final">
              <div class="linea total"><span>EFECTIVO EN CAJA</span><span>${n(a==null?void 0:a.efectivoEnCaja)}</span></div>
            </div>
          </div>

          <div class="col">
            <div class="sec">Desglose del Dinero en Caja</div>
            <table>
              <thead><tr><th>Denominación</th><th class="num">Cant.</th><th class="num">Valor</th></tr></thead>
              <tbody>
                ${Na.filter(i=>Number(o.desglose[i.label]||0)>0&&(i.tipo!=="tasa"||Number(o.desglose.Dólares||0)>0)).map(i=>{const b=o.desglose[i.label]||0,v=X(i,o.desglose);return`<tr><td>${i.label}</td><td class="num">${b}</td><td class="num">${i.tipo==="tasa"?"":n(v)}</td></tr>`}).join("")}
                <tr class="grande"><td colspan="2">Total Desglose</td><td class="num">${n(o.total_desglose)}</td></tr>
                <tr class="grande"><td colspan="2">Diferencia${o.diferencia<0?" (FALTANTE)":o.diferencia>0?" (SOBRANTE)":""}</td><td class="num">${n(o.diferencia)}</td></tr>
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
    `},Fa=(o,a)=>{const r=(Aa||(j==null?void 0:j.formato_cierre_caja)||"pos_80mm")==="carta",d=ia(a),p=na(a),i=(c,_,R={})=>R.siempre||Number(_)>0?`<div class="row${R.total?" total-row":""}"><span>${c}:</span><span${R.bold?' class="bold"':""}>${n(_)}</span></div>`:"",b=r?mt(o,a):`
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
          <h1 class="bold">${((j==null?void 0:j.nombre)||"MotoFlow").toUpperCase()}</h1>
          <p style="margin: 2px 0; font-size: 13px;">CIERRE DE CAJA</p>
          ${o._reimpresion?'<p class="bold" style="margin:2px 0;font-size:12px;">** REIMPRESION **</p>':""}
        </div>
        <div class="separator"></div>
        <div class="row"><span>Fecha:</span><span>${z(o.fecha)}</span></div>
        <div class="row"><span>Turno:</span><span>${o.turno}</span></div>
        <div class="row"><span>Cajero:</span><span>${o.cajero_nombre}</span></div>
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
        <div class="row total-row"><span>TOTAL INGRESO EN CAJA:</span><span>${n(p)}</span></div>
        ${((a==null?void 0:a.gastosDiarios)||[]).length?`
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">DESGLOSE DE GASTOS</div>
        ${a.gastosDiarios.map(c=>`
          <div class="row">
            <span style="max-width: 70%;">${c.tipo_gasto||"GASTO"}${c.descripcion?` — ${c.descripcion}`:""}</span>
            <span>${n(c.monto)}</span>
          </div>`).join("")}
        <div class="row" style="border-top: 1px solid #000; padding-top: 2px; margin-top: 2px;">
          <span>Total Gastos:</span><span>${n(a==null?void 0:a.totalGastosDiarios)}</span>
        </div>`:""}
        ${((a==null?void 0:a.pagosNomina)||[]).length?`
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">NOMINA PAGADA HOY</div>
        ${a.pagosNomina.map(c=>`
          <div class="row">
            <span style="max-width: 70%;">${c.descripcion||"NOMINA"}</span>
            <span>${n(c.monto)}</span>
          </div>`).join("")}
        <div class="row" style="border-top: 1px solid #000; padding-top: 2px; margin-top: 2px;">
          <span>Total Nomina:</span><span>${n(a==null?void 0:a.totalPagosNomina)}</span>
        </div>`:""}
        ${((a==null?void 0:a.pagosTerceros)||[]).length?`
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">PAGOS A TERCEROS</div>
        ${a.pagosTerceros.map(c=>`
          <div class="row">
            <span style="max-width: 70%;">${c.concepto_tercero||"TERCERO"}${c.descripcion?` — ${c.descripcion}`:""}</span>
            <span>${n(c.monto)}</span>
          </div>`).join("")}
        <div class="row" style="border-top: 1px solid #000; padding-top: 2px; margin-top: 2px;">
          <span>Total a terceros:</span><span>${n(a==null?void 0:a.totalPagosTerceros)}</span>
        </div>`:""}
        ${((a==null?void 0:a.prestamosEfectivo)||[]).length?`
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">PRÉSTAMOS (EFECTIVO)</div>
        ${a.prestamosEfectivo.map(c=>{var _;return`
          <div class="row">
            <span style="max-width: 70%;">${((_=c.clientes)==null?void 0:_.nombre)||c.numero||"PRÉSTAMO"}</span>
            <span>${n(c.monto_capital)}</span>
          </div>`}).join("")}
        <div class="row" style="border-top: 1px solid #000; padding-top: 2px; margin-top: 2px;">
          <span>Total Préstamos:</span><span>${n(a==null?void 0:a.totalPrestamosEfectivo)}</span>
        </div>`:""}
        ${((a==null?void 0:a.compromisosEfectivo)||[]).length?`
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">COMPROMISOS (EFECTIVO)</div>
        ${a.compromisosEfectivo.map(c=>`
          <div class="row">
            <span style="max-width: 70%;">${c.nombre||"COMPROMISO"}</span>
            <span>${n(c.monto_efectivo!==void 0?c.monto_efectivo:c.monto)}</span>
          </div>
          ${(c.empleados||[]).map(_=>`
          <div class="row">
            <span style="max-width: 70%; padding-left: 8px;">· ${_.nombre}${_.yaEnGastos?" (en Gastos)":""}</span>
            <span>${n(_.monto)}</span>
          </div>`).join("")}`).join("")}
        <div class="row" style="border-top: 1px solid #000; padding-top: 2px; margin-top: 2px;">
          <span>Total Compromisos:</span><span>${n(a==null?void 0:a.totalCompromisosEfectivo)}</span>
        </div>`:""}
        ${Number(a==null?void 0:a.totalDevoluciones)>0||Number(a==null?void 0:a.totalPagosSuplidores)>0||Number(a==null?void 0:a.comprasContadoEfectivo)>0?`
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">OTRAS SALIDAS</div>
        ${i("Devoluciones",a==null?void 0:a.totalDevoluciones)}
        ${i("Pagos Suplidores",a==null?void 0:a.totalPagosSuplidores)}
        ${i("Compras de contado",a==null?void 0:a.comprasContadoEfectivo)}`:""}
        <div class="separator"></div>
        <div class="row total-row"><span>GASTO TOTAL:</span><span>${n(d)}</span></div>
        <div class="row total-row"><span>EFECTIVO EN CAJA:</span><span>${n(a==null?void 0:a.efectivoEnCaja)}</span></div>
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">DESGLOSE DINERO EN CAJA</div>
        <div class="row" style="font-size: 12px; border-bottom: 1px solid #000; margin-bottom: 2px;">
          <span style="flex: 1;">DENOM.</span>
          <span class="text-right" style="width: 42px;">CANT.</span>
          <span class="text-right" style="width: 84px;">VALOR</span>
        </div>
        ${Na.filter(c=>Number(o.desglose[c.label]||0)>0&&(c.tipo!=="tasa"||Number(o.desglose.Dólares||0)>0)).map(c=>{const _=o.desglose[c.label]||0,R=X(c,o.desglose);return`<div class="row">
            <span style="flex: 1;">${c.label}</span>
            <span class="text-right" style="width: 42px;">${_}</span>
            <span class="text-right" style="width: 84px;">${c.tipo==="tasa"?"":n(R)}</span>
          </div>`}).join("")}
        <div class="row total-row"><span>Total Desglose:</span><span>${n(o.total_desglose)}</span></div>
        <div class="row" style="margin-top: 6px; font-weight: 900; font-size: 16px;">
          <span>Diferencia${o.diferencia<0?" (FALTANTE)":o.diferencia>0?" (SOBRANTE)":""}:</span>
          <span>${n(o.diferencia)}</span>
        </div>
        <div class="separator"></div>
        <p class="text-center" style="margin-top: 10px; font-size: 13px;">*** FIN DEL CIERRE ***</p>
      </body>
      </html>
    `,v=document.createElement("iframe");v.style.cssText="position:fixed;right:0;bottom:0;width:0;height:0;border:0;",document.body.appendChild(v),v.contentWindow.document.open(),v.contentWindow.document.write(b),v.contentWindow.document.close(),setTimeout(()=>{document.body.contains(v)&&document.body.removeChild(v)},3e3)},Pa=g.useCallback(async()=>{if(!E)return;const{data:o,error:a}=await N.from("cierres_caja").select("*").eq("tenant_id",E).order("created_at",{ascending:!1}).limit(60);a||ct(o||[])},[E]);g.useEffect(()=>{B&&Pa()},[B,Pa]);const[Ia,Ma]=g.useState(null),ft=async o=>{Ma(o.id);try{const a=!o.detalle,r=o.detalle||await I(o.fecha);if(!r)throw new Error("No se pudo armar el desglose de esa fecha.");const d=Math.abs((Number(r.efectivoEnCaja)||0)-(Number(o.efectivo_en_caja)||0)),p=a?{...r,efectivoEnCaja:o.efectivo_en_caja}:r;Fa({...o,_reimpresion:!0,_reconstruido:a,_descuadre:a&&d>.01?r.efectivoEnCaja:null},p)}catch(a){x({variant:"destructive",title:"No se pudo reimprimir",description:a.message})}finally{Ma(null)}};return g.useEffect(()=>{const o=a=>{ua==="cierre-caja"&&(a.key==="Escape"&&a.defaultPrevented||(a.key==="F8"&&J&&(a.preventDefault(),la()),a.key==="Escape"&&(a.preventDefault(),J?oa(!1):aa("cierre-caja"))))};return window.addEventListener("keydown",o),()=>window.removeEventListener("keydown",o)},[J,la,aa,ua]),t.jsxs(t.Fragment,{children:[t.jsx(At,{children:t.jsx("title",{children:"Cierre de Caja — MotoFlow"})}),t.jsx(Ot.div,{initial:{opacity:0,y:20},animate:{opacity:1,y:0},className:"p-1 md:p-4 bg-gray-100 min-h-full flex flex-col",children:t.jsxs("div",{className:"bg-white p-4 rounded-lg shadow-md flex-grow flex flex-col",children:[t.jsxs("div",{className:"bg-morla-blue text-white py-1.5 rounded-t-lg mb-3 relative",children:[t.jsx("h1",{className:"text-white font-black tracking-[0.25em] italic uppercase text-base drop-shadow-sm text-center",children:"CIERRE DE CAJA"}),t.jsx("button",{type:"button",onClick:()=>I(),disabled:ea,title:"Actualizar los montos del día",className:"absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-white/20 disabled:opacity-50",children:t.jsx(Rt,{className:`w-4 h-4 ${ea?"animate-spin":""}`})})]}),w&&q(w)!==q(Ka())&&t.jsxs("div",{className:"mb-3 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900",children:[t.jsxs("b",{children:["Estás cerrando una fecha pasada: ",Qa(w,"dd/MM/yyyy"),"."]})," ","Las cifras son las de ese día. Si ya vendiste hoy, el efectivo de la gaveta incluye lo de hoy y no va a cuadrar con el conteo."]}),t.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-4 gap-x-4 gap-y-2 px-3 py-2 border rounded-lg mb-3",children:[t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(Z,{className:"font-bold text-xs shrink-0",children:"Fecha"}),t.jsxs(kt,{children:[t.jsx(Gt,{asChild:!0,children:t.jsxs(G,{variant:"outline",className:Ft("flex-1 min-w-0 h-8 justify-start text-left font-normal text-sm px-2",!w&&"text-muted-foreground"),children:[t.jsx(Pt,{className:"mr-1.5 h-3.5 w-3.5 shrink-0"}),w?Qa(w,"dd/MM/yyyy"):t.jsx("span",{children:"Seleccione"})]})}),t.jsx(zt,{className:"w-auto p-0",children:t.jsx(Ut,{mode:"single",selected:w,onSelect:lt,initialFocus:!0})})]})]}),!k&&t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(Z,{className:"font-bold text-xs shrink-0",children:"Turno"}),t.jsx(ga,{type:"number",min:"1",max:ta,value:H,onChange:o=>Ea(parseInt(o.target.value,10)||1),onFocus:o=>o.target.select(),className:"flex-1 min-w-0 h-8 text-center font-bold px-2"})]}),t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(Z,{className:"font-bold text-xs shrink-0",children:"Caja"}),t.jsxs(va,{value:"caja1",disabled:!0,children:[t.jsx(ha,{className:"flex-1 min-w-0 h-8 text-sm px-2",children:t.jsx(ja,{})}),t.jsx(ya,{children:t.jsx(K,{value:"caja1",children:"Caja No. 1"})})]})]}),t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(Z,{className:"font-bold text-xs shrink-0",children:"Cajero"}),t.jsxs(va,{value:$,onValueChange:wa,children:[t.jsx(ha,{className:"flex-1 min-w-0 h-8 text-sm px-2",children:t.jsx(ja,{placeholder:"Seleccione cajero"})}),t.jsxs(ya,{children:[t.jsx(K,{value:"ALL",className:"font-bold text-morla-blue",children:"📊 Todos los Cajeros (Consolidado)"}),_a.map(o=>t.jsx(K,{value:o.id,children:o.nombre_completo||o.email},o.id))]})]})]})]}),ea?t.jsx("div",{className:"flex-grow flex items-center justify-center",children:t.jsx(Ca,{className:"h-8 w-8 animate-spin text-morla-blue"})}):s?t.jsxs("div",{className:"grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4",children:[t.jsxs("div",{className:"border rounded-lg p-4 bg-gradient-to-br from-slate-50 to-blue-50",children:[t.jsx("h2",{className:"font-bold text-sm uppercase text-gray-500 tracking-wider mb-3",children:$==="ALL"?"Resumen Total del Día":"Resumen del Turno"}),t.jsxs("div",{className:"space-y-2",children:[t.jsx(y,{label:"Cantidad de Facturas",value:s.cantFacturas,isCount:!0,siempre:!0}),t.jsx(y,{label:"Ventas Contado Caja",value:s.totalVentasContadoCaja}),t.jsx(y,{label:"Cuenta Contado Móvil",value:s.totalVentasContadoMovil}),t.jsx(y,{label:"Ventas por Transferencia/Tarjeta",value:s.totalVentasContadoNoEfectivo}),t.jsx(y,{label:"Ventas Crédito",value:s.totalVentasCredito}),t.jsx(y,{label:"Total Ventas",value:s.totalVentas,bold:!0}),Number(s.totalRecibosMovil)>0&&t.jsxs(t.Fragment,{children:[t.jsx(y,{label:"Recibos de Ingreso Caja",value:s.totalRecibosCaja}),t.jsx(y,{label:"Recibos de Ingreso Móvil",value:s.totalRecibosMovil})]}),t.jsx(y,{label:"Recibos de Ingreso (total)",value:s.totalRecibos}),Number(s.totalRecibosOtrasFormas)>0&&t.jsxs(t.Fragment,{children:[t.jsx(y,{label:"· Recibos en Efectivo",value:s.totalRecibosEfectivo}),t.jsx(y,{label:"· Recibos Transf/Cheque/Tarjeta",value:s.totalRecibosOtrasFormas})]}),t.jsx(Ra,{label:"Total ingreso en caja",value:na(s)}),t.jsx(y,{label:"Gastos Diarios",value:s.totalGastosDiarios}),t.jsx(y,{label:"Nómina (Efectivo)",value:s.totalPagosNomina}),(s.pagosNomina||[]).length>0&&t.jsx("div",{className:"mt-1 mb-1 ml-3 pl-3 border-l-2 border-gray-200",children:s.pagosNomina.map(o=>t.jsxs("div",{className:"flex justify-between items-center py-0.5",children:[t.jsx("span",{className:"text-xs text-gray-500 truncate pr-2",title:o.descripcion,children:String(o.descripcion||"Nómina").split("—").pop().trim()}),t.jsx("span",{className:"font-mono text-xs text-gray-600 shrink-0",children:n(o.monto)})]},o.id||o.descripcion))}),t.jsx(y,{label:"Pagos a terceros (GPS, seguro...)",value:s.totalPagosTerceros}),t.jsx(y,{label:"Préstamos (Efectivo)",value:s.totalPrestamosEfectivo}),t.jsx(y,{label:"Compromisos (Efectivo)",value:s.totalCompromisosEfectivo}),(s.compromisosEfectivo||[]).filter(o=>(o.empleados||[]).length>0).map(o=>t.jsxs("div",{className:"mt-1 mb-1 ml-3 pl-3 border-l-2 border-gray-200",children:[t.jsx("p",{className:"text-[11px] font-semibold text-gray-400 uppercase tracking-wide",children:o.nombre}),o.empleados.map((a,r)=>t.jsxs("div",{className:"flex justify-between items-center py-0.5",children:[t.jsx("span",{className:`text-xs truncate pr-2 ${a.yaEnGastos?"text-gray-400 line-through":"text-gray-500"}`,children:a.nombre}),t.jsx("span",{className:`font-mono text-xs shrink-0 ${a.yaEnGastos?"text-gray-400 line-through":"text-gray-600"}`,children:n(a.monto)})]},`${o.id}-${r}`)),Number(o.cubierto)>0&&t.jsxs("p",{className:"text-[10px] text-amber-700 leading-snug mt-0.5",children:[n(o.cubierto)," ya salió como gasto el día de cada pago; aquí solo entra"," ",n(o.monto_efectivo),"."]})]},o.id)),t.jsx(y,{label:"Devoluciones",value:s.totalDevoluciones}),t.jsx(y,{label:"Pagos a Suplidores (Efectivo)",value:s.totalPagosSuplidores}),t.jsx(y,{label:"Compras de contado (Efectivo)",value:s.comprasContadoEfectivo}),t.jsx(Ra,{label:"Gasto total",value:ia(s)}),t.jsxs("div",{className:"flex justify-between items-center py-2 mt-2 bg-morla-blue/10 rounded px-3 border border-morla-blue/30",children:[t.jsx("span",{className:"font-bold text-morla-blue",children:"Efectivo en Caja"}),t.jsx("span",{className:"font-bold text-morla-blue text-lg font-mono",children:n(s.efectivoEnCaja)})]})]})]}),t.jsx("div",{className:"border rounded-lg p-4 flex flex-col",children:J?t.jsxs("div",{className:"flex flex-col h-full",children:[t.jsxs("div",{className:"flex items-center justify-between gap-3 mb-2",children:[t.jsx("h3",{className:"font-bold text-sm uppercase tracking-widest text-gray-600",children:"DESGLOSE DE MONEDAS"}),t.jsxs(va,{value:"DOP",disabled:!0,children:[t.jsx(ha,{className:"w-32 h-7 text-xs",children:t.jsx(ja,{})}),t.jsx(ya,{children:t.jsx(K,{value:"DOP",children:"DOP - PESO"})})]})]}),t.jsx(It,{className:"flex-grow border rounded-lg max-h-[380px]",children:t.jsxs(Xa,{children:[t.jsx(at,{className:"bg-gray-200 sticky top-0 z-10",children:t.jsxs(U,{className:"h-8",children:[t.jsx(A,{className:"w-20 h-8 py-1 font-bold text-xs",children:"MONEDA"}),t.jsx(A,{className:"w-24 h-8 py-1 font-bold text-center text-xs",children:"CANTIDAD"}),t.jsx(A,{className:"h-8 py-1 text-right font-bold text-xs",children:"VALOR"})]})}),t.jsx(tt,{children:Q.filter(o=>o.tipo!=="tasa").map(o=>{const a=V[o.label]??0,r=X(o,V);return t.jsxs(U,{className:"hover:bg-yellow-50/50",children:[t.jsx(D,{className:"py-0.5 font-semibold text-right pr-4 text-sm whitespace-nowrap",children:o.label}),t.jsx(D,{className:"py-0.5 text-center",children:t.jsx(ga,{type:"number",min:"0",step:o.tipo?"0.01":"1",value:a,onChange:d=>Oa(o,d.target.value),onFocus:d=>d.target.select(),onClick:d=>d.target.select(),className:"w-20 mx-auto text-center h-6 text-sm px-1"})}),t.jsx(D,{className:"py-0.5 text-right font-mono text-sm",children:o.tipo==="dolar"?t.jsxs("div",{className:"flex items-center justify-end gap-2",children:[t.jsx("span",{className:"text-xs text-gray-600 font-sans font-semibold whitespace-nowrap",children:"Tasa del día"}),t.jsx(ga,{type:"number",min:"0",step:"0.01",value:V["Tasa del día"]??"",onChange:d=>Oa({label:"Tasa del día",tipo:"tasa"},d.target.value),onFocus:d=>d.target.select(),onClick:d=>d.target.select(),className:"w-20 text-center h-6 text-sm px-1"}),t.jsx("span",{className:"min-w-[90px]",children:n(r)})]}):n(r)})]},o.label)})}),t.jsx(Ht,{className:"sticky bottom-0 bg-yellow-100 z-10",children:t.jsxs(U,{className:"font-bold",children:[t.jsx(D,{colSpan:2,className:"py-1 text-right text-red-600 uppercase text-sm",children:"TOTAL ==>"}),t.jsx(D,{className:"py-1 text-right text-red-600 font-mono text-base",children:n(O)})]})})]})}),t.jsx("div",{className:"mt-2 px-2.5 py-2 bg-blue-50 border border-blue-200 rounded-lg",children:t.jsx(Mt,{value:W,onChange:dt,moneda:"DOP",contexto:"cierre_caja",label:"Depositar en",inline:!0})}),t.jsxs("div",{className:"mt-3 flex items-center justify-between",children:[t.jsxs("label",{className:"flex items-center gap-2 text-sm cursor-pointer",children:[t.jsx("input",{type:"checkbox",checked:sa,onChange:o=>nt(o.target.checked),className:"rounded"}),t.jsx(ot,{className:"h-4 w-4"}),"Imprimir ?"]}),sa&&t.jsxs("select",{value:Aa||(j==null?void 0:j.formato_cierre_caja)||"pos_80mm",onChange:o=>xt(o.target.value),className:"h-9 border border-slate-300 rounded px-2 text-xs font-bold bg-white",title:"Papel del impreso — se recuerda en esta PC",children:[t.jsx("option",{value:"pos_80mm",children:"📑 Ticket 80mm"}),t.jsx("option",{value:"carta",children:"📄 Carta (8.5 x 11)"})]}),t.jsxs(G,{onClick:la,disabled:$a,className:"bg-morla-blue hover:bg-morla-blue/90 text-white gap-2",children:[$a?t.jsx(Ca,{className:"h-4 w-4 animate-spin"}):t.jsx(Lt,{className:"h-4 w-4"}),"F8 - Grabar y Cerrar ",k?"Caja":"Turno"]})]}),s&&t.jsxs("div",{className:`mt-3 p-3 rounded-lg text-center font-bold text-sm ${O-s.efectivoEnCaja===0?"bg-green-100 text-green-700":O-s.efectivoEnCaja<0?"bg-red-100 text-red-700":"bg-yellow-100 text-yellow-700"}`,children:["Diferencia: ",n(O-s.efectivoEnCaja),O-s.efectivoEnCaja===0&&" ✓ Cuadra",O-s.efectivoEnCaja<0&&" (Faltante)",O-s.efectivoEnCaja>0&&" (Sobrante)"]})]}):t.jsxs("div",{className:"flex-grow flex flex-col items-center justify-center gap-4",children:[t.jsxs(G,{onClick:()=>oa(!0),size:"lg",className:"bg-morla-blue hover:bg-morla-blue/90 text-white px-8 py-6 text-base gap-3 shadow-lg",children:[t.jsx(Jt,{className:"h-5 w-5"}),"Contar Efectivo y Cerrar ",k?"Caja":"Turno"]}),t.jsxs("p",{className:"text-xs text-gray-400 text-center max-w-[260px]",children:["Se cuentan los billetes y al grabar el desglose ",k?"la caja queda cerrada":"el turno queda cerrado","."]})]})})]}):null,t.jsxs("div",{className:"mt-4 border rounded-lg",children:[t.jsxs("button",{type:"button",onClick:()=>rt(o=>!o),className:"w-full flex items-center justify-between px-4 py-2 text-left hover:bg-gray-50 transition-colors",children:[t.jsx("span",{className:"text-sm font-semibold text-gray-700",children:"Cierres anteriores"}),t.jsx(Vt,{className:`h-4 w-4 text-gray-400 transition-transform ${B?"rotate-180":""}`})]}),B&&t.jsxs("div",{className:"border-t max-h-72 overflow-y-auto",children:[Da.length===0?t.jsx("p",{className:"px-4 py-3 text-sm text-gray-400 italic",children:"No hay cierres grabados."}):t.jsxs(Xa,{children:[t.jsx(at,{children:t.jsxs(U,{children:[t.jsx(A,{className:"text-xs",children:"Fecha"}),t.jsx(A,{className:"text-xs",children:"Turno"}),t.jsx(A,{className:"text-xs",children:"Cajero"}),t.jsx(A,{className:"text-xs text-right",children:"Efectivo"}),t.jsx(A,{className:"text-xs text-right",children:"Contado"}),t.jsx(A,{className:"text-xs text-right",children:"Diferencia"}),t.jsx(A,{className:"text-xs text-right",children:" "})]})}),t.jsx(tt,{children:Da.map(o=>{const a=Number(o.diferencia)||0;return t.jsxs(U,{children:[t.jsx(D,{className:"text-sm py-1.5",children:z(o.fecha)}),t.jsx(D,{className:"text-sm py-1.5",children:o.turno}),t.jsx(D,{className:"text-sm py-1.5 max-w-[160px] truncate",title:o.cajero_nombre,children:o.cajero_nombre}),t.jsx(D,{className:"text-sm py-1.5 text-right font-mono",children:n(o.efectivo_en_caja)}),t.jsx(D,{className:"text-sm py-1.5 text-right font-mono",children:n(o.total_desglose)}),t.jsx(D,{className:`text-sm py-1.5 text-right font-mono ${Math.abs(a)<.005?"text-green-600":a<0?"text-red-600":"text-amber-600"}`,children:n(a)}),t.jsx(D,{className:"text-right py-1.5",children:t.jsxs(G,{size:"sm",variant:"outline",className:"h-7 gap-1.5 text-xs",disabled:Ia===o.id,onClick:()=>ft(o),children:[Ia===o.id?t.jsx(Ca,{className:"h-3.5 w-3.5 animate-spin"}):t.jsx(ot,{className:"h-3.5 w-3.5"})," Reimprimir"]})})]},o.id)})})]}),t.jsx("p",{className:"px-4 py-2 text-[11px] text-gray-400 italic border-t",children:"Sale marcado como reimpresión. Los cierres grabados desde hoy salen idénticos al original; los anteriores reconstruyen el desglose con los movimientos de esa fecha, y el efectivo y el conteo de billetes son siempre los que quedaron grabados."})]})]}),t.jsx("div",{className:"mt-auto pt-4 flex justify-end items-center space-x-4 border-t",children:t.jsxs(G,{variant:"outline",onClick:()=>aa("cierre-caja"),className:"gap-2",children:[t.jsx(qt,{className:"h-4 w-4"})," ESC - Salir"]})})]})})]})};export{eo as default};
