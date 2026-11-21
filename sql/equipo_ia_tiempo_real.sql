-- =====================================================================
-- Equipo IA en tiempo real (21/11/2026)
-- ---------------------------------------------------------------------
-- El dueño: "el módulo no se está actualizando en tiempo real". La página
-- se suscribe a equipo_trabajos, equipo_mensajes y equipo_aprobaciones
-- (y ahora a equipo_auto_elegidas), pero ninguna estaba en la publicación
-- supabase_realtime: la suscripción nunca recibía nada y la pantalla solo
-- cambiaba al recargar. Las cuatro tienen RLS, así que cada quien recibe
-- solo los cambios de su empresa.
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['equipo_trabajos', 'equipo_mensajes', 'equipo_aprobaciones', 'equipo_auto_elegidas'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

SELECT public.registrar_migracion('equipo_ia_tiempo_real.sql');
