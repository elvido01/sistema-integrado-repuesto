-- 1. Modificar la restricción (CHECK) de la columna estado para permitir 'solicitado'
ALTER TABLE public.solicitudes_clientes DROP CONSTRAINT IF EXISTS solicitudes_clientes_estado_check;
ALTER TABLE public.solicitudes_clientes ADD CONSTRAINT solicitudes_clientes_estado_check CHECK (estado IN ('abierta', 'notificada', 'cerrada', 'solicitado'));

-- 2. Habilitar el borrado de solicitudes (Política RLS para DELETE)
CREATE POLICY "solicitudes_delete" ON public.solicitudes_clientes
  FOR DELETE USING (true);
