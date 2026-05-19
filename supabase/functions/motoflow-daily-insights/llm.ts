// ============================================================
// llm.ts — Wrapper provider-agnostic para LLMs
// ============================================================
// Hoy usa OpenAI. Mañana puedes cambiar a Claude sin tocar los
// agentes — solo modificas la implementación interna de callLLM.
//
// Convención de tagging: cada llamada lleva user="motoflow:<tenant_id>"
// para que en el dashboard de OpenAI puedas filtrar gasto por tenant
// y separar del uso de otras apps (Open WebUI, etc.) que comparten la
// misma API key.
// ============================================================

export type LlmProvider = 'openai' | 'claude';

export interface LlmCallOptions {
    system: string;
    user: string;
    /** json | text — fuerza output JSON parseable */
    response_format?: 'json' | 'text';
    /** Etiqueta para tracking en dashboard OpenAI/Claude (ej: tenant_id) */
    user_tag?: string;
    /** Provider — default: 'openai' */
    provider?: LlmProvider;
    /** Modelo específico. Si no se pasa, se usa el default del provider */
    model?: string;
    /** Tokens máximos de salida — default 1000 */
    max_tokens?: number;
    /** 0.0-1.0 — default 0.2 (más determinista para agentes) */
    temperature?: number;
}

export interface LlmCallResult {
    content: string;
    provider: LlmProvider;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    duration_ms: number;
}

// ────────────────────────────────────────────────
// Precios por modelo (USD por 1M de tokens)
// Actualizar si OpenAI/Anthropic cambian precios.
// ────────────────────────────────────────────────
const PRICES: Record<string, { input: number; output: number }> = {
    'gpt-4o-mini':           { input: 0.15,  output: 0.60 },
    'gpt-4o':                { input: 2.50,  output: 10.00 },
    'gpt-4.1-mini':          { input: 0.40,  output: 1.60 },
    'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
    'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
    'claude-opus-4-7':       { input: 15.00, output: 75.00 },
};

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
    const p = PRICES[model];
    if (!p) return 0;
    return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

// ────────────────────────────────────────────────
// OpenAI implementation
// ────────────────────────────────────────────────
async function callOpenAI(opts: LlmCallOptions): Promise<LlmCallResult> {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY no está configurada en Supabase secrets');

    const model = opts.model || 'gpt-4o-mini';
    const body: Record<string, unknown> = {
        model,
        messages: [
            { role: 'system', content: opts.system },
            { role: 'user', content: opts.user },
        ],
        max_tokens: opts.max_tokens ?? 1000,
        temperature: opts.temperature ?? 0.2,
    };
    if (opts.user_tag) body.user = `motoflow:${opts.user_tag}`;
    if (opts.response_format === 'json') body.response_format = { type: 'json_object' };

    const start = Date.now();
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    const duration_ms = Date.now() - start;

    if (!r.ok) {
        const errText = await r.text();
        throw new Error(`OpenAI ${r.status}: ${errText.slice(0, 500)}`);
    }
    const data = await r.json();
    const content = data.choices?.[0]?.message?.content || '';
    const inTokens = data.usage?.prompt_tokens || 0;
    const outTokens = data.usage?.completion_tokens || 0;
    return {
        content,
        provider: 'openai',
        model,
        input_tokens: inTokens,
        output_tokens: outTokens,
        cost_usd: Number(calcCost(model, inTokens, outTokens).toFixed(4)),
        duration_ms,
    };
}

// ────────────────────────────────────────────────
// Claude implementation (stub — implementar cuando se necesite)
// ────────────────────────────────────────────────
async function callClaude(opts: LlmCallOptions): Promise<LlmCallResult> {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurada — para usar Claude, agrégala como Supabase secret');

    const model = opts.model || 'claude-3-5-haiku-20241022';
    const body: Record<string, unknown> = {
        model,
        max_tokens: opts.max_tokens ?? 1000,
        system: opts.system,
        messages: [{ role: 'user', content: opts.user }],
        temperature: opts.temperature ?? 0.2,
    };
    if (opts.user_tag) body.metadata = { user_id: `motoflow:${opts.user_tag}` };

    const start = Date.now();
    const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    const duration_ms = Date.now() - start;

    if (!r.ok) {
        const errText = await r.text();
        throw new Error(`Claude ${r.status}: ${errText.slice(0, 500)}`);
    }
    const data = await r.json();
    const content = data.content?.[0]?.text || '';
    const inTokens = data.usage?.input_tokens || 0;
    const outTokens = data.usage?.output_tokens || 0;
    return {
        content,
        provider: 'claude',
        model,
        input_tokens: inTokens,
        output_tokens: outTokens,
        cost_usd: Number(calcCost(model, inTokens, outTokens).toFixed(4)),
        duration_ms,
    };
}

// ────────────────────────────────────────────────
// API pública
// ────────────────────────────────────────────────
export async function callLLM(opts: LlmCallOptions): Promise<LlmCallResult> {
    const provider = opts.provider || 'openai';
    if (provider === 'openai') return callOpenAI(opts);
    if (provider === 'claude') return callClaude(opts);
    throw new Error(`Provider desconocido: ${provider}`);
}
