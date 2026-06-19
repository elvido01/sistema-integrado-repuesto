-- ============================================================
-- FIX CRITICO: tenant_id en tablas core que afectan caja
-- ============================================================
-- Ejecutar ANTES de los SQL que filtran dashboard/caja por tenant_id.
-- Usa config_empresa.tenant_id como tenant por defecto para datos historicos.
-- ============================================================

DO $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant
  FROM public.config_empresa
  WHERE tenant_id IS NOT NULL
  LIMIT 1;

  IF v_tenant IS NULL THEN
    SELECT id INTO v_tenant
    FROM public.tenants
    LIMIT 1;
  END IF;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No se encontro tenant_id. Crea un registro en tenants/config_empresa antes de ejecutar este fix.';
  END IF;

  -- Tablas maestras y transaccionales usadas por dashboard/caja.
  ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
  ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
  ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
  ALTER TABLE public.facturas_detalle ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
  ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
  ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
  ALTER TABLE public.compromisos ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
  ALTER TABLE public.recibos_ingreso ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
  ALTER TABLE public.recibos_ingreso_detalle ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
  ALTER TABLE public.pagos_suplidores ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
  ALTER TABLE public.pagos_suplidores_detalle ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
  ALTER TABLE public.devoluciones ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
  ALTER TABLE public.devoluciones_detalle ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
  ALTER TABLE public.inventario_movimientos ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
  ALTER TABLE public.cierres_caja ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

  -- Backfill historico. No pisa tenant_id ya asignado.
  UPDATE public.productos SET tenant_id = v_tenant WHERE tenant_id IS NULL;
  UPDATE public.clientes SET tenant_id = v_tenant WHERE tenant_id IS NULL;
  UPDATE public.proveedores SET tenant_id = v_tenant WHERE tenant_id IS NULL;
  UPDATE public.facturas SET tenant_id = v_tenant WHERE tenant_id IS NULL;
  UPDATE public.compras SET tenant_id = v_tenant WHERE tenant_id IS NULL;
  UPDATE public.compromisos SET tenant_id = v_tenant WHERE tenant_id IS NULL;
  UPDATE public.recibos_ingreso SET tenant_id = v_tenant WHERE tenant_id IS NULL;
  UPDATE public.pagos_suplidores SET tenant_id = v_tenant WHERE tenant_id IS NULL;
  UPDATE public.devoluciones SET tenant_id = v_tenant WHERE tenant_id IS NULL;
  UPDATE public.inventario_movimientos SET tenant_id = v_tenant WHERE tenant_id IS NULL;
  UPDATE public.cierres_caja SET tenant_id = v_tenant WHERE tenant_id IS NULL;

  UPDATE public.facturas_detalle fd
  SET tenant_id = f.tenant_id
  FROM public.facturas f
  WHERE fd.factura_id = f.id
    AND fd.tenant_id IS NULL;

  UPDATE public.recibos_ingreso_detalle rid
  SET tenant_id = r.tenant_id
  FROM public.recibos_ingreso r
  WHERE rid.recibo_id = r.id
    AND rid.tenant_id IS NULL;

  UPDATE public.pagos_suplidores_detalle psd
  SET tenant_id = ps.tenant_id
  FROM public.pagos_suplidores ps
  WHERE psd.pago_id = ps.id
    AND psd.tenant_id IS NULL;

  UPDATE public.devoluciones_detalle dd
  SET tenant_id = d.tenant_id
  FROM public.devoluciones d
  WHERE dd.devolucion_id = d.id
    AND dd.tenant_id IS NULL;

  -- Defaults para nuevas filas.
  ALTER TABLE public.productos ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();
  ALTER TABLE public.clientes ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();
  ALTER TABLE public.facturas ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();
  ALTER TABLE public.facturas_detalle ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();
  ALTER TABLE public.compras ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();
  ALTER TABLE public.proveedores ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();
  ALTER TABLE public.compromisos ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();
  ALTER TABLE public.recibos_ingreso ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();
  ALTER TABLE public.recibos_ingreso_detalle ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();
  ALTER TABLE public.pagos_suplidores ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();
  ALTER TABLE public.pagos_suplidores_detalle ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();
  ALTER TABLE public.devoluciones ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();
  ALTER TABLE public.devoluciones_detalle ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();
  ALTER TABLE public.inventario_movimientos ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();
  ALTER TABLE public.cierres_caja ALTER COLUMN tenant_id SET DEFAULT public.get_user_tenant();

  -- Indices para que el dashboard no se ponga pesado.
  CREATE INDEX IF NOT EXISTS idx_productos_tenant ON public.productos(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_clientes_tenant ON public.clientes(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_facturas_tenant ON public.facturas(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_facturas_detalle_tenant ON public.facturas_detalle(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_compras_tenant ON public.compras(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_proveedores_tenant ON public.proveedores(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_compromisos_tenant ON public.compromisos(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_recibos_ingreso_tenant ON public.recibos_ingreso(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_pagos_suplidores_tenant ON public.pagos_suplidores(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_devoluciones_tenant ON public.devoluciones(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_inventario_movimientos_tenant ON public.inventario_movimientos(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_cierres_caja_tenant ON public.cierres_caja(tenant_id);
END $$;

SELECT 'tenant_id core cash columns ready' AS status;
