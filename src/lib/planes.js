// Qué incluye cada plan. (06/11/2026) Nómina: del plan Pro en adelante
// (PRO, ENTERPRISE y, en colegios, EDUCA PRO y EDUCA TOTAL). Decisión del dueño.

export const PLANES_PRO_EN_ADELANTE = ['PRO', 'ENTERPRISE', 'EDUCA PRO', 'EDUCA TOTAL'];

export const esPlanProOMas = (planNombre) =>
  PLANES_PRO_EN_ADELANTE.includes(String(planNombre || '').trim().toUpperCase());

/** Funciones que exigen plan Pro o más. */
export const FUNCIONES_PRO = { nomina: 'Nómina' };
