import { supabase } from '@/lib/customSupabaseClient';
import { addDays } from 'date-fns';
import { getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';
import { normalizeTaxRate, calculateLineAmount } from '@/lib/taxUtils';

const calculateDetailImporte = (detalle, aplicarItbis = true) =>
    calculateLineAmount(detalle, aplicarItbis);

const stripReceptionFields = (detalle) => {
    const {
        cantidad_pedida,
        cantidad_recibida,
        cantidad_pendiente,
        estado_linea,
        ...legacyDetalle
    } = detalle;
    return legacyDetalle;
};

const isReceptionSchemaMissing = (error) => Boolean(
    error
    && (
        error.code === 'PGRST204'
        || error.message?.includes('cantidad_pedida')
        || error.message?.includes('cantidad_recibida')
        || error.message?.includes('cantidad_pendiente')
        || error.message?.includes('estado_linea')
    )
);

/**
 * Envía un producto a una orden de compra pendiente del suplidor.
 * - Si ya existe una orden pendiente para ese suplidor → agrega el producto (o suma cantidad).
 * - Si no existe → crea una nueva orden con vencimiento a 15 días.
 *
 * @param {Object} product - El producto con al menos { id, codigo, descripcion }
 * @param {Object} options
 * @param {number} options.quantity - Cantidad a agregar o sumar en la orden.
 * @returns {Promise<{success: boolean, message: string, orderNumero?: string, isNew?: boolean}>}
 */
export async function sendProductToOrdenCompra(product, options = {}) {
    try {
        const quantity = Math.max(1, Math.ceil(Number(options.quantity || product.cantidad_sugerida || 1)));

        // 1. Fetch product details including suplidor_id and costo
        const { data: productData, error: productError } = await supabase
            .from('productos')
            .select('id, codigo, descripcion, suplidor_id, costo, itbis_pct, activo')
            .eq('id', product.id)
            .single();

        if (productError || !productData) {
            return { success: false, message: 'No se pudo obtener la información del producto.' };
        }

        // No enviar productos desactivados a compra (inventario depurado / descontinuados)
        if (productData.activo === false) {
            return { success: false, skipped: true, message: `El producto ${productData.codigo} está desactivado y no se envió a compra.` };
        }

        if (!productData.suplidor_id) {
            return { success: false, message: `El producto ${productData.codigo} no tiene un suplidor asignado. Asigne un suplidor primero.` };
        }

        const suplidorId = productData.suplidor_id;
        const costo = productData.costo || 0;
        const itbisPct = productData.itbis_pct || 0;

        // 2. Fetch supplier name for toast messages
        const { data: suplidorData } = await supabase
            .from('proveedores')
            .select('nombre')
            .eq('id', suplidorId)
            .single();

        const suplidorNombre = suplidorData?.nombre || 'Desconocido';

        // 3. Check for existing Pendiente order for this supplier
        const { data: existingOrders, error: orderError } = await supabase
            .from('ordenes_compra')
            .select('id, numero, suplidor_id')
            .eq('suplidor_id', suplidorId)
            .eq('estado', 'Pendiente')
            .order('fecha_orden', { ascending: false })
            .limit(1);

        if (orderError) {
            return { success: false, message: 'Error al buscar órdenes existentes.' };
        }

        let orderId;
        let orderNumero;
        let isNew = false;
        const fechaOrden = getCurrentDateInTimeZone();

        if (existingOrders && existingOrders.length > 0) {
            // ---- Use existing order ----
            orderId = existingOrders[0].id;
            orderNumero = existingOrders[0].numero;

            // Update timestamp to today so it appears in the recent filters (last 30 days)
            let updatePayload = { fecha_orden: formatDateForSupabase(fechaOrden) };

            if (!orderNumero) {
                const { data: nextNum } = await supabase.rpc('get_next_orden_compra_numero');
                if (nextNum) {
                    orderNumero = nextNum;
                    updatePayload.numero = orderNumero;
                }
            }
            await supabase.from('ordenes_compra').update(updatePayload).eq('id', orderId);

            // Check if product already exists in this order
            let { data: existingDetails, error: detailCheckError } = await supabase
                .from('ordenes_compra_detalle')
                .select('id, cantidad, cantidad_pedida, cantidad_recibida')
                .eq('orden_compra_id', orderId)
                .eq('producto_id', productData.id)
                .order('id', { ascending: true });

            if (isReceptionSchemaMissing(detailCheckError)) {
                const legacyResult = await supabase
                    .from('ordenes_compra_detalle')
                    .select('id, cantidad')
                    .eq('orden_compra_id', orderId)
                    .eq('producto_id', productData.id)
                    .order('id', { ascending: true });
                existingDetails = legacyResult.data;
                detailCheckError = legacyResult.error;
            }

            if (detailCheckError) {
                return { success: false, message: 'Error al verificar detalles de la orden.' };
            }

            const existingDetail = existingDetails?.[0] || null;

            if (existingDetail) {
                // Product already in order → increment quantity
                const currentQty = (existingDetails || []).reduce((sum, detail) => sum + (parseFloat(detail.cantidad) || 0), 0);
                const receivedQty = parseFloat(existingDetail.cantidad_recibida) || 0;
                const newQty = currentQty + quantity;
                const newPendingQty = Math.max(0, newQty - receivedQty);
                const newImporte = calculateDetailImporte({
                    ...existingDetail,
                    cantidad: newQty,
                    precio: costo,
                    descuento_pct: 0,
                    itbis_pct: itbisPct,
                }, false);

                let { error: updateError } = await supabase
                    .from('ordenes_compra_detalle')
                    .update({
                        cantidad: newQty,
                        cantidad_pedida: newQty,
                        cantidad_recibida: receivedQty,
                        cantidad_pendiente: newPendingQty,
                        estado_linea: newPendingQty <= 0 ? 'recibida' : (receivedQty > 0 ? 'parcial' : 'pendiente'),
                        importe: newImporte,
                    })
                    .eq('id', existingDetail.id);

                if (isReceptionSchemaMissing(updateError)) {
                    const legacyResult = await supabase
                        .from('ordenes_compra_detalle')
                        .update({ cantidad: newQty, importe: newImporte })
                        .eq('id', existingDetail.id);
                    updateError = legacyResult.error;
                }

                if (updateError) {
                    return { success: false, message: 'Error al actualizar la cantidad en la orden.' };
                }

                const duplicateIds = (existingDetails || []).slice(1).map(detail => detail.id);
                if (duplicateIds.length > 0) {
                    await supabase
                        .from('ordenes_compra_detalle')
                        .delete()
                        .in('id', duplicateIds);
                }
            } else {
                // Add new detail to existing order
                let { error: insertDetailError } = await supabase
                    .from('ordenes_compra_detalle')
                    .insert({
                        orden_compra_id: orderId,
                        producto_id: productData.id,
                        codigo: productData.codigo,
                        descripcion: productData.descripcion,
                        cantidad: quantity,
                        cantidad_pedida: quantity,
                        cantidad_recibida: 0,
                        cantidad_pendiente: quantity,
                        estado_linea: 'pendiente',
                        unidad: 'UND',
                        precio: costo,
                        descuento_pct: 0,
                        itbis_pct: itbisPct,
                        importe: costo * quantity,
                    });

                if (isReceptionSchemaMissing(insertDetailError)) {
                    const legacyResult = await supabase
                        .from('ordenes_compra_detalle')
                        .insert({
                            orden_compra_id: orderId,
                            producto_id: productData.id,
                            codigo: productData.codigo,
                            descripcion: productData.descripcion,
                            cantidad: quantity,
                            unidad: 'UND',
                            precio: costo,
                            descuento_pct: 0,
                            itbis_pct: itbisPct,
                            importe: costo * quantity,
                        });
                    insertDetailError = legacyResult.error;
                }

                if (insertDetailError) {
                    return { success: false, message: 'Error al agregar producto a la orden existente.' };
                }
            }

            // Recalculate order totals
            await recalculateOrderTotals(orderId);

        } else {
            // ---- Create new order ----
            isNew = true;

            // Get next order number
            const { data: nextNum, error: numError } = await supabase.rpc('get_next_orden_compra_numero');
            if (numError) {
                return { success: false, message: 'Error al generar número de orden.' };
            }

            orderNumero = nextNum;
            const fechaVencimiento = addDays(fechaOrden, 15);

            const ordenData = {
                numero: orderNumero,
                fecha_orden: formatDateForSupabase(fechaOrden),
                fecha_vencimiento: formatDateForSupabase(fechaVencimiento),
                notas: 'Generada automáticamente desde ventas',
                aplicar_itbis: false,
                itbis_incluido: true,
                suplidor_id: suplidorId,
                estado: 'Pendiente',
                total_exento: costo * quantity,
                total_gravado: 0,
                descuento_total: 0,
                itbis_total: 0,
                total_orden: costo * quantity,
            };

            const { data: savedOrden, error: ordenError } = await supabase
                .from('ordenes_compra')
                .insert(ordenData)
                .select()
                .single();

            if (ordenError) {
                return { success: false, message: `Error al crear la orden: ${ordenError.message}` };
            }

            orderId = savedOrden.id;

            // Insert the product detail
            let { error: insertDetailError } = await supabase
                .from('ordenes_compra_detalle')
                .insert({
                    orden_compra_id: orderId,
                    producto_id: productData.id,
                    codigo: productData.codigo,
                    descripcion: productData.descripcion,
                    cantidad: quantity,
                    cantidad_pedida: quantity,
                    cantidad_recibida: 0,
                    cantidad_pendiente: quantity,
                    estado_linea: 'pendiente',
                    unidad: 'UND',
                    precio: costo,
                    descuento_pct: 0,
                    itbis_pct: itbisPct,
                    importe: costo * quantity,
                });

            if (isReceptionSchemaMissing(insertDetailError)) {
                const legacyResult = await supabase
                    .from('ordenes_compra_detalle')
                    .insert({
                        orden_compra_id: orderId,
                        producto_id: productData.id,
                        codigo: productData.codigo,
                        descripcion: productData.descripcion,
                        cantidad: quantity,
                        unidad: 'UND',
                        precio: costo,
                        descuento_pct: 0,
                        itbis_pct: itbisPct,
                        importe: costo * quantity,
                    });
                insertDetailError = legacyResult.error;
            }

            if (insertDetailError) {
                return { success: false, message: 'Error al agregar producto a la nueva orden.' };
            }
        }

        const action = isNew ? 'Orden creada' : 'Agregado a orden';
        return {
            success: true,
            message: `${action} #${orderNumero} (${suplidorNombre})`,
            orderNumero,
            isNew,
            suplidorNombre,
        };

    } catch (error) {
        console.error('sendProductToOrdenCompra error:', error);
        return { success: false, message: `Error inesperado: ${error.message}` };
    }
}

/**
 * Recalculates the totals for an order based on its details.
 */
async function recalculateOrderTotals(orderId) {
    const { data: orden } = await supabase
        .from('ordenes_compra')
        .select('aplicar_itbis')
        .eq('id', orderId)
        .maybeSingle();

    const aplicarItbis = orden?.aplicar_itbis !== false;

    const { data: detalles, error } = await supabase
        .from('ordenes_compra_detalle')
        .select('*')
        .eq('orden_compra_id', orderId);

    if (error || !detalles) return;

    let total_exento = 0;
    let total_gravado = 0;
    let descuento_total = 0;
    let itbis_total = 0;

    detalles.forEach((d) => {
        const cantidad = parseFloat(d.cantidad) || 0;
        const precio = parseFloat(d.precio) || 0;
        const descPct = (parseFloat(d.descuento_pct) || 0) / 100;
        const itbisPct = normalizeTaxRate(d.itbis_pct);

        const subtotal = cantidad * precio;
        const descMonto = subtotal * descPct;
        const base = subtotal - descMonto;

        descuento_total += descMonto;

        if (itbisPct > 0 && aplicarItbis) {
            total_gravado += base;
            itbis_total += base * itbisPct;
        } else {
            total_exento += base;
        }
    });

    const total_orden = total_gravado + total_exento + itbis_total;

    await supabase
        .from('ordenes_compra')
        .update({ total_exento, total_gravado, descuento_total, itbis_total, total_orden })
        .eq('id', orderId);
}
