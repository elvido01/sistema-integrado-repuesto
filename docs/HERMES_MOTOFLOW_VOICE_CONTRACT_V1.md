# Contrato de voz MotoFlow ↔ Hermes — v1 (canal v5)

> **Estado: MotoFlow listo; adaptación Hermes pendiente.**
> Nada de este documento describe algo que Hermes ya haga. Describe lo que
> MotoFlow ya expone y espera.

| | |
|---|---|
| Contrato | **v5** (aditivo sobre v4, que **no se tocó**) |
| Migración | `sql/hermes_voz_v5.sql` — **aplicada en producción el 13/08/2026** |
| Pruebas | `sql/hermes_voz_v5_pruebas.sql` — **28/28 en verde en producción, 13/08/2026** |
| Reversa | `sql/hermes_voz_v5_revertir.sql` (con freno de mano) |
| Endpoint de medios | Edge Function `hermes-media` — **desplegada y respondiendo** |
| Conversación | `agent:main:morla:tenant:00000000-0000-0000-0000-000000000001` — **la misma de siempre** |

---

## 1. Lo que cambió, en una frase

Hasta ahora el micrófono de MotoFlow **nunca mandaba audio**: `SpeechRecognition`
transcribía en el navegador y lo que llegaba a `hermes_chat` era texto. Hermes
recibía texto y no tenía forma de saber que alguien había hablado.

Ahora el audio se sube a un bucket privado y el mensaje entra a la **misma
conversación** con `message_type = 'voice'`. Quien transcribe es el STT de
Hermes, que es el único que oye el archivo.

---

## 2. Arquitectura

```
NAVEGADOR                      BASE / STORAGE                 HERMES
─────────                      ──────────────                 ──────
MediaRecorder
   │ webm/opus
   ├──── upload ──────────────► bucket privado hermes-voz
   │                            {tenant}/{yyyy-mm}/{hash}.webm
   │
   ├──── hermes_voz_registrar ─► hermes_media   (valida MIME/tamaño/duración)
   │                                            devuelve media_id
   │
   └──── hermes_escribir_voz ──► hermes_chat    message_type='voice'
                                 NOTIFY hermes_chat ──────────────┐
                                                                  ▼
                                 hermes.chat_tomar_v5(1) ◄─── reclama
                                    │ devuelve claim_token
                                    │ y media_token (una sola vez)
                                                                  │
                                 Edge hermes-media/descargar ◄────┤ GET + token
                                    │ valida permiso y firma       │
                                    └──── bytes del audio ────────►┤
                                                                  │ STT
                                 hermes.chat_transcripcion ◄──────┤
                                                                  │ agente
                                 Edge hermes-media/tts    ◄───────┤ POST audio
                                    │ sube y registra              │
                                    └──── media_id ───────────────►┤
                                                                  │
                                 hermes.chat_responder_voz ◄──────┘
                                    │
   Realtime ◄────────────────────────┘  texto + media_id
   ReproductorVoz firma una URL de 300 s y suena
```

---

## 3. Tablas y columnas

### `public.hermes_chat` (columnas nuevas, ambas nullable)

| columna | tipo | notas |
|---|---|---|
| `message_type` | `text NOT NULL DEFAULT 'text'` | `text` · `voice` · `audio` · `mixed` |
| `media_id` | `uuid` | apunta a `hermes_media` |

Las 3 columnas de v3/v4 y todas las anteriores siguen exactamente igual.
Un mensaje de voz lleva `texto = '(nota de voz)'` hasta que llega la
transcripción — `texto` es `NOT NULL` desde el principio y un marcador legible
es mejor que una cadena vacía.

### `public.hermes_media`

`media_id` `tenant_id` `conversation_key` `context_epoch` `mensaje_id`
`origen` (`usuario`|`hermes`) `media_kind` `mime_type` `codec` `size_bytes`
`duration_ms` `storage_path` `sha256` `estado` `transcript`
`transcription_status` `tts_status` `interrupted` `metricas` `created_by`
`created_at` `deleted_at`

RLS: `SELECT` solo del propio tenant. **Escribir no se concede a nadie** — todo
pasa por funciones `SECURITY DEFINER`.

### `public.hermes_media_tokens`

`token_sha256` (PK) `media_id` `mensaje_id` `tenant_id` `expira_en` `usos`
`max_usos` `usado_en`.

RLS activo **sin una sola política**: ningún navegador lo lee. Del token solo
se guarda su sha256.

---

## 4. Firmas exactas

```sql
-- Reclamar (LO QUE TIENES QUE LLAMAR)
hermes.chat_tomar_v5(p_limite integer DEFAULT 1)
RETURNS TABLE (
  id bigint, texto text, pantalla jsonb, creado_en timestamptz,
  user_id uuid, usuario text, email text, rol text,
  conversation_key text, estado text, intentos smallint,
  origin_platform text, origin_chat_id text, origin_message_id text,
  claim_token uuid, lease_until timestamptz, context_epoch integer,
  message_type text, media_id uuid, media_kind text, mime_type text,
  codec text, size_bytes bigint, duration_ms integer, sha256 text,
  storage_path text, media_token text, media_token_expira timestamptz)

-- La transcripción, cuando tu STT termine
hermes.chat_transcripcion(p_mensaje_id bigint, p_claim_token uuid,
                          p_transcript text, p_estado text DEFAULT 'ok')
-- p_estado ∈ ok | vacia | error | en_curso

-- Registrar el audio TTS (lo hace la Edge Function por ti)
hermes.chat_media_registrar(p_mensaje_id bigint, p_claim_token uuid,
  p_storage_path text, p_mime_type text, p_size_bytes bigint,
  p_duration_ms integer, p_sha256 text, p_codec text DEFAULT NULL,
  p_metricas jsonb DEFAULT '{}')

-- Responder con texto y (opcionalmente) voz
hermes.chat_responder_voz(p_mensaje_id bigint, p_texto text,
  p_acciones jsonb, p_claim_token uuid,
  p_media_id uuid DEFAULT NULL, p_tts_status text DEFAULT NULL)

-- Qué sabe hacer este canal
hermes.chat_capacidades() RETURNS json
hermes.voz_limites()      RETURNS json
```

**Sin cambios (v4, siguen siendo las mismas):** `chat_tomar(integer)`,
`chat_renovar`, `chat_estado`, `chat_error`, `chat_responder`,
`chat_nuevo_contexto`, `chat_contexto`, `chat_pendientes` (solo diagnóstico).

---

## 5. Cómo obtener el audio

`chat_tomar_v5` devuelve `media_token` **una sola vez**, en claro. En la base
queda su sha256 — con la tabla en la mano no se descarga nada.

```http
GET https://<proyecto>.functions.supabase.co/hermes-media/descargar
Authorization: Bearer <SUPABASE_ANON_KEY>
X-Media-Token: <media_token>
```

> **Sin la cabecera `Authorization` la plataforma devuelve `401` antes de
> llegar al código de la función**, y el cuerpo no explica nada. La anon key
> no es un secreto (viaja en el frontend); es la puerta de la plataforma. La
> puerta de verdad es `X-Media-Token`.
>
> Comprobado contra producción el 13/08/2026:
> · sin `Authorization` → `401` de plataforma
> · con `Authorization`, sin token → `{"error":"Falta el permiso de descarga."}`
> · con token inventado → `{"error":"Permiso no válido.","motivo":"token_desconocido"}`

Respuesta `200`: **los bytes del audio**, con `Content-Type`, `X-Media-Id`,
`X-Sha256` y `X-Duration-Ms`.

No se devuelve una URL firmada: una URL se reenvía y sigue valiendo. Estos
bytes ya pasaron el control de firma de formato.

| código | qué pasó | qué hacer |
|---|---|---|
| `401` | falta el token | error de programación |
| `403` `token_vencido` | pasaron 10 min | volver a reclamar |
| `403` `token_agotado` | 3 usos | volver a reclamar |
| `404` | el audio ya no está | `chat_error` |
| `422` `firma_invalida` | el archivo no es audio | `chat_error`, no reintentar |

---

## 6. Cómo devolver la voz

```http
POST https://<proyecto>.functions.supabase.co/hermes-media/tts
Authorization: Bearer <SUPABASE_ANON_KEY>
Content-Type: audio/mpeg
X-Mensaje-Id: 12345
X-Claim-Token: <claim_token>
X-Duration-Ms: 4200

<bytes del mp3>
```

Devuelve `{ ok: true, media_id, duplicado, sha256 }`. Si el turno ya no es
tuyo devuelve `409` con `abandonar: true` — **para y no respondas**.

Después:

```sql
SELECT hermes.chat_responder_voz(12345, 'El Motul 20W50 está a RD$450.',
                                 NULL, '<claim_token>', '<media_id>');
```

**Si el TTS falló, llama igual sin `p_media_id`.** El texto es la respuesta; el
audio es una forma de oírla. Quedarse sin voz es un inconveniente; quedarse sin
respuesta es una avería.

---

## 7. Checklist para el desarrollador de Hermes

- [ ] Cambiar `chat_tomar(1)` → `chat_tomar_v5(1)`. Devuelve **todas** las
      columnas de v4 más las de voz; el resto del gateway no se toca.
- [ ] Si `message_type = 'text'`, comportarse **exactamente** como hoy.
      `media_id` viene `NULL` y no hay nada que descargar.
- [ ] Si es `voice` o `mixed`: descargar con `media_token`, comprobar que el
      `sha256` del archivo coincide con el de la fila, y construir
      `MessageType.VOICE` con `media_urls = [<bytes o fichero temporal>]` y
      `media_types = [mime_type]`.
- [ ] Ejecutar STT y llamar `chat_transcripcion(...)`. Si sale vacía, estado
      `vacia` — **no** inventes contenido.
- [ ] **Renovar el lease** con `chat_renovar(id, claim_token)` durante STT,
      modelo y TTS. El arrendamiento son 5 minutos y un turno de voz completo
      puede pasarse.
- [ ] Ejecutar el agente **con las mismas herramientas que un mensaje de
      texto**. Un precio se consulta con `hermes.buscar_producto(...)` tanto
      si la pregunta se escribió como si se dijo.
- [ ] Generar TTS solo si el modo de voz está activo. Subirlo por
      `hermes-media/tts` y responder con `chat_responder_voz`.
- [ ] Ante `abandonar: true` en **cualquier** respuesta: parar el turno, no
      responder, no subir audio.
- [ ] No cambiar `conversation_key` ni `context_epoch`. La voz es una
      modalidad, no una conversación aparte.

---

## 8. Idempotencia y fencing

| situación | qué pasa |
|---|---|
| La subida se reintenta con el mismo `sha256` | `hermes_voz_registrar` devuelve el mismo `media_id`, `duplicado: true` |
| Dos pestañas mandan el mismo audio | Un solo mensaje. `hermes_escribir_voz` devuelve `duplicado: true` |
| Dos workers reclaman a la vez | `FOR UPDATE SKIP LOCKED` + uno por conversación. El segundo no ve nada |
| Respondes con un claim viejo | `{ ok: false, motivo: 'claim_reemplazado', abandonar: true }` |
| Respondes dos veces | `duplicado: true`, una sola respuesta, el audio **no** se vuelve a colgar |
| Registras el mismo TTS dos veces | Mismo `media_id`, `duplicado: true` |
| El lease venció pero el token coincide | **Se acepta**, con `lease_vencido: true`. La identidad manda sobre el reloj |

---

## 9. Límites

`hermes.voz_limites()` es la fuente:

```
max_bytes           8 388 608   (8 MB)
max_duracion_ms     120 000     (2 minutos)
mimes               audio/webm, audio/ogg, audio/mp4, audio/mpeg,
                    audio/wav, audio/x-wav, audio/aac, audio/mp3
token_ttl_segundos  600
retencion_dias      90
```

---

## 10. Seguridad — lo que MotoFlow garantiza

1. **El bucket es privado.** No hay ninguna ruta pública.
2. **Aislamiento por tenant** en tres capas: la política de `storage.objects`
   mira la primera carpeta, `hermes_voz_registrar` la vuelve a comprobar, y la
   RLS de `hermes_media` filtra por `get_user_tenant()`.
3. **Nunca se persiste una URL firmada.** Se firman al reproducir, 300 s.
4. **El token de descarga no se guarda**, solo su sha256.
5. **El nombre del archivo lo pone el servidor** (es el hash). Nunca uno
   escrito por el usuario.
6. **El audio no aparece en ningún log.** Los errores de la Edge Function
   salen genéricos; el detalle se queda en el servidor.
7. **Jarvis y Comercial-Creativo no tienen acceso al bucket.** No se les
   concedió nada.

---

## 11. Aprobaciones — una orden hablada NO se salta nada

Sin cambios respecto a hoy, y a propósito. Una operación importante sigue
necesitando el botón de autorización en pantalla, con los datos escritos.

> **Un monto hablado se oye mal: "catorce mil" y "cuarenta mil" se parecen
> demasiado para aprobarlos de oído.**

Que una transcripción contenga "sí" **no** ejecuta nada. La aprobación por voz
queda fuera de esta versión; si algún día entra, necesita desafío explícito,
coincidencia con la operación pendiente, usuario autenticado y auditoría.

---

## 12. Los tres agentes siguen siendo tres

Hermes (orquestador) · Jarvis (MotoFlow) · Comercial-Creativo.

**La voz es una modalidad de entrada y salida, no un agente.** No se creó un
agente de voz, ni de transcripción, ni de TTS. STT y TTS son capacidades
técnicas de Hermes.

La publicación automática sigue deshabilitada.

---

## 13. Compatibilidad v4 / v5 y coexistencia

- `chat_tomar(integer)` **no se modificó**. Un gateway v4 sigue arrancando y
  reclamando de la misma cola.
- Un worker v4 que tome un mensaje de voz recibe `texto = '(nota de voz)'` y no
  ve el audio. Contestará algo genérico — degradado, pero no roto. La prueba
  28 lo comprueba.
- No se cambió el tipo de retorno de ninguna función existente. Eso es lo que
  habría roto a un consumidor en marcha.
- **v4 no se elimina en esta tarea.** Los dos contratos conviven sin fecha de
  corte; cuando Hermes migre, `chat_tomar` puede quedarse ahí sin molestar.
- Detección de capacidad: `hermes.chat_capacidades()`.

---

## 14. Rollback

`sql/hermes_voz_v5_revertir.sql`, con freno de mano (hay que borrar un bloque
a mano para que haga algo).

Se pierden los audios; **el texto de la conversación no**, incluidas las
transcripciones ya escritas. El bucket y sus archivos no se borran desde el
script: eso se hace a mano y mirando.

---

## 15. Límites conocidos

- **Barge-in completo no está.** Hablar encima corta la reproducción, marca
  `interrupted = true` y manda el turno nuevo. Lo que **no** hay es full-duplex
  real: MotoFlow no escucha mientras suena la respuesta. No se simula.
- **Safari**: graba en `audio/mp4`, que pesa más. Funciona, pero un audio de
  2 minutos se acerca más al límite.
- **`crypto.subtle` exige contexto seguro.** En `http://` plano el sha256 no se
  puede calcular y la grabación se rechaza con un mensaje explícito.
- **La duración la mide el navegador** con el reloj de pared. Un archivo
  manipulado podría declarar otra; la base valida el tope, no la exactitud.
- **La limpieza no corre sola todavía.** `hermes-media/limpiar` existe pero no
  hay cron: hay que llamarla o programarla.
