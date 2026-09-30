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
  it('pide cada estadística por separado y suma las reacciones por tipo', async () => {
    const f = fetchFalso([
      { status: 400, body: { error: { message: '(#10) requires pages_read_user_content' } } },   // post
      { status: 400, body: { error: { message: '(#100) The value must be a valid insights metric' } } },   // impressions_unique
      { status: 400, body: { error: { message: '(#100) The value must be a valid insights metric' } } },   // impressions
      { body: { data: [{ name: 'post_clicks', values: [{ value: 9 }] }] } },
      { body: { data: [{ name: 'post_reactions_by_type_total', values: [{ value: { like: 3, love: 1 } }] }] } },
      { body: { data: [{ name: 'post_media_view', values: [{ value: 250 }] }] } },
    ]);
    const m = await metricasFacebook({ fetchFn: f, token: 'T', id: 'PAG_1' });
    expect(m).toMatchObject({ ok: true, likes: 4, clicks: 9, views: 250, comments: null, shares: null });
    expect(f.pedidos.filter((p) => p.url.includes('/insights?metric=')).length).toBe(5);
    expect(f.pedidos[0].url).not.toContain('access_token');
  });

  it('con el permiso de contenido: reacciones, comentarios y compartidos del post', async () => {
    const f = fetchFalso([
      { body: { reactions: { summary: { total_count: 12 } }, comments: { summary: { total_count: 3 } } } },
      {}, {}, {}, {}, {},
    ]);
    const m = await metricasFacebook({ fetchFn: f, token: 'T', id: 'X' });
    expect(m).toMatchObject({ ok: true, likes: 12, comments: 3, shares: 0, reach: null });
  });

  it('si nada responde, no se da por medido', async () => {
    const malo = { status: 400, body: { error: { message: 'no' } } };
    const f = fetchFalso([malo, malo, malo, malo, malo, malo]);
    expect((await metricasFacebook({ fetchFn: f, token: 'T', id: 'X' })).ok).toBe(false);
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
