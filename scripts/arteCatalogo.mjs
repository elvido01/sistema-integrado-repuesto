// ============================================================
// EL ARTE "CATÁLOGO" — estilo Vini / EcoSpeed con la marca de Morla
// ============================================================
// (01/11/2026) El dueño enseñó las piezas de catálogo de sus suplidores
// (Vini OEM Parts, EcoSpeed): fondo blanco, el producto limpio en el centro,
// el logo arriba a la izquierda, un sello arriba a la derecha y una franja
// abajo con el tipo de pieza, la moto, el CÓDIGO y —decisión suya— el
// PRECIO. Colores de Morla: azul del escudo + naranja.
//
// Reparto del trabajo (igual que v3): la IA (creativo-escena, formato
// 'catalogo') solo deja el producto sobre blanco, sin manos ni fondo y sin
// letras. Todo lo escrito sale de aquí, con los datos del catálogo: un
// modelo de imagen cambia letras y números, y un código o un precio mal
// escrito no se puede publicar.
//
// La IA decide CUÁNDO va este estilo (mirando la foto); esto solo lo dibuja.
// ============================================================

import sharp from 'sharp';

const FORMATOS = {
  feed:     { ancho: 1080, alto: 1080 },
  historia: { ancho: 1080, alto: 1920 },
};
const AZUL = '#0b1e3a';
const AZUL_2 = '#132d57';
const NARANJA = '#f5a623';
const ORO = '#ffb21e';
// Letra estrecha y gruesa como la de las franjas de los suplidores. Arial
// Narrow está en Windows (donde corre el Creativo); las demás, por si acaso.
const ESTRECHA = "'Arial Narrow', 'Liberation Sans Narrow', 'Roboto Condensed', 'DejaVu Sans Condensed', sans-serif";
const NORMAL = "'Segoe UI', 'DejaVu Sans', Arial, sans-serif";

const escapar = (t) => String(t ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export const precioCatalogo = (p) => {
  const n = Math.round(Number(p) || 0);
  return n > 0 ? `RD$ ${n.toLocaleString('en-US')}` : '';
};

// El tipo y la moto. Si la IA no los separó (o inventó palabras), se parte
// la descripción: lo que va antes del primer modelo de moto es el tipo.
const normal = (t) => String(t || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim();
export function lineasCatalogo(descripcion, propuesta = null) {
  const desc = String(descripcion || '').replace(/\s+/g, ' ').trim().toUpperCase();
  const palabrasDesc = new Set(normal(desc).split(' ').map((p) => p.replace(/\s/g, '')));
  // Se acepta la propuesta solo si no trae palabras que no estén en la
  // descripción (permitiendo separar "C110" en "C 110").
  const valida = (t) => {
    const unidas = normal(desc).replace(/ /g, '');
    return normal(t).split(' ').filter(Boolean).every((p) => palabrasDesc.has(p) || unidas.includes(p));
  };
  if (propuesta?.tipo && valida(propuesta.tipo) && (!propuesta.moto || valida(propuesta.moto))) {
    return { tipo: String(propuesta.tipo).toUpperCase().slice(0, 40), moto: String(propuesta.moto || '').toUpperCase().slice(0, 34) };
  }
  // Respaldo: el primer token que parece modelo (letras+números como CG200,
  // C110, AX100, o un número de 2-3 cifras) abre la parte de la moto.
  const t = desc.split(' ');
  // "DTS-11L" o "1L" son litros, no motos.
  // (XR150L sí es moto: solo se descarta el número suelto o tras guion.)
  const esModelo = (p) => !/(^|-)\d+L$/.test(p) &&(/^[A-Z]{1,4}-?\d{2,3}[A-Z]?$/.test(p) || /^\d{2,3}$/.test(p));
  const i = t.findIndex((p, k) => k > 0 && esModelo(p));
  if (i > 0) return { tipo: t.slice(0, i).join(' ').slice(0, 40), moto: t.slice(i).join(' ').slice(0, 34) };
  return { tipo: desc.slice(0, 40), moto: '' };
}

// El sello redondo de la esquina, con la marca de la casa (como el "P" de
// los suplidores, pero de Morla): anillo naranja, centro azul, estrellas.
function sello(cx, cy, r) {
  // librsvg no dibuja textPath: cada letra del aro se coloca y gira a mano.
  const texto = 'CALIDAD · GARANTÍA · CALIDAD · GARANTÍA · ';
  const letras = [...texto];
  const ra = r * 0.79;
  const aro = letras.map((ch, k) => {
    const ang = (k / letras.length) * 360 - 90;
    const rad = (ang * Math.PI) / 180;
    const x = (cx + ra * Math.cos(rad)).toFixed(1), y = (cy + ra * Math.sin(rad)).toFixed(1);
    return `<text x="${x}" y="${y}" transform="rotate(${(ang + 90).toFixed(1)} ${x} ${y})" text-anchor="middle" dominant-baseline="central">${escapar(ch)}</text>`;
  }).join('');
  return `
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${NARANJA}"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.93}" fill="#ffffff"/>
    <g font-family="${NORMAL}" font-weight="700" font-size="${Math.round(r * 0.16)}" fill="${AZUL}">${aro}</g>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.6}" fill="${AZUL}"/>
    <text x="${cx}" y="${cy + r * 0.14}" text-anchor="middle" font-family="${ESTRECHA}" font-weight="700" font-size="${Math.round(r * 0.46)}" fill="${ORO}">100%</text>
    <text x="${cx}" y="${cy + r * 0.40}" text-anchor="middle" font-family="${NORMAL}" font-size="${Math.round(r * 0.15)}" fill="#ffffff">★ ★ ★</text>`;
}

/**
 * Monta la pieza. `escena` = el producto sobre blanco (de creativo-escena);
 * si no hay, la foto real tal cual.
 */
export async function montarCatalogo({ escena, logo, formato = 'feed', producto = {}, lineas = null, telefono = null }) {
  const { ancho: W, alto: H } = FORMATOS[formato] || FORMATOS.feed;
  const vertical = H > W;
  const m = Math.round(W * 0.055);
  // Sin moto (un aceite, una bujía): el nombre va en grande y arriba, chico,
  // "DISPONIBLE" — la existencia se confirma antes de aprobar.
  const partes = lineasCatalogo(producto.descripcion, lineas);
  const tipo = partes.moto ? partes.tipo : 'DISPONIBLE';
  const moto = partes.moto || partes.tipo;
  const precio = precioCatalogo(producto.precio);
  const codigo = String(producto.codigo || '').toUpperCase().slice(0, 18);

  // ── La franja de abajo (alto según formato) ──
  const altoFranja = Math.round(vertical ? H * 0.135 : H * 0.17);
  const yFranja = H - altoFranja - (vertical ? Math.round(H * 0.07) : Math.round(m * 0.6));
  const corte = Math.round(W * 0.56);           // donde empieza el bloque del código
  const inclin = Math.round(altoFranja * 0.32); // el corte en diagonal
  const mitad = Math.round(altoFranja * 0.44);

  // ── Cabecera: logo y sello ──
  const altoCabecera = Math.round(vertical ? H * 0.12 : H * 0.15);
  const capas = [];
  if (logo) {
    const anchoLogo = Math.round(W * (vertical ? 0.26 : 0.2));
    const l = await sharp(logo).resize(anchoLogo, altoCabecera, { fit: 'inside' }).png().toBuffer();
    capas.push({ input: l, left: m, top: m });
  }

  // ── El producto: se recorta el blanco que sobra y se centra en el hueco ──
  const yHueco = m + altoCabecera + Math.round(H * 0.01);
  const altoHueco = yFranja - yHueco - Math.round(H * 0.02);
  const anchoHueco = W - m * 2;
  let pieza = await sharp(escena).flatten({ background: '#ffffff' }).png().toBuffer();
  try {
    pieza = await sharp(pieza).trim({ background: '#ffffff', threshold: 18 }).png().toBuffer();
  } catch { /* imagen sin bordes que recortar */ }
  pieza = await sharp(pieza).resize(Math.round(anchoHueco * 0.92), Math.round(altoHueco * 0.94), { fit: 'inside' }).png().toBuffer();
  const meta = await sharp(pieza).metadata();
  capas.unshift({ input: pieza, left: Math.round((W - meta.width) / 2), top: yHueco + Math.round((altoHueco - meta.height) / 2) });

  // ── Textos de la franja ──
  const xIzqCalc = (mm, ww) => mm + Math.round(ww * 0.02);
  // Que no se monte sobre el bloque del código: se achica hasta caber.
  // Arial Narrow negrita mide ~0.47 del tamaño por letra.
  const cabe = (t, ancho, tam) => Math.min(tam, Math.floor(ancho / Math.max(1, String(t).length * 0.47)));
  const anchoIzq = corte - inclin - xIzqCalc(m, W) - Math.round(W * 0.025);
  const tamMoto = cabe(moto, anchoIzq, Math.round(altoFranja * 0.42));
  // La línea de arriba nunca más grande que la de la moto (se leía al revés).
  const tamTipo = Math.min(cabe(tipo, anchoIzq + Math.round(inclin * 0.5), Math.round(altoFranja * 0.22)), Math.round(tamMoto * 0.62));
  // El bloque de la derecha mide lo mismo en los dos formatos: el código y
  // el precio se achican para no salirse.
  const anchoDer = (W - m) - corte - Math.round(W * 0.03);
  const tamCodigo = cabe(`CÓDIGO: ${codigo}`, anchoDer, Math.round(altoFranja * 0.25));
  const tamPrecio = cabe(precio, anchoDer + Math.round(inclin * 0.6), Math.round(altoFranja * 0.42));
  const xIzq = m + Math.round(W * 0.02);
  const xDer = W - m - Math.round(W * 0.02);

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${sello(W - m - Math.round(W * 0.075), m + Math.round(W * 0.075), Math.round(W * 0.075))}
    <!-- franja: azul a la izquierda, bloque del código en diagonal -->
    <rect x="${m}" y="${yFranja}" width="${W - m * 2}" height="${altoFranja}" fill="${AZUL}"/>
    <rect x="${m}" y="${yFranja}" width="${W - m * 2}" height="${mitad}" fill="${AZUL_2}"/>
    <polygon points="${corte},${yFranja} ${W - m},${yFranja} ${W - m},${yFranja + mitad} ${corte - inclin * 0.44},${yFranja + mitad}" fill="${NARANJA}"/>
    <polygon points="${corte - inclin * 0.44},${yFranja + mitad} ${W - m},${yFranja + mitad} ${W - m},${yFranja + altoFranja} ${corte - inclin},${yFranja + altoFranja}" fill="#05101f"/>
    <rect x="${m}" y="${yFranja + altoFranja - 6}" width="${corte - inclin - m}" height="6" fill="${NARANJA}"/>
    <g font-family="${ESTRECHA}" font-weight="700">
      <text x="${xIzq}" y="${yFranja + mitad * 0.70}" font-size="${tamTipo}" fill="#ffffff" letter-spacing="1">${escapar(tipo)}</text>
      <text x="${xIzq}" y="${yFranja + mitad + (altoFranja - mitad) * 0.74}" font-size="${tamMoto}" fill="#ffffff">${escapar(moto || '')}</text>
      ${codigo ? `<text x="${xDer}" y="${yFranja + mitad * 0.72}" text-anchor="end" font-size="${tamCodigo}" fill="${AZUL}">CÓDIGO: <tspan font-size="${Math.round(tamCodigo * 1.08)}">${escapar(codigo)}</tspan></text>` : ''}
      ${precio ? `<text x="${xDer}" y="${yFranja + mitad + (altoFranja - mitad) * 0.78}" text-anchor="end" font-size="${tamPrecio}" fill="${ORO}">${escapar(precio)}</text>` : ''}
    </g>
    ${vertical && telefono ? `<text x="${W / 2}" y="${H - Math.round(H * 0.028)}" text-anchor="middle" font-family="${NORMAL}" font-weight="700" font-size="${Math.round(W * 0.042)}" fill="${AZUL}">WhatsApp ${escapar(telefono)}</text>` : ''}
  </svg>`;
  capas.push({ input: Buffer.from(svg), left: 0, top: 0 });

  const png = await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
    .composite(capas).png().toBuffer();
  return { png, ancho: W, alto: H, lineas: partes };
}
