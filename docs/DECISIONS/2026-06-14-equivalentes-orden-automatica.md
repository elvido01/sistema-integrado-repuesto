# 2026-06-14 — Productos Equivalentes + Orden Automática + Reorganización por suplidor

## Contexto

Repuestos Morla acumula múltiples SKUs intercambiables (ej. BATERIA HOSUYA YTX5A-BS ≡ BATERIA Y-7443 — distintas calidades, mismo uso). Esto generaba tres problemas:

1. **Duplicación en compras**: la Orden Automática pedía cada SKU por separado, ignorando que el grupo ya tenía stock combinado suficiente
2. **Ventas perdidas**: cuando un SKU específico se agotaba, el cajero no sabía que había alternativa disponible
3. **Productos en orden equivocada**: el reorganizador detectó que productos con `suplidor_id = HAO` terminaban en órdenes Pendiente de IMDORE (probablemente porque cuando se vendieron tenían otro suplidor asignado y luego se corrigió el dato)

Restricciones:
- No crear módulos nuevos en sidebar (decisión previa del usuario: "muchos módulos contaminan UX")
- Integrar en módulos existentes (Mercancías + Orden de Compra + Ventas)
- Reglas basadas en datos (rotación, margen, confiabilidad) no en intuición

## Decisión

### 1. Modelo de datos

- `producto_grupos(id, nombre, tenant_id, ...)`
- `producto_grupo_miembros(grupo_id, producto_id, prioridad, prioridad_manual, score_ultimo, ...)`
  - `prioridad = 1` → es el preferido (⭐)
  - `prioridad_manual = true` → bloqueado del recalculo automático

### 2. Scoring weighted multi-criterio (investigación de mercado de pricing/restocking)

```
score = 0.45 × margen_pct
      + 0.30 × rotacion_score
      + 0.15 × confiabilidad
      + 0.10 × vol_relativo
penalty = 50 si confiabilidad < 10%
```

Estabilidad: solo cambia el preferido si nuevo gana por ≥ 5 puntos. Manual override respeta `prioridad_manual`.

### 3. Recalcular automático

Edge function `cron-recalcular-preferidos` (lunes 06:00 UTC) llama RPC `cron_recalcular_preferidos_all_tenants()` que itera por tenant sin depender de `get_user_tenant()`.

### 4. Integración con Orden Automática

`get_productos_para_orden_automatica_v2(p_suplidor_id)` envuelve la v1 y enriquece con metadata de grupo + reglas de ajuste:

- Grupo con stock combinado ≥ demanda 30d × 1.5 → cantidad = 0
- Es preferido → aumenta para cubrir déficit total del grupo
- Es sustituto → reduce a 30%

UI: badge 🔗 con popover en líneas ajustadas + toast con resumen.

### 5. Sugerencia en Ventas (Fase 4)

Cuando se agrega producto con `existencia ≤ 0`, RPC `sugerir_equivalentes_disponibles` retorna otros miembros del grupo con stock > 0, ordenados por preferido > mayor stock > mayor margen. Modal no-bloqueante.

### 6. Reorganizar por suplidor

Detección: productos terminan en órdenes del suplidor equivocado por cambios posteriores de `productos.suplidor_id`.

Solución triple:
- RPC `reorganizar_ordenes_pendientes_por_suplidor()` (one-shot manual)
- Botón en Orden de Compra → toolbar
- Trigger `trg_productos_suplidor_change` → automático al actualizar `productos.suplidor_id`

Cuando reutiliza orden Pendiente existente del nuevo suplidor: **refresca `fecha_orden = hoy` y `fecha_vencimiento = hoy + 15`** (consistente con `sendProductToOrdenCompra`).

## Consecuencias

**Ganamos:**
- Compras más inteligentes — el sistema deja de duplicar pedidos del mismo grupo
- Más conversión en ventas — alternativas visibles al instante
- Datos consistentes — no más líneas en órdenes del suplidor equivocado
- Marco extensible para futuras decisiones (scoring puede pesar más métricas)

**Costos:**
- Complejidad nueva — desarrolladores y agentes deben entender el modelo del grupo
- Cron semanal — un punto más que monitorear
- Trigger automático puede sorprender en ediciones masivas (mitigación documentada en `SECURITY_AND_RLS.md`)

**Pendiente:**
- Métricas de impacto: medir reducción de duplicados en órdenes y aumento de conversión post-sugerencia
- UI de "historial de cambios de preferido" — útil cuando el usuario quiere saber por qué cambió el ⭐

## Referencias

- SQL: `sql/producto_grupos_equivalentes.sql`, `sql/producto_preferido_scoring.sql`, `sql/cron_recalcular_preferidos.sql`, `sql/get_productos_orden_automatica_v2_grupos.sql`, `sql/sugerir_equivalentes_disponibles.sql`, `sql/reorganizar_ordenes_por_suplidor.sql`, `sql/fix_fecha_ord_0043_y_rpc.sql`
- Componentes: `src/components/products/EquivalentesPanel.jsx`, `src/components/ventas/SugerenciasEquivalentesModal.jsx`
- Páginas: `src/pages/ProductsPage.jsx`, `src/pages/OrdenCompraPage.jsx`, `src/pages/VentasPage.jsx`
- Edge function: `supabase/functions/cron-recalcular-preferidos/`
