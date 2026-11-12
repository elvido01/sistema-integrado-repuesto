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
  // (20/10/2026) Los casos del CRM: algo que tiene que decidir una persona
  // (sql/crm_casos.sql). Misma vuelta, mismo bot.
  let casos = 0;
  const { data: cs } = await supabase.rpc('crm_casos_tomar_avisos');
  for (const k of cs || []) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: textoCaso(k), disable_web_page_preview: true }),
    }).catch(() => null);
    if (r?.ok) { casos++; continue; }
    fallidos++;
    console.error('[omni-avisos-ventana] telegram caso', r?.status);
    await supabase.rpc('crm_casos_soltar_aviso', { p_caso_id: k.id });
  }
  // (12/11/2026) "Dónde se te caen las ventas" (sql/crm_reporte_embudo.sql):
  // los lunes el de la semana pasada y el día 1 el del mes pasado, una vez.
  // Si la función no existe todavía (SQL sin correr), se salta sin romper.
  let reportes = 0;
  const { data: rs, error: eRs } = await supabase.rpc('crm_reporte_tomar');
  if (eRs) console.error('[omni-avisos-ventana] reporte', eRs.message);
  for (const rp of rs || []) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: textoReporte(rp), disable_web_page_preview: true }),
    }).catch(() => null);
    if (r?.ok) { reportes++; continue; }
    fallidos++;
    console.error('[omni-avisos-ventana] telegram reporte', r?.status);
    await supabase.rpc('crm_reporte_soltar', { p_tenant: rp.tenant_id, p_periodo: rp.periodo, p_desde: rp.desde });
  }
  return json({ ok: true, enviados, casos, reportes, fallidos });
});

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((100 * a) / b)}%` : '—');
function minutos(m: any) {
  if (m == null) return '—';
  const n = Number(m);
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} días`;
}
function compara(act: number, ant: number) {
  if (ant == null || ant === 0) return '';
  const d = act - ant;
  return d === 0 ? ' (igual que antes)' : ` (${d > 0 ? '+' : ''}${d} vs. antes)`;
}

function textoReporte(rp: any) {
  const a = rp.actual || {}, b = rp.anterior || {};
  const titulo = rp.periodo === 'mes' ? 'Tu mes en el CRM' : 'Tu semana en el CRM';
  if (!a.llegaron) return `📊 ${titulo} · ${rp.empresa}
No escribió ningún cliente en el período.`;
  const lineas = [
    `📊 ${titulo} · ${rp.empresa}`,
    '',
    `Escribieron ${a.llegaron}${compara(a.llegaron, b.llegaron)}`,
    `› Contestados ${a.contestadas} (${pct(a.contestadas, a.llegaron)})`,
    `› Pidieron una pieza ${a.preguntaron}`,
    `› Les dimos precio ${a.cotizados} (${pct(a.cotizados, a.preguntaron)})`,
    `› Compraron ${a.ganados} (${pct(a.ganados, a.cotizados)} de los que tenían precio)${compara(a.ganados, b.ganados)}`,
  ];
  if (a.paso_flojo) {
    const f = a.paso_flojo;
    const consejo = f.paso === 'contestar' ? 'hay clientes que nadie atendió: revisa el filtro "Sin responder".'
      : f.paso === 'precio' ? 'piden la pieza y no les llega el precio: contesta con precio en el primer mensaje.'
      : 'tienen precio y no compran: dales seguimiento a los "Cotizados" del Embudo.';
    lineas.push('', `🔻 Donde más se cae: ${f.nombre.toLowerCase()} (${f.pasaron} de ${f.base}, ${f.pct}%) — ${consejo}`);
  }
  lineas.push('', `⏱ Primera respuesta: la mitad en ${minutos(a.mediana_min)}` +
    (a.medidas_resp ? `, ${pct(a.en_15min, a.medidas_resp)} en 15 min o menos` : '') +
    (a.mediana_min_ig != null ? `. Instagram/Messenger: ${minutos(a.mediana_min_ig)}` : '') + '.');
  if (a.sin_contestar) lineas.push(`⏳ ${a.sin_contestar} escribieron en las últimas 48 h y esperan respuesta.`);
  if (a.no_lo_tenemos) {
    const piezas = (a.piezas_no_tenemos || []).join(', ');
    lineas.push(`📦 ${a.no_lo_tenemos} se fueron porque no teníamos la pieza${piezas ? `: ${piezas}` : ''}.`);
  }
  if (a.dijeron_cuando) lineas.push(`📅 ${a.dijeron_cuando} dijeron para cuándo la necesitan (${a.para_hoy} para hoy).`);
  lineas.push('', 'Detalle en Sales Hub → Embudo.');
  return lineas.join(String.fromCharCode(10));
}

const MOTIVO = {
  no_lo_tenemos: '📦 Pieza que no hay',
  reclamo: '⚠️ Reclamo',
  precio_especial: '💲 Pide precio especial',
  listo_para_comprar: '🛒 Quiere comprar',
  duda_tecnica: '🔧 Duda técnica',
  otro: '🧩 Para decidir',
};
const CANAL = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Messenger', tiktok: 'TikTok' };

function textoCaso(k: any) {
  return `${MOTIVO[k.motivo] || MOTIVO.otro} · ${CANAL[k.plataforma] || k.plataforma} · ${k.cliente}` +
    (k.quiere ? `\n• Quiere: ${k.quiere}` : '') +
    (k.se_le_dijo ? `\n• Se le dijo: ${k.se_le_dijo}` : '') +
    (k.falta ? `\n• Falta: ${k.falta}` : '') +
    '\n\nSe cierra solo cuando le contestes.';
}

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
