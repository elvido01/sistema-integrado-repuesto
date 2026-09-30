# Social OAuth — estado 2026-09-28

Servicio desplegado en `zdvxowpuklbypweyqqki`. No publica ni activa `publicacion_habilitada`.
El flujo existente de Equipo IA se conserva. Se añadieron únicamente dos botones de conexión.

## Contrato

- `POST /functions/v1/social-oauth/start`: JSON `{ "platform": "youtube" }` o `tiktok`, JWT del usuario y Origin autorizado.
- Comprueba la sesión con Auth y `promo_tenant_admin`; no acepta tenant_id del cliente.
- Devuelve `{url}` para abrir el consentimiento. El usuario revisa los permisos.
- Callback: `/functions/v1/social-oauth/callback/youtube` o `/tiktok`.
- State aleatorio de un uso, almacenado como hash, vence a los 10 minutos; PKCE para Google.
- Revalida la pertenencia admin al retornar. Identidad y secretos se guardan juntos.
- Retorna al origen permitido con `social_connection=connected|cancelled`. No transmite tokens al frontend.
- Conectado NO significa autorizado para publicación pública.

## Configuración pendiente

Secretos de Edge Functions (nunca VITE_ ni repositorio):
`YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `TIKTOK_CLIENT_ID` (client_key), `TIKTOK_CLIENT_SECRET`.
`SOCIAL_OAUTH_ORIGINS` es una lista explícita de orígenes HTTPS separados por coma;
el único origen predeterminado es `https://repuestos-morla.pages.dev`.
Añadir los dominios de clientes únicamente después de comprobar su control.

YouTube solicita youtube.upload + youtube.readonly para identificar el canal y comprobar publicaciones.
TikTok solicita user.info.basic + video.upload (el video va a la bandeja del dueño; video.publish exige la cuenta entera en privado sin auditoría).
Registrar los callbacks exactos en las consolas de los proveedores.

## Verificado

- 26 pruebas locales (10 OAuth y 16 de adaptadores existentes).
- Endpoint remoto: 401 sin sesión, 403 con origen ajeno y 400 con state inválido.
- Tabla social_oauth_states con RLS; anon/authenticated no pueden leer ni ejecutar el guardado.
- La advertencia de RLS sin políticas en esta tabla es intencional: solo service_role puede acceder.
- Migración aplicada mediante scripts/aplicar-sql.mjs; no registrada en historial CLI.

## Trabajo que falta (no marcar como completo)

1. Credencial web «MotoFlow Equipo IA — YouTube» creada y guardada en secretos de Supabase (28/09). API habilitada por el usuario y comprobada en consola. Scopes youtube.upload y youtube.readonly guardados. Falta consentimiento del canal y credenciales TikTok.
2. Terminar ficha y revisión de TikTok: icono, políticas actualizadas, demo auténtica y Direct Post.
3. Botones de conexión desplegados el 29/09 en https://75f2d2fc.repuestos-morla.pages.dev (producción repuestos-morla). Build y 26 tests correctos. Falta consentimiento real del usuario, verificar identidad y conectar revocación.
4. Renovación segura de tokens, adaptadores de video, persistencia de solicitudes pendientes y verificación final.
5. Controles de privacidad, contenido comercial y consentimiento exigidos por TikTok.
6. Auditoría YouTube separada de verificación OAuth; ninguna garantiza aprobación.
7. No activar cron/publicación de estas redes hasta completar pruebas y autorización explícita de contenido.

No modificar archivos dist/ ni whatsapp-quote-extension/: contienen trabajo ajeno.

## YouTube: subida real y prueba privada (29/09/2026)

- `_shared/youtube.mjs`: subida reanudable de Shorts (privado por defecto) y renovación del
  acceso con el permiso guardado; `_shared/cuentaSocial.mjs`: cuenta `connected` + acceso
  vigente, compartida por el publicador y la prueba. 15 pruebas en `tests/youtubeShort.test.js`.
- `publicar-promociones` pasa el video al destino de YouTube. Sigue sin publicar ahí mientras
  `publicacion_habilitada = false` (no se cambió).
- `youtube-prueba-privada` (solo rol service_role, solo videos del storage propio, siempre privado)
  subió el Short `macsyw1zJ1U` en privado al canal UCpzCEh9wP212K8p8QP_YvFQ; oEmbed 403 = no público.
- Falta: auditoría de Google para videos públicos y la decisión del dueño de habilitar la cuenta.
