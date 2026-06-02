-- Estado de Resultado automatizado
-- Ejecutar en Supabase antes de desplegar la pagina nueva.

ALTER TABLE public.facturas_detalle
ADD COLUMN IF NOT EXISTS costo_unitario numeric DEFAULT 0;

-- Relleno inicial para facturas ya existentes. Es una aproximacion:
-- usa el costo actual del producto porque esas lineas no guardaban costo historico.
UPDATE public.facturas_detalle fd
SET costo_unitario = COALESCE(p.costo, 0)
FROM public.productos p
WHERE fd.producto_id = p.id
  AND COALESCE(fd.costo_unitario, 0) = 0;

-- Los usuarios no administradores necesitan permiso explicito para ver el modulo.
-- Ajustar user_id/can_edit segun corresponda si se quiere activarlo de forma masiva.
-- INSERT INTO public.user_module_permissions (user_id, module_key, can_view, can_edit)
-- SELECT id, 'estado-resultados', true, false
-- FROM public.profiles
-- WHERE role = 'seller'
-- ON CONFLICT (user_id, module_key)
-- DO UPDATE SET can_view = EXCLUDED.can_view;
