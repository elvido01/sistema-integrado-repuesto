-- =====================================================================
-- La busqueda de Hermes vuelve a ver el inventario
-- ---------------------------------------------------------------------
-- (2026-09-30) Desde el 28/08 11:48 (hermes_ve_el_almacen_viejo.sql) TODAS
-- las busquedas de Hermes y Jarvis por el MCP fallaban con:
--
--   cannot execute INSERT in a read-only transaction
--
-- mcp_buscar_piezas estaba declarada STABLE y ademas anota la busqueda
-- (registrar_busqueda hace INSERT en busquedas_catalogo). PostgREST corre
-- las funciones STABLE en una transaccion de solo lectura, asi que el INSERT
-- reventaba la busqueda entera. hermes-sugerir se lo tragaba como "no hay
-- resultados" y contestaba "no la tengo" con 19 bandas en el estante.
--
-- Se vuelve VOLATILE: es lo que es, porque escribe. Idempotente.
-- =====================================================================

ALTER FUNCTION public.mcp_buscar_piezas(text, integer) VOLATILE;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('hermes_busqueda_puede_anotar.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT proname, CASE provolatile WHEN 'v' THEN 'OK  VOLATILE' ELSE '*** SIGUE ' || provolatile::text || ' ***' END AS volatilidad
  FROM pg_proc WHERE proname = 'mcp_buscar_piezas';
