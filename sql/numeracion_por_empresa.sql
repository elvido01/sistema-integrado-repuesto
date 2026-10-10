-- =====================================================================
-- NUMERACIÓN INDEPENDIENTE POR EMPRESA en todos los documentos
-- =====================================================================
-- (10/10/2026) Decisión del dueño: cada empresa lleva su PROPIA secuencia
-- en cada tipo de documento. Inventario de las 23 tablas con número:
--
--   Ya eran por empresa (no se tocan): facturas y cartas de ruta (contador
--   propio), compras, órdenes de compra, entradas/salidas de inventario,
--   recibos de ingreso, préstamos/cargos/pagos/notas de crédito, pagos a
--   suplidores, comisiones, nóminas.
--
--   Compartían UNA secuencia entre todas las empresas (se arreglan aquí):
--     devoluciones          default nextval global  (D Mario empezó en DV-41)
--     pedidos               default nextval global
--     solicitudes_compras   identity global
--     cotizaciones_magna    identity global + UNIQUE(numero) global
--   Y cotizaciones ya numeraba por empresa (get_next_cotizacion_numero),
--   pero con UNIQUE(numero) GLOBAL: la primera cotización de otra empresa
--   (CT-000001) chocaba con la de Morla.
--
-- Mecanismo (el mismo de facturas): contador por (empresa, tipo) y un
-- trigger BEFORE INSERT que pone el número. Funciona igual desde la web, el
-- móvil, Hermes o una RPC. Los números ya emitidos NO cambian (excepto las
-- dos devoluciones de hoy de D Mario, ver paso 5); cada empresa sigue desde
-- su número más alto.
-- =====================================================================

BEGIN;

-- 1) Contador genérico por empresa y tipo de documento -------------------
CREATE TABLE IF NOT EXISTS public.tenant_doc_counters (
  tenant_id   uuid   NOT NULL,
  tipo        text   NOT NULL,
  last_numero bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, tipo)
);
ALTER TABLE public.tenant_doc_counters ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo lo toca la función SECURITY DEFINER de abajo.

-- 2) Trigger genérico: TG_ARGV[0] = tipo de documento --------------------
-- Si el insert ya trae número (restauración de respaldo, migración), se
-- respeta y el contador sube hasta él para no repetirlo después.
CREATE OR REPLACE FUNCTION public.set_numero_por_empresa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tipo text := TG_ARGV[0];
  v_next bigint;
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION '% sin tenant_id: no se puede numerar', TG_TABLE_NAME;
  END IF;

  INSERT INTO public.tenant_doc_counters (tenant_id, tipo, last_numero)
  VALUES (NEW.tenant_id, v_tipo, 0)
  ON CONFLICT (tenant_id, tipo) DO NOTHING;

  IF NEW.numero IS NOT NULL THEN
    UPDATE public.tenant_doc_counters
       SET last_numero = GREATEST(last_numero, NEW.numero::bigint)
     WHERE tenant_id = NEW.tenant_id AND tipo = v_tipo;
    RETURN NEW;
  END IF;

  UPDATE public.tenant_doc_counters
     SET last_numero = last_numero + 1
   WHERE tenant_id = NEW.tenant_id AND tipo = v_tipo
  RETURNING last_numero INTO v_next;

  NEW.numero := v_next;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.set_numero_por_empresa() FROM PUBLIC, anon, authenticated;

-- 3) Quitar la numeración global ------------------------------------------
ALTER TABLE public.devoluciones        ALTER COLUMN numero DROP DEFAULT;
ALTER TABLE public.pedidos             ALTER COLUMN numero DROP DEFAULT;
ALTER TABLE public.solicitudes_compras ALTER COLUMN numero DROP IDENTITY IF EXISTS;
ALTER TABLE public.cotizaciones_magna  ALTER COLUMN numero DROP IDENTITY IF EXISTS;

ALTER TABLE public.cotizaciones       DROP CONSTRAINT IF EXISTS cotizaciones_numero_key;
ALTER TABLE public.cotizaciones_magna DROP CONSTRAINT IF EXISTS cotizaciones_magna_numero_key;

-- 4) Triggers --------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_numero_por_empresa ON public.devoluciones;
CREATE TRIGGER trg_numero_por_empresa BEFORE INSERT ON public.devoluciones
  FOR EACH ROW EXECUTE FUNCTION public.set_numero_por_empresa('devoluciones');

DROP TRIGGER IF EXISTS trg_numero_por_empresa ON public.pedidos;
CREATE TRIGGER trg_numero_por_empresa BEFORE INSERT ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.set_numero_por_empresa('pedidos');

DROP TRIGGER IF EXISTS trg_numero_por_empresa ON public.solicitudes_compras;
CREATE TRIGGER trg_numero_por_empresa BEFORE INSERT ON public.solicitudes_compras
  FOR EACH ROW EXECUTE FUNCTION public.set_numero_por_empresa('solicitudes_compras');

DROP TRIGGER IF EXISTS trg_numero_por_empresa ON public.cotizaciones_magna;
CREATE TRIGGER trg_numero_por_empresa BEFORE INSERT ON public.cotizaciones_magna
  FOR EACH ROW EXECUTE FUNCTION public.set_numero_por_empresa('cotizaciones_magna');

-- 5) D Mario: sus dos devoluciones de hoy pasan de DV-41/DV-42 a DV-1/DV-2 --
-- (empezó hoy; las demás empresas conservan su historial tal cual). Se
-- actualiza también la referencia en el kardex.
UPDATE public.inventario_movimientos m
   SET referencia_doc = 'DEVOLUCION-' || CASE m.referencia_doc WHEN 'DEVOLUCION-41' THEN '1' ELSE '2' END
 WHERE m.tenant_id = '58c09df3-48c2-4a3e-bb3e-96997ccbbc8a'
   AND m.referencia_doc IN ('DEVOLUCION-41', 'DEVOLUCION-42');

UPDATE public.devoluciones
   SET numero = CASE numero WHEN 41 THEN 1 ELSE 2 END
 WHERE tenant_id = '58c09df3-48c2-4a3e-bb3e-96997ccbbc8a'
   AND numero IN (41, 42);

-- 6) Sembrar los contadores con el número más alto de cada empresa --------
INSERT INTO public.tenant_doc_counters (tenant_id, tipo, last_numero)
SELECT tenant_id, 'devoluciones', MAX(numero) FROM public.devoluciones GROUP BY tenant_id
UNION ALL
SELECT tenant_id, 'pedidos', MAX(numero) FROM public.pedidos GROUP BY tenant_id
UNION ALL
SELECT tenant_id, 'solicitudes_compras', MAX(numero) FROM public.solicitudes_compras GROUP BY tenant_id
UNION ALL
SELECT tenant_id, 'cotizaciones_magna', MAX(numero) FROM public.cotizaciones_magna GROUP BY tenant_id
ON CONFLICT (tenant_id, tipo) DO UPDATE SET last_numero = GREATEST(tenant_doc_counters.last_numero, EXCLUDED.last_numero);

-- 7) Únicos POR EMPRESA ------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_devoluciones_tenant_numero        ON public.devoluciones (tenant_id, numero);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pedidos_tenant_numero             ON public.pedidos (tenant_id, numero);
CREATE UNIQUE INDEX IF NOT EXISTS uq_solicitudes_compras_tenant_numero ON public.solicitudes_compras (tenant_id, numero);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cotizaciones_magna_tenant_numero  ON public.cotizaciones_magna (tenant_id, numero);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cotizaciones_tenant_numero        ON public.cotizaciones (tenant_id, numero);

COMMIT;

-- Comprobación: el próximo número de cada empresa en cada documento.
SELECT tipo, left(tenant_id::text, 8) AS empresa, last_numero + 1 AS proximo
  FROM public.tenant_doc_counters
 ORDER BY tipo, empresa;

SELECT public.registrar_migracion('numeracion_por_empresa.sql');
