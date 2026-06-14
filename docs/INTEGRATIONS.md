# Integraciones

## Supabase Edge Functions

Todas en `supabase/functions/<nombre>/index.ts` (Deno). Variables de entorno en secrets del proyecto Supabase.

| Función | Para qué | Notas |
|---|---|---|
| `admin-management` | Operaciones super-admin (crear tenant, asignar plan) | Service role |
| `extract_purchase_from_image` | OCR factura suplidor → líneas de compra | Google Vision + GPT-4o-mini |
| `emitir-fiscal` | Emite e-CF firmado a DGII | Firma XAdES-BES, llama TesteCF/CerteCF/eCF |
| `dgii-callback` | Webhook respuesta DGII | Loguea en `dgii_callbacks_log`, actualiza `dgii_documentos_fiscales` |
| `motoflow-ai-chat` | Chat con asistente IA del módulo AI CEO | gpt-4o-mini |
| `motoflow-daily-insights` | Genera insights diarios | Cron diario |
| `motoflow-ai-marketing` | Genera copy/diseños para Marketing IA | gpt-4o-mini + DALL-E / Gemini Image |
| `ai-marketing-learning` | Aprendizaje por métricas de campañas | Ajusta parámetros |
| `sales-hub-webhook` | Webhook Meta para Sales Hub (CRM beta) | Recibe eventos |
| `motoflow-compras-advisor` | Asesor IA de compras (Compra Inteligente) | gpt-4o-mini, lee caja + presupuesto |
| `whatsapp-crm-webhook` | Webhook WhatsApp Business / Meta | Recibe mensajes, parsea, persiste en CRM |
| `meta-subscribe-pages` | Suscribir páginas FB/IG al webhook | Pago Meta pendiente |
| `meta-add-ig-tester` | Agregar usuarios test IG | Pre-producción |
| `meta-messages-webhook` | Webhook directo Meta Messages | Alternativa a sales-hub-webhook |
| `jarvis-admin-assistant` | Asistente IA para super admin | Acceso cross-tenant |
| `generate-design-copy` | Genera copy para diseños | Marketing IA |
| `publish-design` | Publica diseños a redes (FB/IG/YouTube) | OAuth FB ok, YouTube pendiente |
| `cron-presupuesto-mensual` | Reset mensual del presupuesto | Cron 1ro de cada mes |
| `cron-presupuesto-reasignacion` | Reasigna saldo no usado entre suplidores | Cron |
| `cron-recalcular-preferidos` | Recalcula ⭐ semanalmente | Lunes 06:00 UTC |
| `motoflow-agent` | Agente IA conversacional | gpt-4o-mini |

### Despliegue de edge functions

```bash
# Windows: usar binario directo (el wrapper npm crashea)
C:\Users\PC\supabase-cli\supabase-go.exe functions deploy <nombre> --project-ref <ref>
```

## DGII (Facturación Electrónica)

**Modo de operación**: Camino B — cada tenant es su propio Emisor.

**Componentes:**

- Certificado `.p12` por tenant en Storage `certificados-dgii`
- Password cifrado en `dgii_certificados.password_encrypted`
- Secuencias NCF/eNCF en `dgii_secuencias_ncf` por tipo
- Documentos emitidos en `dgii_documentos_fiscales` con XML, `track_id` DGII, estado

**Tipos soportados/objetivo:**
- 31 Factura de Crédito Fiscal ✅
- 32 Factura de Consumo ✅
- 33 Nota de Débito ⏳ pendiente
- 34 Nota de Crédito ⏳ pendiente
- 41/43/44/45/46/47 ✅ (parciales según tipo)

**Endpoints** (case-sensitive, no normalizar):

| Entorno | Base |
|---|---|
| Test | `https://ecf.dgii.gov.do/Testecf/...` |
| Cert | `https://ecf.dgii.gov.do/Certecf/...` |
| Prod | `https://ecf.dgii.gov.do/eCF/...` |

Paths importantes: `/api/Autenticacion/api/Semilla`, `/api/Autenticacion/api/ValidarSemilla`, `/recepcion/api/FacturasElectronicas`.

Ver [memory/reference_dgii_endpoints.md](../memory/reference_dgii_endpoints.md) y [memory/reference_dgii_documentacion.md](../memory/reference_dgii_documentacion.md).

**Pendientes (06/2026):**
- Fase 3d: firma XAdES-BES (algunos cambios en el orden de canonicalización)
- Fase 3f: set de certificación CerteCF (25 pruebas obligatorias)

## OpenAI

- **Modelo**: `gpt-4o-mini` (centavos por request)
- **Clave**: cuenta "agente Morla nuevo" con auto-recharge OFF
- **⚠️ Nunca compartir la API key** con Codex/dev tools (riesgo de fuga). Solo vive en secrets de Supabase
- Detalles: [memory/project_openai_billing.md](../memory/project_openai_billing.md)

## Google Vision

Usado por `extract_purchase_from_image`. Detecta texto en imágenes de facturas suplidor (OCR). Key en secrets de la edge function.

## Meta (WhatsApp Business + FB/IG)

**WhatsApp Business Cloud API:**
- Webhook desplegado y recibiendo mensajes ✅
- **Envío bloqueado** hasta agregar método de pago en Meta Business
- Token de verificación: en secrets de la edge function
- Ver [memory/project_whatsapp_crm.md](../memory/project_whatsapp_crm.md)

**Facebook / Instagram (Marketing IA):**
- OAuth para publicación de diseños ✅
- IG Graph API requiere cuenta business + página FB asociada
- YouTube OAuth pendiente (Fase 2b de Marketing IA)

## YouTube

Pendiente integración OAuth para upload de videos (Marketing IA Fase 2b).

## EAS (Expo Application Services)

Para la app móvil:

- `eas build --auto-submit` → Play Store interno
- `eas update` → OTA JS updates sin pasar por Play Store
- Service account: `motoflow-497315` / `play-service-account.json`
- Detalles: [memory/project_eas_publicacion_automatica.md](../memory/project_eas_publicacion_automatica.md)

## Cloudflare Pages

Hosting estático para la web app.

- Dominio: configurado en Cloudflare DNS apuntando al deployment
- Trigger: push a `feat/mercancias-filtros` (rama activa)
- Sirve el contenido de `dist/` commiteado

## Print Agent (local)

Servicio Node.js local que corre en la PC del cliente.

- Comunica con impresoras térmicas USB/serial via `winRawPrinter.js`
- Instalación: `print-agent/installer/install-user.bat`
- App web envía a `http://localhost:<puerto>/print` con payload ESC/POS
- Ver `print-agent/README.md`

## QZ Tray + WebUSB (alternativas)

Para clientes que ya tienen QZ Tray instalado o quieren printer USB nativo desde el navegador. Selección en `Configuracion → PrinterSettings`.

## GPS (Caminero Motors)

Hardware GPS + tracking + cobranza de motos financiadas. Tablas + edge function tracker. Ver `sql/gps_caminero_motors.sql`.

## Mobile (React Native + Expo)

Comparte BD Supabase con web. Algunas RPCs específicas:
- `fix_recibo_ingreso_mobile_rls.sql` — policies para que el cobrador móvil pueda ver/crear recibos
- Reimpresión recibos en `mobile/app/(tabs)/recibo.tsx`

## Privacidad y políticas

URL de política de privacidad (para Play Console / App Store):
https://sites.google.com/view/motoflow-privacidad/inicio

Ver [memory/reference_motoflow_privacy_url.md](../memory/reference_motoflow_privacy_url.md).

## Reference cruzado

| Servicio | Doc memoria |
|---|---|
| OpenAI billing | [project_openai_billing.md](../memory/project_openai_billing.md) |
| WhatsApp CRM | [project_whatsapp_crm.md](../memory/project_whatsapp_crm.md) |
| DGII endpoints | [reference_dgii_endpoints.md](../memory/reference_dgii_endpoints.md) |
| DGII documentación | [reference_dgii_documentacion.md](../memory/reference_dgii_documentacion.md) |
| EAS publicación | [project_eas_publicacion_automatica.md](../memory/project_eas_publicacion_automatica.md) |
| Supabase CLI Windows | [reference_supabase_cli_windows.md](../memory/reference_supabase_cli_windows.md) |
