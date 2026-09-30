// ════════════════════════════════════════════════════════════════════════
//  promo-comentarios — los comentarios de cada promoción, y la respuesta
// ════════════════════════════════════════════════════════════════════════
//  Lo llama Equipo IA → Paso 4 con la sesión del dueño/administrador.
//
//  POST { accion: 'listar', bundle_ids: uuid[] }
//    → { ok, telefono, promos: { [bundle_id]: { comentarios, errores, sugerida } } }
//  POST { accion: 'responder', bundle_id, platform, comment_id, texto }
//    → { ok } | { ok:false, motivo:'permiso'|'red'|'ajeno'|'vacio', error }
//
//  El token nunca sale de aquí. Solo se responde a un comentario que cuelga
//  de una publicación de ESA empresa: antes de escribir se vuelven a leer los
//  comentarios de esa promoción y el id tiene que estar entre ellos.
// ════════════════════════════════════════════════════════════════════════

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { cuentaConAcceso } from '../_shared/cuentaSocial.mjs';
import { comentariosFacebook, comentariosInstagram, responderComentario, respuestaConPrecio } from '../_shared/comentarios.mjs';

const env = (k: string) => Deno.env.get(k);
const base = env('SUPABASE_URL')!;
const origins = new Set((env('SOCIAL_OAUTH_ORIGINS')
  || 'https://repuestos-morla.pages.dev,https://motoflow.pages.dev,http://localhost:5173').split(',').map((s) => s.trim()));
const sb = createClient(base, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

// Las únicas publicaciones que admiten comentarios y se pueden leer.
const COMENTABLES = [['facebook', 'feed'], ['instagram', 'feed']];

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin' };
  if (origins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info';
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  }
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers });
  if (req.method === 'OPTIONS') return new Response(null, { status: origins.has(origin) ? 204 : 403, headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido.' }, 405);

  const jwt = req.headers.get('authorization')?.replace(/^Bearer /i, '');
  if (!jwt) return json({ ok: false, error: 'Inicia sesión en MotoFlow.' }, 401);
  const userSb = createClient(base, env('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  const { data: tenant, error: tErr } = await userSb.rpc('promo_tenant_admin');
  if (tErr || !tenant) return json({ ok: false, error: 'Solo el dueño o administrador.' }, 403);

  let b: any = {};
  try { b = await req.json(); } catch { /* vacío */ }

  // Las publicaciones de esas promociones, SOLO de esta empresa.
  const destinosDe = async (ids: string[]) => {
    const { data } = await sb.from('hermes_publication_targets')
      .select('platform, placement, external_post_id, external_url, hermes_publication_jobs!inner(publication_bundle_id, tenant_id)')
      .eq('hermes_publication_jobs.tenant_id', tenant)
      .in('hermes_publication_jobs.publication_bundle_id', ids)
      .eq('status', 'published')
      .not('external_post_id', 'is', null);
    return (data || []).filter((d) => COMENTABLES.some(([p, pl]) => p === d.platform && pl === d.placement))
      .map((d) => ({ ...d, bundle_id: d.hermes_publication_jobs.publication_bundle_id }));
  };

  const cuentas: Record<string, any> = {};
  const cuenta = async (platform: string) => {
    if (!(platform in cuentas)) {
      cuentas[platform] = await cuentaConAcceso({ sb, fetchFn: fetch, tenantId: tenant, platform, env }).catch(() => null);
    }
    return cuentas[platform];
  };

  const leer = async (d: any) => {
    const c = await cuenta(d.platform);
    if (!c?.token) return { ok: false, error: `Sin cuenta de ${d.platform} conectada.` };
    return d.platform === 'facebook'
      ? comentariosFacebook({ fetchFn: fetch, token: c.token, postId: d.external_post_id, paginaId: c.external_account_id })
      : comentariosInstagram({ fetchFn: fetch, token: c.token, mediaId: d.external_post_id, igId: c.external_account_id });
  };

  try {
    if (b.accion === 'listar') {
      const ids = (Array.isArray(b.bundle_ids) ? b.bundle_ids : []).map(String).slice(0, 25);
      if (!ids.length) return json({ ok: true, promos: {} });

      const [{ data: emp }, { data: precios }, destinos] = await Promise.all([
        sb.from('config_empresa').select('telefono').eq('tenant_id', tenant).maybeSingle(),
        sb.from('hermes_publication_jobs').select('publication_bundle_id, precio_mostrado')
          .eq('tenant_id', tenant).in('publication_bundle_id', ids),
        destinosDe(ids),
      ]);
      const telefono = /^[0-9()+\-\s]{7,20}$/.test(String(emp?.telefono || '').trim()) ? String(emp.telefono).trim() : null;

      const promos: Record<string, any> = {};
      for (const id of ids) {
        const precio = (precios || []).find((p) => p.publication_bundle_id === id && p.precio_mostrado)?.precio_mostrado;
        promos[id] = { comentarios: [], errores: [], sugerida: respuestaConPrecio({ precio, telefono }) };
      }
      const leidos = await Promise.all(destinos.map(async (d) => ({ d, r: await leer(d) })));
      for (const { d, r } of leidos) {
        const p = promos[d.bundle_id];
        if (!r.ok) { p.errores.push(`${d.platform}: ${r.error}`); continue; }
        p.comentarios.push(...r.comentarios.map((c) => ({ ...c, enlace: d.external_url || null })));
      }
      for (const p of Object.values(promos)) {
        p.comentarios.sort((a: any, z: any) => String(z.fecha).localeCompare(String(a.fecha)));
      }
      return json({ ok: true, telefono, promos });
    }

    if (b.accion === 'responder') {
      const { bundle_id, platform, comment_id, texto } = b;
      if (!bundle_id || !comment_id || !['facebook', 'instagram'].includes(platform)) {
        return json({ ok: false, motivo: 'datos', error: 'Faltan datos.' }, 400);
      }
      const destinos = (await destinosDe([String(bundle_id)])).filter((d) => d.platform === platform);
      let es = false;
      for (const d of destinos) {
        const r = await leer(d);
        if (r.ok && r.comentarios.some((c) => c.id === comment_id)) { es = true; break; }
      }
      if (!es) return json({ ok: false, motivo: 'ajeno', error: 'Ese comentario no es de esta promoción.' }, 403);

      const c = await cuenta(platform);
      const r = await responderComentario({ fetchFn: fetch, token: c.token, platform, commentId: comment_id, texto });
      return json(r, r.ok ? 200 : 422);
    }

    return json({ ok: false, error: 'Acción desconocida.' }, 400);
  } catch (e) {
    console.error('[promo-comentarios]', e?.message || e);
    return json({ ok: false, error: 'No se pudieron leer los comentarios.' }, 500);
  }
});
