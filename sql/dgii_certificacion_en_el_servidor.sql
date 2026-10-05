-- =====================================================================
-- CERTIFICACIÓN DGII: LA CORRIDA DEL PASO 4 SE GUARDA EN EL SERVIDOR
-- =====================================================================
-- (05/10/2026) El Paso 4 de D Mario Castro se aprobó desde una PC que se
-- averió. Los XML firmados vivían SOLO en el localStorage de ese navegador,
-- y sin ellos no hay Paso 5 (cada PDF lleva en el QR el código de seguridad
-- y la fecha de firma del e-CF aceptado). Hubo que cancelar la postulación.
--
-- Ahora el ejecutor del Paso 4 guarda también aquí: UNA fila por juego de
-- pruebas (la clave es el primer e-NCF del set) y nunca se pisa con una
-- versión que tenga MENOS casos aceptados. El Paso 5 la trae si al
-- navegador le falta.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.dgii_certificacion_corridas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  paso        text NOT NULL DEFAULT 'paso4',
  set_clave   text NOT NULL,
  casos       jsonb NOT NULL,
  aceptados   integer NOT NULL DEFAULT 0,
  completado  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid,
  UNIQUE (tenant_id, paso, set_clave)
);

ALTER TABLE public.dgii_certificacion_corridas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dgii_cert_corridas_ver ON public.dgii_certificacion_corridas;
CREATE POLICY dgii_cert_corridas_ver ON public.dgii_certificacion_corridas
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());

-- Se escribe solo por la función (que protege de pisar con menos aceptados).
CREATE OR REPLACE FUNCTION public.dgii_cert_guardar_corrida(
  p_set_clave text, p_casos jsonb, p_aceptados integer, p_completado boolean, p_paso text DEFAULT 'paso4')
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_prev integer;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  IF COALESCE(p_set_clave, '') = '' OR jsonb_typeof(p_casos) <> 'array' THEN
    RAISE EXCEPTION 'Corrida inválida';
  END IF;

  SELECT aceptados INTO v_prev FROM public.dgii_certificacion_corridas
   WHERE tenant_id = v_tenant AND paso = COALESCE(p_paso, 'paso4') AND set_clave = p_set_clave;

  IF v_prev IS NOT NULL AND v_prev > COALESCE(p_aceptados, 0) THEN
    RETURN jsonb_build_object('ok', true, 'guardado', false, 'motivo', 'el servidor tiene más aceptados', 'aceptados_servidor', v_prev);
  END IF;

  INSERT INTO public.dgii_certificacion_corridas
    (tenant_id, paso, set_clave, casos, aceptados, completado, updated_by)
  VALUES (v_tenant, COALESCE(p_paso, 'paso4'), p_set_clave, p_casos, COALESCE(p_aceptados, 0), COALESCE(p_completado, false), auth.uid())
  ON CONFLICT (tenant_id, paso, set_clave) DO UPDATE
     SET casos = EXCLUDED.casos, aceptados = EXCLUDED.aceptados,
         completado = EXCLUDED.completado, updated_at = now(), updated_by = auth.uid();

  RETURN jsonb_build_object('ok', true, 'guardado', true);
END $function$;

REVOKE ALL ON FUNCTION public.dgii_cert_guardar_corrida(text, jsonb, integer, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dgii_cert_guardar_corrida(text, jsonb, integer, boolean, text) TO authenticated;
GRANT SELECT ON public.dgii_certificacion_corridas TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('dgii_certificacion_en_el_servidor.sql');
