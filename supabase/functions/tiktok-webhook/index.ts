// @ts-nocheck
// MotoFlow Omni — receptor de webhooks de TikTok Business Messaging.
//
// (2026-08-27) Nace para poder ENVIAR la solicitud de acceso: el portal de
// TikTok pide una URL de callback viva antes de aprobar nada, y la verifica.
// Sin esto la solicitud no se puede ni presentar.
//
// >>> LO QUE HACE HOY, Y POR QUE NO HACE MAS <<<
// Recibe, guarda crudo y contesta 200. Nada mas, y es a proposito: TikTok no
// publica el JSON exacto de cada evento y todavia no tenemos acceso para
// verlo. Escribir ahora el mapeo a sales_messages seria adivinar la forma de
// un payload que no hemos visto nunca — y un mapeo equivocado no falla, que
// seria lo bueno: guarda mal y nadie se entera.
//
// Guardando crudo, el dia que TikTok apruebe se miran los eventos reales y
// se mapea sobre datos, no sobre suposiciones.
//
// >>> LAS DOS REGLAS DE TIKTOK <<<
//   1. Contestar 200 INMEDIATAMENTE. Si no, da la entrega por fallida y
//      reintenta con backoff hasta 72 horas. Por eso se responde antes de
//      hacer nada pesado y NUNCA se devuelve 500 por un evento malo: eso
//      solo consigue que el mismo evento vuelva durante tres dias.
//   2. Entrega "al menos una vez": el mismo evento puede llegar repetido.
//      Se desduplica por event_id con un indice unico.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  // TikTok comprueba la URL con un GET antes de dar de alta el webhook.
  if (req.method === 'GET') {
    const challenge = new URL(req.url).searchParams.get('challenge');
    return new Response(challenge || 'ok', { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  let crudo = '';
  try {
    crudo = await req.text();
  } catch {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  // Se guarda en segundo plano: la respuesta no espera a la base. Un webhook
  // que tarda es un webhook que TikTok reintenta.
  guardar(crudo, Object.fromEntries(req.headers)).catch((e) =>
    console.error('[tiktok-webhook] no se pudo guardar:', e?.message || e));

  return new Response('ok', { status: 200, headers: corsHeaders });
});

async function guardar(crudo: string, cabeceras: Record<string, string>) {
  let evento: any = null;
  try { evento = JSON.parse(crudo); } catch { /* se guarda como texto igual */ }

  // La firma viaja en la cabecera; se guarda sin verificar todavia porque el
  // secreto lo entrega TikTok al aprobar la app. Guardarla desde el primer
  // dia permite comprobar el esquema real cuando llegue, en vez de confiar.
  const firma = cabeceras['tiktok-signature'] || cabeceras['x-tiktok-signature'] || null;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { error } = await supabase.from('tiktok_webhook_eventos').insert({
    event_id: evento?.event_id || evento?.event?.event_id || null,
    tipo: evento?.event || evento?.event_type || null,
    payload: evento ?? { texto_sin_parsear: crudo },
    firma,
  });

  // 23505 = el mismo evento ya estaba. Es lo esperado con entrega "al menos
  // una vez", no un fallo.
  if (error && error.code !== '23505') throw error;
}
