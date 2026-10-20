// ============================================================
// agents.ts — Sub-agentes IA del equipo MORLA AI CEO
// ============================================================
// Cada sub-agente recibe datos pre-filtrados (vía RPC SQL) y
// devuelve un análisis estructurado + alertas + decisiones.
//
// AI CEO Principal sintetiza todos los sub-reportes.
// ============================================================

// @ts-nocheck — Deno runtime
import { callLLM } from './llm.ts';

const MODEL = 'gpt-4o-mini';

// (20/10/2026) Cada empresa con su nombre y su tipo de negocio. Los prompts
// decían "MotoFlow" fijo y el CEO llamaba así a Repuestos Morla. index.ts lo
// fija antes de correr los agentes de cada empresa.
let EMPRESA = { nombre: 'la empresa', tipo: 'repuestos' };
const TIPOS = {
    repuestos: 'tienda de repuestos de motocicletas',
    dealer: 'dealer que vende motocicletas al contado y financiadas',
    financiera: 'financiera de préstamos (financia motores y presta con garantía)',
};
export function setEmpresa(nombre: string | null, tipo: string | null) {
    EMPRESA = { nombre: nombre || 'la empresa', tipo: tipo || 'repuestos' };
}
const conEmpresa = (system: string) => system.replaceAll('MotoFlow', EMPRESA.nombre)
    .replace('tienda de repuestos de motocicletas', TIPOS[EMPRESA.tipo] || TIPOS.repuestos)
    + `\n\nLa empresa es ${EMPRESA.nombre}, ${TIPOS[EMPRESA.tipo] || TIPOS.repuestos}, en República Dominicana.`;

// ────────────────────────────────────────────────
// Prompts del equipo
// ────────────────────────────────────────────────
const PROMPT_CFO = `Eres el CFO IA de MotoFlow — tienda de repuestos de motocicletas en República Dominicana.

ÁREA: Finanzas / Margen / Salud del negocio.

CONTEXTO: Recibes el Business Health Score actual + snapshots de los últimos 7 días + métricas clave.

TAREA:
1. Detecta señales de salud financiera (margen, ventas, capital).
2. Identifica los 2-3 hallazgos más importantes.
3. Sugiere acciones específicas con monto/impacto.

OUTPUT JSON estricto:
{
  "titulo": "string max 80 chars",
  "resumen": "1-2 oraciones max 200 chars",
  "prioridad": "alta" | "media" | "baja",
  "hallazgos": [
    { "tipo": "string", "diagnostico": "string", "impacto": "string", "accion_sugerida": "string" }
  ],
  "decisiones_recomendadas": [
    { "titulo": "string", "descripcion": "string", "risk_level": "low"|"medium"|"high" }
  ]
}`;

const PROMPT_INVENTARIO = `Eres el agente IA de Inventario para MotoFlow.

ÁREA: Stock, capital inmovilizado, reorden.

CONTEXTO: Recibes top productos con capital muerto + top productos con stock bajo (con velocidad de venta).

TAREA:
1. Identifica el top 3 capital muerto a liquidar (productos sin venta 180+ días).
2. Identifica el top 3 stock bajo URGENTE para reordenar (basado en velocidad 30 días).
3. Calcula cantidad sugerida de reorden basada en velocidad × 30 días - existencia.

OUTPUT JSON estricto:
{
  "titulo": "string max 80 chars",
  "resumen": "1-2 oraciones max 200 chars",
  "prioridad": "alta" | "media" | "baja",
  "liquidar": [
    { "codigo": "string", "descripcion": "string", "existencia": number, "capital": number, "accion": "string" }
  ],
  "reordenar": [
    { "codigo": "string", "descripcion": "string", "existencia": number, "vendidos_30d": number, "cantidad_sugerida": number, "urgencia": "alta"|"media"|"baja" }
  ],
  "decisiones_recomendadas": [
    { "titulo": "string", "descripcion": "string", "risk_level": "low"|"medium"|"high" }
  ]
}`;

const PROMPT_CREDITO = `Eres el agente IA de Crédito/Cobros para MotoFlow.

ÁREA: Riesgo de clientes, mora, cuentas por cobrar.

TAREA:
1. Clasifica cada cliente moroso por riesgo (alto/medio/bajo) según días vencidos y monto.
2. Sugiere acciones concretas (llamar, reducir crédito, suspender).
3. Identifica si hay clientes que justifican una decisión inmediata.

OUTPUT JSON estricto:
{
  "titulo": "string max 80 chars",
  "resumen": "1-2 oraciones max 200 chars",
  "prioridad": "alta" | "media" | "baja",
  "clientes_riesgo": [
    { "nombre": "string", "telefono": "string", "deuda": number, "dias_vencido": number, "riesgo": "alto"|"medio"|"bajo", "accion": "string" }
  ],
  "decisiones_recomendadas": [
    { "titulo": "string", "descripcion": "string", "risk_level": "low"|"medium"|"high" }
  ]
}`;

const PROMPT_VENTAS = `Eres el agente IA de Ventas para MotoFlow.

ÁREA: Tendencia de ventas, ticket promedio, productos top.

TAREA:
1. Analiza crecimiento/caída vs período previo.
2. Identifica top productos que están funcionando.
3. Identifica productos cayendo (caída >50%) y sugiere por qué.
4. Sugiere promociones o acciones de pricing.

OUTPUT JSON estricto:
{
  "titulo": "string max 80 chars",
  "resumen": "1-2 oraciones max 200 chars",
  "prioridad": "alta" | "media" | "baja",
  "analisis": "string max 400 chars con análisis claro",
  "top_productos": ["codigo - descripcion"],
  "productos_cayendo": [
    { "codigo": "string", "descripcion": "string", "cambio_pct": number, "posible_causa": "string" }
  ],
  "decisiones_recomendadas": [
    { "titulo": "string", "descripcion": "string", "risk_level": "low"|"medium"|"high" }
  ]
}`;

const PROMPT_COMPRAS = `Eres el agente IA de Compras y Suplidores para MotoFlow.

ÁREA: Gestión de suplidores, costos, recomendaciones de compra.

TAREA:
1. Identifica top 3 suplidores principales (los que mejor sirven a la empresa).
2. Detecta costos subiendo alarmantemente.
3. Recomienda productos urgentes para reordenar (stock bajo + velocidad alta).
4. Sugiere acciones específicas: renegociar precio, buscar alternativa, comprar urgente.

OUTPUT JSON estricto:
{
  "titulo": "string max 80 chars",
  "resumen": "1-2 oraciones max 200 chars",
  "prioridad": "alta" | "media" | "baja",
  "suplidores_top": [{ "nombre": "string", "fortalezas": "string" }],
  "costos_alarmantes": [
    { "codigo": "string", "descripcion": "string", "cambio_pct": number, "accion": "string" }
  ],
  "comprar_urgente": [
    { "codigo": "string", "descripcion": "string", "cantidad_sugerida": number, "suplidor": "string" }
  ],
  "decisiones_recomendadas": [
    { "titulo": "string", "descripcion": "string", "risk_level": "low"|"medium"|"high" }
  ]
}`;

const PROMPT_MARKETING = `Eres el agente IA de Marketing y Crecimiento para MotoFlow.

ÁREA: Promociones, contenido para redes, oportunidades de venta.

CONTEXTO: Recibes:
- Productos con margen alto + buen stock (candidatos para promocionar)
- Productos buenos para relanzar (margen alto pero baja venta reciente)
- Productos de alta rotación (lo que ya funciona)

TAREA:
1. Sugiere 3-5 productos para promocionar HOY (margen × stock = potencial).
2. Identifica 2-3 productos para relanzar con campaña dedicada.
3. Sugiere ideas concretas de contenido para WhatsApp/redes (incluye gancho).

OUTPUT JSON estricto:
{
  "titulo": "string max 80 chars",
  "resumen": "1-2 oraciones max 200 chars",
  "prioridad": "alta" | "media" | "baja",
  "promocionar_hoy": [
    { "codigo": "string", "descripcion": "string", "razon": "string", "idea_post": "string max 120 chars" }
  ],
  "relanzar": [
    { "codigo": "string", "descripcion": "string", "campana_sugerida": "string" }
  ],
  "ideas_contenido": [
    { "titulo": "string", "descripcion": "string", "canal": "whatsapp"|"facebook"|"instagram"|"tienda_fisica" }
  ],
  "decisiones_recomendadas": [
    { "titulo": "string", "descripcion": "string", "risk_level": "low"|"medium"|"high" }
  ]
}`;

const PROMPT_OPERACIONES = `Eres el agente IA de Operaciones para MotoFlow.

ÁREA: Eficiencia operativa, calidad de data, procesos lentos.

CONTEXTO: Recibes:
- # productos con existencia negativa (errores de movimientos)
- # productos con stock pero sin ubicación física
- Órdenes de compra pendientes (no recibidas)
- Top órdenes muy viejas (>15 días sin recibir)
- Movimientos de inventario grandes (>50 unidades) recientes

TAREA:
1. Identifica los problemas operativos más urgentes a corregir HOY.
2. Sugiere acciones concretas: revisar movimientos, contactar suplidor, asignar ubicación.
3. Detecta si hay un patrón sistémico (ej: muchos productos sin ubicación = falta proceso de recepción).

OUTPUT JSON estricto:
{
  "titulo": "string max 80 chars",
  "resumen": "1-2 oraciones max 200 chars",
  "prioridad": "alta" | "media" | "baja",
  "problemas_urgentes": [
    { "tipo": "string", "descripcion": "string", "accion": "string" }
  ],
  "ordenes_a_seguir": [
    { "numero": "string", "suplidor": "string", "dias": number, "accion": "string" }
  ],
  "decisiones_recomendadas": [
    { "titulo": "string", "descripcion": "string", "risk_level": "low"|"medium"|"high" }
  ]
}`;

const PROMPT_ESTRATEGIA = `Eres el agente IA de Estrategia y Crecimiento para MotoFlow.

ÁREA: Análisis trimestral (90 días) — visión de largo plazo, no operativa.

CONTEXTO: Recibes:
- Ventas trimestre actual vs anterior (crecimiento %)
- Evolución mensual últimos 6 meses
- Dependencia de top 5 suplidores (% concentración)
- Dependencia de top 5 clientes (% concentración)
- Top categorías por marca
- Clientes nuevos en el trimestre

TAREA:
1. Evalúa la SALUD ESTRATÉGICA del negocio (crecimiento real, no superficial).
2. Detecta CONCENTRACIONES DE RIESGO (si un suplidor o cliente >30% del negocio).
3. Identifica LÍNEAS A IMPULSAR (categorías que crecen) y A REDUCIR (categorías que decaen).
4. Sugiere PLAN DE ACCIÓN para próximo trimestre (3-5 acciones estratégicas).
5. Identifica OPORTUNIDADES DE CRECIMIENTO concretas.

OUTPUT JSON estricto:
{
  "titulo": "string max 100 chars (visión estratégica clara)",
  "resumen": "2-3 oraciones max 300 chars",
  "prioridad": "alta" | "media" | "baja",
  "salud_estrategica": "string max 200 chars",
  "riesgos_concentracion": [
    { "tipo": "suplidor"|"cliente"|"categoria", "nombre": "string", "porcentaje": number, "recomendacion": "string" }
  ],
  "lineas_impulsar": [{ "categoria": "string", "razon": "string" }],
  "lineas_reducir": [{ "categoria": "string", "razon": "string" }],
  "plan_trimestre": [
    { "accion": "string", "porque": "string", "horizonte": "1-30 dias"|"30-60 dias"|"60-90 dias" }
  ],
  "oportunidades_crecimiento": ["string", "string", "string"],
  "decisiones_recomendadas": [
    { "titulo": "string", "descripcion": "string", "risk_level": "low"|"medium"|"high" }
  ]
}

ESTILO: Habla como un consultor estratégico senior. Pragmático, sin academicismo, en español dominicano.`;

const PROMPT_CEO_PRINCIPAL = `Eres el AI CEO PRINCIPAL de MotoFlow — un asesor ejecutivo senior.

CONTEXTO: Recibes dos cosas:
1. "sub_reportes": lo que analizó hoy tu equipo (CFO, Inventario, Crédito, Ventas, Compras, Marketing, Operaciones).
2. "negocio": lo que saben HOY los demás módulos del sistema (datos reales, no opiniones):
   - grupo: posición del grupo de empresas (Gestión Empresarial): lo que hay que cubrir, cobros, suplidores, margen.
   - publicaciones: qué promociones en redes movieron la pieza (unidades/día antes y después, alcance), por objetivo.
   - agotados: piezas que se venden y se acabaron o se están acabando, cuánto pedir y si ya están en una orden.
   - promocionar: piezas que conviene anunciar hoy y por qué.
   - crm: embudo de clientes de 30 días, los que están LISTOS PARA COMPRAR, casos que tiene que decidir una persona,
     lo que se PERDIÓ por no tenerlo y cuántos clientes llevan más de 1 hora esperando respuesta.
   - financiera: préstamos activos, cuánto está vencido y los clientes más atrasados.
   - decisiones_pendientes: las que el dueño todavía no ha decidido.

TU TAREA:
1. Sintetiza en un reporte ejecutivo CORTO la imagen general del día.
2. Prioriza el TOP 3 de acciones más importantes para el dueño HOY, cruzando módulos (ej. una pieza agotada que
   además piden en el CRM; un cliente listo para comprar sin respuesta; una promoción que sí vendió y conviene repetir).
3. Asigna prioridad GLOBAL del día (alta si hay críticos, media si hay atención, baja si todo normal).
4. Genera 2-4 decisiones que requieran aprobación del dueño. CADA decisión es CONCRETA: nombra la pieza (con código),
   el cliente, el préstamo o el monto, y di qué hacer exactamente. PROHIBIDO lo genérico ("lanzar una campaña de
   marketing", "liquidar productos con capital muerto", "mejorar las ventas") si no dice qué, cuál y cuánto.
5. NO repitas ninguna de "decisiones_pendientes": si sigue siendo importante, menciónala en el resumen.

OUTPUT JSON estricto:
{
  "titulo": "string max 100 chars (frase ejecutiva clara, no genérica)",
  "resumen": "string max 250 chars — la situación general del día en 2 oraciones",
  "prioridad": "alta" | "media" | "baja",
  "top_acciones": [
    { "area": "finanzas"|"inventario"|"credito"|"ventas"|"compras"|"marketing"|"crm"|"financiera"|"operaciones", "accion": "string", "porque": "string con el dato que lo justifica" }
  ],
  "decisiones_recomendadas": [
    { "titulo": "string max 90 chars, con el nombre de la pieza/cliente/préstamo",
      "descripcion": "string: qué hacer exactamente y con qué dato del sistema se justifica",
      "area": "finanzas"|"inventario"|"credito"|"ventas"|"compras"|"marketing"|"crm"|"financiera"|"operaciones",
      "risk_level": "low"|"medium"|"high", "expected_impact": "string, con cifra si la hay" }
  ]
}

REGLAS:
- No inventes datos. Usa solo lo que viene de los sub-reportes y de "negocio". Si un bloque trae "error", ignóralo.
- Habla como asesor de confianza al dueño: directo, sin rodeos, sin paja.
- Si TODO está bien, dilo claramente con prioridad="baja".
- Usa español dominicano profesional.`;

// ────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────
function safeParse(content: string, fallback: any = {}): any {
    try { return JSON.parse(content); }
    catch (e) { console.error('JSON parse error:', content.slice(0, 200)); return fallback; }
}

async function callAgent(opts: { system: string; user: string; tenant: string; maxTokens?: number }) {
    return callLLM({
        system: conEmpresa(opts.system),
        user: opts.user,
        response_format: 'json',
        user_tag: opts.tenant,
        model: MODEL,
        max_tokens: opts.maxTokens || 1200,
        temperature: 0.1,
    });
}

// ────────────────────────────────────────────────
// Sub-agente: CFO
// ────────────────────────────────────────────────
export async function runCFO(supabase: any, tenant_id: string) {
    const { data: finanzas } = await supabase.rpc('get_finanzas_summary', { p_tenant_id: tenant_id });
    const llm = await callAgent({
        system: PROMPT_CFO,
        user: JSON.stringify(finanzas || {}),
        tenant: tenant_id,
    });
    const parsed = safeParse(llm.content, { titulo: 'CFO sin datos', resumen: 'No se pudo generar análisis financiero', prioridad: 'baja', hallazgos: [], decisiones_recomendadas: [] });
    return { agent_key: 'ai_cfo', parsed, llm, raw: finanzas };
}

// ────────────────────────────────────────────────
// Sub-agente: Inventario
// ────────────────────────────────────────────────
export async function runInventario(supabase: any, tenant_id: string) {
    const { data: inv } = await supabase.rpc('get_inventario_summary', {
        p_tenant_id: tenant_id,
        p_dias_lento: 90,
        p_dias_muerto: 180,
        p_limit: 25,
    });
    const llm = await callAgent({
        system: PROMPT_INVENTARIO,
        user: JSON.stringify(inv || {}),
        tenant: tenant_id,
        maxTokens: 1500,
    });
    const parsed = safeParse(llm.content, { titulo: 'Inventario sin datos', resumen: 'No se pudo generar análisis', prioridad: 'baja', liquidar: [], reordenar: [], decisiones_recomendadas: [] });
    return { agent_key: 'ai_inventario', parsed, llm, raw: inv };
}

// ────────────────────────────────────────────────
// Sub-agente: Crédito
// ────────────────────────────────────────────────
export async function runCredito(supabase: any, tenant_id: string) {
    const { data: cred } = await supabase.rpc('get_credito_summary', {
        p_tenant_id: tenant_id,
        p_limit: 25,
    });
    const llm = await callAgent({
        system: PROMPT_CREDITO,
        user: JSON.stringify(cred || {}),
        tenant: tenant_id,
    });
    const parsed = safeParse(llm.content, { titulo: 'Crédito sin datos', resumen: 'No se pudo generar análisis', prioridad: 'baja', clientes_riesgo: [], decisiones_recomendadas: [] });
    return { agent_key: 'ai_credito', parsed, llm, raw: cred };
}

// ────────────────────────────────────────────────
// Sub-agente: Ventas
// ────────────────────────────────────────────────
export async function runVentas(supabase: any, tenant_id: string, dias = 30) {
    const { data: ventas } = await supabase.rpc('get_ventas_summary', {
        p_tenant_id: tenant_id,
        p_dias: dias,
        p_limit: 15,
    });
    const llm = await callAgent({
        system: PROMPT_VENTAS,
        user: JSON.stringify(ventas || {}),
        tenant: tenant_id,
    });
    const parsed = safeParse(llm.content, { titulo: 'Ventas sin datos', resumen: 'No se pudo generar análisis', prioridad: 'baja', analisis: '', top_productos: [], productos_cayendo: [], decisiones_recomendadas: [] });
    return { agent_key: 'ai_ventas', parsed, llm, raw: ventas };
}

// ────────────────────────────────────────────────
// Sub-agente: Compras / Suplidores
// ────────────────────────────────────────────────
export async function runCompras(supabase: any, tenant_id: string) {
    const { data: compras } = await supabase.rpc('get_compras_summary', {
        p_tenant_id: tenant_id,
        p_dias: 90,
        p_limit: 15,
    });
    const llm = await callAgent({
        system: PROMPT_COMPRAS,
        user: JSON.stringify(compras || {}),
        tenant: tenant_id,
        maxTokens: 1500,
    });
    const parsed = safeParse(llm.content, { titulo: 'Compras sin datos', resumen: 'No se pudo generar análisis', prioridad: 'baja', suplidores_top: [], costos_alarmantes: [], comprar_urgente: [], decisiones_recomendadas: [] });
    return { agent_key: 'ai_compras', parsed, llm, raw: compras };
}

// ────────────────────────────────────────────────
// Sub-agente: Marketing
// ────────────────────────────────────────────────
export async function runMarketing(supabase: any, tenant_id: string) {
    const { data: mkt } = await supabase.rpc('get_marketing_summary', {
        p_tenant_id: tenant_id,
        p_limit: 15,
    });
    const llm = await callAgent({
        system: PROMPT_MARKETING,
        user: JSON.stringify(mkt || {}),
        tenant: tenant_id,
        maxTokens: 1500,
    });
    const parsed = safeParse(llm.content, { titulo: 'Marketing sin datos', resumen: 'No se pudo generar análisis', prioridad: 'baja', promocionar_hoy: [], relanzar: [], ideas_contenido: [], decisiones_recomendadas: [] });
    return { agent_key: 'ai_marketing', parsed, llm, raw: mkt };
}

// ────────────────────────────────────────────────
// Sub-agente: Operaciones
// ────────────────────────────────────────────────
export async function runOperaciones(supabase: any, tenant_id: string) {
    const { data: op } = await supabase.rpc('get_operaciones_summary', { p_tenant_id: tenant_id });
    const llm = await callAgent({
        system: PROMPT_OPERACIONES,
        user: JSON.stringify(op || {}),
        tenant: tenant_id,
        maxTokens: 1200,
    });
    const parsed = safeParse(llm.content, { titulo: 'Operaciones sin datos', resumen: '', prioridad: 'baja', problemas_urgentes: [], ordenes_a_seguir: [], decisiones_recomendadas: [] });
    return { agent_key: 'ai_operaciones', parsed, llm, raw: op };
}

// ────────────────────────────────────────────────
// Sub-agente: Estrategia (solo en reportes trimestrales)
// ────────────────────────────────────────────────
export async function runEstrategia(supabase: any, tenant_id: string) {
    const { data: est } = await supabase.rpc('get_estrategia_summary', { p_tenant_id: tenant_id });
    const llm = await callAgent({
        system: PROMPT_ESTRATEGIA,
        user: JSON.stringify(est || {}),
        tenant: tenant_id,
        maxTokens: 2000,
    });
    const parsed = safeParse(llm.content, { titulo: 'Estrategia sin datos', resumen: '', prioridad: 'baja', salud_estrategica: '', riesgos_concentracion: [], lineas_impulsar: [], lineas_reducir: [], plan_trimestre: [], oportunidades_crecimiento: [], decisiones_recomendadas: [] });
    return { agent_key: 'ai_estrategia', parsed, llm, raw: est };
}

// ────────────────────────────────────────────────
// Agente Principal: CEO
// ────────────────────────────────────────────────
export async function runCEOPrincipal(tenant_id: string, subReports: any[], negocio: any = null) {
    // Solo pasa al CEO los sub-reportes parseados (no la raw data — ya filtró el sub-agente)
    const input = subReports.map((r) => ({
        agente: r.agent_key,
        reporte: r.parsed,
    }));

    const llm = await callAgent({
        system: PROMPT_CEO_PRINCIPAL,
        user: JSON.stringify({ sub_reportes: input, negocio, fecha: new Date().toISOString().slice(0, 10) }),
        tenant: tenant_id,
        maxTokens: 2000,
    });
    const parsed = safeParse(llm.content, {
        titulo: 'Reporte CEO sin datos',
        resumen: 'No se pudo sintetizar',
        prioridad: 'baja',
        top_acciones: [],
        decisiones_recomendadas: [],
    });
    return { agent_key: 'ai_ceo_principal', parsed, llm };
}
