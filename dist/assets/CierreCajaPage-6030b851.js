import{V as fe,W as ge,aC as ve,r as g,aX as Mt,aY as X,bW as he,s as w,j as t,H as je,m as ue,b0 as _e,bc as It,L as la,d as na,bp as Ne,a6 as ye,I as Wa,a8 as Na,a9 as ya,aa as Ea,ab as Ca,ac as ra,k as Ya,a5 as Pt,bt as Ee,as as Ce,e as we,bq as ca,X as $e}from"./index-5861b683.js";import{m as Te,r as Se,n as De}from"./devolucionEfectivo-6fca9242.js";import{P as Ae,a as Oe,b as Re}from"./popover-44d09b63.js";import{C as Me}from"./calendar-21ab6b19.js";import{T as Ft,a as Lt,b as da,c as V,d as qt,e as R,f as Ie}from"./table-d80a6241.js";import{c as Vt}from"./AbrirCajaModal-20736fc9.js";import{C as Pe}from"./coins-cbf53fa1.js";import{P as kt}from"./printer-c122890d.js";import"./index-126e16b2.js";import"./index-617e668c.js";import"./chevron-left-ba99133e.js";import"./lock-open-61feaec5.js";const Bt="id, numero, monto_pagado, fecha, created_at, origen, formas_pago, usuario_id, clientes(nombre)",Fe=`${Bt}, caja_cajero_id, caja_asignada_at, caja_externo`,Qa=[{label:"2,000",value:2e3},{label:"1,000",value:1e3},{label:"500",value:500},{label:"200",value:200},{label:"100",value:100},{label:"50",value:50},{label:"25",value:25},{label:"20",value:20},{label:"10",value:10},{label:"5",value:5},{label:"1",value:1},{label:"Cent.",value:0},{label:"Tarjetas",value:0,tipo:"tarjeta"},{label:"Cheques",value:0,tipo:"cheque"},{label:"Tarjetas/Cheques",value:0,tipo:"tarjeta"},{label:"Dólares",value:0,tipo:"dolar"},{label:"Tasa del día",value:0,tipo:"tasa"},{label:"Otros",value:0,tipo:"otro"}],Le=new Set(["20","Cent.","Otros","Tarjetas","Cheques"]),wa=Qa.filter(b=>!Le.has(b.label)),$a=(b,v)=>{const Z=Number(v==null?void 0:v[b.label])||0;return b.tipo==="tasa"?0:b.tipo==="dolar"?Z*(Number(v==null?void 0:v["Tasa del día"])||0):b.tipo?Z:Z*b.value},n=b=>new Intl.NumberFormat("es-DO",{style:"decimal",minimumFractionDigits:2,maximumFractionDigits:2}).format(b||0),Gt=b=>String(b??"").replace(/[&<>"']/g,v=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[v]),qe=b=>String((b==null?void 0:b.estado)||"").toUpperCase()!=="ANULADA",zt=b=>qe(b)&&!/ - RECIBO$/i.test(String((b==null?void 0:b.forma_pago)||"")),Ut=b=>{const v=String((b==null?void 0:b.forma_pago)||"").toUpperCase(),Z=String((b==null?void 0:b.tipo_pago)||"").toUpperCase(),y=String((b==null?void 0:b.notas)||"").toUpperCase();return v==="EFECTIVO"||y.includes("POS_MOVIL")||y.includes("POS MOVIL")||y.includes("MOVIL")||y.includes("MÓVIL")||Z.includes("MOVIL")},Ze=()=>{var bt;const{toast:b}=fe(),{user:v,profile:Z,empresa:y,tenantId:C}=ge(),{closePanel:Ta,activePanel:pa}=ve(),[$,Ht]=g.useState(Mt()),[ba,Sa]=g.useState(1),Da=Math.max(1,parseInt(y==null?void 0:y.turnos_caja_dia,10)||1),sa=Da<=1,[c,Xa]=g.useState(null),ia=$?X($):null;g.useEffect(()=>{if(pa!=="cierre-caja"||!ia)return;let e=!0;return Vt(ia).then(a=>{e&&Xa(a)}),()=>{e=!1}},[pa,C,ia]);const z=(c==null?void 0:c.modo)==="apertura",k=(c==null?void 0:c.modo)==="varias",[Aa,Oa]=g.useState(null),K=g.useMemo(()=>k?[...(c==null?void 0:c.abiertas)||[],...(c==null?void 0:c.recientes)||[]].filter(e=>(c==null?void 0:c.es_admin)||e.cajero_id===(v==null?void 0:v.id)):[],[k,c,v==null?void 0:v.id]),u=K.find(e=>e.apertura_id===Aa)||null;g.useEffect(()=>{if(!k){Oa(null);return}Oa(e=>{if(e&&K.some(p=>p.apertura_id===e))return e;const a=K.filter(p=>!p.cerrada);return(a.find(p=>p.cajero_id===(v==null?void 0:v.id))||a[0]||{}).apertura_id||null})},[k,K,v==null?void 0:v.id]);const Ra=!!c&&c.fecha===ia;g.useEffect(()=>{z&&Ra&&(c!=null&&c.turno)&&Sa(c.turno)},[z,Ra,c==null?void 0:c.turno]);const Za=g.useRef(0),[Ka,Jt]=g.useState([]),[M,at]=g.useState("ALL"),[ma,Ma]=g.useState(!1),[Wt,tt]=g.useState({});g.useEffect(()=>{tt({})},[$,M,Aa]);const[et,ot]=g.useState(!1),[Ia,st]=g.useState(!1),[Pa,Yt]=g.useState(!0),[it,Qt]=g.useState([]),[xa,Xt]=g.useState(!1),[fa,Zt]=g.useState(null),[lt,Kt]=g.useState(()=>localStorage.getItem("cierre_caja_paper")||""),ae=e=>{Kt(e),localStorage.setItem("cierre_caja_paper",e)},[i,te]=g.useState(null),[aa,ga]=g.useState(wa.reduce((e,a)=>({...e,[a.label]:0}),{}));g.useEffect(()=>{(async()=>{const{data:a,error:r}=await w.from("perfiles").select("id, nombre_completo, email").order("nombre_completo");!r&&a&&(Jt(a),at("ALL"))})()},[v]);const U=g.useCallback(async e=>{const a=!!e;if(!$&&!a)return;a||st(!0);const r=!a&&(c==null?void 0:c.modo)==="varias"?u:null,p=e||(r?r.fecha:X($)),{desde:x,hasta:l}=he(p),N=!a&&((c==null?void 0:c.modo)==="apertura"&&(c==null?void 0:c.fecha)===p||!!r),_=a?null:++Za.current,d=r?r.desde||null:N&&c.desde||null,T=r?Number(r.fondo)||0:N&&Number(c.fondo)||0,I=(r==null?void 0:r.cajero_id)||null,va=I||(M&&M!=="ALL"?M:null),ka=(r==null?void 0:r.hasta)||null,P=o=>(!d||!!o&&new Date(o)>=new Date(d))&&(!ka||!!o&&new Date(o)<new Date(ka));let A=[],ha=[],ta=[],O=[],ea=[],H=[],J=[],W=[],Y=[],F=[];try{let o=w.from("facturas").select("id, total, itbis, subtotal, descuento, forma_pago, tipo_pago, monto_recibido, cambio, fecha, created_at, notas, estado, retenido_no_cobrado").eq("tenant_id",C).gte("fecha",x).lte("fecha",l);va&&(o=o.eq("usuario_id",va));const{data:s,error:f}=await o;f?console.warn("Error cargando ventas:",f.message):A=(s||[]).filter(zt);let m=w.from("facturas").select("id, total, itbis, subtotal, descuento, forma_pago, tipo_pago, monto_recibido, cambio, fecha, created_at, notas, estado, retenido_no_cobrado").eq("tenant_id",C).gte("created_at",x).lte("created_at",l);va&&(m=m.eq("usuario_id",va));const{data:S,error:h}=await m;if(h)console.warn("Error cargando ventas moviles:",h.message);else{const L=new Set(A.map(j=>j.id)),D=(S||[]).filter(zt).filter(j=>Ut(j)&&!L.has(j.id));A=[...A,...D]}}catch(o){console.warn("Exception cargando ventas:",o)}try{const{data:o,error:s}=await w.from("devoluciones").select("total_devolucion, efectivo_devuelto, created_at, usuario_id, facturas!inner(forma_pago, tipo_pago, total, retenido_no_cobrado)").eq("tenant_id",C).eq("fecha_devolucion",p);s?console.warn("Error cargando devoluciones:",s.message):ta=o||[]}catch(o){console.warn("Exception cargando devoluciones:",o)}try{const{data:o,error:s}=await w.from("recibos_ingreso").select(Fe).eq("tenant_id",C).eq("anulado",!1).eq("fecha",p);if(s){console.warn("Error cargando recibos por fecha:",s.message);const{data:f,error:m}=await w.from("recibos_ingreso").select(Bt).eq("tenant_id",C).eq("anulado",!1).gte("created_at",x).lte("created_at",l);m?console.warn("Error cargando recibos por created_at:",m.message):O=f||[]}else O=o||[];if(r||(c==null?void 0:c.modo)==="varias"){const{data:f,error:m}=await w.from("recibos_ingreso").select("id, fecha, monto_pagado, formas_pago").eq("tenant_id",C).eq("anulado",!1).eq("caja_pendiente",!0).order("fecha",{ascending:!0}).limit(200);m?console.warn("Error cargando recibos sin caja:",m.message):ha=f||[]}console.log(`Recibos encontrados para ${p}:`,O.length,O)}catch(o){console.warn("Exception cargando recibos:",o)}try{const{data:o,error:s}=await w.from("pagos_suplidores").select("monto_pagado, formas_pago, created_at, usuario_id").eq("tenant_id",C).eq("anulado",!1).gte("created_at",x).lte("created_at",l);s?console.warn("Error cargando pagos suplidores:",s.message):ea=o||[]}catch(o){console.warn("Exception cargando pagos suplidores:",o)}try{const{data:o,error:s}=await w.from("gastos_diarios").select("monto, descripcion, tipo_gasto, afecta_caja, cuenta_bancaria_id, es_tercero, concepto_tercero, created_at, usuario_id").eq("tenant_id",C).eq("fecha",p).eq("anulado",!1);if(s)console.warn("Error cargando gastos diarios:",s.message);else{const f=(o||[]).filter(h=>!h.cuenta_bancaria_id&&h.afecta_caja!==!1);J=f.filter(h=>h.es_tercero===!0);const m=h=>/n[oó]mina/i.test(String(h.tipo_gasto||"")),S=f.filter(h=>h.es_tercero!==!0);W=S.filter(m),H=S.filter(h=>!m(h))}}catch(o){console.warn("Exception cargando gastos diarios:",o)}let Ga=0;try{const{data:o,error:s}=await w.from("compras").select("numero, total_compra, forma_pago, estado, pagos, created_at, usuario_id").eq("tenant_id",C).ilike("forma_pago","contado").gte("created_at",x).lte("created_at",l);s?console.warn("Error cargando compras de contado:",s.message):Ga=(o||[]).filter(f=>(f.estado||"")!=="ANULADA"&&P(f.created_at)&&(!I||f.usuario_id===I)).reduce((f,m)=>{const S=Array.isArray(m.pagos)?m.pagos:[];return S.length===0?f+(parseFloat(m.total_compra)||0):f+S.filter(h=>String((h==null?void 0:h.tipo)??"01")==="01"||String((h==null?void 0:h.forma)||"").toLowerCase().includes("efectivo")).reduce((h,L)=>h+(parseFloat(L==null?void 0:L.monto)||0),0)},0)}catch(o){console.warn("Exception cargando compras de contado:",o)}try{const{data:o,error:s}=await w.from("prestamos").select("numero, monto_capital, created_at, created_by, clientes(nombre)").eq("tenant_id",C).ilike("desembolso","efectivo").gte("created_at",x).lte("created_at",l);s?console.warn("Error cargando préstamos en efectivo:",s.message):Y=o||[]}catch(o){console.warn("Exception cargando préstamos en efectivo:",o)}try{const{data:o,error:s}=await w.from("compromisos").select("id, nombre, monto, tipo, forma_pago, fecha_pago").eq("tenant_id",C).eq("activo",!1).gte("fecha_pago",x).lte("fecha_pago",l);if(s)console.warn("Error cargando compromisos pagados:",s.message);else{F=(o||[]).filter(m=>String(m.forma_pago||"Efectivo").toLowerCase().includes("efectivo"));const f=F.filter(m=>String(m.tipo||"").toLowerCase()==="nomina").map(m=>m.id);if(f.length>0){const{data:m}=await w.from("nominas").select("id, compromiso_id, nomina_detalle(neto, pagado_at, gasto_id, empleados(nombre))").eq("tenant_id",C).in("compromiso_id",f).neq("estado","anulada"),S=(m||[]).flatMap(D=>(D.nomina_detalle||[]).map(j=>j.gasto_id)).filter(Boolean),h=new Set;if(S.length>0){const{data:D}=await w.from("gastos_diarios").select("id, anulado").in("id",S);for(const j of D||[])j.anulado&&h.add(j.id)}const L={};for(const D of m||[])L[D.compromiso_id]=(D.nomina_detalle||[]).map(j=>{var q;return{nombre:((q=j.empleados)==null?void 0:q.nombre)||"Empleado",monto:Number(j.neto)||0,yaEnGastos:!!j.gasto_id&&!h.has(j.gasto_id),pagadoAt:j.pagado_at||null}}).filter(j=>j.monto>0).sort((j,q)=>q.monto-j.monto);F=F.map(D=>{const j=L[D.id]||null,q=(j||[]).filter(oa=>oa.yaEnGastos).reduce((oa,Ha)=>oa+Ha.monto,0);return{...D,empleados:j,cubierto:q,monto_efectivo:Math.max((parseFloat(D.monto)||0)-q,0)}})}}}catch(o){console.warn("Exception cargando compromisos pagados:",o)}let Q=[];try{const{data:o,error:s}=await w.from("caja_depositos").select("id, monto_caja, moneda, tasa, monto_cuenta, concepto, cuenta_id, created_at, created_by, cuentas_bancarias(banco, alias)").eq("tenant_id",C).eq("fecha",p).eq("anulado",!1).order("created_at");s?console.warn("Error cargando efectivo movido a cuentas:",s.message):Q=(o||[]).map(f=>({...f,cuenta:f.cuentas_bancarias?`${f.cuentas_bancarias.banco}${f.cuentas_bancarias.alias?` — ${f.cuentas_bancarias.alias}`:""}`:"cuenta"}))}catch(o){console.warn("Exception cargando efectivo movido a cuentas:",o)}const se=o=>o.caja_asignada_at||o.created_at,ie=o=>o.caja_cajero_id||(o.caja_externo?null:o.usuario_id);if((d||ka)&&(A=A.filter(o=>P(o.created_at)),ta=ta.filter(o=>P(o.created_at)),O=O.filter(o=>P(se(o))),ea=ea.filter(o=>P(o.created_at)),H=H.filter(o=>P(o.created_at)),J=J.filter(o=>P(o.created_at)),W=W.filter(o=>P(o.created_at)),Y=Y.filter(o=>P(o.created_at)),F=F.filter(o=>P(o.fecha_pago)),Q=Q.filter(o=>P(o.created_at))),I){const o=s=>s===I;ta=ta.filter(s=>o(s.usuario_id)),O=O.filter(s=>o(ie(s))),ea=ea.filter(s=>o(s.usuario_id)),H=H.filter(s=>o(s.usuario_id)),J=J.filter(s=>o(s.usuario_id)),W=W.filter(s=>o(s.usuario_id)),Y=Y.filter(s=>o(s.created_by)),Q=Q.filter(s=>o(s.created_by)),F=[]}const ja=A.filter(o=>{const s=String(o.forma_pago||"").toUpperCase();return s==="CONTADO"||s==="EFECTIVO"}),mt=ja.reduce((o,s)=>o+(parseFloat(s.total)||0),0),le=Se,xt=De,ft=ja.reduce((o,s)=>o+le(s),0),gt=ja.filter(Ut).reduce((o,s)=>o+xt(s),0),vt=o=>{const s=String(o.tipo_pago||"").toUpperCase();return!s||s.includes("EFECTIVO")},ht=ja.filter(o=>!vt(o)).reduce((o,s)=>o+xt(s),0),jt=Math.max(0,mt-ft-gt-ht),ne=A.filter(o=>String(o.forma_pago||"").toUpperCase()==="CREDITO").reduce((o,s)=>o+(parseFloat(s.total)||0),0),re=A.reduce((o,s)=>o+(parseFloat(s.total)||0),0),ce=A.reduce((o,s)=>o+(parseFloat(s.itbis)||0),0),de=A.reduce((o,s)=>o+(parseFloat(s.descuento)||0),0),ut=ta.filter(o=>{var f;const s=String(((f=o.facturas)==null?void 0:f.forma_pago)||"").toUpperCase();return(s==="CONTADO"||s==="EFECTIVO")&&vt(o.facturas||{})}).reduce((o,s)=>o+Te(s,s.facturas),0),za=O.reduce((o,s)=>o+(parseFloat(s.monto_pagado)||0),0),_t=O.filter(o=>String(o.origen||"").toLowerCase()==="movil").reduce((o,s)=>o+(parseFloat(s.monto_pagado)||0),0),pe=Math.max(0,za-_t),Nt=o=>{const s=Array.isArray(o.formas_pago)?o.formas_pago:null;return!s||!s.length?parseFloat(o.monto_pagado)||0:s.reduce((f,m)=>f+(String(m.forma||"").toLowerCase().includes("efectivo")&&parseFloat(m.monto)||0),0)},Ua=O.reduce((o,s)=>o+Nt(s),0),yt=Math.max(0,za-Ua),Ba=new Map;O.forEach(o=>{(Array.isArray(o.formas_pago)?o.formas_pago:[]).forEach(s=>{var Rt;if(String(s.forma||"").toLowerCase().includes("efectivo"))return;const f=parseFloat(s.monto)||0;if(f<=0)return;const m=Ja=>String(Ja||"").trim().replace(/\s+/g," "),S=s.alias?`${m(s.alias)}${s.banco?` (${m(s.banco)})`:""}`:[m(s.banco),m(s.cuenta)].filter(Boolean).join(" "),h=m(s.forma)||"Otra forma",L=h.charAt(0).toUpperCase()+h.slice(1).toLowerCase(),D=S?`${L} → ${S}`:L,j=D.toUpperCase(),q=Ba.get(j)||{etiqueta:D,monto:0,detalle:[]};q.monto+=f;const oa=Ja=>String(Ja||"").replace(/\D/g,""),Ha=s.cuenta_id&&/^\d{7}$/.test(String(s.referencia||""))&&oa(s.referencia)!==oa(o.numero)?s.referencia:null;q.detalle.push({cliente:((Rt=o.clientes)==null?void 0:Rt.nombre)||"Cliente genérico",recibo:o.numero||"—",pago:Ha,monto:f}),Ba.set(j,q)})});const ua=[...Ba.values()].map(o=>({etiqueta:o.etiqueta,monto:o.monto,detalle:o.detalle})),be=ua.reduce((o,s)=>o+s.monto,0),Et=Math.round((yt-be)*100)/100;ua.length&&Et>=.01&&ua.push({etiqueta:"Sin forma detallada",monto:Et});const Ct=H.reduce((o,s)=>o+(parseFloat(s.monto)||0),0),wt=J.reduce((o,s)=>o+(parseFloat(s.monto)||0),0),$t=W.reduce((o,s)=>o+(parseFloat(s.monto)||0),0),Tt=Y.reduce((o,s)=>o+(parseFloat(s.monto_capital)||0),0),St=o=>o.monto_efectivo!==void 0?parseFloat(o.monto_efectivo)||0:parseFloat(o.monto)||0;F=F.filter(o=>St(o)>0);const Dt=F.reduce((o,s)=>o+St(s),0),At=Q.reduce((o,s)=>o+(parseFloat(s.monto_caja)||0),0),Ot=ea.reduce((o,s)=>{const f=(s.formas_pago||[]).filter(m=>m.forma==="Efectivo").reduce((m,S)=>m+(parseFloat(S.monto)||0),0);return o+f},0),me=A.filter(o=>o.forma_pago==="CONTADO").reduce((o,s)=>o+(parseFloat(s.cambio)||0),0),xe=A.length,_a={recibosSinCaja:{cantidad:ha.length,monto:ha.reduce((o,s)=>o+Nt(s),0),fechas:[...new Set(ha.map(o=>o.fecha).filter(Boolean))]},totalVentas:re,totalVentasContado:mt,totalVentasContadoCaja:jt,totalVentasContadoMovil:gt,totalVentasContadoNoEfectivo:ht,totalRetencionesContado:ft,totalVentasCredito:ne,totalItbis:ce,totalDescuento:de,totalDevoluciones:ut,totalRecibos:za,totalRecibosMovil:_t,totalRecibosCaja:pe,totalRecibosEfectivo:Ua,totalRecibosOtrasFormas:yt,recibosPorCuenta:ua,totalGastosDiarios:Ct,gastosDiarios:H,totalPagosTerceros:wt,pagosTerceros:J,totalPagosNomina:$t,pagosNomina:W,totalPrestamosEfectivo:Tt,prestamosEfectivo:Y,totalCompromisosEfectivo:Dt,compromisosEfectivo:F,totalEfectivoMovido:At,efectivoMovido:Q,totalPagosSuplidores:Ot,cambioEntregado:me,cantFacturas:xe,comprasContadoEfectivo:Ga,fondoApertura:T,desde:d,...r?{caja:{apertura_id:r.apertura_id,caja_id:r.caja_id,nombre:r.caja_nombre,cajero_id:r.cajero_id,cajero:r.cajero_nombre}}:{},efectivoEnCaja:jt+Ua-ut-Ot-Ct-wt-$t-Tt-Dt-Ga-At};return a||_!==Za.current||(te(_a),st(!1)),_a},[$,M,C,c,u]);g.useEffect(()=>{U()},[U]),g.useEffect(()=>{const e=()=>{document.hidden||U()};return window.addEventListener("focus",e),document.addEventListener("visibilitychange",e),()=>{window.removeEventListener("focus",e),document.removeEventListener("visibilitychange",e)}},[U]);const nt=(e,a)=>{if(e.tipo){ga(p=>({...p,[e.label]:a}));return}const r=parseInt(a,10);ga(p=>({...p,[e.label]:isNaN(r)?0:r}))};g.useEffect(()=>{w.rpc("get_tasa_dia").then(({data:e})=>{const a=Number(e)||0;a>0&&ga(r=>Number(r["Tasa del día"])>0?r:{...r,"Tasa del día":a})},()=>{})},[]);const G=g.useMemo(()=>wa.reduce((e,a)=>e+$a(a,aa),0),[aa]),B=((i==null?void 0:i.efectivoEnCaja)||0)+((i==null?void 0:i.fondoApertura)||0),Fa=async()=>{var e,a;if(k&&!u){b({variant:"destructive",title:"Escoge la caja",description:"Con varias cajas se cierra una caja a la vez: escoge cuál vas a cerrar."});return}if(k&&((e=i==null?void 0:i.caja)==null?void 0:e.apertura_id)!==u.apertura_id){b({variant:"destructive",title:"Un momento",description:"Todavía se están calculando los montos de esa caja. Vuelve a intentar."});return}if(z&&!Ra){b({variant:"destructive",title:"Un momento",description:"Todavía se está leyendo el turno de la caja de ese día. Vuelve a intentar."});return}ot(!0);try{const r=M==="ALL"?"Todos los Cajeros":((a=Ka.find(_=>_.id===M))==null?void 0:a.nombre_completo)||"N/A",p={tenant_id:C,fecha:u?u.fecha:X($),turno:u?u.turno:ba,cajero_id:u?u.cajero_id:M==="ALL"?v==null?void 0:v.id:M,cajero_nombre:u?`${u.caja_nombre} — ${u.cajero_nombre||""}`:r,total_ventas:(i==null?void 0:i.totalVentas)||0,total_ventas_contado:(i==null?void 0:i.totalVentasContado)||0,total_ventas_contado_caja:(i==null?void 0:i.totalVentasContadoCaja)||0,total_ventas_contado_movil:(i==null?void 0:i.totalVentasContadoMovil)||0,total_ventas_credito:(i==null?void 0:i.totalVentasCredito)||0,total_itbis:(i==null?void 0:i.totalItbis)||0,total_descuento:(i==null?void 0:i.totalDescuento)||0,total_devoluciones:(i==null?void 0:i.totalDevoluciones)||0,total_recibos:(i==null?void 0:i.totalRecibos)||0,total_gastos_diarios:(i==null?void 0:i.totalGastosDiarios)||0,cambio_entregado:(i==null?void 0:i.cambioEntregado)||0,efectivo_en_caja:((i==null?void 0:i.efectivoEnCaja)||0)+((i==null?void 0:i.fondoApertura)||0),total_desglose:G,diferencia:G-(((i==null?void 0:i.efectivoEnCaja)||0)+((i==null?void 0:i.fondoApertura)||0)),desglose:Object.fromEntries(Object.entries(aa).map(([_,d])=>[_,Number(d)||0])),usuario_id:v==null?void 0:v.id,detalle:i?{...i,recibosSinCaja:void 0}:null},{data:x,error:l}=await w.from("cierres_caja").insert([p]).select("id").single();if(l)throw l;const N=(i==null?void 0:i.efectivoEnCaja)||0;if(fa&&N>0&&(x!=null&&x.id)){const{error:_}=await w.rpc("registrar_movimiento_bancario",{p_cuenta_id:fa,p_tipo:"ENTRADA",p_monto:N,p_concepto:u?`Cierre de ${u.caja_nombre} — turno ${u.turno} (${u.fecha})`:`Cierre de caja — turno ${ba} (${X($)})`,p_referencia:null,p_origen_tipo:"cierre_caja",p_origen_id:x.id,p_fecha:u?u.fecha:X($)});_&&b({variant:"destructive",title:"Cierre grabado, pero no se registró en la cuenta",description:_.message})}else N>0&&!fa&&b({variant:"destructive",title:"El efectivo NO entró a ninguna cuenta",description:`Se cerró la caja con ${n(N)} pero no había cuenta seleccionada. Regístralo a mano en Cuentas Bancarias.`});Pa&&rt(p,i),b({title:"Cierre de Caja",description:u?`El cierre de ${u.caja_nombre} quedó registrado.`:`El cierre del turno ${ba} ha sido registrado exitosamente.`}),ga(_=>({...wa.reduce((d,T)=>({...d,[T.label]:0}),{}),"Tasa del día":_["Tasa del día"]||0})),Ma(!1),!sa&&!z&&Sa(_=>Math.min(_+1,Da)),(z||k)&&Vt(ia).then(Xa),U()}catch(r){console.error("Error saving cierre:",r),b({variant:"destructive",title:"Error",description:r.message||"No se pudo registrar el cierre de caja."})}finally{ot(!1)}},E=({label:e,value:a,bold:r,isCount:p,siempre:x})=>x||Number(a)>0?t.jsxs("div",{className:`flex justify-between items-center py-1 ${r?"border-t-2 border-morla-blue pt-2":""}`,children:[t.jsx("span",{className:`text-sm ${r?"font-bold text-morla-blue":"text-gray-600"}`,children:e}),t.jsx("span",{className:`font-mono text-sm ${r?"font-bold text-morla-blue text-base":"text-gray-800"}`,children:p?a:n(a)})]}):null,La=({label:e,value:a})=>t.jsxs("div",{className:"flex justify-between items-center py-1.5 mt-1 border-t-2 border-gray-800",children:[t.jsx("span",{className:"text-sm font-bold text-gray-800 uppercase tracking-wide",children:e}),t.jsx("span",{className:"font-mono text-sm font-bold text-gray-900",children:n(a)})]}),qa=e=>(Number(e==null?void 0:e.totalGastosDiarios)||0)+(Number(e==null?void 0:e.totalPagosNomina)||0)+(Number(e==null?void 0:e.totalPagosTerceros)||0)+(Number(e==null?void 0:e.totalPrestamosEfectivo)||0)+(Number(e==null?void 0:e.totalPagosSuplidores)||0)+(Number(e==null?void 0:e.totalCompromisosEfectivo)||0)+(Number(e==null?void 0:e.comprasContadoEfectivo)||0)+(Number(e==null?void 0:e.totalDevoluciones)||0),Va=e=>(Number((e==null?void 0:e.totalVentasContadoCaja)??(e==null?void 0:e.totalVentasContado))||0)+(Number((e==null?void 0:e.totalRecibosEfectivo)??(e==null?void 0:e.totalRecibos))||0),ee=(e,a)=>{const r=qa(a),p=Va(a),x=(l,N,_=!1,d=!1)=>d||Number(N)>0?`<tr${_?' class="bold"':""}><td>${l}</td><td class="num">${n(N)}</td></tr>`:"";return`
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
            <div><b>Fecha:</b> ${ca(e.fecha)}</div>
            <div><b>Turno:</b> ${e.turno}</div>
            <div><b>Cajero:</b> ${e.cajero_nombre}</div>
            ${e._reimpresion?'<div style="color:#b45309;font-weight:bold">REIMPRESIÓN</div>':""}
          </div>
        </div>
        ${e._reimpresion?`<div style="margin-top:8px;padding:4px 8px;border:1px solid #b45309;color:#b45309;font-size:11px">
          Copia del cierre grabado el ${ca(e.created_at||e.fecha)}. No es un cierre nuevo.
          ${e._reconstruido?"<br>Este cierre es anterior al guardado del detalle: el desglose se reconstruyó con los movimientos de esa fecha. Los totales de caja y el conteo de billetes son los que quedaron grabados.":""}
          ${e._descuadre?`<br><b>Ojo:</b> hoy esa fecha da ${n(e._descuadre)} de efectivo, distinto de los ${n(e.efectivo_en_caja)} que se grabaron. Manda lo grabado.`:""}
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
              ${((a==null?void 0:a.recibosPorCuenta)||[]).map(l=>x(`&nbsp;&nbsp;&nbsp;&nbsp;↳ ${Gt(l.etiqueta)}`,l.monto,!1,!0)).join("")}`:""}
            </tbody></table>
            <!-- De todo lo que entró, lo que de verdad llegó a la gaveta. -->
            <div class="linea-fuerte"><span>TOTAL INGRESO EN CAJA</span><span>${n(p)}</span></div>

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
                ${Qa.filter(l=>Number(e.desglose[l.label]||0)>0&&(l.tipo!=="tasa"||Number(e.desglose.Dólares||0)>0)).map(l=>{const N=e.desglose[l.label]||0,_=$a(l,e.desglose);return`<tr><td>${l.label}</td><td class="num">${N}</td><td class="num">${l.tipo==="tasa"?"":n(_)}</td></tr>`}).join("")}
                <tr class="grande"><td colspan="2">Total Desglose</td><td class="num">${n(e.total_desglose)}</td></tr>
                <tr class="grande"><td colspan="2">Diferencia${e.diferencia<0?" (FALTANTE)":e.diferencia>0?" (SOBRANTE)":""}</td><td class="num">${n(e.diferencia)}</td></tr>
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
    `},rt=(e,a)=>{const r=(lt||(y==null?void 0:y.formato_cierre_caja)||"pos_80mm")==="carta",p=qa(a),x=Va(a),l=(d,T,I={})=>I.siempre||Number(T)>0?`<div class="row${I.total?" total-row":""}"><span>${d}:</span><span${I.bold?' class="bold"':""}>${n(T)}</span></div>`:"",N=r?ee(e,a):`
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
          ${e._reimpresion?'<p class="bold" style="margin:2px 0;font-size:12px;">** REIMPRESION **</p>':""}
        </div>
        <div class="separator"></div>
        <div class="row"><span>Fecha:</span><span>${ca(e.fecha)}</span></div>
        <div class="row"><span>Turno:</span><span>${e.turno}</span></div>
        <div class="row"><span>Cajero:</span><span>${e.cajero_nombre}</span></div>
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
        ${((a==null?void 0:a.recibosPorCuenta)||[]).map(d=>l(`&nbsp;&nbsp;&nbsp;&nbsp;↳ ${Gt(d.etiqueta)}`,d.monto,{siempre:!0})).join("")}`:""}
        <div class="row total-row"><span>TOTAL INGRESO EN CAJA:</span><span>${n(x)}</span></div>
        ${((a==null?void 0:a.gastosDiarios)||[]).length?`
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">DESGLOSE DE GASTOS</div>
        ${a.gastosDiarios.map(d=>`
          <div class="row">
            <span style="max-width: 70%;">${d.tipo_gasto||"GASTO"}${d.descripcion?` — ${d.descripcion}`:""}</span>
            <span>${n(d.monto)}</span>
          </div>`).join("")}
        <div class="row" style="border-top: 1px solid #000; padding-top: 2px; margin-top: 2px;">
          <span>Total Gastos:</span><span>${n(a==null?void 0:a.totalGastosDiarios)}</span>
        </div>`:""}
        ${((a==null?void 0:a.pagosNomina)||[]).length?`
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">NOMINA PAGADA HOY</div>
        ${a.pagosNomina.map(d=>`
          <div class="row">
            <span style="max-width: 70%;">${d.descripcion||"NOMINA"}</span>
            <span>${n(d.monto)}</span>
          </div>`).join("")}
        <div class="row" style="border-top: 1px solid #000; padding-top: 2px; margin-top: 2px;">
          <span>Total Nomina:</span><span>${n(a==null?void 0:a.totalPagosNomina)}</span>
        </div>`:""}
        ${((a==null?void 0:a.pagosTerceros)||[]).length?`
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">PAGOS A TERCEROS</div>
        ${a.pagosTerceros.map(d=>`
          <div class="row">
            <span style="max-width: 70%;">${d.concepto_tercero||"TERCERO"}${d.descripcion?` — ${d.descripcion}`:""}</span>
            <span>${n(d.monto)}</span>
          </div>`).join("")}
        <div class="row" style="border-top: 1px solid #000; padding-top: 2px; margin-top: 2px;">
          <span>Total a terceros:</span><span>${n(a==null?void 0:a.totalPagosTerceros)}</span>
        </div>`:""}
        ${((a==null?void 0:a.prestamosEfectivo)||[]).length?`
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">PRÉSTAMOS (EFECTIVO)</div>
        ${a.prestamosEfectivo.map(d=>{var T;return`
          <div class="row">
            <span style="max-width: 70%;">${((T=d.clientes)==null?void 0:T.nombre)||d.numero||"PRÉSTAMO"}</span>
            <span>${n(d.monto_capital)}</span>
          </div>`}).join("")}
        <div class="row" style="border-top: 1px solid #000; padding-top: 2px; margin-top: 2px;">
          <span>Total Préstamos:</span><span>${n(a==null?void 0:a.totalPrestamosEfectivo)}</span>
        </div>`:""}
        ${((a==null?void 0:a.compromisosEfectivo)||[]).length?`
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">COMPROMISOS (EFECTIVO)</div>
        ${a.compromisosEfectivo.map(d=>`
          <div class="row">
            <span style="max-width: 70%;">${d.nombre||"COMPROMISO"}</span>
            <span>${n(d.monto_efectivo!==void 0?d.monto_efectivo:d.monto)}</span>
          </div>
          ${(d.empleados||[]).map(T=>`
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
        <div class="row total-row"><span>GASTO TOTAL:</span><span>${n(p)}</span></div>
        ${((a==null?void 0:a.efectivoMovido)||[]).length?`
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">EFECTIVO MOVIDO A CUENTAS (NO ES GASTO)</div>
        ${a.efectivoMovido.map(d=>`
          <div class="row">
            <span style="max-width: 70%;">${d.cuenta}${d.moneda&&d.moneda!=="DOP"?` (US$${Number(d.monto_cuenta).toLocaleString("es-DO",{minimumFractionDigits:2})} a ${Number(d.tasa)})`:""}</span>
            <span>${n(d.monto_caja)}</span>
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
        ${Qa.filter(d=>Number(e.desglose[d.label]||0)>0&&(d.tipo!=="tasa"||Number(e.desglose.Dólares||0)>0)).map(d=>{const T=e.desglose[d.label]||0,I=$a(d,e.desglose);return`<div class="row">
            <span style="flex: 1;">${d.label}</span>
            <span class="text-right" style="width: 42px;">${T}</span>
            <span class="text-right" style="width: 84px;">${d.tipo==="tasa"?"":n(I)}</span>
          </div>`}).join("")}
        <div class="row total-row"><span>Total Desglose:</span><span>${n(e.total_desglose)}</span></div>
        <div class="row" style="margin-top: 6px; font-weight: 900; font-size: 16px;">
          <span>Diferencia${e.diferencia<0?" (FALTANTE)":e.diferencia>0?" (SOBRANTE)":""}:</span>
          <span>${n(e.diferencia)}</span>
        </div>
        <div class="separator"></div>
        <p class="text-center" style="margin-top: 10px; font-size: 13px;">*** FIN DEL CIERRE ***</p>
      </body>
      </html>
    `,_=document.createElement("iframe");_.style.cssText="position:fixed;right:0;bottom:0;width:0;height:0;border:0;",document.body.appendChild(_),_.contentWindow.document.open(),_.contentWindow.document.write(N),_.contentWindow.document.close(),setTimeout(()=>{document.body.contains(_)&&document.body.removeChild(_)},3e3)},ct=g.useCallback(async()=>{if(!C)return;const{data:e,error:a}=await w.from("cierres_caja").select("*").eq("tenant_id",C).order("created_at",{ascending:!1}).limit(60);a||Qt(e||[])},[C]);g.useEffect(()=>{xa&&ct()},[xa,ct]);const[dt,pt]=g.useState(null),oe=async e=>{pt(e.id);try{const a=!e.detalle,r=e.detalle||await U(e.fecha);if(!r)throw new Error("No se pudo armar el desglose de esa fecha.");const p=Math.abs((Number(r.efectivoEnCaja)||0)-(Number(e.efectivo_en_caja)||0)),x=a?{...r,efectivoEnCaja:e.efectivo_en_caja}:r;rt({...e,_reimpresion:!0,_reconstruido:a,_descuadre:a&&p>.01?r.efectivoEnCaja:null},x)}catch(a){b({variant:"destructive",title:"No se pudo reimprimir",description:a.message})}finally{pt(null)}};return g.useEffect(()=>{const e=a=>{pa==="cierre-caja"&&(a.key==="Escape"&&a.defaultPrevented||(a.key==="F8"&&ma&&(a.preventDefault(),Fa()),a.key==="Escape"&&(a.preventDefault(),ma?Ma(!1):Ta("cierre-caja"))))};return window.addEventListener("keydown",e),()=>window.removeEventListener("keydown",e)},[ma,Fa,Ta,pa]),t.jsxs(t.Fragment,{children:[t.jsx(je,{children:t.jsx("title",{children:"Cierre de Caja — MotoFlow"})}),t.jsx(ue.div,{initial:{opacity:0,y:20},animate:{opacity:1,y:0},className:"p-1 md:p-4 bg-gray-100 min-h-full flex flex-col",children:t.jsxs("div",{className:"bg-white p-4 rounded-lg shadow-md flex-grow flex flex-col",children:[t.jsxs("div",{className:"bg-morla-blue text-white py-1.5 rounded-t-lg mb-3 relative",children:[t.jsx("h1",{className:"text-white font-black tracking-[0.25em] italic uppercase text-base drop-shadow-sm text-center",children:"CIERRE DE CAJA"}),t.jsx("button",{type:"button",onClick:()=>U(),disabled:Ia,title:"Actualizar los montos del día",className:"absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-white/20 disabled:opacity-50",children:t.jsx(_e,{className:`w-4 h-4 ${Ia?"animate-spin":""}`})})]}),$&&X($)!==X(Mt())&&t.jsxs("div",{className:"mb-3 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900",children:[t.jsxs("b",{children:["Estás cerrando una fecha pasada: ",It($,"dd/MM/yyyy"),"."]})," ","Las cifras son las de ese día. Si ya vendiste hoy, el efectivo de la gaveta incluye lo de hoy y no va a cuadrar con el conteo."]}),t.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-4 gap-x-4 gap-y-2 px-3 py-2 border rounded-lg mb-3",children:[t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(la,{className:"font-bold text-xs shrink-0",children:"Fecha"}),t.jsxs(Ae,{children:[t.jsx(Oe,{asChild:!0,children:t.jsxs(na,{variant:"outline",className:Ne("flex-1 min-w-0 h-8 justify-start text-left font-normal text-sm px-2",!$&&"text-muted-foreground"),children:[t.jsx(ye,{className:"mr-1.5 h-3.5 w-3.5 shrink-0"}),$?It($,"dd/MM/yyyy"):t.jsx("span",{children:"Seleccione"})]})}),t.jsx(Re,{className:"w-auto p-0",children:t.jsx(Me,{mode:"single",selected:$,onSelect:Ht,initialFocus:!0})})]})]}),!sa&&!z&&t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(la,{className:"font-bold text-xs shrink-0",children:"Turno"}),t.jsx(Wa,{type:"number",min:"1",max:Da,value:ba,onChange:e=>Sa(parseInt(e.target.value,10)||1),onFocus:e=>e.target.select(),className:"flex-1 min-w-0 h-8 text-center font-bold px-2"})]}),k?t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(la,{className:"font-bold text-xs shrink-0",children:"Caja"}),K.length===0?t.jsx("span",{className:"text-xs text-gray-500",children:c!=null&&c.es_admin?"No hay cajas abiertas.":"No tienes una caja abierta."}):t.jsxs(Na,{value:Aa||"",onValueChange:Oa,children:[t.jsx(ya,{className:"flex-1 min-w-0 h-8 text-sm px-2",children:t.jsx(Ea,{placeholder:"Escoge la caja"})}),t.jsx(Ca,{children:K.map(e=>t.jsxs(ra,{value:e.apertura_id,children:[e.caja_nombre," — ",e.cajero_nombre||"cajero"," · ",e.cerrada?"cerrada (rehacer cierre)":`abierta ${new Date(e.desde).toLocaleTimeString("es-DO",{hour:"numeric",minute:"2-digit"})}`]},e.apertura_id))})]}),Number((bt=i==null?void 0:i.recibosSinCaja)==null?void 0:bt.cantidad)>0&&t.jsxs("span",{className:"text-[11px] font-bold text-amber-700",title:`Los grabó otra empresa del grupo sin caja abierta (o con otra fecha). Los de hoy entran a la primera caja que se abra hoy; los demás hay que cuadrarlos a mano. Fechas: ${(i.recibosSinCaja.fechas||[]).join(", ")}`,children:[i.recibosSinCaja.cantidad," recibo(s) de otra empresa sin caja: ",n(i.recibosSinCaja.monto)]})]}):t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(la,{className:"font-bold text-xs shrink-0",children:"Caja"}),t.jsxs(Na,{value:"caja1",disabled:!0,children:[t.jsx(ya,{className:"flex-1 min-w-0 h-8 text-sm px-2",children:t.jsx(Ea,{})}),t.jsx(Ca,{children:t.jsx(ra,{value:"caja1",children:"Caja No. 1"})})]}),z&&t.jsxs("span",{className:"text-[11px] text-gray-500 whitespace-nowrap",children:["Turno ",(c==null?void 0:c.turno)||1,c!=null&&c.desde?` · abierto ${new Date(c.desde).toLocaleTimeString("es-DO",{hour:"numeric",minute:"2-digit"})}`:" · desde la mañana",c!=null&&c.requiere_apertura?" · cerrado":""]})]}),!k&&t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(la,{className:"font-bold text-xs shrink-0",children:"Cajero"}),t.jsxs(Na,{value:M,onValueChange:at,children:[t.jsx(ya,{className:"flex-1 min-w-0 h-8 text-sm px-2",children:t.jsx(Ea,{placeholder:"Seleccione cajero"})}),t.jsxs(Ca,{children:[t.jsx(ra,{value:"ALL",className:"font-bold text-morla-blue",children:"📊 Todos los Cajeros (Consolidado)"}),Ka.map(e=>t.jsx(ra,{value:e.id,children:e.nombre_completo||e.email},e.id))]})]})]})]}),Ia?t.jsx("div",{className:"flex-grow flex items-center justify-center",children:t.jsx(Ya,{className:"h-8 w-8 animate-spin text-morla-blue"})}):i?t.jsxs("div",{className:"grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4",children:[t.jsxs("div",{className:"border rounded-lg p-4 bg-gradient-to-br from-slate-50 to-blue-50",children:[t.jsx("h2",{className:"font-bold text-sm uppercase text-gray-500 tracking-wider mb-3",children:u?`Resumen de ${u.caja_nombre} — ${u.cajero_nombre||""}`:M==="ALL"?"Resumen Total del Día":"Resumen del Turno"}),t.jsxs("div",{className:"space-y-2",children:[t.jsx(E,{label:"Cantidad de Facturas",value:i.cantFacturas,isCount:!0,siempre:!0}),t.jsx(E,{label:"Ventas Contado Caja",value:i.totalVentasContadoCaja}),t.jsx(E,{label:"Cuenta Contado Móvil",value:i.totalVentasContadoMovil}),t.jsx(E,{label:"Ventas por Transferencia/Tarjeta",value:i.totalVentasContadoNoEfectivo}),t.jsx(E,{label:"Retenido por clientes (pagan a la DGII)",value:i.totalRetencionesContado}),t.jsx(E,{label:"Ventas Crédito",value:i.totalVentasCredito}),t.jsx(E,{label:"Total Ventas",value:i.totalVentas,bold:!0}),Number(i.totalRecibosMovil)>0&&t.jsxs(t.Fragment,{children:[t.jsx(E,{label:"Recibos de Ingreso Caja",value:i.totalRecibosCaja}),t.jsx(E,{label:"Recibos de Ingreso Móvil",value:i.totalRecibosMovil})]}),t.jsx(E,{label:"Recibos de Ingreso (total)",value:i.totalRecibos}),Number(i.totalRecibosOtrasFormas)>0&&t.jsxs(t.Fragment,{children:[t.jsx(E,{label:"· Recibos en Efectivo",value:i.totalRecibosEfectivo}),t.jsx(E,{label:"· Recibos Transf/Cheque/Tarjeta",value:i.totalRecibosOtrasFormas}),(i.recibosPorCuenta||[]).map(e=>{const a=!!Wt[e.etiqueta],r=(e.detalle||[]).length>0;return t.jsxs("div",{className:"pl-4",children:[t.jsxs("button",{type:"button",disabled:!r,onClick:()=>tt(p=>({...p,[e.etiqueta]:!p[e.etiqueta]})),className:"flex w-full items-center justify-between py-1 text-left disabled:cursor-default",title:r?"Ver los recibos":void 0,children:[t.jsxs("span",{className:"flex items-center gap-1 text-sm text-gray-600",children:[r&&t.jsx(Pt,{className:`h-4 w-4 text-morla-blue transition-transform ${a?"":"-rotate-90"}`}),"↳ ",e.etiqueta,r&&t.jsxs("span",{className:"text-xs text-gray-400",children:["(",e.detalle.length,")"]})]}),t.jsx("span",{className:"font-mono text-sm text-gray-800",children:n(e.monto)})]}),a&&r&&t.jsx("div",{className:"mb-1 ml-5 rounded border border-gray-200 bg-white",children:e.detalle.map((p,x)=>t.jsxs("div",{className:"flex items-center justify-between gap-2 border-b border-gray-100 px-2 py-1 text-xs last:border-b-0",children:[t.jsx("span",{className:"min-w-0 truncate text-gray-700",title:p.cliente,children:p.cliente}),t.jsxs("span",{className:"shrink-0 font-mono text-gray-500",children:[p.recibo,p.pago?` · pago ${p.pago}`:""]}),t.jsx("span",{className:"w-24 shrink-0 text-right font-mono text-gray-800",children:n(p.monto)})]},`${p.recibo}-${x}`))})]},e.etiqueta)})]}),t.jsx(La,{label:"Total ingreso en caja",value:Va(i)}),t.jsx(E,{label:"Gastos Diarios",value:i.totalGastosDiarios}),t.jsx(E,{label:"Nómina (Efectivo)",value:i.totalPagosNomina}),(i.pagosNomina||[]).length>0&&t.jsx("div",{className:"mt-1 mb-1 ml-3 pl-3 border-l-2 border-gray-200",children:i.pagosNomina.map(e=>t.jsxs("div",{className:"flex justify-between items-center py-0.5",children:[t.jsx("span",{className:"text-xs text-gray-500 truncate pr-2",title:e.descripcion,children:String(e.descripcion||"Nómina").split("—").pop().trim()}),t.jsx("span",{className:"font-mono text-xs text-gray-600 shrink-0",children:n(e.monto)})]},e.id||e.descripcion))}),t.jsx(E,{label:"Pagos a terceros (GPS, seguro...)",value:i.totalPagosTerceros}),t.jsx(E,{label:"Préstamos (Efectivo)",value:i.totalPrestamosEfectivo}),t.jsx(E,{label:"Compromisos (Efectivo)",value:i.totalCompromisosEfectivo}),(i.compromisosEfectivo||[]).filter(e=>(e.empleados||[]).length>0).map(e=>t.jsxs("div",{className:"mt-1 mb-1 ml-3 pl-3 border-l-2 border-gray-200",children:[t.jsx("p",{className:"text-[11px] font-semibold text-gray-400 uppercase tracking-wide",children:e.nombre}),e.empleados.map((a,r)=>t.jsxs("div",{className:"flex justify-between items-center py-0.5",children:[t.jsx("span",{className:`text-xs truncate pr-2 ${a.yaEnGastos?"text-gray-400 line-through":"text-gray-500"}`,children:a.nombre}),t.jsx("span",{className:`font-mono text-xs shrink-0 ${a.yaEnGastos?"text-gray-400 line-through":"text-gray-600"}`,children:n(a.monto)})]},`${e.id}-${r}`)),Number(e.cubierto)>0&&t.jsxs("p",{className:"text-[10px] text-amber-700 leading-snug mt-0.5",children:[n(e.cubierto)," ya salió como gasto el día de cada pago; aquí solo entra"," ",n(e.monto_efectivo),"."]})]},e.id)),t.jsx(E,{label:"Devoluciones",value:i.totalDevoluciones}),t.jsx(E,{label:"Pagos a Suplidores (Efectivo)",value:i.totalPagosSuplidores}),t.jsx(E,{label:"Compras de contado (Efectivo)",value:i.comprasContadoEfectivo}),t.jsx(La,{label:"Gasto total",value:qa(i)}),(i.efectivoMovido||[]).length>0&&t.jsxs(t.Fragment,{children:[t.jsx("div",{className:"mt-2 mb-1 ml-3 pl-3 border-l-2 border-emerald-200",children:i.efectivoMovido.map(e=>t.jsxs("div",{className:"flex justify-between items-center py-0.5",children:[t.jsxs("span",{className:"text-xs text-gray-500 truncate pr-2",children:[e.cuenta,e.moneda&&e.moneda!=="DOP"?` (US$${Number(e.monto_cuenta).toLocaleString("es-DO",{minimumFractionDigits:2})} a ${Number(e.tasa)})`:"",e.concepto?` · ${e.concepto}`:""]}),t.jsx("span",{className:"font-mono text-xs text-gray-600 shrink-0",children:n(e.monto_caja)})]},e.id))}),t.jsx(La,{label:"Efectivo movido a cuentas (no es gasto)",value:i.totalEfectivoMovido})]}),t.jsxs("div",{className:"flex justify-between items-center py-2 mt-2 bg-morla-blue/10 rounded px-3 border border-morla-blue/30",children:[t.jsx("span",{className:"font-bold text-morla-blue",children:"Efectivo en Caja"}),t.jsx("span",{className:"font-bold text-morla-blue text-lg font-mono",children:n(i.efectivoEnCaja)})]}),Number(i.fondoApertura)>0&&t.jsxs(t.Fragment,{children:[t.jsxs("div",{className:"flex justify-between px-3 py-1 text-sm",children:[t.jsx("span",{children:"+ Fondo de apertura"}),t.jsx("span",{className:"font-mono",children:n(i.fondoApertura)})]}),t.jsxs("div",{className:"flex justify-between items-center py-2 bg-emerald-50 rounded px-3 border border-emerald-200",children:[t.jsx("span",{className:"font-bold text-emerald-800",children:"Debe haber en la gaveta"}),t.jsx("span",{className:"font-bold text-emerald-800 text-lg font-mono",children:n(B)})]})]})]})]}),t.jsx("div",{className:"border rounded-lg p-4 flex flex-col",children:ma?t.jsxs("div",{className:"flex flex-col h-full",children:[t.jsxs("div",{className:"flex items-center justify-between gap-3 mb-2",children:[t.jsx("h3",{className:"font-bold text-sm uppercase tracking-widest text-gray-600",children:"DESGLOSE DE MONEDAS"}),t.jsxs(Na,{value:"DOP",disabled:!0,children:[t.jsx(ya,{className:"w-32 h-7 text-xs",children:t.jsx(Ea,{})}),t.jsx(Ca,{children:t.jsx(ra,{value:"DOP",children:"DOP - PESO"})})]})]}),t.jsx(Ee,{className:"flex-grow border rounded-lg max-h-[380px]",children:t.jsxs(Ft,{children:[t.jsx(Lt,{className:"bg-gray-200 sticky top-0 z-10",children:t.jsxs(da,{className:"h-8",children:[t.jsx(V,{className:"w-20 h-8 py-1 font-bold text-xs",children:"MONEDA"}),t.jsx(V,{className:"w-24 h-8 py-1 font-bold text-center text-xs",children:"CANTIDAD"}),t.jsx(V,{className:"h-8 py-1 text-right font-bold text-xs",children:"VALOR"})]})}),t.jsx(qt,{children:wa.filter(e=>e.tipo!=="tasa").map(e=>{const a=aa[e.label]??0,r=$a(e,aa);return t.jsxs(da,{className:"hover:bg-yellow-50/50",children:[t.jsx(R,{className:"py-0.5 font-semibold text-right pr-4 text-sm whitespace-nowrap",children:e.label}),t.jsx(R,{className:"py-0.5 text-center",children:t.jsx(Wa,{type:"number",min:"0",step:e.tipo?"0.01":"1",value:a,onChange:p=>nt(e,p.target.value),onFocus:p=>p.target.select(),onClick:p=>p.target.select(),className:"w-20 mx-auto text-center h-6 text-sm px-1"})}),t.jsx(R,{className:"py-0.5 text-right font-mono text-sm",children:e.tipo==="dolar"?t.jsxs("div",{className:"flex items-center justify-end gap-2",children:[t.jsx("span",{className:"text-xs text-gray-600 font-sans font-semibold whitespace-nowrap",children:"Tasa del día"}),t.jsx(Wa,{type:"number",min:"0",step:"0.01",value:aa["Tasa del día"]??"",onChange:p=>nt({label:"Tasa del día",tipo:"tasa"},p.target.value),onFocus:p=>p.target.select(),onClick:p=>p.target.select(),className:"w-20 text-center h-6 text-sm px-1"}),t.jsx("span",{className:"min-w-[90px]",children:n(r)})]}):n(r)})]},e.label)})}),t.jsx(Ie,{className:"sticky bottom-0 bg-yellow-100 z-10",children:t.jsxs(da,{className:"font-bold",children:[t.jsx(R,{colSpan:2,className:"py-1 text-right text-red-600 uppercase text-sm",children:"TOTAL ==>"}),t.jsx(R,{className:"py-1 text-right text-red-600 font-mono text-base",children:n(G)})]})})]})}),t.jsx("div",{className:"mt-2 px-2.5 py-2 bg-blue-50 border border-blue-200 rounded-lg",children:t.jsx(Ce,{value:fa,onChange:Zt,moneda:"DOP",contexto:"cierre_caja",label:"Depositar en",inline:!0})}),t.jsxs("div",{className:"mt-3 flex items-center justify-between",children:[t.jsxs("label",{className:"flex items-center gap-2 text-sm cursor-pointer",children:[t.jsx("input",{type:"checkbox",checked:Pa,onChange:e=>Yt(e.target.checked),className:"rounded"}),t.jsx(kt,{className:"h-4 w-4"}),"Imprimir ?"]}),Pa&&t.jsxs("select",{value:lt||(y==null?void 0:y.formato_cierre_caja)||"pos_80mm",onChange:e=>ae(e.target.value),className:"h-9 border border-slate-300 rounded px-2 text-xs font-bold bg-white",title:"Papel del impreso — se recuerda en esta PC",children:[t.jsx("option",{value:"pos_80mm",children:"📑 Ticket 80mm"}),t.jsx("option",{value:"carta",children:"📄 Carta (8.5 x 11)"})]}),t.jsxs(na,{onClick:Fa,disabled:et,className:"bg-morla-blue hover:bg-morla-blue/90 text-white gap-2",children:[et?t.jsx(Ya,{className:"h-4 w-4 animate-spin"}):t.jsx(we,{className:"h-4 w-4"}),"F8 - Grabar y Cerrar ",sa?"Caja":"Turno"]})]}),i&&t.jsxs("div",{className:`mt-3 p-3 rounded-lg text-center font-bold text-sm ${G-B===0?"bg-green-100 text-green-700":G-B<0?"bg-red-100 text-red-700":"bg-yellow-100 text-yellow-700"}`,children:["Diferencia: ",n(G-B),G-B===0&&" ✓ Cuadra",G-B<0&&" (Faltante)",G-B>0&&" (Sobrante)"]})]}):t.jsxs("div",{className:"flex-grow flex flex-col items-center justify-center gap-4",children:[t.jsxs(na,{onClick:()=>Ma(!0),size:"lg",className:"bg-morla-blue hover:bg-morla-blue/90 text-white px-8 py-6 text-base gap-3 shadow-lg",children:[t.jsx(Pe,{className:"h-5 w-5"}),"Contar Efectivo y Cerrar ",sa?"Caja":"Turno"]}),t.jsxs("p",{className:"text-xs text-gray-400 text-center max-w-[260px]",children:["Se cuentan los billetes y al grabar el desglose ",sa?"la caja queda cerrada":"el turno queda cerrado","."]})]})})]}):null,t.jsxs("div",{className:"mt-4 border rounded-lg",children:[t.jsxs("button",{type:"button",onClick:()=>Xt(e=>!e),className:"w-full flex items-center justify-between px-4 py-2 text-left hover:bg-gray-50 transition-colors",children:[t.jsx("span",{className:"text-sm font-semibold text-gray-700",children:"Cierres anteriores"}),t.jsx(Pt,{className:`h-4 w-4 text-gray-400 transition-transform ${xa?"rotate-180":""}`})]}),xa&&t.jsxs("div",{className:"border-t max-h-72 overflow-y-auto",children:[it.length===0?t.jsx("p",{className:"px-4 py-3 text-sm text-gray-400 italic",children:"No hay cierres grabados."}):t.jsxs(Ft,{children:[t.jsx(Lt,{children:t.jsxs(da,{children:[t.jsx(V,{className:"text-xs",children:"Fecha"}),t.jsx(V,{className:"text-xs",children:"Turno"}),t.jsx(V,{className:"text-xs",children:"Cajero"}),t.jsx(V,{className:"text-xs text-right",children:"Efectivo"}),t.jsx(V,{className:"text-xs text-right",children:"Contado"}),t.jsx(V,{className:"text-xs text-right",children:"Diferencia"}),t.jsx(V,{className:"text-xs text-right",children:" "})]})}),t.jsx(qt,{children:it.map(e=>{const a=Number(e.diferencia)||0;return t.jsxs(da,{children:[t.jsx(R,{className:"text-sm py-1.5",children:ca(e.fecha)}),t.jsx(R,{className:"text-sm py-1.5",children:e.turno}),t.jsx(R,{className:"text-sm py-1.5 max-w-[160px] truncate",title:e.cajero_nombre,children:e.cajero_nombre}),t.jsx(R,{className:"text-sm py-1.5 text-right font-mono",children:n(e.efectivo_en_caja)}),t.jsx(R,{className:"text-sm py-1.5 text-right font-mono",children:n(e.total_desglose)}),t.jsx(R,{className:`text-sm py-1.5 text-right font-mono ${Math.abs(a)<.005?"text-green-600":a<0?"text-red-600":"text-amber-600"}`,children:n(a)}),t.jsx(R,{className:"text-right py-1.5",children:t.jsxs(na,{size:"sm",variant:"outline",className:"h-7 gap-1.5 text-xs",disabled:dt===e.id,onClick:()=>oe(e),children:[dt===e.id?t.jsx(Ya,{className:"h-3.5 w-3.5 animate-spin"}):t.jsx(kt,{className:"h-3.5 w-3.5"})," Reimprimir"]})})]},e.id)})})]}),t.jsx("p",{className:"px-4 py-2 text-[11px] text-gray-400 italic border-t",children:"Sale marcado como reimpresión. Los cierres grabados desde hoy salen idénticos al original; los anteriores reconstruyen el desglose con los movimientos de esa fecha, y el efectivo y el conteo de billetes son siempre los que quedaron grabados."})]})]}),t.jsx("div",{className:"mt-auto pt-4 flex justify-end items-center space-x-4 border-t",children:t.jsxs(na,{variant:"outline",onClick:()=>Ta("cierre-caja"),className:"gap-2",children:[t.jsx($e,{className:"h-4 w-4"})," ESC - Salir"]})})]})})]})};export{Ze as default};
