-- 20/11/2026 — AMSTAR DMC (cliente de Oscar Aristy) vuelve a CONTADO.
-- El dueño: "ellos pagan de contado". El crédito se le había dado el 13/11
-- (oscar_amstar_credito.sql) solo porque una venta con retención no se podía
-- hacer de contado. Desde hoy sí (contado_con_retencion.sql): se cobra el
-- neto y la caja cuenta el neto. Se le quita el crédito.
UPDATE public.clientes
   SET autorizar_credito = false
 WHERE tenant_id = 'c7cc095d-3bc4-4704-8abe-a6651ff73e23'
   AND regexp_replace(COALESCE(rnc, ''), '\D', '', 'g') = '101894229'
RETURNING nombre, autorizar_credito;

SELECT public.registrar_migracion('oscar_amstar_contado.sql');
