var rs={exports:{}},Do={},os={exports:{}},$={};/**
 * @license React
 * react.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var Nr=Symbol.for("react.element"),Hd=Symbol.for("react.portal"),Wd=Symbol.for("react.fragment"),Kd=Symbol.for("react.strict_mode"),Yd=Symbol.for("react.profiler"),Xd=Symbol.for("react.provider"),Gd=Symbol.for("react.context"),Jd=Symbol.for("react.forward_ref"),qd=Symbol.for("react.suspense"),Zd=Symbol.for("react.memo"),ef=Symbol.for("react.lazy"),Au=Symbol.iterator;function tf(e){return e===null||typeof e!="object"?null:(e=Au&&e[Au]||e["@@iterator"],typeof e=="function"?e:null)}var ls={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},is=Object.assign,us={};function Fn(e,t,n){this.props=e,this.context=t,this.refs=us,this.updater=n||ls}Fn.prototype.isReactComponent={};Fn.prototype.setState=function(e,t){if(typeof e!="object"&&typeof e!="function"&&e!=null)throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");this.updater.enqueueSetState(this,e,t,"setState")};Fn.prototype.forceUpdate=function(e){this.updater.enqueueForceUpdate(this,e,"forceUpdate")};function as(){}as.prototype=Fn.prototype;function Li(e,t,n){this.props=e,this.context=t,this.refs=us,this.updater=n||ls}var Oi=Li.prototype=new as;Oi.constructor=Li;is(Oi,Fn.prototype);Oi.isPureReactComponent=!0;var Uu=Array.isArray,ss=Object.prototype.hasOwnProperty,Ii={current:null},cs={key:!0,ref:!0,__self:!0,__source:!0};function ds(e,t,n){var r,o={},l=null,i=null;if(t!=null)for(r in t.ref!==void 0&&(i=t.ref),t.key!==void 0&&(l=""+t.key),t)ss.call(t,r)&&!cs.hasOwnProperty(r)&&(o[r]=t[r]);var u=arguments.length-2;if(u===1)o.children=n;else if(1<u){for(var a=Array(u),d=0;d<u;d++)a[d]=arguments[d+2];o.children=a}if(e&&e.defaultProps)for(r in u=e.defaultProps,u)o[r]===void 0&&(o[r]=u[r]);return{$$typeof:Nr,type:e,key:l,ref:i,props:o,_owner:Ii.current}}function nf(e,t){return{$$typeof:Nr,type:e.type,key:t,ref:e.ref,props:e.props,_owner:e._owner}}function Mi(e){return typeof e=="object"&&e!==null&&e.$$typeof===Nr}function rf(e){var t={"=":"=0",":":"=2"};return"$"+e.replace(/[=:]/g,function(n){return t[n]})}var bu=/\/+/g;function fl(e,t){return typeof e=="object"&&e!==null&&e.key!=null?rf(""+e.key):t.toString(36)}function Jr(e,t,n,r,o){var l=typeof e;(l==="undefined"||l==="boolean")&&(e=null);var i=!1;if(e===null)i=!0;else switch(l){case"string":case"number":i=!0;break;case"object":switch(e.$$typeof){case Nr:case Hd:i=!0}}if(i)return i=e,o=o(i),e=r===""?"."+fl(i,0):r,Uu(o)?(n="",e!=null&&(n=e.replace(bu,"$&/")+"/"),Jr(o,t,n,"",function(d){return d})):o!=null&&(Mi(o)&&(o=nf(o,n+(!o.key||i&&i.key===o.key?"":(""+o.key).replace(bu,"$&/")+"/")+e)),t.push(o)),1;if(i=0,r=r===""?".":r+":",Uu(e))for(var u=0;u<e.length;u++){l=e[u];var a=r+fl(l,u);i+=Jr(l,t,n,a,o)}else if(a=tf(e),typeof a=="function")for(e=a.call(e),u=0;!(l=e.next()).done;)l=l.value,a=r+fl(l,u++),i+=Jr(l,t,n,a,o);else if(l==="object")throw t=String(e),Error("Objects are not valid as a React child (found: "+(t==="[object Object]"?"object with keys {"+Object.keys(e).join(", ")+"}":t)+"). If you meant to render a collection of children, use an array instead.");return i}function Ir(e,t,n){if(e==null)return e;var r=[],o=0;return Jr(e,r,"","",function(l){return t.call(n,l,o++)}),r}function of(e){if(e._status===-1){var t=e._result;t=t(),t.then(function(n){(e._status===0||e._status===-1)&&(e._status=1,e._result=n)},function(n){(e._status===0||e._status===-1)&&(e._status=2,e._result=n)}),e._status===-1&&(e._status=0,e._result=t)}if(e._status===1)return e._result.default;throw e._result}var ve={current:null},qr={transition:null},lf={ReactCurrentDispatcher:ve,ReactCurrentBatchConfig:qr,ReactCurrentOwner:Ii};function fs(){throw Error("act(...) is not supported in production builds of React.")}$.Children={map:Ir,forEach:function(e,t,n){Ir(e,function(){t.apply(this,arguments)},n)},count:function(e){var t=0;return Ir(e,function(){t++}),t},toArray:function(e){return Ir(e,function(t){return t})||[]},only:function(e){if(!Mi(e))throw Error("React.Children.only expected to receive a single React element child.");return e}};$.Component=Fn;$.Fragment=Wd;$.Profiler=Yd;$.PureComponent=Li;$.StrictMode=Kd;$.Suspense=qd;$.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=lf;$.act=fs;$.cloneElement=function(e,t,n){if(e==null)throw Error("React.cloneElement(...): The argument must be a React element, but you passed "+e+".");var r=is({},e.props),o=e.key,l=e.ref,i=e._owner;if(t!=null){if(t.ref!==void 0&&(l=t.ref,i=Ii.current),t.key!==void 0&&(o=""+t.key),e.type&&e.type.defaultProps)var u=e.type.defaultProps;for(a in t)ss.call(t,a)&&!cs.hasOwnProperty(a)&&(r[a]=t[a]===void 0&&u!==void 0?u[a]:t[a])}var a=arguments.length-2;if(a===1)r.children=n;else if(1<a){u=Array(a);for(var d=0;d<a;d++)u[d]=arguments[d+2];r.children=u}return{$$typeof:Nr,type:e.type,key:o,ref:l,props:r,_owner:i}};$.createContext=function(e){return e={$$typeof:Gd,_currentValue:e,_currentValue2:e,_threadCount:0,Provider:null,Consumer:null,_defaultValue:null,_globalName:null},e.Provider={$$typeof:Xd,_context:e},e.Consumer=e};$.createElement=ds;$.createFactory=function(e){var t=ds.bind(null,e);return t.type=e,t};$.createRef=function(){return{current:null}};$.forwardRef=function(e){return{$$typeof:Jd,render:e}};$.isValidElement=Mi;$.lazy=function(e){return{$$typeof:ef,_payload:{_status:-1,_result:e},_init:of}};$.memo=function(e,t){return{$$typeof:Zd,type:e,compare:t===void 0?null:t}};$.startTransition=function(e){var t=qr.transition;qr.transition={};try{e()}finally{qr.transition=t}};$.unstable_act=fs;$.useCallback=function(e,t){return ve.current.useCallback(e,t)};$.useContext=function(e){return ve.current.useContext(e)};$.useDebugValue=function(){};$.useDeferredValue=function(e){return ve.current.useDeferredValue(e)};$.useEffect=function(e,t){return ve.current.useEffect(e,t)};$.useId=function(){return ve.current.useId()};$.useImperativeHandle=function(e,t,n){return ve.current.useImperativeHandle(e,t,n)};$.useInsertionEffect=function(e,t){return ve.current.useInsertionEffect(e,t)};$.useLayoutEffect=function(e,t){return ve.current.useLayoutEffect(e,t)};$.useMemo=function(e,t){return ve.current.useMemo(e,t)};$.useReducer=function(e,t,n){return ve.current.useReducer(e,t,n)};$.useRef=function(e){return ve.current.useRef(e)};$.useState=function(e){return ve.current.useState(e)};$.useSyncExternalStore=function(e,t,n){return ve.current.useSyncExternalStore(e,t,n)};$.useTransition=function(){return ve.current.useTransition()};$.version="18.3.1";os.exports=$;var O=os.exports;/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var uf=O,af=Symbol.for("react.element"),sf=Symbol.for("react.fragment"),cf=Object.prototype.hasOwnProperty,df=uf.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,ff={key:!0,ref:!0,__self:!0,__source:!0};function ps(e,t,n){var r,o={},l=null,i=null;n!==void 0&&(l=""+n),t.key!==void 0&&(l=""+t.key),t.ref!==void 0&&(i=t.ref);for(r in t)cf.call(t,r)&&!ff.hasOwnProperty(r)&&(o[r]=t[r]);if(e&&e.defaultProps)for(r in t=e.defaultProps,t)o[r]===void 0&&(o[r]=t[r]);return{$$typeof:af,type:e,key:l,ref:i,props:o,_owner:df.current}}Do.Fragment=sf;Do.jsx=ps;Do.jsxs=ps;rs.exports=Do;var p=rs.exports,ms={exports:{}},Te={},hs={exports:{}},gs={};/**
 * @license React
 * scheduler.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */(function(e){function t(N,I){var R=N.length;N.push(I);e:for(;0<R;){var K=R-1>>>1,q=N[K];if(0<o(q,I))N[K]=I,N[R]=q,R=K;else break e}}function n(N){return N.length===0?null:N[0]}function r(N){if(N.length===0)return null;var I=N[0],R=N.pop();if(R!==I){N[0]=R;e:for(var K=0,q=N.length,Ut=q>>>1;K<Ut;){var Be=2*(K+1)-1,on=N[Be],le=Be+1,vt=N[le];if(0>o(on,R))le<q&&0>o(vt,on)?(N[K]=vt,N[le]=R,K=le):(N[K]=on,N[Be]=R,K=Be);else if(le<q&&0>o(vt,R))N[K]=vt,N[le]=R,K=le;else break e}}return I}function o(N,I){var R=N.sortIndex-I.sortIndex;return R!==0?R:N.id-I.id}if(typeof performance=="object"&&typeof performance.now=="function"){var l=performance;e.unstable_now=function(){return l.now()}}else{var i=Date,u=i.now();e.unstable_now=function(){return i.now()-u}}var a=[],d=[],v=1,g=null,h=3,S=!1,_=!1,k=!1,L=typeof setTimeout=="function"?setTimeout:null,f=typeof clearTimeout=="function"?clearTimeout:null,c=typeof setImmediate<"u"?setImmediate:null;typeof navigator<"u"&&navigator.scheduling!==void 0&&navigator.scheduling.isInputPending!==void 0&&navigator.scheduling.isInputPending.bind(navigator.scheduling);function m(N){for(var I=n(d);I!==null;){if(I.callback===null)r(d);else if(I.startTime<=N)r(d),I.sortIndex=I.expirationTime,t(a,I);else break;I=n(d)}}function x(N){if(k=!1,m(N),!_)if(n(a)!==null)_=!0,At(E);else{var I=n(d);I!==null&&Un(x,I.startTime-N)}}function E(N,I){_=!1,k&&(k=!1,f(T),T=-1),S=!0;var R=h;try{for(m(I),g=n(a);g!==null&&(!(g.expirationTime>I)||N&&!Ce());){var K=g.callback;if(typeof K=="function"){g.callback=null,h=g.priorityLevel;var q=K(g.expirationTime<=I);I=e.unstable_now(),typeof q=="function"?g.callback=q:g===n(a)&&r(a),m(I)}else r(a);g=n(a)}if(g!==null)var Ut=!0;else{var Be=n(d);Be!==null&&Un(x,Be.startTime-I),Ut=!1}return Ut}finally{g=null,h=R,S=!1}}var j=!1,P=null,T=-1,B=5,F=-1;function Ce(){return!(e.unstable_now()-F<B)}function nt(){if(P!==null){var N=e.unstable_now();F=N;var I=!0;try{I=P(!0,N)}finally{I?$t():(j=!1,P=null)}}else j=!1}var $t;if(typeof c=="function")$t=function(){c(nt)};else if(typeof MessageChannel<"u"){var rn=new MessageChannel,qo=rn.port2;rn.port1.onmessage=nt,$t=function(){qo.postMessage(null)}}else $t=function(){L(nt,0)};function At(N){P=N,j||(j=!0,$t())}function Un(N,I){T=L(function(){N(e.unstable_now())},I)}e.unstable_IdlePriority=5,e.unstable_ImmediatePriority=1,e.unstable_LowPriority=4,e.unstable_NormalPriority=3,e.unstable_Profiling=null,e.unstable_UserBlockingPriority=2,e.unstable_cancelCallback=function(N){N.callback=null},e.unstable_continueExecution=function(){_||S||(_=!0,At(E))},e.unstable_forceFrameRate=function(N){0>N||125<N?console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"):B=0<N?Math.floor(1e3/N):5},e.unstable_getCurrentPriorityLevel=function(){return h},e.unstable_getFirstCallbackNode=function(){return n(a)},e.unstable_next=function(N){switch(h){case 1:case 2:case 3:var I=3;break;default:I=h}var R=h;h=I;try{return N()}finally{h=R}},e.unstable_pauseExecution=function(){},e.unstable_requestPaint=function(){},e.unstable_runWithPriority=function(N,I){switch(N){case 1:case 2:case 3:case 4:case 5:break;default:N=3}var R=h;h=N;try{return I()}finally{h=R}},e.unstable_scheduleCallback=function(N,I,R){var K=e.unstable_now();switch(typeof R=="object"&&R!==null?(R=R.delay,R=typeof R=="number"&&0<R?K+R:K):R=K,N){case 1:var q=-1;break;case 2:q=250;break;case 5:q=1073741823;break;case 4:q=1e4;break;default:q=5e3}return q=R+q,N={id:v++,callback:I,priorityLevel:N,startTime:R,expirationTime:q,sortIndex:-1},R>K?(N.sortIndex=R,t(d,N),n(a)===null&&N===n(d)&&(k?(f(T),T=-1):k=!0,Un(x,R-K))):(N.sortIndex=q,t(a,N),_||S||(_=!0,At(E))),N},e.unstable_shouldYield=Ce,e.unstable_wrapCallback=function(N){var I=h;return function(){var R=h;h=I;try{return N.apply(this,arguments)}finally{h=R}}}})(gs);hs.exports=gs;var pf=hs.exports;/**
 * @license React
 * react-dom.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var mf=O,Pe=pf;function w(e){for(var t="https://reactjs.org/docs/error-decoder.html?invariant="+e,n=1;n<arguments.length;n++)t+="&args[]="+encodeURIComponent(arguments[n]);return"Minified React error #"+e+"; visit "+t+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}var vs=new Set,sr={};function en(e,t){Tn(e,t),Tn(e+"Capture",t)}function Tn(e,t){for(sr[e]=t,e=0;e<t.length;e++)vs.add(t[e])}var ft=!(typeof window>"u"||typeof window.document>"u"||typeof window.document.createElement>"u"),Al=Object.prototype.hasOwnProperty,hf=/^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/,Bu={},Vu={};function gf(e){return Al.call(Vu,e)?!0:Al.call(Bu,e)?!1:hf.test(e)?Vu[e]=!0:(Bu[e]=!0,!1)}function vf(e,t,n,r){if(n!==null&&n.type===0)return!1;switch(typeof t){case"function":case"symbol":return!0;case"boolean":return r?!1:n!==null?!n.acceptsBooleans:(e=e.toLowerCase().slice(0,5),e!=="data-"&&e!=="aria-");default:return!1}}function yf(e,t,n,r){if(t===null||typeof t>"u"||vf(e,t,n,r))return!0;if(r)return!1;if(n!==null)switch(n.type){case 3:return!t;case 4:return t===!1;case 5:return isNaN(t);case 6:return isNaN(t)||1>t}return!1}function ye(e,t,n,r,o,l,i){this.acceptsBooleans=t===2||t===3||t===4,this.attributeName=r,this.attributeNamespace=o,this.mustUseProperty=n,this.propertyName=e,this.type=t,this.sanitizeURL=l,this.removeEmptyString=i}var ce={};"children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(e){ce[e]=new ye(e,0,!1,e,null,!1,!1)});[["acceptCharset","accept-charset"],["className","class"],["htmlFor","for"],["httpEquiv","http-equiv"]].forEach(function(e){var t=e[0];ce[t]=new ye(t,1,!1,e[1],null,!1,!1)});["contentEditable","draggable","spellCheck","value"].forEach(function(e){ce[e]=new ye(e,2,!1,e.toLowerCase(),null,!1,!1)});["autoReverse","externalResourcesRequired","focusable","preserveAlpha"].forEach(function(e){ce[e]=new ye(e,2,!1,e,null,!1,!1)});"allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(e){ce[e]=new ye(e,3,!1,e.toLowerCase(),null,!1,!1)});["checked","multiple","muted","selected"].forEach(function(e){ce[e]=new ye(e,3,!0,e,null,!1,!1)});["capture","download"].forEach(function(e){ce[e]=new ye(e,4,!1,e,null,!1,!1)});["cols","rows","size","span"].forEach(function(e){ce[e]=new ye(e,6,!1,e,null,!1,!1)});["rowSpan","start"].forEach(function(e){ce[e]=new ye(e,5,!1,e.toLowerCase(),null,!1,!1)});var Ri=/[\-:]([a-z])/g;function Di(e){return e[1].toUpperCase()}"accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(e){var t=e.replace(Ri,Di);ce[t]=new ye(t,1,!1,e,null,!1,!1)});"xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(e){var t=e.replace(Ri,Di);ce[t]=new ye(t,1,!1,e,"http://www.w3.org/1999/xlink",!1,!1)});["xml:base","xml:lang","xml:space"].forEach(function(e){var t=e.replace(Ri,Di);ce[t]=new ye(t,1,!1,e,"http://www.w3.org/XML/1998/namespace",!1,!1)});["tabIndex","crossOrigin"].forEach(function(e){ce[e]=new ye(e,1,!1,e.toLowerCase(),null,!1,!1)});ce.xlinkHref=new ye("xlinkHref",1,!1,"xlink:href","http://www.w3.org/1999/xlink",!0,!1);["src","href","action","formAction"].forEach(function(e){ce[e]=new ye(e,1,!1,e.toLowerCase(),null,!0,!0)});function Fi(e,t,n,r){var o=ce.hasOwnProperty(t)?ce[t]:null;(o!==null?o.type!==0:r||!(2<t.length)||t[0]!=="o"&&t[0]!=="O"||t[1]!=="n"&&t[1]!=="N")&&(yf(t,n,o,r)&&(n=null),r||o===null?gf(t)&&(n===null?e.removeAttribute(t):e.setAttribute(t,""+n)):o.mustUseProperty?e[o.propertyName]=n===null?o.type===3?!1:"":n:(t=o.attributeName,r=o.attributeNamespace,n===null?e.removeAttribute(t):(o=o.type,n=o===3||o===4&&n===!0?"":""+n,r?e.setAttributeNS(r,t,n):e.setAttribute(t,n))))}var gt=mf.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,Mr=Symbol.for("react.element"),dn=Symbol.for("react.portal"),fn=Symbol.for("react.fragment"),$i=Symbol.for("react.strict_mode"),Ul=Symbol.for("react.profiler"),ys=Symbol.for("react.provider"),xs=Symbol.for("react.context"),Ai=Symbol.for("react.forward_ref"),bl=Symbol.for("react.suspense"),Bl=Symbol.for("react.suspense_list"),Ui=Symbol.for("react.memo"),xt=Symbol.for("react.lazy"),ws=Symbol.for("react.offscreen"),Qu=Symbol.iterator;function Bn(e){return e===null||typeof e!="object"?null:(e=Qu&&e[Qu]||e["@@iterator"],typeof e=="function"?e:null)}var J=Object.assign,pl;function Gn(e){if(pl===void 0)try{throw Error()}catch(n){var t=n.stack.trim().match(/\n( *(at )?)/);pl=t&&t[1]||""}return`
`+pl+e}var ml=!1;function hl(e,t){if(!e||ml)return"";ml=!0;var n=Error.prepareStackTrace;Error.prepareStackTrace=void 0;try{if(t)if(t=function(){throw Error()},Object.defineProperty(t.prototype,"props",{set:function(){throw Error()}}),typeof Reflect=="object"&&Reflect.construct){try{Reflect.construct(t,[])}catch(d){var r=d}Reflect.construct(e,[],t)}else{try{t.call()}catch(d){r=d}e.call(t.prototype)}else{try{throw Error()}catch(d){r=d}e()}}catch(d){if(d&&r&&typeof d.stack=="string"){for(var o=d.stack.split(`
`),l=r.stack.split(`
`),i=o.length-1,u=l.length-1;1<=i&&0<=u&&o[i]!==l[u];)u--;for(;1<=i&&0<=u;i--,u--)if(o[i]!==l[u]){if(i!==1||u!==1)do if(i--,u--,0>u||o[i]!==l[u]){var a=`
`+o[i].replace(" at new "," at ");return e.displayName&&a.includes("<anonymous>")&&(a=a.replace("<anonymous>",e.displayName)),a}while(1<=i&&0<=u);break}}}finally{ml=!1,Error.prepareStackTrace=n}return(e=e?e.displayName||e.name:"")?Gn(e):""}function xf(e){switch(e.tag){case 5:return Gn(e.type);case 16:return Gn("Lazy");case 13:return Gn("Suspense");case 19:return Gn("SuspenseList");case 0:case 2:case 15:return e=hl(e.type,!1),e;case 11:return e=hl(e.type.render,!1),e;case 1:return e=hl(e.type,!0),e;default:return""}}function Vl(e){if(e==null)return null;if(typeof e=="function")return e.displayName||e.name||null;if(typeof e=="string")return e;switch(e){case fn:return"Fragment";case dn:return"Portal";case Ul:return"Profiler";case $i:return"StrictMode";case bl:return"Suspense";case Bl:return"SuspenseList"}if(typeof e=="object")switch(e.$$typeof){case xs:return(e.displayName||"Context")+".Consumer";case ys:return(e._context.displayName||"Context")+".Provider";case Ai:var t=e.render;return e=e.displayName,e||(e=t.displayName||t.name||"",e=e!==""?"ForwardRef("+e+")":"ForwardRef"),e;case Ui:return t=e.displayName||null,t!==null?t:Vl(e.type)||"Memo";case xt:t=e._payload,e=e._init;try{return Vl(e(t))}catch{}}return null}function wf(e){var t=e.type;switch(e.tag){case 24:return"Cache";case 9:return(t.displayName||"Context")+".Consumer";case 10:return(t._context.displayName||"Context")+".Provider";case 18:return"DehydratedFragment";case 11:return e=t.render,e=e.displayName||e.name||"",t.displayName||(e!==""?"ForwardRef("+e+")":"ForwardRef");case 7:return"Fragment";case 5:return t;case 4:return"Portal";case 3:return"Root";case 6:return"Text";case 16:return Vl(t);case 8:return t===$i?"StrictMode":"Mode";case 22:return"Offscreen";case 12:return"Profiler";case 21:return"Scope";case 13:return"Suspense";case 19:return"SuspenseList";case 25:return"TracingMarker";case 1:case 0:case 17:case 2:case 14:case 15:if(typeof t=="function")return t.displayName||t.name||null;if(typeof t=="string")return t}return null}function It(e){switch(typeof e){case"boolean":case"number":case"string":case"undefined":return e;case"object":return e;default:return""}}function ks(e){var t=e.type;return(e=e.nodeName)&&e.toLowerCase()==="input"&&(t==="checkbox"||t==="radio")}function kf(e){var t=ks(e)?"checked":"value",n=Object.getOwnPropertyDescriptor(e.constructor.prototype,t),r=""+e[t];if(!e.hasOwnProperty(t)&&typeof n<"u"&&typeof n.get=="function"&&typeof n.set=="function"){var o=n.get,l=n.set;return Object.defineProperty(e,t,{configurable:!0,get:function(){return o.call(this)},set:function(i){r=""+i,l.call(this,i)}}),Object.defineProperty(e,t,{enumerable:n.enumerable}),{getValue:function(){return r},setValue:function(i){r=""+i},stopTracking:function(){e._valueTracker=null,delete e[t]}}}}function Rr(e){e._valueTracker||(e._valueTracker=kf(e))}function Ss(e){if(!e)return!1;var t=e._valueTracker;if(!t)return!0;var n=t.getValue(),r="";return e&&(r=ks(e)?e.checked?"true":"false":e.value),e=r,e!==n?(t.setValue(e),!0):!1}function so(e){if(e=e||(typeof document<"u"?document:void 0),typeof e>"u")return null;try{return e.activeElement||e.body}catch{return e.body}}function Ql(e,t){var n=t.checked;return J({},t,{defaultChecked:void 0,defaultValue:void 0,value:void 0,checked:n??e._wrapperState.initialChecked})}function Hu(e,t){var n=t.defaultValue==null?"":t.defaultValue,r=t.checked!=null?t.checked:t.defaultChecked;n=It(t.value!=null?t.value:n),e._wrapperState={initialChecked:r,initialValue:n,controlled:t.type==="checkbox"||t.type==="radio"?t.checked!=null:t.value!=null}}function _s(e,t){t=t.checked,t!=null&&Fi(e,"checked",t,!1)}function Hl(e,t){_s(e,t);var n=It(t.value),r=t.type;if(n!=null)r==="number"?(n===0&&e.value===""||e.value!=n)&&(e.value=""+n):e.value!==""+n&&(e.value=""+n);else if(r==="submit"||r==="reset"){e.removeAttribute("value");return}t.hasOwnProperty("value")?Wl(e,t.type,n):t.hasOwnProperty("defaultValue")&&Wl(e,t.type,It(t.defaultValue)),t.checked==null&&t.defaultChecked!=null&&(e.defaultChecked=!!t.defaultChecked)}function Wu(e,t,n){if(t.hasOwnProperty("value")||t.hasOwnProperty("defaultValue")){var r=t.type;if(!(r!=="submit"&&r!=="reset"||t.value!==void 0&&t.value!==null))return;t=""+e._wrapperState.initialValue,n||t===e.value||(e.value=t),e.defaultValue=t}n=e.name,n!==""&&(e.name=""),e.defaultChecked=!!e._wrapperState.initialChecked,n!==""&&(e.name=n)}function Wl(e,t,n){(t!=="number"||so(e.ownerDocument)!==e)&&(n==null?e.defaultValue=""+e._wrapperState.initialValue:e.defaultValue!==""+n&&(e.defaultValue=""+n))}var Jn=Array.isArray;function _n(e,t,n,r){if(e=e.options,t){t={};for(var o=0;o<n.length;o++)t["$"+n[o]]=!0;for(n=0;n<e.length;n++)o=t.hasOwnProperty("$"+e[n].value),e[n].selected!==o&&(e[n].selected=o),o&&r&&(e[n].defaultSelected=!0)}else{for(n=""+It(n),t=null,o=0;o<e.length;o++){if(e[o].value===n){e[o].selected=!0,r&&(e[o].defaultSelected=!0);return}t!==null||e[o].disabled||(t=e[o])}t!==null&&(t.selected=!0)}}function Kl(e,t){if(t.dangerouslySetInnerHTML!=null)throw Error(w(91));return J({},t,{value:void 0,defaultValue:void 0,children:""+e._wrapperState.initialValue})}function Ku(e,t){var n=t.value;if(n==null){if(n=t.children,t=t.defaultValue,n!=null){if(t!=null)throw Error(w(92));if(Jn(n)){if(1<n.length)throw Error(w(93));n=n[0]}t=n}t==null&&(t=""),n=t}e._wrapperState={initialValue:It(n)}}function Cs(e,t){var n=It(t.value),r=It(t.defaultValue);n!=null&&(n=""+n,n!==e.value&&(e.value=n),t.defaultValue==null&&e.defaultValue!==n&&(e.defaultValue=n)),r!=null&&(e.defaultValue=""+r)}function Yu(e){var t=e.textContent;t===e._wrapperState.initialValue&&t!==""&&t!==null&&(e.value=t)}function Es(e){switch(e){case"svg":return"http://www.w3.org/2000/svg";case"math":return"http://www.w3.org/1998/Math/MathML";default:return"http://www.w3.org/1999/xhtml"}}function Yl(e,t){return e==null||e==="http://www.w3.org/1999/xhtml"?Es(t):e==="http://www.w3.org/2000/svg"&&t==="foreignObject"?"http://www.w3.org/1999/xhtml":e}var Dr,Ns=function(e){return typeof MSApp<"u"&&MSApp.execUnsafeLocalFunction?function(t,n,r,o){MSApp.execUnsafeLocalFunction(function(){return e(t,n,r,o)})}:e}(function(e,t){if(e.namespaceURI!=="http://www.w3.org/2000/svg"||"innerHTML"in e)e.innerHTML=t;else{for(Dr=Dr||document.createElement("div"),Dr.innerHTML="<svg>"+t.valueOf().toString()+"</svg>",t=Dr.firstChild;e.firstChild;)e.removeChild(e.firstChild);for(;t.firstChild;)e.appendChild(t.firstChild)}});function cr(e,t){if(t){var n=e.firstChild;if(n&&n===e.lastChild&&n.nodeType===3){n.nodeValue=t;return}}e.textContent=t}var er={animationIterationCount:!0,aspectRatio:!0,borderImageOutset:!0,borderImageSlice:!0,borderImageWidth:!0,boxFlex:!0,boxFlexGroup:!0,boxOrdinalGroup:!0,columnCount:!0,columns:!0,flex:!0,flexGrow:!0,flexPositive:!0,flexShrink:!0,flexNegative:!0,flexOrder:!0,gridArea:!0,gridRow:!0,gridRowEnd:!0,gridRowSpan:!0,gridRowStart:!0,gridColumn:!0,gridColumnEnd:!0,gridColumnSpan:!0,gridColumnStart:!0,fontWeight:!0,lineClamp:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,tabSize:!0,widows:!0,zIndex:!0,zoom:!0,fillOpacity:!0,floodOpacity:!0,stopOpacity:!0,strokeDasharray:!0,strokeDashoffset:!0,strokeMiterlimit:!0,strokeOpacity:!0,strokeWidth:!0},Sf=["Webkit","ms","Moz","O"];Object.keys(er).forEach(function(e){Sf.forEach(function(t){t=t+e.charAt(0).toUpperCase()+e.substring(1),er[t]=er[e]})});function zs(e,t,n){return t==null||typeof t=="boolean"||t===""?"":n||typeof t!="number"||t===0||er.hasOwnProperty(e)&&er[e]?(""+t).trim():t+"px"}function js(e,t){e=e.style;for(var n in t)if(t.hasOwnProperty(n)){var r=n.indexOf("--")===0,o=zs(n,t[n],r);n==="float"&&(n="cssFloat"),r?e.setProperty(n,o):e[n]=o}}var _f=J({menuitem:!0},{area:!0,base:!0,br:!0,col:!0,embed:!0,hr:!0,img:!0,input:!0,keygen:!0,link:!0,meta:!0,param:!0,source:!0,track:!0,wbr:!0});function Xl(e,t){if(t){if(_f[e]&&(t.children!=null||t.dangerouslySetInnerHTML!=null))throw Error(w(137,e));if(t.dangerouslySetInnerHTML!=null){if(t.children!=null)throw Error(w(60));if(typeof t.dangerouslySetInnerHTML!="object"||!("__html"in t.dangerouslySetInnerHTML))throw Error(w(61))}if(t.style!=null&&typeof t.style!="object")throw Error(w(62))}}function Gl(e,t){if(e.indexOf("-")===-1)return typeof t.is=="string";switch(e){case"annotation-xml":case"color-profile":case"font-face":case"font-face-src":case"font-face-uri":case"font-face-format":case"font-face-name":case"missing-glyph":return!1;default:return!0}}var Jl=null;function bi(e){return e=e.target||e.srcElement||window,e.correspondingUseElement&&(e=e.correspondingUseElement),e.nodeType===3?e.parentNode:e}var ql=null,Cn=null,En=null;function Xu(e){if(e=Pr(e)){if(typeof ql!="function")throw Error(w(280));var t=e.stateNode;t&&(t=bo(t),ql(e.stateNode,e.type,t))}}function Ps(e){Cn?En?En.push(e):En=[e]:Cn=e}function Ts(){if(Cn){var e=Cn,t=En;if(En=Cn=null,Xu(e),t)for(e=0;e<t.length;e++)Xu(t[e])}}function Ls(e,t){return e(t)}function Os(){}var gl=!1;function Is(e,t,n){if(gl)return e(t,n);gl=!0;try{return Ls(e,t,n)}finally{gl=!1,(Cn!==null||En!==null)&&(Os(),Ts())}}function dr(e,t){var n=e.stateNode;if(n===null)return null;var r=bo(n);if(r===null)return null;n=r[t];e:switch(t){case"onClick":case"onClickCapture":case"onDoubleClick":case"onDoubleClickCapture":case"onMouseDown":case"onMouseDownCapture":case"onMouseMove":case"onMouseMoveCapture":case"onMouseUp":case"onMouseUpCapture":case"onMouseEnter":(r=!r.disabled)||(e=e.type,r=!(e==="button"||e==="input"||e==="select"||e==="textarea")),e=!r;break e;default:e=!1}if(e)return null;if(n&&typeof n!="function")throw Error(w(231,t,typeof n));return n}var Zl=!1;if(ft)try{var Vn={};Object.defineProperty(Vn,"passive",{get:function(){Zl=!0}}),window.addEventListener("test",Vn,Vn),window.removeEventListener("test",Vn,Vn)}catch{Zl=!1}function Cf(e,t,n,r,o,l,i,u,a){var d=Array.prototype.slice.call(arguments,3);try{t.apply(n,d)}catch(v){this.onError(v)}}var tr=!1,co=null,fo=!1,ei=null,Ef={onError:function(e){tr=!0,co=e}};function Nf(e,t,n,r,o,l,i,u,a){tr=!1,co=null,Cf.apply(Ef,arguments)}function zf(e,t,n,r,o,l,i,u,a){if(Nf.apply(this,arguments),tr){if(tr){var d=co;tr=!1,co=null}else throw Error(w(198));fo||(fo=!0,ei=d)}}function tn(e){var t=e,n=e;if(e.alternate)for(;t.return;)t=t.return;else{e=t;do t=e,t.flags&4098&&(n=t.return),e=t.return;while(e)}return t.tag===3?n:null}function Ms(e){if(e.tag===13){var t=e.memoizedState;if(t===null&&(e=e.alternate,e!==null&&(t=e.memoizedState)),t!==null)return t.dehydrated}return null}function Gu(e){if(tn(e)!==e)throw Error(w(188))}function jf(e){var t=e.alternate;if(!t){if(t=tn(e),t===null)throw Error(w(188));return t!==e?null:e}for(var n=e,r=t;;){var o=n.return;if(o===null)break;var l=o.alternate;if(l===null){if(r=o.return,r!==null){n=r;continue}break}if(o.child===l.child){for(l=o.child;l;){if(l===n)return Gu(o),e;if(l===r)return Gu(o),t;l=l.sibling}throw Error(w(188))}if(n.return!==r.return)n=o,r=l;else{for(var i=!1,u=o.child;u;){if(u===n){i=!0,n=o,r=l;break}if(u===r){i=!0,r=o,n=l;break}u=u.sibling}if(!i){for(u=l.child;u;){if(u===n){i=!0,n=l,r=o;break}if(u===r){i=!0,r=l,n=o;break}u=u.sibling}if(!i)throw Error(w(189))}}if(n.alternate!==r)throw Error(w(190))}if(n.tag!==3)throw Error(w(188));return n.stateNode.current===n?e:t}function Rs(e){return e=jf(e),e!==null?Ds(e):null}function Ds(e){if(e.tag===5||e.tag===6)return e;for(e=e.child;e!==null;){var t=Ds(e);if(t!==null)return t;e=e.sibling}return null}var Fs=Pe.unstable_scheduleCallback,Ju=Pe.unstable_cancelCallback,Pf=Pe.unstable_shouldYield,Tf=Pe.unstable_requestPaint,te=Pe.unstable_now,Lf=Pe.unstable_getCurrentPriorityLevel,Bi=Pe.unstable_ImmediatePriority,$s=Pe.unstable_UserBlockingPriority,po=Pe.unstable_NormalPriority,Of=Pe.unstable_LowPriority,As=Pe.unstable_IdlePriority,Fo=null,et=null;function If(e){if(et&&typeof et.onCommitFiberRoot=="function")try{et.onCommitFiberRoot(Fo,e,void 0,(e.current.flags&128)===128)}catch{}}var Ye=Math.clz32?Math.clz32:Df,Mf=Math.log,Rf=Math.LN2;function Df(e){return e>>>=0,e===0?32:31-(Mf(e)/Rf|0)|0}var Fr=64,$r=4194304;function qn(e){switch(e&-e){case 1:return 1;case 2:return 2;case 4:return 4;case 8:return 8;case 16:return 16;case 32:return 32;case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return e&4194240;case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:return e&130023424;case 134217728:return 134217728;case 268435456:return 268435456;case 536870912:return 536870912;case 1073741824:return 1073741824;default:return e}}function mo(e,t){var n=e.pendingLanes;if(n===0)return 0;var r=0,o=e.suspendedLanes,l=e.pingedLanes,i=n&268435455;if(i!==0){var u=i&~o;u!==0?r=qn(u):(l&=i,l!==0&&(r=qn(l)))}else i=n&~o,i!==0?r=qn(i):l!==0&&(r=qn(l));if(r===0)return 0;if(t!==0&&t!==r&&!(t&o)&&(o=r&-r,l=t&-t,o>=l||o===16&&(l&4194240)!==0))return t;if(r&4&&(r|=n&16),t=e.entangledLanes,t!==0)for(e=e.entanglements,t&=r;0<t;)n=31-Ye(t),o=1<<n,r|=e[n],t&=~o;return r}function Ff(e,t){switch(e){case 1:case 2:case 4:return t+250;case 8:case 16:case 32:case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return t+5e3;case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:return-1;case 134217728:case 268435456:case 536870912:case 1073741824:return-1;default:return-1}}function $f(e,t){for(var n=e.suspendedLanes,r=e.pingedLanes,o=e.expirationTimes,l=e.pendingLanes;0<l;){var i=31-Ye(l),u=1<<i,a=o[i];a===-1?(!(u&n)||u&r)&&(o[i]=Ff(u,t)):a<=t&&(e.expiredLanes|=u),l&=~u}}function ti(e){return e=e.pendingLanes&-1073741825,e!==0?e:e&1073741824?1073741824:0}function Us(){var e=Fr;return Fr<<=1,!(Fr&4194240)&&(Fr=64),e}function vl(e){for(var t=[],n=0;31>n;n++)t.push(e);return t}function zr(e,t,n){e.pendingLanes|=t,t!==536870912&&(e.suspendedLanes=0,e.pingedLanes=0),e=e.eventTimes,t=31-Ye(t),e[t]=n}function Af(e,t){var n=e.pendingLanes&~t;e.pendingLanes=t,e.suspendedLanes=0,e.pingedLanes=0,e.expiredLanes&=t,e.mutableReadLanes&=t,e.entangledLanes&=t,t=e.entanglements;var r=e.eventTimes;for(e=e.expirationTimes;0<n;){var o=31-Ye(n),l=1<<o;t[o]=0,r[o]=-1,e[o]=-1,n&=~l}}function Vi(e,t){var n=e.entangledLanes|=t;for(e=e.entanglements;n;){var r=31-Ye(n),o=1<<r;o&t|e[r]&t&&(e[r]|=t),n&=~o}}var b=0;function bs(e){return e&=-e,1<e?4<e?e&268435455?16:536870912:4:1}var Bs,Qi,Vs,Qs,Hs,ni=!1,Ar=[],Et=null,Nt=null,zt=null,fr=new Map,pr=new Map,kt=[],Uf="mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset submit".split(" ");function qu(e,t){switch(e){case"focusin":case"focusout":Et=null;break;case"dragenter":case"dragleave":Nt=null;break;case"mouseover":case"mouseout":zt=null;break;case"pointerover":case"pointerout":fr.delete(t.pointerId);break;case"gotpointercapture":case"lostpointercapture":pr.delete(t.pointerId)}}function Qn(e,t,n,r,o,l){return e===null||e.nativeEvent!==l?(e={blockedOn:t,domEventName:n,eventSystemFlags:r,nativeEvent:l,targetContainers:[o]},t!==null&&(t=Pr(t),t!==null&&Qi(t)),e):(e.eventSystemFlags|=r,t=e.targetContainers,o!==null&&t.indexOf(o)===-1&&t.push(o),e)}function bf(e,t,n,r,o){switch(t){case"focusin":return Et=Qn(Et,e,t,n,r,o),!0;case"dragenter":return Nt=Qn(Nt,e,t,n,r,o),!0;case"mouseover":return zt=Qn(zt,e,t,n,r,o),!0;case"pointerover":var l=o.pointerId;return fr.set(l,Qn(fr.get(l)||null,e,t,n,r,o)),!0;case"gotpointercapture":return l=o.pointerId,pr.set(l,Qn(pr.get(l)||null,e,t,n,r,o)),!0}return!1}function Ws(e){var t=Qt(e.target);if(t!==null){var n=tn(t);if(n!==null){if(t=n.tag,t===13){if(t=Ms(n),t!==null){e.blockedOn=t,Hs(e.priority,function(){Vs(n)});return}}else if(t===3&&n.stateNode.current.memoizedState.isDehydrated){e.blockedOn=n.tag===3?n.stateNode.containerInfo:null;return}}}e.blockedOn=null}function Zr(e){if(e.blockedOn!==null)return!1;for(var t=e.targetContainers;0<t.length;){var n=ri(e.domEventName,e.eventSystemFlags,t[0],e.nativeEvent);if(n===null){n=e.nativeEvent;var r=new n.constructor(n.type,n);Jl=r,n.target.dispatchEvent(r),Jl=null}else return t=Pr(n),t!==null&&Qi(t),e.blockedOn=n,!1;t.shift()}return!0}function Zu(e,t,n){Zr(e)&&n.delete(t)}function Bf(){ni=!1,Et!==null&&Zr(Et)&&(Et=null),Nt!==null&&Zr(Nt)&&(Nt=null),zt!==null&&Zr(zt)&&(zt=null),fr.forEach(Zu),pr.forEach(Zu)}function Hn(e,t){e.blockedOn===t&&(e.blockedOn=null,ni||(ni=!0,Pe.unstable_scheduleCallback(Pe.unstable_NormalPriority,Bf)))}function mr(e){function t(o){return Hn(o,e)}if(0<Ar.length){Hn(Ar[0],e);for(var n=1;n<Ar.length;n++){var r=Ar[n];r.blockedOn===e&&(r.blockedOn=null)}}for(Et!==null&&Hn(Et,e),Nt!==null&&Hn(Nt,e),zt!==null&&Hn(zt,e),fr.forEach(t),pr.forEach(t),n=0;n<kt.length;n++)r=kt[n],r.blockedOn===e&&(r.blockedOn=null);for(;0<kt.length&&(n=kt[0],n.blockedOn===null);)Ws(n),n.blockedOn===null&&kt.shift()}var Nn=gt.ReactCurrentBatchConfig,ho=!0;function Vf(e,t,n,r){var o=b,l=Nn.transition;Nn.transition=null;try{b=1,Hi(e,t,n,r)}finally{b=o,Nn.transition=l}}function Qf(e,t,n,r){var o=b,l=Nn.transition;Nn.transition=null;try{b=4,Hi(e,t,n,r)}finally{b=o,Nn.transition=l}}function Hi(e,t,n,r){if(ho){var o=ri(e,t,n,r);if(o===null)zl(e,t,r,go,n),qu(e,r);else if(bf(o,e,t,n,r))r.stopPropagation();else if(qu(e,r),t&4&&-1<Uf.indexOf(e)){for(;o!==null;){var l=Pr(o);if(l!==null&&Bs(l),l=ri(e,t,n,r),l===null&&zl(e,t,r,go,n),l===o)break;o=l}o!==null&&r.stopPropagation()}else zl(e,t,r,null,n)}}var go=null;function ri(e,t,n,r){if(go=null,e=bi(r),e=Qt(e),e!==null)if(t=tn(e),t===null)e=null;else if(n=t.tag,n===13){if(e=Ms(t),e!==null)return e;e=null}else if(n===3){if(t.stateNode.current.memoizedState.isDehydrated)return t.tag===3?t.stateNode.containerInfo:null;e=null}else t!==e&&(e=null);return go=e,null}function Ks(e){switch(e){case"cancel":case"click":case"close":case"contextmenu":case"copy":case"cut":case"auxclick":case"dblclick":case"dragend":case"dragstart":case"drop":case"focusin":case"focusout":case"input":case"invalid":case"keydown":case"keypress":case"keyup":case"mousedown":case"mouseup":case"paste":case"pause":case"play":case"pointercancel":case"pointerdown":case"pointerup":case"ratechange":case"reset":case"resize":case"seeked":case"submit":case"touchcancel":case"touchend":case"touchstart":case"volumechange":case"change":case"selectionchange":case"textInput":case"compositionstart":case"compositionend":case"compositionupdate":case"beforeblur":case"afterblur":case"beforeinput":case"blur":case"fullscreenchange":case"focus":case"hashchange":case"popstate":case"select":case"selectstart":return 1;case"drag":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"mousemove":case"mouseout":case"mouseover":case"pointermove":case"pointerout":case"pointerover":case"scroll":case"toggle":case"touchmove":case"wheel":case"mouseenter":case"mouseleave":case"pointerenter":case"pointerleave":return 4;case"message":switch(Lf()){case Bi:return 1;case $s:return 4;case po:case Of:return 16;case As:return 536870912;default:return 16}default:return 16}}var _t=null,Wi=null,eo=null;function Ys(){if(eo)return eo;var e,t=Wi,n=t.length,r,o="value"in _t?_t.value:_t.textContent,l=o.length;for(e=0;e<n&&t[e]===o[e];e++);var i=n-e;for(r=1;r<=i&&t[n-r]===o[l-r];r++);return eo=o.slice(e,1<r?1-r:void 0)}function to(e){var t=e.keyCode;return"charCode"in e?(e=e.charCode,e===0&&t===13&&(e=13)):e=t,e===10&&(e=13),32<=e||e===13?e:0}function Ur(){return!0}function ea(){return!1}function Le(e){function t(n,r,o,l,i){this._reactName=n,this._targetInst=o,this.type=r,this.nativeEvent=l,this.target=i,this.currentTarget=null;for(var u in e)e.hasOwnProperty(u)&&(n=e[u],this[u]=n?n(l):l[u]);return this.isDefaultPrevented=(l.defaultPrevented!=null?l.defaultPrevented:l.returnValue===!1)?Ur:ea,this.isPropagationStopped=ea,this}return J(t.prototype,{preventDefault:function(){this.defaultPrevented=!0;var n=this.nativeEvent;n&&(n.preventDefault?n.preventDefault():typeof n.returnValue!="unknown"&&(n.returnValue=!1),this.isDefaultPrevented=Ur)},stopPropagation:function(){var n=this.nativeEvent;n&&(n.stopPropagation?n.stopPropagation():typeof n.cancelBubble!="unknown"&&(n.cancelBubble=!0),this.isPropagationStopped=Ur)},persist:function(){},isPersistent:Ur}),t}var $n={eventPhase:0,bubbles:0,cancelable:0,timeStamp:function(e){return e.timeStamp||Date.now()},defaultPrevented:0,isTrusted:0},Ki=Le($n),jr=J({},$n,{view:0,detail:0}),Hf=Le(jr),yl,xl,Wn,$o=J({},jr,{screenX:0,screenY:0,clientX:0,clientY:0,pageX:0,pageY:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,getModifierState:Yi,button:0,buttons:0,relatedTarget:function(e){return e.relatedTarget===void 0?e.fromElement===e.srcElement?e.toElement:e.fromElement:e.relatedTarget},movementX:function(e){return"movementX"in e?e.movementX:(e!==Wn&&(Wn&&e.type==="mousemove"?(yl=e.screenX-Wn.screenX,xl=e.screenY-Wn.screenY):xl=yl=0,Wn=e),yl)},movementY:function(e){return"movementY"in e?e.movementY:xl}}),ta=Le($o),Wf=J({},$o,{dataTransfer:0}),Kf=Le(Wf),Yf=J({},jr,{relatedTarget:0}),wl=Le(Yf),Xf=J({},$n,{animationName:0,elapsedTime:0,pseudoElement:0}),Gf=Le(Xf),Jf=J({},$n,{clipboardData:function(e){return"clipboardData"in e?e.clipboardData:window.clipboardData}}),qf=Le(Jf),Zf=J({},$n,{data:0}),na=Le(Zf),ep={Esc:"Escape",Spacebar:" ",Left:"ArrowLeft",Up:"ArrowUp",Right:"ArrowRight",Down:"ArrowDown",Del:"Delete",Win:"OS",Menu:"ContextMenu",Apps:"ContextMenu",Scroll:"ScrollLock",MozPrintableKey:"Unidentified"},tp={8:"Backspace",9:"Tab",12:"Clear",13:"Enter",16:"Shift",17:"Control",18:"Alt",19:"Pause",20:"CapsLock",27:"Escape",32:" ",33:"PageUp",34:"PageDown",35:"End",36:"Home",37:"ArrowLeft",38:"ArrowUp",39:"ArrowRight",40:"ArrowDown",45:"Insert",46:"Delete",112:"F1",113:"F2",114:"F3",115:"F4",116:"F5",117:"F6",118:"F7",119:"F8",120:"F9",121:"F10",122:"F11",123:"F12",144:"NumLock",145:"ScrollLock",224:"Meta"},np={Alt:"altKey",Control:"ctrlKey",Meta:"metaKey",Shift:"shiftKey"};function rp(e){var t=this.nativeEvent;return t.getModifierState?t.getModifierState(e):(e=np[e])?!!t[e]:!1}function Yi(){return rp}var op=J({},jr,{key:function(e){if(e.key){var t=ep[e.key]||e.key;if(t!=="Unidentified")return t}return e.type==="keypress"?(e=to(e),e===13?"Enter":String.fromCharCode(e)):e.type==="keydown"||e.type==="keyup"?tp[e.keyCode]||"Unidentified":""},code:0,location:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,repeat:0,locale:0,getModifierState:Yi,charCode:function(e){return e.type==="keypress"?to(e):0},keyCode:function(e){return e.type==="keydown"||e.type==="keyup"?e.keyCode:0},which:function(e){return e.type==="keypress"?to(e):e.type==="keydown"||e.type==="keyup"?e.keyCode:0}}),lp=Le(op),ip=J({},$o,{pointerId:0,width:0,height:0,pressure:0,tangentialPressure:0,tiltX:0,tiltY:0,twist:0,pointerType:0,isPrimary:0}),ra=Le(ip),up=J({},jr,{touches:0,targetTouches:0,changedTouches:0,altKey:0,metaKey:0,ctrlKey:0,shiftKey:0,getModifierState:Yi}),ap=Le(up),sp=J({},$n,{propertyName:0,elapsedTime:0,pseudoElement:0}),cp=Le(sp),dp=J({},$o,{deltaX:function(e){return"deltaX"in e?e.deltaX:"wheelDeltaX"in e?-e.wheelDeltaX:0},deltaY:function(e){return"deltaY"in e?e.deltaY:"wheelDeltaY"in e?-e.wheelDeltaY:"wheelDelta"in e?-e.wheelDelta:0},deltaZ:0,deltaMode:0}),fp=Le(dp),pp=[9,13,27,32],Xi=ft&&"CompositionEvent"in window,nr=null;ft&&"documentMode"in document&&(nr=document.documentMode);var mp=ft&&"TextEvent"in window&&!nr,Xs=ft&&(!Xi||nr&&8<nr&&11>=nr),oa=String.fromCharCode(32),la=!1;function Gs(e,t){switch(e){case"keyup":return pp.indexOf(t.keyCode)!==-1;case"keydown":return t.keyCode!==229;case"keypress":case"mousedown":case"focusout":return!0;default:return!1}}function Js(e){return e=e.detail,typeof e=="object"&&"data"in e?e.data:null}var pn=!1;function hp(e,t){switch(e){case"compositionend":return Js(t);case"keypress":return t.which!==32?null:(la=!0,oa);case"textInput":return e=t.data,e===oa&&la?null:e;default:return null}}function gp(e,t){if(pn)return e==="compositionend"||!Xi&&Gs(e,t)?(e=Ys(),eo=Wi=_t=null,pn=!1,e):null;switch(e){case"paste":return null;case"keypress":if(!(t.ctrlKey||t.altKey||t.metaKey)||t.ctrlKey&&t.altKey){if(t.char&&1<t.char.length)return t.char;if(t.which)return String.fromCharCode(t.which)}return null;case"compositionend":return Xs&&t.locale!=="ko"?null:t.data;default:return null}}var vp={color:!0,date:!0,datetime:!0,"datetime-local":!0,email:!0,month:!0,number:!0,password:!0,range:!0,search:!0,tel:!0,text:!0,time:!0,url:!0,week:!0};function ia(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t==="input"?!!vp[e.type]:t==="textarea"}function qs(e,t,n,r){Ps(r),t=vo(t,"onChange"),0<t.length&&(n=new Ki("onChange","change",null,n,r),e.push({event:n,listeners:t}))}var rr=null,hr=null;function yp(e){sc(e,0)}function Ao(e){var t=gn(e);if(Ss(t))return e}function xp(e,t){if(e==="change")return t}var Zs=!1;if(ft){var kl;if(ft){var Sl="oninput"in document;if(!Sl){var ua=document.createElement("div");ua.setAttribute("oninput","return;"),Sl=typeof ua.oninput=="function"}kl=Sl}else kl=!1;Zs=kl&&(!document.documentMode||9<document.documentMode)}function aa(){rr&&(rr.detachEvent("onpropertychange",ec),hr=rr=null)}function ec(e){if(e.propertyName==="value"&&Ao(hr)){var t=[];qs(t,hr,e,bi(e)),Is(yp,t)}}function wp(e,t,n){e==="focusin"?(aa(),rr=t,hr=n,rr.attachEvent("onpropertychange",ec)):e==="focusout"&&aa()}function kp(e){if(e==="selectionchange"||e==="keyup"||e==="keydown")return Ao(hr)}function Sp(e,t){if(e==="click")return Ao(t)}function _p(e,t){if(e==="input"||e==="change")return Ao(t)}function Cp(e,t){return e===t&&(e!==0||1/e===1/t)||e!==e&&t!==t}var Ge=typeof Object.is=="function"?Object.is:Cp;function gr(e,t){if(Ge(e,t))return!0;if(typeof e!="object"||e===null||typeof t!="object"||t===null)return!1;var n=Object.keys(e),r=Object.keys(t);if(n.length!==r.length)return!1;for(r=0;r<n.length;r++){var o=n[r];if(!Al.call(t,o)||!Ge(e[o],t[o]))return!1}return!0}function sa(e){for(;e&&e.firstChild;)e=e.firstChild;return e}function ca(e,t){var n=sa(e);e=0;for(var r;n;){if(n.nodeType===3){if(r=e+n.textContent.length,e<=t&&r>=t)return{node:n,offset:t-e};e=r}e:{for(;n;){if(n.nextSibling){n=n.nextSibling;break e}n=n.parentNode}n=void 0}n=sa(n)}}function tc(e,t){return e&&t?e===t?!0:e&&e.nodeType===3?!1:t&&t.nodeType===3?tc(e,t.parentNode):"contains"in e?e.contains(t):e.compareDocumentPosition?!!(e.compareDocumentPosition(t)&16):!1:!1}function nc(){for(var e=window,t=so();t instanceof e.HTMLIFrameElement;){try{var n=typeof t.contentWindow.location.href=="string"}catch{n=!1}if(n)e=t.contentWindow;else break;t=so(e.document)}return t}function Gi(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t&&(t==="input"&&(e.type==="text"||e.type==="search"||e.type==="tel"||e.type==="url"||e.type==="password")||t==="textarea"||e.contentEditable==="true")}function Ep(e){var t=nc(),n=e.focusedElem,r=e.selectionRange;if(t!==n&&n&&n.ownerDocument&&tc(n.ownerDocument.documentElement,n)){if(r!==null&&Gi(n)){if(t=r.start,e=r.end,e===void 0&&(e=t),"selectionStart"in n)n.selectionStart=t,n.selectionEnd=Math.min(e,n.value.length);else if(e=(t=n.ownerDocument||document)&&t.defaultView||window,e.getSelection){e=e.getSelection();var o=n.textContent.length,l=Math.min(r.start,o);r=r.end===void 0?l:Math.min(r.end,o),!e.extend&&l>r&&(o=r,r=l,l=o),o=ca(n,l);var i=ca(n,r);o&&i&&(e.rangeCount!==1||e.anchorNode!==o.node||e.anchorOffset!==o.offset||e.focusNode!==i.node||e.focusOffset!==i.offset)&&(t=t.createRange(),t.setStart(o.node,o.offset),e.removeAllRanges(),l>r?(e.addRange(t),e.extend(i.node,i.offset)):(t.setEnd(i.node,i.offset),e.addRange(t)))}}for(t=[],e=n;e=e.parentNode;)e.nodeType===1&&t.push({element:e,left:e.scrollLeft,top:e.scrollTop});for(typeof n.focus=="function"&&n.focus(),n=0;n<t.length;n++)e=t[n],e.element.scrollLeft=e.left,e.element.scrollTop=e.top}}var Np=ft&&"documentMode"in document&&11>=document.documentMode,mn=null,oi=null,or=null,li=!1;function da(e,t,n){var r=n.window===n?n.document:n.nodeType===9?n:n.ownerDocument;li||mn==null||mn!==so(r)||(r=mn,"selectionStart"in r&&Gi(r)?r={start:r.selectionStart,end:r.selectionEnd}:(r=(r.ownerDocument&&r.ownerDocument.defaultView||window).getSelection(),r={anchorNode:r.anchorNode,anchorOffset:r.anchorOffset,focusNode:r.focusNode,focusOffset:r.focusOffset}),or&&gr(or,r)||(or=r,r=vo(oi,"onSelect"),0<r.length&&(t=new Ki("onSelect","select",null,t,n),e.push({event:t,listeners:r}),t.target=mn)))}function br(e,t){var n={};return n[e.toLowerCase()]=t.toLowerCase(),n["Webkit"+e]="webkit"+t,n["Moz"+e]="moz"+t,n}var hn={animationend:br("Animation","AnimationEnd"),animationiteration:br("Animation","AnimationIteration"),animationstart:br("Animation","AnimationStart"),transitionend:br("Transition","TransitionEnd")},_l={},rc={};ft&&(rc=document.createElement("div").style,"AnimationEvent"in window||(delete hn.animationend.animation,delete hn.animationiteration.animation,delete hn.animationstart.animation),"TransitionEvent"in window||delete hn.transitionend.transition);function Uo(e){if(_l[e])return _l[e];if(!hn[e])return e;var t=hn[e],n;for(n in t)if(t.hasOwnProperty(n)&&n in rc)return _l[e]=t[n];return e}var oc=Uo("animationend"),lc=Uo("animationiteration"),ic=Uo("animationstart"),uc=Uo("transitionend"),ac=new Map,fa="abort auxClick cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");function Rt(e,t){ac.set(e,t),en(t,[e])}for(var Cl=0;Cl<fa.length;Cl++){var El=fa[Cl],zp=El.toLowerCase(),jp=El[0].toUpperCase()+El.slice(1);Rt(zp,"on"+jp)}Rt(oc,"onAnimationEnd");Rt(lc,"onAnimationIteration");Rt(ic,"onAnimationStart");Rt("dblclick","onDoubleClick");Rt("focusin","onFocus");Rt("focusout","onBlur");Rt(uc,"onTransitionEnd");Tn("onMouseEnter",["mouseout","mouseover"]);Tn("onMouseLeave",["mouseout","mouseover"]);Tn("onPointerEnter",["pointerout","pointerover"]);Tn("onPointerLeave",["pointerout","pointerover"]);en("onChange","change click focusin focusout input keydown keyup selectionchange".split(" "));en("onSelect","focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" "));en("onBeforeInput",["compositionend","keypress","textInput","paste"]);en("onCompositionEnd","compositionend focusout keydown keypress keyup mousedown".split(" "));en("onCompositionStart","compositionstart focusout keydown keypress keyup mousedown".split(" "));en("onCompositionUpdate","compositionupdate focusout keydown keypress keyup mousedown".split(" "));var Zn="abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "),Pp=new Set("cancel close invalid load scroll toggle".split(" ").concat(Zn));function pa(e,t,n){var r=e.type||"unknown-event";e.currentTarget=n,zf(r,t,void 0,e),e.currentTarget=null}function sc(e,t){t=(t&4)!==0;for(var n=0;n<e.length;n++){var r=e[n],o=r.event;r=r.listeners;e:{var l=void 0;if(t)for(var i=r.length-1;0<=i;i--){var u=r[i],a=u.instance,d=u.currentTarget;if(u=u.listener,a!==l&&o.isPropagationStopped())break e;pa(o,u,d),l=a}else for(i=0;i<r.length;i++){if(u=r[i],a=u.instance,d=u.currentTarget,u=u.listener,a!==l&&o.isPropagationStopped())break e;pa(o,u,d),l=a}}}if(fo)throw e=ei,fo=!1,ei=null,e}function H(e,t){var n=t[ci];n===void 0&&(n=t[ci]=new Set);var r=e+"__bubble";n.has(r)||(cc(t,e,2,!1),n.add(r))}function Nl(e,t,n){var r=0;t&&(r|=4),cc(n,e,r,t)}var Br="_reactListening"+Math.random().toString(36).slice(2);function vr(e){if(!e[Br]){e[Br]=!0,vs.forEach(function(n){n!=="selectionchange"&&(Pp.has(n)||Nl(n,!1,e),Nl(n,!0,e))});var t=e.nodeType===9?e:e.ownerDocument;t===null||t[Br]||(t[Br]=!0,Nl("selectionchange",!1,t))}}function cc(e,t,n,r){switch(Ks(t)){case 1:var o=Vf;break;case 4:o=Qf;break;default:o=Hi}n=o.bind(null,t,n,e),o=void 0,!Zl||t!=="touchstart"&&t!=="touchmove"&&t!=="wheel"||(o=!0),r?o!==void 0?e.addEventListener(t,n,{capture:!0,passive:o}):e.addEventListener(t,n,!0):o!==void 0?e.addEventListener(t,n,{passive:o}):e.addEventListener(t,n,!1)}function zl(e,t,n,r,o){var l=r;if(!(t&1)&&!(t&2)&&r!==null)e:for(;;){if(r===null)return;var i=r.tag;if(i===3||i===4){var u=r.stateNode.containerInfo;if(u===o||u.nodeType===8&&u.parentNode===o)break;if(i===4)for(i=r.return;i!==null;){var a=i.tag;if((a===3||a===4)&&(a=i.stateNode.containerInfo,a===o||a.nodeType===8&&a.parentNode===o))return;i=i.return}for(;u!==null;){if(i=Qt(u),i===null)return;if(a=i.tag,a===5||a===6){r=l=i;continue e}u=u.parentNode}}r=r.return}Is(function(){var d=l,v=bi(n),g=[];e:{var h=ac.get(e);if(h!==void 0){var S=Ki,_=e;switch(e){case"keypress":if(to(n)===0)break e;case"keydown":case"keyup":S=lp;break;case"focusin":_="focus",S=wl;break;case"focusout":_="blur",S=wl;break;case"beforeblur":case"afterblur":S=wl;break;case"click":if(n.button===2)break e;case"auxclick":case"dblclick":case"mousedown":case"mousemove":case"mouseup":case"mouseout":case"mouseover":case"contextmenu":S=ta;break;case"drag":case"dragend":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"dragstart":case"drop":S=Kf;break;case"touchcancel":case"touchend":case"touchmove":case"touchstart":S=ap;break;case oc:case lc:case ic:S=Gf;break;case uc:S=cp;break;case"scroll":S=Hf;break;case"wheel":S=fp;break;case"copy":case"cut":case"paste":S=qf;break;case"gotpointercapture":case"lostpointercapture":case"pointercancel":case"pointerdown":case"pointermove":case"pointerout":case"pointerover":case"pointerup":S=ra}var k=(t&4)!==0,L=!k&&e==="scroll",f=k?h!==null?h+"Capture":null:h;k=[];for(var c=d,m;c!==null;){m=c;var x=m.stateNode;if(m.tag===5&&x!==null&&(m=x,f!==null&&(x=dr(c,f),x!=null&&k.push(yr(c,x,m)))),L)break;c=c.return}0<k.length&&(h=new S(h,_,null,n,v),g.push({event:h,listeners:k}))}}if(!(t&7)){e:{if(h=e==="mouseover"||e==="pointerover",S=e==="mouseout"||e==="pointerout",h&&n!==Jl&&(_=n.relatedTarget||n.fromElement)&&(Qt(_)||_[pt]))break e;if((S||h)&&(h=v.window===v?v:(h=v.ownerDocument)?h.defaultView||h.parentWindow:window,S?(_=n.relatedTarget||n.toElement,S=d,_=_?Qt(_):null,_!==null&&(L=tn(_),_!==L||_.tag!==5&&_.tag!==6)&&(_=null)):(S=null,_=d),S!==_)){if(k=ta,x="onMouseLeave",f="onMouseEnter",c="mouse",(e==="pointerout"||e==="pointerover")&&(k=ra,x="onPointerLeave",f="onPointerEnter",c="pointer"),L=S==null?h:gn(S),m=_==null?h:gn(_),h=new k(x,c+"leave",S,n,v),h.target=L,h.relatedTarget=m,x=null,Qt(v)===d&&(k=new k(f,c+"enter",_,n,v),k.target=m,k.relatedTarget=L,x=k),L=x,S&&_)t:{for(k=S,f=_,c=0,m=k;m;m=sn(m))c++;for(m=0,x=f;x;x=sn(x))m++;for(;0<c-m;)k=sn(k),c--;for(;0<m-c;)f=sn(f),m--;for(;c--;){if(k===f||f!==null&&k===f.alternate)break t;k=sn(k),f=sn(f)}k=null}else k=null;S!==null&&ma(g,h,S,k,!1),_!==null&&L!==null&&ma(g,L,_,k,!0)}}e:{if(h=d?gn(d):window,S=h.nodeName&&h.nodeName.toLowerCase(),S==="select"||S==="input"&&h.type==="file")var E=xp;else if(ia(h))if(Zs)E=_p;else{E=kp;var j=wp}else(S=h.nodeName)&&S.toLowerCase()==="input"&&(h.type==="checkbox"||h.type==="radio")&&(E=Sp);if(E&&(E=E(e,d))){qs(g,E,n,v);break e}j&&j(e,h,d),e==="focusout"&&(j=h._wrapperState)&&j.controlled&&h.type==="number"&&Wl(h,"number",h.value)}switch(j=d?gn(d):window,e){case"focusin":(ia(j)||j.contentEditable==="true")&&(mn=j,oi=d,or=null);break;case"focusout":or=oi=mn=null;break;case"mousedown":li=!0;break;case"contextmenu":case"mouseup":case"dragend":li=!1,da(g,n,v);break;case"selectionchange":if(Np)break;case"keydown":case"keyup":da(g,n,v)}var P;if(Xi)e:{switch(e){case"compositionstart":var T="onCompositionStart";break e;case"compositionend":T="onCompositionEnd";break e;case"compositionupdate":T="onCompositionUpdate";break e}T=void 0}else pn?Gs(e,n)&&(T="onCompositionEnd"):e==="keydown"&&n.keyCode===229&&(T="onCompositionStart");T&&(Xs&&n.locale!=="ko"&&(pn||T!=="onCompositionStart"?T==="onCompositionEnd"&&pn&&(P=Ys()):(_t=v,Wi="value"in _t?_t.value:_t.textContent,pn=!0)),j=vo(d,T),0<j.length&&(T=new na(T,e,null,n,v),g.push({event:T,listeners:j}),P?T.data=P:(P=Js(n),P!==null&&(T.data=P)))),(P=mp?hp(e,n):gp(e,n))&&(d=vo(d,"onBeforeInput"),0<d.length&&(v=new na("onBeforeInput","beforeinput",null,n,v),g.push({event:v,listeners:d}),v.data=P))}sc(g,t)})}function yr(e,t,n){return{instance:e,listener:t,currentTarget:n}}function vo(e,t){for(var n=t+"Capture",r=[];e!==null;){var o=e,l=o.stateNode;o.tag===5&&l!==null&&(o=l,l=dr(e,n),l!=null&&r.unshift(yr(e,l,o)),l=dr(e,t),l!=null&&r.push(yr(e,l,o))),e=e.return}return r}function sn(e){if(e===null)return null;do e=e.return;while(e&&e.tag!==5);return e||null}function ma(e,t,n,r,o){for(var l=t._reactName,i=[];n!==null&&n!==r;){var u=n,a=u.alternate,d=u.stateNode;if(a!==null&&a===r)break;u.tag===5&&d!==null&&(u=d,o?(a=dr(n,l),a!=null&&i.unshift(yr(n,a,u))):o||(a=dr(n,l),a!=null&&i.push(yr(n,a,u)))),n=n.return}i.length!==0&&e.push({event:t,listeners:i})}var Tp=/\r\n?/g,Lp=/\u0000|\uFFFD/g;function ha(e){return(typeof e=="string"?e:""+e).replace(Tp,`
`).replace(Lp,"")}function Vr(e,t,n){if(t=ha(t),ha(e)!==t&&n)throw Error(w(425))}function yo(){}var ii=null,ui=null;function ai(e,t){return e==="textarea"||e==="noscript"||typeof t.children=="string"||typeof t.children=="number"||typeof t.dangerouslySetInnerHTML=="object"&&t.dangerouslySetInnerHTML!==null&&t.dangerouslySetInnerHTML.__html!=null}var si=typeof setTimeout=="function"?setTimeout:void 0,Op=typeof clearTimeout=="function"?clearTimeout:void 0,ga=typeof Promise=="function"?Promise:void 0,Ip=typeof queueMicrotask=="function"?queueMicrotask:typeof ga<"u"?function(e){return ga.resolve(null).then(e).catch(Mp)}:si;function Mp(e){setTimeout(function(){throw e})}function jl(e,t){var n=t,r=0;do{var o=n.nextSibling;if(e.removeChild(n),o&&o.nodeType===8)if(n=o.data,n==="/$"){if(r===0){e.removeChild(o),mr(t);return}r--}else n!=="$"&&n!=="$?"&&n!=="$!"||r++;n=o}while(n);mr(t)}function jt(e){for(;e!=null;e=e.nextSibling){var t=e.nodeType;if(t===1||t===3)break;if(t===8){if(t=e.data,t==="$"||t==="$!"||t==="$?")break;if(t==="/$")return null}}return e}function va(e){e=e.previousSibling;for(var t=0;e;){if(e.nodeType===8){var n=e.data;if(n==="$"||n==="$!"||n==="$?"){if(t===0)return e;t--}else n==="/$"&&t++}e=e.previousSibling}return null}var An=Math.random().toString(36).slice(2),Ze="__reactFiber$"+An,xr="__reactProps$"+An,pt="__reactContainer$"+An,ci="__reactEvents$"+An,Rp="__reactListeners$"+An,Dp="__reactHandles$"+An;function Qt(e){var t=e[Ze];if(t)return t;for(var n=e.parentNode;n;){if(t=n[pt]||n[Ze]){if(n=t.alternate,t.child!==null||n!==null&&n.child!==null)for(e=va(e);e!==null;){if(n=e[Ze])return n;e=va(e)}return t}e=n,n=e.parentNode}return null}function Pr(e){return e=e[Ze]||e[pt],!e||e.tag!==5&&e.tag!==6&&e.tag!==13&&e.tag!==3?null:e}function gn(e){if(e.tag===5||e.tag===6)return e.stateNode;throw Error(w(33))}function bo(e){return e[xr]||null}var di=[],vn=-1;function Dt(e){return{current:e}}function W(e){0>vn||(e.current=di[vn],di[vn]=null,vn--)}function Q(e,t){vn++,di[vn]=e.current,e.current=t}var Mt={},me=Dt(Mt),ke=Dt(!1),Xt=Mt;function Ln(e,t){var n=e.type.contextTypes;if(!n)return Mt;var r=e.stateNode;if(r&&r.__reactInternalMemoizedUnmaskedChildContext===t)return r.__reactInternalMemoizedMaskedChildContext;var o={},l;for(l in n)o[l]=t[l];return r&&(e=e.stateNode,e.__reactInternalMemoizedUnmaskedChildContext=t,e.__reactInternalMemoizedMaskedChildContext=o),o}function Se(e){return e=e.childContextTypes,e!=null}function xo(){W(ke),W(me)}function ya(e,t,n){if(me.current!==Mt)throw Error(w(168));Q(me,t),Q(ke,n)}function dc(e,t,n){var r=e.stateNode;if(t=t.childContextTypes,typeof r.getChildContext!="function")return n;r=r.getChildContext();for(var o in r)if(!(o in t))throw Error(w(108,wf(e)||"Unknown",o));return J({},n,r)}function wo(e){return e=(e=e.stateNode)&&e.__reactInternalMemoizedMergedChildContext||Mt,Xt=me.current,Q(me,e),Q(ke,ke.current),!0}function xa(e,t,n){var r=e.stateNode;if(!r)throw Error(w(169));n?(e=dc(e,t,Xt),r.__reactInternalMemoizedMergedChildContext=e,W(ke),W(me),Q(me,e)):W(ke),Q(ke,n)}var at=null,Bo=!1,Pl=!1;function fc(e){at===null?at=[e]:at.push(e)}function Fp(e){Bo=!0,fc(e)}function Ft(){if(!Pl&&at!==null){Pl=!0;var e=0,t=b;try{var n=at;for(b=1;e<n.length;e++){var r=n[e];do r=r(!0);while(r!==null)}at=null,Bo=!1}catch(o){throw at!==null&&(at=at.slice(e+1)),Fs(Bi,Ft),o}finally{b=t,Pl=!1}}return null}var yn=[],xn=0,ko=null,So=0,Me=[],Re=0,Gt=null,st=1,ct="";function Bt(e,t){yn[xn++]=So,yn[xn++]=ko,ko=e,So=t}function pc(e,t,n){Me[Re++]=st,Me[Re++]=ct,Me[Re++]=Gt,Gt=e;var r=st;e=ct;var o=32-Ye(r)-1;r&=~(1<<o),n+=1;var l=32-Ye(t)+o;if(30<l){var i=o-o%5;l=(r&(1<<i)-1).toString(32),r>>=i,o-=i,st=1<<32-Ye(t)+o|n<<o|r,ct=l+e}else st=1<<l|n<<o|r,ct=e}function Ji(e){e.return!==null&&(Bt(e,1),pc(e,1,0))}function qi(e){for(;e===ko;)ko=yn[--xn],yn[xn]=null,So=yn[--xn],yn[xn]=null;for(;e===Gt;)Gt=Me[--Re],Me[Re]=null,ct=Me[--Re],Me[Re]=null,st=Me[--Re],Me[Re]=null}var je=null,ze=null,Y=!1,Ke=null;function mc(e,t){var n=De(5,null,null,0);n.elementType="DELETED",n.stateNode=t,n.return=e,t=e.deletions,t===null?(e.deletions=[n],e.flags|=16):t.push(n)}function wa(e,t){switch(e.tag){case 5:var n=e.type;return t=t.nodeType!==1||n.toLowerCase()!==t.nodeName.toLowerCase()?null:t,t!==null?(e.stateNode=t,je=e,ze=jt(t.firstChild),!0):!1;case 6:return t=e.pendingProps===""||t.nodeType!==3?null:t,t!==null?(e.stateNode=t,je=e,ze=null,!0):!1;case 13:return t=t.nodeType!==8?null:t,t!==null?(n=Gt!==null?{id:st,overflow:ct}:null,e.memoizedState={dehydrated:t,treeContext:n,retryLane:1073741824},n=De(18,null,null,0),n.stateNode=t,n.return=e,e.child=n,je=e,ze=null,!0):!1;default:return!1}}function fi(e){return(e.mode&1)!==0&&(e.flags&128)===0}function pi(e){if(Y){var t=ze;if(t){var n=t;if(!wa(e,t)){if(fi(e))throw Error(w(418));t=jt(n.nextSibling);var r=je;t&&wa(e,t)?mc(r,n):(e.flags=e.flags&-4097|2,Y=!1,je=e)}}else{if(fi(e))throw Error(w(418));e.flags=e.flags&-4097|2,Y=!1,je=e}}}function ka(e){for(e=e.return;e!==null&&e.tag!==5&&e.tag!==3&&e.tag!==13;)e=e.return;je=e}function Qr(e){if(e!==je)return!1;if(!Y)return ka(e),Y=!0,!1;var t;if((t=e.tag!==3)&&!(t=e.tag!==5)&&(t=e.type,t=t!=="head"&&t!=="body"&&!ai(e.type,e.memoizedProps)),t&&(t=ze)){if(fi(e))throw hc(),Error(w(418));for(;t;)mc(e,t),t=jt(t.nextSibling)}if(ka(e),e.tag===13){if(e=e.memoizedState,e=e!==null?e.dehydrated:null,!e)throw Error(w(317));e:{for(e=e.nextSibling,t=0;e;){if(e.nodeType===8){var n=e.data;if(n==="/$"){if(t===0){ze=jt(e.nextSibling);break e}t--}else n!=="$"&&n!=="$!"&&n!=="$?"||t++}e=e.nextSibling}ze=null}}else ze=je?jt(e.stateNode.nextSibling):null;return!0}function hc(){for(var e=ze;e;)e=jt(e.nextSibling)}function On(){ze=je=null,Y=!1}function Zi(e){Ke===null?Ke=[e]:Ke.push(e)}var $p=gt.ReactCurrentBatchConfig;function Kn(e,t,n){if(e=n.ref,e!==null&&typeof e!="function"&&typeof e!="object"){if(n._owner){if(n=n._owner,n){if(n.tag!==1)throw Error(w(309));var r=n.stateNode}if(!r)throw Error(w(147,e));var o=r,l=""+e;return t!==null&&t.ref!==null&&typeof t.ref=="function"&&t.ref._stringRef===l?t.ref:(t=function(i){var u=o.refs;i===null?delete u[l]:u[l]=i},t._stringRef=l,t)}if(typeof e!="string")throw Error(w(284));if(!n._owner)throw Error(w(290,e))}return e}function Hr(e,t){throw e=Object.prototype.toString.call(t),Error(w(31,e==="[object Object]"?"object with keys {"+Object.keys(t).join(", ")+"}":e))}function Sa(e){var t=e._init;return t(e._payload)}function gc(e){function t(f,c){if(e){var m=f.deletions;m===null?(f.deletions=[c],f.flags|=16):m.push(c)}}function n(f,c){if(!e)return null;for(;c!==null;)t(f,c),c=c.sibling;return null}function r(f,c){for(f=new Map;c!==null;)c.key!==null?f.set(c.key,c):f.set(c.index,c),c=c.sibling;return f}function o(f,c){return f=Ot(f,c),f.index=0,f.sibling=null,f}function l(f,c,m){return f.index=m,e?(m=f.alternate,m!==null?(m=m.index,m<c?(f.flags|=2,c):m):(f.flags|=2,c)):(f.flags|=1048576,c)}function i(f){return e&&f.alternate===null&&(f.flags|=2),f}function u(f,c,m,x){return c===null||c.tag!==6?(c=Dl(m,f.mode,x),c.return=f,c):(c=o(c,m),c.return=f,c)}function a(f,c,m,x){var E=m.type;return E===fn?v(f,c,m.props.children,x,m.key):c!==null&&(c.elementType===E||typeof E=="object"&&E!==null&&E.$$typeof===xt&&Sa(E)===c.type)?(x=o(c,m.props),x.ref=Kn(f,c,m),x.return=f,x):(x=ao(m.type,m.key,m.props,null,f.mode,x),x.ref=Kn(f,c,m),x.return=f,x)}function d(f,c,m,x){return c===null||c.tag!==4||c.stateNode.containerInfo!==m.containerInfo||c.stateNode.implementation!==m.implementation?(c=Fl(m,f.mode,x),c.return=f,c):(c=o(c,m.children||[]),c.return=f,c)}function v(f,c,m,x,E){return c===null||c.tag!==7?(c=Yt(m,f.mode,x,E),c.return=f,c):(c=o(c,m),c.return=f,c)}function g(f,c,m){if(typeof c=="string"&&c!==""||typeof c=="number")return c=Dl(""+c,f.mode,m),c.return=f,c;if(typeof c=="object"&&c!==null){switch(c.$$typeof){case Mr:return m=ao(c.type,c.key,c.props,null,f.mode,m),m.ref=Kn(f,null,c),m.return=f,m;case dn:return c=Fl(c,f.mode,m),c.return=f,c;case xt:var x=c._init;return g(f,x(c._payload),m)}if(Jn(c)||Bn(c))return c=Yt(c,f.mode,m,null),c.return=f,c;Hr(f,c)}return null}function h(f,c,m,x){var E=c!==null?c.key:null;if(typeof m=="string"&&m!==""||typeof m=="number")return E!==null?null:u(f,c,""+m,x);if(typeof m=="object"&&m!==null){switch(m.$$typeof){case Mr:return m.key===E?a(f,c,m,x):null;case dn:return m.key===E?d(f,c,m,x):null;case xt:return E=m._init,h(f,c,E(m._payload),x)}if(Jn(m)||Bn(m))return E!==null?null:v(f,c,m,x,null);Hr(f,m)}return null}function S(f,c,m,x,E){if(typeof x=="string"&&x!==""||typeof x=="number")return f=f.get(m)||null,u(c,f,""+x,E);if(typeof x=="object"&&x!==null){switch(x.$$typeof){case Mr:return f=f.get(x.key===null?m:x.key)||null,a(c,f,x,E);case dn:return f=f.get(x.key===null?m:x.key)||null,d(c,f,x,E);case xt:var j=x._init;return S(f,c,m,j(x._payload),E)}if(Jn(x)||Bn(x))return f=f.get(m)||null,v(c,f,x,E,null);Hr(c,x)}return null}function _(f,c,m,x){for(var E=null,j=null,P=c,T=c=0,B=null;P!==null&&T<m.length;T++){P.index>T?(B=P,P=null):B=P.sibling;var F=h(f,P,m[T],x);if(F===null){P===null&&(P=B);break}e&&P&&F.alternate===null&&t(f,P),c=l(F,c,T),j===null?E=F:j.sibling=F,j=F,P=B}if(T===m.length)return n(f,P),Y&&Bt(f,T),E;if(P===null){for(;T<m.length;T++)P=g(f,m[T],x),P!==null&&(c=l(P,c,T),j===null?E=P:j.sibling=P,j=P);return Y&&Bt(f,T),E}for(P=r(f,P);T<m.length;T++)B=S(P,f,T,m[T],x),B!==null&&(e&&B.alternate!==null&&P.delete(B.key===null?T:B.key),c=l(B,c,T),j===null?E=B:j.sibling=B,j=B);return e&&P.forEach(function(Ce){return t(f,Ce)}),Y&&Bt(f,T),E}function k(f,c,m,x){var E=Bn(m);if(typeof E!="function")throw Error(w(150));if(m=E.call(m),m==null)throw Error(w(151));for(var j=E=null,P=c,T=c=0,B=null,F=m.next();P!==null&&!F.done;T++,F=m.next()){P.index>T?(B=P,P=null):B=P.sibling;var Ce=h(f,P,F.value,x);if(Ce===null){P===null&&(P=B);break}e&&P&&Ce.alternate===null&&t(f,P),c=l(Ce,c,T),j===null?E=Ce:j.sibling=Ce,j=Ce,P=B}if(F.done)return n(f,P),Y&&Bt(f,T),E;if(P===null){for(;!F.done;T++,F=m.next())F=g(f,F.value,x),F!==null&&(c=l(F,c,T),j===null?E=F:j.sibling=F,j=F);return Y&&Bt(f,T),E}for(P=r(f,P);!F.done;T++,F=m.next())F=S(P,f,T,F.value,x),F!==null&&(e&&F.alternate!==null&&P.delete(F.key===null?T:F.key),c=l(F,c,T),j===null?E=F:j.sibling=F,j=F);return e&&P.forEach(function(nt){return t(f,nt)}),Y&&Bt(f,T),E}function L(f,c,m,x){if(typeof m=="object"&&m!==null&&m.type===fn&&m.key===null&&(m=m.props.children),typeof m=="object"&&m!==null){switch(m.$$typeof){case Mr:e:{for(var E=m.key,j=c;j!==null;){if(j.key===E){if(E=m.type,E===fn){if(j.tag===7){n(f,j.sibling),c=o(j,m.props.children),c.return=f,f=c;break e}}else if(j.elementType===E||typeof E=="object"&&E!==null&&E.$$typeof===xt&&Sa(E)===j.type){n(f,j.sibling),c=o(j,m.props),c.ref=Kn(f,j,m),c.return=f,f=c;break e}n(f,j);break}else t(f,j);j=j.sibling}m.type===fn?(c=Yt(m.props.children,f.mode,x,m.key),c.return=f,f=c):(x=ao(m.type,m.key,m.props,null,f.mode,x),x.ref=Kn(f,c,m),x.return=f,f=x)}return i(f);case dn:e:{for(j=m.key;c!==null;){if(c.key===j)if(c.tag===4&&c.stateNode.containerInfo===m.containerInfo&&c.stateNode.implementation===m.implementation){n(f,c.sibling),c=o(c,m.children||[]),c.return=f,f=c;break e}else{n(f,c);break}else t(f,c);c=c.sibling}c=Fl(m,f.mode,x),c.return=f,f=c}return i(f);case xt:return j=m._init,L(f,c,j(m._payload),x)}if(Jn(m))return _(f,c,m,x);if(Bn(m))return k(f,c,m,x);Hr(f,m)}return typeof m=="string"&&m!==""||typeof m=="number"?(m=""+m,c!==null&&c.tag===6?(n(f,c.sibling),c=o(c,m),c.return=f,f=c):(n(f,c),c=Dl(m,f.mode,x),c.return=f,f=c),i(f)):n(f,c)}return L}var In=gc(!0),vc=gc(!1),_o=Dt(null),Co=null,wn=null,eu=null;function tu(){eu=wn=Co=null}function nu(e){var t=_o.current;W(_o),e._currentValue=t}function mi(e,t,n){for(;e!==null;){var r=e.alternate;if((e.childLanes&t)!==t?(e.childLanes|=t,r!==null&&(r.childLanes|=t)):r!==null&&(r.childLanes&t)!==t&&(r.childLanes|=t),e===n)break;e=e.return}}function zn(e,t){Co=e,eu=wn=null,e=e.dependencies,e!==null&&e.firstContext!==null&&(e.lanes&t&&(we=!0),e.firstContext=null)}function Ue(e){var t=e._currentValue;if(eu!==e)if(e={context:e,memoizedValue:t,next:null},wn===null){if(Co===null)throw Error(w(308));wn=e,Co.dependencies={lanes:0,firstContext:e}}else wn=wn.next=e;return t}var Ht=null;function ru(e){Ht===null?Ht=[e]:Ht.push(e)}function yc(e,t,n,r){var o=t.interleaved;return o===null?(n.next=n,ru(t)):(n.next=o.next,o.next=n),t.interleaved=n,mt(e,r)}function mt(e,t){e.lanes|=t;var n=e.alternate;for(n!==null&&(n.lanes|=t),n=e,e=e.return;e!==null;)e.childLanes|=t,n=e.alternate,n!==null&&(n.childLanes|=t),n=e,e=e.return;return n.tag===3?n.stateNode:null}var wt=!1;function ou(e){e.updateQueue={baseState:e.memoizedState,firstBaseUpdate:null,lastBaseUpdate:null,shared:{pending:null,interleaved:null,lanes:0},effects:null}}function xc(e,t){e=e.updateQueue,t.updateQueue===e&&(t.updateQueue={baseState:e.baseState,firstBaseUpdate:e.firstBaseUpdate,lastBaseUpdate:e.lastBaseUpdate,shared:e.shared,effects:e.effects})}function dt(e,t){return{eventTime:e,lane:t,tag:0,payload:null,callback:null,next:null}}function Pt(e,t,n){var r=e.updateQueue;if(r===null)return null;if(r=r.shared,U&2){var o=r.pending;return o===null?t.next=t:(t.next=o.next,o.next=t),r.pending=t,mt(e,n)}return o=r.interleaved,o===null?(t.next=t,ru(r)):(t.next=o.next,o.next=t),r.interleaved=t,mt(e,n)}function no(e,t,n){if(t=t.updateQueue,t!==null&&(t=t.shared,(n&4194240)!==0)){var r=t.lanes;r&=e.pendingLanes,n|=r,t.lanes=n,Vi(e,n)}}function _a(e,t){var n=e.updateQueue,r=e.alternate;if(r!==null&&(r=r.updateQueue,n===r)){var o=null,l=null;if(n=n.firstBaseUpdate,n!==null){do{var i={eventTime:n.eventTime,lane:n.lane,tag:n.tag,payload:n.payload,callback:n.callback,next:null};l===null?o=l=i:l=l.next=i,n=n.next}while(n!==null);l===null?o=l=t:l=l.next=t}else o=l=t;n={baseState:r.baseState,firstBaseUpdate:o,lastBaseUpdate:l,shared:r.shared,effects:r.effects},e.updateQueue=n;return}e=n.lastBaseUpdate,e===null?n.firstBaseUpdate=t:e.next=t,n.lastBaseUpdate=t}function Eo(e,t,n,r){var o=e.updateQueue;wt=!1;var l=o.firstBaseUpdate,i=o.lastBaseUpdate,u=o.shared.pending;if(u!==null){o.shared.pending=null;var a=u,d=a.next;a.next=null,i===null?l=d:i.next=d,i=a;var v=e.alternate;v!==null&&(v=v.updateQueue,u=v.lastBaseUpdate,u!==i&&(u===null?v.firstBaseUpdate=d:u.next=d,v.lastBaseUpdate=a))}if(l!==null){var g=o.baseState;i=0,v=d=a=null,u=l;do{var h=u.lane,S=u.eventTime;if((r&h)===h){v!==null&&(v=v.next={eventTime:S,lane:0,tag:u.tag,payload:u.payload,callback:u.callback,next:null});e:{var _=e,k=u;switch(h=t,S=n,k.tag){case 1:if(_=k.payload,typeof _=="function"){g=_.call(S,g,h);break e}g=_;break e;case 3:_.flags=_.flags&-65537|128;case 0:if(_=k.payload,h=typeof _=="function"?_.call(S,g,h):_,h==null)break e;g=J({},g,h);break e;case 2:wt=!0}}u.callback!==null&&u.lane!==0&&(e.flags|=64,h=o.effects,h===null?o.effects=[u]:h.push(u))}else S={eventTime:S,lane:h,tag:u.tag,payload:u.payload,callback:u.callback,next:null},v===null?(d=v=S,a=g):v=v.next=S,i|=h;if(u=u.next,u===null){if(u=o.shared.pending,u===null)break;h=u,u=h.next,h.next=null,o.lastBaseUpdate=h,o.shared.pending=null}}while(1);if(v===null&&(a=g),o.baseState=a,o.firstBaseUpdate=d,o.lastBaseUpdate=v,t=o.shared.interleaved,t!==null){o=t;do i|=o.lane,o=o.next;while(o!==t)}else l===null&&(o.shared.lanes=0);qt|=i,e.lanes=i,e.memoizedState=g}}function Ca(e,t,n){if(e=t.effects,t.effects=null,e!==null)for(t=0;t<e.length;t++){var r=e[t],o=r.callback;if(o!==null){if(r.callback=null,r=n,typeof o!="function")throw Error(w(191,o));o.call(r)}}}var Tr={},tt=Dt(Tr),wr=Dt(Tr),kr=Dt(Tr);function Wt(e){if(e===Tr)throw Error(w(174));return e}function lu(e,t){switch(Q(kr,t),Q(wr,e),Q(tt,Tr),e=t.nodeType,e){case 9:case 11:t=(t=t.documentElement)?t.namespaceURI:Yl(null,"");break;default:e=e===8?t.parentNode:t,t=e.namespaceURI||null,e=e.tagName,t=Yl(t,e)}W(tt),Q(tt,t)}function Mn(){W(tt),W(wr),W(kr)}function wc(e){Wt(kr.current);var t=Wt(tt.current),n=Yl(t,e.type);t!==n&&(Q(wr,e),Q(tt,n))}function iu(e){wr.current===e&&(W(tt),W(wr))}var X=Dt(0);function No(e){for(var t=e;t!==null;){if(t.tag===13){var n=t.memoizedState;if(n!==null&&(n=n.dehydrated,n===null||n.data==="$?"||n.data==="$!"))return t}else if(t.tag===19&&t.memoizedProps.revealOrder!==void 0){if(t.flags&128)return t}else if(t.child!==null){t.child.return=t,t=t.child;continue}if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return null;t=t.return}t.sibling.return=t.return,t=t.sibling}return null}var Tl=[];function uu(){for(var e=0;e<Tl.length;e++)Tl[e]._workInProgressVersionPrimary=null;Tl.length=0}var ro=gt.ReactCurrentDispatcher,Ll=gt.ReactCurrentBatchConfig,Jt=0,G=null,re=null,ie=null,zo=!1,lr=!1,Sr=0,Ap=0;function de(){throw Error(w(321))}function au(e,t){if(t===null)return!1;for(var n=0;n<t.length&&n<e.length;n++)if(!Ge(e[n],t[n]))return!1;return!0}function su(e,t,n,r,o,l){if(Jt=l,G=t,t.memoizedState=null,t.updateQueue=null,t.lanes=0,ro.current=e===null||e.memoizedState===null?Vp:Qp,e=n(r,o),lr){l=0;do{if(lr=!1,Sr=0,25<=l)throw Error(w(301));l+=1,ie=re=null,t.updateQueue=null,ro.current=Hp,e=n(r,o)}while(lr)}if(ro.current=jo,t=re!==null&&re.next!==null,Jt=0,ie=re=G=null,zo=!1,t)throw Error(w(300));return e}function cu(){var e=Sr!==0;return Sr=0,e}function qe(){var e={memoizedState:null,baseState:null,baseQueue:null,queue:null,next:null};return ie===null?G.memoizedState=ie=e:ie=ie.next=e,ie}function be(){if(re===null){var e=G.alternate;e=e!==null?e.memoizedState:null}else e=re.next;var t=ie===null?G.memoizedState:ie.next;if(t!==null)ie=t,re=e;else{if(e===null)throw Error(w(310));re=e,e={memoizedState:re.memoizedState,baseState:re.baseState,baseQueue:re.baseQueue,queue:re.queue,next:null},ie===null?G.memoizedState=ie=e:ie=ie.next=e}return ie}function _r(e,t){return typeof t=="function"?t(e):t}function Ol(e){var t=be(),n=t.queue;if(n===null)throw Error(w(311));n.lastRenderedReducer=e;var r=re,o=r.baseQueue,l=n.pending;if(l!==null){if(o!==null){var i=o.next;o.next=l.next,l.next=i}r.baseQueue=o=l,n.pending=null}if(o!==null){l=o.next,r=r.baseState;var u=i=null,a=null,d=l;do{var v=d.lane;if((Jt&v)===v)a!==null&&(a=a.next={lane:0,action:d.action,hasEagerState:d.hasEagerState,eagerState:d.eagerState,next:null}),r=d.hasEagerState?d.eagerState:e(r,d.action);else{var g={lane:v,action:d.action,hasEagerState:d.hasEagerState,eagerState:d.eagerState,next:null};a===null?(u=a=g,i=r):a=a.next=g,G.lanes|=v,qt|=v}d=d.next}while(d!==null&&d!==l);a===null?i=r:a.next=u,Ge(r,t.memoizedState)||(we=!0),t.memoizedState=r,t.baseState=i,t.baseQueue=a,n.lastRenderedState=r}if(e=n.interleaved,e!==null){o=e;do l=o.lane,G.lanes|=l,qt|=l,o=o.next;while(o!==e)}else o===null&&(n.lanes=0);return[t.memoizedState,n.dispatch]}function Il(e){var t=be(),n=t.queue;if(n===null)throw Error(w(311));n.lastRenderedReducer=e;var r=n.dispatch,o=n.pending,l=t.memoizedState;if(o!==null){n.pending=null;var i=o=o.next;do l=e(l,i.action),i=i.next;while(i!==o);Ge(l,t.memoizedState)||(we=!0),t.memoizedState=l,t.baseQueue===null&&(t.baseState=l),n.lastRenderedState=l}return[l,r]}function kc(){}function Sc(e,t){var n=G,r=be(),o=t(),l=!Ge(r.memoizedState,o);if(l&&(r.memoizedState=o,we=!0),r=r.queue,du(Ec.bind(null,n,r,e),[e]),r.getSnapshot!==t||l||ie!==null&&ie.memoizedState.tag&1){if(n.flags|=2048,Cr(9,Cc.bind(null,n,r,o,t),void 0,null),ue===null)throw Error(w(349));Jt&30||_c(n,t,o)}return o}function _c(e,t,n){e.flags|=16384,e={getSnapshot:t,value:n},t=G.updateQueue,t===null?(t={lastEffect:null,stores:null},G.updateQueue=t,t.stores=[e]):(n=t.stores,n===null?t.stores=[e]:n.push(e))}function Cc(e,t,n,r){t.value=n,t.getSnapshot=r,Nc(t)&&zc(e)}function Ec(e,t,n){return n(function(){Nc(t)&&zc(e)})}function Nc(e){var t=e.getSnapshot;e=e.value;try{var n=t();return!Ge(e,n)}catch{return!0}}function zc(e){var t=mt(e,1);t!==null&&Xe(t,e,1,-1)}function Ea(e){var t=qe();return typeof e=="function"&&(e=e()),t.memoizedState=t.baseState=e,e={pending:null,interleaved:null,lanes:0,dispatch:null,lastRenderedReducer:_r,lastRenderedState:e},t.queue=e,e=e.dispatch=Bp.bind(null,G,e),[t.memoizedState,e]}function Cr(e,t,n,r){return e={tag:e,create:t,destroy:n,deps:r,next:null},t=G.updateQueue,t===null?(t={lastEffect:null,stores:null},G.updateQueue=t,t.lastEffect=e.next=e):(n=t.lastEffect,n===null?t.lastEffect=e.next=e:(r=n.next,n.next=e,e.next=r,t.lastEffect=e)),e}function jc(){return be().memoizedState}function oo(e,t,n,r){var o=qe();G.flags|=e,o.memoizedState=Cr(1|t,n,void 0,r===void 0?null:r)}function Vo(e,t,n,r){var o=be();r=r===void 0?null:r;var l=void 0;if(re!==null){var i=re.memoizedState;if(l=i.destroy,r!==null&&au(r,i.deps)){o.memoizedState=Cr(t,n,l,r);return}}G.flags|=e,o.memoizedState=Cr(1|t,n,l,r)}function Na(e,t){return oo(8390656,8,e,t)}function du(e,t){return Vo(2048,8,e,t)}function Pc(e,t){return Vo(4,2,e,t)}function Tc(e,t){return Vo(4,4,e,t)}function Lc(e,t){if(typeof t=="function")return e=e(),t(e),function(){t(null)};if(t!=null)return e=e(),t.current=e,function(){t.current=null}}function Oc(e,t,n){return n=n!=null?n.concat([e]):null,Vo(4,4,Lc.bind(null,t,e),n)}function fu(){}function Ic(e,t){var n=be();t=t===void 0?null:t;var r=n.memoizedState;return r!==null&&t!==null&&au(t,r[1])?r[0]:(n.memoizedState=[e,t],e)}function Mc(e,t){var n=be();t=t===void 0?null:t;var r=n.memoizedState;return r!==null&&t!==null&&au(t,r[1])?r[0]:(e=e(),n.memoizedState=[e,t],e)}function Rc(e,t,n){return Jt&21?(Ge(n,t)||(n=Us(),G.lanes|=n,qt|=n,e.baseState=!0),t):(e.baseState&&(e.baseState=!1,we=!0),e.memoizedState=n)}function Up(e,t){var n=b;b=n!==0&&4>n?n:4,e(!0);var r=Ll.transition;Ll.transition={};try{e(!1),t()}finally{b=n,Ll.transition=r}}function Dc(){return be().memoizedState}function bp(e,t,n){var r=Lt(e);if(n={lane:r,action:n,hasEagerState:!1,eagerState:null,next:null},Fc(e))$c(t,n);else if(n=yc(e,t,n,r),n!==null){var o=ge();Xe(n,e,r,o),Ac(n,t,r)}}function Bp(e,t,n){var r=Lt(e),o={lane:r,action:n,hasEagerState:!1,eagerState:null,next:null};if(Fc(e))$c(t,o);else{var l=e.alternate;if(e.lanes===0&&(l===null||l.lanes===0)&&(l=t.lastRenderedReducer,l!==null))try{var i=t.lastRenderedState,u=l(i,n);if(o.hasEagerState=!0,o.eagerState=u,Ge(u,i)){var a=t.interleaved;a===null?(o.next=o,ru(t)):(o.next=a.next,a.next=o),t.interleaved=o;return}}catch{}finally{}n=yc(e,t,o,r),n!==null&&(o=ge(),Xe(n,e,r,o),Ac(n,t,r))}}function Fc(e){var t=e.alternate;return e===G||t!==null&&t===G}function $c(e,t){lr=zo=!0;var n=e.pending;n===null?t.next=t:(t.next=n.next,n.next=t),e.pending=t}function Ac(e,t,n){if(n&4194240){var r=t.lanes;r&=e.pendingLanes,n|=r,t.lanes=n,Vi(e,n)}}var jo={readContext:Ue,useCallback:de,useContext:de,useEffect:de,useImperativeHandle:de,useInsertionEffect:de,useLayoutEffect:de,useMemo:de,useReducer:de,useRef:de,useState:de,useDebugValue:de,useDeferredValue:de,useTransition:de,useMutableSource:de,useSyncExternalStore:de,useId:de,unstable_isNewReconciler:!1},Vp={readContext:Ue,useCallback:function(e,t){return qe().memoizedState=[e,t===void 0?null:t],e},useContext:Ue,useEffect:Na,useImperativeHandle:function(e,t,n){return n=n!=null?n.concat([e]):null,oo(4194308,4,Lc.bind(null,t,e),n)},useLayoutEffect:function(e,t){return oo(4194308,4,e,t)},useInsertionEffect:function(e,t){return oo(4,2,e,t)},useMemo:function(e,t){var n=qe();return t=t===void 0?null:t,e=e(),n.memoizedState=[e,t],e},useReducer:function(e,t,n){var r=qe();return t=n!==void 0?n(t):t,r.memoizedState=r.baseState=t,e={pending:null,interleaved:null,lanes:0,dispatch:null,lastRenderedReducer:e,lastRenderedState:t},r.queue=e,e=e.dispatch=bp.bind(null,G,e),[r.memoizedState,e]},useRef:function(e){var t=qe();return e={current:e},t.memoizedState=e},useState:Ea,useDebugValue:fu,useDeferredValue:function(e){return qe().memoizedState=e},useTransition:function(){var e=Ea(!1),t=e[0];return e=Up.bind(null,e[1]),qe().memoizedState=e,[t,e]},useMutableSource:function(){},useSyncExternalStore:function(e,t,n){var r=G,o=qe();if(Y){if(n===void 0)throw Error(w(407));n=n()}else{if(n=t(),ue===null)throw Error(w(349));Jt&30||_c(r,t,n)}o.memoizedState=n;var l={value:n,getSnapshot:t};return o.queue=l,Na(Ec.bind(null,r,l,e),[e]),r.flags|=2048,Cr(9,Cc.bind(null,r,l,n,t),void 0,null),n},useId:function(){var e=qe(),t=ue.identifierPrefix;if(Y){var n=ct,r=st;n=(r&~(1<<32-Ye(r)-1)).toString(32)+n,t=":"+t+"R"+n,n=Sr++,0<n&&(t+="H"+n.toString(32)),t+=":"}else n=Ap++,t=":"+t+"r"+n.toString(32)+":";return e.memoizedState=t},unstable_isNewReconciler:!1},Qp={readContext:Ue,useCallback:Ic,useContext:Ue,useEffect:du,useImperativeHandle:Oc,useInsertionEffect:Pc,useLayoutEffect:Tc,useMemo:Mc,useReducer:Ol,useRef:jc,useState:function(){return Ol(_r)},useDebugValue:fu,useDeferredValue:function(e){var t=be();return Rc(t,re.memoizedState,e)},useTransition:function(){var e=Ol(_r)[0],t=be().memoizedState;return[e,t]},useMutableSource:kc,useSyncExternalStore:Sc,useId:Dc,unstable_isNewReconciler:!1},Hp={readContext:Ue,useCallback:Ic,useContext:Ue,useEffect:du,useImperativeHandle:Oc,useInsertionEffect:Pc,useLayoutEffect:Tc,useMemo:Mc,useReducer:Il,useRef:jc,useState:function(){return Il(_r)},useDebugValue:fu,useDeferredValue:function(e){var t=be();return re===null?t.memoizedState=e:Rc(t,re.memoizedState,e)},useTransition:function(){var e=Il(_r)[0],t=be().memoizedState;return[e,t]},useMutableSource:kc,useSyncExternalStore:Sc,useId:Dc,unstable_isNewReconciler:!1};function He(e,t){if(e&&e.defaultProps){t=J({},t),e=e.defaultProps;for(var n in e)t[n]===void 0&&(t[n]=e[n]);return t}return t}function hi(e,t,n,r){t=e.memoizedState,n=n(r,t),n=n==null?t:J({},t,n),e.memoizedState=n,e.lanes===0&&(e.updateQueue.baseState=n)}var Qo={isMounted:function(e){return(e=e._reactInternals)?tn(e)===e:!1},enqueueSetState:function(e,t,n){e=e._reactInternals;var r=ge(),o=Lt(e),l=dt(r,o);l.payload=t,n!=null&&(l.callback=n),t=Pt(e,l,o),t!==null&&(Xe(t,e,o,r),no(t,e,o))},enqueueReplaceState:function(e,t,n){e=e._reactInternals;var r=ge(),o=Lt(e),l=dt(r,o);l.tag=1,l.payload=t,n!=null&&(l.callback=n),t=Pt(e,l,o),t!==null&&(Xe(t,e,o,r),no(t,e,o))},enqueueForceUpdate:function(e,t){e=e._reactInternals;var n=ge(),r=Lt(e),o=dt(n,r);o.tag=2,t!=null&&(o.callback=t),t=Pt(e,o,r),t!==null&&(Xe(t,e,r,n),no(t,e,r))}};function za(e,t,n,r,o,l,i){return e=e.stateNode,typeof e.shouldComponentUpdate=="function"?e.shouldComponentUpdate(r,l,i):t.prototype&&t.prototype.isPureReactComponent?!gr(n,r)||!gr(o,l):!0}function Uc(e,t,n){var r=!1,o=Mt,l=t.contextType;return typeof l=="object"&&l!==null?l=Ue(l):(o=Se(t)?Xt:me.current,r=t.contextTypes,l=(r=r!=null)?Ln(e,o):Mt),t=new t(n,l),e.memoizedState=t.state!==null&&t.state!==void 0?t.state:null,t.updater=Qo,e.stateNode=t,t._reactInternals=e,r&&(e=e.stateNode,e.__reactInternalMemoizedUnmaskedChildContext=o,e.__reactInternalMemoizedMaskedChildContext=l),t}function ja(e,t,n,r){e=t.state,typeof t.componentWillReceiveProps=="function"&&t.componentWillReceiveProps(n,r),typeof t.UNSAFE_componentWillReceiveProps=="function"&&t.UNSAFE_componentWillReceiveProps(n,r),t.state!==e&&Qo.enqueueReplaceState(t,t.state,null)}function gi(e,t,n,r){var o=e.stateNode;o.props=n,o.state=e.memoizedState,o.refs={},ou(e);var l=t.contextType;typeof l=="object"&&l!==null?o.context=Ue(l):(l=Se(t)?Xt:me.current,o.context=Ln(e,l)),o.state=e.memoizedState,l=t.getDerivedStateFromProps,typeof l=="function"&&(hi(e,t,l,n),o.state=e.memoizedState),typeof t.getDerivedStateFromProps=="function"||typeof o.getSnapshotBeforeUpdate=="function"||typeof o.UNSAFE_componentWillMount!="function"&&typeof o.componentWillMount!="function"||(t=o.state,typeof o.componentWillMount=="function"&&o.componentWillMount(),typeof o.UNSAFE_componentWillMount=="function"&&o.UNSAFE_componentWillMount(),t!==o.state&&Qo.enqueueReplaceState(o,o.state,null),Eo(e,n,o,r),o.state=e.memoizedState),typeof o.componentDidMount=="function"&&(e.flags|=4194308)}function Rn(e,t){try{var n="",r=t;do n+=xf(r),r=r.return;while(r);var o=n}catch(l){o=`
Error generating stack: `+l.message+`
`+l.stack}return{value:e,source:t,stack:o,digest:null}}function Ml(e,t,n){return{value:e,source:null,stack:n??null,digest:t??null}}function vi(e,t){try{console.error(t.value)}catch(n){setTimeout(function(){throw n})}}var Wp=typeof WeakMap=="function"?WeakMap:Map;function bc(e,t,n){n=dt(-1,n),n.tag=3,n.payload={element:null};var r=t.value;return n.callback=function(){To||(To=!0,zi=r),vi(e,t)},n}function Bc(e,t,n){n=dt(-1,n),n.tag=3;var r=e.type.getDerivedStateFromError;if(typeof r=="function"){var o=t.value;n.payload=function(){return r(o)},n.callback=function(){vi(e,t)}}var l=e.stateNode;return l!==null&&typeof l.componentDidCatch=="function"&&(n.callback=function(){vi(e,t),typeof r!="function"&&(Tt===null?Tt=new Set([this]):Tt.add(this));var i=t.stack;this.componentDidCatch(t.value,{componentStack:i!==null?i:""})}),n}function Pa(e,t,n){var r=e.pingCache;if(r===null){r=e.pingCache=new Wp;var o=new Set;r.set(t,o)}else o=r.get(t),o===void 0&&(o=new Set,r.set(t,o));o.has(n)||(o.add(n),e=im.bind(null,e,t,n),t.then(e,e))}function Ta(e){do{var t;if((t=e.tag===13)&&(t=e.memoizedState,t=t!==null?t.dehydrated!==null:!0),t)return e;e=e.return}while(e!==null);return null}function La(e,t,n,r,o){return e.mode&1?(e.flags|=65536,e.lanes=o,e):(e===t?e.flags|=65536:(e.flags|=128,n.flags|=131072,n.flags&=-52805,n.tag===1&&(n.alternate===null?n.tag=17:(t=dt(-1,1),t.tag=2,Pt(n,t,1))),n.lanes|=1),e)}var Kp=gt.ReactCurrentOwner,we=!1;function he(e,t,n,r){t.child=e===null?vc(t,null,n,r):In(t,e.child,n,r)}function Oa(e,t,n,r,o){n=n.render;var l=t.ref;return zn(t,o),r=su(e,t,n,r,l,o),n=cu(),e!==null&&!we?(t.updateQueue=e.updateQueue,t.flags&=-2053,e.lanes&=~o,ht(e,t,o)):(Y&&n&&Ji(t),t.flags|=1,he(e,t,r,o),t.child)}function Ia(e,t,n,r,o){if(e===null){var l=n.type;return typeof l=="function"&&!wu(l)&&l.defaultProps===void 0&&n.compare===null&&n.defaultProps===void 0?(t.tag=15,t.type=l,Vc(e,t,l,r,o)):(e=ao(n.type,null,r,t,t.mode,o),e.ref=t.ref,e.return=t,t.child=e)}if(l=e.child,!(e.lanes&o)){var i=l.memoizedProps;if(n=n.compare,n=n!==null?n:gr,n(i,r)&&e.ref===t.ref)return ht(e,t,o)}return t.flags|=1,e=Ot(l,r),e.ref=t.ref,e.return=t,t.child=e}function Vc(e,t,n,r,o){if(e!==null){var l=e.memoizedProps;if(gr(l,r)&&e.ref===t.ref)if(we=!1,t.pendingProps=r=l,(e.lanes&o)!==0)e.flags&131072&&(we=!0);else return t.lanes=e.lanes,ht(e,t,o)}return yi(e,t,n,r,o)}function Qc(e,t,n){var r=t.pendingProps,o=r.children,l=e!==null?e.memoizedState:null;if(r.mode==="hidden")if(!(t.mode&1))t.memoizedState={baseLanes:0,cachePool:null,transitions:null},Q(Sn,Ne),Ne|=n;else{if(!(n&1073741824))return e=l!==null?l.baseLanes|n:n,t.lanes=t.childLanes=1073741824,t.memoizedState={baseLanes:e,cachePool:null,transitions:null},t.updateQueue=null,Q(Sn,Ne),Ne|=e,null;t.memoizedState={baseLanes:0,cachePool:null,transitions:null},r=l!==null?l.baseLanes:n,Q(Sn,Ne),Ne|=r}else l!==null?(r=l.baseLanes|n,t.memoizedState=null):r=n,Q(Sn,Ne),Ne|=r;return he(e,t,o,n),t.child}function Hc(e,t){var n=t.ref;(e===null&&n!==null||e!==null&&e.ref!==n)&&(t.flags|=512,t.flags|=2097152)}function yi(e,t,n,r,o){var l=Se(n)?Xt:me.current;return l=Ln(t,l),zn(t,o),n=su(e,t,n,r,l,o),r=cu(),e!==null&&!we?(t.updateQueue=e.updateQueue,t.flags&=-2053,e.lanes&=~o,ht(e,t,o)):(Y&&r&&Ji(t),t.flags|=1,he(e,t,n,o),t.child)}function Ma(e,t,n,r,o){if(Se(n)){var l=!0;wo(t)}else l=!1;if(zn(t,o),t.stateNode===null)lo(e,t),Uc(t,n,r),gi(t,n,r,o),r=!0;else if(e===null){var i=t.stateNode,u=t.memoizedProps;i.props=u;var a=i.context,d=n.contextType;typeof d=="object"&&d!==null?d=Ue(d):(d=Se(n)?Xt:me.current,d=Ln(t,d));var v=n.getDerivedStateFromProps,g=typeof v=="function"||typeof i.getSnapshotBeforeUpdate=="function";g||typeof i.UNSAFE_componentWillReceiveProps!="function"&&typeof i.componentWillReceiveProps!="function"||(u!==r||a!==d)&&ja(t,i,r,d),wt=!1;var h=t.memoizedState;i.state=h,Eo(t,r,i,o),a=t.memoizedState,u!==r||h!==a||ke.current||wt?(typeof v=="function"&&(hi(t,n,v,r),a=t.memoizedState),(u=wt||za(t,n,u,r,h,a,d))?(g||typeof i.UNSAFE_componentWillMount!="function"&&typeof i.componentWillMount!="function"||(typeof i.componentWillMount=="function"&&i.componentWillMount(),typeof i.UNSAFE_componentWillMount=="function"&&i.UNSAFE_componentWillMount()),typeof i.componentDidMount=="function"&&(t.flags|=4194308)):(typeof i.componentDidMount=="function"&&(t.flags|=4194308),t.memoizedProps=r,t.memoizedState=a),i.props=r,i.state=a,i.context=d,r=u):(typeof i.componentDidMount=="function"&&(t.flags|=4194308),r=!1)}else{i=t.stateNode,xc(e,t),u=t.memoizedProps,d=t.type===t.elementType?u:He(t.type,u),i.props=d,g=t.pendingProps,h=i.context,a=n.contextType,typeof a=="object"&&a!==null?a=Ue(a):(a=Se(n)?Xt:me.current,a=Ln(t,a));var S=n.getDerivedStateFromProps;(v=typeof S=="function"||typeof i.getSnapshotBeforeUpdate=="function")||typeof i.UNSAFE_componentWillReceiveProps!="function"&&typeof i.componentWillReceiveProps!="function"||(u!==g||h!==a)&&ja(t,i,r,a),wt=!1,h=t.memoizedState,i.state=h,Eo(t,r,i,o);var _=t.memoizedState;u!==g||h!==_||ke.current||wt?(typeof S=="function"&&(hi(t,n,S,r),_=t.memoizedState),(d=wt||za(t,n,d,r,h,_,a)||!1)?(v||typeof i.UNSAFE_componentWillUpdate!="function"&&typeof i.componentWillUpdate!="function"||(typeof i.componentWillUpdate=="function"&&i.componentWillUpdate(r,_,a),typeof i.UNSAFE_componentWillUpdate=="function"&&i.UNSAFE_componentWillUpdate(r,_,a)),typeof i.componentDidUpdate=="function"&&(t.flags|=4),typeof i.getSnapshotBeforeUpdate=="function"&&(t.flags|=1024)):(typeof i.componentDidUpdate!="function"||u===e.memoizedProps&&h===e.memoizedState||(t.flags|=4),typeof i.getSnapshotBeforeUpdate!="function"||u===e.memoizedProps&&h===e.memoizedState||(t.flags|=1024),t.memoizedProps=r,t.memoizedState=_),i.props=r,i.state=_,i.context=a,r=d):(typeof i.componentDidUpdate!="function"||u===e.memoizedProps&&h===e.memoizedState||(t.flags|=4),typeof i.getSnapshotBeforeUpdate!="function"||u===e.memoizedProps&&h===e.memoizedState||(t.flags|=1024),r=!1)}return xi(e,t,n,r,l,o)}function xi(e,t,n,r,o,l){Hc(e,t);var i=(t.flags&128)!==0;if(!r&&!i)return o&&xa(t,n,!1),ht(e,t,l);r=t.stateNode,Kp.current=t;var u=i&&typeof n.getDerivedStateFromError!="function"?null:r.render();return t.flags|=1,e!==null&&i?(t.child=In(t,e.child,null,l),t.child=In(t,null,u,l)):he(e,t,u,l),t.memoizedState=r.state,o&&xa(t,n,!0),t.child}function Wc(e){var t=e.stateNode;t.pendingContext?ya(e,t.pendingContext,t.pendingContext!==t.context):t.context&&ya(e,t.context,!1),lu(e,t.containerInfo)}function Ra(e,t,n,r,o){return On(),Zi(o),t.flags|=256,he(e,t,n,r),t.child}var wi={dehydrated:null,treeContext:null,retryLane:0};function ki(e){return{baseLanes:e,cachePool:null,transitions:null}}function Kc(e,t,n){var r=t.pendingProps,o=X.current,l=!1,i=(t.flags&128)!==0,u;if((u=i)||(u=e!==null&&e.memoizedState===null?!1:(o&2)!==0),u?(l=!0,t.flags&=-129):(e===null||e.memoizedState!==null)&&(o|=1),Q(X,o&1),e===null)return pi(t),e=t.memoizedState,e!==null&&(e=e.dehydrated,e!==null)?(t.mode&1?e.data==="$!"?t.lanes=8:t.lanes=1073741824:t.lanes=1,null):(i=r.children,e=r.fallback,l?(r=t.mode,l=t.child,i={mode:"hidden",children:i},!(r&1)&&l!==null?(l.childLanes=0,l.pendingProps=i):l=Ko(i,r,0,null),e=Yt(e,r,n,null),l.return=t,e.return=t,l.sibling=e,t.child=l,t.child.memoizedState=ki(n),t.memoizedState=wi,e):pu(t,i));if(o=e.memoizedState,o!==null&&(u=o.dehydrated,u!==null))return Yp(e,t,i,r,u,o,n);if(l){l=r.fallback,i=t.mode,o=e.child,u=o.sibling;var a={mode:"hidden",children:r.children};return!(i&1)&&t.child!==o?(r=t.child,r.childLanes=0,r.pendingProps=a,t.deletions=null):(r=Ot(o,a),r.subtreeFlags=o.subtreeFlags&14680064),u!==null?l=Ot(u,l):(l=Yt(l,i,n,null),l.flags|=2),l.return=t,r.return=t,r.sibling=l,t.child=r,r=l,l=t.child,i=e.child.memoizedState,i=i===null?ki(n):{baseLanes:i.baseLanes|n,cachePool:null,transitions:i.transitions},l.memoizedState=i,l.childLanes=e.childLanes&~n,t.memoizedState=wi,r}return l=e.child,e=l.sibling,r=Ot(l,{mode:"visible",children:r.children}),!(t.mode&1)&&(r.lanes=n),r.return=t,r.sibling=null,e!==null&&(n=t.deletions,n===null?(t.deletions=[e],t.flags|=16):n.push(e)),t.child=r,t.memoizedState=null,r}function pu(e,t){return t=Ko({mode:"visible",children:t},e.mode,0,null),t.return=e,e.child=t}function Wr(e,t,n,r){return r!==null&&Zi(r),In(t,e.child,null,n),e=pu(t,t.pendingProps.children),e.flags|=2,t.memoizedState=null,e}function Yp(e,t,n,r,o,l,i){if(n)return t.flags&256?(t.flags&=-257,r=Ml(Error(w(422))),Wr(e,t,i,r)):t.memoizedState!==null?(t.child=e.child,t.flags|=128,null):(l=r.fallback,o=t.mode,r=Ko({mode:"visible",children:r.children},o,0,null),l=Yt(l,o,i,null),l.flags|=2,r.return=t,l.return=t,r.sibling=l,t.child=r,t.mode&1&&In(t,e.child,null,i),t.child.memoizedState=ki(i),t.memoizedState=wi,l);if(!(t.mode&1))return Wr(e,t,i,null);if(o.data==="$!"){if(r=o.nextSibling&&o.nextSibling.dataset,r)var u=r.dgst;return r=u,l=Error(w(419)),r=Ml(l,r,void 0),Wr(e,t,i,r)}if(u=(i&e.childLanes)!==0,we||u){if(r=ue,r!==null){switch(i&-i){case 4:o=2;break;case 16:o=8;break;case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:o=32;break;case 536870912:o=268435456;break;default:o=0}o=o&(r.suspendedLanes|i)?0:o,o!==0&&o!==l.retryLane&&(l.retryLane=o,mt(e,o),Xe(r,e,o,-1))}return xu(),r=Ml(Error(w(421))),Wr(e,t,i,r)}return o.data==="$?"?(t.flags|=128,t.child=e.child,t=um.bind(null,e),o._reactRetry=t,null):(e=l.treeContext,ze=jt(o.nextSibling),je=t,Y=!0,Ke=null,e!==null&&(Me[Re++]=st,Me[Re++]=ct,Me[Re++]=Gt,st=e.id,ct=e.overflow,Gt=t),t=pu(t,r.children),t.flags|=4096,t)}function Da(e,t,n){e.lanes|=t;var r=e.alternate;r!==null&&(r.lanes|=t),mi(e.return,t,n)}function Rl(e,t,n,r,o){var l=e.memoizedState;l===null?e.memoizedState={isBackwards:t,rendering:null,renderingStartTime:0,last:r,tail:n,tailMode:o}:(l.isBackwards=t,l.rendering=null,l.renderingStartTime=0,l.last=r,l.tail=n,l.tailMode=o)}function Yc(e,t,n){var r=t.pendingProps,o=r.revealOrder,l=r.tail;if(he(e,t,r.children,n),r=X.current,r&2)r=r&1|2,t.flags|=128;else{if(e!==null&&e.flags&128)e:for(e=t.child;e!==null;){if(e.tag===13)e.memoizedState!==null&&Da(e,n,t);else if(e.tag===19)Da(e,n,t);else if(e.child!==null){e.child.return=e,e=e.child;continue}if(e===t)break e;for(;e.sibling===null;){if(e.return===null||e.return===t)break e;e=e.return}e.sibling.return=e.return,e=e.sibling}r&=1}if(Q(X,r),!(t.mode&1))t.memoizedState=null;else switch(o){case"forwards":for(n=t.child,o=null;n!==null;)e=n.alternate,e!==null&&No(e)===null&&(o=n),n=n.sibling;n=o,n===null?(o=t.child,t.child=null):(o=n.sibling,n.sibling=null),Rl(t,!1,o,n,l);break;case"backwards":for(n=null,o=t.child,t.child=null;o!==null;){if(e=o.alternate,e!==null&&No(e)===null){t.child=o;break}e=o.sibling,o.sibling=n,n=o,o=e}Rl(t,!0,n,null,l);break;case"together":Rl(t,!1,null,null,void 0);break;default:t.memoizedState=null}return t.child}function lo(e,t){!(t.mode&1)&&e!==null&&(e.alternate=null,t.alternate=null,t.flags|=2)}function ht(e,t,n){if(e!==null&&(t.dependencies=e.dependencies),qt|=t.lanes,!(n&t.childLanes))return null;if(e!==null&&t.child!==e.child)throw Error(w(153));if(t.child!==null){for(e=t.child,n=Ot(e,e.pendingProps),t.child=n,n.return=t;e.sibling!==null;)e=e.sibling,n=n.sibling=Ot(e,e.pendingProps),n.return=t;n.sibling=null}return t.child}function Xp(e,t,n){switch(t.tag){case 3:Wc(t),On();break;case 5:wc(t);break;case 1:Se(t.type)&&wo(t);break;case 4:lu(t,t.stateNode.containerInfo);break;case 10:var r=t.type._context,o=t.memoizedProps.value;Q(_o,r._currentValue),r._currentValue=o;break;case 13:if(r=t.memoizedState,r!==null)return r.dehydrated!==null?(Q(X,X.current&1),t.flags|=128,null):n&t.child.childLanes?Kc(e,t,n):(Q(X,X.current&1),e=ht(e,t,n),e!==null?e.sibling:null);Q(X,X.current&1);break;case 19:if(r=(n&t.childLanes)!==0,e.flags&128){if(r)return Yc(e,t,n);t.flags|=128}if(o=t.memoizedState,o!==null&&(o.rendering=null,o.tail=null,o.lastEffect=null),Q(X,X.current),r)break;return null;case 22:case 23:return t.lanes=0,Qc(e,t,n)}return ht(e,t,n)}var Xc,Si,Gc,Jc;Xc=function(e,t){for(var n=t.child;n!==null;){if(n.tag===5||n.tag===6)e.appendChild(n.stateNode);else if(n.tag!==4&&n.child!==null){n.child.return=n,n=n.child;continue}if(n===t)break;for(;n.sibling===null;){if(n.return===null||n.return===t)return;n=n.return}n.sibling.return=n.return,n=n.sibling}};Si=function(){};Gc=function(e,t,n,r){var o=e.memoizedProps;if(o!==r){e=t.stateNode,Wt(tt.current);var l=null;switch(n){case"input":o=Ql(e,o),r=Ql(e,r),l=[];break;case"select":o=J({},o,{value:void 0}),r=J({},r,{value:void 0}),l=[];break;case"textarea":o=Kl(e,o),r=Kl(e,r),l=[];break;default:typeof o.onClick!="function"&&typeof r.onClick=="function"&&(e.onclick=yo)}Xl(n,r);var i;n=null;for(d in o)if(!r.hasOwnProperty(d)&&o.hasOwnProperty(d)&&o[d]!=null)if(d==="style"){var u=o[d];for(i in u)u.hasOwnProperty(i)&&(n||(n={}),n[i]="")}else d!=="dangerouslySetInnerHTML"&&d!=="children"&&d!=="suppressContentEditableWarning"&&d!=="suppressHydrationWarning"&&d!=="autoFocus"&&(sr.hasOwnProperty(d)?l||(l=[]):(l=l||[]).push(d,null));for(d in r){var a=r[d];if(u=o!=null?o[d]:void 0,r.hasOwnProperty(d)&&a!==u&&(a!=null||u!=null))if(d==="style")if(u){for(i in u)!u.hasOwnProperty(i)||a&&a.hasOwnProperty(i)||(n||(n={}),n[i]="");for(i in a)a.hasOwnProperty(i)&&u[i]!==a[i]&&(n||(n={}),n[i]=a[i])}else n||(l||(l=[]),l.push(d,n)),n=a;else d==="dangerouslySetInnerHTML"?(a=a?a.__html:void 0,u=u?u.__html:void 0,a!=null&&u!==a&&(l=l||[]).push(d,a)):d==="children"?typeof a!="string"&&typeof a!="number"||(l=l||[]).push(d,""+a):d!=="suppressContentEditableWarning"&&d!=="suppressHydrationWarning"&&(sr.hasOwnProperty(d)?(a!=null&&d==="onScroll"&&H("scroll",e),l||u===a||(l=[])):(l=l||[]).push(d,a))}n&&(l=l||[]).push("style",n);var d=l;(t.updateQueue=d)&&(t.flags|=4)}};Jc=function(e,t,n,r){n!==r&&(t.flags|=4)};function Yn(e,t){if(!Y)switch(e.tailMode){case"hidden":t=e.tail;for(var n=null;t!==null;)t.alternate!==null&&(n=t),t=t.sibling;n===null?e.tail=null:n.sibling=null;break;case"collapsed":n=e.tail;for(var r=null;n!==null;)n.alternate!==null&&(r=n),n=n.sibling;r===null?t||e.tail===null?e.tail=null:e.tail.sibling=null:r.sibling=null}}function fe(e){var t=e.alternate!==null&&e.alternate.child===e.child,n=0,r=0;if(t)for(var o=e.child;o!==null;)n|=o.lanes|o.childLanes,r|=o.subtreeFlags&14680064,r|=o.flags&14680064,o.return=e,o=o.sibling;else for(o=e.child;o!==null;)n|=o.lanes|o.childLanes,r|=o.subtreeFlags,r|=o.flags,o.return=e,o=o.sibling;return e.subtreeFlags|=r,e.childLanes=n,t}function Gp(e,t,n){var r=t.pendingProps;switch(qi(t),t.tag){case 2:case 16:case 15:case 0:case 11:case 7:case 8:case 12:case 9:case 14:return fe(t),null;case 1:return Se(t.type)&&xo(),fe(t),null;case 3:return r=t.stateNode,Mn(),W(ke),W(me),uu(),r.pendingContext&&(r.context=r.pendingContext,r.pendingContext=null),(e===null||e.child===null)&&(Qr(t)?t.flags|=4:e===null||e.memoizedState.isDehydrated&&!(t.flags&256)||(t.flags|=1024,Ke!==null&&(Ti(Ke),Ke=null))),Si(e,t),fe(t),null;case 5:iu(t);var o=Wt(kr.current);if(n=t.type,e!==null&&t.stateNode!=null)Gc(e,t,n,r,o),e.ref!==t.ref&&(t.flags|=512,t.flags|=2097152);else{if(!r){if(t.stateNode===null)throw Error(w(166));return fe(t),null}if(e=Wt(tt.current),Qr(t)){r=t.stateNode,n=t.type;var l=t.memoizedProps;switch(r[Ze]=t,r[xr]=l,e=(t.mode&1)!==0,n){case"dialog":H("cancel",r),H("close",r);break;case"iframe":case"object":case"embed":H("load",r);break;case"video":case"audio":for(o=0;o<Zn.length;o++)H(Zn[o],r);break;case"source":H("error",r);break;case"img":case"image":case"link":H("error",r),H("load",r);break;case"details":H("toggle",r);break;case"input":Hu(r,l),H("invalid",r);break;case"select":r._wrapperState={wasMultiple:!!l.multiple},H("invalid",r);break;case"textarea":Ku(r,l),H("invalid",r)}Xl(n,l),o=null;for(var i in l)if(l.hasOwnProperty(i)){var u=l[i];i==="children"?typeof u=="string"?r.textContent!==u&&(l.suppressHydrationWarning!==!0&&Vr(r.textContent,u,e),o=["children",u]):typeof u=="number"&&r.textContent!==""+u&&(l.suppressHydrationWarning!==!0&&Vr(r.textContent,u,e),o=["children",""+u]):sr.hasOwnProperty(i)&&u!=null&&i==="onScroll"&&H("scroll",r)}switch(n){case"input":Rr(r),Wu(r,l,!0);break;case"textarea":Rr(r),Yu(r);break;case"select":case"option":break;default:typeof l.onClick=="function"&&(r.onclick=yo)}r=o,t.updateQueue=r,r!==null&&(t.flags|=4)}else{i=o.nodeType===9?o:o.ownerDocument,e==="http://www.w3.org/1999/xhtml"&&(e=Es(n)),e==="http://www.w3.org/1999/xhtml"?n==="script"?(e=i.createElement("div"),e.innerHTML="<script><\/script>",e=e.removeChild(e.firstChild)):typeof r.is=="string"?e=i.createElement(n,{is:r.is}):(e=i.createElement(n),n==="select"&&(i=e,r.multiple?i.multiple=!0:r.size&&(i.size=r.size))):e=i.createElementNS(e,n),e[Ze]=t,e[xr]=r,Xc(e,t,!1,!1),t.stateNode=e;e:{switch(i=Gl(n,r),n){case"dialog":H("cancel",e),H("close",e),o=r;break;case"iframe":case"object":case"embed":H("load",e),o=r;break;case"video":case"audio":for(o=0;o<Zn.length;o++)H(Zn[o],e);o=r;break;case"source":H("error",e),o=r;break;case"img":case"image":case"link":H("error",e),H("load",e),o=r;break;case"details":H("toggle",e),o=r;break;case"input":Hu(e,r),o=Ql(e,r),H("invalid",e);break;case"option":o=r;break;case"select":e._wrapperState={wasMultiple:!!r.multiple},o=J({},r,{value:void 0}),H("invalid",e);break;case"textarea":Ku(e,r),o=Kl(e,r),H("invalid",e);break;default:o=r}Xl(n,o),u=o;for(l in u)if(u.hasOwnProperty(l)){var a=u[l];l==="style"?js(e,a):l==="dangerouslySetInnerHTML"?(a=a?a.__html:void 0,a!=null&&Ns(e,a)):l==="children"?typeof a=="string"?(n!=="textarea"||a!=="")&&cr(e,a):typeof a=="number"&&cr(e,""+a):l!=="suppressContentEditableWarning"&&l!=="suppressHydrationWarning"&&l!=="autoFocus"&&(sr.hasOwnProperty(l)?a!=null&&l==="onScroll"&&H("scroll",e):a!=null&&Fi(e,l,a,i))}switch(n){case"input":Rr(e),Wu(e,r,!1);break;case"textarea":Rr(e),Yu(e);break;case"option":r.value!=null&&e.setAttribute("value",""+It(r.value));break;case"select":e.multiple=!!r.multiple,l=r.value,l!=null?_n(e,!!r.multiple,l,!1):r.defaultValue!=null&&_n(e,!!r.multiple,r.defaultValue,!0);break;default:typeof o.onClick=="function"&&(e.onclick=yo)}switch(n){case"button":case"input":case"select":case"textarea":r=!!r.autoFocus;break e;case"img":r=!0;break e;default:r=!1}}r&&(t.flags|=4)}t.ref!==null&&(t.flags|=512,t.flags|=2097152)}return fe(t),null;case 6:if(e&&t.stateNode!=null)Jc(e,t,e.memoizedProps,r);else{if(typeof r!="string"&&t.stateNode===null)throw Error(w(166));if(n=Wt(kr.current),Wt(tt.current),Qr(t)){if(r=t.stateNode,n=t.memoizedProps,r[Ze]=t,(l=r.nodeValue!==n)&&(e=je,e!==null))switch(e.tag){case 3:Vr(r.nodeValue,n,(e.mode&1)!==0);break;case 5:e.memoizedProps.suppressHydrationWarning!==!0&&Vr(r.nodeValue,n,(e.mode&1)!==0)}l&&(t.flags|=4)}else r=(n.nodeType===9?n:n.ownerDocument).createTextNode(r),r[Ze]=t,t.stateNode=r}return fe(t),null;case 13:if(W(X),r=t.memoizedState,e===null||e.memoizedState!==null&&e.memoizedState.dehydrated!==null){if(Y&&ze!==null&&t.mode&1&&!(t.flags&128))hc(),On(),t.flags|=98560,l=!1;else if(l=Qr(t),r!==null&&r.dehydrated!==null){if(e===null){if(!l)throw Error(w(318));if(l=t.memoizedState,l=l!==null?l.dehydrated:null,!l)throw Error(w(317));l[Ze]=t}else On(),!(t.flags&128)&&(t.memoizedState=null),t.flags|=4;fe(t),l=!1}else Ke!==null&&(Ti(Ke),Ke=null),l=!0;if(!l)return t.flags&65536?t:null}return t.flags&128?(t.lanes=n,t):(r=r!==null,r!==(e!==null&&e.memoizedState!==null)&&r&&(t.child.flags|=8192,t.mode&1&&(e===null||X.current&1?oe===0&&(oe=3):xu())),t.updateQueue!==null&&(t.flags|=4),fe(t),null);case 4:return Mn(),Si(e,t),e===null&&vr(t.stateNode.containerInfo),fe(t),null;case 10:return nu(t.type._context),fe(t),null;case 17:return Se(t.type)&&xo(),fe(t),null;case 19:if(W(X),l=t.memoizedState,l===null)return fe(t),null;if(r=(t.flags&128)!==0,i=l.rendering,i===null)if(r)Yn(l,!1);else{if(oe!==0||e!==null&&e.flags&128)for(e=t.child;e!==null;){if(i=No(e),i!==null){for(t.flags|=128,Yn(l,!1),r=i.updateQueue,r!==null&&(t.updateQueue=r,t.flags|=4),t.subtreeFlags=0,r=n,n=t.child;n!==null;)l=n,e=r,l.flags&=14680066,i=l.alternate,i===null?(l.childLanes=0,l.lanes=e,l.child=null,l.subtreeFlags=0,l.memoizedProps=null,l.memoizedState=null,l.updateQueue=null,l.dependencies=null,l.stateNode=null):(l.childLanes=i.childLanes,l.lanes=i.lanes,l.child=i.child,l.subtreeFlags=0,l.deletions=null,l.memoizedProps=i.memoizedProps,l.memoizedState=i.memoizedState,l.updateQueue=i.updateQueue,l.type=i.type,e=i.dependencies,l.dependencies=e===null?null:{lanes:e.lanes,firstContext:e.firstContext}),n=n.sibling;return Q(X,X.current&1|2),t.child}e=e.sibling}l.tail!==null&&te()>Dn&&(t.flags|=128,r=!0,Yn(l,!1),t.lanes=4194304)}else{if(!r)if(e=No(i),e!==null){if(t.flags|=128,r=!0,n=e.updateQueue,n!==null&&(t.updateQueue=n,t.flags|=4),Yn(l,!0),l.tail===null&&l.tailMode==="hidden"&&!i.alternate&&!Y)return fe(t),null}else 2*te()-l.renderingStartTime>Dn&&n!==1073741824&&(t.flags|=128,r=!0,Yn(l,!1),t.lanes=4194304);l.isBackwards?(i.sibling=t.child,t.child=i):(n=l.last,n!==null?n.sibling=i:t.child=i,l.last=i)}return l.tail!==null?(t=l.tail,l.rendering=t,l.tail=t.sibling,l.renderingStartTime=te(),t.sibling=null,n=X.current,Q(X,r?n&1|2:n&1),t):(fe(t),null);case 22:case 23:return yu(),r=t.memoizedState!==null,e!==null&&e.memoizedState!==null!==r&&(t.flags|=8192),r&&t.mode&1?Ne&1073741824&&(fe(t),t.subtreeFlags&6&&(t.flags|=8192)):fe(t),null;case 24:return null;case 25:return null}throw Error(w(156,t.tag))}function Jp(e,t){switch(qi(t),t.tag){case 1:return Se(t.type)&&xo(),e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 3:return Mn(),W(ke),W(me),uu(),e=t.flags,e&65536&&!(e&128)?(t.flags=e&-65537|128,t):null;case 5:return iu(t),null;case 13:if(W(X),e=t.memoizedState,e!==null&&e.dehydrated!==null){if(t.alternate===null)throw Error(w(340));On()}return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 19:return W(X),null;case 4:return Mn(),null;case 10:return nu(t.type._context),null;case 22:case 23:return yu(),null;case 24:return null;default:return null}}var Kr=!1,pe=!1,qp=typeof WeakSet=="function"?WeakSet:Set,z=null;function kn(e,t){var n=e.ref;if(n!==null)if(typeof n=="function")try{n(null)}catch(r){ee(e,t,r)}else n.current=null}function _i(e,t,n){try{n()}catch(r){ee(e,t,r)}}var Fa=!1;function Zp(e,t){if(ii=ho,e=nc(),Gi(e)){if("selectionStart"in e)var n={start:e.selectionStart,end:e.selectionEnd};else e:{n=(n=e.ownerDocument)&&n.defaultView||window;var r=n.getSelection&&n.getSelection();if(r&&r.rangeCount!==0){n=r.anchorNode;var o=r.anchorOffset,l=r.focusNode;r=r.focusOffset;try{n.nodeType,l.nodeType}catch{n=null;break e}var i=0,u=-1,a=-1,d=0,v=0,g=e,h=null;t:for(;;){for(var S;g!==n||o!==0&&g.nodeType!==3||(u=i+o),g!==l||r!==0&&g.nodeType!==3||(a=i+r),g.nodeType===3&&(i+=g.nodeValue.length),(S=g.firstChild)!==null;)h=g,g=S;for(;;){if(g===e)break t;if(h===n&&++d===o&&(u=i),h===l&&++v===r&&(a=i),(S=g.nextSibling)!==null)break;g=h,h=g.parentNode}g=S}n=u===-1||a===-1?null:{start:u,end:a}}else n=null}n=n||{start:0,end:0}}else n=null;for(ui={focusedElem:e,selectionRange:n},ho=!1,z=t;z!==null;)if(t=z,e=t.child,(t.subtreeFlags&1028)!==0&&e!==null)e.return=t,z=e;else for(;z!==null;){t=z;try{var _=t.alternate;if(t.flags&1024)switch(t.tag){case 0:case 11:case 15:break;case 1:if(_!==null){var k=_.memoizedProps,L=_.memoizedState,f=t.stateNode,c=f.getSnapshotBeforeUpdate(t.elementType===t.type?k:He(t.type,k),L);f.__reactInternalSnapshotBeforeUpdate=c}break;case 3:var m=t.stateNode.containerInfo;m.nodeType===1?m.textContent="":m.nodeType===9&&m.documentElement&&m.removeChild(m.documentElement);break;case 5:case 6:case 4:case 17:break;default:throw Error(w(163))}}catch(x){ee(t,t.return,x)}if(e=t.sibling,e!==null){e.return=t.return,z=e;break}z=t.return}return _=Fa,Fa=!1,_}function ir(e,t,n){var r=t.updateQueue;if(r=r!==null?r.lastEffect:null,r!==null){var o=r=r.next;do{if((o.tag&e)===e){var l=o.destroy;o.destroy=void 0,l!==void 0&&_i(t,n,l)}o=o.next}while(o!==r)}}function Ho(e,t){if(t=t.updateQueue,t=t!==null?t.lastEffect:null,t!==null){var n=t=t.next;do{if((n.tag&e)===e){var r=n.create;n.destroy=r()}n=n.next}while(n!==t)}}function Ci(e){var t=e.ref;if(t!==null){var n=e.stateNode;switch(e.tag){case 5:e=n;break;default:e=n}typeof t=="function"?t(e):t.current=e}}function qc(e){var t=e.alternate;t!==null&&(e.alternate=null,qc(t)),e.child=null,e.deletions=null,e.sibling=null,e.tag===5&&(t=e.stateNode,t!==null&&(delete t[Ze],delete t[xr],delete t[ci],delete t[Rp],delete t[Dp])),e.stateNode=null,e.return=null,e.dependencies=null,e.memoizedProps=null,e.memoizedState=null,e.pendingProps=null,e.stateNode=null,e.updateQueue=null}function Zc(e){return e.tag===5||e.tag===3||e.tag===4}function $a(e){e:for(;;){for(;e.sibling===null;){if(e.return===null||Zc(e.return))return null;e=e.return}for(e.sibling.return=e.return,e=e.sibling;e.tag!==5&&e.tag!==6&&e.tag!==18;){if(e.flags&2||e.child===null||e.tag===4)continue e;e.child.return=e,e=e.child}if(!(e.flags&2))return e.stateNode}}function Ei(e,t,n){var r=e.tag;if(r===5||r===6)e=e.stateNode,t?n.nodeType===8?n.parentNode.insertBefore(e,t):n.insertBefore(e,t):(n.nodeType===8?(t=n.parentNode,t.insertBefore(e,n)):(t=n,t.appendChild(e)),n=n._reactRootContainer,n!=null||t.onclick!==null||(t.onclick=yo));else if(r!==4&&(e=e.child,e!==null))for(Ei(e,t,n),e=e.sibling;e!==null;)Ei(e,t,n),e=e.sibling}function Ni(e,t,n){var r=e.tag;if(r===5||r===6)e=e.stateNode,t?n.insertBefore(e,t):n.appendChild(e);else if(r!==4&&(e=e.child,e!==null))for(Ni(e,t,n),e=e.sibling;e!==null;)Ni(e,t,n),e=e.sibling}var ae=null,We=!1;function yt(e,t,n){for(n=n.child;n!==null;)ed(e,t,n),n=n.sibling}function ed(e,t,n){if(et&&typeof et.onCommitFiberUnmount=="function")try{et.onCommitFiberUnmount(Fo,n)}catch{}switch(n.tag){case 5:pe||kn(n,t);case 6:var r=ae,o=We;ae=null,yt(e,t,n),ae=r,We=o,ae!==null&&(We?(e=ae,n=n.stateNode,e.nodeType===8?e.parentNode.removeChild(n):e.removeChild(n)):ae.removeChild(n.stateNode));break;case 18:ae!==null&&(We?(e=ae,n=n.stateNode,e.nodeType===8?jl(e.parentNode,n):e.nodeType===1&&jl(e,n),mr(e)):jl(ae,n.stateNode));break;case 4:r=ae,o=We,ae=n.stateNode.containerInfo,We=!0,yt(e,t,n),ae=r,We=o;break;case 0:case 11:case 14:case 15:if(!pe&&(r=n.updateQueue,r!==null&&(r=r.lastEffect,r!==null))){o=r=r.next;do{var l=o,i=l.destroy;l=l.tag,i!==void 0&&(l&2||l&4)&&_i(n,t,i),o=o.next}while(o!==r)}yt(e,t,n);break;case 1:if(!pe&&(kn(n,t),r=n.stateNode,typeof r.componentWillUnmount=="function"))try{r.props=n.memoizedProps,r.state=n.memoizedState,r.componentWillUnmount()}catch(u){ee(n,t,u)}yt(e,t,n);break;case 21:yt(e,t,n);break;case 22:n.mode&1?(pe=(r=pe)||n.memoizedState!==null,yt(e,t,n),pe=r):yt(e,t,n);break;default:yt(e,t,n)}}function Aa(e){var t=e.updateQueue;if(t!==null){e.updateQueue=null;var n=e.stateNode;n===null&&(n=e.stateNode=new qp),t.forEach(function(r){var o=am.bind(null,e,r);n.has(r)||(n.add(r),r.then(o,o))})}}function Qe(e,t){var n=t.deletions;if(n!==null)for(var r=0;r<n.length;r++){var o=n[r];try{var l=e,i=t,u=i;e:for(;u!==null;){switch(u.tag){case 5:ae=u.stateNode,We=!1;break e;case 3:ae=u.stateNode.containerInfo,We=!0;break e;case 4:ae=u.stateNode.containerInfo,We=!0;break e}u=u.return}if(ae===null)throw Error(w(160));ed(l,i,o),ae=null,We=!1;var a=o.alternate;a!==null&&(a.return=null),o.return=null}catch(d){ee(o,t,d)}}if(t.subtreeFlags&12854)for(t=t.child;t!==null;)td(t,e),t=t.sibling}function td(e,t){var n=e.alternate,r=e.flags;switch(e.tag){case 0:case 11:case 14:case 15:if(Qe(t,e),Je(e),r&4){try{ir(3,e,e.return),Ho(3,e)}catch(k){ee(e,e.return,k)}try{ir(5,e,e.return)}catch(k){ee(e,e.return,k)}}break;case 1:Qe(t,e),Je(e),r&512&&n!==null&&kn(n,n.return);break;case 5:if(Qe(t,e),Je(e),r&512&&n!==null&&kn(n,n.return),e.flags&32){var o=e.stateNode;try{cr(o,"")}catch(k){ee(e,e.return,k)}}if(r&4&&(o=e.stateNode,o!=null)){var l=e.memoizedProps,i=n!==null?n.memoizedProps:l,u=e.type,a=e.updateQueue;if(e.updateQueue=null,a!==null)try{u==="input"&&l.type==="radio"&&l.name!=null&&_s(o,l),Gl(u,i);var d=Gl(u,l);for(i=0;i<a.length;i+=2){var v=a[i],g=a[i+1];v==="style"?js(o,g):v==="dangerouslySetInnerHTML"?Ns(o,g):v==="children"?cr(o,g):Fi(o,v,g,d)}switch(u){case"input":Hl(o,l);break;case"textarea":Cs(o,l);break;case"select":var h=o._wrapperState.wasMultiple;o._wrapperState.wasMultiple=!!l.multiple;var S=l.value;S!=null?_n(o,!!l.multiple,S,!1):h!==!!l.multiple&&(l.defaultValue!=null?_n(o,!!l.multiple,l.defaultValue,!0):_n(o,!!l.multiple,l.multiple?[]:"",!1))}o[xr]=l}catch(k){ee(e,e.return,k)}}break;case 6:if(Qe(t,e),Je(e),r&4){if(e.stateNode===null)throw Error(w(162));o=e.stateNode,l=e.memoizedProps;try{o.nodeValue=l}catch(k){ee(e,e.return,k)}}break;case 3:if(Qe(t,e),Je(e),r&4&&n!==null&&n.memoizedState.isDehydrated)try{mr(t.containerInfo)}catch(k){ee(e,e.return,k)}break;case 4:Qe(t,e),Je(e);break;case 13:Qe(t,e),Je(e),o=e.child,o.flags&8192&&(l=o.memoizedState!==null,o.stateNode.isHidden=l,!l||o.alternate!==null&&o.alternate.memoizedState!==null||(gu=te())),r&4&&Aa(e);break;case 22:if(v=n!==null&&n.memoizedState!==null,e.mode&1?(pe=(d=pe)||v,Qe(t,e),pe=d):Qe(t,e),Je(e),r&8192){if(d=e.memoizedState!==null,(e.stateNode.isHidden=d)&&!v&&e.mode&1)for(z=e,v=e.child;v!==null;){for(g=z=v;z!==null;){switch(h=z,S=h.child,h.tag){case 0:case 11:case 14:case 15:ir(4,h,h.return);break;case 1:kn(h,h.return);var _=h.stateNode;if(typeof _.componentWillUnmount=="function"){r=h,n=h.return;try{t=r,_.props=t.memoizedProps,_.state=t.memoizedState,_.componentWillUnmount()}catch(k){ee(r,n,k)}}break;case 5:kn(h,h.return);break;case 22:if(h.memoizedState!==null){ba(g);continue}}S!==null?(S.return=h,z=S):ba(g)}v=v.sibling}e:for(v=null,g=e;;){if(g.tag===5){if(v===null){v=g;try{o=g.stateNode,d?(l=o.style,typeof l.setProperty=="function"?l.setProperty("display","none","important"):l.display="none"):(u=g.stateNode,a=g.memoizedProps.style,i=a!=null&&a.hasOwnProperty("display")?a.display:null,u.style.display=zs("display",i))}catch(k){ee(e,e.return,k)}}}else if(g.tag===6){if(v===null)try{g.stateNode.nodeValue=d?"":g.memoizedProps}catch(k){ee(e,e.return,k)}}else if((g.tag!==22&&g.tag!==23||g.memoizedState===null||g===e)&&g.child!==null){g.child.return=g,g=g.child;continue}if(g===e)break e;for(;g.sibling===null;){if(g.return===null||g.return===e)break e;v===g&&(v=null),g=g.return}v===g&&(v=null),g.sibling.return=g.return,g=g.sibling}}break;case 19:Qe(t,e),Je(e),r&4&&Aa(e);break;case 21:break;default:Qe(t,e),Je(e)}}function Je(e){var t=e.flags;if(t&2){try{e:{for(var n=e.return;n!==null;){if(Zc(n)){var r=n;break e}n=n.return}throw Error(w(160))}switch(r.tag){case 5:var o=r.stateNode;r.flags&32&&(cr(o,""),r.flags&=-33);var l=$a(e);Ni(e,l,o);break;case 3:case 4:var i=r.stateNode.containerInfo,u=$a(e);Ei(e,u,i);break;default:throw Error(w(161))}}catch(a){ee(e,e.return,a)}e.flags&=-3}t&4096&&(e.flags&=-4097)}function em(e,t,n){z=e,nd(e)}function nd(e,t,n){for(var r=(e.mode&1)!==0;z!==null;){var o=z,l=o.child;if(o.tag===22&&r){var i=o.memoizedState!==null||Kr;if(!i){var u=o.alternate,a=u!==null&&u.memoizedState!==null||pe;u=Kr;var d=pe;if(Kr=i,(pe=a)&&!d)for(z=o;z!==null;)i=z,a=i.child,i.tag===22&&i.memoizedState!==null?Ba(o):a!==null?(a.return=i,z=a):Ba(o);for(;l!==null;)z=l,nd(l),l=l.sibling;z=o,Kr=u,pe=d}Ua(e)}else o.subtreeFlags&8772&&l!==null?(l.return=o,z=l):Ua(e)}}function Ua(e){for(;z!==null;){var t=z;if(t.flags&8772){var n=t.alternate;try{if(t.flags&8772)switch(t.tag){case 0:case 11:case 15:pe||Ho(5,t);break;case 1:var r=t.stateNode;if(t.flags&4&&!pe)if(n===null)r.componentDidMount();else{var o=t.elementType===t.type?n.memoizedProps:He(t.type,n.memoizedProps);r.componentDidUpdate(o,n.memoizedState,r.__reactInternalSnapshotBeforeUpdate)}var l=t.updateQueue;l!==null&&Ca(t,l,r);break;case 3:var i=t.updateQueue;if(i!==null){if(n=null,t.child!==null)switch(t.child.tag){case 5:n=t.child.stateNode;break;case 1:n=t.child.stateNode}Ca(t,i,n)}break;case 5:var u=t.stateNode;if(n===null&&t.flags&4){n=u;var a=t.memoizedProps;switch(t.type){case"button":case"input":case"select":case"textarea":a.autoFocus&&n.focus();break;case"img":a.src&&(n.src=a.src)}}break;case 6:break;case 4:break;case 12:break;case 13:if(t.memoizedState===null){var d=t.alternate;if(d!==null){var v=d.memoizedState;if(v!==null){var g=v.dehydrated;g!==null&&mr(g)}}}break;case 19:case 17:case 21:case 22:case 23:case 25:break;default:throw Error(w(163))}pe||t.flags&512&&Ci(t)}catch(h){ee(t,t.return,h)}}if(t===e){z=null;break}if(n=t.sibling,n!==null){n.return=t.return,z=n;break}z=t.return}}function ba(e){for(;z!==null;){var t=z;if(t===e){z=null;break}var n=t.sibling;if(n!==null){n.return=t.return,z=n;break}z=t.return}}function Ba(e){for(;z!==null;){var t=z;try{switch(t.tag){case 0:case 11:case 15:var n=t.return;try{Ho(4,t)}catch(a){ee(t,n,a)}break;case 1:var r=t.stateNode;if(typeof r.componentDidMount=="function"){var o=t.return;try{r.componentDidMount()}catch(a){ee(t,o,a)}}var l=t.return;try{Ci(t)}catch(a){ee(t,l,a)}break;case 5:var i=t.return;try{Ci(t)}catch(a){ee(t,i,a)}}}catch(a){ee(t,t.return,a)}if(t===e){z=null;break}var u=t.sibling;if(u!==null){u.return=t.return,z=u;break}z=t.return}}var tm=Math.ceil,Po=gt.ReactCurrentDispatcher,mu=gt.ReactCurrentOwner,Ae=gt.ReactCurrentBatchConfig,U=0,ue=null,ne=null,se=0,Ne=0,Sn=Dt(0),oe=0,Er=null,qt=0,Wo=0,hu=0,ur=null,xe=null,gu=0,Dn=1/0,ut=null,To=!1,zi=null,Tt=null,Yr=!1,Ct=null,Lo=0,ar=0,ji=null,io=-1,uo=0;function ge(){return U&6?te():io!==-1?io:io=te()}function Lt(e){return e.mode&1?U&2&&se!==0?se&-se:$p.transition!==null?(uo===0&&(uo=Us()),uo):(e=b,e!==0||(e=window.event,e=e===void 0?16:Ks(e.type)),e):1}function Xe(e,t,n,r){if(50<ar)throw ar=0,ji=null,Error(w(185));zr(e,n,r),(!(U&2)||e!==ue)&&(e===ue&&(!(U&2)&&(Wo|=n),oe===4&&St(e,se)),_e(e,r),n===1&&U===0&&!(t.mode&1)&&(Dn=te()+500,Bo&&Ft()))}function _e(e,t){var n=e.callbackNode;$f(e,t);var r=mo(e,e===ue?se:0);if(r===0)n!==null&&Ju(n),e.callbackNode=null,e.callbackPriority=0;else if(t=r&-r,e.callbackPriority!==t){if(n!=null&&Ju(n),t===1)e.tag===0?Fp(Va.bind(null,e)):fc(Va.bind(null,e)),Ip(function(){!(U&6)&&Ft()}),n=null;else{switch(bs(r)){case 1:n=Bi;break;case 4:n=$s;break;case 16:n=po;break;case 536870912:n=As;break;default:n=po}n=cd(n,rd.bind(null,e))}e.callbackPriority=t,e.callbackNode=n}}function rd(e,t){if(io=-1,uo=0,U&6)throw Error(w(327));var n=e.callbackNode;if(jn()&&e.callbackNode!==n)return null;var r=mo(e,e===ue?se:0);if(r===0)return null;if(r&30||r&e.expiredLanes||t)t=Oo(e,r);else{t=r;var o=U;U|=2;var l=ld();(ue!==e||se!==t)&&(ut=null,Dn=te()+500,Kt(e,t));do try{om();break}catch(u){od(e,u)}while(1);tu(),Po.current=l,U=o,ne!==null?t=0:(ue=null,se=0,t=oe)}if(t!==0){if(t===2&&(o=ti(e),o!==0&&(r=o,t=Pi(e,o))),t===1)throw n=Er,Kt(e,0),St(e,r),_e(e,te()),n;if(t===6)St(e,r);else{if(o=e.current.alternate,!(r&30)&&!nm(o)&&(t=Oo(e,r),t===2&&(l=ti(e),l!==0&&(r=l,t=Pi(e,l))),t===1))throw n=Er,Kt(e,0),St(e,r),_e(e,te()),n;switch(e.finishedWork=o,e.finishedLanes=r,t){case 0:case 1:throw Error(w(345));case 2:Vt(e,xe,ut);break;case 3:if(St(e,r),(r&130023424)===r&&(t=gu+500-te(),10<t)){if(mo(e,0)!==0)break;if(o=e.suspendedLanes,(o&r)!==r){ge(),e.pingedLanes|=e.suspendedLanes&o;break}e.timeoutHandle=si(Vt.bind(null,e,xe,ut),t);break}Vt(e,xe,ut);break;case 4:if(St(e,r),(r&4194240)===r)break;for(t=e.eventTimes,o=-1;0<r;){var i=31-Ye(r);l=1<<i,i=t[i],i>o&&(o=i),r&=~l}if(r=o,r=te()-r,r=(120>r?120:480>r?480:1080>r?1080:1920>r?1920:3e3>r?3e3:4320>r?4320:1960*tm(r/1960))-r,10<r){e.timeoutHandle=si(Vt.bind(null,e,xe,ut),r);break}Vt(e,xe,ut);break;case 5:Vt(e,xe,ut);break;default:throw Error(w(329))}}}return _e(e,te()),e.callbackNode===n?rd.bind(null,e):null}function Pi(e,t){var n=ur;return e.current.memoizedState.isDehydrated&&(Kt(e,t).flags|=256),e=Oo(e,t),e!==2&&(t=xe,xe=n,t!==null&&Ti(t)),e}function Ti(e){xe===null?xe=e:xe.push.apply(xe,e)}function nm(e){for(var t=e;;){if(t.flags&16384){var n=t.updateQueue;if(n!==null&&(n=n.stores,n!==null))for(var r=0;r<n.length;r++){var o=n[r],l=o.getSnapshot;o=o.value;try{if(!Ge(l(),o))return!1}catch{return!1}}}if(n=t.child,t.subtreeFlags&16384&&n!==null)n.return=t,t=n;else{if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return!0;t=t.return}t.sibling.return=t.return,t=t.sibling}}return!0}function St(e,t){for(t&=~hu,t&=~Wo,e.suspendedLanes|=t,e.pingedLanes&=~t,e=e.expirationTimes;0<t;){var n=31-Ye(t),r=1<<n;e[n]=-1,t&=~r}}function Va(e){if(U&6)throw Error(w(327));jn();var t=mo(e,0);if(!(t&1))return _e(e,te()),null;var n=Oo(e,t);if(e.tag!==0&&n===2){var r=ti(e);r!==0&&(t=r,n=Pi(e,r))}if(n===1)throw n=Er,Kt(e,0),St(e,t),_e(e,te()),n;if(n===6)throw Error(w(345));return e.finishedWork=e.current.alternate,e.finishedLanes=t,Vt(e,xe,ut),_e(e,te()),null}function vu(e,t){var n=U;U|=1;try{return e(t)}finally{U=n,U===0&&(Dn=te()+500,Bo&&Ft())}}function Zt(e){Ct!==null&&Ct.tag===0&&!(U&6)&&jn();var t=U;U|=1;var n=Ae.transition,r=b;try{if(Ae.transition=null,b=1,e)return e()}finally{b=r,Ae.transition=n,U=t,!(U&6)&&Ft()}}function yu(){Ne=Sn.current,W(Sn)}function Kt(e,t){e.finishedWork=null,e.finishedLanes=0;var n=e.timeoutHandle;if(n!==-1&&(e.timeoutHandle=-1,Op(n)),ne!==null)for(n=ne.return;n!==null;){var r=n;switch(qi(r),r.tag){case 1:r=r.type.childContextTypes,r!=null&&xo();break;case 3:Mn(),W(ke),W(me),uu();break;case 5:iu(r);break;case 4:Mn();break;case 13:W(X);break;case 19:W(X);break;case 10:nu(r.type._context);break;case 22:case 23:yu()}n=n.return}if(ue=e,ne=e=Ot(e.current,null),se=Ne=t,oe=0,Er=null,hu=Wo=qt=0,xe=ur=null,Ht!==null){for(t=0;t<Ht.length;t++)if(n=Ht[t],r=n.interleaved,r!==null){n.interleaved=null;var o=r.next,l=n.pending;if(l!==null){var i=l.next;l.next=o,r.next=i}n.pending=r}Ht=null}return e}function od(e,t){do{var n=ne;try{if(tu(),ro.current=jo,zo){for(var r=G.memoizedState;r!==null;){var o=r.queue;o!==null&&(o.pending=null),r=r.next}zo=!1}if(Jt=0,ie=re=G=null,lr=!1,Sr=0,mu.current=null,n===null||n.return===null){oe=1,Er=t,ne=null;break}e:{var l=e,i=n.return,u=n,a=t;if(t=se,u.flags|=32768,a!==null&&typeof a=="object"&&typeof a.then=="function"){var d=a,v=u,g=v.tag;if(!(v.mode&1)&&(g===0||g===11||g===15)){var h=v.alternate;h?(v.updateQueue=h.updateQueue,v.memoizedState=h.memoizedState,v.lanes=h.lanes):(v.updateQueue=null,v.memoizedState=null)}var S=Ta(i);if(S!==null){S.flags&=-257,La(S,i,u,l,t),S.mode&1&&Pa(l,d,t),t=S,a=d;var _=t.updateQueue;if(_===null){var k=new Set;k.add(a),t.updateQueue=k}else _.add(a);break e}else{if(!(t&1)){Pa(l,d,t),xu();break e}a=Error(w(426))}}else if(Y&&u.mode&1){var L=Ta(i);if(L!==null){!(L.flags&65536)&&(L.flags|=256),La(L,i,u,l,t),Zi(Rn(a,u));break e}}l=a=Rn(a,u),oe!==4&&(oe=2),ur===null?ur=[l]:ur.push(l),l=i;do{switch(l.tag){case 3:l.flags|=65536,t&=-t,l.lanes|=t;var f=bc(l,a,t);_a(l,f);break e;case 1:u=a;var c=l.type,m=l.stateNode;if(!(l.flags&128)&&(typeof c.getDerivedStateFromError=="function"||m!==null&&typeof m.componentDidCatch=="function"&&(Tt===null||!Tt.has(m)))){l.flags|=65536,t&=-t,l.lanes|=t;var x=Bc(l,u,t);_a(l,x);break e}}l=l.return}while(l!==null)}ud(n)}catch(E){t=E,ne===n&&n!==null&&(ne=n=n.return);continue}break}while(1)}function ld(){var e=Po.current;return Po.current=jo,e===null?jo:e}function xu(){(oe===0||oe===3||oe===2)&&(oe=4),ue===null||!(qt&268435455)&&!(Wo&268435455)||St(ue,se)}function Oo(e,t){var n=U;U|=2;var r=ld();(ue!==e||se!==t)&&(ut=null,Kt(e,t));do try{rm();break}catch(o){od(e,o)}while(1);if(tu(),U=n,Po.current=r,ne!==null)throw Error(w(261));return ue=null,se=0,oe}function rm(){for(;ne!==null;)id(ne)}function om(){for(;ne!==null&&!Pf();)id(ne)}function id(e){var t=sd(e.alternate,e,Ne);e.memoizedProps=e.pendingProps,t===null?ud(e):ne=t,mu.current=null}function ud(e){var t=e;do{var n=t.alternate;if(e=t.return,t.flags&32768){if(n=Jp(n,t),n!==null){n.flags&=32767,ne=n;return}if(e!==null)e.flags|=32768,e.subtreeFlags=0,e.deletions=null;else{oe=6,ne=null;return}}else if(n=Gp(n,t,Ne),n!==null){ne=n;return}if(t=t.sibling,t!==null){ne=t;return}ne=t=e}while(t!==null);oe===0&&(oe=5)}function Vt(e,t,n){var r=b,o=Ae.transition;try{Ae.transition=null,b=1,lm(e,t,n,r)}finally{Ae.transition=o,b=r}return null}function lm(e,t,n,r){do jn();while(Ct!==null);if(U&6)throw Error(w(327));n=e.finishedWork;var o=e.finishedLanes;if(n===null)return null;if(e.finishedWork=null,e.finishedLanes=0,n===e.current)throw Error(w(177));e.callbackNode=null,e.callbackPriority=0;var l=n.lanes|n.childLanes;if(Af(e,l),e===ue&&(ne=ue=null,se=0),!(n.subtreeFlags&2064)&&!(n.flags&2064)||Yr||(Yr=!0,cd(po,function(){return jn(),null})),l=(n.flags&15990)!==0,n.subtreeFlags&15990||l){l=Ae.transition,Ae.transition=null;var i=b;b=1;var u=U;U|=4,mu.current=null,Zp(e,n),td(n,e),Ep(ui),ho=!!ii,ui=ii=null,e.current=n,em(n),Tf(),U=u,b=i,Ae.transition=l}else e.current=n;if(Yr&&(Yr=!1,Ct=e,Lo=o),l=e.pendingLanes,l===0&&(Tt=null),If(n.stateNode),_e(e,te()),t!==null)for(r=e.onRecoverableError,n=0;n<t.length;n++)o=t[n],r(o.value,{componentStack:o.stack,digest:o.digest});if(To)throw To=!1,e=zi,zi=null,e;return Lo&1&&e.tag!==0&&jn(),l=e.pendingLanes,l&1?e===ji?ar++:(ar=0,ji=e):ar=0,Ft(),null}function jn(){if(Ct!==null){var e=bs(Lo),t=Ae.transition,n=b;try{if(Ae.transition=null,b=16>e?16:e,Ct===null)var r=!1;else{if(e=Ct,Ct=null,Lo=0,U&6)throw Error(w(331));var o=U;for(U|=4,z=e.current;z!==null;){var l=z,i=l.child;if(z.flags&16){var u=l.deletions;if(u!==null){for(var a=0;a<u.length;a++){var d=u[a];for(z=d;z!==null;){var v=z;switch(v.tag){case 0:case 11:case 15:ir(8,v,l)}var g=v.child;if(g!==null)g.return=v,z=g;else for(;z!==null;){v=z;var h=v.sibling,S=v.return;if(qc(v),v===d){z=null;break}if(h!==null){h.return=S,z=h;break}z=S}}}var _=l.alternate;if(_!==null){var k=_.child;if(k!==null){_.child=null;do{var L=k.sibling;k.sibling=null,k=L}while(k!==null)}}z=l}}if(l.subtreeFlags&2064&&i!==null)i.return=l,z=i;else e:for(;z!==null;){if(l=z,l.flags&2048)switch(l.tag){case 0:case 11:case 15:ir(9,l,l.return)}var f=l.sibling;if(f!==null){f.return=l.return,z=f;break e}z=l.return}}var c=e.current;for(z=c;z!==null;){i=z;var m=i.child;if(i.subtreeFlags&2064&&m!==null)m.return=i,z=m;else e:for(i=c;z!==null;){if(u=z,u.flags&2048)try{switch(u.tag){case 0:case 11:case 15:Ho(9,u)}}catch(E){ee(u,u.return,E)}if(u===i){z=null;break e}var x=u.sibling;if(x!==null){x.return=u.return,z=x;break e}z=u.return}}if(U=o,Ft(),et&&typeof et.onPostCommitFiberRoot=="function")try{et.onPostCommitFiberRoot(Fo,e)}catch{}r=!0}return r}finally{b=n,Ae.transition=t}}return!1}function Qa(e,t,n){t=Rn(n,t),t=bc(e,t,1),e=Pt(e,t,1),t=ge(),e!==null&&(zr(e,1,t),_e(e,t))}function ee(e,t,n){if(e.tag===3)Qa(e,e,n);else for(;t!==null;){if(t.tag===3){Qa(t,e,n);break}else if(t.tag===1){var r=t.stateNode;if(typeof t.type.getDerivedStateFromError=="function"||typeof r.componentDidCatch=="function"&&(Tt===null||!Tt.has(r))){e=Rn(n,e),e=Bc(t,e,1),t=Pt(t,e,1),e=ge(),t!==null&&(zr(t,1,e),_e(t,e));break}}t=t.return}}function im(e,t,n){var r=e.pingCache;r!==null&&r.delete(t),t=ge(),e.pingedLanes|=e.suspendedLanes&n,ue===e&&(se&n)===n&&(oe===4||oe===3&&(se&130023424)===se&&500>te()-gu?Kt(e,0):hu|=n),_e(e,t)}function ad(e,t){t===0&&(e.mode&1?(t=$r,$r<<=1,!($r&130023424)&&($r=4194304)):t=1);var n=ge();e=mt(e,t),e!==null&&(zr(e,t,n),_e(e,n))}function um(e){var t=e.memoizedState,n=0;t!==null&&(n=t.retryLane),ad(e,n)}function am(e,t){var n=0;switch(e.tag){case 13:var r=e.stateNode,o=e.memoizedState;o!==null&&(n=o.retryLane);break;case 19:r=e.stateNode;break;default:throw Error(w(314))}r!==null&&r.delete(t),ad(e,n)}var sd;sd=function(e,t,n){if(e!==null)if(e.memoizedProps!==t.pendingProps||ke.current)we=!0;else{if(!(e.lanes&n)&&!(t.flags&128))return we=!1,Xp(e,t,n);we=!!(e.flags&131072)}else we=!1,Y&&t.flags&1048576&&pc(t,So,t.index);switch(t.lanes=0,t.tag){case 2:var r=t.type;lo(e,t),e=t.pendingProps;var o=Ln(t,me.current);zn(t,n),o=su(null,t,r,e,o,n);var l=cu();return t.flags|=1,typeof o=="object"&&o!==null&&typeof o.render=="function"&&o.$$typeof===void 0?(t.tag=1,t.memoizedState=null,t.updateQueue=null,Se(r)?(l=!0,wo(t)):l=!1,t.memoizedState=o.state!==null&&o.state!==void 0?o.state:null,ou(t),o.updater=Qo,t.stateNode=o,o._reactInternals=t,gi(t,r,e,n),t=xi(null,t,r,!0,l,n)):(t.tag=0,Y&&l&&Ji(t),he(null,t,o,n),t=t.child),t;case 16:r=t.elementType;e:{switch(lo(e,t),e=t.pendingProps,o=r._init,r=o(r._payload),t.type=r,o=t.tag=cm(r),e=He(r,e),o){case 0:t=yi(null,t,r,e,n);break e;case 1:t=Ma(null,t,r,e,n);break e;case 11:t=Oa(null,t,r,e,n);break e;case 14:t=Ia(null,t,r,He(r.type,e),n);break e}throw Error(w(306,r,""))}return t;case 0:return r=t.type,o=t.pendingProps,o=t.elementType===r?o:He(r,o),yi(e,t,r,o,n);case 1:return r=t.type,o=t.pendingProps,o=t.elementType===r?o:He(r,o),Ma(e,t,r,o,n);case 3:e:{if(Wc(t),e===null)throw Error(w(387));r=t.pendingProps,l=t.memoizedState,o=l.element,xc(e,t),Eo(t,r,null,n);var i=t.memoizedState;if(r=i.element,l.isDehydrated)if(l={element:r,isDehydrated:!1,cache:i.cache,pendingSuspenseBoundaries:i.pendingSuspenseBoundaries,transitions:i.transitions},t.updateQueue.baseState=l,t.memoizedState=l,t.flags&256){o=Rn(Error(w(423)),t),t=Ra(e,t,r,n,o);break e}else if(r!==o){o=Rn(Error(w(424)),t),t=Ra(e,t,r,n,o);break e}else for(ze=jt(t.stateNode.containerInfo.firstChild),je=t,Y=!0,Ke=null,n=vc(t,null,r,n),t.child=n;n;)n.flags=n.flags&-3|4096,n=n.sibling;else{if(On(),r===o){t=ht(e,t,n);break e}he(e,t,r,n)}t=t.child}return t;case 5:return wc(t),e===null&&pi(t),r=t.type,o=t.pendingProps,l=e!==null?e.memoizedProps:null,i=o.children,ai(r,o)?i=null:l!==null&&ai(r,l)&&(t.flags|=32),Hc(e,t),he(e,t,i,n),t.child;case 6:return e===null&&pi(t),null;case 13:return Kc(e,t,n);case 4:return lu(t,t.stateNode.containerInfo),r=t.pendingProps,e===null?t.child=In(t,null,r,n):he(e,t,r,n),t.child;case 11:return r=t.type,o=t.pendingProps,o=t.elementType===r?o:He(r,o),Oa(e,t,r,o,n);case 7:return he(e,t,t.pendingProps,n),t.child;case 8:return he(e,t,t.pendingProps.children,n),t.child;case 12:return he(e,t,t.pendingProps.children,n),t.child;case 10:e:{if(r=t.type._context,o=t.pendingProps,l=t.memoizedProps,i=o.value,Q(_o,r._currentValue),r._currentValue=i,l!==null)if(Ge(l.value,i)){if(l.children===o.children&&!ke.current){t=ht(e,t,n);break e}}else for(l=t.child,l!==null&&(l.return=t);l!==null;){var u=l.dependencies;if(u!==null){i=l.child;for(var a=u.firstContext;a!==null;){if(a.context===r){if(l.tag===1){a=dt(-1,n&-n),a.tag=2;var d=l.updateQueue;if(d!==null){d=d.shared;var v=d.pending;v===null?a.next=a:(a.next=v.next,v.next=a),d.pending=a}}l.lanes|=n,a=l.alternate,a!==null&&(a.lanes|=n),mi(l.return,n,t),u.lanes|=n;break}a=a.next}}else if(l.tag===10)i=l.type===t.type?null:l.child;else if(l.tag===18){if(i=l.return,i===null)throw Error(w(341));i.lanes|=n,u=i.alternate,u!==null&&(u.lanes|=n),mi(i,n,t),i=l.sibling}else i=l.child;if(i!==null)i.return=l;else for(i=l;i!==null;){if(i===t){i=null;break}if(l=i.sibling,l!==null){l.return=i.return,i=l;break}i=i.return}l=i}he(e,t,o.children,n),t=t.child}return t;case 9:return o=t.type,r=t.pendingProps.children,zn(t,n),o=Ue(o),r=r(o),t.flags|=1,he(e,t,r,n),t.child;case 14:return r=t.type,o=He(r,t.pendingProps),o=He(r.type,o),Ia(e,t,r,o,n);case 15:return Vc(e,t,t.type,t.pendingProps,n);case 17:return r=t.type,o=t.pendingProps,o=t.elementType===r?o:He(r,o),lo(e,t),t.tag=1,Se(r)?(e=!0,wo(t)):e=!1,zn(t,n),Uc(t,r,o),gi(t,r,o,n),xi(null,t,r,!0,e,n);case 19:return Yc(e,t,n);case 22:return Qc(e,t,n)}throw Error(w(156,t.tag))};function cd(e,t){return Fs(e,t)}function sm(e,t,n,r){this.tag=e,this.key=n,this.sibling=this.child=this.return=this.stateNode=this.type=this.elementType=null,this.index=0,this.ref=null,this.pendingProps=t,this.dependencies=this.memoizedState=this.updateQueue=this.memoizedProps=null,this.mode=r,this.subtreeFlags=this.flags=0,this.deletions=null,this.childLanes=this.lanes=0,this.alternate=null}function De(e,t,n,r){return new sm(e,t,n,r)}function wu(e){return e=e.prototype,!(!e||!e.isReactComponent)}function cm(e){if(typeof e=="function")return wu(e)?1:0;if(e!=null){if(e=e.$$typeof,e===Ai)return 11;if(e===Ui)return 14}return 2}function Ot(e,t){var n=e.alternate;return n===null?(n=De(e.tag,t,e.key,e.mode),n.elementType=e.elementType,n.type=e.type,n.stateNode=e.stateNode,n.alternate=e,e.alternate=n):(n.pendingProps=t,n.type=e.type,n.flags=0,n.subtreeFlags=0,n.deletions=null),n.flags=e.flags&14680064,n.childLanes=e.childLanes,n.lanes=e.lanes,n.child=e.child,n.memoizedProps=e.memoizedProps,n.memoizedState=e.memoizedState,n.updateQueue=e.updateQueue,t=e.dependencies,n.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext},n.sibling=e.sibling,n.index=e.index,n.ref=e.ref,n}function ao(e,t,n,r,o,l){var i=2;if(r=e,typeof e=="function")wu(e)&&(i=1);else if(typeof e=="string")i=5;else e:switch(e){case fn:return Yt(n.children,o,l,t);case $i:i=8,o|=8;break;case Ul:return e=De(12,n,t,o|2),e.elementType=Ul,e.lanes=l,e;case bl:return e=De(13,n,t,o),e.elementType=bl,e.lanes=l,e;case Bl:return e=De(19,n,t,o),e.elementType=Bl,e.lanes=l,e;case ws:return Ko(n,o,l,t);default:if(typeof e=="object"&&e!==null)switch(e.$$typeof){case ys:i=10;break e;case xs:i=9;break e;case Ai:i=11;break e;case Ui:i=14;break e;case xt:i=16,r=null;break e}throw Error(w(130,e==null?e:typeof e,""))}return t=De(i,n,t,o),t.elementType=e,t.type=r,t.lanes=l,t}function Yt(e,t,n,r){return e=De(7,e,r,t),e.lanes=n,e}function Ko(e,t,n,r){return e=De(22,e,r,t),e.elementType=ws,e.lanes=n,e.stateNode={isHidden:!1},e}function Dl(e,t,n){return e=De(6,e,null,t),e.lanes=n,e}function Fl(e,t,n){return t=De(4,e.children!==null?e.children:[],e.key,t),t.lanes=n,t.stateNode={containerInfo:e.containerInfo,pendingChildren:null,implementation:e.implementation},t}function dm(e,t,n,r,o){this.tag=t,this.containerInfo=e,this.finishedWork=this.pingCache=this.current=this.pendingChildren=null,this.timeoutHandle=-1,this.callbackNode=this.pendingContext=this.context=null,this.callbackPriority=0,this.eventTimes=vl(0),this.expirationTimes=vl(-1),this.entangledLanes=this.finishedLanes=this.mutableReadLanes=this.expiredLanes=this.pingedLanes=this.suspendedLanes=this.pendingLanes=0,this.entanglements=vl(0),this.identifierPrefix=r,this.onRecoverableError=o,this.mutableSourceEagerHydrationData=null}function ku(e,t,n,r,o,l,i,u,a){return e=new dm(e,t,n,u,a),t===1?(t=1,l===!0&&(t|=8)):t=0,l=De(3,null,null,t),e.current=l,l.stateNode=e,l.memoizedState={element:r,isDehydrated:n,cache:null,transitions:null,pendingSuspenseBoundaries:null},ou(l),e}function fm(e,t,n){var r=3<arguments.length&&arguments[3]!==void 0?arguments[3]:null;return{$$typeof:dn,key:r==null?null:""+r,children:e,containerInfo:t,implementation:n}}function dd(e){if(!e)return Mt;e=e._reactInternals;e:{if(tn(e)!==e||e.tag!==1)throw Error(w(170));var t=e;do{switch(t.tag){case 3:t=t.stateNode.context;break e;case 1:if(Se(t.type)){t=t.stateNode.__reactInternalMemoizedMergedChildContext;break e}}t=t.return}while(t!==null);throw Error(w(171))}if(e.tag===1){var n=e.type;if(Se(n))return dc(e,n,t)}return t}function fd(e,t,n,r,o,l,i,u,a){return e=ku(n,r,!0,e,o,l,i,u,a),e.context=dd(null),n=e.current,r=ge(),o=Lt(n),l=dt(r,o),l.callback=t??null,Pt(n,l,o),e.current.lanes=o,zr(e,o,r),_e(e,r),e}function Yo(e,t,n,r){var o=t.current,l=ge(),i=Lt(o);return n=dd(n),t.context===null?t.context=n:t.pendingContext=n,t=dt(l,i),t.payload={element:e},r=r===void 0?null:r,r!==null&&(t.callback=r),e=Pt(o,t,i),e!==null&&(Xe(e,o,i,l),no(e,o,i)),i}function Io(e){if(e=e.current,!e.child)return null;switch(e.child.tag){case 5:return e.child.stateNode;default:return e.child.stateNode}}function Ha(e,t){if(e=e.memoizedState,e!==null&&e.dehydrated!==null){var n=e.retryLane;e.retryLane=n!==0&&n<t?n:t}}function Su(e,t){Ha(e,t),(e=e.alternate)&&Ha(e,t)}function pm(){return null}var pd=typeof reportError=="function"?reportError:function(e){console.error(e)};function _u(e){this._internalRoot=e}Xo.prototype.render=_u.prototype.render=function(e){var t=this._internalRoot;if(t===null)throw Error(w(409));Yo(e,t,null,null)};Xo.prototype.unmount=_u.prototype.unmount=function(){var e=this._internalRoot;if(e!==null){this._internalRoot=null;var t=e.containerInfo;Zt(function(){Yo(null,e,null,null)}),t[pt]=null}};function Xo(e){this._internalRoot=e}Xo.prototype.unstable_scheduleHydration=function(e){if(e){var t=Qs();e={blockedOn:null,target:e,priority:t};for(var n=0;n<kt.length&&t!==0&&t<kt[n].priority;n++);kt.splice(n,0,e),n===0&&Ws(e)}};function Cu(e){return!(!e||e.nodeType!==1&&e.nodeType!==9&&e.nodeType!==11)}function Go(e){return!(!e||e.nodeType!==1&&e.nodeType!==9&&e.nodeType!==11&&(e.nodeType!==8||e.nodeValue!==" react-mount-point-unstable "))}function Wa(){}function mm(e,t,n,r,o){if(o){if(typeof r=="function"){var l=r;r=function(){var d=Io(i);l.call(d)}}var i=fd(t,r,e,0,null,!1,!1,"",Wa);return e._reactRootContainer=i,e[pt]=i.current,vr(e.nodeType===8?e.parentNode:e),Zt(),i}for(;o=e.lastChild;)e.removeChild(o);if(typeof r=="function"){var u=r;r=function(){var d=Io(a);u.call(d)}}var a=ku(e,0,!1,null,null,!1,!1,"",Wa);return e._reactRootContainer=a,e[pt]=a.current,vr(e.nodeType===8?e.parentNode:e),Zt(function(){Yo(t,a,n,r)}),a}function Jo(e,t,n,r,o){var l=n._reactRootContainer;if(l){var i=l;if(typeof o=="function"){var u=o;o=function(){var a=Io(i);u.call(a)}}Yo(t,i,e,o)}else i=mm(n,t,e,o,r);return Io(i)}Bs=function(e){switch(e.tag){case 3:var t=e.stateNode;if(t.current.memoizedState.isDehydrated){var n=qn(t.pendingLanes);n!==0&&(Vi(t,n|1),_e(t,te()),!(U&6)&&(Dn=te()+500,Ft()))}break;case 13:Zt(function(){var r=mt(e,1);if(r!==null){var o=ge();Xe(r,e,1,o)}}),Su(e,1)}};Qi=function(e){if(e.tag===13){var t=mt(e,134217728);if(t!==null){var n=ge();Xe(t,e,134217728,n)}Su(e,134217728)}};Vs=function(e){if(e.tag===13){var t=Lt(e),n=mt(e,t);if(n!==null){var r=ge();Xe(n,e,t,r)}Su(e,t)}};Qs=function(){return b};Hs=function(e,t){var n=b;try{return b=e,t()}finally{b=n}};ql=function(e,t,n){switch(t){case"input":if(Hl(e,n),t=n.name,n.type==="radio"&&t!=null){for(n=e;n.parentNode;)n=n.parentNode;for(n=n.querySelectorAll("input[name="+JSON.stringify(""+t)+'][type="radio"]'),t=0;t<n.length;t++){var r=n[t];if(r!==e&&r.form===e.form){var o=bo(r);if(!o)throw Error(w(90));Ss(r),Hl(r,o)}}}break;case"textarea":Cs(e,n);break;case"select":t=n.value,t!=null&&_n(e,!!n.multiple,t,!1)}};Ls=vu;Os=Zt;var hm={usingClientEntryPoint:!1,Events:[Pr,gn,bo,Ps,Ts,vu]},Xn={findFiberByHostInstance:Qt,bundleType:0,version:"18.3.1",rendererPackageName:"react-dom"},gm={bundleType:Xn.bundleType,version:Xn.version,rendererPackageName:Xn.rendererPackageName,rendererConfig:Xn.rendererConfig,overrideHookState:null,overrideHookStateDeletePath:null,overrideHookStateRenamePath:null,overrideProps:null,overridePropsDeletePath:null,overridePropsRenamePath:null,setErrorHandler:null,setSuspenseHandler:null,scheduleUpdate:null,currentDispatcherRef:gt.ReactCurrentDispatcher,findHostInstanceByFiber:function(e){return e=Rs(e),e===null?null:e.stateNode},findFiberByHostInstance:Xn.findFiberByHostInstance||pm,findHostInstancesForRefresh:null,scheduleRefresh:null,scheduleRoot:null,setRefreshHandler:null,getCurrentFiber:null,reconcilerVersion:"18.3.1-next-f1338f8080-20240426"};if(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__<"u"){var Xr=__REACT_DEVTOOLS_GLOBAL_HOOK__;if(!Xr.isDisabled&&Xr.supportsFiber)try{Fo=Xr.inject(gm),et=Xr}catch{}}Te.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=hm;Te.createPortal=function(e,t){var n=2<arguments.length&&arguments[2]!==void 0?arguments[2]:null;if(!Cu(t))throw Error(w(200));return fm(e,t,null,n)};Te.createRoot=function(e,t){if(!Cu(e))throw Error(w(299));var n=!1,r="",o=pd;return t!=null&&(t.unstable_strictMode===!0&&(n=!0),t.identifierPrefix!==void 0&&(r=t.identifierPrefix),t.onRecoverableError!==void 0&&(o=t.onRecoverableError)),t=ku(e,1,!1,null,null,n,!1,r,o),e[pt]=t.current,vr(e.nodeType===8?e.parentNode:e),new _u(t)};Te.findDOMNode=function(e){if(e==null)return null;if(e.nodeType===1)return e;var t=e._reactInternals;if(t===void 0)throw typeof e.render=="function"?Error(w(188)):(e=Object.keys(e).join(","),Error(w(268,e)));return e=Rs(t),e=e===null?null:e.stateNode,e};Te.flushSync=function(e){return Zt(e)};Te.hydrate=function(e,t,n){if(!Go(t))throw Error(w(200));return Jo(null,e,t,!0,n)};Te.hydrateRoot=function(e,t,n){if(!Cu(e))throw Error(w(405));var r=n!=null&&n.hydratedSources||null,o=!1,l="",i=pd;if(n!=null&&(n.unstable_strictMode===!0&&(o=!0),n.identifierPrefix!==void 0&&(l=n.identifierPrefix),n.onRecoverableError!==void 0&&(i=n.onRecoverableError)),t=fd(t,null,e,1,n??null,o,!1,l,i),e[pt]=t.current,vr(e),r)for(e=0;e<r.length;e++)n=r[e],o=n._getVersion,o=o(n._source),t.mutableSourceEagerHydrationData==null?t.mutableSourceEagerHydrationData=[n,o]:t.mutableSourceEagerHydrationData.push(n,o);return new Xo(t)};Te.render=function(e,t,n){if(!Go(t))throw Error(w(200));return Jo(null,e,t,!1,n)};Te.unmountComponentAtNode=function(e){if(!Go(e))throw Error(w(40));return e._reactRootContainer?(Zt(function(){Jo(null,null,e,!1,function(){e._reactRootContainer=null,e[pt]=null})}),!0):!1};Te.unstable_batchedUpdates=vu;Te.unstable_renderSubtreeIntoContainer=function(e,t,n,r){if(!Go(n))throw Error(w(200));if(e==null||e._reactInternals===void 0)throw Error(w(38));return Jo(e,t,n,!1,r)};Te.version="18.3.1-next-f1338f8080-20240426";function md(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>"u"||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!="function"))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(md)}catch(e){console.error(e)}}md(),ms.exports=Te;var vm=ms.exports,hd,Ka=vm;hd=Ka.createRoot,Ka.hydrateRoot;const Fe="https://zdvxowpuklbypweyqqki.supabase.co",Mo="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpkdnhvd3B1a2xieXB3ZXlxcWtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5NjI1MzcsImV4cCI6MjA2NjUzODUzN30.noYknWBDdtSkrLuYPRvb_P4-BbAH4qV4ya8bQQp9ijs",Ro="motoflow_quote_extension_session";async function $e(e,t){const n=await fetch(e,t),r=await n.json().catch(()=>null);if(!n.ok){const o=(r==null?void 0:r.message)||(r==null?void 0:r.error_description)||(r==null?void 0:r.error)||n.statusText;throw new Error(o)}return r}function nn(){const e=Eu();if(!(e!=null&&e.access_token))throw new Error("Conecta tu usuario de Motoflow.");return{apikey:Mo,Authorization:`Bearer ${e.access_token}`,"Content-Type":"application/json"}}async function Ya(e){const t=typeof e=="string"?{query:e}:e||{},n=t.query||"",r=t.limit||12,o=t.offset||0,l=t.marca||null,i=t.modelo||null,u=t.includeZeroStock!==!1,a=Eu(),d=(a==null?void 0:a.access_token)||Mo;return $e(`${Fe}/rest/v1/rpc/get_productos_paginados`,{method:"POST",headers:{apikey:Mo,Authorization:`Bearer ${d}`,"Content-Type":"application/json"},body:JSON.stringify({p_limit:r,p_offset:o,p_search_term:n,p_marca_filter:l,p_modelo_filter:i,p_include_zero_stock:u})})}function Eu(){try{const e=window.localStorage.getItem(Ro);if(!e)return null;const t=JSON.parse(e);return t!=null&&t.access_token?t.expires_at&&t.expires_at*1e3<Date.now()?(window.localStorage.removeItem(Ro),null):t:null}catch{return null}}async function ym(e,t){const n=await $e(`${Fe}/auth/v1/token?grant_type=password`,{method:"POST",headers:{apikey:Mo,"Content-Type":"application/json"},body:JSON.stringify({email:e,password:t})});return window.localStorage.setItem(Ro,JSON.stringify(n)),n}function xm(){window.localStorage.removeItem(Ro)}async function wm(e){const t=nn(),n=String(e||"").trim();if(!n)return[];const r=[`nombre.ilike.*${n}*`,`telefono.ilike.*${n}*`,`rnc.ilike.*${n}*`,`codigo.ilike.*${n}*`].join(","),o=new URL(`${Fe}/rest/v1/clientes`);return o.searchParams.set("select","id,nombre,telefono,rnc,codigo"),o.searchParams.set("activo","eq.true"),o.searchParams.set("or",`(${r})`),o.searchParams.set("order","nombre.asc"),o.searchParams.set("limit","8"),$e(o.toString(),{headers:t})}async function km(){const e=nn(),t=new URL(`${Fe}/rest/v1/vendedores`);return t.searchParams.set("select","id,nombre"),t.searchParams.set("activo","eq.true"),t.searchParams.set("order","nombre.asc"),$e(t.toString(),{headers:e})}async function Sm(){const e=nn();return $e(`${Fe}/rest/v1/rpc/get_clientes_morosos`,{method:"POST",headers:e,body:"{}"})}async function _m({clienteId:e,telefono:t}){if(!e)throw new Error("cliente_id es requerido.");const n=nn();return $e(`${Fe}/rest/v1/rpc/set_cliente_telefono`,{method:"POST",headers:n,body:JSON.stringify({p_cliente_id:e,p_telefono:t||null})})}async function Cm({clienteId:e,estado:t,fecha:n,nota:r}){if(!e)throw new Error("cliente_id es requerido.");const o=nn();return $e(`${Fe}/rest/v1/rpc/set_cobranza_seguimiento`,{method:"POST",headers:o,body:JSON.stringify({p_cliente_id:e,p_estado:t||"pendiente",p_fecha:n||null,p_nota:r||null})})}async function Em(e){const t=nn(),n=await $e(`${Fe}/rest/v1/rpc/get_next_cotizacion_numero`,{method:"POST",headers:t,body:"{}"}),r=await $e(`${Fe}/auth/v1/user`,{headers:t}),o={numero:n,fecha_cotizacion:e.fecha_cotizacion,fecha_vencimiento:e.fecha_vencimiento,cliente_id:e.cliente_id,subtotal:e.subtotal,descuento_total:e.descuento_total||0,itbis_total:e.itbis_total,total_cotizacion:e.total_cotizacion,estado:"Facturando",notas:e.notas||null,usuario_id:(r==null?void 0:r.id)||null,vendedor_id:e.vendedor_id||null,manual_cliente_nombre:e.manual_cliente_nombre||null},[l]=await $e(`${Fe}/rest/v1/cotizaciones?select=*`,{method:"POST",headers:{...t,Prefer:"return=representation"},body:JSON.stringify(o)}),i=e.detalles.map(u=>({...u,cotizacion_id:l.id}));return await $e(`${Fe}/rest/v1/cotizaciones_detalle`,{method:"POST",headers:t,body:JSON.stringify(i)}),l}async function Nm(e){const t=nn(),n={source:"whatsapp_web_extension",event_type:e.event_type,cliente_id:e.cliente_id||null,vendedor_id:e.vendedor_id||null,cotizacion_id:e.cotizacion_id||null,chat_id:e.chat_id||null,chat_name:e.chat_name||null,customer_name:e.customer_name||null,customer_phone:e.customer_phone||null,status:e.status||null,note:e.note||null,quote_total:e.quote_total||0,items:e.items||[],metadata:e.metadata||{}};return $e(`${Fe}/rest/v1/crm_whatsapp_conversation_events`,{method:"POST",headers:t,body:JSON.stringify(n)})}function Pn(e){return String(e||"").replace(/\s+/g," ").trim()}function Xa(e){return new Promise(t=>window.setTimeout(t,e))}function Ga(){var i,u;const e=document.querySelector("header"),t=((i=e==null?void 0:e.querySelector("[title]"))==null?void 0:i.getAttribute("title"))||((u=e==null?void 0:e.querySelector('span[dir="auto"]'))==null?void 0:u.textContent)||"",n=Pn(t),r=Pn(window.location.pathname),o=Pn(window.location.hash);return{id:n||o||r||"whatsapp-web",name:n}}function zm(){const e=Array.from(document.querySelectorAll('[contenteditable="true"]'));return e.find(t=>t.getAttribute("data-tab")==="10")||e.find(t=>t.getAttribute("role")==="textbox")||e[e.length-1]||null}async function Ja(e){const t=zm();if(!t)return!1;t.focus();const n=Pn(t.textContent),r=new DataTransfer;r.setData("text/plain",e),t.dispatchEvent(new ClipboardEvent("paste",{bubbles:!0,cancelable:!0,clipboardData:r})),await Xa(120);const o=Pn(t.textContent);if(o&&o!==n)return!0;document.execCommand("insertText",!1,e),await Xa(60);const l=Pn(t.textContent);return(!l||l===n)&&(t.textContent=e,t.dispatchEvent(new InputEvent("input",{bubbles:!0,inputType:"insertText",data:e}))),!0}const Ie=new Intl.NumberFormat("es-DO",{style:"currency",currency:"DOP",minimumFractionDigits:2}),jm=new Intl.NumberFormat("es-DO",{minimumFractionDigits:2,maximumFractionDigits:2}),Pm="Hola {NOMBRE}. El estado de su cuenta en {EMPRESA} es el siguiente: cuotas atrasadas: {N} FACTURA: {FACTURAS}, MONTO ATRASADO: {MONTO} - Favor pagar a mas tardar entre las proximas 48 horas y evitar cargos adicionales, este es un mensaje automatico del sistema. Gracias.";function Tm(e){const t=(e==null?void 0:e.plantilla)&&e.plantilla.trim()||Pm,n=((e==null?void 0:e.facturas)||[]).map(o=>o.numero).join(", "),r={"{NOMBRE}":(e==null?void 0:e.cliente_nombre)||"","{EMPRESA}":(e==null?void 0:e.empresa_nombre)||"la empresa","{N}":String((e==null?void 0:e.cuotas_atrasadas)??0),"{FACTURAS}":n,"{MONTO}":jm.format(Number(e==null?void 0:e.total_atrasado)||0)};return t.replace(/\{NOMBRE\}|\{EMPRESA\}|\{N\}|\{FACTURAS\}|\{MONTO\}/g,o=>r[o]??o)}function Lm(e,t,n){return Tm({plantilla:n,empresa_nombre:t,cliente_nombre:e.cliente_nombre,cuotas_atrasadas:e.cuotas_atrasadas,total_atrasado:e.total_atrasado,facturas:e.facturas})}const cn="motoflow_pending_cobro",Om=[{key:"ir_a_buscar",label:"Ir a buscar"},{key:"cliente_vendra",label:"Cliente vendra"}];function Im(e){let t=String(e||"").replace(/\D/g,"");return t?(t.length===10&&(t="1"+t),t):""}const Mm="motoflow_quote_draft:",Rm="motoflow_quote_last_sent:",Dm="motoflow_quote_meta:",Fm="motoflow_quote_history:",$m=35,Am="2749fa36-3d7c-4bdf-ad61-df88eda8365a",Gr=[{key:"cotizado",label:"Cotizado"},{key:"confirmado",label:"Confirmado"},{key:"pendiente_pago",label:"Pendiente pago"},{key:"delivery",label:"Delivery"},{key:"perdido",label:"Perdido"}];function Z(e,t=0){const n=Number(e);return Number.isFinite(n)?n:t}function Um(e){const t=Z(e.precio??e.precio_venta??e.precio1,0),n=Z(e.itbis_pct,.18);return{lineId:`${e.id||e.codigo||Date.now()}-${Date.now()}`,productId:e.id,codigo:e.codigo||"",descripcion:e.descripcion||e.nombre||"Producto",precio:t,cantidad:1,itbisPct:n,existencia:Z(e.existencia,0),imagenUrl:e.imagen_url||""}}function qa(e){return`${Mm}${e.id||"sin-chat"}`}function gd(e){return`${Rm}${e.id||"sin-chat"}`}function vd(e){return`${Dm}${e.id||"sin-chat"}`}function yd(e){return`${Fm}${e.id||"sin-chat"}`}function Za(e){try{const t=window.localStorage.getItem(gd(e));return t?JSON.parse(t):null}catch{return null}}function $l(e){try{const t=window.localStorage.getItem(vd(e));return t?JSON.parse(t):{}}catch{return{}}}function es(e){try{const t=window.localStorage.getItem(yd(e));return t?JSON.parse(t):[]}catch{return[]}}function bm(e,t){window.localStorage.setItem(yd(e),JSON.stringify(t.slice(0,8)))}function Bm(e,t,n){return["Hola, esta es tu cotizacion:","",t.map(o=>{const l=Z(o.cantidad,1);return`${o.descripcion}  ${l} x ${Ie.format(o.precio)}`}).join(`
`),"",`Total: ${Ie.format(n.total)}`,"","Quedo atento para confirmar disponibilidad y entrega."].join(`
`)}function bt(e){return e.map(t=>({product_id:t.productId||null,codigo:t.codigo||"",descripcion:t.descripcion,cantidad:Z(t.cantidad,1),precio:Z(t.precio,0),itbis_pct:Z(t.itbisPct,.18),existencia:Z(t.existencia,0)}))}function Vm(){var Mu,Ru;const[e,t]=O.useState(!1),[n,r]=O.useState("cotizar"),[o,l]=O.useState(()=>Ga()),[i,u]=O.useState([]),[a,d]=O.useState(""),[v,g]=O.useState([]),[h,S]=O.useState(!1),[_,k]=O.useState(""),[L,f]=O.useState(()=>Eu()),[c,m]=O.useState(""),[x,E]=O.useState(""),[j,P]=O.useState(!1),[T,B]=O.useState(!1),[F,Ce]=O.useState(""),[nt,$t]=O.useState(""),[rn,qo]=O.useState(""),[At,Un]=O.useState(!0),[N,I]=O.useState([]),[R,K]=O.useState(!1),[q,Ut]=O.useState(!1),[Be,on]=O.useState(!1),[le,vt]=O.useState(()=>Za(o)),[ln,Zo]=O.useState(""),[Nu,un]=O.useState([]),[V,el]=O.useState(null),[bn,tl]=O.useState(""),[xd,zu]=O.useState([]),[nl,wd]=O.useState(""),[rt,rl]=O.useState(()=>$l(o).internalNote||""),[ot,ol]=O.useState(()=>$l(o).quoteStatus||"cotizado"),[ll,il]=O.useState(()=>es(o)),[ju,kd]=O.useState(!1),[lt,an]=O.useState(null),[Lr,Pu]=O.useState(!1),[Tu,Ve]=O.useState(""),[ul,Sd]=O.useState(""),[al,_d]=O.useState(null),Lu=O.useRef("");O.useEffect(()=>{const s=window.setInterval(()=>{const y=Ga();l(C=>C.id===y.id&&C.name===y.name?C:y)},900);return()=>window.clearInterval(s)},[]),O.useEffect(()=>{let s;try{s=window.localStorage.getItem(cn)}catch{return}if(!s)return;let y;try{y=JSON.parse(s)}catch{window.localStorage.removeItem(cn);return}if(!(y!=null&&y.text)||Date.now()-(y.ts||0)>9e4){window.localStorage.removeItem(cn);return}r("cobranza"),cl();let C=0,D=!1;const M=async()=>{if(D)return;C+=1,await Ja(y.text)?(window.localStorage.removeItem(cn),Ve("Recordatorio pegado en el chat. Revisa y presiona Enter para enviar.")):C<25?window.setTimeout(M,700):window.localStorage.removeItem(cn)},A=window.setTimeout(M,1800);return()=>{D=!0,window.clearTimeout(A)}},[]),O.useEffect(()=>{try{const s=window.localStorage.getItem(qa(o)),y=$l(o);u(s?JSON.parse(s):[]),vt(Za(o)),il(es(o)),rl(y.internalNote||""),ol(y.quoteStatus||"cotizado")}catch{u([]),vt(null),il([]),rl(""),ol("cotizado")}},[o.id]),O.useEffect(()=>{try{window.localStorage.setItem(qa(o),JSON.stringify(i))}catch{}},[o.id,i]),O.useEffect(()=>{try{window.localStorage.setItem(vd(o),JSON.stringify({internalNote:rt,quoteStatus:ot}))}catch{}},[o.id,rt,ot]),O.useEffect(()=>{const s=a.trim();if(s.length<2){g([]);return}let y=!0;return S(!0),Ya(s).then(C=>{y&&g(C)}).catch(C=>{y&&(k(C.message||"No se pudo buscar productos."),g([]))}).finally(()=>{y&&S(!1)}),()=>{y=!1}},[a,L==null?void 0:L.access_token]),O.useEffect(()=>{if(!T||!L)return;let s=!0;return K(!0),Ya({query:F.trim(),marca:nt.trim(),modelo:rn.trim(),includeZeroStock:At,limit:$m,offset:0}).then(y=>{s&&I(y)}).catch(y=>{s&&(k(y.message||"No se pudo buscar productos."),I([]))}).finally(()=>{s&&K(!1)}),()=>{s=!1}},[T,F,nt,rn,At,L==null?void 0:L.access_token]),O.useEffect(()=>{L&&km().then(s=>zu(s||[])).catch(()=>zu([]))},[L==null?void 0:L.access_token]),O.useEffect(()=>{o.name&&(Zo(s=>s||o.name),/[\d+() -]{7,}/.test(o.name)&&tl(s=>s||o.name))},[o.name]),O.useEffect(()=>{if(!L||V){un([]);return}const s=ln.trim();if(s.length<2){un([]);return}let y=!0;return wm(s).then(C=>{y&&un(C||[])}).catch(()=>{y&&un([])}),()=>{y=!1}},[ln,V==null?void 0:V.id,L==null?void 0:L.access_token]);const Oe=O.useMemo(()=>i.reduce((s,y)=>{const D=Z(y.cantidad,1)*Z(y.precio,0),M=Z(y.itbisPct,0),A=M>0?D/(1+M):D,Ee=D-A;return s.subtotal+=A,s.tax+=Ee,s.total+=D,s},{subtotal:0,tax:0,total:0}),[i]);i.reduce((s,y)=>s+Z(y.cantidad,0),0);function sl(s){const y=Um(s);u(C=>[...C,y]),it("product_added",{items:bt([y]),quote_total:Oe.total+y.cantidad*y.precio}),d(""),g([]),B(!1),k("")}function Ou(s,y){u(C=>C.map(D=>D.lineId===s?{...D,...y}:D))}function Cd(s){const y=i.find(C=>C.lineId===s);u(C=>C.filter(D=>D.lineId!==s)),y&&it("product_removed",{items:bt([y])})}function it(s,y={}){L!=null&&L.access_token&&Nm({event_type:s,chat_id:o.id,chat_name:o.name,cliente_id:(V==null?void 0:V.id)||null,vendedor_id:nl||null,customer_name:(V==null?void 0:V.nombre)||ln||o.name||null,customer_phone:bn||(V==null?void 0:V.telefono)||null,status:ot,note:rt,quote_total:Oe.total,items:bt(i),...y,metadata:{selected_customer:V?{id:V.id,nombre:V.nombre,telefono:V.telefono||null}:null,...y.metadata}}).catch(C=>{console.debug("[Motoflow WhatsApp] No se pudo guardar evento:",C.message)})}function Ed(s){var C;ol(s);const y=((C=Gr.find(D=>D.key===s))==null?void 0:C.label)||s;it("status_changed",{status:s,metadata:{status_label:y}})}function Nd(){rt.trim()&&it("internal_note_saved",{note:rt.trim()})}function zd(){var s;(s=le==null?void 0:le.lines)!=null&&s.length&&(u(le.lines.map(y=>({...y,lineId:`${y.productId||y.codigo||"line"}-${Date.now()}-${Math.random().toString(16).slice(2)}`}))),it("quote_restored",{quote_total:le.total||0,items:bt(le.lines)}),k("Ultima cotizacion recuperada. Puedes agregar, quitar o cambiar cantidades."))}function jd(s){var y;(y=s==null?void 0:s.lines)!=null&&y.length&&(u(s.lines.map(C=>({...C,lineId:`${C.productId||C.codigo||"line"}-${Date.now()}-${Math.random().toString(16).slice(2)}`}))),it("quote_restored",{quote_total:s.total||0,items:bt(s.lines),metadata:{restored_from_history:!0}}),k(`Cotizacion recuperada del historial: ${Ie.format(s.total||0)}.`))}function Pd(s){const C=[{...s,id:`${Date.now()}-${Math.random().toString(16).slice(2)}`,status:ot,note:rt},...ll].slice(0,8);window.localStorage.setItem(gd(o),JSON.stringify(s)),bm(o,C),vt(s),il(C)}async function Td(){if(!q){if(!i.length){k("Agrega al menos un producto antes de crear la cotizacion.");return}Ut(!0);try{const s=Bm(o,i,Oe);if(await Ja(s)){const C={sentAt:new Date().toISOString(),lines:i,total:Oe.total};Pd(C),it("quote_pasted",{quote_total:Oe.total,items:bt(i),metadata:{message_ready_for_manual_send:!0}}),u([]),g([]),d(""),B(!1),t(!0),k("")}else k("No encontre el cuadro de mensaje de WhatsApp.")}finally{window.setTimeout(()=>Ut(!1),900)}}}async function Ld(){var s;if(!Be){if(!i.length){k("Recupera o prepara una cotizacion antes de mandarla a facturar.");return}on(!0);try{const y=new Date,C=new Date(y);C.setDate(C.getDate()+7);const D=Ee=>Ee.toISOString().slice(0,10),M=i.map(Ee=>{const Du=Z(Ee.cantidad,1),Fu=Z(Ee.precio,0),$u=Z(Ee.itbisPct,.18),Or=Du*Fu,Vd=$u>0?Or/(1+$u):Or,Qd=Or-Vd;return{producto_id:Ee.productId,codigo:Ee.codigo||"",descripcion:Ee.descripcion,cantidad:Du,unidad:"UND",precio_unitario:Fu,descuento_pct:0,descuento_valor:0,itbis_valor:Qd,importe:Or}}),A=await Em({fecha_cotizacion:D(y),fecha_vencimiento:D(C),cliente_id:(V==null?void 0:V.id)||Am,manual_cliente_nombre:V!=null&&V.id?null:ln.trim()||o.name||"Cliente WhatsApp",vendedor_id:nl||null,subtotal:Oe.subtotal,descuento_total:0,itbis_total:Oe.tax,total_cotizacion:Oe.total,notas:["Cotizacion confirmada desde WhatsApp Web",o.name?`Chat: ${o.name}`:null,bn?`Telefono: ${bn}`:null,ot?`Estado: ${((s=Gr.find(Ee=>Ee.key===ot))==null?void 0:s.label)||ot}`:null,rt.trim()?`Nota interna: ${rt.trim()}`:null].filter(Boolean).join(" | "),detalles:M});it("quote_sent_to_invoice",{cotizacion_id:A.id,quote_total:Oe.total,items:bt(i),metadata:{cotizacion_numero:A.numero}}),k(`Lista para facturar en Motoflow: cotizacion ${A.numero}.`)}catch(y){k(y.message||"No se pudo mandar a facturar en Motoflow.")}finally{on(!1)}}}async function Od(s){s.preventDefault(),P(!0),k("");try{const y=await ym(c.trim(),x);f(y),E(""),k("Conectado a Motoflow. Ya puedes buscar productos.")}catch(y){k(y.message||"No se pudo iniciar sesion.")}finally{P(!1)}}function Id(){xm(),f(null),g([]),d(""),k("Sesion cerrada en la extension.")}function Md(s){el(s),Zo(s.nombre||""),tl(s.telefono||bn),un([])}function Rd(){el(null),un([])}function Dd(){r("cobranza"),cl()}async function cl(){var s;Pu(!0),Ve("");try{const y=await Sm();an(y),(s=y==null?void 0:y.clientes)!=null&&s.length||Ve("No hay clientes con facturas vencidas. Todo al dia.")}catch(y){Ve(y.message||"No se pudo cargar la lista de cobranza."),an(null)}finally{Pu(!1)}}function dl(s){return Cm({clienteId:s.cliente_id,estado:s.seg_estado||"pendiente",fecha:s.seg_fecha||null,nota:s.seg_nota||null}).catch(y=>{console.warn("[Motoflow] No se pudo guardar seguimiento:",y.message),Ve("No se pudo guardar el seguimiento. Reintenta.")})}function Fd(s,y){an(C=>C&&{...C,clientes:C.clientes.map(D=>D.cliente_id===s?{...D,cliente_telefono:y}:D)})}async function $d(s){try{await _m({clienteId:s.cliente_id,telefono:(s.cliente_telefono||"").trim()||null}),Ve(`Telefono de ${s.cliente_nombre} actualizado.`)}catch(y){console.warn("[Motoflow] No se pudo guardar telefono:",y.message),Ve("No se pudo guardar el telefono. Reintenta.")}}function Ad(s,y){an(C=>C&&{...C,clientes:C.clientes.map(D=>D.cliente_id===s?{...D,...y}:D)})}function Iu(s,y){an(C=>{if(!C)return C;const D=C.clientes.map(A=>A.cliente_id===s?{...A,...y}:A),M=D.find(A=>A.cliente_id===s);return M&&dl(M),{...C,clientes:D}})}function Ud(s,y){const C=s.seg_estado===y?"pendiente":y,D={seg_estado:C};C!=="cliente_vendra"&&(D.seg_fecha=null),Iu(s.cliente_id,D)}async function bd(s){await dl(s);const y=s.seg_fecha,C=new Date().toISOString().slice(0,10);y&&y>C?(an(D=>D&&{...D,clientes:D.clientes.filter(M=>M.cliente_id!==s.cliente_id)}),Ve(`${s.cliente_nombre} pospuesto. Reaparecera el ${y}.`)):Ve("Indica una fecha futura para posponer al cliente.")}async function Bd(s){if(al)return;const y=Im(s.cliente_telefono),C=Lm(s,lt==null?void 0:lt.empresa_nombre,lt==null?void 0:lt.plantilla);if(!y){try{await navigator.clipboard.writeText(C),Ve(`${s.cliente_nombre} no tiene telefono. Mensaje copiado al portapapeles.`)}catch{Ve(`${s.cliente_nombre} no tiene telefono registrado.`)}return}_d(s.cliente_id);try{window.localStorage.setItem(cn,JSON.stringify({phone:y,text:C,ts:Date.now()}))}catch{}it("cobro_reminder_pasted",{cliente_id:s.cliente_id,customer_name:s.cliente_nombre,customer_phone:s.cliente_telefono,metadata:{cuotas_atrasadas:s.cuotas_atrasadas,total_atrasado:s.total_atrasado,facturas:(s.facturas||[]).map(D=>D.numero),via:"lista_morosos"}}),window.location.href=`https://web.whatsapp.com/send?phone=${y}`}return e?p.jsx("button",{className:"mf-floating-button",type:"button",onClick:()=>t(!1),children:"Cotizar"}):p.jsxs("aside",{className:"mf-panel","aria-label":"Cotizacion WhatsApp",children:[p.jsxs("header",{className:"mf-header",children:[p.jsxs("div",{children:[p.jsx("p",{className:"mf-kicker",children:"Motoflow"}),p.jsx("h2",{children:"Cotizacion WhatsApp"}),p.jsx("p",{className:"mf-chat",children:o.name||"Chat actual"}),p.jsxs("div",{className:"mf-header-actions",children:[L&&p.jsxs(p.Fragment,{children:[p.jsx("span",{children:"Conectado"}),p.jsx("button",{className:"mf-logout-button",type:"button",onClick:Id,children:"Salir"})]}),p.jsx("button",{className:"mf-icon-button",type:"button",onClick:()=>t(!0),title:"Colapsar",children:"x"})]})]}),p.jsx("button",{className:"mf-icon-button",type:"button",onClick:()=>t(!0),title:"Colapsar",children:"×"})]}),L&&p.jsxs("nav",{className:"mf-tabs",children:[p.jsx("button",{className:`mf-tab-quote${n==="cotizar"?" is-active":""}`,type:"button",onClick:()=>r("cotizar"),children:"Cotizar"}),p.jsx("button",{className:`mf-tab-cobro${n==="cobranza"?" is-active":""}`,type:"button",onClick:Dd,children:"Ver deuda"})]}),!L&&p.jsxs("form",{className:"mf-login",onSubmit:Od,children:[p.jsx("strong",{children:"Conectar con Motoflow"}),p.jsx("p",{children:"Usa el mismo correo y clave del CRM para habilitar la busqueda."}),p.jsx("input",{autoComplete:"email",type:"email",value:c,onChange:s=>m(s.target.value),placeholder:"Correo",required:!0}),p.jsx("input",{autoComplete:"current-password",type:"password",value:x,onChange:s=>E(s.target.value),placeholder:"Clave",required:!0}),p.jsx("button",{type:"submit",disabled:j,children:j?"Conectando...":"Conectar"})]}),L&&n==="cotizar"&&p.jsxs("section",{className:"mf-motoflow-box",children:[p.jsxs("button",{className:"mf-motoflow-toggle",type:"button",onClick:()=>kd(s=>!s),children:[p.jsxs("span",{children:["Datos Motoflow",p.jsxs("small",{children:[(V==null?void 0:V.nombre)||ln||o.name||"Cliente sin asignar"," · ",((Mu=Gr.find(s=>s.key===ot))==null?void 0:Mu.label)||"Cotizado"]})]}),p.jsx("b",{children:ju?"Ocultar":"Editar"})]}),ju&&p.jsxs(p.Fragment,{children:[p.jsxs("div",{className:"mf-customer-box",children:[p.jsx("label",{htmlFor:"mf-customer-search",children:"Cliente para Motoflow"}),p.jsxs("div",{className:"mf-customer-row",children:[p.jsx("input",{id:"mf-customer-search",value:ln,onChange:s=>{Zo(s.target.value),el(null)},placeholder:"Nombre, telefono, RNC..."}),V&&p.jsx("button",{type:"button",onClick:Rd,title:"Cambiar cliente",children:"x"})]}),Nu.length>0&&p.jsx("div",{className:"mf-customer-results",children:Nu.map(s=>p.jsxs("button",{type:"button",onClick:()=>Md(s),children:[p.jsx("strong",{children:s.nombre}),p.jsx("small",{children:s.telefono||s.rnc||s.codigo||"Cliente registrado"})]},s.id))}),p.jsxs("div",{className:"mf-customer-grid",children:[p.jsx("input",{value:bn,onChange:s=>tl(s.target.value),placeholder:"Telefono"}),p.jsxs("select",{value:nl,onChange:s=>wd(s.target.value),children:[p.jsx("option",{value:"",children:"Vendedor"}),xd.map(s=>p.jsx("option",{value:s.id,children:s.nombre},s.id))]})]})]}),p.jsxs("div",{className:"mf-workflow-box",children:[p.jsx("label",{children:"Estado rapido"}),p.jsx("div",{className:"mf-status-grid",children:Gr.map(s=>p.jsx("button",{className:ot===s.key?"is-active":"",type:"button",onClick:()=>Ed(s.key),children:s.label},s.key))}),p.jsx("textarea",{value:rt,onChange:s=>rl(s.target.value),onBlur:Nd,placeholder:"Nota interna para Motoflow...",rows:"2"})]})]})]}),L&&n==="cobranza"&&(()=>{const s=(lt==null?void 0:lt.clientes)||[],y=ul.trim().toLowerCase(),C=y?s.filter(M=>(M.cliente_nombre||"").toLowerCase().includes(y)||(M.cliente_telefono||"").toLowerCase().includes(y)):s,D=s.reduce((M,A)=>M+(Number(A.total_atrasado)||0),0);return p.jsxs("section",{className:"mf-cobranza",children:[p.jsxs("div",{className:"mf-cobranza-head",children:[p.jsx("input",{className:"mf-cobranza-filter",value:ul,onChange:M=>Sd(M.target.value),placeholder:"Buscar cliente..."}),p.jsx("button",{type:"button",onClick:cl,disabled:Lr,title:"Actualizar",children:Lr?"...":"↻"})]}),s.length>0&&p.jsxs("div",{className:"mf-cobranza-summary",children:[p.jsxs("span",{children:[s.length," cliente(s) con deuda vencida"]}),p.jsx("b",{children:Ie.format(D)})]}),Tu&&p.jsx("p",{className:"mf-cobro-msg",children:Tu}),Lr&&!s.length&&p.jsx("p",{className:"mf-muted",children:"Cargando lista de cobranza..."}),p.jsxs("div",{className:"mf-cobranza-list",children:[C.map(M=>p.jsxs("article",{className:"mf-cob-card",children:[p.jsxs("header",{className:"mf-cob-card-head",children:[p.jsx("strong",{children:M.cliente_nombre}),p.jsxs("span",{className:`mf-cob-badge${M.dias_mas_vencido>=30?" is-red":""}`,children:[M.dias_mas_vencido,"d"]})]}),p.jsxs("div",{className:"mf-cob-card-info",children:[p.jsx("input",{className:"mf-cob-phone",type:"tel",value:M.cliente_telefono||"",onChange:A=>Fd(M.cliente_id,A.target.value),onFocus:A=>{Lu.current=A.target.value},onBlur:A=>{A.target.value!==Lu.current&&$d(M)},placeholder:"Agregar telefono"}),p.jsx("b",{children:Ie.format(M.total_atrasado)})]}),p.jsxs("div",{className:"mf-cob-card-facts",children:[M.cuotas_atrasadas," cuota(s): ",(M.facturas||[]).map(A=>A.numero).join(", ")]}),p.jsx("div",{className:"mf-cob-seg",children:Om.map(A=>p.jsx("button",{type:"button",className:M.seg_estado===A.key?"is-active":"",onClick:()=>Ud(M,A.key),children:A.label},A.key))}),M.seg_estado==="cliente_vendra"&&p.jsx("input",{type:"date",className:"mf-cob-date",value:M.seg_fecha||"",onChange:A=>Iu(M.cliente_id,{seg_fecha:A.target.value||null})}),p.jsx("input",{className:"mf-cob-nota",value:M.seg_nota||"",onChange:A=>Ad(M.cliente_id,{seg_nota:A.target.value}),onBlur:()=>dl(M),placeholder:"Nota interna..."}),M.seg_estado==="cliente_vendra"?p.jsx("button",{className:"mf-cob-send mf-cob-save",type:"button",onClick:()=>bd(M),children:"Guardar"}):p.jsx("button",{className:"mf-cob-send",type:"button",onClick:()=>Bd(M),disabled:al===M.cliente_id,children:al===M.cliente_id?"Abriendo chat...":"Enviar msj"})]},M.cliente_id)),!Lr&&s.length>0&&C.length===0&&p.jsxs("p",{className:"mf-muted",children:['Ningun cliente coincide con "',ul,'".']})]})]})})(),n==="cotizar"&&p.jsxs(p.Fragment,{children:[p.jsxs("section",{className:"mf-search",children:[p.jsx("label",{htmlFor:"mf-product-search",children:"Buscar producto"}),p.jsx("input",{id:"mf-product-search",value:a,onChange:s=>d(s.target.value),placeholder:"Codigo, descripcion...",disabled:!L}),!L&&p.jsx("p",{className:"mf-muted",children:"Conecta tu usuario del CRM para buscar productos."}),h&&p.jsx("p",{className:"mf-muted",children:"Buscando..."}),!h&&a.trim().length>=2&&L&&v.length===0&&p.jsxs("p",{className:"mf-muted",children:['Sin resultados para "',a.trim(),'".']}),v.length>0&&p.jsx("div",{className:"mf-results",children:v.map(s=>p.jsxs("button",{type:"button",onClick:()=>sl(s),children:[p.jsxs("span",{children:[p.jsx("strong",{children:s.codigo||"SIN CODIGO"}),p.jsx("small",{children:s.descripcion||s.nombre})]}),p.jsxs("span",{children:[p.jsx("strong",{children:Ie.format(Z(s.precio??s.precio_venta??s.precio1,0))}),p.jsxs("small",{children:["Exist. ",Z(s.existencia,0)]})]})]},s.id||s.codigo))}),p.jsx("button",{className:"mf-advanced-button",type:"button",onClick:()=>B(!0),disabled:!L,children:"Abrir busqueda avanzada"})]}),p.jsx("section",{className:"mf-items",children:i.length===0?p.jsxs("div",{className:"mf-empty",children:[p.jsx("strong",{children:"Todavia no hay articulos."}),p.jsx("p",{children:"Agrega productos manualmente desde el buscador para preparar la cotizacion sin salir de WhatsApp."}),((Ru=le==null?void 0:le.lines)==null?void 0:Ru.length)>0&&p.jsxs("button",{className:"mf-restore-button",type:"button",onClick:zd,children:["Recuperar ultima cotizacion (",le.lines.length,")"]}),ll.length>0&&p.jsxs("div",{className:"mf-history-list",children:[p.jsx("strong",{children:"Historial del chat"}),ll.slice(0,4).map(s=>{var y;return p.jsxs("button",{type:"button",onClick:()=>jd(s),children:[p.jsx("span",{children:new Date(s.sentAt).toLocaleTimeString("es-DO",{hour:"2-digit",minute:"2-digit"})}),p.jsxs("span",{children:[((y=s.lines)==null?void 0:y.length)||0," art."]}),p.jsx("b",{children:Ie.format(s.total||0)})]},s.id||s.sentAt)})]})]}):i.map(s=>p.jsxs("article",{className:"mf-line",children:[p.jsxs("div",{className:"mf-line-main",children:[p.jsx("strong",{children:s.descripcion}),p.jsxs("small",{children:[s.codigo||"Sin codigo"," · Exist. ",s.existencia]})]}),p.jsxs("div",{className:"mf-line-controls",children:[p.jsx("input",{"aria-label":"Cantidad",min:"1",type:"number",value:s.cantidad,onChange:y=>Ou(s.lineId,{cantidad:Z(y.target.value,1)})}),p.jsx("input",{"aria-label":"Precio",min:"0",step:"0.01",type:"number",value:s.precio,onChange:y=>Ou(s.lineId,{precio:Z(y.target.value,0)})}),p.jsx("button",{type:"button",onClick:()=>Cd(s.lineId),title:"Eliminar",children:"×"})]}),p.jsx("footer",{children:Ie.format(s.cantidad*s.precio)})]},s.lineId))}),p.jsxs("footer",{className:"mf-footer",children:[p.jsxs("dl",{children:[p.jsxs("div",{children:[p.jsx("dt",{children:"Subtotal"}),p.jsx("dd",{children:Ie.format(Oe.subtotal)})]}),p.jsxs("div",{children:[p.jsx("dt",{children:"ITBIS"}),p.jsx("dd",{children:Ie.format(Oe.tax)})]}),p.jsxs("div",{children:[p.jsx("dt",{children:"Total seleccionado"}),p.jsx("dd",{children:Ie.format(Oe.total)})]})]}),_&&p.jsx("p",{className:"mf-notice",children:_}),p.jsx("button",{className:"mf-secondary",type:"button",onClick:Ld,disabled:Be||!i.length,children:Be?"Enviando a Motoflow...":"Mandar a facturar en Motoflow"}),p.jsx("button",{className:"mf-primary",type:"button",onClick:Td,disabled:q,children:q?"Pegando cotizacion...":"Crear y pegar cotizacion"})]})]}),T&&p.jsx("div",{className:"mf-modal-backdrop",role:"dialog","aria-modal":"true","aria-label":"Buscar producto",children:p.jsxs("div",{className:"mf-product-modal",children:[p.jsxs("header",{className:"mf-modal-header",children:[p.jsx("h3",{children:"Buscar producto"}),p.jsx("button",{type:"button",onClick:()=>B(!1),title:"Cerrar",children:"×"})]}),p.jsxs("section",{className:"mf-modal-filters",children:[p.jsx("input",{autoFocus:!0,value:F,onChange:s=>Ce(s.target.value),placeholder:"Buscar por codigo, ref, descripcion..."}),p.jsx("input",{value:rn,onChange:s=>qo(s.target.value),placeholder:"Modelo"}),p.jsx("input",{value:nt,onChange:s=>$t(s.target.value),placeholder:"Marca"}),p.jsxs("label",{children:[p.jsx("input",{type:"checkbox",checked:At,onChange:s=>Un(s.target.checked)}),"Incluir existencias en cero"]})]}),p.jsx("section",{className:"mf-product-table-wrap",children:p.jsxs("table",{className:"mf-product-table",children:[p.jsx("thead",{children:p.jsxs("tr",{children:[p.jsx("th",{children:"Codigo"}),p.jsx("th",{children:"Referencia"}),p.jsx("th",{children:"Descripcion"}),p.jsx("th",{children:"Ubicacion"}),p.jsx("th",{children:"Exist."}),p.jsx("th",{children:"Precio+Imp"}),p.jsx("th",{children:"Marca"})]})}),p.jsxs("tbody",{children:[R&&p.jsx("tr",{children:p.jsx("td",{colSpan:"7",className:"mf-table-state",children:"Buscando productos..."})}),!R&&N.length===0&&p.jsx("tr",{children:p.jsx("td",{colSpan:"7",className:"mf-table-state",children:"No se encontraron productos."})}),!R&&N.map(s=>{const y=Z(s.precio??s.precio_venta??s.precio1,0);Z(s.itbis_pct,.18);const C=Z(s.existencia,0);return p.jsxs("tr",{onDoubleClick:()=>sl(s),children:[p.jsx("td",{children:p.jsx("button",{type:"button",onClick:()=>sl(s),children:s.codigo||"-"})}),p.jsx("td",{children:s.referencia||"-"}),p.jsx("td",{children:s.descripcion||s.nombre}),p.jsx("td",{children:s.ubicacion||"-"}),p.jsx("td",{className:C>0?"mf-stock-ok":"mf-stock-zero",children:C}),p.jsx("td",{className:"mf-price",children:Ie.format(y)}),p.jsx("td",{children:s.marca_nombre||"-"})]},s.id||s.codigo)})]})]})}),p.jsxs("footer",{className:"mf-modal-footer",children:[p.jsx("span",{children:"Doble clic o toca el codigo para agregar."}),p.jsx("button",{type:"button",onClick:()=>B(!1),children:"Cerrar"})]})]})})]})}const Qm=`
  :host {
    all: initial;
    color-scheme: light;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  * {
    box-sizing: border-box;
  }

  button,
  input {
    font: inherit;
  }

  .mf-panel {
    position: fixed;
    top: 12px;
    right: 12px;
    bottom: 12px;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    width: min(390px, calc(100vw - 24px));
    overflow: hidden;
    border: 1px solid #d6e3dc;
    border-radius: 8px;
    background: #f7faf8;
    box-shadow: 0 18px 50px rgba(17, 24, 39, 0.22);
    color: #13211a;
  }

  .mf-header {
    position: relative;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 14px;
    background: #ffffff;
    border-bottom: 1px solid #dbe7e1;
  }

  .mf-header > .mf-icon-button,
  .mf-summary-strip,
  .mf-session {
    display: none;
  }

  .mf-header-actions {
    position: absolute;
    top: 10px;
    right: 12px;
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .mf-header-actions span {
    color: #0f766a;
    font-size: 11px;
    font-weight: 800;
  }

  .mf-logout-button {
    height: 28px;
    padding: 0 9px;
    border: 1px solid #b8d8cc;
    border-radius: 6px;
    background: #ffffff;
    color: #24584d;
    cursor: pointer;
    font-size: 12px;
    font-weight: 800;
  }

  .mf-kicker {
    margin: 0 0 3px;
    color: #128c7e;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .mf-header h2 {
    margin: 0;
    font-size: 17px;
    line-height: 1.2;
  }

  .mf-chat {
    max-width: 280px;
    margin: 5px 0 0;
    overflow: hidden;
    color: #5f6d66;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mf-icon-button,
  .mf-line-controls button {
    width: 30px;
    height: 30px;
    border: 1px solid #d4ded9;
    border-radius: 6px;
    background: #ffffff;
    color: #4d5c54;
    cursor: pointer;
  }

  .mf-summary-strip {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    background: #e8f5ee;
    border-bottom: 1px solid #d6e8df;
    font-size: 13px;
  }

  .mf-search {
    position: relative;
    padding: 12px 14px;
    background: #ffffff;
    border-bottom: 1px solid #dbe7e1;
  }

  .mf-login {
    display: grid;
    gap: 8px;
    padding: 12px 14px;
    background: #fffaf0;
    border-bottom: 1px solid #eadfca;
  }

  .mf-login strong {
    font-size: 13px;
  }

  .mf-login p {
    margin: 0;
    color: #695f4c;
    font-size: 12px;
    line-height: 1.35;
  }

  .mf-login input {
    width: 100%;
    height: 34px;
    min-width: 0;
    padding: 0 9px;
    border: 1px solid #d7c9aa;
    border-radius: 6px;
    background: #ffffff;
    color: #13211a;
    outline: none;
  }

  .mf-login button {
    height: 34px;
    border: 0;
    border-radius: 6px;
    background: #1f6f64;
    color: #ffffff;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-login button:disabled {
    cursor: wait;
    opacity: 0.7;
  }

  .mf-session {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 14px;
    background: #edf8f3;
    border-bottom: 1px solid #d4e9df;
    color: #24584d;
    font-size: 12px;
    font-weight: 700;
  }

  .mf-session button {
    height: 26px;
    padding: 0 10px;
    border: 1px solid #b8d8cc;
    border-radius: 6px;
    background: #ffffff;
    color: #24584d;
    cursor: pointer;
  }

  .mf-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 10px 14px;
    background: #ffffff;
    border-bottom: 1px solid #dbe7e1;
  }

  .mf-tabs button {
    height: 40px;
    border: 1px solid #cfdcd6;
    border-radius: 8px;
    background: #ffffff;
    color: #4d5c54;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-tab-quote.is-active {
    border-color: #128c7e;
    background: #128c7e;
    color: #ffffff;
  }

  .mf-tab-cobro.is-active {
    border-color: #ea7d23;
    background: #ea7d23;
    color: #ffffff;
  }

  .mf-motoflow-box {
    position: relative;
    background: #ffffff;
    border-bottom: 1px solid #dbe7e1;
  }

  .mf-motoflow-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    min-height: 46px;
    padding: 8px 14px;
    border: 0;
    background: #ffffff;
    color: #13211a;
    cursor: pointer;
    text-align: left;
  }

  .mf-motoflow-toggle span {
    display: grid;
    min-width: 0;
    font-size: 12px;
    font-weight: 900;
  }

  .mf-motoflow-toggle small {
    display: block;
    max-width: 270px;
    margin-top: 2px;
    overflow: hidden;
    color: #66766e;
    font-size: 11px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mf-motoflow-toggle b {
    color: #126f64;
    font-size: 12px;
  }

  .mf-customer-box {
    position: relative;
    display: grid;
    gap: 8px;
    padding: 10px 14px;
    background: #f8fbf9;
    border-top: 1px solid #edf3f0;
  }

  .mf-customer-box label {
    color: #405047;
    font-size: 12px;
    font-weight: 800;
  }

  .mf-customer-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 7px;
  }

  .mf-customer-row input,
  .mf-customer-grid input,
  .mf-customer-grid select {
    width: 100%;
    height: 34px;
    min-width: 0;
    padding: 0 9px;
    border: 1px solid #cfdcd6;
    border-radius: 6px;
    background: #ffffff;
    color: #13211a;
    outline: none;
  }

  .mf-customer-row button {
    width: 34px;
    height: 34px;
    border: 1px solid #d4ded9;
    border-radius: 6px;
    background: #ffffff;
    color: #4d5c54;
    cursor: pointer;
  }

  .mf-customer-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7px;
  }

  .mf-customer-results {
    position: absolute;
    top: 70px;
    right: 14px;
    left: 14px;
    z-index: 4;
    max-height: 210px;
    overflow: auto;
    border: 1px solid #cfdcd6;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
  }

  .mf-customer-results button {
    display: block;
    width: 100%;
    padding: 9px 10px;
    border: 0;
    border-bottom: 1px solid #edf2ef;
    background: #ffffff;
    color: #13211a;
    text-align: left;
    cursor: pointer;
  }

  .mf-customer-results button:hover {
    background: #f2faf6;
  }

  .mf-customer-results small {
    display: block;
    margin-top: 2px;
    color: #66766e;
    font-size: 11px;
  }

  .mf-workflow-box {
    display: grid;
    gap: 8px;
    padding: 10px 14px 12px;
    background: #f8fbf9;
    border-top: 1px solid #edf3f0;
  }

  .mf-workflow-box label {
    color: #405047;
    font-size: 12px;
    font-weight: 800;
  }

  .mf-status-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .mf-status-grid button {
    min-height: 30px;
    padding: 0 8px;
    border: 1px solid #cfdcd6;
    border-radius: 6px;
    background: #ffffff;
    color: #405047;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-status-grid button.is-active {
    border-color: #128c7e;
    background: #e2f6ee;
    color: #0f766a;
  }

  .mf-workflow-box textarea {
    width: 100%;
    min-height: 54px;
    resize: vertical;
    padding: 8px 9px;
    border: 1px solid #cfdcd6;
    border-radius: 6px;
    background: #ffffff;
    color: #13211a;
    outline: none;
  }

  .mf-cobro-box {
    display: grid;
    gap: 8px;
    padding: 10px 14px 12px;
    background: #fff8f1;
    border-bottom: 1px solid #f0e0cd;
  }

  .mf-cobro-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .mf-cobro-head strong {
    color: #9a4a12;
    font-size: 12px;
    font-weight: 900;
  }

  .mf-cobro-head button {
    height: 30px;
    padding: 0 12px;
    border: 1px solid #e3b483;
    border-radius: 6px;
    background: #ffffff;
    color: #9a4a12;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-cobro-head button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .mf-cobro-ok {
    margin: 0;
    color: #0f766a;
    font-size: 12px;
    font-weight: 700;
  }

  .mf-cobro-msg {
    margin: 0 14px;
    padding: 7px 9px;
    border-radius: 6px;
    background: #fdeede;
    color: #9a4a12;
    font-size: 12px;
    line-height: 1.35;
  }

  /* ===== Lista de cobranza (morosos) ===== */
  .mf-cobranza {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #fff8f1;
  }

  .mf-cobranza-head {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
    padding: 10px 14px;
    background: #ffffff;
    border-bottom: 1px solid #f0e0cd;
  }

  .mf-cobranza-filter {
    height: 34px;
    min-width: 0;
    padding: 0 10px;
    border: 1px solid #e3b483;
    border-radius: 6px;
    background: #ffffff;
    color: #13211a;
    outline: none;
  }

  .mf-cobranza-head button {
    width: 38px;
    height: 34px;
    border: 1px solid #e3b483;
    border-radius: 6px;
    background: #ffffff;
    color: #9a4a12;
    font-size: 16px;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-cobranza-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 14px;
    background: #fdeede;
    border-bottom: 1px solid #f0e0cd;
    color: #9a4a12;
    font-size: 12px;
    font-weight: 800;
  }

  .mf-cobranza-summary b {
    color: #c2410c;
    font-size: 14px;
  }

  .mf-cobranza-list {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    display: grid;
    gap: 9px;
    padding: 10px 14px 14px;
  }

  .mf-cob-card {
    display: grid;
    gap: 7px;
    padding: 10px;
    border: 1px solid #f0ddc6;
    border-radius: 8px;
    background: #ffffff;
  }

  .mf-cob-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .mf-cob-card-head strong {
    font-size: 13px;
    color: #13211a;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mf-cob-badge {
    flex: none;
    padding: 2px 8px;
    border-radius: 999px;
    background: #fde9c7;
    color: #9a4a12;
    font-size: 11px;
    font-weight: 800;
  }

  .mf-cob-badge.is-red {
    background: #fde0db;
    color: #c2410c;
  }

  .mf-cob-card-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 12px;
    color: #5a4632;
  }

  .mf-cob-card-info b {
    color: #c2410c;
    font-size: 14px;
    font-weight: 800;
    flex: none;
  }

  .mf-cob-phone {
    flex: 1 1 auto;
    min-width: 0;
    height: 28px;
    padding: 0 7px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: #5a4632;
    font-size: 12px;
    outline: none;
  }

  .mf-cob-phone:hover {
    border-color: #f0ddc6;
    background: #fffdf9;
  }

  .mf-cob-phone:focus {
    border-color: #ea7d23;
    background: #ffffff;
  }

  .mf-cob-phone::placeholder {
    color: #b9a98f;
  }

  .mf-cob-card-facts {
    color: #8a7a66;
    font-size: 11px;
    line-height: 1.3;
  }

  .mf-cob-seg {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .mf-cob-seg button {
    min-height: 30px;
    padding: 0 8px;
    border: 1px solid #e3cfb4;
    border-radius: 6px;
    background: #ffffff;
    color: #6b5840;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-cob-seg button.is-active {
    border-color: #ea7d23;
    background: #fde9c7;
    color: #9a4a12;
  }

  .mf-cob-date,
  .mf-cob-nota {
    width: 100%;
    height: 32px;
    min-width: 0;
    padding: 0 9px;
    border: 1px solid #e3cfb4;
    border-radius: 6px;
    background: #fffdf9;
    color: #13211a;
    outline: none;
    font-size: 12px;
  }

  .mf-cob-send {
    height: 36px;
    border: 0;
    border-radius: 7px;
    background: #ea7d23;
    color: #ffffff;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-cob-send:hover {
    background: #d96f17;
  }

  .mf-cob-send:disabled {
    cursor: wait;
    opacity: 0.7;
  }

  .mf-cob-save {
    background: #128c7e;
  }

  .mf-cob-save:hover {
    background: #0f786d;
  }

  .mf-cobro-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 12px;
    font-weight: 800;
    color: #9a4a12;
  }

  .mf-cobro-summary b {
    color: #c2410c;
    font-size: 14px;
  }

  .mf-cobro-list {
    display: grid;
    gap: 5px;
    max-height: 132px;
    overflow: auto;
  }

  .mf-cobro-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 10px;
    align-items: center;
    padding: 6px 8px;
    border: 1px solid #f0ddc6;
    border-radius: 6px;
    background: #ffffff;
    font-size: 12px;
    color: #5a4632;
  }

  .mf-cobro-row b {
    color: #c2410c;
    font-weight: 800;
  }

  .mf-cobro-paste {
    width: 100%;
    height: 38px;
    border: 0;
    border-radius: 7px;
    background: #ea7d23;
    color: #ffffff;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-cobro-paste:hover {
    background: #d96f17;
  }

  .mf-cobro-paste:disabled {
    cursor: wait;
    opacity: 0.7;
  }

  .mf-search label {
    display: block;
    margin-bottom: 6px;
    color: #405047;
    font-size: 12px;
    font-weight: 700;
  }

  .mf-search input,
  .mf-line-controls input {
    width: 100%;
    min-width: 0;
    border: 1px solid #cfdcd6;
    border-radius: 6px;
    background: #ffffff;
    color: #13211a;
    outline: none;
  }

  .mf-search input {
    height: 38px;
    padding: 0 10px;
  }

  .mf-search input:focus,
  .mf-line-controls input:focus {
    border-color: #128c7e;
    box-shadow: 0 0 0 2px rgba(18, 140, 126, 0.15);
  }

  .mf-muted {
    margin: 8px 0 0;
    color: #64746c;
    font-size: 12px;
  }

  .mf-advanced-button {
    width: 100%;
    height: 34px;
    margin-top: 9px;
    border: 1px solid #b8d8cc;
    border-radius: 7px;
    background: #ffffff;
    color: #126f64;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-advanced-button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .mf-results {
    position: absolute;
    top: calc(100% - 6px);
    right: 14px;
    left: 14px;
    z-index: 2;
    max-height: 290px;
    overflow: auto;
    border: 1px solid #cfdcd6;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
  }

  .mf-results button {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    width: 100%;
    padding: 10px;
    border: 0;
    border-bottom: 1px solid #edf2ef;
    background: #ffffff;
    color: #13211a;
    text-align: left;
    cursor: pointer;
  }

  .mf-results button:hover {
    background: #f2faf6;
  }

  .mf-results small,
  .mf-line small {
    display: block;
    margin-top: 3px;
    color: #66766e;
    font-size: 11px;
  }

  .mf-items {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    padding: 12px;
  }

  .mf-empty {
    display: grid;
    place-items: center;
    min-height: 180px;
    padding: 22px;
    border: 1px dashed #c8d8d0;
    border-radius: 8px;
    background: #ffffff;
    color: #405047;
    text-align: center;
  }

  .mf-empty p {
    max-width: 260px;
    margin: 7px 0 0;
    color: #6c7c74;
    font-size: 13px;
    line-height: 1.45;
  }

  .mf-restore-button {
    height: 34px;
    margin-top: 12px;
    padding: 0 12px;
    border: 1px solid #b8d8cc;
    border-radius: 7px;
    background: #ffffff;
    color: #126f64;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-restore-button:hover {
    background: #eef8f3;
  }

  .mf-history-list {
    width: 100%;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid #e2ece7;
    text-align: left;
  }

  .mf-history-list > strong {
    display: block;
    margin-bottom: 7px;
    color: #405047;
    font-size: 12px;
  }

  .mf-history-list button {
    display: grid;
    grid-template-columns: 56px 1fr auto;
    gap: 8px;
    align-items: center;
    width: 100%;
    min-height: 30px;
    padding: 5px 7px;
    border: 1px solid #d8e5df;
    border-radius: 6px;
    background: #ffffff;
    color: #405047;
    cursor: pointer;
    font-size: 11px;
    text-align: left;
  }

  .mf-history-list button + button {
    margin-top: 5px;
  }

  .mf-history-list b {
    color: #126f64;
  }

  .mf-line {
    padding: 10px;
    border: 1px solid #dce7e1;
    border-radius: 8px;
    background: #ffffff;
  }

  .mf-line + .mf-line {
    margin-top: 9px;
  }

  .mf-line-main strong {
    display: block;
    max-height: 38px;
    overflow: hidden;
    font-size: 13px;
    line-height: 1.35;
  }

  .mf-line-controls {
    display: grid;
    grid-template-columns: 58px 1fr 30px;
    gap: 7px;
    margin-top: 9px;
  }

  .mf-line-controls input {
    height: 30px;
    padding: 0 7px;
  }

  .mf-line footer {
    margin-top: 8px;
    color: #0b7a6d;
    font-size: 13px;
    font-weight: 800;
    text-align: right;
  }

  .mf-footer {
    padding: 12px 14px 14px;
    border-top: 1px solid #dbe7e1;
    background: #ffffff;
  }

  .mf-footer dl {
    display: grid;
    gap: 7px;
    margin: 0 0 12px;
  }

  .mf-footer dl div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
  }

  .mf-footer dt {
    color: #53645b;
  }

  .mf-footer dd {
    margin: 0;
    font-weight: 800;
  }

  .mf-footer dl div:last-child {
    padding-top: 7px;
    border-top: 1px solid #e4ece8;
    font-size: 15px;
  }

  .mf-notice {
    margin: 0 0 10px;
    padding: 8px;
    border-radius: 6px;
    background: #eef8f3;
    color: #24584d;
    font-size: 12px;
    line-height: 1.35;
  }

  .mf-primary {
    width: 100%;
    height: 40px;
    border: 0;
    border-radius: 7px;
    background: #128c7e;
    color: #ffffff;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-secondary {
    width: 100%;
    height: 38px;
    margin-bottom: 8px;
    border: 1px solid #b8d8cc;
    border-radius: 7px;
    background: #ffffff;
    color: #126f64;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-secondary:hover {
    background: #eef8f3;
  }

  .mf-secondary:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .mf-primary:hover {
    background: #0f786d;
  }

  .mf-primary:disabled {
    cursor: wait;
    opacity: 0.72;
  }

  .mf-floating-button {
    position: fixed;
    right: 16px;
    bottom: 82px;
    z-index: 2147483647;
    height: 42px;
    padding: 0 16px;
    border: 0;
    border-radius: 8px;
    background: #128c7e;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.24);
    color: #ffffff;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(17, 24, 39, 0.58);
  }

  .mf-product-modal {
    display: grid;
    grid-template-rows: auto auto minmax(220px, 1fr) auto;
    width: min(1120px, calc(100vw - 48px));
    height: min(760px, calc(100vh - 48px));
    overflow: hidden;
    border: 1px solid #d6b44a;
    border-radius: 8px;
    background: #f8fafc;
    box-shadow: 0 24px 70px rgba(15, 23, 42, 0.35);
  }

  .mf-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 14px 18px;
    background: #93c5fd;
    border-bottom: 1px solid #73a7e3;
  }

  .mf-modal-header h3 {
    margin: 0;
    color: #123878;
    font-size: 18px;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .mf-modal-header button {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #123878;
    cursor: pointer;
    font-size: 24px;
    line-height: 1;
  }

  .mf-modal-filters {
    display: grid;
    grid-template-columns: minmax(280px, 1fr) minmax(150px, 210px) minmax(150px, 210px);
    gap: 12px;
    padding: 16px 18px;
    background: #ffffff;
    border-bottom: 1px solid #dce3ea;
  }

  .mf-modal-filters input[type="text"],
  .mf-modal-filters > input {
    width: 100%;
    height: 44px;
    min-width: 0;
    padding: 0 12px;
    border: 1px solid #cbd5e1;
    border-radius: 7px;
    background: #ffffff;
    color: #172033;
    outline: none;
  }

  .mf-modal-filters > input:first-child {
    background: #fffde8;
  }

  .mf-modal-filters input:focus {
    border-color: #2563eb;
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.16);
  }

  .mf-modal-filters label {
    display: inline-flex;
    grid-column: 1 / -1;
    align-items: center;
    gap: 8px;
    color: #334155;
    font-size: 13px;
    font-weight: 700;
  }

  .mf-modal-filters label input {
    width: 18px;
    height: 18px;
    accent-color: #123878;
  }

  .mf-product-table-wrap {
    min-height: 0;
    overflow: auto;
    padding: 0 18px;
    background: #f8fafc;
  }

  .mf-product-table {
    width: 100%;
    min-width: 960px;
    border-collapse: collapse;
    color: #172033;
    font-size: 13px;
  }

  .mf-product-table thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 12px 10px;
    background: #f1f5f9;
    border-bottom: 1px solid #d7dde6;
    color: #334155;
    text-align: left;
  }

  .mf-product-table tbody tr {
    background: #ffffff;
    border-bottom: 1px solid #e2e8f0;
    cursor: pointer;
  }

  .mf-product-table tbody tr:nth-child(even) {
    background: #dcfce7;
  }

  .mf-product-table tbody tr:hover {
    background: #bfdbfe;
  }

  .mf-product-table td {
    padding: 10px;
    white-space: nowrap;
  }

  .mf-product-table td:nth-child(3) {
    max-width: 360px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mf-product-table td button {
    border: 0;
    background: transparent;
    color: #143b8f;
    cursor: pointer;
    font-weight: 900;
    padding: 0;
  }

  .mf-stock-ok {
    color: #078035;
    font-weight: 900;
    text-align: right;
  }

  .mf-stock-zero {
    color: #e11d2e;
    font-weight: 900;
    text-align: right;
  }

  .mf-price {
    color: #143b8f;
    font-weight: 900;
    text-align: right;
  }

  .mf-table-state {
    padding: 34px 10px !important;
    color: #64748b;
    text-align: center;
  }

  .mf-modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 14px 18px;
    background: #ffffff;
    border-top: 1px solid #dce3ea;
    color: #64748b;
    font-size: 13px;
  }

  .mf-modal-footer button {
    min-width: 140px;
    height: 40px;
    border: 1px solid #cbd5e1;
    border-radius: 7px;
    background: #ffffff;
    color: #172033;
    font-weight: 800;
    cursor: pointer;
  }

  @media (max-width: 760px) {
    .mf-panel {
      width: calc(100vw - 16px);
      top: 8px;
      right: 8px;
      bottom: 8px;
    }

    .mf-modal-backdrop {
      padding: 8px;
    }

    .mf-product-modal {
      width: calc(100vw - 16px);
      height: calc(100vh - 16px);
    }

    .mf-modal-filters {
      grid-template-columns: 1fr;
    }

    .mf-product-table {
      min-width: 840px;
    }
  }
`,ts="motoflow-whatsapp-quote-root";function ns(){if(document.getElementById(ts))return;const e=document.createElement("div");e.id=ts,document.body.appendChild(e);const t=e.attachShadow({mode:"open"}),n=document.createElement("style");n.textContent=Qm;const r=document.createElement("div");r.id="motoflow-quote-app",t.append(n,r),hd(r).render(p.jsx(Vm,{}))}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",ns,{once:!0}):ns();
