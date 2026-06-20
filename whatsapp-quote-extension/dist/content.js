var is={exports:{}},bo={},as={exports:{}},F={};/**
 * @license React
 * react.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var jr=Symbol.for("react.element"),Jd=Symbol.for("react.portal"),Gd=Symbol.for("react.fragment"),qd=Symbol.for("react.strict_mode"),Zd=Symbol.for("react.profiler"),ef=Symbol.for("react.provider"),tf=Symbol.for("react.context"),nf=Symbol.for("react.forward_ref"),rf=Symbol.for("react.suspense"),of=Symbol.for("react.memo"),lf=Symbol.for("react.lazy"),Aa=Symbol.iterator;function af(e){return e===null||typeof e!="object"?null:(e=Aa&&e[Aa]||e["@@iterator"],typeof e=="function"?e:null)}var us={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},ss=Object.assign,cs={};function Fn(e,t,n){this.props=e,this.context=t,this.refs=cs,this.updater=n||us}Fn.prototype.isReactComponent={};Fn.prototype.setState=function(e,t){if(typeof e!="object"&&typeof e!="function"&&e!=null)throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");this.updater.enqueueSetState(this,e,t,"setState")};Fn.prototype.forceUpdate=function(e){this.updater.enqueueForceUpdate(this,e,"forceUpdate")};function ds(){}ds.prototype=Fn.prototype;function Oi(e,t,n){this.props=e,this.context=t,this.refs=cs,this.updater=n||us}var Ii=Oi.prototype=new ds;Ii.constructor=Oi;ss(Ii,Fn.prototype);Ii.isPureReactComponent=!0;var Ua=Array.isArray,fs=Object.prototype.hasOwnProperty,Mi={current:null},ps={key:!0,ref:!0,__self:!0,__source:!0};function ms(e,t,n){var r,o={},l=null,i=null;if(t!=null)for(r in t.ref!==void 0&&(i=t.ref),t.key!==void 0&&(l=""+t.key),t)fs.call(t,r)&&!ps.hasOwnProperty(r)&&(o[r]=t[r]);var a=arguments.length-2;if(a===1)o.children=n;else if(1<a){for(var u=Array(a),d=0;d<a;d++)u[d]=arguments[d+2];o.children=u}if(e&&e.defaultProps)for(r in a=e.defaultProps,a)o[r]===void 0&&(o[r]=a[r]);return{$$typeof:jr,type:e,key:l,ref:i,props:o,_owner:Mi.current}}function uf(e,t){return{$$typeof:jr,type:e.type,key:t,ref:e.ref,props:e.props,_owner:e._owner}}function Ri(e){return typeof e=="object"&&e!==null&&e.$$typeof===jr}function sf(e){var t={"=":"=0",":":"=2"};return"$"+e.replace(/[=:]/g,function(n){return t[n]})}var Ba=/\/+/g;function pl(e,t){return typeof e=="object"&&e!==null&&e.key!=null?sf(""+e.key):t.toString(36)}function eo(e,t,n,r,o){var l=typeof e;(l==="undefined"||l==="boolean")&&(e=null);var i=!1;if(e===null)i=!0;else switch(l){case"string":case"number":i=!0;break;case"object":switch(e.$$typeof){case jr:case Jd:i=!0}}if(i)return i=e,o=o(i),e=r===""?"."+pl(i,0):r,Ua(o)?(n="",e!=null&&(n=e.replace(Ba,"$&/")+"/"),eo(o,t,n,"",function(d){return d})):o!=null&&(Ri(o)&&(o=uf(o,n+(!o.key||i&&i.key===o.key?"":(""+o.key).replace(Ba,"$&/")+"/")+e)),t.push(o)),1;if(i=0,r=r===""?".":r+":",Ua(e))for(var a=0;a<e.length;a++){l=e[a];var u=r+pl(l,a);i+=eo(l,t,n,u,o)}else if(u=af(e),typeof u=="function")for(e=u.call(e),a=0;!(l=e.next()).done;)l=l.value,u=r+pl(l,a++),i+=eo(l,t,n,u,o);else if(l==="object")throw t=String(e),Error("Objects are not valid as a React child (found: "+(t==="[object Object]"?"object with keys {"+Object.keys(e).join(", ")+"}":t)+"). If you meant to render a collection of children, use an array instead.");return i}function Dr(e,t,n){if(e==null)return e;var r=[],o=0;return eo(e,r,"","",function(l){return t.call(n,l,o++)}),r}function cf(e){if(e._status===-1){var t=e._result;t=t(),t.then(function(n){(e._status===0||e._status===-1)&&(e._status=1,e._result=n)},function(n){(e._status===0||e._status===-1)&&(e._status=2,e._result=n)}),e._status===-1&&(e._status=0,e._result=t)}if(e._status===1)return e._result.default;throw e._result}var ve={current:null},to={transition:null},df={ReactCurrentDispatcher:ve,ReactCurrentBatchConfig:to,ReactCurrentOwner:Mi};function hs(){throw Error("act(...) is not supported in production builds of React.")}F.Children={map:Dr,forEach:function(e,t,n){Dr(e,function(){t.apply(this,arguments)},n)},count:function(e){var t=0;return Dr(e,function(){t++}),t},toArray:function(e){return Dr(e,function(t){return t})||[]},only:function(e){if(!Ri(e))throw Error("React.Children.only expected to receive a single React element child.");return e}};F.Component=Fn;F.Fragment=Gd;F.Profiler=Zd;F.PureComponent=Oi;F.StrictMode=qd;F.Suspense=rf;F.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=df;F.act=hs;F.cloneElement=function(e,t,n){if(e==null)throw Error("React.cloneElement(...): The argument must be a React element, but you passed "+e+".");var r=ss({},e.props),o=e.key,l=e.ref,i=e._owner;if(t!=null){if(t.ref!==void 0&&(l=t.ref,i=Mi.current),t.key!==void 0&&(o=""+t.key),e.type&&e.type.defaultProps)var a=e.type.defaultProps;for(u in t)fs.call(t,u)&&!ps.hasOwnProperty(u)&&(r[u]=t[u]===void 0&&a!==void 0?a[u]:t[u])}var u=arguments.length-2;if(u===1)r.children=n;else if(1<u){a=Array(u);for(var d=0;d<u;d++)a[d]=arguments[d+2];r.children=a}return{$$typeof:jr,type:e.type,key:o,ref:l,props:r,_owner:i}};F.createContext=function(e){return e={$$typeof:tf,_currentValue:e,_currentValue2:e,_threadCount:0,Provider:null,Consumer:null,_defaultValue:null,_globalName:null},e.Provider={$$typeof:ef,_context:e},e.Consumer=e};F.createElement=ms;F.createFactory=function(e){var t=ms.bind(null,e);return t.type=e,t};F.createRef=function(){return{current:null}};F.forwardRef=function(e){return{$$typeof:nf,render:e}};F.isValidElement=Ri;F.lazy=function(e){return{$$typeof:lf,_payload:{_status:-1,_result:e},_init:cf}};F.memo=function(e,t){return{$$typeof:of,type:e,compare:t===void 0?null:t}};F.startTransition=function(e){var t=to.transition;to.transition={};try{e()}finally{to.transition=t}};F.unstable_act=hs;F.useCallback=function(e,t){return ve.current.useCallback(e,t)};F.useContext=function(e){return ve.current.useContext(e)};F.useDebugValue=function(){};F.useDeferredValue=function(e){return ve.current.useDeferredValue(e)};F.useEffect=function(e,t){return ve.current.useEffect(e,t)};F.useId=function(){return ve.current.useId()};F.useImperativeHandle=function(e,t,n){return ve.current.useImperativeHandle(e,t,n)};F.useInsertionEffect=function(e,t){return ve.current.useInsertionEffect(e,t)};F.useLayoutEffect=function(e,t){return ve.current.useLayoutEffect(e,t)};F.useMemo=function(e,t){return ve.current.useMemo(e,t)};F.useReducer=function(e,t,n){return ve.current.useReducer(e,t,n)};F.useRef=function(e){return ve.current.useRef(e)};F.useState=function(e){return ve.current.useState(e)};F.useSyncExternalStore=function(e,t,n){return ve.current.useSyncExternalStore(e,t,n)};F.useTransition=function(){return ve.current.useTransition()};F.version="18.3.1";as.exports=F;var L=as.exports;/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var ff=L,pf=Symbol.for("react.element"),mf=Symbol.for("react.fragment"),hf=Object.prototype.hasOwnProperty,gf=ff.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,vf={key:!0,ref:!0,__self:!0,__source:!0};function gs(e,t,n){var r,o={},l=null,i=null;n!==void 0&&(l=""+n),t.key!==void 0&&(l=""+t.key),t.ref!==void 0&&(i=t.ref);for(r in t)hf.call(t,r)&&!vf.hasOwnProperty(r)&&(o[r]=t[r]);if(e&&e.defaultProps)for(r in t=e.defaultProps,t)o[r]===void 0&&(o[r]=t[r]);return{$$typeof:pf,type:e,key:l,ref:i,props:o,_owner:gf.current}}bo.Fragment=mf;bo.jsx=gs;bo.jsxs=gs;is.exports=bo;var p=is.exports,vs={exports:{}},Oe={},ys={exports:{}},xs={};/**
 * @license React
 * scheduler.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */(function(e){function t(E,M){var D=E.length;E.push(M);e:for(;0<D;){var K=D-1>>>1,q=E[K];if(0<o(q,M))E[K]=M,E[D]=q,D=K;else break e}}function n(E){return E.length===0?null:E[0]}function r(E){if(E.length===0)return null;var M=E[0],D=E.pop();if(D!==M){E[0]=D;e:for(var K=0,q=E.length,Ut=q>>>1;K<Ut;){var Be=2*(K+1)-1,on=E[Be],le=Be+1,vt=E[le];if(0>o(on,D))le<q&&0>o(vt,on)?(E[K]=vt,E[le]=D,K=le):(E[K]=on,E[Be]=D,K=Be);else if(le<q&&0>o(vt,D))E[K]=vt,E[le]=D,K=le;else break e}}return M}function o(E,M){var D=E.sortIndex-M.sortIndex;return D!==0?D:E.id-M.id}if(typeof performance=="object"&&typeof performance.now=="function"){var l=performance;e.unstable_now=function(){return l.now()}}else{var i=Date,a=i.now();e.unstable_now=function(){return i.now()-a}}var u=[],d=[],y=1,g=null,h=3,S=!1,_=!1,k=!1,O=typeof setTimeout=="function"?setTimeout:null,f=typeof clearTimeout=="function"?clearTimeout:null,c=typeof setImmediate<"u"?setImmediate:null;typeof navigator<"u"&&navigator.scheduling!==void 0&&navigator.scheduling.isInputPending!==void 0&&navigator.scheduling.isInputPending.bind(navigator.scheduling);function m(E){for(var M=n(d);M!==null;){if(M.callback===null)r(d);else if(M.startTime<=E)r(d),M.sortIndex=M.expirationTime,t(u,M);else break;M=n(d)}}function x(E){if(k=!1,m(E),!_)if(n(u)!==null)_=!0,At(C);else{var M=n(d);M!==null&&Un(x,M.startTime-E)}}function C(E,M){_=!1,k&&(k=!1,f(T),T=-1),S=!0;var D=h;try{for(m(M),g=n(u);g!==null&&(!(g.expirationTime>M)||E&&!ze());){var K=g.callback;if(typeof K=="function"){g.callback=null,h=g.priorityLevel;var q=K(g.expirationTime<=M);M=e.unstable_now(),typeof q=="function"?g.callback=q:g===n(u)&&r(u),m(M)}else r(u);g=n(u)}if(g!==null)var Ut=!0;else{var Be=n(d);Be!==null&&Un(x,Be.startTime-M),Ut=!1}return Ut}finally{g=null,h=D,S=!1}}var j=!1,P=null,T=-1,B=5,b=-1;function ze(){return!(e.unstable_now()-b<B)}function nt(){if(P!==null){var E=e.unstable_now();b=E;var M=!0;try{M=P(!0,E)}finally{M?$t():(j=!1,P=null)}}else j=!1}var $t;if(typeof c=="function")$t=function(){c(nt)};else if(typeof MessageChannel<"u"){var rn=new MessageChannel,Zo=rn.port2;rn.port1.onmessage=nt,$t=function(){Zo.postMessage(null)}}else $t=function(){O(nt,0)};function At(E){P=E,j||(j=!0,$t())}function Un(E,M){T=O(function(){E(e.unstable_now())},M)}e.unstable_IdlePriority=5,e.unstable_ImmediatePriority=1,e.unstable_LowPriority=4,e.unstable_NormalPriority=3,e.unstable_Profiling=null,e.unstable_UserBlockingPriority=2,e.unstable_cancelCallback=function(E){E.callback=null},e.unstable_continueExecution=function(){_||S||(_=!0,At(C))},e.unstable_forceFrameRate=function(E){0>E||125<E?console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"):B=0<E?Math.floor(1e3/E):5},e.unstable_getCurrentPriorityLevel=function(){return h},e.unstable_getFirstCallbackNode=function(){return n(u)},e.unstable_next=function(E){switch(h){case 1:case 2:case 3:var M=3;break;default:M=h}var D=h;h=M;try{return E()}finally{h=D}},e.unstable_pauseExecution=function(){},e.unstable_requestPaint=function(){},e.unstable_runWithPriority=function(E,M){switch(E){case 1:case 2:case 3:case 4:case 5:break;default:E=3}var D=h;h=E;try{return M()}finally{h=D}},e.unstable_scheduleCallback=function(E,M,D){var K=e.unstable_now();switch(typeof D=="object"&&D!==null?(D=D.delay,D=typeof D=="number"&&0<D?K+D:K):D=K,E){case 1:var q=-1;break;case 2:q=250;break;case 5:q=1073741823;break;case 4:q=1e4;break;default:q=5e3}return q=D+q,E={id:y++,callback:M,priorityLevel:E,startTime:D,expirationTime:q,sortIndex:-1},D>K?(E.sortIndex=D,t(d,E),n(u)===null&&E===n(d)&&(k?(f(T),T=-1):k=!0,Un(x,D-K))):(E.sortIndex=q,t(u,E),_||S||(_=!0,At(C))),E},e.unstable_shouldYield=ze,e.unstable_wrapCallback=function(E){var M=h;return function(){var D=h;h=M;try{return E.apply(this,arguments)}finally{h=D}}}})(xs);ys.exports=xs;var yf=ys.exports;/**
 * @license React
 * react-dom.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var xf=L,Le=yf;function w(e){for(var t="https://reactjs.org/docs/error-decoder.html?invariant="+e,n=1;n<arguments.length;n++)t+="&args[]="+encodeURIComponent(arguments[n]);return"Minified React error #"+e+"; visit "+t+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}var ws=new Set,cr={};function tn(e,t){Tn(e,t),Tn(e+"Capture",t)}function Tn(e,t){for(cr[e]=t,e=0;e<t.length;e++)ws.add(t[e])}var ft=!(typeof window>"u"||typeof window.document>"u"||typeof window.document.createElement>"u"),Al=Object.prototype.hasOwnProperty,wf=/^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/,Va={},Qa={};function kf(e){return Al.call(Qa,e)?!0:Al.call(Va,e)?!1:wf.test(e)?Qa[e]=!0:(Va[e]=!0,!1)}function Sf(e,t,n,r){if(n!==null&&n.type===0)return!1;switch(typeof t){case"function":case"symbol":return!0;case"boolean":return r?!1:n!==null?!n.acceptsBooleans:(e=e.toLowerCase().slice(0,5),e!=="data-"&&e!=="aria-");default:return!1}}function _f(e,t,n,r){if(t===null||typeof t>"u"||Sf(e,t,n,r))return!0;if(r)return!1;if(n!==null)switch(n.type){case 3:return!t;case 4:return t===!1;case 5:return isNaN(t);case 6:return isNaN(t)||1>t}return!1}function ye(e,t,n,r,o,l,i){this.acceptsBooleans=t===2||t===3||t===4,this.attributeName=r,this.attributeNamespace=o,this.mustUseProperty=n,this.propertyName=e,this.type=t,this.sanitizeURL=l,this.removeEmptyString=i}var ce={};"children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(e){ce[e]=new ye(e,0,!1,e,null,!1,!1)});[["acceptCharset","accept-charset"],["className","class"],["htmlFor","for"],["httpEquiv","http-equiv"]].forEach(function(e){var t=e[0];ce[t]=new ye(t,1,!1,e[1],null,!1,!1)});["contentEditable","draggable","spellCheck","value"].forEach(function(e){ce[e]=new ye(e,2,!1,e.toLowerCase(),null,!1,!1)});["autoReverse","externalResourcesRequired","focusable","preserveAlpha"].forEach(function(e){ce[e]=new ye(e,2,!1,e,null,!1,!1)});"allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(e){ce[e]=new ye(e,3,!1,e.toLowerCase(),null,!1,!1)});["checked","multiple","muted","selected"].forEach(function(e){ce[e]=new ye(e,3,!0,e,null,!1,!1)});["capture","download"].forEach(function(e){ce[e]=new ye(e,4,!1,e,null,!1,!1)});["cols","rows","size","span"].forEach(function(e){ce[e]=new ye(e,6,!1,e,null,!1,!1)});["rowSpan","start"].forEach(function(e){ce[e]=new ye(e,5,!1,e.toLowerCase(),null,!1,!1)});var Di=/[\-:]([a-z])/g;function bi(e){return e[1].toUpperCase()}"accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(e){var t=e.replace(Di,bi);ce[t]=new ye(t,1,!1,e,null,!1,!1)});"xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(e){var t=e.replace(Di,bi);ce[t]=new ye(t,1,!1,e,"http://www.w3.org/1999/xlink",!1,!1)});["xml:base","xml:lang","xml:space"].forEach(function(e){var t=e.replace(Di,bi);ce[t]=new ye(t,1,!1,e,"http://www.w3.org/XML/1998/namespace",!1,!1)});["tabIndex","crossOrigin"].forEach(function(e){ce[e]=new ye(e,1,!1,e.toLowerCase(),null,!1,!1)});ce.xlinkHref=new ye("xlinkHref",1,!1,"xlink:href","http://www.w3.org/1999/xlink",!0,!1);["src","href","action","formAction"].forEach(function(e){ce[e]=new ye(e,1,!1,e.toLowerCase(),null,!0,!0)});function Fi(e,t,n,r){var o=ce.hasOwnProperty(t)?ce[t]:null;(o!==null?o.type!==0:r||!(2<t.length)||t[0]!=="o"&&t[0]!=="O"||t[1]!=="n"&&t[1]!=="N")&&(_f(t,n,o,r)&&(n=null),r||o===null?kf(t)&&(n===null?e.removeAttribute(t):e.setAttribute(t,""+n)):o.mustUseProperty?e[o.propertyName]=n===null?o.type===3?!1:"":n:(t=o.attributeName,r=o.attributeNamespace,n===null?e.removeAttribute(t):(o=o.type,n=o===3||o===4&&n===!0?"":""+n,r?e.setAttributeNS(r,t,n):e.setAttribute(t,n))))}var gt=xf.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,br=Symbol.for("react.element"),dn=Symbol.for("react.portal"),fn=Symbol.for("react.fragment"),$i=Symbol.for("react.strict_mode"),Ul=Symbol.for("react.profiler"),ks=Symbol.for("react.provider"),Ss=Symbol.for("react.context"),Ai=Symbol.for("react.forward_ref"),Bl=Symbol.for("react.suspense"),Vl=Symbol.for("react.suspense_list"),Ui=Symbol.for("react.memo"),xt=Symbol.for("react.lazy"),_s=Symbol.for("react.offscreen"),Ha=Symbol.iterator;function Vn(e){return e===null||typeof e!="object"?null:(e=Ha&&e[Ha]||e["@@iterator"],typeof e=="function"?e:null)}var G=Object.assign,ml;function Gn(e){if(ml===void 0)try{throw Error()}catch(n){var t=n.stack.trim().match(/\n( *(at )?)/);ml=t&&t[1]||""}return`
`+ml+e}var hl=!1;function gl(e,t){if(!e||hl)return"";hl=!0;var n=Error.prepareStackTrace;Error.prepareStackTrace=void 0;try{if(t)if(t=function(){throw Error()},Object.defineProperty(t.prototype,"props",{set:function(){throw Error()}}),typeof Reflect=="object"&&Reflect.construct){try{Reflect.construct(t,[])}catch(d){var r=d}Reflect.construct(e,[],t)}else{try{t.call()}catch(d){r=d}e.call(t.prototype)}else{try{throw Error()}catch(d){r=d}e()}}catch(d){if(d&&r&&typeof d.stack=="string"){for(var o=d.stack.split(`
`),l=r.stack.split(`
`),i=o.length-1,a=l.length-1;1<=i&&0<=a&&o[i]!==l[a];)a--;for(;1<=i&&0<=a;i--,a--)if(o[i]!==l[a]){if(i!==1||a!==1)do if(i--,a--,0>a||o[i]!==l[a]){var u=`
`+o[i].replace(" at new "," at ");return e.displayName&&u.includes("<anonymous>")&&(u=u.replace("<anonymous>",e.displayName)),u}while(1<=i&&0<=a);break}}}finally{hl=!1,Error.prepareStackTrace=n}return(e=e?e.displayName||e.name:"")?Gn(e):""}function Cf(e){switch(e.tag){case 5:return Gn(e.type);case 16:return Gn("Lazy");case 13:return Gn("Suspense");case 19:return Gn("SuspenseList");case 0:case 2:case 15:return e=gl(e.type,!1),e;case 11:return e=gl(e.type.render,!1),e;case 1:return e=gl(e.type,!0),e;default:return""}}function Ql(e){if(e==null)return null;if(typeof e=="function")return e.displayName||e.name||null;if(typeof e=="string")return e;switch(e){case fn:return"Fragment";case dn:return"Portal";case Ul:return"Profiler";case $i:return"StrictMode";case Bl:return"Suspense";case Vl:return"SuspenseList"}if(typeof e=="object")switch(e.$$typeof){case Ss:return(e.displayName||"Context")+".Consumer";case ks:return(e._context.displayName||"Context")+".Provider";case Ai:var t=e.render;return e=e.displayName,e||(e=t.displayName||t.name||"",e=e!==""?"ForwardRef("+e+")":"ForwardRef"),e;case Ui:return t=e.displayName||null,t!==null?t:Ql(e.type)||"Memo";case xt:t=e._payload,e=e._init;try{return Ql(e(t))}catch{}}return null}function Ef(e){var t=e.type;switch(e.tag){case 24:return"Cache";case 9:return(t.displayName||"Context")+".Consumer";case 10:return(t._context.displayName||"Context")+".Provider";case 18:return"DehydratedFragment";case 11:return e=t.render,e=e.displayName||e.name||"",t.displayName||(e!==""?"ForwardRef("+e+")":"ForwardRef");case 7:return"Fragment";case 5:return t;case 4:return"Portal";case 3:return"Root";case 6:return"Text";case 16:return Ql(t);case 8:return t===$i?"StrictMode":"Mode";case 22:return"Offscreen";case 12:return"Profiler";case 21:return"Scope";case 13:return"Suspense";case 19:return"SuspenseList";case 25:return"TracingMarker";case 1:case 0:case 17:case 2:case 14:case 15:if(typeof t=="function")return t.displayName||t.name||null;if(typeof t=="string")return t}return null}function It(e){switch(typeof e){case"boolean":case"number":case"string":case"undefined":return e;case"object":return e;default:return""}}function Cs(e){var t=e.type;return(e=e.nodeName)&&e.toLowerCase()==="input"&&(t==="checkbox"||t==="radio")}function Nf(e){var t=Cs(e)?"checked":"value",n=Object.getOwnPropertyDescriptor(e.constructor.prototype,t),r=""+e[t];if(!e.hasOwnProperty(t)&&typeof n<"u"&&typeof n.get=="function"&&typeof n.set=="function"){var o=n.get,l=n.set;return Object.defineProperty(e,t,{configurable:!0,get:function(){return o.call(this)},set:function(i){r=""+i,l.call(this,i)}}),Object.defineProperty(e,t,{enumerable:n.enumerable}),{getValue:function(){return r},setValue:function(i){r=""+i},stopTracking:function(){e._valueTracker=null,delete e[t]}}}}function Fr(e){e._valueTracker||(e._valueTracker=Nf(e))}function Es(e){if(!e)return!1;var t=e._valueTracker;if(!t)return!0;var n=t.getValue(),r="";return e&&(r=Cs(e)?e.checked?"true":"false":e.value),e=r,e!==n?(t.setValue(e),!0):!1}function po(e){if(e=e||(typeof document<"u"?document:void 0),typeof e>"u")return null;try{return e.activeElement||e.body}catch{return e.body}}function Hl(e,t){var n=t.checked;return G({},t,{defaultChecked:void 0,defaultValue:void 0,value:void 0,checked:n??e._wrapperState.initialChecked})}function Wa(e,t){var n=t.defaultValue==null?"":t.defaultValue,r=t.checked!=null?t.checked:t.defaultChecked;n=It(t.value!=null?t.value:n),e._wrapperState={initialChecked:r,initialValue:n,controlled:t.type==="checkbox"||t.type==="radio"?t.checked!=null:t.value!=null}}function Ns(e,t){t=t.checked,t!=null&&Fi(e,"checked",t,!1)}function Wl(e,t){Ns(e,t);var n=It(t.value),r=t.type;if(n!=null)r==="number"?(n===0&&e.value===""||e.value!=n)&&(e.value=""+n):e.value!==""+n&&(e.value=""+n);else if(r==="submit"||r==="reset"){e.removeAttribute("value");return}t.hasOwnProperty("value")?Kl(e,t.type,n):t.hasOwnProperty("defaultValue")&&Kl(e,t.type,It(t.defaultValue)),t.checked==null&&t.defaultChecked!=null&&(e.defaultChecked=!!t.defaultChecked)}function Ka(e,t,n){if(t.hasOwnProperty("value")||t.hasOwnProperty("defaultValue")){var r=t.type;if(!(r!=="submit"&&r!=="reset"||t.value!==void 0&&t.value!==null))return;t=""+e._wrapperState.initialValue,n||t===e.value||(e.value=t),e.defaultValue=t}n=e.name,n!==""&&(e.name=""),e.defaultChecked=!!e._wrapperState.initialChecked,n!==""&&(e.name=n)}function Kl(e,t,n){(t!=="number"||po(e.ownerDocument)!==e)&&(n==null?e.defaultValue=""+e._wrapperState.initialValue:e.defaultValue!==""+n&&(e.defaultValue=""+n))}var qn=Array.isArray;function _n(e,t,n,r){if(e=e.options,t){t={};for(var o=0;o<n.length;o++)t["$"+n[o]]=!0;for(n=0;n<e.length;n++)o=t.hasOwnProperty("$"+e[n].value),e[n].selected!==o&&(e[n].selected=o),o&&r&&(e[n].defaultSelected=!0)}else{for(n=""+It(n),t=null,o=0;o<e.length;o++){if(e[o].value===n){e[o].selected=!0,r&&(e[o].defaultSelected=!0);return}t!==null||e[o].disabled||(t=e[o])}t!==null&&(t.selected=!0)}}function Yl(e,t){if(t.dangerouslySetInnerHTML!=null)throw Error(w(91));return G({},t,{value:void 0,defaultValue:void 0,children:""+e._wrapperState.initialValue})}function Ya(e,t){var n=t.value;if(n==null){if(n=t.children,t=t.defaultValue,n!=null){if(t!=null)throw Error(w(92));if(qn(n)){if(1<n.length)throw Error(w(93));n=n[0]}t=n}t==null&&(t=""),n=t}e._wrapperState={initialValue:It(n)}}function zs(e,t){var n=It(t.value),r=It(t.defaultValue);n!=null&&(n=""+n,n!==e.value&&(e.value=n),t.defaultValue==null&&e.defaultValue!==n&&(e.defaultValue=n)),r!=null&&(e.defaultValue=""+r)}function Xa(e){var t=e.textContent;t===e._wrapperState.initialValue&&t!==""&&t!==null&&(e.value=t)}function js(e){switch(e){case"svg":return"http://www.w3.org/2000/svg";case"math":return"http://www.w3.org/1998/Math/MathML";default:return"http://www.w3.org/1999/xhtml"}}function Xl(e,t){return e==null||e==="http://www.w3.org/1999/xhtml"?js(t):e==="http://www.w3.org/2000/svg"&&t==="foreignObject"?"http://www.w3.org/1999/xhtml":e}var $r,Ps=function(e){return typeof MSApp<"u"&&MSApp.execUnsafeLocalFunction?function(t,n,r,o){MSApp.execUnsafeLocalFunction(function(){return e(t,n,r,o)})}:e}(function(e,t){if(e.namespaceURI!=="http://www.w3.org/2000/svg"||"innerHTML"in e)e.innerHTML=t;else{for($r=$r||document.createElement("div"),$r.innerHTML="<svg>"+t.valueOf().toString()+"</svg>",t=$r.firstChild;e.firstChild;)e.removeChild(e.firstChild);for(;t.firstChild;)e.appendChild(t.firstChild)}});function dr(e,t){if(t){var n=e.firstChild;if(n&&n===e.lastChild&&n.nodeType===3){n.nodeValue=t;return}}e.textContent=t}var tr={animationIterationCount:!0,aspectRatio:!0,borderImageOutset:!0,borderImageSlice:!0,borderImageWidth:!0,boxFlex:!0,boxFlexGroup:!0,boxOrdinalGroup:!0,columnCount:!0,columns:!0,flex:!0,flexGrow:!0,flexPositive:!0,flexShrink:!0,flexNegative:!0,flexOrder:!0,gridArea:!0,gridRow:!0,gridRowEnd:!0,gridRowSpan:!0,gridRowStart:!0,gridColumn:!0,gridColumnEnd:!0,gridColumnSpan:!0,gridColumnStart:!0,fontWeight:!0,lineClamp:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,tabSize:!0,widows:!0,zIndex:!0,zoom:!0,fillOpacity:!0,floodOpacity:!0,stopOpacity:!0,strokeDasharray:!0,strokeDashoffset:!0,strokeMiterlimit:!0,strokeOpacity:!0,strokeWidth:!0},zf=["Webkit","ms","Moz","O"];Object.keys(tr).forEach(function(e){zf.forEach(function(t){t=t+e.charAt(0).toUpperCase()+e.substring(1),tr[t]=tr[e]})});function Ts(e,t,n){return t==null||typeof t=="boolean"||t===""?"":n||typeof t!="number"||t===0||tr.hasOwnProperty(e)&&tr[e]?(""+t).trim():t+"px"}function Ls(e,t){e=e.style;for(var n in t)if(t.hasOwnProperty(n)){var r=n.indexOf("--")===0,o=Ts(n,t[n],r);n==="float"&&(n="cssFloat"),r?e.setProperty(n,o):e[n]=o}}var jf=G({menuitem:!0},{area:!0,base:!0,br:!0,col:!0,embed:!0,hr:!0,img:!0,input:!0,keygen:!0,link:!0,meta:!0,param:!0,source:!0,track:!0,wbr:!0});function Jl(e,t){if(t){if(jf[e]&&(t.children!=null||t.dangerouslySetInnerHTML!=null))throw Error(w(137,e));if(t.dangerouslySetInnerHTML!=null){if(t.children!=null)throw Error(w(60));if(typeof t.dangerouslySetInnerHTML!="object"||!("__html"in t.dangerouslySetInnerHTML))throw Error(w(61))}if(t.style!=null&&typeof t.style!="object")throw Error(w(62))}}function Gl(e,t){if(e.indexOf("-")===-1)return typeof t.is=="string";switch(e){case"annotation-xml":case"color-profile":case"font-face":case"font-face-src":case"font-face-uri":case"font-face-format":case"font-face-name":case"missing-glyph":return!1;default:return!0}}var ql=null;function Bi(e){return e=e.target||e.srcElement||window,e.correspondingUseElement&&(e=e.correspondingUseElement),e.nodeType===3?e.parentNode:e}var Zl=null,Cn=null,En=null;function Ja(e){if(e=Lr(e)){if(typeof Zl!="function")throw Error(w(280));var t=e.stateNode;t&&(t=Bo(t),Zl(e.stateNode,e.type,t))}}function Os(e){Cn?En?En.push(e):En=[e]:Cn=e}function Is(){if(Cn){var e=Cn,t=En;if(En=Cn=null,Ja(e),t)for(e=0;e<t.length;e++)Ja(t[e])}}function Ms(e,t){return e(t)}function Rs(){}var vl=!1;function Ds(e,t,n){if(vl)return e(t,n);vl=!0;try{return Ms(e,t,n)}finally{vl=!1,(Cn!==null||En!==null)&&(Rs(),Is())}}function fr(e,t){var n=e.stateNode;if(n===null)return null;var r=Bo(n);if(r===null)return null;n=r[t];e:switch(t){case"onClick":case"onClickCapture":case"onDoubleClick":case"onDoubleClickCapture":case"onMouseDown":case"onMouseDownCapture":case"onMouseMove":case"onMouseMoveCapture":case"onMouseUp":case"onMouseUpCapture":case"onMouseEnter":(r=!r.disabled)||(e=e.type,r=!(e==="button"||e==="input"||e==="select"||e==="textarea")),e=!r;break e;default:e=!1}if(e)return null;if(n&&typeof n!="function")throw Error(w(231,t,typeof n));return n}var ei=!1;if(ft)try{var Qn={};Object.defineProperty(Qn,"passive",{get:function(){ei=!0}}),window.addEventListener("test",Qn,Qn),window.removeEventListener("test",Qn,Qn)}catch{ei=!1}function Pf(e,t,n,r,o,l,i,a,u){var d=Array.prototype.slice.call(arguments,3);try{t.apply(n,d)}catch(y){this.onError(y)}}var nr=!1,mo=null,ho=!1,ti=null,Tf={onError:function(e){nr=!0,mo=e}};function Lf(e,t,n,r,o,l,i,a,u){nr=!1,mo=null,Pf.apply(Tf,arguments)}function Of(e,t,n,r,o,l,i,a,u){if(Lf.apply(this,arguments),nr){if(nr){var d=mo;nr=!1,mo=null}else throw Error(w(198));ho||(ho=!0,ti=d)}}function nn(e){var t=e,n=e;if(e.alternate)for(;t.return;)t=t.return;else{e=t;do t=e,t.flags&4098&&(n=t.return),e=t.return;while(e)}return t.tag===3?n:null}function bs(e){if(e.tag===13){var t=e.memoizedState;if(t===null&&(e=e.alternate,e!==null&&(t=e.memoizedState)),t!==null)return t.dehydrated}return null}function Ga(e){if(nn(e)!==e)throw Error(w(188))}function If(e){var t=e.alternate;if(!t){if(t=nn(e),t===null)throw Error(w(188));return t!==e?null:e}for(var n=e,r=t;;){var o=n.return;if(o===null)break;var l=o.alternate;if(l===null){if(r=o.return,r!==null){n=r;continue}break}if(o.child===l.child){for(l=o.child;l;){if(l===n)return Ga(o),e;if(l===r)return Ga(o),t;l=l.sibling}throw Error(w(188))}if(n.return!==r.return)n=o,r=l;else{for(var i=!1,a=o.child;a;){if(a===n){i=!0,n=o,r=l;break}if(a===r){i=!0,r=o,n=l;break}a=a.sibling}if(!i){for(a=l.child;a;){if(a===n){i=!0,n=l,r=o;break}if(a===r){i=!0,r=l,n=o;break}a=a.sibling}if(!i)throw Error(w(189))}}if(n.alternate!==r)throw Error(w(190))}if(n.tag!==3)throw Error(w(188));return n.stateNode.current===n?e:t}function Fs(e){return e=If(e),e!==null?$s(e):null}function $s(e){if(e.tag===5||e.tag===6)return e;for(e=e.child;e!==null;){var t=$s(e);if(t!==null)return t;e=e.sibling}return null}var As=Le.unstable_scheduleCallback,qa=Le.unstable_cancelCallback,Mf=Le.unstable_shouldYield,Rf=Le.unstable_requestPaint,te=Le.unstable_now,Df=Le.unstable_getCurrentPriorityLevel,Vi=Le.unstable_ImmediatePriority,Us=Le.unstable_UserBlockingPriority,go=Le.unstable_NormalPriority,bf=Le.unstable_LowPriority,Bs=Le.unstable_IdlePriority,Fo=null,et=null;function Ff(e){if(et&&typeof et.onCommitFiberRoot=="function")try{et.onCommitFiberRoot(Fo,e,void 0,(e.current.flags&128)===128)}catch{}}var Ye=Math.clz32?Math.clz32:Uf,$f=Math.log,Af=Math.LN2;function Uf(e){return e>>>=0,e===0?32:31-($f(e)/Af|0)|0}var Ar=64,Ur=4194304;function Zn(e){switch(e&-e){case 1:return 1;case 2:return 2;case 4:return 4;case 8:return 8;case 16:return 16;case 32:return 32;case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return e&4194240;case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:return e&130023424;case 134217728:return 134217728;case 268435456:return 268435456;case 536870912:return 536870912;case 1073741824:return 1073741824;default:return e}}function vo(e,t){var n=e.pendingLanes;if(n===0)return 0;var r=0,o=e.suspendedLanes,l=e.pingedLanes,i=n&268435455;if(i!==0){var a=i&~o;a!==0?r=Zn(a):(l&=i,l!==0&&(r=Zn(l)))}else i=n&~o,i!==0?r=Zn(i):l!==0&&(r=Zn(l));if(r===0)return 0;if(t!==0&&t!==r&&!(t&o)&&(o=r&-r,l=t&-t,o>=l||o===16&&(l&4194240)!==0))return t;if(r&4&&(r|=n&16),t=e.entangledLanes,t!==0)for(e=e.entanglements,t&=r;0<t;)n=31-Ye(t),o=1<<n,r|=e[n],t&=~o;return r}function Bf(e,t){switch(e){case 1:case 2:case 4:return t+250;case 8:case 16:case 32:case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return t+5e3;case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:return-1;case 134217728:case 268435456:case 536870912:case 1073741824:return-1;default:return-1}}function Vf(e,t){for(var n=e.suspendedLanes,r=e.pingedLanes,o=e.expirationTimes,l=e.pendingLanes;0<l;){var i=31-Ye(l),a=1<<i,u=o[i];u===-1?(!(a&n)||a&r)&&(o[i]=Bf(a,t)):u<=t&&(e.expiredLanes|=a),l&=~a}}function ni(e){return e=e.pendingLanes&-1073741825,e!==0?e:e&1073741824?1073741824:0}function Vs(){var e=Ar;return Ar<<=1,!(Ar&4194240)&&(Ar=64),e}function yl(e){for(var t=[],n=0;31>n;n++)t.push(e);return t}function Pr(e,t,n){e.pendingLanes|=t,t!==536870912&&(e.suspendedLanes=0,e.pingedLanes=0),e=e.eventTimes,t=31-Ye(t),e[t]=n}function Qf(e,t){var n=e.pendingLanes&~t;e.pendingLanes=t,e.suspendedLanes=0,e.pingedLanes=0,e.expiredLanes&=t,e.mutableReadLanes&=t,e.entangledLanes&=t,t=e.entanglements;var r=e.eventTimes;for(e=e.expirationTimes;0<n;){var o=31-Ye(n),l=1<<o;t[o]=0,r[o]=-1,e[o]=-1,n&=~l}}function Qi(e,t){var n=e.entangledLanes|=t;for(e=e.entanglements;n;){var r=31-Ye(n),o=1<<r;o&t|e[r]&t&&(e[r]|=t),n&=~o}}var U=0;function Qs(e){return e&=-e,1<e?4<e?e&268435455?16:536870912:4:1}var Hs,Hi,Ws,Ks,Ys,ri=!1,Br=[],Et=null,Nt=null,zt=null,pr=new Map,mr=new Map,kt=[],Hf="mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset submit".split(" ");function Za(e,t){switch(e){case"focusin":case"focusout":Et=null;break;case"dragenter":case"dragleave":Nt=null;break;case"mouseover":case"mouseout":zt=null;break;case"pointerover":case"pointerout":pr.delete(t.pointerId);break;case"gotpointercapture":case"lostpointercapture":mr.delete(t.pointerId)}}function Hn(e,t,n,r,o,l){return e===null||e.nativeEvent!==l?(e={blockedOn:t,domEventName:n,eventSystemFlags:r,nativeEvent:l,targetContainers:[o]},t!==null&&(t=Lr(t),t!==null&&Hi(t)),e):(e.eventSystemFlags|=r,t=e.targetContainers,o!==null&&t.indexOf(o)===-1&&t.push(o),e)}function Wf(e,t,n,r,o){switch(t){case"focusin":return Et=Hn(Et,e,t,n,r,o),!0;case"dragenter":return Nt=Hn(Nt,e,t,n,r,o),!0;case"mouseover":return zt=Hn(zt,e,t,n,r,o),!0;case"pointerover":var l=o.pointerId;return pr.set(l,Hn(pr.get(l)||null,e,t,n,r,o)),!0;case"gotpointercapture":return l=o.pointerId,mr.set(l,Hn(mr.get(l)||null,e,t,n,r,o)),!0}return!1}function Xs(e){var t=Ht(e.target);if(t!==null){var n=nn(t);if(n!==null){if(t=n.tag,t===13){if(t=bs(n),t!==null){e.blockedOn=t,Ys(e.priority,function(){Ws(n)});return}}else if(t===3&&n.stateNode.current.memoizedState.isDehydrated){e.blockedOn=n.tag===3?n.stateNode.containerInfo:null;return}}}e.blockedOn=null}function no(e){if(e.blockedOn!==null)return!1;for(var t=e.targetContainers;0<t.length;){var n=oi(e.domEventName,e.eventSystemFlags,t[0],e.nativeEvent);if(n===null){n=e.nativeEvent;var r=new n.constructor(n.type,n);ql=r,n.target.dispatchEvent(r),ql=null}else return t=Lr(n),t!==null&&Hi(t),e.blockedOn=n,!1;t.shift()}return!0}function eu(e,t,n){no(e)&&n.delete(t)}function Kf(){ri=!1,Et!==null&&no(Et)&&(Et=null),Nt!==null&&no(Nt)&&(Nt=null),zt!==null&&no(zt)&&(zt=null),pr.forEach(eu),mr.forEach(eu)}function Wn(e,t){e.blockedOn===t&&(e.blockedOn=null,ri||(ri=!0,Le.unstable_scheduleCallback(Le.unstable_NormalPriority,Kf)))}function hr(e){function t(o){return Wn(o,e)}if(0<Br.length){Wn(Br[0],e);for(var n=1;n<Br.length;n++){var r=Br[n];r.blockedOn===e&&(r.blockedOn=null)}}for(Et!==null&&Wn(Et,e),Nt!==null&&Wn(Nt,e),zt!==null&&Wn(zt,e),pr.forEach(t),mr.forEach(t),n=0;n<kt.length;n++)r=kt[n],r.blockedOn===e&&(r.blockedOn=null);for(;0<kt.length&&(n=kt[0],n.blockedOn===null);)Xs(n),n.blockedOn===null&&kt.shift()}var Nn=gt.ReactCurrentBatchConfig,yo=!0;function Yf(e,t,n,r){var o=U,l=Nn.transition;Nn.transition=null;try{U=1,Wi(e,t,n,r)}finally{U=o,Nn.transition=l}}function Xf(e,t,n,r){var o=U,l=Nn.transition;Nn.transition=null;try{U=4,Wi(e,t,n,r)}finally{U=o,Nn.transition=l}}function Wi(e,t,n,r){if(yo){var o=oi(e,t,n,r);if(o===null)jl(e,t,r,xo,n),Za(e,r);else if(Wf(o,e,t,n,r))r.stopPropagation();else if(Za(e,r),t&4&&-1<Hf.indexOf(e)){for(;o!==null;){var l=Lr(o);if(l!==null&&Hs(l),l=oi(e,t,n,r),l===null&&jl(e,t,r,xo,n),l===o)break;o=l}o!==null&&r.stopPropagation()}else jl(e,t,r,null,n)}}var xo=null;function oi(e,t,n,r){if(xo=null,e=Bi(r),e=Ht(e),e!==null)if(t=nn(e),t===null)e=null;else if(n=t.tag,n===13){if(e=bs(t),e!==null)return e;e=null}else if(n===3){if(t.stateNode.current.memoizedState.isDehydrated)return t.tag===3?t.stateNode.containerInfo:null;e=null}else t!==e&&(e=null);return xo=e,null}function Js(e){switch(e){case"cancel":case"click":case"close":case"contextmenu":case"copy":case"cut":case"auxclick":case"dblclick":case"dragend":case"dragstart":case"drop":case"focusin":case"focusout":case"input":case"invalid":case"keydown":case"keypress":case"keyup":case"mousedown":case"mouseup":case"paste":case"pause":case"play":case"pointercancel":case"pointerdown":case"pointerup":case"ratechange":case"reset":case"resize":case"seeked":case"submit":case"touchcancel":case"touchend":case"touchstart":case"volumechange":case"change":case"selectionchange":case"textInput":case"compositionstart":case"compositionend":case"compositionupdate":case"beforeblur":case"afterblur":case"beforeinput":case"blur":case"fullscreenchange":case"focus":case"hashchange":case"popstate":case"select":case"selectstart":return 1;case"drag":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"mousemove":case"mouseout":case"mouseover":case"pointermove":case"pointerout":case"pointerover":case"scroll":case"toggle":case"touchmove":case"wheel":case"mouseenter":case"mouseleave":case"pointerenter":case"pointerleave":return 4;case"message":switch(Df()){case Vi:return 1;case Us:return 4;case go:case bf:return 16;case Bs:return 536870912;default:return 16}default:return 16}}var _t=null,Ki=null,ro=null;function Gs(){if(ro)return ro;var e,t=Ki,n=t.length,r,o="value"in _t?_t.value:_t.textContent,l=o.length;for(e=0;e<n&&t[e]===o[e];e++);var i=n-e;for(r=1;r<=i&&t[n-r]===o[l-r];r++);return ro=o.slice(e,1<r?1-r:void 0)}function oo(e){var t=e.keyCode;return"charCode"in e?(e=e.charCode,e===0&&t===13&&(e=13)):e=t,e===10&&(e=13),32<=e||e===13?e:0}function Vr(){return!0}function tu(){return!1}function Ie(e){function t(n,r,o,l,i){this._reactName=n,this._targetInst=o,this.type=r,this.nativeEvent=l,this.target=i,this.currentTarget=null;for(var a in e)e.hasOwnProperty(a)&&(n=e[a],this[a]=n?n(l):l[a]);return this.isDefaultPrevented=(l.defaultPrevented!=null?l.defaultPrevented:l.returnValue===!1)?Vr:tu,this.isPropagationStopped=tu,this}return G(t.prototype,{preventDefault:function(){this.defaultPrevented=!0;var n=this.nativeEvent;n&&(n.preventDefault?n.preventDefault():typeof n.returnValue!="unknown"&&(n.returnValue=!1),this.isDefaultPrevented=Vr)},stopPropagation:function(){var n=this.nativeEvent;n&&(n.stopPropagation?n.stopPropagation():typeof n.cancelBubble!="unknown"&&(n.cancelBubble=!0),this.isPropagationStopped=Vr)},persist:function(){},isPersistent:Vr}),t}var $n={eventPhase:0,bubbles:0,cancelable:0,timeStamp:function(e){return e.timeStamp||Date.now()},defaultPrevented:0,isTrusted:0},Yi=Ie($n),Tr=G({},$n,{view:0,detail:0}),Jf=Ie(Tr),xl,wl,Kn,$o=G({},Tr,{screenX:0,screenY:0,clientX:0,clientY:0,pageX:0,pageY:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,getModifierState:Xi,button:0,buttons:0,relatedTarget:function(e){return e.relatedTarget===void 0?e.fromElement===e.srcElement?e.toElement:e.fromElement:e.relatedTarget},movementX:function(e){return"movementX"in e?e.movementX:(e!==Kn&&(Kn&&e.type==="mousemove"?(xl=e.screenX-Kn.screenX,wl=e.screenY-Kn.screenY):wl=xl=0,Kn=e),xl)},movementY:function(e){return"movementY"in e?e.movementY:wl}}),nu=Ie($o),Gf=G({},$o,{dataTransfer:0}),qf=Ie(Gf),Zf=G({},Tr,{relatedTarget:0}),kl=Ie(Zf),ep=G({},$n,{animationName:0,elapsedTime:0,pseudoElement:0}),tp=Ie(ep),np=G({},$n,{clipboardData:function(e){return"clipboardData"in e?e.clipboardData:window.clipboardData}}),rp=Ie(np),op=G({},$n,{data:0}),ru=Ie(op),lp={Esc:"Escape",Spacebar:" ",Left:"ArrowLeft",Up:"ArrowUp",Right:"ArrowRight",Down:"ArrowDown",Del:"Delete",Win:"OS",Menu:"ContextMenu",Apps:"ContextMenu",Scroll:"ScrollLock",MozPrintableKey:"Unidentified"},ip={8:"Backspace",9:"Tab",12:"Clear",13:"Enter",16:"Shift",17:"Control",18:"Alt",19:"Pause",20:"CapsLock",27:"Escape",32:" ",33:"PageUp",34:"PageDown",35:"End",36:"Home",37:"ArrowLeft",38:"ArrowUp",39:"ArrowRight",40:"ArrowDown",45:"Insert",46:"Delete",112:"F1",113:"F2",114:"F3",115:"F4",116:"F5",117:"F6",118:"F7",119:"F8",120:"F9",121:"F10",122:"F11",123:"F12",144:"NumLock",145:"ScrollLock",224:"Meta"},ap={Alt:"altKey",Control:"ctrlKey",Meta:"metaKey",Shift:"shiftKey"};function up(e){var t=this.nativeEvent;return t.getModifierState?t.getModifierState(e):(e=ap[e])?!!t[e]:!1}function Xi(){return up}var sp=G({},Tr,{key:function(e){if(e.key){var t=lp[e.key]||e.key;if(t!=="Unidentified")return t}return e.type==="keypress"?(e=oo(e),e===13?"Enter":String.fromCharCode(e)):e.type==="keydown"||e.type==="keyup"?ip[e.keyCode]||"Unidentified":""},code:0,location:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,repeat:0,locale:0,getModifierState:Xi,charCode:function(e){return e.type==="keypress"?oo(e):0},keyCode:function(e){return e.type==="keydown"||e.type==="keyup"?e.keyCode:0},which:function(e){return e.type==="keypress"?oo(e):e.type==="keydown"||e.type==="keyup"?e.keyCode:0}}),cp=Ie(sp),dp=G({},$o,{pointerId:0,width:0,height:0,pressure:0,tangentialPressure:0,tiltX:0,tiltY:0,twist:0,pointerType:0,isPrimary:0}),ou=Ie(dp),fp=G({},Tr,{touches:0,targetTouches:0,changedTouches:0,altKey:0,metaKey:0,ctrlKey:0,shiftKey:0,getModifierState:Xi}),pp=Ie(fp),mp=G({},$n,{propertyName:0,elapsedTime:0,pseudoElement:0}),hp=Ie(mp),gp=G({},$o,{deltaX:function(e){return"deltaX"in e?e.deltaX:"wheelDeltaX"in e?-e.wheelDeltaX:0},deltaY:function(e){return"deltaY"in e?e.deltaY:"wheelDeltaY"in e?-e.wheelDeltaY:"wheelDelta"in e?-e.wheelDelta:0},deltaZ:0,deltaMode:0}),vp=Ie(gp),yp=[9,13,27,32],Ji=ft&&"CompositionEvent"in window,rr=null;ft&&"documentMode"in document&&(rr=document.documentMode);var xp=ft&&"TextEvent"in window&&!rr,qs=ft&&(!Ji||rr&&8<rr&&11>=rr),lu=String.fromCharCode(32),iu=!1;function Zs(e,t){switch(e){case"keyup":return yp.indexOf(t.keyCode)!==-1;case"keydown":return t.keyCode!==229;case"keypress":case"mousedown":case"focusout":return!0;default:return!1}}function ec(e){return e=e.detail,typeof e=="object"&&"data"in e?e.data:null}var pn=!1;function wp(e,t){switch(e){case"compositionend":return ec(t);case"keypress":return t.which!==32?null:(iu=!0,lu);case"textInput":return e=t.data,e===lu&&iu?null:e;default:return null}}function kp(e,t){if(pn)return e==="compositionend"||!Ji&&Zs(e,t)?(e=Gs(),ro=Ki=_t=null,pn=!1,e):null;switch(e){case"paste":return null;case"keypress":if(!(t.ctrlKey||t.altKey||t.metaKey)||t.ctrlKey&&t.altKey){if(t.char&&1<t.char.length)return t.char;if(t.which)return String.fromCharCode(t.which)}return null;case"compositionend":return qs&&t.locale!=="ko"?null:t.data;default:return null}}var Sp={color:!0,date:!0,datetime:!0,"datetime-local":!0,email:!0,month:!0,number:!0,password:!0,range:!0,search:!0,tel:!0,text:!0,time:!0,url:!0,week:!0};function au(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t==="input"?!!Sp[e.type]:t==="textarea"}function tc(e,t,n,r){Os(r),t=wo(t,"onChange"),0<t.length&&(n=new Yi("onChange","change",null,n,r),e.push({event:n,listeners:t}))}var or=null,gr=null;function _p(e){fc(e,0)}function Ao(e){var t=gn(e);if(Es(t))return e}function Cp(e,t){if(e==="change")return t}var nc=!1;if(ft){var Sl;if(ft){var _l="oninput"in document;if(!_l){var uu=document.createElement("div");uu.setAttribute("oninput","return;"),_l=typeof uu.oninput=="function"}Sl=_l}else Sl=!1;nc=Sl&&(!document.documentMode||9<document.documentMode)}function su(){or&&(or.detachEvent("onpropertychange",rc),gr=or=null)}function rc(e){if(e.propertyName==="value"&&Ao(gr)){var t=[];tc(t,gr,e,Bi(e)),Ds(_p,t)}}function Ep(e,t,n){e==="focusin"?(su(),or=t,gr=n,or.attachEvent("onpropertychange",rc)):e==="focusout"&&su()}function Np(e){if(e==="selectionchange"||e==="keyup"||e==="keydown")return Ao(gr)}function zp(e,t){if(e==="click")return Ao(t)}function jp(e,t){if(e==="input"||e==="change")return Ao(t)}function Pp(e,t){return e===t&&(e!==0||1/e===1/t)||e!==e&&t!==t}var Je=typeof Object.is=="function"?Object.is:Pp;function vr(e,t){if(Je(e,t))return!0;if(typeof e!="object"||e===null||typeof t!="object"||t===null)return!1;var n=Object.keys(e),r=Object.keys(t);if(n.length!==r.length)return!1;for(r=0;r<n.length;r++){var o=n[r];if(!Al.call(t,o)||!Je(e[o],t[o]))return!1}return!0}function cu(e){for(;e&&e.firstChild;)e=e.firstChild;return e}function du(e,t){var n=cu(e);e=0;for(var r;n;){if(n.nodeType===3){if(r=e+n.textContent.length,e<=t&&r>=t)return{node:n,offset:t-e};e=r}e:{for(;n;){if(n.nextSibling){n=n.nextSibling;break e}n=n.parentNode}n=void 0}n=cu(n)}}function oc(e,t){return e&&t?e===t?!0:e&&e.nodeType===3?!1:t&&t.nodeType===3?oc(e,t.parentNode):"contains"in e?e.contains(t):e.compareDocumentPosition?!!(e.compareDocumentPosition(t)&16):!1:!1}function lc(){for(var e=window,t=po();t instanceof e.HTMLIFrameElement;){try{var n=typeof t.contentWindow.location.href=="string"}catch{n=!1}if(n)e=t.contentWindow;else break;t=po(e.document)}return t}function Gi(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t&&(t==="input"&&(e.type==="text"||e.type==="search"||e.type==="tel"||e.type==="url"||e.type==="password")||t==="textarea"||e.contentEditable==="true")}function Tp(e){var t=lc(),n=e.focusedElem,r=e.selectionRange;if(t!==n&&n&&n.ownerDocument&&oc(n.ownerDocument.documentElement,n)){if(r!==null&&Gi(n)){if(t=r.start,e=r.end,e===void 0&&(e=t),"selectionStart"in n)n.selectionStart=t,n.selectionEnd=Math.min(e,n.value.length);else if(e=(t=n.ownerDocument||document)&&t.defaultView||window,e.getSelection){e=e.getSelection();var o=n.textContent.length,l=Math.min(r.start,o);r=r.end===void 0?l:Math.min(r.end,o),!e.extend&&l>r&&(o=r,r=l,l=o),o=du(n,l);var i=du(n,r);o&&i&&(e.rangeCount!==1||e.anchorNode!==o.node||e.anchorOffset!==o.offset||e.focusNode!==i.node||e.focusOffset!==i.offset)&&(t=t.createRange(),t.setStart(o.node,o.offset),e.removeAllRanges(),l>r?(e.addRange(t),e.extend(i.node,i.offset)):(t.setEnd(i.node,i.offset),e.addRange(t)))}}for(t=[],e=n;e=e.parentNode;)e.nodeType===1&&t.push({element:e,left:e.scrollLeft,top:e.scrollTop});for(typeof n.focus=="function"&&n.focus(),n=0;n<t.length;n++)e=t[n],e.element.scrollLeft=e.left,e.element.scrollTop=e.top}}var Lp=ft&&"documentMode"in document&&11>=document.documentMode,mn=null,li=null,lr=null,ii=!1;function fu(e,t,n){var r=n.window===n?n.document:n.nodeType===9?n:n.ownerDocument;ii||mn==null||mn!==po(r)||(r=mn,"selectionStart"in r&&Gi(r)?r={start:r.selectionStart,end:r.selectionEnd}:(r=(r.ownerDocument&&r.ownerDocument.defaultView||window).getSelection(),r={anchorNode:r.anchorNode,anchorOffset:r.anchorOffset,focusNode:r.focusNode,focusOffset:r.focusOffset}),lr&&vr(lr,r)||(lr=r,r=wo(li,"onSelect"),0<r.length&&(t=new Yi("onSelect","select",null,t,n),e.push({event:t,listeners:r}),t.target=mn)))}function Qr(e,t){var n={};return n[e.toLowerCase()]=t.toLowerCase(),n["Webkit"+e]="webkit"+t,n["Moz"+e]="moz"+t,n}var hn={animationend:Qr("Animation","AnimationEnd"),animationiteration:Qr("Animation","AnimationIteration"),animationstart:Qr("Animation","AnimationStart"),transitionend:Qr("Transition","TransitionEnd")},Cl={},ic={};ft&&(ic=document.createElement("div").style,"AnimationEvent"in window||(delete hn.animationend.animation,delete hn.animationiteration.animation,delete hn.animationstart.animation),"TransitionEvent"in window||delete hn.transitionend.transition);function Uo(e){if(Cl[e])return Cl[e];if(!hn[e])return e;var t=hn[e],n;for(n in t)if(t.hasOwnProperty(n)&&n in ic)return Cl[e]=t[n];return e}var ac=Uo("animationend"),uc=Uo("animationiteration"),sc=Uo("animationstart"),cc=Uo("transitionend"),dc=new Map,pu="abort auxClick cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");function Rt(e,t){dc.set(e,t),tn(t,[e])}for(var El=0;El<pu.length;El++){var Nl=pu[El],Op=Nl.toLowerCase(),Ip=Nl[0].toUpperCase()+Nl.slice(1);Rt(Op,"on"+Ip)}Rt(ac,"onAnimationEnd");Rt(uc,"onAnimationIteration");Rt(sc,"onAnimationStart");Rt("dblclick","onDoubleClick");Rt("focusin","onFocus");Rt("focusout","onBlur");Rt(cc,"onTransitionEnd");Tn("onMouseEnter",["mouseout","mouseover"]);Tn("onMouseLeave",["mouseout","mouseover"]);Tn("onPointerEnter",["pointerout","pointerover"]);Tn("onPointerLeave",["pointerout","pointerover"]);tn("onChange","change click focusin focusout input keydown keyup selectionchange".split(" "));tn("onSelect","focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" "));tn("onBeforeInput",["compositionend","keypress","textInput","paste"]);tn("onCompositionEnd","compositionend focusout keydown keypress keyup mousedown".split(" "));tn("onCompositionStart","compositionstart focusout keydown keypress keyup mousedown".split(" "));tn("onCompositionUpdate","compositionupdate focusout keydown keypress keyup mousedown".split(" "));var er="abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "),Mp=new Set("cancel close invalid load scroll toggle".split(" ").concat(er));function mu(e,t,n){var r=e.type||"unknown-event";e.currentTarget=n,Of(r,t,void 0,e),e.currentTarget=null}function fc(e,t){t=(t&4)!==0;for(var n=0;n<e.length;n++){var r=e[n],o=r.event;r=r.listeners;e:{var l=void 0;if(t)for(var i=r.length-1;0<=i;i--){var a=r[i],u=a.instance,d=a.currentTarget;if(a=a.listener,u!==l&&o.isPropagationStopped())break e;mu(o,a,d),l=u}else for(i=0;i<r.length;i++){if(a=r[i],u=a.instance,d=a.currentTarget,a=a.listener,u!==l&&o.isPropagationStopped())break e;mu(o,a,d),l=u}}}if(ho)throw e=ti,ho=!1,ti=null,e}function H(e,t){var n=t[di];n===void 0&&(n=t[di]=new Set);var r=e+"__bubble";n.has(r)||(pc(t,e,2,!1),n.add(r))}function zl(e,t,n){var r=0;t&&(r|=4),pc(n,e,r,t)}var Hr="_reactListening"+Math.random().toString(36).slice(2);function yr(e){if(!e[Hr]){e[Hr]=!0,ws.forEach(function(n){n!=="selectionchange"&&(Mp.has(n)||zl(n,!1,e),zl(n,!0,e))});var t=e.nodeType===9?e:e.ownerDocument;t===null||t[Hr]||(t[Hr]=!0,zl("selectionchange",!1,t))}}function pc(e,t,n,r){switch(Js(t)){case 1:var o=Yf;break;case 4:o=Xf;break;default:o=Wi}n=o.bind(null,t,n,e),o=void 0,!ei||t!=="touchstart"&&t!=="touchmove"&&t!=="wheel"||(o=!0),r?o!==void 0?e.addEventListener(t,n,{capture:!0,passive:o}):e.addEventListener(t,n,!0):o!==void 0?e.addEventListener(t,n,{passive:o}):e.addEventListener(t,n,!1)}function jl(e,t,n,r,o){var l=r;if(!(t&1)&&!(t&2)&&r!==null)e:for(;;){if(r===null)return;var i=r.tag;if(i===3||i===4){var a=r.stateNode.containerInfo;if(a===o||a.nodeType===8&&a.parentNode===o)break;if(i===4)for(i=r.return;i!==null;){var u=i.tag;if((u===3||u===4)&&(u=i.stateNode.containerInfo,u===o||u.nodeType===8&&u.parentNode===o))return;i=i.return}for(;a!==null;){if(i=Ht(a),i===null)return;if(u=i.tag,u===5||u===6){r=l=i;continue e}a=a.parentNode}}r=r.return}Ds(function(){var d=l,y=Bi(n),g=[];e:{var h=dc.get(e);if(h!==void 0){var S=Yi,_=e;switch(e){case"keypress":if(oo(n)===0)break e;case"keydown":case"keyup":S=cp;break;case"focusin":_="focus",S=kl;break;case"focusout":_="blur",S=kl;break;case"beforeblur":case"afterblur":S=kl;break;case"click":if(n.button===2)break e;case"auxclick":case"dblclick":case"mousedown":case"mousemove":case"mouseup":case"mouseout":case"mouseover":case"contextmenu":S=nu;break;case"drag":case"dragend":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"dragstart":case"drop":S=qf;break;case"touchcancel":case"touchend":case"touchmove":case"touchstart":S=pp;break;case ac:case uc:case sc:S=tp;break;case cc:S=hp;break;case"scroll":S=Jf;break;case"wheel":S=vp;break;case"copy":case"cut":case"paste":S=rp;break;case"gotpointercapture":case"lostpointercapture":case"pointercancel":case"pointerdown":case"pointermove":case"pointerout":case"pointerover":case"pointerup":S=ou}var k=(t&4)!==0,O=!k&&e==="scroll",f=k?h!==null?h+"Capture":null:h;k=[];for(var c=d,m;c!==null;){m=c;var x=m.stateNode;if(m.tag===5&&x!==null&&(m=x,f!==null&&(x=fr(c,f),x!=null&&k.push(xr(c,x,m)))),O)break;c=c.return}0<k.length&&(h=new S(h,_,null,n,y),g.push({event:h,listeners:k}))}}if(!(t&7)){e:{if(h=e==="mouseover"||e==="pointerover",S=e==="mouseout"||e==="pointerout",h&&n!==ql&&(_=n.relatedTarget||n.fromElement)&&(Ht(_)||_[pt]))break e;if((S||h)&&(h=y.window===y?y:(h=y.ownerDocument)?h.defaultView||h.parentWindow:window,S?(_=n.relatedTarget||n.toElement,S=d,_=_?Ht(_):null,_!==null&&(O=nn(_),_!==O||_.tag!==5&&_.tag!==6)&&(_=null)):(S=null,_=d),S!==_)){if(k=nu,x="onMouseLeave",f="onMouseEnter",c="mouse",(e==="pointerout"||e==="pointerover")&&(k=ou,x="onPointerLeave",f="onPointerEnter",c="pointer"),O=S==null?h:gn(S),m=_==null?h:gn(_),h=new k(x,c+"leave",S,n,y),h.target=O,h.relatedTarget=m,x=null,Ht(y)===d&&(k=new k(f,c+"enter",_,n,y),k.target=m,k.relatedTarget=O,x=k),O=x,S&&_)t:{for(k=S,f=_,c=0,m=k;m;m=sn(m))c++;for(m=0,x=f;x;x=sn(x))m++;for(;0<c-m;)k=sn(k),c--;for(;0<m-c;)f=sn(f),m--;for(;c--;){if(k===f||f!==null&&k===f.alternate)break t;k=sn(k),f=sn(f)}k=null}else k=null;S!==null&&hu(g,h,S,k,!1),_!==null&&O!==null&&hu(g,O,_,k,!0)}}e:{if(h=d?gn(d):window,S=h.nodeName&&h.nodeName.toLowerCase(),S==="select"||S==="input"&&h.type==="file")var C=Cp;else if(au(h))if(nc)C=jp;else{C=Np;var j=Ep}else(S=h.nodeName)&&S.toLowerCase()==="input"&&(h.type==="checkbox"||h.type==="radio")&&(C=zp);if(C&&(C=C(e,d))){tc(g,C,n,y);break e}j&&j(e,h,d),e==="focusout"&&(j=h._wrapperState)&&j.controlled&&h.type==="number"&&Kl(h,"number",h.value)}switch(j=d?gn(d):window,e){case"focusin":(au(j)||j.contentEditable==="true")&&(mn=j,li=d,lr=null);break;case"focusout":lr=li=mn=null;break;case"mousedown":ii=!0;break;case"contextmenu":case"mouseup":case"dragend":ii=!1,fu(g,n,y);break;case"selectionchange":if(Lp)break;case"keydown":case"keyup":fu(g,n,y)}var P;if(Ji)e:{switch(e){case"compositionstart":var T="onCompositionStart";break e;case"compositionend":T="onCompositionEnd";break e;case"compositionupdate":T="onCompositionUpdate";break e}T=void 0}else pn?Zs(e,n)&&(T="onCompositionEnd"):e==="keydown"&&n.keyCode===229&&(T="onCompositionStart");T&&(qs&&n.locale!=="ko"&&(pn||T!=="onCompositionStart"?T==="onCompositionEnd"&&pn&&(P=Gs()):(_t=y,Ki="value"in _t?_t.value:_t.textContent,pn=!0)),j=wo(d,T),0<j.length&&(T=new ru(T,e,null,n,y),g.push({event:T,listeners:j}),P?T.data=P:(P=ec(n),P!==null&&(T.data=P)))),(P=xp?wp(e,n):kp(e,n))&&(d=wo(d,"onBeforeInput"),0<d.length&&(y=new ru("onBeforeInput","beforeinput",null,n,y),g.push({event:y,listeners:d}),y.data=P))}fc(g,t)})}function xr(e,t,n){return{instance:e,listener:t,currentTarget:n}}function wo(e,t){for(var n=t+"Capture",r=[];e!==null;){var o=e,l=o.stateNode;o.tag===5&&l!==null&&(o=l,l=fr(e,n),l!=null&&r.unshift(xr(e,l,o)),l=fr(e,t),l!=null&&r.push(xr(e,l,o))),e=e.return}return r}function sn(e){if(e===null)return null;do e=e.return;while(e&&e.tag!==5);return e||null}function hu(e,t,n,r,o){for(var l=t._reactName,i=[];n!==null&&n!==r;){var a=n,u=a.alternate,d=a.stateNode;if(u!==null&&u===r)break;a.tag===5&&d!==null&&(a=d,o?(u=fr(n,l),u!=null&&i.unshift(xr(n,u,a))):o||(u=fr(n,l),u!=null&&i.push(xr(n,u,a)))),n=n.return}i.length!==0&&e.push({event:t,listeners:i})}var Rp=/\r\n?/g,Dp=/\u0000|\uFFFD/g;function gu(e){return(typeof e=="string"?e:""+e).replace(Rp,`
`).replace(Dp,"")}function Wr(e,t,n){if(t=gu(t),gu(e)!==t&&n)throw Error(w(425))}function ko(){}var ai=null,ui=null;function si(e,t){return e==="textarea"||e==="noscript"||typeof t.children=="string"||typeof t.children=="number"||typeof t.dangerouslySetInnerHTML=="object"&&t.dangerouslySetInnerHTML!==null&&t.dangerouslySetInnerHTML.__html!=null}var ci=typeof setTimeout=="function"?setTimeout:void 0,bp=typeof clearTimeout=="function"?clearTimeout:void 0,vu=typeof Promise=="function"?Promise:void 0,Fp=typeof queueMicrotask=="function"?queueMicrotask:typeof vu<"u"?function(e){return vu.resolve(null).then(e).catch($p)}:ci;function $p(e){setTimeout(function(){throw e})}function Pl(e,t){var n=t,r=0;do{var o=n.nextSibling;if(e.removeChild(n),o&&o.nodeType===8)if(n=o.data,n==="/$"){if(r===0){e.removeChild(o),hr(t);return}r--}else n!=="$"&&n!=="$?"&&n!=="$!"||r++;n=o}while(n);hr(t)}function jt(e){for(;e!=null;e=e.nextSibling){var t=e.nodeType;if(t===1||t===3)break;if(t===8){if(t=e.data,t==="$"||t==="$!"||t==="$?")break;if(t==="/$")return null}}return e}function yu(e){e=e.previousSibling;for(var t=0;e;){if(e.nodeType===8){var n=e.data;if(n==="$"||n==="$!"||n==="$?"){if(t===0)return e;t--}else n==="/$"&&t++}e=e.previousSibling}return null}var An=Math.random().toString(36).slice(2),Ze="__reactFiber$"+An,wr="__reactProps$"+An,pt="__reactContainer$"+An,di="__reactEvents$"+An,Ap="__reactListeners$"+An,Up="__reactHandles$"+An;function Ht(e){var t=e[Ze];if(t)return t;for(var n=e.parentNode;n;){if(t=n[pt]||n[Ze]){if(n=t.alternate,t.child!==null||n!==null&&n.child!==null)for(e=yu(e);e!==null;){if(n=e[Ze])return n;e=yu(e)}return t}e=n,n=e.parentNode}return null}function Lr(e){return e=e[Ze]||e[pt],!e||e.tag!==5&&e.tag!==6&&e.tag!==13&&e.tag!==3?null:e}function gn(e){if(e.tag===5||e.tag===6)return e.stateNode;throw Error(w(33))}function Bo(e){return e[wr]||null}var fi=[],vn=-1;function Dt(e){return{current:e}}function W(e){0>vn||(e.current=fi[vn],fi[vn]=null,vn--)}function Q(e,t){vn++,fi[vn]=e.current,e.current=t}var Mt={},me=Dt(Mt),Ce=Dt(!1),Jt=Mt;function Ln(e,t){var n=e.type.contextTypes;if(!n)return Mt;var r=e.stateNode;if(r&&r.__reactInternalMemoizedUnmaskedChildContext===t)return r.__reactInternalMemoizedMaskedChildContext;var o={},l;for(l in n)o[l]=t[l];return r&&(e=e.stateNode,e.__reactInternalMemoizedUnmaskedChildContext=t,e.__reactInternalMemoizedMaskedChildContext=o),o}function Ee(e){return e=e.childContextTypes,e!=null}function So(){W(Ce),W(me)}function xu(e,t,n){if(me.current!==Mt)throw Error(w(168));Q(me,t),Q(Ce,n)}function mc(e,t,n){var r=e.stateNode;if(t=t.childContextTypes,typeof r.getChildContext!="function")return n;r=r.getChildContext();for(var o in r)if(!(o in t))throw Error(w(108,Ef(e)||"Unknown",o));return G({},n,r)}function _o(e){return e=(e=e.stateNode)&&e.__reactInternalMemoizedMergedChildContext||Mt,Jt=me.current,Q(me,e),Q(Ce,Ce.current),!0}function wu(e,t,n){var r=e.stateNode;if(!r)throw Error(w(169));n?(e=mc(e,t,Jt),r.__reactInternalMemoizedMergedChildContext=e,W(Ce),W(me),Q(me,e)):W(Ce),Q(Ce,n)}var ut=null,Vo=!1,Tl=!1;function hc(e){ut===null?ut=[e]:ut.push(e)}function Bp(e){Vo=!0,hc(e)}function bt(){if(!Tl&&ut!==null){Tl=!0;var e=0,t=U;try{var n=ut;for(U=1;e<n.length;e++){var r=n[e];do r=r(!0);while(r!==null)}ut=null,Vo=!1}catch(o){throw ut!==null&&(ut=ut.slice(e+1)),As(Vi,bt),o}finally{U=t,Tl=!1}}return null}var yn=[],xn=0,Co=null,Eo=0,De=[],be=0,Gt=null,st=1,ct="";function Vt(e,t){yn[xn++]=Eo,yn[xn++]=Co,Co=e,Eo=t}function gc(e,t,n){De[be++]=st,De[be++]=ct,De[be++]=Gt,Gt=e;var r=st;e=ct;var o=32-Ye(r)-1;r&=~(1<<o),n+=1;var l=32-Ye(t)+o;if(30<l){var i=o-o%5;l=(r&(1<<i)-1).toString(32),r>>=i,o-=i,st=1<<32-Ye(t)+o|n<<o|r,ct=l+e}else st=1<<l|n<<o|r,ct=e}function qi(e){e.return!==null&&(Vt(e,1),gc(e,1,0))}function Zi(e){for(;e===Co;)Co=yn[--xn],yn[xn]=null,Eo=yn[--xn],yn[xn]=null;for(;e===Gt;)Gt=De[--be],De[be]=null,ct=De[--be],De[be]=null,st=De[--be],De[be]=null}var Te=null,Pe=null,Y=!1,Ke=null;function vc(e,t){var n=Fe(5,null,null,0);n.elementType="DELETED",n.stateNode=t,n.return=e,t=e.deletions,t===null?(e.deletions=[n],e.flags|=16):t.push(n)}function ku(e,t){switch(e.tag){case 5:var n=e.type;return t=t.nodeType!==1||n.toLowerCase()!==t.nodeName.toLowerCase()?null:t,t!==null?(e.stateNode=t,Te=e,Pe=jt(t.firstChild),!0):!1;case 6:return t=e.pendingProps===""||t.nodeType!==3?null:t,t!==null?(e.stateNode=t,Te=e,Pe=null,!0):!1;case 13:return t=t.nodeType!==8?null:t,t!==null?(n=Gt!==null?{id:st,overflow:ct}:null,e.memoizedState={dehydrated:t,treeContext:n,retryLane:1073741824},n=Fe(18,null,null,0),n.stateNode=t,n.return=e,e.child=n,Te=e,Pe=null,!0):!1;default:return!1}}function pi(e){return(e.mode&1)!==0&&(e.flags&128)===0}function mi(e){if(Y){var t=Pe;if(t){var n=t;if(!ku(e,t)){if(pi(e))throw Error(w(418));t=jt(n.nextSibling);var r=Te;t&&ku(e,t)?vc(r,n):(e.flags=e.flags&-4097|2,Y=!1,Te=e)}}else{if(pi(e))throw Error(w(418));e.flags=e.flags&-4097|2,Y=!1,Te=e}}}function Su(e){for(e=e.return;e!==null&&e.tag!==5&&e.tag!==3&&e.tag!==13;)e=e.return;Te=e}function Kr(e){if(e!==Te)return!1;if(!Y)return Su(e),Y=!0,!1;var t;if((t=e.tag!==3)&&!(t=e.tag!==5)&&(t=e.type,t=t!=="head"&&t!=="body"&&!si(e.type,e.memoizedProps)),t&&(t=Pe)){if(pi(e))throw yc(),Error(w(418));for(;t;)vc(e,t),t=jt(t.nextSibling)}if(Su(e),e.tag===13){if(e=e.memoizedState,e=e!==null?e.dehydrated:null,!e)throw Error(w(317));e:{for(e=e.nextSibling,t=0;e;){if(e.nodeType===8){var n=e.data;if(n==="/$"){if(t===0){Pe=jt(e.nextSibling);break e}t--}else n!=="$"&&n!=="$!"&&n!=="$?"||t++}e=e.nextSibling}Pe=null}}else Pe=Te?jt(e.stateNode.nextSibling):null;return!0}function yc(){for(var e=Pe;e;)e=jt(e.nextSibling)}function On(){Pe=Te=null,Y=!1}function ea(e){Ke===null?Ke=[e]:Ke.push(e)}var Vp=gt.ReactCurrentBatchConfig;function Yn(e,t,n){if(e=n.ref,e!==null&&typeof e!="function"&&typeof e!="object"){if(n._owner){if(n=n._owner,n){if(n.tag!==1)throw Error(w(309));var r=n.stateNode}if(!r)throw Error(w(147,e));var o=r,l=""+e;return t!==null&&t.ref!==null&&typeof t.ref=="function"&&t.ref._stringRef===l?t.ref:(t=function(i){var a=o.refs;i===null?delete a[l]:a[l]=i},t._stringRef=l,t)}if(typeof e!="string")throw Error(w(284));if(!n._owner)throw Error(w(290,e))}return e}function Yr(e,t){throw e=Object.prototype.toString.call(t),Error(w(31,e==="[object Object]"?"object with keys {"+Object.keys(t).join(", ")+"}":e))}function _u(e){var t=e._init;return t(e._payload)}function xc(e){function t(f,c){if(e){var m=f.deletions;m===null?(f.deletions=[c],f.flags|=16):m.push(c)}}function n(f,c){if(!e)return null;for(;c!==null;)t(f,c),c=c.sibling;return null}function r(f,c){for(f=new Map;c!==null;)c.key!==null?f.set(c.key,c):f.set(c.index,c),c=c.sibling;return f}function o(f,c){return f=Ot(f,c),f.index=0,f.sibling=null,f}function l(f,c,m){return f.index=m,e?(m=f.alternate,m!==null?(m=m.index,m<c?(f.flags|=2,c):m):(f.flags|=2,c)):(f.flags|=1048576,c)}function i(f){return e&&f.alternate===null&&(f.flags|=2),f}function a(f,c,m,x){return c===null||c.tag!==6?(c=bl(m,f.mode,x),c.return=f,c):(c=o(c,m),c.return=f,c)}function u(f,c,m,x){var C=m.type;return C===fn?y(f,c,m.props.children,x,m.key):c!==null&&(c.elementType===C||typeof C=="object"&&C!==null&&C.$$typeof===xt&&_u(C)===c.type)?(x=o(c,m.props),x.ref=Yn(f,c,m),x.return=f,x):(x=fo(m.type,m.key,m.props,null,f.mode,x),x.ref=Yn(f,c,m),x.return=f,x)}function d(f,c,m,x){return c===null||c.tag!==4||c.stateNode.containerInfo!==m.containerInfo||c.stateNode.implementation!==m.implementation?(c=Fl(m,f.mode,x),c.return=f,c):(c=o(c,m.children||[]),c.return=f,c)}function y(f,c,m,x,C){return c===null||c.tag!==7?(c=Xt(m,f.mode,x,C),c.return=f,c):(c=o(c,m),c.return=f,c)}function g(f,c,m){if(typeof c=="string"&&c!==""||typeof c=="number")return c=bl(""+c,f.mode,m),c.return=f,c;if(typeof c=="object"&&c!==null){switch(c.$$typeof){case br:return m=fo(c.type,c.key,c.props,null,f.mode,m),m.ref=Yn(f,null,c),m.return=f,m;case dn:return c=Fl(c,f.mode,m),c.return=f,c;case xt:var x=c._init;return g(f,x(c._payload),m)}if(qn(c)||Vn(c))return c=Xt(c,f.mode,m,null),c.return=f,c;Yr(f,c)}return null}function h(f,c,m,x){var C=c!==null?c.key:null;if(typeof m=="string"&&m!==""||typeof m=="number")return C!==null?null:a(f,c,""+m,x);if(typeof m=="object"&&m!==null){switch(m.$$typeof){case br:return m.key===C?u(f,c,m,x):null;case dn:return m.key===C?d(f,c,m,x):null;case xt:return C=m._init,h(f,c,C(m._payload),x)}if(qn(m)||Vn(m))return C!==null?null:y(f,c,m,x,null);Yr(f,m)}return null}function S(f,c,m,x,C){if(typeof x=="string"&&x!==""||typeof x=="number")return f=f.get(m)||null,a(c,f,""+x,C);if(typeof x=="object"&&x!==null){switch(x.$$typeof){case br:return f=f.get(x.key===null?m:x.key)||null,u(c,f,x,C);case dn:return f=f.get(x.key===null?m:x.key)||null,d(c,f,x,C);case xt:var j=x._init;return S(f,c,m,j(x._payload),C)}if(qn(x)||Vn(x))return f=f.get(m)||null,y(c,f,x,C,null);Yr(c,x)}return null}function _(f,c,m,x){for(var C=null,j=null,P=c,T=c=0,B=null;P!==null&&T<m.length;T++){P.index>T?(B=P,P=null):B=P.sibling;var b=h(f,P,m[T],x);if(b===null){P===null&&(P=B);break}e&&P&&b.alternate===null&&t(f,P),c=l(b,c,T),j===null?C=b:j.sibling=b,j=b,P=B}if(T===m.length)return n(f,P),Y&&Vt(f,T),C;if(P===null){for(;T<m.length;T++)P=g(f,m[T],x),P!==null&&(c=l(P,c,T),j===null?C=P:j.sibling=P,j=P);return Y&&Vt(f,T),C}for(P=r(f,P);T<m.length;T++)B=S(P,f,T,m[T],x),B!==null&&(e&&B.alternate!==null&&P.delete(B.key===null?T:B.key),c=l(B,c,T),j===null?C=B:j.sibling=B,j=B);return e&&P.forEach(function(ze){return t(f,ze)}),Y&&Vt(f,T),C}function k(f,c,m,x){var C=Vn(m);if(typeof C!="function")throw Error(w(150));if(m=C.call(m),m==null)throw Error(w(151));for(var j=C=null,P=c,T=c=0,B=null,b=m.next();P!==null&&!b.done;T++,b=m.next()){P.index>T?(B=P,P=null):B=P.sibling;var ze=h(f,P,b.value,x);if(ze===null){P===null&&(P=B);break}e&&P&&ze.alternate===null&&t(f,P),c=l(ze,c,T),j===null?C=ze:j.sibling=ze,j=ze,P=B}if(b.done)return n(f,P),Y&&Vt(f,T),C;if(P===null){for(;!b.done;T++,b=m.next())b=g(f,b.value,x),b!==null&&(c=l(b,c,T),j===null?C=b:j.sibling=b,j=b);return Y&&Vt(f,T),C}for(P=r(f,P);!b.done;T++,b=m.next())b=S(P,f,T,b.value,x),b!==null&&(e&&b.alternate!==null&&P.delete(b.key===null?T:b.key),c=l(b,c,T),j===null?C=b:j.sibling=b,j=b);return e&&P.forEach(function(nt){return t(f,nt)}),Y&&Vt(f,T),C}function O(f,c,m,x){if(typeof m=="object"&&m!==null&&m.type===fn&&m.key===null&&(m=m.props.children),typeof m=="object"&&m!==null){switch(m.$$typeof){case br:e:{for(var C=m.key,j=c;j!==null;){if(j.key===C){if(C=m.type,C===fn){if(j.tag===7){n(f,j.sibling),c=o(j,m.props.children),c.return=f,f=c;break e}}else if(j.elementType===C||typeof C=="object"&&C!==null&&C.$$typeof===xt&&_u(C)===j.type){n(f,j.sibling),c=o(j,m.props),c.ref=Yn(f,j,m),c.return=f,f=c;break e}n(f,j);break}else t(f,j);j=j.sibling}m.type===fn?(c=Xt(m.props.children,f.mode,x,m.key),c.return=f,f=c):(x=fo(m.type,m.key,m.props,null,f.mode,x),x.ref=Yn(f,c,m),x.return=f,f=x)}return i(f);case dn:e:{for(j=m.key;c!==null;){if(c.key===j)if(c.tag===4&&c.stateNode.containerInfo===m.containerInfo&&c.stateNode.implementation===m.implementation){n(f,c.sibling),c=o(c,m.children||[]),c.return=f,f=c;break e}else{n(f,c);break}else t(f,c);c=c.sibling}c=Fl(m,f.mode,x),c.return=f,f=c}return i(f);case xt:return j=m._init,O(f,c,j(m._payload),x)}if(qn(m))return _(f,c,m,x);if(Vn(m))return k(f,c,m,x);Yr(f,m)}return typeof m=="string"&&m!==""||typeof m=="number"?(m=""+m,c!==null&&c.tag===6?(n(f,c.sibling),c=o(c,m),c.return=f,f=c):(n(f,c),c=bl(m,f.mode,x),c.return=f,f=c),i(f)):n(f,c)}return O}var In=xc(!0),wc=xc(!1),No=Dt(null),zo=null,wn=null,ta=null;function na(){ta=wn=zo=null}function ra(e){var t=No.current;W(No),e._currentValue=t}function hi(e,t,n){for(;e!==null;){var r=e.alternate;if((e.childLanes&t)!==t?(e.childLanes|=t,r!==null&&(r.childLanes|=t)):r!==null&&(r.childLanes&t)!==t&&(r.childLanes|=t),e===n)break;e=e.return}}function zn(e,t){zo=e,ta=wn=null,e=e.dependencies,e!==null&&e.firstContext!==null&&(e.lanes&t&&(ke=!0),e.firstContext=null)}function Ae(e){var t=e._currentValue;if(ta!==e)if(e={context:e,memoizedValue:t,next:null},wn===null){if(zo===null)throw Error(w(308));wn=e,zo.dependencies={lanes:0,firstContext:e}}else wn=wn.next=e;return t}var Wt=null;function oa(e){Wt===null?Wt=[e]:Wt.push(e)}function kc(e,t,n,r){var o=t.interleaved;return o===null?(n.next=n,oa(t)):(n.next=o.next,o.next=n),t.interleaved=n,mt(e,r)}function mt(e,t){e.lanes|=t;var n=e.alternate;for(n!==null&&(n.lanes|=t),n=e,e=e.return;e!==null;)e.childLanes|=t,n=e.alternate,n!==null&&(n.childLanes|=t),n=e,e=e.return;return n.tag===3?n.stateNode:null}var wt=!1;function la(e){e.updateQueue={baseState:e.memoizedState,firstBaseUpdate:null,lastBaseUpdate:null,shared:{pending:null,interleaved:null,lanes:0},effects:null}}function Sc(e,t){e=e.updateQueue,t.updateQueue===e&&(t.updateQueue={baseState:e.baseState,firstBaseUpdate:e.firstBaseUpdate,lastBaseUpdate:e.lastBaseUpdate,shared:e.shared,effects:e.effects})}function dt(e,t){return{eventTime:e,lane:t,tag:0,payload:null,callback:null,next:null}}function Pt(e,t,n){var r=e.updateQueue;if(r===null)return null;if(r=r.shared,$&2){var o=r.pending;return o===null?t.next=t:(t.next=o.next,o.next=t),r.pending=t,mt(e,n)}return o=r.interleaved,o===null?(t.next=t,oa(r)):(t.next=o.next,o.next=t),r.interleaved=t,mt(e,n)}function lo(e,t,n){if(t=t.updateQueue,t!==null&&(t=t.shared,(n&4194240)!==0)){var r=t.lanes;r&=e.pendingLanes,n|=r,t.lanes=n,Qi(e,n)}}function Cu(e,t){var n=e.updateQueue,r=e.alternate;if(r!==null&&(r=r.updateQueue,n===r)){var o=null,l=null;if(n=n.firstBaseUpdate,n!==null){do{var i={eventTime:n.eventTime,lane:n.lane,tag:n.tag,payload:n.payload,callback:n.callback,next:null};l===null?o=l=i:l=l.next=i,n=n.next}while(n!==null);l===null?o=l=t:l=l.next=t}else o=l=t;n={baseState:r.baseState,firstBaseUpdate:o,lastBaseUpdate:l,shared:r.shared,effects:r.effects},e.updateQueue=n;return}e=n.lastBaseUpdate,e===null?n.firstBaseUpdate=t:e.next=t,n.lastBaseUpdate=t}function jo(e,t,n,r){var o=e.updateQueue;wt=!1;var l=o.firstBaseUpdate,i=o.lastBaseUpdate,a=o.shared.pending;if(a!==null){o.shared.pending=null;var u=a,d=u.next;u.next=null,i===null?l=d:i.next=d,i=u;var y=e.alternate;y!==null&&(y=y.updateQueue,a=y.lastBaseUpdate,a!==i&&(a===null?y.firstBaseUpdate=d:a.next=d,y.lastBaseUpdate=u))}if(l!==null){var g=o.baseState;i=0,y=d=u=null,a=l;do{var h=a.lane,S=a.eventTime;if((r&h)===h){y!==null&&(y=y.next={eventTime:S,lane:0,tag:a.tag,payload:a.payload,callback:a.callback,next:null});e:{var _=e,k=a;switch(h=t,S=n,k.tag){case 1:if(_=k.payload,typeof _=="function"){g=_.call(S,g,h);break e}g=_;break e;case 3:_.flags=_.flags&-65537|128;case 0:if(_=k.payload,h=typeof _=="function"?_.call(S,g,h):_,h==null)break e;g=G({},g,h);break e;case 2:wt=!0}}a.callback!==null&&a.lane!==0&&(e.flags|=64,h=o.effects,h===null?o.effects=[a]:h.push(a))}else S={eventTime:S,lane:h,tag:a.tag,payload:a.payload,callback:a.callback,next:null},y===null?(d=y=S,u=g):y=y.next=S,i|=h;if(a=a.next,a===null){if(a=o.shared.pending,a===null)break;h=a,a=h.next,h.next=null,o.lastBaseUpdate=h,o.shared.pending=null}}while(1);if(y===null&&(u=g),o.baseState=u,o.firstBaseUpdate=d,o.lastBaseUpdate=y,t=o.shared.interleaved,t!==null){o=t;do i|=o.lane,o=o.next;while(o!==t)}else l===null&&(o.shared.lanes=0);Zt|=i,e.lanes=i,e.memoizedState=g}}function Eu(e,t,n){if(e=t.effects,t.effects=null,e!==null)for(t=0;t<e.length;t++){var r=e[t],o=r.callback;if(o!==null){if(r.callback=null,r=n,typeof o!="function")throw Error(w(191,o));o.call(r)}}}var Or={},tt=Dt(Or),kr=Dt(Or),Sr=Dt(Or);function Kt(e){if(e===Or)throw Error(w(174));return e}function ia(e,t){switch(Q(Sr,t),Q(kr,e),Q(tt,Or),e=t.nodeType,e){case 9:case 11:t=(t=t.documentElement)?t.namespaceURI:Xl(null,"");break;default:e=e===8?t.parentNode:t,t=e.namespaceURI||null,e=e.tagName,t=Xl(t,e)}W(tt),Q(tt,t)}function Mn(){W(tt),W(kr),W(Sr)}function _c(e){Kt(Sr.current);var t=Kt(tt.current),n=Xl(t,e.type);t!==n&&(Q(kr,e),Q(tt,n))}function aa(e){kr.current===e&&(W(tt),W(kr))}var X=Dt(0);function Po(e){for(var t=e;t!==null;){if(t.tag===13){var n=t.memoizedState;if(n!==null&&(n=n.dehydrated,n===null||n.data==="$?"||n.data==="$!"))return t}else if(t.tag===19&&t.memoizedProps.revealOrder!==void 0){if(t.flags&128)return t}else if(t.child!==null){t.child.return=t,t=t.child;continue}if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return null;t=t.return}t.sibling.return=t.return,t=t.sibling}return null}var Ll=[];function ua(){for(var e=0;e<Ll.length;e++)Ll[e]._workInProgressVersionPrimary=null;Ll.length=0}var io=gt.ReactCurrentDispatcher,Ol=gt.ReactCurrentBatchConfig,qt=0,J=null,re=null,ie=null,To=!1,ir=!1,_r=0,Qp=0;function de(){throw Error(w(321))}function sa(e,t){if(t===null)return!1;for(var n=0;n<t.length&&n<e.length;n++)if(!Je(e[n],t[n]))return!1;return!0}function ca(e,t,n,r,o,l){if(qt=l,J=t,t.memoizedState=null,t.updateQueue=null,t.lanes=0,io.current=e===null||e.memoizedState===null?Yp:Xp,e=n(r,o),ir){l=0;do{if(ir=!1,_r=0,25<=l)throw Error(w(301));l+=1,ie=re=null,t.updateQueue=null,io.current=Jp,e=n(r,o)}while(ir)}if(io.current=Lo,t=re!==null&&re.next!==null,qt=0,ie=re=J=null,To=!1,t)throw Error(w(300));return e}function da(){var e=_r!==0;return _r=0,e}function qe(){var e={memoizedState:null,baseState:null,baseQueue:null,queue:null,next:null};return ie===null?J.memoizedState=ie=e:ie=ie.next=e,ie}function Ue(){if(re===null){var e=J.alternate;e=e!==null?e.memoizedState:null}else e=re.next;var t=ie===null?J.memoizedState:ie.next;if(t!==null)ie=t,re=e;else{if(e===null)throw Error(w(310));re=e,e={memoizedState:re.memoizedState,baseState:re.baseState,baseQueue:re.baseQueue,queue:re.queue,next:null},ie===null?J.memoizedState=ie=e:ie=ie.next=e}return ie}function Cr(e,t){return typeof t=="function"?t(e):t}function Il(e){var t=Ue(),n=t.queue;if(n===null)throw Error(w(311));n.lastRenderedReducer=e;var r=re,o=r.baseQueue,l=n.pending;if(l!==null){if(o!==null){var i=o.next;o.next=l.next,l.next=i}r.baseQueue=o=l,n.pending=null}if(o!==null){l=o.next,r=r.baseState;var a=i=null,u=null,d=l;do{var y=d.lane;if((qt&y)===y)u!==null&&(u=u.next={lane:0,action:d.action,hasEagerState:d.hasEagerState,eagerState:d.eagerState,next:null}),r=d.hasEagerState?d.eagerState:e(r,d.action);else{var g={lane:y,action:d.action,hasEagerState:d.hasEagerState,eagerState:d.eagerState,next:null};u===null?(a=u=g,i=r):u=u.next=g,J.lanes|=y,Zt|=y}d=d.next}while(d!==null&&d!==l);u===null?i=r:u.next=a,Je(r,t.memoizedState)||(ke=!0),t.memoizedState=r,t.baseState=i,t.baseQueue=u,n.lastRenderedState=r}if(e=n.interleaved,e!==null){o=e;do l=o.lane,J.lanes|=l,Zt|=l,o=o.next;while(o!==e)}else o===null&&(n.lanes=0);return[t.memoizedState,n.dispatch]}function Ml(e){var t=Ue(),n=t.queue;if(n===null)throw Error(w(311));n.lastRenderedReducer=e;var r=n.dispatch,o=n.pending,l=t.memoizedState;if(o!==null){n.pending=null;var i=o=o.next;do l=e(l,i.action),i=i.next;while(i!==o);Je(l,t.memoizedState)||(ke=!0),t.memoizedState=l,t.baseQueue===null&&(t.baseState=l),n.lastRenderedState=l}return[l,r]}function Cc(){}function Ec(e,t){var n=J,r=Ue(),o=t(),l=!Je(r.memoizedState,o);if(l&&(r.memoizedState=o,ke=!0),r=r.queue,fa(jc.bind(null,n,r,e),[e]),r.getSnapshot!==t||l||ie!==null&&ie.memoizedState.tag&1){if(n.flags|=2048,Er(9,zc.bind(null,n,r,o,t),void 0,null),ae===null)throw Error(w(349));qt&30||Nc(n,t,o)}return o}function Nc(e,t,n){e.flags|=16384,e={getSnapshot:t,value:n},t=J.updateQueue,t===null?(t={lastEffect:null,stores:null},J.updateQueue=t,t.stores=[e]):(n=t.stores,n===null?t.stores=[e]:n.push(e))}function zc(e,t,n,r){t.value=n,t.getSnapshot=r,Pc(t)&&Tc(e)}function jc(e,t,n){return n(function(){Pc(t)&&Tc(e)})}function Pc(e){var t=e.getSnapshot;e=e.value;try{var n=t();return!Je(e,n)}catch{return!0}}function Tc(e){var t=mt(e,1);t!==null&&Xe(t,e,1,-1)}function Nu(e){var t=qe();return typeof e=="function"&&(e=e()),t.memoizedState=t.baseState=e,e={pending:null,interleaved:null,lanes:0,dispatch:null,lastRenderedReducer:Cr,lastRenderedState:e},t.queue=e,e=e.dispatch=Kp.bind(null,J,e),[t.memoizedState,e]}function Er(e,t,n,r){return e={tag:e,create:t,destroy:n,deps:r,next:null},t=J.updateQueue,t===null?(t={lastEffect:null,stores:null},J.updateQueue=t,t.lastEffect=e.next=e):(n=t.lastEffect,n===null?t.lastEffect=e.next=e:(r=n.next,n.next=e,e.next=r,t.lastEffect=e)),e}function Lc(){return Ue().memoizedState}function ao(e,t,n,r){var o=qe();J.flags|=e,o.memoizedState=Er(1|t,n,void 0,r===void 0?null:r)}function Qo(e,t,n,r){var o=Ue();r=r===void 0?null:r;var l=void 0;if(re!==null){var i=re.memoizedState;if(l=i.destroy,r!==null&&sa(r,i.deps)){o.memoizedState=Er(t,n,l,r);return}}J.flags|=e,o.memoizedState=Er(1|t,n,l,r)}function zu(e,t){return ao(8390656,8,e,t)}function fa(e,t){return Qo(2048,8,e,t)}function Oc(e,t){return Qo(4,2,e,t)}function Ic(e,t){return Qo(4,4,e,t)}function Mc(e,t){if(typeof t=="function")return e=e(),t(e),function(){t(null)};if(t!=null)return e=e(),t.current=e,function(){t.current=null}}function Rc(e,t,n){return n=n!=null?n.concat([e]):null,Qo(4,4,Mc.bind(null,t,e),n)}function pa(){}function Dc(e,t){var n=Ue();t=t===void 0?null:t;var r=n.memoizedState;return r!==null&&t!==null&&sa(t,r[1])?r[0]:(n.memoizedState=[e,t],e)}function bc(e,t){var n=Ue();t=t===void 0?null:t;var r=n.memoizedState;return r!==null&&t!==null&&sa(t,r[1])?r[0]:(e=e(),n.memoizedState=[e,t],e)}function Fc(e,t,n){return qt&21?(Je(n,t)||(n=Vs(),J.lanes|=n,Zt|=n,e.baseState=!0),t):(e.baseState&&(e.baseState=!1,ke=!0),e.memoizedState=n)}function Hp(e,t){var n=U;U=n!==0&&4>n?n:4,e(!0);var r=Ol.transition;Ol.transition={};try{e(!1),t()}finally{U=n,Ol.transition=r}}function $c(){return Ue().memoizedState}function Wp(e,t,n){var r=Lt(e);if(n={lane:r,action:n,hasEagerState:!1,eagerState:null,next:null},Ac(e))Uc(t,n);else if(n=kc(e,t,n,r),n!==null){var o=ge();Xe(n,e,r,o),Bc(n,t,r)}}function Kp(e,t,n){var r=Lt(e),o={lane:r,action:n,hasEagerState:!1,eagerState:null,next:null};if(Ac(e))Uc(t,o);else{var l=e.alternate;if(e.lanes===0&&(l===null||l.lanes===0)&&(l=t.lastRenderedReducer,l!==null))try{var i=t.lastRenderedState,a=l(i,n);if(o.hasEagerState=!0,o.eagerState=a,Je(a,i)){var u=t.interleaved;u===null?(o.next=o,oa(t)):(o.next=u.next,u.next=o),t.interleaved=o;return}}catch{}finally{}n=kc(e,t,o,r),n!==null&&(o=ge(),Xe(n,e,r,o),Bc(n,t,r))}}function Ac(e){var t=e.alternate;return e===J||t!==null&&t===J}function Uc(e,t){ir=To=!0;var n=e.pending;n===null?t.next=t:(t.next=n.next,n.next=t),e.pending=t}function Bc(e,t,n){if(n&4194240){var r=t.lanes;r&=e.pendingLanes,n|=r,t.lanes=n,Qi(e,n)}}var Lo={readContext:Ae,useCallback:de,useContext:de,useEffect:de,useImperativeHandle:de,useInsertionEffect:de,useLayoutEffect:de,useMemo:de,useReducer:de,useRef:de,useState:de,useDebugValue:de,useDeferredValue:de,useTransition:de,useMutableSource:de,useSyncExternalStore:de,useId:de,unstable_isNewReconciler:!1},Yp={readContext:Ae,useCallback:function(e,t){return qe().memoizedState=[e,t===void 0?null:t],e},useContext:Ae,useEffect:zu,useImperativeHandle:function(e,t,n){return n=n!=null?n.concat([e]):null,ao(4194308,4,Mc.bind(null,t,e),n)},useLayoutEffect:function(e,t){return ao(4194308,4,e,t)},useInsertionEffect:function(e,t){return ao(4,2,e,t)},useMemo:function(e,t){var n=qe();return t=t===void 0?null:t,e=e(),n.memoizedState=[e,t],e},useReducer:function(e,t,n){var r=qe();return t=n!==void 0?n(t):t,r.memoizedState=r.baseState=t,e={pending:null,interleaved:null,lanes:0,dispatch:null,lastRenderedReducer:e,lastRenderedState:t},r.queue=e,e=e.dispatch=Wp.bind(null,J,e),[r.memoizedState,e]},useRef:function(e){var t=qe();return e={current:e},t.memoizedState=e},useState:Nu,useDebugValue:pa,useDeferredValue:function(e){return qe().memoizedState=e},useTransition:function(){var e=Nu(!1),t=e[0];return e=Hp.bind(null,e[1]),qe().memoizedState=e,[t,e]},useMutableSource:function(){},useSyncExternalStore:function(e,t,n){var r=J,o=qe();if(Y){if(n===void 0)throw Error(w(407));n=n()}else{if(n=t(),ae===null)throw Error(w(349));qt&30||Nc(r,t,n)}o.memoizedState=n;var l={value:n,getSnapshot:t};return o.queue=l,zu(jc.bind(null,r,l,e),[e]),r.flags|=2048,Er(9,zc.bind(null,r,l,n,t),void 0,null),n},useId:function(){var e=qe(),t=ae.identifierPrefix;if(Y){var n=ct,r=st;n=(r&~(1<<32-Ye(r)-1)).toString(32)+n,t=":"+t+"R"+n,n=_r++,0<n&&(t+="H"+n.toString(32)),t+=":"}else n=Qp++,t=":"+t+"r"+n.toString(32)+":";return e.memoizedState=t},unstable_isNewReconciler:!1},Xp={readContext:Ae,useCallback:Dc,useContext:Ae,useEffect:fa,useImperativeHandle:Rc,useInsertionEffect:Oc,useLayoutEffect:Ic,useMemo:bc,useReducer:Il,useRef:Lc,useState:function(){return Il(Cr)},useDebugValue:pa,useDeferredValue:function(e){var t=Ue();return Fc(t,re.memoizedState,e)},useTransition:function(){var e=Il(Cr)[0],t=Ue().memoizedState;return[e,t]},useMutableSource:Cc,useSyncExternalStore:Ec,useId:$c,unstable_isNewReconciler:!1},Jp={readContext:Ae,useCallback:Dc,useContext:Ae,useEffect:fa,useImperativeHandle:Rc,useInsertionEffect:Oc,useLayoutEffect:Ic,useMemo:bc,useReducer:Ml,useRef:Lc,useState:function(){return Ml(Cr)},useDebugValue:pa,useDeferredValue:function(e){var t=Ue();return re===null?t.memoizedState=e:Fc(t,re.memoizedState,e)},useTransition:function(){var e=Ml(Cr)[0],t=Ue().memoizedState;return[e,t]},useMutableSource:Cc,useSyncExternalStore:Ec,useId:$c,unstable_isNewReconciler:!1};function He(e,t){if(e&&e.defaultProps){t=G({},t),e=e.defaultProps;for(var n in e)t[n]===void 0&&(t[n]=e[n]);return t}return t}function gi(e,t,n,r){t=e.memoizedState,n=n(r,t),n=n==null?t:G({},t,n),e.memoizedState=n,e.lanes===0&&(e.updateQueue.baseState=n)}var Ho={isMounted:function(e){return(e=e._reactInternals)?nn(e)===e:!1},enqueueSetState:function(e,t,n){e=e._reactInternals;var r=ge(),o=Lt(e),l=dt(r,o);l.payload=t,n!=null&&(l.callback=n),t=Pt(e,l,o),t!==null&&(Xe(t,e,o,r),lo(t,e,o))},enqueueReplaceState:function(e,t,n){e=e._reactInternals;var r=ge(),o=Lt(e),l=dt(r,o);l.tag=1,l.payload=t,n!=null&&(l.callback=n),t=Pt(e,l,o),t!==null&&(Xe(t,e,o,r),lo(t,e,o))},enqueueForceUpdate:function(e,t){e=e._reactInternals;var n=ge(),r=Lt(e),o=dt(n,r);o.tag=2,t!=null&&(o.callback=t),t=Pt(e,o,r),t!==null&&(Xe(t,e,r,n),lo(t,e,r))}};function ju(e,t,n,r,o,l,i){return e=e.stateNode,typeof e.shouldComponentUpdate=="function"?e.shouldComponentUpdate(r,l,i):t.prototype&&t.prototype.isPureReactComponent?!vr(n,r)||!vr(o,l):!0}function Vc(e,t,n){var r=!1,o=Mt,l=t.contextType;return typeof l=="object"&&l!==null?l=Ae(l):(o=Ee(t)?Jt:me.current,r=t.contextTypes,l=(r=r!=null)?Ln(e,o):Mt),t=new t(n,l),e.memoizedState=t.state!==null&&t.state!==void 0?t.state:null,t.updater=Ho,e.stateNode=t,t._reactInternals=e,r&&(e=e.stateNode,e.__reactInternalMemoizedUnmaskedChildContext=o,e.__reactInternalMemoizedMaskedChildContext=l),t}function Pu(e,t,n,r){e=t.state,typeof t.componentWillReceiveProps=="function"&&t.componentWillReceiveProps(n,r),typeof t.UNSAFE_componentWillReceiveProps=="function"&&t.UNSAFE_componentWillReceiveProps(n,r),t.state!==e&&Ho.enqueueReplaceState(t,t.state,null)}function vi(e,t,n,r){var o=e.stateNode;o.props=n,o.state=e.memoizedState,o.refs={},la(e);var l=t.contextType;typeof l=="object"&&l!==null?o.context=Ae(l):(l=Ee(t)?Jt:me.current,o.context=Ln(e,l)),o.state=e.memoizedState,l=t.getDerivedStateFromProps,typeof l=="function"&&(gi(e,t,l,n),o.state=e.memoizedState),typeof t.getDerivedStateFromProps=="function"||typeof o.getSnapshotBeforeUpdate=="function"||typeof o.UNSAFE_componentWillMount!="function"&&typeof o.componentWillMount!="function"||(t=o.state,typeof o.componentWillMount=="function"&&o.componentWillMount(),typeof o.UNSAFE_componentWillMount=="function"&&o.UNSAFE_componentWillMount(),t!==o.state&&Ho.enqueueReplaceState(o,o.state,null),jo(e,n,o,r),o.state=e.memoizedState),typeof o.componentDidMount=="function"&&(e.flags|=4194308)}function Rn(e,t){try{var n="",r=t;do n+=Cf(r),r=r.return;while(r);var o=n}catch(l){o=`
Error generating stack: `+l.message+`
`+l.stack}return{value:e,source:t,stack:o,digest:null}}function Rl(e,t,n){return{value:e,source:null,stack:n??null,digest:t??null}}function yi(e,t){try{console.error(t.value)}catch(n){setTimeout(function(){throw n})}}var Gp=typeof WeakMap=="function"?WeakMap:Map;function Qc(e,t,n){n=dt(-1,n),n.tag=3,n.payload={element:null};var r=t.value;return n.callback=function(){Io||(Io=!0,ji=r),yi(e,t)},n}function Hc(e,t,n){n=dt(-1,n),n.tag=3;var r=e.type.getDerivedStateFromError;if(typeof r=="function"){var o=t.value;n.payload=function(){return r(o)},n.callback=function(){yi(e,t)}}var l=e.stateNode;return l!==null&&typeof l.componentDidCatch=="function"&&(n.callback=function(){yi(e,t),typeof r!="function"&&(Tt===null?Tt=new Set([this]):Tt.add(this));var i=t.stack;this.componentDidCatch(t.value,{componentStack:i!==null?i:""})}),n}function Tu(e,t,n){var r=e.pingCache;if(r===null){r=e.pingCache=new Gp;var o=new Set;r.set(t,o)}else o=r.get(t),o===void 0&&(o=new Set,r.set(t,o));o.has(n)||(o.add(n),e=dm.bind(null,e,t,n),t.then(e,e))}function Lu(e){do{var t;if((t=e.tag===13)&&(t=e.memoizedState,t=t!==null?t.dehydrated!==null:!0),t)return e;e=e.return}while(e!==null);return null}function Ou(e,t,n,r,o){return e.mode&1?(e.flags|=65536,e.lanes=o,e):(e===t?e.flags|=65536:(e.flags|=128,n.flags|=131072,n.flags&=-52805,n.tag===1&&(n.alternate===null?n.tag=17:(t=dt(-1,1),t.tag=2,Pt(n,t,1))),n.lanes|=1),e)}var qp=gt.ReactCurrentOwner,ke=!1;function he(e,t,n,r){t.child=e===null?wc(t,null,n,r):In(t,e.child,n,r)}function Iu(e,t,n,r,o){n=n.render;var l=t.ref;return zn(t,o),r=ca(e,t,n,r,l,o),n=da(),e!==null&&!ke?(t.updateQueue=e.updateQueue,t.flags&=-2053,e.lanes&=~o,ht(e,t,o)):(Y&&n&&qi(t),t.flags|=1,he(e,t,r,o),t.child)}function Mu(e,t,n,r,o){if(e===null){var l=n.type;return typeof l=="function"&&!ka(l)&&l.defaultProps===void 0&&n.compare===null&&n.defaultProps===void 0?(t.tag=15,t.type=l,Wc(e,t,l,r,o)):(e=fo(n.type,null,r,t,t.mode,o),e.ref=t.ref,e.return=t,t.child=e)}if(l=e.child,!(e.lanes&o)){var i=l.memoizedProps;if(n=n.compare,n=n!==null?n:vr,n(i,r)&&e.ref===t.ref)return ht(e,t,o)}return t.flags|=1,e=Ot(l,r),e.ref=t.ref,e.return=t,t.child=e}function Wc(e,t,n,r,o){if(e!==null){var l=e.memoizedProps;if(vr(l,r)&&e.ref===t.ref)if(ke=!1,t.pendingProps=r=l,(e.lanes&o)!==0)e.flags&131072&&(ke=!0);else return t.lanes=e.lanes,ht(e,t,o)}return xi(e,t,n,r,o)}function Kc(e,t,n){var r=t.pendingProps,o=r.children,l=e!==null?e.memoizedState:null;if(r.mode==="hidden")if(!(t.mode&1))t.memoizedState={baseLanes:0,cachePool:null,transitions:null},Q(Sn,je),je|=n;else{if(!(n&1073741824))return e=l!==null?l.baseLanes|n:n,t.lanes=t.childLanes=1073741824,t.memoizedState={baseLanes:e,cachePool:null,transitions:null},t.updateQueue=null,Q(Sn,je),je|=e,null;t.memoizedState={baseLanes:0,cachePool:null,transitions:null},r=l!==null?l.baseLanes:n,Q(Sn,je),je|=r}else l!==null?(r=l.baseLanes|n,t.memoizedState=null):r=n,Q(Sn,je),je|=r;return he(e,t,o,n),t.child}function Yc(e,t){var n=t.ref;(e===null&&n!==null||e!==null&&e.ref!==n)&&(t.flags|=512,t.flags|=2097152)}function xi(e,t,n,r,o){var l=Ee(n)?Jt:me.current;return l=Ln(t,l),zn(t,o),n=ca(e,t,n,r,l,o),r=da(),e!==null&&!ke?(t.updateQueue=e.updateQueue,t.flags&=-2053,e.lanes&=~o,ht(e,t,o)):(Y&&r&&qi(t),t.flags|=1,he(e,t,n,o),t.child)}function Ru(e,t,n,r,o){if(Ee(n)){var l=!0;_o(t)}else l=!1;if(zn(t,o),t.stateNode===null)uo(e,t),Vc(t,n,r),vi(t,n,r,o),r=!0;else if(e===null){var i=t.stateNode,a=t.memoizedProps;i.props=a;var u=i.context,d=n.contextType;typeof d=="object"&&d!==null?d=Ae(d):(d=Ee(n)?Jt:me.current,d=Ln(t,d));var y=n.getDerivedStateFromProps,g=typeof y=="function"||typeof i.getSnapshotBeforeUpdate=="function";g||typeof i.UNSAFE_componentWillReceiveProps!="function"&&typeof i.componentWillReceiveProps!="function"||(a!==r||u!==d)&&Pu(t,i,r,d),wt=!1;var h=t.memoizedState;i.state=h,jo(t,r,i,o),u=t.memoizedState,a!==r||h!==u||Ce.current||wt?(typeof y=="function"&&(gi(t,n,y,r),u=t.memoizedState),(a=wt||ju(t,n,a,r,h,u,d))?(g||typeof i.UNSAFE_componentWillMount!="function"&&typeof i.componentWillMount!="function"||(typeof i.componentWillMount=="function"&&i.componentWillMount(),typeof i.UNSAFE_componentWillMount=="function"&&i.UNSAFE_componentWillMount()),typeof i.componentDidMount=="function"&&(t.flags|=4194308)):(typeof i.componentDidMount=="function"&&(t.flags|=4194308),t.memoizedProps=r,t.memoizedState=u),i.props=r,i.state=u,i.context=d,r=a):(typeof i.componentDidMount=="function"&&(t.flags|=4194308),r=!1)}else{i=t.stateNode,Sc(e,t),a=t.memoizedProps,d=t.type===t.elementType?a:He(t.type,a),i.props=d,g=t.pendingProps,h=i.context,u=n.contextType,typeof u=="object"&&u!==null?u=Ae(u):(u=Ee(n)?Jt:me.current,u=Ln(t,u));var S=n.getDerivedStateFromProps;(y=typeof S=="function"||typeof i.getSnapshotBeforeUpdate=="function")||typeof i.UNSAFE_componentWillReceiveProps!="function"&&typeof i.componentWillReceiveProps!="function"||(a!==g||h!==u)&&Pu(t,i,r,u),wt=!1,h=t.memoizedState,i.state=h,jo(t,r,i,o);var _=t.memoizedState;a!==g||h!==_||Ce.current||wt?(typeof S=="function"&&(gi(t,n,S,r),_=t.memoizedState),(d=wt||ju(t,n,d,r,h,_,u)||!1)?(y||typeof i.UNSAFE_componentWillUpdate!="function"&&typeof i.componentWillUpdate!="function"||(typeof i.componentWillUpdate=="function"&&i.componentWillUpdate(r,_,u),typeof i.UNSAFE_componentWillUpdate=="function"&&i.UNSAFE_componentWillUpdate(r,_,u)),typeof i.componentDidUpdate=="function"&&(t.flags|=4),typeof i.getSnapshotBeforeUpdate=="function"&&(t.flags|=1024)):(typeof i.componentDidUpdate!="function"||a===e.memoizedProps&&h===e.memoizedState||(t.flags|=4),typeof i.getSnapshotBeforeUpdate!="function"||a===e.memoizedProps&&h===e.memoizedState||(t.flags|=1024),t.memoizedProps=r,t.memoizedState=_),i.props=r,i.state=_,i.context=u,r=d):(typeof i.componentDidUpdate!="function"||a===e.memoizedProps&&h===e.memoizedState||(t.flags|=4),typeof i.getSnapshotBeforeUpdate!="function"||a===e.memoizedProps&&h===e.memoizedState||(t.flags|=1024),r=!1)}return wi(e,t,n,r,l,o)}function wi(e,t,n,r,o,l){Yc(e,t);var i=(t.flags&128)!==0;if(!r&&!i)return o&&wu(t,n,!1),ht(e,t,l);r=t.stateNode,qp.current=t;var a=i&&typeof n.getDerivedStateFromError!="function"?null:r.render();return t.flags|=1,e!==null&&i?(t.child=In(t,e.child,null,l),t.child=In(t,null,a,l)):he(e,t,a,l),t.memoizedState=r.state,o&&wu(t,n,!0),t.child}function Xc(e){var t=e.stateNode;t.pendingContext?xu(e,t.pendingContext,t.pendingContext!==t.context):t.context&&xu(e,t.context,!1),ia(e,t.containerInfo)}function Du(e,t,n,r,o){return On(),ea(o),t.flags|=256,he(e,t,n,r),t.child}var ki={dehydrated:null,treeContext:null,retryLane:0};function Si(e){return{baseLanes:e,cachePool:null,transitions:null}}function Jc(e,t,n){var r=t.pendingProps,o=X.current,l=!1,i=(t.flags&128)!==0,a;if((a=i)||(a=e!==null&&e.memoizedState===null?!1:(o&2)!==0),a?(l=!0,t.flags&=-129):(e===null||e.memoizedState!==null)&&(o|=1),Q(X,o&1),e===null)return mi(t),e=t.memoizedState,e!==null&&(e=e.dehydrated,e!==null)?(t.mode&1?e.data==="$!"?t.lanes=8:t.lanes=1073741824:t.lanes=1,null):(i=r.children,e=r.fallback,l?(r=t.mode,l=t.child,i={mode:"hidden",children:i},!(r&1)&&l!==null?(l.childLanes=0,l.pendingProps=i):l=Yo(i,r,0,null),e=Xt(e,r,n,null),l.return=t,e.return=t,l.sibling=e,t.child=l,t.child.memoizedState=Si(n),t.memoizedState=ki,e):ma(t,i));if(o=e.memoizedState,o!==null&&(a=o.dehydrated,a!==null))return Zp(e,t,i,r,a,o,n);if(l){l=r.fallback,i=t.mode,o=e.child,a=o.sibling;var u={mode:"hidden",children:r.children};return!(i&1)&&t.child!==o?(r=t.child,r.childLanes=0,r.pendingProps=u,t.deletions=null):(r=Ot(o,u),r.subtreeFlags=o.subtreeFlags&14680064),a!==null?l=Ot(a,l):(l=Xt(l,i,n,null),l.flags|=2),l.return=t,r.return=t,r.sibling=l,t.child=r,r=l,l=t.child,i=e.child.memoizedState,i=i===null?Si(n):{baseLanes:i.baseLanes|n,cachePool:null,transitions:i.transitions},l.memoizedState=i,l.childLanes=e.childLanes&~n,t.memoizedState=ki,r}return l=e.child,e=l.sibling,r=Ot(l,{mode:"visible",children:r.children}),!(t.mode&1)&&(r.lanes=n),r.return=t,r.sibling=null,e!==null&&(n=t.deletions,n===null?(t.deletions=[e],t.flags|=16):n.push(e)),t.child=r,t.memoizedState=null,r}function ma(e,t){return t=Yo({mode:"visible",children:t},e.mode,0,null),t.return=e,e.child=t}function Xr(e,t,n,r){return r!==null&&ea(r),In(t,e.child,null,n),e=ma(t,t.pendingProps.children),e.flags|=2,t.memoizedState=null,e}function Zp(e,t,n,r,o,l,i){if(n)return t.flags&256?(t.flags&=-257,r=Rl(Error(w(422))),Xr(e,t,i,r)):t.memoizedState!==null?(t.child=e.child,t.flags|=128,null):(l=r.fallback,o=t.mode,r=Yo({mode:"visible",children:r.children},o,0,null),l=Xt(l,o,i,null),l.flags|=2,r.return=t,l.return=t,r.sibling=l,t.child=r,t.mode&1&&In(t,e.child,null,i),t.child.memoizedState=Si(i),t.memoizedState=ki,l);if(!(t.mode&1))return Xr(e,t,i,null);if(o.data==="$!"){if(r=o.nextSibling&&o.nextSibling.dataset,r)var a=r.dgst;return r=a,l=Error(w(419)),r=Rl(l,r,void 0),Xr(e,t,i,r)}if(a=(i&e.childLanes)!==0,ke||a){if(r=ae,r!==null){switch(i&-i){case 4:o=2;break;case 16:o=8;break;case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:o=32;break;case 536870912:o=268435456;break;default:o=0}o=o&(r.suspendedLanes|i)?0:o,o!==0&&o!==l.retryLane&&(l.retryLane=o,mt(e,o),Xe(r,e,o,-1))}return wa(),r=Rl(Error(w(421))),Xr(e,t,i,r)}return o.data==="$?"?(t.flags|=128,t.child=e.child,t=fm.bind(null,e),o._reactRetry=t,null):(e=l.treeContext,Pe=jt(o.nextSibling),Te=t,Y=!0,Ke=null,e!==null&&(De[be++]=st,De[be++]=ct,De[be++]=Gt,st=e.id,ct=e.overflow,Gt=t),t=ma(t,r.children),t.flags|=4096,t)}function bu(e,t,n){e.lanes|=t;var r=e.alternate;r!==null&&(r.lanes|=t),hi(e.return,t,n)}function Dl(e,t,n,r,o){var l=e.memoizedState;l===null?e.memoizedState={isBackwards:t,rendering:null,renderingStartTime:0,last:r,tail:n,tailMode:o}:(l.isBackwards=t,l.rendering=null,l.renderingStartTime=0,l.last=r,l.tail=n,l.tailMode=o)}function Gc(e,t,n){var r=t.pendingProps,o=r.revealOrder,l=r.tail;if(he(e,t,r.children,n),r=X.current,r&2)r=r&1|2,t.flags|=128;else{if(e!==null&&e.flags&128)e:for(e=t.child;e!==null;){if(e.tag===13)e.memoizedState!==null&&bu(e,n,t);else if(e.tag===19)bu(e,n,t);else if(e.child!==null){e.child.return=e,e=e.child;continue}if(e===t)break e;for(;e.sibling===null;){if(e.return===null||e.return===t)break e;e=e.return}e.sibling.return=e.return,e=e.sibling}r&=1}if(Q(X,r),!(t.mode&1))t.memoizedState=null;else switch(o){case"forwards":for(n=t.child,o=null;n!==null;)e=n.alternate,e!==null&&Po(e)===null&&(o=n),n=n.sibling;n=o,n===null?(o=t.child,t.child=null):(o=n.sibling,n.sibling=null),Dl(t,!1,o,n,l);break;case"backwards":for(n=null,o=t.child,t.child=null;o!==null;){if(e=o.alternate,e!==null&&Po(e)===null){t.child=o;break}e=o.sibling,o.sibling=n,n=o,o=e}Dl(t,!0,n,null,l);break;case"together":Dl(t,!1,null,null,void 0);break;default:t.memoizedState=null}return t.child}function uo(e,t){!(t.mode&1)&&e!==null&&(e.alternate=null,t.alternate=null,t.flags|=2)}function ht(e,t,n){if(e!==null&&(t.dependencies=e.dependencies),Zt|=t.lanes,!(n&t.childLanes))return null;if(e!==null&&t.child!==e.child)throw Error(w(153));if(t.child!==null){for(e=t.child,n=Ot(e,e.pendingProps),t.child=n,n.return=t;e.sibling!==null;)e=e.sibling,n=n.sibling=Ot(e,e.pendingProps),n.return=t;n.sibling=null}return t.child}function em(e,t,n){switch(t.tag){case 3:Xc(t),On();break;case 5:_c(t);break;case 1:Ee(t.type)&&_o(t);break;case 4:ia(t,t.stateNode.containerInfo);break;case 10:var r=t.type._context,o=t.memoizedProps.value;Q(No,r._currentValue),r._currentValue=o;break;case 13:if(r=t.memoizedState,r!==null)return r.dehydrated!==null?(Q(X,X.current&1),t.flags|=128,null):n&t.child.childLanes?Jc(e,t,n):(Q(X,X.current&1),e=ht(e,t,n),e!==null?e.sibling:null);Q(X,X.current&1);break;case 19:if(r=(n&t.childLanes)!==0,e.flags&128){if(r)return Gc(e,t,n);t.flags|=128}if(o=t.memoizedState,o!==null&&(o.rendering=null,o.tail=null,o.lastEffect=null),Q(X,X.current),r)break;return null;case 22:case 23:return t.lanes=0,Kc(e,t,n)}return ht(e,t,n)}var qc,_i,Zc,ed;qc=function(e,t){for(var n=t.child;n!==null;){if(n.tag===5||n.tag===6)e.appendChild(n.stateNode);else if(n.tag!==4&&n.child!==null){n.child.return=n,n=n.child;continue}if(n===t)break;for(;n.sibling===null;){if(n.return===null||n.return===t)return;n=n.return}n.sibling.return=n.return,n=n.sibling}};_i=function(){};Zc=function(e,t,n,r){var o=e.memoizedProps;if(o!==r){e=t.stateNode,Kt(tt.current);var l=null;switch(n){case"input":o=Hl(e,o),r=Hl(e,r),l=[];break;case"select":o=G({},o,{value:void 0}),r=G({},r,{value:void 0}),l=[];break;case"textarea":o=Yl(e,o),r=Yl(e,r),l=[];break;default:typeof o.onClick!="function"&&typeof r.onClick=="function"&&(e.onclick=ko)}Jl(n,r);var i;n=null;for(d in o)if(!r.hasOwnProperty(d)&&o.hasOwnProperty(d)&&o[d]!=null)if(d==="style"){var a=o[d];for(i in a)a.hasOwnProperty(i)&&(n||(n={}),n[i]="")}else d!=="dangerouslySetInnerHTML"&&d!=="children"&&d!=="suppressContentEditableWarning"&&d!=="suppressHydrationWarning"&&d!=="autoFocus"&&(cr.hasOwnProperty(d)?l||(l=[]):(l=l||[]).push(d,null));for(d in r){var u=r[d];if(a=o!=null?o[d]:void 0,r.hasOwnProperty(d)&&u!==a&&(u!=null||a!=null))if(d==="style")if(a){for(i in a)!a.hasOwnProperty(i)||u&&u.hasOwnProperty(i)||(n||(n={}),n[i]="");for(i in u)u.hasOwnProperty(i)&&a[i]!==u[i]&&(n||(n={}),n[i]=u[i])}else n||(l||(l=[]),l.push(d,n)),n=u;else d==="dangerouslySetInnerHTML"?(u=u?u.__html:void 0,a=a?a.__html:void 0,u!=null&&a!==u&&(l=l||[]).push(d,u)):d==="children"?typeof u!="string"&&typeof u!="number"||(l=l||[]).push(d,""+u):d!=="suppressContentEditableWarning"&&d!=="suppressHydrationWarning"&&(cr.hasOwnProperty(d)?(u!=null&&d==="onScroll"&&H("scroll",e),l||a===u||(l=[])):(l=l||[]).push(d,u))}n&&(l=l||[]).push("style",n);var d=l;(t.updateQueue=d)&&(t.flags|=4)}};ed=function(e,t,n,r){n!==r&&(t.flags|=4)};function Xn(e,t){if(!Y)switch(e.tailMode){case"hidden":t=e.tail;for(var n=null;t!==null;)t.alternate!==null&&(n=t),t=t.sibling;n===null?e.tail=null:n.sibling=null;break;case"collapsed":n=e.tail;for(var r=null;n!==null;)n.alternate!==null&&(r=n),n=n.sibling;r===null?t||e.tail===null?e.tail=null:e.tail.sibling=null:r.sibling=null}}function fe(e){var t=e.alternate!==null&&e.alternate.child===e.child,n=0,r=0;if(t)for(var o=e.child;o!==null;)n|=o.lanes|o.childLanes,r|=o.subtreeFlags&14680064,r|=o.flags&14680064,o.return=e,o=o.sibling;else for(o=e.child;o!==null;)n|=o.lanes|o.childLanes,r|=o.subtreeFlags,r|=o.flags,o.return=e,o=o.sibling;return e.subtreeFlags|=r,e.childLanes=n,t}function tm(e,t,n){var r=t.pendingProps;switch(Zi(t),t.tag){case 2:case 16:case 15:case 0:case 11:case 7:case 8:case 12:case 9:case 14:return fe(t),null;case 1:return Ee(t.type)&&So(),fe(t),null;case 3:return r=t.stateNode,Mn(),W(Ce),W(me),ua(),r.pendingContext&&(r.context=r.pendingContext,r.pendingContext=null),(e===null||e.child===null)&&(Kr(t)?t.flags|=4:e===null||e.memoizedState.isDehydrated&&!(t.flags&256)||(t.flags|=1024,Ke!==null&&(Li(Ke),Ke=null))),_i(e,t),fe(t),null;case 5:aa(t);var o=Kt(Sr.current);if(n=t.type,e!==null&&t.stateNode!=null)Zc(e,t,n,r,o),e.ref!==t.ref&&(t.flags|=512,t.flags|=2097152);else{if(!r){if(t.stateNode===null)throw Error(w(166));return fe(t),null}if(e=Kt(tt.current),Kr(t)){r=t.stateNode,n=t.type;var l=t.memoizedProps;switch(r[Ze]=t,r[wr]=l,e=(t.mode&1)!==0,n){case"dialog":H("cancel",r),H("close",r);break;case"iframe":case"object":case"embed":H("load",r);break;case"video":case"audio":for(o=0;o<er.length;o++)H(er[o],r);break;case"source":H("error",r);break;case"img":case"image":case"link":H("error",r),H("load",r);break;case"details":H("toggle",r);break;case"input":Wa(r,l),H("invalid",r);break;case"select":r._wrapperState={wasMultiple:!!l.multiple},H("invalid",r);break;case"textarea":Ya(r,l),H("invalid",r)}Jl(n,l),o=null;for(var i in l)if(l.hasOwnProperty(i)){var a=l[i];i==="children"?typeof a=="string"?r.textContent!==a&&(l.suppressHydrationWarning!==!0&&Wr(r.textContent,a,e),o=["children",a]):typeof a=="number"&&r.textContent!==""+a&&(l.suppressHydrationWarning!==!0&&Wr(r.textContent,a,e),o=["children",""+a]):cr.hasOwnProperty(i)&&a!=null&&i==="onScroll"&&H("scroll",r)}switch(n){case"input":Fr(r),Ka(r,l,!0);break;case"textarea":Fr(r),Xa(r);break;case"select":case"option":break;default:typeof l.onClick=="function"&&(r.onclick=ko)}r=o,t.updateQueue=r,r!==null&&(t.flags|=4)}else{i=o.nodeType===9?o:o.ownerDocument,e==="http://www.w3.org/1999/xhtml"&&(e=js(n)),e==="http://www.w3.org/1999/xhtml"?n==="script"?(e=i.createElement("div"),e.innerHTML="<script><\/script>",e=e.removeChild(e.firstChild)):typeof r.is=="string"?e=i.createElement(n,{is:r.is}):(e=i.createElement(n),n==="select"&&(i=e,r.multiple?i.multiple=!0:r.size&&(i.size=r.size))):e=i.createElementNS(e,n),e[Ze]=t,e[wr]=r,qc(e,t,!1,!1),t.stateNode=e;e:{switch(i=Gl(n,r),n){case"dialog":H("cancel",e),H("close",e),o=r;break;case"iframe":case"object":case"embed":H("load",e),o=r;break;case"video":case"audio":for(o=0;o<er.length;o++)H(er[o],e);o=r;break;case"source":H("error",e),o=r;break;case"img":case"image":case"link":H("error",e),H("load",e),o=r;break;case"details":H("toggle",e),o=r;break;case"input":Wa(e,r),o=Hl(e,r),H("invalid",e);break;case"option":o=r;break;case"select":e._wrapperState={wasMultiple:!!r.multiple},o=G({},r,{value:void 0}),H("invalid",e);break;case"textarea":Ya(e,r),o=Yl(e,r),H("invalid",e);break;default:o=r}Jl(n,o),a=o;for(l in a)if(a.hasOwnProperty(l)){var u=a[l];l==="style"?Ls(e,u):l==="dangerouslySetInnerHTML"?(u=u?u.__html:void 0,u!=null&&Ps(e,u)):l==="children"?typeof u=="string"?(n!=="textarea"||u!=="")&&dr(e,u):typeof u=="number"&&dr(e,""+u):l!=="suppressContentEditableWarning"&&l!=="suppressHydrationWarning"&&l!=="autoFocus"&&(cr.hasOwnProperty(l)?u!=null&&l==="onScroll"&&H("scroll",e):u!=null&&Fi(e,l,u,i))}switch(n){case"input":Fr(e),Ka(e,r,!1);break;case"textarea":Fr(e),Xa(e);break;case"option":r.value!=null&&e.setAttribute("value",""+It(r.value));break;case"select":e.multiple=!!r.multiple,l=r.value,l!=null?_n(e,!!r.multiple,l,!1):r.defaultValue!=null&&_n(e,!!r.multiple,r.defaultValue,!0);break;default:typeof o.onClick=="function"&&(e.onclick=ko)}switch(n){case"button":case"input":case"select":case"textarea":r=!!r.autoFocus;break e;case"img":r=!0;break e;default:r=!1}}r&&(t.flags|=4)}t.ref!==null&&(t.flags|=512,t.flags|=2097152)}return fe(t),null;case 6:if(e&&t.stateNode!=null)ed(e,t,e.memoizedProps,r);else{if(typeof r!="string"&&t.stateNode===null)throw Error(w(166));if(n=Kt(Sr.current),Kt(tt.current),Kr(t)){if(r=t.stateNode,n=t.memoizedProps,r[Ze]=t,(l=r.nodeValue!==n)&&(e=Te,e!==null))switch(e.tag){case 3:Wr(r.nodeValue,n,(e.mode&1)!==0);break;case 5:e.memoizedProps.suppressHydrationWarning!==!0&&Wr(r.nodeValue,n,(e.mode&1)!==0)}l&&(t.flags|=4)}else r=(n.nodeType===9?n:n.ownerDocument).createTextNode(r),r[Ze]=t,t.stateNode=r}return fe(t),null;case 13:if(W(X),r=t.memoizedState,e===null||e.memoizedState!==null&&e.memoizedState.dehydrated!==null){if(Y&&Pe!==null&&t.mode&1&&!(t.flags&128))yc(),On(),t.flags|=98560,l=!1;else if(l=Kr(t),r!==null&&r.dehydrated!==null){if(e===null){if(!l)throw Error(w(318));if(l=t.memoizedState,l=l!==null?l.dehydrated:null,!l)throw Error(w(317));l[Ze]=t}else On(),!(t.flags&128)&&(t.memoizedState=null),t.flags|=4;fe(t),l=!1}else Ke!==null&&(Li(Ke),Ke=null),l=!0;if(!l)return t.flags&65536?t:null}return t.flags&128?(t.lanes=n,t):(r=r!==null,r!==(e!==null&&e.memoizedState!==null)&&r&&(t.child.flags|=8192,t.mode&1&&(e===null||X.current&1?oe===0&&(oe=3):wa())),t.updateQueue!==null&&(t.flags|=4),fe(t),null);case 4:return Mn(),_i(e,t),e===null&&yr(t.stateNode.containerInfo),fe(t),null;case 10:return ra(t.type._context),fe(t),null;case 17:return Ee(t.type)&&So(),fe(t),null;case 19:if(W(X),l=t.memoizedState,l===null)return fe(t),null;if(r=(t.flags&128)!==0,i=l.rendering,i===null)if(r)Xn(l,!1);else{if(oe!==0||e!==null&&e.flags&128)for(e=t.child;e!==null;){if(i=Po(e),i!==null){for(t.flags|=128,Xn(l,!1),r=i.updateQueue,r!==null&&(t.updateQueue=r,t.flags|=4),t.subtreeFlags=0,r=n,n=t.child;n!==null;)l=n,e=r,l.flags&=14680066,i=l.alternate,i===null?(l.childLanes=0,l.lanes=e,l.child=null,l.subtreeFlags=0,l.memoizedProps=null,l.memoizedState=null,l.updateQueue=null,l.dependencies=null,l.stateNode=null):(l.childLanes=i.childLanes,l.lanes=i.lanes,l.child=i.child,l.subtreeFlags=0,l.deletions=null,l.memoizedProps=i.memoizedProps,l.memoizedState=i.memoizedState,l.updateQueue=i.updateQueue,l.type=i.type,e=i.dependencies,l.dependencies=e===null?null:{lanes:e.lanes,firstContext:e.firstContext}),n=n.sibling;return Q(X,X.current&1|2),t.child}e=e.sibling}l.tail!==null&&te()>Dn&&(t.flags|=128,r=!0,Xn(l,!1),t.lanes=4194304)}else{if(!r)if(e=Po(i),e!==null){if(t.flags|=128,r=!0,n=e.updateQueue,n!==null&&(t.updateQueue=n,t.flags|=4),Xn(l,!0),l.tail===null&&l.tailMode==="hidden"&&!i.alternate&&!Y)return fe(t),null}else 2*te()-l.renderingStartTime>Dn&&n!==1073741824&&(t.flags|=128,r=!0,Xn(l,!1),t.lanes=4194304);l.isBackwards?(i.sibling=t.child,t.child=i):(n=l.last,n!==null?n.sibling=i:t.child=i,l.last=i)}return l.tail!==null?(t=l.tail,l.rendering=t,l.tail=t.sibling,l.renderingStartTime=te(),t.sibling=null,n=X.current,Q(X,r?n&1|2:n&1),t):(fe(t),null);case 22:case 23:return xa(),r=t.memoizedState!==null,e!==null&&e.memoizedState!==null!==r&&(t.flags|=8192),r&&t.mode&1?je&1073741824&&(fe(t),t.subtreeFlags&6&&(t.flags|=8192)):fe(t),null;case 24:return null;case 25:return null}throw Error(w(156,t.tag))}function nm(e,t){switch(Zi(t),t.tag){case 1:return Ee(t.type)&&So(),e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 3:return Mn(),W(Ce),W(me),ua(),e=t.flags,e&65536&&!(e&128)?(t.flags=e&-65537|128,t):null;case 5:return aa(t),null;case 13:if(W(X),e=t.memoizedState,e!==null&&e.dehydrated!==null){if(t.alternate===null)throw Error(w(340));On()}return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 19:return W(X),null;case 4:return Mn(),null;case 10:return ra(t.type._context),null;case 22:case 23:return xa(),null;case 24:return null;default:return null}}var Jr=!1,pe=!1,rm=typeof WeakSet=="function"?WeakSet:Set,z=null;function kn(e,t){var n=e.ref;if(n!==null)if(typeof n=="function")try{n(null)}catch(r){ee(e,t,r)}else n.current=null}function Ci(e,t,n){try{n()}catch(r){ee(e,t,r)}}var Fu=!1;function om(e,t){if(ai=yo,e=lc(),Gi(e)){if("selectionStart"in e)var n={start:e.selectionStart,end:e.selectionEnd};else e:{n=(n=e.ownerDocument)&&n.defaultView||window;var r=n.getSelection&&n.getSelection();if(r&&r.rangeCount!==0){n=r.anchorNode;var o=r.anchorOffset,l=r.focusNode;r=r.focusOffset;try{n.nodeType,l.nodeType}catch{n=null;break e}var i=0,a=-1,u=-1,d=0,y=0,g=e,h=null;t:for(;;){for(var S;g!==n||o!==0&&g.nodeType!==3||(a=i+o),g!==l||r!==0&&g.nodeType!==3||(u=i+r),g.nodeType===3&&(i+=g.nodeValue.length),(S=g.firstChild)!==null;)h=g,g=S;for(;;){if(g===e)break t;if(h===n&&++d===o&&(a=i),h===l&&++y===r&&(u=i),(S=g.nextSibling)!==null)break;g=h,h=g.parentNode}g=S}n=a===-1||u===-1?null:{start:a,end:u}}else n=null}n=n||{start:0,end:0}}else n=null;for(ui={focusedElem:e,selectionRange:n},yo=!1,z=t;z!==null;)if(t=z,e=t.child,(t.subtreeFlags&1028)!==0&&e!==null)e.return=t,z=e;else for(;z!==null;){t=z;try{var _=t.alternate;if(t.flags&1024)switch(t.tag){case 0:case 11:case 15:break;case 1:if(_!==null){var k=_.memoizedProps,O=_.memoizedState,f=t.stateNode,c=f.getSnapshotBeforeUpdate(t.elementType===t.type?k:He(t.type,k),O);f.__reactInternalSnapshotBeforeUpdate=c}break;case 3:var m=t.stateNode.containerInfo;m.nodeType===1?m.textContent="":m.nodeType===9&&m.documentElement&&m.removeChild(m.documentElement);break;case 5:case 6:case 4:case 17:break;default:throw Error(w(163))}}catch(x){ee(t,t.return,x)}if(e=t.sibling,e!==null){e.return=t.return,z=e;break}z=t.return}return _=Fu,Fu=!1,_}function ar(e,t,n){var r=t.updateQueue;if(r=r!==null?r.lastEffect:null,r!==null){var o=r=r.next;do{if((o.tag&e)===e){var l=o.destroy;o.destroy=void 0,l!==void 0&&Ci(t,n,l)}o=o.next}while(o!==r)}}function Wo(e,t){if(t=t.updateQueue,t=t!==null?t.lastEffect:null,t!==null){var n=t=t.next;do{if((n.tag&e)===e){var r=n.create;n.destroy=r()}n=n.next}while(n!==t)}}function Ei(e){var t=e.ref;if(t!==null){var n=e.stateNode;switch(e.tag){case 5:e=n;break;default:e=n}typeof t=="function"?t(e):t.current=e}}function td(e){var t=e.alternate;t!==null&&(e.alternate=null,td(t)),e.child=null,e.deletions=null,e.sibling=null,e.tag===5&&(t=e.stateNode,t!==null&&(delete t[Ze],delete t[wr],delete t[di],delete t[Ap],delete t[Up])),e.stateNode=null,e.return=null,e.dependencies=null,e.memoizedProps=null,e.memoizedState=null,e.pendingProps=null,e.stateNode=null,e.updateQueue=null}function nd(e){return e.tag===5||e.tag===3||e.tag===4}function $u(e){e:for(;;){for(;e.sibling===null;){if(e.return===null||nd(e.return))return null;e=e.return}for(e.sibling.return=e.return,e=e.sibling;e.tag!==5&&e.tag!==6&&e.tag!==18;){if(e.flags&2||e.child===null||e.tag===4)continue e;e.child.return=e,e=e.child}if(!(e.flags&2))return e.stateNode}}function Ni(e,t,n){var r=e.tag;if(r===5||r===6)e=e.stateNode,t?n.nodeType===8?n.parentNode.insertBefore(e,t):n.insertBefore(e,t):(n.nodeType===8?(t=n.parentNode,t.insertBefore(e,n)):(t=n,t.appendChild(e)),n=n._reactRootContainer,n!=null||t.onclick!==null||(t.onclick=ko));else if(r!==4&&(e=e.child,e!==null))for(Ni(e,t,n),e=e.sibling;e!==null;)Ni(e,t,n),e=e.sibling}function zi(e,t,n){var r=e.tag;if(r===5||r===6)e=e.stateNode,t?n.insertBefore(e,t):n.appendChild(e);else if(r!==4&&(e=e.child,e!==null))for(zi(e,t,n),e=e.sibling;e!==null;)zi(e,t,n),e=e.sibling}var ue=null,We=!1;function yt(e,t,n){for(n=n.child;n!==null;)rd(e,t,n),n=n.sibling}function rd(e,t,n){if(et&&typeof et.onCommitFiberUnmount=="function")try{et.onCommitFiberUnmount(Fo,n)}catch{}switch(n.tag){case 5:pe||kn(n,t);case 6:var r=ue,o=We;ue=null,yt(e,t,n),ue=r,We=o,ue!==null&&(We?(e=ue,n=n.stateNode,e.nodeType===8?e.parentNode.removeChild(n):e.removeChild(n)):ue.removeChild(n.stateNode));break;case 18:ue!==null&&(We?(e=ue,n=n.stateNode,e.nodeType===8?Pl(e.parentNode,n):e.nodeType===1&&Pl(e,n),hr(e)):Pl(ue,n.stateNode));break;case 4:r=ue,o=We,ue=n.stateNode.containerInfo,We=!0,yt(e,t,n),ue=r,We=o;break;case 0:case 11:case 14:case 15:if(!pe&&(r=n.updateQueue,r!==null&&(r=r.lastEffect,r!==null))){o=r=r.next;do{var l=o,i=l.destroy;l=l.tag,i!==void 0&&(l&2||l&4)&&Ci(n,t,i),o=o.next}while(o!==r)}yt(e,t,n);break;case 1:if(!pe&&(kn(n,t),r=n.stateNode,typeof r.componentWillUnmount=="function"))try{r.props=n.memoizedProps,r.state=n.memoizedState,r.componentWillUnmount()}catch(a){ee(n,t,a)}yt(e,t,n);break;case 21:yt(e,t,n);break;case 22:n.mode&1?(pe=(r=pe)||n.memoizedState!==null,yt(e,t,n),pe=r):yt(e,t,n);break;default:yt(e,t,n)}}function Au(e){var t=e.updateQueue;if(t!==null){e.updateQueue=null;var n=e.stateNode;n===null&&(n=e.stateNode=new rm),t.forEach(function(r){var o=pm.bind(null,e,r);n.has(r)||(n.add(r),r.then(o,o))})}}function Qe(e,t){var n=t.deletions;if(n!==null)for(var r=0;r<n.length;r++){var o=n[r];try{var l=e,i=t,a=i;e:for(;a!==null;){switch(a.tag){case 5:ue=a.stateNode,We=!1;break e;case 3:ue=a.stateNode.containerInfo,We=!0;break e;case 4:ue=a.stateNode.containerInfo,We=!0;break e}a=a.return}if(ue===null)throw Error(w(160));rd(l,i,o),ue=null,We=!1;var u=o.alternate;u!==null&&(u.return=null),o.return=null}catch(d){ee(o,t,d)}}if(t.subtreeFlags&12854)for(t=t.child;t!==null;)od(t,e),t=t.sibling}function od(e,t){var n=e.alternate,r=e.flags;switch(e.tag){case 0:case 11:case 14:case 15:if(Qe(t,e),Ge(e),r&4){try{ar(3,e,e.return),Wo(3,e)}catch(k){ee(e,e.return,k)}try{ar(5,e,e.return)}catch(k){ee(e,e.return,k)}}break;case 1:Qe(t,e),Ge(e),r&512&&n!==null&&kn(n,n.return);break;case 5:if(Qe(t,e),Ge(e),r&512&&n!==null&&kn(n,n.return),e.flags&32){var o=e.stateNode;try{dr(o,"")}catch(k){ee(e,e.return,k)}}if(r&4&&(o=e.stateNode,o!=null)){var l=e.memoizedProps,i=n!==null?n.memoizedProps:l,a=e.type,u=e.updateQueue;if(e.updateQueue=null,u!==null)try{a==="input"&&l.type==="radio"&&l.name!=null&&Ns(o,l),Gl(a,i);var d=Gl(a,l);for(i=0;i<u.length;i+=2){var y=u[i],g=u[i+1];y==="style"?Ls(o,g):y==="dangerouslySetInnerHTML"?Ps(o,g):y==="children"?dr(o,g):Fi(o,y,g,d)}switch(a){case"input":Wl(o,l);break;case"textarea":zs(o,l);break;case"select":var h=o._wrapperState.wasMultiple;o._wrapperState.wasMultiple=!!l.multiple;var S=l.value;S!=null?_n(o,!!l.multiple,S,!1):h!==!!l.multiple&&(l.defaultValue!=null?_n(o,!!l.multiple,l.defaultValue,!0):_n(o,!!l.multiple,l.multiple?[]:"",!1))}o[wr]=l}catch(k){ee(e,e.return,k)}}break;case 6:if(Qe(t,e),Ge(e),r&4){if(e.stateNode===null)throw Error(w(162));o=e.stateNode,l=e.memoizedProps;try{o.nodeValue=l}catch(k){ee(e,e.return,k)}}break;case 3:if(Qe(t,e),Ge(e),r&4&&n!==null&&n.memoizedState.isDehydrated)try{hr(t.containerInfo)}catch(k){ee(e,e.return,k)}break;case 4:Qe(t,e),Ge(e);break;case 13:Qe(t,e),Ge(e),o=e.child,o.flags&8192&&(l=o.memoizedState!==null,o.stateNode.isHidden=l,!l||o.alternate!==null&&o.alternate.memoizedState!==null||(va=te())),r&4&&Au(e);break;case 22:if(y=n!==null&&n.memoizedState!==null,e.mode&1?(pe=(d=pe)||y,Qe(t,e),pe=d):Qe(t,e),Ge(e),r&8192){if(d=e.memoizedState!==null,(e.stateNode.isHidden=d)&&!y&&e.mode&1)for(z=e,y=e.child;y!==null;){for(g=z=y;z!==null;){switch(h=z,S=h.child,h.tag){case 0:case 11:case 14:case 15:ar(4,h,h.return);break;case 1:kn(h,h.return);var _=h.stateNode;if(typeof _.componentWillUnmount=="function"){r=h,n=h.return;try{t=r,_.props=t.memoizedProps,_.state=t.memoizedState,_.componentWillUnmount()}catch(k){ee(r,n,k)}}break;case 5:kn(h,h.return);break;case 22:if(h.memoizedState!==null){Bu(g);continue}}S!==null?(S.return=h,z=S):Bu(g)}y=y.sibling}e:for(y=null,g=e;;){if(g.tag===5){if(y===null){y=g;try{o=g.stateNode,d?(l=o.style,typeof l.setProperty=="function"?l.setProperty("display","none","important"):l.display="none"):(a=g.stateNode,u=g.memoizedProps.style,i=u!=null&&u.hasOwnProperty("display")?u.display:null,a.style.display=Ts("display",i))}catch(k){ee(e,e.return,k)}}}else if(g.tag===6){if(y===null)try{g.stateNode.nodeValue=d?"":g.memoizedProps}catch(k){ee(e,e.return,k)}}else if((g.tag!==22&&g.tag!==23||g.memoizedState===null||g===e)&&g.child!==null){g.child.return=g,g=g.child;continue}if(g===e)break e;for(;g.sibling===null;){if(g.return===null||g.return===e)break e;y===g&&(y=null),g=g.return}y===g&&(y=null),g.sibling.return=g.return,g=g.sibling}}break;case 19:Qe(t,e),Ge(e),r&4&&Au(e);break;case 21:break;default:Qe(t,e),Ge(e)}}function Ge(e){var t=e.flags;if(t&2){try{e:{for(var n=e.return;n!==null;){if(nd(n)){var r=n;break e}n=n.return}throw Error(w(160))}switch(r.tag){case 5:var o=r.stateNode;r.flags&32&&(dr(o,""),r.flags&=-33);var l=$u(e);zi(e,l,o);break;case 3:case 4:var i=r.stateNode.containerInfo,a=$u(e);Ni(e,a,i);break;default:throw Error(w(161))}}catch(u){ee(e,e.return,u)}e.flags&=-3}t&4096&&(e.flags&=-4097)}function lm(e,t,n){z=e,ld(e)}function ld(e,t,n){for(var r=(e.mode&1)!==0;z!==null;){var o=z,l=o.child;if(o.tag===22&&r){var i=o.memoizedState!==null||Jr;if(!i){var a=o.alternate,u=a!==null&&a.memoizedState!==null||pe;a=Jr;var d=pe;if(Jr=i,(pe=u)&&!d)for(z=o;z!==null;)i=z,u=i.child,i.tag===22&&i.memoizedState!==null?Vu(o):u!==null?(u.return=i,z=u):Vu(o);for(;l!==null;)z=l,ld(l),l=l.sibling;z=o,Jr=a,pe=d}Uu(e)}else o.subtreeFlags&8772&&l!==null?(l.return=o,z=l):Uu(e)}}function Uu(e){for(;z!==null;){var t=z;if(t.flags&8772){var n=t.alternate;try{if(t.flags&8772)switch(t.tag){case 0:case 11:case 15:pe||Wo(5,t);break;case 1:var r=t.stateNode;if(t.flags&4&&!pe)if(n===null)r.componentDidMount();else{var o=t.elementType===t.type?n.memoizedProps:He(t.type,n.memoizedProps);r.componentDidUpdate(o,n.memoizedState,r.__reactInternalSnapshotBeforeUpdate)}var l=t.updateQueue;l!==null&&Eu(t,l,r);break;case 3:var i=t.updateQueue;if(i!==null){if(n=null,t.child!==null)switch(t.child.tag){case 5:n=t.child.stateNode;break;case 1:n=t.child.stateNode}Eu(t,i,n)}break;case 5:var a=t.stateNode;if(n===null&&t.flags&4){n=a;var u=t.memoizedProps;switch(t.type){case"button":case"input":case"select":case"textarea":u.autoFocus&&n.focus();break;case"img":u.src&&(n.src=u.src)}}break;case 6:break;case 4:break;case 12:break;case 13:if(t.memoizedState===null){var d=t.alternate;if(d!==null){var y=d.memoizedState;if(y!==null){var g=y.dehydrated;g!==null&&hr(g)}}}break;case 19:case 17:case 21:case 22:case 23:case 25:break;default:throw Error(w(163))}pe||t.flags&512&&Ei(t)}catch(h){ee(t,t.return,h)}}if(t===e){z=null;break}if(n=t.sibling,n!==null){n.return=t.return,z=n;break}z=t.return}}function Bu(e){for(;z!==null;){var t=z;if(t===e){z=null;break}var n=t.sibling;if(n!==null){n.return=t.return,z=n;break}z=t.return}}function Vu(e){for(;z!==null;){var t=z;try{switch(t.tag){case 0:case 11:case 15:var n=t.return;try{Wo(4,t)}catch(u){ee(t,n,u)}break;case 1:var r=t.stateNode;if(typeof r.componentDidMount=="function"){var o=t.return;try{r.componentDidMount()}catch(u){ee(t,o,u)}}var l=t.return;try{Ei(t)}catch(u){ee(t,l,u)}break;case 5:var i=t.return;try{Ei(t)}catch(u){ee(t,i,u)}}}catch(u){ee(t,t.return,u)}if(t===e){z=null;break}var a=t.sibling;if(a!==null){a.return=t.return,z=a;break}z=t.return}}var im=Math.ceil,Oo=gt.ReactCurrentDispatcher,ha=gt.ReactCurrentOwner,$e=gt.ReactCurrentBatchConfig,$=0,ae=null,ne=null,se=0,je=0,Sn=Dt(0),oe=0,Nr=null,Zt=0,Ko=0,ga=0,ur=null,we=null,va=0,Dn=1/0,at=null,Io=!1,ji=null,Tt=null,Gr=!1,Ct=null,Mo=0,sr=0,Pi=null,so=-1,co=0;function ge(){return $&6?te():so!==-1?so:so=te()}function Lt(e){return e.mode&1?$&2&&se!==0?se&-se:Vp.transition!==null?(co===0&&(co=Vs()),co):(e=U,e!==0||(e=window.event,e=e===void 0?16:Js(e.type)),e):1}function Xe(e,t,n,r){if(50<sr)throw sr=0,Pi=null,Error(w(185));Pr(e,n,r),(!($&2)||e!==ae)&&(e===ae&&(!($&2)&&(Ko|=n),oe===4&&St(e,se)),Ne(e,r),n===1&&$===0&&!(t.mode&1)&&(Dn=te()+500,Vo&&bt()))}function Ne(e,t){var n=e.callbackNode;Vf(e,t);var r=vo(e,e===ae?se:0);if(r===0)n!==null&&qa(n),e.callbackNode=null,e.callbackPriority=0;else if(t=r&-r,e.callbackPriority!==t){if(n!=null&&qa(n),t===1)e.tag===0?Bp(Qu.bind(null,e)):hc(Qu.bind(null,e)),Fp(function(){!($&6)&&bt()}),n=null;else{switch(Qs(r)){case 1:n=Vi;break;case 4:n=Us;break;case 16:n=go;break;case 536870912:n=Bs;break;default:n=go}n=pd(n,id.bind(null,e))}e.callbackPriority=t,e.callbackNode=n}}function id(e,t){if(so=-1,co=0,$&6)throw Error(w(327));var n=e.callbackNode;if(jn()&&e.callbackNode!==n)return null;var r=vo(e,e===ae?se:0);if(r===0)return null;if(r&30||r&e.expiredLanes||t)t=Ro(e,r);else{t=r;var o=$;$|=2;var l=ud();(ae!==e||se!==t)&&(at=null,Dn=te()+500,Yt(e,t));do try{sm();break}catch(a){ad(e,a)}while(1);na(),Oo.current=l,$=o,ne!==null?t=0:(ae=null,se=0,t=oe)}if(t!==0){if(t===2&&(o=ni(e),o!==0&&(r=o,t=Ti(e,o))),t===1)throw n=Nr,Yt(e,0),St(e,r),Ne(e,te()),n;if(t===6)St(e,r);else{if(o=e.current.alternate,!(r&30)&&!am(o)&&(t=Ro(e,r),t===2&&(l=ni(e),l!==0&&(r=l,t=Ti(e,l))),t===1))throw n=Nr,Yt(e,0),St(e,r),Ne(e,te()),n;switch(e.finishedWork=o,e.finishedLanes=r,t){case 0:case 1:throw Error(w(345));case 2:Qt(e,we,at);break;case 3:if(St(e,r),(r&130023424)===r&&(t=va+500-te(),10<t)){if(vo(e,0)!==0)break;if(o=e.suspendedLanes,(o&r)!==r){ge(),e.pingedLanes|=e.suspendedLanes&o;break}e.timeoutHandle=ci(Qt.bind(null,e,we,at),t);break}Qt(e,we,at);break;case 4:if(St(e,r),(r&4194240)===r)break;for(t=e.eventTimes,o=-1;0<r;){var i=31-Ye(r);l=1<<i,i=t[i],i>o&&(o=i),r&=~l}if(r=o,r=te()-r,r=(120>r?120:480>r?480:1080>r?1080:1920>r?1920:3e3>r?3e3:4320>r?4320:1960*im(r/1960))-r,10<r){e.timeoutHandle=ci(Qt.bind(null,e,we,at),r);break}Qt(e,we,at);break;case 5:Qt(e,we,at);break;default:throw Error(w(329))}}}return Ne(e,te()),e.callbackNode===n?id.bind(null,e):null}function Ti(e,t){var n=ur;return e.current.memoizedState.isDehydrated&&(Yt(e,t).flags|=256),e=Ro(e,t),e!==2&&(t=we,we=n,t!==null&&Li(t)),e}function Li(e){we===null?we=e:we.push.apply(we,e)}function am(e){for(var t=e;;){if(t.flags&16384){var n=t.updateQueue;if(n!==null&&(n=n.stores,n!==null))for(var r=0;r<n.length;r++){var o=n[r],l=o.getSnapshot;o=o.value;try{if(!Je(l(),o))return!1}catch{return!1}}}if(n=t.child,t.subtreeFlags&16384&&n!==null)n.return=t,t=n;else{if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return!0;t=t.return}t.sibling.return=t.return,t=t.sibling}}return!0}function St(e,t){for(t&=~ga,t&=~Ko,e.suspendedLanes|=t,e.pingedLanes&=~t,e=e.expirationTimes;0<t;){var n=31-Ye(t),r=1<<n;e[n]=-1,t&=~r}}function Qu(e){if($&6)throw Error(w(327));jn();var t=vo(e,0);if(!(t&1))return Ne(e,te()),null;var n=Ro(e,t);if(e.tag!==0&&n===2){var r=ni(e);r!==0&&(t=r,n=Ti(e,r))}if(n===1)throw n=Nr,Yt(e,0),St(e,t),Ne(e,te()),n;if(n===6)throw Error(w(345));return e.finishedWork=e.current.alternate,e.finishedLanes=t,Qt(e,we,at),Ne(e,te()),null}function ya(e,t){var n=$;$|=1;try{return e(t)}finally{$=n,$===0&&(Dn=te()+500,Vo&&bt())}}function en(e){Ct!==null&&Ct.tag===0&&!($&6)&&jn();var t=$;$|=1;var n=$e.transition,r=U;try{if($e.transition=null,U=1,e)return e()}finally{U=r,$e.transition=n,$=t,!($&6)&&bt()}}function xa(){je=Sn.current,W(Sn)}function Yt(e,t){e.finishedWork=null,e.finishedLanes=0;var n=e.timeoutHandle;if(n!==-1&&(e.timeoutHandle=-1,bp(n)),ne!==null)for(n=ne.return;n!==null;){var r=n;switch(Zi(r),r.tag){case 1:r=r.type.childContextTypes,r!=null&&So();break;case 3:Mn(),W(Ce),W(me),ua();break;case 5:aa(r);break;case 4:Mn();break;case 13:W(X);break;case 19:W(X);break;case 10:ra(r.type._context);break;case 22:case 23:xa()}n=n.return}if(ae=e,ne=e=Ot(e.current,null),se=je=t,oe=0,Nr=null,ga=Ko=Zt=0,we=ur=null,Wt!==null){for(t=0;t<Wt.length;t++)if(n=Wt[t],r=n.interleaved,r!==null){n.interleaved=null;var o=r.next,l=n.pending;if(l!==null){var i=l.next;l.next=o,r.next=i}n.pending=r}Wt=null}return e}function ad(e,t){do{var n=ne;try{if(na(),io.current=Lo,To){for(var r=J.memoizedState;r!==null;){var o=r.queue;o!==null&&(o.pending=null),r=r.next}To=!1}if(qt=0,ie=re=J=null,ir=!1,_r=0,ha.current=null,n===null||n.return===null){oe=1,Nr=t,ne=null;break}e:{var l=e,i=n.return,a=n,u=t;if(t=se,a.flags|=32768,u!==null&&typeof u=="object"&&typeof u.then=="function"){var d=u,y=a,g=y.tag;if(!(y.mode&1)&&(g===0||g===11||g===15)){var h=y.alternate;h?(y.updateQueue=h.updateQueue,y.memoizedState=h.memoizedState,y.lanes=h.lanes):(y.updateQueue=null,y.memoizedState=null)}var S=Lu(i);if(S!==null){S.flags&=-257,Ou(S,i,a,l,t),S.mode&1&&Tu(l,d,t),t=S,u=d;var _=t.updateQueue;if(_===null){var k=new Set;k.add(u),t.updateQueue=k}else _.add(u);break e}else{if(!(t&1)){Tu(l,d,t),wa();break e}u=Error(w(426))}}else if(Y&&a.mode&1){var O=Lu(i);if(O!==null){!(O.flags&65536)&&(O.flags|=256),Ou(O,i,a,l,t),ea(Rn(u,a));break e}}l=u=Rn(u,a),oe!==4&&(oe=2),ur===null?ur=[l]:ur.push(l),l=i;do{switch(l.tag){case 3:l.flags|=65536,t&=-t,l.lanes|=t;var f=Qc(l,u,t);Cu(l,f);break e;case 1:a=u;var c=l.type,m=l.stateNode;if(!(l.flags&128)&&(typeof c.getDerivedStateFromError=="function"||m!==null&&typeof m.componentDidCatch=="function"&&(Tt===null||!Tt.has(m)))){l.flags|=65536,t&=-t,l.lanes|=t;var x=Hc(l,a,t);Cu(l,x);break e}}l=l.return}while(l!==null)}cd(n)}catch(C){t=C,ne===n&&n!==null&&(ne=n=n.return);continue}break}while(1)}function ud(){var e=Oo.current;return Oo.current=Lo,e===null?Lo:e}function wa(){(oe===0||oe===3||oe===2)&&(oe=4),ae===null||!(Zt&268435455)&&!(Ko&268435455)||St(ae,se)}function Ro(e,t){var n=$;$|=2;var r=ud();(ae!==e||se!==t)&&(at=null,Yt(e,t));do try{um();break}catch(o){ad(e,o)}while(1);if(na(),$=n,Oo.current=r,ne!==null)throw Error(w(261));return ae=null,se=0,oe}function um(){for(;ne!==null;)sd(ne)}function sm(){for(;ne!==null&&!Mf();)sd(ne)}function sd(e){var t=fd(e.alternate,e,je);e.memoizedProps=e.pendingProps,t===null?cd(e):ne=t,ha.current=null}function cd(e){var t=e;do{var n=t.alternate;if(e=t.return,t.flags&32768){if(n=nm(n,t),n!==null){n.flags&=32767,ne=n;return}if(e!==null)e.flags|=32768,e.subtreeFlags=0,e.deletions=null;else{oe=6,ne=null;return}}else if(n=tm(n,t,je),n!==null){ne=n;return}if(t=t.sibling,t!==null){ne=t;return}ne=t=e}while(t!==null);oe===0&&(oe=5)}function Qt(e,t,n){var r=U,o=$e.transition;try{$e.transition=null,U=1,cm(e,t,n,r)}finally{$e.transition=o,U=r}return null}function cm(e,t,n,r){do jn();while(Ct!==null);if($&6)throw Error(w(327));n=e.finishedWork;var o=e.finishedLanes;if(n===null)return null;if(e.finishedWork=null,e.finishedLanes=0,n===e.current)throw Error(w(177));e.callbackNode=null,e.callbackPriority=0;var l=n.lanes|n.childLanes;if(Qf(e,l),e===ae&&(ne=ae=null,se=0),!(n.subtreeFlags&2064)&&!(n.flags&2064)||Gr||(Gr=!0,pd(go,function(){return jn(),null})),l=(n.flags&15990)!==0,n.subtreeFlags&15990||l){l=$e.transition,$e.transition=null;var i=U;U=1;var a=$;$|=4,ha.current=null,om(e,n),od(n,e),Tp(ui),yo=!!ai,ui=ai=null,e.current=n,lm(n),Rf(),$=a,U=i,$e.transition=l}else e.current=n;if(Gr&&(Gr=!1,Ct=e,Mo=o),l=e.pendingLanes,l===0&&(Tt=null),Ff(n.stateNode),Ne(e,te()),t!==null)for(r=e.onRecoverableError,n=0;n<t.length;n++)o=t[n],r(o.value,{componentStack:o.stack,digest:o.digest});if(Io)throw Io=!1,e=ji,ji=null,e;return Mo&1&&e.tag!==0&&jn(),l=e.pendingLanes,l&1?e===Pi?sr++:(sr=0,Pi=e):sr=0,bt(),null}function jn(){if(Ct!==null){var e=Qs(Mo),t=$e.transition,n=U;try{if($e.transition=null,U=16>e?16:e,Ct===null)var r=!1;else{if(e=Ct,Ct=null,Mo=0,$&6)throw Error(w(331));var o=$;for($|=4,z=e.current;z!==null;){var l=z,i=l.child;if(z.flags&16){var a=l.deletions;if(a!==null){for(var u=0;u<a.length;u++){var d=a[u];for(z=d;z!==null;){var y=z;switch(y.tag){case 0:case 11:case 15:ar(8,y,l)}var g=y.child;if(g!==null)g.return=y,z=g;else for(;z!==null;){y=z;var h=y.sibling,S=y.return;if(td(y),y===d){z=null;break}if(h!==null){h.return=S,z=h;break}z=S}}}var _=l.alternate;if(_!==null){var k=_.child;if(k!==null){_.child=null;do{var O=k.sibling;k.sibling=null,k=O}while(k!==null)}}z=l}}if(l.subtreeFlags&2064&&i!==null)i.return=l,z=i;else e:for(;z!==null;){if(l=z,l.flags&2048)switch(l.tag){case 0:case 11:case 15:ar(9,l,l.return)}var f=l.sibling;if(f!==null){f.return=l.return,z=f;break e}z=l.return}}var c=e.current;for(z=c;z!==null;){i=z;var m=i.child;if(i.subtreeFlags&2064&&m!==null)m.return=i,z=m;else e:for(i=c;z!==null;){if(a=z,a.flags&2048)try{switch(a.tag){case 0:case 11:case 15:Wo(9,a)}}catch(C){ee(a,a.return,C)}if(a===i){z=null;break e}var x=a.sibling;if(x!==null){x.return=a.return,z=x;break e}z=a.return}}if($=o,bt(),et&&typeof et.onPostCommitFiberRoot=="function")try{et.onPostCommitFiberRoot(Fo,e)}catch{}r=!0}return r}finally{U=n,$e.transition=t}}return!1}function Hu(e,t,n){t=Rn(n,t),t=Qc(e,t,1),e=Pt(e,t,1),t=ge(),e!==null&&(Pr(e,1,t),Ne(e,t))}function ee(e,t,n){if(e.tag===3)Hu(e,e,n);else for(;t!==null;){if(t.tag===3){Hu(t,e,n);break}else if(t.tag===1){var r=t.stateNode;if(typeof t.type.getDerivedStateFromError=="function"||typeof r.componentDidCatch=="function"&&(Tt===null||!Tt.has(r))){e=Rn(n,e),e=Hc(t,e,1),t=Pt(t,e,1),e=ge(),t!==null&&(Pr(t,1,e),Ne(t,e));break}}t=t.return}}function dm(e,t,n){var r=e.pingCache;r!==null&&r.delete(t),t=ge(),e.pingedLanes|=e.suspendedLanes&n,ae===e&&(se&n)===n&&(oe===4||oe===3&&(se&130023424)===se&&500>te()-va?Yt(e,0):ga|=n),Ne(e,t)}function dd(e,t){t===0&&(e.mode&1?(t=Ur,Ur<<=1,!(Ur&130023424)&&(Ur=4194304)):t=1);var n=ge();e=mt(e,t),e!==null&&(Pr(e,t,n),Ne(e,n))}function fm(e){var t=e.memoizedState,n=0;t!==null&&(n=t.retryLane),dd(e,n)}function pm(e,t){var n=0;switch(e.tag){case 13:var r=e.stateNode,o=e.memoizedState;o!==null&&(n=o.retryLane);break;case 19:r=e.stateNode;break;default:throw Error(w(314))}r!==null&&r.delete(t),dd(e,n)}var fd;fd=function(e,t,n){if(e!==null)if(e.memoizedProps!==t.pendingProps||Ce.current)ke=!0;else{if(!(e.lanes&n)&&!(t.flags&128))return ke=!1,em(e,t,n);ke=!!(e.flags&131072)}else ke=!1,Y&&t.flags&1048576&&gc(t,Eo,t.index);switch(t.lanes=0,t.tag){case 2:var r=t.type;uo(e,t),e=t.pendingProps;var o=Ln(t,me.current);zn(t,n),o=ca(null,t,r,e,o,n);var l=da();return t.flags|=1,typeof o=="object"&&o!==null&&typeof o.render=="function"&&o.$$typeof===void 0?(t.tag=1,t.memoizedState=null,t.updateQueue=null,Ee(r)?(l=!0,_o(t)):l=!1,t.memoizedState=o.state!==null&&o.state!==void 0?o.state:null,la(t),o.updater=Ho,t.stateNode=o,o._reactInternals=t,vi(t,r,e,n),t=wi(null,t,r,!0,l,n)):(t.tag=0,Y&&l&&qi(t),he(null,t,o,n),t=t.child),t;case 16:r=t.elementType;e:{switch(uo(e,t),e=t.pendingProps,o=r._init,r=o(r._payload),t.type=r,o=t.tag=hm(r),e=He(r,e),o){case 0:t=xi(null,t,r,e,n);break e;case 1:t=Ru(null,t,r,e,n);break e;case 11:t=Iu(null,t,r,e,n);break e;case 14:t=Mu(null,t,r,He(r.type,e),n);break e}throw Error(w(306,r,""))}return t;case 0:return r=t.type,o=t.pendingProps,o=t.elementType===r?o:He(r,o),xi(e,t,r,o,n);case 1:return r=t.type,o=t.pendingProps,o=t.elementType===r?o:He(r,o),Ru(e,t,r,o,n);case 3:e:{if(Xc(t),e===null)throw Error(w(387));r=t.pendingProps,l=t.memoizedState,o=l.element,Sc(e,t),jo(t,r,null,n);var i=t.memoizedState;if(r=i.element,l.isDehydrated)if(l={element:r,isDehydrated:!1,cache:i.cache,pendingSuspenseBoundaries:i.pendingSuspenseBoundaries,transitions:i.transitions},t.updateQueue.baseState=l,t.memoizedState=l,t.flags&256){o=Rn(Error(w(423)),t),t=Du(e,t,r,n,o);break e}else if(r!==o){o=Rn(Error(w(424)),t),t=Du(e,t,r,n,o);break e}else for(Pe=jt(t.stateNode.containerInfo.firstChild),Te=t,Y=!0,Ke=null,n=wc(t,null,r,n),t.child=n;n;)n.flags=n.flags&-3|4096,n=n.sibling;else{if(On(),r===o){t=ht(e,t,n);break e}he(e,t,r,n)}t=t.child}return t;case 5:return _c(t),e===null&&mi(t),r=t.type,o=t.pendingProps,l=e!==null?e.memoizedProps:null,i=o.children,si(r,o)?i=null:l!==null&&si(r,l)&&(t.flags|=32),Yc(e,t),he(e,t,i,n),t.child;case 6:return e===null&&mi(t),null;case 13:return Jc(e,t,n);case 4:return ia(t,t.stateNode.containerInfo),r=t.pendingProps,e===null?t.child=In(t,null,r,n):he(e,t,r,n),t.child;case 11:return r=t.type,o=t.pendingProps,o=t.elementType===r?o:He(r,o),Iu(e,t,r,o,n);case 7:return he(e,t,t.pendingProps,n),t.child;case 8:return he(e,t,t.pendingProps.children,n),t.child;case 12:return he(e,t,t.pendingProps.children,n),t.child;case 10:e:{if(r=t.type._context,o=t.pendingProps,l=t.memoizedProps,i=o.value,Q(No,r._currentValue),r._currentValue=i,l!==null)if(Je(l.value,i)){if(l.children===o.children&&!Ce.current){t=ht(e,t,n);break e}}else for(l=t.child,l!==null&&(l.return=t);l!==null;){var a=l.dependencies;if(a!==null){i=l.child;for(var u=a.firstContext;u!==null;){if(u.context===r){if(l.tag===1){u=dt(-1,n&-n),u.tag=2;var d=l.updateQueue;if(d!==null){d=d.shared;var y=d.pending;y===null?u.next=u:(u.next=y.next,y.next=u),d.pending=u}}l.lanes|=n,u=l.alternate,u!==null&&(u.lanes|=n),hi(l.return,n,t),a.lanes|=n;break}u=u.next}}else if(l.tag===10)i=l.type===t.type?null:l.child;else if(l.tag===18){if(i=l.return,i===null)throw Error(w(341));i.lanes|=n,a=i.alternate,a!==null&&(a.lanes|=n),hi(i,n,t),i=l.sibling}else i=l.child;if(i!==null)i.return=l;else for(i=l;i!==null;){if(i===t){i=null;break}if(l=i.sibling,l!==null){l.return=i.return,i=l;break}i=i.return}l=i}he(e,t,o.children,n),t=t.child}return t;case 9:return o=t.type,r=t.pendingProps.children,zn(t,n),o=Ae(o),r=r(o),t.flags|=1,he(e,t,r,n),t.child;case 14:return r=t.type,o=He(r,t.pendingProps),o=He(r.type,o),Mu(e,t,r,o,n);case 15:return Wc(e,t,t.type,t.pendingProps,n);case 17:return r=t.type,o=t.pendingProps,o=t.elementType===r?o:He(r,o),uo(e,t),t.tag=1,Ee(r)?(e=!0,_o(t)):e=!1,zn(t,n),Vc(t,r,o),vi(t,r,o,n),wi(null,t,r,!0,e,n);case 19:return Gc(e,t,n);case 22:return Kc(e,t,n)}throw Error(w(156,t.tag))};function pd(e,t){return As(e,t)}function mm(e,t,n,r){this.tag=e,this.key=n,this.sibling=this.child=this.return=this.stateNode=this.type=this.elementType=null,this.index=0,this.ref=null,this.pendingProps=t,this.dependencies=this.memoizedState=this.updateQueue=this.memoizedProps=null,this.mode=r,this.subtreeFlags=this.flags=0,this.deletions=null,this.childLanes=this.lanes=0,this.alternate=null}function Fe(e,t,n,r){return new mm(e,t,n,r)}function ka(e){return e=e.prototype,!(!e||!e.isReactComponent)}function hm(e){if(typeof e=="function")return ka(e)?1:0;if(e!=null){if(e=e.$$typeof,e===Ai)return 11;if(e===Ui)return 14}return 2}function Ot(e,t){var n=e.alternate;return n===null?(n=Fe(e.tag,t,e.key,e.mode),n.elementType=e.elementType,n.type=e.type,n.stateNode=e.stateNode,n.alternate=e,e.alternate=n):(n.pendingProps=t,n.type=e.type,n.flags=0,n.subtreeFlags=0,n.deletions=null),n.flags=e.flags&14680064,n.childLanes=e.childLanes,n.lanes=e.lanes,n.child=e.child,n.memoizedProps=e.memoizedProps,n.memoizedState=e.memoizedState,n.updateQueue=e.updateQueue,t=e.dependencies,n.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext},n.sibling=e.sibling,n.index=e.index,n.ref=e.ref,n}function fo(e,t,n,r,o,l){var i=2;if(r=e,typeof e=="function")ka(e)&&(i=1);else if(typeof e=="string")i=5;else e:switch(e){case fn:return Xt(n.children,o,l,t);case $i:i=8,o|=8;break;case Ul:return e=Fe(12,n,t,o|2),e.elementType=Ul,e.lanes=l,e;case Bl:return e=Fe(13,n,t,o),e.elementType=Bl,e.lanes=l,e;case Vl:return e=Fe(19,n,t,o),e.elementType=Vl,e.lanes=l,e;case _s:return Yo(n,o,l,t);default:if(typeof e=="object"&&e!==null)switch(e.$$typeof){case ks:i=10;break e;case Ss:i=9;break e;case Ai:i=11;break e;case Ui:i=14;break e;case xt:i=16,r=null;break e}throw Error(w(130,e==null?e:typeof e,""))}return t=Fe(i,n,t,o),t.elementType=e,t.type=r,t.lanes=l,t}function Xt(e,t,n,r){return e=Fe(7,e,r,t),e.lanes=n,e}function Yo(e,t,n,r){return e=Fe(22,e,r,t),e.elementType=_s,e.lanes=n,e.stateNode={isHidden:!1},e}function bl(e,t,n){return e=Fe(6,e,null,t),e.lanes=n,e}function Fl(e,t,n){return t=Fe(4,e.children!==null?e.children:[],e.key,t),t.lanes=n,t.stateNode={containerInfo:e.containerInfo,pendingChildren:null,implementation:e.implementation},t}function gm(e,t,n,r,o){this.tag=t,this.containerInfo=e,this.finishedWork=this.pingCache=this.current=this.pendingChildren=null,this.timeoutHandle=-1,this.callbackNode=this.pendingContext=this.context=null,this.callbackPriority=0,this.eventTimes=yl(0),this.expirationTimes=yl(-1),this.entangledLanes=this.finishedLanes=this.mutableReadLanes=this.expiredLanes=this.pingedLanes=this.suspendedLanes=this.pendingLanes=0,this.entanglements=yl(0),this.identifierPrefix=r,this.onRecoverableError=o,this.mutableSourceEagerHydrationData=null}function Sa(e,t,n,r,o,l,i,a,u){return e=new gm(e,t,n,a,u),t===1?(t=1,l===!0&&(t|=8)):t=0,l=Fe(3,null,null,t),e.current=l,l.stateNode=e,l.memoizedState={element:r,isDehydrated:n,cache:null,transitions:null,pendingSuspenseBoundaries:null},la(l),e}function vm(e,t,n){var r=3<arguments.length&&arguments[3]!==void 0?arguments[3]:null;return{$$typeof:dn,key:r==null?null:""+r,children:e,containerInfo:t,implementation:n}}function md(e){if(!e)return Mt;e=e._reactInternals;e:{if(nn(e)!==e||e.tag!==1)throw Error(w(170));var t=e;do{switch(t.tag){case 3:t=t.stateNode.context;break e;case 1:if(Ee(t.type)){t=t.stateNode.__reactInternalMemoizedMergedChildContext;break e}}t=t.return}while(t!==null);throw Error(w(171))}if(e.tag===1){var n=e.type;if(Ee(n))return mc(e,n,t)}return t}function hd(e,t,n,r,o,l,i,a,u){return e=Sa(n,r,!0,e,o,l,i,a,u),e.context=md(null),n=e.current,r=ge(),o=Lt(n),l=dt(r,o),l.callback=t??null,Pt(n,l,o),e.current.lanes=o,Pr(e,o,r),Ne(e,r),e}function Xo(e,t,n,r){var o=t.current,l=ge(),i=Lt(o);return n=md(n),t.context===null?t.context=n:t.pendingContext=n,t=dt(l,i),t.payload={element:e},r=r===void 0?null:r,r!==null&&(t.callback=r),e=Pt(o,t,i),e!==null&&(Xe(e,o,i,l),lo(e,o,i)),i}function Do(e){if(e=e.current,!e.child)return null;switch(e.child.tag){case 5:return e.child.stateNode;default:return e.child.stateNode}}function Wu(e,t){if(e=e.memoizedState,e!==null&&e.dehydrated!==null){var n=e.retryLane;e.retryLane=n!==0&&n<t?n:t}}function _a(e,t){Wu(e,t),(e=e.alternate)&&Wu(e,t)}function ym(){return null}var gd=typeof reportError=="function"?reportError:function(e){console.error(e)};function Ca(e){this._internalRoot=e}Jo.prototype.render=Ca.prototype.render=function(e){var t=this._internalRoot;if(t===null)throw Error(w(409));Xo(e,t,null,null)};Jo.prototype.unmount=Ca.prototype.unmount=function(){var e=this._internalRoot;if(e!==null){this._internalRoot=null;var t=e.containerInfo;en(function(){Xo(null,e,null,null)}),t[pt]=null}};function Jo(e){this._internalRoot=e}Jo.prototype.unstable_scheduleHydration=function(e){if(e){var t=Ks();e={blockedOn:null,target:e,priority:t};for(var n=0;n<kt.length&&t!==0&&t<kt[n].priority;n++);kt.splice(n,0,e),n===0&&Xs(e)}};function Ea(e){return!(!e||e.nodeType!==1&&e.nodeType!==9&&e.nodeType!==11)}function Go(e){return!(!e||e.nodeType!==1&&e.nodeType!==9&&e.nodeType!==11&&(e.nodeType!==8||e.nodeValue!==" react-mount-point-unstable "))}function Ku(){}function xm(e,t,n,r,o){if(o){if(typeof r=="function"){var l=r;r=function(){var d=Do(i);l.call(d)}}var i=hd(t,r,e,0,null,!1,!1,"",Ku);return e._reactRootContainer=i,e[pt]=i.current,yr(e.nodeType===8?e.parentNode:e),en(),i}for(;o=e.lastChild;)e.removeChild(o);if(typeof r=="function"){var a=r;r=function(){var d=Do(u);a.call(d)}}var u=Sa(e,0,!1,null,null,!1,!1,"",Ku);return e._reactRootContainer=u,e[pt]=u.current,yr(e.nodeType===8?e.parentNode:e),en(function(){Xo(t,u,n,r)}),u}function qo(e,t,n,r,o){var l=n._reactRootContainer;if(l){var i=l;if(typeof o=="function"){var a=o;o=function(){var u=Do(i);a.call(u)}}Xo(t,i,e,o)}else i=xm(n,t,e,o,r);return Do(i)}Hs=function(e){switch(e.tag){case 3:var t=e.stateNode;if(t.current.memoizedState.isDehydrated){var n=Zn(t.pendingLanes);n!==0&&(Qi(t,n|1),Ne(t,te()),!($&6)&&(Dn=te()+500,bt()))}break;case 13:en(function(){var r=mt(e,1);if(r!==null){var o=ge();Xe(r,e,1,o)}}),_a(e,1)}};Hi=function(e){if(e.tag===13){var t=mt(e,134217728);if(t!==null){var n=ge();Xe(t,e,134217728,n)}_a(e,134217728)}};Ws=function(e){if(e.tag===13){var t=Lt(e),n=mt(e,t);if(n!==null){var r=ge();Xe(n,e,t,r)}_a(e,t)}};Ks=function(){return U};Ys=function(e,t){var n=U;try{return U=e,t()}finally{U=n}};Zl=function(e,t,n){switch(t){case"input":if(Wl(e,n),t=n.name,n.type==="radio"&&t!=null){for(n=e;n.parentNode;)n=n.parentNode;for(n=n.querySelectorAll("input[name="+JSON.stringify(""+t)+'][type="radio"]'),t=0;t<n.length;t++){var r=n[t];if(r!==e&&r.form===e.form){var o=Bo(r);if(!o)throw Error(w(90));Es(r),Wl(r,o)}}}break;case"textarea":zs(e,n);break;case"select":t=n.value,t!=null&&_n(e,!!n.multiple,t,!1)}};Ms=ya;Rs=en;var wm={usingClientEntryPoint:!1,Events:[Lr,gn,Bo,Os,Is,ya]},Jn={findFiberByHostInstance:Ht,bundleType:0,version:"18.3.1",rendererPackageName:"react-dom"},km={bundleType:Jn.bundleType,version:Jn.version,rendererPackageName:Jn.rendererPackageName,rendererConfig:Jn.rendererConfig,overrideHookState:null,overrideHookStateDeletePath:null,overrideHookStateRenamePath:null,overrideProps:null,overridePropsDeletePath:null,overridePropsRenamePath:null,setErrorHandler:null,setSuspenseHandler:null,scheduleUpdate:null,currentDispatcherRef:gt.ReactCurrentDispatcher,findHostInstanceByFiber:function(e){return e=Fs(e),e===null?null:e.stateNode},findFiberByHostInstance:Jn.findFiberByHostInstance||ym,findHostInstancesForRefresh:null,scheduleRefresh:null,scheduleRoot:null,setRefreshHandler:null,getCurrentFiber:null,reconcilerVersion:"18.3.1-next-f1338f8080-20240426"};if(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__<"u"){var qr=__REACT_DEVTOOLS_GLOBAL_HOOK__;if(!qr.isDisabled&&qr.supportsFiber)try{Fo=qr.inject(km),et=qr}catch{}}Oe.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=wm;Oe.createPortal=function(e,t){var n=2<arguments.length&&arguments[2]!==void 0?arguments[2]:null;if(!Ea(t))throw Error(w(200));return vm(e,t,null,n)};Oe.createRoot=function(e,t){if(!Ea(e))throw Error(w(299));var n=!1,r="",o=gd;return t!=null&&(t.unstable_strictMode===!0&&(n=!0),t.identifierPrefix!==void 0&&(r=t.identifierPrefix),t.onRecoverableError!==void 0&&(o=t.onRecoverableError)),t=Sa(e,1,!1,null,null,n,!1,r,o),e[pt]=t.current,yr(e.nodeType===8?e.parentNode:e),new Ca(t)};Oe.findDOMNode=function(e){if(e==null)return null;if(e.nodeType===1)return e;var t=e._reactInternals;if(t===void 0)throw typeof e.render=="function"?Error(w(188)):(e=Object.keys(e).join(","),Error(w(268,e)));return e=Fs(t),e=e===null?null:e.stateNode,e};Oe.flushSync=function(e){return en(e)};Oe.hydrate=function(e,t,n){if(!Go(t))throw Error(w(200));return qo(null,e,t,!0,n)};Oe.hydrateRoot=function(e,t,n){if(!Ea(e))throw Error(w(405));var r=n!=null&&n.hydratedSources||null,o=!1,l="",i=gd;if(n!=null&&(n.unstable_strictMode===!0&&(o=!0),n.identifierPrefix!==void 0&&(l=n.identifierPrefix),n.onRecoverableError!==void 0&&(i=n.onRecoverableError)),t=hd(t,null,e,1,n??null,o,!1,l,i),e[pt]=t.current,yr(e),r)for(e=0;e<r.length;e++)n=r[e],o=n._getVersion,o=o(n._source),t.mutableSourceEagerHydrationData==null?t.mutableSourceEagerHydrationData=[n,o]:t.mutableSourceEagerHydrationData.push(n,o);return new Jo(t)};Oe.render=function(e,t,n){if(!Go(t))throw Error(w(200));return qo(null,e,t,!1,n)};Oe.unmountComponentAtNode=function(e){if(!Go(e))throw Error(w(40));return e._reactRootContainer?(en(function(){qo(null,null,e,!1,function(){e._reactRootContainer=null,e[pt]=null})}),!0):!1};Oe.unstable_batchedUpdates=ya;Oe.unstable_renderSubtreeIntoContainer=function(e,t,n,r){if(!Go(n))throw Error(w(200));if(e==null||e._reactInternals===void 0)throw Error(w(38));return qo(e,t,n,!1,r)};Oe.version="18.3.1-next-f1338f8080-20240426";function vd(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>"u"||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!="function"))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(vd)}catch(e){console.error(e)}}vd(),vs.exports=Oe;var Sm=vs.exports,yd,Yu=Sm;yd=Yu.createRoot,Yu.hydrateRoot;const Se="https://zdvxowpuklbypweyqqki.supabase.co",zr="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpkdnhvd3B1a2xieXB3ZXlxcWtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5NjI1MzcsImV4cCI6MjA2NjUzODUzN30.noYknWBDdtSkrLuYPRvb_P4-BbAH4qV4ya8bQQp9ijs",bn="motoflow_quote_extension_session";async function _e(e,t){const n=await fetch(e,t),r=await n.json().catch(()=>null);if(!n.ok){const o=(r==null?void 0:r.message)||(r==null?void 0:r.error_description)||(r==null?void 0:r.error)||n.statusText;throw new Error(o)}return r}async function _m(e){try{const t=await _e(`${Se}/auth/v1/token?grant_type=refresh_token`,{method:"POST",headers:{apikey:zr,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:e.refresh_token})});return window.localStorage.setItem(bn,JSON.stringify(t)),t}catch{throw window.localStorage.removeItem(bn),new Error('Tu sesion expiro. Toca "Salir" y conecta de nuevo tu usuario de Motoflow.')}}async function xd(){const e=wd();if(!(e!=null&&e.access_token))throw new Error("Conecta tu usuario de Motoflow.");const t=(e.expires_at||0)*1e3;if(t&&t-Date.now()<6e4){if(!e.refresh_token)throw window.localStorage.removeItem(bn),new Error("Tu sesion expiro. Conecta de nuevo tu usuario de Motoflow.");return _m(e)}return e}async function Ft(){const e=await xd();return{apikey:zr,Authorization:`Bearer ${e.access_token}`,"Content-Type":"application/json"}}async function Xu(e){const t=typeof e=="string"?{query:e}:e||{},n=t.query||"",r=t.limit||12,o=t.offset||0,l=t.marca||null,i=t.modelo||null,a=t.includeZeroStock!==!1;let u=zr;try{u=(await xd()).access_token}catch{}return _e(`${Se}/rest/v1/rpc/get_productos_paginados`,{method:"POST",headers:{apikey:zr,Authorization:`Bearer ${u}`,"Content-Type":"application/json"},body:JSON.stringify({p_limit:r,p_offset:o,p_search_term:n,p_marca_filter:l,p_modelo_filter:i,p_include_zero_stock:a})})}function wd(){try{const e=window.localStorage.getItem(bn);if(!e)return null;const t=JSON.parse(e);return t!=null&&t.access_token?t:null}catch{return null}}async function Cm(e,t){const n=await _e(`${Se}/auth/v1/token?grant_type=password`,{method:"POST",headers:{apikey:zr,"Content-Type":"application/json"},body:JSON.stringify({email:e,password:t})});return window.localStorage.setItem(bn,JSON.stringify(n)),n}function Em(){window.localStorage.removeItem(bn)}async function Nm(e){const t=await Ft(),n=String(e||"").trim();if(!n)return[];const r=[`nombre.ilike.*${n}*`,`telefono.ilike.*${n}*`,`rnc.ilike.*${n}*`,`codigo.ilike.*${n}*`].join(","),o=new URL(`${Se}/rest/v1/clientes`);return o.searchParams.set("select","id,nombre,telefono,rnc,codigo"),o.searchParams.set("activo","eq.true"),o.searchParams.set("or",`(${r})`),o.searchParams.set("order","nombre.asc"),o.searchParams.set("limit","8"),_e(o.toString(),{headers:t})}async function zm(){const e=await Ft(),t=new URL(`${Se}/rest/v1/vendedores`);return t.searchParams.set("select","id,nombre"),t.searchParams.set("activo","eq.true"),t.searchParams.set("order","nombre.asc"),_e(t.toString(),{headers:e})}async function jm(){const e=await Ft();return _e(`${Se}/rest/v1/rpc/get_clientes_morosos`,{method:"POST",headers:e,body:"{}"})}async function Pm({clienteId:e,telefono:t}){if(!e)throw new Error("cliente_id es requerido.");const n=await Ft();return _e(`${Se}/rest/v1/rpc/set_cliente_telefono`,{method:"POST",headers:n,body:JSON.stringify({p_cliente_id:e,p_telefono:t||null})})}async function Ju(e){if(!e)return null;const t=await Ft();return _e(`${Se}/rest/v1/rpc/marcar_envio_cobranza`,{method:"POST",headers:t,body:JSON.stringify({p_cliente_id:e})})}async function Tm({clienteId:e,estado:t,fecha:n,nota:r}){if(!e)throw new Error("cliente_id es requerido.");const o=await Ft();return _e(`${Se}/rest/v1/rpc/set_cobranza_seguimiento`,{method:"POST",headers:o,body:JSON.stringify({p_cliente_id:e,p_estado:t||"pendiente",p_fecha:n||null,p_nota:r||null})})}async function Lm(e){const t=await Ft(),n=await _e(`${Se}/rest/v1/rpc/get_next_cotizacion_numero`,{method:"POST",headers:t,body:"{}"}),r=await _e(`${Se}/auth/v1/user`,{headers:t}),o={numero:n,fecha_cotizacion:e.fecha_cotizacion,fecha_vencimiento:e.fecha_vencimiento,cliente_id:e.cliente_id,subtotal:e.subtotal,descuento_total:e.descuento_total||0,itbis_total:e.itbis_total,total_cotizacion:e.total_cotizacion,estado:"Facturando",notas:e.notas||null,usuario_id:(r==null?void 0:r.id)||null,vendedor_id:e.vendedor_id||null,manual_cliente_nombre:e.manual_cliente_nombre||null},[l]=await _e(`${Se}/rest/v1/cotizaciones?select=*`,{method:"POST",headers:{...t,Prefer:"return=representation"},body:JSON.stringify(o)}),i=e.detalles.map(a=>({...a,cotizacion_id:l.id}));return await _e(`${Se}/rest/v1/cotizaciones_detalle`,{method:"POST",headers:t,body:JSON.stringify(i)}),l}async function Om(e){const t=await Ft(),n={source:"whatsapp_web_extension",event_type:e.event_type,cliente_id:e.cliente_id||null,vendedor_id:e.vendedor_id||null,cotizacion_id:e.cotizacion_id||null,chat_id:e.chat_id||null,chat_name:e.chat_name||null,customer_name:e.customer_name||null,customer_phone:e.customer_phone||null,status:e.status||null,note:e.note||null,quote_total:e.quote_total||0,items:e.items||[],metadata:e.metadata||{}};return _e(`${Se}/rest/v1/crm_whatsapp_conversation_events`,{method:"POST",headers:t,body:JSON.stringify(n)})}function Pn(e){return String(e||"").replace(/\s+/g," ").trim()}function Gu(e){return new Promise(t=>window.setTimeout(t,e))}function qu(){var i,a;const e=document.querySelector("header"),t=((i=e==null?void 0:e.querySelector("[title]"))==null?void 0:i.getAttribute("title"))||((a=e==null?void 0:e.querySelector('span[dir="auto"]'))==null?void 0:a.textContent)||"",n=Pn(t),r=Pn(window.location.pathname),o=Pn(window.location.hash);return{id:n||o||r||"whatsapp-web",name:n}}function Im(){const e=Array.from(document.querySelectorAll('[contenteditable="true"]'));return e.find(t=>t.getAttribute("data-tab")==="10")||e.find(t=>t.getAttribute("role")==="textbox")||e[e.length-1]||null}async function Zu(e){const t=Im();if(!t)return!1;t.focus();const n=Pn(t.textContent),r=new DataTransfer;r.setData("text/plain",e),t.dispatchEvent(new ClipboardEvent("paste",{bubbles:!0,cancelable:!0,clipboardData:r})),await Gu(120);const o=Pn(t.textContent);if(o&&o!==n)return!0;document.execCommand("insertText",!1,e),await Gu(60);const l=Pn(t.textContent);return(!l||l===n)&&(t.textContent=e,t.dispatchEvent(new InputEvent("input",{bubbles:!0,inputType:"insertText",data:e}))),!0}const Re=new Intl.NumberFormat("es-DO",{style:"currency",currency:"DOP",minimumFractionDigits:2}),Mm=new Intl.NumberFormat("es-DO",{minimumFractionDigits:2,maximumFractionDigits:2}),Rm="Hola {NOMBRE}. El estado de su cuenta en {EMPRESA} es el siguiente: cuotas atrasadas: {N} FACTURA: {FACTURAS}, MONTO ATRASADO: {MONTO} - Favor pagar a mas tardar entre las proximas 48 horas y evitar cargos adicionales, este es un mensaje automatico del sistema. Gracias.";function Dm(e){const t=(e==null?void 0:e.plantilla)&&e.plantilla.trim()||Rm,n=((e==null?void 0:e.facturas)||[]).map(o=>o.numero).join(", "),r={"{NOMBRE}":(e==null?void 0:e.cliente_nombre)||"","{EMPRESA}":(e==null?void 0:e.empresa_nombre)||"la empresa","{N}":String((e==null?void 0:e.cuotas_atrasadas)??0),"{FACTURAS}":n,"{MONTO}":Mm.format(Number(e==null?void 0:e.total_atrasado)||0)};return t.replace(/\{NOMBRE\}|\{EMPRESA\}|\{N\}|\{FACTURAS\}|\{MONTO\}/g,o=>r[o]??o)}function bm(e,t,n){return Dm({plantilla:n,empresa_nombre:t,cliente_nombre:e.cliente_nombre,cuotas_atrasadas:e.cuotas_atrasadas,total_atrasado:e.total_atrasado,facturas:e.facturas})}const cn="motoflow_pending_cobro",Fm=[{key:"ir_a_buscar",label:"Ir a buscar"},{key:"cliente_vendra",label:"Cliente vendra"}];function $m(e){let t=String(e||"").replace(/\D/g,"");return t?(t.length===10&&(t="1"+t),t):""}const Am="motoflow_quote_draft:",Um="motoflow_quote_last_sent:",Bm="motoflow_quote_meta:",Vm="motoflow_quote_history:",Qm=35,Hm="2749fa36-3d7c-4bdf-ad61-df88eda8365a",Zr=[{key:"cotizado",label:"Cotizado"},{key:"confirmado",label:"Confirmado"},{key:"pendiente_pago",label:"Pendiente pago"},{key:"delivery",label:"Delivery"},{key:"perdido",label:"Perdido"}];function Z(e,t=0){const n=Number(e);return Number.isFinite(n)?n:t}function Wm(e){const t=Z(e.precio??e.precio_venta??e.precio1,0),n=Z(e.itbis_pct,.18);return{lineId:`${e.id||e.codigo||Date.now()}-${Date.now()}`,productId:e.id,codigo:e.codigo||"",descripcion:e.descripcion||e.nombre||"Producto",precio:t,cantidad:1,itbisPct:n,existencia:Z(e.existencia,0),imagenUrl:e.imagen_url||""}}function es(e){return`${Am}${e.id||"sin-chat"}`}function kd(e){return`${Um}${e.id||"sin-chat"}`}function Sd(e){return`${Bm}${e.id||"sin-chat"}`}function _d(e){return`${Vm}${e.id||"sin-chat"}`}function ts(e){try{const t=window.localStorage.getItem(kd(e));return t?JSON.parse(t):null}catch{return null}}function $l(e){try{const t=window.localStorage.getItem(Sd(e));return t?JSON.parse(t):{}}catch{return{}}}function ns(e){try{const t=window.localStorage.getItem(_d(e));return t?JSON.parse(t):[]}catch{return[]}}function Km(e,t){window.localStorage.setItem(_d(e),JSON.stringify(t.slice(0,8)))}function Ym(e,t,n){return["Hola, esta es tu cotizacion:","",t.map(o=>{const l=Z(o.cantidad,1);return`${o.descripcion}  ${l} x ${Re.format(o.precio)}`}).join(`
`),"",`Total: ${Re.format(n.total)}`,"","Quedo atento para confirmar disponibilidad y entrega."].join(`
`)}function Bt(e){return e.map(t=>({product_id:t.productId||null,codigo:t.codigo||"",descripcion:t.descripcion,cantidad:Z(t.cantidad,1),precio:Z(t.precio,0),itbis_pct:Z(t.itbisPct,.18),existencia:Z(t.existencia,0)}))}function Xm(){var Ra,Da;const[e,t]=L.useState(!1),[n,r]=L.useState("cotizar"),[o,l]=L.useState(()=>qu()),[i,a]=L.useState([]),[u,d]=L.useState(""),[y,g]=L.useState([]),[h,S]=L.useState(!1),[_,k]=L.useState(""),[O,f]=L.useState(()=>wd()),[c,m]=L.useState(""),[x,C]=L.useState(""),[j,P]=L.useState(!1),[T,B]=L.useState(!1),[b,ze]=L.useState(""),[nt,$t]=L.useState(""),[rn,Zo]=L.useState(""),[At,Un]=L.useState(!0),[E,M]=L.useState([]),[D,K]=L.useState(!1),[q,Ut]=L.useState(!1),[Be,on]=L.useState(!1),[le,vt]=L.useState(()=>ts(o)),[ln,el]=L.useState(""),[Na,an]=L.useState([]),[V,tl]=L.useState(null),[Bn,nl]=L.useState(""),[Cd,za]=L.useState([]),[rl,Ed]=L.useState(""),[rt,ol]=L.useState(()=>$l(o).internalNote||""),[ot,ll]=L.useState(()=>$l(o).quoteStatus||"cotizado"),[il,al]=L.useState(()=>ns(o)),[ja,Nd]=L.useState(!1),[lt,un]=L.useState(null),[Ir,Pa]=L.useState(!1),[Ta,Ve]=L.useState(""),[ul,zd]=L.useState(""),[Mr,La]=L.useState("todos"),[sl,jd]=L.useState(null),Oa=L.useRef("");L.useEffect(()=>{const s=window.setInterval(()=>{const v=qu();l(N=>N.id===v.id&&N.name===v.name?N:v)},900);return()=>window.clearInterval(s)},[]),L.useEffect(()=>{const s=document.documentElement;return s.classList.toggle("mf-panel-open",!e),()=>s.classList.remove("mf-panel-open")},[e]),L.useEffect(()=>{let s;try{s=window.localStorage.getItem(cn)}catch{return}if(!s)return;let v;try{v=JSON.parse(s)}catch{window.localStorage.removeItem(cn);return}if(!(v!=null&&v.text)||Date.now()-(v.ts||0)>9e4){window.localStorage.removeItem(cn);return}r("cobranza"),dl();let N=0,R=!1;const xe=async()=>{if(R)return;N+=1,await Zu(v.text)?(window.localStorage.removeItem(cn),Ve("Recordatorio pegado en el chat. Revisa y presiona Enter para enviar.")):N<25?window.setTimeout(xe,700):window.localStorage.removeItem(cn)},I=window.setTimeout(xe,1800);return()=>{R=!0,window.clearTimeout(I)}},[]),L.useEffect(()=>{try{const s=window.localStorage.getItem(es(o)),v=$l(o);a(s?JSON.parse(s):[]),vt(ts(o)),al(ns(o)),ol(v.internalNote||""),ll(v.quoteStatus||"cotizado")}catch{a([]),vt(null),al([]),ol(""),ll("cotizado")}},[o.id]),L.useEffect(()=>{try{window.localStorage.setItem(es(o),JSON.stringify(i))}catch{}},[o.id,i]),L.useEffect(()=>{try{window.localStorage.setItem(Sd(o),JSON.stringify({internalNote:rt,quoteStatus:ot}))}catch{}},[o.id,rt,ot]),L.useEffect(()=>{const s=u.trim();if(s.length<2){g([]);return}let v=!0;return S(!0),Xu(s).then(N=>{v&&g(N)}).catch(N=>{v&&(k(N.message||"No se pudo buscar productos."),g([]))}).finally(()=>{v&&S(!1)}),()=>{v=!1}},[u,O==null?void 0:O.access_token]),L.useEffect(()=>{if(!T||!O)return;let s=!0;return K(!0),Xu({query:b.trim(),marca:nt.trim(),modelo:rn.trim(),includeZeroStock:At,limit:Qm,offset:0}).then(v=>{s&&M(v)}).catch(v=>{s&&(k(v.message||"No se pudo buscar productos."),M([]))}).finally(()=>{s&&K(!1)}),()=>{s=!1}},[T,b,nt,rn,At,O==null?void 0:O.access_token]),L.useEffect(()=>{O&&zm().then(s=>za(s||[])).catch(()=>za([]))},[O==null?void 0:O.access_token]),L.useEffect(()=>{o.name&&(el(s=>s||o.name),/[\d+() -]{7,}/.test(o.name)&&nl(s=>s||o.name))},[o.name]),L.useEffect(()=>{if(!O||V){an([]);return}const s=ln.trim();if(s.length<2){an([]);return}let v=!0;return Nm(s).then(N=>{v&&an(N||[])}).catch(()=>{v&&an([])}),()=>{v=!1}},[ln,V==null?void 0:V.id,O==null?void 0:O.access_token]);const Me=L.useMemo(()=>i.reduce((s,v)=>{const R=Z(v.cantidad,1)*Z(v.precio,0),xe=Z(v.itbisPct,0),I=xe>0?R/(1+xe):R,A=R-I;return s.subtotal+=I,s.tax+=A,s.total+=R,s},{subtotal:0,tax:0,total:0}),[i]);i.reduce((s,v)=>s+Z(v.cantidad,0),0);function cl(s){const v=Wm(s);a(N=>[...N,v]),it("product_added",{items:Bt([v]),quote_total:Me.total+v.cantidad*v.precio}),d(""),g([]),B(!1),k("")}function Ia(s,v){a(N=>N.map(R=>R.lineId===s?{...R,...v}:R))}function Pd(s){const v=i.find(N=>N.lineId===s);a(N=>N.filter(R=>R.lineId!==s)),v&&it("product_removed",{items:Bt([v])})}function it(s,v={}){O!=null&&O.access_token&&Om({event_type:s,chat_id:o.id,chat_name:o.name,cliente_id:(V==null?void 0:V.id)||null,vendedor_id:rl||null,customer_name:(V==null?void 0:V.nombre)||ln||o.name||null,customer_phone:Bn||(V==null?void 0:V.telefono)||null,status:ot,note:rt,quote_total:Me.total,items:Bt(i),...v,metadata:{selected_customer:V?{id:V.id,nombre:V.nombre,telefono:V.telefono||null}:null,...v.metadata}}).catch(N=>{console.debug("[Motoflow WhatsApp] No se pudo guardar evento:",N.message)})}function Td(s){var N;ll(s);const v=((N=Zr.find(R=>R.key===s))==null?void 0:N.label)||s;it("status_changed",{status:s,metadata:{status_label:v}})}function Ld(){rt.trim()&&it("internal_note_saved",{note:rt.trim()})}function Od(){var s;(s=le==null?void 0:le.lines)!=null&&s.length&&(a(le.lines.map(v=>({...v,lineId:`${v.productId||v.codigo||"line"}-${Date.now()}-${Math.random().toString(16).slice(2)}`}))),it("quote_restored",{quote_total:le.total||0,items:Bt(le.lines)}),k("Ultima cotizacion recuperada. Puedes agregar, quitar o cambiar cantidades."))}function Id(s){var v;(v=s==null?void 0:s.lines)!=null&&v.length&&(a(s.lines.map(N=>({...N,lineId:`${N.productId||N.codigo||"line"}-${Date.now()}-${Math.random().toString(16).slice(2)}`}))),it("quote_restored",{quote_total:s.total||0,items:Bt(s.lines),metadata:{restored_from_history:!0}}),k(`Cotizacion recuperada del historial: ${Re.format(s.total||0)}.`))}function Md(s){const N=[{...s,id:`${Date.now()}-${Math.random().toString(16).slice(2)}`,status:ot,note:rt},...il].slice(0,8);window.localStorage.setItem(kd(o),JSON.stringify(s)),Km(o,N),vt(s),al(N)}async function Rd(){if(!q){if(!i.length){k("Agrega al menos un producto antes de crear la cotizacion.");return}Ut(!0);try{const s=Ym(o,i,Me);if(await Zu(s)){const N={sentAt:new Date().toISOString(),lines:i,total:Me.total};Md(N),it("quote_pasted",{quote_total:Me.total,items:Bt(i),metadata:{message_ready_for_manual_send:!0}}),a([]),g([]),d(""),B(!1),t(!0),k("")}else k("No encontre el cuadro de mensaje de WhatsApp.")}finally{window.setTimeout(()=>Ut(!1),900)}}}async function Dd(){var s;if(!Be){if(!i.length){k("Recupera o prepara una cotizacion antes de mandarla a facturar.");return}on(!0);try{const v=new Date,N=new Date(v);N.setDate(N.getDate()+7);const R=A=>A.toISOString().slice(0,10),xe=i.map(A=>{const ba=Z(A.cantidad,1),Fa=Z(A.precio,0),$a=Z(A.itbisPct,.18),Rr=ba*Fa,Yd=$a>0?Rr/(1+$a):Rr,Xd=Rr-Yd;return{producto_id:A.productId,codigo:A.codigo||"",descripcion:A.descripcion,cantidad:ba,unidad:"UND",precio_unitario:Fa,descuento_pct:0,descuento_valor:0,itbis_valor:Xd,importe:Rr}}),I=await Lm({fecha_cotizacion:R(v),fecha_vencimiento:R(N),cliente_id:(V==null?void 0:V.id)||Hm,manual_cliente_nombre:V!=null&&V.id?null:ln.trim()||o.name||"Cliente WhatsApp",vendedor_id:rl||null,subtotal:Me.subtotal,descuento_total:0,itbis_total:Me.tax,total_cotizacion:Me.total,notas:["Cotizacion confirmada desde WhatsApp Web",o.name?`Chat: ${o.name}`:null,Bn?`Telefono: ${Bn}`:null,ot?`Estado: ${((s=Zr.find(A=>A.key===ot))==null?void 0:s.label)||ot}`:null,rt.trim()?`Nota interna: ${rt.trim()}`:null].filter(Boolean).join(" | "),detalles:xe});it("quote_sent_to_invoice",{cotizacion_id:I.id,quote_total:Me.total,items:Bt(i),metadata:{cotizacion_numero:I.numero}}),k(`Lista para facturar en Motoflow: cotizacion ${I.numero}.`)}catch(v){k(v.message||"No se pudo mandar a facturar en Motoflow.")}finally{on(!1)}}}async function bd(s){s.preventDefault(),P(!0),k("");try{const v=await Cm(c.trim(),x);f(v),C(""),k("Conectado a Motoflow. Ya puedes buscar productos.")}catch(v){k(v.message||"No se pudo iniciar sesion.")}finally{P(!1)}}function Fd(){Em(),f(null),g([]),d(""),k("Sesion cerrada en la extension.")}function $d(s){tl(s),el(s.nombre||""),nl(s.telefono||Bn),an([])}function Ad(){tl(null),an([])}function Ud(){r("cobranza"),dl()}async function dl(){var s;Pa(!0),Ve("");try{const v=await jm();un(v),(s=v==null?void 0:v.clientes)!=null&&s.length||Ve("No hay clientes con facturas vencidas. Todo al dia.")}catch(v){Ve(v.message||"No se pudo cargar la lista de cobranza."),un(null)}finally{Pa(!1)}}function fl(s){return Tm({clienteId:s.cliente_id,estado:s.seg_estado||"pendiente",fecha:s.seg_fecha||null,nota:s.seg_nota||null}).catch(v=>{console.warn("[Motoflow] No se pudo guardar seguimiento:",v.message),Ve(`No se pudo guardar el seguimiento: ${v.message||"error"}`)})}function Bd(s,v){un(N=>N&&{...N,clientes:N.clientes.map(R=>R.cliente_id===s?{...R,cliente_telefono:v}:R)})}async function Vd(s){try{await Pm({clienteId:s.cliente_id,telefono:(s.cliente_telefono||"").trim()||null}),Ve(`Telefono de ${s.cliente_nombre} actualizado.`)}catch(v){console.warn("[Motoflow] No se pudo guardar telefono:",v.message),Ve(`No se pudo guardar el telefono: ${v.message||"error"}`)}}function Qd(s,v){un(N=>N&&{...N,clientes:N.clientes.map(R=>R.cliente_id===s?{...R,...v}:R)})}function Ma(s,v){un(N=>{if(!N)return N;const R=N.clientes.map(I=>I.cliente_id===s?{...I,...v}:I),xe=R.find(I=>I.cliente_id===s);return xe&&fl(xe),{...N,clientes:R}})}function Hd(s,v){const N=s.seg_estado===v?"pendiente":v,R={seg_estado:N};N!=="cliente_vendra"&&(R.seg_fecha=null),Ma(s.cliente_id,R)}async function Wd(s){await fl(s);const v=s.seg_fecha,N=new Date().toISOString().slice(0,10);v&&v>N?(un(R=>R&&{...R,clientes:R.clientes.filter(xe=>xe.cliente_id!==s.cliente_id)}),Ve(`${s.cliente_nombre} pospuesto. Reaparecera el ${v}.`)):Ve("Indica una fecha futura para posponer al cliente.")}async function Kd(s){if(sl)return;const v=$m(s.cliente_telefono),N=bm(s,lt==null?void 0:lt.empresa_nombre,lt==null?void 0:lt.plantilla);if(!v){try{await navigator.clipboard.writeText(N),await Ju(s.cliente_id).catch(()=>{}),Ve(`${s.cliente_nombre} no tiene telefono. Mensaje copiado al portapapeles.`)}catch{Ve(`${s.cliente_nombre} no tiene telefono registrado.`)}return}jd(s.cliente_id),await Ju(s.cliente_id).catch(()=>{});try{window.localStorage.setItem(cn,JSON.stringify({phone:v,text:N,ts:Date.now()}))}catch{}it("cobro_reminder_pasted",{cliente_id:s.cliente_id,customer_name:s.cliente_nombre,customer_phone:s.cliente_telefono,metadata:{cuotas_atrasadas:s.cuotas_atrasadas,total_atrasado:s.total_atrasado,facturas:(s.facturas||[]).map(R=>R.numero),via:"lista_morosos"}}),window.location.href=`https://web.whatsapp.com/send?phone=${v}`}return e?p.jsx("button",{className:"mf-floating-button",type:"button",onClick:()=>t(!1),children:"Cotizar"}):p.jsxs("aside",{className:"mf-panel","aria-label":"Cotizacion WhatsApp",children:[p.jsxs("header",{className:"mf-header",children:[p.jsxs("div",{children:[p.jsx("p",{className:"mf-kicker",children:"Motoflow"}),p.jsx("h2",{children:"Cotizacion WhatsApp"}),p.jsx("p",{className:"mf-chat",children:o.name||"Chat actual"}),p.jsxs("div",{className:"mf-header-actions",children:[O&&p.jsxs(p.Fragment,{children:[p.jsx("span",{children:"Conectado"}),p.jsx("button",{className:"mf-logout-button",type:"button",onClick:Fd,children:"Salir"})]}),p.jsx("button",{className:"mf-icon-button",type:"button",onClick:()=>t(!0),title:"Colapsar",children:"x"})]})]}),p.jsx("button",{className:"mf-icon-button",type:"button",onClick:()=>t(!0),title:"Colapsar",children:"×"})]}),O&&p.jsxs("nav",{className:"mf-tabs",children:[p.jsx("button",{className:`mf-tab-quote${n==="cotizar"?" is-active":""}`,type:"button",onClick:()=>r("cotizar"),children:"Cotizar"}),p.jsx("button",{className:`mf-tab-cobro${n==="cobranza"?" is-active":""}`,type:"button",onClick:Ud,children:"Ver deuda"})]}),!O&&p.jsxs("form",{className:"mf-login",onSubmit:bd,children:[p.jsx("strong",{children:"Conectar con Motoflow"}),p.jsx("p",{children:"Usa el mismo correo y clave del CRM para habilitar la busqueda."}),p.jsx("input",{autoComplete:"email",type:"email",value:c,onChange:s=>m(s.target.value),placeholder:"Correo",required:!0}),p.jsx("input",{autoComplete:"current-password",type:"password",value:x,onChange:s=>C(s.target.value),placeholder:"Clave",required:!0}),p.jsx("button",{type:"submit",disabled:j,children:j?"Conectando...":"Conectar"})]}),O&&n==="cotizar"&&p.jsxs("section",{className:"mf-motoflow-box",children:[p.jsxs("button",{className:"mf-motoflow-toggle",type:"button",onClick:()=>Nd(s=>!s),children:[p.jsxs("span",{children:["Datos Motoflow",p.jsxs("small",{children:[(V==null?void 0:V.nombre)||ln||o.name||"Cliente sin asignar"," · ",((Ra=Zr.find(s=>s.key===ot))==null?void 0:Ra.label)||"Cotizado"]})]}),p.jsx("b",{children:ja?"Ocultar":"Editar"})]}),ja&&p.jsxs(p.Fragment,{children:[p.jsxs("div",{className:"mf-customer-box",children:[p.jsx("label",{htmlFor:"mf-customer-search",children:"Cliente para Motoflow"}),p.jsxs("div",{className:"mf-customer-row",children:[p.jsx("input",{id:"mf-customer-search",value:ln,onChange:s=>{el(s.target.value),tl(null)},placeholder:"Nombre, telefono, RNC..."}),V&&p.jsx("button",{type:"button",onClick:Ad,title:"Cambiar cliente",children:"x"})]}),Na.length>0&&p.jsx("div",{className:"mf-customer-results",children:Na.map(s=>p.jsxs("button",{type:"button",onClick:()=>$d(s),children:[p.jsx("strong",{children:s.nombre}),p.jsx("small",{children:s.telefono||s.rnc||s.codigo||"Cliente registrado"})]},s.id))}),p.jsxs("div",{className:"mf-customer-grid",children:[p.jsx("input",{value:Bn,onChange:s=>nl(s.target.value),placeholder:"Telefono"}),p.jsxs("select",{value:rl,onChange:s=>Ed(s.target.value),children:[p.jsx("option",{value:"",children:"Vendedor"}),Cd.map(s=>p.jsx("option",{value:s.id,children:s.nombre},s.id))]})]})]}),p.jsxs("div",{className:"mf-workflow-box",children:[p.jsx("label",{children:"Estado rapido"}),p.jsx("div",{className:"mf-status-grid",children:Zr.map(s=>p.jsx("button",{className:ot===s.key?"is-active":"",type:"button",onClick:()=>Td(s.key),children:s.label},s.key))}),p.jsx("textarea",{value:rt,onChange:s=>ol(s.target.value),onBlur:Ld,placeholder:"Nota interna para Motoflow...",rows:"2"})]})]})]}),O&&n==="cobranza"&&(()=>{const s=(lt==null?void 0:lt.clientes)||[],v=ul.trim().toLowerCase(),N=s.filter(I=>I.por_reenviar).length;let R=Mr==="reenviar"?s.filter(I=>I.por_reenviar):s;v&&(R=R.filter(I=>(I.cliente_nombre||"").toLowerCase().includes(v)||(I.cliente_telefono||"").toLowerCase().includes(v)));const xe=s.reduce((I,A)=>I+(Number(A.total_atrasado)||0),0);return p.jsxs("section",{className:"mf-cobranza",children:[p.jsxs("div",{className:"mf-cobranza-head",children:[p.jsx("input",{className:"mf-cobranza-filter",value:ul,onChange:I=>zd(I.target.value),placeholder:"Buscar cliente..."}),p.jsx("button",{type:"button",onClick:dl,disabled:Ir,title:"Actualizar",children:Ir?"...":"↻"})]}),s.length>0&&p.jsxs("div",{className:"mf-cobranza-tabs",children:[p.jsxs("button",{type:"button",className:Mr==="todos"?"is-active":"",onClick:()=>La("todos"),children:["Todos (",s.length,")"]}),p.jsxs("button",{type:"button",className:`mf-tab-reenviar${Mr==="reenviar"?" is-active":""}`,onClick:()=>La("reenviar"),children:["Para reenviar (",N,")"]})]}),s.length>0&&p.jsxs("div",{className:"mf-cobranza-summary",children:[p.jsxs("span",{children:[s.length," cliente(s) con deuda vencida"]}),p.jsx("b",{children:Re.format(xe)})]}),Ta&&p.jsx("p",{className:"mf-cobro-msg",children:Ta}),Ir&&!s.length&&p.jsx("p",{className:"mf-muted",children:"Cargando lista de cobranza..."}),p.jsxs("div",{className:"mf-cobranza-list",children:[R.map(I=>p.jsxs("article",{className:"mf-cob-card",children:[p.jsxs("header",{className:"mf-cob-card-head",children:[p.jsx("strong",{children:I.cliente_nombre}),p.jsxs("span",{className:"mf-cob-head-badges",children:[I.por_reenviar&&p.jsx("span",{className:"mf-cob-badge is-reenviar",children:"Reenviar"}),p.jsxs("span",{className:`mf-cob-badge${I.dias_mas_vencido>=30?" is-red":""}`,children:[I.dias_mas_vencido,"d"]})]})]}),p.jsxs("div",{className:"mf-cob-card-info",children:[p.jsx("input",{className:"mf-cob-phone",type:"tel",value:I.cliente_telefono||"",onChange:A=>Bd(I.cliente_id,A.target.value),onFocus:A=>{Oa.current=A.target.value},onBlur:A=>{A.target.value!==Oa.current&&Vd(I)},placeholder:"Agregar telefono"}),p.jsx("b",{children:Re.format(I.total_atrasado)})]}),p.jsxs("div",{className:"mf-cob-card-facts",children:[I.cuotas_atrasadas," cuota(s): ",(I.facturas||[]).map(A=>A.numero).join(", ")]}),p.jsx("div",{className:"mf-cob-seg",children:Fm.map(A=>p.jsx("button",{type:"button",className:I.seg_estado===A.key?"is-active":"",onClick:()=>Hd(I,A.key),children:A.label},A.key))}),I.seg_estado==="cliente_vendra"&&p.jsx("input",{type:"date",className:"mf-cob-date",value:I.seg_fecha||"",onChange:A=>Ma(I.cliente_id,{seg_fecha:A.target.value||null})}),p.jsx("input",{className:"mf-cob-nota",value:I.seg_nota||"",onChange:A=>Qd(I.cliente_id,{seg_nota:A.target.value}),onBlur:()=>fl(I),placeholder:"Nota interna..."}),I.seg_estado==="cliente_vendra"?p.jsx("button",{className:"mf-cob-send mf-cob-save",type:"button",onClick:()=>Wd(I),children:"Guardar"}):p.jsx("button",{className:"mf-cob-send",type:"button",onClick:()=>Kd(I),disabled:sl===I.cliente_id,children:sl===I.cliente_id?"Abriendo chat...":"Enviar msj"})]},I.cliente_id)),!Ir&&s.length>0&&R.length===0&&p.jsx("p",{className:"mf-muted",children:Mr==="reenviar"?"No hay clientes para reenviar (los que recibieron mensaje ya pagaron, o aun no les has enviado).":`Ningun cliente coincide con "${ul}".`})]})]})})(),n==="cotizar"&&p.jsxs(p.Fragment,{children:[p.jsxs("section",{className:"mf-search",children:[p.jsx("label",{htmlFor:"mf-product-search",children:"Buscar producto"}),p.jsx("input",{id:"mf-product-search",value:u,onChange:s=>d(s.target.value),placeholder:"Codigo, descripcion...",disabled:!O}),!O&&p.jsx("p",{className:"mf-muted",children:"Conecta tu usuario del CRM para buscar productos."}),h&&p.jsx("p",{className:"mf-muted",children:"Buscando..."}),!h&&u.trim().length>=2&&O&&y.length===0&&p.jsxs("p",{className:"mf-muted",children:['Sin resultados para "',u.trim(),'".']}),y.length>0&&p.jsx("div",{className:"mf-results",children:y.map(s=>p.jsxs("button",{type:"button",onClick:()=>cl(s),children:[p.jsxs("span",{children:[p.jsx("strong",{children:s.codigo||"SIN CODIGO"}),p.jsx("small",{children:s.descripcion||s.nombre})]}),p.jsxs("span",{children:[p.jsx("strong",{children:Re.format(Z(s.precio??s.precio_venta??s.precio1,0))}),p.jsxs("small",{children:["Exist. ",Z(s.existencia,0)]})]})]},s.id||s.codigo))}),p.jsx("button",{className:"mf-advanced-button",type:"button",onClick:()=>B(!0),disabled:!O,children:"Abrir busqueda avanzada"})]}),p.jsx("section",{className:"mf-items",children:i.length===0?p.jsxs("div",{className:"mf-empty",children:[p.jsx("strong",{children:"Todavia no hay articulos."}),p.jsx("p",{children:"Agrega productos manualmente desde el buscador para preparar la cotizacion sin salir de WhatsApp."}),((Da=le==null?void 0:le.lines)==null?void 0:Da.length)>0&&p.jsxs("button",{className:"mf-restore-button",type:"button",onClick:Od,children:["Recuperar ultima cotizacion (",le.lines.length,")"]}),il.length>0&&p.jsxs("div",{className:"mf-history-list",children:[p.jsx("strong",{children:"Historial del chat"}),il.slice(0,4).map(s=>{var v;return p.jsxs("button",{type:"button",onClick:()=>Id(s),children:[p.jsx("span",{children:new Date(s.sentAt).toLocaleTimeString("es-DO",{hour:"2-digit",minute:"2-digit"})}),p.jsxs("span",{children:[((v=s.lines)==null?void 0:v.length)||0," art."]}),p.jsx("b",{children:Re.format(s.total||0)})]},s.id||s.sentAt)})]})]}):i.map(s=>p.jsxs("article",{className:"mf-line",children:[p.jsxs("div",{className:"mf-line-main",children:[p.jsx("strong",{children:s.descripcion}),p.jsxs("small",{children:[s.codigo||"Sin codigo"," · Exist. ",s.existencia]})]}),p.jsxs("div",{className:"mf-line-controls",children:[p.jsx("input",{"aria-label":"Cantidad",min:"1",type:"number",value:s.cantidad,onChange:v=>Ia(s.lineId,{cantidad:Z(v.target.value,1)})}),p.jsx("input",{"aria-label":"Precio",min:"0",step:"0.01",type:"number",value:s.precio,onChange:v=>Ia(s.lineId,{precio:Z(v.target.value,0)})}),p.jsx("button",{type:"button",onClick:()=>Pd(s.lineId),title:"Eliminar",children:"×"})]}),p.jsx("footer",{children:Re.format(s.cantidad*s.precio)})]},s.lineId))}),p.jsxs("footer",{className:"mf-footer",children:[p.jsxs("dl",{children:[p.jsxs("div",{children:[p.jsx("dt",{children:"Subtotal"}),p.jsx("dd",{children:Re.format(Me.subtotal)})]}),p.jsxs("div",{children:[p.jsx("dt",{children:"ITBIS"}),p.jsx("dd",{children:Re.format(Me.tax)})]}),p.jsxs("div",{children:[p.jsx("dt",{children:"Total seleccionado"}),p.jsx("dd",{children:Re.format(Me.total)})]})]}),_&&p.jsx("p",{className:"mf-notice",children:_}),p.jsx("button",{className:"mf-secondary",type:"button",onClick:Dd,disabled:Be||!i.length,children:Be?"Enviando a Motoflow...":"Mandar a facturar en Motoflow"}),p.jsx("button",{className:"mf-primary",type:"button",onClick:Rd,disabled:q,children:q?"Pegando cotizacion...":"Crear y pegar cotizacion"})]})]}),T&&p.jsx("div",{className:"mf-modal-backdrop",role:"dialog","aria-modal":"true","aria-label":"Buscar producto",children:p.jsxs("div",{className:"mf-product-modal",children:[p.jsxs("header",{className:"mf-modal-header",children:[p.jsx("h3",{children:"Buscar producto"}),p.jsx("button",{type:"button",onClick:()=>B(!1),title:"Cerrar",children:"×"})]}),p.jsxs("section",{className:"mf-modal-filters",children:[p.jsx("input",{autoFocus:!0,value:b,onChange:s=>ze(s.target.value),placeholder:"Buscar por codigo, ref, descripcion..."}),p.jsx("input",{value:rn,onChange:s=>Zo(s.target.value),placeholder:"Modelo"}),p.jsx("input",{value:nt,onChange:s=>$t(s.target.value),placeholder:"Marca"}),p.jsxs("label",{children:[p.jsx("input",{type:"checkbox",checked:At,onChange:s=>Un(s.target.checked)}),"Incluir existencias en cero"]})]}),p.jsx("section",{className:"mf-product-table-wrap",children:p.jsxs("table",{className:"mf-product-table",children:[p.jsx("thead",{children:p.jsxs("tr",{children:[p.jsx("th",{children:"Codigo"}),p.jsx("th",{children:"Referencia"}),p.jsx("th",{children:"Descripcion"}),p.jsx("th",{children:"Ubicacion"}),p.jsx("th",{children:"Exist."}),p.jsx("th",{children:"Precio+Imp"}),p.jsx("th",{children:"Marca"})]})}),p.jsxs("tbody",{children:[D&&p.jsx("tr",{children:p.jsx("td",{colSpan:"7",className:"mf-table-state",children:"Buscando productos..."})}),!D&&E.length===0&&p.jsx("tr",{children:p.jsx("td",{colSpan:"7",className:"mf-table-state",children:"No se encontraron productos."})}),!D&&E.map(s=>{const v=Z(s.precio??s.precio_venta??s.precio1,0);Z(s.itbis_pct,.18);const N=Z(s.existencia,0);return p.jsxs("tr",{onDoubleClick:()=>cl(s),children:[p.jsx("td",{children:p.jsx("button",{type:"button",onClick:()=>cl(s),children:s.codigo||"-"})}),p.jsx("td",{children:s.referencia||"-"}),p.jsx("td",{children:s.descripcion||s.nombre}),p.jsx("td",{children:s.ubicacion||"-"}),p.jsx("td",{className:N>0?"mf-stock-ok":"mf-stock-zero",children:N}),p.jsx("td",{className:"mf-price",children:Re.format(v)}),p.jsx("td",{children:s.marca_nombre||"-"})]},s.id||s.codigo)})]})]})}),p.jsxs("footer",{className:"mf-modal-footer",children:[p.jsx("span",{children:"Doble clic o toca el codigo para agregar."}),p.jsx("button",{type:"button",onClick:()=>B(!1),children:"Cerrar"})]})]})})]})}const Jm=`
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

  .mf-cobranza-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 8px 14px;
    background: #ffffff;
    border-bottom: 1px solid #f0e0cd;
  }

  .mf-cobranza-tabs button {
    min-height: 32px;
    border: 1px solid #e3cfb4;
    border-radius: 6px;
    background: #ffffff;
    color: #6b5840;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
  }

  .mf-cobranza-tabs button.is-active {
    border-color: #ea7d23;
    background: #fde9c7;
    color: #9a4a12;
  }

  .mf-cobranza-tabs .mf-tab-reenviar.is-active {
    border-color: #c2410c;
    background: #c2410c;
    color: #ffffff;
  }

  .mf-cob-head-badges {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex: none;
  }

  .mf-cob-badge.is-reenviar {
    background: #c2410c;
    color: #ffffff;
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
`,rs="motoflow-whatsapp-quote-root",os="motoflow-layout-style";function Gm(){if(document.getElementById(os))return;const e=document.createElement("style");e.id=os,e.textContent=`
    html.mf-panel-open #app {
      width: calc(100% - 410px) !important;
      transition: width 0.15s ease;
    }
  `,document.head.appendChild(e)}function ls(){if(document.getElementById(rs))return;Gm();const e=document.createElement("div");e.id=rs,document.body.appendChild(e);const t=e.attachShadow({mode:"open"}),n=document.createElement("style");n.textContent=Jm;const r=document.createElement("div");r.id="motoflow-quote-app",t.append(n,r),yd(r).render(p.jsx(Xm,{}))}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",ls,{once:!0}):ls();
