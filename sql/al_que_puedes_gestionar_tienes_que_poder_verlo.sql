-- ============================================================
-- AL QUE PUEDES GESTIONAR, TIENES QUE PODER VERLO
-- ============================================================
-- Cambiarle el rol a "yimber de leon" desde MotoPréstamos decía «Éxito» y no
-- cambiaba nada: al volver a entrar seguía SUPERVISOR. Ni siquiera hacía falta
-- salir — la lista de la izquierda ya lo mostraba con el rol viejo.
--
-- >>> EL PERFIL DE YIMBER NO VIVE EN MOTOPRÉSTAMOS <<<
-- Vive en CAMINERO MOTORS (`profiles.tenant_id`), aunque yimber entra a SEIS
-- empresas por `usuarios_empresas`. Y ahí se abría la grieta: TODAS las piezas
-- de esa pantalla ya entendían «miembro de la empresa activa» menos una.
--
--   · `get_usuarios_empresa`        lo LISTA a propósito (SECURITY DEFINER)
--   · `admin_actualiza_perfiles_miembros` (UPDATE)  lo deja modificar
--   · `admin_gestiona_permisos_miembros`  (permisos) lo deja modificar
--   · la política de SELECT de `profiles`            NO LO DEJA NI VER
--
-- Y sin poder VER la fila, el UPDATE no encuentra a quién actualizar: afecta
-- CERO filas. Comprobado contra producción impersonando al admin.
--
-- >>> CERO FILAS NO ES UN ERROR, Y AHÍ ESTÁ LO FEO <<<
-- PostgREST contesta 204 sin error. El código hacía `.update(...)` sin
-- `.select()`, así que no tenía forma de distinguir «actualicé» de «no había
-- nada que actualizar»: cantaba Éxito y recargaba el valor viejo. Eso se
-- arregla aparte, en la pantalla, para que no vuelva a mentir con ninguna otra
-- tabla.
--
-- >>> LA REGLA NUEVA ES LA GEMELA DE LA QUE YA EXISTÍA <<<
-- No se abre `profiles` a todo el mundo: se añade una política de SELECT que
-- usa EXACTAMENTE la misma condición que la de UPDATE que ya estaba puesta,
-- `puede_gestionar_usuario(id)` — es decir, solo un admin/owner (o superadmin)
-- y solo sobre gente que pertenece a SU empresa activa. Un vendedor no ve nada
-- nuevo. Las políticas permisivas se suman con OR, así que la de siempre
-- («los de mi tenant») sigue intacta.
--
-- >>> OJO CON LO QUE ESTO SIGNIFICA <<<
-- `profiles.role` es UNO POR USUARIO, no uno por empresa. Ponerle "gerente" a
-- yimber desde MotoPréstamos lo deja gerente en las seis. Es como está hecho
-- el esquema hoy; queda dicho para que nadie se sorprenda.
--
-- Idempotente.
-- ============================================================

DROP POLICY IF EXISTS admin_ve_perfiles_miembros ON public.profiles;
CREATE POLICY admin_ve_perfiles_miembros ON public.profiles
  FOR SELECT
  USING (public.puede_gestionar_usuario(id));

SELECT public.registrar_migracion('al_que_puedes_gestionar_tienes_que_poder_verlo.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Que la política exista no prueba que deje pasar. Se monta el caso real: un
-- admin intentando tocar a un miembro cuyo perfil vive en OTRA empresa.
--
-- El UPDATE de prueba es `SET role = role` — no cambia ni un dato, pero
-- ROW_COUNT dice si RLS lo dejó entrar. Por eso este bloque NO necesita
-- deshacerse, y por eso solo revienta si algo salió mal: si lanzara excepción
-- estando todo bien y alguien corriera el archivo en una sola transacción,
-- se llevaría por delante la política recién creada.
DO $prueba$
DECLARE
  v_admin  uuid;
  v_target uuid;
  v_quien  text;
  n        int;
BEGIN
  -- Un admin y un miembro suyo cuyo perfil pertenezca a otra empresa.
  SELECT a.id, t.id, t.full_name INTO v_admin, v_target, v_quien
  FROM public.profiles a
  JOIN public.usuarios_empresas ue ON ue.tenant_id = a.tenant_id
  JOIN public.profiles t ON t.id = ue.user_id
  WHERE lower(COALESCE(a.role,'')) IN ('admin','owner')
    AND t.tenant_id IS DISTINCT FROM a.tenant_id
    AND EXISTS (SELECT 1 FROM public.usuario_tenant_activo x
                 WHERE x.user_id = a.id AND x.tenant_id = a.tenant_id)
  LIMIT 1;

  IF v_target IS NULL THEN
    RAISE NOTICE 'No hay ningun caso cruzado que probar. Politica creada igual.';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  UPDATE public.profiles SET role = role WHERE id = v_target;
  GET DIAGNOSTICS n = ROW_COUNT;

  RESET ROLE;

  IF n <> 1 THEN
    RAISE EXCEPTION 'SIGUE SIN VERLO: el admin % no pudo tocar el perfil de % (% filas). La politica no esta haciendo efecto.',
      v_admin, COALESCE(v_quien, v_target::text), n;
  END IF;

  RAISE NOTICE 'Correcto: el admin ya alcanza el perfil de % (% fila).', v_quien, n;
END $prueba$;
