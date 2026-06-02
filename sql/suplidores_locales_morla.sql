-- ============================================================
-- Suplidores locales para Repuestos Morla
-- ============================================================
-- Motor silencioso para comparar disponibilidad/costo de suplidores
-- cercanos sin cargar la UX principal de ventas.

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS feat_suplidores_locales BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.config_empresa.feat_suplidores_locales IS
  'Activa sugerencias de suplidores locales en ventas para tenants habilitados.';

UPDATE public.config_empresa
SET feat_suplidores_locales = TRUE
WHERE nombre ILIKE '%morla%';

CREATE TABLE IF NOT EXISTS public.suplidores_locales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  proveedor_id UUID REFERENCES public.proveedores(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  descuento_pct NUMERIC(8,4) NOT NULL DEFAULT 0.10,
  entrega_min_minutos INTEGER NOT NULL DEFAULT 10,
  entrega_max_minutos INTEGER NOT NULL DEFAULT 15,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT suplidores_locales_descuento_chk CHECK (descuento_pct >= 0 AND descuento_pct < 1),
  CONSTRAINT suplidores_locales_entrega_chk CHECK (entrega_min_minutos >= 0 AND entrega_max_minutos >= entrega_min_minutos),
  CONSTRAINT suplidores_locales_unique_nombre UNIQUE (tenant_id, nombre)
);

COMMENT ON TABLE public.suplidores_locales IS
  'Suplidores locales rapidos usados como inventario extendido por tenant.';

CREATE TABLE IF NOT EXISTS public.producto_suplidor_equivalencias (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  suplidor_local_id UUID NOT NULL REFERENCES public.suplidores_locales(id) ON DELETE CASCADE,
  codigo_suplidor TEXT NOT NULL,
  descripcion_suplidor TEXT,
  costo_suplidor NUMERIC(18,2),
  existencia_suplidor NUMERIC(18,2),
  disponible BOOLEAN NOT NULL DEFAULT TRUE,
  actualizado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT producto_suplidor_equiv_unique UNIQUE (tenant_id, producto_id, suplidor_local_id),
  CONSTRAINT producto_suplidor_equiv_costo_chk CHECK (costo_suplidor IS NULL OR costo_suplidor >= 0),
  CONSTRAINT producto_suplidor_equiv_existencia_chk CHECK (existencia_suplidor IS NULL OR existencia_suplidor >= 0)
);

COMMENT ON TABLE public.producto_suplidor_equivalencias IS
  'Equivalencias entre el producto interno y codigos/costos de suplidores locales.';

CREATE INDEX IF NOT EXISTS idx_suplidores_locales_tenant_activo
  ON public.suplidores_locales(tenant_id, activo);

CREATE INDEX IF NOT EXISTS idx_producto_suplidor_equiv_producto
  ON public.producto_suplidor_equivalencias(tenant_id, producto_id);

CREATE INDEX IF NOT EXISTS idx_producto_suplidor_equiv_codigo
  ON public.producto_suplidor_equivalencias(tenant_id, codigo_suplidor);

ALTER TABLE public.suplidores_locales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producto_suplidor_equivalencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suplidores_locales_select_tenant" ON public.suplidores_locales;
CREATE POLICY "suplidores_locales_select_tenant" ON public.suplidores_locales
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS "suplidores_locales_insert_tenant" ON public.suplidores_locales;
CREATE POLICY "suplidores_locales_insert_tenant" ON public.suplidores_locales
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS "suplidores_locales_update_tenant" ON public.suplidores_locales;
CREATE POLICY "suplidores_locales_update_tenant" ON public.suplidores_locales
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS "suplidores_locales_delete_tenant" ON public.suplidores_locales;
CREATE POLICY "suplidores_locales_delete_tenant" ON public.suplidores_locales
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS "producto_suplidor_equiv_select_tenant" ON public.producto_suplidor_equivalencias;
CREATE POLICY "producto_suplidor_equiv_select_tenant" ON public.producto_suplidor_equivalencias
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS "producto_suplidor_equiv_insert_tenant" ON public.producto_suplidor_equivalencias;
CREATE POLICY "producto_suplidor_equiv_insert_tenant" ON public.producto_suplidor_equivalencias
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS "producto_suplidor_equiv_update_tenant" ON public.producto_suplidor_equivalencias;
CREATE POLICY "producto_suplidor_equiv_update_tenant" ON public.producto_suplidor_equivalencias
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS "producto_suplidor_equiv_delete_tenant" ON public.producto_suplidor_equivalencias;
CREATE POLICY "producto_suplidor_equiv_delete_tenant" ON public.producto_suplidor_equivalencias
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant());

CREATE OR REPLACE FUNCTION public.get_mejor_suplidor_local(
  p_producto_id UUID,
  p_cantidad NUMERIC DEFAULT 1,
  p_precio_venta NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  _tenant UUID;
  _feature_enabled BOOLEAN;
  _existencia NUMERIC;
  _producto RECORD;
  _mejor RECORD;
BEGIN
  _tenant := public.get_user_tenant();

  IF _tenant IS NULL OR p_producto_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(feat_suplidores_locales, FALSE)
  INTO _feature_enabled
  FROM public.config_empresa
  WHERE tenant_id = _tenant
  LIMIT 1;

  IF NOT COALESCE(_feature_enabled, FALSE) THEN
    RETURN NULL;
  END IF;

  SELECT id, codigo, descripcion, costo
  INTO _producto
  FROM public.productos
  WHERE id = p_producto_id
    AND tenant_id = _tenant
    AND activo = TRUE;

  IF _producto IS NULL THEN
    RETURN NULL;
  END IF;

  _existencia := public.get_stock_actual(p_producto_id);

  SELECT
    sl.id AS suplidor_local_id,
    sl.nombre AS suplidor_nombre,
    sl.descuento_pct,
    sl.entrega_min_minutos,
    sl.entrega_max_minutos,
    pse.codigo_suplidor,
    pse.descripcion_suplidor,
    pse.costo_suplidor,
    pse.existencia_suplidor,
    ROUND((pse.costo_suplidor * (1 - sl.descuento_pct))::NUMERIC, 2) AS costo_neto,
    ROUND((COALESCE(p_precio_venta, 0) - (pse.costo_suplidor * (1 - sl.descuento_pct)))::NUMERIC, 2) AS margen_estimado,
    CASE
      WHEN COALESCE(p_precio_venta, 0) <= 0 THEN NULL
      ELSE ROUND(((COALESCE(p_precio_venta, 0) - (pse.costo_suplidor * (1 - sl.descuento_pct))) / COALESCE(p_precio_venta, 0) * 100)::NUMERIC, 2)
    END AS margen_pct
  INTO _mejor
  FROM public.producto_suplidor_equivalencias pse
  JOIN public.suplidores_locales sl ON sl.id = pse.suplidor_local_id
  WHERE pse.tenant_id = _tenant
    AND sl.tenant_id = _tenant
    AND pse.producto_id = p_producto_id
    AND pse.disponible = TRUE
    AND sl.activo = TRUE
    AND pse.costo_suplidor IS NOT NULL
    AND (
      pse.existencia_suplidor IS NULL
      OR pse.existencia_suplidor >= COALESCE(NULLIF(p_cantidad, 0), 1)
    )
  ORDER BY
    CASE WHEN COALESCE(p_precio_venta, 0) > 0 THEN
      COALESCE(p_precio_venta, 0) - (pse.costo_suplidor * (1 - sl.descuento_pct))
    ELSE
      0 - (pse.costo_suplidor * (1 - sl.descuento_pct))
    END DESC,
    sl.entrega_min_minutos ASC,
    pse.actualizado_at DESC
  LIMIT 1;

  IF _mejor IS NULL THEN
    RETURN jsonb_build_object(
      'habilitado', TRUE,
      'hay_opcion', FALSE,
      'existencia_morla', COALESCE(_existencia, 0)
    );
  END IF;

  RETURN jsonb_build_object(
    'habilitado', TRUE,
    'hay_opcion', TRUE,
    'producto_id', p_producto_id,
    'codigo_morla', _producto.codigo,
    'existencia_morla', COALESCE(_existencia, 0),
    'suplidor_local_id', _mejor.suplidor_local_id,
    'suplidor', _mejor.suplidor_nombre,
    'codigo_suplidor', _mejor.codigo_suplidor,
    'descripcion_suplidor', _mejor.descripcion_suplidor,
    'costo_suplidor', _mejor.costo_suplidor,
    'descuento_pct', _mejor.descuento_pct,
    'costo_neto', _mejor.costo_neto,
    'existencia_suplidor', _mejor.existencia_suplidor,
    'entrega_min_minutos', _mejor.entrega_min_minutos,
    'entrega_max_minutos', _mejor.entrega_max_minutos,
    'margen_estimado', _mejor.margen_estimado,
    'margen_pct', _mejor.margen_pct
  );
END;
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suplidores_locales TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.producto_suplidor_equivalencias TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mejor_suplidor_local(UUID, NUMERIC, NUMERIC) TO authenticated;

WITH morla AS (
  SELECT tenant_id
  FROM public.config_empresa
  WHERE nombre ILIKE '%morla%'
)
INSERT INTO public.suplidores_locales (tenant_id, nombre, descuento_pct, entrega_min_minutos, entrega_max_minutos)
SELECT tenant_id, nombre, 0.10, 10, 15
FROM morla
CROSS JOIN (VALUES
  ('Repuestos Abreu'),
  ('Repuestos Carla'),
  ('Repuestos Hermanos Jimenes')
) AS s(nombre)
ON CONFLICT (tenant_id, nombre) DO UPDATE
SET descuento_pct = EXCLUDED.descuento_pct,
    entrega_min_minutos = EXCLUDED.entrega_min_minutos,
    entrega_max_minutos = EXCLUDED.entrega_max_minutos,
    activo = TRUE,
    updated_at = NOW();
