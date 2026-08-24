-- =====================================================================
-- El producto aprende quien se lo vende
-- ---------------------------------------------------------------------
-- (2026-08-24) Un producto sin suplidor no entra en NINGUNA orden
-- automatica, para siempre. Es invisible por diseno: el calculo de
-- reposicion trabaja por suplidor, asi que uno sin dueno no se le ocurre
-- a nadie hasta que un cliente lo pide y no hay.
--
-- Hoy hay 57 asi, y 23 ya estan agotados.
--
-- >>> LO QUE SE PENSABA HACER Y NO SIRVE <<<
-- El plan era deducirlos del historial de compras. Se midio: de los 57,
-- solo DOS tienen rastro de haber pasado por una compra o una orden. Los
-- otros 55 se crearon a mano y nunca se compraron por el sistema. No hay
-- dato del que deducir nada — la idea no da para mas.
--
-- >>> LO QUE SI SIRVE <<<
-- No hace falta deducir: hay un momento en que la persona YA DIJO de
-- quien es el producto, y es al digitar la factura de compra. Ahi esta
-- escrito el suplidor y estan escritos sus productos, uno al lado del
-- otro. Solo que nadie guardaba esa relacion.
--
-- Asi que se guarda sola. Sin boton, sin lista, sin trabajo nuevo — la
-- misma idea que "lo que no trajo entra solo al borrador": la informacion
-- correcta entregada como tarea nueva no es una mejora.
--
-- Se engancha en los DOS sitios donde la persona ya lo dijo:
--   compras_detalle          — el hecho: se lo compre a el
--   ordenes_compra_detalle   — la intencion: se lo voy a pedir a el
--
-- >>> SOLO RELLENA HUECOS <<<
-- Nunca cambia un suplidor ya puesto. Si el producto tiene dueno, se
-- respeta: la condicion `suplidor_id IS NULL` es la que hace que esto se
-- pueda dejar corriendo sin miedo.
--
-- Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.adoptar_producto_sin_suplidor()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_suplidor uuid;
BEGIN
  IF NEW.producto_id IS NULL THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'compras_detalle' THEN
    SELECT c.suplidor_id INTO v_suplidor
    FROM public.compras c WHERE c.id = NEW.compra_id;
  ELSE
    SELECT oc.suplidor_id INTO v_suplidor
    FROM public.ordenes_compra oc WHERE oc.id = NEW.orden_compra_id;
  END IF;

  IF v_suplidor IS NULL THEN RETURN NEW; END IF;

  -- IS NULL: solo se rellena el hueco, jamas se pisa un suplidor puesto.
  UPDATE public.productos p
  SET suplidor_id = v_suplidor
  WHERE p.id = NEW.producto_id
    AND p.tenant_id = NEW.tenant_id
    AND p.suplidor_id IS NULL;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_adoptar_suplidor_compra ON public.compras_detalle;
CREATE TRIGGER trg_adoptar_suplidor_compra
  AFTER INSERT ON public.compras_detalle
  FOR EACH ROW EXECUTE FUNCTION public.adoptar_producto_sin_suplidor();

DROP TRIGGER IF EXISTS trg_adoptar_suplidor_orden ON public.ordenes_compra_detalle;
CREATE TRIGGER trg_adoptar_suplidor_orden
  AFTER INSERT ON public.ordenes_compra_detalle
  FOR EACH ROW EXECUTE FUNCTION public.adoptar_producto_sin_suplidor();

-- ------------------------------------------------------------
-- Los dos que si tenian rastro
-- ------------------------------------------------------------
-- 000036 AMORTIGUADOR TRASERO CNC -> IMPORTADORA PEDRO RACING
-- 21     CEMENTO DE PARCHO RED SUN -> HAO
-- Se hace por consulta y no por codigo escrito a mano: si manana alguien
-- corre esto otra vez y hay tres, entran los tres.
WITH huerfanos AS (
  SELECT p.id, p.tenant_id FROM public.productos p
  WHERE COALESCE(p.activo, true) AND p.suplidor_id IS NULL
),
rastro AS (
  SELECT cd.producto_id AS pid, c.suplidor_id AS sid
  FROM public.compras_detalle cd
  JOIN public.compras c ON c.id = cd.compra_id
  WHERE c.suplidor_id IS NOT NULL AND cd.producto_id IN (SELECT id FROM huerfanos)
  UNION
  SELECT d.producto_id, oc.suplidor_id
  FROM public.ordenes_compra_detalle d
  JOIN public.ordenes_compra oc ON oc.id = d.orden_compra_id
  WHERE oc.suplidor_id IS NOT NULL AND d.producto_id IN (SELECT id FROM huerfanos)
),
-- Solo si TODO el rastro apunta al mismo. Con dos suplidores distintos no
-- se adivina: eso lo decide la persona.
unico AS (
  SELECT pid, (array_agg(DISTINCT sid))[1] AS sid
  FROM rastro GROUP BY pid HAVING count(DISTINCT sid) = 1
)
UPDATE public.productos p
SET suplidor_id = u.sid
FROM unico u
WHERE p.id = u.pid AND p.suplidor_id IS NULL;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('el_producto_aprende_su_suplidor.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  (SELECT count(*) FROM public.productos
    WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
      AND COALESCE(activo, true) AND suplidor_id IS NULL)            AS siguen_sin_suplidor,
  (SELECT count(*) FROM pg_trigger
    WHERE tgname IN ('trg_adoptar_suplidor_compra','trg_adoptar_suplidor_orden')) AS triggers_puestos;
