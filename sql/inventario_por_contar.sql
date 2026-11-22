-- ============================================================
-- INVENTARIO FÍSICO: LISTA "POR CONTAR" (21/11/2026)
-- ============================================================
-- Tras unificar Morla y Morla Vieja (morla_vieja_hermana_un_inventario.sql)
-- quedaron 985 piezas marcadas por_contar: entraron con existencia 0 (o Morla
-- decía 0) y la vieja decía que había. Se cuentan en la gaveta desde
-- Inventario Físico ("★ POR CONTAR") y al guardar el conteo se les quita la
-- marca (el espejo la quita también en la hermana).
-- Corre como el usuario (RLS de productos: su empresa activa).
-- ============================================================

SELECT public.registrar_migracion('inventario_por_contar.sql');

CREATE OR REPLACE FUNCTION public.get_inventario_por_contar(p_search text DEFAULT '')
RETURNS TABLE(id uuid, codigo text, descripcion text, referencia text, ubicacion text, existencia numeric, por_contar_ref numeric)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
  SELECT p.id, p.codigo, p.descripcion, p.referencia, p.ubicacion,
         COALESCE((SELECT SUM(m.cantidad) FROM public.inventario_movimientos m WHERE m.producto_id = p.id), 0) AS existencia,
         p.por_contar_ref
    FROM public.productos p
   WHERE p.tenant_id = public.get_user_tenant()
     AND p.activo AND p.por_contar
     AND (COALESCE(p_search, '') = ''
          OR p.codigo ILIKE '%' || p_search || '%'
          OR p.descripcion ILIKE '%' || p_search || '%'
          OR p.referencia ILIKE '%' || p_search || '%')
   ORDER BY p.ubicacion NULLS LAST, p.codigo;
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_inventario_por_contar(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inventario_por_contar(text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- PRUEBA: corre y devuelve lo marcado de Morla (como un usuario de Morla).
DO $prueba$
DECLARE v_user uuid; v_n int;
BEGIN
  FOR v_user IN SELECT ue.user_id FROM public.usuarios_empresas ue
                 WHERE ue.tenant_id = '00000000-0000-0000-0000-000000000001' ORDER BY ue.user_id LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    EXIT WHEN public.get_user_tenant() = '00000000-0000-0000-0000-000000000001';
    v_user := NULL;
  END LOOP;
  IF v_user IS NULL THEN RAISE NOTICE 'Sin usuario de Morla para probar.'; RETURN; END IF;
  SELECT count(*) INTO v_n FROM public.get_inventario_por_contar('');
  IF v_n = 0 THEN RAISE EXCEPTION 'La lista por contar salió vacía.'; END IF;
  PERFORM set_config('request.jwt.claims', '', true);
END $prueba$;
