// ============================================================
// motoflow-agent — Edge Function
// ============================================================
// Entry point para todos los agentes IA de Motoflow.
//
// Flujo:
//   1. Auth: extrae JWT del header, valida con service_role
//   2. Lee profiles.tenant_id del usuario
//   3. Verifica créditos disponibles vía RPC check_agent_credits
//   4. Ejecuta el agente correspondiente
//   5. Loguea el uso en ai_agent_runs
//   6. Devuelve resultado al frontend
//
// Agentes registrados:
//   - 'cambio_suplidor' → ./agents/cambio_suplidor.ts
// ============================================================

// @ts-nocheck — Deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { ejecutarCambioSuplidor } from './agents/cambio_suplidor.ts';
import { ejecutarAnalisisPresupuesto } from './agents/analisis_presupuesto.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (req.method !== 'POST') {
        return json({ ok: false, error: 'Method not allowed' }, 405);
    }

    try {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        // 1. Auth — extraer y validar token
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) return json({ ok: false, error: 'no_auth' }, 401);
        const token = authHeader.replace('Bearer ', '');

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData?.user) {
            return json({
                ok: false,
                error: 'invalid_token',
                detalle: userErr?.message,
            }, 401);
        }
        const user = userData.user;

        // 2. Obtener tenant_id del profile
        const { data: profile, error: profErr } = await supabase
            .from('profiles')
            .select('tenant_id')
            .eq('id', user.id)
            .maybeSingle();
        if (profErr || !profile?.tenant_id) {
            return json({ ok: false, error: 'sin_tenant', detalle: profErr?.message }, 403);
        }
        const tenant_id = profile.tenant_id;

        // 3. Body
        const body = await req.json();
        const { agent_key, payload } = body || {};
        if (!agent_key) return json({ ok: false, error: 'agent_key requerido' }, 400);

        // 4. Verificar créditos (consultando directamente, no via RPC con SECURITY DEFINER)
        const { data: planRow } = await supabase
            .from('tenant_credit_plan')
            .select('plan, daily_credit_limit, agentes_habilitados')
            .eq('tenant_id', tenant_id)
            .maybeSingle();
        if (!planRow) {
            return json({ ok: false, error: 'sin_plan', mensaje: 'Tenant sin plan de agentes asignado' }, 402);
        }
        if (!planRow.agentes_habilitados.includes(agent_key)) {
            return json({
                ok: false,
                error: 'agente_no_habilitado',
                mensaje: `El agente "${agent_key}" no está incluido en tu plan ${planRow.plan}`,
                plan: planRow.plan,
            }, 402);
        }

        // Contar uso de hoy
        const hoyISO = new Date();
        hoyISO.setHours(0, 0, 0, 0);
        const { data: usoHoy } = await supabase
            .from('ai_agent_runs')
            .select('credits_used')
            .eq('tenant_id', tenant_id)
            .eq('agent_key', agent_key)
            .eq('status', 'completed')
            .gte('created_at', hoyISO.toISOString());
        const creditosUsadosHoy = (usoHoy || []).reduce((s, r) => s + (r.credits_used || 0), 0);

        if (creditosUsadosHoy >= planRow.daily_credit_limit) {
            return json({
                ok: false,
                error: 'limite_diario',
                mensaje: `Alcanzaste el límite diario (${planRow.daily_credit_limit} créditos)`,
                usado: creditosUsadosHoy,
                limite: planRow.daily_credit_limit,
            }, 402);
        }

        const creditosRestantesAntes = planRow.daily_credit_limit - creditosUsadosHoy;

        // 5. Ejecutar agente
        const startedAt = Date.now();
        let agentResult: any;
        let llmInfo: any = null;
        let agentError: Error | null = null;

        try {
            if (agent_key === 'cambio_suplidor') {
                const out = await ejecutarCambioSuplidor(supabase, tenant_id, payload || {});
                agentResult = out.result;
                llmInfo = out.llm;
            } else if (agent_key === 'analisis_presupuesto') {
                const out = await ejecutarAnalisisPresupuesto(supabase, tenant_id, payload || {});
                agentResult = out.result;
                llmInfo = out.llm;
            } else {
                return json({ ok: false, error: 'agente_no_implementado' }, 400);
            }
        } catch (err: any) {
            agentError = err;
            console.error(`[agent ${agent_key}] error:`, err);
        }

        const duration_ms = Date.now() - startedAt;

        // 6. Log de uso
        await supabase.from('ai_agent_runs').insert({
            tenant_id,
            user_id: user.id,
            agent_key,
            credits_used: agentError ? 0 : 1,
            provider: llmInfo?.provider || null,
            model: llmInfo?.model || null,
            input_tokens: llmInfo?.input_tokens || null,
            output_tokens: llmInfo?.output_tokens || null,
            cost_usd: llmInfo?.cost_usd || null,
            status: agentError ? 'failed' : 'completed',
            duration_ms,
            metadata: {
                payload,
                error: agentError?.message,
                ...(llmInfo?.skipped ? { llm_skipped: llmInfo.reason } : {}),
            },
        });

        if (agentError) {
            return json({
                ok: false,
                error: 'agent_failed',
                mensaje: agentError.message,
            }, 500);
        }

        return json({
            ok: true,
            agent_key,
            resultado: agentResult,
            creditos: {
                restante: creditosRestantesAntes - 1,
                limite: planRow.daily_credit_limit,
                plan: planRow.plan,
            },
            llm: llmInfo ? {
                provider: llmInfo.provider,
                model: llmInfo.model,
                input_tokens: llmInfo.input_tokens,
                output_tokens: llmInfo.output_tokens,
                cost_usd: llmInfo.cost_usd,
                duration_ms: llmInfo.duration_ms,
            } : null,
        });

    } catch (err: any) {
        console.error('[motoflow-agent] error:', err);
        return json({ ok: false, error: 'unexpected', mensaje: err.message }, 500);
    }
});

function json(body: any, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}
