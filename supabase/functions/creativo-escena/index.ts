// ════════════════════════════════════════════════════════════════════════
//  creativo-escena — la escena de la pieza, por el puente de la casa
// ════════════════════════════════════════════════════════════════════════
//  El Comercial-Creativo (VPS) pide aquí la ESCENA de cada pieza: fondo,
//  luces, podio y el producto sacado de su foto real. Lo hace GPT Image 2
//  con el mismo motor que usa el Marketing IA (motoflow-ai-marketing/llm.ts)
//  y la misma clave, la de los secretos de Supabase. El dueño lo pidió así:
//  "utiliza esa misma ruta". El creativo no tiene ni necesita una copia.
//
//  Entrada: POST con la cabecera `x-permiso-escena`, un permiso de un solo
//  uso que le da la base al creativo (hermes.equipo_permiso_escena) y que
//  aquí se canjea. Sin permiso no se genera nada: cada imagen cuesta.
//
//  Cuerpo: { foto_url, fondo, acento, fondo_b64? }
//  Respuesta: { ok, b64, cost_usd }
//
//  Cada escena queda anotada en ai_agent_runs (agent_key comercial_creativo)
//  con su costo: se ve junto al resto del gasto de IA.
//
//  La escena va SIN TEXTO: el logo, el titular y el teléfono los escribe el
//  creativo encima (scripts/arteCreativo.mjs), porque un modelo de imagen a
//  veces escribe mal un número y en un teléfono eso no se puede permitir.
// ════════════════════════════════════════════════════════════════════════

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { generateImage } from '../motoflow-ai-marketing/llm.ts';

const MODELO = 'gpt-image-2';
const CALIDAD = 'medium';          // decisión del dueño, 28/09/2026
// Múltiplos de 16, como exige el modelo. La historia se pide ya en 9:16 para
// que componga en vertical; recortar un 2:3 después se comía los lados.
const TAM = { feed: '1024x1024', historia: '1088x1920' };
// Solo fotos de nuestro propio almacenamiento: el permiso deja pedir una
// escena, no bajar cualquier cosa de internet.
const ORIGEN_FOTOS = 'https://zdvxowpuklbypweyqqki.supabase.co/storage/';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const hex = (v: string, porDefecto: string) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : porDefecto);

// El gasto se anota SIEMPRE, y si no se puede anotar se dice. La primera
// versión mandaba status 'ok'/'error', la tabla solo admite
// completed/failed/pending/aborted (CHECK status_valido), y el insert fallaba
// callado: dos imágenes pagadas sin rastro en el registro de gasto de IA.
async function anotarGasto(sb: any, fila: Record<string, unknown>) {
  const { error } = await sb.from('ai_agent_runs').insert({
    agent_key: 'comercial_creativo',
    agent_name: 'Comercial-Creativo',
    provider: 'openai',
    run_type: 'image',
    modulo: 'equipo_ia',
    herramienta: 'creativo-escena',
    ...fila,
  });
  if (error) console.error('[creativo-escena] NO SE ANOTÓ EL GASTO:', error.message, JSON.stringify(fila));
}

function promptEscena({ vertical, fondo, acento, tieneFondo }) {
  // En el cuadrado el modelo tiende a subir el producto y el titular le
  // quedaba encima (pesita, 28/09): se le pide más aire arriba.
  const arriba = vertical ? 30 : 36;
  const abajo = vertical ? 14 : 18;
  return [
    'Professional advertising photo for a motorcycle spare parts store.',
    'Use the product from the FIRST reference image EXACTLY as it is: same shape, colors, packaging,',
    'printed labels and proportions. Do not redraw, restyle, simplify or replace the product.',
    `Place it large and centered on a glossy dark circular podium with a ${acento} rim light and soft reflections,`,
    tieneFondo
      ? 'in front of a background inspired by the SECOND reference image (same mood and colors, blurred).'
      : `in a dramatic studio scene: deep ${fondo} background with ${acento} light streaks, subtle haze,`
        + ' a blurred motorcycle silhouette far behind.',
    'Cinematic lighting, high contrast, sharp focus on the product, premium commercial look.',
    `Composition: keep the top ${arriba}% of the image as clean dark background with no objects`,
    `(a logo and a headline go there), and the bottom ${abajo}% as clean dark background (a footer goes there).`,
    vertical ? 'The product sits in the middle band.' : 'The product sits in the lower-middle part of the image.',
    'ABSOLUTELY NO TEXT anywhere: no letters, numbers, words, logos, watermarks, price tags or badges.',
    "Only the product's own original printed packaging may show its text.",
  ].join(' ');
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // ── El permiso: uno por escena, y se gasta al canjearlo ──
  const token = req.headers.get('x-permiso-escena') || '';
  const { data: permiso, error: pErr } = await sb.rpc('equipo_canjear_permiso_escena', { p_token: token });
  if (pErr || !permiso?.ok) {
    return json({ ok: false, error: permiso?.motivo || pErr?.message || 'sin_permiso' }, 403);
  }
  const formato = permiso.formato === 'historia' ? 'historia' : 'feed';

  const body = await req.json().catch(() => ({}));
  const fotoUrl = String(body?.foto_url || '');
  if (!fotoUrl.startsWith(ORIGEN_FOTOS)) {
    return json({ ok: false, error: 'La foto tiene que venir del almacenamiento de MotoFlow.' }, 400);
  }

  const t0 = Date.now();
  try {
    const rf = await fetch(fotoUrl);
    if (!rf.ok) throw new Error(`no se pudo bajar la foto del producto: HTTP ${rf.status}`);
    const foto = new Uint8Array(await rf.arrayBuffer());
    const mimeFoto = rf.headers.get('content-type') || 'image/jpeg';

    const referencias = [{ bytes: foto, mime: mimeFoto, nombre: 'producto' }];
    if (body?.fondo_b64) {
      const bin = atob(String(body.fondo_b64));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      referencias.push({ bytes, mime: 'image/png', nombre: 'fondo.png' });
    }

    const img = await generateImage({
      prompt: promptEscena({
        vertical: formato === 'historia',
        fondo: hex(body?.fondo, '#0b1e3a'),
        acento: hex(body?.acento, '#f5a623'),
        tieneFondo: !!body?.fondo_b64,
      }),
      size: TAM[formato],
      quality: CALIDAD,
      model: MODELO,
      referencias,
    });

    await anotarGasto(sb, {
      tenant_id: permiso.tenant_id,
      model: img.model,
      credits_used: 1,
      cost_usd: img.cost_usd,
      status: 'completed',
      duration_ms: Date.now() - t0,
      metadata: { formato, mensaje_id: permiso.mensaje_id, calidad: CALIDAD, costo_exacto: img.exacto },
    });

    return json({ ok: true, b64: img.b64, cost_usd: img.cost_usd });
  } catch (e) {
    const mensaje = String(e?.message || e).slice(0, 400);
    await anotarGasto(sb, {
      tenant_id: permiso.tenant_id,
      model: MODELO,
      credits_used: 0,
      cost_usd: 0,
      status: 'failed',
      error_message: mensaje,
      duration_ms: Date.now() - t0,
      metadata: { formato, mensaje_id: permiso.mensaje_id },
    });
    return json({ ok: false, error: mensaje }, 502);
  }
});
