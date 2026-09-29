import { describe, it, expect } from 'vitest';
import {
  youtubeShort, renovarAccesoGoogle, accesoVigenteGoogle, tituloDesdeTexto, descripcionDesdeTexto,
  privacidadVideoYoutube,
} from '../supabase/functions/_shared/youtube.mjs';
import { cuentaConAcceso } from '../supabase/functions/_shared/cuentaSocial.mjs';

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
const INICIO = { status: 200, headers: { location: 'https://subida.google/sesion-1' } };
const TEXTO = 'Título: Amortiguador Platina 125 Bajaj\nDescripción: Lleva tu Platina al siguiente nivel. RD$ 2,350.03';

describe('youtubeShort: la subida', () => {
  it('sube en dos pasos, en PRIVADO por defecto, y devuelve id y enlace de Short', async () => {
    const f = fetchFalso([VIDEO, INICIO, { status: 201, body: { id: 'abc123', status: { privacyStatus: 'private' } } }]);
    const r = await youtubeShort({ fetchFn: f, token: 'TOK', media: { video: 'https://x/v.mp4' }, texto: TEXTO });
    expect(r).toMatchObject({ ok: true, external_post_id: 'abc123', external_url: 'https://www.youtube.com/shorts/abc123', privacidad: 'private' });
    const [, ini, put] = f.pedidos;
    const meta = JSON.parse(ini.init.body);
    expect(meta.status.privacyStatus).toBe('private');
    expect(meta.snippet.title).toBe('Amortiguador Platina 125 Bajaj #Shorts');
    expect(ini.init.headers['X-Upload-Content-Type']).toBe('video/mp4');
    expect(ini.init.headers['X-Upload-Content-Length']).toBe('4');
    expect(put.url).toBe('https://subida.google/sesion-1');
    expect(put.init.method).toBe('PUT');
  });

  it('el token va en la cabecera, nunca en la URL', async () => {
    const f = fetchFalso([VIDEO, INICIO, { body: { id: 'z' } }]);
    await youtubeShort({ fetchFn: f, token: 'SECRETO', media: { video: 'https://x/v.mp4' }, texto: TEXTO });
    for (const p of f.pedidos) expect(String(p.url)).not.toContain('SECRETO');
    expect(f.pedidos[1].init.headers.Authorization).toBe('Bearer SECRETO');
    expect(f.pedidos[2].init.headers.Authorization).toBe('Bearer SECRETO');
  });

  it('una privacidad que no existe cae en privado', async () => {
    const f = fetchFalso([VIDEO, INICIO, { body: { id: 'z' } }]);
    await youtubeShort({ fetchFn: f, token: 'T', media: { video: 'https://x/v.mp4' }, texto: TEXTO, privacidad: 'publico-ya' });
    expect(JSON.parse(f.pedidos[1].init.body).status.privacyStatus).toBe('private');
  });

  it('sin video no intenta nada', async () => {
    const f = fetchFalso([]);
    const r = await youtubeShort({ fetchFn: f, token: 'T', media: { imagen: 'https://x/a.png' } });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/video/i);
    expect(f.pedidos).toHaveLength(0);
  });

  it('un 200 sin id NO es un éxito', async () => {
    const f = fetchFalso([VIDEO, INICIO, { status: 200, body: {} }]);
    const r = await youtubeShort({ fetchFn: f, token: 'T', media: { video: 'https://x/v.mp4' }, texto: TEXTO });
    expect(r.ok).toBe(false);
    expect(r.external_post_id).toBeUndefined();
  });

  it('sin dirección de subida falla en el primer paso', async () => {
    const f = fetchFalso([VIDEO, { status: 200 }]);
    const r = await youtubeShort({ fetchFn: f, token: 'T', media: { video: 'https://x/v.mp4' }, texto: TEXTO });
    expect(r).toMatchObject({ ok: false, paso: 'iniciar' });
    expect(f.pedidos).toHaveLength(2);
  });

  it('un 401 se reconoce como acceso vencido', async () => {
    const f = fetchFalso([VIDEO, { status: 401, body: { error: { message: 'Invalid Credentials' } } }]);
    const r = await youtubeShort({ fetchFn: f, token: 'T', media: { video: 'https://x/v.mp4' }, texto: TEXTO });
    expect(r).toMatchObject({ ok: false, token_vencido: true, error: 'Invalid Credentials' });
  });
});

describe('título y descripción', () => {
  it('el título sale de la línea "Título:" y lleva #Shorts si cabe', () => {
    expect(tituloDesdeTexto(TEXTO)).toBe('Amortiguador Platina 125 Bajaj #Shorts');
    expect(tituloDesdeTexto('')).toBe('Promoción #Shorts');
    expect(tituloDesdeTexto('x'.repeat(120)).length).toBe(100);
    expect(tituloDesdeTexto('Oferta <hoy>')).toBe('Oferta hoy #Shorts');
  });
  it('la descripción quita el título y el rótulo, y conserva el precio', () => {
    expect(descripcionDesdeTexto(TEXTO)).toBe('Lleva tu Platina al siguiente nivel. RD$ 2,350.03');
  });
});

describe('el acceso de Google', () => {
  it('renovar manda las credenciales en el CUERPO, no en la URL', async () => {
    const f = fetchFalso([{ body: { access_token: 'NUEVO', expires_in: 3600 } }]);
    const r = await renovarAccesoGoogle({ fetchFn: f, clientId: 'CID', clientSecret: 'CSEC', refreshToken: 'RT', ahora: 0 });
    expect(r).toEqual({ access_token: 'NUEVO', expires_at: new Date(3600 * 1000).toISOString() });
    expect(f.pedidos[0].url).toBe('https://oauth2.googleapis.com/token');
    expect(f.pedidos[0].url).not.toMatch(/CSEC|RT/);
    expect(f.pedidos[0].init.body).toContain('grant_type=refresh_token');
  });

  it('invalid_grant = el canal retiró el permiso: hay que reconectar', async () => {
    const f = fetchFalso([{ status: 400, body: { error: 'invalid_grant' } }]);
    await expect(renovarAccesoGoogle({ fetchFn: f, clientId: 'a', clientSecret: 'b', refreshToken: 'c' }))
      .rejects.toMatchObject({ token_vencido: true });
  });

  it('con más de 5 minutos de vida usa el guardado; si no, renueva y guarda', async () => {
    const ahora = Date.parse('2026-09-30T12:00:00Z');
    const vivo = { access_token: 'VIEJO', refresh_token: 'RT', expires_at: '2026-09-30T12:30:00Z' };
    const f0 = fetchFalso([]);
    expect(await accesoVigenteGoogle({ fetchFn: f0, secreto: vivo, ahora })).toBe('VIEJO');
    expect(f0.pedidos).toHaveLength(0);

    const guardados = [];
    const f1 = fetchFalso([{ body: { access_token: 'NUEVO', expires_in: 3600 } }]);
    const casiMuerto = { ...vivo, expires_at: '2026-09-30T12:03:00Z' };
    const t = await accesoVigenteGoogle({ fetchFn: f1, secreto: casiMuerto, clientId: 'a', clientSecret: 'b', ahora, guardar: async (n) => guardados.push(n) });
    expect(t).toBe('NUEVO');
    expect(guardados[0].access_token).toBe('NUEVO');
  });
});

// Un cliente Supabase de mentira, lo justo para cuentaConAcceso.
function sbFalso({ cuentas, secretos }) {
  const escritos = [];
  const consulta = (tabla) => {
    const filtros = {};
    const q = {
      select: () => q,
      eq: (k, v) => { filtros[k] = v; return q; },
      order: () => q,
      limit: async () => ({ data: cuentas.filter((c) => Object.entries(filtros).every(([k, v]) => c[k] === v)) }),
      maybeSingle: async () => ({ data: secretos[filtros.account_id] ?? null }),
      update: (fila) => { escritos.push({ tabla, fila }); return { eq: () => ({ select: async () => ({ error: null }) }) }; },
    };
    return q;
  };
  return { from: consulta, escritos };
}

describe('cuentaConAcceso', () => {
  const cuentas = [
    { id: 'manual', tenant_id: 'T', platform: 'youtube', status: 'manual', external_account_id: '@repuestos_morla', publicacion_habilitada: false },
    { id: 'oauth', tenant_id: 'T', platform: 'youtube', status: 'connected', external_account_id: 'UCpz', publicacion_habilitada: false },
  ];

  it('toma la conexión OAuth, no el registro manual, y renueva y guarda el acceso', async () => {
    const sb = sbFalso({ cuentas, secretos: { oauth: { access_token: 'VIEJO', refresh_token: 'RT', expires_at: '2000-01-01T00:00:00Z' } } });
    const f = fetchFalso([{ body: { access_token: 'NUEVO', expires_in: 3600 } }]);
    const c = await cuentaConAcceso({ sb, fetchFn: f, tenantId: 'T', platform: 'youtube', env: () => 'x' });
    expect(c).toMatchObject({ id: 'oauth', external_account_id: 'UCpz', token: 'NUEVO', habilitada: false });
    expect(sb.escritos[0].fila.access_token).toBe('NUEVO');
  });

  it('sin cuenta conectada no devuelve nada', async () => {
    const sb = sbFalso({ cuentas: [cuentas[0]], secretos: {} });
    expect(await cuentaConAcceso({ sb, fetchFn: fetchFalso([]), tenantId: 'T', platform: 'youtube' })).toBeNull();
  });

  it('Facebook usa su token tal cual: no pide renovación a Google', async () => {
    const sb = sbFalso({
      cuentas: [{ id: 'fb', tenant_id: 'T', platform: 'facebook', status: 'connected', external_account_id: 'PAG', publicacion_habilitada: true }],
      secretos: { fb: { access_token: 'META', refresh_token: null, expires_at: null } },
    });
    const f = fetchFalso([]);
    const c = await cuentaConAcceso({ sb, fetchFn: f, tenantId: 'T', platform: 'facebook' });
    expect(c.token).toBe('META');
    expect(f.pedidos).toHaveLength(0);
  });
});

describe('privacidadVideoYoutube: ¿ya lo puso público el dueño?', () => {
  it('lee la privacidad del video con part=status y el token en la cabecera', async () => {
    const f = fetchFalso([{ body: { items: [{ id: 'abc', status: { privacyStatus: 'public' } }] } }]);
    const r = await privacidadVideoYoutube({ fetchFn: f, token: 'tok', id: 'abc' });
    expect(r).toEqual({ ok: true, privacidad: 'public' });
    expect(f.pedidos[0].url).toContain('part=status');
    expect(f.pedidos[0].url).toContain('id=abc');
    expect(f.pedidos[0].url).not.toContain('tok');
    expect(f.pedidos[0].init.headers.Authorization).toBe('Bearer tok');
  });

  it('si YouTube ya no lo tiene, lo dice como eliminado', async () => {
    const f = fetchFalso([{ body: { items: [] } }]);
    expect(await privacidadVideoYoutube({ fetchFn: f, token: 't', id: 'x' })).toEqual({ ok: true, privacidad: 'eliminado' });
  });

  it('un 401 no cambia nada y avisa que el acceso venció', async () => {
    const f = fetchFalso([{ status: 401, body: { error: { message: 'Invalid Credentials' } } }]);
    const r = await privacidadVideoYoutube({ fetchFn: f, token: 't', id: 'x' });
    expect(r.ok).toBe(false);
    expect(r.token_vencido).toBe(true);
  });
});
