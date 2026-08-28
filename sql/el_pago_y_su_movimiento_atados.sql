-- =====================================================================
-- El pago y su movimiento, atados de verdad
-- ---------------------------------------------------------------------
-- (2026-08-28) Comprobando que PS-000020 hubiera quedado bien salió algo
-- peor de lo que se venía arreglando.
--
-- >>> 1. EL NUMERO DE PAGO NO ES UNICO <<<
-- Cada empresa numera desde 1, así que PS-000003 existe TRES veces:
--   MotoPréstamos  RD$    75,000   26/08
--   REPUESTOS CAMINERO  RD$ 49,839.52  22/06
--   CAMINERO MOTORS     RD$300,000     15/07
-- Y corregir_forma_pago_suplidor borraba el movimiento viejo buscándolo por
-- `referencia = numero` sobre TODAS las cuentas propias y las de la
-- financiera vinculada. Caminero y MotoPréstamos comparten cuentas: corregir
-- el PS-000003 de una podía borrarle el movimiento a la otra. Un saldo que
-- baja solo, en la empresa que nadie estaba mirando.
--
-- >>> 2. LA REFERENCIA LLEVA EL NUMERO DEL BANCO, NO EL DEL PAGO <<<
-- Al crear el pago, la referencia del movimiento se rellena con el número de
-- transferencia que se teclea ("7883", "cheque 008803"), que es lo que se
-- quiere ver en el estado de cuenta. Pero entonces el borrado por
-- `referencia = numero` no lo encuentra: la corrección dejaría el viejo Y
-- crearía el nuevo. PS-000014 es ese caso, y corregirlo le habría sacado
-- US$14,000 a una caja de la que salieron 7,000.
--
-- >>> LO QUE SE HACE <<<
-- Atarlos por `origen_id`, que es el id del pago: exacto, no se repite entre
-- empresas y ya tiene índice único (tenant_id, origen_tipo, origen_id), así
-- que además vuelve el guardado idempotente contra un doble clic.
--
-- Se rellena hacia atrás donde se puede saber sin adivinar, y para lo que
-- quede sin atar la corrección conserva una búsqueda de respaldo que exige
-- el número DENTRO del concepto y, si la cuenta es de la otra empresa, el
-- "· vía <empresa>" que escribió quien pagó. Es la llave con la que se
-- escribió el movimiento; no hay otra más fiel.
--
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Atar hacia atrás lo que se pueda saber sin adivinar
-- ---------------------------------------------------------------------
-- Solo se ata cuando UNA sola candidata encaja: mismo numero en el concepto,
-- la empresa cuadra (la duena del movimiento, o la nombrada en el "via"), y
-- el monto coincide con lo pagado en la moneda de la cuenta. Ante dos
-- candidatas no se ata ninguna: un enlace equivocado es peor que ninguno,
-- porque la correccion lo usaria para borrar.
WITH mov AS (
  SELECT m.id, m.tenant_id, m.monto, m.concepto, m.cuenta_id,
         (regexp_match(m.concepto, '\((PS-[0-9]+)\)'))[1] AS num,
         c.moneda,
         (regexp_match(m.concepto, '· vía (.+)$'))[1] AS via
  FROM public.movimientos_bancarios m
  JOIN public.cuentas_bancarias c ON c.id = m.cuenta_id
  WHERE m.origen_tipo = 'pago_suplidor' AND m.origen_id IS NULL
), cand AS (
  SELECT v.id AS mov_id, p.id AS pago_id,
         count(*) OVER (PARTITION BY v.id) AS cuantas
  FROM mov v
  JOIN public.pagos_suplidores p ON p.numero = v.num
  LEFT JOIN public.config_empresa ce ON ce.tenant_id = p.tenant_id
  WHERE v.num IS NOT NULL
    -- La empresa: o el movimiento es suyo, o su nombre es el que va en el via.
    AND (p.tenant_id = v.tenant_id OR ce.nombre = v.via)
    -- Y el monto tiene que cuadrar en la moneda de la cuenta.
    AND abs(v.monto - CASE WHEN v.moneda = 'DOP' THEN p.monto_pagado
                           ELSE round(p.monto_pagado / NULLIF(p.tasa_cambio, 0), 2) END) <= 0.02
)
UPDATE public.movimientos_bancarios m
   SET origen_id = c.pago_id
  FROM cand c
 WHERE m.id = c.mov_id AND c.cuantas = 1
   -- Y que no haya ya otro movimiento atado a ese mismo pago: el indice
   -- unico lo rechazaria y se llevaria por delante toda la migracion.
   AND NOT EXISTS (SELECT 1 FROM public.movimientos_bancarios o
                   WHERE o.tenant_id = m.tenant_id AND o.origen_tipo = 'pago_suplidor'
                     AND o.origen_id = c.pago_id);

-- ---------------------------------------------------------------------
-- 2) La correccion, atando por el id y sin cruzar empresas
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.corregir_forma_pago_suplidor(
  p_pago_id     uuid,
  p_formas_pago jsonb,
  p_cuenta_id   uuid DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_yo       text;
  v_pago     record;
  v_suma     numeric := 0;
  v_pesos    numeric := 0;   -- lo que sale de la cuenta, en RD$
  v_monto    numeric := 0;   -- lo mismo, ya en la moneda de la cuenta
  v_moneda   text;
  v_cuenta   text;
  v_prov     text;
  v_borrados int := 0;
  v_mov      uuid;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin empresa'; END IF;
  SELECT nombre INTO v_yo FROM public.config_empresa WHERE tenant_id = v_tenant;

  SELECT * INTO v_pago FROM public.pagos_suplidores
  WHERE id = p_pago_id AND tenant_id = v_tenant;
  IF v_pago.id IS NULL THEN
    RETURN json_build_object('ok', false, 'motivo', 'Ese pago no es de esta empresa');
  END IF;
  IF COALESCE(v_pago.anulado, false) THEN
    RETURN json_build_object('ok', false, 'motivo', 'El pago esta anulado: no hay nada que corregir');
  END IF;

  IF jsonb_typeof(p_formas_pago) <> 'array' OR jsonb_array_length(p_formas_pago) = 0 THEN
    RETURN json_build_object('ok', false, 'motivo', 'Hace falta al menos una forma de pago');
  END IF;

  -- Las formas tienen que sumar lo que se pago. Si no, el pago quedaria
  -- diciendo una cosa y el detalle otra, que es peor que el error original.
  SELECT COALESCE(SUM((f ->> 'monto')::numeric), 0) INTO v_suma
  FROM jsonb_array_elements(p_formas_pago) f;

  IF abs(v_suma - COALESCE(v_pago.monto_pagado, 0)) > 0.01 THEN
    RETURN json_build_object('ok', false, 'motivo',
      format('Las formas suman %s y el pago fue de %s', v_suma, v_pago.monto_pagado));
  END IF;

  IF p_cuenta_id IS NOT NULL THEN
    SELECT c.moneda, c.banco || COALESCE(' — ' || c.alias, '')
      INTO v_moneda, v_cuenta
    FROM public.cuentas_bancarias c WHERE c.id = p_cuenta_id;
    IF v_moneda IS NULL THEN
      RETURN json_build_object('ok', false, 'motivo', 'Esa cuenta no existe');
    END IF;
  END IF;

  -- >>> LO QUE SALE DE LA CUENTA <<<
  -- Transferencia y cheque, siempre. Efectivo, solo si la cuenta no es en
  -- pesos: los dolares en mano salen de la caja en dolares, los pesos en
  -- mano los resta el cierre de caja. (src/lib/saleDeLaCuenta.js)
  SELECT COALESCE(SUM((f ->> 'monto')::numeric), 0) INTO v_pesos
  FROM jsonb_array_elements(p_formas_pago) f
  WHERE f ->> 'forma' IN ('Transferencia', 'Cheque')
     OR (f ->> 'forma' = 'Efectivo' AND v_moneda IS NOT NULL AND v_moneda <> 'DOP');

  IF v_pesos > 0 AND p_cuenta_id IS NULL THEN
    RETURN json_build_object('ok', false, 'motivo', 'Dime de que cuenta sale la transferencia o el cheque');
  END IF;

  -- A una cuenta en divisa no se le restan pesos: le dejaria el saldo
  -- inventado, que es peor que no moverla.
  IF v_pesos > 0 AND v_moneda <> 'DOP' THEN
    IF COALESCE(v_pago.tasa_cambio, 0) <= 0 THEN
      RETURN json_build_object('ok', false, 'motivo',
        format('La cuenta esta en %s y el pago no tiene tasa guardada: no se sabe cuanto salio de ella', v_moneda));
    END IF;
    v_monto := round(v_pesos / v_pago.tasa_cambio, 2);
  ELSE
    v_monto := v_pesos;
  END IF;

  -- >>> FUERA EL MOVIMIENTO VIEJO <<<
  -- Por el id del pago, que no se repite. Y para los viejos que aun no estan
  -- atados, por el numero DENTRO del concepto: ademas se exige que la
  -- empresa cuadre —o el movimiento es de esta empresa, o su concepto dice
  -- "· via <esta empresa>"—. Sin eso, corregir el PS-000003 de una empresa
  -- le borraba el suyo a la otra, porque las cuentas son compartidas.
  DELETE FROM public.movimientos_bancarios mb
   WHERE mb.origen_tipo = 'pago_suplidor'
     AND (
       mb.origen_id = p_pago_id
       OR (
         mb.origen_id IS NULL
         AND mb.concepto LIKE '%(' || v_pago.numero || ')%'
         AND (mb.tenant_id = v_tenant OR mb.concepto LIKE '%· vía ' || v_yo)
       )
     );
  GET DIAGNOSTICS v_borrados = ROW_COUNT;

  UPDATE public.pagos_suplidores
     SET formas_pago = p_formas_pago
   WHERE id = p_pago_id AND tenant_id = v_tenant;

  IF v_monto > 0 THEN
    SELECT nombre INTO v_prov FROM public.proveedores WHERE id = v_pago.suplidor_id;
    v_mov := public.registrar_movimiento_bancario_compartido(
      p_cuenta_id  => p_cuenta_id,
      p_tipo       => 'SALIDA',
      p_monto      => v_monto,
      p_concepto   => format('Pago suplidor %s (%s)', COALESCE(v_prov, ''), v_pago.numero),
      p_referencia => COALESCE(NULLIF(btrim((p_formas_pago -> 0) ->> 'referencia'), ''), v_pago.numero),
      p_origen_tipo=> 'pago_suplidor',
      p_origen_id  => p_pago_id,
      p_fecha      => v_pago.fecha
    );
  END IF;

  RETURN json_build_object(
    'ok', true,
    'numero', v_pago.numero,
    'movimientos_borrados', v_borrados,
    'movimiento_nuevo', v_mov,
    'monto_banco', v_pesos,          -- se mantiene por compatibilidad
    'monto_cuenta', v_monto,
    'moneda_cuenta', v_moneda,
    'cuenta', v_cuenta
  );
END $fn$;

REVOKE EXECUTE ON FUNCTION public.corregir_forma_pago_suplidor(uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.corregir_forma_pago_suplidor(uuid, jsonb, uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 3) La lista, encontrando la cuenta por el id del pago
-- ---------------------------------------------------------------------
-- Antes buscaba por `referencia = numero`: en los pagos donde se tecleo el
-- numero de la transferencia, la columna "de donde salio" salia vacia y se
-- corregia a ciegas.
CREATE OR REPLACE FUNCTION public.get_pagos_suplidores_recientes(p_limit int DEFAULT 25)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_yo     text;
  v_out    json;
BEGIN
  IF v_tenant IS NULL THEN RETURN '[]'::json; END IF;
  SELECT nombre INTO v_yo FROM public.config_empresa WHERE tenant_id = v_tenant;

  SELECT COALESCE(json_agg(x ORDER BY x.created_at DESC), '[]'::json) INTO v_out
  FROM (
    SELECT ps.id, ps.numero, ps.fecha, ps.monto_pagado, ps.formas_pago,
           ps.anulado, ps.created_at, ps.total_usd, ps.tasa_cambio,
           pr.nombre AS suplidor,
           m.cuenta_id,
           cb.banco || ' — ' || COALESCE(cb.alias, '') AS cuenta_nombre,
           cb.moneda AS cuenta_moneda
    FROM public.pagos_suplidores ps
    LEFT JOIN public.proveedores pr ON pr.id = ps.suplidor_id
    LEFT JOIN LATERAL (
      SELECT mb.cuenta_id FROM public.movimientos_bancarios mb
      WHERE mb.origen_tipo = 'pago_suplidor'
        AND (mb.origen_id = ps.id
             OR (mb.origen_id IS NULL
                 AND mb.concepto LIKE '%(' || ps.numero || ')%'
                 AND (mb.tenant_id = v_tenant OR mb.concepto LIKE '%· vía ' || v_yo)))
      LIMIT 1
    ) m ON true
    LEFT JOIN public.cuentas_bancarias cb ON cb.id = m.cuenta_id
    WHERE ps.tenant_id = v_tenant
    ORDER BY ps.created_at DESC
    LIMIT GREATEST(1, LEAST(p_limit, 100))
  ) x;

  RETURN v_out;
END $fn$;

REVOKE EXECUTE ON FUNCTION public.get_pagos_suplidores_recientes(int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_pagos_suplidores_recientes(int) TO authenticated;

-- ---------------------------------------------------------------------
-- 4) El centinela, sin exagerar
-- ---------------------------------------------------------------------
-- La primera version buscaba por `referencia = numero` y señalaba pagos que
-- SI habian movido su caja, solo que archivados bajo el numero del banco
-- (PS-000014). Un indicador que grita de mas se deja de mirar.
CREATE OR REPLACE VIEW public.v_pagos_divisa_sin_salida AS
SELECT ps.tenant_id, ps.id, ps.numero, ps.fecha, pr.nombre AS suplidor,
       ps.total_usd, ps.tasa_cambio, ps.monto_pagado,
       (SELECT string_agg(f ->> 'forma', ' / ')
          FROM jsonb_array_elements(ps.formas_pago) f) AS formas
FROM public.pagos_suplidores ps
LEFT JOIN public.proveedores pr ON pr.id = ps.suplidor_id
WHERE COALESCE(ps.anulado, false) = false
  AND COALESCE(ps.total_usd, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.movimientos_bancarios mb
    WHERE mb.origen_tipo = 'pago_suplidor'
      AND (mb.origen_id = ps.id OR mb.concepto LIKE '%(' || ps.numero || ')%'));

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('el_pago_y_su_movimiento_atados.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT json_build_object(
  'movs_atados', (SELECT count(*) FROM public.movimientos_bancarios
                  WHERE origen_tipo = 'pago_suplidor' AND origen_id IS NOT NULL),
  'movs_sueltos', (SELECT count(*) FROM public.movimientos_bancarios
                   WHERE origen_tipo = 'pago_suplidor' AND origen_id IS NULL),
  -- Ningun pago puede quedar con dos movimientos atados.
  'pagos_con_dos', (SELECT COALESCE(json_agg(t), '[]'::json) FROM (
     SELECT origen_id, count(*) AS n FROM public.movimientos_bancarios
     WHERE origen_tipo = 'pago_suplidor' AND origen_id IS NOT NULL
     GROUP BY origen_id HAVING count(*) > 1) t),
  'aun_sin_salida', (SELECT COALESCE(json_agg(json_build_object(
       'numero', v.numero, 'fecha', v.fecha, 'suplidor', v.suplidor,
       'usd', v.total_usd, 'formas', v.formas)), '[]'::json)
     FROM public.v_pagos_divisa_sin_salida v WHERE v.fecha >= DATE '2026-07-28')
) AS r;
