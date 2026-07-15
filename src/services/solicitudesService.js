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

    if (filtroEstado === 'llegadas') {
        // Piezas que llegaron y falta avisar al cliente (seguimiento de llegadas)
        query = query.eq('estado', 'notificada').is('customer_notified_at', null);
    } else if (filtroEstado && filtroEstado !== 'todas') {
        query = query.eq('estado', filtroEstado);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

/**
 * Marcar que ya se le avisó al cliente que su pieza llegó (cierra el
 * seguimiento de llegada). Usa la RPC; si aún no está desplegada, degrada
 * a un update directo de customer_notified_at.
 */
export async function marcarClienteAvisado(id) {
    const { error } = await supabase.rpc('marcar_cliente_avisado', { p_solicitud_id: id });
    if (error) {
        const { error: fallbackErr } = await supabase
            .from('solicitudes_clientes')
            .update({ customer_notified_at: new Date().toISOString() })
            .eq('id', id);
        if (fallbackErr) throw fallbackErr;
    }
}

/**
 * Create a new solicitud through the official domain flow.
 * This also sends inventoried products to the supplier purchase order flow.
 */
export async function createSolicitud(payload) {
    const requestPayload = {
        created_from: 'motoflow_web',
        source_channel: 'motoflow_web',
        cliente_id: payload.cliente_id || null,
        customer_name: payload.cliente_nombre || null,
        phone: payload.cliente_telefono || null,
        notes: payload.notas || null,
        duplicate_action: 'increase',
        products: [{
            producto_id: payload.producto_id || null,
            producto_texto: payload.producto_texto || null,
            cantidad: payload.cantidad_solicitada || 1,
        }],
    };

    const { data, error } = await supabase.rpc('omni_crear_solicitudes_agotadas', {
        p_payload: requestPayload,
    });

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

/**
 * Mark as solicitado to stop alerting.
 */
export async function marcarSolicitado(id) {
    const { error } = await supabase
        .from('solicitudes_clientes')
        .update({ estado: 'solicitado' })
        .eq('id', id);

    if (error) throw error;
}

/**
 * Delete a solicitud by id.
 */
export async function eliminarSolicitud(id) {
    const { error } = await supabase
        .from('solicitudes_clientes')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

/**
 * Edit (update) a solicitud by id.
 */
export async function updateSolicitud(id, payload) {
    const { data, error } = await supabase
        .from('solicitudes_clientes')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Generate a Pedido (Order) to be billed in the POS
 */
export async function enviarSolicitudAPedido(solicitud, userId) {
    if (!solicitud.producto_id) {
        throw new Error("No se puede generar pedido de un producto sin código válido.");
    }

    // 1. Fetch product to calculate prices
    const { data: product, error: prodErr } = await supabase
        .from('productos')
        .select('*, presentaciones(*)')
        .eq('id', solicitud.producto_id)
        .single();
    
    if (prodErr) throw new Error("Error obteniendo los precios del producto");

    const itbis_pct = product.itbis_pct || 18;
    let finalPrice = product.precio || 0;
    
    if (product.presentaciones && product.presentaciones.length > 0) {
      const mainPres = product.presentaciones.find(p => p.afecta_ft) || product.presentaciones[0];
      if (mainPres) {
        finalPrice = parseFloat(mainPres.precio1 || 0);
      }
    }

    const cantidad = parseFloat(solicitud.cantidad_solicitada) || 1;
    const subtotal = cantidad * finalPrice;
    const itbis = subtotal * (itbis_pct / 100);
    const importe = subtotal + itbis;

    // 2. Prepare Order Data
    const FINAL_GENERIC_ID = '2749fa36-3d7c-4bdf-ad61-df88eda8365a';
    const clientName = solicitud.cliente_nombre ? `${solicitud.cliente_nombre} ${solicitud.cliente_telefono || ''}`.trim() : null;
    
    const pedidoData = {
        cliente_id: solicitud.cliente_id || FINAL_GENERIC_ID,
        manual_cliente_nombre: clientName || null,
        fecha: new Date().toISOString().split('T')[0],
        vendedor_id: null, 
        subtotal: subtotal,
        descuento_total: 0,
        itbis_total: itbis,
        monto_total: importe,
        estado: 'Facturando', // Goes directly to POS List
        creado_por: userId,
        notas: `GENERADO DESDE SOLICITUD DE AGOTADOS. ${solicitud.notas || ''}`.trim(),
    };

    const detallesData = [{
        producto_id: product.id,
        codigo: product.codigo,
        descripcion: product.descripcion,
        cantidad: cantidad,
        unidad: 'UND',
        precio: finalPrice,
        descuento: 0,
        itbis_pct: itbis_pct,
        itbis: itbis,
        importe: importe
    }];

    // 3. Create Order via RPC
    const { error: rpcErr } = await supabase.rpc('crear_o_actualizar_pedido', {
        p_pedido_data: pedidoData,
        p_detalles_data: detallesData
    });

    if (rpcErr) throw new Error("Error al convertir a Pedido: " + rpcErr.message);

    // 4. Mark Request as cerrado automatically
    await cerrarSolicitud(solicitud.id);
}
