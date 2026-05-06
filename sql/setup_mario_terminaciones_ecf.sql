-- ============================================================
-- Pre-setup Mario Terminaciones para emisión e-CF directo a DGII
-- ============================================================
-- Tenant: D MARIO CASTRO TERMINACIONES & ALGO MAS
-- tenant_id: 58c09df3-48c2-4a3e-bb3e-96997ccbbc8a
-- RNC: 133267772
--
-- Pre-crea las filas en ecf_secuencias para los 4 tipos de e-CF
-- con un rango placeholder. Cuando DGII responda con los rangos
-- reales asignados, se actualizan los `desde`, `hasta` con los
-- valores oficiales (ver paso final de este archivo).
-- ============================================================

-- 1. Confirmar tenant
SELECT id, nombre, activo
FROM tenants
WHERE id = '58c09df3-48c2-4a3e-bb3e-96997ccbbc8a';

-- 2. Pre-crear secuencias e-NCF (TesteCF — placeholders)
-- Cuando DGII responda con los rangos reales, actualizar
-- los campos `desde` y `hasta` con los valores oficiales.
INSERT INTO public.ecf_secuencias
  (tenant_id, tipo_ecf, serie, desde, hasta, ultimo, ambiente, activo)
VALUES
  ('58c09df3-48c2-4a3e-bb3e-96997ccbbc8a', '31', 'E', 1, 100, 0, 'TesteCF', true),
  ('58c09df3-48c2-4a3e-bb3e-96997ccbbc8a', '32', 'E', 1, 1000, 0, 'TesteCF', true),
  ('58c09df3-48c2-4a3e-bb3e-96997ccbbc8a', '33', 'E', 1, 50,   0, 'TesteCF', true),
  ('58c09df3-48c2-4a3e-bb3e-96997ccbbc8a', '34', 'E', 1, 50,   0, 'TesteCF', true)
ON CONFLICT (tenant_id, tipo_ecf, serie, ambiente) DO NOTHING;

-- 3. Verificar
SELECT tipo_ecf, serie, desde, hasta, ultimo, ambiente, activo
FROM ecf_secuencias
WHERE tenant_id = '58c09df3-48c2-4a3e-bb3e-96997ccbbc8a'
ORDER BY tipo_ecf;

-- ============================================================
-- DESPUES DE QUE DGII RESPONDA con los rangos reales:
-- ============================================================
-- Ejemplo (DGII te asigne 1-500 para Tipo 32 en TesteCF):
--
-- UPDATE ecf_secuencias
--    SET desde = 1, hasta = 500, ultimo = 0
--  WHERE tenant_id = '58c09df3-48c2-4a3e-bb3e-96997ccbbc8a'
--    AND tipo_ecf = '32'
--    AND ambiente = 'TesteCF';
--
-- Y asi para cada tipo segun los rangos que DGII te asigne.
-- ============================================================
