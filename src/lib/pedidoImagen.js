// ============================================================
// pedidoImagen.js — el pedido como imagen, para mandarlo por WhatsApp
// ============================================================
// Hasta hoy el pedido al suplidor se mandaba a capturas de pantalla: abrir el
// PDF, recortar, y si la orden era larga, tres o cuatro capturas seguidas que
// el suplidor tenía que ir cosiendo. Esto dibuja la orden entera de una vez.
//
// Solo tres columnas —CÓDIGO, DESCRIPCIÓN, CANTIDAD—, que es lo único que el
// suplidor necesita para despachar. Ni precios, ni costos, ni márgenes: eso es
// de la casa y no tiene por qué viajar en la foto.
//
// >>> POR QUÉ CANVAS Y NO html-to-image <<<
// El proyecto ya usa html-to-image en escposRaster, pero aquí hace falta
// PARTIR el pedido en varias imágenes cuando es largo, y controlar el corte de
// las descripciones. Dibujando a mano no hay CSS heredado que se cuele ni
// fuentes que carguen tarde: lo que se mide es lo que sale.
//
// Se dibuja al doble de tamaño (ESCALA) porque WhatsApp recomprime, y un texto
// fino se convierte en puré. A 2x aguanta.
// ============================================================

const ANCHO = 820;           // ancho lógico; el lienzo real va a ANCHO * ESCALA
const ESCALA = 2;
const FILAS_POR_IMAGEN = 20; // más que esto y la imagen sale tan larga que WhatsApp la encoge hasta lo ilegible

const MARGEN = 24;
const COL_CODIGO = 170;
const COL_CANT = 110;
const ALTO_CABECERA = 120;   // deja aire entre los datos de arriba y la cabecera de la tabla
const ALTO_ENCABEZADO_TABLA = 40;
const ALTO_LINEA = 26;       // por cada renglón de descripción
const RELLENO_FILA = 18;     // aire arriba+abajo de cada fila
const ALTO_PIE = 46;

const FUENTE = "'Segoe UI', Roboto, Arial, sans-serif";

const TINTA = {
  fondo: '#ffffff',
  titulo: '#0f172a',
  suave: '#64748b',
  cabeceraTabla: '#0f172a',
  textoCabecera: '#ffffff',
  filaPar: '#ffffff',
  filaImpar: '#f1f5f9',
  linea: '#cbd5e1',
  texto: '#0f172a',
  cantidad: '#1d4ed8',
};

// Corta un texto en varios renglones que quepan en `ancho`. Devuelve como
// mucho `maxLineas`; lo que sobre se remata con puntos suspensivos, pero con
// dos renglones cabe entera casi cualquier descripción del catálogo.
function repartirEnLineas(ctx, texto, ancho, maxLineas = 2) {
  const palabras = String(texto || '').trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return [''];

  const lineas = [];
  let actual = '';

  for (const palabra of palabras) {
    const intento = actual ? `${actual} ${palabra}` : palabra;
    if (ctx.measureText(intento).width <= ancho) {
      actual = intento;
      continue;
    }
    if (actual) lineas.push(actual);
    actual = palabra;
    if (lineas.length === maxLineas) break;
  }
  if (lineas.length < maxLineas && actual) lineas.push(actual);

  if (lineas.length === maxLineas) {
    // ¿Quedó texto fuera? Se marca, para que nadie crea que la pieza se llama así.
    const cabeTodo = lineas.join(' ') === palabras.join(' ');
    if (!cabeTodo) {
      let ultima = lineas[maxLineas - 1];
      while (ultima.length > 1 && ctx.measureText(`${ultima}…`).width > ancho) {
        ultima = ultima.slice(0, -1);
      }
      lineas[maxLineas - 1] = `${ultima}…`;
    }
  }
  return lineas.length ? lineas : [''];
}

const cantidadTexto = (d) => {
  const n = Number(d?.cantidad) || 0;
  const num = Number.isInteger(n) ? String(n) : n.toFixed(2);
  const und = String(d?.unidad_medida || d?.unidad || 'UND').toUpperCase();
  return `${num} ${und}`;
};

function dibujarPagina({ filas, pagina, paginas, cabecera }) {
  const lienzo = document.createElement('canvas');
  const ctx = lienzo.getContext('2d');

  const anchoDesc = ANCHO - MARGEN * 2 - COL_CODIGO - COL_CANT;

  // Primero se mide: cuántos renglones ocupa cada descripción decide el alto
  // del lienzo. Medir exige la fuente puesta, así que se pone antes.
  ctx.font = `500 15px ${FUENTE}`;
  const medidas = filas.map((d) => repartirEnLineas(ctx, d.descripcion, anchoDesc - 16));
  const altoFilas = medidas.reduce((suma, l) => suma + l.length * ALTO_LINEA + RELLENO_FILA, 0);

  const alto = ALTO_CABECERA + ALTO_ENCABEZADO_TABLA + altoFilas + ALTO_PIE + MARGEN;

  lienzo.width = ANCHO * ESCALA;
  lienzo.height = alto * ESCALA;
  ctx.scale(ESCALA, ESCALA);

  ctx.fillStyle = TINTA.fondo;
  ctx.fillRect(0, 0, ANCHO, alto);
  ctx.textBaseline = 'middle';

  // ---------------------------------------------------------- cabecera
  let y = MARGEN + 6;
  ctx.fillStyle = TINTA.titulo;
  ctx.font = `800 26px ${FUENTE}`;
  ctx.textAlign = 'left';
  ctx.fillText(cabecera.titulo, MARGEN, y + 10);

  ctx.textAlign = 'right';
  ctx.font = `700 15px ${FUENTE}`;
  ctx.fillStyle = TINTA.suave;
  ctx.fillText(cabecera.numero, ANCHO - MARGEN, y + 4);
  if (paginas > 1) {
    ctx.font = `700 13px ${FUENTE}`;
    ctx.fillText(`Parte ${pagina} de ${paginas}`, ANCHO - MARGEN, y + 24);
  }

  y += 36;
  ctx.textAlign = 'left';
  ctx.font = `600 15px ${FUENTE}`;
  ctx.fillStyle = TINTA.texto;
  ctx.fillText(cabecera.suplidor, MARGEN, y + 8);

  y += 22;
  ctx.font = `400 13px ${FUENTE}`;
  ctx.fillStyle = TINTA.suave;
  ctx.fillText(cabecera.pie, MARGEN, y + 8);

  // ----------------------------------------------------- encabezado tabla
  y = ALTO_CABECERA;
  ctx.fillStyle = TINTA.cabeceraTabla;
  ctx.fillRect(MARGEN, y, ANCHO - MARGEN * 2, ALTO_ENCABEZADO_TABLA);
  ctx.fillStyle = TINTA.textoCabecera;
  ctx.font = `800 13px ${FUENTE}`;
  ctx.textAlign = 'left';
  ctx.fillText('CÓDIGO', MARGEN + 12, y + ALTO_ENCABEZADO_TABLA / 2);
  ctx.fillText('DESCRIPCIÓN', MARGEN + COL_CODIGO + 12, y + ALTO_ENCABEZADO_TABLA / 2);
  ctx.textAlign = 'right';
  ctx.fillText('CANT.', ANCHO - MARGEN - 12, y + ALTO_ENCABEZADO_TABLA / 2);

  // ------------------------------------------------------------- filas
  y += ALTO_ENCABEZADO_TABLA;
  filas.forEach((d, i) => {
    const lineas = medidas[i];
    const altoFila = lineas.length * ALTO_LINEA + RELLENO_FILA;

    ctx.fillStyle = i % 2 === 0 ? TINTA.filaPar : TINTA.filaImpar;
    ctx.fillRect(MARGEN, y, ANCHO - MARGEN * 2, altoFila);

    const medio = y + altoFila / 2;

    ctx.textAlign = 'left';
    ctx.fillStyle = TINTA.texto;
    ctx.font = `700 15px ${FUENTE}`;
    ctx.fillText(String(d.codigo || '—'), MARGEN + 12, medio);

    ctx.font = `500 15px ${FUENTE}`;
    const arranque = medio - ((lineas.length - 1) * ALTO_LINEA) / 2;
    lineas.forEach((linea, j) => {
      ctx.fillText(linea, MARGEN + COL_CODIGO + 12, arranque + j * ALTO_LINEA);
    });

    ctx.textAlign = 'right';
    ctx.fillStyle = TINTA.cantidad;
    ctx.font = `800 16px ${FUENTE}`;
    ctx.fillText(cantidadTexto(d), ANCHO - MARGEN - 12, medio);

    y += altoFila;
    ctx.strokeStyle = TINTA.linea;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(MARGEN, y - 0.5);
    ctx.lineTo(ANCHO - MARGEN, y - 0.5);
    ctx.stroke();
  });

  // --------------------------------------------------------------- pie
  ctx.textAlign = 'left';
  ctx.font = `700 14px ${FUENTE}`;
  ctx.fillStyle = TINTA.suave;
  ctx.fillText(cabecera.resumen, MARGEN, y + ALTO_PIE / 2);

  return new Promise((resolver) => {
    lienzo.toBlob((blob) => resolver(blob), 'image/png');
  });
}

/**
 * Dibuja el pedido. Devuelve una imagen, o varias si es largo.
 * Solo entran las líneas que se le piden al suplidor.
 */
export async function generarImagenesPedido({ orden, suplidor, empresa, detalles }) {
  const filas = (detalles || []).filter((d) => d && (d.codigo || d.descripcion));
  if (filas.length === 0) return [];

  const paginas = Math.ceil(filas.length / FILAS_POR_IMAGEN);
  const unidades = filas.reduce((s, d) => s + (Number(d.cantidad) || 0), 0);

  const fecha = orden?.fecha_orden
    ? new Date(`${String(orden.fecha_orden).slice(0, 10)}T00:00:00`)
    : new Date();

  const cabecera = {
    titulo: 'PEDIDO',
    numero: orden?.numero ? `ORD-${String(orden.numero).padStart(4, '0')}` : 'BORRADOR',
    suplidor: suplidor?.nombre ? `Para: ${suplidor.nombre}` : 'Para: (sin suplidor)',
    pie: [
      empresa?.nombre || '',
      fecha.toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' }),
      empresa?.telefono || '',
    ].filter(Boolean).join('  ·  '),
    resumen: `${filas.length} ${filas.length === 1 ? 'artículo' : 'artículos'}  ·  ${
      Number.isInteger(unidades) ? unidades : unidades.toFixed(2)} unidades en total`,
  };

  const imagenes = [];
  for (let p = 0; p < paginas; p += 1) {
    const trozo = filas.slice(p * FILAS_POR_IMAGEN, (p + 1) * FILAS_POR_IMAGEN);
    // El resumen del total va solo en la última: en las de en medio confunde.
    const cab = p === paginas - 1
      // En la última, el total es del PEDIDO ENTERO, no de lo que se ve en
      // esta imagen: quien recibe la parte 2 no debe sumar de cabeza.
      ? { ...cabecera, resumen: paginas > 1 ? `Total del pedido: ${cabecera.resumen}` : cabecera.resumen }
      : { ...cabecera, resumen: `Artículos ${p * FILAS_POR_IMAGEN + 1} al ${p * FILAS_POR_IMAGEN + trozo.length}  ·  sigue…` };
    // eslint-disable-next-line no-await-in-loop
    const blob = await dibujarPagina({ filas: trozo, pagina: p + 1, paginas, cabecera: cab });
    if (blob) imagenes.push(blob);
  }
  return imagenes;
}

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Entrega las imágenes por donde el aparato deje.
 *
 * En el teléfono existe la hoja de compartir del sistema y sale WhatsApp
 * directo. En el mostrador (ratón, WhatsApp Web ya abierto en otra pestaña) lo
 * más corto es el PORTAPAPELES: se pega con Ctrl+V y ya está. Descargar un
 * archivo para luego buscarlo con el clip es el camino largo, así que solo se
 * usa cuando el portapapeles no está disponible o hay varias imágenes.
 */
export async function compartirImagenes(imagenes, nombreBase) {
  if (!imagenes?.length) return { via: 'nada' };

  const archivos = imagenes.map((blob, i) => new File(
    [blob],
    imagenes.length > 1 ? `${nombreBase}-${i + 1}.png` : `${nombreBase}.png`,
    { type: 'image/png' },
  ));

  const esTactil = typeof window !== 'undefined'
    && window.matchMedia?.('(pointer: coarse)').matches;

  if (esTactil && navigator.canShare?.({ files: archivos })) {
    try {
      await navigator.share({ files: archivos, title: nombreBase });
      return { via: 'share', cantidad: archivos.length };
    } catch (e) {
      if (e?.name === 'AbortError') return { via: 'cancelado' };
      // Si la hoja de compartir falla, se sigue por el camino de siempre.
    }
  }

  let copiada = false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': imagenes[0] })]);
    copiada = true;
  } catch {
    // Sin permiso, sin HTTPS o navegador viejo: se descarga y ya.
  }

  if (!copiada || archivos.length > 1) {
    archivos.forEach((f) => descargar(f, f.name));
  }

  return { via: copiada ? 'portapapeles' : 'descarga', cantidad: archivos.length, copiada };
}
