# MotoFlow Omni - Solicitudes Agotadas - Arquitectura

Fecha: 2026-07-03

Este documento define la arquitectura propuesta despues de la auditoria de `docs/OMNI_SOLICITUDES_AGOTADAS_ANALISIS.md`.

## Decision Principal

MotoFlow Omni no debe insertar directamente en `solicitudes_clientes`.

La integracion debe consumir una operacion oficial de dominio que tambien pueda usar MotoFlow Web. La operacion recomendada es una RPC de Supabase porque:

- Corre con el JWT del usuario autenticado.
- Respeta `get_user_tenant()` y RLS como defensa adicional.
- Permite crear solicitud y orden de compra dentro de una transaccion.
- Evita copiar la logica de compras dentro del content script.
- Puede ser llamada desde Web, extension, mobile o API.

## Componentes

### MotoFlow Web

El modulo actual conserva su pantalla:

- `src/pages/SolicitudesPage.jsx`
- `src/hooks/useSolicitudes.js`
- `src/services/solicitudesService.js`
- `src/components/solicitudes/SolicitudForm.jsx`
- `src/components/solicitudes/SolicitudesTable.jsx`

El cambio posterior debe ser interno al servicio: `createSolicitud` debe llamar el flujo oficial cuando este aplicado, y mantener fallback controlado solo para Web si la RPC no existe.

### MotoFlow Omni

La extension debe agregar una accion rapida en el panel comercial derecho:

- Boton `Producto agotado`.
- Formulario rapido con cliente/contacto, productos, cantidades y notas.
- Confirmacion antes de guardar.
- Resultado por linea: solicitud creada, orden reutilizada/creada, sin suplidor o error.

Archivos probables:

- `whatsapp-quote-extension/src/App.jsx`
- `whatsapp-quote-extension/src/services/apiClient.js`
- `whatsapp-quote-extension/src/components/out-of-stock/QuickOutOfStockForm.jsx`
- `whatsapp-quote-extension/src/styles.js`

### Base de Datos

El script preparado es:

- `sql/omni_solicitudes_agotadas.sql`

Ese script agrega campos conversacionales a `solicitudes_clientes` y define la RPC:

- `public.omni_crear_solicitudes_agotadas(p_payload jsonb)`

## Flujo Propuesto

1. Omni obtiene conversacion activa.
2. Normaliza telefono si existe.
3. Busca cliente por telefono o seleccion manual.
4. Usuario agrega productos.
5. Omni llama `omni_crear_solicitudes_agotadas`.
6. La RPC valida tenant y payload.
7. Por cada linea:
   - Detecta duplicado activo.
   - Crea o actualiza solicitud.
   - Si tiene `producto_id`, envia a orden de compra pendiente del suplidor.
   - Si no tiene suplidor, registra la solicitud y devuelve advertencia.
   - Si es producto libre, no intenta crear orden.
8. Omni muestra resultado.

## Modelo de Datos Conversacional

Campos propuestos en `solicitudes_clientes`:

- `source_channel`: `whatsapp`, `instagram`, `facebook`, `tiktok`, `motoflow_web`.
- `source_conversation_id`: id interno o externo de conversacion.
- `external_contact_id`: id del contacto en canal social.
- `phone_normalized`: telefono en formato E.164 cuando exista.
- `customer_name_snapshot`: nombre visible al momento de crear.
- `contact_avatar_snapshot`: avatar si aplica.
- `created_from`: `motoflow_web`, `motoflow_omni`, `mobile`, `api`.
- `orden_compra_id`: orden creada o reutilizada.
- `orden_compra_detalle_id`: linea creada o actualizada.
- `purchase_order_added_at`: fecha de envio a compras.
- `purchase_order_error`: error de compra por linea.
- `available_at`: fecha en que MotoFlow detecta disponibilidad.
- `notification_created_at`: fecha de notificacion interna.
- `draft_generated_at`: fecha en que Omni preparo mensaje.
- `customer_notified_at`: fecha de confirmacion de aviso.
- `notified_by`: usuario que marco avisado.

## Estados

Estados actuales:

- `abierta`
- `solicitado`
- `notificada`
- `cerrada`

Uso recomendado sin romper compatibilidad:

- Crear solicitud como `abierta`.
- Si el producto entra al flujo de compras con exito, mantener `abierta` y llenar campos de orden.
- Si se quiere mostrar "solicitado", usar `estado = 'solicitado'` solo si el negocio confirma que ese estado significa enviado a compra.
- Cuando llega existencia, MotoFlow actualiza a `notificada` o genera `notificaciones.stock_disponible`.
- Cuando el vendedor confirma aviso al cliente, guardar `customer_notified_at` y cerrar si aplica.

## Feature Flags

Flags recomendados por tenant:

- `out_of_stock_quick_request_enabled`
- `out_of_stock_purchase_flow_enabled`
- `out_of_stock_notifications_enabled`
- `out_of_stock_whatsapp_message_enabled`
- `out_of_stock_social_channels_enabled`

Hasta que existan persistidas, Omni debe ocultar o mantener el boton como beta controlado por configuracion local.

## Seguridad

La extension solo debe usar:

- JWT del usuario.
- Supabase anon key publica.
- RPCs con validacion de `auth.uid()` y `get_user_tenant()`.

La RPC debe:

- Rechazar usuarios sin tenant activo.
- Filtrar productos, clientes, solicitudes y ordenes por `tenant_id`.
- No aceptar `tenant_id` confiado desde el cliente.
- No usar service role desde la extension.

## Degradacion Segura

Si la RPC no existe o falla:

- Omni no debe hacer insert directo.
- Mostrar fallback para abrir el modulo web de solicitudes.
- Mantener WhatsApp, cotizacion y deuda funcionando.
- No cerrar ni recargar la conversacion.

