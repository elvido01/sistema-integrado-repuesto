-- Correccion de financiera_un_permiso_por_modulo.sql: antes de ese cambio,
-- Otras Transacciones, Historico de Cliente y Lista de Chasis no salian en el
-- menu de ningun usuario no-admin (el menu buscaba una casilla con su propio
-- nombre que nadie tenia). Copiarles 'prestamos' les regalaba pantallas que
-- el dueno nunca les dio. Se quitan esas copias; el dueno las marca a mano.
-- Solo borra filas creadas hoy por la migracion (nadie mas tenia esas claves).

DELETE FROM public.user_module_permissions
WHERE module_key IN ('otras-transacciones', 'historico-cliente', 'lista-chasis-prestamos');

SELECT public.registrar_migracion('financiera_permisos_sin_regalar_pantallas.sql');

-- ===== VERIFICACION =====
SELECT m.module_key, p.role, m.can_view, m.can_edit, count(*)::int AS usuarios
FROM public.user_module_permissions m
JOIN public.profiles p ON p.id = m.user_id
WHERE m.module_key IN ('prestamos', 'resumen-cartera', 'gestion-cobro', 'nota-credito',
                       'cuentas-incobrables', 'otras-transacciones',
                       'historico-cliente', 'lista-chasis-prestamos')
GROUP BY 1, 2, 3, 4
ORDER BY 1, 2;
