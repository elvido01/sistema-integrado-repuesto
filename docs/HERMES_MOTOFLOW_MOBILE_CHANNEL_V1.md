# Canal móvil de MotoFlow ↔ Hermes — v1 (contrato v5.1)

> **Estado: MotoFlow móvil listo; adaptación del canal Hermes pendiente.**
> Nada de aquí describe algo que Hermes ya haga.

| | |
|---|---|
| Contrato | **v5.1** — aditivo sobre v5, que es aditivo sobre v4 |
| Migración | `sql/hermes_movil_v5_1.sql` — **aplicada en producción 13/08/2026** |
| Pruebas | `sql/hermes_movil_v5_1_pruebas.sql` — **20/20 en verde en producción** |
| App | Expo SDK 54 · expo-router · `mobile/app/hermes/index.tsx` |
| Conversación | `agent:main:morla:tenant:00000000-…-0001` — **la misma de siempre** |

---

## 1. La decisión de transporte, y por qué

**Se reutiliza `motoflow`. No hay un transporte `motoflow-mobile`.**

La cola ya separaba bien: `origin_platform` dice por dónde entró y
`origin_chat_id` a dónde se contesta. Lo único que faltaba era saber **qué
interfaz** lo mandó, y eso es un campo, no una plataforma.

```
origin_platform = 'motoflow'   el transporte      (NO cambia)
source_surface  = 'mobile'     la interfaz concreta
client_platform = 'android' | 'ios'
device_id       = identificador del teléfono
app_version     = versión de la app
```

Un segundo adaptador obligaría a Hermes a mantener dos rutas de entrega
para la misma empresa, la misma conversación y el mismo destino.

**Para Hermes esto significa: si hoy contestas a `origin_platform='motoflow'`,
ya contestas al móvil.** `source_surface` solo sirve para adaptar el formato
(un teléfono agradece respuestas más cortas), nunca para decidir el destino.

---

## 2. Arquitectura

```
APP (Expo)                 SUPABASE                        HERMES
──────────                 ────────                        ──────
cola local (AsyncStorage)
  client_message_id
      │
      ├─ upload ──────────► bucket privado
      │                     hermes-voz | hermes-medios
      ├─ hermes_voz_registrar
      ├─ hermes_medio_registrar ──► hermes_media
      │
      └─ hermes_movil_escribir ───► hermes_chat
                                    source_surface='mobile'
                                    NOTIFY hermes_chat ───────┐
                                                              ▼
                                    hermes.chat_tomar_v5(1) ◄─ reclama
                                       claim_token + un media_token
                                       POR CADA adjunto
                                                              │
                              Edge hermes-media/descargar ◄───┤
                                                              │ STT / visión
                              hermes.chat_transcripcion ◄─────┤
                              Edge hermes-media/tts     ◄─────┤
                              hermes.chat_responder_voz ◄─────┘
                                       │
  Realtime + sondeo ◄──────────────────┘
  hermes_movil_historial
```

**El teléfono nunca habla con PostgreSQL ni con Hermes.** Habla con PostgREST
con la sesión del usuario y la anon key (pública por diseño). Toda escritura
pasa por RPC `SECURITY DEFINER`; toda lectura, por RLS.

---

## 3. Lo que cambió en `chat_tomar_v5`

**Cambió el tipo de retorno.** Se pudo porque v5 se aplicó el mismo día y su
lado Hermes todavía no existía — esa ventana ya se cerró.

Se añaden al final:

```sql
source_surface text, client_platform text, device_id text,
app_version text, client_message_id text,
medios jsonb          -- TODOS los adjuntos, no solo el primero
```

`medios` es un array; cada elemento:

```json
{
  "media_id": "…", "media_kind": "image|voice|document",
  "mime_type": "image/jpeg", "codec": null,
  "size_bytes": 412334, "duration_ms": null,
  "width": 1200, "height": 900,
  "sha256": "…", "bucket": "hermes-medios",
  "storage_path": "…", "nombre": "factura agosto.pdf",
  "media_token": "…"
}
```

> **Un `media_token` POR ADJUNTO.** El token va atado al `media_id`, no al
> mensaje: con seis fotos hacen falta seis. Todos derivan del mismo
> `claim_token`, así que reclamar de nuevo los invalida a todos.

Las columnas `media_id`/`mime_type`/… de v5 siguen ahí, apuntando al **primer**
adjunto. Un consumidor v5 que las lea sigue funcionando.

**`hermes.chat_tomar(integer)` de v4 no se tocó.**

---

## 4. Firmas exactas

```sql
-- Reclamar (LO QUE TIENES QUE LLAMAR)
hermes.chat_tomar_v5(p_limite integer DEFAULT 1) RETURNS TABLE (…, medios jsonb)

-- Sin cambios respecto a v5
hermes.chat_transcripcion(bigint, uuid, text, text DEFAULT 'ok')
hermes.chat_responder_voz(bigint, text, jsonb, uuid, uuid DEFAULT NULL, text DEFAULT NULL)
hermes.chat_media_registrar(bigint, uuid, text, text, bigint, integer, text, text, jsonb)
hermes.media_canjear(text)          -- ahora devuelve también `bucket` y `media_kind`
hermes.chat_capacidades()

-- Sin cambios, v4
hermes.chat_tomar(integer) · chat_renovar · chat_estado · chat_error
hermes.chat_responder · chat_nuevo_contexto · chat_contexto · chat_pendientes
```

Del lado de la app (no las llama Hermes):
`hermes_movil_escribir` · `hermes_movil_historial` · `hermes_medio_registrar` ·
`hermes_voz_registrar` · `hermes_dispositivo_registrar` · `hermes_dispositivo_revocar`

---

## 5. Cómo obtener los adjuntos

```http
GET https://<proyecto>.functions.supabase.co/hermes-media/descargar
Authorization: Bearer <SUPABASE_ANON_KEY>
X-Media-Token: <media_token del adjunto>
```

Devuelve **los bytes**, con `Content-Type`, `X-Media-Id` y `X-Sha256`. La Edge
Function comprueba la firma de formato antes de entregarlos.

> Sin `Authorization` la plataforma corta con `401` **antes** de llegar al
> código, y el cuerpo no explica nada.

Errores: `403 token_vencido` (10 min) · `403 token_agotado` (3 usos) ·
`404` · `422 firma_invalida`.

---

## 6. Checklist para el desarrollador de Hermes

- [ ] **Identificar la superficie**: `source_surface = 'mobile'`. Úsalo para
      ajustar el formato (respuestas más cortas), **no** para el destino.
- [ ] `chat_tomar(1)` → `chat_tomar_v5(1)`.
- [ ] `message_type = 'text'` → comportarse **exactamente** como hoy;
      `medios` viene `[]`.
- [ ] **`MessageType.IMAGE`**: `medios[].media_kind = 'image'`. Descargar cada
      uno con su `media_token`, `media_urls = [rutas temporales]`,
      `media_types = [mime_type]`. El pie de foto es `texto`.
- [ ] **`MessageType.VOICE`**: `media_kind = 'voice'`. STT y después
      `chat_transcripcion(...)`. Si sale vacía, estado `vacia` — **no inventes**.
- [ ] **`MessageType.DOCUMENT`**: `media_kind = 'document'`. Usa `nombre` para
      enseñarlo; **nunca** `storage_path`.
- [ ] **Validar el MIME de verdad**: compara el `sha256` del archivo bajado
      con el de la fila y comprueba la cabecera. No te fíes de la extensión.
- [ ] **Renovar el lease** con `chat_renovar` durante descarga, STT, visión,
      modelo y TTS. Son 5 minutos y seis fotos tardan.
- [ ] **Conservar `conversation_key` y `context_epoch`.** El móvil es una
      superficie, no una conversación aparte.
- [ ] Responder con `chat_responder_voz(...)`; sin `p_media_id` si no hay TTS.
- [ ] Ante `abandonar: true` en **cualquier** respuesta: parar, no responder,
      no subir nada.

---

## 7. Idempotencia y offline

| situación | qué pasa |
|---|---|
| La app reintenta el mismo mensaje | `client_message_id` tiene índice único: devuelve el mismo `id`, `duplicado: true` |
| Se reintenta con un archivo ya subido | Mismo `sha256` → mismo `media_id` |
| Se intenta reusar un archivo ya enviado | **Se rechaza**: un adjunto pertenece a un mensaje |
| Dos teléfonos del mismo usuario | Dos `device_id`, misma conversación, ambos ven todo |
| Sin red | Cola local persistente; 3 intentos con espera creciente y después botón manual |

**La app nunca da por entregado hasta que el servidor confirma.** Lo pendiente
se ve como «Sin enviar».

---

## 8. Notificaciones push — estado real

La tabla `hermes_dispositivos` y las RPC de registro/revocación **están
aplicadas y probadas**. Un token de push vive en **un solo** dispositivo (al
reinstalar se suelta del anterior) y cerrar sesión lo revoca.

> **Lo que NO está: el envío.** Falta la Edge Function que despache a Expo
> Push cuando Hermes responde, y las credenciales FCM/APNs del proyecto. La
> app registra el dispositivo pero **todavía no recibe avisos**.

Contenido acordado para cuando se implemente — sin precios, clientes ni
transcripciones en pantalla bloqueada:

```
Hermes respondió
Toque para abrir MotoFlow
```

---

## 9. Seguridad

1. Buckets **privados**: `hermes-voz` (audio, 8 MB) y `hermes-medios`
   (imagen/documento, 25 MB). Separados a propósito: subir el tope del audio
   al del documento dejaría pasar una «nota de voz» de 20 MB.
2. Lista **blanca** de MIME. Ejecutables fuera — probado.
3. Aislamiento por tenant en tres capas: política de `storage.objects`,
   revalidación en la RPC y RLS de `hermes_media`.
4. Nombres generados por el servidor (el hash). El nombre visible se sanea
   **en la base**, no en el teléfono.
5. URLs firmadas de 300 s, generadas al abrir. Nunca persistidas.
6. `hermes_movil_historial` **no devuelve** `claim_token`, `lease_until` ni
   nada interno — probado.
7. En la app no hay ninguna credencial de servicio ni de Hermes.

---

## 10. Aprobaciones

Sin cambios y a propósito. Una orden hablada **no** ejecuta nada: las
operaciones importantes siguen pasando por `equipo_aprobaciones` y su control
autenticado.

> Un monto hablado se oye mal: «catorce mil» y «cuarenta mil» se parecen
> demasiado para aprobarlos de oído.

La publicación automática sigue deshabilitada.

---

## 11. Tres agentes

Hermes (orquestador) · Jarvis (MotoFlow) · Comercial-Creativo.

Voz, imágenes, documentos y notificaciones son **capacidades del canal**. No
se creó un agente móvil, ni de voz, ni de imágenes, ni de notificaciones. La
prueba `hermesMovil.test.js` lo fija: `AGENTES` tiene exactamente tres, y el
usuario no está entre ellos.

---

## 12. Rollback

`sql/hermes_movil_v5_1_revertir.sql` (con freno de mano). Se pierden imágenes y
documentos; **el texto de la conversación no**. `chat_tomar_v5` vuelve a su
forma de v5 y v4 nunca se toca.

---

## 13. Límites conocidos

- **Push sin envío.** Registro sí, despacho no (faltan credenciales).
- **Sin `NetInfo`.** El estado «Sin conexión» se deduce de que fallen los
  envíos, no del sistema. La cola funciona igual.
- **Sin cargas reanudables.** Un archivo cortado a la mitad se reintenta
  entero; el `sha256` evita duplicarlo.
- **Audio en m4a/aac**, no Opus: es lo que traen Android e iOS de fábrica.
  Opus obligaría a un módulo nativo y no compensa para 2 minutos.
- **Sin compresión de imagen propia** más allá del `quality: 0.7` del picker.
- **iOS sin compilar**: no hay macOS en este entorno.
