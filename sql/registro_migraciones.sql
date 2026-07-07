-- ============================================================
-- REGISTRO DE MIGRACIONES: confirmar que SQL corrio en prod
-- ============================================================
-- Pedido 2026-07-07: "hay que buscar la manera de que puedas
-- confirmar cuando se ejecutan los SQL".
--
-- Como funciona:
--   1. Tabla schema_migraciones: un registro por archivo SQL con la
--      fecha de ejecucion (y cuantas veces se re-ejecuto).
--   2. Cada SQL nuevo termina con:
--         SELECT public.registrar_migracion('nombre_archivo.sql');
--      Al correrlo en el editor de Supabase queda registrado solo.
--   3. Claude verifica con la service key leyendo la tabla — sin
--      preguntarle al usuario.
--   4. get_definicion_funcion(nombre): devuelve el CUERPO actual de
--      una funcion (solo service_role) — para confirmar redefiniciones
--      que no cambian firma (ej. fix de get_caja_excedente_dashboard).
--
-- Incluye el registro RETROACTIVO de los SQL ya ejecutados
-- (verificados por sus efectos el 2026-07-07). Re-ejecutable.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.schema_migraciones (
  archivo      text PRIMARY KEY,
  ejecutado_at timestamptz NOT NULL DEFAULT now(),
  veces        int NOT NULL DEFAULT 1
);

-- Solo el editor SQL (postgres) y la service key la tocan/leen.
ALTER TABLE public.schema_migraciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schema_migraciones FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.schema_migraciones TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_migracion(p_archivo text)
RETURNS text
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.schema_migraciones (archivo)
  VALUES (p_archivo)
  ON CONFLICT (archivo) DO UPDATE
    SET ejecutado_at = now(), veces = schema_migraciones.veces + 1
  RETURNING archivo || ' registrado (' || veces || 'x, ' || ejecutado_at || ')';
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_migracion(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.registrar_migracion(text) TO service_role;

-- Introspeccion: ver el cuerpo ACTUAL de una funcion para confirmar
-- redefiniciones con la misma firma. Solo service_role.
CREATE OR REPLACE FUNCTION public.get_definicion_funcion(p_nombre text)
RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path TO 'public'
AS $$
  SELECT pg_get_functiondef(p.oid)
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = p_nombre
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_definicion_funcion(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_definicion_funcion(text) TO service_role;

-- ---------- Registro RETROACTIVO (verificados por efectos 2026-07-07) ----------
INSERT INTO public.schema_migraciones (archivo) VALUES
  ('financiamiento_propio_rpc.sql'),
  ('fix_get_stats_dashboard_rapido.sql'),
  ('nota_credito_financiera.sql'),
  ('transacciones_diarias_nc_ab.sql'),
  ('pago_comisiones_boton.sql'),
  ('mora_default_empresa.sql'),
  ('fix_caja_dia_pagos_efectivo.sql'),
  ('orden_automatica_sustituto_con_stock.sql'),
  ('presupuesto_modelo_selector.sql')
ON CONFLICT (archivo) DO NOTHING;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('registro_migraciones.sql');
