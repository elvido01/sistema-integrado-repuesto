// @ts-nocheck
// deno-lint-ignore-file
//
// Logger estructurado compartido para edge functions de MotoFlow (Fase 1.6).
//
// Uso:
//   import { logStructured } from "../_shared/structured-log.ts";
//   logStructured("info", "factura_emitida", { tenant_id, user_id, factura_id });
//
// Beneficios:
//   - Cada log incluye trace_id, timestamp ISO, environment, function name
//   - JSON estructurado (parseable en Logflare / dashboards)
//   - Niveles claros (debug / info / warn / error)
//   - Diferencia entre log de negocio vs error tecnico
//
// Idea: cada edge function que se toque a partir de Fase 1 importa este
// helper y reemplaza sus `console.log` por `logStructured`. NO se obliga
// a migrar las 21 funciones a la vez.

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  tenant_id?: string | null;
  user_id?: string | null;
  factura_id?: string | null;
  documento_id?: string | null;
  track_id?: string | null;
  action?: string | null;
  duration_ms?: number | null;
  error?: string | null;
  [key: string]: unknown;
}

/**
 * Identifica de qué edge function viene el log basándose en la URL del
 * runtime. Útil porque la misma función puede recibir múltiples acciones
 * y queremos saber cuál corrió.
 */
const inferFunctionName = (): string => {
  try {
    const cwd = Deno.cwd();
    const match = cwd.match(/functions[\/\\]([^\/\\]+)/);
    return match ? match[1] : "unknown";
  } catch {
    return "unknown";
  }
};

/**
 * Genera un trace ID corto único para correlacionar logs dentro de una
 * misma request. Para correlación cross-service usar el header
 * `x-request-id` del request si está disponible.
 */
const newTraceId = (): string =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const FUNCTION_NAME = inferFunctionName();
const ENV = Deno.env.get("ENVIRONMENT") || "prod";

/**
 * Logger principal. Imprime JSON estructurado a stdout (lo capturan los
 * logs de Supabase). Si level es "error", también imprime el mensaje
 * legible para que sea visible en la UI del dashboard.
 *
 * @param level   Nivel del log
 * @param event   Identificador de evento de negocio (ej. "factura_emitida")
 * @param context Datos contextuales tipo tenant_id, factura_id, etc.
 * @param traceId Opcional: ID de correlación (usar el mismo en toda la request)
 */
export const logStructured = (
  level: LogLevel,
  event: string,
  context: LogContext = {},
  traceId?: string,
): void => {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    function: FUNCTION_NAME,
    env: ENV,
    trace_id: traceId || newTraceId(),
    ...context,
  };

  const json = JSON.stringify(payload);

  // Supabase captura stdout para "Logs" del dashboard. Para que los errores
  // aparezcan también en la sección "Errors" usamos console.error.
  if (level === "error") {
    console.error(`[${FUNCTION_NAME}] ${event}: ${context.error ?? ""}`);
    console.error(json);
  } else {
    console.log(json);
  }
};

/**
 * Helper para medir duración de operaciones críticas. Retorna una
 * función que cuando se llama loguea cuánto tomó.
 *
 * @example
 *   const finish = startTimer("emitir_ecf");
 *   await emitir(...);
 *   finish({ tenant_id, factura_id });  // log con duration_ms
 */
export const startTimer = (event: string, traceId?: string) => {
  const t0 = Date.now();
  return (context: LogContext = {}, level: LogLevel = "info") => {
    logStructured(level, event, {
      ...context,
      duration_ms: Date.now() - t0,
    }, traceId);
  };
};

/**
 * Extrae el trace_id del header X-Request-Id si viene, o genera uno nuevo.
 * Permite correlación cross-service si el caller propaga el header.
 */
export const getOrCreateTraceId = (req: Request): string => {
  return req.headers.get("x-request-id") || newTraceId();
};
