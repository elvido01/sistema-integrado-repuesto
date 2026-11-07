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
