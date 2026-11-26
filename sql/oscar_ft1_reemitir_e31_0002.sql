-- =====================================================================
-- OSCAR ARISTY RICHIEZ · FT-1: REEMITIR CON EL SIGUIENTE e-NCF (26/11/2026)
-- =====================================================================
-- E310000000001 (AMSTAR DMC, RD$717.77) fue rechazado por la DGII: 145
-- "Fecha de vencimiento de secuencia inválida" (config decía 31-12-2026; el
-- dueño ya la corrigió a 31-12-2027). Un e-NCF rechazado no se reenvía (la
-- DGII devuelve el TrackId viejo): se emite con el siguiente.
-- El dueño pidió reemitirla ("remítela por mí"). Sin sesión del usuario ni
-- llave de servidor, se usa la cola de reintento (cron cada 5 min, ventas
-- de menos de 72 h sin comprobante), igual que D Mario FT-6:
--   1. La FT-1 queda sin ncf → la cola la emite con E310000000002.
--   2. La fila rechazada pasa a 'anulado' (estado_dgii sigue 'rechazado'
--      como constancia) para que no se reutilice su número.
-- FALTA: dar de baja E310000000001 ante la DGII (ANECF) desde Monitor DGII
-- (la DGII dijo secuenciaUtilizada=false, así que se puede anular).
-- =====================================================================

DO $$
DECLARE
  v_tenant  uuid := 'c7cc095d-3bc4-4704-8abe-a6651ff73e23';
  v_factura uuid := '8d04b0a7-dc76-4e3f-8dad-7b6637ef8637';
  v_n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.facturas WHERE id = v_factura AND tenant_id = v_tenant AND numero = 1 AND ncf = 'E310000000001') THEN
    RAISE EXCEPTION 'La FT-1 de Oscar no está como se esperaba (¿ya se reemitió?). No se hizo nada.';
  END IF;
  IF (SELECT config->>'fecha_vencimiento_secuencia' FROM public.integraciones_fiscales WHERE tenant_id = v_tenant AND proveedor = 'dgii_directo') <> '31-12-2027' THEN
    RAISE EXCEPTION 'El vencimiento de secuencia no es 31-12-2027: se volvería a rechazar.';
  END IF;

  UPDATE public.documentos_fiscales
     SET estado = 'anulado',
         error_message = 'Rechazado por la DGII (145: vencimiento de secuencia 31-12-2026). Reemitida con el siguiente e-NCF. FALTA dar de baja E310000000001 ante la DGII (ANECF) desde Monitor DGII.',
         updated_at = now()
   WHERE factura_id = v_factura AND tenant_id = v_tenant AND encf = 'E310000000001'
     AND estado = 'emitido' AND estado_dgii = 'rechazado';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'No se marcó el intento rechazado (% filas).', v_n; END IF;

  UPDATE public.facturas SET ncf = NULL, updated_at = now()
   WHERE id = v_factura AND tenant_id = v_tenant;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION 'No se soltó el número de la factura (% filas).', v_n; END IF;
END $$;

SELECT public.registrar_migracion('oscar_ft1_reemitir_e31_0002.sql');
