-- ============================================================
-- CERRAR UN TRABAJO CIERRA SUS MENSAJES
-- ============================================================
-- La tarjeta de Hermes llevaba días diciendo «Trabajando · Promoción de
-- candado de seguridad». No trabajaba: lo parecía.
--
-- `equipo_panel` calcula el estado de un agente mirando si le quedan mensajes
-- vivos. A Hermes le quedaban cuatro `draft_result` en 'pending' de trabajos
-- cerrados el 31/08 y el 01/09. Y como NO EXISTE ningún worker de Hermes
-- —ni en la nube, que lo excluye a propósito, ni en una máquina— nadie podía
-- tomarlos ni cerrarlos. Se iban a quedar ahí para siempre.
--
-- >>> EL AGUJERO NO ES DE HERMES: ES DE CUALQUIERA <<<
-- Cerrar un trabajo y cerrar sus mensajes eran dos gestos separados, y solo
-- UNO de los caminos hacía los dos:
--
--   · `equipo_trabajo_accion('cancelar')`  · sí los cierra
--   · `equipo_cerrar_al_aprobar`           · solo cierra el del borrador firmado
--   · `equipo_borrador_a_la_mesa`          · no cierra ninguno
--   · un UPDATE a mano desde un script     · ninguno
--
-- Basta cerrar un trabajo por el camino equivocado para dejar un agente
-- pintado de ocupado hasta el fin de los tiempos. Y eso no es cosmético: un
-- agente que parece ocupado es un agente al que no le pides nada.
--
-- Por eso el arreglo no va en las funciones —habría que acordarse en cada una
-- y en la próxima que se escriba— sino en un DISPARADOR sobre la tabla de
-- trabajos. Da igual quién cierre el trabajo y por dónde: sus mensajes se
-- cierran con él.
--
-- >>> 'FAILED' SE QUEDA FUERA, Y ES DELIBERADO <<<
-- Un trabajo que termina en 'failed' NO arrastra sus mensajes. Dos razones:
--
--   1. `equipo_trabajo_accion('reintentar')` revive exactamente los mensajes
--      en 'failed'. Si los cerráramos, el botón de Reintentar dejaría de
--      encontrar nada y no haría nada — en silencio, que es lo peor.
--   2. Un trabajo que fracasó DEBE seguir en rojo en la tarjeta. Esa alarma
--      es correcta: algo se rompió y hay que mirarlo. Apagarla sola sería
--      esconder la avería.
--
-- Cancelar sí los arrastra, porque cancelar es decir «ya no me interesa
-- esto». Completar también. Fracasar, no.
--
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.equipo_cerrar_mensajes_del_trabajo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  -- Reescribir el mismo estado no es cerrar nada.
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NULL;
  END IF;

  -- 'failed' queda fuera a propósito: ver la cabecera.
  IF NEW.estado NOT IN ('completed', 'cancelled') THEN
    RETURN NULL;
  END IF;

  UPDATE public.equipo_mensajes m
     SET status = CASE
                    -- Un fracaso sin resolver no se convierte en un éxito
                    -- porque el trabajo acabara bien por otro lado.
                    WHEN NEW.estado = 'completed' AND m.status <> 'failed'
                      THEN 'completed'
                    ELSE 'cancelled'
                  END
   WHERE m.trabajo_id = NEW.id
     AND m.status IN ('pending', 'claimed', 'processing',
                      'waiting_dependency', 'waiting_approval', 'failed');

  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS trg_equipo_cerrar_mensajes ON public.equipo_trabajos;
CREATE TRIGGER trg_equipo_cerrar_mensajes
AFTER UPDATE OF estado ON public.equipo_trabajos
FOR EACH ROW EXECUTE FUNCTION public.equipo_cerrar_mensajes_del_trabajo();

-- ------------------------------------------------------------
-- LO QUE YA ESTABA COLGANDO
-- ------------------------------------------------------------
-- La regla nueva aplicada hacia atrás, y solo donde el trabajo ya está
-- cerrado. No toca ningún trabajo vivo ni ningún mensaje reintentable.
UPDATE public.equipo_mensajes m
   SET status = CASE
                  WHEN w.estado = 'completed' AND m.status <> 'failed'
                    THEN 'completed'
                  ELSE 'cancelled'
                END
  FROM public.equipo_trabajos w
 WHERE w.id = m.trabajo_id
   AND w.estado IN ('completed', 'cancelled')
   AND m.status IN ('pending', 'claimed', 'processing',
                    'waiting_dependency', 'waiting_approval', 'failed');

SELECT public.registrar_migracion('cerrar_el_trabajo_cierra_sus_mensajes.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Que el disparador exista no prueba que dispare. Se monta el caso real
-- —un mensaje vivo en un trabajo que se cierra— contra producción, y el
-- bloque entero se deshace solo al final: pase o falle, no queda rastro.
DO $prueba$
DECLARE
  v_trab   uuid;
  v_msg    uuid;
  v_antes  text;
  v_estado text;
BEGIN
  -- Un trabajo ya cerrado, con al menos un mensaje, para no tocar nada vivo.
  SELECT w.id, m.id, w.estado INTO v_trab, v_msg, v_estado
  FROM public.equipo_trabajos w
  JOIN public.equipo_mensajes m ON m.trabajo_id = w.id
  WHERE w.estado IN ('completed', 'cancelled')
  ORDER BY w.creado_en DESC
  LIMIT 1;

  IF v_msg IS NULL THEN
    RAISE NOTICE 'No hay con qué probar: ningún trabajo cerrado tiene mensajes.';
    RETURN;
  END IF;

  -- Se le devuelve la vida al mensaje y se reabre el trabajo…
  UPDATE public.equipo_mensajes SET status = 'pending' WHERE id = v_msg;
  UPDATE public.equipo_trabajos SET estado = 'processing' WHERE id = v_trab;

  -- …y ahora se cierra. Aquí es donde tiene que saltar el disparador.
  UPDATE public.equipo_trabajos SET estado = 'cancelled' WHERE id = v_trab;

  SELECT status INTO v_antes FROM public.equipo_mensajes WHERE id = v_msg;

  IF v_antes <> 'cancelled' THEN
    RAISE EXCEPTION 'NO CIERRA: al cancelar el trabajo %, su mensaje quedó en "%". (Esta transacción se deshace sola.)',
      v_trab, v_antes;
  END IF;

  -- Y la otra mitad: un trabajo fallido NO puede arrastrar sus mensajes,
  -- o el botón de Reintentar se queda sin nada que revivir.
  UPDATE public.equipo_mensajes SET status = 'failed' WHERE id = v_msg;
  UPDATE public.equipo_trabajos SET estado = 'processing' WHERE id = v_trab;
  UPDATE public.equipo_trabajos SET estado = 'failed'     WHERE id = v_trab;

  SELECT status INTO v_antes FROM public.equipo_mensajes WHERE id = v_msg;

  IF v_antes <> 'failed' THEN
    RAISE EXCEPTION 'SE PASÓ DE LISTO: un trabajo fallido cerró su mensaje (quedó en "%"). Reintentar se queda sin nada.', v_antes;
  END IF;

  -- Todo bien. Se levanta la excepción a propósito para deshacer el montaje.
  RAISE EXCEPTION 'PRUEBA SUPERADA (esto es rojo a propósito): cerrar arrastra, fallar no. Nada de esto se guardó.';
END $prueba$;
