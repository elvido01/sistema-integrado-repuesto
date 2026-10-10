import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";

  if (!q.trim()) {
    return new Response(
      JSON.stringify({ error: "Falta el parámetro q" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data, error } = await supabase.rpc("buscar_productos_cotizacion_morla", {
    busqueda: q,
  });

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return new Response(
    JSON.stringify({
      query: q,
      matches: data ?? [],
    }),
    {
      headers: { "Content-Type": "application/json" },
    }
  );
});