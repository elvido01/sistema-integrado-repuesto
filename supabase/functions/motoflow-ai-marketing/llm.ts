// ============================================================
// llm.ts — Wrapper LLM + generación de imágenes para Marketing IA
// ============================================================
// Texto: gpt-4o-mini (barato). Imágenes: gpt-image-1 (opt-in).
// Comparte la misma OPENAI_API_KEY (clave aislada de la app).
// ============================================================

export interface LlmCallResult {
    content: string;
    provider: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    duration_ms: number;
}

const TEXT_PRICES: Record<string, { input: number; output: number }> = {
    'gpt-4o-mini': { input: 0.15, output: 0.60 }, // USD / 1M tokens
};

function calcTextCost(model: string, inTok: number, outTok: number): number {
    const p = TEXT_PRICES[model] || TEXT_PRICES['gpt-4o-mini'];
    return (inTok / 1_000_000) * p.input + (outTok / 1_000_000) * p.output;
}

export async function callLLM(opts: {
    system: string;
    user: string;
    user_tag?: string;
    model?: string;
    max_tokens?: number;
    temperature?: number;
    json?: boolean;
}): Promise<LlmCallResult> {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY no está configurada en Supabase secrets');

    const model = opts.model || 'gpt-4o-mini';
    const body: Record<string, unknown> = {
        model,
        messages: [
            { role: 'system', content: opts.system },
            { role: 'user', content: opts.user },
        ],
        max_tokens: opts.max_tokens ?? 1400,
        temperature: opts.temperature ?? 0.6,
    };
    if (opts.user_tag) body.user = `motoflow:${opts.user_tag}`;
    if (opts.json) body.response_format = { type: 'json_object' };

    const start = Date.now();
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const duration_ms = Date.now() - start;

    if (!r.ok) {
        const errText = await r.text();
        throw new Error(`OpenAI ${r.status}: ${errText.slice(0, 500)}`);
    }
    const data = await r.json();
    const content = data.choices?.[0]?.message?.content || '';
    const inTok = data.usage?.prompt_tokens || 0;
    const outTok = data.usage?.completion_tokens || 0;
    return {
        content,
        provider: 'openai',
        model,
        input_tokens: inTok,
        output_tokens: outTok,
        cost_usd: Number(calcTextCost(model, inTok, outTok).toFixed(5)),
        duration_ms,
    };
}

// ────────────────────────────────────────────────
// Generación de imágenes — devuelve base64
// ────────────────────────────────────────────────
// Es EL puente de la casa a la API de imágenes de OpenAI: la clave vive aquí,
// en los secretos de Supabase, y no en ningún otro sitio. El Marketing IA lo
// usa desde el principio; desde el 28/09/2026 también el Comercial-Creativo
// (función creativo-escena), que antes habría necesitado una segunda copia de
// la clave en el servidor.
//
// Sin `referencias` hace lo de siempre: imagen desde texto con gpt-image-1.
// Con `referencias` (la foto real del producto, por ejemplo) usa /edits: el
// modelo parte de esas imágenes en vez de inventarlas.
// (10/10/2026) Tope mensual de gasto en IMÁGENES, decisión del dueño: US$10
// al mes en OpenAI en total → US$8.50 para imágenes y el resto de margen para
// el texto (CRM, Jarvis, chat cuestan centavos). Toda la cuenta es UNA para
// todas las empresas, así que se suma todo. Se cambia con el secreto
// IA_TOPE_IMAGENES_USD. El mes es el de RD (UTC-4).
export async function presupuestoImagenes(sb: any): Promise<{ ok: boolean; gastado: number; tope: number }> {
    const tope = Number(Deno.env.get('IA_TOPE_IMAGENES_USD') || 8.5);
    const ahoraRD = new Date(Date.now() - 4 * 3600000);
    const inicioMes = new Date(Date.UTC(ahoraRD.getUTCFullYear(), ahoraRD.getUTCMonth(), 1, 4, 0, 0)).toISOString();
    const [a, b] = await Promise.all([
        sb.from('ai_agent_runs').select('cost_usd').like('model', 'gpt-image%').gte('created_at', inicioMes).limit(5000),
        sb.from('ai_marketing_content').select('cost_usd').gte('created_at', inicioMes).limit(5000),
    ]);
    const suma = (r: any) => (r?.data || []).reduce((s: number, x: any) => s + Number(x.cost_usd || 0), 0);
    const gastado = Math.round((suma(a) + suma(b)) * 100) / 100;
    // Si no se pudo leer el gasto, no se frena el trabajo (mejor una imagen de
    // más que una publicación perdida por un fallo de lectura).
    if (a?.error) return { ok: true, gastado, tope };
    return { ok: gastado < tope, gastado, tope };
}

export async function generateImage(opts: {
    prompt: string;
    size?: string;
    quality?: 'low' | 'medium' | 'high';
    model?: string;
    referencias?: { bytes: Uint8Array; mime: string; nombre: string }[];
}): Promise<{ b64: string; cost_usd: number; model: string; exacto: boolean }> {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY no está configurada en Supabase secrets');

    const size = opts.size || '1024x1024';
    const quality = opts.quality || 'medium';
    const model = opts.model || 'gpt-image-1';
    const refs = opts.referencias || [];

    let r: Response;
    if (refs.length) {
        const form = new FormData();
        form.append('model', model);
        form.append('prompt', opts.prompt);
        form.append('size', size);
        form.append('quality', quality);
        form.append('n', '1');
        form.append('output_format', 'png');
        for (const ref of refs) {
            form.append('image[]', new Blob([ref.bytes], { type: ref.mime }), ref.nombre);
        }
        r = await fetch('https://api.openai.com/v1/images/edits', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: form,
        });
    } else {
        r = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt: opts.prompt, size, quality, n: 1 }),
        });
    }

    if (!r.ok) {
        const errText = await r.text();
        throw new Error(`OpenAI image ${r.status}: ${errText.slice(0, 400)}`);
    }
    const data = await r.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('La IA no devolvió ninguna imagen');

    // El costo, por los tokens que devuelve OpenAI cuando los devuelve
    // (gpt-image-2: US$8/M de imagen de entrada, US$5/M de texto, US$30/M de
    // salida). Si no los devuelve, una estimación por calidad y tamaño.
    const u = data.usage;
    if (u && Number.isFinite(u.output_tokens)) {
        const imgIn = Number(u.input_tokens_details?.image_tokens || 0);
        const txtIn = Number(u.input_tokens_details?.text_tokens ?? Math.max(0, (u.input_tokens || 0) - imgIn));
        const cost = imgIn * 8e-6 + txtIn * 5e-6 + Number(u.output_tokens) * 30e-6;
        return { b64, cost_usd: Math.round(cost * 10000) / 10000, model, exacto: true };
    }
    const [w, h] = String(size).split('x').map(Number);
    const escala = (w && h) ? (w * h) / (1024 * 1024) : 1;
    const base = model.startsWith('gpt-image-2')
        ? (quality === 'high' ? 0.211 : quality === 'low' ? 0.006 : 0.053)
        : (quality === 'high' ? 0.07 : quality === 'low' ? 0.015 : 0.04);
    return { b64, cost_usd: Math.round(base * escala * 10000) / 10000, model, exacto: false };
}
