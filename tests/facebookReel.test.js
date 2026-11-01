import { describe, it, expect } from 'vitest';
import { facebookReel, ADAPTADORES } from '../supabase/functions/_shared/adaptadores.mjs';
import { metricasFacebookVideo, medirDestino } from '../supabase/functions/_shared/metricas.mjs';

function fetchFalso(respuestas) {
  const pedidos = [];
  let i = 0;
  const fn = async (url, init) => {
    pedidos.push({ url, init, cuerpo: init?.body ? JSON.parse(init.body) : null });
    const r = (Array.isArray(respuestas) ? respuestas[i++] : respuestas) || { body: {} };
    return { ok: r.ok !== false, status: r.status ?? (r.ok === false ? 400 : 200), json: async () => r.body ?? {} };
  };
  fn.pedidos = pedidos;
  return fn;
}
const sinEspera = async () => {};
const MEDIA = { video: 'https://ejemplo/v.mp4' };

describe('Facebook reel', () => {
  it('el mapa usa la API de Reels', () => {
    expect(ADAPTADORES['facebook:reel']).toBe(facebookReel);
  });

  it('start → subir por URL → finish con el texto, y espera a que salga', async () => {
    const f = fetchFalso([
      { body: { video_id: 'R1', upload_url: 'https://rupload.facebook.com/video-upload/v22.0/R1' } },
      { body: { success: true } },
      { body: { success: true } },
      { body: { status: { video_status: 'processing', publishing_phase: { status: 'not_started' } } } },
      { body: { status: { video_status: 'ready', publishing_phase: { status: 'complete' } } } },
    ]);
    const r = await facebookReel({ fetchFn: f, token: 'TK', cuentaId: 'PAG', media: MEDIA, texto: 'Pieza nueva', esperar: sinEspera });
    expect(r).toEqual({ ok: true, external_post_id: 'R1', external_url: 'https://www.facebook.com/reel/R1' });
    expect(f.pedidos[0].url).toContain('/PAG/video_reels');
    expect(f.pedidos[0].cuerpo).toEqual({ upload_phase: 'start' });
    expect(f.pedidos[1].url).toBe('https://rupload.facebook.com/video-upload/v22.0/R1');
    expect(f.pedidos[1].init.headers).toEqual({ Authorization: 'OAuth TK', file_url: MEDIA.video });
    expect(f.pedidos[2].cuerpo).toEqual({ upload_phase: 'finish', video_id: 'R1', video_state: 'PUBLISHED', description: 'Pieza nueva' });
    expect(f.pedidos.length).toBe(5);
    for (const p of f.pedidos) expect(p.url).not.toContain('TK');
  });

  it('si Facebook no puede procesarlo, es fallo', async () => {
    const f = fetchFalso([
      { body: { video_id: 'R1' } }, { body: { success: true } }, { body: { success: true } },
      { body: { status: { video_status: 'error', processing_phase: { status: 'error', error: { message: 'relación de aspecto' } } } } },
    ]);
    const r = await facebookReel({ fetchFn: f, token: 'TK', cuentaId: 'PAG', media: MEDIA, esperar: sinEspera });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('relación de aspecto');
  });

  it('la subida rechazada no llega al finish', async () => {
    const f = fetchFalso([{ body: { video_id: 'R1' } }, { ok: false, status: 400, body: { debug_info: { message: 'no pude bajar el video' } } }]);
    const r = await facebookReel({ fetchFn: f, token: 'TK', cuentaId: 'PAG', media: MEDIA, esperar: sinEspera });
    expect(r).toMatchObject({ ok: false, paso: 'subir', error: 'no pude bajar el video' });
    expect(f.pedidos.length).toBe(2);
  });

  it('token vencido en el start se avisa', async () => {
    const f = fetchFalso({ ok: false, status: 401, body: { error: { message: 'expirado', code: 190 } } });
    const r = await facebookReel({ fetchFn: f, token: 'TK', cuentaId: 'PAG', media: MEDIA, esperar: sinEspera });
    expect(r).toMatchObject({ ok: false, paso: 'iniciar', token_vencido: true });
  });

  it('"[video largo]" va como video normal y la línea no se publica', async () => {
    const f = fetchFalso([{ body: { id: 'V9' } }, { body: { status: { publishing_phase: { publish_status: 'published' } } } }]);
    const r = await facebookReel({ fetchFn: f, token: 'TK', cuentaId: 'PAG', media: MEDIA, texto: '[video largo]\nPiezas de la semana', esperar: sinEspera });
    expect(r.ok).toBe(true);
    expect(r.external_url).toBe('https://www.facebook.com/PAG/videos/V9');
    expect(f.pedidos[0].url).toContain('/PAG/videos');
    expect(f.pedidos[0].cuerpo.description).toBe('Piezas de la semana');
  });

  it('sin video no llama a nadie', async () => {
    const f = fetchFalso([]);
    const r = await facebookReel({ fetchFn: f, token: 'TK', cuentaId: 'PAG', media: {}, esperar: sinEspera });
    expect(r.ok).toBe(false);
    expect(f.pedidos.length).toBe(0);
  });
});

describe('Números del reel de Facebook', () => {
  it('reacciones, comentarios, reproducciones y alcance', async () => {
    const f = fetchFalso([
      { body: { likes: { summary: { total_count: 4 } }, comments: { summary: { total_count: 2 } } } },
      { body: { data: [{ name: 'blue_reels_play_count', values: [{ value: 310 }] }] } },
      { body: { data: [{ name: 'total_video_views', values: [{ value: 0 }] }] } },
      { ok: false, status: 400, body: { error: { message: 'métrica inválida' } } },
      { body: { data: [{ name: 'total_video_impressions_unique', values: [{ value: 250 }] }] } },
    ]);
    const m = await medirDestino({ fetchFn: f, token: 'TK', platform: 'facebook', placement: 'reel', id: 'R1' });
    expect(m).toMatchObject({ ok: true, likes: 4, comments: 2, views: 310, reach: 250 });
  });

  it('si no da nada, es fallo (no se inventan ceros)', async () => {
    const malo = { ok: false, status: 400, body: { error: { message: 'no' } } };
    const m = await metricasFacebookVideo({ fetchFn: fetchFalso([malo, malo, malo, malo, malo]), token: 'TK', id: 'R1' });
    expect(m.ok).toBe(false);
  });
});
