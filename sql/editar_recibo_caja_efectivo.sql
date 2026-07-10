-- =====================================================================
-- 1) Caja del día: de los recibos de ingreso solo cuenta la porción EN
--    EFECTIVO (transferencia/cheque/tarjeta no son efectivo físico).
-- 2) Opciones > Editar en Recibo de Pago: cambiar la forma de pago de un
--    recibo ya grabado. Si el usuario NO es administrador, exige la
--    contraseña de una cuenta administrativa (validada en el servidor).
-- =====================================================================

-- ¿La contraseña corresponde a algún admin/owner de ESTA empresa?
CREATE OR REPLACE FUNCTION public.verificar_password_administrativo(p_password text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.profiles pr ON pr.id = u.id
    WHERE pr.tenant_id = public.get_user_tenant()
      AND pr.role IN ('admin', 'owner')
      AND u.encrypted_password = extensions.crypt(p_password, u.encrypted_password)
  );
$$;
GRANT EXECUTE ON FUNCTION public.verificar_password_administrativo(text) TO authenticated;

-- Editar la forma de pago de un recibo (prestamo_pagos + recibos_ingreso)
CREATE OR REPLACE FUNCTION public.editar_forma_pago_recibo(
  p_numero text, p_forma text,
  p_cuenta text DEFAULT NULL, p_banco text DEFAULT NULL,
  p_password text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_pago   record;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF p_forma NOT IN ('Efectivo', 'Cheque', 'Tarjeta', 'Transferencia') THEN
    RAISE EXCEPTION 'Forma de pago inválida: %', p_forma;
  END IF;
  -- Candado: no-admin necesita la contraseña de un administrativo
  IF NOT public.es_usuario_admin() THEN
    IF p_password IS NULL OR NOT public.verificar_password_administrativo(p_password) THEN
      RAISE EXCEPTION 'Contraseña administrativa incorrecta';
    END IF;
  END IF;

  SELECT * INTO v_pago FROM public.prestamo_pagos
  WHERE tenant_id = v_tenant AND numero = p_numero AND COALESCE(anulado, false) = false
  LIMIT 1;
  IF v_pago.id IS NULL THEN RAISE EXCEPTION 'Recibo % no encontrado', p_numero; END IF;

  UPDATE public.prestamo_pagos
  SET forma_pago = p_forma, cuenta_numero = p_cuenta, banco = p_banco
  WHERE id = v_pago.id;

  UPDATE public.recibos_ingreso
  SET formas_pago = jsonb_build_array(jsonb_build_object(
        'forma', p_forma, 'monto', v_pago.total_pagado, 'referencia', p_numero))
  WHERE tenant_id = v_tenant AND numero = p_numero;

  RETURN json_build_object('numero', p_numero, 'forma', p_forma, 'monto', v_pago.total_pagado);
END;
$function$;
GRANT EXECUTE ON FUNCTION public.editar_forma_pago_recibo(text, text, text, text, text) TO authenticated;

-- Caja del día: recibos solo por su porción en efectivo
CREATE OR REPLACE FUNCTION public.get_caja_excedente_dashboard()
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant      uuid := public.get_user_tenant();
  v_seed        numeric := 0;
  v_anchor_date date := DATE '1970-01-01';
  v_anchor_ts   timestamptz;
  v_today       date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_today_ts    timestamptz;
  v_mes_ini     date := date_trunc('month', (now() AT TIME ZONE 'America/Santo_Domingo')::date)::date;
  v_excedente   numeric := 0;
  v_caja_hoy    numeric := 0;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar el tenant del usuario';
  END IF;

  SELECT COALESCE(saldo_inicial_caja, 0),
         COALESCE(caja_historial_desde, DATE '1970-01-01')
    INTO v_seed, v_anchor_date
  FROM public.config_empresa
  WHERE tenant_id = v_tenant
  LIMIT 1;

  v_anchor_ts := (v_anchor_date::timestamp AT TIME ZONE 'America/Santo_Domingo');
  v_today_ts  := (v_today::timestamp     AT TIME ZONE 'America/Santo_Domingo');

  -- ---------- EXCEDENTE ----------
  v_excedente := v_seed
    + COALESCE((SELECT SUM(total) FROM public.facturas
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND forma_pago ILIKE 'contado' AND COALESCE(estado, '') <> 'ANULADA'), 0)
    + COALESCE((SELECT SUM(monto_pagado) FROM public.recibos_ingreso
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND COALESCE(anulado, false) = false), 0)
    - COALESCE((SELECT SUM(monto) FROM public.compromisos
        WHERE tenant_id = v_tenant AND fecha_pago >= v_anchor_ts
          AND activo = false), 0)
    - COALESCE((SELECT SUM(monto_pagado) FROM public.pagos_suplidores
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND COALESCE(anulado, false) = false), 0)
    - COALESCE((SELECT SUM(total_compra) FROM public.compras
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND forma_pago ILIKE 'contado' AND COALESCE(estado, '') <> 'ANULADA'), 0)
    - COALESCE((SELECT SUM(monto) FROM public.gastos_diarios
        WHERE tenant_id = v_tenant AND fecha >= v_anchor_date
          AND COALESCE(anulado, false) = false), 0)
    - COALESCE((SELECT SUM(total_comision) FROM public.pagos_comisiones
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND UPPER(COALESCE(forma_pago,'EFECTIVO')) = 'TRANSFERENCIA'
          AND COALESCE(anulado, false) = false), 0)
    - COALESCE((SELECT SUM(monto_capital) FROM public.prestamos
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND desembolso IS NOT NULL), 0);

  -- ---------- CAJA DE HOY (efectivo fisico del dia) ----------
  v_caja_hoy :=
      COALESCE((SELECT SUM(total) FROM public.facturas
        WHERE tenant_id = v_tenant AND created_at >= v_today_ts
          AND forma_pago ILIKE 'contado' AND COALESCE(estado, '') <> 'ANULADA'), 0)
    -- recibos de HOY: solo la porcion EN EFECTIVO (sin formas_pago = todo efectivo)
    + COALESCE((
        SELECT SUM(
          CASE WHEN jsonb_typeof(COALESCE(ri.formas_pago::jsonb, 'null'::jsonb)) = 'array'
                 AND jsonb_array_length(ri.formas_pago::jsonb) > 0
               THEN (SELECT COALESCE(SUM((f->>'monto')::numeric), 0)
                     FROM jsonb_array_elements(ri.formas_pago::jsonb) f
                     WHERE (f->>'forma') ILIKE '%efectivo%')
               ELSE ri.monto_pagado END)
        FROM public.recibos_ingreso ri
        WHERE ri.tenant_id = v_tenant AND ri.created_at >= v_today_ts
          AND COALESCE(ri.anulado, false) = false
      ), 0)
    - COALESCE((SELECT SUM(monto) FROM public.gastos_diarios
        WHERE tenant_id = v_tenant AND fecha = v_today
          AND COALESCE(anulado, false) = false), 0)
    -- pagos a suplidores de HOY: solo la porcion EN EFECTIVO (pagos mixtos)
    - COALESCE((
        SELECT SUM((f->>'monto')::numeric)
        FROM public.pagos_suplidores ps,
             jsonb_array_elements(COALESCE(ps.formas_pago, '[]'::jsonb)) f
        WHERE ps.tenant_id = v_tenant
          AND ps.created_at >= v_today_ts
          AND COALESCE(ps.anulado, false) = false
          AND (f->>'forma') ILIKE '%efectivo%'
      ), 0)
    -- compromisos pagados HOY en efectivo (nomina, alquiler, etc.)
    - COALESCE((SELECT SUM(monto) FROM public.compromisos
        WHERE tenant_id = v_tenant AND activo = false
          AND fecha_pago >= v_today_ts
          AND COALESCE(forma_pago, 'Efectivo') ILIKE '%efectivo%'), 0)
    -- desembolsos de préstamos de HOY entregados EN EFECTIVO
    - COALESCE((SELECT SUM(monto_capital) FROM public.prestamos
        WHERE tenant_id = v_tenant AND created_at >= v_today_ts
          AND desembolso ILIKE 'efectivo'), 0);

  RETURN json_build_object(
    'excedente',     ROUND(v_excedente, 2),
    'caja_hoy',      ROUND(v_caja_hoy, 2),
    'saldo_inicial', ROUND(v_seed, 2),
    'anchor',        v_anchor_date,
    'debe_rodar',    (v_anchor_date < v_mes_ini)
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('editar_recibo_caja_efectivo.sql');
  END IF;
END $$;

SELECT 'Editar recibo + caja del día solo efectivo listos' AS status;
