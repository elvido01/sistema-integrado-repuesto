// firmaUtils.js — Deja una firma lista para estamparla en la factura.
//
// El problema práctico: nadie tiene la firma en PNG transparente. Lo que hay
// es una FOTO de la firma en un papel. Si esa foto se pega tal cual en el
// PDF, el fondo del papel sale como un recuadro gris encima de la línea de
// "Entregado por" y la factura se ve rota.
//
// Esto la limpia sin pedirle al usuario que aprenda a usar un editor:
//   1. Averigua el color del FONDO mirando las cuatro esquinas.
//   2. Vuelve transparente todo lo que se le parezca, con un borde suave
//      para no dejar el trazo dentado.
//   3. Recorta el espacio vacío que sobra alrededor.
//
// Funciona con tinta sobre papel (el caso normal). Con una imagen de fondo
// oscuro y degradado el resultado es peor, porque el degradado no se parece
// a ninguna esquina — de ahí que convenga partir de la foto del papel.

// Distancia de color simple. Alcanza: no hace falta precisión perceptual
// para separar tinta de papel, y es mucho más rápida.
const distancia = (r1, g1, b1, r2, g2, b2) =>
  Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);

// Color de fondo = promedio de las cuatro esquinas. Se usan bloques y no un
// solo píxel para que una mota o un pixel quemado no decida por todos.
const colorDeFondo = (data, w, h) => {
  const lado = Math.max(4, Math.floor(Math.min(w, h) * 0.06));
  const esquinas = [[0, 0], [w - lado, 0], [0, h - lado], [w - lado, h - lado]];
  let r = 0, g = 0, b = 0, n = 0;
  esquinas.forEach(([x0, y0]) => {
    for (let y = y0; y < y0 + lado; y++) {
      for (let x = x0; x < x0 + lado; x++) {
        const i = (y * w + x) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
    }
  });
  return [r / n, g / n, b / n];
};

/**
 * Limpia el fondo de una firma y la recorta.
 * @param {File|Blob} file
 * @returns {Promise<Blob|null>} PNG transparente, o null si no se pudo
 */
export const limpiarFirmaPNG = (file) => new Promise((resolve) => {
  const url = URL.createObjectURL(file);
  const img = new Image();

  img.onload = () => {
    try {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);

      const imgData = ctx.getImageData(0, 0, w, h);
      const d = imgData.data;

      // Si YA viene con transparencia, no se toca. Un PNG ya recortado no
      // necesita limpieza, y peor: sus esquinas transparentes darían un
      // color de fondo falso y se comerían el trazo.
      let transparentes = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] < 250) transparentes++;
      if (transparentes > (d.length / 4) * 0.05) {
        resolve(null);
        return;
      }

      const [br, bg, bb] = colorDeFondo(d, w, h);

      // Por debajo de TOL_FUERA es fondo; por encima de TOL_DENTRO es trazo.
      // En medio se hace un degradado de opacidad, que es lo que evita el
      // borde dentado del recorte.
      const TOL_FUERA = 55;
      const TOL_DENTRO = 115;

      let minX = w, minY = h, maxX = -1, maxY = -1;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const dist = distancia(d[i], d[i + 1], d[i + 2], br, bg, bb);
          let alpha;
          if (dist <= TOL_FUERA) alpha = 0;
          else if (dist >= TOL_DENTRO) alpha = 255;
          else alpha = Math.round(((dist - TOL_FUERA) / (TOL_DENTRO - TOL_FUERA)) * 255);
          d[i + 3] = alpha;

          if (alpha > 25) {   // lo que de verdad se ve marca el recorte
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      // Si no quedó nada (o quedó todo), la imagen no era una firma sobre un
      // fondo plano: se devuelve el original y que decida el usuario.
      const areaUtil = (maxX - minX) * (maxY - minY);
      if (maxX < 0 || areaUtil <= 0 || areaUtil > w * h * 0.97) {
        resolve(null);
        return;
      }

      ctx.putImageData(imgData, 0, 0);

      // Recorte con un respiro, para que el trazo no toque el borde.
      const margen = Math.round(Math.max(w, h) * 0.01);
      const cx = Math.max(0, minX - margen);
      const cy = Math.max(0, minY - margen);
      const cw = Math.min(w - cx, maxX - minX + margen * 2);
      const chh = Math.min(h - cy, maxY - minY + margen * 2);

      const out = document.createElement('canvas');
      out.width = cw; out.height = chh;
      out.getContext('2d').drawImage(canvas, cx, cy, cw, chh, 0, 0, cw, chh);

      out.toBlob((blob) => resolve(blob), 'image/png');
    } catch (e) {
      resolve(null);
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
  img.src = url;
});
