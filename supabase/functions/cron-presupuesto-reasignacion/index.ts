// @ts-nocheck
// deno-lint-ignore-file
// ============================================================
// cron-presupuesto-reasignacion
// ============================================================
// Edge Function que corre semanalmente para reasignar dinamicamente
// el presupuesto entre suplidores subutilizados y sobreutilizados.
//
// Llama RPC `aplicar_reasignacion_dinamica`. El RPC:
//   - Recorre tenants con distribuir_por IN ('suplidor','mixto')
//   - Por cada uno encuentra asignaciones del mes con comprado < 50%
//   - Y suplidores con comprado > 90%
//   - Mueve hasta 30% del cap subutilizado al sobreutilizado
//   - Logea en presupuesto_reasignaciones
//
// SCHEDULE recomendado: "0 7 * * 1"  (cada lunes a las 07:00 UTC)
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

  if (req.method === "GET") {
    return new Response(JSON.stringify({
      ok: true,
      service: "cron-presupuesto-reasignacion",
      timestamp: new Date().toISOString(),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Permitir override del mes (backfill manual o testing)
  let p_mes: string | undefined;
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      const body = await req.json();
      p_mes = body?.mes;
    }
  } catch (_) { /* body opcional */ }

  try {
    const { data, error } = await supabase.rpc("aplicar_reasignacion_dinamica",
      p_mes ? { p_mes } : {}
    );
    if (error) {
      console.error("[cron-presupuesto-reasignacion] error RPC:", error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    console.log("[cron-presupuesto-reasignacion] OK:", JSON.stringify(data));
    return new Response(JSON.stringify({ ok: true, result: data }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("[cron-presupuesto-reasignacion] excepcion:", e);
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
