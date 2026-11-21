-- =====================================================================
-- Servicios con precio libre en la caja (21/11/2026)
-- ---------------------------------------------------------------------
-- El dueño: la MANO DE OBRA no se pudo cobrar en la caja 1 porque solo
-- dueño/administrador cambia precios; tuvo que facturarla desde su PC. "En
-- otro repuesto habrá varias cajas y no siempre está el jefe."
-- Decisión: en las líneas de SERVICIO cualquier cajero escribe el precio
-- (las piezas siguen bloqueadas) y queda registrado quién lo puso y cuál
-- era el de catálogo.
--
-- Y la mano de obra de Morla estaba como "bien": el e-CF la mandaba como
-- bien (IndicadorBienoServicio 1). Pasa a servicio técnico. El ITBIS 18 %
-- sigue igual (DGII, consulta 07/01/2026: la reparación de vehículos está
-- gravada; no lleva la retención del 30 % de la NG 02-05). Morla no tiene
-- clientes agentes de retención: no cambia ninguna retención hoy. Los
-- servicios no mueven inventario (trg_servicio_sin_inventario).
-- =====================================================================
BEGIN;

ALTER TABLE public.facturas_detalle
  ADD COLUMN IF NOT EXISTS precio_catalogo numeric,
  ADD COLUMN IF NOT EXISTS precio_puesto_por uuid;
COMMENT ON COLUMN public.facturas_detalle.precio_catalogo IS
  'Servicio cobrado a un precio distinto al del catálogo: el precio de catálogo de ese momento.';
COMMENT ON COLUMN public.facturas_detalle.precio_puesto_por IS
  'Servicio con precio distinto al de catálogo: el usuario que facturó la línea.';

-- La caja manda precio_catalogo (con ITBIS, el que puso el sistema) solo
-- cuando el servicio se cobró a otro precio: compara en las mismas unidades
-- (facturas_detalle.precio va sin ITBIS y sin descuento: no sirve para
-- comparar aquí). La base anota quién, salvo que venga de antes (edición).
-- Corre después de detalle_naturaleza (orden alfabético de los BEFORE).
CREATE OR REPLACE FUNCTION public.trg_detalle_precio_servicio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_admin boolean;
BEGIN
  IF NEW.precio_catalogo IS NULL OR COALESCE(NEW.naturaleza, 'bien') <> 'servicio' THEN
    NEW.precio_catalogo := NULL;
    NEW.precio_puesto_por := NULL;
    RETURN NEW;
  END IF;
  -- Quién lo puso: el que graba. Conservar el de antes (al editar una
  -- factura) solo lo puede un dueño/administrador: un cajero no puede
  -- atribuirle el precio a otro.
  IF NEW.precio_puesto_por IS NOT NULL AND NEW.precio_puesto_por IS DISTINCT FROM auth.uid() THEN
    SELECT EXISTS (SELECT 1 FROM public.profiles p
                    WHERE p.id = auth.uid() AND p.tenant_id = NEW.tenant_id AND p.role IN ('owner', 'admin'))
        OR EXISTS (SELECT 1 FROM public.usuarios_empresas ue
                    WHERE ue.user_id = auth.uid() AND ue.tenant_id = NEW.tenant_id AND ue.rol IN ('owner', 'admin'))
      INTO v_admin;
    IF NOT v_admin THEN NEW.precio_puesto_por := auth.uid(); END IF;
  END IF;
  NEW.precio_puesto_por := COALESCE(NEW.precio_puesto_por, auth.uid());
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS detalle_precio_servicio ON public.facturas_detalle;
CREATE TRIGGER detalle_precio_servicio
  BEFORE INSERT OR UPDATE OF precio, precio_catalogo, precio_puesto_por ON public.facturas_detalle
  FOR EACH ROW EXECUTE FUNCTION public.trg_detalle_precio_servicio();

-- La mano de obra de Repuestos Morla es un servicio técnico.
UPDATE public.productos p
   SET naturaleza = 'servicio', servicio_tipo = 'tecnico'
  FROM public.tenants t
 WHERE t.id = p.tenant_id AND t.nombre = 'REPUESTOS MORLA'
   AND p.codigo = '0001' AND p.descripcion ILIKE 'MANO DE OBRA%'
   AND COALESCE(p.naturaleza, 'bien') = 'bien';

COMMIT;

SELECT public.registrar_migracion('servicios_precio_libre.sql');
