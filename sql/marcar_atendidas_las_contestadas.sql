-- Las que ya se contestaron dejan de decir "nuevo".
--
-- >>> POR QUE <<<
-- (2026-08-19) seguimiento_ventas.sql hizo que el estado de una conversacion
-- se mueva solo al contestar, pero eso solo vale de aqui en adelante: las que
-- ya estaban contestadas seguian diciendo 'nuevo'. De 207 conversaciones, 202
-- estaban en 'nuevo' y 166 de ellas YA tenian respuesta nuestra.
--
-- Con ese ruido, 'nuevo' no significaba nada. Y lo que hace util ese estado es
-- justo lo contrario: que quede en 'nuevo' SOLO lo que nadie ha tocado.
--
-- >>> LO QUE NO SE TOCA <<<
-- Las 35 de WhatsApp que nunca recibieron respuesta se quedan en 'nuevo'. Esas
-- son las de verdad, y son las que hay que mirar: gente que escribio y a la
-- que nunca se le contesto.
--
-- Tampoco se tocan las 8 que ya tenian un estado puesto a mano (cotizando,
-- seguimiento, ...): una decision de una persona no se pisa con un UPDATE
-- masivo.
--
--   instagram    9 se marcan     0 quedan en nuevo
--   whatsapp   157 se marcan    35 quedan en nuevo
--
-- Autorizado por el dueno: "si ya estan marcadas con respuestas dejalas
-- marcadas como leidas".
--
-- No toca dinero. Solo el estado de presentacion del hilo.

UPDATE public.sales_conversations
   SET status = 'en_atencion',
       updated_at = now()
 WHERE status = 'nuevo'
   AND last_agent_message_at IS NOT NULL;

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Lo que importa: que no quede ninguna contestada diciendo 'nuevo', y que
-- las que nunca se contestaron sigan ahi.
SELECT
  count(*) FILTER (WHERE status = 'nuevo' AND last_agent_message_at IS NOT NULL) AS contestadas_en_nuevo,
  count(*) FILTER (WHERE status = 'nuevo' AND last_agent_message_at IS NULL)     AS nunca_contestadas,
  count(*) FILTER (WHERE status = 'en_atencion')                                 AS en_atencion,
  count(*)                                                                        AS total,
  CASE WHEN count(*) FILTER (WHERE status = 'nuevo' AND last_agent_message_at IS NOT NULL) = 0
       THEN 'OK  nuevo ya significa que nadie la ha tocado'
       ELSE '*** FALLO *** quedaron contestadas en nuevo' END                     AS veredicto
FROM public.sales_conversations;

SELECT public.registrar_migracion('marcar_atendidas_las_contestadas.sql');
