-- =====================================================================
-- PLANES: PRECIOS NUEVOS Y DESCRIPCIONES (20/10/2026)
-- ---------------------------------------------------------------------
-- Decisión del dueño tras comparar con el mercado dominicano (octubre
-- 2026): solo facturación electrónica RD$1,380–2,800/mes; POS+inventario
-- con e-CF (Alegra) US$25/39/79 ≈ RD$1,600/2,450/5,000. El Básico a
-- RD$2,500 costaba lo mismo que el plan pyme de Alegra, que además regala
-- el certificado digital.
--
--   BASICO      2,500 → 1,950
--   PRO         5,000 → 3,950
--   ENTERPRISE 10,000 → 7,950
--
-- Las descripciones pasan a decir lo que gana el cliente. Las suscripciones
-- vigentes no se tocan: el precio nuevo aplica al próximo pago.
-- =====================================================================

UPDATE public.planes SET precio = 1950, descripcion = 'Factura electrónica, ventas e inventario', updated_at = now()
 WHERE nombre = 'BASICO';
UPDATE public.planes SET precio = 3950, descripcion = 'Vende también por WhatsApp y redes, con IA', updated_at = now()
 WHERE nombre = 'PRO';
UPDATE public.planes SET precio = 7950, descripcion = 'Todo ilimitado, con asistente IA', updated_at = now()
 WHERE nombre = 'ENTERPRISE';

SELECT public.registrar_migracion('planes_precios_2026_10.sql');

SELECT nombre, precio, descripcion FROM public.planes ORDER BY precio;
