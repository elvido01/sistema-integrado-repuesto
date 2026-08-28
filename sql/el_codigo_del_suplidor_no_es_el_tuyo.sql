-- =====================================================================
-- El código del suplidor no es el tuyo
-- ---------------------------------------------------------------------
-- (2026-08-28) La vista de "líneas que la IA no leyó" decía 62. Al ir a
-- arreglarlo, la premisa se cayó: de 39 facturas señaladas, solo 6 habían
-- guardado más líneas de las que la IA leyó. En las otras 33 la IA leyó
-- todas — lo que no coincidía era el CODIGO.
--
-- El caso que lo destapó, OC-0338. El texto crudo de la foto dice:
--
--   Y-5864 -> MOTOR ARRANQUE CG200 GRIS   @ 867.00 x 2 = 1,734
--   Y-9685 -> PUÑO MAGNESIO DORADO R1     @ 154.00 x 4 =   616
--   I-7191 -> PUÑO PRO TAPER NEW NEGRO/ROJO
--
-- Y el catálogo de la casa dice:
--
--   Y-5864 = PUÑO MAGNECIO DORADO R1
--   Y-9685 = PUÑO PROTAPER NEW NEGRO/ROJO
--   I-7191 = MOTOR DE ARRANQUE CG200 GRIS
--
-- Corridos una fila. La IA extrajo BIEN: los precios lo confirman —un
-- motor de arranque a 867 y un puño a 154 es lo razonable, al revés no—.
-- Lo que pasa es que el suplidor numera distinto que la casa, y el dueño
-- lo viene arreglando a mano factura tras factura.
--
-- >>> LO QUE SE HACE <<<
-- Aprender el par (suplidor, su código) -> nuestro producto. Una vez. La
-- próxima factura empareja sola en vez de mandar la línea al rojo.
--
-- >>> COMO SE SABE CUAL ES CUAL <<<
-- Por la descripción, no por la posición. Contar filas es lo que ya está
-- fallando; "MOTOR ARRANQUE CG200 GRIS RHINO" contra "MOTOR DE ARRANQUE
-- CG200 GRIS RHYNO" se parecen y eso no miente. Se usa similarity() de
-- pg_trgm con el listón alto (0.55) y solo entre líneas de la MISMA
-- factura que quedaron sueltas de los dos lados. Ante la duda no se
-- aprende: un mapeo equivocado manda la mercancía al producto que no es,
-- y eso es peor que teclear.
--
-- >>> Y LA VISTA DEJA DE EXAGERAR <<<
-- v_ocr_lineas_perdidas contaba como "no leída" cualquier línea guardada
-- cuyo código no estuviera en el JSON. Ahora solo cuenta las que además
-- NO aparecen en el texto crudo de la foto: esas sí se perdieron de
-- verdad. Un indicador que grita de más se deja de mirar en dos semanas.
--
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.compras_codigos_suplidor (
  id             bigserial PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  suplidor_id    uuid NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  codigo_suplidor text NOT NULL,
  producto_id    uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  descripcion_suplidor text,
  parecido       numeric,
  veces_visto    integer NOT NULL DEFAULT 1,
  aprendido_en   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS compras_codigos_suplidor_uq
  ON public.compras_codigos_suplidor (tenant_id, suplidor_id, upper(btrim(codigo_suplidor)));

ALTER TABLE public.compras_codigos_suplidor ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compras_codigos_suplidor_tenant ON public.compras_codigos_suplidor;
CREATE POLICY compras_codigos_suplidor_tenant ON public.compras_codigos_suplidor
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

-- ---------------------------------------------------------------------
-- Aprender los códigos de una compra ya guardada
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aprender_codigos_de_compra(p_compra_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid; v_suplidor uuid; v_json jsonb; v_n int := 0;
BEGIN
  SELECT c.tenant_id, c.suplidor_id, c.extracted_json::jsonb
    INTO v_tenant, v_suplidor, v_json
  FROM public.compras c WHERE c.id = p_compra_id;

  IF v_json IS NULL OR v_suplidor IS NULL THEN
    RETURN json_build_object('ok', true, 'aprendidos', 0);
  END IF;

  WITH ocr AS (
    SELECT upper(btrim(it ->> 'code')) AS cod, it ->> 'description' AS descr
    FROM jsonb_array_elements(v_json -> 'items') it
    WHERE COALESCE(btrim(it ->> 'code'), '') <> ''
      AND COALESCE(btrim(it ->> 'description'), '') <> ''
  ), guardado AS (
    SELECT DISTINCT p.id AS producto_id, upper(btrim(p.codigo)) AS cod, p.descripcion AS descr
    FROM public.compras_detalle d
    JOIN public.productos p ON p.id = d.producto_id
    WHERE d.compra_id = p_compra_id
  ), sueltos_ocr AS (
    -- Códigos que la IA leyó y que NO son de ningún producto guardado.
    SELECT o.* FROM ocr o
    WHERE NOT EXISTS (SELECT 1 FROM guardado g WHERE g.cod = o.cod)
  ), sueltos_nuestros AS (
    -- Productos guardados cuyo código NO salió en la factura.
    SELECT g.* FROM guardado g
    WHERE NOT EXISTS (SELECT 1 FROM ocr o WHERE o.cod = g.cod)
  ), candidatos AS (
    SELECT so.cod AS cod_suplidor, so.descr AS descr_suplidor,
           sn.producto_id, similarity(upper(so.descr), upper(sn.descr)) AS parecido,
           row_number() OVER (PARTITION BY so.cod
                              ORDER BY similarity(upper(so.descr), upper(sn.descr)) DESC) AS rn_cod,
           row_number() OVER (PARTITION BY sn.producto_id
                              ORDER BY similarity(upper(so.descr), upper(sn.descr)) DESC) AS rn_prod
    FROM sueltos_ocr so CROSS JOIN sueltos_nuestros sn
  )
  INSERT INTO public.compras_codigos_suplidor
    (tenant_id, suplidor_id, codigo_suplidor, producto_id, descripcion_suplidor, parecido)
  SELECT v_tenant, v_suplidor, c.cod_suplidor, c.producto_id,
         left(c.descr_suplidor, 200), round(c.parecido::numeric, 3)
  FROM candidatos c
  -- El liston alto, y ademas tiene que ser la mejor pareja EN LOS DOS
  -- SENTIDOS. Si dos lineas se parecen a la misma, no se aprende ninguna.
  WHERE c.parecido >= 0.55 AND c.rn_cod = 1 AND c.rn_prod = 1
  ON CONFLICT (tenant_id, suplidor_id, upper(btrim(codigo_suplidor))) DO UPDATE
    SET producto_id  = EXCLUDED.producto_id,
        parecido     = EXCLUDED.parecido,
        veces_visto  = compras_codigos_suplidor.veces_visto + 1,
        aprendido_en = now();

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN json_build_object('ok', true, 'aprendidos', v_n);
END $fn$;

REVOKE EXECUTE ON FUNCTION public.aprender_codigos_de_compra(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.aprender_codigos_de_compra(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- Lo que ya se sabe de este suplidor: su codigo -> nuestro producto
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_codigos_suplidor(p_suplidor_id uuid)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(json_object_agg(upper(btrim(e.codigo_suplidor)),
           json_build_object('producto_id', e.producto_id, 'codigo', p.codigo,
                             'descripcion', p.descripcion, 'costo', p.costo,
                             'itbis_pct', p.itbis_pct)), '{}'::json)
  FROM public.compras_codigos_suplidor e
  JOIN public.productos p ON p.id = e.producto_id
  WHERE e.tenant_id = public.get_user_tenant()
    AND e.suplidor_id = p_suplidor_id;
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_codigos_suplidor(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_codigos_suplidor(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- La vista deja de exagerar
-- ---------------------------------------------------------------------
-- Solo es "perdida" si el codigo TAMPOCO aparece en el texto crudo. Si
-- estaba en la foto y no en el JSON, eso es otra cosa (la IA lo solto) y
-- se cuenta aparte.
CREATE OR REPLACE VIEW public.v_ocr_lineas_perdidas AS
SELECT c.tenant_id, c.id AS compra_id, c.numero, c.fecha, c.suplidor_id,
       upper(btrim(p.codigo)) AS codigo, p.descripcion,
       d.cantidad, d.costo_unitario,
       CASE WHEN c.ocr_text IS NOT NULL
             AND upper(c.ocr_text) LIKE '%' || upper(btrim(p.codigo)) || '%'
            THEN 'la_ia_la_solto'      -- estaba en la foto, no en el JSON
            ELSE 'no_estaba_en_la_foto'
       END AS motivo
FROM public.compras c
JOIN public.compras_detalle d ON d.compra_id = c.id
JOIN public.productos p ON p.id = d.producto_id
WHERE c.extracted_json IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(c.extracted_json::jsonb -> 'items') it
    WHERE upper(btrim(it ->> 'code')) = upper(btrim(p.codigo)))
  -- Si ya sabemos que este producto es el codigo X de este suplidor, la
  -- linea no falta: solo venia con otro nombre.
  AND NOT EXISTS (
    SELECT 1 FROM public.compras_codigos_suplidor e
    WHERE e.tenant_id = c.tenant_id AND e.suplidor_id = c.suplidor_id
      AND e.producto_id = d.producto_id);

-- ---------------------------------------------------------------------
-- Aprender de las facturas que ya estaban guardadas
-- ---------------------------------------------------------------------
DO $backfill$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT id FROM public.compras
            WHERE extracted_json IS NOT NULL AND suplidor_id IS NOT NULL ORDER BY fecha
  LOOP
    PERFORM public.aprender_codigos_de_compra(r.id);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'Repasadas % compras', n;
END $backfill$;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('el_codigo_del_suplidor_no_es_el_tuyo.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT COALESCE(pr.nombre, '?') AS suplidor,
       count(*) AS codigos_suyos_aprendidos,
       round(avg(e.parecido), 2) AS parecido_medio
FROM public.compras_codigos_suplidor e
LEFT JOIN public.proveedores pr ON pr.id = e.suplidor_id
GROUP BY 1 ORDER BY 2 DESC LIMIT 10;
