-- =====================================================================
-- Centros educativos · Parte 5: factura con crédito fiscal y permisos
-- de la secretaria (06/11/2026)
-- ---------------------------------------------------------------------
-- 1. FACTURA CON CRÉDITO FISCAL (NG 07-2006: el colegio no da NCF al
--    consumidor final, pero sí cuando el padre lo pide para deducir los
--    gastos educativos, Ley 179-09). Exenta de ITBIS (art. 344 num. 7).
--    · Se hace sobre uno o varios recibos YA COBRADOS de una familia (un
--      pago o el año entero). El dinero ya entró por el recibo de ingreso:
--      la factura queda marcada cobrada_en_recibo y el Cierre de Caja no la
--      vuelve a contar. Sí sale en el 607 (es una factura con NCF).
--    · NCF B01 de las secuencias del colegio (Comprobantes Fiscales).
--    · Sin el Sistema Bilingüe: se cobra por cuenta de la compañía, no es
--      ingreso del colegio.
--    · Un recibo facturado no se anula mientras la factura esté viva; la
--      dirección anula la factura (edu_anular_factura_fiscal → 608) y queda libre.
--    · Solo la dirección o quien tenga "Editar" en Colegio - Caja emite.
-- 2. PERMISOS: la configuración del colegio (tarifas, conceptos, cursos,
--    años, reglas) solo la cambia la dirección o quien tenga "Editar" en
--    Colegio - Configuración. La secretaria cobra e inscribe, no configura.
-- 3. edu_reporte_cobros trae el NCF de cada recibo facturado.
-- Requiere: centros_educativos_reportes.sql
-- =====================================================================

-- ── 0. Columnas ─────────────────────────────────────────────────────────
-- El dinero de esta factura ya entró por un recibo de ingreso (no es venta de caja).
ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS cobrada_en_recibo boolean NOT NULL DEFAULT false;
ALTER TABLE public.edu_pagos ADD COLUMN IF NOT EXISTS factura_id uuid REFERENCES public.facturas(id);
CREATE INDEX IF NOT EXISTS edu_pagos_factura ON public.edu_pagos (factura_id) WHERE factura_id IS NOT NULL;
-- A nombre de quién factura esta familia (se propone la próxima vez).
ALTER TABLE public.edu_familias ADD COLUMN IF NOT EXISTS cliente_fiscal_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;

-- ── 1. Factura con crédito fiscal ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.edu_facturar_pagos(p_pagos uuid[], p_nombre text, p_rnc text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_t uuid := public.get_user_tenant();
  v_rnc text := regexp_replace(COALESCE(p_rnc, ''), '[^0-9]', '', 'g');
  v_nombre text := btrim(COALESCE(p_nombre, ''));
  v_familias integer; v_familia uuid; v_n integer;
  v_cliente uuid; v_total numeric; v_ncf json; v_factura uuid; v_numero bigint;
  v_forma text; v_recibos text; v_vence date;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  -- Gasta NCF del colegio: la dirección o quien cobra en la Caja del Colegio.
  IF NOT (private.edu_es_direccion(v_t)
          OR EXISTS (SELECT 1 FROM public.user_module_permissions m
                      WHERE m.user_id = auth.uid() AND m.module_key = 'colegio-caja' AND m.can_edit)) THEN
    RAISE EXCEPTION 'No tienes permiso para emitir facturas del colegio';
  END IF;
  IF COALESCE(cardinality(p_pagos), 0) = 0 THEN RAISE EXCEPTION 'Escoge los recibos a facturar'; END IF;
  IF length(v_nombre) < 3 THEN RAISE EXCEPTION 'Escribe el nombre de quien recibe la factura'; END IF;
  IF length(v_rnc) NOT IN (9, 11) THEN RAISE EXCEPTION 'La cédula (11 dígitos) o el RNC (9 dígitos) no está completo'; END IF;

  -- Los recibos: de este colegio, de UNA familia, vigentes y sin factura viva.
  PERFORM 1 FROM public.edu_pagos WHERE id = ANY(p_pagos) AND tenant_id = v_t FOR UPDATE;
  SELECT count(*), count(DISTINCT familia_id), min(familia_id::text)::uuid INTO v_n, v_familias, v_familia
    FROM public.edu_pagos WHERE id = ANY(p_pagos) AND tenant_id = v_t;
  IF v_n <> cardinality(p_pagos) THEN RAISE EXCEPTION 'Un recibo no es de este colegio'; END IF;
  IF v_familias <> 1 THEN RAISE EXCEPTION 'Los recibos tienen que ser de una sola familia'; END IF;
  IF EXISTS (SELECT 1 FROM public.edu_pagos WHERE id = ANY(p_pagos) AND anulado) THEN
    RAISE EXCEPTION 'Hay un recibo anulado en la selección';
  END IF;
  SELECT string_agg('RC-' || lpad(p.numero::text, 6, '0') || ' (' || f.ncf || ')', ', ') INTO v_recibos
    FROM public.edu_pagos p JOIN public.facturas f ON f.id = p.factura_id
   WHERE p.id = ANY(p_pagos) AND upper(COALESCE(f.estado, '')) <> 'ANULADA';
  IF v_recibos IS NOT NULL THEN RAISE EXCEPTION 'Ya tienen factura: %', v_recibos; END IF;

  -- Lo facturable: todo menos lo cobrado por cuenta de terceros (Sistema Bilingüe).
  SELECT round(COALESCE(sum(pl.monto), 0), 2) INTO v_total
    FROM public.edu_pago_lineas pl JOIN public.edu_cargos c ON c.id = pl.cargo_id
   WHERE pl.pago_id = ANY(p_pagos) AND NOT c.es_tercero;
  IF v_total <= 0 THEN RAISE EXCEPTION 'Esos recibos no tienen nada facturable (solo cobros por cuenta de terceros)'; END IF;

  -- Cliente fiscal: el que ya tenga esa cédula/RNC en el colegio, o uno nuevo.
  SELECT id INTO v_cliente FROM public.clientes
   WHERE tenant_id = v_t AND regexp_replace(COALESCE(rnc, ''), '[^0-9]', '', 'g') = v_rnc
   ORDER BY created_at LIMIT 1;
  IF v_cliente IS NULL THEN
    INSERT INTO public.clientes (tenant_id, nombre, rnc, tipo_ncf, telefono)
    SELECT v_t, left(v_nombre, 160), v_rnc, '01',
           COALESCE(NULLIF(f.tutor_telefono, ''), NULLIF(f.madre_celular, ''), NULLIF(f.padre_celular, ''))
      FROM public.edu_familias f WHERE f.id = v_familia
    RETURNING id INTO v_cliente;
  END IF;
  -- El nombre que va en la factura es el que se escribió (el cliente pudo estar guardado distinto).
  UPDATE public.clientes SET nombre = left(v_nombre, 160), tipo_ncf = '01'
   WHERE id = v_cliente AND (nombre IS DISTINCT FROM left(v_nombre, 160) OR tipo_ncf IS DISTINCT FROM '01');
  UPDATE public.edu_familias SET cliente_fiscal_id = v_cliente WHERE id = v_familia;

  -- NCF B01 (crédito fiscal) de la secuencia del colegio.
  v_ncf := public.get_next_ncf('01');
  IF NOT COALESCE((v_ncf->>'success')::boolean, false) THEN
    RAISE EXCEPTION '%. Cárgala en Configuración → Comprobantes Fiscales (tipo 01, crédito fiscal).', v_ncf->>'error';
  END IF;
  SELECT fecha_vencimiento INTO v_vence FROM public.secuencias_ncf WHERE id = (v_ncf->>'secuencia_id')::uuid;

  -- Forma de pago para el 607: la que más pesó en esos recibos, con " - RECIBO":
  -- el 607 la reconoce (EFECTIVO/TRANSFER/TARJETA/CHEQUE), y ninguna suma de caja
  -- (Cierre, Transacciones Diarias, flujo) la toma como venta de contado, porque
  -- todas comparan exacto con 'CONTADO'/'EFECTIVO'. El dinero ya entró con el recibo.
  SELECT CASE WHEN x.forma ILIKE '%efectivo%' THEN 'EFECTIVO' WHEN x.forma ILIKE '%transfer%' THEN 'TRANSFERENCIA'
              WHEN x.forma ILIKE '%tarjeta%' THEN 'TARJETA' WHEN x.forma ILIKE '%cheque%' THEN 'CHEQUE' ELSE 'EFECTIVO' END
    INTO v_forma
    FROM (SELECT fp->>'forma' AS forma, sum(COALESCE((fp->>'monto')::numeric, 0)) AS m
            FROM public.edu_pagos p, jsonb_array_elements(p.formas_pago) fp
           WHERE p.id = ANY(p_pagos) GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 1) x;

  SELECT string_agg('RC-' || lpad(numero::text, 6, '0'), ', ' ORDER BY numero) INTO v_recibos
    FROM public.edu_pagos WHERE id = ANY(p_pagos);

  INSERT INTO public.facturas (tenant_id, fecha, cliente_id, ncf, tipo_ncf, nombre_emisor_ncf, vendedor, almacen,
                               subtotal, descuento, itbis, total, forma_pago, tipo_pago, monto_recibido, cambio,
                               monto_pendiente, estado, usuario_id, notas, cobrada_en_recibo)
  VALUES (v_t, now(), v_cliente, v_ncf->>'ncf', '01', v_ncf->>'nombre_emisor', 'COLEGIO', 'COLEGIO',
          v_total, 0, 0, v_total, COALESCE(v_forma, 'EFECTIVO') || ' - RECIBO', 'contado', v_total, 0,
          -- usuario_id apunta a perfiles (tabla vieja): como en Ventas, vacío si el usuario no está ahí.
          0, 'PAGADA', (SELECT pf.id FROM public.perfiles pf WHERE pf.id = auth.uid()),
          left('Crédito fiscal de los recibos ' || v_recibos || '. Servicios educativos exentos de ITBIS (art. 344 núm. 7, Código Tributario).', 500),
          true)
  RETURNING id, numero INTO v_factura, v_numero;

  -- created_at escalonado: la factura se imprime en el orden de los recibos.
  INSERT INTO public.facturas_detalle (tenant_id, factura_id, codigo, descripcion, cantidad, precio, descuento, itbis, importe, naturaleza, created_at)
  SELECT v_t, v_factura, 'COLEGIO', left(pl.descripcion || ' · ' || e.nombres || ' ' || e.apellidos, 250), 1, pl.monto, 0, 0, pl.monto, 'servicio',
         now() + (row_number() OVER (ORDER BY p.numero, pl.created_at)) * interval '1 millisecond'
    FROM public.edu_pago_lineas pl
    JOIN public.edu_cargos c ON c.id = pl.cargo_id
    JOIN public.edu_estudiantes e ON e.id = pl.estudiante_id
    JOIN public.edu_pagos p ON p.id = pl.pago_id
   WHERE pl.pago_id = ANY(p_pagos) AND NOT c.es_tercero
   ORDER BY p.numero, pl.created_at;

  UPDATE public.edu_pagos SET factura_id = v_factura WHERE id = ANY(p_pagos);
  RETURN jsonb_build_object('factura_id', v_factura, 'numero', v_numero, 'ncf', v_ncf->>'ncf', 'total', v_total,
                            'vence', v_vence, 'restantes', (v_ncf->>'restantes')::int);
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_facturar_pagos(uuid[], text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_facturar_pagos(uuid[], text, text) TO authenticated;

-- Anular una factura de crédito fiscal del colegio (cédula equivocada, recibo
-- que hay que anular...): solo la dirección. Queda ANULADA y sale en el 608;
-- los recibos quedan libres para volver a facturarse o anularse.
CREATE OR REPLACE FUNCTION public.edu_anular_factura_fiscal(p_factura uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_t uuid := public.get_user_tenant(); f public.facturas%ROWTYPE;
BEGIN
  IF NOT private.edu_es_direccion(v_t) THEN RAISE EXCEPTION 'Solo la dirección puede anular una factura'; END IF;
  IF COALESCE(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Escribe el motivo'; END IF;
  SELECT * INTO f FROM public.facturas WHERE id = p_factura AND tenant_id = v_t FOR UPDATE;
  IF NOT FOUND OR NOT f.cobrada_en_recibo THEN RAISE EXCEPTION 'Factura del colegio no encontrada'; END IF;
  IF upper(COALESCE(f.estado, '')) = 'ANULADA' THEN RAISE EXCEPTION 'Esa factura ya está anulada'; END IF;
  UPDATE public.facturas
     SET estado = 'ANULADA', updated_at = now(),
         notas = left(COALESCE(notas, '') || ' | ANULADA: ' || btrim(p_motivo), 1000)
   WHERE id = f.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_anular_factura_fiscal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_anular_factura_fiscal(uuid, text) TO authenticated;

-- ── 2. Configuración del colegio: solo la dirección o "Editar" en Colegio - Configuración ──
CREATE OR REPLACE FUNCTION public.edu_puede_configurar(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT private.edu_es_direccion(p_tenant)
      OR EXISTS (SELECT 1 FROM public.user_module_permissions m
                  WHERE m.user_id = auth.uid() AND m.module_key = 'colegio-config' AND m.can_edit);
$function$;
REVOKE ALL ON FUNCTION public.edu_puede_configurar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_puede_configurar(uuid) TO authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['edu_config','edu_anios','edu_cursos','edu_tarifas','edu_conceptos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_ver', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_crear', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_cambiar', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant())', t || '_ver', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
                      WITH CHECK (tenant_id = public.get_user_tenant() AND public.edu_puede_configurar(tenant_id))', t || '_crear', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
                      USING (tenant_id = public.get_user_tenant() AND public.edu_puede_configurar(tenant_id))
                      WITH CHECK (tenant_id = public.get_user_tenant())', t || '_cambiar', t);
  END LOOP;
END $$;

-- ── 3. Anular un cobro: no si tiene factura de crédito fiscal viva ─────
CREATE OR REPLACE FUNCTION public.edu_anular_pago(p_pago uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_t uuid := public.get_user_tenant(); p public.edu_pagos%ROWTYPE; ln public.edu_pago_lineas%ROWTYPE;
BEGIN
  -- La dirección de ESTE colegio (empresa activa): dueño/admin en usuarios_empresas,
  -- o admin cuya empresa de perfil es esta, o el superadmin. No sirve ser admin de otra empresa.
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND COALESCE(pr.is_superadmin, false))
     AND NOT EXISTS (SELECT 1 FROM public.usuarios_empresas ue WHERE ue.user_id = auth.uid() AND ue.tenant_id = v_t AND ue.rol IN ('owner','admin'))
     AND NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.tenant_id = v_t AND pr.role IN ('admin','owner'))
  THEN
    RAISE EXCEPTION 'Solo la dirección puede anular un cobro';
  END IF;
  IF COALESCE(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Escribe el motivo de la anulación'; END IF;
  SELECT * INTO p FROM public.edu_pagos WHERE id = p_pago AND tenant_id = v_t FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recibo no encontrado'; END IF;
  IF p.anulado THEN RAISE EXCEPTION 'Ese recibo ya está anulado'; END IF;
  -- Con factura de crédito fiscal viva no: primero se anula la factura (va en el 608).
  IF p.factura_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.facturas f WHERE f.id = p.factura_id AND upper(COALESCE(f.estado, '')) <> 'ANULADA') THEN
    RAISE EXCEPTION 'Este recibo tiene factura con crédito fiscal (%). Anúlala primero en Caja del Colegio → Factura crédito fiscal.',
      (SELECT ncf FROM public.facturas WHERE id = p.factura_id);
  END IF;

  FOR ln IN SELECT * FROM public.edu_pago_lineas WHERE pago_id = p.id LOOP
    UPDATE public.edu_cargos c
       SET pagado = greatest(c.pagado - ln.monto_moneda, 0),
           descuento = CASE WHEN p.anio_completo AND c.tipo = 'mensualidad' THEN 0 ELSE c.descuento END,
           estado = CASE WHEN greatest(c.pagado - ln.monto_moneda, 0) <= 0.01 THEN 'pendiente' ELSE 'parcial' END
     WHERE c.id = ln.cargo_id;
  END LOOP;

  UPDATE public.edu_pagos SET anulado = true, motivo_anulacion = btrim(p_motivo), anulado_por = auth.uid(), anulado_at = now()
   WHERE id = p.id;
  IF p.recibo_ingreso_id IS NOT NULL THEN
    UPDATE public.recibos_ingreso SET anulado = true WHERE id = p.recibo_ingreso_id AND tenant_id = v_t;
    DELETE FROM public.movimientos_bancarios WHERE tenant_id = v_t AND origen_tipo = 'recibo' AND origen_id = p.recibo_ingreso_id;
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_anular_pago(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_anular_pago(uuid, text) TO authenticated;

-- ── 4. Cobros con el NCF de su factura ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.edu_reporte_cobros(p_desde date, p_hasta date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_t uuid := public.get_user_tenant(); v_r jsonb;
BEGIN
  IF v_t IS NULL THEN RETURN '[]'::jsonb; END IF;
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta < p_desde THEN RAISE EXCEPTION 'Rango de fechas no válido'; END IF;
  IF p_hasta - p_desde > 366 THEN RAISE EXCEPTION 'El rango máximo es de un año'; END IF;
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'numero')::int), '[]'::jsonb) INTO v_r
    FROM (
      SELECT jsonb_build_object(
               'id', p.id, 'numero', p.numero, 'fecha', p.fecha, 'created_at', p.created_at, 'total', p.total,
               'anulado', p.anulado, 'motivo_anulacion', p.motivo_anulacion, 'formas_pago', p.formas_pago,
               'tasa_usd', p.tasa_usd, 'anio_completo', p.anio_completo,
               'recibo_ingreso', ri.numero, 'usuario', COALESCE(pr.full_name, pr.email),
               'ncf', CASE WHEN upper(COALESCE(fa.estado, '')) <> 'ANULADA' THEN fa.ncf END,
               'familia', f.nombre,
               'tutor', COALESCE(NULLIF(f.tutor_nombre, ''), NULLIF(f.madre_nombre, ''), NULLIF(f.padre_nombre, '')),
               'estudiantes', (SELECT string_agg(DISTINCT e.nombres || ' ' || e.apellidos, ', ')
                                 FROM public.edu_pago_lineas pl JOIN public.edu_estudiantes e ON e.id = pl.estudiante_id
                                WHERE pl.pago_id = p.id),
               'lineas', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                                   'tipo', c.tipo, 'descripcion', pl.descripcion, 'moneda', pl.moneda,
                                   'monto_moneda', pl.monto_moneda, 'monto', pl.monto, 'es_tercero', c.es_tercero,
                                   'estudiante', e.nombres || ' ' || e.apellidos) ORDER BY pl.created_at), '[]'::jsonb)
                            FROM public.edu_pago_lineas pl
                            JOIN public.edu_cargos c ON c.id = pl.cargo_id
                            JOIN public.edu_estudiantes e ON e.id = pl.estudiante_id
                           WHERE pl.pago_id = p.id)
             ) AS x
        FROM public.edu_pagos p
        JOIN public.edu_familias f ON f.id = p.familia_id
        LEFT JOIN public.recibos_ingreso ri ON ri.id = p.recibo_ingreso_id
        LEFT JOIN public.profiles pr ON pr.id = p.usuario_id
        LEFT JOIN public.facturas fa ON fa.id = p.factura_id
       WHERE p.tenant_id = v_t AND p.fecha BETWEEN p_desde AND p_hasta
    ) s;
  RETURN v_r;
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_reporte_cobros(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_reporte_cobros(date, date) TO authenticated;

SELECT public.registrar_migracion('centros_educativos_factura_fiscal.sql');
