-- =====================================================================
-- D MARIO: reparar el registro fiscal de su PRIMER e-CF real (E320000000001)
-- =====================================================================
-- (10/10/2026) Venta FT-0000004 (RD$1,300). La DGII la ACEPTÓ (confirmado en
-- ConsultaTimbreFC: "Estado Aceptado"), pero el registro en
-- documentos_fiscales quedó en 'procesando' y sin e-NCF: la DGII contestó
-- "Aceptado" y el CHECK de estado_dgii solo admite 'aceptado'; el update
-- falló callado. El código ya normaliza el estado y revisa el error.
--
-- Esto lo deja como emitido/aceptado y con los datos de la representación
-- impresa (para reimprimir con QR desde el historial). Solo toca esa fila,
-- y solo si sigue en 'procesando'.
-- =====================================================================

UPDATE public.documentos_fiscales
   SET estado               = 'emitido',
       estado_dgii          = 'aceptado',
       ncf                  = 'E320000000001',
       encf                 = 'E320000000001',
       tipo_ecf             = '32',
       ambiente             = 'Produccion',
       proveedor_invoice_id = 'RFCE-E320000000001',
       proveedor_number     = 'E320000000001',
       track_id             = 'RFCE-E320000000001',
       xml_firmado_path     = '58c09df3-48c2-4a3e-bb3e-96997ccbbc8a/2026/10/E320000000001.xml',
       emitted_at           = '2026-10-10T18:57:31+00:00',
       updated_at           = now(),
       error_message        = 'Reparado 10/10: el update original chocó con el CHECK de estado_dgii (''Aceptado''). Estado confirmado en ConsultaTimbreFC: Aceptado.',
       request_payload      = jsonb_build_object(
         'tipo_ecf', '32', 'ambiente', 'Produccion', 'via', 'rfce',
         'xml_path', '58c09df3-48c2-4a3e-bb3e-96997ccbbc8a/2026/10/E320000000001.xml',
         'codigo_seguridad', 'HjhYq1',
         'impresion', jsonb_build_object(
           'encf', 'E320000000001', 'tipo_ecf', '32', 'ambiente', 'Produccion',
           'codigo_seguridad', 'HjhYq1', 'fecha_firma', '10-10-2026 14:57:30',
           'fecha_emision', '10-10-2026', 'fecha_vencimiento', null,
           'monto_total', '1299.99', 'rnc_emisor', '133267772', 'rnc_comprador', null))
 WHERE id = '6966ce9d-858b-4ca3-bb88-dffb3f48c90b'
   AND tenant_id = '58c09df3-48c2-4a3e-bb3e-96997ccbbc8a'
   AND estado = 'procesando';

SELECT estado, estado_dgii, encf FROM public.documentos_fiscales
 WHERE id = '6966ce9d-858b-4ca3-bb88-dffb3f48c90b';

SELECT public.registrar_migracion('dmario_reparar_e320000000001.sql');
