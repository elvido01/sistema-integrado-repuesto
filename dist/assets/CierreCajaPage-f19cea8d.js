import{u as Mt,l as Pt,a9 as Ft,r as h,at as et,au as q,bq as It,s as N,j as o,H as Lt,m as Vt,aA as qt,aM as st,L as Q,d as G,a_ as kt,y as Gt,I as ya,G as Ca,J as ua,K as Na,N as Ea,O as Z,D as _a,b2 as zt,W as Ut,e as Ht,ay as Jt,a$ as z,X as Bt}from"./index-2d0dab7d.js";import{P as Wt,a as Yt,b as Kt}from"./popover-e76b6dbe.js";import{C as Qt}from"./calendar-8c3c0b3e.js";import{T as it,a as lt,b as U,c as O,d as nt,e as D,f as Zt}from"./table-b884be2c.js";import{C as Xt}from"./coins-9d22eaff.js";import{P as ct}from"./printer-4a40bd07.js";import"./index-a99dcbc9.js";import"./index-5a5aa1c9.js";import"./chevron-left-4790c3dd.js";const wa=[{label:"2,000",value:2e3},{label:"1,000",value:1e3},{label:"500",value:500},{label:"200",value:200},{label:"100",value:100},{label:"50",value:50},{label:"25",value:25},{label:"20",value:20},{label:"10",value:10},{label:"5",value:5},{label:"1",value:1},{label:"Cent.",value:0},{label:"Tarjetas",value:0,tipo:"tarjeta"},{label:"Cheques",value:0,tipo:"cheque"},{label:"Tarjetas/Cheques",value:0,tipo:"tarjeta"},{label:"Dólares",value:0,tipo:"dolar"},{label:"Tasa del día",value:0,tipo:"tasa"},{label:"Otros",value:0,tipo:"otro"}],ao=new Set(["20","Cent.","Otros","Tarjetas","Cheques"]),X=wa.filter(b=>!ao.has(b.label)),aa=(b,u)=>{const L=Number(u==null?void 0:u[b.label])||0;return b.tipo==="tasa"?0:b.tipo==="dolar"?L*(Number(u==null?void 0:u["Tasa del día"])||0):b.tipo?L:L*b.value},n=b=>new Intl.NumberFormat("es-DO",{style:"decimal",minimumFractionDigits:2,maximumFractionDigits:2}).format(b||0),rt=b=>String(b??"").replace(/[&<>"']/g,u=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[u]),dt=b=>String((b==null?void 0:b.estado)||"").toUpperCase()!=="ANULADA",pt=b=>{const u=String((b==null?void 0:b.forma_pago)||"").toUpperCase(),L=String((b==null?void 0:b.tipo_pago)||"").toUpperCase(),y=String((b==null?void 0:b.notas)||"").toUpperCase();return u==="EFECTIVO"||y.includes("POS_MOVIL")||y.includes("POS MOVIL")||y.includes("MOVIL")||y.includes("MÓVIL")||L.includes("MOVIL")},po=()=>{const{toast:b}=Mt(),{user:u,profile:L,empresa:y,tenantId:E}=Pt(),{closePanel:ta,activePanel:$a}=Ft(),[$,bt]=h.useState(et()),[H,Ta]=h.useState(1),oa=Math.max(1,parseInt(y==null?void 0:y.turnos_caja_dia,10)||1),k=oa<=1,[Sa,xt]=h.useState([]),[T,Da]=h.useState("ALL"),[J,ea]=h.useState(!1),[Oa,Aa]=h.useState(!1),[sa,Ra]=h.useState(!1),[ia,mt]=h.useState(!0),[Ma,ft]=h.useState([]),[B,gt]=h.useState(!1),[W,vt]=h.useState(null),[Pa,ht]=h.useState(()=>localStorage.getItem("cierre_caja_paper")||""),jt=t=>{ht(t),localStorage.setItem("cierre_caja_paper",t)},[i,yt]=h.useState(null),[V,Y]=h.useState(X.reduce((t,a)=>({...t,[a.label]:0}),{}));h.useEffect(()=>{(async()=>{const{data:a,error:r}=await N.from("perfiles").select("id, nombre_completo, email").order("nombre_completo");!r&&a&&(xt(a),Da("ALL"))})()},[u]);const F=h.useCallback(async t=>{const a=!!t;if(!$&&!a)return;a||Ra(!0);const r=t||q($),{desde:d,hasta:x}=It(r);let l=[],m=[],v=[],c=[],_=[],R=[],da=[],pa=[],M=[];try{let e=N.from("facturas").select("id, total, itbis, subtotal, descuento, forma_pago, tipo_pago, monto_recibido, cambio, fecha, created_at, notas, estado").eq("tenant_id",E).gte("fecha",d).lte("fecha",x);T&&T!=="ALL"&&(e=e.eq("usuario_id",T));const{data:s,error:f}=await e;f?console.warn("Error cargando ventas:",f.message):l=(s||[]).filter(dt);let p=N.from("facturas").select("id, total, itbis, subtotal, descuento, forma_pago, tipo_pago, monto_recibido, cambio, fecha, created_at, notas, estado").eq("tenant_id",E).gte("created_at",d).lte("created_at",x);T&&T!=="ALL"&&(p=p.eq("usuario_id",T));const{data:w,error:g}=await p;if(g)console.warn("Error cargando ventas moviles:",g.message);else{const P=new Set(l.map(j=>j.id)),S=(w||[]).filter(dt).filter(j=>pt(j)&&!P.has(j.id));l=[...l,...S]}}catch(e){console.warn("Exception cargando ventas:",e)}try{const{data:e,error:s}=await N.from("devoluciones").select("total_devolucion, facturas!inner(forma_pago)").eq("tenant_id",E).ilike("facturas.forma_pago","contado").eq("fecha_devolucion",r);s?console.warn("Error cargando devoluciones:",s.message):m=e||[]}catch(e){console.warn("Exception cargando devoluciones:",e)}try{const{data:e,error:s}=await N.from("recibos_ingreso").select("monto_pagado, fecha, created_at, origen, formas_pago").eq("tenant_id",E).eq("anulado",!1).eq("fecha",r);if(s){console.warn("Error cargando recibos por fecha:",s.message);const{data:f,error:p}=await N.from("recibos_ingreso").select("monto_pagado, created_at, origen, formas_pago").eq("tenant_id",E).eq("anulado",!1).gte("created_at",d).lte("created_at",x);p?console.warn("Error cargando recibos por created_at:",p.message):v=f||[]}else v=e||[];console.log(`Recibos encontrados para ${r}:`,v.length,v)}catch(e){console.warn("Exception cargando recibos:",e)}try{const{data:e,error:s}=await N.from("pagos_suplidores").select("monto_pagado, formas_pago").eq("tenant_id",E).eq("anulado",!1).gte("created_at",d).lte("created_at",x);s?console.warn("Error cargando pagos suplidores:",s.message):c=e||[]}catch(e){console.warn("Exception cargando pagos suplidores:",e)}try{const{data:e,error:s}=await N.from("gastos_diarios").select("monto, descripcion, tipo_gasto, afecta_caja, cuenta_bancaria_id, es_tercero, concepto_tercero").eq("tenant_id",E).eq("fecha",r).eq("anulado",!1);if(s)console.warn("Error cargando gastos diarios:",s.message);else{const f=(e||[]).filter(g=>!g.cuenta_bancaria_id&&g.afecta_caja!==!1);R=f.filter(g=>g.es_tercero===!0);const p=g=>/n[oó]mina/i.test(String(g.tipo_gasto||"")),w=f.filter(g=>g.es_tercero!==!0);da=w.filter(p),_=w.filter(g=>!p(g))}}catch(e){console.warn("Exception cargando gastos diarios:",e)}let ba=0;try{const{data:e,error:s}=await N.from("compras").select("numero, total_compra, forma_pago, estado, pagos, created_at").eq("tenant_id",E).ilike("forma_pago","contado").gte("created_at",d).lte("created_at",x);s?console.warn("Error cargando compras de contado:",s.message):ba=(e||[]).filter(f=>(f.estado||"")!=="ANULADA").reduce((f,p)=>{const w=Array.isArray(p.pagos)?p.pagos:[];return w.length===0?f+(parseFloat(p.total_compra)||0):f+w.filter(g=>String((g==null?void 0:g.tipo)??"01")==="01"||String((g==null?void 0:g.forma)||"").toLowerCase().includes("efectivo")).reduce((g,P)=>g+(parseFloat(P==null?void 0:P.monto)||0),0)},0)}catch(e){console.warn("Exception cargando compras de contado:",e)}try{const{data:e,error:s}=await N.from("prestamos").select("numero, monto_capital, created_at, clientes(nombre)").eq("tenant_id",E).ilike("desembolso","efectivo").gte("created_at",d).lte("created_at",x);s?console.warn("Error cargando préstamos en efectivo:",s.message):pa=e||[]}catch(e){console.warn("Exception cargando préstamos en efectivo:",e)}try{const{data:e,error:s}=await N.from("compromisos").select("id, nombre, monto, tipo, forma_pago, fecha_pago").eq("tenant_id",E).eq("activo",!1).gte("fecha_pago",d).lte("fecha_pago",x);if(s)console.warn("Error cargando compromisos pagados:",s.message);else{M=(e||[]).filter(p=>String(p.forma_pago||"Efectivo").toLowerCase().includes("efectivo"));const f=M.filter(p=>String(p.tipo||"").toLowerCase()==="nomina").map(p=>p.id);if(f.length>0){const{data:p}=await N.from("nominas").select("id, compromiso_id, nomina_detalle(neto, pagado_at, gasto_id, empleados(nombre))").eq("tenant_id",E).in("compromiso_id",f).neq("estado","anulada"),w=(p||[]).flatMap(S=>(S.nomina_detalle||[]).map(j=>j.gasto_id)).filter(Boolean),g=new Set;if(w.length>0){const{data:S}=await N.from("gastos_diarios").select("id, anulado").in("id",w);for(const j of S||[])j.anulado&&g.add(j.id)}const P={};for(const S of p||[])P[S.compromiso_id]=(S.nomina_detalle||[]).map(j=>{var I;return{nombre:((I=j.empleados)==null?void 0:I.nombre)||"Empleado",monto:Number(j.neto)||0,yaEnGastos:!!j.gasto_id&&!g.has(j.gasto_id),pagadoAt:j.pagado_at||null}}).filter(j=>j.monto>0).sort((j,I)=>I.monto-j.monto);M=M.map(S=>{const j=P[S.id]||null,I=(j||[]).filter(ja=>ja.yaEnGastos).reduce((ja,Rt)=>ja+Rt.monto,0);return{...S,empleados:j,cubierto:I,monto_efectivo:Math.max((parseFloat(S.monto)||0)-I,0)}})}}}catch(e){console.warn("Exception cargando compromisos pagados:",e)}let xa=[];try{const{data:e,error:s}=await N.from("caja_depositos").select("id, monto_caja, moneda, tasa, monto_cuenta, concepto, cuenta_id, created_at, cuentas_bancarias(banco, alias)").eq("tenant_id",E).eq("fecha",r).eq("anulado",!1).order("created_at");s?console.warn("Error cargando efectivo movido a cuentas:",s.message):xa=(e||[]).map(f=>({...f,cuenta:f.cuentas_bancarias?`${f.cuentas_bancarias.banco}${f.cuentas_bancarias.alias?` — ${f.cuentas_bancarias.alias}`:""}`:"cuenta"}))}catch(e){console.warn("Exception cargando efectivo movido a cuentas:",e)}const ma=l.filter(e=>{const s=String(e.forma_pago||"").toUpperCase();return s==="CONTADO"||s==="EFECTIVO"}),ka=ma.reduce((e,s)=>e+(parseFloat(s.total)||0),0),Ga=ma.filter(pt).reduce((e,s)=>e+(parseFloat(s.total)||0),0),Nt=e=>{const s=String(e.tipo_pago||"").toUpperCase();return!s||s.includes("EFECTIVO")},za=ma.filter(e=>!Nt(e)).reduce((e,s)=>e+(parseFloat(s.total)||0),0),Ua=Math.max(0,ka-Ga-za),Et=l.filter(e=>String(e.forma_pago||"").toUpperCase()==="CREDITO").reduce((e,s)=>e+(parseFloat(s.total)||0),0),_t=l.reduce((e,s)=>e+(parseFloat(s.total)||0),0),wt=l.reduce((e,s)=>e+(parseFloat(s.itbis)||0),0),$t=l.reduce((e,s)=>e+(parseFloat(s.descuento)||0),0),Ha=m.reduce((e,s)=>e+(parseFloat(s.total_devolucion)||0),0),fa=v.reduce((e,s)=>e+(parseFloat(s.monto_pagado)||0),0),Ja=v.filter(e=>String(e.origen||"").toLowerCase()==="movil").reduce((e,s)=>e+(parseFloat(s.monto_pagado)||0),0),Tt=Math.max(0,fa-Ja),St=e=>{const s=Array.isArray(e.formas_pago)?e.formas_pago:null;return!s||!s.length?parseFloat(e.monto_pagado)||0:s.reduce((f,p)=>f+(String(p.forma||"").toLowerCase().includes("efectivo")&&parseFloat(p.monto)||0),0)},ga=v.reduce((e,s)=>e+St(s),0),Ba=Math.max(0,fa-ga),va=new Map;v.forEach(e=>{(Array.isArray(e.formas_pago)?e.formas_pago:[]).forEach(s=>{if(String(s.forma||"").toLowerCase().includes("efectivo"))return;const f=parseFloat(s.monto)||0;if(f<=0)return;const p=s.alias?`${s.alias}${s.banco?` (${s.banco})`:""}`:[s.banco,s.cuenta].filter(Boolean).join(" "),w=p?`${s.forma||"Otra"} → ${p}`:s.forma||"Otra forma";va.set(w,(va.get(w)||0)+f)})});const K=[...va.entries()].map(([e,s])=>({etiqueta:e,monto:s})),Dt=K.reduce((e,s)=>e+s.monto,0),Wa=Math.round((Ba-Dt)*100)/100;K.length&&Wa>=.01&&K.push({etiqueta:"Sin forma detallada",monto:Wa});const Ya=_.reduce((e,s)=>e+(parseFloat(s.monto)||0),0),Ka=R.reduce((e,s)=>e+(parseFloat(s.monto)||0),0),Qa=da.reduce((e,s)=>e+(parseFloat(s.monto)||0),0),Za=pa.reduce((e,s)=>e+(parseFloat(s.monto_capital)||0),0),Xa=e=>e.monto_efectivo!==void 0?parseFloat(e.monto_efectivo)||0:parseFloat(e.monto)||0;M=M.filter(e=>Xa(e)>0);const at=M.reduce((e,s)=>e+Xa(s),0),tt=xa.reduce((e,s)=>e+(parseFloat(s.monto_caja)||0),0),ot=c.reduce((e,s)=>{const f=(s.formas_pago||[]).filter(p=>p.forma==="Efectivo").reduce((p,w)=>p+(parseFloat(w.monto)||0),0);return e+f},0),Ot=l.filter(e=>e.forma_pago==="CONTADO").reduce((e,s)=>e+(parseFloat(s.cambio)||0),0),At=l.length,ha={totalVentas:_t,totalVentasContado:ka,totalVentasContadoCaja:Ua,totalVentasContadoMovil:Ga,totalVentasContadoNoEfectivo:za,totalVentasCredito:Et,totalItbis:wt,totalDescuento:$t,totalDevoluciones:Ha,totalRecibos:fa,totalRecibosMovil:Ja,totalRecibosCaja:Tt,totalRecibosEfectivo:ga,totalRecibosOtrasFormas:Ba,recibosPorCuenta:K,totalGastosDiarios:Ya,gastosDiarios:_,totalPagosTerceros:Ka,pagosTerceros:R,totalPagosNomina:Qa,pagosNomina:da,totalPrestamosEfectivo:Za,prestamosEfectivo:pa,totalCompromisosEfectivo:at,compromisosEfectivo:M,totalEfectivoMovido:tt,efectivoMovido:xa,totalPagosSuplidores:ot,cambioEntregado:Ot,cantFacturas:At,comprasContadoEfectivo:ba,efectivoEnCaja:Ua+ga-Ha-ot-Ya-Ka-Qa-Za-at-ba-tt};return a||(yt(ha),Ra(!1)),ha},[$,T,E]);h.useEffect(()=>{F()},[F]),h.useEffect(()=>{const t=()=>{document.hidden||F()};return window.addEventListener("focus",t),document.addEventListener("visibilitychange",t),()=>{window.removeEventListener("focus",t),document.removeEventListener("visibilitychange",t)}},[F]);const Fa=(t,a)=>{if(t.tipo){Y(d=>({...d,[t.label]:a}));return}const r=parseInt(a,10);Y(d=>({...d,[t.label]:isNaN(r)?0:r}))};h.useEffect(()=>{N.rpc("get_tasa_dia").then(({data:t})=>{const a=Number(t)||0;a>0&&Y(r=>Number(r["Tasa del día"])>0?r:{...r,"Tasa del día":a})},()=>{})},[]);const A=h.useMemo(()=>X.reduce((t,a)=>t+aa(a,V),0),[V]),la=async()=>{var t;Aa(!0);try{const a=T==="ALL"?"Todos los Cajeros":((t=Sa.find(m=>m.id===T))==null?void 0:t.nombre_completo)||"N/A",r={tenant_id:E,fecha:q($),turno:H,cajero_id:T==="ALL"?u==null?void 0:u.id:T,cajero_nombre:a,total_ventas:(i==null?void 0:i.totalVentas)||0,total_ventas_contado:(i==null?void 0:i.totalVentasContado)||0,total_ventas_contado_caja:(i==null?void 0:i.totalVentasContadoCaja)||0,total_ventas_contado_movil:(i==null?void 0:i.totalVentasContadoMovil)||0,total_ventas_credito:(i==null?void 0:i.totalVentasCredito)||0,total_itbis:(i==null?void 0:i.totalItbis)||0,total_descuento:(i==null?void 0:i.totalDescuento)||0,total_devoluciones:(i==null?void 0:i.totalDevoluciones)||0,total_recibos:(i==null?void 0:i.totalRecibos)||0,total_gastos_diarios:(i==null?void 0:i.totalGastosDiarios)||0,cambio_entregado:(i==null?void 0:i.cambioEntregado)||0,efectivo_en_caja:(i==null?void 0:i.efectivoEnCaja)||0,total_desglose:A,diferencia:A-((i==null?void 0:i.efectivoEnCaja)||0),desglose:Object.fromEntries(Object.entries(V).map(([m,v])=>[m,Number(v)||0])),usuario_id:u==null?void 0:u.id,detalle:i||null},{data:d,error:x}=await N.from("cierres_caja").insert([r]).select("id").single();if(x)throw x;const l=(i==null?void 0:i.efectivoEnCaja)||0;if(W&&l>0&&(d!=null&&d.id)){const{error:m}=await N.rpc("registrar_movimiento_bancario",{p_cuenta_id:W,p_tipo:"ENTRADA",p_monto:l,p_concepto:`Cierre de caja — turno ${H} (${q($)})`,p_referencia:null,p_origen_tipo:"cierre_caja",p_origen_id:d.id,p_fecha:q($)});m&&b({variant:"destructive",title:"Cierre grabado, pero no se registró en la cuenta",description:m.message})}else l>0&&!W&&b({variant:"destructive",title:"El efectivo NO entró a ninguna cuenta",description:`Se cerró la caja con ${n(l)} pero no había cuenta seleccionada. Regístralo a mano en Cuentas Bancarias.`});ia&&Ia(r,i),b({title:"Cierre de Caja",description:`El cierre del turno ${H} ha sido registrado exitosamente.`}),Y(m=>({...X.reduce((v,c)=>({...v,[c.label]:0}),{}),"Tasa del día":m["Tasa del día"]||0})),ea(!1),k||Ta(m=>Math.min(m+1,oa)),F()}catch(a){console.error("Error saving cierre:",a),b({variant:"destructive",title:"Error",description:a.message||"No se pudo registrar el cierre de caja."})}finally{Aa(!1)}},C=({label:t,value:a,bold:r,isCount:d,siempre:x})=>x||Number(a)>0?o.jsxs("div",{className:`flex justify-between items-center py-1 ${r?"border-t-2 border-morla-blue pt-2":""}`,children:[o.jsx("span",{className:`text-sm ${r?"font-bold text-morla-blue":"text-gray-600"}`,children:t}),o.jsx("span",{className:`font-mono text-sm ${r?"font-bold text-morla-blue text-base":"text-gray-800"}`,children:d?a:n(a)})]}):null,na=({label:t,value:a})=>o.jsxs("div",{className:"flex justify-between items-center py-1.5 mt-1 border-t-2 border-gray-800",children:[o.jsx("span",{className:"text-sm font-bold text-gray-800 uppercase tracking-wide",children:t}),o.jsx("span",{className:"font-mono text-sm font-bold text-gray-900",children:n(a)})]}),ca=t=>(Number(t==null?void 0:t.totalGastosDiarios)||0)+(Number(t==null?void 0:t.totalPagosNomina)||0)+(Number(t==null?void 0:t.totalPagosTerceros)||0)+(Number(t==null?void 0:t.totalPrestamosEfectivo)||0)+(Number(t==null?void 0:t.totalPagosSuplidores)||0)+(Number(t==null?void 0:t.totalCompromisosEfectivo)||0)+(Number(t==null?void 0:t.comprasContadoEfectivo)||0)+(Number(t==null?void 0:t.totalDevoluciones)||0),ra=t=>(Number((t==null?void 0:t.totalVentasContadoCaja)??(t==null?void 0:t.totalVentasContado))||0)+(Number((t==null?void 0:t.totalRecibosEfectivo)??(t==null?void 0:t.totalRecibos))||0),Ct=(t,a)=>{const r=ca(a),d=ra(a),x=(l,m,v=!1,c=!1)=>c||Number(m)>0?`<tr${v?' class="bold"':""}><td>${l}</td><td class="num">${n(m)}</td></tr>`:"";return`
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
          ${t._descuadre?`<br><b>Ojo:</b> hoy esa fecha da ${n(t._descuadre)} de efectivo, distinto de los ${n(t.efectivo_en_caja)} que se grabaron. Manda lo grabado.`:""}
        </div>`:""}

        <div class="cols">
          <div class="col">
            <!-- Arriba SOLO lo que entró: ventas y cobros. Lo que salió va
                 abajo, cada cosa con su desglose. Mezclar entradas y salidas
                 en una sola lista obligaba a leerla dos veces. -->
            <div class="sec">Entradas del día</div>
            <table><tbody>
              ${x("Ventas Contado Caja",a==null?void 0:a.totalVentasContadoCaja)}
              ${x("Ventas Contado Móvil",a==null?void 0:a.totalVentasContadoMovil)}
              ${x("Ventas por Transferencia/Tarjeta",a==null?void 0:a.totalVentasContadoNoEfectivo)}
              ${x("Ventas Crédito",a==null?void 0:a.totalVentasCredito)}
              ${x("Total Ventas",a==null?void 0:a.totalVentas,!0)}
              ${Number(a==null?void 0:a.totalRecibosMovil)>0?`
              ${x("Recibos Ingreso Caja",a==null?void 0:a.totalRecibosCaja)}
              ${x("Recibos Ingreso Móvil",a==null?void 0:a.totalRecibosMovil)}`:""}
              ${x("Recibos Ingreso (total)",a==null?void 0:a.totalRecibos,!0)}
              ${Number(a==null?void 0:a.totalRecibosOtrasFormas)>0?`
              ${x("· Recibos en Efectivo",a==null?void 0:a.totalRecibosEfectivo)}
              ${x("· Recibos Transf/Cheque/Tarjeta",a==null?void 0:a.totalRecibosOtrasFormas)}
              ${((a==null?void 0:a.recibosPorCuenta)||[]).map(l=>x(`&nbsp;&nbsp;&nbsp;&nbsp;↳ ${rt(l.etiqueta)}`,l.monto,!1,!0)).join("")}`:""}
            </tbody></table>
            <!-- De todo lo que entró, lo que de verdad llegó a la gaveta. -->
            <div class="linea-fuerte"><span>TOTAL INGRESO EN CAJA</span><span>${n(d)}</span></div>

            ${((a==null?void 0:a.gastosDiarios)||[]).length?`
            <div class="sec">Desglose de Gastos</div>
            <table><tbody>
              ${a.gastosDiarios.map(l=>`<tr><td>${l.tipo_gasto||"GASTO"}${l.descripcion?` — ${l.descripcion}`:""}</td><td class="num">${n(l.monto)}</td></tr>`).join("")}
              <tr class="bold"><td>Total Gastos</td><td class="num">${n(a==null?void 0:a.totalGastosDiarios)}</td></tr>
            </tbody></table>`:""}

            ${((a==null?void 0:a.pagosNomina)||[]).length?`
            <div class="sec">Nómina pagada hoy (efectivo)</div>
            <table><tbody>
              ${a.pagosNomina.map(l=>`<tr><td>${l.descripcion||"NÓMINA"}</td><td class="num">${n(l.monto)}</td></tr>`).join("")}
              <tr class="bold"><td>Total Nómina</td><td class="num">${n(a==null?void 0:a.totalPagosNomina)}</td></tr>
            </tbody></table>`:""}

            ${((a==null?void 0:a.pagosTerceros)||[]).length?`
            <div class="sec">Pagos a terceros (no son gastos de la empresa)</div>
            <table><tbody>
              ${a.pagosTerceros.map(l=>`<tr><td>${l.concepto_tercero||"TERCERO"}${l.descripcion?` — ${l.descripcion}`:""}</td><td class="num">${n(l.monto)}</td></tr>`).join("")}
              <tr class="bold"><td>Total entregado a terceros</td><td class="num">${n(a==null?void 0:a.totalPagosTerceros)}</td></tr>
            </tbody></table>`:""}

            ${((a==null?void 0:a.prestamosEfectivo)||[]).length?`
            <div class="sec">Préstamos (Efectivo)</div>
            <table><tbody>
              ${a.prestamosEfectivo.map(l=>{var m;return`<tr><td>${((m=l.clientes)==null?void 0:m.nombre)||"PRÉSTAMO"}${l.numero?` — ${l.numero}`:""}</td><td class="num">${n(l.monto_capital)}</td></tr>`}).join("")}
              <tr class="bold"><td>Total Préstamos</td><td class="num">${n(a==null?void 0:a.totalPrestamosEfectivo)}</td></tr>
            </tbody></table>`:""}

            ${((a==null?void 0:a.compromisosEfectivo)||[]).length?`
            <div class="sec">Compromisos (Efectivo)</div>
            <table><tbody>
              ${a.compromisosEfectivo.map(l=>`
                <tr><td>${l.nombre||"COMPROMISO"}${l.tipo?` — ${l.tipo}`:""}</td><td class="num">${n(l.monto_efectivo!==void 0?l.monto_efectivo:l.monto)}</td></tr>
                ${(l.empleados||[]).map(m=>`<tr><td style="padding-left:14px;color:#555">· ${m.nombre}${m.yaEnGastos?` <i>(ya salió ${m.pagadoAt?z(m.pagadoAt):"antes"}, en Gastos)</i>`:""}</td><td class="num" style="color:#555">${n(m.monto)}</td></tr>`).join("")}
              `).join("")}
              <tr class="bold"><td>Total Compromisos</td><td class="num">${n(a==null?void 0:a.totalCompromisosEfectivo)}</td></tr>
            </tbody></table>`:""}

            <!-- Las salidas que no tienen desglose propio. Si están en cero no
                 aparecen, pero cuando existen tienen que verse: si no, el
                 GASTO TOTAL de abajo saldría con dinero que no se explica. -->
            ${Number(a==null?void 0:a.totalDevoluciones)>0||Number(a==null?void 0:a.totalPagosSuplidores)>0||Number(a==null?void 0:a.comprasContadoEfectivo)>0?`
            <div class="sec">Otras salidas</div>
            <table><tbody>
              ${x("Devoluciones",a==null?void 0:a.totalDevoluciones)}
              ${x("Pagos Suplidores (Efectivo)",a==null?void 0:a.totalPagosSuplidores)}
              ${x("Compras de contado (Efectivo)",a==null?void 0:a.comprasContadoEfectivo)}
            </tbody></table>`:""}

            <div class="linea-fuerte"><span>GASTO TOTAL</span><span>${n(r)}</span></div>

            ${((a==null?void 0:a.efectivoMovido)||[]).length?`
            <!-- (24/10/2026) No es gasto: el efectivo pasó a una cuenta (compra de
                 dólares, depósito). Va aparte para que el cuadre se vea entero. -->
            <div class="sec">Efectivo movido a cuentas (no es gasto)</div>
            <table><tbody>
              ${a.efectivoMovido.map(l=>`<tr><td>${l.cuenta}${l.moneda&&l.moneda!=="DOP"?` — US$${Number(l.monto_cuenta).toLocaleString("es-DO",{minimumFractionDigits:2})} a ${Number(l.tasa)}`:""}${l.concepto?` · ${l.concepto}`:""}</td><td class="num">${n(l.monto_caja)}</td></tr>`).join("")}
            </tbody></table>
            <div class="linea-fuerte"><span>EFECTIVO MOVIDO A CUENTAS</span><span>${n(a==null?void 0:a.totalEfectivoMovido)}</span></div>`:""}

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
                ${wa.filter(l=>Number(t.desglose[l.label]||0)>0&&(l.tipo!=="tasa"||Number(t.desglose.Dólares||0)>0)).map(l=>{const m=t.desglose[l.label]||0,v=aa(l,t.desglose);return`<tr><td>${l.label}</td><td class="num">${m}</td><td class="num">${l.tipo==="tasa"?"":n(v)}</td></tr>`}).join("")}
                <tr class="grande"><td colspan="2">Total Desglose</td><td class="num">${n(t.total_desglose)}</td></tr>
                <tr class="grande"><td colspan="2">Diferencia${t.diferencia<0?" (FALTANTE)":t.diferencia>0?" (SOBRANTE)":""}</td><td class="num">${n(t.diferencia)}</td></tr>
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
    `},Ia=(t,a)=>{const r=(Pa||(y==null?void 0:y.formato_cierre_caja)||"pos_80mm")==="carta",d=ca(a),x=ra(a),l=(c,_,R={})=>R.siempre||Number(_)>0?`<div class="row${R.total?" total-row":""}"><span>${c}:</span><span${R.bold?' class="bold"':""}>${n(_)}</span></div>`:"",m=r?Ct(t,a):`
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
        ${l("Ventas Contado Caja",a==null?void 0:a.totalVentasContadoCaja)}
        ${l("Cuenta Contado Móvil",a==null?void 0:a.totalVentasContadoMovil)}
        ${l("Ventas Transf./Tarjeta",a==null?void 0:a.totalVentasContadoNoEfectivo)}
        ${l("Ventas Crédito",a==null?void 0:a.totalVentasCredito)}
        ${l("Total Ventas",a==null?void 0:a.totalVentas,{bold:!0})}
        ${Number(a==null?void 0:a.totalRecibosMovil)>0?`
        ${l("Recibos Ingreso Caja",a==null?void 0:a.totalRecibosCaja)}
        ${l("Recibos Ingreso Móvil",a==null?void 0:a.totalRecibosMovil)}`:""}
        ${l("Recibos Ingreso (total)",a==null?void 0:a.totalRecibos)}
        ${Number(a==null?void 0:a.totalRecibosOtrasFormas)>0?`
        ${l("&nbsp;&nbsp;En Efectivo",a==null?void 0:a.totalRecibosEfectivo,{siempre:!0})}
        ${l("&nbsp;&nbsp;Transf/Cheque/Tarjeta",a==null?void 0:a.totalRecibosOtrasFormas)}
        ${((a==null?void 0:a.recibosPorCuenta)||[]).map(c=>l(`&nbsp;&nbsp;&nbsp;&nbsp;↳ ${rt(c.etiqueta)}`,c.monto,{siempre:!0})).join("")}`:""}
        <div class="row total-row"><span>TOTAL INGRESO EN CAJA:</span><span>${n(x)}</span></div>
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
        ${l("Devoluciones",a==null?void 0:a.totalDevoluciones)}
        ${l("Pagos Suplidores",a==null?void 0:a.totalPagosSuplidores)}
        ${l("Compras de contado",a==null?void 0:a.comprasContadoEfectivo)}`:""}
        <div class="separator"></div>
        <div class="row total-row"><span>GASTO TOTAL:</span><span>${n(d)}</span></div>
        ${((a==null?void 0:a.efectivoMovido)||[]).length?`
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">EFECTIVO MOVIDO A CUENTAS (NO ES GASTO)</div>
        ${a.efectivoMovido.map(c=>`
          <div class="row">
            <span style="max-width: 70%;">${c.cuenta}${c.moneda&&c.moneda!=="DOP"?` (US$${Number(c.monto_cuenta).toLocaleString("es-DO",{minimumFractionDigits:2})} a ${Number(c.tasa)})`:""}</span>
            <span>${n(c.monto_caja)}</span>
          </div>`).join("")}
        <div class="row total-row"><span>MOVIDO A CUENTAS:</span><span>${n(a==null?void 0:a.totalEfectivoMovido)}</span></div>`:""}
        <div class="row total-row"><span>EFECTIVO EN CAJA:</span><span>${n(a==null?void 0:a.efectivoEnCaja)}</span></div>
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">DESGLOSE DINERO EN CAJA</div>
        <div class="row" style="font-size: 12px; border-bottom: 1px solid #000; margin-bottom: 2px;">
          <span style="flex: 1;">DENOM.</span>
          <span class="text-right" style="width: 42px;">CANT.</span>
          <span class="text-right" style="width: 84px;">VALOR</span>
        </div>
        ${wa.filter(c=>Number(t.desglose[c.label]||0)>0&&(c.tipo!=="tasa"||Number(t.desglose.Dólares||0)>0)).map(c=>{const _=t.desglose[c.label]||0,R=aa(c,t.desglose);return`<div class="row">
            <span style="flex: 1;">${c.label}</span>
            <span class="text-right" style="width: 42px;">${_}</span>
            <span class="text-right" style="width: 84px;">${c.tipo==="tasa"?"":n(R)}</span>
          </div>`}).join("")}
        <div class="row total-row"><span>Total Desglose:</span><span>${n(t.total_desglose)}</span></div>
        <div class="row" style="margin-top: 6px; font-weight: 900; font-size: 16px;">
          <span>Diferencia${t.diferencia<0?" (FALTANTE)":t.diferencia>0?" (SOBRANTE)":""}:</span>
          <span>${n(t.diferencia)}</span>
        </div>
        <div class="separator"></div>
        <p class="text-center" style="margin-top: 10px; font-size: 13px;">*** FIN DEL CIERRE ***</p>
      </body>
      </html>
    `,v=document.createElement("iframe");v.style.cssText="position:fixed;right:0;bottom:0;width:0;height:0;border:0;",document.body.appendChild(v),v.contentWindow.document.open(),v.contentWindow.document.write(m),v.contentWindow.document.close(),setTimeout(()=>{document.body.contains(v)&&document.body.removeChild(v)},3e3)},La=h.useCallback(async()=>{if(!E)return;const{data:t,error:a}=await N.from("cierres_caja").select("*").eq("tenant_id",E).order("created_at",{ascending:!1}).limit(60);a||ft(t||[])},[E]);h.useEffect(()=>{B&&La()},[B,La]);const[Va,qa]=h.useState(null),ut=async t=>{qa(t.id);try{const a=!t.detalle,r=t.detalle||await F(t.fecha);if(!r)throw new Error("No se pudo armar el desglose de esa fecha.");const d=Math.abs((Number(r.efectivoEnCaja)||0)-(Number(t.efectivo_en_caja)||0)),x=a?{...r,efectivoEnCaja:t.efectivo_en_caja}:r;Ia({...t,_reimpresion:!0,_reconstruido:a,_descuadre:a&&d>.01?r.efectivoEnCaja:null},x)}catch(a){b({variant:"destructive",title:"No se pudo reimprimir",description:a.message})}finally{qa(null)}};return h.useEffect(()=>{const t=a=>{$a==="cierre-caja"&&(a.key==="Escape"&&a.defaultPrevented||(a.key==="F8"&&J&&(a.preventDefault(),la()),a.key==="Escape"&&(a.preventDefault(),J?ea(!1):ta("cierre-caja"))))};return window.addEventListener("keydown",t),()=>window.removeEventListener("keydown",t)},[J,la,ta,$a]),o.jsxs(o.Fragment,{children:[o.jsx(Lt,{children:o.jsx("title",{children:"Cierre de Caja — MotoFlow"})}),o.jsx(Vt.div,{initial:{opacity:0,y:20},animate:{opacity:1,y:0},className:"p-1 md:p-4 bg-gray-100 min-h-full flex flex-col",children:o.jsxs("div",{className:"bg-white p-4 rounded-lg shadow-md flex-grow flex flex-col",children:[o.jsxs("div",{className:"bg-morla-blue text-white py-1.5 rounded-t-lg mb-3 relative",children:[o.jsx("h1",{className:"text-white font-black tracking-[0.25em] italic uppercase text-base drop-shadow-sm text-center",children:"CIERRE DE CAJA"}),o.jsx("button",{type:"button",onClick:()=>F(),disabled:sa,title:"Actualizar los montos del día",className:"absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-white/20 disabled:opacity-50",children:o.jsx(qt,{className:`w-4 h-4 ${sa?"animate-spin":""}`})})]}),$&&q($)!==q(et())&&o.jsxs("div",{className:"mb-3 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900",children:[o.jsxs("b",{children:["Estás cerrando una fecha pasada: ",st($,"dd/MM/yyyy"),"."]})," ","Las cifras son las de ese día. Si ya vendiste hoy, el efectivo de la gaveta incluye lo de hoy y no va a cuadrar con el conteo."]}),o.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-4 gap-x-4 gap-y-2 px-3 py-2 border rounded-lg mb-3",children:[o.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[o.jsx(Q,{className:"font-bold text-xs shrink-0",children:"Fecha"}),o.jsxs(Wt,{children:[o.jsx(Yt,{asChild:!0,children:o.jsxs(G,{variant:"outline",className:kt("flex-1 min-w-0 h-8 justify-start text-left font-normal text-sm px-2",!$&&"text-muted-foreground"),children:[o.jsx(Gt,{className:"mr-1.5 h-3.5 w-3.5 shrink-0"}),$?st($,"dd/MM/yyyy"):o.jsx("span",{children:"Seleccione"})]})}),o.jsx(Kt,{className:"w-auto p-0",children:o.jsx(Qt,{mode:"single",selected:$,onSelect:bt,initialFocus:!0})})]})]}),!k&&o.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[o.jsx(Q,{className:"font-bold text-xs shrink-0",children:"Turno"}),o.jsx(ya,{type:"number",min:"1",max:oa,value:H,onChange:t=>Ta(parseInt(t.target.value,10)||1),onFocus:t=>t.target.select(),className:"flex-1 min-w-0 h-8 text-center font-bold px-2"})]}),o.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[o.jsx(Q,{className:"font-bold text-xs shrink-0",children:"Caja"}),o.jsxs(Ca,{value:"caja1",disabled:!0,children:[o.jsx(ua,{className:"flex-1 min-w-0 h-8 text-sm px-2",children:o.jsx(Na,{})}),o.jsx(Ea,{children:o.jsx(Z,{value:"caja1",children:"Caja No. 1"})})]})]}),o.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[o.jsx(Q,{className:"font-bold text-xs shrink-0",children:"Cajero"}),o.jsxs(Ca,{value:T,onValueChange:Da,children:[o.jsx(ua,{className:"flex-1 min-w-0 h-8 text-sm px-2",children:o.jsx(Na,{placeholder:"Seleccione cajero"})}),o.jsxs(Ea,{children:[o.jsx(Z,{value:"ALL",className:"font-bold text-morla-blue",children:"📊 Todos los Cajeros (Consolidado)"}),Sa.map(t=>o.jsx(Z,{value:t.id,children:t.nombre_completo||t.email},t.id))]})]})]})]}),sa?o.jsx("div",{className:"flex-grow flex items-center justify-center",children:o.jsx(_a,{className:"h-8 w-8 animate-spin text-morla-blue"})}):i?o.jsxs("div",{className:"grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4",children:[o.jsxs("div",{className:"border rounded-lg p-4 bg-gradient-to-br from-slate-50 to-blue-50",children:[o.jsx("h2",{className:"font-bold text-sm uppercase text-gray-500 tracking-wider mb-3",children:T==="ALL"?"Resumen Total del Día":"Resumen del Turno"}),o.jsxs("div",{className:"space-y-2",children:[o.jsx(C,{label:"Cantidad de Facturas",value:i.cantFacturas,isCount:!0,siempre:!0}),o.jsx(C,{label:"Ventas Contado Caja",value:i.totalVentasContadoCaja}),o.jsx(C,{label:"Cuenta Contado Móvil",value:i.totalVentasContadoMovil}),o.jsx(C,{label:"Ventas por Transferencia/Tarjeta",value:i.totalVentasContadoNoEfectivo}),o.jsx(C,{label:"Ventas Crédito",value:i.totalVentasCredito}),o.jsx(C,{label:"Total Ventas",value:i.totalVentas,bold:!0}),Number(i.totalRecibosMovil)>0&&o.jsxs(o.Fragment,{children:[o.jsx(C,{label:"Recibos de Ingreso Caja",value:i.totalRecibosCaja}),o.jsx(C,{label:"Recibos de Ingreso Móvil",value:i.totalRecibosMovil})]}),o.jsx(C,{label:"Recibos de Ingreso (total)",value:i.totalRecibos}),Number(i.totalRecibosOtrasFormas)>0&&o.jsxs(o.Fragment,{children:[o.jsx(C,{label:"· Recibos en Efectivo",value:i.totalRecibosEfectivo}),o.jsx(C,{label:"· Recibos Transf/Cheque/Tarjeta",value:i.totalRecibosOtrasFormas}),(i.recibosPorCuenta||[]).map(t=>o.jsx(C,{label:`    ↳ ${t.etiqueta}`,value:t.monto,siempre:!0},t.etiqueta))]}),o.jsx(na,{label:"Total ingreso en caja",value:ra(i)}),o.jsx(C,{label:"Gastos Diarios",value:i.totalGastosDiarios}),o.jsx(C,{label:"Nómina (Efectivo)",value:i.totalPagosNomina}),(i.pagosNomina||[]).length>0&&o.jsx("div",{className:"mt-1 mb-1 ml-3 pl-3 border-l-2 border-gray-200",children:i.pagosNomina.map(t=>o.jsxs("div",{className:"flex justify-between items-center py-0.5",children:[o.jsx("span",{className:"text-xs text-gray-500 truncate pr-2",title:t.descripcion,children:String(t.descripcion||"Nómina").split("—").pop().trim()}),o.jsx("span",{className:"font-mono text-xs text-gray-600 shrink-0",children:n(t.monto)})]},t.id||t.descripcion))}),o.jsx(C,{label:"Pagos a terceros (GPS, seguro...)",value:i.totalPagosTerceros}),o.jsx(C,{label:"Préstamos (Efectivo)",value:i.totalPrestamosEfectivo}),o.jsx(C,{label:"Compromisos (Efectivo)",value:i.totalCompromisosEfectivo}),(i.compromisosEfectivo||[]).filter(t=>(t.empleados||[]).length>0).map(t=>o.jsxs("div",{className:"mt-1 mb-1 ml-3 pl-3 border-l-2 border-gray-200",children:[o.jsx("p",{className:"text-[11px] font-semibold text-gray-400 uppercase tracking-wide",children:t.nombre}),t.empleados.map((a,r)=>o.jsxs("div",{className:"flex justify-between items-center py-0.5",children:[o.jsx("span",{className:`text-xs truncate pr-2 ${a.yaEnGastos?"text-gray-400 line-through":"text-gray-500"}`,children:a.nombre}),o.jsx("span",{className:`font-mono text-xs shrink-0 ${a.yaEnGastos?"text-gray-400 line-through":"text-gray-600"}`,children:n(a.monto)})]},`${t.id}-${r}`)),Number(t.cubierto)>0&&o.jsxs("p",{className:"text-[10px] text-amber-700 leading-snug mt-0.5",children:[n(t.cubierto)," ya salió como gasto el día de cada pago; aquí solo entra"," ",n(t.monto_efectivo),"."]})]},t.id)),o.jsx(C,{label:"Devoluciones",value:i.totalDevoluciones}),o.jsx(C,{label:"Pagos a Suplidores (Efectivo)",value:i.totalPagosSuplidores}),o.jsx(C,{label:"Compras de contado (Efectivo)",value:i.comprasContadoEfectivo}),o.jsx(na,{label:"Gasto total",value:ca(i)}),(i.efectivoMovido||[]).length>0&&o.jsxs(o.Fragment,{children:[o.jsx("div",{className:"mt-2 mb-1 ml-3 pl-3 border-l-2 border-emerald-200",children:i.efectivoMovido.map(t=>o.jsxs("div",{className:"flex justify-between items-center py-0.5",children:[o.jsxs("span",{className:"text-xs text-gray-500 truncate pr-2",children:[t.cuenta,t.moneda&&t.moneda!=="DOP"?` (US$${Number(t.monto_cuenta).toLocaleString("es-DO",{minimumFractionDigits:2})} a ${Number(t.tasa)})`:"",t.concepto?` · ${t.concepto}`:""]}),o.jsx("span",{className:"font-mono text-xs text-gray-600 shrink-0",children:n(t.monto_caja)})]},t.id))}),o.jsx(na,{label:"Efectivo movido a cuentas (no es gasto)",value:i.totalEfectivoMovido})]}),o.jsxs("div",{className:"flex justify-between items-center py-2 mt-2 bg-morla-blue/10 rounded px-3 border border-morla-blue/30",children:[o.jsx("span",{className:"font-bold text-morla-blue",children:"Efectivo en Caja"}),o.jsx("span",{className:"font-bold text-morla-blue text-lg font-mono",children:n(i.efectivoEnCaja)})]})]})]}),o.jsx("div",{className:"border rounded-lg p-4 flex flex-col",children:J?o.jsxs("div",{className:"flex flex-col h-full",children:[o.jsxs("div",{className:"flex items-center justify-between gap-3 mb-2",children:[o.jsx("h3",{className:"font-bold text-sm uppercase tracking-widest text-gray-600",children:"DESGLOSE DE MONEDAS"}),o.jsxs(Ca,{value:"DOP",disabled:!0,children:[o.jsx(ua,{className:"w-32 h-7 text-xs",children:o.jsx(Na,{})}),o.jsx(Ea,{children:o.jsx(Z,{value:"DOP",children:"DOP - PESO"})})]})]}),o.jsx(zt,{className:"flex-grow border rounded-lg max-h-[380px]",children:o.jsxs(it,{children:[o.jsx(lt,{className:"bg-gray-200 sticky top-0 z-10",children:o.jsxs(U,{className:"h-8",children:[o.jsx(O,{className:"w-20 h-8 py-1 font-bold text-xs",children:"MONEDA"}),o.jsx(O,{className:"w-24 h-8 py-1 font-bold text-center text-xs",children:"CANTIDAD"}),o.jsx(O,{className:"h-8 py-1 text-right font-bold text-xs",children:"VALOR"})]})}),o.jsx(nt,{children:X.filter(t=>t.tipo!=="tasa").map(t=>{const a=V[t.label]??0,r=aa(t,V);return o.jsxs(U,{className:"hover:bg-yellow-50/50",children:[o.jsx(D,{className:"py-0.5 font-semibold text-right pr-4 text-sm whitespace-nowrap",children:t.label}),o.jsx(D,{className:"py-0.5 text-center",children:o.jsx(ya,{type:"number",min:"0",step:t.tipo?"0.01":"1",value:a,onChange:d=>Fa(t,d.target.value),onFocus:d=>d.target.select(),onClick:d=>d.target.select(),className:"w-20 mx-auto text-center h-6 text-sm px-1"})}),o.jsx(D,{className:"py-0.5 text-right font-mono text-sm",children:t.tipo==="dolar"?o.jsxs("div",{className:"flex items-center justify-end gap-2",children:[o.jsx("span",{className:"text-xs text-gray-600 font-sans font-semibold whitespace-nowrap",children:"Tasa del día"}),o.jsx(ya,{type:"number",min:"0",step:"0.01",value:V["Tasa del día"]??"",onChange:d=>Fa({label:"Tasa del día",tipo:"tasa"},d.target.value),onFocus:d=>d.target.select(),onClick:d=>d.target.select(),className:"w-20 text-center h-6 text-sm px-1"}),o.jsx("span",{className:"min-w-[90px]",children:n(r)})]}):n(r)})]},t.label)})}),o.jsx(Zt,{className:"sticky bottom-0 bg-yellow-100 z-10",children:o.jsxs(U,{className:"font-bold",children:[o.jsx(D,{colSpan:2,className:"py-1 text-right text-red-600 uppercase text-sm",children:"TOTAL ==>"}),o.jsx(D,{className:"py-1 text-right text-red-600 font-mono text-base",children:n(A)})]})})]})}),o.jsx("div",{className:"mt-2 px-2.5 py-2 bg-blue-50 border border-blue-200 rounded-lg",children:o.jsx(Ut,{value:W,onChange:vt,moneda:"DOP",contexto:"cierre_caja",label:"Depositar en",inline:!0})}),o.jsxs("div",{className:"mt-3 flex items-center justify-between",children:[o.jsxs("label",{className:"flex items-center gap-2 text-sm cursor-pointer",children:[o.jsx("input",{type:"checkbox",checked:ia,onChange:t=>mt(t.target.checked),className:"rounded"}),o.jsx(ct,{className:"h-4 w-4"}),"Imprimir ?"]}),ia&&o.jsxs("select",{value:Pa||(y==null?void 0:y.formato_cierre_caja)||"pos_80mm",onChange:t=>jt(t.target.value),className:"h-9 border border-slate-300 rounded px-2 text-xs font-bold bg-white",title:"Papel del impreso — se recuerda en esta PC",children:[o.jsx("option",{value:"pos_80mm",children:"📑 Ticket 80mm"}),o.jsx("option",{value:"carta",children:"📄 Carta (8.5 x 11)"})]}),o.jsxs(G,{onClick:la,disabled:Oa,className:"bg-morla-blue hover:bg-morla-blue/90 text-white gap-2",children:[Oa?o.jsx(_a,{className:"h-4 w-4 animate-spin"}):o.jsx(Ht,{className:"h-4 w-4"}),"F8 - Grabar y Cerrar ",k?"Caja":"Turno"]})]}),i&&o.jsxs("div",{className:`mt-3 p-3 rounded-lg text-center font-bold text-sm ${A-i.efectivoEnCaja===0?"bg-green-100 text-green-700":A-i.efectivoEnCaja<0?"bg-red-100 text-red-700":"bg-yellow-100 text-yellow-700"}`,children:["Diferencia: ",n(A-i.efectivoEnCaja),A-i.efectivoEnCaja===0&&" ✓ Cuadra",A-i.efectivoEnCaja<0&&" (Faltante)",A-i.efectivoEnCaja>0&&" (Sobrante)"]})]}):o.jsxs("div",{className:"flex-grow flex flex-col items-center justify-center gap-4",children:[o.jsxs(G,{onClick:()=>ea(!0),size:"lg",className:"bg-morla-blue hover:bg-morla-blue/90 text-white px-8 py-6 text-base gap-3 shadow-lg",children:[o.jsx(Xt,{className:"h-5 w-5"}),"Contar Efectivo y Cerrar ",k?"Caja":"Turno"]}),o.jsxs("p",{className:"text-xs text-gray-400 text-center max-w-[260px]",children:["Se cuentan los billetes y al grabar el desglose ",k?"la caja queda cerrada":"el turno queda cerrado","."]})]})})]}):null,o.jsxs("div",{className:"mt-4 border rounded-lg",children:[o.jsxs("button",{type:"button",onClick:()=>gt(t=>!t),className:"w-full flex items-center justify-between px-4 py-2 text-left hover:bg-gray-50 transition-colors",children:[o.jsx("span",{className:"text-sm font-semibold text-gray-700",children:"Cierres anteriores"}),o.jsx(Jt,{className:`h-4 w-4 text-gray-400 transition-transform ${B?"rotate-180":""}`})]}),B&&o.jsxs("div",{className:"border-t max-h-72 overflow-y-auto",children:[Ma.length===0?o.jsx("p",{className:"px-4 py-3 text-sm text-gray-400 italic",children:"No hay cierres grabados."}):o.jsxs(it,{children:[o.jsx(lt,{children:o.jsxs(U,{children:[o.jsx(O,{className:"text-xs",children:"Fecha"}),o.jsx(O,{className:"text-xs",children:"Turno"}),o.jsx(O,{className:"text-xs",children:"Cajero"}),o.jsx(O,{className:"text-xs text-right",children:"Efectivo"}),o.jsx(O,{className:"text-xs text-right",children:"Contado"}),o.jsx(O,{className:"text-xs text-right",children:"Diferencia"}),o.jsx(O,{className:"text-xs text-right",children:" "})]})}),o.jsx(nt,{children:Ma.map(t=>{const a=Number(t.diferencia)||0;return o.jsxs(U,{children:[o.jsx(D,{className:"text-sm py-1.5",children:z(t.fecha)}),o.jsx(D,{className:"text-sm py-1.5",children:t.turno}),o.jsx(D,{className:"text-sm py-1.5 max-w-[160px] truncate",title:t.cajero_nombre,children:t.cajero_nombre}),o.jsx(D,{className:"text-sm py-1.5 text-right font-mono",children:n(t.efectivo_en_caja)}),o.jsx(D,{className:"text-sm py-1.5 text-right font-mono",children:n(t.total_desglose)}),o.jsx(D,{className:`text-sm py-1.5 text-right font-mono ${Math.abs(a)<.005?"text-green-600":a<0?"text-red-600":"text-amber-600"}`,children:n(a)}),o.jsx(D,{className:"text-right py-1.5",children:o.jsxs(G,{size:"sm",variant:"outline",className:"h-7 gap-1.5 text-xs",disabled:Va===t.id,onClick:()=>ut(t),children:[Va===t.id?o.jsx(_a,{className:"h-3.5 w-3.5 animate-spin"}):o.jsx(ct,{className:"h-3.5 w-3.5"})," Reimprimir"]})})]},t.id)})})]}),o.jsx("p",{className:"px-4 py-2 text-[11px] text-gray-400 italic border-t",children:"Sale marcado como reimpresión. Los cierres grabados desde hoy salen idénticos al original; los anteriores reconstruyen el desglose con los movimientos de esa fecha, y el efectivo y el conteo de billetes son siempre los que quedaron grabados."})]})]}),o.jsx("div",{className:"mt-auto pt-4 flex justify-end items-center space-x-4 border-t",children:o.jsxs(G,{variant:"outline",onClick:()=>ta("cierre-caja"),className:"gap-2",children:[o.jsx(Bt,{className:"h-4 w-4"})," ESC - Salir"]})})]})})]})};export{po as default};
