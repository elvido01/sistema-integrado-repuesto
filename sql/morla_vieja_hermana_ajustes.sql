-- ============================================================
-- MORLA / MORLA VIEJA — AJUSTES DE LA REVISION (21/11/2026)
-- ============================================================
-- /code-review high sobre morla_vieja_hermana_un_inventario.sql e
-- inventario_por_contar.sql:
-- 1. Las 1,699 creadas en Morla perdieron TIPO y MARCA (la vieja los traía en
--    5,869 productos). Se recuperan del respaldo: por NOMBRE en Morla, y si no
--    existe se crea (igual que mover_producto_de_vieja). El espejo lo pasa a
--    la hermana.
-- 2. Las 786 halladas por DESCRIPCIÓN también pueden estar en 0 en Morla con
--    unidades en la vieja: van a "Por contar" (antes solo las de mismo código).
-- 3. Las marcadas que están INACTIVAS en Morla nunca salen en la lista: se
--    desmarcan.
-- 4. get_inventario_por_contar usa get_stock_actual (la misma cuenta que el
--    resto) y busca sin tildes.
-- Las tablas de respaldo private.respaldo_morla_vieja_* son la fuente.
-- ============================================================

SET LOCAL statement_timeout = '600s';

SELECT public.registrar_migracion('morla_vieja_hermana_ajustes.sql');

-- Los productos de Morla que vinieron de la vieja en la unificación, con su
-- fila del respaldo.
CREATE TEMP TABLE _creadas ON COMMIT DROP AS
  SELECT n.id AS morla_id, r.*
    FROM public.productos n
    JOIN private.respaldo_morla_vieja_productos r ON r.codigo = n.codigo
   WHERE n.tenant_id = '00000000-0000-0000-0000-000000000001'
     AND n.marca_id IS NULL AND n.tipo_id IS NULL
     AND n.created_at >= '2026-11-21';   -- las creó la unificación (21/11 noche RD)

-- ── 1. Marca y tipo por nombre ───────────────────────────────────────────
INSERT INTO public.marcas (id, tenant_id, nombre, activo)
SELECT gen_random_uuid(), '00000000-0000-0000-0000-000000000001', x.nombre, true
  FROM (SELECT DISTINCT m.nombre FROM _creadas c JOIN public.marcas m ON m.id = c.marca_id) x
 WHERE NOT EXISTS (SELECT 1 FROM public.marcas y WHERE y.tenant_id = '00000000-0000-0000-0000-000000000001'
                     AND upper(btrim(y.nombre)) = upper(btrim(x.nombre)));

INSERT INTO public.tipos_producto (tenant_id, nombre, activo)
SELECT '00000000-0000-0000-0000-000000000001', x.nombre, true
  FROM (SELECT DISTINCT t.nombre FROM _creadas c JOIN public.tipos_producto t ON t.id = c.tipo_id) x
 WHERE NOT EXISTS (SELECT 1 FROM public.tipos_producto y WHERE y.tenant_id = '00000000-0000-0000-0000-000000000001'
                     AND upper(btrim(y.nombre)) = upper(btrim(x.nombre)));

UPDATE public.productos p
   SET marca_id = (SELECT y.id FROM public.marcas y JOIN public.marcas m ON upper(btrim(m.nombre)) = upper(btrim(y.nombre))
                    WHERE m.id = c.marca_id AND y.tenant_id = '00000000-0000-0000-0000-000000000001'
                    ORDER BY y.id LIMIT 1),
       tipo_id  = (SELECT y.id FROM public.tipos_producto y JOIN public.tipos_producto t ON upper(btrim(t.nombre)) = upper(btrim(y.nombre))
                    WHERE t.id = c.tipo_id AND y.tenant_id = '00000000-0000-0000-0000-000000000001'
                    ORDER BY y.id LIMIT 1)
  FROM _creadas c
 WHERE p.id = c.morla_id AND (c.marca_id IS NOT NULL OR c.tipo_id IS NOT NULL);

-- ── 2. Halladas por descripción: Morla en 0 y la vieja con unidades ──────
CREATE TEMP TABLE _vex ON COMMIT DROP AS
  SELECT r.codigo, regexp_replace(upper(public._sin_tildes(COALESCE(r.descripcion, ''))), '[^A-Z0-9]', '', 'g') dn,
         COALESCE((SELECT SUM(m.cantidad) FROM private.respaldo_morla_vieja_movimientos m WHERE m.producto_id = r.id), 0) ex
    FROM private.respaldo_morla_vieja_productos r;

UPDATE public.productos p
   SET por_contar = true, por_contar_ref = a.ex
  FROM (SELECT n.id, SUM(v.ex) ex
          FROM public.productos n
          JOIN _vex v ON v.ex > 0
                     AND (' ' || n.codigos_anteriores || ' ') LIKE ('% ' || v.codigo || ' %')
         WHERE n.tenant_id = '00000000-0000-0000-0000-000000000001' AND n.codigos_anteriores IS NOT NULL
         GROUP BY n.id) a
 WHERE p.id = a.id AND NOT p.por_contar AND COALESCE(p.activo, true)
   AND public.get_stock_actual(p.id) <= 0;

-- ── 3. Marcadas pero inactivas: nunca salen en la lista ──────────────────
UPDATE public.productos SET por_contar = false
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND por_contar AND NOT COALESCE(activo, true);

-- ── 4. La lista: la misma existencia que el resto y búsqueda sin tildes ──
CREATE OR REPLACE FUNCTION public.get_inventario_por_contar(p_search text DEFAULT '')
RETURNS TABLE(id uuid, codigo text, descripcion text, referencia text, ubicacion text, existencia numeric, por_contar_ref numeric)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
  SELECT p.id, p.codigo, p.descripcion, p.referencia, p.ubicacion,
         COALESCE(public.get_stock_actual(p.id), 0)::numeric AS existencia,
         p.por_contar_ref
    FROM public.productos p
   WHERE p.tenant_id = public.get_user_tenant()
     AND COALESCE(p.activo, true) AND p.por_contar
     AND (COALESCE(btrim(p_search), '') = ''
          OR public._sin_tildes(concat_ws(' ', p.codigo, p.referencia, p.codigos_anteriores, p.descripcion))
             LIKE '%' || public._sin_tildes(btrim(p_search)) || '%')
   ORDER BY p.ubicacion NULLS LAST, p.codigo;
$fn$;
REVOKE EXECUTE ON FUNCTION public.get_inventario_por_contar(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inventario_por_contar(text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- PRUEBA
DO $prueba$
DECLARE v_m int; v_v int; v_sin_marca int; v_dif int;
BEGIN
  SELECT count(*) INTO v_m FROM public.productos WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND por_contar;
  SELECT count(*) INTO v_v FROM public.productos WHERE tenant_id = '00000000-0000-0000-0000-000000000002' AND por_contar;
  IF v_m <> v_v THEN RAISE EXCEPTION 'Por contar distinto: Morla %, Vieja % (el espejo no copió)', v_m, v_v; END IF;

  SELECT count(*) INTO v_sin_marca FROM _creadas c JOIN public.productos p ON p.id = c.morla_id
   WHERE c.marca_id IS NOT NULL AND p.marca_id IS NULL;
  IF v_sin_marca > 0 THEN RAISE EXCEPTION '% creadas siguen sin marca', v_sin_marca; END IF;

  -- La marca también llegó a la hermana
  SELECT count(*) INTO v_dif FROM _creadas c
    JOIN public.productos_espejo e ON e.producto_id = c.morla_id
    JOIN public.productos g ON g.id = e.par_id
   WHERE c.marca_id IS NOT NULL AND g.marca_id IS NULL;
  IF v_dif > 0 THEN RAISE EXCEPTION '% gemelos en la hermana sin marca', v_dif; END IF;

  -- La existencia sigue igual en cada par
  SELECT count(*) INTO v_dif FROM public.productos_espejo e
    JOIN public.productos a ON a.id = e.producto_id AND a.tenant_id = '00000000-0000-0000-0000-000000000001'
   WHERE COALESCE((SELECT SUM(cantidad) FROM public.inventario_movimientos WHERE producto_id = e.producto_id), 0)
      <> COALESCE((SELECT SUM(cantidad) FROM public.inventario_movimientos WHERE producto_id = e.par_id), 0);
  IF v_dif > 0 THEN RAISE EXCEPTION '% pares con existencia distinta', v_dif; END IF;
END $prueba$;

SELECT
  (SELECT count(*) FROM _creadas) AS creadas_revisadas,
  (SELECT count(*) FROM _creadas c JOIN public.productos p ON p.id = c.morla_id WHERE p.marca_id IS NOT NULL) AS con_marca,
  (SELECT count(*) FROM _creadas c JOIN public.productos p ON p.id = c.morla_id WHERE p.tipo_id IS NOT NULL) AS con_tipo,
  (SELECT count(*) FROM public.productos WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND por_contar) AS por_contar;
