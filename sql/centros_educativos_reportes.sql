-- =====================================================================
-- Centros educativos · Parte 4: reservación de cupo, cambio de año,
-- anular un cargo y los reportes del colegio (06/11/2026)
-- ---------------------------------------------------------------------
-- 1. Año siguiente: se crea solo (mismos meses que el actual) la primera
--    vez que alguien reserva o se cambia de año.
-- 2. Reservación de cupo del AÑO PRÓXIMO, cobrada durante el año actual
--    (el colegio la cobra antes de terminar para proyectar). Es un cargo
--    normal del año próximo: se cobra en la Caja como cualquier otro, y al
--    cambiar de año preparar la cuenta no la vuelve a cargar.
-- 3. Anular un cargo SIN pagos (retiro, error): solo la dirección.
-- 4. Cambio de año: promueve al curso siguiente (o gradúa al del último),
--    todos pasan a continuantes, la tarifa NO cambia, los que repiten se
--    quedan, los que no siguen se retiran; prepara las cuentas del año nuevo.
-- 5. edu_cobrar: el año completo es solo con las mensualidades del año
--    ACTUAL (una deuda del año pasado en el mismo cobro no lleva el 5%).
--    5b. preparar la cuenta y los recargos no vuelven a crear lo que la
--    dirección quitó (los índices únicos ignoran los anulados).
-- 6. Reportes (jsonb, sin el tope de 1,000 filas de la pantalla):
--    pendientes (deudores por grado / por mes / antigüedad), cobros
--    (cobrado por día y mes, listado de recibos, arqueo) y reservas.
-- Requiere: centros_educativos_caja.sql
-- =====================================================================

-- ── 0. Quién anuló un cargo ─────────────────────────────────────────────
ALTER TABLE public.edu_cargos ADD COLUMN IF NOT EXISTS anulado_motivo text;
ALTER TABLE public.edu_cargos ADD COLUMN IF NOT EXISTS anulado_por uuid;
ALTER TABLE public.edu_cargos ADD COLUMN IF NOT EXISTS anulado_at timestamptz;

-- La dirección de ESTE colegio (empresa activa): dueño/admin en usuarios_empresas,
-- admin cuya empresa de perfil es esta, o el superadmin (misma regla que anular un cobro).
CREATE OR REPLACE FUNCTION private.edu_es_direccion(p_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND COALESCE(pr.is_superadmin, false))
      OR EXISTS (SELECT 1 FROM public.usuarios_empresas ue WHERE ue.user_id = auth.uid() AND ue.tenant_id = p_tenant AND ue.rol IN ('owner','admin'))
      OR EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.tenant_id = p_tenant AND pr.role IN ('admin','owner'));
$function$;
REVOKE ALL ON FUNCTION private.edu_es_direccion(uuid) FROM PUBLIC, anon, authenticated;

-- Para la pantalla: muestra o esconde lo que solo hace la dirección.
CREATE OR REPLACE FUNCTION public.edu_soy_direccion()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$ SELECT private.edu_es_direccion(public.get_user_tenant()); $function$;
REVOKE ALL ON FUNCTION public.edu_soy_direccion() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_soy_direccion() TO authenticated;

-- ── 1. Año siguiente ────────────────────────────────────────────────────
-- Devuelve el año que sigue al actual; si no existe lo crea con los mismos
-- meses. p_mes_inicio/p_meses (opcionales) lo ajustan (agosto o septiembre).
CREATE OR REPLACE FUNCTION private.edu_anio_siguiente(p_tenant uuid, p_mes_inicio integer DEFAULT NULL, p_meses integer DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE a public.edu_anios%ROWTYPE; v_id uuid;
BEGIN
  SELECT * INTO a FROM public.edu_anios WHERE tenant_id = p_tenant AND actual;
  IF NOT FOUND THEN RAISE EXCEPTION 'No hay año escolar actual'; END IF;
  SELECT id INTO v_id FROM public.edu_anios WHERE tenant_id = p_tenant AND anio_inicio = a.anio_inicio + 1;
  IF v_id IS NULL THEN
    INSERT INTO public.edu_anios (tenant_id, nombre, anio_inicio, mes_inicio, meses, actual)
    VALUES (p_tenant, (a.anio_inicio + 1) || '-' || (a.anio_inicio + 2), a.anio_inicio + 1,
            COALESCE(p_mes_inicio, a.mes_inicio), COALESCE(p_meses, a.meses), false)
    RETURNING id INTO v_id;
  ELSIF p_mes_inicio IS NOT NULL OR p_meses IS NOT NULL THEN
    UPDATE public.edu_anios
       SET mes_inicio = COALESCE(p_mes_inicio, mes_inicio), meses = COALESCE(p_meses, meses)
     WHERE id = v_id;
  END IF;
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION private.edu_anio_siguiente(uuid, integer, integer) FROM PUBLIC, anon, authenticated;

-- Curso siguiente por orden (NULL = es el último: se gradúa).
CREATE OR REPLACE FUNCTION private.edu_curso_siguiente(p_curso uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT n.id
    FROM public.edu_cursos c
    JOIN public.edu_cursos n ON n.tenant_id = c.tenant_id AND n.activo AND n.orden > c.orden
   WHERE c.id = p_curso
   ORDER BY n.orden, n.nombre
   LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION private.edu_curso_siguiente(uuid) FROM PUBLIC, anon, authenticated;

-- ── 2. Reservar el cupo del año próximo ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.edu_reservar_cupo(p_estudiante uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_t uuid := public.get_user_tenant();
  e public.edu_estudiantes%ROWTYPE; c public.edu_conceptos%ROWTYPE;
  v_anio uuid; v_nombre text; v_id uuid;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  SELECT * INTO e FROM public.edu_estudiantes WHERE id = p_estudiante AND tenant_id = v_t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estudiante no encontrado'; END IF;
  IF e.estado <> 'activo' THEN RAISE EXCEPTION 'El estudiante no está activo'; END IF;
  IF e.curso_id IS NOT NULL AND private.edu_curso_siguiente(e.curso_id) IS NULL THEN
    RAISE EXCEPTION '% está en el último curso: se gradúa este año', e.nombres;
  END IF;
  SELECT * INTO c FROM public.edu_conceptos WHERE tenant_id = v_t AND tipo = 'reservacion' AND activo ORDER BY orden, created_at LIMIT 1;
  IF NOT FOUND OR c.monto <= 0 THEN RAISE EXCEPTION 'Activa el concepto "Reservación de cupo" (con su monto) en Configuración del Colegio'; END IF;
  v_anio := private.edu_anio_siguiente(v_t);
  SELECT nombre INTO v_nombre FROM public.edu_anios WHERE id = v_anio;
  INSERT INTO public.edu_cargos (tenant_id, estudiante_id, anio_id, concepto_id, tipo, descripcion, moneda, monto_bruto, monto, es_tercero)
  VALUES (v_t, e.id, v_anio, c.id, 'reservacion', c.nombre || ' ' || v_nombre, c.moneda, c.monto, c.monto, c.es_tercero)
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Ya tiene el cupo de % reservado', v_nombre;
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_reservar_cupo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_reservar_cupo(uuid) TO authenticated;

-- ── 3. Anular un cargo sin pagos (solo la dirección) ────────────────────
-- Con abonos no: primero se anula el recibo. Su recargo sin pagar se va con él.
CREATE OR REPLACE FUNCTION public.edu_anular_cargo(p_cargo uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_t uuid := public.get_user_tenant(); g public.edu_cargos%ROWTYPE;
BEGIN
  IF NOT private.edu_es_direccion(v_t) THEN RAISE EXCEPTION 'Solo la dirección puede anular un cargo'; END IF;
  IF COALESCE(btrim(p_motivo), '') = '' THEN RAISE EXCEPTION 'Escribe el motivo'; END IF;
  SELECT * INTO g FROM public.edu_cargos WHERE id = p_cargo AND tenant_id = v_t FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cargo no encontrado'; END IF;
  IF g.estado = 'anulado' THEN RAISE EXCEPTION 'Ese cargo ya está anulado'; END IF;
  IF g.pagado > 0 OR g.estado = 'pagado' THEN RAISE EXCEPTION '% tiene pagos: anula primero el recibo', g.descripcion; END IF;
  UPDATE public.edu_cargos
     SET estado = 'anulado', anulado_motivo = btrim(p_motivo), anulado_por = auth.uid(), anulado_at = now()
   WHERE tenant_id = v_t AND estado IN ('pendiente','parcial') AND pagado = 0
     AND (id = g.id OR (tipo = 'recargo' AND cargo_origen_id = g.id));
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_anular_cargo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_anular_cargo(uuid, text) TO authenticated;

-- ── 4. Cambio de año ────────────────────────────────────────────────────
-- p_anio_actual: el año que se ve en pantalla (si ya no es el actual, no hace nada).
-- p_repiten: se quedan en su curso. p_retirar: no siguen (se retiran y se
-- anulan sus cargos sin pagar del año nuevo). El resto sube un curso; el
-- del último curso se gradúa. La tarifa no se toca. p_preparar: crea la
-- cuenta del año nuevo de cada uno (la reservación ya pagada no se repite).
CREATE OR REPLACE FUNCTION public.edu_cambiar_anio(p_anio_actual uuid, p_repiten uuid[] DEFAULT NULL, p_retirar uuid[] DEFAULT NULL,
                                                   p_preparar boolean DEFAULT true,
                                                   p_mes_inicio integer DEFAULT NULL, p_meses integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_t uuid := public.get_user_tenant();
  v_actual public.edu_anios%ROWTYPE; v_nuevo uuid; v_nombre text;
  e public.edu_estudiantes%ROWTYPE; v_sig uuid; v_tandas text[];
  v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_prom integer := 0; v_rep integer := 0; v_grad integer := 0; v_ret integer := 0; v_cargos integer := 0;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  IF NOT private.edu_es_direccion(v_t) THEN RAISE EXCEPTION 'Solo la dirección puede cambiar el año escolar'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('edu_cambio_anio:' || v_t::text));
  SELECT * INTO v_actual FROM public.edu_anios WHERE tenant_id = v_t AND actual FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No hay año escolar actual'; END IF;
  -- El año que la dirección confirmó en pantalla: un segundo clic (u otra pestaña) no avanza otro año.
  IF v_actual.id IS DISTINCT FROM p_anio_actual THEN
    RAISE EXCEPTION 'El año escolar ya cambió (ahora es %). Recarga la pantalla.', v_actual.nombre;
  END IF;
  v_nuevo := private.edu_anio_siguiente(v_t, p_mes_inicio, p_meses);
  SELECT nombre INTO v_nombre FROM public.edu_anios WHERE id = v_nuevo;

  FOR e IN SELECT * FROM public.edu_estudiantes WHERE tenant_id = v_t AND estado = 'activo' ORDER BY matricula FOR UPDATE LOOP
    IF e.id = ANY(COALESCE(p_retirar, '{}')) THEN
      UPDATE public.edu_estudiantes
         SET estado = 'retirado', fecha_retiro = v_hoy, motivo_retiro = COALESCE(NULLIF(motivo_retiro, ''), 'No continuó en ' || v_nombre)
       WHERE id = e.id;
      UPDATE public.edu_cargos
         SET estado = 'anulado', anulado_motivo = 'No continuó en ' || v_nombre, anulado_por = auth.uid(), anulado_at = now()
       WHERE tenant_id = v_t AND estudiante_id = e.id AND anio_id = v_nuevo AND estado = 'pendiente' AND pagado = 0;
      v_ret := v_ret + 1;
    ELSIF e.id = ANY(COALESCE(p_repiten, '{}')) OR e.curso_id IS NULL THEN
      UPDATE public.edu_estudiantes SET condicion = 'continuante' WHERE id = e.id;
      IF e.curso_id IS NOT NULL THEN v_rep := v_rep + 1; ELSE v_prom := v_prom + 1; END IF;
    ELSE
      v_sig := private.edu_curso_siguiente(e.curso_id);
      IF v_sig IS NULL THEN
        UPDATE public.edu_estudiantes SET estado = 'graduado', condicion = 'continuante' WHERE id = e.id;
        v_grad := v_grad + 1;
      ELSE
        -- La tanda se mantiene si el curso nuevo la tiene (secundaria es solo matutina).
        SELECT tandas INTO v_tandas FROM public.edu_cursos WHERE id = v_sig;
        UPDATE public.edu_estudiantes
           SET curso_id = v_sig, condicion = 'continuante',
               tanda = CASE WHEN tanda IS NULL OR tanda = ANY(v_tandas) THEN tanda ELSE v_tandas[1] END
         WHERE id = e.id;
        v_prom := v_prom + 1;
      END IF;
    END IF;
  END LOOP;

  -- El año viejo se cierra (sus deudas siguen cobrándose en la Caja).
  UPDATE public.edu_anios SET actual = false, cerrado = true WHERE id = v_actual.id;
  UPDATE public.edu_anios SET actual = true, cerrado = false WHERE id = v_nuevo;

  IF p_preparar THEN
    FOR e IN SELECT * FROM public.edu_estudiantes WHERE tenant_id = v_t AND estado = 'activo' ORDER BY matricula LOOP
      v_cargos := v_cargos + public.edu_preparar_cuenta(e.id, NULL, true);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('anio', v_nombre, 'promovidos', v_prom, 'repiten', v_rep, 'graduados', v_grad,
                            'retirados', v_ret, 'cargos', v_cargos);
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_cambiar_anio(uuid, uuid[], uuid[], boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_cambiar_anio(uuid, uuid[], uuid[], boolean, integer, integer) TO authenticated;

-- ── 5. Cobrar (año completo = solo mensualidades del año actual) ────────
CREATE OR REPLACE FUNCTION public.edu_cobrar(p_familia uuid, p_lineas jsonb, p_formas jsonb,
                                             p_tasa numeric DEFAULT NULL, p_anio_completo uuid[] DEFAULT NULL, p_notas text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_t uuid := public.get_user_tenant();
  f public.edu_familias%ROWTYPE;
  cfg public.edu_config%ROWTYPE;
  l jsonb; fp jsonb; g public.edu_cargos%ROWTYPE;
  v_m numeric; v_rd numeric; v_total numeric := 0; v_formas numeric := 0; v_pend numeric; v_desc numeric;
  v_pago uuid; v_num integer; v_recibo uuid; v_recibo_num text; v_cliente uuid;
  v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_bancos integer := 0; v_concepto text; v_desc_pct numeric;
  v_mens_anio integer; v_mens_lineas integer := 0;
  v_anio uuid; v_ac boolean;
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  SELECT * INTO f FROM public.edu_familias WHERE id = p_familia AND tenant_id = v_t FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Familia no encontrada'; END IF;
  SELECT * INTO cfg FROM public.edu_config WHERE tenant_id = v_t;
  SELECT id INTO v_anio FROM public.edu_anios WHERE tenant_id = v_t AND actual;
  v_desc_pct := COALESCE(cfg.descuento_anual_pct, 0);
  -- Recargos al día antes de cobrar (no duplica).
  PERFORM private.edu_aplicar_recargos(v_t);
  IF jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN RAISE EXCEPTION 'No hay nada que cobrar'; END IF;
  IF jsonb_typeof(p_formas) <> 'array' OR jsonb_array_length(p_formas) = 0 THEN RAISE EXCEPTION 'Falta la forma de pago'; END IF;

  -- Número del recibo del colegio
  PERFORM pg_advisory_xact_lock(hashtext('edu_pago:' || v_t::text));
  SELECT COALESCE(max(numero), 0) + 1 INTO v_num FROM public.edu_pagos WHERE tenant_id = v_t;

  INSERT INTO public.edu_pagos (tenant_id, numero, fecha, familia_id, total, formas_pago, tasa_usd, anio_completo, notas)
  VALUES (v_t, v_num, v_hoy, f.id, 1, p_formas, p_tasa, COALESCE(cardinality(p_anio_completo), 0) > 0, NULLIF(btrim(p_notas), ''))
  RETURNING id INTO v_pago;

  FOR l IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    SELECT c.* INTO g FROM public.edu_cargos c
      JOIN public.edu_estudiantes e ON e.id = c.estudiante_id
     WHERE c.id = (l->>'cargo_id')::uuid AND c.tenant_id = v_t AND e.familia_id = f.id
     FOR UPDATE OF c;
    IF NOT FOUND THEN RAISE EXCEPTION 'Un cargo no es de esta familia'; END IF;
    IF g.estado IN ('pagado','anulado') THEN RAISE EXCEPTION '% ya está pagado', g.descripcion; END IF;
    v_m := round((l->>'monto')::numeric, 2);
    IF v_m IS NULL OR v_m <= 0 THEN RAISE EXCEPTION 'Monto no válido en %', g.descripcion; END IF;

    -- Año completo: las mensualidades del año ACTUAL llevan el descuento y se saldan enteras.
    v_ac := g.tipo = 'mensualidad' AND g.anio_id = v_anio AND g.estudiante_id = ANY(COALESCE(p_anio_completo, '{}'));
    v_desc := 0;
    IF v_ac THEN
      IF g.pagado > 0 THEN RAISE EXCEPTION 'El año completo es con las mensualidades sin abonar (% tiene abono)', g.descripcion; END IF;
      v_desc := round(g.monto * v_desc_pct / 100.0, 2);
      IF abs(v_m - (g.monto - v_desc)) > 0.01 THEN RAISE EXCEPTION 'El año completo de % es %', g.descripcion, g.monto - v_desc; END IF;
      v_mens_lineas := v_mens_lineas + 1;
    END IF;

    v_pend := g.monto - g.descuento - v_desc - g.pagado;
    IF v_m > v_pend + 0.01 THEN RAISE EXCEPTION '% pendiente es %, no %', g.descripcion, v_pend, v_m; END IF;
    -- Mensualidad: el mes completo o la mitad (regla del colegio), nada de abonos sueltos.
    IF g.tipo = 'mensualidad' AND NOT v_ac AND abs(v_m - v_pend) > 0.01 THEN
      IF NOT COALESCE(cfg.permite_medio_mes, false) OR g.pagado > 0 OR abs(v_m - round(g.monto / 2.0, 2)) > 0.01 THEN
        RAISE EXCEPTION '% se paga completa (%)%', g.descripcion, v_pend,
          CASE WHEN COALESCE(cfg.permite_medio_mes, false) AND g.pagado = 0 THEN ' o la mitad (' || round(g.monto / 2.0, 2) || ')' ELSE '' END;
      END IF;
    END IF;

    IF g.moneda = 'USD' THEN
      IF p_tasa IS NULL OR p_tasa <= 0 THEN RAISE EXCEPTION 'Falta la tasa del dólar para %', g.descripcion; END IF;
      v_rd := round(v_m * p_tasa, 2);
    ELSE
      v_rd := v_m;
    END IF;

    INSERT INTO public.edu_pago_lineas (tenant_id, pago_id, cargo_id, estudiante_id, descripcion, moneda, monto_moneda, monto)
    VALUES (v_t, v_pago, g.id, g.estudiante_id, g.descripcion, g.moneda, v_m, v_rd);

    UPDATE public.edu_cargos
       SET pagado = pagado + v_m,
           descuento = descuento + v_desc,
           estado = CASE WHEN pagado + v_m >= monto - descuento - v_desc - 0.01 THEN 'pagado' ELSE 'parcial' END
     WHERE id = g.id;
    v_total := v_total + v_rd;
  END LOOP;

  -- El año completo tiene que incluir todas las mensualidades pendientes del año actual del estudiante.
  IF COALESCE(cardinality(p_anio_completo), 0) > 0 THEN
    IF v_mens_lineas = 0 THEN RAISE EXCEPTION 'El año completo necesita las mensualidades del año actual'; END IF;
    SELECT count(*) INTO v_mens_anio
      FROM public.edu_cargos c
     WHERE c.tenant_id = v_t AND c.tipo = 'mensualidad' AND c.estado IN ('pendiente','parcial')
       AND c.anio_id = v_anio AND c.estudiante_id = ANY(p_anio_completo);
    IF v_mens_anio > 0 THEN RAISE EXCEPTION 'Para el descuento del año completo hay que pagar todas las mensualidades pendientes'; END IF;
  END IF;

  -- Formas de pago = total
  FOR fp IN SELECT * FROM jsonb_array_elements(p_formas) LOOP
    IF COALESCE((fp->>'monto')::numeric, 0) < 0 THEN RAISE EXCEPTION 'Forma de pago con monto negativo'; END IF;
    v_formas := v_formas + COALESCE((fp->>'monto')::numeric, 0);
    IF NULLIF(fp->>'cuenta_id', '') IS NOT NULL THEN
      v_bancos := v_bancos + 1;
      IF NOT EXISTS (SELECT 1 FROM public.cuentas_bancarias WHERE id = (fp->>'cuenta_id')::uuid AND tenant_id = v_t) THEN
        RAISE EXCEPTION 'La cuenta bancaria no es de este colegio';
      END IF;
    END IF;
  END LOOP;
  IF abs(v_formas - v_total) > 0.01 THEN RAISE EXCEPTION 'Las formas de pago (%) no suman el total (%)', v_formas, v_total; END IF;
  IF v_bancos > 1 THEN RAISE EXCEPTION 'Una transferencia por cobro (una sola cuenta bancaria)'; END IF;

  -- Cliente de la familia (para el recibo de ingreso y la factura con crédito fiscal)
  v_cliente := f.cliente_id;
  IF v_cliente IS NULL OR NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = v_cliente AND tenant_id = v_t) THEN
    INSERT INTO public.clientes (tenant_id, nombre, telefono)
    VALUES (v_t, left(COALESCE(NULLIF(f.tutor_nombre, ''), NULLIF(f.madre_nombre, ''), NULLIF(f.padre_nombre, ''), 'Familia ' || f.nombre)
                      || ' (Fam. ' || f.nombre || ')', 160),
            COALESCE(NULLIF(f.tutor_telefono, ''), NULLIF(f.madre_celular, ''), NULLIF(f.padre_celular, '')))
    RETURNING id INTO v_cliente;
    UPDATE public.edu_familias SET cliente_id = v_cliente WHERE id = f.id;
  END IF;

  -- Recibo de ingreso normal → Cierre de Caja y reporte del día lo cuentan solos.
  SELECT string_agg(DISTINCT descripcion, ', ') INTO v_concepto FROM public.edu_pago_lineas WHERE pago_id = v_pago;
  v_recibo_num := public.get_next_recibo_ingreso_numero();
  INSERT INTO public.recibos_ingreso (tenant_id, numero, cliente_id, fecha, monto_pagado, concepto, formas_pago, usuario_id, origen)
  VALUES (v_t, v_recibo_num, v_cliente, v_hoy, v_total,
          left('Colegio RC-' || lpad(v_num::text, 6, '0') || ': ' || COALESCE(v_concepto, ''), 500),
          p_formas, auth.uid(), 'colegio')
  RETURNING id INTO v_recibo;

  -- La transferencia entra en su cuenta bancaria.
  FOR fp IN SELECT * FROM jsonb_array_elements(p_formas) LOOP
    IF NULLIF(fp->>'cuenta_id', '') IS NOT NULL AND COALESCE((fp->>'monto')::numeric, 0) > 0 THEN
      PERFORM public.registrar_movimiento_bancario((fp->>'cuenta_id')::uuid, 'ENTRADA', (fp->>'monto')::numeric,
        'Colegio RC-' || lpad(v_num::text, 6, '0') || ' · ' || f.nombre, NULLIF(fp->>'referencia', ''), 'recibo', v_recibo, v_hoy);
    END IF;
  END LOOP;

  UPDATE public.edu_pagos SET total = v_total, recibo_ingreso_id = v_recibo WHERE id = v_pago;
  RETURN jsonb_build_object('pago_id', v_pago, 'numero', v_num, 'total', v_total, 'recibo_ingreso', v_recibo_num);
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_cobrar(uuid, jsonb, jsonb, numeric, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_cobrar(uuid, jsonb, jsonb, numeric, uuid[], text) TO authenticated;

-- ── 5b. Lo que la dirección quitó no vuelve ─────────────────────────────
-- Los índices únicos no miran los cargos anulados; sin esto, preparar la
-- cuenta o poner los recargos volvería a crear lo que se quitó.
CREATE OR REPLACE FUNCTION public.edu_preparar_cuenta(p_estudiante uuid, p_desde date DEFAULT NULL, p_anuales boolean DEFAULT true)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_t uuid := public.get_user_tenant();
  e public.edu_estudiantes%ROWTYPE;
  a public.edu_anios%ROWTYPE;
  c public.edu_conceptos%ROWTYPE;
  cfg public.edu_config%ROWTYPE;
  v_n integer := 0; v_i integer; v_per date; v_desde date; v_mes text;
  v_meses text[] := ARRAY['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
BEGIN
  SELECT * INTO e FROM public.edu_estudiantes WHERE id = p_estudiante AND tenant_id = v_t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Estudiante no encontrado'; END IF;
  IF e.estado <> 'activo' THEN RAISE EXCEPTION 'El estudiante no está activo'; END IF;
  SELECT * INTO a FROM public.edu_anios WHERE tenant_id = v_t AND actual;
  IF NOT FOUND THEN RAISE EXCEPTION 'No hay año escolar actual'; END IF;
  SELECT * INTO cfg FROM public.edu_config WHERE tenant_id = v_t;
  v_desde := date_trunc('month', COALESCE(p_desde, make_date(a.anio_inicio, a.mes_inicio, 1)))::date;

  -- Conceptos anuales según la condición (nuevo: inscripción; continuante: reservación).
  IF p_anuales THEN
    FOR c IN SELECT * FROM public.edu_conceptos
              WHERE tenant_id = v_t AND activo AND frecuencia = 'anual' AND obligatorio
                AND tipo IN ('inscripcion','reservacion','utileria','bilingue')
                AND (aplica_a = 'todos' OR aplica_a = e.condicion)
    LOOP
      INSERT INTO public.edu_cargos (tenant_id, estudiante_id, anio_id, concepto_id, tipo, descripcion, moneda, monto_bruto, monto, es_tercero)
      SELECT v_t, e.id, a.id, c.id, c.tipo, c.nombre, c.moneda, c.monto, c.monto, c.es_tercero
       WHERE NOT EXISTS (SELECT 1 FROM public.edu_cargos x WHERE x.estudiante_id = e.id AND x.anio_id = a.id
                           AND x.tipo = c.tipo AND x.periodo IS NULL AND x.estado = 'anulado')
      ON CONFLICT DO NOTHING;
      IF FOUND THEN v_n := v_n + 1; END IF;
    END LOOP;
  END IF;

  -- Mensualidades (con beca) y Sala de Tareas, desde el mes indicado.
  SELECT * INTO c FROM public.edu_conceptos WHERE tenant_id = v_t AND tipo = 'mensualidad' AND activo ORDER BY orden, created_at LIMIT 1;
  FOR v_i IN 0 .. a.meses - 1 LOOP
    v_per := (make_date(a.anio_inicio, a.mes_inicio, 1) + make_interval(months => v_i))::date;
    CONTINUE WHEN v_per < v_desde;
    v_mes := v_meses[extract(month FROM v_per)::int] || ' ' || extract(year FROM v_per)::int;
    -- Beca 100%: la mensualidad queda en 0 y nace pagada (no sale como deuda).
    INSERT INTO public.edu_cargos (tenant_id, estudiante_id, anio_id, concepto_id, tipo, descripcion, periodo, vence,
                                   moneda, monto_bruto, beca_pct, monto, estado)
    SELECT v_t, e.id, a.id, c.id, 'mensualidad', 'Mensualidad ' || v_mes, v_per,
           v_per + (COALESCE(cfg.dia_limite_pago, 5) - 1),
           'DOP', e.tarifa_mensual, e.beca_pct, round(e.tarifa_mensual * (1 - e.beca_pct / 100.0), 2),
           CASE WHEN round(e.tarifa_mensual * (1 - e.beca_pct / 100.0), 2) <= 0 THEN 'pagado' ELSE 'pendiente' END
     WHERE NOT EXISTS (SELECT 1 FROM public.edu_cargos x WHERE x.estudiante_id = e.id AND x.anio_id = a.id
                         AND x.tipo = 'mensualidad' AND x.periodo = v_per AND x.estado = 'anulado')
    ON CONFLICT DO NOTHING;
    IF FOUND THEN v_n := v_n + 1; END IF;
  END LOOP;
  IF e.sala_tareas THEN
    SELECT * INTO c FROM public.edu_conceptos WHERE tenant_id = v_t AND tipo = 'sala_tareas' AND activo ORDER BY orden, created_at LIMIT 1;
    IF FOUND THEN
      FOR v_i IN 0 .. a.meses - 1 LOOP
        v_per := (make_date(a.anio_inicio, a.mes_inicio, 1) + make_interval(months => v_i))::date;
        CONTINUE WHEN v_per < v_desde;
        v_mes := v_meses[extract(month FROM v_per)::int] || ' ' || extract(year FROM v_per)::int;
        INSERT INTO public.edu_cargos (tenant_id, estudiante_id, anio_id, concepto_id, tipo, descripcion, periodo, vence, moneda, monto_bruto, monto)
        SELECT v_t, e.id, a.id, c.id, 'sala_tareas', 'Sala de Tareas ' || v_mes, v_per,
               v_per + (COALESCE(cfg.dia_limite_pago, 5) - 1), 'DOP', c.monto, c.monto
         WHERE NOT EXISTS (SELECT 1 FROM public.edu_cargos x WHERE x.estudiante_id = e.id AND x.anio_id = a.id
                             AND x.tipo = 'sala_tareas' AND x.periodo = v_per AND x.estado = 'anulado')
        ON CONFLICT DO NOTHING;
        IF FOUND THEN v_n := v_n + 1; END IF;
      END LOOP;
    END IF;
  END IF;
  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_preparar_cuenta(uuid, date, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_preparar_cuenta(uuid, date, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION private.edu_aplicar_recargos(p_tenant uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_t uuid := p_tenant; v_rec numeric; v_c uuid; v_n integer;
  v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
BEGIN
  IF v_t IS NULL THEN RETURN 0; END IF;
  SELECT recargo_monto INTO v_rec FROM public.edu_config WHERE tenant_id = v_t;
  IF COALESCE(v_rec, 0) <= 0 THEN RETURN 0; END IF;
  SELECT id INTO v_c FROM public.edu_conceptos WHERE tenant_id = v_t AND tipo = 'recargo' AND activo ORDER BY orden, created_at LIMIT 1;
  IF v_c IS NULL THEN RETURN 0; END IF;     -- el colegio apagó el recargo
  INSERT INTO public.edu_cargos (tenant_id, estudiante_id, anio_id, concepto_id, tipo, descripcion, periodo, vence,
                                 moneda, monto_bruto, monto, cargo_origen_id)
  SELECT m.tenant_id, m.estudiante_id, m.anio_id, v_c, 'recargo', 'Recargo ' || substr(m.descripcion, 13),
         m.periodo, v_hoy, 'DOP', v_rec, v_rec, m.id
    FROM public.edu_cargos m
    JOIN public.edu_estudiantes e ON e.id = m.estudiante_id AND e.estado = 'activo'
   WHERE m.tenant_id = v_t AND m.tipo = 'mensualidad' AND m.estado IN ('pendiente','parcial')
     AND m.monto > 0
     AND v_hoy >= (m.periodo + interval '1 month')::date
     AND NOT EXISTS (SELECT 1 FROM public.edu_cargos x WHERE x.cargo_origen_id = m.id AND x.tipo = 'recargo' AND x.estado = 'anulado')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION private.edu_aplicar_recargos(uuid) FROM PUBLIC, anon, authenticated;

-- ── 6. Reportes ─────────────────────────────────────────────────────────
-- 6a. Todo lo pendiente (sin la reservación del año próximo, que no es deuda
-- todavía). Del estudiante retirado solo lo que venció antes de su retiro.
-- "desde" = día en que venció (mensual: el día límite; anual: cuando se cargó).
-- No es STABLE: primero pone los recargos al día.
CREATE OR REPLACE FUNCTION public.edu_reporte_pendientes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_t uuid := public.get_user_tenant(); v_ai integer; v_r jsonb;
BEGIN
  IF v_t IS NULL THEN RETURN '[]'::jsonb; END IF;
  PERFORM private.edu_aplicar_recargos(v_t);
  SELECT anio_inicio INTO v_ai FROM public.edu_anios WHERE tenant_id = v_t AND actual;
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'curso_orden', x->>'estudiante', x->>'desde'), '[]'::jsonb) INTO v_r
    FROM (
      SELECT jsonb_build_object(
               'cargo_id', c.id, 'tipo', c.tipo, 'descripcion', c.descripcion, 'periodo', c.periodo,
               'desde', COALESCE(c.vence, (c.created_at AT TIME ZONE 'America/Santo_Domingo')::date),
               'moneda', c.moneda, 'pendiente', round(c.monto - c.descuento - c.pagado, 2), 'es_tercero', c.es_tercero,
               'anio', a.nombre, 'anio_actual', a.anio_inicio = v_ai,
               'estudiante_id', e.id, 'estudiante', e.nombres || ' ' || e.apellidos, 'matricula', e.matricula,
               'estado', e.estado, 'tanda', e.tanda,
               'curso', COALESCE(cu.nombre, 'Sin curso'), 'curso_orden', lpad(COALESCE(cu.orden, 999)::text, 4, '0'),
               'familia_id', f.id, 'familia', f.nombre,
               'tutor', COALESCE(NULLIF(f.tutor_nombre, ''), NULLIF(f.madre_nombre, ''), NULLIF(f.padre_nombre, '')),
               'telefono', COALESCE(NULLIF(f.tutor_telefono, ''), NULLIF(f.madre_celular, ''), NULLIF(f.padre_celular, ''), NULLIF(f.telefono_residencial, ''))
             ) AS x
        FROM public.edu_cargos c
        JOIN public.edu_anios a ON a.id = c.anio_id
        JOIN public.edu_estudiantes e ON e.id = c.estudiante_id
        JOIN public.edu_familias f ON f.id = e.familia_id
        LEFT JOIN public.edu_cursos cu ON cu.id = e.curso_id
       WHERE c.tenant_id = v_t AND c.estado IN ('pendiente','parcial')
         AND c.monto - c.descuento - c.pagado > 0.009
         AND (v_ai IS NULL OR a.anio_inicio <= v_ai)
         AND (e.estado = 'activo'
              OR COALESCE(c.vence, (c.created_at AT TIME ZONE 'America/Santo_Domingo')::date)
                 <= COALESCE(e.fecha_retiro, (now() AT TIME ZONE 'America/Santo_Domingo')::date))
    ) s;
  RETURN v_r;
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_reporte_pendientes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_reporte_pendientes() TO authenticated;

-- 6b. Cobros de un rango (recibos del colegio con sus líneas). Máximo un año.
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
       WHERE p.tenant_id = v_t AND p.fecha BETWEEN p_desde AND p_hasta
    ) s;
  RETURN v_r;
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_reporte_cobros(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_reporte_cobros(date, date) TO authenticated;

-- 6c. Reservas del año próximo (proyección): cada estudiante activo con su
-- curso siguiente y si reservó (pagada / pendiente / sin reservar / se gradúa).
CREATE OR REPLACE FUNCTION public.edu_reporte_reservas()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_t uuid := public.get_user_tenant(); v_ai integer; v_sig uuid; v_sig_nombre text; v_r jsonb;
BEGIN
  IF v_t IS NULL THEN RETURN NULL; END IF;
  SELECT anio_inicio INTO v_ai FROM public.edu_anios WHERE tenant_id = v_t AND actual;
  IF v_ai IS NULL THEN RAISE EXCEPTION 'No hay año escolar actual'; END IF;
  SELECT id, nombre INTO v_sig, v_sig_nombre FROM public.edu_anios WHERE tenant_id = v_t AND anio_inicio = v_ai + 1;
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'curso_orden', x->>'estudiante'), '[]'::jsonb) INTO v_r
    FROM (
      SELECT jsonb_build_object(
               'estudiante_id', e.id, 'estudiante', e.nombres || ' ' || e.apellidos, 'matricula', e.matricula,
               'curso', COALESCE(cu.nombre, 'Sin curso'), 'curso_orden', lpad(COALESCE(cu.orden, 999)::text, 4, '0'),
               'tanda', e.tanda, 'tarifa', e.tarifa_mensual, 'beca_pct', e.beca_pct,
               'curso_siguiente', CASE WHEN cu.id IS NULL THEN 'Sin curso' ELSE COALESCE(ns.nombre, 'Se gradúa') END,
               'curso_siguiente_orden', lpad(COALESCE(ns.orden, 999)::text, 4, '0'),
               'familia_id', f.id, 'familia', f.nombre,
               'tutor', COALESCE(NULLIF(f.tutor_nombre, ''), NULLIF(f.madre_nombre, ''), NULLIF(f.padre_nombre, '')),
               'telefono', COALESCE(NULLIF(f.tutor_telefono, ''), NULLIF(f.madre_celular, ''), NULLIF(f.padre_celular, '')),
               'reserva', CASE
                            WHEN cu.id IS NOT NULL AND ns.id IS NULL THEN 'gradua'
                            WHEN r.id IS NULL THEN 'sin_reservar'
                            WHEN r.estado = 'pagado' THEN 'pagada'
                            ELSE 'pendiente' END,
               'reserva_pagado', COALESCE(r.pagado, 0), 'reserva_monto', COALESCE(r.monto, 0)
             ) AS x
        FROM public.edu_estudiantes e
        JOIN public.edu_familias f ON f.id = e.familia_id
        LEFT JOIN public.edu_cursos cu ON cu.id = e.curso_id
        LEFT JOIN public.edu_cursos ns ON ns.id = private.edu_curso_siguiente(e.curso_id)
        LEFT JOIN public.edu_cargos r ON v_sig IS NOT NULL AND r.estudiante_id = e.id AND r.anio_id = v_sig
                                     AND r.tipo = 'reservacion' AND r.estado <> 'anulado'
       WHERE e.tenant_id = v_t AND e.estado = 'activo'
    ) s;
  RETURN jsonb_build_object('anio_siguiente', COALESCE(v_sig_nombre, (v_ai + 1) || '-' || (v_ai + 2)), 'filas', v_r);
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_reporte_reservas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_reporte_reservas() TO authenticated;

SELECT public.registrar_migracion('centros_educativos_reportes.sql');
