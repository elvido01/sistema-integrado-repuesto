-- =====================================================================
-- COLEGIO CON INGLÉS NUEVO CENTENARIO 1: segunda empresa que comparte
-- PRODUCTOS (inventario) y CLIENTES con el Centenario (08/11/2026)
-- ---------------------------------------------------------------------
-- Pedido del dueño. Son dos empresas distintas (en el futuro cada una con su
-- RNC): cada una factura, cobra, cierra caja y declara lo suyo.
--
-- 1. Empresa nueva por registrar_nueva_empresa (tipo educativo), SIN datos:
--    RNC, dirección, teléfono y logo los pone el dueño en Perfil Empresa.
--    Activa, mismo plan y misma fecha de prueba que el Centenario.
-- 2. Acceso: solo Zuri (usuarios_empresas, dueña). El primer Centenario no
--    se toca.
-- 3. Inventario compartido: el espejo que ya usan Caminero ↔ MotoPréstamos
--    (config_empresa.inventario_compartido_con). Se copian los productos, sus
--    presentaciones y la existencia; de ahí en adelante, lo que se vende o
--    entra en una baja o sube en la otra.
-- 4. Clientes compartidos (NUEVO, genérico): config_empresa.
--    clientes_compartidos_con + clientes_espejo. Cliente nuevo o editado en
--    una → igual en la otra (se une al que tenga el mismo RNC). Lo que es de
--    CADA empresa no se copia: balance, crédito, mora. Borrar no se copia.
--    Si la copia choca (ej. RNC repetido), el original se guarda igual.
-- 5. Tope de clientes del colegio: la copia cuenta solo donde se creó.
-- Estudiantes, familias, notas y cobros del colegio NO se comparten.
-- =====================================================================

-- ── 4a. Espejo de clientes (genérico) ──────────────────────────────────
ALTER TABLE public.config_empresa ADD COLUMN IF NOT EXISTS clientes_compartidos_con uuid;

CREATE TABLE IF NOT EXISTS public.clientes_espejo (
  cliente_id uuid PRIMARY KEY REFERENCES public.clientes(id) ON DELETE CASCADE,
  par_id     uuid NOT NULL UNIQUE REFERENCES public.clientes(id) ON DELETE CASCADE,
  es_copia   boolean NOT NULL DEFAULT false,   -- true = se creó por el espejo (no cuenta en el tope del colegio)
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clientes_espejo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clientes_espejo FROM anon, authenticated;

CREATE OR REPLACE FUNCTION private.trg_clientes_espejo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_dest uuid; v_par uuid;
BEGIN
  IF public._espejo_activo() THEN RETURN NULL; END IF;
  SELECT clientes_compartidos_con INTO v_dest FROM public.config_empresa WHERE tenant_id = NEW.tenant_id;
  IF v_dest IS NULL OR v_dest = NEW.tenant_id THEN RETURN NULL; END IF;

  PERFORM set_config('motoflow.espejo', '1', true);
  BEGIN
    SELECT par_id INTO v_par FROM public.clientes_espejo WHERE cliente_id = NEW.id;
    IF v_par IS NULL THEN
      -- ¿Ya existe allá con el mismo RNC? se unen; si no, se crea.
      IF NULLIF(btrim(NEW.rnc), '') IS NOT NULL THEN
        SELECT c.id INTO v_par FROM public.clientes c
         WHERE c.tenant_id = v_dest AND c.rnc = NEW.rnc
           AND NOT EXISTS (SELECT 1 FROM public.clientes_espejo e WHERE e.cliente_id = c.id);
      END IF;
      IF v_par IS NULL THEN
        INSERT INTO public.clientes (nombre, rnc, direccion, telefono, email, activo, tipo_ncf, codigo, tenant_id,
                                     logo_url, agente_retencion, precio_nivel)
        VALUES (NEW.nombre, NEW.rnc, NEW.direccion, NEW.telefono, NEW.email, NEW.activo, NEW.tipo_ncf, NEW.codigo, v_dest,
                NEW.logo_url, NEW.agente_retencion, NEW.precio_nivel)
        RETURNING id INTO v_par;
        INSERT INTO public.clientes_espejo (cliente_id, par_id, es_copia) VALUES (NEW.id, v_par, false), (v_par, NEW.id, true);
      ELSE
        INSERT INTO public.clientes_espejo (cliente_id, par_id, es_copia) VALUES (NEW.id, v_par, false), (v_par, NEW.id, false);
      END IF;
    END IF;
    -- Mismos datos de contacto y fiscales (no balance, crédito ni mora: son de cada empresa).
    UPDATE public.clientes SET nombre = NEW.nombre, rnc = NEW.rnc, direccion = NEW.direccion, telefono = NEW.telefono,
           email = NEW.email, activo = NEW.activo, tipo_ncf = NEW.tipo_ncf, codigo = NEW.codigo, logo_url = NEW.logo_url,
           agente_retencion = NEW.agente_retencion, precio_nivel = NEW.precio_nivel
     WHERE id = v_par
       AND (nombre, rnc, direccion, telefono, email, activo, tipo_ncf, codigo, logo_url, agente_retencion, precio_nivel)
           IS DISTINCT FROM (NEW.nombre, NEW.rnc, NEW.direccion, NEW.telefono, NEW.email, NEW.activo, NEW.tipo_ncf, NEW.codigo,
                             NEW.logo_url, NEW.agente_retencion, NEW.precio_nivel);
  EXCEPTION WHEN unique_violation THEN
    -- RNC o código ya usado por otro cliente allá: el original se guarda igual.
    RAISE WARNING 'Cliente % no se copió a la otra empresa: %', NEW.id, SQLERRM;
  END;
  PERFORM set_config('motoflow.espejo', '', true);
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION private.trg_clientes_espejo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_clientes_espejo ON public.clientes;
CREATE TRIGGER trg_clientes_espejo AFTER INSERT OR UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION private.trg_clientes_espejo();

-- ── 5. Tope de clientes del colegio: la copia del espejo no cuenta ─────
CREATE OR REPLACE FUNCTION private.edu_tope_clientes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_lim integer; v_fam integer; v_fuera integer;
BEGIN
  v_lim := public.edu_limite_estudiantes(NEW.tenant_id);
  IF v_lim IS NULL THEN RETURN NULL; END IF;                    -- no es colegio
  IF NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = NEW.id) THEN RETURN NULL; END IF;
  -- Copia de la empresa hermana (clientes compartidos): cuenta allá, no aquí.
  IF EXISTS (SELECT 1 FROM public.clientes_espejo e WHERE e.cliente_id = NEW.id AND e.es_copia) THEN RETURN NULL; END IF;
  -- Cliente de una familia: lo controla el tope de estudiantes.
  IF EXISTS (SELECT 1 FROM public.edu_familias f
              WHERE f.tenant_id = NEW.tenant_id AND NEW.id IN (f.cliente_id, f.cliente_fiscal_id)) THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('edu_tope_clientes:' || NEW.tenant_id::text));
  SELECT count(*) INTO v_fam FROM public.edu_familias f
   WHERE f.tenant_id = NEW.tenant_id
     AND EXISTS (SELECT 1 FROM public.edu_estudiantes e
                  WHERE e.familia_id = f.id AND e.estado IN ('activo', 'por_confirmar'));
  SELECT count(*) INTO v_fuera FROM public.clientes c
   WHERE c.tenant_id = NEW.tenant_id
     AND NOT EXISTS (SELECT 1 FROM public.edu_familias f
                      WHERE f.tenant_id = c.tenant_id AND c.id IN (f.cliente_id, f.cliente_fiscal_id))
     AND NOT EXISTS (SELECT 1 FROM public.clientes_espejo e WHERE e.cliente_id = c.id AND e.es_copia);
  IF v_fam + v_fuera > v_lim THEN
    RAISE EXCEPTION 'Llegaste al tope de % clientes de tu plan (% familias de estudiantes + % clientes de afuera). Para crear más, sube de plan.',
      v_lim, v_fam, v_fuera - 1
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION private.edu_tope_clientes() FROM PUBLIC, anon, authenticated;

-- ── 1-3 y carga inicial ────────────────────────────────────────────────
DO $alta$
DECLARE
  c_cent uuid := '8bcd59ef-9502-486c-b919-c77b991387bb';
  c_zuri uuid := 'b0ee49cc-45f9-4106-ab53-38985fa0fbdb';
  v_nuevo uuid; v_plan uuid; v_fin timestamptz; r record; v_par uuid; v_dif numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM public.config_empresa WHERE tenant_id = c_cent AND inventario_compartido_con IS NOT NULL) THEN
    RAISE EXCEPTION 'El Centenario ya comparte inventario con otra empresa: no se vuelve a crear.';
  END IF;

  v_nuevo := public.registrar_nueva_empresa('COLEGIO CON INGLÉS NUEVO CENTENARIO 1', NULL, NULL, NULL, NULL, 'educativo');

  -- Activa, mismo plan y misma fecha de prueba que el Centenario.
  SELECT plan_id, fecha_fin INTO v_plan, v_fin FROM public.suscripciones
   WHERE tenant_id = c_cent ORDER BY fecha_fin DESC NULLS LAST, created_at DESC LIMIT 1;
  UPDATE public.tenants t SET activo = true, plan = c.plan, trial_start_date = c.trial_start_date, trial_end_date = c.trial_end_date
    FROM public.tenants c WHERE t.id = v_nuevo AND c.id = c_cent;
  UPDATE public.suscripciones SET plan_id = v_plan, fecha_fin = v_fin WHERE tenant_id = v_nuevo;
  UPDATE private.tenant_onboarding_claims SET claimed_by = c_zuri, claimed_at = now() WHERE tenant_id = v_nuevo;

  -- Acceso: solo Zuri.
  INSERT INTO public.usuarios_empresas (user_id, tenant_id, rol) VALUES (c_zuri, v_nuevo, 'owner');

  -- Las dos se apuntan: inventario y clientes.
  UPDATE public.config_empresa SET inventario_compartido_con = v_nuevo, clientes_compartidos_con = v_nuevo WHERE tenant_id = c_cent;
  UPDATE public.config_empresa SET inventario_compartido_con = c_cent,  clientes_compartidos_con = c_cent  WHERE tenant_id = v_nuevo;

  PERFORM set_config('motoflow.espejo', '1', true);

  -- Productos (el Centenario manda) + existencia igual + presentaciones.
  FOR r IN SELECT id FROM public.productos WHERE tenant_id = c_cent ORDER BY created_at LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.productos_espejo e WHERE e.producto_id = r.id);
    v_par := public._espejo_producto(r.id, v_nuevo, NULL);
  END LOOP;
  FOR r IN
    SELECT e.producto_id AS dueno, e.par_id AS gemelo, p.costo
      FROM public.productos_espejo e JOIN public.productos p ON p.id = e.producto_id AND p.tenant_id = c_cent
  LOOP
    SELECT COALESCE((SELECT SUM(cantidad) FROM public.inventario_movimientos WHERE tenant_id = c_cent AND producto_id = r.dueno), 0)
         - COALESCE((SELECT SUM(cantidad) FROM public.inventario_movimientos WHERE tenant_id = v_nuevo AND producto_id = r.gemelo), 0)
      INTO v_dif;
    IF v_dif <> 0 THEN
      INSERT INTO public.inventario_movimientos (producto_id, fecha, tipo, cantidad, costo_unitario, referencia_doc, tenant_id)
      VALUES (r.gemelo, now(), 'AJUSTE', v_dif, r.costo, 'SALDO INICIAL INVENTARIO COMPARTIDO', v_nuevo);
    END IF;
  END LOOP;
  INSERT INTO public.presentaciones (producto_id, cantidad, costo, margen_pct, precio1, precio2, precio3, descuento_pct,
    afecta_ft, afecta_inv, tipo, precio_final, auto_precio2, auto_precio3, tenant_id, espejo_de)
  SELECT e.par_id, pr.cantidad, pr.costo, pr.margen_pct, pr.precio1, pr.precio2, pr.precio3, pr.descuento_pct,
    pr.afecta_ft, pr.afecta_inv, pr.tipo, pr.precio_final, pr.auto_precio2, pr.auto_precio3, v_nuevo, pr.id
  FROM public.presentaciones pr
  JOIN public.productos p ON p.id = pr.producto_id AND p.tenant_id = c_cent
  JOIN public.productos_espejo e ON e.producto_id = pr.producto_id
  WHERE pr.espejo_de IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.presentaciones x WHERE x.producto_id = e.par_id);

  PERFORM set_config('motoflow.espejo', '', true);

  -- Clientes que ya tenía el Centenario: el espejo los copia al "tocarlos".
  UPDATE public.clientes SET updated_at = now() WHERE tenant_id = c_cent;

  RAISE NOTICE 'Creada: % (COLEGIO CON INGLÉS NUEVO CENTENARIO 1)', v_nuevo;
END $alta$;

-- VERIFICACIÓN: productos, existencia y clientes iguales en las dos.
WITH n AS (SELECT tenant_id FROM public.config_empresa WHERE nombre = 'COLEGIO CON INGLÉS NUEVO CENTENARIO 1'),
stk AS (SELECT producto_id, tenant_id, SUM(cantidad) s FROM public.inventario_movimientos
         WHERE tenant_id IN ('8bcd59ef-9502-486c-b919-c77b991387bb', (SELECT tenant_id FROM n)) GROUP BY 1, 2)
SELECT (SELECT tenant_id FROM n) AS empresa_nueva,
  (SELECT count(*) FROM public.productos WHERE tenant_id = '8bcd59ef-9502-486c-b919-c77b991387bb') AS productos_centenario,
  (SELECT count(*) FROM public.productos WHERE tenant_id = (SELECT tenant_id FROM n)) AS productos_centenario_1,
  (SELECT count(*) FROM public.productos_espejo e
     JOIN public.productos p ON p.id = e.producto_id AND p.tenant_id = '8bcd59ef-9502-486c-b919-c77b991387bb'
     LEFT JOIN stk a ON a.producto_id = e.producto_id AND a.tenant_id = p.tenant_id
     LEFT JOIN stk b ON b.producto_id = e.par_id AND b.tenant_id = (SELECT tenant_id FROM n)
    WHERE COALESCE(a.s, 0) <> COALESCE(b.s, 0)) AS existencias_distintas,
  (SELECT count(*) FROM public.clientes WHERE tenant_id = '8bcd59ef-9502-486c-b919-c77b991387bb') AS clientes_centenario,
  (SELECT count(*) FROM public.clientes WHERE tenant_id = (SELECT tenant_id FROM n)) AS clientes_centenario_1;

SELECT public.registrar_migracion('colegio_centenario_1_compartido.sql');
