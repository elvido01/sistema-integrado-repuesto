-- ============================================================
-- MORLA Y MORLA VIEJA: DOS EMPRESAS, UN SOLO INVENTARIO (21/11/2026)
-- ============================================================
-- Decisión del dueño: unificar el catálogo en REPUESTOS MORLA (...0001) y
-- que REPUESTOS MORLA VIEJA (...0002) pase a ser su empresa hermana con el
-- inventario compartido (espejo por triggers, como Caminero↔MotoPréstamos).
-- La vieja será otra empresa cuando tenga su RNC (se le cambia el nombre);
-- desde ya puede vender (decisión del dueño).
--
-- La existencia de la vieja es una FOTO del sistema viejo (28/05/2026), no un
-- almacén: 519 piezas ya vendidas en Morla seguían contadas allá. Por eso
-- manda la existencia de Morla y lo de la vieja entra CONTANDO:
--
--   3,715 mismo código         → se queda el de Morla con su existencia.
--     243 de esos (Morla 0, la vieja con unidades) → "Por contar".
--     786 misma descripción, otro código (un solo parecido) → el código viejo
--         queda como CÓDIGO ANTERIOR de la pieza de Morla (el buscador lo halla).
--      26 misma descripción con varios parecidos → no se crean; a mano.
--   1,699 no están en Morla, activos → se crean en Morla con existencia 0 e
--         ITBIS 18% (la vieja trae 0 en todos: el SiiF no traía la tasa; el 98%
--         de Morla es 18% y los precios de la vieja son los de Morla).
--     742 de esos con existencia en la vieja → "Por contar".
--      14 no están en Morla, inactivos → fuera (decisión del dueño).
--
-- Después: se vacía el catálogo viejo (solo tenía el SALDO INICIAL SiiF; nada
-- depende de él), se enciende el inventario compartido y se copian los
-- productos de Morla con la misma existencia. Respaldo dentro de la base en
-- private.respaldo_morla_vieja_* y en scripts/migracion-siif/out/.
-- Todo en UNA transacción; la prueba del final lo deshace si algo no cuadra.
-- ============================================================

SET LOCAL statement_timeout = '900s';

SELECT public.registrar_migracion('morla_vieja_hermana_un_inventario.sql');

-- ── 0. Respaldo dentro de la base ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS private.respaldo_morla_vieja_productos AS
  SELECT now() AS respaldado_at, p.* FROM public.productos p WHERE p.tenant_id = '00000000-0000-0000-0000-000000000002';
CREATE TABLE IF NOT EXISTS private.respaldo_morla_vieja_movimientos AS
  SELECT now() AS respaldado_at, m.* FROM public.inventario_movimientos m
   WHERE m.producto_id IN (SELECT id FROM public.productos WHERE tenant_id = '00000000-0000-0000-0000-000000000002');
CREATE TABLE IF NOT EXISTS private.respaldo_morla_vieja_presentaciones AS
  SELECT now() AS respaldado_at, x.* FROM public.presentaciones x
   WHERE x.producto_id IN (SELECT id FROM public.productos WHERE tenant_id = '00000000-0000-0000-0000-000000000002');
REVOKE ALL ON private.respaldo_morla_vieja_productos, private.respaldo_morla_vieja_movimientos,
              private.respaldo_morla_vieja_presentaciones FROM PUBLIC, anon, authenticated;

-- ── 1. Columnas nuevas del producto ──────────────────────────────────────
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS codigos_anteriores text,
  ADD COLUMN IF NOT EXISTS por_contar boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS por_contar_ref numeric;
COMMENT ON COLUMN public.productos.codigos_anteriores IS
  'Códigos con los que la pieza se conocía antes (p.ej. el de Morla Vieja). El buscador los encuentra.';
COMMENT ON COLUMN public.productos.por_contar IS
  'Hay que contarla en la gaveta antes de confiar en su existencia (unificación Morla Vieja, 21/11/2026). Se quita al contarla en Inventario Físico.';
COMMENT ON COLUMN public.productos.por_contar_ref IS
  'Cantidad de referencia para el conteo (lo que decía el sistema viejo el 28/05/2026).';

-- ── 2. El espejo copia también las columnas nuevas ───────────────────────
DO $espejo$
DECLARE v_def text; v_nuevo text;
BEGIN
  v_def := replace(pg_get_functiondef('public._espejo_producto(uuid,uuid,uuid)'::regprocedure), E'\r\n', E'\n');
  IF position('codigos_anteriores' IN v_def) > 0 THEN RAISE NOTICE 'El espejo ya copiaba las columnas nuevas.'; RETURN; END IF;
  v_nuevo := replace(v_def, E'    ecommerce_orden = s.ecommerce_orden,\n',
    E'    ecommerce_orden = s.ecommerce_orden,\n'
    || E'    codigos_anteriores = s.codigos_anteriores, por_contar = s.por_contar, por_contar_ref = s.por_contar_ref,\n');
  IF v_nuevo = v_def THEN RAISE EXCEPTION 'Espejo: no se encontró la asignación de ecommerce_orden.'; END IF;
  v_def := v_nuevo;
  v_nuevo := replace(v_def, 'd.ecommerce_descripcion, d.ecommerce_orden, d.modelos_ids,',
                            'd.ecommerce_descripcion, d.ecommerce_orden, d.codigos_anteriores, d.por_contar, d.por_contar_ref, d.modelos_ids,');
  IF v_nuevo = v_def THEN RAISE EXCEPTION 'Espejo: no se encontró la comparación (lado d).'; END IF;
  v_def := v_nuevo;
  v_nuevo := replace(v_def, 's.ecommerce_descripcion, s.ecommerce_orden, v_modelos,',
                            's.ecommerce_descripcion, s.ecommerce_orden, s.codigos_anteriores, s.por_contar, s.por_contar_ref, v_modelos,');
  IF v_nuevo = v_def THEN RAISE EXCEPTION 'Espejo: no se encontró la comparación (lado s).'; END IF;
  EXECUTE v_nuevo;
END $espejo$;

-- ── 3. El buscador encuentra los códigos anteriores ──────────────────────
DO $buscador$
DECLARE v_def text; v_nuevo text;
BEGIN
  SELECT replace(pg_get_functiondef(p.oid), E'\r\n', E'\n') INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_productos_paginados';
  IF position('codigos_anteriores' IN v_def) > 0 THEN RAISE NOTICE 'El buscador ya miraba los códigos anteriores.'; RETURN; END IF;
  v_nuevo := replace(v_def,
    E'        OR public._sin_tildes(COALESCE(p.referencia,'''')) LIKE ''%'' || v_palabras[1] || ''%''\n',
    E'        OR public._sin_tildes(COALESCE(p.referencia,'''')) LIKE ''%'' || v_palabras[1] || ''%''\n'
    || E'        OR public._sin_tildes(COALESCE(p.codigos_anteriores,'''')) LIKE ''%'' || v_palabras[1] || ''%''\n');
  IF v_nuevo = v_def THEN RAISE EXCEPTION 'Buscador: no se encontró el filtro de referencia.'; END IF;
  v_def := v_nuevo;
  v_nuevo := replace(v_def, 'concat_ws('' '', p.codigo, p.referencia,', 'concat_ws('' '', p.codigo, p.referencia, p.codigos_anteriores,');
  IF v_nuevo = v_def THEN RAISE EXCEPTION 'Buscador: no se encontró el concat_ws.'; END IF;
  EXECUTE v_nuevo;
END $buscador$;

-- ── 4. Clasificación (la misma de la simulación) ─────────────────────────
CREATE TEMP TABLE _n ON COMMIT DROP AS
  SELECT id, upper(btrim(codigo)) k,
         regexp_replace(upper(public._sin_tildes(COALESCE(descripcion, ''))), '[^A-Z0-9]', '', 'g') dn,
         public.get_stock_actual(id) ex
    FROM public.productos WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
CREATE INDEX ON _n(k); CREATE INDEX ON _n(dn);

CREATE TEMP TABLE _v ON COMMIT DROP AS
  SELECT p.*, upper(btrim(p.codigo)) k,
         regexp_replace(upper(public._sin_tildes(COALESCE(p.descripcion, ''))), '[^A-Z0-9]', '', 'g') dn,
         public.get_stock_actual(p.id) ex
    FROM public.productos p WHERE p.tenant_id = '00000000-0000-0000-0000-000000000002';

CREATE TEMP TABLE _c ON COMMIT DROP AS
  SELECT v.id, v.k, v.dn, v.ex, COALESCE(v.activo, true) activo,
         (SELECT count(*) FROM _n WHERE _n.k = v.k) mk,
         (SELECT count(*) FROM _n WHERE _n.dn = v.dn AND v.dn <> '') md
    FROM _v v;

-- Existencia de Morla ANTES (la prueba la compara al final)
CREATE TEMP TABLE _antes ON COMMIT DROP AS SELECT id, ex FROM _n;

-- ── 5. Códigos anteriores (786) ──────────────────────────────────────────
UPDATE public.productos p
   SET codigos_anteriores = concat_ws(' ', NULLIF(btrim(p.codigos_anteriores), ''), a.codigos)
  FROM (SELECT n.id, string_agg(v.codigo, ' ' ORDER BY v.codigo) codigos
          FROM _c c JOIN _v v ON v.id = c.id JOIN _n n ON n.dn = c.dn
         WHERE c.mk = 0 AND c.md = 1
         GROUP BY n.id) a
 WHERE p.id = a.id;

-- ── 6. Las que no están en Morla (1,699 activas) ─────────────────────────
INSERT INTO public.productos (tenant_id, codigo, referencia, descripcion, costo, precio, itbis_pct,
                              min_stock, max_stock, ubicacion, garantia_meses, medida, activo,
                              por_contar, por_contar_ref)
SELECT '00000000-0000-0000-0000-000000000001', v.codigo, v.referencia, v.descripcion, v.costo, v.precio,
       0.18, v.min_stock, v.max_stock, v.ubicacion, v.garantia_meses, v.medida, true,
       (c.ex > 0), CASE WHEN c.ex > 0 THEN c.ex END
  FROM _c c JOIN _v v ON v.id = c.id
 WHERE c.mk = 0 AND c.md = 0 AND c.activo;

-- ── 7. Mismo código, Morla en 0 y la vieja con unidades (243) ────────────
UPDATE public.productos p
   SET por_contar = true, por_contar_ref = c.ex
  FROM _c c JOIN _n n ON n.k = c.k
 WHERE p.id = n.id AND c.mk > 0 AND c.ex > 0 AND n.ex <= 0;

-- ── 8. Vaciar el catálogo viejo ──────────────────────────────────────────
DELETE FROM public.presentaciones
 WHERE producto_id IN (SELECT id FROM public.productos WHERE tenant_id = '00000000-0000-0000-0000-000000000002');
DELETE FROM public.inventario_movimientos
 WHERE producto_id IN (SELECT id FROM public.productos WHERE tenant_id = '00000000-0000-0000-0000-000000000002');
DELETE FROM public.productos WHERE tenant_id = '00000000-0000-0000-0000-000000000002';

-- ── 9. Hermanas con el inventario compartido ─────────────────────────────
UPDATE public.config_empresa SET empresa_vieja_tenant_id = NULL,
       inventario_compartido_con = '00000000-0000-0000-0000-000000000002'
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
UPDATE public.config_empresa SET solo_consulta = false,
       inventario_compartido_con = '00000000-0000-0000-0000-000000000001'
 WHERE tenant_id = '00000000-0000-0000-0000-000000000002';

SELECT private.copiar_a_empresa_hermana('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', true, false);

-- ── PRUEBA: si algo no cuadra, nada de lo anterior queda ─────────────────
DO $prueba$
DECLARE
  v_morla int; v_vieja int; v_pares int; v_dif int; v_cambio int; v_nuevas_con int;
  v_pc_m int; v_pc_v int; v_alias int; v_creadas int;
BEGIN
  SELECT count(*) INTO v_morla FROM public.productos WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
  SELECT count(*) INTO v_vieja FROM public.productos WHERE tenant_id = '00000000-0000-0000-0000-000000000002';
  SELECT count(*) INTO v_pares FROM public.productos_espejo e
    JOIN public.productos a ON a.id = e.producto_id AND a.tenant_id = '00000000-0000-0000-0000-000000000001'
    JOIN public.productos b ON b.id = e.par_id      AND b.tenant_id = '00000000-0000-0000-0000-000000000002';
  IF v_morla <> v_vieja OR v_pares <> v_morla THEN
    RAISE EXCEPTION 'Catálogos distintos: Morla %, Vieja %, pares %', v_morla, v_vieja, v_pares;
  END IF;

  -- Misma existencia en cada par
  SELECT count(*) INTO v_dif FROM public.productos_espejo e
    JOIN public.productos a ON a.id = e.producto_id AND a.tenant_id = '00000000-0000-0000-0000-000000000001'
   WHERE COALESCE((SELECT SUM(cantidad) FROM public.inventario_movimientos WHERE producto_id = e.producto_id), 0)
      <> COALESCE((SELECT SUM(cantidad) FROM public.inventario_movimientos WHERE producto_id = e.par_id), 0);
  IF v_dif > 0 THEN RAISE EXCEPTION '% pares con existencia distinta entre Morla y la Vieja', v_dif; END IF;

  -- La existencia de Morla no cambió
  SELECT count(*) INTO v_cambio FROM _antes a WHERE public.get_stock_actual(a.id) IS DISTINCT FROM a.ex;
  IF v_cambio > 0 THEN RAISE EXCEPTION 'Cambió la existencia de % productos de Morla', v_cambio; END IF;

  -- Las creadas entran en 0 y con ITBIS 18%
  SELECT count(*) INTO v_creadas FROM public.productos
   WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND id NOT IN (SELECT id FROM _antes);
  SELECT count(*) INTO v_nuevas_con FROM public.productos p
   WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001' AND p.id NOT IN (SELECT id FROM _antes)
     AND (public.get_stock_actual(p.id) <> 0 OR p.itbis_pct <> 0.18);
  IF v_creadas <> 1699 OR v_nuevas_con > 0 THEN
    RAISE EXCEPTION 'Creadas: % (esperadas 1699); con existencia o ITBIS raro: %', v_creadas, v_nuevas_con;
  END IF;

  SELECT count(*) INTO v_alias FROM public.productos WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND codigos_anteriores IS NOT NULL;
  SELECT count(*) INTO v_pc_m FROM public.productos WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND por_contar;
  SELECT count(*) INTO v_pc_v FROM public.productos WHERE tenant_id = '00000000-0000-0000-0000-000000000002' AND por_contar;
  IF v_pc_m <> v_pc_v OR v_pc_m <> 985 THEN
    RAISE EXCEPTION 'Por contar: Morla %, Vieja % (esperadas 985)', v_pc_m, v_pc_v;
  END IF;
  IF v_alias < 700 THEN RAISE EXCEPTION 'Solo % productos con código anterior (esperados ~786)', v_alias; END IF;

  RAISE NOTICE 'OK: % productos en cada empresa, % por contar, % con código anterior', v_morla, v_pc_m, v_alias;
END $prueba$;

NOTIFY pgrst, 'reload schema';

-- Resumen
SELECT
  (SELECT count(*) FROM public.productos WHERE tenant_id = '00000000-0000-0000-0000-000000000001') AS morla,
  (SELECT count(*) FROM public.productos WHERE tenant_id = '00000000-0000-0000-0000-000000000002') AS vieja,
  (SELECT count(*) FROM public.productos WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND por_contar) AS por_contar,
  (SELECT count(*) FROM public.productos WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND codigos_anteriores IS NOT NULL) AS con_codigo_anterior;
