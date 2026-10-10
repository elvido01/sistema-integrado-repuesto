-- =====================================================================
-- DGII: índices únicos por EMPRESA + AMBIENTE, y reparar E310000000001
-- =====================================================================
-- (10/10/2026) La primera factura de crédito fiscal real de D Mario
-- (FT-0000005, E310000000001, RD$4,800) fue ACEPTADA por la DGII (verificado
-- con el QR), pero su registro quedó en 'procesando': el índice único
-- (tenant_id, encf) chocó con la fila de CERTIFICACIÓN de mayo que ya tenía
-- E310000000001. Certificación y producción numeran por separado: el índice
-- tiene que incluir el ambiente.
--
-- Mismo problema latente en track_id: los resúmenes de consumo se guardan
-- como 'RFCE-<eNCF>', sin empresa. Cuando otra empresa emita su propia
-- E320000000001, chocaría. Se incluyen empresa y ambiente.
-- =====================================================================

DROP INDEX IF EXISTS public.idx_documentos_fiscales_tenant_encf_unique;
CREATE UNIQUE INDEX idx_documentos_fiscales_tenant_encf_unique
    ON public.documentos_fiscales (tenant_id, ambiente, encf)
 WHERE encf IS NOT NULL;

DROP INDEX IF EXISTS public.idx_documentos_fiscales_track_id_unique;
CREATE UNIQUE INDEX idx_documentos_fiscales_track_id_unique
    ON public.documentos_fiscales (tenant_id, ambiente, track_id)
 WHERE track_id IS NOT NULL;

-- Reparar la venta FT-0000005 de D Mario (solo si sigue en 'procesando').
UPDATE public.documentos_fiscales d
   SET estado               = 'emitido',
       estado_dgii          = 'aceptado',
       ncf                  = 'E310000000001',
       encf                 = 'E310000000001',
       tipo_ecf             = '31',
       ambiente             = 'Produccion',
       proveedor_number     = 'E310000000001',
       xml_firmado_path     = '58c09df3-48c2-4a3e-bb3e-96997ccbbc8a/2026/10/E310000000001.xml',
       emitted_at           = '2026-10-10T19:40:15+00:00',
       updated_at           = now(),
       error_message        = 'Reparado 10/10: el update original chocó con el índice (tenant_id, encf) por la fila de certificación de mayo. Estado confirmado con el QR (ConsultaTimbre): Aceptado. TrackId no se conservó.',
       request_payload      = jsonb_build_object(
         'tipo_ecf', '31', 'ambiente', 'Produccion',
         'xml_path', '58c09df3-48c2-4a3e-bb3e-96997ccbbc8a/2026/10/E310000000001.xml',
         'codigo_seguridad', 'YULgkM',
         'impresion', jsonb_build_object(
           'encf', 'E310000000001', 'tipo_ecf', '31', 'ambiente', 'Produccion',
           'codigo_seguridad', 'YULgkM', 'fecha_firma', '10-10-2026 15:40:15',
           'fecha_emision', '10-10-2026', 'fecha_vencimiento', '31-12-2027',
           'monto_total', '4800.00', 'rnc_emisor', '133267772', 'rnc_comprador', '02800991560'))
  FROM public.facturas f
 WHERE f.id = d.factura_id
   AND f.tenant_id = '58c09df3-48c2-4a3e-bb3e-96997ccbbc8a'
   AND f.numero = 5
   AND d.tenant_id = '58c09df3-48c2-4a3e-bb3e-96997ccbbc8a'
   AND d.estado = 'procesando';

SELECT f.numero, f.ncf AS ncf_factura, d.estado, d.estado_dgii, d.encf, d.ambiente
  FROM public.documentos_fiscales d
  JOIN public.facturas f ON f.id = d.factura_id
 WHERE d.tenant_id = '58c09df3-48c2-4a3e-bb3e-96997ccbbc8a' AND f.numero IN (4, 5);

SELECT public.registrar_migracion('dgii_indices_por_ambiente_y_reparar_e31.sql');
