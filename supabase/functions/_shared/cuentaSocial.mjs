// ════════════════════════════════════════════════════════════════════════
//  LA CUENTA DE UNA RED, CON SU ACCESO LISTO — solo del lado servidor
// ════════════════════════════════════════════════════════════════════════
//  La usan el publicador (publicar-promociones) y la prueba privada de
//  YouTube (youtube-prueba-privada), para que las dos lean la cuenta por el
//  MISMO camino. El token sale de aquí hacia el adaptador y nunca hacia el
//  navegador ni hacia la respuesta de la función.
//
//  · Solo cuentas `connected`: un registro manual antiguo (sin token) no
//    puede tapar a la conexión de verdad. Con varias, la más reciente;
//    limit(1) y no maybeSingle(), que con dos filas revienta.
//  · YouTube da accesos de una hora: si al guardado le quedan menos de 5
//    minutos se renueva con el permiso guardado y se escribe el nuevo.
// ════════════════════════════════════════════════════════════════════════
import { accesoVigenteGoogle } from './youtube.mjs';
import { accesoVigenteTikTok } from './tiktok.mjs';

export async function cuentaConAcceso({ sb, fetchFn, tenantId, platform, env = () => undefined }) {
  const { data: cuentas } = await sb
    .from('social_accounts')
    .select('id, external_account_id, publicacion_habilitada')
    .eq('tenant_id', tenantId)
    .eq('platform', platform)
    .eq('status', 'connected')
    .order('connected_at', { ascending: false })
    .limit(1);
  const c = cuentas?.[0];
  if (!c?.id) return null;

  const { data: sec } = await sb
    .from('social_account_secrets')
    .select('access_token, refresh_token, expires_at')
    .eq('account_id', c.id)
    .maybeSingle();
  if (!sec?.access_token && !sec?.refresh_token) return null;

  let token = sec.access_token;
  if (platform === 'youtube') {
    token = await accesoVigenteGoogle({
      fetchFn,
      secreto: sec,
      clientId: env('YOUTUBE_CLIENT_ID'),
      clientSecret: env('YOUTUBE_CLIENT_SECRET'),
      guardar: async (nuevo) => {
        const { error } = await sb.from('social_account_secrets')
          .update({ access_token: nuevo.access_token, expires_at: nuevo.expires_at, updated_at: new Date().toISOString() })
          .eq('account_id', c.id)
          .select('account_id');
        // Si no se guarda, el acceso sirve igual para esta vez; la próxima se
        // vuelve a renovar. Se avisa, sin el token.
        if (error) console.error('[cuentaSocial] no se guardó el acceso renovado:', error.message);
      },
    });
  }
  // TikTok: acceso de 24 horas, y al renovar puede rotar el permiso
  // renovable. Si no se guarda el nuevo, mañana no se puede renovar.
  if (platform === 'tiktok') {
    token = await accesoVigenteTikTok({
      fetchFn,
      secreto: sec,
      clientKey: env('TIKTOK_CLIENT_ID'),
      clientSecret: env('TIKTOK_CLIENT_SECRET'),
      guardar: async (nuevo) => {
        const { error } = await sb.from('social_account_secrets')
          .update({ access_token: nuevo.access_token, refresh_token: nuevo.refresh_token, expires_at: nuevo.expires_at, updated_at: new Date().toISOString() })
          .eq('account_id', c.id)
          .select('account_id');
        if (error) console.error('[cuentaSocial] no se guardó el acceso renovado de TikTok:', error.message);
      },
    });
  }
  if (!token) return null;
  return { id: c.id, external_account_id: c.external_account_id, token, habilitada: c.publicacion_habilitada };
}
