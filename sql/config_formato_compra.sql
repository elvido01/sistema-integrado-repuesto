-- =====================================================================
-- Configuración: formato de impresión por defecto del módulo de Compras
-- ---------------------------------------------------------------------
-- (2026-07-27) En Compras solo se podía imprimir en ticket (80mm o 4"): la
-- hoja carta existía pero estaba escondida detrás de un segundo combo
-- ("Método impresión: PDF"), así que parecía que no estaba.
--
-- Ahora Compras tiene UN solo combo con los tres formatos, igual que los
-- demás módulos, y este campo guarda cuál trae por defecto la empresa.
--
-- Valores (los mismos de formato_comprobante_pago, para no inventar otro
-- vocabulario):
--   'pdf'        Hoja Carta 8.5 x 11
--   'pos_4inch'  Ticket 101.6mm (4 pulgadas)   <- default
--   'pos_80mm'   Ticket 80mm (3 pulgadas)
--
-- POR PC: cada máquina puede elegir el suyo desde el propio módulo y se le
-- recuerda en localStorage ('compras_printFormat'), porque no todas tienen
-- la misma impresora. Este campo es el que manda cuando esa PC nunca eligió.
-- Es el mismo patrón de Ventas y de Cierre de Caja.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS formato_compra text DEFAULT 'pos_4inch';

-- Las empresas que ya existían se quedan en el default de siempre.
UPDATE public.config_empresa
   SET formato_compra = 'pos_4inch'
 WHERE formato_compra IS NULL;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('config_formato_compra.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
SELECT tenant_id, nombre, formato_compra
FROM public.config_empresa
ORDER BY nombre;
-- esperado: todas con 'pos_4inch' (o lo que se elija después)
