-- El usuario "presidente" (juan) de MotoPréstamos Los Naranjos también entra
-- a INVERSIONES EL NARANJO como administrador (orden del dueño 02/11/2026).
--
-- Mismo usuario y misma contraseña: presidente@usuario.motoflow.app. Se
-- cambia de empresa con el selector de abajo a la izquierda, igual que
-- Caraballo y Yimber (un usuario, varias empresas en usuarios_empresas).
-- Su empresa principal (MotoPréstamos) no cambia.
--
-- Ojo: hay dos empresas parecidas. Esta es INVERSIONES EL NARANJO
-- (160f0230…), NO "INVERSIONES LOS NARANJOS" (c07a1d07…).

INSERT INTO public.usuarios_empresas (user_id, tenant_id, rol)
SELECT 'ce9b123c-3f16-4ef6-a10e-2bab39db565d', '160f0230-ed68-4d43-a569-8abafa8134a3', 'admin'
WHERE NOT EXISTS (
  SELECT 1 FROM public.usuarios_empresas
   WHERE user_id = 'ce9b123c-3f16-4ef6-a10e-2bab39db565d'
     AND tenant_id = '160f0230-ed68-4d43-a569-8abafa8134a3'
);

SELECT public.registrar_migracion('presidente_en_inversiones_el_naranjo.sql');

-- ===== VERIFICACION =====
SELECT t.nombre, u.email, ue.rol
  FROM public.usuarios_empresas ue
  JOIN auth.users u ON u.id = ue.user_id
  JOIN public.tenants t ON t.id = ue.tenant_id
 WHERE ue.user_id = 'ce9b123c-3f16-4ef6-a10e-2bab39db565d'
 ORDER BY t.nombre;
