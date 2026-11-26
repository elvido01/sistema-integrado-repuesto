import{V as me,W as ge,aC as ve,r as g,aX as It,aY as X,bZ as he,s as $,j as t,H as je,m as ue,b0 as _e,bc as Pt,L as na,d as ra,bp as Ne,a6 as ye,I as Za,a8 as ya,a9 as Ea,aa as Ca,ab as wa,ac as ca,k as Qa,a5 as Ft,bw as Ee,as as Ce,e as we,bq as da,X as $e,b_ as Te,b$ as Se}from"./index-e15bd427.js";import{m as De,r as Ae,n as Oe}from"./devolucionEfectivo-6fca9242.js";import{P as Re,a as Me,b as Ie}from"./popover-6dd3d874.js";import{C as Pe}from"./calendar-281b6a6a.js";import{T as Lt,a as qt,b as pa,c as q,d as Vt,e as R,f as Fe}from"./table-39cb8272.js";import{c as kt}from"./AbrirCajaModal-45bdc386.js";import{C as Le}from"./coins-7c165c07.js";import{P as Gt}from"./printer-936e8b16.js";import"./index-a452080a.js";import"./index-b796ce67.js";import"./chevron-left-fd3897eb.js";import"./lock-open-df31f9de.js";const Bt="id, numero, monto_pagado, fecha, created_at, origen, formas_pago, usuario_id, clientes(nombre)",qe=`${Bt}, caja_cajero_id, caja_asignada_at, caja_externo`,Xa=[{label:"2,000",value:2e3},{label:"1,000",value:1e3},{label:"500",value:500},{label:"200",value:200},{label:"100",value:100},{label:"50",value:50},{label:"25",value:25},{label:"20",value:20},{label:"10",value:10},{label:"5",value:5},{label:"1",value:1},{label:"Cent.",value:0},{label:"Tarjetas",value:0,tipo:"tarjeta"},{label:"Cheques",value:0,tipo:"cheque"},{label:"Tarjetas/Cheques",value:0,tipo:"tarjeta"},{label:"Dólares",value:0,tipo:"dolar"},{label:"Tasa del día",value:0,tipo:"tasa"},{label:"Otros",value:0,tipo:"otro"}],Ve=new Set(["20","Cent.","Otros","Tarjetas","Cheques"]),$a=Xa.filter(b=>!Ve.has(b.label)),Ta=(b,v)=>{const K=Number(v==null?void 0:v[b.label])||0;return b.tipo==="tasa"?0:b.tipo==="dolar"?K*(Number(v==null?void 0:v["Tasa del día"])||0):b.tipo?K:K*b.value},n=b=>new Intl.NumberFormat("es-DO",{style:"decimal",minimumFractionDigits:2,maximumFractionDigits:2}).format(b||0),j=b=>String(b??"").replace(/[&<>"']/g,v=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[v]),ke=b=>String((b==null?void 0:b.estado)||"").toUpperCase()!=="ANULADA",zt=b=>ke(b)&&!/ - RECIBO$/i.test(String((b==null?void 0:b.forma_pago)||"")),Ut=b=>{const v=String((b==null?void 0:b.forma_pago)||"").toUpperCase(),K=String((b==null?void 0:b.tipo_pago)||"").toUpperCase(),E=String((b==null?void 0:b.notas)||"").toUpperCase();return v==="EFECTIVO"||E.includes("POS_MOVIL")||E.includes("POS MOVIL")||E.includes("MOVIL")||E.includes("MÓVIL")||K.includes("MOVIL")},ao=()=>{var xt;const{toast:b}=me(),{user:v,profile:K,empresa:E,tenantId:w}=ge(),{closePanel:Sa,activePanel:ba}=ve(),[T,Ht]=g.useState(It()),[xa,Da]=g.useState(1),Aa=Math.max(1,parseInt(E==null?void 0:E.turnos_caja_dia,10)||1),sa=Aa<=1,[d,Ka]=g.useState(null),ia=T?X(T):null;g.useEffect(()=>{if(ba!=="cierre-caja"||!ia)return;let e=!0;return kt(ia).then(a=>{e&&Ka(a)}),()=>{e=!1}},[ba,w,ia]);const z=(d==null?void 0:d.modo)==="apertura",V=(d==null?void 0:d.modo)==="varias",[Oa,Ra]=g.useState(null),W=g.useMemo(()=>V?[...(d==null?void 0:d.abiertas)||[],...(d==null?void 0:d.recientes)||[]].filter(e=>(d==null?void 0:d.es_admin)||e.cajero_id===(v==null?void 0:v.id)):[],[V,d,v==null?void 0:v.id]),_=W.find(e=>e.apertura_id===Oa)||null;g.useEffect(()=>{if(!V){Ra(null);return}Ra(e=>{if(e&&W.some(p=>p.apertura_id===e))return e;const a=W.filter(p=>!p.cerrada);return(a.find(p=>p.cajero_id===(v==null?void 0:v.id))||a[0]||{}).apertura_id||null})},[V,W,v==null?void 0:v.id]);const Ma=!!d&&d.fecha===ia;g.useEffect(()=>{z&&Ma&&(d!=null&&d.turno)&&Da(d.turno)},[z,Ma,d==null?void 0:d.turno]);const Wa=g.useRef(0),[at,Jt]=g.useState([]),[M,tt]=g.useState("ALL"),[fa,Ia]=g.useState(!1),[Yt,et]=g.useState({});g.useEffect(()=>{et({})},[T,M,Oa]);const[ot,st]=g.useState(!1),[Pa,it]=g.useState(!1),[Fa,Zt]=g.useState(!0),[lt,Qt]=g.useState([]),[ma,Xt]=g.useState(!1),[ga,Kt]=g.useState(null),[nt,Wt]=g.useState(()=>localStorage.getItem("cierre_caja_paper")||""),ae=e=>{Wt(e),localStorage.setItem("cierre_caja_paper",e)},[i,te]=g.useState(null),[aa,va]=g.useState($a.reduce((e,a)=>({...e,[a.label]:0}),{}));g.useEffect(()=>{(async()=>{const{data:a,error:r}=await $.from("perfiles").select("id, nombre_completo, email").order("nombre_completo");!r&&a&&(Jt(a),tt("ALL"))})()},[v]);const U=g.useCallback(async e=>{const a=!!e;if(!T&&!a)return;a||it(!0);const r=!a&&(d==null?void 0:d.modo)==="varias"?_:null,p=e||(r?r.fecha:X(T)),{desde:f,hasta:l}=he(p),N=!a&&((d==null?void 0:d.modo)==="apertura"&&(d==null?void 0:d.fecha)===p||!!r),c=a?null:++Wa.current,y=r?r.desde||null:N&&d.desde||null,G=r?Number(r.fondo)||0:N&&Number(d.fondo)||0,la=(r==null?void 0:r.cajero_id)||null,ha=la||(M&&M!=="ALL"?M:null),Ga=(r==null?void 0:r.hasta)||null,I=o=>(!y||!!o&&new Date(o)>=new Date(y))&&(!Ga||!!o&&new Date(o)<new Date(Ga));let A=[],ja=[],ta=[],O=[],ea=[],H=[],J=[],Y=[],Z=[],P=[];try{let o=$.from("facturas").select("id, total, itbis, subtotal, descuento, forma_pago, tipo_pago, monto_recibido, cambio, fecha, created_at, notas, estado, retenido_no_cobrado").eq("tenant_id",w).gte("fecha",f).lte("fecha",l);ha&&(o=o.eq("usuario_id",ha));const{data:s,error:m}=await o;m?console.warn("Error cargando ventas:",m.message):A=(s||[]).filter(zt);let x=$.from("facturas").select("id, total, itbis, subtotal, descuento, forma_pago, tipo_pago, monto_recibido, cambio, fecha, created_at, notas, estado, retenido_no_cobrado").eq("tenant_id",w).gte("created_at",f).lte("created_at",l);ha&&(x=x.eq("usuario_id",ha));const{data:S,error:h}=await x;if(h)console.warn("Error cargando ventas moviles:",h.message);else{const F=new Set(A.map(u=>u.id)),D=(S||[]).filter(zt).filter(u=>Ut(u)&&!F.has(u.id));A=[...A,...D]}}catch(o){console.warn("Exception cargando ventas:",o)}try{const{data:o,error:s}=await $.from("devoluciones").select("total_devolucion, efectivo_devuelto, created_at, usuario_id, facturas!inner(forma_pago, tipo_pago, total, retenido_no_cobrado)").eq("tenant_id",w).eq("fecha_devolucion",p);s?console.warn("Error cargando devoluciones:",s.message):ta=o||[]}catch(o){console.warn("Exception cargando devoluciones:",o)}try{const{data:o,error:s}=await $.from("recibos_ingreso").select(qe).eq("tenant_id",w).eq("anulado",!1).eq("fecha",p);if(s){console.warn("Error cargando recibos por fecha:",s.message);const{data:m,error:x}=await $.from("recibos_ingreso").select(Bt).eq("tenant_id",w).eq("anulado",!1).gte("created_at",f).lte("created_at",l);x?console.warn("Error cargando recibos por created_at:",x.message):O=m||[]}else O=o||[];if(r||(d==null?void 0:d.modo)==="varias"){const{data:m,error:x}=await $.from("recibos_ingreso").select("id, fecha, monto_pagado, formas_pago").eq("tenant_id",w).eq("anulado",!1).eq("caja_pendiente",!0).order("fecha",{ascending:!0}).limit(200);x?console.warn("Error cargando recibos sin caja:",x.message):ja=m||[]}console.log(`Recibos encontrados para ${p}:`,O.length,O)}catch(o){console.warn("Exception cargando recibos:",o)}try{const{data:o,error:s}=await $.from("pagos_suplidores").select("monto_pagado, formas_pago, created_at, usuario_id").eq("tenant_id",w).eq("anulado",!1).gte("created_at",f).lte("created_at",l);s?console.warn("Error cargando pagos suplidores:",s.message):ea=o||[]}catch(o){console.warn("Exception cargando pagos suplidores:",o)}try{const{data:o,error:s}=await $.from("gastos_diarios").select("monto, descripcion, tipo_gasto, afecta_caja, cuenta_bancaria_id, es_tercero, concepto_tercero, created_at, usuario_id").eq("tenant_id",w).eq("fecha",p).eq("anulado",!1);if(s)console.warn("Error cargando gastos diarios:",s.message);else{const m=(o||[]).filter(h=>!h.cuenta_bancaria_id&&h.afecta_caja!==!1);J=m.filter(h=>h.es_tercero===!0);const x=h=>/n[oó]mina/i.test(String(h.tipo_gasto||"")),S=m.filter(h=>h.es_tercero!==!0);Y=S.filter(x),H=S.filter(h=>!x(h))}}catch(o){console.warn("Exception cargando gastos diarios:",o)}let za=0;try{const{data:o,error:s}=await $.from("compras").select("numero, total_compra, forma_pago, estado, pagos, created_at, usuario_id").eq("tenant_id",w).ilike("forma_pago","contado").gte("created_at",f).lte("created_at",l);s?console.warn("Error cargando compras de contado:",s.message):za=(o||[]).filter(m=>(m.estado||"")!=="ANULADA"&&I(m.created_at)&&(!la||m.usuario_id===la)).reduce((m,x)=>{const S=Array.isArray(x.pagos)?x.pagos:[];return S.length===0?m+(parseFloat(x.total_compra)||0):m+S.filter(h=>String((h==null?void 0:h.tipo)??"01")==="01"||String((h==null?void 0:h.forma)||"").toLowerCase().includes("efectivo")).reduce((h,F)=>h+(parseFloat(F==null?void 0:F.monto)||0),0)},0)}catch(o){console.warn("Exception cargando compras de contado:",o)}try{const{data:o,error:s}=await $.from("prestamos").select("numero, monto_capital, created_at, created_by, clientes(nombre)").eq("tenant_id",w).ilike("desembolso","efectivo").gte("created_at",f).lte("created_at",l);s?console.warn("Error cargando préstamos en efectivo:",s.message):Z=o||[]}catch(o){console.warn("Exception cargando préstamos en efectivo:",o)}try{const{data:o,error:s}=await $.from("compromisos").select("id, nombre, monto, tipo, forma_pago, fecha_pago").eq("tenant_id",w).eq("activo",!1).gte("fecha_pago",f).lte("fecha_pago",l);if(s)console.warn("Error cargando compromisos pagados:",s.message);else{P=(o||[]).filter(x=>String(x.forma_pago||"Efectivo").toLowerCase().includes("efectivo"));const m=P.filter(x=>String(x.tipo||"").toLowerCase()==="nomina").map(x=>x.id);if(m.length>0){const{data:x}=await $.from("nominas").select("id, compromiso_id, nomina_detalle(neto, pagado_at, gasto_id, empleados(nombre))").eq("tenant_id",w).in("compromiso_id",m).neq("estado","anulada"),S=(x||[]).flatMap(D=>(D.nomina_detalle||[]).map(u=>u.gasto_id)).filter(Boolean),h=new Set;if(S.length>0){const{data:D}=await $.from("gastos_diarios").select("id, anulado").in("id",S);for(const u of D||[])u.anulado&&h.add(u.id)}const F={};for(const D of x||[])F[D.compromiso_id]=(D.nomina_detalle||[]).map(u=>{var L;return{nombre:((L=u.empleados)==null?void 0:L.nombre)||"Empleado",monto:Number(u.neto)||0,yaEnGastos:!!u.gasto_id&&!h.has(u.gasto_id),pagadoAt:u.pagado_at||null}}).filter(u=>u.monto>0).sort((u,L)=>L.monto-u.monto);P=P.map(D=>{const u=F[D.id]||null,L=(u||[]).filter(oa=>oa.yaEnGastos).reduce((oa,Ja)=>oa+Ja.monto,0);return{...D,empleados:u,cubierto:L,monto_efectivo:Math.max((parseFloat(D.monto)||0)-L,0)}})}}}catch(o){console.warn("Exception cargando compromisos pagados:",o)}let Q=[];try{const{data:o,error:s}=await $.from("caja_depositos").select("id, monto_caja, moneda, tasa, monto_cuenta, concepto, cuenta_id, created_at, created_by, cuentas_bancarias(banco, alias)").eq("tenant_id",w).eq("fecha",p).eq("anulado",!1).order("created_at");s?console.warn("Error cargando efectivo movido a cuentas:",s.message):Q=(o||[]).map(m=>({...m,cuenta:m.cuentas_bancarias?`${m.cuentas_bancarias.banco}${m.cuentas_bancarias.alias?` — ${m.cuentas_bancarias.alias}`:""}`:"cuenta"}))}catch(o){console.warn("Exception cargando efectivo movido a cuentas:",o)}const se=o=>o.caja_asignada_at||o.created_at,ie=o=>o.caja_cajero_id||(o.caja_externo?null:o.usuario_id);if((y||Ga)&&(A=A.filter(o=>I(o.created_at)),ta=ta.filter(o=>I(o.created_at)),O=O.filter(o=>I(se(o))),ea=ea.filter(o=>I(o.created_at)),H=H.filter(o=>I(o.created_at)),J=J.filter(o=>I(o.created_at)),Y=Y.filter(o=>I(o.created_at)),Z=Z.filter(o=>I(o.created_at)),P=P.filter(o=>I(o.fecha_pago)),Q=Q.filter(o=>I(o.created_at))),la){const o=s=>s===la;ta=ta.filter(s=>o(s.usuario_id)),O=O.filter(s=>o(ie(s))),ea=ea.filter(s=>o(s.usuario_id)),H=H.filter(s=>o(s.usuario_id)),J=J.filter(s=>o(s.usuario_id)),Y=Y.filter(s=>o(s.usuario_id)),Z=Z.filter(s=>o(s.created_by)),Q=Q.filter(s=>o(s.created_by)),P=[]}const ua=A.filter(o=>{const s=String(o.forma_pago||"").toUpperCase();return s==="CONTADO"||s==="EFECTIVO"}),ft=ua.reduce((o,s)=>o+(parseFloat(s.total)||0),0),le=Ae,mt=Oe,gt=ua.reduce((o,s)=>o+le(s),0),vt=ua.filter(Ut).reduce((o,s)=>o+mt(s),0),ht=o=>{const s=String(o.tipo_pago||"").toUpperCase();return!s||s.includes("EFECTIVO")},jt=ua.filter(o=>!ht(o)).reduce((o,s)=>o+mt(s),0),ut=Math.max(0,ft-gt-vt-jt),ne=A.filter(o=>String(o.forma_pago||"").toUpperCase()==="CREDITO").reduce((o,s)=>o+(parseFloat(s.total)||0),0),re=A.reduce((o,s)=>o+(parseFloat(s.total)||0),0),ce=A.reduce((o,s)=>o+(parseFloat(s.itbis)||0),0),de=A.reduce((o,s)=>o+(parseFloat(s.descuento)||0),0),_t=ta.filter(o=>{var m;const s=String(((m=o.facturas)==null?void 0:m.forma_pago)||"").toUpperCase();return(s==="CONTADO"||s==="EFECTIVO")&&ht(o.facturas||{})}).reduce((o,s)=>o+De(s,s.facturas),0),Ua=O.reduce((o,s)=>o+(parseFloat(s.monto_pagado)||0),0),Nt=O.filter(o=>String(o.origen||"").toLowerCase()==="movil").reduce((o,s)=>o+(parseFloat(s.monto_pagado)||0),0),pe=Math.max(0,Ua-Nt),yt=o=>{const s=Array.isArray(o.formas_pago)?o.formas_pago:null;return!s||!s.length?parseFloat(o.monto_pagado)||0:s.reduce((m,x)=>m+(String(x.forma||"").toLowerCase().includes("efectivo")&&parseFloat(x.monto)||0),0)},Ba=O.reduce((o,s)=>o+yt(s),0),Et=Math.max(0,Ua-Ba),Ha=new Map;O.forEach(o=>{(Array.isArray(o.formas_pago)?o.formas_pago:[]).forEach(s=>{var Mt;if(String(s.forma||"").toLowerCase().includes("efectivo"))return;const m=parseFloat(s.monto)||0;if(m<=0)return;const x=Ya=>String(Ya||"").trim().replace(/\s+/g," "),S=s.alias?`${x(s.alias)}${s.banco?` (${x(s.banco)})`:""}`:[x(s.banco),x(s.cuenta)].filter(Boolean).join(" "),h=x(s.forma)||"Otra forma",F=h.charAt(0).toUpperCase()+h.slice(1).toLowerCase(),D=S?`${F} → ${S}`:F,u=D.toUpperCase(),L=Ha.get(u)||{etiqueta:D,monto:0,detalle:[]};L.monto+=m;const oa=Ya=>String(Ya||"").replace(/\D/g,""),Ja=s.cuenta_id&&/^\d{7}$/.test(String(s.referencia||""))&&oa(s.referencia)!==oa(o.numero)?s.referencia:null;L.detalle.push({cliente:((Mt=o.clientes)==null?void 0:Mt.nombre)||"Cliente genérico",recibo:o.numero||"—",pago:Ja,monto:m}),Ha.set(u,L)})});const _a=[...Ha.values()].map(o=>({etiqueta:o.etiqueta,monto:o.monto,detalle:o.detalle})),be=_a.reduce((o,s)=>o+s.monto,0),Ct=Math.round((Et-be)*100)/100;_a.length&&Ct>=.01&&_a.push({etiqueta:"Sin forma detallada",monto:Ct});const wt=H.reduce((o,s)=>o+(parseFloat(s.monto)||0),0),$t=J.reduce((o,s)=>o+(parseFloat(s.monto)||0),0),Tt=Y.reduce((o,s)=>o+(parseFloat(s.monto)||0),0),St=Z.reduce((o,s)=>o+(parseFloat(s.monto_capital)||0),0),Dt=o=>o.monto_efectivo!==void 0?parseFloat(o.monto_efectivo)||0:parseFloat(o.monto)||0;P=P.filter(o=>Dt(o)>0);const At=P.reduce((o,s)=>o+Dt(s),0),Ot=Q.reduce((o,s)=>o+(parseFloat(s.monto_caja)||0),0),Rt=ea.reduce((o,s)=>{const m=(s.formas_pago||[]).filter(x=>x.forma==="Efectivo").reduce((x,S)=>x+(parseFloat(S.monto)||0),0);return o+m},0),xe=A.filter(o=>o.forma_pago==="CONTADO").reduce((o,s)=>o+(parseFloat(s.cambio)||0),0),fe=A.length,Na={recibosSinCaja:{cantidad:ja.length,monto:ja.reduce((o,s)=>o+yt(s),0),fechas:[...new Set(ja.map(o=>o.fecha).filter(Boolean))]},totalVentas:re,totalVentasContado:ft,totalVentasContadoCaja:ut,totalVentasContadoMovil:vt,totalVentasContadoNoEfectivo:jt,totalRetencionesContado:gt,totalVentasCredito:ne,totalItbis:ce,totalDescuento:de,totalDevoluciones:_t,totalRecibos:Ua,totalRecibosMovil:Nt,totalRecibosCaja:pe,totalRecibosEfectivo:Ba,totalRecibosOtrasFormas:Et,recibosPorCuenta:_a,totalGastosDiarios:wt,gastosDiarios:H,totalPagosTerceros:$t,pagosTerceros:J,totalPagosNomina:Tt,pagosNomina:Y,totalPrestamosEfectivo:St,prestamosEfectivo:Z,totalCompromisosEfectivo:At,compromisosEfectivo:P,totalEfectivoMovido:Ot,efectivoMovido:Q,totalPagosSuplidores:Rt,cambioEntregado:xe,cantFacturas:fe,comprasContadoEfectivo:za,fondoApertura:G,desde:y,...r?{caja:{apertura_id:r.apertura_id,caja_id:r.caja_id,nombre:r.caja_nombre,cajero_id:r.cajero_id,cajero:r.cajero_nombre}}:{},efectivoEnCaja:ut+Ba-_t-Rt-wt-$t-Tt-St-At-za-Ot};return a||c!==Wa.current||(te(Na),it(!1)),Na},[T,M,w,d,_]);g.useEffect(()=>{U()},[U]),g.useEffect(()=>{const e=()=>{document.hidden||U()};return window.addEventListener("focus",e),document.addEventListener("visibilitychange",e),()=>{window.removeEventListener("focus",e),document.removeEventListener("visibilitychange",e)}},[U]);const rt=(e,a)=>{if(e.tipo){va(p=>({...p,[e.label]:a}));return}const r=parseInt(a,10);va(p=>({...p,[e.label]:isNaN(r)?0:r}))};g.useEffect(()=>{$.rpc("get_tasa_dia").then(({data:e})=>{const a=Number(e)||0;a>0&&va(r=>Number(r["Tasa del día"])>0?r:{...r,"Tasa del día":a})},()=>{})},[]);const k=g.useMemo(()=>$a.reduce((e,a)=>e+Ta(a,aa),0),[aa]),B=((i==null?void 0:i.efectivoEnCaja)||0)+((i==null?void 0:i.fondoApertura)||0),La=async()=>{var e,a;if(V&&!_){b({variant:"destructive",title:"Escoge la caja",description:"Con varias cajas se cierra una caja a la vez: escoge cuál vas a cerrar."});return}if(V&&((e=i==null?void 0:i.caja)==null?void 0:e.apertura_id)!==_.apertura_id){b({variant:"destructive",title:"Un momento",description:"Todavía se están calculando los montos de esa caja. Vuelve a intentar."});return}if(z&&!Ma){b({variant:"destructive",title:"Un momento",description:"Todavía se está leyendo el turno de la caja de ese día. Vuelve a intentar."});return}st(!0);try{const r=M==="ALL"?"Todos los Cajeros":((a=at.find(c=>c.id===M))==null?void 0:a.nombre_completo)||"N/A",p={tenant_id:w,fecha:_?_.fecha:X(T),turno:_?_.turno:xa,cajero_id:_?_.cajero_id:M==="ALL"?v==null?void 0:v.id:M,cajero_nombre:_?`${_.caja_nombre} — ${_.cajero_nombre||""}`:r,total_ventas:(i==null?void 0:i.totalVentas)||0,total_ventas_contado:(i==null?void 0:i.totalVentasContado)||0,total_ventas_contado_caja:(i==null?void 0:i.totalVentasContadoCaja)||0,total_ventas_contado_movil:(i==null?void 0:i.totalVentasContadoMovil)||0,total_ventas_credito:(i==null?void 0:i.totalVentasCredito)||0,total_itbis:(i==null?void 0:i.totalItbis)||0,total_descuento:(i==null?void 0:i.totalDescuento)||0,total_devoluciones:(i==null?void 0:i.totalDevoluciones)||0,total_recibos:(i==null?void 0:i.totalRecibos)||0,total_gastos_diarios:(i==null?void 0:i.totalGastosDiarios)||0,cambio_entregado:(i==null?void 0:i.cambioEntregado)||0,efectivo_en_caja:((i==null?void 0:i.efectivoEnCaja)||0)+((i==null?void 0:i.fondoApertura)||0),total_desglose:k,diferencia:k-(((i==null?void 0:i.efectivoEnCaja)||0)+((i==null?void 0:i.fondoApertura)||0)),desglose:Object.fromEntries(Object.entries(aa).map(([c,y])=>[c,Number(y)||0])),usuario_id:v==null?void 0:v.id,detalle:i?{...i,recibosSinCaja:void 0}:null},{data:f,error:l}=await $.from("cierres_caja").insert([p]).select("id").single();if(l)throw l;const N=(i==null?void 0:i.efectivoEnCaja)||0;if(ga&&N>0&&(f!=null&&f.id)){const{error:c}=await $.rpc("registrar_movimiento_bancario",{p_cuenta_id:ga,p_tipo:"ENTRADA",p_monto:N,p_concepto:_?`Cierre de ${_.caja_nombre} — turno ${_.turno} (${_.fecha})`:`Cierre de caja — turno ${xa} (${X(T)})`,p_referencia:null,p_origen_tipo:"cierre_caja",p_origen_id:f.id,p_fecha:_?_.fecha:X(T)});c&&b({variant:"destructive",title:"Cierre grabado, pero no se registró en la cuenta",description:c.message})}else N>0&&!ga&&b({variant:"destructive",title:"El efectivo NO entró a ninguna cuenta",description:`Se cerró la caja con ${n(N)} pero no había cuenta seleccionada. Regístralo a mano en Cuentas Bancarias.`});Fa&&ct(p,i),b({title:"Cierre de Caja",description:_?`El cierre de ${_.caja_nombre} quedó registrado.`:`El cierre del turno ${xa} ha sido registrado exitosamente.`}),va(c=>({...$a.reduce((y,G)=>({...y,[G.label]:0}),{}),"Tasa del día":c["Tasa del día"]||0})),Ia(!1),!sa&&!z&&Da(c=>Math.min(c+1,Aa)),(z||V)&&kt(ia).then(Ka),U()}catch(r){console.error("Error saving cierre:",r),b({variant:"destructive",title:"Error",description:r.message||"No se pudo registrar el cierre de caja."})}finally{st(!1)}},C=({label:e,value:a,bold:r,isCount:p,siempre:f})=>f||Number(a)>0?t.jsxs("div",{className:`flex justify-between items-center py-1 ${r?"border-t-2 border-morla-blue pt-2":""}`,children:[t.jsx("span",{className:`text-sm ${r?"font-bold text-morla-blue":"text-gray-600"}`,children:e}),t.jsx("span",{className:`font-mono text-sm ${r?"font-bold text-morla-blue text-base":"text-gray-800"}`,children:p?a:n(a)})]}):null,qa=({label:e,value:a})=>t.jsxs("div",{className:"flex justify-between items-center py-1.5 mt-1 border-t-2 border-gray-800",children:[t.jsx("span",{className:"text-sm font-bold text-gray-800 uppercase tracking-wide",children:e}),t.jsx("span",{className:"font-mono text-sm font-bold text-gray-900",children:n(a)})]}),Va=e=>(Number(e==null?void 0:e.totalGastosDiarios)||0)+(Number(e==null?void 0:e.totalPagosNomina)||0)+(Number(e==null?void 0:e.totalPagosTerceros)||0)+(Number(e==null?void 0:e.totalPrestamosEfectivo)||0)+(Number(e==null?void 0:e.totalPagosSuplidores)||0)+(Number(e==null?void 0:e.totalCompromisosEfectivo)||0)+(Number(e==null?void 0:e.comprasContadoEfectivo)||0)+(Number(e==null?void 0:e.totalDevoluciones)||0),ka=e=>(Number((e==null?void 0:e.totalVentasContadoCaja)??(e==null?void 0:e.totalVentasContado))||0)+(Number((e==null?void 0:e.totalRecibosEfectivo)??(e==null?void 0:e.totalRecibos))||0),ee=(e,a)=>{const r=Va(a),p=ka(a),f=(l,N,c=!1,y=!1)=>y||Number(N)>0?`<tr${c?' class="bold"':""}><td>${l}</td><td class="num">${n(N)}</td></tr>`:"";return`
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
            <h1>${j(((E==null?void 0:E.nombre)||"MotoFlow").toUpperCase())}</h1>
            <div class="sub">CIERRE DE CAJA</div>
          </div>
          <div class="meta">
            <div><b>Fecha:</b> ${da(e.fecha)}</div>
            <div><b>Turno:</b> ${e.turno}</div>
            <div><b>Cajero:</b> ${j(e.cajero_nombre)}</div>
            ${e._reimpresion?'<div style="color:#b45309;font-weight:bold">REIMPRESIÓN</div>':""}
          </div>
        </div>
        ${e._reimpresion?`<div style="margin-top:8px;padding:4px 8px;border:1px solid #b45309;color:#b45309;font-size:11px">
          Copia del cierre grabado el ${da(e.created_at||e.fecha)}. No es un cierre nuevo.
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
              ${f("Ventas Contado Caja",a==null?void 0:a.totalVentasContadoCaja)}
              ${f("Ventas Contado Móvil",a==null?void 0:a.totalVentasContadoMovil)}
              ${f("Ventas por Transferencia/Tarjeta",a==null?void 0:a.totalVentasContadoNoEfectivo)}
              ${Number(a==null?void 0:a.totalRetencionesContado)>0?f("Retenido por clientes (pagan a la DGII)",a==null?void 0:a.totalRetencionesContado):""}
              ${f("Ventas Crédito",a==null?void 0:a.totalVentasCredito)}
              ${f("Total Ventas",a==null?void 0:a.totalVentas,!0)}
              ${Number(a==null?void 0:a.totalRecibosMovil)>0?`
              ${f("Recibos Ingreso Caja",a==null?void 0:a.totalRecibosCaja)}
              ${f("Recibos Ingreso Móvil",a==null?void 0:a.totalRecibosMovil)}`:""}
              ${f("Recibos Ingreso (total)",a==null?void 0:a.totalRecibos,!0)}
              ${Number(a==null?void 0:a.totalRecibosOtrasFormas)>0?`
              ${f("· Recibos en Efectivo",a==null?void 0:a.totalRecibosEfectivo)}
              ${f("· Recibos Transf/Cheque/Tarjeta",a==null?void 0:a.totalRecibosOtrasFormas)}
              ${((a==null?void 0:a.recibosPorCuenta)||[]).map(l=>f(`&nbsp;&nbsp;&nbsp;&nbsp;↳ ${j(l.etiqueta)}`,l.monto,!1,!0)).join("")}`:""}
            </tbody></table>
            <!-- De todo lo que entró, lo que de verdad llegó a la gaveta. -->
            <div class="linea-fuerte"><span>TOTAL INGRESO EN CAJA</span><span>${n(p)}</span></div>

            ${((a==null?void 0:a.gastosDiarios)||[]).length?`
            <div class="sec">Desglose de Gastos</div>
            <table><tbody>
              ${a.gastosDiarios.map(l=>`<tr><td>${j(l.tipo_gasto||"GASTO")}${l.descripcion?` — ${j(l.descripcion)}`:""}</td><td class="num">${n(l.monto)}</td></tr>`).join("")}
              <tr class="bold"><td>Total Gastos</td><td class="num">${n(a==null?void 0:a.totalGastosDiarios)}</td></tr>
            </tbody></table>`:""}

            ${((a==null?void 0:a.pagosNomina)||[]).length?`
            <div class="sec">Nómina pagada hoy (efectivo)</div>
            <table><tbody>
              ${a.pagosNomina.map(l=>`<tr><td>${j(l.descripcion||"NÓMINA")}</td><td class="num">${n(l.monto)}</td></tr>`).join("")}
              <tr class="bold"><td>Total Nómina</td><td class="num">${n(a==null?void 0:a.totalPagosNomina)}</td></tr>
            </tbody></table>`:""}

            ${((a==null?void 0:a.pagosTerceros)||[]).length?`
            <div class="sec">Pagos a terceros (no son gastos de la empresa)</div>
            <table><tbody>
              ${a.pagosTerceros.map(l=>`<tr><td>${j(l.concepto_tercero||"TERCERO")}${l.descripcion?` — ${j(l.descripcion)}`:""}</td><td class="num">${n(l.monto)}</td></tr>`).join("")}
              <tr class="bold"><td>Total entregado a terceros</td><td class="num">${n(a==null?void 0:a.totalPagosTerceros)}</td></tr>
            </tbody></table>`:""}

            ${((a==null?void 0:a.prestamosEfectivo)||[]).length?`
            <div class="sec">Préstamos (Efectivo)</div>
            <table><tbody>
              ${a.prestamosEfectivo.map(l=>{var N;return`<tr><td>${j(((N=l.clientes)==null?void 0:N.nombre)||"PRÉSTAMO")}${l.numero?` — ${j(l.numero)}`:""}</td><td class="num">${n(l.monto_capital)}</td></tr>`}).join("")}
              <tr class="bold"><td>Total Préstamos</td><td class="num">${n(a==null?void 0:a.totalPrestamosEfectivo)}</td></tr>
            </tbody></table>`:""}

            ${((a==null?void 0:a.compromisosEfectivo)||[]).length?`
            <div class="sec">Compromisos (Efectivo)</div>
            <table><tbody>
              ${a.compromisosEfectivo.map(l=>`
                <tr><td>${j(l.nombre||"COMPROMISO")}${l.tipo?` — ${j(l.tipo)}`:""}</td><td class="num">${n(l.monto_efectivo!==void 0?l.monto_efectivo:l.monto)}</td></tr>
                ${(l.empleados||[]).map(N=>`<tr><td style="padding-left:14px;color:#555">· ${j(N.nombre)}${N.yaEnGastos?` <i>(ya salió ${N.pagadoAt?da(N.pagadoAt):"antes"}, en Gastos)</i>`:""}</td><td class="num" style="color:#555">${n(N.monto)}</td></tr>`).join("")}
              `).join("")}
              <tr class="bold"><td>Total Compromisos</td><td class="num">${n(a==null?void 0:a.totalCompromisosEfectivo)}</td></tr>
            </tbody></table>`:""}

            <!-- Las salidas que no tienen desglose propio. Si están en cero no
                 aparecen, pero cuando existen tienen que verse: si no, el
                 GASTO TOTAL de abajo saldría con dinero que no se explica. -->
            ${Number(a==null?void 0:a.totalDevoluciones)>0||Number(a==null?void 0:a.totalPagosSuplidores)>0||Number(a==null?void 0:a.comprasContadoEfectivo)>0?`
            <div class="sec">Otras salidas</div>
            <table><tbody>
              ${f("Devoluciones",a==null?void 0:a.totalDevoluciones)}
              ${f("Pagos Suplidores (Efectivo)",a==null?void 0:a.totalPagosSuplidores)}
              ${f("Compras de contado (Efectivo)",a==null?void 0:a.comprasContadoEfectivo)}
            </tbody></table>`:""}

            <div class="linea-fuerte"><span>GASTO TOTAL</span><span>${n(r)}</span></div>

            ${((a==null?void 0:a.efectivoMovido)||[]).length?`
            <!-- (24/10/2026) No es gasto: el efectivo pasó a una cuenta (compra de
                 dólares, depósito). Va aparte para que el cuadre se vea entero. -->
            <div class="sec">Efectivo movido a cuentas (no es gasto)</div>
            <table><tbody>
              ${a.efectivoMovido.map(l=>`<tr><td>${j(l.cuenta)}${l.moneda&&l.moneda!=="DOP"?` — US$${Number(l.monto_cuenta).toLocaleString("es-DO",{minimumFractionDigits:2})} a ${Number(l.tasa)}`:""}${l.concepto?` · ${j(l.concepto)}`:""}</td><td class="num">${n(l.monto_caja)}</td></tr>`).join("")}
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
                ${Xa.filter(l=>Number(e.desglose[l.label]||0)>0&&(l.tipo!=="tasa"||Number(e.desglose.Dólares||0)>0)).map(l=>{const N=e.desglose[l.label]||0,c=Ta(l,e.desglose);return`<tr><td>${l.label}</td><td class="num">${N}</td><td class="num">${l.tipo==="tasa"?"":n(c)}</td></tr>`}).join("")}
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
    `},ct=(e,a)=>{const r=(nt||(E==null?void 0:E.formato_cierre_caja)||"pos_80mm")==="carta",p=Va(a),f=ka(a),l=(c,y,G={})=>G.siempre||Number(y)>0?`<div class="row${G.total?" total-row":""}"><span>${c}:</span><span${G.bold?' class="bold"':""}>${n(y)}</span></div>`:"",N=r?ee(e,a):`
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
          <h1 class="bold">${j(((E==null?void 0:E.nombre)||"MotoFlow").toUpperCase())}</h1>
          <p style="margin: 2px 0; font-size: 13px;">CIERRE DE CAJA</p>
          ${e._reimpresion?'<p class="bold" style="margin:2px 0;font-size:12px;">** REIMPRESION **</p>':""}
        </div>
        <div class="separator"></div>
        <div class="row"><span>Fecha:</span><span>${da(e.fecha)}</span></div>
        <div class="row"><span>Turno:</span><span>${e.turno}</span></div>
        <div class="row"><span>Cajero:</span><span>${j(e.cajero_nombre)}</span></div>
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
        ${((a==null?void 0:a.recibosPorCuenta)||[]).map(c=>l(`&nbsp;&nbsp;&nbsp;&nbsp;↳ ${j(c.etiqueta)}`,c.monto,{siempre:!0})).join("")}`:""}
        <div class="row total-row"><span>TOTAL INGRESO EN CAJA:</span><span>${n(f)}</span></div>
        ${((a==null?void 0:a.gastosDiarios)||[]).length?`
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">DESGLOSE DE GASTOS</div>
        ${a.gastosDiarios.map(c=>`
          <div class="row">
            <span style="max-width: 70%;">${j(c.tipo_gasto||"GASTO")}${c.descripcion?` — ${j(c.descripcion)}`:""}</span>
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
            <span style="max-width: 70%;">${j(c.descripcion||"NOMINA")}</span>
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
            <span style="max-width: 70%;">${j(c.concepto_tercero||"TERCERO")}${c.descripcion?` — ${j(c.descripcion)}`:""}</span>
            <span>${n(c.monto)}</span>
          </div>`).join("")}
        <div class="row" style="border-top: 1px solid #000; padding-top: 2px; margin-top: 2px;">
          <span>Total a terceros:</span><span>${n(a==null?void 0:a.totalPagosTerceros)}</span>
        </div>`:""}
        ${((a==null?void 0:a.prestamosEfectivo)||[]).length?`
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">PRÉSTAMOS (EFECTIVO)</div>
        ${a.prestamosEfectivo.map(c=>{var y;return`
          <div class="row">
            <span style="max-width: 70%;">${j(((y=c.clientes)==null?void 0:y.nombre)||c.numero||"PRÉSTAMO")}</span>
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
            <span style="max-width: 70%;">${j(c.nombre||"COMPROMISO")}</span>
            <span>${n(c.monto_efectivo!==void 0?c.monto_efectivo:c.monto)}</span>
          </div>
          ${(c.empleados||[]).map(y=>`
          <div class="row">
            <span style="max-width: 70%; padding-left: 8px;">· ${j(y.nombre)}${y.yaEnGastos?" (en Gastos)":""}</span>
            <span>${n(y.monto)}</span>
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
        ${Xa.filter(c=>Number(e.desglose[c.label]||0)>0&&(c.tipo!=="tasa"||Number(e.desglose.Dólares||0)>0)).map(c=>{const y=e.desglose[c.label]||0,G=Ta(c,e.desglose);return`<div class="row">
            <span style="flex: 1;">${c.label}</span>
            <span class="text-right" style="width: 42px;">${y}</span>
            <span class="text-right" style="width: 84px;">${c.tipo==="tasa"?"":n(G)}</span>
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
    `;Te(N,r?{tipo:"carta"}:{tipo:"ticket",anchoMM:72}).catch(()=>Se(N))},dt=g.useCallback(async()=>{if(!w)return;const{data:e,error:a}=await $.from("cierres_caja").select("*").eq("tenant_id",w).order("created_at",{ascending:!1}).limit(60);a||Qt(e||[])},[w]);g.useEffect(()=>{ma&&dt()},[ma,dt]);const[pt,bt]=g.useState(null),oe=async e=>{bt(e.id);try{const a=!e.detalle,r=e.detalle||await U(e.fecha);if(!r)throw new Error("No se pudo armar el desglose de esa fecha.");const p=Math.abs((Number(r.efectivoEnCaja)||0)-(Number(e.efectivo_en_caja)||0)),f=a?{...r,efectivoEnCaja:e.efectivo_en_caja}:r;ct({...e,_reimpresion:!0,_reconstruido:a,_descuadre:a&&p>.01?r.efectivoEnCaja:null},f)}catch(a){b({variant:"destructive",title:"No se pudo reimprimir",description:a.message})}finally{bt(null)}};return g.useEffect(()=>{const e=a=>{ba==="cierre-caja"&&(a.key==="Escape"&&a.defaultPrevented||(a.key==="F8"&&fa&&(a.preventDefault(),La()),a.key==="Escape"&&(a.preventDefault(),fa?Ia(!1):Sa("cierre-caja"))))};return window.addEventListener("keydown",e),()=>window.removeEventListener("keydown",e)},[fa,La,Sa,ba]),t.jsxs(t.Fragment,{children:[t.jsx(je,{children:t.jsx("title",{children:"Cierre de Caja — MotoFlow"})}),t.jsx(ue.div,{initial:{opacity:0,y:20},animate:{opacity:1,y:0},className:"p-1 md:p-4 bg-gray-100 min-h-full flex flex-col",children:t.jsxs("div",{className:"bg-white p-4 rounded-lg shadow-md flex-grow flex flex-col",children:[t.jsxs("div",{className:"bg-morla-blue text-white py-1.5 rounded-t-lg mb-3 relative",children:[t.jsx("h1",{className:"text-white font-black tracking-[0.25em] italic uppercase text-base drop-shadow-sm text-center",children:"CIERRE DE CAJA"}),t.jsx("button",{type:"button",onClick:()=>U(),disabled:Pa,title:"Actualizar los montos del día",className:"absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-white/20 disabled:opacity-50",children:t.jsx(_e,{className:`w-4 h-4 ${Pa?"animate-spin":""}`})})]}),T&&X(T)!==X(It())&&t.jsxs("div",{className:"mb-3 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900",children:[t.jsxs("b",{children:["Estás cerrando una fecha pasada: ",Pt(T,"dd/MM/yyyy"),"."]})," ","Las cifras son las de ese día. Si ya vendiste hoy, el efectivo de la gaveta incluye lo de hoy y no va a cuadrar con el conteo."]}),t.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-4 gap-x-4 gap-y-2 px-3 py-2 border rounded-lg mb-3",children:[t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(na,{className:"font-bold text-xs shrink-0",children:"Fecha"}),t.jsxs(Re,{children:[t.jsx(Me,{asChild:!0,children:t.jsxs(ra,{variant:"outline",className:Ne("flex-1 min-w-0 h-8 justify-start text-left font-normal text-sm px-2",!T&&"text-muted-foreground"),children:[t.jsx(ye,{className:"mr-1.5 h-3.5 w-3.5 shrink-0"}),T?Pt(T,"dd/MM/yyyy"):t.jsx("span",{children:"Seleccione"})]})}),t.jsx(Ie,{className:"w-auto p-0",children:t.jsx(Pe,{mode:"single",selected:T,onSelect:Ht,initialFocus:!0})})]})]}),!sa&&!z&&t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(na,{className:"font-bold text-xs shrink-0",children:"Turno"}),t.jsx(Za,{type:"number",min:"1",max:Aa,value:xa,onChange:e=>Da(parseInt(e.target.value,10)||1),onFocus:e=>e.target.select(),className:"flex-1 min-w-0 h-8 text-center font-bold px-2"})]}),V?t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(na,{className:"font-bold text-xs shrink-0",children:"Caja"}),W.length===0?t.jsx("span",{className:"text-xs text-gray-500",children:d!=null&&d.es_admin?"No hay cajas abiertas.":"No tienes una caja abierta."}):t.jsxs(ya,{value:Oa||"",onValueChange:Ra,children:[t.jsx(Ea,{className:"flex-1 min-w-0 h-8 text-sm px-2",children:t.jsx(Ca,{placeholder:"Escoge la caja"})}),t.jsx(wa,{children:W.map(e=>t.jsxs(ca,{value:e.apertura_id,children:[e.caja_nombre," — ",e.cajero_nombre||"cajero"," · ",e.cerrada?"cerrada (rehacer cierre)":`abierta ${new Date(e.desde).toLocaleTimeString("es-DO",{hour:"numeric",minute:"2-digit"})}`]},e.apertura_id))})]}),Number((xt=i==null?void 0:i.recibosSinCaja)==null?void 0:xt.cantidad)>0&&t.jsxs("span",{className:"text-[11px] font-bold text-amber-700",title:`Los grabó otra empresa del grupo sin caja abierta (o con otra fecha). Los de hoy entran a la primera caja que se abra hoy; los demás hay que cuadrarlos a mano. Fechas: ${(i.recibosSinCaja.fechas||[]).join(", ")}`,children:[i.recibosSinCaja.cantidad," recibo(s) de otra empresa sin caja: ",n(i.recibosSinCaja.monto)]})]}):t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(na,{className:"font-bold text-xs shrink-0",children:"Caja"}),t.jsxs(ya,{value:"caja1",disabled:!0,children:[t.jsx(Ea,{className:"flex-1 min-w-0 h-8 text-sm px-2",children:t.jsx(Ca,{})}),t.jsx(wa,{children:t.jsx(ca,{value:"caja1",children:"Caja No. 1"})})]}),z&&t.jsxs("span",{className:"text-[11px] text-gray-500 whitespace-nowrap",children:["Turno ",(d==null?void 0:d.turno)||1,d!=null&&d.desde?` · abierto ${new Date(d.desde).toLocaleTimeString("es-DO",{hour:"numeric",minute:"2-digit"})}`:" · desde la mañana",d!=null&&d.requiere_apertura?" · cerrado":""]})]}),!V&&t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(na,{className:"font-bold text-xs shrink-0",children:"Cajero"}),t.jsxs(ya,{value:M,onValueChange:tt,children:[t.jsx(Ea,{className:"flex-1 min-w-0 h-8 text-sm px-2",children:t.jsx(Ca,{placeholder:"Seleccione cajero"})}),t.jsxs(wa,{children:[t.jsx(ca,{value:"ALL",className:"font-bold text-morla-blue",children:"📊 Todos los Cajeros (Consolidado)"}),at.map(e=>t.jsx(ca,{value:e.id,children:e.nombre_completo||e.email},e.id))]})]})]})]}),Pa?t.jsx("div",{className:"flex-grow flex items-center justify-center",children:t.jsx(Qa,{className:"h-8 w-8 animate-spin text-morla-blue"})}):i?t.jsxs("div",{className:"grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4",children:[t.jsxs("div",{className:"border rounded-lg p-4 bg-gradient-to-br from-slate-50 to-blue-50",children:[t.jsx("h2",{className:"font-bold text-sm uppercase text-gray-500 tracking-wider mb-3",children:_?`Resumen de ${_.caja_nombre} — ${_.cajero_nombre||""}`:M==="ALL"?"Resumen Total del Día":"Resumen del Turno"}),t.jsxs("div",{className:"space-y-2",children:[t.jsx(C,{label:"Cantidad de Facturas",value:i.cantFacturas,isCount:!0,siempre:!0}),t.jsx(C,{label:"Ventas Contado Caja",value:i.totalVentasContadoCaja}),t.jsx(C,{label:"Cuenta Contado Móvil",value:i.totalVentasContadoMovil}),t.jsx(C,{label:"Ventas por Transferencia/Tarjeta",value:i.totalVentasContadoNoEfectivo}),t.jsx(C,{label:"Retenido por clientes (pagan a la DGII)",value:i.totalRetencionesContado}),t.jsx(C,{label:"Ventas Crédito",value:i.totalVentasCredito}),t.jsx(C,{label:"Total Ventas",value:i.totalVentas,bold:!0}),Number(i.totalRecibosMovil)>0&&t.jsxs(t.Fragment,{children:[t.jsx(C,{label:"Recibos de Ingreso Caja",value:i.totalRecibosCaja}),t.jsx(C,{label:"Recibos de Ingreso Móvil",value:i.totalRecibosMovil})]}),t.jsx(C,{label:"Recibos de Ingreso (total)",value:i.totalRecibos}),Number(i.totalRecibosOtrasFormas)>0&&t.jsxs(t.Fragment,{children:[t.jsx(C,{label:"· Recibos en Efectivo",value:i.totalRecibosEfectivo}),t.jsx(C,{label:"· Recibos Transf/Cheque/Tarjeta",value:i.totalRecibosOtrasFormas}),(i.recibosPorCuenta||[]).map(e=>{const a=!!Yt[e.etiqueta],r=(e.detalle||[]).length>0;return t.jsxs("div",{className:"pl-4",children:[t.jsxs("button",{type:"button",disabled:!r,onClick:()=>et(p=>({...p,[e.etiqueta]:!p[e.etiqueta]})),className:"flex w-full items-center justify-between py-1 text-left disabled:cursor-default",title:r?"Ver los recibos":void 0,children:[t.jsxs("span",{className:"flex items-center gap-1 text-sm text-gray-600",children:[r&&t.jsx(Ft,{className:`h-4 w-4 text-morla-blue transition-transform ${a?"":"-rotate-90"}`}),"↳ ",e.etiqueta,r&&t.jsxs("span",{className:"text-xs text-gray-400",children:["(",e.detalle.length,")"]})]}),t.jsx("span",{className:"font-mono text-sm text-gray-800",children:n(e.monto)})]}),a&&r&&t.jsx("div",{className:"mb-1 ml-5 rounded border border-gray-200 bg-white",children:e.detalle.map((p,f)=>t.jsxs("div",{className:"flex items-center justify-between gap-2 border-b border-gray-100 px-2 py-1 text-xs last:border-b-0",children:[t.jsx("span",{className:"min-w-0 truncate text-gray-700",title:p.cliente,children:p.cliente}),t.jsxs("span",{className:"shrink-0 font-mono text-gray-500",children:[p.recibo,p.pago?` · pago ${p.pago}`:""]}),t.jsx("span",{className:"w-24 shrink-0 text-right font-mono text-gray-800",children:n(p.monto)})]},`${p.recibo}-${f}`))})]},e.etiqueta)})]}),t.jsx(qa,{label:"Total ingreso en caja",value:ka(i)}),t.jsx(C,{label:"Gastos Diarios",value:i.totalGastosDiarios}),t.jsx(C,{label:"Nómina (Efectivo)",value:i.totalPagosNomina}),(i.pagosNomina||[]).length>0&&t.jsx("div",{className:"mt-1 mb-1 ml-3 pl-3 border-l-2 border-gray-200",children:i.pagosNomina.map(e=>t.jsxs("div",{className:"flex justify-between items-center py-0.5",children:[t.jsx("span",{className:"text-xs text-gray-500 truncate pr-2",title:e.descripcion,children:String(e.descripcion||"Nómina").split("—").pop().trim()}),t.jsx("span",{className:"font-mono text-xs text-gray-600 shrink-0",children:n(e.monto)})]},e.id||e.descripcion))}),t.jsx(C,{label:"Pagos a terceros (GPS, seguro...)",value:i.totalPagosTerceros}),t.jsx(C,{label:"Préstamos (Efectivo)",value:i.totalPrestamosEfectivo}),t.jsx(C,{label:"Compromisos (Efectivo)",value:i.totalCompromisosEfectivo}),(i.compromisosEfectivo||[]).filter(e=>(e.empleados||[]).length>0).map(e=>t.jsxs("div",{className:"mt-1 mb-1 ml-3 pl-3 border-l-2 border-gray-200",children:[t.jsx("p",{className:"text-[11px] font-semibold text-gray-400 uppercase tracking-wide",children:e.nombre}),e.empleados.map((a,r)=>t.jsxs("div",{className:"flex justify-between items-center py-0.5",children:[t.jsx("span",{className:`text-xs truncate pr-2 ${a.yaEnGastos?"text-gray-400 line-through":"text-gray-500"}`,children:a.nombre}),t.jsx("span",{className:`font-mono text-xs shrink-0 ${a.yaEnGastos?"text-gray-400 line-through":"text-gray-600"}`,children:n(a.monto)})]},`${e.id}-${r}`)),Number(e.cubierto)>0&&t.jsxs("p",{className:"text-[10px] text-amber-700 leading-snug mt-0.5",children:[n(e.cubierto)," ya salió como gasto el día de cada pago; aquí solo entra"," ",n(e.monto_efectivo),"."]})]},e.id)),t.jsx(C,{label:"Devoluciones",value:i.totalDevoluciones}),t.jsx(C,{label:"Pagos a Suplidores (Efectivo)",value:i.totalPagosSuplidores}),t.jsx(C,{label:"Compras de contado (Efectivo)",value:i.comprasContadoEfectivo}),t.jsx(qa,{label:"Gasto total",value:Va(i)}),(i.efectivoMovido||[]).length>0&&t.jsxs(t.Fragment,{children:[t.jsx("div",{className:"mt-2 mb-1 ml-3 pl-3 border-l-2 border-emerald-200",children:i.efectivoMovido.map(e=>t.jsxs("div",{className:"flex justify-between items-center py-0.5",children:[t.jsxs("span",{className:"text-xs text-gray-500 truncate pr-2",children:[e.cuenta,e.moneda&&e.moneda!=="DOP"?` (US$${Number(e.monto_cuenta).toLocaleString("es-DO",{minimumFractionDigits:2})} a ${Number(e.tasa)})`:"",e.concepto?` · ${e.concepto}`:""]}),t.jsx("span",{className:"font-mono text-xs text-gray-600 shrink-0",children:n(e.monto_caja)})]},e.id))}),t.jsx(qa,{label:"Efectivo movido a cuentas (no es gasto)",value:i.totalEfectivoMovido})]}),t.jsxs("div",{className:"flex justify-between items-center py-2 mt-2 bg-morla-blue/10 rounded px-3 border border-morla-blue/30",children:[t.jsx("span",{className:"font-bold text-morla-blue",children:"Efectivo en Caja"}),t.jsx("span",{className:"font-bold text-morla-blue text-lg font-mono",children:n(i.efectivoEnCaja)})]}),Number(i.fondoApertura)>0&&t.jsxs(t.Fragment,{children:[t.jsxs("div",{className:"flex justify-between px-3 py-1 text-sm",children:[t.jsx("span",{children:"+ Fondo de apertura"}),t.jsx("span",{className:"font-mono",children:n(i.fondoApertura)})]}),t.jsxs("div",{className:"flex justify-between items-center py-2 bg-emerald-50 rounded px-3 border border-emerald-200",children:[t.jsx("span",{className:"font-bold text-emerald-800",children:"Debe haber en la gaveta"}),t.jsx("span",{className:"font-bold text-emerald-800 text-lg font-mono",children:n(B)})]})]})]})]}),t.jsx("div",{className:"border rounded-lg p-4 flex flex-col",children:fa?t.jsxs("div",{className:"flex flex-col h-full",children:[t.jsxs("div",{className:"flex items-center justify-between gap-3 mb-2",children:[t.jsx("h3",{className:"font-bold text-sm uppercase tracking-widest text-gray-600",children:"DESGLOSE DE MONEDAS"}),t.jsxs(ya,{value:"DOP",disabled:!0,children:[t.jsx(Ea,{className:"w-32 h-7 text-xs",children:t.jsx(Ca,{})}),t.jsx(wa,{children:t.jsx(ca,{value:"DOP",children:"DOP - PESO"})})]})]}),t.jsx(Ee,{className:"flex-grow border rounded-lg max-h-[380px]",children:t.jsxs(Lt,{children:[t.jsx(qt,{className:"bg-gray-200 sticky top-0 z-10",children:t.jsxs(pa,{className:"h-8",children:[t.jsx(q,{className:"w-20 h-8 py-1 font-bold text-xs",children:"MONEDA"}),t.jsx(q,{className:"w-24 h-8 py-1 font-bold text-center text-xs",children:"CANTIDAD"}),t.jsx(q,{className:"h-8 py-1 text-right font-bold text-xs",children:"VALOR"})]})}),t.jsx(Vt,{children:$a.filter(e=>e.tipo!=="tasa").map(e=>{const a=aa[e.label]??0,r=Ta(e,aa);return t.jsxs(pa,{className:"hover:bg-yellow-50/50",children:[t.jsx(R,{className:"py-0.5 font-semibold text-right pr-4 text-sm whitespace-nowrap",children:e.label}),t.jsx(R,{className:"py-0.5 text-center",children:t.jsx(Za,{type:"number",min:"0",step:e.tipo?"0.01":"1",value:a,onChange:p=>rt(e,p.target.value),onFocus:p=>p.target.select(),onClick:p=>p.target.select(),className:"w-20 mx-auto text-center h-6 text-sm px-1"})}),t.jsx(R,{className:"py-0.5 text-right font-mono text-sm",children:e.tipo==="dolar"?t.jsxs("div",{className:"flex items-center justify-end gap-2",children:[t.jsx("span",{className:"text-xs text-gray-600 font-sans font-semibold whitespace-nowrap",children:"Tasa del día"}),t.jsx(Za,{type:"number",min:"0",step:"0.01",value:aa["Tasa del día"]??"",onChange:p=>rt({label:"Tasa del día",tipo:"tasa"},p.target.value),onFocus:p=>p.target.select(),onClick:p=>p.target.select(),className:"w-20 text-center h-6 text-sm px-1"}),t.jsx("span",{className:"min-w-[90px]",children:n(r)})]}):n(r)})]},e.label)})}),t.jsx(Fe,{className:"sticky bottom-0 bg-yellow-100 z-10",children:t.jsxs(pa,{className:"font-bold",children:[t.jsx(R,{colSpan:2,className:"py-1 text-right text-red-600 uppercase text-sm",children:"TOTAL ==>"}),t.jsx(R,{className:"py-1 text-right text-red-600 font-mono text-base",children:n(k)})]})})]})}),t.jsx("div",{className:"mt-2 px-2.5 py-2 bg-blue-50 border border-blue-200 rounded-lg",children:t.jsx(Ce,{value:ga,onChange:Kt,moneda:"DOP",contexto:"cierre_caja",label:"Depositar en",inline:!0})}),t.jsxs("div",{className:"mt-3 flex items-center justify-between",children:[t.jsxs("label",{className:"flex items-center gap-2 text-sm cursor-pointer",children:[t.jsx("input",{type:"checkbox",checked:Fa,onChange:e=>Zt(e.target.checked),className:"rounded"}),t.jsx(Gt,{className:"h-4 w-4"}),"Imprimir ?"]}),Fa&&t.jsxs("select",{value:nt||(E==null?void 0:E.formato_cierre_caja)||"pos_80mm",onChange:e=>ae(e.target.value),className:"h-9 border border-slate-300 rounded px-2 text-xs font-bold bg-white",title:"Papel del impreso — se recuerda en esta PC",children:[t.jsx("option",{value:"pos_80mm",children:"📑 Ticket 80mm"}),t.jsx("option",{value:"carta",children:"📄 Carta (8.5 x 11)"})]}),t.jsxs(ra,{onClick:La,disabled:ot,className:"bg-morla-blue hover:bg-morla-blue/90 text-white gap-2",children:[ot?t.jsx(Qa,{className:"h-4 w-4 animate-spin"}):t.jsx(we,{className:"h-4 w-4"}),"F8 - Grabar y Cerrar ",sa?"Caja":"Turno"]})]}),i&&t.jsxs("div",{className:`mt-3 p-3 rounded-lg text-center font-bold text-sm ${k-B===0?"bg-green-100 text-green-700":k-B<0?"bg-red-100 text-red-700":"bg-yellow-100 text-yellow-700"}`,children:["Diferencia: ",n(k-B),k-B===0&&" ✓ Cuadra",k-B<0&&" (Faltante)",k-B>0&&" (Sobrante)"]})]}):t.jsxs("div",{className:"flex-grow flex flex-col items-center justify-center gap-4",children:[t.jsxs(ra,{onClick:()=>Ia(!0),size:"lg",className:"bg-morla-blue hover:bg-morla-blue/90 text-white px-8 py-6 text-base gap-3 shadow-lg",children:[t.jsx(Le,{className:"h-5 w-5"}),"Contar Efectivo y Cerrar ",sa?"Caja":"Turno"]}),t.jsxs("p",{className:"text-xs text-gray-400 text-center max-w-[260px]",children:["Se cuentan los billetes y al grabar el desglose ",sa?"la caja queda cerrada":"el turno queda cerrado","."]})]})})]}):null,t.jsxs("div",{className:"mt-4 border rounded-lg",children:[t.jsxs("button",{type:"button",onClick:()=>Xt(e=>!e),className:"w-full flex items-center justify-between px-4 py-2 text-left hover:bg-gray-50 transition-colors",children:[t.jsx("span",{className:"text-sm font-semibold text-gray-700",children:"Cierres anteriores"}),t.jsx(Ft,{className:`h-4 w-4 text-gray-400 transition-transform ${ma?"rotate-180":""}`})]}),ma&&t.jsxs("div",{className:"border-t max-h-72 overflow-y-auto",children:[lt.length===0?t.jsx("p",{className:"px-4 py-3 text-sm text-gray-400 italic",children:"No hay cierres grabados."}):t.jsxs(Lt,{children:[t.jsx(qt,{children:t.jsxs(pa,{children:[t.jsx(q,{className:"text-xs",children:"Fecha"}),t.jsx(q,{className:"text-xs",children:"Turno"}),t.jsx(q,{className:"text-xs",children:"Cajero"}),t.jsx(q,{className:"text-xs text-right",children:"Efectivo"}),t.jsx(q,{className:"text-xs text-right",children:"Contado"}),t.jsx(q,{className:"text-xs text-right",children:"Diferencia"}),t.jsx(q,{className:"text-xs text-right",children:" "})]})}),t.jsx(Vt,{children:lt.map(e=>{const a=Number(e.diferencia)||0;return t.jsxs(pa,{children:[t.jsx(R,{className:"text-sm py-1.5",children:da(e.fecha)}),t.jsx(R,{className:"text-sm py-1.5",children:e.turno}),t.jsx(R,{className:"text-sm py-1.5 max-w-[160px] truncate",title:e.cajero_nombre,children:e.cajero_nombre}),t.jsx(R,{className:"text-sm py-1.5 text-right font-mono",children:n(e.efectivo_en_caja)}),t.jsx(R,{className:"text-sm py-1.5 text-right font-mono",children:n(e.total_desglose)}),t.jsx(R,{className:`text-sm py-1.5 text-right font-mono ${Math.abs(a)<.005?"text-green-600":a<0?"text-red-600":"text-amber-600"}`,children:n(a)}),t.jsx(R,{className:"text-right py-1.5",children:t.jsxs(ra,{size:"sm",variant:"outline",className:"h-7 gap-1.5 text-xs",disabled:pt===e.id,onClick:()=>oe(e),children:[pt===e.id?t.jsx(Qa,{className:"h-3.5 w-3.5 animate-spin"}):t.jsx(Gt,{className:"h-3.5 w-3.5"})," Reimprimir"]})})]},e.id)})})]}),t.jsx("p",{className:"px-4 py-2 text-[11px] text-gray-400 italic border-t",children:"Sale marcado como reimpresión. Los cierres grabados desde hoy salen idénticos al original; los anteriores reconstruyen el desglose con los movimientos de esa fecha, y el efectivo y el conteo de billetes son siempre los que quedaron grabados."})]})]}),t.jsx("div",{className:"mt-auto pt-4 flex justify-end items-center space-x-4 border-t",children:t.jsxs(ra,{variant:"outline",onClick:()=>Sa("cierre-caja"),className:"gap-2",children:[t.jsx($e,{className:"h-4 w-4"})," ESC - Salir"]})})]})})]})};export{ao as default};
