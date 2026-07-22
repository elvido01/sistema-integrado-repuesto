# MotoFlow Omni - Rollback

## Rollback de Fase 1

La Fase 1 no aplica migraciones ni cambia el manifest productivo. Para volver al estado anterior:

- Desactivar la extension beta desde `chrome://extensions`.
- Cargar la extension productiva anterior.
- Si se instalo desde `dist`, volver a generar `dist` desde la version estable.

## Modo Seguro en Usuario

Si WhatsApp Web se ve afectado:

1. Pulsar `Restaurar WhatsApp`.
2. El panel se colapsa y se elimina el ajuste de ancho sobre WhatsApp.
3. Pulsar `Activar Omni` para volver.

El estado se guarda en `localStorage` con la clave:

`motoflow_omni_safe_mode`

## Rollback de Codigo

Archivos Fase 1 agregados:

- `whatsapp-quote-extension/src/core/omniConfig.js`
- `whatsapp-quote-extension/src/channels/channelRegistry.js`
- `whatsapp-quote-extension/src/components/omni/ChannelRail.jsx`
- `whatsapp-quote-extension/public/manifest.beta.json`

Archivos Fase 1 modificados:

- `whatsapp-quote-extension/src/App.jsx`
- `whatsapp-quote-extension/src/styles.js`
- `whatsapp-quote-extension/dist/content.js`

No revertir cambios ajenos del arbol de trabajo.
