-- =====================================================================
-- Editar recibo: elegir la cuenta del banco, y que la plata ENTRE al banco
-- ---------------------------------------------------------------------
-- (2026-08-06) "no me aparece la cuenta del banco" — al cambiar un recibo de
-- Efectivo a Transferencia, el modal pedía escribir el banco a mano en vez de
-- ofrecer la lista de cuentas de la empresa.
--
-- Buscando eso apareció algo más serio, que nadie habría notado mirando la
-- pantalla:
--
-- >>> EL DINERO NO ENTRABA A LA CUENTA <<<
-- Cuando el recibo se graba de una vez como Transferencia, el sistema mete la
-- entrada en la cuenta bancaria (registrar_movimiento_bancario). Pero cuando
-- se graba en Efectivo y DESPUÉS se edita a Transferencia,
-- editar_forma_pago_recibo solo cambiaba la etiqueta: forma_pago,
-- cuenta_numero y banco. Ningún movimiento bancario.
--
-- El resultado es un recibo que ya no cuenta como efectivo en el cierre de
-- caja —correcto— pero que tampoco aparece en el saldo del banco. La plata
-- desaparece de los dos lados. Con el recibo 0147803, que son RD$100,000, el
-- hueco es de cien mil pesos.
--
-- >>> LO QUE CAMBIA <<<
-- La función recibe la cuenta (p_cuenta_id) y mueve la plata en consecuencia:
--
--   a banco (Transferencia/Cheque/Tarjeta) → ENTRADA en la cuenta elegida
--   de vuelta a Efectivo                   → se borra esa entrada
--
-- Se apoya en el upsert por (tenant_id, origen_tipo, origen_id) que ya trae
-- registrar_movimiento_bancario: editar dos veces el mismo recibo corrige el
-- movimiento en vez de duplicarlo, y cambiar de cuenta lo mueve de cuenta.
--
-- Se REEMPLAZA la versión de 5 argumentos en vez de dejar las dos: con ambas
-- vivas, una llamada de 5 argumentos encaja en las dos y PostgREST responde
-- "could not choose the best candidate function".
--
-- Idempotente / re-ejecutable.
-- =====================================================================

DROP FUNCTION IF EXISTS public.editar_forma_pago_recibo(text, text, text, text, text);

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

  -- ---- LA PLATA ----
  IF p_forma = 'Efectivo' THEN
    -- Volvió a caja: si había una entrada al banco por este recibo, se va.
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
    'numero', p_numero,
    'forma',  p_forma,
    'monto',  v_pago.total_pagado,
    'al_banco', (p_forma <> 'Efectivo' AND p_cuenta_id IS NOT NULL)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.editar_forma_pago_recibo(text, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.editar_forma_pago_recibo(text, text, text, text, text, uuid) TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('editar_recibo_cuenta_bancaria.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) RECIBOS QUE NO SON EFECTIVO Y NO ENTRARON A NINGUNA CUENTA
--    (los editados antes de este arreglo — hay que rehacerles la edición
--    eligiendo la cuenta, o meterles el movimiento a mano)
SELECT p.numero, p.fecha::date, p.total_pagado, p.forma_pago, p.banco, c.nombre AS cliente
FROM public.prestamo_pagos p
LEFT JOIN public.clientes c ON c.id = p.cliente_id
WHERE COALESCE(p.anulado, false) = false
  AND COALESCE(p.forma_pago, 'Efectivo') <> 'Efectivo'
  AND NOT EXISTS (
    SELECT 1 FROM public.movimientos_bancarios m
     WHERE m.origen_tipo = 'recibo' AND m.origen_id = p.id)
ORDER BY p.fecha DESC;

-- 2) EL 0147803 EN PARTICULAR
SELECT p.numero, p.forma_pago, p.banco, p.cuenta_numero, p.total_pagado,
       m.id AS movimiento, m.tipo, m.monto, cb.banco AS cuenta_destino
FROM public.prestamo_pagos p
LEFT JOIN public.movimientos_bancarios m
       ON m.origen_tipo = 'recibo' AND m.origen_id = p.id
LEFT JOIN public.cuentas_bancarias cb ON cb.id = m.cuenta_id
WHERE p.numero = '0147803';
-- esperado despues de rehacer la edicion: una ENTRADA de 100,000.00 en la
-- cuenta que se elija.
