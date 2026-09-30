import { describe, it, expect } from 'vitest';
import {
  tiktokBandeja, estadoEnvioTikTok, renovarAccesoTikTok, accesoVigenteTikTok,
} from '../supabase/functions/_shared/tiktok.mjs';

// fetch de mentira: apunta lo que le piden y contesta en orden. Sin red.
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
const MEDIA = { video: 'https://almacen/promo.mp4' };

describe('tiktokBandeja: el video va como borrador a la bandeja del dueño', () => {
  it('baja el video, lo anuncia con FILE_UPLOAD en un trozo y lo sube con su rango', async () => {
    const f = fetchFalso([
      VIDEO,
      { body: { data: { publish_id: 'v_inbox~1', upload_url: 'https://subida.tiktok/1' }, error: { code: 'ok' } } },
      { status: 201 },
    ]);
    const r = await tiktokBandeja({ fetchFn: f, token: 'tok', media: MEDIA });
    expect(r).toMatchObject({ ok: true, external_post_id: 'v_inbox~1', external_url: null, privacidad: 'inbox' });

    const init = f.pedidos[1];
    expect(init.url).toBe('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/');
    expect(init.init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.init.body).source_info).toEqual({
      source: 'FILE_UPLOAD', video_size: 4, chunk_size: 4, total_chunk_count: 1,
    });

    const put = f.pedidos[2];
    expect(put.url).toBe('https://subida.tiktok/1');
    expect(put.init.method).toBe('PUT');
    expect(put.init.headers['Content-Range']).toBe('bytes 0-3/4');
    expect(put.init.headers['Content-Type']).toBe('video/mp4');
  });

  it('nunca usa la publicación directa', async () => {
    const f = fetchFalso([VIDEO, { body: { data: { publish_id: 'p', upload_url: 'https://u' }, error: { code: 'ok' } } }, {}]);
    await tiktokBandeja({ fetchFn: f, token: 't', media: MEDIA });
    expect(f.pedidos.some((p) => String(p.url).includes('/video/init/') && !String(p.url).includes('/inbox/'))).toBe(false);
  });

  it('un token vencido se dice como tal, para apagar la red y pedir reconectar', async () => {
    const f = fetchFalso([VIDEO, { status: 401, body: { error: { code: 'access_token_invalid', message: 'expired' } } }]);
    const r = await tiktokBandeja({ fetchFn: f, token: 't', media: MEDIA });
    expect(r.ok).toBe(false);
    expect(r.token_vencido).toBe(true);
    expect(r.paso).toBe('iniciar');
  });

  it('si la subida falla no se da por enviado', async () => {
    const f = fetchFalso([VIDEO, { body: { data: { publish_id: 'p', upload_url: 'https://u' }, error: { code: 'ok' } } }, { status: 500 }]);
    const r = await tiktokBandeja({ fetchFn: f, token: 't', media: MEDIA });
    expect(r.ok).toBe(false);
    expect(r.paso).toBe('subir');
    expect(r.external_post_id).toBeUndefined();
  });
});

describe('estadoEnvioTikTok', () => {
  it('pregunta con el publish_id y devuelve el estado de TikTok', async () => {
    const f = fetchFalso([{ body: { data: { status: 'SEND_TO_USER_INBOX' }, error: { code: 'ok' } } }]);
    const r = await estadoEnvioTikTok({ fetchFn: f, token: 't', publishId: 'p1' });
    expect(r).toMatchObject({ ok: true, estado: 'SEND_TO_USER_INBOX' });
    expect(JSON.parse(f.pedidos[0].init.body)).toEqual({ publish_id: 'p1' });
  });
});

describe('el acceso de TikTok (24 horas) se renueva y guarda el renovable nuevo', () => {
  it('con más de 5 minutos por delante usa el guardado, sin red', async () => {
    const f = fetchFalso([]);
    const ahora = Date.now();
    const t = await accesoVigenteTikTok({ fetchFn: f, secreto: { access_token: 'viejo', expires_at: new Date(ahora + 3600e3).toISOString() }, clientKey: 'k', clientSecret: 's', ahora });
    expect(t).toBe('viejo');
    expect(f.pedidos.length).toBe(0);
  });

  it('cerca de vencer, renueva con las credenciales en el cuerpo y guarda el renovable rotado', async () => {
    const f = fetchFalso([{ body: { access_token: 'nuevo', refresh_token: 'r2', expires_in: 86400 } }]);
    let guardado = null;
    const t = await accesoVigenteTikTok({
      fetchFn: f, secreto: { access_token: 'viejo', refresh_token: 'r1', expires_at: new Date(Date.now() + 60e3).toISOString() },
      clientKey: 'k', clientSecret: 'SECRETO-XYZ', guardar: async (n) => { guardado = n; },
    });
    expect(t).toBe('nuevo');
    expect(guardado.refresh_token).toBe('r2');
    expect(f.pedidos[0].url).not.toContain('SECRETO-XYZ');
    expect(String(f.pedidos[0].init.body)).toContain('SECRETO-XYZ');
    expect(String(f.pedidos[0].init.body)).toContain('grant_type=refresh_token');
  });

  it('si TikTok retiró el permiso, pide reconectar', async () => {
    const f = fetchFalso([{ status: 400, body: { error: 'invalid_grant' } }]);
    await expect(renovarAccesoTikTok({ fetchFn: f, clientKey: 'k', clientSecret: 's', refreshToken: 'r' }))
      .rejects.toMatchObject({ token_vencido: true });
  });
});
