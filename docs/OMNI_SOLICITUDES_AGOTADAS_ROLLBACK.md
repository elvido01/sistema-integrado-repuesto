# MotoFlow Omni - Solicitudes Agotadas - Rollback

Fecha: 2026-07-03

## Objetivo

Desactivar la integracion sin romper:

- WhatsApp Web.
- Cotizaciones.
- Ver deuda.
- Gestion de cobro.
- Modulo web de solicitudes.
- Ordenes de compra existentes.

## Rollback Rapido UI

1. Desactivar feature flag `out_of_stock_quick_request_enabled`.
2. Ocultar boton `Producto agotado` en Omni.
3. Mantener la extension cargada para cotizacion/deuda.
4. Si la extension completa falla, usar `Restaurar WhatsApp`.

## Rollback Web

Si el servicio compartido falla en Web:

1. Volver `createSolicitud` al insert directo anterior.
2. Mantener `sendProductToOrdenCompra` sin cambios para ventas/productos.
3. No borrar solicitudes creadas.
4. No borrar ordenes creadas, revisarlas manualmente si hubo duplicados.

## Rollback SQL

Preferir no borrar columnas nuevas. Son nullable y pueden quedar inactivas.

Si es necesario desactivar RPC:

```sql
revoke execute on function public.omni_crear_solicitudes_agotadas(jsonb) from authenticated;
```

Si hay que restaurar acceso:

```sql
grant execute on function public.omni_crear_solicitudes_agotadas(jsonb) to authenticated;
```

## Datos Creados

La integracion puede crear:

- filas en `solicitudes_clientes`.
- filas en `ordenes_compra`.
- filas en `ordenes_compra_detalle`.
- notificaciones de disponibilidad cuando el flujo existente las genere.

No borrar automaticamente. Las ordenes pueden contener otros productos o cantidades consolidadas.

## Reversion de Notificaciones

Si Realtime/Chrome falla:

1. Desactivar `out_of_stock_notifications_enabled`.
2. Mantener campanita web como mecanismo principal.
3. No crear polling alterno.

## Checklist

- Boton Omni oculto.
- Web app funciona.
- Campanita web funciona.
- Cotizaciones funcionan.
- Deuda/cobranza funciona.
- No hay errores de consola recurrentes.
- No se perdio acceso por tenant.

