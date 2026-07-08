-- =====================================================================
-- Compras y pagos a suplidores en DÓLARES con tasa del día
-- Para dealers/financieras cuyos suplidores facturan en US$ pero venden
-- en pesos: la factura se digita en US$, el sistema convierte a RD$ con
-- la tasa del día (costo/precio/inventario/DGII siguen en pesos) y la
-- DEUDA queda en US$; al pagar se usa la tasa de ese día y la diferencia
-- cambiaria queda registrada en el pago.
-- =====================================================================

-- 1) Moneda del suplidor
ALTER TABLE public.proveedores
  ADD COLUMN IF NOT EXISTS moneda text NOT NULL DEFAULT 'DOP';

-- 2) Compras: moneda original, tasa usada y deuda en US$
ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS moneda text NOT NULL DEFAULT 'DOP',
  ADD COLUMN IF NOT EXISTS tasa_cambio numeric,
  ADD COLUMN IF NOT EXISTS total_usd numeric,
  ADD COLUMN IF NOT EXISTS pendiente_usd numeric;

-- 3) Pagos: tasa del día del pago, total en US$ y diferencia cambiaria
--    (US$ abonados x (tasa pago - tasa compra); + = el dólar subió)
ALTER TABLE public.pagos_suplidores
  ADD COLUMN IF NOT EXISTS tasa_cambio numeric,
  ADD COLUMN IF NOT EXISTS total_usd numeric,
  ADD COLUMN IF NOT EXISTS diferencia_cambiaria numeric;

ALTER TABLE public.pagos_suplidores_detalle
  ADD COLUMN IF NOT EXISTS abonado_usd numeric;

-- 4) Tasa del día por empresa
CREATE TABLE IF NOT EXISTS public.tasas_cambio (
  tenant_id  uuid NOT NULL,
  fecha      date NOT NULL DEFAULT CURRENT_DATE,
  tasa       numeric(12,4) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, fecha)
);

ALTER TABLE public.tasas_cambio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tasas_cambio_tenant ON public.tasas_cambio;
CREATE POLICY tasas_cambio_tenant ON public.tasas_cambio FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

-- Última tasa conocida (si hoy no se ha puesto, devuelve la más reciente)
CREATE OR REPLACE FUNCTION public.get_tasa_dia()
RETURNS numeric
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT tasa FROM public.tasas_cambio
  WHERE tenant_id = public.get_user_tenant() AND fecha <= CURRENT_DATE
  ORDER BY fecha DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_tasa_dia(p_tasa numeric)
RETURNS void
LANGUAGE sql
SET search_path TO 'public'
AS $$
  INSERT INTO public.tasas_cambio (tenant_id, fecha, tasa)
  VALUES (public.get_user_tenant(), CURRENT_DATE, p_tasa)
  ON CONFLICT (tenant_id, fecha)
  DO UPDATE SET tasa = EXCLUDED.tasa, updated_at = now();
$$;

GRANT EXECUTE ON FUNCTION public.get_tasa_dia() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_tasa_dia(numeric) TO authenticated;

-- 5) Compras pendientes con los datos de moneda (cambia el tipo de retorno)
DROP FUNCTION IF EXISTS public.get_compras_pendientes_suplidor(uuid);
CREATE FUNCTION public.get_compras_pendientes_suplidor(p_suplidor_id uuid)
RETURNS TABLE(
  id uuid, fecha_emision date, fecha_vencimiento date, referencia text,
  monto_total numeric, monto_pendiente numeric,
  moneda text, tasa_compra numeric, total_usd numeric, pendiente_usd numeric
)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $function$
SELECT
    c.id,
    c.fecha AS fecha_emision,
    c.fecha + (COALESCE(c.dias_credito, 0) || ' days')::interval AS fecha_vencimiento,
    c.referencia,
    c.total_compra AS monto_total,
    COALESCE(c.monto_pendiente, c.total_compra - COALESCE(c.monto_pagado, 0)) AS monto_pendiente,
    COALESCE(c.moneda, 'DOP') AS moneda,
    c.tasa_cambio AS tasa_compra,
    c.total_usd,
    COALESCE(c.pendiente_usd, c.total_usd) AS pendiente_usd
FROM public.compras c
WHERE c.suplidor_id = p_suplidor_id
  AND c.forma_pago ILIKE 'CREDITO'
  AND c.estado = 'PENDIENTE'
  AND (COALESCE(c.monto_pendiente, c.total_compra - COALESCE(c.monto_pagado, 0)) > 0
       OR COALESCE(c.pendiente_usd, 0) > 0);
$function$;

GRANT EXECUTE ON FUNCTION public.get_compras_pendientes_suplidor(uuid) TO authenticated;

-- 6) Procesar pago: si el detalle trae abonado_usd y la compra es USD,
--    la deuda se rebaja en dólares y el RD$ pendiente se revaloriza a la
--    tasa del pago. Compras en pesos siguen exactamente igual.
CREATE OR REPLACE FUNCTION public.procesar_pago_suplidor(p_pago_data jsonb, p_detalles_data jsonb)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    v_pago_id uuid;
    v_pago_numero text;
    v_detalle jsonb;
    v_compra_id uuid;
    v_monto_abonado numeric;
    v_abonado_usd numeric;
    v_tasa_pago numeric;
    v_compra record;
    v_dif numeric := 0;
    v_monto_pendiente_actual numeric;
    v_pendiente_usd_actual numeric;
BEGIN
    v_pago_numero := get_next_pago_suplidor_numero();
    v_tasa_pago := NULLIF(p_pago_data->>'tasa_cambio', '')::numeric;

    INSERT INTO public.pagos_suplidores
        (numero, fecha, suplidor_id, monto_pagado, concepto, formas_pago, usuario_id, tasa_cambio, total_usd)
    VALUES (
        v_pago_numero,
        (p_pago_data->>'fecha')::date,
        (p_pago_data->>'suplidor_id')::uuid,
        (p_pago_data->>'total_pagado')::numeric,
        p_pago_data->>'concepto',
        (p_pago_data->>'formas_pago')::jsonb,
        auth.uid(),
        v_tasa_pago,
        NULLIF(p_pago_data->>'total_usd', '')::numeric
    ) RETURNING id INTO v_pago_id;

    FOR v_detalle IN SELECT * FROM jsonb_array_elements(p_detalles_data)
    LOOP
        v_compra_id := (v_detalle->>'compra_id')::uuid;
        v_monto_abonado := (v_detalle->>'monto_abonado')::numeric;
        v_abonado_usd := NULLIF(v_detalle->>'abonado_usd', '')::numeric;

        INSERT INTO public.pagos_suplidores_detalle (pago_id, compra_id, monto_abonado, abonado_usd)
        VALUES (v_pago_id, v_compra_id, v_monto_abonado, v_abonado_usd);

        SELECT * INTO v_compra FROM public.compras WHERE id = v_compra_id;

        IF v_abonado_usd IS NOT NULL AND COALESCE(v_compra.moneda, 'DOP') = 'USD' THEN
            v_pendiente_usd_actual := GREATEST(
                COALESCE(v_compra.pendiente_usd, v_compra.total_usd, 0) - v_abonado_usd, 0);
            v_dif := v_dif + ROUND(
                v_abonado_usd * (COALESCE(v_tasa_pago, 0) - COALESCE(v_compra.tasa_cambio, COALESCE(v_tasa_pago, 0))), 2);

            UPDATE public.compras
            SET pendiente_usd   = v_pendiente_usd_actual,
                monto_pagado    = COALESCE(monto_pagado, 0) + v_monto_abonado,
                monto_pendiente = ROUND(v_pendiente_usd_actual * COALESCE(v_tasa_pago, tasa_cambio, 0), 2),
                updated_at      = now()
            WHERE id = v_compra_id;

            IF v_pendiente_usd_actual <= 0.01 THEN
                UPDATE public.compras
                SET estado = 'PAGADA', monto_pendiente = 0, pendiente_usd = 0
                WHERE id = v_compra_id;
            END IF;
        ELSE
            UPDATE public.compras
            SET monto_pendiente = COALESCE(monto_pendiente, total_compra) - v_monto_abonado,
                monto_pagado    = COALESCE(monto_pagado, 0) + v_monto_abonado,
                updated_at      = now()
            WHERE id = v_compra_id
            RETURNING monto_pendiente INTO v_monto_pendiente_actual;

            IF v_monto_pendiente_actual <= 0.01 THEN
                UPDATE public.compras
                SET estado = 'PAGADA', monto_pendiente = 0
                WHERE id = v_compra_id;
            END IF;
        END IF;
    END LOOP;

    IF v_dif <> 0 THEN
        UPDATE public.pagos_suplidores SET diferencia_cambiaria = v_dif WHERE id = v_pago_id;
    END IF;

    RETURN v_pago_numero;
END;
$function$;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('compras_dolares.sql');
  END IF;
END $$;

SELECT 'Compras/pagos en dólares con tasa del día listos' AS status;
