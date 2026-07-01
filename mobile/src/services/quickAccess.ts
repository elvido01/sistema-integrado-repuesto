import AsyncStorage from '@react-native-async-storage/async-storage';

export type QuickAccessOption = {
  name: string;
  label: string;
  moduleKey?: string;
};

export const QUICK_ACCESS_OPTIONS: QuickAccessOption[] = [
  { name: 'index', label: 'Inicio' },
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
