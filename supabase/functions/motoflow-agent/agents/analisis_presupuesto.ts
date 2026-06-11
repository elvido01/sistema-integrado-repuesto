// ============================================================
// agents/analisis_presupuesto.ts
// ============================================================
// Agente "Analisis de Presupuesto Inteligente"
//
// Trigger: el operador (o Morla AI CEO) pide un analisis del presupuesto
// de compras del mes/trimestre.
// Job: analizar el estado financiero (presupuesto, comprado, caja,
// historico, top suplidores) y devolver:
//   - salud general
//   - recomendaciones concretas (incrementar/congelar/reducir)
//   - alertas (CxP alta, vencidos, etc.)
//   - proyeccion para los proximos 3 meses
// ============================================================

import { callLLM } from '../llm.ts';

export interface AnalisisPresupuestoPayload {
    incluir_historico?: boolean;   // default true
    meses_historico?: number;       // default 6
    top_suplidores?: number;        // default 10
}

export interface AnalisisPresupuestoResult {
    salud_general: 'sana' | 'limite_cerca' | 'agotado' | 'tension' | 'sin_datos';
    resumen: string;
    recomendaciones: Array<{
        tipo: 'incrementar' | 'congelar' | 'reducir' | 'reasignar' | 'alerta';
        descripcion: string;
        urgencia: 'alta' | 'media' | 'baja';
    }>;
    senales_riesgo: string[];
    proyeccion_3meses: {
        confianza: 'alta' | 'media' | 'baja';
        nota: string;
    };
    estado_actual: any;
}

const PROMPT_SISTEMA = `Eres el agente "Analista de Presupuesto" de Morla AI CEO para una empresa de repuestos de motocicletas en Republica Dominicana.

CONTEXTO DEL NEGOCIO:
- El cliente usa MotoFlow Enterprise con Control Inteligente de Compras activado.
- Tienes acceso al presupuesto configurado, comprado del mes, caja en vivo,
  historico de los ultimos meses y top suplidores.

TU TAREA:
- Analizar la salud financiera del modulo de compras.
- Recomendar acciones concretas: incrementar / congelar / reducir / reasignar / alertar.
- Detectar senales de riesgo (CxP alta, vencidos, caja insuficiente).
- Proyectar 3 meses adelante con nivel de confianza.

REGLAS DE NEGOCIO:
1. SALUD por ratio (CxP pendiente vs ventas 30d):
   - <0.6 = sana (incrementar normal)
   - 0.6-1.0 = ajustada (mantener)
   - 1.0-1.5 = tension (reducir 20%)
   - >1.5 = critica (congelar)

2. CAJA MINIMA es sagrada — nunca recomendar comprometerla.

3. Si comprado_mes/monto_base > 0.75 a mitad de mes -> alertar "ritmo alto".

4. Si el cliente tiene asignaciones por suplidor y uno usa <50% mientras
   otro >90% -> recomendar reasignar.

5. Si el historico muestra incrementos consistentes sin congelamiento ->
   "operacion saludable, listo para subir tope".

FORMATO DE RESPUESTA (JSON valido):
{
  "salud_general": "sana | limite_cerca | agotado | tension",
  "resumen": "frase corta de 1-2 oraciones",
  "recomendaciones": [
    {
      "tipo": "incrementar | congelar | reducir | reasignar | alerta",
      "descripcion": "accion concreta",
      "urgencia": "alta | media | baja"
    }
  ],
  "senales_riesgo": ["lista de strings"],
  "proyeccion_3meses": {
    "confianza": "alta | media | baja",
    "nota": "que esperar en los proximos 3 meses"
  }
}

NO inventes datos. Si falta informacion, dilo en "senales_riesgo".
NO recomiendes mas de 5 items en recomendaciones (los mas importantes).
Responde SIEMPRE en espanol dominicano profesional.`;

export async function ejecutarAnalisisPresupuesto(
    supabase: any,
    tenant_id: string,
    payload: AnalisisPresupuestoPayload,
): Promise<{ result: AnalisisPresupuestoResult; llm: any }> {
    const mesesHist = Math.min(12, Math.max(1, payload?.meses_historico || 6));
    const topSup = Math.min(20, Math.max(3, payload?.top_suplidores || 10));

    // 1. Estado actual via RPC
    const { data: estado, error: estadoErr } = await supabase
        .rpc('get_presupuesto_compras_v2');
    if (estadoErr) throw new Error(`get_presupuesto_compras_v2: ${estadoErr.message}`);

    // 2. Historico (si la tabla existe)
    let historico: any[] = [];
    try {
        const { data } = await supabase
            .from('presupuesto_historico')
            .select('mes, monto_calculado, monto_aplicado, salud_caja, razon')
            .eq('tenant_id', tenant_id)
            .order('mes', { ascending: false })
            .limit(mesesHist);
        historico = data || [];
    } catch (_) { /* tabla puede no existir si Fase B no corrida */ }

    // 3. Top suplidores este mes
    let topSuplidores: any[] = [];
    try {
        const inicioMes = new Date();
        inicioMes.setDate(1);
        inicioMes.setHours(0, 0, 0, 0);
        const { data } = await supabase
            .from('compras')
            .select('suplidor_id, total, proveedores(nombre)')
            .eq('tenant_id', tenant_id)
            .gte('fecha', inicioMes.toISOString().slice(0, 10));
        if (Array.isArray(data)) {
            const agg = new Map<string, { suplidor_id: string; nombre: string; total: number; count: number }>();
            for (const c of data) {
                const key = c.suplidor_id || 'sin_suplidor';
                const prev = agg.get(key) || { suplidor_id: key, nombre: c.proveedores?.nombre || '—', total: 0, count: 0 };
                prev.total += Number(c.total) || 0;
                prev.count += 1;
                agg.set(key, prev);
            }
            topSuplidores = Array.from(agg.values())
                .sort((a, b) => b.total - a.total)
                .slice(0, topSup);
        }
    } catch (_) { /* no critico */ }

    // 4. Construir contexto para LLM
    const contexto = {
        estado_actual: estado,
        historico_recientes: historico,
        top_suplidores_mes: topSuplidores,
    };

    // 5. Llamar LLM
    const llmResp = await callLLM({
        system: PROMPT_SISTEMA,
        user: `Contexto financiero actual del tenant:\n\n${JSON.stringify(contexto, null, 2)}\n\nGenera el analisis en el JSON especificado.`,
        json_mode: true,
        max_tokens: 1200,
    });

    let parsed: any;
    try {
        parsed = typeof llmResp.text === 'string' ? JSON.parse(llmResp.text) : llmResp.text;
    } catch (e) {
        // Si el LLM no devolvio JSON, retornar fallback estructurado.
        parsed = {
            salud_general: estado?.salud || 'sin_datos',
            resumen: 'No se pudo parsear la respuesta del modelo. Datos crudos disponibles.',
            recomendaciones: [],
            senales_riesgo: ['LLM_PARSE_ERROR: ' + (e as Error).message],
            proyeccion_3meses: { confianza: 'baja', nota: 'analisis no concluyente' },
        };
    }

    const result: AnalisisPresupuestoResult = {
        salud_general: parsed.salud_general || estado?.salud || 'sin_datos',
        resumen: parsed.resumen || '',
        recomendaciones: Array.isArray(parsed.recomendaciones) ? parsed.recomendaciones.slice(0, 5) : [],
        senales_riesgo: Array.isArray(parsed.senales_riesgo) ? parsed.senales_riesgo : [],
        proyeccion_3meses: parsed.proyeccion_3meses || { confianza: 'baja', nota: '' },
        estado_actual: estado,
    };

    return { result, llm: llmResp };
}
