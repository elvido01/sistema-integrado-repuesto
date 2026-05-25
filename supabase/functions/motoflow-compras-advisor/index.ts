// ============================================================
// motoflow-compras-advisor — Asesor IA de compras (flujo de caja)
// ============================================================
// Analiza el plan de compra propuesto + presupuesto + CxP/CxC y
// recomienda qué priorizar para no ahogar la caja.
// NO ejecuta compras; solo asesora.
//
// POST /functions/v1/motoflow-compras-advisor
// Body: { presupuesto, financials, items: [...] }
// ============================================================

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { callLLM } from './llm.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `Eres el asesor financiero de compras de Repuestos Morla / MotoFlow, como un CFO práctico.
El negocio tiene tensión de caja (las cuentas por pagar pueden superar las ventas). Tu meta: que cada compra
priorice productos que devuelvan efectivo rápido (alta rotación + buen margen) sin ahogar la caja.

Reglas:
- Habla claro, español dominicano, directo y útil. Sin tecnicismos.
- Prioriza rotación rápida y margen; lo de baja rotación que espere.
- Si el plan se pasa del presupuesto, dilo y sugiere qué recortar o comprar en tandas.
- Si una sola línea se lleva gran parte del presupuesto, adviértelo.
- Si las cuentas por pagar están altas, recomienda comprar conservador y priorizar pagos clave.
- No inventes datos; usa solo lo que te paso.`;

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

    try {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        const authHeader = req.headers.get('Authorization') || '';
        if (!authHeader) return json({ ok: false, error: 'no_auth' }, 401);
        const token = authHeader.replace(/^Bearer\s+/i, '');
        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData?.user) return json({ ok: false, error: 'invalid_token' }, 401);
        const uid = userData.user.id;
        const { data: prof } = await supabase.from('profiles').select('role, tenant_id').eq('id', uid).maybeSingle();
        if (!prof?.tenant_id) return json({ ok: false, error: 'sin_tenant' }, 403);
        if (!['owner', 'admin'].includes(prof.role)) return json({ ok: false, error: 'forbidden' }, 403);
        const tenant_id = prof.tenant_id;

        const body = await req.json().catch(() => ({}));
        const presupuesto = Number(body?.presupuesto || 0);
        const financials = body?.financials || {};
        const items = Array.isArray(body?.items) ? body.items.slice(0, 40) : [];

        const totalRecomendado = items.reduce((s: number, it: any) => s + Number(it.costo_recomendado || 0), 0);
        const totalIdeal = items.reduce((s: number, it: any) => s + Number(it.costo_ideal || 0), 0);

        const llm = await callLLM({
            system: SYSTEM_PROMPT, json: true, user_tag: tenant_id, max_tokens: 1100, temperature: 0.4,
            user: `Analiza este plan de compra y responde SOLO JSON:
{
 "resumen": "<2-3 frases sobre si la compra es sana para la caja>",
 "riesgos": ["<riesgo 1>", "..."],
 "recomendaciones": ["<accion concreta 1>", "..."],
 "prioridad_pago": "<consejo corto sobre pagos a suplidores>",
 "confianza": "alta|media|baja"
}
PRESUPUESTO disponible: RD$${presupuesto.toFixed(2)}
Total plan IDEAL (por demanda): RD$${totalIdeal.toFixed(2)}
Total plan RECOMENDADO (ajustado a caja): RD$${totalRecomendado.toFixed(2)}
Finanzas: ${JSON.stringify(financials)}
Productos (top): ${JSON.stringify(items.map((it: any) => ({
                codigo: it.codigo, desc: it.descripcion, ideal: it.cantidad_ideal,
                recomendada: it.cantidad_recomendada, costo_unit: it.costo,
                margen_pct: it.margen_pct, rotacion_90d: it.ventas_90d, existencia: it.existencia,
            })))}`,
        });

        let parsed: any = {};
        try { parsed = JSON.parse(llm.content); } catch { parsed = {}; }

        await supabase.from('ai_agent_runs').insert({
            tenant_id, user_id: uid, agent_key: 'ai_compras_advisor', agent_name: 'ai_compras_advisor',
            run_type: 'advisor', credits_used: 1, provider: llm.provider, model: llm.model,
            input_tokens: llm.input_tokens, output_tokens: llm.output_tokens,
            cost_usd: llm.cost_usd, status: 'completed', duration_ms: llm.duration_ms,
            metadata: { items: items.length, presupuesto },
        });

        return json({ ok: true, analisis: parsed, cost_usd: llm.cost_usd });
    } catch (err: any) {
        console.error('[motoflow-compras-advisor]', err);
        return json({ ok: false, error: 'unexpected', mensaje: err.message }, 500);
    }
});

function json(body: any, status = 200) {
    return new Response(JSON.stringify(body), {
        status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}
