// ============================================================
// equipo-nube - el atendedor de los agentes que no viven en tu PC
// ============================================================
// (2026-08-13) "ni Jarvis ni el Comercial pueden depender de que mi PC
// este encendida para que funcionen".
//
// Antes esto lo hacia scripts/equipo-worker.mjs en una maquina de
// escritorio, y para eso pedia una SEGUNDA copia de la clave de OpenAI.
// La clave ya estaba en Supabase como secreto de las Edge Functions:
// se estaba duplicando un secreto para hacer lo mismo, y de paso se
// ataba el negocio a que un escritorio estuviera encendido.
//
// Aqui la clave no se pide ni se pasa: ya esta en el entorno. Nadie la
// escribe, nadie la copia, y no sale de Supabase.
//
// >>> LO QUE ESTA FUNCION NO HACE <<<
// No atiende al Comercial-Creativo. Ese corre con la SUSCRIPCION de
// Claude, que se autentica contra una maquina con sesion iniciada y no
// contra una clave. Quien decide quien se atiende aqui es la base
// (equipo_agentes.ejecuta_en), no esta lista.
//
// Tampoco atiende a Hermes, aunque figure como agente de nube: Hermes
// tiene su propio proceso con herramientas de verdad. Contestarle desde
// aqui con una llamada suelta a un modelo seria quitarle trabajo que el
// hace mejor.
//
// Invocacion:
//   POST /functions/v1/equipo-nube
//   Headers: Authorization Bearer <anon key> + x-cron-secret
//   Body opcional: { agente?: string, max?: number }
// ============================================================

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Una Edge Function no vive para siempre. Se para sola antes del limite
// de la plataforma para poder CONTESTAR que quedo trabajo pendiente, en
// vez de morirse a media faena y dejar mensajes reclamados sin respuesta
// hasta que venza el arrendamiento.
const PRESUPUESTO_MS = 50_000;
const MAX_POR_VUELTA = 5;

// ------------------------------------------------------------
// LOS PROMPTS
// ------------------------------------------------------------
// Portados tal cual del worker de la PC. Si divergen, el mismo agente
// contesta distinto segun quien lo atienda, que es la peor clase de
// error: no falla, solo empeora sin avisar.

// Jarvis NO busca: busca el SQL, y el modelo solo ordena y redacta lo
// que salio. "Nunca inventes un precio" escrito en un prompt es una
// peticion; esto es una garantia. Si la consulta no devuelve nada, no
// hay de donde inventar.
const promptJarvis = (cfg, msg, filas) => [
  cfg.persona || 'Eres el especialista de datos de MotoFlow. Devuelves datos verificables, no opiniones.',
  '',
  '## Lo que te pide Hermes',
  msg.summary,
  '',
  '## Lo que devolvio el catalogo AHORA MISMO',
  'Salio de hermes.buscar_producto sobre la base de MotoFlow, en este instante.',
  'Es lo UNICO que existe. No agregues productos, precios ni existencias que no esten aqui.',
  '```json', JSON.stringify(filas, null, 1), '```',
  '',
  '## Como contestar',
  filas.length
    ? 'Devuelve SOLO un JSON: {"resumen":"una linea","productos":[...],"fuente":"hermes.buscar_producto","nota":"..."}. '
      + 'En "productos" copia las filas tal cual, sin cambiar un numero.'
    : 'El catalogo no devolvio nada. Devuelve SOLO: {"resumen":"sin resultados","productos":[],'
      + '"fuente":"hermes.buscar_producto","nota":"que se busco y por que no hubo resultados"}.',
].join('\n');

// Las politicas se le enseñan como reglas, no se le piden por favor. Y
// los datos van marcados como verificados: es lo unico que puede citar.
const promptCreativo = (cfg, msg) => {
  const p = cfg.politicas || {};
  const reglas = [
    p.solo_productos_activos && 'Solo productos activos.',
    p.nunca_inventar_precio_ni_existencia
      && 'NUNCA inventes precio ni existencia. Si un dato no viene abajo, dilo y no lo rellenes.',
    p.promocion_diaria_max_productos
      && `Maximo ${p.promocion_diaria_max_productos} productos por promocion.`,
    p.promocion_un_producto_mayor_a
      && `Prioriza un producto de mas de RD$${p.promocion_un_producto_mayor_a} y otro de mas de RD$${p.promocion_otro_producto_mayor_a}.`,
    p.preferir_promocionables_que_necesitan_empuje && 'Prefiere lo que necesita empuje, no lo que ya sale solo.',
    Array.isArray(p.no_promover_como_principal) && p.no_promover_como_principal.length
      && `No uses como producto principal: ${p.no_promover_como_principal.join(', ')}.`,
    p.no_repetir_propuestos_dias
      && `No repitas productos propuestos en los ultimos ${p.no_repetir_propuestos_dias} dias si hay alternativa.`,
    p.publicar_codigo_interno === false && 'No publiques el codigo interno salvo que te lo pidan.',
    p.exigir_foto_real && 'Exige foto real del producto. Si falta, avisalo como advertencia.',
    p.respetar_zona_segura_9_16 && 'En historias 9:16 respeta la zona segura: nada de texto cortado en los bordes.',
    'No publicas ni envias nada. Entregas un borrador para que lo revisen.',
  ].filter(Boolean);

  const datos = msg.payload && Object.keys(msg.payload).length
    ? JSON.stringify(msg.payload, null, 1)
    : '(no llegaron datos verificados)';

  return [
    cfg.persona || 'Preparas contenido comercial para una tienda de repuestos.',
    '',
    '## Reglas de la empresa',
    ...reglas.map((r) => `- ${r}`),
    '',
    '## Lo que te pide Hermes',
    msg.summary,
    '',
    '## Datos VERIFICADOS por Jarvis',
    'Esto salio de la base de MotoFlow. Es lo unico que puedes citar como precio o existencia.',
    '```json', datos, '```',
    '',
    '## Como contestar',
    'Devuelve SOLO un JSON con esta forma, sin texto alrededor:',
    '{"resumen":"una linea","propuesta":"...","copy":{"whatsapp":"...","instagram":"...","facebook":"..."},',
    ' "canal_sugerido":"...","requerimientos_visuales":["..."],"advertencias":["..."],"estado":"borrador"}',
  ].join('\n');
};

// ------------------------------------------------------------
// EL MOTOR
// ------------------------------------------------------------
// La clave sale del entorno de Supabase y no se registra en ningun
// sitio: ni en el log, ni en el error, ni en la respuesta.
const pensar = async (cfg, prompt) => {
  if (cfg.proveedor === 'claude') {
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) throw new Error('Este agente esta configurado con el motor "claude" pero falta ANTHROPIC_API_KEY en los secretos.');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.modelo || 'claude-haiku-4-5-20251001',
        max_tokens: cfg.max_tokens || 800,
        temperature: Number(cfg.temperatura ?? 0.6),
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const d = await r.json();
    return (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  }

  if (cfg.proveedor !== 'openai') {
    // claude_suscripcion cae aqui. No es un fallo del agente: es que
    // este sitio no puede atenderlo, y hay que decirlo con esas palabras
    // para que nadie pierda la tarde buscando una clave que no existe.
    throw new Error(
      `El motor "${cfg.proveedor}" no se puede atender desde la nube. `
      + 'La suscripcion se autentica contra una maquina con sesion iniciada, no con una clave. '
      + 'Cambia el motor desde la pantalla Equipo IA o atiendelo con un worker.');
  }

  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) throw new Error('Falta OPENAI_API_KEY en los secretos de las Edge Functions.');
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.modelo || 'gpt-4o-mini',
      max_tokens: cfg.max_tokens || 800,
      temperature: Number(cfg.temperatura ?? 0.6),
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  return d.choices?.[0]?.message?.content || '';
};

// El modelo devuelve texto, a veces con la valla de markdown alrededor.
// Si no es JSON valido no se descarta: se entrega como texto y se marca.
// Que el borrador llegue mal formado es un problema; que se pierda, dos.
const leerRespuesta = (texto) => {
  const limpio = String(texto || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return { ok: true, datos: JSON.parse(limpio) }; }
  catch {
    return { ok: false, datos: { resumen: limpio.slice(0, 200), texto: limpio, estado: 'borrador', formato: 'texto_libre' } };
  }
};

// ------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  // Falla cerrado: sin secreto configurado no se atiende a nadie. Una
  // funcion que toma trabajo y contesta por un agente no puede quedar
  // abierta porque a alguien se le olvido poner una variable.
  const secreto = Deno.env.get('EQUIPO_NUBE_SECRET');
  if (!secreto) return json({ error: 'Falta EQUIPO_NUBE_SECRET en los secretos.' }, 500);
  if (req.headers.get('x-cron-secret') !== secreto) return json({ error: 'No autorizado.' }, 401);

  const sb = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const rpc = async (fn: string, args: Record<string, unknown> = {}) => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  };

  const inicio = Date.now();
  let cuerpo: Record<string, unknown> = {};
  try { cuerpo = await req.json(); } catch { /* sin cuerpo, todo por defecto */ }

  try {
    const agentes: string[] = cuerpo.agente
      ? [String(cuerpo.agente)]
      : (await rpc('equipo_nube_agentes') ?? []);

    const tope = Math.max(1, Math.min(Number(cuerpo.max) || MAX_POR_VUELTA, MAX_POR_VUELTA));
    const hechos: unknown[] = [];
    let quedaTrabajo = false;

    for (const agente of agentes) {
      // El latido antes de tomar: la pantalla del Equipo IA dice "nunca
      // ha arrancado un worker" mientras nadie late, y un agente que
      // contesta desde la nube tiene que verse vivo igual que uno de PC.
      await rpc('equipo_nube_latido', { p_agente: agente }).catch(() => {});

      while (hechos.length < tope) {
        if (Date.now() - inicio > PRESUPUESTO_MS) { quedaTrabajo = true; break; }

        const msg = await rpc('equipo_nube_tomar', { p_agente: agente });
        if (!msg) break;   // cola vacia para este agente

        const cfg = await rpc('equipo_nube_config', { p_agente: agente });

        try {
          let prompt: string;
          if (agente === 'jarvis') {
            const busca = msg.payload?.consulta || msg.payload?.texto || msg.summary;
            const filas = await rpc('equipo_nube_catalogo', { p_texto: String(busca ?? '') });
            prompt = promptJarvis(cfg, msg, filas ?? []);
          } else {
            prompt = promptCreativo(cfg, msg);
          }

          const bruto = await pensar(cfg, prompt);
          const { ok, datos } = leerRespuesta(bruto);

          const r = await rpc('equipo_nube_responder', {
            p_mensaje_id: msg.id,
            p_claim_token: msg.claim_token,
            p_resumen: String(datos.resumen || 'borrador listo').slice(0, 200),
            p_datos: { ...datos, motor: cfg.proveedor, modelo: cfg.modelo ?? null, atendido_en: 'nube' },
          });

          hechos.push({
            agente, mensaje: msg.id, ok: true,
            json: ok, abandonado: !!r?.abandonar, duplicado: !!r?.duplicado,
          });
        } catch (e) {
          // El fallo se devuelve a la cola con su claim: sin esto el
          // mensaje se queda reclamado y no lo puede tocar nadie hasta
          // que venza el arrendamiento, quince minutos despues.
          await rpc('equipo_nube_error', {
            p_mensaje_id: msg.id,
            p_claim_token: msg.claim_token,
            p_mensaje: String(e?.message ?? e).slice(0, 500),
          }).catch(() => {});
          hechos.push({ agente, mensaje: msg.id, ok: false, error: String(e?.message ?? e).slice(0, 300) });
        }
      }
    }

    if (!quedaTrabajo) {
      const p = await rpc('equipo_nube_pendientes').catch(() => 0);
      quedaTrabajo = Number(p) > 0;
    }

    return json({
      ok: true,
      agentes,
      atendidos: hechos.length,
      queda_trabajo: quedaTrabajo,   // el cron de seguridad vuelve por el resto
      ms: Date.now() - inicio,
      detalle: hechos,
    });
  } catch (e) {
    return json({ ok: false, error: String(e?.message ?? e).slice(0, 500) }, 500);
  }
});
