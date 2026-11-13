-- =====================================================================
-- Ayudante contable — Fase 2: comprobantes de gastos con foto (12/11/2026)
-- ---------------------------------------------------------------------
-- La factura del supermercado, la gasolinera, la ferretería… Hoy esos
-- gastos se apuntan en "gastos diarios" sin comprobante: no entran al 606
-- y su ITBIS se pierde. Ahora: foto desde la app o la web → el sistema la
-- lee (función leer-comprobante) → queda "por revisar" → al aprobarla
-- entra al 606 y al ITBIS estimado.
--
-- Es un documento FISCAL aparte: no toca caja, inventario ni cuentas por
-- pagar (el dinero se sigue apuntando donde siempre).
--
-- · Bucket privado "comprobantes": carpeta por empresa
--   (<tenant>/<año>/<mes>/…), máximo 2 MB por foto, solo imágenes. Cada
--   empresa ve solo lo suyo. Las fotos se conservan (la ley pide 10 años).
-- · gastos_comprobantes + trigger que limpia RNC/NCF, completa el nombre
--   con el listado de la DGII y deja los avisos (NCF mal escrito, factura
--   de consumo, RNC que no está en la DGII o inactivo, fecha futura).
--   No se repite el mismo RNC + NCF en una empresa.
-- · contab_resumen_mes: suma los comprobantes aprobados a las compras del
--   606 y cuenta los que están por revisar.
-- Idempotente.
-- =====================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('comprobantes', 'comprobantes', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS comprobantes_subir ON storage.objects;
CREATE POLICY comprobantes_subir ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'comprobantes' AND (storage.foldername(name))[1] = public.get_user_tenant()::text);
DROP POLICY IF EXISTS comprobantes_ver ON storage.objects;
CREATE POLICY comprobantes_ver ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'comprobantes' AND (storage.foldername(name))[1] = public.get_user_tenant()::text);

-- Borrar: solo la foto que ningún comprobante usa (la que se subió y no llegó
-- a registrarse: repetida o con error). Las registradas no se pueden borrar.
DROP POLICY IF EXISTS comprobantes_borrar_huerfana ON storage.objects;

CREATE TABLE IF NOT EXISTS public.gastos_comprobantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.get_user_tenant(),
  fecha date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Santo_Domingo')::date,
  rnc text NOT NULL DEFAULT '',
  proveedor_nombre text,
  ncf text NOT NULL DEFAULT '',
  tipo_bs smallint NOT NULL DEFAULT 2 CHECK (tipo_bs BETWEEN 1 AND 11),   -- tipo de bienes y servicios del 606
  monto_gravado numeric NOT NULL DEFAULT 0 CHECK (monto_gravado >= 0),
  monto_exento numeric NOT NULL DEFAULT 0 CHECK (monto_exento >= 0),
  itbis numeric NOT NULL DEFAULT 0 CHECK (itbis >= 0),
  propina numeric NOT NULL DEFAULT 0 CHECK (propina >= 0),
  total numeric NOT NULL DEFAULT 0 CHECK (total >= 0),
  forma_pago text NOT NULL DEFAULT '01' CHECK (forma_pago IN ('01', '02', '03', '04')),  -- efectivo, cheque/transf., tarjeta, crédito
  imagen_path text,
  estado text NOT NULL DEFAULT 'por_revisar' CHECK (estado IN ('por_revisar', 'aprobado', 'descartado')),
  avisos jsonb NOT NULL DEFAULT '[]'::jsonb,
  lectura jsonb,                          -- lo que leyó el sistema de la foto
  origen text NOT NULL DEFAULT 'web' CHECK (origen IN ('web', 'app')),
  nota text,
  creado_por uuid DEFAULT auth.uid(),
  creado_at timestamptz NOT NULL DEFAULT now(),
  actualizado_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gastos_comprobantes_mes_idx ON public.gastos_comprobantes (tenant_id, fecha);
-- El mismo comprobante del mismo suplidor no entra dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS gastos_comprobantes_unico
  ON public.gastos_comprobantes (tenant_id, rnc, ncf) WHERE estado <> 'descartado' AND ncf <> '' AND rnc <> '';

ALTER TABLE public.gastos_comprobantes ADD COLUMN IF NOT EXISTS entra_606 boolean NOT NULL DEFAULT false;

CREATE POLICY comprobantes_borrar_huerfana ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'comprobantes' AND (storage.foldername(name))[1] = public.get_user_tenant()::text
         AND NOT EXISTS (SELECT 1 FROM public.gastos_comprobantes g WHERE g.imagen_path = storage.objects.name));

ALTER TABLE public.gastos_comprobantes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gastos_comprobantes_tenant ON public.gastos_comprobantes;
CREATE POLICY gastos_comprobantes_tenant ON public.gastos_comprobantes FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant()) WITH CHECK (tenant_id = public.get_user_tenant());
GRANT SELECT, INSERT, UPDATE ON public.gastos_comprobantes TO authenticated;

-- Limpia, completa y revisa cada comprobante al guardarlo, y decide si
-- ENTRA AL 606 (entra_606). Mismas reglas que revisar606 (dgiiExport.js) y
-- contab_resumen_mes; las notas de crédito/débito no entran por aquí (les
-- falta el NCF que modifican): se registran en Compras.
CREATE OR REPLACE FUNCTION public._gasto_comprobante_revisar()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  v_av jsonb := '[]'::jsonb;
  v_tipo text; d record; v_rnc_emp text; v_rnc_cli text;
  v_ncf_ok boolean := false; v_rnc_ok boolean := false;
BEGIN
  NEW.rnc := regexp_replace(COALESCE(NEW.rnc, ''), '\D', '', 'g');
  NEW.ncf := upper(regexp_replace(COALESCE(NEW.ncf, ''), '[\s-]', '', 'g'));
  NEW.actualizado_at := now();
  v_tipo := left(NEW.ncf, 3);
  SELECT regexp_replace(COALESCE(rnc, ''), '\D', '', 'g') INTO v_rnc_emp FROM public.config_empresa WHERE tenant_id = NEW.tenant_id;

  IF NEW.ncf = '' THEN
    v_av := v_av || jsonb_build_array('Falta el NCF: sin comprobante fiscal no entra al 606.');
  ELSIF NEW.ncf !~ '^(B\d{10}|E\d{12})$' THEN
    v_av := v_av || jsonb_build_array('NCF mal escrito: debe ser B + 10 dígitos o E + 12 dígitos.');
  ELSIF v_tipo IN ('B02', 'E32') THEN
    v_av := v_av || jsonb_build_array('Es factura de CONSUMO (' || v_tipo || '): no da crédito fiscal y no entra al 606. Pida factura de crédito fiscal a nombre de su RNC.');
  ELSIF v_tipo IN ('B03', 'B04', 'E33', 'E34') THEN
    v_av := v_av || jsonb_build_array('Es una nota de crédito o débito: regístrela en Compras con el NCF de la factura que modifica. Por aquí no entra al 606.');
  ELSIF v_tipo NOT IN ('B01','B11','B13','B14','B15','B17','E31','E41','E43','E44','E45','E47') THEN
    v_av := v_av || jsonb_build_array('El comprobante ' || v_tipo || ' no se reporta en el 606.');
  ELSE
    v_ncf_ok := true;
  END IF;

  IF v_tipo IN ('B13', 'B17', 'E43', 'E47') THEN
    -- Gastos menores / pagos al exterior: van con el RNC de la propia empresa.
    v_rnc_ok := length(v_rnc_emp) IN (9, 11);
    IF NOT v_rnc_ok THEN
      v_av := v_av || jsonb_build_array('Este comprobante va con el RNC de su empresa y no está configurado en Perfil Empresa.');
    END IF;
  ELSIF length(NEW.rnc) NOT IN (9, 11) THEN
    v_av := v_av || jsonb_build_array('Falta el RNC (9 dígitos) o la cédula (11) de quien emitió la factura.');
  ELSIF NEW.rnc = v_rnc_emp THEN
    v_av := v_av || jsonb_build_array('Ese es el RNC de SU empresa: va el de quien le vendió.');
  ELSE
    v_rnc_ok := true;
    SELECT razon_social, nombre_comercial, estado INTO d FROM public.dgii_contribuyentes WHERE rnc = NEW.rnc;
    IF FOUND THEN
      IF COALESCE(btrim(NEW.proveedor_nombre), '') = '' THEN
        NEW.proveedor_nombre := COALESCE(NULLIF(btrim(d.nombre_comercial), ''), d.razon_social);
      END IF;
      IF COALESCE(upper(d.estado), 'ACTIVO') NOT LIKE 'ACTIV%' THEN
        v_av := v_av || jsonb_build_array('En la DGII ese contribuyente figura ' || lower(d.estado) || ': confirme la factura.');
      END IF;
    ELSIF length(NEW.rnc) = 9 THEN
      v_av := v_av || jsonb_build_array('Ese RNC no aparece en el listado de la DGII: revise que esté bien copiado.');
    END IF;
  END IF;

  -- ¿A nombre de quién está? (lo que se leyó de la foto)
  v_rnc_cli := regexp_replace(COALESCE(NEW.lectura->>'rnc_cliente', ''), '\D', '', 'g');
  IF length(v_rnc_cli) IN (9, 11) AND length(v_rnc_emp) IN (9, 11) AND v_rnc_cli <> v_rnc_emp AND v_rnc_cli <> NEW.rnc THEN
    v_av := v_av || jsonb_build_array('La factura parece estar a nombre de otro RNC (' || v_rnc_cli || '), no del de su empresa: ese crédito fiscal no le corresponde.');
  END IF;

  IF NEW.fecha > (now() AT TIME ZONE 'America/Santo_Domingo')::date THEN
    v_av := v_av || jsonb_build_array('La fecha es futura.');
  ELSIF NEW.fecha < (now() AT TIME ZONE 'America/Santo_Domingo')::date - 400 THEN
    v_av := v_av || jsonb_build_array('La fecha tiene más de un año: revise que se haya leído bien (día/mes/año).');
  END IF;

  IF NEW.total <= 0 THEN
    v_av := v_av || jsonb_build_array('Falta el total.');
  ELSE
    IF NEW.itbis > 0 AND NEW.monto_gravado <= 0 THEN
      v_av := v_av || jsonb_build_array('Tiene ITBIS pero falta el monto gravado: complételo (total menos ITBIS).');
    ELSIF NEW.itbis > (NEW.monto_gravado * 0.18) + 1 THEN
      v_av := v_av || jsonb_build_array('El ITBIS es mayor que el 18 % del monto gravado: revise los montos.');
    END IF;
    IF abs((NEW.monto_gravado + NEW.monto_exento + NEW.itbis + NEW.propina) - NEW.total) > 1 THEN
      v_av := v_av || jsonb_build_array('Gravado + exento + ITBIS + propina no da el total: revise los montos.');
    END IF;
  END IF;

  NEW.entra_606 := v_ncf_ok AND v_rnc_ok;
  NEW.avisos := v_av;
  RETURN NEW;
END $f$;

DROP TRIGGER IF EXISTS gasto_comprobante_revisar_trg ON public.gastos_comprobantes;
CREATE TRIGGER gasto_comprobante_revisar_trg
  BEFORE INSERT OR UPDATE ON public.gastos_comprobantes
  FOR EACH ROW EXECUTE FUNCTION public._gasto_comprobante_revisar();

-- El resumen del mes (versión de la Fase 1) + los comprobantes de gastos
-- aprobados, que entran al 606 igual que una compra.
CREATE OR REPLACE FUNCTION public.contab_resumen_mes(p_anio int, p_mes int)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  v_t uuid := public.get_user_tenant();
  v_ini date; v_fin date; v_ini_ts timestamptz; v_fin_ts timestamptz;
  v_rnc_emp text; v_saldo numeric;
  v_ventas jsonb; v_dev numeric; v_compras jsonb; v_gastos jsonb; v_comp jsonb; v_por_revisar jsonb;
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
    UNION ALL
    -- Comprobantes de gastos APROBADOS (foto de la factura del gasto).
    SELECT g.id, g.itbis, g.total, g.monto_gravado, g.monto_exento, 0::numeric, 0::numeric, g.ncf, g.rnc
      FROM public.gastos_comprobantes g
     WHERE g.tenant_id = v_t AND g.fecha >= v_ini AND g.fecha < v_fin AND g.estado = 'aprobado' AND g.entra_606
  ), k0 AS (
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
  ), k AS (
    -- La misma factura (RNC + NCF) dos veces —en Compras y como comprobante de
    -- gasto, o digitada doble— cuenta una sola: la otra sale como repetida,
    -- igual que en el 606.
    SELECT k0.id, k0.itbis_total, k0.total_compra, k0.total_gravado, k0.total_exento,
           k0.itbis_retenido_pct, k0.isr_retenido_pct, k0.ncf, k0.rnc, k0.tipo,
           CASE WHEN k0.motivo = 'ok'
                 AND row_number() OVER (PARTITION BY k0.motivo,
                       CASE WHEN k0.tipo IN ('B13','B17','E43','E47') THEN v_rnc_emp ELSE k0.rnc END, k0.ncf
                       ORDER BY k0.id) > 1
                THEN 'repetida' ELSE k0.motivo END AS motivo
      FROM k0
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
  v_estimado := round(v_itbis_ventas - v_itbis_adel - v_itbis_ret - v_saldo, 2);

  RETURN jsonb_build_object(
    'anio', p_anio, 'mes', p_mes, 'cerrado', v_fin <= (now() AT TIME ZONE 'America/Santo_Domingo')::date,
    'ventas', v_ventas, 'devoluciones_itbis', v_dev, 'compras', v_compras, 'gastos_sin_comprobante', v_gastos,
    'comprobantes_gastos', v_por_revisar,
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


SELECT registrar_migracion('ayudante_contable_fase2.sql');
