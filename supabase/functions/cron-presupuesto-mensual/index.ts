// @ts-nocheck
// deno-lint-ignore-file
// ============================================================
// cron-presupuesto-mensual
// ============================================================
// Edge Function que se invoca el dia 1 de cada mes via Supabase Cron
// (pg_cron interno o cron externo).
//
// Llama al RPC `aplicar_ajuste_mensual()` que recorre todos los
// tenants con presupuesto_config y aplica:
//   - incremento normal segun incremento_mensual_pct
//   - congelamiento si CxP/ventas_30d > 1.5
//   - reduccion 20% si CxP/ventas_30d > 1.0
//
// Persiste en presupuesto_historico (idempotente por tenant+mes).
//
// SCHEDULE recomendado: "0 6 1 * *"  (1ro de cada mes a las 06:00 UTC)
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Healthcheck — util para verificar que el cron esta desplegado
  if (req.method === "GET") {
    return new Response(JSON.stringify({
      ok: true,
      service: "cron-presupuesto-mensual",
      timestamp: new Date().toISOString(),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Permitir override del mes via body para backfill manual
  let p_mes: string | undefined;
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      const body = await req.json();
      p_mes = body?.mes;  // formato YYYY-MM-01
    }
  } catch (_) { /* body opcional */ }

  try {
    const { data, error } = await supabase.rpc("aplicar_ajuste_mensual",
      p_mes ? { p_mes } : {}
    );
    if (error) {
      console.error("[cron-presupuesto-mensual] error RPC:", error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    console.log("[cron-presupuesto-mensual] OK:", JSON.stringify(data));
    return new Response(JSON.stringify({ ok: true, result: data }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("[cron-presupuesto-mensual] excepcion:", e);
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
