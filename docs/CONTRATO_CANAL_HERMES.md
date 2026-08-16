# Contrato del canal MotoFlow ↔ Hermes

> **Versión 4** · 2026-08-12 · Estados, eventos, idempotencia, orden,
> conversación compartida entre canales, fencing y corte de contexto.
>
> Esto es lo que **las dos partes** pueden dar por cierto. MotoFlow cumple su
> mitad; el plugin de Hermes, la suya. Lo que no esté aquí no está acordado,
> y lo que esté aquí no se cambia sin subir la versión.
>
> **v1 → v2** — cuatro estados en vez de seis (`consultando` y `redactando`
> pasan a ser *detalle*); orden garantizado por conversación; una sola
> conversación en vuelo; métricas partidas entre lo que mide cada lado.
>
> **v2 → v3** — `conversation_key` pasa a llamarse `conversation_key` y deja de
> ser de MotoFlow: la comparten WebUI, MotoFlow y WhatsApp. Se añade el
> origen real de cada mensaje (§13), que nunca se falsifica.
>
> **v3 → v4** — el arrendamiento deja de ser implícito: cada toma reparte un
> `claim_token` y un `lease_until` que se puede renovar (§14). Y la
> conversación gana épocas: `conversation_key` sigue siendo una sola para
> siempre, y "Nueva conversación" avanza un `context_epoch` (§15).
> **Las firmas de v3 siguen funcionando**; las nuevas son sobrecargas de una
> aridad más.

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

**La regla:** para un mismo `conversation_key` nunca hay más de un mensaje en
`procesando`. Los siguientes esperan, en orden de llegada.

Sin esto, dos mensajes seguidos —*"cotízame la careta"* y *"y el
guardalodo"*— se procesan en paralelo, terminan en desorden y la segunda
respuesta contesta a la primera pregunta.

### `hermes.chat_tomar(p_limite integer DEFAULT 1)`

La operación de tomar trabajo. **Reemplaza a `chat_pendientes()` para el
trabajo real**; `chat_pendientes()` se queda como consulta de solo lectura,
para mirar la cola sin tocarla.

Devuelve las mismas columnas que `chat_pendientes()` más `conversation_key`,
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
        WHERE o.conversation_key = c.conversation_key
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

## 5. `conversation_key`

Cadena que agrupa los mensajes de una conversación. **No es de MotoFlow**:
la comparten los tres canales. Ver §13.

Para Repuestos Morla:

```
agent:main:morla:tenant:00000000-0000-0000-0000-000000000001
```

- Es **fija por tenant**, no por sesión de navegador. Sobrevive a recargas,
  a cerrar el panel, a cambiar de dispositivo y a cambiar de canal.
- Pertenece a un `tenant_id`, y ese tenant va dentro de la propia clave.
  Cruzarlo se rechaza. No es negociable.
- Opaca para quien la consume: se compara, no se interpreta.

*"Nueva conversación"* deja de significar clave nueva y pasa a significar
**corte de contexto**: se marca un hito en la conversación compartida y
Hermes deja de arrastrar lo anterior. La clave no cambia; lo que cambia es
desde dónde lee. Un botón de la pantalla no puede partir en dos una
conversación que también está viva en WhatsApp.

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
  "conversation_key": "agent:main:morla:tenant:0000…0001",
  "origin_platform": "motoflow",
  "texto": "tenemos motul 7100" }
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
nada y todo es reversible. Descontar inventario o escribirle a un cliente
**sí**, y esos exigen confirmación de una persona.

### 9.1 Órdenes de pantalla: `preparar_venta` y `cobrar_venta`

*(2026-08-16 — cambia lo que decía este documento sobre facturar.)*

`acciones` acepta **un objeto o un arreglo**. El arreglo importa: preparar y
cobrar tienen que poder ir en el MISMO mensaje. Partirlo en dos vueltas mete
un turno de conversación entremedio, y ese turno es justo donde un agente se
pierde y acaba facturando la cotización de otro cliente. Pasó, con capturas.

```jsonc
[
  { "tipo": "preparar_venta",
    "cotizacion": "CT-000089" },          // o "lineas": [{codigo, cantidad}]
  { "tipo": "cobrar_venta",
    "forma_pago": "EFECTIVO",
    "recibido": 50 }                       // obligatorio si es EFECTIVO
]
```

Se atienden **en fila**, en el orden en que llegan: la pantalla no empieza una
hasta terminar la anterior. Sin eso, preparar —que es asíncrono— terminaba
después de cobrar y le borraba el monto recibido.

> **`cobrar_venta` GRABA E IMPRIME, sin confirmación aparte.** El dueño lo
> pidió así el 16/08: *"cuando yo le dé el monto, graba la factura y que se
> imprima. Quiero ese ciclo completo."*
>
> No se salta ningún control: **no escribe en la base**, pulsa F10 en la
> pantalla que ya está a la vista. Pasa por lo mismo que si lo pulsara una
> persona — existencia, bloqueo de venta bajo costo, crédito del cliente,
> "monto insuficiente", NCF e impresión. Lo único que cambia es quién pulsa.
>
> La confirmación es el momento en que la persona dice con cuánto le pagan.
> No hay un segundo "¿seguro?".

Reglas que valen para Hermes igual que para Jarvis:

- El número de cotización sale de `buscar_cotizacion`, **nunca de memoria**.
  Hay cientos y acertar el de otro cliente factura la mercancía equivocada.
- Mandar la orden **no es** haberla grabado. Grabar ocurre en la pantalla y
  puede fallar ahí. No digas que está hecha, ni digas totales ni cambios: no
  los sabes.

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

`chat_pendientes()` gana columnas en su salida (`conversation_key`, `estado`,
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
| 15 | WebUI → MotoFlow | Lo hablado allá se sabe aquí. Mismo `conversation_key`. |
| 16 | MotoFlow → WhatsApp | Igual al revés. El origen de cada uno se conserva. |
| 17 | WhatsApp → WebUI | Igual. Ninguno aparece como si fuera de otro canal. |
| 18 | Dos canales a la vez | Se procesan en orden, uno espera. Nunca en paralelo. |
| 19 | Gateway reiniciado | Retoma la conversación entera, no empieza de cero. |
| 20 | WhatsApp de otro número | Rechazado, aunque comparta tenant. Ni entra ni contamina. |
| 21 | Cliente del CRM escribe | Va al CRM de ventas. **Nunca** a la conversación del agente. |
| 22 | Arrendamiento vencido | Vuelve a la cola **con un `claim_token` nuevo**. El viejo deja de valer. |
| 23 | `chat_renovar()` a tiempo | Estira el arrendamiento. La cola ya no lo rescata. |
| 24 | Worker antiguo escribe | Rechazado en `chat_estado`, `chat_error` y `chat_responder`. No toca nada. |
| 25 | Dos workers vivos | Tokens distintos. Solo uno vale a la vez. |
| 26 | Responde tras vencer, sin relevo | **Se acepta**, con `lease_vencido: true`. Ver §14. |
| 27 | "Nueva conversación" ×4 | Una sola época nueva. Idempotente. |
| 28 | Corte de contexto | `conversation_key` **no cambia**. La respuesta se queda en la época de su pregunta. |

Las 1 a 21 están en `sql/hermes_canal_v3_pruebas.sql`; las 22 a 28 en
`sql/hermes_canal_v4_pruebas.sql`. Las dos son una sola sentencia que termina
lanzando el informe como excepción, así que **no dejan ni una fila**. La nº 2
necesita dos conexiones de verdad y vive aparte, en
`npm run hermes:concurrencia`.

---

## 13. Una conversación, tres canales

Elvido le habla a Hermes desde la WebUI, desde MotoFlow y desde su WhatsApp.
Es **una sola conversación**: lo que preguntó en el mostrador debe seguir
sabiéndolo cuando siga desde el teléfono.

### Dónde vive el historial

**En Hermes, no en MotoFlow.** `hermes_chat` es el transporte de MotoFlow, no
el almacén de las tres plataformas. MotoFlow no guarda —ni ve— los mensajes
de WhatsApp ni los de la WebUI.

Al revés estaría mal: MotoFlow tendría que escribir en su tabla mensajes que
no ocurrieron en MotoFlow, y eso es exactamente falsificar el origen.

Lo que MotoFlow aporta son dos cosas: **a qué conversación pertenece** su
mensaje, y **de dónde viene de verdad**.

### El origen, que nunca se falsifica

Tres columnas nuevas, y su regla:

| Columna | Valor desde MotoFlow |
|---|---|
| `origin_platform` | `motoflow` — siempre, sin excepción |
| `origin_chat_id` | El `user_id` de quien escribe |
| `origin_message_id` | El `id` de esta misma fila |

`conversation_key` responde *"¿de qué venimos hablando?"*. El origen responde
*"¿por dónde le contesto?"*. **Son cosas distintas y no se deducen una de la
otra**: dos mensajes de la misma conversación pueden llegar por canales
distintos con un minuto de diferencia.

Un mensaje escrito en MotoFlow lleva `origin_platform = 'motoflow'` aunque
Hermes lo conteste teniendo en la cabeza lo que se habló por WhatsApp. La
respuesta vuelve por donde entró la pregunta.

### La cola es de la conversación, no del canal

La exclusión de §3 pasa a ser por `conversation_key`. Y como la clave es una
sola para todo Morla, **la consecuencia hay que decirla clara**: si Elvido
pregunta algo por WhatsApp, un mensaje suyo en MotoFlow espera turno.

Es lo correcto. Una persona con tres pantallas sigue siendo una persona, y
dos turnos simultáneos de la misma conversación se pisarían el contexto. Pero
conviene saberlo antes de que pase, no cuando parezca que MotoFlow se colgó.

### El número autorizado

Solo **+1 809-390-5965** puede entrar en esta conversación por WhatsApp.

Y aquí hay un riesgo que hay que nombrar, porque las dos cosas se llaman
"WhatsApp" y no son la misma: **MotoFlow ya recibe WhatsApp de clientes** por
`whatsapp-crm-webhook`, y ese tráfico va al CRM de ventas. No tiene nada que
ver con esta conversación y **no debe rozarla nunca**.

- La conversación del agente es **una persona** —el dueño— desde tres sitios.
- El CRM son **cientos de clientes** escribiendo a la tienda.

Compartir `tenant_id` no autoriza a nadie. Un mensaje de otro número no entra
aunque sea del mismo tenant, aunque sea de un empleado, aunque el CRM ya lo
tenga registrado. La autorización es por número, y la lista tiene un elemento.

### Reparto

| | MotoFlow | Hermes |
|---|---|---|
| Emitir `conversation_key` | ✓ | |
| Declarar el origen real | ✓ | |
| Campo en `MessageEvent` | | ✓ |
| Sesión del gateway por `conversation_key` | | ✓ |
| Historial unificado de los 3 canales | | ✓ |
| Cola y lock por conversación | ✓ *(en su tabla)* | ✓ *(entre canales)* |
| Autorización del número de WhatsApp | | ✓ |
| Responder por el canal de origen | | ✓ |

El lock aparece en las dos columnas y no es duplicado: MotoFlow garantiza el
orden de **sus** mensajes en `hermes_chat`; Hermes garantiza que no corran dos
turnos de la misma conversación **vengan del canal que vengan**. El de
MotoFlow solo, sin el de Hermes, no impide que un mensaje de WhatsApp entre a
la vez.

---

## 14. Fencing — quién tiene el mensaje ahora

En v3 el arrendamiento existía pero era **anónimo**: a los cinco minutos el
mensaje volvía a la cola y otro worker lo tomaba, y el primero no se enteraba.
Si el primero seguía vivo —lento, no muerto— podía escribir igual. Nada se lo
impedía.

El daño no es teórico. El peor caso no es la respuesta duplicada, que el
índice único ya para: es `chat_error()`. El worker viejo cree que falló,
devuelve el mensaje a `pendiente`, y a partir de ahí la cola cree que está
libre mientras un worker vivo lo tiene en la mano.

### Las dos columnas

| Columna | Qué es |
|---|---|
| `claim_token` | `uuid` nuevo **en cada toma**. Identifica al dueño actual. |
| `lease_until` | Hasta cuándo vale ese claim. `now() + 5 min` al tomarlo. |

`chat_tomar()` las devuelve. **Guárdalas junto al mensaje**: sin el token no
se puede usar ninguna de las funciones nuevas.

### La regla, en una frase

> **Manda el token, no el reloj.**

- **El token coincide** → es tuyo. Se acepta **aunque el arrendamiento haya
  vencido**: si nadie te lo quitó, tu respuesta sigue siendo la buena.
  `chat_responder()` la acepta y añade `lease_vencido: true` para que quede en
  los registros.
- **El token no coincide** → otro se hizo cargo. Se rechaza sin escribir nada
  y la respuesta trae `abandonar: true`. Para de trabajar en ese mensaje.

Rechazar por reloj tiraría a la basura respuestas correctas por llegar tarde
—dejando al cliente sin nada para castigar a un worker por ser lento—.
Rechazar por identidad no tira ninguna.

### Las funciones

```sql
-- Renovar antes de que venza. Devuelve restan_segundos.
SELECT hermes.chat_renovar(<id>, '<claim_token>');

-- Reportar progreso Y renovar de paso: decir en qué andas es prueba de vida.
SELECT hermes.chat_estado(<id>, 'consultando el catálogo', '<claim_token>');

-- Fallar y responder, con fencing.
SELECT hermes.chat_error(<id>, '<error>', '<claim_token>');
SELECT hermes.chat_responder(<id>, '<texto>', <acciones>, '<claim_token>');

-- Cuánto dura un arrendamiento, por si cambia.
SELECT hermes.chat_lease();     -- interval '5 minutes'
```

`chat_estado()` **con token renueva**; la de dos argumentos no, porque sin
token no hay forma de saber quién habla. En la práctica, un worker que reporta
cada pocos segundos nunca pierde su claim.

### Motivos de rechazo

| `motivo` | Qué hacer |
|---|---|
| `claim_reemplazado` | **Parar.** Otro worker lo tiene. |
| `ya_respondido` | Parar. Ya está contestado. |
| `no_esta_en_proceso` | Parar. El mensaje volvió a la cola; se retomará solo. |
| `claim_ya_liberado` | Nada. Suele ser tu propio `chat_error()` repetido. |
| `inexistente` | Id equivocado o de otro tenant. |

Los que hay que obedecer traen `abandonar: true`. Con mirar ese campo basta;
el `motivo` es para los registros.

Y el orden en que se comprueban no es casual: **primero el estado, después el
token**. Al revés, un mensaje que ya volvió a la cola —y que por eso tiene el
`claim_token` en `NULL`— se reportaría como `claim_reemplazado`, mandando a
buscar un worker rival que no existe.

### Las firmas viejas siguen valiendo

`chat_estado(id, detalle)`, `chat_error(id, error)` y
`chat_responder(id, texto, acciones)` funcionan igual que en v3, **sin
fencing**. Se puede migrar función por función.

Y una advertencia para quien toque este SQL: **las sobrecargas nuevas no
llevan `DEFAULT` en el token, a propósito**. Con un `DEFAULT NULL`, una
llamada de tres argumentos encajaría a la vez en la vieja y en la nueva, y
Postgres responde `42725: is not unique`. Es la misma mina que v3 desactivó al
borrar `chat_responder(bigint, text)`. Sin `DEFAULT`, cada aridad tiene una
sola candidata.

---

## 15. Corte de contexto — "Nueva conversación"

`conversation_key` es **fija por tenant y no cambia nunca**. Es lo que
mantiene unidas la WebUI, MotoFlow y el WhatsApp autorizado (§13). Si el botón
"Nueva conversación" emitiera una clave nueva, partiría en dos una
conversación que también está viva en otros dos canales — y nadie pidió eso.

Lo que avanza es `context_epoch`.

| | Antes del corte | Después |
|---|---|---|
| `conversation_key` | `agent:main:morla:tenant:0000…0001` | **la misma** |
| `context_epoch` | 3 | 4 |
| Los mensajes viejos | están | **siguen estando** |

**No se borra nada.** La historia entera se conserva en `hermes_chat` con su
texto y su hora. Lo único que cambia es qué tramo se le da de contexto al
modelo.

### Dónde vive la época

En `public.hermes_conversaciones` — una fila por conversación. Hace falta una
tabla y no basta con `max(context_epoch)` de los mensajes: justo después de un
corte **no hay ningún mensaje** en la época nueva.

### Idempotente sin ventana de tiempo

```sql
SELECT public.hermes_nuevo_contexto();          -- desde la pantalla
SELECT hermes.chat_nuevo_contexto('<clave>');   -- desde Hermes
SELECT hermes.chat_contexto('<clave>');         -- mirar sin cortar
```

**Cortar un contexto que ya está vacío no hace nada.** Pulsar el botón cinco
veces seguidas deja una sola época nueva, porque después del primer corte no
queda ningún mensaje que archivar. No hay ventana de segundos que ajustar ni
que documentar: la condición es el estado, no el reloj.

La respuesta trae `cortado: true|false` y la época resultante.

Dos cortes de verdad simultáneos tampoco avanzan dos épocas: la fila de la
conversación se toma con `FOR UPDATE` antes de decidir.

### Quién sella la época

**El trigger, no las funciones.** Cualquier fila que entre en `hermes_chat`
sin `context_epoch` sale sellada con la época actual de su conversación — da
igual que venga de `hermes_escribir()`, de `chat_responder()`, de SQL a mano o
del canal que se conecte mañana. Nadie tiene que acordarse.

La única excepción es deliberada: **`chat_responder()` manda la época de la
pregunta**. Una respuesta pertenece al tramo en el que se preguntó, aunque
entre medias alguien haya pulsado el botón. Si no, aparecería sola en el tramo
nuevo, sin la pregunta que la explica.

### Lo que el corte NO hace

- **No vacía la cola.** Un mensaje que estaba pendiente sigue pendiente y se
  contesta. Era una pregunta de verdad que alguien hizo.
- **No corta a los demás.** Cada conversación tiene su época.
- **No toca el claim en vuelo.** Se puede cortar mientras Hermes piensa; el
  worker termina su mensaje con normalidad.

### Lo que Hermes tiene que hacer con esto

`chat_tomar()` devuelve `context_epoch` en cada mensaje. **Al construir el
contexto del modelo, incluir solo los mensajes de esa misma época.** Eso es
todo: la clave de sesión del gateway sigue siendo `conversation_key`, sin
tocar.

---

## 12. Quién hace qué

**MotoFlow:** columnas y marcas de tiempo, índice único, `chat_tomar()` con
FIFO y exclusión, arrendamiento de 5 minutos, `claim_token` y `lease_until`,
`chat_renovar()`, fencing en `chat_estado()` / `chat_error()` /
`chat_responder()`, `chat_medir()`, `chat_metricas()`, idempotencia de
`chat_responder()`, emitir `conversation_key` y el origen real, sellar
`context_epoch` por trigger, `hermes_nuevo_contexto()`, `pantalla`
estructurado, suscripción a `UPDATE`, estados visibles, *"Hermes sigue
trabajando…"*, y las pruebas 1 a 14 y 21 a 28.

**Hermes:** `conversation_key` en `MessageEvent`, sesión del gateway por esa
clave, historial unificado de los tres canales, lock entre canales,
autorización del número de WhatsApp, responder por el canal de origen, usar
`chat_tomar()` en vez de `chat_pendientes()`, guardar el `claim_token` y
mandarlo en cada escritura, renovar antes de que venza, parar cuando le digan
`abandonar: true`, filtrar el contexto del modelo por `context_epoch`, acusar
recibo, actualizar `estado_detalle` en cada paso, `buscar_producto()`
obligatorio para precio y existencia, ruta rápida para catálogo y agente
completo para cotizaciones, no responder dos veces, reportar `chat_medir()`,
llamar a `chat_tomar()` al arrancar, y las pruebas 15 a 20.

**La frontera:** MotoFlow no interpreta lo que Hermes dice; Hermes no escribe
en las tablas del negocio. Lo único que cruza es esta tabla y estas funciones.
