-- =====================================================================
-- IMPORTAR CLIENTES (Excel/CSV) — para dar de alta clientes nuevos
-- =====================================================================
-- (11/10/2026) Compañera de importar_catalogo. Carga la cartera de clientes
-- de una empresa nueva: datos y condiciones de crédito.
--
-- importar_clientes(p_filas jsonb, p_actualizar boolean, p_simular boolean)
--   p_filas: [{codigo, nombre, rnc, direccion, telefono, email,
--              limite_credito, dias_credito, credito, tipo_ncf, precio_nivel}]
--   · Nombre obligatorio para los nuevos.
--   · ¿Ya existe? Por CÓDIGO si viene; si no, por RNC/cédula (solo dígitos).
--     Sin código ni RNC, siempre es nuevo (por nombre no se adivina: dos
--     "JUAN PEREZ" pueden ser personas distintas).
--   · Repetidos en el archivo (mismo código o mismo RNC): manda la última.
--   · Crédito: columna credito (si/no/1/0/true) o, si no viene, límite > 0.
--   · Comprobante: tipo_ncf 01/02; si no viene, 01 con RNC válido (9 u 11
--     dígitos), si no 02.
--   · Nivel de precio 1–3 (por defecto 1).
--   · YA EXISTE: con p_actualizar, cambia los datos que vengan llenos.
--   · p_simular: no escribe nada.
--
-- SIN BALANCES a propósito: lo que un cliente debe son facturas a crédito
-- con monto_pendiente. Crearlas como "saldo inicial" las contaría como
-- ventas del día, entrarían al 607 y la cola de e-CF intentaría emitirlas.
-- Los saldos iniciales necesitan su propio tipo de documento.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.importar_clientes(
  p_filas jsonb, p_actualizar boolean DEFAULT false, p_simular boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant     uuid := public.get_user_tenant();
  v_recibidas  int;
  v_nuevos     int := 0;
  v_actualiz   int := 0;
  v_sin_cambio int := 0;
  v_errores    jsonb := '[]'::jsonb;
  r            record;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No hay empresa activa.';
  END IF;
  IF jsonb_typeof(p_filas) <> 'array' OR jsonb_array_length(p_filas) > 2000 THEN
    RAISE EXCEPTION 'Envía entre 1 y 2000 filas por vez.';
  END IF;

  CREATE TEMP TABLE _cli ON COMMIT DROP AS
  WITH crudo AS (
    SELECT nullif(trim(x.codigo), '')                                   AS codigo,
           nullif(upper(trim(x.nombre)), '')                            AS nombre,
           nullif(regexp_replace(coalesce(x.rnc, ''), '\D', '', 'g'), '') AS rnc_digitos,
           nullif(trim(x.rnc), '')                                      AS rnc_texto,
           nullif(trim(x.direccion), '')                                AS direccion,
           nullif(trim(x.telefono), '')                                 AS telefono,
           nullif(lower(trim(x.email)), '')                             AS email,
           x.limite_credito, x.dias_credito::int AS dias_credito,
           CASE WHEN x.credito IS NULL OR trim(x.credito) = '' THEN NULL
                WHEN lower(trim(x.credito)) IN ('si','sí','s','1','true','x','yes') THEN true
                ELSE false END                                          AS credito,
           nullif(trim(x.tipo_ncf), '')                                 AS tipo_ncf,
           x.precio_nivel::int                                          AS precio_nivel,
           row_number() OVER ()                                         AS orden
      FROM jsonb_to_recordset(p_filas) AS x(
        codigo text, nombre text, rnc text, direccion text, telefono text, email text,
        limite_credito numeric, dias_credito numeric, credito text, tipo_ncf text, precio_nivel numeric)
  ),
  -- Repetidos por código, y luego por RNC: manda la última línea.
  por_codigo AS (
    SELECT DISTINCT ON (coalesce(upper(codigo), 'fila-' || orden)) *
      FROM crudo ORDER BY coalesce(upper(codigo), 'fila-' || orden), orden DESC
  )
  SELECT DISTINCT ON (coalesce(rnc_digitos, 'fila-' || orden)) *
    FROM por_codigo ORDER BY coalesce(rnc_digitos, 'fila-' || orden), orden DESC;

  SELECT count(*) INTO v_recibidas FROM _cli;

  FOR r IN
    SELECT c.*,
           coalesce(
             (SELECT k.id FROM clientes k WHERE k.tenant_id = v_tenant AND c.codigo IS NOT NULL
                AND upper(k.codigo) = upper(c.codigo) ORDER BY k.id LIMIT 1),
             (SELECT k.id FROM clientes k WHERE k.tenant_id = v_tenant AND c.rnc_digitos IS NOT NULL
                AND regexp_replace(coalesce(k.rnc, ''), '\D', '', 'g') = c.rnc_digitos ORDER BY k.id LIMIT 1)
           ) AS existente,
           CASE WHEN c.tipo_ncf IN ('01','02','14','15') THEN c.tipo_ncf
                WHEN c.tipo_ncf IS NOT NULL THEN NULL
                WHEN length(c.rnc_digitos) IN (9, 11) THEN '01' ELSE '02' END AS ncf_final
      FROM _cli c
     ORDER BY c.orden
  LOOP
    IF r.ncf_final IS NULL THEN
      v_errores := v_errores || jsonb_build_object('fila', coalesce(r.codigo, r.nombre), 'motivo', 'Tipo de comprobante debe ser 01, 02, 14 o 15');
      CONTINUE;
    END IF;
    IF coalesce(r.limite_credito, 0) < 0 OR coalesce(r.dias_credito, 0) < 0
       OR (r.precio_nivel IS NOT NULL AND r.precio_nivel NOT BETWEEN 1 AND 3) THEN
      v_errores := v_errores || jsonb_build_object('fila', coalesce(r.codigo, r.nombre), 'motivo', 'Límite o días negativos, o nivel de precio fuera de 1–3');
      CONTINUE;
    END IF;

    IF r.existente IS NULL THEN
      IF r.nombre IS NULL THEN
        v_errores := v_errores || jsonb_build_object('fila', coalesce(r.codigo, r.rnc_texto, '?'), 'motivo', 'Cliente nuevo sin nombre');
        CONTINUE;
      END IF;
      v_nuevos := v_nuevos + 1;
      CONTINUE WHEN p_simular;
      INSERT INTO clientes (codigo, nombre, rnc, direccion, telefono, email, limite_credito, dias_credito,
                            autorizar_credito, tipo_ncf, precio_nivel, tenant_id)
      VALUES (r.codigo, r.nombre, r.rnc_texto, r.direccion, r.telefono, r.email,
              coalesce(r.limite_credito, 0), coalesce(r.dias_credito, 0),
              coalesce(r.credito, coalesce(r.limite_credito, 0) > 0),
              r.ncf_final, coalesce(r.precio_nivel, 1), v_tenant);
    ELSIF p_actualizar THEN
      v_actualiz := v_actualiz + 1;
      CONTINUE WHEN p_simular;
      UPDATE clientes SET
        codigo            = coalesce(codigo, r.codigo),
        nombre            = coalesce(r.nombre, nombre),
        rnc               = coalesce(r.rnc_texto, rnc),
        direccion         = coalesce(r.direccion, direccion),
        telefono          = coalesce(r.telefono, telefono),
        email             = coalesce(r.email, email),
        limite_credito    = coalesce(r.limite_credito, limite_credito),
        dias_credito      = coalesce(r.dias_credito, dias_credito),
        autorizar_credito = coalesce(r.credito, autorizar_credito),
        tipo_ncf          = CASE WHEN r.tipo_ncf IS NOT NULL THEN r.ncf_final ELSE tipo_ncf END,
        precio_nivel      = coalesce(r.precio_nivel, precio_nivel),
        updated_at        = now()
      WHERE id = r.existente AND tenant_id = v_tenant;
    ELSE
      v_sin_cambio := v_sin_cambio + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'simulado', p_simular, 'recibidas', v_recibidas, 'nuevos', v_nuevos,
    'actualizados', v_actualiz, 'existentes_sin_tocar', v_sin_cambio, 'errores', v_errores);
END
$fn$;

REVOKE ALL ON FUNCTION public.importar_clientes(jsonb, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_clientes(jsonb, boolean, boolean) TO authenticated;

SELECT public.registrar_migracion('importar_clientes.sql');
