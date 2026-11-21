// ============================================================
// texto-reuso — texto nuevo para volver a publicar una promoción
// ============================================================
// (21/11/2026) Equipo IA reutiliza el arte de una promoción ya hecha
// ("el mismo arte, diferente texto"). Antes el texto salía de plantillas
// y no seguía la VOZ DE LA MARCA que el dueño escribe en Estilo. Aquí
// gpt-4o-mini lo escribe con esas reglas, el precio de HOY y el texto
// anterior (para no repetirlo).
//
// Corre con la sesión del usuario: todo se lee con SU permiso (RLS), así
// que solo ve su empresa. Nada se guarda ni se publica: devuelve el texto
// y el dueño lo revisa en el formulario antes de programar.
//
// Body:    { producto_id: uuid, bundle_id?: uuid }
// Returns: { textos: { facebook, instagram, tiktok, youtube } }
// Si algo falla, el cliente usa la plantilla (src/lib/textoReuso.js).
// ============================================================

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const MODEL = 'gpt-4o-mini';
const REDES = ['facebook', 'instagram', 'tiktok', 'youtube'];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'no_auth' }, 401);
  // Cliente con la sesión del usuario: RLS decide qué ve.
  const sb = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_ANON_KEY') || '', {
    global: { headers: { Authorization: auth } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const productoId = String(body?.producto_id || '');
  const bundleId = body?.bundle_id ? String(body.bundle_id) : null;
  if (!/^[0-9a-f-]{36}$/i.test(productoId)) return json({ error: 'producto_id inválido' }, 400);

  const [{ data: prod }, { data: voz }, viejo, { data: emp }] = await Promise.all([
    sb.from('productos').select('descripcion, precio').eq('id', productoId).maybeSingle(),
    sb.rpc('equipo_criterios_ver', { p_tipo: 'voz' }),
    bundleId
      ? sb.from('hermes_publication_jobs').select('textos').eq('publication_bundle_id', bundleId)
          .not('textos', 'is', null).order('created_at', { ascending: false }).limit(1)
      : Promise.resolve({ data: [] }),
    sb.rpc('get_user_tenant').then(async ({ data: t }: any) =>
      t ? sb.from('config_empresa').select('nombre, telefono').eq('tenant_id', t).maybeSingle() : { data: null }),
  ]);
  if (!prod) return json({ error: 'La pieza no está en tu catálogo.' }, 404);

  const reglas = (Array.isArray(voz) ? voz : []).filter((r: any) => r.tipo === 'voz').map((r: any) => `- ${r.texto}`);
  const precio = `RD$ ${Number(prod.precio).toLocaleString('es-DO', { maximumFractionDigits: 2 })}`;
  const textoViejo = viejo?.data?.[0]?.textos || {};

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return json({ error: 'OPENAI_API_KEY no configurada' }, 500);

  const system = `Escribes textos cortos para redes sociales de ${emp?.nombre || 'una tienda de repuestos de motos'} en República Dominicana.
Vas a volver a publicar una promoción que ya salió, con la MISMA imagen: el texto tiene que ser distinto al anterior.
Reglas fijas:
- El precio es exactamente ${precio} (precio de catálogo). No inventes descuentos ni otro precio.
- No pongas códigos internos del producto.
${emp?.telefono ? `- El teléfono es ${emp.telefono}.` : ''}
Voz de la marca (las reglas del dueño, síguelas):
${reglas.length ? reglas.join('\n') : '- Claro, cercano, frases cortas.'}
Formato por red:
- facebook: 2-4 líneas, con el precio y el teléfono.
- instagram: 2-4 líneas, con el precio; los hashtags al final.
- tiktok y youtube: una o dos frases cortas con el precio y hashtags.
Responde SOLO un JSON: {"facebook": "...", "instagram": "...", "tiktok": "...", "youtube": "..."}`;

  const user = JSON.stringify({ pieza: prod.descripcion, precio, texto_anterior: textoViejo });

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: 'json_object' },
      temperature: 0.8,
      max_tokens: 600,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!r.ok) return json({ error: `OpenAI ${r.status}` }, 502);
  const data = await r.json();
  let textos: any = {};
  try { textos = JSON.parse(data.choices?.[0]?.message?.content || '{}'); } catch { textos = {}; }

  // Lo que no traiga el precio de hoy no sirve: el cliente usa la plantilla.
  const cifra = String(Math.round(Number(prod.precio)));
  const limpio: Record<string, string> = {};
  for (const red of REDES) {
    const t = typeof textos[red] === 'string' ? textos[red].trim() : '';
    if (t && t.replace(/[.,\s]/g, '').includes(cifra)) limpio[red] = t;
  }
  if (!limpio.facebook || !limpio.instagram) return json({ error: 'El texto no trajo el precio de hoy.' }, 422);
  return json({ textos: limpio, modelo: MODEL });
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
