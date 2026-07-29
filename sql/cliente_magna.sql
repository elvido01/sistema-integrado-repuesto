-- =====================================================================
-- MAGNA como cliente de CRÉDITO FISCAL de Repuestos Morla
-- ---------------------------------------------------------------------
-- (2026-07-29) Repuestos Morla es CENTRO DE SERVICIO AUTORIZADO por Magna
-- y le factura a Magna, no al dueño de la motocicleta. Magna no existía
-- como cliente: las cotizaciones se emitían y la factura había que armarla
-- a mano contra un cliente cualquiera.
--
-- >>> LO QUE DE VERDAD IMPORTA AQUÍ: tipo_ncf = '01' <<<
-- El motor toma el tipo de comprobante DEL CLIENTE:
--     const tipoNcf = finalCliente.tipo_ncf || '02';   (useVentas.js)
-- Un cliente normal nace con '02' (consumo final). Si Magna quedara en '02'
-- la factura NO usaría la secuencia B01 recién autorizada — y como Morla no
-- tiene ninguna secuencia '02', saldría sin NCF ninguno. Se le pone '01'
-- para que salga con FACTURA DE CRÉDITO FISCAL, que es lo que Magna
-- necesita para deducir.
--
-- >>> DATOS FISCALES DEL COMPRADOR <<<
--   MAGNA MOTORS, S. A.   RNC 101055571
-- Sin el RNC del comprador la factura de crédito fiscal no le sirve a Magna
-- para deducir, que es justamente para lo que la piden.
--
-- El RNC va SIN GUIONES, como los demás clientes de crédito fiscal de Morla
-- (PAPOLO MOTORS 132231015, HOTELES NACIONALES 101037849). Los guiones se
-- usan aquí solo en las cédulas de personas físicas.
--
-- Idempotente / re-ejecutable. Si el cliente ya existía se le completan RNC
-- y nombre solo cuando están vacíos, para no pisar una corrección manual.
-- =====================================================================

DO $$
DECLARE
  v_morla uuid := '00000000-0000-0000-0000-000000000001';
  v_id    uuid;
  v_cod   text;
BEGIN
  SELECT id INTO v_id FROM public.clientes
   WHERE tenant_id = v_morla AND nombre ILIKE '%magna%'
   LIMIT 1;

  IF v_id IS NULL THEN
    -- Código siguiente, para no chocar con la numeración que ya exista.
    -- El cast va DENTRO del MAX: sobre texto, '9' sería mayor que '10'.
    SELECT COALESCE(MAX(NULLIF(regexp_replace(COALESCE(codigo, ''), '\D', '', 'g'), '')::bigint), 0) + 1
      INTO v_cod
    FROM public.clientes WHERE tenant_id = v_morla;

    INSERT INTO public.clientes (tenant_id, codigo, nombre, rnc, tipo_ncf, activo)
    VALUES (v_morla, lpad(v_cod, 4, '0'), 'MAGNA MOTORS, S. A.', '101055571', '01', true)
    RETURNING id INTO v_id;
    RAISE NOTICE 'Cliente MAGNA MOTORS, S. A. creado — RNC 101055571, crédito fiscal.';
  ELSE
    -- Ya existía: se asegura el tipo de comprobante y se COMPLETAN los datos
    -- fiscales solo si están vacíos. Si alguien ya los corrigió a mano, su
    -- versión manda.
    UPDATE public.clientes
       SET tipo_ncf = '01',
           activo   = true,
           rnc      = COALESCE(NULLIF(btrim(COALESCE(rnc, '')), ''), '101055571'),
           nombre   = CASE WHEN btrim(nombre) IN ('MAGNA', 'Magna', 'magna')
                           THEN 'MAGNA MOTORS, S. A.' ELSE nombre END
     WHERE id = v_id;
    RAISE NOTICE 'Cliente Magna ya existía — tipo_ncf 01 y datos fiscales al día.';
  END IF;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('cliente_magna.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) El cliente y lo que le falta
SELECT codigo, nombre, tipo_ncf, rnc,
       CASE WHEN NULLIF(btrim(COALESCE(rnc, '')), '') IS NULL
            THEN '⚠ FALTA EL RNC — complétalo antes de facturar'
            ELSE 'listo' END AS situacion
FROM public.clientes
WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND nombre ILIKE '%magna%';
-- esperado: MAGNA MOTORS, S. A. | tipo_ncf 01 | 101055571 | listo

-- 2) Con qué NCF saldría su factura
SELECT c.nombre AS cliente, c.tipo_ncf,
       s.serie || s.tipo_ncf || lpad(
         (CASE WHEN s.ultimo_emitido < s.secuencia_desde THEN s.secuencia_desde
               ELSE s.ultimo_emitido + 1 END)::text, 8, '0') AS proximo_ncf,
       s.secuencia_hasta - GREATEST(s.ultimo_emitido, s.secuencia_desde - 1) AS restantes
FROM public.clientes c
JOIN public.secuencias_ncf s
  ON s.tenant_id = c.tenant_id AND s.tipo_ncf = c.tipo_ncf
 AND s.activo AND s.fecha_vencimiento >= CURRENT_DATE
WHERE c.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND c.nombre ILIKE '%magna%';
-- esperado: MAGNA MOTORS, S. A. | 01 | B0100000001 | 15 restantes
-- Si NO devuelve filas, falta correr sql/ncf_repuestos_morla.sql.

-- 3) Las dos cotizaciones pendientes y cómo quedarían facturadas
SELECT c.numero AS cotizacion, c.total AS total_cotizacion,
       COALESCE('Orden ' || d.numero_orden, 'Servicio')
         || COALESCE(' · ' || d.chasis, '') AS linea_en_la_factura,
       ROUND((d.valor_repuestos + d.valor_mano_obra) * 1.18, 2) AS precio
FROM public.cotizaciones_magna c
JOIN public.cotizaciones_magna_detalle d ON d.cotizacion_id = c.id
WHERE c.estado = 'Pendiente'
ORDER BY c.numero, d.created_at;
-- #1 (9,369.20): 3 líneas, una por orden de taller con su chasis
-- #2 (20,791.60): 1 línea "Orden 01 · APOYO PROMOCIONAL"
