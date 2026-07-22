# MotoFlow Omni - Pruebas

## Regresion Actual

Ejecutado:

```bash
npm.cmd run build
```

Resultado: build OK.

## Checklist Manual Fase 1

- La extension carga en WhatsApp Web.
- El panel aparece como `MotoFlow Omni`.
- El distintivo `BETA` aparece en el header.
- WhatsApp queda como canal activo inicial.
- Instagram, Facebook y TikTok aparecen deshabilitados si sus flags estan apagados.
- Boton `Cotizar` abre el flujo existente.
- Busqueda de productos funciona.
- Calculo de subtotal, ITBIS y total no cambia.
- Crear y pegar cotizacion sigue funcionando.
- Boton `Ver deuda` abre cobranza.
- Filtros de Gestion de Cobro siguen funcionando.
- `Restaurar WhatsApp` colapsa el panel.
- `Activar Omni` reactiva el panel.

## Pruebas Pendientes

- Tests automatizados de content script.
- Pruebas con Playwright sobre WhatsApp Web requieren entorno autenticado.
- Pruebas Realtime para mensajes Instagram/Facebook.
- Chrome notifications cuando exista background service worker.
- Pruebas RLS multiempresa sobre `sales_*`.
