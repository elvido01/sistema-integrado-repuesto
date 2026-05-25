// llm.ts — wrapper de texto (gpt-4o-mini) para el asesor de compras
export async function callLLM(opts: {
    system: string; user: string; user_tag?: string;
    model?: string; max_tokens?: number; temperature?: number; json?: boolean;
}) {
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY no está configurada en Supabase secrets');
    const model = opts.model || 'gpt-4o-mini';
    const body: Record<string, unknown> = {
        model,
        messages: [
            { role: 'system', content: opts.system },
            { role: 'user', content: opts.user },
        ],
        max_tokens: opts.max_tokens ?? 1100,
        temperature: opts.temperature ?? 0.4,
    };
    if (opts.user_tag) body.user = `motoflow:${opts.user_tag}`;
    if (opts.json) body.response_format = { type: 'json_object' };

    const start = Date.now();
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 500)}`);
    const data = await r.json();
    const inTok = data.usage?.prompt_tokens || 0;
    const outTok = data.usage?.completion_tokens || 0;
    return {
        content: data.choices?.[0]?.message?.content || '',
        provider: 'openai', model,
        input_tokens: inTok, output_tokens: outTok,
        cost_usd: Number(((inTok / 1e6) * 0.15 + (outTok / 1e6) * 0.60).toFixed(5)),
        duration_ms: Date.now() - start,
    };
}
