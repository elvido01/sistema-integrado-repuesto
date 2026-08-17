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

// ── CACHE: SOLO LO QUE NO CADUCA (Fase 16) ────────────────────────────
// El catálogo de herramientas se pedía al MCP en CADA pregunta. Es una ida
// y vuelta HTTP entera para recibir siempre lo mismo: la lista solo cambia
// cuando alguien despliega el MCP.
//
// >>> LO QUE NO SE CACHEA, Y POR QUE <<<
// Precios, existencia, cartera, estado de una factura: nada de eso entra
// aquí ni entrará. Un precio de hace cinco minutos servido como actual es
// peor que tardar cinco segundos más — con el bloqueo de venta bajo costo,
// un costo viejo deja pasar una factura que no debía pasar.
//
// Aquí solo vive la FORMA de las herramientas, nunca datos del negocio. Y
// el resultado no depende del usuario ni de la empresa: es el mismo
// catálogo para todos, así que cachearlo no puede filtrar nada entre
// empresas. Si dependiera del tenant, esto sería un agujero, no una mejora.
const CACHE_TOOLS_MS = 5 * 60 * 1000;
let toolsCache: { en: number; datos: any } | null = null;

async function listaDeHerramientas(mcpUrl: string, token: string) {
    const ahora = Date.now();
    if (toolsCache && ahora - toolsCache.en < CACHE_TOOLS_MS) return toolsCache.datos;
    const datos = await mcpRpc(mcpUrl, token, 'tools/list', {});
    toolsCache = { en: ahora, datos };
    return datos;
}

// ── NIVEL DE RIESGO DE CADA HERRAMIENTA (Fase 10) ─────────────────────
// Se clasifica por lo que HACE, no por quién la llama:
//
//   1 LECTURA          buscar, consultar, resolver  → corre sola
//   2 ESCRITURA        crear cotización, pedido     → corre si es inequívoco
//   3 ALTO IMPACTO     anular, eliminar, precios,   → NO la ejecuta el modelo
//                      cualquier cosa financiera
//
// El nivel 3 no se "confirma con más ganas": no pasa por aquí. Va por
// agente_proponer_accion, que enseña los números en pantalla y pide
// contraseña. La diferencia importa — una confirmación que el propio
// modelo puede pedirse a sí mismo no es un control.
// Se mira el VERBO, que en estos nombres va primero — no la palabra suelta
// en cualquier posición. Con la versión anterior, `cuentas_pagar` (el
// listado de cuentas por pagar, una consulta) salía nivel 3 por llevar
// "pagar" dentro, y Jarvis no habría podido ni leerlas. Lo mismo con
// `cartera_cobrar`. La diferencia está en el orden: `pagar_suplidor` hace
// algo, `cuentas_pagar` cuenta algo.
const VERBO_DESTRUCTIVO = /^(anular|eliminar|borrar|cancelar|revertir|castigar|cerrar|ajustar|cambiar|pagar|desembolsar|transferir)$/;
const VERBO_ESCRIBE = /^(crear|guardar|grabar|facturar|registrar|actualizar|modificar|preparar|cobrar)$/;

function nivelDeRiesgo(nombre: string): 1 | 2 | 3 {
    const partes = (nombre || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const primero = partes[0] || '';
    if (VERBO_DESTRUCTIVO.test(primero)) return 3;
    // Escribe Y menciona algo destructivo ("crear_nota_para_anular"): sube a
    // 3. Ante la duda, el nivel más alto: equivocarse hacia arriba cuesta un
    // clic; hacia abajo cuesta una factura anulada sin permiso.
    if (VERBO_ESCRIBE.test(primero) && partes.some((t) => VERBO_DESTRUCTIVO.test(t))) return 3;
    if (VERBO_ESCRIBE.test(primero)) return 2;
    // Lo que no lleva verbo de acción es un informe. Una herramienta nueva de
    // consulta no debería quedar trabada esperando que alguien la clasifique.
    return 1;
}

// Por variable de entorno y no fijo aquí: cambiar de familia de modelo es de
// las cosas que hay que poder deshacer en treinta segundos, sin desplegar.
//   supabase secrets set JARVIS_MODEL=gpt-5.6-luna
//   supabase secrets unset JARVIS_MODEL     (vuelve a gpt-4o-mini)
const MODEL = Deno.env.get('JARVIS_MODEL') ?? 'gpt-4o-mini';
const MAX_HISTORY = 12;
// Tope de idas y vueltas con las herramientas. En la última se le corta el
// acceso para forzar respuesta: sin ese corte, un modelo puede quedarse
// consultando en círculo y cada vuelta se cobra.
const MAX_VUELTAS_TOOLS = 4;

// "hace 3 min", "hace 5 h", "hace 2 d". Va delante de cada línea del
// historial para que se note lo viejo: una conversación que sigue abierta
// desde ayer no es la misma conversación, y el modelo tiene que poder verlo.
function haceCuanto(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    if (!isFinite(ms) || ms < 60000) return 'ahora';
    const min = Math.floor(ms / 60000);
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    return `hace ${Math.floor(h / 24)} d`;
}

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

    // Fuera del try para que el manejador de errores los tenga. ai_agent_runs
    // exige tenant_id: sin esto, la inserción del error fallaba dentro del
    // propio catch y el fallo desaparecía por completo — ni fila, ni motivo.
    let tenantErr: string | null = null;
    let userErrId: string | null = null;

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
        tenantErr = tenant_id;
        userErrId = user.id;

        // Body
        const body = await req.json();
        const message = String(body?.message || '').trim();
        let session_id: string | null = body?.session_id || null;
        // Panel abierto y datos que esa pantalla ya tiene cargados.
        const pantalla = body?.pantalla || null;
        // De dónde salió la frase. Solo llega cuando la nota de voz pasó por
        // jarvis-transcribir; escribiendo no viene nada y todo lo de abajo
        // queda en null, igual que antes de existir la voz.
        const voz = body?.voz || null;
        const fuente = voz ? 'voz' : 'texto';
        // Con quién se cree estar hablando. 'sistema' es Jarvis, de MotoFlow;
        // cualquier otra cosa, el agente de la empresa.
        const quien = body?.agente === 'sistema' ? 'sistema' : 'empresa';
        if (!message) return json({ ok: false, error: 'mensaje_vacio' }, 400);
        if (message.length > 1000) return json({ ok: false, error: 'mensaje_muy_largo', mensaje: 'Máx 1000 caracteres' }, 400);

        // ── MEMORIA CORTA DE LA CONVERSACIÓN ───────────────────────────
        // "Busca la cotización de Sander" … "mándala a facturar". Entre las
        // dos frases hay que recordar que "la" es CT-000097.
        //
        // Vive en ai_chat_sessions.estado y la escribe el SERVIDOR con lo que
        // devolvieron las herramientas, nunca con lo que dijo el modelo. Esa
        // distinción es la que impide que un identificador inventado se
        // convierta en el "recuerdo" con el que se factura después.
        let estadoSesion: Record<string, any> = {};

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
                .select('id, estado')
                .eq('id', session_id)
                .eq('tenant_id', tenant_id)
                .maybeSingle();
            if (!existing) return json({ ok: false, error: 'sesion_no_encontrada' }, 404);
            estadoSesion = existing.estado || {};
        }

        // ── HISTORIAL RECIENTE ─────────────────────────────────────────
        //
        // >>> DESCENDENTE, Y NO ES UN DETALLE <<<
        // (2026-08-17) Esto pedía `ascending: true` con `limit(24)`. Eso NO
        // trae los 24 últimos mensajes: trae los 24 PRIMEROS. Y el `.slice(-12)`
        // de abajo se quedaba con los mensajes 13 al 24 — o sea, el principio
        // de la conversación.
        //
        // La sesión del dueño llevaba 130 mensajes y ocho días abierta, así
        // que Jarvis llevaba una semana contestando desde el mensaje 24, del
        // 16/08 a las 12:52. Todo lo demás le era invisible.
        //
        // Ahí estaba el "no entiende lo que le digo": le enseñaba una lista de
        // calipers, le decían "cotízame el número dos", y el número dos de la
        // única lista que él veía era un tanque de gasolina de tres días
        // antes. No se equivocaba — contestaba bien a lo que le mostrábamos.
        //
        // Se piden los ÚLTIMOS y se les da la vuelta para leerlos en orden.
        const { data: history } = await supabase
            .from('ai_chat_messages')
            .select('role, content, created_at')
            .eq('session_id', session_id)
            .order('created_at', { ascending: false })
            .limit(MAX_HISTORY);

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

        // Construir prompt.
        //
        // Con CUÁNDO se dijo cada cosa. Sin la hora, una lista de hace tres
        // minutos y otra de hace tres días se leen exactamente igual, y el
        // modelo no tiene con qué preferir la reciente. Relativo y no fecha:
        // lo que importa no es el día, es si esto todavía es la conversación.
        const historyMsgs = (history || [])
            .slice()
            .reverse()
            .map((m: any) => `[${haceCuanto(m.created_at)}] ${m.role.toUpperCase()}: ${m.content}`)
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
            // (2026-08-16) Le pidieron "una agua cool" — que existe, RM131 AGUA
            // COOL HEAVEN — y contestó "no puedo cotizar agua cool" SIN LLEGAR A
            // BUSCARLA. La búsqueda la encuentra con las dos palabras; el que no
            // buscó fue él.
            '5. NO existe "eso no es una pieza". Todo lo que te pidan cotizar,',
            '   buscar o facturar es algo del catálogo, por raro que suene el',
            '   nombre: "agua cool", "garrafón", "zapatilla". BUSCA SIEMPRE antes',
            '   de decir que no lo hay. Nunca lo niegues sin haber buscado.',
            // Antes de eso le habían dicho "AHUA COOL" y buscó "Ahuacool", todo
            // junto: cero resultados. Separadas, "cool" sola la encontraba.
            '6. Busca con las palabras SEPARADAS, como te las dijeron. No las',
            '   pegues. Y si no encuentras nada, prueba otra vez con UNA sola',
            '   palabra —la más rara— antes de darte por vencido.',
            // Y después contestó sobre un cliente y una cotización de una
            // conversación anterior, y dijo que no podía facturar — que ya es
            // mentira desde que tiene cobrar_venta.
            '7. El historial trae respuestas TUYAS de antes que ya no valen. Lo',
            '   que puedes hacer es la lista de herramientas de AHORA, no lo que',
            '   dijiste antes. Y no arrastres el cliente ni la pieza de una',
            '   conversación vieja: si te acaban de dar un nombre, ese es.',
            // (2026-08-16) Dijo "la factura ha sido grabada e impresa, el total
            // es RD$177 y el cambio RD$127". Ni se grabó, ni el total era ese,
            // ni ese cambio sale de esos números.
            '8. NUNCA digas que algo quedó hecho si solo mandaste la orden. Y no',
            '   digas totales ni cambios que no te dio una herramienta: no los',
            '   calculas tú. Si no lo tienes, di "míralo en pantalla".',
            // (2026-08-16) "manda la cotización de Miki a ventas" -> agarró la
            // CT-000079, de otro cliente, porque no tenía cómo buscar por
            // nombre y se inventó un número que resultó existir.
            '9. NUNCA escribas de memoria un número de documento. El de una',
            '   cotización sale de buscar_cotizacion y de ningún otro sitio.',
            '   Si te dicen "la de Miki", búscala por ese nombre; si salen',
            '   varias, pregunta cuál. Adivinar factura lo de otro cliente.',
            // (2026-08-16) Abría Cotizaciones "para que puedas revisar y
            // autorizar", teniendo la tarjeta de autorización en el mismo chat.
            '10. Una propuesta se autoriza EN EL CHAT, con el botón que sale',
            '    debajo o diciendo "autorizo". NUNCA abras Cotizaciones para',
            '    que la autoricen: ya está delante. Después de autorizada, di',
            '    el número y ofrece enviarla a facturar; no mandes a ningún',
            '    módulo a hacer lo que ya está hecho.',
            // (2026-08-17) Le enseñó tres calipers numerados, le dijeron
            // "cotízame el número dos" y preparó un tanque de gasolina: buscó
            // el "dos" en una lista vieja del historial. Los números que la
            // gente nombra son los de `en_curso.ultima_lista`, que los pone el
            // servidor sobre el resultado real — no los del párrafo que
            // escribiste tú.
            '11. "El número dos", "el segundo", "el primero", "ese": la lista es',
            '    `en_curso.ultima_lista` y NINGUNA otra. Copia el "codigo" de esa',
            '    opción tal cual. Si esa lista no está, di que no la tienes y pide',
            '    que te repitan la pieza. NUNCA elijas por parecido ni de memoria.',
            '12. Cuando enseñes varias opciones, numéralas 1, 2, 3 EN EL MISMO',
            '    ORDEN en que te llegaron de la herramienta. Ese es el orden que',
            '    la persona va a nombrar después.',
            // (2026-08-17) "Mira la pantalla, hay un error" estando en Ventas
            // -> "eso se hace en Ventas, ¿te lo abro?". La regla 10 cubría
            // Cotizaciones y esto se seguía colando en los demás módulos.
            '13. Mira `pantalla_actual`: NUNCA ofrezcas abrir el módulo donde la',
            '    persona ya está parada. Si ya está ahí, resuelve o di qué tocar.',
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
            // Lo que quedó vivo de la conversación: sobre qué cliente,
            // cotización o producto se viene hablando. Es lo que convierte
            // "mándala a facturar" en algo ejecutable. Solo va si hay algo:
            // un objeto de nulls le enseña al modelo a no mirarlo.
            en_curso: Object.keys(estadoSesion || {}).length ? estadoSesion : null,
            historial_reciente: historyMsgs,
            pregunta_nueva: message,
            // Que sepa que lo oyó, no que lo leyó. Un "sí" dictado puede venir
            // con ruido alrededor, y una palabra rara es más probable que sea
            // una transcripción imperfecta que una orden nueva.
            llego_por: fuente,
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
            const lista = await listaDeHerramientas(mcpUrl, token);
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

        // ── Dejar la factura ARMADA en pantalla ───────────────────
        // No escribe nada: llena la pantalla de Ventas y la persona pulsa
        // F10. Por eso NO pasa por proponer_accion ni pide autorización —
        // no hay nada que autorizar mientras no se grabe.
        //
        // Es la diferencia entre un ayudante que te adelanta el trabajo y
        // uno que factura por su cuenta. Y como todo entra por el mismo
        // camino que teclear el código, sigue rigiendo el control de
        // existencia y el bloqueo de venta bajo costo.
        herramientas.push({
            type: 'function',
            function: {
                name: 'preparar_venta',
                description:
                    'PASO 1 de facturar: abre Facturación y deja la venta ARMADA. NO la graba. ' +
                    'Úsala cuando pidan facturar o vender algo, o cuando pidan pasar una cotización a Ventas. ' +
                    'Manda "lineas" con las piezas, O "cotizacion" con el número de una cotización ya hecha — nunca las dos. ' +
                    'Los códigos son los EXACTOS de buscar_piezas: búscalos antes si no los tienes. ' +
                    'IMPORTANTÍSIMO: si la persona YA te dijo cómo paga —"me pagaron con 50 en efectivo"— mándalo ' +
                    'AQUÍ en forma_pago y recibido, y la venta se cobra sola en el mismo paso. No preguntes lo que ya te dijeron. ' +
                    'Solo si NO te lo dijeron: pregunta la forma de pago, y si es EFECTIVO con cuánto pagan, ' +
                    'y entonces llama a cobrar_venta — NO vuelvas a llamar a esta.',
                parameters: {
                    type: 'object',
                    properties: {
                        lineas: {
                            type: 'array',
                            description: 'Las piezas. El precio lo pone el catálogo. Vacío si mandas "cotizacion".',
                            items: {
                                type: 'object',
                                properties: {
                                    codigo: { type: 'string', description: 'El "codigo" EXACTO que devolvió buscar_piezas, copiado tal cual' },
                                    cantidad: { type: 'number' },
                                },
                                required: ['codigo', 'cantidad'],
                            },
                        },
                        cotizacion: { type: 'string',
                                      description: 'Número de una cotización YA existente, para pasarla a factura. TIENE que venir de buscar_cotizacion: nunca lo escribas de memoria ni lo deduzcas. Trae su cliente y sus piezas.' },
                        cliente_nombre: { type: 'string', description: 'Nombre del cliente si lo dieron' },
                        forma_pago: { type: 'string', enum: ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CHEQUE'],
                                      description: 'Solo si ya te la dijeron. Si no, pregúntala.' },
                        recibido: { type: 'number', description: 'Con cuánto paga, solo en EFECTIVO. Si no lo sabes, pregúntalo.' },
                    },
                },
            },
        });

        // ── PASO 2: cobrar, grabar e imprimir ─────────────────────
        // (2026-08-16) "quiero ese ciclo completo".
        //
        // Aquí SÍ se emite la factura. Y sin embargo esto no se salta ningún
        // control, porque no escribe en la base: pulsa F10 en la pantalla que
        // ya está a la vista. Pasa por lo mismo que si lo pulsara una persona
        // — existencia, bloqueo de venta bajo costo, crédito del cliente,
        // "monto insuficiente", NCF y la impresión.
        //
        // Lo único que cambia es quién pulsa. Por eso va aparte y con nombre
        // propio: en el registro de herramientas se lee "cobrar_venta" y se
        // sabe exactamente cuándo el agente facturó.
        herramientas.push({
            type: 'function',
            function: {
                name: 'cobrar_venta',
                description:
                    'PASO 2 de facturar: pone la forma de pago y GRABA E IMPRIME la factura que ya está en pantalla. ' +
                    'Esto SÍ emite el comprobante — no lo llames sin haber llamado antes a preparar_venta. ' +
                    'Si la forma de pago es EFECTIVO tienes que traer "recibido", el monto con el que paga; ' +
                    'si no lo sabes, PREGÚNTALO y no llames a esta herramienta todavía. ' +
                    'Después de llamarla di el número de factura y el cambio si lo hubo.',
                parameters: {
                    type: 'object',
                    properties: {
                        forma_pago: { type: 'string', enum: ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CHEQUE'] },
                        recibido: { type: 'number', description: 'Con cuánto paga. Obligatorio en EFECTIVO.' },
                    },
                    required: ['forma_pago'],
                },
            },
        });

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
                    'NUNCA digas que ya está hecho. ' +
                    'ANTES de proponer una cotización TIENES que haber buscado cada pieza con ' +
                    'buscar_piezas y usar el campo "codigo" que devolvió, copiado tal cual. ' +
                    'Si no lo tienes, búscala primero: no propongas con un código a medias.',
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
                                    // Se inventó "[PESA_TORNILLO_ROJA_PC]" en una propuesta real y
                                    // llegó hasta la pantalla de autorización. Aquí es donde el
                                    // modelo lee qué poner, así que aquí se le dice.
                                    codigo: { type: 'string',
                                              description: 'El campo "codigo" EXACTO que devolvió buscar_piezas, copiado tal cual (ej: "GAX046-NG", "015298"). NUNCA lo inventes ni escribas una descripción de la pieza: si no lo tienes, llama a buscar_piezas primero.' },
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
            'Facturar SÍ puedes, y en dos pasos que no se saltan:',
            'preparar_venta deja la venta armada en pantalla; después preguntas la',
            'forma de pago y, si es efectivo, con cuánto pagan; y recién entonces',
            'cobrar_venta la graba y la imprime. Nunca cobres sin haber preparado.',
            'Lo que NO puedes todavía: registrar pagos de facturas viejas.',
            'Al presentarte, hazlo en dos o tres líneas y con tus palabras. Nada de',
            'listar nombres técnicos: di qué resuelves, no cómo se llama la función.',
        ].join('\n');

        const systemPrompt = (agente?.persona || SYSTEM_PROMPT) + '\n' + REGLAS + '\n' + capacidades;

        const mensajes: any[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ];
        const propuestas: any[] = [];
        // Lo que hay que hacerle a una pantalla. Viaja en la respuesta y lo
        // ejecuta el navegador, igual que abrir_modulo.
        const ordenes: any[] = [];

        // El consumo se ACUMULA. Una pregunta con herramientas son varias
        // llamadas al modelo: registrar solo la última haría que el medidor
        // reporte de menos, que es peor que no medir.
        let inTot = 0, outTot = 0, costTot = 0, msTot = 0, vueltas = 0;
        // Aparte, para poder comparar modelos con datos y no con impresiones:
        // cuánta entrada vino de caché y cuánta salida se fue en razonar.
        let cacheTot = 0, razonaTot = 0;
        const usadas: any[] = [];
        let llm: any = null;

        // ── CON QUÉ MODELO CONTESTA JARVIS ────────────────────────────
        // Sale de equipo_agentes, no de una constante: cambiar de OpenAI a
        // Claude pasa a ser un UPDATE y no un despliegue. La variable
        // JARVIS_MODEL sigue valiendo como respaldo, para no dejar mudo el
        // widget si la tabla no está o la fila no existe.
        //
        // AQUÍ NO CABE 'claude_suscripcion'. Esto corre en el servidor de
        // Supabase y atiende a cualquiera que abra MotoFlow: no hay cuenta
        // personal con la que autenticarse, y usar una para servir a otros
        // no sería una optimización, sería otra cosa. Ese motor solo vale
        // en el worker de la cola, en una máquina propia.
        let proveedor: 'openai' | 'claude' = 'openai';
        let modelo = MODEL;
        try {
            const { data: ag } = await supabase
                .from('equipo_agentes')
                .select('proveedor, modelo')
                .eq('tenant_id', tenant_id)
                .eq('clave', 'jarvis')
                .eq('activo', true)
                .maybeSingle();
            if (ag?.proveedor === 'claude') proveedor = 'claude';
            if (ag?.modelo) modelo = ag.modelo;
            if (ag?.proveedor === 'claude_suscripcion') {
                // Configurado para el worker, no para aquí. Se atiende igual
                // con el respaldo en vez de dejar al usuario sin respuesta.
                proveedor = 'openai';
                modelo = MODEL;
            }
        } catch { /* sin fila: se queda el respaldo */ }

        // ── LO QUE SE RECUERDA, SALE DE LO QUE DEVOLVIÓ LA HERRAMIENTA ──
        // (Fases 5 y 7) El modelo NO escribe esta memoria. Se lee del
        // resultado real de la tool, que ya vino filtrado por tenant desde el
        // MCP. Así "la" de "mándala a facturar" apunta a una cotización que
        // existe de verdad y es de esta empresa — no a un número que el
        // modelo recordó de otra conversación o se inventó.
        //
        // Ya pasó una vez: sin herramienta para buscar una cotización por
        // nombre de cliente, el modelo se sacó un número que resultó existir,
        // y cotizó al cliente equivocado. La cura no es un modelo más listo:
        // es no dejarle escribir los identificadores.
        // >>> LA LISTA QUE EL USUARIO ACABA DE VER, NUMERADA AQUÍ <<<
        // (2026-08-17) "Cotízame el número dos" preparaba cualquier cosa. Los
        // números que la gente lee los inventaba el modelo al redactar el
        // párrafo: la herramienta devuelve piezas SIN numerar, así que el "2"
        // no apuntaba a ningún sitio y se resolvía por parecido contra
        // cualquier lista que quedara en el historial.
        //
        // Ahora la numeración se decide sobre el resultado REAL de la
        // herramienta y viaja en `en_curso`. El ordinal deja de depender de
        // que el modelo recuerde en qué orden escribió su propio texto.
        const CLAVES_LISTA = ['piezas', 'datos', 'resultados', 'items', 'cotizaciones', 'clientes'];
        const MAX_OPCIONES = 8;
        const listaDeResultado = (d: any): any[] | null => {
            if (Array.isArray(d)) return d;
            for (const k of CLAVES_LISTA) if (Array.isArray(d?.[k])) return d[k];
            return null;
        };

        function recordarDeResultado(herramienta: string, salidaJson: string) {
            try {
                const d = JSON.parse(salidaJson || '{}');
                if (d?.ok === false || d?.error) return;

                const lista = listaDeResultado(d);
                if (lista?.length) {
                    estadoSesion.ultima_lista = {
                        de: herramienta,
                        opciones: lista.slice(0, MAX_OPCIONES).map((x: any, i: number) => ({
                            n: i + 1,
                            codigo: x?.codigo ?? x?.numero ?? x?.numero_cotizacion ?? x?.id ?? null,
                            que: x?.descripcion ?? x?.nombre ?? x?.cliente_nombre ?? null,
                            precio: x?.precio ?? x?.total ?? null,
                            existencia: x?.existencia ?? null,
                        })),
                    };
                }

                // Un resultado con UNA coincidencia se adopta; con varias no se
                // elige por el modelo — se deja que pregunte cuál, y para eso
                // tiene la lista de arriba.
                //
                // Antes, cuando venían varias, el `?? d` de esta línea caía en
                // el objeto ENVOLTORIO ({busqueda, palabras, encontradas,
                // piezas}) y se leían campos que ahí no existen. Por eso el
                // `estado` de una sesión de 130 mensajes era, entero,
                // {"ultima_accion":"cobrar_venta"}: la memoria anclada nunca
                // llegó a guardar nada y el modelo caía siempre en la prosa.
                const fila = lista ? (lista.length === 1 ? lista[0] : null) : d;
                if (!fila || typeof fila !== 'object') { estadoSesion.ultima_accion = herramienta; return; }

                const nuevo: Record<string, any> = {};
                if (fila.cliente_id || fila.id && /client/i.test(herramienta)) {
                    nuevo.cliente_id = fila.cliente_id || fila.id;
                    nuevo.cliente_nombre = fila.cliente_nombre || fila.nombre || null;
                }
                if (fila.cotizacion_id || fila.numero_cotizacion || /cotizacion/i.test(herramienta)) {
                    nuevo.cotizacion_id = fila.cotizacion_id || (/cotizacion/i.test(herramienta) ? fila.id : null);
                    nuevo.cotizacion_numero = fila.numero_cotizacion || fila.numero || null;
                }
                if (fila.producto_id || /producto|pieza/i.test(herramienta)) {
                    nuevo.producto_id = fila.producto_id || (/producto|pieza/i.test(herramienta) ? fila.id : null);
                    nuevo.producto_nombre = fila.descripcion || fila.producto || null;
                }
                if (fila.factura_numero || fila.ncf) {
                    nuevo.factura_numero = fila.factura_numero || fila.numero || null;
                }
                for (const [k, val] of Object.entries(nuevo)) {
                    if (val != null && val !== '') estadoSesion[k] = val;
                }
                estadoSesion.ultima_accion = herramienta;
            } catch { /* un resultado que no es JSON no aporta memoria */ }
        }

        for (let v = 0; v < MAX_VUELTAS_TOOLS; v++) {
            llm = await callLLM({
                messages: mensajes,
                system: systemPrompt,
                user: userPrompt,
                user_tag: tenant_id,
                provider: proveedor,
                model: modelo,
                max_tokens: 600,
                temperature: 0.3,
                tools: herramientas.length ? herramientas : undefined,
                tool_choice: v === MAX_VUELTAS_TOOLS - 1 ? 'none' : 'auto',
            });

            inTot += llm.input_tokens || 0;
            outTot += llm.output_tokens || 0;
            cacheTot += llm.cached_tokens || 0;
            razonaTot += llm.reasoning_tokens || 0;
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
                } else if (nombre === 'preparar_venta') {
                    // Tampoco se ejecuta aquí: llenar una pantalla es cosa del
                    // navegador. Se valida que los códigos existan y se le
                    // confirma al modelo, que sigue preguntando forma de pago.
                    //
                    // La validación va aquí y no solo en la pantalla porque si
                    // el modelo se inventa un código, tiene que enterarse EN LA
                    // MISMA vuelta y poder corregir. Descubrirlo cuando la
                    // pantalla ya se abrió a medio llenar es tarde.
                    const cotizacion = String(args.cotizacion || '').trim();
                    const codigos = (args.lineas || []).map((l: any) => String(l?.codigo || '').trim()).filter(Boolean);

                    // ── SI YA SABE COMO LE PAGARON, SE COBRA DE UNA VEZ ────
                    // (2026-08-16) "factúrala, me pagaron con 50 pesos en
                    // efectivo": el modelo mandó la forma de pago y el monto
                    // en esta misma llamada — la pantalla quedó con MIKI, el
                    // agua cool, RECIBIDO 50 y CAMBIO 30, todo correcto— y
                    // aun así preguntó "¿es efectivo?". Al contestarle "sí",
                    // se perdió y propuso una cotización de otro cliente.
                    //
                    // El segundo turno era el problema. Si en la orden ya
                    // viene todo lo que hace falta, no hay nada que
                    // preguntar: se manda cobrar detrás de preparar. La cola
                    // de la pantalla garantiza que se atienden en ese orden.
                    const formaDada = String(args.forma_pago || '').toUpperCase();
                    const cobrarYa = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CHEQUE'].includes(formaDada)
                        && (formaDada !== 'EFECTIVO' || Number(args.recibido) > 0);

                    const encolarCobro = () => {
                        if (!cobrarYa) return;
                        ordenes.push({
                            panel: 'ventas',
                            orden: { tipo: 'cobrar_venta', forma_pago: formaDada, recibido: args.recibido },
                        });
                        usadas.push({ herramienta: 'cobrar_venta', argumentos: { forma_pago: formaDada, recibido: args.recibido } });
                    };

                    const queFalta = cobrarYa
                        ? 'NADA. Ya va a cobrarse: NO preguntes la forma de pago, NO digas que está grabada, '
                          + 'NO digas totales ni cambios. Una línea: "Va, mira la pantalla".'
                        : (formaDada === 'EFECTIVO' ? 'preguntar con cuánto paga' : 'preguntar la forma de pago');

                    if (cotizacion) {
                        // Se comprueba AQUÍ que exista y que no esté ya facturada.
                        // Descubrirlo cuando la pantalla ya se abrió es tarde: el
                        // modelo tiene que poder corregir en la misma vuelta.
                        const { data: cot } = await supaUser
                            .from('cotizaciones')
                            .select('numero, estado, total_cotizacion, manual_cliente_nombre')
                            .eq('numero', cotizacion)
                            .maybeSingle();
                        if (!cot) {
                            salida = JSON.stringify({ ok: false, error: `No existe la cotización "${cotizacion}".` });
                        } else if (String(cot.estado || '').toLowerCase() === 'facturada') {
                            salida = JSON.stringify({ ok: false, error: `La cotización ${cotizacion} ya fue facturada.` });
                        } else {
                            ordenes.push({ panel: 'ventas', orden: { tipo: 'preparar_venta', cotizacion, ...args } });
                            encolarCobro();
                            salida = JSON.stringify({
                                ok: true, preparada: true, cobrando: cobrarYa, desde_cotizacion: cotizacion,
                                // El cliente VIAJA de vuelta para que el modelo
                                // pueda comprobar que agarró la cotización que
                                // le pidieron. Mandó la de otro cliente y no
                                // tenía cómo notarlo.
                                cliente: cot.manual_cliente_nombre || null,
                                total: cot.total_cotizacion,
                                comprueba: 'Si este cliente NO es el que te pidieron, pídele el número correcto antes de seguir.',
                                falta: queFalta,
                            });
                        }
                    } else if (!codigos.length) {
                        salida = JSON.stringify({ ok: false, error: 'No mandaste ninguna línea ni número de cotización.' });
                    } else {
                    const { data: hay } = await supaUser
                        .from('productos').select('codigo').in('codigo', codigos);
                    const existentes = new Set((hay || []).map((p: any) => p.codigo));
                    const faltan = codigos.filter((c: string) => !existentes.has(c));
                    if (faltan.length) {
                        salida = JSON.stringify({
                            ok: false,
                            error: `Estos códigos no existen: ${faltan.join(', ')}. Usa el "codigo" exacto de buscar_piezas.`,
                        });
                    } else {
                        ordenes.push({ panel: 'ventas', orden: { tipo: 'preparar_venta', ...args } });
                        encolarCobro();
                        salida = JSON.stringify({
                            ok: true,
                            preparada: true,
                            cobrando: cobrarYa,
                            lineas: codigos.length,
                            falta: queFalta,
                        });
                    }
                    }
                } else if (nombre === 'cobrar_venta') {
                    // Tampoco graba aquí: manda la orden y la PANTALLA pulsa
                    // F10. Lo que sí se hace aquí es negarse a cobrar en
                    // efectivo sin saber con cuánto pagan — si no, la pantalla
                    // rebota con "monto insuficiente" y el agente ya habría
                    // dicho que la factura está hecha.
                    const forma = String(args.forma_pago || '').toUpperCase();
                    if (!['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CHEQUE'].includes(forma)) {
                        salida = JSON.stringify({ ok: false, error: 'Falta la forma de pago.' });
                    } else if (forma === 'EFECTIVO' && !(Number(args.recibido) > 0)) {
                        salida = JSON.stringify({
                            ok: false,
                            error: 'En efectivo hace falta saber con cuánto pagan. Pregúntalo y vuelve a llamarme.',
                        });
                    } else {
                        ordenes.push({ panel: 'ventas', orden: { tipo: 'cobrar_venta', forma_pago: forma, recibido: args.recibido } });
                        // NO se dice "ok". Esto solo manda la orden; grabar
                        // ocurre en la pantalla y puede fallar ahí mismo por
                        // existencia, crédito o monto insuficiente.
                        //
                        // (2026-08-16) Devolvía ok:true y el modelo contestó
                        // "la factura ha sido grabada e impresa, el total es
                        // RD$177 y el cambio RD$127" — con la pantalla sin
                        // grabar y esos dos números inventados. Decir que algo
                        // pasó cuando no pasó es peor que no hacerlo.
                        salida = JSON.stringify({
                            enviada: true,
                            hecho: false,
                            instruccion:
                                'La orden va en camino a la pantalla. NO digas que la factura está hecha, '
                                + 'grabada ni impresa: eso lo confirma la pantalla, no tú. '
                                + 'NUNCA digas el total ni el cambio — no los sabes y no puedes calcularlos. '
                                + 'Di solo: "Va, mira la pantalla" o similar, en una línea.',
                        });
                    }
                } else if (nombre === 'abrir_modulo') {
                    // No se ejecuta aquí: navegar es cosa del navegador. Se le
                    // confirma al modelo para que siga y cierre la respuesta,
                    // y la pantalla la abre al recibirla.
                    const m = modulos.find((x: any) => x.id === args.modulo);
                    salida = m
                        ? JSON.stringify({ ok: true, abriendo: m.nombre })
                        : JSON.stringify({ ok: false, error: `No existe el módulo "${args.modulo}"` });
                } else if (nivelDeRiesgo(nombre) === 3) {
                    // NIVEL 3: no se ejecuta desde aquí, ni con confirmación del
                    // propio modelo. Se le dice por qué y por dónde va.
                    salida = JSON.stringify({
                        ok: false,
                        bloqueado: 'nivel_3',
                        error: `"${nombre}" es una acción de alto impacto y no se ejecuta desde el chat. ` +
                               'Propónla con proponer_accion: se muestra en pantalla con los montos y el usuario la autoriza.',
                    });
                } else {
                    // ── EL ID TIENE QUE EXISTIR (Fase 7) ────────────────
                    // Antes de tocar nada, cualquier identificador que venga
                    // del modelo se comprueba contra la base. Si se lo
                    // inventó —o es de otra empresa— la herramienta ni se
                    // llama y se le dice que lo busque por nombre.
                    //
                    // Ya pasó: sin herramienta para buscar cotización por
                    // cliente, el modelo escribió un número que existía y
                    // cotizó al cliente equivocado.
                    const TIPOS: Record<string, string> = {
                        cliente_id: 'cliente', cotizacion_id: 'cotizacion',
                        producto_id: 'producto', factura_id: 'factura',
                    };
                    let cortado: string | null = null;
                    for (const [campo, tipo] of Object.entries(TIPOS)) {
                        const val = args?.[campo];
                        if (!val || typeof val !== 'string') continue;
                        try {
                            const { data: v } = await supaUser.rpc('mcp_verificar_entidad',
                                { p_tipo: tipo, p_id: String(val) });
                            if (v && v.existe === false) {
                                cortado = JSON.stringify({
                                    ok: false, error: `El ${tipo} "${val}" no existe en esta empresa.`,
                                    que_hacer: `Búscalo por nombre con resolver_entidad(tipo="${tipo}", texto="..."). NO uses ese identificador.`,
                                });
                                break;
                            }
                        } catch { /* si la comprobación falla, manda la RLS de la tool */ }
                    }
                    if (cortado) { salida = cortado; mensajes.push({ role: 'tool', tool_call_id: c.id, content: salida }); continue; }

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
                recordarDeResultado(nombre, salida);
            }
        }

        llm.input_tokens = inTot;
        llm.output_tokens = outTot;
        // Seis decimales: a cuatro, una consulta de US$0.0006 se registraba
        // como 0.0006 y una de 0.00004 como cero. Comparar dos modelos con un
        // medidor que redondea a cero no compara nada.
        llm.cost_usd = Number(costTot.toFixed(6));
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

        // Touch session updated_at + la memoria corta.
        // Se recorta a lo que cabe en una tarea: si creciera sin freno, en la
        // pregunta veinte viajaría el recuerdo de la primera y el modelo se
        // agarraría de lo viejo.
        const CAMPOS_MEMORIA = [
            'cliente_id', 'cliente_nombre', 'cotizacion_id', 'cotizacion_numero',
            'producto_id', 'producto_nombre', 'factura_numero', 'ultima_accion',
            // La lista numerada de la última búsqueda. Sin esto en la lista
            // blanca se guardaba y se borraba en el mismo viaje, y "el número
            // dos" volvía a no apuntar a nada.
            'ultima_lista',
        ];
        const memoria = Object.fromEntries(
            Object.entries(estadoSesion || {})
                .filter(([k, v]) => CAMPOS_MEMORIA.includes(k) && v != null && v !== ''),
        );
        await supabase
            .from('ai_chat_sessions')
            .update({ updated_at: new Date().toISOString(), estado: memoria })
            .eq('id', session_id)
            .eq('tenant_id', tenant_id);

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
            // ── PARA PODER AVERIGUAR POR QUÉ FALLÓ ──────────────────
            // (Fase 12) "Jarvis se equivocó" no se arregla: hay seis capas y
            // sin esto no se sabe cuál falló. Con estas columnas se puede
            // preguntar "¿cuántas órdenes de voz fallaron por el oído esta
            // semana?" con un WHERE, y decidir con datos si hace falta subir
            // el cerebro o si el problema sigue siendo escuchar.
            fuente,
            modulo: pantalla?.panel || null,
            herramienta: usadas.length ? usadas[usadas.length - 1].herramienta : null,
            intencion: usadas.length ? usadas.map((u: any) => u.herramienta).join(' → ') : null,
            transcripcion_modelo: voz?.modelo || null,
            transcripcion_ms: voz?.ms || null,
            audio_segundos: voz?.segundos ?? null,
            metadata: {
                session_id,
                message_len: message.length,
                // La transcripción va aquí y no en columna: es texto libre del
                // usuario y no se filtra por él.
                transcripcion: voz ? message : undefined,
                // Con qué se quedó y qué había oído el navegador. Es lo que
                // permite juzgar si el oído nuevo mejoró de verdad, comparando
                // las dos versiones de la MISMA frase.
                oido_de: voz?.de || undefined,
                dictado_navegador: voz?.dictado_navegador || undefined,
                // Lo que quedó en memoria al final del turno.
                en_curso: Object.keys(memoria).length ? memoria : undefined,
                // Con cuántas llamadas al modelo se resolvió y qué consultó.
                // Sirve para ver si el gasto de una pregunta se disparó por
                // un bucle largo de herramientas.
                vueltas,
                herramientas: usadas,
                // Lo que decide si un modelo que razona sale a cuenta. Sin
                // esto, comparar gpt-4o-mini contra gpt-5.6 sería opinar.
                cached_tokens: cacheTot,
                reasoning_tokens: razonaTot,
                reasoning_effort: Deno.env.get('JARVIS_REASONING') ?? null,
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
            // Lo que hay que dejar preparado en una pantalla. Tampoco pasó
            // nada: llenar una factura no es grabarla.
            ordenes,
        });
    } catch (err: any) {
        console.error('[motoflow-ai-chat]', err);

        // El fallo se GUARDA, no solo se imprime. Los logs de esta función no
        // se pueden leer con la CLI instalada, así que un error del proveedor
        // dejaba la pantalla muda y sin rastro: ni fila, ni motivo, ni forma
        // de saber si fue el modelo, la clave o el saldo.
        try {
            if (tenantErr) {
                const sb = createClient(
                    Deno.env.get('SUPABASE_URL')!,
                    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
                );
                const { error: eLog } = await sb.from('ai_agent_runs').insert({
                    tenant_id: tenantErr,
                    user_id: userErrId,
                    agent_name: 'ai_ceo_chat',
                    agent_key: 'ai_ceo_chat',
                    model: MODEL,
                    status: 'error',
                    error_message: String(err?.message || err).slice(0, 1000),
                    // Culpa provisional, para no dejar la fila sin clasificar.
                    // Todo lo que revienta aquí es infraestructura: el modelo,
                    // el MCP o la base. Si al revisarla resulta ser otra cosa,
                    // se corrige a mano con jarvis_marcar_error().
                    error_categoria: 'BACKEND_ERROR',
                    input_tokens: 0, output_tokens: 0, cost_usd: 0,
                });
                if (eLog) console.error('[motoflow-ai-chat] no se pudo registrar el fallo:', eLog.message);
            }
        } catch (e) { console.error('[motoflow-ai-chat] registro del fallo:', e); }

        // 200 con ok:false a propósito: con 500, supabase-js devuelve el error
        // sin el cuerpo y el motivo real nunca llega a la pantalla. Quien
        // pregunta ve "no respondió" en vez de lo que dijo el proveedor.
        return json({ ok: false, error: 'unexpected', mensaje: String(err?.message || err) });
    }
});

function json(body: any, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}
