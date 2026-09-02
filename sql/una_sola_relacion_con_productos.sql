-- ============================================================
-- UNA SOLA RELACIÓN ENTRE UNA LÍNEA Y SU PIEZA
-- ============================================================
-- Consecuencia directa de `la_pieza_es_de_la_empresa_que_factura.sql`, del
-- 01/09. Aquel archivo añadió la clave foránea compuesta que impide facturar
-- una pieza de otra empresa. Lo que no vi es que la dejó CONVIVIENDO con la
-- clave vieja de una sola columna. Resultado: dos caminos entre las mismas dos
-- tablas, y PostgREST —que arma los `select` anidados leyendo pg_constraint—
-- se planta:
--
--   "Could not embed because more than one relationship was found
--    for 'facturas_detalle' and 'productos'"
--
-- No es un aviso: es un 300 y la pantalla no carga. Cayeron siete reportes,
-- todos los que piden la línea con su pieza dentro:
--
--   · Transacciones Diarias      · Recibo de Ingreso
--   · Rentabilidad Diaria        · Estado de Resultados
--   · Carta de Ruta              · Ventas (itbis por línea)
--   · Reporte de Movimientos (kardex, por inventario_movimientos)
--
-- >>> EL ARREGLO ES QUITAR LA VIEJA, NO LA NUEVA <<<
-- La compuesta dice TODO lo que decía la de una columna y además exige que la
-- empresa coincida. Quitar la vieja no afloja nada:
--
--   antes  facturas_detalle_producto_id_fkey        (producto_id) → productos(id)
--   ahora  facturas_detalle_pieza_de_su_empresa     (tenant_id, producto_id) → productos(tenant_id, id)
--
--   antes  inventario_movimientos_producto_id_fkey  (producto_id) → productos(id) ON DELETE CASCADE
--   ahora  inventario_mov_pieza_de_su_empresa       (tenant_id, producto_id) → productos(tenant_id, id) ON DELETE CASCADE
--
-- El ON DELETE se conserva igual en cada una. Las dos columnas son NOT NULL en
-- ambas tablas (comprobado: 0 filas sin tenant), así que no se abre el portillo
-- de MATCH SIMPLE, donde un NULL deja la clave sin comprobar.
--
-- >>> Y NO, ARREGLARLO EN LAS PANTALLAS HABRÍA SIDO PEOR <<<
-- PostgREST admite desambiguar con `productos!facturas_detalle_producto_id_fkey`.
-- Eso son once consultas en la web, más la app móvil, más la extensión, más la
-- próxima que alguien escriba sin saber nada de esto. La ambigüedad se mata
-- donde nace: en el esquema.
--
-- Comprobado antes de tocar producción, con dos tablas de mentira y una
-- llamada real a la API: PostgREST SÍ anida por clave compuesta, y también
-- cuando está NOT VALID. Por eso se puede quitar la vieja sin quedarse sin
-- ningún camino.
--
-- Idempotente.
-- ============================================================

ALTER TABLE public.facturas_detalle
  DROP CONSTRAINT IF EXISTS facturas_detalle_producto_id_fkey;

ALTER TABLE public.inventario_movimientos
  DROP CONSTRAINT IF EXISTS inventario_movimientos_producto_id_fkey;

-- Que la API se entere ya, sin esperar al recargado automático.
NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('una_sola_relacion_con_productos.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Exactamente un camino entre cada tabla y productos, y que el que queda
-- sea el compuesto.
DO $prueba$
DECLARE
  v_fd  int;
  v_im  int;
  v_def text;
BEGIN
  SELECT count(*) INTO v_fd FROM pg_constraint
   WHERE contype='f' AND conrelid='public.facturas_detalle'::regclass
     AND confrelid='public.productos'::regclass;

  SELECT count(*) INTO v_im FROM pg_constraint
   WHERE contype='f' AND conrelid='public.inventario_movimientos'::regclass
     AND confrelid='public.productos'::regclass;

  IF v_fd <> 1 OR v_im <> 1 THEN
    RAISE EXCEPTION 'SIGUE AMBIGUO: facturas_detalle tiene % relaciones con productos e inventario_movimientos tiene %. PostgREST necesita exactamente una.', v_fd, v_im;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
   WHERE contype='f' AND conrelid='public.facturas_detalle'::regclass
     AND confrelid='public.productos'::regclass;

  IF v_def NOT LIKE '%tenant_id, producto_id%' THEN
    RAISE EXCEPTION 'QUEDÓ LA QUE NO ERA: la relación viva es "%". Debía quedar la compuesta.', v_def;
  END IF;

  RAISE NOTICE 'Una sola relación en cada tabla, y es la compuesta.';
END $prueba$;
