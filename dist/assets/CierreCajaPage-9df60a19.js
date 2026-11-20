import{V as po,W as bo,aC as xo,r as f,aX as At,aY as X,bW as mo,s as w,j as t,H as fo,m as go,b0 as vo,bc as Ot,L as la,d as na,bp as ho,a6 as jo,I as Ja,a8 as _a,a9 as Na,aa as ya,ab as Ea,ac as ra,k as Wa,a5 as Rt,bt as uo,as as _o,e as No,bq as ca,X as yo}from"./index-a017d941.js";import{P as Eo,a as Co,b as wo}from"./popover-37f69fd5.js";import{C as $o}from"./calendar-17cf7215.js";import{T as Mt,a as Ft,b as da,c as q,d as Pt,e as R,f as To}from"./table-5aafbf9a.js";import{c as It}from"./AbrirCajaModal-476c38ae.js";import{C as So}from"./coins-00d538dc.js";import{P as Lt}from"./printer-f036fd18.js";import"./index-249996d3.js";import"./index-4bc71a14.js";import"./chevron-left-fa5bab7e.js";import"./lock-open-02ca3a63.js";const Ya=[{label:"2,000",value:2e3},{label:"1,000",value:1e3},{label:"500",value:500},{label:"200",value:200},{label:"100",value:100},{label:"50",value:50},{label:"25",value:25},{label:"20",value:20},{label:"10",value:10},{label:"5",value:5},{label:"1",value:1},{label:"Cent.",value:0},{label:"Tarjetas",value:0,tipo:"tarjeta"},{label:"Cheques",value:0,tipo:"cheque"},{label:"Tarjetas/Cheques",value:0,tipo:"tarjeta"},{label:"Dólares",value:0,tipo:"dolar"},{label:"Tasa del día",value:0,tipo:"tasa"},{label:"Otros",value:0,tipo:"otro"}],Do=new Set(["20","Cent.","Otros","Tarjetas","Cheques"]),Ca=Ya.filter(b=>!Do.has(b.label)),wa=(b,v)=>{const Z=Number(v==null?void 0:v[b.label])||0;return b.tipo==="tasa"?0:b.tipo==="dolar"?Z*(Number(v==null?void 0:v["Tasa del día"])||0):b.tipo?Z:Z*b.value},n=b=>new Intl.NumberFormat("es-DO",{style:"decimal",minimumFractionDigits:2,maximumFractionDigits:2}).format(b||0),Vt=b=>String(b??"").replace(/[&<>"']/g,v=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[v]),Ao=b=>String((b==null?void 0:b.estado)||"").toUpperCase()!=="ANULADA",qt=b=>Ao(b)&&!/ - RECIBO$/i.test(String((b==null?void 0:b.forma_pago)||"")),kt=b=>{const v=String((b==null?void 0:b.forma_pago)||"").toUpperCase(),Z=String((b==null?void 0:b.tipo_pago)||"").toUpperCase(),y=String((b==null?void 0:b.notas)||"").toUpperCase();return v==="EFECTIVO"||y.includes("POS_MOVIL")||y.includes("POS MOVIL")||y.includes("MOVIL")||y.includes("MÓVIL")||Z.includes("MOVIL")},zo=()=>{const{toast:b}=po(),{user:v,profile:Z,empresa:y,tenantId:C}=bo(),{closePanel:$a,activePanel:pa}=xo(),[$,Gt]=f.useState(At()),[ba,Ta]=f.useState(1),Sa=Math.max(1,parseInt(y==null?void 0:y.turnos_caja_dia,10)||1),sa=Sa<=1,[p,Qa]=f.useState(null),ia=$?X($):null;f.useEffect(()=>{if(pa!=="cierre-caja"||!ia)return;let o=!0;return It(ia).then(a=>{o&&Qa(a)}),()=>{o=!1}},[pa,C,ia]);const z=(p==null?void 0:p.modo)==="apertura",k=(p==null?void 0:p.modo)==="varias",[Da,Aa]=f.useState(null),K=f.useMemo(()=>k?[...(p==null?void 0:p.abiertas)||[],...(p==null?void 0:p.recientes)||[]].filter(o=>(p==null?void 0:p.es_admin)||o.cajero_id===(v==null?void 0:v.id)):[],[k,p,v==null?void 0:v.id]),u=K.find(o=>o.apertura_id===Da)||null;f.useEffect(()=>{if(!k){Aa(null);return}Aa(o=>{if(o&&K.some(d=>d.apertura_id===o))return o;const a=K.filter(d=>!d.cerrada);return(a.find(d=>d.cajero_id===(v==null?void 0:v.id))||a[0]||{}).apertura_id||null})},[k,K,v==null?void 0:v.id]);const Oa=!!p&&p.fecha===ia;f.useEffect(()=>{z&&Oa&&(p!=null&&p.turno)&&Ta(p.turno)},[z,Oa,p==null?void 0:p.turno]);const Xa=f.useRef(0),[Za,zt]=f.useState([]),[M,Ka]=f.useState("ALL"),[xa,Ra]=f.useState(!1),[Ut,at]=f.useState({});f.useEffect(()=>{at({})},[$,M,Da]);const[tt,ot]=f.useState(!1),[Ma,et]=f.useState(!1),[Fa,Ht]=f.useState(!0),[st,Bt]=f.useState([]),[ma,Jt]=f.useState(!1),[fa,Wt]=f.useState(null),[it,Yt]=f.useState(()=>localStorage.getItem("cierre_caja_paper")||""),Qt=o=>{Yt(o),localStorage.setItem("cierre_caja_paper",o)},[i,Xt]=f.useState(null),[aa,ga]=f.useState(Ca.reduce((o,a)=>({...o,[a.label]:0}),{}));f.useEffect(()=>{(async()=>{const{data:a,error:r}=await w.from("perfiles").select("id, nombre_completo, email").order("nombre_completo");!r&&a&&(zt(a),Ka("ALL"))})()},[v]);const U=f.useCallback(async o=>{const a=!!o;if(!$&&!a)return;a||et(!0);const r=!a&&(p==null?void 0:p.modo)==="varias"?u:null,d=o||(r?r.fecha:X($)),{desde:x,hasta:l}=mo(d),N=!a&&((p==null?void 0:p.modo)==="apertura"&&(p==null?void 0:p.fecha)===d||!!r),_=a?null:++Xa.current,c=r?r.desde||null:N&&p.desde||null,T=r?Number(r.fondo)||0:N&&Number(p.fondo)||0,F=(r==null?void 0:r.cajero_id)||null,va=F||(M&&M!=="ALL"?M:null),qa=(r==null?void 0:r.hasta)||null,P=e=>(!c||!!e&&new Date(e)>=new Date(c))&&(!qa||!!e&&new Date(e)<new Date(qa));let A=[],ta=[],O=[],oa=[],B=[],J=[],W=[],Y=[],I=[];try{let e=w.from("facturas").select("id, total, itbis, subtotal, descuento, forma_pago, tipo_pago, monto_recibido, cambio, fecha, created_at, notas, estado, retenido_no_cobrado").eq("tenant_id",C).gte("fecha",x).lte("fecha",l);va&&(e=e.eq("usuario_id",va));const{data:s,error:g}=await e;g?console.warn("Error cargando ventas:",g.message):A=(s||[]).filter(qt);let m=w.from("facturas").select("id, total, itbis, subtotal, descuento, forma_pago, tipo_pago, monto_recibido, cambio, fecha, created_at, notas, estado, retenido_no_cobrado").eq("tenant_id",C).gte("created_at",x).lte("created_at",l);va&&(m=m.eq("usuario_id",va));const{data:S,error:h}=await m;if(h)console.warn("Error cargando ventas moviles:",h.message);else{const L=new Set(A.map(j=>j.id)),D=(S||[]).filter(qt).filter(j=>kt(j)&&!L.has(j.id));A=[...A,...D]}}catch(e){console.warn("Exception cargando ventas:",e)}try{const{data:e,error:s}=await w.from("devoluciones").select("total_devolucion, created_at, usuario_id, facturas!inner(forma_pago)").eq("tenant_id",C).ilike("facturas.forma_pago","contado").eq("fecha_devolucion",d);s?console.warn("Error cargando devoluciones:",s.message):ta=e||[]}catch(e){console.warn("Exception cargando devoluciones:",e)}try{const{data:e,error:s}=await w.from("recibos_ingreso").select("numero, monto_pagado, fecha, created_at, origen, formas_pago, usuario_id, clientes(nombre)").eq("tenant_id",C).eq("anulado",!1).eq("fecha",d);if(s){console.warn("Error cargando recibos por fecha:",s.message);const{data:g,error:m}=await w.from("recibos_ingreso").select("numero, monto_pagado, created_at, origen, formas_pago, usuario_id, clientes(nombre)").eq("tenant_id",C).eq("anulado",!1).gte("created_at",x).lte("created_at",l);m?console.warn("Error cargando recibos por created_at:",m.message):O=g||[]}else O=e||[];console.log(`Recibos encontrados para ${d}:`,O.length,O)}catch(e){console.warn("Exception cargando recibos:",e)}try{const{data:e,error:s}=await w.from("pagos_suplidores").select("monto_pagado, formas_pago, created_at, usuario_id").eq("tenant_id",C).eq("anulado",!1).gte("created_at",x).lte("created_at",l);s?console.warn("Error cargando pagos suplidores:",s.message):oa=e||[]}catch(e){console.warn("Exception cargando pagos suplidores:",e)}try{const{data:e,error:s}=await w.from("gastos_diarios").select("monto, descripcion, tipo_gasto, afecta_caja, cuenta_bancaria_id, es_tercero, concepto_tercero, created_at, usuario_id").eq("tenant_id",C).eq("fecha",d).eq("anulado",!1);if(s)console.warn("Error cargando gastos diarios:",s.message);else{const g=(e||[]).filter(h=>!h.cuenta_bancaria_id&&h.afecta_caja!==!1);J=g.filter(h=>h.es_tercero===!0);const m=h=>/n[oó]mina/i.test(String(h.tipo_gasto||"")),S=g.filter(h=>h.es_tercero!==!0);W=S.filter(m),B=S.filter(h=>!m(h))}}catch(e){console.warn("Exception cargando gastos diarios:",e)}let ka=0;try{const{data:e,error:s}=await w.from("compras").select("numero, total_compra, forma_pago, estado, pagos, created_at, usuario_id").eq("tenant_id",C).ilike("forma_pago","contado").gte("created_at",x).lte("created_at",l);s?console.warn("Error cargando compras de contado:",s.message):ka=(e||[]).filter(g=>(g.estado||"")!=="ANULADA"&&P(g.created_at)&&(!F||g.usuario_id===F)).reduce((g,m)=>{const S=Array.isArray(m.pagos)?m.pagos:[];return S.length===0?g+(parseFloat(m.total_compra)||0):g+S.filter(h=>String((h==null?void 0:h.tipo)??"01")==="01"||String((h==null?void 0:h.forma)||"").toLowerCase().includes("efectivo")).reduce((h,L)=>h+(parseFloat(L==null?void 0:L.monto)||0),0)},0)}catch(e){console.warn("Exception cargando compras de contado:",e)}try{const{data:e,error:s}=await w.from("prestamos").select("numero, monto_capital, created_at, created_by, clientes(nombre)").eq("tenant_id",C).ilike("desembolso","efectivo").gte("created_at",x).lte("created_at",l);s?console.warn("Error cargando préstamos en efectivo:",s.message):Y=e||[]}catch(e){console.warn("Exception cargando préstamos en efectivo:",e)}try{const{data:e,error:s}=await w.from("compromisos").select("id, nombre, monto, tipo, forma_pago, fecha_pago").eq("tenant_id",C).eq("activo",!1).gte("fecha_pago",x).lte("fecha_pago",l);if(s)console.warn("Error cargando compromisos pagados:",s.message);else{I=(e||[]).filter(m=>String(m.forma_pago||"Efectivo").toLowerCase().includes("efectivo"));const g=I.filter(m=>String(m.tipo||"").toLowerCase()==="nomina").map(m=>m.id);if(g.length>0){const{data:m}=await w.from("nominas").select("id, compromiso_id, nomina_detalle(neto, pagado_at, gasto_id, empleados(nombre))").eq("tenant_id",C).in("compromiso_id",g).neq("estado","anulada"),S=(m||[]).flatMap(D=>(D.nomina_detalle||[]).map(j=>j.gasto_id)).filter(Boolean),h=new Set;if(S.length>0){const{data:D}=await w.from("gastos_diarios").select("id, anulado").in("id",S);for(const j of D||[])j.anulado&&h.add(j.id)}const L={};for(const D of m||[])L[D.compromiso_id]=(D.nomina_detalle||[]).map(j=>{var V;return{nombre:((V=j.empleados)==null?void 0:V.nombre)||"Empleado",monto:Number(j.neto)||0,yaEnGastos:!!j.gasto_id&&!h.has(j.gasto_id),pagadoAt:j.pagado_at||null}}).filter(j=>j.monto>0).sort((j,V)=>V.monto-j.monto);I=I.map(D=>{const j=L[D.id]||null,V=(j||[]).filter(ea=>ea.yaEnGastos).reduce((ea,Ha)=>ea+Ha.monto,0);return{...D,empleados:j,cubierto:V,monto_efectivo:Math.max((parseFloat(D.monto)||0)-V,0)}})}}}catch(e){console.warn("Exception cargando compromisos pagados:",e)}let Q=[];try{const{data:e,error:s}=await w.from("caja_depositos").select("id, monto_caja, moneda, tasa, monto_cuenta, concepto, cuenta_id, created_at, created_by, cuentas_bancarias(banco, alias)").eq("tenant_id",C).eq("fecha",d).eq("anulado",!1).order("created_at");s?console.warn("Error cargando efectivo movido a cuentas:",s.message):Q=(e||[]).map(g=>({...g,cuenta:g.cuentas_bancarias?`${g.cuentas_bancarias.banco}${g.cuentas_bancarias.alias?` — ${g.cuentas_bancarias.alias}`:""}`:"cuenta"}))}catch(e){console.warn("Exception cargando efectivo movido a cuentas:",e)}if((c||qa)&&(A=A.filter(e=>P(e.created_at)),ta=ta.filter(e=>P(e.created_at)),O=O.filter(e=>P(e.created_at)),oa=oa.filter(e=>P(e.created_at)),B=B.filter(e=>P(e.created_at)),J=J.filter(e=>P(e.created_at)),W=W.filter(e=>P(e.created_at)),Y=Y.filter(e=>P(e.created_at)),I=I.filter(e=>P(e.fecha_pago)),Q=Q.filter(e=>P(e.created_at))),F){const e=s=>s===F;ta=ta.filter(s=>e(s.usuario_id)),O=O.filter(s=>e(s.usuario_id)),oa=oa.filter(s=>e(s.usuario_id)),B=B.filter(s=>e(s.usuario_id)),J=J.filter(s=>e(s.usuario_id)),W=W.filter(s=>e(s.usuario_id)),Y=Y.filter(s=>e(s.created_by)),Q=Q.filter(s=>e(s.created_by)),I=[]}const ha=A.filter(e=>{const s=String(e.forma_pago||"").toUpperCase();return s==="CONTADO"||s==="EFECTIVO"}),pt=ha.reduce((e,s)=>e+(parseFloat(s.total)||0),0),bt=e=>Math.min(parseFloat(e.retenido_no_cobrado)||0,parseFloat(e.total)||0),xt=e=>Math.max(0,(parseFloat(e.total)||0)-bt(e)),mt=ha.reduce((e,s)=>e+bt(s),0),ft=ha.filter(kt).reduce((e,s)=>e+xt(s),0),ao=e=>{const s=String(e.tipo_pago||"").toUpperCase();return!s||s.includes("EFECTIVO")},gt=ha.filter(e=>!ao(e)).reduce((e,s)=>e+xt(s),0),vt=Math.max(0,pt-mt-ft-gt),to=A.filter(e=>String(e.forma_pago||"").toUpperCase()==="CREDITO").reduce((e,s)=>e+(parseFloat(s.total)||0),0),oo=A.reduce((e,s)=>e+(parseFloat(s.total)||0),0),eo=A.reduce((e,s)=>e+(parseFloat(s.itbis)||0),0),so=A.reduce((e,s)=>e+(parseFloat(s.descuento)||0),0),ht=ta.reduce((e,s)=>e+(parseFloat(s.total_devolucion)||0),0),Ga=O.reduce((e,s)=>e+(parseFloat(s.monto_pagado)||0),0),jt=O.filter(e=>String(e.origen||"").toLowerCase()==="movil").reduce((e,s)=>e+(parseFloat(s.monto_pagado)||0),0),io=Math.max(0,Ga-jt),lo=e=>{const s=Array.isArray(e.formas_pago)?e.formas_pago:null;return!s||!s.length?parseFloat(e.monto_pagado)||0:s.reduce((g,m)=>g+(String(m.forma||"").toLowerCase().includes("efectivo")&&parseFloat(m.monto)||0),0)},za=O.reduce((e,s)=>e+lo(s),0),ut=Math.max(0,Ga-za),Ua=new Map;O.forEach(e=>{(Array.isArray(e.formas_pago)?e.formas_pago:[]).forEach(s=>{var Dt;if(String(s.forma||"").toLowerCase().includes("efectivo"))return;const g=parseFloat(s.monto)||0;if(g<=0)return;const m=Ba=>String(Ba||"").trim().replace(/\s+/g," "),S=s.alias?`${m(s.alias)}${s.banco?` (${m(s.banco)})`:""}`:[m(s.banco),m(s.cuenta)].filter(Boolean).join(" "),h=m(s.forma)||"Otra forma",L=h.charAt(0).toUpperCase()+h.slice(1).toLowerCase(),D=S?`${L} → ${S}`:L,j=D.toUpperCase(),V=Ua.get(j)||{etiqueta:D,monto:0,detalle:[]};V.monto+=g;const ea=Ba=>String(Ba||"").replace(/\D/g,""),Ha=s.cuenta_id&&/^\d{7}$/.test(String(s.referencia||""))&&ea(s.referencia)!==ea(e.numero)?s.referencia:null;V.detalle.push({cliente:((Dt=e.clientes)==null?void 0:Dt.nombre)||"Cliente genérico",recibo:e.numero||"—",pago:Ha,monto:g}),Ua.set(j,V)})});const ja=[...Ua.values()].map(e=>({etiqueta:e.etiqueta,monto:e.monto,detalle:e.detalle})),no=ja.reduce((e,s)=>e+s.monto,0),_t=Math.round((ut-no)*100)/100;ja.length&&_t>=.01&&ja.push({etiqueta:"Sin forma detallada",monto:_t});const Nt=B.reduce((e,s)=>e+(parseFloat(s.monto)||0),0),yt=J.reduce((e,s)=>e+(parseFloat(s.monto)||0),0),Et=W.reduce((e,s)=>e+(parseFloat(s.monto)||0),0),Ct=Y.reduce((e,s)=>e+(parseFloat(s.monto_capital)||0),0),wt=e=>e.monto_efectivo!==void 0?parseFloat(e.monto_efectivo)||0:parseFloat(e.monto)||0;I=I.filter(e=>wt(e)>0);const $t=I.reduce((e,s)=>e+wt(s),0),Tt=Q.reduce((e,s)=>e+(parseFloat(s.monto_caja)||0),0),St=oa.reduce((e,s)=>{const g=(s.formas_pago||[]).filter(m=>m.forma==="Efectivo").reduce((m,S)=>m+(parseFloat(S.monto)||0),0);return e+g},0),ro=A.filter(e=>e.forma_pago==="CONTADO").reduce((e,s)=>e+(parseFloat(s.cambio)||0),0),co=A.length,ua={totalVentas:oo,totalVentasContado:pt,totalVentasContadoCaja:vt,totalVentasContadoMovil:ft,totalVentasContadoNoEfectivo:gt,totalRetencionesContado:mt,totalVentasCredito:to,totalItbis:eo,totalDescuento:so,totalDevoluciones:ht,totalRecibos:Ga,totalRecibosMovil:jt,totalRecibosCaja:io,totalRecibosEfectivo:za,totalRecibosOtrasFormas:ut,recibosPorCuenta:ja,totalGastosDiarios:Nt,gastosDiarios:B,totalPagosTerceros:yt,pagosTerceros:J,totalPagosNomina:Et,pagosNomina:W,totalPrestamosEfectivo:Ct,prestamosEfectivo:Y,totalCompromisosEfectivo:$t,compromisosEfectivo:I,totalEfectivoMovido:Tt,efectivoMovido:Q,totalPagosSuplidores:St,cambioEntregado:ro,cantFacturas:co,comprasContadoEfectivo:ka,fondoApertura:T,desde:c,...r?{caja:{apertura_id:r.apertura_id,caja_id:r.caja_id,nombre:r.caja_nombre,cajero_id:r.cajero_id,cajero:r.cajero_nombre}}:{},efectivoEnCaja:vt+za-ht-St-Nt-yt-Et-Ct-$t-ka-Tt};return a||_!==Xa.current||(Xt(ua),et(!1)),ua},[$,M,C,p,u]);f.useEffect(()=>{U()},[U]),f.useEffect(()=>{const o=()=>{document.hidden||U()};return window.addEventListener("focus",o),document.addEventListener("visibilitychange",o),()=>{window.removeEventListener("focus",o),document.removeEventListener("visibilitychange",o)}},[U]);const lt=(o,a)=>{if(o.tipo){ga(d=>({...d,[o.label]:a}));return}const r=parseInt(a,10);ga(d=>({...d,[o.label]:isNaN(r)?0:r}))};f.useEffect(()=>{w.rpc("get_tasa_dia").then(({data:o})=>{const a=Number(o)||0;a>0&&ga(r=>Number(r["Tasa del día"])>0?r:{...r,"Tasa del día":a})},()=>{})},[]);const G=f.useMemo(()=>Ca.reduce((o,a)=>o+wa(a,aa),0),[aa]),H=((i==null?void 0:i.efectivoEnCaja)||0)+((i==null?void 0:i.fondoApertura)||0),Pa=async()=>{var o,a;if(k&&!u){b({variant:"destructive",title:"Escoge la caja",description:"Con varias cajas se cierra una caja a la vez: escoge cuál vas a cerrar."});return}if(k&&((o=i==null?void 0:i.caja)==null?void 0:o.apertura_id)!==u.apertura_id){b({variant:"destructive",title:"Un momento",description:"Todavía se están calculando los montos de esa caja. Vuelve a intentar."});return}if(z&&!Oa){b({variant:"destructive",title:"Un momento",description:"Todavía se está leyendo el turno de la caja de ese día. Vuelve a intentar."});return}ot(!0);try{const r=M==="ALL"?"Todos los Cajeros":((a=Za.find(_=>_.id===M))==null?void 0:a.nombre_completo)||"N/A",d={tenant_id:C,fecha:u?u.fecha:X($),turno:u?u.turno:ba,cajero_id:u?u.cajero_id:M==="ALL"?v==null?void 0:v.id:M,cajero_nombre:u?`${u.caja_nombre} — ${u.cajero_nombre||""}`:r,total_ventas:(i==null?void 0:i.totalVentas)||0,total_ventas_contado:(i==null?void 0:i.totalVentasContado)||0,total_ventas_contado_caja:(i==null?void 0:i.totalVentasContadoCaja)||0,total_ventas_contado_movil:(i==null?void 0:i.totalVentasContadoMovil)||0,total_ventas_credito:(i==null?void 0:i.totalVentasCredito)||0,total_itbis:(i==null?void 0:i.totalItbis)||0,total_descuento:(i==null?void 0:i.totalDescuento)||0,total_devoluciones:(i==null?void 0:i.totalDevoluciones)||0,total_recibos:(i==null?void 0:i.totalRecibos)||0,total_gastos_diarios:(i==null?void 0:i.totalGastosDiarios)||0,cambio_entregado:(i==null?void 0:i.cambioEntregado)||0,efectivo_en_caja:((i==null?void 0:i.efectivoEnCaja)||0)+((i==null?void 0:i.fondoApertura)||0),total_desglose:G,diferencia:G-(((i==null?void 0:i.efectivoEnCaja)||0)+((i==null?void 0:i.fondoApertura)||0)),desglose:Object.fromEntries(Object.entries(aa).map(([_,c])=>[_,Number(c)||0])),usuario_id:v==null?void 0:v.id,detalle:i||null},{data:x,error:l}=await w.from("cierres_caja").insert([d]).select("id").single();if(l)throw l;const N=(i==null?void 0:i.efectivoEnCaja)||0;if(fa&&N>0&&(x!=null&&x.id)){const{error:_}=await w.rpc("registrar_movimiento_bancario",{p_cuenta_id:fa,p_tipo:"ENTRADA",p_monto:N,p_concepto:u?`Cierre de ${u.caja_nombre} — turno ${u.turno} (${u.fecha})`:`Cierre de caja — turno ${ba} (${X($)})`,p_referencia:null,p_origen_tipo:"cierre_caja",p_origen_id:x.id,p_fecha:u?u.fecha:X($)});_&&b({variant:"destructive",title:"Cierre grabado, pero no se registró en la cuenta",description:_.message})}else N>0&&!fa&&b({variant:"destructive",title:"El efectivo NO entró a ninguna cuenta",description:`Se cerró la caja con ${n(N)} pero no había cuenta seleccionada. Regístralo a mano en Cuentas Bancarias.`});Fa&&nt(d,i),b({title:"Cierre de Caja",description:u?`El cierre de ${u.caja_nombre} quedó registrado.`:`El cierre del turno ${ba} ha sido registrado exitosamente.`}),ga(_=>({...Ca.reduce((c,T)=>({...c,[T.label]:0}),{}),"Tasa del día":_["Tasa del día"]||0})),Ra(!1),!sa&&!z&&Ta(_=>Math.min(_+1,Sa)),(z||k)&&It(ia).then(Qa),U()}catch(r){console.error("Error saving cierre:",r),b({variant:"destructive",title:"Error",description:r.message||"No se pudo registrar el cierre de caja."})}finally{ot(!1)}},E=({label:o,value:a,bold:r,isCount:d,siempre:x})=>x||Number(a)>0?t.jsxs("div",{className:`flex justify-between items-center py-1 ${r?"border-t-2 border-morla-blue pt-2":""}`,children:[t.jsx("span",{className:`text-sm ${r?"font-bold text-morla-blue":"text-gray-600"}`,children:o}),t.jsx("span",{className:`font-mono text-sm ${r?"font-bold text-morla-blue text-base":"text-gray-800"}`,children:d?a:n(a)})]}):null,Ia=({label:o,value:a})=>t.jsxs("div",{className:"flex justify-between items-center py-1.5 mt-1 border-t-2 border-gray-800",children:[t.jsx("span",{className:"text-sm font-bold text-gray-800 uppercase tracking-wide",children:o}),t.jsx("span",{className:"font-mono text-sm font-bold text-gray-900",children:n(a)})]}),La=o=>(Number(o==null?void 0:o.totalGastosDiarios)||0)+(Number(o==null?void 0:o.totalPagosNomina)||0)+(Number(o==null?void 0:o.totalPagosTerceros)||0)+(Number(o==null?void 0:o.totalPrestamosEfectivo)||0)+(Number(o==null?void 0:o.totalPagosSuplidores)||0)+(Number(o==null?void 0:o.totalCompromisosEfectivo)||0)+(Number(o==null?void 0:o.comprasContadoEfectivo)||0)+(Number(o==null?void 0:o.totalDevoluciones)||0),Va=o=>(Number((o==null?void 0:o.totalVentasContadoCaja)??(o==null?void 0:o.totalVentasContado))||0)+(Number((o==null?void 0:o.totalRecibosEfectivo)??(o==null?void 0:o.totalRecibos))||0),Zt=(o,a)=>{const r=La(a),d=Va(a),x=(l,N,_=!1,c=!1)=>c||Number(N)>0?`<tr${_?' class="bold"':""}><td>${l}</td><td class="num">${n(N)}</td></tr>`:"";return`
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
            <div><b>Fecha:</b> ${ca(o.fecha)}</div>
            <div><b>Turno:</b> ${o.turno}</div>
            <div><b>Cajero:</b> ${o.cajero_nombre}</div>
            ${o._reimpresion?'<div style="color:#b45309;font-weight:bold">REIMPRESIÓN</div>':""}
          </div>
        </div>
        ${o._reimpresion?`<div style="margin-top:8px;padding:4px 8px;border:1px solid #b45309;color:#b45309;font-size:11px">
          Copia del cierre grabado el ${ca(o.created_at||o.fecha)}. No es un cierre nuevo.
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
              ${Number(a==null?void 0:a.totalRetencionesContado)>0?x("Retenido por clientes (pagan a la DGII)",a==null?void 0:a.totalRetencionesContado):""}
              ${x("Ventas Crédito",a==null?void 0:a.totalVentasCredito)}
              ${x("Total Ventas",a==null?void 0:a.totalVentas,!0)}
              ${Number(a==null?void 0:a.totalRecibosMovil)>0?`
              ${x("Recibos Ingreso Caja",a==null?void 0:a.totalRecibosCaja)}
              ${x("Recibos Ingreso Móvil",a==null?void 0:a.totalRecibosMovil)}`:""}
              ${x("Recibos Ingreso (total)",a==null?void 0:a.totalRecibos,!0)}
              ${Number(a==null?void 0:a.totalRecibosOtrasFormas)>0?`
              ${x("· Recibos en Efectivo",a==null?void 0:a.totalRecibosEfectivo)}
              ${x("· Recibos Transf/Cheque/Tarjeta",a==null?void 0:a.totalRecibosOtrasFormas)}
              ${((a==null?void 0:a.recibosPorCuenta)||[]).map(l=>x(`&nbsp;&nbsp;&nbsp;&nbsp;↳ ${Vt(l.etiqueta)}`,l.monto,!1,!0)).join("")}`:""}
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
              ${a.prestamosEfectivo.map(l=>{var N;return`<tr><td>${((N=l.clientes)==null?void 0:N.nombre)||"PRÉSTAMO"}${l.numero?` — ${l.numero}`:""}</td><td class="num">${n(l.monto_capital)}</td></tr>`}).join("")}
              <tr class="bold"><td>Total Préstamos</td><td class="num">${n(a==null?void 0:a.totalPrestamosEfectivo)}</td></tr>
            </tbody></table>`:""}

            ${((a==null?void 0:a.compromisosEfectivo)||[]).length?`
            <div class="sec">Compromisos (Efectivo)</div>
            <table><tbody>
              ${a.compromisosEfectivo.map(l=>`
                <tr><td>${l.nombre||"COMPROMISO"}${l.tipo?` — ${l.tipo}`:""}</td><td class="num">${n(l.monto_efectivo!==void 0?l.monto_efectivo:l.monto)}</td></tr>
                ${(l.empleados||[]).map(N=>`<tr><td style="padding-left:14px;color:#555">· ${N.nombre}${N.yaEnGastos?` <i>(ya salió ${N.pagadoAt?ca(N.pagadoAt):"antes"}, en Gastos)</i>`:""}</td><td class="num" style="color:#555">${n(N.monto)}</td></tr>`).join("")}
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
              ${Number(a==null?void 0:a.fondoApertura)>0?`<div class="linea"><span>+ FONDO DE APERTURA</span><span>${n(a.fondoApertura)}</span></div>
              <div class="linea total"><span>DEBE HABER EN LA GAVETA</span><span>${n((Number(a.efectivoEnCaja)||0)+Number(a.fondoApertura))}</span></div>`:""}
            </div>
          </div>

          <div class="col">
            <div class="sec">Desglose del Dinero en Caja</div>
            <table>
              <thead><tr><th>Denominación</th><th class="num">Cant.</th><th class="num">Valor</th></tr></thead>
              <tbody>
                ${Ya.filter(l=>Number(o.desglose[l.label]||0)>0&&(l.tipo!=="tasa"||Number(o.desglose.Dólares||0)>0)).map(l=>{const N=o.desglose[l.label]||0,_=wa(l,o.desglose);return`<tr><td>${l.label}</td><td class="num">${N}</td><td class="num">${l.tipo==="tasa"?"":n(_)}</td></tr>`}).join("")}
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
    `},nt=(o,a)=>{const r=(it||(y==null?void 0:y.formato_cierre_caja)||"pos_80mm")==="carta",d=La(a),x=Va(a),l=(c,T,F={})=>F.siempre||Number(T)>0?`<div class="row${F.total?" total-row":""}"><span>${c}:</span><span${F.bold?' class="bold"':""}>${n(T)}</span></div>`:"",N=r?Zt(o,a):`
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
          ${o._reimpresion?'<p class="bold" style="margin:2px 0;font-size:12px;">** REIMPRESION **</p>':""}
        </div>
        <div class="separator"></div>
        <div class="row"><span>Fecha:</span><span>${ca(o.fecha)}</span></div>
        <div class="row"><span>Turno:</span><span>${o.turno}</span></div>
        <div class="row"><span>Cajero:</span><span>${o.cajero_nombre}</span></div>
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">ENTRADAS DEL DIA</div>
        ${l("Ventas Contado Caja",a==null?void 0:a.totalVentasContadoCaja)}
        ${l("Cuenta Contado Móvil",a==null?void 0:a.totalVentasContadoMovil)}
        ${l("Ventas Transf./Tarjeta",a==null?void 0:a.totalVentasContadoNoEfectivo)}
        ${Number(a==null?void 0:a.totalRetencionesContado)>0?l("Retenido por clientes",a==null?void 0:a.totalRetencionesContado):""}
        ${l("Ventas Crédito",a==null?void 0:a.totalVentasCredito)}
        ${l("Total Ventas",a==null?void 0:a.totalVentas,{bold:!0})}
        ${Number(a==null?void 0:a.totalRecibosMovil)>0?`
        ${l("Recibos Ingreso Caja",a==null?void 0:a.totalRecibosCaja)}
        ${l("Recibos Ingreso Móvil",a==null?void 0:a.totalRecibosMovil)}`:""}
        ${l("Recibos Ingreso (total)",a==null?void 0:a.totalRecibos)}
        ${Number(a==null?void 0:a.totalRecibosOtrasFormas)>0?`
        ${l("&nbsp;&nbsp;En Efectivo",a==null?void 0:a.totalRecibosEfectivo,{siempre:!0})}
        ${l("&nbsp;&nbsp;Transf/Cheque/Tarjeta",a==null?void 0:a.totalRecibosOtrasFormas)}
        ${((a==null?void 0:a.recibosPorCuenta)||[]).map(c=>l(`&nbsp;&nbsp;&nbsp;&nbsp;↳ ${Vt(c.etiqueta)}`,c.monto,{siempre:!0})).join("")}`:""}
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
        ${a.prestamosEfectivo.map(c=>{var T;return`
          <div class="row">
            <span style="max-width: 70%;">${((T=c.clientes)==null?void 0:T.nombre)||c.numero||"PRÉSTAMO"}</span>
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
          ${(c.empleados||[]).map(T=>`
          <div class="row">
            <span style="max-width: 70%; padding-left: 8px;">· ${T.nombre}${T.yaEnGastos?" (en Gastos)":""}</span>
            <span>${n(T.monto)}</span>
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
        ${Number(a==null?void 0:a.fondoApertura)>0?`<div class="row"><span>+ FONDO DE APERTURA:</span><span>${n(a.fondoApertura)}</span></div>
        <div class="row total-row"><span>DEBE HABER EN GAVETA:</span><span>${n((Number(a.efectivoEnCaja)||0)+Number(a.fondoApertura))}</span></div>`:""}
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">DESGLOSE DINERO EN CAJA</div>
        <div class="row" style="font-size: 12px; border-bottom: 1px solid #000; margin-bottom: 2px;">
          <span style="flex: 1;">DENOM.</span>
          <span class="text-right" style="width: 42px;">CANT.</span>
          <span class="text-right" style="width: 84px;">VALOR</span>
        </div>
        ${Ya.filter(c=>Number(o.desglose[c.label]||0)>0&&(c.tipo!=="tasa"||Number(o.desglose.Dólares||0)>0)).map(c=>{const T=o.desglose[c.label]||0,F=wa(c,o.desglose);return`<div class="row">
            <span style="flex: 1;">${c.label}</span>
            <span class="text-right" style="width: 42px;">${T}</span>
            <span class="text-right" style="width: 84px;">${c.tipo==="tasa"?"":n(F)}</span>
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
    `,_=document.createElement("iframe");_.style.cssText="position:fixed;right:0;bottom:0;width:0;height:0;border:0;",document.body.appendChild(_),_.contentWindow.document.open(),_.contentWindow.document.write(N),_.contentWindow.document.close(),setTimeout(()=>{document.body.contains(_)&&document.body.removeChild(_)},3e3)},rt=f.useCallback(async()=>{if(!C)return;const{data:o,error:a}=await w.from("cierres_caja").select("*").eq("tenant_id",C).order("created_at",{ascending:!1}).limit(60);a||Bt(o||[])},[C]);f.useEffect(()=>{ma&&rt()},[ma,rt]);const[ct,dt]=f.useState(null),Kt=async o=>{dt(o.id);try{const a=!o.detalle,r=o.detalle||await U(o.fecha);if(!r)throw new Error("No se pudo armar el desglose de esa fecha.");const d=Math.abs((Number(r.efectivoEnCaja)||0)-(Number(o.efectivo_en_caja)||0)),x=a?{...r,efectivoEnCaja:o.efectivo_en_caja}:r;nt({...o,_reimpresion:!0,_reconstruido:a,_descuadre:a&&d>.01?r.efectivoEnCaja:null},x)}catch(a){b({variant:"destructive",title:"No se pudo reimprimir",description:a.message})}finally{dt(null)}};return f.useEffect(()=>{const o=a=>{pa==="cierre-caja"&&(a.key==="Escape"&&a.defaultPrevented||(a.key==="F8"&&xa&&(a.preventDefault(),Pa()),a.key==="Escape"&&(a.preventDefault(),xa?Ra(!1):$a("cierre-caja"))))};return window.addEventListener("keydown",o),()=>window.removeEventListener("keydown",o)},[xa,Pa,$a,pa]),t.jsxs(t.Fragment,{children:[t.jsx(fo,{children:t.jsx("title",{children:"Cierre de Caja — MotoFlow"})}),t.jsx(go.div,{initial:{opacity:0,y:20},animate:{opacity:1,y:0},className:"p-1 md:p-4 bg-gray-100 min-h-full flex flex-col",children:t.jsxs("div",{className:"bg-white p-4 rounded-lg shadow-md flex-grow flex flex-col",children:[t.jsxs("div",{className:"bg-morla-blue text-white py-1.5 rounded-t-lg mb-3 relative",children:[t.jsx("h1",{className:"text-white font-black tracking-[0.25em] italic uppercase text-base drop-shadow-sm text-center",children:"CIERRE DE CAJA"}),t.jsx("button",{type:"button",onClick:()=>U(),disabled:Ma,title:"Actualizar los montos del día",className:"absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-white/20 disabled:opacity-50",children:t.jsx(vo,{className:`w-4 h-4 ${Ma?"animate-spin":""}`})})]}),$&&X($)!==X(At())&&t.jsxs("div",{className:"mb-3 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900",children:[t.jsxs("b",{children:["Estás cerrando una fecha pasada: ",Ot($,"dd/MM/yyyy"),"."]})," ","Las cifras son las de ese día. Si ya vendiste hoy, el efectivo de la gaveta incluye lo de hoy y no va a cuadrar con el conteo."]}),t.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-4 gap-x-4 gap-y-2 px-3 py-2 border rounded-lg mb-3",children:[t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(la,{className:"font-bold text-xs shrink-0",children:"Fecha"}),t.jsxs(Eo,{children:[t.jsx(Co,{asChild:!0,children:t.jsxs(na,{variant:"outline",className:ho("flex-1 min-w-0 h-8 justify-start text-left font-normal text-sm px-2",!$&&"text-muted-foreground"),children:[t.jsx(jo,{className:"mr-1.5 h-3.5 w-3.5 shrink-0"}),$?Ot($,"dd/MM/yyyy"):t.jsx("span",{children:"Seleccione"})]})}),t.jsx(wo,{className:"w-auto p-0",children:t.jsx($o,{mode:"single",selected:$,onSelect:Gt,initialFocus:!0})})]})]}),!sa&&!z&&t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(la,{className:"font-bold text-xs shrink-0",children:"Turno"}),t.jsx(Ja,{type:"number",min:"1",max:Sa,value:ba,onChange:o=>Ta(parseInt(o.target.value,10)||1),onFocus:o=>o.target.select(),className:"flex-1 min-w-0 h-8 text-center font-bold px-2"})]}),k?t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(la,{className:"font-bold text-xs shrink-0",children:"Caja"}),K.length===0?t.jsx("span",{className:"text-xs text-gray-500",children:p!=null&&p.es_admin?"No hay cajas abiertas.":"No tienes una caja abierta."}):t.jsxs(_a,{value:Da||"",onValueChange:Aa,children:[t.jsx(Na,{className:"flex-1 min-w-0 h-8 text-sm px-2",children:t.jsx(ya,{placeholder:"Escoge la caja"})}),t.jsx(Ea,{children:K.map(o=>t.jsxs(ra,{value:o.apertura_id,children:[o.caja_nombre," — ",o.cajero_nombre||"cajero"," · ",o.cerrada?"cerrada (rehacer cierre)":`abierta ${new Date(o.desde).toLocaleTimeString("es-DO",{hour:"numeric",minute:"2-digit"})}`]},o.apertura_id))})]})]}):t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(la,{className:"font-bold text-xs shrink-0",children:"Caja"}),t.jsxs(_a,{value:"caja1",disabled:!0,children:[t.jsx(Na,{className:"flex-1 min-w-0 h-8 text-sm px-2",children:t.jsx(ya,{})}),t.jsx(Ea,{children:t.jsx(ra,{value:"caja1",children:"Caja No. 1"})})]}),z&&t.jsxs("span",{className:"text-[11px] text-gray-500 whitespace-nowrap",children:["Turno ",(p==null?void 0:p.turno)||1,p!=null&&p.desde?` · abierto ${new Date(p.desde).toLocaleTimeString("es-DO",{hour:"numeric",minute:"2-digit"})}`:" · desde la mañana",p!=null&&p.requiere_apertura?" · cerrado":""]})]}),!k&&t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(la,{className:"font-bold text-xs shrink-0",children:"Cajero"}),t.jsxs(_a,{value:M,onValueChange:Ka,children:[t.jsx(Na,{className:"flex-1 min-w-0 h-8 text-sm px-2",children:t.jsx(ya,{placeholder:"Seleccione cajero"})}),t.jsxs(Ea,{children:[t.jsx(ra,{value:"ALL",className:"font-bold text-morla-blue",children:"📊 Todos los Cajeros (Consolidado)"}),Za.map(o=>t.jsx(ra,{value:o.id,children:o.nombre_completo||o.email},o.id))]})]})]})]}),Ma?t.jsx("div",{className:"flex-grow flex items-center justify-center",children:t.jsx(Wa,{className:"h-8 w-8 animate-spin text-morla-blue"})}):i?t.jsxs("div",{className:"grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4",children:[t.jsxs("div",{className:"border rounded-lg p-4 bg-gradient-to-br from-slate-50 to-blue-50",children:[t.jsx("h2",{className:"font-bold text-sm uppercase text-gray-500 tracking-wider mb-3",children:u?`Resumen de ${u.caja_nombre} — ${u.cajero_nombre||""}`:M==="ALL"?"Resumen Total del Día":"Resumen del Turno"}),t.jsxs("div",{className:"space-y-2",children:[t.jsx(E,{label:"Cantidad de Facturas",value:i.cantFacturas,isCount:!0,siempre:!0}),t.jsx(E,{label:"Ventas Contado Caja",value:i.totalVentasContadoCaja}),t.jsx(E,{label:"Cuenta Contado Móvil",value:i.totalVentasContadoMovil}),t.jsx(E,{label:"Ventas por Transferencia/Tarjeta",value:i.totalVentasContadoNoEfectivo}),t.jsx(E,{label:"Retenido por clientes (pagan a la DGII)",value:i.totalRetencionesContado}),t.jsx(E,{label:"Ventas Crédito",value:i.totalVentasCredito}),t.jsx(E,{label:"Total Ventas",value:i.totalVentas,bold:!0}),Number(i.totalRecibosMovil)>0&&t.jsxs(t.Fragment,{children:[t.jsx(E,{label:"Recibos de Ingreso Caja",value:i.totalRecibosCaja}),t.jsx(E,{label:"Recibos de Ingreso Móvil",value:i.totalRecibosMovil})]}),t.jsx(E,{label:"Recibos de Ingreso (total)",value:i.totalRecibos}),Number(i.totalRecibosOtrasFormas)>0&&t.jsxs(t.Fragment,{children:[t.jsx(E,{label:"· Recibos en Efectivo",value:i.totalRecibosEfectivo}),t.jsx(E,{label:"· Recibos Transf/Cheque/Tarjeta",value:i.totalRecibosOtrasFormas}),(i.recibosPorCuenta||[]).map(o=>{const a=!!Ut[o.etiqueta],r=(o.detalle||[]).length>0;return t.jsxs("div",{className:"pl-4",children:[t.jsxs("button",{type:"button",disabled:!r,onClick:()=>at(d=>({...d,[o.etiqueta]:!d[o.etiqueta]})),className:"flex w-full items-center justify-between py-1 text-left disabled:cursor-default",title:r?"Ver los recibos":void 0,children:[t.jsxs("span",{className:"flex items-center gap-1 text-sm text-gray-600",children:[r&&t.jsx(Rt,{className:`h-4 w-4 text-morla-blue transition-transform ${a?"":"-rotate-90"}`}),"↳ ",o.etiqueta,r&&t.jsxs("span",{className:"text-xs text-gray-400",children:["(",o.detalle.length,")"]})]}),t.jsx("span",{className:"font-mono text-sm text-gray-800",children:n(o.monto)})]}),a&&r&&t.jsx("div",{className:"mb-1 ml-5 rounded border border-gray-200 bg-white",children:o.detalle.map((d,x)=>t.jsxs("div",{className:"flex items-center justify-between gap-2 border-b border-gray-100 px-2 py-1 text-xs last:border-b-0",children:[t.jsx("span",{className:"min-w-0 truncate text-gray-700",title:d.cliente,children:d.cliente}),t.jsxs("span",{className:"shrink-0 font-mono text-gray-500",children:[d.recibo,d.pago?` · pago ${d.pago}`:""]}),t.jsx("span",{className:"w-24 shrink-0 text-right font-mono text-gray-800",children:n(d.monto)})]},`${d.recibo}-${x}`))})]},o.etiqueta)})]}),t.jsx(Ia,{label:"Total ingreso en caja",value:Va(i)}),t.jsx(E,{label:"Gastos Diarios",value:i.totalGastosDiarios}),t.jsx(E,{label:"Nómina (Efectivo)",value:i.totalPagosNomina}),(i.pagosNomina||[]).length>0&&t.jsx("div",{className:"mt-1 mb-1 ml-3 pl-3 border-l-2 border-gray-200",children:i.pagosNomina.map(o=>t.jsxs("div",{className:"flex justify-between items-center py-0.5",children:[t.jsx("span",{className:"text-xs text-gray-500 truncate pr-2",title:o.descripcion,children:String(o.descripcion||"Nómina").split("—").pop().trim()}),t.jsx("span",{className:"font-mono text-xs text-gray-600 shrink-0",children:n(o.monto)})]},o.id||o.descripcion))}),t.jsx(E,{label:"Pagos a terceros (GPS, seguro...)",value:i.totalPagosTerceros}),t.jsx(E,{label:"Préstamos (Efectivo)",value:i.totalPrestamosEfectivo}),t.jsx(E,{label:"Compromisos (Efectivo)",value:i.totalCompromisosEfectivo}),(i.compromisosEfectivo||[]).filter(o=>(o.empleados||[]).length>0).map(o=>t.jsxs("div",{className:"mt-1 mb-1 ml-3 pl-3 border-l-2 border-gray-200",children:[t.jsx("p",{className:"text-[11px] font-semibold text-gray-400 uppercase tracking-wide",children:o.nombre}),o.empleados.map((a,r)=>t.jsxs("div",{className:"flex justify-between items-center py-0.5",children:[t.jsx("span",{className:`text-xs truncate pr-2 ${a.yaEnGastos?"text-gray-400 line-through":"text-gray-500"}`,children:a.nombre}),t.jsx("span",{className:`font-mono text-xs shrink-0 ${a.yaEnGastos?"text-gray-400 line-through":"text-gray-600"}`,children:n(a.monto)})]},`${o.id}-${r}`)),Number(o.cubierto)>0&&t.jsxs("p",{className:"text-[10px] text-amber-700 leading-snug mt-0.5",children:[n(o.cubierto)," ya salió como gasto el día de cada pago; aquí solo entra"," ",n(o.monto_efectivo),"."]})]},o.id)),t.jsx(E,{label:"Devoluciones",value:i.totalDevoluciones}),t.jsx(E,{label:"Pagos a Suplidores (Efectivo)",value:i.totalPagosSuplidores}),t.jsx(E,{label:"Compras de contado (Efectivo)",value:i.comprasContadoEfectivo}),t.jsx(Ia,{label:"Gasto total",value:La(i)}),(i.efectivoMovido||[]).length>0&&t.jsxs(t.Fragment,{children:[t.jsx("div",{className:"mt-2 mb-1 ml-3 pl-3 border-l-2 border-emerald-200",children:i.efectivoMovido.map(o=>t.jsxs("div",{className:"flex justify-between items-center py-0.5",children:[t.jsxs("span",{className:"text-xs text-gray-500 truncate pr-2",children:[o.cuenta,o.moneda&&o.moneda!=="DOP"?` (US$${Number(o.monto_cuenta).toLocaleString("es-DO",{minimumFractionDigits:2})} a ${Number(o.tasa)})`:"",o.concepto?` · ${o.concepto}`:""]}),t.jsx("span",{className:"font-mono text-xs text-gray-600 shrink-0",children:n(o.monto_caja)})]},o.id))}),t.jsx(Ia,{label:"Efectivo movido a cuentas (no es gasto)",value:i.totalEfectivoMovido})]}),t.jsxs("div",{className:"flex justify-between items-center py-2 mt-2 bg-morla-blue/10 rounded px-3 border border-morla-blue/30",children:[t.jsx("span",{className:"font-bold text-morla-blue",children:"Efectivo en Caja"}),t.jsx("span",{className:"font-bold text-morla-blue text-lg font-mono",children:n(i.efectivoEnCaja)})]}),Number(i.fondoApertura)>0&&t.jsxs(t.Fragment,{children:[t.jsxs("div",{className:"flex justify-between px-3 py-1 text-sm",children:[t.jsx("span",{children:"+ Fondo de apertura"}),t.jsx("span",{className:"font-mono",children:n(i.fondoApertura)})]}),t.jsxs("div",{className:"flex justify-between items-center py-2 bg-emerald-50 rounded px-3 border border-emerald-200",children:[t.jsx("span",{className:"font-bold text-emerald-800",children:"Debe haber en la gaveta"}),t.jsx("span",{className:"font-bold text-emerald-800 text-lg font-mono",children:n(H)})]})]})]})]}),t.jsx("div",{className:"border rounded-lg p-4 flex flex-col",children:xa?t.jsxs("div",{className:"flex flex-col h-full",children:[t.jsxs("div",{className:"flex items-center justify-between gap-3 mb-2",children:[t.jsx("h3",{className:"font-bold text-sm uppercase tracking-widest text-gray-600",children:"DESGLOSE DE MONEDAS"}),t.jsxs(_a,{value:"DOP",disabled:!0,children:[t.jsx(Na,{className:"w-32 h-7 text-xs",children:t.jsx(ya,{})}),t.jsx(Ea,{children:t.jsx(ra,{value:"DOP",children:"DOP - PESO"})})]})]}),t.jsx(uo,{className:"flex-grow border rounded-lg max-h-[380px]",children:t.jsxs(Mt,{children:[t.jsx(Ft,{className:"bg-gray-200 sticky top-0 z-10",children:t.jsxs(da,{className:"h-8",children:[t.jsx(q,{className:"w-20 h-8 py-1 font-bold text-xs",children:"MONEDA"}),t.jsx(q,{className:"w-24 h-8 py-1 font-bold text-center text-xs",children:"CANTIDAD"}),t.jsx(q,{className:"h-8 py-1 text-right font-bold text-xs",children:"VALOR"})]})}),t.jsx(Pt,{children:Ca.filter(o=>o.tipo!=="tasa").map(o=>{const a=aa[o.label]??0,r=wa(o,aa);return t.jsxs(da,{className:"hover:bg-yellow-50/50",children:[t.jsx(R,{className:"py-0.5 font-semibold text-right pr-4 text-sm whitespace-nowrap",children:o.label}),t.jsx(R,{className:"py-0.5 text-center",children:t.jsx(Ja,{type:"number",min:"0",step:o.tipo?"0.01":"1",value:a,onChange:d=>lt(o,d.target.value),onFocus:d=>d.target.select(),onClick:d=>d.target.select(),className:"w-20 mx-auto text-center h-6 text-sm px-1"})}),t.jsx(R,{className:"py-0.5 text-right font-mono text-sm",children:o.tipo==="dolar"?t.jsxs("div",{className:"flex items-center justify-end gap-2",children:[t.jsx("span",{className:"text-xs text-gray-600 font-sans font-semibold whitespace-nowrap",children:"Tasa del día"}),t.jsx(Ja,{type:"number",min:"0",step:"0.01",value:aa["Tasa del día"]??"",onChange:d=>lt({label:"Tasa del día",tipo:"tasa"},d.target.value),onFocus:d=>d.target.select(),onClick:d=>d.target.select(),className:"w-20 text-center h-6 text-sm px-1"}),t.jsx("span",{className:"min-w-[90px]",children:n(r)})]}):n(r)})]},o.label)})}),t.jsx(To,{className:"sticky bottom-0 bg-yellow-100 z-10",children:t.jsxs(da,{className:"font-bold",children:[t.jsx(R,{colSpan:2,className:"py-1 text-right text-red-600 uppercase text-sm",children:"TOTAL ==>"}),t.jsx(R,{className:"py-1 text-right text-red-600 font-mono text-base",children:n(G)})]})})]})}),t.jsx("div",{className:"mt-2 px-2.5 py-2 bg-blue-50 border border-blue-200 rounded-lg",children:t.jsx(_o,{value:fa,onChange:Wt,moneda:"DOP",contexto:"cierre_caja",label:"Depositar en",inline:!0})}),t.jsxs("div",{className:"mt-3 flex items-center justify-between",children:[t.jsxs("label",{className:"flex items-center gap-2 text-sm cursor-pointer",children:[t.jsx("input",{type:"checkbox",checked:Fa,onChange:o=>Ht(o.target.checked),className:"rounded"}),t.jsx(Lt,{className:"h-4 w-4"}),"Imprimir ?"]}),Fa&&t.jsxs("select",{value:it||(y==null?void 0:y.formato_cierre_caja)||"pos_80mm",onChange:o=>Qt(o.target.value),className:"h-9 border border-slate-300 rounded px-2 text-xs font-bold bg-white",title:"Papel del impreso — se recuerda en esta PC",children:[t.jsx("option",{value:"pos_80mm",children:"📑 Ticket 80mm"}),t.jsx("option",{value:"carta",children:"📄 Carta (8.5 x 11)"})]}),t.jsxs(na,{onClick:Pa,disabled:tt,className:"bg-morla-blue hover:bg-morla-blue/90 text-white gap-2",children:[tt?t.jsx(Wa,{className:"h-4 w-4 animate-spin"}):t.jsx(No,{className:"h-4 w-4"}),"F8 - Grabar y Cerrar ",sa?"Caja":"Turno"]})]}),i&&t.jsxs("div",{className:`mt-3 p-3 rounded-lg text-center font-bold text-sm ${G-H===0?"bg-green-100 text-green-700":G-H<0?"bg-red-100 text-red-700":"bg-yellow-100 text-yellow-700"}`,children:["Diferencia: ",n(G-H),G-H===0&&" ✓ Cuadra",G-H<0&&" (Faltante)",G-H>0&&" (Sobrante)"]})]}):t.jsxs("div",{className:"flex-grow flex flex-col items-center justify-center gap-4",children:[t.jsxs(na,{onClick:()=>Ra(!0),size:"lg",className:"bg-morla-blue hover:bg-morla-blue/90 text-white px-8 py-6 text-base gap-3 shadow-lg",children:[t.jsx(So,{className:"h-5 w-5"}),"Contar Efectivo y Cerrar ",sa?"Caja":"Turno"]}),t.jsxs("p",{className:"text-xs text-gray-400 text-center max-w-[260px]",children:["Se cuentan los billetes y al grabar el desglose ",sa?"la caja queda cerrada":"el turno queda cerrado","."]})]})})]}):null,t.jsxs("div",{className:"mt-4 border rounded-lg",children:[t.jsxs("button",{type:"button",onClick:()=>Jt(o=>!o),className:"w-full flex items-center justify-between px-4 py-2 text-left hover:bg-gray-50 transition-colors",children:[t.jsx("span",{className:"text-sm font-semibold text-gray-700",children:"Cierres anteriores"}),t.jsx(Rt,{className:`h-4 w-4 text-gray-400 transition-transform ${ma?"rotate-180":""}`})]}),ma&&t.jsxs("div",{className:"border-t max-h-72 overflow-y-auto",children:[st.length===0?t.jsx("p",{className:"px-4 py-3 text-sm text-gray-400 italic",children:"No hay cierres grabados."}):t.jsxs(Mt,{children:[t.jsx(Ft,{children:t.jsxs(da,{children:[t.jsx(q,{className:"text-xs",children:"Fecha"}),t.jsx(q,{className:"text-xs",children:"Turno"}),t.jsx(q,{className:"text-xs",children:"Cajero"}),t.jsx(q,{className:"text-xs text-right",children:"Efectivo"}),t.jsx(q,{className:"text-xs text-right",children:"Contado"}),t.jsx(q,{className:"text-xs text-right",children:"Diferencia"}),t.jsx(q,{className:"text-xs text-right",children:" "})]})}),t.jsx(Pt,{children:st.map(o=>{const a=Number(o.diferencia)||0;return t.jsxs(da,{children:[t.jsx(R,{className:"text-sm py-1.5",children:ca(o.fecha)}),t.jsx(R,{className:"text-sm py-1.5",children:o.turno}),t.jsx(R,{className:"text-sm py-1.5 max-w-[160px] truncate",title:o.cajero_nombre,children:o.cajero_nombre}),t.jsx(R,{className:"text-sm py-1.5 text-right font-mono",children:n(o.efectivo_en_caja)}),t.jsx(R,{className:"text-sm py-1.5 text-right font-mono",children:n(o.total_desglose)}),t.jsx(R,{className:`text-sm py-1.5 text-right font-mono ${Math.abs(a)<.005?"text-green-600":a<0?"text-red-600":"text-amber-600"}`,children:n(a)}),t.jsx(R,{className:"text-right py-1.5",children:t.jsxs(na,{size:"sm",variant:"outline",className:"h-7 gap-1.5 text-xs",disabled:ct===o.id,onClick:()=>Kt(o),children:[ct===o.id?t.jsx(Wa,{className:"h-3.5 w-3.5 animate-spin"}):t.jsx(Lt,{className:"h-3.5 w-3.5"})," Reimprimir"]})})]},o.id)})})]}),t.jsx("p",{className:"px-4 py-2 text-[11px] text-gray-400 italic border-t",children:"Sale marcado como reimpresión. Los cierres grabados desde hoy salen idénticos al original; los anteriores reconstruyen el desglose con los movimientos de esa fecha, y el efectivo y el conteo de billetes son siempre los que quedaron grabados."})]})]}),t.jsx("div",{className:"mt-auto pt-4 flex justify-end items-center space-x-4 border-t",children:t.jsxs(na,{variant:"outline",onClick:()=>$a("cierre-caja"),className:"gap-2",children:[t.jsx(yo,{className:"h-4 w-4"})," ESC - Salir"]})})]})})]})};export{zo as default};
