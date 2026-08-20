-- =====================================================================
-- PS-000001 salio de la cuenta de Odalys, no del efectivo
-- ---------------------------------------------------------------------
-- (2026-08-20) MotoPrestamos Los Naranjos le pago RD$90,000 a CAMINERO
-- MOTORS y al digitarlo quedo como EFECTIVO. El dinero salio de la cuenta
-- OFICINA — ODALYS.
--
-- >>> QUE ESTABA ROMPIENDO <<<
--   1. La cuenta de Odalys enseña RD$90,000 de mas: la salida no existe.
--   2. Ese dinero figura saliendo de la caja del dia, de donde nunca salio.
--
-- >>> LO QUE SE HACE <<<
-- Lo mismo que habria hecho la pantalla con la forma de pago correcta: la
-- forma pasa a Transferencia y se registra UNA salida en la cuenta, con el
-- mismo concepto, referencia y origen que pone PagoSuplidoresPage. Del pago
-- no se toca nada mas — ni monto, ni fecha, ni a que compras se aplico.
--
-- La referencia queda anotada como correccion: dentro de un mes, un
-- movimiento de 90,000 sin explicacion es una pregunta sin respuesta.
--
-- Idempotente: si ya se corrigio, no duplica la salida.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) LA FORMA DE PAGO
-- ------------------------------------------------------------
UPDATE public.pagos_suplidores
   SET formas_pago = '[{"id":1,"forma":"Transferencia","monto":90000,"referencia":"Correccion 20/08: salio de OFICINA - ODALYS"}]'::jsonb
 WHERE numero = 'PS-000001'
   AND tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
   AND formas_pago @> '[{"forma":"Efectivo"}]'::jsonb;

-- ------------------------------------------------------------
-- 2) LA SALIDA QUE FALTABA EN ODALYS
-- ------------------------------------------------------------
-- La pantalla escribe estos movimientos con origen_id NULL, asi que la
-- unica llave para reconocerlos es referencia + origen_tipo. Sin el NOT
-- EXISTS, correr esto dos veces le sacaria 180,000 a la cuenta.
INSERT INTO public.movimientos_bancarios
  (tenant_id, cuenta_id, fecha, tipo, monto, concepto, referencia, origen_tipo, origen_id, usuario_id)
SELECT
  '766fe3d6-6885-4f2b-b2cc-1a91db696fb4',
  '88e08d17-50c0-46e2-b6bb-93530e75f9d0',      -- OFICINA — ODALYS
  '2026-08-20',
  'SALIDA',
  90000.00,
  'Pago suplidor CAMINERO MOTORS (PS-000001)',
  'PS-000001',
  'pago_suplidor',
  NULL,
  (SELECT usuario_id FROM public.pagos_suplidores
    WHERE numero='PS-000001' AND tenant_id='766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
WHERE NOT EXISTS (
  SELECT 1 FROM public.movimientos_bancarios
   WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
     AND referencia = 'PS-000001'
     AND origen_tipo = 'pago_suplidor'
);

SELECT public.registrar_migracion('corregir_pago_PS-000001.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  (SELECT formas_pago FROM public.pagos_suplidores
    WHERE numero='PS-000001' AND tenant_id='766fe3d6-6885-4f2b-b2cc-1a91db696fb4')  AS forma_ahora,
  (SELECT count(*) FROM public.movimientos_bancarios
    WHERE referencia='PS-000001' AND origen_tipo='pago_suplidor')                   AS salidas_registradas,
  (SELECT round(cb.saldo_inicial + COALESCE(SUM(CASE WHEN m.tipo='ENTRADA' THEN m.monto ELSE -m.monto END),0),2)
     FROM public.cuentas_bancarias cb
     LEFT JOIN public.movimientos_bancarios m ON m.cuenta_id=cb.id
    WHERE cb.id='88e08d17-50c0-46e2-b6bb-93530e75f9d0'
    GROUP BY cb.saldo_inicial)                                                      AS saldo_odalys;
