// ════════════════════════════════════════════════════════════════════════
//  UN VIDEO VERTICAL A PARTIR DE UNA IMAGEN
// ════════════════════════════════════════════════════════════════════════
//  TikTok y YouTube Shorts piden video; el Comercial-Creativo entrega
//  imágenes. Mientras no haya video de verdad, el dueño lo pidió así: "que se
//  utilice la misma imagen tipo vertical para YouTube y TikTok".
//
//  Se graba en el navegador: la imagen de la historia en un lienzo 1080×1920,
//  con un acercamiento lento de 8 segundos para que no sea una foto congelada
//  (las dos plataformas empujan menos lo que no se mueve). Sin servidor y sin
//  pagar por un servicio de video.
//
//  Formato: MP4 si el navegador lo sabe grabar (Chrome reciente sí), y si no
//  WebM. TikTok acepta los dos por su API y YouTube también.
// ════════════════════════════════════════════════════════════════════════

const TIPOS = [
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

function cargarImagen(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Sin esto el lienzo queda "manchado" por venir de otro dominio y el
    // navegador se niega a grabarlo. El almacenamiento público lo permite.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo abrir la imagen de la historia.'));
    img.src = url;
  });
}

/** Qué formato de video sabe grabar este navegador, o null si ninguno. */
export function formatoDeVideo() {
  if (typeof window === 'undefined' || !window.MediaRecorder?.isTypeSupported) return null;
  return TIPOS.find((t) => window.MediaRecorder.isTypeSupported(t)) || null;
}

/**
 * Graba un video vertical con la imagen.
 * @returns {Promise<{blob: Blob, mime: string, ext: string}>}
 */
export async function videoDesdeImagen(url, {
  segundos = 8, ancho = 1080, alto = 1920, fps = 30, acercamiento = 0.08,
} = {}) {
  const tipo = formatoDeVideo();
  if (!tipo) throw new Error('Este navegador no puede grabar video. Usa Chrome o Edge.');

  const img = await cargarImagen(url);
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext('2d');

  // "Cubrir": la imagen llena el 9:16 entero, recortando si no es exacta, y
  // se acerca poco a poco desde el centro.
  const dibujar = (t) => {
    const escala = Math.max(ancho / img.width, alto / img.height) * (1 + acercamiento * t);
    const w = img.width * escala;
    const h = img.height * escala;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(img, (ancho - w) / 2, (alto - h) / 2, w, h);
  };

  const flujo = lienzo.captureStream(fps);
  const grabadora = new MediaRecorder(flujo, { mimeType: tipo, videoBitsPerSecond: 6_000_000 });
  const trozos = [];
  grabadora.ondataavailable = (e) => { if (e.data && e.data.size) trozos.push(e.data); };
  const terminado = new Promise((resolve) => { grabadora.onstop = resolve; });

  dibujar(0);
  grabadora.start(250);
  const inicio = performance.now();

  // setInterval y no requestAnimationFrame: rAF se detiene si el dueño cambia
  // de pestaña mientras se graba, y el video se quedaba a medias.
  await new Promise((resolve) => {
    const reloj = setInterval(() => {
      const t = Math.min(1, (performance.now() - inicio) / (segundos * 1000));
      dibujar(t);
      if (t >= 1) { clearInterval(reloj); resolve(); }
    }, 1000 / fps);
  });

  grabadora.stop();
  await terminado;
  flujo.getTracks().forEach((pista) => pista.stop());

  const mime = tipo.split(';')[0];
  const blob = new Blob(trozos, { type: mime });
  if (!blob.size) throw new Error('El video salió vacío. Vuelve a intentarlo.');
  return { blob, mime, ext: mime === 'video/mp4' ? 'mp4' : 'webm' };
}
