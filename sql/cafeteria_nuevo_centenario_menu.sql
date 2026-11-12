-- (12/11/2026) CAFETERÍA NUEVO CENTENARIO (031708ce-153a-4aa9-a34d-ea91c476e012):
-- menú de inicio con imagen PNG: REFRESCOS, JUGOS, EMPANADAS, PASTELITOS.
-- · Cada categoría es una pestaña de la pantalla táctil.
-- · Precios en RD$ CON ITBIS incluido (se cambian en "Menú y Productos").
-- · Costo 0: se pone el real después (si el precio queda por debajo del
--   costo, la venta se bloquea).
-- · Las imágenes ya están subidas en product-images/cafeteria/<empresa>/.
-- Idempotente: no repite categorías ni códigos.
DO $$
DECLARE
  v_t   uuid := '031708ce-153a-4aa9-a34d-ea91c476e012';
  v_img text := 'https://zdvxowpuklbypweyqqki.supabase.co/storage/v1/object/public/product-images/cafeteria/031708ce-153a-4aa9-a34d-ea91c476e012/';
  c text; r record; v_tipo uuid; v_prod uuid;
BEGIN
  FOREACH c IN ARRAY ARRAY['REFRESCOS', 'JUGOS', 'EMPANADAS', 'PASTELITOS'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.tipos_producto WHERE tenant_id = v_t AND upper(nombre) = c) THEN
      INSERT INTO public.tipos_producto (nombre, activo, tenant_id) VALUES (c, true, v_t);
    END IF;
  END LOOP;

  FOR r IN SELECT * FROM (VALUES
    ('REF-01', 'REFRESCO DE COLA',          'REFRESCOS',  50, 'refresco_cola'),
    ('REF-02', 'REFRESCO DE NARANJA',       'REFRESCOS',  50, 'refresco_naranja'),
    ('REF-03', 'REFRESCO DE UVA',           'REFRESCOS',  50, 'refresco_uva'),
    ('REF-04', 'REFRESCO ROJO',             'REFRESCOS',  50, 'refresco_rojo'),
    ('REF-05', 'REFRESCO DE LIMÓN',         'REFRESCOS',  50, 'refresco_limon'),
    ('JUG-01', 'JUGO DE NARANJA',           'JUGOS',      75, 'jugo_naranja'),
    ('JUG-02', 'JUGO DE CHINOLA',           'JUGOS',      75, 'jugo_chinola'),
    ('JUG-03', 'LIMONADA',                  'JUGOS',      60, 'jugo_limonada'),
    ('JUG-04', 'JUGO DE PIÑA',              'JUGOS',      75, 'jugo_pina'),
    ('JUG-05', 'JUGO DE TAMARINDO',         'JUGOS',      75, 'jugo_tamarindo'),
    ('EMP-01', 'EMPANADA DE POLLO',         'EMPANADAS',  60, 'empanada_pollo'),
    ('EMP-02', 'EMPANADA DE RES',           'EMPANADAS',  60, 'empanada_res'),
    ('EMP-03', 'EMPANADA DE QUESO',         'EMPANADAS',  60, 'empanada_queso'),
    ('EMP-04', 'EMPANADA DE JAMÓN Y QUESO', 'EMPANADAS',  70, 'empanada_jamon_queso'),
    ('EMP-05', 'EMPANADA DE VEGETALES',     'EMPANADAS',  60, 'empanada_vegetales'),
    ('PAS-01', 'PASTELITO DE POLLO',        'PASTELITOS', 35, 'pastelito_pollo'),
    ('PAS-02', 'PASTELITO DE RES',          'PASTELITOS', 35, 'pastelito_res'),
    ('PAS-03', 'PASTELITO DE QUESO',        'PASTELITOS', 35, 'pastelito_queso'),
    ('PAS-04', 'PASTELITO DE GUAYABA',      'PASTELITOS', 35, 'pastelito_guayaba')
  ) AS m(codigo, descripcion, categoria, precio, img)
  LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = v_t AND codigo = r.codigo);
    SELECT id INTO v_tipo FROM public.tipos_producto
     WHERE tenant_id = v_t AND upper(nombre) = r.categoria ORDER BY id LIMIT 1;

    INSERT INTO public.productos (codigo, descripcion, tipo_id, precio, costo, itbis_pct, imagen_url, activo, tenant_id)
    VALUES (r.codigo, r.descripcion, v_tipo, r.precio, 0, 0.18, v_img || r.img || '.png', true, v_t)
    RETURNING id INTO v_prod;

    INSERT INTO public.presentaciones (producto_id, cantidad, costo, precio1, precio2, precio3, afecta_ft, afecta_inv, tipo, tenant_id)
    VALUES (v_prod, 1, 0, r.precio, r.precio, r.precio, true, true, 'UND', v_t);
  END LOOP;
END $$;

SELECT t.nombre AS categoria, p.codigo, p.descripcion, pr.precio1 AS precio
  FROM public.productos p
  JOIN public.tipos_producto t ON t.id = p.tipo_id
  LEFT JOIN public.presentaciones pr ON pr.producto_id = p.id
 WHERE p.tenant_id = '031708ce-153a-4aa9-a34d-ea91c476e012'
 ORDER BY p.codigo;

SELECT registrar_migracion('cafeteria_nuevo_centenario_menu.sql');
