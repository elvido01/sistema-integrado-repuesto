# Documentación MotoFlow

Documentación técnica y de negocio del sistema MotoFlow / Sistema Integrado Repuesto.
Esta carpeta es el **contexto curado** del proyecto: lo que no se deriva trivialmente del código pero un agente o desarrollador necesita para tomar buenas decisiones.

## Índice

| Documento | Para qué sirve |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Stack, paneles, contextos, capas, despliegue |
| [DATABASE.md](DATABASE.md) | Tablas críticas, convenciones, RPCs, tenant_id |
| [MODULES.md](MODULES.md) | Inventario de módulos y su propósito de negocio |
| [BUSINESS_RULES.md](BUSINESS_RULES.md) | Reglas no obvias del negocio (ITBIS, reabastecimiento, etc.) |
| [SECURITY_AND_RLS.md](SECURITY_AND_RLS.md) | RLS, `get_user_tenant()`, roles, super admin |
| [INTEGRATIONS.md](INTEGRATIONS.md) | DGII, OpenAI, WhatsApp/Meta, GPS, Supabase |
| [DECISIONS/](DECISIONS/) | ADRs (Architecture Decision Records) cronológicos |

## Cómo mantener esto

- **Cuando una decisión es no-obvia y tendrá impacto** → ADR en `DECISIONS/AAAA-MM-DD-titulo.md`
- **Cuando una regla de negocio cambia** → actualizar `BUSINESS_RULES.md`
- **Cuando se agrega un módulo** → entrada en `MODULES.md`
- **Cuando se agrega una integración** → entrada en `INTEGRATIONS.md`
- **El código siempre es la fuente de verdad.** Estos docs son mapa, no territorio.

## Para agentes (Claude/Codex/GPT)

Lee estos archivos como contexto inicial antes de hacer cambios grandes. Si una nota aquí contradice el código actual, **gana el código** — y por favor actualiza el doc.
