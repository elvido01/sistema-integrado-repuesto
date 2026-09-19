-- =====================================================================
-- EL FINANCIAMIENTO NACE ENGANCHADO A SU FACTURA (Y SE REPARA LO NACIDO SUELTO)
-- =====================================================================
-- El dueno pregunto el 18/09/2026 por que el pago de MotoPrestamos Los
-- Naranjos no le llega completo a Caminero Motors. Pago RD$59,000 y al
-- dealer le entraron RD$49,516.67.
--
-- >>> DE DONDE SALE LA DIFERENCIA <<<
-- sincronizar_pago_a_dealer no copia el monto del pago: lo reconstruye
-- linea por linea, y solo pasa las CxP que tienen enganchada la factura
-- del dealer (compras.factura_dealer_id). Lo que no viene de un
-- financiamiento se queda fuera A PROPOSITO. Ese filtro esta bien.
--
-- Lo que esta mal es que la etiqueta dejo de ponerse. El 20/08/2026
-- (commit 63dfccd0) se creo la columna, se relleno HACIA ATRAS de una sola
-- vez con enlace_compra_factura_dealer.sql y se escribio el lector que
-- mueve el dinero -- pero nadie toco la funcion que CREA las CxP. En
-- produccion, hasta hoy, NINGUNA funcion escribia esa columna: la unica
-- que la nombraba, sincronizar_pago_a_dealer, solo la lee.
--
-- El corte tiene hora:
--     ultima CxP enganchada     20/08/2026 20:25   (FIN-000023)
--     el relleno de una vez     20/08/2026 21:11
--     primera CxP huerfana      21/08/2026 21:45   (FIN-000024)
-- FIN-000001 a FIN-000023: 100% enganchadas. FIN-000024 a FIN-000047:
-- 100% sueltas. Ni un caso mezclado a ninguno de los dos lados.
--
-- Hoy son 256 CxP por RD$2,086,760.94, de las cuales RD$2,063,929.22
-- siguen SIN PAGAR: cada peso que se pague contra ellas se pierde igual.
--
-- >>> QUE HACE <<<
-- 1. PARCHEA LA FUNCION VIVA procesar_financiamiento_terceros para que sus
--    dos INSERT (las cuotas y el adicional -AD) escriban factura_dealer_id
--    = fac.id, que es la factura del dealer que la propia funcion ya leyo
--    (SELECT ... INTO fac FROM facturas WHERE id = p_factura_id AND
--    tenant_id = v_dealer). Se parte de la definicion VIVA, no del repo:
--    tres archivos tocaron esa funcion y solo el ultimo refleja lo que
--    corre. Se reemplaza con la MISMA firma (uuid, uuid, uuid): cambiarla
--    crearia una sobrecarga y la llamada reventaria con "is not unique".
-- 2. RELLENA las 256 huerfanas con el MISMO criterio del 20/08: se saca el
--    numero de factura del texto de la referencia y se busca en el dealer
--    (la empresa cuyo config_empresa.financiera_tenant_id apunta a la
--    financiera dueña de la CxP). Sin ese ancla se podria enganchar la
--    factura #12 de otra empresa cualquiera.
--
-- >>> POR QUE ENGANCHAR NO ABONA DE MAS <<<
-- Comprobado antes de correr esto, en los 24 grupos: la suma de las CxP es
-- IGUAL AL CENTAVO al pendiente de su factura (diferencia 0.00 en los 24),
-- las 256 son del mismo cliente (el cliente financiera del dealer) y
-- ninguna de esas facturas ha recibido todavia un peso de la financiera.
-- La CxP lleva CAPITAL PELADO: el interes se queda en MotoPrestamos y no
-- entra aqui. El cargo -AD es el completivo del inicial y ya esta DENTRO
-- del pendiente de la factura (factura 39: 87,600 = 77,600 + 10,000).
-- Esa igualdad se vuelve a comprobar aqui abajo y revienta si no da.
--
-- Idempotente: solo toca filas con la etiqueta vacia, y si la funcion ya
-- engancha no la vuelve a parchear.
--
-- El dinero ya pagado que no llego se repone aparte, en
-- los_pagos_perdidos_llegan_al_dealer.sql. Este archivo NO crea recibos.
-- =====================================================================

SELECT public.registrar_migracion('el_financiamiento_nace_enganchado.sql');

-- ------------------------------------------------------------
-- 1. QUE LAS NUEVAS NAZCAN ENGANCHADAS
-- ------------------------------------------------------------
DO $parche$
DECLARE
  v_src  text;
  v_new  text;
  v_n    int;
BEGIN
  v_src := pg_get_functiondef('public.procesar_financiamiento_terceros(uuid,uuid,uuid)'::regprocedure);

  IF position('factura_dealer_id' in v_src) > 0 THEN
    RAISE NOTICE 'La funcion ya engancha: no se toca';
    RETURN;
  END IF;

  -- La columna, en los DOS INSERT de compras (cuotas y adicional).
  v_n := (length(v_src) - length(replace(v_src, 'INSERT INTO public.compras (', '')))
         / length('INSERT INTO public.compras (');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Esperaba 2 INSERT INTO public.compras en la funcion y encontre %', v_n;
  END IF;
  v_new := replace(v_src,
             'INSERT INTO public.compras (',
             'INSERT INTO public.compras (factura_dealer_id, ');

  -- El valor, en el INSERT de las cuotas.
  v_n := (length(v_new) - length(replace(v_new, 'v_fin, v_compra_num || CASE WHEN v_agrupa_mes', '')))
         / length('v_fin, v_compra_num || CASE WHEN v_agrupa_mes');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'El INSERT de las cuotas no aparece una sola vez (aparece % veces)', v_n;
  END IF;
  v_new := replace(v_new,
             'v_fin, v_compra_num || CASE WHEN v_agrupa_mes',
             'fac.id, v_fin, v_compra_num || CASE WHEN v_agrupa_mes');

  -- El valor, en el INSERT del adicional.
  v_n := (length(v_new) - length(replace(v_new, 'v_fin, v_compra_num || ''-AD'', current_date, v_prov,', '')))
         / length('v_fin, v_compra_num || ''-AD'', current_date, v_prov,');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'El INSERT del adicional no aparece una sola vez (aparece % veces)', v_n;
  END IF;
  v_new := replace(v_new,
             'v_fin, v_compra_num || ''-AD'', current_date, v_prov,',
             'fac.id, v_fin, v_compra_num || ''-AD'', current_date, v_prov,');

  EXECUTE v_new;
END $parche$;

-- ------------------------------------------------------------
-- 2. RELLENO DE LAS QUE NACIERON SUELTAS
-- ------------------------------------------------------------
-- Se guarda lo enganchado en esta corrida para poder probar, abajo, que
-- cada factura cuadra al centavo con sus cuotas.
CREATE TEMP TABLE _enganchadas ON COMMIT DROP AS
WITH upd AS (
  UPDATE public.compras c
     SET factura_dealer_id = f.id
    FROM public.config_empresa ce
    JOIN public.facturas f ON f.tenant_id = ce.tenant_id
   WHERE c.factura_dealer_id IS NULL
     AND c.referencia ~ 'Financiamiento factura #[0-9]+'
     AND ce.financiera_tenant_id = c.tenant_id
     AND ce.tenant_id <> c.tenant_id
     AND f.numero::text = (regexp_match(c.referencia, 'Financiamiento factura #([0-9]+)'))[1]
  RETURNING c.id, c.tenant_id, c.total_compra, f.id AS factura_id
)
SELECT * FROM upd;

DO $prueba$
DECLARE
  v_sueltas    int;
  v_ajenas     int;
  v_descuadre  int;
  v_filas      int;
  v_monto      numeric;
  v_src        text;
  v_n          int;
BEGIN
  -- a) La funcion tiene que escribir la etiqueta en sus DOS INSERT.
  v_src := pg_get_functiondef('public.procesar_financiamiento_terceros(uuid,uuid,uuid)'::regprocedure);
  v_n := (length(v_src) - length(replace(v_src, 'INSERT INTO public.compras (factura_dealer_id, ', '')))
         / length('INSERT INTO public.compras (factura_dealer_id, ');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'La funcion no quedo enganchando en sus 2 INSERT (quedo en %)', v_n;
  END IF;
  v_n := (length(v_src) - length(replace(v_src, 'fac.id, v_fin,', ''))) / length('fac.id, v_fin,');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'La funcion no pasa fac.id en sus 2 INSERT (lo pasa % veces)', v_n;
  END IF;

  -- b) No puede quedar ni una CxP de financiamiento sin su factura.
  SELECT count(*) INTO v_sueltas
    FROM public.compras c
   WHERE c.factura_dealer_id IS NULL
     AND c.referencia ~ 'Financiamiento factura #[0-9]+';
  IF v_sueltas > 0 THEN
    RAISE EXCEPTION 'Quedan % CxP de financiamiento sin factura enganchada', v_sueltas;
  END IF;

  -- c) Ninguna puede apuntar a una factura que no sea del dealer de SU financiera.
  SELECT count(*) INTO v_ajenas
    FROM public.compras c
    JOIN public.facturas f ON f.id = c.factura_dealer_id
   WHERE c.factura_dealer_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.config_empresa ce
        WHERE ce.tenant_id = f.tenant_id
          AND ce.financiera_tenant_id = c.tenant_id);
  IF v_ajenas > 0 THEN
    RAISE EXCEPTION '% CxP quedaron apuntando a la factura de una empresa que no es su dealer', v_ajenas;
  END IF;

  -- d) LA QUE DE VERDAD PROTEGE: por cada factura enganchada en esta
  --    corrida, la suma de sus cuotas tiene que dar exactamente su
  --    pendiente. Si el emparejamiento estuviera mal, esto no daria.
  SELECT count(*) INTO v_descuadre FROM (
    SELECT e.factura_id
      FROM _enganchadas e
      JOIN public.facturas f ON f.id = e.factura_id
     GROUP BY e.factura_id
    HAVING round(sum(e.total_compra) - max(f.monto_pendiente), 2) <> 0
  ) x;
  IF v_descuadre > 0 THEN
    RAISE EXCEPTION 'En % factura(s) la suma de las cuotas no cuadra con su pendiente', v_descuadre;
  END IF;

  SELECT count(*), COALESCE(sum(total_compra), 0) INTO v_filas, v_monto FROM _enganchadas;
  RAISE NOTICE 'Enganchadas % CxP por RD$%', v_filas, v_monto;
END $prueba$;

NOTIFY pgrst, 'reload schema';

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  count(*) FILTER (WHERE referencia ~ 'Financiamiento factura #[0-9]+')                                   AS con_texto,
  count(*) FILTER (WHERE referencia ~ 'Financiamiento factura #[0-9]+' AND factura_dealer_id IS NOT NULL) AS enganchadas,
  count(*) FILTER (WHERE referencia ~ 'Financiamiento factura #[0-9]+' AND factura_dealer_id IS NULL)     AS sueltas,
  CASE WHEN count(*) FILTER (WHERE referencia ~ 'Financiamiento factura #[0-9]+' AND factura_dealer_id IS NULL) = 0
       THEN 'OK  todas tienen su factura'
       ELSE 'REVISAR: hay CxP de financiamiento sin factura' END                                          AS estado,
  CASE WHEN position('factura_dealer_id' in
         pg_get_functiondef('public.procesar_financiamiento_terceros(uuid,uuid,uuid)'::regprocedure)) > 0
       THEN 'OK  las nuevas nacen enganchadas'
       ELSE 'FALLO: la funcion sigue sin enganchar' END                                                   AS creacion
FROM public.compras;
