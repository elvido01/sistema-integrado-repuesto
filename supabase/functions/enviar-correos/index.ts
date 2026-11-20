// ============================================================
// enviar-correos — vacía la cola correos_pendientes por Resend
// ============================================================
// (20/11/2026) Fase 5: el aviso del día 5 sin uso y el de la pausa también
// por correo (sql/correos_avisos.sql). La llama el cron cada 10 minutos.
// Solo manda lo que la base dejó en la cola: llamarla de más no hace daño.
//   * Toma hasta 25 correos pendientes; cada uno se "reserva" (estado
//     enviando) antes de mandarlo, así dos llamadas a la vez no lo duplican.
//   * Remitente: CORREO_AVISOS_FROM o "MotoFlow <avisos@motoflow.com.do>".
//   * Falla → vuelve a pendiente hasta 5 intentos; después queda en error.
// ============================================================
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);
  const clave = Deno.env.get('RESEND_API_KEY');
  if (!clave) return json({ ok: false, error: 'sin RESEND_API_KEY' }, 503);
  const from = Deno.env.get('CORREO_AVISOS_FROM') || 'MotoFlow <avisos@motoflow.com.do>';

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: cola, error } = await sb.from('correos_pendientes')
    .select('id, para, asunto, html, intentos')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true })
    .limit(25);
  if (error) return json({ ok: false, error: error.message }, 500);

  let enviados = 0, fallidos = 0;
  for (const c of cola || []) {
    // Reservar: solo si sigue pendiente (otra llamada no lo tomó).
    const { data: tomado } = await sb.from('correos_pendientes')
      .update({ estado: 'enviando' }).eq('id', c.id).eq('estado', 'pendiente').select('id');
    if (!tomado?.length) continue;

    let ok = false, detalle = '';
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [c.para], subject: c.asunto, html: c.html }),
      });
      const j = await r.json().catch(() => ({}));
      ok = r.ok;
      if (!ok) detalle = `${r.status} ${j?.message || j?.name || ''}`.trim();
    } catch (e) {
      detalle = String(e?.message || e);
    }

    const intentos = (c.intentos || 0) + 1;
    if (ok) {
      enviados++;
      await sb.from('correos_pendientes').update({ estado: 'enviado', enviado_at: new Date().toISOString(), intentos, error: null }).eq('id', c.id).select('id');
    } else {
      fallidos++;
      await sb.from('correos_pendientes')
        .update({ estado: intentos >= 5 ? 'error' : 'pendiente', intentos, error: detalle.slice(0, 500) }).eq('id', c.id).select('id');
    }
  }
  return json({ ok: true, enviados, fallidos });
});
