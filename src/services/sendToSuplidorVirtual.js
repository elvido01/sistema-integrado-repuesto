import { supabase } from '@/lib/customSupabaseClient';

export async function sendNotaToSuplidorVirtual({ nota, tenantId, userId } = {}) {
  const descripcion = String(nota || '').trim().slice(0, 50);

  if (!tenantId) {
    return { success: false, message: 'No se pudo identificar el tenant.' };
  }

  if (!descripcion) {
    return { success: false, message: 'Escribe una nota antes de enviarla.' };
  }

  const { error } = await supabase
    .from('suplidor_virtual_items')
    .insert({
      tenant_id: tenantId,
      producto_id: null,
      codigo: null,
      descripcion,
      cantidad_sugerida: 1,
      precio_referencia: null,
      notas: descripcion,
      created_by: userId || null,
    });

  if (error) {
    if (
      error.code === '23502' &&
      String(error.message || '').includes('producto_id')
    ) {
      return {
        success: false,
        message: 'Falta ejecutar sql/suplidor_virtual_notas_libres.sql en Supabase para permitir notas sin producto creado.',
      };
    }

    return { success: false, message: error.message };
  }

  return { success: true, message: 'Nota enviada a Suplidor Virtual.' };
}
