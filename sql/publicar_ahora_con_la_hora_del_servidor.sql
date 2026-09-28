-- ============================================================
-- PUBLICAR AHORA, CON LA HORA DEL SERVIDOR
-- ============================================================
-- Paso 3 del flujo lineal del Equipo IA (decisión del dueño, 28/09/2026). El
-- formulario tenía cuatro botones —Crear borrador, Confirmar existencia,
-- Aprobar, Programar— y queda en dos: "Publicar ahora" y "Programar". Los
-- tres primeros pasos los da la pantalla sola al pulsar cualquiera de los dos.
--
-- Programar ya existía. "Publicar ahora" no: `promo_programar` exige una hora
-- FUTURA, y el publicador (cron cada minuto) saca lo aprobado cuya hora ya
-- llegó. Mandarle la hora desde el navegador no sirve: con el reloj de la PC
-- un minuto atrasado, "dentro de un minuto" llega al servidor como pasado y
-- revienta con "La hora tiene que ser futura".
--
-- Así que la hora la pone el servidor: se programa a un minuto de SU reloj.
-- Todo lo demás —que sea del dueño, que esté aprobada, que no se publique dos
-- veces, lo bloqueado— lo sigue decidiendo `promo_programar`, que no se toca.
-- Esto es un atajo, no un segundo camino.
--
-- SECURITY INVOKER a propósito: corre como quien la llama, así que
-- `promo_programar` ve al mismo usuario y aplica los mismos permisos.
-- ============================================================

CREATE OR REPLACE FUNCTION public.promo_publicar_ahora(p_bundle_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT public.promo_programar(p_bundle_id, now() + interval '1 minute')
$fn$;

GRANT EXECUTE ON FUNCTION public.promo_publicar_ahora(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('publicar_ahora_con_la_hora_del_servidor.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Un SIMULACRO de punta a punta, como lo hará la pantalla: crear →
-- confirmar existencia → aprobar → publicar ahora. Y se deshace entero antes
-- de terminar: todo va dentro de un bloque que acaba en una excepción
-- provocada, así que la promoción de prueba nunca existe para el publicador
-- (el cron corre en otra transacción y no ve lo que no se confirmó).
--
-- Se comprueba además lo que NO debe pasar: publicar ahora algo sin aprobar
-- tiene que reventar igual que programarlo.
DO $prueba$
DECLARE
  v_informe text;
BEGIN
  BEGIN
    -- Impersonar al dueño de Repuestos Morla.
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object(
      'sub', '0a751661-5ec4-4136-a75c-b4d8493beae0',
      'email', 'admin@repuestosmorla.com', 'role', 'authenticated')::text, true);

    DECLARE
      v_crear    jsonb;
      v_bundle   uuid;
      v_prog     jsonb;
      v_cuando   timestamptz;
      v_estado   text;
      v_revento  boolean := false;
    BEGIN
      v_crear := public.promo_crear(
        'SIMULACRO publicar ahora (se deshace)',
        NULL, 100,
        jsonb_build_object('facebook', 'Prueba a RD$ 100'),
        jsonb_build_object('imagen_feed', 'https://example.com/simulacro.png'),
        jsonb_build_array(jsonb_build_object('platform', 'facebook', 'placement', 'feed')));
      v_bundle := (v_crear ->> 'bundle_id')::uuid;
      IF v_bundle IS NULL THEN
        RAISE EXCEPTION 'FALLO: promo_crear no devolvió bundle: %', v_crear;
      END IF;

      -- Sin aprobar, publicar ahora tiene que negarse.
      BEGIN
        PERFORM public.promo_publicar_ahora(v_bundle);
      EXCEPTION WHEN raise_exception THEN
        v_revento := SQLERRM LIKE '%no está aprobada%';
      END;
      IF NOT v_revento THEN
        RAISE EXCEPTION 'FALLO: publicar ahora dejó pasar una promoción SIN APROBAR.';
      END IF;

      PERFORM public.promo_confirmar_existencia(v_bundle);
      PERFORM public.promo_aprobar(v_bundle);
      v_prog := public.promo_publicar_ahora(v_bundle);

      -- A mirar como sistema: impersonado, la seguridad por empresa podría
      -- taparle las filas y dar un fallo que no es.
      RESET role;
      SELECT max(scheduled_for), max(status) INTO v_cuando, v_estado
        FROM public.hermes_publication_jobs WHERE publication_bundle_id = v_bundle;

      IF v_estado IS DISTINCT FROM 'scheduled' THEN
        RAISE EXCEPTION 'FALLO: el trabajo quedó en "%" y no en scheduled.', v_estado;
      END IF;
      IF v_cuando NOT BETWEEN now() + interval '50 seconds' AND now() + interval '70 seconds' THEN
        RAISE EXCEPTION 'FALLO: quedó programado para % y ahora es %: no es "dentro de un minuto".', v_cuando, now();
      END IF;

      RAISE EXCEPTION 'SIMULACRO_OK: crear → confirmar → aprobar → publicar ahora. Programado a % s. Sin aprobar se negó. Respuesta: %',
        round(extract(epoch FROM v_cuando - now())), v_prog;
    END;
  EXCEPTION WHEN raise_exception THEN
    -- Aquí se deshace todo lo de arriba (promoción, trabajos, auditoría y
    -- la impersonación). Si no fue el OK provocado, es un fallo de verdad.
    IF SQLERRM LIKE 'SIMULACRO_OK:%' THEN
      v_informe := SQLERRM;
    ELSE
      RAISE;
    END IF;
  END;

  RAISE NOTICE '%', v_informe;
END $prueba$;

-- Y que de verdad no quedó nada del simulacro.
SELECT json_build_object(
  'restos_del_simulacro', (SELECT count(*) FROM public.hermes_publication_jobs
                            WHERE title = 'SIMULACRO publicar ahora (se deshace)'),
  'funcion', (SELECT pg_get_function_identity_arguments(p.oid) FROM pg_proc p
                JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.proname = 'promo_publicar_ahora')
) AS r;
