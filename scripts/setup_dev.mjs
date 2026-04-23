// Setup motoflow-dev: planes data + RPC functions + disable email confirmation
const TOKEN = 'sbp_7dd6d35c4dfe60c44628b58b40274becf961eb9d';
const DEV   = 'vvxoxhowupkehycnpwaa';
const API   = 'https://api.supabase.com/v1';
const H     = { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

const q = async (query) => {
  const r = await fetch(`${API}/projects/${DEV}/database/query`, {
    method: 'POST', headers: H, body: JSON.stringify({ query })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(d).slice(0, 400));
  return d;
};

const run = async (name, query) => {
  try { await q(query); console.log(`  ✅ ${name}`); return true; }
  catch(e) { console.log(`  ⚠️  ${name}: ${e.message.slice(0, 200)}`); return false; }
};

async function main() {

  // ── 0. Crear tablas planes y suscripciones si no existen ──────────────────
  console.log('\n🏗️  Paso 0: Creando tablas planes y suscripciones...\n');

  await run('CREATE TABLE planes', `
    CREATE TABLE IF NOT EXISTS public.planes (
      id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre                  text NOT NULL UNIQUE,
      descripcion             text,
      precio                  numeric(10,2) NOT NULL DEFAULT 0,
      duracion_dias           integer NOT NULL DEFAULT 30,
      limite_usuarios         integer DEFAULT 3,
      limite_productos        integer DEFAULT 100,
      limite_facturas         integer DEFAULT NULL,
      limite_almacenes        integer DEFAULT 1,
      feat_cotizaciones_magna boolean DEFAULT false,
      feat_carta_ruta         boolean DEFAULT false,
      feat_cobranzas          boolean DEFAULT false,
      feat_reportes_avanzados boolean DEFAULT false,
      feat_ocr_facturas       boolean DEFAULT false,
      feat_api_access         boolean DEFAULT false,
      activo                  boolean DEFAULT true,
      created_at              timestamptz NOT NULL DEFAULT now(),
      updated_at              timestamptz NOT NULL DEFAULT now()
    )
  `);

  await run('CREATE TABLE suscripciones', `
    CREATE TABLE IF NOT EXISTS public.suscripciones (
      id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
      plan_id             uuid NOT NULL REFERENCES public.planes(id),
      estado              text NOT NULL DEFAULT 'trial'
                          CHECK (estado IN ('trial','activo','vencido','cancelado','suspendido')),
      fecha_inicio        timestamptz NOT NULL DEFAULT now(),
      fecha_fin           timestamptz NOT NULL,
      metodo_pago         text,
      referencia_pago     text,
      monto_pagado        numeric(10,2) DEFAULT 0,
      auto_renovar        boolean DEFAULT false,
      cancelado_por       uuid,
      motivo_cancelacion  text,
      created_at          timestamptz NOT NULL DEFAULT now(),
      updated_at          timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, plan_id, fecha_inicio)
    )
  `);

  await run('INDEX suscripciones_tenant', `CREATE INDEX IF NOT EXISTS idx_suscripciones_tenant ON public.suscripciones(tenant_id)`);
  await run('INDEX suscripciones_estado', `CREATE INDEX IF NOT EXISTS idx_suscripciones_estado ON public.suscripciones(estado)`);

  // ── 1. Seed planes ──────────────────────────────────────────────────────────
  console.log('\n📋 Paso 1: Sembrando tabla planes...\n');

  await run('Insert TRIAL plan', `
    INSERT INTO public.planes (nombre, descripcion, precio, duracion_dias, limite_usuarios, limite_productos, limite_facturas, limite_almacenes, feat_cotizaciones_magna, feat_carta_ruta, feat_cobranzas, feat_reportes_avanzados, feat_ocr_facturas, feat_api_access)
    VALUES
      ('TRIAL',      'Plan de prueba gratuito por 15 días',        0,     15, 2,     50,    100,  1, false, false, false, false, false, false),
      ('BASICO',     'Plan básico para pequeñas empresas',         2500,  30, 3,     500,   500,  1, false, false, false, false, false, false),
      ('PRO',        'Plan profesional con todas las funciones',   5000,  30, 10,    99999, NULL, 5, true,  true,  true,  true,  true,  false),
      ('ENTERPRISE', 'Plan empresarial sin límites',               10000, 30, 99999, 99999, NULL, 99,true,  true,  true,  true,  true,  true)
    ON CONFLICT (nombre) DO NOTHING
  `);

  // ── 2. RPC registrar_nueva_empresa ─────────────────────────────────────────
  console.log('\n🔧 Paso 2: Creando función registrar_nueva_empresa...\n');

  await run('registrar_nueva_empresa()', `
    CREATE OR REPLACE FUNCTION registrar_nueva_empresa(
      p_nombre      TEXT,
      p_rnc         TEXT DEFAULT NULL,
      p_direccion   TEXT DEFAULT NULL,
      p_telefono    TEXT DEFAULT NULL,
      p_email       TEXT DEFAULT NULL
    )
    RETURNS UUID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      v_tenant_id   UUID;
      v_plan_id     UUID;
    BEGIN
      INSERT INTO tenants (nombre, rnc, direccion, telefono, email, activo, plan)
      VALUES (p_nombre, p_rnc, p_direccion, p_telefono, p_email, true, 'TRIAL')
      RETURNING id INTO v_tenant_id;

      INSERT INTO config_empresa (tenant_id, nombre, rnc, direccion, telefono, email)
      VALUES (v_tenant_id, p_nombre, p_rnc, p_direccion, p_telefono, p_email)
      ON CONFLICT (tenant_id) DO NOTHING;

      SELECT id INTO v_plan_id FROM planes WHERE nombre = 'TRIAL' LIMIT 1;

      IF v_plan_id IS NOT NULL THEN
        INSERT INTO suscripciones (tenant_id, plan_id, estado, fecha_inicio, fecha_fin, monto_pagado, auto_renovar)
        VALUES (v_tenant_id, v_plan_id, 'trial', NOW(), NOW() + INTERVAL '15 days', 0, false);
        UPDATE tenants SET trial_end_date = NOW() + INTERVAL '15 days' WHERE id = v_tenant_id;
      END IF;

      RETURN v_tenant_id;
    END;
    $$
  `);

  await run('GRANT anon on registrar_nueva_empresa', `
    GRANT EXECUTE ON FUNCTION registrar_nueva_empresa(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
    GRANT EXECUTE ON FUNCTION registrar_nueva_empresa(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
  `);

  // ── 3. RPC check_suscripcion_activa ────────────────────────────────────────
  console.log('\n🔧 Paso 3: Creando check_suscripcion_activa...\n');

  await run('check_suscripcion_activa()', `
    CREATE OR REPLACE FUNCTION public.check_suscripcion_activa(p_tenant_id uuid DEFAULT NULL)
    RETURNS jsonb
    LANGUAGE plpgsql
    STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      _tenant uuid;
      _sub RECORD;
      _dias_restantes integer;
      _activa boolean;
    BEGIN
      _tenant := COALESCE(p_tenant_id, get_user_tenant());
      IF _tenant IS NULL THEN
        RETURN jsonb_build_object('activa', false, 'error', 'No se pudo determinar el tenant');
      END IF;

      SELECT s.*, p.nombre AS plan_nombre, p.descripcion AS plan_descripcion,
             p.precio AS plan_precio, p.limite_usuarios, p.limite_productos,
             p.limite_facturas, p.limite_almacenes,
             p.feat_cotizaciones_magna, p.feat_carta_ruta, p.feat_cobranzas,
             p.feat_reportes_avanzados, p.feat_ocr_facturas, p.feat_api_access
      INTO _sub
      FROM suscripciones s
      JOIN planes p ON p.id = s.plan_id
      WHERE s.tenant_id = _tenant AND s.estado IN ('trial', 'activo')
      ORDER BY s.fecha_fin DESC LIMIT 1;

      IF _sub IS NULL THEN
        RETURN jsonb_build_object(
          'activa', false, 'estado', 'sin_suscripcion', 'plan', null,
          'dias_restantes', 0, 'mensaje', 'No tiene suscripción activa.'
        );
      END IF;

      _dias_restantes := GREATEST(0, EXTRACT(DAY FROM (_sub.fecha_fin - now()))::integer);
      _activa := _sub.fecha_fin > now();

      IF NOT _activa AND _sub.estado IN ('trial', 'activo') THEN
        UPDATE suscripciones SET estado = 'vencido', updated_at = now() WHERE id = _sub.id;
      END IF;

      RETURN jsonb_build_object(
        'activa', _activa,
        'suscripcion_id', _sub.id,
        'estado', CASE WHEN _activa THEN _sub.estado ELSE 'vencido' END,
        'plan', _sub.plan_nombre,
        'plan_id', _sub.plan_id,
        'dias_restantes', _dias_restantes,
        'auto_renovar', _sub.auto_renovar,
        'limites', jsonb_build_object(
          'usuarios', _sub.limite_usuarios, 'productos', _sub.limite_productos,
          'facturas', _sub.limite_facturas, 'almacenes', _sub.limite_almacenes
        ),
        'features', jsonb_build_object(
          'cotizaciones_magna', _sub.feat_cotizaciones_magna,
          'carta_ruta', _sub.feat_carta_ruta,
          'cobranzas', _sub.feat_cobranzas,
          'reportes_avanzados', _sub.feat_reportes_avanzados,
          'ocr_facturas', _sub.feat_ocr_facturas,
          'api_access', _sub.feat_api_access
        ),
        'mensaje', CASE
          WHEN NOT _activa THEN 'Su suscripción ha vencido.'
          WHEN _dias_restantes <= 3 THEN 'Su suscripción vence en ' || _dias_restantes || ' día(s).'
          ELSE 'Suscripción activa.'
        END
      );
    END;
    $$
  `);

  await run('GRANT check_suscripcion_activa', `
    GRANT EXECUTE ON FUNCTION public.check_suscripcion_activa(uuid) TO authenticated;
  `);

  // ── 4. RPC crear_suscripcion_trial ─────────────────────────────────────────
  console.log('\n🔧 Paso 4: Creando crear_suscripcion_trial...\n');

  await run('crear_suscripcion_trial()', `
    CREATE OR REPLACE FUNCTION public.crear_suscripcion_trial(p_tenant_id uuid)
    RETURNS uuid
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      _plan_trial_id uuid;
      _sub_id uuid;
    BEGIN
      SELECT id INTO _plan_trial_id FROM planes WHERE nombre = 'TRIAL' AND activo = true LIMIT 1;
      IF _plan_trial_id IS NULL THEN
        RAISE EXCEPTION 'Plan TRIAL no encontrado';
      END IF;
      IF EXISTS (SELECT 1 FROM suscripciones WHERE tenant_id = p_tenant_id AND estado IN ('trial', 'activo')) THEN
        SELECT id INTO _sub_id FROM suscripciones WHERE tenant_id = p_tenant_id AND estado IN ('trial', 'activo') ORDER BY fecha_fin DESC LIMIT 1;
        RETURN _sub_id;
      END IF;
      INSERT INTO suscripciones (tenant_id, plan_id, estado, fecha_inicio, fecha_fin)
      VALUES (p_tenant_id, _plan_trial_id, 'trial', now(), now() + INTERVAL '15 days')
      RETURNING id INTO _sub_id;
      RETURN _sub_id;
    END;
    $$
  `);

  // ── 5. Handle_new_user trigger ─────────────────────────────────────────────
  console.log('\n🔧 Paso 5: Verificando trigger handle_new_user...\n');

  const triggers = await q(`
    SELECT trigger_name FROM information_schema.triggers
    WHERE trigger_schema = 'public' AND trigger_name = 'on_auth_user_created'
  `);
  if (triggers.length > 0) {
    console.log('  ✅ Trigger on_auth_user_created ya existe');
  } else {
    console.log('  ⚠️  Trigger on_auth_user_created no encontrado — puede estar en schema auth');
    // Check in auth schema
    const authTriggers = await q(`
      SELECT trigger_name FROM information_schema.triggers
      WHERE event_object_schema = 'auth' AND trigger_name = 'on_auth_user_created'
    `);
    if (authTriggers.length > 0) {
      console.log('  ✅ Trigger on_auth_user_created existe en auth.users');
    } else {
      console.log('  ❌ Trigger no encontrado, creando...');
      await run('handle_new_user function', `
        CREATE OR REPLACE FUNCTION public.handle_new_user()
        RETURNS trigger
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public
        AS $$
        DECLARE
          _tenant_id uuid;
          _role text;
          _nombre text;
        BEGIN
          _tenant_id := (NEW.raw_user_meta_data->>'tenant_id')::uuid;
          _role      := COALESCE(NEW.raw_user_meta_data->>'role', 'empleado');
          _nombre    := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);

          INSERT INTO public.profiles (id, tenant_id, full_name, role, is_superadmin)
          VALUES (NEW.id, _tenant_id, _nombre, _role, false)
          ON CONFLICT (id) DO NOTHING;

          IF _tenant_id IS NOT NULL THEN
            INSERT INTO public.usuarios_empresas (user_id, tenant_id, rol, activo)
            VALUES (NEW.id, _tenant_id, _role, true)
            ON CONFLICT DO NOTHING;
          END IF;

          RETURN NEW;
        END;
        $$
      `);

      await run('on_auth_user_created trigger', `
        CREATE TRIGGER on_auth_user_created
          AFTER INSERT ON auth.users
          FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()
      `);
    }
  }

  // ── 6. RLS para planes/suscripciones ───────────────────────────────────────
  console.log('\n🔧 Paso 6: Configurando RLS para planes y suscripciones...\n');

  await run('RLS planes enable', `ALTER TABLE public.planes ENABLE ROW LEVEL SECURITY`);
  await run('RLS suscripciones enable', `ALTER TABLE public.suscripciones ENABLE ROW LEVEL SECURITY`);
  await run('Policy planes_select', `
    CREATE POLICY "planes_select_authenticated" ON public.planes
    FOR SELECT TO authenticated USING (activo = true)
  `);
  await run('Policy suscripciones_select', `
    CREATE POLICY "suscripciones_select_tenant" ON public.suscripciones
    FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant())
  `);
  await run('Policy suscripciones_superadmin', `
    CREATE POLICY "suscripciones_manage_superadmin" ON public.suscripciones
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_superadmin = true))
  `);

  // ── 7. Disable email confirmation via Management API ───────────────────────
  console.log('\n🔧 Paso 7: Deshabilitando confirmación de email en motoflow-dev...\n');

  const authRes = await fetch(`${API}/projects/${DEV}/config/auth`, {
    method: 'PATCH',
    headers: H,
    body: JSON.stringify({ mailer_autoconfirm: true })
  });
  const authData = await authRes.json();
  if (authRes.ok) {
    console.log('  ✅ Email autoconfirm habilitado (confirmación deshabilitada)');
  } else {
    console.log('  ⚠️  Auth config:', JSON.stringify(authData).slice(0, 200));
  }

  // ── 8. Verify ──────────────────────────────────────────────────────────────
  console.log('\n📊 Verificación final...\n');

  const planes = await q(`SELECT nombre, precio, duracion_dias FROM public.planes ORDER BY precio`);
  console.log('  Planes en DEV:');
  planes.forEach(p => console.log(`    - ${p.nombre}: RD$${p.precio} / ${p.duracion_dias} días`));

  const funcs = await q(`
    SELECT routine_name FROM information_schema.routines
    WHERE routine_schema = 'public'
      AND routine_name IN ('registrar_nueva_empresa','check_suscripcion_activa','crear_suscripcion_trial','get_user_tenant','handle_new_user')
    ORDER BY routine_name
  `);
  console.log('\n  Funciones disponibles:');
  funcs.forEach(f => console.log(`    ✅ ${f.routine_name}`));

  console.log('\n🎉 Setup de motoflow-dev completado.\n');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
