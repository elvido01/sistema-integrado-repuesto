// =====================================================================
// Ventanas y aluminio (09/11/2026): medidas en pulgadas con fracciones,
// estados del proyecto y ayudas comunes (web y lo que use la app).
// =====================================================================

// "40" · "40.25" · "40 1/4" · "40-1/4" · "40 1 4" (número, numerador y
// denominador separados por espacio, como se escribe en el teclado del
// celular sin buscar la barra). Devuelve pulgadas en decimal o null.
export function leerPulgadas(texto) {
  const t = String(texto ?? '').trim().replace(/,/g, '.').replace(/[″"]/g, '').replace(/\s*-\s*/g, ' ');
  if (!t) return null;
  let m = t.match(/^(\d+(?:\.\d+)?)$/);
  if (m) return Number(m[1]);
  m = t.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/) || t.match(/^(\d+)\s+(\d+)\s+(\d+)$/);
  if (m) {
    const [, ent, num, den] = m.map(Number);
    if (!den || num >= den) return null;
    return ent + num / den;
  }
  m = t.match(/^(\d+)\s*\/\s*(\d+)$/);            // solo fracción: "3/4"
  if (m) {
    const [, num, den] = m.map(Number);
    if (!den || num >= den) return null;
    return num / den;
  }
  return null;
}

// 40.25 → "40 1/4" (a 1/16 más cercano). 40 → "40".
export function pulgadasTexto(valor) {
  const v = Number(valor);
  if (!Number.isFinite(v)) return '';
  let ent = Math.floor(v);
  let n16 = Math.round((v - ent) * 16);
  if (n16 === 16) { ent += 1; n16 = 0; }
  if (!n16) return String(ent);
  let num = n16; let den = 16;
  while (num % 2 === 0) { num /= 2; den /= 2; }
  return ent ? `${ent} ${num}/${den}` : `${num}/${den}`;
}

// Medida razonable para una ventana o puerta (pulgadas). Fuera de esto:
// "Revise la medida".
export const MEDIDA_MIN = 6;
export const MEDIDA_MAX = 400;
export const medidaRazonable = (v) => v != null && v >= MEDIDA_MIN && v <= MEDIDA_MAX;

export const ESTADOS_PROYECTO = [
  { k: 'sin_medir', t: 'Sin medir', c: 'bg-gray-100 text-gray-700 border-gray-300' },
  { k: 'medido', t: 'Medido', c: 'bg-sky-50 text-sky-700 border-sky-300' },
  { k: 'cotizado', t: 'Cotizado', c: 'bg-amber-50 text-amber-700 border-amber-300' },
  { k: 'aprobado', t: 'Aprobado', c: 'bg-indigo-50 text-indigo-700 border-indigo-300' },
  { k: 'fabricacion', t: 'En fabricación', c: 'bg-orange-50 text-orange-700 border-orange-300' },
  { k: 'instalado', t: 'Instalado', c: 'bg-teal-50 text-teal-700 border-teal-300' },
  { k: 'cobrado', t: 'Cobrado', c: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
  { k: 'cancelado', t: 'Cancelado', c: 'bg-red-50 text-red-700 border-red-300' },
];
export const estadoProyecto = (k) => ESTADOS_PROYECTO.find((e) => e.k === k) || ESTADOS_PROYECTO[0];

export const COLORES_ALUMINIO = ['Blanco', 'Negro', 'Inox', 'Plata', 'Bronce', 'Caoba'];

export const numeroProyecto = (n) => `PRY-${String(n || 0).padStart(4, '0')}`;

// ── Desglose (09/11/2026) ───────────────────────────────────────────────
// Medida de corte = (base ÷ (hojas si por_hoja)) − descuento, a 1/16".
// Cantidad = (cant_fija + cant_por_hoja × hojas) × cantidad de ventanas.
const a16 = (v) => Math.round(v * 16) / 16;

export function desgloseVentana(medida, piezas) {
  const hojas = Number(medida.hojas) || 1;
  const veces = Number(medida.cantidad) || 1;
  return (piezas || [])
    .filter((p) => p.activo !== false)
    .map((p) => {
      const base = p.base === 'alto' ? Number(medida.alto) : Number(medida.ancho);
      const largo = a16(base / (p.por_hoja ? hojas : 1) - Number(p.descuento || 0));
      const porVentana = Number(p.cant_fija || 0) + Number(p.cant_por_hoja || 0) * hojas;
      return { pieza: p, largo, cantidad: Math.max(0, porVentana) * veces, porVentana: Math.max(0, porVentana) };
    })
    .filter((c) => c.cantidad > 0 && c.largo > 0)
    .sort((a, b) => (a.pieza.orden || 0) - (b.pieza.orden || 0));
}

// ── Presupuesto (09/11/2026) ────────────────────────────────────────────
// Igual que vent_crear_cotizacion (SQL): por ventana, precio por pie²
// (ancho × alto ÷ 144 a 2 decimales, con mínimo) o fijo por unidad; el
// precio del color manda sobre el general (color ''). Precios con ITBIS.
const r2 = (v) => Math.round(v * 100) / 100;
export const pie2Ventana = (m) => r2((Number(m.ancho) * Number(m.alto)) / 144);

export function precioDeVentana(m, precios) {
  const delSistema = (precios || []).filter((p) => p.sistema_id === m.sistema_id);
  return delSistema.find((p) => p.color && p.color === (m.color || '')) || delSistema.find((p) => !p.color) || null;
}

export function presupuestoProyecto(medidas, precios, extras = []) {
  const lineas = [];
  const faltan = [];
  for (const m of medidas) {
    const p = precioDeVentana(m, precios);
    if (!p || !p.producto_id || !(Number(p.precio) > 0)) { faltan.push(m); continue; }
    const pie2 = Math.max(pie2Ventana(m), Number(p.minimo_pie2) || 0);
    const unitario = p.modo === 'unidad' ? Number(p.precio) : r2(pie2 * Number(p.precio));
    lineas.push({ tipo: 'ventana', medida: m, precio: p, pie2, cantidad: Number(m.cantidad) || 1, unitario, importe: r2(unitario * (Number(m.cantidad) || 1)) });
  }
  for (const e of extras) lineas.push({ tipo: 'extra', extra: e, cantidad: Number(e.cantidad) || 0, unitario: Number(e.precio) || 0, importe: r2((Number(e.precio) || 0) * (Number(e.cantidad) || 0)) });
  const total = r2(lineas.reduce((s, l) => s + l.importe, 0));
  return { lineas, faltan, total };
}

// Barras: "primero el más largo" en la barra donde quepa (con lo que se
// pierde en cada corte). Devuelve cuántas barras y qué va en cada una.
export function planBarras(cortes, largoBarra = 240, merma = 0.125) {
  const lista = [...cortes].sort((a, b) => b - a);
  const barras = [];
  const sinCaber = [];
  for (const c of lista) {
    if (c > largoBarra) { sinCaber.push(c); continue; }
    let b = barras.find((x) => x.libre >= c + (x.cortes.length ? merma : 0));
    if (!b) { b = { cortes: [], libre: largoBarra }; barras.push(b); }
    b.libre -= c + (b.cortes.length ? merma : 0);
    b.cortes.push(c);
  }
  return { barras: barras.map((b) => ({ cortes: b.cortes, sobrante: a16(b.libre) })), sinCaber };
}

// Materiales de un proyecto: perfiles (por perfil + color: pulgadas, pies,
// metros, barras) y cristales (cada pedazo con su área en pie²).
export function materialesProyecto(medidas, piezasPorSistema, config = {}) {
  const largoBarra = Number(config.largo_barra) || 240;
  const merma = config.merma_corte != null ? Number(config.merma_corte) : 0.125;
  const perfiles = new Map();
  const cristales = [];
  for (const m of medidas) {
    const cortes = desgloseVentana(m, piezasPorSistema[m.sistema_id] || []);
    const anchos = cortes.filter((c) => c.pieza.tipo === 'cristal' && c.pieza.base === 'ancho');
    const altos = cortes.filter((c) => c.pieza.tipo === 'cristal' && c.pieza.base === 'alto');
    if (anchos[0] && altos[0]) {
      const n = Math.min(anchos[0].cantidad, altos[0].cantidad);
      cristales.push({ medida: m, ancho: anchos[0].largo, alto: altos[0].largo, cantidad: n, pie2: Math.round(((anchos[0].largo * altos[0].largo) / 144) * n * 100) / 100 });
    }
    for (const c of cortes.filter((x) => x.pieza.tipo === 'perfil')) {
      const nombre = c.pieza.perfil || c.pieza.nombre;
      const clave = `${nombre}|${m.color || ''}`;
      if (!perfiles.has(clave)) perfiles.set(clave, { perfil: nombre, color: m.color || '', cortes: [] });
      for (let i = 0; i < c.cantidad; i++) perfiles.get(clave).cortes.push(c.largo);
    }
  }
  const lista = [...perfiles.values()].map((p) => {
    const pulgadas = p.cortes.reduce((s, x) => s + x, 0);
    const plan = planBarras(p.cortes, largoBarra, merma);
    return { ...p, pulgadas, pies: pulgadas / 12, metros: pulgadas * 0.0254, barras: plan.barras.length, plan };
  }).sort((a, b) => a.perfil.localeCompare(b.perfil) || a.color.localeCompare(b.color));
  return { perfiles: lista, cristales, totalPie2: cristales.reduce((s, c) => s + c.pie2, 0), largoBarra, merma };
}
