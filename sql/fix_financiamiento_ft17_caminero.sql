-- =====================================================================
-- FIX: financiamiento de FT-17 (Caminero Motors) no llegó a MotoPréstamos
-- ---------------------------------------------------------------------
-- 24/07/2026 — Caminero facturó FT-0000017 (MOTOCICLETA TUCAN CRF-250,
-- comprador GUILLAUME JUDELOR, solicitud #24) pero el préstamo NUNCA se
-- creó en MotoPréstamos Los Naranjos:
--   * GUILLAUME no existe como cliente en la financiera,
--   * no hay préstamo con el marcador [FT:831b5a49-...],
--   * la CxC de Caminero sigue a nombre del comprador (no de la financiera),
--   * no existe la CxP ni el cargo del ADICIONAL.
--
-- CAUSA: la venta se registró primero de CONTADO y luego se EDITÓ a
-- CRÉDITO. El financiamiento a terceros solo se dispara al GRABAR una venta
-- a crédito NUEVA hecha desde la solicitud (useVentas.js: `!editingFacturaId
-- && paymentType==='credito' && solicitudCompraId && ...`). Al editar nunca
-- corre → el préstamo jamás se creó (no hay ni notificación de fallo porque
-- el bloque no llegó a ejecutarse). Mismo caso que FT-12.
--
-- El RPC procesar_financiamiento_terceros YA está en su última versión en
-- prod (adicional_cargo_financiamiento.sql corrido): crea cliente + préstamo
-- + cuotas + cargo AD- (adicional) + CxP y reasigna la CxC. Este script solo
-- lo EJECUTA para FT-17, impersonando al cajero de Caminero (el RPC deriva el
-- tenant del usuario; en el SQL editor no hay JWT, así que seteamos 'sub').
--
-- Plan de la solicitud #24 (todo cuadra):
--   contado 125,000 + gps 3,600 + seguro 1,000 = 129,600
--   129,600 - inicial 28,000 - adicional 22,000 = financiado 79,600 (capital)
--   12 cuotas x 9,020 (cuota_ajustada) = 108,240 = total pagarés
--   adicional 22,000 = cargo AD- cobrable aparte (completivo del inicial)
--
-- NOTA: la fecha del adicional en la solicitud quedó 08/02/2026 (ya pasada,
-- error de digitación). Abajo se corrige a 24/08/2026 (junto al 1er pago).
-- >>> Si la fecha real pactada del adicional es otra, cámbiala aquí <<<
--
-- Re-ejecutable e idempotente (el RPC no repite si ya existe el [FT:...]).
-- Correr en PRODUCCIÓN (SQL editor de Supabase).
-- =====================================================================

-- ------------------------------------------------------------
-- 1) Corregir la fecha del ADICIONAL (estaba 08/02, ya pasada)
--    y asegurar la cuota ajustada (9,020) para que los pagarés
--    salgan idénticos a los firmados.
-- ------------------------------------------------------------
UPDATE public.solicitudes_compras
   SET adicional_fecha = DATE '2026-08-24'          -- <-- ajusta si la fecha real es otra
 WHERE id = 'c2d3d644-694c-4efe-b2ac-d3bc4f05e16b'  -- Solicitud #24 (GUILLAUME)
   AND (adicional_fecha IS NULL OR adicional_fecha < DATE '2026-07-24');

UPDATE public.solicitudes_compras
   SET cuota_ajustada = 9020
 WHERE id = 'c2d3d644-694c-4efe-b2ac-d3bc4f05e16b'
   AND COALESCE(cuota_ajustada, 0) = 0;

-- ------------------------------------------------------------
-- 2) EJECUTAR el financiamiento pendiente de FT-17
--    Impersonamos al owner de Caminero (perfil + tenant activo = b39506c3).
-- ------------------------------------------------------------
SELECT set_config('request.jwt.claims',
  '{"sub":"6d7e711c-935d-442b-8f45-cf308863f414","role":"authenticated"}', false);

SELECT public.procesar_financiamiento_terceros(
  '831b5a49-a30f-4cca-bc25-952eff97bf1d',  -- FT-17 Caminero
  'c2d3d644-694c-4efe-b2ac-d3bc4f05e16b',  -- Solicitud #24 (GUILLAUME JUDELOR)
  '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'   -- MotoPréstamos Los Naranjos
) AS resultado_financiamiento;

-- limpiar la impersonación
SELECT set_config('request.jwt.claims', '', false);

-- ------------------------------------------------------------
-- 3) VERIFICACIÓN
-- ------------------------------------------------------------
-- 3a) Préstamo creado en MotoPréstamos (capital 79,600, 12 cuotas)
SELECT p.numero, c.nombre AS cliente, p.monto_capital, p.plazo_cuotas,
       p.tasa_interes, p.frecuencia, p.garantia
FROM public.prestamos p
JOIN public.clientes c ON c.id = p.cliente_id
WHERE p.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND p.notas LIKE '%[FT:831b5a49-a30f-4cca-bc25-952eff97bf1d]%';

-- 3b) Cuotas (12 x 9,020 = 108,240)
SELECT count(*) AS cuotas, min(fecha_vencimiento) AS primera, max(fecha_vencimiento) AS ultima,
       sum(capital) AS capital_total, sum(monto_cuota) AS total_a_pagar
FROM public.prestamo_cuotas pc
WHERE pc.prestamo_id IN (
  SELECT id FROM public.prestamos
  WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
    AND notas LIKE '%[FT:831b5a49-a30f-4cca-bc25-952eff97bf1d]%'
);

-- 3c) Cargo ADICIONAL (AD-) 22,000, vence 24/08/2026
SELECT pc.numero, pc.tipo, pc.concepto, pc.fecha AS vence, pc.monto
FROM public.prestamo_cargos pc
WHERE pc.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND pc.prestamo_id IN (
    SELECT id FROM public.prestamos
    WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
      AND notas LIKE '%[FT:831b5a49-a30f-4cca-bc25-952eff97bf1d]%'
  );

-- 3d) CxP de MotoPréstamos hacia Caminero (79,600 + 22,000 = 101,600)
SELECT numero, referencia, total_compra, monto_pendiente, estado
FROM public.compras
WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND referencia ILIKE '%factura #17%';

-- 3e) CxC de Caminero reasignada a la financiera (comprador preservado)
SELECT f.numero, c.nombre AS cxc_a_nombre_de, f.manual_cliente_nombre AS comprador_real,
       f.monto_pendiente
FROM public.facturas f
JOIN public.clientes c ON c.id = f.cliente_id
WHERE f.id = '831b5a49-a30f-4cca-bc25-952eff97bf1d';

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_financiamiento_ft17_caminero.sql');
  END IF;
END $$;

SELECT 'Financiamiento FT-17 procesado — revisa las 5 verificaciones de arriba' AS status;
