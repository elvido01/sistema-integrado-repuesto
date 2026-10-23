-- =====================================================================
-- MODELOS REPETIDOS DE REPUESTOS MORLA: UNO POR NOMBRE (23/10/2026)
-- ---------------------------------------------------------------------
-- Morla tenía 818 modelos de moto que son 271: AX100 estaba 38 veces,
-- CG200 31, PRESS CUB 30… (se creaban de nuevo bajo cada marca de pieza
-- desde la ficha). Con eso, filtrar Mercancías por "AX100" encontraba solo
-- las piezas de UNO de los 38, y la ficha enseñaba modelos a medias.
--
-- Por cada nombre (sin mayúsculas/espacios de diferencia) queda UNO: el
-- que más productos usan. Los productos que tenían cualquiera de los
-- repetidos pasan a apuntar a ese; nadie pierde ninguna moto.
--   · productos.modelos_ids  → los ids repetidos se cambian por el que
--     queda, sin duplicar dentro del arreglo y en el mismo orden.
--   · productos.modelo_id    → (campo viejo) igual.
--   · Los repetidos se BORRAN, pero antes se copian a
--     modelos_fusionados_20261023 (id viejo → id que quedó), para poder
--     deshacerlo.
-- SOLO Repuestos Morla. Las otras empresas no se tocan.
-- =====================================================================

-- 1. El respaldo y el mapa: id viejo → id que queda
CREATE TABLE IF NOT EXISTS public.modelos_fusionados_20261023 (
  id_viejo   uuid PRIMARY KEY,
  id_queda   uuid NOT NULL,
  nombre     text,
  marca_id   uuid,
  activo     boolean,
  tenant_id  uuid,
  fusionado_at timestamptz DEFAULT now()
);
ALTER TABLE public.modelos_fusionados_20261023 ENABLE ROW LEVEL SECURITY;

WITH m AS (
  SELECT mo.*, upper(regexp_replace(btrim(mo.nombre), '\s+', ' ', 'g')) AS n
    FROM public.modelos mo
   WHERE mo.tenant_id = '00000000-0000-0000-0000-000000000001'
), uso AS (
  SELECT m.id,
         (SELECT count(*) FROM public.productos p
           WHERE p.tenant_id = m.tenant_id AND (m.id = ANY (p.modelos_ids) OR p.modelo_id = m.id)) AS n_prod
    FROM m
), rank AS (
  SELECT m.id, m.n, m.nombre, m.marca_id, m.activo, m.tenant_id,
         first_value(m.id) OVER (PARTITION BY m.n ORDER BY u.n_prod DESC, m.activo DESC NULLS LAST, m.id) AS queda
    FROM m JOIN uso u ON u.id = m.id
)
INSERT INTO public.modelos_fusionados_20261023 (id_viejo, id_queda, nombre, marca_id, activo, tenant_id)
SELECT id, queda, nombre, marca_id, activo, tenant_id FROM rank WHERE id <> queda
ON CONFLICT (id_viejo) DO NOTHING;

-- 2. Los productos apuntan al que queda (sin repetir y en el mismo orden)
UPDATE public.productos p
   SET modelos_ids = (
         SELECT array_agg(x.id ORDER BY x.pos)
           FROM (SELECT DISTINCT ON (coalesce(f.id_queda, e.id)) coalesce(f.id_queda, e.id) AS id, e.pos
                   FROM unnest(p.modelos_ids) WITH ORDINALITY AS e(id, pos)
                   LEFT JOIN public.modelos_fusionados_20261023 f ON f.id_viejo = e.id
                  ORDER BY coalesce(f.id_queda, e.id), e.pos) x)
 WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001'
   AND p.modelos_ids && (SELECT array_agg(id_viejo) FROM public.modelos_fusionados_20261023
                          WHERE tenant_id = '00000000-0000-0000-0000-000000000001');

UPDATE public.productos p SET modelo_id = f.id_queda
  FROM public.modelos_fusionados_20261023 f
 WHERE p.tenant_id = '00000000-0000-0000-0000-000000000001' AND p.modelo_id = f.id_viejo;

-- 3. El que queda está activo si alguno de sus repetidos lo estaba
UPDATE public.modelos mo SET activo = true
 WHERE mo.tenant_id = '00000000-0000-0000-0000-000000000001'
   AND coalesce(mo.activo, false) = false
   AND EXISTS (SELECT 1 FROM public.modelos_fusionados_20261023 f WHERE f.id_queda = mo.id AND f.activo);

-- 4. Fuera los repetidos (ya nadie los usa)
DELETE FROM public.modelos mo
 USING public.modelos_fusionados_20261023 f
 WHERE mo.id = f.id_viejo AND mo.tenant_id = '00000000-0000-0000-0000-000000000001';

-- 5. Que no vuelva a pasar: en Morla un nombre de modelo, una sola vez.
-- (Si alguien crea "ax100" teniendo "AX100", la base lo rechaza y se elige
-- el que ya existe.)
CREATE UNIQUE INDEX IF NOT EXISTS modelos_nombre_unico_morla
    ON public.modelos (upper(regexp_replace(btrim(nombre), '\s+', ' ', 'g')))
 WHERE tenant_id = '00000000-0000-0000-0000-000000000001';

SELECT public.registrar_migracion('modelos_fusionar_repetidos_morla.sql');
