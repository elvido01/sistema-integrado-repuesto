// =====================================================================
// Emparejar una línea de factura de compra (leída de la foto) con un
// producto del inventario. (16/11/2026)
// ---------------------------------------------------------------------
// Antes bastaba el código: el "004264" de Pedro Racing (motor de arranque,
// nuestro V004264) caía en el "004264" de G&G (una varilla de freno). Ahora:
//   1. memoria del suplidor (su código → nuestra pieza, aprendido antes);
//   2. la misma REFERENCIA (mejor del mismo suplidor);
//   3. el código igual o con letras delante (V004264, TVS003730), solo si es
//      del mismo suplidor o la descripción se parece.
// Si el código existe pero es otra pieza: sin producto y con un aviso.
// =====================================================================
import { supabase } from '@/lib/customSupabaseClient';

const CAMPOS = 'id, codigo, descripcion, costo, itbis_pct, referencia, suplidor_id, marca_id, modelos_ids';
const VACIAS = new Set(['DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'PARA', 'CON', 'SIN', 'POR', 'UND', 'UNIDAD', 'PAR', 'JUEGO', 'KIT', 'SET', 'TIPO', 'NEW', 'NUEVO']);

const sinTildes = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
/** "31200-CG200-VI" → "31200CG200VI": la referencia sin espacios ni signos. */
export const normRef = (v) => sinTildes(v).replace(/[^A-Z0-9]/g, '');
/** Palabras que distinguen la pieza ("CG-200" = "CG200"), sin las de relleno. */
export const palabras = (v) => new Set(
  sinTildes(v).split(/[\s/,()]+/).map((p) => p.replace(/[^A-Z0-9]/g, ''))
    .filter((p) => p.length >= 3 && !VACIAS.has(p)),
);
export const palabrasEnComun = (a, b) => {
  const B = palabras(b);
  let n = 0;
  for (const p of palabras(a)) if (B.has(p)) n += 1;
  return n;
};

/**
 * Elige entre los candidatos (sin tocar la base: se prueba solo).
 * item: { code, reference, description }; candidatos: productos.
 * → { producto, motivo, aviso }
 */
export function elegirProducto(item, suplidorId, candidatos) {
  const code = sinTildes(item.code).trim();
  const ref = normRef(item.reference);
  const desc = item.description || '';
  const unicos = [...new Map((candidatos || []).filter(Boolean).map((p) => [p.id, p])).values()];
  const mismoSup = (p) => !!suplidorId && p.suplidor_id === suplidorId;
  const comun = (p) => palabrasEnComun(desc, `${p.descripcion || ''} ${p.referencia || ''}`);

  // 2a. El mismo código y claramente el mismo artículo (mismo suplidor con
  // alguna palabra en común, o 2+ palabras en común): gana. En Morla el
  // catálogo tiene piezas repetidas con la misma referencia; la del código
  // del suplidor es la que se usa hoy.
  const exacto0 = unicos.find((p) => sinTildes(p.codigo).trim() === code) || null;
  if (exacto0 && desc.trim()) {
    const n = comun(exacto0);
    if ((mismoSup(exacto0) && n >= 1) || n >= 2) return { producto: exacto0, motivo: 'codigo', aviso: null };
  }

  // 2b. Misma referencia (al menos 4 caracteres para no casar "A1" con todo).
  if (ref.length >= 4) {
    const porRef = unicos.filter((p) => normRef(p.referencia) === ref);
    const elegido = porRef.find(mismoSup) || (porRef.length === 1 ? porRef[0] : null);
    if (elegido) return { producto: elegido, motivo: 'referencia', aviso: null };
  }

  // 3. Código igual o con letras delante (V004264 / TVS003730).
  const exacto = unicos.find((p) => sinTildes(p.codigo).trim() === code) || null;
  const conPrefijo = code.length >= 4
    ? unicos.filter((p) => p !== exacto && new RegExp(`^[A-Z]{1,4}-?${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`).test(sinTildes(p.codigo).trim()))
    : [];
  const pareceMismo = (p) => {
    if (!desc.trim()) return true;           // la foto no trajo descripción: no hay con qué dudar
    const n = comun(p);
    if (mismoSup(p)) return n >= 1 || palabras(desc).size === 0;
    if (!p.suplidor_id) return n >= 1;
    return n >= 2;
  };
  if (exacto && pareceMismo(exacto)) return { producto: exacto, motivo: 'codigo', aviso: null };
  const prefijo = conPrefijo.filter((p) => mismoSup(p) && (comun(p) >= 1 || !desc.trim()))
    .sort((a, b) => comun(b) - comun(a))[0];
  if (prefijo) return { producto: prefijo, motivo: 'codigo_suplidor', aviso: null };

  if (exacto) {
    return {
      producto: null,
      motivo: 'otro_articulo',
      aviso: `El código ${exacto.codigo} ya es "${String(exacto.descripcion || '').trim()}": no parece el mismo artículo. Búsquelo o créelo con otro código (p. ej. con la letra del suplidor delante).`,
    };
  }
  return { producto: null, motivo: 'nuevo', aviso: null };
}

/** Busca los candidatos en la base y elige. codigosSuplidor: memoria del suplidor. */
export async function buscarProductoDeLinea(item, suplidorId, codigosSuplidor = {}) {
  const code = String(item.code || '').trim();
  if (!code) return { producto: null, porMemoria: false, aviso: null };

  // 1. Memoria del suplidor: es lo más seguro (alguien ya lo emparejó a mano).
  const memoria = codigosSuplidor[code.toUpperCase()];
  if (memoria?.producto_id) {
    const { data } = await supabase.from('productos').select(CAMPOS).eq('id', memoria.producto_id).maybeSingle();
    if (data) return { producto: data, porMemoria: true, aviso: null };
  }

  const esc = (v) => String(v).replace(/[%_\\]/g, (c) => `\\${c}`);
  const consultas = [supabase.from('productos').select(CAMPOS).ilike('codigo', esc(code)).limit(5)];
  if (code.length >= 4) consultas.push(supabase.from('productos').select(CAMPOS).ilike('codigo', `%${esc(code)}`).limit(15));
  if (normRef(item.reference).length >= 4) consultas.push(supabase.from('productos').select(CAMPOS).ilike('referencia', esc(String(item.reference).trim())).limit(10));
  const res = await Promise.all(consultas.map((q) => q.then((r) => r.data || [], () => [])));
  const r = elegirProducto(item, suplidorId, res.flat());
  return { producto: r.producto, porMemoria: false, aviso: r.aviso, motivo: r.motivo };
}
