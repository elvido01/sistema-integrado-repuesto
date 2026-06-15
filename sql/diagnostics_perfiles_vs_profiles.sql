-- ============================================================
-- Diagnostico — Comparar perfiles (legacy) vs profiles (actual)
-- ============================================================
-- READ ONLY. Solo SELECTs.
--
-- Confirmamos:
--   1) Que columnas tiene perfiles
--   2) Que datos tienen las 3 filas (sin exponer emails completos)
--   3) Si los 3 ids existen tambien en profiles (migracion ya hecha)
-- ============================================================

-- 1) Columnas de perfiles vs profiles
SELECT
  'perfiles' AS tabla,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'perfiles'
UNION ALL
SELECT
  'profiles' AS tabla,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY tabla, column_name;

-- 2) Filas de perfiles con email enmascarado
SELECT
  id,
  CASE
    WHEN email IS NULL THEN NULL
    ELSE substring(email FROM 1 FOR 3) || '***@' || split_part(email, '@', 2)
  END AS email_mask,
  rol,
  activo
FROM public.perfiles;

-- 3) Los mismos 3 ids existen en profiles?
SELECT
  p.id,
  CASE
    WHEN pr.id IS NULL THEN '✗ no migrado'
    ELSE '✓ ya esta en profiles'
  END AS estado_migracion,
  pr.tenant_id AS tenant_en_profiles
FROM public.perfiles p
LEFT JOIN public.profiles pr ON pr.id = p.id;
