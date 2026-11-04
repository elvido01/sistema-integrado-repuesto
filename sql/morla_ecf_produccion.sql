-- =====================================================================
-- REPUESTOS MORLA: PASO A PRODUCCIÓN DEL e-CF (web y app móvil)
-- =====================================================================
-- (04/11/2026) Morla (tenant ...0001, emisor ELVIDO MANUEL CAMINERO MORLA,
-- cédula 02800991560) ya está certificada y sus secuencias de producción
-- están cargadas desde el 31/10 (E31 1-15, E32 1-600, E33 1-10, E34 1-10,
-- vencen 31/12/2027; ninguna usada todavía).
--
-- Pruebas hechas ANTES de esto (sin gastar números):
--   1. Autenticación con la DGII de PRODUCCIÓN con el certificado de Morla
--      (DigiFirma, vence 28/10/2027): token OK.
--   2. Firma de 7 ventas reales (consumo genérico, con descuento, línea
--      exenta, la más grande, cliente con cédula, cliente con RNC = E31,
--      Caminero como cliente): todas firmadas.
--   3. Las 7 validan contra los XSD oficiales e-CF 31/32 de la DGII.
--   4. Los 6 resúmenes de consumo (RFCE) validan contra el XSD RFCE 32.
--
-- La web y la app móvil leen esta misma integración: al pasar a
-- 'produccion' las dos esperan el e-NCF e imprimen el QR.
--
-- Las ventas hechas ANTES de esto se quedan sin comprobante: se marcan con
-- los 6 intentos agotados para que la cola de reintentos (ventana de 72 h)
-- no les ponga hoy un e-NCF a ventas que ya se entregaron.
--
-- Para VOLVER atrás: modo 'pruebas' y config.ambiente 'CerteCF'.
-- =====================================================================

DO $$
DECLARE
  v_morla constant uuid := '00000000-0000-0000-0000-000000000001';
  v_n int;
BEGIN
  -- Las secuencias de producción tienen que estar (cargadas el 31/10).
  SELECT count(*) INTO v_n FROM public.ecf_secuencias
   WHERE tenant_id = v_morla AND ambiente = 'Produccion' AND activo AND tipo_ecf IN ('31','32','34');
  IF v_n < 3 THEN RAISE EXCEPTION 'Faltan secuencias de producción de Morla (hay %)', v_n; END IF;

  -- 1) Ventas anteriores: que la cola no las emita.
  UPDATE public.documentos_fiscales d
     SET retry_count = 6,
         error_message = 'Venta anterior al paso a producción del e-CF (04/11/2026): no se emite.',
         updated_at = now()
    FROM public.facturas f
   WHERE f.id = d.factura_id
     AND f.tenant_id = v_morla
     AND d.tenant_id = v_morla
     AND f.ncf IS NULL
     AND f.created_at >= now() - interval '5 days'
     AND d.estado <> 'emitido';

  -- 2) Encender producción.
  UPDATE public.integraciones_fiscales
     SET activo = true,
         modo = 'produccion',
         config = config || jsonb_build_object(
           'ambiente', 'Produccion',
           'fecha_vencimiento_secuencia', '31-12-2027',
           'callback_url', 'https://zdvxowpuklbypweyqqki.supabase.co/functions/v1/dgii-callback'),
         updated_at = now()
   WHERE tenant_id = v_morla AND proveedor = 'dgii_directo';
  IF NOT FOUND THEN RAISE EXCEPTION 'Morla no tiene integración dgii_directo'; END IF;
END $$;

SELECT public.registrar_migracion('morla_ecf_produccion.sql');

-- VERIFICACION: produccion | Produccion | 31-12-2027 | ventas_sin_tocar_por_la_cola = 0
SELECT i.modo, i.config->>'ambiente' AS ambiente, i.config->>'fecha_vencimiento_secuencia' AS vence,
       (SELECT count(*) FROM public.facturas f
          JOIN public.documentos_fiscales d ON d.factura_id = f.id
         WHERE f.tenant_id = i.tenant_id AND f.ncf IS NULL
           AND f.created_at >= now() - interval '72 hours'
           AND d.estado <> 'emitido' AND d.retry_count < 6) AS ventas_sin_tocar_por_la_cola
  FROM public.integraciones_fiscales i
 WHERE i.tenant_id = '00000000-0000-0000-0000-000000000001' AND i.proveedor = 'dgii_directo';
