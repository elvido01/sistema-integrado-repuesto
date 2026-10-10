-- =====================================================================
-- MORLA: facturación electrónica APAGADA hasta que se certifique
-- =====================================================================
-- (10/10/2026) Decisión del dueño. La integración DGII Directo de Morla estaba
-- activa en modo pruebas (TesteCF, certificado de prueba auto-firmado y
-- vencido): cada venta intentaba emitir un e-CF por detrás y fallaba
-- (2,707 errores en documentos_fiscales). No afectaba al cliente, solo
-- llenaba el registro.
--
-- Con activo = false la venta deja de intentarlo (fiscalActivo = false en
-- SupabaseAuthContext). La configuración y el historial se quedan como están.
-- Para encenderla de nuevo: activo = true, cuando Morla tenga su certificado
-- real y termine la certificación.
-- =====================================================================

UPDATE public.integraciones_fiscales
   SET activo = false
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
   AND proveedor = 'dgii_directo';

SELECT public.registrar_migracion('morla_ecf_apagado_hasta_certificar.sql');
