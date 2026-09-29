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
//  >>> SE DESPLIEGA CON --no-verify-jwt <<<
//    node scripts/desplegar-funcion.mjs creativo-escena --no-verify-jwt
//  El creativo no tiene sesión: entra con el permiso. Sin la opción, Supabase
//  exige un JWT, responde 401 a todo y cada pieza sale con la plantilla
//  (pasó el 29/09 al redesplegar sin ella).
//
//  Cuerpo: { foto_url, fondo, acento, fondo_b64?, titulo?, subtitulo?, sello? }
//  Respuesta: { ok, b64, cost_usd, texto_en_escena }
//
//  Cada escena queda anotada en ai_agent_runs (agent_key comercial_creativo)
//  con su costo: se ve junto al resto del gasto de IA.
//
//  La escena va SIN TEXTO: el logo, el titular y el teléfono los escribe el
//  creativo encima (scripts/arteCreativo.mjs), porque un modelo de imagen a
//  veces escribe mal un número y en un teléfono eso no se puede permitir.
//
//  ── v2, 29/09/2026: EL TITULAR LO ESCRIBE EL MODELO ─────────────────────
//  El dueño comparó con sus piezas hechas en ChatGPT (tambor, amortiguador,
//  casco, candado, aro, pateo, colita) y la diferencia era la letra: la del
//  servidor es una DejaVu plana, la suya es gruesa, cursiva, metálica, con la
//  palabra de acento en naranja. Eso solo lo hace el modelo. Así que si llega
//  `titulo`, el modelo escribe el titular, el subtítulo y el botón; encima
//  solo se ponen el logo OFICIAL y el teléfono, que no pueden salir mal. El
//  dueño aprueba cada pieza en el Paso 2 antes de publicar: una letra mal
//  escrita en el titular se ve ahí y se pide otra.
//
//  Y el modelo ve el LISTÓN: las piezas buenas del dueño viven en el bucket
//  privado `equipo-estilo`, carpeta de su empresa, y van como referencias de
//  estilo (hasta REFS_ESTILO, al azar para que no salgan todas iguales).
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
const BUCKET_ESTILO = 'equipo-estilo';
// Cada referencia suma algo de imagen de entrada; tres bastan para que el
// modelo entienda el estilo sin que la pieza se encarezca.
const REFS_ESTILO = 3;

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

// Texto que va DENTRO de la imagen: sin comillas ni saltos, que no rompan el
// prompt, y corto, que en un teléfono no se lee un renglón de 40 letras.
const limpio = (t: unknown, max: number) =>
  String(t ?? '').replace(/["\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function promptConTexto({ vertical, fondo, acento, tieneFondo, nEstilo, titulo, subtitulo, sello }) {
  // Lo de arriba lo ocupa el logo oficial y lo de abajo la barra del
  // teléfono, que se ponen después: el modelo tiene que dejarlos libres.
  const arriba = vertical ? 22 : 26;
  const abajo = vertical ? 10 : 13;
  const primeraEstilo = tieneFondo ? 3 : 2;
  const estilo = nEstilo
    ? `Reference images ${primeraEstilo} to ${primeraEstilo + nEstilo - 1} are finished ads from OUR OWN store: copy their visual style exactly `
      + '(dark blue background with orange neon light streaks, glossy dark podium with glowing orange rim, cinematic haze, '
      + 'and above all their TYPOGRAPHY: heavy bold italic condensed sans-serif headline, first line in silver-white metallic '
      + 'with bevel and shadow, key word in orange-gold gradient, thin orange separator lines with small spaced capitals, '
      + 'a rounded orange button). Do NOT copy their products, their words or their logo.'
    : 'Style: dark blue background with orange neon light streaks, glossy dark podium with glowing orange rim, cinematic haze. '
      + 'Typography: heavy bold italic condensed sans-serif headline, first line in silver-white metallic with bevel and shadow, '
      + 'key word in orange-gold gradient, thin orange separator lines, a rounded orange button.';
  return [
    'Premium social media advertisement for a motorcycle spare parts store.',
    'Use the product from the FIRST reference image EXACTLY as it is: same shape, colors, packaging,',
    'printed labels and proportions. Do not redraw, restyle, simplify or replace the product.',
    tieneFondo ? 'Build the background from the SECOND reference image (same mood and colors, blurred).' : '',
    estilo,
    `Colors: background based on ${fondo}, accent ${acento}.`,
    'Write ONLY these texts, in Spanish, spelled EXACTLY letter by letter, nothing else:',
    `HEADLINE: "${titulo}" (the product model or the last word in the orange-gold gradient, the rest in silver-white metallic).`,
    subtitulo ? `SUBTITLE between thin lines, small spaced capitals: "${subtitulo}".` : '',
    `BUTTON: "${sello}".`,
    `Layout: keep the top ${arriba}% as empty background (our official logo is added there later; do NOT draw any logo, badge or shield).`,
    'Headline right below that empty area, the product large and centered on the podium below the headline,',
    'the text never covering the product,',
    `the button under the podium, and the bottom ${abajo}% as empty dark background (a footer with the phone is added later).`,
    'No phone numbers, prices, URLs, watermarks or any other text. The product may show its own printed packaging text.',
    'Sharp focus on the product, high contrast, professional commercial look.',
  ].filter(Boolean).join(' ');
}

// Las piezas modelo del dueño. Si no hay o no se pueden bajar, la escena
// sale igual con el estilo descrito en palabras: una referencia que falla
// no puede dejar al dueño sin pieza.
async function referenciasDeEstilo(sb: any, tenantId: string) {
  const { data: lista, error } = await sb.storage.from(BUCKET_ESTILO).list(tenantId, { limit: 50 });
  if (error || !Array.isArray(lista)) return [];
  const imagenes = lista.filter((f: any) => /\.(png|jpe?g|webp)$/i.test(f.name));
  for (let i = imagenes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [imagenes[i], imagenes[j]] = [imagenes[j], imagenes[i]];
  }
  const refs = [];
  for (const f of imagenes.slice(0, REFS_ESTILO)) {
    const { data: blob } = await sb.storage.from(BUCKET_ESTILO).download(`${tenantId}/${f.name}`);
    if (!blob) continue;
    const mime = /\.png$/i.test(f.name) ? 'image/png' : /\.webp$/i.test(f.name) ? 'image/webp' : 'image/jpeg';
    refs.push({ bytes: new Uint8Array(await blob.arrayBuffer()), mime, nombre: `estilo-${refs.length + 1}-${f.name}` });
  }
  return refs;
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

    const titulo = limpio(body?.titulo, 60);
    const conTexto = !!titulo;
    const estilo = conTexto ? await referenciasDeEstilo(sb, permiso.tenant_id) : [];
    referencias.push(...estilo);

    const comun = {
      vertical: formato === 'historia',
      fondo: hex(body?.fondo, '#0b1e3a'),
      acento: hex(body?.acento, '#f5a623'),
      tieneFondo: !!body?.fondo_b64,
    };
    const img = await generateImage({
      prompt: conTexto
        ? promptConTexto({
          ...comun,
          nEstilo: estilo.length,
          titulo,
          subtitulo: limpio(body?.subtitulo, 60),
          sello: limpio(body?.sello, 24) || 'YA DISPONIBLE',
        })
        : promptEscena(comun),
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
      metadata: {
        formato, mensaje_id: permiso.mensaje_id, calidad: CALIDAD, costo_exacto: img.exacto,
        texto_en_escena: conTexto, refs_estilo: estilo.map((r) => r.nombre),
      },
    });

    return json({ ok: true, b64: img.b64, cost_usd: img.cost_usd, texto_en_escena: conTexto });
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
