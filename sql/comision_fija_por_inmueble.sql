-- =====================================================================
-- COMISIÓN FIJA POR INMUEBLE VENDIDO (28/10/2026)
-- ---------------------------------------------------------------------
-- La comisión "monto fijo por unidad" contaba solo VEHÍCULOS (producto con
-- chasis o de tipo motocicleta). Una inmobiliaria paga por solar/propiedad
-- vendida: ahora también cuenta como unidad la línea cuyo producto está
-- marcado como INMUEBLE (productos.naturaleza, ver
-- sql/tipos_empresa_servicios_inmobiliaria.sql). Para Caminero no cambia
-- nada: sus motos no son inmuebles.
-- Se parte de la función EN PRODUCCIÓN y se agrega una condición. Idempotente.
-- =====================================================================
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.calcular_comisiones_vendedor(uuid,date,date)'::regprocedure);
  IF position($x$p.naturaleza = 'inmueble'$x$ IN d) > 0 THEN RETURN; END IF;
  n := replace(d, $x$AND (COALESCE(btrim(p.chasis), '') <> ''$x$,
                  $x$AND (p.naturaleza = 'inmueble' OR COALESCE(btrim(p.chasis), '') <> ''$x$);
  IF n = d THEN RAISE EXCEPTION 'calcular_comisiones_vendedor cambió: no se pudo agregar el inmueble'; END IF;
  EXECUTE n;
END $$;

SELECT public.registrar_migracion('comision_fija_por_inmueble.sql');
