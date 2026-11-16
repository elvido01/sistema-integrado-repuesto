// =====================================================================
// Emparejar una línea de factura de compra (leída de la foto) con un
// producto del inventario. (16/11/2026)
// ---------------------------------------------------------------------
// Antes bastaba el código: el "004264" de Pedro Racing (motor de arranque,
// nuestro V004264) caía en el "004264" de G&G (una varilla de freno). Ahora:
//   1. memoria del suplidor (su código → nuestra pieza, aprendido antes);
//   2a. el mismo código del mismo suplidor, o con alguna palabra en común;
//   2b. la misma REFERENCIA (mejor del mismo suplidor);
//   3. el código con letras delante (V004264, TVS003730), del mismo suplidor.
// Si el código existe pero es otra pieza: sin producto y con un aviso.
// =====================================================================
import { supabase } from '@/lib/customSupabaseClient';

const CAMPOS = 'id, codigo, descripcion, costo, itbis_pct, referencia, suplidor_id, marca_id, modelos_ids';
const VACIAS = new Set(['DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'PARA', 'CON', 'SIN', 'POR', 'UND', 'UNIDAD', 'PAR', 'JUEGO', 'KIT', 'SET', 'TIPO', 'NEW', 'NUEVO']);

const sinTildes = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const escRegex = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** "31200-CG200-VI" → "31200CG200VI": la referencia sin espacios ni signos. */
export const normRef = (v) => sinTildes(v).replace(/[^A-Z0-9]/g, '');
/** Palabras que distinguen la pieza ("CG-200" = "CG200"), sin las de relleno. */
export const palabras = (v) => new Set(
  sinTildes(v).split(/[\s/,()]+/).map((p) => p.replace(/[^A-Z0-9]/g, ''))
    .filter((p) => p.length >= 3 && !VACIAS.has(p)),
);
/** Palabras en común; una abreviatura cuenta ("RETROV" = "RETROVISOR", "IZQ" = "IZQUIERDO"). */
export const palabrasEnComun = (a, b) => {
  const B = [...palabras(b)];
  let n = 0;
  for (const p of palabras(a)) {
    if (B.some((q) => q === p || q.startsWith(p) || p.startsWith(q))) n += 1;
  }
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

  // 2a. El mismo código del MISMO suplidor es la misma pieza (su código, su
  // factura). Con otro suplidor (o sin suplidor) basta una palabra en común.
  // En Morla el catálogo tiene piezas repetidas con la misma referencia; la
  // del código del suplidor es la que se usa hoy, por eso esto va primero.
  const exacto = unicos.find((p) => sinTildes(p.codigo).trim() === code) || null;
  const pareceMismo = (p) => mismoSup(p) || !desc.trim() || comun(p) >= 1;
  if (exacto && pareceMismo(exacto)) return { producto: exacto, motivo: 'codigo', aviso: null };

  // 2b. Misma referencia (al menos 4 caracteres para no casar "A1" con todo).
  if (ref.length >= 4) {
    const porRef = unicos.filter((p) => normRef(p.referencia) === ref);
    const elegido = porRef.find(mismoSup) || (porRef.length === 1 ? porRef[0] : null);
    if (elegido) return { producto: elegido, motivo: 'referencia', aviso: null };
  }

  // 3. El código con letras delante (V004264 / TVS003730), del mismo suplidor.
  if (code.length >= 4) {
    const conLetras = new RegExp(`^[A-Z]{1,4}-?${escRegex(code)}$`);
    const prefijo = unicos
      .filter((p) => p !== exacto && mismoSup(p) && conLetras.test(sinTildes(p.codigo).trim()) && (!desc.trim() || comun(p) >= 1))
      .sort((x, y) => comun(y) - comun(x))[0];
    if (prefijo) return { producto: prefijo, motivo: 'codigo_suplidor', aviso: null };
  }

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
  // El código exacto viene dentro de "termina en el código" (V004264 también);
  // con códigos cortos solo el exacto, para no traer media tienda.
  const consultas = [code.length >= 4
    ? supabase.from('productos').select(CAMPOS).ilike('codigo', `%${esc(code)}`).limit(60)
    : supabase.from('productos').select(CAMPOS).ilike('codigo', esc(code)).limit(5)];
  // Referencia con cualquier separador: "31200 CG200 VI" encuentra "31200-CG200-VI".
  const trozosRef = sinTildes(item.reference).split(/[^A-Z0-9]+/).filter(Boolean);
  if (normRef(item.reference).length >= 4) {
    consultas.push(supabase.from('productos').select(CAMPOS).ilike('referencia', `%${trozosRef.map(esc).join('%')}%`).limit(20));
  }
  const res = await Promise.all(consultas.map((q) => q.then((r) => r.data || [], () => [])));
  const r = elegirProducto(item, suplidorId, res.flat());
  return { producto: r.producto, porMemoria: false, aviso: r.aviso, motivo: r.motivo };
}
