# Mapa operativo de datos — Repuestos Morla (para Hermes)

> Etapa 1, Día 1 del plan de IA comercial. Verificado contra producción el
> 17/07/2026. Tenant de Repuestos Morla: `00000000-0000-0000-0000-000000000001`.
> Regla de oro para Hermes: **siempre filtrar por ese `tenant_id`** y **nunca
> inventar precios ni existencia** — se responden desde estas tablas.

## Cómo se conecta Hermes

**La base está en Supabase, no en su PC.** El 08/08/2026 buscó un Postgres en
`localhost:5432` y la autenticación falló: ahí `hermes_readonly` no existe.

Desde el 11/08/2026 Hermes vive en una **aplicación gestionada de Hostinger**
(`orchid-giraffe-371410`, terminal en *Managed applications → Hermes Agent →
Open command line*), y eso cambió la dirección — no por gusto:

```
host:  aws-0-us-east-2.pooler.supabase.com    (pooler de SESIÓN)
port:  5432        base: postgres      sslmode: require
user:  hermes_readonly.zdvxowpuklbypweyqqki   ← con el sufijo del proyecto
```

> **El host directo ya no tiene IPv4.** `db.zdvxowpuklbypweyqqki.supabase.co`
> resuelve *solo* a IPv6 (`2600:1f16:…`), y el contenedor de Hostinger no
> tiene IPv6 operativo. "Forzar IPv4" no sirve: no hay IPv4 que forzar. El
> pooler sí resuelve a IPv4, y por eso es el camino desde el VPS. Desde una
> PC con IPv6 el host directo sigue valiendo.
>
> La región (`us-east-2`) no está escrita en ninguna parte del panel que sea
> fácil de encontrar. Se puede averiguar sin la clave: el pooler contesta
> *"Tenant or user not found"* si la región es la equivocada y *"password
> authentication failed"* si es la correcta.

La cadena va en `MOTOFLOW_DB_URL`, nunca en este repo, y en **formato
`clave=valor`** — no URL. Las claves con `@` o `:` rompen el parseo de una
URL y el error que dan no se parece a la causa.

La clave la puso Elvido al correr `sql/hermes_readonly_user.sql`; si se
pierde se cambia con un `ALTER ROLE hermes_readonly WITH PASSWORD '…'` suelto
en el SQL Editor — **no** re-ejecutando ese script, que borra las vistas del
schema `hermes` y hay que rehacer todos los GRANTs. (Si se re-ejecuta por
error no pasa nada: se para solo en su propio guardia de `v_password`, y como
va dentro de una transacción no llega a borrar nada.)

> **Puerto 5432, no 6543.** El pooler de transacción (6543) es PgBouncer y
> bota el `LISTEN` al soltar la conexión: `hermes_llegadas` y `hermes_chat`
> quedarían mudos sin dar error. Directo o pooler de sesión, ambos 5432.

> **El núcleo de Hermes necesita un parche.** El plugin falla con
> `type object 'Platform' has no attribute 'MOTOFLOW'` hasta que se añade
> MOTOFLOW al enum `Platform`. Se hizo en la PC local el 08/08 y hubo que
> repetirlo en el VPS el 11/08: el `config.yaml` viaja, el parche del núcleo
> no. Cada actualización de Hermes probablemente lo borre, y el síntoma es
> que el canal deja de contestar sin que nada más falle.

> **No existe `hermes.hermes_chat`.** Las vistas del schema se crearon antes
> que esa tabla y no se regeneran solas. El canal se usa por funciones:
> `hermes.chat_pendientes(p_limite)`, `hermes.chat_responder(id, texto[,
> acciones jsonb])` y `hermes.chat_marcar_atendidos(ids[])`.

> **En psycopg 3 el LISTEN se escucha distinto.** El ejemplo de más abajo es
> de psycopg2. En la v3 no hay `conn.poll()` ni `conn.notifies` como lista:
> es `conn.autocommit = True`, `conn.execute("LISTEN …")` y luego iterar
> `for aviso in conn.notifies():`. Con el ejemplo viejo conecta bien y los
> avisos no llegan nunca, sin error.

- **psycopg2 directo a Postgres** con el rol restringido `hermes_readonly`:
  lee desde el schema `hermes` (vistas ya filtradas al tenant de Morla).
  El rol es de solo lectura por defecto; para escribir en el CRM debe abrir
  la transacción así: `BEGIN; SET TRANSACTION READ WRITE; ... COMMIT;`
  (solo tiene permiso de escritura en `hermes.crm_seguimiento`).
  Las vistas custom de este schema (`crm_seguimiento`, `crm_hoy`,
  `product_image_status`, WhatsApp y llegadas) las crea
  [sql/hermes_readonly_vistas.sql](../sql/hermes_readonly_vistas.sql) —
  re-correrlo si algún día se re-ejecuta `hermes_readonly.sql` (las borra).
- Si se conecta con `service_role`/`postgres`, usa las tablas `public.*`
  directo, siempre con `WHERE tenant_id = '00000000-0000-0000-0000-000000000001'`.

## Mapa de datos actual

| Tabla o módulo | Datos disponibles | Uso comercial | Hermes L/E | Observación |
|---|---|---|---|---|
| `productos` (5,262 en Morla) | codigo, descripcion, precio, costo, itbis_pct, ubicacion, min_stock/max_stock, imagen_url, marca/modelo | Responder precios, elegir productos para promos/publicaciones | Lee ✓ / No escribe | La existencia NO está aquí: sale del kardex |
| `inventario_movimientos` (kardex) | producto_id, tipo (ENTRADA/SALIDA), cantidad, costo_unitario, fecha | Existencia real, detectar llegadas, rotación | Lee ✓ / No escribe | Existencia = suma de movimientos; la web usa el RPC `get_productos_paginados` |
| `clientes` (33 en Morla) | nombre, telefono, balance, limite_credito, dias_credito | Historial y crédito de clientes formales | Lee ✓ / No escribe | Solo 33 registrados vs 2,949 facturas: el detal no se registra → ese hueco lo cubre el CRM nuevo |
| `facturas` + `facturas_detalle` (2,949; 628 en los últimos 30 días) | numero, fecha, cliente, total, forma_pago, monto_pendiente; detalle con codigo/cantidad/precio | Reporte comercial diario, qué se vende, medición de resultados | Lee ✓ / No escribe | Fuente de verdad de ventas |
| `cotizaciones` (30) | numero, cliente, total, estado, estado_comercial, fecha_vencimiento | Cotizaciones formales y su seguimiento | Lee ✓ / No escribe | Ya trae `estado_comercial` propio |
| `crm_whatsapp_*` (inbox Meta: 92 conversaciones, 436 mensajes) | contacts (phone, lead_score hot/warm/cold, cliente_id), conversations (status, intent, cotizacion_id), messages | Inbox oficial de WhatsApp en la web (WhatsAppCrmPage) | Lee ✓ / No escribe | Recepción activa; **envío por API bloqueado** hasta poner método de pago en Meta |
| `sales_conversations`/`sales_messages` (espejo WhatsApp Web: 142 chats, 880 mensajes) | chat completo del WhatsApp real, vía extensión Omni | La fuente que Hermes debe LEER para WhatsApp | Lee ✓ / No escribe | Usar las vistas masticadas de abajo, no las tablas crudas |
| `hermes_whatsapp_conversaciones` / `hermes_whatsapp_mensajes` (vistas) | una fila por chat con `sin_responder`, `horas_desde_cliente`, último mensaje; mensajes con quien='yo'/'cliente' | Detectar chats sin responder y leer la conversación | Lee ✓ | **Endurecidas:** solo chats individuales con teléfono verificable (los sin número y grupos NO aparecen); un mensaje con credenciales/secretos se sirve como `[contenido sensible oculto]`. El teléfono viene del JID real (extensión v2) |
| `crm_whatsapp_contacts` (directorio) | phone normalizado, name (el manual manda), cliente_id si hay match único, última interacción | Saber a quién se le escribe y con qué nombre dirigirse | Lee ✓ | Se llena solo desde el espejo (ingesta + backfill); el teléfono es el destino, el nombre es solo para dirigirse |
| `hermes.hermes_whatsapp_cotizaciones` (vista) | por conversación: cotizacion_numero, producto_id, codigo_producto, descripción, cantidad, precio_unitario | Saber QUÉ se cotizó en cada chat con datos del catálogo real (para pasar `p_codigo` exacto al CRM) | Lee ✓ | La extensión guarda la cotización canónica y la enlaza al chat; sin costos ni márgenes |
| `solicitudes_clientes` + vista `hermes_llegadas_pendientes` | cliente, teléfono, producto agotado, estado, available_at | Pedidos de productos agotados + aviso automático cuando llegan (trigger en kardex) | Lee ✓ + push en tiempo real por `LISTEN hermes_llegadas` (marcar avisado: solo web o service_role) | **Ya creado.** Hoy hay 1 llegada pendiente de avisar |
| `ai_marketing_content` + `social_posts` (+métricas) | copys FB/IG/WhatsApp, guiones, fecha_programada; posts publicados y sus métricas | Publicaciones con datos reales de productos | Lee ✓ / No escribe (lo maneja el módulo Marketing IA) | Módulo montado, casi sin uso (1 contenido, 1 post) |
| `config_empresa` | tipo_negocio=repuestos, feat_crm_whatsapp=true | Saber qué módulos tiene la empresa | Lee ✓ | — |
| `hermes.product_image_status` (vista) | producto activo + precio, stock_actual, has_image, imagen_url, sales_30d, last_sale_at, first_stock_entry_at | Elegir productos promocionables sin foto (pedido diario 10:15) | Lee ✓ | **Corrida en prod ✓.** La imagen es `productos.imagen_url` (bucket `product-images`), una por producto |
| **`crm_seguimiento` (NUEVO — hoy)** | ficha comercial: estado, prioridad, proxima_accion, fecha_seguimiento, enlaces a factura/solicitud | El pipeline de ventas y seguimiento diario | **Lee ✓ / Escribe ✓ vía `hermes.crm_upsert_seguimiento(...)`** | Etapa 1.2: dedup teléfono+producto y cierre automático al facturar ([sql/crm_operativo.sql](../sql/crm_operativo.sql)) |

## Datos faltantes

- **Seguimiento comercial** — no existía ninguna tabla de pipeline. Creada hoy (`crm_seguimiento`) y ya corrida en prod.
- **Envío de WhatsApp por API** — bloqueado (método de pago en Meta). Mientras tanto los mensajes salen manual/por la extensión; Hermes redacta, la persona envía.
- **Teléfonos del detal** — las ventas de mostrador no registran cliente ni teléfono; el CRM captura eso desde WhatsApp.
- **Vínculo conversación→venta** — no existía; el CRM nuevo lo resuelve con `factura_id`.

## CRM mínimo (tabla `crm_seguimiento`)

Una fila = una oportunidad abierta. Campos: `cliente_nombre`, `telefono`,
`canal_origen` (whatsapp/tienda/telefono/referido/redes/otro),
`producto_consultado`, `codigo_producto`, `producto_id`, `estado`, `prioridad`
(alta/media/baja), `proxima_accion`, `fecha_seguimiento`, `notas`,
`cliente_id`, `contact_id`, `factura_id` (cuando compra), `solicitud_id`
(cuando pide algo agotado), `creado_por` ('hermes'/'web'), `creado_en`,
`actualizado_en`.

Estados: `nuevo` → `interesado` → `precio_enviado` → `pendiente_pago` /
`prometio_pasar` → `comprado` | `perdido`. Aparte: `agotado_solicitado`
(pidió algo sin existencia) y `requiere_aprobacion` (Hermes no decide solo:
descuentos, crédito, casos raros).

Reglas ya puestas en la base (Etapa 1.2):
- Solo **un seguimiento abierto por teléfono + producto**: mismo cliente y
  mismo producto → se ACTUALIZA la ficha; producto distinto → ficha nueva.
- **Cierre automático al facturar**: cuando se factura a un cliente
  registrado (por `cliente_id` o teléfono), sus fichas abiertas del producto
  facturado (o sin producto) pasan solas a `comprado` con `factura_id`
  enlazado. Ignora facturas anuladas.
- `actualizado_en` se actualiza solo (trigger); las notas se ACUMULAN con
  fecha, no se pisan.
- Vista **`hermes.crm_hoy`**: SOLO lo que requiere acción hoy — abiertos con
  fecha vencida o sin fecha, prioridad alta primero. Las fichas
  `agotado_solicitado` se ocultan mientras la pieza no llega y reaparecen
  solas cuando el detector marca la solicitud como `notificada`.

## Cómo Hermes debe usarlo (rutina diaria)

1. **Barrido de WhatsApp**: `SELECT * FROM hermes.hermes_whatsapp_conversaciones WHERE sin_responder` →
   por cada chat, leer sus mensajes y crear/actualizar la ficha con la
   función de escritura controlada (NO hacer INSERT manual — la función
   normaliza el teléfono, enlaza sola cliente/contacto/producto, evita
   duplicados por teléfono+producto y acumula las notas con fecha):
   ```sql
   BEGIN; SET TRANSACTION READ WRITE;
   SELECT hermes.crm_upsert_seguimiento(
     p_telefono          := '809-555-1234',        -- como venga, se normaliza
     p_cliente_nombre    := 'Juan Pérez',
     p_producto          := 'goma 90/90-17',
     p_codigo            := 'GM9017',              -- si se conoce
     p_estado            := 'precio_enviado',
     p_proxima_accion    := 'preguntar si pasa a buscarla',
     p_fecha_seguimiento := current_date + 1,
     p_nota              := 'preguntó precio, se le envió RD$850');
   COMMIT;
   ```
   Devuelve JSON con `accion` ('creada'/'actualizada') y `seguimiento_id`.
   Campos en NULL = no tocar lo que ya tiene la ficha.
2. **Seguimiento del día**: `SELECT * FROM hermes.crm_hoy;` → redactar el
   mensaje de seguimiento de cada ficha (la persona lo envía por WhatsApp).
   La tienda ve y ejecuta estas mismas fichas en el panel **"Seguimientos de
   Hoy"** de MotoFlow (menú CRM): allí anotan notas, reprograman fechas y
   marcan perdido/requiere_aprobacion/agotado — todo por
   `crm_upsert_seguimiento`, así que lo que la tienda haga le aparece a
   Hermes en `crm_hoy` al momento (y viceversa).
3. **Cierres**: la venta a cliente registrado se cierra SOLA (trigger al
   facturar: `comprado` + `factura_id`). Hermes solo cierra a mano:
   `perdido` (con la razón en `p_nota`) y las compras de mostrador sin
   cliente registrado que detecte en la conversación. Si pidió algo
   agotado: `estado='agotado_solicitado'` y enlazar `p_solicitud_id`.
4. **Llegadas — en tiempo real, sin botones**: la detección es automática
   (trigger del kardex con cualquier entrada de mercancía) y además hay un
   canal push: en cuanto una solicitud pasa a 'notificada', Postgres publica
   un aviso por `LISTEN hermes_llegadas` con JSON (cliente, teléfono,
   producto, cantidad). Hermes lo escucha por su misma conexión psycopg2:
   ```python
   conn.autocommit = True
   cur.execute("LISTEN hermes_llegadas;")
   # luego: select.select([conn],[],[],60) → conn.poll() → conn.notifies
   # cada payload es JSON; IGNORAR los de tenant_id ≠ Morla
   ```
   Al conectar (o reconectar), ponerse al día primero con
   `SELECT * FROM hermes.hermes_llegadas_pendientes;` por si llegó algo
   mientras estaba desconectado. El "marcar avisado" lo hace la persona con
   el botón 📦 del módulo Solicitudes (o service_role vía RPC
   `marcar_cliente_avisado`) — `hermes_readonly` no tiene ese permiso.
5. **Reporte comercial diario** (fin de tarde): ventas del día desde
   `facturas` (cantidad, total, formas de pago), fichas nuevas, fichas
   cerradas (comprado/perdido), seguimientos pendientes para mañana y
   llegadas sin avisar.
6. **Nunca**: prometer precios/existencia sin consultarlos, marcar
   `comprado` sin factura, ni tocar datos de otro tenant.
