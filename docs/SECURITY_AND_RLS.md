# Seguridad y RLS

## Autenticación

- **Provider**: Supabase Auth (email + password)
- **Espejo en BD**: `profiles` con FK a `auth.users(id)` + `tenant_id`, `role`, `nombre`
- **Carga al login**: `SupabaseAuthContext.fetchProfileAndPermissions(userId)` trae profile + `user_module_permissions` + `config_empresa` + check `fiscalActivo`

## Multi-tenancy

**Aislamiento por `tenant_id`** en TODAS las tablas del dominio. Patrón estándar:

```sql
CREATE POLICY "tenant_select" ON public.<tabla>
  FOR SELECT USING (tenant_id = public.get_user_tenant());

CREATE POLICY "tenant_insert" ON public.<tabla>
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant());

CREATE POLICY "tenant_update" ON public.<tabla>
  FOR UPDATE USING (tenant_id = public.get_user_tenant())
              WITH CHECK (tenant_id = public.get_user_tenant());

CREATE POLICY "tenant_delete" ON public.<tabla>
  FOR DELETE USING (tenant_id = public.get_user_tenant());
```

`get_user_tenant()` lee `profiles.tenant_id` del usuario autenticado vía `auth.uid()`. Si el usuario no tiene profile o tenant, retorna NULL → ninguna política aprueba → 0 filas.

Migraciones de aislamiento aplicadas: `sql/migration_tenant_isolation.sql`, `sql/migration_tenant_isolation_part2.sql`, y backfills (`backfill_cash_tenant_id_from_clients.sql`, `backfill_devoluciones_tenant_id_from_facturas.sql`).

## Roles

| Role en `profiles.role` | Permisos |
|---|---|
| `super_admin` | Acceso total cross-tenant (Admin Dashboard, gestión de tenants y planes). Validado por `SuperAdminGuard` |
| `admin` | Administrador del tenant — todos los módulos de su tenant |
| `vendedor` / `cajero` / `bodega` / etc. | Roles operativos. Acceso controlado por `user_module_permissions` |

## Permisos por módulo

Tabla `user_module_permissions` con `(user_id, module_key)`. Cada panel se envuelve en:

```jsx
<RouteGuard moduleKey="ventas">
  <VentasPage />
</RouteGuard>
```

`RouteGuard` consulta la tabla y bloquea si no hay registro. Para super_admin se salta la verificación.

## Bloqueo por plan/suscripción

Algunos paneles (WhatsApp CRM, GPS, AI CEO) se envuelven en `<PlanGate nombre="Sales Hub / CRM">`. Lee `suscripciones` del tenant y bloquea con CTA de upgrade si el plan no incluye la feature.

## Edge Functions

**Usan `SERVICE_ROLE_KEY`** — bypassen RLS. Por eso es crítico:

1. Que cada edge function valide manualmente el `tenant_id` antes de operar
2. Que las RPCs llamadas desde edge functions tengan dos versiones cuando aplique:
   - Una con `SECURITY DEFINER` + `get_user_tenant()` para usuarios
   - Una `all_tenants` que itera por tenant para uso de cron/edge sin sesión

Ejemplo: `recalcular_preferidos_todos` (usuarios) vs `cron_recalcular_preferidos_all_tenants` (edge service).

## Storage

Buckets configurados con policies por tenant:

- `certificados-dgii` — privado, solo el tenant dueño puede leer/escribir
- `logos-empresa` — público de lectura (para PDFs/cliente web), escritura solo el tenant
- `cartas-ruta` — privado del tenant, ver `sql/cartas_ruta_storage_policy.sql`
- `productos` — público lectura, escritura por tenant
- `disenos-marketing` / `captut-pro` / `brand-kit` — políticas en sus respectivos SQL

## Secretos

Nunca en el repo:

- `.env.local` (dev), `.env.production` (prod) — en `.gitignore`
- API keys OpenAI: en Supabase Secrets de cada proyecto edge
- Certificado DGII (.p12) y password: en Storage privado + tabla `dgii_certificados` (password cifrado)
- Service role key: solo en Supabase secrets, jamás en cliente

## Datos sensibles a no commitear

- `.env*` (excepto `.env.example` si existiera)
- `*.p12` / `*.pfx` / `*.key`
- `db_cluster-*.backup` (existe uno antiguo en raíz — no committear más)
- Logs con credenciales (`mobile/.expo-web.err.log`, etc.)

## Auth en Edge Functions

Las edge functions reciben JWT del cliente. Para validar:

```ts
const authHeader = req.headers.get('Authorization');
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: authHeader } }
});
const { data: { user } } = await supabase.auth.getUser();
```

Solo después de eso, si necesitas bypass de RLS, crea un segundo client con SERVICE_ROLE pero usa el `user.id` validado para filtrar.

## Riesgo conocido — datos huérfanos por trigger

El trigger `trg_productos_suplidor_change` mueve líneas entre órdenes cuando cambias `productos.suplidor_id`. Es seguro pero puede generar movimientos no esperados si edita en masa. Si necesitas suprimirlo temporalmente:

```sql
ALTER TABLE public.productos DISABLE TRIGGER trg_productos_suplidor_change;
-- ... bulk update ...
ALTER TABLE public.productos ENABLE TRIGGER trg_productos_suplidor_change;
SELECT public.reorganizar_ordenes_pendientes_por_suplidor();  -- limpieza final
```

## Auditoría / cambios

No hay tabla de auditoría general por ahora. Algunos módulos tienen `created_at` + `updated_by` (ej. cierres, OC). Para investigar bugs históricos se depende de `git log` + estados en tablas (`anulada_at`, `recibida_at`, etc.).

## Reglas no negociables

1. **NUNCA** ejecutar SQL en prod sin haberlo probado en dev (entornos separados desde 2026-03-28)
2. **NUNCA** usar `SECURITY DEFINER` sin filtrar por `tenant_id`
3. **NUNCA** commitear secretos. Si pasa, rotar la credencial inmediatamente
4. **NUNCA** desactivar RLS en una tabla del dominio aunque sea "temporalmente para una migración" — usar `SECURITY DEFINER` en una RPC controlada
