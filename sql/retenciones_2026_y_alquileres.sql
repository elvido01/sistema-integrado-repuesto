-- =====================================================================
-- RETENCIONES 2026 + CONTRATOS DE ALQUILER (27/10/2026)
-- ---------------------------------------------------------------------
-- 1. RETENCIONES, con lo que dice la ley HOY:
--   · ITBIS (Norma General 02-2026, 16/09/2026, artículo único — texto
--     oficial leído): las empresas agentes de retención NO retienen el ITBIS
--     de la Norma 02-05 cuando le pagan a OTRA PERSONA JURÍDICA autorizada
--     como emisora electrónica y la operación se facturó con e-CF.
--     → emisor persona jurídica + factura e-CF (NCF E…) = 0 de ITBIS retenido.
--     → persona física: sigue el 100% (la norma solo habla de personas
--       jurídicas). Factura de papel (B01/B02): sigue el 30%.
--   · ISR (Ley 30-26, art. 17, modificó el art. 309 del Código Tributario,
--     vigente desde el 01/07/2026 según la prensa y guías tributarias): la
--     retención a personas físicas por honorarios y por alquileres pasó del
--     10% al 15%. Queda configurable (config_empresa.isr_retencion_pct) por si
--     el contador indica otra cosa.
--   El recálculo también corre cuando a la factura le llega su NCF (el e-NCF
--   se asigna al emitir), porque de eso depende el ITBIS retenido.
--
-- 2. CONTRATOS DE ALQUILER (servicios e inmobiliarias):
--   Cada contrato crea su propio SERVICIO (tipo alquiler) con el monto
--   mensual: vivienda familiar = exento de ITBIS (Decreto 293-11, art. 14
--   lit. g); local/comercial = 18%. El estado del mes NO se guarda: sale de
--   si existe una factura (no anulada) de ese servicio en el mes. Así nunca
--   dice "pendiente" de algo ya facturado. El depósito de garantía se
--   registra en el contrato y NO es ingreso (se devuelve).
--   La factura NO se emite sola (consumiría NCF y emitiría e-CF sin que
--   nadie lo revise): el botón "Facturar" la deja preparada en Ventas.
-- Idempotente.
-- =====================================================================

ALTER TABLE public.config_empresa ADD COLUMN IF NOT EXISTS isr_retencion_pct numeric(5,2) NOT NULL DEFAULT 15;

CREATE OR REPLACE FUNCTION public.recalcular_retenciones_factura(p_factura_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  f   record;
  emp record;
  ag  boolean := false;
  v_factor_itbis numeric := 0;
  v_itbis numeric := 0;
  v_isr   numeric := 0;
  v_antes numeric;
BEGIN
  SELECT id, tenant_id, cliente_id, forma_pago, monto_pendiente, itbis_retenido, isr_retenido, ncf
    INTO f FROM public.facturas WHERE id = p_factura_id;
  IF f.id IS NULL THEN RETURN; END IF;

  SELECT emisor_persona_fisica, retencion_itbis_aplica, isr_retencion_pct INTO emp
    FROM public.config_empresa WHERE tenant_id = f.tenant_id;
  IF f.cliente_id IS NOT NULL THEN
    SELECT agente_retencion INTO ag FROM public.clientes WHERE id = f.cliente_id;
  END IF;

  IF COALESCE(ag, false) THEN
    v_factor_itbis := CASE
      WHEN emp.emisor_persona_fisica THEN 1                              -- persona física: 100%
      WHEN btrim(COALESCE(f.ncf, '')) ~ '^E[0-9]{12}$' THEN 0           -- NG 02-2026: jurídica + e-CF
      WHEN COALESCE(emp.retencion_itbis_aplica, true) THEN 0.30         -- Norma 02-05
      ELSE 0 END;
    SELECT
      COALESCE(SUM(CASE WHEN d.servicio_tipo = 'profesional'
                        THEN COALESCE(d.itbis, 0) * v_factor_itbis ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN d.servicio_tipo IN ('profesional', 'alquiler') AND emp.emisor_persona_fisica
                        THEN (COALESCE(d.importe, 0) - COALESCE(d.itbis, 0)) * COALESCE(emp.isr_retencion_pct, 15) / 100
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
END $$;

DROP TRIGGER IF EXISTS factura_cliente_retenciones ON public.facturas;
CREATE TRIGGER factura_cliente_retenciones AFTER UPDATE OF cliente_id, forma_pago, ncf ON public.facturas
  FOR EACH ROW EXECUTE FUNCTION public.trg_factura_cliente_retenciones();

-- ── Contratos de alquiler ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contratos_alquiler (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL DEFAULT public.get_user_tenant(),
  numero        int,
  cliente_id    uuid NOT NULL REFERENCES public.clientes(id),
  producto_id   uuid REFERENCES public.productos(id),
  descripcion   text NOT NULL,                       -- "Local 3, Plaza X" / "Apto 2B"
  uso           text NOT NULL DEFAULT 'comercial' CHECK (uso IN ('vivienda', 'comercial')),
  monto         numeric(14,2) NOT NULL CHECK (monto > 0),   -- mensual, ITBIS incluido si aplica
  dia_cobro     int NOT NULL DEFAULT 1 CHECK (dia_cobro BETWEEN 1 AND 28),
  fecha_inicio  date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Santo_Domingo')::date,
  fecha_fin     date,
  deposito      numeric(14,2) NOT NULL DEFAULT 0,    -- garantía: NO es ingreso, se devuelve
  deposito_devuelto_at date,
  activo        boolean NOT NULL DEFAULT true,
  notas         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contratos_alquiler ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contratos_alquiler_tenant ON public.contratos_alquiler;
CREATE POLICY contratos_alquiler_tenant ON public.contratos_alquiler
  FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant()) WITH CHECK (tenant_id = public.get_user_tenant());
GRANT SELECT, INSERT, UPDATE ON public.contratos_alquiler TO authenticated;

-- Crear el contrato y su servicio de una vez.
CREATE OR REPLACE FUNCTION public.crear_contrato_alquiler(
  p_cliente_id uuid, p_descripcion text, p_uso text, p_monto numeric, p_dia_cobro int,
  p_fecha_inicio date DEFAULT NULL, p_fecha_fin date DEFAULT NULL, p_deposito numeric DEFAULT 0, p_notas text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_num int;
  v_prod uuid;
  v_id uuid;
  v_codigo text;
  v_cli text;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin sesión'; END IF;
  SELECT nombre INTO v_cli FROM public.clientes WHERE id = p_cliente_id AND tenant_id = v_tenant;
  IF v_cli IS NULL THEN RAISE EXCEPTION 'Cliente no encontrado'; END IF;
  IF COALESCE(p_monto, 0) <= 0 THEN RAISE EXCEPTION 'El monto mensual tiene que ser mayor que cero'; END IF;
  IF p_uso NOT IN ('vivienda', 'comercial') THEN RAISE EXCEPTION 'Uso no válido'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('contratos_alquiler:' || v_tenant::text));
  SELECT COALESCE(max(numero), 0) + 1 INTO v_num FROM public.contratos_alquiler WHERE tenant_id = v_tenant;
  v_codigo := 'ALQ-' || lpad(v_num::text, 4, '0');

  INSERT INTO public.productos (tenant_id, codigo, descripcion, precio, costo, itbis_pct, naturaleza, servicio_tipo, activo)
  VALUES (v_tenant, v_codigo,
          upper('ALQUILER ' || btrim(p_descripcion) || ' — ' || v_cli),
          round(p_monto, 2), 0,
          CASE WHEN p_uso = 'vivienda' THEN 0 ELSE 0.18 END,
          'servicio', 'alquiler', true)
  RETURNING id INTO v_prod;

  INSERT INTO public.contratos_alquiler (tenant_id, numero, cliente_id, producto_id, descripcion, uso, monto, dia_cobro,
                                         fecha_inicio, fecha_fin, deposito, notas)
  VALUES (v_tenant, v_num, p_cliente_id, v_prod, btrim(p_descripcion), p_uso, round(p_monto, 2),
          COALESCE(p_dia_cobro, 1), COALESCE(p_fecha_inicio, (now() AT TIME ZONE 'America/Santo_Domingo')::date),
          p_fecha_fin, COALESCE(p_deposito, 0), nullif(btrim(COALESCE(p_notas, '')), ''))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'numero', v_num, 'codigo', v_codigo, 'producto_id', v_prod);
END $$;
REVOKE ALL ON FUNCTION public.crear_contrato_alquiler(uuid, text, text, numeric, int, date, date, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_contrato_alquiler(uuid, text, text, numeric, int, date, date, numeric, text) TO authenticated;

-- El estado del mes, calculado de las facturas reales.
CREATE OR REPLACE VIEW public.contratos_alquiler_estado WITH (security_invoker = true) AS
WITH hoy AS (SELECT (now() AT TIME ZONE 'America/Santo_Domingo')::date AS d)
SELECT k.*, c.nombre AS cliente_nombre, c.telefono AS cliente_telefono, c.agente_retencion,
       p.codigo AS producto_codigo,
       ult.fecha AS ultima_factura_fecha, ult.numero AS ultima_factura_numero,
       EXISTS (
         SELECT 1 FROM public.facturas_detalle d JOIN public.facturas f ON f.id = d.factura_id
          WHERE d.producto_id = k.producto_id AND COALESCE(f.estado, '') <> 'ANULADA'
            AND date_trunc('month', f.fecha AT TIME ZONE 'America/Santo_Domingo') = date_trunc('month', (SELECT d FROM hoy))
       ) AS facturado_este_mes,
       GREATEST(0, (SELECT d FROM hoy) - (date_trunc('month', (SELECT d FROM hoy))::date + (k.dia_cobro - 1))) AS dias_desde_cobro
  FROM public.contratos_alquiler k
  JOIN public.clientes c ON c.id = k.cliente_id
  LEFT JOIN public.productos p ON p.id = k.producto_id
  LEFT JOIN LATERAL (
    SELECT f.fecha, f.numero FROM public.facturas_detalle d JOIN public.facturas f ON f.id = d.factura_id
     WHERE d.producto_id = k.producto_id AND COALESCE(f.estado, '') <> 'ANULADA'
     ORDER BY f.fecha DESC LIMIT 1
  ) ult ON true;
GRANT SELECT ON public.contratos_alquiler_estado TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('retenciones_2026_y_alquileres.sql');
