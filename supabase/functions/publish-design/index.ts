// ============================================================
// publish-design — Publica un diseño renderizado a FB y/o IG
// ============================================================
// Body: {
//   design_id, caption,
//   channels: ['facebook','instagram']   // (whatsapp se envía desde el front)
//   tenant_id                            // opcional: si viene, TIENE que ser
//                                        // la empresa activa de quien llama
// }
//
// >>> QUIEN LLAMA MANDA, NO EL BODY <<<
// Antes la empresa salía del `tenant_id` del body y nadie miraba quién
// llamaba: con una sesión cualquiera —la de otra empresa— se podía publicar
// en la página de Facebook de Repuestos Morla, porque la función usa la
// service role key y la service role key no tiene RLS. Ahora la empresa se
// resuelve con get_user_tenant() CON EL TOKEN DEL USUARIO (la empresa ACTIVA,
// no profiles.tenant_id: el que cambia de empresa publicaría en la otra), y el
// tenant_id del body solo se acepta si coincide.
//
// >>> "PUBLICADO" SOLO SI SALIÓ TODO <<<
// El update final corría pase lo que pase: con Instagram caído, el diseño
// quedaba marcado `status='publicado'` igual, y en el panel se veía como
// hecho. Ahora eso solo pasa si TODOS los canales pedidos salieron bien; si
// alguno falla, el estado no se toca y el detalle queda en metadata.
//
// Para cada canal:
//   - facebook: POST /{page-id}/photos con url+message (publica al feed)
//   - instagram: 2 pasos
//        1) POST /{ig-id}/media (con image_url y caption)
//        2) POST /{ig-id}/media_publish (con creation_id)
// ============================================================

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const V = 'v22.0';

Deno.serve(async (req: Request) => {
    // Sin esto el navegador ni llega: invoke() manda Authorization, y eso
    // obliga a un preflight OPTIONS que antes contestaba 405.
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'method' }, 405);

    let body: any = {};
    try { body = await req.json(); } catch { return json({ error: 'JSON invalido' }, 400); }

    const { design_id, caption = '', channels = [] } = body;
    if (!design_id || !Array.isArray(channels) || !channels.length) {
        return json({ error: 'Faltan design_id o channels' }, 400);
    }

    // ── Quién llama ────────────────────────────────────────────────────────
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
    if (!token) return json({ error: 'Falta el token de sesion. Vuelve a entrar al sistema.' }, 401);

    const comoUsuario = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } },
    );

    const { data: { user }, error: uErr } = await comoUsuario.auth.getUser(token);
    if (uErr || !user) return json({ error: 'Tu sesion se vencio. Vuelve a entrar.' }, 401);

    // La empresa ACTIVA de quien llama. Si cambió de empresa, es la nueva.
    const { data: tenantId, error: tErr } = await comoUsuario.rpc('get_user_tenant');
    if (tErr || !tenantId) return json({ error: 'No se pudo resolver tu empresa activa.' }, 403);
    if (body.tenant_id && body.tenant_id !== tenantId) {
        return json({ error: 'Ese diseño no es de tu empresa activa.' }, 403);
    }

    // La service role key entra SOLO después de saber quién llama y de qué
    // empresa: hace falta para leer los tokens, que nadie más puede leer.
    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: design, error: dErr } = await supabase
        .from('design_documents')
        .select('id, tenant_id, rendered_url, thumbnail_url, name, published_to, status, metadata')
        .eq('id', design_id)
        .eq('tenant_id', tenantId)
        .single();
    if (dErr || !design) return json({ error: 'Diseño no encontrado en tu empresa activa.' }, 404);

    const imageUrl = design.rendered_url || design.thumbnail_url;
    if (!imageUrl) return json({ error: 'El diseño aun no se ha exportado a PNG. Abrelo y dale Exportar.' }, 400);

    const results: Record<string, any> = {};
    const newPublishedTo = new Set(design.published_to || []);

    for (const ch of channels) {
        if (ch === 'facebook') {
            results.facebook = await publishToFacebook(supabase, tenantId, imageUrl, caption);
            if (results.facebook.ok) newPublishedTo.add('facebook');
        } else if (ch === 'instagram') {
            results.instagram = await publishToInstagram(supabase, tenantId, imageUrl, caption);
            if (results.instagram.ok) newPublishedTo.add('instagram');
        } else {
            results[ch] = { ok: false, error: `canal "${ch}" no soportado en esta funcion (usa servicio local para WhatsApp)` };
        }
    }

    const fallaron = channels.filter((ch: string) => !results[ch]?.ok);
    const todoBien = fallaron.length === 0;

    // El estado solo sube a 'publicado' si salió TODO. Si algo falló, el
    // diseño se queda como estaba y el detalle queda escrito.
    const patch: Record<string, any> = {
        published_to: Array.from(newPublishedTo),
        metadata: {
            ...(design.metadata || {}),
            last_publish: {
                at: new Date().toISOString(),
                by: user.id,           // quién lo mandó: antes no se guardaba
                channels,
                results,
                fallaron,
            },
        },
    };
    if (todoBien) patch.status = 'publicado';
    await supabase.from('design_documents').update(patch).eq('id', design_id);

    return json({
        ok: todoBien,
        parcial: !todoBien && fallaron.length < channels.length,
        fallaron,
        results,
    }, todoBien ? 200 : 207);
});

// ── FACEBOOK PAGE ──
async function publishToFacebook(supabase: any, tenantId: string, imageUrl: string, caption: string) {
    const acc = await getAccount(supabase, tenantId, 'facebook');
    if (!acc) return { ok: false, error: 'No hay cuenta de Facebook conectada para este tenant' };

    // El token va en la cabecera y los datos en el cuerpo: en la URL, el token
    // acaba en los registros de Meta, en los de cualquier proxy y en los
    // nuestros.
    const r = await fetch(`https://graph.facebook.com/${V}/${acc.external_account_id}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${acc.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: imageUrl, caption }),
    });
    const out = await r.json().catch(() => null);
    if (!r.ok || out?.error) return { ok: false, http: r.status, error: out?.error?.message || 'fb error', raw: out };
    return { ok: true, post_id: out.post_id || out.id, raw: out };
}

// ── INSTAGRAM (2 pasos) ──
async function publishToInstagram(supabase: any, tenantId: string, imageUrl: string, caption: string) {
    const acc = await getAccount(supabase, tenantId, 'instagram');
    if (!acc) return { ok: false, error: 'No hay cuenta de Instagram conectada para este tenant' };

    const isIgApi = acc.token.startsWith('IGAA');
    const host = isIgApi ? 'graph.instagram.com' : 'graph.facebook.com';
    const ident = isIgApi ? 'me' : acc.external_account_id;
    const cabeceras = { Authorization: `Bearer ${acc.token}`, 'Content-Type': 'application/json' };

    // Paso 1: crear el media container
    const r1 = await fetch(`https://${host}/${V}/${ident}/media`, {
        method: 'POST', headers: cabeceras,
        body: JSON.stringify({ image_url: imageUrl, caption }),
    });
    const o1 = await r1.json().catch(() => null);
    if (!r1.ok || o1?.error || !o1?.id) {
        return { ok: false, step: 'create_media', http: r1.status, error: o1?.error?.message || 'ig create error', raw: o1 };
    }

    // Paso 2: publicar el container
    const r2 = await fetch(`https://${host}/${V}/${ident}/media_publish`, {
        method: 'POST', headers: cabeceras,
        body: JSON.stringify({ creation_id: o1.id }),
    });
    const o2 = await r2.json().catch(() => null);
    if (!r2.ok || o2?.error) {
        return { ok: false, step: 'publish', http: r2.status, error: o2?.error?.message || 'ig publish error', raw: o2 };
    }
    return { ok: true, creation_id: o1.id, media_id: o2.id, raw: o2 };
}

async function getAccount(supabase: any, tenantId: string, platform: string) {
    // limit(1) y no maybeSingle(): con dos páginas conectadas, maybeSingle
    // revienta en vez de publicar.
    const { data: cuentas } = await supabase
        .from('social_accounts')
        .select('id, external_account_id')
        .eq('tenant_id', tenantId)
        .eq('platform', platform)
        .eq('status', 'connected')
        .order('connected_at', { ascending: false })
        .limit(1);
    const acc = cuentas?.[0];
    if (!acc?.id) return null;
    const { data: sec } = await supabase
        .from('social_account_secrets')
        .select('access_token')
        .eq('account_id', acc.id)
        .maybeSingle();
    if (!sec?.access_token) return null;
    return { ...acc, token: sec.access_token };
}

function json(body: any, status = 200) {
    return new Response(JSON.stringify(body, null, 2), {
        status,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
}
