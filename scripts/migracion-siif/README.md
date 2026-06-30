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

## Notas / aproximaciones
- `prestamos` no tiene columna de balance: se deriva de `prestamo_cuotas`. Solo los
  préstamos activos (balance>0) llevan cuotas generadas (interés simple); los saldados
  van solo como cabecera.
- `frecuencia` se asume **mensual** (el `forma_pago` viejo 1/2/3 no está documentado).
- El detalle pagado por cuota es una reconstrucción (el sistema viejo era un libro de
  cargos/abonos, no un calendario fijo). El balance total por préstamo sí queda correcto.
- Préstamos cuyo cliente no aparece en ninguna base se omiten (se reportan en consola).

## Archivos
- `lib/parseDump.mjs` — parser de los volcados mysqldump (sin MySQL).
- `fase1-clientes.mjs` / `fase1-cargar-clientes.mjs`
- `fase2-vehiculos.mjs` / `fase2-cargar-vehiculos.mjs`
- `fase3-cargar-prestamos.mjs`
- `migrar-todo.mjs` — corre todo en orden.
- `verify-*.mjs`, `check-conexion.mjs`, `tenants-info.mjs` — utilidades de verificación.
- `out/` — JSON/SQL generados (no se versiona).
