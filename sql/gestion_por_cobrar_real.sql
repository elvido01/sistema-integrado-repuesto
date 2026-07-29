-- =====================================================================
-- POSICIÓN: "por cobrar" de las facturas, no del balance del cliente
-- ---------------------------------------------------------------------
-- (2026-07-29) "El monto por cobrar a cliente, ¿de dónde sale?"
--
-- Salía de `clientes.balance` de Caminero Motors: 13 clientes, RD$1,499,675.
-- Al revisarlos uno por uno, NINGUNO es una cuenta por cobrar del grupo:
--
--   8 clientes  RD$  830,975.03  creados del 22 al 26 de JUNIO, sin préstamo
--                                y sin factura detrás → datos de prueba
--   5 clientes  RD$  668,700.00  creados del 16 al 23 de julio, cada uno con
--                                SU préstamo en MotoPréstamos
--   0 clientes  RD$        0.00  cobranza real
--
-- Los 5 de julio son ventas financiadas de verdad, y por eso mismo NO se
-- pueden sumar: Caminero vende la moto, MotoPréstamos hace el préstamo, y el
-- balance del cliente en Caminero es el espejo de ese préstamo. Tres de los
-- cinco coinciden al centavo y al día:
--
--   BERNABBEL CASTRO  126,500.00  ↔  PT-0026585  126,500.00  21/07
--   NOEL MERCIDIEUX   154,600.00  ↔  PT-0026586  154,600.00  22/07
--   OLGA GUERRERO      74,600.00  ↔  PT-0026588   74,600.00  23/07
--
-- El panel estaba inflando la posición en 1.5 millones.
--
-- >>> DE DONDE SALE AHORA <<<
-- De las FACTURAS A CRÉDITO que de verdad quedan sin cobrar
-- (facturas.monto_pendiente > 0). Eso es una cuenta por cobrar y nada más:
--   * en una venta financiada la factura queda saldada — la pagó la
--     financiera — así que no aparece, y el préstamo la cuenta una vez;
--   * si mañana se fía en el mostrador sin financiar, aparece sola.
--
-- Y por si acaso, se descarta cualquier factura que haya generado un
-- préstamo. El vínculo existe y es exacto: los préstamos guardan
-- "[FT:<id de la factura>]" en sus notas. Nada de cruzar por nombre.
--
-- Con los datos de hoy da RD$212,150.38, y son las tres facturas de prueba
-- de junio (FT-0000003, FT-0000004, FT-0000005). Al borrar los clientes de
-- prueba, la línea baja sola a cero — que es lo correcto mientras todo lo
-- que se vende a crédito se financie.
--
-- Idempotente / re-ejecutable. Requiere gestion_posicion_grupo.sql.
-- =====================================================================

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

  IF position('SUM(fa.monto_pendiente)' in v_src) > 0 THEN
    RAISE NOTICE 'El por cobrar ya sale de las facturas — nada que cambiar.';
    RETURN;
  END IF;

  v_src := replace(v_src,
$viejo$  SELECT COALESCE(SUM(cl.balance), 0) INTO v_cxc
  FROM public.clientes cl
  WHERE cl.tenant_id = ANY(v_grupo) AND COALESCE(cl.balance, 0) > 0
    -- Si un "cliente" fuera otra empresa del grupo tampoco contaría.
    AND NOT EXISTS (SELECT 1 FROM public.config_empresa ce2
                     WHERE ce2.tenant_id = ANY(v_grupo)
                       AND NULLIF(btrim(COALESCE(cl.rnc, '')), '') = NULLIF(btrim(COALESCE(ce2.rnc, '')), '')
                       AND cl.tenant_id <> ce2.tenant_id);$viejo$,
$nuevo$  -- POR COBRAR: de las FACTURAS que quedan sin cobrar, no del balance del
  -- cliente. El balance no distingue una venta fiada de una financiada, y en
  -- la financiada el préstamo ya cuenta ese dinero: sumar los dos lo duplica.
  SELECT COALESCE(SUM(fa.monto_pendiente), 0) INTO v_cxc
  FROM public.facturas fa
  WHERE fa.tenant_id = ANY(v_grupo)
    AND COALESCE(fa.monto_pendiente, 0) > 0
    AND COALESCE(fa.estado, '') <> 'ANULADA'
    -- Las que se convirtieron en préstamo las cuenta la cartera. El vínculo
    -- es exacto: el préstamo guarda "[FT:<id>]" en sus notas.
    AND NOT EXISTS (
      SELECT 1 FROM public.prestamos pp
      WHERE pp.tenant_id = ANY(v_grupo)
        AND pp.estado = 'activo'
        AND pp.notas LIKE '%[FT:' || fa.id::text || '%')
    -- Y si el "cliente" fuera otra empresa del grupo, tampoco cuenta.
    AND NOT EXISTS (
      SELECT 1 FROM public.clientes cl
      JOIN public.config_empresa ce2 ON ce2.tenant_id = ANY(v_grupo)
      WHERE cl.id = fa.cliente_id
        AND NULLIF(btrim(COALESCE(cl.rnc, '')), '') = NULLIF(btrim(COALESCE(ce2.rnc, '')), '')
        AND cl.tenant_id <> ce2.tenant_id);$nuevo$);

  EXECUTE v_src;
  RAISE NOTICE 'El por cobrar ahora sale de las facturas sin cobrar.';
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('gestion_por_cobrar_real.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) LO QUE SE CUENTA AHORA: facturas a crédito sin cobrar
SELECT f.numero, f.fecha::date, c.nombre AS cliente, f.total, f.monto_pendiente,
       CASE WHEN EXISTS (SELECT 1 FROM public.prestamos p
                          WHERE p.estado = 'activo'
                            AND p.notas LIKE '%[FT:' || f.id::text || '%')
            THEN 'la cuenta la cartera — se descarta' ELSE 'por cobrar' END AS trato
FROM public.facturas f
LEFT JOIN public.clientes c ON c.id = f.cliente_id
WHERE f.tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113',
                      '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
  AND COALESCE(f.monto_pendiente, 0) > 0
  AND COALESCE(f.estado, '') <> 'ANULADA'
ORDER BY f.fecha;
-- esperado hoy: FT-3, FT-4 y FT-5 (junio) = 212,150.38 — las de prueba

-- 2) LO QUE SE DEJA DE CONTAR: los balances de cliente, uno por uno
SELECT c.nombre, c.balance, c.created_at::date AS creado,
       (SELECT string_agg(p.numero || ' ' || p.monto_capital, ', ')
          FROM public.prestamos p
          JOIN public.clientes cf ON cf.id = p.cliente_id
         WHERE p.estado = 'activo'
           AND abs(p.monto_capital - c.balance) <= c.balance * 0.06) AS prestamo_espejo
FROM public.clientes c
WHERE c.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND COALESCE(c.balance, 0) > 0
ORDER BY c.created_at;
-- esperado: los 8 de junio sin préstamo (prueba) y los 5 de julio con el suyo

-- 3) Los clientes de prueba, para borrarlos cuando se decida.
--    NO se borran aquí: eso lo decide el dueño, no un script.
SELECT count(*) AS clientes_prueba, SUM(balance) AS balance_prueba
FROM public.clientes
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND COALESCE(balance, 0) > 0
  AND created_at < DATE '2026-07-01';
-- esperado: 8 clientes, 830,975.03
