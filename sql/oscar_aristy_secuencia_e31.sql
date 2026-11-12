-- (12/11/2026) OSCAR ARISTY RICHIEZ (c7cc095d-3bc4-4704-8abe-a6651ff73e23):
-- secuencia E31 (crédito fiscal electrónica) del 1 al 100.
-- Va como ambiente Produccion, igual que la de BRIMAR. La empresa sigue en
-- PRUEBAS: no gasta números hasta que se encienda producción.
-- Falta la fecha de vencimiento: se pone en Configuración → «Vencimiento
-- secuencia e-CF» (la exigen los E31).
INSERT INTO public.ecf_secuencias (tenant_id, tipo_ecf, serie, desde, hasta, ultimo, ambiente, activo)
VALUES ('c7cc095d-3bc4-4704-8abe-a6651ff73e23', '31', 'E', 1, 100, 0, 'Produccion', true);

SELECT tipo_ecf, serie, desde, hasta, ultimo, ambiente, activo
FROM public.ecf_secuencias
WHERE tenant_id = 'c7cc095d-3bc4-4704-8abe-a6651ff73e23';

SELECT registrar_migracion('oscar_aristy_secuencia_e31.sql');
