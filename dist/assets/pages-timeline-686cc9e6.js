import{r as O,e as t}from"./index-49373b4e.js";import{o as X,f as Ie}from"./screen-72bfbc22.js";import{I as z,S as de,_ as me,q as M,G as ue,J as pe,v as F,t as N,P as he,B as Y}from"./l10n-3ec01317.js";import{v as D,az as ze,aA as Ne,j as He,R as Xe}from"./store-e8f8c69d.js";import{d as Oe,P as Ve}from"./index-7b27d726.js";import{D as ve,M as Ee,d as We}from"./duplicate-eaae9106.js";import{I as Be}from"./insert-f0421abf.js";import{T as ge,M as fe}from"./trash-abae24ae.js";import{V as we}from"./volume-up-59c75200.js";import{S as _e,B as Ge}from"./slider-c99463d3.js";import{N as oe}from"./navbar-830aae3d.js";var xe=O.forwardRef(function(e,n){var a=e.size>=z.LARGE,o=a?z.LARGE:z.STANDARD,i="".concat(-1*o/.05/2),r={transformOrigin:"center"};return O.createElement(de,me({iconName:"pause",ref:n},e),O.createElement("path",{d:a?"M140 340H80C69 340 60 331 60 320V80C60 69 69 60 80 60H140C151 60 160 69 160 80V320C160 331 151 340 140 340zM320 340H260C249 340 240 331 240 320V80C240 69 249 60 260 60H320C331 60 340 69 340 80V320C340 331 331 340 320 340z":"M120 260H80C69 260 60 251 60 240V80C60 69 69 60 80 60H120C131 60 140 69 140 80V240C140 251 131 260 120 260zM240 260H200C189 260 180 251 180 240V80C180 69 189 60 200 60H240C251 60 260 69 260 80V240C260 251 251 260 240 260z",fillRule:"evenodd",transform:"scale(0.05, -0.05) translate(".concat(i,", ").concat(i,")"),style:r}))});xe.defaultProps={size:z.STANDARD};xe.displayName="Blueprint5.Icon.Pause";var ae=O.forwardRef(function(e,n){var a=e.size>=z.LARGE,o=a?z.LARGE:z.STANDARD,i="".concat(-1*o/.05/2),r={transformOrigin:"center"};return O.createElement(de,me({iconName:"play",ref:n},e),O.createElement("path",{d:a?"M320 200C320 207.2 316 213.4 310.2 216.8L310.4 217L110.4 337L110.2 336.8C107.2 338.6 103.8 340 100 340C89 340 80 331 80 320V80C80 69 89 60 100 60C103.8 60 107.2 61.4 110.2 63.2L110.4 63L310.4 183L310.2 183.2C316 186.6 320 192.8 320 200z":"M240 160C240 167 236.2 172.8 230.8 176.4L231 176.8L111 256.8L110.8 256.4C107.8 258.4 104.2 260 100 260C89 260 80 251 80 240V80C80 69 89 60 100 60C104.2 60 107.8 61.6 110.8 63.6L111 63.2L231 143.2L230.8 143.6C236.2 147.2 240 153 240 160z",fillRule:"evenodd",transform:"scale(0.05, -0.05) translate(".concat(i,", ").concat(i,")"),style:r}))});ae.defaultProps={size:z.STANDARD};ae.displayName="Blueprint5.Icon.Play";var ne=O.forwardRef(function(e,n){var a=e.size>=z.LARGE,o=a?z.LARGE:z.STANDARD,i="".concat(-1*o/.05/2),r={transformOrigin:"center"};return O.createElement(de,me({iconName:"volume-off",ref:n},e),O.createElement("path",{d:a?"M280 340C274.4000000000001 340 269.4000000000001 337.8 265.8 334.2L211.8 280H120C109 280 100 271 100 260V140C100 129 109 120 120 120H211.8L266 65.8C269.4000000000001 62.2 274.4000000000001 60 280 60C291 60 300 69 300 80V320C300 331 291 340 280 340z":"M220 280C214.4 280 209.4 277.8 205.8 274.2L151.8 220H100C89 220 80 211 80 200V120C80 109 89 100 100 100H151.8L206 45.8C209.4 42.2 214.4 40 220 40C231 40 240 49 240 60V260C240 271 231 280 220 280z",fillRule:"evenodd",transform:"scale(0.05, -0.05) translate(".concat(i,", ").concat(i,")"),style:r}))});ne.defaultProps={size:z.STANDARD};ne.displayName="Blueprint5.Icon.VolumeOff";const Ce=M("div")`
  border: 4px solid rgba(0, 0, 0, 0.1);
  border-left-color: #09f;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  animation: spin 1s linear infinite;

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`,je=M("div",t.forwardRef)`
  display: flex;
  position: relative;
  border-radius: 15px;

  &:hover {
    .polotno-page-menu {
      opacity: 1;
      pointer-events: auto;
    }
  }
`,Fe=M("div")`
  position: absolute;
  z-index: 20;
  top: 5px;
  right: 5px;
  opacity: 0;
  pointer-events: none;

  &:hover {
    display: block;
  }
`;let $=[],ie=!1;const Te=async()=>{if(ie||$.length===0)return;ie=!0;const{page:e,setPreview:n}=$.shift();try{n(await e.store.toDataURL({pageId:e.id,pixelRatio:.1,quickMode:!0}))}catch(a){a instanceof Error&&typeof a.message=="string"&&(a.message.includes("Canvas was unmounted.")||a.message.includes("<Workspace /> component is not mounted"))||console.error(a)}finally{ie=!1}Te()},Ye=({page:e,ref:n})=>{const[a,o]=t.useState(null),i=t.useRef(!1);return t.useEffect(()=>{const r=()=>{$.push({page:e,setPreview:x=>o(x)}),Te()};let l=null,d=null,E=Date.now();const v=()=>{l&&clearTimeout(l),i.current&&(d||(d=setTimeout(()=>{Date.now()-E>=6e3&&(r(),E=Date.now(),d=null)},6e3)),l=setTimeout(()=>{r(),E=Date.now(),l=null,d&&(clearTimeout(d),d=null)},300))};let s=null;const m=ze(e,x=>{Ne(s,x)||(v(),s=x)}),g=Ie(()=>e.children.some(x=>x._editModeEnabled),x=>{x||v()}),b=new IntersectionObserver(x=>{x.forEach(w=>{w.isIntersecting?(i.current=!0,v()):(l&&clearTimeout(l),d&&clearTimeout(d),i.current=!1)})},{threshold:.1});return n.current&&b.observe(n.current),()=>{b.disconnect(),l&&clearTimeout(l),d&&clearTimeout(d),m(),g(),$=$.filter(x=>x.page!==e)}},[n,e]),a},Ze=X(({page:e,scale:n})=>{const a=e.store.activePage===e||e.store._selectedPagesIds.includes(e.id),o=t.useRef(null),i=e.store.pages.indexOf(e),r=60/e.computedHeight*e.computedWidth,l=D.animationsEnabled?e.duration*n:r,d=e.store.pages.length>1;t.useLayoutEffect(()=>{o.current&&(o.current.style.width=l+"px")},[i,l]);const E=Ye({page:e,ref:o}),{handleStartDrag:v}=((s,m)=>({handleStartDrag:t.useCallback((g,b)=>{g.preventDefault();const x=y=>{if(y.preventDefault(),!m.current)return;const p=b==="start"?7:-7,{clientX:u}=y,{left:h,width:c}=m.current.getBoundingClientRect(),f=(u-h-p)/c;b==="end"&&s.set({duration:Math.max(1e3,f*s.duration)})},w=()=>{window.removeEventListener("mousemove",x),window.removeEventListener("mouseup",w)};window.addEventListener("mousemove",x),window.addEventListener("mouseup",w)},[m,s])}))(e,o);return t.createElement(je,{style:{width:l+"px",marginRight:D.animationsEnabled?"0px":"10px",height:"60px"},ref:o,className:"polotno-page-container"+(a?" sortable-selected":"")},t.createElement("div",{style:{width:"100%",height:"100%",borderRadius:"15px",backgroundImage:E?`url("${E}")`:"none",backgroundRepeat:"repeat-x",backgroundSize:"auto 100%",backgroundColor:"white",display:"flex",justifyContent:"center",alignItems:"center"},onClick:s=>{const{store:m}=e,g=m._selectedPagesIds.length?m._selectedPagesIds:m.activePage?[m.activePage.id]:[],b=g.includes(e.id),x=s.shiftKey;if(x&&b){const w=g.filter(y=>y!==e.id);m.selectPages(w)}else if(x&&!b){const w=g.concat([e.id]);m.selectPages(w)}else m.selectPages([e.id])}},!E&&t.createElement(Ce,null)),t.createElement("div",{style:{position:"absolute",top:"0",left:"0px",bottom:"0px",right:"0px",borderRadius:"15px",border:a?"2px solid rgb(0, 161, 255, 0.9)":"2px solid lightgrey",zIndex:1,pointerEvents:"none"}}),D.animationsEnabled&&t.createElement("div",{style:{position:"absolute",zIndex:1,bottom:"5px",left:"5px",backgroundColor:"rgba(0, 0, 0, 0.5)",color:"white",padding:"2px 7px",textAlign:"center",borderRadius:"4rem"}},(e.duration/1e3).toFixed(1),"s"),D.animationsEnabled&&t.createElement("div",{style:{position:"absolute",zIndex:1,top:"50%",right:"0px",width:"8px",height:"50%",transform:"translateY(-50%) translateX(-3px)",borderRadius:"5px",border:"1px solid rgb(255, 255, 255, 0.6)",backgroundColor:"rgb(0, 0, 0, 0.6)",cursor:"ew-resize"},onMouseDown:s=>v(s,"end")}),a&&t.createElement(Fe,{className:"polotno-page-menu",onClick:s=>{s.stopPropagation()}},t.createElement(ue,{content:t.createElement(pe,{style:{width:"140px"}},t.createElement(F,{icon:t.createElement(ve,null),text:N("pagesTimeline.duplicatePage"),onClick:()=>{const s=e.store,m=(s.selectedPages||[]).filter(Boolean),g=m.length?m:s.activePage?[s.activePage]:[];if(!g.length)return;const b=new Set(g.map(u=>u.id)),x=s.pages.filter(u=>b.has(u.id)),w=x[x.length-1],y=x.map(u=>u.clone()),p=s.pages.indexOf(w);y.forEach((u,h)=>{u.setZIndex(p+1+h)}),s.selectPages(y.map(u=>u.id))}}),t.createElement(F,{icon:t.createElement(Be,null),text:N("pagesTimeline.addPage"),onClick:()=>{var s,m,g;const b=e.store.addPage({bleed:((s=e.store.activePage)===null||s===void 0?void 0:s.bleed)||0,width:((m=e.store.activePage)===null||m===void 0?void 0:m.width)||"auto",height:((g=e.store.activePage)===null||g===void 0?void 0:g.height)||"auto"}),x=e.store.pages.indexOf(e);b.setZIndex(x+1)}}),d&&t.createElement(F,{icon:t.createElement(ge,null),text:N("pagesTimeline.removePage"),onClick:()=>{const s=e.store,m=(s.selectedPages||[]).filter(Boolean),g=m.length?m.map(b=>b.id):s.activePage?[s.activePage.id]:[];g.length&&s.deletePages(g)}})),position:he.TOP},t.createElement(Y,{icon:t.createElement(fe,null),style:{minHeight:"20px",borderRadius:"10px"}}))))}),qe=X(({store:e,scale:n})=>{const a=e.pages.map(o=>({id:o.id}));return t.createElement(Oe.ReactSortable,{list:a,setList:o=>{o.forEach(({id:i},r)=>{const l=e.pages.find(d=>d.id===i);l&&e.pages.indexOf(l)!==r&&l.setZIndex(r)})},direction:"horizontal",style:{display:"flex",flexDirection:"row"},delay:500,delayOnTouchOnly:!0,className:"polotno-pages-container"},a.map(({id:o})=>{const i=e.pages.find(r=>r.id===o);return i?t.createElement(Ze,{page:i,scale:n,key:o}):null}))}),re="rgb(0, 161, 255)",Ue=X(({store:e,scale:n,variant:a="timeline",dragAreaRef:o})=>{var i;const r=t.useRef(null),l=((i=e.activePage)===null||i===void 0?void 0:i.startTime)||0,d=e.isPlaying||e.currentTime!==0?e.currentTime:l,E=t.useCallback(w=>Math.max(0,Math.min(w,e.duration)),[e.duration]),v=t.useCallback(w=>{var y,p;const u=(o==null?void 0:o.current)||((y=r.current)===null||y===void 0?void 0:y.parentElement);if(!u)return;const h=u.getBoundingClientRect(),c=u.scrollLeft||0;let f=w-h.left+c;const C=window.getComputedStyle(u);f-=parseFloat(C.paddingLeft)||0;const L=Math.max(0,f),P=E(L/n);e.setCurrentTime(P),(p=e.checkActivePage)===null||p===void 0||p.call(e)},[E,o,n,e]),s=t.useCallback(w=>{v(w);const y=u=>{u.preventDefault(),v(u.clientX)},p=()=>{window.removeEventListener("mousemove",y),window.removeEventListener("mouseup",p)};window.addEventListener("mousemove",y),window.addEventListener("mouseup",p)},[v]),m=t.useCallback(w=>{v(w);const y=u=>{const h=u.touches[0];h&&(u.preventDefault(),v(h.clientX))},p=()=>{window.removeEventListener("touchmove",y),window.removeEventListener("touchend",p),window.removeEventListener("touchcancel",p)};window.addEventListener("touchmove",y,{passive:!1}),window.addEventListener("touchend",p),window.addEventListener("touchcancel",p)},[v]),g=t.useCallback(w=>{w.preventDefault(),w.stopPropagation(),s(w.clientX)},[s]),b=t.useCallback(w=>{const y=w.touches[0];y&&(w.preventDefault(),w.stopPropagation(),m(y.clientX))},[m]),x=(w=>w==="ruler"?{wrapper:{top:0,width:12,height:"100%",transform:"translateX(-6px)",display:"flex",flexDirection:"column",alignItems:"center"},line:{flex:1}}:{wrapper:{top:0,width:12,height:"100%",transform:"translateX(-6px)"},line:{height:"100%",margin:"0 auto"},showMarker:!1})(a);return t.createElement("div",{ref:r,onMouseDown:g,onTouchStart:b,style:Object.assign(Object.assign({position:"absolute",left:d*n+"px"},x.wrapper),{cursor:"col-resize",touchAction:"none"})},t.createElement("svg",{width:"12",height:"8",viewBox:"0 0 12 8",style:{display:"block",filter:"drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))"}},t.createElement("path",{d:"M0 0 H12 L6 8 Z",fill:re,stroke:re,strokeWidth:"2",strokeLinejoin:"round"})),t.createElement("div",{style:Object.assign({width:"2px",backgroundColor:re},x.line)}))}),le={};let se=null;async function Je(e){if(le[e])return le[e];const n=typeof window>"u"?null:(se=se||new AudioContext,se);if(!n)return[];const a=await fetch(e),o=await a.arrayBuffer(),i=(await n.decodeAudioData(o)).getChannelData(0),r=Math.max(1,Math.floor(i.length/500)),l=new Array(500).fill(0);for(let v=0;v<500;v++){let s=0;const m=v*r;for(let g=0;g<r&&m+g<i.length;g++)s=Math.max(s,Math.abs(i[m+g]));l[v]=s}const d=Math.max(...l)||1,E=l.map(v=>Number((v/d).toFixed(4)));return le[e]=E,E}function Ke(e,n){if(!e.length||n<=0)return{path:"",width:0};const a=n/2,o=Math.max(1,e.length-1);let i="";for(let r=0;r<e.length;r++){const l=r,d=a-e[r]*a;i+=r===0?`M ${l},${d}`:` L ${l},${d}`}for(let r=e.length-1;r>=0;r--)i+=` L ${r},${a+e[r]*a}`;return i+=" Z",{path:i,width:o}}function Qe(e){const[n,a]=t.useState(null),[o,i]=t.useState(!1),[r,l]=t.useState(null);return t.useEffect(()=>{e?(i(!0),Je(e).then(d=>{a(d),i(!1)}).catch(d=>{console.error("Error generating waveform:",d),l(d),i(!1)})):a(null)},[e]),{data:n,isLoading:o,error:r}}function $e(e,n=20){return t.useMemo(()=>e?Ke(e,n):{path:"",width:0},[e,n])}const et=M("div")`
  position: absolute;
  inset: 0 0 0 0;
  display: flex;
  align-items: center;
  padding: 0 12px;
  pointer-events: none;
  font-size: 11px;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.75);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  .bp5-dark & {
    color: rgba(255, 255, 255, 0.92);
  }
`,tt=M("svg")`
  & path {
    fill: rgba(0, 0, 0, 0.5);
  }

  .bp5-dark & path {
    fill: rgba(255, 255, 255, 0.7);
  }
`,Le=M("div")`
  position: absolute;

  &:hover {
    .polotno-track-menu {
      opacity: 1;
      pointer-events: auto;
    }
  }
`,Pe=M("div")`
  position: absolute;
  border-radius: 10px;
  color: rgba(0, 161, 255, 0.85);
  background: linear-gradient(
    135deg,
    rgba(0, 161, 255, 0.15),
    rgba(0, 161, 255, 0.35)
  );
  border: 1px solid rgba(0, 120, 200, 0.55);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  cursor: move;
  overflow: hidden;
`,ke=M("div")`
  position: absolute;
  z-index: 20;
  top: 50%;
  right: 12px;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%);
`,De=M("div")`
  position: absolute;
  top: 1px;
  width: 12px;
  height: calc(100% - 2px);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ew-resize;
  pointer-events: auto;

  &::before {
    content: '';
    width: 8px;
    height: 75%;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.6);
    background-color: rgba(0, 0, 0, 0.6);
  }
`,Re=M(De)`
  left: 0;
`,Se=M(De)`
  right: 0;
`;var nt=globalThis&&globalThis.__rest||function(e,n){var a={};for(var o in e)Object.prototype.hasOwnProperty.call(e,o)&&n.indexOf(o)<0&&(a[o]=e[o]);if(e!=null&&typeof Object.getOwnPropertySymbols=="function"){var i=0;for(o=Object.getOwnPropertySymbols(e);i<o.length;i++)n.indexOf(o[i])<0&&Object.prototype.propertyIsEnumerable.call(e,o[i])&&(a[o[i]]=e[o[i]])}return a};const at=28,J=({position:e,store:n,scale:a})=>{const o=n.pages;for(const i of o){const r=i.startTime,l=i.startTime+i.duration;if(Math.abs(e-r)<10/a)return r;if(Math.abs(e-l)<10/a)return l}return null},ot=X(({audio:e,scale:n,store:a,index:o})=>{const[i,r]=t.useState(1),l=e.volume===0,d=()=>{l?e.set({volume:i>0?i:1}):(r(e.volume),e.set({volume:0}))},E=(c=e.startTime,f=e.endTime)=>Math.max(0,(f-c)*(e.duration||0)),v=c=>Math.max(0,a.duration-c),s=(c,f=E())=>Math.min(Math.max(0,c),v(f)),m=E(),g=a.duration*n-e.delay*n,b=Math.min(m*n,g),x=e.delay*n,{data:w,isLoading:y}=Qe(e.src),p=(e.endTime-e.startTime)*e.duration*n,u=$e(w,20).path,h=(c,f)=>{c.stopPropagation(),c.preventDefault();const C=c.clientX,L=x,P=b,k=e.endTime,R=e.startTime,S=e.delay,T=e.duration||1,Z=V=>{V.preventDefault();const W=(V.clientX-C)/n;if(f==="start")if(W>=0){const A=W,H=Math.max(0,k-.1-R)*T,I=Math.min(A,H);if(I<=0)return;let B=R+I/T;const _=(e.endTime-B)*T,ee=S+I,Q=v(_);let G=Math.min(Math.max(0,ee),Q);const j=J({position:G,store:a,scale:n});G=Math.min(Math.max(0,j??G),Q);const te=G-ee;B=Math.min(e.endTime-.1,Math.max(0,B+te/T)),e.set({delay:G,startTime:B})}else{const A=-W,H=R*T,I=Math.min(A,H);if(I<=0)return;const B=I/T;let _=Math.max(0,R-B);const ee=(e.endTime-_)*T,Q=S-I,G=v(ee);let j=Math.min(Math.max(0,Q),G);const te=J({position:j,store:a,scale:n});j=Math.min(Math.max(0,te??j),G);const Ae=j-Q;_=Math.max(0,Math.min(e.endTime-.1,_+Ae/T)),e.set({delay:j,startTime:_})}else{const A=L/n+P/n;let H=A+W;const I=J({position:H,store:a,scale:n});H=I??H;const B=(H-A)/e.duration,_=Math.min(1,Math.max(e.startTime+.1,k+B));e.set({endTime:_})}},q=()=>{if(window.removeEventListener("mousemove",Z),window.removeEventListener("mouseup",q),f==="start"){const V=J({position:e.delay,store:a,scale:n});if(V!=null&&V!==e.delay){const W=E(e.startTime,e.endTime),A=s(V,W),H=A-e.delay,I=Math.max(0,Math.min(e.endTime-.1,e.startTime+H/T));e.set({delay:A,startTime:I})}}};window.addEventListener("mousemove",Z),window.addEventListener("mouseup",q)};return t.createElement(Le,{style:{left:`${x}px`,top:28*o+"px",width:`${b}px`,height:"24px"},className:"polotno-audio-container"},t.createElement(Pe,{style:{width:"100%",height:"100%",color:"var(--polotno-timeline-audio-color, rgba(0, 161, 255, 0.85))"},onMouseDown:c=>{const f=c.clientX,C=x;c.preventDefault();const L=k=>{k.preventDefault();const R=(k.clientX-f)/n;let S=C/n+R;const T=S+m,Z=J({position:S,store:a,scale:n}),q=J({position:T,store:a,scale:n}),V=Z!==null?Math.abs(S-Z):Number.POSITIVE_INFINITY,W=q!==null?Math.abs(T-q):Number.POSITIVE_INFINITY;let A;A=s(Z!==null&&V<W?Z:q!==null?q-m:S),e.set({delay:s(A)})},P=()=>{window.removeEventListener("mousemove",L),window.removeEventListener("mouseup",P)};window.addEventListener("mousemove",L),window.addEventListener("mouseup",P)}},t.createElement("div",{style:{position:"absolute",left:"4px",top:"50%",transform:"translateY(-50%)",zIndex:10,pointerEvents:"auto"},onClick:c=>{c.stopPropagation(),d()},onMouseDown:c=>c.stopPropagation()},l?t.createElement(ne,{size:14,style:{opacity:.7,cursor:"pointer"}}):t.createElement(we,{size:14,style:{opacity:.7,cursor:"pointer"}})),t.createElement("div",{style:{position:"absolute",inset:"0 0 0 0",display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}},t.createElement("div",{style:{display:"flex",alignItems:"center",width:"100%",height:"100%",gap:"8px",paddingLeft:"22px"}},u&&t.createElement("div",{style:{flex:1,height:"14px",overflow:"hidden",opacity:l?.4:1}},t.createElement(tt,{width:p,height:"14",viewBox:`0 0 ${p} 20`,preserveAspectRatio:"none",style:{width:p+"px",height:"14px",transform:`translateX(-${e.startTime*p}px)`}},t.createElement("path",{d:u}))),y&&t.createElement("div",{style:{flex:1,display:"flex",justifyContent:"center",alignItems:"center"}},t.createElement(Ce,null)))),t.createElement(Re,{onMouseDown:c=>h(c,"start")}),t.createElement(Se,{onMouseDown:c=>h(c,"end")}),t.createElement(ke,{className:"polotno-track-menu",onClick:c=>{c.stopPropagation()},onMouseDown:c=>c.stopPropagation()},t.createElement(ue,{content:t.createElement(pe,{style:{width:"180px"}},t.createElement("div",{style:{padding:"8px 12px"}},t.createElement("div",{style:{fontSize:"12px",marginBottom:"6px",display:"flex",justifyContent:"space-between",alignItems:"center"}},t.createElement("span",null,N("pagesTimeline.volume")),t.createElement("span",null,Math.round(100*e.volume),"%")),t.createElement(_e,{value:e.volume,min:0,max:1,stepSize:.01,labelRenderer:!1,onChange:c=>{const f=Math.max(0,Math.min(1,c));f>0&&r(f),e.set({volume:f})}})),t.createElement(Ee,null),t.createElement(F,{icon:l?t.createElement(we,null):t.createElement(ne,null),text:N(l?"pagesTimeline.unmuteAudio":"pagesTimeline.muteAudio"),onClick:d}),t.createElement(F,{icon:t.createElement(ve,null),text:N("pagesTimeline.duplicateAudio"),onClick:()=>{const c=e.toJSON(),f=(e.endTime-e.startTime)*(e.duration||0),C=e.delay+f,L=a.duration-C;let P=e.delay;L>=f?P=C:L>0&&(P=Math.max(0,a.duration-f));const k=nt(c,["id"]);a.addAudio(Object.assign(Object.assign({},k),{delay:P}))}}),t.createElement(Ee,null),t.createElement(F,{icon:t.createElement(ge,null),text:N("pagesTimeline.removeAudio"),onClick:()=>{a.removeAudio(e.id)}})),position:he.TOP},t.createElement(Y,{icon:t.createElement(fe,null),style:{minHeight:"20px",borderRadius:"10px",padding:"0px"}})))))}),it=X(({store:e,scale:n,width:a})=>{const o=(l=>{const d=[],E=[];return l.forEach(v=>{const s=v.delay,m=v.delay+(v.endTime-v.startTime)*v.duration;let g=0;for(;g<E.length&&E[g]>s;)g++;d.push({audio:v,row:g}),E[g]=m}),d})(e.audios),i=o.reduce((l,d)=>Math.max(l,d.row),-1)+1,r=Math.max(i,1)*at;return o.length?t.createElement("div",{style:{position:"relative",minWidth:a+"px",height:r+"px",marginTop:"12px"},className:"polotno-audios-container"},o.map(({audio:l,row:d})=>t.createElement(ot,{key:l.id,audio:l,scale:n,store:e,index:d}))):null}),rt=26,K=100,U=(e,n,a)=>Math.min(a,Math.max(n,e)),ye=(e,n)=>{const a=e.animations.find(o=>o.type===n);a?a.enabled||e.setAnimation(n,{enabled:!0}):e.setAnimation(n,{})},ce=(e,n,a,o)=>{const i=U(a,0,n-K),r=U(o,i+K,n);ye(e,"enter"),ye(e,"exit"),e.setAnimation("enter",{delay:i}),e.setAnimation("exit",{delay:Math.max(0,n-r)})},lt=X(({element:e,page:n,store:a,scale:o,row:i})=>{const r=n.duration,l=n.startTime,d=l+r,E=U((h=>{var c;const f=h.animations.find(C=>C.type==="enter");return(c=f==null?void 0:f.delay)!==null&&c!==void 0?c:0})(e),0,r),v=U(r-(h=>{var c;const f=h.animations.find(C=>C.type==="exit");return(c=f==null?void 0:f.delay)!==null&&c!==void 0?c:0})(e),E+K,r),s=Math.max(v-E,K)*o,m=(l+E)*o,g=e.name||e.type||N("toolbar.element"),[b,x]=t.useState(null),w=b??i,y=()=>{x(h=>h===null?i:h)},p=()=>{x(null)},u=(h,c)=>{h.preventDefault(),h.stopPropagation(),y();const f=h.clientX,C=E,L=v,P=R=>{R.preventDefault();const S=(R.clientX-f)/o;if(c==="start"){const T=U(l+C+S,l,l+L-K);ce(e,r,T-l,L)}else{const T=U(l+L+S,l+C+K,d);ce(e,r,C,T-l)}},k=()=>{window.removeEventListener("mousemove",P),window.removeEventListener("mouseup",k),p()};window.addEventListener("mousemove",P),window.addEventListener("mouseup",k)};return t.createElement(Le,{style:{left:`${m}px`,top:26*w+"px",width:`${s}px`,height:"22px"}},t.createElement(Pe,{style:{width:"100%",height:"100%",color:"var(--polotno-timeline-element-color, rgba(255, 153, 0, 0.85))",outline:a.selectedElements.find(h=>h.id===e.id)?"2px solid var(--polotno-timeline-element-selected-color, rgba(0, 120, 255, 0.9))":"none",outlineOffset:"-1px"},onMouseDown:h=>{h.preventDefault(),h.stopPropagation(),y();const c=h.clientX,f=E,C=v-f;let L=!1;const P=R=>{R.preventDefault(),L=!0;const S=(R.clientX-c)/o,T=U(l+f+S,l,d-C)-l;ce(e,r,T,T+C)},k=()=>{window.removeEventListener("mousemove",P),window.removeEventListener("mouseup",k),p(),L||a.selectElements([e.id])};window.addEventListener("mousemove",P),window.addEventListener("mouseup",k)}},t.createElement(et,null,g),t.createElement(Re,{onMouseDown:h=>u(h,"start")}),t.createElement(Se,{onMouseDown:h=>u(h,"end")}),t.createElement(ke,{className:"polotno-track-menu",onMouseDown:h=>h.stopPropagation(),onClick:h=>h.stopPropagation()},t.createElement(ue,{content:t.createElement(pe,{style:{width:"140px"}},t.createElement(F,{icon:t.createElement(ve,null),text:N("toolbar.duplicateElements"),onClick:()=>{We([e],a)}}),t.createElement(F,{icon:t.createElement(ge,null),text:N("toolbar.removeElements"),onClick:()=>{a.deleteElements([e.id])}})),position:he.TOP},t.createElement(Y,{icon:t.createElement(fe,null),style:{minHeight:"20px",borderRadius:"10px",padding:"0px"}})))))}),st=X(({store:e,scale:n,width:a})=>{const o=e.pages.slice();if(!o.length)return null;const i=o.flatMap(d=>(E=>{const v=[];for(const s of E.children)s.type==="group"?He(s,m=>{m.type!=="group"&&v.push(m)}):v.push(s);return v})(d).map(E=>({element:E,page:d}))).filter(({element:d})=>d.selectable||e.role===Xe.ADMIN);if(!i.length)return null;const r=(d=>{const E=[],v=[];return d.map(({element:s,page:m})=>{const g=((b,x)=>{var w,y;const p=x.duration,u=b.animations.find(f=>f.type==="enter"),h=b.animations.find(f=>f.type==="exit"),c=Math.max(0,Math.min(p,(w=u==null?void 0:u.delay)!==null&&w!==void 0?w:0));return{start:c,end:Math.max(c+50,Math.min(p,p-((y=h==null?void 0:h.delay)!==null&&y!==void 0?y:0)))}})(s,m);return{element:s,page:m,start:m.startTime+g.start,end:m.startTime+g.end}}).sort((s,m)=>s.start-m.start).forEach(s=>{if(s.end-s.start<50)return;let m=0;for(;m<v.length&&v[m]>s.start;)m++;E.push({element:s.element,page:s.page,row:m,start:s.start,end:s.end}),v[m]=s.end}),E})(i);if(!r.length)return null;const l=(r.reduce((d,E)=>Math.max(d,E.row),-1)+1)*rt;return t.createElement("div",{style:{position:"relative",minWidth:a+"px",height:l+"px",marginTop:"12px"},className:"polotno-elements-container"},r.map(({element:d,row:E,page:v})=>t.createElement(lt,{key:`${v.id}-${d.id}`,element:d,store:e,page:v,scale:n,row:E})))}),ct=M("div")`
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  width: 100%;
  gap: 12px;
`,dt=M("div")`
  display: flex;
  justify-content: flex-end;
`,mt=M("div")`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
`,ut=M("div")`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
`,be=M("div")`
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
`,Me=e=>{const n=Math.floor(e/6e4),a=Math.floor(e%6e4/1e3);return`${n.toString().padStart(2,"0")}:${a.toString().padStart(2,"0")}`},pt=X(({store:e,scale:n,onScaleChange:a})=>{var o;const i=((o=e.activePage)===null||o===void 0?void 0:o.startTime)||0,r=e.isPlaying||e.currentTime!==0?e.currentTime:i;return t.createElement(ct,null,t.createElement(dt,null,t.createElement(be,{style:{opacity:.85,textAlign:"right"}},Me(r)," / ",Me(e.duration))),t.createElement(mt,{className:"polotno-play-button-container"},t.createElement(Y,{icon:e.isPlaying?t.createElement(xe,{size:25}):t.createElement(ae,{size:25}),minimal:!0,onClick:()=>{var l;if(e.isPlaying){const d=e.activePage;e.stop(),d&&e.selectPage(d.id)}else e.play({startTime:((l=e.activePage)===null||l===void 0?void 0:l.startTime)||0})}})),a&&n&&t.createElement(ut,null,t.createElement(be,{style:{opacity:.6,fontSize:"12px"}},"Zoom timeline"),t.createElement(Ge,{minimal:!0},t.createElement(Y,{icon:t.createElement("span",{style:{fontWeight:"bold"}},"−"),onClick:()=>{a&&n&&a(Math.max(n/1.5,.005))},title:"Zoom out timeline"}),t.createElement(Y,{icon:t.createElement("span",{style:{fontWeight:"bold"}},"+"),onClick:()=>{a&&n&&a(Math.min(1.5*n,.2))},title:"Zoom in timeline"}))))}),ht=M("div",t.forwardRef)`
  position: relative;
  height: 24px;
  user-select: none;
  cursor: pointer;
  color: inherit;
`,vt=M("div")`
  margin-top: 4px;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: center;
  opacity: 0.7;
`,gt=X(({store:e,scale:n,minWidth:a=0})=>{const o=t.useRef(null),i=Math.max(e.duration,0),r=Math.max(1,Math.ceil(i/1e3)),l=Math.max(i*n,a,120),d=1/(1/(1e3*n)),E=[1,2,5,10,15,30,60,120,300,600],v=E.find(p=>p*d>=70)||E[E.length-1],s=Math.max(1,Math.ceil(20/d)),m=t.useCallback(p=>Math.max(0,Math.min(p,e.duration)),[e.duration]),g=t.useCallback(p=>{var u;if(!o.current)return;const h=o.current.getBoundingClientRect(),c=Math.min(Math.max(p-h.left,0),h.width),f=m(c/n);e.setCurrentTime(f),(u=e.checkActivePage)===null||u===void 0||u.call(e)},[m,n,e]),b=t.useCallback(p=>{g(p);const u=c=>{c.preventDefault(),g(c.clientX)},h=()=>{window.removeEventListener("mousemove",u),window.removeEventListener("mouseup",h)};window.addEventListener("mousemove",u),window.addEventListener("mouseup",h)},[g]),x=t.useCallback(p=>{g(p);const u=c=>{const f=c.touches[0];f&&(c.preventDefault(),g(f.clientX))},h=()=>{window.removeEventListener("touchmove",u),window.removeEventListener("touchend",h),window.removeEventListener("touchcancel",h)};window.addEventListener("touchmove",u,{passive:!1}),window.addEventListener("touchend",h),window.addEventListener("touchcancel",h)},[g]),w=t.useCallback(p=>{p.preventDefault(),b(p.clientX)},[b]),y=t.useCallback(p=>{const u=p.touches[0];u&&(p.preventDefault(),x(u.clientX))},[x]);return t.createElement(ht,{ref:o,className:"polotno-time-ruler",onMouseDown:w,onTouchStart:y,style:{minWidth:l+"px",width:l+"px",touchAction:"none"}},Array.from({length:r+1},(p,u)=>{const h=1e3*u*n,c=u%v===0,f=u%s===0&&!c;return c||f?t.createElement("div",{key:u,style:{position:"absolute",left:h+"px",top:0,transform:"translateX(-50%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",gap:4,pointerEvents:"none"}},f&&t.createElement("div",{style:{width:4,height:4,borderRadius:"50%",backgroundColor:"currentColor",opacity:.5}}),c&&t.createElement(vt,null,u<60?`${u}s`:`${Math.floor(u/60)}m${u%60?u%60+"s":""}`)):null}))}),ft=M("div")`
  position: relative;
  height: 0px;
`,xt=M("div")`
  position: absolute;
  bottom: 5px;
  width: auto;
  left: 5px;
  overflow: hidden;
  box-shadow: 0 0 4px lightgrey;
  border-radius: 5px;
  z-index: 1;
`,Et=M("div")`
  position: absolute;
  top: 0;
  left: 0px;
  right: 0px;
  height: 14px;
  transform: translateY(-50%);
  cursor: ns-resize;
  display: flex;
  align-items: center;
  justify-content: center;

  &::before {
    content: '';
    width: 100%;
    height: 4px;
    border-radius: 2px;
    background: rgba(0, 0, 0, 0);
    transition: background 0.2s;
  }

  &:hover::before,
  &.active::before {
    background: var(--polotno-accent-color, #137cbd);
  }
`,St=X(({store:e,defaultOpened:n=!1})=>{const a=t.useRef(null),[o,i]=t.useState(n),[r,l]=t.useState(.02),[d,E]=t.useState(()=>(p=>{if(!D.animationsEnabled)return 65;const u=p.pages.reduce((c,f)=>c+f.children.length,0),h=25*p.audios.length+20*u+140;return Math.min(Math.max(h,140),420)})(e)),[v,s]=t.useState(!1),m=t.useRef(0),g=t.useRef(d),b=t.useRef(!1),x=e.duration*r,w=t.useCallback(p=>{if(!b.current)return;const u=p.clientY-m.current,h=g.current-u,c=Math.min(420,Math.max(140,h));E(c)},[]),y=t.useCallback(()=>{b.current&&(b.current=!1,s(!1),window.removeEventListener("mousemove",w),window.removeEventListener("mouseup",y))},[w]);return t.useEffect(()=>()=>{window.removeEventListener("mousemove",w),window.removeEventListener("mouseup",y)},[w,y]),t.createElement(t.Fragment,null,t.createElement(ft,null,t.createElement(xt,null,t.createElement(oe,{style:{height:"35px",padding:"0 5px"}},t.createElement(oe.Group,{style:{height:"35px"}},t.createElement(Y,{minimal:!0,onClick:()=>{i(!o)},icon:D.animationsEnabled&&!o?t.createElement(ae,null):null},N("pagesTimeline.pages")))))),t.createElement(oe,{style:{padding:"5px",height:"auto",zIndex:1,position:"relative",overflow:"visible",display:o?"block":"none"},className:"polotno-pages-timeline"},D.animationsEnabled&&t.createElement(Et,{onMouseDown:p=>{p.preventDefault(),m.current=p.clientY,g.current=d,b.current=!0,s(!0),window.addEventListener("mousemove",w),window.addEventListener("mouseup",y)},className:v?"active":void 0,title:"Drag to adjust timeline height"}),D.animationsEnabled&&t.createElement("div",{style:{display:"flex",justifyContent:"center"}},t.createElement(pt,{store:e,scale:r,onScaleChange:l})),t.createElement("div",{dir:"ltr",style:{width:"100%",position:"relative",height:d}},t.createElement("div",{style:{position:"absolute",top:0,left:0,right:0,bottom:0,overflowX:"auto",padding:"0 24px"},ref:a},t.createElement("div",{style:{position:"relative",minWidth:D.animationsEnabled?x+"px":void 0}},D.animationsEnabled&&t.createElement(gt,{store:e,scale:r,minWidth:x}),t.createElement("div",{style:{position:"relative",display:"flex"}},t.createElement("div",{style:{position:"relative",minWidth:D.animationsEnabled?x+"px":void 0,height:"60px"}},t.createElement(qe,{store:e,scale:r})),t.createElement(Y,{icon:t.createElement(Ve,null),style:{width:"60px",marginLeft:"12px"},onClick:()=>{var p;e.addPage({bleed:((p=e.activePage)===null||p===void 0?void 0:p.bleed)||0})},minimal:!0})),D.animationsEnabled&&t.createElement(t.Fragment,null,t.createElement(st,{store:e,scale:r,width:x}),t.createElement(it,{store:e,scale:r,width:x})),D.animationsEnabled&&t.createElement(Ue,{store:e,scale:r,dragAreaRef:a,variant:"timeline"}))))))});export{St as PagesTimeline};
