import { describe, it, expect } from 'vitest';
import { mediaDeBundle, precioDelArte, textosReuso, telefonoDe, hashtagsDe } from '@/lib/textoReuso';

const jobs = [
  { placement: 'both', media_type: 'image', image_url: 'https://x/feed.png', precio_mostrado: '300.00', created_at: '2026-11-01T10:00:00Z' },
  { placement: 'story', media_type: 'image', image_url: 'https://x/hist.png', precio_mostrado: '300.00', created_at: '2026-11-01T10:00:00Z' },
  { placement: 'reel', media_type: 'video', media_url: 'https://x/reel.mp4', precio_mostrado: '300.00', created_at: '2026-11-01T10:00:00Z' },
];

const viejos = {
  facebook: 'Protección para tu motor\n\nConsigue el ACEITE RS8 a solo RD$ 300.00. Contáctanos: 809-390-5965.',
  instagram: 'Cuida tu motor\n\nACEITE RS8 por RD$ 300.00. 📞 809-390-5965',
  tiktok: 'Protege tu moto con el Aceite RS8. #AceiteMoto #RepuestosMorla #Higuey',
};

describe('mediaDeBundle', () => {
  it('saca feed, historia y reel del bundle anterior', () => {
    expect(mediaDeBundle(jobs)).toEqual({
      imagen_feed: 'https://x/feed.png', imagen_historia: 'https://x/hist.png', video: 'https://x/reel.mp4',
    });
  });
  it('sin historia propia usa la imagen "both"; sin nada devuelve vacío', () => {
    expect(mediaDeBundle([jobs[0]]).imagen_historia).toBe('https://x/feed.png');
    expect(mediaDeBundle([])).toEqual({});
  });
  it('el precio del arte es el que mostraba la publicación', () => {
    expect(precioDelArte(jobs)).toBe(300);
    expect(precioDelArte([])).toBeNull();
  });
});

describe('textosReuso', () => {
  it('usa el precio de hoy, el teléfono y los hashtags del anterior', () => {
    const t = textosReuso({ descripcion: 'ACEITE RS8 10W-40 1L', precio: 325, textosViejos: viejos, semilla: '2026-11-21' });
    expect(t.facebook).toContain('ACEITE RS8 10W-40 1L a RD$ 325');
    expect(t.facebook).toContain('809-390-5965');
    expect(t.instagram).toContain('#AceiteMoto');
    expect(t.tiktok).not.toContain('300');
    expect(Object.keys(t)).toEqual(['facebook', 'instagram', 'tiktok', 'youtube']);
  });
  it('nunca repite la primera línea del texto anterior', () => {
    for (let d = 1; d <= 30; d += 1) {
      const semilla = `2026-11-${String(d).padStart(2, '0')}`;
      const t = textosReuso({ descripcion: 'X', precio: 1, textosViejos: { facebook: '¡La tenemos disponible!\n\nX' }, semilla });
      expect(t.facebook.split('\n')[0]).not.toBe('¡La tenemos disponible!');
    }
  });
  it('sin texto anterior no inventa teléfono ni hashtags', () => {
    const t = textosReuso({ descripcion: 'GOMA 90/90-18', precio: 1500, semilla: 'a' });
    expect(t.facebook).not.toMatch(/\d{3}-\d{3}-\d{4}/);
    expect(t.instagram).not.toContain('#');
  });
  it('lee teléfono y hashtags sin repetir', () => {
    expect(telefonoDe({ a: 'llama al 829 555 1234' })).toBe('829-555-1234');
    expect(hashtagsDe({ a: '#Moto #moto #Higüey', b: '#Higuey' })).toEqual(['#Moto', '#Higüey']);
  });
});
