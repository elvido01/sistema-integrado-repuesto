// Connect accounts only. No publication and no automatic publishing enablement.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { authorizationUrl, exchangeCode, providerConfig, randomSecret, readIdentity, sha256 } from '../_shared/social-oauth.mjs';

const env = (key: string) => Deno.env.get(key);
const base = env('SUPABASE_URL')!;
const origins = new Set((env('SOCIAL_OAUTH_ORIGINS') || 'https://repuestos-morla.pages.dev').split(',').map(s => s.trim()));
const sb = createClient(base, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer', 'Vary': 'Origin' };
  if (origins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info';
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  }
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { status: origins.has(origin) ? 204 : 403, headers });
  const url = new URL(req.url);
  try {
    if (req.method === 'POST' && url.pathname.endsWith('/social-oauth/start')) {
      if (!origins.has(origin)) return json({ error: 'Origen no autorizado.' }, 403);
      const jwt = req.headers.get('authorization')?.replace(/^Bearer /i, '');
      if (!jwt) return json({ error: 'Inicia sesión en MotoFlow.' }, 401);
      const { data: auth, error: authError } = await sb.auth.getUser(jwt);
      if (authError || !auth.user) return json({ error: 'Sesión inválida.' }, 401);
      const userSb = createClient(base, env('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
      const { data: tenant, error: tenantError } = await userSb.rpc('promo_tenant_admin');
      if (tenantError || !tenant) return json({ error: 'Solo el dueño o administrador puede conectar redes.' }, 403);
      const { platform } = await req.json();
      let config;
      try { config = providerConfig(platform, env); }
      catch { return json({ error: 'Esta red aún no tiene sus credenciales configuradas en el servidor.' }, 503); }
      const state = randomSecret();
      const verifier = randomSecret();
      const { error } = await sb.from('social_oauth_states').insert({
        state_hash: await sha256(state), user_id: auth.user.id, tenant_id: tenant, platform,
        code_verifier: verifier, return_origin: origin, expires_at: new Date(Date.now() + 600000).toISOString(),
      });
      if (error) return json({ error: 'No se pudo iniciar la conexión.' }, 500);
      return json({ url: authorizationUrl(config, state, await sha256(verifier)) });
    }
    const match = url.pathname.match(/\/social-oauth\/callback\/(tiktok|youtube)$/);
    if (req.method !== 'GET' || !match) return json({ error: 'Ruta no encontrada.' }, 404);
    const platform = match[1];
    const state = url.searchParams.get('state') || '';
    if (!/^[a-f0-9]{64}$/.test(state)) return json({ error: 'Autorización inválida o vencida.' }, 400);
    // DELETE RETURNING is atomic, preventing replay and concurrent consumption.
    const { data: states, error: stateError } = await sb.from('social_oauth_states').delete()
      .eq('state_hash', await sha256(state)).eq('platform', platform)
      .gt('expires_at', new Date().toISOString()).select();
    const saved = states?.[0];
    if (stateError || !saved || !origins.has(saved.return_origin)) return json({ error: 'Autorización inválida o vencida. Inicia de nuevo desde MotoFlow.' }, 400);
    const done = (status: string) => new Response(null, { status: 303, headers: {
      ...headers, Location: `${saved.return_origin}/?social_connection=${status}&platform=${platform}`,
    } });
    if (url.searchParams.has('error')) return done('cancelled');
    const code = url.searchParams.get('code');
    if (!code) return json({ error: 'La plataforma no entregó el código.' }, 400);
    const { data: member, error: memberError } = await sb.from('usuarios_empresas').select('user_id')
      .eq('user_id', saved.user_id).eq('tenant_id', saved.tenant_id).in('rol', ['owner', 'admin']).limit(1);
    if (memberError || !member?.length) return json({ error: 'Ya no tienes autorización sobre esta empresa.' }, 403);
    const tokens = await exchangeCode(providerConfig(platform, env), code, saved.code_verifier);
    const identity = await readIdentity(platform, tokens);
    const { error } = await sb.rpc('social_oauth_save_connection', {
      p_user: saved.user_id, p_tenant: saved.tenant_id, p_platform: platform,
      p_external_id: identity.id, p_name: identity.name, p_access_token: tokens.access_token,
      p_refresh_token: tokens.refresh_token, p_expires_at: new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString(),
      p_scopes: tokens.scope,
    });
    if (error) return json({ error: 'No se pudo guardar la conexión. Intenta de nuevo desde MotoFlow.' }, 500);
    return done('connected');
  } catch {
    // Never echo or log provider bodies: they can contain credentials.
    return json({ error: 'No se completó la conexión. Comprueba la configuración y los permisos e inténtalo de nuevo desde MotoFlow.' }, 400);
  }
});
