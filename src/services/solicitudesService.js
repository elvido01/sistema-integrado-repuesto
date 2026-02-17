import { supabase } from '@/lib/customSupabaseClient';

/**
 * Fetch solicitudes with optional estado filter.
 * Joins cliente and producto names when available.
 */
export async function fetchSolicitudes(filtroEstado = null) {
    let query = supabase
        .from('solicitudes_clientes')
        .select(`
      *,
      clientes ( nombre, telefono ),
      productos ( codigo, descripcion )
    `)
        .order('created_at', { ascending: false });

    if (filtroEstado && filtroEstado !== 'todas') {
        query = query.eq('estado', filtroEstado);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

/**
 * Create a new solicitud.
 */
export async function createSolicitud(payload) {
    const { data, error } = await supabase
        .from('solicitudes_clientes')
        .insert(payload)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Close (cerrar) a solicitud by id.
 */
export async function cerrarSolicitud(id) {
    const { error } = await supabase
        .from('solicitudes_clientes')
        .update({ estado: 'cerrada' })
        .eq('id', id);

    if (error) throw error;
}
