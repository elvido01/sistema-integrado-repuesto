# MotoFlow Omni - Release Checklist

## Antes de Publicar Beta

- Confirmar rama `feature/motoflow-omni-beta`.
- Confirmar que el arbol de trabajo no mezcla cambios no relacionados.
- Ejecutar `npm.cmd run build` desde `whatsapp-quote-extension/`.
- Ejecutar `npm.cmd run package:beta` desde `whatsapp-quote-extension/` para generar ZIP beta separado.
- Cargar extension unpacked en Chrome.
- Validar login.
- Validar cotizaciones.
- Validar deuda y Gestion de Cobro.
- Validar modo seguro.
- Validar manifest beta.
- Validar IN: carga conversaciones desde `sales_conversations_view`.
- Validar IG/FB: filtran conversaciones por canal.
- Validar Responder: inserta mensaje `agent/queued` en `sales_messages`.
- Validar Cotizar desde chat: cambia al flujo de cotizacion con contexto Omni.
- Validar Mandar a facturar: crea cotizacion y vincula `sales_conversations.cotizacion_id`.
- Validar cambio de estado de conversacion.

## Seguridad

- Confirmar que no hay tokens Meta/TikTok en la extension.
- Confirmar que no se usa service role en cliente.
- Confirmar host permissions minimos.
- Confirmar RLS de `sales_*`.
- Confirmar aislamiento por `tenant_id`.

## Pendiente Fuera de la Extension

- Definir flags persistidos por empresa.
- Crear despachador backend seguro para envio Instagram/Facebook de mensajes `queued`.
- Crear preferencias de notificaciones.
- Crear background service worker solo cuando se activen Chrome notifications.

## Rollback

- Mantener ZIP/productivo actual disponible.
- Documentar version instalada.
- Conservar instruccion de `Restaurar WhatsApp`.
