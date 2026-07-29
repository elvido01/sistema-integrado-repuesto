-- =====================================================================
-- FIRMA en las facturas — sobre la línea "Entregado por"
-- ---------------------------------------------------------------------
-- (2026-07-29) "Esta es mi firma, necesito agregarla a las facturas donde
-- dice ENTREGADO POR."
--
-- La factura salía con la raya en blanco: había que imprimirla, firmarla a
-- mano y escanearla para poder enviarla. Con la firma guardada, el PDF sale
-- firmado y se manda directo.
--
-- Es una columna nueva porque la firma NO es el logo: el logo es de la
-- empresa y va en el encabezado; la firma es de la persona que entrega y va
-- al pie. Guardarlas en el mismo campo obligaría a elegir una.
--
-- La imagen se sube desde Configuración → Datos de la Empresa, al mismo
-- bucket que el logo. Aquí solo se crea el campo donde vive la URL.
--
-- >>> RECOMENDACIÓN PARA LA IMAGEN <<<
-- PNG con FONDO TRANSPARENTE. Una foto de la firma sobre papel trae el
-- fondo del papel y en el PDF se ve un rectángulo gris encima de la línea.
-- Si solo hay una foto, recortarla ajustada al trazo y subirla en PNG.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS firma_url text;

COMMENT ON COLUMN public.config_empresa.firma_url IS
  'Imagen de la firma que se estampa sobre la línea "Entregado por" de la factura. PNG con fondo transparente.';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('firma_factura.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
SELECT nombre,
       CASE WHEN NULLIF(btrim(COALESCE(firma_url, '')), '') IS NULL
            THEN 'sin firma — súbela en Configuración → Datos de la Empresa'
            ELSE 'firma cargada' END AS firma
FROM public.config_empresa
ORDER BY nombre;
-- esperado: la columna existe; REPUESTOS MORLA aparece "sin firma" hasta
--           que se suba la imagen desde la pantalla.
