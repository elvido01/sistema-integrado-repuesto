-- =====================================================================
-- GESTIÓN EMPRESARIAL: la cartera REAL, la misma que muestra su módulo
-- ---------------------------------------------------------------------
-- (2026-07-29) La posición mostraba RD$16,918,711 de cartera. Está mal: eso
-- es la suma de `prestamos.monto_capital`, o sea el capital ORIGINAL de cada
-- préstamo, sin descontar nada de lo ya cobrado. El módulo de cartera dice
-- lo que de verdad hay afuera:
--
--   Capital colocado      9,806,419.13   ← lo prestado que sigue afuera
--   Interés por cobrar    4,148,969.66
--   Mora pendiente          316,021.57
--   Total por cobrar     14,271,410.36
--
-- >>> POR QUÉ NO SE RECALCULA AQUÍ <<<
-- Se intentó sumando prestamo_cuotas (capital - capital_pagado) y da
-- 12,226,981 de capital y 422,560 de interés: nada que ver. La cuenta buena
-- necesita saber si cada préstamo separa interés o no, repartir la cuota
-- entre capital e interés cuando no lo separa, sumar el interés corriente y
-- prorratear la mora diaria con el gate del cliente. Todo eso ya vive en
-- get_resumen_cartera_financiera.
--
-- Así que se LLAMA a esa función en vez de reescribir su lógica. Si mañana
-- cambia la fórmula de mora, las dos pantallas cambian juntas — que es
-- justo lo que hay que evitar: dos números distintos para lo mismo.
--
-- >>> UNA LIMITACIÓN QUE CONVIENE SABER <<<
-- get_resumen_cartera_financiera trabaja sobre la empresa ACTIVA. Los
-- préstamos del grupo viven en MotoPréstamos, así que la cartera se ve al
-- abrir el panel desde MotoPréstamos. Desde Caminero saldría en cero, y por
-- eso la línea desaparece en vez de mostrar un cero que parezca un dato.
--
-- Idempotente / re-ejecutable. Requiere gestion_posicion_grupo.sql.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.gestion_cartera_resumen()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v json;
BEGIN
  -- Sin filtros: la cartera completa, tal como la ve el módulo al abrirlo.
  SELECT public.get_resumen_cartera_financiera(NULL, NULL, 'todos', NULL, NULL) INTO v;
  RETURN json_build_object(
    'capital',   COALESCE((v->>'capital_colocado')::numeric, 0),
    'interes',   COALESCE((v->>'interes_por_cobrar')::numeric, 0),
    'mora',      COALESCE((v->>'mora_pendiente')::numeric, 0),
    'total',     COALESCE((v->>'total_cxc')::numeric, 0),
    'prestamos', COALESCE((v->>'prestamos_activos')::int, 0)
  );
EXCEPTION WHEN OTHERS THEN
  -- Si la financiera no está activa para este usuario, la cartera no
  -- aplica. Devolver ceros es mejor que tumbar todo el panel.
  RETURN json_build_object('capital', 0, 'interes', 0, 'mora', 0, 'total', 0, 'prestamos', 0);
END $$;

GRANT EXECUTE ON FUNCTION public.gestion_cartera_resumen() TO authenticated, service_role;

-- ------------------------------------------------------------
-- La posición usa esos números
-- ------------------------------------------------------------
DO $$
DECLARE v_src text;
BEGIN
  -- Se reemplaza el bloque que sumaba monto_capital por la llamada al
  -- resumen real. Se hace por texto para no volver a pegar las 300 líneas
  -- de la función y arriesgar una diferencia.
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_gestion_empresarial_ia'
  LIMIT 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'Falta get_gestion_empresarial_ia — corre antes sql/gestion_posicion_grupo.sql';
  END IF;

  IF position('gestion_cartera_resumen' in v_src) > 0 THEN
    RAISE NOTICE 'La posición ya usa la cartera real — nada que cambiar.';
    RETURN;
  END IF;

  v_src := replace(v_src,
$viejo$  SELECT COUNT(*), COALESCE(SUM(pr.monto_capital), 0)
    INTO v_cartera_n, v_cartera
  FROM public.prestamos pr
  WHERE pr.tenant_id = ANY(v_grupo) AND pr.estado = 'activo';$viejo$,
$nuevo$  -- La cartera sale del MISMO resumen que muestra el módulo de cartera:
  -- reescribir aquí su fórmula (interés corriente, mora prorrateada, reparto
  -- capital/interés) garantizaría que un día digan números distintos.
  v_cartera_json := public.gestion_cartera_resumen();
  v_cartera      := COALESCE((v_cartera_json->>'capital')::numeric, 0);
  v_cartera_int  := COALESCE((v_cartera_json->>'interes')::numeric, 0);
  v_cartera_mora := COALESCE((v_cartera_json->>'mora')::numeric, 0);
  v_cartera_n    := COALESCE((v_cartera_json->>'prestamos')::int, 0);$nuevo$);

  -- variables nuevas
  v_src := replace(v_src,
    '  v_cartera     numeric := 0;',
    '  v_cartera     numeric := 0;' || E'\n' ||
    '  v_cartera_int numeric := 0;' || E'\n' ||
    '  v_cartera_mora numeric := 0;' || E'\n' ||
    '  v_cartera_json json;');

  -- el JSON de la posición: la cartera se abre en sus tres partes
  v_src := replace(v_src,
$viejo2$      'cartera_cantidad', v_cartera_n,
      'cartera_capital',  ROUND(v_cartera, 2),$viejo2$,
$nuevo2$      'cartera_cantidad', v_cartera_n,
      'cartera_capital',  ROUND(v_cartera, 2),
      'cartera_interes',  ROUND(v_cartera_int, 2),
      'cartera_mora',     ROUND(v_cartera_mora, 2),
      'cartera_total',    ROUND(v_cartera + v_cartera_int + v_cartera_mora, 2),$nuevo2$);

  -- el activo cuenta la cartera COMPLETA (capital + interés + mora), que es
  -- lo que el módulo llama "total cuentas por cobrar"
  v_src := replace(v_src,
    'ROUND(v_bancos + v_motos_valor + v_cartera + v_cxc, 2)',
    'ROUND(v_bancos + v_motos_valor + v_cartera + v_cartera_int + v_cartera_mora + v_cxc, 2)');
  v_src := replace(v_src,
    'ROUND(v_bancos + v_motos_valor + v_cartera + v_cxc - v_cxp - v_comp, 2)',
    'ROUND(v_bancos + v_motos_valor + v_cartera + v_cartera_int + v_cartera_mora + v_cxc - v_cxp - v_comp, 2)');

  EXECUTE v_src;
  RAISE NOTICE 'La posición ahora toma la cartera del módulo de cartera.';
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('gestion_cartera_real.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) Que la función quedó apuntando al resumen real
SELECT position('gestion_cartera_resumen' in pg_get_functiondef(p.oid)) > 0 AS usa_cartera_real
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_gestion_empresarial_ia';
-- esperado: true

-- 2) Los números de la cartera (los mismos del módulo de cartera).
--    OJO: hay que correrlo con una sesión de MotoPréstamos; desde el editor
--    SQL no hay usuario y devuelve ceros.
SELECT public.gestion_cartera_resumen();
-- desde la app, con MotoPréstamos activa:
--   capital 9,806,419.13 · interes 4,148,969.66 · mora 316,021.57
--   total 14,271,410.36 · prestamos 288
