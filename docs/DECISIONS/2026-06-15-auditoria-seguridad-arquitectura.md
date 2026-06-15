# 2026-06-15 — Auditoría de seguridad y arquitectura (Fase 0-3)

## Contexto

El usuario solicitó una auditoría completa del repo MotoFlow con foco en:
- Aislamiento multi-tenant (RLS, SECURITY DEFINER, edge functions)
- Cálculo de ITBIS (centralización, consistencia frontend↔backend)
- Acoplamiento con Supabase (god node `supabase` con 123 edges)
- Ciclos de importación (8 ciclos detectados por Graphify)
- Dominio de Abastecimiento (Órdenes de Compra)
- Flujo DGII e-CF (trazabilidad, idempotencia, máquina de estados)

Auditoría completa documentada en [docs/architecture-analysis/AUDIT-2026-06-15.md](../architecture-analysis/AUDIT-2026-06-15.md).

## Decisión

Aplicar el plan por fases del documento de auditoría:

- **Fase 0**: Seguridad inmediata (5 críticos + 3 altos)
- **Fase 0.10**: REVOKE PUBLIC/anon en 3 funciones legacy con PII expuesta
- **Fase 0.11**: Aislar 9 funciones SECURITY DEFINER residuales
- **Fase 1**: Red de seguridad (taxUtils + tests + inventarios + logger)
- **Fase 2**: Repositories progresivos + romper import cycles
- **Fase 3**: Repositories de compras/ventas + máquinas de estado formalizadas + DGII trazabilidad
- **Fase 4**: Reorganización a `src/features/` (preparada, ejecución gradual)
- **Fase 5**: Mantenimiento (Graphify, docs, hook git)

## Consecuencias

### Ganamos

**Seguridad multi-tenant** — de 19 funciones SECURITY DEFINER sin tenant check a 0 alertas reales. Smoke test con whitelist de falsos positivos confirmados.

**Reglas no negociables** documentadas en `docs/SECURITY_AND_RLS.md`:
- Regla 5: SIEMPRE `REVOKE EXECUTE FROM PUBLIC, anon` tras `SECURITY DEFINER`
- Convenciones de aislamiento por tenant en cada RPC

**Aliviar acoplamiento Supabase** — capa `src/repositories/` con 7 repositories:
- `shared/errorHandler.js`, `secuenciasRepository.js`
- `catalogo/clientesRepository`, `proveedoresRepository`, `vendedoresRepository`
- `inventario/productosRepository`
- `compras/ordenesCompraRepository`
- `ventas/facturasRepository`

**Cálculo de ITBIS centralizado** — `src/lib/taxUtils.js` con 5 funciones (normalizeTaxRate, calculateTaxAmount, extractTaxableBase, calculateLineAmount, sumLineTotals) + 28 tests vitest.

**Máquinas de estado formalizadas** — CHECK constraints en BD:
- `ordenes_compra.estado` (Pendiente, Recibida, Anulada)
- `documentos_fiscales.estado` y `.estado_dgii` (lista cerrada)

**DGII art. 38 NES** — `documentos_fiscales.emitido_por uuid REFERENCES auth.users(id)` para trazabilidad.

**Idempotencia DGII**:
- UNIQUE parcial en `documentos_fiscales(factura_id)` previene 2 e-CF para misma factura
- `dgii-callback` no sobreescribe estados terminales (preserva audit del primer callback)
- `dgii_anular_ecf` respeta estados terminales (no anula aceptados por DGII)

**Import cycles**: de 8 a 1 (fantasma por re-export, no afecta runtime). Solución: `panelCore.js` con context+hook sin imports de páginas.

**Red de seguridad**: 41 tests vitest, baseline para refactors futuros.

### Costos

**Complejidad**: la capa repositories agrega 1 nivel de indirección. Los archivos no migrados siguen usando `supabase` directo — mezcla durante la transición.

**SQL applied to prod** (idempotentes, todos sin migración destructiva):
- fix_0_1 a fix_0_11
- fix_3_2 a fix_3_3
- diagnostics_*

**Edge functions redesplegadas**:
- admin-management (tenant override)
- emitir-fiscal (XML totales + anular + emitido_por)
- dgii-callback (UPDATE condicional)

**Deuda pendiente**:
- `useVentas.js` (1156 LOC) no migrado a repository — sigue como god hook
- Reorganización a `src/features/` solo iniciada (README + plan), no ejecutada
- Tipo 33 DGII (Nota de Débito) sin implementar en producción
- Fase 3f certificación CerteCF pendiente

### Riesgo conocido residual

1. **`meta_webhook_events.tenant_id` NULLABLE** — riesgo bajo (RLS cubre el filter), pendiente revisar en Fase 2 refactor.
2. **Tabla `perfiles` legacy** — 3 filas ya migradas a `profiles`. Decisión: no DROP la tabla hasta confirmar que ningún backup/export antiguo la referencia.
3. **`useVentas.js` god hook** — refactor requiere tests de integración exhaustivos antes de tocar.

## Métricas finales

| Antes | Después |
|---|---|
| 19 funciones SECURITY DEFINER sin tenant | 0 alertas reales |
| 8 import cycles | 1 (cosmético por re-export) |
| 0 tests | 41/41 verde |
| `supabase` god node 123 edges | 130 (subió por nuevos archivos; meta = bajar gradualmente con migración) |
| Tabla legacy `perfiles` con 3 filas | Funciones legacy reemplazadas para leer `profiles` con tenant filter |
| `documentos_fiscales` sin UNIQUE | UNIQUE parcial en `factura_id`, `track_id`, `(tenant_id, encf)` |
| DGII estado sin CHECK | CHECK constraints en `estado` y `estado_dgii` |

## Referencias

- Auditoría: [docs/architecture-analysis/AUDIT-2026-06-15.md](../architecture-analysis/AUDIT-2026-06-15.md)
- 23 commits en la rama `feat/mercancias-filtros` con prefijos `fix(security)`, `fix(dgii)`, `feat(fase-X)`, `docs:`, `test:`
- Tests: `tests/taxUtils.test.js`, `tests/repositories.test.js`, `tests/pdfUtils.test.js`
