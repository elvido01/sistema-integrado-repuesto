-- ============================================================
-- DGII: LA RAZÓN SOCIAL DEL EMISOR SALE DEL REGISTRO DE LA DGII (23/11/2026)
-- ============================================================
-- Repuestos Aponte no pasó el Paso 5 de la certificación: "La Razón Social
-- debe corresponder al RNC". Su RNC es la cédula 02800758944 de ISRAEL
-- APONTE MARTINEZ (persona física) y el formulario tenía "REPUESTOS
-- APONTE", el nombre del negocio. Repuestos Morla es igual (persona física
-- con nombre comercial). Al comparar con dgii_contribuyentes, 7 de 13 empresas
-- tenían el nombre distinto (BRIMAR y GRUPO YCAST ya en producción).
--
-- Regla: al guardar la configuración fiscal (integraciones_fiscales.config),
-- si el RNC está en el listado de la DGII:
--   * nombre_emisor (RazonSocialEmisor del e-CF) = la razón social registrada.
--   * lo que se había escrito como razón social pasa a nombre_comercial si
--     este estaba vacío (el negocio sigue saliendo con su nombre).
--   * tipo_persona = 'fisica' (cédula, 11 dígitos) o 'juridica' (RNC, 9).
-- Si el RNC no está en el listado, no se toca el nombre (empresa recién
-- registrada; el listado se recarga cada semana).
-- ============================================================

SELECT public.registrar_migracion('dgii_razon_social_del_registro.sql');

-- Para el formulario: qué dice la DGII de este RNC.
CREATE OR REPLACE FUNCTION public.dgii_emisor_registrado(p_rnc text)
RETURNS TABLE(rnc text, razon_social text, nombre_comercial text, estado text, tipo_persona text)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $fn$
  SELECT d.rnc, d.razon_social, d.nombre_comercial, d.estado,
         CASE WHEN length(d.rnc) = 11 THEN 'fisica' ELSE 'juridica' END
    FROM public.dgii_contribuyentes d
   WHERE d.rnc = regexp_replace(COALESCE(p_rnc, ''), '\D', '', 'g')
   LIMIT 1;  -- rnc es la llave primaria: una fila como máximo
$fn$;
REVOKE EXECUTE ON FUNCTION public.dgii_emisor_registrado(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dgii_emisor_registrado(text) TO authenticated;

CREATE OR REPLACE FUNCTION private.dgii_emisor_razon_del_registro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_rnc text := regexp_replace(COALESCE(NEW.config->>'rnc_emisor', ''), '\D', '', 'g');
  v_reg public.dgii_contribuyentes%ROWTYPE;
  v_escrito text := btrim(COALESCE(NEW.config->>'nombre_emisor', ''));
BEGIN
  IF NEW.config IS NULL OR v_rnc = '' THEN RETURN NEW; END IF;

  NEW.config := NEW.config || jsonb_build_object('tipo_persona',
    CASE WHEN length(v_rnc) = 11 THEN 'fisica' ELSE 'juridica' END);

  SELECT * INTO v_reg FROM public.dgii_contribuyentes d WHERE d.rnc = v_rnc;
  IF NOT FOUND OR btrim(COALESCE(v_reg.razon_social, '')) = '' THEN RETURN NEW; END IF;

  IF v_escrito <> '' AND v_escrito <> v_reg.razon_social
     AND btrim(COALESCE(NEW.config->>'nombre_comercial', '')) = '' THEN
    NEW.config := NEW.config || jsonb_build_object('nombre_comercial', v_escrito);
  END IF;

  NEW.config := NEW.config || jsonb_build_object(
    'nombre_emisor', btrim(v_reg.razon_social),
    'razon_social_registro_dgii', true);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_dgii_emisor_razon_del_registro ON public.integraciones_fiscales;
CREATE TRIGGER trg_dgii_emisor_razon_del_registro
  BEFORE INSERT OR UPDATE OF config ON public.integraciones_fiscales
  FOR EACH ROW EXECUTE FUNCTION private.dgii_emisor_razon_del_registro();

-- Las que ya están: el trigger corrige el nombre al "re-guardar".
UPDATE public.integraciones_fiscales SET config = config
 WHERE proveedor = 'dgii_directo' AND config ? 'rnc_emisor';

NOTIFY pgrst, 'reload schema';

-- PRUEBA
DO $prueba$
DECLARE v_mal int; r record;
BEGIN
  SELECT config->>'nombre_emisor' razon, config->>'nombre_comercial' comercial, config->>'tipo_persona' tp INTO r
    FROM public.integraciones_fiscales WHERE tenant_id = 'bd97aba4-a0a1-45ce-884f-29dc26e2785e' AND proveedor = 'dgii_directo';
  IF r.razon <> 'ISRAEL APONTE MARTINEZ' OR r.comercial <> 'REPUESTOS APONTE' OR r.tp <> 'fisica' THEN
    RAISE EXCEPTION 'Aponte quedó mal: % / % / %', r.razon, r.comercial, r.tp;
  END IF;

  SELECT count(*) INTO v_mal FROM public.integraciones_fiscales i
    JOIN public.dgii_contribuyentes d ON d.rnc = regexp_replace(i.config->>'rnc_emisor', '\D', '', 'g')
   WHERE i.config->>'nombre_emisor' IS DISTINCT FROM btrim(d.razon_social);
  IF v_mal > 0 THEN RAISE EXCEPTION '% empresas siguen con la razón social distinta al registro', v_mal; END IF;

  -- Ninguna quedó sin nombre comercial (el negocio sigue saliendo con su nombre)
  SELECT count(*) INTO v_mal FROM public.integraciones_fiscales
   WHERE proveedor = 'dgii_directo' AND config ? 'rnc_emisor' AND btrim(COALESCE(config->>'nombre_comercial', '')) = '';
  IF v_mal > 0 THEN RAISE EXCEPTION '% empresas sin nombre comercial', v_mal; END IF;

  -- Un RNC que no está en el listado no se toca
  PERFORM 1 FROM public.dgii_emisor_registrado('02800758944') WHERE tipo_persona = 'fisica';
  IF NOT FOUND THEN RAISE EXCEPTION 'dgii_emisor_registrado no encontró a Aponte'; END IF;
END $prueba$;

SELECT (SELECT to_jsonb(t)->>'nombre' FROM public.tenants t WHERE t.id = i.tenant_id) empresa,
       i.config->>'tipo_persona' tipo, i.config->>'nombre_emisor' razon_social, i.config->>'nombre_comercial' nombre_comercial
  FROM public.integraciones_fiscales i WHERE proveedor = 'dgii_directo' ORDER BY 1;
