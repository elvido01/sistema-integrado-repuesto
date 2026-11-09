import{Q as qt,R as Vt,aq as kt,r as v,aK as nt,aL as k,bK as Gt,s as N,j as t,H as zt,m as Ut,aQ as Ht,b1 as ct,L as Z,d as z,be as Bt,a1 as Jt,I as Ca,a3 as Na,a4 as Ea,a5 as _a,a6 as wa,a7 as X,k as $a,aP as rt,bi as Qt,ac as Yt,e as Kt,bf as U,X as Wt}from"./index-c531a9e6.js";import{P as Zt,a as Xt,b as ao}from"./popover-d7470bf1.js";import{C as to}from"./calendar-175dd03a.js";import{T as dt,a as pt,b as H,c as R,d as bt,e as D,f as oo}from"./table-02663499.js";import{C as eo}from"./coins-04058263.js";import{P as xt}from"./printer-24b95804.js";import"./index-58dfe4a3.js";import"./index-b1f571bb.js";import"./chevron-left-36c4dff3.js";const Ta=[{label:"2,000",value:2e3},{label:"1,000",value:1e3},{label:"500",value:500},{label:"200",value:200},{label:"100",value:100},{label:"50",value:50},{label:"25",value:25},{label:"20",value:20},{label:"10",value:10},{label:"5",value:5},{label:"1",value:1},{label:"Cent.",value:0},{label:"Tarjetas",value:0,tipo:"tarjeta"},{label:"Cheques",value:0,tipo:"cheque"},{label:"Tarjetas/Cheques",value:0,tipo:"tarjeta"},{label:"Dólares",value:0,tipo:"dolar"},{label:"Tasa del día",value:0,tipo:"tasa"},{label:"Otros",value:0,tipo:"otro"}],so=new Set(["20","Cent.","Otros","Tarjetas","Cheques"]),aa=Ta.filter(p=>!so.has(p.label)),ta=(p,C)=>{const L=Number(C==null?void 0:C[p.label])||0;return p.tipo==="tasa"?0:p.tipo==="dolar"?L*(Number(C==null?void 0:C["Tasa del día"])||0):p.tipo?L:L*p.value},n=p=>new Intl.NumberFormat("es-DO",{style:"decimal",minimumFractionDigits:2,maximumFractionDigits:2}).format(p||0),mt=p=>String(p??"").replace(/[&<>"']/g,C=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[C]),io=p=>String((p==null?void 0:p.estado)||"").toUpperCase()!=="ANULADA",gt=p=>io(p)&&!/ - RECIBO$/i.test(String((p==null?void 0:p.forma_pago)||"")),ft=p=>{const C=String((p==null?void 0:p.forma_pago)||"").toUpperCase(),L=String((p==null?void 0:p.tipo_pago)||"").toUpperCase(),u=String((p==null?void 0:p.notas)||"").toUpperCase();return C==="EFECTIVO"||u.includes("POS_MOVIL")||u.includes("POS MOVIL")||u.includes("MOVIL")||u.includes("MÓVIL")||L.includes("MOVIL")},fo=()=>{const{toast:p}=qt(),{user:C,profile:L,empresa:u,tenantId:E}=Vt(),{closePanel:oa,activePanel:Sa}=kt(),[T,vt]=v.useState(nt()),[B,Da]=v.useState(1),ea=Math.max(1,parseInt(u==null?void 0:u.turnos_caja_dia,10)||1),G=ea<=1,[Oa,ht]=v.useState([]),[S,Aa]=v.useState("ALL"),[J,sa]=v.useState(!1),[jt,Ra]=v.useState({});v.useEffect(()=>{Ra({})},[T,S]);const[Ma,Pa]=v.useState(!1),[ia,Fa]=v.useState(!1),[la,ut]=v.useState(!0),[Ia,yt]=v.useState([]),[Q,Ct]=v.useState(!1),[Y,Nt]=v.useState(null),[La,Et]=v.useState(()=>localStorage.getItem("cierre_caja_paper")||""),_t=o=>{Et(o),localStorage.setItem("cierre_caja_paper",o)},[i,wt]=v.useState(null),[q,K]=v.useState(aa.reduce((o,a)=>({...o,[a.label]:0}),{}));v.useEffect(()=>{(async()=>{const{data:a,error:d}=await N.from("perfiles").select("id, nombre_completo, email").order("nombre_completo");!d&&a&&(ht(a),Aa("ALL"))})()},[C]);const I=v.useCallback(async o=>{const a=!!o;if(!T&&!a)return;a||Fa(!0);const d=o||k(T),{desde:r,hasta:x}=Gt(d);let l=[],m=[],j=[],c=[],_=[],P=[],pa=[],ba=[],F=[];try{let e=N.from("facturas").select("id, total, itbis, subtotal, descuento, forma_pago, tipo_pago, monto_recibido, cambio, fecha, created_at, notas, estado").eq("tenant_id",E).gte("fecha",r).lte("fecha",x);S&&S!=="ALL"&&(e=e.eq("usuario_id",S));const{data:s,error:g}=await e;g?console.warn("Error cargando ventas:",g.message):l=(s||[]).filter(gt);let b=N.from("facturas").select("id, total, itbis, subtotal, descuento, forma_pago, tipo_pago, monto_recibido, cambio, fecha, created_at, notas, estado").eq("tenant_id",E).gte("created_at",r).lte("created_at",x);S&&S!=="ALL"&&(b=b.eq("usuario_id",S));const{data:w,error:f}=await b;if(f)console.warn("Error cargando ventas moviles:",f.message);else{const O=new Set(l.map(h=>h.id)),$=(w||[]).filter(gt).filter(h=>ft(h)&&!O.has(h.id));l=[...l,...$]}}catch(e){console.warn("Exception cargando ventas:",e)}try{const{data:e,error:s}=await N.from("devoluciones").select("total_devolucion, facturas!inner(forma_pago)").eq("tenant_id",E).ilike("facturas.forma_pago","contado").eq("fecha_devolucion",d);s?console.warn("Error cargando devoluciones:",s.message):m=e||[]}catch(e){console.warn("Exception cargando devoluciones:",e)}try{const{data:e,error:s}=await N.from("recibos_ingreso").select("numero, monto_pagado, fecha, created_at, origen, formas_pago, clientes(nombre)").eq("tenant_id",E).eq("anulado",!1).eq("fecha",d);if(s){console.warn("Error cargando recibos por fecha:",s.message);const{data:g,error:b}=await N.from("recibos_ingreso").select("numero, monto_pagado, created_at, origen, formas_pago, clientes(nombre)").eq("tenant_id",E).eq("anulado",!1).gte("created_at",r).lte("created_at",x);b?console.warn("Error cargando recibos por created_at:",b.message):j=g||[]}else j=e||[];console.log(`Recibos encontrados para ${d}:`,j.length,j)}catch(e){console.warn("Exception cargando recibos:",e)}try{const{data:e,error:s}=await N.from("pagos_suplidores").select("monto_pagado, formas_pago").eq("tenant_id",E).eq("anulado",!1).gte("created_at",r).lte("created_at",x);s?console.warn("Error cargando pagos suplidores:",s.message):c=e||[]}catch(e){console.warn("Exception cargando pagos suplidores:",e)}try{const{data:e,error:s}=await N.from("gastos_diarios").select("monto, descripcion, tipo_gasto, afecta_caja, cuenta_bancaria_id, es_tercero, concepto_tercero").eq("tenant_id",E).eq("fecha",d).eq("anulado",!1);if(s)console.warn("Error cargando gastos diarios:",s.message);else{const g=(e||[]).filter(f=>!f.cuenta_bancaria_id&&f.afecta_caja!==!1);P=g.filter(f=>f.es_tercero===!0);const b=f=>/n[oó]mina/i.test(String(f.tipo_gasto||"")),w=g.filter(f=>f.es_tercero!==!0);pa=w.filter(b),_=w.filter(f=>!b(f))}}catch(e){console.warn("Exception cargando gastos diarios:",e)}let xa=0;try{const{data:e,error:s}=await N.from("compras").select("numero, total_compra, forma_pago, estado, pagos, created_at").eq("tenant_id",E).ilike("forma_pago","contado").gte("created_at",r).lte("created_at",x);s?console.warn("Error cargando compras de contado:",s.message):xa=(e||[]).filter(g=>(g.estado||"")!=="ANULADA").reduce((g,b)=>{const w=Array.isArray(b.pagos)?b.pagos:[];return w.length===0?g+(parseFloat(b.total_compra)||0):g+w.filter(f=>String((f==null?void 0:f.tipo)??"01")==="01"||String((f==null?void 0:f.forma)||"").toLowerCase().includes("efectivo")).reduce((f,O)=>f+(parseFloat(O==null?void 0:O.monto)||0),0)},0)}catch(e){console.warn("Exception cargando compras de contado:",e)}try{const{data:e,error:s}=await N.from("prestamos").select("numero, monto_capital, created_at, clientes(nombre)").eq("tenant_id",E).ilike("desembolso","efectivo").gte("created_at",r).lte("created_at",x);s?console.warn("Error cargando préstamos en efectivo:",s.message):ba=e||[]}catch(e){console.warn("Exception cargando préstamos en efectivo:",e)}try{const{data:e,error:s}=await N.from("compromisos").select("id, nombre, monto, tipo, forma_pago, fecha_pago").eq("tenant_id",E).eq("activo",!1).gte("fecha_pago",r).lte("fecha_pago",x);if(s)console.warn("Error cargando compromisos pagados:",s.message);else{F=(e||[]).filter(b=>String(b.forma_pago||"Efectivo").toLowerCase().includes("efectivo"));const g=F.filter(b=>String(b.tipo||"").toLowerCase()==="nomina").map(b=>b.id);if(g.length>0){const{data:b}=await N.from("nominas").select("id, compromiso_id, nomina_detalle(neto, pagado_at, gasto_id, empleados(nombre))").eq("tenant_id",E).in("compromiso_id",g).neq("estado","anulada"),w=(b||[]).flatMap($=>($.nomina_detalle||[]).map(h=>h.gasto_id)).filter(Boolean),f=new Set;if(w.length>0){const{data:$}=await N.from("gastos_diarios").select("id, anulado").in("id",w);for(const h of $||[])h.anulado&&f.add(h.id)}const O={};for(const $ of b||[])O[$.compromiso_id]=($.nomina_detalle||[]).map(h=>{var A;return{nombre:((A=h.empleados)==null?void 0:A.nombre)||"Empleado",monto:Number(h.neto)||0,yaEnGastos:!!h.gasto_id&&!f.has(h.gasto_id),pagadoAt:h.pagado_at||null}}).filter(h=>h.monto>0).sort((h,A)=>A.monto-h.monto);F=F.map($=>{const h=O[$.id]||null,A=(h||[]).filter(V=>V.yaEnGastos).reduce((V,ua)=>V+ua.monto,0);return{...$,empleados:h,cubierto:A,monto_efectivo:Math.max((parseFloat($.monto)||0)-A,0)}})}}}catch(e){console.warn("Exception cargando compromisos pagados:",e)}let ma=[];try{const{data:e,error:s}=await N.from("caja_depositos").select("id, monto_caja, moneda, tasa, monto_cuenta, concepto, cuenta_id, created_at, cuentas_bancarias(banco, alias)").eq("tenant_id",E).eq("fecha",d).eq("anulado",!1).order("created_at");s?console.warn("Error cargando efectivo movido a cuentas:",s.message):ma=(e||[]).map(g=>({...g,cuenta:g.cuentas_bancarias?`${g.cuentas_bancarias.banco}${g.cuentas_bancarias.alias?` — ${g.cuentas_bancarias.alias}`:""}`:"cuenta"}))}catch(e){console.warn("Exception cargando efectivo movido a cuentas:",e)}const ga=l.filter(e=>{const s=String(e.forma_pago||"").toUpperCase();return s==="CONTADO"||s==="EFECTIVO"}),Ua=ga.reduce((e,s)=>e+(parseFloat(s.total)||0),0),Ha=ga.filter(ft).reduce((e,s)=>e+(parseFloat(s.total)||0),0),St=e=>{const s=String(e.tipo_pago||"").toUpperCase();return!s||s.includes("EFECTIVO")},Ba=ga.filter(e=>!St(e)).reduce((e,s)=>e+(parseFloat(s.total)||0),0),Ja=Math.max(0,Ua-Ha-Ba),Dt=l.filter(e=>String(e.forma_pago||"").toUpperCase()==="CREDITO").reduce((e,s)=>e+(parseFloat(s.total)||0),0),Ot=l.reduce((e,s)=>e+(parseFloat(s.total)||0),0),At=l.reduce((e,s)=>e+(parseFloat(s.itbis)||0),0),Rt=l.reduce((e,s)=>e+(parseFloat(s.descuento)||0),0),Qa=m.reduce((e,s)=>e+(parseFloat(s.total_devolucion)||0),0),fa=j.reduce((e,s)=>e+(parseFloat(s.monto_pagado)||0),0),Ya=j.filter(e=>String(e.origen||"").toLowerCase()==="movil").reduce((e,s)=>e+(parseFloat(s.monto_pagado)||0),0),Mt=Math.max(0,fa-Ya),Pt=e=>{const s=Array.isArray(e.formas_pago)?e.formas_pago:null;return!s||!s.length?parseFloat(e.monto_pagado)||0:s.reduce((g,b)=>g+(String(b.forma||"").toLowerCase().includes("efectivo")&&parseFloat(b.monto)||0),0)},va=j.reduce((e,s)=>e+Pt(s),0),Ka=Math.max(0,fa-va),ha=new Map;j.forEach(e=>{(Array.isArray(e.formas_pago)?e.formas_pago:[]).forEach(s=>{var lt;if(String(s.forma||"").toLowerCase().includes("efectivo"))return;const g=parseFloat(s.monto)||0;if(g<=0)return;const b=ya=>String(ya||"").trim().replace(/\s+/g," "),w=s.alias?`${b(s.alias)}${s.banco?` (${b(s.banco)})`:""}`:[b(s.banco),b(s.cuenta)].filter(Boolean).join(" "),f=b(s.forma)||"Otra forma",O=f.charAt(0).toUpperCase()+f.slice(1).toLowerCase(),$=w?`${O} → ${w}`:O,h=$.toUpperCase(),A=ha.get(h)||{etiqueta:$,monto:0,detalle:[]};A.monto+=g;const V=ya=>String(ya||"").replace(/\D/g,""),ua=s.cuenta_id&&/^\d{7}$/.test(String(s.referencia||""))&&V(s.referencia)!==V(e.numero)?s.referencia:null;A.detalle.push({cliente:((lt=e.clientes)==null?void 0:lt.nombre)||"Cliente genérico",recibo:e.numero||"—",pago:ua,monto:g}),ha.set(h,A)})});const W=[...ha.values()].map(e=>({etiqueta:e.etiqueta,monto:e.monto,detalle:e.detalle})),Ft=W.reduce((e,s)=>e+s.monto,0),Wa=Math.round((Ka-Ft)*100)/100;W.length&&Wa>=.01&&W.push({etiqueta:"Sin forma detallada",monto:Wa});const Za=_.reduce((e,s)=>e+(parseFloat(s.monto)||0),0),Xa=P.reduce((e,s)=>e+(parseFloat(s.monto)||0),0),at=pa.reduce((e,s)=>e+(parseFloat(s.monto)||0),0),tt=ba.reduce((e,s)=>e+(parseFloat(s.monto_capital)||0),0),ot=e=>e.monto_efectivo!==void 0?parseFloat(e.monto_efectivo)||0:parseFloat(e.monto)||0;F=F.filter(e=>ot(e)>0);const et=F.reduce((e,s)=>e+ot(s),0),st=ma.reduce((e,s)=>e+(parseFloat(s.monto_caja)||0),0),it=c.reduce((e,s)=>{const g=(s.formas_pago||[]).filter(b=>b.forma==="Efectivo").reduce((b,w)=>b+(parseFloat(w.monto)||0),0);return e+g},0),It=l.filter(e=>e.forma_pago==="CONTADO").reduce((e,s)=>e+(parseFloat(s.cambio)||0),0),Lt=l.length,ja={totalVentas:Ot,totalVentasContado:Ua,totalVentasContadoCaja:Ja,totalVentasContadoMovil:Ha,totalVentasContadoNoEfectivo:Ba,totalVentasCredito:Dt,totalItbis:At,totalDescuento:Rt,totalDevoluciones:Qa,totalRecibos:fa,totalRecibosMovil:Ya,totalRecibosCaja:Mt,totalRecibosEfectivo:va,totalRecibosOtrasFormas:Ka,recibosPorCuenta:W,totalGastosDiarios:Za,gastosDiarios:_,totalPagosTerceros:Xa,pagosTerceros:P,totalPagosNomina:at,pagosNomina:pa,totalPrestamosEfectivo:tt,prestamosEfectivo:ba,totalCompromisosEfectivo:et,compromisosEfectivo:F,totalEfectivoMovido:st,efectivoMovido:ma,totalPagosSuplidores:it,cambioEntregado:It,cantFacturas:Lt,comprasContadoEfectivo:xa,efectivoEnCaja:Ja+va-Qa-it-Za-Xa-at-tt-et-xa-st};return a||(wt(ja),Fa(!1)),ja},[T,S,E]);v.useEffect(()=>{I()},[I]),v.useEffect(()=>{const o=()=>{document.hidden||I()};return window.addEventListener("focus",o),document.addEventListener("visibilitychange",o),()=>{window.removeEventListener("focus",o),document.removeEventListener("visibilitychange",o)}},[I]);const qa=(o,a)=>{if(o.tipo){K(r=>({...r,[o.label]:a}));return}const d=parseInt(a,10);K(r=>({...r,[o.label]:isNaN(d)?0:d}))};v.useEffect(()=>{N.rpc("get_tasa_dia").then(({data:o})=>{const a=Number(o)||0;a>0&&K(d=>Number(d["Tasa del día"])>0?d:{...d,"Tasa del día":a})},()=>{})},[]);const M=v.useMemo(()=>aa.reduce((o,a)=>o+ta(a,q),0),[q]),na=async()=>{var o;Pa(!0);try{const a=S==="ALL"?"Todos los Cajeros":((o=Oa.find(m=>m.id===S))==null?void 0:o.nombre_completo)||"N/A",d={tenant_id:E,fecha:k(T),turno:B,cajero_id:S==="ALL"?C==null?void 0:C.id:S,cajero_nombre:a,total_ventas:(i==null?void 0:i.totalVentas)||0,total_ventas_contado:(i==null?void 0:i.totalVentasContado)||0,total_ventas_contado_caja:(i==null?void 0:i.totalVentasContadoCaja)||0,total_ventas_contado_movil:(i==null?void 0:i.totalVentasContadoMovil)||0,total_ventas_credito:(i==null?void 0:i.totalVentasCredito)||0,total_itbis:(i==null?void 0:i.totalItbis)||0,total_descuento:(i==null?void 0:i.totalDescuento)||0,total_devoluciones:(i==null?void 0:i.totalDevoluciones)||0,total_recibos:(i==null?void 0:i.totalRecibos)||0,total_gastos_diarios:(i==null?void 0:i.totalGastosDiarios)||0,cambio_entregado:(i==null?void 0:i.cambioEntregado)||0,efectivo_en_caja:(i==null?void 0:i.efectivoEnCaja)||0,total_desglose:M,diferencia:M-((i==null?void 0:i.efectivoEnCaja)||0),desglose:Object.fromEntries(Object.entries(q).map(([m,j])=>[m,Number(j)||0])),usuario_id:C==null?void 0:C.id,detalle:i||null},{data:r,error:x}=await N.from("cierres_caja").insert([d]).select("id").single();if(x)throw x;const l=(i==null?void 0:i.efectivoEnCaja)||0;if(Y&&l>0&&(r!=null&&r.id)){const{error:m}=await N.rpc("registrar_movimiento_bancario",{p_cuenta_id:Y,p_tipo:"ENTRADA",p_monto:l,p_concepto:`Cierre de caja — turno ${B} (${k(T)})`,p_referencia:null,p_origen_tipo:"cierre_caja",p_origen_id:r.id,p_fecha:k(T)});m&&p({variant:"destructive",title:"Cierre grabado, pero no se registró en la cuenta",description:m.message})}else l>0&&!Y&&p({variant:"destructive",title:"El efectivo NO entró a ninguna cuenta",description:`Se cerró la caja con ${n(l)} pero no había cuenta seleccionada. Regístralo a mano en Cuentas Bancarias.`});la&&Va(d,i),p({title:"Cierre de Caja",description:`El cierre del turno ${B} ha sido registrado exitosamente.`}),K(m=>({...aa.reduce((j,c)=>({...j,[c.label]:0}),{}),"Tasa del día":m["Tasa del día"]||0})),sa(!1),G||Da(m=>Math.min(m+1,ea)),I()}catch(a){console.error("Error saving cierre:",a),p({variant:"destructive",title:"Error",description:a.message||"No se pudo registrar el cierre de caja."})}finally{Pa(!1)}},y=({label:o,value:a,bold:d,isCount:r,siempre:x})=>x||Number(a)>0?t.jsxs("div",{className:`flex justify-between items-center py-1 ${d?"border-t-2 border-morla-blue pt-2":""}`,children:[t.jsx("span",{className:`text-sm ${d?"font-bold text-morla-blue":"text-gray-600"}`,children:o}),t.jsx("span",{className:`font-mono text-sm ${d?"font-bold text-morla-blue text-base":"text-gray-800"}`,children:r?a:n(a)})]}):null,ca=({label:o,value:a})=>t.jsxs("div",{className:"flex justify-between items-center py-1.5 mt-1 border-t-2 border-gray-800",children:[t.jsx("span",{className:"text-sm font-bold text-gray-800 uppercase tracking-wide",children:o}),t.jsx("span",{className:"font-mono text-sm font-bold text-gray-900",children:n(a)})]}),ra=o=>(Number(o==null?void 0:o.totalGastosDiarios)||0)+(Number(o==null?void 0:o.totalPagosNomina)||0)+(Number(o==null?void 0:o.totalPagosTerceros)||0)+(Number(o==null?void 0:o.totalPrestamosEfectivo)||0)+(Number(o==null?void 0:o.totalPagosSuplidores)||0)+(Number(o==null?void 0:o.totalCompromisosEfectivo)||0)+(Number(o==null?void 0:o.comprasContadoEfectivo)||0)+(Number(o==null?void 0:o.totalDevoluciones)||0),da=o=>(Number((o==null?void 0:o.totalVentasContadoCaja)??(o==null?void 0:o.totalVentasContado))||0)+(Number((o==null?void 0:o.totalRecibosEfectivo)??(o==null?void 0:o.totalRecibos))||0),$t=(o,a)=>{const d=ra(a),r=da(a),x=(l,m,j=!1,c=!1)=>c||Number(m)>0?`<tr${j?' class="bold"':""}><td>${l}</td><td class="num">${n(m)}</td></tr>`:"";return`
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
            <h1>${((u==null?void 0:u.nombre)||"MotoFlow").toUpperCase()}</h1>
            <div class="sub">CIERRE DE CAJA</div>
          </div>
          <div class="meta">
            <div><b>Fecha:</b> ${U(o.fecha)}</div>
            <div><b>Turno:</b> ${o.turno}</div>
            <div><b>Cajero:</b> ${o.cajero_nombre}</div>
            ${o._reimpresion?'<div style="color:#b45309;font-weight:bold">REIMPRESIÓN</div>':""}
          </div>
        </div>
        ${o._reimpresion?`<div style="margin-top:8px;padding:4px 8px;border:1px solid #b45309;color:#b45309;font-size:11px">
          Copia del cierre grabado el ${U(o.created_at||o.fecha)}. No es un cierre nuevo.
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
              ${((a==null?void 0:a.recibosPorCuenta)||[]).map(l=>x(`&nbsp;&nbsp;&nbsp;&nbsp;↳ ${mt(l.etiqueta)}`,l.monto,!1,!0)).join("")}`:""}
            </tbody></table>
            <!-- De todo lo que entró, lo que de verdad llegó a la gaveta. -->
            <div class="linea-fuerte"><span>TOTAL INGRESO EN CAJA</span><span>${n(r)}</span></div>

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
                ${(l.empleados||[]).map(m=>`<tr><td style="padding-left:14px;color:#555">· ${m.nombre}${m.yaEnGastos?` <i>(ya salió ${m.pagadoAt?U(m.pagadoAt):"antes"}, en Gastos)</i>`:""}</td><td class="num" style="color:#555">${n(m.monto)}</td></tr>`).join("")}
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

            <div class="linea-fuerte"><span>GASTO TOTAL</span><span>${n(d)}</span></div>

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
                ${Ta.filter(l=>Number(o.desglose[l.label]||0)>0&&(l.tipo!=="tasa"||Number(o.desglose.Dólares||0)>0)).map(l=>{const m=o.desglose[l.label]||0,j=ta(l,o.desglose);return`<tr><td>${l.label}</td><td class="num">${m}</td><td class="num">${l.tipo==="tasa"?"":n(j)}</td></tr>`}).join("")}
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
    `},Va=(o,a)=>{const d=(La||(u==null?void 0:u.formato_cierre_caja)||"pos_80mm")==="carta",r=ra(a),x=da(a),l=(c,_,P={})=>P.siempre||Number(_)>0?`<div class="row${P.total?" total-row":""}"><span>${c}:</span><span${P.bold?' class="bold"':""}>${n(_)}</span></div>`:"",m=d?$t(o,a):`
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
          <h1 class="bold">${((u==null?void 0:u.nombre)||"MotoFlow").toUpperCase()}</h1>
          <p style="margin: 2px 0; font-size: 13px;">CIERRE DE CAJA</p>
          ${o._reimpresion?'<p class="bold" style="margin:2px 0;font-size:12px;">** REIMPRESION **</p>':""}
        </div>
        <div class="separator"></div>
        <div class="row"><span>Fecha:</span><span>${U(o.fecha)}</span></div>
        <div class="row"><span>Turno:</span><span>${o.turno}</span></div>
        <div class="row"><span>Cajero:</span><span>${o.cajero_nombre}</span></div>
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
        ${((a==null?void 0:a.recibosPorCuenta)||[]).map(c=>l(`&nbsp;&nbsp;&nbsp;&nbsp;↳ ${mt(c.etiqueta)}`,c.monto,{siempre:!0})).join("")}`:""}
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
        <div class="row total-row"><span>GASTO TOTAL:</span><span>${n(r)}</span></div>
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
        ${Ta.filter(c=>Number(o.desglose[c.label]||0)>0&&(c.tipo!=="tasa"||Number(o.desglose.Dólares||0)>0)).map(c=>{const _=o.desglose[c.label]||0,P=ta(c,o.desglose);return`<div class="row">
            <span style="flex: 1;">${c.label}</span>
            <span class="text-right" style="width: 42px;">${_}</span>
            <span class="text-right" style="width: 84px;">${c.tipo==="tasa"?"":n(P)}</span>
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
    `,j=document.createElement("iframe");j.style.cssText="position:fixed;right:0;bottom:0;width:0;height:0;border:0;",document.body.appendChild(j),j.contentWindow.document.open(),j.contentWindow.document.write(m),j.contentWindow.document.close(),setTimeout(()=>{document.body.contains(j)&&document.body.removeChild(j)},3e3)},ka=v.useCallback(async()=>{if(!E)return;const{data:o,error:a}=await N.from("cierres_caja").select("*").eq("tenant_id",E).order("created_at",{ascending:!1}).limit(60);a||yt(o||[])},[E]);v.useEffect(()=>{Q&&ka()},[Q,ka]);const[Ga,za]=v.useState(null),Tt=async o=>{za(o.id);try{const a=!o.detalle,d=o.detalle||await I(o.fecha);if(!d)throw new Error("No se pudo armar el desglose de esa fecha.");const r=Math.abs((Number(d.efectivoEnCaja)||0)-(Number(o.efectivo_en_caja)||0)),x=a?{...d,efectivoEnCaja:o.efectivo_en_caja}:d;Va({...o,_reimpresion:!0,_reconstruido:a,_descuadre:a&&r>.01?d.efectivoEnCaja:null},x)}catch(a){p({variant:"destructive",title:"No se pudo reimprimir",description:a.message})}finally{za(null)}};return v.useEffect(()=>{const o=a=>{Sa==="cierre-caja"&&(a.key==="Escape"&&a.defaultPrevented||(a.key==="F8"&&J&&(a.preventDefault(),na()),a.key==="Escape"&&(a.preventDefault(),J?sa(!1):oa("cierre-caja"))))};return window.addEventListener("keydown",o),()=>window.removeEventListener("keydown",o)},[J,na,oa,Sa]),t.jsxs(t.Fragment,{children:[t.jsx(zt,{children:t.jsx("title",{children:"Cierre de Caja — MotoFlow"})}),t.jsx(Ut.div,{initial:{opacity:0,y:20},animate:{opacity:1,y:0},className:"p-1 md:p-4 bg-gray-100 min-h-full flex flex-col",children:t.jsxs("div",{className:"bg-white p-4 rounded-lg shadow-md flex-grow flex flex-col",children:[t.jsxs("div",{className:"bg-morla-blue text-white py-1.5 rounded-t-lg mb-3 relative",children:[t.jsx("h1",{className:"text-white font-black tracking-[0.25em] italic uppercase text-base drop-shadow-sm text-center",children:"CIERRE DE CAJA"}),t.jsx("button",{type:"button",onClick:()=>I(),disabled:ia,title:"Actualizar los montos del día",className:"absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-white/20 disabled:opacity-50",children:t.jsx(Ht,{className:`w-4 h-4 ${ia?"animate-spin":""}`})})]}),T&&k(T)!==k(nt())&&t.jsxs("div",{className:"mb-3 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900",children:[t.jsxs("b",{children:["Estás cerrando una fecha pasada: ",ct(T,"dd/MM/yyyy"),"."]})," ","Las cifras son las de ese día. Si ya vendiste hoy, el efectivo de la gaveta incluye lo de hoy y no va a cuadrar con el conteo."]}),t.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-4 gap-x-4 gap-y-2 px-3 py-2 border rounded-lg mb-3",children:[t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(Z,{className:"font-bold text-xs shrink-0",children:"Fecha"}),t.jsxs(Zt,{children:[t.jsx(Xt,{asChild:!0,children:t.jsxs(z,{variant:"outline",className:Bt("flex-1 min-w-0 h-8 justify-start text-left font-normal text-sm px-2",!T&&"text-muted-foreground"),children:[t.jsx(Jt,{className:"mr-1.5 h-3.5 w-3.5 shrink-0"}),T?ct(T,"dd/MM/yyyy"):t.jsx("span",{children:"Seleccione"})]})}),t.jsx(ao,{className:"w-auto p-0",children:t.jsx(to,{mode:"single",selected:T,onSelect:vt,initialFocus:!0})})]})]}),!G&&t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(Z,{className:"font-bold text-xs shrink-0",children:"Turno"}),t.jsx(Ca,{type:"number",min:"1",max:ea,value:B,onChange:o=>Da(parseInt(o.target.value,10)||1),onFocus:o=>o.target.select(),className:"flex-1 min-w-0 h-8 text-center font-bold px-2"})]}),t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(Z,{className:"font-bold text-xs shrink-0",children:"Caja"}),t.jsxs(Na,{value:"caja1",disabled:!0,children:[t.jsx(Ea,{className:"flex-1 min-w-0 h-8 text-sm px-2",children:t.jsx(_a,{})}),t.jsx(wa,{children:t.jsx(X,{value:"caja1",children:"Caja No. 1"})})]})]}),t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(Z,{className:"font-bold text-xs shrink-0",children:"Cajero"}),t.jsxs(Na,{value:S,onValueChange:Aa,children:[t.jsx(Ea,{className:"flex-1 min-w-0 h-8 text-sm px-2",children:t.jsx(_a,{placeholder:"Seleccione cajero"})}),t.jsxs(wa,{children:[t.jsx(X,{value:"ALL",className:"font-bold text-morla-blue",children:"📊 Todos los Cajeros (Consolidado)"}),Oa.map(o=>t.jsx(X,{value:o.id,children:o.nombre_completo||o.email},o.id))]})]})]})]}),ia?t.jsx("div",{className:"flex-grow flex items-center justify-center",children:t.jsx($a,{className:"h-8 w-8 animate-spin text-morla-blue"})}):i?t.jsxs("div",{className:"grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4",children:[t.jsxs("div",{className:"border rounded-lg p-4 bg-gradient-to-br from-slate-50 to-blue-50",children:[t.jsx("h2",{className:"font-bold text-sm uppercase text-gray-500 tracking-wider mb-3",children:S==="ALL"?"Resumen Total del Día":"Resumen del Turno"}),t.jsxs("div",{className:"space-y-2",children:[t.jsx(y,{label:"Cantidad de Facturas",value:i.cantFacturas,isCount:!0,siempre:!0}),t.jsx(y,{label:"Ventas Contado Caja",value:i.totalVentasContadoCaja}),t.jsx(y,{label:"Cuenta Contado Móvil",value:i.totalVentasContadoMovil}),t.jsx(y,{label:"Ventas por Transferencia/Tarjeta",value:i.totalVentasContadoNoEfectivo}),t.jsx(y,{label:"Ventas Crédito",value:i.totalVentasCredito}),t.jsx(y,{label:"Total Ventas",value:i.totalVentas,bold:!0}),Number(i.totalRecibosMovil)>0&&t.jsxs(t.Fragment,{children:[t.jsx(y,{label:"Recibos de Ingreso Caja",value:i.totalRecibosCaja}),t.jsx(y,{label:"Recibos de Ingreso Móvil",value:i.totalRecibosMovil})]}),t.jsx(y,{label:"Recibos de Ingreso (total)",value:i.totalRecibos}),Number(i.totalRecibosOtrasFormas)>0&&t.jsxs(t.Fragment,{children:[t.jsx(y,{label:"· Recibos en Efectivo",value:i.totalRecibosEfectivo}),t.jsx(y,{label:"· Recibos Transf/Cheque/Tarjeta",value:i.totalRecibosOtrasFormas}),(i.recibosPorCuenta||[]).map(o=>{const a=!!jt[o.etiqueta],d=(o.detalle||[]).length>0;return t.jsxs("div",{className:"pl-4",children:[t.jsxs("button",{type:"button",disabled:!d,onClick:()=>Ra(r=>({...r,[o.etiqueta]:!r[o.etiqueta]})),className:"flex w-full items-center justify-between py-1 text-left disabled:cursor-default",title:d?"Ver los recibos":void 0,children:[t.jsxs("span",{className:"flex items-center gap-1 text-sm text-gray-600",children:[d&&t.jsx(rt,{className:`h-4 w-4 text-morla-blue transition-transform ${a?"":"-rotate-90"}`}),"↳ ",o.etiqueta,d&&t.jsxs("span",{className:"text-xs text-gray-400",children:["(",o.detalle.length,")"]})]}),t.jsx("span",{className:"font-mono text-sm text-gray-800",children:n(o.monto)})]}),a&&d&&t.jsx("div",{className:"mb-1 ml-5 rounded border border-gray-200 bg-white",children:o.detalle.map((r,x)=>t.jsxs("div",{className:"flex items-center justify-between gap-2 border-b border-gray-100 px-2 py-1 text-xs last:border-b-0",children:[t.jsx("span",{className:"min-w-0 truncate text-gray-700",title:r.cliente,children:r.cliente}),t.jsxs("span",{className:"shrink-0 font-mono text-gray-500",children:[r.recibo,r.pago?` · pago ${r.pago}`:""]}),t.jsx("span",{className:"w-24 shrink-0 text-right font-mono text-gray-800",children:n(r.monto)})]},`${r.recibo}-${x}`))})]},o.etiqueta)})]}),t.jsx(ca,{label:"Total ingreso en caja",value:da(i)}),t.jsx(y,{label:"Gastos Diarios",value:i.totalGastosDiarios}),t.jsx(y,{label:"Nómina (Efectivo)",value:i.totalPagosNomina}),(i.pagosNomina||[]).length>0&&t.jsx("div",{className:"mt-1 mb-1 ml-3 pl-3 border-l-2 border-gray-200",children:i.pagosNomina.map(o=>t.jsxs("div",{className:"flex justify-between items-center py-0.5",children:[t.jsx("span",{className:"text-xs text-gray-500 truncate pr-2",title:o.descripcion,children:String(o.descripcion||"Nómina").split("—").pop().trim()}),t.jsx("span",{className:"font-mono text-xs text-gray-600 shrink-0",children:n(o.monto)})]},o.id||o.descripcion))}),t.jsx(y,{label:"Pagos a terceros (GPS, seguro...)",value:i.totalPagosTerceros}),t.jsx(y,{label:"Préstamos (Efectivo)",value:i.totalPrestamosEfectivo}),t.jsx(y,{label:"Compromisos (Efectivo)",value:i.totalCompromisosEfectivo}),(i.compromisosEfectivo||[]).filter(o=>(o.empleados||[]).length>0).map(o=>t.jsxs("div",{className:"mt-1 mb-1 ml-3 pl-3 border-l-2 border-gray-200",children:[t.jsx("p",{className:"text-[11px] font-semibold text-gray-400 uppercase tracking-wide",children:o.nombre}),o.empleados.map((a,d)=>t.jsxs("div",{className:"flex justify-between items-center py-0.5",children:[t.jsx("span",{className:`text-xs truncate pr-2 ${a.yaEnGastos?"text-gray-400 line-through":"text-gray-500"}`,children:a.nombre}),t.jsx("span",{className:`font-mono text-xs shrink-0 ${a.yaEnGastos?"text-gray-400 line-through":"text-gray-600"}`,children:n(a.monto)})]},`${o.id}-${d}`)),Number(o.cubierto)>0&&t.jsxs("p",{className:"text-[10px] text-amber-700 leading-snug mt-0.5",children:[n(o.cubierto)," ya salió como gasto el día de cada pago; aquí solo entra"," ",n(o.monto_efectivo),"."]})]},o.id)),t.jsx(y,{label:"Devoluciones",value:i.totalDevoluciones}),t.jsx(y,{label:"Pagos a Suplidores (Efectivo)",value:i.totalPagosSuplidores}),t.jsx(y,{label:"Compras de contado (Efectivo)",value:i.comprasContadoEfectivo}),t.jsx(ca,{label:"Gasto total",value:ra(i)}),(i.efectivoMovido||[]).length>0&&t.jsxs(t.Fragment,{children:[t.jsx("div",{className:"mt-2 mb-1 ml-3 pl-3 border-l-2 border-emerald-200",children:i.efectivoMovido.map(o=>t.jsxs("div",{className:"flex justify-between items-center py-0.5",children:[t.jsxs("span",{className:"text-xs text-gray-500 truncate pr-2",children:[o.cuenta,o.moneda&&o.moneda!=="DOP"?` (US$${Number(o.monto_cuenta).toLocaleString("es-DO",{minimumFractionDigits:2})} a ${Number(o.tasa)})`:"",o.concepto?` · ${o.concepto}`:""]}),t.jsx("span",{className:"font-mono text-xs text-gray-600 shrink-0",children:n(o.monto_caja)})]},o.id))}),t.jsx(ca,{label:"Efectivo movido a cuentas (no es gasto)",value:i.totalEfectivoMovido})]}),t.jsxs("div",{className:"flex justify-between items-center py-2 mt-2 bg-morla-blue/10 rounded px-3 border border-morla-blue/30",children:[t.jsx("span",{className:"font-bold text-morla-blue",children:"Efectivo en Caja"}),t.jsx("span",{className:"font-bold text-morla-blue text-lg font-mono",children:n(i.efectivoEnCaja)})]})]})]}),t.jsx("div",{className:"border rounded-lg p-4 flex flex-col",children:J?t.jsxs("div",{className:"flex flex-col h-full",children:[t.jsxs("div",{className:"flex items-center justify-between gap-3 mb-2",children:[t.jsx("h3",{className:"font-bold text-sm uppercase tracking-widest text-gray-600",children:"DESGLOSE DE MONEDAS"}),t.jsxs(Na,{value:"DOP",disabled:!0,children:[t.jsx(Ea,{className:"w-32 h-7 text-xs",children:t.jsx(_a,{})}),t.jsx(wa,{children:t.jsx(X,{value:"DOP",children:"DOP - PESO"})})]})]}),t.jsx(Qt,{className:"flex-grow border rounded-lg max-h-[380px]",children:t.jsxs(dt,{children:[t.jsx(pt,{className:"bg-gray-200 sticky top-0 z-10",children:t.jsxs(H,{className:"h-8",children:[t.jsx(R,{className:"w-20 h-8 py-1 font-bold text-xs",children:"MONEDA"}),t.jsx(R,{className:"w-24 h-8 py-1 font-bold text-center text-xs",children:"CANTIDAD"}),t.jsx(R,{className:"h-8 py-1 text-right font-bold text-xs",children:"VALOR"})]})}),t.jsx(bt,{children:aa.filter(o=>o.tipo!=="tasa").map(o=>{const a=q[o.label]??0,d=ta(o,q);return t.jsxs(H,{className:"hover:bg-yellow-50/50",children:[t.jsx(D,{className:"py-0.5 font-semibold text-right pr-4 text-sm whitespace-nowrap",children:o.label}),t.jsx(D,{className:"py-0.5 text-center",children:t.jsx(Ca,{type:"number",min:"0",step:o.tipo?"0.01":"1",value:a,onChange:r=>qa(o,r.target.value),onFocus:r=>r.target.select(),onClick:r=>r.target.select(),className:"w-20 mx-auto text-center h-6 text-sm px-1"})}),t.jsx(D,{className:"py-0.5 text-right font-mono text-sm",children:o.tipo==="dolar"?t.jsxs("div",{className:"flex items-center justify-end gap-2",children:[t.jsx("span",{className:"text-xs text-gray-600 font-sans font-semibold whitespace-nowrap",children:"Tasa del día"}),t.jsx(Ca,{type:"number",min:"0",step:"0.01",value:q["Tasa del día"]??"",onChange:r=>qa({label:"Tasa del día",tipo:"tasa"},r.target.value),onFocus:r=>r.target.select(),onClick:r=>r.target.select(),className:"w-20 text-center h-6 text-sm px-1"}),t.jsx("span",{className:"min-w-[90px]",children:n(d)})]}):n(d)})]},o.label)})}),t.jsx(oo,{className:"sticky bottom-0 bg-yellow-100 z-10",children:t.jsxs(H,{className:"font-bold",children:[t.jsx(D,{colSpan:2,className:"py-1 text-right text-red-600 uppercase text-sm",children:"TOTAL ==>"}),t.jsx(D,{className:"py-1 text-right text-red-600 font-mono text-base",children:n(M)})]})})]})}),t.jsx("div",{className:"mt-2 px-2.5 py-2 bg-blue-50 border border-blue-200 rounded-lg",children:t.jsx(Yt,{value:Y,onChange:Nt,moneda:"DOP",contexto:"cierre_caja",label:"Depositar en",inline:!0})}),t.jsxs("div",{className:"mt-3 flex items-center justify-between",children:[t.jsxs("label",{className:"flex items-center gap-2 text-sm cursor-pointer",children:[t.jsx("input",{type:"checkbox",checked:la,onChange:o=>ut(o.target.checked),className:"rounded"}),t.jsx(xt,{className:"h-4 w-4"}),"Imprimir ?"]}),la&&t.jsxs("select",{value:La||(u==null?void 0:u.formato_cierre_caja)||"pos_80mm",onChange:o=>_t(o.target.value),className:"h-9 border border-slate-300 rounded px-2 text-xs font-bold bg-white",title:"Papel del impreso — se recuerda en esta PC",children:[t.jsx("option",{value:"pos_80mm",children:"📑 Ticket 80mm"}),t.jsx("option",{value:"carta",children:"📄 Carta (8.5 x 11)"})]}),t.jsxs(z,{onClick:na,disabled:Ma,className:"bg-morla-blue hover:bg-morla-blue/90 text-white gap-2",children:[Ma?t.jsx($a,{className:"h-4 w-4 animate-spin"}):t.jsx(Kt,{className:"h-4 w-4"}),"F8 - Grabar y Cerrar ",G?"Caja":"Turno"]})]}),i&&t.jsxs("div",{className:`mt-3 p-3 rounded-lg text-center font-bold text-sm ${M-i.efectivoEnCaja===0?"bg-green-100 text-green-700":M-i.efectivoEnCaja<0?"bg-red-100 text-red-700":"bg-yellow-100 text-yellow-700"}`,children:["Diferencia: ",n(M-i.efectivoEnCaja),M-i.efectivoEnCaja===0&&" ✓ Cuadra",M-i.efectivoEnCaja<0&&" (Faltante)",M-i.efectivoEnCaja>0&&" (Sobrante)"]})]}):t.jsxs("div",{className:"flex-grow flex flex-col items-center justify-center gap-4",children:[t.jsxs(z,{onClick:()=>sa(!0),size:"lg",className:"bg-morla-blue hover:bg-morla-blue/90 text-white px-8 py-6 text-base gap-3 shadow-lg",children:[t.jsx(eo,{className:"h-5 w-5"}),"Contar Efectivo y Cerrar ",G?"Caja":"Turno"]}),t.jsxs("p",{className:"text-xs text-gray-400 text-center max-w-[260px]",children:["Se cuentan los billetes y al grabar el desglose ",G?"la caja queda cerrada":"el turno queda cerrado","."]})]})})]}):null,t.jsxs("div",{className:"mt-4 border rounded-lg",children:[t.jsxs("button",{type:"button",onClick:()=>Ct(o=>!o),className:"w-full flex items-center justify-between px-4 py-2 text-left hover:bg-gray-50 transition-colors",children:[t.jsx("span",{className:"text-sm font-semibold text-gray-700",children:"Cierres anteriores"}),t.jsx(rt,{className:`h-4 w-4 text-gray-400 transition-transform ${Q?"rotate-180":""}`})]}),Q&&t.jsxs("div",{className:"border-t max-h-72 overflow-y-auto",children:[Ia.length===0?t.jsx("p",{className:"px-4 py-3 text-sm text-gray-400 italic",children:"No hay cierres grabados."}):t.jsxs(dt,{children:[t.jsx(pt,{children:t.jsxs(H,{children:[t.jsx(R,{className:"text-xs",children:"Fecha"}),t.jsx(R,{className:"text-xs",children:"Turno"}),t.jsx(R,{className:"text-xs",children:"Cajero"}),t.jsx(R,{className:"text-xs text-right",children:"Efectivo"}),t.jsx(R,{className:"text-xs text-right",children:"Contado"}),t.jsx(R,{className:"text-xs text-right",children:"Diferencia"}),t.jsx(R,{className:"text-xs text-right",children:" "})]})}),t.jsx(bt,{children:Ia.map(o=>{const a=Number(o.diferencia)||0;return t.jsxs(H,{children:[t.jsx(D,{className:"text-sm py-1.5",children:U(o.fecha)}),t.jsx(D,{className:"text-sm py-1.5",children:o.turno}),t.jsx(D,{className:"text-sm py-1.5 max-w-[160px] truncate",title:o.cajero_nombre,children:o.cajero_nombre}),t.jsx(D,{className:"text-sm py-1.5 text-right font-mono",children:n(o.efectivo_en_caja)}),t.jsx(D,{className:"text-sm py-1.5 text-right font-mono",children:n(o.total_desglose)}),t.jsx(D,{className:`text-sm py-1.5 text-right font-mono ${Math.abs(a)<.005?"text-green-600":a<0?"text-red-600":"text-amber-600"}`,children:n(a)}),t.jsx(D,{className:"text-right py-1.5",children:t.jsxs(z,{size:"sm",variant:"outline",className:"h-7 gap-1.5 text-xs",disabled:Ga===o.id,onClick:()=>Tt(o),children:[Ga===o.id?t.jsx($a,{className:"h-3.5 w-3.5 animate-spin"}):t.jsx(xt,{className:"h-3.5 w-3.5"})," Reimprimir"]})})]},o.id)})})]}),t.jsx("p",{className:"px-4 py-2 text-[11px] text-gray-400 italic border-t",children:"Sale marcado como reimpresión. Los cierres grabados desde hoy salen idénticos al original; los anteriores reconstruyen el desglose con los movimientos de esa fecha, y el efectivo y el conteo de billetes son siempre los que quedaron grabados."})]})]}),t.jsx("div",{className:"mt-auto pt-4 flex justify-end items-center space-x-4 border-t",children:t.jsxs(z,{variant:"outline",onClick:()=>oa("cierre-caja"),className:"gap-2",children:[t.jsx(Wt,{className:"h-4 w-4"})," ESC - Salir"]})})]})})]})};export{fo as default};
