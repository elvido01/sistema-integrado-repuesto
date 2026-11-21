import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/customSupabaseClient', () => ({ supabase: {} }));
const { agruparPromociones } = await import('@/components/equipo/CalendarioPromociones');

const job = (o) => ({ id: o.id, publication_bundle_id: 'b' in o ? o.b : 'b1', status: o.s || 'published', channels: o.ch || ['facebook'],
  title: 'BATERIA', producto_id: 'p1', media_type: o.mt || 'image', placement: o.pl || 'both', image_url: 'https://x/f.png',
  scheduled_for: o.sf || null, completed_at: o.ca || null, created_at: o.cr || '2026-11-20T22:00:00Z' });

describe('agruparPromociones', () => {
  it('una promoción por bundle, con todas sus redes y su día en hora de RD', () => {
    const [p, ...resto] = agruparPromociones([
      job({ id: 1, ch: ['facebook'] }), job({ id: 2, ch: ['instagram'], mt: 'video', pl: 'reel' }),
    ]);
    expect(resto).toEqual([]);
    expect(p.redes).toEqual(['facebook', 'instagram']);
    expect(p.dia).toBe('2026-11-20'); // 6 pm en RD
    expect(p.miniatura).toBe('https://x/f.png');
  });

  it('las 2 am UTC todavía son el día anterior en RD', () => {
    const [p] = agruparPromociones([job({ id: 1, cr: '2026-11-21T02:30:00Z' })]);
    expect(p.dia).toBe('2026-11-20');
  });

  it('estado: publicada, programada, borrador y fallida', () => {
    const ahora = Date.parse('2026-11-21T12:00:00Z');
    const est = (js) => agruparPromociones(js, ahora)[0].estado;
    expect(est([job({ id: 1, s: 'published' }), job({ id: 2, s: 'failed' })])).toBe('publicada');
    expect(est([job({ id: 1, s: 'queued', sf: '2026-11-22T22:00:00Z' })])).toBe('programada');
    expect(est([job({ id: 1, s: 'draft' })])).toBe('borrador');
    expect(est([job({ id: 1, s: 'failed' }), job({ id: 2, s: 'draft' })])).toBe('fallo');
    expect(est([job({ id: 1, s: 'processing' })])).toBe('proceso');
  });

  it('sin bundle, cada trabajo es su propia promoción', () => {
    expect(agruparPromociones([job({ id: 1, b: null }), job({ id: 2, b: null })])).toHaveLength(2);
  });
});
