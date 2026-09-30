// OAuth helpers shared by the server and offline tests. Never log provider bodies.
export const SOCIAL_SCOPES = {
  // video.upload y NO video.publish: sin la auditoría de TikTok, publicar
  // directo exige poner la cuenta ENTERA en privado. Con upload el video va
  // a la bandeja del dueño y lo publica él desde el teléfono.
  tiktok: ['user.info.basic', 'video.upload'],
  youtube: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
};

export function providerConfig(platform, env) {
  if (!SOCIAL_SCOPES[platform]) throw new Error('Plataforma no admitida.');
  const prefix = platform === 'tiktok' ? 'TIKTOK' : 'YOUTUBE';
  const clientId = env(`${prefix}_CLIENT_ID`);
  const clientSecret = env(`${prefix}_CLIENT_SECRET`);
  const base = env('SUPABASE_URL');
  if (!clientId || !clientSecret || !base) throw new Error(`Faltan credenciales de ${platform} en el servidor.`);
  return { platform, clientId, clientSecret,
    redirectUri: `${base}/functions/v1/social-oauth/callback/${platform}` };
}

export function authorizationUrl(config, state, challenge) {
  const { platform, clientId, redirectUri } = config;
  const url = new URL(platform === 'tiktok'
    ? 'https://www.tiktok.com/v2/auth/authorize/' : 'https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set(platform === 'tiktok' ? 'client_key' : 'client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  url.searchParams.set('scope', SOCIAL_SCOPES[platform].join(platform === 'tiktok' ? ',' : ' '));
  if (platform === 'youtube') {
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
  } else url.searchParams.set('disable_auto_auth', '1');
  return url.toString();
}

export async function sha256(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomSecret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
}

export function checkTokens(platform, body) {
  const scopes = new Set(String(body?.scope || '').split(/[ ,]+/));
  if (!body?.access_token || body.error || !(Number(body.expires_in) > 0)) {
    throw new Error('La plataforma no entregó una autorización válida. Vuelve a conectar.');
  }
  if (!SOCIAL_SCOPES[platform].every(s => scopes.has(s))) {
    throw new Error('No se concedieron todos los permisos de publicación y lectura necesarios.');
  }
  // Do not silently install a connection that cannot survive the first expiry.
  if (!body.refresh_token) throw new Error('No se recibió autorización renovable. Vuelve a autorizar la cuenta.');
  return body;
}

export async function exchangeCode(config, code, verifier, fetchFn = fetch) {
  const { platform, clientId, clientSecret, redirectUri } = config;
  const body = new URLSearchParams({ grant_type: 'authorization_code', code,
    client_secret: clientSecret, redirect_uri: redirectUri });
  body.set(platform === 'tiktok' ? 'client_key' : 'client_id', clientId);
  if (platform === 'youtube') body.set('code_verifier', verifier);
  const response = await fetchFn(platform === 'tiktok'
    ? 'https://open.tiktokapis.com/v2/oauth/token/' : 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body, redirect: 'error', signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`La plataforma rechazó la autorización (HTTP ${response.status}).`);
  return checkTokens(platform, await response.json());
}

export async function readIdentity(platform, token, fetchFn = fetch) {
  const url = platform === 'tiktok'
    ? 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name'
    : 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true';
  const response = await fetchFn(url, { headers: { Authorization: `Bearer ${token.access_token}` },
    redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('No se pudo comprobar la identidad de la cuenta.');
  const body = await response.json();
  if (platform === 'tiktok') {
    const user = body.data?.user;
    if (body.error?.code !== 'ok' || !user?.open_id || user.open_id !== token.open_id) {
      throw new Error('TikTok no confirmó la identidad de la cuenta.');
    }
    return { id: user.open_id, name: user.display_name || 'TikTok' };
  }
  if (body.items?.length !== 1 || !body.items[0].id) throw new Error('Selecciona un único canal de YouTube al autorizar.');
  return { id: body.items[0].id, name: body.items[0].snippet?.title || 'YouTube' };
}
