// ============================================================
// hermes-sugerir — Le propone al vendedor qué contestar
// ------------------------------------------------------------
// NO envía nada. Redacta una respuesta y se la deja al vendedor, que la
// manda con un clic, la corrige o la ignora. Esa decisión suya es la señal
// de aprendizaje: se guarda al lado de lo que él escribió de verdad.
//
// El QUÉ sale del inventario (precio y existencia reales, que vienen del
// RPC); el CÓMO sale de unos pocos ejemplos de cómo contesta la casa. Esta
// función solo junta las dos cosas y redacta.
//
// Body: { conversation_id }
// ============================================================

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const MODELO = 'gpt-4o-mini';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

  const token = req.headers.get('Authorization')?.replace('Bearer ', '').trim();
  if (!token) return json({ ok: false, error: 'Falta el token de sesion' }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { return json({ ok: false, error: 'json_invalido' }, 400); }
  const conversationId = String(body?.conversation_id || '').trim();
  if (!conversationId) return json({ ok: false, error: 'conversation_id_requerido' }, 400);

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return json({ ok: false, error: 'Falta OPENAI_API_KEY' }, 500);

  // Se usa el token DEL USUARIO, no el service_role: asi el RPC resuelve su
  // empresa con get_user_tenant() y no hay forma de leer la conversacion de
  // otro tenant aunque manden un id ajeno.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const { data: ctx, error } = await supabase.rpc('hermes_contexto_sugerencia', {
      p_conversation_id: conversationId,
    });
    if (error) return json({ ok: false, error: error.message }, 400);
    if (!ctx?.ok) return json({ ok: false, error: ctx?.motivo || 'Sin contexto' }, 400);

    const sugerencia = await redactar(ctx, apiKey);
    if (!sugerencia) return json({ ok: false, error: 'La IA no devolvio texto' }, 502);

    await supabase.rpc('hermes_guardar_sugerencia', {
      p_message_id: ctx.message_id,
      p_sugerencia: sugerencia,
      p_datos: { productos: ctx.productos, busqueda: ctx.busqueda, modelo: MODELO },
    });

    return json({
      ok: true,
      sugerencia,
      message_id: ctx.message_id,
      pregunta: ctx.pregunta,
      productos: ctx.productos,
    });
  } catch (e) {
    console.error('[hermes-sugerir]', e?.message || e);
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});

async function redactar(ctx: any, apiKey: string) {
  const productos = Array.isArray(ctx.productos) ? ctx.productos : [];

  const listaPiezas = productos.length
    ? productos.map((p: any) =>
        `- ${p.descripcion} (código ${p.codigo || 's/c'}) · RD$ ${Number(p.precio).toLocaleString('es-DO')} · ${
          Number(p.existencia) > 0 ? `${p.existencia} en existencia` : 'SIN EXISTENCIA'}`).join('\n')
    : '(no se encontró ninguna pieza que coincida con lo que preguntó)';

  const ejemplos = (Array.isArray(ctx.ejemplos) ? ctx.ejemplos : [])
    .map((e: any) => `Cliente: ${e.pregunta}\nVendedor: ${e.respuesta}`).join('\n\n');

  const historial = (Array.isArray(ctx.historial) ? ctx.historial : [])
    .map((h: any) => `${h.quien === 'cliente' ? 'Cliente' : 'Nosotros'}: ${h.texto}`).join('\n');

  const sistema = [
    `Eres el vendedor de ${ctx.empresa || 'la tienda'}, una tienda de repuestos de motocicletas en República Dominicana.`,
    `Le contestas a un cliente por ${ctx.canal || 'WhatsApp'}.`,
    '',
    'REGLAS, en orden de importancia:',
    '1. NO inventes precios, existencias ni piezas. Usa SOLO la lista de abajo.',
    '2. Si la lista viene vacía o ninguna pieza encaja, di que vas a verificar y',
    '   pide el dato que falta (modelo y año de la motocicleta). NUNCA inventes.',
    '3. Si la pieza está SIN EXISTENCIA, dilo claro; no la ofrezcas como disponible.',
    '4. Escribe como los ejemplos: corto, directo, dominicano, sin formalidad de',
    '   robot. Nada de "Estimado cliente" ni "quedo a sus órdenes".',
    '5. Dos o tres líneas como máximo. Si hay varias piezas parecidas, pregunta',
    '   cuál necesita en vez de listarlas todas.',
    '6. Los precios en pesos, con coma de miles: RD$ 1,400.',
  ].join('\n');

  const usuario = [
    ejemplos ? `ASÍ CONTESTA LA CASA (copia el tono, no el contenido):\n\n${ejemplos}\n` : '',
    historial ? `CONVERSACIÓN HASTA AHORA:\n${historial}\n` : '',
    `PIEZAS EN EL SISTEMA QUE PODRÍAN SER LO QUE PIDE:\n${listaPiezas}\n`,
    `LA PREGUNTA A CONTESTAR:\n${ctx.pregunta}\n`,
    'Escribe SOLO el mensaje que le enviarías al cliente. Sin explicaciones ni comillas.',
  ].filter(Boolean).join('\n');

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODELO,
      messages: [
        { role: 'system', content: sistema },
        { role: 'user', content: usuario },
      ],
      temperature: 0.3,   // bajo: inventar precios seria peor que sonar sosa
      max_tokens: 220,
    }),
  });

  if (!r.ok) {
    const detalle = await r.text().catch(() => '');
    throw new Error(`OpenAI ${r.status}: ${detalle.slice(0, 200)}`);
  }
  const data = await r.json();
  return String(data?.choices?.[0]?.message?.content || '').trim();
}
