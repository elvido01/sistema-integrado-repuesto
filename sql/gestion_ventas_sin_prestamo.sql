-- =====================================================================
-- POSICIÓN: "por cobrar" pasa a ser una ALERTA, no un activo más
-- ---------------------------------------------------------------------
-- (2026-07-29) "Caminero Motors financia por terceros; esas cuentas por
-- cobrar deberían estar incluidas en la cartera de préstamos de
-- MotoPréstamos Los Naranjos."
--
-- Eso cambia lo que significa la línea. Si TODA venta a crédito de Caminero
-- se financia con MotoPréstamos, entonces una factura a crédito sin cobrar y
-- sin préstamo detrás no es una cuenta por cobrar normal: es una venta a la
-- que NO se le creó el préstamo. O sea, un problema, no un activo.
--
-- Y no es teórico: ya pasó. Una venta financiada hecha de CONTADO y editada
-- después a CRÉDITO nunca creaba el préstamo (las facturas 12 y 17 hubo que
-- repararlas a mano). Esta línea es justo el detector de ese caso.
--
-- >>> QUÉ CAMBIA <<<
-- El monto se sigue contando — alguien debe ese dinero — pero la línea deja
-- de llamarse "Por cobrar a clientes" y pasa a decir lo que de verdad es,
-- con su cantidad de facturas para poder ir a buscarlas. Cuando está en cero
-- desaparece, que es como debería estar siempre.
--
-- Hoy son 3 facturas por RD$212,150.38, todas de prueba (junio 2026 y una de
-- julio 2025). Al borrarlas la línea se apaga sola.
--
-- Idempotente / re-ejecutable. Requiere gestion_por_cobrar_real.sql.
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

  IF position('por_cobrar_cant' in v_src) > 0 THEN
    RAISE NOTICE 'La alerta ya está puesta — nada que cambiar.';
    RETURN;
  END IF;

  IF position('monto_pendiente) INTO v_cxc' in v_src) = 0 THEN
    RAISE EXCEPTION 'Corre antes sql/gestion_por_cobrar_real.sql';
  END IF;

  -- Cuántas facturas son, para poder ir a buscarlas
  v_src := replace(v_src,
    '  SELECT COALESCE(SUM(fa.monto_pendiente), 0) INTO v_cxc',
    '  SELECT COALESCE(SUM(fa.monto_pendiente), 0), COUNT(*) INTO v_cxc, v_cxc_n');

  v_src := replace(v_src,
    '  v_cxc         numeric := 0;',
    '  v_cxc         numeric := 0;' || E'\n' ||
    '  v_cxc_n       int := 0;');

  v_src := replace(v_src,
    $v$      'por_cobrar',       ROUND(v_cxc, 2),$v$,
    $n$      'por_cobrar',       ROUND(v_cxc, 2),
      'por_cobrar_cant',  v_cxc_n,$n$);

  EXECUTE v_src;
  RAISE NOTICE 'La posición ahora avisa cuántas ventas quedaron sin préstamo.';
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('gestion_ventas_sin_prestamo.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) LAS FACTURAS QUE HAY QUE MIRAR: crédito sin cobrar y sin préstamo.
--    Si Caminero financia todo por terceros, esta lista debería estar vacía.
SELECT f.numero, f.fecha::date, c.nombre AS cliente,
       f.total, f.monto_pendiente, f.forma_pago,
       CASE WHEN f.fecha < DATE '2026-07-21' THEN 'anterior al 21/07 — revisar si es prueba'
            ELSE '⚠ venta a crédito SIN préstamo — revisar' END AS que_hacer
FROM public.facturas f
LEFT JOIN public.clientes c ON c.id = f.cliente_id
WHERE f.tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113',
                      '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
  AND COALESCE(f.monto_pendiente, 0) > 0
  AND COALESCE(f.estado, '') <> 'ANULADA'
  AND NOT EXISTS (SELECT 1 FROM public.prestamos p
                   WHERE p.estado = 'activo'
                     AND p.notas LIKE '%[FT:' || f.id::text || '%')
ORDER BY f.fecha;
-- esperado hoy: FT-3 (24/07/2025), FT-4 y FT-5 (24/06/2026) = 212,150.38

-- 2) Lo contrario: las ventas financiadas que SÍ generaron su préstamo.
--    Así se ve que el vínculo funciona y que la cartera las está contando.
SELECT f.numero AS factura, f.fecha::date, c.nombre AS cliente, f.total,
       p.numero AS prestamo, p.monto_capital, p.estado
FROM public.facturas f
JOIN public.clientes c ON c.id = f.cliente_id
JOIN public.prestamos p ON p.notas LIKE '%[FT:' || f.id::text || '%'
WHERE f.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
ORDER BY f.fecha DESC
LIMIT 20;
-- esperado: las ventas financiadas con su PT-00265xx al lado
