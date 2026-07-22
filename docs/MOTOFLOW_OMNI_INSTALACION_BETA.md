# MotoFlow Omni - Instalacion Beta

## Estado Actual

La beta esta preparada dentro de `whatsapp-quote-extension`, pero el manifest productivo sigue intacto. El manifiesto beta separado es:

`whatsapp-quote-extension/public/manifest.beta.json`

## Build y Paquete Beta

Desde `whatsapp-quote-extension`:

```bash
npm.cmd run build
npm.cmd run package:beta
```

El primer comando genera `dist/content.js`. El segundo copia `public/manifest.beta.json` como `dist/manifest.json` y crea:

`public/downloads/motoflow-omni-beta-extension.zip`

Para instalar sin ZIP, despues de esos comandos cargar `whatsapp-quote-extension/dist` como unpacked.

## Variables Beta

Opcionales:

```env
VITE_MOTOFLOW_OMNI_BETA=true
VITE_MOTOFLOW_IG_ENABLED=true
VITE_MOTOFLOW_FB_ENABLED=true
```

TikTok permanece inactivo.

## Carga en Chrome

1. Abrir `chrome://extensions`.
2. Activar Developer mode.
3. Load unpacked.
4. Seleccionar `whatsapp-quote-extension/dist`.
5. Abrir `https://web.whatsapp.com`.

## Validacion Rapida

- Debe verse `MotoFlow Omni` con badge `BETA`.
- WhatsApp debe seguir visible.
- Cotizar y Ver deuda deben seguir disponibles.
- IN debe cargar conversaciones de `sales_conversations_view`.
- IG/FB deben filtrar por canal.
- Responder debe crear un mensaje `agent/queued` en `sales_messages`.
- Cotizar desde chat debe abrir el cotizador con contexto Omni.
- Mandar a facturar debe crear la cotizacion y vincularla a `sales_conversations`.
- `Restaurar WhatsApp` debe colapsar la UI y liberar el ancho de WhatsApp.
- `Activar Omni` debe reactivar el panel.

## Pendiente No Incluido En La Extension

El envio real a Instagram/Facebook depende de un despachador backend que lea mensajes `queued`, use tokens seguros de Meta y actualice el estado a `sent` o `failed`.
