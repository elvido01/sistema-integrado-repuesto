-- =====================================================================
-- VENTANAS Y ALUMINIO · PARTE 2: desglose (09/11/2026)
-- ---------------------------------------------------------------------
-- Cada sistema tiene sus PIEZAS. Medida de corte de cada pieza:
--     (base ÷ (hojas si "por hoja", si no 1)) − descuento
--   base = ancho o alto de la ventana; descuento en pulgadas (negativo suma).
-- Cantidad de cada pieza = cant_fija + cant_por_hoja × hojas
--   (ej. enganches: −2 + 2×hojas → 2 en 2 hojas, 4 en 3, 6 en 4).
-- Los valores de fábrica son PROVISIONALES (09/11/2026): el dueño pidió
-- seguir con números razonables hasta que D Mario dé los suyos; se cambian
-- en Ventanas → Configuración del desglose (y "Restablecer" vuelve a estos).
--
-- · vent_piezas: piezas por sistema (perfil, cristal o accesorio).
-- · vent_config: largo de la barra (20 pies = 240", D Mario) y lo que se
--   pierde en cada corte (disco).
-- · vent_medidas.cortes_hechos: piezas ya cortadas (para marcar en el taller).
-- · vent_restablecer_piezas(sistema): vuelve a los valores de fábrica.
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.vent_piezas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  sistema_id    uuid NOT NULL REFERENCES public.vent_sistemas(id) ON DELETE CASCADE,
  codigo        text NOT NULL,
  nombre        text NOT NULL,
  tipo          text NOT NULL DEFAULT 'perfil' CHECK (tipo IN ('perfil', 'cristal', 'accesorio')),
  base          text NOT NULL DEFAULT 'ancho' CHECK (base IN ('ancho', 'alto')),
  por_hoja      boolean NOT NULL DEFAULT false,      -- la base se divide entre las hojas
  descuento     numeric(8,4) NOT NULL DEFAULT 0,     -- pulgadas que se restan (negativo suma)
  cant_fija     integer NOT NULL DEFAULT 1,
  cant_por_hoja integer NOT NULL DEFAULT 0,
  perfil        text,                                -- perfil para las barras (vacío = el nombre)
  orden         integer NOT NULL DEFAULT 0,
  activo        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sistema_id, codigo)
);
ALTER TABLE public.vent_piezas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vent_piezas_tenant ON public.vent_piezas;
CREATE POLICY vent_piezas_tenant ON public.vent_piezas FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant()) WITH CHECK (tenant_id = public.get_user_tenant());

CREATE TABLE IF NOT EXISTS public.vent_config (
  tenant_id        uuid PRIMARY KEY DEFAULT public.get_user_tenant() REFERENCES public.tenants(id) ON DELETE CASCADE,
  largo_barra      numeric(8,3) NOT NULL DEFAULT 240,    -- pulgadas (20 pies)
  merma_corte      numeric(6,4) NOT NULL DEFAULT 0.125,  -- pulgadas por corte (disco)
  unidad           text NOT NULL DEFAULT 'pulgadas' CHECK (unidad IN ('pulgadas', 'cm')),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vent_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vent_config_tenant ON public.vent_config;
CREATE POLICY vent_config_tenant ON public.vent_config FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant()) WITH CHECK (tenant_id = public.get_user_tenant());

ALTER TABLE public.vent_medidas ADD COLUMN IF NOT EXISTS cortes_hechos uuid[] NOT NULL DEFAULT '{}';

-- ── Valores de fábrica (PROVISIONALES) ─────────────────────────────────
-- Corrediza (Tradicional, P-65, P-92, AA, C-70, M-100, Ventana P-40): marco
-- (cabezal, riel, laterales) + hojas (cabezal y zócalo de hoja, llavines,
-- enganches) + cristal. Abisagrada y puertas: marco + hoja + cristal.
CREATE OR REPLACE FUNCTION private.vent_piezas_fabrica(p_sistema uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE s public.vent_sistemas%ROWTYPE; v_tipo text;
BEGIN
  SELECT * INTO s FROM public.vent_sistemas WHERE id = p_sistema;
  IF NOT FOUND THEN RETURN; END IF;
  v_tipo := CASE WHEN s.tipo = 'puerta' OR s.codigo = 'ABISAGRADA' THEN 'batiente' ELSE 'corrediza' END;

  INSERT INTO public.vent_piezas (tenant_id, sistema_id, codigo, nombre, tipo, base, por_hoja, descuento, cant_fija, cant_por_hoja, orden)
  SELECT s.tenant_id, s.id, x.codigo, x.nombre, x.tipo, x.base, x.por_hoja, x.descuento, x.cant_fija, x.cant_por_hoja, x.orden
    FROM (VALUES
      -- codigo, nombre, tipo, base, por_hoja, descuento, cant_fija, cant_por_hoja, orden, para
      ('CABEZAL',      'Cabezal',               'perfil',  'ancho', false, 0.5,    1, 0, 1,  'corrediza'),
      ('RIEL',         'Riel (sillar)',         'perfil',  'ancho', false, 0.5,    1, 0, 2,  'corrediza'),
      ('LATERAL',      'Laterales',             'perfil',  'alto',  false, 0.5,    2, 0, 3,  'corrediza'),
      ('CAB_HOJA',     'Cabezal de hoja',       'perfil',  'ancho', true,  -0.5,   0, 1, 4,  'corrediza'),
      ('ZOCALO',       'Alféizar (zócalo)',     'perfil',  'ancho', true,  -0.5,   0, 1, 5,  'corrediza'),
      ('LLAVIN',       'Llavín',                'perfil',  'alto',  false, 0.875,  2, 0, 6,  'corrediza'),
      ('ENGANCHE',     'Enganche',              'perfil',  'alto',  false, 0.875, -2, 2, 7,  'corrediza'),
      ('CRISTAL_AN',   'Cristal (ancho)',       'cristal', 'ancho', true,  2.25,   0, 1, 8,  'corrediza'),
      ('CRISTAL_AL',   'Cristal (alto)',        'cristal', 'alto',  false, 3.5,    0, 1, 9,  'corrediza'),
      ('MARCO_SUP',    'Marco superior',        'perfil',  'ancho', false, 0,      1, 0, 1,  'batiente'),
      ('MARCO_INF',    'Marco inferior',        'perfil',  'ancho', false, 0,      1, 0, 2,  'batiente'),
      ('MARCO_LAT',    'Marco lateral',         'perfil',  'alto',  false, 0,      2, 0, 3,  'batiente'),
      ('HOJA_HOR',     'Hoja horizontal',       'perfil',  'ancho', true,  1,      0, 2, 4,  'batiente'),
      ('HOJA_VER',     'Hoja vertical',         'perfil',  'alto',  false, 1,      0, 2, 5,  'batiente'),
      ('CRISTAL_AN',   'Cristal (ancho)',       'cristal', 'ancho', true,  3.5,    0, 1, 6,  'batiente'),
      ('CRISTAL_AL',   'Cristal (alto)',        'cristal', 'alto',  false, 3.5,    0, 1, 7,  'batiente')
    ) AS x(codigo, nombre, tipo, base, por_hoja, descuento, cant_fija, cant_por_hoja, orden, para)
   WHERE x.para = v_tipo
  ON CONFLICT (sistema_id, codigo) DO NOTHING;
END;
$function$;
REVOKE ALL ON FUNCTION private.vent_piezas_fabrica(uuid) FROM PUBLIC, anon, authenticated;

-- Restablecer (botón de la pantalla): borra las piezas del sistema y pone las de fábrica.
CREATE OR REPLACE FUNCTION public.vent_restablecer_piezas(p_sistema uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE v_t uuid := public.get_user_tenant();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.vent_sistemas WHERE id = p_sistema AND tenant_id = v_t) THEN
    RAISE EXCEPTION 'El sistema no es de esta empresa';
  END IF;
  DELETE FROM public.vent_piezas WHERE sistema_id = p_sistema AND tenant_id = v_t;
  PERFORM private.vent_piezas_fabrica(p_sistema);
END;
$function$;
REVOKE ALL ON FUNCTION public.vent_restablecer_piezas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vent_restablecer_piezas(uuid) TO authenticated;

-- Las empresas de aluminio: config + piezas de fábrica en sus sistemas (y
-- desde ahora vent_preparar lo hace solo para las nuevas).
CREATE OR REPLACE FUNCTION private.vent_preparar(p_tenant uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE r record;
BEGIN
  INSERT INTO public.vent_sistemas (tenant_id, codigo, nombre, tipo, hojas, orden)
  SELECT p_tenant, x.codigo, x.nombre, x.tipo, x.hojas::integer[], x.orden
    FROM (VALUES
      ('TRADICIONAL', 'Ventana Tradicional', 'ventana', '{2,3,4}', 1),
      ('P-65',        'Ventana P-65',        'ventana', '{2,3,4}', 2),
      ('P-92',        'Ventana P-92',        'ventana', '{2,3,4}', 3),
      ('AA',          'Ventana AA',          'ventana', '{2,3,4}', 4),
      ('C-70',        'Ventana C-70',        'ventana', '{2,3,4}', 5),
      ('M-100-CT',    'Ventana M-100 con tapa', 'ventana', '{2,3,4}', 6),
      ('M-100-ST',    'Ventana M-100 sin tapa', 'ventana', '{2,3,4}', 7),
      ('ABISAGRADA',  'Ventana Abisagrada',  'ventana', '{1,2}',   8),
      ('V-P-40',      'Ventana P-40',        'ventana', '{2,3,4}', 9),
      ('PUERTA-P-40', 'Puerta P-40',         'puerta',  '{1,2}',   10),
      ('PUERTA-COM',  'Puerta Comercial',    'puerta',  '{1,2}',   11)
    ) AS x(codigo, nombre, tipo, hojas, orden)
  ON CONFLICT (tenant_id, codigo) DO NOTHING;
  INSERT INTO public.vent_config (tenant_id) VALUES (p_tenant) ON CONFLICT (tenant_id) DO NOTHING;
  FOR r IN SELECT s.id FROM public.vent_sistemas s
            WHERE s.tenant_id = p_tenant AND NOT EXISTS (SELECT 1 FROM public.vent_piezas pz WHERE pz.sistema_id = s.id) LOOP
    PERFORM private.vent_piezas_fabrica(r.id);
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION private.vent_preparar(uuid) FROM PUBLIC, anon, authenticated;

-- Un sistema que se agrega a mano trae piezas de fábrica para empezar.
CREATE OR REPLACE FUNCTION private.vent_sistema_despues()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  PERFORM private.vent_piezas_fabrica(NEW.id);
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION private.vent_sistema_despues() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS vent_sistema_despues ON public.vent_sistemas;
CREATE TRIGGER vent_sistema_despues AFTER INSERT ON public.vent_sistemas
  FOR EACH ROW EXECUTE FUNCTION private.vent_sistema_despues();

-- D Mario (y cualquier otra empresa de aluminio).
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT tenant_id FROM public.config_empresa WHERE tipo_negocio = 'aluminio' LOOP
    PERFORM private.vent_preparar(r.tenant_id);
  END LOOP;
END $$;

SELECT public.registrar_migracion('ventanas_desglose.sql');
