# Base de Datos

Supabase (PostgreSQL) con RLS. Toda tabla del dominio lleva `tenant_id UUID` y políticas RLS que filtran por `get_user_tenant()`.

## Entornos

Hay **dos proyectos Supabase separados** desde 2026-03-28:

- **DEV** — para super usuario y desarrollo. Detalles en [memory/project_environments.md](../memory/project_environments.md)
- **PROD** — clientes reales (Repuestos Morla y otros tenants)

Las `.env.local` y `.env.production` apuntan a uno u otro.

## Convenciones globales

| Convención | Detalle |
|---|---|
| Multi-tenant | Toda tabla del dominio tiene `tenant_id UUID NOT NULL`. RLS filtra por `get_user_tenant()` |
| Identidad | `id UUID DEFAULT gen_random_uuid()` como PK |
| Timestamps | `created_at TIMESTAMPTZ DEFAULT NOW()`, `updated_at TIMESTAMPTZ` |
| ITBIS | Se guarda como decimal (0.18) NO como porcentaje (18). Convertir si llega como entero |
| Numeración | Secuencias por tenant via RPCs `get_next_*_numero(tenant_id)` |
| Cliente Supabase | Único export en [src/lib/customSupabaseClient.js](../src/lib/customSupabaseClient.js) |

## Tablas críticas

### Auth y tenant

| Tabla | Propósito |
|---|---|
| `profiles` | Espejo de `auth.users` con `tenant_id`, `nombre`, `role` |
| `tenants` | Empresas/clientes del SaaS |
| `config_empresa` | Branding + feature flags por tenant (logo, formato_factura, `feat_*`) |
| `user_module_permissions` | Qué paneles puede ver cada usuario (`module_key`) |
| `suscripciones` | Plan activo del tenant, vencimiento, estado |

### Productos e inventario

| Tabla | Notas |
|---|---|
| `productos` | `codigo`, `descripcion`, `costo`, `precio`, `itbis_pct`, `min_stock`, `max_stock`, `suplidor_id` (preferente), `activo`, `tipo_producto_id`, `marca_id`, `modelo_id`, `ubicacion_id` |
| `presentaciones` | Por producto: precios por nivel (`precio1/2/3`), `descuento_pct`, `afecta_ft`, `auto_precio2/3` |
| `entradas_mercancia` / `salidas_mercancia` | Movimientos manuales de inventario |
| `inventario_fisico` | Conteos físicos para ajustar stock |
| `cambios_codigo` | Renombrar SKU manteniendo historial |
| `almacenes` | Multi-almacén por tenant |
| `producto_grupos` / `producto_grupo_miembros` | Equivalentes (ver MODULES) |

### Compras

| Tabla | Notas |
|---|---|
| `compras` | Cabecera de compra recibida (`total_compra`, `aplicar_itbis`) |
| `compras_detalle` | Líneas |
| `ordenes_compra` | Orden de compra: `estado` (`Pendiente`/`Recibida`/`Anulada`), `suplidor_id`, `fecha_orden`, `fecha_vencimiento` |
| `ordenes_compra_detalle` | Líneas con `producto_id`, `cantidad`, `precio` (costo), `itbis_pct`, `importe` |
| `proveedores` | Suplidores (campo `nombre`, `rnc`, `telefono`, `local_suplidor_sugerido`) |
| `solicitudes_compras` | Solicitudes desde almacén/vendedor antes de orden |
| `suplidor_virtual_notas` | Productos agotados al suplidor real → cola de seguimiento |

### Compra Inteligente v2

| Tabla | Notas |
|---|---|
| `compra_inteligente_config` | Por tenant: `presupuesto_mensual`, `caja_minima_pct`, `incremento_pct`, `pin_supervisor_hash` |
| `compra_inteligente_movimientos` | Histórico de consumo de presupuesto (`orden_compra_id` lógica, no FK) |
| `compra_inteligente_aprobaciones` | Cola de aprobaciones cuando se excede el presupuesto |

### Ventas

| Tabla | Notas |
|---|---|
| `facturas` | Cabecera (`numero`, `cliente_id`, `total`, `estado` `Activa`/`Anulada`, `tipo_pago`, NCF) |
| `facturas_detalle` | Líneas (`producto_id`, `cantidad`, `precio`, `descuento_pct`, `itbis_pct`, `importe`) |
| `pedidos` / `pedidos_detalle` | Pedidos pendientes de facturar |
| `cotizaciones` / `cotizaciones_detalle` | Cotizaciones (retención 15 días) |
| `devoluciones` / `devoluciones_detalle` | Notas de crédito |
| `vendedores` | Con `comision_pct` |

### Cobros y pagos

| Tabla | Notas |
|---|---|
| `recibos_ingreso` | Cobros (`monto_pagado`, `cliente_id`) |
| `recibos_ingreso_aplicaciones` | Aplicación de recibos a facturas/abonos |
| `pagos_suplidores` | Pagos a proveedores |
| `pagos_comisiones` | Pagos comisión a vendedores |

### Caja

| Tabla | Notas |
|---|---|
| `cierres_caja` | Cierres con `efectivo_en_caja` (NO `saldo_final`) |
| `core_cash` / cash movements | Movimientos de caja operacional |

> ⚠️ Para presupuesto en Compra Inteligente NO usar `cierres_caja` — usar flujo operacional 30d. Ver [memory/project_compras_inteligentes.md](../memory/project_compras_inteligentes.md).

### DGII (e-CF)

| Tabla | Notas |
|---|---|
| `dgii_certificados` | Certificados .p12 por tenant en Storage |
| `dgii_documentos_fiscales` | e-CFs emitidos, estado, XML, track_id DGII |
| `dgii_callbacks_log` | Webhooks recibidos de DGII |
| `dgii_secuencias_ncf` | Pool NCF por tipo (31/32/33/34/41/43/44/45/46/47) |

### CRM / WhatsApp

| Tabla | Notas |
|---|---|
| `whatsapp_crm_conversaciones` | Hilos con clientes |
| `whatsapp_crm_mensajes` | Mensajes individuales |
| `meta_webhook_events` | Eventos crudos de Meta/Baileys |
| `sales_hub_leads` | Pipeline comercial (beta) |

### AI CEO / Marketing IA

Múltiples tablas `ai_*` para insights diarios, weekly, monthly, quarterly, strategy_forecast. Ver SQLs en `sql/ai_ceo_*.sql` y `sql/ai_marketing_*.sql`.

### GPS (Caminero Motors)

Tablas para dispositivos, ubicaciones, alertas, financiamiento. Ver `sql/gps_caminero_motors.sql`.

## RPCs (Postgres Functions) clave

| RPC | Para qué |
|---|---|
| `get_user_tenant()` | Devuelve el `tenant_id` del usuario autenticado. Base de toda RLS |
| `get_stock_actual(producto_uuid)` | Existencia real de un producto |
| `get_productos_paginados(...)` | Búsqueda de productos con filtros (devuelve `costo`, `precio`, `itbis_pct`, `existencia`) |
| `get_productos_para_orden_automatica(p_suplidor_id)` | Productos bajo stock del suplidor |
| `get_productos_para_orden_automatica_v2(p_suplidor_id)` | v1 + ajustes por grupos equivalentes |
| `get_next_orden_compra_numero()` / `get_next_factura_numero()` / etc. | Numeración secuencial por tenant |
| `sugerir_equivalentes_disponibles(p_producto_id)` | Para sugerir alternativas en venta cuando hay agotado |
| `sugerir_grupos_por_similitud(p_min_similarity)` | Trigram-based para descubrir grupos equivalentes |
| `recalcular_preferido_grupo(p_grupo_id)` | Aplica scoring weighted multi-criterio al grupo |
| `cron_recalcular_preferidos_all_tenants()` | Versión service-friendly para edge function semanal |
| `reorganizar_ordenes_pendientes_por_suplidor()` | Mueve líneas a la orden correcta del suplidor |
| `calcular_score_producto_en_grupo(p_grupo, p_producto)` | Score weighted 45% margen + 30% rotación + 15% confiabilidad + 10% vol |
| `get_stats_dashboard(...)` | Tarjetas del Home |

## Pasar arrays a RPCs jsonb

⚠️ **NO usar `JSON.stringify`** al llamar RPCs jsonb desde el cliente — pasar el array directo. Ver [memory/feedback_supabase_rpc_jsonb.md](../memory/feedback_supabase_rpc_jsonb.md).

## Numeración por tenant

Cada documento (factura, orden, recibo, etc.) tiene su contador por tenant. La regla: usar siempre la RPC `get_next_*_numero()` correspondiente, NUNCA generar el número en JS. Esto evita race conditions y respeta el aislamiento multi-tenant.

## Storage buckets

- `certificados-dgii` — `.p12` por tenant (privado)
- `logos-empresa` — branding por tenant
- `cartas-ruta` — imágenes de hojas de ruta
- `productos` — fotos de productos
- `disenos-marketing` — assets de Marketing IA
- `captut-pro` — videos y fuentes para AI Captut

## Migraciones

Cada cambio de schema vive en `sql/<descripcion>.sql`. La convención:

- Son idempotentes (`CREATE OR REPLACE`, `IF NOT EXISTS`, `DROP TRIGGER IF EXISTS`)
- Terminan con `NOTIFY pgrst, 'reload schema';` para refrescar PostgREST
- Si tocan datos críticos, hacen `SELECT` primero antes del UPDATE/DELETE
- Se aplican manualmente en el dashboard de Supabase de cada entorno (no hay `db push` automático)

## CLI de Supabase en Windows

⚠️ El wrapper npm crashea — usar el binario directo `C:\Users\PC\supabase-cli\supabase-go.exe` (alias `supabase`). Detalles en [memory/reference_supabase_cli_windows.md](../memory/reference_supabase_cli_windows.md).
