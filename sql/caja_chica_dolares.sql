-- =====================================================================
-- Caja Chica en DOS monedas: pesos y dólares
-- ---------------------------------------------------------------------
-- (2026-07-28) Pedido: que la caja chica maneje RD$ y US$ con su saldo
-- por separado.
--
-- El módulo de Cuentas Bancarias YA sabe hacer esto: cada cuenta lleva su
-- moneda y la pantalla agrupa los totales POR MONEDA (la fila "Totales por
-- moneda" de arriba), pone el badge de la divisa en cada tarjeta y formatea
-- cada saldo con su símbolo. Los movimientos también van por cuenta, así que
-- los pesos y los dólares nunca se mezclan ni se convierten solos.
--
-- Por eso no hace falta tocar código: basta con que la caja chica sean DOS
-- cuentas hermanas, una por moneda. Es como está armado el resto del módulo
-- y funciona con todo lo que ya existe: pagos, transferencias entre cuentas,
-- ingresos y retiros manuales.
--
--   CAJA CHICA — Pesos     DOP   (la que ya existía)
--   CAJA CHICA — Dólares   USD   (nueva)
--
-- Al elegir cuenta en cualquier módulo, el selector filtra por la moneda de
-- la operación: un pago en dólares solo ofrecerá la de dólares.
--
-- El saldo inicial de la nueva queda en 0. Se ajusta desde el propio módulo
-- con un ingreso manual, que deja el movimiento registrado (mejor que
-- escribir el saldo a mano, porque queda el rastro de dónde salió).
--
-- Idempotente / re-ejecutable.
-- =====================================================================

DO $$
DECLARE
  v_fin uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';  -- MOTOPRESTAMOS LOS NARANJOS
  v_n   int;
BEGIN
  -- 1) La caja chica que ya existe queda etiquetada como la de pesos, para
  --    que en los desplegables se distingan de un vistazo.
  UPDATE public.cuentas_bancarias
     SET alias = 'Pesos'
   WHERE tenant_id = v_fin
     AND banco = 'CAJA CHICA'
     AND moneda = 'DOP'
     AND COALESCE(btrim(alias), '') = '';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Caja chica en pesos etiquetada: % fila(s)', v_n;

  -- 2) La hermana en dólares
  INSERT INTO public.cuentas_bancarias
    (tenant_id, banco, alias, numero_cuenta, tipo, moneda, saldo_inicial, activo, orden)
  SELECT v_fin, 'CAJA CHICA', 'Dólares', NULL, 'corriente', 'USD', 0, true, 2
  WHERE NOT EXISTS (
    SELECT 1 FROM public.cuentas_bancarias
     WHERE tenant_id = v_fin AND banco = 'CAJA CHICA' AND moneda = 'USD'
  );
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Caja chica en dólares creada: % fila(s)', v_n;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('caja_chica_dolares.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) Las dos cajas chicas, una por moneda
SELECT banco, alias, moneda, saldo_inicial, activo, orden
FROM public.cuentas_bancarias
WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND banco = 'CAJA CHICA'
ORDER BY moneda;
-- esperado: CAJA CHICA | Dólares | USD   y   CAJA CHICA | Pesos | DOP

-- 2) Cómo va a verse el resumen "Totales por moneda" del módulo
SELECT c.moneda,
       count(*) AS cuentas,
       SUM(c.saldo_inicial
           + COALESCE((SELECT SUM(CASE WHEN m.tipo = 'ENTRADA' THEN m.monto ELSE -m.monto END)
                         FROM public.movimientos_bancarios m
                        WHERE m.cuenta_id = c.id), 0)) AS saldo
FROM public.cuentas_bancarias c
WHERE c.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND c.activo
GROUP BY c.moneda
ORDER BY c.moneda;
-- esperado: una línea DOP y una línea USD (la de USD en 0 hasta que se le
-- registre el primer ingreso desde el módulo)
