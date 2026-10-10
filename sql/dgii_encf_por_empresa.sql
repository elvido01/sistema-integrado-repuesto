-- =====================================================================
-- e-NCF CORRELATIVO CON LA EMPRESA EXPLÍCITA (para emitir-fiscal)
-- =====================================================================
-- (10/10/2026) get_next_encf(tipo, ambiente) saca la empresa de
-- get_user_tenant(), es decir, del usuario de la sesión. emitir-fiscal la
-- llama con la service key (sin usuario) y SIEMPRE fallaba con
-- "Sin tenant en sesion": 2,707 intentos de Morla y el único real de D Mario.
-- La emisión real de e-CF nunca funcionó; la certificación va por otro camino.
--
-- Esta versión recibe la empresa. Solo la puede llamar el servidor
-- (service_role): un usuario no puede pedir números de otra empresa.
-- get_next_encf(text, text) se queda igual para quien la use con sesión.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_next_encf_empresa(p_tenant uuid, p_tipo_ecf text, p_ambiente text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_serie   text;
  v_proximo bigint;
  v_hasta   bigint;
BEGIN
  IF p_tenant IS NULL THEN
    RAISE EXCEPTION 'Falta la empresa';
  END IF;

  -- Incremento atómico (bloqueo por fila)
  UPDATE public.ecf_secuencias
     SET ultimo = ultimo + 1,
         updated_at = now()
   WHERE tenant_id = p_tenant
     AND tipo_ecf  = p_tipo_ecf
     AND ambiente  = p_ambiente
     AND activo    = true
   RETURNING ultimo, hasta, serie
     INTO v_proximo, v_hasta, v_serie;

  IF v_proximo IS NULL THEN
    RAISE EXCEPTION 'No hay secuencia activa para tipo % ambiente %. Configura ecf_secuencias primero.',
      p_tipo_ecf, p_ambiente;
  END IF;

  IF v_proximo > v_hasta THEN
    RAISE EXCEPTION 'Secuencia agotada para tipo % (limite %). Solicita un nuevo rango a DGII.',
      p_tipo_ecf, v_hasta;
  END IF;

  RETURN v_serie || p_tipo_ecf || LPAD(v_proximo::text, 10, '0');
END;
$function$;

REVOKE ALL ON FUNCTION public.get_next_encf_empresa(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_encf_empresa(uuid, text, text) TO service_role;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('dgii_encf_por_empresa.sql');
