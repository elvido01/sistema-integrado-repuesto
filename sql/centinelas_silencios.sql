-- =====================================================================
-- CENTINELAS DEL FLUJO — Fase 2: LOS SILENCIOS
-- ---------------------------------------------------------------------
-- (2026-08-23) La fase 1 vigila cosas que ESTAN mal en el dato. Esta
-- vigila lo contrario, que es mas dificil de ver con los ojos: algo que
-- pasaba todos los dias y dejo de pasar.
--
-- El bug del cilindro fue un silencio. Nadie borro nada ni escribio un
-- numero malo: simplemente el producto dejo de aparecer donde siempre
-- aparecia, y nadie lo nota hasta que un cliente lo pide.
--
-- >>> LOS UMBRALES SALEN DE LOS DATOS, NO DE LA CABEZA <<<
-- Se miro el ritmo real de Morla antes de escribir cada numero:
--
--   - Se factura los SIETE dias (domingo mas flojo: 85 facturas en 12
--     domingos, contra ~270 los demas dias). O sea que "es domingo" no
--     es excusa para un dia sin ventas.
--   - La primera factura del dia cae a las 9am de promedio, y la mas
--     tarde de los ultimos 60 dias fue a las 3pm. Por eso el corte esta
--     a las 4pm: mas temprano habria dado un falso positivo ese dia.
--   - En 90 dias hubo UN solo dia sin ninguna venta. Es raro de verdad,
--     y por eso vale la pena avisarlo en rojo.
--
-- >>> LO QUE SE DEJO FUERA A PROPOSITO <<<
-- Se penso un centinela de "dia sin cierre de caja". Se descarto: en los
-- ultimos 30 dias hay 12 dias con ventas y sin cierre. Eso no es una
-- anomalia, es el ritmo de la casa — se cierra como una vez cada tres
-- dias. Un centinela asi habria nacido con 12 hallazgos encima y seria
-- exactamente el ruido que este sistema viene a evitar. Avisar de algo
-- normal es la forma mas rapida de que dejen de leerte.
--
-- Idempotente. Requiere centinelas_del_flujo.sql.
-- =====================================================================

-- ------------------------------------------------------------
-- SILENCIO — Todo un dia sin facturar
-- ------------------------------------------------------------
-- Lo que caza: la caja caida, el internet abajo, la impresora fiscal
-- trabada, alguien que no abrio. Cualquier cosa que impida vender.
-- Un solo hallazgo por dia, y se muere solo en cuanto entre una factura.
CREATE OR REPLACE FUNCTION public.centinela_sin_ventas_hoy(p_tenant_id uuid)
RETURNS TABLE(huella text, titulo text, detalle text, monto numeric, datos jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  WITH ahora AS (
    SELECT (now() AT TIME ZONE 'America/Santo_Domingo') AS l
  ), ventana AS (
    -- La ventana del dia se arma en hora de aqui y se compara contra el
    -- timestamptz. Escribir la fecha pelada correria el dia cuatro horas.
    SELECT a.l,
           (a.l::date::timestamp AT TIME ZONE 'America/Santo_Domingo') AS desde,
           ((a.l::date + 1)::timestamp AT TIME ZONE 'America/Santo_Domingo') AS hasta
    FROM ahora a
  )
  SELECT
    to_char(v.l::date, 'YYYY-MM-DD'),
    'No se ha facturado nada en todo el dia'::text,
    format('Son las %s y no hay una sola factura de hoy. En los ultimos 90 dias solo hubo UN dia sin ninguna venta, y la primera factura suele entrar a las 9am. O esta cerrado, o algo no esta dejando facturar.',
           to_char(v.l, 'HH12:MI am')),
    NULL::numeric,
    jsonb_build_object('fecha', v.l::date, 'hora_local', to_char(v.l, 'HH24:MI'))
  FROM ventana v
  WHERE extract(hour from v.l) >= 16
    AND NOT EXISTS (
      SELECT 1 FROM public.facturas f
      WHERE f.tenant_id = p_tenant_id
        AND f.fecha >= v.desde AND f.fecha < v.hasta);
$fn$;

-- ------------------------------------------------------------
-- SILENCIO — El suplidor dejo de venir
-- ------------------------------------------------------------
-- Cada suplidor tiene su ritmo y el sistema lo sabe: se saca del
-- historial, no se pregunta. G&G viene cada 6 dias, HAO cada 7, ALMONTE
-- cada 14. Cuando uno pasa TRES veces su ritmo sin aparecer, o cambio
-- algo con el o se le olvido a alguien llamarlo — y mientras tanto sus
-- piezas se estan agotando.
--
-- Solo se avisa de quien tiene algo esperandolo: un suplidor al que no
-- se le debe nada y no se le va a pedir nada no es un problema.
CREATE OR REPLACE FUNCTION public.centinela_suplidor_no_ha_venido(p_tenant_id uuid)
RETURNS TABLE(huella text, titulo text, detalle text, monto numeric, datos jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  WITH ritmo AS (
    SELECT c.suplidor_id,
           count(*) AS compras,
           max(c.fecha)::date AS ultima,
           -- Su intervalo tipico, con piso de 3 dias para que un suplidor
           -- de visita diaria no dispare por llegar un dia tarde.
           GREATEST(
             round((max(c.fecha)::date - min(c.fecha)::date)::numeric
                   / GREATEST(count(*) - 1, 1))::int, 3) AS intervalo
    FROM public.compras c
    WHERE c.tenant_id = p_tenant_id
      AND c.fecha >= now() - interval '365 days'
      AND c.suplidor_id IS NOT NULL
    GROUP BY 1
    HAVING count(*) >= 3          -- sin tres visitas no hay ritmo que medir
  ),
  esperando AS (
    SELECT oc.suplidor_id, count(d.id) AS lineas
    FROM public.ordenes_compra oc
    JOIN public.ordenes_compra_detalle d ON d.orden_compra_id = oc.id
    WHERE oc.tenant_id = p_tenant_id
      AND COALESCE(oc.estado, 'Pendiente') = 'Pendiente'
    GROUP BY 1
  )
  SELECT
    r.suplidor_id::text,
    format('%s lleva %s dias sin venir', pr.nombre, (CURRENT_DATE - r.ultima)),
    format('Viene cada %s dias y ya van %s desde el %s. Tiene %s producto(s) esperandolo en la lista%s.',
           r.intervalo, (CURRENT_DATE - r.ultima),
           to_char(r.ultima, 'DD/MM/YYYY'), e.lineas,
           CASE WHEN ag.n > 0
                THEN format(', y %s pieza(s) suyas ya estan agotadas', ag.n)
                ELSE '' END),
    NULL::numeric,
    jsonb_build_object(
      'suplidor_id', r.suplidor_id, 'suplidor', pr.nombre,
      'intervalo_dias', r.intervalo, 'dias_sin_venir', (CURRENT_DATE - r.ultima),
      'ultima_compra', r.ultima, 'lineas_esperando', e.lineas,
      'agotados_suyos', ag.n)
  FROM ritmo r
  JOIN esperando e ON e.suplidor_id = r.suplidor_id
  JOIN public.proveedores pr ON pr.id = r.suplidor_id
  CROSS JOIN LATERAL (
    SELECT count(*) AS n FROM public.productos p
    WHERE p.tenant_id = p_tenant_id AND p.suplidor_id = r.suplidor_id
      AND COALESCE(p.activo, true) AND public.get_stock_actual(p.id) <= 0
  ) ag
  WHERE (CURRENT_DATE - r.ultima) > GREATEST(r.intervalo * 3, 21)
  ORDER BY ag.n DESC, (CURRENT_DATE - r.ultima) DESC;
$fn$;

-- ------------------------------------------------------------
-- SILENCIO — Un borrador que se quedo esperando
-- ------------------------------------------------------------
-- La lista de un suplidor se llena entre visita y visita, y eso esta
-- bien: es como trabaja la casa. Pero una lista que lleva mas del doble
-- de su ventana sin convertirse en pedido ya no esta esperando — se
-- quedo. Las piezas que hay ahi llevan ese tiempo sin poder venderse.
CREATE OR REPLACE FUNCTION public.centinela_borrador_olvidado(p_tenant_id uuid)
RETURNS TABLE(huella text, titulo text, detalle text, monto numeric, datos jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT
    oc.id::text,
    format('La lista de %s lleva %s dias sin pedirse',
           pr.nombre, (CURRENT_DATE - oc.fecha_orden::date)),
    format('%s tiene %s producto(s) apuntados desde el %s y nunca se convirtio en pedido. Su ventana normal es de %s dias.%s',
           oc.numero, count(d.id), to_char(oc.fecha_orden::date, 'DD/MM/YYYY'),
           public.dias_caducidad_orden(oc.suplidor_id),
           CASE WHEN uc.f IS NULL THEN ' Nunca se le ha comprado a este suplidor.'
                ELSE format(' Su ultima compra fue el %s.', to_char(uc.f, 'DD/MM/YYYY')) END),
    round(SUM(COALESCE(d.cantidad, 0) * COALESCE(d.precio, 0)), 2),
    jsonb_build_object(
      'orden_id', oc.id, 'numero', oc.numero,
      'suplidor_id', oc.suplidor_id, 'suplidor', pr.nombre,
      'dias', (CURRENT_DATE - oc.fecha_orden::date), 'lineas', count(d.id))
  FROM public.ordenes_compra oc
  JOIN public.proveedores pr ON pr.id = oc.suplidor_id
  JOIN public.ordenes_compra_detalle d ON d.orden_compra_id = oc.id
  LEFT JOIN LATERAL (
    SELECT max(c.fecha)::date AS f FROM public.compras c
    WHERE c.tenant_id = p_tenant_id AND c.suplidor_id = oc.suplidor_id
  ) uc ON true
  WHERE oc.tenant_id = p_tenant_id
    AND COALESCE(oc.estado, 'Pendiente') = 'Pendiente'
    AND oc.fecha_orden::date < CURRENT_DATE - (public.dias_caducidad_orden(oc.suplidor_id) * 2)
  GROUP BY oc.id, oc.numero, oc.suplidor_id, oc.fecha_orden, pr.nombre, uc.f
  ORDER BY (CURRENT_DATE - oc.fecha_orden::date) DESC;
$fn$;


INSERT INTO public.centinelas (clave, titulo, familia, severidad, funcion, descripcion, orden) VALUES
  ('sin_ventas_hoy', 'Todo un dia sin facturar',
   'silencio', 'rojo', 'centinela_sin_ventas_hoy',
   'Pasadas las 4pm sin una sola factura. En 90 dias solo paso una vez.', 5),

  ('suplidor_no_ha_venido', 'Un suplidor dejo de venir',
   'silencio', 'amarillo', 'centinela_suplidor_no_ha_venido',
   'Suplidor con productos esperandolo que lleva mas de 3 veces su ritmo sin aparecer.', 40),

  ('borrador_olvidado', 'Una lista de compra que se quedo',
   'silencio', 'amarillo', 'centinela_borrador_olvidado',
   'Borrador con productos apuntados hace mas del doble de la ventana del suplidor.', 50)
ON CONFLICT (clave) DO UPDATE
  SET titulo = EXCLUDED.titulo, familia = EXCLUDED.familia,
      severidad = EXCLUDED.severidad, funcion = EXCLUDED.funcion,
      descripcion = EXCLUDED.descripcion, orden = EXCLUDED.orden;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('centinelas_silencios.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT public.correr_centinelas('00000000-0000-0000-0000-000000000001'::uuid) AS corrida;

SELECT c.familia, c.severidad, c.titulo, count(h.id) AS hallazgos
FROM public.centinelas c
LEFT JOIN public.centinela_hallazgos h
       ON h.centinela = c.clave AND h.murio_en IS NULL
      AND h.tenant_id = '00000000-0000-0000-0000-000000000001'
GROUP BY c.clave, c.familia, c.severidad, c.titulo, c.orden
ORDER BY c.orden;

SELECT clave, ultimo_error FROM public.centinelas WHERE ultimo_error IS NOT NULL;
