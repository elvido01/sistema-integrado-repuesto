# Plan: Control Inteligente de Compras v2 (Enterprise)

> Upgrade del modulo "Compra Inteligente" actual a una herramienta de
> planificacion financiera y control de cuentas por pagar. Exclusivo del
> plan ENTERPRISE.

**Decisiones tomadas (2026-06-08):**
- Presupuesto base: **HIBRIDO** — manual si configurado, automatico si no.
- Control Estricto: **BLOQUEA F10 + pide PIN de supervisor**.
- Alcance: **A + B + C completas** (5-9 semanas estimadas).

**Lo que YA existe (Compra Inteligente v1, NO tocar):**
- RPC `get_presupuesto_compras(tenant, dias, colchon)` — calcula `ventas × factor`
- RPC `get_productos_movimiento(uuid[])` — rotacion/margen/urgencia
- Edge Function `motoflow-compras-advisor` (gpt-4o-mini)
- Toggle "COMPRA INTELIGENTE" en `OrdenCompraPage.jsx`
- 6 cards + columna Prioridad + asesor IA inline

---

## FASE A — Cimientos (1-2 semanas)

### A.1 SQL: tabla `presupuesto_config`
Una fila por tenant. Persiste todos los parametros del documento.

Columnas:
- `tenant_id` UUID PK
- `monto_base_mensual` NUMERIC (NULL = usar calculo automatico)
- `incremento_mensual_pct` NUMERIC DEFAULT 0  (ej. 5 = 5%)
- `caja_minima` NUMERIC DEFAULT 0
- `dias_credito_promedio` INT DEFAULT 30
- `limite_aprobacion_manual` NUMERIC DEFAULT 0  (0 = sin limite)
- `control_estricto` BOOL DEFAULT false
- `distribuir_por` TEXT CHECK IN ('total','suplidor','categoria','mixto') DEFAULT 'total'
- `feature_activa` BOOL DEFAULT false  (gating Enterprise)
- `updated_at` TIMESTAMPTZ

### A.2 SQL: `pin_supervisor` en `config_empresa`
- Agregar columna `pin_supervisor_hash` TEXT  (bcrypt en backend)
- RPC `verificar_pin_supervisor(p_pin TEXT)` RETURNS BOOL

### A.3 RPC `get_caja_disponible(p_tenant_id, p_hasta_fecha)`
Calcula caja viva = cierres_caja saldo + recibos_ingreso - pagos_suplidores
(hasta una fecha dada). El sistema no tiene "caja viva" hoy.

### A.4 RPC `get_presupuesto_compras_v2(p_tenant_id, p_mes)`
Logica hibrida:
- Si hay config con `monto_base_mensual` → usar ese × (1 + incremento_pct × meses_desde_inicio).
- Si no → caer al `get_presupuesto_compras` actual.
- Resta `caja_minima` siempre.
- Devuelve: presupuesto_mensual, comprado_mes, disponible, salud (verde/amarillo/rojo).

### A.5 Feature flag `feat_compra_inteligente_enterprise`
- Columna en `config_empresa` o en `tenants`.
- Solo tenants Enterprise lo tienen activo por default (auto via trigger).

### A.6 UI `Configuracion → Finanzas → Presupuesto Inteligente`
Pagina nueva con form para los 8 parametros. CRUD simple.

### A.7 Renombrar semaforo en `OrdenCompraPage`
"sana/ajustada/tension" → "verde/amarillo/rojo" en UI (datos siguen igual en BD).

### A.8 Bloqueo F10 + PIN supervisor
En `OrdenCompraPage.handleSave`:
- Si `control_estricto = true` Y orden supera `disponible` → mostrar modal con PIN.
- Si PIN OK → grabar + loguear en `presupuesto_excepciones`.
- Si PIN incorrecto/cancelar → no grabar.

---

## FASE B — Inteligencia + Distribucion (2-3 semanas)

### B.1 Cron `cron-presupuesto-mensual`
Edge Function que corre el 1ro de cada mes:
- Lee `presupuesto_config` de cada tenant
- Calcula presupuesto del nuevo mes con `incremento_mensual_pct`
- Si hay senales de riesgo (CxP > X, vencidos > Y) → CONGELA o REDUCE
- Persiste en `presupuesto_historico`

### B.2 SQL `presupuesto_historico`
- `tenant_id`, `mes`, `monto_calculado`, `monto_aplicado`, `razon`, `salud_caja`
- Para trazar el incremento mes a mes

### B.3 Boton "Optimizar Compra"
En `OrdenCompraPage`:
- Si orden > disponible → boton aparece
- Llama RPC `optimizar_orden(detalles, presupuesto_objetivo)`
- Reduce productos sin rotacion (90d ventas = 0), mantiene urgentes
- Devuelve detalles ajustados para preview antes de aplicar

### B.4 SQL `presupuesto_asignaciones_suplidor`
- `tenant_id`, `suplidor_id`, `monto_asignado`, `mes`
- RPC `get_presupuesto_por_suplidor(tenant, suplidor, mes)`
- Card "Info del suplidor" en `OrdenCompraPage` cuando hay asignacion

### B.5 Integracion Morla AI CEO
Nueva action en el agente CEO:
- "Revisar presupuesto compras este mes"
- Llama RPCs, analiza con LLM, genera recomendaciones
- Aparece en el panel del CEO como tab/seccion

---

## FASE C — Workflow + Categoria + Reasignacion (3-4 semanas)

### C.1 Workflow de aprobacion
- Tabla `compras_aprobaciones (id, orden_id, solicitante, monto, estado, aprobador, fecha)`
- Rol nuevo "supervisor" en `user_module_permissions`
- UI cola de pendientes
- Email/notificacion al supervisor
- Cuando control_estricto=true y orden > limite_aprobacion_manual: orden entra a cola en vez de grabar directo

### C.2 Distribucion por categoria
- Prerequisito: verificar que `productos.categoria` esta poblado en al menos 80%
- Tabla `presupuesto_asignaciones_categoria`
- UI drag-and-drop para mover presupuesto entre categorias
- Engine "comprado vs disponible" por bucket

### C.3 Reasignacion dinamica
- Cron semanal o on-demand
- Si suplidor X uso solo 60% de su presupuesto → reasignar 40% a suplidor Y con mas demanda
- Algoritmo: priorizar por margen × rotacion del suplidor
- Logging obligatorio en `presupuesto_reasignaciones`

---

## Riesgos a monitorear

1. **Categoria** — si productos no estan tagueados, Fase C.2 no funciona. Verificar antes.
2. **Caja viva** — el sistema no tiene saldo de caja en vivo, requiere calculo en cada llamada (cuidar performance).
3. **PIN supervisor** — si se filtra, todo el control se rompe. Guardar como bcrypt + auditoria.
4. **Workflow** — el sistema no tiene cola de aprobaciones hoy. Fase C.1 es modulo nuevo completo (~5 dias).
5. **Cron mensual** — cuidar timezone (Repuestos Morla esta en ADT, no UTC).

## Glosario

- **Caja disponible**: saldo en caja viva (cierres_caja + recibos - pagos).
- **Caja minima**: monto que el sistema NUNCA debe permitir comprometer.
- **Presupuesto mensual**: tope teorico de compras del mes.
- **Disponible**: presupuesto_mensual - comprado_mes - (caja_minima si aplica).
- **Control estricto**: gate que bloquea F10 si orden > disponible.
- **Limite aprobacion**: monto a partir del cual orden requiere supervisor (independiente de presupuesto).
