-- =====================================================================
-- CENTROS EDUCATIVOS · PARTE 3: LA CAJA DEL COLEGIO (06/11/2026)
-- ---------------------------------------------------------------------
-- · CARGOS (edu_cargos): la cuenta de cada estudiante en el año escolar.
--   Una fila por mensualidad (con la beca ya aplicada), por concepto anual
--   (inscripción o reservación, utilería, Sistema Bilingüe en US$), por
--   Sala de Tareas de cada mes y por cada recargo. pagado/estado se mueven
--   con los cobros.
-- · RECARGO: RD$200 (edu_config.recargo_monto) por cada mensualidad que el
--   día 1 del mes siguiente no esté pagada completa. Se crea solo
--   (edu_aplicar_recargos) y no se duplica.
-- · COBRO (edu_cobrar): una sola transacción que
--     1) valida cada línea (la mensualidad: completa o media, nada de abonos
--        sueltos; el año completo con su descuento solo sobre mensualidades),
--     2) crea el recibo del colegio (edu_pagos, RC-000001…) y sus líneas,
--     3) crea el RECIBO DE INGRESO normal (recibos_ingreso, origen 'colegio')
--        con las formas de pago → entra solo en el Cierre de Caja y en el
--        reporte del día, sin tocarlos,
--     4) anota la transferencia en la cuenta bancaria escogida.
--   El Sistema Bilingüe se cobra en US$: si pagan en pesos, a la tasa del
--   día que pone la caja; el recibo guarda US$, tasa y RD$.
-- · ANULAR (edu_anular_pago): solo dueño/admin. Devuelve los cargos, anula
--   el recibo de ingreso y quita el movimiento del banco. Nada se borra.
-- Idempotente.
-- =====================================================================

-- ── 1. Cargos ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.edu_cargos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  estudiante_id  uuid NOT NULL REFERENCES public.edu_estudiantes(id),
  anio_id        uuid NOT NULL REFERENCES public.edu_anios(id),
  concepto_id    uuid REFERENCES public.edu_conceptos(id),
  tipo           text NOT NULL CHECK (tipo IN ('inscripcion','reservacion','utileria','bilingue','mensualidad','sala_tareas','recargo','otro')),
  descripcion    text NOT NULL,
  periodo        date,                              -- 1ro del mes (mensuales y recargos)
  vence          date,
  moneda         text NOT NULL DEFAULT 'DOP' CHECK (moneda IN ('DOP','USD')),
  monto_bruto    numeric NOT NULL CHECK (monto_bruto >= 0),
  beca_pct       numeric NOT NULL DEFAULT 0,
  monto          numeric NOT NULL CHECK (monto >= 0),   -- lo que se cobra (en su moneda), ya con beca
  descuento      numeric NOT NULL DEFAULT 0 CHECK (descuento >= 0),   -- año completo (5%)
  pagado         numeric NOT NULL DEFAULT 0 CHECK (pagado >= 0),
  estado         text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','parcial','pagado','anulado')),
  es_tercero     boolean NOT NULL DEFAULT false,
  cargo_origen_id uuid REFERENCES public.edu_cargos(id),   -- el recargo apunta a su mensualidad
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS edu_cargos_estudiante ON public.edu_cargos (estudiante_id, anio_id);
CREATE INDEX IF NOT EXISTS edu_cargos_tenant_estado ON public.edu_cargos (tenant_id, estado);
-- Sin duplicados: un concepto anual por año, una mensual por mes, un recargo por mensualidad.
CREATE UNIQUE INDEX IF NOT EXISTS edu_cargos_uno_anual ON public.edu_cargos (estudiante_id, anio_id, tipo)
  WHERE periodo IS NULL AND tipo IN ('inscripcion','reservacion','utileria','bilingue') AND estado <> 'anulado';
CREATE UNIQUE INDEX IF NOT EXISTS edu_cargos_uno_mensual ON public.edu_cargos (estudiante_id, anio_id, tipo, periodo)
  WHERE periodo IS NOT NULL AND tipo IN ('mensualidad','sala_tareas') AND estado <> 'anulado';
CREATE UNIQUE INDEX IF NOT EXISTS edu_cargos_un_recargo ON public.edu_cargos (cargo_origen_id)
  WHERE tipo = 'recargo' AND estado <> 'anulado';

-- ── 2. Recibos del colegio ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.edu_pagos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  numero             integer NOT NULL,
  fecha              date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Santo_Domingo')::date,
  familia_id         uuid NOT NULL REFERENCES public.edu_familias(id),
  total              numeric NOT NULL CHECK (total > 0),      -- RD$
  formas_pago        jsonb NOT NULL,
  tasa_usd           numeric,
  anio_completo      boolean NOT NULL DEFAULT false,
  recibo_ingreso_id  uuid REFERENCES public.recibos_ingreso(id),
  anulado            boolean NOT NULL DEFAULT false,
  motivo_anulacion   text,
  anulado_por        uuid,
  anulado_at         timestamptz,
  usuario_id         uuid DEFAULT auth.uid(),
  notas              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, numero)
);
CREATE INDEX IF NOT EXISTS edu_pagos_tenant_fecha ON public.edu_pagos (tenant_id, fecha DESC);

CREATE TABLE IF NOT EXISTS public.edu_pago_lineas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  pago_id        uuid NOT NULL REFERENCES public.edu_pagos(id),
  cargo_id       uuid NOT NULL REFERENCES public.edu_cargos(id),
  estudiante_id  uuid NOT NULL REFERENCES public.edu_estudiantes(id),
  descripcion    text NOT NULL,
  moneda         text NOT NULL DEFAULT 'DOP',
  monto_moneda   numeric NOT NULL CHECK (monto_moneda > 0),   -- en la moneda del cargo
  monto          numeric NOT NULL CHECK (monto > 0),          -- RD$
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS edu_pago_lineas_pago ON public.edu_pago_lineas (pago_id);
CREATE INDEX IF NOT EXISTS edu_pago_lineas_cargo ON public.edu_pago_lineas (cargo_id);

-- Solo lectura desde la pantalla: todo se escribe por las funciones.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['edu_cargos','edu_pagos','edu_pago_lineas'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant())', t || '_tenant', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- ── 3. Preparar la cuenta del año de un estudiante ──────────────────────
-- p_desde: primer mes a cobrar (para el colegio que entra al sistema a mitad
-- de año: lo anterior ya está pagado en papel). p_anuales: crear o no la
-- inscripción/reservación, utilería y Sistema Bilingüe.
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
      VALUES (v_t, e.id, a.id, c.id, c.tipo, c.nombre, c.moneda, c.monto, c.monto, c.es_tercero)
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
    VALUES (v_t, e.id, a.id, c.id, 'mensualidad', 'Mensualidad ' || v_mes, v_per,
            v_per + (COALESCE(cfg.dia_limite_pago, 5) - 1),
            'DOP', e.tarifa_mensual, e.beca_pct, round(e.tarifa_mensual * (1 - e.beca_pct / 100.0), 2),
            CASE WHEN round(e.tarifa_mensual * (1 - e.beca_pct / 100.0), 2) <= 0 THEN 'pagado' ELSE 'pendiente' END)
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
        VALUES (v_t, e.id, a.id, c.id, 'sala_tareas', 'Sala de Tareas ' || v_mes, v_per,
                v_per + (COALESCE(cfg.dia_limite_pago, 5) - 1), 'DOP', c.monto, c.monto)
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

-- Un cargo suelto (uniforme cobrado aparte, excursión, otro concepto).
CREATE OR REPLACE FUNCTION public.edu_agregar_cargo(p_estudiante uuid, p_concepto uuid, p_monto numeric DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_t uuid := public.get_user_tenant(); c public.edu_conceptos%ROWTYPE; v_anio uuid; v_id uuid; v_m numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.edu_estudiantes WHERE id = p_estudiante AND tenant_id = v_t) THEN RAISE EXCEPTION 'Estudiante no encontrado'; END IF;
  SELECT * INTO c FROM public.edu_conceptos WHERE id = p_concepto AND tenant_id = v_t AND activo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Concepto no encontrado'; END IF;
  IF c.tipo IN ('mensualidad','recargo') THEN RAISE EXCEPTION 'Las mensualidades y recargos los pone el sistema'; END IF;
  SELECT id INTO v_anio FROM public.edu_anios WHERE tenant_id = v_t AND actual;
  IF v_anio IS NULL THEN RAISE EXCEPTION 'No hay año escolar actual'; END IF;
  v_m := COALESCE(p_monto, c.monto);
  IF v_m IS NULL OR v_m <= 0 THEN RAISE EXCEPTION 'Monto no válido'; END IF;
  INSERT INTO public.edu_cargos (tenant_id, estudiante_id, anio_id, concepto_id, tipo, descripcion, moneda, monto_bruto, monto, es_tercero)
  VALUES (v_t, p_estudiante, v_anio, c.id, c.tipo, c.nombre, c.moneda, v_m, v_m, c.es_tercero)
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Ese concepto ya está cargado este año';
END;
$function$;
REVOKE ALL ON FUNCTION public.edu_agregar_cargo(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_agregar_cargo(uuid, uuid, numeric) TO authenticated;

-- ── 4. Recargos ─────────────────────────────────────────────────────────
-- Cada mensualidad no pagada completa el día 1 del mes siguiente lleva su
-- recargo (uno solo). Se puede llamar cuantas veces se quiera.
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
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION private.edu_aplicar_recargos(uuid) FROM PUBLIC, anon, authenticated;

-- La pantalla lo llama al abrir una familia; el cobro también, antes de validar:
-- así el recargo no depende de quién abrió la caja primero.
CREATE OR REPLACE FUNCTION public.edu_aplicar_recargos()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$ SELECT private.edu_aplicar_recargos(public.get_user_tenant()); $function$;
REVOKE ALL ON FUNCTION public.edu_aplicar_recargos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edu_aplicar_recargos() TO authenticated;

DROP FUNCTION IF EXISTS public.edu_cobrar(uuid, jsonb, jsonb, numeric, boolean, text);

-- ── 5. Cobrar ───────────────────────────────────────────────────────────
-- p_lineas: [{ "cargo_id": uuid, "monto": número en la moneda del cargo }]
-- p_formas: [{ "forma": "Efectivo"|"Transferencia"|..., "monto": RD$, "referencia", "cuenta_id", "banco", "alias" }]
-- p_tasa:   RD$ por US$ (obligatoria si hay cargos en dólares)
-- p_anio_completo: estudiantes que pagan el AÑO COMPLETO (sus mensualidades llevan el
--   descuento y tienen que ir todas); los hermanos en el mismo cobro, normal.
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
BEGIN
  IF v_t IS NULL THEN RAISE EXCEPTION 'Sin empresa activa'; END IF;
  SELECT * INTO f FROM public.edu_familias WHERE id = p_familia AND tenant_id = v_t FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Familia no encontrada'; END IF;
  SELECT * INTO cfg FROM public.edu_config WHERE tenant_id = v_t;
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

    -- Año completo: las mensualidades llevan el descuento y se saldan enteras.
    v_desc := 0;
    IF g.tipo = 'mensualidad' AND g.estudiante_id = ANY(COALESCE(p_anio_completo, '{}')) THEN
      IF g.pagado > 0 THEN RAISE EXCEPTION 'El año completo es con las mensualidades sin abonar (% tiene abono)', g.descripcion; END IF;
      v_desc := round(g.monto * v_desc_pct / 100.0, 2);
      IF abs(v_m - (g.monto - v_desc)) > 0.01 THEN RAISE EXCEPTION 'El año completo de % es %', g.descripcion, g.monto - v_desc; END IF;
      v_mens_lineas := v_mens_lineas + 1;
    END IF;

    v_pend := g.monto - g.descuento - v_desc - g.pagado;
    IF v_m > v_pend + 0.01 THEN RAISE EXCEPTION '% pendiente es %, no %', g.descripcion, v_pend, v_m; END IF;
    -- Mensualidad: el mes completo o la mitad (regla del colegio), nada de abonos sueltos.
    IF g.tipo = 'mensualidad' AND NOT (g.estudiante_id = ANY(COALESCE(p_anio_completo, '{}'))) AND abs(v_m - v_pend) > 0.01 THEN
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

  -- El año completo tiene que incluir todas las mensualidades pendientes del estudiante.
  IF COALESCE(cardinality(p_anio_completo), 0) > 0 THEN
    IF v_mens_lineas = 0 THEN RAISE EXCEPTION 'El año completo necesita las mensualidades'; END IF;
    SELECT count(*) INTO v_mens_anio
      FROM public.edu_cargos c
     WHERE c.tenant_id = v_t AND c.tipo = 'mensualidad' AND c.estado IN ('pendiente','parcial')
       AND c.estudiante_id = ANY(p_anio_completo);
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

-- ── 6. Anular un cobro (solo dueño/admin) ───────────────────────────────
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

SELECT public.registrar_migracion('centros_educativos_caja.sql');
