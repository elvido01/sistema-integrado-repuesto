// ============================================================
// meta-subscribe-pages — Suscribe Pagina FB + cuenta IG a la app
// ============================================================
// Lee los tokens guardados en social_account_secrets y llama al
// Graph API POST /{id}/subscribed_apps para que Meta empiece a
// enviar eventos de mensajes al webhook configurado en la app.
//
// Este paso es separado del "Verificar webhook" en el panel de
// Meta: verificar solo registra la URL, NO suscribe la pagina.
// Sin esta llamada, los DMs nunca llegan al webhook.
//
// Auth: --no-verify-jwt; se invoca una sola vez como setup admin.
// ============================================================

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const FB_PAGE_ID = '100771345587204';
const IG_BIZ_ID = '17841442598881436';

Deno.serve(async (req: Request) => {
    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Opcionalmente acepta un nuevo token de IG en el body para actualizarlo
    // en la BD antes de suscribir. Esto evita que el token tenga que pasar
    // por el chat o ser pegado en cualquier otra ventana.
    let newIgToken: string | null = null;
    if (req.method === 'POST') {
        try {
            const body = await req.json();
            if (body?.ig_token && typeof body.ig_token === 'string' && body.ig_token.length > 50) {
                newIgToken = body.ig_token.trim();
            }
        } catch (_) { /* sin body, seguimos */ }
    }

    const result: any = { facebook: null, instagram: null, ig_token_updated: false };

    if (newIgToken) {
        const { data: igAcc0 } = await supabase
            .from('social_accounts').select('id')
            .eq('tenant_id', TENANT_ID).eq('platform', 'instagram').eq('external_account_id', IG_BIZ_ID).maybeSingle();
        if (igAcc0?.id) {
            const { error: upErr } = await supabase
                .from('social_account_secrets')
                .upsert({ account_id: igAcc0.id, access_token: newIgToken, updated_at: new Date().toISOString() }, { onConflict: 'account_id' });
            result.ig_token_updated = !upErr;
            if (upErr) result.ig_token_update_error = upErr.message;
        }
    }

    // ── FACEBOOK PAGE ──
    try {
        const { data: fbAcc } = await supabase
            .from('social_accounts')
            .select('id')
            .eq('tenant_id', TENANT_ID)
            .eq('platform', 'facebook')
            .eq('external_account_id', FB_PAGE_ID)
            .maybeSingle();
        if (!fbAcc?.id) throw new Error('cuenta FB no encontrada en social_accounts');

        const { data: fbSec } = await supabase
            .from('social_account_secrets')
            .select('access_token')
            .eq('account_id', fbAcc.id)
            .maybeSingle();
        const fbToken = fbSec?.access_token;
        if (!fbToken) throw new Error('token FB no encontrado en social_account_secrets');

        const url = `https://graph.facebook.com/v21.0/${FB_PAGE_ID}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,message_deliveries,message_reads&access_token=${encodeURIComponent(fbToken)}`;
        const r = await fetch(url, { method: 'POST' });
        const body = await r.json();
        result.facebook = { http: r.status, body };

        // Tambien verificamos a que esta suscrita la pagina
        const checkUrl = `https://graph.facebook.com/v21.0/${FB_PAGE_ID}/subscribed_apps?access_token=${encodeURIComponent(fbToken)}`;
        const c = await fetch(checkUrl);
        result.facebook.subscribed = await c.json();
    } catch (e: any) {
        result.facebook = { error: e?.message || String(e) };
    }

    // ── INSTAGRAM BUSINESS ──
    try {
        const { data: igAcc } = await supabase
            .from('social_accounts')
            .select('id')
            .eq('tenant_id', TENANT_ID)
            .eq('platform', 'instagram')
            .eq('external_account_id', IG_BIZ_ID)
            .maybeSingle();
        if (!igAcc?.id) throw new Error('cuenta IG no encontrada en social_accounts');

        const { data: igSec } = await supabase
            .from('social_account_secrets')
            .select('access_token')
            .eq('account_id', igAcc.id)
            .maybeSingle();
        const igToken = igSec?.access_token;
        if (!igToken) throw new Error('token IG no encontrado en social_account_secrets');

        // Token "IGAA..." de "API setup with Instagram login" => usa graph.instagram.com,
        // NO graph.facebook.com. Y el id correcto es "me" porque el token ya esta
        // asociado a la cuenta IG.
        const isIgApiToken = igToken.startsWith('IGAA');
        const host = isIgApiToken ? 'graph.instagram.com' : 'graph.facebook.com';
        const ident = isIgApiToken ? 'me' : IG_BIZ_ID;

        const url = `https://${host}/v21.0/${ident}/subscribed_apps?subscribed_fields=messages&access_token=${encodeURIComponent(igToken)}`;
        const r = await fetch(url, { method: 'POST' });
        const body = await r.json();
        result.instagram = { http: r.status, body, endpoint: `${host}/${ident}` };

        const checkUrl = `https://${host}/v21.0/${ident}/subscribed_apps?access_token=${encodeURIComponent(igToken)}`;
        const c = await fetch(checkUrl);
        result.instagram.subscribed = await c.json();
    } catch (e: any) {
        result.instagram = { error: e?.message || String(e) };
    }

    return new Response(JSON.stringify(result, null, 2), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    });
});
