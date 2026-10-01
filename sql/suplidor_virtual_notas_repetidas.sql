-- ============================================================
-- SUPLIDOR VIRTUAL: LA MISMA PIEZA ANOTADA DOS VECES
-- ============================================================
-- (2026-10-01) Pedido del dueño: «cuando agrego un producto desde Suplidor
-- Virtual a una orden de compra y la mando a pedir, debe desaparecer del
-- Suplidor Virtual, para que no se le pida al mismo tiempo a diferentes
-- suplidores».
--
-- La nota que se mete en la orden YA desaparece (orden_compra_pedida_id, ver
-- la_lista_de_pendientes_se_asoma_en_la_orden.sql). Lo que seguía saliendo era
-- OTRA nota de la misma pieza: «eje de los cambio platina 125 bajaj» se pidió
-- en ORD-0093, y «EJE DE LO CAMBIO PLATINA», anotada el 10/06, seguía en la
-- lista sugerida para PEDRO RACING.
--
-- Por qué no se esconde sola toda nota "contenida" en la pedida: al pedir
-- «SPRING EJE CAMBIO PLATINA» desaparecería «EJE DE LO CAMBIO PLATINA», que es
-- otra pieza. Así que:
--   igual    = mismo producto, o las mismas palabras  -> se amarra sola
--   parecida = las palabras de una caben en la otra   -> se pregunta
-- Compara contra TODAS las líneas de la orden, no solo las que entraron desde
-- el Suplidor Virtual: si la pieza se buscó en la mercancía y se metió a mano,
-- la nota también sobra.
--
-- Solo lectura; amarrar lo hace la pantalla (update con select, como siempre).
-- ============================================================

-- Palabras que cuentan. NO se usa _sv_tokens (esa bota los números y las de
-- dos letras, y aquí deciden): sin números «tubo 110/90-17» salía igual a
-- «TUBO 2.50 X 17» y «cilindro platina 100» parecida al de 125; sin las de dos
-- letras «piston STD ax» cabía en cualquier pistón STD. Fuera solo lo que no
-- distingue una pieza de otra ("de los" vs "de lo").
CREATE OR REPLACE FUNCTION public._sv_palabras(p_texto text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(DISTINCT u.w ORDER BY u.w), '{}')
    FROM unnest(regexp_split_to_array(
           lower(public._sin_tildes(COALESCE(p_texto, ''))), '[^a-z0-9]+')) AS u(w)
   WHERE (length(u.w) >= 2 OR u.w ~ '^[0-9]+$')
     AND u.w NOT IN ('de', 'lo', 'la', 'el', 'en', 'al', 'un', 'con', 'los', 'las',
                     'del', 'para', 'por', 'una', 'uno', 'and', 'the');
$$;

CREATE OR REPLACE FUNCTION public.sv_notas_de_la_orden(p_orden_id uuid)
RETURNS TABLE(id uuid, descripcion text, marcado_at timestamptz, linea text, igual boolean)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH lineas AS (
    SELECT d.producto_id, d.descripcion, public._sv_palabras(d.descripcion) AS ws
      FROM public.ordenes_compra_detalle d
      JOIN public.ordenes_compra o ON o.id = d.orden_compra_id
     WHERE d.orden_compra_id = p_orden_id
       AND o.tenant_id = public.get_user_tenant()
  ),
  notas AS (
    SELECT s.id, s.descripcion, s.marcado_at, s.producto_id,
           public._sv_palabras(s.descripcion) AS ws
      FROM public.suplidor_virtual_items s
     WHERE s.tenant_id = public.get_user_tenant()
       AND s.estado = 'pendiente'
       AND s.orden_compra_pedida_id IS NULL
  ),
  cruce AS (
    SELECT n.id, n.descripcion, n.marcado_at, l.descripcion AS linea,
           (   (n.producto_id IS NOT NULL AND n.producto_id = l.producto_id)
            OR (cardinality(n.ws) > 0 AND n.ws @> l.ws AND n.ws <@ l.ws)) AS igual
      FROM notas n
      JOIN lineas l
        ON (n.producto_id IS NOT NULL AND n.producto_id = l.producto_id)
        OR (cardinality(n.ws) > 0 AND n.ws @> l.ws AND n.ws <@ l.ws)
        OR (cardinality(n.ws) >= 2 AND n.ws <@ l.ws)
        OR (cardinality(l.ws) >= 2 AND l.ws <@ n.ws)
  )
  -- Una nota que es igual a una línea y parecida a otra cuenta como igual.
  SELECT DISTINCT ON (c.id) c.id, c.descripcion, c.marcado_at, c.linea, c.igual
    FROM cruce c
   ORDER BY c.id, c.igual DESC;
$$;

GRANT EXECUTE ON FUNCTION public.sv_notas_de_la_orden(uuid) TO authenticated;

-- La nota de junio del caso que destapó esto: es la misma pieza que se pidió
-- en ORD-0093 (la flecha del dueño en la captura). Solo si sigue suelta.
UPDATE public.suplidor_virtual_items s
   SET orden_compra_pedida_id = o.orden_compra_pedida_id,
       pedida_at = NOW(), updated_at = NOW()
  FROM public.suplidor_virtual_items o
 WHERE s.id = 'e9bd3d61-fa1f-462c-a2d9-9c07b46a54af'
   AND o.id = '0a44bc55-f984-42e1-9980-13834673b2fe'
   AND s.estado = 'pendiente'
   AND s.orden_compra_pedida_id IS NULL
   AND o.orden_compra_pedida_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('suplidor_virtual_notas_repetidas.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT
  public._sv_palabras('EJE DE LO CAMBIO PLATINA')::text           AS palabras_vieja,
  public._sv_palabras('eje de los cambio platina 125 bajaj')::text AS palabras_pedida,
  (SELECT orden_compra_pedida_id IS NOT NULL FROM public.suplidor_virtual_items
    WHERE id = 'e9bd3d61-fa1f-462c-a2d9-9c07b46a54af')            AS nota_junio_amarrada;
