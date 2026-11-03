-- ════════════════════════════════════════════════════════════════════
-- Gasto con fecha anterior: pide la clave de un administrador (03/11/2026)
-- ════════════════════════════════════════════════════════════════════
-- MotoPréstamos: el 02/11 faltó un gasto (PAGO AGUA DIEGO, RD$2,500).
-- El dueño pidió que se pueda guardar un gasto con fecha anterior, siempre
-- que lo autorice la clave de un administrador.
-- Hasta hoy el campo Fecha aceptaba cualquier día sin preguntar nada.
--
-- Regla (en el servidor, no se puede saltar desde el navegador):
--   - Fecha de hoy o futura: igual que siempre.
--   - Fecha anterior a hoy (hora de Santo Domingo), al CREAR un gasto, al
--     CAMBIARLE la fecha a un día pasado, o al SACAR un gasto de un día
--     pasado (moverlo a otra fecha):
--       · lo hace un administrador de la empresa activa (usuarios_empresas
--         rol admin/owner, o el perfil admin de esa empresa) o un
--         super-admin → pasa sin clave;
--       · cualquier otro usuario → necesita una autorización vigente,
--         sacada con la clave de un administrador de la empresa
--         (autorizar_gasto_fecha_anterior). Vale para UN guardado, en los
--         próximos 10 minutos, solo para ese usuario, esa empresa y esa
--         fecha (al sacar un gasto de un día pasado, la fecha es ese día).
--   - Si falta la clave, el error lleva el código P0G01: la pantalla lo
--     reconoce y abre el cuadro para escribirla.
--   - Sin usuario (procesos del servidor, migraciones): no se toca.
-- Las funciones de nómina y comisiones graban con la fecha de hoy: no les
-- afecta.
-- Cada autorización queda guardada (quién pidió, qué administrador
-- autorizó, para qué fecha). También se guardan las claves equivocadas:
-- con 5 fallos en 10 minutos se bloquea el usuario un rato.
-- ════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.gasto_fecha_autorizaciones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  usuario_id     uuid NOT NULL,
  fecha          date NOT NULL,
  autorizado_por uuid,              -- NULL = clave equivocada (intento fallido)
  ok             boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  expira_at      timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  -- Una autorización = un guardado. Se marca al usarla; dentro de esa misma
  -- transacción sirve para todas sus filas (terceros graba varias de golpe).
  usada_txid     bigint,
  usada_at       timestamptz
);
CREATE INDEX IF NOT EXISTS idx_gasto_fecha_aut_usuario
  ON public.gasto_fecha_autorizaciones (usuario_id, created_at);

-- Solo se toca a través de las funciones de abajo.
ALTER TABLE public.gasto_fecha_autorizaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gasto_fecha_autorizaciones FROM PUBLIC, anon, authenticated;

ALTER TABLE public.gastos_diarios
  ADD COLUMN IF NOT EXISTS autorizacion_fecha_id uuid
  REFERENCES public.gasto_fecha_autorizaciones(id) ON DELETE SET NULL;

-- ¿Es administrador de esa empresa?
CREATE OR REPLACE FUNCTION public._es_admin_empresa(p_user uuid, p_tenant uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p_user IS NOT NULL AND p_tenant IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.usuarios_empresas ue
             WHERE ue.user_id = p_user AND ue.tenant_id = p_tenant AND ue.rol IN ('admin', 'owner'))
    OR EXISTS (SELECT 1 FROM public.profiles pr
                WHERE pr.id = p_user
                  AND (COALESCE(pr.is_superadmin, false)
                       OR (pr.tenant_id = p_tenant AND pr.role IN ('admin', 'owner'))))
  )
$function$;

REVOKE ALL ON FUNCTION public._es_admin_empresa(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Para la pantalla: ¿este usuario guarda fechas anteriores sin clave?
CREATE OR REPLACE FUNCTION public.gasto_fecha_anterior_sin_clave()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public._es_admin_empresa(auth.uid(), public.get_user_tenant())
$function$;

REVOKE ALL ON FUNCTION public.gasto_fecha_anterior_sin_clave() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gasto_fecha_anterior_sin_clave() TO authenticated;

-- Pedir la autorización con la clave de un administrador.
-- Devuelve {ok:true, id} o {ok:false, error}. No lanza error con la clave
-- equivocada: así el intento fallido queda guardado y cuenta para el bloqueo.
CREATE OR REPLACE FUNCTION public.autorizar_gasto_fecha_anterior(p_fecha date, p_password text)
 RETURNS json
 LANGUAGE plpgsql
 VOLATILE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid := auth.uid();
  v_tenant uuid := public.get_user_tenant();
  v_hoy    date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_admin  uuid;
  v_fallos int;
  v_id     uuid;
BEGIN
  IF v_user IS NULL OR v_tenant IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'No se pudo determinar el usuario o la empresa.');
  END IF;
  IF p_fecha IS NULL OR p_fecha >= v_hoy THEN
    -- (El día pasado puede ser el de destino o el de origen de un gasto
    -- movido; siempre es anterior a hoy.)
    RETURN json_build_object('ok', false, 'error', 'La fecha no es anterior a hoy: no hace falta autorización.');
  END IF;

  IF public._es_admin_empresa(v_user, v_tenant) THEN
    v_admin := v_user;
  ELSE
    SELECT count(*) INTO v_fallos
      FROM public.gasto_fecha_autorizaciones
     WHERE usuario_id = v_user AND NOT ok AND created_at > now() - interval '10 minutes';
    IF v_fallos >= 5 THEN
      RETURN json_build_object('ok', false, 'error', 'Demasiados intentos con clave equivocada. Espera 10 minutos.');
    END IF;
    IF COALESCE(btrim(p_password), '') = '' THEN
      RETURN json_build_object('ok', false, 'error', 'Escribe la clave de un administrador.');
    END IF;

    -- Primero los administradores de la empresa (pocos); la clave se compara
    -- solo contra ellos (crypt es lento a propósito).
    WITH admins AS MATERIALIZED (
      SELECT u.id, u.created_at, u.encrypted_password
        FROM auth.users u
       WHERE u.id IN (SELECT ue.user_id FROM public.usuarios_empresas ue WHERE ue.tenant_id = v_tenant
                      UNION SELECT pr.id FROM public.profiles pr WHERE pr.tenant_id = v_tenant)
         AND public._es_admin_empresa(u.id, v_tenant)
         AND u.encrypted_password IS NOT NULL
    )
    SELECT a.id INTO v_admin
      FROM admins a
     WHERE a.encrypted_password = extensions.crypt(p_password, a.encrypted_password)
     ORDER BY a.created_at, a.id
     LIMIT 1;

    IF v_admin IS NULL THEN
      INSERT INTO public.gasto_fecha_autorizaciones (tenant_id, usuario_id, fecha, ok)
      VALUES (v_tenant, v_user, p_fecha, false);
      RETURN json_build_object('ok', false, 'error', 'Clave de administrador incorrecta.');
    END IF;
  END IF;

  INSERT INTO public.gasto_fecha_autorizaciones (tenant_id, usuario_id, fecha, autorizado_por, ok)
  VALUES (v_tenant, v_user, p_fecha, v_admin, true)
  RETURNING id INTO v_id;

  RETURN json_build_object('ok', true, 'id', v_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.autorizar_gasto_fecha_anterior(date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.autorizar_gasto_fecha_anterior(date, text) TO authenticated;

-- El candado sobre la tabla.
CREATE OR REPLACE FUNCTION public._gasto_fecha_anterior_requiere_clave()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user  uuid := auth.uid();
  v_hoy   date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_fecha date;   -- el día pasado que se toca
  v_aut   uuid;
BEGIN
  IF v_user IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.fecha IS NOT DISTINCT FROM OLD.fecha THEN
    RETURN NEW;
  END IF;

  IF NEW.fecha IS NOT NULL AND NEW.fecha < v_hoy THEN
    v_fecha := NEW.fecha;                       -- se graba en un día pasado
  ELSIF TG_OP = 'UPDATE' AND OLD.fecha IS NOT NULL AND OLD.fecha < v_hoy THEN
    v_fecha := OLD.fecha;                       -- se saca de un día pasado
  ELSE
    RETURN NEW;
  END IF;

  IF public._es_admin_empresa(v_user, NEW.tenant_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.autorizacion_fecha_id IS NOT NULL THEN
    SELECT a.id INTO v_aut
      FROM public.gasto_fecha_autorizaciones a
     WHERE a.id = NEW.autorizacion_fecha_id
       AND a.ok
       AND a.usuario_id = v_user
       AND a.tenant_id = NEW.tenant_id
       AND a.fecha = v_fecha
       AND a.expira_at > now()
       AND (a.usada_txid IS NULL OR a.usada_txid = txid_current())
     FOR UPDATE;
    IF v_aut IS NOT NULL THEN
      UPDATE public.gasto_fecha_autorizaciones
         SET usada_txid = txid_current(), usada_at = COALESCE(usada_at, now())
       WHERE id = v_aut;
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'Para guardar un gasto en un día que ya pasó (%) hace falta la clave de un administrador.',
    to_char(v_fecha, 'DD/MM/YYYY')
    USING ERRCODE = 'P0G01';
END;
$function$;

DROP TRIGGER IF EXISTS trg_gasto_fecha_anterior_requiere_clave ON public.gastos_diarios;
CREATE TRIGGER trg_gasto_fecha_anterior_requiere_clave
  BEFORE INSERT OR UPDATE OF fecha ON public.gastos_diarios
  FOR EACH ROW EXECUTE FUNCTION public._gasto_fecha_anterior_requiere_clave();

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('gasto_fecha_anterior_con_clave.sql');
