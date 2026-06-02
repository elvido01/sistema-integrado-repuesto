-- ============================================================
-- Seed content de plantillas Polotno (Fase 3 — 3 primeras)
-- ============================================================
-- Carga el esqueleto JSON Polotno de las plantillas mas usadas.
-- Estas plantillas tienen elementos con `name` para que el motor
-- de inyeccion las identifique y reemplace con el copy IA y el
-- producto seleccionado.
--
-- Si ya tienes plantillas con content "real" (no placeholder),
-- este script las RESPETA — solo actualiza las que tienen el
-- JSON vacio (children: []).
-- ============================================================

-- 1) OFERTA DEL DIA — fondo rojo + precio destacado
UPDATE public.design_templates SET
  content = $json$
{
  "width": 1080,
  "height": 1080,
  "pages": [{
    "id": "p1",
    "background": "#dc2626",
    "children": [
      { "id": "banda_top", "type": "figure", "subType": "rect",
        "x": 0, "y": 0, "width": 1080, "height": 120, "fill": "#facc15" },
      { "id": "banda_top_text", "name": "banda_top_text", "type": "text",
        "x": 0, "y": 30, "width": 1080,
        "text": "OFERTA DEL DIA", "fontSize": 56, "fontWeight": 900,
        "fontFamily": "Roboto", "fill": "#0f172a", "align": "center" },
      { "id": "producto_foto", "name": "producto_foto", "type": "image",
        "x": 290, "y": 170, "width": 500, "height": 380,
        "src": "https://placehold.co/500x380/ffffff/cccccc?text=Foto+Producto" },
      { "id": "titulo", "name": "titulo", "type": "text",
        "x": 60, "y": 590, "width": 960,
        "text": "TU OFERTA AQUI", "fontSize": 88, "fontWeight": 900,
        "fontFamily": "Roboto", "fill": "#ffffff", "align": "center", "lineHeight": 1 },
      { "id": "subtitulo", "name": "subtitulo", "type": "text",
        "x": 80, "y": 720, "width": 920,
        "text": "Descripcion breve del producto", "fontSize": 36, "fontWeight": 400,
        "fontFamily": "Roboto", "fill": "#ffffff", "align": "center" },
      { "id": "precio", "name": "precio", "type": "text",
        "x": 60, "y": 820, "width": 960,
        "text": "RD$ 0", "fontSize": 96, "fontWeight": 900,
        "fontFamily": "Roboto", "fill": "#facc15", "align": "center" },
      { "id": "cta_box", "type": "figure", "subType": "rect",
        "x": 340, "y": 950, "width": 400, "height": 90,
        "fill": "#0f172a", "cornerRadius": 12 },
      { "id": "cta", "name": "cta", "type": "text",
        "x": 340, "y": 968, "width": 400,
        "text": "LLAMA AHORA", "fontSize": 42, "fontWeight": 900,
        "fontFamily": "Roboto", "fill": "#ffffff", "align": "center" }
    ]
  }]
}
$json$::jsonb,
  updated_at = NOW()
WHERE slug = 'oferta-del-dia'
  AND (content -> 'pages' -> 0 -> 'children' = '[]'::jsonb OR content IS NULL);

-- 2) NUEVO PRODUCTO — diseño limpio fondo claro
UPDATE public.design_templates SET
  content = $json$
{
  "width": 1080,
  "height": 1080,
  "pages": [{
    "id": "p1",
    "background": "#ffffff",
    "children": [
      { "id": "banda_izq", "type": "figure", "subType": "rect",
        "x": 0, "y": 0, "width": 60, "height": 1080, "fill": "#7c3aed" },
      { "id": "badge_bg", "type": "figure", "subType": "rect",
        "x": 120, "y": 100, "width": 280, "height": 60,
        "fill": "#7c3aed", "cornerRadius": 30 },
      { "id": "badge_text", "name": "badge_text", "type": "text",
        "x": 120, "y": 113, "width": 280,
        "text": "NUEVO EN TIENDA", "fontSize": 32, "fontWeight": 700,
        "fontFamily": "Roboto", "fill": "#ffffff", "align": "center" },
      { "id": "producto_foto", "name": "producto_foto", "type": "image",
        "x": 120, "y": 220, "width": 840, "height": 480,
        "src": "https://placehold.co/840x480/eeeeee/aaaaaa?text=Foto+Producto" },
      { "id": "titulo", "name": "titulo", "type": "text",
        "x": 120, "y": 740, "width": 840,
        "text": "NOMBRE DEL PRODUCTO", "fontSize": 72, "fontWeight": 900,
        "fontFamily": "Roboto", "fill": "#0f172a", "align": "left", "lineHeight": 1 },
      { "id": "subtitulo", "name": "subtitulo", "type": "text",
        "x": 120, "y": 860, "width": 840,
        "text": "Descripcion del producto", "fontSize": 32, "fontWeight": 400,
        "fontFamily": "Roboto", "fill": "#475569", "align": "left" },
      { "id": "cta", "name": "cta", "type": "text",
        "x": 120, "y": 980, "width": 840,
        "text": "PIDE EL TUYO HOY", "fontSize": 38, "fontWeight": 900,
        "fontFamily": "Roboto", "fill": "#7c3aed", "align": "left" }
    ]
  }]
}
$json$::jsonb,
  updated_at = NOW()
WHERE slug = 'nuevo-producto'
  AND (content -> 'pages' -> 0 -> 'children' = '[]'::jsonb OR content IS NULL);

-- 3) COMUNICADO — fondo oscuro elegante
UPDATE public.design_templates SET
  content = $json$
{
  "width": 1080,
  "height": 1080,
  "pages": [{
    "id": "p1",
    "background": "#0f172a",
    "children": [
      { "id": "borde_top", "type": "figure", "subType": "rect",
        "x": 0, "y": 0, "width": 1080, "height": 12, "fill": "#facc15" },
      { "id": "icono", "type": "text",
        "x": 0, "y": 140, "width": 1080,
        "text": "[!]", "fontSize": 140, "align": "center", "fill": "#facc15" },
      { "id": "etiqueta", "name": "etiqueta", "type": "text",
        "x": 0, "y": 320, "width": 1080,
        "text": "COMUNICADO", "fontSize": 32, "fontWeight": 700,
        "fontFamily": "Roboto", "fill": "#facc15", "align": "center", "letterSpacing": 8 },
      { "id": "titulo", "name": "titulo", "type": "text",
        "x": 80, "y": 420, "width": 920,
        "text": "MENSAJE PRINCIPAL", "fontSize": 90, "fontWeight": 900,
        "fontFamily": "Roboto", "fill": "#ffffff", "align": "center", "lineHeight": 1.1 },
      { "id": "subtitulo", "name": "subtitulo", "type": "text",
        "x": 100, "y": 700, "width": 880,
        "text": "Detalle del comunicado", "fontSize": 38, "fontWeight": 400,
        "fontFamily": "Roboto", "fill": "#cbd5e1", "align": "center", "lineHeight": 1.3 },
      { "id": "cta_box", "type": "figure", "subType": "rect",
        "x": 290, "y": 920, "width": 500, "height": 90,
        "fill": "#facc15", "cornerRadius": 12 },
      { "id": "cta", "name": "cta", "type": "text",
        "x": 290, "y": 938, "width": 500,
        "text": "MAS INFORMACION", "fontSize": 42, "fontWeight": 900,
        "fontFamily": "Roboto", "fill": "#0f172a", "align": "center" }
    ]
  }]
}
$json$::jsonb,
  updated_at = NOW()
WHERE slug = 'comunicado-urgente'
  AND (content -> 'pages' -> 0 -> 'children' = '[]'::jsonb OR content IS NULL);

-- 4) PROMOCION 2x1
UPDATE public.design_templates SET
  content = $json$
{"width":1080,"height":1080,"pages":[{"id":"p1","background":"#06b6d4","children":[
  {"id":"banda_top","type":"figure","subType":"rect","x":0,"y":0,"width":1080,"height":200,"fill":"#0f172a"},
  {"id":"badge_text","name":"badge_text","type":"text","x":0,"y":60,"width":1080,"text":"2x1","fontSize":110,"fontWeight":900,"fontFamily":"Roboto","fill":"#facc15","align":"center"},
  {"id":"titulo","name":"titulo","type":"text","x":60,"y":280,"width":960,"text":"PROMO 2 POR 1","fontSize":88,"fontWeight":900,"fontFamily":"Roboto","fill":"#ffffff","align":"center"},
  {"id":"producto_foto","name":"producto_foto","type":"image","x":240,"y":440,"width":600,"height":360,"src":"https://placehold.co/600x360/ffffff/cccccc?text=Productos"},
  {"id":"subtitulo","name":"subtitulo","type":"text","x":80,"y":830,"width":920,"text":"Lleva dos y paga uno","fontSize":40,"fontWeight":700,"fontFamily":"Roboto","fill":"#0f172a","align":"center"},
  {"id":"cta_box","type":"figure","subType":"rect","x":290,"y":940,"width":500,"height":90,"fill":"#0f172a","cornerRadius":12},
  {"id":"cta","name":"cta","type":"text","x":290,"y":958,"width":500,"text":"APROVECHA YA","fontSize":42,"fontWeight":900,"fontFamily":"Roboto","fill":"#facc15","align":"center"}
]}]}
$json$::jsonb,
  updated_at = NOW()
WHERE slug = 'promocion-2x1'
  AND (content -> 'pages' -> 0 -> 'children' = '[]'::jsonb OR content IS NULL);

-- 5) REPOSICION DE STOCK
UPDATE public.design_templates SET
  content = $json$
{"width":1080,"height":1080,"pages":[{"id":"p1","background":"#10b981","children":[
  {"id":"icono","type":"text","x":0,"y":100,"width":1080,"text":"OK","fontSize":160,"fontWeight":900,"fontFamily":"Roboto","fill":"#ffffff","align":"center"},
  {"id":"etiqueta","name":"etiqueta","type":"text","x":0,"y":290,"width":1080,"text":"YA DISPONIBLE","fontSize":36,"fontWeight":700,"fontFamily":"Roboto","fill":"#ffffff","align":"center","letterSpacing":6},
  {"id":"producto_foto","name":"producto_foto","type":"image","x":290,"y":370,"width":500,"height":320,"src":"https://placehold.co/500x320/ffffff/cccccc?text=Foto"},
  {"id":"titulo","name":"titulo","type":"text","x":60,"y":720,"width":960,"text":"YA LLEGO LO QUE ESPERABAS","fontSize":76,"fontWeight":900,"fontFamily":"Roboto","fill":"#ffffff","align":"center","lineHeight":1},
  {"id":"subtitulo","name":"subtitulo","type":"text","x":80,"y":870,"width":920,"text":"Tu repuesto favorito regreso al inventario","fontSize":32,"fontWeight":400,"fontFamily":"Roboto","fill":"#ffffff","align":"center"},
  {"id":"cta","name":"cta","type":"text","x":0,"y":980,"width":1080,"text":"RESERVA AHORA","fontSize":44,"fontWeight":900,"fontFamily":"Roboto","fill":"#facc15","align":"center"}
]}]}
$json$::jsonb,
  updated_at = NOW()
WHERE slug = 'reposicion-stock'
  AND (content -> 'pages' -> 0 -> 'children' = '[]'::jsonb OR content IS NULL);

-- 6) COMPARATIVA (landscape 1200x630)
UPDATE public.design_templates SET
  content = $json$
{"width":1200,"height":630,"pages":[{"id":"p1","background":"#0f172a","children":[
  {"id":"titulo","name":"titulo","type":"text","x":0,"y":30,"width":1200,"text":"COMPARA Y AHORRA","fontSize":52,"fontWeight":900,"fontFamily":"Roboto","fill":"#facc15","align":"center"},
  {"id":"caja_a_bg","type":"figure","subType":"rect","x":40,"y":110,"width":540,"height":420,"fill":"#1e293b","cornerRadius":16},
  {"id":"caja_a_titulo","type":"text","x":40,"y":130,"width":540,"text":"ANTES","fontSize":28,"fontWeight":700,"fontFamily":"Roboto","fill":"#cbd5e1","align":"center"},
  {"id":"imagen_a","name":"imagen_a","type":"image","x":80,"y":180,"width":460,"height":280,"src":"https://placehold.co/460x280/334155/64748b?text=Antes"},
  {"id":"caja_b_bg","type":"figure","subType":"rect","x":620,"y":110,"width":540,"height":420,"fill":"#065f46","cornerRadius":16},
  {"id":"caja_b_titulo","type":"text","x":620,"y":130,"width":540,"text":"AHORA","fontSize":28,"fontWeight":700,"fontFamily":"Roboto","fill":"#facc15","align":"center"},
  {"id":"imagen_b","name":"imagen_b","type":"image","x":660,"y":180,"width":460,"height":280,"src":"https://placehold.co/460x280/10b981/a7f3d0?text=Ahora"},
  {"id":"subtitulo","name":"subtitulo","type":"text","x":0,"y":555,"width":1200,"text":"Diferencia clara, calidad superior","fontSize":26,"fontWeight":400,"fontFamily":"Roboto","fill":"#ffffff","align":"center"}
]}]}
$json$::jsonb,
  updated_at = NOW()
WHERE slug = 'comparativa-antes-despues'
  AND (content -> 'pages' -> 0 -> 'children' = '[]'::jsonb OR content IS NULL);

-- 7) CATALOGO GRID
UPDATE public.design_templates SET
  content = $json$
{"width":1080,"height":1080,"pages":[{"id":"p1","background":"#ffffff","children":[
  {"id":"titulo","name":"titulo","type":"text","x":0,"y":30,"width":1080,"text":"CATALOGO","fontSize":64,"fontWeight":900,"fontFamily":"Roboto","fill":"#0f172a","align":"center"},
  {"id":"producto_1","name":"producto_1","type":"image","x":80,"y":140,"width":440,"height":380,"src":"https://placehold.co/440x380/f1f5f9/94a3b8?text=Producto+1"},
  {"id":"producto_2","name":"producto_2","type":"image","x":560,"y":140,"width":440,"height":380,"src":"https://placehold.co/440x380/f1f5f9/94a3b8?text=Producto+2"},
  {"id":"producto_3","name":"producto_3","type":"image","x":80,"y":540,"width":440,"height":380,"src":"https://placehold.co/440x380/f1f5f9/94a3b8?text=Producto+3"},
  {"id":"producto_4","name":"producto_4","type":"image","x":560,"y":540,"width":440,"height":380,"src":"https://placehold.co/440x380/f1f5f9/94a3b8?text=Producto+4"},
  {"id":"cta","name":"cta","type":"text","x":0,"y":970,"width":1080,"text":"PIDE EL TUYO HOY","fontSize":40,"fontWeight":900,"fontFamily":"Roboto","fill":"#dc2626","align":"center"}
]}]}
$json$::jsonb,
  updated_at = NOW()
WHERE slug = 'catalogo-grid'
  AND (content -> 'pages' -> 0 -> 'children' = '[]'::jsonb OR content IS NULL);

-- 8) STORY INSTAGRAM (vertical 1080x1920)
UPDATE public.design_templates SET
  content = $json$
{"width":1080,"height":1920,"pages":[{"id":"p1","background":"#7c3aed","children":[
  {"id":"banda_top","type":"figure","subType":"rect","x":0,"y":0,"width":1080,"height":280,"fill":"#0f172a"},
  {"id":"titulo","name":"titulo","type":"text","x":80,"y":80,"width":920,"text":"TITULO PRINCIPAL","fontSize":96,"fontWeight":900,"fontFamily":"Roboto","fill":"#facc15","align":"center","lineHeight":1},
  {"id":"imagen","name":"imagen","type":"image","x":140,"y":380,"width":800,"height":800,"src":"https://placehold.co/800x800/ffffff/cccccc?text=Imagen"},
  {"id":"subtitulo","name":"subtitulo","type":"text","x":80,"y":1280,"width":920,"text":"Mensaje principal de la story","fontSize":60,"fontWeight":700,"fontFamily":"Roboto","fill":"#ffffff","align":"center","lineHeight":1.2},
  {"id":"cta_box","type":"figure","subType":"rect","x":240,"y":1620,"width":600,"height":130,"fill":"#facc15","cornerRadius":20},
  {"id":"cta","name":"cta","type":"text","x":240,"y":1645,"width":600,"text":"DESLIZA","fontSize":64,"fontWeight":900,"fontFamily":"Roboto","fill":"#0f172a","align":"center"}
]}]}
$json$::jsonb,
  updated_at = NOW()
WHERE slug = 'story-instagram'
  AND (content -> 'pages' -> 0 -> 'children' = '[]'::jsonb OR content IS NULL);

-- 9) BANNER NEGOCIO
UPDATE public.design_templates SET
  content = $json$
{"width":1080,"height":1080,"pages":[{"id":"p1","background":"#0f172a","children":[
  {"id":"logo_circle","type":"figure","subType":"circle","x":440,"y":80,"width":200,"height":200,"fill":"#facc15"},
  {"id":"logo_text","type":"text","x":440,"y":140,"width":200,"text":"RM","fontSize":96,"fontWeight":900,"fontFamily":"Roboto","fill":"#0f172a","align":"center"},
  {"id":"nombre","name":"nombre","type":"text","x":0,"y":320,"width":1080,"text":"NOMBRE DEL NEGOCIO","fontSize":64,"fontWeight":900,"fontFamily":"Roboto","fill":"#facc15","align":"center"},
  {"id":"telefono_label","type":"text","x":0,"y":480,"width":1080,"text":"TEL","fontSize":32,"fontWeight":700,"fontFamily":"Roboto","fill":"#cbd5e1","align":"center"},
  {"id":"telefono","name":"telefono","type":"text","x":0,"y":530,"width":1080,"text":"809-000-0000","fontSize":48,"fontWeight":900,"fontFamily":"Roboto","fill":"#ffffff","align":"center"},
  {"id":"direccion_label","type":"text","x":0,"y":640,"width":1080,"text":"DIRECCION","fontSize":32,"fontWeight":700,"fontFamily":"Roboto","fill":"#cbd5e1","align":"center"},
  {"id":"direccion","name":"direccion","type":"text","x":80,"y":690,"width":920,"text":"Direccion del negocio","fontSize":40,"fontWeight":400,"fontFamily":"Roboto","fill":"#ffffff","align":"center","lineHeight":1.3},
  {"id":"horario_label","type":"text","x":0,"y":830,"width":1080,"text":"HORARIO","fontSize":32,"fontWeight":700,"fontFamily":"Roboto","fill":"#cbd5e1","align":"center"},
  {"id":"horario","name":"horario","type":"text","x":0,"y":880,"width":1080,"text":"Lun-Sab 8am - 6pm","fontSize":40,"fontWeight":400,"fontFamily":"Roboto","fill":"#ffffff","align":"center"}
]}]}
$json$::jsonb,
  updated_at = NOW()
WHERE slug = 'banner-negocio'
  AND (content -> 'pages' -> 0 -> 'children' = '[]'::jsonb OR content IS NULL);

-- 10) AGRADECIMIENTO CLIENTE
UPDATE public.design_templates SET
  content = $json$
{"width":1080,"height":1080,"pages":[{"id":"p1","background":"#dc2626","children":[
  {"id":"icono","type":"text","x":0,"y":80,"width":1080,"text":"♥","fontSize":140,"fontWeight":900,"fontFamily":"Roboto","fill":"#facc15","align":"center"},
  {"id":"etiqueta","type":"text","x":0,"y":260,"width":1080,"text":"GRACIAS","fontSize":96,"fontWeight":900,"fontFamily":"Roboto","fill":"#facc15","align":"center","letterSpacing":6},
  {"id":"nombre_cliente","name":"nombre_cliente","type":"text","x":0,"y":400,"width":1080,"text":"A nuestros clientes","fontSize":52,"fontWeight":700,"fontFamily":"Roboto","fill":"#ffffff","align":"center"},
  {"id":"mensaje","name":"mensaje","type":"text","x":100,"y":540,"width":880,"text":"Su confianza es lo que nos motiva a seguir mejorando cada dia","fontSize":36,"fontWeight":400,"fontFamily":"Roboto","fill":"#ffffff","align":"center","lineHeight":1.4},
  {"id":"firma","type":"text","x":0,"y":900,"width":1080,"text":"— El equipo","fontSize":32,"fontWeight":700,"fontFamily":"Roboto","fill":"#facc15","align":"center"}
]}]}
$json$::jsonb,
  updated_at = NOW()
WHERE slug = 'agradecimiento-cliente'
  AND (content -> 'pages' -> 0 -> 'children' = '[]'::jsonb OR content IS NULL);

-- ────────────────────────────────────────────────
-- Verificacion final: las 10 plantillas con su numero de elementos
-- ────────────────────────────────────────────────
SELECT slug, name,
       jsonb_array_length(content -> 'pages' -> 0 -> 'children') AS num_elementos,
       (content -> 'pages' -> 0 ->> 'background') AS background
FROM public.design_templates
ORDER BY sort_order;
