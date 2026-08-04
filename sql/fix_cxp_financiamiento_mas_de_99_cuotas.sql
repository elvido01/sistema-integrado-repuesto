-- =====================================================================
-- El financiamiento a más de 99 cuotas no creaba el préstamo
-- ---------------------------------------------------------------------
-- (2026-08-03) En Gestión Empresarial: "Ventas a crédito sin préstamo · 2 —
-- RD$ 90,640 — deberían estar en la cartera".
--
-- >>> QUÉ VENTA ES <<<
-- FT-23 de hoy: PEDRO LIVIO JIMENEZ, 78,100 a 365 cuotas DIARIAS de 300.
-- Las otras tres ventas a crédito del mismo día (FT-21 de 18 cuotas, FT-22
-- de 24 y FT-24 de 12) sí crearon su préstamo. La diferencia son las cuotas.
--
-- El sistema dejó constancia del motivo exacto:
--
--   "La factura #23 se grabó, pero el préstamo NO se creó en la financiera:
--    duplicate key value violates unique constraint compras_tenant_numero_key"
--
-- >>> LA CAUSA: lpad TRUNCA <<<
-- Cada cuota financiada genera su propia cuenta por pagar, numerada
-- FIN-000010-01, -02, -03... con:
--
--   lpad(cq.numero_cuota::text, 2, '0')
--
-- En PostgreSQL lpad no solo rellena: si el texto es MÁS LARGO que el ancho
-- pedido, lo RECORTA.
--
--   cuota  99 -> '99'
--   cuota 100 -> '10'   ← recortada
--   cuota 101 -> '10'   ← la misma: choque de número único
--   cuota 365 -> '36'
--
-- O sea que cualquier financiamiento de más de 99 cuotas revienta al llegar
-- a la 101, y revienta la operación completa: sin préstamo, sin cuotas y sin
-- cuentas por pagar. Con 12, 18 o 24 cuotas nunca se notó porque todas caben
-- en dos dígitos. El préstamo diario fue el primero en pasar de 99.
--
-- >>> EL ARREGLO <<<
-- El ancho se calcula del plazo: 2 dígitos mientras el préstamo tenga 99
-- cuotas o menos (los de siempre siguen numerándose igual) y 3 o 4 cuando
-- haga falta. Un préstamo de 365 pasa a FIN-000011-001 … -365.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

DO $$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'procesar_financiamiento_terceros'
  LIMIT 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'No existe procesar_financiamiento_terceros';
  END IF;

  IF position('GREATEST(2, length(v_plazo::text))' in v_src) > 0 THEN
    RAISE NOTICE 'Ya estaba arreglado: el sufijo de cuota se ajusta al plazo.';
    RETURN;
  END IF;

  v_src := replace(v_src,
    'lpad(cq.numero_cuota::text, 2, ''0'')',
    'lpad(cq.numero_cuota::text, GREATEST(2, length(v_plazo::text)), ''0'')');

  IF position('GREATEST(2, length(v_plazo::text))' in v_src) = 0 THEN
    RAISE EXCEPTION 'No se encontró el lpad del sufijo de cuota — revisar a mano.';
  END IF;

  EXECUTE v_src;
  RAISE NOTICE 'Arreglado: los financiamientos de mas de 99 cuotas ya numeran bien.';
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_cxp_financiamiento_mas_de_99_cuotas.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- REPROCESAR FT-23, QUE SE QUEDÓ SIN PRÉSTAMO
-- ------------------------------------------------------------
-- La venta existe y el cliente debe 78,100: lo que falta es el préstamo en
-- MotoPréstamos. El RPC resuelve el dealer con get_user_tenant(), que en el
-- editor SQL es NULL, así que hay que impersonar a un usuario de Caminero —
-- el mismo procedimiento con que se repararon FT-12 y FT-17.
--
-- Si ya tuviera préstamo, el RPC responde "ya procesado" y no duplica nada.
SELECT set_config('request.jwt.claims',
  '{"sub":"6d7e711c-935d-442b-8f45-cf308863f414","role":"authenticated"}', false);

SELECT public.procesar_financiamiento_terceros(
  (SELECT id FROM public.facturas
    WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
      AND numero = 23 AND COALESCE(estado,'') <> 'ANULADA'),
  (SELECT id FROM public.solicitudes_compras
    WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113' AND numero = 32),
  '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
) AS resultado_ft23;

SELECT set_config('request.jwt.claims', '', false);

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) FT-23 YA TIENE SU PRÉSTAMO
SELECT p.numero, p.monto_capital, p.plazo_cuotas, p.frecuencia, p.estado,
       (SELECT COUNT(*) FROM public.prestamo_cuotas q WHERE q.prestamo_id = p.id) AS cuotas
FROM public.prestamos p
WHERE p.notas LIKE '%factura #23%'
ORDER BY p.created_at DESC;
-- esperado: un PT- con 78,100 · 365 cuotas · 365 filas de cuota

-- 2) LAS CUENTAS POR PAGAR, TODAS CON NÚMERO DISTINTO
SELECT COUNT(*) AS cxp, COUNT(DISTINCT numero) AS numeros_distintos
FROM public.compras
WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND referencia LIKE '%factura #23%';
-- esperado: 365 y 365 — si no fueran iguales, seguiría el recorte.

-- 3) QUE NO QUEDEN VENTAS A CRÉDITO SIN PRÉSTAMO
SELECT f.numero, f.fecha::date, f.total, f.monto_pendiente
FROM public.facturas f
WHERE f.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND COALESCE(f.monto_pendiente, 0) > 0
  AND COALESCE(f.estado, '') <> 'ANULADA'
  AND NOT EXISTS (SELECT 1 FROM public.prestamos p
                   WHERE p.estado = 'activo' AND p.notas LIKE '%[FT:' || f.id::text || '%')
ORDER BY f.fecha;
-- esperado: solo FT-3 (24/07/2025, 12,540), que es de hace un año.
