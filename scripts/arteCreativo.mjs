// ============================================================
// EL ARTE, MONTADO DE VERDAD
// ============================================================
// El Comercial-Creativo entregaba un brief perfecto —fondo, dónde va la foto,
// dónde el logo, título, precio, teléfono, zona segura— y terminaba diciendo
// la verdad en sus advertencias: "no se generó ni renderizó ningún archivo".
// No tenía con qué. Esto es ese "con qué".
//
// >>> LAS DECISIONES SIGUEN SIENDO SUYAS. <<<
// Aquí no se decide nada: ni el título, ni el color, ni qué producto, ni cómo
// se dice. Todo eso viene en la ficha que él manda. Esto solo la dibuja. Es la
// diferencia entre el que diseña y el que imprime.
//
// Composición sobre la foto real y el logo oficial, nunca sobre imágenes
// inventadas: si la foto no se puede bajar, no hay arte, y se dice.
//
// ── v2, después de ver la pieza buena ───────────────────────────────────
// El dueño enseñó una promoción hecha por un diseñador —el tanque XPRESS— y
// dijo lo evidente: lo nuestro no es publicable. Tenía razón, y el problema
// no era el creativo: era esto. Sabía dibujar seis cosas (fondo liso, logo,
// título, subtítulo, foto, precio) y con seis cosas no se hace una pieza que
// aguante al lado de la suya.
//
// La pieza buena tiene una anatomía clara, y es esta la que se aprende aquí:
//   fondo con profundidad · logo centrado arriba · titular a dos líneas con
//   UNA palabra en el color de acento · cinta con la marca · tagline fina ·
//   bullets de ventajas · sello · el producto sobre un podio con luz ·
//   barra de pie con teléfono y ciudad.
//
// Todo opcional: una ficha que solo traiga título y precio sigue montando,
// como antes. Lo que no se manda, no se dibuja.
// ============================================================

import sharp from 'sharp';

// Dos formatos, los dos que se usan de verdad: el cuadrado del feed y la
// historia vertical. Nada más, para no acabar manteniendo seis.
export const FORMATOS = {
  feed:     { ancho: 1080, alto: 1080 },
  historia: { ancho: 1080, alto: 1920 },
};

// En el VPS no hay Arial. Sin una pila con nombres que existan en Linux,
// librsvg cae en una serif y la pieza entera cambia de carácter.
const TIPO = "'DejaVu Sans', 'Liberation Sans', 'Noto Sans', Arial, Helvetica, sans-serif";

const escapar = (t) => String(t ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const hex = (v, porDefecto) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : porDefecto);

// El título se parte por palabras y no por caracteres: cortar "MINERAL" a la
// mitad se lee como un error de imprenta.
function repartirEnLineas(texto, porLinea) {
  const palabras = String(texto || '').trim().split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = '';
  for (const p of palabras) {
    if (!actual) { actual = p; continue; }
    if ((actual + ' ' + p).length <= porLinea) actual += ' ' + p;
    else { lineas.push(actual); actual = p; }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

// Sin acceso a las métricas de la fuente, el ancho se estima. Es para decidir
// cuánto mide una cinta o un recuadro, no para justificar texto: fallar por
// diez píxeles no se nota, y la alternativa es cargar la fuente a mano.
const anchoAprox = (texto, tam, negrita = true) =>
  Math.round(String(texto || '').length * tam * (negrita ? 0.58 : 0.52));

async function bajar(url) {
  if (!url) return null;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`no se pudo bajar ${url}: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/**
 * Monta la pieza. `ficha` es lo que decide el creativo:
 *   { titulo, titulo_acento, subtitulo, tagline, precio, telefono, empresa,
 *     ciudad, bullets:[], sello, fondo, acento, fondo_url, fondo_b64,
 *     foto_url, logo_url, formato }
 * Devuelve { png, ancho, alto }.
 */
export async function montarArte(ficha = {}) {
  const formato = FORMATOS[ficha.formato] || FORMATOS.feed;
  const { ancho: W, alto: H } = formato;
  const vertical = H > W;

  const fondo  = hex(ficha.fondo,  '#0b1e3a');
  const acento = hex(ficha.acento, '#f5a623');

  // La referencia del dueño no vive en una URL publica: vive en la base, en
  // bytes, igual que las piezas. Por eso se admite tambien en base64 — si se
  // exigiera URL habria que abrir un bucket publico solo para esto.
  const [foto, logo, fondoBajado] = await Promise.all([
    bajar(ficha.foto_url), bajar(ficha.logo_url), bajar(ficha.fondo_url),
  ]);
  const fondoImg = fondoBajado
    || (ficha.fondo_b64 ? Buffer.from(ficha.fondo_b64, 'base64') : null);
  if (!foto) throw new Error('sin foto real del producto no se monta el arte');

  // ── La pieza se apila de arriba abajo ────────────────────────────
  // Calcular cada bloque por su cuenta con porcentajes del alto parece más
  // simple y no lo es: la foto acababa encima del título, porque nadie
  // llevaba la cuenta de dónde terminaba el anterior. Aquí hay UN cursor
  // vertical y cada bloque lo empuja.
  const margen = Math.round(W * 0.06);
  const capas = [];
  const svgFondo = [];   // lo que va DEBAJO de la foto
  const svgFrente = [];  // lo que va ENCIMA
  let y = margen;

  // ── 0) EL FONDO ──────────────────────────────────────────────────
  // Con imagen de referencia se usa esa, oscurecida para que el texto se
  // lea; sin ella, un degradado con rayas de luz. Un color plano es lo que
  // hacía que la pieza pareciera una diapositiva.
  if (fondoImg) {
    const cubierto = await sharp(fondoImg)
      .resize(W, H, { fit: 'cover', position: 'centre' })
      .png().toBuffer();
    capas.push({ input: cubierto, left: 0, top: 0 });
    // Velo: sin él, el titular blanco cae sobre cualquier cosa y desaparece.
    capas.push({
      input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${W}" height="${H}" fill="${fondo}" opacity="0.62"/>
        <rect width="${W}" height="${Math.round(H * 0.42)}" fill="#000000" opacity="0.28"/>
      </svg>`),
      left: 0, top: 0,
    });
  }

  // ── 1) EL LOGO, centrado y grande ────────────────────────────────
  // Estaba arriba a la izquierda, del tamaño de un sello. En la pieza buena
  // el logo preside: es lo primero que dice de quién es esto.
  let logoAlto = 0;
  if (logo) {
    const anchoLogo = Math.round(W * (vertical ? 0.30 : 0.24));
    const puesto = await sharp(logo)
      .resize(anchoLogo, null, { fit: 'inside' })
      .png().toBuffer();
    logoAlto = (await sharp(puesto).metadata()).height || 0;
    capas.push({ input: puesto, left: Math.round((W - anchoLogo) / 2), top: y });
  }
  y += logoAlto + Math.round(H * 0.018);

  // ── 2) LO QUE VA ABAJO, QUE ES FIJO ──────────────────────────────
  // El pie y el precio no dependen del titular, asi que se sitúan primero:
  // son el suelo contra el que se mide cuánto sitio le queda al producto.
  const tamPie = Math.round(W * 0.038);
  const altoBarra = Math.round(tamPie * 2.6);
  const barraY = H - altoBarra;
  const tamPrecio = Math.round(W * 0.105);
  const precio = ficha.precio ? `RD$${String(ficha.precio).replace(/^RD\$?\s*/i, '')}` : '';
  const precioY = precio ? barraY - Math.round(H * 0.022) : barraY;
  const suelo = precioY - (precio ? tamPrecio : 0) - Math.round(H * 0.018);

  // ── 3) EL TITULAR, AJUSTADO A LO QUE SOBRA ───────────────────────
  // La primera version montaba el texto a tamaño fijo y le daba al producto
  // "lo que quedara". En el cuadrado no quedaba casi nada: el frasco salia
  // del tamaño de un sello y la pieza no vendia. Aqui es al reves — el
  // producto tiene un minimo intocable y el titular baja de cuerpo hasta que
  // cabe. Lo que se lee primero en una promocion es el producto.
  const techo = margen + logoAlto + Math.round(H * 0.018);
  const minFoto = Math.round(H * (vertical ? 0.30 : 0.34));

  const medir = (tt) => {
    let yy = techo;
    // Al encoger el cuerpo cabe mas texto por linea, asi que el titular
    // acababa en UN renglon pequeño en mitad de la pieza. Un titular largo
    // se parte en dos y se queda grande: se lee de lejos, que es para lo
    // que esta.
    const largo = String(ficha.titulo || '').trim().length;
    const cabe = Math.floor(W * 0.92 / (tt * 0.58));
    const porLinea = Math.max(8, largo > 18 ? Math.min(cabe, Math.ceil(largo / 2)) : cabe);
    const ls = repartirEnLineas(ficha.titulo, porLinea).slice(0, 3);
    const al = Math.round(tt * 1.06);
    const tY = yy + tt;
    yy = tY + (ls.length - 1) * al;
    let cinta = null;
    if (ficha.subtitulo) {
      const tc = Math.round(tt * 0.38);
      const ac = Math.round(tc * 1.9);
      const cy = yy + Math.round(tc * 1.4);
      yy = cy + ac;
      cinta = { tam: tc, alto: ac, y: cy };
    }
    let tag = null;
    if (ficha.tagline) {
      const tg = Math.round(tt * 0.26);
      const gy = yy + Math.round(tg * 2.0);
      yy = gy;
      tag = { tam: tg, y: gy };
    }
    return { fin: yy, lineas: ls, altoLinea: al, tituloY: tY, cinta, tag };
  };

  let tamTitulo = Math.round(W * (vertical ? 0.082 : 0.072));
  const tamMinimo = Math.round(W * 0.042);
  let L = medir(tamTitulo);
  while (tamTitulo > tamMinimo
         && (suelo - (L.fin + Math.round(H * 0.022))) < minFoto) {
    tamTitulo -= 4;
    L = medir(tamTitulo);
  }

  const { lineas, altoLinea, tituloY } = L;

  // La palabra de acento se marca por coincidencia, no por posición: el
  // creativo escribe "XPRESS", no "la segunda palabra de la línea dos".
  const acentoNorm = String(ficha.titulo_acento || '').trim().toUpperCase();
  const limpia = (t) => t.toUpperCase().replace(/[^0-9A-ZÁÉÍÓÚÑ]/gi, '');
  const conAcento = lineas.map((l) => l.split(' ').map((t) => ({
    t, acento: !!acentoNorm && limpia(t) === limpia(acentoNorm),
  })));

  conAcento.forEach((partes, i) => {
    const cuerpo = partes.map((pt, j) =>
      `<tspan fill="${pt.acento ? acento : '#ffffff'}">${j ? ' ' : ''}${escapar(pt.t)}</tspan>`).join('');
    // xml:space="preserve" o SVG se traga el espacio con el que empieza cada
    // tspan y sale "ACEITEMINERAL". El espacio esta ahi; es el renderizador
    // el que lo colapsa por defecto.
    svgFondo.push(`<text x="${W / 2}" y="${tituloY + i * altoLinea}" xml:space="preserve" font-size="${tamTitulo}" font-weight="bold" letter-spacing="${Math.round(tamTitulo * 0.01)}" fill="#ffffff">${cuerpo}</text>`);
  });

  // ── 4) LA CINTA DE LA MARCA ──────────────────────────────────────
  // "MARCA GTS" en la pieza buena. Un rótulo sobre barra: separa el titular
  // del resto y da un sitio donde poner la marca sin competir con el título.
  if (L.cinta) {
    const { tam: tamCinta, alto: altoCinta, y: cintaY } = L.cinta;
    const anchoCinta = Math.min(W - margen * 2, anchoAprox(ficha.subtitulo, tamCinta) + tamCinta * 2);
    const x0 = Math.round((W - anchoCinta) / 2);
    const corte = Math.round(altoCinta * 0.32);
    svgFondo.push(
      `<polygon points="${x0 + corte},${cintaY} ${x0 + anchoCinta},${cintaY} ${x0 + anchoCinta - corte},${cintaY + altoCinta} ${x0},${cintaY + altoCinta}" fill="#000000" opacity="0.45" stroke="${acento}" stroke-width="2"/>`,
      `<text x="${W / 2}" y="${cintaY + Math.round(altoCinta * 0.7)}" font-size="${tamCinta}" font-weight="bold" letter-spacing="${Math.round(tamCinta * 0.06)}" fill="#ffffff">${escapar(ficha.subtitulo)}</text>`);
  }

  // ── 5) EL TAGLINE ────────────────────────────────────────────────
  if (L.tag) {
    svgFondo.push(`<text x="${W / 2}" y="${L.tag.y}" font-size="${L.tag.tam}" fill="#dbe4f0">${escapar(ficha.tagline)}</text>`);
  }

  y = L.fin;

  // La barra de pie y el precio, ya situados arriba, se dibujan al frente.
  svgFrente.push(
    `<rect x="0" y="${barraY}" width="${W}" height="${altoBarra}" fill="#05101f" opacity="0.92"/>`,
    `<rect x="0" y="${barraY}" width="${W}" height="3" fill="${acento}"/>`);
  const piePartes = [ficha.telefono, ficha.ciudad || ficha.empresa].filter(Boolean);
  if (piePartes.length) {
    svgFrente.push(`<text x="${W / 2}" y="${barraY + Math.round(altoBarra * 0.66)}" font-size="${tamPie}" font-weight="bold" letter-spacing="1" fill="#ffffff">${escapar(piePartes.join('   |   '))}</text>`);
  }
  if (precio) {
    svgFrente.push(`<text x="${W / 2}" y="${precioY}" font-size="${tamPrecio}" font-weight="bold" fill="${acento}">${escapar(precio)}</text>`);
  }

  // ── 6) LOS BULLETS DE VENTAJAS ───────────────────────────────────
  // Solo en vertical y solo si caben: meterlos a la fuerza en el cuadrado
  // los pone encima del producto, que es exactamente lo que no puede pasar.
  const bullets = Array.isArray(ficha.bullets)
    ? ficha.bullets.filter((b) => typeof b === 'string' && b.trim()).slice(0, 3) : [];
  const huecoArriba = y + Math.round(H * 0.022);
  const huecoAbajo = suelo;
  const hayBullets = vertical && bullets.length > 0 && (huecoAbajo - huecoArriba) > H * 0.30;

  let anchoBullets = 0;
  if (hayBullets) {
    const tamB = Math.round(W * 0.030);
    const radio = Math.round(W * 0.038);
    anchoBullets = Math.round(W * 0.34);
    const paso = Math.round((huecoAbajo - huecoArriba) * 0.16);
    let by = huecoArriba + Math.round(paso * 0.6);
    bullets.forEach((b) => {
      const cx = margen + radio;
      svgFondo.push(
        `<circle cx="${cx}" cy="${by}" r="${radio}" fill="none" stroke="${acento}" stroke-width="3"/>`,
        `<circle cx="${cx}" cy="${by}" r="${Math.round(radio * 0.34)}" fill="${acento}"/>`);
      const lineasB = repartirEnLineas(b.toUpperCase(), 14).slice(0, 2);
      lineasB.forEach((lb, k) => {
        svgFondo.push(`<text x="${cx + radio + Math.round(W * 0.022)}" y="${by - (lineasB.length - 1) * tamB * 0.55 + k * tamB * 1.12 + tamB * 0.34}" font-size="${tamB}" font-weight="bold" text-anchor="start" fill="#ffffff">${escapar(lb)}</text>`);
      });
      by += paso;
    });
  }

  // ── 7) EL SELLO ──────────────────────────────────────────────────
  // Solo si el creativo lo manda. No se pone "GARANTIZADA" por decoración:
  // eso es una promesa al cliente, y la hace la empresa, no el montador.
  if (ficha.sello) {
    const r = Math.round(W * 0.085);
    const cx = W - margen - r;
    const cy = huecoArriba + r;
    const tamSello = Math.round(r * 0.34);
    svgFondo.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#0a0a0a" stroke="${acento}" stroke-width="${Math.round(r * 0.10)}"/>`,
      `<circle cx="${cx}" cy="${cy}" r="${Math.round(r * 0.80)}" fill="none" stroke="${acento}" stroke-width="2" opacity="0.6"/>`,
      `<text x="${cx}" y="${cy + tamSello * 0.36}" font-size="${tamSello}" font-weight="bold" fill="${acento}">${escapar(String(ficha.sello).toUpperCase().slice(0, 12))}</text>`);
  }

  // ── 8) EL PRODUCTO, sobre su podio ───────────────────────────────
  const anchoDisponible = W - margen * 2 - anchoBullets;
  const cajaFoto = Math.max(200, Math.min(
    anchoDisponible,
    Math.round(W * (vertical ? 0.62 : 0.56)),
    huecoAbajo - huecoArriba));

  const centroX = hayBullets
    ? Math.round(margen + anchoBullets + (W - margen - anchoBullets - margen) / 2)
    : Math.round(W / 2);
  const fotoX = Math.round(centroX - cajaFoto / 2);
  const fotoY = huecoArriba + Math.round((huecoAbajo - huecoArriba - cajaFoto) / 2);

  // El podio va DEBAJO de la foto: una elipse con halo. Es lo que hace que el
  // producto se apoye en algo en vez de flotar en el aire.
  const podioRx = Math.round(cajaFoto * 0.52);
  const podioRy = Math.round(cajaFoto * 0.10);
  const podioY = fotoY + cajaFoto - Math.round(podioRy * 0.6);
  svgFondo.push(
    `<ellipse cx="${centroX}" cy="${podioY}" rx="${podioRx}" ry="${podioRy}" fill="${acento}" opacity="0.16"/>`,
    `<ellipse cx="${centroX}" cy="${podioY}" rx="${Math.round(podioRx * 0.82)}" ry="${Math.round(podioRy * 0.78)}" fill="none" stroke="${acento}" stroke-width="3" opacity="0.85"/>`,
    `<ellipse cx="${centroX}" cy="${podioY + Math.round(podioRy * 0.55)}" rx="${Math.round(podioRx * 0.62)}" ry="${Math.round(podioRy * 0.5)}" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.25"/>`);

  const fotoLista = await sharp(foto)
    .resize(cajaFoto, cajaFoto, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();

  // ── El lienzo ────────────────────────────────────────────────────
  // Sin imagen de fondo, un degradado y dos rayas de luz. Cuesta cuatro
  // líneas de SVG y es la diferencia entre "pieza" y "diapositiva".
  const lienzo = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${fondo}" stop-opacity="1"/>
      <stop offset="55%" stop-color="#000000" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${fondo}" stop-opacity="1"/>
    </linearGradient>
  </defs>
  ${fondoImg ? '' : `<rect width="${W}" height="${H}" fill="${fondo}"/>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <g opacity="0.16" stroke="${acento}" stroke-width="${Math.round(W * 0.006)}">
    <line x1="${-W * 0.1}" y1="${H * 0.30}" x2="${W * 1.1}" y2="${H * 0.16}"/>
    <line x1="${-W * 0.1}" y1="${H * 0.86}" x2="${W * 1.1}" y2="${H * 0.72}"/>
  </g>`}
</svg>`;

  const textoFondo = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <g font-family="${TIPO}" text-anchor="middle">${svgFondo.join('\n')}</g>
</svg>`;

  const textoFrente = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <g font-family="${TIPO}" text-anchor="middle">${svgFrente.join('\n')}</g>
</svg>`;

  // El orden de las capas ES el diseño: fondo, textos de atrás y podio, el
  // producto encima de su podio, y por último precio y barra de pie, que no
  // los puede tapar nada.
  const png = await sharp(Buffer.from(lienzo))
    .composite([
      ...capas,
      { input: Buffer.from(textoFondo), left: 0, top: 0 },
      { input: fotoLista, left: fotoX, top: fotoY },
      { input: Buffer.from(textoFrente), left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();

  return { png, ancho: W, alto: H };
}

export default montarArte;
