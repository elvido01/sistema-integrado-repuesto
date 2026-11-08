-- =====================================================================
-- EMPRESA HERMANA: botón "Crear empresa hermana" (08/11/2026)
-- ---------------------------------------------------------------------
-- Pedido del dueño: que cualquier empresa pueda crear, ella misma, otra
-- empresa que comparta su INVENTARIO (productos, precios, existencia) y sus
-- CLIENTES, sin tocar el sistema. Es lo que se hizo a mano con
-- Caminero ↔ MotoPréstamos y Centenario ↔ Centenario 1.
--
-- · crear_empresa_hermana(nombre, inventario, clientes, usuarios): se escoge qué se
--   comparte (las dos casillas vienen marcadas). Solo admin/dueño de la empresa activa
--   (o super admin). Una sola hermana por empresa (el espejo es de a dos).
--   La nueva: mismo tipo de negocio, SIN RNC ni datos (los pone el dueño en
--   Perfil Empresa), activa, mismo plan en PRUEBA por 15 días (o lo que le
--   quede a la de origen, si es menos). Después se cobra como cualquier
--   empresa. Acceso: quien la creó (dueño); los demás usuarios se agregan
--   desde Usuarios y Permisos.
-- · Cada una factura, cobra, cierra caja y declara lo suyo; lo que debe cada
--   cliente es de cada empresa.
-- · get_empresa_hermana(): para la pantalla (nombre de la hermana o nada).
-- · Usa el espejo de productos (inventario_compartido_caminero_motoprestamos
--   .sql) y el de clientes (trigger trg_clientes_espejo, de
--   colegio_centenario_1_compartido.sql): los dos ya están en producción.
-- =====================================================================

-- ── Espejo de clientes (igual que colegio_centenario_1_compartido.sql) ──
ALTER TABLE public.config_empresa ADD COLUMN IF NOT EXISTS clientes_compartidos_con uuid;
CREATE TABLE IF NOT EXISTS public.clientes_espejo (
  cliente_id uuid PRIMARY KEY REFERENCES public.clientes(id) ON DELETE CASCADE,
  par_id     uuid NOT NULL UNIQUE REFERENCES public.clientes(id) ON DELETE CASCADE,
  es_copia   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clientes_espejo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clientes_espejo FROM anon, authenticated;

-- ── Copia inicial origen → hermana (productos, existencia, presentaciones, clientes) ──
CREATE OR REPLACE FUNCTION private.copiar_a_empresa_hermana(p_origen uuid, p_destino uuid, p_inventario boolean, p_clientes boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE r record; v_par uuid; v_dif numeric;
BEGIN
  IF p_inventario THEN
  PERFORM set_config('motoflow.espejo', '1', true);
  FOR r IN SELECT id FROM public.productos WHERE tenant_id = p_origen ORDER BY created_at LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.productos_espejo e WHERE e.producto_id = r.id);
    v_par := public._espejo_producto(r.id, p_destino, NULL);
  END LOOP;
  FOR r IN
    SELECT e.producto_id AS dueno, e.par_id AS gemelo, p.costo
      FROM public.productos_espejo e
      JOIN public.productos p ON p.id = e.producto_id AND p.tenant_id = p_origen
      JOIN public.productos g ON g.id = e.par_id AND g.tenant_id = p_destino
  LOOP
    SELECT COALESCE((SELECT SUM(cantidad) FROM public.inventario_movimientos WHERE tenant_id = p_origen AND producto_id = r.dueno), 0)
         - COALESCE((SELECT SUM(cantidad) FROM public.inventario_movimientos WHERE tenant_id = p_destino AND producto_id = r.gemelo), 0)
      INTO v_dif;
    IF v_dif <> 0 THEN
      INSERT INTO public.inventario_movimientos (producto_id, fecha, tipo, cantidad, costo_unitario, referencia_doc, tenant_id)
      VALUES (r.gemelo, now(), 'AJUSTE', v_dif, r.costo, 'SALDO INICIAL INVENTARIO COMPARTIDO', p_destino);
    END IF;
  END LOOP;
  INSERT INTO public.presentaciones (producto_id, cantidad, costo, margen_pct, precio1, precio2, precio3, descuento_pct,
    afecta_ft, afecta_inv, tipo, precio_final, auto_precio2, auto_precio3, tenant_id, espejo_de)
  SELECT e.par_id, pr.cantidad, pr.costo, pr.margen_pct, pr.precio1, pr.precio2, pr.precio3, pr.descuento_pct,
    pr.afecta_ft, pr.afecta_inv, pr.tipo, pr.precio_final, pr.auto_precio2, pr.auto_precio3, p_destino, pr.id
  FROM public.presentaciones pr
  JOIN public.productos p ON p.id = pr.producto_id AND p.tenant_id = p_origen
  JOIN public.productos_espejo e ON e.producto_id = pr.producto_id
  JOIN public.productos g ON g.id = e.par_id AND g.tenant_id = p_destino
  WHERE pr.espejo_de IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = e.par_id);
  PERFORM set_config('motoflow.espejo', '', true);
  END IF;

  -- Clientes: el espejo (trg_clientes_espejo) los copia al "tocarlos".
  IF p_clientes THEN UPDATE public.clientes SET updated_at = now() WHERE tenant_id = p_origen; END IF;
END;
$function$;
REVOKE ALL ON FUNCTION private.copiar_a_empresa_hermana(uuid, uuid, boolean, boolean) FROM PUBLIC, anon, authenticated;

-- ── El botón ───────────────────────────────────────────────────────────
-- (otros argumentos = otra función: se borran las versiones anteriores)
DROP FUNCTION IF EXISTS public.crear_empresa_hermana(text);
DROP FUNCTION IF EXISTS public.crear_empresa_hermana(text, boolean, boolean);
CREATE OR REPLACE FUNCTION public.crear_empresa_hermana(p_nombre text, p_inventario boolean DEFAULT true, p_clientes boolean DEFAULT true,
                                                        p_usuarios boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_t uuid := public.get_user_tenant();
  v_nombre text := NULLIF(btrim(p_nombre), '');
  v_tipo text; v_nuevo uuid; v_plan uuid; v_fin timestamptz;
BEGIN
  IF v_uid IS NULL OR v_t IS NULL THEN RAISE EXCEPTION 'Sin sesión o sin empresa activa'; END IF;
  -- Solo admin/dueño de ESTA empresa (o super admin).
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid
                   AND (COALESCE(p.is_superadmin, false)
                        OR (p.role IN ('admin', 'owner')
                            AND (p.tenant_id = v_t
                                 OR EXISTS (SELECT 1 FROM public.usuarios_empresas ue
                                             WHERE ue.user_id = v_uid AND ue.tenant_id = v_t AND ue.rol IN ('owner', 'admin')))))) THEN
    RAISE EXCEPTION 'Solo el administrador o dueño de la empresa puede crear una empresa hermana.';
  END IF;
  IF v_nombre IS NULL THEN RAISE EXCEPTION 'Escribe el nombre de la empresa nueva.'; END IF;
  IF NOT COALESCE(p_inventario, false) AND NOT COALESCE(p_clientes, false) THEN
    RAISE EXCEPTION 'Marca qué va a compartir: inventario, clientes o los dos.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('empresa_hermana:' || v_t::text));
  IF EXISTS (SELECT 1 FROM public.config_empresa WHERE tenant_id = v_t
               AND (inventario_compartido_con IS NOT NULL OR clientes_compartidos_con IS NOT NULL)) THEN
    RAISE EXCEPTION 'Esta empresa ya comparte inventario o clientes con otra (solo se puede una).';
  END IF;
  IF EXISTS (SELECT 1 FROM public.config_empresa WHERE upper(btrim(nombre)) = upper(v_nombre)) THEN
    RAISE EXCEPTION 'Ya existe una empresa con ese nombre.';
  END IF;

  SELECT COALESCE(tipo_negocio, 'repuestos') INTO v_tipo FROM public.config_empresa WHERE tenant_id = v_t;
  v_nuevo := public.registrar_nueva_empresa(v_nombre, NULL, NULL, NULL, NULL, v_tipo);

  -- Activa; mismo plan en PRUEBA por 15 días (o lo que le quede a la de origen).
  SELECT plan_id, fecha_fin INTO v_plan, v_fin FROM public.suscripciones
   WHERE tenant_id = v_t ORDER BY fecha_fin DESC NULLS LAST, created_at DESC LIMIT 1;
  v_fin := LEAST(COALESCE(v_fin, now() + interval '15 days'), now() + interval '15 days');
  UPDATE public.tenants SET activo = true, trial_start_date = now(), trial_end_date = v_fin,
         plan = (SELECT plan FROM public.tenants WHERE id = v_t)
   WHERE id = v_nuevo;
  IF v_plan IS NOT NULL THEN
    UPDATE public.suscripciones SET plan_id = v_plan, estado = 'trial', fecha_fin = v_fin WHERE tenant_id = v_nuevo;
  END IF;
  UPDATE private.tenant_onboarding_claims SET claimed_by = v_uid, claimed_at = now() WHERE tenant_id = v_nuevo;

  -- Acceso: quien la creó (dueño) y, si se marcó, los usuarios de esta
  -- empresa con el mismo rol. Sus permisos de módulos son del usuario y
  -- valen en las dos.
  INSERT INTO public.usuarios_empresas (user_id, tenant_id, rol) VALUES (v_uid, v_nuevo, 'owner')
  ON CONFLICT DO NOTHING;
  IF COALESCE(p_usuarios, false) THEN
    INSERT INTO public.usuarios_empresas (user_id, tenant_id, rol)
    -- usuarios_empresas.rol solo acepta owner/admin/usuario/vendedor.
    SELECT DISTINCT ON (u.user_id) u.user_id, v_nuevo,
           CASE WHEN u.rol IN ('owner', 'admin') THEN u.rol
                WHEN u.rol IN ('seller', 'vendedor') THEN 'vendedor' ELSE 'usuario' END
      FROM (SELECT p.id AS user_id, COALESCE(p.role, 'seller') AS rol FROM public.profiles p WHERE p.tenant_id = v_t
            UNION ALL
            SELECT ue.user_id, COALESCE(ue.rol, 'seller') FROM public.usuarios_empresas ue WHERE ue.tenant_id = v_t) u
     WHERE u.user_id <> v_uid
       AND NOT EXISTS (SELECT 1 FROM public.usuarios_empresas x WHERE x.user_id = u.user_id AND x.tenant_id = v_nuevo)
     ORDER BY u.user_id;
  END IF;

  -- Se apuntan una a la otra y se copia todo.
  UPDATE public.config_empresa SET inventario_compartido_con = CASE WHEN p_inventario THEN v_nuevo END,
         clientes_compartidos_con = CASE WHEN p_clientes THEN v_nuevo END WHERE tenant_id = v_t;
  UPDATE public.config_empresa SET inventario_compartido_con = CASE WHEN p_inventario THEN v_t END,
         clientes_compartidos_con = CASE WHEN p_clientes THEN v_t END WHERE tenant_id = v_nuevo;
  PERFORM private.copiar_a_empresa_hermana(v_t, v_nuevo, COALESCE(p_inventario, false), COALESCE(p_clientes, false));

  RETURN jsonb_build_object('id', v_nuevo, 'nombre', v_nombre, 'prueba_hasta', v_fin,
    'productos', (SELECT count(*) FROM public.productos WHERE tenant_id = v_nuevo),
    'clientes', (SELECT count(*) FROM public.clientes WHERE tenant_id = v_nuevo),
    'usuarios', (SELECT count(*) FROM public.usuarios_empresas WHERE tenant_id = v_nuevo));
END;
$function$;
REVOKE ALL ON FUNCTION public.crear_empresa_hermana(text, boolean, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_empresa_hermana(text, boolean, boolean, boolean) TO authenticated;

-- ── Para la pantalla: ¿con quién comparte? ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_empresa_hermana()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT jsonb_build_object(
    'inventario', ci.inventario_compartido_con, 'clientes', ci.clientes_compartidos_con,
    'nombre', (SELECT h.nombre FROM public.config_empresa h
                WHERE h.tenant_id = COALESCE(ci.inventario_compartido_con, ci.clientes_compartidos_con)))
  FROM public.config_empresa ci WHERE ci.tenant_id = public.get_user_tenant();
$function$;
REVOKE ALL ON FUNCTION public.get_empresa_hermana() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_empresa_hermana() TO authenticated;

SELECT public.registrar_migracion('empresa_hermana.sql');
