-- =====================================================================
-- san_editar: permitir cambiar la cuenta bancaria del SAN
-- ---------------------------------------------------------------------
-- Agrega p_cuenta_bancaria_id (6º arg). El frontend siempre lo manda (la
-- cuenta actual o la nueva); null la desvincula. Reemplaza el 5-arg viejo.
-- Idempotente / re-ejecutable. Requiere sql/san_cuenta_bancaria.sql antes.
-- =====================================================================

DROP FUNCTION IF EXISTS public.san_editar(uuid, text, numeric, int, date);

CREATE OR REPLACE FUNCTION public.san_editar(
  p_san_id             uuid,
  p_nombre             text,
  p_monto_objetivo     numeric,
  p_dias               int,
  p_fecha_inicio       date,
  p_cuenta_bancaria_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_san      record;
  v_diario   numeric;
  v_ultimo   numeric;
  v_resto    numeric;
  v_aplicar  numeric;
  v_prog     numeric;
  v_completo boolean;
  i          int;
BEGIN
  SELECT * INTO v_san FROM public.san
  WHERE id = p_san_id AND tenant_id = v_tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SAN no encontrado'; END IF;
  IF v_san.estado NOT IN ('Activo','Cancelado') THEN
    RAISE EXCEPTION 'Un SAN % no se edita', v_san.estado;
  END IF;
  IF NULLIF(btrim(p_nombre), '') IS NULL THEN RAISE EXCEPTION 'Ponle nombre al SAN'; END IF;
  IF COALESCE(p_monto_objetivo, 0) <= 0 THEN RAISE EXCEPTION 'Monto objetivo inválido'; END IF;
  IF COALESCE(p_dias, 0) <= 0 THEN RAISE EXCEPTION 'Cantidad de días inválida'; END IF;

  v_diario := round(p_monto_objetivo / p_dias, 2);
  v_ultimo := round(p_monto_objetivo - v_diario * (p_dias - 1), 2);

  DELETE FROM public.san_pagos WHERE san_id = p_san_id;
  v_resto := round(COALESCE(v_san.monto_ahorrado, 0), 2);

  FOR i IN 1..p_dias LOOP
    v_prog := CASE WHEN i = p_dias THEN v_ultimo ELSE v_diario END;
    v_aplicar := LEAST(v_prog, GREATEST(v_resto, 0));
    INSERT INTO public.san_pagos (tenant_id, san_id, numero_dia, fecha_programada,
                                  monto_programado, monto_pagado, saldo_pendiente,
                                  estado, fecha_pago, usuario)
    VALUES (v_tenant, p_san_id, i, p_fecha_inicio + (i - 1),
            v_prog, v_aplicar, round(v_prog - v_aplicar, 2),
            CASE WHEN v_aplicar >= v_prog THEN 'Pagado'
                 WHEN v_aplicar > 0 THEN 'Parcial' ELSE 'Pendiente' END,
            CASE WHEN v_aplicar >= v_prog THEN now() END,
            auth.uid());
    v_resto := round(v_resto - v_aplicar, 2);
  END LOOP;

  v_completo := NOT EXISTS (SELECT 1 FROM public.san_pagos
                            WHERE san_id = p_san_id AND estado <> 'Pagado');

  UPDATE public.san SET
    nombre             = btrim(p_nombre),
    monto_objetivo     = round(p_monto_objetivo, 2),
    dias               = p_dias,
    pago_diario        = v_diario,
    fecha_inicio       = p_fecha_inicio,
    fecha_fin          = p_fecha_inicio + (p_dias - 1),
    cuenta_bancaria_id = p_cuenta_bancaria_id,
    estado             = CASE WHEN v_completo THEN 'Completado' ELSE 'Activo' END
  WHERE id = p_san_id;

  RETURN jsonb_build_object('ok', true, 'reactivado', (v_san.estado = 'Cancelado'),
                            'completado', v_completo, 'pago_diario', v_diario,
                            'sobrante_sin_aplicar', GREATEST(v_resto, 0));
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('san_editar_cuenta.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

SELECT 'san_editar(6 args)' AS objeto,
  to_regprocedure('public.san_editar(uuid,text,numeric,int,date,uuid)')::text AS existe;
