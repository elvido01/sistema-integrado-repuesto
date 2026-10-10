// ============================================================
// errorIA.js — traduce los errores de los servicios externos
// ============================================================
// (10/10/2026) Equipo IA mostraba el JSON crudo de OpenAI ("OpenAI 429:
// { "error": { "message": "You have no credits remaining…") y no quedaba
// claro que era la cuenta sin saldo, ni qué hacer. Esto dice qué pasa y
// qué hacer, en una línea. El texto original queda para el title/tooltip.
//
//   traducirErrorIA(texto) → texto claro (o el original si no se reconoce)
// ============================================================

const REGLAS = [
  {
    // Sin saldo en OpenAI
    si: /insufficient_quota|credit_balance_exhausted|no credits remaining|exceeded your current quota/i,
    msg: 'La cuenta de OpenAI se quedó SIN SALDO. Recarga en platform.openai.com → Settings → Billing → "Add credits" y luego vuelve a encargar.',
  },
  {
    si: /credit balance is too low|anthropic.*(billing|credit)/i,
    msg: 'La cuenta de Anthropic (Claude) se quedó SIN SALDO. Recarga en console.anthropic.com → Billing y vuelve a intentar.',
  },
  {
    si: /RESOURCE_EXHAUSTED|generativelanguage.*quota|gemini.*quota/i,
    msg: 'Gemini (Google) llegó a su límite de uso. Espera a que se renueve o activa la facturación del proyecto en Google Cloud.',
  },
  {
    si: /invalid_api_key|incorrect api key|api key not valid|invalid x-api-key/i,
    msg: 'La clave del servicio de IA no es válida o fue revocada. Hay que poner una clave nueva en la configuración.',
  },
  {
    // 429 por velocidad (no por saldo): va después de la de saldo
    si: /rate_limit_exceeded|rate limit|too many requests/i,
    msg: 'El servicio de IA recibió demasiados pedidos seguidos. Espera un minuto y vuelve a intentar.',
  },
  {
    si: /content_policy|safety system|moderation_blocked|blocked by.*(safety|policy)/i,
    msg: 'El servicio de IA rechazó el pedido por sus reglas de contenido. Cambia la foto o el texto del encargo y vuelve a intentar.',
  },
  {
    si: /OAuthException|Error validating access token|"code"\s*:\s*190|session has expired/i,
    msg: 'Venció el acceso a Facebook/Instagram. Hay que renovar el token de Meta (npm run meta:token).',
  },
  {
    si: /timed? ?out|ETIMEDOUT|ECONNRESET|fetch failed|network error|socket hang up/i,
    msg: 'No hubo conexión con el servicio externo (se cortó o tardó demasiado). Vuelve a intentar en un momento.',
  },
];

export function traducirErrorIA(texto) {
  if (!texto) return '';
  const s = String(texto);
  const r = REGLAS.find((x) => x.si.test(s));
  return r ? r.msg : s;
}

// true si el error es por saldo/credenciales (hace falta que actúe una persona)
export function errorIANecesitaDueno(texto) {
  return /SIN SALDO|no es válida|Venció el acceso|activa la facturación/.test(traducirErrorIA(texto));
}
