-- =====================================================================
-- PLACA Y MATRÍCULA (27/11/2026)
-- =====================================================================
-- El dueño: MotoPréstamos Los Naranjos registra las placas y matrículas que
-- tiene en existencia AUNQUE LA MOTO AÚN NO SE HAYA VENDIDO (como la "Lista de
-- Vehículos" del sistema viejo). Todo vive en documentacion_clientes, la
-- misma tabla de Notas y Comentarios, para que los datos estén en un solo
-- lugar: cuando se vende, se le pone el cliente y aparece en su ficha.
--   • datos del vehículo: tipo, marca, modelo, año, color, motor
--   • cliente_nombre deja de ser obligatorio: unidad sin vender = sin cliente
-- =====================================================================

ALTER TABLE public.documentacion_clientes
  ADD COLUMN IF NOT EXISTS tipo_vehiculo text,
  ADD COLUMN IF NOT EXISTS marca text,
  ADD COLUMN IF NOT EXISTS modelo text,
  ADD COLUMN IF NOT EXISTS anio integer,
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS motor text;

ALTER TABLE public.documentacion_clientes ALTER COLUMN cliente_nombre DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documentacion_clientes_anio_chk') THEN
    ALTER TABLE public.documentacion_clientes
      ADD CONSTRAINT documentacion_clientes_anio_chk CHECK (anio IS NULL OR anio BETWEEN 1950 AND 2100);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS documentacion_clientes_chasis_idx ON public.documentacion_clientes (tenant_id, upper(chasis));

-- PRUEBA: una unidad sin cliente se graba y se lee (se deshace al final).
DO $prueba$
DECLARE v_t uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'; v_id uuid;
BEGIN
  INSERT INTO public.documentacion_clientes (tenant_id, chasis, placa, placa_estado, tipo_vehiculo, marca, modelo, anio, color, motor)
  VALUES (v_t, 'PRUEBA-CHASIS', 'K000000', 'EN TRAMITE', 'MOTOCICLETAS', 'X1000', 'CG150', 2015, 'NEGRO', 'M123')
  RETURNING id INTO v_id;
  IF NOT EXISTS (SELECT 1 FROM public.documentacion_clientes WHERE id = v_id AND cliente_nombre IS NULL AND anio = 2015) THEN
    RAISE EXCEPTION 'no quedó la unidad sin cliente';
  END IF;
  RAISE EXCEPTION 'PRUEBA_OK';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'PRUEBA_OK' THEN RAISE; END IF;
END $prueba$;

SELECT public.registrar_migracion('placas_matriculas_vehiculos.sql');
