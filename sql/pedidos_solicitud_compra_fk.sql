-- ============================================================
-- FK entre pedidos y solicitudes_compras (Caminero Motors)
-- Permite mostrar el número real de la solicitud en
-- "Lista de Solicitudes" en vez del número interno del pedido
-- ============================================================

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS solicitud_compra_id UUID REFERENCES public.solicitudes_compras(id);

CREATE INDEX IF NOT EXISTS idx_pedidos_solicitud_compra
  ON public.pedidos(solicitud_compra_id);

NOTIFY pgrst, 'reload schema';
