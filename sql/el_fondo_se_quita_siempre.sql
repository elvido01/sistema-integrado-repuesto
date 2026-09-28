-- ============================================================
-- EL FONDO SE QUITA SIEMPRE
-- ============================================================
-- El 28/09, al devolver la primera pieza del amortiguador, el dueño escribió:
--
--   "siempre debes eliminarle el fondo a la imagen original"
--
-- Ese "siempre" es una regla de la casa, no una nota de un encargo. Hasta
-- ahora viajaba como comentario suelto dentro de una corrección: servía para
-- esa pieza y se perdía en la siguiente, y el dueño tenía que repetirlo cada
-- vez. Las reglas del arte viven en `equipo_criterios` (tipo 'arte'), que es
-- lo que Hermes le pone delante al creativo en cada encargo y lo que usa
-- después para revisar lo que entregó.
--
-- Ya había cinco:
--   10 producto_protagonista · 20 titulo_corto · 30 precio_visible
--   40 marca_presente        · 50 sin_relleno
--
-- Esta entra la PRIMERA (orden 5) porque es lo primero que se le hace a la
-- foto: antes de componer nada hay que recortar el producto de su fondo. Y
-- entra sin ser bloqueante, como las otras cinco de arte: guía al creativo y
-- se la reclama la revisión, pero no tumba una pieza que por lo demás está
-- bien. Los bloqueantes son los de tipo '*' (no inventar, no publicar solo).
--
-- Idempotente: si ya existe, se actualiza el texto y se reactiva.
-- ============================================================

DO $poner$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_texto  text := 'Quítale el fondo a la foto original del producto y móntalo recortado sobre la escena. Nunca se pega el rectángulo de la foto tal cual.';
BEGIN
  UPDATE public.equipo_criterios
     SET texto = v_texto, orden = 5, activo = true, bloqueante = false
   WHERE tenant_id = v_tenant AND tipo = 'arte' AND clave = 'quitar_el_fondo';

  IF NOT FOUND THEN
    INSERT INTO public.equipo_criterios (tenant_id, tipo, clave, texto, bloqueante, orden, activo)
    VALUES (v_tenant, 'arte', 'quitar_el_fondo', v_texto, false, 5, true);
  END IF;
END $poner$;

SELECT public.registrar_migracion('el_fondo_se_quita_siempre.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- No basta con que la fila exista: lo que importa es que LLEGUE al creativo.
-- El encargo de arte lo arma `hermes.equipo_brief_arte`, así que se pide un
-- brief de mentira y se comprueba que la regla va escrita dentro. Una regla
-- guardada que no viaja en el encargo no es una regla, es una fila.
--
-- Se busca "recortado" y NO "fondo": la regla vieja `sin_relleno` ya dice
-- "Fondo liso", así que buscar "fondo" pasaba aunque esta regla no llegara
-- nunca. La primera versión de esta prueba hacía exactamente eso.
DO $prueba$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_brief  text;
  v_n      int;
BEGIN
  SELECT count(*) INTO v_n FROM public.equipo_criterios
   WHERE tenant_id = v_tenant AND tipo = 'arte' AND clave = 'quitar_el_fondo' AND activo;

  IF v_n <> 1 THEN
    RAISE EXCEPTION 'NO QUEDÓ GUARDADA: hay % filas activas de quitar_el_fondo, debía haber 1.', v_n;
  END IF;

  v_brief := hermes.equipo_brief_arte(v_tenant, 'Prepara la promoción de: · PIEZA DE PRUEBA (código ZZZ). Precio de catálogo: RD$ 1.00.');

  IF v_brief IS NULL OR position('recortado' in lower(v_brief)) = 0 THEN
    RAISE EXCEPTION 'LA REGLA NO VIAJA EN EL ENCARGO: equipo_brief_arte no trae quitar_el_fondo. Brief: %', left(coalesce(v_brief, '(nulo)'), 400);
  END IF;

  RAISE NOTICE 'La regla del fondo está guardada y viaja dentro del encargo.';
END $prueba$;

SELECT jsonb_agg(jsonb_build_object('orden', orden, 'clave', clave, 'texto', texto) ORDER BY orden) AS reglas_de_arte
  FROM public.equipo_criterios
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND tipo = 'arte' AND activo;
