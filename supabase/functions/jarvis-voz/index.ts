// =====================================================================
// jarvis-voz — la voz de mayordomo de la esfera (23/10/2026)
// ---------------------------------------------------------------------
// La esfera hablaba con las voces de Windows (speechSynthesis): suenan a
// robot y no se les puede dar carácter. Aquí el texto se convierte en voz
// con gpt-4o-mini-tts, que acepta INSTRUCCIONES de cómo hablar: grave,
// serena, elegante, tratando de "señor" — el estilo del mayordomo de la
// película, sin copiar la voz de ningún actor.
//
// Despliegue:  node scripts/desplegar-funcion.mjs jarvis-voz
//
// Pide:   POST { texto, voz? }   con la sesión del usuario (Authorization)
// Da:     audio/mpeg  (o JSON { ok:false, error } si algo falla)
//
// El navegador NUNCA queda mudo por esto: si falla, src/lib/vozJarvis.js
// vuelve a la voz del sistema. Costo: centavos por minuto hablado.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const MODELO = Deno.env.get('JARVIS_TTS_MODEL') || 'gpt-4o-mini-tts';
const VOCES = new Set(['onyx', 'ash', 'echo', 'ballad', 'sage', 'verse', 'alloy', 'coral', 'fable', 'nova', 'shimmer']);
const VOZ_DEF = 'onyx';
// Una respuesta hablada larga es un fallo de diseño, no algo que pagar: el
// navegador parte el texto en frases y pide de a poco.
const MAX_CHARS = 1200;

const INSTRUCCIONES = [
    'Eres un mayordomo de inteligencia artificial, al estilo del asistente de una pelicula de superheroes.',
    'Voz grave, serena, elegante y segura, con un leve toque de ironia cortes.',
    'Habla en espanol neutro latinoamericano, pausado y claro, como quien tiene todo bajo control.',
    'Los numeros y montos dilos como los diria una persona.',
].join(' ');

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';

    try {
        const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
        if (!token) return json({ ok: false, error: 'sin_token' }, 401);

        const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data: u, error: ue } = await supabase.auth.getUser(token);
        if (ue || !u?.user) return json({ ok: false, error: 'token_invalido' }, 401);

        if (!OPENAI_KEY) return json({ ok: false, error: 'sin_clave_proveedor' }, 503);

        const body = await req.json().catch(() => ({}));
        const texto = String(body?.texto ?? '').trim();
        if (!texto) return json({ ok: false, error: 'sin_texto' }, 400);
        if (texto.length > MAX_CHARS) return json({ ok: false, error: 'texto_muy_largo' }, 413);
        const voz = VOCES.has(String(body?.voz)) ? String(body.voz) : VOZ_DEF;

        const t0 = Date.now();
        const r = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: MODELO, voice: voz, input: texto, instructions: INSTRUCCIONES, response_format: 'mp3' }),
        });
        if (!r.ok || !r.body) {
            const detalle = (await r.text().catch(() => '')).slice(0, 300);
            console.error('[jarvis-voz] proveedor', r.status, detalle);
            return json({ ok: false, error: 'proveedor', status: r.status }, 502);
        }
        console.log(JSON.stringify({ jarvis_voz: true, user: u.user.id, chars: texto.length, voz, ms_hasta_inicio: Date.now() - t0 }));

        // Se pasa el audio tal cual va llegando: empieza a sonar antes de que
        // el proveedor termine.
        return new Response(r.body, {
            headers: { ...corsHeaders, 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
        });
    } catch (err) {
        console.error('[jarvis-voz]', err);
        return json({ ok: false, error: 'interno' }, 500);
    }
});
