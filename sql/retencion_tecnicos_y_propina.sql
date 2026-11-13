-- ============================================================
-- Retención a servicios técnicos y propina en la factura (13/11/2026)
-- ------------------------------------------------------------
-- Pedido de Oscar Aristy (lavado de vehículos): un cliente empresa le exige
-- la factura con la retención de ISR y la propina, así:
--   Total gravado 515.47 · ITBIS 92.78 · Propina 100.00 · ISR 15.46 (3 %)
--   Total a pagar 600.00  ( = 515.47 + 92.78 + 100 − ITBIS retenido 92.78 − ISR 15.46 )
--
-- Reglas (DGII, «Retenciones ISR-ITBIS», jul. 2025, y Ley 30-26):
-- · Persona jurídica que le paga un servicio a una PERSONA FÍSICA:
--     - le retiene el 100 % del ITBIS de CUALQUIER servicio gravado
--       (antes MotoFlow solo lo hacía con los servicios «profesionales»);
--     - le retiene ISR: servicios profesionales, alquileres y servicios en
--       general 10 %, servicios TÉCNICOS (limpieza, lavado, albañilería,
--       fumigación, plomería, mecánica…) 2 %. La Ley 30-26 (desde 01/07/2026,
--       según la prensa) los subió a 15 % y 3 %: la factura del cliente de
--       Oscar ya viene con 3 %. Ambas tasas se cambian por empresa.
-- · Emisor persona física = config_empresa.emisor_persona_fisica O RNC de
--   11 dígitos (cédula). Oscar tenía el indicador apagado con cédula.
-- · Propina: no lleva ITBIS ni retención; suma al total. En el 607 va en su
--   columna (16) y NO es parte del monto facturado ni de las operaciones del
--   IT-1 (DGII, consulta 22, oct. 2023). La legal es 10 %; la voluntaria se
--   reporta igual (Aviso 07-24).
-- ============================================================

-- 1. Tipo de servicio «técnico».
ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS productos_servicio_tipo_check;
ALTER TABLE public.productos ADD CONSTRAINT productos_servicio_tipo_check
  CHECK (servicio_tipo IS NULL OR servicio_tipo IN ('profesional', 'tecnico', 'alquiler', 'otro'));

-- 2. Tasa de técnicos y propina por empresa; propina en la factura.
ALTER TABLE public.config_empresa ADD COLUMN IF NOT EXISTS isr_retencion_tecnico_pct numeric(5,2) NOT NULL DEFAULT 3;
ALTER TABLE public.config_empresa ADD COLUMN IF NOT EXISTS usa_propina boolean NOT NULL DEFAULT false;
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS propina numeric(14,2) NOT NULL DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE public.facturas ADD CONSTRAINT facturas_propina_no_negativa CHECK (propina >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Cálculo de retenciones (versión de producción + técnicos + PF por cédula
--    + ITBIS 100 % de todo servicio de persona física).
CREATE OR REPLACE FUNCTION public.recalcular_retenciones_factura(p_factura_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  f   record;
  emp record;
  ag  boolean := false;
  v_pf boolean;
  v_factor_itbis numeric := 0;
  v_itbis numeric := 0;
  v_isr   numeric := 0;
  v_antes numeric;
BEGIN
  SELECT id, tenant_id, cliente_id, forma_pago, monto_pendiente, itbis_retenido, isr_retenido, ncf
    INTO f FROM public.facturas WHERE id = p_factura_id;
  IF f.id IS NULL THEN RETURN; END IF;

  SELECT emisor_persona_fisica, retencion_itbis_aplica, isr_retencion_pct, isr_retencion_tecnico_pct,
         length(regexp_replace(COALESCE(rnc, ''), '\D', '', 'g')) = 11 AS es_cedula
    INTO emp FROM public.config_empresa WHERE tenant_id = f.tenant_id;
  v_pf := COALESCE(emp.emisor_persona_fisica, false) OR COALESCE(emp.es_cedula, false);
  IF f.cliente_id IS NOT NULL THEN
    SELECT agente_retencion INTO ag FROM public.clientes WHERE id = f.cliente_id;
  END IF;

  IF COALESCE(ag, false) THEN
    v_factor_itbis := CASE
      WHEN v_pf THEN 1                                                   -- persona física: 100%
      WHEN btrim(COALESCE(f.ncf, '')) ~ '^E[0-9]{12}$' THEN 0           -- NG 02-2026: jurídica + e-CF
      WHEN COALESCE(emp.retencion_itbis_aplica, true) THEN 0.30         -- Norma 02-05
      ELSE 0 END;
    SELECT
      -- ITBIS: a persona física, todo servicio gravado; a sociedad, solo los profesionales.
      COALESCE(SUM(CASE WHEN v_pf OR d.servicio_tipo = 'profesional'
                        THEN COALESCE(d.itbis, 0) * v_factor_itbis ELSE 0 END), 0),
      -- ISR: solo a persona física.
      COALESCE(SUM(CASE WHEN NOT v_pf THEN 0
                        WHEN d.servicio_tipo IN ('profesional', 'alquiler')
                          THEN (COALESCE(d.importe, 0) - COALESCE(d.itbis, 0)) * COALESCE(emp.isr_retencion_pct, 15) / 100
                        WHEN d.servicio_tipo = 'tecnico'
                          THEN (COALESCE(d.importe, 0) - COALESCE(d.itbis, 0)) * COALESCE(emp.isr_retencion_tecnico_pct, 3) / 100
                        ELSE 0 END), 0)
      INTO v_itbis, v_isr
      FROM public.facturas_detalle d
     WHERE d.factura_id = p_factura_id AND d.naturaleza = 'servicio';
  END IF;
  v_itbis := round(v_itbis, 2);
  v_isr   := round(v_isr, 2);

  v_antes := COALESCE(f.itbis_retenido, 0) + COALESCE(f.isr_retenido, 0);
  IF v_antes = v_itbis + v_isr
     AND COALESCE(f.itbis_retenido, 0) = v_itbis AND COALESCE(f.isr_retenido, 0) = v_isr THEN RETURN; END IF;

  UPDATE public.facturas
     SET itbis_retenido = v_itbis,
         isr_retenido   = v_isr,
         monto_pendiente = CASE WHEN upper(COALESCE(f.forma_pago, '')) = 'CREDITO' AND f.monto_pendiente IS NOT NULL
                                THEN GREATEST(0, f.monto_pendiente + v_antes - (v_itbis + v_isr))
                                ELSE monto_pendiente END
   WHERE id = p_factura_id;
END $function$;

-- 4. El 607 y el IT-1 (ayudante contable): la propina no es monto facturado.
CREATE OR REPLACE FUNCTION public._contab_ventas_607(p_tenant uuid, p_ini date, p_fin date)
RETURNS TABLE (id uuid, ncf text, tipo text, base numeric, exento numeric, base16 numeric, itbis numeric, total numeric,
               itbis_retenido numeric, forma text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  WITH f AS (
    SELECT fa.id, COALESCE(fa.itbis, 0) AS itbis, COALESCE(fa.total, 0) AS total, COALESCE(fa.itbis_retenido, 0) AS itbis_retenido,
           COALESCE(fa.propina, 0) AS propina,
           upper(COALESCE(fa.forma_pago, '')) AS fp, upper(COALESCE(fa.tipo_pago, '')) AS tp,
           upper(regexp_replace(COALESCE(NULLIF(btrim(fa.ncf), ''),
                    (SELECT COALESCE(d.ncf, d.encf, d.proveedor_number) FROM public.documentos_fiscales d
                      WHERE d.factura_id = fa.id AND d.estado = 'emitido'
                      ORDER BY d.created_at DESC LIMIT 1), ''), '[\s-]', '', 'g')) AS ncf
      FROM public.facturas fa
     WHERE fa.tenant_id = p_tenant
       AND fa.fecha >= (p_ini::timestamp AT TIME ZONE 'America/Santo_Domingo')
       AND fa.fecha <  (p_fin::timestamp AT TIME ZONE 'America/Santo_Domingo')
       AND COALESCE(fa.estado, '') <> 'ANULADA' AND NOT COALESCE(fa.es_saldo_inicial, false)
  ), d AS (
    SELECT fd.factura_id,
           sum(fd.importe) FILTER (WHERE COALESCE(fd.itbis, 0) = 0) AS exento,
           sum(fd.importe - fd.itbis) FILTER (WHERE COALESCE(fd.itbis, 0) > 0 AND fd.importe > fd.itbis
                                               AND fd.itbis / (fd.importe - fd.itbis) BETWEEN 0.155 AND 0.165) AS base16
      FROM public.facturas_detalle fd
     WHERE fd.factura_id IN (SELECT f.id FROM f WHERE f.ncf <> '')
     GROUP BY fd.factura_id
  )
  -- base = total − ITBIS − propina (la propina va aparte: col. 16 del 607).
  SELECT f.id, f.ncf, substr(f.ncf, 2, 2), f.total - f.itbis - f.propina,
         CASE WHEN f.itbis = 0 THEN f.total - f.propina ELSE LEAST(COALESCE(d.exento, 0), f.total - f.itbis - f.propina) END,
         CASE WHEN f.itbis = 0 THEN 0 ELSE LEAST(COALESCE(d.base16, 0), f.total - f.itbis - f.propina) END,
         f.itbis, f.total, f.itbis_retenido,
         CASE WHEN f.fp ~ 'CR[EÉ]DITO' OR f.tp ~ '^CR[EÉ]DITO$' THEN 'credito'
              WHEN (f.tp ~ 'TARJETA|VISA|MASTER')::int + (f.tp ~ 'CHEQUE|TRANSFER|DEP[OÓ]SIT')::int + (f.tp ~ 'EFECTIVO')::int > 1 THEN 'otros'
              WHEN f.fp || ' ' || f.tp ~ 'TARJETA|VISA|MASTER' THEN 'tarjeta'
              WHEN f.fp || ' ' || f.tp ~ 'CHEQUE|TRANSFER|DEP[OÓ]SIT' THEN 'cheque'
              WHEN f.fp || ' ' || f.tp ~ 'EFECTIVO|CONTADO' THEN 'efectivo'
              ELSE 'otros' END
    FROM f LEFT JOIN d ON d.factura_id = f.id
   WHERE f.ncf <> ''
$f$;
REVOKE ALL ON FUNCTION public._contab_ventas_607(uuid, date, date) FROM PUBLIC, anon, authenticated;

-- 5. Oscar Aristy (lavado): emite con cédula, usa propina, su servicio es técnico,
--    y AMSTAR DMC (S.A.) le retiene. Pedido del dueño de MotoFlow el 13/11/2026.
UPDATE public.config_empresa SET emisor_persona_fisica = true, usa_propina = true
 WHERE tenant_id = 'c7cc095d-3bc4-4704-8abe-a6651ff73e23';
UPDATE public.productos SET servicio_tipo = 'tecnico'
 WHERE tenant_id = 'c7cc095d-3bc4-4704-8abe-a6651ff73e23' AND codigo = 'SERV-GENERAL' AND naturaleza = 'servicio';
UPDATE public.clientes SET agente_retencion = true
 WHERE tenant_id = 'c7cc095d-3bc4-4704-8abe-a6651ff73e23' AND regexp_replace(COALESCE(rnc, ''), '\D', '', 'g') = '101894229';


SELECT registrar_migracion('retencion_tecnicos_y_propina.sql');
