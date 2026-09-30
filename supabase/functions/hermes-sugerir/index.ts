// ============================================================
// hermes-sugerir — Le propone al vendedor que contestar
// ------------------------------------------------------------
// NO envia nada. Redacta y se la deja al vendedor, que la manda con un
// clic, la corrige o la ignora. Esa decision suya se guarda al lado de lo
// que escribio de verdad: comparar las dos es la señal de aprendizaje.
//
// >>> AHORA CONSULTA, NO RECIBE TODO MASTICADO <<<
// Antes se le entregaba el resultado de UNA busqueda ya hecha. Ahora se le
// pasan las herramientas del MCP y el decide: buscar la pieza, mirar el
// codigo exacto, consultar la deuda del cliente.
//
// El detalle que hace que esto valga la pena: la lista de herramientas se
// PIDE al MCP en cada llamada (tools/list). No hay ni un nombre de
// herramienta escrito aqui. Agregar una al MCP la pone a disposicion de
// Hermes sin tocar este archivo — que era justo el punto de hacer el MCP.
//
// Body: { conversation_id }
// ============================================================

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { promoDeLaPregunta } from '../_shared/promoDeLaPregunta.mjs';

const MODELO = 'gpt-4o-mini';
const MAX_VUELTAS = 4;   // tope de idas y vueltas con las herramientas

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

  const baseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const mcpUrl = `${baseUrl}/functions/v1/motoflow-mcp`;

  // Token DEL USUARIO, no service_role: cada RPC resuelve su empresa con
  // get_user_tenant() y no hay forma de leer datos de otro tenant.
  const supabase = createClient(baseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: ctx, error } = await supabase.rpc('hermes_contexto_sugerencia', {
      p_conversation_id: conversationId,
    });
    if (error) return json({ ok: false, error: error.message }, 400);
    if (!ctx?.ok) return json({ ok: false, error: ctx?.motivo || 'Sin contexto' }, 400);

    // Lo publicado esta semana. Si falla, Hermes contesta igual, sin ofertas.
    const { data: promos } = await supabase.rpc('hermes_promociones_activas');
    ctx.promociones = Array.isArray(promos) ? promos : [];

    const { texto, usadas } = await redactar(ctx, apiKey, mcpUrl, token);
    if (!texto) return json({ ok: false, error: 'La IA no devolvio texto' }, 502);

    // Si pregunta por algo en promocion, la extension ofrece mandar el arte.
    const loQueDijo = [
      ctx.pregunta,
      ...(Array.isArray(ctx.historial) ? ctx.historial : []).filter((h: any) => h.quien === 'cliente').slice(-3).map((h: any) => h.texto),
    ].join(' ');
    const promo = promoDeLaPregunta({
      promos: ctx.promociones, texto: loQueDijo, piezas: usadas.flatMap((u: any) => u.piezas || []),
    });

    await supabase.rpc('hermes_guardar_sugerencia', {
      p_message_id: ctx.message_id,
      p_sugerencia: texto,
      p_datos: {
        herramientas_usadas: usadas, modelo: MODELO, via: 'mcp',
        // Queda escrito si miro la foto: sin esto no hay forma de saber
        // despues si verla mejoro la respuesta o solo encarecio la llamada.
        fotos_vistas: (ctx.fotos || []).length, hubo_foto: !!ctx.hubo_foto,
      },
    });

    return json({
      ok: true,
      sugerencia: texto,
      message_id: ctx.message_id,
      pregunta: ctx.pregunta,
      fotos: ctx.fotos || [],
      hubo_foto: !!ctx.hubo_foto,
      herramientas: usadas,
      // Lo que el modelo consulto de verdad, para pintarlo en la pantalla.
      productos: usadas.flatMap((u: any) => u.piezas || []),
      promo: promo ? { descripcion: promo.descripcion, precio: promo.precio, imagen_url: promo.imagen_url, codigo: promo.codigo } : null,
    });
  } catch (e) {
    console.error('[hermes-sugerir]', e?.message || e);
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});

// ── El MCP ──────────────────────────────────────────────────
async function mcp(url: string, token: string, method: string, params: any) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  const j = await r.json().catch(() => null);
  if (j?.error) throw new Error(`MCP ${method}: ${j.error.message}`);
  if (!j?.result) throw new Error(`MCP ${method}: HTTP ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  return j.result;
}

async function redactar(ctx: any, apiKey: string, mcpUrl: string, token: string) {
  // Las herramientas se DESCUBREN. Nada esta escrito a mano aqui: lo que el
  // MCP publique hoy es lo que Hermes sabe hacer hoy.
  const lista = await mcp(mcpUrl, token, 'tools/list', {});
  const herramientas = (lista?.tools || []).map((t: any) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));

  // Las fotos que el cliente mando y SI se pudieron guardar. Las que llegaron
  // antes de que el espejo supiera copiarlas no tienen archivo: de esas solo
  // se sabe que existieron (ctx.hubo_foto), y eso tambien hay que decirlo —
  // callarlo es lo que hacia que contestara a otra pregunta.
  const fotos = (Array.isArray(ctx.fotos) ? ctx.fotos : [])
    .filter((f: any) => typeof f?.url === 'string' && f.url.startsWith('http'));

  const ejemplos = (Array.isArray(ctx.ejemplos) ? ctx.ejemplos : [])
    .map((e: any) => `Cliente: ${e.pregunta}\nVendedor: ${e.respuesta}`).join('\n\n');
  const historial = (Array.isArray(ctx.historial) ? ctx.historial : [])
    .map((h: any) => `${h.quien === 'cliente' ? 'Cliente' : 'Nosotros'}: ${h.texto}`).join('\n');

  const sistema = [
    `Eres el vendedor de ${ctx.empresa || 'la tienda'}, una tienda de repuestos de motocicletas en Republica Dominicana.`,
    `Le contestas a un cliente por ${ctx.canal || 'WhatsApp'}.`,
    '',
    // (30/09/2026) Reescritas mirando las 12 sugerencias que el vendedor
    // corrigio: pedia el año de la moto (5 de 12), decia "no puedo verificar
    // los precios", mandaba al cliente a otra tienda, ofrecia piezas
    // agotadas y contaba cuantas quedaban. Ninguna de esas cosas la hace la
    // casa.
    'REGLAS, en orden de importancia:',
    '1. CONSULTA antes de afirmar. Tienes herramientas conectadas al sistema real:',
    '   usalas para precios, existencias y deudas. Nunca los inventes ni los',
    '   recuerdes de otra conversacion. Busca con palabras cortas (tipo de pieza +',
    '   modelo), y si no sale, prueba otra vez con menos palabras.',
    '2. NUNCA preguntes el año de la moto. Si de verdad no sabes para que moto es,',
    '   pregunta solo "¿de que moto es?". Si ya lo dijo, no lo vuelvas a preguntar.',
    '3. Si NO la tienes, dilo claro y ofrece conseguirla: "no la tengo ahora,',
    '   ¿quieres que te avise cuando llegue?" o "te la puedo conseguir con mi',
    '   suplidor". Nunca lo mandes a otra tienda ni a buscar en linea.',
    '4. Lo agotado (existencia 0) no se ofrece como opcion. Y nunca digas cuantas',
    '   unidades quedan: solo si hay o no hay.',
    '5. Nunca le digas al cliente que no puedes consultar, verificar o ver precios.',
    '   Si una herramienta falla, escribe "deja que te confirmo" y nada mas.',
    '6. Si hay varias parecidas, da las 2 o 3 mas probables con su precio, o',
    '   pregunta cual necesita. No pegues listas largas ni uses negritas (**).',
    '7. Escribe como los ejemplos: corto, directo, dominicano. Nada de "Estimado',
    '   cliente" ni "quedo a sus ordenes". Dos o tres lineas.',
    '8. Precios en pesos, con coma de miles: RD$ 1,400.',
    ...(Array.isArray(ctx.promociones) && ctx.promociones.length ? [
      '9. ESTA SEMANA ESTAN EN PROMOCION (el cliente probablemente vio el anuncio):',
      ...ctx.promociones.map((p: any) => `   - ${p.descripcion}${p.precio ? ` a RD$ ${Number(p.precio).toLocaleString('en-US')}` : ''}`),
      '   Si pregunta por una de estas, dale ESE precio y dile que esta en oferta.',
      '   ESTAN DISPONIBLES (la existencia se confirmo al publicarlas): nunca',
      '   digas que no tienes una pieza de esta lista.',
      '   No las menciones si pregunta por otra cosa.',
    ] : []),
    '10. Si la busqueda trae "piezas_en_la_vieja", esas estan en el ALMACEN VIEJO.',
    '   No estan en el mostrador y no se pueden facturar ahi: hay que traerlas.',
    '   Ofrecelas asi: "esa la tengo en el almacen viejo, deja que te la busco".',
    '   Nunca digas que no tienes una pieza si aparece en esa lista con existencia.',
    ...(fotos.length ? [
      '11. EL CLIENTE MANDO UNA FOTO y la estas viendo. Mirala y di QUE PIEZA es',
      '   antes de preguntar nada: para eso la mando, porque no sabe como se',
      '   llama. Buscala con las herramientas usando el nombre que le des TU,',
      '   no el que escribio el.',
      '   Si de la foto no se distingue, dilo asi: "en la foto no distingo bien",',
      '   y pide otra o el modelo. Nunca finjas que la viste.',
    ] : ctx.hubo_foto ? [
      '11. El cliente mando una FOTO que TU NO PUEDES VER. No la describas ni',
      '   adivines que trae. Dile que la viste llegar pero necesitas que te diga',
      '   que pieza es y de que moto.',
    ] : []),
  ].join('\n');

  // El texto va primero y la foto despues: con la imagen delante, el modelo
  // tiende a describirla en vez de contestar lo que se le pregunta.
  const encargo = [
    ejemplos ? `ASI CONTESTA LA CASA (copia el tono, no el contenido):\n\n${ejemplos}\n` : '',
    historial ? `CONVERSACION HASTA AHORA:\n${historial}\n` : '',
    `LA PREGUNTA A CONTESTAR:\n${ctx.pregunta}\n`,
    fotos.length
      ? `El cliente mando ${fotos.length === 1 ? 'esta foto' : 'estas fotos'}. Mirala${fotos.length === 1 ? '' : 's'} antes de contestar.\n`
      : '',
    'Consulta lo que necesites y escribe SOLO el mensaje que le enviarias al cliente.',
  ].filter(Boolean).join('\n');

  const mensajes: any[] = [
    { role: 'system', content: sistema },
    {
      role: 'user',
      content: fotos.length
        ? [
            { type: 'text', text: encargo },
            // detail 'low' a proposito: una pieza de moto se reconoce de sobra
            // a 512px y cuesta una fraccion. Esto se dispara decenas de veces
            // al dia, y el precio por foto decide si se puede dejar puesto.
            ...fotos.map((f: any) => ({
              type: 'image_url',
              image_url: { url: f.url, detail: 'low' },
            })),
          ]
        : encargo,
    },
  ];

  const usadas: any[] = [];

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODELO,
        messages: mensajes,
        tools: herramientas.length ? herramientas : undefined,
        // En la ultima vuelta se le corta el acceso a herramientas para
        // forzar una respuesta: sin esto podria quedarse consultando.
        tool_choice: vuelta === MAX_VUELTAS - 1 ? 'none' : 'auto',
        temperature: 0.3,   // bajo: inventar un precio seria peor que sonar sosa
        max_tokens: 400,
      }),
    });

    if (!r.ok) {
      const detalle = await r.text().catch(() => '');
      throw new Error(`OpenAI ${r.status}: ${detalle.slice(0, 200)}`);
    }

    const data = await r.json();
    const msg = data?.choices?.[0]?.message;
    if (!msg) throw new Error('OpenAI no devolvio mensaje');

    const llamadas = msg.tool_calls || [];
    if (!llamadas.length) {
      return { texto: String(msg.content || '').trim(), usadas };
    }

    mensajes.push(msg);

    for (const c of llamadas) {
      let resultado: string;
      try {
        const args = JSON.parse(c.function.arguments || '{}');
        const out = await mcp(mcpUrl, token, 'tools/call', { name: c.function.name, arguments: args });
        // (30/09/2026) Un fallo del MCP llegaba como texto ("Error consultando
        // MotoFlow: ...") o como respuesta sin result, y se guardaba igual que
        // una busqueda vacia: Hermes contestaba "deja que te confirmo" con la
        // pieza en el estante y nadie veia por que. Ahora el error queda escrito.
        resultado = out?.content?.[0]?.text || JSON.stringify({ error: 'El MCP no devolvio resultado', crudo: out ?? null });
        try {
          const parsed = JSON.parse(resultado);
          usadas.push({ herramienta: c.function.name, argumentos: args, ...parsed });
        } catch { usadas.push({ herramienta: c.function.name, argumentos: args, error: String(resultado).slice(0, 300) }); }
      } catch (e) {
        // El fallo se le DEVUELVE al modelo para que reaccione (pedir otro
        // dato, buscar distinto) en vez de romper la sugerencia entera.
        resultado = JSON.stringify({ error: String(e?.message || e) });
        usadas.push({ herramienta: c.function.name, argumentos: (() => { try { return JSON.parse(c.function.arguments || '{}'); } catch { return {}; } })(), error: String(e?.message || e).slice(0, 300) });
      }
      mensajes.push({ role: 'tool', tool_call_id: c.id, content: resultado });
    }
  }

  return { texto: '', usadas };
}
