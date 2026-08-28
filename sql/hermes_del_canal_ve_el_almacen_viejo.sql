-- =====================================================================
-- El Hermes del canal también ve el almacén viejo
-- ---------------------------------------------------------------------
-- (2026-08-28) Se arregló que el Hermes de la extensión viera Morla Vieja,
-- y el dueño preguntó si eso alcanzaba al Hermes del canal de MotoFlow —el
-- que vive en el VPS—. No alcanzaba, y se comprobó:
--
--   has_function_privilege('hermes_readonly','mcp_buscar_piezas') -> false
--
-- Ese Hermes no puede ni ejecutar la búsqueda que se arregló. Lee las
-- vistas del esquema `hermes` directamente, y las dos que le importan
-- terminan igual:
--
--   hermes.productos                WHERE tenant_id = '...0001'
--   hermes.inventario_movimientos   WHERE tenant_id = '...0001'
--
-- Un tenant escrito a mano: solo REPUESTOS MORLA nueva.
--
-- >>> LA PRUEBA EN VIVO <<<
-- Se le preguntó por la tapa cadena del TVS 100 y contestó:
--
--   "Para TVS 100 no me aparece tapa cadena disponible. La tapa cadena TVS
--    125 Endurix figura agotada; sí hay tapadera de catalina delantera para
--    TVS Sport 100 (2 unidades, RD$220)."
--
-- Todo cierto y verificado contra el catálogo: la tapadera existe
-- (Z38N5081420CN, RD$220, 2 unidades). No inventó nada. Simplemente no
-- puede ver las CUATRO tapa cadena TVS003999 que hay en la vieja.
--
-- >>> POR QUE LA EXISTENCIA VA DENTRO DE LA VISTA <<<
-- Porque hermes.inventario_movimientos también está fijada al tenant
-- nuevo. Darle la lista de productos viejos sin el stock lo dejaría igual
-- de ciego: vería los nombres y no sabría si hay. Se calcula aquí, de una
-- sola pasada agrupada, no producto por producto.
--
-- >>> INLINE A LAS TABLAS BASE, COMO LAS DEMAS <<<
-- Nada de apoyarse en vistas de `public`: las que llevan security_invoker
-- le dan "permission denied" a hermes_readonly. Esta va contra productos,
-- marcas e inventario_movimientos directamente.
--
-- La pareja nueva↔vieja NO se escribe a mano: sale de
-- config_empresa.empresa_vieja_tenant_id. Si algún día cambia, la vista
-- sigue sola.
--
-- Idempotente.
-- =====================================================================

CREATE OR REPLACE VIEW hermes.productos_vieja AS
WITH pareja AS (
  -- El ancla es el mismo tenant fijo de hermes.productos, para que las dos
  -- vistas hablen siempre de la misma empresa.
  SELECT ce.empresa_vieja_tenant_id AS vieja
  FROM config_empresa ce
  WHERE ce.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
), stock AS (
  SELECT im.producto_id, SUM(im.cantidad)::numeric AS existencia
  FROM inventario_movimientos im
  WHERE im.tenant_id = (SELECT vieja FROM pareja)
  GROUP BY im.producto_id
)
SELECT
  p.id,
  p.codigo,
  p.referencia,
  p.descripcion,
  p.ubicacion,
  p.precio,
  p.itbis_pct,
  ma.nombre AS marca,
  get_nombres_modelos(p.modelos_ids) AS modelos,
  COALESCE(s.existencia, 0) AS existencia,
  -- Que quede dicho en la propia fila: esto NO se factura donde está.
  'ALMACEN VIEJO: no se puede facturar aqui, hay que traerla primero'::text AS aviso
FROM productos p
LEFT JOIN stock s  ON s.producto_id = p.id
LEFT JOIN marcas ma ON ma.id = p.marca_id AND ma.tenant_id = p.tenant_id
WHERE p.tenant_id = (SELECT vieja FROM pareja)
  AND COALESCE(p.activo, true) = true;

-- El costo NO va: el canal es para atender, no para negociar márgenes.
GRANT SELECT ON hermes.productos_vieja TO hermes_readonly;

SELECT public.registrar_migracion('hermes_del_canal_ve_el_almacen_viejo.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- 1) Que el rol del VPS la pueda leer.
-- 2) Que la tapa cadena que Hermes dijo no tener aparezca con sus 4.
SELECT
  CASE WHEN has_table_privilege('hermes_readonly', 'hermes.productos_vieja', 'SELECT')
       THEN 'OK  el canal ya puede verla' ELSE 'FALLO: sin permiso' END AS permiso,
  (SELECT count(*) FROM hermes.productos_vieja)                        AS piezas_en_la_vieja,
  (SELECT count(*) FROM hermes.productos_vieja WHERE existencia > 0)   AS con_existencia,
  (SELECT existencia FROM hermes.productos_vieja WHERE codigo = 'TVS003999') AS tapa_cadena_tvs100;
