import { describe, it, expect } from 'vitest';
import {
  tiktokDirecto, creadorTikTok, videosTikTok, problemaOpcionesTikTok, estadoEnvioTikTok,
} from '../supabase/functions/_shared/tiktok.mjs';
import { tiktokVideo } from '../supabase/functions/_shared/adaptadores.mjs';

function fetchFalso(respuestas) {
  const pedidos = [];
  let i = 0;
  const fn = async (url, init = {}) => {
    pedidos.push({ url, init });
    const r = respuestas[i++] || {};
    const cab = new Map(Object.entries(r.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    return {
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      headers: { get: (k) => cab.get(String(k).toLowerCase()) ?? null },
      json: async () => r.body ?? {},
      arrayBuffer: async () => (r.bytes ?? new Uint8Array([1, 2, 3])).buffer,
    };
  };
  fn.pedidos = pedidos;
  return fn;
}

const VIDEO = { status: 200, headers: { 'content-type': 'video/mp4' }, bytes: new Uint8Array([9, 9, 9, 9]) };
const INIT = { body: { data: { publish_id: 'p_pub~1', upload_url: 'https://subida.tiktok/1' }, error: { code: 'ok' } } };
const OPC = { modo: 'directo', privacy_level: 'PUBLIC_TO_EVERYONE', comentarios: true, duo: false, stitch: false,
  comercial: true, tu_marca: true, contenido_de_marca: false };

describe('TikTok directo', () => {
  it('publica con las opciones que eligió el dueño', async () => {
    const f = fetchFalso([VIDEO, INIT, { status: 201 }]);
    const r = await tiktokDirecto({ fetchFn: f, token: 'tok', media: { video: 'https://a/v.mp4' }, texto: 'Pieza nueva', opciones: OPC });
    expect(r).toMatchObject({ ok: true, external_post_id: 'p_pub~1', external_url: null, privacidad: 'tiktok_enviado' });
    expect(f.pedidos[1].url).toBe('https://open.tiktokapis.com/v2/post/publish/video/init/');
    const cuerpo = JSON.parse(f.pedidos[1].init.body);
    expect(cuerpo.post_info).toEqual({
      title: 'Pieza nueva', privacy_level: 'PUBLIC_TO_EVERYONE',
      disable_comment: false, disable_duet: true, disable_stitch: true,
      brand_content_toggle: false, brand_organic_toggle: true,
    });
    expect(cuerpo.source_info).toMatchObject({ source: 'FILE_UPLOAD', video_size: 4, total_chunk_count: 1 });
  });

  it('sin elegir a quién se muestra no llama a TikTok', async () => {
    const f = fetchFalso([]);
    const r = await tiktokDirecto({ fetchFn: f, token: 'tok', media: { video: 'x' }, opciones: { ...OPC, privacy_level: '' } });
    expect(r).toMatchObject({ ok: false, paso: 'opciones' });
    expect(f.pedidos.length).toBe(0);
  });

  it('reglas de TikTok para las opciones', () => {
    expect(problemaOpcionesTikTok(OPC)).toBeNull();
    expect(problemaOpcionesTikTok(null)).toBeTruthy();
    expect(problemaOpcionesTikTok({ ...OPC, tu_marca: false })).toMatch(/comercial/);
    expect(problemaOpcionesTikTok({ ...OPC, contenido_de_marca: true, privacy_level: 'SELF_ONLY' })).toMatch(/solo yo/);
  });

  it('el adaptador va directo solo si el dueño lo eligió; si no, a la bandeja', async () => {
    const f1 = fetchFalso([VIDEO, INIT, { status: 201 }]);
    await tiktokVideo({ fetchFn: f1, token: 'tok', media: { video: 'v', tiktok: OPC }, texto: 't' });
    expect(f1.pedidos[1].url).toContain('/post/publish/video/init/');
    const f2 = fetchFalso([VIDEO, INIT, { status: 201 }]);
    await tiktokVideo({ fetchFn: f2, token: 'tok', media: { video: 'v', tiktok: { ...OPC, modo: 'bandeja' } }, texto: 't' });
    expect(f2.pedidos[1].url).toContain('/post/publish/inbox/video/init/');
    const f3 = fetchFalso([VIDEO, INIT, { status: 201 }]);
    await tiktokVideo({ fetchFn: f3, token: 'tok', media: { video: 'v' }, texto: 't' });
    expect(f3.pedidos[1].url).toContain('/inbox/');
  });

  it('el estado trae el id del video publicado', async () => {
    const f = fetchFalso([{ body: { data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [7123] }, error: { code: 'ok' } } }]);
    expect(await estadoEnvioTikTok({ fetchFn: f, token: 't', publishId: 'p' })).toMatchObject({ ok: true, estado: 'PUBLISH_COMPLETE', video_id: '7123' });
  });
});

describe('Cuenta y videos', () => {
  it('creator_info normalizado', async () => {
    const f = fetchFalso([{ body: { data: {
      creator_nickname: 'Repuestos Morla', creator_username: 'repuestos_morla', creator_avatar_url: 'https://a/av.jpg',
      privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'], comment_disabled: false, duet_disabled: true,
      stitch_disabled: false, max_video_post_duration_sec: 600 }, error: { code: 'ok' } } }]);
    const r = await creadorTikTok({ fetchFn: f, token: 'SECRETO_XYZ' });
    expect(r).toEqual({ ok: true, nombre: 'Repuestos Morla', usuario: 'repuestos_morla', avatar: 'https://a/av.jpg',
      privacidades: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'], sin_comentarios: false, sin_duo: true, sin_stitch: false, max_segundos: 600 });
    expect(f.pedidos[0].url).toBe('https://open.tiktokapis.com/v2/post/publish/creator_info/query/');
    expect(f.pedidos[0].url).not.toContain('SECRETO_XYZ');
    expect(f.pedidos[0].init.headers.Authorization).toBe('Bearer SECRETO_XYZ');
  });

  it('sin el permiso nuevo pide reconectar', async () => {
    const f = fetchFalso([{ status: 401, body: { error: { code: 'scope_not_authorized', message: 'scope' } } }]);
    expect(await creadorTikTok({ fetchFn: f, token: 'tok' })).toMatchObject({ ok: false, sin_permiso: true });
  });

  it('video.list con sus números', async () => {
    const f = fetchFalso([{ body: { data: { videos: [{ id: 71, title: 'Kit', share_url: 'https://t/71', create_time: 1761955200,
      view_count: 300, like_count: 12, comment_count: 2, share_count: 1 }] }, error: { code: 'ok' } } }]);
    const r = await videosTikTok({ fetchFn: f, token: 'tok', max: 5 });
    expect(r.videos[0]).toMatchObject({ id: '71', titulo: 'Kit', vistas: 300, me_gusta: 12, comentarios: 2, compartidos: 1 });
    expect(f.pedidos[0].url).toContain('/video/list/?fields=');
    expect(JSON.parse(f.pedidos[0].init.body)).toEqual({ max_count: 5 });
  });
});
