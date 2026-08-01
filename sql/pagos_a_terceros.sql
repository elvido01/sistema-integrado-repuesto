-- =====================================================================
-- Pagos a terceros: el GPS y el seguro no son gastos de la empresa
-- ---------------------------------------------------------------------
-- (2026-08-01) "Cuando Caminero vende una motocicleta que incluye casco,
-- seguro, GPS, placa y matrícula le hace al cliente un total global... pero
-- luego tiene que sacar de esa venta los 3,600 del GPS y los 1,000 del seguro
-- y pagárselos a los suplidores que le brindan el servicio. Actualmente lo
-- saca como un gasto, y eso crea la sensación de que la empresa está
-- generando muchos gastos."
--
-- >>> CONFIRMADO, Y ERA PEOR DE LO QUE SE VEÍA <<<
-- El historial COMPLETO de gastos de Caminero eran 4 registros:
--
--   24/07  GPS       3,600
--   23/07  SEGURO    1,000
--   23/07  GPS       3,600
--   26/06  GASOLINA    100
--
-- O sea que el 98.8% de todo lo registrado como gasto era dinero que nunca
-- fue un gasto suyo: lo cobró a nombre de otro y se lo entregó. Por eso los
-- reportes de gasto de esa empresa no querían decir nada.
--
-- >>> POR QUÉ NO ES UN GASTO, PERO SÍ SALE DE LA CAJA <<<
-- Caminero cobra EXACTAMENTE lo que paga: 3,600 entran, 3,600 salen. No hay
-- margen. El GPS es la garantía de poder recuperar la moto si el cliente deja
-- de pagar, y el seguro/placa/matrícula son para que el cliente cumpla con la
-- ley. Son servicios de terceros que Caminero cobra por cuenta ajena.
--
-- Eso manda cómo se resuelve, y es una distinción fina que vale la pena:
--
--   COMO EFECTIVO  → sí salió de la gaveta. La caja y el cierre lo tienen que
--                    seguir restando exactamente igual que hoy.
--   COMO GASTO     → no lo es. No debe sumar en "Gastos diarios".
--
-- Por eso el pago se sigue guardando en gastos_diarios —donde 31 funciones de
-- SQL ya saben restarlo bien de la caja— pero MARCADO. Mover el dinero a otra
-- tabla habría obligado a re-enseñarle a esas 31 funciones dónde está el
-- efectivo, y el cuadre de caja se rompió dos veces esta semana por menos.
-- Lo que estaba mal era la etiqueta, no el movimiento: se arregla la etiqueta.
--
-- >>> LO QUE ESTE ARCHIVO DEJA MONTADO <<<
--   1. gastos_diarios.es_tercero / concepto_tercero / cliente_id
--   2. conceptos_terceros: el catálogo con el monto fijo de cada servicio,
--      editable por empresa (GPS 3,600 y SEGURO 1,000 vienen de los datos
--      reales; casco, placa y matrícula quedan en 0 = "pregúntame el monto
--      la primera vez", porque no los sé y no los voy a inventar).
--   3. Los 3 pagos ya hechos quedan reclasificados.
--   4. get_ingresos_dealer_mes separa la línea sin mover el flujo neto.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) LA MARCA EN EL GASTO
-- ------------------------------------------------------------
ALTER TABLE public.gastos_diarios
  ADD COLUMN IF NOT EXISTS es_tercero boolean NOT NULL DEFAULT false;

ALTER TABLE public.gastos_diarios
  ADD COLUMN IF NOT EXISTS concepto_tercero text;

-- De quién es el GPS/seguro. Opcional: si se llena, un día se puede saber
-- qué se le entregó a cada cliente y qué falta.
ALTER TABLE public.gastos_diarios
  ADD COLUMN IF NOT EXISTS cliente_id uuid;

COMMENT ON COLUMN public.gastos_diarios.es_tercero IS
  'true = no es gasto de la empresa: se cobró al cliente y se le entrega a un tercero (GPS, seguro, placa...). SÍ sale de la caja, NO suma en reportes de gasto.';

CREATE INDEX IF NOT EXISTS idx_gastos_diarios_tercero
  ON public.gastos_diarios (tenant_id, fecha)
  WHERE es_tercero = true;

-- ------------------------------------------------------------
-- 2) EL CATÁLOGO DE CONCEPTOS (montos fijos, editables)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.conceptos_terceros (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  nombre      text NOT NULL,
  monto       numeric NOT NULL DEFAULT 0,
  orden       integer NOT NULL DEFAULT 0,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_conceptos_terceros_nombre
  ON public.conceptos_terceros (tenant_id, upper(btrim(nombre)));

DO $$ BEGIN
  ALTER TABLE public.conceptos_terceros ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS conceptos_terceros_tenant ON public.conceptos_terceros;
  CREATE POLICY conceptos_terceros_tenant ON public.conceptos_terceros FOR ALL
    USING (tenant_id = public.get_user_tenant())
    WITH CHECK (tenant_id = public.get_user_tenant());
  REVOKE ALL ON public.conceptos_terceros FROM anon;
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.conceptos_terceros TO authenticated, service_role;
END $$;

-- ------------------------------------------------------------
-- 3) SEMILLA
-- ------------------------------------------------------------
-- Solo para las empresas que venden y pasan el financiamiento a una
-- financiera (hoy: Caminero Motors). Se identifican por el enlace de
-- config_empresa, NUNCA por nombre.
DO $$
DECLARE
  v_ten uuid;
  v_n   int := 0;
BEGIN
  FOR v_ten IN
    SELECT DISTINCT ce.tenant_id FROM public.config_empresa ce
    WHERE COALESCE(ce.financiamiento_tipo, 'propio') = 'terceros'
      AND ce.tenant_id IS NOT NULL
  LOOP
    INSERT INTO public.conceptos_terceros (tenant_id, nombre, monto, orden)
    VALUES (v_ten, 'GPS',       3600, 1),
           (v_ten, 'SEGURO',    1000, 2),
           (v_ten, 'CASCO',        0, 3),
           (v_ten, 'PLACA',        0, 4),
           (v_ten, 'MATRICULA',    0, 5)
    ON CONFLICT DO NOTHING;
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'Conceptos sembrados para % empresa(s).', v_n;
END $$;

-- ------------------------------------------------------------
-- 4) RECLASIFICAR LOS PAGOS YA HECHOS
-- ------------------------------------------------------------
-- Los 3 que existen. No se toca el monto ni la fecha ni afecta_caja: el
-- dinero salió cuando salió y el cierre de esos días no se mueve.
UPDATE public.gastos_diarios g
   SET es_tercero      = true,
       concepto_tercero = CASE
         WHEN upper(btrim(g.descripcion)) LIKE 'GPS%'       THEN 'GPS'
         WHEN upper(btrim(g.descripcion)) LIKE 'SEGURO%'    THEN 'SEGURO'
         WHEN upper(btrim(g.descripcion)) LIKE 'CASCO%'     THEN 'CASCO'
         WHEN upper(btrim(g.descripcion)) LIKE 'PLACA%'     THEN 'PLACA'
         WHEN upper(btrim(g.descripcion)) LIKE 'MATRICULA%' THEN 'MATRICULA'
       END
 WHERE g.es_tercero = false
   AND COALESCE(g.anulado, false) = false
   AND EXISTS (SELECT 1 FROM public.config_empresa ce
                WHERE ce.tenant_id = g.tenant_id
                  AND COALESCE(ce.financiamiento_tipo, 'propio') = 'terceros')
   AND upper(btrim(g.descripcion)) ~ '^(GPS|SEGURO|CASCO|PLACA|MATRICULA)';

-- ------------------------------------------------------------
-- 5) EL DESGLOSE DEL GRUPO SEPARA LA LÍNEA
-- ------------------------------------------------------------
-- Los pagos a terceros SIGUEN siendo egreso (el dinero salió), pero en su
-- propia línea. El flujo neto da exactamente igual que antes: solo se parte
-- en dos lo que era un solo número.
CREATE OR REPLACE FUNCTION public.get_ingresos_dealer_mes()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant  uuid := public.get_user_tenant();
  v_dealer  uuid;
  v_nombre  text;
  v_ini     date;
  v_fin     date;
  v_contado     numeric := 0;  v_contado_n int := 0;
  v_recibos     numeric := 0;  v_recibos_n int := 0;
  v_gastos      numeric := 0;
  v_terceros    numeric := 0;
  v_compromisos numeric := 0;
  v_suplidores  numeric := 0;
  v_compras     numeric := 0;
  v_comisiones  numeric := 0;
BEGIN
  IF v_tenant IS NULL THEN RETURN NULL; END IF;

  -- El dealer que financia SUS ventas con esta empresa. Por el enlace de
  -- config_empresa, nunca por nombre.
  SELECT ce.tenant_id, ce.nombre INTO v_dealer, v_nombre
  FROM public.config_empresa ce
  WHERE ce.financiera_tenant_id = v_tenant
    AND COALESCE(ce.financiamiento_tipo, 'propio') = 'terceros'
    AND ce.tenant_id <> v_tenant
  LIMIT 1;

  IF v_dealer IS NULL THEN RETURN NULL; END IF;

  v_ini := date_trunc('month', (now() AT TIME ZONE 'America/Santo_Domingo')::date)::date;
  v_fin := (v_ini + interval '1 month')::date;   -- exclusivo

  -- ---------- lo que cobró ----------
  -- Contado: la factura ya trae el dinero, no deja recibo aparte.
  SELECT COUNT(*), COALESCE(SUM(fa.total), 0) INTO v_contado_n, v_contado
  FROM public.facturas fa
  WHERE fa.tenant_id = v_dealer
    AND (fa.fecha AT TIME ZONE 'America/Santo_Domingo')::date >= v_ini
    AND (fa.fecha AT TIME ZONE 'America/Santo_Domingo')::date <  v_fin
    AND fa.forma_pago ILIKE '%contado%'
    AND COALESCE(fa.estado, '') <> 'ANULADA';

  -- Recibos: la inicial de las financiadas y los abonos posteriores.
  SELECT COUNT(*), COALESCE(SUM(ri.monto_pagado), 0) INTO v_recibos_n, v_recibos
  FROM public.recibos_ingreso ri
  WHERE ri.tenant_id = v_dealer
    AND ri.fecha >= v_ini AND ri.fecha < v_fin
    AND COALESCE(ri.anulado, false) = false;

  -- ---------- lo que pagó ----------
  -- Gasto de verdad: sin lo que se le entrega a terceros.
  SELECT COALESCE(SUM(g.monto), 0) INTO v_gastos
  FROM public.gastos_diarios g
  WHERE g.tenant_id = v_dealer
    AND g.fecha >= v_ini AND g.fecha < v_fin
    AND COALESCE(g.anulado, false) = false
    AND COALESCE(g.es_tercero, false) = false;

  -- GPS, seguro, placa...: salió el dinero, pero no es gasto de la empresa.
  SELECT COALESCE(SUM(g.monto), 0) INTO v_terceros
  FROM public.gastos_diarios g
  WHERE g.tenant_id = v_dealer
    AND g.fecha >= v_ini AND g.fecha < v_fin
    AND COALESCE(g.anulado, false) = false
    AND COALESCE(g.es_tercero, false) = true;

  SELECT COALESCE(SUM(c.monto), 0) INTO v_compromisos
  FROM public.compromisos c
  WHERE c.tenant_id = v_dealer
    AND c.activo = false
    AND c.fecha_pago IS NOT NULL
    AND c.fecha >= v_ini AND c.fecha < v_fin;

  SELECT COALESCE(SUM(ps.monto_pagado), 0) INTO v_suplidores
  FROM public.pagos_suplidores ps
  WHERE ps.tenant_id = v_dealer
    AND ps.fecha >= v_ini AND ps.fecha < v_fin
    AND COALESCE(ps.anulado, false) = false;

  SELECT COALESCE(SUM(co.total_compra), 0) INTO v_compras
  FROM public.compras co
  WHERE co.tenant_id = v_dealer
    AND co.fecha >= v_ini AND co.fecha < v_fin
    AND co.forma_pago ILIKE '%contado%'
    AND COALESCE(co.estado, '') <> 'ANULADA';

  SELECT COALESCE(SUM(pc.total_comision), 0) INTO v_comisiones
  FROM public.pagos_comisiones pc
  WHERE pc.tenant_id = v_dealer
    AND pc.fecha_pago >= v_ini AND pc.fecha_pago < v_fin
    AND UPPER(COALESCE(pc.forma_pago, 'EFECTIVO')) = 'TRANSFERENCIA'
    AND COALESCE(pc.anulado, false) = false;

  RETURN json_build_object(
    'dealer_nombre',  COALESCE(v_nombre, 'Dealer'),
    'desde',          v_ini,
    'hasta',          (v_fin - 1),
    'contado',        ROUND(v_contado, 2),
    'contado_cant',   v_contado_n,
    'recibos',        ROUND(v_recibos, 2),
    'recibos_cant',   v_recibos_n,
    'total',          ROUND(v_contado + v_recibos, 2),
    'gastos',         ROUND(v_gastos, 2),
    'terceros',       ROUND(v_terceros, 2),
    'compromisos',    ROUND(v_compromisos, 2),
    'suplidores',     ROUND(v_suplidores, 2),
    'compras',        ROUND(v_compras, 2),
    'comisiones',     ROUND(v_comisiones, 2),
    'egresos',        ROUND(v_gastos + v_terceros + v_compromisos + v_suplidores + v_compras + v_comisiones, 2),
    'neto',           ROUND(v_contado + v_recibos
                            - (v_gastos + v_terceros + v_compromisos + v_suplidores + v_compras + v_comisiones), 2)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.get_ingresos_dealer_mes() TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('pagos_a_terceros.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) EL CATÁLOGO
SELECT ce.nombre AS empresa, ct.nombre, ct.monto, ct.orden
FROM public.conceptos_terceros ct
JOIN public.config_empresa ce ON ce.tenant_id = ct.tenant_id
ORDER BY ce.nombre, ct.orden;
-- esperado: CAMINERO MOTORS · GPS 3600 · SEGURO 1000 · CASCO/PLACA/MATRICULA 0

-- 2) LOS GASTOS RECLASIFICADOS
SELECT fecha, monto, descripcion, es_tercero, concepto_tercero, afecta_caja
FROM public.gastos_diarios
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
ORDER BY fecha DESC;
-- esperado: los 3 de GPS/SEGURO con es_tercero=true y su concepto;
-- la GASOLINA de 100 sigue en false. afecta_caja NO cambió en ninguno.

-- 3) GASTO DE VERDAD VS DINERO DE TERCEROS
SELECT
  SUM(monto) FILTER (WHERE NOT es_tercero) AS gasto_real,
  SUM(monto) FILTER (WHERE es_tercero)     AS entregado_a_terceros,
  SUM(monto)                               AS salio_de_la_caja
FROM public.gastos_diarios
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND COALESCE(anulado, false) = false;
-- esperado: gasto real 100 · terceros 8,200 · caja 8,300
-- El total de caja NO cambia: era y sigue siendo 8,300.
