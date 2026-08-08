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

        // Contexto del negocio
        const { data: ctx } = await supabase.rpc('ai_chat_context_summary', { p_tenant_id: tenant_id });

        // Construir prompt
        const historyMsgs = (history || [])
            .slice(-MAX_HISTORY)
            .map((m: any) => `${m.role.toUpperCase()}: ${m.content}`)
            .join('\n');

        const userPrompt = JSON.stringify({
            estado_negocio: ctx,
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

        const mensajes: any[] = [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
        ];

        // El consumo se ACUMULA. Una pregunta con herramientas son varias
        // llamadas al modelo: registrar solo la última haría que el medidor
        // reporte de menos, que es peor que no medir.
        let inTot = 0, outTot = 0, costTot = 0, msTot = 0, vueltas = 0;
        const usadas: string[] = [];
        let llm: any = null;

        for (let v = 0; v < MAX_VUELTAS_TOOLS; v++) {
            llm = await callLLM({
                messages: mensajes,
                system: SYSTEM_PROMPT,
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
                usadas.push(c.function?.name);
                let salida: string;
                try {
                    const args = JSON.parse(c.function?.arguments || '{}');
                    const out = await mcpRpc(mcpUrl, token, 'tools/call', { name: c.function.name, arguments: args });
                    salida = out?.content?.[0]?.text || '{}';
                } catch (e) {
                    // El fallo se le devuelve al modelo para que reaccione,
                    // en vez de romper la respuesta entera.
                    salida = JSON.stringify({ error: String(e?.message || e) });
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
