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
// Generación de imágenes (gpt-image-1) — devuelve base64
// ────────────────────────────────────────────────
export async function generateImage(opts: {
    prompt: string;
    size?: '1024x1024' | '1024x1536' | '1536x1024';
    quality?: 'low' | 'medium' | 'high';
}): Promise<{ b64: string; cost_usd: number }> {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY no está configurada en Supabase secrets');

    const size = opts.size || '1024x1024';
    const quality = opts.quality || 'medium';

    const r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-image-1', prompt: opts.prompt, size, quality, n: 1 }),
    });

    if (!r.ok) {
        const errText = await r.text();
        throw new Error(`OpenAI image ${r.status}: ${errText.slice(0, 400)}`);
    }
    const data = await r.json();
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new Error('La IA no devolvió ninguna imagen');

    // Costo aproximado gpt-image-1 (medium 1024): ~$0.04. high: ~$0.07.
    const cost = quality === 'high' ? 0.07 : quality === 'low' ? 0.015 : 0.04;
    return { b64, cost_usd: cost };
}
