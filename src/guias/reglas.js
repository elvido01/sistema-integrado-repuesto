// Reglas puras de las guías (se prueban en tests/guias.test.js).

/** '1.4' → 1 */
export const versionMayor = (v) => {
  const n = parseInt(String(v ?? '').split('.')[0], 10);
  return Number.isFinite(n) ? n : 0;
};

/**
 * ¿Qué hacer con una guía al entrar a su módulo?
 *   'ofrecer'   nunca la tocó, o la versión MAYOR cambió desde que la hizo
 *   'continuar' la dejó a medias (misma versión mayor)
 *   null        ya la completó u omitió: no se vuelve a mostrar sola
 */
export function queHacerConGuia(guia, progreso) {
  if (!guia) return null;
  if (!progreso) return 'ofrecer';
  if (versionMayor(progreso.version) < versionMayor(guia.version)) return 'ofrecer';
  if (progreso.estado === 'iniciada') return 'continuar';
  return null;
}

/** El paso guardado acotado a la guía de hoy (pudo quitarse un paso en un retoque). */
export function pasoValido(guia, paso) {
  const n = guia?.pasos?.length || 0;
  if (!n) return 0;
  const p = Number.isFinite(Number(paso)) ? Math.trunc(Number(paso)) : 0;
  return Math.min(Math.max(0, p), n - 1);
}

/** ¿La guía aplica a esta empresa y este usuario? */
export function guiaDisponible(guia, { tipoNegocio, plataforma = 'web', puedeAbrir = () => true } = {}) {
  if (!guia) return false;
  if (!(guia.plataformas || ['web']).includes(plataforma)) return false;
  if ((guia.tiposExcluidos || []).includes(String(tipoNegocio || 'repuestos').toLowerCase())) return false;
  return !!puedeAbrir(guia.modulo);
}

/** Dónde poner la ventanita: debajo si cabe, si no arriba; nunca fuera de la pantalla. */
export function posicionVentanita(rect, { ancho = 320, alto = 190, vw = 1280, vh = 800, margen = 12 } = {}) {
  if (!rect) return { top: Math.max(margen, vh / 2 - alto / 2), left: Math.max(margen, vw / 2 - ancho / 2) };
  const abajo = rect.bottom + margen;
  const top = abajo + alto <= vh ? abajo : Math.max(margen, rect.top - alto - margen);
  const left = Math.min(Math.max(margen, rect.left), Math.max(margen, vw - ancho - margen));
  return { top, left };
}
