-- =====================================================================
-- Bucket 'pagos' (comprobantes de transferencia de la suscripción) → PRIVADO
-- =====================================================================
-- (10/10/2026) Plan de comercialización. Los comprobantes se guardan como
-- comprobantes/<empresa>/<milisegundos>.<ext>: con el uuid de una empresa el
-- nombre se puede adivinar, y el bucket era público (cualquiera con el enlace
-- veía el comprobante: banco, cuenta, monto).
-- Ahora: privado. Lo ve el superadmin (revisión de pagos, que abre un enlace
-- firmado de 10 minutos: AdminPagosReview.jsx) y la propia empresa en su
-- carpeta. La subida no cambia (su política INSERT existente sigue igual).
--
-- 'whatsapp-media' se queda PÚBLICO a propósito: las rutas llevan el id de
-- Meta (largo y aleatorio, no se adivina) y Meta necesita descargar por URL
-- lo que se le envía a los clientes.
-- Deshacer: UPDATE storage.buckets SET public = true WHERE id = 'pagos';
-- =====================================================================

UPDATE storage.buckets SET public = false WHERE id = 'pagos';

DROP POLICY IF EXISTS pagos_comprobantes_leer ON storage.objects;
CREATE POLICY pagos_comprobantes_leer ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'pagos'
    AND (public.is_superadmin()
         OR (storage.foldername(name))[2] = public.get_user_tenant()::text)
  );

SELECT id, public FROM storage.buckets WHERE id IN ('pagos', 'whatsapp-media');

SELECT public.registrar_migracion('bucket_pagos_privado.sql');
