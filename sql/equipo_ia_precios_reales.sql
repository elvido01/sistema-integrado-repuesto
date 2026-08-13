-- =====================================================================
-- LOS PRECIOS DE LA PANTALLA, CON LAS CIFRAS DE VERDAD
-- ---------------------------------------------------------------------
-- (2026-08-13) La nota del Opus decía "≈US$15 por millón de entrada".
-- Son US$5 de entrada y US$25 de salida. Un precio equivocado en el
-- selector no es un detalle cosmético: es el número con el que se elige
-- el motor, y estaba empujando a descartar el Opus por el triple de lo
-- que cuesta entrar —y a subestimar lo que cuesta lo que escribe.
--
-- >>> POR QUÉ SE PONEN LAS DOS CIFRAS <<<
-- Estos agentes leen poco y escriben mucho: el prompt del Comercial son
-- ~1.000 tokens y su respuesta hasta 800. Con esa forma, la salida pesa
-- cuatro o cinco veces más que la entrada en la factura. Una nota que
-- solo diga el precio de entrada hace elegir mal.
--
-- Precios verificados el 13/08/2026 contra la documentación de
-- Anthropic y OpenAI. Si vuelven a cambiar, se cambian aquí.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

UPDATE public.equipo_modelos SET nota =
  'US$1 entrada / US$5 salida por millón. El barato de Anthropic: rápido y con buen español. Sobra para borradores.'
WHERE proveedor = 'claude' AND modelo = 'claude-haiku-4-5-20251001';

UPDATE public.equipo_modelos SET nota =
  'US$3 entrada / US$15 salida por millón (promoción US$2/US$10 hasta el 31/08/2026). El equilibrado: el que conviene para lo que va a leer un cliente.'
WHERE proveedor = 'claude' AND modelo = 'claude-sonnet-5';

UPDATE public.equipo_modelos SET nota =
  'US$5 entrada / US$25 salida por millón. El más capaz. Solo si el resultado lo pide: cuesta cinco veces el Haiku.'
WHERE proveedor = 'claude' AND modelo = 'claude-opus-5';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('equipo_ia_precios_reales.sql');
  END IF;
END $$;
