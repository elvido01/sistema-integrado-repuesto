# YouTube: cómo pedir la auditoría de Google (y dejar la cuenta lista)

Preparado el 29/09/2026. El dueño hace los pasos en las consolas de Google con su cuenta;
aquí está todo el texto para copiar y pegar. Estado de partida: MotoFlow ya sube Shorts
**en privado** al canal `repuestos_morla` (`UCpzCEh9wP212K8p8QP_YvFQ`); prueba hecha:
Short `macsyw1zJ1U`.

Hay **cuatro pasos, en este orden**. El 1 es urgente aunque no se pida la auditoría.

---

## Paso 1 — Comprobar el estado de la pantalla de consentimiento (URGENTE, 2 minutos)

Si la app de Google está en modo **"Testing" (Prueba)**, el permiso del canal **caduca a los
7 días** y MotoFlow deja de poder subir sin avisar.

1. Entra a https://console.cloud.google.com/ con la cuenta donde se creó la credencial
   «MotoFlow Equipo IA — YouTube».
2. Arriba, elige ese proyecto.
3. Menú → **APIs y servicios → Pantalla de consentimiento de OAuth** (o "Google Auth Platform → Público").
4. Mira **Estado de publicación**:
   - Si dice **"En producción"**: bien, sigue al paso 2.
   - Si dice **"Prueba"** (Testing): pulsa **"Publicar la aplicación"** → Confirmar.
     Luego, en MotoFlow → Equipo IA, pulsa **Conectar YouTube** otra vez (el permiso que se
     dio en modo prueba caduca igual). Al conectar puede salir "Google no verificó esta app":
     pulsa *Configuración avanzada → Ir a MotoFlow*. Es normal hasta pasar la verificación.

Anota aquí el **número de proyecto** (Menú → Descripción general / Configuración del proyecto);
lo pide el formulario del paso 4: `________________`

---

## Paso 2 — Poner al día la política de privacidad (Google Sites)

Edita https://sites.google.com/view/motoflow-privacidad/inicio y **añade esta sección**
(en español y en inglés; Google revisa en inglés). Cambia la fecha de "Last updated".

> ### YouTube y Google
> MotoFlow usa los **YouTube API Services** para que una empresa suba sus propios videos
> promocionales (YouTube Shorts) a su propio canal, cuando el dueño de la empresa lo aprueba.
> Al conectar YouTube, MotoFlow solicita dos permisos: subir videos (`youtube.upload`) y leer
> la identidad del canal (`youtube.readonly`), solo para saber a qué canal subir.
>
> Datos que se guardan: el identificador y nombre del canal, y el permiso de acceso emitido por
> Google, guardado en nuestros servidores (Supabase) y nunca expuesto al navegador. No leemos
> ni guardamos videos, comentarios ni datos de otros usuarios de YouTube. No compartimos estos
> datos con terceros ni los usamos para publicidad.
>
> Al usar esta función aceptas los **Términos de Servicio de YouTube**
> (https://www.youtube.com/t/terms). Google trata los datos según la **Política de Privacidad
> de Google** (https://policies.google.com/privacy).
>
> Puedes retirar el acceso de MotoFlow a tu cuenta en cualquier momento desde
> https://myaccount.google.com/permissions (o https://security.google.com/settings/security/permissions).
> Si lo pides a elvidocaminero@gmail.com, borramos el permiso guardado y los datos del canal
> en un máximo de 7 días.

> ### YouTube and Google (English)
> MotoFlow uses **YouTube API Services** so that a business can upload its own promotional
> videos (YouTube Shorts) to its own channel, after the business owner approves each one.
> When connecting YouTube, MotoFlow requests two permissions: upload videos (`youtube.upload`)
> and read the channel identity (`youtube.readonly`), only to know which channel to upload to.
>
> Data we store: the channel ID and name, and the access grant issued by Google, kept on our
> servers (Supabase) and never exposed to the browser. We do not read or store videos,
> comments or data of other YouTube users. We do not share this data with third parties or use
> it for advertising.
>
> By using this feature you agree to be bound by the **YouTube Terms of Service**
> (https://www.youtube.com/t/terms). Google handles data under the **Google Privacy Policy**
> (https://policies.google.com/privacy).
>
> You can revoke MotoFlow's access at any time at
> https://security.google.com/settings/security/permissions. On request to
> elvidocaminero@gmail.com we delete the stored grant and channel data within 7 days.

**Términos de servicio:** Google pide también un enlace a unos términos. Lo más simple es una
página nueva en el mismo Google Site ("Términos") con:

> Al usar las funciones de YouTube de MotoFlow aceptas los Términos de Servicio de YouTube
> (https://www.youtube.com/t/terms). MotoFlow solo publica contenido de la empresa en su propio
> canal y con aprobación del dueño. / By using MotoFlow's YouTube features you agree to the
> YouTube Terms of Service (https://www.youtube.com/t/terms). MotoFlow only publishes the
> business's own content to its own channel, with the owner's approval.

---

## Paso 3 — Grabar el video de demostración (3–5 minutos, con el celular o la pantalla)

Google pide ver la app funcionando. Graba la pantalla (Windows: tecla **Win + G** o **Win + Alt + R**)
mostrando, en este orden:

1. `https://repuestos-morla.pages.dev` → Equipo IA.
2. Pulsar **Conectar YouTube**: la ventana de Google con los dos permisos (se tiene que ver
   el nombre de la app y los permisos que pide), y aceptar.
3. De vuelta en Equipo IA: YouTube aparece como "Conectado · publicación pendiente".
4. Una promoción del paso 1 al 3: elegir la pieza, aprobar la imagen, ver el video vertical.
5. Abrir YouTube Studio y enseñar el Short `macsyw1zJ1U` en privado.
6. (Opcional) enseñar https://myaccount.google.com/permissions con MotoFlow en la lista.

Súbelo a YouTube como **No listado** y guarda el enlace: `________________`

---

## Paso 4 — Enviar el formulario de auditoría

Formulario: **YouTube API Services – Audit and Quota Extension Form**
https://support.google.com/youtube/contact/yt_api_form

Respuestas para copiar (en inglés, que es como lo revisan):

| Pregunta | Respuesta |
|---|---|
| Organization / company name | Repuestos Morla (MotoFlow) |
| Organization website | https://repuestos-morla.pages.dev |
| Contact email | elvidocaminero@gmail.com |
| Google Cloud project number | *(el del paso 1)* |
| API client / app name | MotoFlow Equipo IA |
| Reason for the request | Audit (to lift the private-only restriction on uploads). Quota extension: not needed. |
| Who uses the API client | Internal: only our own business, uploading to our own channel. |
| Channel(s) | https://www.youtube.com/channel/UCpzCEh9wP212K8p8QP_YvFQ |
| Privacy policy URL | https://sites.google.com/view/motoflow-privacidad/inicio |
| Terms of service URL | *(la página "Términos" del paso 2)* |
| Demo video | *(el enlace no listado del paso 3)* |

**Descripción del uso (pegar en "Describe your use case"):**

> MotoFlow is the internal management system of Repuestos Morla, an auto-parts store in the
> Dominican Republic. Its marketing module prepares a promotion for one product (image,
> vertical video and text) and, only after the business owner reviews and approves it,
> publishes it to the business's own social accounts. For YouTube, it uploads a short vertical
> video (YouTube Short) to our own channel using videos.insert with a resumable upload.
>
> Scopes: youtube.upload (to upload our Shorts) and youtube.readonly (only to identify our own
> channel after OAuth). We do not access other channels, comments, analytics or any data from
> other YouTube users.
>
> Data handling: the OAuth grant is stored server-side (Supabase, never sent to the browser)
> and refreshed with the refresh token; we store only the channel ID and name. Users can revoke
> access at https://security.google.com/settings/security/permissions and we delete stored data
> on request. Our privacy policy references YouTube API Services, the Google Privacy Policy and
> the YouTube Terms of Service.
>
> Every upload is approved by a person; nothing is published automatically. Expected volume:
> 1–3 Shorts per day. We request the audit so our approved uploads can be public instead of
> being locked as private.

---

## Paso 5 — Cuando Google apruebe (lo hago yo, con tu orden)

1. Tú me confirmas el correo de aprobación.
2. Yo: ajusto el publicador para que pida `public` (hoy pide privado a propósito), pruebo con
   un Short y lo compruebo por fuera.
3. Tú decides habilitar la cuenta de YouTube en MotoFlow; yo la habilito y lo verificamos con
   una promoción real.

**Mientras tanto:** MotoFlow puede subir los Shorts en privado y tú los haces públicos a mano
desde la app de YouTube Studio (Contenido → el video → Visibilidad → Público). Es un toque por
video y no necesita la auditoría.
