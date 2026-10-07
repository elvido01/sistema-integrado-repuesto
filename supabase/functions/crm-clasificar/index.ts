// ============================================================
// crm-clasificar — El embudo del CRM se mueve solo
// ------------------------------------------------------------
// (07/10/2026) Un modelo barato (gpt-4o-mini, ~US$0.0003 por conversacion)
// lee las conversaciones con mensajes nuevos y decide: que pide el cliente,
// que tan cerca esta de comprar, en que etapa del embudo va y que hacer
// despues. No contesta a nadie: solo clasifica.
//
// La cola y las reglas (no retroceder, respetar lo que movio una persona,
// avisar al dueño) viven en SQL: crm_clasificar_pendientes y
// crm_guardar_clasificacion (sql/crm_clasificador_embudo.sql).
//
// La llama el cron cada 10 min. Body opcional: { limite, dias }.
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
  new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const ETAPAS = ['nuevo', 'interesado', 'cotizado', 'listo_para_comprar', 'ganado', 'perdido', 'spam'];
const CATEGORIAS = ['precio', 'disponibilidad', 'compatibilidad', 'envio', 'pago', 'reclamo', 'saludo', 'spam', 'otro'];

const INSTRUCCIONES = `Eres el clasificador del CRM de una tienda de repuestos de motocicletas en República Dominicana.
Lees una conversación (cliente ↔ tienda) por WhatsApp, Instagram, TikTok o Facebook y la clasificas. No respondes al cliente.

Etapas del embudo:
- nuevo: SOLO saludó o escribió algo sin mencionar ninguna pieza ni pedir nada concreto.
- interesado: mencionó o preguntó por una pieza, su precio, si hay, si le sirve a su moto, envío. Si nombró una pieza, como mínimo es interesado. También si la tienda quedó en conseguirla o en avisarle cuando llegue.
- cotizado: la TIENDA ya le dio precio o cotización y el cliente no ha confirmado.
- listo_para_comprar: el cliente confirmó que lo quiere ("me lo separa", "guárdamelo", "voy para allá", "ya estoy aquí", "mándamelo", "cómo pago", "a qué cuenta", pide dirección para ir a buscarlo).
- ganado: el cliente ya pagó, transfirió, lo recibió o dice que lo compró.
- perdido: dijo que no, que está caro y no sigue, que ya lo consiguió en otro lado. TAMBIÉN cuando la tienda respondió que NO lo tiene ("no lo tengo", "no líder", "no hay") sin ofrecer alternativa ni quedar en conseguirlo: en ese caso motivo_etapa empieza con "No lo tenemos:" y di la pieza.
  Ojo: si después de eso el cliente pide OTRA pieza, la etapa la decide la conversación más reciente.
- spam: publicidad, cadenas, bots, mensajes que no son de un cliente.

Categoría = lo principal que el cliente quiere AHORA: precio, disponibilidad, compatibilidad, envio, pago, reclamo (garantía, pieza mala, devolución, queja), saludo, spam, otro.
intencion_compra: 0 a 100, qué tan probable es que compre pronto.
urgente: true solo si el cliente espera respuesta y lleva rato sin ella, o es un reclamo.
"[audio]" o "[image]" significa que mandó un audio o una foto que no puedes ver: no inventes su contenido.
Resumen y siguiente_paso: en español dominicano, cortos (máx 120 caracteres), concretos, para el vendedor.`;

const ESQUEMA = {
  name: 'clasificacion_crm',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['etapa', 'motivo_etapa', 'categoria', 'intencion_compra', 'urgente', 'producto', 'moto', 'resumen', 'siguiente_paso'],
    properties: {
      etapa: { type: 'string', enum: ETAPAS },
      motivo_etapa: { type: 'string' },
      categoria: { type: 'string', enum: CATEGORIAS },
      intencion_compra: { type: 'integer' },
      urgente: { type: 'boolean' },
      producto: { type: ['string', 'null'] },
      moto: { type: ['string', 'null'] },
      resumen: { type: 'string' },
      siguiente_paso: { type: 'string' },
    },
  },
};

async function clasificar(apiKey: string, conv: any) {
  const charla = (conv.mensajes || [])
    .map((m: any) => `[${m.cuando}] ${m.de === 'cliente' ? 'CLIENTE' : 'TIENDA'}: ${m.texto}`)
    .join('\n');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELO,
      temperature: 0,
      response_format: { type: 'json_schema', json_schema: ESQUEMA },
      messages: [
        { role: 'system', content: INSTRUCCIONES },
        { role: 'user', content: `Canal: ${conv.platform}. Etapa actual: ${conv.etapa}.\n\nConversación:\n${charla}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return { resultado: JSON.parse(data.choices[0].message.content), tokens: data.usage?.total_tokens ?? null };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return json({ ok: false, error: 'Falta OPENAI_API_KEY' }, 500);

  let body: any = {};
  try { body = await req.json(); } catch { /* el cron manda {} */ }
  const limite = Math.min(Number(body?.limite) || 25, 100);
  const dias = Math.min(Number(body?.dias) || 7, 60);

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: cola, error } = await supabase.rpc('crm_clasificar_pendientes', { p_limite: limite, p_dias: dias });
  if (error) return json({ ok: false, error: error.message }, 500);

  const hechos: any[] = [];
  for (const conv of cola || []) {
    try {
      if (!conv.mensajes?.length) continue;
      const { resultado, tokens } = await clasificar(apiKey, conv);
      const { data: r, error: e } = await supabase.rpc('crm_guardar_clasificacion', {
        p_conversation_id: conv.id, p_resultado: resultado, p_hasta: conv.last_user_message_at, p_tokens: tokens,
      });
      if (e) throw e;
      hechos.push({ id: conv.id, ...r, tokens });
    } catch (err) {
      console.error('[crm-clasificar]', conv.id, err?.message || err);
      hechos.push({ id: conv.id, ok: false, error: String(err?.message || err) });
    }
  }
  return json({ ok: true, revisadas: hechos.length, hechos });
});
