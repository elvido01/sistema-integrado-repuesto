# Mapa operativo de datos — Repuestos Morla (para Hermes)

> Etapa 1, Día 1 del plan de IA comercial. Verificado contra producción el
> 17/07/2026. Tenant de Repuestos Morla: `00000000-0000-0000-0000-000000000001`.
> Regla de oro para Hermes: **siempre filtrar por ese `tenant_id`** y **nunca
> inventar precios ni existencia** — se responden desde estas tablas.

## Cómo se conecta Hermes

- **psycopg2 directo a Postgres** con el rol restringido `hermes_readonly`:
  lee desde el schema `hermes` (vistas ya filtradas al tenant de Morla).
  El rol es de solo lectura por defecto; para escribir en el CRM debe abrir
  la transacción así: `BEGIN; SET TRANSACTION READ WRITE; ... COMMIT;`
  (solo tiene permiso de escritura en `hermes.crm_seguimiento`).
- Si se conecta con `service_role`/`postgres`, usa las tablas `public.*`
  directo, siempre con `WHERE tenant_id = '00000000-0000-0000-0000-000000000001'`.

## Mapa de datos actual

| Tabla o módulo | Datos disponibles | Uso comercial | Hermes L/E | Observación |
|---|---|---|---|---|
| `productos` (5,262 en Morla) | codigo, descripcion, precio, costo, itbis_pct, ubicacion, min_stock/max_stock, imagen_url, marca/modelo | Responder precios, elegir productos para promos/publicaciones | Lee ✓ / No escribe | La existencia NO está aquí: sale del kardex |
| `inventario_movimientos` (kardex) | producto_id, tipo (ENTRADA/SALIDA), cantidad, costo_unitario, fecha | Existencia real, detectar llegadas, rotación | Lee ✓ / No escribe | Existencia = suma de movimientos; la web usa el RPC `get_productos_paginados` |
| `clientes` (33 en Morla) | nombre, telefono, balance, limite_credito, dias_credito | Historial y crédito de clientes formales | Lee ✓ / No escribe | Solo 33 registrados vs 2,949 facturas: el detal no se registra → ese hueco lo cubre el CRM nuevo |
| `facturas` + `facturas_detalle` (2,949; 628 en los últimos 30 días) | numero, fecha, cliente, total, forma_pago, monto_pendiente; detalle con codigo/cantidad/precio | Reporte comercial diario, qué se vende, medición de resultados | Lee ✓ / No escribe | Fuente de verdad de ventas |
| `cotizaciones` (30) | numero, cliente, total, estado, estado_comercial, fecha_vencimiento | Cotizaciones formales y su seguimiento | Lee ✓ / No escribe | Ya trae `estado_comercial` propio |
| `crm_whatsapp_*` (inbox Meta: 92 conversaciones, 436 mensajes) | contacts (phone, lead_score hot/warm/cold, cliente_id), conversations (status, intent, cotizacion_id), messages | Inbox oficial de WhatsApp en la web (WhatsAppCrmPage) | Lee ✓ / No escribe | Recepción activa; **envío por API bloqueado** hasta poner método de pago en Meta |
| `sales_conversations`/`sales_messages` (espejo WhatsApp Web: 142 chats, 880 mensajes) | chat completo del WhatsApp real, vía extensión Omni | La fuente que Hermes debe LEER para WhatsApp | Lee ✓ / No escribe | Usar las vistas masticadas de abajo, no las tablas crudas |
| `hermes_whatsapp_conversaciones` / `hermes_whatsapp_mensajes` (vistas) | una fila por chat con `sin_responder`, `horas_desde_cliente`, último mensaje; mensajes con quien='yo'/'cliente' | Detectar chats sin responder y leer la conversación | Lee ✓ | **Ya creadas.** Punto de partida del barrido diario |
| `solicitudes_clientes` + vista `hermes_llegadas_pendientes` | cliente, teléfono, producto agotado, estado, available_at | Pedidos de productos agotados + aviso automático cuando llegan (trigger en kardex) | Lee ✓ / Escribe vía RPC `marcar_cliente_avisado(id)` | **Ya creado.** Hoy hay 1 llegada pendiente de avisar |
| `ai_marketing_content` + `social_posts` (+métricas) | copys FB/IG/WhatsApp, guiones, fecha_programada; posts publicados y sus métricas | Publicaciones con datos reales de productos | Lee ✓ / No escribe (lo maneja el módulo Marketing IA) | Módulo montado, casi sin uso (1 contenido, 1 post) |
| `config_empresa` | tipo_negocio=repuestos, feat_crm_whatsapp=true | Saber qué módulos tiene la empresa | Lee ✓ | — |
| `hermes.product_image_status` (vista) | producto activo + precio, stock_actual, has_image, imagen_url, sales_30d, last_sale_at, first_stock_entry_at | Elegir productos promocionables sin foto (pedido diario 10:15) | Lee ✓ | Correr [sql/hermes_product_image_status.sql](../sql/hermes_product_image_status.sql); la imagen es `productos.imagen_url` (bucket `product-images`) |
| **`crm_seguimiento` (NUEVO — hoy)** | ficha comercial: estado, prioridad, proxima_accion, fecha_seguimiento, enlaces a factura/solicitud | El pipeline de ventas y seguimiento diario | **Lee ✓ / Escribe ✓** | Correr [sql/crm_seguimiento.sql](../sql/crm_seguimiento.sql) en prod |

## Datos faltantes

- **Seguimiento comercial** — no existía ninguna tabla de pipeline. Creada hoy (`crm_seguimiento`), falta correr el SQL en prod.
- **Envío de WhatsApp por API** — bloqueado (método de pago en Meta). Mientras tanto los mensajes salen manual/por la extensión; Hermes redacta, la persona envía.
- **Teléfonos del detal** — las ventas de mostrador no registran cliente ni teléfono; el CRM captura eso desde WhatsApp.
- **Vínculo conversación→venta** — no existía; el CRM nuevo lo resuelve con `factura_id`.

## CRM mínimo (tabla `crm_seguimiento`)

Una fila = una oportunidad abierta. Campos: `cliente_nombre`, `telefono`,
`canal_origen` (whatsapp/tienda/telefono/referido/redes/otro),
`producto_consultado`, `codigo_producto`, `producto_id`, `estado`, `prioridad`
(alta/media/baja), `proxima_accion`, `fecha_seguimiento`, `notas`,
`cliente_id`, `contact_id`, `factura_id` (cuando compra), `solicitud_id`
(cuando pide algo agotado), `creado_por` ('hermes'/'web'), `creado_en`,
`actualizado_en`.

Estados: `nuevo` → `interesado` → `precio_enviado` → `pendiente_pago` /
`prometio_pasar` → `comprado` | `perdido`. Aparte: `agotado_solicitado`
(pidió algo sin existencia) y `requiere_aprobacion` (Hermes no decide solo:
descuentos, crédito, casos raros).

Reglas ya puestas en la base:
- Solo **un seguimiento abierto por teléfono** por empresa: si el cliente ya
  tiene ficha abierta, se ACTUALIZA, no se crea otra.
- `actualizado_en` se actualiza solo (trigger).
- Vista **`hermes.crm_hoy`**: lo que toca hoy (abiertos con fecha vencida o
  sin fecha), prioridad alta primero.

## Cómo Hermes debe usarlo (rutina diaria)

1. **Barrido de WhatsApp**: `SELECT * FROM hermes.hermes_whatsapp_conversaciones WHERE sin_responder` →
   por cada chat, leer sus mensajes y crear/actualizar la ficha:
   ```sql
   BEGIN; SET TRANSACTION READ WRITE;
   -- ¿ya tiene ficha abierta?
   SELECT id, estado FROM hermes.crm_seguimiento
    WHERE telefono = '8095551234' AND estado NOT IN ('comprado','perdido');
   -- si no: crear
   INSERT INTO hermes.crm_seguimiento
     (tenant_id, cliente_nombre, telefono, canal_origen, producto_consultado,
      codigo_producto, estado, prioridad, proxima_accion, fecha_seguimiento, notas, creado_por)
   VALUES ('00000000-0000-0000-0000-000000000001', 'Juan Pérez', '8095551234', 'whatsapp',
      'goma 90/90-17', 'GM9017', 'precio_enviado', 'media',
      'preguntar si pasa a buscarla', current_date + 1, 'preguntó precio, se le envió RD$850', 'hermes');
   COMMIT;
   ```
2. **Seguimiento del día**: `SELECT * FROM hermes.crm_hoy;` → redactar el
   mensaje de seguimiento de cada ficha (la persona lo envía por WhatsApp).
3. **Cierres**: si el cliente compró, buscar su factura del día en `facturas`
   (por cliente/teléfono/monto), poner `estado='comprado'` y guardar `factura_id`.
   Si pidió algo agotado, `estado='agotado_solicitado'` y enlazar `solicitud_id`.
4. **Llegadas**: `SELECT * FROM hermes.hermes_llegadas_pendientes;` → redactar
   el aviso "ya llegó tu pieza"; al enviarse, marcar con
   `SELECT marcar_cliente_avisado('<solicitud_id>');`.
5. **Reporte comercial diario** (fin de tarde): ventas del día desde
   `facturas` (cantidad, total, formas de pago), fichas nuevas, fichas
   cerradas (comprado/perdido), seguimientos pendientes para mañana y
   llegadas sin avisar.
6. **Nunca**: prometer precios/existencia sin consultarlos, marcar
   `comprado` sin factura, ni tocar datos de otro tenant.
