import{V as to,W as oo,aC as eo,r as g,aX as yt,aY as G,bW as so,s as $,j as t,H as io,m as lo,b0 as no,bc as Ct,L as xa,d as Z,bp as co,a6 as ro,I as Ma,a8 as Fa,a9 as Pa,aa as Ia,ab as La,ac as fa,k as Va,a5 as Et,bt as po,as as bo,e as xo,bq as K,X as fo}from"./index-cdf3887d.js";import{P as mo,a as go,b as vo}from"./popover-94872707.js";import{C as ho}from"./calendar-e2ff8e33.js";import{T as _t,a as wt,b as aa,c as I,d as $t,e as O,f as jo}from"./table-df60d633.js";import{c as Tt}from"./AbrirCajaModal-cf3ac459.js";import{C as uo}from"./coins-2fc46146.js";import{P as St}from"./printer-25fe37f2.js";import"./index-5ba0b7d5.js";import"./index-1ad7268b.js";import"./chevron-left-db70b884.js";import"./lock-open-e3b818b5.js";const qa=[{label:"2,000",value:2e3},{label:"1,000",value:1e3},{label:"500",value:500},{label:"200",value:200},{label:"100",value:100},{label:"50",value:50},{label:"25",value:25},{label:"20",value:20},{label:"10",value:10},{label:"5",value:5},{label:"1",value:1},{label:"Cent.",value:0},{label:"Tarjetas",value:0,tipo:"tarjeta"},{label:"Cheques",value:0,tipo:"cheque"},{label:"Tarjetas/Cheques",value:0,tipo:"tarjeta"},{label:"Dólares",value:0,tipo:"dolar"},{label:"Tasa del día",value:0,tipo:"tasa"},{label:"Otros",value:0,tipo:"otro"}],No=new Set(["20","Cent.","Otros","Tarjetas","Cheques"]),ma=qa.filter(p=>!No.has(p.label)),ga=(p,_)=>{const z=Number(_==null?void 0:_[p.label])||0;return p.tipo==="tasa"?0:p.tipo==="dolar"?z*(Number(_==null?void 0:_["Tasa del día"])||0):p.tipo?z:z*p.value},n=p=>new Intl.NumberFormat("es-DO",{style:"decimal",minimumFractionDigits:2,maximumFractionDigits:2}).format(p||0),Dt=p=>String(p??"").replace(/[&<>"']/g,_=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[_]),yo=p=>String((p==null?void 0:p.estado)||"").toUpperCase()!=="ANULADA",At=p=>yo(p)&&!/ - RECIBO$/i.test(String((p==null?void 0:p.forma_pago)||"")),Ot=p=>{const _=String((p==null?void 0:p.forma_pago)||"").toUpperCase(),z=String((p==null?void 0:p.tipo_pago)||"").toUpperCase(),N=String((p==null?void 0:p.notas)||"").toUpperCase();return _==="EFECTIVO"||N.includes("POS_MOVIL")||N.includes("POS MOVIL")||N.includes("MOVIL")||N.includes("MÓVIL")||z.includes("MOVIL")},Mo=()=>{const{toast:p}=to(),{user:_,profile:z,empresa:N,tenantId:w}=oo(),{closePanel:va,activePanel:ta}=eo(),[T,Rt]=g.useState(yt()),[oa,ha]=g.useState(1),ja=Math.max(1,parseInt(N==null?void 0:N.turnos_caja_dia,10)||1),B=ja<=1,[f,ka]=g.useState(null),ea=T?G(T):null;g.useEffect(()=>{if(ta!=="cierre-caja"||!ea)return;let o=!0;return Tt(ea).then(a=>{o&&ka(a)}),()=>{o=!1}},[ta,w,ea]);const V=(f==null?void 0:f.modo)==="apertura",ua=!!f&&f.fecha===ea;g.useEffect(()=>{V&&ua&&(f!=null&&f.turno)&&ha(f.turno)},[V,ua,f==null?void 0:f.turno]);const Ga=g.useRef(0),[za,Mt]=g.useState([]),[A,Ua]=g.useState("ALL"),[sa,Na]=g.useState(!1),[Ft,Ha]=g.useState({});g.useEffect(()=>{Ha({})},[T,A]);const[Ba,Ja]=g.useState(!1),[ya,Wa]=g.useState(!1),[Ca,Pt]=g.useState(!0),[Ya,It]=g.useState([]),[ia,Lt]=g.useState(!1),[la,Vt]=g.useState(null),[Qa,qt]=g.useState(()=>localStorage.getItem("cierre_caja_paper")||""),kt=o=>{qt(o),localStorage.setItem("cierre_caja_paper",o)},[s,Gt]=g.useState(null),[U,na]=g.useState(ma.reduce((o,a)=>({...o,[a.label]:0}),{}));g.useEffect(()=>{(async()=>{const{data:a,error:d}=await $.from("perfiles").select("id, nombre_completo, email").order("nombre_completo");!d&&a&&(Mt(a),Ua("ALL"))})()},[_]);const q=g.useCallback(async o=>{const a=!!o;if(!T&&!a)return;a||Wa(!0);const d=o||G(T),{desde:r,hasta:x}=so(d),l=!a&&(f==null?void 0:f.modo)==="apertura"&&(f==null?void 0:f.fecha)===d,v=a?null:++Ga.current,C=l&&f.desde||null,c=l&&Number(f.fondo)||0,u=e=>!C||!!e&&new Date(e)>=new Date(C);let E=[],ca=[],F=[],ra=[],J=[],W=[],Y=[],Q=[],P=[];try{let e=$.from("facturas").select("id, total, itbis, subtotal, descuento, forma_pago, tipo_pago, monto_recibido, cambio, fecha, created_at, notas, estado, retenido_no_cobrado").eq("tenant_id",w).gte("fecha",r).lte("fecha",x);A&&A!=="ALL"&&(e=e.eq("usuario_id",A));const{data:i,error:m}=await e;m?console.warn("Error cargando ventas:",m.message):E=(i||[]).filter(At);let b=$.from("facturas").select("id, total, itbis, subtotal, descuento, forma_pago, tipo_pago, monto_recibido, cambio, fecha, created_at, notas, estado, retenido_no_cobrado").eq("tenant_id",w).gte("created_at",r).lte("created_at",x);A&&A!=="ALL"&&(b=b.eq("usuario_id",A));const{data:S,error:h}=await b;if(h)console.warn("Error cargando ventas moviles:",h.message);else{const R=new Set(E.map(j=>j.id)),D=(S||[]).filter(At).filter(j=>Ot(j)&&!R.has(j.id));E=[...E,...D]}}catch(e){console.warn("Exception cargando ventas:",e)}try{const{data:e,error:i}=await $.from("devoluciones").select("total_devolucion, created_at, facturas!inner(forma_pago)").eq("tenant_id",w).ilike("facturas.forma_pago","contado").eq("fecha_devolucion",d);i?console.warn("Error cargando devoluciones:",i.message):ca=e||[]}catch(e){console.warn("Exception cargando devoluciones:",e)}try{const{data:e,error:i}=await $.from("recibos_ingreso").select("numero, monto_pagado, fecha, created_at, origen, formas_pago, clientes(nombre)").eq("tenant_id",w).eq("anulado",!1).eq("fecha",d);if(i){console.warn("Error cargando recibos por fecha:",i.message);const{data:m,error:b}=await $.from("recibos_ingreso").select("numero, monto_pagado, created_at, origen, formas_pago, clientes(nombre)").eq("tenant_id",w).eq("anulado",!1).gte("created_at",r).lte("created_at",x);b?console.warn("Error cargando recibos por created_at:",b.message):F=m||[]}else F=e||[];console.log(`Recibos encontrados para ${d}:`,F.length,F)}catch(e){console.warn("Exception cargando recibos:",e)}try{const{data:e,error:i}=await $.from("pagos_suplidores").select("monto_pagado, formas_pago, created_at").eq("tenant_id",w).eq("anulado",!1).gte("created_at",r).lte("created_at",x);i?console.warn("Error cargando pagos suplidores:",i.message):ra=e||[]}catch(e){console.warn("Exception cargando pagos suplidores:",e)}try{const{data:e,error:i}=await $.from("gastos_diarios").select("monto, descripcion, tipo_gasto, afecta_caja, cuenta_bancaria_id, es_tercero, concepto_tercero, created_at").eq("tenant_id",w).eq("fecha",d).eq("anulado",!1);if(i)console.warn("Error cargando gastos diarios:",i.message);else{const m=(e||[]).filter(h=>!h.cuenta_bancaria_id&&h.afecta_caja!==!1);W=m.filter(h=>h.es_tercero===!0);const b=h=>/n[oó]mina/i.test(String(h.tipo_gasto||"")),S=m.filter(h=>h.es_tercero!==!0);Y=S.filter(b),J=S.filter(h=>!b(h))}}catch(e){console.warn("Exception cargando gastos diarios:",e)}let Ta=0;try{const{data:e,error:i}=await $.from("compras").select("numero, total_compra, forma_pago, estado, pagos, created_at").eq("tenant_id",w).ilike("forma_pago","contado").gte("created_at",r).lte("created_at",x);i?console.warn("Error cargando compras de contado:",i.message):Ta=(e||[]).filter(m=>(m.estado||"")!=="ANULADA"&&u(m.created_at)).reduce((m,b)=>{const S=Array.isArray(b.pagos)?b.pagos:[];return S.length===0?m+(parseFloat(b.total_compra)||0):m+S.filter(h=>String((h==null?void 0:h.tipo)??"01")==="01"||String((h==null?void 0:h.forma)||"").toLowerCase().includes("efectivo")).reduce((h,R)=>h+(parseFloat(R==null?void 0:R.monto)||0),0)},0)}catch(e){console.warn("Exception cargando compras de contado:",e)}try{const{data:e,error:i}=await $.from("prestamos").select("numero, monto_capital, created_at, clientes(nombre)").eq("tenant_id",w).ilike("desembolso","efectivo").gte("created_at",r).lte("created_at",x);i?console.warn("Error cargando préstamos en efectivo:",i.message):Q=e||[]}catch(e){console.warn("Exception cargando préstamos en efectivo:",e)}try{const{data:e,error:i}=await $.from("compromisos").select("id, nombre, monto, tipo, forma_pago, fecha_pago").eq("tenant_id",w).eq("activo",!1).gte("fecha_pago",r).lte("fecha_pago",x);if(i)console.warn("Error cargando compromisos pagados:",i.message);else{P=(e||[]).filter(b=>String(b.forma_pago||"Efectivo").toLowerCase().includes("efectivo"));const m=P.filter(b=>String(b.tipo||"").toLowerCase()==="nomina").map(b=>b.id);if(m.length>0){const{data:b}=await $.from("nominas").select("id, compromiso_id, nomina_detalle(neto, pagado_at, gasto_id, empleados(nombre))").eq("tenant_id",w).in("compromiso_id",m).neq("estado","anulada"),S=(b||[]).flatMap(D=>(D.nomina_detalle||[]).map(j=>j.gasto_id)).filter(Boolean),h=new Set;if(S.length>0){const{data:D}=await $.from("gastos_diarios").select("id, anulado").in("id",S);for(const j of D||[])j.anulado&&h.add(j.id)}const R={};for(const D of b||[])R[D.compromiso_id]=(D.nomina_detalle||[]).map(j=>{var M;return{nombre:((M=j.empleados)==null?void 0:M.nombre)||"Empleado",monto:Number(j.neto)||0,yaEnGastos:!!j.gasto_id&&!h.has(j.gasto_id),pagadoAt:j.pagado_at||null}}).filter(j=>j.monto>0).sort((j,M)=>M.monto-j.monto);P=P.map(D=>{const j=R[D.id]||null,M=(j||[]).filter(H=>H.yaEnGastos).reduce((H,Oa)=>H+Oa.monto,0);return{...D,empleados:j,cubierto:M,monto_efectivo:Math.max((parseFloat(D.monto)||0)-M,0)}})}}}catch(e){console.warn("Exception cargando compromisos pagados:",e)}let X=[];try{const{data:e,error:i}=await $.from("caja_depositos").select("id, monto_caja, moneda, tasa, monto_cuenta, concepto, cuenta_id, created_at, cuentas_bancarias(banco, alias)").eq("tenant_id",w).eq("fecha",d).eq("anulado",!1).order("created_at");i?console.warn("Error cargando efectivo movido a cuentas:",i.message):X=(e||[]).map(m=>({...m,cuenta:m.cuentas_bancarias?`${m.cuentas_bancarias.banco}${m.cuentas_bancarias.alias?` — ${m.cuentas_bancarias.alias}`:""}`:"cuenta"}))}catch(e){console.warn("Exception cargando efectivo movido a cuentas:",e)}C&&(E=E.filter(e=>u(e.created_at)),ca=ca.filter(e=>u(e.created_at)),F=F.filter(e=>u(e.created_at)),ra=ra.filter(e=>u(e.created_at)),J=J.filter(e=>u(e.created_at)),W=W.filter(e=>u(e.created_at)),Y=Y.filter(e=>u(e.created_at)),Q=Q.filter(e=>u(e.created_at)),P=P.filter(e=>u(e.fecha_pago)),X=X.filter(e=>u(e.created_at)));const da=E.filter(e=>{const i=String(e.forma_pago||"").toUpperCase();return i==="CONTADO"||i==="EFECTIVO"}),ot=da.reduce((e,i)=>e+(parseFloat(i.total)||0),0),et=e=>Math.min(parseFloat(e.retenido_no_cobrado)||0,parseFloat(e.total)||0),st=e=>Math.max(0,(parseFloat(e.total)||0)-et(e)),it=da.reduce((e,i)=>e+et(i),0),lt=da.filter(Ot).reduce((e,i)=>e+st(i),0),Ht=e=>{const i=String(e.tipo_pago||"").toUpperCase();return!i||i.includes("EFECTIVO")},nt=da.filter(e=>!Ht(e)).reduce((e,i)=>e+st(i),0),ct=Math.max(0,ot-it-lt-nt),Bt=E.filter(e=>String(e.forma_pago||"").toUpperCase()==="CREDITO").reduce((e,i)=>e+(parseFloat(i.total)||0),0),Jt=E.reduce((e,i)=>e+(parseFloat(i.total)||0),0),Wt=E.reduce((e,i)=>e+(parseFloat(i.itbis)||0),0),Yt=E.reduce((e,i)=>e+(parseFloat(i.descuento)||0),0),rt=ca.reduce((e,i)=>e+(parseFloat(i.total_devolucion)||0),0),Sa=F.reduce((e,i)=>e+(parseFloat(i.monto_pagado)||0),0),dt=F.filter(e=>String(e.origen||"").toLowerCase()==="movil").reduce((e,i)=>e+(parseFloat(i.monto_pagado)||0),0),Qt=Math.max(0,Sa-dt),Xt=e=>{const i=Array.isArray(e.formas_pago)?e.formas_pago:null;return!i||!i.length?parseFloat(e.monto_pagado)||0:i.reduce((m,b)=>m+(String(b.forma||"").toLowerCase().includes("efectivo")&&parseFloat(b.monto)||0),0)},Da=F.reduce((e,i)=>e+Xt(i),0),pt=Math.max(0,Sa-Da),Aa=new Map;F.forEach(e=>{(Array.isArray(e.formas_pago)?e.formas_pago:[]).forEach(i=>{var Nt;if(String(i.forma||"").toLowerCase().includes("efectivo"))return;const m=parseFloat(i.monto)||0;if(m<=0)return;const b=Ra=>String(Ra||"").trim().replace(/\s+/g," "),S=i.alias?`${b(i.alias)}${i.banco?` (${b(i.banco)})`:""}`:[b(i.banco),b(i.cuenta)].filter(Boolean).join(" "),h=b(i.forma)||"Otra forma",R=h.charAt(0).toUpperCase()+h.slice(1).toLowerCase(),D=S?`${R} → ${S}`:R,j=D.toUpperCase(),M=Aa.get(j)||{etiqueta:D,monto:0,detalle:[]};M.monto+=m;const H=Ra=>String(Ra||"").replace(/\D/g,""),Oa=i.cuenta_id&&/^\d{7}$/.test(String(i.referencia||""))&&H(i.referencia)!==H(e.numero)?i.referencia:null;M.detalle.push({cliente:((Nt=e.clientes)==null?void 0:Nt.nombre)||"Cliente genérico",recibo:e.numero||"—",pago:Oa,monto:m}),Aa.set(j,M)})});const pa=[...Aa.values()].map(e=>({etiqueta:e.etiqueta,monto:e.monto,detalle:e.detalle})),Zt=pa.reduce((e,i)=>e+i.monto,0),bt=Math.round((pt-Zt)*100)/100;pa.length&&bt>=.01&&pa.push({etiqueta:"Sin forma detallada",monto:bt});const xt=J.reduce((e,i)=>e+(parseFloat(i.monto)||0),0),ft=W.reduce((e,i)=>e+(parseFloat(i.monto)||0),0),mt=Y.reduce((e,i)=>e+(parseFloat(i.monto)||0),0),gt=Q.reduce((e,i)=>e+(parseFloat(i.monto_capital)||0),0),vt=e=>e.monto_efectivo!==void 0?parseFloat(e.monto_efectivo)||0:parseFloat(e.monto)||0;P=P.filter(e=>vt(e)>0);const ht=P.reduce((e,i)=>e+vt(i),0),jt=X.reduce((e,i)=>e+(parseFloat(i.monto_caja)||0),0),ut=ra.reduce((e,i)=>{const m=(i.formas_pago||[]).filter(b=>b.forma==="Efectivo").reduce((b,S)=>b+(parseFloat(S.monto)||0),0);return e+m},0),Kt=E.filter(e=>e.forma_pago==="CONTADO").reduce((e,i)=>e+(parseFloat(i.cambio)||0),0),ao=E.length,ba={totalVentas:Jt,totalVentasContado:ot,totalVentasContadoCaja:ct,totalVentasContadoMovil:lt,totalVentasContadoNoEfectivo:nt,totalRetencionesContado:it,totalVentasCredito:Bt,totalItbis:Wt,totalDescuento:Yt,totalDevoluciones:rt,totalRecibos:Sa,totalRecibosMovil:dt,totalRecibosCaja:Qt,totalRecibosEfectivo:Da,totalRecibosOtrasFormas:pt,recibosPorCuenta:pa,totalGastosDiarios:xt,gastosDiarios:J,totalPagosTerceros:ft,pagosTerceros:W,totalPagosNomina:mt,pagosNomina:Y,totalPrestamosEfectivo:gt,prestamosEfectivo:Q,totalCompromisosEfectivo:ht,compromisosEfectivo:P,totalEfectivoMovido:jt,efectivoMovido:X,totalPagosSuplidores:ut,cambioEntregado:Kt,cantFacturas:ao,comprasContadoEfectivo:Ta,fondoApertura:c,desde:C,efectivoEnCaja:ct+Da-rt-ut-xt-ft-mt-gt-ht-Ta-jt};return a||v!==Ga.current||(Gt(ba),Wa(!1)),ba},[T,A,w,f]);g.useEffect(()=>{q()},[q]),g.useEffect(()=>{const o=()=>{document.hidden||q()};return window.addEventListener("focus",o),document.addEventListener("visibilitychange",o),()=>{window.removeEventListener("focus",o),document.removeEventListener("visibilitychange",o)}},[q]);const Xa=(o,a)=>{if(o.tipo){na(r=>({...r,[o.label]:a}));return}const d=parseInt(a,10);na(r=>({...r,[o.label]:isNaN(d)?0:d}))};g.useEffect(()=>{$.rpc("get_tasa_dia").then(({data:o})=>{const a=Number(o)||0;a>0&&na(d=>Number(d["Tasa del día"])>0?d:{...d,"Tasa del día":a})},()=>{})},[]);const L=g.useMemo(()=>ma.reduce((o,a)=>o+ga(a,U),0),[U]),k=((s==null?void 0:s.efectivoEnCaja)||0)+((s==null?void 0:s.fondoApertura)||0),Ea=async()=>{var o;if(V&&!ua){p({variant:"destructive",title:"Un momento",description:"Todavía se está leyendo el turno de la caja de ese día. Vuelve a intentar."});return}Ja(!0);try{const a=A==="ALL"?"Todos los Cajeros":((o=za.find(v=>v.id===A))==null?void 0:o.nombre_completo)||"N/A",d={tenant_id:w,fecha:G(T),turno:oa,cajero_id:A==="ALL"?_==null?void 0:_.id:A,cajero_nombre:a,total_ventas:(s==null?void 0:s.totalVentas)||0,total_ventas_contado:(s==null?void 0:s.totalVentasContado)||0,total_ventas_contado_caja:(s==null?void 0:s.totalVentasContadoCaja)||0,total_ventas_contado_movil:(s==null?void 0:s.totalVentasContadoMovil)||0,total_ventas_credito:(s==null?void 0:s.totalVentasCredito)||0,total_itbis:(s==null?void 0:s.totalItbis)||0,total_descuento:(s==null?void 0:s.totalDescuento)||0,total_devoluciones:(s==null?void 0:s.totalDevoluciones)||0,total_recibos:(s==null?void 0:s.totalRecibos)||0,total_gastos_diarios:(s==null?void 0:s.totalGastosDiarios)||0,cambio_entregado:(s==null?void 0:s.cambioEntregado)||0,efectivo_en_caja:((s==null?void 0:s.efectivoEnCaja)||0)+((s==null?void 0:s.fondoApertura)||0),total_desglose:L,diferencia:L-(((s==null?void 0:s.efectivoEnCaja)||0)+((s==null?void 0:s.fondoApertura)||0)),desglose:Object.fromEntries(Object.entries(U).map(([v,C])=>[v,Number(C)||0])),usuario_id:_==null?void 0:_.id,detalle:s||null},{data:r,error:x}=await $.from("cierres_caja").insert([d]).select("id").single();if(x)throw x;const l=(s==null?void 0:s.efectivoEnCaja)||0;if(la&&l>0&&(r!=null&&r.id)){const{error:v}=await $.rpc("registrar_movimiento_bancario",{p_cuenta_id:la,p_tipo:"ENTRADA",p_monto:l,p_concepto:`Cierre de caja — turno ${oa} (${G(T)})`,p_referencia:null,p_origen_tipo:"cierre_caja",p_origen_id:r.id,p_fecha:G(T)});v&&p({variant:"destructive",title:"Cierre grabado, pero no se registró en la cuenta",description:v.message})}else l>0&&!la&&p({variant:"destructive",title:"El efectivo NO entró a ninguna cuenta",description:`Se cerró la caja con ${n(l)} pero no había cuenta seleccionada. Regístralo a mano en Cuentas Bancarias.`});Ca&&Za(d,s),p({title:"Cierre de Caja",description:`El cierre del turno ${oa} ha sido registrado exitosamente.`}),na(v=>({...ma.reduce((C,c)=>({...C,[c.label]:0}),{}),"Tasa del día":v["Tasa del día"]||0})),Na(!1),!B&&!V&&ha(v=>Math.min(v+1,ja)),V&&Tt().then(ka),q()}catch(a){console.error("Error saving cierre:",a),p({variant:"destructive",title:"Error",description:a.message||"No se pudo registrar el cierre de caja."})}finally{Ja(!1)}},y=({label:o,value:a,bold:d,isCount:r,siempre:x})=>x||Number(a)>0?t.jsxs("div",{className:`flex justify-between items-center py-1 ${d?"border-t-2 border-morla-blue pt-2":""}`,children:[t.jsx("span",{className:`text-sm ${d?"font-bold text-morla-blue":"text-gray-600"}`,children:o}),t.jsx("span",{className:`font-mono text-sm ${d?"font-bold text-morla-blue text-base":"text-gray-800"}`,children:r?a:n(a)})]}):null,_a=({label:o,value:a})=>t.jsxs("div",{className:"flex justify-between items-center py-1.5 mt-1 border-t-2 border-gray-800",children:[t.jsx("span",{className:"text-sm font-bold text-gray-800 uppercase tracking-wide",children:o}),t.jsx("span",{className:"font-mono text-sm font-bold text-gray-900",children:n(a)})]}),wa=o=>(Number(o==null?void 0:o.totalGastosDiarios)||0)+(Number(o==null?void 0:o.totalPagosNomina)||0)+(Number(o==null?void 0:o.totalPagosTerceros)||0)+(Number(o==null?void 0:o.totalPrestamosEfectivo)||0)+(Number(o==null?void 0:o.totalPagosSuplidores)||0)+(Number(o==null?void 0:o.totalCompromisosEfectivo)||0)+(Number(o==null?void 0:o.comprasContadoEfectivo)||0)+(Number(o==null?void 0:o.totalDevoluciones)||0),$a=o=>(Number((o==null?void 0:o.totalVentasContadoCaja)??(o==null?void 0:o.totalVentasContado))||0)+(Number((o==null?void 0:o.totalRecibosEfectivo)??(o==null?void 0:o.totalRecibos))||0),zt=(o,a)=>{const d=wa(a),r=$a(a),x=(l,v,C=!1,c=!1)=>c||Number(v)>0?`<tr${C?' class="bold"':""}><td>${l}</td><td class="num">${n(v)}</td></tr>`:"";return`
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
            <h1>${((N==null?void 0:N.nombre)||"MotoFlow").toUpperCase()}</h1>
            <div class="sub">CIERRE DE CAJA</div>
          </div>
          <div class="meta">
            <div><b>Fecha:</b> ${K(o.fecha)}</div>
            <div><b>Turno:</b> ${o.turno}</div>
            <div><b>Cajero:</b> ${o.cajero_nombre}</div>
            ${o._reimpresion?'<div style="color:#b45309;font-weight:bold">REIMPRESIÓN</div>':""}
          </div>
        </div>
        ${o._reimpresion?`<div style="margin-top:8px;padding:4px 8px;border:1px solid #b45309;color:#b45309;font-size:11px">
          Copia del cierre grabado el ${K(o.created_at||o.fecha)}. No es un cierre nuevo.
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
              ${((a==null?void 0:a.recibosPorCuenta)||[]).map(l=>x(`&nbsp;&nbsp;&nbsp;&nbsp;↳ ${Dt(l.etiqueta)}`,l.monto,!1,!0)).join("")}`:""}
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
              ${a.prestamosEfectivo.map(l=>{var v;return`<tr><td>${((v=l.clientes)==null?void 0:v.nombre)||"PRÉSTAMO"}${l.numero?` — ${l.numero}`:""}</td><td class="num">${n(l.monto_capital)}</td></tr>`}).join("")}
              <tr class="bold"><td>Total Préstamos</td><td class="num">${n(a==null?void 0:a.totalPrestamosEfectivo)}</td></tr>
            </tbody></table>`:""}

            ${((a==null?void 0:a.compromisosEfectivo)||[]).length?`
            <div class="sec">Compromisos (Efectivo)</div>
            <table><tbody>
              ${a.compromisosEfectivo.map(l=>`
                <tr><td>${l.nombre||"COMPROMISO"}${l.tipo?` — ${l.tipo}`:""}</td><td class="num">${n(l.monto_efectivo!==void 0?l.monto_efectivo:l.monto)}</td></tr>
                ${(l.empleados||[]).map(v=>`<tr><td style="padding-left:14px;color:#555">· ${v.nombre}${v.yaEnGastos?` <i>(ya salió ${v.pagadoAt?K(v.pagadoAt):"antes"}, en Gastos)</i>`:""}</td><td class="num" style="color:#555">${n(v.monto)}</td></tr>`).join("")}
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
              ${Number(a==null?void 0:a.fondoApertura)>0?`<div class="linea"><span>+ FONDO DE APERTURA</span><span>${n(a.fondoApertura)}</span></div>
              <div class="linea total"><span>DEBE HABER EN LA GAVETA</span><span>${n((Number(a.efectivoEnCaja)||0)+Number(a.fondoApertura))}</span></div>`:""}
            </div>
          </div>

          <div class="col">
            <div class="sec">Desglose del Dinero en Caja</div>
            <table>
              <thead><tr><th>Denominación</th><th class="num">Cant.</th><th class="num">Valor</th></tr></thead>
              <tbody>
                ${qa.filter(l=>Number(o.desglose[l.label]||0)>0&&(l.tipo!=="tasa"||Number(o.desglose.Dólares||0)>0)).map(l=>{const v=o.desglose[l.label]||0,C=ga(l,o.desglose);return`<tr><td>${l.label}</td><td class="num">${v}</td><td class="num">${l.tipo==="tasa"?"":n(C)}</td></tr>`}).join("")}
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
    `},Za=(o,a)=>{const d=(Qa||(N==null?void 0:N.formato_cierre_caja)||"pos_80mm")==="carta",r=wa(a),x=$a(a),l=(c,u,E={})=>E.siempre||Number(u)>0?`<div class="row${E.total?" total-row":""}"><span>${c}:</span><span${E.bold?' class="bold"':""}>${n(u)}</span></div>`:"",v=d?zt(o,a):`
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
          <h1 class="bold">${((N==null?void 0:N.nombre)||"MotoFlow").toUpperCase()}</h1>
          <p style="margin: 2px 0; font-size: 13px;">CIERRE DE CAJA</p>
          ${o._reimpresion?'<p class="bold" style="margin:2px 0;font-size:12px;">** REIMPRESION **</p>':""}
        </div>
        <div class="separator"></div>
        <div class="row"><span>Fecha:</span><span>${K(o.fecha)}</span></div>
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
        ${((a==null?void 0:a.recibosPorCuenta)||[]).map(c=>l(`&nbsp;&nbsp;&nbsp;&nbsp;↳ ${Dt(c.etiqueta)}`,c.monto,{siempre:!0})).join("")}`:""}
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
        ${a.prestamosEfectivo.map(c=>{var u;return`
          <div class="row">
            <span style="max-width: 70%;">${((u=c.clientes)==null?void 0:u.nombre)||c.numero||"PRÉSTAMO"}</span>
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
          ${(c.empleados||[]).map(u=>`
          <div class="row">
            <span style="max-width: 70%; padding-left: 8px;">· ${u.nombre}${u.yaEnGastos?" (en Gastos)":""}</span>
            <span>${n(u.monto)}</span>
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
        ${Number(a==null?void 0:a.fondoApertura)>0?`<div class="row"><span>+ FONDO DE APERTURA:</span><span>${n(a.fondoApertura)}</span></div>
        <div class="row total-row"><span>DEBE HABER EN GAVETA:</span><span>${n((Number(a.efectivoEnCaja)||0)+Number(a.fondoApertura))}</span></div>`:""}
        <div class="separator"></div>
        <div class="bold" style="margin-bottom: 4px;">DESGLOSE DINERO EN CAJA</div>
        <div class="row" style="font-size: 12px; border-bottom: 1px solid #000; margin-bottom: 2px;">
          <span style="flex: 1;">DENOM.</span>
          <span class="text-right" style="width: 42px;">CANT.</span>
          <span class="text-right" style="width: 84px;">VALOR</span>
        </div>
        ${qa.filter(c=>Number(o.desglose[c.label]||0)>0&&(c.tipo!=="tasa"||Number(o.desglose.Dólares||0)>0)).map(c=>{const u=o.desglose[c.label]||0,E=ga(c,o.desglose);return`<div class="row">
            <span style="flex: 1;">${c.label}</span>
            <span class="text-right" style="width: 42px;">${u}</span>
            <span class="text-right" style="width: 84px;">${c.tipo==="tasa"?"":n(E)}</span>
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
    `,C=document.createElement("iframe");C.style.cssText="position:fixed;right:0;bottom:0;width:0;height:0;border:0;",document.body.appendChild(C),C.contentWindow.document.open(),C.contentWindow.document.write(v),C.contentWindow.document.close(),setTimeout(()=>{document.body.contains(C)&&document.body.removeChild(C)},3e3)},Ka=g.useCallback(async()=>{if(!w)return;const{data:o,error:a}=await $.from("cierres_caja").select("*").eq("tenant_id",w).order("created_at",{ascending:!1}).limit(60);a||It(o||[])},[w]);g.useEffect(()=>{ia&&Ka()},[ia,Ka]);const[at,tt]=g.useState(null),Ut=async o=>{tt(o.id);try{const a=!o.detalle,d=o.detalle||await q(o.fecha);if(!d)throw new Error("No se pudo armar el desglose de esa fecha.");const r=Math.abs((Number(d.efectivoEnCaja)||0)-(Number(o.efectivo_en_caja)||0)),x=a?{...d,efectivoEnCaja:o.efectivo_en_caja}:d;Za({...o,_reimpresion:!0,_reconstruido:a,_descuadre:a&&r>.01?d.efectivoEnCaja:null},x)}catch(a){p({variant:"destructive",title:"No se pudo reimprimir",description:a.message})}finally{tt(null)}};return g.useEffect(()=>{const o=a=>{ta==="cierre-caja"&&(a.key==="Escape"&&a.defaultPrevented||(a.key==="F8"&&sa&&(a.preventDefault(),Ea()),a.key==="Escape"&&(a.preventDefault(),sa?Na(!1):va("cierre-caja"))))};return window.addEventListener("keydown",o),()=>window.removeEventListener("keydown",o)},[sa,Ea,va,ta]),t.jsxs(t.Fragment,{children:[t.jsx(io,{children:t.jsx("title",{children:"Cierre de Caja — MotoFlow"})}),t.jsx(lo.div,{initial:{opacity:0,y:20},animate:{opacity:1,y:0},className:"p-1 md:p-4 bg-gray-100 min-h-full flex flex-col",children:t.jsxs("div",{className:"bg-white p-4 rounded-lg shadow-md flex-grow flex flex-col",children:[t.jsxs("div",{className:"bg-morla-blue text-white py-1.5 rounded-t-lg mb-3 relative",children:[t.jsx("h1",{className:"text-white font-black tracking-[0.25em] italic uppercase text-base drop-shadow-sm text-center",children:"CIERRE DE CAJA"}),t.jsx("button",{type:"button",onClick:()=>q(),disabled:ya,title:"Actualizar los montos del día",className:"absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-white/20 disabled:opacity-50",children:t.jsx(no,{className:`w-4 h-4 ${ya?"animate-spin":""}`})})]}),T&&G(T)!==G(yt())&&t.jsxs("div",{className:"mb-3 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900",children:[t.jsxs("b",{children:["Estás cerrando una fecha pasada: ",Ct(T,"dd/MM/yyyy"),"."]})," ","Las cifras son las de ese día. Si ya vendiste hoy, el efectivo de la gaveta incluye lo de hoy y no va a cuadrar con el conteo."]}),t.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-4 gap-x-4 gap-y-2 px-3 py-2 border rounded-lg mb-3",children:[t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(xa,{className:"font-bold text-xs shrink-0",children:"Fecha"}),t.jsxs(mo,{children:[t.jsx(go,{asChild:!0,children:t.jsxs(Z,{variant:"outline",className:co("flex-1 min-w-0 h-8 justify-start text-left font-normal text-sm px-2",!T&&"text-muted-foreground"),children:[t.jsx(ro,{className:"mr-1.5 h-3.5 w-3.5 shrink-0"}),T?Ct(T,"dd/MM/yyyy"):t.jsx("span",{children:"Seleccione"})]})}),t.jsx(vo,{className:"w-auto p-0",children:t.jsx(ho,{mode:"single",selected:T,onSelect:Rt,initialFocus:!0})})]})]}),!B&&!V&&t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(xa,{className:"font-bold text-xs shrink-0",children:"Turno"}),t.jsx(Ma,{type:"number",min:"1",max:ja,value:oa,onChange:o=>ha(parseInt(o.target.value,10)||1),onFocus:o=>o.target.select(),className:"flex-1 min-w-0 h-8 text-center font-bold px-2"})]}),t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(xa,{className:"font-bold text-xs shrink-0",children:"Caja"}),t.jsxs(Fa,{value:"caja1",disabled:!0,children:[t.jsx(Pa,{className:"flex-1 min-w-0 h-8 text-sm px-2",children:t.jsx(Ia,{})}),t.jsx(La,{children:t.jsx(fa,{value:"caja1",children:"Caja No. 1"})})]}),V&&t.jsxs("span",{className:"text-[11px] text-gray-500 whitespace-nowrap",children:["Turno ",(f==null?void 0:f.turno)||1,f!=null&&f.desde?` · abierto ${new Date(f.desde).toLocaleTimeString("es-DO",{hour:"numeric",minute:"2-digit"})}`:" · desde la mañana",f!=null&&f.requiere_apertura?" · cerrado":""]})]}),t.jsxs("div",{className:"flex items-center gap-2 min-w-0",children:[t.jsx(xa,{className:"font-bold text-xs shrink-0",children:"Cajero"}),t.jsxs(Fa,{value:A,onValueChange:Ua,children:[t.jsx(Pa,{className:"flex-1 min-w-0 h-8 text-sm px-2",children:t.jsx(Ia,{placeholder:"Seleccione cajero"})}),t.jsxs(La,{children:[t.jsx(fa,{value:"ALL",className:"font-bold text-morla-blue",children:"📊 Todos los Cajeros (Consolidado)"}),za.map(o=>t.jsx(fa,{value:o.id,children:o.nombre_completo||o.email},o.id))]})]})]})]}),ya?t.jsx("div",{className:"flex-grow flex items-center justify-center",children:t.jsx(Va,{className:"h-8 w-8 animate-spin text-morla-blue"})}):s?t.jsxs("div",{className:"grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4",children:[t.jsxs("div",{className:"border rounded-lg p-4 bg-gradient-to-br from-slate-50 to-blue-50",children:[t.jsx("h2",{className:"font-bold text-sm uppercase text-gray-500 tracking-wider mb-3",children:A==="ALL"?"Resumen Total del Día":"Resumen del Turno"}),t.jsxs("div",{className:"space-y-2",children:[t.jsx(y,{label:"Cantidad de Facturas",value:s.cantFacturas,isCount:!0,siempre:!0}),t.jsx(y,{label:"Ventas Contado Caja",value:s.totalVentasContadoCaja}),t.jsx(y,{label:"Cuenta Contado Móvil",value:s.totalVentasContadoMovil}),t.jsx(y,{label:"Ventas por Transferencia/Tarjeta",value:s.totalVentasContadoNoEfectivo}),t.jsx(y,{label:"Retenido por clientes (pagan a la DGII)",value:s.totalRetencionesContado}),t.jsx(y,{label:"Ventas Crédito",value:s.totalVentasCredito}),t.jsx(y,{label:"Total Ventas",value:s.totalVentas,bold:!0}),Number(s.totalRecibosMovil)>0&&t.jsxs(t.Fragment,{children:[t.jsx(y,{label:"Recibos de Ingreso Caja",value:s.totalRecibosCaja}),t.jsx(y,{label:"Recibos de Ingreso Móvil",value:s.totalRecibosMovil})]}),t.jsx(y,{label:"Recibos de Ingreso (total)",value:s.totalRecibos}),Number(s.totalRecibosOtrasFormas)>0&&t.jsxs(t.Fragment,{children:[t.jsx(y,{label:"· Recibos en Efectivo",value:s.totalRecibosEfectivo}),t.jsx(y,{label:"· Recibos Transf/Cheque/Tarjeta",value:s.totalRecibosOtrasFormas}),(s.recibosPorCuenta||[]).map(o=>{const a=!!Ft[o.etiqueta],d=(o.detalle||[]).length>0;return t.jsxs("div",{className:"pl-4",children:[t.jsxs("button",{type:"button",disabled:!d,onClick:()=>Ha(r=>({...r,[o.etiqueta]:!r[o.etiqueta]})),className:"flex w-full items-center justify-between py-1 text-left disabled:cursor-default",title:d?"Ver los recibos":void 0,children:[t.jsxs("span",{className:"flex items-center gap-1 text-sm text-gray-600",children:[d&&t.jsx(Et,{className:`h-4 w-4 text-morla-blue transition-transform ${a?"":"-rotate-90"}`}),"↳ ",o.etiqueta,d&&t.jsxs("span",{className:"text-xs text-gray-400",children:["(",o.detalle.length,")"]})]}),t.jsx("span",{className:"font-mono text-sm text-gray-800",children:n(o.monto)})]}),a&&d&&t.jsx("div",{className:"mb-1 ml-5 rounded border border-gray-200 bg-white",children:o.detalle.map((r,x)=>t.jsxs("div",{className:"flex items-center justify-between gap-2 border-b border-gray-100 px-2 py-1 text-xs last:border-b-0",children:[t.jsx("span",{className:"min-w-0 truncate text-gray-700",title:r.cliente,children:r.cliente}),t.jsxs("span",{className:"shrink-0 font-mono text-gray-500",children:[r.recibo,r.pago?` · pago ${r.pago}`:""]}),t.jsx("span",{className:"w-24 shrink-0 text-right font-mono text-gray-800",children:n(r.monto)})]},`${r.recibo}-${x}`))})]},o.etiqueta)})]}),t.jsx(_a,{label:"Total ingreso en caja",value:$a(s)}),t.jsx(y,{label:"Gastos Diarios",value:s.totalGastosDiarios}),t.jsx(y,{label:"Nómina (Efectivo)",value:s.totalPagosNomina}),(s.pagosNomina||[]).length>0&&t.jsx("div",{className:"mt-1 mb-1 ml-3 pl-3 border-l-2 border-gray-200",children:s.pagosNomina.map(o=>t.jsxs("div",{className:"flex justify-between items-center py-0.5",children:[t.jsx("span",{className:"text-xs text-gray-500 truncate pr-2",title:o.descripcion,children:String(o.descripcion||"Nómina").split("—").pop().trim()}),t.jsx("span",{className:"font-mono text-xs text-gray-600 shrink-0",children:n(o.monto)})]},o.id||o.descripcion))}),t.jsx(y,{label:"Pagos a terceros (GPS, seguro...)",value:s.totalPagosTerceros}),t.jsx(y,{label:"Préstamos (Efectivo)",value:s.totalPrestamosEfectivo}),t.jsx(y,{label:"Compromisos (Efectivo)",value:s.totalCompromisosEfectivo}),(s.compromisosEfectivo||[]).filter(o=>(o.empleados||[]).length>0).map(o=>t.jsxs("div",{className:"mt-1 mb-1 ml-3 pl-3 border-l-2 border-gray-200",children:[t.jsx("p",{className:"text-[11px] font-semibold text-gray-400 uppercase tracking-wide",children:o.nombre}),o.empleados.map((a,d)=>t.jsxs("div",{className:"flex justify-between items-center py-0.5",children:[t.jsx("span",{className:`text-xs truncate pr-2 ${a.yaEnGastos?"text-gray-400 line-through":"text-gray-500"}`,children:a.nombre}),t.jsx("span",{className:`font-mono text-xs shrink-0 ${a.yaEnGastos?"text-gray-400 line-through":"text-gray-600"}`,children:n(a.monto)})]},`${o.id}-${d}`)),Number(o.cubierto)>0&&t.jsxs("p",{className:"text-[10px] text-amber-700 leading-snug mt-0.5",children:[n(o.cubierto)," ya salió como gasto el día de cada pago; aquí solo entra"," ",n(o.monto_efectivo),"."]})]},o.id)),t.jsx(y,{label:"Devoluciones",value:s.totalDevoluciones}),t.jsx(y,{label:"Pagos a Suplidores (Efectivo)",value:s.totalPagosSuplidores}),t.jsx(y,{label:"Compras de contado (Efectivo)",value:s.comprasContadoEfectivo}),t.jsx(_a,{label:"Gasto total",value:wa(s)}),(s.efectivoMovido||[]).length>0&&t.jsxs(t.Fragment,{children:[t.jsx("div",{className:"mt-2 mb-1 ml-3 pl-3 border-l-2 border-emerald-200",children:s.efectivoMovido.map(o=>t.jsxs("div",{className:"flex justify-between items-center py-0.5",children:[t.jsxs("span",{className:"text-xs text-gray-500 truncate pr-2",children:[o.cuenta,o.moneda&&o.moneda!=="DOP"?` (US$${Number(o.monto_cuenta).toLocaleString("es-DO",{minimumFractionDigits:2})} a ${Number(o.tasa)})`:"",o.concepto?` · ${o.concepto}`:""]}),t.jsx("span",{className:"font-mono text-xs text-gray-600 shrink-0",children:n(o.monto_caja)})]},o.id))}),t.jsx(_a,{label:"Efectivo movido a cuentas (no es gasto)",value:s.totalEfectivoMovido})]}),t.jsxs("div",{className:"flex justify-between items-center py-2 mt-2 bg-morla-blue/10 rounded px-3 border border-morla-blue/30",children:[t.jsx("span",{className:"font-bold text-morla-blue",children:"Efectivo en Caja"}),t.jsx("span",{className:"font-bold text-morla-blue text-lg font-mono",children:n(s.efectivoEnCaja)})]}),Number(s.fondoApertura)>0&&t.jsxs(t.Fragment,{children:[t.jsxs("div",{className:"flex justify-between px-3 py-1 text-sm",children:[t.jsx("span",{children:"+ Fondo de apertura"}),t.jsx("span",{className:"font-mono",children:n(s.fondoApertura)})]}),t.jsxs("div",{className:"flex justify-between items-center py-2 bg-emerald-50 rounded px-3 border border-emerald-200",children:[t.jsx("span",{className:"font-bold text-emerald-800",children:"Debe haber en la gaveta"}),t.jsx("span",{className:"font-bold text-emerald-800 text-lg font-mono",children:n(k)})]})]})]})]}),t.jsx("div",{className:"border rounded-lg p-4 flex flex-col",children:sa?t.jsxs("div",{className:"flex flex-col h-full",children:[t.jsxs("div",{className:"flex items-center justify-between gap-3 mb-2",children:[t.jsx("h3",{className:"font-bold text-sm uppercase tracking-widest text-gray-600",children:"DESGLOSE DE MONEDAS"}),t.jsxs(Fa,{value:"DOP",disabled:!0,children:[t.jsx(Pa,{className:"w-32 h-7 text-xs",children:t.jsx(Ia,{})}),t.jsx(La,{children:t.jsx(fa,{value:"DOP",children:"DOP - PESO"})})]})]}),t.jsx(po,{className:"flex-grow border rounded-lg max-h-[380px]",children:t.jsxs(_t,{children:[t.jsx(wt,{className:"bg-gray-200 sticky top-0 z-10",children:t.jsxs(aa,{className:"h-8",children:[t.jsx(I,{className:"w-20 h-8 py-1 font-bold text-xs",children:"MONEDA"}),t.jsx(I,{className:"w-24 h-8 py-1 font-bold text-center text-xs",children:"CANTIDAD"}),t.jsx(I,{className:"h-8 py-1 text-right font-bold text-xs",children:"VALOR"})]})}),t.jsx($t,{children:ma.filter(o=>o.tipo!=="tasa").map(o=>{const a=U[o.label]??0,d=ga(o,U);return t.jsxs(aa,{className:"hover:bg-yellow-50/50",children:[t.jsx(O,{className:"py-0.5 font-semibold text-right pr-4 text-sm whitespace-nowrap",children:o.label}),t.jsx(O,{className:"py-0.5 text-center",children:t.jsx(Ma,{type:"number",min:"0",step:o.tipo?"0.01":"1",value:a,onChange:r=>Xa(o,r.target.value),onFocus:r=>r.target.select(),onClick:r=>r.target.select(),className:"w-20 mx-auto text-center h-6 text-sm px-1"})}),t.jsx(O,{className:"py-0.5 text-right font-mono text-sm",children:o.tipo==="dolar"?t.jsxs("div",{className:"flex items-center justify-end gap-2",children:[t.jsx("span",{className:"text-xs text-gray-600 font-sans font-semibold whitespace-nowrap",children:"Tasa del día"}),t.jsx(Ma,{type:"number",min:"0",step:"0.01",value:U["Tasa del día"]??"",onChange:r=>Xa({label:"Tasa del día",tipo:"tasa"},r.target.value),onFocus:r=>r.target.select(),onClick:r=>r.target.select(),className:"w-20 text-center h-6 text-sm px-1"}),t.jsx("span",{className:"min-w-[90px]",children:n(d)})]}):n(d)})]},o.label)})}),t.jsx(jo,{className:"sticky bottom-0 bg-yellow-100 z-10",children:t.jsxs(aa,{className:"font-bold",children:[t.jsx(O,{colSpan:2,className:"py-1 text-right text-red-600 uppercase text-sm",children:"TOTAL ==>"}),t.jsx(O,{className:"py-1 text-right text-red-600 font-mono text-base",children:n(L)})]})})]})}),t.jsx("div",{className:"mt-2 px-2.5 py-2 bg-blue-50 border border-blue-200 rounded-lg",children:t.jsx(bo,{value:la,onChange:Vt,moneda:"DOP",contexto:"cierre_caja",label:"Depositar en",inline:!0})}),t.jsxs("div",{className:"mt-3 flex items-center justify-between",children:[t.jsxs("label",{className:"flex items-center gap-2 text-sm cursor-pointer",children:[t.jsx("input",{type:"checkbox",checked:Ca,onChange:o=>Pt(o.target.checked),className:"rounded"}),t.jsx(St,{className:"h-4 w-4"}),"Imprimir ?"]}),Ca&&t.jsxs("select",{value:Qa||(N==null?void 0:N.formato_cierre_caja)||"pos_80mm",onChange:o=>kt(o.target.value),className:"h-9 border border-slate-300 rounded px-2 text-xs font-bold bg-white",title:"Papel del impreso — se recuerda en esta PC",children:[t.jsx("option",{value:"pos_80mm",children:"📑 Ticket 80mm"}),t.jsx("option",{value:"carta",children:"📄 Carta (8.5 x 11)"})]}),t.jsxs(Z,{onClick:Ea,disabled:Ba,className:"bg-morla-blue hover:bg-morla-blue/90 text-white gap-2",children:[Ba?t.jsx(Va,{className:"h-4 w-4 animate-spin"}):t.jsx(xo,{className:"h-4 w-4"}),"F8 - Grabar y Cerrar ",B?"Caja":"Turno"]})]}),s&&t.jsxs("div",{className:`mt-3 p-3 rounded-lg text-center font-bold text-sm ${L-k===0?"bg-green-100 text-green-700":L-k<0?"bg-red-100 text-red-700":"bg-yellow-100 text-yellow-700"}`,children:["Diferencia: ",n(L-k),L-k===0&&" ✓ Cuadra",L-k<0&&" (Faltante)",L-k>0&&" (Sobrante)"]})]}):t.jsxs("div",{className:"flex-grow flex flex-col items-center justify-center gap-4",children:[t.jsxs(Z,{onClick:()=>Na(!0),size:"lg",className:"bg-morla-blue hover:bg-morla-blue/90 text-white px-8 py-6 text-base gap-3 shadow-lg",children:[t.jsx(uo,{className:"h-5 w-5"}),"Contar Efectivo y Cerrar ",B?"Caja":"Turno"]}),t.jsxs("p",{className:"text-xs text-gray-400 text-center max-w-[260px]",children:["Se cuentan los billetes y al grabar el desglose ",B?"la caja queda cerrada":"el turno queda cerrado","."]})]})})]}):null,t.jsxs("div",{className:"mt-4 border rounded-lg",children:[t.jsxs("button",{type:"button",onClick:()=>Lt(o=>!o),className:"w-full flex items-center justify-between px-4 py-2 text-left hover:bg-gray-50 transition-colors",children:[t.jsx("span",{className:"text-sm font-semibold text-gray-700",children:"Cierres anteriores"}),t.jsx(Et,{className:`h-4 w-4 text-gray-400 transition-transform ${ia?"rotate-180":""}`})]}),ia&&t.jsxs("div",{className:"border-t max-h-72 overflow-y-auto",children:[Ya.length===0?t.jsx("p",{className:"px-4 py-3 text-sm text-gray-400 italic",children:"No hay cierres grabados."}):t.jsxs(_t,{children:[t.jsx(wt,{children:t.jsxs(aa,{children:[t.jsx(I,{className:"text-xs",children:"Fecha"}),t.jsx(I,{className:"text-xs",children:"Turno"}),t.jsx(I,{className:"text-xs",children:"Cajero"}),t.jsx(I,{className:"text-xs text-right",children:"Efectivo"}),t.jsx(I,{className:"text-xs text-right",children:"Contado"}),t.jsx(I,{className:"text-xs text-right",children:"Diferencia"}),t.jsx(I,{className:"text-xs text-right",children:" "})]})}),t.jsx($t,{children:Ya.map(o=>{const a=Number(o.diferencia)||0;return t.jsxs(aa,{children:[t.jsx(O,{className:"text-sm py-1.5",children:K(o.fecha)}),t.jsx(O,{className:"text-sm py-1.5",children:o.turno}),t.jsx(O,{className:"text-sm py-1.5 max-w-[160px] truncate",title:o.cajero_nombre,children:o.cajero_nombre}),t.jsx(O,{className:"text-sm py-1.5 text-right font-mono",children:n(o.efectivo_en_caja)}),t.jsx(O,{className:"text-sm py-1.5 text-right font-mono",children:n(o.total_desglose)}),t.jsx(O,{className:`text-sm py-1.5 text-right font-mono ${Math.abs(a)<.005?"text-green-600":a<0?"text-red-600":"text-amber-600"}`,children:n(a)}),t.jsx(O,{className:"text-right py-1.5",children:t.jsxs(Z,{size:"sm",variant:"outline",className:"h-7 gap-1.5 text-xs",disabled:at===o.id,onClick:()=>Ut(o),children:[at===o.id?t.jsx(Va,{className:"h-3.5 w-3.5 animate-spin"}):t.jsx(St,{className:"h-3.5 w-3.5"})," Reimprimir"]})})]},o.id)})})]}),t.jsx("p",{className:"px-4 py-2 text-[11px] text-gray-400 italic border-t",children:"Sale marcado como reimpresión. Los cierres grabados desde hoy salen idénticos al original; los anteriores reconstruyen el desglose con los movimientos de esa fecha, y el efectivo y el conteo de billetes son siempre los que quedaron grabados."})]})]}),t.jsx("div",{className:"mt-auto pt-4 flex justify-end items-center space-x-4 border-t",children:t.jsxs(Z,{variant:"outline",onClick:()=>va("cierre-caja"),className:"gap-2",children:[t.jsx(fo,{className:"h-4 w-4"})," ESC - Salir"]})})]})})]})};export{Mo as default};
