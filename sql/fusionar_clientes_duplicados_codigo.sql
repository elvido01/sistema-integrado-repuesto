-- =====================================================================
-- Fusionar fichas de cliente duplicadas por mayúsculas/minúsculas
-- ---------------------------------------------------------------------
-- (2026-07-27) Reportado en MOTOPRESTAMOS LOS NARANJOS: el préstamo
-- PT-0026308 de MORLANT DIENOR mostraba como último pago el 12/04/2023,
-- cuando el sistema viejo dice 01/07/2026.
--
-- CAUSA: el SiiF tiene al mismo cliente escrito de dos formas —"RD1447762" y
-- "rd1447762"— con legacy_id distinto. La migración (fase1-cargar-clientes)
-- casaba el código SIN normalizar mayúsculas, así que creó una segunda ficha.
-- Los préstamos quedaron en la ficha vieja y los pagos nuevos en la duplicada:
--
--   ac419305  RD1447762  legacy      5142  → 18 préstamos, pagos hasta 2023
--   1f3dc6a9  rd1447762  legacy 200005145  →  1 préstamo,  pagos 2026
--
-- Los 6 pagos de la ficha duplicada (6,300 mensuales de ene a jul 2026) son
-- justo las 6 cuotas cobradas del PT-0026308, que tiene 15 cuotas y conserva
-- 9 pendientes. Por eso el préstamo se veía sin historial.
--
-- ALCANCE: 5 pares en todo el tenant (de 9,239 clientes). El resto está bien.
--   RD1447762 · 86FF5359442 · DO02018020 · HY3374284 · L70129067
--
-- QUÉ HACE
--   1. Empareja duplicados por código normalizado a MAYÚSCULAS, SIEMPRE
--      dentro del mismo tenant (nunca cruza empresas).
--   2. Mueve TODO lo que apunte al duplicado hacia la ficha que se queda.
--      Las tablas se descubren solas leyendo las claves foráneas del catálogo
--      de Postgres, así no se queda nada atrás si mañana se agrega una tabla.
--   3. Rellena en la ficha que sobrevive los datos que tenga vacíos y el
--      duplicado sí traiga (p.ej. el teléfono 829-772-8476 de MORLANT).
--   4. Borra el duplicado, ya sin referencias.
--
-- SOBREVIVE la ficha de legacy_id bajo (la vieja): es la que tiene el
-- historial largo de préstamos. La duplicada siempre trae legacy_id >= 200M,
-- que es el rango que usa la migración para el origen secundario.
--
-- Es transaccional: si algo falla no se aplica nada. Idempotente: al correrlo
-- de nuevo ya no encuentra pares y no hace nada.
--
-- El arreglo de raíz va en scripts/migracion-siif/fase1-cargar-clientes.mjs,
-- que ahora indexa y busca el código en MAYÚSCULAS.
-- =====================================================================

DO $$
DECLARE
  r         record;
  fk        record;
  v_movidas bigint;
  v_pares   int := 0;
  v_filas   bigint := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (dup.id)
           dup.id        AS dup_id,
           dup.legacy_id AS dup_legacy,
           dup.codigo    AS dup_codigo,
           ori.id        AS ori_id,
           ori.legacy_id AS ori_legacy,
           ori.codigo    AS ori_codigo,
           ori.nombre    AS nombre
      FROM public.clientes dup
      JOIN public.clientes ori
        ON ori.tenant_id = dup.tenant_id      -- NUNCA fusionar entre empresas
       AND ori.id <> dup.id
       AND upper(btrim(ori.codigo)) = upper(btrim(dup.codigo))
     WHERE dup.legacy_id >= 200000000         -- la ficha secundaria
       AND COALESCE(ori.legacy_id, 0) < 200000000
       AND btrim(COALESCE(dup.codigo, '')) <> ''
     ORDER BY dup.id, ori.legacy_id           -- si hubiera varias, gana la más vieja
  LOOP
    v_pares := v_pares + 1;

    -- 1) Mover todo lo que referencie al duplicado. Las columnas salen del
    --    catálogo de Postgres, no de una lista escrita a mano.
    FOR fk IN
      SELECT con.conrelid::regclass::text AS tabla, att.attname AS col
        FROM pg_constraint con
        CROSS JOIN LATERAL unnest(con.conkey) AS k(attnum)
        JOIN pg_attribute att
          ON att.attrelid = con.conrelid AND att.attnum = k.attnum
       WHERE con.contype = 'f'
         AND con.confrelid = 'public.clientes'::regclass
         AND array_length(con.conkey, 1) = 1   -- solo FK de una columna
    LOOP
      EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', fk.tabla, fk.col, fk.col)
        USING r.ori_id, r.dup_id;
      GET DIAGNOSTICS v_movidas = ROW_COUNT;
      IF v_movidas > 0 THEN
        v_filas := v_filas + v_movidas;
        RAISE NOTICE '  % : % fila(s) de %.%', r.ori_codigo, v_movidas, fk.tabla, fk.col;
      END IF;
    END LOOP;

    -- 2) Recuperar de la ficha duplicada lo que la buena tenga vacío
    UPDATE public.clientes ori
       SET telefono  = COALESCE(ori.telefono,  dup.telefono),
           direccion = COALESCE(ori.direccion, dup.direccion),
           email     = COALESCE(ori.email,     dup.email),
           rnc       = COALESCE(ori.rnc,       dup.rnc)
      FROM public.clientes dup
     WHERE ori.id = r.ori_id AND dup.id = r.dup_id;

    -- 3) Ya no la referencia nada: fuera
    DELETE FROM public.clientes WHERE id = r.dup_id;

    RAISE NOTICE 'Fusionado % (%) : legacy % absorbe a legacy %',
      r.nombre, r.ori_codigo, r.ori_legacy, r.dup_legacy;
  END LOOP;

  RAISE NOTICE '--- % par(es) fusionado(s), % fila(s) reasignada(s) ---', v_pares, v_filas;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fusionar_clientes_duplicados_codigo.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) EL CASO REPORTADO: MORLANT DIENOR debe quedar en UNA sola ficha,
--    con el último pago del 01/07/2026 y su teléfono recuperado
SELECT c.id, c.nombre, c.codigo, c.legacy_id, c.telefono,
       (SELECT count(*) FROM public.prestamos p WHERE p.cliente_id = c.id)      AS prestamos,
       (SELECT count(*) FROM public.prestamo_pagos g WHERE g.cliente_id = c.id) AS pagos,
       (SELECT max(g.fecha) FROM public.prestamo_pagos g WHERE g.cliente_id = c.id) AS ultimo_pago
FROM public.clientes c
WHERE upper(btrim(c.codigo)) = 'RD1447762';
-- esperado: 1 sola fila | 19 préstamos | 66 pagos | ultimo_pago 2026-07-01
--           telefono 829-772-8476

-- 2) No debe quedar NINGÚN código repetido (ignorando mayúsculas/minúsculas)
SELECT c.tenant_id, upper(btrim(c.codigo)) AS codigo, count(*) AS fichas,
       string_agg(c.legacy_id::text, ' / ' ORDER BY c.legacy_id) AS legacy_ids
FROM public.clientes c
WHERE btrim(COALESCE(c.codigo, '')) <> ''
GROUP BY c.tenant_id, upper(btrim(c.codigo))
HAVING count(*) > 1
ORDER BY fichas DESC;
-- esperado: 0 filas

-- 3) Los 5 códigos del reporte, uno por uno
SELECT upper(btrim(c.codigo)) AS codigo, count(*) AS fichas
FROM public.clientes c
WHERE upper(btrim(c.codigo)) IN ('RD1447762','86FF5359442','DO02018020','HY3374284','L70129067')
GROUP BY 1 ORDER BY 1;
-- esperado: los 5 con fichas = 1

-- 4) El préstamo PT-0026308 y su cliente ya apuntan a la misma ficha
SELECT p.numero, p.fecha_inicio, p.plazo_cuotas, p.estado,
       cl.nombre, cl.codigo,
       (SELECT max(g.fecha) FROM public.prestamo_pagos g WHERE g.cliente_id = cl.id) AS ultimo_pago_cliente,
       (SELECT count(*) FROM public.prestamo_cuotas q WHERE q.prestamo_id = p.id AND q.estado = 'pendiente') AS cuotas_pendientes,
       (SELECT COALESCE(SUM(q.monto_cuota), 0) FROM public.prestamo_cuotas q WHERE q.prestamo_id = p.id AND q.estado = 'pendiente') AS balance
FROM public.prestamos p
JOIN public.clientes cl ON cl.id = p.cliente_id
WHERE p.numero = 'PT-0026308';
-- esperado: ultimo_pago_cliente 2026-07-01 | 9 cuotas pendientes | balance 56,700
--           (56,700 es el "Balance Anterior" que muestra el sistema viejo)
