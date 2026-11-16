// (16/11/2026) Pie de "hecho con MotoFlow" en los recibos térmicos (80 mm /
// 4") que se le dan al cliente: publicidad gratis, como hacen otros sistemas
// de punto de venta. QR fijo a https://motoflow.com.do (generado una vez con
// la librería qrcode; no cambia) y una línea de texto. Solo recibos térmicos
// del cliente; carta/media carta y los papeles internos no lo llevan.

// Va en todas las empresas; solo el súper admin lo quita (tenants.sin_pie_motoflow,
// Panel Admin → detalle de la empresa). Lo pone setEmpresaPrintConfig.
let _visible = true;
export const setPieMotoFlowVisible = (v) => { _visible = v !== false; };
export const pieMotoFlowVisible = () => _visible;

export const MOTOFLOW_URL = 'motoflow.com.do';
export const PIE_MOTOFLOW_TEXTO = 'Sistema de Gestión MotoFlow · motoflow.com.do';

const QR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 25" shape-rendering="crispEdges"><path fill="#ffffff" d="M0 0h25v25H0z"/><path stroke="#000000" d="M0 0.5h7m9 0h1m1 0h7M0 1.5h1m5 0h1m2 0h1m2 0h2m1 0h1m2 0h1m5 0h1M0 2.5h1m1 0h3m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h3m1 0h1M0 3.5h1m1 0h3m1 0h1m1 0h1m1 0h5m3 0h1m1 0h3m1 0h1M0 4.5h1m1 0h3m1 0h1m1 0h1m2 0h1m1 0h1m4 0h1m1 0h3m1 0h1M0 5.5h1m5 0h1m1 0h1m1 0h1m2 0h4m1 0h1m5 0h1M0 6.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M8 7.5h5m1 0h1m1 0h1M0 8.5h1m1 0h5m4 0h1m1 0h4m1 0h5M0 9.5h5m2 0h1m3 0h3m2 0h1m2 0h1m3 0h1M0 10.5h1m1 0h2m1 0h2m4 0h1m2 0h4m1 0h1m1 0h1m1 0h2M1 11.5h5m2 0h1m1 0h3m1 0h1m1 0h2m1 0h2m3 0h1M4 12.5h1m1 0h2m1 0h5m3 0h2m1 0h1m1 0h3M0 13.5h1m3 0h1m2 0h1m5 0h1m2 0h2m1 0h1m1 0h1m1 0h1M0 14.5h1m2 0h4m2 0h1m1 0h5m1 0h5m1 0h2M0 15.5h1m1 0h1m2 0h1m2 0h4m3 0h2m1 0h3m3 0h1M0 16.5h1m1 0h3m1 0h2m3 0h1m1 0h2m1 0h5m1 0h1M8 17.5h1m1 0h1m1 0h1m2 0h2m3 0h2M0 18.5h7m2 0h1m4 0h1m1 0h1m1 0h1m1 0h1m1 0h3M0 19.5h1m5 0h1m1 0h1m1 0h1m1 0h1m3 0h1m3 0h2m1 0h1M0 20.5h1m1 0h3m1 0h1m1 0h2m2 0h9m1 0h3M0 21.5h1m1 0h3m1 0h1m1 0h1m1 0h1m2 0h1m1 0h4m1 0h5M0 22.5h1m1 0h3m1 0h1m1 0h2m1 0h4m6 0h2m1 0h1M0 23.5h1m5 0h1m4 0h1m2 0h4m1 0h3m2 0h1M0 24.5h7m1 0h5m4 0h1m1 0h6"/></svg>';

/** HTML del pie (para printPOS): QR chico a la izquierda + texto. */
export const pieMotoFlowHtml = () => (!_visible ? '' : `
  <div style="border-top:1px dashed #000; margin-top:6px; padding-top:4px; display:flex; align-items:center; justify-content:center; gap:5px;">
    <div style="width:12mm; height:12mm; flex:0 0 12mm; padding:1mm; background:#fff;">${QR_SVG.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
    <div style="font-size:9px; line-height:1.2; text-align:left;">
      <div style="font-weight:bold;">Sistema de Gestión MotoFlow</div>
      <div>${MOTOFLOW_URL}</div>
    </div>
  </div>`);
