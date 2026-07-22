# MotoFlow Omni - Arquitectura Beta

MotoFlow Omni evoluciona la extension actual de WhatsApp Web sin reemplazar WhatsApp. La extension sigue montandose como content script MV3 sobre `https://web.whatsapp.com`, con UI en Shadow DOM y WhatsApp como canal inicial.

## Capas

- WhatsApp Web nativo: lista de chats, conversacion, audios, imagenes, documentos y llamadas.
- MotoFlow Omni Extension: UI diaria del vendedor, cotizaciones, deuda, gestion de cobro y canales secundarios.
- Sales Hub: backend operativo para conversaciones, mensajes, leads, notificaciones y webhooks.
- Supabase: Auth, RLS, tenant isolation, Realtime, Postgres y Edge Functions.

## Extension

La beta agrega una capa Omni sobre la extension actual:

- `src/core/omniConfig.js`: flags beta, version y modo seguro.
- `src/channels/channelRegistry.js`: registro de canales y flags.
- `src/components/omni/ChannelRail.jsx`: rail compacto de canales.
- `src/components/omni/OmniInbox.jsx`: bandeja integrada compacta.
- `public/manifest.beta.json`: manifiesto separado para beta.

WhatsApp continua usando el flujo existente de `App.jsx`, `apiClient.js` y `whatsappDom.js`.

## Canales

- WhatsApp: activo por defecto y operado de forma nativa.
- Instagram: lee conversaciones/mensajes desde Sales Hub, permite responder como `queued`, cambiar estado y cotizar desde chat.
- Facebook: lee conversaciones/mensajes desde Sales Hub, permite responder como `queued`, cambiar estado y cotizar desde chat.
- TikTok: flag fijo inactivo hasta autorizacion.
- Bandeja: usa `sales_conversations_view` + `sales_messages`.
- Seguimientos: contador inicial derivado de cobranza/promesas actuales.

## Flujo Operativo Actual

- IN/IG/FB cargan conversaciones desde `sales_conversations_view`.
- El detalle carga mensajes desde `sales_messages`.
- Responder inserta un mensaje saliente `sender_type='agent'` y `status='queued'`.
- Cotizar desde chat cambia al flujo de cotizacion con contexto Omni.
- Crear y registrar cotizacion guarda el texto como mensaje saliente `queued`.
- Mandar a facturar crea la cotizacion en Motoflow y vincula `sales_conversations.cotizacion_id`.
- Cambiar estado actualiza `sales_conversations.status`.

## Pendiente Externo a la Extension

La extension ya deja el trabajo preparado en base de datos. Lo unico pendiente para envio real por redes sociales es un despachador backend seguro que tome `sales_messages.status='queued'` y use el token de `sales_channels`/Meta para enviarlo por Instagram o Facebook, actualizando luego `status='sent'` o `failed`.

## Backend Reutilizado

- `sales_channels`
- `sales_conversations`
- `sales_messages`
- `sales_notifications`
- `sales_leads`
- `meta_webhook_events`
- Edge Function `meta-messages-webhook`

## Principios

- No guardar tokens sociales en la extension.
- No modificar nodos nativos de WhatsApp salvo el ajuste visual controlado del ancho.
- Mantener un modo seguro para restaurar WhatsApp.
- Usar feature flags antes de activar canales secundarios.
- Reutilizar Sales Hub como fuente de verdad.
