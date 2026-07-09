-- Buscador de clientes para el módulo Documentos (Notas y Comentarios):
-- 1) Busca en el tenant propio Y en el de la empresa aliada
--    (Caminero <-> Naranjos comparten; las demás solo ven lo suyo).
-- 2) Compara cédulas SIN formato (solo dígitos), porque el viejo guardó
--    cédulas con y sin guiones ("028000092849" vs "028-00009284-9").

CREATE OR REPLACE FUNCTION public.buscar_clientes_documentos(p_q text)
RETURNS TABLE(id uuid, nombre text, codigo text, rnc text, telefono text, direccion text, tenant_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH q AS (
    SELECT trim(p_q) AS txt,
           NULLIF(regexp_replace(p_q, '\D', '', 'g'), '') AS dig
  )
  SELECT c.id, c.nombre::text, c.codigo::text, c.rnc::text,
         c.telefono::text, c.direccion::text, c.tenant_id
  FROM public.clientes c, q
  WHERE c.tenant_id = ANY (public.get_tenants_documentos())
    AND COALESCE(c.activo, true)
    AND q.txt <> ''
    AND (
      c.codigo ILIKE '%' || q.txt || '%'
      OR c.nombre ILIKE '%' || q.txt || '%'
      OR c.rnc ILIKE '%' || q.txt || '%'
      OR (q.dig IS NOT NULL AND regexp_replace(COALESCE(c.rnc, ''), '\D', '', 'g') = q.dig)
      OR (q.dig IS NOT NULL AND regexp_replace(COALESCE(c.codigo, ''), '\D', '', 'g') = q.dig)
    )
  ORDER BY
    (regexp_replace(COALESCE(c.rnc, ''), '\D', '', 'g') = q.dig) DESC, -- cédula exacta primero
    (c.tenant_id = public.get_user_tenant()) DESC,                     -- luego los propios
    c.nombre
  LIMIT 30;
$$;

GRANT EXECUTE ON FUNCTION public.buscar_clientes_documentos(text) TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('buscar_clientes_documentos.sql');
  END IF;
END $$;

SELECT 'Buscador de clientes compartido para Documentos listo' AS status;
