-- =====================================================================
-- Ayudante contable — Fase 1: "Mi Contabilidad" (12/11/2026)
-- ---------------------------------------------------------------------
-- Para cada empresa, por mes:
--   1. ITBIS ESTIMADO antes de declarar el IT-1:
--        ITBIS de las ventas con comprobante
--      − ITBIS de las devoluciones (notas de crédito emitidas)
--      − ITBIS adelantado en compras que SÍ entran al 606
--      − ITBIS que los clientes le retuvieron
--      − saldo a favor del mes anterior (lo escribe la empresa)
--   2. LO QUE LE FALTA AL MES: compras que no entran al 606 (sin NCF, NCF
--      mal escrito, factura de consumo, suplidor sin RNC) con el ITBIS que
--      se pierde; ventas sin comprobante; gastos sin comprobante.
--   3. COMPROMISOS con su fecha (página oficial de la DGII, "Pago de
--      impuestos"): IR-3 e IR-17 día 10; 606/607/608 día 15; IT-1 día 20;
--      IR-2 y Activos 120 días tras el cierre; IR-1 el 31 de marzo. Los
--      anticipos (día 15) y la TSS no salen en esa página: van marcados
--      "confirmar". Fin de semana → lunes; los feriados no se calculan.
--
-- Las reglas de qué compra entra al 606 son las de src/lib/dgiiExport.js
-- (revisar606): si cambian allá, cambian aquí.
-- Es un ESTIMADO: no sustituye la declaración ni al contador.
--
-- · config_empresa.cierre_fiscal_mes (12 = diciembre) y contab_avisos.
-- · contab_periodos: saldo a favor por mes.
-- · contab_compromisos_hechos: lo que la empresa marcó como presentado.
-- · contab_resumen_mes(anio, mes): todo lo de arriba (empresa activa).
-- · contab_avisos_diarios(): 8 am RD, avisa en la campanita 3 días antes y
--   el día del vencimiento, solo a empresas con contab_avisos encendido.
-- Idempotente.
-- =====================================================================

ALTER TABLE public.config_empresa ADD COLUMN IF NOT EXISTS cierre_fiscal_mes smallint NOT NULL DEFAULT 12
  CHECK (cierre_fiscal_mes BETWEEN 1 AND 12);
ALTER TABLE public.config_empresa ADD COLUMN IF NOT EXISTS contab_avisos boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.contab_periodos (
  tenant_id uuid NOT NULL,
  anio int NOT NULL,
  mes int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  saldo_favor_anterior numeric NOT NULL DEFAULT 0 CHECK (saldo_favor_anterior >= 0),
  actualizado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, anio, mes)
);
ALTER TABLE public.contab_periodos ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.contab_compromisos_hechos (
  tenant_id uuid NOT NULL,
  clave text NOT NULL,
  periodo text NOT NULL,           -- 'YYYY-MM' (mensual) o 'YYYY' (anual)
  hecho_at timestamptz NOT NULL DEFAULT now(),
  hecho_por uuid,
  PRIMARY KEY (tenant_id, clave, periodo)
);
ALTER TABLE public.contab_compromisos_hechos ENABLE ROW LEVEL SECURITY;

-- Sábado y domingo pasan al lunes (los feriados no se calculan).
CREATE OR REPLACE FUNCTION public._contab_dia_habil(d date)
RETURNS date LANGUAGE sql IMMUTABLE AS $f$
  SELECT CASE extract(isodow FROM d) WHEN 6 THEN d + 2 WHEN 7 THEN d + 1 ELSE d END
$f$;

-- Los compromisos que vencen por las operaciones del mes (anio, mes), más
-- los anuales cuyo vencimiento cae en el mes SIGUIENTE a ese período.
CREATE OR REPLACE FUNCTION public._contab_compromisos(p_tenant uuid, p_anio int, p_mes int)
RETURNS TABLE (clave text, nombre text, periodo text, vence date, detalle text, confirmar boolean, hecho boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  v_ini date := make_date(p_anio, p_mes, 1);
  v_sig date := (v_ini + interval '1 month')::date;          -- mes en que se presenta
  v_per text := to_char(v_ini, 'YYYY-MM');
  v_rnc text; v_cierre int; v_fisica boolean; v_nomina boolean; v_retiene boolean;
  v_fin_ejercicio date; v_vence_anual date;
BEGIN
  SELECT regexp_replace(COALESCE(ce.rnc, ''), '\D', '', 'g'), ce.cierre_fiscal_mes
    INTO v_rnc, v_cierre FROM public.config_empresa ce WHERE ce.tenant_id = p_tenant;
  v_fisica := length(v_rnc) = 11;                             -- cédula = persona física
  v_nomina := EXISTS (SELECT 1 FROM public.nominas n WHERE n.tenant_id = p_tenant);
  v_retiene := EXISTS (SELECT 1 FROM public.compras c WHERE c.tenant_id = p_tenant
                         AND c.fecha >= v_ini AND c.fecha < v_sig AND COALESCE(c.estado, '') <> 'ANULADA'
                         AND (COALESCE(c.itbis_retenido_pct, 0) > 0 OR COALESCE(c.isr_retenido_pct, 0) > 0));

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
           'ITBIS e ISR que le retuvo a suplidores en el mes.', false
     WHERE v_retiene
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
           'Debe cuadrar con el 606 y el 607 del mes.', false
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

-- El resumen del mes para la empresa activa.
CREATE OR REPLACE FUNCTION public.contab_resumen_mes(p_anio int, p_mes int)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  v_t uuid := public.get_user_tenant();
  v_ini date; v_fin date; v_ini_ts timestamptz; v_fin_ts timestamptz;
  v_rnc_emp text; v_saldo numeric;
  v_ventas jsonb; v_dev numeric; v_compras jsonb; v_gastos jsonb; v_comp jsonb;
  v_itbis_ventas numeric; v_itbis_ret numeric; v_itbis_adel numeric; v_estimado numeric;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  IF p_mes NOT BETWEEN 1 AND 12 OR p_anio NOT BETWEEN 2000 AND 2100 THEN RAISE EXCEPTION 'Período inválido'; END IF;
  v_ini := make_date(p_anio, p_mes, 1);
  v_fin := (v_ini + interval '1 month')::date;
  -- facturas.fecha es timestamptz: el mes va por la hora de República Dominicana.
  v_ini_ts := v_ini::timestamp AT TIME ZONE 'America/Santo_Domingo';
  v_fin_ts := v_fin::timestamp AT TIME ZONE 'America/Santo_Domingo';
  SELECT regexp_replace(COALESCE(rnc, ''), '\D', '', 'g') INTO v_rnc_emp FROM public.config_empresa WHERE tenant_id = v_t;
  SELECT COALESCE((SELECT saldo_favor_anterior FROM public.contab_periodos
                    WHERE tenant_id = v_t AND anio = p_anio AND mes = p_mes), 0) INTO v_saldo;

  -- ===== Ventas =====
  WITH f AS (
    SELECT fa.id, fa.subtotal, fa.itbis, fa.total, fa.itbis_retenido,
           COALESCE(NULLIF(btrim(fa.ncf), ''),
                    (SELECT COALESCE(d.ncf, d.encf, d.proveedor_number) FROM public.documentos_fiscales d
                      WHERE d.factura_id = fa.id AND d.estado = 'emitido'
                      ORDER BY d.created_at DESC LIMIT 1)) AS ncf
      FROM public.facturas fa
     WHERE fa.tenant_id = v_t AND fa.fecha >= v_ini_ts AND fa.fecha < v_fin_ts
       AND COALESCE(fa.estado, '') <> 'ANULADA' AND NOT COALESCE(fa.es_saldo_inicial, false)
  )
  SELECT jsonb_build_object(
      'con_ncf', count(*) FILTER (WHERE ncf IS NOT NULL),
      'base', COALESCE(sum(subtotal) FILTER (WHERE ncf IS NOT NULL), 0),
      'itbis', COALESCE(sum(itbis) FILTER (WHERE ncf IS NOT NULL), 0),
      'itbis_retenido', COALESCE(sum(itbis_retenido) FILTER (WHERE ncf IS NOT NULL), 0),
      'sin_ncf', count(*) FILTER (WHERE ncf IS NULL),
      'sin_ncf_total', COALESCE(sum(total) FILTER (WHERE ncf IS NULL), 0),
      'sin_ncf_itbis', COALESCE(sum(itbis) FILTER (WHERE ncf IS NULL), 0))
    INTO v_ventas FROM f;

  -- Devoluciones del mes sobre facturas con comprobante (notas de crédito).
  SELECT COALESCE(sum(dv.itbis_total), 0) INTO v_dev
    FROM public.devoluciones dv
   WHERE dv.tenant_id = v_t AND dv.fecha_devolucion >= v_ini AND dv.fecha_devolucion < v_fin
     AND COALESCE(btrim(dv.ncf_modificado), '') <> '';

  -- ===== Compras: lo que entra al 606 y lo que no (reglas de revisar606) =====
  WITH c AS (
    SELECT co.id, co.itbis_total, co.total_compra, co.total_gravado, co.total_exento,
           co.itbis_retenido_pct, co.isr_retenido_pct,
           upper(regexp_replace(COALESCE(co.ncf, ''), '[\s-]', '', 'g')) AS ncf,
           regexp_replace(COALESCE(pv.rnc, ''), '\D', '', 'g') AS rnc
      FROM public.compras co
      LEFT JOIN public.proveedores pv ON pv.id = co.suplidor_id
     WHERE co.tenant_id = v_t AND co.fecha >= v_ini AND co.fecha < v_fin
       AND COALESCE(co.estado, '') <> 'ANULADA' AND NOT COALESCE(co.es_saldo_inicial, false)
  ), k AS (
    SELECT c.*, left(c.ncf, 3) AS tipo,
      CASE
        WHEN c.ncf = '' THEN 'sin_ncf'
        WHEN c.ncf !~ '^(B\d{10}|E\d{12})$' THEN 'ncf_mal'
        WHEN left(c.ncf, 3) IN ('B02', 'E32') THEN 'consumo'
        WHEN left(c.ncf, 3) NOT IN ('B01','B03','B04','B11','B13','B14','B15','B17','E31','E33','E34','E41','E43','E44','E45','E47') THEN 'tipo'
        WHEN left(c.ncf, 3) IN ('B13','B17','E43','E47') AND length(v_rnc_emp) NOT IN (9, 11) THEN 'rnc_empresa'
        WHEN left(c.ncf, 3) NOT IN ('B13','B17','E43','E47') AND length(c.rnc) NOT IN (9, 11) THEN 'rnc'
        ELSE 'ok' END AS motivo
      FROM c
  )
  SELECT jsonb_build_object(
      'en_606', count(*) FILTER (WHERE motivo = 'ok'),
      -- Las notas de crédito del suplidor (B04/E34) restan crédito.
      'itbis_adelantado', COALESCE(sum(CASE WHEN tipo IN ('B04', 'E34') THEN -itbis_total ELSE itbis_total END) FILTER (WHERE motivo = 'ok'), 0),
      'itbis_retenido_a_suplidores', COALESCE(sum(itbis_total * COALESCE(itbis_retenido_pct, 0) / 100) FILTER (WHERE motivo = 'ok'), 0),
      'isr_retenido_a_suplidores', COALESCE(sum((COALESCE(total_gravado, 0) + COALESCE(total_exento, 0)) * COALESCE(isr_retenido_pct, 0) / 100) FILTER (WHERE motivo = 'ok'), 0),
      'fuera', count(*) FILTER (WHERE motivo <> 'ok'),
      'itbis_perdido', COALESCE(sum(itbis_total) FILTER (WHERE motivo <> 'ok'), 0),
      'motivos', COALESCE((SELECT jsonb_agg(jsonb_build_object('motivo', m.motivo, 'cantidad', m.n, 'monto', m.monto, 'itbis', m.itbis) ORDER BY m.itbis DESC)
                             FROM (SELECT motivo, count(*) n, sum(total_compra) monto, sum(itbis_total) itbis
                                     FROM k WHERE motivo <> 'ok' GROUP BY motivo) m), '[]'::jsonb))
    INTO v_compras FROM k;

  -- ===== Gastos diarios: no llevan comprobante fiscal (no entran al 606) =====
  SELECT jsonb_build_object('cantidad', count(*), 'monto', COALESCE(sum(g.monto), 0))
    INTO v_gastos
    FROM public.gastos_diarios g
   WHERE g.tenant_id = v_t AND g.fecha >= v_ini AND g.fecha < v_fin AND NOT COALESCE(g.anulado, false)
     AND NOT COALESCE(g.es_tercero, false) AND COALESCE(g.tipo_gasto, '') NOT IN ('Nomina', 'Terceros');

  SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.vence, q.clave), '[]'::jsonb) INTO v_comp
    FROM public._contab_compromisos(v_t, p_anio, p_mes) q;

  v_itbis_ventas := (v_ventas->>'itbis')::numeric - v_dev;
  v_itbis_ret := (v_ventas->>'itbis_retenido')::numeric;
  v_itbis_adel := (v_compras->>'itbis_adelantado')::numeric;
  v_estimado := round(v_itbis_ventas - v_itbis_adel - v_itbis_ret - v_saldo, 2);

  RETURN jsonb_build_object(
    'anio', p_anio, 'mes', p_mes, 'cerrado', v_fin <= (now() AT TIME ZONE 'America/Santo_Domingo')::date,
    'ventas', v_ventas, 'devoluciones_itbis', v_dev, 'compras', v_compras, 'gastos_sin_comprobante', v_gastos,
    'saldo_favor_anterior', v_saldo,
    'itbis', jsonb_build_object(
      'ventas', round(v_itbis_ventas, 2), 'adelantado', round(v_itbis_adel, 2),
      'retenido_por_clientes', round(v_itbis_ret, 2), 'saldo_favor_anterior', v_saldo,
      'a_pagar', GREATEST(v_estimado, 0), 'saldo_a_favor', GREATEST(-v_estimado, 0)),
    'compromisos', v_comp,
    'avisos', (SELECT contab_avisos FROM public.config_empresa WHERE tenant_id = v_t),
    'cierre_fiscal_mes', (SELECT cierre_fiscal_mes FROM public.config_empresa WHERE tenant_id = v_t));
END $f$;
REVOKE ALL ON FUNCTION public.contab_resumen_mes(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contab_resumen_mes(int, int) TO authenticated;

-- Quién puede cambiar los datos contables de la empresa activa.
CREATE OR REPLACE FUNCTION public._contab_es_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()
                   AND (COALESCE(p.is_superadmin, false)
                        OR (p.role IN ('admin', 'owner', 'manager', 'gerente') AND p.tenant_id = public.get_user_tenant())))
      OR EXISTS (SELECT 1 FROM public.usuarios_empresas ue WHERE ue.user_id = auth.uid()
                   AND ue.tenant_id = public.get_user_tenant() AND ue.rol IN ('owner', 'admin'))
$f$;
REVOKE ALL ON FUNCTION public._contab_es_admin() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.contab_guardar_saldo(p_anio int, p_mes int, p_monto numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_t uuid := public.get_user_tenant();
BEGIN
  IF v_t IS NULL OR NOT public._contab_es_admin() THEN RAISE EXCEPTION 'Solo el administrador puede cambiar el saldo a favor.'; END IF;
  IF p_monto IS NULL OR p_monto < 0 THEN RAISE EXCEPTION 'El saldo a favor no puede ser negativo.'; END IF;
  INSERT INTO public.contab_periodos (tenant_id, anio, mes, saldo_favor_anterior)
  VALUES (v_t, p_anio, p_mes, round(p_monto, 2))
  ON CONFLICT (tenant_id, anio, mes) DO UPDATE SET saldo_favor_anterior = EXCLUDED.saldo_favor_anterior, actualizado_at = now();
END $f$;
REVOKE ALL ON FUNCTION public.contab_guardar_saldo(int, int, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contab_guardar_saldo(int, int, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.contab_marcar(p_clave text, p_periodo text, p_hecho boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_t uuid := public.get_user_tenant();
BEGIN
  IF v_t IS NULL OR NOT public._contab_es_admin() THEN RAISE EXCEPTION 'Solo el administrador puede marcar los compromisos.'; END IF;
  IF p_clave NOT IN ('ir3','ir17','tss','606','607','608','anticipo','it1','ir1','ir2','act') OR p_periodo !~ '^\d{4}(-\d{2})?$' THEN
    RAISE EXCEPTION 'Compromiso inválido';
  END IF;
  IF COALESCE(p_hecho, false) THEN
    INSERT INTO public.contab_compromisos_hechos (tenant_id, clave, periodo, hecho_por)
    VALUES (v_t, p_clave, p_periodo, auth.uid()) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.contab_compromisos_hechos WHERE tenant_id = v_t AND clave = p_clave AND periodo = p_periodo;
  END IF;
END $f$;
REVOKE ALL ON FUNCTION public.contab_marcar(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contab_marcar(text, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.contab_configurar(p_avisos boolean DEFAULT NULL, p_cierre_fiscal_mes int DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_t uuid := public.get_user_tenant();
BEGIN
  IF v_t IS NULL OR NOT public._contab_es_admin() THEN RAISE EXCEPTION 'Solo el administrador puede cambiar esto.'; END IF;
  IF p_cierre_fiscal_mes IS NOT NULL AND p_cierre_fiscal_mes NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'Mes de cierre inválido'; END IF;
  UPDATE public.config_empresa
     SET contab_avisos = COALESCE(p_avisos, contab_avisos),
         cierre_fiscal_mes = COALESCE(p_cierre_fiscal_mes, cierre_fiscal_mes)
   WHERE tenant_id = v_t;
END $f$;
REVOKE ALL ON FUNCTION public.contab_configurar(boolean, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contab_configurar(boolean, int) TO authenticated;

-- Avisos en la campanita: 3 días antes y el día que vence. Solo empresas
-- que lo encendieron. No repite el mismo aviso el mismo día.
CREATE OR REPLACE FUNCTION public.contab_avisos_diarios()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_mes_ant date := (date_trunc('month', v_hoy) - interval '1 month')::date;
  t record; c record; v_n int := 0; v_titulo text;
BEGIN
  FOR t IN SELECT tenant_id FROM public.config_empresa WHERE contab_avisos LOOP
    FOR c IN SELECT * FROM public._contab_compromisos(t.tenant_id, extract(year FROM v_mes_ant)::int, extract(month FROM v_mes_ant)::int) q
              WHERE NOT q.hecho AND (q.vence = v_hoy OR q.vence = v_hoy + 3) LOOP
      v_titulo := CASE WHEN c.vence = v_hoy THEN '📅 Vence HOY: ' ELSE '📅 Vence en 3 días: ' END || c.nombre;
      INSERT INTO public.notificaciones (tenant_id, user_id, tipo, titulo, mensaje)
      SELECT t.tenant_id, u.user_id, 'contab_compromiso', left(v_titulo, 120),
             c.detalle || ' Vence el ' || to_char(c.vence, 'DD/MM/YYYY') || '. Doble clic para abrir Mi Contabilidad.'
        FROM (SELECT p.id AS user_id FROM public.profiles p WHERE p.tenant_id = t.tenant_id AND p.role IN ('owner', 'admin')
              UNION
              SELECT ue.user_id FROM public.usuarios_empresas ue WHERE ue.tenant_id = t.tenant_id AND ue.rol IN ('owner', 'admin')) u
       WHERE NOT EXISTS (SELECT 1 FROM public.notificaciones n
                          WHERE n.user_id = u.user_id AND n.tenant_id = t.tenant_id AND n.tipo = 'contab_compromiso'
                            AND n.titulo = left(v_titulo, 120) AND n.created_at > now() - interval '20 hours');
      v_n := v_n + 1;
    END LOOP;
  END LOOP;
  RETURN v_n;
END $f$;
REVOKE ALL ON FUNCTION public.contab_avisos_diarios() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'contab-avisos-diarios';
SELECT cron.schedule('contab-avisos-diarios', '0 12 * * *', $$SELECT public.contab_avisos_diarios()$$);  -- 8 am RD

SELECT registrar_migracion('ayudante_contable_fase1.sql');
