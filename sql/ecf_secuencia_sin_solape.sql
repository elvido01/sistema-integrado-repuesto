-- =====================================================================
-- Un rango e-NCF nuevo no se monta sobre el autorizado (31/10/2026)
-- ---------------------------------------------------------------------
-- Cada autorización de la DGII trae SU fecha de vencimiento y el sistema
-- guarda una sola. Si un rango nuevo empezaba DENTRO del cargado (ej. E32
-- 1–600 usado hasta 550 y se carga 551–1200), ecf_cargar_secuencia lo
-- juntaba: 551–600 salían con el vencimiento de la autorización nueva y la
-- DGII los puede rechazar.
--
-- Ahora la base lo rechaza, igual que la pantalla (src/lib/ecfSecuencias.js).
-- Se sigue permitiendo:
--   • el rango que sigue (601–1200) o uno más adelante (salta lo que quede);
--   • CORREGIR el cargado: mismo "desde" y otro "hasta" (un tecleo mal),
--     sin bajar de lo ya usado (eso ya lo frenaba).
--
-- Mismos argumentos que la versión viva: CREATE OR REPLACE la reemplaza.
-- Partida: pg_get_functiondef de prod el 31/10/2026; solo se añade el bloque
-- marcado "NUEVO".
-- =====================================================================

CREATE OR REPLACE FUNCTION public.ecf_cargar_secuencia(p_tipo text, p_desde bigint, p_hasta bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_tipo   text := btrim(coalesce(p_tipo, ''));
  v_previo record;
  v_row    public.ecf_secuencias;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'No hay empresa activa.'; END IF;
  IF NOT (public.es_usuario_admin() OR public.is_superadmin()) THEN
    RAISE EXCEPTION 'Solo un administrador de la empresa puede cargar secuencias.';
  END IF;
  IF v_tipo NOT IN ('31','32','33','34','41','43','44','45','46','47') THEN
    RAISE EXCEPTION 'Tipo de e-CF no válido: %', p_tipo;
  END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_desde < 1 OR p_hasta < p_desde OR p_hasta > 9999999999 THEN
    RAISE EXCEPTION 'Rango no válido: "desde" tiene que ser 1 o más y "hasta" igual o mayor que "desde".';
  END IF;

  SELECT * INTO v_previo FROM public.ecf_secuencias
   WHERE tenant_id = v_tenant AND tipo_ecf = v_tipo AND serie = 'E' AND ambiente = 'Produccion'
   FOR UPDATE;

  IF FOUND AND p_hasta <= v_previo.ultimo THEN
    RAISE EXCEPTION 'Ya se usaron los e-NCF hasta el % de E%. El rango nuevo tiene que llegar más allá.',
      v_previo.ultimo, v_tipo;
  END IF;

  -- NUEVO: no montar una autorización sobre otra.
  IF FOUND AND p_desde <> v_previo.desde AND p_desde <= v_previo.hasta THEN
    RAISE EXCEPTION 'E% ya tiene autorizado hasta el %. El rango nuevo tiene que empezar después (o, para corregir el cargado, usar el mismo "desde": %).',
      v_tipo, v_previo.hasta, v_previo.desde;
  END IF;

  INSERT INTO public.ecf_secuencias (tenant_id, tipo_ecf, serie, desde, hasta, ultimo, ambiente, activo)
  VALUES (v_tenant, v_tipo, 'E', p_desde, p_hasta, p_desde - 1, 'Produccion', true)
  ON CONFLICT (tenant_id, tipo_ecf, serie, ambiente) DO UPDATE
     SET desde = EXCLUDED.desde,
         hasta = EXCLUDED.hasta,
         ultimo = greatest(ecf_secuencias.ultimo, EXCLUDED.desde - 1),
         activo = true,
         updated_at = now()
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END
$function$;

SELECT public.registrar_migracion('ecf_secuencia_sin_solape.sql');
