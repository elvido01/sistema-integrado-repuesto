-- =============================================================
-- Módulo "Documentos > Notas y Comentarios" (empresas financieras)
-- Réplica del módulo "Notas y Comentarios" del sistema viejo (SiiF):
-- bitácora de notas por cliente (opcionalmente ligada a un préstamo),
-- con fecha, usuario que la escribió y el texto libre.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.cliente_notas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  cliente_id      uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  prestamo_id     uuid REFERENCES public.prestamos(id) ON DELETE SET NULL,
  fecha           date NOT NULL DEFAULT CURRENT_DATE,
  nota            text NOT NULL,
  usuario_id      uuid,
  usuario_nombre  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cliente_notas_cliente
  ON public.cliente_notas (tenant_id, cliente_id, created_at DESC);

ALTER TABLE public.cliente_notas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cliente_notas_tenant ON public.cliente_notas;
CREATE POLICY cliente_notas_tenant ON public.cliente_notas FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('notas_comentarios_cliente.sql');
  END IF;
END $$;

SELECT 'Tabla cliente_notas (Notas y Comentarios) lista' AS status;
