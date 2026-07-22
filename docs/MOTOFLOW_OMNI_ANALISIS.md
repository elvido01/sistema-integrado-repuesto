# MotoFlow Omni - Analisis Tecnico Inicial

Fecha: 2026-07-02  
Fase: 0 - Auditoria previa a implementacion  
Rama actual inspeccionada: `feat/mercancias-filtros`

> Nota operativa: el repositorio tiene muchos cambios locales y archivos sin trackear. No se cambio de rama automaticamente para evitar mover trabajo pendiente. Antes de implementar Omni Beta conviene crear o cambiar a `feature/motoflow-omni-beta` con el arbol de trabajo controlado.

## 1. Resumen Ejecutivo

La extension actual no debe rehacerse. Es una base valida para evolucionar a MotoFlow Omni porque ya:

- Corre dentro de `https://web.whatsapp.com`.
- Monta UI propia sin reemplazar WhatsApp Web.
- Usa Shadow DOM para aislar estilos.
- Autentica contra Supabase Auth.
- Busca productos y clientes.
- Crea cotizaciones.
- Pega mensajes en el chat nativo de WhatsApp.
- Consulta deuda y Gestion de Cobro.
- Registra eventos comerciales en Supabase.

La arquitectura actual, sin embargo, todavia no es omnicanal. La extension es un unico content script React/Vite. No tiene background service worker, popup, side panel, adaptadores de canales, Chrome notifications, Realtime propio ni bandejas Instagram/Facebook dentro de la extension.

El repositorio si contiene una base importante para Omni:

- `sales_*` en `sql/sales_hub_beta.sql`.
- Webhooks Meta para Instagram/Facebook en `supabase/functions/meta-messages-webhook`.
- Tablas y logs de Meta en `sql/meta_webhook_events.sql`.
- Una interfaz Sales Hub dentro de MotoFlow en `src/pages/WhatsAppCrmPage.jsx`.
- Contexto de notificaciones Realtime en `src/contexts/WhatsAppNotificationContext.jsx`.

La recomendacion es evolucionar en capas: primero preparar beta y adaptadores, despues contadores/notificaciones sociales, luego bandejas Instagram/Facebook, y por ultimo integrar cotizaciones/deuda/gestion comercial.

## 2. Arquitectura Actual de la Extension

Directorio principal:

- `whatsapp-quote-extension/`

Archivos clave:

- `public/manifest.json`
- `src/content.jsx`
- `src/App.jsx`
- `src/styles.js`
- `src/services/apiClient.js`
- `src/utils/whatsappDom.js`
- `src/utils/fichaPdf.js`
- `vite.config.js`
- `package-extension.ps1`

### Manifest actual

Archivo: `whatsapp-quote-extension/public/manifest.json`

- `manifest_version`: 3
- `name`: `Motoflow Cotizador WhatsApp`
- `version`: `0.1.0`
- `permissions`: `storage`
- `host_permissions`:
  - `https://web.whatsapp.com/*`
  - `https://*.supabase.co/*`
- `content_scripts`:
  - match: `https://web.whatsapp.com/*`
  - js: `content.js`
  - run_at: `document_idle`

No existen actualmente:

- `background.service_worker`
- `action/default_popup`
- `side_panel`
- `commands`
- `notifications`
- `alarms`
- `tabs`
- `scripting`
- `web_accessible_resources`

### Build actual

Archivo: `whatsapp-quote-extension/vite.config.js`

- Vite + React.
- Entrada unica: `src/content.jsx`.
- Salida fija: `dist/content.js`.
- `inlineDynamicImports: true`.
- Variables inyectadas desde el root:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_API_BASE_URL`
  - `VITE_MOTOFLOW_APP_URL`

Riesgo: no hay separacion clara entre desarrollo, beta y produccion. Para Omni Beta se deben agregar env files/flows separados antes de tocar canales sociales.

## 3. Insercion Dentro de WhatsApp Web

Archivo: `whatsapp-quote-extension/src/content.jsx`

La extension:

- Espera `DOMContentLoaded`.
- Crea un nodo host en `document.body` con id `motoflow-whatsapp-quote-root`.
- Adjunta Shadow DOM.
- Inyecta los estilos de `styles.js`.
- Renderiza `<App />` dentro del Shadow DOM.
- Agrega un estilo global que, cuando el panel esta abierto, reduce el ancho de `#app`:
  - `html.mf-panel-open #app { width: calc(100% - 410px) !important; }`

Esto conserva WhatsApp Web nativo, pero hay un riesgo: `#app` es un selector externo de WhatsApp Web. Es razonablemente estable, pero debe centralizarse en un futuro `src/channels/whatsapp/whatsappSelectors.ts` y tener fallback.

## 4. Deteccion del Chat Actual y Operaciones WhatsApp DOM

Archivo: `whatsapp-quote-extension/src/utils/whatsappDom.js`

Funciones actuales:

- `getCurrentChat()`
  - Usa `document.querySelector('header')`.
  - Intenta leer `[title]` o `span[dir="auto"]`.
  - Usa `window.location.pathname/hash` como fallback.
- `pasteTextIntoWhatsApp(text)`
  - Busca `[contenteditable="true"]`.
  - Prefiere `data-tab="10"` o `role="textbox"`.
  - Dispara evento `paste`.
  - Fallback: `document.execCommand('insertText')`.
  - Fallback final: asigna `textContent` y dispara `InputEvent`.
- `attachFileToWhatsApp(file)`
  - Busca `input[type="file"]`.
  - Prefiere input de documentos.
  - Inyecta `DataTransfer`.

Riesgos especificos del DOM de WhatsApp:

- `header` puede no ser el header de conversacion en todos los estados.
- `data-tab="10"` puede cambiar.
- `contenteditable=true` puede existir en varias zonas.
- `input[type=file]` no identifica de forma segura documentos vs imagenes.
- El ajuste global de ancho de `#app` puede romperse si WhatsApp cambia estructura.

Recomendacion:

- Crear un adaptador `whatsappDomAdapter`.
- Centralizar selectores.
- Mantener Shadow DOM.
- Agregar boton de emergencia para desmontar la capa Omni.
- No tocar ni reordenar nodos nativos de WhatsApp.

## 5. Funciones Existentes que Deben Conservarse

En `whatsapp-quote-extension/src/App.jsx` y `apiClient.js` ya existen:

- Login con Supabase Auth.
- Refresh manual del access token con refresh token.
- Multiempresa por `get_empresas_usuario_extension` y `set_empresa_activa_extension`.
- Deteccion de chat actual.
- Borradores por chat con `localStorage`.
- Historial de cotizaciones por chat.
- Busqueda de productos mediante `get_productos_paginados`.
- Busqueda avanzada por marca/modelo/include zero stock.
- Seleccion de productos.
- Calculo de subtotal, ITBIS y total.
- Creacion de cotizacion en `cotizaciones` y `cotizaciones_detalle`.
- Pegado de cotizacion en WhatsApp Web.
- Busqueda de clientes.
- Vendedores.
- Consulta de deuda.
- Lista de cobranza.
- Gestion de Cobro financiera.
- Registro de gestiones en `cobro_gestiones`.
- Envio de ficha PDF al buscador.
- Eventos comerciales en `crm_whatsapp_conversation_events`.

Estas funciones no deben moverse en una sola refactorizacion. Primero deben cubrirse con pruebas/regresion manual y extraerse por modulo de forma gradual.

## 6. Servicios y RPC Usados por la Extension

Archivo principal: `whatsapp-quote-extension/src/services/apiClient.js`

RPC/REST actuales:

- Auth:
  - `/auth/v1/token?grant_type=password`
  - `/auth/v1/token?grant_type=refresh_token`
  - `/auth/v1/user`
- Empresas:
  - `get_empresas_usuario_extension`
  - `set_empresa_activa_extension`
  - fallback a `profiles` y `config_empresa`
- Productos:
  - `get_productos_paginados`
- Clientes:
  - REST `clientes`
  - `set_cliente_telefono`
  - `get_cliente_ficha`
- Vendedores:
  - REST `vendedores`
- Deuda/cobranza:
  - `get_estado_cuenta_cliente`
  - `get_gestion_cobro_extension`
  - `get_clientes_morosos_financiera`
  - fallback directo a `prestamos`, `prestamo_cuotas`, `cobranza_seguimiento`, `prestamo_pagos`
  - `get_clientes_morosos`
  - `marcar_envio_cobranza`
  - `set_cobranza_seguimiento`
  - REST `cobro_gestiones`
  - `castigar_prestamo`
- Cotizaciones:
  - `get_next_cotizacion_numero`
  - REST `cotizaciones`
  - REST `cotizaciones_detalle`
- Eventos:
  - REST `crm_whatsapp_conversation_events`

## 7. Sales Hub Existente

Archivo: `sql/sales_hub_beta.sql`

Tablas existentes:

- `sales_channels`
- `sales_conversations`
- `sales_messages`
- `sales_leads`
- `sales_notifications`
- `sales_ai_training_logs`

Vista:

- `sales_conversations_view`

Funciones/triggers:

- `sales_detect_basic_intent(_text)`
- `sales_touch_conversation()`
- `sales_sync_whatsapp_message(_message_id)`
- trigger `trg_sales_sync_whatsapp_message` sobre `crm_whatsapp_messages`

Canales soportados por CHECK actualmente:

- `whatsapp`
- `instagram`
- `facebook`
- `youtube`

Falta `tiktok`. Para Omni debe agregarse por migracion controlada o mapear TikTok como feature flag inactivo hasta ampliar el CHECK.

Riesgo importante:

- `sales_channels` contiene `access_token` y `refresh_token`. La instruccion objetivo dice que la extension no debe guardar tokens, pero tambien conviene revisar si la base deberia mover tokens sensibles a una tabla tipo `social_account_secrets` con acceso solo `service_role`. Ya existe `social_account_secrets` usada por Meta, por lo que la duplicacion en `sales_channels` es deuda tecnica.

## 8. WhatsApp CRM Existente

Archivos:

- `sql/whatsapp_crm_mvp.sql`
- `sql/whatsapp_crm_flujo_comercial.sql`
- `src/pages/WhatsAppCrmPage.jsx`
- `supabase/functions/whatsapp-crm-webhook/index.ts`

Componentes/tablas relevantes:

- `crm_whatsapp_settings`
- `crm_whatsapp_contacts`
- `crm_whatsapp_conversations`
- `crm_whatsapp_messages`
- `crm_whatsapp_quote_items`
- `crm_whatsapp_conversations_view`
- `crm_whatsapp_conversation_events`

`WhatsAppCrmPage.jsx` ya implementa una bandeja administrativa con:

- Tabs: todos, WhatsApp, no leidos, Instagram, Facebook, seguimientos, cotizaciones.
- Lectura de `crm_whatsapp_conversations_view`.
- Lectura de `sales_conversations_view`.
- Lectura de `sales_messages`.
- Realtime por `sales_messages`.
- Envio WhatsApp por servicio local `whatsapp-web-service`.
- Para canales sociales, inserta mensajes `sales_messages` como nota/salida interna con `raw_data.source = sales_hub_internal_note`; todavia indica que falta envio oficial del canal.

Esto confirma que Sales Hub es el cerebro administrativo y que la extension Omni puede consumir `sales_*` para Instagram/Facebook sin crear tablas paralelas.

## 9. Meta / Instagram / Facebook Existente

Archivos:

- `supabase/functions/meta-messages-webhook/index.ts`
- `supabase/functions/sales-hub-webhook/index.ts`
- `supabase/functions/meta-subscribe-pages/index.ts`
- `supabase/functions/meta-add-ig-tester/index.ts`
- `sql/meta_webhook_events.sql`

`meta-messages-webhook`:

- Verifica handshake con `META_VERIFY_TOKEN` o `SALES_HUB_VERIFY_TOKEN`.
- Guarda eventos crudos en `meta_webhook_events`.
- Resuelve cuenta por `sales_channels` o `social_accounts`.
- Crea/upsert `sales_conversations`.
- Crea/upsert `sales_messages`.
- Inserta `sales_leads`.
- Inserta `sales_notifications`.
- Inserta `sales_ai_training_logs`.
- Puede auto-responder si hay token y `auto_reply`.

`meta_webhook_events`:

- Log de eventos Meta por `tenant_id`, `platform`, `entry_id`, `message_id`, `status`.
- RLS: authenticated puede leer solo su tenant o superadmin; service_role tiene acceso completo.

`meta-subscribe-pages`:

- Suscribe paginas/cuentas a Graph API.
- Usa `social_accounts` y `social_account_secrets`.
- Tiene constantes hardcodeadas (`TENANT_ID`, `FB_PAGE_ID`, `IG_BIZ_ID`), por lo que no esta listo para SaaS multiempresa general. Debe convertirse a flujo administrativo parametrizado/seguro.

## 10. Social Accounts / Marketing

Archivos relacionados:

- `sql/ai_marketing_fase1.sql`
- `sql/ai_marketing_fase2a.sql`
- `src/components/ai-marketing/SocialAccountsConnector.jsx`
- `src/services/aiMarketingService.js`
- Edge Functions `meta-*`

Hallazgo:

- Existe una capa de cuentas sociales (`social_accounts`, `social_account_secrets`) usada por los webhooks de Meta.
- Esta capa debe ser la fuente de verdad para tokens de Meta.
- La extension no debe acceder a `social_account_secrets`.

## 11. Notificaciones Existentes

Archivo: `src/contexts/WhatsAppNotificationContext.jsx`

Ya existe:

- Supabase Realtime para `crm_whatsapp_messages`.
- Supabase Realtime para `sales_messages`.
- Deduplicacion en memoria por `message.id`.
- Contador local por conversacion.
- Sonido via Web Audio.
- Preferencia local de sonido.

Limitaciones:

- Vive dentro de la app MotoFlow, no en la extension.
- No usa `chrome.notifications`.
- No persiste preferencias por usuario/tenant en DB.
- `markConversationRead` actualiza solo `crm_whatsapp_conversations`; para `sales_conversations` falta equivalente.
- No hay background service worker para recibir eventos cuando el content script no esta activo.

Para Omni se puede reutilizar el enfoque, pero debe moverse/adaptarse a un servicio de extension con:

- Realtime unico por tenant.
- Bridge content script/background.
- `chrome.notifications`.
- Preferencias en Supabase o storage por usuario.

## 12. Tablas Existentes Reutilizables

### Nucleo tenant/usuarios

- `tenants`
- `profiles`
- `usuarios_empresas`
- `config_empresa`
- `user_module_permissions`

### Clientes/cotizaciones/productos

- `clientes`
- `vendedores`
- `productos`
- `cotizaciones`
- `cotizaciones_detalle`
- `facturas`
- `facturas_detalle`

### Cobranza/financiera

- `prestamos`
- `prestamo_cuotas`
- `prestamo_pagos`
- `cobro_gestiones`
- `cobranza_seguimiento`

### WhatsApp CRM

- `crm_whatsapp_settings`
- `crm_whatsapp_contacts`
- `crm_whatsapp_conversations`
- `crm_whatsapp_messages`
- `crm_whatsapp_quote_items`
- `crm_whatsapp_conversation_events`

### Sales Hub / omnicanal

- `sales_channels`
- `sales_conversations`
- `sales_messages`
- `sales_leads`
- `sales_notifications`
- `sales_ai_training_logs`

### Meta/social

- `social_accounts`
- `social_account_secrets`
- `meta_webhook_events`

## 13. Funciones Faltantes para Omni

No se encontraron implementadas aun en la extension:

- Adaptadores `ChannelAdapter`.
- Modulos `channels/whatsapp`, `channels/instagram`, `channels/facebook`, `channels/tiktok`.
- Barra lateral compacta de canales dentro de WhatsApp Web.
- Overlay propio para Instagram/Facebook.
- Bandeja unificada en la extension.
- Background service worker MV3.
- Chrome notifications.
- Permiso `notifications`.
- Manejo `chrome.notifications.onClicked`.
- Alarmas/reconexion en background.
- Preferencias de notificacion por usuario/tenant.
- Feature flags Omni:
  - `omni_enabled`
  - `instagram_enabled`
  - `facebook_enabled`
  - `tiktok_enabled`
  - `unified_inbox_enabled`
  - `social_notifications_enabled`
  - `social_quotations_enabled`
- Asociacion social conversation -> cliente normalizada.
- `conversation_customer_links` o equivalente.
- `conversation_audit_logs`.
- `message_delivery_events`.
- Envio oficial desde extension para Instagram/Facebook usando backend.
- TikTok adapter y estado no conectado.
- Boton de emergencia "Restaurar interfaz de WhatsApp".
- Modo seguro automatico.
- Tests de extension.

## 14. Riesgos Principales

### Riesgos de regresion

- `App.jsx` mezcla cotizacion, cobranza, login, empresas, modal de deuda y casos de cobro en un componente grande.
- Extraer logica sin tests puede romper cotizaciones o cobranza.
- El build actual genera un unico `content.js`; agregar background/popup cambia el empaquetado.

### Riesgos de DOM WhatsApp

- Selectores distribuidos en `whatsappDom.js` y `content.jsx`.
- Dependencia de `#app`, `header`, `[contenteditable=true]`, `data-tab=10`.
- WhatsApp Web puede cambiar sin aviso.

### Riesgos de seguridad

- Extension guarda Supabase session completa en `localStorage`.
- `sales_channels` tiene columnas de tokens; debe limitarse exposicion por RLS o migrar secretos a tabla solo service_role.
- `meta-subscribe-pages` contiene IDs hardcodeados.
- Host permissions actuales permiten `https://*.supabase.co/*`, aceptable para beta pero debe revisarse por proyecto/dominio.

### Riesgos de Realtime

- Sin background, las notificaciones solo viven mientras WhatsApp Web y content script estan activos.
- Multiples recargas de WhatsApp pueden abrir listeners duplicados si no se centralizan.
- Realtime requiere filtros por tenant y limpieza estricta.

## 15. Codigo Reutilizable

Reutilizar sin reescritura:

- `apiClient.js`: auth, headers, productos, clientes, cotizaciones, deuda.
- `whatsappDom.js`: pegar texto/adjuntar archivo, pero encapsulado y con selectores centralizados.
- `fichaPdf.js`: ficha de cliente para buscador.
- `WhatsAppCrmPage.jsx`: patrones de bandeja, mensajes, estados, cotizaciones.
- `WhatsAppNotificationContext.jsx`: sonido, deduplicacion y Realtime como referencia.
- `sales_hub_beta.sql`: modelo base para conversaciones y mensajes sociales.
- `meta-messages-webhook`: ingestion Instagram/Facebook.
- `crm_whatsapp_conversation_events`: auditoria de acciones de extension.

## 16. Plan de Implementacion por Fases

### Fase 0 - Auditoria

Entregable actual: este documento.

### Fase 1 - Preparacion Omni Beta

Objetivo: preparar estructura sin romper comportamiento.

Archivos probables:

- `whatsapp-quote-extension/public/manifest.json`
- `whatsapp-quote-extension/vite.config.js`
- `whatsapp-quote-extension/src/App.jsx`
- nuevos archivos bajo:
  - `src/core`
  - `src/channels`
  - `src/components/omni`
  - `src/services`
  - `src/hooks`

Cambios:

- Nombre beta: `MotoFlow Omni Beta`.
- Version: `2.0.0-beta.1`.
- Badge visual `BETA`.
- Feature flags leidos desde backend/config.
- Modo seguro y boton restaurar WhatsApp.
- Mantener WhatsApp como canal inicial.

### Fase 2 - Contadores y Notificaciones Sociales

Objetivo: usar `sales_messages` y `sales_notifications` para Instagram/Facebook.

Cambios:

- Background service worker.
- Permiso `notifications`.
- Realtime o polling/backoff controlado.
- Deduplicacion de mensajes.
- Preferencias usuario/tenant.

### Fase 3 - Bandeja Instagram

Objetivo: overlay con lista, mensajes y respuesta.

Backend:

- Confirmar endpoint seguro para enviar mensajes Instagram.
- No enviar directo desde content script a Graph API.

### Fase 4 - Bandeja Facebook

Reutilizar componentes de Instagram con `FacebookChannelAdapter`.

### Fase 5 - Integracion Comercial

Extraer servicios compartidos:

- cotizaciones
- deuda
- cliente
- gestion de cobro

Conectar con conversaciones sociales.

### Fase 6 - Bandeja Unificada

Usar `sales_conversations_view`, ordenar por:

1. sin responder
2. tiempo esperando
3. no leidos
4. fecha ultimo mensaje

### Fase 7 - TikTok Preparado

- Adapter inactivo.
- Feature flag `tiktok_enabled = false`.
- Pantalla de no conectado.
- Sin scraping.

### Fase 8 - Estabilizacion

- Pruebas de regresion.
- Auditoria de RLS.
- Revision de permisos MV3.
- Documentacion y rollback.

## 17. Migraciones SQL Necesarias

No crear aun sin revisar estado aplicado en Supabase. Propuestas:

1. Feature flags en `config_empresa` o tabla dedicada:
   - `omni_enabled`
   - `instagram_enabled`
   - `facebook_enabled`
   - `tiktok_enabled`
   - `unified_inbox_enabled`
   - `social_notifications_enabled`
   - `social_quotations_enabled`

2. Normalizacion de cliente/conversacion:
   - Crear `conversation_customer_links` si no se decide usar campo directo en `sales_conversations`.

3. Auditoria:
   - `conversation_audit_logs`.

4. Preferencias:
   - `notification_preferences` por `tenant_id`, `user_id`, `channel`.

5. Delivery:
   - `message_delivery_events`.

6. TikTok:
   - Ampliar CHECK de `sales_channels.platform`, `sales_conversations.platform`, `sales_messages.platform` para incluir `tiktok`.

7. Seguridad tokens:
   - Evaluar migrar tokens de `sales_channels` hacia `social_account_secrets` o bloquear SELECT de columnas sensibles con una vista/RPC segura.

## 18. Permisos Manifest Recomendados para Beta

Mantener inicialmente:

- `storage`

Agregar solo cuando se implemente Fase 2:

- `notifications`
- posiblemente `alarms`

Evitar hasta justificar:

- `tabs`
- `scripting`
- host permissions globales

Host permissions:

- `https://web.whatsapp.com/*`
- Supabase del proyecto especifico, no wildcard si se puede parametrizar en build beta.
- dominio backend MotoFlow si `VITE_API_BASE_URL` se usa.

## 19. Archivos que Probablemente se Modificaran

- `whatsapp-quote-extension/public/manifest.json`
- `whatsapp-quote-extension/vite.config.js`
- `whatsapp-quote-extension/package.json`
- `whatsapp-quote-extension/src/App.jsx`
- `whatsapp-quote-extension/src/content.jsx`
- `whatsapp-quote-extension/src/styles.js`
- `whatsapp-quote-extension/src/services/apiClient.js`
- `whatsapp-quote-extension/src/utils/whatsappDom.js`
- `src/pages/WhatsAppCrmPage.jsx` solo si se extraen servicios reutilizables
- `sql/sales_hub_beta.sql` o migraciones nuevas
- `supabase/functions/meta-messages-webhook/index.ts`
- `supabase/functions/sales-hub-webhook/index.ts`

## 20. Archivos Nuevos Recomendados

En la extension:

- `src/core/featureFlags.js`
- `src/core/safeMode.js`
- `src/core/eventBus.js`
- `src/channels/channelTypes.js`
- `src/channels/channelRegistry.js`
- `src/channels/whatsapp/whatsappAdapter.js`
- `src/channels/whatsapp/whatsappSelectors.js`
- `src/channels/instagram/instagramAdapter.js`
- `src/channels/facebook/facebookAdapter.js`
- `src/channels/tiktok/tiktokAdapter.js`
- `src/components/omni/OmniShell.jsx`
- `src/components/omni/ChannelRail.jsx`
- `src/components/conversations/ConversationList.jsx`
- `src/components/conversations/ConversationThread.jsx`
- `src/components/customer/CustomerPanel.jsx`
- `src/services/salesHubClient.js`
- `src/services/realtimeClient.js`
- `src/services/notificationClient.js`
- `src/background/service-worker.js` cuando se agreguen notificaciones

Documentos:

- `docs/MOTOFLOW_OMNI_ARQUITECTURA.md`
- `docs/MOTOFLOW_OMNI_INSTALACION_BETA.md`
- `docs/MOTOFLOW_OMNI_PRUEBAS.md`
- `docs/MOTOFLOW_OMNI_ROLLBACK.md`
- `docs/MOTOFLOW_OMNI_RELEASE_CHECKLIST.md`

## 21. Pruebas de Regresion Requeridas

Antes de Fase 1:

- Login.
- Cambio de empresa.
- Deteccion chat actual.
- Busqueda simple productos.
- Busqueda avanzada.
- Agregar/quitar productos.
- Calculo subtotal/ITBIS/total.
- Crear y pegar cotizacion.
- Crear cotizacion en Supabase.
- Consultar deuda.
- Gestion de Cobro.
- Filtros de Gestion de Cobro.
- Enviar WhatsApp desde caso.
- Adjuntar ficha PDF.

Para Omni:

- Extension carga sin romper WhatsApp.
- Barra de canales no bloquea lista ni chat.
- Boton restaurar WhatsApp desmonta UI Omni.
- Realtime no duplica eventos tras recarga.
- Mensaje Instagram incrementa contador.
- Mensaje Facebook incrementa contador.
- No notifica mensajes propios.
- Notificacion abre conversacion correcta.
- Instagram/Facebook fallan sin romper WhatsApp/cotizacion.
- TikTok permanece inactivo si flag es false.

## 22. Decision Tecnica Recomendada

La ruta mas segura es:

1. No tocar de inmediato la extension productiva.
2. Crear rama `feature/motoflow-omni-beta` cuando el arbol de trabajo este estable.
3. Convertir el manifest a beta en una primera fase aislada.
4. Extraer adaptadores y shell Omni sin cambiar flujos existentes.
5. Reutilizar `sales_*` para canales sociales.
6. Mantener tokens en backend.
7. Implementar notificaciones antes que bandejas completas.
8. Llevar Instagram y Facebook juntos solo a nivel de infraestructura; UI por fases.
9. Dejar TikTok como adapter inactivo y feature flag.

## 23. Estado de Preparacion

Listo para iniciar Fase 1 despues de:

- Confirmar manejo de rama con cambios locales.
- Definir si la beta sera extension separada o build alterno del mismo directorio.
- Confirmar Supabase project/env beta.
- Confirmar si `sales_hub_beta.sql` ya esta aplicado en produccion/beta.
- Confirmar si `meta-messages-webhook` ya recibe eventos reales.
- Confirmar politica para mover/ocultar tokens de `sales_channels`.

