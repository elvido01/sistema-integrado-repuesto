-- =====================================================================
-- Centenario: últimos restos de las pruebas (17/11/2026)
-- ---------------------------------------------------------------------
-- Después de colegio_prueba_borrar_ventas.sql y colegio_prueba_borrar_v2.sql:
--   · El año escolar 2027-2028 que creó solo la prueba de "Reservar cupo"
--     (08/11). Se borra solo si nada lo usa (cargos, notas, tareas…); el
--     real se crea solo cuando se reserve el primer cupo o en el cambio de
--     año, con la configuración de ese momento.
--   · Las 3 búsquedas del catálogo de la venta de prueba ("POLOCHE", "PA").
-- Solo el COLEGIO CON INGLÉS NUEVO CENTENARIO. El 2026-2027 no se toca.
-- =====================================================================

DELETE FROM public.edu_anios a
 WHERE a.tenant_id = '8bcd59ef-9502-486c-b919-c77b991387bb'
   AND a.nombre = '2027-2028' AND NOT a.actual
   AND NOT EXISTS (SELECT 1 FROM public.edu_cargos x WHERE x.anio_id = a.id)
   AND NOT EXISTS (SELECT 1 FROM public.edu_notas x WHERE x.anio_id = a.id)
   AND NOT EXISTS (SELECT 1 FROM public.edu_notas_recuperacion x WHERE x.anio_id = a.id)
   AND NOT EXISTS (SELECT 1 FROM public.edu_grupos_maestro x WHERE x.anio_id = a.id)
   AND NOT EXISTS (SELECT 1 FROM public.edu_tareas x WHERE x.anio_id = a.id)
   AND NOT EXISTS (SELECT 1 FROM public.edu_notas_publicadas x WHERE x.anio_id = a.id);

DELETE FROM public.busquedas_catalogo
 WHERE tenant_id = '8bcd59ef-9502-486c-b919-c77b991387bb'
   AND creado_en < '2026-11-09' AND id IN (7588, 7589, 7590);

SELECT public.registrar_migracion('colegio_prueba_borrar_restos.sql');
