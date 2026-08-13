// =====================================================================
// hermes-media — la única puerta al audio privado
// ---------------------------------------------------------------------
// PostgreSQL no puede firmar URLs de Supabase Storage: las firma el
// servicio de almacenamiento. Y guardar una URL firmada en la fila del
// mensaje sería guardar una credencial con fecha de caducidad dentro de
// una tabla que lee cualquiera con permiso de lectura.
//
// Por eso el audio no viaja por la base. La base entrega un PERMISO
// —token de un solo uso, vida corta, del que solo se guarda el sha256— y
// esta función es la única que tiene la llave del bucket.
//
// >>> TRES RUTAS <<<
//   GET  /hermes-media/descargar?token=…     el audio que grabó la persona
//   POST /hermes-media/tts                    el audio que generó Hermes
//   POST /hermes-media/limpiar                retención y huérfanos
//
// >>> LO QUE NO SE HACE AQUÍ <<<
// No se transcribe y no se sintetiza. STT y TTS son de Hermes. Esta
// función mueve bytes y comprueba permisos, nada más.
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const BUCKET = 'hermes-voz';
const MAX_BYTES = 8 * 1024 * 1024;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-mensaje-id, x-claim-token, x-duration-ms, x-media-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

// Las firmas de los formatos que aceptamos. La extensión y el
// Content-Type los pone el que sube; esto mira los bytes.
//
// No es paranoia de manual: un archivo con MIME de audio y contenido de
// otra cosa llega hasta el STT de Hermes, que es quien lo abre. Que reviente
// allí, en otra máquina, es mucho peor que rechazarlo aquí.
const firmaValida = (b: Uint8Array, mime: string): boolean => {
  if (b.length < 12) return false;
  const txt = (i: number, n: number) => new TextDecoder().decode(b.slice(i, i + n));
  const base = mime.split(';')[0].trim();

  switch (base) {
    case 'audio/webm':
      return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;  // EBML
    case 'audio/ogg':
      return txt(0, 4) === 'OggS';
    case 'audio/mp4':
    case 'audio/aac':
      return txt(4, 4) === 'ftyp';
    case 'audio/wav':
    case 'audio/x-wav':
      return txt(0, 4) === 'RIFF' && txt(8, 4) === 'WAVE';
    case 'audio/mpeg':
    case 'audio/mp3':
      // ID3 al principio, o la sincronía de trama MPEG.
      return txt(0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0);
    default:
      return false;
  }
};

const sha256Hex = async (datos: ArrayBuffer): Promise<string> => {
  const h = await crypto.subtle.digest('SHA-256', datos);
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, '0')).join('');
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = new URL(req.url);
  const ruta = url.pathname.split('/').filter(Boolean).pop();

  const sb = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  try {
    // ── EL AUDIO DE LA PERSONA, PARA QUE HERMES LO OIGA ──────────────
    if (ruta === 'descargar') {
      // Se acepta por cabecera además de por query: una URL con el token
      // dentro acaba en los registros del proxy, en el historial y en
      // cualquier captura de pantalla.
      const token = req.headers.get('x-media-token') || url.searchParams.get('token') || '';
      if (!token) return json({ error: 'Falta el permiso de descarga.' }, 401);

      const { data: permiso, error } = await sb.rpc('hermes_media_canjear', { p_token: token });
      if (error) return json({ error: 'No se pudo comprobar el permiso.' }, 500);
      if (!permiso?.ok) {
        // El motivo sí se dice —vencido, agotado, desconocido— porque el
        // que reintenta necesita saber si vale la pena. Lo que no se dice
        // es qué audio era.
        return json({ error: 'Permiso no válido.', motivo: permiso?.motivo }, 403);
      }

      const { data: archivo, error: eDesc } = await sb.storage
        .from(BUCKET).download(permiso.storage_path);
      if (eDesc || !archivo) return json({ error: 'El audio no está disponible.' }, 404);

      const bytes = new Uint8Array(await archivo.arrayBuffer());
      if (!firmaValida(bytes, permiso.mime_type)) {
        return json({ error: 'El archivo no es un audio válido.', motivo: 'firma_invalida' }, 422);
      }

      // Se devuelve el archivo, no una URL. Una URL firmada que sale de
      // aquí se puede reenviar; estos bytes ya pasaron el control.
      return new Response(bytes, {
        headers: {
          ...cors,
          'Content-Type': permiso.mime_type,
          'Content-Length': String(bytes.length),
          'X-Media-Id': permiso.media_id,
          'X-Sha256': permiso.sha256,
          'X-Duration-Ms': String(permiso.duration_ms ?? ''),
          'Cache-Control': 'no-store',
        },
      });
    }

    // ── EL AUDIO DE HERMES (TTS) ─────────────────────────────────────
    if (ruta === 'tts' && req.method === 'POST') {
      const mensajeId = Number(req.headers.get('x-mensaje-id') || 0);
      const claimToken = req.headers.get('x-claim-token') || '';
      const mime = (req.headers.get('content-type') || '').split(';')[0].trim();
      const duracion = Number(req.headers.get('x-duration-ms') || 0) || null;

      if (!mensajeId || !claimToken) {
        return json({ error: 'Falta el mensaje o el claim.' }, 400);
      }

      const cuerpo = await req.arrayBuffer();
      if (cuerpo.byteLength === 0) return json({ error: 'El audio llegó vacío.' }, 400);
      if (cuerpo.byteLength > MAX_BYTES) return json({ error: 'El audio pesa demasiado.' }, 413);
      if (!firmaValida(new Uint8Array(cuerpo), mime)) {
        return json({ error: 'El archivo no es un audio válido.', motivo: 'firma_invalida' }, 422);
      }

      const sha = await sha256Hex(cuerpo);
      const ext = mime === 'audio/mpeg' || mime === 'audio/mp3' ? 'mp3'
        : mime === 'audio/wav' || mime === 'audio/x-wav' ? 'wav'
        : mime === 'audio/ogg' ? 'ogg'
        : mime === 'audio/mp4' || mime === 'audio/aac' ? 'm4a' : 'webm';

      // El tenant sale del mensaje, no de la petición: el canal de Hermes
      // está acotado a Morla y quien reclama no elige empresa.
      const tenant = '00000000-0000-0000-0000-000000000001';
      // El nombre lo pone el servidor. Nunca uno enviado por el cliente.
      const ruta_ = `${tenant}/tts/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;

      const { error: eSubir } = await sb.storage.from(BUCKET)
        .upload(ruta_, cuerpo, { contentType: mime, upsert: false });
      if (eSubir) return json({ error: 'No se pudo guardar el audio.' }, 500);

      const { data: reg, error: eReg } = await sb.rpc('hermes_media_registrar_tts', {
        p_mensaje_id: mensajeId,
        p_claim_token: claimToken,
        p_storage_path: ruta_,
        p_mime_type: mime,
        p_size_bytes: cuerpo.byteLength,
        p_duration_ms: duracion,
        p_sha256: sha,
        p_codec: null,
        p_metricas: {},
      });

      if (eReg) {
        // Se borra lo subido: un archivo sin fila es un huérfano que nadie
        // va a reclamar.
        await sb.storage.from(BUCKET).remove([ruta_]);
        return json({ error: 'No se pudo registrar el audio.' }, 500);
      }
      if (reg && reg.ok === false) {
        await sb.storage.from(BUCKET).remove([ruta_]);
        return json(reg, 409);   // claim reemplazado: el turno ya no es suyo
      }

      return json({ ok: true, media_id: reg.media_id, duplicado: reg.duplicado, sha256: sha });
    }

    // ── LIMPIEZA ─────────────────────────────────────────────────────
    if (ruta === 'limpiar' && req.method === 'POST') {
      const { data: marcados, error } = await sb.rpc('hermes_voz_limpiar', { p_dias: null });
      if (error) return json({ error: 'No se pudo marcar.' }, 500);

      // La base marca; los bytes los borra quien tiene la llave.
      const { data: filas } = await sb
        .from('hermes_media')
        .select('media_id, storage_path')
        .not('deleted_at', 'is', null)
        .limit(500);

      const rutas = (filas || []).map((f: { storage_path: string }) => f.storage_path);
      if (rutas.length) await sb.storage.from(BUCKET).remove(rutas);

      return json({ ok: true, marcados, archivos_borrados: rutas.length });
    }

    return json({ error: 'Ruta desconocida.' }, 404);
  } catch (e) {
    // El mensaje del error interno NO sale: puede llevar rutas, nombres de
    // bucket o fragmentos de consulta.
    console.error('hermes-media:', e instanceof Error ? e.message : 'error');
    return json({ error: 'Error interno.' }, 500);
  }
});
