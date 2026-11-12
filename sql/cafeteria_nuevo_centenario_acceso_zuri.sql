-- (12/11/2026) CAFETERÍA NUEVO CENTENARIO (031708ce-153a-4aa9-a34d-ea91c476e012):
-- se le devuelve el acceso de dueña a Zuri (zuriespinalcaceres@hotmail.com),
-- junto a elvidocaminero@gmail.com.
INSERT INTO public.usuarios_empresas (user_id, tenant_id, rol)
VALUES ('b0ee49cc-45f9-4106-ab53-38985fa0fbdb', '031708ce-153a-4aa9-a34d-ea91c476e012', 'owner')
ON CONFLICT DO NOTHING;

SELECT ue.rol, u.email
  FROM public.usuarios_empresas ue JOIN auth.users u ON u.id = ue.user_id
 WHERE ue.tenant_id = '031708ce-153a-4aa9-a34d-ea91c476e012';

SELECT registrar_migracion('cafeteria_nuevo_centenario_acceso_zuri.sql');
