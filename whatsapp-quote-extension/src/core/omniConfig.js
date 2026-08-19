import manifest from '../../public/manifest.json';

// La version que se enseña en el panel sale del MANIFEST, no de una copia
// a mano.
//
// >>> POR QUE <<<
// (2026-08-19) El numero vivia en tres sitios: manifest.json, manifest.beta.json
// y esta constante. Se desincronizaron los tres a la vez — el panel decia
// 2.1.0, el manifest 2.1.2 y el beta seguia en 2.1.0 — y la version es
// justo el dato que sirve para saber si la recarga entro. Un numero que
// puede mentir sobre eso es peor que no tenerlo.
//
// Ahora hay un solo sitio que tocar: la `version_name` del manifest.
export const OMNI_BETA_VERSION = manifest.version_name || manifest.version;
export const OMNI_SAFE_MODE_KEY = 'motoflow_omni_safe_mode';

const truthy = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());

export function isOmniBetaEnabled() {
  const envValue = import.meta.env.VITE_MOTOFLOW_OMNI_BETA;
  return envValue === undefined ? true : truthy(envValue);
}

export function getDefaultOmniFlags() {
  const igEnv = import.meta.env.VITE_MOTOFLOW_IG_ENABLED;
  const fbEnv = import.meta.env.VITE_MOTOFLOW_FB_ENABLED;
  const ttEnv = import.meta.env.VITE_MOTOFLOW_TT_ENABLED;

  return {
    omni_enabled: isOmniBetaEnabled(),
    instagram_enabled: igEnv === undefined ? true : truthy(igEnv),
    facebook_enabled: fbEnv === undefined ? true : truthy(fbEnv),
    tiktok_enabled: ttEnv === undefined ? true : truthy(ttEnv),
    unified_inbox_enabled: true,
    social_notifications_enabled: true,
    social_quotations_enabled: false
  };
}

export function readSafeMode() {
  try {
    return window.localStorage.getItem(OMNI_SAFE_MODE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeSafeMode(enabled) {
  try {
    window.localStorage.setItem(OMNI_SAFE_MODE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Storage can be blocked by the browser; safe mode still works in memory.
  }
}
