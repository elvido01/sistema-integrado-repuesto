-- =====================================================================
-- PT-0026624 salio del Banco Popular, no de la caja
-- ---------------------------------------------------------------------
-- (2026-08-19) El prestamo de SEVERIANO PEREZ MEJIA por RD$170,000 se
-- digito con desembolso en EFECTIVO. Era un error de tecleo: el dinero
-- salio de la cuenta 004110544 del Banco Popular (MOTOPRESTAMOS LOS
-- NARANJOS).
--
-- >>> QUE ESTABA ROMPIENDO <<<
-- Dos cosas, y las dos hoy mismo:
--
--   1. El cierre de caja busca los prestamos creados HOY con desembolso
--      'efectivo' y los resta de la caja del dia. Con esto, la caja de hoy
--      arrastraba RD$170,000 de menos que nunca salieron de ahi.
--   2. La salida del Banco Popular no existe. La cuenta enseña RD$190,500.20
--      teniendo RD$170,000 menos de verdad.
--
-- >>> LO QUE SE HACE <<<
-- Exactamente lo que habria hecho la pantalla si se hubiera elegido bien:
-- el prestamo pasa a 'transferencia' y se registra UNA salida en la cuenta,
-- con el mismo concepto y referencia que pone NuevoPrestamoModal. No se
-- toca el prestamo en nada mas — ni monto, ni cuotas, ni fechas, ni estado.
--
-- Fecha de la salida: HOY (19/08), decidido por el dueño. El prestamo
-- empezo el 05/08, pero se registra el dia en que se digito.
--
-- Los RD$100,000 que entraron hoy con concepto "para justificar prestamo"
-- NO se tocan: el dueño confirma que es un deposito real. El Banco Popular
-- queda en RD$20,500.20.
--
-- Idempotente: si ya esta corregido, no hace nada y no duplica la salida.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) EL PRESTAMO YA NO SALE DE LA CAJA
-- ------------------------------------------------------------
UPDATE public.prestamos
   SET desembolso = 'transferencia'
 WHERE numero = 'PT-0026624'
   AND tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
   AND desembolso = 'efectivo';

-- ------------------------------------------------------------
-- 2) LA SALIDA QUE FALTABA EN EL BANCO POPULAR
-- ------------------------------------------------------------
-- La pantalla escribe estos movimientos con origen_id NULL, asi que la
-- unica llave para reconocerlos es referencia + origen_tipo. Por eso el
-- NOT EXISTS mira por ahi: sin el, correr esto dos veces desembolsaria el
-- prestamo dos veces.
--
-- usuario_id = quien digito el prestamo. auth.uid() aqui es NULL —esto no
-- corre desde la aplicacion— y dejar el rastro en blanco seria peor.
INSERT INTO public.movimientos_bancarios
  (tenant_id, cuenta_id, fecha, tipo, monto, concepto, referencia, origen_tipo, origen_id, usuario_id)
SELECT
  '766fe3d6-6885-4f2b-b2cc-1a91db696fb4',
  'bb840b28-6b68-4183-b501-37fe96e241e5',       -- BANCO POPULAR 004110544
  '2026-08-19',
  'SALIDA',
  170000.00,
  'Desembolso préstamo PT-0026624 — SEVERIANO PEREZ MEJIA',
  'PT-0026624',
  'desembolso',
  NULL,
  '8eafc96c-48ee-48b2-9b42-35d8715d0967'
WHERE NOT EXISTS (
  SELECT 1 FROM public.movimientos_bancarios
   WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
     AND referencia = 'PT-0026624'
     AND origen_tipo = 'desembolso'
);

SELECT public.registrar_migracion('corregir_desembolso_PT-0026624.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  (SELECT desembolso FROM public.prestamos WHERE numero='PT-0026624')          AS desembolso_ahora,
  (SELECT count(*) FROM public.movimientos_bancarios
     WHERE referencia='PT-0026624' AND origen_tipo='desembolso')               AS salidas_registradas,
  (SELECT round(cb.saldo_inicial + COALESCE(SUM(CASE WHEN m.tipo='ENTRADA' THEN m.monto ELSE -m.monto END),0), 2)
     FROM public.cuentas_bancarias cb
     LEFT JOIN public.movimientos_bancarios m ON m.cuenta_id=cb.id
    WHERE cb.id='bb840b28-6b68-4183-b501-37fe96e241e5'
    GROUP BY cb.saldo_inicial)                                                 AS saldo_banco_popular,
  (SELECT COALESCE(sum(monto_capital),0) FROM public.prestamos
    WHERE tenant_id='766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
      AND desembolso ILIKE 'efectivo'
      AND created_at::date='2026-08-19')                                       AS aun_sale_de_la_caja_hoy;
