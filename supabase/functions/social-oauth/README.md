# Social OAuth — estado 2026-09-28

Servicio desplegado en `zdvxowpuklbypweyqqki`. No publica ni activa `publicacion_habilitada`.
La interfaz existente de Equipo IA no fue modificada.

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
TikTok solicita user.info.basic + video.publish.
Registrar los callbacks exactos en las consolas de los proveedores.

## Verificado

- 26 pruebas locales (10 OAuth y 16 de adaptadores existentes).
- Endpoint remoto: 401 sin sesión, 403 con origen ajeno y 400 con state inválido.
- Tabla social_oauth_states con RLS; anon/authenticated no pueden leer ni ejecutar el guardado.
- La advertencia de RLS sin políticas en esta tabla es intencional: solo service_role puede acceder.
- Migración aplicada mediante scripts/aplicar-sql.mjs; no registrada en historial CLI.

## Trabajo que falta (no marcar como completo)

1. Crear y guardar credenciales; habilitar YouTube Data API y configurar consentimiento/scopes.
2. Terminar ficha y revisión de TikTok: icono, políticas actualizadas, demo auténtica y Direct Post.
3. Agregar conexión/revocación a la UI sin cambiar el flujo del usuario, y probar OAuth real.
4. Renovación segura de tokens, adaptadores de video, persistencia de solicitudes pendientes y verificación final.
5. Controles de privacidad, contenido comercial y consentimiento exigidos por TikTok.
6. Auditoría YouTube separada de verificación OAuth; ninguna garantiza aprobación.
7. No activar cron/publicación de estas redes hasta completar pruebas y autorización explícita de contenido.

No modificar archivos dist/ ni whatsapp-quote-extension/: contienen trabajo ajeno.
