-- =====================================================================
-- Un chasis es UNA moto: candado para que la existencia no pase de 1
-- ---------------------------------------------------------------------
-- (2026-07-30) "No hay 2 motos con el mismo número de chasis, así que la
-- existencia de una moto no puede ser más de una. Hay que poner un candado.
-- Al parecer fue un error al digitar la compra."
--
-- Son 7, todas NIPPONIA BRIO de la misma serie, todas de Caminero:
--
--   XF1NC1102TL533399  BRIO 110 2026 ROJO      stock 2  → 1
--   XF1NC1102TL533447  BRIO 125 2026 ROJO      stock 2  → 1
--   XF1NC1102TL533464  BRIO 110 2026 NEGRO     stock 2  → 1
--   XF1NC1102TL533470  BRIO 110 2026 NEGRO     stock 2  → 1
--   XF1NC1102TL533474  BRIO 110 2026 NEGRO     stock 2  → 1
--   XF1NC1102TL533686  BRIO 110 R 2026 AZUL    stock 2  → 1
--   XF1NC1102TL533688  BRIO 110 R 2026 AZUL    stock 3  → 1
--                                              ─────────
--                                              8 unidades fantasma
--
-- En la 533688 se ve el error tal cual: dos ENTRADAS del MISMO documento
-- (COMPRA-OC-0001) en el MISMO segundo, 27/04 18:56:09. La compra se digitó
-- dos veces durante las pruebas del sistema.
--
-- >>> LO QUE NO ESTABA MAL <<<
-- Gestión Empresarial no se infló con esto: cuenta un producto por chasis y
-- suma su costo UNA vez, así que sus 78 motos y sus RD$ 6,290,358 estaban
-- bien. Lo inflado era el kardex — y con él el Inventario Físico, que sí
-- suma unidades.
--
-- >>> LA CORRECCIÓN <<<
-- Un AJUSTE por la diferencia, no borrar el movimiento duplicado: así queda
-- en el kardex qué se corrigió, cuándo y por qué. La referencia lo dice.
--
-- >>> EL CANDADO <<<
-- Un movimiento que deje a un producto CON CHASIS por encima de 1 unidad se
-- rechaza con un mensaje que explica qué revisar. Aplica solo a los que
-- tienen `chasis` lleno: los repuestos pueden tener 15 y está bien.
--
-- OJO: en Caminero hay 39 productos SIN el campo `chasis` (32 con
-- existencia) que también son motos — su código es el VIN. Esos quedan
-- FUERA del candado hasta que se les llene el campo. Dime y lo preparo.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) DEJAR EN 1 LAS QUE TIENEN DE MÁS
-- ------------------------------------------------------------
-- Va ANTES del candado por claridad; el ajuste es negativo, así que el
-- candado igual lo dejaría pasar.
WITH stock AS (
  SELECT m.producto_id, SUM(m.cantidad) AS existencia
  FROM public.inventario_movimientos m
  GROUP BY m.producto_id
  HAVING SUM(m.cantidad) > 1.0001
)
INSERT INTO public.inventario_movimientos
  (producto_id, fecha, tipo, cantidad, costo_unitario, referencia_doc, tenant_id)
SELECT p.id,
       (now() AT TIME ZONE 'America/Santo_Domingo')::date,
       'AJUSTE',
       1 - s.existencia,          -- lo que sobra, en negativo
       COALESCE(p.costo, 0),
       'AJUSTE-CHASIS-DUPLICADO',
       p.tenant_id
FROM stock s
JOIN public.productos p ON p.id = s.producto_id
WHERE p.chasis IS NOT NULL AND btrim(p.chasis) <> '';

-- ------------------------------------------------------------
-- 2) EL CANDADO
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.inventario_chasis_maximo_uno()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_chasis text;
  v_codigo text;
  v_desc   text;
  v_stock  numeric;
BEGIN
  SELECT btrim(COALESCE(p.chasis, '')), p.codigo, p.descripcion
    INTO v_chasis, v_codigo, v_desc
  FROM public.productos p
  WHERE p.id = NEW.producto_id;

  -- Sin chasis no hay nada que vigilar: un repuesto puede tener 15.
  IF COALESCE(v_chasis, '') = '' THEN
    RETURN NEW;
  END IF;

  -- Lo que ya hay, sin contarse a sí mismo si esto es una edición.
  SELECT COALESCE(SUM(m.cantidad), 0) INTO v_stock
  FROM public.inventario_movimientos m
  WHERE m.producto_id = NEW.producto_id
    AND (TG_OP <> 'UPDATE' OR m.id <> NEW.id);

  v_stock := v_stock + COALESCE(NEW.cantidad, 0);

  IF v_stock > 1.0001 THEN
    RAISE EXCEPTION
      'La moto % (chasis %) quedaria con % en existencia. Un chasis es UNA moto: no puede haber mas de una. Revisa si la compra se digito dos veces.',
      COALESCE(NULLIF(btrim(v_desc), ''), v_codigo), v_chasis, trunc(v_stock);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_inventario_chasis_maximo_uno ON public.inventario_movimientos;
CREATE TRIGGER trg_inventario_chasis_maximo_uno
  BEFORE INSERT OR UPDATE ON public.inventario_movimientos
  FOR EACH ROW EXECUTE FUNCTION public.inventario_chasis_maximo_uno();

-- El candado suma por producto en cada movimiento: sin este índice, cada
-- entrada tendria que recorrer la tabla completa.
CREATE INDEX IF NOT EXISTS idx_inventario_movimientos_producto
  ON public.inventario_movimientos (producto_id);

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('chasis_una_sola_unidad.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) NINGUNA MOTO CON MÁS DE UNA UNIDAD
SELECT p.codigo, p.descripcion, p.chasis, SUM(m.cantidad) AS existencia
FROM public.inventario_movimientos m
JOIN public.productos p ON p.id = m.producto_id
WHERE p.chasis IS NOT NULL AND btrim(p.chasis) <> ''
GROUP BY p.codigo, p.descripcion, p.chasis
HAVING SUM(m.cantidad) > 1.0001;
-- esperado: 0 filas. Antes eran 7.

-- 2) LOS AJUSTES QUE SE HICIERON, para que quede claro qué se tocó
SELECT p.codigo, p.descripcion, m.fecha, m.cantidad, m.referencia_doc
FROM public.inventario_movimientos m
JOIN public.productos p ON p.id = m.producto_id
WHERE m.referencia_doc = 'AJUSTE-CHASIS-DUPLICADO'
ORDER BY p.codigo;
-- esperado: 7 filas — seis de -1 y una de -2 (la 533688, que tenia 3).

-- 3) EL INVENTARIO DE CAMINERO, YA CUADRADO
WITH stock AS (
  SELECT m.producto_id, SUM(m.cantidad) AS existencia
  FROM public.inventario_movimientos m
  WHERE m.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  GROUP BY m.producto_id HAVING SUM(m.cantidad) > 0
)
SELECT COUNT(*) AS productos_con_existencia,
       SUM(s.existencia) AS unidades,
       COUNT(*) FILTER (WHERE p.chasis IS NOT NULL AND btrim(p.chasis) <> ''
                          AND COALESCE(p.activo, true)) AS cuenta_gestion_empresarial
FROM stock s JOIN public.productos p ON p.id = s.producto_id;
-- esperado: 117 productos y 117 unidades (antes 125: sobraban 8).
-- Gestion Empresarial sigue en 78 — le faltan las 32 sin chasis, que es
-- harina de otro costal.

-- 4) PROBAR EL CANDADO (opcional, en una transacción que se deshace)
-- BEGIN;
--   INSERT INTO public.inventario_movimientos (producto_id, fecha, tipo, cantidad, tenant_id)
--   SELECT p.id, CURRENT_DATE, 'ENTRADA', 1, p.tenant_id
--   FROM public.productos p WHERE p.codigo = 'XF1NC1102TL533688';
-- ROLLBACK;
-- esperado: ERROR "La moto ... quedaria con 2 en existencia..."
