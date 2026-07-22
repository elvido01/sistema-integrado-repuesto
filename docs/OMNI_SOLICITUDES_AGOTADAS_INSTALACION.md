# MotoFlow Omni - Solicitudes Agotadas - Instalacion

Fecha: 2026-07-03

## Estado Actual

La integracion queda preparada en documentacion y SQL, pero el SQL no debe ejecutarse sin revision previa del esquema productivo.

Script preparado:

- `sql/omni_solicitudes_agotadas.sql`

## Orden de Instalacion Recomendado

1. Revisar el esquema real de `solicitudes_clientes`.
2. Revisar el esquema real de `ordenes_compra`.
3. Revisar el esquema real de `ordenes_compra_detalle`.
4. Confirmar que existe `get_user_tenant()`.
5. Confirmar que existe `get_next_orden_compra_numero()`.
6. Aplicar `sql/omni_solicitudes_agotadas.sql` en Supabase SQL Editor.
7. Ejecutar una prueba con usuario normal del tenant.
8. Activar la UI de Omni en beta.

## Validacion Manual del SQL

Despues de aplicar el script:

```sql
select public.omni_crear_solicitudes_agotadas(
  jsonb_build_object(
    'created_from', 'motoflow_omni',
    'source_channel', 'whatsapp',
    'customer_name', 'Cliente Prueba',
    'phone', '8093905965',
    'phone_normalized', '+18093905965',
    'notes', 'Prueba controlada',
    'products', jsonb_build_array(
      jsonb_build_object(
        'producto_id', '<PRODUCTO_UUID>',
        'cantidad', 1
      )
    )
  )
);
```

Verificar:

- Se crea o actualiza `solicitudes_clientes`.
- Se crea/reutiliza orden pendiente.
- Se crea/actualiza detalle.
- La solicitud guarda `orden_compra_id`.
- No aparecen datos de otro tenant.

## Instalacion Extension Beta

1. Ejecutar build de la extension.
2. Generar ZIP beta.
3. En Chrome, abrir `chrome://extensions`.
4. Activar modo desarrollador.
5. Cargar carpeta generada o instalar ZIP segun flujo local.
6. Abrir `https://web.whatsapp.com`.
7. Iniciar sesion en MotoFlow Omni.
8. Seleccionar empresa activa si aparece.

## Configuracion Requerida

Variables de extension:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_MOTOFLOW_APP_URL` opcional para fallback al web app.

No colocar:

- service role key.
- secretos Meta.
- tokens administrativos.

## Criterios Para Activar En Produccion

- RPC aplicada y probada.
- RLS confirmado.
- Web conserva modulo de solicitudes.
- Extension no hace insert directo.
- Compras recibe lineas correctamente.
- Producto sin suplidor queda visible como advertencia.
- Rollback documentado y probado.

