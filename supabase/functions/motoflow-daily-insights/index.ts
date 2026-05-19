// ============================================================
// motoflow-daily-insights — Edge Function (Fase 2)
// ============================================================
// Pipeline multi-agente del equipo MORLA AI CEO:
//
// 1. Alertas SQL determinísticas (sin LLM) → ai_alerts
// 2. Snapshot diario de métricas → ai_metrics_snapshots
// 3. Sub-agentes IA en paralelo (CFO, Inventario, Crédito, Ventas)
// 4. AI CEO Principal sintetiza todo
// 5. Save sub-reportes + reporte CEO en ai_reports
// 6. Crea decisiones recomendadas en ai_decisions
//
// Soporta report_type: 'daily' | 'weekly' | 'monthly'
//
// Invocación:
//   POST /functions/v1/motoflow-daily-insights
//   Headers: Authorization Bearer + x-cron-secret
//   Body: { tenant_id?, force?, report_type? }
// ============================================================

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { runCFO, runInventario, runCredito, runVentas, runCompras, runMarketing, runEstrategia, runCEOPrincipal } from './agents.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const CEO_TEAM_KEY = 'ai_ceo_principal';

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
        const CRON_SECRET = Deno.env.get('DAILY_INSIGHTS_CRON_SECRET') || '';

        const authHeader = req.headers.get('Authorization') || '';
        const cronSecretHeader = req.headers.get('x-cron-secret') || '';
        const isServiceRole = authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
        const isCronSecret = CRON_SECRET && cronSecretHeader === CRON_SECRET;
        if (!isServiceRole && !isCronSecret) return json({ ok: false, error: 'unauthorized' }, 401);

        const body = await req.json().catch(() => ({}));
        const tenant_id_filter: string | null = body?.tenant_id || null;
        const force: boolean = !!body?.force;
        const report_type: string = body?.report_type || 'daily';

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        // Tenants a procesar
        let tenantQuery = supabase
            .from('tenant_credit_plan')
            .select('tenant_id, plan, agentes_habilitados, daily_credit_limit');
        if (tenant_id_filter) tenantQuery = tenantQuery.eq('tenant_id', tenant_id_filter);

        const { data: tenants, error: tErr } = await tenantQuery;
        if (tErr) throw new Error('tenants query: ' + tErr.message);
        if (!tenants || tenants.length === 0) {
            return json({ ok: true, mensaje: 'sin tenants', procesados: 0 });
        }

        const resultados: any[] = [];

        for (const t of tenants) {
            const tid = t.tenant_id;
            try {
                // Skip si ya hay reporte CEO para hoy y no force
                if (!force) {
                    const { data: existing } = await supabase
                        .from('ai_reports')
                        .select('id')
                        .eq('tenant_id', tid)
                        .eq('agent_key', CEO_TEAM_KEY)
                        .eq('report_type', report_type)
                        .eq('fecha', new Date().toISOString().slice(0, 10))
                        .maybeSingle();
                    if (existing) {
                        resultados.push({ tenant_id: tid, estado: 'skipped_existe', insight_id: existing.id });
                        continue;
                    }
                }

                // 1. Alertas determinísticas SQL
                let alertasResumen: any = null;
                try {
                    const { data: aRes } = await supabase.rpc('ai_run_deterministic_alerts', { p_tenant_id: tid });
                    alertasResumen = aRes;
                } catch (e) { console.warn(`[${tid}] alertas SQL falló:`, e); }

                // 2. Snapshot de métricas
                let snapshotResumen: any = null;
                try {
                    const { data: sRes } = await supabase.rpc('ai_capture_metrics_snapshot', {
                        p_tenant_id: tid,
                        p_snapshot_type: report_type === 'daily' ? 'daily' : (report_type === 'weekly' ? 'weekly' : 'monthly'),
                    });
                    snapshotResumen = sRes;
                } catch (e) { console.warn(`[${tid}] snapshot falló:`, e); }

                // 3. Sub-agentes en PARALELO (6 base + Estrategia solo si quarterly)
                const diasVentas = report_type === 'weekly' ? 7 : (report_type === 'monthly' ? 30 : 30);
                const startedSubs = Date.now();
                const agentPromises = [
                    runCFO(supabase, tid),
                    runInventario(supabase, tid),
                    runCredito(supabase, tid),
                    runVentas(supabase, tid, diasVentas),
                    runCompras(supabase, tid),
                    runMarketing(supabase, tid),
                ];
                if (report_type === 'quarterly') {
                    agentPromises.push(runEstrategia(supabase, tid));
                }
                const subReports = await Promise.all(agentPromises);
                const subDuration = Date.now() - startedSubs;

                // 4. AI CEO Principal sintetiza
                const ceoReport = await runCEOPrincipal(tid, subReports);

                // 5. Guardar todos los sub-reportes + reporte CEO
                const fecha = new Date().toISOString().slice(0, 10);
                const allReports = [...subReports, ceoReport];

                for (const r of allReports) {
                    const row = {
                        tenant_id: tid,
                        fecha,
                        agent_key: r.agent_key,
                        report_type,
                        titulo: String(r.parsed.titulo || r.agent_key).slice(0, 200),
                        resumen: r.parsed.resumen ? String(r.parsed.resumen).slice(0, 500) : null,
                        prioridad: ['alta','media','baja'].includes(r.parsed.prioridad) ? r.parsed.prioridad : 'media',
                        detalles: {
                            parsed: r.parsed,
                            raw_summary: r.raw ?? null,
                            alertas_sql: r.agent_key === CEO_TEAM_KEY ? alertasResumen : null,
                            snapshot: r.agent_key === CEO_TEAM_KEY ? snapshotResumen : null,
                        },
                        total_alertas: r.parsed.alertas?.length || r.parsed.hallazgos?.length || r.parsed.clientes_riesgo?.length || 0,
                        provider: r.llm?.provider || null,
                        model: r.llm?.model || null,
                        input_tokens: r.llm?.input_tokens || null,
                        output_tokens: r.llm?.output_tokens || null,
                        cost_usd: r.llm?.cost_usd || null,
                        duration_ms: r.llm?.duration_ms || null,
                        estado: 'nuevo',
                    };
                    await supabase.from('ai_reports').upsert(row, { onConflict: 'tenant_id,fecha,agent_key' });

                    // Log de uso
                    await supabase.from('ai_agent_runs').insert({
                        tenant_id: tid,
                        agent_key: r.agent_key,
                        agent_name: r.agent_key,
                        run_type: report_type,
                        credits_used: 1,
                        provider: r.llm?.provider,
                        model: r.llm?.model,
                        input_tokens: r.llm?.input_tokens,
                        output_tokens: r.llm?.output_tokens,
                        cost_usd: r.llm?.cost_usd,
                        status: 'completed',
                        duration_ms: r.llm?.duration_ms,
                        metadata: { source: 'daily_pipeline', report_type },
                    });
                }

                // 6. Crear decisiones recomendadas (solo desde CEO Principal para evitar duplicados)
                let decisionesCreadas = 0;
                const decisiones = ceoReport.parsed.decisiones_recomendadas || [];
                if (decisiones.length > 0) {
                    const decisionRows = decisiones.map((d: any) => ({
                        tenant_id: tid,
                        decision_type: 'recomendacion_ia',
                        area: d.area || 'general',
                        title: String(d.titulo || 'Decisión').slice(0, 200),
                        description: d.descripcion || null,
                        recommendation: d.descripcion || null,
                        expected_impact: d.expected_impact || null,
                        risk_level: ['low','medium','high'].includes(d.risk_level) ? d.risk_level : 'medium',
                        status: 'pending',
                        payload: d,
                    }));
                    const { data: insDec } = await supabase
                        .from('ai_decisions')
                        .insert(decisionRows)
                        .select('id');
                    decisionesCreadas = insDec?.length || 0;
                }

                const totalCost = allReports.reduce((s, r) => s + (r.llm?.cost_usd || 0), 0);

                resultados.push({
                    tenant_id: tid,
                    estado: 'ok',
                    report_type,
                    sub_agentes: subReports.length,
                    ceo_prioridad: ceoReport.parsed.prioridad,
                    ceo_titulo: ceoReport.parsed.titulo,
                    decisiones_creadas: decisionesCreadas,
                    alertas_sql: alertasResumen?.alertas_nuevas || 0,
                    snapshot_score: snapshotResumen?.score,
                    cost_usd: Number(totalCost.toFixed(4)),
                    duracion_subs_ms: subDuration,
                });
            } catch (errT: any) {
                console.error(`[daily-insights] tenant ${tid}:`, errT);
                resultados.push({ tenant_id: tid, estado: 'error', mensaje: errT.message });
            }
        }

        return json({ ok: true, procesados: tenants.length, resultados });
    } catch (err: any) {
        console.error('[motoflow-daily-insights]', err);
        return json({ ok: false, error: 'unexpected', mensaje: err.message }, 500);
    }
});

function json(body: any, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}
