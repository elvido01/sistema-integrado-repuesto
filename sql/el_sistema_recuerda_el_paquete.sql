-- =====================================================================
-- El sistema recuerda el paquete
-- ---------------------------------------------------------------------
-- (2026-08-28) El dueño preguntó si darle acceso a los agentes haría que
-- el OCR de compras mejorara. Se midieron sus 174 facturas guardadas —el
-- texto del OCR y el JSON extraído están al lado de las líneas finales
-- desde hace meses, y nadie los había leído— y la respuesta fue que no.
--
--   1,441 líneas leídas por la IA
--   1,414 emparejaron con un producto   (98.1%)
--   1,240 con el costo correcto de una  (91.4%)
--     117 costos corregidos a mano
--
-- De esos 117, CUARENTA Y OCHO no eran errores de nadie:
--
--   la factura dice   1 x TORNILLO 10 CAB (100PCS) @ 583.00
--   el dueño guarda   100 x @ 5.83
--
-- El OCR leyó bien. Lo que hace el dueño es abrir el paquete, y eso es un
-- paso de negocio que el sistema no conocía. Ningún agente iba a
-- "aprenderlo" nunca, porque la IA no se había equivocado.
--
-- Los tamaños son limpios y se repiten: 100, 12, 10, 25, 6, 20.
--
-- >>> POR QUE UNA TABLA NUEVA <<<
-- El primer intento se apoyó en producto_suplidor_equivalencias, que tiene
-- las columnas exactas y está vacía. No sirve: su suplidor_local_id apunta
-- por clave foránea a `suplidores_locales`, que es otro catálogo. Los
-- suplidores de compras viven en `proveedores`. Se veía igual y no lo era.
--
-- >>> POR QUE POR SUPLIDOR Y NO POR PRODUCTO <<<
-- El mismo tornillo puede venir suelto de uno y en caja de 100 de otro. La
-- caja es del suplidor, no de la pieza.
--
-- Idempotente. Se puede correr encima varias veces.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.compras_paquetes (
  id                   bigserial PRIMARY KEY,
  tenant_id            uuid NOT NULL,
  suplidor_id          uuid NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  codigo               text NOT NULL,
  producto_id          uuid REFERENCES public.productos(id) ON DELETE SET NULL,
  descripcion          text,
  -- Cuantas unidades trae un "1" de este suplidor. 100 = la factura dice 1
  -- y son 100 tornillos.
  unidades_por_paquete numeric NOT NULL CHECK (unidades_por_paquete > 1),
  veces_visto          integer NOT NULL DEFAULT 1,
  aprendido_en         timestamptz NOT NULL DEFAULT now()
);

-- La llave real: este suplidor, este codigo. Sin esto el mismo par se
-- guardaria dos veces y la busqueda devolveria cualquiera de los dos.
CREATE UNIQUE INDEX IF NOT EXISTS compras_paquetes_uq
  ON public.compras_paquetes (tenant_id, suplidor_id, upper(btrim(codigo)));

ALTER TABLE public.compras_paquetes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compras_paquetes_tenant ON public.compras_paquetes;
CREATE POLICY compras_paquetes_tenant ON public.compras_paquetes
  FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

-- ---------------------------------------------------------------------
-- Aprender de una compra ya guardada
-- ---------------------------------------------------------------------
-- Compara lo que el OCR leyo contra lo que quedo guardado. Solo anota
-- cuando las dos cuentas dan el MISMO numero:
--
--   cantidad_final / cantidad_ocr  ==  costo_ocr / costo_final
--
-- Esa coincidencia es la firma de abrir un paquete: si la cantidad se
-- multiplica por 100 y el costo se divide por 100, el importe de la linea
-- no cambia y el dinero cuadra. Cualquier otra diferencia es otra cosa
-- —un precio mal leido, una cantidad mal contada— y NO se aprende: meter
-- eso aqui seria ensenarle al sistema a repetir un error.
CREATE OR REPLACE FUNCTION public.aprender_paquetes_de_compra(p_compra_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant   uuid;
  v_suplidor uuid;
  v_json     jsonb;
  v_n        int := 0;
BEGIN
  SELECT c.tenant_id, c.suplidor_id, c.extracted_json::jsonb
    INTO v_tenant, v_suplidor, v_json
  FROM public.compras c WHERE c.id = p_compra_id;

  IF v_json IS NULL OR v_suplidor IS NULL THEN
    RETURN json_build_object('ok', true, 'aprendidos', 0, 'motivo', 'sin OCR o sin suplidor');
  END IF;

  WITH ocr AS (
    SELECT upper(btrim(it->>'code'))      AS cod,
           NULLIF(it->>'description','')  AS descr,
           (it->>'qty')::numeric          AS cant,
           (it->>'unit_cost')::numeric    AS costo
    FROM jsonb_array_elements(v_json->'items') it
    WHERE COALESCE(btrim(it->>'code'),'') <> ''
  ), fin AS (
    SELECT upper(btrim(p.codigo)) AS cod, d.cantidad, d.costo_unitario, d.producto_id
    FROM public.compras_detalle d
    JOIN public.productos p ON p.id = d.producto_id
    WHERE d.compra_id = p_compra_id
  ), paquetes AS (
    SELECT DISTINCT ON (o.cod)
           f.producto_id, o.cod, o.descr,
           round(f.cantidad / NULLIF(o.cant, 0)) AS mult
    FROM ocr o JOIN fin f ON f.cod = o.cod
    WHERE o.cant > 0 AND o.costo > 0 AND f.costo_unitario > 0
      AND f.cantidad / o.cant > 1.0001
      -- Las dos cuentas tienen que dar lo mismo. Ahi esta el candado.
      AND abs((f.cantidad / o.cant) - (o.costo / f.costo_unitario)) < 0.02
      -- Un paquete es un numero redondo. 1.17 no es una caja de nada.
      AND abs(round(f.cantidad / o.cant) - (f.cantidad / o.cant)) < 0.01
      AND f.cantidad / o.cant <= 1000
  )
  INSERT INTO public.compras_paquetes
    (tenant_id, suplidor_id, codigo, producto_id, descripcion,
     unidades_por_paquete, veces_visto, aprendido_en)
  SELECT v_tenant, v_suplidor, pq.cod, pq.producto_id, left(COALESCE(pq.descr,''), 200),
         pq.mult, 1, now()
  FROM paquetes pq
  ON CONFLICT (tenant_id, suplidor_id, upper(btrim(codigo))) DO UPDATE
    SET unidades_por_paquete = EXCLUDED.unidades_por_paquete,
        producto_id          = COALESCE(EXCLUDED.producto_id, compras_paquetes.producto_id),
        veces_visto          = compras_paquetes.veces_visto + 1,
        aprendido_en         = now();

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN json_build_object('ok', true, 'aprendidos', v_n);
END $fn$;

REVOKE EXECUTE ON FUNCTION public.aprender_paquetes_de_compra(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.aprender_paquetes_de_compra(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- Lo que ya se sabe de este suplidor
-- ---------------------------------------------------------------------
-- La pantalla de compras la llama UNA vez al recibir el OCR, con el
-- suplidor ya elegido, en vez de preguntar codigo por codigo.
CREATE OR REPLACE FUNCTION public.get_paquetes_suplidor(p_suplidor_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT COALESCE(json_object_agg(upper(btrim(e.codigo)), e.unidades_por_paquete), '{}'::json)
  FROM public.compras_paquetes e
  WHERE e.tenant_id = public.get_user_tenant()
    AND e.suplidor_id = p_suplidor_id;
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_paquetes_suplidor(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_paquetes_suplidor(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- Aprender de las 174 facturas que ya estaban guardadas
-- ---------------------------------------------------------------------
-- Esto es lo que hace que sirva HOY y no dentro de tres meses: las
-- lecciones ya estaban escritas, solo nadie las habia leido.
DO $backfill$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT id FROM public.compras
            WHERE extracted_json IS NOT NULL AND suplidor_id IS NOT NULL
            ORDER BY fecha
  LOOP
    PERFORM public.aprender_paquetes_de_compra(r.id);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'Repasadas % compras con OCR', n;
END $backfill$;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('el_sistema_recuerda_el_paquete.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Lo que aprendio de la historia, y de quien.
SELECT COALESCE(pr.nombre, '(sin suplidor)') AS suplidor,
       count(*)                              AS codigos_con_paquete,
       string_agg(DISTINCT e.unidades_por_paquete::text, ', ') AS tamanos
FROM public.compras_paquetes e
LEFT JOIN public.proveedores pr ON pr.id = e.suplidor_id
GROUP BY 1 ORDER BY 2 DESC;
