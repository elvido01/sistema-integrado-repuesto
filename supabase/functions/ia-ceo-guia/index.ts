// ============================================================
// ia-ceo-guia — la guía diaria del IA CEO: planes y tareas
// ============================================================
// (20/10/2026) El dueño: "MORLA IA CEO tiene que ser una guía diaria para
// el CEO, donde le proponga planes estratégicos divididos en tareas
// diarias". Cada mañana (pg_cron 7:00 am RD → ia_ceo_guia_llamar), por
// cada empresa del IA CEO (tenant_credit_plan):
//
//   1. MIDE: lee lo que sabe todo el sistema (ia_ceo_contexto), guarda la
//      foto de los números (ia_metricas_dia) y actualiza el progreso de
//      los planes activos. Cumplido o vencido, lo marca solo.
//   2. PLANES: los lunes, o si no hay ninguno, propone 2-3 planes de 30-90
//      días. Cada uno con una métrica del CATÁLOGO, su número de hoy (lo
//      pone el sistema, no el modelo) y una meta. El dueño los aprueba.
//   3. TAREAS: máximo 5 para hoy, de los planes activos, cada una con el
//      dato que la justifica y la pantalla donde se hace. Aprende de lo
//      que el dueño hizo, pospuso o descartó los días anteriores.
//   4. TELEGRAM: se las manda al dueño (bot de Hermes), una vez al día.
//
// No repite: si hoy ya hay tareas, no las rehace (salvo "rehacer" desde el
// panel, que solo quita las que siguen pendientes).
//
// Body: { modo?: 'auto'|'tareas'|'planes', rehacer?: boolean, tenant_id? }
// Con la sesión de un dueño/admin trabaja SOLO su empresa.
// ============================================================
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const MODELO = 'gpt-4o';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// ── El catálogo: lo único con lo que se puede medir un plan ─────────────
// (21/10/2026) Cada métrica dice para qué tipo de negocio sirve: a la
// financiera le proponía "subir las ventas", cuando crece prestando y
// cobrando. Sin "tipos" sirve para todos.
const METRICAS: Record<string, any> = {
  ventas_30d: { nombre: 'Ventas de los últimos 30 días', unidad: 'RD$', dir: 'subir', tipos: ['repuestos', 'dealer'], val: (c) => c.ventas?.ventas_30d },
  colocado_30d: { nombre: 'Monto prestado (colocado) en 30 días', unidad: 'RD$', dir: 'subir', tipos: ['financiera'], val: (c) => c.financiera?.colocado_30d },
  prestamos_nuevos_30d: { nombre: 'Préstamos nuevos en 30 días', unidad: 'préstamos', dir: 'subir', tipos: ['financiera'], val: (c) => c.financiera?.prestamos_nuevos_30d },
  cobrado_30d: { nombre: 'Cobrado de préstamos en 30 días', unidad: 'RD$', dir: 'subir', tipos: ['financiera'], val: (c) => c.financiera?.cobrado_30d },
  motos_vendidas_30d: { nombre: 'Motos vendidas en 30 días', unidad: 'motos', dir: 'subir', tipos: ['dealer'], val: (c) => c.dealer?.motos_vendidas_30d },
  ventas_atascadas: { nombre: 'Solicitudes aprobadas sin carta de ruta', unidad: 'solicitudes', dir: 'bajar', tipos: ['dealer'], val: (c) => c.dealer?.aprobadas_sin_carta_total },
  cxc_pendiente: { nombre: 'Cuentas por cobrar pendientes (facturas a crédito)', unidad: 'RD$', dir: 'bajar', tipos: ['repuestos', 'dealer'], val: (c) => c.ventas?.cxc_pendiente },
  clientes_sin_respuesta: { nombre: 'Clientes esperando respuesta más de 1 hora', unidad: 'clientes', dir: 'bajar', val: (c) => c.crm?.esperando_respuesta_mas_1h },
  ventas_ganadas_crm: { nombre: 'Ventas cerradas desde el CRM (30 días)', unidad: 'ventas', dir: 'subir', val: (c) => (c.crm ? Number(c.crm?.embudo_30d?.ganado || 0) : null) },
  agotados_sin_orden: {
    nombre: 'Piezas que se venden, agotadas y sin pedir', unidad: 'piezas', dir: 'bajar',
    val: (c) => (Array.isArray(c.agotados) ? c.agotados.filter((a) => a.estado === 'agotado' && !a.ya_en_orden).length : null),
  },
  mora_30d: { nombre: 'Préstamos con más de 30 días de atraso', unidad: 'préstamos', dir: 'bajar', tipos: ['financiera'], val: (c) => c.financiera?.atraso_mas_30_dias },
  monto_vencido: { nombre: 'Monto vencido de la cartera de préstamos', unidad: 'RD$', dir: 'bajar', tipos: ['financiera'], val: (c) => c.financiera?.monto_vencido },
  prestamos_con_atraso: { nombre: 'Préstamos con alguna cuota atrasada', unidad: 'préstamos', dir: 'bajar', tipos: ['financiera'], val: (c) => c.financiera?.prestamos_con_atraso },
  falta_cubrir: { nombre: 'Lo que falta cubrir del mes (gastos, suplidores, compromisos del grupo)', unidad: 'RD$', dir: 'bajar', val: (c) => c.grupo?.totales?.falta_cubrir },
};

// Las pantallas a las que puede llevar una tarea, por tipo de negocio.
const PANELES: Record<string, Record<string, string>> = {
  comun: {
    'whatsapp-crm': 'Sales Hub (conversaciones de clientes)',
    'cartera-clientes': 'Cartera de clientes (facturas a crédito por cobrar)',
    'flujo-caja': 'Flujo de caja',
    'gestion-empresarial': 'Gestión Empresarial (posición del grupo)',
    'cuentas-bancarias': 'Cuentas bancarias',
  },
  repuestos: {
    'orden-compra': 'Orden de compra (pedir al suplidor)',
    'equipo-ia': 'Equipo IA (promociones y publicaciones)',
    'mercancias': 'Mercancías (revisar una pieza, su conteo o su precio)',
    'inventario-fisico': 'Inventario físico (contar)',
    'ventas': 'Punto de venta',
  },
  dealer: {
    'ventas': 'Punto de venta',
    'solicitudes-compras': 'Solicitudes de compra de motos',
    'orden-compra': 'Orden de compra',
    'mercancias': 'Mercancías',
  },
  financiera: {
    'gestion-cobro': 'Gestión de cobro (llamar y dar seguimiento a los atrasados)',
    'prestamos': 'Préstamos',
    'recibo-pago': 'Recibo de pago (cobrar una cuota)',
    'resumen-cartera': 'Resumen de cartera',
    'ventas': 'Punto de venta',
  },
};
const panelesDe = (tipo: string) => ({ ...PANELES.comun, ...(PANELES[tipo] || PANELES.repuestos) });

const hoyRD = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
const diaSemanaRD = () => new Date().toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo', weekday: 'long' });
const esLunes = () => new Date().toLocaleDateString('en-US', { timeZone: 'America/Santo_Domingo', weekday: 'short' }) === 'Mon';
const fmt = (n: number, u: string) => (u === 'RD$' ? `RD$${Math.round(n).toLocaleString('en-US')}` : `${Math.round(n * 10) / 10} ${u}`);

function progresoDe(p: any, actual: number) {
  const base = Number(p.linea_base), meta = Number(p.meta);
  if (base === meta) return actual === meta ? 100 : 0;
  const r = p.direccion === 'subir' ? (actual - base) / (meta - base) : (base - actual) / (base - meta);
  return Math.max(0, Math.min(100, Math.round(r * 100)));
}

async function pensar(key: string, sistema: string, usuario: any, maxTokens = 1800) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELO, temperature: 0.4, max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: sistema }, { role: 'user', content: JSON.stringify(usuario) }],
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  return { res: JSON.parse(d.choices[0].message.content), uso: d.usage };
}

const SISTEMA_BASE = (e: any) => `Eres el IA CEO de ${e.nombre}, ${e.tipo_negocio === 'financiera'
  ? 'una financiera de préstamos (financia motores y presta con garantía)'
  : e.tipo_negocio === 'dealer' ? 'un dealer que vende motocicletas al contado y financiadas'
  : 'una tienda de repuestos de motocicletas'} en República Dominicana.
Tu trabajo es GUIAR al dueño cada día para que la empresa CREZCA y se FORTALEZCA económicamente.
Hablas como un asesor de confianza: directo, concreto, en español dominicano profesional, sin paja.
Solo afirmas lo que está en los datos que recibes. Nada genérico: cada cosa nombra la pieza, el cliente, el préstamo o la cifra.`;

// ── PLANES ─────────────────────────────────────────────────────────────
async function proponerPlanes(sb: any, key: string, tid: string, ctx: any, valores: any) {
  const { data: planes } = await sb.from('ia_planes').select('titulo, metrica, estado, nota_dueno, progreso, meta, linea_base')
    .eq('tenant_id', tid).gte('creado_at', new Date(Date.now() - 90 * 864e5).toISOString());
  const activos = (planes || []).filter((p) => p.estado === 'activo');
  if ((planes || []).some((p) => p.estado === 'propuesto')) return { propuestos: 0, motivo: 'ya hay propuestos' };
  const cupo = Math.max(0, 3 - activos.length);
  if (!cupo) return { propuestos: 0, motivo: 'ya hay 3 activos' };

  const tipo = ctx.empresa?.tipo_negocio || 'repuestos';
  const catalogo = Object.entries(METRICAS)
    .filter(([k, m]) => valores[k] != null && (!m.tipos || m.tipos.includes(tipo)))
    .map(([k, m]) => ({ metrica: k, nombre: m.nombre, valor_hoy: valores[k], unidad: m.unidad, hay_que: m.dir }));
  const sistema = `${SISTEMA_BASE(ctx.empresa)}

Hoy toca proponer PLANES ESTRATÉGICOS de 30 a 90 días (máximo ${cupo}). Cada plan:
- ataca lo que más pesa HOY en la salud económica de la empresa (mira "negocio"),
- se mide con UNA métrica del "catalogo" (usa la clave exacta en "metrica"), con una META realista y alcanzable
  (para bajar: menor que el valor de hoy; para subir: mayor), y un plazo en días (30 a 90),
- no repite un plan activo ni uno que el dueño rechazó (mira "planes_recientes" y su nota).
Devuelve JSON: { "planes": [ { "titulo": "verbo + qué + meta, máx 80 letras (ej. Bajar la mora de +30 días de 102 a 70)",
  "porque": "1-2 frases con los datos que lo justifican", "metrica": "clave", "meta": número, "dias": número } ] }`;
  const { res, uso } = await pensar(key, sistema, {
    catalogo, negocio: ctx, planes_recientes: planes || [], fecha: hoyRD(),
  });
  const filas = [];
  for (const p of (res.planes || []).slice(0, cupo)) {
    const m = METRICAS[p.metrica];
    const base = valores[p.metrica];
    const meta = Number(p.meta);
    if (!m || base == null || !Number.isFinite(meta)) continue;
    if (m.tipos && !m.tipos.includes(tipo)) continue;
    if (m.dir === 'bajar' ? !(meta < base) : !(meta > base)) continue;   // meta al revés
    if (activos.some((a) => a.metrica === p.metrica)) continue;
    const dias = Math.max(30, Math.min(90, Number(p.dias) || 60));
    filas.push({
      tenant_id: tid, titulo: String(p.titulo || m.nombre).slice(0, 120), porque: String(p.porque || '').slice(0, 500),
      metrica: p.metrica, metrica_nombre: m.nombre, direccion: m.dir, unidad: m.unidad,
      linea_base: base, meta, valor_actual: base, progreso: 0,
      fecha_fin: new Date(Date.now() + dias * 864e5).toISOString().slice(0, 10), estado: 'propuesto',
    });
  }
  if (filas.length) await sb.from('ia_planes').insert(filas);
  return { propuestos: filas.length, uso };
}

// ── TAREAS ─────────────────────────────────────────────────────────────
async function armarTareas(sb: any, key: string, tid: string, ctx: any, valores: any) {
  const hoy = hoyRD();
  const { data: activos } = await sb.from('ia_planes').select('id, titulo, metrica_nombre, unidad, linea_base, meta, valor_actual, progreso, fecha_fin')
    .eq('tenant_id', tid).eq('estado', 'activo');
  const { count: propuestos } = await sb.from('ia_planes').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tid).eq('estado', 'propuesto');
  const { data: anteriores } = await sb.from('ia_tareas').select('fecha, titulo, estado')
    .eq('tenant_id', tid).lt('fecha', hoy).gte('fecha', new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10))
    .order('fecha', { ascending: false }).limit(40);
  const paneles = panelesDe(ctx.empresa?.tipo_negocio);
  const sistema = `${SISTEMA_BASE(ctx.empresa)}

Arma las TAREAS DE HOY (${diaSemanaRD()} ${hoy}) para el dueño: MÁXIMO 5, ordenadas de la más importante a la menos.
- Si hay "planes_activos", la mayoría de las tareas hacen avanzar esos planes (di cuál con "plan": su número de la lista, desde 1).
  Si no hay planes activos, elige lo más urgente de "negocio" (plan: null).
- Cada tarea se hace HOY, en minutos u horas, y nombra exactamente qué/quién/cuánto con los datos (pieza con código,
  cliente, préstamo, monto). Empieza con un verbo ("Llama a…", "Pide…", "Contesta a…", "Aprueba la promo de…").
- "porque": el dato del sistema que la justifica, en una frase.
- "panel": la pantalla donde se hace, una clave EXACTA de "pantallas" (o null si no aplica).
- "telefono": si la tarea es llamar o escribirle a UNA persona y su teléfono viene en los datos, ponlo tal cual
  (solo dígitos); "contacto": "llamar" o "whatsapp". Si no hay teléfono en los datos, null en los dos.
- "conversacion": si la tarea es contestar o contactar a UN cliente que viene en crm (listos_para_comprar o
  casos_abiertos), pon su "conversacion_id" tal cual; si no, null.
- PROHIBIDAS las tareas vagas: "Revisa el flujo de caja", "Organiza una estrategia", "Analiza…", "Evalúa…".
  Si una tarea empieza con revisar/analizar/evaluar tiene que decir EXACTAMENTE qué cifra, pieza o cliente y qué
  decidir con eso (ej. "Verifica si existen las 32 motos de 2015 que el sistema da en inventario").
- Aprende de "tareas_anteriores": si el dueño DESCARTÓ un tipo de tarea, no insistas igual; si la POSPUSO, puedes
  volver a ponerla si sigue siendo importante; repite el estilo de las que HIZO.
- No le pidas cosas que el sistema ya resuelve solo (publicar, clasificar el CRM).
Devuelve JSON: { "tareas": [ { "titulo": "máx 90 letras", "porque": "máx 160 letras", "plan": número|null, "panel": "clave"|null,
  "telefono": "solo dígitos"|null, "contacto": "llamar"|"whatsapp"|null, "conversacion": "id"|null } ] }`;
  const entrada = {
    planes_activos: (activos || []).map((p, i) => ({ n: i + 1, titulo: p.titulo, mide: p.metrica_nombre,
      hoy: p.valor_actual, meta: p.meta, progreso: `${p.progreso}%`, hasta: p.fecha_fin })),
    negocio: ctx, pantallas: paneles, tareas_anteriores: anteriores || [],
  };
  let { res, uso } = await pensar(key, sistema, entrada);
  // (21/10/2026) Las vagas no pasan: se le devuelven UNA vez para que las
  // cambie por concretas; las que sigan vagas se quitan.
  const vagas = (res.tareas || []).filter(esVaga);
  if (vagas.length) {
    try {
      const otra = await pensar(key, sistema, { ...entrada,
        rechazadas_por_vagas: vagas.map((t) => t.titulo),
        instruccion: 'Estas tareas son vagas. Devuelve la lista completa otra vez cambiándolas por tareas concretas (qué, quién, cuánto).' });
      res = otra.res;
    } catch (e) { console.warn('[ia-ceo-guia] segunda vuelta:', e?.message || e); }
  }
  const telefonos = telefonosDe(ctx);
  const conversaciones = conversacionesDe(ctx);
  const filas = (res.tareas || []).filter((t) => !esVaga(t)).slice(0, 5).map((t, i) => {
    const plan = Number.isInteger(t.plan) && activos?.[t.plan - 1] ? activos[t.plan - 1].id : null;
    const panel = t.panel && paneles[t.panel] ? t.panel : null;
    return {
      tenant_id: tid, fecha: hoy, orden: i + 1, plan_id: plan,
      titulo: String(t.titulo || '').slice(0, 140), porque: String(t.porque || '').slice(0, 300),
      accion: {
        ...(panel ? { tipo: 'panel', panel, etiqueta: paneles[panel].split(' (')[0] } : { tipo: 'ninguna' }),
        // Solo un teléfono que venga en los datos: el modelo no inventa números.
        ...(t.telefono && telefonos.has(String(t.telefono).replace(/\D/g, ''))
          ? { telefono: String(t.telefono).replace(/\D/g, ''), contacto: t.contacto === 'whatsapp' ? 'whatsapp' : 'llamar' } : {}),
        // (21/10/2026) La conversación de ESE cliente: el botón abre la suya,
        // no la primera del Sales Hub. Solo ids que vengan en los datos.
        ...(t.conversacion && conversaciones.has(String(t.conversacion))
          ? { conversacion: conversaciones.get(String(t.conversacion)) } : {}),
      },
    };
  }).filter((t) => t.titulo);
  // Los planes propuestos esperan al dueño: va de primera.
  if (propuestos) {
    filas.unshift({ tenant_id: tid, fecha: hoy, orden: 0, plan_id: null,
      titulo: `Revisa ${propuestos === 1 ? 'el plan propuesto' : `los ${propuestos} planes propuestos`} y apruébalos o recházalos`,
      porque: 'Las tareas de cada día salen de los planes que apruebes.',
      accion: { tipo: 'planes' } });
    filas.splice(5);
    filas.forEach((f, i) => { f.orden = i + 1; });
  }
  if (filas.length) await sb.from('ia_tareas').insert(filas);
  return { tareas: filas.length, uso };
}

const VERBO_VAGO = /^(revisa|revisar|verifica|eval[uú]a|analiza|organiza|considera|planifica|mejora|optimiza|define|estudia|ajusta|explora|implementa)\b/i;
/** Vaga: empieza con un verbo de oficina y no nombra ni una cifra ni un nombre propio/código. */
function esVaga(t: any) {
  const titulo = String(t?.titulo || '').trim();
  if (/\bestrategias?\b/i.test(titulo)) return true;   // "organiza una estrategia…" nunca dice qué hacer
  if (!VERBO_VAGO.test(titulo)) return false;
  const resto = titulo.replace(VERBO_VAGO, '');
  return !/\d/.test(resto) && !/\b[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9-]{2,}\b/.test(resto);
}
/** Las conversaciones del CRM que vienen en el contexto: id → { id, canal, cliente }. */
function conversacionesDe(ctx: any) {
  const m = new Map<string, any>();
  for (const x of [...(ctx?.crm?.listos_para_comprar || []), ...(ctx?.crm?.casos_abiertos || [])]) {
    if (x?.conversacion_id) m.set(String(x.conversacion_id), { id: x.conversacion_id, canal: x.canal || null, cliente: x.cliente || null, telefono: x.telefono || null });
  }
  return m;
}
/** Los teléfonos que vienen en el contexto (los únicos que una tarea puede llevar). */
function telefonosDe(ctx: any) {
  const set = new Set<string>();
  const txt = JSON.stringify(ctx || {});
  for (const m of txt.matchAll(/"telefono":"(\d{7,15})"/g)) set.add(m[1]);
  return set;
}

// ── TELEGRAM ───────────────────────────────────────────────────────────
async function avisar(sb: any, tid: string, ctx: any) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN'), chat = Deno.env.get('TELEGRAM_CHAT_ID');
  if (!token || !chat) return 'sin telegram';
  const hoy = hoyRD();
  const { error: eYa } = await sb.from('ia_guia_avisos').insert({ tenant_id: tid, fecha: hoy });
  if (eYa) return 'ya avisado';
  const { data: tareas } = await sb.from('ia_tareas').select('orden, titulo, porque, accion').eq('tenant_id', tid).eq('fecha', hoy).order('orden');
  const { data: planes } = await sb.from('ia_planes').select('titulo, progreso, estado').eq('tenant_id', tid).in('estado', ['activo', 'propuesto']);
  if (!tareas?.length) { await sb.from('ia_guia_avisos').delete().eq('tenant_id', tid).eq('fecha', hoy); return 'sin tareas'; }
  const lineas = [`🧭 ${ctx.empresa?.nombre || 'Tu empresa'} · tus tareas de hoy (${diaSemanaRD()})`, ''];
  for (const t of tareas) {
    lineas.push(`${t.orden}. ${t.titulo}`, t.porque ? `   ↳ ${t.porque}` : '');
    // En el teléfono, el número se toca y llama (o abre WhatsApp).
    const tel = t.accion?.telefono;
    if (tel) lineas.push(t.accion.contacto === 'whatsapp' ? `   💬 https://wa.me/${tel.length === 10 ? `1${tel}` : tel}` : `   📞 +${tel.length === 10 ? `1${tel}` : tel}`);
  }
  const act = (planes || []).filter((p) => p.estado === 'activo');
  if (act.length) {
    lineas.push('', 'Planes en marcha:');
    for (const p of act) lineas.push(`📈 ${p.titulo} · ${p.progreso}%`);
  }
  const prop = (planes || []).filter((p) => p.estado === 'propuesto').length;
  if (prop) lineas.push('', `🆕 ${prop} plan${prop > 1 ? 'es' : ''} propuesto${prop > 1 ? 's' : ''}: apruébalo${prop > 1 ? 's' : ''} en IA CEO → Planes.`);
  lineas.push('', 'Márcalas en MotoFlow → IA CEO → Hoy.');
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: lineas.filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n'), disable_web_page_preview: true }),
  }).catch(() => null);
  if (!r?.ok) { await sb.from('ia_guia_avisos').delete().eq('tenant_id', tid).eq('fecha', hoy); return `telegram ${r?.status}`; }
  return 'enviado';
}

// ── La vuelta de una empresa ───────────────────────────────────────────
async function guiaDe(sb: any, key: string, tid: string, modo: string, rehacer: boolean, conAviso: boolean) {
  const hoy = hoyRD();
  const { data: ctx, error } = await sb.rpc('ia_ceo_contexto', { p_tenant_id: tid });
  if (error || !ctx) throw new Error(`contexto: ${error?.message || 'vacío'}`);

  // 1. Medir
  const valores: Record<string, number> = {};
  for (const [k, m] of Object.entries(METRICAS)) {
    const v = m.val(ctx);
    if (v != null && Number.isFinite(Number(v))) valores[k] = Number(v);
  }
  await sb.from('ia_metricas_dia').upsert({ tenant_id: tid, fecha: hoy, valores }, { onConflict: 'tenant_id,fecha' });
  const { data: activos } = await sb.from('ia_planes').select('*').eq('tenant_id', tid).eq('estado', 'activo');
  for (const p of activos || []) {
    const v = valores[p.metrica];
    if (v == null) continue;
    const progreso = progresoDe(p, v);
    const estado = progreso >= 100 ? 'cumplido' : (p.fecha_fin < hoy ? 'vencido' : 'activo');
    await sb.from('ia_planes').update({ valor_actual: v, progreso, estado, actualizado_at: new Date().toISOString() }).eq('id', p.id);
  }

  const out: any = { tenant_id: tid, empresa: ctx.empresa?.nombre };
  // 2. Planes: los lunes, si no hay ninguno, o si lo piden
  const { count: vivos } = await sb.from('ia_planes').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tid).in('estado', ['activo', 'propuesto']);
  if (modo === 'planes' || esLunes() || !vivos) out.planes = await proponerPlanes(sb, key, tid, ctx, valores);

  // 3. Tareas de hoy
  if (modo !== 'planes') {
    if (rehacer) await sb.from('ia_tareas').delete().eq('tenant_id', tid).eq('fecha', hoy).eq('estado', 'pendiente');
    const { count: yaHay } = await sb.from('ia_tareas').select('id', { count: 'exact', head: true }).eq('tenant_id', tid).eq('fecha', hoy);
    out.tareas = yaHay ? { tareas: 0, motivo: 'ya hay tareas hoy' } : await armarTareas(sb, key, tid, ctx, valores);
  }

  // 4. Telegram (la vuelta automática de la mañana)
  if (conAviso) out.telegram = await avisar(sb, tid, ctx);
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) return json({ ok: false, error: 'Falta OPENAI_API_KEY' }, 500);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));
  const modo = ['tareas', 'planes'].includes(body?.modo) ? body.modo : 'auto';

  // ¿Un dueño/admin desde el panel, o la vuelta de la mañana?
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u } = await sb.auth.getUser(jwt).catch(() => ({ data: null }));
  let tenants: string[] = [];
  let desdePanel = false;
  if (u?.user) {
    // (21/10/2026) MODO PRUEBA: solo admin@repuestosmorla.com (Repuestos Morla).
    if ((u.user.email || '').toLowerCase() !== 'admin@repuestosmorla.com') {
      return json({ ok: false, error: 'El IA CEO está en prueba: solo para Repuestos Morla.' }, 403);
    }
    const { data: prof } = await sb.from('profiles').select('role, tenant_id, is_superadmin').eq('id', u.user.id).single();
    if (!prof || (!['owner', 'admin'].includes(prof.role) && !prof.is_superadmin)) return json({ ok: false, error: 'Solo el dueño o un administrador.' }, 403);
    // La empresa ACTIVA de ese usuario, como la ve la base (get_user_tenant
    // con su propia sesión): así un dueño con varias empresas trabaja la que
    // tiene abierta.
    const comoEl = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: tenant } = await comoEl.rpc('get_user_tenant');
    tenants = [tenant || prof.tenant_id].filter(Boolean);
    desdePanel = true;
  } else {
    const { data: t } = await sb.from('tenant_credit_plan').select('tenant_id');
    tenants = (t || []).map((x) => x.tenant_id);
  }

  const resultados = [];
  for (const tid of tenants) {
    try {
      resultados.push(await guiaDe(sb, key, tid, modo, desdePanel && !!body?.rehacer, !desdePanel));
    } catch (e) {
      console.error('[ia-ceo-guia]', tid, e?.message || e);
      resultados.push({ tenant_id: tid, error: String(e?.message || e) });
    }
  }
  return json({ ok: true, resultados });
});
