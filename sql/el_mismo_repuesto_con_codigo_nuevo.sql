-- ============================================================
-- EL MISMO REPUESTO CON CÓDIGO NUEVO
-- ============================================================
-- El dueno abrio una propuesta y encontro esto:
--     G146  BATERIA 4 AH GTS               15 ventas   (codigo del suplidor)
--     569   BATERIA 4 ZUSUKI,C90,3KJ GTS    1 venta    (codigo viejo de la casa)
-- No son dos baterias equivalentes: son LA MISMA bateria dos veces. La empresa
-- esta pasando de sus codigos propios a los codigos de los suplidores para
-- agilizar las compras, y cada vez que eso pasa nace un duplicado. Y encima el
-- viejo era el que estaba metido en el grupo.
--
-- >>> CUANTO PESA ESTO <<<
-- De las 372 propuestas de Repuestos Morla, 67 tienen TODAS sus piezas de la
-- misma marca Y con la misma referencia. Esas no son equivalentes de marcas
-- distintas: son duplicados por cambio de codigo. Se ven de lejos:
--     001531 + T001531      (le pusieron una T delante)
--     RM527  + mRM527       (idem con una m)
--     002689 + RM875        (de codigo de la casa a codigo del suplidor)
--     569    + G146         (la bateria de arriba)
--
-- >>> QUE HACE ESTE ARCHIVO <<<
-- 1) El motor los MARCA distinto: `tipo` = 'duplicado' cuando todas las piezas
--    son de la misma marca y con la misma referencia; 'equivalente' cuando hay
--    varias marcas. La pantalla no puede ofrecer lo mismo para los dos casos:
--    a un duplicado no se le arma un grupo, se le REEMPLAZA.
-- 2) `fusionar_productos`: el codigo nuevo se queda con todo lo que esta VIVO y
--    el viejo se apaga dejando rastro.
--
-- >>> QUE SE MUEVE Y QUE NO (la parte que importa) <<<
-- SE MUEVE, porque es lo que esta por pasar:
--   · la existencia (con su movimiento de AJUSTE, para que cuadre y se audite)
--   · el grupo de equivalentes
--   · las lineas de orden de compra que aun no llegan
--   · las solicitudes de clientes y de compra sin cerrar
--   · lo anotado en el Suplidor Virtual
--   · el mapa de codigos del suplidor  <- justo lo que hace rapida la compra
--   · ubicacion, foto y minimos, SOLO si al que se queda le faltan
--
-- NO SE MUEVE, porque ya paso y las facturas dicen lo que dicen:
--   facturas, compras, devoluciones, movimientos de inventario, entradas y
--   salidas. El producto viejo NO se borra: queda inactivo y apuntando al
--   nuevo (`reemplazado_por`), asi que todo ese historial se sigue leyendo.
-- ============================================================

SELECT public.registrar_migracion('el_mismo_repuesto_con_codigo_nuevo.sql');

-- ============================================================
-- El rastro
-- ============================================================
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS reemplazado_por UUID REFERENCES public.productos(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.productos.reemplazado_por IS
  'Este producto se fusiono con otro (cambio de codigo). Queda inactivo y apuntando al que se quedo, para poder leer su historial.';

CREATE INDEX IF NOT EXISTS idx_productos_reemplazado_por
  ON public.productos(reemplazado_por) WHERE reemplazado_por IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.productos_fusiones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sobrevive_id  UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  absorbido_id  UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  codigo_sobrevive TEXT,
  codigo_absorbido TEXT,
  detalle       JSONB,
  hecha_por     UUID,
  hecha_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.productos_fusiones IS
  'Cada vez que un codigo viejo se reemplaza por uno nuevo: que se movio, cuanto y quien lo hizo.';

ALTER TABLE public.productos_fusiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fusiones_tenant ON public.productos_fusiones;
CREATE POLICY fusiones_tenant ON public.productos_fusiones
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

-- ============================================================
-- LA FUSIÓN
-- ============================================================
-- Se suelta la version de dos argumentos: anadir el tercero con DEFAULT
-- crearia una SOBRECARGA y la llamada reventaria por ambigua.
DROP FUNCTION IF EXISTS public.fusionar_productos(UUID, UUID);

CREATE OR REPLACE FUNCTION public.fusionar_productos(
  p_sobrevive     UUID,
  p_absorbido     UUID,
  p_sugerencia_id UUID DEFAULT NULL   -- para cerrar la propuesta al terminar
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant   UUID := public.get_user_tenant();
  v_sob      public.productos%ROWTYPE;
  v_abs      public.productos%ROWTYPE;
  v_stock    NUMERIC;
  v_detalle  JSONB := '{}'::jsonb;
  n          INT;
BEGIN
  IF p_sobrevive = p_absorbido THEN
    RAISE EXCEPTION 'Son el mismo producto.';
  END IF;

  SELECT * INTO v_sob FROM public.productos WHERE id = p_sobrevive AND tenant_id = v_tenant;
  SELECT * INTO v_abs FROM public.productos WHERE id = p_absorbido AND tenant_id = v_tenant;

  IF v_sob.id IS NULL OR v_abs.id IS NULL THEN
    RAISE EXCEPTION 'Uno de los dos productos no es de esta empresa.';
  END IF;

  IF v_abs.reemplazado_por IS NOT NULL THEN
    RAISE EXCEPTION 'El codigo % ya fue reemplazado antes.', v_abs.codigo;
  END IF;

  -- ── La existencia se muda, no se evapora ──
  -- Dos movimientos de AJUSTE: sale del viejo, entra al nuevo. Asi el kardex
  -- cuenta la historia completa y el inventario total no cambia ni un peso.
  v_stock := COALESCE(public.get_stock_actual(p_absorbido), 0);
  IF v_stock <> 0 THEN
    INSERT INTO public.inventario_movimientos
      (producto_id, tenant_id, tipo, cantidad, costo_unitario, referencia_doc, usuario_id, fecha)
    VALUES
      (p_absorbido, v_tenant, 'AJUSTE', -v_stock, v_abs.costo,
       format('Fusion: pasa a %s', v_sob.codigo), auth.uid(), now()),
      (p_sobrevive, v_tenant, 'AJUSTE',  v_stock, COALESCE(v_sob.costo, v_abs.costo),
       format('Fusion: viene de %s', v_abs.codigo), auth.uid(), now());
  END IF;
  v_detalle := v_detalle || jsonb_build_object('existencia_movida', v_stock);

  -- ── El grupo de equivalentes ──
  -- La membresia tiene el producto como llave: si el que se queda ya esta en un
  -- grupo, se respeta el suyo y solo se saca al viejo.
  IF EXISTS (SELECT 1 FROM public.producto_grupo_miembros WHERE producto_id = p_sobrevive) THEN
    DELETE FROM public.producto_grupo_miembros WHERE producto_id = p_absorbido;
    v_detalle := v_detalle || jsonb_build_object('grupo', 'el que se queda ya tenia grupo');
  ELSE
    UPDATE public.producto_grupo_miembros
       SET producto_id = p_sobrevive
     WHERE producto_id = p_absorbido;
    GET DIAGNOSTICS n = ROW_COUNT;
    v_detalle := v_detalle || jsonb_build_object('grupo', CASE WHEN n > 0 THEN 'heredado del viejo' ELSE 'ninguno' END);
  END IF;

  -- ── Lo que todavia no ha llegado ──
  UPDATE public.ordenes_compra_detalle
     SET producto_id = p_sobrevive
   WHERE producto_id = p_absorbido
     AND estado_linea IN ('pendiente', 'parcial');
  GET DIAGNOSTICS n = ROW_COUNT;
  v_detalle := v_detalle || jsonb_build_object('lineas_orden_pendientes', n);

  -- ── Lo que alguien espera ──
  UPDATE public.solicitudes_clientes SET producto_id = p_sobrevive
   WHERE producto_id = p_absorbido AND COALESCE(estado, '') NOT IN ('cerrada', 'cancelada', 'entregada');
  GET DIAGNOSTICS n = ROW_COUNT;
  v_detalle := v_detalle || jsonb_build_object('solicitudes_clientes', n);

  UPDATE public.solicitudes_compras SET producto_id = p_sobrevive
   WHERE producto_id = p_absorbido AND COALESCE(estado, '') NOT IN ('cerrada', 'cancelada', 'recibida');
  GET DIAGNOSTICS n = ROW_COUNT;
  v_detalle := v_detalle || jsonb_build_object('solicitudes_compras', n);

  UPDATE public.suplidor_virtual_items SET producto_id = p_sobrevive
   WHERE producto_id = p_absorbido AND estado = 'pendiente';
  GET DIAGNOSTICS n = ROW_COUNT;
  v_detalle := v_detalle || jsonb_build_object('suplidor_virtual', n);

  -- ── El mapa de codigos del suplidor: es justo lo que agiliza la compra ──
  UPDATE public.compras_codigos_suplidor c
     SET producto_id = p_sobrevive
   WHERE c.producto_id = p_absorbido
     AND NOT EXISTS (
       SELECT 1 FROM public.compras_codigos_suplidor c2
        WHERE c2.producto_id = p_sobrevive
          AND c2.suplidor_id IS NOT DISTINCT FROM c.suplidor_id
          AND upper(c2.codigo_suplidor) = upper(c.codigo_suplidor)
     );
  GET DIAGNOSTICS n = ROW_COUNT;
  DELETE FROM public.compras_codigos_suplidor WHERE producto_id = p_absorbido;
  v_detalle := v_detalle || jsonb_build_object('codigos_suplidor', n);

  -- ── Lo que le falte al que se queda, se lo lleva del viejo ──
  UPDATE public.productos s SET
    ubicacion  = COALESCE(NULLIF(trim(s.ubicacion), ''), v_abs.ubicacion),
    imagen_url = COALESCE(NULLIF(trim(s.imagen_url), ''), v_abs.imagen_url),
    min_stock  = CASE WHEN COALESCE(s.min_stock, 0) = 0 THEN v_abs.min_stock ELSE s.min_stock END,
    max_stock  = CASE WHEN COALESCE(s.max_stock, 0) = 0 THEN v_abs.max_stock ELSE s.max_stock END,
    suplidor_id = COALESCE(s.suplidor_id, v_abs.suplidor_id),
    updated_at = now()
  WHERE s.id = p_sobrevive;

  -- ── El viejo se apaga, pero no se borra: su historial se sigue leyendo ──
  UPDATE public.productos
     SET activo = false,
         reemplazado_por = p_sobrevive,
         updated_at = now()
   WHERE id = p_absorbido;

  -- Que no lo sigan proponiendo ni como duplicado ni como equivalente
  DELETE FROM public.producto_grupo_sugerencia_miembros WHERE producto_id = p_absorbido;

  INSERT INTO public.productos_fusiones
    (tenant_id, sobrevive_id, absorbido_id, codigo_sobrevive, codigo_absorbido, detalle, hecha_por)
  VALUES (v_tenant, p_sobrevive, p_absorbido, v_sob.codigo, v_abs.codigo, v_detalle, auth.uid());

  -- Si ya no queda nada por reemplazar en la propuesta, se cierra sola: dejarla
  -- pendiente la haria volver manana pidiendo lo que ya se hizo.
  IF p_sugerencia_id IS NOT NULL THEN
    UPDATE public.producto_grupo_sugerencias s
       SET estado = 'confirmada', resuelta_at = now(), resuelta_por = auth.uid()
     WHERE s.id = p_sugerencia_id
       AND s.tenant_id = v_tenant
       AND s.estado = 'pendiente'
       AND (SELECT count(*) FROM public.producto_grupo_sugerencia_miembros m
             WHERE m.sugerencia_id = s.id) <= 1;
  END IF;

  RETURN v_detalle || jsonb_build_object(
    'ok', true,
    'se_queda', v_sob.codigo,
    'se_apaga', v_abs.codigo
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.fusionar_productos(UUID, UUID, UUID) TO authenticated;

-- ============================================================
-- El motor distingue duplicado de equivalente
-- ============================================================
ALTER TABLE public.producto_grupo_sugerencias
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'equivalente';

COMMENT ON COLUMN public.producto_grupo_sugerencias.tipo IS
  'equivalente = piezas distintas que se sustituyen (marcas distintas). duplicado = LA MISMA pieza cargada dos veces por cambio de codigo (misma marca y misma referencia): no se agrupa, se reemplaza.';

-- Para que la pantalla pueda decidir cual se queda sin pedir mas datos.
ALTER TABLE public.producto_grupo_sugerencia_miembros
  ADD COLUMN IF NOT EXISTS ventas_180d NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock       NUMERIC NOT NULL DEFAULT 0;

-- Se marca lo que ya esta calculado (sin volver a correr el motor entero).
WITH calc AS (
  SELECT sg.id,
         count(DISTINCT p.marca_id) AS marcas,
         count(DISTINCT upper(regexp_replace(public._sin_tildes(COALESCE(p.referencia, '')), '[^A-Za-z0-9]', '', 'g'))) AS refs,
         bool_and(COALESCE(p.referencia, '') <> '') AS todas_con_ref
  FROM public.producto_grupo_sugerencias sg
  JOIN public.producto_grupo_sugerencia_miembros m ON m.sugerencia_id = sg.id
  JOIN public.productos p ON p.id = m.producto_id
  WHERE sg.estado = 'pendiente'
  GROUP BY sg.id
)
UPDATE public.producto_grupo_sugerencias s
   SET tipo = CASE WHEN c.marcas = 1 AND c.refs = 1 AND c.todas_con_ref
                   THEN 'duplicado' ELSE 'equivalente' END
  FROM calc c
 WHERE c.id = s.id;

UPDATE public.producto_grupo_sugerencia_miembros m
   SET ventas_180d = COALESCE((
         SELECT sum(fd.cantidad) FROM public.facturas_detalle fd
         JOIN public.facturas f ON f.id = fd.factura_id
        WHERE fd.producto_id = m.producto_id
          AND f.fecha >= current_date - 180
          AND COALESCE(f.estado, '') <> 'Anulada'), 0),
       stock = COALESCE(public.get_stock_actual(m.producto_id), 0);


-- ============================================================
-- El motor aprende a distinguirlos por si solo
-- ============================================================
-- La clasificacion de arriba arregla lo que YA estaba calculado. Pero el motor
-- vuelve a correr cada madrugada, asi que tiene que saber hacerlo el mismo.
-- Se le injerta el paso final leyendo su propia definicion — no se re-escribe
-- entera, para no perder el candado de "recalcular solo lo tuyo".
DO $injerto$
DECLARE
  v_def   text;
  v_nuevo text;
  v_ancla text := '  RETURN jsonb_build_object(' || E'\n' ||
                  '    ''grupos'', v_grupos, ''productos'', v_prod, ''vueltas'', v_vueltas,';
  v_paso  text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'recalcular_sugerencias_equivalentes';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'Falta correr los_equivalentes_se_proponen_solos.sql primero.';
  END IF;

  v_def := replace(v_def, E'\r\n', E'\n');

  IF position('-- Duplicado o equivalente' IN v_def) > 0 THEN
    RAISE NOTICE 'El motor ya sabia distinguirlos.';
    RETURN;
  END IF;

  v_paso :=
    '  -- Duplicado o equivalente. Misma marca Y misma referencia = LA MISMA' || E'\n' ||
    '  -- pieza cargada dos veces (cambio de codigo); no se agrupa, se reemplaza.' || E'\n' ||
    '  WITH calc AS (' || E'\n' ||
    '    SELECT sg.id,' || E'\n' ||
    '           count(DISTINCT p.marca_id) AS marcas,' || E'\n' ||
    '           count(DISTINCT upper(regexp_replace(public._sin_tildes(COALESCE(p.referencia, '''')), ''[^A-Za-z0-9]'', '''', ''g''))) AS refs,' || E'\n' ||
    '           bool_and(COALESCE(p.referencia, '''') <> '''') AS todas_con_ref' || E'\n' ||
    '    FROM public.producto_grupo_sugerencias sg' || E'\n' ||
    '    JOIN public.producto_grupo_sugerencia_miembros m ON m.sugerencia_id = sg.id' || E'\n' ||
    '    JOIN public.productos p ON p.id = m.producto_id' || E'\n' ||
    '    WHERE sg.tenant_id = v_tenant AND sg.estado = ''pendiente''' || E'\n' ||
    '    GROUP BY sg.id' || E'\n' ||
    '  )' || E'\n' ||
    '  UPDATE public.producto_grupo_sugerencias s' || E'\n' ||
    '     SET tipo = CASE WHEN c.marcas = 1 AND c.refs = 1 AND c.todas_con_ref' || E'\n' ||
    '                     THEN ''duplicado'' ELSE ''equivalente'' END' || E'\n' ||
    '    FROM calc c WHERE c.id = s.id;' || E'\n\n' ||
    '  -- Ventas y existencia de cada pieza, para que la pantalla pueda decir' || E'\n' ||
    '  -- cual de los dos codigos conviene dejar vivo. En bloque, no uno por uno.' || E'\n' ||
    '  UPDATE public.producto_grupo_sugerencia_miembros m' || E'\n' ||
    '     SET ventas_180d = COALESCE((' || E'\n' ||
    '           SELECT sum(fd.cantidad) FROM public.facturas_detalle fd' || E'\n' ||
    '           JOIN public.facturas f ON f.id = fd.factura_id' || E'\n' ||
    '          WHERE fd.producto_id = m.producto_id AND fd.tenant_id = v_tenant' || E'\n' ||
    '            AND f.fecha >= current_date - 180' || E'\n' ||
    '            AND COALESCE(f.estado, '''') <> ''Anulada''), 0)' || E'\n' ||
    '   WHERE EXISTS (SELECT 1 FROM public.producto_grupo_sugerencias s' || E'\n' ||
    '                  WHERE s.id = m.sugerencia_id AND s.tenant_id = v_tenant' || E'\n' ||
    '                    AND s.estado = ''pendiente'');' || E'\n\n' ||
    '  UPDATE public.producto_grupo_sugerencia_miembros m' || E'\n' ||
    '     SET stock = COALESCE((SELECT sum(im.cantidad)' || E'\n' ||
    '                             FROM public.inventario_movimientos im' || E'\n' ||
    '                            WHERE im.producto_id = m.producto_id' || E'\n' ||
    '                              AND im.tenant_id = v_tenant), 0)' || E'\n' ||
    '   WHERE EXISTS (SELECT 1 FROM public.producto_grupo_sugerencias s' || E'\n' ||
    '                  WHERE s.id = m.sugerencia_id AND s.tenant_id = v_tenant' || E'\n' ||
    '                    AND s.estado = ''pendiente'');' || E'\n\n';

  v_nuevo := replace(v_def, v_ancla, v_paso || v_ancla);

  IF v_nuevo = v_def THEN
    RAISE EXCEPTION 'No se encontro donde injertar el paso: el motor cambio de forma.';
  END IF;

  EXECUTE v_nuevo;
END $injerto$;

-- ============================================================
-- La pantalla necesita saber de que tipo es cada propuesta
-- ============================================================
-- Cambia la forma de lo que devuelve, asi que hay que soltarla y rehacerla:
-- CREATE OR REPLACE no puede cambiar el tipo de retorno.
DROP FUNCTION IF EXISTS public.get_sugerencias_equivalentes(INT);

CREATE FUNCTION public.get_sugerencias_equivalentes(p_limite INT DEFAULT 200)
RETURNS TABLE (
  id            UUID,
  nombre        TEXT,
  tipo          TEXT,
  senal         TEXT,
  confianza     INT,
  grupo_id      UUID,
  grupo_nombre  TEXT,
  vendidas_180d NUMERIC,
  calculada_at  TIMESTAMPTZ,
  miembros      JSONB
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
  SELECT s.id, s.nombre, s.tipo, s.senal, s.confianza, s.grupo_id, g.nombre,
         s.vendidas_180d, s.calculada_at,
         (SELECT jsonb_agg(jsonb_build_object(
                   'producto_id', p.id,
                   'codigo',      p.codigo,
                   'descripcion', p.descripcion,
                   'marca',       ma.nombre,
                   'referencia',  p.referencia,
                   'precio',      p.precio,
                   'costo',       p.costo,
                   'ventas_180d', m.ventas_180d,
                   'stock',       m.stock,
                   'ya_en_grupo', m.ya_en_grupo
                 ) ORDER BY m.ventas_180d DESC, p.descripcion)
            FROM public.producto_grupo_sugerencia_miembros m
            JOIN public.productos p ON p.id = m.producto_id
            LEFT JOIN public.marcas ma ON ma.id = p.marca_id
           WHERE m.sugerencia_id = s.id) AS miembros
  FROM public.producto_grupo_sugerencias s
  LEFT JOIN public.producto_grupos g ON g.id = s.grupo_id
  WHERE s.tenant_id = public.get_user_tenant()
    AND s.estado = 'pendiente'
  ORDER BY (s.tipo = 'duplicado') DESC, s.vendidas_180d DESC, s.confianza DESC, s.nombre
  LIMIT COALESCE(p_limite, 200);
$fn$;

GRANT EXECUTE ON FUNCTION public.get_sugerencias_equivalentes(INT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- PRUEBA — fusionar de verdad y deshacerlo
-- ============================================================
-- Se prueba con las dos baterias reales dentro de una transaccion que NO se
-- confirma: si algo del camino esta mal, revienta aqui y no en la cara del
-- dueno.
DO $prueba$
DECLARE
  v_t    UUID := (SELECT tenant_id FROM public.productos
                   WHERE codigo IN ('G146', '569') GROUP BY tenant_id LIMIT 1);
  v_user UUID;
  v_new  UUID;
  v_old  UUID;
  v_res  JSONB;
  v_grupo_nuevo UUID;
  v_activo BOOLEAN;
BEGIN
  IF v_t IS NULL THEN
    RAISE NOTICE 'No estan las piezas de prueba. Funcion creada igual.';
    RETURN;
  END IF;

  SELECT id INTO v_new FROM public.productos WHERE tenant_id = v_t AND codigo = 'G146';
  SELECT id INTO v_old FROM public.productos WHERE tenant_id = v_t AND codigo = '569';
  SELECT p.id INTO v_user FROM public.profiles p
    JOIN public.usuario_tenant_activo a ON a.user_id = p.id AND a.tenant_id = p.tenant_id
   WHERE p.tenant_id = v_t LIMIT 1;

  IF v_new IS NULL OR v_old IS NULL OR v_user IS NULL THEN
    RAISE NOTICE 'Falta alguna pieza o usuario para la prueba. Funcion creada igual.';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- Se hace de verdad y se DESHACE: un bloque con EXCEPTION es una
  -- subtransaccion, asi que reventarlo a proposito borra todo lo que hizo.
  -- Las variables sobreviven (no son transaccionales), y con eso se revisa.
  BEGIN
    v_res := public.fusionar_productos(v_new, v_old);
    SELECT grupo_id INTO v_grupo_nuevo FROM public.producto_grupo_miembros WHERE producto_id = v_new;
    SELECT activo INTO v_activo FROM public.productos WHERE id = v_old;
    RAISE EXCEPTION 'DESHACER LA PRUEBA';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'DESHACER LA PRUEBA' THEN
      RESET ROLE;
      RAISE EXCEPTION 'La fusion de prueba fallo: %', SQLERRM;
    END IF;
  END;

  RESET ROLE;

  IF v_grupo_nuevo IS NULL THEN
    RAISE EXCEPTION 'La fusion no le paso el grupo al codigo nuevo.';
  END IF;

  IF v_activo IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'La fusion dejo activo el codigo viejo.';
  END IF;

  RAISE NOTICE 'Fusion probada y deshecha: %', v_res::text;
END $prueba$;
