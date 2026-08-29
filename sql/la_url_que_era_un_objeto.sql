-- =====================================================================
-- La url que era un objeto
-- ---------------------------------------------------------------------
-- (2026-08-29) Cuatro imágenes de TikTok tenían guardado, como dirección,
-- el texto literal "[object Object]".
--
-- El culpable, en tt-protobuf.js: un String() sobre `j.url` dando por hecho
-- que era texto. En TikTok ese campo llega a veces como objeto
-- ({url_list:[…], uri:…}) y String() de un objeto no falla — devuelve
-- "[object Object]" tan tranquilo y sigue. Se guardaba, la imagen no se veía
-- nunca, y no había forma de saber por qué: el mensaje decía "[Imagen]" y
-- parecía que simplemente no había llegado.
--
-- >>> LO QUE SE ARREGLA AQUI <<<
--   a) las cuatro filas se dejan en NULL. Un null dice "no la tengo"; la
--      cadena rota hace que la bandeja intente pintar una imagen que no
--      existe y que alguien pierda la tarde buscando el fallo.
--   b) el espejo de TikTok pasa a REPARAR media_url al volver a leer el
--      chat. Estaba en DO NOTHING, asi que una url que llegara bien la
--      segunda vez no entraba nunca: esas cuatro se quedaban rotas para
--      siempre aunque el lector ya estuviera arreglado.
--
-- >>> LO QUE NO SE TOCA, Y POR QUE <<<
-- El resto del ON CONFLICT se queda igual. El nombre de la conversación
-- tiene su propia historia (un lote sin nombre pisó "Juan Motos" y la dejó
-- llamándose 7123456789012345678); aquí solo se añade media_url, y solo
-- hacia arriba: una dirección buena NUNCA se pisa con una vacía.
--
-- Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Fuera la mentira
-- ---------------------------------------------------------------------
UPDATE public.sales_messages
   SET media_url = NULL
 WHERE media_url IS NOT NULL
   AND media_url NOT LIKE 'http%';

-- ---------------------------------------------------------------------
-- 2) Que el espejo pueda reparar
-- ---------------------------------------------------------------------
-- Solo se cambia el ON CONFLICT del INSERT de mensajes. Todo lo demas de
-- omni_mirror_hilo queda como estaba.
DO $arreglo$
DECLARE
  v_src   text;
  v_antes text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'omni_mirror_hilo'
  LIMIT 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'No existe omni_mirror_hilo: nada que arreglar';
  END IF;
  v_antes := v_src;

  -- a) Reparar al re-leer. Estaba en DO NOTHING: una url que llegara bien la
  --    segunda vez no entraba nunca.
  IF position('media_url    = COALESCE' in v_src) = 0 THEN
    IF position('ON CONFLICT (tenant_id, platform, external_message_id) DO NOTHING' in v_src) = 0 THEN
      RAISE EXCEPTION 'omni_mirror_hilo no tiene el DO NOTHING esperado: revisar a mano antes de tocar';
    END IF;
    v_src := replace(
      v_src,
      'ON CONFLICT (tenant_id, platform, external_message_id) DO NOTHING',
      'ON CONFLICT (tenant_id, platform, external_message_id) DO UPDATE SET' || E'\n' ||
      '      media_url    = COALESCE(' || E'\n' ||
      '        CASE WHEN EXCLUDED.media_url LIKE ''http%'' THEN EXCLUDED.media_url END,' || E'\n' ||
      '        CASE WHEN sales_messages.media_url LIKE ''http%'' THEN sales_messages.media_url END)'
    );
  END IF;

  -- b) Y que no entre basura NUEVA. El lector ya no manda objetos, pero la
  --    puerta se cierra en el sitio donde se guarda: es la unica que no
  --    depende de que cada cliente se porte bien.
  IF position('CASE WHEN m ->> ''media_url'' LIKE ''http%''' in v_src) = 0 THEN
    IF position('NULLIF(m ->> ''media_url'', '''')' in v_src) = 0 THEN
      RAISE EXCEPTION 'omni_mirror_hilo no guarda media_url como se esperaba: revisar a mano';
    END IF;
    v_src := replace(
      v_src,
      'NULLIF(m ->> ''media_url'', '''')',
      'CASE WHEN m ->> ''media_url'' LIKE ''http%'' THEN m ->> ''media_url'' END'
    );
  END IF;

  IF v_src = v_antes THEN
    RAISE NOTICE 'omni_mirror_hilo ya estaba arreglada';
  ELSE
    EXECUTE v_src;
  END IF;
END $arreglo$;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('la_url_que_era_un_objeto.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT json_build_object(
  'urls_rotas_que_quedan', (SELECT count(*) FROM public.sales_messages
     WHERE media_url IS NOT NULL AND media_url NOT LIKE 'http%'),
  'imagenes_tiktok', (SELECT json_agg(json_build_object(
       'id', m.id, 'texto', m.message_text, 'media', m.media_url))
     FROM public.sales_messages m
     WHERE m.platform = 'tiktok' AND m.message_type = 'image'),
  'el_espejo_repara', (SELECT position('media_url    = COALESCE' in pg_get_functiondef(p.oid)) > 0
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='omni_mirror_hilo' LIMIT 1)
) AS r;
