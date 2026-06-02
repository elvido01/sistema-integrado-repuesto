// ============================================================
// meta-add-ig-tester — Enviar invitacion de Instagram Tester
// ------------------------------------------------------------
// El usuario tiene su app de Meta en modo Desarrollo. Para que
// una cuenta de IG pueda mandar DMs que lleguen al webhook, esa
// cuenta debe ser "Instagram Tester". El paso 1 (enviar la
// invitacion) si se puede hacer via Graph API si tenemos App
// Access Token (app_id|app_secret). El paso 2 (aceptar la
// invitacion en Instagram) es manual obligatoriamente.
//
// Body: { app_secret: string, ig_username: string }
// Devuelve la respuesta cruda de Meta para diagnostico.
// ============================================================

// @ts-nocheck

// App IDs a probar: primero el de Instagram (donde suele matchear el secret
// que el usuario copia del panel de IG), luego el principal de MotoFlow CRM.
const APP_IDS_TO_TRY = ['1701592361182607', '27106153195670746'];

Deno.serve(async (req: Request) => {
    if (req.method !== 'POST') return new Response('method', { status: 405 });
    let body: any = {};
    try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'JSON invalido' }), { status: 400 }); }

    const app_secret = (body?.app_secret || '').trim();
    const ig_username = (body?.ig_username || '').trim().replace(/^@/, '');
    const force_app_id = (body?.app_id || '').trim();

    if (!app_secret || app_secret.length < 20) {
        return new Response(JSON.stringify({ error: 'app_secret faltante o invalido' }), { status: 400 });
    }
    if (!ig_username) {
        return new Response(JSON.stringify({ error: 'ig_username faltante' }), { status: 400 });
    }

    const candidates = force_app_id ? [force_app_id] : APP_IDS_TO_TRY;
    const attempts: any[] = [];

    for (const appId of candidates) {
        const appAccessToken = `${appId}|${app_secret}`;
        const url = `https://graph.facebook.com/v22.0/${appId}/instagram_testers?ig_username=${encodeURIComponent(ig_username)}&access_token=${encodeURIComponent(appAccessToken)}`;
        const r = await fetch(url, { method: 'POST' });
        const out = await r.json();
        attempts.push({ app_id: appId, http: r.status, result: out });
        if (r.status === 200 && out?.success) {
            return new Response(JSON.stringify({
                ok: true,
                app_id_que_funciono: appId,
                ig_username,
                result: out,
                next: `OK. Ahora abre Instagram con ${ig_username} y acepta la invitacion en https://www.instagram.com/accounts/manage_access/`,
            }, null, 2), { status: 200, headers: { 'content-type': 'application/json' } });
        }
    }

    return new Response(JSON.stringify({
        ok: false,
        ig_username,
        attempts,
        hint: 'Ningun App ID funciono con ese secret. Verifica que el secret venga de Configuracion de la app > Basica.',
    }, null, 2), { status: 200, headers: { 'content-type': 'application/json' } });
});
