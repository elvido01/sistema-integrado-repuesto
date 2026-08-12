# Contrato del canal MotoFlow ↔ Hermes

> Versión 1 · 2026-08-12 · Estados, eventos e idempotencia.
>
> Esto es lo que **las dos partes** pueden dar por cierto. MotoFlow se
> compromete a cumplir su mitad; el plugin de Hermes, la suya. Lo que no
> esté aquí no está acordado, y lo que esté aquí no se cambia sin subir la
> versión de este documento.

---

## Por qué hace falta

Hoy `hermes_chat` solo sabe dos cosas de un mensaje: `respondido = false` o
`respondido = true`. Entre una y otra puede haber dos minutos, y en ese hueco
la pantalla no tiene forma de distinguir estas tres situaciones:

- Hermes está consultando el catálogo y va bien
- Hermes falló y no lo va a intentar más
- Hermes nunca recibió el mensaje

Las tres se ven igual: silencio. Por eso el aviso de "no ha contestado"
aparecía encima de respuestas que sí llegaron, y por eso una espera normal
parecía una caída.

Y `hermes.chat_responder()` inserta sin comprobar nada:

```sql
INSERT INTO hermes_chat (…) VALUES (…, 'hermes', …);
UPDATE hermes_chat SET respondido = true WHERE id = p_mensaje_id;
```

Dos llamadas con el mismo `p_mensaje_id` —un reintento, un timeout, una
reconexión— producen **dos burbujas**. No es un riesgo teórico: es lo que
pasa cada vez que el plugin reintenta.

---

## 1. El ciclo de vida de un mensaje

Un mensaje del usuario recorre estos estados, **siempre hacia adelante**:

```
recibido ──▶ procesando ──▶ consultando ──▶ redactando ──▶ respondido
    │            │              │               │
    └────────────┴──────────────┴───────────────┴──────▶ error
                                                            │
                                                     (reintento)
                                                            │
                                                            ▼
                                                       procesando
```

| Estado | Quién lo pone | Significa |
|---|---|---|
| `recibido` | MotoFlow | Guardado en la base y anunciado. Hermes aún no lo ha tocado. |
| `procesando` | Hermes | Lo recogió y está razonando. |
| `consultando` | Hermes | Está pidiendo datos (catálogo, CRM, kardex). |
| `redactando` | Hermes | Ya tiene los datos y está escribiendo. |
| `respondido` | Hermes | Terminado. **Terminal.** |
| `error` | Hermes | Falló. Puede reintentarse. |

**Reglas que la base hace cumplir, no la buena voluntad:**

1. `consultando` y `redactando` son **opcionales**. Una pregunta que no
   necesita datos puede ir de `procesando` a `respondido` directo.
2. No se retrocede. `redactando` → `procesando` se rechaza.
3. `respondido` es **definitivo**. Nada lo saca de ahí. Esta es la regla
   que hace posible la idempotencia.
4. `error` → `procesando` es el **único** salto hacia atrás permitido, y
   solo a través de un reintento, que incrementa `intentos`.

### La función de estado

```sql
hermes.chat_estado(
  p_mensaje_id bigint,
  p_estado     text,       -- procesando | consultando | redactando | error
  p_detalle    text DEFAULT NULL   -- qué está haciendo, o el error
) RETURNS json
```

Devuelve `{ok, estado_anterior, estado, cambiado}`. Si la transición no es
legal, **no falla**: devuelve `cambiado: false` con el estado actual. Un
plugin que reintenta no debe reventar por avisar dos veces de lo mismo.

`p_detalle` es texto libre y **se muestra al usuario**. Sirve para que la
pantalla diga *"consultando el catálogo"* en vez de un genérico. Máximo 120
caracteres; lo que sobre se recorta.

---

## 2. La forma de la fila

`hermes_chat` gana columnas. **Ninguna existente cambia de nombre ni de
tipo**, para que nada de lo que hay hoy se rompa.

| Columna | Tipo | Estado | Para qué |
|---|---|---|---|
| `id` | bigint | existe | |
| `tenant_id` | uuid | existe | Aislamiento. Nunca se cruza. |
| `user_id` | uuid | existe | Quién preguntó. |
| `rol` | text | existe | `usuario` \| `hermes` |
| `texto` | text | existe | |
| `pantalla` | jsonb | existe, **cambia de forma** | Ver §4 |
| `creado_en` | timestamptz | existe | Marca el guardado. |
| `respondido` | boolean | existe, **se conserva** | Derivado de `estado`. Ver §7 |
| `acciones` | jsonb | existe | Propuestas. Ver §8 |
| `estado` | text | **nuevo** | §1. Default `recibido`. |
| `estado_detalle` | text | **nuevo** | Qué está haciendo ahora mismo. |
| `session_key` | text | **nuevo** | §3 |
| `responde_a` | bigint | **nuevo** | En filas de Hermes: a qué mensaje contesta. |
| `tomado_en` | timestamptz | **nuevo** | Cuándo pasó a `procesando`. |
| `respondido_en` | timestamptz | **nuevo** | Cuándo pasó a `respondido`. |
| `intentos` | smallint | **nuevo** | Cuántas veces se intentó. Default 0. |
| `ultimo_error` | text | **nuevo** | El último fallo, aunque después funcionara. |

### La restricción que impide el duplicado

```sql
CREATE UNIQUE INDEX hermes_chat_una_respuesta
  ON public.hermes_chat (tenant_id, responde_a)
  WHERE rol = 'hermes' AND responde_a IS NOT NULL;
```

Esto no es una comprobación dentro de una función: es la base la que hace
imposible que existan dos respuestas al mismo mensaje. Aunque dos procesos
de Hermes llamen a la vez, uno de los dos rebota.

---

## 3. `session_key` — la conversación

Un `session_key` es una cadena que agrupa mensajes consecutivos de una misma
conversación. **Lo genera MotoFlow**, no Hermes.

- Se crea al abrir el chat y vive en `localStorage`.
- Sobrevive a recargas y a cerrar y abrir el panel.
- Se renueva solo cuando el usuario pulsa *"nueva conversación"* o tras
  **6 horas** sin mensajes.
- Formato: `s-<uuid v4>`. Opaco: nadie debe deducir nada de su contenido.

Hermes lo usa para mantener contexto natural entre mensajes seguidos, sin
tener que releer el historial completo cada vez.

**Regla de aislamiento:** un `session_key` pertenece a un `tenant_id`. Una
respuesta a una sesión de otro tenant se rechaza. No es negociable.

---

## 4. `pantalla` — contexto estructurado

Deja de ser un saco de datos y pasa a tener forma fija:

```json
{
  "ruta": "ventas/factura",
  "modulo": "ventas",
  "registro_id": "FT-0012",
  "filtros": { "desde": "2026-08-01", "estado": "pendiente" },
  "seleccion": { "codigo": "52JK0442", "linea": 3 }
}
```

Todos los campos son opcionales; el objeto nunca es `null` (mínimo `{}`).

**Qué es y qué no es.** `pantalla` dice **dónde está parado el usuario**. No
es la fuente de datos del negocio. Que `seleccion` venga vacío significa que
no hay nada seleccionado, **no** que el dato no exista.

> Esto ya nos costó una tarde: Hermes leía `datos: null` y contestaba
> *"MotoFlow no me ha enviado los datos"*, mientras por su WebUI —sin este
> contexto— consultaba la base y acertaba. El contexto no le faltaba: le
> sobraba, mal entendido.

**Candidatos.** Cuando la pregunta pide precio o existencia, MotoFlow adjunta
los resultados ya consultados:

```json
{
  "candidatos": [
    { "codigo": "784401", "descripcion": "ACEITE MOTUL 7100 4T 10W-40",
      "marca": "MOTUL", "precio": 1000.00, "existencia": 57,
      "ubicacion": "ALMACEN" }
  ]
}
```

Son datos **reales**, consultados en el instante del envío. Hermes puede
citarlos sin volver a consultar. Van ordenados por encaje: el primero no
siempre es el bueno, elige él. Si ninguno encaja, que lo diga y busque con
`hermes.buscar_producto()`.

**Límite de tamaño:** `pantalla` completo no debe pasar de **8 KB**. Los
`filtros` y la `seleccion` van recortados a lo que se ve, no a todo lo que la
pantalla tiene en memoria.

---

## 5. El aviso — `NOTIFY hermes_chat`

Cargas útiles **mínimas**. Postgres corta el payload de `pg_notify` en 8000
bytes y la conexión se cae entera si se pasa; no es sitio para meter datos.

```json
{
  "id": 123,
  "tenant_id": "00000000-0000-0000-0000-000000000001",
  "session_key": "s-1f2c…",
  "texto": "tenemos motul 7100"
}
```

`texto` va recortado a 300 caracteres y sirve solo para que el plugin decida
prioridad sin ir a la base. **Lo demás se lee con `hermes.chat_pendientes()`.**

El aviso se emite **después** del `INSERT` y dentro de la misma transacción:
si la transacción se deshace, el aviso no sale. No puede haber un aviso de un
mensaje que no existe.

---

## 6. Eventos que la pantalla escucha

Por Supabase Realtime sobre `public.hermes_chat`:

| Evento | Filtro | Qué hace la pantalla |
|---|---|---|
| `INSERT` | `rol=eq.hermes` | Pinta la respuesta. |
| `UPDATE` | `rol=eq.usuario` | Actualiza el estado **en la misma burbuja**. |

**La segunda es la que hoy no existe** y es la causa de las burbujas
duplicadas: la pantalla solo escucha `INSERT`, así que cualquier señal de
progreso tenía que llegar como mensaje nuevo. Con `UPDATE`, el progreso
muta la burbuja que ya está puesta.

El sondeo cada 4 segundos se queda como red de seguridad, no como camino
principal.

---

## 7. Idempotencia — el núcleo

### `hermes.chat_responder(p_mensaje_id, p_texto, p_acciones)`

Se mantiene la firma. Cambia el comportamiento:

1. Si el mensaje ya está en `respondido`, **no inserta nada** y devuelve
   `{ok: true, duplicado: true, respuesta_id: <la que ya existe>}`.
   **No lanza excepción.** Un reintento no es un error del plugin.
2. Si no, inserta la respuesta con `responde_a = p_mensaje_id`, pone el
   mensaje en `respondido` y sella `respondido_en = now()`.
3. Ambas cosas en **una transacción**. No puede existir una respuesta sin
   que el mensaje quede cerrado, ni al revés.
4. La validación de códigos de `preparar_venta` **se mantiene tal cual**:
   un código inventado rebota mientras Hermes todavía puede corregirlo.

### Errores y reintentos

```sql
hermes.chat_error(p_mensaje_id bigint, p_error text) RETURNS json
```

Pone `estado = 'error'`, guarda `ultimo_error` y **no** marca `respondido`.
El mensaje sigue en la cola y `chat_pendientes()` lo devuelve otra vez.

`intentos` sube en cada paso a `procesando`. A partir de **3 intentos**,
`chat_pendientes()` deja de devolverlo: un mensaje que falló tres veces no se
arregla a la cuarta, y reintentar para siempre es cómo se llena un disco.
Queda visible en la pantalla como error, con su motivo.

`ultimo_error` **se conserva aunque el reintento funcione**. Si algo falló y
luego salió bien, eso hay que poder verlo después.

### `respondido` se queda

La columna sigue existiendo y sigue significando lo mismo. Se mantiene en
sincronía con `estado` por trigger. Todo lo que hoy la lee sigue funcionando
sin tocar una línea — incluido `hermes.chat_pendientes()`.

---

## 8. Acciones y cotizaciones

### Nada definitivo sin confirmación

Lo que viene en `acciones` es una **propuesta**. Nunca se ejecuta sola.

```json
{
  "tipo": "preparar_venta",
  "estado": "propuesta",
  "lineas": [{ "codigo": "52JK0442", "cantidad": 1 }],
  "resumen": "1 careta negra/azul Platina 125 — RD$2,006 con ITBIS"
}
```

| `estado` | Significa |
|---|---|
| `propuesta` | Hermes lo sugiere. La pantalla lo enseña y **espera**. |
| `confirmada` | La persona pulsó confirmar. Solo ahora se toca nada. |
| `descartada` | La persona dijo que no. |
| `caducada` | Pasaron 15 minutos sin decidir. |

Preparar una pantalla con líneas cargadas **no** es una acción definitiva:
nadie ha facturado nada y todo es reversible. Facturar, cobrar, descontar
inventario o mandar un mensaje a un cliente **sí** lo son, y esos exigen
confirmación explícita de una persona.

### La cotización tiene su propia vida

El estado de una cotización **no vive en el chat**. El chat es donde se
habló de ella; la cotización es un documento con su propio ciclo:

```
borrador ──▶ pendiente_confirmacion ──▶ confirmada
    │                   │
    └───────────────────┴──────────────▶ cancelada
```

Una conversación borrada no puede llevarse por delante una cotización
confirmada. Se enlazan por id, no se mezclan.

---

## 9. Métricas por mensaje

Se calculan de las marcas de tiempo, sin tabla aparte:

| Métrica | Cómo sale |
|---|---|
| Guardado | `creado_en` − momento del envío (lo mide la pantalla) |
| En cola | `tomado_en` − `creado_en` |
| Procesamiento | `respondido_en` − `tomado_en` |
| Total | `respondido_en` − `creado_en` |
| Reintentos | `intentos` |

Vista de consulta:

```sql
SELECT * FROM hermes.chat_metricas(p_desde timestamptz DEFAULT now() - interval '1 day');
```

Devuelve por mensaje y agregados: mediana y p95 de cola y de procesamiento,
tasa de error, reintentos. Sin esto, "va lento" es una opinión.

> Referencia medida el 2026-08-12, antes de este contrato:
> cola ~3-5 s · procesamiento 20 s / 63 s / +128 s · base 851 ms.

---

## 10. Lo que NO cambia

Estas siguen funcionando igual, con la misma firma y el mismo
comportamiento. El plugin no necesita tocarlas:

```sql
hermes.chat_pendientes(p_limite integer)
hermes.chat_responder(p_mensaje_id, p_texto [, p_acciones])
hermes.chat_marcar_atendidos(p_ids bigint[])
hermes.latido(p_detalle jsonb)
hermes.buscar_producto(p_texto, p_limite [, p_incluir_inactivos])
hermes.catalogo_resumen()
```

`chat_pendientes()` gana columnas en su salida (`session_key`, `estado`,
`intentos`), pero **no pierde ninguna** ni cambia el orden de las que ya
devuelve. Un plugin que lea por nombre de columna no se entera.

Recordatorio que sigue vigente: `hermes_readonly` es de solo lectura por
defecto. Para escribir:

```sql
BEGIN; SET TRANSACTION READ WRITE; SELECT hermes.chat_responder(…); COMMIT;
```

---

## 11. Pruebas que deben pasar

Cada una con su caso de fallo, no solo el feliz:

| # | Caso | Qué debe ocurrir |
|---|---|---|
| 1 | `chat_responder` dos veces, mismo id | Una sola burbuja. La segunda devuelve `duplicado: true`. |
| 2 | Dos procesos responden a la vez | El índice único rebota uno. Sin excepción hacia el usuario. |
| 3 | Hermes se reconecta a mitad | Recoge el pendiente y lo termina. No duplica. |
| 4 | Respuesta a los 3 minutos | Llega y se pinta. No hay aviso de caída encima. |
| 5 | Hermes devuelve error | Estado `error` con motivo visible. Sigue en cola. |
| 6 | Tres errores seguidos | Deja de reintentarse. Queda visible con su motivo. |
| 7 | Dos mensajes seguidos | Mismo `session_key`. Contexto continuo. |
| 8 | Cerrar y reabrir la pantalla | Misma sesión, historial entero, estados correctos. |
| 9 | Cotización sin confirmar | No se factura nada. A los 15 min, `caducada`. |
| 10 | Mensaje de otro tenant | `chat_responder` lo rechaza. Nunca se cruza. |
| 11 | `pantalla` de 20 KB | Se recorta a 8 KB. El mensaje llega igual. |
| 12 | `NOTIFY` con texto larguísimo | Recortado a 300. La conexión no se cae. |

---

## 12. Quién hace qué

**MotoFlow (yo):** las columnas nuevas, el índice único, `chat_estado()`,
`chat_error()`, `chat_metricas()`, la idempotencia de `chat_responder()`, el
`session_key`, el `pantalla` estructurado, la suscripción a `UPDATE`, los
estados visibles en la burbuja, el *"Hermes sigue trabajando…"* sin cerrar la
conversación, y las doce pruebas.

**Hermes (tú):** sesión estable por conversación, llamar a `chat_estado()` en
cada paso, `buscar_producto()` obligatorio para precio y existencia, ruta
rápida para catálogo y agente completo para cotizaciones, no responder dos
veces, y medir cola / modelo / herramientas / entrega.

**La frontera:** MotoFlow no interpreta lo que Hermes dice; Hermes no escribe
en las tablas del negocio. Lo único que cruza es esta tabla y estas funciones.
