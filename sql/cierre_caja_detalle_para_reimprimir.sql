-- =====================================================================
-- Guardar el cierre completo para poder reimprimirlo tal cual
-- ---------------------------------------------------------------------
-- (2026-08-01) "Necesito volver a reimprimir el último desglose de efectivo
-- de MotoPréstamos Los Naranjos."
--
-- No se podía: la pantalla solo imprime en el momento de cerrar, y de ahí en
-- adelante el documento no existe en ningún lado.
--
-- >>> POR QUÉ NO BASTA CON RECALCULAR EL DÍA <<<
-- Lo fácil sería volver a sacar las cuentas de esa fecha al momento de
-- reimprimir. Daría OTRO documento: hoy mismo, entre que se cerró el turno y
-- que se pidió la reimpresión, los recibos pasaron de 77,834.11 a 92,614.11.
-- Un cierre es la foto de un momento; si al reimprimirlo cambia, deja de
-- servir para lo único que sirve, que es cotejar.
--
-- Por eso se guarda la foto: `detalle` lleva el resumen completo con el que
-- se imprimió —cada total y cada desglose, incluidos gastos, nómina, pagos a
-- terceros y compromisos con sus empleados—. Reimprimir es volver a dibujar
-- ese mismo objeto, no calcular nada.
--
-- Los cierres viejos no tienen la foto: se reimprimen con lo que sí quedó
-- guardado en columnas (totales y desglose de efectivo). Es menos detalle,
-- pero es cierto, que es lo que importa.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

ALTER TABLE public.cierres_caja
  ADD COLUMN IF NOT EXISTS detalle jsonb;

COMMENT ON COLUMN public.cierres_caja.detalle IS
  'Foto del resumen con el que se imprimió el cierre. Permite reimprimirlo idéntico sin recalcular el día (que a esa altura ya cambió).';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('cierre_caja_detalle_para_reimprimir.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
SELECT fecha, turno, efectivo_en_caja, total_desglose, diferencia,
       (detalle IS NOT NULL) AS tiene_foto
FROM public.cierres_caja
WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
ORDER BY created_at DESC LIMIT 5;
-- esperado: los de hoy y anteriores con tiene_foto = false (son de antes);
-- el próximo cierre que se grabe ya sale con true.
