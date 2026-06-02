export const DGII_SIMULACION_STORAGE_KEY = 'dgii_simulacion_certecf_v1';
export const DGII_SIMULACION_STATE_EVENT = 'dgii-simulacion-state-change';

const notifyDgiiSimulacionStateChange = () => {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(DGII_SIMULACION_STATE_EVENT));
    }
  } catch (_) {
    // Sin accion.
  }
};

export function loadDgiiSimulacionState() {
  try {
    const raw = localStorage.getItem(DGII_SIMULACION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.casos)) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

export function saveDgiiSimulacionState(casos, extra = {}) {
  try {
    localStorage.setItem(DGII_SIMULACION_STORAGE_KEY, JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      casos,
      ...extra,
    }));
    notifyDgiiSimulacionStateChange();
  } catch (_) {
    // No bloquea la corrida si el navegador no permite persistir.
  }
}

export function clearDgiiSimulacionState() {
  try {
    localStorage.removeItem(DGII_SIMULACION_STORAGE_KEY);
    notifyDgiiSimulacionStateChange();
  } catch (_) {
    // Sin accion.
  }
}
