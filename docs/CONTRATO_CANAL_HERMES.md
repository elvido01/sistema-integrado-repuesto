# Contrato del canal MotoFlow ↔ Hermes

> **Versión 2** · 2026-08-12 · Estados, eventos, idempotencia y orden.
>
> Esto es lo que **las dos partes** pueden dar por cierto. MotoFlow cumple su
> mitad; el plugin de Hermes, la suya. Lo que no esté aquí no está acordado,
> y lo que esté aquí no se cambia sin subir la versión.
>
> **Cambios de v1 a v2** — cuatro estados en vez de seis (`consultando` y
> `redactando` pasan a ser *detalle*, no estado); orden garantizado por
> conversación; una sola conversación en vuelo por `session_key`; métricas
> partidas entre lo que mide cada lado.

---

## Por qué hace falta

Hoy `hermes_chat` solo sabe dos cosas de un mensaje: `respondido = false` o
`respondido = true`. Entre una y otra puede haber dos minutos, y en ese hueco
la pantalla no distingue tres situaciones que se ven igual:

- Hermes está consultando el catálogo y va bien
- Hermes falló y no lo va a intentar más
- Hermes nunca recibió el mensaje

Y `hermes.chat_responder()` inserta sin comprobar nada:

```sql
INSERT INTO hermes_chat (…) VALUES (…, 'hermes', …);
UPDATE hermes_chat SET respondido = true WHERE id = p_mensaje_id;
```

Dos llamadas con el mismo `p_mensaje_id` —un reintento, un timeout, una
reconexión— producen **dos burbujas**. No es teórico: pasa cada vez que el
plugin reintenta.

---

## 1. Estados

Cuatro. Ni uno más.

```
pendiente ──▶ procesando ──▶ respondido
                  │
                  └────────▶ error ──(reintento)──▶ procesando
```

| Estado | Quién lo pone | Significa |
|---|---|---|
| `pendiente` | MotoFlow | Guardado y anunciado. Nadie lo ha tomado. |
| `procesando` | Hermes | Tomado y en curso. **Exclusivo**: ver §3. |
| `respondido` | Hermes | Terminado. **Terminal.** |
| `error` | Hermes | Falló. Reintentable hasta 3 veces. |

**En qué anda** no es un estado, es `estado_detalle`: un texto libre que
Hermes actualiza sin cambiar de estado —*"consultando el catálogo"*,
*"redactando"*— y que la pantalla muestra tal cual. Máximo 120 caracteres.

Que sea detalle y no estado importa: un estado nuevo obliga a las dos partes
a ponerse de acuerdo; un detalle nuevo lo inventa Hermes cuando quiera y la
pantalla lo enseña sin saber qué es.

**Reglas que la base hace cumplir:**

1. `respondido` es definitivo. Nada lo saca de ahí. De aquí sale la
   idempotencia: si nada puede salir de ese estado, nada se responde dos veces.
2. `error` → `procesando` es el único salto atrás, y sube `intentos`.
3. `pendiente` → `respondido` directo se rechaza: hay que tomarlo primero.

```sql
hermes.chat_estado(p_mensaje_id bigint, p_detalle text) RETURNS json
```

Actualiza solo el detalle, sin tocar el estado. Devuelve
`{ok, estado, detalle}`. Si la transición no fuera legal **no falla**:
devuelve `cambiado: false`. Un plugin que avisa dos veces de lo mismo no
debe reventar.

---

## 2. Marcas de tiempo y métricas

| Columna | La pone | Cuándo |
|---|---|---|
| `creado_en` | MotoFlow | El `INSERT`. Ya existe. |
| `recibido_en` | Hermes | Cuando acusa recibo del `NOTIFY`. |
| `procesando_en` | Hermes | Cuando lo toma con `chat_tomar()`. |
| `respondido_en` | Hermes | Al responder. |
| `error_en` | Hermes | Al fallar. |
| `intentos` | la base | Sube sola en cada toma. |

### Quién puede medir qué

Esto no lo decidimos: lo decide dónde ocurre cada cosa.

| Métrica | La mide | Cómo |
|---|---|---|
| `tiempo_en_cola` | MotoFlow | `procesando_en − creado_en` |
| `tiempo_de_entrega` | MotoFlow | `respondido_en − procesando_en` |
| `cantidad_de_reintentos` | MotoFlow | `intentos` |
| `tiempo_de_modelo` | **Hermes** | Solo él sabe cuánto pensó |
| `tiempo_de_herramientas` | **Hermes** | Solo él sabe cuánto ejecutó |

Las dos últimas MotoFlow **no las puede calcular**: desde fuera, pensar y
ejecutar son el mismo silencio. Hermes las reporta:

```sql
hermes.chat_medir(p_mensaje_id bigint, p_metricas jsonb) RETURNS json
-- { "ms_modelo": 4200, "ms_herramientas": 900, "llamadas_herramienta": 2 }
```

Función aparte a propósito: añadirle un parámetro a `chat_responder` haría
ambigua la llamada de tres argumentos que ya usas.

Consulta agregada:

```sql
SELECT * FROM hermes.chat_metricas(p_desde timestamptz DEFAULT now() - interval '1 day');
```

Mediana y p95 de cada tramo, tasa de error, reintentos. Sin esto, "va lento"
es una opinión.

> Medido el 2026-08-12, antes de este contrato:
> cola ~3-5 s · total 20 s / 63 s / +128 s · la base 851 ms.

---

## 3. Orden y exclusión — una conversación a la vez

**La regla:** para un mismo `session_key` nunca hay más de un mensaje en
`procesando`. Los siguientes esperan, en orden de llegada.

Sin esto, dos mensajes seguidos —*"cotízame la careta"* y *"y el
guardalodo"*— se procesan en paralelo, terminan en desorden y la segunda
respuesta contesta a la primera pregunta.

### `hermes.chat_tomar(p_limite integer DEFAULT 1)`

La operación de tomar trabajo. **Reemplaza a `chat_pendientes()` para el
trabajo real**; `chat_pendientes()` se queda como consulta de solo lectura,
para mirar la cola sin tocarla.

Devuelve las mismas columnas que `chat_pendientes()` más `session_key`,
`estado` e `intentos`, y en el mismo acto marca lo devuelto como
`procesando`, sella `procesando_en` y sube `intentos`.

Garantiza cuatro cosas **atómicamente**:

1. **FIFO por conversación** — el más antiguo pendiente de cada sesión.
2. **Una sesión, un mensaje** — salta las sesiones que ya tienen algo en
   `procesando`.
3. **Un mensaje, un worker** — `FOR UPDATE SKIP LOCKED`. Dos workers que
   llamen a la vez reciben mensajes distintos, nunca el mismo.
4. **Aislamiento por tenant** — solo la empresa de la sesión.

```sql
-- El corazón, para que se vea que no es promesa sino mecanismo:
SELECT c.*
FROM public.hermes_chat c
WHERE c.rol = 'usuario'
  AND c.estado = 'pendiente'
  AND c.intentos < 3
  AND NOT EXISTS (
        SELECT 1 FROM public.hermes_chat o
        WHERE o.session_key = c.session_key
          AND o.estado = 'procesando'
          AND o.tomado_hace < interval '5 minutes'
      )
ORDER BY c.creado_en
FOR UPDATE SKIP LOCKED
LIMIT p_limite;
```

### El worker que se muere

**Esto no está en tu especificación y sin ello el canal se atasca solo.**

Si un worker toma un mensaje y el proceso muere —OOM, reinicio, caída del
contenedor— ese mensaje se queda en `procesando` para siempre, y con la regla
de exclusión **esa conversación no vuelve a avanzar nunca**. Silenciosamente.

No es hipotético: al gateway de Hermes ya lo mató el sistema por falta de
memoria una vez, con 873 MB de swap en uso.

Por eso `procesando` tiene **arrendamiento de 5 minutos**. Pasado ese tiempo
sin respuesta, el mensaje vuelve a ser tomable y sube `intentos`. Cinco
minutos es holgado —la peor respuesta medida fue de dos— y evita que dos
workers trabajen a la vez sobre algo que aún está vivo.

Un mensaje que agota **3 intentos** sale de la cola: no se arregla a la
cuarta, y reintentar para siempre es como se llena un disco. Queda visible en
la pantalla como error, con su motivo.

---

## 4. Idempotencia

### La restricción que lo impide de raíz

```sql
CREATE UNIQUE INDEX hermes_chat_una_respuesta
  ON public.hermes_chat (tenant_id, responde_a)
  WHERE rol = 'hermes' AND responde_a IS NOT NULL;
```

No es una comprobación dentro de una función: es la base la que hace
imposible que existan dos respuestas al mismo mensaje. Aunque dos procesos
llamen en el mismo milisegundo, uno rebota.

### `hermes.chat_responder(p_mensaje_id, p_texto [, p_acciones])`

Misma firma. Cambia el comportamiento:

1. Si el mensaje ya está `respondido`, **no inserta** y devuelve
   `{ok: true, duplicado: true, respuesta_id: <la que ya existe>}`.
   **No lanza excepción.** Un reintento no es un error del plugin.
2. Si no, inserta con `responde_a = p_mensaje_id`, pone `respondido` y sella
   `respondido_en`.
3. Todo en **una transacción**: no puede existir respuesta sin que el
   mensaje quede cerrado, ni al revés.
4. La validación de códigos de `preparar_venta` **se mantiene tal cual**: un
   código inventado rebota mientras Hermes todavía puede corregirlo.

### `hermes.chat_error(p_mensaje_id, p_error)`

Pone `error`, sella `error_en`, guarda `ultimo_error` y **no** marca
`respondido`: sigue en la cola hasta agotar intentos.

`ultimo_error` **se conserva aunque el reintento funcione**. Si algo falló y
luego salió bien, eso hay que poder verlo después.

---

## 5. `session_key`

Cadena que agrupa los mensajes de una conversación. **La genera MotoFlow.**

- Se crea al abrir el chat y vive en `localStorage`.
- Sobrevive a recargas y a cerrar y abrir el panel.
- Se renueva al pulsar *"nueva conversación"* o tras **6 horas** de silencio.
- Formato `s-<uuid v4>`. Opaco: nadie deduce nada de su contenido.
- Pertenece a un `tenant_id`. Cruzarlo se rechaza. No es negociable.

---

## 6. `pantalla` — contexto estructurado

Forma fija. Nunca `null`; como mínimo `{}`.

```json
{
  "ruta": "ventas/factura",
  "modulo": "ventas",
  "registro_id": "FT-0012",
  "filtros": { "desde": "2026-08-01", "estado": "pendiente" },
  "seleccion": { "codigo": "52JK0442", "linea": 3 }
}
```

**Qué es y qué no es.** Dice **dónde está parado el usuario**. No es la
fuente de datos del negocio. Que `seleccion` venga vacío significa que no hay
nada seleccionado, **no** que el dato no exista.

> Esto ya costó una tarde: Hermes leía `datos: null` y contestaba *"MotoFlow
> no me ha enviado los datos"*, mientras por su WebUI —sin este contexto—
> consultaba la base y acertaba. No le faltaba contexto: le sobraba, mal
> entendido.

**Candidatos.** Si la pregunta pide precio o existencia, MotoFlow adjunta lo
ya consultado:

```json
{ "candidatos": [
    { "codigo": "784401", "descripcion": "ACEITE MOTUL 7100 4T 10W-40",
      "marca": "MOTUL", "precio": 1000.00, "existencia": 57,
      "ubicacion": "ALMACEN" } ] }
```

Datos reales, del instante del envío. Se pueden citar sin volver a consultar.
Ordenados por encaje: el primero no siempre es el bueno, elige Hermes. Si
ninguno encaja, que lo diga y busque con `hermes.buscar_producto()`.

**Techo: 8 KB.** `filtros` y `seleccion` van recortados a lo que se ve, no a
todo lo que la pantalla tiene en memoria.

---

## 7. El aviso — `NOTIFY hermes_chat`

Mínimo. Postgres corta el payload en 8000 bytes y **la conexión se cae
entera** si se pasa; no es sitio para datos.

```json
{ "id": 123, "tenant_id": "0000…0001",
  "session_key": "s-1f2c…", "texto": "tenemos motul 7100" }
```

`texto` recortado a 300 caracteres, solo para priorizar sin ir a la base.
Lo demás se lee con `chat_tomar()`.

El aviso sale **dentro de la misma transacción** que el `INSERT`: si se
deshace, no hay aviso. Nunca se anuncia un mensaje que no existe.

**El aviso es una cortesía, no el mecanismo.** Si el plugin se pierde un
`NOTIFY` —reconexión, reinicio— debe llamar a `chat_tomar()` igual al
arrancar. La cola es la verdad; el aviso solo evita esperar.

---

## 8. Eventos que la pantalla escucha

Supabase Realtime sobre `public.hermes_chat`:

| Evento | Filtro | Qué hace la pantalla |
|---|---|---|
| `INSERT` | `rol=eq.hermes` | Pinta la respuesta. |
| `UPDATE` | `rol=eq.usuario` | Actualiza el estado **en la misma burbuja**. |

**La segunda hoy no existe**, y es la causa de las burbujas duplicadas: la
pantalla solo escucha `INSERT`, así que cualquier señal de progreso tenía que
llegar como mensaje nuevo. Con `UPDATE`, el progreso muta la burbuja puesta.

Con más de 20 segundos en `procesando` la pantalla muestra **"Hermes sigue
trabajando…"** con el `estado_detalle`, y **no cierra la conversación**. El
sondeo cada 4 segundos se queda como red de seguridad, no como camino.

---

## 9. Acciones y cotizaciones

Lo que viene en `acciones` es una **propuesta**. Nunca se ejecuta sola.

| `estado` | Significa |
|---|---|
| `propuesta` | Hermes lo sugiere. La pantalla lo enseña y **espera**. |
| `confirmada` | La persona pulsó confirmar. Solo ahora se toca algo. |
| `descartada` | Dijo que no. |
| `caducada` | 15 minutos sin decidir. |

Preparar una pantalla con líneas cargadas **no** es definitivo: nadie facturó
nada y todo es reversible. Facturar, cobrar, descontar inventario o
escribirle a un cliente **sí**, y esos exigen confirmación de una persona.

La cotización tiene vida propia, fuera del chat:

```
borrador ──▶ pendiente_confirmacion ──▶ confirmada
    │                  │
    └──────────────────┴──────────────▶ cancelada
```

Borrar una conversación no puede llevarse por delante una cotización
confirmada. Se enlazan por id, no se mezclan.

---

## 10. Lo que NO cambia

Misma firma, mismo comportamiento. El plugin no necesita tocarlas:

```sql
hermes.chat_pendientes(p_limite)          -- ahora es solo consulta
hermes.chat_responder(id, texto [, acciones])
hermes.chat_marcar_atendidos(ids[])
hermes.latido(detalle)
hermes.buscar_producto(texto, limite [, incluir_inactivos])
hermes.catalogo_resumen()
```

`chat_pendientes()` gana columnas en su salida (`session_key`, `estado`,
`intentos`) pero **no pierde ninguna** ni cambia el orden. Un plugin que lea
por nombre no se entera.

Cambia su papel: **mirar la cola, no tomarla**. Para trabajar, `chat_tomar()`.
Si el plugin sigue usando `chat_pendientes()` para procesar, funcionará —
pero sin exclusión: dos workers podrán agarrar el mismo mensaje.

`hermes_readonly` sigue siendo de solo lectura por defecto:

```sql
BEGIN; SET TRANSACTION READ WRITE; SELECT hermes.chat_tomar(1); …; COMMIT;
```

---

## 11. Pruebas que deben pasar

| # | Caso | Qué debe ocurrir |
|---|---|---|
| 1 | `chat_responder` dos veces, mismo id | Una burbuja. La segunda: `duplicado: true`. |
| 2 | Dos workers a la vez | Reciben mensajes distintos. Nunca el mismo. |
| 3 | Dos mensajes seguidos, misma sesión | Se procesan **en orden**. El segundo espera. |
| 4 | Dos sesiones a la vez | Avanzan en paralelo sin estorbarse. |
| 5 | Worker muere en `procesando` | A los 5 min vuelve a la cola, `intentos` +1. |
| 6 | Tres errores seguidos | Sale de la cola. Visible con su motivo. |
| 7 | Hermes se reconecta a mitad | Llama a `chat_tomar()` y termina. No duplica. |
| 8 | Respuesta a los 3 minutos | Llega y se pinta. Sin aviso de caída encima. |
| 9 | Cerrar y reabrir la pantalla | Misma sesión, historial entero, estados correctos. |
| 10 | Cotización sin confirmar | No se factura. A los 15 min, `caducada`. |
| 11 | Mensaje de otro tenant | Rechazado. Nunca se cruza. |
| 12 | `pantalla` de 20 KB | Recortado a 8 KB. El mensaje llega igual. |
| 13 | `NOTIFY` con texto larguísimo | Recortado a 300. La conexión no se cae. |
| 14 | `NOTIFY` perdido | `chat_tomar()` al arrancar lo recoge igual. |

---

## 12. Quién hace qué

**MotoFlow:** columnas y marcas de tiempo, índice único, `chat_tomar()` con
FIFO y exclusión, arrendamiento de 5 minutos, `chat_estado()`,
`chat_error()`, `chat_medir()`, `chat_metricas()`, idempotencia de
`chat_responder()`, `session_key`, `pantalla` estructurado, suscripción a
`UPDATE`, estados visibles, *"Hermes sigue trabajando…"*, y las 14 pruebas.

**Hermes:** usar `chat_tomar()` en vez de `chat_pendientes()`, acusar recibo,
actualizar `estado_detalle` en cada paso, `buscar_producto()` obligatorio
para precio y existencia, ruta rápida para catálogo y agente completo para
cotizaciones, no responder dos veces, reportar `chat_medir()`, y llamar a
`chat_tomar()` al arrancar por si se perdió un aviso.

**La frontera:** MotoFlow no interpreta lo que Hermes dice; Hermes no escribe
en las tablas del negocio. Lo único que cruza es esta tabla y estas funciones.
