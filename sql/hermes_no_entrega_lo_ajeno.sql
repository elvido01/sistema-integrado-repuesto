-- ============================================================
-- HERMES NO ENTREGA TRABAJO AJENO
-- ============================================================
-- Regla del dueño, 30/08/2026:
--
--   "Comercial-Creativo es quien tiene que realizar la foto y todos los
--    creativos de Repuestos Morla. Hermes solo tiene que delegar,
--    supervisar, y entregarme el resultado final."
--
-- La persona ya decía "tú no publicas ni diseñas". No bastó, y el motivo
-- importa: hoy le prohibimos DIBUJAR, y entregó una promoción sin dibujar
-- nada — reutilizó un PNG que ya tenía en disco de un intento anterior
-- (mismo sha256, la base lo reconoció como duplicado). Cumplió la letra.
--
-- Así que la regla no puede hablar de cómo se hace la imagen. Tiene que
-- hablar de QUIÉN la hace. Entregar una promoción está mal aunque no haya
-- que dibujarla, aunque ya estuviera hecha, y aunque quede bien.
--
-- Con la herramienta ya registrada en el gateway, ahora sí tiene con qué
-- obedecer: proponer_encargo_promocion existe y él la ve en su lista.
--
-- Idempotente: no vuelve a añadir el bloque si ya está.
-- ============================================================

UPDATE public.agentes_ia
SET persona = persona || E'\r\n' || E'\r\n' ||
'QUIEN HACE EL TRABAJO CREATIVO' || E'\r\n' ||
'- El Comercial-Creativo hace TODO lo creativo de Repuestos Morla: promociones,' || E'\r\n' ||
'  piezas de arte, copys, historias, publicaciones. Tú no. Nunca.' || E'\r\n' ||
'- Tu papel es otro y es el importante: entender lo que se pide, ENCARGARLO,' || E'\r\n' ||
'  vigilar que salga bien y entregar el resultado. Eso es lo que se te pide.' || E'\r\n' ||
'- Cuando te pidan una promocion, llama a proponer_encargo_promocion con el' || E'\r\n' ||
'  codigo exacto de la pieza. Es tu unica accion valida. Despues di que quedo' || E'\r\n' ||
'  propuesto y que espera la aprobacion en pantalla.' || E'\r\n' ||
'- NO entregues una promocion hecha por ti. Da igual como la hayas conseguido:' || E'\r\n' ||
'  ni dibujada ahora, ni reaprovechando un archivo de antes, ni describiendola' || E'\r\n' ||
'  en texto. Que no tengas que dibujar no la convierte en tuya.' || E'\r\n' ||
'- Y no digas "promocion lista" si no ha pasado por el Comercial-Creativo y por' || E'\r\n' ||
'  la aprobacion del dueno. Hasta entonces no esta lista: esta propuesta.'
WHERE nombre = 'Hermes'
  AND persona NOT LIKE '%QUIEN HACE EL TRABAJO CREATIVO%';

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('hermes_no_entrega_lo_ajeno.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT json_build_object(
 'regla_puesta', (SELECT persona LIKE '%QUIEN HACE EL TRABAJO CREATIVO%'
   FROM public.agentes_ia WHERE nombre = 'Hermes'),
 'sigue_la_vieja', (SELECT persona LIKE '%no publicas ni disenas%'
   OR persona LIKE '%no publicas ni diseñas%'
   FROM public.agentes_ia WHERE nombre = 'Hermes'),
 'nombra_la_herramienta', (SELECT persona LIKE '%proponer_encargo_promocion%'
   FROM public.agentes_ia WHERE nombre = 'Hermes'),
 'largo', (SELECT length(persona) FROM public.agentes_ia WHERE nombre = 'Hermes')
) AS r;
