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

## 5. Lo que tienes que hacer tú, paso a paso

Nada de esto lo puedo hacer yo: hace falta una persona delante del diálogo de
cada plataforma.

### 5.1 · Meta — destraba 4 de los 6 destinos (30 minutos)

El token de la página **no vence**; lo que vence es el *acceso a datos*, y Meta
lo corta a los 60 días de la última vez que una persona autorizó la app. Ese
contador **solo se reinicia con un humano delante**.

1. Entra a <https://developers.facebook.com/tools/explorer>.
2. Arriba a la derecha, elige la app **MotoFlow CRM**.
3. En *Permissions*, marca — además de los que ya estén marcados, no quites
   ninguno, que el CRM los usa:
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_posts`        ← publicar en el feed y en la historia
   - `pages_manage_engagement`
   - `instagram_basic`
   - `instagram_content_publish` ← publicar en Instagram
4. **Generate Access Token** y acepta el diálogo de Facebook. Ese clic es el
   que reinicia los 60 días.
5. Cambia el desplegable de *User Token* a **Page Token** → **Repuestos
   Morla** → copia el token entero.
6. En la PC del sistema:

   ```bash
   npm run meta:token -- EAAG...elTokenCompleto
   ```

   No lo guarda a ciegas: comprueba que sea de la app correcta, que alcance la
   página y la cuenta de Instagram, y te dice qué permisos ganas o pierdes.
   Escribe en las cuatro filas donde vive el token — incluida la del
   publicador.
7. Comprueba:

   ```bash
   node scripts/social-estado.mjs
   ```

   Facebook e Instagram tienen que decir **"Token vivo"** y **"PUEDE
   PUBLICAR"**. Ese comando además escribe el resultado en la base, y es lo
   que hace que el módulo deje de marcar esos destinos como *sin autorizar*.

> Si Meta no te deja marcar `instagram_content_publish`, es que ese permiso
> necesita pasar por App Review (Acceso Avanzado). Avísame antes de pedirlo:
> es una solicitud formal a Meta y no la mando yo por mi cuenta.

### 5.2 · TikTok — semanas, porque hay auditoría de por medio

1. En la app de TikTok: *Configuración → Cuenta → Cambiar a cuenta Business*.
2. Regístrate en <https://developers.tiktok.com> y crea una app.
3. Añádele el producto **Content Posting API** y pide el scope
   `video.publish`.
4. Graba el video de demostración que exigen: tiene que verse el flujo entero,
   desde que se elige el contenido hasta que se publica.
5. Manda la app a **auditoría** (Direct Post).

Hasta que la aprueben, todo lo que suba la API queda **en privado**: no es un
fallo nuestro, es su regla para apps sin auditar.

### 5.3 · YouTube — igual, auditoría de Google

1. En Google Cloud Console, habilita **YouTube Data API v3** en el proyecto.
2. *Pantalla de consentimiento de OAuth* → externa → añade el scope
   `https://www.googleapis.com/auth/youtube.upload`.
3. Crea un **ID de cliente de OAuth** y pásamelo (el *client secret* lo guardo
   del lado servidor, nunca en el navegador).
4. Manda el proyecto a **verificación**. Sin ella, `videos.insert` sube los
   videos **siempre en privado**.

El cupo, para que lo tengas: **100 subidas al día**.

### 5.4 · Lo de Google Vision, que sigue abierto

Del arreglo de ayer: el OCR de facturas está funcionando **por el camino de
respaldo** (Gemini lee la imagen). Para que vuelva Vision, que lee mejor una
factura fotografiada, hay que reactivar la facturación del proyecto
**48355204741**:
<https://console.developers.google.com/billing/enable?project=48355204741>.
Con 25 facturas al mes estás muy por debajo de las 1,000 gratis.

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

## 8. Lo que está construido y lo que falta

**Construido y en producción (27/09/2026):**

- La cola de promociones sobre el motor que ya existía: una promoción es un
  `publication_bundle_id` con un trabajo **por red** —así cada una lleva su
  propio texto— y seis destinos con estado, id y enlace propios.
- Seis RPCs (`promo_crear`, `promo_confirmar_existencia`, `promo_aprobar`,
  `promo_programar`, `promo_reintentar`, `promo_panel`), todas con la empresa
  resuelta por `get_user_tenant()` y exigiendo dueño o administrador, con
  auditoría de quién hizo qué en `publicacion_auditoria`.
- El disparador que impide **republicar un destino confirmado** o reescribirle
  el id.
- `scripts/social-estado.mjs`: le pregunta a cada plataforma y **escribe la
  respuesta** en `social_accounts.publicacion_habilitada`. Una red sin eso no
  se programa.
- Los adaptadores por red (`supabase/functions/_shared/adaptadores.mjs`) con
  el token en la cabecera y nunca en la URL, y TikTok/YouTube marcados como
  *sin autorizar* — no pueden devolver un id, así que no pueden aparecer como
  publicados.
- El formulario en Equipo IA, con la confirmación de existencia a mano y el
  aviso de precio mientras se escribe.
- **Pruebas**: 11 comprobaciones del simulacro SQL (corre contra producción y
  se borra sola) y 13 pruebas de los adaptadores en vitest. 505 pruebas en
  total, todas verdes.

**Falta:**

- El trabajador que saca de la cola y llama a los adaptadores. No se ha escrito
  a propósito: con las cuatro redes caídas no hay forma de probarlo de verdad,
  y un publicador que nunca publicó no es un publicador. Se escribe el día que
  Meta vuelva.
- Los adaptadores de TikTok y YouTube de verdad, cuando pasen sus auditorías.
- Las métricas por publicación (`social_posts` ya se llena solo desde el motor).
