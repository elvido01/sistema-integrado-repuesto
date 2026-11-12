-- =====================================================================
-- CRM: los avisos salen en MotoFlow, no por Telegram (12/11/2026)
-- ---------------------------------------------------------------------
-- El dueño no quiere depender de otra plataforma. Los dos avisos nuevos
-- del CRM pasan a la campanita de MotoFlow (tabla notificaciones):
--   · 🔥 cliente caliente esperando 15+ min   (tipo 'crm_caliente')
--   · 📊 dónde se te caen las ventas          (tipo 'crm_reporte')
--     lunes: la semana pasada; día 1: el mes pasado.
-- Doble clic en cualquiera abre el Sales Hub.
--
-- crm_avisos_a_motoflow() corre por pg_cron cada 5 minutos y usa las
-- mismas colas de antes (crm_calientes_tomar / crm_reporte_tomar, que ya
-- respetan el horario y no repiten). La función omni-avisos-ventana deja
-- de llamarlas: si las llamara, se las llevaría ella para Telegram.
-- Les llega a los dueños y administradores de la empresa.
-- Idempotente.
-- =====================================================================

-- Una notificación para cada dueño/administrador de la empresa.
CREATE OR REPLACE FUNCTION public._crm_notificar_admins(p_tenant uuid, p_tipo text, p_titulo text, p_mensaje text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
DECLARE v_n integer;
BEGIN
  INSERT INTO public.notificaciones (tenant_id, user_id, tipo, titulo, mensaje)
  SELECT p_tenant, u.user_id, p_tipo, left(p_titulo, 120), p_mensaje
    FROM (SELECT p.id AS user_id FROM public.profiles p
           WHERE p.tenant_id = p_tenant AND p.role IN ('owner', 'admin')
          UNION
          SELECT ue.user_id FROM public.usuarios_empresas ue
           WHERE ue.tenant_id = p_tenant AND ue.rol IN ('owner', 'admin')) u;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $f$;
REVOKE ALL ON FUNCTION public._crm_notificar_admins(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

-- El resumen del embudo en una línea larga (la campanita no hace saltos).
CREATE OR REPLACE FUNCTION public._crm_reporte_texto(a jsonb, b jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $f$
  SELECT CASE WHEN COALESCE((a->>'llegaron')::int, 0) = 0 THEN 'No escribió ningún cliente en el período.' ELSE
    'Escribieron ' || (a->>'llegaron') ||
      CASE WHEN COALESCE((b->>'llegaron')::int, 0) > 0
           THEN ' (' || to_char((a->>'llegaron')::int - (b->>'llegaron')::int, 'FMSG999990') || ' vs. antes)' ELSE '' END ||
    ' · contestados ' || (a->>'contestadas') ||
    ' · pidieron pieza ' || (a->>'preguntaron') ||
    ' · con precio ' || (a->>'cotizados') ||
    ' · compraron ' || (a->>'ganados') ||
      CASE WHEN COALESCE((b->>'llegaron')::int, 0) > 0
           THEN ' (' || to_char((a->>'ganados')::int - (b->>'ganados')::int, 'FMSG999990') || ' vs. antes)' ELSE '' END || '.' ||
    CASE WHEN a->'paso_flojo' IS NOT NULL AND jsonb_typeof(a->'paso_flojo') = 'object'
         THEN ' 🔻 Donde más se cae: ' || lower(a->'paso_flojo'->>'nombre') || ' (' || (a->'paso_flojo'->>'pasaron') ||
              ' de ' || (a->'paso_flojo'->>'base') || ').' ELSE '' END ||
    CASE WHEN a->>'mediana_min' IS NOT NULL
         THEN ' ⏱ Primera respuesta: la mitad en ' ||
              CASE WHEN (a->>'mediana_min')::numeric < 60 THEN (a->>'mediana_min') || ' min'
                   ELSE round((a->>'mediana_min')::numeric / 60) || ' h' END || '.' ELSE '' END ||
    CASE WHEN COALESCE((a->>'no_lo_tenemos')::int, 0) > 0
         THEN ' 📦 ' || (a->>'no_lo_tenemos') || ' se fueron porque no teníamos la pieza.' ELSE '' END ||
    ' Doble clic para abrir el Sales Hub (botón Embudo).'
  END
$f$;

CREATE OR REPLACE FUNCTION public.crm_avisos_a_motoflow()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
DECLARE
  k jsonb; v_tenant uuid; v_que text; v_extra text; v_etapa text;
  v_calientes int := 0; v_reportes int := 0;
BEGIN
  -- 🔥 Cliente caliente esperando
  FOR k IN SELECT * FROM jsonb_array_elements(public.crm_calientes_tomar()) LOOP
    BEGIN
      SELECT tenant_id INTO v_tenant FROM public.sales_conversations WHERE id = (k->>'conversation_id')::uuid;
      v_que := NULLIF(concat_ws(' · ', NULLIF(k->>'producto', ''), NULLIF(k->>'moto', '')), '');
      v_extra := CASE k->>'cuando' WHEN 'hoy' THEN 'lo necesita HOY' WHEN 'esta_semana' THEN 'lo quiere esta semana' END;
      v_etapa := CASE k->>'etapa' WHEN 'listo_para_comprar' THEN 'listo para comprar'
                                  WHEN 'cotizado' THEN 'ya tiene precio'
                                  ELSE COALESCE(k->>'puntaje', '0') || '/100' END;
      PERFORM public._crm_notificar_admins(v_tenant, 'crm_caliente',
        '🔥 Cliente esperando: ' || (k->>'cliente') || ' (' || initcap(k->>'plataforma') || ')',
        'Lleva ' || (k->>'minutos') || ' min sin respuesta (' || v_etapa || ').' ||
        COALESCE(' Busca: ' || v_que || '.', '') ||
        COALESCE(' ' || upper(left(v_extra, 1)) || substr(v_extra, 2) || '.', '') ||
        COALESCE(' Último mensaje: «' || NULLIF(k->>'ultimo', '') || '».', '') ||
        COALESCE(' → ' || NULLIF(k->>'siguiente_paso', ''), ''));
      v_calientes := v_calientes + 1;
    EXCEPTION WHEN OTHERS THEN
      -- No salió: se suelta para la próxima vuelta.
      PERFORM public.crm_calientes_soltar((k->>'conversation_id')::uuid, (k->>'user_msg_at')::timestamptz);
      RAISE WARNING '[crm_avisos_a_motoflow] caliente: %', SQLERRM;
    END;
  END LOOP;

  -- 📊 Dónde se te caen las ventas
  FOR k IN SELECT * FROM jsonb_array_elements(public.crm_reporte_tomar()) LOOP
    BEGIN
      PERFORM public._crm_notificar_admins((k->>'tenant_id')::uuid, 'crm_reporte',
        CASE k->>'periodo' WHEN 'mes' THEN '📊 Tu mes en el CRM' ELSE '📊 Tu semana en el CRM' END,
        public._crm_reporte_texto(k->'actual', k->'anterior'));
      v_reportes := v_reportes + 1;
    EXCEPTION WHEN OTHERS THEN
      PERFORM public.crm_reporte_soltar((k->>'tenant_id')::uuid, k->>'periodo', (k->>'desde')::date);
      RAISE WARNING '[crm_avisos_a_motoflow] reporte: %', SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object('calientes', v_calientes, 'reportes', v_reportes);
END $f$;
REVOKE ALL ON FUNCTION public.crm_avisos_a_motoflow() FROM PUBLIC, anon, authenticated;

-- Cada 5 minutos (el horario lo cuidan las colas: 8 am–8 pm / 8 am–10 pm RD).
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'crm-avisos-motoflow';
SELECT cron.schedule('crm-avisos-motoflow', '*/5 * * * *', $$SELECT public.crm_avisos_a_motoflow()$$);

-- Prueba: cómo se leería el reporte de los últimos 7 días (no avisa a nadie).
SELECT ce.nombre,
       public._crm_reporte_texto(
         public.crm_reporte_embudo(ce.tenant_id, now() - interval '7 days', now()),
         public.crm_reporte_embudo(ce.tenant_id, now() - interval '14 days', now() - interval '7 days')) AS asi_se_leeria
  FROM public.config_empresa ce WHERE ce.feat_clasificador_crm;

SELECT registrar_migracion('crm_avisos_a_motoflow.sql');
