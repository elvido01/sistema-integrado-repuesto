-- =====================================================================
-- SAN: poder fijar el pago diario en un monto REDONDO
-- ---------------------------------------------------------------------
-- (2026-07-27) Hasta ahora el pago diario salía siempre de meta ÷ días, y
-- daba números incómodos de cobrar: 250,000 en 75 días = 3,333.33 al día.
--
-- Ahora se puede fijar el diario en un monto redondo y el ÚLTIMO día absorbe
-- la diferencia, de más o de menos. LA META NO SE MUEVE:
--
--   meta 250,000 en 75 días
--     automático  ->  74 x 3,333.33 + 3,333.58  = 250,000
--     a 3,300     ->  74 x 3,300.00 + 5,800.00  = 250,000   (último de más)
--     a 3,350     ->  74 x 3,350.00 + 2,100.00  = 250,000   (último de menos)
--
-- Es opcional: si no se manda p_pago_diario (o va en NULL/0) se comporta
-- exactamente igual que antes.
--
-- LÍMITE: el último día tiene que quedar en más de cero, así que el diario
-- no puede pasar de meta ÷ (días - 1). Con 250,000 en 75 días el techo es
-- 3,378.37. Si se pasa, la función lo rechaza con el máximo en el mensaje
-- en vez de crear un calendario con un día en negativo.
--
-- Con un solo día no hay nada que repartir: ese día es la meta completa y
-- p_pago_diario se ignora.
--
-- Reemplaza san_crear (era 5 args) y san_editar (era 6). Idempotente.
-- Requiere sql/san_cuenta_bancaria.sql y sql/san_editar_cuenta.sql antes.
-- =====================================================================

DROP FUNCTION IF EXISTS public.san_crear(text, numeric, int, date, uuid);

CREATE OR REPLACE FUNCTION public.san_crear(
  p_nombre             text,
  p_monto_objetivo     numeric,
  p_dias               int,
  p_fecha_inicio       date DEFAULT NULL,
  p_cuenta_bancaria_id uuid DEFAULT NULL,
  p_pago_diario        numeric DEFAULT NULL   -- NULL/0 = automático (meta ÷ días)
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_inicio date := COALESCE(p_fecha_inicio, (now() AT TIME ZONE 'America/Santo_Domingo')::date);
  v_diario numeric;
  v_ultimo numeric;
  v_max    numeric;
  v_san    uuid;
  i        int;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF NULLIF(btrim(p_nombre), '') IS NULL THEN RAISE EXCEPTION 'Ponle nombre o propósito al SAN'; END IF;
  IF COALESCE(p_monto_objetivo, 0) <= 0 THEN RAISE EXCEPTION 'Monto objetivo inválido'; END IF;
  IF COALESCE(p_dias, 0) <= 0 THEN RAISE EXCEPTION 'Cantidad de días inválida'; END IF;

  IF p_dias = 1 THEN
    v_diario := round(p_monto_objetivo, 2);
  ELSE
    v_diario := round(COALESCE(NULLIF(p_pago_diario, 0), p_monto_objetivo / p_dias), 2);
  END IF;
  v_ultimo := round(p_monto_objetivo - v_diario * (p_dias - 1), 2);

  IF v_ultimo <= 0 THEN
    -- ceil()-1 y no floor(): si la división es exacta, floor dejaría el último
    -- día en cero, que tampoco vale.
    v_max := (ceil((p_monto_objetivo / (p_dias - 1)) * 100) - 1) / 100;
    RAISE EXCEPTION 'Un pago diario de % no cabe en % días: el último día quedaría en %. El máximo es %.',
      v_diario, p_dias, v_ultimo, v_max;
  END IF;

  INSERT INTO public.san (tenant_id, nombre, monto_objetivo, dias, pago_diario,
                          fecha_inicio, fecha_fin, cuenta_bancaria_id)
  VALUES (v_tenant, btrim(p_nombre), round(p_monto_objetivo, 2), p_dias, v_diario,
          v_inicio, v_inicio + (p_dias - 1), p_cuenta_bancaria_id)
  RETURNING id INTO v_san;

  FOR i IN 1..p_dias LOOP
    INSERT INTO public.san_pagos (tenant_id, san_id, numero_dia, fecha_programada,
                                  monto_programado, saldo_pendiente)
    VALUES (v_tenant, v_san, i, v_inicio + (i - 1),
            CASE WHEN i = p_dias THEN v_ultimo ELSE v_diario END,
            CASE WHEN i = p_dias THEN v_ultimo ELSE v_diario END);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'san_id', v_san, 'pago_diario', v_diario,
                            'ultimo_dia', v_ultimo,
                            'fecha_fin', v_inicio + (p_dias - 1));
END $$;

-- ---------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.san_editar(uuid, text, numeric, int, date, uuid);

CREATE OR REPLACE FUNCTION public.san_editar(
  p_san_id             uuid,
  p_nombre             text,
  p_monto_objetivo     numeric,
  p_dias               int,
  p_fecha_inicio       date,
  p_cuenta_bancaria_id uuid DEFAULT NULL,
  p_pago_diario        numeric DEFAULT NULL   -- NULL/0 = automático (meta ÷ días)
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_san      record;
  v_diario   numeric;
  v_ultimo   numeric;
  v_max      numeric;
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

  IF p_dias = 1 THEN
    v_diario := round(p_monto_objetivo, 2);
  ELSE
    v_diario := round(COALESCE(NULLIF(p_pago_diario, 0), p_monto_objetivo / p_dias), 2);
  END IF;
  v_ultimo := round(p_monto_objetivo - v_diario * (p_dias - 1), 2);

  IF v_ultimo <= 0 THEN
    -- ceil()-1 y no floor(): si la división es exacta, floor dejaría el último
    -- día en cero, que tampoco vale.
    v_max := (ceil((p_monto_objetivo / (p_dias - 1)) * 100) - 1) / 100;
    RAISE EXCEPTION 'Un pago diario de % no cabe en % días: el último día quedaría en %. El máximo es %.',
      v_diario, p_dias, v_ultimo, v_max;
  END IF;

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
                            'ultimo_dia', v_ultimo,
                            'sobrante_sin_aplicar', GREATEST(v_resto, 0));
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('san_pago_diario_redondeado.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) Las dos funciones quedaron con el argumento nuevo
SELECT 'san_crear'  AS fn, to_regprocedure('public.san_crear(text,numeric,int,date,uuid,numeric)')::text  AS firma
UNION ALL
SELECT 'san_editar', to_regprocedure('public.san_editar(uuid,text,numeric,int,date,uuid,numeric)')::text;
-- esperado: las dos con firma (no NULL)

-- 2) Y las viejas ya no están, para que PostgREST no dude cuál llamar
SELECT to_regprocedure('public.san_crear(text,numeric,int,date,uuid)')::text  AS crear_vieja,
       to_regprocedure('public.san_editar(uuid,text,numeric,int,date,uuid)')::text AS editar_vieja;
-- esperado: las dos en NULL
