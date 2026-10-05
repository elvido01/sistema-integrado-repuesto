-- =====================================================================
-- PUBLICACIÓN AUTOMÁTICA CON HERMES — 3 PIEZAS AL DÍA, UNA POR RANGO
-- =====================================================================
-- (05/10/2026) Reglas del dueño:
--   · Candidata con 1 en existencia (sql/candidatas_con_1_en_existencia.sql).
--   · Piezas de menos de RD$100 NO entran en automático.
--   · El 5% de descuento solo se activa A MANO: lo automático va sin descuento.
--   · Cada día 3 piezas: una de RD$100–500, una de 501–1,000 y una de más de 1,000.
--   · 30 días "Hermes prepara y el dueño aprueba" (para retroalimentar a
--     Hermes); después, un interruptor de 100% automático.
--
-- Cómo corre: el worker del Comercial-Creativo (PC) llama cada 5 minutos a
-- hermes.equipo_auto_del_dia_todos(). Para cada empresa encendida, pasada la
-- hora elegida y si hoy no se hizo, toma de _equipo_candidatos_de (que ya
-- ordena por lo que se vende, anuncio del suplidor, foto nueva...) la primera
-- de cada rango y la encarga igual que el Paso 1 — origin 'panel', así cae en
-- el Paso 2 para aprobarla. Una pieza encargada no vuelve en 14 días (eso ya
-- lo filtra _equipo_candidatos_de).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.equipo_auto_publicacion (
  tenant_id     uuid PRIMARY KEY,
  activo        boolean NOT NULL DEFAULT false,
  modo          text NOT NULL DEFAULT 'aprobar' CHECK (modo IN ('aprobar', 'automatico')),
  hora_local    time NOT NULL DEFAULT '07:30',
  precio_minimo numeric(12,2) NOT NULL DEFAULT 100,
  formato       text NOT NULL DEFAULT 'historia' CHECK (formato IN ('historia', 'feed')),
  rangos        jsonb NOT NULL DEFAULT '[{"desde":100,"hasta":500,"nombre":"RD$100–500"},{"desde":500.01,"hasta":1000,"nombre":"RD$501–1,000"},{"desde":1000.01,"hasta":null,"nombre":"Más de RD$1,000"}]',
  activado_at   timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid
);
ALTER TABLE public.equipo_auto_publicacion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS equipo_auto_pub_ver ON public.equipo_auto_publicacion;
CREATE POLICY equipo_auto_pub_ver ON public.equipo_auto_publicacion
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
GRANT SELECT ON public.equipo_auto_publicacion TO authenticated;

CREATE TABLE IF NOT EXISTS public.equipo_auto_elegidas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  fecha       date NOT NULL,
  rango       text NOT NULL,
  producto_id uuid,
  trabajo_id  uuid,
  nota        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, fecha, rango)
);
ALTER TABLE public.equipo_auto_elegidas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS equipo_auto_eleg_ver ON public.equipo_auto_elegidas;
CREATE POLICY equipo_auto_eleg_ver ON public.equipo_auto_elegidas
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
GRANT SELECT ON public.equipo_auto_elegidas TO authenticated;

-- ── El dueño enciende / cambia la configuración ──
CREATE OR REPLACE FUNCTION public.equipo_auto_configurar(
  p_activo boolean, p_modo text DEFAULT NULL, p_hora time DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_row public.equipo_auto_publicacion;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN RAISE EXCEPTION 'Este módulo es del dueño.'; END IF;
  IF p_modo IS NOT NULL AND p_modo NOT IN ('aprobar', 'automatico') THEN
    RAISE EXCEPTION 'Modo no admitido: %', p_modo;
  END IF;

  INSERT INTO public.equipo_auto_publicacion (tenant_id, activo, modo, hora_local, activado_at, updated_by)
  VALUES (v_tenant, COALESCE(p_activo, false), COALESCE(p_modo, 'aprobar'), COALESCE(p_hora, '07:30'),
          CASE WHEN p_activo THEN now() END, auth.uid())
  ON CONFLICT (tenant_id) DO UPDATE
     SET activo = COALESCE(p_activo, equipo_auto_publicacion.activo),
         modo = COALESCE(p_modo, equipo_auto_publicacion.modo),
         hora_local = COALESCE(p_hora, equipo_auto_publicacion.hora_local),
         -- El reloj de los 30 días arranca la primera vez que se enciende.
         activado_at = COALESCE(equipo_auto_publicacion.activado_at, CASE WHEN p_activo THEN now() END),
         updated_at = now(), updated_by = auth.uid()
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END $function$;
REVOKE ALL ON FUNCTION public.equipo_auto_configurar(boolean, text, time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_auto_configurar(boolean, text, time) TO authenticated;

-- ── Encargar al Creativo (misma petición que el Paso 1, sin descuento) ──
CREATE OR REPLACE FUNCTION public._equipo_auto_encargar(p_tenant uuid, p_producto_id uuid, p_rango text, p_formato text)
 RETURNS uuid
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_pet text;
  v_abierto json;
  v_trabajo uuid;
BEGIN
  SELECT p.codigo, p.descripcion, p.precio INTO r
    FROM public.productos p WHERE p.id = p_producto_id AND p.tenant_id = p_tenant;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_pet := 'Prepara la promoción de:' || E'\n'
    || format(E'· %s (código %s). Precio de catálogo: RD$ %s.\n', r.descripcion, r.codigo, to_char(r.precio, 'FM999G999G990D00'))
    || format(E'\nFormato principal: %s.', p_formato)
    || E'\nDescuento: NO. Esta promoción NO ofrece descuento: no menciones descuento, rebaja ni código.'
    || format(E'\nElegida por Hermes (publicación diaria, rango %s).', p_rango)
    || E'\n\nEntrega un BORRADOR para aprobación: no publiques nada.';

  v_abierto := hermes.equipo_abrir_trabajo(
    p_tenant   => p_tenant,
    p_titulo   => 'Promoción ' || left(r.descripcion, 120),
    p_peticion => v_pet,
    p_tipo     => 'promocion',
    p_origin_platform => 'panel',
    p_solicitado_por => NULL,
    p_idempotency_key => 'promo-auto:' || p_tenant::text || ':' || r.codigo || ':'
                         || (now() AT TIME ZONE 'America/Santo_Domingo')::date::text);
  v_trabajo := (v_abierto ->> 'trabajo_id')::uuid;
  PERFORM hermes.equipo_encargar_a(v_trabajo, 'comercial_creativo', 1, hermes.equipo_brief_arte(p_tenant, v_pet));
  RETURN v_trabajo;
END $function$;
REVOKE ALL ON FUNCTION public._equipo_auto_encargar(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;

-- ── Las 3 del día de una empresa ──
CREATE OR REPLACE FUNCTION public._equipo_auto_del_dia(p_tenant uuid, p_forzar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cfg public.equipo_auto_publicacion;
  v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
  v_ahora time := (now() AT TIME ZONE 'America/Santo_Domingo')::time;
  v_cands jsonb;
  rg jsonb;
  v_pick jsonb;
  v_trabajo uuid;
  v_hechas jsonb := '[]'::jsonb;
  v_usados uuid[] := '{}';
BEGIN
  SELECT * INTO cfg FROM public.equipo_auto_publicacion WHERE tenant_id = p_tenant;
  IF NOT FOUND OR (NOT cfg.activo AND NOT p_forzar) THEN
    RETURN jsonb_build_object('ok', true, 'hecho', false, 'motivo', 'apagado');
  END IF;
  IF NOT p_forzar AND v_ahora < cfg.hora_local THEN
    RETURN jsonb_build_object('ok', true, 'hecho', false, 'motivo', 'todavía no es la hora');
  END IF;

  v_cands := public._equipo_candidatos_de(p_tenant, 1000);

  FOR rg IN SELECT * FROM jsonb_array_elements(cfg.rangos) LOOP
    -- Ya hecha hoy para este rango: no se repite.
    IF EXISTS (SELECT 1 FROM public.equipo_auto_elegidas
                WHERE tenant_id = p_tenant AND fecha = v_hoy AND rango = rg->>'nombre') THEN
      CONTINUE;
    END IF;

    -- La primera del rango en el orden del Paso 1 (lo que se vende, anuncio
    -- del suplidor, foto nueva...). Nunca por debajo del precio mínimo.
    SELECT c INTO v_pick
      FROM jsonb_array_elements(v_cands) WITH ORDINALITY AS t(c, ord)
     WHERE (c->>'precio')::numeric >= GREATEST(cfg.precio_minimo, (rg->>'desde')::numeric)
       AND (rg->>'hasta' IS NULL OR (c->>'precio')::numeric <= (rg->>'hasta')::numeric)
       AND NOT ((c->>'id')::uuid = ANY(v_usados))
     ORDER BY ord
     LIMIT 1;

    IF v_pick IS NULL THEN
      INSERT INTO public.equipo_auto_elegidas (tenant_id, fecha, rango, nota)
      VALUES (p_tenant, v_hoy, rg->>'nombre', 'sin candidata en este rango (faltan fotos o ya salieron en 14 días)')
      ON CONFLICT DO NOTHING;
      v_hechas := v_hechas || jsonb_build_object('rango', rg->>'nombre', 'pieza', NULL);
      CONTINUE;
    END IF;

    v_trabajo := public._equipo_auto_encargar(p_tenant, (v_pick->>'id')::uuid, rg->>'nombre', cfg.formato);
    v_usados := v_usados || (v_pick->>'id')::uuid;
    INSERT INTO public.equipo_auto_elegidas (tenant_id, fecha, rango, producto_id, trabajo_id, nota)
    VALUES (p_tenant, v_hoy, rg->>'nombre', (v_pick->>'id')::uuid, v_trabajo, v_pick->>'razon')
    ON CONFLICT DO NOTHING;
    v_hechas := v_hechas || jsonb_build_object('rango', rg->>'nombre', 'pieza', v_pick->>'descripcion', 'trabajo_id', v_trabajo);
    v_pick := NULL;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'hecho', true, 'fecha', v_hoy, 'elegidas', v_hechas);
END $function$;
REVOKE ALL ON FUNCTION public._equipo_auto_del_dia(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- ── Lo que llama el worker (todas las empresas encendidas) ──
CREATE OR REPLACE FUNCTION hermes.equipo_auto_del_dia_todos()
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t uuid;
  v_res jsonb := '[]'::jsonb;
  v_hoy date := (now() AT TIME ZONE 'America/Santo_Domingo')::date;
BEGIN
  FOR t IN
    SELECT a.tenant_id FROM public.equipo_auto_publicacion a
     WHERE a.activo
       AND (now() AT TIME ZONE 'America/Santo_Domingo')::time >= a.hora_local
       AND (SELECT count(*) FROM public.equipo_auto_elegidas e
             WHERE e.tenant_id = a.tenant_id AND e.fecha = v_hoy) < jsonb_array_length(a.rangos)
  LOOP
    v_res := v_res || jsonb_build_object('tenant', t, 'r', public._equipo_auto_del_dia(t, false));
  END LOOP;
  RETURN v_res;
END $function$;
REVOKE ALL ON FUNCTION hermes.equipo_auto_del_dia_todos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.equipo_auto_del_dia_todos() TO hermes_readonly;

-- ── El dueño puede pedir las de hoy ya (botón "Elegir las de hoy ahora") ──
CREATE OR REPLACE FUNCTION public.equipo_auto_elegir_ahora()
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.equipo_ia_permitido() THEN RAISE EXCEPTION 'Este módulo es del dueño.'; END IF;
  INSERT INTO public.equipo_auto_publicacion (tenant_id) VALUES (public.get_user_tenant()) ON CONFLICT DO NOTHING;
  RETURN public._equipo_auto_del_dia(public.get_user_tenant(), true);
END $function$;
REVOKE ALL ON FUNCTION public.equipo_auto_elegir_ahora() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_auto_elegir_ahora() TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('publicacion_automatica_hermes.sql');
