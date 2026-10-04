import { describe, it, expect } from 'vitest';
import {
  facebookFeed,
  facebookHistoria,
  instagramFeed,
  instagramReel,
  tiktokVideo,
  youtubeShort,
  publicarDestino,
  publicarPromocion,
  adaptadorDePrueba,
} from '../supabase/functions/_shared/adaptadores.mjs';

// Un `fetch` de mentira que apunta todo lo que le piden y contesta lo que se
// le diga. Ninguna de estas pruebas toca la red ni una cuenta de verdad.
function fetchFalso(respuestas) {
  const pedidos = [];
  let i = 0;
  const fn = async (url, init) => {
    pedidos.push({ url, init, cuerpo: init?.body ? JSON.parse(init.body) : null });
    // Si se acaban las respuestas del guion, contesta vacío: una llamada de
    // más no puede tumbar la prueba, pero sí se ve en `pedidos`.
    const r = (Array.isArray(respuestas) ? respuestas[i++] : respuestas) || { body: {} };
    return {
      ok: r.ok !== false,
      status: r.status ?? (r.ok === false ? 400 : 200),
      json: async () => r.body ?? {},
    };
  };
  fn.pedidos = pedidos;
  return fn;
}

const MEDIA = { imagen: 'https://ejemplo/arte.png', video: 'https://ejemplo/v.mp4' };

describe('Facebook', () => {
  it('publica en el feed y devuelve id y enlace', async () => {
    const f = fetchFalso({ body: { post_id: '123_456' } });
    const r = await facebookFeed({ fetchFn: f, token: 'T', cuentaId: 'PAG', media: MEDIA, texto: 'Hola RD$ 1,500' });
    expect(r.ok).toBe(true);
    expect(r.external_post_id).toBe('123_456');
    expect(r.external_url).toContain('123_456');
  });

  it('un 200 sin id NO es un exito', async () => {
    const f = fetchFalso({ body: {} });
    const r = await facebookFeed({ fetchFn: f, token: 'T', cuentaId: 'PAG', media: MEDIA, texto: 'x' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/sin id/i);
  });

  it('reconoce el token vencido y lo dice', async () => {
    const f = fetchFalso({
      ok: false, status: 400,
      body: { error: { message: 'Error validating access token: Session has expired', code: 190 } },
    });
    const r = await facebookFeed({ fetchFn: f, token: 'T', cuentaId: 'PAG', media: MEDIA, texto: 'x' });
    expect(r.ok).toBe(false);
    expect(r.token_vencido).toBe(true);
    expect(r.error).toMatch(/expired/i);
  });

  it('la historia va en dos pasos: sube sin publicar y luego la convierte', async () => {
    const f = fetchFalso([{ body: { id: 'FOTO1' } }, { body: { post_id: 'HIST1' } }]);
    const r = await facebookHistoria({ fetchFn: f, token: 'T', cuentaId: 'PAG', media: MEDIA });
    expect(r.ok).toBe(true);
    expect(f.pedidos[0].cuerpo.published).toBe(false);
    expect(f.pedidos[1].url).toContain('photo_stories');
    expect(f.pedidos[1].cuerpo.photo_id).toBe('FOTO1');
    expect(r.external_post_id).toBe('HIST1');
    // El enlace es el de las historias de la página: el del id no abre.
    expect(r.external_url).toBe('https://www.facebook.com/stories/PAG');
  });
});

describe('Instagram', () => {
  it('si falla el contenedor NO llega a publicar', async () => {
    const f = fetchFalso({ ok: false, status: 400, body: { error: { message: 'mal la imagen', code: 100 } } });
    const r = await instagramFeed({ fetchFn: f, token: 'T', cuentaId: 'IG', media: MEDIA, texto: 'x' });
    expect(r.ok).toBe(false);
    expect(r.paso).toBe('contenedor');
    expect(f.pedidos).toHaveLength(1);       // no hubo segundo paso
  });

  it('publica cuando los dos pasos salen, y el enlace se lo pide a Instagram', async () => {
    const f = fetchFalso([
      { body: { id: 'CONT1' } },
      { body: { id: 'MEDIA1' } },
      { body: { permalink: 'https://www.instagram.com/p/Cx9AbCd/' } },
    ]);
    const r = await instagramFeed({ fetchFn: f, token: 'T', cuentaId: 'IG', media: MEDIA, texto: 'x' });
    expect(r.ok).toBe(true);
    expect(r.creation_id).toBe('CONT1');
    expect(r.external_post_id).toBe('MEDIA1');
    expect(f.pedidos[1].cuerpo.creation_id).toBe('CONT1');
    // El enlace es el que dio Instagram, no uno armado con el id.
    expect(f.pedidos[2].init.method).toBe('GET');
    expect(f.pedidos[2].url).toContain('MEDIA1?fields=permalink');
    expect(r.external_url).toBe('https://www.instagram.com/p/Cx9AbCd/');
  });

  it('si Instagram no da el enlace, queda sin enlace: nunca uno inventado', async () => {
    const f = fetchFalso([{ body: { id: 'CONT1' } }, { body: { id: 'MEDIA1' } }, { body: {} }]);
    const r = await instagramFeed({ fetchFn: f, token: 'T', cuentaId: 'IG', media: MEDIA, texto: 'x' });
    expect(r.ok).toBe(true);                 // publicado igual: el id es de verdad
    expect(r.external_post_id).toBe('MEDIA1');
    expect(r.external_url).toBeNull();
  });

  it('"media not ready" no es un fallo: espera y reintenta', async () => {
    const noLista = { ok: false, status: 400, body: { error: { message: 'Media ID is not available', code: 9007, error_subcode: 2207027 } } };
    const f = fetchFalso([
      { body: { id: 'CONT1' } },
      noLista,
      noLista,
      { body: { id: 'MEDIA1' } },
      { body: { permalink: 'https://www.instagram.com/p/Zz/' } },
    ]);
    const esperas = [];
    const r = await instagramFeed({
      fetchFn: f, token: 'T', cuentaId: 'IG', media: MEDIA, texto: 'x',
      esperar: async (ms) => { esperas.push(ms); },
    });
    expect(r.ok).toBe(true);
    expect(r.external_post_id).toBe('MEDIA1');
    expect(esperas).toHaveLength(2);         // dos reintentos, con su pausa
  });

  it('si nunca queda lista, falla — no se queda reintentando para siempre', async () => {
    const noLista = { ok: false, status: 400, body: { error: { message: 'Media ID is not available', code: 9007 } } };
    const f = fetchFalso([{ body: { id: 'CONT1' } }, noLista, noLista, noLista, noLista, noLista]);
    const r = await instagramFeed({
      fetchFn: f, token: 'T', cuentaId: 'IG', media: MEDIA, texto: 'x', esperar: async () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.paso).toBe('publicar');
    expect(f.pedidos).toHaveLength(5);       // contenedor + 4 intentos
  });
});

describe('Instagram Reels', () => {
  it('espera a que Instagram procese el video y luego publica', async () => {
    const f = fetchFalso([
      { body: { id: 'CONT1' } },
      { body: { status_code: 'IN_PROGRESS' } },
      { body: { status_code: 'FINISHED' } },
      { body: { id: 'REEL1' } },
      { body: { permalink: 'https://www.instagram.com/reel/Ab1/' } },
    ]);
    const r = await instagramReel({ fetchFn: f, token: 'T', cuentaId: 'IG', media: MEDIA, texto: 'Di I101', esperar: async () => {} });
    expect(r.ok).toBe(true);
    expect(r.external_post_id).toBe('REEL1');
    expect(f.pedidos[0].cuerpo).toMatchObject({ media_type: 'REELS', video_url: MEDIA.video, caption: 'Di I101', share_to_feed: true });
    expect(f.pedidos[1].url).toContain('CONT1?fields=status_code');
    expect(f.pedidos[3].cuerpo.creation_id).toBe('CONT1');
  });

  it('si Instagram no puede procesar el video, no intenta publicar', async () => {
    const f = fetchFalso([{ body: { id: 'CONT1' } }, { body: { status_code: 'ERROR', status: 'formato raro' } }]);
    const r = await instagramReel({ fetchFn: f, token: 'T', cuentaId: 'IG', media: MEDIA, texto: 'x', esperar: async () => {} });
    expect(r.ok).toBe(false);
    expect(r.paso).toBe('procesar');
    expect(f.pedidos).toHaveLength(2);
  });

  it('si sigue procesando a los 90 s, lo dice y no publica', async () => {
    const f = fetchFalso([{ body: { id: 'CONT1' } }, ...Array(18).fill({ body: { status_code: 'IN_PROGRESS' } })]);
    const r = await instagramReel({ fetchFn: f, token: 'T', cuentaId: 'IG', media: MEDIA, texto: 'x', esperar: async () => {} });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/procesando/);
    expect(f.pedidos).toHaveLength(19);
  });

  it('sin video no llama a Instagram', async () => {
    const f = fetchFalso([]);
    const r = await instagramReel({ fetchFn: f, token: 'T', cuentaId: 'IG', media: { imagen: 'x' }, texto: 'x' });
    expect(r.ok).toBe(false);
    expect(f.pedidos).toHaveLength(0);
  });
});

describe('El token nunca viaja en la URL', () => {
  it('va en la cabecera Authorization, no en el query string', async () => {
    const f = fetchFalso([{ body: { id: 'C' } }, { body: { id: 'M' } }]);
    await instagramFeed({ fetchFn: f, token: 'SECRETO', cuentaId: 'IG', media: MEDIA, texto: 'x' });
    for (const p of f.pedidos) {
      expect(p.url).not.toContain('access_token');
      expect(p.url).not.toContain('SECRETO');
      expect(p.init.headers.Authorization).toBe('Bearer SECRETO');
    }
  });
});

describe('TikTok y YouTube', () => {
  it('TikTok sin video no pide nada a la red y explica que falta', async () => {
    const f = fetchFalso({ body: {} });
    const r = await tiktokVideo({ fetchFn: f, token: 'T', media: { imagen: 'x' } });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/video/i);
    expect(f.pedidos.length).toBe(0);
  });

  // Desde el 29/09/2026 YouTube sube de verdad (en privado por defecto); sus
  // pruebas están en tests/youtubeShort.test.js. Aquí: que ya no es un "todavía no".
  it('YouTube ya no es un adaptador de "todavía no"', () => {
    expect(youtubeShort.sinAutorizar).toBeUndefined();
  });
});

describe('publicarDestino', () => {
  it('un destino que ya tiene id NO se vuelve a publicar', async () => {
    const f = fetchFalso({ body: { post_id: 'NUEVO' } });
    const r = await publicarDestino({
      fetchFn: f,
      destino: { platform: 'facebook', placement: 'feed', external_post_id: 'VIEJO' },
      cuenta: { token: 'T', external_account_id: 'PAG' },
      media: MEDIA, texto: 'x',
    });
    expect(r.ok).toBe(true);
    expect(r.ya_estaba).toBe(true);
    expect(r.external_post_id).toBe('VIEJO');
    expect(f.pedidos).toHaveLength(0);       // ni se intento
  });

  it('un destino bloqueado no se intenta', async () => {
    const f = fetchFalso({ body: {} });
    const r = await publicarDestino({
      fetchFn: f,
      destino: { platform: 'facebook', placement: 'feed', bloqueo_motivo: 'token vencido' },
      cuenta: { token: 'T' }, media: MEDIA, texto: 'x',
    });
    expect(r.ok).toBe(false);
    expect(r.sin_autorizar).toBe(true);
    expect(f.pedidos).toHaveLength(0);
  });

  // El interruptor de público de YouTube (meta.privacidad_publicacion) lo pone
  // el dueño tras la auditoría: viaja al adaptador solo si la cuenta lo trae.
  it('la privacidad de la cuenta llega al adaptador; sin ella no se manda nada', async () => {
    const vistos = [];
    const espia = async (args) => { vistos.push(args.privacidad); return { ok: true, external_post_id: 'V' }; };
    const destino = { platform: 'youtube', placement: 'short' };
    await publicarDestino({
      fetchFn: fetchFalso({ body: {} }), destino, media: MEDIA, texto: 'x',
      cuenta: { token: 'T', external_account_id: 'YT', privacidad: 'public' },
      adaptadores: { 'youtube:short': espia },
    });
    await publicarDestino({
      fetchFn: fetchFalso({ body: {} }), destino, media: MEDIA, texto: 'x',
      cuenta: { token: 'T', external_account_id: 'YT' },
      adaptadores: { 'youtube:short': espia },
    });
    expect(vistos).toEqual(['public', undefined]);
  });
});

describe('Una promocion entera', () => {
  const seisDestinos = [
    { id: 1, platform: 'facebook', placement: 'feed' },
    { id: 2, platform: 'facebook', placement: 'story' },
    { id: 3, platform: 'instagram', placement: 'feed' },
    { id: 4, platform: 'instagram', placement: 'story' },
    { id: 5, platform: 'tiktok', placement: 'reel' },
    { id: 6, platform: 'youtube', placement: 'short' },
  ];
  const cuentas = {
    facebook: { token: 'T', external_account_id: 'PAG' },
    instagram: { token: 'T', external_account_id: 'IG' },
  };
  // En el mundo de mentira las cuatro redes tienen token: asi la prueba mide
  // lo que quiere medir (que un fallo no arrastra a los demas) y no se cuela
  // el "no hay token" de TikTok y YouTube.
  const cuatroCuentas = {
    ...cuentas,
    tiktok: { token: 'T', external_account_id: 'TK' },
    youtube: { token: 'T', external_account_id: 'YT' },
  };

  it('lo que falla no detiene a los demas, y el estado es PARCIAL', async () => {
    const falso = adaptadorDePrueba({
      'instagram:story': { ok: false, error: 'se cayo Instagram' },
      porDefecto: { ok: true },
    });
    const adaptadores = Object.fromEntries(
      seisDestinos.map((d) => [`${d.platform}:${d.placement}`, falso]),
    );
    const r = await publicarPromocion({ fetchFn: null, destinos: seisDestinos, cuentas: cuatroCuentas, media: MEDIA, textos: {}, adaptadores });
    expect(r.publicados).toBe(5);
    expect(r.fallidos).toBe(1);
    expect(r.estado).toBe('PARCIAL');
    expect(r.resultados.find((x) => x.id === 4).error).toMatch(/Instagram/);
    expect(r.resultados.filter((x) => x.ok).map((x) => x.id)).toEqual([1, 2, 3, 5, 6]);
  });

  it('con los adaptadores de verdad, TikTok y YouTube sin cuenta no suben', async () => {
    const f = fetchFalso({ body: { post_id: 'X', id: 'X' } });
    const r = await publicarPromocion({ fetchFn: f, destinos: seisDestinos, cuentas, media: MEDIA, textos: {} });
    expect(r.estado).toBe('PARCIAL');
    const tk = r.resultados.find((x) => x.platform === 'tiktok');
    expect(tk.ok).toBe(false);
    expect(tk.error).toMatch(/token/i);
    expect(tk.external_post_id).toBeUndefined();
    expect(f.pedidos.some((p) => String(p.url).includes('tiktokapis'))).toBe(false);
    const yt = r.resultados.find((x) => x.platform === 'youtube');
    expect(yt.ok).toBe(false);
    expect(yt.error).toMatch(/token/i);
    expect(f.pedidos.some((p) => String(p.url).includes('googleapis'))).toBe(false);
  });

  it('el reintento de una parcial no vuelve a tocar lo que ya salio', async () => {
    const yaPublicados = seisDestinos.map((d) => (
      d.id === 4 ? d : { ...d, external_post_id: `YA-${d.id}` }
    ));
    const falso = adaptadorDePrueba({ porDefecto: { ok: true } });
    const adaptadores = Object.fromEntries(
      seisDestinos.map((d) => [`${d.platform}:${d.placement}`, falso]),
    );
    const r = await publicarPromocion({ fetchFn: null, destinos: yaPublicados, cuentas, media: MEDIA, textos: {}, adaptadores });
    expect(falso.llamadas).toEqual(['instagram:story']);   // solo el que faltaba
    expect(r.resultados.filter((x) => x.ya_estaba)).toHaveLength(5);
  });
});
