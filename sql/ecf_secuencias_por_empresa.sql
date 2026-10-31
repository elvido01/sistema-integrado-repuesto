-- >>> AVISO (31/10/2026): ecf_cargar_secuencia de este archivo es VIEJA. <<<
-- La viva es sql/ecf_secuencia_sin_solape.sql (no deja montar un rango sobre
-- otro). Correr este archivo entero la degradaría sin dar error.
-- =====================================================================
-- SECUENCIAS e-NCF: CADA EMPRESA CARGA LAS SUYAS
-- =====================================================================
-- (13/10/2026) Al certificarse, la empresa pide sus rangos (E31, E32, E34…)
-- en la Oficina Virtual de la DGII. Hasta hoy se cargaban a mano en la base
-- (D Mario). Ahora lo hace el administrador de la empresa en
-- Configuración → DGII → "Secuencias e-NCF autorizadas".
--
-- ecf_cargar_secuencia(p_tipo, p_desde, p_hasta)
--   · Solo administradores de la empresa activa; siempre ambiente Produccion.
--   · Tipos: 31, 32, 33, 34, 41, 43, 44, 45, 46, 47.
--   · Rango nuevo para un tipo que ya existe (la DGII autorizó más):
--     reemplaza desde/hasta, pero el contador NUNCA retrocede: el próximo
--     número es el mayor entre "lo ya usado + 1" y "desde". Nunca se repite
--     un e-NCF.
--   · No se puede poner un "hasta" menor que lo ya usado.
-- ecf_secuencias_mias(): lo que tiene cargado la empresa (con cuántos quedan).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.ecf_cargar_secuencia(p_tipo text, p_desde bigint, p_hasta bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
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
$fn$;

CREATE OR REPLACE FUNCTION public.ecf_secuencias_mias()
RETURNS TABLE (tipo_ecf text, desde bigint, hasta bigint, ultimo bigint, quedan bigint, activo boolean, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT s.tipo_ecf, s.desde::bigint, s.hasta::bigint, s.ultimo::bigint,
         greatest(s.hasta - s.ultimo, 0)::bigint, s.activo, s.updated_at
    FROM public.ecf_secuencias s
   WHERE s.tenant_id = public.get_user_tenant() AND s.ambiente = 'Produccion'
   ORDER BY s.tipo_ecf
$fn$;

REVOKE ALL ON FUNCTION public.ecf_cargar_secuencia(text, bigint, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ecf_secuencias_mias() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ecf_cargar_secuencia(text, bigint, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ecf_secuencias_mias() TO authenticated;

SELECT public.registrar_migracion('ecf_secuencias_por_empresa.sql');
