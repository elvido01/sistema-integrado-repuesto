# Decisión — Multi-tenant compartido en un solo Supabase

**Fecha**: original del proyecto
**Status**: Activa
**Re-evaluado**: 2026-06-15 (auditoría)

## Contexto

MotoFlow es SaaS para múltiples clientes (tenants). Hay que decidir cómo separar sus datos.

## Opciones consideradas

### A. Una BD por tenant ("silo")

- Cada cliente tiene su propio proyecto Supabase
- Aislamiento físico total

### B. Una BD compartida con `tenant_id` + RLS ("pool")

- Todos los tenants comparten tablas
- Cada tabla del dominio tiene `tenant_id UUID`
- Row Level Security (RLS) filtra por `get_user_tenant()`

### C. Schema-per-tenant

- Una BD, varios schemas (`tenant_morla`, `tenant_caminero`, ...)
- Aislamiento por schema

## Decisión: B (pool)

## Por qué

- **Costo**: Supabase cobra por proyecto. 50 clientes = 50 proyectos = mucho dinero. Pool = 1 proyecto.
- **Onboarding**: agregar tenant nuevo es `INSERT INTO tenants` + crear superadmin. Versus aprovisionar un proyecto Supabase nuevo
- **Mantenimiento**: una migración SQL = todos los tenants actualizados. Silos = corres la migración 50 veces
- **AI CEO / cross-tenant analytics**: para el super-admin de MotoFlow, ver patrones agregados es trivial. Con silos requeriría ETL
- **Backups**: 1 backup vs 50

## Costos

### El gran costo: TODO el código tiene que respetar `tenant_id`

- Toda tabla del dominio debe tener `tenant_id NOT NULL`
- Toda policy RLS debe filtrar por `get_user_tenant()`
- Cada RPC `SECURITY DEFINER` debe validar tenant (porque bypassa RLS)
- Cada edge function con `SERVICE_ROLE_KEY` debe validar tenant manualmente
- Cada operación administrativa debe validar que no cruza tenants

**Si un agente IA agrega una tabla sin RLS, hay leak cross-tenant en silencio**.

Por eso se documentaron 5 reglas no-negociables en `docs/SECURITY_AND_RLS.md`.

### Costo descubierto en auditoría 2026-06-15

- **19 funciones SECURITY DEFINER** sin tenant check (varias por inercia, otras por bug)
- **3 funciones legacy** con GRANT a PUBLIC y anon → cualquier internet podía leer emails de usuarios
- **2 RPCs** que recibían `p_tenant_id` por parámetro y no validaban contra `get_user_tenant()`
- **1 race condition** en `documentos_fiscales` que podía duplicar e-CF

Solución: Fases 0.10 + 0.11 + 3 (ver [[../roadmap/estado-2026-06-15]]).

## Re-evaluación 2026-06-15

Sigue siendo correcta. Pool sigue ganando en costo y mantenimiento.

PERO hay que ser disciplinado:
- Smoke tests multi-tenant periódicos (`sql/diagnostics_smoke_multitenant.sql`)
- Whitelist de falsos positivos para que los smokes sean accionables
- Auditoría completa cada 3-6 meses

**Cuándo reconsiderar silos**:
- Si un cliente Enterprise paga RD$X/mes para tener su BD aislada legalmente (caso healthcare, financiero)
- Si DGII exige separación (no aplica hoy)
- Si un tenant exige multi-región (por compliance)

## Lo no obvio

- `auth.users` es global de Supabase (no tiene tenant_id). El mismo email puede ser usuario en MotoFlow y en otro app Supabase nuestro
- `profiles.tenant_id` es lo que define a qué tenant pertenece el usuario en MotoFlow
- Un usuario podría teóricamente pertenecer a varios tenants si tienes `usuarios_empresas` con N filas — actualmente no se usa, pero la estructura está
- Super admin (`profiles.is_superadmin = true`) puede ver/escribir cross-tenant. Es el único caso legítimo de cross-tenant

## Referencias

- `docs/SECURITY_AND_RLS.md`
- `docs/DECISIONS/2026-06-15-auditoria-seguridad-arquitectura.md`
- [[../investigacion/]] (cuando documentes lecciones del incidente PII de Fase 0.10)
