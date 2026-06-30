# Migración SiiF/SCV8 → MotoFlow (MotoPréstamos Los Naranjos)

Extrae datos de los respaldos MySQL diarios del sistema viejo (en `E:\COPIAS\<fecha>\`)
y los carga en el sistema nuevo (Supabase) **sin instalar MySQL**. Es **idempotente**:
se puede correr cada vez que haya un respaldo nuevo y no duplica (hace upsert por `legacy_id`).

## Uso rápido (lo normal)

Doble clic en **`actualizar-desde-backup.bat`** — toma el respaldo más reciente de
`E:\COPIAS` y actualiza clientes, vehículos y préstamos en el sistema nuevo.

O por consola:
```
node scripts/migracion-siif/migrar-todo.mjs --commit     # carga real
node scripts/migracion-siif/migrar-todo.mjs              # simulación (no escribe)
```

## Programar diario (opcional)
Programador de tareas de Windows → Crear tarea básica → diaria → "Iniciar un programa"
→ seleccionar `actualizar-desde-backup.bat`.

## Requisitos
- **Node.js** (ya instalado).
- Archivo **`.env`** en esta carpeta con:
  ```
  SUPABASE_URL=https://zdvxowpuklbypweyqqki.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=<service_role secret de producción>
  ```
  (No se sube a git. La service_role key sale de Supabase → Project Settings → API.)

## Qué carga (empresa destino: MotoPréstamos Los Naranjos)
| Fase | Origen | Destino |
|------|--------|---------|
| 1. Clientes | `scv8_mp_los_naranjos` + `prestamos_01/02/05` | `clientes` |
| 2. Vehículos | `scv8_mp_los_naranjos.mercancias` | `productos` (código = chasis) |
| 3. Préstamos | `prestamos_01/02/05` | `prestamos` + `prestamo_cuotas` |

## Notas (Fase 3 — basada en el libro real)
- Las **cuotas/saldo** salen de `cxc_pendiente` (saldo pendiente real por préstamo:
  fila de capital + filas de interés). Así el balance coincide con el sistema viejo.
- El **historial de pagos** sale de las transacciones `RI` de `cxc_mov_master` → tabla
  `prestamo_pagos` (de ahí "Último Pago" y la lista de abonos).
- Un préstamo se marca **activo solo si tiene saldo real** en `cxc_pendiente`; el resto
  (refinanciados/viejos) quedan como cabecera saldada → la cartera no se infla.
- `frecuencia` se asume **mensual** (el `forma_pago` viejo no está documentado).
- Préstamos cuyo cliente no aparece en ninguna base se omiten (se reportan en consola).

## Archivos
- `lib/parseDump.mjs` — parser de los volcados mysqldump (sin MySQL).
- `fase1-clientes.mjs` / `fase1-cargar-clientes.mjs`
- `fase2-vehiculos.mjs` / `fase2-cargar-vehiculos.mjs`
- `fase3-cargar-prestamos.mjs`
- `migrar-todo.mjs` — corre todo en orden.
- `verify-*.mjs`, `check-conexion.mjs`, `tenants-info.mjs` — utilidades de verificación.
- `out/` — JSON/SQL generados (no se versiona).
