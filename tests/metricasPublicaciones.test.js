import { describe, it, expect } from 'vitest';
import { metricasFacebook, metricasInstagram, metricasYoutube, medirDestino } from '../supabase/functions/_shared/metricas.mjs';

// fetch de mentira: contesta por orden y apunta las URLs. Sin red.
function fetchFalso(respuestas) {
  const pedidos = [];
  let i = 0;
  const fn = async (url, init = {}) => {
    pedidos.push({ url, init });
    const r = respuestas[i++] || {};
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.body ?? {} };
  };
  fn.pedidos = pedidos;
  return fn;
}

describe('metricasFacebook', () => {
  it('reacciones, comentarios y compartidos; alcance si hay insights', async () => {
    const f = fetchFalso([
      { body: { reactions: { summary: { total_count: 12 } }, comments: { summary: { total_count: 3 } }, shares: { count: 2 } } },
      { body: { data: [{ name: 'post_impressions_unique', values: [{ value: 540 }] }, { name: 'post_impressions', values: [{ value: 800 }] }] } },
    ]);
    const m = await metricasFacebook({ fetchFn: f, token: 'T', id: 'PAG_1' });
    expect(m).toMatchObject({ ok: true, likes: 12, comments: 3, shares: 2, reach: 540, impressions: 800 });
    expect(f.pedidos[0].init.headers.Authorization).toBe('Bearer T');
    expect(f.pedidos[0].url).not.toContain('access_token');
  });

  it('sin permiso de insights no inventa el alcance: queda null', async () => {
    const f = fetchFalso([
      { body: { reactions: { summary: { total_count: 1 } }, comments: { summary: { total_count: 0 } } } },
      { status: 400, body: { error: { message: '(#10) requires read_insights' } } },
    ]);
    const m = await metricasFacebook({ fetchFn: f, token: 'T', id: 'X' });
    expect(m.ok).toBe(true);
    expect(m.reach).toBeNull();
    expect(m.shares).toBe(0);   // Meta omite "shares" cuando es cero
  });
});

describe('metricasInstagram', () => {
  it('feed: me gusta, comentarios, alcance, vistas, guardados', async () => {
    const f = fetchFalso([
      { body: { like_count: 20, comments_count: 4 } },
      { body: { data: [{ name: 'reach', values: [{ value: 300 }] }, { name: 'views', values: [{ value: 450 }] }, { name: 'saved', values: [{ value: 5 }] }, { name: 'shares', values: [{ value: 1 }] }] } },
    ]);
    const m = await metricasInstagram({ fetchFn: f, token: 'T', id: 'IG1' });
    expect(m).toMatchObject({ ok: true, likes: 20, comments: 4, reach: 300, views: 450, saves: 5, shares: 1 });
    expect(f.pedidos[1].url).toContain('metric=reach,views,saved,shares');
  });

  it('historia: pide sus métricas propias y las respuestas cuentan como comentarios', async () => {
    const f = fetchFalso([
      { body: { like_count: 0, comments_count: 0 } },
      { body: { data: [{ name: 'reach', values: [{ value: 90 }] }, { name: 'replies', values: [{ value: 2 }] }] } },
    ]);
    const m = await metricasInstagram({ fetchFn: f, token: 'T', id: 'ST1', historia: true });
    expect(f.pedidos[1].url).toContain('metric=reach,views,replies,shares');
    expect(m).toMatchObject({ reach: 90, comments: 2, likes: null, saves: null });
  });
});

describe('metricasYoutube', () => {
  it('vistas, me gusta y comentarios', async () => {
    const f = fetchFalso([{ body: { items: [{ statistics: { viewCount: '98', likeCount: '7', commentCount: '1' } }] } }]);
    expect(await metricasYoutube({ fetchFn: f, token: 'T', id: 'V1' })).toMatchObject({ ok: true, views: 98, likes: 7, comments: 1 });
  });
});

describe('medirDestino', () => {
  it('no mide lo que no se puede: historia de Facebook y TikTok devuelven null sin red', async () => {
    const f = fetchFalso([]);
    expect(await medirDestino({ fetchFn: f, token: 'T', platform: 'facebook', placement: 'story', id: 'X' })).toBeNull();
    expect(await medirDestino({ fetchFn: f, token: 'T', platform: 'tiktok', placement: 'reel', id: 'X' })).toBeNull();
    expect(f.pedidos.length).toBe(0);
  });
});
