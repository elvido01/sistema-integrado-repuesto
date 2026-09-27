# Equipo IA → publicador propio (sin Metricool)

Auditoría del 27/09/2026 antes de tocar nada, tal como se pidió. Todo lo que
sigue está comprobado contra producción o contra la documentación oficial
vigente; lo que es suposición se dice que lo es.

---

## 1. Estado real de conexión, red por red

`social_accounts.status` decía `connected` en Facebook e Instagram. **No es
cierto.** La prueba se hace con la herramienta nueva:

```bash
node scripts/social-estado.mjs      # no publica nada: solo pregunta
```

| Red | Lo que dice la tabla | Lo que contesta la plataforma |
|---|---|---|
| Facebook | `connected` desde 26/05/2026 | **Token muerto**: "Session has expired on Tuesday, 11-Aug-26" |
| Instagram | `connected` desde 26/05/2026 | **Token muerto**, mismo vencimiento |
| TikTok | `manual` desde 25/09/2026 | **Sin token**: nunca se conectó por API |
| YouTube | `manual` desde 06/09/2026 | **Sin token**: nunca se conectó por API |

El token del CRM (`sales_channels`, otra fila, otro sitio) está muerto desde la
misma fecha — lo confirma `npm run meta:estado`. O sea: **hoy no se puede
publicar en ninguna de las cuatro redes por API**, y por eso todo sigue pasando
por Metricool.

`social_account_secrets` tiene RLS activo y **cero políticas**: los tokens solo
los ve la service role key. Eso está bien y se queda así.

---

## 2. Los dos agujeros de `publish-design` — corregidos (v5, desplegada)

Los dos que se sospechaban eran reales, y había un tercero:

1. **Aceptaba `tenant_id` del body sin mirar quién llamaba.** La función usa la
   service role key, que no tiene RLS: cualquier usuario con sesión —de
   cualquier empresa— podía publicar en la página de Facebook de Repuestos
   Morla mandando su `tenant_id`. Ahora la empresa sale de `get_user_tenant()`
   **con el token del usuario** (la empresa ACTIVA, no `profiles.tenant_id`), y
   el `tenant_id` del body solo se acepta si coincide.
2. **Marcaba `status='publicado'` aunque fallara un canal.** El update corría
   pase lo que pase. Ahora el estado solo sube si salieron TODOS los canales
   pedidos; si alguno falla, el diseño se queda como estaba, la respuesta baja a
   HTTP 207 y en `metadata.last_publish.fallaron` queda escrito cuál falló.
3. **No tenía CORS ni manejaba OPTIONS** — contestaba 405 al preflight, así que
   desde el navegador probablemente nunca llegó a ejecutarse.

De paso: el token ya no viaja en la URL (acababa en los registros de Meta y en
los nuestros) sino en la cabecera `Authorization`; se guarda **quién** mandó a
publicar; y `getAccount` usa `limit(1)` en vez de `maybeSingle()`, que reventaba
si la empresa tenía dos páginas conectadas.

Lo que sigue sin tener: idempotencia, reintentos, programación, historias,
video, y verificación posterior. Eso es el módulo nuevo, no un parche.

---

## 3. Lo que ya existe y sirve como cimiento

No hay que inventar el modelo de datos: está casi todo.

- **`hermes_publication_jobs`** — una promoción: producto, diseño, texto,
  `approval_status`/`approved_by`/`approved_at`, `idempotency_key`,
  `scheduled_for`, `media_*`, `channel_config`, `attempt_count`, `claimed_by`.
- **`hermes_publication_targets`** — un destino: `platform` + `placement`
  (feed/story), `status`, `provider_job_id`, `external_post_id`,
  `external_url`, `error_message`, `attempt_count`, `next_retry_at`,
  `last_checked_at`, `published_at`. **Ya es una fila por formato y por red,
  con id y enlace independientes** — justo lo que se pide.
- **Estados en uso hoy**: jobs en `draft`/`failed`/`partially_published`/
  `published`; targets en `draft`/`failed`/`published`/`awaiting_confirmation`.
  Faltan `PROGRAMADO` y `PUBLICANDO`.
- **Dos cron cada minuto**: `hermes.renotify_pending_publication_jobs()` y
  `hermes.supervise_publications()`. El supervisor ya existe.
- **`EquipoIAPage.jsx`** ya lee `hermes_publication_targets` y `social_posts`,
  ya tiene `PUBLICACIONES_RECIENTES = 3` y "ver anteriores".
- 26 targets y 13 jobs reales, todos de Repuestos Morla
  (`00000000-0000-0000-0000-000000000001`).

Aviso: **`hermes-publication-bridge` está desplegada (v3) y no existe en el
repo.** Vive solo en el VPS, como los `.py` de Hermes. Antes de apoyarse en
ella hay que traerla al repositorio o sustituirla.

---

## 4. El muro de cada plataforma (documentación oficial, 27/09/2026)

Esto no se arregla con código:

| Red | Qué permite hoy | Qué hace falta |
|---|---|---|
| **Facebook feed** | Publicar foto en `/{page}/photos` | Permisos `pages_manage_posts` + `pages_manage_engagement` y **reconectar el token** |
| **Facebook historia** | `/{page}/photo_stories` y `/video_stories` | Lo mismo. Ya hubo historias publicadas, así que el camino funciona |
| **Instagram feed e historia** | Contenedor + `media_publish`, hasta 100 al día | `instagram_business_content_publish`, cuenta profesional ligada a la página, y **reconectar** |
| **TikTok** | Content Posting API, scope `video.publish` | **Auditoría de TikTok.** Sin ella, *"all content posted by unaudited clients will be restricted to private viewing mode"*. Además faltan cuenta Business y cuenta de desarrollador |
| **YouTube Short** | `videos.insert`, scope `youtube.upload` | **Auditoría de Google.** Los proyectos no verificados suben **siempre en privado**. Cupo: 100 subidas/día |

Traducción: aunque mañana mismo se conecten los cuatro tokens, **TikTok y
YouTube solo podrían publicar en privado** hasta pasar sus auditorías. El módulo
no puede marcarlos como publicados; tiene que decir exactamente eso.

---

## 5. Lo que tienes que hacer tú (nadie más puede)

1. **Reconectar Meta.** Es lo único que desbloquea las cuatro publicaciones de
   Facebook e Instagram. Al reconectar hay que conceder `pages_manage_posts`,
   `pages_manage_engagement` e `instagram_business_content_publish`. Si eso
   añade algún permiso que hoy no tienes concedido, dime antes: no lo pido yo.
2. **TikTok**: cuenta Business + cuenta de desarrollador + el video de demo, y
   enviar la app a auditoría del Content Posting API.
3. **YouTube**: OAuth del canal (scope `youtube.upload`) y enviar el proyecto a
   la auditoría de Google para que los videos dejen de subir en privado.

Mientras 2 y 3 no pasen, el módulo queda funcionando para los destinos
autorizados y esos dos se muestran como lo que son: **sin autorizar**.

---

## 6. Plan por fases

Lo que se puede construir con las redes caídas (todo menos publicar de verdad):

- **Fase 1 — Base segura.** Formulario de promoción en Equipo IA: producto
  (precio leído de MotoFlow, **con confirmación de existencia física escrita a
  mano**, nunca deducida de la cifra), archivos de feed/historia/video, texto
  por red, vista previa, aprobación humana y hora en `America/Santo_Domingo`.
  El precio va en el texto, nunca encima del arte.
- **Fase 2 — Adaptadores.** Uno por plataforma, API oficial, tokens solo del
  lado servidor, cada uno devolviendo id + enlace + error propios. Nada de
  cookies, Selenium ni navegadores.
- **Fase 3 — Cola y verificación.** Una orden por formato/red,
  `idempotency_key`, ejecución programada, reintentos con tope y consulta
  posterior al proveedor. **Nunca republicar un destino que ya tenga id o URL.**
  Estados: `BORRADOR`, `APROBADO`, `PROGRAMADO`, `PUBLICANDO`, `PUBLICADO`,
  `FALLÓ`, `SIN CONFIRMAR`.
- **Fase 4 — Panel.** Tres promociones recientes por defecto, detalle por
  destino, reintento solo de los fallidos, métricas disponibles **sin convertir
  en cero lo que falta**.

Las migraciones serán aditivas (los estados nuevos entran como valores, no
reemplazando). Las pruebas automáticas se hacen contra un adaptador de mentira
(aprobación, programación, token vencido, fallo parcial, reintento,
idempotencia), que además es la única forma de probar hoy con los tokens
muertos.

---

## 7. Prueba de extremo a extremo (cuando haya token)

1. `node scripts/social-estado.mjs` → las cuatro redes tienen que decir qué
   pueden hacer. Si Facebook o Instagram dicen "token muerto", se para aquí.
2. Crear una promoción de prueba con un **producto inventado**, nunca el Motul
   ni nada real, y una imagen de prueba.
3. Aprobar y programar a 10 minutos. Comprobar que los seis destinos quedan en
   `PROGRAMADO` y que TikTok y YouTube aparecen como sin autorizar.
4. Esperar la hora. Los destinos autorizados pasan a `PUBLICANDO` y luego a
   `PUBLICADO` con id y enlace; abrir cada enlace.
5. Volver a darle a publicar: **no debe crear nada** (idempotencia).
6. Forzar un fallo (token de una red revocado a propósito) y comprobar que ese
   destino queda `FALLÓ`, que los demás siguen publicados, y que el reintento
   solo toca el fallido.
7. Borrar la publicación de prueba de cada red a mano.

---

## 8. Lo que NO se ha hecho todavía

Todo lo de las fases 1 a 4. Esta entrega es la auditoría, la herramienta que
prueba el estado de conexión y el cierre de los agujeros de `publish-design`.
Construir el publicador encima de cuatro tokens muertos sería construir sobre
arena: el primer paso es reconectar Meta.
