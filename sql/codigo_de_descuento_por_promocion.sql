-- =====================================================================
-- CODIGO DE DESCUENTO POR PROMOCION (5%) — PARA SABER QUE RED VENDE
-- ---------------------------------------------------------------------
-- (2026-10-04) facturas.canal_origen dice "tienda" en las 838 facturas del
-- ultimo mes: no hay forma de saber si las redes traen gente. Decision del
-- dueño: cada promocion lleva un codigo que da 5% sobre el precio final de
-- la pieza promocionada, sin limite de usos, valido 7 dias.
--
-- >>> COMO FUNCIONA <<<
-- * Una promocion (publication_bundle_id) = UN numero (101, 102...). Cada red
--   lo lleva con su letra delante: T214 TikTok, I214 Instagram, F214
--   Facebook, Y214 YouTube, W214 estado de WhatsApp. La letra dice la red; el
--   numero, la promocion.
-- * El numero nace solo, con un disparador, al crear los trabajos de
--   publicacion. Si algo falla al crearlo, la publicacion sigue igual: un
--   codigo que falta es un dato menos, una promocion que no sale es peor.
-- * El publicador pega el codigo al texto (Facebook, Instagram, YouTube).
--   TikTok llega a la bandeja SIN texto: el dueño lo copia desde Equipo IA.
-- * En caja se teclea en la misma casilla de los codigos de pieza:
--   promo_codigo_buscar lo reconoce. La factura guarda promo_codigo_id y el
--   canal. El 5% nunca deja la pieza bajo el costo (eso lo cuida la caja con
--   la misma regla de siempre).
-- * Siete piezas de otras empresas tienen codigos como T0708 o T005: los
--   numeros empiezan en 101 y nunca llevan cero delante, asi que no chocan.
-- =====================================================================

-- YouTube no estaba en la lista de canales de venta. Mismo vocabulario que
-- src/lib/canalesOrigen.js: se cambian los dos CHECK y el archivo juntos.
ALTER TABLE public.facturas DROP CONSTRAINT IF EXISTS facturas_canal_origen_check;
ALTER TABLE public.facturas ADD CONSTRAINT facturas_canal_origen_check CHECK (
  canal_origen IS NULL OR canal_origen = ANY (ARRAY['tienda','whatsapp','instagram','facebook',
    'tiktok','youtube','telefono','referido','redes','otro']));
ALTER TABLE public.crm_seguimiento DROP CONSTRAINT IF EXISTS crm_seguimiento_canal_origen_check;
ALTER TABLE public.crm_seguimiento ADD CONSTRAINT crm_seguimiento_canal_origen_check CHECK (
  canal_origen IS NULL OR canal_origen = ANY (ARRAY['tienda','whatsapp','instagram','facebook',
    'tiktok','youtube','telefono','referido','redes','otro']));


CREATE TABLE IF NOT EXISTS public.promo_codigos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  bundle_id   uuid NOT NULL UNIQUE,
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  numero      integer NOT NULL CHECK (numero >= 101),
  pct         numeric NOT NULL DEFAULT 5 CHECK (pct > 0 AND pct <= 50),
  vence_at    timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, numero)
);

ALTER TABLE public.promo_codigos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS promo_codigos_leer ON public.promo_codigos;
CREATE POLICY promo_codigos_leer ON public.promo_codigos
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());

ALTER TABLE public.facturas ADD COLUMN IF NOT EXISTS promo_codigo_id uuid
  REFERENCES public.promo_codigos(id);
CREATE INDEX IF NOT EXISTS facturas_promo_codigo_idx
  ON public.facturas (promo_codigo_id) WHERE promo_codigo_id IS NOT NULL;


-- La letra de cada red. Un solo sitio: el disparador, el publicador y la
-- caja la leen de aqui.
CREATE OR REPLACE FUNCTION public.promo_letra_de(p_canal text)
 RETURNS text LANGUAGE sql IMMUTABLE AS $function$
  SELECT CASE lower(p_canal)
    WHEN 'tiktok' THEN 'T' WHEN 'instagram' THEN 'I' WHEN 'facebook' THEN 'F'
    WHEN 'youtube' THEN 'Y' WHEN 'whatsapp' THEN 'W' END;
$function$;

CREATE OR REPLACE FUNCTION public.promo_canal_de(p_letra text)
 RETURNS text LANGUAGE sql IMMUTABLE AS $function$
  SELECT CASE upper(p_letra)
    WHEN 'T' THEN 'tiktok' WHEN 'I' THEN 'instagram' WHEN 'F' THEN 'facebook'
    WHEN 'Y' THEN 'youtube' WHEN 'W' THEN 'whatsapp' END;
$function$;


CREATE OR REPLACE FUNCTION public._promo_codigo_al_publicar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_base timestamptz := COALESCE(NEW.scheduled_for, now());
BEGIN
  IF EXISTS (SELECT 1 FROM public.promo_codigos WHERE bundle_id = NEW.publication_bundle_id) THEN
    RETURN NEW;
  END IF;
  -- Dos promociones a la vez no pueden sacar el mismo numero.
  PERFORM pg_advisory_xact_lock(hashtext('promo_codigos:' || NEW.tenant_id::text));
  INSERT INTO public.promo_codigos (tenant_id, bundle_id, producto_id, numero, vence_at)
  VALUES (
    NEW.tenant_id, NEW.publication_bundle_id, NEW.producto_id,
    COALESCE((SELECT max(numero) FROM public.promo_codigos WHERE tenant_id = NEW.tenant_id), 100) + 1,
    -- Siete dias contando el de publicar, hasta las 11:59 pm hora de RD.
    (((v_base AT TIME ZONE 'America/Santo_Domingo')::date + 7)::timestamp
       AT TIME ZONE 'America/Santo_Domingo') - interval '1 second')
  ON CONFLICT (bundle_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'promo_codigo: no se creo el codigo de %: %', NEW.publication_bundle_id, SQLERRM;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_promo_codigo_al_publicar ON public.hermes_publication_jobs;
CREATE TRIGGER trg_promo_codigo_al_publicar
  AFTER INSERT ON public.hermes_publication_jobs
  FOR EACH ROW
  WHEN (NEW.producto_id IS NOT NULL AND NEW.publication_bundle_id IS NOT NULL)
  EXECUTE FUNCTION public._promo_codigo_al_publicar();


-- Para el publicador (service_role): el codigo de ESTE trabajo, con la letra
-- de su red. NULL si la promocion no tiene codigo.
CREATE OR REPLACE FUNCTION public.promo_codigo_de_trabajo(p_job_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
           'codigo', public.promo_letra_de(j.channels[1]) || pc.numero,
           'numero', pc.numero, 'pct', pc.pct, 'vence_at', pc.vence_at)
  FROM public.hermes_publication_jobs j
  JOIN public.promo_codigos pc ON pc.bundle_id = j.publication_bundle_id
  WHERE j.id = p_job_id
    AND public.promo_letra_de(j.channels[1]) IS NOT NULL;
$function$;
REVOKE ALL ON FUNCTION public.promo_codigo_de_trabajo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promo_codigo_de_trabajo(uuid) TO service_role;


-- Para la caja: ¿lo que tecleó el vendedor es un codigo de promocion?
-- Devuelve NULL si no tiene forma de codigo o no existe (la caja sigue y lo
-- busca como pieza).
CREATE OR REPLACE FUNCTION public.promo_codigo_buscar(p_codigo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_txt text := upper(btrim(COALESCE(p_codigo, '')));
  v_canal text;
  v_res jsonb;
BEGIN
  IF v_txt !~ '^[TIFYW][1-9][0-9]{2,4}$' THEN
    RETURN NULL;
  END IF;
  v_canal := public.promo_canal_de(left(v_txt, 1));

  SELECT jsonb_build_object(
           'id', pc.id, 'codigo', v_txt, 'numero', pc.numero, 'canal', v_canal,
           'pct', pc.pct, 'vence_at', pc.vence_at, 'vencido', pc.vence_at < now(),
           'producto_id', p.id, 'producto_codigo', p.codigo, 'descripcion', p.descripcion)
    INTO v_res
  FROM public.promo_codigos pc
  JOIN public.productos p ON p.id = pc.producto_id
  WHERE pc.tenant_id = public.get_user_tenant()
    AND pc.numero = substring(v_txt FROM 2)::int;

  RETURN v_res;
END $function$;
REVOKE ALL ON FUNCTION public.promo_codigo_buscar(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promo_codigo_buscar(text) TO authenticated;


-- Para Equipo IA: cada promocion con su codigo, lo que trajo y lo que costo.
CREATE OR REPLACE FUNCTION public.equipo_promos_resultados(p_dias integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid := public.get_user_tenant();
  v_res jsonb;
BEGIN
  IF NOT public.equipo_ia_permitido() THEN
    RAISE EXCEPTION 'Este módulo es del dueño.';
  END IF;

  WITH promos AS (
    SELECT pc.*, p.codigo AS producto_codigo, p.descripcion, p.precio,
           (SELECT array_agg(DISTINCT j.channels[1]) FROM public.hermes_publication_jobs j
             WHERE j.publication_bundle_id = pc.bundle_id) AS redes
    FROM public.promo_codigos pc
    JOIN public.productos p ON p.id = pc.producto_id
    WHERE pc.tenant_id = v_tenant
      AND pc.created_at >= now() - make_interval(days => GREATEST(1, COALESCE(p_dias, 60)))
  ), fact AS (
    SELECT f.promo_codigo_id, COALESCE(f.canal_origen, 'otro') AS canal,
           count(*) AS facturas, sum(f.total) AS vendido,
           sum((SELECT COALESCE(sum(d.descuento), 0) FROM public.facturas_detalle d
                 JOIN public.promo_codigos pc2 ON pc2.id = f.promo_codigo_id
                WHERE d.factura_id = f.id AND d.producto_id = pc2.producto_id)) AS descuento
    FROM public.facturas f
    WHERE f.tenant_id = v_tenant
      AND f.promo_codigo_id IN (SELECT id FROM promos)
      AND f.estado <> 'Anulada'
    GROUP BY 1, 2
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', pr.id, 'numero', pr.numero, 'pct', pr.pct,
           'creado', pr.created_at, 'vence_at', pr.vence_at, 'vigente', pr.vence_at >= now(),
           'producto_codigo', pr.producto_codigo, 'descripcion', pr.descripcion, 'precio', pr.precio,
           'redes', COALESCE(to_jsonb(pr.redes), '[]'::jsonb),
           'por_canal', COALESCE((SELECT jsonb_object_agg(fa.canal, jsonb_build_object(
                          'facturas', fa.facturas, 'vendido', round(fa.vendido, 2),
                          'descuento', round(fa.descuento, 2)))
                        FROM fact fa WHERE fa.promo_codigo_id = pr.id), '{}'::jsonb),
           'facturas', COALESCE((SELECT sum(fa.facturas) FROM fact fa WHERE fa.promo_codigo_id = pr.id), 0),
           'vendido', COALESCE((SELECT round(sum(fa.vendido), 2) FROM fact fa WHERE fa.promo_codigo_id = pr.id), 0),
           'descuento', COALESCE((SELECT round(sum(fa.descuento), 2) FROM fact fa WHERE fa.promo_codigo_id = pr.id), 0)
         ) ORDER BY pr.numero DESC), '[]'::jsonb)
    INTO v_res
  FROM promos pr;

  RETURN v_res;
END $function$;
REVOKE ALL ON FUNCTION public.equipo_promos_resultados(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipo_promos_resultados(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('codigo_de_descuento_por_promocion.sql');
