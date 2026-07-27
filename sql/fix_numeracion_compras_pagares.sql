-- =====================================================================
-- Compras: la numeración se rompía con las compras financiadas
-- ---------------------------------------------------------------------
-- (2026-07-27) Reportado en Caminero Motors: "estas facturas salieron sin
-- número de factura".
--
-- CAUSA: get_next_compra_numero() sacaba el consecutivo así:
--
--     WHEN numero ~ '^OC-' THEN REPLACE(numero, 'OC-', '')::bigint
--
-- Sirve mientras los números sean OC-0001, OC-0002... pero una compra
-- financiada se guarda como un pagaré por cuota y les pone sufijo:
-- OC-0002-01, OC-0002-02, ... Al quitarle "OC-" queda "0002-01", que NO es
-- un número, y el cast REVIENTA la función entera.
--
-- Desde ese momento el frontend recibe error, deja el campo NUMERO vacío y
-- TODA compra siguiente se graba sin número. No avisaba nada: fallaba callado.
--
-- Es una bomba de tiempo para cualquier empresa: basta financiar UNA compra
-- con numeración automática para que la numeración quede rota para siempre.
--
-- ARREGLO: leer solo los dígitos que van pegados a "OC-" e ignorar el sufijo.
--   OC-0001     -> 1
--   OC-0002-01  -> 2   (la cuota no inventa un consecutivo nuevo)
--
-- Además se le pone número a las compras que quedaron sin él.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_next_compra_numero()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tenant uuid;
  _next   bigint;
BEGIN
  _tenant := get_user_tenant();

  SELECT COALESCE(MAX(
    CASE
      WHEN numero ~ '^\d+$'   THEN numero::bigint
      -- Solo los dígitos pegados a OC-. Así OC-0002-01 (cuota de una compra
      -- financiada) cuenta como el 2 de su compra madre y no rompe el cast.
      WHEN numero ~ '^OC-\d+' THEN (regexp_match(numero, '^OC-(\d+)'))[1]::bigint
      ELSE 0
    END
  ), 0) + 1 INTO _next
  FROM compras
  WHERE tenant_id = _tenant;

  RETURN 'OC-' || LPAD(_next::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_compra_numero() TO authenticated;

-- ---------------------------------------------------------------------
-- Ponerle número a las compras que se grabaron sin él mientras la función
-- estuvo rota. A cada una le toca el siguiente consecutivo de SU empresa.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r     record;
  _next bigint;
BEGIN
  FOR r IN
    SELECT id, tenant_id
      FROM public.compras
     WHERE btrim(COALESCE(numero, '')) = ''
     ORDER BY tenant_id, created_at
  LOOP
    SELECT COALESCE(MAX(
      CASE
        WHEN numero ~ '^\d+$'   THEN numero::bigint
        WHEN numero ~ '^OC-\d+' THEN (regexp_match(numero, '^OC-(\d+)'))[1]::bigint
        ELSE 0
      END
    ), 0) + 1 INTO _next
    FROM public.compras
    WHERE tenant_id = r.tenant_id;

    UPDATE public.compras
       SET numero = 'OC-' || LPAD(_next::text, 4, '0')
     WHERE id = r.id;

    RAISE NOTICE 'Compra % (tenant %) numerada como OC-%',
      r.id, r.tenant_id, LPAD(_next::text, 4, '0');
  END LOOP;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_numeracion_compras_pagares.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) Ya no debe quedar ninguna compra sin número
SELECT tenant_id, count(*) AS sin_numero
FROM public.compras
WHERE btrim(COALESCE(numero, '')) = ''
GROUP BY tenant_id;
-- esperado: 0 filas

-- 2) La cuenta que hace la función, simulada para Caminero: el máximo debe
--    salir de OC-0002 (no reventar con OC-0002-01)
SELECT COALESCE(MAX(
         CASE
           WHEN numero ~ '^\d+$'   THEN numero::bigint
           WHEN numero ~ '^OC-\d+' THEN (regexp_match(numero, '^OC-(\d+)'))[1]::bigint
           ELSE 0
         END), 0) AS ultimo_consecutivo
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113';
-- esperado: 3 (OC-0003, que es la compra que acaba de numerarse)

-- 3) La compra que estaba sin número, ya con el suyo
SELECT numero, ncf, referencia, fecha, total_compra, estado
FROM public.compras
WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND ncf = 'E310000014628';
-- esperado: numero OC-0003 | 145,628.83
