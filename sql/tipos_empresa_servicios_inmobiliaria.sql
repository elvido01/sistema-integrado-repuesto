-- =====================================================================
-- NUEVOS TIPOS DE EMPRESA: SERVICIOS E INMOBILIARIA (27/10/2026)
-- ---------------------------------------------------------------------
-- MotoFlow solo conocía repuestos, dealer y financiera. Ahora también:
--   · SERVICIOS    — empresas sin inventario (honorarios, mantenimiento,
--                    alquileres, comisiones).
--   · INMOBILIARIA — venta de solares/inmuebles (cada uno es único, como
--                    un chasis) de contado o a plazos, y alquileres.
--
-- FASE 1 · Lo que se vende puede ser un BIEN, un SERVICIO o un INMUEBLE
--   (productos.naturaleza):
--   · SERVICIO: no toca el inventario nunca (un movimiento de inventario de
--     un servicio se ignora en la base, venga de donde venga), sale en el
--     buscador aunque su existencia sea 0, y en la factura electrónica la
--     línea va como servicio (IndicadorBienoServicio = 2).
--   · INMUEBLE: existencia 1 (es único). La transferencia de terrenos y
--     edificaciones NO lleva ITBIS (Ley 11-92 arts. 335/336; Regl. 293-11):
--     se crea con ITBIS 0. Lo que se venda amueblado va en otra línea (bien)
--     con su ITBIS.
--
-- FASE 2 · RETENCIONES en la factura de venta (cliente "agente de retención",
--   una empresa que al pagar retiene). Sobre las líneas de SERVICIO:
--   · profesional: ITBIS retenido 30% (Norma 02-05; 100% si el emisor es
--     persona física) + ISR 10% si el emisor es persona física.
--   · alquiler:    ISR 10% si el emisor es persona física; sin retención de
--     ITBIS (la DGII: el alquiler de locales no lleva el 30%, Consulta 41).
--   · otro:        sin retención.
--   La factura sigue valiendo su total; lo que se COBRA es el neto (total −
--   retenciones): se descuenta de lo pendiente. Cada empresa puede apagar
--   la retención de ITBIS (config_empresa.retencion_itbis_aplica) si su
--   contador lo indica (Norma 02-2026 para emisores electrónicos).
--   ⚠ Reglas a confirmar con el contador de cada empresa.
--
-- FASE 3 · INMOBILIARIA: el 3% de transferencia inmobiliaria lo paga el
--   comprador en la DGII dentro de 6 meses del acto de venta, sobre el mayor
--   entre el valor del acto y la tabla de la DGII. No va en la factura: la
--   vista inmuebles_vendidos lleva la fecha límite y si ya se hizo.
--
-- Idempotente.
-- =====================================================================

-- ── 0. Los tipos de empresa ─────────────────────────────────────────────
ALTER TABLE public.config_empresa DROP CONSTRAINT IF EXISTS config_empresa_tipo_negocio_check;
ALTER TABLE public.config_empresa ADD CONSTRAINT config_empresa_tipo_negocio_check
  CHECK (tipo_negocio = ANY (ARRAY['repuestos','dealer','financiera','servicios','inmobiliaria']::text[]));

ALTER TABLE public.config_empresa ADD COLUMN IF NOT EXISTS emisor_persona_fisica boolean NOT NULL DEFAULT false;
ALTER TABLE public.config_empresa ADD COLUMN IF NOT EXISTS retencion_itbis_aplica boolean NOT NULL DEFAULT true;

-- El registro acepta los nuevos tipos. Se parte de la función EN PRODUCCIÓN.
-- La inmobiliaria vende a plazos con el motor de préstamos (financiamiento
-- propio): se le enciende el módulo, sin mora por defecto.
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.registrar_nueva_empresa(text,text,text,text,text,text)'::regprocedure);
  IF position('inmobiliaria' IN d) > 0 THEN RETURN; END IF;
  n := replace(d, $x$IF v_tipo NOT IN ('repuestos', 'dealer', 'financiera') THEN$x$,
                  $x$IF v_tipo NOT IN ('repuestos', 'dealer', 'financiera', 'servicios', 'inmobiliaria') THEN$x$);
  -- (una línea por reemplazo: los saltos de línea del archivo no tienen por
  -- qué ser los de la función guardada)
  n := replace(n, $x$v_tipo = 'financiera',$x$, $x$v_tipo IN ('financiera', 'inmobiliaria'),$x$);
  IF position($x$'servicios', 'inmobiliaria'$x$ IN n) = 0 OR position($x$v_tipo IN ('financiera', 'inmobiliaria')$x$ IN n) = 0 THEN
    RAISE EXCEPTION 'registrar_nueva_empresa cambió: no se pudieron poner los tipos nuevos';
  END IF;
  EXECUTE n;
END $$;

-- ── 1. Bien, servicio o inmueble ────────────────────────────────────────
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS naturaleza text NOT NULL DEFAULT 'bien';
ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS productos_naturaleza_check;
ALTER TABLE public.productos ADD CONSTRAINT productos_naturaleza_check
  CHECK (naturaleza IN ('bien', 'servicio', 'inmueble'));
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS servicio_tipo text;
ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS productos_servicio_tipo_check;
ALTER TABLE public.productos ADD CONSTRAINT productos_servicio_tipo_check
  CHECK (servicio_tipo IS NULL OR servicio_tipo IN ('profesional', 'alquiler', 'otro'));
-- Ficha del inmueble: designación catastral, metros², ubicación, título,
-- deslinde, traspaso (fecha en que el comprador pagó el 3%).
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS datos_inmueble jsonb;

-- La línea de factura guarda qué era al venderse (si mañana cambia la ficha,
-- la factura de ayer no cambia).
ALTER TABLE public.facturas_detalle ADD COLUMN IF NOT EXISTS naturaleza text;
ALTER TABLE public.facturas_detalle ADD COLUMN IF NOT EXISTS servicio_tipo text;

CREATE OR REPLACE FUNCTION public.trg_detalle_naturaleza()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.producto_id IS NOT NULL AND NEW.naturaleza IS NULL THEN
    SELECT p.naturaleza, p.servicio_tipo INTO NEW.naturaleza, NEW.servicio_tipo
      FROM public.productos p WHERE p.id = NEW.producto_id;
  END IF;
  NEW.naturaleza := COALESCE(NEW.naturaleza, 'bien');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS detalle_naturaleza ON public.facturas_detalle;
CREATE TRIGGER detalle_naturaleza BEFORE INSERT ON public.facturas_detalle
  FOR EACH ROW EXECUTE FUNCTION public.trg_detalle_naturaleza();

-- Un servicio no tiene inventario: su movimiento se ignora (devuelve NULL),
-- sea de una venta web, móvil, una edición o una compra.
CREATE OR REPLACE FUNCTION public.trg_servicio_sin_inventario()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.producto_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.productos p WHERE p.id = NEW.producto_id AND p.naturaleza = 'servicio') THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a_servicio_sin_inventario ON public.inventario_movimientos;
CREATE TRIGGER a_servicio_sin_inventario BEFORE INSERT ON public.inventario_movimientos
  FOR EACH ROW EXECUTE FUNCTION public.trg_servicio_sin_inventario();

-- El buscador muestra los servicios aunque "existencias en cero" esté apagado.
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.get_productos_paginados(integer, integer, text, text, text, boolean, text)'::regprocedure);
  IF position($x$p.naturaleza = 'servicio'$x$ IN d) > 0 THEN RETURN; END IF;
  n := replace(d, $x$AND (p_include_zero_stock OR COALESCE(s.stk, 0) > 0)$x$,
                  $x$AND (p_include_zero_stock OR COALESCE(s.stk, 0) > 0 OR p.naturaleza = 'servicio')$x$);
  IF n = d THEN RAISE EXCEPTION 'get_productos_paginados cambió: no se pudo incluir los servicios'; END IF;
  EXECUTE n;
END $$;

-- ── 2. Retenciones ──────────────────────────────────────────────────────
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS agente_retencion boolean NOT NULL DEFAULT false;
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS itbis_retenido numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS isr_retenido numeric(14,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.recalcular_retenciones_factura(p_factura_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  f   record;
  emp record;
  ag  boolean := false;
  v_itbis numeric := 0;
  v_isr   numeric := 0;
  v_antes numeric;
BEGIN
  SELECT id, tenant_id, cliente_id, forma_pago, monto_pendiente, itbis_retenido, isr_retenido
    INTO f FROM public.facturas WHERE id = p_factura_id;
  IF f.id IS NULL THEN RETURN; END IF;

  SELECT emisor_persona_fisica, retencion_itbis_aplica INTO emp
    FROM public.config_empresa WHERE tenant_id = f.tenant_id;
  IF f.cliente_id IS NOT NULL THEN
    SELECT agente_retencion INTO ag FROM public.clientes WHERE id = f.cliente_id;
  END IF;

  IF COALESCE(ag, false) THEN
    SELECT
      COALESCE(SUM(CASE WHEN d.servicio_tipo = 'profesional' AND COALESCE(emp.retencion_itbis_aplica, true)
                        THEN COALESCE(d.itbis, 0) * CASE WHEN emp.emisor_persona_fisica THEN 1 ELSE 0.30 END
                        ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN d.servicio_tipo IN ('profesional', 'alquiler') AND emp.emisor_persona_fisica
                        THEN (COALESCE(d.importe, 0) - COALESCE(d.itbis, 0)) * 0.10
                        ELSE 0 END), 0)
      INTO v_itbis, v_isr
      FROM public.facturas_detalle d
     WHERE d.factura_id = p_factura_id AND d.naturaleza = 'servicio';
  END IF;
  v_itbis := round(v_itbis, 2);
  v_isr   := round(v_isr, 2);

  v_antes := COALESCE(f.itbis_retenido, 0) + COALESCE(f.isr_retenido, 0);
  IF v_antes = v_itbis + v_isr THEN RETURN; END IF;

  -- Lo que se cobra es el NETO: el cambio de retención se refleja en lo
  -- pendiente (por diferencia, así no pisa abonos ya aplicados).
  UPDATE public.facturas
     SET itbis_retenido = v_itbis,
         isr_retenido   = v_isr,
         monto_pendiente = CASE WHEN upper(COALESCE(f.forma_pago, '')) = 'CREDITO' AND f.monto_pendiente IS NOT NULL
                                THEN GREATEST(0, f.monto_pendiente + v_antes - (v_itbis + v_isr))
                                ELSE monto_pendiente END
   WHERE id = p_factura_id;
END $$;

CREATE OR REPLACE FUNCTION public.trg_detalle_retenciones()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.recalcular_retenciones_factura(COALESCE(NEW.factura_id, OLD.factura_id));
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS detalle_retenciones ON public.facturas_detalle;
CREATE TRIGGER detalle_retenciones AFTER INSERT OR UPDATE OR DELETE ON public.facturas_detalle
  FOR EACH ROW EXECUTE FUNCTION public.trg_detalle_retenciones();

CREATE OR REPLACE FUNCTION public.trg_factura_cliente_retenciones()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.recalcular_retenciones_factura(NEW.id);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS factura_cliente_retenciones ON public.facturas;
CREATE TRIGGER factura_cliente_retenciones AFTER UPDATE OF cliente_id, forma_pago ON public.facturas
  FOR EACH ROW EXECUTE FUNCTION public.trg_factura_cliente_retenciones();

-- ── 3. Inmuebles vendidos y el traspaso (3%) ────────────────────────────
CREATE OR REPLACE VIEW public.inmuebles_vendidos WITH (security_invoker = true) AS
SELECT d.id AS detalle_id, f.tenant_id, f.id AS factura_id, f.numero, f.fecha,
       f.forma_pago, f.total, f.monto_pendiente,
       COALESCE(nullif(btrim(f.manual_cliente_nombre), ''), c.nombre) AS comprador,
       c.rnc AS comprador_documento, c.telefono AS comprador_telefono,
       p.id AS producto_id, p.codigo, p.descripcion,
       COALESCE(d.importe, 0) AS valor_venta,
       round(COALESCE(d.importe, 0) * 0.03, 2) AS impuesto_transferencia_estimado,
       (f.fecha AT TIME ZONE 'America/Santo_Domingo')::date + interval '6 months' AS traspaso_vence,
       p.datos_inmueble,
       (p.datos_inmueble ->> 'traspaso_pagado_at') AS traspaso_pagado_at
  FROM public.facturas_detalle d
  JOIN public.facturas f ON f.id = d.factura_id
  LEFT JOIN public.clientes c ON c.id = f.cliente_id
  LEFT JOIN public.productos p ON p.id = d.producto_id
 WHERE d.naturaleza = 'inmueble'
   AND COALESCE(f.estado, '') <> 'ANULADA';
GRANT SELECT ON public.inmuebles_vendidos TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('tipos_empresa_servicios_inmobiliaria.sql');
