-- =====================================================================
-- Link usuario extension/web -> tenant MotoPrestamos Los Naranjos
-- ---------------------------------------------------------------------
-- La app web carga la empresa desde profiles.tenant_id, pero varias RPC
-- usadas por la extension resuelven el tenant con public.get_user_tenant(),
-- que historicamente solo leia usuarios_empresas. Este script alinea ambas
-- fuentes para que el mismo login vea los mismos datos en web y extension.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.usuario_tenant_activo (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 1) Hacer que get_user_tenant use la empresa activa de la extension si
--    existe, y si no, el mismo tenant que la web (profiles.tenant_id).
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

-- 2) Rellenar usuarios_empresas para perfiles existentes que tengan tenant.
INSERT INTO public.usuarios_empresas (user_id, tenant_id, rol)
SELECT
  p.id,
  p.tenant_id,
  CASE
    WHEN lower(COALESCE(p.role, '')) IN ('owner', 'admin', 'vendedor')
      THEN lower(p.role)
    ELSE 'usuario'
  END AS rol
FROM public.profiles p
WHERE p.tenant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.usuarios_empresas ue
    WHERE ue.user_id = p.id
      AND ue.tenant_id = p.tenant_id
  );

-- 3) Asegurar que el usuario de la extension apunte a MotoPrestamos.
DO $$
DECLARE
  v_user_id uuid;
  v_tenant_id uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
  v_email text := 'motoprestamoslosnaranjos@gmail.com';
BEGIN
  SELECT u.id
    INTO v_user_id
  FROM auth.users u
  WHERE lower(u.email) = lower(v_email)
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No existe usuario auth.users con email %', v_email;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, tenant_id)
  VALUES (v_user_id, v_email, 'MotoPrestamos Los Naranjos', 'admin', v_tenant_id)
  ON CONFLICT (id) DO UPDATE
     SET email = EXCLUDED.email,
         tenant_id = EXCLUDED.tenant_id,
         role = COALESCE(public.profiles.role, EXCLUDED.role),
         full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);

  INSERT INTO public.usuarios_empresas (user_id, tenant_id, rol)
  VALUES (v_user_id, v_tenant_id, 'admin')
  ON CONFLICT (user_id, tenant_id) DO UPDATE
     SET rol = EXCLUDED.rol;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- 4) Verificacion: tenant en profile y tenant usado por usuarios_empresas.
SELECT
  u.email,
  p.tenant_id AS tenant_en_profiles,
  ue.tenant_id AS tenant_en_usuarios_empresas,
  ce.nombre AS empresa,
  ce.feat_financiera
FROM auth.users u
LEFT JOIN public.profiles p
  ON p.id = u.id
LEFT JOIN public.usuarios_empresas ue
  ON ue.user_id = u.id
 AND ue.tenant_id = p.tenant_id
LEFT JOIN public.config_empresa ce
  ON ce.tenant_id = COALESCE(ue.tenant_id, p.tenant_id)
WHERE lower(u.email) = lower('motoprestamoslosnaranjos@gmail.com');

SELECT 'usuario de extension ligado a MotoPrestamos Los Naranjos' AS status;
