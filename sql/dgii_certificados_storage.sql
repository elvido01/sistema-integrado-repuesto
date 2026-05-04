-- ============================================================
-- Storage bucket para certificados digitales .p12 (DGII directo)
-- ============================================================
-- Crea un bucket privado en Supabase Storage donde cada tenant
-- sube su certificado .p12 emitido por una CA autorizada en RD
-- (DigiFirma, Camara TIC, ProCert, Avansi, Indotel).
--
-- Convencion de path:
--   <tenant_id>/certificado.p12
--
-- El bucket NO es publico. Solo el rol service_role (la edge
-- function emitir-fiscal) y el propio usuario del tenant pueden
-- accederlo. El .p12 ya esta cifrado en disco por Supabase
-- (server-side encryption); ademas el password se guarda
-- cifrado en integraciones_fiscales.config.
-- ============================================================

-- 1. Crear bucket privado
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'certificados-dgii',
  'certificados-dgii',
  false,
  10 * 1024 * 1024,  -- 10 MB max (un .p12 real son <50 KB pero damos margen)
  ARRAY[
    'application/x-pkcs12',
    'application/pkcs12',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 10 * 1024 * 1024;

-- 2. Politicas RLS sobre storage.objects para este bucket
-- ------------------------------------------------------------
-- Solo el usuario del tenant puede subir/leer/borrar SU propio
-- certificado. service_role bypassa RLS asi que la edge function
-- siempre puede leer.

DROP POLICY IF EXISTS "tenant_subir_certificado_dgii" ON storage.objects;
DROP POLICY IF EXISTS "tenant_leer_certificado_dgii" ON storage.objects;
DROP POLICY IF EXISTS "tenant_borrar_certificado_dgii" ON storage.objects;
DROP POLICY IF EXISTS "tenant_actualizar_certificado_dgii" ON storage.objects;

-- INSERT (subir)
CREATE POLICY "tenant_subir_certificado_dgii"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'certificados-dgii'
  AND (storage.foldername(name))[1]::uuid = public.get_user_tenant()
);

-- SELECT (leer)
CREATE POLICY "tenant_leer_certificado_dgii"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'certificados-dgii'
  AND (storage.foldername(name))[1]::uuid = public.get_user_tenant()
);

-- UPDATE (reemplazar al renovar)
CREATE POLICY "tenant_actualizar_certificado_dgii"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'certificados-dgii'
  AND (storage.foldername(name))[1]::uuid = public.get_user_tenant()
);

-- DELETE (borrar)
CREATE POLICY "tenant_borrar_certificado_dgii"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'certificados-dgii'
  AND (storage.foldername(name))[1]::uuid = public.get_user_tenant()
);

-- 3. Asegurar que integraciones_fiscales tenga las columnas
--    que el adapter dgii_directo necesita en su `config` JSONB.
--    No se agregan columnas sueltas: todo va en config.
--
--    Forma esperada de config para proveedor='dgii_directo':
--    {
--      "rnc_emisor":             "1-30-12345-6",
--      "nombre_emisor":          "REPUESTOS MORLA SRL",
--      "ambiente":               "TesteCF" | "CerteCF" | "Produccion",
--      "certificado_storage_path": "<tenant_id>/certificado.p12",
--      "certificado_password_enc": "<base64 ciphertext AES-256-GCM>",
--      "certificado_password_iv":  "<base64 12-byte IV>",
--      "callback_url":           "https://...",
--      "metadata": {              -- opcional, llenado en upload
--        "subject_cn": "...",
--        "issuer_cn":  "...",
--        "valid_from": "2026-01-01",
--        "valid_to":   "2027-01-01",
--        "serial":     "..."
--      }
--    }

NOTIFY pgrst, 'reload schema';
