-- =====================================================================
-- CRM: el seguimiento de "precio sin respuesta" avisa DENTRO de MotoFlow
-- (12/11/2026)
-- ---------------------------------------------------------------------
-- El paso más flojo del embudo de Morla es CERRAR después del precio
-- (15 compras de 43 con precio en 30 días). El sistema ya crea solo un
-- seguimiento cuando se dio precio y el cliente calló 18 h
-- (crm_seguimientos_automaticos, cada hora), pero nadie se enteraba.
--
-- El dueño no quiere depender de otra plataforma (Telegram): el aviso sale
-- en la campanita de MotoFlow y se trabaja en "Seguimientos de Hoy", que
-- ahora trae el mensaje listo para copiar o abrir en WhatsApp.
--
-- · Trigger en crm_seguimiento: al nacer uno automático en
--   'precio_enviado', una notificación (tipo 'crm_seguimiento') a los
--   dueños/administradores de la empresa.
-- · No repite: si ese usuario ya tiene un aviso igual (mismo cliente) en
--   las últimas 24 h, no se crea otro (el espejo a veces duplica el chat).
-- · Si algo falla al avisar, el seguimiento se crea igual (el aviso nunca
--   tumba el seguimiento).
-- Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public._crm_seguimiento_avisar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $f$
DECLARE
  v_titulo text;
  v_precio text;
BEGIN
  IF NEW.creado_por IS DISTINCT FROM 'auto' OR NEW.estado IS DISTINCT FROM 'precio_enviado' THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_titulo := left('🔁 Dale seguimiento: ' || COALESCE(NULLIF(btrim(NEW.cliente_nombre), ''), 'un cliente'), 120);
    v_precio := left(substring(NEW.notas FROM '«(.*)»'), 120);

    INSERT INTO public.notificaciones (tenant_id, user_id, tipo, titulo, mensaje)
    SELECT NEW.tenant_id, u.user_id, 'crm_seguimiento', v_titulo,
           'Le diste precio' || COALESCE(' («' || v_precio || '»)', '') ||
           ' y no volvió a escribir. Doble clic para abrir Seguimientos de Hoy: ahí está el mensaje listo para mandarle.'
      FROM (SELECT p.id AS user_id FROM public.profiles p
             WHERE p.tenant_id = NEW.tenant_id AND p.role IN ('owner', 'admin')
            UNION
            SELECT ue.user_id FROM public.usuarios_empresas ue
             WHERE ue.tenant_id = NEW.tenant_id AND ue.rol IN ('owner', 'admin')) u
     WHERE NOT EXISTS (SELECT 1 FROM public.notificaciones n
                        WHERE n.user_id = u.user_id AND n.tenant_id = NEW.tenant_id
                          AND n.tipo = 'crm_seguimiento' AND n.titulo = v_titulo
                          AND n.created_at > now() - interval '24 hours');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[crm_seguimiento_avisar] %', SQLERRM;   -- el aviso nunca tumba el seguimiento
  END;
  RETURN NEW;
END $f$;

DROP TRIGGER IF EXISTS crm_seguimiento_avisar_trg ON public.crm_seguimiento;
CREATE TRIGGER crm_seguimiento_avisar_trg
  AFTER INSERT ON public.crm_seguimiento
  FOR EACH ROW EXECUTE FUNCTION public._crm_seguimiento_avisar();

-- Prueba: los seguimientos automáticos abiertos que hay hoy (solo mira).
SELECT count(*) AS seguimientos_auto_abiertos
  FROM public.crm_seguimiento WHERE creado_por = 'auto' AND estado = 'precio_enviado';

SELECT registrar_migracion('crm_seguimiento_en_motoflow.sql');
