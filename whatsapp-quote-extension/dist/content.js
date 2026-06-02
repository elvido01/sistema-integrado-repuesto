var Bs={exports:{}},jo={},Vs={exports:{}},R={};/**
 * @license React
 * react.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var xr=Symbol.for("react.element"),wd=Symbol.for("react.portal"),kd=Symbol.for("react.fragment"),Sd=Symbol.for("react.strict_mode"),_d=Symbol.for("react.profiler"),Ed=Symbol.for("react.provider"),Cd=Symbol.for("react.context"),Nd=Symbol.for("react.forward_ref"),zd=Symbol.for("react.suspense"),Pd=Symbol.for("react.memo"),jd=Symbol.for("react.lazy"),Eu=Symbol.iterator;function Td(e){return e===null||typeof e!="object"?null:(e=Eu&&e[Eu]||e["@@iterator"],typeof e=="function"?e:null)}var Qs={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},Hs=Object.assign,Ws={};function Ln(e,t,n){this.props=e,this.context=t,this.refs=Ws,this.updater=n||Qs}Ln.prototype.isReactComponent={};Ln.prototype.setState=function(e,t){if(typeof e!="object"&&typeof e!="function"&&e!=null)throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");this.updater.enqueueSetState(this,e,t,"setState")};Ln.prototype.forceUpdate=function(e){this.updater.enqueueForceUpdate(this,e,"forceUpdate")};function Ks(){}Ks.prototype=Ln.prototype;function wi(e,t,n){this.props=e,this.context=t,this.refs=Ws,this.updater=n||Qs}var ki=wi.prototype=new Ks;ki.constructor=wi;Hs(ki,Ln.prototype);ki.isPureReactComponent=!0;var Cu=Array.isArray,Ys=Object.prototype.hasOwnProperty,Si={current:null},Xs={key:!0,ref:!0,__self:!0,__source:!0};function Js(e,t,n){var r,o={},l=null,i=null;if(t!=null)for(r in t.ref!==void 0&&(i=t.ref),t.key!==void 0&&(l=""+t.key),t)Ys.call(t,r)&&!Xs.hasOwnProperty(r)&&(o[r]=t[r]);var u=arguments.length-2;if(u===1)o.children=n;else if(1<u){for(var s=Array(u),c=0;c<u;c++)s[c]=arguments[c+2];o.children=s}if(e&&e.defaultProps)for(r in u=e.defaultProps,u)o[r]===void 0&&(o[r]=u[r]);return{$$typeof:xr,type:e,key:l,ref:i,props:o,_owner:Si.current}}function Ld(e,t){return{$$typeof:xr,type:e.type,key:t,ref:e.ref,props:e.props,_owner:e._owner}}function _i(e){return typeof e=="object"&&e!==null&&e.$$typeof===xr}function Id(e){var t={"=":"=0",":":"=2"};return"$"+e.replace(/[=:]/g,function(n){return t[n]})}var Nu=/\/+/g;function tl(e,t){return typeof e=="object"&&e!==null&&e.key!=null?Id(""+e.key):t.toString(36)}function Hr(e,t,n,r,o){var l=typeof e;(l==="undefined"||l==="boolean")&&(e=null);var i=!1;if(e===null)i=!0;else switch(l){case"string":case"number":i=!0;break;case"object":switch(e.$$typeof){case xr:case wd:i=!0}}if(i)return i=e,o=o(i),e=r===""?"."+tl(i,0):r,Cu(o)?(n="",e!=null&&(n=e.replace(Nu,"$&/")+"/"),Hr(o,t,n,"",function(c){return c})):o!=null&&(_i(o)&&(o=Ld(o,n+(!o.key||i&&i.key===o.key?"":(""+o.key).replace(Nu,"$&/")+"/")+e)),t.push(o)),1;if(i=0,r=r===""?".":r+":",Cu(e))for(var u=0;u<e.length;u++){l=e[u];var s=r+tl(l,u);i+=Hr(l,t,n,s,o)}else if(s=Td(e),typeof s=="function")for(e=s.call(e),u=0;!(l=e.next()).done;)l=l.value,s=r+tl(l,u++),i+=Hr(l,t,n,s,o);else if(l==="object")throw t=String(e),Error("Objects are not valid as a React child (found: "+(t==="[object Object]"?"object with keys {"+Object.keys(e).join(", ")+"}":t)+"). If you meant to render a collection of children, use an array instead.");return i}function Nr(e,t,n){if(e==null)return e;var r=[],o=0;return Hr(e,r,"","",function(l){return t.call(n,l,o++)}),r}function Od(e){if(e._status===-1){var t=e._result;t=t(),t.then(function(n){(e._status===0||e._status===-1)&&(e._status=1,e._result=n)},function(n){(e._status===0||e._status===-1)&&(e._status=2,e._result=n)}),e._status===-1&&(e._status=0,e._result=t)}if(e._status===1)return e._result.default;throw e._result}var he={current:null},Wr={transition:null},Md={ReactCurrentDispatcher:he,ReactCurrentBatchConfig:Wr,ReactCurrentOwner:Si};function Gs(){throw Error("act(...) is not supported in production builds of React.")}R.Children={map:Nr,forEach:function(e,t,n){Nr(e,function(){t.apply(this,arguments)},n)},count:function(e){var t=0;return Nr(e,function(){t++}),t},toArray:function(e){return Nr(e,function(t){return t})||[]},only:function(e){if(!_i(e))throw Error("React.Children.only expected to receive a single React element child.");return e}};R.Component=Ln;R.Fragment=kd;R.Profiler=_d;R.PureComponent=wi;R.StrictMode=Sd;R.Suspense=zd;R.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=Md;R.act=Gs;R.cloneElement=function(e,t,n){if(e==null)throw Error("React.cloneElement(...): The argument must be a React element, but you passed "+e+".");var r=Hs({},e.props),o=e.key,l=e.ref,i=e._owner;if(t!=null){if(t.ref!==void 0&&(l=t.ref,i=Si.current),t.key!==void 0&&(o=""+t.key),e.type&&e.type.defaultProps)var u=e.type.defaultProps;for(s in t)Ys.call(t,s)&&!Xs.hasOwnProperty(s)&&(r[s]=t[s]===void 0&&u!==void 0?u[s]:t[s])}var s=arguments.length-2;if(s===1)r.children=n;else if(1<s){u=Array(s);for(var c=0;c<s;c++)u[c]=arguments[c+2];r.children=u}return{$$typeof:xr,type:e.type,key:o,ref:l,props:r,_owner:i}};R.createContext=function(e){return e={$$typeof:Cd,_currentValue:e,_currentValue2:e,_threadCount:0,Provider:null,Consumer:null,_defaultValue:null,_globalName:null},e.Provider={$$typeof:Ed,_context:e},e.Consumer=e};R.createElement=Js;R.createFactory=function(e){var t=Js.bind(null,e);return t.type=e,t};R.createRef=function(){return{current:null}};R.forwardRef=function(e){return{$$typeof:Nd,render:e}};R.isValidElement=_i;R.lazy=function(e){return{$$typeof:jd,_payload:{_status:-1,_result:e},_init:Od}};R.memo=function(e,t){return{$$typeof:Pd,type:e,compare:t===void 0?null:t}};R.startTransition=function(e){var t=Wr.transition;Wr.transition={};try{e()}finally{Wr.transition=t}};R.unstable_act=Gs;R.useCallback=function(e,t){return he.current.useCallback(e,t)};R.useContext=function(e){return he.current.useContext(e)};R.useDebugValue=function(){};R.useDeferredValue=function(e){return he.current.useDeferredValue(e)};R.useEffect=function(e,t){return he.current.useEffect(e,t)};R.useId=function(){return he.current.useId()};R.useImperativeHandle=function(e,t,n){return he.current.useImperativeHandle(e,t,n)};R.useInsertionEffect=function(e,t){return he.current.useInsertionEffect(e,t)};R.useLayoutEffect=function(e,t){return he.current.useLayoutEffect(e,t)};R.useMemo=function(e,t){return he.current.useMemo(e,t)};R.useReducer=function(e,t,n){return he.current.useReducer(e,t,n)};R.useRef=function(e){return he.current.useRef(e)};R.useState=function(e){return he.current.useState(e)};R.useSyncExternalStore=function(e,t,n){return he.current.useSyncExternalStore(e,t,n)};R.useTransition=function(){return he.current.useTransition()};R.version="18.3.1";Vs.exports=R;var L=Vs.exports;/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var Rd=L,Dd=Symbol.for("react.element"),Fd=Symbol.for("react.fragment"),$d=Object.prototype.hasOwnProperty,Ud=Rd.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,Ad={key:!0,ref:!0,__self:!0,__source:!0};function Zs(e,t,n){var r,o={},l=null,i=null;n!==void 0&&(l=""+n),t.key!==void 0&&(l=""+t.key),t.ref!==void 0&&(i=t.ref);for(r in t)$d.call(t,r)&&!Ad.hasOwnProperty(r)&&(o[r]=t[r]);if(e&&e.defaultProps)for(r in t=e.defaultProps,t)o[r]===void 0&&(o[r]=t[r]);return{$$typeof:Dd,type:e,key:l,ref:i,props:o,_owner:Ud.current}}jo.Fragment=Fd;jo.jsx=Zs;jo.jsxs=Zs;Bs.exports=jo;var m=Bs.exports,qs={exports:{}},Pe={},bs={exports:{}},ea={};/**
 * @license React
 * scheduler.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */(function(e){function t(_,T){var I=_.length;_.push(T);e:for(;0<I;){var Q=I-1>>>1,J=_[Q];if(0<o(J,T))_[Q]=T,_[I]=J,I=Q;else break e}}function n(_){return _.length===0?null:_[0]}function r(_){if(_.length===0)return null;var T=_[0],I=_.pop();if(I!==T){_[0]=I;e:for(var Q=0,J=_.length,Rt=J>>>1;Q<Rt;){var ne=2*(Q+1)-1,Dt=_[ne],ve=ne+1,ft=_[ve];if(0>o(Dt,I))ve<J&&0>o(ft,Dt)?(_[Q]=ft,_[ve]=I,Q=ve):(_[Q]=Dt,_[ne]=I,Q=ne);else if(ve<J&&0>o(ft,I))_[Q]=ft,_[ve]=I,Q=ve;else break e}}return T}function o(_,T){var I=_.sortIndex-T.sortIndex;return I!==0?I:_.id-T.id}if(typeof performance=="object"&&typeof performance.now=="function"){var l=performance;e.unstable_now=function(){return l.now()}}else{var i=Date,u=i.now();e.unstable_now=function(){return i.now()-u}}var s=[],c=[],v=1,g=null,h=3,k=!1,y=!1,S=!1,$=typeof setTimeout=="function"?setTimeout:null,d=typeof clearTimeout=="function"?clearTimeout:null,a=typeof setImmediate<"u"?setImmediate:null;typeof navigator<"u"&&navigator.scheduling!==void 0&&navigator.scheduling.isInputPending!==void 0&&navigator.scheduling.isInputPending.bind(navigator.scheduling);function f(_){for(var T=n(c);T!==null;){if(T.callback===null)r(c);else if(T.startTime<=_)r(c),T.sortIndex=T.expirationTime,t(s,T);else break;T=n(c)}}function x(_){if(S=!1,f(_),!y)if(n(s)!==null)y=!0,bt(E);else{var T=n(c);T!==null&&en(x,T.startTime-_)}}function E(_,T){y=!1,S&&(S=!1,d(j),j=-1),k=!0;var I=h;try{for(f(T),g=n(s);g!==null&&(!(g.expirationTime>T)||_&&!_e());){var Q=g.callback;if(typeof Q=="function"){g.callback=null,h=g.priorityLevel;var J=Q(g.expirationTime<=T);T=e.unstable_now(),typeof J=="function"?g.callback=J:g===n(s)&&r(s),f(T)}else r(s);g=n(s)}if(g!==null)var Rt=!0;else{var ne=n(c);ne!==null&&en(x,ne.startTime-T),Rt=!1}return Rt}finally{g=null,h=I,k=!1}}var P=!1,z=null,j=-1,W=5,O=-1;function _e(){return!(e.unstable_now()-O<W)}function Ze(){if(z!==null){var _=e.unstable_now();O=_;var T=!0;try{T=z(!0,_)}finally{T?Mt():(P=!1,z=null)}}else P=!1}var Mt;if(typeof a=="function")Mt=function(){a(Ze)};else if(typeof MessageChannel<"u"){var qt=new MessageChannel,Ko=qt.port2;qt.port1.onmessage=Ze,Mt=function(){Ko.postMessage(null)}}else Mt=function(){$(Ze,0)};function bt(_){z=_,P||(P=!0,Mt())}function en(_,T){j=$(function(){_(e.unstable_now())},T)}e.unstable_IdlePriority=5,e.unstable_ImmediatePriority=1,e.unstable_LowPriority=4,e.unstable_NormalPriority=3,e.unstable_Profiling=null,e.unstable_UserBlockingPriority=2,e.unstable_cancelCallback=function(_){_.callback=null},e.unstable_continueExecution=function(){y||k||(y=!0,bt(E))},e.unstable_forceFrameRate=function(_){0>_||125<_?console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"):W=0<_?Math.floor(1e3/_):5},e.unstable_getCurrentPriorityLevel=function(){return h},e.unstable_getFirstCallbackNode=function(){return n(s)},e.unstable_next=function(_){switch(h){case 1:case 2:case 3:var T=3;break;default:T=h}var I=h;h=T;try{return _()}finally{h=I}},e.unstable_pauseExecution=function(){},e.unstable_requestPaint=function(){},e.unstable_runWithPriority=function(_,T){switch(_){case 1:case 2:case 3:case 4:case 5:break;default:_=3}var I=h;h=_;try{return T()}finally{h=I}},e.unstable_scheduleCallback=function(_,T,I){var Q=e.unstable_now();switch(typeof I=="object"&&I!==null?(I=I.delay,I=typeof I=="number"&&0<I?Q+I:Q):I=Q,_){case 1:var J=-1;break;case 2:J=250;break;case 5:J=1073741823;break;case 4:J=1e4;break;default:J=5e3}return J=I+J,_={id:v++,callback:T,priorityLevel:_,startTime:I,expirationTime:J,sortIndex:-1},I>Q?(_.sortIndex=I,t(c,_),n(s)===null&&_===n(c)&&(S?(d(j),j=-1):S=!0,en(x,I-Q))):(_.sortIndex=J,t(s,_),y||k||(y=!0,bt(E))),_},e.unstable_shouldYield=_e,e.unstable_wrapCallback=function(_){var T=h;return function(){var I=h;h=T;try{return _.apply(this,arguments)}finally{h=I}}}})(ea);bs.exports=ea;var Bd=bs.exports;/**
 * @license React
 * react-dom.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var Vd=L,ze=Bd;function w(e){for(var t="https://reactjs.org/docs/error-decoder.html?invariant="+e,n=1;n<arguments.length;n++)t+="&args[]="+encodeURIComponent(arguments[n]);return"Minified React error #"+e+"; visit "+t+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}var ta=new Set,nr={};function Gt(e,t){En(e,t),En(e+"Capture",t)}function En(e,t){for(nr[e]=t,e=0;e<t.length;e++)ta.add(t[e])}var ut=!(typeof window>"u"||typeof window.document>"u"||typeof window.document.createElement>"u"),Pl=Object.prototype.hasOwnProperty,Qd=/^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/,zu={},Pu={};function Hd(e){return Pl.call(Pu,e)?!0:Pl.call(zu,e)?!1:Qd.test(e)?Pu[e]=!0:(zu[e]=!0,!1)}function Wd(e,t,n,r){if(n!==null&&n.type===0)return!1;switch(typeof t){case"function":case"symbol":return!0;case"boolean":return r?!1:n!==null?!n.acceptsBooleans:(e=e.toLowerCase().slice(0,5),e!=="data-"&&e!=="aria-");default:return!1}}function Kd(e,t,n,r){if(t===null||typeof t>"u"||Wd(e,t,n,r))return!0;if(r)return!1;if(n!==null)switch(n.type){case 3:return!t;case 4:return t===!1;case 5:return isNaN(t);case 6:return isNaN(t)||1>t}return!1}function ge(e,t,n,r,o,l,i){this.acceptsBooleans=t===2||t===3||t===4,this.attributeName=r,this.attributeNamespace=o,this.mustUseProperty=n,this.propertyName=e,this.type=t,this.sanitizeURL=l,this.removeEmptyString=i}var ue={};"children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(e){ue[e]=new ge(e,0,!1,e,null,!1,!1)});[["acceptCharset","accept-charset"],["className","class"],["htmlFor","for"],["httpEquiv","http-equiv"]].forEach(function(e){var t=e[0];ue[t]=new ge(t,1,!1,e[1],null,!1,!1)});["contentEditable","draggable","spellCheck","value"].forEach(function(e){ue[e]=new ge(e,2,!1,e.toLowerCase(),null,!1,!1)});["autoReverse","externalResourcesRequired","focusable","preserveAlpha"].forEach(function(e){ue[e]=new ge(e,2,!1,e,null,!1,!1)});"allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(e){ue[e]=new ge(e,3,!1,e.toLowerCase(),null,!1,!1)});["checked","multiple","muted","selected"].forEach(function(e){ue[e]=new ge(e,3,!0,e,null,!1,!1)});["capture","download"].forEach(function(e){ue[e]=new ge(e,4,!1,e,null,!1,!1)});["cols","rows","size","span"].forEach(function(e){ue[e]=new ge(e,6,!1,e,null,!1,!1)});["rowSpan","start"].forEach(function(e){ue[e]=new ge(e,5,!1,e.toLowerCase(),null,!1,!1)});var Ei=/[\-:]([a-z])/g;function Ci(e){return e[1].toUpperCase()}"accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(e){var t=e.replace(Ei,Ci);ue[t]=new ge(t,1,!1,e,null,!1,!1)});"xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(e){var t=e.replace(Ei,Ci);ue[t]=new ge(t,1,!1,e,"http://www.w3.org/1999/xlink",!1,!1)});["xml:base","xml:lang","xml:space"].forEach(function(e){var t=e.replace(Ei,Ci);ue[t]=new ge(t,1,!1,e,"http://www.w3.org/XML/1998/namespace",!1,!1)});["tabIndex","crossOrigin"].forEach(function(e){ue[e]=new ge(e,1,!1,e.toLowerCase(),null,!1,!1)});ue.xlinkHref=new ge("xlinkHref",1,!1,"xlink:href","http://www.w3.org/1999/xlink",!0,!1);["src","href","action","formAction"].forEach(function(e){ue[e]=new ge(e,1,!1,e.toLowerCase(),null,!0,!0)});function Ni(e,t,n,r){var o=ue.hasOwnProperty(t)?ue[t]:null;(o!==null?o.type!==0:r||!(2<t.length)||t[0]!=="o"&&t[0]!=="O"||t[1]!=="n"&&t[1]!=="N")&&(Kd(t,n,o,r)&&(n=null),r||o===null?Hd(t)&&(n===null?e.removeAttribute(t):e.setAttribute(t,""+n)):o.mustUseProperty?e[o.propertyName]=n===null?o.type===3?!1:"":n:(t=o.attributeName,r=o.attributeNamespace,n===null?e.removeAttribute(t):(o=o.type,n=o===3||o===4&&n===!0?"":""+n,r?e.setAttributeNS(r,t,n):e.setAttribute(t,n))))}var dt=Vd.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,zr=Symbol.for("react.element"),on=Symbol.for("react.portal"),ln=Symbol.for("react.fragment"),zi=Symbol.for("react.strict_mode"),jl=Symbol.for("react.profiler"),na=Symbol.for("react.provider"),ra=Symbol.for("react.context"),Pi=Symbol.for("react.forward_ref"),Tl=Symbol.for("react.suspense"),Ll=Symbol.for("react.suspense_list"),ji=Symbol.for("react.memo"),ht=Symbol.for("react.lazy"),oa=Symbol.for("react.offscreen"),ju=Symbol.iterator;function Rn(e){return e===null||typeof e!="object"?null:(e=ju&&e[ju]||e["@@iterator"],typeof e=="function"?e:null)}var X=Object.assign,nl;function Qn(e){if(nl===void 0)try{throw Error()}catch(n){var t=n.stack.trim().match(/\n( *(at )?)/);nl=t&&t[1]||""}return`
`+nl+e}var rl=!1;function ol(e,t){if(!e||rl)return"";rl=!0;var n=Error.prepareStackTrace;Error.prepareStackTrace=void 0;try{if(t)if(t=function(){throw Error()},Object.defineProperty(t.prototype,"props",{set:function(){throw Error()}}),typeof Reflect=="object"&&Reflect.construct){try{Reflect.construct(t,[])}catch(c){var r=c}Reflect.construct(e,[],t)}else{try{t.call()}catch(c){r=c}e.call(t.prototype)}else{try{throw Error()}catch(c){r=c}e()}}catch(c){if(c&&r&&typeof c.stack=="string"){for(var o=c.stack.split(`
`),l=r.stack.split(`
`),i=o.length-1,u=l.length-1;1<=i&&0<=u&&o[i]!==l[u];)u--;for(;1<=i&&0<=u;i--,u--)if(o[i]!==l[u]){if(i!==1||u!==1)do if(i--,u--,0>u||o[i]!==l[u]){var s=`
`+o[i].replace(" at new "," at ");return e.displayName&&s.includes("<anonymous>")&&(s=s.replace("<anonymous>",e.displayName)),s}while(1<=i&&0<=u);break}}}finally{rl=!1,Error.prepareStackTrace=n}return(e=e?e.displayName||e.name:"")?Qn(e):""}function Yd(e){switch(e.tag){case 5:return Qn(e.type);case 16:return Qn("Lazy");case 13:return Qn("Suspense");case 19:return Qn("SuspenseList");case 0:case 2:case 15:return e=ol(e.type,!1),e;case 11:return e=ol(e.type.render,!1),e;case 1:return e=ol(e.type,!0),e;default:return""}}function Il(e){if(e==null)return null;if(typeof e=="function")return e.displayName||e.name||null;if(typeof e=="string")return e;switch(e){case ln:return"Fragment";case on:return"Portal";case jl:return"Profiler";case zi:return"StrictMode";case Tl:return"Suspense";case Ll:return"SuspenseList"}if(typeof e=="object")switch(e.$$typeof){case ra:return(e.displayName||"Context")+".Consumer";case na:return(e._context.displayName||"Context")+".Provider";case Pi:var t=e.render;return e=e.displayName,e||(e=t.displayName||t.name||"",e=e!==""?"ForwardRef("+e+")":"ForwardRef"),e;case ji:return t=e.displayName||null,t!==null?t:Il(e.type)||"Memo";case ht:t=e._payload,e=e._init;try{return Il(e(t))}catch{}}return null}function Xd(e){var t=e.type;switch(e.tag){case 24:return"Cache";case 9:return(t.displayName||"Context")+".Consumer";case 10:return(t._context.displayName||"Context")+".Provider";case 18:return"DehydratedFragment";case 11:return e=t.render,e=e.displayName||e.name||"",t.displayName||(e!==""?"ForwardRef("+e+")":"ForwardRef");case 7:return"Fragment";case 5:return t;case 4:return"Portal";case 3:return"Root";case 6:return"Text";case 16:return Il(t);case 8:return t===zi?"StrictMode":"Mode";case 22:return"Offscreen";case 12:return"Profiler";case 21:return"Scope";case 13:return"Suspense";case 19:return"SuspenseList";case 25:return"TracingMarker";case 1:case 0:case 17:case 2:case 14:case 15:if(typeof t=="function")return t.displayName||t.name||null;if(typeof t=="string")return t}return null}function jt(e){switch(typeof e){case"boolean":case"number":case"string":case"undefined":return e;case"object":return e;default:return""}}function la(e){var t=e.type;return(e=e.nodeName)&&e.toLowerCase()==="input"&&(t==="checkbox"||t==="radio")}function Jd(e){var t=la(e)?"checked":"value",n=Object.getOwnPropertyDescriptor(e.constructor.prototype,t),r=""+e[t];if(!e.hasOwnProperty(t)&&typeof n<"u"&&typeof n.get=="function"&&typeof n.set=="function"){var o=n.get,l=n.set;return Object.defineProperty(e,t,{configurable:!0,get:function(){return o.call(this)},set:function(i){r=""+i,l.call(this,i)}}),Object.defineProperty(e,t,{enumerable:n.enumerable}),{getValue:function(){return r},setValue:function(i){r=""+i},stopTracking:function(){e._valueTracker=null,delete e[t]}}}}function Pr(e){e._valueTracker||(e._valueTracker=Jd(e))}function ia(e){if(!e)return!1;var t=e._valueTracker;if(!t)return!0;var n=t.getValue(),r="";return e&&(r=la(e)?e.checked?"true":"false":e.value),e=r,e!==n?(t.setValue(e),!0):!1}function no(e){if(e=e||(typeof document<"u"?document:void 0),typeof e>"u")return null;try{return e.activeElement||e.body}catch{return e.body}}function Ol(e,t){var n=t.checked;return X({},t,{defaultChecked:void 0,defaultValue:void 0,value:void 0,checked:n??e._wrapperState.initialChecked})}function Tu(e,t){var n=t.defaultValue==null?"":t.defaultValue,r=t.checked!=null?t.checked:t.defaultChecked;n=jt(t.value!=null?t.value:n),e._wrapperState={initialChecked:r,initialValue:n,controlled:t.type==="checkbox"||t.type==="radio"?t.checked!=null:t.value!=null}}function ua(e,t){t=t.checked,t!=null&&Ni(e,"checked",t,!1)}function Ml(e,t){ua(e,t);var n=jt(t.value),r=t.type;if(n!=null)r==="number"?(n===0&&e.value===""||e.value!=n)&&(e.value=""+n):e.value!==""+n&&(e.value=""+n);else if(r==="submit"||r==="reset"){e.removeAttribute("value");return}t.hasOwnProperty("value")?Rl(e,t.type,n):t.hasOwnProperty("defaultValue")&&Rl(e,t.type,jt(t.defaultValue)),t.checked==null&&t.defaultChecked!=null&&(e.defaultChecked=!!t.defaultChecked)}function Lu(e,t,n){if(t.hasOwnProperty("value")||t.hasOwnProperty("defaultValue")){var r=t.type;if(!(r!=="submit"&&r!=="reset"||t.value!==void 0&&t.value!==null))return;t=""+e._wrapperState.initialValue,n||t===e.value||(e.value=t),e.defaultValue=t}n=e.name,n!==""&&(e.name=""),e.defaultChecked=!!e._wrapperState.initialChecked,n!==""&&(e.name=n)}function Rl(e,t,n){(t!=="number"||no(e.ownerDocument)!==e)&&(n==null?e.defaultValue=""+e._wrapperState.initialValue:e.defaultValue!==""+n&&(e.defaultValue=""+n))}var Hn=Array.isArray;function vn(e,t,n,r){if(e=e.options,t){t={};for(var o=0;o<n.length;o++)t["$"+n[o]]=!0;for(n=0;n<e.length;n++)o=t.hasOwnProperty("$"+e[n].value),e[n].selected!==o&&(e[n].selected=o),o&&r&&(e[n].defaultSelected=!0)}else{for(n=""+jt(n),t=null,o=0;o<e.length;o++){if(e[o].value===n){e[o].selected=!0,r&&(e[o].defaultSelected=!0);return}t!==null||e[o].disabled||(t=e[o])}t!==null&&(t.selected=!0)}}function Dl(e,t){if(t.dangerouslySetInnerHTML!=null)throw Error(w(91));return X({},t,{value:void 0,defaultValue:void 0,children:""+e._wrapperState.initialValue})}function Iu(e,t){var n=t.value;if(n==null){if(n=t.children,t=t.defaultValue,n!=null){if(t!=null)throw Error(w(92));if(Hn(n)){if(1<n.length)throw Error(w(93));n=n[0]}t=n}t==null&&(t=""),n=t}e._wrapperState={initialValue:jt(n)}}function sa(e,t){var n=jt(t.value),r=jt(t.defaultValue);n!=null&&(n=""+n,n!==e.value&&(e.value=n),t.defaultValue==null&&e.defaultValue!==n&&(e.defaultValue=n)),r!=null&&(e.defaultValue=""+r)}function Ou(e){var t=e.textContent;t===e._wrapperState.initialValue&&t!==""&&t!==null&&(e.value=t)}function aa(e){switch(e){case"svg":return"http://www.w3.org/2000/svg";case"math":return"http://www.w3.org/1998/Math/MathML";default:return"http://www.w3.org/1999/xhtml"}}function Fl(e,t){return e==null||e==="http://www.w3.org/1999/xhtml"?aa(t):e==="http://www.w3.org/2000/svg"&&t==="foreignObject"?"http://www.w3.org/1999/xhtml":e}var jr,ca=function(e){return typeof MSApp<"u"&&MSApp.execUnsafeLocalFunction?function(t,n,r,o){MSApp.execUnsafeLocalFunction(function(){return e(t,n,r,o)})}:e}(function(e,t){if(e.namespaceURI!=="http://www.w3.org/2000/svg"||"innerHTML"in e)e.innerHTML=t;else{for(jr=jr||document.createElement("div"),jr.innerHTML="<svg>"+t.valueOf().toString()+"</svg>",t=jr.firstChild;e.firstChild;)e.removeChild(e.firstChild);for(;t.firstChild;)e.appendChild(t.firstChild)}});function rr(e,t){if(t){var n=e.firstChild;if(n&&n===e.lastChild&&n.nodeType===3){n.nodeValue=t;return}}e.textContent=t}var Yn={animationIterationCount:!0,aspectRatio:!0,borderImageOutset:!0,borderImageSlice:!0,borderImageWidth:!0,boxFlex:!0,boxFlexGroup:!0,boxOrdinalGroup:!0,columnCount:!0,columns:!0,flex:!0,flexGrow:!0,flexPositive:!0,flexShrink:!0,flexNegative:!0,flexOrder:!0,gridArea:!0,gridRow:!0,gridRowEnd:!0,gridRowSpan:!0,gridRowStart:!0,gridColumn:!0,gridColumnEnd:!0,gridColumnSpan:!0,gridColumnStart:!0,fontWeight:!0,lineClamp:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,tabSize:!0,widows:!0,zIndex:!0,zoom:!0,fillOpacity:!0,floodOpacity:!0,stopOpacity:!0,strokeDasharray:!0,strokeDashoffset:!0,strokeMiterlimit:!0,strokeOpacity:!0,strokeWidth:!0},Gd=["Webkit","ms","Moz","O"];Object.keys(Yn).forEach(function(e){Gd.forEach(function(t){t=t+e.charAt(0).toUpperCase()+e.substring(1),Yn[t]=Yn[e]})});function da(e,t,n){return t==null||typeof t=="boolean"||t===""?"":n||typeof t!="number"||t===0||Yn.hasOwnProperty(e)&&Yn[e]?(""+t).trim():t+"px"}function fa(e,t){e=e.style;for(var n in t)if(t.hasOwnProperty(n)){var r=n.indexOf("--")===0,o=da(n,t[n],r);n==="float"&&(n="cssFloat"),r?e.setProperty(n,o):e[n]=o}}var Zd=X({menuitem:!0},{area:!0,base:!0,br:!0,col:!0,embed:!0,hr:!0,img:!0,input:!0,keygen:!0,link:!0,meta:!0,param:!0,source:!0,track:!0,wbr:!0});function $l(e,t){if(t){if(Zd[e]&&(t.children!=null||t.dangerouslySetInnerHTML!=null))throw Error(w(137,e));if(t.dangerouslySetInnerHTML!=null){if(t.children!=null)throw Error(w(60));if(typeof t.dangerouslySetInnerHTML!="object"||!("__html"in t.dangerouslySetInnerHTML))throw Error(w(61))}if(t.style!=null&&typeof t.style!="object")throw Error(w(62))}}function Ul(e,t){if(e.indexOf("-")===-1)return typeof t.is=="string";switch(e){case"annotation-xml":case"color-profile":case"font-face":case"font-face-src":case"font-face-uri":case"font-face-format":case"font-face-name":case"missing-glyph":return!1;default:return!0}}var Al=null;function Ti(e){return e=e.target||e.srcElement||window,e.correspondingUseElement&&(e=e.correspondingUseElement),e.nodeType===3?e.parentNode:e}var Bl=null,yn=null,xn=null;function Mu(e){if(e=Sr(e)){if(typeof Bl!="function")throw Error(w(280));var t=e.stateNode;t&&(t=Mo(t),Bl(e.stateNode,e.type,t))}}function pa(e){yn?xn?xn.push(e):xn=[e]:yn=e}function ma(){if(yn){var e=yn,t=xn;if(xn=yn=null,Mu(e),t)for(e=0;e<t.length;e++)Mu(t[e])}}function ha(e,t){return e(t)}function ga(){}var ll=!1;function va(e,t,n){if(ll)return e(t,n);ll=!0;try{return ha(e,t,n)}finally{ll=!1,(yn!==null||xn!==null)&&(ga(),ma())}}function or(e,t){var n=e.stateNode;if(n===null)return null;var r=Mo(n);if(r===null)return null;n=r[t];e:switch(t){case"onClick":case"onClickCapture":case"onDoubleClick":case"onDoubleClickCapture":case"onMouseDown":case"onMouseDownCapture":case"onMouseMove":case"onMouseMoveCapture":case"onMouseUp":case"onMouseUpCapture":case"onMouseEnter":(r=!r.disabled)||(e=e.type,r=!(e==="button"||e==="input"||e==="select"||e==="textarea")),e=!r;break e;default:e=!1}if(e)return null;if(n&&typeof n!="function")throw Error(w(231,t,typeof n));return n}var Vl=!1;if(ut)try{var Dn={};Object.defineProperty(Dn,"passive",{get:function(){Vl=!0}}),window.addEventListener("test",Dn,Dn),window.removeEventListener("test",Dn,Dn)}catch{Vl=!1}function qd(e,t,n,r,o,l,i,u,s){var c=Array.prototype.slice.call(arguments,3);try{t.apply(n,c)}catch(v){this.onError(v)}}var Xn=!1,ro=null,oo=!1,Ql=null,bd={onError:function(e){Xn=!0,ro=e}};function ef(e,t,n,r,o,l,i,u,s){Xn=!1,ro=null,qd.apply(bd,arguments)}function tf(e,t,n,r,o,l,i,u,s){if(ef.apply(this,arguments),Xn){if(Xn){var c=ro;Xn=!1,ro=null}else throw Error(w(198));oo||(oo=!0,Ql=c)}}function Zt(e){var t=e,n=e;if(e.alternate)for(;t.return;)t=t.return;else{e=t;do t=e,t.flags&4098&&(n=t.return),e=t.return;while(e)}return t.tag===3?n:null}function ya(e){if(e.tag===13){var t=e.memoizedState;if(t===null&&(e=e.alternate,e!==null&&(t=e.memoizedState)),t!==null)return t.dehydrated}return null}function Ru(e){if(Zt(e)!==e)throw Error(w(188))}function nf(e){var t=e.alternate;if(!t){if(t=Zt(e),t===null)throw Error(w(188));return t!==e?null:e}for(var n=e,r=t;;){var o=n.return;if(o===null)break;var l=o.alternate;if(l===null){if(r=o.return,r!==null){n=r;continue}break}if(o.child===l.child){for(l=o.child;l;){if(l===n)return Ru(o),e;if(l===r)return Ru(o),t;l=l.sibling}throw Error(w(188))}if(n.return!==r.return)n=o,r=l;else{for(var i=!1,u=o.child;u;){if(u===n){i=!0,n=o,r=l;break}if(u===r){i=!0,r=o,n=l;break}u=u.sibling}if(!i){for(u=l.child;u;){if(u===n){i=!0,n=l,r=o;break}if(u===r){i=!0,r=l,n=o;break}u=u.sibling}if(!i)throw Error(w(189))}}if(n.alternate!==r)throw Error(w(190))}if(n.tag!==3)throw Error(w(188));return n.stateNode.current===n?e:t}function xa(e){return e=nf(e),e!==null?wa(e):null}function wa(e){if(e.tag===5||e.tag===6)return e;for(e=e.child;e!==null;){var t=wa(e);if(t!==null)return t;e=e.sibling}return null}var ka=ze.unstable_scheduleCallback,Du=ze.unstable_cancelCallback,rf=ze.unstable_shouldYield,of=ze.unstable_requestPaint,q=ze.unstable_now,lf=ze.unstable_getCurrentPriorityLevel,Li=ze.unstable_ImmediatePriority,Sa=ze.unstable_UserBlockingPriority,lo=ze.unstable_NormalPriority,uf=ze.unstable_LowPriority,_a=ze.unstable_IdlePriority,To=null,Je=null;function sf(e){if(Je&&typeof Je.onCommitFiberRoot=="function")try{Je.onCommitFiberRoot(To,e,void 0,(e.current.flags&128)===128)}catch{}}var Ve=Math.clz32?Math.clz32:df,af=Math.log,cf=Math.LN2;function df(e){return e>>>=0,e===0?32:31-(af(e)/cf|0)|0}var Tr=64,Lr=4194304;function Wn(e){switch(e&-e){case 1:return 1;case 2:return 2;case 4:return 4;case 8:return 8;case 16:return 16;case 32:return 32;case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return e&4194240;case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:return e&130023424;case 134217728:return 134217728;case 268435456:return 268435456;case 536870912:return 536870912;case 1073741824:return 1073741824;default:return e}}function io(e,t){var n=e.pendingLanes;if(n===0)return 0;var r=0,o=e.suspendedLanes,l=e.pingedLanes,i=n&268435455;if(i!==0){var u=i&~o;u!==0?r=Wn(u):(l&=i,l!==0&&(r=Wn(l)))}else i=n&~o,i!==0?r=Wn(i):l!==0&&(r=Wn(l));if(r===0)return 0;if(t!==0&&t!==r&&!(t&o)&&(o=r&-r,l=t&-t,o>=l||o===16&&(l&4194240)!==0))return t;if(r&4&&(r|=n&16),t=e.entangledLanes,t!==0)for(e=e.entanglements,t&=r;0<t;)n=31-Ve(t),o=1<<n,r|=e[n],t&=~o;return r}function ff(e,t){switch(e){case 1:case 2:case 4:return t+250;case 8:case 16:case 32:case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return t+5e3;case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:return-1;case 134217728:case 268435456:case 536870912:case 1073741824:return-1;default:return-1}}function pf(e,t){for(var n=e.suspendedLanes,r=e.pingedLanes,o=e.expirationTimes,l=e.pendingLanes;0<l;){var i=31-Ve(l),u=1<<i,s=o[i];s===-1?(!(u&n)||u&r)&&(o[i]=ff(u,t)):s<=t&&(e.expiredLanes|=u),l&=~u}}function Hl(e){return e=e.pendingLanes&-1073741825,e!==0?e:e&1073741824?1073741824:0}function Ea(){var e=Tr;return Tr<<=1,!(Tr&4194240)&&(Tr=64),e}function il(e){for(var t=[],n=0;31>n;n++)t.push(e);return t}function wr(e,t,n){e.pendingLanes|=t,t!==536870912&&(e.suspendedLanes=0,e.pingedLanes=0),e=e.eventTimes,t=31-Ve(t),e[t]=n}function mf(e,t){var n=e.pendingLanes&~t;e.pendingLanes=t,e.suspendedLanes=0,e.pingedLanes=0,e.expiredLanes&=t,e.mutableReadLanes&=t,e.entangledLanes&=t,t=e.entanglements;var r=e.eventTimes;for(e=e.expirationTimes;0<n;){var o=31-Ve(n),l=1<<o;t[o]=0,r[o]=-1,e[o]=-1,n&=~l}}function Ii(e,t){var n=e.entangledLanes|=t;for(e=e.entanglements;n;){var r=31-Ve(n),o=1<<r;o&t|e[r]&t&&(e[r]|=t),n&=~o}}var F=0;function Ca(e){return e&=-e,1<e?4<e?e&268435455?16:536870912:4:1}var Na,Oi,za,Pa,ja,Wl=!1,Ir=[],kt=null,St=null,_t=null,lr=new Map,ir=new Map,vt=[],hf="mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset submit".split(" ");function Fu(e,t){switch(e){case"focusin":case"focusout":kt=null;break;case"dragenter":case"dragleave":St=null;break;case"mouseover":case"mouseout":_t=null;break;case"pointerover":case"pointerout":lr.delete(t.pointerId);break;case"gotpointercapture":case"lostpointercapture":ir.delete(t.pointerId)}}function Fn(e,t,n,r,o,l){return e===null||e.nativeEvent!==l?(e={blockedOn:t,domEventName:n,eventSystemFlags:r,nativeEvent:l,targetContainers:[o]},t!==null&&(t=Sr(t),t!==null&&Oi(t)),e):(e.eventSystemFlags|=r,t=e.targetContainers,o!==null&&t.indexOf(o)===-1&&t.push(o),e)}function gf(e,t,n,r,o){switch(t){case"focusin":return kt=Fn(kt,e,t,n,r,o),!0;case"dragenter":return St=Fn(St,e,t,n,r,o),!0;case"mouseover":return _t=Fn(_t,e,t,n,r,o),!0;case"pointerover":var l=o.pointerId;return lr.set(l,Fn(lr.get(l)||null,e,t,n,r,o)),!0;case"gotpointercapture":return l=o.pointerId,ir.set(l,Fn(ir.get(l)||null,e,t,n,r,o)),!0}return!1}function Ta(e){var t=At(e.target);if(t!==null){var n=Zt(t);if(n!==null){if(t=n.tag,t===13){if(t=ya(n),t!==null){e.blockedOn=t,ja(e.priority,function(){za(n)});return}}else if(t===3&&n.stateNode.current.memoizedState.isDehydrated){e.blockedOn=n.tag===3?n.stateNode.containerInfo:null;return}}}e.blockedOn=null}function Kr(e){if(e.blockedOn!==null)return!1;for(var t=e.targetContainers;0<t.length;){var n=Kl(e.domEventName,e.eventSystemFlags,t[0],e.nativeEvent);if(n===null){n=e.nativeEvent;var r=new n.constructor(n.type,n);Al=r,n.target.dispatchEvent(r),Al=null}else return t=Sr(n),t!==null&&Oi(t),e.blockedOn=n,!1;t.shift()}return!0}function $u(e,t,n){Kr(e)&&n.delete(t)}function vf(){Wl=!1,kt!==null&&Kr(kt)&&(kt=null),St!==null&&Kr(St)&&(St=null),_t!==null&&Kr(_t)&&(_t=null),lr.forEach($u),ir.forEach($u)}function $n(e,t){e.blockedOn===t&&(e.blockedOn=null,Wl||(Wl=!0,ze.unstable_scheduleCallback(ze.unstable_NormalPriority,vf)))}function ur(e){function t(o){return $n(o,e)}if(0<Ir.length){$n(Ir[0],e);for(var n=1;n<Ir.length;n++){var r=Ir[n];r.blockedOn===e&&(r.blockedOn=null)}}for(kt!==null&&$n(kt,e),St!==null&&$n(St,e),_t!==null&&$n(_t,e),lr.forEach(t),ir.forEach(t),n=0;n<vt.length;n++)r=vt[n],r.blockedOn===e&&(r.blockedOn=null);for(;0<vt.length&&(n=vt[0],n.blockedOn===null);)Ta(n),n.blockedOn===null&&vt.shift()}var wn=dt.ReactCurrentBatchConfig,uo=!0;function yf(e,t,n,r){var o=F,l=wn.transition;wn.transition=null;try{F=1,Mi(e,t,n,r)}finally{F=o,wn.transition=l}}function xf(e,t,n,r){var o=F,l=wn.transition;wn.transition=null;try{F=4,Mi(e,t,n,r)}finally{F=o,wn.transition=l}}function Mi(e,t,n,r){if(uo){var o=Kl(e,t,n,r);if(o===null)gl(e,t,r,so,n),Fu(e,r);else if(gf(o,e,t,n,r))r.stopPropagation();else if(Fu(e,r),t&4&&-1<hf.indexOf(e)){for(;o!==null;){var l=Sr(o);if(l!==null&&Na(l),l=Kl(e,t,n,r),l===null&&gl(e,t,r,so,n),l===o)break;o=l}o!==null&&r.stopPropagation()}else gl(e,t,r,null,n)}}var so=null;function Kl(e,t,n,r){if(so=null,e=Ti(r),e=At(e),e!==null)if(t=Zt(e),t===null)e=null;else if(n=t.tag,n===13){if(e=ya(t),e!==null)return e;e=null}else if(n===3){if(t.stateNode.current.memoizedState.isDehydrated)return t.tag===3?t.stateNode.containerInfo:null;e=null}else t!==e&&(e=null);return so=e,null}function La(e){switch(e){case"cancel":case"click":case"close":case"contextmenu":case"copy":case"cut":case"auxclick":case"dblclick":case"dragend":case"dragstart":case"drop":case"focusin":case"focusout":case"input":case"invalid":case"keydown":case"keypress":case"keyup":case"mousedown":case"mouseup":case"paste":case"pause":case"play":case"pointercancel":case"pointerdown":case"pointerup":case"ratechange":case"reset":case"resize":case"seeked":case"submit":case"touchcancel":case"touchend":case"touchstart":case"volumechange":case"change":case"selectionchange":case"textInput":case"compositionstart":case"compositionend":case"compositionupdate":case"beforeblur":case"afterblur":case"beforeinput":case"blur":case"fullscreenchange":case"focus":case"hashchange":case"popstate":case"select":case"selectstart":return 1;case"drag":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"mousemove":case"mouseout":case"mouseover":case"pointermove":case"pointerout":case"pointerover":case"scroll":case"toggle":case"touchmove":case"wheel":case"mouseenter":case"mouseleave":case"pointerenter":case"pointerleave":return 4;case"message":switch(lf()){case Li:return 1;case Sa:return 4;case lo:case uf:return 16;case _a:return 536870912;default:return 16}default:return 16}}var xt=null,Ri=null,Yr=null;function Ia(){if(Yr)return Yr;var e,t=Ri,n=t.length,r,o="value"in xt?xt.value:xt.textContent,l=o.length;for(e=0;e<n&&t[e]===o[e];e++);var i=n-e;for(r=1;r<=i&&t[n-r]===o[l-r];r++);return Yr=o.slice(e,1<r?1-r:void 0)}function Xr(e){var t=e.keyCode;return"charCode"in e?(e=e.charCode,e===0&&t===13&&(e=13)):e=t,e===10&&(e=13),32<=e||e===13?e:0}function Or(){return!0}function Uu(){return!1}function je(e){function t(n,r,o,l,i){this._reactName=n,this._targetInst=o,this.type=r,this.nativeEvent=l,this.target=i,this.currentTarget=null;for(var u in e)e.hasOwnProperty(u)&&(n=e[u],this[u]=n?n(l):l[u]);return this.isDefaultPrevented=(l.defaultPrevented!=null?l.defaultPrevented:l.returnValue===!1)?Or:Uu,this.isPropagationStopped=Uu,this}return X(t.prototype,{preventDefault:function(){this.defaultPrevented=!0;var n=this.nativeEvent;n&&(n.preventDefault?n.preventDefault():typeof n.returnValue!="unknown"&&(n.returnValue=!1),this.isDefaultPrevented=Or)},stopPropagation:function(){var n=this.nativeEvent;n&&(n.stopPropagation?n.stopPropagation():typeof n.cancelBubble!="unknown"&&(n.cancelBubble=!0),this.isPropagationStopped=Or)},persist:function(){},isPersistent:Or}),t}var In={eventPhase:0,bubbles:0,cancelable:0,timeStamp:function(e){return e.timeStamp||Date.now()},defaultPrevented:0,isTrusted:0},Di=je(In),kr=X({},In,{view:0,detail:0}),wf=je(kr),ul,sl,Un,Lo=X({},kr,{screenX:0,screenY:0,clientX:0,clientY:0,pageX:0,pageY:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,getModifierState:Fi,button:0,buttons:0,relatedTarget:function(e){return e.relatedTarget===void 0?e.fromElement===e.srcElement?e.toElement:e.fromElement:e.relatedTarget},movementX:function(e){return"movementX"in e?e.movementX:(e!==Un&&(Un&&e.type==="mousemove"?(ul=e.screenX-Un.screenX,sl=e.screenY-Un.screenY):sl=ul=0,Un=e),ul)},movementY:function(e){return"movementY"in e?e.movementY:sl}}),Au=je(Lo),kf=X({},Lo,{dataTransfer:0}),Sf=je(kf),_f=X({},kr,{relatedTarget:0}),al=je(_f),Ef=X({},In,{animationName:0,elapsedTime:0,pseudoElement:0}),Cf=je(Ef),Nf=X({},In,{clipboardData:function(e){return"clipboardData"in e?e.clipboardData:window.clipboardData}}),zf=je(Nf),Pf=X({},In,{data:0}),Bu=je(Pf),jf={Esc:"Escape",Spacebar:" ",Left:"ArrowLeft",Up:"ArrowUp",Right:"ArrowRight",Down:"ArrowDown",Del:"Delete",Win:"OS",Menu:"ContextMenu",Apps:"ContextMenu",Scroll:"ScrollLock",MozPrintableKey:"Unidentified"},Tf={8:"Backspace",9:"Tab",12:"Clear",13:"Enter",16:"Shift",17:"Control",18:"Alt",19:"Pause",20:"CapsLock",27:"Escape",32:" ",33:"PageUp",34:"PageDown",35:"End",36:"Home",37:"ArrowLeft",38:"ArrowUp",39:"ArrowRight",40:"ArrowDown",45:"Insert",46:"Delete",112:"F1",113:"F2",114:"F3",115:"F4",116:"F5",117:"F6",118:"F7",119:"F8",120:"F9",121:"F10",122:"F11",123:"F12",144:"NumLock",145:"ScrollLock",224:"Meta"},Lf={Alt:"altKey",Control:"ctrlKey",Meta:"metaKey",Shift:"shiftKey"};function If(e){var t=this.nativeEvent;return t.getModifierState?t.getModifierState(e):(e=Lf[e])?!!t[e]:!1}function Fi(){return If}var Of=X({},kr,{key:function(e){if(e.key){var t=jf[e.key]||e.key;if(t!=="Unidentified")return t}return e.type==="keypress"?(e=Xr(e),e===13?"Enter":String.fromCharCode(e)):e.type==="keydown"||e.type==="keyup"?Tf[e.keyCode]||"Unidentified":""},code:0,location:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,repeat:0,locale:0,getModifierState:Fi,charCode:function(e){return e.type==="keypress"?Xr(e):0},keyCode:function(e){return e.type==="keydown"||e.type==="keyup"?e.keyCode:0},which:function(e){return e.type==="keypress"?Xr(e):e.type==="keydown"||e.type==="keyup"?e.keyCode:0}}),Mf=je(Of),Rf=X({},Lo,{pointerId:0,width:0,height:0,pressure:0,tangentialPressure:0,tiltX:0,tiltY:0,twist:0,pointerType:0,isPrimary:0}),Vu=je(Rf),Df=X({},kr,{touches:0,targetTouches:0,changedTouches:0,altKey:0,metaKey:0,ctrlKey:0,shiftKey:0,getModifierState:Fi}),Ff=je(Df),$f=X({},In,{propertyName:0,elapsedTime:0,pseudoElement:0}),Uf=je($f),Af=X({},Lo,{deltaX:function(e){return"deltaX"in e?e.deltaX:"wheelDeltaX"in e?-e.wheelDeltaX:0},deltaY:function(e){return"deltaY"in e?e.deltaY:"wheelDeltaY"in e?-e.wheelDeltaY:"wheelDelta"in e?-e.wheelDelta:0},deltaZ:0,deltaMode:0}),Bf=je(Af),Vf=[9,13,27,32],$i=ut&&"CompositionEvent"in window,Jn=null;ut&&"documentMode"in document&&(Jn=document.documentMode);var Qf=ut&&"TextEvent"in window&&!Jn,Oa=ut&&(!$i||Jn&&8<Jn&&11>=Jn),Qu=String.fromCharCode(32),Hu=!1;function Ma(e,t){switch(e){case"keyup":return Vf.indexOf(t.keyCode)!==-1;case"keydown":return t.keyCode!==229;case"keypress":case"mousedown":case"focusout":return!0;default:return!1}}function Ra(e){return e=e.detail,typeof e=="object"&&"data"in e?e.data:null}var un=!1;function Hf(e,t){switch(e){case"compositionend":return Ra(t);case"keypress":return t.which!==32?null:(Hu=!0,Qu);case"textInput":return e=t.data,e===Qu&&Hu?null:e;default:return null}}function Wf(e,t){if(un)return e==="compositionend"||!$i&&Ma(e,t)?(e=Ia(),Yr=Ri=xt=null,un=!1,e):null;switch(e){case"paste":return null;case"keypress":if(!(t.ctrlKey||t.altKey||t.metaKey)||t.ctrlKey&&t.altKey){if(t.char&&1<t.char.length)return t.char;if(t.which)return String.fromCharCode(t.which)}return null;case"compositionend":return Oa&&t.locale!=="ko"?null:t.data;default:return null}}var Kf={color:!0,date:!0,datetime:!0,"datetime-local":!0,email:!0,month:!0,number:!0,password:!0,range:!0,search:!0,tel:!0,text:!0,time:!0,url:!0,week:!0};function Wu(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t==="input"?!!Kf[e.type]:t==="textarea"}function Da(e,t,n,r){pa(r),t=ao(t,"onChange"),0<t.length&&(n=new Di("onChange","change",null,n,r),e.push({event:n,listeners:t}))}var Gn=null,sr=null;function Yf(e){Ya(e,0)}function Io(e){var t=cn(e);if(ia(t))return e}function Xf(e,t){if(e==="change")return t}var Fa=!1;if(ut){var cl;if(ut){var dl="oninput"in document;if(!dl){var Ku=document.createElement("div");Ku.setAttribute("oninput","return;"),dl=typeof Ku.oninput=="function"}cl=dl}else cl=!1;Fa=cl&&(!document.documentMode||9<document.documentMode)}function Yu(){Gn&&(Gn.detachEvent("onpropertychange",$a),sr=Gn=null)}function $a(e){if(e.propertyName==="value"&&Io(sr)){var t=[];Da(t,sr,e,Ti(e)),va(Yf,t)}}function Jf(e,t,n){e==="focusin"?(Yu(),Gn=t,sr=n,Gn.attachEvent("onpropertychange",$a)):e==="focusout"&&Yu()}function Gf(e){if(e==="selectionchange"||e==="keyup"||e==="keydown")return Io(sr)}function Zf(e,t){if(e==="click")return Io(t)}function qf(e,t){if(e==="input"||e==="change")return Io(t)}function bf(e,t){return e===t&&(e!==0||1/e===1/t)||e!==e&&t!==t}var He=typeof Object.is=="function"?Object.is:bf;function ar(e,t){if(He(e,t))return!0;if(typeof e!="object"||e===null||typeof t!="object"||t===null)return!1;var n=Object.keys(e),r=Object.keys(t);if(n.length!==r.length)return!1;for(r=0;r<n.length;r++){var o=n[r];if(!Pl.call(t,o)||!He(e[o],t[o]))return!1}return!0}function Xu(e){for(;e&&e.firstChild;)e=e.firstChild;return e}function Ju(e,t){var n=Xu(e);e=0;for(var r;n;){if(n.nodeType===3){if(r=e+n.textContent.length,e<=t&&r>=t)return{node:n,offset:t-e};e=r}e:{for(;n;){if(n.nextSibling){n=n.nextSibling;break e}n=n.parentNode}n=void 0}n=Xu(n)}}function Ua(e,t){return e&&t?e===t?!0:e&&e.nodeType===3?!1:t&&t.nodeType===3?Ua(e,t.parentNode):"contains"in e?e.contains(t):e.compareDocumentPosition?!!(e.compareDocumentPosition(t)&16):!1:!1}function Aa(){for(var e=window,t=no();t instanceof e.HTMLIFrameElement;){try{var n=typeof t.contentWindow.location.href=="string"}catch{n=!1}if(n)e=t.contentWindow;else break;t=no(e.document)}return t}function Ui(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t&&(t==="input"&&(e.type==="text"||e.type==="search"||e.type==="tel"||e.type==="url"||e.type==="password")||t==="textarea"||e.contentEditable==="true")}function ep(e){var t=Aa(),n=e.focusedElem,r=e.selectionRange;if(t!==n&&n&&n.ownerDocument&&Ua(n.ownerDocument.documentElement,n)){if(r!==null&&Ui(n)){if(t=r.start,e=r.end,e===void 0&&(e=t),"selectionStart"in n)n.selectionStart=t,n.selectionEnd=Math.min(e,n.value.length);else if(e=(t=n.ownerDocument||document)&&t.defaultView||window,e.getSelection){e=e.getSelection();var o=n.textContent.length,l=Math.min(r.start,o);r=r.end===void 0?l:Math.min(r.end,o),!e.extend&&l>r&&(o=r,r=l,l=o),o=Ju(n,l);var i=Ju(n,r);o&&i&&(e.rangeCount!==1||e.anchorNode!==o.node||e.anchorOffset!==o.offset||e.focusNode!==i.node||e.focusOffset!==i.offset)&&(t=t.createRange(),t.setStart(o.node,o.offset),e.removeAllRanges(),l>r?(e.addRange(t),e.extend(i.node,i.offset)):(t.setEnd(i.node,i.offset),e.addRange(t)))}}for(t=[],e=n;e=e.parentNode;)e.nodeType===1&&t.push({element:e,left:e.scrollLeft,top:e.scrollTop});for(typeof n.focus=="function"&&n.focus(),n=0;n<t.length;n++)e=t[n],e.element.scrollLeft=e.left,e.element.scrollTop=e.top}}var tp=ut&&"documentMode"in document&&11>=document.documentMode,sn=null,Yl=null,Zn=null,Xl=!1;function Gu(e,t,n){var r=n.window===n?n.document:n.nodeType===9?n:n.ownerDocument;Xl||sn==null||sn!==no(r)||(r=sn,"selectionStart"in r&&Ui(r)?r={start:r.selectionStart,end:r.selectionEnd}:(r=(r.ownerDocument&&r.ownerDocument.defaultView||window).getSelection(),r={anchorNode:r.anchorNode,anchorOffset:r.anchorOffset,focusNode:r.focusNode,focusOffset:r.focusOffset}),Zn&&ar(Zn,r)||(Zn=r,r=ao(Yl,"onSelect"),0<r.length&&(t=new Di("onSelect","select",null,t,n),e.push({event:t,listeners:r}),t.target=sn)))}function Mr(e,t){var n={};return n[e.toLowerCase()]=t.toLowerCase(),n["Webkit"+e]="webkit"+t,n["Moz"+e]="moz"+t,n}var an={animationend:Mr("Animation","AnimationEnd"),animationiteration:Mr("Animation","AnimationIteration"),animationstart:Mr("Animation","AnimationStart"),transitionend:Mr("Transition","TransitionEnd")},fl={},Ba={};ut&&(Ba=document.createElement("div").style,"AnimationEvent"in window||(delete an.animationend.animation,delete an.animationiteration.animation,delete an.animationstart.animation),"TransitionEvent"in window||delete an.transitionend.transition);function Oo(e){if(fl[e])return fl[e];if(!an[e])return e;var t=an[e],n;for(n in t)if(t.hasOwnProperty(n)&&n in Ba)return fl[e]=t[n];return e}var Va=Oo("animationend"),Qa=Oo("animationiteration"),Ha=Oo("animationstart"),Wa=Oo("transitionend"),Ka=new Map,Zu="abort auxClick cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");function Lt(e,t){Ka.set(e,t),Gt(t,[e])}for(var pl=0;pl<Zu.length;pl++){var ml=Zu[pl],np=ml.toLowerCase(),rp=ml[0].toUpperCase()+ml.slice(1);Lt(np,"on"+rp)}Lt(Va,"onAnimationEnd");Lt(Qa,"onAnimationIteration");Lt(Ha,"onAnimationStart");Lt("dblclick","onDoubleClick");Lt("focusin","onFocus");Lt("focusout","onBlur");Lt(Wa,"onTransitionEnd");En("onMouseEnter",["mouseout","mouseover"]);En("onMouseLeave",["mouseout","mouseover"]);En("onPointerEnter",["pointerout","pointerover"]);En("onPointerLeave",["pointerout","pointerover"]);Gt("onChange","change click focusin focusout input keydown keyup selectionchange".split(" "));Gt("onSelect","focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" "));Gt("onBeforeInput",["compositionend","keypress","textInput","paste"]);Gt("onCompositionEnd","compositionend focusout keydown keypress keyup mousedown".split(" "));Gt("onCompositionStart","compositionstart focusout keydown keypress keyup mousedown".split(" "));Gt("onCompositionUpdate","compositionupdate focusout keydown keypress keyup mousedown".split(" "));var Kn="abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "),op=new Set("cancel close invalid load scroll toggle".split(" ").concat(Kn));function qu(e,t,n){var r=e.type||"unknown-event";e.currentTarget=n,tf(r,t,void 0,e),e.currentTarget=null}function Ya(e,t){t=(t&4)!==0;for(var n=0;n<e.length;n++){var r=e[n],o=r.event;r=r.listeners;e:{var l=void 0;if(t)for(var i=r.length-1;0<=i;i--){var u=r[i],s=u.instance,c=u.currentTarget;if(u=u.listener,s!==l&&o.isPropagationStopped())break e;qu(o,u,c),l=s}else for(i=0;i<r.length;i++){if(u=r[i],s=u.instance,c=u.currentTarget,u=u.listener,s!==l&&o.isPropagationStopped())break e;qu(o,u,c),l=s}}}if(oo)throw e=Ql,oo=!1,Ql=null,e}function B(e,t){var n=t[bl];n===void 0&&(n=t[bl]=new Set);var r=e+"__bubble";n.has(r)||(Xa(t,e,2,!1),n.add(r))}function hl(e,t,n){var r=0;t&&(r|=4),Xa(n,e,r,t)}var Rr="_reactListening"+Math.random().toString(36).slice(2);function cr(e){if(!e[Rr]){e[Rr]=!0,ta.forEach(function(n){n!=="selectionchange"&&(op.has(n)||hl(n,!1,e),hl(n,!0,e))});var t=e.nodeType===9?e:e.ownerDocument;t===null||t[Rr]||(t[Rr]=!0,hl("selectionchange",!1,t))}}function Xa(e,t,n,r){switch(La(t)){case 1:var o=yf;break;case 4:o=xf;break;default:o=Mi}n=o.bind(null,t,n,e),o=void 0,!Vl||t!=="touchstart"&&t!=="touchmove"&&t!=="wheel"||(o=!0),r?o!==void 0?e.addEventListener(t,n,{capture:!0,passive:o}):e.addEventListener(t,n,!0):o!==void 0?e.addEventListener(t,n,{passive:o}):e.addEventListener(t,n,!1)}function gl(e,t,n,r,o){var l=r;if(!(t&1)&&!(t&2)&&r!==null)e:for(;;){if(r===null)return;var i=r.tag;if(i===3||i===4){var u=r.stateNode.containerInfo;if(u===o||u.nodeType===8&&u.parentNode===o)break;if(i===4)for(i=r.return;i!==null;){var s=i.tag;if((s===3||s===4)&&(s=i.stateNode.containerInfo,s===o||s.nodeType===8&&s.parentNode===o))return;i=i.return}for(;u!==null;){if(i=At(u),i===null)return;if(s=i.tag,s===5||s===6){r=l=i;continue e}u=u.parentNode}}r=r.return}va(function(){var c=l,v=Ti(n),g=[];e:{var h=Ka.get(e);if(h!==void 0){var k=Di,y=e;switch(e){case"keypress":if(Xr(n)===0)break e;case"keydown":case"keyup":k=Mf;break;case"focusin":y="focus",k=al;break;case"focusout":y="blur",k=al;break;case"beforeblur":case"afterblur":k=al;break;case"click":if(n.button===2)break e;case"auxclick":case"dblclick":case"mousedown":case"mousemove":case"mouseup":case"mouseout":case"mouseover":case"contextmenu":k=Au;break;case"drag":case"dragend":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"dragstart":case"drop":k=Sf;break;case"touchcancel":case"touchend":case"touchmove":case"touchstart":k=Ff;break;case Va:case Qa:case Ha:k=Cf;break;case Wa:k=Uf;break;case"scroll":k=wf;break;case"wheel":k=Bf;break;case"copy":case"cut":case"paste":k=zf;break;case"gotpointercapture":case"lostpointercapture":case"pointercancel":case"pointerdown":case"pointermove":case"pointerout":case"pointerover":case"pointerup":k=Vu}var S=(t&4)!==0,$=!S&&e==="scroll",d=S?h!==null?h+"Capture":null:h;S=[];for(var a=c,f;a!==null;){f=a;var x=f.stateNode;if(f.tag===5&&x!==null&&(f=x,d!==null&&(x=or(a,d),x!=null&&S.push(dr(a,x,f)))),$)break;a=a.return}0<S.length&&(h=new k(h,y,null,n,v),g.push({event:h,listeners:S}))}}if(!(t&7)){e:{if(h=e==="mouseover"||e==="pointerover",k=e==="mouseout"||e==="pointerout",h&&n!==Al&&(y=n.relatedTarget||n.fromElement)&&(At(y)||y[st]))break e;if((k||h)&&(h=v.window===v?v:(h=v.ownerDocument)?h.defaultView||h.parentWindow:window,k?(y=n.relatedTarget||n.toElement,k=c,y=y?At(y):null,y!==null&&($=Zt(y),y!==$||y.tag!==5&&y.tag!==6)&&(y=null)):(k=null,y=c),k!==y)){if(S=Au,x="onMouseLeave",d="onMouseEnter",a="mouse",(e==="pointerout"||e==="pointerover")&&(S=Vu,x="onPointerLeave",d="onPointerEnter",a="pointer"),$=k==null?h:cn(k),f=y==null?h:cn(y),h=new S(x,a+"leave",k,n,v),h.target=$,h.relatedTarget=f,x=null,At(v)===c&&(S=new S(d,a+"enter",y,n,v),S.target=f,S.relatedTarget=$,x=S),$=x,k&&y)t:{for(S=k,d=y,a=0,f=S;f;f=rn(f))a++;for(f=0,x=d;x;x=rn(x))f++;for(;0<a-f;)S=rn(S),a--;for(;0<f-a;)d=rn(d),f--;for(;a--;){if(S===d||d!==null&&S===d.alternate)break t;S=rn(S),d=rn(d)}S=null}else S=null;k!==null&&bu(g,h,k,S,!1),y!==null&&$!==null&&bu(g,$,y,S,!0)}}e:{if(h=c?cn(c):window,k=h.nodeName&&h.nodeName.toLowerCase(),k==="select"||k==="input"&&h.type==="file")var E=Xf;else if(Wu(h))if(Fa)E=qf;else{E=Gf;var P=Jf}else(k=h.nodeName)&&k.toLowerCase()==="input"&&(h.type==="checkbox"||h.type==="radio")&&(E=Zf);if(E&&(E=E(e,c))){Da(g,E,n,v);break e}P&&P(e,h,c),e==="focusout"&&(P=h._wrapperState)&&P.controlled&&h.type==="number"&&Rl(h,"number",h.value)}switch(P=c?cn(c):window,e){case"focusin":(Wu(P)||P.contentEditable==="true")&&(sn=P,Yl=c,Zn=null);break;case"focusout":Zn=Yl=sn=null;break;case"mousedown":Xl=!0;break;case"contextmenu":case"mouseup":case"dragend":Xl=!1,Gu(g,n,v);break;case"selectionchange":if(tp)break;case"keydown":case"keyup":Gu(g,n,v)}var z;if($i)e:{switch(e){case"compositionstart":var j="onCompositionStart";break e;case"compositionend":j="onCompositionEnd";break e;case"compositionupdate":j="onCompositionUpdate";break e}j=void 0}else un?Ma(e,n)&&(j="onCompositionEnd"):e==="keydown"&&n.keyCode===229&&(j="onCompositionStart");j&&(Oa&&n.locale!=="ko"&&(un||j!=="onCompositionStart"?j==="onCompositionEnd"&&un&&(z=Ia()):(xt=v,Ri="value"in xt?xt.value:xt.textContent,un=!0)),P=ao(c,j),0<P.length&&(j=new Bu(j,e,null,n,v),g.push({event:j,listeners:P}),z?j.data=z:(z=Ra(n),z!==null&&(j.data=z)))),(z=Qf?Hf(e,n):Wf(e,n))&&(c=ao(c,"onBeforeInput"),0<c.length&&(v=new Bu("onBeforeInput","beforeinput",null,n,v),g.push({event:v,listeners:c}),v.data=z))}Ya(g,t)})}function dr(e,t,n){return{instance:e,listener:t,currentTarget:n}}function ao(e,t){for(var n=t+"Capture",r=[];e!==null;){var o=e,l=o.stateNode;o.tag===5&&l!==null&&(o=l,l=or(e,n),l!=null&&r.unshift(dr(e,l,o)),l=or(e,t),l!=null&&r.push(dr(e,l,o))),e=e.return}return r}function rn(e){if(e===null)return null;do e=e.return;while(e&&e.tag!==5);return e||null}function bu(e,t,n,r,o){for(var l=t._reactName,i=[];n!==null&&n!==r;){var u=n,s=u.alternate,c=u.stateNode;if(s!==null&&s===r)break;u.tag===5&&c!==null&&(u=c,o?(s=or(n,l),s!=null&&i.unshift(dr(n,s,u))):o||(s=or(n,l),s!=null&&i.push(dr(n,s,u)))),n=n.return}i.length!==0&&e.push({event:t,listeners:i})}var lp=/\r\n?/g,ip=/\u0000|\uFFFD/g;function es(e){return(typeof e=="string"?e:""+e).replace(lp,`
`).replace(ip,"")}function Dr(e,t,n){if(t=es(t),es(e)!==t&&n)throw Error(w(425))}function co(){}var Jl=null,Gl=null;function Zl(e,t){return e==="textarea"||e==="noscript"||typeof t.children=="string"||typeof t.children=="number"||typeof t.dangerouslySetInnerHTML=="object"&&t.dangerouslySetInnerHTML!==null&&t.dangerouslySetInnerHTML.__html!=null}var ql=typeof setTimeout=="function"?setTimeout:void 0,up=typeof clearTimeout=="function"?clearTimeout:void 0,ts=typeof Promise=="function"?Promise:void 0,sp=typeof queueMicrotask=="function"?queueMicrotask:typeof ts<"u"?function(e){return ts.resolve(null).then(e).catch(ap)}:ql;function ap(e){setTimeout(function(){throw e})}function vl(e,t){var n=t,r=0;do{var o=n.nextSibling;if(e.removeChild(n),o&&o.nodeType===8)if(n=o.data,n==="/$"){if(r===0){e.removeChild(o),ur(t);return}r--}else n!=="$"&&n!=="$?"&&n!=="$!"||r++;n=o}while(n);ur(t)}function Et(e){for(;e!=null;e=e.nextSibling){var t=e.nodeType;if(t===1||t===3)break;if(t===8){if(t=e.data,t==="$"||t==="$!"||t==="$?")break;if(t==="/$")return null}}return e}function ns(e){e=e.previousSibling;for(var t=0;e;){if(e.nodeType===8){var n=e.data;if(n==="$"||n==="$!"||n==="$?"){if(t===0)return e;t--}else n==="/$"&&t++}e=e.previousSibling}return null}var On=Math.random().toString(36).slice(2),Xe="__reactFiber$"+On,fr="__reactProps$"+On,st="__reactContainer$"+On,bl="__reactEvents$"+On,cp="__reactListeners$"+On,dp="__reactHandles$"+On;function At(e){var t=e[Xe];if(t)return t;for(var n=e.parentNode;n;){if(t=n[st]||n[Xe]){if(n=t.alternate,t.child!==null||n!==null&&n.child!==null)for(e=ns(e);e!==null;){if(n=e[Xe])return n;e=ns(e)}return t}e=n,n=e.parentNode}return null}function Sr(e){return e=e[Xe]||e[st],!e||e.tag!==5&&e.tag!==6&&e.tag!==13&&e.tag!==3?null:e}function cn(e){if(e.tag===5||e.tag===6)return e.stateNode;throw Error(w(33))}function Mo(e){return e[fr]||null}var ei=[],dn=-1;function It(e){return{current:e}}function V(e){0>dn||(e.current=ei[dn],ei[dn]=null,dn--)}function A(e,t){dn++,ei[dn]=e.current,e.current=t}var Tt={},de=It(Tt),we=It(!1),Wt=Tt;function Cn(e,t){var n=e.type.contextTypes;if(!n)return Tt;var r=e.stateNode;if(r&&r.__reactInternalMemoizedUnmaskedChildContext===t)return r.__reactInternalMemoizedMaskedChildContext;var o={},l;for(l in n)o[l]=t[l];return r&&(e=e.stateNode,e.__reactInternalMemoizedUnmaskedChildContext=t,e.__reactInternalMemoizedMaskedChildContext=o),o}function ke(e){return e=e.childContextTypes,e!=null}function fo(){V(we),V(de)}function rs(e,t,n){if(de.current!==Tt)throw Error(w(168));A(de,t),A(we,n)}function Ja(e,t,n){var r=e.stateNode;if(t=t.childContextTypes,typeof r.getChildContext!="function")return n;r=r.getChildContext();for(var o in r)if(!(o in t))throw Error(w(108,Xd(e)||"Unknown",o));return X({},n,r)}function po(e){return e=(e=e.stateNode)&&e.__reactInternalMemoizedMergedChildContext||Tt,Wt=de.current,A(de,e),A(we,we.current),!0}function os(e,t,n){var r=e.stateNode;if(!r)throw Error(w(169));n?(e=Ja(e,t,Wt),r.__reactInternalMemoizedMergedChildContext=e,V(we),V(de),A(de,e)):V(we),A(we,n)}var tt=null,Ro=!1,yl=!1;function Ga(e){tt===null?tt=[e]:tt.push(e)}function fp(e){Ro=!0,Ga(e)}function Ot(){if(!yl&&tt!==null){yl=!0;var e=0,t=F;try{var n=tt;for(F=1;e<n.length;e++){var r=n[e];do r=r(!0);while(r!==null)}tt=null,Ro=!1}catch(o){throw tt!==null&&(tt=tt.slice(e+1)),ka(Li,Ot),o}finally{F=t,yl=!1}}return null}var fn=[],pn=0,mo=null,ho=0,Ie=[],Oe=0,Kt=null,nt=1,rt="";function $t(e,t){fn[pn++]=ho,fn[pn++]=mo,mo=e,ho=t}function Za(e,t,n){Ie[Oe++]=nt,Ie[Oe++]=rt,Ie[Oe++]=Kt,Kt=e;var r=nt;e=rt;var o=32-Ve(r)-1;r&=~(1<<o),n+=1;var l=32-Ve(t)+o;if(30<l){var i=o-o%5;l=(r&(1<<i)-1).toString(32),r>>=i,o-=i,nt=1<<32-Ve(t)+o|n<<o|r,rt=l+e}else nt=1<<l|n<<o|r,rt=e}function Ai(e){e.return!==null&&($t(e,1),Za(e,1,0))}function Bi(e){for(;e===mo;)mo=fn[--pn],fn[pn]=null,ho=fn[--pn],fn[pn]=null;for(;e===Kt;)Kt=Ie[--Oe],Ie[Oe]=null,rt=Ie[--Oe],Ie[Oe]=null,nt=Ie[--Oe],Ie[Oe]=null}var Ne=null,Ce=null,H=!1,Be=null;function qa(e,t){var n=Me(5,null,null,0);n.elementType="DELETED",n.stateNode=t,n.return=e,t=e.deletions,t===null?(e.deletions=[n],e.flags|=16):t.push(n)}function ls(e,t){switch(e.tag){case 5:var n=e.type;return t=t.nodeType!==1||n.toLowerCase()!==t.nodeName.toLowerCase()?null:t,t!==null?(e.stateNode=t,Ne=e,Ce=Et(t.firstChild),!0):!1;case 6:return t=e.pendingProps===""||t.nodeType!==3?null:t,t!==null?(e.stateNode=t,Ne=e,Ce=null,!0):!1;case 13:return t=t.nodeType!==8?null:t,t!==null?(n=Kt!==null?{id:nt,overflow:rt}:null,e.memoizedState={dehydrated:t,treeContext:n,retryLane:1073741824},n=Me(18,null,null,0),n.stateNode=t,n.return=e,e.child=n,Ne=e,Ce=null,!0):!1;default:return!1}}function ti(e){return(e.mode&1)!==0&&(e.flags&128)===0}function ni(e){if(H){var t=Ce;if(t){var n=t;if(!ls(e,t)){if(ti(e))throw Error(w(418));t=Et(n.nextSibling);var r=Ne;t&&ls(e,t)?qa(r,n):(e.flags=e.flags&-4097|2,H=!1,Ne=e)}}else{if(ti(e))throw Error(w(418));e.flags=e.flags&-4097|2,H=!1,Ne=e}}}function is(e){for(e=e.return;e!==null&&e.tag!==5&&e.tag!==3&&e.tag!==13;)e=e.return;Ne=e}function Fr(e){if(e!==Ne)return!1;if(!H)return is(e),H=!0,!1;var t;if((t=e.tag!==3)&&!(t=e.tag!==5)&&(t=e.type,t=t!=="head"&&t!=="body"&&!Zl(e.type,e.memoizedProps)),t&&(t=Ce)){if(ti(e))throw ba(),Error(w(418));for(;t;)qa(e,t),t=Et(t.nextSibling)}if(is(e),e.tag===13){if(e=e.memoizedState,e=e!==null?e.dehydrated:null,!e)throw Error(w(317));e:{for(e=e.nextSibling,t=0;e;){if(e.nodeType===8){var n=e.data;if(n==="/$"){if(t===0){Ce=Et(e.nextSibling);break e}t--}else n!=="$"&&n!=="$!"&&n!=="$?"||t++}e=e.nextSibling}Ce=null}}else Ce=Ne?Et(e.stateNode.nextSibling):null;return!0}function ba(){for(var e=Ce;e;)e=Et(e.nextSibling)}function Nn(){Ce=Ne=null,H=!1}function Vi(e){Be===null?Be=[e]:Be.push(e)}var pp=dt.ReactCurrentBatchConfig;function An(e,t,n){if(e=n.ref,e!==null&&typeof e!="function"&&typeof e!="object"){if(n._owner){if(n=n._owner,n){if(n.tag!==1)throw Error(w(309));var r=n.stateNode}if(!r)throw Error(w(147,e));var o=r,l=""+e;return t!==null&&t.ref!==null&&typeof t.ref=="function"&&t.ref._stringRef===l?t.ref:(t=function(i){var u=o.refs;i===null?delete u[l]:u[l]=i},t._stringRef=l,t)}if(typeof e!="string")throw Error(w(284));if(!n._owner)throw Error(w(290,e))}return e}function $r(e,t){throw e=Object.prototype.toString.call(t),Error(w(31,e==="[object Object]"?"object with keys {"+Object.keys(t).join(", ")+"}":e))}function us(e){var t=e._init;return t(e._payload)}function ec(e){function t(d,a){if(e){var f=d.deletions;f===null?(d.deletions=[a],d.flags|=16):f.push(a)}}function n(d,a){if(!e)return null;for(;a!==null;)t(d,a),a=a.sibling;return null}function r(d,a){for(d=new Map;a!==null;)a.key!==null?d.set(a.key,a):d.set(a.index,a),a=a.sibling;return d}function o(d,a){return d=Pt(d,a),d.index=0,d.sibling=null,d}function l(d,a,f){return d.index=f,e?(f=d.alternate,f!==null?(f=f.index,f<a?(d.flags|=2,a):f):(d.flags|=2,a)):(d.flags|=1048576,a)}function i(d){return e&&d.alternate===null&&(d.flags|=2),d}function u(d,a,f,x){return a===null||a.tag!==6?(a=Cl(f,d.mode,x),a.return=d,a):(a=o(a,f),a.return=d,a)}function s(d,a,f,x){var E=f.type;return E===ln?v(d,a,f.props.children,x,f.key):a!==null&&(a.elementType===E||typeof E=="object"&&E!==null&&E.$$typeof===ht&&us(E)===a.type)?(x=o(a,f.props),x.ref=An(d,a,f),x.return=d,x):(x=to(f.type,f.key,f.props,null,d.mode,x),x.ref=An(d,a,f),x.return=d,x)}function c(d,a,f,x){return a===null||a.tag!==4||a.stateNode.containerInfo!==f.containerInfo||a.stateNode.implementation!==f.implementation?(a=Nl(f,d.mode,x),a.return=d,a):(a=o(a,f.children||[]),a.return=d,a)}function v(d,a,f,x,E){return a===null||a.tag!==7?(a=Ht(f,d.mode,x,E),a.return=d,a):(a=o(a,f),a.return=d,a)}function g(d,a,f){if(typeof a=="string"&&a!==""||typeof a=="number")return a=Cl(""+a,d.mode,f),a.return=d,a;if(typeof a=="object"&&a!==null){switch(a.$$typeof){case zr:return f=to(a.type,a.key,a.props,null,d.mode,f),f.ref=An(d,null,a),f.return=d,f;case on:return a=Nl(a,d.mode,f),a.return=d,a;case ht:var x=a._init;return g(d,x(a._payload),f)}if(Hn(a)||Rn(a))return a=Ht(a,d.mode,f,null),a.return=d,a;$r(d,a)}return null}function h(d,a,f,x){var E=a!==null?a.key:null;if(typeof f=="string"&&f!==""||typeof f=="number")return E!==null?null:u(d,a,""+f,x);if(typeof f=="object"&&f!==null){switch(f.$$typeof){case zr:return f.key===E?s(d,a,f,x):null;case on:return f.key===E?c(d,a,f,x):null;case ht:return E=f._init,h(d,a,E(f._payload),x)}if(Hn(f)||Rn(f))return E!==null?null:v(d,a,f,x,null);$r(d,f)}return null}function k(d,a,f,x,E){if(typeof x=="string"&&x!==""||typeof x=="number")return d=d.get(f)||null,u(a,d,""+x,E);if(typeof x=="object"&&x!==null){switch(x.$$typeof){case zr:return d=d.get(x.key===null?f:x.key)||null,s(a,d,x,E);case on:return d=d.get(x.key===null?f:x.key)||null,c(a,d,x,E);case ht:var P=x._init;return k(d,a,f,P(x._payload),E)}if(Hn(x)||Rn(x))return d=d.get(f)||null,v(a,d,x,E,null);$r(a,x)}return null}function y(d,a,f,x){for(var E=null,P=null,z=a,j=a=0,W=null;z!==null&&j<f.length;j++){z.index>j?(W=z,z=null):W=z.sibling;var O=h(d,z,f[j],x);if(O===null){z===null&&(z=W);break}e&&z&&O.alternate===null&&t(d,z),a=l(O,a,j),P===null?E=O:P.sibling=O,P=O,z=W}if(j===f.length)return n(d,z),H&&$t(d,j),E;if(z===null){for(;j<f.length;j++)z=g(d,f[j],x),z!==null&&(a=l(z,a,j),P===null?E=z:P.sibling=z,P=z);return H&&$t(d,j),E}for(z=r(d,z);j<f.length;j++)W=k(z,d,j,f[j],x),W!==null&&(e&&W.alternate!==null&&z.delete(W.key===null?j:W.key),a=l(W,a,j),P===null?E=W:P.sibling=W,P=W);return e&&z.forEach(function(_e){return t(d,_e)}),H&&$t(d,j),E}function S(d,a,f,x){var E=Rn(f);if(typeof E!="function")throw Error(w(150));if(f=E.call(f),f==null)throw Error(w(151));for(var P=E=null,z=a,j=a=0,W=null,O=f.next();z!==null&&!O.done;j++,O=f.next()){z.index>j?(W=z,z=null):W=z.sibling;var _e=h(d,z,O.value,x);if(_e===null){z===null&&(z=W);break}e&&z&&_e.alternate===null&&t(d,z),a=l(_e,a,j),P===null?E=_e:P.sibling=_e,P=_e,z=W}if(O.done)return n(d,z),H&&$t(d,j),E;if(z===null){for(;!O.done;j++,O=f.next())O=g(d,O.value,x),O!==null&&(a=l(O,a,j),P===null?E=O:P.sibling=O,P=O);return H&&$t(d,j),E}for(z=r(d,z);!O.done;j++,O=f.next())O=k(z,d,j,O.value,x),O!==null&&(e&&O.alternate!==null&&z.delete(O.key===null?j:O.key),a=l(O,a,j),P===null?E=O:P.sibling=O,P=O);return e&&z.forEach(function(Ze){return t(d,Ze)}),H&&$t(d,j),E}function $(d,a,f,x){if(typeof f=="object"&&f!==null&&f.type===ln&&f.key===null&&(f=f.props.children),typeof f=="object"&&f!==null){switch(f.$$typeof){case zr:e:{for(var E=f.key,P=a;P!==null;){if(P.key===E){if(E=f.type,E===ln){if(P.tag===7){n(d,P.sibling),a=o(P,f.props.children),a.return=d,d=a;break e}}else if(P.elementType===E||typeof E=="object"&&E!==null&&E.$$typeof===ht&&us(E)===P.type){n(d,P.sibling),a=o(P,f.props),a.ref=An(d,P,f),a.return=d,d=a;break e}n(d,P);break}else t(d,P);P=P.sibling}f.type===ln?(a=Ht(f.props.children,d.mode,x,f.key),a.return=d,d=a):(x=to(f.type,f.key,f.props,null,d.mode,x),x.ref=An(d,a,f),x.return=d,d=x)}return i(d);case on:e:{for(P=f.key;a!==null;){if(a.key===P)if(a.tag===4&&a.stateNode.containerInfo===f.containerInfo&&a.stateNode.implementation===f.implementation){n(d,a.sibling),a=o(a,f.children||[]),a.return=d,d=a;break e}else{n(d,a);break}else t(d,a);a=a.sibling}a=Nl(f,d.mode,x),a.return=d,d=a}return i(d);case ht:return P=f._init,$(d,a,P(f._payload),x)}if(Hn(f))return y(d,a,f,x);if(Rn(f))return S(d,a,f,x);$r(d,f)}return typeof f=="string"&&f!==""||typeof f=="number"?(f=""+f,a!==null&&a.tag===6?(n(d,a.sibling),a=o(a,f),a.return=d,d=a):(n(d,a),a=Cl(f,d.mode,x),a.return=d,d=a),i(d)):n(d,a)}return $}var zn=ec(!0),tc=ec(!1),go=It(null),vo=null,mn=null,Qi=null;function Hi(){Qi=mn=vo=null}function Wi(e){var t=go.current;V(go),e._currentValue=t}function ri(e,t,n){for(;e!==null;){var r=e.alternate;if((e.childLanes&t)!==t?(e.childLanes|=t,r!==null&&(r.childLanes|=t)):r!==null&&(r.childLanes&t)!==t&&(r.childLanes|=t),e===n)break;e=e.return}}function kn(e,t){vo=e,Qi=mn=null,e=e.dependencies,e!==null&&e.firstContext!==null&&(e.lanes&t&&(xe=!0),e.firstContext=null)}function De(e){var t=e._currentValue;if(Qi!==e)if(e={context:e,memoizedValue:t,next:null},mn===null){if(vo===null)throw Error(w(308));mn=e,vo.dependencies={lanes:0,firstContext:e}}else mn=mn.next=e;return t}var Bt=null;function Ki(e){Bt===null?Bt=[e]:Bt.push(e)}function nc(e,t,n,r){var o=t.interleaved;return o===null?(n.next=n,Ki(t)):(n.next=o.next,o.next=n),t.interleaved=n,at(e,r)}function at(e,t){e.lanes|=t;var n=e.alternate;for(n!==null&&(n.lanes|=t),n=e,e=e.return;e!==null;)e.childLanes|=t,n=e.alternate,n!==null&&(n.childLanes|=t),n=e,e=e.return;return n.tag===3?n.stateNode:null}var gt=!1;function Yi(e){e.updateQueue={baseState:e.memoizedState,firstBaseUpdate:null,lastBaseUpdate:null,shared:{pending:null,interleaved:null,lanes:0},effects:null}}function rc(e,t){e=e.updateQueue,t.updateQueue===e&&(t.updateQueue={baseState:e.baseState,firstBaseUpdate:e.firstBaseUpdate,lastBaseUpdate:e.lastBaseUpdate,shared:e.shared,effects:e.effects})}function it(e,t){return{eventTime:e,lane:t,tag:0,payload:null,callback:null,next:null}}function Ct(e,t,n){var r=e.updateQueue;if(r===null)return null;if(r=r.shared,D&2){var o=r.pending;return o===null?t.next=t:(t.next=o.next,o.next=t),r.pending=t,at(e,n)}return o=r.interleaved,o===null?(t.next=t,Ki(r)):(t.next=o.next,o.next=t),r.interleaved=t,at(e,n)}function Jr(e,t,n){if(t=t.updateQueue,t!==null&&(t=t.shared,(n&4194240)!==0)){var r=t.lanes;r&=e.pendingLanes,n|=r,t.lanes=n,Ii(e,n)}}function ss(e,t){var n=e.updateQueue,r=e.alternate;if(r!==null&&(r=r.updateQueue,n===r)){var o=null,l=null;if(n=n.firstBaseUpdate,n!==null){do{var i={eventTime:n.eventTime,lane:n.lane,tag:n.tag,payload:n.payload,callback:n.callback,next:null};l===null?o=l=i:l=l.next=i,n=n.next}while(n!==null);l===null?o=l=t:l=l.next=t}else o=l=t;n={baseState:r.baseState,firstBaseUpdate:o,lastBaseUpdate:l,shared:r.shared,effects:r.effects},e.updateQueue=n;return}e=n.lastBaseUpdate,e===null?n.firstBaseUpdate=t:e.next=t,n.lastBaseUpdate=t}function yo(e,t,n,r){var o=e.updateQueue;gt=!1;var l=o.firstBaseUpdate,i=o.lastBaseUpdate,u=o.shared.pending;if(u!==null){o.shared.pending=null;var s=u,c=s.next;s.next=null,i===null?l=c:i.next=c,i=s;var v=e.alternate;v!==null&&(v=v.updateQueue,u=v.lastBaseUpdate,u!==i&&(u===null?v.firstBaseUpdate=c:u.next=c,v.lastBaseUpdate=s))}if(l!==null){var g=o.baseState;i=0,v=c=s=null,u=l;do{var h=u.lane,k=u.eventTime;if((r&h)===h){v!==null&&(v=v.next={eventTime:k,lane:0,tag:u.tag,payload:u.payload,callback:u.callback,next:null});e:{var y=e,S=u;switch(h=t,k=n,S.tag){case 1:if(y=S.payload,typeof y=="function"){g=y.call(k,g,h);break e}g=y;break e;case 3:y.flags=y.flags&-65537|128;case 0:if(y=S.payload,h=typeof y=="function"?y.call(k,g,h):y,h==null)break e;g=X({},g,h);break e;case 2:gt=!0}}u.callback!==null&&u.lane!==0&&(e.flags|=64,h=o.effects,h===null?o.effects=[u]:h.push(u))}else k={eventTime:k,lane:h,tag:u.tag,payload:u.payload,callback:u.callback,next:null},v===null?(c=v=k,s=g):v=v.next=k,i|=h;if(u=u.next,u===null){if(u=o.shared.pending,u===null)break;h=u,u=h.next,h.next=null,o.lastBaseUpdate=h,o.shared.pending=null}}while(1);if(v===null&&(s=g),o.baseState=s,o.firstBaseUpdate=c,o.lastBaseUpdate=v,t=o.shared.interleaved,t!==null){o=t;do i|=o.lane,o=o.next;while(o!==t)}else l===null&&(o.shared.lanes=0);Xt|=i,e.lanes=i,e.memoizedState=g}}function as(e,t,n){if(e=t.effects,t.effects=null,e!==null)for(t=0;t<e.length;t++){var r=e[t],o=r.callback;if(o!==null){if(r.callback=null,r=n,typeof o!="function")throw Error(w(191,o));o.call(r)}}}var _r={},Ge=It(_r),pr=It(_r),mr=It(_r);function Vt(e){if(e===_r)throw Error(w(174));return e}function Xi(e,t){switch(A(mr,t),A(pr,e),A(Ge,_r),e=t.nodeType,e){case 9:case 11:t=(t=t.documentElement)?t.namespaceURI:Fl(null,"");break;default:e=e===8?t.parentNode:t,t=e.namespaceURI||null,e=e.tagName,t=Fl(t,e)}V(Ge),A(Ge,t)}function Pn(){V(Ge),V(pr),V(mr)}function oc(e){Vt(mr.current);var t=Vt(Ge.current),n=Fl(t,e.type);t!==n&&(A(pr,e),A(Ge,n))}function Ji(e){pr.current===e&&(V(Ge),V(pr))}var K=It(0);function xo(e){for(var t=e;t!==null;){if(t.tag===13){var n=t.memoizedState;if(n!==null&&(n=n.dehydrated,n===null||n.data==="$?"||n.data==="$!"))return t}else if(t.tag===19&&t.memoizedProps.revealOrder!==void 0){if(t.flags&128)return t}else if(t.child!==null){t.child.return=t,t=t.child;continue}if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return null;t=t.return}t.sibling.return=t.return,t=t.sibling}return null}var xl=[];function Gi(){for(var e=0;e<xl.length;e++)xl[e]._workInProgressVersionPrimary=null;xl.length=0}var Gr=dt.ReactCurrentDispatcher,wl=dt.ReactCurrentBatchConfig,Yt=0,Y=null,ee=null,re=null,wo=!1,qn=!1,hr=0,mp=0;function se(){throw Error(w(321))}function Zi(e,t){if(t===null)return!1;for(var n=0;n<t.length&&n<e.length;n++)if(!He(e[n],t[n]))return!1;return!0}function qi(e,t,n,r,o,l){if(Yt=l,Y=t,t.memoizedState=null,t.updateQueue=null,t.lanes=0,Gr.current=e===null||e.memoizedState===null?yp:xp,e=n(r,o),qn){l=0;do{if(qn=!1,hr=0,25<=l)throw Error(w(301));l+=1,re=ee=null,t.updateQueue=null,Gr.current=wp,e=n(r,o)}while(qn)}if(Gr.current=ko,t=ee!==null&&ee.next!==null,Yt=0,re=ee=Y=null,wo=!1,t)throw Error(w(300));return e}function bi(){var e=hr!==0;return hr=0,e}function Ke(){var e={memoizedState:null,baseState:null,baseQueue:null,queue:null,next:null};return re===null?Y.memoizedState=re=e:re=re.next=e,re}function Fe(){if(ee===null){var e=Y.alternate;e=e!==null?e.memoizedState:null}else e=ee.next;var t=re===null?Y.memoizedState:re.next;if(t!==null)re=t,ee=e;else{if(e===null)throw Error(w(310));ee=e,e={memoizedState:ee.memoizedState,baseState:ee.baseState,baseQueue:ee.baseQueue,queue:ee.queue,next:null},re===null?Y.memoizedState=re=e:re=re.next=e}return re}function gr(e,t){return typeof t=="function"?t(e):t}function kl(e){var t=Fe(),n=t.queue;if(n===null)throw Error(w(311));n.lastRenderedReducer=e;var r=ee,o=r.baseQueue,l=n.pending;if(l!==null){if(o!==null){var i=o.next;o.next=l.next,l.next=i}r.baseQueue=o=l,n.pending=null}if(o!==null){l=o.next,r=r.baseState;var u=i=null,s=null,c=l;do{var v=c.lane;if((Yt&v)===v)s!==null&&(s=s.next={lane:0,action:c.action,hasEagerState:c.hasEagerState,eagerState:c.eagerState,next:null}),r=c.hasEagerState?c.eagerState:e(r,c.action);else{var g={lane:v,action:c.action,hasEagerState:c.hasEagerState,eagerState:c.eagerState,next:null};s===null?(u=s=g,i=r):s=s.next=g,Y.lanes|=v,Xt|=v}c=c.next}while(c!==null&&c!==l);s===null?i=r:s.next=u,He(r,t.memoizedState)||(xe=!0),t.memoizedState=r,t.baseState=i,t.baseQueue=s,n.lastRenderedState=r}if(e=n.interleaved,e!==null){o=e;do l=o.lane,Y.lanes|=l,Xt|=l,o=o.next;while(o!==e)}else o===null&&(n.lanes=0);return[t.memoizedState,n.dispatch]}function Sl(e){var t=Fe(),n=t.queue;if(n===null)throw Error(w(311));n.lastRenderedReducer=e;var r=n.dispatch,o=n.pending,l=t.memoizedState;if(o!==null){n.pending=null;var i=o=o.next;do l=e(l,i.action),i=i.next;while(i!==o);He(l,t.memoizedState)||(xe=!0),t.memoizedState=l,t.baseQueue===null&&(t.baseState=l),n.lastRenderedState=l}return[l,r]}function lc(){}function ic(e,t){var n=Y,r=Fe(),o=t(),l=!He(r.memoizedState,o);if(l&&(r.memoizedState=o,xe=!0),r=r.queue,eu(ac.bind(null,n,r,e),[e]),r.getSnapshot!==t||l||re!==null&&re.memoizedState.tag&1){if(n.flags|=2048,vr(9,sc.bind(null,n,r,o,t),void 0,null),oe===null)throw Error(w(349));Yt&30||uc(n,t,o)}return o}function uc(e,t,n){e.flags|=16384,e={getSnapshot:t,value:n},t=Y.updateQueue,t===null?(t={lastEffect:null,stores:null},Y.updateQueue=t,t.stores=[e]):(n=t.stores,n===null?t.stores=[e]:n.push(e))}function sc(e,t,n,r){t.value=n,t.getSnapshot=r,cc(t)&&dc(e)}function ac(e,t,n){return n(function(){cc(t)&&dc(e)})}function cc(e){var t=e.getSnapshot;e=e.value;try{var n=t();return!He(e,n)}catch{return!0}}function dc(e){var t=at(e,1);t!==null&&Qe(t,e,1,-1)}function cs(e){var t=Ke();return typeof e=="function"&&(e=e()),t.memoizedState=t.baseState=e,e={pending:null,interleaved:null,lanes:0,dispatch:null,lastRenderedReducer:gr,lastRenderedState:e},t.queue=e,e=e.dispatch=vp.bind(null,Y,e),[t.memoizedState,e]}function vr(e,t,n,r){return e={tag:e,create:t,destroy:n,deps:r,next:null},t=Y.updateQueue,t===null?(t={lastEffect:null,stores:null},Y.updateQueue=t,t.lastEffect=e.next=e):(n=t.lastEffect,n===null?t.lastEffect=e.next=e:(r=n.next,n.next=e,e.next=r,t.lastEffect=e)),e}function fc(){return Fe().memoizedState}function Zr(e,t,n,r){var o=Ke();Y.flags|=e,o.memoizedState=vr(1|t,n,void 0,r===void 0?null:r)}function Do(e,t,n,r){var o=Fe();r=r===void 0?null:r;var l=void 0;if(ee!==null){var i=ee.memoizedState;if(l=i.destroy,r!==null&&Zi(r,i.deps)){o.memoizedState=vr(t,n,l,r);return}}Y.flags|=e,o.memoizedState=vr(1|t,n,l,r)}function ds(e,t){return Zr(8390656,8,e,t)}function eu(e,t){return Do(2048,8,e,t)}function pc(e,t){return Do(4,2,e,t)}function mc(e,t){return Do(4,4,e,t)}function hc(e,t){if(typeof t=="function")return e=e(),t(e),function(){t(null)};if(t!=null)return e=e(),t.current=e,function(){t.current=null}}function gc(e,t,n){return n=n!=null?n.concat([e]):null,Do(4,4,hc.bind(null,t,e),n)}function tu(){}function vc(e,t){var n=Fe();t=t===void 0?null:t;var r=n.memoizedState;return r!==null&&t!==null&&Zi(t,r[1])?r[0]:(n.memoizedState=[e,t],e)}function yc(e,t){var n=Fe();t=t===void 0?null:t;var r=n.memoizedState;return r!==null&&t!==null&&Zi(t,r[1])?r[0]:(e=e(),n.memoizedState=[e,t],e)}function xc(e,t,n){return Yt&21?(He(n,t)||(n=Ea(),Y.lanes|=n,Xt|=n,e.baseState=!0),t):(e.baseState&&(e.baseState=!1,xe=!0),e.memoizedState=n)}function hp(e,t){var n=F;F=n!==0&&4>n?n:4,e(!0);var r=wl.transition;wl.transition={};try{e(!1),t()}finally{F=n,wl.transition=r}}function wc(){return Fe().memoizedState}function gp(e,t,n){var r=zt(e);if(n={lane:r,action:n,hasEagerState:!1,eagerState:null,next:null},kc(e))Sc(t,n);else if(n=nc(e,t,n,r),n!==null){var o=me();Qe(n,e,r,o),_c(n,t,r)}}function vp(e,t,n){var r=zt(e),o={lane:r,action:n,hasEagerState:!1,eagerState:null,next:null};if(kc(e))Sc(t,o);else{var l=e.alternate;if(e.lanes===0&&(l===null||l.lanes===0)&&(l=t.lastRenderedReducer,l!==null))try{var i=t.lastRenderedState,u=l(i,n);if(o.hasEagerState=!0,o.eagerState=u,He(u,i)){var s=t.interleaved;s===null?(o.next=o,Ki(t)):(o.next=s.next,s.next=o),t.interleaved=o;return}}catch{}finally{}n=nc(e,t,o,r),n!==null&&(o=me(),Qe(n,e,r,o),_c(n,t,r))}}function kc(e){var t=e.alternate;return e===Y||t!==null&&t===Y}function Sc(e,t){qn=wo=!0;var n=e.pending;n===null?t.next=t:(t.next=n.next,n.next=t),e.pending=t}function _c(e,t,n){if(n&4194240){var r=t.lanes;r&=e.pendingLanes,n|=r,t.lanes=n,Ii(e,n)}}var ko={readContext:De,useCallback:se,useContext:se,useEffect:se,useImperativeHandle:se,useInsertionEffect:se,useLayoutEffect:se,useMemo:se,useReducer:se,useRef:se,useState:se,useDebugValue:se,useDeferredValue:se,useTransition:se,useMutableSource:se,useSyncExternalStore:se,useId:se,unstable_isNewReconciler:!1},yp={readContext:De,useCallback:function(e,t){return Ke().memoizedState=[e,t===void 0?null:t],e},useContext:De,useEffect:ds,useImperativeHandle:function(e,t,n){return n=n!=null?n.concat([e]):null,Zr(4194308,4,hc.bind(null,t,e),n)},useLayoutEffect:function(e,t){return Zr(4194308,4,e,t)},useInsertionEffect:function(e,t){return Zr(4,2,e,t)},useMemo:function(e,t){var n=Ke();return t=t===void 0?null:t,e=e(),n.memoizedState=[e,t],e},useReducer:function(e,t,n){var r=Ke();return t=n!==void 0?n(t):t,r.memoizedState=r.baseState=t,e={pending:null,interleaved:null,lanes:0,dispatch:null,lastRenderedReducer:e,lastRenderedState:t},r.queue=e,e=e.dispatch=gp.bind(null,Y,e),[r.memoizedState,e]},useRef:function(e){var t=Ke();return e={current:e},t.memoizedState=e},useState:cs,useDebugValue:tu,useDeferredValue:function(e){return Ke().memoizedState=e},useTransition:function(){var e=cs(!1),t=e[0];return e=hp.bind(null,e[1]),Ke().memoizedState=e,[t,e]},useMutableSource:function(){},useSyncExternalStore:function(e,t,n){var r=Y,o=Ke();if(H){if(n===void 0)throw Error(w(407));n=n()}else{if(n=t(),oe===null)throw Error(w(349));Yt&30||uc(r,t,n)}o.memoizedState=n;var l={value:n,getSnapshot:t};return o.queue=l,ds(ac.bind(null,r,l,e),[e]),r.flags|=2048,vr(9,sc.bind(null,r,l,n,t),void 0,null),n},useId:function(){var e=Ke(),t=oe.identifierPrefix;if(H){var n=rt,r=nt;n=(r&~(1<<32-Ve(r)-1)).toString(32)+n,t=":"+t+"R"+n,n=hr++,0<n&&(t+="H"+n.toString(32)),t+=":"}else n=mp++,t=":"+t+"r"+n.toString(32)+":";return e.memoizedState=t},unstable_isNewReconciler:!1},xp={readContext:De,useCallback:vc,useContext:De,useEffect:eu,useImperativeHandle:gc,useInsertionEffect:pc,useLayoutEffect:mc,useMemo:yc,useReducer:kl,useRef:fc,useState:function(){return kl(gr)},useDebugValue:tu,useDeferredValue:function(e){var t=Fe();return xc(t,ee.memoizedState,e)},useTransition:function(){var e=kl(gr)[0],t=Fe().memoizedState;return[e,t]},useMutableSource:lc,useSyncExternalStore:ic,useId:wc,unstable_isNewReconciler:!1},wp={readContext:De,useCallback:vc,useContext:De,useEffect:eu,useImperativeHandle:gc,useInsertionEffect:pc,useLayoutEffect:mc,useMemo:yc,useReducer:Sl,useRef:fc,useState:function(){return Sl(gr)},useDebugValue:tu,useDeferredValue:function(e){var t=Fe();return ee===null?t.memoizedState=e:xc(t,ee.memoizedState,e)},useTransition:function(){var e=Sl(gr)[0],t=Fe().memoizedState;return[e,t]},useMutableSource:lc,useSyncExternalStore:ic,useId:wc,unstable_isNewReconciler:!1};function Ue(e,t){if(e&&e.defaultProps){t=X({},t),e=e.defaultProps;for(var n in e)t[n]===void 0&&(t[n]=e[n]);return t}return t}function oi(e,t,n,r){t=e.memoizedState,n=n(r,t),n=n==null?t:X({},t,n),e.memoizedState=n,e.lanes===0&&(e.updateQueue.baseState=n)}var Fo={isMounted:function(e){return(e=e._reactInternals)?Zt(e)===e:!1},enqueueSetState:function(e,t,n){e=e._reactInternals;var r=me(),o=zt(e),l=it(r,o);l.payload=t,n!=null&&(l.callback=n),t=Ct(e,l,o),t!==null&&(Qe(t,e,o,r),Jr(t,e,o))},enqueueReplaceState:function(e,t,n){e=e._reactInternals;var r=me(),o=zt(e),l=it(r,o);l.tag=1,l.payload=t,n!=null&&(l.callback=n),t=Ct(e,l,o),t!==null&&(Qe(t,e,o,r),Jr(t,e,o))},enqueueForceUpdate:function(e,t){e=e._reactInternals;var n=me(),r=zt(e),o=it(n,r);o.tag=2,t!=null&&(o.callback=t),t=Ct(e,o,r),t!==null&&(Qe(t,e,r,n),Jr(t,e,r))}};function fs(e,t,n,r,o,l,i){return e=e.stateNode,typeof e.shouldComponentUpdate=="function"?e.shouldComponentUpdate(r,l,i):t.prototype&&t.prototype.isPureReactComponent?!ar(n,r)||!ar(o,l):!0}function Ec(e,t,n){var r=!1,o=Tt,l=t.contextType;return typeof l=="object"&&l!==null?l=De(l):(o=ke(t)?Wt:de.current,r=t.contextTypes,l=(r=r!=null)?Cn(e,o):Tt),t=new t(n,l),e.memoizedState=t.state!==null&&t.state!==void 0?t.state:null,t.updater=Fo,e.stateNode=t,t._reactInternals=e,r&&(e=e.stateNode,e.__reactInternalMemoizedUnmaskedChildContext=o,e.__reactInternalMemoizedMaskedChildContext=l),t}function ps(e,t,n,r){e=t.state,typeof t.componentWillReceiveProps=="function"&&t.componentWillReceiveProps(n,r),typeof t.UNSAFE_componentWillReceiveProps=="function"&&t.UNSAFE_componentWillReceiveProps(n,r),t.state!==e&&Fo.enqueueReplaceState(t,t.state,null)}function li(e,t,n,r){var o=e.stateNode;o.props=n,o.state=e.memoizedState,o.refs={},Yi(e);var l=t.contextType;typeof l=="object"&&l!==null?o.context=De(l):(l=ke(t)?Wt:de.current,o.context=Cn(e,l)),o.state=e.memoizedState,l=t.getDerivedStateFromProps,typeof l=="function"&&(oi(e,t,l,n),o.state=e.memoizedState),typeof t.getDerivedStateFromProps=="function"||typeof o.getSnapshotBeforeUpdate=="function"||typeof o.UNSAFE_componentWillMount!="function"&&typeof o.componentWillMount!="function"||(t=o.state,typeof o.componentWillMount=="function"&&o.componentWillMount(),typeof o.UNSAFE_componentWillMount=="function"&&o.UNSAFE_componentWillMount(),t!==o.state&&Fo.enqueueReplaceState(o,o.state,null),yo(e,n,o,r),o.state=e.memoizedState),typeof o.componentDidMount=="function"&&(e.flags|=4194308)}function jn(e,t){try{var n="",r=t;do n+=Yd(r),r=r.return;while(r);var o=n}catch(l){o=`
Error generating stack: `+l.message+`
`+l.stack}return{value:e,source:t,stack:o,digest:null}}function _l(e,t,n){return{value:e,source:null,stack:n??null,digest:t??null}}function ii(e,t){try{console.error(t.value)}catch(n){setTimeout(function(){throw n})}}var kp=typeof WeakMap=="function"?WeakMap:Map;function Cc(e,t,n){n=it(-1,n),n.tag=3,n.payload={element:null};var r=t.value;return n.callback=function(){_o||(_o=!0,gi=r),ii(e,t)},n}function Nc(e,t,n){n=it(-1,n),n.tag=3;var r=e.type.getDerivedStateFromError;if(typeof r=="function"){var o=t.value;n.payload=function(){return r(o)},n.callback=function(){ii(e,t)}}var l=e.stateNode;return l!==null&&typeof l.componentDidCatch=="function"&&(n.callback=function(){ii(e,t),typeof r!="function"&&(Nt===null?Nt=new Set([this]):Nt.add(this));var i=t.stack;this.componentDidCatch(t.value,{componentStack:i!==null?i:""})}),n}function ms(e,t,n){var r=e.pingCache;if(r===null){r=e.pingCache=new kp;var o=new Set;r.set(t,o)}else o=r.get(t),o===void 0&&(o=new Set,r.set(t,o));o.has(n)||(o.add(n),e=Rp.bind(null,e,t,n),t.then(e,e))}function hs(e){do{var t;if((t=e.tag===13)&&(t=e.memoizedState,t=t!==null?t.dehydrated!==null:!0),t)return e;e=e.return}while(e!==null);return null}function gs(e,t,n,r,o){return e.mode&1?(e.flags|=65536,e.lanes=o,e):(e===t?e.flags|=65536:(e.flags|=128,n.flags|=131072,n.flags&=-52805,n.tag===1&&(n.alternate===null?n.tag=17:(t=it(-1,1),t.tag=2,Ct(n,t,1))),n.lanes|=1),e)}var Sp=dt.ReactCurrentOwner,xe=!1;function pe(e,t,n,r){t.child=e===null?tc(t,null,n,r):zn(t,e.child,n,r)}function vs(e,t,n,r,o){n=n.render;var l=t.ref;return kn(t,o),r=qi(e,t,n,r,l,o),n=bi(),e!==null&&!xe?(t.updateQueue=e.updateQueue,t.flags&=-2053,e.lanes&=~o,ct(e,t,o)):(H&&n&&Ai(t),t.flags|=1,pe(e,t,r,o),t.child)}function ys(e,t,n,r,o){if(e===null){var l=n.type;return typeof l=="function"&&!au(l)&&l.defaultProps===void 0&&n.compare===null&&n.defaultProps===void 0?(t.tag=15,t.type=l,zc(e,t,l,r,o)):(e=to(n.type,null,r,t,t.mode,o),e.ref=t.ref,e.return=t,t.child=e)}if(l=e.child,!(e.lanes&o)){var i=l.memoizedProps;if(n=n.compare,n=n!==null?n:ar,n(i,r)&&e.ref===t.ref)return ct(e,t,o)}return t.flags|=1,e=Pt(l,r),e.ref=t.ref,e.return=t,t.child=e}function zc(e,t,n,r,o){if(e!==null){var l=e.memoizedProps;if(ar(l,r)&&e.ref===t.ref)if(xe=!1,t.pendingProps=r=l,(e.lanes&o)!==0)e.flags&131072&&(xe=!0);else return t.lanes=e.lanes,ct(e,t,o)}return ui(e,t,n,r,o)}function Pc(e,t,n){var r=t.pendingProps,o=r.children,l=e!==null?e.memoizedState:null;if(r.mode==="hidden")if(!(t.mode&1))t.memoizedState={baseLanes:0,cachePool:null,transitions:null},A(gn,Ee),Ee|=n;else{if(!(n&1073741824))return e=l!==null?l.baseLanes|n:n,t.lanes=t.childLanes=1073741824,t.memoizedState={baseLanes:e,cachePool:null,transitions:null},t.updateQueue=null,A(gn,Ee),Ee|=e,null;t.memoizedState={baseLanes:0,cachePool:null,transitions:null},r=l!==null?l.baseLanes:n,A(gn,Ee),Ee|=r}else l!==null?(r=l.baseLanes|n,t.memoizedState=null):r=n,A(gn,Ee),Ee|=r;return pe(e,t,o,n),t.child}function jc(e,t){var n=t.ref;(e===null&&n!==null||e!==null&&e.ref!==n)&&(t.flags|=512,t.flags|=2097152)}function ui(e,t,n,r,o){var l=ke(n)?Wt:de.current;return l=Cn(t,l),kn(t,o),n=qi(e,t,n,r,l,o),r=bi(),e!==null&&!xe?(t.updateQueue=e.updateQueue,t.flags&=-2053,e.lanes&=~o,ct(e,t,o)):(H&&r&&Ai(t),t.flags|=1,pe(e,t,n,o),t.child)}function xs(e,t,n,r,o){if(ke(n)){var l=!0;po(t)}else l=!1;if(kn(t,o),t.stateNode===null)qr(e,t),Ec(t,n,r),li(t,n,r,o),r=!0;else if(e===null){var i=t.stateNode,u=t.memoizedProps;i.props=u;var s=i.context,c=n.contextType;typeof c=="object"&&c!==null?c=De(c):(c=ke(n)?Wt:de.current,c=Cn(t,c));var v=n.getDerivedStateFromProps,g=typeof v=="function"||typeof i.getSnapshotBeforeUpdate=="function";g||typeof i.UNSAFE_componentWillReceiveProps!="function"&&typeof i.componentWillReceiveProps!="function"||(u!==r||s!==c)&&ps(t,i,r,c),gt=!1;var h=t.memoizedState;i.state=h,yo(t,r,i,o),s=t.memoizedState,u!==r||h!==s||we.current||gt?(typeof v=="function"&&(oi(t,n,v,r),s=t.memoizedState),(u=gt||fs(t,n,u,r,h,s,c))?(g||typeof i.UNSAFE_componentWillMount!="function"&&typeof i.componentWillMount!="function"||(typeof i.componentWillMount=="function"&&i.componentWillMount(),typeof i.UNSAFE_componentWillMount=="function"&&i.UNSAFE_componentWillMount()),typeof i.componentDidMount=="function"&&(t.flags|=4194308)):(typeof i.componentDidMount=="function"&&(t.flags|=4194308),t.memoizedProps=r,t.memoizedState=s),i.props=r,i.state=s,i.context=c,r=u):(typeof i.componentDidMount=="function"&&(t.flags|=4194308),r=!1)}else{i=t.stateNode,rc(e,t),u=t.memoizedProps,c=t.type===t.elementType?u:Ue(t.type,u),i.props=c,g=t.pendingProps,h=i.context,s=n.contextType,typeof s=="object"&&s!==null?s=De(s):(s=ke(n)?Wt:de.current,s=Cn(t,s));var k=n.getDerivedStateFromProps;(v=typeof k=="function"||typeof i.getSnapshotBeforeUpdate=="function")||typeof i.UNSAFE_componentWillReceiveProps!="function"&&typeof i.componentWillReceiveProps!="function"||(u!==g||h!==s)&&ps(t,i,r,s),gt=!1,h=t.memoizedState,i.state=h,yo(t,r,i,o);var y=t.memoizedState;u!==g||h!==y||we.current||gt?(typeof k=="function"&&(oi(t,n,k,r),y=t.memoizedState),(c=gt||fs(t,n,c,r,h,y,s)||!1)?(v||typeof i.UNSAFE_componentWillUpdate!="function"&&typeof i.componentWillUpdate!="function"||(typeof i.componentWillUpdate=="function"&&i.componentWillUpdate(r,y,s),typeof i.UNSAFE_componentWillUpdate=="function"&&i.UNSAFE_componentWillUpdate(r,y,s)),typeof i.componentDidUpdate=="function"&&(t.flags|=4),typeof i.getSnapshotBeforeUpdate=="function"&&(t.flags|=1024)):(typeof i.componentDidUpdate!="function"||u===e.memoizedProps&&h===e.memoizedState||(t.flags|=4),typeof i.getSnapshotBeforeUpdate!="function"||u===e.memoizedProps&&h===e.memoizedState||(t.flags|=1024),t.memoizedProps=r,t.memoizedState=y),i.props=r,i.state=y,i.context=s,r=c):(typeof i.componentDidUpdate!="function"||u===e.memoizedProps&&h===e.memoizedState||(t.flags|=4),typeof i.getSnapshotBeforeUpdate!="function"||u===e.memoizedProps&&h===e.memoizedState||(t.flags|=1024),r=!1)}return si(e,t,n,r,l,o)}function si(e,t,n,r,o,l){jc(e,t);var i=(t.flags&128)!==0;if(!r&&!i)return o&&os(t,n,!1),ct(e,t,l);r=t.stateNode,Sp.current=t;var u=i&&typeof n.getDerivedStateFromError!="function"?null:r.render();return t.flags|=1,e!==null&&i?(t.child=zn(t,e.child,null,l),t.child=zn(t,null,u,l)):pe(e,t,u,l),t.memoizedState=r.state,o&&os(t,n,!0),t.child}function Tc(e){var t=e.stateNode;t.pendingContext?rs(e,t.pendingContext,t.pendingContext!==t.context):t.context&&rs(e,t.context,!1),Xi(e,t.containerInfo)}function ws(e,t,n,r,o){return Nn(),Vi(o),t.flags|=256,pe(e,t,n,r),t.child}var ai={dehydrated:null,treeContext:null,retryLane:0};function ci(e){return{baseLanes:e,cachePool:null,transitions:null}}function Lc(e,t,n){var r=t.pendingProps,o=K.current,l=!1,i=(t.flags&128)!==0,u;if((u=i)||(u=e!==null&&e.memoizedState===null?!1:(o&2)!==0),u?(l=!0,t.flags&=-129):(e===null||e.memoizedState!==null)&&(o|=1),A(K,o&1),e===null)return ni(t),e=t.memoizedState,e!==null&&(e=e.dehydrated,e!==null)?(t.mode&1?e.data==="$!"?t.lanes=8:t.lanes=1073741824:t.lanes=1,null):(i=r.children,e=r.fallback,l?(r=t.mode,l=t.child,i={mode:"hidden",children:i},!(r&1)&&l!==null?(l.childLanes=0,l.pendingProps=i):l=Ao(i,r,0,null),e=Ht(e,r,n,null),l.return=t,e.return=t,l.sibling=e,t.child=l,t.child.memoizedState=ci(n),t.memoizedState=ai,e):nu(t,i));if(o=e.memoizedState,o!==null&&(u=o.dehydrated,u!==null))return _p(e,t,i,r,u,o,n);if(l){l=r.fallback,i=t.mode,o=e.child,u=o.sibling;var s={mode:"hidden",children:r.children};return!(i&1)&&t.child!==o?(r=t.child,r.childLanes=0,r.pendingProps=s,t.deletions=null):(r=Pt(o,s),r.subtreeFlags=o.subtreeFlags&14680064),u!==null?l=Pt(u,l):(l=Ht(l,i,n,null),l.flags|=2),l.return=t,r.return=t,r.sibling=l,t.child=r,r=l,l=t.child,i=e.child.memoizedState,i=i===null?ci(n):{baseLanes:i.baseLanes|n,cachePool:null,transitions:i.transitions},l.memoizedState=i,l.childLanes=e.childLanes&~n,t.memoizedState=ai,r}return l=e.child,e=l.sibling,r=Pt(l,{mode:"visible",children:r.children}),!(t.mode&1)&&(r.lanes=n),r.return=t,r.sibling=null,e!==null&&(n=t.deletions,n===null?(t.deletions=[e],t.flags|=16):n.push(e)),t.child=r,t.memoizedState=null,r}function nu(e,t){return t=Ao({mode:"visible",children:t},e.mode,0,null),t.return=e,e.child=t}function Ur(e,t,n,r){return r!==null&&Vi(r),zn(t,e.child,null,n),e=nu(t,t.pendingProps.children),e.flags|=2,t.memoizedState=null,e}function _p(e,t,n,r,o,l,i){if(n)return t.flags&256?(t.flags&=-257,r=_l(Error(w(422))),Ur(e,t,i,r)):t.memoizedState!==null?(t.child=e.child,t.flags|=128,null):(l=r.fallback,o=t.mode,r=Ao({mode:"visible",children:r.children},o,0,null),l=Ht(l,o,i,null),l.flags|=2,r.return=t,l.return=t,r.sibling=l,t.child=r,t.mode&1&&zn(t,e.child,null,i),t.child.memoizedState=ci(i),t.memoizedState=ai,l);if(!(t.mode&1))return Ur(e,t,i,null);if(o.data==="$!"){if(r=o.nextSibling&&o.nextSibling.dataset,r)var u=r.dgst;return r=u,l=Error(w(419)),r=_l(l,r,void 0),Ur(e,t,i,r)}if(u=(i&e.childLanes)!==0,xe||u){if(r=oe,r!==null){switch(i&-i){case 4:o=2;break;case 16:o=8;break;case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:o=32;break;case 536870912:o=268435456;break;default:o=0}o=o&(r.suspendedLanes|i)?0:o,o!==0&&o!==l.retryLane&&(l.retryLane=o,at(e,o),Qe(r,e,o,-1))}return su(),r=_l(Error(w(421))),Ur(e,t,i,r)}return o.data==="$?"?(t.flags|=128,t.child=e.child,t=Dp.bind(null,e),o._reactRetry=t,null):(e=l.treeContext,Ce=Et(o.nextSibling),Ne=t,H=!0,Be=null,e!==null&&(Ie[Oe++]=nt,Ie[Oe++]=rt,Ie[Oe++]=Kt,nt=e.id,rt=e.overflow,Kt=t),t=nu(t,r.children),t.flags|=4096,t)}function ks(e,t,n){e.lanes|=t;var r=e.alternate;r!==null&&(r.lanes|=t),ri(e.return,t,n)}function El(e,t,n,r,o){var l=e.memoizedState;l===null?e.memoizedState={isBackwards:t,rendering:null,renderingStartTime:0,last:r,tail:n,tailMode:o}:(l.isBackwards=t,l.rendering=null,l.renderingStartTime=0,l.last=r,l.tail=n,l.tailMode=o)}function Ic(e,t,n){var r=t.pendingProps,o=r.revealOrder,l=r.tail;if(pe(e,t,r.children,n),r=K.current,r&2)r=r&1|2,t.flags|=128;else{if(e!==null&&e.flags&128)e:for(e=t.child;e!==null;){if(e.tag===13)e.memoizedState!==null&&ks(e,n,t);else if(e.tag===19)ks(e,n,t);else if(e.child!==null){e.child.return=e,e=e.child;continue}if(e===t)break e;for(;e.sibling===null;){if(e.return===null||e.return===t)break e;e=e.return}e.sibling.return=e.return,e=e.sibling}r&=1}if(A(K,r),!(t.mode&1))t.memoizedState=null;else switch(o){case"forwards":for(n=t.child,o=null;n!==null;)e=n.alternate,e!==null&&xo(e)===null&&(o=n),n=n.sibling;n=o,n===null?(o=t.child,t.child=null):(o=n.sibling,n.sibling=null),El(t,!1,o,n,l);break;case"backwards":for(n=null,o=t.child,t.child=null;o!==null;){if(e=o.alternate,e!==null&&xo(e)===null){t.child=o;break}e=o.sibling,o.sibling=n,n=o,o=e}El(t,!0,n,null,l);break;case"together":El(t,!1,null,null,void 0);break;default:t.memoizedState=null}return t.child}function qr(e,t){!(t.mode&1)&&e!==null&&(e.alternate=null,t.alternate=null,t.flags|=2)}function ct(e,t,n){if(e!==null&&(t.dependencies=e.dependencies),Xt|=t.lanes,!(n&t.childLanes))return null;if(e!==null&&t.child!==e.child)throw Error(w(153));if(t.child!==null){for(e=t.child,n=Pt(e,e.pendingProps),t.child=n,n.return=t;e.sibling!==null;)e=e.sibling,n=n.sibling=Pt(e,e.pendingProps),n.return=t;n.sibling=null}return t.child}function Ep(e,t,n){switch(t.tag){case 3:Tc(t),Nn();break;case 5:oc(t);break;case 1:ke(t.type)&&po(t);break;case 4:Xi(t,t.stateNode.containerInfo);break;case 10:var r=t.type._context,o=t.memoizedProps.value;A(go,r._currentValue),r._currentValue=o;break;case 13:if(r=t.memoizedState,r!==null)return r.dehydrated!==null?(A(K,K.current&1),t.flags|=128,null):n&t.child.childLanes?Lc(e,t,n):(A(K,K.current&1),e=ct(e,t,n),e!==null?e.sibling:null);A(K,K.current&1);break;case 19:if(r=(n&t.childLanes)!==0,e.flags&128){if(r)return Ic(e,t,n);t.flags|=128}if(o=t.memoizedState,o!==null&&(o.rendering=null,o.tail=null,o.lastEffect=null),A(K,K.current),r)break;return null;case 22:case 23:return t.lanes=0,Pc(e,t,n)}return ct(e,t,n)}var Oc,di,Mc,Rc;Oc=function(e,t){for(var n=t.child;n!==null;){if(n.tag===5||n.tag===6)e.appendChild(n.stateNode);else if(n.tag!==4&&n.child!==null){n.child.return=n,n=n.child;continue}if(n===t)break;for(;n.sibling===null;){if(n.return===null||n.return===t)return;n=n.return}n.sibling.return=n.return,n=n.sibling}};di=function(){};Mc=function(e,t,n,r){var o=e.memoizedProps;if(o!==r){e=t.stateNode,Vt(Ge.current);var l=null;switch(n){case"input":o=Ol(e,o),r=Ol(e,r),l=[];break;case"select":o=X({},o,{value:void 0}),r=X({},r,{value:void 0}),l=[];break;case"textarea":o=Dl(e,o),r=Dl(e,r),l=[];break;default:typeof o.onClick!="function"&&typeof r.onClick=="function"&&(e.onclick=co)}$l(n,r);var i;n=null;for(c in o)if(!r.hasOwnProperty(c)&&o.hasOwnProperty(c)&&o[c]!=null)if(c==="style"){var u=o[c];for(i in u)u.hasOwnProperty(i)&&(n||(n={}),n[i]="")}else c!=="dangerouslySetInnerHTML"&&c!=="children"&&c!=="suppressContentEditableWarning"&&c!=="suppressHydrationWarning"&&c!=="autoFocus"&&(nr.hasOwnProperty(c)?l||(l=[]):(l=l||[]).push(c,null));for(c in r){var s=r[c];if(u=o!=null?o[c]:void 0,r.hasOwnProperty(c)&&s!==u&&(s!=null||u!=null))if(c==="style")if(u){for(i in u)!u.hasOwnProperty(i)||s&&s.hasOwnProperty(i)||(n||(n={}),n[i]="");for(i in s)s.hasOwnProperty(i)&&u[i]!==s[i]&&(n||(n={}),n[i]=s[i])}else n||(l||(l=[]),l.push(c,n)),n=s;else c==="dangerouslySetInnerHTML"?(s=s?s.__html:void 0,u=u?u.__html:void 0,s!=null&&u!==s&&(l=l||[]).push(c,s)):c==="children"?typeof s!="string"&&typeof s!="number"||(l=l||[]).push(c,""+s):c!=="suppressContentEditableWarning"&&c!=="suppressHydrationWarning"&&(nr.hasOwnProperty(c)?(s!=null&&c==="onScroll"&&B("scroll",e),l||u===s||(l=[])):(l=l||[]).push(c,s))}n&&(l=l||[]).push("style",n);var c=l;(t.updateQueue=c)&&(t.flags|=4)}};Rc=function(e,t,n,r){n!==r&&(t.flags|=4)};function Bn(e,t){if(!H)switch(e.tailMode){case"hidden":t=e.tail;for(var n=null;t!==null;)t.alternate!==null&&(n=t),t=t.sibling;n===null?e.tail=null:n.sibling=null;break;case"collapsed":n=e.tail;for(var r=null;n!==null;)n.alternate!==null&&(r=n),n=n.sibling;r===null?t||e.tail===null?e.tail=null:e.tail.sibling=null:r.sibling=null}}function ae(e){var t=e.alternate!==null&&e.alternate.child===e.child,n=0,r=0;if(t)for(var o=e.child;o!==null;)n|=o.lanes|o.childLanes,r|=o.subtreeFlags&14680064,r|=o.flags&14680064,o.return=e,o=o.sibling;else for(o=e.child;o!==null;)n|=o.lanes|o.childLanes,r|=o.subtreeFlags,r|=o.flags,o.return=e,o=o.sibling;return e.subtreeFlags|=r,e.childLanes=n,t}function Cp(e,t,n){var r=t.pendingProps;switch(Bi(t),t.tag){case 2:case 16:case 15:case 0:case 11:case 7:case 8:case 12:case 9:case 14:return ae(t),null;case 1:return ke(t.type)&&fo(),ae(t),null;case 3:return r=t.stateNode,Pn(),V(we),V(de),Gi(),r.pendingContext&&(r.context=r.pendingContext,r.pendingContext=null),(e===null||e.child===null)&&(Fr(t)?t.flags|=4:e===null||e.memoizedState.isDehydrated&&!(t.flags&256)||(t.flags|=1024,Be!==null&&(xi(Be),Be=null))),di(e,t),ae(t),null;case 5:Ji(t);var o=Vt(mr.current);if(n=t.type,e!==null&&t.stateNode!=null)Mc(e,t,n,r,o),e.ref!==t.ref&&(t.flags|=512,t.flags|=2097152);else{if(!r){if(t.stateNode===null)throw Error(w(166));return ae(t),null}if(e=Vt(Ge.current),Fr(t)){r=t.stateNode,n=t.type;var l=t.memoizedProps;switch(r[Xe]=t,r[fr]=l,e=(t.mode&1)!==0,n){case"dialog":B("cancel",r),B("close",r);break;case"iframe":case"object":case"embed":B("load",r);break;case"video":case"audio":for(o=0;o<Kn.length;o++)B(Kn[o],r);break;case"source":B("error",r);break;case"img":case"image":case"link":B("error",r),B("load",r);break;case"details":B("toggle",r);break;case"input":Tu(r,l),B("invalid",r);break;case"select":r._wrapperState={wasMultiple:!!l.multiple},B("invalid",r);break;case"textarea":Iu(r,l),B("invalid",r)}$l(n,l),o=null;for(var i in l)if(l.hasOwnProperty(i)){var u=l[i];i==="children"?typeof u=="string"?r.textContent!==u&&(l.suppressHydrationWarning!==!0&&Dr(r.textContent,u,e),o=["children",u]):typeof u=="number"&&r.textContent!==""+u&&(l.suppressHydrationWarning!==!0&&Dr(r.textContent,u,e),o=["children",""+u]):nr.hasOwnProperty(i)&&u!=null&&i==="onScroll"&&B("scroll",r)}switch(n){case"input":Pr(r),Lu(r,l,!0);break;case"textarea":Pr(r),Ou(r);break;case"select":case"option":break;default:typeof l.onClick=="function"&&(r.onclick=co)}r=o,t.updateQueue=r,r!==null&&(t.flags|=4)}else{i=o.nodeType===9?o:o.ownerDocument,e==="http://www.w3.org/1999/xhtml"&&(e=aa(n)),e==="http://www.w3.org/1999/xhtml"?n==="script"?(e=i.createElement("div"),e.innerHTML="<script><\/script>",e=e.removeChild(e.firstChild)):typeof r.is=="string"?e=i.createElement(n,{is:r.is}):(e=i.createElement(n),n==="select"&&(i=e,r.multiple?i.multiple=!0:r.size&&(i.size=r.size))):e=i.createElementNS(e,n),e[Xe]=t,e[fr]=r,Oc(e,t,!1,!1),t.stateNode=e;e:{switch(i=Ul(n,r),n){case"dialog":B("cancel",e),B("close",e),o=r;break;case"iframe":case"object":case"embed":B("load",e),o=r;break;case"video":case"audio":for(o=0;o<Kn.length;o++)B(Kn[o],e);o=r;break;case"source":B("error",e),o=r;break;case"img":case"image":case"link":B("error",e),B("load",e),o=r;break;case"details":B("toggle",e),o=r;break;case"input":Tu(e,r),o=Ol(e,r),B("invalid",e);break;case"option":o=r;break;case"select":e._wrapperState={wasMultiple:!!r.multiple},o=X({},r,{value:void 0}),B("invalid",e);break;case"textarea":Iu(e,r),o=Dl(e,r),B("invalid",e);break;default:o=r}$l(n,o),u=o;for(l in u)if(u.hasOwnProperty(l)){var s=u[l];l==="style"?fa(e,s):l==="dangerouslySetInnerHTML"?(s=s?s.__html:void 0,s!=null&&ca(e,s)):l==="children"?typeof s=="string"?(n!=="textarea"||s!=="")&&rr(e,s):typeof s=="number"&&rr(e,""+s):l!=="suppressContentEditableWarning"&&l!=="suppressHydrationWarning"&&l!=="autoFocus"&&(nr.hasOwnProperty(l)?s!=null&&l==="onScroll"&&B("scroll",e):s!=null&&Ni(e,l,s,i))}switch(n){case"input":Pr(e),Lu(e,r,!1);break;case"textarea":Pr(e),Ou(e);break;case"option":r.value!=null&&e.setAttribute("value",""+jt(r.value));break;case"select":e.multiple=!!r.multiple,l=r.value,l!=null?vn(e,!!r.multiple,l,!1):r.defaultValue!=null&&vn(e,!!r.multiple,r.defaultValue,!0);break;default:typeof o.onClick=="function"&&(e.onclick=co)}switch(n){case"button":case"input":case"select":case"textarea":r=!!r.autoFocus;break e;case"img":r=!0;break e;default:r=!1}}r&&(t.flags|=4)}t.ref!==null&&(t.flags|=512,t.flags|=2097152)}return ae(t),null;case 6:if(e&&t.stateNode!=null)Rc(e,t,e.memoizedProps,r);else{if(typeof r!="string"&&t.stateNode===null)throw Error(w(166));if(n=Vt(mr.current),Vt(Ge.current),Fr(t)){if(r=t.stateNode,n=t.memoizedProps,r[Xe]=t,(l=r.nodeValue!==n)&&(e=Ne,e!==null))switch(e.tag){case 3:Dr(r.nodeValue,n,(e.mode&1)!==0);break;case 5:e.memoizedProps.suppressHydrationWarning!==!0&&Dr(r.nodeValue,n,(e.mode&1)!==0)}l&&(t.flags|=4)}else r=(n.nodeType===9?n:n.ownerDocument).createTextNode(r),r[Xe]=t,t.stateNode=r}return ae(t),null;case 13:if(V(K),r=t.memoizedState,e===null||e.memoizedState!==null&&e.memoizedState.dehydrated!==null){if(H&&Ce!==null&&t.mode&1&&!(t.flags&128))ba(),Nn(),t.flags|=98560,l=!1;else if(l=Fr(t),r!==null&&r.dehydrated!==null){if(e===null){if(!l)throw Error(w(318));if(l=t.memoizedState,l=l!==null?l.dehydrated:null,!l)throw Error(w(317));l[Xe]=t}else Nn(),!(t.flags&128)&&(t.memoizedState=null),t.flags|=4;ae(t),l=!1}else Be!==null&&(xi(Be),Be=null),l=!0;if(!l)return t.flags&65536?t:null}return t.flags&128?(t.lanes=n,t):(r=r!==null,r!==(e!==null&&e.memoizedState!==null)&&r&&(t.child.flags|=8192,t.mode&1&&(e===null||K.current&1?te===0&&(te=3):su())),t.updateQueue!==null&&(t.flags|=4),ae(t),null);case 4:return Pn(),di(e,t),e===null&&cr(t.stateNode.containerInfo),ae(t),null;case 10:return Wi(t.type._context),ae(t),null;case 17:return ke(t.type)&&fo(),ae(t),null;case 19:if(V(K),l=t.memoizedState,l===null)return ae(t),null;if(r=(t.flags&128)!==0,i=l.rendering,i===null)if(r)Bn(l,!1);else{if(te!==0||e!==null&&e.flags&128)for(e=t.child;e!==null;){if(i=xo(e),i!==null){for(t.flags|=128,Bn(l,!1),r=i.updateQueue,r!==null&&(t.updateQueue=r,t.flags|=4),t.subtreeFlags=0,r=n,n=t.child;n!==null;)l=n,e=r,l.flags&=14680066,i=l.alternate,i===null?(l.childLanes=0,l.lanes=e,l.child=null,l.subtreeFlags=0,l.memoizedProps=null,l.memoizedState=null,l.updateQueue=null,l.dependencies=null,l.stateNode=null):(l.childLanes=i.childLanes,l.lanes=i.lanes,l.child=i.child,l.subtreeFlags=0,l.deletions=null,l.memoizedProps=i.memoizedProps,l.memoizedState=i.memoizedState,l.updateQueue=i.updateQueue,l.type=i.type,e=i.dependencies,l.dependencies=e===null?null:{lanes:e.lanes,firstContext:e.firstContext}),n=n.sibling;return A(K,K.current&1|2),t.child}e=e.sibling}l.tail!==null&&q()>Tn&&(t.flags|=128,r=!0,Bn(l,!1),t.lanes=4194304)}else{if(!r)if(e=xo(i),e!==null){if(t.flags|=128,r=!0,n=e.updateQueue,n!==null&&(t.updateQueue=n,t.flags|=4),Bn(l,!0),l.tail===null&&l.tailMode==="hidden"&&!i.alternate&&!H)return ae(t),null}else 2*q()-l.renderingStartTime>Tn&&n!==1073741824&&(t.flags|=128,r=!0,Bn(l,!1),t.lanes=4194304);l.isBackwards?(i.sibling=t.child,t.child=i):(n=l.last,n!==null?n.sibling=i:t.child=i,l.last=i)}return l.tail!==null?(t=l.tail,l.rendering=t,l.tail=t.sibling,l.renderingStartTime=q(),t.sibling=null,n=K.current,A(K,r?n&1|2:n&1),t):(ae(t),null);case 22:case 23:return uu(),r=t.memoizedState!==null,e!==null&&e.memoizedState!==null!==r&&(t.flags|=8192),r&&t.mode&1?Ee&1073741824&&(ae(t),t.subtreeFlags&6&&(t.flags|=8192)):ae(t),null;case 24:return null;case 25:return null}throw Error(w(156,t.tag))}function Np(e,t){switch(Bi(t),t.tag){case 1:return ke(t.type)&&fo(),e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 3:return Pn(),V(we),V(de),Gi(),e=t.flags,e&65536&&!(e&128)?(t.flags=e&-65537|128,t):null;case 5:return Ji(t),null;case 13:if(V(K),e=t.memoizedState,e!==null&&e.dehydrated!==null){if(t.alternate===null)throw Error(w(340));Nn()}return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 19:return V(K),null;case 4:return Pn(),null;case 10:return Wi(t.type._context),null;case 22:case 23:return uu(),null;case 24:return null;default:return null}}var Ar=!1,ce=!1,zp=typeof WeakSet=="function"?WeakSet:Set,N=null;function hn(e,t){var n=e.ref;if(n!==null)if(typeof n=="function")try{n(null)}catch(r){Z(e,t,r)}else n.current=null}function fi(e,t,n){try{n()}catch(r){Z(e,t,r)}}var Ss=!1;function Pp(e,t){if(Jl=uo,e=Aa(),Ui(e)){if("selectionStart"in e)var n={start:e.selectionStart,end:e.selectionEnd};else e:{n=(n=e.ownerDocument)&&n.defaultView||window;var r=n.getSelection&&n.getSelection();if(r&&r.rangeCount!==0){n=r.anchorNode;var o=r.anchorOffset,l=r.focusNode;r=r.focusOffset;try{n.nodeType,l.nodeType}catch{n=null;break e}var i=0,u=-1,s=-1,c=0,v=0,g=e,h=null;t:for(;;){for(var k;g!==n||o!==0&&g.nodeType!==3||(u=i+o),g!==l||r!==0&&g.nodeType!==3||(s=i+r),g.nodeType===3&&(i+=g.nodeValue.length),(k=g.firstChild)!==null;)h=g,g=k;for(;;){if(g===e)break t;if(h===n&&++c===o&&(u=i),h===l&&++v===r&&(s=i),(k=g.nextSibling)!==null)break;g=h,h=g.parentNode}g=k}n=u===-1||s===-1?null:{start:u,end:s}}else n=null}n=n||{start:0,end:0}}else n=null;for(Gl={focusedElem:e,selectionRange:n},uo=!1,N=t;N!==null;)if(t=N,e=t.child,(t.subtreeFlags&1028)!==0&&e!==null)e.return=t,N=e;else for(;N!==null;){t=N;try{var y=t.alternate;if(t.flags&1024)switch(t.tag){case 0:case 11:case 15:break;case 1:if(y!==null){var S=y.memoizedProps,$=y.memoizedState,d=t.stateNode,a=d.getSnapshotBeforeUpdate(t.elementType===t.type?S:Ue(t.type,S),$);d.__reactInternalSnapshotBeforeUpdate=a}break;case 3:var f=t.stateNode.containerInfo;f.nodeType===1?f.textContent="":f.nodeType===9&&f.documentElement&&f.removeChild(f.documentElement);break;case 5:case 6:case 4:case 17:break;default:throw Error(w(163))}}catch(x){Z(t,t.return,x)}if(e=t.sibling,e!==null){e.return=t.return,N=e;break}N=t.return}return y=Ss,Ss=!1,y}function bn(e,t,n){var r=t.updateQueue;if(r=r!==null?r.lastEffect:null,r!==null){var o=r=r.next;do{if((o.tag&e)===e){var l=o.destroy;o.destroy=void 0,l!==void 0&&fi(t,n,l)}o=o.next}while(o!==r)}}function $o(e,t){if(t=t.updateQueue,t=t!==null?t.lastEffect:null,t!==null){var n=t=t.next;do{if((n.tag&e)===e){var r=n.create;n.destroy=r()}n=n.next}while(n!==t)}}function pi(e){var t=e.ref;if(t!==null){var n=e.stateNode;switch(e.tag){case 5:e=n;break;default:e=n}typeof t=="function"?t(e):t.current=e}}function Dc(e){var t=e.alternate;t!==null&&(e.alternate=null,Dc(t)),e.child=null,e.deletions=null,e.sibling=null,e.tag===5&&(t=e.stateNode,t!==null&&(delete t[Xe],delete t[fr],delete t[bl],delete t[cp],delete t[dp])),e.stateNode=null,e.return=null,e.dependencies=null,e.memoizedProps=null,e.memoizedState=null,e.pendingProps=null,e.stateNode=null,e.updateQueue=null}function Fc(e){return e.tag===5||e.tag===3||e.tag===4}function _s(e){e:for(;;){for(;e.sibling===null;){if(e.return===null||Fc(e.return))return null;e=e.return}for(e.sibling.return=e.return,e=e.sibling;e.tag!==5&&e.tag!==6&&e.tag!==18;){if(e.flags&2||e.child===null||e.tag===4)continue e;e.child.return=e,e=e.child}if(!(e.flags&2))return e.stateNode}}function mi(e,t,n){var r=e.tag;if(r===5||r===6)e=e.stateNode,t?n.nodeType===8?n.parentNode.insertBefore(e,t):n.insertBefore(e,t):(n.nodeType===8?(t=n.parentNode,t.insertBefore(e,n)):(t=n,t.appendChild(e)),n=n._reactRootContainer,n!=null||t.onclick!==null||(t.onclick=co));else if(r!==4&&(e=e.child,e!==null))for(mi(e,t,n),e=e.sibling;e!==null;)mi(e,t,n),e=e.sibling}function hi(e,t,n){var r=e.tag;if(r===5||r===6)e=e.stateNode,t?n.insertBefore(e,t):n.appendChild(e);else if(r!==4&&(e=e.child,e!==null))for(hi(e,t,n),e=e.sibling;e!==null;)hi(e,t,n),e=e.sibling}var le=null,Ae=!1;function mt(e,t,n){for(n=n.child;n!==null;)$c(e,t,n),n=n.sibling}function $c(e,t,n){if(Je&&typeof Je.onCommitFiberUnmount=="function")try{Je.onCommitFiberUnmount(To,n)}catch{}switch(n.tag){case 5:ce||hn(n,t);case 6:var r=le,o=Ae;le=null,mt(e,t,n),le=r,Ae=o,le!==null&&(Ae?(e=le,n=n.stateNode,e.nodeType===8?e.parentNode.removeChild(n):e.removeChild(n)):le.removeChild(n.stateNode));break;case 18:le!==null&&(Ae?(e=le,n=n.stateNode,e.nodeType===8?vl(e.parentNode,n):e.nodeType===1&&vl(e,n),ur(e)):vl(le,n.stateNode));break;case 4:r=le,o=Ae,le=n.stateNode.containerInfo,Ae=!0,mt(e,t,n),le=r,Ae=o;break;case 0:case 11:case 14:case 15:if(!ce&&(r=n.updateQueue,r!==null&&(r=r.lastEffect,r!==null))){o=r=r.next;do{var l=o,i=l.destroy;l=l.tag,i!==void 0&&(l&2||l&4)&&fi(n,t,i),o=o.next}while(o!==r)}mt(e,t,n);break;case 1:if(!ce&&(hn(n,t),r=n.stateNode,typeof r.componentWillUnmount=="function"))try{r.props=n.memoizedProps,r.state=n.memoizedState,r.componentWillUnmount()}catch(u){Z(n,t,u)}mt(e,t,n);break;case 21:mt(e,t,n);break;case 22:n.mode&1?(ce=(r=ce)||n.memoizedState!==null,mt(e,t,n),ce=r):mt(e,t,n);break;default:mt(e,t,n)}}function Es(e){var t=e.updateQueue;if(t!==null){e.updateQueue=null;var n=e.stateNode;n===null&&(n=e.stateNode=new zp),t.forEach(function(r){var o=Fp.bind(null,e,r);n.has(r)||(n.add(r),r.then(o,o))})}}function $e(e,t){var n=t.deletions;if(n!==null)for(var r=0;r<n.length;r++){var o=n[r];try{var l=e,i=t,u=i;e:for(;u!==null;){switch(u.tag){case 5:le=u.stateNode,Ae=!1;break e;case 3:le=u.stateNode.containerInfo,Ae=!0;break e;case 4:le=u.stateNode.containerInfo,Ae=!0;break e}u=u.return}if(le===null)throw Error(w(160));$c(l,i,o),le=null,Ae=!1;var s=o.alternate;s!==null&&(s.return=null),o.return=null}catch(c){Z(o,t,c)}}if(t.subtreeFlags&12854)for(t=t.child;t!==null;)Uc(t,e),t=t.sibling}function Uc(e,t){var n=e.alternate,r=e.flags;switch(e.tag){case 0:case 11:case 14:case 15:if($e(t,e),We(e),r&4){try{bn(3,e,e.return),$o(3,e)}catch(S){Z(e,e.return,S)}try{bn(5,e,e.return)}catch(S){Z(e,e.return,S)}}break;case 1:$e(t,e),We(e),r&512&&n!==null&&hn(n,n.return);break;case 5:if($e(t,e),We(e),r&512&&n!==null&&hn(n,n.return),e.flags&32){var o=e.stateNode;try{rr(o,"")}catch(S){Z(e,e.return,S)}}if(r&4&&(o=e.stateNode,o!=null)){var l=e.memoizedProps,i=n!==null?n.memoizedProps:l,u=e.type,s=e.updateQueue;if(e.updateQueue=null,s!==null)try{u==="input"&&l.type==="radio"&&l.name!=null&&ua(o,l),Ul(u,i);var c=Ul(u,l);for(i=0;i<s.length;i+=2){var v=s[i],g=s[i+1];v==="style"?fa(o,g):v==="dangerouslySetInnerHTML"?ca(o,g):v==="children"?rr(o,g):Ni(o,v,g,c)}switch(u){case"input":Ml(o,l);break;case"textarea":sa(o,l);break;case"select":var h=o._wrapperState.wasMultiple;o._wrapperState.wasMultiple=!!l.multiple;var k=l.value;k!=null?vn(o,!!l.multiple,k,!1):h!==!!l.multiple&&(l.defaultValue!=null?vn(o,!!l.multiple,l.defaultValue,!0):vn(o,!!l.multiple,l.multiple?[]:"",!1))}o[fr]=l}catch(S){Z(e,e.return,S)}}break;case 6:if($e(t,e),We(e),r&4){if(e.stateNode===null)throw Error(w(162));o=e.stateNode,l=e.memoizedProps;try{o.nodeValue=l}catch(S){Z(e,e.return,S)}}break;case 3:if($e(t,e),We(e),r&4&&n!==null&&n.memoizedState.isDehydrated)try{ur(t.containerInfo)}catch(S){Z(e,e.return,S)}break;case 4:$e(t,e),We(e);break;case 13:$e(t,e),We(e),o=e.child,o.flags&8192&&(l=o.memoizedState!==null,o.stateNode.isHidden=l,!l||o.alternate!==null&&o.alternate.memoizedState!==null||(lu=q())),r&4&&Es(e);break;case 22:if(v=n!==null&&n.memoizedState!==null,e.mode&1?(ce=(c=ce)||v,$e(t,e),ce=c):$e(t,e),We(e),r&8192){if(c=e.memoizedState!==null,(e.stateNode.isHidden=c)&&!v&&e.mode&1)for(N=e,v=e.child;v!==null;){for(g=N=v;N!==null;){switch(h=N,k=h.child,h.tag){case 0:case 11:case 14:case 15:bn(4,h,h.return);break;case 1:hn(h,h.return);var y=h.stateNode;if(typeof y.componentWillUnmount=="function"){r=h,n=h.return;try{t=r,y.props=t.memoizedProps,y.state=t.memoizedState,y.componentWillUnmount()}catch(S){Z(r,n,S)}}break;case 5:hn(h,h.return);break;case 22:if(h.memoizedState!==null){Ns(g);continue}}k!==null?(k.return=h,N=k):Ns(g)}v=v.sibling}e:for(v=null,g=e;;){if(g.tag===5){if(v===null){v=g;try{o=g.stateNode,c?(l=o.style,typeof l.setProperty=="function"?l.setProperty("display","none","important"):l.display="none"):(u=g.stateNode,s=g.memoizedProps.style,i=s!=null&&s.hasOwnProperty("display")?s.display:null,u.style.display=da("display",i))}catch(S){Z(e,e.return,S)}}}else if(g.tag===6){if(v===null)try{g.stateNode.nodeValue=c?"":g.memoizedProps}catch(S){Z(e,e.return,S)}}else if((g.tag!==22&&g.tag!==23||g.memoizedState===null||g===e)&&g.child!==null){g.child.return=g,g=g.child;continue}if(g===e)break e;for(;g.sibling===null;){if(g.return===null||g.return===e)break e;v===g&&(v=null),g=g.return}v===g&&(v=null),g.sibling.return=g.return,g=g.sibling}}break;case 19:$e(t,e),We(e),r&4&&Es(e);break;case 21:break;default:$e(t,e),We(e)}}function We(e){var t=e.flags;if(t&2){try{e:{for(var n=e.return;n!==null;){if(Fc(n)){var r=n;break e}n=n.return}throw Error(w(160))}switch(r.tag){case 5:var o=r.stateNode;r.flags&32&&(rr(o,""),r.flags&=-33);var l=_s(e);hi(e,l,o);break;case 3:case 4:var i=r.stateNode.containerInfo,u=_s(e);mi(e,u,i);break;default:throw Error(w(161))}}catch(s){Z(e,e.return,s)}e.flags&=-3}t&4096&&(e.flags&=-4097)}function jp(e,t,n){N=e,Ac(e)}function Ac(e,t,n){for(var r=(e.mode&1)!==0;N!==null;){var o=N,l=o.child;if(o.tag===22&&r){var i=o.memoizedState!==null||Ar;if(!i){var u=o.alternate,s=u!==null&&u.memoizedState!==null||ce;u=Ar;var c=ce;if(Ar=i,(ce=s)&&!c)for(N=o;N!==null;)i=N,s=i.child,i.tag===22&&i.memoizedState!==null?zs(o):s!==null?(s.return=i,N=s):zs(o);for(;l!==null;)N=l,Ac(l),l=l.sibling;N=o,Ar=u,ce=c}Cs(e)}else o.subtreeFlags&8772&&l!==null?(l.return=o,N=l):Cs(e)}}function Cs(e){for(;N!==null;){var t=N;if(t.flags&8772){var n=t.alternate;try{if(t.flags&8772)switch(t.tag){case 0:case 11:case 15:ce||$o(5,t);break;case 1:var r=t.stateNode;if(t.flags&4&&!ce)if(n===null)r.componentDidMount();else{var o=t.elementType===t.type?n.memoizedProps:Ue(t.type,n.memoizedProps);r.componentDidUpdate(o,n.memoizedState,r.__reactInternalSnapshotBeforeUpdate)}var l=t.updateQueue;l!==null&&as(t,l,r);break;case 3:var i=t.updateQueue;if(i!==null){if(n=null,t.child!==null)switch(t.child.tag){case 5:n=t.child.stateNode;break;case 1:n=t.child.stateNode}as(t,i,n)}break;case 5:var u=t.stateNode;if(n===null&&t.flags&4){n=u;var s=t.memoizedProps;switch(t.type){case"button":case"input":case"select":case"textarea":s.autoFocus&&n.focus();break;case"img":s.src&&(n.src=s.src)}}break;case 6:break;case 4:break;case 12:break;case 13:if(t.memoizedState===null){var c=t.alternate;if(c!==null){var v=c.memoizedState;if(v!==null){var g=v.dehydrated;g!==null&&ur(g)}}}break;case 19:case 17:case 21:case 22:case 23:case 25:break;default:throw Error(w(163))}ce||t.flags&512&&pi(t)}catch(h){Z(t,t.return,h)}}if(t===e){N=null;break}if(n=t.sibling,n!==null){n.return=t.return,N=n;break}N=t.return}}function Ns(e){for(;N!==null;){var t=N;if(t===e){N=null;break}var n=t.sibling;if(n!==null){n.return=t.return,N=n;break}N=t.return}}function zs(e){for(;N!==null;){var t=N;try{switch(t.tag){case 0:case 11:case 15:var n=t.return;try{$o(4,t)}catch(s){Z(t,n,s)}break;case 1:var r=t.stateNode;if(typeof r.componentDidMount=="function"){var o=t.return;try{r.componentDidMount()}catch(s){Z(t,o,s)}}var l=t.return;try{pi(t)}catch(s){Z(t,l,s)}break;case 5:var i=t.return;try{pi(t)}catch(s){Z(t,i,s)}}}catch(s){Z(t,t.return,s)}if(t===e){N=null;break}var u=t.sibling;if(u!==null){u.return=t.return,N=u;break}N=t.return}}var Tp=Math.ceil,So=dt.ReactCurrentDispatcher,ru=dt.ReactCurrentOwner,Re=dt.ReactCurrentBatchConfig,D=0,oe=null,b=null,ie=0,Ee=0,gn=It(0),te=0,yr=null,Xt=0,Uo=0,ou=0,er=null,ye=null,lu=0,Tn=1/0,et=null,_o=!1,gi=null,Nt=null,Br=!1,wt=null,Eo=0,tr=0,vi=null,br=-1,eo=0;function me(){return D&6?q():br!==-1?br:br=q()}function zt(e){return e.mode&1?D&2&&ie!==0?ie&-ie:pp.transition!==null?(eo===0&&(eo=Ea()),eo):(e=F,e!==0||(e=window.event,e=e===void 0?16:La(e.type)),e):1}function Qe(e,t,n,r){if(50<tr)throw tr=0,vi=null,Error(w(185));wr(e,n,r),(!(D&2)||e!==oe)&&(e===oe&&(!(D&2)&&(Uo|=n),te===4&&yt(e,ie)),Se(e,r),n===1&&D===0&&!(t.mode&1)&&(Tn=q()+500,Ro&&Ot()))}function Se(e,t){var n=e.callbackNode;pf(e,t);var r=io(e,e===oe?ie:0);if(r===0)n!==null&&Du(n),e.callbackNode=null,e.callbackPriority=0;else if(t=r&-r,e.callbackPriority!==t){if(n!=null&&Du(n),t===1)e.tag===0?fp(Ps.bind(null,e)):Ga(Ps.bind(null,e)),sp(function(){!(D&6)&&Ot()}),n=null;else{switch(Ca(r)){case 1:n=Li;break;case 4:n=Sa;break;case 16:n=lo;break;case 536870912:n=_a;break;default:n=lo}n=Xc(n,Bc.bind(null,e))}e.callbackPriority=t,e.callbackNode=n}}function Bc(e,t){if(br=-1,eo=0,D&6)throw Error(w(327));var n=e.callbackNode;if(Sn()&&e.callbackNode!==n)return null;var r=io(e,e===oe?ie:0);if(r===0)return null;if(r&30||r&e.expiredLanes||t)t=Co(e,r);else{t=r;var o=D;D|=2;var l=Qc();(oe!==e||ie!==t)&&(et=null,Tn=q()+500,Qt(e,t));do try{Op();break}catch(u){Vc(e,u)}while(1);Hi(),So.current=l,D=o,b!==null?t=0:(oe=null,ie=0,t=te)}if(t!==0){if(t===2&&(o=Hl(e),o!==0&&(r=o,t=yi(e,o))),t===1)throw n=yr,Qt(e,0),yt(e,r),Se(e,q()),n;if(t===6)yt(e,r);else{if(o=e.current.alternate,!(r&30)&&!Lp(o)&&(t=Co(e,r),t===2&&(l=Hl(e),l!==0&&(r=l,t=yi(e,l))),t===1))throw n=yr,Qt(e,0),yt(e,r),Se(e,q()),n;switch(e.finishedWork=o,e.finishedLanes=r,t){case 0:case 1:throw Error(w(345));case 2:Ut(e,ye,et);break;case 3:if(yt(e,r),(r&130023424)===r&&(t=lu+500-q(),10<t)){if(io(e,0)!==0)break;if(o=e.suspendedLanes,(o&r)!==r){me(),e.pingedLanes|=e.suspendedLanes&o;break}e.timeoutHandle=ql(Ut.bind(null,e,ye,et),t);break}Ut(e,ye,et);break;case 4:if(yt(e,r),(r&4194240)===r)break;for(t=e.eventTimes,o=-1;0<r;){var i=31-Ve(r);l=1<<i,i=t[i],i>o&&(o=i),r&=~l}if(r=o,r=q()-r,r=(120>r?120:480>r?480:1080>r?1080:1920>r?1920:3e3>r?3e3:4320>r?4320:1960*Tp(r/1960))-r,10<r){e.timeoutHandle=ql(Ut.bind(null,e,ye,et),r);break}Ut(e,ye,et);break;case 5:Ut(e,ye,et);break;default:throw Error(w(329))}}}return Se(e,q()),e.callbackNode===n?Bc.bind(null,e):null}function yi(e,t){var n=er;return e.current.memoizedState.isDehydrated&&(Qt(e,t).flags|=256),e=Co(e,t),e!==2&&(t=ye,ye=n,t!==null&&xi(t)),e}function xi(e){ye===null?ye=e:ye.push.apply(ye,e)}function Lp(e){for(var t=e;;){if(t.flags&16384){var n=t.updateQueue;if(n!==null&&(n=n.stores,n!==null))for(var r=0;r<n.length;r++){var o=n[r],l=o.getSnapshot;o=o.value;try{if(!He(l(),o))return!1}catch{return!1}}}if(n=t.child,t.subtreeFlags&16384&&n!==null)n.return=t,t=n;else{if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return!0;t=t.return}t.sibling.return=t.return,t=t.sibling}}return!0}function yt(e,t){for(t&=~ou,t&=~Uo,e.suspendedLanes|=t,e.pingedLanes&=~t,e=e.expirationTimes;0<t;){var n=31-Ve(t),r=1<<n;e[n]=-1,t&=~r}}function Ps(e){if(D&6)throw Error(w(327));Sn();var t=io(e,0);if(!(t&1))return Se(e,q()),null;var n=Co(e,t);if(e.tag!==0&&n===2){var r=Hl(e);r!==0&&(t=r,n=yi(e,r))}if(n===1)throw n=yr,Qt(e,0),yt(e,t),Se(e,q()),n;if(n===6)throw Error(w(345));return e.finishedWork=e.current.alternate,e.finishedLanes=t,Ut(e,ye,et),Se(e,q()),null}function iu(e,t){var n=D;D|=1;try{return e(t)}finally{D=n,D===0&&(Tn=q()+500,Ro&&Ot())}}function Jt(e){wt!==null&&wt.tag===0&&!(D&6)&&Sn();var t=D;D|=1;var n=Re.transition,r=F;try{if(Re.transition=null,F=1,e)return e()}finally{F=r,Re.transition=n,D=t,!(D&6)&&Ot()}}function uu(){Ee=gn.current,V(gn)}function Qt(e,t){e.finishedWork=null,e.finishedLanes=0;var n=e.timeoutHandle;if(n!==-1&&(e.timeoutHandle=-1,up(n)),b!==null)for(n=b.return;n!==null;){var r=n;switch(Bi(r),r.tag){case 1:r=r.type.childContextTypes,r!=null&&fo();break;case 3:Pn(),V(we),V(de),Gi();break;case 5:Ji(r);break;case 4:Pn();break;case 13:V(K);break;case 19:V(K);break;case 10:Wi(r.type._context);break;case 22:case 23:uu()}n=n.return}if(oe=e,b=e=Pt(e.current,null),ie=Ee=t,te=0,yr=null,ou=Uo=Xt=0,ye=er=null,Bt!==null){for(t=0;t<Bt.length;t++)if(n=Bt[t],r=n.interleaved,r!==null){n.interleaved=null;var o=r.next,l=n.pending;if(l!==null){var i=l.next;l.next=o,r.next=i}n.pending=r}Bt=null}return e}function Vc(e,t){do{var n=b;try{if(Hi(),Gr.current=ko,wo){for(var r=Y.memoizedState;r!==null;){var o=r.queue;o!==null&&(o.pending=null),r=r.next}wo=!1}if(Yt=0,re=ee=Y=null,qn=!1,hr=0,ru.current=null,n===null||n.return===null){te=1,yr=t,b=null;break}e:{var l=e,i=n.return,u=n,s=t;if(t=ie,u.flags|=32768,s!==null&&typeof s=="object"&&typeof s.then=="function"){var c=s,v=u,g=v.tag;if(!(v.mode&1)&&(g===0||g===11||g===15)){var h=v.alternate;h?(v.updateQueue=h.updateQueue,v.memoizedState=h.memoizedState,v.lanes=h.lanes):(v.updateQueue=null,v.memoizedState=null)}var k=hs(i);if(k!==null){k.flags&=-257,gs(k,i,u,l,t),k.mode&1&&ms(l,c,t),t=k,s=c;var y=t.updateQueue;if(y===null){var S=new Set;S.add(s),t.updateQueue=S}else y.add(s);break e}else{if(!(t&1)){ms(l,c,t),su();break e}s=Error(w(426))}}else if(H&&u.mode&1){var $=hs(i);if($!==null){!($.flags&65536)&&($.flags|=256),gs($,i,u,l,t),Vi(jn(s,u));break e}}l=s=jn(s,u),te!==4&&(te=2),er===null?er=[l]:er.push(l),l=i;do{switch(l.tag){case 3:l.flags|=65536,t&=-t,l.lanes|=t;var d=Cc(l,s,t);ss(l,d);break e;case 1:u=s;var a=l.type,f=l.stateNode;if(!(l.flags&128)&&(typeof a.getDerivedStateFromError=="function"||f!==null&&typeof f.componentDidCatch=="function"&&(Nt===null||!Nt.has(f)))){l.flags|=65536,t&=-t,l.lanes|=t;var x=Nc(l,u,t);ss(l,x);break e}}l=l.return}while(l!==null)}Wc(n)}catch(E){t=E,b===n&&n!==null&&(b=n=n.return);continue}break}while(1)}function Qc(){var e=So.current;return So.current=ko,e===null?ko:e}function su(){(te===0||te===3||te===2)&&(te=4),oe===null||!(Xt&268435455)&&!(Uo&268435455)||yt(oe,ie)}function Co(e,t){var n=D;D|=2;var r=Qc();(oe!==e||ie!==t)&&(et=null,Qt(e,t));do try{Ip();break}catch(o){Vc(e,o)}while(1);if(Hi(),D=n,So.current=r,b!==null)throw Error(w(261));return oe=null,ie=0,te}function Ip(){for(;b!==null;)Hc(b)}function Op(){for(;b!==null&&!rf();)Hc(b)}function Hc(e){var t=Yc(e.alternate,e,Ee);e.memoizedProps=e.pendingProps,t===null?Wc(e):b=t,ru.current=null}function Wc(e){var t=e;do{var n=t.alternate;if(e=t.return,t.flags&32768){if(n=Np(n,t),n!==null){n.flags&=32767,b=n;return}if(e!==null)e.flags|=32768,e.subtreeFlags=0,e.deletions=null;else{te=6,b=null;return}}else if(n=Cp(n,t,Ee),n!==null){b=n;return}if(t=t.sibling,t!==null){b=t;return}b=t=e}while(t!==null);te===0&&(te=5)}function Ut(e,t,n){var r=F,o=Re.transition;try{Re.transition=null,F=1,Mp(e,t,n,r)}finally{Re.transition=o,F=r}return null}function Mp(e,t,n,r){do Sn();while(wt!==null);if(D&6)throw Error(w(327));n=e.finishedWork;var o=e.finishedLanes;if(n===null)return null;if(e.finishedWork=null,e.finishedLanes=0,n===e.current)throw Error(w(177));e.callbackNode=null,e.callbackPriority=0;var l=n.lanes|n.childLanes;if(mf(e,l),e===oe&&(b=oe=null,ie=0),!(n.subtreeFlags&2064)&&!(n.flags&2064)||Br||(Br=!0,Xc(lo,function(){return Sn(),null})),l=(n.flags&15990)!==0,n.subtreeFlags&15990||l){l=Re.transition,Re.transition=null;var i=F;F=1;var u=D;D|=4,ru.current=null,Pp(e,n),Uc(n,e),ep(Gl),uo=!!Jl,Gl=Jl=null,e.current=n,jp(n),of(),D=u,F=i,Re.transition=l}else e.current=n;if(Br&&(Br=!1,wt=e,Eo=o),l=e.pendingLanes,l===0&&(Nt=null),sf(n.stateNode),Se(e,q()),t!==null)for(r=e.onRecoverableError,n=0;n<t.length;n++)o=t[n],r(o.value,{componentStack:o.stack,digest:o.digest});if(_o)throw _o=!1,e=gi,gi=null,e;return Eo&1&&e.tag!==0&&Sn(),l=e.pendingLanes,l&1?e===vi?tr++:(tr=0,vi=e):tr=0,Ot(),null}function Sn(){if(wt!==null){var e=Ca(Eo),t=Re.transition,n=F;try{if(Re.transition=null,F=16>e?16:e,wt===null)var r=!1;else{if(e=wt,wt=null,Eo=0,D&6)throw Error(w(331));var o=D;for(D|=4,N=e.current;N!==null;){var l=N,i=l.child;if(N.flags&16){var u=l.deletions;if(u!==null){for(var s=0;s<u.length;s++){var c=u[s];for(N=c;N!==null;){var v=N;switch(v.tag){case 0:case 11:case 15:bn(8,v,l)}var g=v.child;if(g!==null)g.return=v,N=g;else for(;N!==null;){v=N;var h=v.sibling,k=v.return;if(Dc(v),v===c){N=null;break}if(h!==null){h.return=k,N=h;break}N=k}}}var y=l.alternate;if(y!==null){var S=y.child;if(S!==null){y.child=null;do{var $=S.sibling;S.sibling=null,S=$}while(S!==null)}}N=l}}if(l.subtreeFlags&2064&&i!==null)i.return=l,N=i;else e:for(;N!==null;){if(l=N,l.flags&2048)switch(l.tag){case 0:case 11:case 15:bn(9,l,l.return)}var d=l.sibling;if(d!==null){d.return=l.return,N=d;break e}N=l.return}}var a=e.current;for(N=a;N!==null;){i=N;var f=i.child;if(i.subtreeFlags&2064&&f!==null)f.return=i,N=f;else e:for(i=a;N!==null;){if(u=N,u.flags&2048)try{switch(u.tag){case 0:case 11:case 15:$o(9,u)}}catch(E){Z(u,u.return,E)}if(u===i){N=null;break e}var x=u.sibling;if(x!==null){x.return=u.return,N=x;break e}N=u.return}}if(D=o,Ot(),Je&&typeof Je.onPostCommitFiberRoot=="function")try{Je.onPostCommitFiberRoot(To,e)}catch{}r=!0}return r}finally{F=n,Re.transition=t}}return!1}function js(e,t,n){t=jn(n,t),t=Cc(e,t,1),e=Ct(e,t,1),t=me(),e!==null&&(wr(e,1,t),Se(e,t))}function Z(e,t,n){if(e.tag===3)js(e,e,n);else for(;t!==null;){if(t.tag===3){js(t,e,n);break}else if(t.tag===1){var r=t.stateNode;if(typeof t.type.getDerivedStateFromError=="function"||typeof r.componentDidCatch=="function"&&(Nt===null||!Nt.has(r))){e=jn(n,e),e=Nc(t,e,1),t=Ct(t,e,1),e=me(),t!==null&&(wr(t,1,e),Se(t,e));break}}t=t.return}}function Rp(e,t,n){var r=e.pingCache;r!==null&&r.delete(t),t=me(),e.pingedLanes|=e.suspendedLanes&n,oe===e&&(ie&n)===n&&(te===4||te===3&&(ie&130023424)===ie&&500>q()-lu?Qt(e,0):ou|=n),Se(e,t)}function Kc(e,t){t===0&&(e.mode&1?(t=Lr,Lr<<=1,!(Lr&130023424)&&(Lr=4194304)):t=1);var n=me();e=at(e,t),e!==null&&(wr(e,t,n),Se(e,n))}function Dp(e){var t=e.memoizedState,n=0;t!==null&&(n=t.retryLane),Kc(e,n)}function Fp(e,t){var n=0;switch(e.tag){case 13:var r=e.stateNode,o=e.memoizedState;o!==null&&(n=o.retryLane);break;case 19:r=e.stateNode;break;default:throw Error(w(314))}r!==null&&r.delete(t),Kc(e,n)}var Yc;Yc=function(e,t,n){if(e!==null)if(e.memoizedProps!==t.pendingProps||we.current)xe=!0;else{if(!(e.lanes&n)&&!(t.flags&128))return xe=!1,Ep(e,t,n);xe=!!(e.flags&131072)}else xe=!1,H&&t.flags&1048576&&Za(t,ho,t.index);switch(t.lanes=0,t.tag){case 2:var r=t.type;qr(e,t),e=t.pendingProps;var o=Cn(t,de.current);kn(t,n),o=qi(null,t,r,e,o,n);var l=bi();return t.flags|=1,typeof o=="object"&&o!==null&&typeof o.render=="function"&&o.$$typeof===void 0?(t.tag=1,t.memoizedState=null,t.updateQueue=null,ke(r)?(l=!0,po(t)):l=!1,t.memoizedState=o.state!==null&&o.state!==void 0?o.state:null,Yi(t),o.updater=Fo,t.stateNode=o,o._reactInternals=t,li(t,r,e,n),t=si(null,t,r,!0,l,n)):(t.tag=0,H&&l&&Ai(t),pe(null,t,o,n),t=t.child),t;case 16:r=t.elementType;e:{switch(qr(e,t),e=t.pendingProps,o=r._init,r=o(r._payload),t.type=r,o=t.tag=Up(r),e=Ue(r,e),o){case 0:t=ui(null,t,r,e,n);break e;case 1:t=xs(null,t,r,e,n);break e;case 11:t=vs(null,t,r,e,n);break e;case 14:t=ys(null,t,r,Ue(r.type,e),n);break e}throw Error(w(306,r,""))}return t;case 0:return r=t.type,o=t.pendingProps,o=t.elementType===r?o:Ue(r,o),ui(e,t,r,o,n);case 1:return r=t.type,o=t.pendingProps,o=t.elementType===r?o:Ue(r,o),xs(e,t,r,o,n);case 3:e:{if(Tc(t),e===null)throw Error(w(387));r=t.pendingProps,l=t.memoizedState,o=l.element,rc(e,t),yo(t,r,null,n);var i=t.memoizedState;if(r=i.element,l.isDehydrated)if(l={element:r,isDehydrated:!1,cache:i.cache,pendingSuspenseBoundaries:i.pendingSuspenseBoundaries,transitions:i.transitions},t.updateQueue.baseState=l,t.memoizedState=l,t.flags&256){o=jn(Error(w(423)),t),t=ws(e,t,r,n,o);break e}else if(r!==o){o=jn(Error(w(424)),t),t=ws(e,t,r,n,o);break e}else for(Ce=Et(t.stateNode.containerInfo.firstChild),Ne=t,H=!0,Be=null,n=tc(t,null,r,n),t.child=n;n;)n.flags=n.flags&-3|4096,n=n.sibling;else{if(Nn(),r===o){t=ct(e,t,n);break e}pe(e,t,r,n)}t=t.child}return t;case 5:return oc(t),e===null&&ni(t),r=t.type,o=t.pendingProps,l=e!==null?e.memoizedProps:null,i=o.children,Zl(r,o)?i=null:l!==null&&Zl(r,l)&&(t.flags|=32),jc(e,t),pe(e,t,i,n),t.child;case 6:return e===null&&ni(t),null;case 13:return Lc(e,t,n);case 4:return Xi(t,t.stateNode.containerInfo),r=t.pendingProps,e===null?t.child=zn(t,null,r,n):pe(e,t,r,n),t.child;case 11:return r=t.type,o=t.pendingProps,o=t.elementType===r?o:Ue(r,o),vs(e,t,r,o,n);case 7:return pe(e,t,t.pendingProps,n),t.child;case 8:return pe(e,t,t.pendingProps.children,n),t.child;case 12:return pe(e,t,t.pendingProps.children,n),t.child;case 10:e:{if(r=t.type._context,o=t.pendingProps,l=t.memoizedProps,i=o.value,A(go,r._currentValue),r._currentValue=i,l!==null)if(He(l.value,i)){if(l.children===o.children&&!we.current){t=ct(e,t,n);break e}}else for(l=t.child,l!==null&&(l.return=t);l!==null;){var u=l.dependencies;if(u!==null){i=l.child;for(var s=u.firstContext;s!==null;){if(s.context===r){if(l.tag===1){s=it(-1,n&-n),s.tag=2;var c=l.updateQueue;if(c!==null){c=c.shared;var v=c.pending;v===null?s.next=s:(s.next=v.next,v.next=s),c.pending=s}}l.lanes|=n,s=l.alternate,s!==null&&(s.lanes|=n),ri(l.return,n,t),u.lanes|=n;break}s=s.next}}else if(l.tag===10)i=l.type===t.type?null:l.child;else if(l.tag===18){if(i=l.return,i===null)throw Error(w(341));i.lanes|=n,u=i.alternate,u!==null&&(u.lanes|=n),ri(i,n,t),i=l.sibling}else i=l.child;if(i!==null)i.return=l;else for(i=l;i!==null;){if(i===t){i=null;break}if(l=i.sibling,l!==null){l.return=i.return,i=l;break}i=i.return}l=i}pe(e,t,o.children,n),t=t.child}return t;case 9:return o=t.type,r=t.pendingProps.children,kn(t,n),o=De(o),r=r(o),t.flags|=1,pe(e,t,r,n),t.child;case 14:return r=t.type,o=Ue(r,t.pendingProps),o=Ue(r.type,o),ys(e,t,r,o,n);case 15:return zc(e,t,t.type,t.pendingProps,n);case 17:return r=t.type,o=t.pendingProps,o=t.elementType===r?o:Ue(r,o),qr(e,t),t.tag=1,ke(r)?(e=!0,po(t)):e=!1,kn(t,n),Ec(t,r,o),li(t,r,o,n),si(null,t,r,!0,e,n);case 19:return Ic(e,t,n);case 22:return Pc(e,t,n)}throw Error(w(156,t.tag))};function Xc(e,t){return ka(e,t)}function $p(e,t,n,r){this.tag=e,this.key=n,this.sibling=this.child=this.return=this.stateNode=this.type=this.elementType=null,this.index=0,this.ref=null,this.pendingProps=t,this.dependencies=this.memoizedState=this.updateQueue=this.memoizedProps=null,this.mode=r,this.subtreeFlags=this.flags=0,this.deletions=null,this.childLanes=this.lanes=0,this.alternate=null}function Me(e,t,n,r){return new $p(e,t,n,r)}function au(e){return e=e.prototype,!(!e||!e.isReactComponent)}function Up(e){if(typeof e=="function")return au(e)?1:0;if(e!=null){if(e=e.$$typeof,e===Pi)return 11;if(e===ji)return 14}return 2}function Pt(e,t){var n=e.alternate;return n===null?(n=Me(e.tag,t,e.key,e.mode),n.elementType=e.elementType,n.type=e.type,n.stateNode=e.stateNode,n.alternate=e,e.alternate=n):(n.pendingProps=t,n.type=e.type,n.flags=0,n.subtreeFlags=0,n.deletions=null),n.flags=e.flags&14680064,n.childLanes=e.childLanes,n.lanes=e.lanes,n.child=e.child,n.memoizedProps=e.memoizedProps,n.memoizedState=e.memoizedState,n.updateQueue=e.updateQueue,t=e.dependencies,n.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext},n.sibling=e.sibling,n.index=e.index,n.ref=e.ref,n}function to(e,t,n,r,o,l){var i=2;if(r=e,typeof e=="function")au(e)&&(i=1);else if(typeof e=="string")i=5;else e:switch(e){case ln:return Ht(n.children,o,l,t);case zi:i=8,o|=8;break;case jl:return e=Me(12,n,t,o|2),e.elementType=jl,e.lanes=l,e;case Tl:return e=Me(13,n,t,o),e.elementType=Tl,e.lanes=l,e;case Ll:return e=Me(19,n,t,o),e.elementType=Ll,e.lanes=l,e;case oa:return Ao(n,o,l,t);default:if(typeof e=="object"&&e!==null)switch(e.$$typeof){case na:i=10;break e;case ra:i=9;break e;case Pi:i=11;break e;case ji:i=14;break e;case ht:i=16,r=null;break e}throw Error(w(130,e==null?e:typeof e,""))}return t=Me(i,n,t,o),t.elementType=e,t.type=r,t.lanes=l,t}function Ht(e,t,n,r){return e=Me(7,e,r,t),e.lanes=n,e}function Ao(e,t,n,r){return e=Me(22,e,r,t),e.elementType=oa,e.lanes=n,e.stateNode={isHidden:!1},e}function Cl(e,t,n){return e=Me(6,e,null,t),e.lanes=n,e}function Nl(e,t,n){return t=Me(4,e.children!==null?e.children:[],e.key,t),t.lanes=n,t.stateNode={containerInfo:e.containerInfo,pendingChildren:null,implementation:e.implementation},t}function Ap(e,t,n,r,o){this.tag=t,this.containerInfo=e,this.finishedWork=this.pingCache=this.current=this.pendingChildren=null,this.timeoutHandle=-1,this.callbackNode=this.pendingContext=this.context=null,this.callbackPriority=0,this.eventTimes=il(0),this.expirationTimes=il(-1),this.entangledLanes=this.finishedLanes=this.mutableReadLanes=this.expiredLanes=this.pingedLanes=this.suspendedLanes=this.pendingLanes=0,this.entanglements=il(0),this.identifierPrefix=r,this.onRecoverableError=o,this.mutableSourceEagerHydrationData=null}function cu(e,t,n,r,o,l,i,u,s){return e=new Ap(e,t,n,u,s),t===1?(t=1,l===!0&&(t|=8)):t=0,l=Me(3,null,null,t),e.current=l,l.stateNode=e,l.memoizedState={element:r,isDehydrated:n,cache:null,transitions:null,pendingSuspenseBoundaries:null},Yi(l),e}function Bp(e,t,n){var r=3<arguments.length&&arguments[3]!==void 0?arguments[3]:null;return{$$typeof:on,key:r==null?null:""+r,children:e,containerInfo:t,implementation:n}}function Jc(e){if(!e)return Tt;e=e._reactInternals;e:{if(Zt(e)!==e||e.tag!==1)throw Error(w(170));var t=e;do{switch(t.tag){case 3:t=t.stateNode.context;break e;case 1:if(ke(t.type)){t=t.stateNode.__reactInternalMemoizedMergedChildContext;break e}}t=t.return}while(t!==null);throw Error(w(171))}if(e.tag===1){var n=e.type;if(ke(n))return Ja(e,n,t)}return t}function Gc(e,t,n,r,o,l,i,u,s){return e=cu(n,r,!0,e,o,l,i,u,s),e.context=Jc(null),n=e.current,r=me(),o=zt(n),l=it(r,o),l.callback=t??null,Ct(n,l,o),e.current.lanes=o,wr(e,o,r),Se(e,r),e}function Bo(e,t,n,r){var o=t.current,l=me(),i=zt(o);return n=Jc(n),t.context===null?t.context=n:t.pendingContext=n,t=it(l,i),t.payload={element:e},r=r===void 0?null:r,r!==null&&(t.callback=r),e=Ct(o,t,i),e!==null&&(Qe(e,o,i,l),Jr(e,o,i)),i}function No(e){if(e=e.current,!e.child)return null;switch(e.child.tag){case 5:return e.child.stateNode;default:return e.child.stateNode}}function Ts(e,t){if(e=e.memoizedState,e!==null&&e.dehydrated!==null){var n=e.retryLane;e.retryLane=n!==0&&n<t?n:t}}function du(e,t){Ts(e,t),(e=e.alternate)&&Ts(e,t)}function Vp(){return null}var Zc=typeof reportError=="function"?reportError:function(e){console.error(e)};function fu(e){this._internalRoot=e}Vo.prototype.render=fu.prototype.render=function(e){var t=this._internalRoot;if(t===null)throw Error(w(409));Bo(e,t,null,null)};Vo.prototype.unmount=fu.prototype.unmount=function(){var e=this._internalRoot;if(e!==null){this._internalRoot=null;var t=e.containerInfo;Jt(function(){Bo(null,e,null,null)}),t[st]=null}};function Vo(e){this._internalRoot=e}Vo.prototype.unstable_scheduleHydration=function(e){if(e){var t=Pa();e={blockedOn:null,target:e,priority:t};for(var n=0;n<vt.length&&t!==0&&t<vt[n].priority;n++);vt.splice(n,0,e),n===0&&Ta(e)}};function pu(e){return!(!e||e.nodeType!==1&&e.nodeType!==9&&e.nodeType!==11)}function Qo(e){return!(!e||e.nodeType!==1&&e.nodeType!==9&&e.nodeType!==11&&(e.nodeType!==8||e.nodeValue!==" react-mount-point-unstable "))}function Ls(){}function Qp(e,t,n,r,o){if(o){if(typeof r=="function"){var l=r;r=function(){var c=No(i);l.call(c)}}var i=Gc(t,r,e,0,null,!1,!1,"",Ls);return e._reactRootContainer=i,e[st]=i.current,cr(e.nodeType===8?e.parentNode:e),Jt(),i}for(;o=e.lastChild;)e.removeChild(o);if(typeof r=="function"){var u=r;r=function(){var c=No(s);u.call(c)}}var s=cu(e,0,!1,null,null,!1,!1,"",Ls);return e._reactRootContainer=s,e[st]=s.current,cr(e.nodeType===8?e.parentNode:e),Jt(function(){Bo(t,s,n,r)}),s}function Ho(e,t,n,r,o){var l=n._reactRootContainer;if(l){var i=l;if(typeof o=="function"){var u=o;o=function(){var s=No(i);u.call(s)}}Bo(t,i,e,o)}else i=Qp(n,t,e,o,r);return No(i)}Na=function(e){switch(e.tag){case 3:var t=e.stateNode;if(t.current.memoizedState.isDehydrated){var n=Wn(t.pendingLanes);n!==0&&(Ii(t,n|1),Se(t,q()),!(D&6)&&(Tn=q()+500,Ot()))}break;case 13:Jt(function(){var r=at(e,1);if(r!==null){var o=me();Qe(r,e,1,o)}}),du(e,1)}};Oi=function(e){if(e.tag===13){var t=at(e,134217728);if(t!==null){var n=me();Qe(t,e,134217728,n)}du(e,134217728)}};za=function(e){if(e.tag===13){var t=zt(e),n=at(e,t);if(n!==null){var r=me();Qe(n,e,t,r)}du(e,t)}};Pa=function(){return F};ja=function(e,t){var n=F;try{return F=e,t()}finally{F=n}};Bl=function(e,t,n){switch(t){case"input":if(Ml(e,n),t=n.name,n.type==="radio"&&t!=null){for(n=e;n.parentNode;)n=n.parentNode;for(n=n.querySelectorAll("input[name="+JSON.stringify(""+t)+'][type="radio"]'),t=0;t<n.length;t++){var r=n[t];if(r!==e&&r.form===e.form){var o=Mo(r);if(!o)throw Error(w(90));ia(r),Ml(r,o)}}}break;case"textarea":sa(e,n);break;case"select":t=n.value,t!=null&&vn(e,!!n.multiple,t,!1)}};ha=iu;ga=Jt;var Hp={usingClientEntryPoint:!1,Events:[Sr,cn,Mo,pa,ma,iu]},Vn={findFiberByHostInstance:At,bundleType:0,version:"18.3.1",rendererPackageName:"react-dom"},Wp={bundleType:Vn.bundleType,version:Vn.version,rendererPackageName:Vn.rendererPackageName,rendererConfig:Vn.rendererConfig,overrideHookState:null,overrideHookStateDeletePath:null,overrideHookStateRenamePath:null,overrideProps:null,overridePropsDeletePath:null,overridePropsRenamePath:null,setErrorHandler:null,setSuspenseHandler:null,scheduleUpdate:null,currentDispatcherRef:dt.ReactCurrentDispatcher,findHostInstanceByFiber:function(e){return e=xa(e),e===null?null:e.stateNode},findFiberByHostInstance:Vn.findFiberByHostInstance||Vp,findHostInstancesForRefresh:null,scheduleRefresh:null,scheduleRoot:null,setRefreshHandler:null,getCurrentFiber:null,reconcilerVersion:"18.3.1-next-f1338f8080-20240426"};if(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__<"u"){var Vr=__REACT_DEVTOOLS_GLOBAL_HOOK__;if(!Vr.isDisabled&&Vr.supportsFiber)try{To=Vr.inject(Wp),Je=Vr}catch{}}Pe.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=Hp;Pe.createPortal=function(e,t){var n=2<arguments.length&&arguments[2]!==void 0?arguments[2]:null;if(!pu(t))throw Error(w(200));return Bp(e,t,null,n)};Pe.createRoot=function(e,t){if(!pu(e))throw Error(w(299));var n=!1,r="",o=Zc;return t!=null&&(t.unstable_strictMode===!0&&(n=!0),t.identifierPrefix!==void 0&&(r=t.identifierPrefix),t.onRecoverableError!==void 0&&(o=t.onRecoverableError)),t=cu(e,1,!1,null,null,n,!1,r,o),e[st]=t.current,cr(e.nodeType===8?e.parentNode:e),new fu(t)};Pe.findDOMNode=function(e){if(e==null)return null;if(e.nodeType===1)return e;var t=e._reactInternals;if(t===void 0)throw typeof e.render=="function"?Error(w(188)):(e=Object.keys(e).join(","),Error(w(268,e)));return e=xa(t),e=e===null?null:e.stateNode,e};Pe.flushSync=function(e){return Jt(e)};Pe.hydrate=function(e,t,n){if(!Qo(t))throw Error(w(200));return Ho(null,e,t,!0,n)};Pe.hydrateRoot=function(e,t,n){if(!pu(e))throw Error(w(405));var r=n!=null&&n.hydratedSources||null,o=!1,l="",i=Zc;if(n!=null&&(n.unstable_strictMode===!0&&(o=!0),n.identifierPrefix!==void 0&&(l=n.identifierPrefix),n.onRecoverableError!==void 0&&(i=n.onRecoverableError)),t=Gc(t,null,e,1,n??null,o,!1,l,i),e[st]=t.current,cr(e),r)for(e=0;e<r.length;e++)n=r[e],o=n._getVersion,o=o(n._source),t.mutableSourceEagerHydrationData==null?t.mutableSourceEagerHydrationData=[n,o]:t.mutableSourceEagerHydrationData.push(n,o);return new Vo(t)};Pe.render=function(e,t,n){if(!Qo(t))throw Error(w(200));return Ho(null,e,t,!1,n)};Pe.unmountComponentAtNode=function(e){if(!Qo(e))throw Error(w(40));return e._reactRootContainer?(Jt(function(){Ho(null,null,e,!1,function(){e._reactRootContainer=null,e[st]=null})}),!0):!1};Pe.unstable_batchedUpdates=iu;Pe.unstable_renderSubtreeIntoContainer=function(e,t,n,r){if(!Qo(n))throw Error(w(200));if(e==null||e._reactInternals===void 0)throw Error(w(38));return Ho(e,t,n,!1,r)};Pe.version="18.3.1-next-f1338f8080-20240426";function qc(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>"u"||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!="function"))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(qc)}catch(e){console.error(e)}}qc(),qs.exports=Pe;var Kp=qs.exports,bc,Is=Kp;bc=Is.createRoot,Is.hydrateRoot;const ot="https://zdvxowpuklbypweyqqki.supabase.co",zo="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpkdnhvd3B1a2xieXB3ZXlxcWtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5NjI1MzcsImV4cCI6MjA2NjUzODUzN30.noYknWBDdtSkrLuYPRvb_P4-BbAH4qV4ya8bQQp9ijs",Po="motoflow_quote_extension_session";async function lt(e,t){const n=await fetch(e,t),r=await n.json().catch(()=>null);if(!n.ok){const o=(r==null?void 0:r.message)||(r==null?void 0:r.error_description)||(r==null?void 0:r.error)||n.statusText;throw new Error(o)}return r}function Wo(){const e=mu();if(!(e!=null&&e.access_token))throw new Error("Conecta tu usuario de Motoflow.");return{apikey:zo,Authorization:`Bearer ${e.access_token}`,"Content-Type":"application/json"}}async function Os(e){const t=typeof e=="string"?{query:e}:e||{},n=t.query||"",r=t.limit||12,o=t.offset||0,l=t.marca||null,i=t.modelo||null,u=t.includeZeroStock!==!1,s=mu(),c=(s==null?void 0:s.access_token)||zo;return lt(`${ot}/rest/v1/rpc/get_productos_paginados`,{method:"POST",headers:{apikey:zo,Authorization:`Bearer ${c}`,"Content-Type":"application/json"},body:JSON.stringify({p_limit:r,p_offset:o,p_search_term:n,p_marca_filter:l,p_modelo_filter:i,p_include_zero_stock:u})})}function mu(){try{const e=window.localStorage.getItem(Po);if(!e)return null;const t=JSON.parse(e);return t!=null&&t.access_token?t.expires_at&&t.expires_at*1e3<Date.now()?(window.localStorage.removeItem(Po),null):t:null}catch{return null}}async function Yp(e,t){const n=await lt(`${ot}/auth/v1/token?grant_type=password`,{method:"POST",headers:{apikey:zo,"Content-Type":"application/json"},body:JSON.stringify({email:e,password:t})});return window.localStorage.setItem(Po,JSON.stringify(n)),n}function Xp(){window.localStorage.removeItem(Po)}async function Jp(e){const t=Wo(),n=String(e||"").trim();if(!n)return[];const r=[`nombre.ilike.*${n}*`,`telefono.ilike.*${n}*`,`rnc.ilike.*${n}*`,`codigo.ilike.*${n}*`].join(","),o=new URL(`${ot}/rest/v1/clientes`);return o.searchParams.set("select","id,nombre,telefono,rnc,codigo"),o.searchParams.set("activo","eq.true"),o.searchParams.set("or",`(${r})`),o.searchParams.set("order","nombre.asc"),o.searchParams.set("limit","8"),lt(o.toString(),{headers:t})}async function Gp(){const e=Wo(),t=new URL(`${ot}/rest/v1/vendedores`);return t.searchParams.set("select","id,nombre"),t.searchParams.set("activo","eq.true"),t.searchParams.set("order","nombre.asc"),lt(t.toString(),{headers:e})}async function Zp(e){const t=Wo(),n=await lt(`${ot}/rest/v1/rpc/get_next_cotizacion_numero`,{method:"POST",headers:t,body:"{}"}),r=await lt(`${ot}/auth/v1/user`,{headers:t}),o={numero:n,fecha_cotizacion:e.fecha_cotizacion,fecha_vencimiento:e.fecha_vencimiento,cliente_id:e.cliente_id,subtotal:e.subtotal,descuento_total:e.descuento_total||0,itbis_total:e.itbis_total,total_cotizacion:e.total_cotizacion,estado:"Facturando",notas:e.notas||null,usuario_id:(r==null?void 0:r.id)||null,vendedor_id:e.vendedor_id||null,manual_cliente_nombre:e.manual_cliente_nombre||null},[l]=await lt(`${ot}/rest/v1/cotizaciones?select=*`,{method:"POST",headers:{...t,Prefer:"return=representation"},body:JSON.stringify(o)}),i=e.detalles.map(u=>({...u,cotizacion_id:l.id}));return await lt(`${ot}/rest/v1/cotizaciones_detalle`,{method:"POST",headers:t,body:JSON.stringify(i)}),l}async function qp(e){const t=Wo(),n={source:"whatsapp_web_extension",event_type:e.event_type,cliente_id:e.cliente_id||null,vendedor_id:e.vendedor_id||null,cotizacion_id:e.cotizacion_id||null,chat_id:e.chat_id||null,chat_name:e.chat_name||null,customer_name:e.customer_name||null,customer_phone:e.customer_phone||null,status:e.status||null,note:e.note||null,quote_total:e.quote_total||0,items:e.items||[],metadata:e.metadata||{}};return lt(`${ot}/rest/v1/crm_whatsapp_conversation_events`,{method:"POST",headers:t,body:JSON.stringify(n)})}function _n(e){return String(e||"").replace(/\s+/g," ").trim()}function Ms(e){return new Promise(t=>window.setTimeout(t,e))}function Rs(){var i,u;const e=document.querySelector("header"),t=((i=e==null?void 0:e.querySelector("[title]"))==null?void 0:i.getAttribute("title"))||((u=e==null?void 0:e.querySelector('span[dir="auto"]'))==null?void 0:u.textContent)||"",n=_n(t),r=_n(window.location.pathname),o=_n(window.location.hash);return{id:n||o||r||"whatsapp-web",name:n}}function bp(){const e=Array.from(document.querySelectorAll('[contenteditable="true"]'));return e.find(t=>t.getAttribute("data-tab")==="10")||e.find(t=>t.getAttribute("role")==="textbox")||e[e.length-1]||null}async function em(e){const t=bp();if(!t)return!1;t.focus();const n=_n(t.textContent),r=new DataTransfer;r.setData("text/plain",e),t.dispatchEvent(new ClipboardEvent("paste",{bubbles:!0,cancelable:!0,clipboardData:r})),await Ms(120);const o=_n(t.textContent);if(o&&o!==n)return!0;document.execCommand("insertText",!1,e),await Ms(60);const l=_n(t.textContent);return(!l||l===n)&&(t.textContent=e,t.dispatchEvent(new InputEvent("input",{bubbles:!0,inputType:"insertText",data:e}))),!0}const Ye=new Intl.NumberFormat("es-DO",{style:"currency",currency:"DOP",minimumFractionDigits:2}),tm="motoflow_quote_draft:",nm="motoflow_quote_last_sent:",rm="motoflow_quote_meta:",om="motoflow_quote_history:",lm=35,im="2749fa36-3d7c-4bdf-ad61-df88eda8365a",Qr=[{key:"cotizado",label:"Cotizado"},{key:"confirmado",label:"Confirmado"},{key:"pendiente_pago",label:"Pendiente pago"},{key:"delivery",label:"Delivery"},{key:"perdido",label:"Perdido"}];function G(e,t=0){const n=Number(e);return Number.isFinite(n)?n:t}function um(e){const t=G(e.precio??e.precio_venta??e.precio1,0),n=G(e.itbis_pct,.18);return{lineId:`${e.id||e.codigo||Date.now()}-${Date.now()}`,productId:e.id,codigo:e.codigo||"",descripcion:e.descripcion||e.nombre||"Producto",precio:t,cantidad:1,itbisPct:n,existencia:G(e.existencia,0),imagenUrl:e.imagen_url||""}}function Ds(e){return`${tm}${e.id||"sin-chat"}`}function ed(e){return`${nm}${e.id||"sin-chat"}`}function td(e){return`${rm}${e.id||"sin-chat"}`}function nd(e){return`${om}${e.id||"sin-chat"}`}function Fs(e){try{const t=window.localStorage.getItem(ed(e));return t?JSON.parse(t):null}catch{return null}}function zl(e){try{const t=window.localStorage.getItem(td(e));return t?JSON.parse(t):{}}catch{return{}}}function $s(e){try{const t=window.localStorage.getItem(nd(e));return t?JSON.parse(t):[]}catch{return[]}}function sm(e,t){window.localStorage.setItem(nd(e),JSON.stringify(t.slice(0,8)))}function am(e,t,n){return["Hola, esta es tu cotizacion:","",t.map(o=>{const l=G(o.cantidad,1);return`${o.descripcion}  ${l} x ${Ye.format(o.precio)}`}).join(`
`),"",`Total: ${Ye.format(n.total)}`,"","Quedo atento para confirmar disponibilidad y entrega."].join(`
`)}function Ft(e){return e.map(t=>({product_id:t.productId||null,codigo:t.codigo||"",descripcion:t.descripcion,cantidad:G(t.cantidad,1),precio:G(t.precio,0),itbis_pct:G(t.itbisPct,.18),existencia:G(t.existencia,0)}))}function cm(){var xu,wu;const[e,t]=L.useState(!1),[n,r]=L.useState(()=>Rs()),[o,l]=L.useState([]),[i,u]=L.useState(""),[s,c]=L.useState([]),[v,g]=L.useState(!1),[h,k]=L.useState(""),[y,S]=L.useState(()=>mu()),[$,d]=L.useState(""),[a,f]=L.useState(""),[x,E]=L.useState(!1),[P,z]=L.useState(!1),[j,W]=L.useState(""),[O,_e]=L.useState(""),[Ze,Mt]=L.useState(""),[qt,Ko]=L.useState(!0),[bt,en]=L.useState([]),[_,T]=L.useState(!1),[I,Q]=L.useState(!1),[J,Rt]=L.useState(!1),[ne,Dt]=L.useState(()=>Fs(n)),[ve,ft]=L.useState(""),[hu,tn]=L.useState([]),[U,Yo]=L.useState(null),[Mn,Xo]=L.useState(""),[rd,gu]=L.useState([]),[Jo,od]=L.useState(""),[qe,Go]=L.useState(()=>zl(n).internalNote||""),[be,Zo]=L.useState(()=>zl(n).quoteStatus||"cotizado"),[qo,bo]=L.useState(()=>$s(n)),[vu,ld]=L.useState(!1);L.useEffect(()=>{const p=window.setInterval(()=>{const C=Rs();r(M=>M.id===C.id&&M.name===C.name?M:C)},900);return()=>window.clearInterval(p)},[]),L.useEffect(()=>{try{const p=window.localStorage.getItem(Ds(n)),C=zl(n);l(p?JSON.parse(p):[]),Dt(Fs(n)),bo($s(n)),Go(C.internalNote||""),Zo(C.quoteStatus||"cotizado")}catch{l([]),Dt(null),bo([]),Go(""),Zo("cotizado")}},[n.id]),L.useEffect(()=>{try{window.localStorage.setItem(Ds(n),JSON.stringify(o))}catch{}},[n.id,o]),L.useEffect(()=>{try{window.localStorage.setItem(td(n),JSON.stringify({internalNote:qe,quoteStatus:be}))}catch{}},[n.id,qe,be]),L.useEffect(()=>{const p=i.trim();if(p.length<2){c([]);return}let C=!0;return g(!0),Os(p).then(M=>{C&&c(M)}).catch(M=>{C&&(k(M.message||"No se pudo buscar productos."),c([]))}).finally(()=>{C&&g(!1)}),()=>{C=!1}},[i,y==null?void 0:y.access_token]),L.useEffect(()=>{if(!P||!y)return;let p=!0;return T(!0),Os({query:j.trim(),marca:O.trim(),modelo:Ze.trim(),includeZeroStock:qt,limit:lm,offset:0}).then(C=>{p&&en(C)}).catch(C=>{p&&(k(C.message||"No se pudo buscar productos."),en([]))}).finally(()=>{p&&T(!1)}),()=>{p=!1}},[P,j,O,Ze,qt,y==null?void 0:y.access_token]),L.useEffect(()=>{y&&Gp().then(p=>gu(p||[])).catch(()=>gu([]))},[y==null?void 0:y.access_token]),L.useEffect(()=>{n.name&&(ft(p=>p||n.name),/[\d+() -]{7,}/.test(n.name)&&Xo(p=>p||n.name))},[n.name]),L.useEffect(()=>{if(!y||U){tn([]);return}const p=ve.trim();if(p.length<2){tn([]);return}let C=!0;return Jp(p).then(M=>{C&&tn(M||[])}).catch(()=>{C&&tn([])}),()=>{C=!1}},[ve,U==null?void 0:U.id,y==null?void 0:y.access_token]);const Te=L.useMemo(()=>o.reduce((p,C)=>{const fe=G(C.cantidad,1)*G(C.precio,0),Er=G(C.itbisPct,0),nn=Er>0?fe/(1+Er):fe,Le=fe-nn;return p.subtotal+=nn,p.tax+=Le,p.total+=fe,p},{subtotal:0,tax:0,total:0}),[o]);o.reduce((p,C)=>p+G(C.cantidad,0),0);function el(p){const C=um(p);l(M=>[...M,C]),pt("product_added",{items:Ft([C]),quote_total:Te.total+C.cantidad*C.precio}),u(""),c([]),z(!1),k("")}function yu(p,C){l(M=>M.map(fe=>fe.lineId===p?{...fe,...C}:fe))}function id(p){const C=o.find(M=>M.lineId===p);l(M=>M.filter(fe=>fe.lineId!==p)),C&&pt("product_removed",{items:Ft([C])})}function pt(p,C={}){y!=null&&y.access_token&&qp({event_type:p,chat_id:n.id,chat_name:n.name,cliente_id:(U==null?void 0:U.id)||null,vendedor_id:Jo||null,customer_name:(U==null?void 0:U.nombre)||ve||n.name||null,customer_phone:Mn||(U==null?void 0:U.telefono)||null,status:be,note:qe,quote_total:Te.total,items:Ft(o),...C,metadata:{selected_customer:U?{id:U.id,nombre:U.nombre,telefono:U.telefono||null}:null,...C.metadata}}).catch(M=>{console.warn("[Motoflow WhatsApp] No se pudo guardar evento:",M.message)})}function ud(p){var M;Zo(p);const C=((M=Qr.find(fe=>fe.key===p))==null?void 0:M.label)||p;pt("status_changed",{status:p,metadata:{status_label:C}})}function sd(){qe.trim()&&pt("internal_note_saved",{note:qe.trim()})}function ad(){var p;(p=ne==null?void 0:ne.lines)!=null&&p.length&&(l(ne.lines.map(C=>({...C,lineId:`${C.productId||C.codigo||"line"}-${Date.now()}-${Math.random().toString(16).slice(2)}`}))),pt("quote_restored",{quote_total:ne.total||0,items:Ft(ne.lines)}),k("Ultima cotizacion recuperada. Puedes agregar, quitar o cambiar cantidades."))}function cd(p){var C;(C=p==null?void 0:p.lines)!=null&&C.length&&(l(p.lines.map(M=>({...M,lineId:`${M.productId||M.codigo||"line"}-${Date.now()}-${Math.random().toString(16).slice(2)}`}))),pt("quote_restored",{quote_total:p.total||0,items:Ft(p.lines),metadata:{restored_from_history:!0}}),k(`Cotizacion recuperada del historial: ${Ye.format(p.total||0)}.`))}function dd(p){const M=[{...p,id:`${Date.now()}-${Math.random().toString(16).slice(2)}`,status:be,note:qe},...qo].slice(0,8);window.localStorage.setItem(ed(n),JSON.stringify(p)),sm(n,M),Dt(p),bo(M)}async function fd(){if(!I){if(!o.length){k("Agrega al menos un producto antes de crear la cotizacion.");return}Q(!0);try{const p=am(n,o,Te);if(await em(p)){const M={sentAt:new Date().toISOString(),lines:o,total:Te.total};dd(M),pt("quote_pasted",{quote_total:Te.total,items:Ft(o),metadata:{message_ready_for_manual_send:!0}}),l([]),c([]),u(""),z(!1),t(!0),k("")}else k("No encontre el cuadro de mensaje de WhatsApp.")}finally{window.setTimeout(()=>Q(!1),900)}}}async function pd(){var p;if(!J){if(!o.length){k("Recupera o prepara una cotizacion antes de mandarla a facturar.");return}Rt(!0);try{const C=new Date,M=new Date(C);M.setDate(M.getDate()+7);const fe=Le=>Le.toISOString().slice(0,10),Er=o.map(Le=>{const ku=G(Le.cantidad,1),Su=G(Le.precio,0),_u=G(Le.itbisPct,.18),Cr=ku*Su,yd=_u>0?Cr/(1+_u):Cr,xd=Cr-yd;return{producto_id:Le.productId,codigo:Le.codigo||"",descripcion:Le.descripcion,cantidad:ku,unidad:"UND",precio_unitario:Su,descuento_pct:0,descuento_valor:0,itbis_valor:xd,importe:Cr}}),nn=await Zp({fecha_cotizacion:fe(C),fecha_vencimiento:fe(M),cliente_id:(U==null?void 0:U.id)||im,manual_cliente_nombre:U!=null&&U.id?null:ve.trim()||n.name||"Cliente WhatsApp",vendedor_id:Jo||null,subtotal:Te.subtotal,descuento_total:0,itbis_total:Te.tax,total_cotizacion:Te.total,notas:["Cotizacion confirmada desde WhatsApp Web",n.name?`Chat: ${n.name}`:null,Mn?`Telefono: ${Mn}`:null,be?`Estado: ${((p=Qr.find(Le=>Le.key===be))==null?void 0:p.label)||be}`:null,qe.trim()?`Nota interna: ${qe.trim()}`:null].filter(Boolean).join(" | "),detalles:Er});pt("quote_sent_to_invoice",{cotizacion_id:nn.id,quote_total:Te.total,items:Ft(o),metadata:{cotizacion_numero:nn.numero}}),k(`Lista para facturar en Motoflow: cotizacion ${nn.numero}.`)}catch(C){k(C.message||"No se pudo mandar a facturar en Motoflow.")}finally{Rt(!1)}}}async function md(p){p.preventDefault(),E(!0),k("");try{const C=await Yp($.trim(),a);S(C),f(""),k("Conectado a Motoflow. Ya puedes buscar productos.")}catch(C){k(C.message||"No se pudo iniciar sesion.")}finally{E(!1)}}function hd(){Xp(),S(null),c([]),u(""),k("Sesion cerrada en la extension.")}function gd(p){Yo(p),ft(p.nombre||""),Xo(p.telefono||Mn),tn([])}function vd(){Yo(null),tn([])}return e?m.jsx("button",{className:"mf-floating-button",type:"button",onClick:()=>t(!1),children:"Cotizar"}):m.jsxs("aside",{className:"mf-panel","aria-label":"Cotizacion WhatsApp",children:[m.jsxs("header",{className:"mf-header",children:[m.jsxs("div",{children:[m.jsx("p",{className:"mf-kicker",children:"Motoflow"}),m.jsx("h2",{children:"Cotizacion WhatsApp"}),m.jsx("p",{className:"mf-chat",children:n.name||"Chat actual"}),m.jsxs("div",{className:"mf-header-actions",children:[y&&m.jsxs(m.Fragment,{children:[m.jsx("span",{children:"Conectado"}),m.jsx("button",{className:"mf-logout-button",type:"button",onClick:hd,children:"Salir"})]}),m.jsx("button",{className:"mf-icon-button",type:"button",onClick:()=>t(!0),title:"Colapsar",children:"x"})]})]}),m.jsx("button",{className:"mf-icon-button",type:"button",onClick:()=>t(!0),title:"Colapsar",children:"×"})]}),!y&&m.jsxs("form",{className:"mf-login",onSubmit:md,children:[m.jsx("strong",{children:"Conectar con Motoflow"}),m.jsx("p",{children:"Usa el mismo correo y clave del CRM para habilitar la busqueda."}),m.jsx("input",{autoComplete:"email",type:"email",value:$,onChange:p=>d(p.target.value),placeholder:"Correo",required:!0}),m.jsx("input",{autoComplete:"current-password",type:"password",value:a,onChange:p=>f(p.target.value),placeholder:"Clave",required:!0}),m.jsx("button",{type:"submit",disabled:x,children:x?"Conectando...":"Conectar"})]}),y&&m.jsxs("section",{className:"mf-motoflow-box",children:[m.jsxs("button",{className:"mf-motoflow-toggle",type:"button",onClick:()=>ld(p=>!p),children:[m.jsxs("span",{children:["Datos Motoflow",m.jsxs("small",{children:[(U==null?void 0:U.nombre)||ve||n.name||"Cliente sin asignar"," · ",((xu=Qr.find(p=>p.key===be))==null?void 0:xu.label)||"Cotizado"]})]}),m.jsx("b",{children:vu?"Ocultar":"Editar"})]}),vu&&m.jsxs(m.Fragment,{children:[m.jsxs("div",{className:"mf-customer-box",children:[m.jsx("label",{htmlFor:"mf-customer-search",children:"Cliente para Motoflow"}),m.jsxs("div",{className:"mf-customer-row",children:[m.jsx("input",{id:"mf-customer-search",value:ve,onChange:p=>{ft(p.target.value),Yo(null)},placeholder:"Nombre, telefono, RNC..."}),U&&m.jsx("button",{type:"button",onClick:vd,title:"Cambiar cliente",children:"x"})]}),hu.length>0&&m.jsx("div",{className:"mf-customer-results",children:hu.map(p=>m.jsxs("button",{type:"button",onClick:()=>gd(p),children:[m.jsx("strong",{children:p.nombre}),m.jsx("small",{children:p.telefono||p.rnc||p.codigo||"Cliente registrado"})]},p.id))}),m.jsxs("div",{className:"mf-customer-grid",children:[m.jsx("input",{value:Mn,onChange:p=>Xo(p.target.value),placeholder:"Telefono"}),m.jsxs("select",{value:Jo,onChange:p=>od(p.target.value),children:[m.jsx("option",{value:"",children:"Vendedor"}),rd.map(p=>m.jsx("option",{value:p.id,children:p.nombre},p.id))]})]})]}),m.jsxs("div",{className:"mf-workflow-box",children:[m.jsx("label",{children:"Estado rapido"}),m.jsx("div",{className:"mf-status-grid",children:Qr.map(p=>m.jsx("button",{className:be===p.key?"is-active":"",type:"button",onClick:()=>ud(p.key),children:p.label},p.key))}),m.jsx("textarea",{value:qe,onChange:p=>Go(p.target.value),onBlur:sd,placeholder:"Nota interna para Motoflow...",rows:"2"})]})]})]}),m.jsxs("section",{className:"mf-search",children:[m.jsx("label",{htmlFor:"mf-product-search",children:"Buscar producto"}),m.jsx("input",{id:"mf-product-search",value:i,onChange:p=>u(p.target.value),placeholder:"Codigo, descripcion...",disabled:!y}),!y&&m.jsx("p",{className:"mf-muted",children:"Conecta tu usuario del CRM para buscar productos."}),v&&m.jsx("p",{className:"mf-muted",children:"Buscando..."}),!v&&i.trim().length>=2&&y&&s.length===0&&m.jsxs("p",{className:"mf-muted",children:['Sin resultados para "',i.trim(),'".']}),s.length>0&&m.jsx("div",{className:"mf-results",children:s.map(p=>m.jsxs("button",{type:"button",onClick:()=>el(p),children:[m.jsxs("span",{children:[m.jsx("strong",{children:p.codigo||"SIN CODIGO"}),m.jsx("small",{children:p.descripcion||p.nombre})]}),m.jsxs("span",{children:[m.jsx("strong",{children:Ye.format(G(p.precio??p.precio_venta??p.precio1,0))}),m.jsxs("small",{children:["Exist. ",G(p.existencia,0)]})]})]},p.id||p.codigo))}),m.jsx("button",{className:"mf-advanced-button",type:"button",onClick:()=>z(!0),disabled:!y,children:"Abrir busqueda avanzada"})]}),m.jsx("section",{className:"mf-items",children:o.length===0?m.jsxs("div",{className:"mf-empty",children:[m.jsx("strong",{children:"Todavia no hay articulos."}),m.jsx("p",{children:"Agrega productos manualmente desde el buscador para preparar la cotizacion sin salir de WhatsApp."}),((wu=ne==null?void 0:ne.lines)==null?void 0:wu.length)>0&&m.jsxs("button",{className:"mf-restore-button",type:"button",onClick:ad,children:["Recuperar ultima cotizacion (",ne.lines.length,")"]}),qo.length>0&&m.jsxs("div",{className:"mf-history-list",children:[m.jsx("strong",{children:"Historial del chat"}),qo.slice(0,4).map(p=>{var C;return m.jsxs("button",{type:"button",onClick:()=>cd(p),children:[m.jsx("span",{children:new Date(p.sentAt).toLocaleTimeString("es-DO",{hour:"2-digit",minute:"2-digit"})}),m.jsxs("span",{children:[((C=p.lines)==null?void 0:C.length)||0," art."]}),m.jsx("b",{children:Ye.format(p.total||0)})]},p.id||p.sentAt)})]})]}):o.map(p=>m.jsxs("article",{className:"mf-line",children:[m.jsxs("div",{className:"mf-line-main",children:[m.jsx("strong",{children:p.descripcion}),m.jsxs("small",{children:[p.codigo||"Sin codigo"," · Exist. ",p.existencia]})]}),m.jsxs("div",{className:"mf-line-controls",children:[m.jsx("input",{"aria-label":"Cantidad",min:"1",type:"number",value:p.cantidad,onChange:C=>yu(p.lineId,{cantidad:G(C.target.value,1)})}),m.jsx("input",{"aria-label":"Precio",min:"0",step:"0.01",type:"number",value:p.precio,onChange:C=>yu(p.lineId,{precio:G(C.target.value,0)})}),m.jsx("button",{type:"button",onClick:()=>id(p.lineId),title:"Eliminar",children:"×"})]}),m.jsx("footer",{children:Ye.format(p.cantidad*p.precio)})]},p.lineId))}),m.jsxs("footer",{className:"mf-footer",children:[m.jsxs("dl",{children:[m.jsxs("div",{children:[m.jsx("dt",{children:"Subtotal"}),m.jsx("dd",{children:Ye.format(Te.subtotal)})]}),m.jsxs("div",{children:[m.jsx("dt",{children:"ITBIS"}),m.jsx("dd",{children:Ye.format(Te.tax)})]}),m.jsxs("div",{children:[m.jsx("dt",{children:"Total seleccionado"}),m.jsx("dd",{children:Ye.format(Te.total)})]})]}),h&&m.jsx("p",{className:"mf-notice",children:h}),m.jsx("button",{className:"mf-secondary",type:"button",onClick:pd,disabled:J||!o.length,children:J?"Enviando a Motoflow...":"Mandar a facturar en Motoflow"}),m.jsx("button",{className:"mf-primary",type:"button",onClick:fd,disabled:I,children:I?"Pegando cotizacion...":"Crear y pegar cotizacion"})]}),P&&m.jsx("div",{className:"mf-modal-backdrop",role:"dialog","aria-modal":"true","aria-label":"Buscar producto",children:m.jsxs("div",{className:"mf-product-modal",children:[m.jsxs("header",{className:"mf-modal-header",children:[m.jsx("h3",{children:"Buscar producto"}),m.jsx("button",{type:"button",onClick:()=>z(!1),title:"Cerrar",children:"×"})]}),m.jsxs("section",{className:"mf-modal-filters",children:[m.jsx("input",{autoFocus:!0,value:j,onChange:p=>W(p.target.value),placeholder:"Buscar por codigo, ref, descripcion..."}),m.jsx("input",{value:Ze,onChange:p=>Mt(p.target.value),placeholder:"Modelo"}),m.jsx("input",{value:O,onChange:p=>_e(p.target.value),placeholder:"Marca"}),m.jsxs("label",{children:[m.jsx("input",{type:"checkbox",checked:qt,onChange:p=>Ko(p.target.checked)}),"Incluir existencias en cero"]})]}),m.jsx("section",{className:"mf-product-table-wrap",children:m.jsxs("table",{className:"mf-product-table",children:[m.jsx("thead",{children:m.jsxs("tr",{children:[m.jsx("th",{children:"Codigo"}),m.jsx("th",{children:"Referencia"}),m.jsx("th",{children:"Descripcion"}),m.jsx("th",{children:"Ubicacion"}),m.jsx("th",{children:"Exist."}),m.jsx("th",{children:"Precio+Imp"}),m.jsx("th",{children:"Marca"})]})}),m.jsxs("tbody",{children:[_&&m.jsx("tr",{children:m.jsx("td",{colSpan:"7",className:"mf-table-state",children:"Buscando productos..."})}),!_&&bt.length===0&&m.jsx("tr",{children:m.jsx("td",{colSpan:"7",className:"mf-table-state",children:"No se encontraron productos."})}),!_&&bt.map(p=>{const C=G(p.precio??p.precio_venta??p.precio1,0);G(p.itbis_pct,.18);const M=G(p.existencia,0);return m.jsxs("tr",{onDoubleClick:()=>el(p),children:[m.jsx("td",{children:m.jsx("button",{type:"button",onClick:()=>el(p),children:p.codigo||"-"})}),m.jsx("td",{children:p.referencia||"-"}),m.jsx("td",{children:p.descripcion||p.nombre}),m.jsx("td",{children:p.ubicacion||"-"}),m.jsx("td",{className:M>0?"mf-stock-ok":"mf-stock-zero",children:M}),m.jsx("td",{className:"mf-price",children:Ye.format(C)}),m.jsx("td",{children:p.marca_nombre||"-"})]},p.id||p.codigo)})]})]})}),m.jsxs("footer",{className:"mf-modal-footer",children:[m.jsx("span",{children:"Doble clic o toca el codigo para agregar."}),m.jsx("button",{type:"button",onClick:()=>z(!1),children:"Cerrar"})]})]})})]})}const dm=`
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
`,Us="motoflow-whatsapp-quote-root";function As(){if(document.getElementById(Us))return;const e=document.createElement("div");e.id=Us,document.body.appendChild(e);const t=e.attachShadow({mode:"open"}),n=document.createElement("style");n.textContent=dm;const r=document.createElement("div");r.id="motoflow-quote-app",t.append(n,r),bc(r).render(m.jsx(cm,{}))}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",As,{once:!0}):As();
