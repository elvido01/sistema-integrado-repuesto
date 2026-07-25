-- =====================================================================
-- FIX: préstamos DUPLICADOS en MotoPréstamos (terceros vs migración SiiF)
-- ---------------------------------------------------------------------
-- (2026-07-24) Resumen de Cartera de MotoPréstamos mostraba doble a
-- ERNESTINA SANTANA (PT-0026578 y PT-0026578-26112) y a FERNANDO DE LEON
-- (PT-0026579 y PT-0026582), mismo monto y fecha.
--
-- CAUSA: el préstamo se creó NATIVO en MotoFlow por el financiamiento a
-- terceros (FT-12/FT-13 de Caminero, legacy_id NULL + nota [FT:...] + chasis)
-- y ADEMÁS estaba en SiiF; la migración diaria del 21/07 lo importó otra vez
-- (legacy_id 26112/26116) creando la copia (sin nota ni chasis, sin pagos).
--
-- Este script BORRA solo las copias de SiiF que:
--   * son migradas (legacy_id NOT NULL) y NO tienen nota [FT:],
--   * coinciden en cliente + monto con un préstamo NATIVO de terceros
--     (legacy_id NULL + nota [FT:]),
--   * y NO tienen NINGÚN pago registrado.
-- Conserva los nativos (con chasis y enlace a la factura de Caminero).
--
-- La recurrencia se evita en scripts/migracion-siif/fase3-cargar-prestamos.mjs
-- (salta de SiiF los préstamos que ya existen como terceros nativo).
-- Idempotente. Correr en PRODUCCIÓN (SQL editor de Supabase).
-- =====================================================================

DO $$
DECLARE
  v_fin uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';  -- MotoPréstamos Los Naranjos
  v_ids uuid[];
  v_n   int;
BEGIN
  SELECT array_agg(d.id) INTO v_ids
  FROM public.prestamos d
  WHERE d.tenant_id = v_fin
    AND d.legacy_id IS NOT NULL
    AND COALESCE(d.notas, '') NOT LIKE '%[FT:%'
    AND EXISTS (
      SELECT 1 FROM public.prestamos t
      WHERE t.tenant_id = v_fin
        AND t.legacy_id IS NULL
        AND t.notas LIKE '%[FT:%'
        AND t.cliente_id = d.cliente_id
        AND round(t.monto_capital) = round(d.monto_capital)
    )
    AND NOT EXISTS (SELECT 1 FROM public.prestamo_pagos p WHERE p.prestamo_id = d.id);

  IF v_ids IS NULL THEN
    RAISE NOTICE 'No hay préstamos duplicados que borrar.';
    RETURN;
  END IF;
  v_n := array_length(v_ids, 1);

  DELETE FROM public.prestamo_cargos WHERE prestamo_id = ANY(v_ids);
  DELETE FROM public.prestamo_cuotas WHERE prestamo_id = ANY(v_ids);
  DELETE FROM public.prestamos       WHERE id         = ANY(v_ids);

  RAISE NOTICE 'Borrados % préstamo(s) duplicado(s) de SiiF.', v_n;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_prestamos_duplicados_terceros.sql');
  END IF;
END $$;

-- Verificación: ERNESTINA y FERNANDO deben quedar con UN solo préstamo terceros
SELECT p.numero, c.nombre, p.monto_capital, p.legacy_id,
       (p.notas LIKE '%[FT:%') AS es_terceros
FROM public.prestamos p
JOIN public.clientes c ON c.id = p.cliente_id
WHERE p.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND p.numero IN ('PT-0026578','PT-0026578-26112','PT-0026579','PT-0026582')
ORDER BY c.nombre, p.numero;
