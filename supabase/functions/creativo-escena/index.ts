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
//  Cuerpo: { foto_url, fondo, acento, fondo_b64?, titulo?, subtitulo?, sello?, logo_url? }
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
//  El LOGO también lo pone el modelo (29/09, ronda 2 del Motul 7100): se le
//  pidió dejar libre la franja de arriba para pegar ahí el oficial, no la
//  respetó y el logo pegado tapó el titular. Ahora el logo oficial va como
//  referencia y el modelo lo coloca, como en las piezas modelo. Encima solo
//  queda el teléfono.
//
//  Y el TELÉFONO también (29/09, noche): la barra que pegaba el montador
//  salía con "REPUESTOS MORLA" y sin el número en el servidor, aunque en
//  local salía bien, y además tapaba el botón. Ahora el número se lee aquí
//  de config_empresa —la fuente de verdad, no el texto del encargo— y el
//  modelo dibuja la barra con el ícono de WhatsApp, como en la pieza modelo
//  del candado. El dueño lo revisa en grande antes de aprobar.
//
//  Y el modelo ve el LISTÓN: las piezas buenas del dueño viven en el bucket
//  privado `equipo-estilo`, carpeta de su empresa, y van como referencias de
//  estilo (hasta REFS_ESTILO, al azar para que no salgan todas iguales).
// ════════════════════════════════════════════════════════════════════════

// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { generateImage, presupuestoImagenes } from '../motoflow-ai-marketing/llm.ts';

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
// (14/10/2026) "same packaging" hacía que el modelo copiara TODO lo que hay en
// la foto: en la historia del Amortiguador TVS Sport salió con la cartulina
// de etiquetas de detrás; en el feed, recortado. Misma regla para los dos:
// se saca SOLO el producto de su foto.
const RECORTE = 'Cut the product cleanly out of its photo: keep ONLY the product itself (and its own retail box '
  + 'only when the item is sold boxed, like oil or filters). Drop EVERYTHING else from the photo: background, wall, '
  + 'table, floor, hands, shelves, and any card, sticker sheet, label board or other packaging standing behind or '
  + 'under it. The product stands alone on the podium, exactly the same in every format (square and vertical).';

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
    RECORTE,
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

// ── REELS (04/10/2026) ──────────────────────────────────────────────────
// Una TOMA de reel: la pieza real en la escena que pide la receta (mano que
// la sostiene, plato giratorio, mesa de acero, humo…). Sin texto: las letras
// del reel las pone el montador encima, con tiempo, y no pueden salir mal.
// (22/10/2026) Todas las tomas salían en el MISMO estudio oscuro porque esa
// luz estaba fija aquí. armarReel elige un escenario por reel y lo manda
// pegado a la toma ("… || AMBIENTE: …"); sin él, el estudio oscuro de antes.
function promptToma({ toma, acento }) {
  const [plano, ambiente] = String(toma).split(/\s*\|\|\s*AMBIENTE:\s*/i);
  return [
    'Vertical 9:16 cinematic frame for a motorcycle spare parts video ad (Instagram Reel / TikTok).',
    'Use the product from the FIRST reference image EXACTLY as it is: same shape, colors, packaging,',
    'printed labels, number of teeth/holes and proportions. Do not redraw, restyle, simplify or replace it.',
    `Shot: ${plano}.`,
    ambiente
      ? `Setting and light: ${ambiente}. Keep it real and natural, not a dark studio.`
      : `Dramatic studio lighting, dark background, ${acento} rim light, soft haze and reflections,`,
    'sharp focus on the product, photorealistic, premium commercial look.',
    'Leave the bottom 22% of the frame darker and calm (subtitles go there).',
    'ABSOLUTELY NO TEXT, letters, numbers, logos, watermarks or brand names anywhere,',
    "except the product's own original printed packaging.",
  ].join(' ');
}

// El reel terminado: el creativo lo manda con un permiso 'video' y aquí se
// sube al bucket público ai-marketing (el mismo del video de 8 s), porque el
// worker no tiene ni debe tener la llave del almacenamiento.
const MAX_VIDEO = 40 * 1024 * 1024;
async function subirVideo(req: Request, sb: any, permiso: any) {
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length < 1024) return json({ ok: false, error: 'El video llegó vacío.' }, 400);
  if (bytes.length > MAX_VIDEO) return json({ ok: false, error: `El video pesa ${bytes.length} bytes; el máximo es ${MAX_VIDEO}.` }, 413);
  // Un MP4 dice "ftyp" en los bytes 4-7. Lo demás no se sube.
  if (new TextDecoder().decode(bytes.slice(4, 8)) !== 'ftyp') {
    return json({ ok: false, error: 'Eso no es un MP4.' }, 400);
  }
  const ruta = `reels/${permiso.tenant_id}/${permiso.mensaje_id}-${Date.now()}.mp4`;
  const { error } = await sb.storage.from('ai-marketing').upload(ruta, bytes, { contentType: 'video/mp4', upsert: false });
  if (error) return json({ ok: false, error: `No se pudo guardar el video: ${error.message}` }, 502);
  const { data } = sb.storage.from('ai-marketing').getPublicUrl(ruta);
  return json({ ok: true, url: data.publicUrl, bytes: bytes.length });
}

// Texto que va DENTRO de la imagen: sin comillas ni saltos, que no rompan el
// prompt, y corto, que en un teléfono no se lee un renglón de 40 letras.
const limpio = (t: unknown, max: number) =>
  String(t ?? '').replace(/["\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function promptConTexto({ vertical, fondo, acento, tieneFondo, tieneLogo, nEstilo, titulo, subtitulo, sello, telefono, formatoAnuncio = 'podio' }) {
  const F = FORMATOS_ANUNCIO[formatoAnuncio] || FORMATOS_ANUNCIO.podio;
  const esPodio = formatoAnuncio === 'podio';
  // El orden de las referencias: producto, logo, fondo, estilo.
  const nLogo = tieneLogo ? 2 : 0;
  const nFondo = tieneFondo ? (tieneLogo ? 3 : 2) : 0;
  const primeraEstilo = 2 + (tieneLogo ? 1 : 0) + (tieneFondo ? 1 : 0);
  const estilo = nEstilo
    ? `Reference images ${primeraEstilo} to ${primeraEstilo + nEstilo - 1} are finished ads from OUR OWN store: copy their brand style `
      + (esPodio
        ? '(dark blue background with orange neon light streaks, glossy dark podium with glowing orange rim, cinematic haze, '
        : `(their colors and light, but NOT their podium composition: this ad is a ${F.sobre}, `)
      + 'and above all their TYPOGRAPHY: heavy bold italic condensed sans-serif headline, first line in silver-white metallic '
      + 'with bevel and shadow, key word in orange-gold gradient, thin orange separator lines with small spaced capitals, '
      + 'a rounded orange button). Do NOT copy their products, their words or their logo.'
    : (esPodio ? 'Style: dark blue background with orange neon light streaks, glossy dark podium with glowing orange rim, cinematic haze. '
      : 'Style: dark blue and orange brand colors, cinematic light. ')
      + 'Typography: heavy bold italic condensed sans-serif headline, first line in silver-white metallic with bevel and shadow, '
      + 'key word in orange-gold gradient, thin orange separator lines, a rounded orange button.';
  return [
    'Premium social media advertisement for a motorcycle spare parts store.',
    'Use the product from the FIRST reference image EXACTLY as it is: same shape, colors, packaging,',
    'printed labels and proportions. Do not redraw, restyle, simplify or replace the product.',
    RECORTE,
    tieneLogo ? `Reference image ${nLogo} is OUR OFFICIAL LOGO: place it at the top center, about ${vertical ? 30 : 24}% of the image width, `
      + 'reproduced EXACTLY (same shield shape, colors, stars and letters). Do not draw any other logo.' : '',
    tieneFondo ? `Build the background from reference image ${nFondo} (same mood and colors, blurred).` : '',
    estilo,
    `Colors: background based on ${fondo}, accent ${acento}.`,
    'Write ONLY these texts, in Spanish, spelled EXACTLY letter by letter, nothing else:',
    `HEADLINE: "${titulo}" (the product model or the last word in the orange-gold gradient, the rest in silver-white metallic).`,
    subtitulo ? `SUBTITLE between thin lines, small spaced capitals: "${subtitulo}".` : '',
    `BUTTON: "${sello}".`,
    F.textos || '',
    telefono ? `FOOTER: "${telefono}" — exactly these digits and dashes — next to a small green WhatsApp icon, `
      + 'inside a dark rounded bar with a thin orange border at the very bottom.' : '',
    tieneLogo ? 'Layout: the logo at the top, the headline right BELOW the logo (never behind or over it),'
      : 'Layout: do NOT draw any logo, badge or shield; the headline at the top,',
    F.composicion,
    'the text never covering the product,',
    telefono ? 'the button under the product area, and the footer bar below the button, never overlapping it.'
      : 'the button under the product area.',
    'No prices, URLs, watermarks, other phone numbers or any other text. The product may show its own printed packaging text.',
    'Sharp focus on the product, high contrast, professional commercial look.',
  ].filter(Boolean).join(' ');
}

// ── FORMATOS DE ANUNCIO (22/10/2026) ───────────────────────────────────
// El curso "Claude para Marketing" (Álvaro Pareja) enseña los formatos
// estáticos que más convierten en Meta. Todas las piezas salían igual (la
// pieza en el podio) y Meta castiga lo que se ve repetido: el alcance de
// Morla está en 27–123. Ahora rotan, el que hace más tiempo que no sale.
// El TESTIMONIO no está: pide un cliente y una frase REALES; inventarlos no.
// Lo que no cambia: la pieza real de la foto, el logo, la letra y los
// colores de la marca, y nada de precios.
const FORMATOS_ANUNCIO: Record<string, { sobre: string; textos?: string; composicion: string }> = {
  podio: {
    sobre: 'glossy dark podium',
    composicion: 'the product large and centered on a glossy dark podium with glowing orange rim below the headline,',
  },
  oferta: {
    sobre: 'dynamic retail flyer',
    composicion: 'PROMOTIONAL FLYER layout: energetic retail-sale look, the product large and slightly tilted with orange light rays '
      + 'and speed lines bursting behind it, the BUTTON text inside a big orange starburst sticker overlapping a corner of the product area,',
  },
  antes_despues: {
    sobre: 'before and after split',
    textos: 'LABELS: "ANTES" on the left half and "DESPUÉS" on the right half, small bold capitals in a dark tag.',
    composicion: 'BEFORE / AFTER SPLIT layout: below the headline the frame is divided in two halves by a thin glowing orange line; '
      + 'LEFT half: the same kind of part WORN OUT (dirty, rusty, cracked or faded) on a greasy workshop floor with dull light; '
      + 'RIGHT half: the real product from the first reference image, brand new, shining, in clean bright light,',
  },
  en_la_moto: {
    sobre: 'installed on a motorcycle',
    composicion: 'IN-USE layout: below the headline a real motorcycle on a sunny Caribbean street with the part installed in its place, '
      + 'and a large circular zoom callout with a thick orange border showing the product EXACTLY as in the first reference image,',
  },
  problema: {
    sobre: 'problem and solution',
    composicion: 'PROBLEM / SOLUTION layout: below the headline a smaller dark, desaturated photo of a motorcycle suffering the problem '
      + 'this part solves (worn, broken, dim, noisy or leaking), and an orange arrow leading to the product from the first reference image, '
      + 'large, bright and heroic as the solution,',
  },
};

// Feed e historia de la MISMA pieza llevan el mismo formato (llegan casi a
// la vez: el desempate no es al azar, sale del id del mensaje). Si no, el que
// hace más tiempo que no sale en esta empresa.
async function elegirFormatoAnuncio(sb: any, tenantId: string, mensajeId: string, pedido?: string) {
  if (pedido && FORMATOS_ANUNCIO[pedido]) return pedido;
  const { data: filas } = await sb.from('ai_agent_runs').select('metadata, created_at')
    .eq('tenant_id', tenantId).eq('herramienta', 'creativo-escena').eq('status', 'completed')
    .not('metadata->>formato_anuncio', 'is', null)
    .order('created_at', { ascending: false }).limit(20);
  const usados = (filas || []).map((f: any) => f.metadata || {});
  const mismo = usados.find((m: any) => mensajeId && m.mensaje_id === mensajeId && FORMATOS_ANUNCIO[m.formato_anuncio]);
  if (mismo) return mismo.formato_anuncio;
  const claves = Object.keys(FORMATOS_ANUNCIO);
  const hace = (k: string) => { const i = usados.findIndex((m: any) => m.formato_anuncio === k); return i < 0 ? 1e9 : i; };
  const mayor = Math.max(...claves.map(hace));
  const mejores = claves.filter((k) => hace(k) === mayor);
  let h = 0;
  for (const c of String(mensajeId || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return mejores[h % mejores.length];
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
  if (permiso.formato === 'video') return subirVideo(req, sb, permiso);
  const esToma = permiso.formato === 'toma';
  const formato = permiso.formato === 'historia' || esToma ? 'historia' : 'feed';

  const body = await req.json().catch(() => ({}));
  const fotoUrl = String(body?.foto_url || '');
  if (!fotoUrl.startsWith(ORIGEN_FOTOS)) {
    return json({ ok: false, error: 'La foto tiene que venir del almacenamiento de MotoFlow.' }, 400);
  }

  // Tope mensual de imágenes (US$10/mes en OpenAI, decisión del dueño). Sin
  // presupuesto, el Creativo monta la pieza con la plantilla (gratis).
  const pres = await presupuestoImagenes(sb);
  if (!pres.ok) {
    return json({ ok: false, error: `Presupuesto mensual de imágenes agotado (US$${pres.gastado.toFixed(2)} de US$${pres.tope.toFixed(2)}). La pieza sale con la plantilla; el presupuesto se renueva el día 1.` }, 402);
  }

  const t0 = Date.now();
  try {
    const rf = await fetch(fotoUrl);
    if (!rf.ok) throw new Error(`no se pudo bajar la foto del producto: HTTP ${rf.status}`);
    const foto = new Uint8Array(await rf.arrayBuffer());
    const mimeFoto = rf.headers.get('content-type') || 'image/jpeg';

    const referencias = [{ bytes: foto, mime: mimeFoto, nombre: 'producto' }];
    // El logo, solo del almacenamiento propio (igual que la foto) y solo
    // cuando el modelo escribe el titular: en el modo viejo lo pega el montador.
    const logoUrl = String(body?.logo_url || '');
    let tieneLogo = false;
    if (body?.titulo && logoUrl.startsWith(ORIGEN_FOTOS)) {
      const rl = await fetch(logoUrl);
      if (rl.ok) {
        referencias.push({ bytes: new Uint8Array(await rl.arrayBuffer()), mime: rl.headers.get('content-type') || 'image/png', nombre: 'logo.png' });
        tieneLogo = true;
      }
    }
    if (body?.fondo_b64) {
      const bin = atob(String(body.fondo_b64));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      referencias.push({ bytes, mime: 'image/png', nombre: 'fondo.png' });
    }

    const titulo = limpio(body?.titulo, 60);
    const conTexto = !!titulo;
    // El teléfono, de la ficha de la empresa. Solo si tiene forma de teléfono:
    // lo que va escrito en la pieza no puede ser cualquier cosa.
    let telefono = '';
    if (conTexto) {
      const { data: emp } = await sb.from('config_empresa').select('telefono')
        .eq('tenant_id', permiso.tenant_id).maybeSingle();
      const t = String(emp?.telefono || '').trim();
      if (/^[0-9()+\-\s]{7,20}$/.test(t)) telefono = t;
    }
    const estilo = conTexto ? await referenciasDeEstilo(sb, permiso.tenant_id) : [];
    const formatoAnuncio = conTexto
      ? await elegirFormatoAnuncio(sb, permiso.tenant_id, String(permiso.mensaje_id || ''), body?.formato_anuncio).catch(() => 'podio')
      : null;
    referencias.push(...estilo);

    const comun = {
      vertical: formato === 'historia',
      fondo: hex(body?.fondo, '#0b1e3a'),
      acento: hex(body?.acento, '#f5a623'),
      tieneFondo: !!body?.fondo_b64,
    };
    const img = await generateImage({
      prompt: esToma
        ? promptToma({ toma: limpio(body?.toma, 400) || 'the product on a glossy podium', acento: comun.acento })
        : conTexto
        ? promptConTexto({
          ...comun,
          tieneLogo,
          nEstilo: estilo.length,
          titulo,
          subtitulo: limpio(body?.subtitulo, 60),
          sello: limpio(body?.sello, 24) || 'YA DISPONIBLE',
          telefono,
          formatoAnuncio,
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
        formato: esToma ? 'toma_reel' : formato, mensaje_id: permiso.mensaje_id, calidad: CALIDAD, costo_exacto: img.exacto,
        texto_en_escena: conTexto, telefono_en_escena: !!telefono, refs_estilo: estilo.map((r) => r.nombre),
        ...(formatoAnuncio ? { formato_anuncio: formatoAnuncio } : {}),
      },
    });

    return json({ ok: true, b64: img.b64, cost_usd: img.cost_usd, texto_en_escena: conTexto, logo_en_escena: tieneLogo, formato_anuncio: formatoAnuncio });
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
