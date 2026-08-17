// ============================================================
// jarvis-transcribir — el oído de Jarvis
// ============================================================
// (2026-08-17) Hasta hoy la nota de voz la transcribía el NAVEGADOR, con
// window.SpeechRecognition. Funcionaba, pero:
//   · partía las palabras   — "autorízalo" llegaba como "autoriza lo"
//   · no sabe del oficio    — "Pruss 200" salía "prusia 200", "millero"
//                             salía "mi yerno"
//   · solo Chrome           — Safari y el móvil se quedaban fuera
//   · dependía del equipo   — el mismo audio se oía distinto en cada PC
//
// Nada de eso se arregla con un cerebro más caro: Jarvis no razonaba mal,
// estaba OYENDO mal. Esto separa oír de entender, que era el encargo.
//
//   Audio ──► [ESTA FUNCIÓN + glosario] ──► texto ──► motoflow-ai-chat
//
// >>> EL GLOSARIO ES LA MITAD DEL TRABAJO <<<
// El cliente manda `glosario`: un texto corto armado con lo que hay en
// pantalla AHORA (src/lib/glosarioVoz.js). Decirle al modelo que existe un
// cliente llamado Sander y una cotización CT-000097 ANTES de escuchar es lo
// que hace que las escriba bien. Va por el parámetro `prompt`, que tiene un
// tope de ~224 tokens: por eso el glosario se corta por presupuesto en el
// cliente y aquí se recorta otra vez por seguridad.
//
// >>> LO QUE ESTA FUNCION NO HACE <<<
// No razona, no llama herramientas, no toca datos del negocio. Devuelve
// texto. Si mañana se cambia por una sesión de voz en tiempo real, lo que
// va después (contexto, entidades, tools, seguridad, logs) no se entera.
//
// POST /functions/v1/jarvis-transcribir
// Body (JSON): { audio_base64, mime?, glosario?, idioma?, segundos? }
// Resp:        { ok, texto, modelo, ms, segundos }
// ============================================================

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// El modelo NO se fija aquí. Orden de mando:
//   1. equipo_agentes.modelo_transcripcion  (por empresa, es un UPDATE)
//   2. JARVIS_TRANSCRIPTION_MODEL           (por entorno, es un secret)
//   3. este respaldo                        (para que nunca quede mudo)
const MODELO_RESPALDO = Deno.env.get('JARVIS_TRANSCRIPTION_MODEL')
    ?? 'gpt-4o-mini-transcribe';

// Tope de audio. Una nota de voz de un vendedor son segundos, no minutos:
// si llega algo mucho mayor es un error o un abuso, y el STT se cobra por
// minuto. 25 MB es el límite de la API; aquí se corta muy por debajo.
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_GLOSARIO = 900;   // chars; ~224 tokens con margen

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const arranque = Date.now();
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';

    try {
        // ── Quién llama ────────────────────────────────────────────
        // Mismo patrón que motoflow-ai-chat: sin sesión válida no se
        // transcribe. La clave del proveedor vive solo aquí; el navegador
        // nunca la ve ni la necesita.
        const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
        if (!token) return json({ ok: false, error: 'sin_token' }, 401);

        const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData?.user) return json({ ok: false, error: 'token_invalido' }, 401);
        const user = userData.user;

        const { data: profile } = await supabase
            .from('profiles').select('tenant_id').eq('id', user.id).maybeSingle();
        if (!profile?.tenant_id) return json({ ok: false, error: 'sin_tenant' }, 403);
        const tenant_id = profile.tenant_id;

        if (!OPENAI_KEY) return json({ ok: false, error: 'sin_clave_proveedor' }, 503);

        // ── El audio ───────────────────────────────────────────────
        const body = await req.json();
        const b64 = String(body?.audio_base64 || '');
        if (!b64) return json({ ok: false, error: 'sin_audio' }, 400);

        let bytes: Uint8Array;
        try {
            const limpio = b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64;
            const bin = atob(limpio);
            bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        } catch {
            return json({ ok: false, error: 'audio_ilegible' }, 400);
        }
        if (!bytes.length) return json({ ok: false, error: 'audio_vacio' }, 400);
        if (bytes.length > MAX_BYTES) return json({ ok: false, error: 'audio_muy_largo' }, 413);

        const mime = String(body?.mime || 'audio/webm');
        // El nombre importa: la API elige el decodificador por la extensión.
        const ext = mime.includes('mp4') ? 'mp4'
            : mime.includes('mpeg') ? 'mp3'
            : mime.includes('ogg') ? 'ogg'
            : mime.includes('wav') ? 'wav'
            : 'webm';

        // ── Con qué modelo se oye ──────────────────────────────────
        // De la fila del agente, para que cambiarlo sea un UPDATE. Si la
        // tabla no está o la fila no existe, se sigue con el respaldo: un
        // fallo de configuración no puede dejar sordo a Jarvis.
        let modelo = MODELO_RESPALDO;
        try {
            const { data: ag } = await supabase
                .from('equipo_agentes')
                .select('modelo_transcripcion')
                .eq('tenant_id', tenant_id)
                .eq('clave', 'jarvis')
                .maybeSingle();
            if (ag?.modelo_transcripcion) modelo = ag.modelo_transcripcion;
        } catch { /* se queda el respaldo */ }

        // ── El glosario ────────────────────────────────────────────
        // Llega del cliente porque es quien sabe qué hay en pantalla. Se
        // recorta igual: lo que manda el navegador no se cree a ciegas.
        const glosario = String(body?.glosario || '').slice(0, MAX_GLOSARIO);
        const idioma = String(body?.idioma || 'es').slice(0, 5);

        const forma = new FormData();
        forma.append('file', new File([bytes], `nota.${ext}`, { type: mime }));
        forma.append('model', modelo);
        forma.append('language', idioma);
        if (glosario) forma.append('prompt', glosario);
        // Texto plano: no hacen falta marcas de tiempo para una orden hablada,
        // y pedirlas cuesta más tokens de salida.
        forma.append('response_format', 'text');

        const t0 = Date.now();
        const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${OPENAI_KEY}` },
            body: forma,
        });
        const ms = Date.now() - t0;

        if (!r.ok) {
            const detalle = (await r.text()).slice(0, 300);
            console.error('[jarvis-transcribir] proveedor', r.status, detalle);
            // El detalle NO viaja al navegador: puede traer eco de la
            // petición. El usuario recibe algo accionable y ya.
            return json({
                ok: false,
                error: 'transcripcion_fallo',
                mensaje: 'No pude entender bien la nota de voz. Intenta enviarla nuevamente.',
            }, 502);
        }

        const texto = (await r.text()).trim();
        if (!texto) {
            return json({
                ok: false,
                error: 'audio_sin_habla',
                mensaje: 'No se escuchó nada en la nota de voz. Intenta enviarla nuevamente.',
            }, 422);
        }

        return json({
            ok: true,
            texto,
            modelo,
            ms,
            total_ms: Date.now() - arranque,
            segundos: Number(body?.segundos) || null,
        });
    } catch (e) {
        console.error('[jarvis-transcribir]', e?.message || e);
        return json({
            ok: false,
            error: 'error_interno',
            mensaje: 'No pude entender bien la nota de voz. Intenta enviarla nuevamente.',
        }, 500);
    }
});
