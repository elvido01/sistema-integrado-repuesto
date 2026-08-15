-- =====================================================================
-- QUE LA REVISIÓN AGUANTE: TOPE, CRITERIOS Y RELOJ
-- ---------------------------------------------------------------------
-- (2026-08-15) La configuración que quiere el dueño es correcta: Hermes
-- recibe el trabajo del Comercial, lo evalúa contra lo que se pidió, y
-- solo se lo entrega si cumple; si no, lo manda a corregir.
--
-- Nada de este archivo cambia esa regla. Lo que hace es taparle tres
-- agujeros que se vieron el 14/08, cuando tres borradores se quedaron
-- veinticinco horas en el buzón de Hermes sin que nadie se enterara.
--
--   1. TOPE      "hasta que cumpla" no tiene salida. Si el Comercial no
--                acierta nunca, el ciclo no termina nunca: cada vuelta
--                cuesta dinero y el dueño no ve nada porque el trabajo
--                "sigue en curso". Con tope, al agotarse se entrega
--                igual pero MARCADO, con lo que faltó.
--
--   2. CRITERIOS "que cumpla exactamente lo que pedí" no estaba escrito
--                en ninguna parte, así que cada evaluación era lo que al
--                modelo le pareciera ese día: un día pasa un borrador y
--                al siguiente rechaza uno igual. Escritos y en la base,
--                la vara es la misma siempre y se cambia sin tocar código.
--
--   3. RELOJ     un trabajo esperando 25 horas se veía EXACTAMENTE igual
--                que uno esperando 25 segundos. Un revisor que no aparece
--                tiene que verse, no disimularse.
--
-- >>> LO QUE ESTE ARCHIVO NO HACE <<<
-- No salta a Hermes ni entrega nada sin revisar — eso destruiría el
-- filtro, que es justo lo que se quería tener. No toca el gateway de
-- Hermes ni su configuración: eso es suyo. Aquí solo se pone la regla
-- donde se pueda comprobar.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. EL TOPE DE RONDAS
-- ------------------------------------------------------------
ALTER TABLE public.equipo_trabajos
  ADD COLUMN IF NOT EXISTS rondas integer NOT NULL DEFAULT 0,
  -- Tres es un número, no una ley: se cambia por trabajo o por defecto.
  -- Lo que importa es que EXISTA un número, porque "sin tope" no es una
  -- política, es un descuido con factura.
  ADD COLUMN IF NOT EXISTS max_rondas integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS entregado_sin_cumplir boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ultimo_veredicto jsonb;

ALTER TABLE public.equipo_trabajos
  DROP CONSTRAINT IF EXISTS equipo_trabajos_max_rondas_check;
ALTER TABLE public.equipo_trabajos
  ADD CONSTRAINT equipo_trabajos_max_rondas_check CHECK (max_rondas BETWEEN 1 AND 10);

-- ------------------------------------------------------------
-- 2. LOS CRITERIOS, ESCRITOS
-- ------------------------------------------------------------
-- Cada criterio es COMPROBABLE a propósito: "¿los precios coinciden con
-- los que dio Jarvis?" se puede responder sí o no. "¿está bueno?" no.
-- Un criterio que no se puede comprobar no filtra nada: solo le da al
-- modelo permiso para opinar.
CREATE TABLE IF NOT EXISTS public.equipo_criterios (
  id          bigserial PRIMARY KEY,
  tenant_id   uuid NOT NULL,
  -- '*' vale para cualquier tipo de trabajo; si no, 'promocion',
  -- 'consulta', 'seguimiento' o 'compleja'.
  tipo        text NOT NULL DEFAULT '*',
  clave       text NOT NULL,
  texto       text NOT NULL,
  -- Un criterio bloqueante impide entregar; uno no bloqueante se anota
  -- como advertencia y sigue. No todo lo que se mira tiene que frenar.
  bloqueante  boolean NOT NULL DEFAULT true,
  orden       integer NOT NULL DEFAULT 100,
  activo      boolean NOT NULL DEFAULT true,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tipo, clave)
);

ALTER TABLE public.equipo_criterios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS equipo_criterios_lee ON public.equipo_criterios;
CREATE POLICY equipo_criterios_lee ON public.equipo_criterios
  FOR SELECT USING (tenant_id = public.get_user_tenant());

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.equipo_criterios FROM anon, authenticated;
GRANT SELECT ON public.equipo_criterios TO authenticated;

-- Los criterios de arranque salen de las políticas que YA tenía el
-- Comercial, para que la vara con la que se le mide sea la misma con la
-- que trabaja. Medir con una regla distinta a la que se le dio sería
-- injusto y además inútil.
INSERT INTO public.equipo_criterios (tenant_id, tipo, clave, texto, bloqueante, orden)
VALUES
  ('00000000-0000-0000-0000-000000000001', '*', 'responde_lo_pedido',
   'Responde exactamente lo que se pidió: ni menos alcance, ni de más.', true, 10),
  ('00000000-0000-0000-0000-000000000001', '*', 'no_publica',
   'No publicó ni envió nada. Lo que entrega es un borrador para revisión.', true, 20),
  ('00000000-0000-0000-0000-000000000001', '*', 'datos_verificados',
   'Cada precio y cada existencia citados coinciden con los datos que entregó Jarvis. Ninguno inventado.', true, 30),
  ('00000000-0000-0000-0000-000000000001', '*', 'productos_activos',
   'Todos los productos citados están activos en el catálogo.', true, 40),
  ('00000000-0000-0000-0000-000000000001', 'promocion', 'max_productos',
   'No propone más productos de los que permite la política de promoción diaria.', true, 50),
  ('00000000-0000-0000-0000-000000000001', 'promocion', 'rango_de_precio',
   'Respeta los montos mínimos de la política: un producto por encima del mayor y otro por encima del menor.', true, 60),
  ('00000000-0000-0000-0000-000000000001', 'promocion', 'sin_codigo_interno',
   'No publica el código interno del producto.', true, 70),
  ('00000000-0000-0000-0000-000000000001', 'promocion', 'foto_real',
   'Cada producto propuesto tiene foto real. Si falta alguna, lo dice como advertencia en vez de callarlo.', false, 80),
  ('00000000-0000-0000-0000-000000000001', 'promocion', 'zona_segura',
   'En formato 9:16 no queda texto cortado en los bordes.', false, 90)
ON CONFLICT (tenant_id, tipo, clave) DO NOTHING;

-- Lo que lee el revisor. Se pide por tipo de trabajo y devuelve también
-- los generales, porque un criterio de '*' aplica siempre.
CREATE OR REPLACE FUNCTION hermes.equipo_criterios(p_tipo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'clave', c.clave, 'texto', c.texto, 'bloqueante', c.bloqueante)
         ORDER BY c.orden, c.clave), '[]'::jsonb)
  FROM public.equipo_criterios c
  WHERE c.tenant_id = '00000000-0000-0000-0000-000000000001'
    AND c.activo
    AND (c.tipo = '*' OR c.tipo = COALESCE(NULLIF(btrim(p_tipo), ''), '*'))
$$;

REVOKE ALL ON FUNCTION hermes.equipo_criterios(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.equipo_criterios(text) TO hermes_readonly;

-- Y los mismos criterios para la pantalla, para que el dueño vea con qué
-- vara se le mide a su equipo sin tener que abrir la base.
CREATE OR REPLACE FUNCTION public.equipo_criterios_ver(p_tipo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'tipo', c.tipo, 'clave', c.clave, 'texto', c.texto,
           'bloqueante', c.bloqueante) ORDER BY c.tipo, c.orden), '[]'::jsonb)
  FROM public.equipo_criterios c
  WHERE c.tenant_id = public.get_user_tenant()
    AND c.activo
    AND (p_tipo IS NULL OR c.tipo = '*' OR c.tipo = p_tipo)
$$;

REVOKE ALL ON FUNCTION public.equipo_criterios_ver(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_criterios_ver(text) TO authenticated;

-- ------------------------------------------------------------
-- 3. REGISTRAR UNA REVISIÓN (y hacer valer el tope)
-- ------------------------------------------------------------
-- El revisor llama aquí con su veredicto. La función NO evalúa: cuenta,
-- guarda y decide si queda otra ronda. Evaluar es del que revisa; hacer
-- cumplir el tope es de la base, porque un tope que el propio revisor
-- puede ignorar no es un tope.
CREATE OR REPLACE FUNCTION hermes.equipo_revisar(
  p_trabajo_id uuid,
  p_veredicto  text,               -- 'cumple' | 'corregir'
  p_motivo     text DEFAULT NULL,
  p_faltantes  jsonb DEFAULT NULL) -- claves de criterio que fallaron
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-000000000001';
  v_t      public.equipo_trabajos%ROWTYPE;
  v_ronda  integer;
BEGIN
  IF p_veredicto NOT IN ('cumple', 'corregir') THEN
    RAISE EXCEPTION 'Veredicto no válido: % (usa cumple o corregir)', p_veredicto;
  END IF;

  SELECT * INTO v_t FROM public.equipo_trabajos
  WHERE id = p_trabajo_id AND tenant_id = v_tenant
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese trabajo no existe: %', p_trabajo_id;
  END IF;

  UPDATE public.equipo_trabajos
  SET ultimo_veredicto = jsonb_build_object(
        'veredicto', p_veredicto, 'motivo', p_motivo,
        'faltantes', COALESCE(p_faltantes, '[]'::jsonb), 'cuando', now())
  WHERE id = p_trabajo_id;

  IF p_veredicto = 'cumple' THEN
    RETURN json_build_object('ok', true, 'siguiente', 'aprobacion',
                             'rondas', v_t.rondas);
  END IF;

  -- Pidió corrección: se cuenta la ronda.
  v_ronda := v_t.rondas + 1;
  UPDATE public.equipo_trabajos SET rondas = v_ronda WHERE id = p_trabajo_id;

  IF v_ronda >= v_t.max_rondas THEN
    -- Se acabaron los intentos. NO se descarta el trabajo: se entrega
    -- marcado. Tirar lo hecho después de tres vueltas pagadas sería el
    -- peor de los dos finales posibles.
    UPDATE public.equipo_trabajos
    SET entregado_sin_cumplir = true
    WHERE id = p_trabajo_id;

    RETURN json_build_object(
      'ok', true, 'siguiente', 'entregar_marcado', 'agotado', true,
      'rondas', v_ronda, 'max_rondas', v_t.max_rondas,
      'aviso', format('No cumplió en %s intentos. Entrégalo igual, marcado, '
                      'diciendo qué faltó.', v_t.max_rondas));
  END IF;

  RETURN json_build_object('ok', true, 'siguiente', 'corregir',
                           'ronda', v_ronda, 'max_rondas', v_t.max_rondas,
                           'quedan', v_t.max_rondas - v_ronda);
END $$;

REVOKE ALL ON FUNCTION hermes.equipo_revisar(uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hermes.equipo_revisar(uuid, text, text, jsonb) TO hermes_readonly;

-- ------------------------------------------------------------
-- 4. EL RELOJ
-- ------------------------------------------------------------
-- Un trabajo abierto en el que no se ha movido nada desde hace rato está
-- atascado, no "en curso". La diferencia entre las dos cosas es lo único
-- que hacía falta el 14/08 para no descubrirlo un día después.
--
-- "Moverse" es que haya un mensaje nuevo en el trabajo. Si el último
-- mensaje es de hace 25 horas, nadie está trabajando en él por mucho que
-- el estado diga lo contrario.
CREATE OR REPLACE FUNCTION public.equipo_atascos(p_minutos integer DEFAULT 30)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_out json;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RETURN '[]'::json;
  END IF;

  SELECT COALESCE(json_agg(x ORDER BY x.parado_desde), '[]'::json) INTO v_out FROM (
    SELECT t.id,
           t.titulo,
           t.estado,
           t.rondas,
           t.max_rondas,
           t.entregado_sin_cumplir,
           m.ultimo AS parado_desde,
           EXTRACT(epoch FROM (now() - m.ultimo))::int / 60 AS minutos,
           -- Quién lo tiene: el agente del mensaje más viejo sin atender.
           (SELECT p.to_agent FROM public.equipo_mensajes p
             WHERE p.trabajo_id = t.id
               AND p.status IN ('pending', 'claimed', 'processing')
             ORDER BY p.created_at LIMIT 1) AS lo_tiene
    FROM public.equipo_trabajos t
    JOIN LATERAL (
      SELECT max(mm.created_at) AS ultimo
      FROM public.equipo_mensajes mm WHERE mm.trabajo_id = t.id
    ) m ON true
    WHERE t.tenant_id = v_tenant
      AND t.estado NOT IN ('completed', 'cancelled', 'expired')
      AND m.ultimo IS NOT NULL
      AND m.ultimo < now() - make_interval(mins => GREATEST(1, p_minutos))
  ) x;

  RETURN v_out;
END $$;

REVOKE ALL ON FUNCTION public.equipo_atascos(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_atascos(integer) TO authenticated;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('equipo_ia_revision.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verificación:
SELECT jsonb_pretty(jsonb_build_object(
  'criterios_promocion', hermes.equipo_criterios('promocion'),
  'atascados_ahora', public.equipo_atascos(30)
));
