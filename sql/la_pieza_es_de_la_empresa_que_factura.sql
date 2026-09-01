-- ============================================================
-- LA PIEZA TIENE QUE SER DE LA EMPRESA QUE LA FACTURA
-- ============================================================
-- El 31/08/2026 salió una factura Nº 1 en MOTOPRÉSTAMOS LOS NARANJOS por
-- RD$242.42 con tres piezas de REPUESTOS CAMINERO dentro:
--
--   120150019-0002  JUNTA CULATA CG200                88.27
--   110420004-0001  JUNTA TAPA DE VOLANTA LX200ZH     76.81
--   110620048-0001  JUNTA TAPA CLUTH LX200ZH          77.34
--
-- Cuatro minutos después se rehízo bien en Caminero (FT-192, RD$198.12), pero
-- la fantasma se quedó: entró en el cierre de caja del día de una financiera
-- que no vende repuestos, y dejó tres SALIDA de inventario archivadas bajo el
-- tenant equivocado.
--
-- >>> NO FUE UNA FUGA DEL BUSCADOR <<<
-- `get_productos_paginados` filtra por `get_user_tenant()` y lo hace bien. El
-- agujero está al GRABAR: no existe un `crear_factura`, el frontend inserta
-- directo en `facturas_detalle`, y RLS deja pasar la línea porque el
-- `tenant_id` DE LA LÍNEA sí es el de la empresa activa. El `producto_id` no
-- lo mira nadie. Basta con que el carrito sobreviva a un cambio de empresa
-- —dos pestañas, o cambiar de compañía sin vaciar la venta— para que las
-- piezas de una acaben facturadas por la otra.
--
-- Por eso el arreglo NO es una comprobación en el frontend ni un trigger: es
-- una CLAVE FORÁNEA COMPUESTA. Que la base misma no pueda representar una
-- línea cuya pieza es de otra empresa, venga de donde venga —pantalla, API,
-- script de migración o consola.
--
-- >>> Y SE PONE `NOT VALID` A PROPÓSITO <<<
-- Las tres filas malas siguen ahí y se quedan hasta que el dueño decida qué
-- hacer con la factura fantasma: está dentro de un cierre de caja grabado, y
-- eso no se toca por cuenta propia. `NOT VALID` cierra la puerta HOY para
-- todo lo nuevo sin obligar a limpiar el pasado en el mismo movimiento.
-- Cuando se limpie, se remata con:
--
--   ALTER TABLE public.facturas_detalle       VALIDATE CONSTRAINT facturas_detalle_pieza_de_su_empresa;
--   ALTER TABLE public.inventario_movimientos VALIDATE CONSTRAINT inventario_mov_pieza_de_su_empresa;
--
-- Barrido previo: 32 tablas que cruzan `producto_id` con `tenant_id`. Solo
-- estas dos tienen filas cruzadas, 3 en cada una, todas de esa factura.
--
-- Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. LO QUE HACE POSIBLE LA CLAVE COMPUESTA
-- ------------------------------------------------------------
-- Redundante con la PK a efectos de unicidad —`id` ya es único— pero una
-- clave foránea compuesta exige un índice único sobre EXACTAMENTE esas dos
-- columnas. Es el precio de que la regla la imponga la base y no la buena fe.
CREATE UNIQUE INDEX IF NOT EXISTS productos_tenant_id_uq
  ON public.productos (tenant_id, id);

-- ------------------------------------------------------------
-- 2. LA PUERTA
-- ------------------------------------------------------------
-- ON DELETE igual al de la clave simple que ya existe sobre `producto_id`, en
-- cada tabla. Esto añade una condición; no cambia qué pasa al borrar una
-- pieza, que es otra decisión y ya estaba tomada.
DO $fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'facturas_detalle_pieza_de_su_empresa') THEN
    ALTER TABLE public.facturas_detalle
      ADD CONSTRAINT facturas_detalle_pieza_de_su_empresa
      FOREIGN KEY (tenant_id, producto_id)
      REFERENCES public.productos (tenant_id, id)
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'inventario_mov_pieza_de_su_empresa') THEN
    ALTER TABLE public.inventario_movimientos
      ADD CONSTRAINT inventario_mov_pieza_de_su_empresa
      FOREIGN KEY (tenant_id, producto_id)
      REFERENCES public.productos (tenant_id, id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $fk$;

-- ------------------------------------------------------------
-- 3. LA EXISTENCIA TAMBIÉN SE CUENTA POR EMPRESA
-- ------------------------------------------------------------
-- `get_stock_actual` sumaba TODOS los movimientos de una pieza sin mirar de
-- quién eran. Con los movimientos bien archivados da igual —un `producto_id`
-- solo vive en una empresa— pero el 31/08 dejó de dar igual: las tres SALIDA
-- de la factura fantasma están bajo MotoPréstamos y restaban de la existencia
-- de Caminero.
--
-- Peor que estar mal es estar mal SOLO A VECES: `get_productos_paginados` sí
-- filtra por empresa, así que la misma pieza enseñaba una existencia en el
-- buscador y otra en la ficha. Se cuenta contra la empresa DE LA PIEZA y no
-- contra `get_user_tenant()`, para que siga contestando igual desde un script
-- o un cron, donde no hay sesión que preguntar.
CREATE OR REPLACE FUNCTION public.get_stock_actual(producto_uuid uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT COALESCE((
    SELECT sum(m.cantidad)
    FROM public.inventario_movimientos m
    JOIN public.productos p ON p.id = m.producto_id
    WHERE m.producto_id = producto_uuid
      AND m.tenant_id = p.tenant_id
  ), 0);
$fn$;

SELECT public.registrar_migracion('la_pieza_es_de_la_empresa_que_factura.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Que la restricción aparezca en el catálogo no prueba que cierre. Se INTENTA
-- meter una línea con la pieza de otra empresa, de verdad, contra producción.
-- El bloque entero se deshace solo: si la línea entra, se levanta la excepción
-- y con ella se va la fila.
DO $prueba$
DECLARE
  v_fact  uuid;
  v_tenA  uuid;
  v_prod  uuid;
  v_paso  boolean := false;
BEGIN
  SELECT f.id, f.tenant_id INTO v_fact, v_tenA
  FROM public.facturas f ORDER BY f.fecha DESC LIMIT 1;

  SELECT p.id INTO v_prod
  FROM public.productos p WHERE p.tenant_id <> v_tenA LIMIT 1;

  IF v_fact IS NULL OR v_prod IS NULL THEN
    RAISE NOTICE 'No hay con qué probar (factura=%, pieza ajena=%).', v_fact, v_prod;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.facturas_detalle
      (factura_id, tenant_id, producto_id, codigo, descripcion, cantidad, precio, importe)
    VALUES (v_fact, v_tenA, v_prod, 'PRUEBA', 'PRUEBA DE FUGA', 1, 0, 0);
    v_paso := true;
  EXCEPTION WHEN foreign_key_violation THEN
    v_paso := false;
  END;

  IF v_paso THEN
    RAISE EXCEPTION 'SIGUE ABIERTO: se pudo facturar la pieza % desde la empresa %. (Esta transacción se deshace sola.)',
      v_prod, v_tenA;
  END IF;

  RAISE NOTICE 'La puerta cierra: la base rechaza una pieza de otra empresa.';
END $prueba$;

SELECT json_build_object(
 'puerta_facturas', (SELECT convalidated IS NOT NULL FROM pg_constraint
   WHERE conname='facturas_detalle_pieza_de_su_empresa'),
 'puerta_movimientos', (SELECT convalidated IS NOT NULL FROM pg_constraint
   WHERE conname='inventario_mov_pieza_de_su_empresa'),
 'ya_validadas', (SELECT json_agg(json_build_object(conname, convalidated))
   FROM pg_constraint WHERE conname IN
     ('facturas_detalle_pieza_de_su_empresa','inventario_mov_pieza_de_su_empresa')),
 'stock_cuenta_por_empresa', (SELECT p.prosrc LIKE '%m.tenant_id = p.tenant_id%'
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='get_stock_actual'),
 'filas_cruzadas_que_quedan', (
   SELECT count(*) FROM public.facturas_detalle d JOIN public.productos p ON p.id=d.producto_id
   WHERE d.tenant_id <> p.tenant_id)
) AS r;
