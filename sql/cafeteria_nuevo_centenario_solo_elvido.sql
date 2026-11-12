-- (12/11/2026) CAFETERÍA NUEVO CENTENARIO (031708ce-153a-4aa9-a34d-ea91c476e012):
-- por el momento solo entra elvidocaminero@gmail.com. Se quita a Zuri
-- (se le puede volver a dar acceso después).
DELETE FROM public.usuarios_empresas
 WHERE tenant_id = '031708ce-153a-4aa9-a34d-ea91c476e012'
   AND user_id = 'b0ee49cc-45f9-4106-ab53-38985fa0fbdb';

UPDATE private.tenant_onboarding_claims
   SET claimed_by = 'a9a2d9fd-c408-4d33-b1c7-1f7f29e397fb', claimed_at = now()
 WHERE tenant_id = '031708ce-153a-4aa9-a34d-ea91c476e012';

SELECT ue.rol, u.email
  FROM public.usuarios_empresas ue JOIN auth.users u ON u.id = ue.user_id
 WHERE ue.tenant_id = '031708ce-153a-4aa9-a34d-ea91c476e012';

SELECT registrar_migracion('cafeteria_nuevo_centenario_solo_elvido.sql');
