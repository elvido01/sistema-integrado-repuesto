-- =====================================================================
-- IMPORTAR CATÁLOGO (Excel/CSV) — para dar de alta clientes nuevos
-- =====================================================================
-- (11/10/2026) Plan de comercialización: una tienda nueva con miles de piezas
-- no tenía cómo cargarlas. "Importar existencias" (ajustar_inventario_batch)
-- solo ajusta artículos que ya existen. Esta función CREA el catálogo.
--
-- importar_catalogo(p_filas jsonb, p_actualizar boolean, p_simular boolean)
--   p_filas: [{codigo, descripcion, referencia, costo, precio, itbis,
--              existencia, ubicacion, min_stock, suplidor, marca, tipo}]
--   · Código obligatorio; descripción obligatoria para los NUEVOS.
--   · Código repetido en el archivo: manda la última línea.
--   · ITBIS: acepta 18 o 0.18 (se guarda 0.18); vacío = 18 %; 0 = exento.
--   · NUEVO: se crea; si trae existencia > 0, entra como movimiento ENTRADA
--     (referencia IMPORTACION_CATALOGO, al costo), igual que una compra.
--   · YA EXISTE: con p_actualizar, cambia descripción/referencia/costo/
--     precio/ITBIS/ubicación/mínimo/suplidor/marca/tipo que vengan llenos;
--     sin p_actualizar no se toca. Su existencia NUNCA se toca aquí (para
--     eso está "Importar existencias").
--   · Marca y tipo: se buscan por nombre en la empresa; si no existen se
--     crean. Suplidor: se busca por nombre; si no existe, se informa.
--   · p_simular: no escribe nada; devuelve qué haría.
-- Corre con los permisos del usuario (SECURITY INVOKER): la seguridad por
-- empresa se aplica sola. Devuelve un resumen con los errores por código.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.importar_catalogo(
  p_filas jsonb, p_actualizar boolean DEFAULT false, p_simular boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant      uuid := public.get_user_tenant();
  v_recibidas   int;
  v_nuevos      int := 0;
  v_actualiz    int := 0;
  v_sin_cambio  int := 0;
  v_con_exist   int := 0;
  v_errores     jsonb := '[]'::jsonb;
  v_sup_falta   text[];
  r             record;
  v_id          uuid;
  v_marca       uuid;
  v_tipo        uuid;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No hay empresa activa.';
  END IF;
  IF jsonb_typeof(p_filas) <> 'array' OR jsonb_array_length(p_filas) > 2000 THEN
    RAISE EXCEPTION 'Envía entre 1 y 2000 filas por vez.';
  END IF;

  DROP TABLE IF EXISTS _cat;  -- por si se llama dos veces en la misma transacción
  CREATE TEMP TABLE _cat ON COMMIT DROP AS
  WITH crudo AS (
    SELECT nullif(trim(x.codigo), '')                         AS codigo,
           nullif(trim(x.descripcion), '')                    AS descripcion,
           nullif(trim(x.referencia), '')                     AS referencia,
           x.costo, x.precio, x.itbis, x.existencia, x.min_stock,
           nullif(trim(x.ubicacion), '')                      AS ubicacion,
           nullif(trim(x.suplidor), '')                       AS suplidor,
           nullif(trim(x.marca), '')                          AS marca,
           nullif(trim(x.tipo), '')                           AS tipo,
           row_number() OVER ()                               AS orden
      FROM jsonb_to_recordset(p_filas) AS x(
        codigo text, descripcion text, referencia text, costo numeric, precio numeric,
        itbis numeric, existencia numeric, min_stock numeric, ubicacion text,
        suplidor text, marca text, tipo text)
  )
  SELECT DISTINCT ON (upper(codigo)) *
    FROM crudo
   WHERE codigo IS NOT NULL
   ORDER BY upper(codigo), orden DESC;

  SELECT count(*) INTO v_recibidas FROM _cat;

  -- Suplidores que no existen (se informan, no se crean)
  SELECT array_agg(DISTINCT c.suplidor) INTO v_sup_falta
    FROM _cat c
   WHERE c.suplidor IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM proveedores pv
                      WHERE pv.tenant_id = v_tenant AND upper(trim(pv.nombre)) = upper(c.suplidor));

  FOR r IN
    SELECT c.*,
           (SELECT p.id FROM productos p
             WHERE p.tenant_id = v_tenant AND (p.codigo = c.codigo OR upper(p.codigo) = upper(c.codigo))
             ORDER BY (p.codigo = c.codigo) DESC LIMIT 1)                                AS existente,
           (SELECT pv.id FROM proveedores pv
             WHERE pv.tenant_id = v_tenant AND upper(trim(pv.nombre)) = upper(c.suplidor)
             ORDER BY pv.id LIMIT 1)                                                      AS suplidor_id,
           CASE WHEN c.itbis IS NULL THEN 0.18
                WHEN c.itbis > 1 THEN round(c.itbis / 100, 4)
                ELSE c.itbis END                                                          AS itbis_pct
      FROM _cat c
     ORDER BY c.orden
  LOOP
    IF r.costo < 0 OR r.precio < 0 OR r.existencia < 0 OR r.itbis_pct NOT IN (0, 0.16, 0.18) THEN
      v_errores := v_errores || jsonb_build_object('codigo', r.codigo,
        'motivo', 'Costo, precio o existencia negativos, o ITBIS distinto de 0, 16 o 18');
      CONTINUE;
    END IF;

    IF r.existente IS NULL THEN
      IF r.descripcion IS NULL THEN
        v_errores := v_errores || jsonb_build_object('codigo', r.codigo, 'motivo', 'Producto nuevo sin descripción');
        CONTINUE;
      END IF;
      v_nuevos := v_nuevos + 1;
      IF coalesce(r.existencia, 0) > 0 THEN v_con_exist := v_con_exist + 1; END IF;
      CONTINUE WHEN p_simular;

      v_marca := NULL; v_tipo := NULL;
      IF r.marca IS NOT NULL THEN
        SELECT id INTO v_marca FROM marcas WHERE tenant_id = v_tenant AND upper(trim(nombre)) = upper(r.marca) ORDER BY id LIMIT 1;
        IF v_marca IS NULL THEN
          INSERT INTO marcas (nombre, activo, tenant_id) VALUES (r.marca, true, v_tenant) RETURNING id INTO v_marca;
        END IF;
      END IF;
      IF r.tipo IS NOT NULL THEN
        SELECT id INTO v_tipo FROM tipos_producto WHERE tenant_id = v_tenant AND upper(trim(nombre)) = upper(r.tipo) ORDER BY id LIMIT 1;
        IF v_tipo IS NULL THEN
          INSERT INTO tipos_producto (nombre, activo, tenant_id) VALUES (r.tipo, true, v_tenant) RETURNING id INTO v_tipo;
        END IF;
      END IF;

      INSERT INTO productos (codigo, descripcion, referencia, costo, precio, itbis_pct,
                             ubicacion, min_stock, suplidor_id, marca_id, tipo_id, tenant_id)
      VALUES (r.codigo, r.descripcion, r.referencia, coalesce(r.costo, 0), coalesce(r.precio, 0),
              r.itbis_pct, r.ubicacion, coalesce(r.min_stock, 0), r.suplidor_id, v_marca, v_tipo, v_tenant)
      RETURNING id INTO v_id;

      IF coalesce(r.existencia, 0) > 0 THEN
        INSERT INTO inventario_movimientos (producto_id, fecha, tipo, cantidad, costo_unitario,
                                            referencia_doc, usuario_id, tenant_id)
        VALUES (v_id, now(), 'ENTRADA', r.existencia, coalesce(r.costo, 0),
                'IMPORTACION_CATALOGO', auth.uid(), v_tenant);
      END IF;

    ELSIF p_actualizar THEN
      v_actualiz := v_actualiz + 1;
      CONTINUE WHEN p_simular;

      v_marca := NULL; v_tipo := NULL;
      IF r.marca IS NOT NULL THEN
        SELECT id INTO v_marca FROM marcas WHERE tenant_id = v_tenant AND upper(trim(nombre)) = upper(r.marca) ORDER BY id LIMIT 1;
        IF v_marca IS NULL THEN
          INSERT INTO marcas (nombre, activo, tenant_id) VALUES (r.marca, true, v_tenant) RETURNING id INTO v_marca;
        END IF;
      END IF;
      IF r.tipo IS NOT NULL THEN
        SELECT id INTO v_tipo FROM tipos_producto WHERE tenant_id = v_tenant AND upper(trim(nombre)) = upper(r.tipo) ORDER BY id LIMIT 1;
        IF v_tipo IS NULL THEN
          INSERT INTO tipos_producto (nombre, activo, tenant_id) VALUES (r.tipo, true, v_tenant) RETURNING id INTO v_tipo;
        END IF;
      END IF;

      UPDATE productos SET
        descripcion = coalesce(r.descripcion, descripcion),
        referencia  = coalesce(r.referencia, referencia),
        costo       = coalesce(r.costo, costo),
        precio      = coalesce(r.precio, precio),
        itbis_pct   = CASE WHEN r.itbis IS NULL THEN itbis_pct ELSE r.itbis_pct END,
        ubicacion   = coalesce(r.ubicacion, ubicacion),
        min_stock   = coalesce(r.min_stock, min_stock),
        suplidor_id = coalesce(r.suplidor_id, suplidor_id),
        marca_id    = coalesce(v_marca, marca_id),
        tipo_id     = coalesce(v_tipo, tipo_id),
        updated_at  = now()
      WHERE id = r.existente AND tenant_id = v_tenant;
    ELSE
      v_sin_cambio := v_sin_cambio + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'simulado', p_simular,
    'recibidas', v_recibidas,
    'nuevos', v_nuevos,
    'nuevos_con_existencia', v_con_exist,
    'actualizados', v_actualiz,
    'existentes_sin_tocar', v_sin_cambio,
    'errores', v_errores,
    'suplidores_no_encontrados', coalesce(to_jsonb(v_sup_falta), '[]'::jsonb));
END
$fn$;

REVOKE ALL ON FUNCTION public.importar_catalogo(jsonb, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_catalogo(jsonb, boolean, boolean) TO authenticated;

SELECT public.registrar_migracion('importar_catalogo.sql');
