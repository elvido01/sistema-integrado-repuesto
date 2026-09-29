-- Cada pantalla de Financiera tiene su propia casilla en Usuarios y Permisos.
-- Hasta hoy todas colgaban de 'prestamos' (y la casilla 'gestion-cobro' no
-- hacia nada). Para que nadie pierda lo que ya ve, quien tenia 'prestamos'
-- recibe la misma casilla en cada modulo nuevo. 'gestion-cobro' ya tenia
-- filas propias y se respetan. La Nota de Credito solo la pueden grabar
-- admin/owner/manager/gerente (lo exige registrar_nota_credito_prestamo),
-- asi que solo se copia a esos roles.

INSERT INTO public.user_module_permissions (user_id, module_key, can_view, can_edit)
SELECT m.user_id, k.clave, m.can_view, m.can_edit
FROM public.user_module_permissions m
JOIN public.profiles p ON p.id = m.user_id
CROSS JOIN (VALUES ('resumen-cartera'), ('gestion-cobro'), ('nota-credito'),
                   ('cuentas-incobrables'), ('otras-transacciones'),
                   ('historico-cliente'), ('lista-chasis-prestamos')) AS k(clave)
WHERE m.module_key = 'prestamos'
  AND (k.clave <> 'nota-credito' OR p.role IN ('manager', 'gerente'))
  AND NOT EXISTS (SELECT 1 FROM public.user_module_permissions x
                  WHERE x.user_id = m.user_id AND x.module_key = k.clave);

SELECT public.registrar_migracion('financiera_un_permiso_por_modulo.sql');

-- ===== VERIFICACION =====
SELECT m.module_key, p.role, m.can_view, m.can_edit, count(*)::int AS usuarios
FROM public.user_module_permissions m
JOIN public.profiles p ON p.id = m.user_id
WHERE m.module_key IN ('prestamos', 'resumen-cartera', 'gestion-cobro', 'nota-credito',
                       'cuentas-incobrables', 'otras-transacciones',
                       'historico-cliente', 'lista-chasis-prestamos')
GROUP BY 1, 2, 3, 4
ORDER BY 1, 2;
