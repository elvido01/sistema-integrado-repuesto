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

/** Las dos líneas de texto del pie (ESC/POS y PDF), sin acentos si se pide. */
export const pieMotoFlowLineasTexto = (sinAcentos = false) => {
  const n = sinAcentos ? PIE_MOTOFLOW_NOMBRE.normalize('NFD').replace(/[̀-ͯ]/g, '') : PIE_MOTOFLOW_NOMBRE;
  return [n, MOTOFLOW_URL];
};

export const MOTOFLOW_URL = 'motoflow.com.do';
export const PIE_MOTOFLOW_NOMBRE = 'Sistema de Gestión MotoFlow';

// Con su margen blanco de 4 módulos (lo que pide la norma del QR) para que
// el celular lo lea en papel térmico: 33 módulos en 14 mm ≈ 0.42 mm cada uno.
const QR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 33 33" shape-rendering="crispEdges"><path fill="#ffffff" d="M0 0h33v33H0z"/><path stroke="#000000" d="M4 4.5h7m9 0h1m1 0h7M4 5.5h1m5 0h1m2 0h1m2 0h2m1 0h1m2 0h1m5 0h1M4 6.5h1m1 0h3m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h3m1 0h1M4 7.5h1m1 0h3m1 0h1m1 0h1m1 0h5m3 0h1m1 0h3m1 0h1M4 8.5h1m1 0h3m1 0h1m1 0h1m2 0h1m1 0h1m4 0h1m1 0h3m1 0h1M4 9.5h1m5 0h1m1 0h1m1 0h1m2 0h4m1 0h1m5 0h1M4 10.5h7m1 0h1m1 0h1m1 0h1m1 0h1m1 0h1m1 0h7M12 11.5h5m1 0h1m1 0h1M4 12.5h1m1 0h5m4 0h1m1 0h4m1 0h5M4 13.5h5m2 0h1m3 0h3m2 0h1m2 0h1m3 0h1M4 14.5h1m1 0h2m1 0h2m4 0h1m2 0h4m1 0h1m1 0h1m1 0h2M5 15.5h5m2 0h1m1 0h3m1 0h1m1 0h2m1 0h2m3 0h1M8 16.5h1m1 0h2m1 0h5m3 0h2m1 0h1m1 0h3M4 17.5h1m3 0h1m2 0h1m5 0h1m2 0h2m1 0h1m1 0h1m1 0h1M4 18.5h1m2 0h4m2 0h1m1 0h5m1 0h5m1 0h2M4 19.5h1m1 0h1m2 0h1m2 0h4m3 0h2m1 0h3m3 0h1M4 20.5h1m1 0h3m1 0h2m3 0h1m1 0h2m1 0h5m1 0h1M12 21.5h1m1 0h1m1 0h1m2 0h2m3 0h2M4 22.5h7m2 0h1m4 0h1m1 0h1m1 0h1m1 0h1m1 0h3M4 23.5h1m5 0h1m1 0h1m1 0h1m1 0h1m3 0h1m3 0h2m1 0h1M4 24.5h1m1 0h3m1 0h1m1 0h2m2 0h9m1 0h3M4 25.5h1m1 0h3m1 0h1m1 0h1m1 0h1m2 0h1m1 0h4m1 0h5M4 26.5h1m1 0h3m1 0h1m1 0h2m1 0h4m6 0h2m1 0h1M4 27.5h1m5 0h1m4 0h1m2 0h4m1 0h3m2 0h1M4 28.5h7m1 0h5m4 0h1m1 0h6"/></svg>';

/** HTML del pie (para printPOS): QR chico a la izquierda + texto. */
export const pieMotoFlowHtml = () => (!_visible ? '' : `
  <div style="border-top:1px dashed #000; margin-top:6px; padding-top:4px; display:flex; align-items:center; justify-content:center; gap:2px;">
    <div style="width:14mm; height:14mm; flex:0 0 14mm; background:#fff;">${QR_SVG.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
    <div style="font-size:9px; line-height:1.2; text-align:left;">
      <div style="font-weight:bold;">${PIE_MOTOFLOW_NOMBRE}</div>
      <div>${MOTOFLOW_URL}</div>
    </div>
  </div>`);
