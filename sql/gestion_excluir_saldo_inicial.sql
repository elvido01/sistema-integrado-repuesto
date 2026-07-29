-- =====================================================================
-- GESTIÓN EMPRESARIAL: fuera los "SALDO INICIAL" que ya se desglosaron
-- ---------------------------------------------------------------------
-- (2026-07-29) "El dato de julio, los 10,160,885, es un error."
--
-- Lo era. De esos 10.1 millones, 7.1 son DOS documentos que no son deuda de
-- julio ni de nadie:
--
--   SI-CXP-2   4,086,660.00   "SALDO INICIAL papel (todo desglosado en
--                              pagarés por factura)"
--   SI-CXP-4   3,098,934.60   "SALDO INICIAL papel — resto sin documentar"
--
-- Son los saldos de arranque con que se cargó la deuda a suplidores, que
-- después se desglosó en pagarés (FIN-04295-02, FIN-02680-04, …). El saldo
-- inicial y sus pagarés son LA MISMA DEUDA: contarlos juntos la duplica.
--
-- De los 6 saldos iniciales, 4 quedaron ANULADA y ya salían del cálculo;
-- estos 2 quedaron PAGADA y por eso se colaban desde que el mes pasó a
-- mostrar el monto completo en vez del pendiente.
--
--   Julio antes   10,160,656   13 cuotas
--   Julio ahora    2,975,061   11 cuotas   ← lo que de verdad vencía
--
-- >>> COMO SE RECONOCEN <<<
-- Con una columna propia, no por el número ni por el texto: `numero` se
-- edita y `referencia` es prosa. Se marcan una sola vez leyendo su
-- referencia ("SALDO INICIAL…") y de ahí en adelante manda la columna.
--
-- OJO: no se tocan las compras. Siguen ahí, con su historial y su saldo;
-- solo dejan de contarse como obligación del mes en este panel.
--
-- Idempotente / re-ejecutable. Requiere gestion_posicion_grupo.sql.
-- =====================================================================

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS es_saldo_inicial boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.compras.es_saldo_inicial IS
  'Documento de arranque de la deuda, ya desglosado en pagarés. Es la MISMA deuda que sus pagarés: no debe sumarse junto a ellos.';

CREATE INDEX IF NOT EXISTS idx_compras_saldo_inicial
  ON public.compras (tenant_id) WHERE es_saldo_inicial;

-- Marcado de una sola vez: los que se cargaron como saldo inicial de papel.
UPDATE public.compras
   SET es_saldo_inicial = true
 WHERE NOT es_saldo_inicial
   AND (referencia ILIKE 'SALDO INICIAL%' OR legacy_id LIKE 'papel:cxp:____-__-__:%');

-- ------------------------------------------------------------
-- Que el panel los deje fuera
-- ------------------------------------------------------------
DO $$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_gestion_empresarial_ia'
  LIMIT 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'Falta get_gestion_empresarial_ia — corre antes sql/gestion_posicion_grupo.sql';
  END IF;

  IF position('es_saldo_inicial' in v_src) > 0 THEN
    RAISE NOTICE 'El panel ya deja fuera los saldos iniciales — nada que cambiar.';
    RETURN;
  END IF;

  -- En la deuda viva (posición)
  v_src := replace(v_src,
$a$    AND (pv.empresa_grupo_tenant_id IS NULL OR NOT (pv.empresa_grupo_tenant_id = ANY(v_grupo)));$a$,
$b$    AND NOT COALESCE(co.es_saldo_inicial, false)
    AND (pv.empresa_grupo_tenant_id IS NULL OR NOT (pv.empresa_grupo_tenant_id = ANY(v_grupo)));$b$);

  -- En el mes por mes y el cumplimiento
  v_src := replace(v_src,
$c$      AND (pv.empresa_grupo_tenant_id IS NULL OR NOT (pv.empresa_grupo_tenant_id = ANY(v_grupo)))
  ),$c$,
$d$      AND NOT COALESCE(co.es_saldo_inicial, false)
      AND (pv.empresa_grupo_tenant_id IS NULL OR NOT (pv.empresa_grupo_tenant_id = ANY(v_grupo)))
  ),$d$);

  EXECUTE v_src;
  RAISE NOTICE 'El panel ya no cuenta los saldos iniciales junto a sus pagarés.';
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('gestion_excluir_saldo_inicial.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) Qué quedó marcado como saldo inicial
SELECT numero, estado, total_compra, monto_pendiente, left(referencia, 48) AS referencia
FROM public.compras
WHERE es_saldo_inicial
ORDER BY total_compra DESC;
-- esperado: los 6 SI-CXP (2 PAGADA + 4 ANULADA). Ninguno con pendiente > 0:
-- si alguno tuviera saldo, es que NO se desglosó y no debería estar marcado.

-- 2) JULIO, cuota por cuota, ya sin ellos
SELECT (co.fecha + COALESCE(co.dias_credito,0))::date AS vence,
       co.numero, co.total_compra, co.monto_pagado, co.estado
FROM public.compras co
WHERE co.tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113',
                       '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
  AND co.forma_pago ILIKE '%credito%'
  AND COALESCE(co.estado,'') <> 'ANULADA'
  AND NOT co.es_saldo_inicial
  AND (co.fecha + COALESCE(co.dias_credito,0))
      BETWEEN date_trunc('month', CURRENT_DATE)::date
          AND (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date
ORDER BY vence;
-- esperado: 11 cuotas, 2,975,061.42 en total (antes 13 y 10,160,656.02)

-- 3) El panel ya los excluye
SELECT position('es_saldo_inicial' in pg_get_functiondef(p.oid)) > 0 AS los_excluye
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_gestion_empresarial_ia';
-- esperado: true
