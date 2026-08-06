-- =====================================================================
-- Editar el recibo cambiaba el banco pero NO sacaba la plata de la caja
-- ---------------------------------------------------------------------
-- (2026-08-06) "0147803 al editar el recibo no cambió la ubicación del
-- dinero": el recibo quedó como Transferencia, la entrada al banco se
-- registró bien, pero el cierre de caja siguió contando los RD$100,000 como
-- efectivo. Los RD$3,000 de la línea Transf/Cheque/Tarjeta debían ser 103,000.
--
-- >>> DOS NUMERACIONES DISTINTAS PARA EL MISMO RECIBO <<<
-- El pago vive en DOS tablas, cada una con su propio número:
--
--   prestamo_pagos.numero    = '0147803'     ← el que se ve en pantalla
--   recibos_ingreso.numero   = 'RI-147803'   ← el que lee el cierre de caja
--
-- Son dos secuencias separadas que coinciden por casualidad de dígitos. Lo
-- comprobé: de los 72 recibos de agosto, los 72 se corresponden quitando el
-- 'RI-' y los ceros de adelante. Pero editar_forma_pago_recibo comparaba los
-- textos COMPLETOS:
--
--   UPDATE public.recibos_ingreso ... WHERE numero = p_numero
--                                           'RI-147803' = '0147803'  → falso
--
-- Nunca encontraba la fila. El UPDATE no fallaba —actualizaba cero filas, que
-- para PostgreSQL es un día perfectamente normal— así que la edición se daba
-- por buena y el cuadre seguía mintiendo.
--
-- El cierre de caja lee formas_pago de recibos_ingreso (CierreCajaPage,
-- efectivoDeRecibo): mientras ahí diga 'Efectivo', el dinero sigue contando
-- como billetes en la gaveta.
--
-- >>> EL ARREGLO <<<
--   1. La búsqueda compara los dígitos como NÚMERO, no como texto, y además
--      exige que cuadren cliente y monto: así no hay forma de pisar el recibo
--      de otro.
--   2. La función devuelve 'recibo_caja' = cuántas filas movió. Si es 0, la
--      pantalla avisa en vez de decir que todo salió bien.
--   3. Se resincronizan los recibos que ya quedaron descuadrados — el 0147803
--      entre ellos.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.editar_forma_pago_recibo(
  p_numero    text,
  p_forma     text,
  p_cuenta    text DEFAULT NULL,
  p_banco     text DEFAULT NULL,
  p_password  text DEFAULT NULL,
  p_cuenta_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_pago   record;
  v_cli    text;
  v_caja   int := 0;
  v_dig    bigint;
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
  WHERE tenant_id = v_tenant AND numero = p_numero AND COALESCE(anulado, false) = false
  LIMIT 1;
  IF v_pago.id IS NULL THEN RAISE EXCEPTION 'Recibo % no encontrado', p_numero; END IF;

  UPDATE public.prestamo_pagos
  SET forma_pago = p_forma, cuenta_numero = p_cuenta, banco = p_banco
  WHERE id = v_pago.id;

  -- ---- LA CAJA ----
  -- recibos_ingreso numera aparte ('RI-147803' contra '0147803'), asi que se
  -- comparan los DIGITOS como numero. Cliente y monto van de candado para no
  -- tocar jamas el recibo de otra persona.
  v_dig := NULLIF(regexp_replace(p_numero, '\D', '', 'g'), '')::bigint;

  UPDATE public.recibos_ingreso ri
  SET formas_pago = jsonb_build_array(jsonb_build_object(
        'forma', p_forma, 'monto', v_pago.total_pagado,
        'referencia', COALESCE(NULLIF(btrim(p_cuenta), ''), p_numero)))
  WHERE ri.tenant_id = v_tenant
    AND COALESCE(ri.anulado, false) = false
    AND ri.cliente_id = v_pago.cliente_id
    AND ri.monto_pagado = v_pago.total_pagado
    AND NULLIF(regexp_replace(ri.numero, '\D', '', 'g'), '')::bigint = v_dig;

  GET DIAGNOSTICS v_caja = ROW_COUNT;

  -- ---- EL BANCO ----
  IF p_forma = 'Efectivo' THEN
    DELETE FROM public.movimientos_bancarios
     WHERE origen_tipo = 'recibo' AND origen_id = v_pago.id;
  ELSIF p_cuenta_id IS NOT NULL THEN
    SELECT nombre INTO v_cli FROM public.clientes WHERE id = v_pago.cliente_id;
    PERFORM public.registrar_movimiento_bancario(
      p_cuenta_id, 'ENTRADA', v_pago.total_pagado,
      btrim('Recibo ' || p_numero || ' — ' || COALESCE(v_cli, '')),
      COALESCE(p_cuenta, p_numero),
      'recibo', v_pago.id, v_pago.fecha::date
    );
  END IF;

  RETURN json_build_object(
    'numero',      p_numero,
    'forma',       p_forma,
    'monto',       v_pago.total_pagado,
    'recibo_caja', v_caja,   -- 0 = el cierre de caja NO se entero
    'al_banco',    (p_forma <> 'Efectivo' AND p_cuenta_id IS NOT NULL)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.editar_forma_pago_recibo(text, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.editar_forma_pago_recibo(text, text, text, text, text, uuid) TO authenticated;

-- ------------------------------------------------------------
-- RESINCRONIZAR LOS QUE YA QUEDARON DESCUADRADOS
-- ------------------------------------------------------------
-- prestamo_pagos manda: es lo que escribe el modal de edición. Donde el
-- recibo de caja diga otra cosa, se le pone la buena.
DO $$
DECLARE v_n int;
BEGIN
  UPDATE public.recibos_ingreso ri
  SET formas_pago = jsonb_build_array(jsonb_build_object(
        'forma', COALESCE(p.forma_pago, 'Efectivo'),
        'monto', p.total_pagado,
        'referencia', COALESCE(NULLIF(btrim(p.cuenta_numero), ''), p.numero)))
  FROM public.prestamo_pagos p
  WHERE p.tenant_id = ri.tenant_id
    AND COALESCE(p.anulado, false) = false
    AND COALESCE(ri.anulado, false) = false
    AND ri.cliente_id = p.cliente_id
    AND ri.monto_pagado = p.total_pagado
    AND NULLIF(regexp_replace(ri.numero, '\D', '', 'g'), '')::bigint
        = NULLIF(regexp_replace(p.numero, '\D', '', 'g'), '')::bigint
    AND COALESCE(ri.formas_pago::jsonb -> 0 ->> 'forma', 'Efectivo')
        IS DISTINCT FROM COALESCE(p.forma_pago, 'Efectivo');

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Recibos de caja resincronizados: %', v_n;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_editar_recibo_no_movia_la_caja.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) EL 0147803 YA DEBE DECIR TRANSFERENCIA EN LOS DOS LADOS
SELECT p.numero AS pago, p.forma_pago, p.total_pagado,
       ri.numero AS recibo_caja, ri.formas_pago
FROM public.prestamo_pagos p
JOIN public.recibos_ingreso ri
  ON ri.tenant_id = p.tenant_id
 AND ri.cliente_id = p.cliente_id
 AND ri.monto_pagado = p.total_pagado
 AND NULLIF(regexp_replace(ri.numero, '\D', '', 'g'), '')::bigint
     = NULLIF(regexp_replace(p.numero, '\D', '', 'g'), '')::bigint
WHERE p.numero = '0147803';
-- esperado: formas_pago con 'Transferencia' y 100000.

-- 2) QUE NO QUEDE NINGUNO DESCUADRADO
SELECT p.numero, p.fecha::date, p.total_pagado,
       p.forma_pago            AS dice_el_pago,
       ri.formas_pago -> 0 ->> 'forma' AS dice_la_caja
FROM public.prestamo_pagos p
JOIN public.recibos_ingreso ri
  ON ri.tenant_id = p.tenant_id
 AND ri.cliente_id = p.cliente_id
 AND ri.monto_pagado = p.total_pagado
 AND NULLIF(regexp_replace(ri.numero, '\D', '', 'g'), '')::bigint
     = NULLIF(regexp_replace(p.numero, '\D', '', 'g'), '')::bigint
WHERE COALESCE(p.anulado, false) = false
  AND COALESCE(ri.anulado, false) = false
  AND COALESCE(ri.formas_pago -> 0 ->> 'forma', 'Efectivo')
      IS DISTINCT FROM COALESCE(p.forma_pago, 'Efectivo')
ORDER BY p.fecha DESC;
-- esperado: ninguna fila.

-- 3) EL CUADRE DE HOY DE MOTOPRÉSTAMOS
SELECT SUM(monto_pagado) AS total_recibos,
       SUM(CASE WHEN formas_pago -> 0 ->> 'forma' = 'Efectivo'
                THEN monto_pagado ELSE 0 END) AS en_efectivo,
       SUM(CASE WHEN formas_pago -> 0 ->> 'forma' <> 'Efectivo'
                THEN monto_pagado ELSE 0 END) AS transf_cheque_tarjeta
FROM public.recibos_ingreso
WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND fecha = '2026-08-06' AND COALESCE(anulado, false) = false;
-- esperado: 183,905.98 · 80,905.98 · 103,000.00
-- (antes decía 180,905.98 en efectivo y solo 3,000 por banco)
