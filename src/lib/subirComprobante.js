// Subir UN comprobante fiscal de gasto (ayudante contable).
// Lo usan la página "Comprobantes de gastos" y la ventana de Gasto Diario:
// achicar → guardar en el bucket → leerlo (leer-comprobante) → fila
// "por revisar" en gastos_comprobantes. Solo entra al 606 cuando alguien lo
// revisa y lo aprueba. Si algo falla después de subir la foto, se borra
// para que no quede ocupando espacio.
import { supabase } from '@/lib/customSupabaseClient';
import { achicarFoto, rutaComprobante, fechaValida } from '@/lib/imagenComprobante';

const hoyRD = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });

/**
 * @param {File} archivo  imagen
 * @param {object} o
 * @param {string} o.tenantId
 * @param {string} [o.origen]      'web' | 'app' (CHECK de la tabla); el gasto diario es 'web' + gastoId
 * @param {string} [o.gastoId]      gasto diario al que pertenece
 * @param {string} [o.fecha]        fecha a usar si la lectura no trae una válida
 * @param {number} [o.total]        total a usar si la lectura no trae uno
 * @returns {Promise<{ok:boolean, ilegible?:boolean, repetido?:boolean, sinLeer?:boolean, error?:string}>}
 */
export async function subirComprobante(archivo, { tenantId, origen = 'web', gastoId = null, fecha = null, total = null }) {
  const foto = await achicarFoto(archivo);
  if (!foto) return { ok: false, ilegible: true };   // HEIC de iPhone en Chrome, archivo dañado
  const path = rutaComprobante(tenantId);
  const quitarFoto = () => supabase.storage.from('comprobantes').remove([path]).catch(() => {});
  try {
    const { error: eUp } = await supabase.storage.from('comprobantes').upload(path, foto, { contentType: 'image/jpeg' });
    if (eUp) return { ok: false, error: eUp.message };

    let d = {};
    let sinLeer = false;
    const { data: r, error: eFn } = await supabase.functions.invoke('leer-comprobante', { body: { path } });
    if (eFn || !r?.ok) sinLeer = true; else d = r.datos || {};

    const fechaUsar = fechaValida(d.fecha) ? d.fecha : (fechaValida(fecha) ? fecha : hoyRD());
    const totalUsar = Number(d.total) > 0 ? d.total : (Number(total) > 0 ? Number(total) : 0);
    const { error: eIns } = await supabase.from('gastos_comprobantes').insert({
      tenant_id: tenantId, fecha: fechaUsar, rnc: d.rnc || '', proveedor_nombre: d.proveedor_nombre || null,
      ncf: d.ncf || '', tipo_bs: d.tipo_bs || 2, monto_gravado: d.monto_gravado || 0, monto_exento: d.monto_exento || 0,
      itbis: d.itbis || 0, propina: d.propina || 0, total: totalUsar, forma_pago: d.forma_pago || '01',
      imagen_path: path, lectura: d, origen, ...(gastoId ? { gasto_id: gastoId } : {}),
    }).select('id');
    if (eIns) {
      await quitarFoto();
      if (/gastos_comprobantes_unico/.test(eIns.message)) return { ok: false, repetido: true };
      return { ok: false, error: eIns.message };
    }
    return { ok: true, sinLeer };
  } catch (e) {
    await quitarFoto();
    return { ok: false, error: e?.message || String(e) };
  }
}
