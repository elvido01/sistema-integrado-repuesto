// Create admin RPCs in production, adapted for actual prod schema
// (profiles instead of usuarios_empresas, facturas without tenant_id filter)
const TOKEN = 'sbp_7dd6d35c4dfe60c44628b58b40274becf961eb9d';
const PROD  = 'zdvxowpuklbypweyqqki';
const API   = 'https://api.supabase.com/v1';
const H     = { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

const q = async (query) => {
  const r = await fetch(`${API}/projects/${PROD}/database/query`, {
    method: 'POST', headers: H, body: JSON.stringify({ query })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(d).slice(0, 400));
  return d;
};

const run = async (name, query) => {
  try { await q(query); console.log('  OK', name); }
  catch(e) { console.log('  FAIL', name, ':', e.message.slice(0, 200)); }
};

async function main() {

  // 1. admin_get_dashboard_stats
  await run('admin_get_dashboard_stats', `
    CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats()
    RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS
    $func$
    DECLARE _result jsonb;
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true) THEN
        RAISE EXCEPTION 'Acceso denegado';
      END IF;
      SELECT jsonb_build_object(
        'total_empresas',     (SELECT COUNT(*) FROM tenants),
        'empresas_activas',   (SELECT COUNT(*) FROM tenants WHERE activo = true),
        'empresas_trial',     (SELECT COUNT(DISTINCT tenant_id) FROM suscripciones WHERE estado = 'trial' AND fecha_fin > now()),
        'empresas_vencidas',  (SELECT COUNT(*) FROM tenants t WHERE NOT EXISTS (
                                SELECT 1 FROM suscripciones s
                                WHERE s.tenant_id = t.id AND s.estado IN ('activo','trial') AND s.fecha_fin > now()
                              )),
        'empresas_pro',       (SELECT COUNT(DISTINCT s.tenant_id) FROM suscripciones s JOIN planes p ON p.id = s.plan_id WHERE p.nombre = 'PRO' AND s.estado = 'activo' AND s.fecha_fin > now()),
        'empresas_basico',    (SELECT COUNT(DISTINCT s.tenant_id) FROM suscripciones s JOIN planes p ON p.id = s.plan_id WHERE p.nombre = 'BASICO' AND s.estado = 'activo' AND s.fecha_fin > now()),
        'empresas_enterprise',(SELECT COUNT(DISTINCT s.tenant_id) FROM suscripciones s JOIN planes p ON p.id = s.plan_id WHERE p.nombre = 'ENTERPRISE' AND s.estado = 'activo' AND s.fecha_fin > now()),
        'mrr',                (SELECT COALESCE(SUM(p.precio), 0) FROM suscripciones s JOIN planes p ON p.id = s.plan_id WHERE s.estado = 'activo' AND s.fecha_fin > now()),
        'total_usuarios',     (SELECT COUNT(*) FROM profiles),
        'total_productos',    (SELECT COUNT(*) FROM productos),
        'total_ventas_mes',   (SELECT COALESCE(SUM(total), 0) FROM facturas WHERE fecha >= date_trunc('month', CURRENT_DATE) AND estado != 'ANULADA')
      ) INTO _result;
      RETURN _result;
    END;
    $func$
  `);
  await run('GRANT admin_get_dashboard_stats',
    'GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_stats() TO authenticated');

  // 2. admin_get_tenants_detalle — uses profiles.tenant_id, facturas without tenant_id filter
  await run('admin_get_tenants_detalle', `
    CREATE OR REPLACE FUNCTION public.admin_get_tenants_detalle()
    RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS
    $func$
    DECLARE _result jsonb;
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true) THEN
        RAISE EXCEPTION 'Acceso denegado';
      END IF;
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'nombre', t.nombre,
          'email', t.email,
          'rnc', t.rnc,
          'telefono', t.telefono,
          'logo_url', t.logo_url,
          'activo', t.activo,
          'plan', t.plan,
          'created_at', t.created_at,
          'feat_carta_ruta', t.feat_carta_ruta,
          'feat_cobranzas', t.feat_cobranzas,
          'feat_cotizaciones_magna', t.feat_cotizaciones_magna,
          'suscripcion', (
            SELECT jsonb_build_object(
              'id', s.id,
              'estado', CASE WHEN s.fecha_fin > now() THEN s.estado ELSE 'vencido' END,
              'plan_nombre', p.nombre,
              'plan_precio', p.precio,
              'fecha_inicio', s.fecha_inicio,
              'fecha_fin', s.fecha_fin,
              'dias_restantes', GREATEST(0, EXTRACT(DAY FROM (s.fecha_fin - now()))::integer)
            )
            FROM suscripciones s
            JOIN planes p ON p.id = s.plan_id
            WHERE s.tenant_id = t.id
            ORDER BY s.fecha_fin DESC LIMIT 1
          ),
          'total_usuarios',    (SELECT COUNT(*) FROM profiles pr WHERE pr.tenant_id = t.id),
          'total_productos',   (SELECT COUNT(*) FROM productos),
          'total_ventas_mes',  (SELECT COALESCE(SUM(f.total), 0) FROM facturas f
                                WHERE f.fecha >= date_trunc('month', CURRENT_DATE) AND f.estado != 'ANULADA')
        )
        ORDER BY t.created_at ASC
      ) INTO _result FROM tenants t;
      RETURN COALESCE(_result, '[]'::jsonb);
    END;
    $func$
  `);
  await run('GRANT admin_get_tenants_detalle',
    'GRANT EXECUTE ON FUNCTION public.admin_get_tenants_detalle() TO authenticated');

  // 3. admin_activar_empresa
  await run('admin_activar_empresa', `
    CREATE OR REPLACE FUNCTION public.admin_activar_empresa(p_tenant_id uuid)
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
    $func$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true) THEN
        RAISE EXCEPTION 'Acceso denegado';
      END IF;
      UPDATE tenants SET activo = true, updated_at = now() WHERE id = p_tenant_id;
    END;
    $func$
  `);
  await run('GRANT admin_activar_empresa',
    'GRANT EXECUTE ON FUNCTION public.admin_activar_empresa(uuid) TO authenticated');

  // 4. admin_suspender_empresa
  await run('admin_suspender_empresa', `
    CREATE OR REPLACE FUNCTION public.admin_suspender_empresa(p_tenant_id uuid)
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
    $func$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true) THEN
        RAISE EXCEPTION 'Acceso denegado';
      END IF;
      UPDATE tenants SET activo = false, updated_at = now() WHERE id = p_tenant_id;
      UPDATE suscripciones SET estado = 'suspendido', updated_at = now()
      WHERE tenant_id = p_tenant_id AND estado IN ('activo','trial');
    END;
    $func$
  `);
  await run('GRANT admin_suspender_empresa',
    'GRANT EXECUTE ON FUNCTION public.admin_suspender_empresa(uuid) TO authenticated');

  // 5. admin_cambiar_plan
  await run('admin_cambiar_plan', `
    CREATE OR REPLACE FUNCTION public.admin_cambiar_plan(p_tenant_id uuid, p_plan_nombre text)
    RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
    $func$
    DECLARE _plan RECORD; _sub_id uuid;
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true) THEN
        RAISE EXCEPTION 'Acceso denegado';
      END IF;
      SELECT * INTO _plan FROM planes WHERE UPPER(nombre) = UPPER(p_plan_nombre) AND activo = true;
      IF _plan IS NULL THEN RAISE EXCEPTION 'Plan no encontrado'; END IF;
      UPDATE suscripciones SET estado = 'vencido', updated_at = now()
      WHERE tenant_id = p_tenant_id AND estado IN ('activo','trial');
      INSERT INTO suscripciones (tenant_id, plan_id, estado, fecha_inicio, fecha_fin)
      VALUES (
        p_tenant_id, _plan.id,
        CASE WHEN _plan.nombre = 'TRIAL' THEN 'trial' ELSE 'activo' END,
        now(), now() + (_plan.duracion_dias || ' days')::interval
      ) RETURNING id INTO _sub_id;
      UPDATE tenants SET
        plan = LOWER(p_plan_nombre),
        feat_cotizaciones_magna = _plan.feat_cotizaciones_magna,
        feat_carta_ruta = _plan.feat_carta_ruta,
        feat_cobranzas = _plan.feat_cobranzas,
        activo = true, updated_at = now()
      WHERE id = p_tenant_id;
      RETURN _sub_id;
    END;
    $func$
  `);
  await run('GRANT admin_cambiar_plan',
    'GRANT EXECUTE ON FUNCTION public.admin_cambiar_plan(uuid, text) TO authenticated');

  // 6. admin_extender_suscripcion
  await run('admin_extender_suscripcion', `
    CREATE OR REPLACE FUNCTION public.admin_extender_suscripcion(p_tenant_id uuid, p_dias integer)
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
    $func$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_superadmin = true) THEN
        RAISE EXCEPTION 'Acceso denegado';
      END IF;
      IF p_dias <= 0 THEN RAISE EXCEPTION 'Días debe ser positivo'; END IF;
      UPDATE suscripciones SET
        fecha_fin = fecha_fin + (p_dias || ' days')::interval,
        estado = CASE WHEN estado = 'vencido' THEN 'activo' ELSE estado END,
        updated_at = now()
      WHERE tenant_id = p_tenant_id
        AND id = (SELECT id FROM suscripciones WHERE tenant_id = p_tenant_id ORDER BY fecha_fin DESC LIMIT 1);
      UPDATE tenants SET
        activo = true,
        trial_end_date = (SELECT fecha_fin::date FROM suscripciones WHERE tenant_id = p_tenant_id ORDER BY fecha_fin DESC LIMIT 1),
        updated_at = now()
      WHERE id = p_tenant_id;
    END;
    $func$
  `);
  await run('GRANT admin_extender_suscripcion',
    'GRANT EXECUTE ON FUNCTION public.admin_extender_suscripcion(uuid, integer) TO authenticated');

  // Verify
  console.log('\nRPCs en producción:');
  const fns = await q(`
    SELECT routine_name FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_name LIKE 'admin_%'
    ORDER BY routine_name
  `);
  fns.forEach(f => console.log('  ✅', f.routine_name));
  console.log('\nDone.');
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
