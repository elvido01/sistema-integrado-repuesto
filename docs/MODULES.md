# Módulos

Inventario funcional de los paneles. Si abres `componentMapping` en [PanelContext.jsx](../src/contexts/PanelContext.jsx) tienes el mapa técnico — este documento es el "qué resuelve cada uno" y cómo se relacionan.

## Operación diaria

| Panel | Archivo | Propósito |
|---|---|---|
| **Ventas** | [VentasPage.jsx](../src/pages/VentasPage.jsx) | Facturación POS (B01-B02), código + Enter, F10 grabar, sugerencia de equivalentes al agotar stock |
| **Recibo de Ingreso** | [ReciboIngresoPage.jsx](../src/pages/ReciboIngresoPage.jsx) | Cobros a clientes, aplicación a facturas/abonos |
| **Compras** | [ComprasPage.jsx](../src/pages/ComprasPage.jsx) | Recepción de mercancía con OCR de factura suplidor (`extract_purchase_from_image`) |
| **Pedidos** | [PedidosPage.jsx](../src/pages/PedidosPage.jsx) | Pedidos a facturar después |
| **Cotizaciones** | [CotizacionPage.jsx](../src/pages/CotizacionPage.jsx) | Cotizaciones con retención de 15 días |
| **Orden de Compra** | [OrdenCompraPage.jsx](../src/pages/OrdenCompraPage.jsx) | OC manuales + Orden Automática (reposición) + Compra Inteligente v2 + Reorganizar por suplidor |
| **Devoluciones** | [DevolucionesPage.jsx](../src/pages/DevolucionesPage.jsx) | Notas de crédito (e-CF 33 pendiente) |
| **Mercancías** | [ProductsPage.jsx](../src/pages/ProductsPage.jsx) | Maestro de productos + Equivalentes (modo agrupar, sugerencias IA, recalcular preferidos) |
| **Entrada/Salida Mercancía** | [EntradaMercanciaPage.jsx](../src/pages/EntradaMercanciaPage.jsx), [SalidaMercanciaPage.jsx](../src/pages/SalidaMercanciaPage.jsx) | Ajustes manuales de inventario |

## Inventario y catálogo

| Panel | Archivo | Propósito |
|---|---|---|
| **Inventario Físico** | [InventarioFisicoPage.jsx](../src/pages/InventarioFisicoPage.jsx) | Conteos físicos |
| **Inventario Inteligente** | [InventarioInteligentePage.jsx](../src/pages/InventarioInteligentePage.jsx) | Análisis ABC, rotación, alertas |
| **Solicitudes de Compras** | [SolicitudesComprasPage.jsx](../src/pages/SolicitudesComprasPage.jsx) | Pipeline de solicitudes antes de OC |
| **Solicitudes Agotados** | [SolicitudesPage.jsx](../src/pages/SolicitudesPage.jsx) | Productos pedidos por clientes que no tenemos |
| **Etiquetas Masivas** | [EtiquetasMasivasPage.jsx](../src/pages/EtiquetasMasivasPage.jsx) | Impresión códigos de barras |
| **Suplidor Virtual** | [SuplidorVirtualPage.jsx](../src/pages/SuplidorVirtualPage.jsx) | Cola para productos agotados al suplidor real |
| **Cambio de Código** | [CambioCodigoPage.jsx](../src/pages/CambioCodigoPage.jsx) | Renombrar SKUs |
| **Actualizar Ubicación** | [UpdateLocationPage.jsx](../src/pages/UpdateLocationPage.jsx) | Mover producto a otro tramo |
| **Catálogos** | [CatalogPage.jsx](../src/pages/CatalogPage.jsx) | CRUD tipos, marcas, modelos, ubicaciones, almacenes |
| **Productos Equivalentes** | [GruposEquivalentesPage.jsx](../src/pages/GruposEquivalentesPage.jsx) | Página standalone (Fase 1 — hoy integrado en Mercancías como dropdown) |

## Clientes / Suplidores / Vendedores

| Panel | Archivo |
|---|---|
| **Clientes** | [ClientesPage.jsx](../src/pages/ClientesPage.jsx) |
| **Suplidores** | [SuplidoresPage.jsx](../src/pages/SuplidoresPage.jsx) |
| **Vendedores** | [VendedoresPage.jsx](../src/pages/VendedoresPage.jsx) |
| **Cartera de Clientes** | [CarteraClientesPage.jsx](../src/pages/CarteraClientesPage.jsx) |
| **Documentación Cliente** | [DocumentacionClientePage.jsx](../src/pages/DocumentacionClientePage.jsx) |

## Pagos y caja

| Panel | Archivo |
|---|---|
| **Pago a Suplidores** | [PagoSuplidoresPage.jsx](../src/pages/PagoSuplidoresPage.jsx) |
| **Pago Comisiones** | [PagoComisionesPage.jsx](../src/pages/PagoComisionesPage.jsx) |
| **Cierre de Caja** | `Configuracion/CierreCajaPage.jsx` |
| **Flujo de Caja** | [FlujoCajaPage.jsx](../src/pages/FlujoCajaPage.jsx) |
| **Cuentas por Pagar** | [CuentasPorPagarPage.jsx](../src/pages/CuentasPorPagarPage.jsx) |

## Reportes

| Panel | Archivo |
|---|---|
| Reporte de Compras | [ReporteComprasPage.jsx](../src/pages/ReporteComprasPage.jsx) |
| Transacciones Diarias | [ReporteTransaccionesDiariasPage.jsx](../src/pages/ReporteTransaccionesDiariasPage.jsx) |
| Entradas y Salidas | [ReporteMovimientosPage.jsx](../src/pages/ReporteMovimientosPage.jsx) |
| Reportes DGII | [ReportesDGIIPage.jsx](../src/pages/ReportesDGIIPage.jsx) |
| Libros Contables | [LibrosContablesPage.jsx](../src/pages/LibrosContablesPage.jsx) |
| Estado de Resultados | [EstadoResultadosPage.jsx](../src/pages/EstadoResultadosPage.jsx) |
| Rentabilidad Diaria | [RentabilidadDiariaPage.jsx](../src/pages/RentabilidadDiariaPage.jsx) |
| Alertas Gerenciales | [AlertasGerencialesPage.jsx](../src/pages/AlertasGerencialesPage.jsx) |
| Recomendador de Precios | [RecomendadorPreciosPage.jsx](../src/pages/RecomendadorPreciosPage.jsx) |

## Configuración

`Configuracion/*` — Perfil empresa, Comprobantes Fiscales, Monitor DGII, Presupuesto Inteligente, Cierre Caja, Usuarios y Permisos, Configuración del Sistema.

## IA y CRM (Enterprise)

| Panel | Archivo | Notas |
|---|---|---|
| **MORLA AI CEO** | [AICeoPage.jsx](../src/pages/AICeoPage.jsx) | Insights diarios/semanal/mensual/trimestral + Marketing IA tab |
| **Sales Hub (WhatsApp CRM)** | [WhatsAppCrmPage.jsx](../src/pages/WhatsAppCrmPage.jsx) | Webhook desplegado, envío bloqueado hasta pago Meta. Ver [memory/project_whatsapp_crm.md](../memory/project_whatsapp_crm.md) |
| Aprobaciones de Compras | [AprobacionesComprasPage.jsx](../src/pages/AprobacionesComprasPage.jsx) | Cola Compra Inteligente |

## GPS (Caminero Motors)

`src/pages/gps/*` — Dashboard, Dispositivos, Mapa, Alertas, Financiamiento, Detalle Dispositivo. Cliente B2B aparte.

## Admin / Super-admin

| Panel | Notas |
|---|---|
| **Admin Dashboard** | `Admin/AdminDashboard.jsx` con `SuperAdminGuard` |
| **Planes y Precios** | [PlanesPage.jsx](../src/pages/PlanesPage.jsx) |

## Relaciones críticas entre módulos

```
Ventas ──────► factura ──┬──► recibos_ingreso (cobros)
   │                     ├──► devoluciones (NC)
   │                     └──► dispara reposición → Orden de Compra
   │
   └──► sugerir_equivalentes_disponibles cuando stock=0
                                       │
                                       ▼
                             Mercancías → producto_grupos

Cotización ──► Pedido ──► Factura ──► Recibo Ingreso
                              │
                              └──► tipos NCF (B01/B02/B03/B04...)

Solicitud Compra ──► Orden Compra ──► Compra (recibida)
                          │
                          ├──► Compra Inteligente (presupuesto, aprobaciones)
                          └──► Reorganizar por suplidor (trigger en productos.suplidor_id)

Orden Compra Automática ──► get_productos_para_orden_automatica_v2
                                          │
                                          └──► ajusta cantidades por grupo equivalente

DGII e-CF ──► emitir-fiscal (edge function) ──► firma XAdES-BES + envío DGII
                          │
                          └──► dgii-callback (webhook respuesta)

WhatsApp CRM ──► whatsapp-crm-webhook ──► sales_hub_leads
                          │
                          └──► motoflow-ai-chat (respuestas IA)

AI CEO ──► motoflow-daily-insights / motoflow-agent / motoflow-compras-advisor
              │
              └──► Recomendaciones que se muestran en HomePage
```

## Máquinas de estado formalizadas (Fase 3.2 + 3.3)

### `ordenes_compra.estado` — CHECK aplicado

```
Pendiente ─► Recibida   (al procesar a Compra: ComprasPage)
Pendiente ─► Anulada    (cancelación manual)
Recibida  ─► Anulada    (solo admin, raro)
```

Transiciones NO permitidas: `Pendiente → Pendiente`, `Anulada → *`, `Recibida → Pendiente`.

### `documentos_fiscales.estado` (interno) — CHECK aplicado

```
procesando ─► emitido         (envío exitoso a DGII, recibe TrackId)
procesando ─► error           (excepción en cualquier paso)
emitido    ─► anulado         (dgii_anular_ecf — Fase 0.7 valida estado_dgii)
error      ─► procesando      (retry)
```

### `documentos_fiscales.estado_dgii` (respuesta DGII) — CHECK aplicado

```
NULL          ─► enviado                (al emitir)
enviado       ─► aceptado | aceptado_condicional | rechazado   (dgii-callback)
aceptado*     ─► [TERMINAL]             (no se modifica más — Fase 0.9 lo blinda)
rechazado     ─► [TERMINAL]
*             ─► anulado                (anular_ecf, respeta terminales — Fase 0.7)
*             ─► enviado_rfce           (batch RFCE nocturno)
```

### `documentos_fiscales.emitido_por` (Fase 3.3)

`uuid REFERENCES auth.users(id) ON DELETE SET NULL` — cumple art. 38 NES DGII (trazabilidad user → e-CF).

Filas previas a Fase 3.3 quedan con `NULL` (sin migración retroactiva). Nuevas emisiones lo guardan automáticamente desde `emitir-fiscal` (excepto cron/service_role).

## Módulos en flujo activo (06/2026)

- **Compra Inteligente v2** (fase A, B, C aplicadas) + Reorganizar por suplidor (recién agregado)
- **Productos Equivalentes** (Fase 1-4 completa)
- **DGII e-CF** (Fase 3d pendiente firma XAdES-BES, Fase 3f pendiente set certificación CerteCF)
- **Marketing IA** (Fase 1 + 2a hechas, falta correr SQL en prod, Fase 2b = YouTube OAuth)
- **WhatsApp CRM** (webhook ok, envío bloqueado por método de pago Meta)
