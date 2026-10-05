-- =====================================================================
-- COMISIONES: % SOBRE VENTA O MONTO FIJO POR UNIDAD + FUGA ENTRE EMPRESAS
-- =====================================================================
-- (05/10/2026) El dueño, desde Caminero Motors: "paga un monto fijo de 300
-- pesos de comisión por cada motocicleta vendida ... que trabaje de las dos
-- formas dependiendo de cómo trabajen las empresas" y "el historial de este
-- módulo se está ligando con el de otra empresa".
--
-- 1) FUGA: pagos_comisiones y pagos_comisiones_facturas tenían una política
--    vieja "Allow all for authenticated users" (auth.role()='authenticated').
--    Las políticas permisivas se suman con OR, así que cualquier usuario veía
--    los pagos de TODAS las empresas: en Caminero Motors salían los de Morla
--    (A SANDER) y los de Repuestos Caminero (RAFA). Mismo caso en
--    cotizaciones_magna(_detalle). Todas ya tienen sus políticas por
--    get_user_tenant(); se quita solo la abierta.
--
-- 2) Cada vendedor elige cómo se le paga:
--      comision_tipo = 'porcentaje'      → comision_pct % de la venta neta (como hoy)
--      comision_tipo = 'fijo_por_unidad' → comision_fija RD$ por cada unidad
--    Unidad = línea cuyo producto tiene CHASIS o es de tipo MOTOCICLETA/vehículo.
--    calcular_comisiones_vendedor devuelve ahora también `unidades`.
-- =====================================================================

-- 1) Fuga
DROP POLICY IF EXISTS "Allow all for authenticated users on pagos_comisiones" ON public.pagos_comisiones;
DROP POLICY IF EXISTS "Allow all for authenticated users on pagos_comisiones_facturas" ON public.pagos_comisiones_facturas;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.cotizaciones_magna;
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.cotizaciones_magna_detalle;

-- 2) Tipo de comisión por vendedor
ALTER TABLE public.vendedores
  ADD COLUMN IF NOT EXISTS comision_tipo text NOT NULL DEFAULT 'porcentaje',
  ADD COLUMN IF NOT EXISTS comision_fija numeric(12,2) NOT NULL DEFAULT 0;
DO $$ BEGIN
  ALTER TABLE public.vendedores ADD CONSTRAINT vendedores_comision_tipo_chk
    CHECK (comision_tipo IN ('porcentaje', 'fijo_por_unidad'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.pagos_comisiones
  ADD COLUMN IF NOT EXISTS comision_tipo text,
  ADD COLUMN IF NOT EXISTS unidades numeric(12,2),
  ADD COLUMN IF NOT EXISTS monto_por_unidad numeric(12,2);

-- Cambia el tipo de retorno (columna nueva): hay que borrar y crear.
DROP FUNCTION IF EXISTS public.calcular_comisiones_vendedor(uuid, date, date);
CREATE FUNCTION public.calcular_comisiones_vendedor(p_vendedor_id uuid, p_fecha_desde date, p_fecha_hasta date)
 RETURNS TABLE(factura_id uuid, factura_numero text, fecha date, cliente_nombre text, monto_factura numeric,
               monto_itbis numeric, subtotal numeric, forma_pago text, unidades numeric)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_vendedor_tenant uuid;
BEGIN
  v_tenant_id := public.get_user_tenant();

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No se puede determinar el tenant del usuario actual';
  END IF;

  SELECT v.tenant_id INTO v_vendedor_tenant
  FROM public.vendedores v
  WHERE v.id = p_vendedor_id;

  IF v_vendedor_tenant IS NULL THEN
    RAISE EXCEPTION 'Vendedor % no encontrado', p_vendedor_id;
  END IF;

  IF v_vendedor_tenant <> v_tenant_id THEN
    RAISE EXCEPTION 'Vendedor % no pertenece al tenant actual', p_vendedor_id;
  END IF;

  RETURN QUERY
  SELECT
    f.id                                              AS factura_id,
    f.numero::text                                    AS factura_numero,
    f.fecha::date                                     AS fecha,
    COALESCE(c.nombre, f.manual_cliente_nombre, 'CLIENTE GENERICO')::text AS cliente_nombre,
    f.total                                           AS monto_factura,
    f.itbis                                           AS monto_itbis,
    f.subtotal                                        AS subtotal,
    f.forma_pago::text                                AS forma_pago,
    -- Unidades = vehículos de la factura: producto con chasis O de tipo
    -- MOTOCICLETA/vehículo (en Caminero 19 de 30 motos no tienen el chasis
    -- en su campo, solo en la descripción).
    COALESCE((SELECT SUM(fd.cantidad)
                FROM public.facturas_detalle fd
                JOIN public.productos p ON p.id = fd.producto_id
                LEFT JOIN public.tipos_producto t ON t.id = p.tipo_id
               WHERE fd.factura_id = f.id
                 AND (COALESCE(btrim(p.chasis), '') <> ''
                      OR t.nombre ~* '(MOTOCICLETA|VEHICULO|VEHÍCULO|TRICICLO|PASOLA|SCOOTER|CUATRIMOTO)')), 0)::numeric AS unidades
  FROM public.facturas f
  LEFT JOIN public.clientes c ON f.cliente_id = c.id
  WHERE
    f.tenant_id = v_tenant_id
    AND f.vendedor_id = p_vendedor_id
    AND f.fecha::date >= p_fecha_desde
    AND f.fecha::date <= p_fecha_hasta
    AND COALESCE(f.estado, 'EMITIDA') <> 'ANULADA'
    -- CANDADO: fuera las facturas cuya comision ya se pago
    AND NOT EXISTS (
      SELECT 1
      FROM public.pagos_comisiones_facturas pcf
      JOIN public.pagos_comisiones pc ON pc.id = pcf.pago_comision_id
      WHERE pcf.factura_id = f.id
        AND COALESCE(pc.anulado, false) = false
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.calcular_comisiones_vendedor(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calcular_comisiones_vendedor(uuid, date, date) TO authenticated;

-- El pago anota cómo se calculó (lo llena la pantalla después del pago).
CREATE OR REPLACE FUNCTION public.comision_anotar_calculo(p_pago_id uuid, p_tipo text, p_unidades numeric, p_monto_por_unidad numeric)
 RETURNS void
 LANGUAGE sql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.pagos_comisiones
     SET comision_tipo = p_tipo, unidades = p_unidades, monto_por_unidad = p_monto_por_unidad
   WHERE id = p_pago_id AND tenant_id = public.get_user_tenant();
$function$;
REVOKE ALL ON FUNCTION public.comision_anotar_calculo(uuid, text, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comision_anotar_calculo(uuid, text, numeric, numeric) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('comisiones_fijo_por_unidad.sql');
