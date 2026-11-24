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
//
// (22/11/2026) MODO SOMBRA: { conversation_id, hasta_message_id, sombra: true }
// Lo llama hermes-sombra con la sesión del usuario "Hermes" de la empresa,
// para CADA pregunta que entra por el espejo. Redacta viendo la conversación
// solo hasta esa pregunta (nunca lo que contestó la tienda) y lo guarda
// aparte (metadata.sombra), sin tocar la propuesta del botón ni su medida.
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
  const sombra = body?.sombra === true;
  const hastaMessageId = String(body?.hasta_message_id || '').trim() || null;
  if (sombra && !hastaMessageId) return json({ ok: false, error: 'hasta_message_id_requerido' }, 400);

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
      ...(hastaMessageId ? { p_hasta_message: hastaMessageId } : {}),
    });
    if (error) return json({ ok: false, error: error.message }, 400);
    if (!ctx?.ok) return json({ ok: false, error: ctx?.motivo || 'Sin contexto' }, 400);

    // Lo publicado esta semana. Si falla, Hermes contesta igual, sin ofertas.
    const { data: promos } = await supabase.rpc('hermes_promociones_activas');
    ctx.promociones = Array.isArray(promos) ? promos : [];

    // (23/10/2026) La dirección REAL: sin ella le dijo a un cliente "Avenida
    // Duarte esquina 27 de Febrero" (es esq. Baldemiro Rijo, Higüey).
    const { data: tienda } = await supabase.from('config_empresa')
      .select('nombre, direccion1, direccion, telefono').limit(1).maybeSingle();
    ctx.tienda = tienda || null;

    // (24/11/2026) Reglas aprobadas por el dueño (hermes_lecciones, RLS por
    // empresa). Si falla la lectura, Hermes contesta igual sin ellas.
    const { data: lecc } = await supabase.from('hermes_lecciones')
      .select('texto').eq('estado', 'aprobada')
      .order('veces', { ascending: false }).order('creado_en', { ascending: true }).limit(25);
    ctx.lecciones = (lecc || []).map((l: any) => String(l.texto || '').trim()).filter(Boolean);

    // (23/10/2026) Lo que el dueño CAMBIÓ de las sugerencias: el mejor
    // maestro que hay. Antes → después, las 8 más recientes.
    const { data: corr } = await supabase.from('sales_ai_training_logs')
      .select('conversation_id, customer_message, bot_reply, human_reply, created_at')
      .eq('outcome', 'editada').not('human_reply', 'is', null)
      .order('created_at', { ascending: false }).limit(12);
    // (22/11/2026) Y las de la SOMBRA donde el juez dijo que la tienda
    // contestó mejor: lo que Hermes habría dicho → lo que se dijo de verdad.
    const { data: corrSombra } = await supabase.from('sales_ai_training_logs')
      .select('conversation_id, customer_message, bot_reply:metadata->sombra->>texto, human_reply, created_at')
      .eq('metadata->evaluacion->>quien_mejor', 'humano').not('human_reply', 'is', null)
      .order('created_at', { ascending: false }).limit(12);
    ctx.correcciones = [...(corr || []), ...(corrSombra || [])]
      // En sombra, nunca la conversación que se está contestando: sería ver la respuesta.
      .filter((c: any) => !sombra || c.conversation_id !== conversationId)
      .filter((c: any) => c.human_reply && c.bot_reply && c.human_reply.trim() !== c.bot_reply.trim()
        && c.human_reply.length > 8 && !/solicitud de env[ií]o de mensajes/i.test(c.human_reply))
      .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 8)
      .map(({ customer_message, bot_reply, human_reply }: any) => ({ customer_message, bot_reply, human_reply }));

    const { texto, usadas, modelo } = await redactar(ctx, apiKey, mcpUrl, token);
    if (!texto) return json({ ok: false, error: 'La IA no devolvio texto' }, 502);
    if (/^\s*NO_RESPONDER\s*$/i.test(texto)) {
      if (sombra) {
        await supabase.rpc('hermes_guardar_sombra', {
          p_message_id: ctx.message_id, p_texto: null, p_datos: { no_responder: true, modelo },
        });
        return json({ ok: true, sombra: true, no_responder: true });
      }
      return json({ ok: false, no_responder: true, error: 'Ese mensaje no parece de un cliente (cadena, enlace o publicidad): no hace falta contestarlo.' }, 200);
    }

    // Si pregunta por algo en promocion, la extension ofrece mandar el arte.
    const loQueDijo = [
      ctx.pregunta,
      ...(Array.isArray(ctx.historial) ? ctx.historial : []).filter((h: any) => h.quien === 'cliente').slice(-3).map((h: any) => h.texto),
    ].join(' ');
    const promo = promoDeLaPregunta({
      promos: ctx.promociones, texto: loQueDijo, piezas: usadas.flatMap((u: any) => u.piezas || []),
    });

    if (sombra) {
      const piezas = usadas.flatMap((u: any) => u.piezas || []).slice(0, 8);
      const { data: g, error: eg } = await supabase.rpc('hermes_guardar_sombra', {
        p_message_id: ctx.message_id, p_texto: texto,
        p_datos: { modelo, herramientas: usadas.map((u: any) => u.herramienta).filter(Boolean),
                   piezas, fotos_vistas: (ctx.fotos || []).length, hubo_foto: !!ctx.hubo_foto },
      });
      if (eg || !g?.guardado) return json({ ok: false, error: eg?.message || 'No se guardó la sombra' }, 500);
      return json({ ok: true, sombra: true, message_id: ctx.message_id });
    }

    await supabase.rpc('hermes_guardar_sugerencia', {
      p_message_id: ctx.message_id,
      p_sugerencia: texto,
      p_datos: {
        herramientas_usadas: usadas, modelo, via: 'mcp',
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
    // (24/11/2026) Herramienta piezas_por_moto (catalogo por modelo).
    '   Si el cliente no sabe el nombre de la pieza, pide una CATEGORIA ("plasticos",',
    '   "lo electrico", "frenos") o buscar_piezas no encuentra nada para su moto, usa',
    '   piezas_por_moto: primero sin tipo para ver que hay, despues con el tipo.',
    '2. NUNCA preguntes el año de la moto. Si de verdad no sabes para que moto es,',
    '   pregunta solo "¿de que moto es?". Si ya lo dijo, no lo vuelvas a preguntar.',
    '3. Si NO la tienes, dilo claro y ofrece conseguirla: "no la tengo ahora,',
    '   ¿quieres que te avise cuando llegue?" o "te la puedo conseguir con mi',
    '   suplidor". Nunca lo mandes a otra tienda ni a buscar en linea.',
    '4. Lo agotado (existencia 0) no se ofrece como opcion. Y nunca digas cuantas',
    '   unidades quedan: solo si hay o no hay.',
    // (24/11/2026) Goma Michelin 18 agotada: el cliente insistio "digame el
    // precio para saber mas o menos", la tienda le dio 3,750 y Hermes solo
    // repitio "no tengo 18". Pedir el precio de lo agotado es valido.
    '   PERO si el cliente PIDE el precio de algo agotado ("para saber mas o menos",',
    '   "aunque no haya"), BUSCALO y dale el precio, aclarando que ahora no hay y',
    '   ofreciendo conseguirlo: "esa sale en 3,750, pero ahora no la tengo; ¿te la',
    '   consigo?". Nunca contestes solo "no la tengo" a una pregunta de precio.',
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
    // (23/10/2026) El dueño borraba "almacen viejo" en TODAS las que lo
    // traían: al cliente no se le cuenta dónde está guardada la pieza.
    '10. Si la busqueda trae "piezas_en_la_vieja" con existencia, la pieza la TIENES:',
    '   ofrecela como cualquier otra, con su precio. NUNCA digas "almacen", "mostrador",',
    '   "sistema", "inventario" ni donde esta guardada.',
    '12. Habla por la casa en plural: "¿en que te podemos ayudar?".',
    '13. Si no la tienes: "no la tengo ahora, pero la puedo conseguir con mi suplidor".',
    '   Nada de "piezas relacionadas" ni ofrecer otra cosa que no pidio.',
    '14. Plasticos, carroceria, colores o calcomanias: hay muchas variantes. Pide que te',
    '   mande una FOTO de la pieza que necesita y el color, antes de ofrecer nada.',
    '15. Ubicacion, telefono y envios: usa SOLO los DATOS DE LA TIENDA de abajo. Nunca',
    '   inventes una direccion. Envio: "si enviamos, dime a donde y te digo el costo".',
    '16. Precios SIN centavos: RD$ 241, no RD$ 241,23.',
    '17. Si el mensaje NO es de un cliente (cadena, noticia, publicidad, enlace suelto,',
    '   mensaje personal o del sistema), escribe solo: NO_RESPONDER',
    // (12/11/2026) Las 3 preguntas del buen vendedor: qué busca, para cuándo
    // y cuánto. "Qué" ya se sabe; el "para cuándo" casi nadie lo dice y es lo
    // que separa al que compra hoy del que averigua (el clasificador lo lee).
    '18. Si en tu respuesta le das precio o le dices que SI la tienes, y en la conversacion',
    '   el cliente todavia no ha dicho para cuando la necesita, termina con UNA pregunta',
    '   corta: "¿para cuando la necesitas?". Una sola vez por conversacion: si ya se le',
    '   pregunto o ya dijo que viene, que la quiere hoy o que la separen, no la hagas.',
    '   Si hay original y economica, puedes preguntar "¿la quieres original o de las',
    '   economicas?" en vez de dar todas las opciones.',
    ...(ctx.tienda ? [
      '',
      `DATOS DE LA TIENDA: ${[ctx.tienda.nombre, ctx.tienda.direccion1 || ctx.tienda.direccion, ctx.tienda.telefono ? `tel. ${ctx.tienda.telefono}` : null].filter(Boolean).join(' · ')}.`,
    ] : []),
    // (24/11/2026) Lo que el dueño aprobó en "Lo que aprende Hermes" (Sales
    // Hub): lecciones del juez del modo sombra o reglas que escribió él.
    // Mandan sobre los ejemplos; las reglas 1, 4 y 5 (no inventar precios ni
    // existencias) siguen por encima de todo.
    ...(Array.isArray(ctx.lecciones) && ctx.lecciones.length ? [
      '',
      'REGLAS DE LA CASA (las aprobo el dueño; cumplelas siempre):',
      ...ctx.lecciones.map((t: string) => `- ${t}`),
    ] : []),
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
  const correcciones = (Array.isArray(ctx.correcciones) ? ctx.correcciones : [])
    .map((c: any) => `Cliente: ${String(c.customer_message || '').slice(0, 160)}\nTu sugerencia: ${String(c.bot_reply).slice(0, 220)}\nEl dueño lo cambio a: ${String(c.human_reply).slice(0, 220)}`)
    .join('\n\n');
  const encargo = [
    // (24/11/2026) Ya no son al azar: son las preguntas más PARECIDAS a esta.
    ejemplos ? `ASI CONTESTO LA CASA PREGUNTAS PARECIDAS (copia el tono y la forma de contestar; los precios y existencias de aqui son viejos: sacalos SOLO de las herramientas):\n\n${ejemplos}\n` : '',
    correcciones ? `ASI CORRIGE EL DUEÑO TUS SUGERENCIAS. Aprende QUE quita, QUE agrega y COMO lo dice; no repitas lo que el borra:\n\n${correcciones}\n` : '',
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

  const prov = { usar: 'openai' as 'openai' | 'gemini', modelo: MODELO };

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const peticion = {
      messages: mensajes,
      tools: herramientas.length ? herramientas : undefined,
      // En la ultima vuelta se le corta el acceso a herramientas para
      // forzar una respuesta: sin esto podria quedarse consultando.
      tool_choice: herramientas.length ? (vuelta === MAX_VUELTAS - 1 ? 'none' : 'auto') : undefined,
      temperature: 0.3,   // bajo: inventar un precio seria peor que sonar sosa
      max_tokens: 400,
    };
    const msg = await pedirAlModelo(prov, apiKey, peticion);

    const llamadas = msg.tool_calls || [];
    if (!llamadas.length) {
      return { texto: String(msg.content || '').trim(), usadas, modelo: prov.modelo };
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

  return { texto: '', usadas, modelo: prov.modelo };
}

// ── OpenAI, y Gemini de respaldo ────────────────────────────
// (24/11/2026) El 05/11 el saldo de la API de OpenAI llegó a cero y Hermes se
// apagó en la extensión sin que nadie lo notara (la suscripción de ChatGPT no
// paga la API). Si OpenAI dice que no hay saldo, que hay demasiadas llamadas o
// se cae, la MISMA conversación sigue con Gemini por su capa compatible con
// OpenAI: mismos mensajes, mismas herramientas. Una vez que cambia, se queda
// en Gemini hasta terminar esa sugerencia.
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const MODELO_GEMINI = 'gemini-2.5-flash';

async function pedirAlModelo(prov: { usar: 'openai' | 'gemini'; modelo: string }, apiKey: string, peticion: any) {
  if (prov.usar === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: MODELO, ...peticion }),
    });
    if (r.ok) {
      const data = await r.json();
      const msg = data?.choices?.[0]?.message;
      if (!msg) throw new Error('OpenAI no devolvio mensaje');
      return msg;
    }
    const detalle = await r.text().catch(() => '');
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const sePuedeCambiar = r.status === 429 || r.status >= 500 || /insufficient_quota|no credits|billing/i.test(detalle);
    if (!geminiKey || !sePuedeCambiar) throw new Error(`OpenAI ${r.status}: ${detalle.slice(0, 200)}`);
    console.warn('[hermes-sugerir] OpenAI', r.status, '→ Gemini');
    prov.usar = 'gemini';
    prov.modelo = MODELO_GEMINI;
  }

  const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? '';
  const r = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${geminiKey}` },
    body: JSON.stringify({
      model: MODELO_GEMINI,
      // Sin "pensar": con max_tokens 400 el razonamiento se comería la respuesta.
      reasoning_effort: 'none',
      ...peticion,
      messages: await mensajesParaGemini(peticion.messages),
    }),
  });
  if (!r.ok) {
    const detalle = await r.text().catch(() => '');
    throw new Error(`Gemini ${r.status}: ${detalle.slice(0, 200)}`);
  }
  const data = await r.json();
  const msg = data?.choices?.[0]?.message;
  if (!msg) throw new Error('Gemini no devolvio mensaje');
  return msg;
}

// Gemini no acepta `detail` ni (siempre) una URL de imagen: las fotos del
// cliente van incrustadas en base64. Una foto que no baje se quita y se avisa
// en el texto, para que no conteste como si la hubiera visto.
async function mensajesParaGemini(mensajes: any[]) {
  return Promise.all(mensajes.map(async (m: any) => {
    if (!Array.isArray(m.content)) return m;
    const partes = await Promise.all(m.content.map(async (p: any) => {
      if (p?.type !== 'image_url') return p;
      const url = p.image_url?.url || '';
      if (url.startsWith('data:')) return { type: 'image_url', image_url: { url } };
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(String(r.status));
        const mime = r.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
        const bytes = new Uint8Array(await r.arrayBuffer());
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return { type: 'image_url', image_url: { url: `data:${mime};base64,${btoa(bin)}` } };
      } catch {
        return { type: 'text', text: '(Una foto del cliente no se pudo abrir: no digas que la viste.)' };
      }
    }));
    return { ...m, content: partes };
  }));
}
