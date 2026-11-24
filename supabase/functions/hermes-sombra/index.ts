// ============================================================
// hermes-sombra — Hermes propone solo cada respuesta (sin enviar) y se mide
// ------------------------------------------------------------
// (22/11/2026) La llama pg_cron cada minuto de 7 am a 9 pm (hermes_sombra_llamar).
// Dos pasos por vuelta:
//
//  1. PROPONER. hermes_sombra_pendientes() da las preguntas de clientes que
//     el espejo copió hace más de 60 s y aún no tienen propuesta. Por cada
//     una se abre sesión como el usuario "Hermes" de esa empresa
//     (hermes_sombra_config) y se llama a hermes-sugerir en modo sombra.
//     Con SU sesión, no con service_role: todo lo que Hermes consulta sigue
//     limitado a su empresa por get_user_tenant(), como si fuera un vendedor.
//     La sesión sale de un enlace mágico que se genera y se verifica aquí
//     mismo: no se envía ningún correo ni se guarda ninguna contraseña.
//
//  2. JUZGAR. hermes_sombra_por_evaluar() da las que la tienda ya contestó.
//     gpt-4o-mini compara lo que Hermes habría dicho con lo que se dijo y
//     anota veredicto, si el dato (precio/existencia/pieza) coincide, quién
//     lo hizo mejor y la lección. Las que la tienda hizo mejor vuelven a
//     hermes-sugerir como ejemplos de corrección.
//
// NUNCA envía nada a un cliente. Llamarla de más no hace daño: cada pregunta
// se propone una vez (2 intentos si falla) y se juzga una vez.
// ============================================================

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const URL_BASE = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const MODELO_JUEZ = 'gpt-4o-mini';
const TOPE_MS = 110_000;          // dejar margen al límite de la función
const POR_VUELTA = 4;             // propuestas por minuto (cada una usa el MCP)

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  const t0 = Date.now();
  const admin = createClient(URL_BASE, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
  const out = { ok: true, propuestas: 0, no_contestar: 0, errores: [] as string[], juzgadas: 0 };

  // 1) PROPONER ------------------------------------------------------------
  const { data: pend, error: ep } = await admin.rpc('hermes_sombra_pendientes', { p_limite: POR_VUELTA });
  if (ep) return json({ ok: false, error: `pendientes: ${ep.message}` }, 500);

  const sesiones = new Map<string, string>();
  for (const p of pend || []) {
    if (Date.now() - t0 > TOPE_MS / 2) break;
    try {
      let token = sesiones.get(p.user_id);
      if (!token) { token = await sesionDe(admin, p.user_id); sesiones.set(p.user_id, token); }
      const r = await fetch(`${URL_BASE}/functions/v1/hermes-sugerir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: ANON },
        body: JSON.stringify({ conversation_id: p.conversation_id, hasta_message_id: p.message_id, sombra: true }),
      });
      const j = await r.json().catch(() => null);
      if (!j?.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      if (j.no_responder) out.no_contestar++; else out.propuestas++;
    } catch (e) {
      const msg = String(e?.message || e).slice(0, 300);
      out.errores.push(msg);
      // (22/11/2026) Sin crédito en OpenAI no es culpa de la pregunta: no se
      // gasta su intento y se para la vuelta. Al recargar, se retoma lo que
      // haya entrado en las últimas 6 h.
      if (/no credits|insufficient_quota|OpenAI 429|Gemini 429|RESOURCE_EXHAUSTED|rate limit/i.test(msg)) { out.ok = false; break; }
      await admin.rpc('hermes_sombra_marcar_error', { p_message_id: p.message_id, p_error: msg });
    }
  }

  // 2) JUZGAR --------------------------------------------------------------
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (apiKey && out.ok && Date.now() - t0 < TOPE_MS / 2) {
    const { data: porJuzgar } = await admin.rpc('hermes_sombra_por_evaluar', { p_limite: 8 });
    for (const x of porJuzgar || []) {
      if (Date.now() - t0 > TOPE_MS) break;
      try {
        const ev = await juzgar(apiKey, x);
        await admin.rpc('hermes_sombra_guardar_evaluacion', { p_id: x.id, p_eval: ev });
        out.juzgadas++;
      } catch (e) {
        out.errores.push(`juez: ${String(e?.message || e).slice(0, 200)}`);
      }
    }
  }

  return json(out);
});

// Sesión del usuario Hermes sin contraseña: enlace mágico generado y
// verificado aquí (no sale ningún correo).
async function sesionDe(admin: any, userId: string): Promise<string> {
  const { data: u, error: eu } = await admin.auth.admin.getUserById(userId);
  if (eu || !u?.user?.email) throw new Error(`usuario Hermes: ${eu?.message || 'sin correo'}`);
  const { data: link, error: el } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u.user.email });
  if (el || !link?.properties?.hashed_token) throw new Error(`enlace: ${el?.message || 'sin token'}`);
  const publico = createClient(URL_BASE, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: s, error: es } = await publico.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (es || !s?.session?.access_token) throw new Error(`sesión: ${es?.message || 'sin sesión'}`);
  return s.session.access_token;
}

const ESQUEMA = {
  name: 'evaluacion',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['veredicto', 'mismo_dato', 'quien_mejor', 'error_de_hermes', 'leccion'],
    properties: {
      veredicto: { type: 'string', enum: ['igual', 'parecida', 'distinta', 'no_comparable'] },
      mismo_dato: { type: 'string', enum: ['si', 'no', 'no_aplica'] },
      quien_mejor: { type: 'string', enum: ['hermes', 'humano', 'igual'] },
      error_de_hermes: { type: 'string' },
      leccion: { type: 'string' },
    },
  },
};

async function juzgar(apiKey: string, x: any) {
  const sistema = [
    'Eres el supervisor de ventas de una tienda de repuestos de motos en República Dominicana.',
    'Comparas lo que HERMES (un asistente de IA) habría contestado a un cliente con lo que la TIENDA contestó de verdad.',
    'La respuesta de la tienda es la referencia: ella conoce al cliente y el negocio.',
    'veredicto:',
    '- igual: dicen lo mismo (mismo dato y misma intención), aunque con otras palabras.',
    '- parecida: misma intención, con alguna diferencia menor (falta un detalle, tono distinto).',
    '- distinta: dato distinto (precio, existencia, pieza), o una contesta algo que la otra no.',
    '- no_comparable: la respuesta de la tienda no contesta esa pregunta (es un saludo, un "ok", habla de otra cosa o claramente respondió a otro mensaje).',
    'mismo_dato: "si"/"no" si alguna de las dos da precio, existencia o pieza; "no_aplica" si ninguna da un dato.',
    'quien_mejor: "hermes" solo si la respuesta de Hermes es claramente mejor para vender (más clara, correcta y útil); "humano" si la de la tienda es mejor; "igual" si da lo mismo.',
    'error_de_hermes: qué hizo mal Hermes en una frase corta, o "" si nada.',
    'leccion: si Hermes se equivocó, UNA regla corta en imperativo para que no vuelva a pasar (ej.: "Si preguntan por envío, di que se envía por Caribe Tours"). "" si no hay lección. No inventes reglas que no se deduzcan de la respuesta de la tienda.',
  ].join('\n');
  const usuario = [
    `PREGUNTA DEL CLIENTE:\n${x.pregunta || '(sin texto)'}`,
    `HERMES HABRÍA DICHO:\n${x.sombra}`,
    `LA TIENDA CONTESTÓ:\n${x.humano}`,
    Array.isArray(x.piezas) && x.piezas.length
      ? `PIEZAS QUE HERMES CONSULTÓ EN EL INVENTARIO:\n${JSON.stringify(x.piezas).slice(0, 1500)}` : '',
  ].filter(Boolean).join('\n\n');

  const cuerpo = {
    temperature: 0,
    response_format: { type: 'json_schema', json_schema: ESQUEMA },
    messages: [{ role: 'system', content: sistema }, { role: 'user', content: usuario }],
  };
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODELO_JUEZ, ...cuerpo }),
  });
  const j = await r.json().catch(() => null);
  if (r.ok) return { ...JSON.parse(j.choices[0].message.content), modelo: MODELO_JUEZ };

  // (24/11/2026) Sin saldo en OpenAI, el juez sigue con Gemini (igual que hermes-sugerir).
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  const detalle = JSON.stringify(j ?? {});
  if (!geminiKey || !(r.status === 429 || r.status >= 500 || /insufficient_quota|no credits|billing/i.test(detalle))) {
    throw new Error(j?.error?.message || `OpenAI ${r.status}`);
  }
  const g = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${geminiKey}` },
    body: JSON.stringify({ model: 'gemini-2.5-flash', reasoning_effort: 'none', ...cuerpo }),
  });
  const gj = await g.json().catch(() => null);
  if (!g.ok) throw new Error(`Gemini ${g.status}: ${JSON.stringify(gj ?? {}).slice(0, 200)}`);
  return { ...JSON.parse(gj.choices[0].message.content), modelo: 'gemini-2.5-flash' };
}
