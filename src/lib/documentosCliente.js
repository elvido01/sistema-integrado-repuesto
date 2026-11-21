// =====================================================================
// Imágenes de la documentación del cliente (tabla documentacion_clientes,
// bucket documentacion-clientes). Las usan Notas y Comentarios y
// Documentación Cliente.
//
// (20/11/2026) "Registro DGII": en TODAS las empresas tipo financiera (las de
// hoy y las que se creen), por pedido del dueño. En otro tipo de empresa solo
// se ve si el registro ya tiene esa imagen (p. ej. visto desde otra empresa del grupo).
// =====================================================================
import { supabase } from '@/lib/customSupabaseClient';

export const BUCKET_DOCUMENTOS = 'documentacion-clientes';

export const DOC_FIELDS = [
  { key: 'cedula_pasaporte_path', label: 'Cédula / Pasaporte' },
  { key: 'matricula_moto_path', label: 'Matrícula Moto' },
  { key: 'placa_path', label: 'Placa' },
  { key: 'autorizacion_path', label: 'Autorización' },
  { key: 'carta_saldo_path', label: 'Carta de Saldo' },
  { key: 'seguro_path', label: 'Seguro' },
];

export const DOC_REGISTRO_DGII = { key: 'registro_dgii_path', label: 'Registro DGII' };

export const TIPOS_CON_REGISTRO_DGII = new Set(['financiera']);

/** Todas las imágenes posibles (para firmar enlaces, subir y borrar). */
export const TODOS_DOC_FIELDS = [...DOC_FIELDS, DOC_REGISTRO_DGII];

/** Las imágenes que se muestran para esta empresa y este registro. */
export const camposDocumentacion = (tipoNegocio, record) =>
  (TIPOS_CON_REGISTRO_DGII.has(String(tipoNegocio || '').toLowerCase()) || record?.[DOC_REGISTRO_DGII.key]) ? TODOS_DOC_FIELDS : DOC_FIELDS;

// ── Guardar y borrar sin perder imágenes (21/11/2026) ──────────────────
// Antes: se subía la imagen nueva, se BORRABA la vieja y después se grababa
// el registro; si el registro fallaba, quedaba apuntando a un archivo que ya
// no existía. Y al borrar, se quitaban las imágenes antes de saber si el
// registro se borraba de verdad. Ahora la imagen vieja solo se borra cuando
// el registro nuevo ya quedó grabado.

const quitarArchivos = async (paths) => {
  const lista = (paths || []).filter(Boolean);
  if (!lista.length) return;
  try {
    const { error } = await supabase.storage.from(BUCKET_DOCUMENTOS).remove(lista);
    if (error) console.warn('No se quitaron imágenes viejas:', error.message);
  } catch (e) {
    console.warn('No se quitaron imágenes viejas:', e.message);
  }
};

/**
 * Sube las imágenes elegidas, graba el registro y, solo si quedó grabado,
 * borra las imágenes que fueron reemplazadas.
 * files: { campo_path: File } · anterior: el registro como estaba (o null)
 * payload: lo que se graba (sin las rutas nuevas; se agregan aquí).
 */
export async function guardarDocumentacion({ tenantId, recordId, files, anterior, payload }) {
  const subidas = {};
  try {
    for (const field of TODOS_DOC_FIELDS) {
      const file = files?.[field.key];
      if (!file) continue;
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${tenantId}/${recordId}/${field.key.replace('_path', '')}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET_DOCUMENTOS).upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw new Error(`No se pudo subir ${field.label}: ${error.message}`);
      subidas[field.key] = path;
    }
    const { data, error } = await supabase
      .from('documentacion_clientes')
      .upsert({ ...payload, id: recordId, ...subidas }, { onConflict: 'id' })
      .select('id');
    if (error) throw error;
    if (!data?.length) throw new Error('No se guardó: este registro no se puede editar desde esta empresa.');
  } catch (e) {
    // Lo nuevo se quita; la imagen vieja sigue intacta y el registro igual.
    await quitarArchivos(Object.values(subidas));
    throw e;
  }
  await quitarArchivos(Object.keys(subidas).filter((k) => anterior?.[k] && anterior[k] !== subidas[k]).map((k) => anterior[k]));
}

/** Borra el registro y, solo si se borró de verdad, sus imágenes. */
export async function borrarDocumentacion(record) {
  const { data, error } = await supabase.from('documentacion_clientes').delete().eq('id', record.id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('No se borró: este registro es de otra empresa.');
  await quitarArchivos(TODOS_DOC_FIELDS.map((f) => record[f.key]));
}

/** Clase de la cuadrícula según cuántas imágenes hay (6 o 7 por fila en pantalla grande). */
export const gridDocumentos = (n) => `grid grid-cols-2 md:grid-cols-3 ${n > 6 ? 'xl:grid-cols-7' : 'xl:grid-cols-6'} gap-3`;
