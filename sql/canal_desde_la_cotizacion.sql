-- =====================================================================
-- El canal se deduce de la cotizacion, no se le pregunta al cajero
-- ---------------------------------------------------------------------
-- (2026-08-20) La primera version pedia el canal con ocho botones en el pie
-- de Facturacion y no dejaba grabar sin marcarlo. Se probo un dia y se
-- quito: en el mostrador cada clic cuesta, y ese es el peor sitio del
-- sistema para cobrar un peaje de mercadeo — hay un cliente delante
-- esperando.
--
-- >>> LA REGLA NUEVA, QUE ADEMAS ES MEJOR DATO <<<
-- Si una venta viene de una COTIZACION hecha desde el Sales Hub, el canal ya
-- se sabe: es la plataforma de la conversacion que la genero. No hay que
-- preguntarlo, y nadie puede marcarlo mal por prisa. Todo lo demas es gente
-- que llego a la tienda, que es lo que de verdad pasa casi siempre.
--
--   cotizacion  ->  sales_conversations.cotizacion_id  ->  platform
--
-- La respuesta de un dato que nadie teclea no miente. Un desplegable con
-- "Tienda" de primero, a los tres dias, si.
--
-- Idempotente. No toca dinero.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.canal_origen_de_cotizacion(p_cotizacion_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_canal  text;
BEGIN
  IF v_tenant IS NULL OR p_cotizacion_id IS NULL THEN RETURN NULL; END IF;

  SELECT sc.platform INTO v_canal
  FROM public.sales_conversations sc
  WHERE sc.tenant_id = v_tenant
    AND sc.cotizacion_id = p_cotizacion_id
  ORDER BY sc.last_message_at DESC NULLS LAST
  LIMIT 1;

  -- Solo se devuelve lo que el CHECK de facturas acepta. Si mañana entra un
  -- canal nuevo en el espejo y aqui no se ha abierto, vale mas devolver nada
  -- —y que la venta quede como tienda— que reventar la grabacion.
  IF v_canal IN ('whatsapp', 'instagram', 'facebook', 'tiktok') THEN
    RETURN v_canal;
  END IF;

  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.canal_origen_de_cotizacion(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.canal_origen_de_cotizacion(uuid) TO authenticated;

-- El campo deja de poder quedarse vacio por olvido: quien no venga de una
-- cotizacion social es de la tienda. Se pone por defecto en la BASE tambien,
-- para que el agente y cualquier otro camino que grabe una factura queden
-- igual sin tener que acordarse.
ALTER TABLE public.facturas ALTER COLUMN canal_origen SET DEFAULT 'tienda';

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('canal_desde_la_cotizacion.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                     WHERE n.nspname='public' AND p.proname='canal_origen_de_cotizacion')
       THEN 'OK  el canal se deduce de la cotizacion' ELSE '*** FALLO ***' END AS fn,
  (SELECT column_default FROM information_schema.columns
    WHERE table_name='facturas' AND column_name='canal_origen')                AS por_defecto,
  (SELECT count(*) FROM public.sales_conversations WHERE cotizacion_id IS NOT NULL) AS cotizaciones_enganchadas;
