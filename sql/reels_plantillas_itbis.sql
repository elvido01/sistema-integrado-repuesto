-- =====================================================================
-- REELS: LA PIEZA LLEVA SU ITBIS (para revelar el precio FINAL)
-- =====================================================================
-- (16/10/2026) Los reels ahora rotan entre plantillas de montaje distintas
-- (scripts/armarReel.mjs). "¿Cuánto crees que cuesta?" revela el precio en
-- pantalla, y en Morla el precio de catálogo NO incluye el ITBIS (la botella
-- CG sale a 2,140.01 y el cliente paga 2,525.21). Sin el ITBIS el reel
-- prometería un precio que en el mostrador no es.
--
-- Única diferencia con la versión de producción (leída el 16/10/2026):
-- 'itbis_pct' dentro de 'producto'.
-- =====================================================================

CREATE OR REPLACE FUNCTION hermes.equipo_reel_para(p_mensaje_id uuid, p_claim_token uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_m      record;
  v_w      record;
  v_prod   record;
  v_modelo record;
BEGIN
  SELECT m.id, m.tenant_id, m.claim_token, m.trabajo_id INTO v_m
    FROM public.equipo_mensajes m WHERE m.id = p_mensaje_id;
  IF v_m.id IS NULL OR v_m.claim_token IS DISTINCT FROM p_claim_token THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_w FROM public.equipo_trabajos WHERE id = v_m.trabajo_id;

  -- La pieza, por su código en el pedido (igual que la revisión de Hermes).
  SELECT p.id, p.codigo, p.descripcion, p.precio, p.itbis_pct,
         ma.nombre AS marca,
         NULLIF(public.get_nombres_modelos(p.modelos_ids), '') AS modelos
    INTO v_prod
    FROM public.productos p
    LEFT JOIN public.marcas ma ON ma.id = p.marca_id AND ma.tenant_id = p.tenant_id
   WHERE p.tenant_id = v_m.tenant_id
     AND p.id = public._equipo_producto_de_peticion(v_m.tenant_id, v_w.peticion);
  IF v_prod.id IS NULL THEN RETURN NULL; END IF;

  -- El formato que hace más tiempo que no sale; dentro, un modelo al azar.
  SELECT r.* INTO v_modelo
    FROM public.equipo_reels_modelo r
    LEFT JOIN LATERAL (
      SELECT max(h.created_at) AS ultimo FROM public.equipo_reels_hechos h
       WHERE h.tenant_id = r.tenant_id AND h.formato = r.formato) u ON true
   WHERE r.tenant_id = v_m.tenant_id AND r.estado = 'listo' AND r.receta IS NOT NULL
   ORDER BY u.ultimo NULLS FIRST, random()
   LIMIT 1;
  IF v_modelo.id IS NULL THEN RETURN NULL; END IF;

  RETURN json_build_object(
    'modelo_id', v_modelo.id, 'formato', v_modelo.formato, 'receta', v_modelo.receta,
    'nota_dueno', v_modelo.nota_dueno,
    'producto', json_build_object('id', v_prod.id, 'codigo', v_prod.codigo,
      'descripcion', v_prod.descripcion, 'precio', v_prod.precio, 'itbis_pct', v_prod.itbis_pct,
      'marca', v_prod.marca, 'modelos', v_prod.modelos));
END $function$;

SELECT public.registrar_migracion('reels_plantillas_itbis.sql');
