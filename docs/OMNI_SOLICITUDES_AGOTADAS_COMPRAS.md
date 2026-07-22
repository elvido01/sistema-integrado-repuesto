# MotoFlow Omni - Solicitudes Agotadas - Compras

Fecha: 2026-07-03

Este documento define el comportamiento de compras que debe conservar la integracion.

## Flujo Confirmado

El servicio existente `src/services/sendToOrdenCompra.js`:

1. Carga el producto desde `productos`.
2. Verifica `activo`.
3. Usa `productos.suplidor_id`.
4. Busca una orden en `ordenes_compra` con:
   - mismo `suplidor_id`
   - `estado = 'Pendiente'`
   - ordenada por `fecha_orden desc`
5. Si existe, reutiliza esa orden.
6. Si no existe, crea una orden nueva.
7. Si el producto ya esta en la orden, suma cantidad y elimina duplicados.
8. Si no esta, inserta una linea nueva.
9. Recalcula totales.

No se confirmo uso actual de:

- ultimo suplidor historico.
- suplidores equivalentes.
- ranking de compra inteligente.
- almacenes dentro de la orden pendiente.

## Regla para Solicitudes Agotadas

Para cada solicitud con `producto_id`:

- Cantidad enviada a compra: `cantidad_solicitada`.
- Producto libre: solo se registra solicitud, no se envia a orden.
- Producto sin suplidor: se registra solicitud y se devuelve advertencia.
- Producto inactivo: se registra solicitud y no se envia a orden.
- Producto con orden pendiente: se reutiliza la orden.
- Producto ya presente en orden: se suma cantidad.
- Producto con detalles duplicados en la orden: se consolida en una sola linea.

## RPC Propuesta

La RPC preparada en `sql/omni_solicitudes_agotadas.sql` expone:

```sql
public.omni_crear_solicitudes_agotadas(p_payload jsonb)
```

Entrada conceptual:

```json
{
  "created_from": "motoflow_omni",
  "source_channel": "whatsapp",
  "source_conversation_id": "18093905965",
  "external_contact_id": "18093905965",
  "customer_name": "Cliente",
  "phone": "809-390-5965",
  "phone_normalized": "+18093905965",
  "cliente_id": null,
  "notes": "Pidio cuando llegue",
  "duplicate_action": "increase",
  "products": [
    {
      "producto_id": "uuid",
      "producto_texto": null,
      "cantidad": 1
    }
  ]
}
```

Salida conceptual:

```json
{
  "ok": true,
  "results": [
    {
      "ok": true,
      "solicitud_id": "uuid",
      "duplicate": false,
      "purchase": {
        "ok": true,
        "order_id": "uuid",
        "order_numero": "ORD-0001",
        "detail_id": "uuid",
        "supplier_id": "uuid",
        "supplier_name": "Proveedor",
        "is_new_order": false,
        "line_was_existing": true
      }
    }
  ]
}
```

## Relacion Solicitud - Orden

Debe guardarse en `solicitudes_clientes`:

- `orden_compra_id`
- `orden_compra_detalle_id`
- `purchase_order_added_at`
- `purchase_order_error`

Esto permite:

- Mostrar orden en Omni.
- Reintentar solo la compra sin duplicar solicitud.
- Saber que solicitud genero o aumento una linea.
- Abrir la orden desde el modulo web.

## Reorganizacion por Suplidor

Ya existe `sql/reorganizar_ordenes_por_suplidor.sql`.

Esa logica mueve lineas pendientes si cambia `productos.suplidor_id`.
La nueva RPC debe seguir usando `productos.suplidor_id` para crear o reutilizar ordenes; luego la reorganizacion existente puede corregir cambios posteriores.

## Compra Inteligente

La auditoria no encontro una conexion directa entre `solicitudes_clientes` y Compra Inteligente.

Decision recomendada:

- Fase inicial: usar la misma logica de `sendToOrdenCompra`.
- Fase posterior: si Compra Inteligente define ranking de suplidor o cantidades sugeridas, mover esa regla al backend y hacer que la RPC la invoque.

## Errores Esperados

La UI debe distinguir:

- solicitud creada, compra exitosa.
- solicitud creada, producto libre sin compra.
- solicitud creada, producto sin suplidor.
- solicitud creada, error al crear orden.
- duplicado activo actualizado.
- fallo total de validacion.

El reintento no debe crear otra solicitud.

