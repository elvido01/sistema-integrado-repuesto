-- =====================================================================
-- SAN en TIEMPO REAL (tarjeta del móvil)
-- ---------------------------------------------------------------------
-- La app móvil se suscribe a los cambios de san / san_pagos para que el
-- progreso se mueva solo cuando alguien registra un pago. Supabase solo
-- emite eventos de las tablas que están en la publicación
-- `supabase_realtime`, y las tablas nuevas NO entran solas.
--
-- La seguridad no cambia: realtime respeta el RLS de cada tabla, así que
-- cada empresa sigue viendo únicamente lo suyo.
-- Idempotente / re-ejecutable.
-- =====================================================================

DO $$
DECLARE t text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'No existe la publicación supabase_realtime; nada que hacer.';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY['san', 'san_pagos'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'Tabla % agregada a supabase_realtime', t;
    ELSE
      RAISE NOTICE 'Tabla % ya estaba en supabase_realtime', t;
    END IF;
  END LOOP;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('san_realtime.sql');
  END IF;
END $$;

-- Verificación: ambas deben aparecer
SELECT tablename AS tabla_en_realtime
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename IN ('san', 'san_pagos')
ORDER BY tablename;
