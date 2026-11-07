// Qué incluye cada plan. (06/11/2026) Nómina: del plan Pro en adelante
// (PRO, ENTERPRISE y, en colegios, EDUCA PRO y EDUCA TOTAL). Decisión del dueño.

export const PLANES_PRO_EN_ADELANTE = ['PRO', 'ENTERPRISE', 'EDUCA PRO', 'EDUCA TOTAL'];

export const esPlanProOMas = (planNombre) =>
  PLANES_PRO_EN_ADELANTE.includes(String(planNombre || '').trim().toUpperCase());

/** Funciones que exigen plan Pro o más. */
export const FUNCIONES_PRO = { nomina: 'Nómina' };

// (07/11/2026) Sales Hub / CRM: PRO y ENTERPRISE, y en colegios EDUCA PRO y
// EDUCA TOTAL a precio completo. Una empresa con precio especial
// (tenants.precio_especial, p. ej. el precio fundador del Centenario) no lo
// trae: el CRM es del plan a precio completo. Decisión del dueño.
export const PLANES_CRM = ['PRO', 'ENTERPRISE', 'EDUCA PRO', 'EDUCA TOTAL'];

export const puedeCrm = (planNombre, especial) =>
  PLANES_CRM.includes(String(planNombre || '').trim().toUpperCase()) && !especial;

// (07/11/2026) Funciones de un plan mayor en el menú. Lo del plan SIGUIENTE
// sale en gris con "★ PRO" / "★ TOTAL" y, al tocarlo, una ventanita explica
// qué hace y cuánto más cuesta (no abre pestaña). Lo de dos planes más
// arriba no se enseña: hace ruido. Decisión del dueño.
const ESCALON = {
  TRIAL: 0, SERVICIOS: 0, BASICO: 0, PRO: 1, ENTERPRISE: 2,
  'EDUCA INICIAL': 0, 'EDUCA PRO': 1, 'EDUCA TOTAL': 2,
};
const esEduca = (p) => String(p || '').toUpperCase().startsWith('EDUCA');
const norm = (p) => String(p || '').trim().toUpperCase();

/**
 * Por función del menú: los planes que la traen (de menor a mayor) y lo que
 * dice la ventanita. 'incluye' = otras cosas que trae ese plan.
 */
export const FUNCIONES_PLAN = {
  nomina: {
    planes: PLANES_PRO_EN_ADELANTE,
    titulo: 'Nómina del personal',
    descripcion: 'Sueldos, TSS y adelantos de cada empleado, con su recibo de pago.',
    incluye: { PRO: ['Sales Hub: WhatsApp, Instagram y Facebook en una bandeja', 'Más usuarios'], 'EDUCA PRO': ['Recordatorios de pago por WhatsApp', 'Sales Hub: WhatsApp, Instagram y Facebook', 'Hasta 800 estudiantes'] },
  },
  'whatsapp-crm': {
    planes: PLANES_CRM,
    titulo: 'Sales Hub',
    descripcion: 'Los mensajes de WhatsApp, Instagram y Facebook en una sola bandeja, con seguimiento de cada cliente.',
    incluye: { PRO: ['Nómina del personal', 'Más usuarios'], 'EDUCA PRO': ['Recordatorios de pago por WhatsApp', 'Nómina del personal', 'Hasta 800 estudiantes'] },
  },
  'colegio-notas': {
    planes: ['EDUCA TOTAL'],
    titulo: 'Notas y Boletines',
    descripcion: 'Registro de notas por competencia y período, y el boletín en formato MINERD listo para imprimir.',
    incluye: { 'EDUCA TOTAL': ['Los padres ven las notas en la página del colegio con su clave', 'Página web con tareas para descargar', 'Estudiantes y usuarios sin límite'] },
  },
  'colegio-tareas': {
    planes: ['EDUCA TOTAL'],
    titulo: 'Tareas en la página del colegio',
    descripcion: 'Los maestros suben las tareas desde el sistema y los estudiantes las descargan desde la página web del colegio, sin cuenta.',
    incluye: { 'EDUCA TOTAL': ['Página web con su propio dominio', 'Notas y boletín MINERD; los padres ven las notas con su clave', 'Estudiantes y usuarios sin límite'] },
  },
  'colegio-sitio': {
    planes: ['EDUCA TOTAL'],
    titulo: 'Página web del colegio',
    descripcion: 'Requisitos de inscripción, contacto, tareas y notas para los padres, con su propio dominio.',
    incluye: { 'EDUCA TOTAL': ['Tareas que los estudiantes descargan', 'Notas y boletín MINERD', 'Estudiantes y usuarios sin límite'] },
  },
};

/**
 * Cómo sale una función en el menú para este plan:
 *  'libre'   → normal;
 *  'mejorar' → en gris con ★ (la trae el plan siguiente): { plan } dice cuál;
 *  'oculta'  → no se enseña (dos planes más arriba, otra familia de planes,
 *              o el plan sí la trae pero el precio especial la quita).
 */
export function accesoFuncion(id, { planActual, especial = null, superAdmin = false } = {}) {
  const f = FUNCIONES_PLAN[id];
  if (!f || superAdmin) return { estado: 'libre' };
  const actual = norm(planActual);
  const permitido = id === 'whatsapp-crm' ? puedeCrm(actual, especial) : f.planes.includes(actual);
  if (permitido) return { estado: 'libre' };
  if (f.planes.includes(actual)) return { estado: 'oculta' }; // lo quita el precio especial
  const misma = f.planes.filter((p) => esEduca(p) === esEduca(actual) && ESCALON[p] !== undefined);
  if (!misma.length || ESCALON[actual] === undefined) return { estado: 'oculta' };
  const plan = misma.reduce((a, b) => (ESCALON[b] < ESCALON[a] ? b : a));
  return ESCALON[plan] - ESCALON[actual] === 1 ? { estado: 'mejorar', plan } : { estado: 'oculta' };
}

/** "EDUCA TOTAL" → "TOTAL", "PRO" → "PRO" (lo que dice la marquita). */
export const etiquetaPlan = (plan) => norm(plan).replace(/^EDUCA\s+/, '');
