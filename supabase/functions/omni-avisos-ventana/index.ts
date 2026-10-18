// ============================================================
// omni-avisos-ventana — "te escribieron por privado y nadie ha contestado"
// ============================================================
// (18/10/2026) Instagram y Messenger solo dejan contestar un privado dentro
// de las 24 h del último mensaje del cliente; en 30 días 10 de 13 se
// cerraron sin respuesta. Cada 5 minutos (pg_cron → omni_avisos_ventana_llamar)
// se toman los avisos que tocan (sql/omni_avisos_ventana.sql: a la hora de
// espera y cuando quedan 4 h) y Hermes se los manda al dueño por Telegram.
// Si Telegram falla, el aviso se suelta y sale en la próxima vuelta.
//
// Secretos: TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID (scripts/telegram-secretos.mjs).
// Es idempotente: llamarla de más no repite nada.
// ============================================================
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const RED = { instagram: 'Instagram', facebook: 'Messenger' };

Deno.serve(async () => {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chat = Deno.env.get('TELEGRAM_CHAT_ID');
  if (!token || !chat) return json({ ok: false, error: 'faltan TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID' }, 500);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: avisos, error } = await supabase.rpc('omni_avisos_ventana_tomar');
  if (error) return json({ ok: false, error: error.message }, 500);

  let enviados = 0, fallidos = 0;
  for (const a of avisos || []) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: texto(a), disable_web_page_preview: true }),
    }).catch(() => null);
    if (r?.ok) { enviados++; continue; }
    fallidos++;
    console.error('[omni-avisos-ventana] telegram', r?.status, r ? (await r.text()).slice(0, 200) : 'sin respuesta');
    await supabase.rpc('omni_avisos_ventana_soltar', { p_conversation_id: a.conversation_id, p_tipo: a.tipo, p_dm_at: a.dm_at });
  }
  return json({ ok: true, enviados, fallidos });
});

function texto(a: any) {
  const red = RED[a.plataforma] || a.plataforma;
  const dijo = a.texto ? `\n«${a.texto}»` : '';
  if (a.tipo === 'quedan_4h') {
    return `⚠️ ${red} · ${a.cliente} lleva ${horas(a.minutos_espera)} esperando respuesta.${dijo}\n\nQuedan ${horas(a.minutos_quedan)}: después ${red} ya no deja escribirle. Contesta desde la bandeja (filtro ⏳ Por vencer).`;
  }
  return `⏳ ${red} · ${a.cliente} te escribió hace ${horas(a.minutos_espera)} y nadie le ha contestado.${dijo}\n\nQuedan ${horas(a.minutos_quedan)} para responderle por privado.`;
}

function horas(min: number) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r && h < 10 ? `${h} h ${r} min` : `${h} h`;
}

function json(p: unknown, status = 200) {
  return new Response(JSON.stringify(p), { status, headers: { 'Content-Type': 'application/json' } });
}
