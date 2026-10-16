-- =====================================================================
-- CAMINERO MOTORS: SECUENCIAS e-NCF Y PASO A PRODUCCIÓN
-- =====================================================================
-- (16/10/2026) La DGII aprobó la solicitud 6010026192 (13/10/2026) de
-- MOTOPRESTAMOS LOS NARANJOS Y CAMINERO MOTORS SRL (RNC 119020036):
--   E31 Crédito fiscal   E310000000001 – E310000000040  vence 31/12/2027
--   E32 Consumo          E320000000001 – E320000000100  (sin vencimiento)
--   E33 Nota de débito   E330000000001 – E330000000020  vence 31/12/2027
--   E34 Nota de crédito  E340000000001 – E340000000040  (sin vencimiento)
-- La fecha de vencimiento solo va en el XML de E31/E33 (E32/E34 no la llevan),
-- por eso la config queda con 31-12-2027.
--
-- Solo toca el tenant de Caminero Motors (b39506c3). MotoPréstamos no envía
-- a la DGII (se le quitó el RNC a propósito).
--
-- FT-78 (14/10, antes de la autorización) quedó sin comprobante y cae dentro
-- de la ventana de 72 h de la cola de reintentos: se marca agotada para que
-- no salga hoy con un e-CF fechado hoy.
-- =====================================================================

DO $$
DECLARE
  v_cam constant uuid := 'b39506c3-27dc-467d-830b-096731b83113';
BEGIN
  INSERT INTO public.ecf_secuencias (tenant_id, tipo_ecf, serie, desde, hasta, ultimo, ambiente, activo)
  VALUES (v_cam, '31', 'E', 1,  40, 0, 'Produccion', true),
         (v_cam, '32', 'E', 1, 100, 0, 'Produccion', true),
         (v_cam, '33', 'E', 1,  20, 0, 'Produccion', true),
         (v_cam, '34', 'E', 1,  40, 0, 'Produccion', true)
  ON CONFLICT (tenant_id, tipo_ecf, serie, ambiente) DO UPDATE
     SET desde = EXCLUDED.desde,
         hasta = EXCLUDED.hasta,
         ultimo = greatest(ecf_secuencias.ultimo, EXCLUDED.desde - 1),
         activo = true,
         updated_at = now();

  UPDATE public.integraciones_fiscales
     SET modo = 'produccion',
         config = config || jsonb_build_object(
           'ambiente', 'Produccion',
           'fecha_vencimiento_secuencia', '31-12-2027',
           'callback_url', 'https://zdvxowpuklbypweyqqki.supabase.co/functions/v1/dgii-callback')
   WHERE tenant_id = v_cam AND proveedor = 'dgii_directo';
  IF NOT FOUND THEN RAISE EXCEPTION 'Caminero no tiene integración dgii_directo'; END IF;

  UPDATE public.documentos_fiscales d
     SET retry_count = 6,
         error_message = 'Venta anterior a la autorización de e-CF (16/10/2026): no se emite.',
         updated_at = now()
    FROM public.facturas f
   WHERE f.id = d.factura_id AND f.tenant_id = v_cam AND f.numero = 78
     AND d.tenant_id = v_cam AND d.estado <> 'emitido';
END $$;

SELECT public.registrar_migracion('caminero_ecf_produccion.sql');
