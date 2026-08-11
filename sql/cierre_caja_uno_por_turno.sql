-- =====================================================================
-- Un cierre por día y turno: el último sustituye al anterior
-- ---------------------------------------------------------------------
-- (2026-08-10) MotoPréstamos cerró dos veces el 8/8:
--
--   15:59:49   RD$ 19,250    <- se cuadró
--   16:08:57   RD$ 19,850    <- llegó un cliente a pagar al último minuto
--
-- Los DOS entraron a la cuenta bancaria: RD$ 39,100 donde hubo 19,850. El
-- banco quedó con casi el doble de lo que se depositó, y eso no se nota
-- mirando el cierre —que se ve bien— sino cuadrando el banco días después.
--
-- No es un descuido de nadie: es lo normal. Se cuadra la caja, y justo
-- después alguien paga. Rehacer el cierre es lo correcto; lo que faltaba era
-- que el sistema entendiera que el segundo REEMPLAZA al primero en vez de
-- sumarse.
--
-- >>> POR QUÉ NO SE BORRA Y YA <<<
-- Un cierre reemplazado es dinero contado por alguien a una hora concreta.
-- Si mañana el banco no cuadra, saber que a las 15:59 había 19,250 y a las
-- 16:08 había 19,850 es justo el dato que explica la diferencia. Se archiva
-- en cierres_caja_reemplazados y desaparece de la vista, no de la historia.
--
-- >>> POR QUÉ UN DISPARADOR Y NO ARREGLAR LA PANTALLA <<<
-- Porque el cierre se graba desde más de un sitio y mañana habrá otro. Una
-- regla de dinero que depende de que todas las pantallas se acuerden de
-- cumplirla no es una regla. Aquí no se puede saltar.
--
-- Global, para todas las empresas: el problema no es de MotoPréstamos, es de
-- cómo funciona un mostrador.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- DÓNDE VAN LOS REEMPLAZADOS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cierres_caja_reemplazados (
  LIKE public.cierres_caja INCLUDING DEFAULTS
);

ALTER TABLE public.cierres_caja_reemplazados
  ADD COLUMN IF NOT EXISTS reemplazado_en  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS reemplazado_por uuid;

ALTER TABLE public.cierres_caja_reemplazados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cierres_reemplazados_propios ON public.cierres_caja_reemplazados;
CREATE POLICY cierres_reemplazados_propios ON public.cierres_caja_reemplazados
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant());
GRANT SELECT ON public.cierres_caja_reemplazados TO authenticated;

-- ------------------------------------------------------------
-- LA REGLA
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._cierre_caja_reemplaza_anterior()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Se archiva el anterior del mismo día y turno, con quién lo sustituye.
  INSERT INTO public.cierres_caja_reemplazados
  SELECT c.*, now(), NEW.id
  FROM public.cierres_caja c
  WHERE c.tenant_id = NEW.tenant_id
    AND c.fecha = NEW.fecha
    AND c.turno IS NOT DISTINCT FROM NEW.turno
    AND c.id <> NEW.id;

  -- Y se borra su entrada al banco. Esto es lo que de verdad importa: el
  -- cierre viejo era invisible, pero su depósito seguía sumando.
  DELETE FROM public.movimientos_bancarios m
  WHERE m.origen_tipo = 'cierre_caja'
    AND m.origen_id IN (
      SELECT c.id FROM public.cierres_caja c
      WHERE c.tenant_id = NEW.tenant_id
        AND c.fecha = NEW.fecha
        AND c.turno IS NOT DISTINCT FROM NEW.turno
        AND c.id <> NEW.id
    );

  DELETE FROM public.cierres_caja c
  WHERE c.tenant_id = NEW.tenant_id
    AND c.fecha = NEW.fecha
    AND c.turno IS NOT DISTINCT FROM NEW.turno
    AND c.id <> NEW.id;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cierre_caja_reemplaza ON public.cierres_caja;
-- BEFORE INSERT: el anterior tiene que estar fuera ANTES de que el índice
-- único mire la tabla, o el cierre nuevo sería el rechazado.
CREATE TRIGGER trg_cierre_caja_reemplaza
  BEFORE INSERT ON public.cierres_caja
  FOR EACH ROW EXECUTE FUNCTION public._cierre_caja_reemplaza_anterior();

-- ------------------------------------------------------------
-- LIMPIAR LO QUE YA ESTÁ DUPLICADO
-- ------------------------------------------------------------
-- Antes del índice único: con duplicados vivos, crearlo falla.
-- Sobrevive el ÚLTIMO de cada día y turno, que es el bueno por definición.
WITH ordenados AS (
  SELECT id, tenant_id, fecha, turno, created_at,
         ROW_NUMBER() OVER (PARTITION BY tenant_id, fecha, turno ORDER BY created_at DESC) AS puesto,
         FIRST_VALUE(id) OVER (PARTITION BY tenant_id, fecha, turno ORDER BY created_at DESC) AS ganador
  FROM public.cierres_caja
),
viejos AS (SELECT id, ganador FROM ordenados WHERE puesto > 1),
archivados AS (
  INSERT INTO public.cierres_caja_reemplazados
  SELECT c.*, now(), v.ganador
  FROM public.cierres_caja c JOIN viejos v ON v.id = c.id
  RETURNING 1
),
sin_banco AS (
  DELETE FROM public.movimientos_bancarios m
  WHERE m.origen_tipo = 'cierre_caja' AND m.origen_id IN (SELECT id FROM viejos)
  RETURNING 1
)
DELETE FROM public.cierres_caja WHERE id IN (SELECT id FROM viejos);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cierre_caja_dia_turno
  ON public.cierres_caja (tenant_id, fecha, turno);

-- ------------------------------------------------------------
-- EL TURNO 2 DE CAMINERO DEL 1/8, QUE NO ERA UN TURNO
-- ------------------------------------------------------------
-- La regla de arriba no lo atrapa: para el sistema, turno 1 y turno 2 son
-- dos cajas distintas y ambos son legítimos. Pero los datos dicen otra cosa.
--
--   turno 1  16:07:11   efectivo 9,035   desglose 9,050   dif    +15
--   turno 2  16:07:43   efectivo 9,035   desglose     0   dif -9,035
--
-- Treinta y dos segundos después, con el desglose en cero: nadie contó ese
-- dinero. No es una segunda caja, es un guardado accidental que duplicaba
-- 9,035 en los reportes. Confirmado con el dueño: Caminero cierra una vez.
--
-- Va por id y no por regla general porque distinguir "turno vacío" de "turno
-- que de verdad no tuvo efectivo" es adivinar, y aquí hay una respuesta.
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.cierres_caja
  WHERE tenant_id = '91cc1e82-441e-4c22-8e30-9c8866294c00'
    AND fecha = '2026-08-01' AND turno = 2
    AND total_desglose = 0;

  IF v_id IS NOT NULL THEN
    INSERT INTO public.cierres_caja_reemplazados
    SELECT c.*, now(), NULL FROM public.cierres_caja c WHERE c.id = v_id;

    DELETE FROM public.movimientos_bancarios
    WHERE origen_tipo = 'cierre_caja' AND origen_id = v_id;

    DELETE FROM public.cierres_caja WHERE id = v_id;
    RAISE NOTICE 'Turno 2 del 1/8 de Caminero archivado';
  END IF;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('cierre_caja_uno_por_turno.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- El 8/8 de MotoPréstamos: debe quedar UNO, el de 19,850.
SELECT fecha, turno, efectivo_en_caja, created_at
FROM public.cierres_caja
WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4' AND fecha = '2026-08-08';

-- Y en el banco, una sola entrada de 19,850 ese día.
SELECT fecha, tipo, monto, concepto
FROM public.movimientos_bancarios
WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4' AND fecha = '2026-08-08';

-- Lo archivado, que sigue ahí para cuando haga falta explicar una diferencia:
SELECT fecha, turno, efectivo_en_caja, reemplazado_en
FROM public.cierres_caja_reemplazados ORDER BY reemplazado_en DESC LIMIT 10;

-- ¿Quedó algún día con más de un cierre en cualquier empresa?
SELECT tenant_id, fecha, turno, COUNT(*)
FROM public.cierres_caja GROUP BY 1,2,3 HAVING COUNT(*) > 1;
