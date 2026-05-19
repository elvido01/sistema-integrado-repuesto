// ============================================================
// agents/cambio_suplidor.ts
// ============================================================
// Agente "Sustituto de Suplidor"
//
// Trigger: el operador marca "producto agotado al suplidor" en una OC.
// Job: recomendar el mejor suplidor alternativo basado en historial real
// de compras del producto + confiabilidad general del suplidor.
//
// Returns: ranking + acción sugerida (borrador de OC o revisión manual).
// ============================================================

import { callLLM } from '../llm.ts';

export interface CambioSuplidorPayload {
    producto_id: string;
    suplidor_original_id?: string;
    cantidad: number;
    urgencia?: 'normal' | 'urgente';
}

export interface CambioSuplidorResult {
    suplidor_recomendado_id: string | null;
    suplidor_recomendado_nombre: string | null;
    razon: string;
    confianza: 'alta' | 'media' | 'baja';
    precio_estimado: number | null;
    alternativas: Array<{
        suplidor_id: string;
        suplidor_nombre: string;
        score: number;
        nota: string;
    }>;
    action: 'crear_oc_borrador' | 'revisar_manual' | 'abortar';
    historico_resumen: {
        compras_totales: number;
        suplidores_distintos: number;
        producto_codigo?: string;
        producto_descripcion?: string;
    };
}

const PROMPT_SISTEMA = `Eres el agente "Sustituto de Suplidor" de Motoflow para una empresa de repuestos de motocicletas en República Dominicana.

CONTEXTO DEL NEGOCIO:
- El operador acaba de marcar un producto como AGOTADO en el suplidor original (este suplidor no tiene la mercancía hoy).
- Tu tarea: recomendar al mejor suplidor ALTERNATIVO basado en el historial real de compras del producto.

CRITERIOS DE DECISIÓN (en orden de importancia):
1. Suplidor con HISTORIAL RECIENTE del producto (últimos 6 meses pesan más que los previos)
2. Mejor precio promedio considerando los últimos 3-5 movimientos
3. Suplidor con MAYOR FRECUENCIA de compra general (más confiable)
4. Tiempo desde última compra (descarta suplidores inactivos >12 meses)

REGLAS DE DECISIÓN:
- Si NO hay historial del producto con otros suplidores → confianza="baja", action="revisar_manual"
- Si solo hay UN alternativo → confianza según frecuencia/recencia
- Si hay MÚLTIPLES → ranking top 3, recomienda el #1
- Si el precio del alternativo es >30% más caro que el original → confianza="baja", explicar

OUTPUT — debes responder en JSON estricto con esta estructura exacta:
{
  "suplidor_recomendado_id": "<uuid del mejor suplidor>" | null,
  "razon": "<1-2 oraciones, español>",
  "confianza": "alta" | "media" | "baja",
  "precio_estimado": <número o null>,
  "alternativas": [
    { "suplidor_id": "<uuid>", "score": <número 0-100>, "nota": "<texto corto>" }
  ],
  "action": "crear_oc_borrador" | "revisar_manual" | "abortar"
}`;

interface CompraDetalleRow {
    cantidad: number;
    costo_unitario: number;
    compras: {
        fecha: string;
        suplidor_id: string;
        suplidores: { id: string; nombre: string } | null;
    } | null;
}

interface SupabaseClient {
    from: (table: string) => any;
    rpc: (name: string, params: Record<string, unknown>) => any;
}

export async function ejecutarCambioSuplidor(
    supabase: SupabaseClient,
    tenant_id: string,
    payload: CambioSuplidorPayload,
): Promise<{ result: CambioSuplidorResult; llm: any }> {
    const { producto_id, suplidor_original_id, cantidad } = payload;

    // 1. Cargar producto
    const { data: producto, error: prodErr } = await supabase
        .from('productos')
        .select('id, codigo, descripcion')
        .eq('id', producto_id)
        .eq('tenant_id', tenant_id)
        .maybeSingle();
    if (prodErr || !producto) {
        throw new Error('Producto no encontrado: ' + (prodErr?.message || producto_id));
    }

    // 2. Historial de compras de este producto (últimos 18 meses, todos los suplidores)
    const dieciOchoMesesAtras = new Date();
    dieciOchoMesesAtras.setMonth(dieciOchoMesesAtras.getMonth() - 18);
    const fechaCorte = dieciOchoMesesAtras.toISOString().slice(0, 10);

    const { data: historial, error: histErr } = await supabase
        .from('compras_detalle')
        .select('cantidad, costo_unitario, compras!inner(fecha, suplidor_id, tenant_id, suplidores(id, nombre))')
        .eq('producto_id', producto_id)
        .eq('compras.tenant_id', tenant_id)
        .gte('compras.fecha', fechaCorte)
        .order('compras(fecha)', { ascending: false })
        .limit(50);

    if (histErr) {
        throw new Error('Error consultando historial: ' + histErr.message);
    }

    const rows = (historial || []) as CompraDetalleRow[];

    // 3. Agrupar por suplidor
    const porSuplidor: Record<string, {
        suplidor_id: string;
        suplidor_nombre: string;
        compras_count: number;
        cantidad_total: number;
        precio_promedio: number;
        precio_ultimo: number;
        fecha_ultima: string;
        dias_desde_ultima: number;
    }> = {};

    const hoy = new Date();
    for (const row of rows) {
        if (!row.compras || !row.compras.suplidor_id) continue;
        if (row.compras.suplidor_id === suplidor_original_id) continue; // excluir el agotado
        const sid = row.compras.suplidor_id;
        const sname = row.compras.suplidores?.nombre || 'Suplidor desconocido';
        const fecha = row.compras.fecha;
        const precio = Number(row.costo_unitario) || 0;
        const cant = Number(row.cantidad) || 0;

        if (!porSuplidor[sid]) {
            porSuplidor[sid] = {
                suplidor_id: sid,
                suplidor_nombre: sname,
                compras_count: 0,
                cantidad_total: 0,
                precio_promedio: 0,
                precio_ultimo: precio,
                fecha_ultima: fecha,
                dias_desde_ultima: Math.floor((hoy.getTime() - new Date(fecha).getTime()) / (1000 * 60 * 60 * 24)),
            };
        }
        const s = porSuplidor[sid];
        s.compras_count += 1;
        s.cantidad_total += cant;
        s.precio_promedio = ((s.precio_promedio * (s.compras_count - 1)) + precio) / s.compras_count;
        if (fecha > s.fecha_ultima) {
            s.fecha_ultima = fecha;
            s.precio_ultimo = precio;
            s.dias_desde_ultima = Math.floor((hoy.getTime() - new Date(fecha).getTime()) / (1000 * 60 * 60 * 24));
        }
    }

    const candidatos = Object.values(porSuplidor);

    const historico_resumen = {
        compras_totales: rows.length,
        suplidores_distintos: candidatos.length,
        producto_codigo: producto.codigo,
        producto_descripcion: producto.descripcion,
    };

    // 4. Si no hay candidatos, no llamamos al LLM — respuesta inmediata
    if (candidatos.length === 0) {
        return {
            result: {
                suplidor_recomendado_id: null,
                suplidor_recomendado_nombre: null,
                razon: 'No hay historial de compras de este producto con otros suplidores en los últimos 18 meses.',
                confianza: 'baja',
                precio_estimado: null,
                alternativas: [],
                action: 'revisar_manual',
                historico_resumen,
            },
            llm: { skipped: true, reason: 'sin_candidatos' },
        };
    }

    // 5. Llamar al LLM con el contexto
    const userPrompt = JSON.stringify({
        producto: {
            id: producto.id,
            codigo: producto.codigo,
            descripcion: producto.descripcion,
        },
        cantidad_solicitada: cantidad,
        suplidor_original_id: suplidor_original_id || null,
        candidatos: candidatos.map((c) => ({
            suplidor_id: c.suplidor_id,
            suplidor_nombre: c.suplidor_nombre,
            compras_count: c.compras_count,
            cantidad_total_comprada: c.cantidad_total,
            precio_promedio: Number(c.precio_promedio.toFixed(2)),
            precio_ultimo: Number(c.precio_ultimo.toFixed(2)),
            dias_desde_ultima_compra: c.dias_desde_ultima,
        })),
    });

    const llm = await callLLM({
        system: PROMPT_SISTEMA,
        user: userPrompt,
        response_format: 'json',
        user_tag: tenant_id,
        max_tokens: 800,
        temperature: 0.1,
    });

    // 6. Parsear respuesta
    let parsed: any;
    try {
        parsed = JSON.parse(llm.content);
    } catch (e) {
        throw new Error('LLM devolvió JSON inválido: ' + llm.content.slice(0, 200));
    }

    // 7. Enriquecer con el nombre del suplidor recomendado
    let suplidor_recomendado_nombre: string | null = null;
    if (parsed.suplidor_recomendado_id) {
        const enc = candidatos.find((c) => c.suplidor_id === parsed.suplidor_recomendado_id);
        suplidor_recomendado_nombre = enc?.suplidor_nombre || null;
    }

    // 8. Mapear alternativas con sus nombres
    const alternativas = (parsed.alternativas || []).map((a: any) => {
        const enc = candidatos.find((c) => c.suplidor_id === a.suplidor_id);
        return {
            suplidor_id: a.suplidor_id,
            suplidor_nombre: enc?.suplidor_nombre || 'Desconocido',
            score: Number(a.score) || 0,
            nota: String(a.nota || ''),
        };
    });

    return {
        result: {
            suplidor_recomendado_id: parsed.suplidor_recomendado_id || null,
            suplidor_recomendado_nombre,
            razon: parsed.razon || '',
            confianza: parsed.confianza || 'media',
            precio_estimado: parsed.precio_estimado != null ? Number(parsed.precio_estimado) : null,
            alternativas,
            action: parsed.action || 'revisar_manual',
            historico_resumen,
        },
        llm,
    };
}
