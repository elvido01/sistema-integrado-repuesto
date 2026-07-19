-- =====================================================================
-- MÓDULO NÓMINA (multi-tenant) — empleados, corridas, adelantos, TSS/ISR
-- ---------------------------------------------------------------------
-- Diseño (adaptado de la práctica dominicana estándar):
--  * empleados: sueldo MENSUAL + frecuencia de pago propia (mensual/
--    quincenal/semanal — conviven en la misma empresa) + switch cotiza_tss.
--  * nominas + nomina_detalle: corrida por frecuencia y período; nace en
--    'borrador' (editable: otros ingresos/descuentos y cuánto descontar de
--    cada adelanto — FRACCIONABLE), se paga o se anula.
--  * Adelantos = gastos_diarios con tipo 'Adelanto de sueldo' + empleado_id:
--    salen de caja el día que se dan (cierre de caja y gastos del día ya
--    los ven) y se descuentan del neto en nóminas siguientes
--    (nomina_adelanto_descuentos lleva cuánto se ha descontado de cada uno).
--  * Compromisos: al generar una nómina se crea un compromiso
--    (tipo 'nomina', monto = total NETO, fecha = fecha de pago) → aparece
--    en la tarjeta "Compromisos a Pagar" del dashboard. Al pagar la
--    nómina, el compromiso se marca pagado igual que los demás
--    (activo=false + fecha_pago + forma_pago). El neto NO doble-cuenta los
--    adelantos (esos ya salieron como gasto el día que se dieron).
--  * Tasas 2026: TSS empleado AFP 2.87% (tope 464,460) + SFS 3.04%
--    (tope 232,230); ISR escala DGII 2026 sobre (bruto - TSS), retención
--    mensual prorrateada al período (quincena 1/2, semana 12/52).
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) Tablas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.empleados (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  nombre          text NOT NULL,
  cedula          text,
  telefono        text,
  puesto          text,
  sueldo_mensual  numeric NOT NULL DEFAULT 0 CHECK (sueldo_mensual >= 0),
  frecuencia_pago text NOT NULL DEFAULT 'quincenal'
    CHECK (frecuencia_pago IN ('mensual','quincenal','semanal')),
  cotiza_tss      boolean NOT NULL DEFAULT false,
  vendedor_id     uuid REFERENCES public.vendedores(id) ON DELETE SET NULL,
  fecha_ingreso   date,
  activo          boolean NOT NULL DEFAULT true,
  notas           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_empleados_tenant ON public.empleados (tenant_id, activo);

ALTER TABLE public.gastos_diarios
  ADD COLUMN IF NOT EXISTS empleado_id uuid REFERENCES public.empleados(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_gastos_diarios_empleado
  ON public.gastos_diarios (tenant_id, empleado_id) WHERE empleado_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.nominas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  numero          int  NOT NULL,
  frecuencia      text NOT NULL CHECK (frecuencia IN ('mensual','quincenal','semanal')),
  fecha_desde     date NOT NULL,
  fecha_hasta     date NOT NULL,
  fecha_pago      date NOT NULL,
  estado          text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','pagada','anulada')),
  total_bruto     numeric NOT NULL DEFAULT 0,
  total_tss       numeric NOT NULL DEFAULT 0,
  total_isr       numeric NOT NULL DEFAULT 0,
  total_adelantos numeric NOT NULL DEFAULT 0,
  total_otros_ingresos   numeric NOT NULL DEFAULT 0,
  total_otros_descuentos numeric NOT NULL DEFAULT 0,
  total_neto      numeric NOT NULL DEFAULT 0,
  compromiso_id   uuid REFERENCES public.compromisos(id) ON DELETE SET NULL,
  forma_pago      text,
  pagada_at       timestamptz,
  notas           text,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
-- una sola corrida viva por frecuencia+período
CREATE UNIQUE INDEX IF NOT EXISTS nominas_periodo_uq
  ON public.nominas (tenant_id, frecuencia, fecha_desde, fecha_hasta)
  WHERE estado <> 'anulada';

CREATE TABLE IF NOT EXISTS public.nomina_detalle (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nomina_id         uuid NOT NULL REFERENCES public.nominas(id) ON DELETE CASCADE,
  empleado_id       uuid NOT NULL REFERENCES public.empleados(id),
  sueldo_base       numeric NOT NULL DEFAULT 0,
  tss_afp           numeric NOT NULL DEFAULT 0,
  tss_sfs           numeric NOT NULL DEFAULT 0,
  isr               numeric NOT NULL DEFAULT 0,
  adelantos         numeric NOT NULL DEFAULT 0,
  otros_ingresos    numeric NOT NULL DEFAULT 0,
  otros_descuentos  numeric NOT NULL DEFAULT 0,
  neto              numeric NOT NULL DEFAULT 0,
  notas             text,
  UNIQUE (nomina_id, empleado_id)
);
CREATE INDEX IF NOT EXISTS idx_nomina_detalle_nomina ON public.nomina_detalle (tenant_id, nomina_id);

-- cuánto se descontó de CADA adelanto en CADA línea de nómina (fraccionable)
CREATE TABLE IF NOT EXISTS public.nomina_adelanto_descuentos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nomina_detalle_id uuid NOT NULL REFERENCES public.nomina_detalle(id) ON DELETE CASCADE,
  gasto_id          uuid NOT NULL REFERENCES public.gastos_diarios(id),
  monto             numeric NOT NULL CHECK (monto > 0),
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nom_adel_desc_gasto ON public.nomina_adelanto_descuentos (tenant_id, gasto_id);

-- updated_at de empleados
DROP TRIGGER IF EXISTS trg_empleados_updated ON public.empleados;
CREATE TRIGGER trg_empleados_updated
  BEFORE UPDATE ON public.empleados
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------
-- 2) RLS (patrón tenant estándar)
-- ------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['empleados','nominas','nomina_detalle','nomina_adelanto_descuentos']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL
         USING (tenant_id = public.get_user_tenant())
         WITH CHECK (tenant_id = public.get_user_tenant())',
      t || '_tenant', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated, service_role', t);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 3) Cálculo (mismas fórmulas que src/lib/nominaUtils.js)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nomina_isr_mensual(p_base_mensual numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN a <= 416220 THEN 0
    WHEN a <= 624329 THEN round((a - 416220) * 0.15 / 12, 2)
    WHEN a <= 867123 THEN round((31216 + (a - 624329) * 0.20) / 12, 2)
    ELSE                  round((79776 + (a - 867123) * 0.25) / 12, 2)
  END
  FROM (SELECT COALESCE(p_base_mensual, 0) * 12 AS a) x
$$;

CREATE OR REPLACE FUNCTION public.nomina_factor(p_frecuencia text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_frecuencia WHEN 'quincenal' THEN 0.5
                           WHEN 'semanal'   THEN 12.0/52.0
                           ELSE 1 END
$$;

-- ------------------------------------------------------------
-- 4) Recalcular una línea y los totales de su nómina (uso interno)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._nomina_recalcular(p_nomina_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
BEGIN
  UPDATE public.nomina_detalle d SET
    adelantos = COALESCE((SELECT sum(x.monto) FROM public.nomina_adelanto_descuentos x
                          WHERE x.nomina_detalle_id = d.id), 0)
  WHERE d.nomina_id = p_nomina_id;

  UPDATE public.nomina_detalle d SET
    neto = round(d.sueldo_base + d.otros_ingresos - d.tss_afp - d.tss_sfs - d.isr
                 - d.adelantos - d.otros_descuentos, 2)
  WHERE d.nomina_id = p_nomina_id;

  UPDATE public.nominas n SET
    total_bruto     = t.bruto,  total_tss = t.tss, total_isr = t.isr,
    total_adelantos = t.adel,   total_otros_ingresos = t.oing,
    total_otros_descuentos = t.odesc, total_neto = t.neto
  FROM (
    SELECT COALESCE(sum(sueldo_base),0) bruto,
           COALESCE(sum(tss_afp + tss_sfs),0) tss,
           COALESCE(sum(isr),0) isr,
           COALESCE(sum(adelantos),0) adel,
           COALESCE(sum(otros_ingresos),0) oing,
           COALESCE(sum(otros_descuentos),0) odesc,
           COALESCE(sum(neto),0) neto
    FROM public.nomina_detalle WHERE nomina_id = p_nomina_id
  ) t
  WHERE n.id = p_nomina_id;

  -- el compromiso del dashboard siempre refleja el neto vigente
  UPDATE public.compromisos c SET monto = n.total_neto
  FROM public.nominas n
  WHERE n.id = p_nomina_id AND c.id = n.compromiso_id AND c.activo = true;
END $$;

-- ------------------------------------------------------------
-- 5) RPC: generar nómina (borrador) + compromiso en el dashboard
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nomina_generar(
  p_frecuencia text,
  p_desde      date,
  p_hasta      date,
  p_fecha_pago date
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_nomina uuid;
  v_comp   uuid;
  v_emp    record;
  v_det    uuid;
  v_factor numeric := public.nomina_factor(p_frecuencia);
  v_afp_m  numeric; v_sfs_m numeric; v_isr_m numeric;
  v_adel   record;
  v_n      int := 0;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF p_frecuencia NOT IN ('mensual','quincenal','semanal') THEN
    RAISE EXCEPTION 'Frecuencia inválida: %', p_frecuencia;
  END IF;
  IF p_hasta < p_desde THEN RAISE EXCEPTION 'Rango de fechas inválido'; END IF;

  INSERT INTO public.nominas (tenant_id, numero, frecuencia, fecha_desde, fecha_hasta, fecha_pago, created_by)
  VALUES (v_tenant,
          COALESCE((SELECT max(numero) FROM public.nominas WHERE tenant_id = v_tenant), 0) + 1,
          p_frecuencia, p_desde, p_hasta, p_fecha_pago, auth.uid())
  RETURNING id INTO v_nomina;

  FOR v_emp IN
    SELECT * FROM public.empleados
    WHERE tenant_id = v_tenant AND activo = true AND frecuencia_pago = p_frecuencia
    ORDER BY nombre
  LOOP
    v_afp_m := CASE WHEN v_emp.cotiza_tss THEN round(LEAST(v_emp.sueldo_mensual, 464460) * 0.0287, 2) ELSE 0 END;
    v_sfs_m := CASE WHEN v_emp.cotiza_tss THEN round(LEAST(v_emp.sueldo_mensual, 232230) * 0.0304, 2) ELSE 0 END;
    -- ISR SOLO para el empleado formal (cotiza_tss); informal = sueldo simple
    v_isr_m := CASE WHEN v_emp.cotiza_tss
                    THEN public.nomina_isr_mensual(v_emp.sueldo_mensual - v_afp_m - v_sfs_m)
                    ELSE 0 END;

    INSERT INTO public.nomina_detalle (tenant_id, nomina_id, empleado_id, sueldo_base,
                                       tss_afp, tss_sfs, isr)
    VALUES (v_tenant, v_nomina, v_emp.id,
            round(v_emp.sueldo_mensual * v_factor, 2),
            round(v_afp_m * v_factor, 2), round(v_sfs_m * v_factor, 2),
            round(v_isr_m * v_factor, 2))
    RETURNING id INTO v_det;

    -- Adelantos pendientes del empleado: se proponen COMPLETOS (editable)
    FOR v_adel IN
      SELECT g.id,
             g.monto - COALESCE((SELECT sum(x.monto) FROM public.nomina_adelanto_descuentos x
                                 JOIN public.nomina_detalle dd ON dd.id = x.nomina_detalle_id
                                 JOIN public.nominas nn ON nn.id = dd.nomina_id
                                 WHERE x.gasto_id = g.id AND nn.estado <> 'anulada'), 0) AS pendiente
      FROM public.gastos_diarios g
      WHERE g.tenant_id = v_tenant AND g.empleado_id = v_emp.id
        AND g.tipo_gasto = 'Adelanto de sueldo' AND g.anulado = false
      ORDER BY g.fecha, g.created_at
    LOOP
      IF v_adel.pendiente > 0 THEN
        INSERT INTO public.nomina_adelanto_descuentos (tenant_id, nomina_detalle_id, gasto_id, monto)
        VALUES (v_tenant, v_det, v_adel.id, round(v_adel.pendiente, 2));
      END IF;
    END LOOP;

    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 THEN
    DELETE FROM public.nominas WHERE id = v_nomina;
    RAISE EXCEPTION 'No hay empleados activos con frecuencia %', p_frecuencia;
  END IF;

  PERFORM public._nomina_recalcular(v_nomina);

  -- Compromiso para la tarjeta "Compromisos a Pagar" del dashboard
  INSERT INTO public.compromisos (tenant_id, nombre, monto, fecha, tipo, activo, recurrente, frecuencia, solo_admin)
  SELECT v_tenant,
         'Nómina ' || p_frecuencia || ' ' || to_char(p_desde, 'DD/MM') || '–' || to_char(p_hasta, 'DD/MM'),
         n.total_neto, p_fecha_pago, 'nomina', true, false, p_frecuencia, true
  FROM public.nominas n WHERE n.id = v_nomina
  RETURNING id INTO v_comp;

  UPDATE public.nominas SET compromiso_id = v_comp WHERE id = v_nomina;

  RETURN jsonb_build_object('ok', true, 'nomina_id', v_nomina, 'empleados', v_n,
    'total_neto', (SELECT total_neto FROM public.nominas WHERE id = v_nomina));
END $$;

-- ------------------------------------------------------------
-- 6) RPC: editar una línea del borrador (otros +/- y adelanto fraccionable)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nomina_actualizar_detalle(
  p_detalle_id         uuid,
  p_otros_ingresos     numeric DEFAULT NULL,
  p_otros_descuentos   numeric DEFAULT NULL,
  p_adelanto_descuento numeric DEFAULT NULL,  -- total a descontar de adelantos en esta nómina
  p_notas              text    DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_det    record;
  v_adel   record;
  v_resto  numeric;
  v_aplicar numeric;
BEGIN
  SELECT d.*, n.estado, n.id AS nid INTO v_det
  FROM public.nomina_detalle d JOIN public.nominas n ON n.id = d.nomina_id
  WHERE d.id = p_detalle_id AND d.tenant_id = v_tenant
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Línea de nómina no encontrada'; END IF;
  IF v_det.estado <> 'borrador' THEN RAISE EXCEPTION 'La nómina ya no es editable (%)', v_det.estado; END IF;

  UPDATE public.nomina_detalle SET
    otros_ingresos   = COALESCE(p_otros_ingresos, otros_ingresos),
    otros_descuentos = COALESCE(p_otros_descuentos, otros_descuentos),
    notas            = COALESCE(p_notas, notas)
  WHERE id = p_detalle_id;

  IF p_adelanto_descuento IS NOT NULL THEN
    IF p_adelanto_descuento < 0 THEN RAISE EXCEPTION 'El descuento de adelanto no puede ser negativo'; END IF;
    -- re-repartir: se libera lo de esta línea y se aplica de nuevo,
    -- del adelanto más viejo al más nuevo, hasta el monto pedido
    DELETE FROM public.nomina_adelanto_descuentos WHERE nomina_detalle_id = p_detalle_id;
    v_resto := round(p_adelanto_descuento, 2);
    FOR v_adel IN
      SELECT g.id,
             g.monto - COALESCE((SELECT sum(x.monto) FROM public.nomina_adelanto_descuentos x
                                 JOIN public.nomina_detalle dd ON dd.id = x.nomina_detalle_id
                                 JOIN public.nominas nn ON nn.id = dd.nomina_id
                                 WHERE x.gasto_id = g.id AND nn.estado <> 'anulada'), 0) AS pendiente
      FROM public.gastos_diarios g
      WHERE g.tenant_id = v_tenant AND g.empleado_id = v_det.empleado_id
        AND g.tipo_gasto = 'Adelanto de sueldo' AND g.anulado = false
      ORDER BY g.fecha, g.created_at
    LOOP
      EXIT WHEN v_resto <= 0;
      v_aplicar := LEAST(v_resto, round(v_adel.pendiente, 2));
      IF v_aplicar > 0 THEN
        INSERT INTO public.nomina_adelanto_descuentos (tenant_id, nomina_detalle_id, gasto_id, monto)
        VALUES (v_tenant, p_detalle_id, v_adel.id, v_aplicar);
        v_resto := round(v_resto - v_aplicar, 2);
      END IF;
    END LOOP;
    IF v_resto > 0 THEN
      RAISE EXCEPTION 'El empleado no tiene adelantos pendientes por RD$% (sobra RD$%)', p_adelanto_descuento, v_resto;
    END IF;
  END IF;

  PERFORM public._nomina_recalcular(v_det.nid);
  RETURN jsonb_build_object('ok', true);
END $$;

-- ------------------------------------------------------------
-- 7) RPC: pagar / anular
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nomina_pagar(p_nomina_id uuid, p_forma_pago text DEFAULT 'Efectivo')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_nom    record;
BEGIN
  SELECT * INTO v_nom FROM public.nominas
  WHERE id = p_nomina_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nómina no encontrada'; END IF;
  IF v_nom.estado <> 'borrador' THEN RAISE EXCEPTION 'La nómina ya está %', v_nom.estado; END IF;

  UPDATE public.nominas SET estado = 'pagada', forma_pago = p_forma_pago, pagada_at = now()
  WHERE id = p_nomina_id;

  -- mismo cierre que el botón Pagar del dashboard
  UPDATE public.compromisos SET activo = false, fecha_pago = now(),
         forma_pago = p_forma_pago, referencia_pago = 'Nómina #' || v_nom.numero
  WHERE id = v_nom.compromiso_id;

  RETURN jsonb_build_object('ok', true, 'total_neto', v_nom.total_neto);
END $$;

CREATE OR REPLACE FUNCTION public.nomina_anular(p_nomina_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_nom    record;
BEGIN
  SELECT * INTO v_nom FROM public.nominas
  WHERE id = p_nomina_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nómina no encontrada'; END IF;
  IF v_nom.estado <> 'borrador' THEN RAISE EXCEPTION 'Solo se anula una nómina en borrador'; END IF;

  UPDATE public.nominas SET estado = 'anulada' WHERE id = p_nomina_id;
  -- liberar los descuentos de adelantos propuestos (vuelven a quedar pendientes)
  DELETE FROM public.nomina_adelanto_descuentos x
  USING public.nomina_detalle d
  WHERE d.id = x.nomina_detalle_id AND d.nomina_id = p_nomina_id;

  UPDATE public.compromisos SET activo = false WHERE id = v_nom.compromiso_id AND fecha_pago IS NULL;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ------------------------------------------------------------
-- 8) RPC: adelanto de sueldo (sale por gastos diarios HOY)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nomina_registrar_adelanto(
  p_empleado_id uuid,
  p_monto       numeric,
  p_descripcion text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_emp    record;
  v_id     uuid;
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 THEN RAISE EXCEPTION 'Monto inválido'; END IF;
  SELECT * INTO v_emp FROM public.empleados
  WHERE id = p_empleado_id AND tenant_id = v_tenant AND activo = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empleado no encontrado o inactivo'; END IF;

  INSERT INTO public.gastos_diarios (tenant_id, fecha, tipo_gasto, monto, descripcion, usuario_id, empleado_id, anulado)
  VALUES (v_tenant, (now() AT TIME ZONE 'America/Santo_Domingo')::date, 'Adelanto de sueldo',
          round(p_monto, 2),
          COALESCE(NULLIF(btrim(p_descripcion), ''), 'Adelanto de sueldo — ' || v_emp.nombre),
          auth.uid(), p_empleado_id, false)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'gasto_id', v_id);
END $$;

-- ------------------------------------------------------------
-- 9) Vista: adelantos con su pendiente (para la página y las nóminas)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.nomina_adelantos_pendientes
WITH (security_invoker = true) AS
SELECT
  g.tenant_id,
  g.id            AS gasto_id,
  g.empleado_id,
  e.nombre        AS empleado,
  g.fecha,
  g.monto,
  COALESCE((SELECT sum(x.monto) FROM public.nomina_adelanto_descuentos x
            JOIN public.nomina_detalle dd ON dd.id = x.nomina_detalle_id
            JOIN public.nominas nn ON nn.id = dd.nomina_id
            WHERE x.gasto_id = g.id AND nn.estado <> 'anulada'), 0) AS descontado,
  round(g.monto - COALESCE((SELECT sum(x.monto) FROM public.nomina_adelanto_descuentos x
            JOIN public.nomina_detalle dd ON dd.id = x.nomina_detalle_id
            JOIN public.nominas nn ON nn.id = dd.nomina_id
            WHERE x.gasto_id = g.id AND nn.estado <> 'anulada'), 0), 2) AS pendiente
FROM public.gastos_diarios g
JOIN public.empleados e ON e.id = g.empleado_id
WHERE g.tipo_gasto = 'Adelanto de sueldo' AND g.anulado = false;

GRANT SELECT ON public.nomina_adelantos_pendientes TO authenticated, service_role;

-- ------------------------------------------------------------
-- 10) Permisos de los RPC
-- ------------------------------------------------------------
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'nomina_generar(text,date,date,date)',
    'nomina_actualizar_detalle(uuid,numeric,numeric,numeric,text)',
    'nomina_pagar(uuid,text)',
    'nomina_anular(uuid)',
    'nomina_registrar_adelanto(uuid,numeric,text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
  EXECUTE 'REVOKE ALL ON FUNCTION public._nomina_recalcular(uuid) FROM PUBLIC, anon, authenticated';
END $$;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('nomina_modulo.sql');
  END IF;
END $$;

SELECT 'Módulo Nómina listo (empleados, corridas, adelantos por gastos, compromiso en dashboard)' AS status;
