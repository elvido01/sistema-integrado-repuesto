-- =====================================================================
-- CENTINELAS DEL FLUJO — Fase 3: EL AUTOCHEQUEO + LA RONDA
-- ---------------------------------------------------------------------
-- (2026-08-23) Las fases 1 y 2 vigilan el NEGOCIO. Esta vigila al
-- SISTEMA, que es de donde vino el problema original.
--
-- El cilindro no se agoto por culpa del negocio: se agoto porque el
-- calculo de reposicion dejo de proponerlo. Un centinela de negocio dice
-- "esta pieza no esta"; uno de autochequeo dice "el calculo que deberia
-- haberla pedido esta fallando". El segundo es el que ahorra las semanas.
--
-- >>> HONESTIDAD SOBRE ESTE ARCHIVO <<<
-- `orden_automatica_muda` devuelve CERO hoy. Se comprobo contra los
-- cuatro suplidores con mas piezas agotadas y en los cuatro la orden
-- automatica propone todo lo que tiene que proponer. O sea que el arreglo
-- de `en_camino_que_nunca_llego.sql` cerro de verdad ese agujero.
--
-- No se deja por adorno: se deja como GUARDIA. El dia que alguien toque
-- el calculo de reposicion y vuelva a esconder productos, esto lo dice al
-- dia siguiente en vez de dentro de tres semanas y un cliente perdido.
-- Un centinela en cero es una defensa que respira.
--
-- Idempotente. Requiere centinelas_del_flujo.sql y centinelas_silencios.sql.
-- =====================================================================

-- ------------------------------------------------------------
-- AUTOCHEQUEO — La orden automatica se quedo muda
-- ------------------------------------------------------------
-- La pregunta exacta: hay piezas que cumplen TODAS las condiciones
-- humanas para que se repongan —tienen suplidor, estan en cero, se
-- vendieron el mes pasado, no estan en ninguna orden— y aun asi el
-- calculo no las propone?
--
-- Si la respuesta es que si, el bug del cilindro volvio.
CREATE OR REPLACE FUNCTION public.centinela_orden_automatica_muda(p_tenant_id uuid)
RETURNS TABLE(huella text, titulo text, detalle text, monto numeric, datos jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  WITH activos AS (
    -- Solo suplidores con los que se trabaja de verdad. Preguntarle al
    -- calculo por uno al que no se le compra desde hace un ano no dice
    -- nada del sistema.
    SELECT DISTINCT c.suplidor_id AS sid
    FROM public.compras c
    WHERE c.tenant_id = p_tenant_id
      AND c.fecha >= now() - interval '120 days'
      AND c.suplidor_id IS NOT NULL
  ),
  en_orden AS (
    SELECT DISTINCT d.producto_id AS pid
    FROM public.ordenes_compra_detalle d
    JOIN public.ordenes_compra oc ON oc.id = d.orden_compra_id
    WHERE oc.tenant_id = p_tenant_id
      AND COALESCE(oc.estado, 'Pendiente') IN ('Pendiente', 'Enviada', 'Parcial')
      AND COALESCE(d.estado_linea, 'pendiente') IN ('pendiente', 'parcial')
      AND d.producto_id IS NOT NULL
  ),
  duelen AS (
    SELECT p.suplidor_id AS sid, p.id AS pid, p.codigo
    FROM public.productos p
    WHERE p.tenant_id = p_tenant_id
      AND COALESCE(p.activo, true)
      AND p.suplidor_id IS NOT NULL
      AND public.get_stock_actual(p.id) <= 0
      AND NOT EXISTS (SELECT 1 FROM en_orden e WHERE e.pid = p.id)
      AND EXISTS (SELECT 1 FROM public.facturas_detalle fd
                  JOIN public.facturas f ON f.id = fd.factura_id
                  WHERE fd.producto_id = p.id AND f.fecha >= now() - interval '90 days')
  ),
  juicio AS (
    SELECT d.sid, count(*) AS duelen,
           count(*) FILTER (WHERE NOT EXISTS (
             SELECT 1 FROM public.get_productos_para_orden_automatica(d.sid) g
             WHERE g.id = d.pid)) AS invisibles,
           (array_agg(d.codigo) FILTER (WHERE NOT EXISTS (
             SELECT 1 FROM public.get_productos_para_orden_automatica(d.sid) g
             WHERE g.id = d.pid)))[1:8] AS codigos
    FROM duelen d
    JOIN activos a ON a.sid = d.sid
    GROUP BY d.sid
  )
  SELECT
    j.sid::text,
    format('La orden automatica no esta proponiendo %s pieza(s) de %s', j.invisibles, pr.nombre),
    format('%s de %s producto(s) suyos estan en cero, se vendieron en los ultimos 90 dias, no estan en ninguna orden — y aun asi el calculo de reposicion no los propone: %s. Esto es el bug del cilindro: no es que falte la pieza, es que el sistema no la esta pidiendo.',
           j.invisibles, j.duelen, array_to_string(j.codigos, ', ')),
    NULL::numeric,
    jsonb_build_object('suplidor_id', j.sid, 'suplidor', pr.nombre,
                       'agotados_con_venta', j.duelen, 'invisibles', j.invisibles,
                       'codigos', to_jsonb(j.codigos))
  FROM juicio j
  JOIN public.proveedores pr ON pr.id = j.sid
  WHERE j.invisibles > 0
  ORDER BY j.invisibles DESC;
$fn$;

-- ------------------------------------------------------------
-- AUTOCHEQUEO — Un cierre que no cuadra
-- ------------------------------------------------------------
-- La diferencia entre el efectivo contado y el desglose ya se guarda en
-- cada cierre. Nadie la mira despues.
--
-- Ventana corta a proposito: SOLO los ultimos 10 dias. El dueno decidio
-- el 20/08 que los cierres viejos se quedan como estan aunque no cuadren,
-- y un centinela no esta para reabrir esa decision — esta para que un
-- descuadre NUEVO no pase de largo.
CREATE OR REPLACE FUNCTION public.centinela_cierre_no_cuadra(p_tenant_id uuid)
RETURNS TABLE(huella text, titulo text, detalle text, monto numeric, datos jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT
    cc.id::text,
    format('El cierre del %s no cuadra por RD$%s',
           to_char(cc.fecha, 'DD/MM'),
           to_char(round(abs(cc.diferencia), 0), 'FM999,999,999')),
    format('Turno %s, %s: se conto RD$%s en efectivo y el desglose da RD$%s. %s RD$%s.',
           COALESCE(cc.turno, 1), COALESCE(cc.cajero_nombre, 'sin cajero'),
           to_char(round(COALESCE(cc.efectivo_en_caja, 0), 2), 'FM999,999,999.00'),
           to_char(round(COALESCE(cc.total_desglose, 0), 2), 'FM999,999,999.00'),
           CASE WHEN cc.diferencia > 0 THEN 'Sobra' ELSE 'Falta' END,
           to_char(round(abs(cc.diferencia), 2), 'FM999,999,999.00')),
    round(abs(cc.diferencia), 2),
    jsonb_build_object('cierre_id', cc.id, 'fecha', cc.fecha, 'turno', cc.turno,
                       'diferencia', cc.diferencia, 'cajero', cc.cajero_nombre)
  FROM public.cierres_caja cc
  WHERE cc.tenant_id = p_tenant_id
    AND cc.fecha >= CURRENT_DATE - 10
    AND abs(COALESCE(cc.diferencia, 0)) >= 200
  ORDER BY abs(cc.diferencia) DESC;
$fn$;

-- ------------------------------------------------------------
-- AUTOCHEQUEO — Un centinela que se rompio
-- ------------------------------------------------------------
-- El vigilante de los vigilantes. Si un centinela empieza a fallar, el
-- motor lo aisla para que no tumbe a los demas y le guarda el error —
-- pero aislado y callado es igual a no existir, que es justo el problema
-- que todo esto viene a resolver.
--
-- >>> LO QUE ESTO **NO** CUBRE <<<
-- Si el motor entero deja de correr, este centinela tampoco corre y nadie
-- avisa. Ese agujero no se puede tapar desde adentro de la base: lo tapa
-- `centinelas_latido()` de mas abajo, que se mira desde fuera.
CREATE OR REPLACE FUNCTION public.centinela_roto(p_tenant_id uuid)
RETURNS TABLE(huella text, titulo text, detalle text, monto numeric, datos jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT
    c.clave,
    format('El centinela "%s" esta fallando', c.titulo),
    format('Lleva sin poder correr desde %s. El error es: %s. Mientras siga asi, nadie esta vigilando eso.',
           COALESCE(to_char(c.ultima_corrida, 'DD/MM HH24:MI'), 'siempre'),
           left(COALESCE(c.ultimo_error, 'desconocido'), 180)),
    NULL::numeric,
    jsonb_build_object('centinela', c.clave, 'error', c.ultimo_error)
  FROM public.centinelas c
  WHERE c.activo
    AND c.clave <> 'centinela_roto'
    AND (c.ultimo_error IS NOT NULL
         OR c.ultima_corrida IS NULL
         OR c.ultima_corrida < now() - interval '48 hours')
    -- p_tenant_id no se usa: las definiciones son del sistema, no de una
    -- empresa. Va en la firma porque el motor llama a todos igual.
    AND p_tenant_id IS NOT NULL;
$fn$;


INSERT INTO public.centinelas (clave, titulo, familia, severidad, funcion, descripcion, orden) VALUES
  ('orden_automatica_muda', 'La reposicion dejo de proponer piezas',
   'autochequeo', 'rojo', 'centinela_orden_automatica_muda',
   'Piezas agotadas, con venta y sin pedir que el calculo de reposicion no propone. El bug del cilindro.', 1),

  ('cierre_no_cuadra', 'Un cierre de caja no cuadra',
   'autochequeo', 'amarillo', 'centinela_cierre_no_cuadra',
   'Diferencia de RD$200 o mas entre el efectivo contado y el desglose, en los ultimos 10 dias.', 25),

  ('centinela_roto', 'Un centinela dejo de vigilar',
   'autochequeo', 'rojo', 'centinela_roto',
   'Centinela con error o sin correr en 48 horas. El vigilante de los vigilantes.', 2)
ON CONFLICT (clave) DO UPDATE
  SET titulo = EXCLUDED.titulo, familia = EXCLUDED.familia,
      severidad = EXCLUDED.severidad, funcion = EXCLUDED.funcion,
      descripcion = EXCLUDED.descripcion, orden = EXCLUDED.orden;


-- =====================================================================
-- LA RONDA — quien lo dispara todo
-- ---------------------------------------------------------------------
-- Se usa pg_cron, que ya esta instalado y con nueve trabajos corriendo.
-- Es mejor sitio que el VPS: no depende de que Hostinger este arriba, ni
-- de python, ni de una contrasena que haya que rotar.
-- =====================================================================

-- Que empresa lo tiene encendido. Morla es el piloto; las demas lo
-- prenden cuando se decida, sin tocar codigo.
ALTER TABLE public.config_empresa
  ADD COLUMN IF NOT EXISTS feat_centinelas boolean NOT NULL DEFAULT false;

UPDATE public.config_empresa
SET feat_centinelas = true
WHERE tenant_id = '00000000-0000-0000-0000-000000000001';

CREATE OR REPLACE FUNCTION public.centinelas_ronda(p_resumen boolean DEFAULT false)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  t     record;
  v_out jsonb := '[]'::jsonb;
  v_c   json;
  v_a   json;
BEGIN
  FOR t IN
    SELECT DISTINCT ce.tenant_id FROM public.config_empresa ce
    WHERE COALESCE(ce.feat_centinelas, false)
  LOOP
    BEGIN
      v_c := public.correr_centinelas(t.tenant_id);
      v_a := public.centinelas_avisar(t.tenant_id, p_resumen);
      v_out := v_out || jsonb_build_object(
        'tenant', t.tenant_id, 'corrida', v_c::jsonb, 'aviso', v_a::jsonb);
    EXCEPTION WHEN OTHERS THEN
      -- Una empresa rota no puede dejar a las demas sin vigilancia.
      v_out := v_out || jsonb_build_object('tenant', t.tenant_id, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN json_build_object('ok', true, 'resumen', p_resumen, 'empresas', v_out);
END $fn$;

GRANT EXECUTE ON FUNCTION public.centinelas_ronda(boolean) TO service_role;

-- El latido, para mirarlo desde fuera. Si esto dice que la ultima ronda
-- fue hace ocho horas, el motor esta caido y da igual lo que digan los
-- centinelas — porque no estan corriendo.
CREATE OR REPLACE FUNCTION public.centinelas_latido()
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT json_build_object(
    'ultima_ronda', max(ultima_corrida),
    'hace_minutos', round(EXTRACT(epoch FROM (now() - max(ultima_corrida))) / 60),
    'vivo', (max(ultima_corrida) > now() - interval '3 hours'),
    'centinelas', count(*),
    'rotos', count(*) FILTER (WHERE ultimo_error IS NOT NULL))
  FROM public.centinelas WHERE activo;
$fn$;

GRANT EXECUTE ON FUNCTION public.centinelas_latido() TO authenticated, service_role;

-- ------------------------------------------------------------
-- Los horarios
-- ------------------------------------------------------------
-- pg_cron va en UTC y aqui son UTC-4 todo el ano (no hay horario de
-- verano), asi que se resta 4 a mano.
--
--   12:30 UTC =  8:30 am  -> el resumen de la manana, TODO junto
--   13-23 UTC =  9am-7pm  -> la ronda, cada hora, SOLO lo rojo
--
-- La ronda llega hasta las 7pm de aqui porque `sin_ventas_hoy` no puede
-- disparar antes de las 4pm: la factura mas tardia de los ultimos 60
-- dias entro a las 3pm y avisar antes seria un falso positivo.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobname)
    FROM cron.job WHERE jobname IN ('centinelas-ronda', 'centinelas-resumen');

    PERFORM cron.schedule('centinelas-resumen', '30 12 * * *',
                          $$SELECT public.centinelas_ronda(true);$$);
    PERFORM cron.schedule('centinelas-ronda',   '0 13-23 * * *',
                          $$SELECT public.centinelas_ronda(false);$$);
  END IF;
END $cron$;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('centinelas_autochequeo.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Corre TODO (las tres fases) pero NO avisa: el primer mensaje al canal
-- se manda a mano, para que nadie se sorprenda con 25 avisos de golpe.
SELECT public.correr_centinelas('00000000-0000-0000-0000-000000000001'::uuid) AS corrida;

SELECT c.familia, c.severidad, c.titulo, count(h.id) AS hallazgos,
       COALESCE(round(SUM(h.monto), 0), 0) AS monto
FROM public.centinelas c
LEFT JOIN public.centinela_hallazgos h
       ON h.centinela = c.clave AND h.murio_en IS NULL
      AND h.tenant_id = '00000000-0000-0000-0000-000000000001'
GROUP BY c.clave, c.familia, c.severidad, c.titulo, c.orden
ORDER BY c.orden;

SELECT clave, ultimo_error FROM public.centinelas WHERE ultimo_error IS NOT NULL;

SELECT jobname, schedule, active FROM cron.job
WHERE jobname LIKE 'centinelas%' ORDER BY jobname;
