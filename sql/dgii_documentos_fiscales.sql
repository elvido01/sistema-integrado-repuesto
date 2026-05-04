-- ============================================================
-- DGII e-CF: log de documentos fiscales + storage de XMLs firmados
-- ============================================================
-- Extiende documentos_fiscales con columnas especificas de DGII
-- e-CF y crea el bucket privado donde se guardan los XML firmados
-- (retencion legal: 10 años).
--
-- La tabla `documentos_fiscales` ya existe (la usa el adapter
-- de Alegra). Aqui solo le agregamos columnas — los proveedores
-- existentes siguen funcionando sin tocar nada.
-- ============================================================

-- 1. Crear tabla si no existe (defensivo) y luego agregar columnas
CREATE TABLE IF NOT EXISTS public.documentos_fiscales (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id),
  factura_id    uuid REFERENCES public.facturas(id),
  proveedor     text NOT NULL,
  tipo_documento text NOT NULL DEFAULT 'factura',
  estado        text NOT NULL DEFAULT 'procesando',
  proveedor_invoice_id text,
  proveedor_number     text,
  ncf           text,
  request_payload  jsonb,
  response_payload jsonb,
  error_message    text,
  retry_count   int DEFAULT 0,
  emitted_at    timestamptz,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- 2. Columnas nuevas para DGII directo (idempotente)
ALTER TABLE public.documentos_fiscales
  ADD COLUMN IF NOT EXISTS tipo_ecf            text,
  ADD COLUMN IF NOT EXISTS encf                text,
  ADD COLUMN IF NOT EXISTS xml_firmado_path    text,
  ADD COLUMN IF NOT EXISTS track_id            text,
  ADD COLUMN IF NOT EXISTS estado_dgii         text,
  ADD COLUMN IF NOT EXISTS arecf_recibido_at   timestamptz,
  ADD COLUMN IF NOT EXISTS arecf_payload       jsonb,
  ADD COLUMN IF NOT EXISTS aecf_recibido_at    timestamptz,
  ADD COLUMN IF NOT EXISTS aecf_estado         text,
  ADD COLUMN IF NOT EXISTS aecf_payload        jsonb,
  ADD COLUMN IF NOT EXISTS dgii_messages       jsonb,
  ADD COLUMN IF NOT EXISTS ambiente            text;

-- Comentarios para auditoria
COMMENT ON COLUMN public.documentos_fiscales.tipo_ecf IS 'Tipo DGII: 31=CredFiscal, 32=Consumo, 33=NotaDeb, 34=NotaCred, 41=Compras, 43=GastosMen, 44=RegEsp, 45=Gub, 46=Export, 47=PagosExt';
COMMENT ON COLUMN public.documentos_fiscales.encf IS 'e-NCF asignado por el emisor (ej. E310000000001)';
COMMENT ON COLUMN public.documentos_fiscales.track_id IS 'TrackId que retorna DGII al recibir el e-CF';
COMMENT ON COLUMN public.documentos_fiscales.estado_dgii IS 'enviado | aceptado | rechazado | aceptado_condicional';
COMMENT ON COLUMN public.documentos_fiscales.aecf_estado IS 'Aprobacion Comercial (B2B tipo 31): aprobado | rechazado';
COMMENT ON COLUMN public.documentos_fiscales.ambiente IS 'TesteCF | CerteCF | Produccion';

-- 3. Indices para queries comunes
CREATE INDEX IF NOT EXISTS idx_docs_fiscales_tenant
  ON public.documentos_fiscales(tenant_id);
CREATE INDEX IF NOT EXISTS idx_docs_fiscales_factura
  ON public.documentos_fiscales(factura_id);
CREATE INDEX IF NOT EXISTS idx_docs_fiscales_track_id
  ON public.documentos_fiscales(track_id) WHERE track_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_docs_fiscales_encf
  ON public.documentos_fiscales(encf) WHERE encf IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_docs_fiscales_tipo_ecf
  ON public.documentos_fiscales(tipo_ecf) WHERE tipo_ecf IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_docs_fiscales_estado
  ON public.documentos_fiscales(tenant_id, estado);

-- 4. RLS — cada tenant solo ve sus propios documentos
ALTER TABLE public.documentos_fiscales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_docs_fiscales" ON public.documentos_fiscales;
DROP POLICY IF EXISTS "tenant_insert_docs_fiscales" ON public.documentos_fiscales;
DROP POLICY IF EXISTS "tenant_update_docs_fiscales" ON public.documentos_fiscales;

CREATE POLICY "tenant_select_docs_fiscales" ON public.documentos_fiscales
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant());

CREATE POLICY "tenant_insert_docs_fiscales" ON public.documentos_fiscales
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant());

CREATE POLICY "tenant_update_docs_fiscales" ON public.documentos_fiscales
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant());

-- 5. Bucket privado para XMLs firmados de e-CF (retencion 10 anos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ecf-xmls',
  'ecf-xmls',
  false,
  5 * 1024 * 1024,  -- 5 MB max (XMLs reales son <100KB pero damos margen)
  ARRAY['application/xml', 'text/xml']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 5 * 1024 * 1024;

-- 6. Politicas RLS en storage.objects para el bucket ecf-xmls
-- Convencion path: <tenant_id>/<año>/<mes>/<encf>.xml
-- Solo el usuario del tenant puede LEER sus XMLs. La edge function
-- (service_role) escribe — bypassa RLS.

DROP POLICY IF EXISTS "tenant_leer_ecf_xmls" ON storage.objects;
DROP POLICY IF EXISTS "tenant_borrar_ecf_xmls" ON storage.objects;

CREATE POLICY "tenant_leer_ecf_xmls"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'ecf-xmls'
  AND (storage.foldername(name))[1]::uuid = public.get_user_tenant()
);

-- Ojo: NO permitimos DELETE a usuarios — los XML deben mantenerse
-- 10 anos por ley. Solo service_role puede borrar (en caso de
-- correccion administrativa muy extrema).

-- 7. Sequence para correlativo de e-NCF por tenant
-- En DGII, cada emisor maneja sus propias secuencias por tipo de e-CF
-- y serie. Aqui creo una tabla simple para llevar el ultimo correlativo
-- usado, asi la edge function puede asignar el proximo numero atomicamente.
CREATE TABLE IF NOT EXISTS public.ecf_secuencias (
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id),
  tipo_ecf     text NOT NULL,           -- '31', '32', etc
  serie        text NOT NULL DEFAULT 'E',
  desde        bigint NOT NULL DEFAULT 1,
  hasta        bigint NOT NULL,         -- el rango asignado por DGII al solicitar autorizacion
  ultimo       bigint NOT NULL DEFAULT 0,
  ambiente     text NOT NULL DEFAULT 'TesteCF',
  activo       boolean NOT NULL DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  PRIMARY KEY (tenant_id, tipo_ecf, serie, ambiente)
);

ALTER TABLE public.ecf_secuencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_ecf_seq" ON public.ecf_secuencias;
DROP POLICY IF EXISTS "tenant_update_ecf_seq" ON public.ecf_secuencias;
DROP POLICY IF EXISTS "tenant_insert_ecf_seq" ON public.ecf_secuencias;

CREATE POLICY "tenant_select_ecf_seq" ON public.ecf_secuencias
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant());

CREATE POLICY "tenant_insert_ecf_seq" ON public.ecf_secuencias
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant());

CREATE POLICY "tenant_update_ecf_seq" ON public.ecf_secuencias
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant());

-- RPC atomico para obtener el siguiente numero de e-NCF
-- (incrementa el contador y retorna el e-NCF formateado).
CREATE OR REPLACE FUNCTION public.get_next_encf(
  p_tipo_ecf text,
  p_ambiente text DEFAULT 'TesteCF'
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_serie  text;
  v_proximo bigint;
  v_hasta   bigint;
BEGIN
  v_tenant := public.get_user_tenant();
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Sin tenant en sesion';
  END IF;

  -- Increment atomico (lock por fila)
  UPDATE public.ecf_secuencias
     SET ultimo = ultimo + 1,
         updated_at = now()
   WHERE tenant_id = v_tenant
     AND tipo_ecf  = p_tipo_ecf
     AND ambiente  = p_ambiente
     AND activo    = true
   RETURNING ultimo, hasta, serie
     INTO v_proximo, v_hasta, v_serie;

  IF v_proximo IS NULL THEN
    RAISE EXCEPTION 'No hay secuencia activa para tipo % ambiente %. Configura ecf_secuencias primero.',
      p_tipo_ecf, p_ambiente;
  END IF;

  IF v_proximo > v_hasta THEN
    RAISE EXCEPTION 'Secuencia agotada para tipo % (limite %). Solicita un nuevo rango a DGII.',
      p_tipo_ecf, v_hasta;
  END IF;

  -- Formato: <serie><tipo><10 digitos>  ej. E31 0000000001
  -- DGII espec: prefijo 'E' + tipo + 10 digitos = 13 caracteres totales
  RETURN v_serie || p_tipo_ecf || LPAD(v_proximo::text, 10, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_next_encf(text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
