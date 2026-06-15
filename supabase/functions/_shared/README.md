# `_shared/` — Utilidades comunes para edge functions

Esta carpeta NO se despliega como edge function (Supabase ignora carpetas con prefijo `_`). Vive aquí para que cualquier función pueda importar utilities compartidas.

## Módulos

### `structured-log.ts`

Logger estructurado para edge functions. Reemplaza `console.log` con JSON parseable.

```typescript
import { logStructured, startTimer, getOrCreateTraceId } from "../_shared/structured-log.ts";

Deno.serve(async (req) => {
  const traceId = getOrCreateTraceId(req);

  logStructured("info", "request_received", { action: "emitir_factura" }, traceId);

  const finish = startTimer("emitir_factura_total", traceId);

  try {
    // ... lógica ...
    logStructured("info", "factura_emitida", {
      tenant_id: profile.tenant_id,
      factura_id,
      track_id: result.trackId,
    }, traceId);

    finish({ tenant_id, factura_id, factura_numero });
    return new Response(JSON.stringify(result));
  } catch (err) {
    logStructured("error", "emitir_factura_failed", {
      tenant_id: profile?.tenant_id,
      factura_id,
      error: err.message,
    }, traceId);
    finish({ error: err.message }, "error");
    throw err;
  }
});
```

### Niveles de log

- `debug` — diagnóstico verboso, no productivo
- `info` — flujo normal de negocio (emitir_factura, callback_recibido, etc.)
- `warn` — situación inesperada pero no crítica (callback duplicado, retry)
- `error` — falla técnica que requiere atención

### Migración gradual

**No** migres las 21 edge functions de golpe. La regla:

- **Toda función nueva** debe usar `structured-log` desde el día 1
- **Funciones existentes** se migran cuando se toquen por otra razón
- Prioridad de migración: `emitir-fiscal`, `dgii-callback`, `admin-management` (fiscales y de seguridad)

### Por qué JSON estructurado

Los logs JSON son indexables en Logflare / Grafana / cualquier sistema de observabilidad. Permite consultas tipo:

- "Mostrar todas las emisiones e-CF del tenant X en las últimas 24h"
- "Latencia P95 de `emitir_factura` por hora"
- "Errores agrupados por `error.code` en `dgii-callback`"

Con `console.log` plano nada de eso es posible.

### Trace IDs

El header `X-Request-Id` permite correlacionar logs entre microservicios. El frontend lo puede generar y pasarlo en cada `supabase.functions.invoke()`. Si no llega, el helper genera uno.
