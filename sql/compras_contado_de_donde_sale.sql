-- =====================================================================
-- La compra de contado en efectivo tiene que salir de la caja
-- ---------------------------------------------------------------------
-- (2026-07-31) "En el cierre de Caminero hubo una diferencia de 50,000 y se
-- detectó que fue porque se compró una motocicleta de contado en efectivo
-- pero el sistema no lo rebajó del efectivo actual en caja."
--
-- >>> CONFIRMADO, Y ES EXACTAMENTE ESO <<<
-- La compra es OC-0007 del 31/07, Contado, RD$50,000, PAGADA, nota "MOTORS
-- RECIBO COMO INICIAL A KERVENS DAJILIQUE". No dejó movimiento bancario ni
-- gasto: no descontó de ningún lado.
--
-- El porqué está en get_caja_excedente_dashboard, que calcula dos cosas:
--
--   EXCEDENTE (caja acumulada)  SÍ restaba las compras de contado
--   CAJA DE HOY (la gaveta)     NO las restaba        ← el hueco
--
-- Y «Caja del día» es justo lo que se cuadra en el cierre. Por eso el conteo
-- pedía 50,000 más de los que había. La misma falta estaba en la pantalla de
-- Cierre de Caja, que arma su propia fórmula (eso va en el front).
--
-- >>> DE DÓNDE SALIÓ EL DINERO: YA SE PUEDE DECIR <<<
-- La compra ya tiene el bloque «Monto Pagado» con líneas de Efectivo /
-- Cheque / Transferencia / Tarjeta, y se guardan en `compras.pagos`. No hace
-- falta una columna nueva: hacía falta que la caja las LEYERA.
--
--   con líneas    → de la gaveta sale solo lo de tipo Efectivo ('01')
--   sin líneas    → se asume todo efectivo, que es como se venía tratando
--
-- Esa segunda regla es la que arregla OC-0007 sin tocarle el dato: quedó con
-- `pagos` vacío, así que cuenta como efectivo y la caja por fin la resta.
--
-- Y es lo que permite la combinación que se pidió: si la moto se paga mitad
-- de la gaveta y mitad por transferencia, de la caja sale solo la mitad y el
-- resto lo descuenta el movimiento de su cuenta.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

DO $$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_caja_excedente_dashboard'
  LIMIT 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'No existe get_caja_excedente_dashboard';
  END IF;

  IF position('compra de contado: solo lo que salio de la gaveta' in v_src) > 0 THEN
    RAISE NOTICE 'La caja ya resta las compras de contado en efectivo.';
    RETURN;
  END IF;

  -- 1) EXCEDENTE: pasa de restar el total a restar solo el efectivo. Con las
  -- compras de hoy da lo mismo (ninguna tiene lineas de pago); cambia el dia
  -- que una se pague por transferencia, que entonces no debe salir de la
  -- gaveta porque ya la descuenta su cuenta.
  v_src := replace(v_src,
$viejo$    - COALESCE((SELECT SUM(total_compra) FROM public.compras
        WHERE tenant_id = v_tenant AND created_at >= v_anchor_ts
          AND forma_pago ILIKE 'contado' AND COALESCE(estado, '') <> 'ANULADA'), 0)$viejo$,
$nuevo$    -- compra de contado: solo lo que salio de la gaveta. Las lineas de
    -- "Monto Pagado" dicen de donde salio; sin lineas se asume efectivo,
    -- que es como se venia tratando.
    - COALESCE((
        SELECT SUM(
          CASE WHEN jsonb_typeof(COALESCE(co.pagos, '[]'::jsonb)) = 'array'
                AND jsonb_array_length(COALESCE(co.pagos, '[]'::jsonb)) > 0
               THEN COALESCE((SELECT SUM((f->>'monto')::numeric)
                              FROM jsonb_array_elements(co.pagos) f
                              WHERE COALESCE(f->>'tipo', '01') = '01'
                                 OR lower(COALESCE(f->>'forma','')) LIKE '%efectivo%'), 0)
               ELSE COALESCE(co.total_compra, 0) END)
        FROM public.compras co
        WHERE co.tenant_id = v_tenant AND co.created_at >= v_anchor_ts
          AND co.forma_pago ILIKE 'contado' AND COALESCE(co.estado, '') <> 'ANULADA'
      ), 0)$nuevo$);

  IF position('compra de contado: solo lo que salio de la gaveta' in v_src) = 0 THEN
    RAISE EXCEPTION 'No se pudo ajustar el excedente — revisar a mano.';
  END IF;

  -- 2) CAJA DE HOY: aqui NO restaba nada. Este es el hueco del descuadre.
  v_src := replace(v_src,
$viejo$    - COALESCE((SELECT SUM(monto) FROM public.gastos_diarios
        WHERE tenant_id = v_tenant AND fecha = v_today
          AND COALESCE(anulado, false) = false
          AND cuenta_bancaria_id IS NULL
          AND COALESCE(afecta_caja, true) = true), 0)$viejo$,
$nuevo$    - COALESCE((SELECT SUM(monto) FROM public.gastos_diarios
        WHERE tenant_id = v_tenant AND fecha = v_today
          AND COALESCE(anulado, false) = false
          AND cuenta_bancaria_id IS NULL
          AND COALESCE(afecta_caja, true) = true), 0)
    -- LO QUE FALTABA: la compra de contado pagada en efectivo sale de la
    -- gaveta el mismo dia. Sin esto el cierre pedia un efectivo que ya no
    -- estaba: OC-0007, 31/07, RD$50,000.
    - COALESCE((
        SELECT SUM(
          CASE WHEN jsonb_typeof(COALESCE(co.pagos, '[]'::jsonb)) = 'array'
                AND jsonb_array_length(COALESCE(co.pagos, '[]'::jsonb)) > 0
               THEN COALESCE((SELECT SUM((f->>'monto')::numeric)
                              FROM jsonb_array_elements(co.pagos) f
                              WHERE COALESCE(f->>'tipo', '01') = '01'
                                 OR lower(COALESCE(f->>'forma','')) LIKE '%efectivo%'), 0)
               ELSE COALESCE(co.total_compra, 0) END)
        FROM public.compras co
        WHERE co.tenant_id = v_tenant AND co.created_at >= v_today_ts
          AND co.forma_pago ILIKE 'contado' AND COALESCE(co.estado, '') <> 'ANULADA'
      ), 0)$nuevo$);

  IF position('LO QUE FALTABA' in v_src) = 0 THEN
    RAISE EXCEPTION 'No se pudo ajustar la caja del dia — revisar a mano.';
  END IF;

  EXECUTE v_src;
  RAISE NOTICE 'La caja del dia ya resta las compras de contado en efectivo.';
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('compras_contado_de_donde_sale.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) LA COMPRA DEL DESCUADRE
SELECT numero, fecha, forma_pago, total_compra, estado, pagos, notas
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND forma_pago ILIKE 'contado'
ORDER BY created_at DESC;
-- esperado: OC-0007 · 50,000 · PAGADA · pagos [] (vacío = todo efectivo)

-- 2) LO QUE LA CAJA DE HOY VA A RESTAR POR ESTE CONCEPTO
SELECT co.numero, co.total_compra,
       CASE WHEN jsonb_array_length(COALESCE(co.pagos, '[]'::jsonb)) > 0
            THEN COALESCE((SELECT SUM((f->>'monto')::numeric)
                           FROM jsonb_array_elements(co.pagos) f
                           WHERE COALESCE(f->>'tipo', '01') = '01'), 0)
            ELSE COALESCE(co.total_compra, 0) END AS sale_de_la_gaveta
FROM public.compras co
WHERE co.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND co.forma_pago ILIKE 'contado'
  AND COALESCE(co.estado, '') <> 'ANULADA'
  AND (co.created_at AT TIME ZONE 'America/Santo_Domingo')::date = CURRENT_DATE;
-- esperado: OC-0007 · 50,000.00 · 50,000.00
-- El cierre de hoy pedirá 50,000 menos: justo la diferencia que apareció.

-- 3) TODAS LAS COMPRAS DE CONTADO Y DE DÓNDE SALIERON
SELECT numero, fecha, total_compra,
       CASE WHEN jsonb_array_length(COALESCE(pagos, '[]'::jsonb)) = 0
            THEN 'sin detalle → se asume efectivo'
            ELSE pagos::text END AS origen
FROM public.compras
WHERE forma_pago ILIKE 'contado' AND COALESCE(estado, '') <> 'ANULADA'
  AND COALESCE(total_compra, 0) > 0
ORDER BY created_at DESC
LIMIT 20;
