import { supabase } from '@/lib/customSupabaseClient';
import { addDays } from 'date-fns';
import { getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';

/**
 * Envía un producto a una orden de compra pendiente del suplidor.
 * - Si ya existe una orden pendiente para ese suplidor → agrega el producto (o suma cantidad).
 * - Si no existe → crea una nueva orden con vencimiento a 15 días.
 *
 * @param {Object} product - El producto con al menos { id, codigo, descripcion }
 * @returns {Promise<{success: boolean, message: string, orderNumero?: string, isNew?: boolean}>}
 */
export async function sendProductToOrdenCompra(product) {
    try {
        // 1. Fetch product details including suplidor_id and costo
        const { data: productData, error: productError } = await supabase
            .from('productos')
            .select('id, codigo, descripcion, suplidor_id, costo, itbis_pct')
            .eq('id', product.id)
            .single();

        if (productError || !productData) {
            return { success: false, message: 'No se pudo obtener la información del producto.' };
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
            const { data: existingDetail, error: detailCheckError } = await supabase
                .from('ordenes_compra_detalle')
                .select('id, cantidad')
                .eq('orden_compra_id', orderId)
                .eq('producto_id', productData.id)
                .maybeSingle();

            if (detailCheckError) {
                return { success: false, message: 'Error al verificar detalles de la orden.' };
            }

            if (existingDetail) {
                // Product already in order → increment quantity
                const newQty = (existingDetail.cantidad || 0) + 1;
                const newImporte = newQty * costo;

                const { error: updateError } = await supabase
                    .from('ordenes_compra_detalle')
                    .update({ cantidad: newQty, importe: newImporte })
                    .eq('id', existingDetail.id);

                if (updateError) {
                    return { success: false, message: 'Error al actualizar la cantidad en la orden.' };
                }
            } else {
                // Add new detail to existing order
                const { error: insertDetailError } = await supabase
                    .from('ordenes_compra_detalle')
                    .insert({
                        orden_compra_id: orderId,
                        producto_id: productData.id,
                        codigo: productData.codigo,
                        descripcion: productData.descripcion,
                        cantidad: 1,
                        unidad: 'UND',
                        precio: costo,
                        descuento_pct: 0,
                        itbis_pct: itbisPct,
                        importe: costo,
                    });

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
                total_exento: costo,
                total_gravado: 0,
                descuento_total: 0,
                itbis_total: 0,
                total_orden: costo,
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
            const { error: insertDetailError } = await supabase
                .from('ordenes_compra_detalle')
                .insert({
                    orden_compra_id: orderId,
                    producto_id: productData.id,
                    codigo: productData.codigo,
                    descripcion: productData.descripcion,
                    cantidad: 1,
                    unidad: 'UND',
                    precio: costo,
                    descuento_pct: 0,
                    itbis_pct: itbisPct,
                    importe: costo,
                });

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
        const itbisPct = (parseFloat(d.itbis_pct) || 0) / 100;

        const subtotal = cantidad * precio;
        const descMonto = subtotal * descPct;
        const base = subtotal - descMonto;

        descuento_total += descMonto;

        if (itbisPct > 0) {
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
