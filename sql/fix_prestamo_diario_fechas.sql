-- =====================================================================
-- Un préstamo DIARIO vencía por MESES: 365 cuotas repartidas en 30 años
-- ---------------------------------------------------------------------
-- (2026-08-06) "analiza ese préstamo a ver si fue digitado mal, o el sistema
-- le está asignando la fecha mal. el orden y el monto está bien, solo que la
-- fecha debería ser diaria."
--
-- No fue digitado mal. Lo que hay en la base es exactamente lo que se tecleó:
--
--   PT-0026602 · PEDRO LIVIO JIMENEZ · 78,100 · 365 cuotas de 300
--   frecuencia = 'diario' · fecha_primera_cuota = 2026-08-04   ← todo correcto
--
-- Lo que salió mal son las FECHAS que el sistema les puso:
--
--   cuota 1   vence 04/08/2026
--   cuota 2   vence 04/09/2026   ← un MES después, no un día
--   cuota 365 vence 04/12/2056   ← el préstamo termina en 30 AÑOS
--
-- >>> LA CAUSA <<<
-- calc_amortizacion reparte las fechas con un CASE por frecuencia:
--
--   CASE p_frecuencia
--     WHEN 'semanal'   THEN p_fecha_primera + ((k-1) * 7)
--     WHEN 'quincenal' THEN p_fecha_primera + ((k-1) * 15)
--     ELSE (p_fecha_primera + ((k-1) || ' months')::interval)::date
--   END
--
-- 'diario' NO ESTÁ. Nunca estuvo: el comentario de la función todavía dice
-- "mensual | quincenal | semanal", porque el cobro diario se agregó después y
-- esta función no se tocó. Así que cae en el ELSE, que suma MESES.
--
-- No dio la cara antes porque PT-0026602 es el ÚNICO préstamo diario que
-- existe en todo el sistema. Es el mismo préstamo que ya destapó el corte de
-- lpad a 99 cuotas: es el primero que se sale de lo de siempre.
--
-- >>> EL DAÑO SE PROPAGÓ <<<
-- Las cuentas por pagar a Caminero se arman agrupando las cuotas POR MES.
-- Como cada cuota caía en un mes distinto, la agrupación hizo lo que le
-- tocaba y dejó 365 renglones — uno por mes — en vez de 13. La agrupación no
-- está mal; le entraron fechas malas.
--
-- >>> QUÉ HACE ESTE ARCHIVO <<<
--   1. calc_amortizacion aprende 'diario' (y se arregla igual el préstamo a
--      vencimiento, que tenía el mismo hueco).
--   2. Corrige las fechas de las cuotas ya emitidas de préstamos diarios.
--   3. Rehace sus cuentas por pagar, ahora sí una por mes.
--
-- Los MONTOS no se tocan en ningún paso: 300 por cuota, 78,100 de capital.
-- Los 4 pagos ya aplicados tampoco: siguen en sus mismas cuotas 1-4.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) LA FUNCIÓN APRENDE 'diario'
-- ------------------------------------------------------------
-- Se parchea la definición VIVA (todas las sobrecargas), no un CREATE nuevo:
-- calc_amortizacion se ha redefinido varias veces (método a vencimiento,
-- cuota ajustada) y reescribirla entera aquí borraría lo último que tenga.
DO $$
DECLARE
  r       record;
  v_src   text;
  v_tocadas int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, pg_get_functiondef(p.oid) AS src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'calc_amortizacion'
  LOOP
    v_src := r.src;

    IF position('''diario''' in v_src) > 0 THEN
      RAISE NOTICE 'Ya sabía de diario (oid %), se deja como está.', r.oid;
      CONTINUE;
    END IF;

    -- tabla de cuotas: un día por cuota
    v_src := regexp_replace(v_src,
      'WHEN ''semanal''\s+THEN p_fecha_primera \+ \(\(k-1\) \* 7\)',
      'WHEN ''diario''    THEN p_fecha_primera + (k-1)' || E'\n                 ' || '\&',
      'g');

    -- método a vencimiento: el plazo completo en días
    v_src := regexp_replace(v_src,
      'WHEN ''semanal''\s+THEN p_fecha_primera \+ \(p_plazo \* 7\)',
      'WHEN ''diario''    THEN p_fecha_primera + p_plazo' || E'\n                 ' || '\&',
      'g');

    IF position('''diario''' in v_src) = 0 THEN
      RAISE EXCEPTION 'No se encontró el CASE de frecuencias en calc_amortizacion (oid %) — revisar a mano.', r.oid;
    END IF;

    EXECUTE v_src;
    v_tocadas := v_tocadas + 1;
  END LOOP;

  IF v_tocadas = 0 THEN
    RAISE NOTICE 'Nada que parchear: calc_amortizacion ya contempla el cobro diario.';
  ELSE
    RAISE NOTICE 'calc_amortizacion arreglada (% definiciones): diario suma DÍAS.', v_tocadas;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2) LAS CUOTAS YA EMITIDAS
-- ------------------------------------------------------------
-- La cuota k de un préstamo diario vence k-1 días después de la primera.
-- Solo cambia la FECHA: número, capital, interés, monto y lo ya pagado
-- se quedan intactos, así que los 4 pagos de PT-0026602 no se mueven.
UPDATE public.prestamo_cuotas q
   SET fecha_vencimiento = p.fecha_primera_cuota + (q.numero_cuota - 1)
  FROM public.prestamos p
 WHERE p.id = q.prestamo_id
   AND p.frecuencia = 'diario'
   AND p.fecha_primera_cuota IS NOT NULL
   AND q.fecha_vencimiento IS DISTINCT FROM p.fecha_primera_cuota + (q.numero_cuota - 1);

-- ------------------------------------------------------------
-- 3) LAS CUENTAS POR PAGAR, REHECHAS SOBRE LAS FECHAS BUENAS
-- ------------------------------------------------------------
-- Se rehacen desde las cuotas ya corregidas, agrupando por mes igual que
-- cxp_financiamiento_agrupado_por_mes.sql. Si alguna CxP del bloque ya tiene
-- un abono NO se toca nada de ese financiamiento: el abono quedaría huérfano.
DO $$
DECLARE
  pr        record;
  v_pref    text;
  v_prov    uuid;
  v_fecha   date;
  v_base    text;
  v_conpago int;
  v_n       int;
BEGIN
  FOR pr IN
    SELECT p.id, p.tenant_id, p.plazo_cuotas,
           substring(p.notas from 'factura #(\d+)') AS fac
    FROM public.prestamos p
    WHERE p.frecuencia IN ('diario', 'semanal')
      AND p.notas ~ 'factura #\d+'
  LOOP
    SELECT COUNT(*) FILTER (WHERE COALESCE(c.monto_pagado, 0) > 0),
           (array_agg(substring(c.numero from '^(FIN-\d+)') ORDER BY c.numero))[1],
           (array_agg(c.suplidor_id ORDER BY c.numero))[1],
           MIN(c.fecha),
           split_part((array_agg(c.referencia ORDER BY c.numero))[1], ' | cuota', 1)
      INTO v_conpago, v_pref, v_prov, v_fecha, v_base
      FROM public.compras c
     WHERE c.tenant_id = pr.tenant_id
       AND c.numero ~ '^FIN-\d+'
       AND c.referencia ~ ('factura #' || pr.fac || '(\D|$)');

    IF v_pref IS NULL THEN CONTINUE; END IF;

    IF v_conpago > 0 THEN
      RAISE NOTICE '%: % renglones ya tienen abono — no se toca.', v_pref, v_conpago;
      CONTINUE;
    END IF;

    DELETE FROM public.compras
     WHERE tenant_id = pr.tenant_id
       AND numero ~ ('^' || v_pref || '-')
       AND COALESCE(monto_pagado, 0) = 0;

    INSERT INTO public.compras (
      tenant_id, numero, fecha, suplidor_id, referencia,
      total_exento, total_gravado, itbis_total, total_compra,
      forma_pago, dias_credito, monto_pagado, monto_pendiente, estado,
      itbis_incluido, actualizar_precios
    )
    SELECT pr.tenant_id,
           v_pref || '-M' || to_char(x.vence, 'YYYYMM'),
           v_fecha,
           v_prov,
           v_base || CASE WHEN x.desde = x.hasta
                          THEN ' | cuota ' || x.desde || '/' || pr.plazo_cuotas
                          ELSE ' | cuotas ' || x.desde || '-' || x.hasta || '/' || pr.plazo_cuotas
                               || ' (' || to_char(x.vence, 'MM/YYYY') || ')' END,
           x.monto, 0, 0, x.monto,
           'CREDITO', GREATEST(0, x.vence - v_fecha), 0, x.monto, 'PENDIENTE',
           false, false
      FROM (
        SELECT MIN(q.numero_cuota) AS desde,
               MAX(q.numero_cuota) AS hasta,
               -- vence con la ÚLTIMA del mes: la financiera no le debe al
               -- dealer un mes que todavía no terminó de cobrarle al cliente.
               MAX(q.fecha_vencimiento) AS vence,
               SUM(q.capital) AS monto
          FROM public.prestamo_cuotas q
         WHERE q.prestamo_id = pr.id
         GROUP BY to_char(q.fecha_vencimiento, 'YYYY-MM')
      ) x
    ON CONFLICT (tenant_id, numero) DO NOTHING;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '%: % cuentas por pagar, una por mes.', v_pref, v_n;
  END LOOP;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('fix_prestamo_diario_fechas.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) EL CALENDARIO YA ES DIARIO
SELECT q.numero_cuota, q.fecha_vencimiento, q.monto_cuota, q.estado
FROM public.prestamo_cuotas q
JOIN public.prestamos p ON p.id = q.prestamo_id
WHERE p.numero = 'PT-0026602'
  AND q.numero_cuota IN (1, 2, 3, 5, 30, 365)
ORDER BY q.numero_cuota;
-- esperado: 1→04/08/2026, 2→05/08/2026, 3→06/08/2026, 5→08/08/2026,
--           30→02/09/2026 y la 365 el 03/08/2027. Un AÑO, no treinta.
--           Las cuotas 1 a 4 siguen en 'pagada'.

-- 2) LA PLATA NO SE MOVIÓ
SELECT COUNT(*) AS cuotas,
       SUM(capital) AS capital,
       SUM(monto_cuota) AS a_cobrar,
       SUM(capital_pagado + interes_pagado) AS ya_pagado
FROM public.prestamo_cuotas q
JOIN public.prestamos p ON p.id = q.prestamo_id
WHERE p.numero = 'PT-0026602';
-- esperado: 365 · 78,100.00 · 109,500.00 · 1,200.00 — igual que antes.

-- 3) LAS CUENTAS POR PAGAR: DE 365 RENGLONES A 13
SELECT numero, (fecha + dias_credito) AS vence, total_compra, referencia
FROM public.compras
WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'
  AND numero LIKE 'FIN-000011-%'
ORDER BY numero;
-- esperado: FIN-000011-M202608 … -M202708, 13 renglones, sumando 78,100.00.

-- 4) QUE NO QUEDE NINGÚN OTRO PRÉSTAMO CON EL PASO EQUIVOCADO
SELECT p.numero, p.frecuencia, p.plazo_cuotas,
       MIN(q.fecha_vencimiento) AS primera,
       MAX(q.fecha_vencimiento) AS ultima
FROM public.prestamos p
JOIN public.prestamo_cuotas q ON q.prestamo_id = p.id
WHERE p.frecuencia IN ('diario', 'semanal')
GROUP BY p.numero, p.frecuencia, p.plazo_cuotas
ORDER BY p.numero;
-- esperado: la última de un diario de 365 cae ~1 año después de la primera.
