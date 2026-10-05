import { supabase } from '@/lib/customSupabaseClient';

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

const ACEPTADOS = new Set(['aceptado', 'aceptado_condicional']);
const contarAceptados = (casos) => (casos || []).filter((c) => ACEPTADOS.has(c?.estado)).length;
// El juego de pruebas se reconoce por su primer e-NCF (viene del Excel de la DGII).
const claveDelSet = (casos) => String(casos?.[0]?.encf || casos?.[0]?.manualEcf?.encf || '').trim();

// >>> COPIA EN EL SERVIDOR <<<
// (05/10/2026) El Paso 4 de D Mario se aprobó desde una PC que se averió y
// los XML firmados solo estaban en ese navegador: sin ellos no hay Paso 5.
// Cada guardado va también a dgii_certificacion_corridas, que nunca se pisa
// con una versión con menos aceptados (sql/dgii_certificacion_en_el_servidor.sql).
let ultimaFirma = '';
let pendiente = null;
function copiarAlServidor(casos, completado) {
  const clave = claveDelSet(casos);
  if (!clave) return;
  const aceptados = contarAceptados(casos);
  const conXml = (casos || []).filter((c) => c?.xmlFirmado || c?.manualEcf?.xml_firmado).length;
  const firma = `${clave}|${aceptados}|${conXml}|${completado}`;
  if (firma === ultimaFirma) return;
  clearTimeout(pendiente);
  pendiente = setTimeout(async () => {
    try {
      const { error } = await supabase.rpc('dgii_cert_guardar_corrida', {
        p_set_clave: clave, p_casos: casos, p_aceptados: aceptados, p_completado: !!completado,
      });
      if (!error) ultimaFirma = firma;
    } catch (_) { /* el navegador sigue siendo la copia principal */ }
  }, 1500);
}

/** La corrida guardada en el servidor con más aceptados (la más reciente si empatan). */
export async function cargarDgiiSimulacionDelServidor() {
  try {
    const { data, error } = await supabase.from('dgii_certificacion_corridas')
      .select('casos, aceptados, completado, updated_at, set_clave')
      .eq('paso', 'paso4')
      .order('completado', { ascending: false })
      .order('aceptados', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error || !data?.length) return null;
    const r = data[0];
    return { version: 1, updatedAt: r.updated_at, casos: r.casos, paso4Completado: r.completado, desdeServidor: true, aceptados: r.aceptados };
  } catch (_) {
    return null;
  }
}

export const aceptadosDe = (estado) => contarAceptados(estado?.casos);

export function saveDgiiSimulacionState(casos, extra = {}) {
  copiarAlServidor(casos, extra?.paso4Completado);
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
