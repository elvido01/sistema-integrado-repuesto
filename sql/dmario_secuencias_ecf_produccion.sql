-- =====================================================================
-- D MARIO CASTRO TERMINACIONES — secuencias e-NCF de PRODUCCIÓN
-- =====================================================================
-- Solicitud DGII 6010021357, aprobada el 09/10/2026 (OFV → Consultas →
-- Solicitudes de Comprobantes, CSV ComprobantesSolicitud_6010021357):
--   E31 crédito fiscal   E310000000001–E310000000100  aut. 6005552417  vence 31/12/2027
--   E32 consumo          E320000000001–E320000000300  aut. 6005552421  (sin vencimiento)
--   E34 nota de crédito  E340000000001–E340000000020  aut. 6005552422  (sin vencimiento)
--
-- Se cargan con ambiente 'Produccion' (el nombre que usa emitir-fiscal para
-- ecf.dgii.gov.do/eCF). No se usan hasta que la integración de D Mario pase
-- de 'CerteCF' a 'Produccion'. ultimo = 0 → el primero será el ...0000000001.
-- Re-ejecutable: no pisa 'ultimo' si ya se emitió alguno.
-- =====================================================================

INSERT INTO public.ecf_secuencias (tenant_id, tipo_ecf, serie, desde, hasta, ultimo, ambiente, activo)
VALUES
  ('58c09df3-48c2-4a3e-bb3e-96997ccbbc8a', '31', 'E', 1, 100, 0, 'Produccion', true),
  ('58c09df3-48c2-4a3e-bb3e-96997ccbbc8a', '32', 'E', 1, 300, 0, 'Produccion', true),
  ('58c09df3-48c2-4a3e-bb3e-96997ccbbc8a', '34', 'E', 1, 20,  0, 'Produccion', true)
ON CONFLICT (tenant_id, tipo_ecf, serie, ambiente)
  DO UPDATE SET desde = EXCLUDED.desde, hasta = EXCLUDED.hasta, activo = true, updated_at = now();

SELECT public.registrar_migracion('dmario_secuencias_ecf_produccion.sql');
