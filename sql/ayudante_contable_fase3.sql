-- ============================================================
-- Ayudante contable — Fase 3 (13/11/2026)
-- ------------------------------------------------------------
-- 1. Hoja del IT-1 (y su Anexo A) casilla por casilla, con los números del
--    mes, para copiarla en la Oficina Virtual. Casillas según el
--    "Instructivo Llenado del Formulario IT-1 2020" de la DGII (ed. julio 2026).
-- 2. Hoja del IR-17: el ISR retenido a suplidores, por suplidor.
-- 3. Guía paso a paso del mes, armada según la empresa (persona física o
--    sociedad, con nómina o sin ella) y con las plantillas oficiales.
-- 4. Corrección de la Fase 1: el ITBIS retenido a suplidores se paga en el
--    IT-1 (casillas 39-63), NO en el IR-17, que es solo de ISR.
--
-- Las reglas de "qué compra entra al 606" pasan a UNA función
-- (_contab_compras_606) que usan el resumen y la hoja. Siguen duplicadas en
-- src/lib/dgiiExport.js (revisar606): si cambia una, cambia la otra.
-- Todo es de solo lectura. Depende de las fases 1 y 2.
-- ============================================================

-- ---------- Compras y gastos del mes, con el motivo si no entran al 606 ----------
CREATE OR REPLACE FUNCTION public._contab_compras_606(p_tenant uuid, p_ini date, p_fin date)
RETURNS TABLE (id uuid, origen text, proveedor text, rnc text, ncf text, tipo text, es_servicio boolean,
               base numeric, itbis numeric, total numeric, itbis_ret numeric, isr_ret numeric, isr_pct numeric, motivo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  WITH emp AS (
    SELECT regexp_replace(COALESCE((SELECT ce.rnc FROM public.config_empresa ce WHERE ce.tenant_id = p_tenant), ''), '\D', '', 'g') AS rnc
  ), c AS (
    SELECT co.id, 'compra'::text AS origen, pv.nombre::text AS proveedor,
           COALESCE(co.itbis_total, 0) AS itbis, COALESCE(co.total_compra, 0) AS total,
           COALESCE(co.total_gravado, 0) + COALESCE(co.total_exento, 0) AS base,
           COALESCE(co.itbis_retenido_pct, 0) AS itbis_ret_pct, COALESCE(co.isr_retenido_pct, 0) AS isr_pct,
           upper(regexp_replace(COALESCE(co.ncf, ''), '[\s-]', '', 'g')) AS ncf,
           regexp_replace(COALESCE(pv.rnc, ''), '\D', '', 'g') AS rnc,
           CASE WHEN btrim(COALESCE(co.tipo_bienes_servicios, '')) ~ '^\d{1,2}$' THEN btrim(co.tipo_bienes_servicios)::int ELSE 9 END AS tbs
      FROM public.compras co
      LEFT JOIN public.proveedores pv ON pv.id = co.suplidor_id
     WHERE co.tenant_id = p_tenant AND co.fecha >= p_ini AND co.fecha < p_fin
       AND COALESCE(co.estado, '') <> 'ANULADA' AND NOT COALESCE(co.es_saldo_inicial, false)
    UNION ALL
    -- Comprobantes de gastos APROBADOS (foto de la factura del gasto).
    SELECT g.id, 'gasto', g.proveedor_nombre::text, COALESCE(g.itbis, 0), COALESCE(g.total, 0),
           COALESCE(g.monto_gravado, 0) + COALESCE(g.monto_exento, 0), 0::numeric, 0::numeric,
           COALESCE(g.ncf, ''), COALESCE(g.rnc, ''), COALESCE(g.tipo_bs, 2)::int
      FROM public.gastos_comprobantes g
     WHERE g.tenant_id = p_tenant AND g.fecha >= p_ini AND g.fecha < p_fin AND g.estado = 'aprobado' AND g.entra_606
  ), k0 AS (
    SELECT c.*, left(c.ncf, 3) AS tipo, (SELECT rnc FROM emp) AS rnc_emp,
      CASE
        WHEN c.ncf = '' THEN 'sin_ncf'
        WHEN c.ncf !~ '^(B\d{10}|E\d{12})$' THEN 'ncf_mal'
        WHEN left(c.ncf, 3) IN ('B02', 'E32') THEN 'consumo'
        WHEN left(c.ncf, 3) NOT IN ('B01','B03','B04','B11','B13','B14','B15','B17','E31','E33','E34','E41','E43','E44','E45','E47') THEN 'tipo'
        WHEN left(c.ncf, 3) IN ('B13','B17','E43','E47') AND length((SELECT rnc FROM emp)) NOT IN (9, 11) THEN 'rnc_empresa'
        WHEN left(c.ncf, 3) NOT IN ('B13','B17','E43','E47') AND length(c.rnc) NOT IN (9, 11) THEN 'rnc'
        -- MotoFlow no guarda el NCF modificado ni el tipo de retención de ISR:
        -- revisar606 las deja fuera del TXT (se agregan a mano en la herramienta
        -- de la DGII), así que aquí tampoco cuentan como "en el 606".
        WHEN left(c.ncf, 3) IN ('B03','B04','E33','E34') THEN 'nota'
        WHEN c.isr_pct > 0 THEN 'ret_isr'
        ELSE 'ok' END AS motivo0
      FROM c
  )
  -- La misma factura (RNC + NCF) dos veces cuenta una sola: la otra sale
  -- como repetida, igual que en el 606.
  SELECT k0.id, k0.origen, k0.proveedor, k0.rnc, k0.ncf, k0.tipo,
         (CASE WHEN k0.tbs BETWEEN 1 AND 11 THEN k0.tbs ELSE 9 END) IN (1, 2, 3, 7, 11),
         k0.base, k0.itbis, k0.total,
         round(k0.itbis * k0.itbis_ret_pct / 100, 2), round(k0.base * k0.isr_pct / 100, 2), k0.isr_pct,
         CASE WHEN k0.motivo0 = 'ok'
               AND row_number() OVER (PARTITION BY k0.motivo0,
                     CASE WHEN k0.tipo IN ('B13','B17','E43','E47') THEN k0.rnc_emp ELSE k0.rnc END, k0.ncf
                     ORDER BY k0.id) > 1
              THEN 'repetida' ELSE k0.motivo0 END
    FROM k0
$f$;
REVOKE ALL ON FUNCTION public._contab_compras_606(uuid, date, date) FROM PUBLIC, anon, authenticated;

-- ---------- Ventas del mes con comprobante: lo que sale en el 607 ----------
-- base = total - ITBIS (lo facturado sin impuestos, ya con descuentos).
-- forma: la misma regla de formaPago607 en src/lib/dgiiExport.js.
CREATE OR REPLACE FUNCTION public._contab_ventas_607(p_tenant uuid, p_ini date, p_fin date)
RETURNS TABLE (id uuid, ncf text, tipo text, base numeric, exento numeric, base16 numeric, itbis numeric, total numeric,
               itbis_retenido numeric, forma text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  WITH f AS (
    SELECT fa.id, COALESCE(fa.itbis, 0) AS itbis, COALESCE(fa.total, 0) AS total, COALESCE(fa.itbis_retenido, 0) AS itbis_retenido,
           upper(COALESCE(fa.forma_pago, '')) AS fp, upper(COALESCE(fa.tipo_pago, '')) AS tp,
           upper(regexp_replace(COALESCE(NULLIF(btrim(fa.ncf), ''),
                    (SELECT COALESCE(d.ncf, d.encf, d.proveedor_number) FROM public.documentos_fiscales d
                      WHERE d.factura_id = fa.id AND d.estado = 'emitido'
                      ORDER BY d.created_at DESC LIMIT 1), ''), '[\s-]', '', 'g')) AS ncf
      FROM public.facturas fa
     -- facturas.fecha es timestamptz: el mes va por la hora de República Dominicana.
     WHERE fa.tenant_id = p_tenant
       AND fa.fecha >= (p_ini::timestamp AT TIME ZONE 'America/Santo_Domingo')
       AND fa.fecha <  (p_fin::timestamp AT TIME ZONE 'America/Santo_Domingo')
       AND COALESCE(fa.estado, '') <> 'ANULADA' AND NOT COALESCE(fa.es_saldo_inicial, false)
  ), d AS (
    -- Por líneas: lo exento (línea sin ITBIS) y lo gravado al 16 %.
    SELECT fd.factura_id,
           sum(fd.importe) FILTER (WHERE COALESCE(fd.itbis, 0) = 0) AS exento,
           sum(fd.importe - fd.itbis) FILTER (WHERE COALESCE(fd.itbis, 0) > 0 AND fd.importe > fd.itbis
                                               AND fd.itbis / (fd.importe - fd.itbis) BETWEEN 0.155 AND 0.165) AS base16
      FROM public.facturas_detalle fd
     WHERE fd.factura_id IN (SELECT f.id FROM f WHERE f.ncf <> '')
     GROUP BY fd.factura_id
  )
  SELECT f.id, f.ncf, substr(f.ncf, 2, 2), f.total - f.itbis,
         CASE WHEN f.itbis = 0 THEN f.total ELSE LEAST(COALESCE(d.exento, 0), f.total - f.itbis) END,
         CASE WHEN f.itbis = 0 THEN 0 ELSE LEAST(COALESCE(d.base16, 0), f.total - f.itbis) END,
         f.itbis, f.total, f.itbis_retenido,
         CASE WHEN f.fp ~ 'CR[EÉ]DITO' OR f.tp ~ '^CR[EÉ]DITO$' THEN 'credito'
              -- Varios medios en una venta (EFECTIVO/TARJETA): el reparto no se guarda.
              WHEN (f.tp ~ 'TARJETA|VISA|MASTER')::int + (f.tp ~ 'CHEQUE|TRANSFER|DEP[OÓ]SIT')::int + (f.tp ~ 'EFECTIVO')::int > 1 THEN 'otros'
              WHEN f.fp || ' ' || f.tp ~ 'TARJETA|VISA|MASTER' THEN 'tarjeta'
              WHEN f.fp || ' ' || f.tp ~ 'CHEQUE|TRANSFER|DEP[OÓ]SIT' THEN 'cheque'
              WHEN f.fp || ' ' || f.tp ~ 'EFECTIVO|CONTADO' THEN 'efectivo'
              ELSE 'otros' END
    FROM f LEFT JOIN d ON d.factura_id = f.id
   WHERE f.ncf <> ''
$f$;
REVOKE ALL ON FUNCTION public._contab_ventas_607(uuid, date, date) FROM PUBLIC, anon, authenticated;

-- ---------- Compromisos (Fase 1) con el IR-17 corregido ----------
-- El IR-17 es SOLO de retenciones de ISR. El ITBIS retenido a suplidores se
-- declara y se paga dentro del IT-1.
CREATE OR REPLACE FUNCTION public._contab_compromisos(p_tenant uuid, p_anio int, p_mes int)
RETURNS TABLE (clave text, nombre text, periodo text, vence date, detalle text, confirmar boolean, hecho boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  v_ini date := make_date(p_anio, p_mes, 1);
  v_sig date := (v_ini + interval '1 month')::date;          -- mes en que se presenta
  v_per text := to_char(v_ini, 'YYYY-MM');
  v_rnc text; v_cierre int; v_fisica boolean; v_nomina boolean; v_retiene_isr boolean; v_retiene_itbis boolean;
  v_fin_ejercicio date; v_vence_anual date;
BEGIN
  SELECT regexp_replace(COALESCE(ce.rnc, ''), '\D', '', 'g'), ce.cierre_fiscal_mes
    INTO v_rnc, v_cierre FROM public.config_empresa ce WHERE ce.tenant_id = p_tenant;
  v_fisica := length(v_rnc) = 11;                             -- cédula = persona física
  v_nomina := EXISTS (SELECT 1 FROM public.nominas n WHERE n.tenant_id = p_tenant);
  SELECT COALESCE(bool_or(COALESCE(c.isr_retenido_pct, 0) > 0), false), COALESCE(bool_or(COALESCE(c.itbis_retenido_pct, 0) > 0), false)
    INTO v_retiene_isr, v_retiene_itbis
    FROM public.compras c
   WHERE c.tenant_id = p_tenant AND c.fecha >= v_ini AND c.fecha < v_sig AND COALESCE(c.estado, '') <> 'ANULADA';

  RETURN QUERY
  SELECT x.clave, x.nombre, x.periodo, x.vence, x.detalle, x.confirmar,
         EXISTS (SELECT 1 FROM public.contab_compromisos_hechos h
                  WHERE h.tenant_id = p_tenant AND h.clave = x.clave AND h.periodo = x.periodo)
  FROM (
    SELECT 'ir3'::text AS clave, 'IR-3 · Retenciones de asalariados'::text AS nombre, v_per AS periodo,
           public._contab_dia_habil(v_sig + 9) AS vence,
           'Retenciones de ISR a los empleados de la nómina del mes.'::text AS detalle, false AS confirmar
     WHERE v_nomina
    UNION ALL
    SELECT 'ir17', 'IR-17 · Otras retenciones', v_per, public._contab_dia_habil(v_sig + 9),
           'ISR que le retuvo a suplidores en el mes (alquileres, honorarios). Primero el Anexo R9C.', false
     WHERE v_retiene_isr
    UNION ALL
    SELECT 'tss', 'TSS · Seguridad social', v_per, public._contab_dia_habil(v_sig + 2),
           'Pago de la nómina del mes en el SUIR. Confirme la fecha exacta en la TSS.', true
     WHERE v_nomina
    UNION ALL
    SELECT '606', 'Formato 606 · Compras y gastos', v_per, public._contab_dia_habil(v_sig + 14),
           'Se genera en Reportes DGII y se sube a la Oficina Virtual.', false
    UNION ALL
    SELECT '607', 'Formato 607 · Ventas', v_per, public._contab_dia_habil(v_sig + 14),
           'Se genera en Reportes DGII y se sube a la Oficina Virtual.', false
    UNION ALL
    SELECT '608', 'Formato 608 · Comprobantes anulados', v_per, public._contab_dia_habil(v_sig + 14),
           'Solo si anuló comprobantes en el mes.', false
    UNION ALL
    SELECT 'anticipo', 'Anticipo del Impuesto sobre la Renta', v_per, public._contab_dia_habil(v_sig + 14),
           'Si la DGII le fijó anticipos. Confirme el monto y la fecha en su Oficina Virtual.', true
    UNION ALL
    SELECT 'it1', 'IT-1 · Declaración del ITBIS', v_per, public._contab_dia_habil(v_sig + 19),
           CASE WHEN v_retiene_itbis THEN 'Debe cuadrar con el 606 y el 607. Incluye el ITBIS que le retuvo a suplidores.'
                ELSE 'Debe cuadrar con el 606 y el 607 del mes. Use la Hoja del IT-1.' END, false
  ) x;

  -- Anuales: se muestran en el período cuyo mes siguiente es el del vencimiento.
  IF v_fisica THEN
    IF extract(month FROM v_sig) = 3 THEN
      RETURN QUERY SELECT 'ir1'::text, 'IR-1 · Renta de personas físicas'::text,
        (extract(year FROM v_sig)::int - 1)::text, public._contab_dia_habil(make_date(extract(year FROM v_sig)::int, 3, 31)),
        'Declaración jurada anual del año anterior.'::text, false,
        EXISTS (SELECT 1 FROM public.contab_compromisos_hechos h WHERE h.tenant_id = p_tenant AND h.clave = 'ir1'
                   AND h.periodo = (extract(year FROM v_sig)::int - 1)::text);
    END IF;
  ELSE
    -- Cierre más reciente en o antes del mes de presentación; vence 120 días después.
    v_fin_ejercicio := (make_date(extract(year FROM v_sig)::int, v_cierre, 1) + interval '1 month' - interval '1 day')::date;
    IF v_fin_ejercicio > v_sig THEN v_fin_ejercicio := (v_fin_ejercicio - interval '1 year')::date; END IF;
    v_vence_anual := public._contab_dia_habil(v_fin_ejercicio + 120);
    IF date_trunc('month', v_vence_anual) = date_trunc('month', v_sig) THEN
      RETURN QUERY
      SELECT a.clave, a.nombre, to_char(v_fin_ejercicio, 'YYYY'), v_vence_anual, a.detalle, false,
             EXISTS (SELECT 1 FROM public.contab_compromisos_hechos h WHERE h.tenant_id = p_tenant
                        AND h.clave = a.clave AND h.periodo = to_char(v_fin_ejercicio, 'YYYY'))
        FROM (VALUES ('ir2', 'IR-2 · Renta de sociedades', 'Declaración jurada anual: 120 días después del cierre fiscal.'),
                     ('act', 'ACT · Impuesto sobre los activos', 'Se presenta junto con el IR-2.')) a(clave, nombre, detalle);
    END IF;
  END IF;
END $f$;
REVOKE ALL ON FUNCTION public._contab_compromisos(uuid, int, int) FROM PUBLIC, anon, authenticated;

-- ---------- El resumen del mes (Fases 1 y 2) sobre las funciones comunes ----------
-- Nuevo: itbis.retenido_a_suplidores y itbis.total_a_pagar (lo propio + lo
-- retenido a suplidores, que se paga en el mismo IT-1).
CREATE OR REPLACE FUNCTION public.contab_resumen_mes(p_anio int, p_mes int)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  v_t uuid := public.get_user_tenant();
  v_ini date; v_fin date; v_ini_ts timestamptz; v_fin_ts timestamptz;
  v_saldo numeric;
  v_ventas jsonb; v_sin jsonb; v_dev numeric; v_compras jsonb; v_gastos jsonb; v_comp jsonb; v_por_revisar jsonb;
  v_itbis_ventas numeric; v_itbis_ret numeric; v_itbis_adel numeric; v_ret_supl numeric; v_estimado numeric;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  IF p_mes NOT BETWEEN 1 AND 12 OR p_anio NOT BETWEEN 2000 AND 2100 THEN RAISE EXCEPTION 'Período inválido'; END IF;
  v_ini := make_date(p_anio, p_mes, 1);
  v_fin := (v_ini + interval '1 month')::date;
  v_ini_ts := v_ini::timestamp AT TIME ZONE 'America/Santo_Domingo';
  v_fin_ts := v_fin::timestamp AT TIME ZONE 'America/Santo_Domingo';
  SELECT COALESCE((SELECT saldo_favor_anterior FROM public.contab_periodos
                    WHERE tenant_id = v_t AND anio = p_anio AND mes = p_mes), 0) INTO v_saldo;

  -- ===== Ventas con comprobante (607) =====
  SELECT jsonb_build_object(
      'con_ncf', count(*), 'base', COALESCE(sum(v.base), 0), 'itbis', COALESCE(sum(v.itbis), 0),
      'itbis_retenido', COALESCE(sum(v.itbis_retenido), 0))
    INTO v_ventas FROM public._contab_ventas_607(v_t, v_ini, v_fin) v;

  -- ===== Ventas sin comprobante: no salen en el 607 =====
  SELECT jsonb_build_object('sin_ncf', count(*), 'sin_ncf_total', COALESCE(sum(fa.total), 0), 'sin_ncf_itbis', COALESCE(sum(fa.itbis), 0))
    INTO v_sin
    FROM public.facturas fa
   WHERE fa.tenant_id = v_t AND fa.fecha >= v_ini_ts AND fa.fecha < v_fin_ts
     AND COALESCE(fa.estado, '') <> 'ANULADA' AND NOT COALESCE(fa.es_saldo_inicial, false)
     AND NULLIF(btrim(fa.ncf), '') IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.documentos_fiscales d
                      WHERE d.factura_id = fa.id AND d.estado = 'emitido'
                        AND COALESCE(d.ncf, d.encf, d.proveedor_number) IS NOT NULL);
  v_ventas := v_ventas || v_sin;

  -- Devoluciones del mes sobre facturas con comprobante (notas de crédito).
  SELECT COALESCE(sum(dv.itbis_total), 0) INTO v_dev
    FROM public.devoluciones dv
   WHERE dv.tenant_id = v_t AND dv.fecha_devolucion >= v_ini AND dv.fecha_devolucion < v_fin
     AND COALESCE(btrim(dv.ncf_modificado), '') <> '';

  -- ===== Compras: lo que entra al 606 y lo que no =====
  SELECT jsonb_build_object(
      'en_606', count(*) FILTER (WHERE k.motivo = 'ok'),
      'itbis_adelantado', COALESCE(sum(k.itbis) FILTER (WHERE k.motivo = 'ok'), 0),
      -- Lo retenido se debe igual, aunque esa compra se agregue a mano al 606.
      'itbis_retenido_a_suplidores', COALESCE(sum(k.itbis_ret) FILTER (WHERE k.motivo IN ('ok', 'ret_isr')), 0),
      'isr_retenido_a_suplidores', COALESCE(sum(k.isr_ret) FILTER (WHERE k.motivo IN ('ok', 'ret_isr')), 0),
      'fuera', count(*) FILTER (WHERE k.motivo <> 'ok'),
      -- 'nota' y 'ret_isr' no se pierden: se agregan a mano en la herramienta de la DGII.
      'itbis_perdido', COALESCE(sum(k.itbis) FILTER (WHERE k.motivo NOT IN ('ok', 'nota', 'ret_isr')), 0),
      'a_mano', count(*) FILTER (WHERE k.motivo IN ('nota', 'ret_isr')),
      'motivos', COALESCE((SELECT jsonb_agg(jsonb_build_object('motivo', m.motivo, 'cantidad', m.n, 'monto', m.monto, 'itbis', m.itbis) ORDER BY m.itbis DESC)
                             FROM (SELECT k2.motivo, count(*) n, sum(k2.total) monto, sum(k2.itbis) itbis
                                     FROM public._contab_compras_606(v_t, v_ini, v_fin) k2
                                    WHERE k2.motivo <> 'ok' GROUP BY k2.motivo) m), '[]'::jsonb))
    INTO v_compras FROM public._contab_compras_606(v_t, v_ini, v_fin) k;

  -- ===== Gastos diarios: no llevan comprobante fiscal (no entran al 606) =====
  SELECT jsonb_build_object('cantidad', count(*), 'monto', COALESCE(sum(g.monto), 0))
    INTO v_gastos
    FROM public.gastos_diarios g
   WHERE g.tenant_id = v_t AND g.fecha >= v_ini AND g.fecha < v_fin AND NOT COALESCE(g.anulado, false)
     AND NOT COALESCE(g.es_tercero, false) AND COALESCE(g.tipo_gasto, '') NOT IN ('Nomina', 'Terceros');

  SELECT jsonb_build_object(
      'por_revisar', count(*) FILTER (WHERE g.estado = 'por_revisar'),
      'por_revisar_itbis', COALESCE(sum(g.itbis) FILTER (WHERE g.estado = 'por_revisar'), 0),
      'aprobados', count(*) FILTER (WHERE g.estado = 'aprobado' AND g.entra_606),
      'aprobados_itbis', COALESCE(sum(g.itbis) FILTER (WHERE g.estado = 'aprobado' AND g.entra_606), 0),
      'aprobados_fuera', count(*) FILTER (WHERE g.estado = 'aprobado' AND NOT g.entra_606))
    INTO v_por_revisar
    FROM public.gastos_comprobantes g
   WHERE g.tenant_id = v_t AND g.fecha >= v_ini AND g.fecha < v_fin;

  SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.vence, q.clave), '[]'::jsonb) INTO v_comp
    FROM public._contab_compromisos(v_t, p_anio, p_mes) q;

  v_itbis_ventas := (v_ventas->>'itbis')::numeric - v_dev;
  v_itbis_ret := (v_ventas->>'itbis_retenido')::numeric;
  v_itbis_adel := (v_compras->>'itbis_adelantado')::numeric;
  v_ret_supl := round((v_compras->>'itbis_retenido_a_suplidores')::numeric, 2);
  v_estimado := round(v_itbis_ventas - v_itbis_adel - v_itbis_ret - v_saldo, 2);

  RETURN jsonb_build_object(
    'anio', p_anio, 'mes', p_mes, 'cerrado', v_fin <= (now() AT TIME ZONE 'America/Santo_Domingo')::date,
    'ventas', v_ventas, 'devoluciones_itbis', v_dev, 'compras', v_compras, 'gastos_sin_comprobante', v_gastos,
    'comprobantes_gastos', v_por_revisar,
    'saldo_favor_anterior', v_saldo,
    'itbis', jsonb_build_object(
      'ventas', round(v_itbis_ventas, 2), 'adelantado', round(v_itbis_adel, 2),
      'retenido_por_clientes', round(v_itbis_ret, 2), 'saldo_favor_anterior', v_saldo,
      'a_pagar', GREATEST(v_estimado, 0), 'saldo_a_favor', GREATEST(-v_estimado, 0),
      'retenido_a_suplidores', v_ret_supl,
      'total_a_pagar', GREATEST(v_estimado, 0) + v_ret_supl),
    'compromisos', v_comp,
    'avisos', (SELECT contab_avisos FROM public.config_empresa WHERE tenant_id = v_t),
    'cierre_fiscal_mes', (SELECT cierre_fiscal_mes FROM public.config_empresa WHERE tenant_id = v_t));
END $f$;
REVOKE ALL ON FUNCTION public.contab_resumen_mes(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contab_resumen_mes(int, int) TO authenticated;

-- ---------- Hoja del IT-1 y su Anexo A ----------
-- Devuelve cada casilla que MotoFlow puede calcular. Las que dependen de
-- datos que el sistema no tiene (importaciones, exportaciones, percepciones)
-- van en cero y se dice en "avisos".
CREATE OR REPLACE FUNCTION public.contab_hoja_it1(p_anio int, p_mes int)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  v_t uuid := public.get_user_tenant();
  v_ini date; v_fin date; v_saldo numeric;
  v_ncf jsonb; v_pago jsonb;
  v_nc_n int; v_nc_monto numeric; v_nc_itbis numeric;
  v_total numeric; v_exento numeric; v_b16 numeric; v_itbis_fact numeric; v_ret_cli numeric; v_total_pago numeric;
  v_ad_bienes numeric; v_ad_serv numeric; v_ret_supl numeric; v_isr numeric; v_ret_fisica numeric; v_ret_soc numeric;
  v_ir17 jsonb;
  c1 numeric; c9 numeric; c10 numeric; c11 numeric; c12 numeric; c16 numeric; c17 numeric; c21 numeric;
  c25 numeric; c26 numeric; c27 numeric; v_neto numeric; c33 numeric; c34 numeric;
  v_avisos jsonb := '[]'::jsonb;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  IF p_mes NOT BETWEEN 1 AND 12 OR p_anio NOT BETWEEN 2000 AND 2100 THEN RAISE EXCEPTION 'Período inválido'; END IF;
  v_ini := make_date(p_anio, p_mes, 1);
  v_fin := (v_ini + interval '1 month')::date;
  SELECT COALESCE((SELECT saldo_favor_anterior FROM public.contab_periodos
                    WHERE tenant_id = v_t AND anio = p_anio AND mes = p_mes), 0) INTO v_saldo;

  -- Notas de crédito del mes (devoluciones sobre facturas con comprobante).
  SELECT count(*), COALESCE(sum(COALESCE(dv.total_devolucion, 0) - COALESCE(dv.itbis_total, 0)), 0), COALESCE(sum(dv.itbis_total), 0)
    INTO v_nc_n, v_nc_monto, v_nc_itbis
    FROM public.devoluciones dv
   WHERE dv.tenant_id = v_t AND dv.fecha_devolucion >= v_ini AND dv.fecha_devolucion < v_fin
     AND COALESCE(btrim(dv.ncf_modificado), '') <> '';

  -- Anexo A, renglón II: por tipo de comprobante (cantidad y monto sin impuestos).
  WITH v AS (SELECT * FROM public._contab_ventas_607(v_t, v_ini, v_fin)),
  cas(cas, nombre, tipos) AS (VALUES
    (1, 'Comprobante válido para crédito fiscal (01 y 31)', ARRAY['01','31']),
    (2, 'Comprobantes de consumo (02 y 32)', ARRAY['02','32']),
    (3, 'Notas de débito (03 y 33)', ARRAY['03','33']),
    (5, 'Registro único de ingresos (12)', ARRAY['12']),
    (6, 'Regímenes especiales (14 y 44)', ARRAY['14','44']),
    (7, 'Gubernamentales (15 y 45)', ARRAY['15','45']),
    (8, 'Exportaciones (16 y 46)', ARRAY['16','46']))
  SELECT jsonb_agg(jsonb_build_object('cas', x.cas, 'nombre', x.nombre, 'cantidad', x.n, 'monto', round(x.monto, 2)) ORDER BY x.cas)
    INTO v_ncf
    FROM (
      SELECT cas.cas, cas.nombre, count(v.id) AS n, COALESCE(sum(v.base), 0) AS monto
        FROM cas LEFT JOIN v ON v.tipo = ANY (cas.tipos) GROUP BY cas.cas, cas.nombre
      UNION ALL
      SELECT 4, 'Notas de crédito (04 y 34)', v_nc_n, v_nc_monto
    ) x;

  SELECT COALESCE(sum(v.base), 0), COALESCE(sum(v.exento), 0), COALESCE(sum(v.base16), 0),
         COALESCE(sum(v.itbis), 0), COALESCE(sum(v.itbis_retenido), 0), COALESCE(sum(v.total), 0),
         jsonb_build_object(
           'c12', round(COALESCE(sum(v.total) FILTER (WHERE v.forma = 'efectivo'), 0), 2),
           'c13', round(COALESCE(sum(v.total) FILTER (WHERE v.forma = 'cheque'), 0), 2),
           'c14', round(COALESCE(sum(v.total) FILTER (WHERE v.forma = 'tarjeta'), 0), 2),
           'c15', round(COALESCE(sum(v.total) FILTER (WHERE v.forma = 'credito'), 0), 2),
           'c16', 0, 'c17', 0,
           'c18', round(COALESCE(sum(v.total) FILTER (WHERE v.forma = 'otros'), 0), 2))
    INTO v_total, v_exento, v_b16, v_itbis_fact, v_ret_cli, v_total_pago, v_pago
    FROM public._contab_ventas_607(v_t, v_ini, v_fin) v;

  -- 606: ITBIS por adelantar (bienes / servicios) y retenciones a suplidores.
  SELECT COALESCE(sum(k.itbis) FILTER (WHERE k.motivo = 'ok' AND NOT k.es_servicio), 0),
         COALESCE(sum(k.itbis) FILTER (WHERE k.motivo = 'ok' AND k.es_servicio), 0),
         COALESCE(sum(k.itbis_ret) FILTER (WHERE k.motivo IN ('ok', 'ret_isr')), 0),
         COALESCE(sum(k.isr_ret) FILTER (WHERE k.motivo = 'ret_isr'), 0),
         COALESCE(sum(k.itbis_ret) FILTER (WHERE k.motivo IN ('ok', 'ret_isr') AND length(k.rnc) = 11), 0),
         COALESCE(sum(k.itbis_ret) FILTER (WHERE k.motivo IN ('ok', 'ret_isr') AND length(k.rnc) <> 11), 0),
         COALESCE(jsonb_agg(jsonb_build_object('suplidor', k.proveedor, 'rnc', k.rnc, 'ncf', k.ncf, 'base', round(k.base, 2),
                    'pct', k.isr_pct, 'monto', k.isr_ret) ORDER BY k.proveedor, k.ncf)
                  FILTER (WHERE k.motivo = 'ret_isr' AND k.isr_ret > 0), '[]'::jsonb)
    INTO v_ad_bienes, v_ad_serv, v_ret_supl, v_isr, v_ret_fisica, v_ret_soc, v_ir17
    FROM public._contab_compras_606(v_t, v_ini, v_fin) k;

  -- ===== IT-1 =====
  c1  := round(v_total - v_nc_monto, 2);                       -- Anexo A, casilla 11
  c9  := round(LEAST(v_exento, GREATEST(c1, 0)), 2);           -- no gravadas (aquí: solo exentas, casilla 4)
  c10 := c1 - c9;                                              -- gravadas
  c12 := round(LEAST(v_b16, GREATEST(c10, 0)), 2);             -- al 16 %
  c11 := c10 - c12;                                            -- al 18 %
  c16 := round(c11 * 0.18, 2);
  c17 := round(c12 * 0.16, 2);
  c21 := c16 + c17;
  c25 := round(v_ad_bienes + v_ad_serv, 2);
  c26 := GREATEST(c21 - c25, 0);
  c27 := GREATEST(c25 - c21, 0);
  v_neto := c26 - c27 - v_saldo - round(v_ret_cli, 2);
  c33 := GREATEST(v_neto, 0);
  c34 := GREATEST(-v_neto, 0);

  IF abs(c21 - (v_itbis_fact - v_nc_itbis)) > 1 THEN
    v_avisos := v_avisos || jsonb_build_array(format(
      'El formulario calcula el ITBIS como 18 %% de la casilla 11 (RD$ %s); en sus facturas el ITBIS suma RD$ %s. La diferencia sale de descuentos o redondeos: al declarar manda el formulario.',
      to_char(c21, 'FM999,999,990.00'), to_char(v_itbis_fact - v_nc_itbis, 'FM999,999,990.00')));
  END IF;
  IF v_nc_n > 0 THEN
    v_avisos := v_avisos || jsonb_build_array(
      'Hay devoluciones en el mes. La casilla 4 del Anexo A solo se llena sola si la nota de crédito (B04 o E34) está en el 607: agréguela allí si no la emitió por MotoFlow.');
  END IF;
  IF c9 > 0 THEN
    v_avisos := v_avisos || jsonb_build_array(
      'Tiene ventas exentas. Si una compra sirve a la vez para ventas gravadas y exentas, su ITBIS va por proporcionalidad (Anexo A, casillas 53-55): esta hoja no lo calcula.');
  END IF;
  IF round(v_ret_cli, 2) > 0 THEN
    v_avisos := v_avisos || jsonb_build_array(
      'Lo que le retuvieron va en el Anexo A, casillas 27 a 31 según quién retuvo (tarjetas: 27; una sociedad por servicios: 29; el Estado: 31). La suma pasa sola a la casilla 30.');
  END IF;
  IF EXISTS (SELECT 1 FROM public._contab_compras_606(v_t, v_ini, v_fin) k WHERE k.motivo IN ('nota', 'ret_isr')) THEN
    v_avisos := v_avisos || jsonb_build_array(
      'Hay notas de crédito/débito de suplidores o compras con retención de ISR. No salen en el TXT del 606 de MotoFlow ni en las casillas 22 a 25 de esta hoja: agréguelas a mano en la herramienta de la DGII. Al ITBIS deducible súmele el de las compras con retención y las notas de débito, y RÉSTELE el de las notas de crédito.');
  END IF;
  v_avisos := v_avisos || jsonb_build_array(
    'Las importaciones (ITBIS pagado en Aduanas, casilla 24) no están en MotoFlow: si importó, súmelas del lado de la DGA.');

  RETURN jsonb_build_object(
    'anio', p_anio, 'mes', p_mes, 'cerrado', v_fin <= (now() AT TIME ZONE 'America/Santo_Domingo')::date,
    'anexo', jsonb_build_object(
      'ncf', v_ncf, 'c11', c1,
      'pago', v_pago, 'c19', round(v_total_pago, 2),
      'c20', round(v_total, 2), 'c26', round(v_total, 2),
      'retenciones_que_le_hicieron', round(v_ret_cli, 2),
      'c50', round(v_ad_bienes, 2), 'c51', round(v_ad_serv, 2),
      'c56', jsonb_build_object('compras', round(v_ad_bienes, 2), 'servicios', round(v_ad_serv, 2), 'importaciones', 0, 'total', c25)),
    'it1', jsonb_build_object(
      'c1', c1, 'c4', c9, 'c9', c9, 'c10', c10, 'c11', c11, 'c12', c12,
      'c16', c16, 'c17', c17, 'c21', c21,
      'c22', round(v_ad_bienes, 2), 'c23', round(v_ad_serv, 2), 'c24', 0, 'c25', c25,
      'c26', c26, 'c27', c27, 'c29', v_saldo, 'c30', round(v_ret_cli, 2), 'c33', c33, 'c34', c34,
      'itbis_facturado', round(v_itbis_fact - v_nc_itbis, 2),
      -- A. ITBIS retenido a suplidores (casillas 39-63): debe cuadrar con el 606.
      'c60', round(v_ret_supl, 2), 'retenido_personas_fisicas', round(v_ret_fisica, 2), 'retenido_sociedades', round(v_ret_soc, 2),
      'c68', c33 + round(v_ret_supl, 2)),
    'ir17', jsonb_build_object('total_isr', round(v_isr, 2), 'filas', v_ir17),
    'avisos', v_avisos);
END $f$;
REVOKE ALL ON FUNCTION public.contab_hoja_it1(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contab_hoja_it1(int, int) TO authenticated;

-- ---------- Guía paso a paso del mes ----------
-- Una sola fuente para la web y la app. Se arma según la empresa: persona
-- física o sociedad, con nómina o sin ella, si retuvo ISR en el mes.
-- "panel" es la pantalla de MotoFlow donde se hace ese paso.
CREATE OR REPLACE FUNCTION public.contab_guia(p_anio int, p_mes int)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  v_t uuid := public.get_user_tenant();
  v_ini date; v_sig date; v_rnc text; v_nombre text; v_cierre int; v_fisica boolean; v_nomina boolean; v_retiene boolean;
  v_d10 text; v_d15 text; v_d20 text; v_mes text; v_pasos jsonb;
  v_meses text[] := ARRAY['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  IF p_mes NOT BETWEEN 1 AND 12 OR p_anio NOT BETWEEN 2000 AND 2100 THEN RAISE EXCEPTION 'Período inválido'; END IF;
  v_ini := make_date(p_anio, p_mes, 1);
  v_sig := (v_ini + interval '1 month')::date;
  v_mes := v_meses[p_mes] || ' ' || p_anio;
  SELECT regexp_replace(COALESCE(ce.rnc, ''), '\D', '', 'g'), COALESCE(NULLIF(btrim(ce.razon_social), ''), ce.nombre, 'su empresa'), ce.cierre_fiscal_mes
    INTO v_rnc, v_nombre, v_cierre FROM public.config_empresa ce WHERE ce.tenant_id = v_t;
  v_fisica := length(v_rnc) = 11;
  v_nomina := EXISTS (SELECT 1 FROM public.nominas n WHERE n.tenant_id = v_t);
  v_retiene := EXISTS (SELECT 1 FROM public.compras c WHERE c.tenant_id = v_t AND c.fecha >= v_ini AND c.fecha < v_sig
                         AND COALESCE(c.estado, '') <> 'ANULADA' AND COALESCE(c.isr_retenido_pct, 0) > 0);
  v_d10 := to_char(public._contab_dia_habil(v_sig + 9), 'DD/MM/YYYY');
  v_d15 := to_char(public._contab_dia_habil(v_sig + 14), 'DD/MM/YYYY');
  v_d20 := to_char(public._contab_dia_habil(v_sig + 19), 'DD/MM/YYYY');

  SELECT jsonb_agg(jsonb_build_object('n', row_number, 'titulo', s.titulo, 'cuando', s.cuando, 'pasos', to_jsonb(s.pasos), 'panel', s.panel)
                   ORDER BY row_number)
    INTO v_pasos
    FROM (
      SELECT row_number() OVER (ORDER BY q.orden), q.*
        FROM (VALUES
          (1, true, 'Pida factura con comprobante y guárdela', 'Todos los días',
            ARRAY[
              format('Pida siempre factura con comprobante de crédito fiscal (B01 o E31) a nombre de %s%s. La factura de consumo (B02 o E32) no le da crédito de ITBIS.',
                     v_nombre, CASE WHEN v_rnc <> '' THEN ', ' || CASE WHEN v_fisica THEN 'cédula ' ELSE 'RNC ' END || v_rnc ELSE '' END),
              'Compras de mercancía: regístrelas en Compras con el NCF de la factura, y el suplidor con su RNC en la ficha.',
              'Gastos (combustible, supermercado, luz, teléfono, alquiler): tómele la foto en Comprobantes de gastos. El sistema lee los datos y usted los revisa y aprueba.',
              'Cada venta debe salir con su comprobante fiscal: la que sale sin NCF no aparece en el 607.'],
            'comprobantes-gastos'),
          (2, true, format('Cierre %s en Mi Contabilidad', v_mes),
            format('Del 1 al 5 de %s', v_meses[extract(month FROM v_sig)::int]),
            ARRAY[
              'Abra Mi Contabilidad, pestaña Resumen, con el mes que va a declarar.',
              'Apruebe o descarte los comprobantes de gastos que estén «por revisar»: hasta que los apruebe no cuentan.',
              'En «Lo que le falta al mes» corrija las compras que no entran al 606 (NCF mal escrito, suplidor sin RNC, factura repetida). Cada una dice qué hacer.',
              'Cuando ese cuadro esté limpio, el ITBIS estimado ya es el del mes.'],
            'mi-contabilidad'),
          (3, v_nomina, 'Nómina: TSS e IR-3', format('TSS en los primeros días; IR-3 a más tardar el %s', v_d10),
            ARRAY[
              'TSS: pague la nómina del mes en el SUIR (suir.gob.do). La fecha exacta la confirma la TSS.',
              'IR-3: en la Oficina Virtual, Declaraciones juradas > Declaración interactiva > IR-3. Se presenta aunque no haya retenido nada.',
              'Márquelos como presentados en Mi Contabilidad.'],
            'nomina'),
          (4, v_retiene, 'IR-17: el ISR que le retuvo a suplidores', format('A más tardar el %s', v_d10),
            ARRAY[
              'Los montos están al final de la Hoja del IT-1, por suplidor.',
              'En la Oficina Virtual: Declaraciones juradas > Declaración interactiva > IR-17. Primero se envía el Anexo R9C y después el IR-17.',
              'Pague y márquelo como presentado.'],
            'mi-contabilidad'),
          (5, true, 'Envíe el 606, el 607 y el 608', format('A más tardar el %s', v_d15),
            ARRAY[
              'En Reportes DGII escoja el mes y baje el TXT de cada formato. Sale con el mismo formato de la herramienta oficial de la DGII, listo para subir.',
              'Recomendado: páselo por la herramienta de pre-validación de la DGII (está abajo, en Plantillas oficiales). Detecta errores antes de enviar.',
              'En la Oficina Virtual: Enviar archivos > tipo «606 – Compras de bienes y servicios» > período (año y mes) > adjunte el TXT > Enviar datos. Repita con el 607 y el 608.',
              'Si en un formato no hubo nada que reportar: Declaraciones juradas > Declaraciones en cero. Se presenta igual.',
              'Media hora después revise en Consultas > Consulta envíos que diga «Completado». Si dice «Error», abra el detalle, corrija en MotoFlow y vuelva a enviar.',
              'Márquelos como presentados en Mi Contabilidad.'],
            'reportes-dgii'),
          (6, true, 'Declare y pague el ITBIS (IT-1)', format('A más tardar el %s', v_d20),
            ARRAY[
              'Abra la Hoja del IT-1 en Mi Contabilidad: tiene los números casilla por casilla.',
              'En la Oficina Virtual: Declaraciones juradas > Declaración interactiva > IT-1. Primero se llena y se envía el Anexo A; después el IT-1.',
              'La Oficina Virtual llena sola varias casillas con su 606 y su 607. Compárelas con la hoja: si no coinciden, no envíe todavía y revise qué factura falta o sobra.',
              'Escriba el saldo a favor del mes anterior (casilla 29), si lo tiene.',
              'Envíe, pague por su banco en línea o en ventanilla, y guarde el «nuevo saldo a favor» en Mi Contabilidad para el mes que sigue.',
              'Aunque no haya vendido, el IT-1 se presenta (en cero).'],
            'mi-contabilidad'),
          (7, true, 'Anticipos del Impuesto sobre la Renta', format('El %s, solo si la DGII se los fijó', v_d15),
            ARRAY[
              'En la Oficina Virtual, en su cuenta corriente, aparece si tiene anticipos y de cuánto. Si no aparece nada, este paso no le toca.'],
            NULL),
          (8, true,
            CASE WHEN v_fisica THEN 'Una vez al año: IR-1 (renta de personas físicas)' ELSE 'Una vez al año: IR-2 (renta) y Activos' END,
            CASE WHEN v_fisica THEN 'A más tardar el 31 de marzo'
                 ELSE format('120 días después del cierre fiscal (su cierre: fin de %s)', v_meses[COALESCE(v_cierre, 12)]) END,
            ARRAY[
              'Esta declaración la prepara un contador. MotoFlow le entrega la base: los 606 y 607 de los doce meses y los reportes de ventas, compras y gastos.',
              'Si los doce meses están presentados y cuadrados, la anual sale rápido y sin sorpresas.',
              'Guarde las facturas y comprobantes diez años (Código Tributario, art. 50). Las fotos que sube a MotoFlow quedan guardadas.'],
            NULL)
        ) AS q(orden, aplica, titulo, cuando, pasos, panel)
       WHERE q.aplica
    ) s;

  RETURN jsonb_build_object(
    'anio', p_anio, 'mes', p_mes,
    'contribuyente', CASE WHEN v_fisica THEN 'Persona física' WHEN length(v_rnc) = 9 THEN 'Sociedad (persona jurídica)' ELSE 'Sin RNC configurado' END,
    'rnc', v_rnc, 'nomina', v_nomina,
    'pasos', v_pasos,
    'notas', jsonb_build_array(
      'Pagar tarde cuesta: según el instructivo del IT-1 (julio 2026), 3 % de recargo por cada mes o fracción, más 1.10 % de interés mensual. Confirme el monto en la calculadora de la DGII.',
      'Esta guía es para el régimen ordinario. Si está en el Régimen Simplificado (RST), sus obligaciones son otras.',
      'Si la fecha cae en fin de semana pasa al lunes. Los días feriados no se calculan: confirme en el calendario de la DGII.'),
    'plantillas', jsonb_build_array(
      jsonb_build_object('nombre', 'Oficina Virtual de la DGII', 'detalle', 'Donde se envían los formatos y se declara', 'url', 'https://dgii.gov.do/OFV/home.aspx'),
      jsonb_build_object('nombre', 'Herramienta oficial del 606', 'detalle', 'Excel de la DGII con su instructivo',
        'url', 'https://www.dgii.gov.do/herramientas/formularios/formatoEnvioDatos/Documents/Formato%20de%20compras%2c%20bienes%20y%20servicios/Formato-de-Envio-606-%28NG-07-2018-y-05-2019%29.zip'),
      jsonb_build_object('nombre', 'Herramienta oficial del 607', 'detalle', 'Excel de la DGII con su instructivo',
        'url', 'https://www.dgii.gov.do/herramientas/formularios/formatoEnvioDatos/Documents/Formato%20de%20ventas%20bienes%20y%20servicios/Formato-de-Envio-607-%28NG-07-2018-y-05-2019%29.zip'),
      jsonb_build_object('nombre', 'Herramienta oficial del 608', 'detalle', 'Comprobantes anulados',
        'url', 'https://www.dgii.gov.do/herramientas/formularios/formatoEnvioDatos/Documents/Otros%20formatos%20de%20env%c3%ado%20de%20datos/Formato-de-Envio-608-%28NG-07-2018-y-05-2019%29.zip'),
      jsonb_build_object('nombre', 'Pre-validación de los formatos', 'detalle', 'Revisa el TXT antes de enviarlo',
        'url', 'https://www.dgii.gov.do/herramientas/formularios/pre-validacion/Paginas/default.aspx'),
      jsonb_build_object('nombre', 'Todos los formatos de envío de datos', 'detalle', '609, 623 y los demás',
        'url', 'https://dgii.gov.do/cicloContribuyente/obligacionesTributarias/remisionInformacion/Paginas/formatoEnvioDatos.aspx'),
      jsonb_build_object('nombre', 'Instructivo del IT-1', 'detalle', 'Explica cada casilla del formulario',
        'url', 'https://dgii.gov.do/publicacionesOficiales/bibliotecaVirtual/contribuyentes/itbis/Documents/Instructivo%20LLENADO%20IT-1%202020.pdf'),
      jsonb_build_object('nombre', 'Instructivo del IR-17', 'detalle', 'Otras retenciones y Anexo R9C',
        'url', 'https://dgii.gov.do/publicacionesOficiales/bibliotecaVirtual/contribuyentes/retencionesRetribucionesComplementarias/Documents/3-IR-17.pdf')));
END $f$;
REVOKE ALL ON FUNCTION public.contab_guia(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contab_guia(int, int) TO authenticated;


SELECT registrar_migracion('ayudante_contable_fase3.sql');
