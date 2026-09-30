// ════════════════════════════════════════════════════════════════════════
//  medir-prueba — mide UNA publicación y devuelve lo que contestó la red,
//  sin guardar nada. Para diagnosticar el medidor (_shared/metricas.mjs).
//  Solo con la llave de servicio. Nunca devuelve tokens.
//
//  POST { "tenant_id"?: uuid, "platform": "facebook", "placement": "feed", "id": "<external_post_id>" }
//  Sin "id": toma la última publicación de esa red y formato.
// ════════════════════════════════════════════════════════════════════════

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { cuentaConAcceso } from '../_shared/cuentaSocial.mjs';
import { medirDestino } from '../_shared/metricas.mjs';

const MORLA = '00000000-0000-0000-0000-000000000001';
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b, null, 2), { status: s, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  const pedida = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  let rol = '';
  try {
    const c = pedida.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    rol = JSON.parse(atob(c + '='.repeat((4 - (c.length % 4)) % 4)))?.role || '';
  } catch { /* no es JWT */ }
  if (rol !== 'service_role') return json({ ok: false, error: 'Solo con la llave de servicio.' }, 403);

  let b: any = {};
  try { b = await req.json(); } catch { /* vacío */ }
  const tenantId = b.tenant_id || MORLA;
  const platform = String(b.platform || 'facebook');
  const placement = String(b.placement || 'feed');
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  let id = b.id;
  if (!id) {
    const { data } = await sb.from('hermes_publication_targets').select('external_post_id')
      .eq('tenant_id', tenantId).eq('platform', platform).eq('placement', placement).eq('status', 'published')
      .not('external_post_id', 'is', null).order('published_at', { ascending: false }).limit(1).maybeSingle();
    id = data?.external_post_id;
  }
  if (!id) return json({ ok: false, error: 'No hay publicación de esa red y formato.' });

  let cuenta;
  try {
    cuenta = await cuentaConAcceso({ sb, fetchFn: fetch, tenantId, platform, env: (k: string) => Deno.env.get(k) });
  } catch (e) {
    return json({ ok: false, paso: 'acceso', error: e?.message || String(e) });
  }
  if (!cuenta?.token) return json({ ok: false, paso: 'cuenta', error: 'Sin cuenta conectada.' });

  try {
    const m = await medirDestino({ fetchFn: fetch, token: cuenta.token, platform, placement, id });
    return json({ id, resultado: m });
  } catch (e) {
    return json({ id, ok: false, error: e?.message || String(e) });
  }
});
