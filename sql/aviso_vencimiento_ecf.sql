-- =====================================================================
-- Aviso: las secuencias e-CF están por vencer (21/11/2026)
-- ---------------------------------------------------------------------
-- La fecha de vencimiento de las secuencias es la de la autorización de la
-- DGII (integraciones_fiscales.config.fecha_vencimiento_secuencia) y va
-- dentro de cada e-CF: NO se cambia sola el 1 de enero (las autorizadas en
-- un año vencen el 31-12 del siguiente, y vencidas hay que pedir nuevas).
-- Lo que sí hace falta es avisar ANTES, para pedir las nuevas a tiempo.
--
-- Cada mañana, a dueños y administradores de las empresas en Producción:
-- a los 45, 30, 15, 7, 3 y 1 día, el día que vence y cada semana después
-- de vencida (hasta 8 semanas). Campanita + correo. Una vez por día.
-- =====================================================================
BEGIN;

-- El correo también sale para este aviso (antes: solo inactividad/pausa).
CREATE OR REPLACE FUNCTION private._avisar_admins(p_tenant uuid, p_tipo text, p_titulo text, p_mensaje text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE v_empresa text;
BEGIN
  INSERT INTO public.notificaciones (tenant_id, user_id, tipo, titulo, mensaje)
  SELECT p_tenant, u.user_id, p_tipo, left(p_titulo, 120), p_mensaje
    FROM (SELECT p.id AS user_id FROM public.profiles p WHERE p.tenant_id = p_tenant AND p.role IN ('owner', 'admin')
          UNION
          SELECT ue.user_id FROM public.usuarios_empresas ue WHERE ue.tenant_id = p_tenant AND ue.rol IN ('owner', 'admin')) u;

  IF p_tipo IN ('aviso_inactividad', 'empresa_pausada', 'ecf_vencimiento') THEN
    SELECT nombre INTO v_empresa FROM public.tenants WHERE id = p_tenant;
    INSERT INTO public.correos_pendientes (para, asunto, html, tipo, empresa_id)
    SELECT DISTINCT lower(au.email), left(p_titulo, 150), private._html_aviso(p_titulo, p_mensaje, v_empresa), p_tipo, p_tenant
      FROM (SELECT p.id AS user_id FROM public.profiles p WHERE p.tenant_id = p_tenant AND p.role IN ('owner', 'admin')
            UNION
            SELECT ue.user_id FROM public.usuarios_empresas ue WHERE ue.tenant_id = p_tenant AND ue.rol IN ('owner', 'admin')) u
      JOIN auth.users au ON au.id = u.user_id
     WHERE au.email IS NOT NULL
       AND au.email LIKE '%@%.%'
       AND au.email NOT ILIKE '%@usuario.motoflow.app'
       AND au.email NOT ILIKE '%.invalid'
       AND au.banned_until IS NULL;
  END IF;
END $function$;
REVOKE ALL ON FUNCTION private._avisar_admins(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private._aviso_vencimiento_ecf()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_hoy   date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  r       record;
  v_vence date;
  v_dias  integer;
  v_tit   text;
  v_msg   text;
  v_n     integer := 0;
BEGIN
  -- Solo integraciones encendidas en producción de empresas activas.
  FOR r IN
    SELECT i.tenant_id, i.config->>'fecha_vencimiento_secuencia' AS fecha,
           COALESCE(NULLIF(btrim(c.nombre), ''), t.nombre, 'tu empresa') AS empresa
      FROM public.integraciones_fiscales i
      JOIN public.tenants t ON t.id = i.tenant_id
      LEFT JOIN public.config_empresa c ON c.tenant_id = i.tenant_id
     WHERE i.proveedor = 'dgii_directo'
       AND i.activo
       AND i.modo = 'produccion'
       AND i.config->>'ambiente' = 'Produccion'
       AND COALESCE(t.activo, true)
       AND (i.config->>'fecha_vencimiento_secuencia') ~ '^\d{2}-\d{2}-\d{4}$'
  LOOP
    BEGIN
      v_vence := to_date(r.fecha, 'DD-MM-YYYY');
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
    v_dias := v_vence - v_hoy;
    IF NOT (
         v_dias IN (45, 30, 15, 7, 3, 1, 0)
      OR (v_dias < 0 AND v_dias >= -56 AND (-v_dias) % 7 = 0)
      -- Primer aviso de esa fecha aunque no sea día de escalón (una empresa
      -- que ya estaba dentro de los 45 días, o un día que no corrió).
      OR (v_dias BETWEEN 0 AND 45 AND NOT EXISTS (
            SELECT 1 FROM public.notificaciones n
             WHERE n.tenant_id = r.tenant_id AND n.tipo = 'ecf_vencimiento' AND n.titulo LIKE '%' || r.fecha || '%'))
    ) THEN
      CONTINUE;
    END IF;
    -- Una vez por día y por empresa.
    IF EXISTS (SELECT 1 FROM public.notificaciones n
                WHERE n.tenant_id = r.tenant_id AND n.tipo = 'ecf_vencimiento'
                  AND (n.created_at AT TIME ZONE 'America/Santo_Domingo')::date = v_hoy) THEN
      CONTINUE;
    END IF;

    -- Sin dueño ni administrador no hay a quién avisar: no se cuenta.
    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.tenant_id = r.tenant_id AND p.role IN ('owner', 'admin'))
       AND NOT EXISTS (SELECT 1 FROM public.usuarios_empresas ue WHERE ue.tenant_id = r.tenant_id AND ue.rol IN ('owner', 'admin')) THEN
      CONTINUE;
    END IF;

    -- Con el nombre de la empresa: quien administra varias sabe cuál es.
    IF v_dias > 1 THEN
      v_tit := format('%s: las secuencias e-CF vencen en %s días (%s)', r.empresa, v_dias, r.fecha);
    ELSIF v_dias = 1 THEN
      v_tit := format('%s: las secuencias e-CF vencen MAÑANA (%s)', r.empresa, r.fecha);
    ELSIF v_dias = 0 THEN
      v_tit := format('%s: las secuencias e-CF vencen HOY (%s)', r.empresa, r.fecha);
    ELSE
      v_tit := format('%s: las secuencias e-CF VENCIERON el %s', r.empresa, r.fecha);
    END IF;
    v_msg := CASE WHEN v_dias >= 0 THEN
        'Pide las secuencias nuevas en la Oficina Virtual de la DGII (Solicitudes → Comprobantes Fiscales) antes de esa fecha. '
        || 'Cuando te las aprueben, cárgalas en MotoFlow (Configuración del Sistema → Facturación electrónica) y pon allí la '
        || '«Fecha Vencimiento» nueva que trae la autorización. Después de vencidas, la DGII rechaza las facturas.'
      ELSE
        'Desde el ' || r.fecha || ' la DGII rechaza las facturas con esas secuencias. Pide secuencias nuevas en la Oficina '
        || 'Virtual (Solicitudes → Comprobantes Fiscales) y, cuando te las aprueben, cárgalas en MotoFlow con su «Fecha Vencimiento» nueva.'
      END;
    PERFORM private._avisar_admins(r.tenant_id, 'ecf_vencimiento', v_tit, v_msg);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION private._aviso_vencimiento_ecf() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('ecf-vencimiento') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ecf-vencimiento');
SELECT cron.schedule('ecf-vencimiento', '20 12 * * *', 'SELECT private._aviso_vencimiento_ecf()');

COMMIT;

SELECT public.registrar_migracion('aviso_vencimiento_ecf.sql');
