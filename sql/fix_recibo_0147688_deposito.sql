-- =====================================================================
-- Recibo 0147688 de MotoPréstamos: pasarlo a DEPÓSITO al Banco Popular
-- ---------------------------------------------------------------------
-- (2026-07-28) El recibo 0147688 (DOMINGO FAMILIA DE LA CRUZ, RD$67,500,
-- "PAGO 1/2") se grabó como EFECTIVO y sin movimiento bancario. Va
-- depositado a la cuenta 004110544 del Banco Popular.
--
-- No basta con crear el movimiento del banco: hay que CAMBIARLE LA FORMA DE
-- PAGO, si no los RD$67,500 quedan contados dos veces —como efectivo en la
-- gaveta del cierre Y como entrada al banco—.
--
-- Se toca en tres sitios, que es donde vive el dato:
--   1. prestamo_pagos    -> forma_pago, banco y número de cuenta (el recibo
--                           que se imprime)
--   2. recibos_ingreso   -> formas_pago, que es de donde el CIERRE DE CAJA
--                           saca cuánto entró en efectivo
--   3. movimientos_bancarios -> la entrada al Banco Popular
--
-- EL CIERRE DEL 28/07 TODAVÍA NO SE HA HECHO, así que el cambio entra a
-- tiempo y la caja de hoy cuadra sola: los RD$67,500 dejan de esperarse en
-- la gaveta.
--
-- La cuenta y la forma del movimiento siguen el patrón de los demás recibos
-- por transferencia de esta empresa (Banco Popular, origen_tipo 'recibo').
--
-- Idempotente: al correrlo de nuevo no duplica el movimiento ni revierte nada.
-- =====================================================================

DO $$
DECLARE
  v_fin    uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';  -- MOTOPRESTAMOS LOS NARANJOS
  v_cuenta uuid := 'bb840b28-6b68-4183-b501-37fe96e241e5';  -- BANCO POPULAR 004110544
  v_num    text := '0147688';
  v_pago   record;
  v_n      int;
BEGIN
  SELECT p.*, c.nombre AS cliente_nombre
    INTO v_pago
    FROM public.prestamo_pagos p
    LEFT JOIN public.clientes c ON c.id = p.cliente_id
   WHERE p.tenant_id = v_fin AND p.numero = v_num;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe el recibo % en MotoPréstamos', v_num;
  END IF;

  -- 1) El recibo pasa a transferencia/depósito
  UPDATE public.prestamo_pagos
     SET forma_pago    = 'Transferencia',
         banco         = 'BANCO POPULAR',
         cuenta_numero = '004110544'
   WHERE id = v_pago.id;

  -- 2) De aquí saca el CIERRE DE CAJA el efectivo del día. Si esto se queda
  --    en "Efectivo", el cierre seguiría esperando los RD$67,500 en la gaveta.
  UPDATE public.recibos_ingreso
     SET formas_pago = '[{"forma": "Transferencia", "monto": 67500, "referencia": "0147688"}]'::jsonb
   WHERE tenant_id = v_fin
     AND numero    = 'RI-147688';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'recibos_ingreso actualizado: % fila(s)', v_n;

  -- 3) La entrada al banco
  INSERT INTO public.movimientos_bancarios
    (tenant_id, cuenta_id, tipo, monto, concepto, origen_tipo, fecha)
  SELECT v_fin, v_cuenta, 'ENTRADA', v_pago.total_pagado,
         'Recibo ' || v_num || ' — ' || COALESCE(v_pago.cliente_nombre, 'cliente'),
         'recibo', v_pago.fecha
  WHERE NOT EXISTS (
    SELECT 1 FROM public.movimientos_bancarios m
    WHERE m.tenant_id = v_fin
      AND m.origen_tipo = 'recibo'
      AND m.concepto LIKE 'Recibo ' || v_num || ' %'
  );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Movimiento bancario creado: % fila(s)', v_n;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_recibo_0147688_deposito.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) El recibo quedó como transferencia, con su banco
SELECT numero, fecha, forma_pago, banco, cuenta_numero, total_pagado, comentarios
FROM public.prestamo_pagos
WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4' AND numero = '0147688';
-- esperado: Transferencia | BANCO POPULAR | 004110544 | 67,500

-- 2) El cierre ya NO debe contarlo como efectivo
SELECT numero, monto_pagado, formas_pago
FROM public.recibos_ingreso
WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4' AND numero = 'RI-147688';
-- esperado: formas_pago con "Transferencia", no "Efectivo"

-- 3) La entrada al Banco Popular
SELECT m.fecha, c.banco, c.numero_cuenta, m.tipo, m.monto, m.concepto
FROM public.movimientos_bancarios m
JOIN public.cuentas_bancarias c ON c.id = m.cuenta_id
WHERE m.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND m.concepto LIKE 'Recibo 0147688 %';
-- esperado: 1 fila | BANCO POPULAR | 004110544 | ENTRADA | 67,500

-- 4) Cómo queda el efectivo esperado en la gaveta hoy (para el cierre)
SELECT SUM(
         (SELECT COALESCE(SUM((f->>'monto')::numeric), 0)
            FROM jsonb_array_elements(r.formas_pago) f
           WHERE lower(f->>'forma') LIKE '%efectivo%')
       ) AS efectivo_del_dia,
       SUM(r.monto_pagado) AS total_recibos_del_dia
FROM public.recibos_ingreso r
WHERE r.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND r.fecha = DATE '2026-07-28'
  AND NOT r.anulado;
-- esperado: efectivo 10,600 (los otros 3 recibos) de 78,100 en total
