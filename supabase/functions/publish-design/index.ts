// ============================================================
// publish-design — Publica un disen~o renderizado a FB y/o IG
// ============================================================
// Body: {
//   tenant_id, design_id, caption,
//   channels: ['facebook','instagram']     // (whatsapp se envia desde el front via servicio local)
// }
//
// Para cada canal:
//   - facebook: POST /{page-id}/photos con url+message (publica al feed)
//   - instagram: 2 pasos
//        1) POST /{ig-id}/media (con image_url y caption)
//        2) POST /{ig-id}/media_publish (con creation_id)
//
// Marca design_documents.published_to con los canales OK.
// ============================================================

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

Deno.serve(async (req: Request) => {
    if (req.method !== 'POST') return json({ error: 'method' }, 405);

    let body: any = {};
    try { body = await req.json(); } catch { return json({ error: 'JSON invalido' }, 400); }

    const { tenant_id, design_id, caption = '', channels = [] } = body;
    if (!tenant_id || !design_id || !Array.isArray(channels) || !channels.length) {
        return json({ error: 'Faltan tenant_id, design_id o channels' }, 400);
    }

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Cargar disen~o
    const { data: design, error: dErr } = await supabase
        .from('design_documents')
        .select('id, tenant_id, rendered_url, thumbnail_url, name, published_to, metadata')
        .eq('id', design_id)
        .eq('tenant_id', tenant_id)
        .single();
    if (dErr || !design) return json({ error: 'Disen~o no encontrado' }, 404);

    const imageUrl = design.rendered_url || design.thumbnail_url;
    if (!imageUrl) return json({ error: 'El disen~o aun no se ha exportado a PNG. Abrelo y dale Exportar.' }, 400);

    const results: Record<string, any> = {};
    const newPublishedTo = new Set(design.published_to || []);

    for (const ch of channels) {
        if (ch === 'facebook') {
            results.facebook = await publishToFacebook(supabase, tenant_id, imageUrl, caption);
            if (results.facebook.ok) newPublishedTo.add('facebook');
        } else if (ch === 'instagram') {
            results.instagram = await publishToInstagram(supabase, tenant_id, imageUrl, caption);
            if (results.instagram.ok) newPublishedTo.add('instagram');
        } else {
            results[ch] = { ok: false, error: `canal "${ch}" no soportado en esta funcion (usa servicio local para WhatsApp)` };
        }
    }

    await supabase.from('design_documents').update({
        published_to: Array.from(newPublishedTo),
        status: 'publicado',
        metadata: { ...(design.metadata || {}), last_publish: { at: new Date().toISOString(), channels, results } },
    }).eq('id', design_id);

    return json({ ok: true, results });
});

// ── FACEBOOK PAGE ──
async function publishToFacebook(supabase: any, tenantId: string, imageUrl: string, caption: string) {
    const acc = await getAccount(supabase, tenantId, 'facebook');
    if (!acc) return { ok: false, error: 'No hay cuenta de Facebook conectada para este tenant' };

    const pageId = acc.external_account_id;
    const url = `https://graph.facebook.com/v22.0/${pageId}/photos?` +
        `url=${encodeURIComponent(imageUrl)}` +
        `&caption=${encodeURIComponent(caption)}` +
        `&access_token=${encodeURIComponent(acc.token)}`;
    const r = await fetch(url, { method: 'POST' });
    const out = await r.json();
    if (!r.ok || out?.error) return { ok: false, http: r.status, error: out?.error?.message || 'fb error', raw: out };
    return { ok: true, post_id: out.post_id || out.id, raw: out };
}

// ── INSTAGRAM (2 pasos) ──
async function publishToInstagram(supabase: any, tenantId: string, imageUrl: string, caption: string) {
    const acc = await getAccount(supabase, tenantId, 'instagram');
    if (!acc) return { ok: false, error: 'No hay cuenta de Instagram conectada para este tenant' };

    const igId = acc.external_account_id;
    const isIgApi = acc.token.startsWith('IGAA');
    const host = isIgApi ? 'graph.instagram.com' : 'graph.facebook.com';
    const ident = isIgApi ? 'me' : igId;

    // Paso 1: crear el media container
    const createUrl = `https://${host}/v22.0/${ident}/media?` +
        `image_url=${encodeURIComponent(imageUrl)}` +
        `&caption=${encodeURIComponent(caption)}` +
        `&access_token=${encodeURIComponent(acc.token)}`;
    const r1 = await fetch(createUrl, { method: 'POST' });
    const o1 = await r1.json();
    if (!r1.ok || o1?.error || !o1?.id) {
        return { ok: false, step: 'create_media', http: r1.status, error: o1?.error?.message || 'ig create error', raw: o1 };
    }

    // Paso 2: publicar el container
    const publishUrl = `https://${host}/v22.0/${ident}/media_publish?` +
        `creation_id=${o1.id}` +
        `&access_token=${encodeURIComponent(acc.token)}`;
    const r2 = await fetch(publishUrl, { method: 'POST' });
    const o2 = await r2.json();
    if (!r2.ok || o2?.error) {
        return { ok: false, step: 'publish', http: r2.status, error: o2?.error?.message || 'ig publish error', raw: o2 };
    }
    return { ok: true, creation_id: o1.id, media_id: o2.id, raw: o2 };
}

async function getAccount(supabase: any, tenantId: string, platform: string) {
    const { data: acc } = await supabase
        .from('social_accounts')
        .select('id, external_account_id')
        .eq('tenant_id', tenantId)
        .eq('platform', platform)
        .eq('status', 'connected')
        .maybeSingle();
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
        headers: { 'content-type': 'application/json' },
    });
}
