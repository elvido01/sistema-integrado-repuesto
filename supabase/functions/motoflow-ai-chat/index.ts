// ============================================================
// motoflow-ai-chat — Chat CEO
// ============================================================
// Asesor conversacional con contexto del negocio en tiempo real.
//
// Flujo:
//   1. Auth con JWT del usuario
//   2. Carga (o crea) sesión de chat
//   3. Carga historial reciente (últimos 12 mensajes)
//   4. Snapshot del estado del negocio (RPC ai_chat_context_summary)
//   5. Llama LLM con system + context + history + user msg
//   6. Guarda msg user + msg assistant en ai_chat_messages
//   7. Devuelve respuesta + session_id
//
// POST /functions/v1/motoflow-ai-chat
// Body: { message: string, session_id?: uuid }
// ============================================================

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { callLLM } from './llm.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = 'gpt-4o-mini';
const MAX_HISTORY = 12;
// Tope de idas y vueltas con las herramientas. En la última se le corta el
// acceso para forzar respuesta: sin ese corte, un modelo puede quedarse
// consultando en círculo y cada vuelta se cobra.
const MAX_VUELTAS_TOOLS = 4;

// Habla con el servidor MCP (JSON-RPC). Se pasa el token DEL USUARIO para
// que cada consulta quede acotada a su empresa por get_user_tenant().
async function mcpRpc(url: string, token: string, method: string, params: any) {
    const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    });
    const j = await r.json().catch(() => null);
    if (j?.error) throw new Error(`MCP ${method}: ${j.error.message}`);
    return j?.result;
}

const SYSTEM_PROMPT = `Eres el ASESOR EJECUTIVO IA de MotoFlow / Repuestos Morla — un sistema integrado para tienda de repuestos de motocicletas en República Dominicana.

QUIÉN ERES:
- Asesor senior, directo, práctico. Como un CFO/COO de confianza del dueño.
- Hablas español dominicano profesional, sin paja, sin tecnicismos innecesarios.
- Trato cordial pero al grano. No usas frases como "como un asistente IA...".

LO QUE TE ENVÍO EN CADA MENSAJE:
- Un objeto JSON llamado "estado_negocio" con la foto actual del negocio (health score, alertas, morosos, capital muerto, últimos reportes, decisiones pendientes).
- El historial reciente de la conversación.
- La pregunta nueva del CEO humano.

REGLAS ESTRICTAS:
1. **NUNCA inventes datos.** Si te preguntan algo que no está en "estado_negocio", responde literalmente: "No tengo esa información en este momento. Considera ejecutar el análisis diario o revisar el módulo correspondiente."
2. **Cita datos concretos** cuando los uses (números, nombres de clientes, códigos de productos).
3. **Sé práctico.** Cada respuesta debe terminar con una acción concreta sugerida o una pregunta clarificadora.
4. **Respeta autoridad humana.** Si la acción es crítica (suspender crédito, eliminar producto, cambiar precio masivo), dilo como recomendación, no como orden, y menciona que requiere aprobación del CEO.
5. **Respuestas cortas.** 2-5 oraciones. Si necesitas listar, máximo 5 puntos.
6. **No repitas información** que ya diste en mensajes anteriores.

LO QUE NO HACES:
- No ejecutas acciones (no creas decisiones, no modificas datos). Solo asesoras.
- No te disculpas de manera servil ("disculpe que no pueda...").
- No usas emojis salvo que el usuario los use primero.`;

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (req.method !== 'POST') {
        return json({ ok: false, error: 'method' }, 405);
    }

    try {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        const authHeader = req.headers.get('Authorization');
        if (!authHeader) return json({ ok: false, error: 'no_auth' }, 401);
        const token = authHeader.replace('Bearer ', '');

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        // Cliente con la sesión DEL USUARIO. Hace falta uno aparte porque
        // service_role no tiene sesión: get_user_tenant() le devuelve NULL, y
        // toda RPC que dependa de la empresa falla con "Sin sesión". Es lo que
        // impedía proponer la cotización y lo que hacía que get_agente_ia()
        // volviera vacío — el asistente contestaba con el prompt genérico
        // creyéndose Hermes.
        //
        // El de service_role se queda para escribir el historial y el consumo,
        // que sí deben pasar por encima de RLS.
        const supaUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { autoRefreshToken: false, persistSession: false },
        });

        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData?.user) return json({ ok: false, error: 'invalid_token' }, 401);
        const user = userData.user;

        // Tenant
        const { data: profile, error: profErr } = await supabase
            .from('profiles')
            .select('tenant_id')
            .eq('id', user.id)
            .maybeSingle();
        if (profErr || !profile?.tenant_id) return json({ ok: false, error: 'sin_tenant' }, 403);
        const tenant_id = profile.tenant_id;

        // Body
        const body = await req.json();
        const message = String(body?.message || '').trim();
        let session_id: string | null = body?.session_id || null;
        // Panel abierto y datos que esa pantalla ya tiene cargados.
        const pantalla = body?.pantalla || null;
        // Con quién se cree estar hablando. 'sistema' es Jarvis, de MotoFlow;
        // cualquier otra cosa, el agente de la empresa.
        const quien = body?.agente === 'sistema' ? 'sistema' : 'empresa';
        if (!message) return json({ ok: false, error: 'mensaje_vacio' }, 400);
        if (message.length > 1000) return json({ ok: false, error: 'mensaje_muy_largo', mensaje: 'Máx 1000 caracteres' }, 400);

        // Sesión: usar la existente o crear una nueva
        if (!session_id) {
            const { data: newSession, error: sessErr } = await supabase
                .from('ai_chat_sessions')
                .insert({
                    tenant_id,
                    title: message.slice(0, 60),
                    created_by: user.id,
                })
                .select('id')
                .single();
            if (sessErr) throw new Error('crear sesión: ' + sessErr.message);
            session_id = newSession.id;
        } else {
            // Verificar que la sesión pertenece al tenant
            const { data: existing } = await supabase
                .from('ai_chat_sessions')
                .select('id')
                .eq('id', session_id)
                .eq('tenant_id', tenant_id)
                .maybeSingle();
            if (!existing) return json({ ok: false, error: 'sesion_no_encontrada' }, 404);
        }

        // Historial reciente
        const { data: history } = await supabase
            .from('ai_chat_messages')
            .select('role, content')
            .eq('session_id', session_id)
            .order('created_at', { ascending: true })
            .limit(MAX_HISTORY * 2);

        // Contexto del negocio: la foto del día, morosos, capital muerto.
        //
        // Para el AI CEO ES el tema, así que va siempre. Para Jarvis casi
        // nunca hace falta —le preguntan cómo se registra un abono, no cómo va
        // el mes— y sin embargo viajaba en cada pregunta. Si necesita cifras
        // del día tiene la herramienta resumen_dia, que además trae el dato
        // fresco en vez de una foto tomada al empezar la conversación.
        const { data: ctx } = quien === 'sistema'
            ? { data: null }
            : await supabase.rpc('ai_chat_context_summary', { p_tenant_id: tenant_id });

        // Construir prompt
        const historyMsgs = (history || [])
            .slice(-MAX_HISTORY)
            .map((m: any) => `${m.role.toUpperCase()}: ${m.content}`)
            .join('\n');

        // ── Quién contesta ────────────────────────────────────────
        // Hermes es el de Repuestos Morla; Jarvis es el de MotoFlow. Dos
        // ranuras distintas a propósito: cuando el agente de la empresa está
        // caído, el respaldo cargaba SU persona y contestaba "soy Hermes,
        // parte del equipo de Repuestos Morla" estando Hermes apagado.
        // Un suplente no se pone la camiseta con el nombre del titular.
        const { data: agente } = quien === 'sistema'
            ? await supaUser.rpc('get_agente_sistema')
            : await supaUser.rpc('get_agente_ia');

        // Las reglas duras van aquí, en el código, NO en la personalidad que
        // el dueño edita. Puede darle carácter a su agente; no puede darle
        // permiso para inventar precios ni para mirar otra empresa.
        const REGLAS = [
            '',
            'REGLAS QUE NO SE NEGOCIAN:',
            '1. NUNCA inventes precios, existencias, deudas ni fechas. Consúltalos',
            '   con las herramientas. Si no aparece, dilo y pide el dato que falta.',
            '2. Solo ves los datos de esta empresa. No hables de otras.',
            '3. Si te piden algo que no puedes hacer, dilo en una línea y ofrece',
            '   la alternativa. Nada de disculpas largas.',
            '4. Los montos en pesos dominicanos, con coma de miles: RD$ 1,400.',
            '',
            'ANTES DE CONTESTAR, PIENSA:',
            '- ¿Qué te están preguntando de verdad? A veces la pregunta corta',
            '  esconde otra ("¿cuánto cuesta?" suele ser "¿la tengo y a cuánto?").',
            '- ¿Necesitas consultar algo? Si la respuesta depende de un precio, una',
            '  existencia, una deuda o una cifra del día, CONSÚLTALO primero.',
            '- ¿Te alcanza con una consulta o hacen falta dos? Ejemplo: la pieza y',
            '  después la deuda del cliente que la pide.',
            '- Recién entonces contesta, y contesta lo que se preguntó.',
            'Este razonamiento es interno: NO lo escribas. Se ve en el resultado.',
        ].join('\n');

        // QUÉ SABE HACER, dicho con nombre y apellido.
        //
        // Sin esto se negaba a presentarse: preguntarle "¿quién eres y qué
        // puedes hacer?" le sonaba a algo que tendría que inventar, y las
        // reglas le prohíben inventar. Pero sus capacidades no son una
        // opinión: son la lista de herramientas que tiene enchufadas. Se le
        // arma sola, así que el día que se agregue una al MCP, él ya sabe
        // contarla sin que nadie le reescriba la personalidad.
        // (El texto de capacidades se arma más abajo, cuando ya están
        //  descubiertas las herramientas.)

        // La lista de módulos se mandaba DOS veces: aquí completa, con id y
        // nombre de los 76 paneles (~956 tokens), y otra vez como enum de
        // abrir_modulo (~326). La del enum hace falta: es la que impide que se
        // invente el nombre de una pantalla. Esta no aportaba nada y viajaba
        // en cada pregunta, incluso en "¿dónde cuadro la caja?".
        const { modulos: _modulos, ...pantallaSinModulos } = (pantalla || {});

        const userPrompt = JSON.stringify({
            estado_negocio: ctx,
            // Dónde está parado el usuario ahora mismo y qué datos tiene esa
            // pantalla cargados. Permite preguntar "¿qué es esto?" o
            // "¿por qué no cuadra?" sin explicar de qué se habla.
            pantalla_actual: pantalla ? pantallaSinModulos : null,
            historial_reciente: historyMsgs,
            pregunta_nueva: message,
        });

        // ── Herramientas del MCP ──────────────────────────────────
        // Se DESCUBREN, no van escritas aquí: lo que el MCP publique hoy es
        // lo que el asistente sabe hacer hoy. Agregar una herramienta allá la
        // pone a disposición sin tocar este archivo.
        //
        // El snapshot de estado_negocio se mantiene: es la foto general.
        // Las herramientas son para lo puntual que no cabe en una foto —
        // "¿tenemos este cigüeñal?", "¿cuánto debe fulano?".
        const mcpUrl = `${SUPABASE_URL}/functions/v1/motoflow-mcp`;
        let herramientas: any[] = [];
        try {
            const lista = await mcpRpc(mcpUrl, token, 'tools/list', {});
            herramientas = (lista?.tools || []).map((t: any) => ({
                type: 'function',
                function: { name: t.name, description: t.description, parameters: t.inputSchema },
            }));
        } catch (e) {
            // Sin MCP el asistente sigue contestando con el snapshot. Perder
            // las herramientas degrada la respuesta; tumbar el chat, no.
            console.warn('[motoflow-ai-chat] MCP no disponible:', e?.message || e);
        }

        // ── Herramienta que ejecuta el NAVEGADOR, no la base ──────
        // Abrir un módulo no se puede hacer desde el servidor. Aquí solo se
        // registra la intención; la pantalla la lee de la respuesta y navega.
        //
        // Cada módulo sigue envuelto en <Protected>, así que si el usuario no
        // tiene permiso la pantalla se lo niega igual: el agente puede PEDIR
        // abrirla, no saltarse el permiso.
        const modulos = Array.isArray(pantalla?.modulos) ? pantalla.modulos : [];
        if (modulos.length) {
            herramientas.push({
                type: 'function',
                function: {
                    name: 'abrir_modulo',
                    description:
                        'Abre una pantalla del sistema para el usuario. Úsala cuando te pidan ir a un ' +
                        'módulo o cuando la respuesta sea más útil viéndola ahí (ej: "abre ventas", ' +
                        '"muéstrame el cierre de caja"). Después de abrirla, dilo en una línea.',
                    parameters: {
                        type: 'object',
                        properties: {
                            modulo: {
                                type: 'string',
                                description: 'Identificador del módulo',
                                enum: modulos.map((m: any) => m.id).slice(0, 80),
                            },
                        },
                        required: ['modulo'],
                    },
                },
            });
        }

        // ── Proponer acciones que ESCRIBEN ────────────────────────
        // El agente no ejecuta: propone. El payload queda congelado en la
        // base y la persona autoriza en pantalla. Se le dice explícitamente
        // para que no prometa que ya lo hizo.
        herramientas.push({
            type: 'function',
            function: {
                name: 'proponer_accion',
                description:
                    'Propone una acción que MODIFICA el sistema. NO la ejecuta: queda esperando que ' +
                    'la persona la autorice en pantalla. Úsala cuando te pidan crear algo. ' +
                    'Después de proponerla, di en una línea qué preparaste y que falta autorizar. ' +
                    'NUNCA digas que ya está hecho.',
                parameters: {
                    type: 'object',
                    properties: {
                        tipo: { type: 'string', enum: ['crear_cotizacion'],
                                description: 'Por ahora solo cotizaciones. Facturar y cobrar no están habilitados.' },
                        resumen: { type: 'string',
                                   description: 'Una línea clara para que la persona sepa qué autoriza. Ej: "Cotización para Juan Pérez: 2 gomas 90/90-17"' },
                        cliente_codigo: { type: 'string', description: 'Código del cliente si está registrado' },
                        cliente_nombre: { type: 'string', description: 'Nombre, si no está registrado' },
                        notas: { type: 'string' },
                        lineas: {
                            type: 'array',
                            description: 'Las piezas. El precio NO se manda: lo pone el catálogo.',
                            items: {
                                type: 'object',
                                properties: {
                                    codigo: { type: 'string', description: 'Código exacto del producto' },
                                    cantidad: { type: 'number' },
                                },
                                required: ['codigo', 'cantidad'],
                            },
                        },
                    },
                    required: ['tipo', 'resumen', 'lineas'],
                },
            },
        });

        // QUÉ SABE HACER, con las herramientas ya descubiertas.
        //
        // Sin esto se negaba a presentarse: "¿quién eres y qué puedes hacer?"
        // le sonaba a algo que tendría que inventar, y las reglas se lo
        // prohíben. Pero sus capacidades no son una opinión: son la lista de
        // herramientas que tiene enchufadas. Se arma sola, así que el día que
        // se agregue una al MCP él ya sabe contarla, sin reescribirle la
        // personalidad.
        const capacidades = [
            '',
            `TE LLAMAS ${(agente?.nombre || 'Asistente').toUpperCase()}${agente?.puesto ? `, ${agente.puesto}` : ''}.`,
            'Si te preguntan quién eres o qué sabes hacer, EXPLÍCALO con naturalidad.',
            'Eso no es inventar: es exactamente lo que puedes hacer hoy.',
            '',
            // Solo los NOMBRES. La descripción de cada herramienta ya viaja en
            // el array `tools` de la misma llamada: repetirla aquí era pagar
            // dos veces por el mismo texto.
            herramientas.length
                ? 'Herramientas: ' + herramientas.map((h: any) => h.function.name).join(', ')
                : '· (sin herramientas conectadas en este momento)',
            '',
            'Lo que NO puedes todavía: facturar ni registrar pagos.',
            'Al presentarte, hazlo en dos o tres líneas y con tus palabras. Nada de',
            'listar nombres técnicos: di qué resuelves, no cómo se llama la función.',
        ].join('\n');

        const systemPrompt = (agente?.persona || SYSTEM_PROMPT) + '\n' + REGLAS + '\n' + capacidades;

        const mensajes: any[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ];
        const propuestas: any[] = [];

        // El consumo se ACUMULA. Una pregunta con herramientas son varias
        // llamadas al modelo: registrar solo la última haría que el medidor
        // reporte de menos, que es peor que no medir.
        let inTot = 0, outTot = 0, costTot = 0, msTot = 0, vueltas = 0;
        const usadas: any[] = [];
        let llm: any = null;

        for (let v = 0; v < MAX_VUELTAS_TOOLS; v++) {
            llm = await callLLM({
                messages: mensajes,
                system: systemPrompt,
                user: userPrompt,
                user_tag: tenant_id,
                model: MODEL,
                max_tokens: 600,
                temperature: 0.3,
                tools: herramientas.length ? herramientas : undefined,
                tool_choice: v === MAX_VUELTAS_TOOLS - 1 ? 'none' : 'auto',
            });

            inTot += llm.input_tokens || 0;
            outTot += llm.output_tokens || 0;
            costTot += llm.cost_usd || 0;
            msTot += llm.duration_ms || 0;
            vueltas++;

            const llamadas = llm.tool_calls || [];
            if (!llamadas.length) break;

            mensajes.push(llm.raw_message);
            for (const c of llamadas) {
                const nombre = c.function?.name;
                let args: any = {};
                try { args = JSON.parse(c.function?.arguments || '{}'); } catch { /* args vacíos */ }
                usadas.push({ herramienta: nombre, argumentos: args });

                let salida: string;
                if (nombre === 'proponer_accion') {
                    // Se ejecuta aquí, pero SOLO guarda la propuesta. Lo que
                    // modifica el sistema lo dispara la persona al autorizar.
                    const { tipo, resumen, ...resto } = args;
                    const { data: prop, error: e } = await supaUser.rpc('agente_proponer_accion', {
                        p_tipo: tipo, p_resumen: resumen, p_payload: resto,
                    });
                    if (e) {
                        salida = JSON.stringify({ error: e.message });
                    } else {
                        propuestas.push({ ...prop, tipo, resumen, payload: resto });
                        salida = JSON.stringify(prop);
                    }
                } else if (nombre === 'abrir_modulo') {
                    // No se ejecuta aquí: navegar es cosa del navegador. Se le
                    // confirma al modelo para que siga y cierre la respuesta,
                    // y la pantalla la abre al recibirla.
                    const m = modulos.find((x: any) => x.id === args.modulo);
                    salida = m
                        ? JSON.stringify({ ok: true, abriendo: m.nombre })
                        : JSON.stringify({ ok: false, error: `No existe el módulo "${args.modulo}"` });
                } else {
                    try {
                        const out = await mcpRpc(mcpUrl, token, 'tools/call', { name: nombre, arguments: args });
                        salida = out?.content?.[0]?.text || '{}';
                    } catch (e) {
                        // El fallo se le devuelve al modelo para que reaccione,
                        // en vez de romper la respuesta entera.
                        salida = JSON.stringify({ error: String(e?.message || e) });
                    }
                }
                mensajes.push({ role: 'tool', tool_call_id: c.id, content: salida });
            }
        }

        llm.input_tokens = inTot;
        llm.output_tokens = outTot;
        llm.cost_usd = Number(costTot.toFixed(4));
        llm.duration_ms = msTot;

        // Persistir mensajes
        await supabase.from('ai_chat_messages').insert([
            {
                session_id,
                tenant_id,
                role: 'user',
                content: message,
            },
            {
                session_id,
                tenant_id,
                role: 'assistant',
                content: llm.content,
                tokens_used: (llm.input_tokens || 0) + (llm.output_tokens || 0),
                cost_usd: llm.cost_usd,
                metadata: { model: llm.model, provider: llm.provider },
            },
        ]);

        // Touch session updated_at
        await supabase
            .from('ai_chat_sessions')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', session_id);

        // Log de uso
        await supabase.from('ai_agent_runs').insert({
            tenant_id,
            user_id: user.id,
            agent_key: 'ai_ceo_chat',
            agent_name: 'ai_ceo_chat',
            run_type: 'on_demand',
            credits_used: 1,
            provider: llm.provider,
            model: llm.model,
            input_tokens: llm.input_tokens,
            output_tokens: llm.output_tokens,
            cost_usd: llm.cost_usd,
            status: 'completed',
            duration_ms: llm.duration_ms,
            metadata: {
                session_id,
                message_len: message.length,
                // Con cuántas llamadas al modelo se resolvió y qué consultó.
                // Sirve para ver si el gasto de una pregunta se disparó por
                // un bucle largo de herramientas.
                vueltas,
                herramientas: usadas,
            },
        });

        return json({
            ok: true,
            session_id,
            answer: llm.content,
            cost_usd: llm.cost_usd,
            tokens: (llm.input_tokens || 0) + (llm.output_tokens || 0),
            // QUIÉN contestó de verdad. Lo devuelve el backend, no lo asume la
            // pantalla: si la tabla agentes_ia no está poblada, esto viene
            // null y significa que respondió el asesor genérico de antes.
            // Preguntarle "¿quién eres?" no sirve — un modelo dice lo que le
            // pidan. Esto sale de qué prompt se cargó realmente.
            agente_usado: agente?.nombre || null,
            herramientas: usadas,
            vueltas,
            // Lo que quedó esperando autorización. La pantalla lo muestra con
            // los números a la vista; nada de esto pasó todavía.
            propuestas,
        });
    } catch (err: any) {
        console.error('[motoflow-ai-chat]', err);
        return json({ ok: false, error: 'unexpected', mensaje: err.message }, 500);
    }
});

function json(body: any, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}
