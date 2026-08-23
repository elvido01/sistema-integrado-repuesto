-- =====================================================================
-- El vigilante de los vigilantes se estaba acusando solo
-- ---------------------------------------------------------------------
-- (2026-08-23) Nada mas instalar la fase 3, `centinela_roto` levanto un
-- hallazgo:
--
--   "El centinela 'Un cierre de caja no cuadra' esta fallando.
--    Lleva sin poder correr desde siempre."
--
-- Mentira. `cierre_no_cuadra` acababa de nacer en el mismo archivo y
-- corre en el puesto 25; `centinela_roto` corre en el 2. Cuando miro,
-- el otro todavia no habia corrido NUNCA y tenia ultima_corrida en NULL.
--
-- >>> POR QUE NO VALE ARREGLARLO COMPARANDO CON LA ULTIMA RONDA <<<
-- La idea obvia —"esta atrasado respecto al que corrio mas reciente"— es
-- peor. El motor recorre los centinelas en un solo loop y `now()` no
-- avanza dentro de una transaccion: cuando `centinela_roto` mira, los que
-- van despues de el todavia tienen la marca de la ronda ANTERIOR. Los
-- acusaria a todos, cada vez.
--
-- >>> LA SEPARACION CORRECTA <<<
-- Un centinela dentro de la base puede saber que OTRO centinela reviento
-- —queda escrito su error— pero no puede saber que el motor entero dejo
-- de correr, porque si el motor no corre el tampoco. Son dos preguntas
-- distintas y necesitan dos sitios distintos:
--
--   centinela_roto()      -> "uno de ellos esta dando error"   (aqui dentro)
--   centinelas_latido()   -> "hace horas que no corre ninguno" (desde fuera)
--
-- Asi que se le quita la parte que no le toca. Menos cobertura aparente,
-- cero mentiras — y una alarma que miente es peor que no tenerla.
--
-- Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.centinela_roto(p_tenant_id uuid)
RETURNS TABLE(huella text, titulo text, detalle text, monto numeric, datos jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT
    c.clave,
    format('El centinela "%s" esta fallando', c.titulo),
    format('Reviento en la ronda de las %s y desde entonces no esta vigilando nada. El error: %s',
           to_char(c.ultima_corrida AT TIME ZONE 'America/Santo_Domingo', 'HH12:MI am'),
           left(c.ultimo_error, 200)),
    NULL::numeric,
    jsonb_build_object('centinela', c.clave, 'error', c.ultimo_error,
                       'desde', c.ultima_corrida)
  FROM public.centinelas c
  WHERE c.activo
    AND c.clave <> 'centinela_roto'
    -- SOLO el error. Que el motor entero este caido lo dice el latido,
    -- que se mira desde fuera — desde aqui no se puede saber.
    AND c.ultimo_error IS NOT NULL
    AND p_tenant_id IS NOT NULL;
$fn$;

SELECT public.registrar_migracion('centinela_roto_solo_errores.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT public.correr_centinelas('00000000-0000-0000-0000-000000000001'::uuid) AS corrida;

-- Tiene que quedar en cero: no hay ningun centinela con error.
SELECT count(*) AS acusaciones_falsas
FROM public.centinela_hallazgos
WHERE centinela = 'centinela_roto' AND murio_en IS NULL
  AND tenant_id = '00000000-0000-0000-0000-000000000001';

SELECT public.centinelas_latido() AS latido;
