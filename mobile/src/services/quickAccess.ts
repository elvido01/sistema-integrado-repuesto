import AsyncStorage from '@react-native-async-storage/async-storage';

export type QuickAccessOption = {
  name: string;
  label: string;
  moduleKey?: string;
};

// >>> POR QUÉ ESTA LISTA IMPORTA MÁS DE LO QUE PARECE <<<
// `normalizeQuickAccess` descarta en silencio todo lo que no esté aquí.
// Hermes salía en el menú con su botón "Fijar abajo", se guardaba... y se
// perdía al normalizar, porque nunca se agregó a esta lista. El botón no
// daba error: simplemente no pasaba nada, que es la peor forma de fallar.
export const QUICK_ACCESS_OPTIONS: QuickAccessOption[] = [
  { name: 'index', label: 'Inicio' },
  { name: 'proyectos', label: 'Proyectos', moduleKey: 'vent-proyectos' },
  { name: 'hermes', label: 'Hermes', moduleKey: 'hermes-chat' },
  { name: 'scanner', label: 'Scanner', moduleKey: 'scanner' },
  { name: 'catalogo', label: 'Catalogo', moduleKey: 'catalogo' },
  { name: 'pos', label: 'Venta', moduleKey: 'ventas' },
  { name: 'cotizaciones', label: 'Cotizaciones', moduleKey: 'cotizaciones' },
  { name: 'pedidos', label: 'Pedidos', moduleKey: 'pedidos' },
  { name: 'recibo-ingreso', label: 'Recibo de Ingreso', moduleKey: 'recibo-ingreso' },
  { name: 'recibo-pago-financiera', label: 'Recibo de Pago', moduleKey: 'recibo-ingreso' },
  { name: 'solicitudes', label: 'Solicitudes', moduleKey: 'solicitudes-compras' },
  { name: 'orden-compra', label: 'Orden de Compra', moduleKey: 'orden-compra' },
  { name: 'ubicacion', label: 'Ubicacion', moduleKey: 'actualizar-ubicacion' },
  { name: 'existencia', label: 'Existencia', moduleKey: 'actualizar-existencia' },
  { name: 'impresora', label: 'Impresora', moduleKey: 'impresora-bluetooth' },
  { name: 'configuracion', label: 'Configuracion', moduleKey: 'configuracion' },
];

export const DEFAULT_QUICK_ACCESS = ['index', 'catalogo', 'pos', 'cotizaciones', 'pedidos'];

const STORAGE_PREFIX = 'motoflow.mobile.quickAccess';
const listeners = new Set<(tabs: string[]) => void>();

const getStorageKey = (userId?: string | null) => `${STORAGE_PREFIX}:${userId || 'default'}`;

export const normalizeQuickAccess = (tabs?: string[] | null) => {
  const allowed = new Set(QUICK_ACCESS_OPTIONS.map((option) => option.name));
  const normalized = (tabs || []).filter((tab, index, arr) => allowed.has(tab) && arr.indexOf(tab) === index);
  return normalized;
};

export async function getQuickAccessTabs(userId?: string | null) {
  try {
    const raw = await AsyncStorage.getItem(getStorageKey(userId));
    if (!raw) return DEFAULT_QUICK_ACCESS;
    return normalizeQuickAccess(JSON.parse(raw));
  } catch {
    return DEFAULT_QUICK_ACCESS;
  }
}

export async function saveQuickAccessTabs(tabs: string[], userId?: string | null) {
  const normalized = normalizeQuickAccess(tabs);
  await AsyncStorage.setItem(getStorageKey(userId), JSON.stringify(normalized));
  listeners.forEach((listener) => listener(normalized));
  return normalized;
}

export function subscribeQuickAccess(listener: (tabs: string[]) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// (09/11/2026) Qué accesos aplican a ESTA empresa. Una sola regla para la
// barra de abajo, el menú Más y Configuración: antes Configuración ofrecía
// Hermes o Proyectos en cualquier empresa y al encenderlos no pasaba nada.
export const MORLA_TENANT = '00000000-0000-0000-0000-000000000001';
export const CAMINERO_MOTORS_TENANT = 'b39506c3-27dc-467d-830b-096731b83113';
// Más de 5 + "Mas" no caben: los nombres salen cortados ("Cotizaci…").
export const MAX_QUICK_ACCESS = 5;

export function accesoAplica(name: string, ctx: { tenantId?: string | null; tipoNegocio?: string | null }) {
  if (name === 'proyectos') return ctx.tipoNegocio === 'aluminio';
  if (name === 'hermes') return ctx.tenantId === MORLA_TENANT;   // prueba solo en Repuestos Morla
  if (name === 'recibo-pago-financiera' || name === 'solicitudes') return ctx.tenantId === CAMINERO_MOTORS_TENANT;
  if (name === 'recibo-ingreso') return ctx.tenantId !== CAMINERO_MOTORS_TENANT;
  return true;
}
