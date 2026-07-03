# Motoflow Cotizador WhatsApp

MVP de extension Chrome para usar WhatsApp Web como superficie manual de cotizacion, manteniendo Motoflow/Supabase como fuente de productos y precios.

## Que hace

- Inserta un panel lateral en `https://web.whatsapp.com`.
- Detecta el nombre visible del chat actual cuando WhatsApp lo expone.
- Busca productos con el RPC `get_productos_paginados`.
- Agrega productos con cantidad, precio, ITBIS y existencia.
- Guarda borradores por conversacion en `localStorage`.
- Genera un texto de cotizacion y lo pega en el cuadro de WhatsApp Web para envio manual.

## Configuracion

La extension lee estas variables desde el `.env.local` del repo principal durante el build:

```bash
VITE_SUPABASE_URL="https://TU_PROYECTO.supabase.co"
VITE_SUPABASE_ANON_KEY="TU_ANON_KEY"
VITE_MOTOFLOW_APP_URL="https://URL_REAL_DEL_CRM"
```

No uses `service_role` en esta extension.

## Build

Desde esta carpeta:

```bash
npm run build
```

Luego en Chrome:

1. Abre `chrome://extensions`.
2. Activa "Modo desarrollador".
3. Carga extension desempaquetada.
4. Selecciona `whatsapp-quote-extension/dist`.
5. Abre o recarga `https://web.whatsapp.com`.

## Notas

Este MVP pega el mensaje pero no lo envia automaticamente. Es intencional para evitar errores y mantener el control manual.
