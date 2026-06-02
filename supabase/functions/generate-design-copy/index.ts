// ============================================================
// generate-design-copy — Genera 3 variantes de copy para diseños
// ============================================================
// Recibe info de un producto + tipo de pieza + tono y devuelve 3
// variantes de copy listas para usar en una plantilla del modulo
// Diseno Pro. La idea es que el vendedor elija la mejor y se cree
// el diseno con esos textos pre-llenados.
//
// Body: {
//   producto: { nombre, precio, descripcion?, codigo? },
//   tipo: 'oferta' | 'nuevo' | 'promo' | 'reposicion' | 'comunicado',
//   tono: 'urgente' | 'profesional' | 'casual' | 'elegante',
// }
// Returns: { variantes: [{ titulo, subtitulo, cta, hashtags? }, ...] }
// ============================================================

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const TIPO_PROMPTS = {
    oferta:     'Es una OFERTA con descuento. Resalta urgencia y precio. Usa palabras como "solo hoy", "ultima oportunidad", "ahorra".',
    nuevo:      'Es el LANZAMIENTO de un producto nuevo en tienda. Resalta novedad y exclusividad. Usa "ya disponible", "nuevo en tienda".',
    promo:      'Es una PROMOCION (combo, 2x1, descuento en cantidad). Resalta el beneficio del combo.',
    reposicion: 'El producto estaba AGOTADO y volvio. Resalta "regreso", "ya esta disponible otra vez". Tono entusiasta.',
    comunicado: 'Es un COMUNICADO general (no promocional). Tono informativo, claro, directo.',
};

const TONO_PROMPTS = {
    urgente:      'Tono urgente y persuasivo. Frases cortas, signos de exclamacion.',
    profesional:  'Tono profesional, respetuoso, formal pero accesible.',
    casual:       'Tono casual, amigable, como si le hablaras a un cliente conocido. Tutea.',
    elegante:     'Tono elegante y aspiracional. Frases sobrias, sin exclamaciones excesivas.',
};

Deno.serve(async (req: Request) => {
    if (req.method !== 'POST') return new Response('method', { status: 405 });

    let body: any = {};
    try { body = await req.json(); } catch { return json({ error: 'JSON invalido' }, 400); }

    const producto = body?.producto || {};
    const tipo = body?.tipo || 'oferta';
    const tono = body?.tono || 'urgente';

    if (!producto?.nombre) return json({ error: 'Falta producto.nombre' }, 400);

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) return json({ error: 'OPENAI_API_KEY no configurada' }, 500);

    const systemPrompt = `Eres un copywriter especialista en marketing de repuestos de motos para Republica Dominicana. Generas copy corto, directo, conversacional, para posts de Instagram y Facebook. NO usas emojis excesivos (maximo 1-2 si encajan).`;

    const userPrompt = `Genera 3 variantes de copy para un post de redes sociales.

PRODUCTO:
- Nombre: ${producto.nombre}
${producto.precio ? `- Precio: RD$ ${Number(producto.precio).toLocaleString('es-DO')}` : ''}
${producto.precio_antes ? `- Precio antes: RD$ ${Number(producto.precio_antes).toLocaleString('es-DO')}` : ''}
${producto.descripcion ? `- Descripcion: ${producto.descripcion}` : ''}
${producto.codigo ? `- Codigo: ${producto.codigo}` : ''}

TIPO: ${TIPO_PROMPTS[tipo] || TIPO_PROMPTS.oferta}

TONO: ${TONO_PROMPTS[tono] || TONO_PROMPTS.urgente}

Cada variante debe tener:
- titulo: 2-5 palabras MAXIMO. En MAYUSCULAS. El gancho principal.
- subtitulo: 1 frase corta de apoyo (max 12 palabras).
- cta: llamada a la accion corta (max 4 palabras). Ejemplos: "Llama ahora", "Visitanos hoy", "Pide el tuyo".
- hashtags: 3-5 hashtags relevantes separados por espacio (con #).

Responde SOLO con JSON valido en este formato exacto:
{
  "variantes": [
    { "titulo": "...", "subtitulo": "...", "cta": "...", "hashtags": "..." },
    { "titulo": "...", "subtitulo": "...", "cta": "...", "hashtags": "..." },
    { "titulo": "...", "subtitulo": "...", "cta": "...", "hashtags": "..." }
  ]
}

IMPORTANTE: Las 3 variantes deben ser MARCADAMENTE distintas entre si (diferente angulo, no parafrasis).`;

    const t0 = Date.now();
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.85,
            max_tokens: 600,
        }),
    });
    const duration_ms = Date.now() - t0;

    if (!r.ok) {
        const errText = await r.text();
        return json({ error: 'OpenAI error', detail: errText, status: r.status }, 500);
    }

    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content || '{}';
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { return json({ error: 'Respuesta IA no es JSON', raw }, 500); }

    const variantes = Array.isArray(parsed?.variantes) ? parsed.variantes : [];
    if (!variantes.length) return json({ error: 'IA no devolvio variantes', raw }, 500);

    // Calculo de costo (gpt-4o-mini)
    const inTok = data?.usage?.prompt_tokens || 0;
    const outTok = data?.usage?.completion_tokens || 0;
    const cost_usd = (inTok / 1_000_000) * 0.15 + (outTok / 1_000_000) * 0.60;

    return json({
        ok: true,
        variantes,
        meta: { duration_ms, input_tokens: inTok, output_tokens: outTok, cost_usd },
    });
});

function json(body: any, status = 200) {
    return new Response(JSON.stringify(body, null, 2), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}
