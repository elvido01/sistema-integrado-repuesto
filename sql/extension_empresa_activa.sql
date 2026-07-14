-- =====================================================================
-- Extension WhatsApp -> Empresa activa por usuario
-- ---------------------------------------------------------------------
-- Permite que un usuario con acceso a varias empresas seleccione en cual
-- entrar desde la extension. get_user_tenant() usa esa empresa activa
-- siempre que el usuario tenga acceso.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.usuario_tenant_activo (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usuario_tenant_activo_tenant
  ON public.usuario_tenant_activo(tenant_id);

ALTER TABLE public.usuario_tenant_activo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usuario_lee_su_tenant_activo" ON public.usuario_tenant_activo;
CREATE POLICY "usuario_lee_su_tenant_activo"
ON public.usuario_tenant_activo
FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "usuario_actualiza_su_tenant_activo" ON public.usuario_tenant_activo;
CREATE POLICY "usuario_actualiza_su_tenant_activo"
ON public.usuario_tenant_activo
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.get_user_tenant()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT uta.tenant_id
      FROM public.usuario_tenant_activo uta
      WHERE uta.user_id = auth.uid()
        AND (
          EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND (
                p.tenant_id = uta.tenant_id
                OR COALESCE(p.is_superadmin, false) = true
              )
          )
          OR EXISTS (
            SELECT 1
            FROM public.usuarios_empresas ue
            WHERE ue.user_id = auth.uid()
              AND ue.tenant_id = uta.tenant_id
          )
        )
      LIMIT 1
    ),
    (
      SELECT p.tenant_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
      LIMIT 1
    ),
    (
      SELECT ue.tenant_id
      FROM public.usuarios_empresas ue
      WHERE ue.user_id = auth.uid()
      ORDER BY ue.created_at
      LIMIT 1
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_user_tenant() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_tenant() TO anon;

CREATE OR REPLACE FUNCTION public.get_empresas_usuario_extension()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_active uuid := public.get_user_tenant();
  v_empresas json;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  WITH allowed AS (
    SELECT p.tenant_id
    FROM public.profiles p
    WHERE p.id = v_user
      AND p.tenant_id IS NOT NULL

    UNION

    SELECT ue.tenant_id
    FROM public.usuarios_empresas ue
    WHERE ue.user_id = v_user

    UNION

    SELECT ce.tenant_id
    FROM public.config_empresa ce
    WHERE EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = v_user
        AND COALESCE(p.is_superadmin, false) = true
    )
      AND ce.tenant_id IS NOT NULL
  ),
  empresas AS (
    SELECT DISTINCT ON (ce.tenant_id)
      ce.tenant_id,
      -- Nombre COMERCIAL primero: la razón social de varias empresas es
      -- "MPN Y CAMINERO MOTORS" (Morla + Morla Vieja), así que mostrarla
      -- hacía que dos empresas distintas se vieran idénticas en el selector.
      COALESCE(NULLIF(ce.nombre, ''), NULLIF(ce.razon_social, ''), 'Empresa') AS nombre,
      COALESCE(ce.feat_financiera, false) AS feat_financiera,
      ce.plantilla_cobro,
      COALESCE(ce.cobranza_hora_corte, '17:50') AS cobranza_hora_corte
    FROM allowed a
    JOIN public.config_empresa ce
      ON ce.tenant_id = a.tenant_id
    WHERE ce.tenant_id IS NOT NULL
    ORDER BY ce.tenant_id, nombre
  )
  SELECT json_agg(
    json_build_object(
      'tenant_id', tenant_id,
      'nombre', nombre,
      'feat_financiera', feat_financiera,
      'plantilla_cobro', plantilla_cobro,
      'cobranza_hora_corte', cobranza_hora_corte,
      'activa', tenant_id = v_active
    )
    ORDER BY (tenant_id = v_active) DESC, nombre
  )
    INTO v_empresas
  FROM empresas;

  RETURN json_build_object(
    'tenant_activo', v_active,
    'empresas', COALESCE(v_empresas, '[]'::json)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_empresa_activa_extension(p_tenant_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_nombre text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id es requerido';
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = v_user
        AND (
          p.tenant_id = p_tenant_id
          OR COALESCE(p.is_superadmin, false) = true
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.usuarios_empresas ue
      WHERE ue.user_id = v_user
        AND ue.tenant_id = p_tenant_id
    )
  ) THEN
    RAISE EXCEPTION 'El usuario no tiene acceso a esta empresa';
  END IF;

  INSERT INTO public.usuario_tenant_activo (user_id, tenant_id, updated_at)
  VALUES (v_user, p_tenant_id, now())
  ON CONFLICT (user_id) DO UPDATE
     SET tenant_id = EXCLUDED.tenant_id,
         updated_at = now();

  SELECT COALESCE(ce.razon_social, ce.nombre, 'Empresa')
    INTO v_nombre
  FROM public.config_empresa ce
  WHERE ce.tenant_id = p_tenant_id
  LIMIT 1;

  RETURN json_build_object(
    'tenant_activo', p_tenant_id,
    'empresa_nombre', COALESCE(v_nombre, 'Empresa')
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_empresas_usuario_extension() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_empresa_activa_extension(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_empresas_usuario_extension() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_empresa_activa_extension(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'empresa activa para extension lista' AS status;
