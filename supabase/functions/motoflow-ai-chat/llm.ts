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
    /**
     * Conversación completa. Si se pasa, IGNORA system/user: hace falta para
     * los bucles de herramientas, donde hay que reenviar todo el hilo
     * (incluidos los resultados de cada llamada) en cada vuelta.
     */
    messages?: any[];
    /** Herramientas en formato OpenAI. Sin esto, el modelo solo puede hablar. */
    tools?: any[];
    /** 'auto' | 'none' — 'none' obliga a contestar sin llamar nada más */
    tool_choice?: 'auto' | 'none';
}

export interface LlmCallResult {
    content: string;
    provider: LlmProvider;
    model: string;
    input_tokens: number;
    output_tokens: number;
    /** De los de entrada, cuántos venían de caché (mucho más baratos) */
    cached_tokens?: number;
    /** De los de salida, cuántos se fueron en razonar antes de contestar */
    reasoning_tokens?: number;
    cost_usd: number;
    duration_ms: number;
    /** Herramientas que el modelo pidió llamar (vacío si contestó directo) */
    tool_calls?: any[];
    /** El mensaje crudo, para reenviarlo en la siguiente vuelta del bucle */
    raw_message?: any;
}

// ────────────────────────────────────────────────
// Precios por modelo (USD por 1M de tokens)
// Actualizar si OpenAI/Anthropic cambian precios.
// ────────────────────────────────────────────────
// 'cached' es lo que cuesta un token de entrada que el proveedor ya tenía
// guardado de una llamada anterior. Importa más de lo que parece: la persona,
// las reglas y las herramientas son idénticas en cada pregunta, así que casi
// toda la entrada es repetida. En gpt-5.6 la caché vale una décima parte de la
// entrada fresca — sin contarla, el medidor de costo miente hacia arriba.
const PRICES: Record<string, { input: number; output: number; cached?: number }> = {
    'gpt-4o-mini':           { input: 0.15,  output: 0.60,  cached: 0.075 },
    'gpt-4o':                { input: 2.50,  output: 10.00 },
    'gpt-4.1-mini':          { input: 0.40,  output: 1.60 },
    'gpt-5.6-luna':          { input: 0.20,  output: 1.20,  cached: 0.02 },
    'gpt-5.6-terra':         { input: 2.00,  output: 12.00, cached: 0.20 },
    'gpt-5.6-sol':           { input: 5.00,  output: 30.00, cached: 0.50 },
    'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
    'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
    'claude-opus-4-7':       { input: 15.00, output: 75.00 },
};

function calcCost(model: string, inputTokens: number, outputTokens: number, cachedTokens = 0): number {
    const p = PRICES[model];
    if (!p) return 0;
    // Los cacheados vienen DENTRO de inputTokens: se descuentan de ahí para no
    // cobrarlos dos veces, a precio pleno y a precio de caché.
    const frescos = Math.max(0, inputTokens - cachedTokens);
    return (frescos / 1_000_000) * p.input
         + (cachedTokens / 1_000_000) * (p.cached ?? p.input)
         + (outputTokens / 1_000_000) * p.output;
}

// ────────────────────────────────────────────────
// OpenAI implementation
// ────────────────────────────────────────────────
async function callOpenAI(opts: LlmCallOptions): Promise<LlmCallResult> {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY no está configurada en Supabase secrets');

    const model = opts.model || 'gpt-4o-mini';

    // La familia GPT-5.6 razona antes de contestar, y eso le cambia la forma a
    // la llamada: el presupuesto de salida va en max_completion_tokens (porque
    // los tokens de razonamiento también cuentan ahí) y la temperatura no se
    // acepta. Mandar los parámetros viejos devuelve 400 y no contesta nada.
    const razona = model.startsWith('gpt-5');

    const body: Record<string, unknown> = {
        model,
        // opts.messages gana cuando viene: en un bucle de herramientas hay que
        // reenviar el hilo entero, no solo system+user.
        messages: opts.messages ?? [
            { role: 'system', content: opts.system },
            { role: 'user', content: opts.user },
        ],
    };

    if (razona) {
        // Al presupuesto normal se le suma sitio para el razonamiento: si no
        // le alcanza, gasta todo pensando y devuelve la respuesta vacía.
        body.max_completion_tokens = (opts.max_tokens ?? 1000) * 3;
        // Configurable en caliente porque es la perilla que decide si Jarvis
        // contesta en un segundo o en ocho. Quien pregunta está en el mostrador
        // con un cliente delante: pensar de más también es un defecto.
        body.reasoning_effort = Deno.env.get('JARVIS_REASONING') ?? 'low';
    } else {
        body.max_tokens = opts.max_tokens ?? 1000;
        body.temperature = opts.temperature ?? 0.2;
    }
    if (opts.user_tag) body.user = `motoflow:${opts.user_tag}`;
    if (opts.response_format === 'json') body.response_format = { type: 'json_object' };
    if (opts.tools?.length) {
        body.tools = opts.tools;
        body.tool_choice = opts.tool_choice ?? 'auto';
    }

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
    const msg = data.choices?.[0]?.message;
    const content = msg?.content || '';
    const inTokens = data.usage?.prompt_tokens || 0;
    const outTokens = data.usage?.completion_tokens || 0;
    // Cuántos de los de entrada ya estaban en caché, y cuántos de la salida se
    // fueron en razonar. El segundo es el que decide si un modelo que razona
    // sale a cuenta: se cobran como salida, y en gpt-5.6 la salida vale el
    // doble. Cuatro decimales redondeaban US$0.0006 a cero.
    const cachedTokens = data.usage?.prompt_tokens_details?.cached_tokens || 0;
    const reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens || 0;
    return {
        content,
        provider: 'openai',
        model,
        input_tokens: inTokens,
        output_tokens: outTokens,
        cached_tokens: cachedTokens,
        reasoning_tokens: reasoningTokens,
        cost_usd: Number(calcCost(model, inTokens, outTokens, cachedTokens).toFixed(6)),
        duration_ms,
        tool_calls: msg?.tool_calls || [],
        raw_message: msg,
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
