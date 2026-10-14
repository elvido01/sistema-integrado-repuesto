-- =====================================================================
-- D MARIO · FT-6: VOLVER A EMITIR CON LA CÉDULA DE LA COMPRADORA
-- =====================================================================
-- (14/10/2026) FT-6 (RD$514,999, consumo) salió como E320000000002 a
-- "Cliente Genérico" y la DGII la rechazó: 1381 "RNCComprador ... es
-- obligatorio" (consumo de RD$250,000 o más exige identificar al comprador).
-- Ese número quedó gastado (secuenciaUtilizada).
--
-- La compradora es MARINA SANCHEZ RONDON, cédula 028-0061279-4 (foto de la
-- cédula enviada por el dueño). Es consumidora final: se crea como cliente
-- "02 Consumo", y emitir-fiscal (14/10) la emite como E32 llevando su cédula
-- como RNCComprador (tipoEcfDeCliente).
--
-- Qué hace:
--   1. Crea la clienta en D Mario (si ya existe con esa cédula, la usa).
--   2. Le pone la clienta a la FT-6 y le quita el número rechazado.
--   3. El intento rechazado pasa a 'anulado' (estado_dgii sigue 'rechazado'
--      como constancia); así no se reutiliza ese número.
-- Después: la cola de reintento (cada 5 min, ventas de menos de 72 h) la
-- emite sola con número nuevo (E320000000003). Hay que reimprimirla.
-- =====================================================================

BEGIN;

DO $$
DECLARE
  v_tenant  uuid := '58c09df3-48c2-4a3e-bb3e-96997ccbbc8a';  -- D MARIO
  v_factura uuid := '78899bc1-3881-4eda-b87b-4e8d2c50faf3';  -- FT-6
  v_cliente uuid;
  v_n       int;
BEGIN
  -- Seguro: la factura es la que creemos y sigue con el número rechazado
  IF NOT EXISTS (SELECT 1 FROM public.facturas
                  WHERE id = v_factura AND tenant_id = v_tenant AND numero = 6
                    AND ncf = 'E320000000002') THEN
    RAISE EXCEPTION 'La FT-6 de D Mario no está como se esperaba (ya se corrigió?). No se hizo nada.';
  END IF;

  SELECT id INTO v_cliente FROM public.clientes
   WHERE tenant_id = v_tenant AND regexp_replace(coalesce(rnc, ''), '\D', '', 'g') = '02800612794'
   ORDER BY id LIMIT 1;
  IF v_cliente IS NULL THEN
    INSERT INTO public.clientes (tenant_id, nombre, rnc, tipo_ncf, direccion)
    VALUES (v_tenant, 'MARINA SANCHEZ RONDON', '028-0061279-4', '02', 'MATACHALUPE, HIGUEY')
    RETURNING id INTO v_cliente;
  END IF;

  UPDATE public.facturas
     SET cliente_id = v_cliente, manual_cliente_nombre = NULL, ncf = NULL, updated_at = now()
   WHERE id = v_factura AND tenant_id = v_tenant;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'No se actualizó la factura (% filas).', v_n; END IF;

  UPDATE public.documentos_fiscales
     SET estado = 'anulado',
         error_message = 'Rechazado por la DGII (1381: falta RNCComprador). Reemitida con la cédula de la compradora.',
         updated_at = now()
   WHERE factura_id = v_factura AND encf = 'E320000000002';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'No se marcó el intento rechazado (% filas).', v_n; END IF;
END $$;

COMMIT;

SELECT f.numero, f.ncf, c.nombre, c.rnc, c.tipo_ncf
  FROM public.facturas f JOIN public.clientes c ON c.id = f.cliente_id
 WHERE f.id = '78899bc1-3881-4eda-b87b-4e8d2c50faf3';

SELECT public.registrar_migracion('dmario_ft6_reemitir_con_cedula.sql');
