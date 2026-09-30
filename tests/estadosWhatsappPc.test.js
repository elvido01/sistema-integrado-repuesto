import { describe, it, expect } from 'vitest';
import { slug, nombresDe } from '../scripts/estados-whatsapp-pc.mjs';

describe('estados-whatsapp-pc: nombres predecibles para la carpeta', () => {
  it('fecha de Santo Domingo + pieza sin tildes + formato', () => {
    const n = nombresDe({
      titulo: 'Cigüeñal Stryker 125', creado_en: '2026-10-01T02:30:00Z',   // aún 30/09 en Santo Domingo
      imagen_url: 'https://x/promos/abc.png', video_url: 'https://x/promos/abc-vertical.mp4',
    });
    expect(n.imagen).toBe('2026-09-30_ciguenal-stryker-125_historia_9x16.png');
    expect(n.video).toBe('2026-09-30_ciguenal-stryker-125_reel_9x16.mp4');
  });

  it('sin video no inventa nombre de video, y la extensión sale del enlace', () => {
    const n = nombresDe({ titulo: 'Banda', creado_en: '2026-09-30T12:00:00Z', imagen_url: 'https://x/a.jpeg?t=1', video_url: null });
    expect(n.imagen).toBe('2026-09-30_banda_historia_9x16.jpeg');
    expect(n.video).toBeNull();
  });

  it('un título raro no rompe el nombre del archivo', () => {
    expect(slug('ACEITE 20W/50 "MINERAL" <1L>')).toBe('aceite-20w-50-mineral-1l');
    expect(slug('')).toBe('promocion');
  });
});
