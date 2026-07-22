# MotoFlow Omni - Solicitudes Agotadas - Pruebas

Fecha: 2026-07-03

## Pruebas de Servicio/RPC

1. Rechaza usuario sin sesion.
2. Rechaza usuario sin tenant activo.
3. Rechaza payload sin productos.
4. Rechaza producto sin `producto_id` y sin texto libre.
5. Rechaza cantidad menor o igual a cero.
6. Crea solicitud con cliente registrado.
7. Crea solicitud con contacto manual.
8. Crea solicitud con telefono normalizado.
9. Crea solicitud desde WhatsApp.
10. Crea solicitud desde Instagram/Facebook sin telefono.
11. Crea producto libre sin crear orden de compra.
12. Producto con suplidor crea/reutiliza orden pendiente.
13. Producto sin suplidor devuelve advertencia.
14. Producto inactivo no se envia a compra.
15. Producto ya existente en orden suma cantidad.
16. Duplicados de detalle se consolidan.
17. Solicitud duplicada activa aumenta cantidad cuando `duplicate_action = increase`.
18. Solicitud duplicada activa no crea otra fila silenciosamente.
19. Retorna `orden_compra_id` y `orden_compra_detalle_id`.
20. Respeta `tenant_id` en productos, clientes, solicitudes y ordenes.

## Pruebas Web

1. Crear solicitud desde modulo web.
2. Verificar que aparece en tabla.
3. Verificar que producto inventariado se envia a compra.
4. Verificar que producto libre no se envia a compra.
5. Verificar mensaje para producto sin suplidor.
6. Editar solicitud existente.
7. Cerrar solicitud.
8. Convertir a pedido cuando estado sea `notificada`.
9. Confirmar que no se rompe el filtro por estado.

## Pruebas Omni

1. Boton `Producto agotado` aparece con sesion activa.
2. Boton se desactiva sin conversacion activa.
3. WhatsApp autocompleta nombre.
4. WhatsApp normaliza telefono.
5. Busca cliente por telefono.
6. Permite contacto no registrado.
7. Instagram/Facebook usa conversacion seleccionada.
8. Permite buscar productos.
9. Permite varios productos.
10. Permite producto libre.
11. Muestra confirmacion antes de guardar.
12. No cierra ni recarga WhatsApp.
13. Muestra resultado por linea.
14. No hace insert directo si la RPC no existe.
15. Muestra fallback al modulo web.

## Pruebas de Disponibilidad

1. Compra recibida actualiza solicitudes correspondientes.
2. Trigger de stock crea `notificaciones.stock_disponible` si esta instalado.
3. Campanita web abre `solicitudes`.
4. Omni recupera pendientes al iniciar cuando se implemente Realtime.
5. Omni no duplica notificaciones.
6. Abrir alerta enfoca la conversacion correcta.
7. Mensaje sugerido es editable.
8. No se envia automaticamente.
9. Solo se marca avisado con confirmacion del vendedor.

## Pruebas de No Regresion

1. Cotizacion WhatsApp sigue pegando texto.
2. Crear cotizacion Omni social sigue registrando respuesta queued.
3. Ver deuda sigue cargando.
4. Gestion de cobro sigue pegando recordatorios.
5. Restaurar WhatsApp desmonta Omni.
6. Cambio de empresa activa conserva aislamiento de tenant.
7. Build de app web pasa.
8. Build de extension pasa.

## Comandos

```bash
npm test
npm run build
```

Para la extension:

```bash
cd whatsapp-quote-extension
npm run build
```

