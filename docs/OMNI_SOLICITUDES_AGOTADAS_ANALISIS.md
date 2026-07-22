# MotoFlow Omni - Solicitudes Agotadas - Analisis

Fecha: 2026-07-03

Este documento cumple la Fase 0 solicitada para integrar "Solicitud rapida de producto agotado" en MotoFlow Omni. No se realizaron migraciones ni cambios estructurales durante esta auditoria.

## Resumen Ejecutivo

El modulo web existente de "Solicitudes por Producto Agotado" vive en:

- `src/pages/SolicitudesPage.jsx`
- `src/hooks/useSolicitudes.js`
- `src/services/solicitudesService.js`
- `src/components/solicitudes/SolicitudForm.jsx`
- `src/components/solicitudes/SolicitudesTable.jsx`

La extension MotoFlow Omni vive en:

- `whatsapp-quote-extension/public/manifest.json`
- `whatsapp-quote-extension/public/manifest.beta.json`
- `whatsapp-quote-extension/src/content.jsx`
- `whatsapp-quote-extension/src/App.jsx`
- `whatsapp-quote-extension/src/services/apiClient.js`
- `whatsapp-quote-extension/src/utils/whatsappDom.js`
- `whatsapp-quote-extension/src/channels/channelRegistry.js`
- `whatsapp-quote-extension/src/components/omni/OmniInbox.jsx`
- `whatsapp-quote-extension/src/components/omni/ChannelRail.jsx`

Hallazgo critico: el modulo web actual no ejecuta el envio a orden de compra al guardar una solicitud agotada. El guardado actual inserta directamente en `solicitudes_clientes`. El envio a orden de compra existe como servicio reutilizable (`src/services/sendToOrdenCompra.js`), pero se usa desde ventas, buscador de productos y reposicion automatica, no desde el guardado oficial de solicitudes agotadas.

Por tanto, para Omni no basta con llamar el insert actual de `solicitudes_clientes`. Tampoco existe todavia una operacion atomica "crear solicitud agotada + enviar a compras". Antes de implementar Omni debe definirse o extraerse una operacion oficial compartida, preferiblemente RPC o Edge Function, que sea usada por Web y por la extension.

## Arquitectura Actual de MotoFlow Omni

### Manifest

Hay dos manifiestos:

- `manifest.json`: extension estable "Motoflow Cotizador WhatsApp", version `0.1.0`.
- `manifest.beta.json`: "MotoFlow Omni Beta", version `2.0.0.1`, `version_name` `2.0.0-beta.1`.

Ambos son Manifest V3, solo declaran `permissions: ["storage"]`, `host_permissions` para `https://web.whatsapp.com/*` y `https://*.supabase.co/*`, y un `content_script` que carga `content.js` en `https://web.whatsapp.com/*`.

No se encontro background service worker declarado. Esto limita notificaciones Chrome, click handlers globales y coordinacion entre pestanas. Cualquier notificacion Chrome real requerira agregar background/service worker en una fase posterior.

### Content Script

`whatsapp-quote-extension/src/content.jsx` monta React dentro de un Shadow DOM con root `motoflow-whatsapp-quote-root`. Inyecta CSS y ajusta `#app` de WhatsApp cuando el panel esta abierto para dejar espacio lateral.

No inyecta scripts externos en el contexto de la pagina. La extension opera desde content script y DOM.

### Panel y Modos

`whatsapp-quote-extension/src/App.jsx` mantiene un panel derecho con modos:

- `cotizar`
- `cobranza`
- `omni`

El panel derecho ya contiene:

- Datos del chat/conversacion.
- Busqueda de cliente.
- Busqueda de productos.
- Cotizacion.
- Gestion de deuda/cobro.
- Acciones comerciales para conversaciones sociales.
- Modo seguro `Restaurar WhatsApp`.

Para canales sociales, `OmniInbox` selecciona conversaciones de `sales_conversations_view` y mensajes de `sales_messages`. El panel comercial muestra acciones: asociar cliente, crear cliente, cotizar, ver deuda, crear seguimiento, ver historial y marcar atendido.

### Canales

`channelRegistry.js` define:

- `whatsapp`
- `instagram`
- `facebook`
- `tiktok`
- `unified`
- `followups`

WhatsApp siempre esta habilitado. Instagram/Facebook dependen de flags locales de Omni (`getDefaultOmniFlags`), no de feature flags persistidas por tenant.

### Autenticacion y Empresa Activa

La extension usa Supabase Auth directo mediante REST:

- `signInWithPassword`
- `getValidSession`
- `refreshSession`
- `getAuthHeaders`

La sesion se guarda en `localStorage` bajo `motoflow_quote_extension_session`. Esto ya funciona, pero es un riesgo a documentar: el token vive en storage del navegador. No almacena service role ni secretos privados.

La empresa activa se obtiene con RPC:

- `get_empresas_usuario_extension`
- `set_empresa_activa_extension`

El SQL `sql/extension_empresa_activa.sql` redefine `get_user_tenant()` para respetar `usuario_tenant_activo` cuando el usuario tiene acceso por `profiles` o `usuarios_empresas`.

### Deteccion y Apertura de Conversaciones WhatsApp

`whatsappDom.js` implementa:

- `getCurrentChat()`: lee header de WhatsApp, `title` o `span[dir="auto"]`.
- `openWhatsAppChatInPlace(phone, text)`: navega a `/send?phone=...`.
- `openWhatsAppChatViaInternalLink(phone, text)`: simula link interno.
- `pasteTextIntoWhatsApp(text)`: pega texto en el composer.
- `getWhatsAppDraftText()`.
- `attachFileToWhatsApp(file)`.

La normalizacion actual de telefono en `App.jsx` solo remueve no digitos y antepone `1` si tiene 10 digitos. Devuelve `1809...`, no `+1809...`. No hay normalizador central compartido para Web y Omni.

### Instagram/Facebook

`OmniInbox.jsx` carga conversaciones no WhatsApp desde `sales_conversations_view`, filtra por `platform`, muestra mensajes de `sales_messages` y permite guardar respuestas como `sales_messages.status = "queued"`. No hay envio oficial real desde la extension para IG/FB; se registra la respuesta para procesamiento posterior.

No hay helper de navegacion para abrir una conversacion social desde una notificacion externa fuera del estado local de `OmniInbox`.

## Arquitectura Actual del Modulo Web

### Entrada Principal

`SolicitudesPage.jsx` renderiza:

- Cabecera "SOLICITUDES POR PRODUCTO AGOTADO".
- Filtro de estados.
- Tabla de solicitudes.
- Modal `SolicitudForm`.

Usa `useSolicitudes()` como hook de dominio ligero.

### Hook

`useSolicitudes.js` envuelve:

- `fetchSolicitudes`
- `createSolicitud`
- `updateSolicitud`
- `cerrarSolicitud`
- `marcarSolicitado`
- `eliminarSolicitud`
- `enviarSolicitudAPedido`

Cada operacion muestra toast y refresca lista.

### Servicio

`solicitudesService.js` accede directamente a Supabase:

- Tabla principal: `solicitudes_clientes`.
- No usa RPC para crear solicitud.
- No usa Edge Function.
- No llama `sendProductToOrdenCompra` al guardar.

Operaciones:

- `fetchSolicitudes(filtroEstado)`: lista con joins a `clientes(nombre, telefono)` y `productos(codigo, descripcion)`.
- `createSolicitud(payload)`: insert directo.
- `updateSolicitud(id, payload)`: update directo.
- `cerrarSolicitud(id)`: estado `cerrada`.
- `marcarSolicitado(id)`: estado `solicitado`.
- `eliminarSolicitud(id)`: delete directo.
- `enviarSolicitudAPedido(solicitud, userId)`: crea un pedido/facturacion via RPC `crear_o_actualizar_pedido`, no una orden de compra.

### Formulario

`SolicitudForm.jsx` soporta:

- Cliente registrado mediante `clientes`.
- Contacto manual con `cliente_nombre` y `cliente_telefono`.
- Multiples lineas visuales.
- Producto por `ProductSearchModal`.
- Producto libre (`producto_texto`).
- Cantidad.
- Notas.

Importante: aunque el formulario permite multiples lineas, guarda una fila por producto en `solicitudes_clientes`. No existe una tabla de detalle separada en el flujo actual.

### Tabla

`SolicitudesTable.jsx` maneja estados:

- `abierta`
- `notificada`
- `solicitado`
- `cerrada`

Acciones:

- En estado `abierta`: boton de carrito llama `onMarcarSolicitado`, que solo cambia estado a `solicitado`.
- En estado `notificada`: boton enviar llama `onEnviarPedido`, que crea un pedido para facturacion.
- En no cerrada: boton cerrar.
- Eliminar.

## Tablas y Campos Observados

### `solicitudes_clientes`

Campos usados por el frontend:

- `id`
- `tenant_id`
- `cliente_id`
- `cliente_nombre`
- `cliente_telefono`
- `producto_id`
- `producto_texto`
- `cantidad_solicitada`
- `estado`
- `notas`
- `creado_por`
- `created_at`

Relaciones usadas:

- `clientes(nombre, telefono)`
- `productos(codigo, descripcion)`

RLS/multitenant:

- `sql/migration_tenant_isolation_part2.sql` agrega `tenant_id`, `NOT NULL` y default `public.get_user_tenant()`.
- En ese mismo script se habilita RLS para multiples tablas incluyendo `solicitudes_clientes`.

Datos no observados en la tabla actual:

- `source_channel`
- `external_conversation_id`
- `external_contact_id`
- `contact_avatar_snapshot`
- `phone_normalized`
- `purchase_order_id`
- `purchase_order_detail_id`
- `available_at`
- `customer_notified_at`
- `notified_by`
- auditoria especifica por evento

Estos campos serian necesarios o convenientes para cumplir el flujo completo de Omni.

### `notificaciones`

Usada por campanita web:

- `tipo`
- `titulo`
- `mensaje`
- `user_id`
- `solicitud_id`
- `producto_id`
- `tenant_id`
- `visto_at`
- `created_at`

`NotificationBell.jsx` abre el panel `solicitudes` si `tipo` es `resumen_diario` o `stock_disponible`.

### Ordenes de Compra

Tablas usadas por `sendToOrdenCompra.js`:

- `ordenes_compra`
- `ordenes_compra_detalle`
- `productos`
- `proveedores`

Campos clave:

- `ordenes_compra.estado = "Pendiente"`
- `ordenes_compra.suplidor_id`
- `ordenes_compra.numero`
- `ordenes_compra.fecha_orden`
- `ordenes_compra_detalle.producto_id`
- `ordenes_compra_detalle.cantidad`
- campos de recepcion: `cantidad_pedida`, `cantidad_recibida`, `cantidad_pendiente`, `estado_linea`

## Flujo Web Actual de Solicitudes

1. Usuario abre `SolicitudesPage`.
2. Pulsa nueva solicitud.
3. Selecciona cliente registrado o escribe contacto manual.
4. Agrega uno o varios productos.
5. Cada producto puede ser inventario (`producto_id`) o libre (`producto_texto`).
6. Al guardar, `SolicitudForm` llama `onSave(payload)` por cada linea.
7. `useSolicitudes.crear` llama `createSolicitud`.
8. `createSolicitud` hace insert directo en `solicitudes_clientes`.
9. Estado queda por default de base de datos o por payload si se agregara. El frontend no setea explicitamente `estado` al crear.
10. La solicitud aparece en la tabla.

No se encontro en este flujo una llamada a orden de compra ni a una funcion de dominio atomica.

## Flujo Actual hacia Orden de Compra

La logica tecnica existe en `src/services/sendToOrdenCompra.js`.

### Acciones que la provocan

Se encontro llamada desde:

- `src/components/ventas/ProductSearchModal.jsx`: boton/contexto para enviar producto a orden.
- `src/components/products/ProductTable.jsx`: accion desde tabla de productos.
- `src/components/ventas/VentasTable.jsx`: accion desde ventas.
- `src/hooks/useVentas.js`: reposicion automatica cuando una venta deja producto en minimo/cero.

No se encontro llamada desde:

- `SolicitudForm.jsx`
- `useSolicitudes.js`
- `solicitudesService.js`
- `SolicitudesTable.jsx` salvo "marcar solicitado", que no llama el servicio.

### Como determina suplidor

`sendProductToOrdenCompra(product, options)`:

1. Carga `productos` por `product.id`.
2. Lee `suplidor_id`, `costo`, `itbis_pct`, `activo`.
3. Si `activo === false`, omite.
4. Si no hay `suplidor_id`, retorna error.
5. Usa `suplidor_id` como suplidor correcto.

No usa en este servicio:

- ultimo suplidor historico.
- suplidores equivalentes.
- suplidores locales.
- Compra Inteligente.
- ranking de proveedor.

### Como localiza orden pendiente

Busca `ordenes_compra` con:

- `suplidor_id = producto.suplidor_id`
- `estado = "Pendiente"`
- orden por `fecha_orden desc`
- `limit 1`

Si existe, reutiliza esa orden. Si no existe, crea una nueva orden con vencimiento a 15 dias.

### Como evita duplicados

En orden existente:

1. Busca detalles con mismo `orden_compra_id` y `producto_id`.
2. Si existe, suma cantidades de detalles existentes.
3. Actualiza el primer detalle.
4. Borra detalles duplicados restantes.
5. Recalcula totales.

Si no existe detalle, inserta una linea nueva.

### Cantidad

Usa:

```js
Math.max(1, Math.ceil(Number(options.quantity || product.cantidad_sugerida || 1)))
```

Para solicitudes agotadas deberia pasarse `cantidad_solicitada`.

### Tenant y RLS

El servicio no setea `tenant_id` explicitamente. Depende de:

- RLS.
- defaults en DB.
- `get_user_tenant()`.

Desde extension esto depende de que el usuario tenga empresa activa correcta con `usuario_tenant_activo`.

### Relacion solicitud-orden

No existe relacion actual entre `solicitudes_clientes` y `ordenes_compra` o `ordenes_compra_detalle`.

### Auditoria

No hay auditoria especifica para "solicitud enviada a compra" en el flujo actual. Hay `crm_whatsapp_conversation_events` para eventos de extension, pero no esta conectado al modulo de solicitudes.

## Compra Inteligente, Reposicion y Equivalentes

### Reposicion Automatica

`useVentas.js` ejecuta `enviarReposicionAutomatica` despues de ventas:

- Calcula productos vendidos.
- Consulta `get_stock_actual`.
- Si existencia final queda bajo `min_stock` o cero, calcula cantidad objetivo.
- Llama `sendProductToOrdenCompra(producto, { quantity: cantidadSugerida })`.

Esto comparte el mismo servicio de ordenes, pero no esta ligado a solicitudes agotadas.

### Compra Inteligente

Se auditaron referencias a `comprasInteligentesService.js` y SQL de compra inteligente, pero no hay integracion directa con `solicitudes_clientes`.

### Equivalentes

Existe `producto_grupos_equivalentes.sql` y `sugerir_equivalentes_disponibles` para ventas. No se encontro uso directo de equivalentes en solicitudes agotadas ni en `sendProductToOrdenCompra`.

### Reorganizacion por Suplidor

`sql/reorganizar_ordenes_por_suplidor.sql` implementa RPCs y trigger para mover lineas de ordenes pendientes cuando cambia `productos.suplidor_id`.

Esto interactua con las ordenes creadas por `sendProductToOrdenCompra`, pero no relaciona solicitudes con ordenes.

## Flujo Actual de Disponibilidad

Hay dos mecanismos relacionados.

### Desde ComprasPage

Al guardar una compra, `ComprasPage.jsx`:

1. Consulta `solicitudes_clientes` con estado `abierta` o `solicitado`.
2. Compara contra los detalles de la compra.
3. Coincide por `producto_id`.
4. Para texto libre o producto especial codigo `01`, hace comparacion textual segura contra descripcion/codigo/notas.
5. Si hay match, actualiza solicitudes a `estado = "notificada"`.
6. Muestra toast local "Articulos Agotados Recibidos".

Este flujo no crea registros en `notificaciones`. Solo actualiza estado y muestra toast al usuario que guarda la compra.

### Trigger SQL de stock

`sql/fix_notificaciones_y_numeracion_tenant.sql` define `fn_stock_trigger()`:

- Se ejecuta para `NEW.tipo = 'ENTRADA'`.
- Busca tenant del producto.
- Busca solicitudes `estado = 'abierta'` del mismo producto y tenant.
- Inserta `notificaciones` tipo `stock_disponible` para usuarios del tenant.

Limitaciones observadas:

- Solo considera solicitudes `abierta`, no `solicitado`.
- Solo coincide por `producto_id`, no por `producto_texto`.
- No actualiza `estado` de la solicitud.
- No se confirmo en esta auditoria donde se crea el trigger sobre `inventario_movimientos`; el script define la funcion, pero el `CREATE TRIGGER` no aparecio en el fragmento auditado.

## Flujo Actual de Notificaciones

### Web

`notificationsService.js`:

- `fetchUnreadCount(userId)`.
- `fetchRecent(userId, limit)`.
- `markAsRead(ids)`.
- `subscribeRealtime(userId, onInsert)` a `notificaciones` filtrado por `user_id`.

`NotificationBell.jsx`:

- Muestra contador.
- Hace double click en `stock_disponible` o `resumen_diario` para abrir panel `solicitudes`.

### Omni

No se encontro una suscripcion a `notificaciones` dentro de la extension. Omni tiene Realtime/logica para Sales Hub en la app web, pero la extension actualmente consulta por REST y no tiene background worker. Para cumplir la alerta de producto disponible en Omni habria que agregar:

- Suscripcion Realtime a `notificaciones` en content script o background.
- Recuperacion inicial de pendientes.
- Dedupe local.
- Eventualmente background service worker para notificacion Chrome y click handler.

## Seguridad y Multiempresa

### Web

La app web usa `SupabaseAuthContext` para cargar:

- `profiles`.
- `tenant_id`.
- `user_module_permissions`.
- `config_empresa`.

`PanelContext` envuelve `SolicitudesPage` con `RouteGuard module="solicitudes"`.

### Extension

La extension usa JWT del usuario y RPC de empresa activa. Las lecturas/escrituras por REST dependen de RLS y `get_user_tenant()`.

Riesgo: cualquier endpoint nuevo para Omni debe validar:

- `auth.uid()`.
- `tenant_id`.
- empresa activa.
- permisos de modulo `solicitudes`.
- permisos sobre `ordenes_compra`.
- acceso al cliente/producto.

No se debe usar service role en la extension.

## Brechas Contra el Documento Solicitado

1. No existe operacion oficial atomica para crear solicitud y enviar a orden de compra.
2. El modulo web actual no envia a orden al guardar.
3. El boton "marcar solicitado" no envia a compra; solo cambia estado.
4. `enviarSolicitudAPedido` crea pedido para facturacion, no orden de compra.
5. No existe tabla detalle para multiples productos; se crea una fila por producto.
6. No hay campos de canal/origen/conversacion en `solicitudes_clientes`.
7. No hay `phone_normalized`.
8. No hay relacion solicitud-orden.
9. No hay auditoria especifica para el flujo.
10. No hay notificaciones de disponibilidad en la extension.
11. No hay background service worker para notificaciones Chrome.
12. No hay feature flags persistidas para esta funcion.

## Codigo Reutilizable

Reutilizable directamente o con envoltorio:

- `searchProducts` de la extension para buscar productos con `get_productos_paginados`.
- `searchCustomers` de la extension para buscar cliente.
- `getCurrentChat`, `openWhatsAppChatInPlace`, `pasteTextIntoWhatsApp`.
- `getEmpresasUsuarioExtension` y `setEmpresaActivaExtension`.
- `sendProductToOrdenCompra`, pero deberia moverse a una operacion backend o servicio compartido seguro antes de exponerlo a Omni.
- `notificationsService` como patron para Realtime.
- `NotificationBell` como patron de UI web.

## Codigo que Conviene Extraer o Rehacer como Servicio Oficial

### Prioridad Alta

Crear una operacion de dominio compartida:

```ts
createOutOfStockRequestAndPurchaseFlow(payload)
```

Idealmente como RPC o Edge Function, no como logica copiada al content script.

Responsabilidades:

- Validar auth y tenant.
- Validar permiso modulo `solicitudes`.
- Crear solicitud en `solicitudes_clientes`.
- Detectar duplicados activos.
- Enviar cada producto inventariado a `sendProductToOrdenCompra` o su equivalente SQL.
- Retornar resultado por linea: solicitud, suplidor, orden, detalle, error.
- No enviar productos libres a orden automaticamente.
- Registrar auditoria.

### Prioridad Media

Extraer normalizador de telefono compartido:

- Entrada: `8093905965`, `809-390-5965`, `(809) 390-5965`, `+1 809 390 5965`, `18093905965`.
- Salida preferida: `+18093905965`.
- Variante para WhatsApp URL: `18093905965`.

## Datos Faltantes

1. DDL original completo de `solicitudes_clientes`.
2. Politicas RLS actuales exactas de `solicitudes_clientes`.
3. Confirmacion de si `fn_stock_trigger` esta actualmente instalado como trigger.
4. Confirmacion de defaults de `estado` en `solicitudes_clientes`.
5. Confirmacion de permisos exactos por modulo para usuarios de extension.
6. Decision de producto libre: si debe crear nota a Suplidor Virtual o solo solicitud.
7. Decision de varios suplidores/equivalentes: hoy `sendProductToOrdenCompra` solo usa `productos.suplidor_id`.
8. Decision de origen conversacional: migrar columnas en `solicitudes_clientes` o usar tabla auxiliar.

## Riesgos

- Duplicar logica de compras dentro de la extension romperia la regla central del documento.
- Insertar directo desde Omni en `solicitudes_clientes` no garantiza orden de compra.
- Usar `sendProductToOrdenCompra` desde content script replicaria logica frontend y no seria atomico con la solicitud.
- Si la compra se guarda y solo se actualiza estado a `notificada`, Omni no tendra forma de abrir conversacion original sin campos de origen.
- Sin `phone_normalized`, la asociacion por telefono sera fragil.
- Sin background worker no hay notificacion Chrome clickeable robusta.
- Estados `abierta`, `solicitado`, `notificada`, `cerrada` no cubren todo el ciclo solicitado.
- La disponibilidad actual tiene dos caminos con comportamientos distintos: `ComprasPage` actualiza estado, SQL inserta notificaciones.

## Archivos que Serian Modificados

Fase 1/2 probable:

- `src/services/solicitudesService.js`
- `src/hooks/useSolicitudes.js`
- `src/components/solicitudes/SolicitudForm.jsx`
- `src/components/solicitudes/SolicitudesTable.jsx`
- `whatsapp-quote-extension/src/App.jsx`
- `whatsapp-quote-extension/src/services/apiClient.js`
- `whatsapp-quote-extension/src/styles.js`

Fases posteriores:

- `whatsapp-quote-extension/public/manifest.beta.json`
- `whatsapp-quote-extension/src/background.js` o equivalente nuevo
- `whatsapp-quote-extension/vite.config.js`
- `src/services/notificationsService.js`
- `src/components/layout/NotificationBell.jsx`
- `src/pages/ComprasPage.jsx`

## Archivos Nuevos Probables

- `whatsapp-quote-extension/src/components/out-of-stock/QuickOutOfStockForm.jsx`
- `whatsapp-quote-extension/src/components/out-of-stock/ProductArrivalMessagePreview.jsx`
- `whatsapp-quote-extension/src/services/outOfStockRequestsApi.js`
- `src/services/outOfStockRequestsService.js`
- `src/lib/phoneNormalizer.js`
- `sql/omni_solicitudes_agotadas.sql`

## Migraciones Necesarias, No Ejecutadas

Pendientes a confirmar:

- Agregar campos de origen a `solicitudes_clientes`:
  - `source_channel`
  - `source_conversation_id`
  - `external_contact_id`
  - `phone_normalized`
  - `customer_name_snapshot`
  - `contact_avatar_snapshot`
  - `created_from`
- Agregar relacion con compra:
  - `orden_compra_id`
  - `orden_compra_detalle_id`
  - `purchase_order_added_at`
  - `purchase_order_error`
- Agregar ciclo de notificacion:
  - `available_at`
  - `notification_created_at`
  - `draft_generated_at`
  - `customer_notified_at`
  - `notified_by`
- Crear auditoria si no se reutiliza una tabla existente.

Estas migraciones no deben aplicarse hasta validar el modelo final.

## Plan de Implementacion por Fases

### Fase 0 - Auditoria

Estado: completada en este documento.

### Fase 1 - Servicio oficial compartido

Antes de UI Omni, crear o extraer una operacion oficial que Web pueda usar tambien. Debe reemplazar el insert directo actual o convivir detras de `createSolicitud`.

### Fase 2 - Ordenes de compra

Integrar esa operacion con la logica actual de `sendProductToOrdenCompra` o mover esa logica a RPC/Edge Function. Debe retornar orden y suplidor por producto.

### Fase 3 - Contexto conversacional

Agregar columnas o tabla auxiliar para guardar canal, telefono normalizado y conversacion original.

### Fase 4 - UI rapida en Omni

Agregar boton "Producto agotado" en panel comercial derecho:

- Deshabilitado sin conversacion.
- Habilitado con chat WhatsApp o conversacion social.
- Modal/formulario rapido.
- Confirmacion antes de guardar.

### Fase 5 - Disponibilidad y notificaciones

Unificar o documentar mecanismo ganador:

- `ComprasPage` actualiza `estado = notificada`.
- `fn_stock_trigger` inserta `notificaciones`.

Omni debe consumir ese resultado, no inventar polling.

### Fase 6 - Abrir conversacion y preparar mensaje

WhatsApp:

- `openWhatsAppChatInPlace(phone)`
- `pasteTextIntoWhatsApp(draft)`
- Confirmacion manual para marcar avisado.

Instagram/Facebook:

- Seleccionar conversacion en `OmniInbox`.
- Preparar respuesta `queued` editable.

### Fase 7 - Auditoria y seguimiento

Registrar eventos:

- solicitud creada desde Omni.
- producto agregado a compra.
- notificacion recibida.
- mensaje generado.
- cliente avisado.

## Plan de Rollback

1. Feature flag desactiva boton "Producto agotado" en Omni.
2. Mantener modulo web existente operativo.
3. Si falla el servicio compartido, volver a `createSolicitud` actual solo en Web.
4. No borrar columnas nuevas si se agregan; dejarlas sin uso.
5. Desactivar suscripcion Realtime/Chrome desde flag.
6. Mantener `sendProductToOrdenCompra` actual para ventas y productos.

## Decision Tecnica Recomendada

No implementar aun el formulario Omni contra insert directo.

Primero corregir/elevar el flujo oficial del modulo web para que exista una unica operacion de dominio:

1. Crear solicitud.
2. Detectar duplicados.
3. Enviar productos inventariados a orden de compra.
4. Registrar resultado.
5. Retornar datos de orden.

Luego Omni debe consumir esa misma operacion.

Esto cumple la regla principal del documento: la solicitud creada desde MotoFlow Omni debe producir el mismo resultado que una solicitud creada desde el modulo web, sin tabla paralela ni logica duplicada.
