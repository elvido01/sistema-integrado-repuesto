-- =====================================================================
-- La CxP de la financiera sabe de QUE factura del dealer viene
-- ---------------------------------------------------------------------
-- (2026-08-20) Cuando el dealer financia por terceros,
-- `procesar_financiamiento_terceros` monta las dos puntas:
--
--   Caminero (dealer)   la factura cambia de dueño al cliente "financiera".
--                       Esa factura ES la cuenta por cobrar.
--   MotoPrestamos (fin) una `compra` FIN-* por cuota contra el dealer.
--                       Esa es la cuenta por pagar.
--
-- Pero el hilo entre las dos era TEXTO:
--
--     referencia = 'Financiamiento factura #12 - comprador X | cuota 1/12'
--
-- Para leerlo hay que parsear una frase. Mover dinero parseando una frase
-- es fragil: el dia que alguien mejore la redaccion, deja de cuadrar y no
-- avisa. Y hace falta leerlo, porque pagar la CxP tiene que rebajar esa
-- factura en la otra empresa.
--
-- Aqui se le pone una llave de verdad. El texto se queda —se lee bien en
-- pantalla— pero ya no es lo que manda.
--
-- >>> ESTE ARCHIVO NO MUEVE DINERO <<<
-- Solo añade la columna y la rellena hacia atras. Si el relleno no cuadra,
-- la verificacion del final lo dice y no se sigue.
--
-- Idempotente.
-- =====================================================================

ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS factura_dealer_id uuid REFERENCES public.facturas(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.compras.factura_dealer_id IS
  'Financiamiento por terceros: la factura del dealer que esta CxP viene a pagar.';

CREATE INDEX IF NOT EXISTS ix_compras_factura_dealer
  ON public.compras (factura_dealer_id)
  WHERE factura_dealer_id IS NOT NULL;

-- ------------------------------------------------------------
-- RELLENO HACIA ATRAS
-- ------------------------------------------------------------
-- Se saca el numero de factura del texto y se busca en el DEALER, que es
-- la empresa cuyo config_empresa.financiera_tenant_id apunta a la
-- financiera dueña de la compra. Sin ese ancla se podria enganchar la
-- factura #12 de otra empresa cualquiera.
UPDATE public.compras c
   SET factura_dealer_id = f.id
  FROM public.config_empresa ce
  JOIN public.facturas f ON f.tenant_id = ce.tenant_id
 WHERE c.factura_dealer_id IS NULL
   AND c.referencia ~ 'Financiamiento factura #[0-9]+'
   AND ce.financiera_tenant_id = c.tenant_id
   AND ce.tenant_id <> c.tenant_id
   AND f.numero::text = (regexp_match(c.referencia, 'Financiamiento factura #([0-9]+)'))[1];

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('enlace_compra_factura_dealer.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Las que quedan sin enganchar teniendo texto son las que hay que mirar a
-- mano ANTES de confiar en esto para mover dinero.
SELECT
  count(*) FILTER (WHERE referencia ~ 'Financiamiento factura #[0-9]+')                              AS con_texto,
  count(*) FILTER (WHERE referencia ~ 'Financiamiento factura #[0-9]+' AND factura_dealer_id IS NOT NULL) AS enganchadas,
  count(*) FILTER (WHERE referencia ~ 'Financiamiento factura #[0-9]+' AND factura_dealer_id IS NULL)     AS sin_enganchar,
  CASE WHEN count(*) FILTER (WHERE referencia ~ 'Financiamiento factura #[0-9]+' AND factura_dealer_id IS NULL) = 0
       THEN 'OK  todas tienen su factura'
       ELSE 'REVISAR: hay CxP de financiamiento sin factura enganchada' END                          AS estado
FROM public.compras;
