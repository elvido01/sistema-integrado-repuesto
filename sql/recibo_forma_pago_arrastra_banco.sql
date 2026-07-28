-- =====================================================================
-- Recibo de pago: al cambiar la forma, arrastrar el movimiento del banco
-- ---------------------------------------------------------------------
-- (2026-07-28) Reportado: el recibo 0147692 se grabó por transferencia a la
-- 004110544 por equivocación (el sistema dejaba pegada la forma del recibo
-- anterior). Al querer corregirlo salió el problema de fondo:
--
--   editar_forma_pago_recibo cambiaba prestamo_pagos y recibos_ingreso,
--   PERO DEJABA EL MOVIMIENTO DEL BANCO INTACTO.
--
-- O sea: pasabas un recibo de transferencia a efectivo, el dinero empezaba
-- a contarse en la caja del día... y seguía también en el banco. Contado dos
-- veces, sin que nada avisara.
--
-- Ahora la función se hace cargo de las tres cosas a la vez:
--   * a EFECTIVO  -> borra la entrada del banco
--   * a un medio bancario -> si no tenía movimiento, lo crea en la cuenta
--     por defecto de recibos; si ya lo tenía, le ajusta el concepto
--
-- El movimiento se localiza por el CONCEPTO ('Recibo <numero> — ...'), porque
-- el frontend los venía guardando con origen_id vacío. De paso esta función
-- ahora SÍ lo llena, así que los nuevos quedan enlazados de verdad.
--
-- Mantiene el candado que ya tenía: quien no es admin necesita la contraseña
-- administrativa para cambiar la forma de un recibo.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.editar_forma_pago_recibo(
  p_numero   text,
  p_forma    text,
  p_cuenta   text DEFAULT NULL,
  p_banco    text DEFAULT NULL,
  p_password text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant  uuid := public.get_user_tenant();
  v_pago    record;
  v_cli     text;
  v_cuenta  uuid;
  v_mov     uuid;
  v_accion  text := 'sin cambio en banco';
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No se pudo determinar el tenant'; END IF;
  IF p_forma NOT IN ('Efectivo', 'Cheque', 'Tarjeta', 'Transferencia') THEN
    RAISE EXCEPTION 'Forma de pago inválida: %', p_forma;
  END IF;
  IF NOT public.es_usuario_admin() THEN
    IF p_password IS NULL OR NOT public.verificar_password_administrativo(p_password) THEN
      RAISE EXCEPTION 'Contraseña administrativa incorrecta';
    END IF;
  END IF;

  SELECT * INTO v_pago FROM public.prestamo_pagos
   WHERE tenant_id = v_tenant AND numero = p_numero
     AND COALESCE(anulado, false) = false
   LIMIT 1;
  IF v_pago.id IS NULL THEN RAISE EXCEPTION 'Recibo % no encontrado', p_numero; END IF;

  SELECT nombre INTO v_cli FROM public.clientes WHERE id = v_pago.cliente_id;

  UPDATE public.prestamo_pagos
     SET forma_pago = p_forma,
         cuenta_numero = CASE WHEN p_forma = 'Efectivo' THEN NULL ELSE p_cuenta END,
         banco         = CASE WHEN p_forma = 'Efectivo' THEN NULL ELSE p_banco END
   WHERE id = v_pago.id;

  -- De aquí saca el cierre de caja cuánto entró en efectivo
  UPDATE public.recibos_ingreso
     SET formas_pago = jsonb_build_array(jsonb_build_object(
           'forma', p_forma, 'monto', v_pago.total_pagado, 'referencia', p_numero))
   WHERE tenant_id = v_tenant AND numero = 'RI-' || ltrim(p_numero, '0');

  -- El movimiento del banco de este recibo (los viejos no traen origen_id,
  -- así que se busca por el concepto, que siempre lleva el número).
  SELECT id INTO v_mov FROM public.movimientos_bancarios
   WHERE tenant_id = v_tenant
     AND origen_tipo = 'recibo'
     AND (origen_id = v_pago.id OR concepto LIKE 'Recibo ' || p_numero || ' %')
   LIMIT 1;

  IF p_forma = 'Efectivo' THEN
    -- Pasa a la caja: NO puede seguir en el banco.
    IF v_mov IS NOT NULL THEN
      DELETE FROM public.movimientos_bancarios WHERE id = v_mov;
      v_accion := 'entrada al banco eliminada';
    END IF;
  ELSE
    IF v_mov IS NULL THEN
      -- No tenía movimiento: crearlo en la cuenta por defecto de recibos.
      SELECT cuenta_id INTO v_cuenta FROM public.cuentas_bancarias_default
       WHERE tenant_id = v_tenant AND modulo = 'recibo';
      IF v_cuenta IS NULL THEN
        SELECT id INTO v_cuenta FROM public.cuentas_bancarias
         WHERE tenant_id = v_tenant AND activo AND moneda = 'DOP'
         ORDER BY orden, banco LIMIT 1;
      END IF;
      IF v_cuenta IS NOT NULL THEN
        INSERT INTO public.movimientos_bancarios
          (tenant_id, cuenta_id, tipo, monto, concepto, referencia,
           origen_tipo, origen_id, fecha, usuario_id)
        VALUES (v_tenant, v_cuenta, 'ENTRADA', v_pago.total_pagado,
                'Recibo ' || p_numero || ' — ' || COALESCE(v_cli, 'cliente'),
                p_cuenta, 'recibo', v_pago.id, v_pago.fecha, auth.uid());
        v_accion := 'entrada al banco creada';
      ELSE
        v_accion := 'no hay cuenta bancaria donde registrarlo';
      END IF;
    ELSE
      UPDATE public.movimientos_bancarios
         SET concepto  = 'Recibo ' || p_numero || ' — ' || COALESCE(v_cli, 'cliente'),
             referencia = COALESCE(p_cuenta, referencia),
             origen_id  = COALESCE(origen_id, v_pago.id)
       WHERE id = v_mov;
      v_accion := 'entrada al banco actualizada';
    END IF;
  END IF;

  RETURN json_build_object('numero', p_numero, 'forma', p_forma,
                           'monto', v_pago.total_pagado, 'banco', v_accion);
END $$;

GRANT EXECUTE ON FUNCTION public.editar_forma_pago_recibo(text, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------
-- El caso reportado: el recibo 0147692 va en EFECTIVO, no por transferencia
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_fin  uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';  -- MOTOPRESTAMOS LOS NARANJOS
  v_pago record;
  v_n    int;
BEGIN
  SELECT * INTO v_pago FROM public.prestamo_pagos
   WHERE tenant_id = v_fin AND numero = '0147692' AND COALESCE(anulado, false) = false;
  IF NOT FOUND THEN
    RAISE NOTICE 'No se encontró el recibo 0147692 — nada que hacer.';
    RETURN;
  END IF;

  UPDATE public.prestamo_pagos
     SET forma_pago = 'Efectivo', banco = NULL, cuenta_numero = NULL
   WHERE id = v_pago.id;

  UPDATE public.recibos_ingreso
     SET formas_pago = jsonb_build_array(jsonb_build_object(
           'forma', 'Efectivo', 'monto', v_pago.total_pagado, 'referencia', '0147692'))
   WHERE tenant_id = v_fin AND numero = 'RI-147692';

  DELETE FROM public.movimientos_bancarios
   WHERE tenant_id = v_fin AND origen_tipo = 'recibo'
     AND concepto LIKE 'Recibo 0147692 %';
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RAISE NOTICE 'Recibo 0147692 pasado a EFECTIVO (RD$%). Entradas al banco eliminadas: %',
    v_pago.total_pagado, v_n;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('recibo_forma_pago_arrastra_banco.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) El 0147692 ya está en efectivo y sin movimiento en el banco
SELECT p.numero, p.forma_pago, p.banco, p.total_pagado,
       (SELECT count(*) FROM public.movimientos_bancarios m
         WHERE m.tenant_id = p.tenant_id AND m.origen_tipo = 'recibo'
           AND m.concepto LIKE 'Recibo ' || p.numero || ' %') AS movimientos_banco
FROM public.prestamo_pagos p
WHERE p.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4' AND p.numero = '0147692';
-- esperado: Efectivo | banco NULL | 6,000 | 0 movimientos

-- 2) Los recibos de HOY: forma y si tienen entrada al banco (deben cuadrar)
SELECT p.numero, p.forma_pago, p.total_pagado,
       (SELECT count(*) FROM public.movimientos_bancarios m
         WHERE m.tenant_id = p.tenant_id AND m.origen_tipo = 'recibo'
           AND m.concepto LIKE 'Recibo ' || p.numero || ' %') AS en_banco
FROM public.prestamo_pagos p
WHERE p.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND p.fecha = DATE '2026-07-28' AND NOT COALESCE(p.anulado, false)
ORDER BY p.numero;
-- esperado: los 'Efectivo' con en_banco 0; los de transferencia con 1

-- 3) El efectivo esperado en la gaveta hoy, ya con el 0147692 dentro
SELECT SUM((SELECT COALESCE(SUM((f->>'monto')::numeric), 0)
              FROM jsonb_array_elements(r.formas_pago) f
             WHERE lower(f->>'forma') LIKE '%efectivo%')) AS efectivo_del_dia,
       SUM(r.monto_pagado) AS total_recibos
FROM public.recibos_ingreso r
WHERE r.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND r.fecha = DATE '2026-07-28' AND NOT r.anulado;
-- el efectivo debe subir RD$6,000 respecto a antes de correr esto
