import { describe, it, expect } from 'vitest';
import { comentariosFacebook, comentariosInstagram, responderComentario, respuestaConPrecio } from '../supabase/functions/_shared/comentarios.mjs';

// fetch de mentira: contesta por orden y apunta lo pedido. Sin red.
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

describe('comentariosFacebook', () => {
  it('marca respondido si la página contestó debajo, y sin nombre no inventa uno', async () => {
    const f = fetchFalso([{ body: { data: [
      { id: 'C1', message: 'Precio', created_time: '2026-09-30T16:37:37+0000', from: null },
      { id: 'C2', message: 'tienen?', created_time: '2026-09-30T17:00:00+0000', from: { id: 'U9', name: 'Ana' },
        comments: { data: [{ id: 'R1', message: 'Sí', from: { id: 'PAG' } }] } },
      { id: 'C3', message: 'Promo de la página', from: { id: 'PAG' } },
    ] } }]);
    const r = await comentariosFacebook({ fetchFn: f, token: 'T', postId: 'PAG_1', paginaId: 'PAG' });
    expect(r.ok).toBe(true);
    expect(r.comentarios.map((c) => c.id)).toEqual(['C1', 'C2']);
    expect(r.comentarios[0]).toMatchObject({ autor: null, respondido: false, platform: 'facebook' });
    expect(r.comentarios[1]).toMatchObject({ autor: 'Ana', respondido: true });
    expect(f.pedidos[0].url).not.toContain('access_token');
  });

  it('un error de la red no se disfraza de "sin comentarios"', async () => {
    const f = fetchFalso([{ status: 400, body: { error: { message: 'no' } } }]);
    expect(await comentariosFacebook({ fetchFn: f, token: 'T', postId: 'X', paginaId: 'P' })).toEqual({ ok: false, error: 'no' });
  });
});

describe('comentariosInstagram', () => {
  it('usuario, texto y respuestas propias', async () => {
    const f = fetchFalso([{ body: { data: [
      { id: 'I1', text: 'precio?', username: 'cliente1', timestamp: 't',
        replies: { data: [{ text: 'RD$330', from: { id: 'IG' } }] } },
      { id: 'I2', text: 'ok', from: { id: 'IG', username: 'repuestosmorla' } },
    ] } }]);
    const r = await comentariosInstagram({ fetchFn: f, token: 'T', mediaId: 'M', igId: 'IG' });
    expect(r.comentarios).toHaveLength(1);
    expect(r.comentarios[0]).toMatchObject({ autor: 'cliente1', respondido: true });
  });
});

describe('responderComentario', () => {
  it('Instagram responde en /replies y Facebook en /comments', async () => {
    const f = fetchFalso([{ body: { id: 'N1' } }, { body: { id: 'N2' } }]);
    expect(await responderComentario({ fetchFn: f, token: 'T', platform: 'instagram', commentId: 'I1', texto: 'hola' })).toEqual({ ok: true, id: 'N1' });
    await responderComentario({ fetchFn: f, token: 'T', platform: 'facebook', commentId: 'C1', texto: 'hola' });
    expect(f.pedidos[0].url).toMatch(/\/I1\/replies$/);
    expect(f.pedidos[1].url).toMatch(/\/C1\/comments$/);
    expect(JSON.parse(f.pedidos[1].init.body)).toEqual({ message: 'hola' });
  });

  it('sin permiso en Facebook devuelve motivo "permiso"', async () => {
    const f = fetchFalso([{ status: 403, body: { error: { code: 200, message: 'Requires pages_manage_engagement' } } }]);
    expect(await responderComentario({ fetchFn: f, token: 'T', platform: 'facebook', commentId: 'C1', texto: 'x' }))
      .toMatchObject({ ok: false, motivo: 'permiso' });
  });

  it('no manda una respuesta vacía', async () => {
    const f = fetchFalso([]);
    expect((await responderComentario({ fetchFn: f, token: 'T', platform: 'instagram', commentId: 'I1', texto: '  ' })).motivo).toBe('vacio');
    expect(f.pedidos).toHaveLength(0);
  });
});

describe('respuestaConPrecio', () => {
  it('precio y WhatsApp', () => {
    expect(respuestaConPrecio({ precio: 2350.03, telefono: '809-390-5965' }))
      .toBe('¡Hola! Está en RD$2,350.03. Escríbenos al WhatsApp 809-390-5965 y te lo separamos.');
  });
  it('sin precio ni teléfono, sigue siendo una respuesta útil', () => {
    expect(respuestaConPrecio({})).toBe('¡Hola! Escríbenos por interno y te lo separamos.');
  });
});
