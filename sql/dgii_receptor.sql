-- =====================================================================
-- dgii_recepciones — auditoría del servicio RECEPTOR e-CF (dgii-receptor)
-- ---------------------------------------------------------------------
-- La edge function dgii-receptor (pasos 8-11 de la certificación DGII y
-- recepción de e-CF de suplidores en producción) registra aquí cada
-- llamada: semillas emitidas, tokens, e-CF recibidos (con el ARECF
-- firmado que devolvimos) y aprobaciones comerciales recibidas.
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.dgii_recepciones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo          text NOT NULL,          -- SEMILLA | TOKEN | ECF | ACECF | DESCONOCIDO | ERROR
  tenant_id     uuid,                   -- tenant receptor (si se resolvió por RNC)
  rnc_emisor    text,
  rnc_comprador text,
  encf          text,
  tipo_ecf      text,
  estado        text,                   -- ECF: 0/1 · ACECF: OK/Error · TOKEN: emitido/rechazado
  motivo        text,                   -- CodigoMotivoNoRecibido u observación
  token_valido  boolean,                -- null = vino sin token
  raw_xml       text,
  respuesta_xml text,                   -- ARECF firmado devuelto
  headers       jsonb,
  ip            text,
  es_prueba     boolean NOT NULL DEFAULT false,  -- self-test del runner (header x-selftest)
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dgii_recepciones_created
  ON public.dgii_recepciones (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dgii_recepciones_encf
  ON public.dgii_recepciones (tipo, encf, rnc_emisor);

ALTER TABLE public.dgii_recepciones ENABLE ROW LEVEL SECURITY;

-- La edge function escribe con service_role (bypassa RLS).
-- Los usuarios del sistema solo LEEN: su tenant + filas sin tenant
-- (semillas/tokens, que no pertenecen a nadie).
DROP POLICY IF EXISTS dgii_recepciones_select ON public.dgii_recepciones;
CREATE POLICY dgii_recepciones_select ON public.dgii_recepciones
  FOR SELECT TO authenticated
  USING (
    tenant_id IS NULL
    OR tenant_id = (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid())
  );

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('dgii_receptor.sql');
  END IF;
END $$;

SELECT 'dgii_recepciones lista (receptor e-CF pasos 8-11)' AS status;
