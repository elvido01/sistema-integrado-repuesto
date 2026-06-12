// @ts-nocheck
// deno-lint-ignore-file
// ============================================================
// cron-recalcular-preferidos
// ============================================================
// Edge function que recalcula los preferidos (⭐) de todos los grupos
// de equivalentes de TODOS los tenants. Schedule recomendado:
//   "0 6 * * 1"  (lunes a las 06:00 UTC)
//
// Algoritmo (Weighted Score multi-criterio):
//   Score = 0.45 × Margen_pct
//         + 0.30 × Rotacion (ventas_30d / (stock+1) × 10)
//         + 0.15 × Confiabilidad (% dias con stock 90d)
//         + 0.10 × Vol relativo (% del grupo que se llevo el SKU)
//
//   Penalty: -50 si confiabilidad < 10%
//   Estabilidad: solo cambia preferido si diff >= 5 puntos
//   Manual: respeta prioridad_manual=true (no toca esos grupos)
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
      service: "cron-recalcular-preferidos",
      timestamp: new Date().toISOString(),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  try {
    const { data, error } = await supabase.rpc("cron_recalcular_preferidos_all_tenants");
    if (error) {
      console.error("[cron-recalcular-preferidos] error RPC:", error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    console.log("[cron-recalcular-preferidos] OK:", JSON.stringify(data));
    return new Response(JSON.stringify({ ok: true, result: data }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("[cron-recalcular-preferidos] excepcion:", e);
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
