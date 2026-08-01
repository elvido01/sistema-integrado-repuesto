-- =====================================================================
-- El GPS es de un cliente de la financiera, no de los 18 del dealer
-- ---------------------------------------------------------------------
-- (2026-08-01) "Como Caminero Motors es una empresa que financia su
-- motocicleta a terceros, aquí debe estar el catálogo de cliente de
-- MotoPréstamos Los Naranjos."
--
-- >>> LO QUE HAY EN CADA CATÁLOGO <<<
--   CAMINERO MOTORS        18 clientes
--   MOTOPRÉSTAMOS          9,234 clientes
--
-- Y el comprador financiado queda DUPLICADO en los dos, con ids distintos
-- y a veces escrito distinto:
--
--   KERVENS DAJILIQUE       [CAM]  y  KERVENS DAJILIQUE   [MP]
--   GUILLAUME JUDELOR       [CAM]  y  GUILLAUME JUDELOR   [MP]
--   NOEL MERCIDIEUX         [CAM]  y  NOEL MERCIDIUX      [MP]   ← ojo
--
-- El del dealer es una ficha de paso, creada para poder emitir la factura.
-- El cliente DE VERDAD —el que tiene el préstamo, las cuotas y el historial—
-- vive en la financiera. Si el GPS se anota contra la ficha de paso, mañana
-- no se puede cruzar con el préstamo de esa moto.
--
-- >>> PERO NO SE PUEDE CAMBIAR UN CATÁLOGO POR EL OTRO <<<
-- Las ventas de CONTADO no pasan por la financiera: RUBENS FRANCOIS y
-- FUMIGADORA DM SRL solo existen en el dealer. Si el buscador mostrara nada
-- más los de MotoPréstamos, esas ventas se quedarían sin poder anotar de
-- quién es el GPS. Por eso busca en LOS DOS y dice de cuál es cada uno,
-- poniendo los de la financiera primero.
--
-- >>> POR QUÉ UNA FUNCIÓN Y NO UNA CONSULTA <<<
-- El usuario de Caminero no puede leer los clientes de MotoPréstamos: la RLS
-- se lo impide, y está bien que se lo impida. Esta función es SECURITY
-- DEFINER, así que se salta la RLS, y por eso está amarrada a lo único que
-- puede ver: su propio tenant y la financiera CON LA QUE ESTÁ ENLAZADA en
-- config_empresa. Ningún parámetro decide el tenant.
--
-- 9,234 clientes no caben en un desplegable: la búsqueda es del lado del
-- servidor y devuelve como mucho p_limite filas.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- Con el id solo no basta: apunta a otra empresa. Sin saber a cuál, un JOIN
-- filtrado por tenant perdería la fila en silencio.
ALTER TABLE public.gastos_diarios
  ADD COLUMN IF NOT EXISTS cliente_tenant_id uuid;

COMMENT ON COLUMN public.gastos_diarios.cliente_tenant_id IS
  'Empresa dueña de cliente_id: puede ser la financiera del grupo, no este tenant.';

CREATE OR REPLACE FUNCTION public.buscar_clientes_con_financiera(
  p_busqueda text DEFAULT '',
  p_limite   integer DEFAULT 40
)
RETURNS TABLE (
  id        uuid,
  nombre    text,
  documento text,
  tenant_id uuid,
  origen    text,
  es_financiera boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant     uuid := public.get_user_tenant();
  v_fin        uuid;
  v_fin_nombre text;
  v_yo_nombre  text;
  v_q          text := '%' || btrim(COALESCE(p_busqueda, '')) || '%';
  v_lim        integer := LEAST(GREATEST(COALESCE(p_limite, 40), 1), 100);
BEGIN
  IF v_tenant IS NULL THEN RETURN; END IF;

  -- La financiera del grupo, por el enlace de config_empresa y nunca por
  -- nombre. Si esta empresa no financia con nadie, v_fin queda NULL y la
  -- búsqueda es solo la de siempre.
  SELECT ce.financiera_tenant_id INTO v_fin
  FROM public.config_empresa ce
  WHERE ce.tenant_id = v_tenant
    AND COALESCE(ce.financiamiento_tipo, 'propio') = 'terceros'
    AND ce.financiera_tenant_id IS NOT NULL
    AND ce.financiera_tenant_id <> v_tenant
  LIMIT 1;

  SELECT ce.nombre INTO v_fin_nombre FROM public.config_empresa ce WHERE ce.tenant_id = v_fin LIMIT 1;
  SELECT ce.nombre INTO v_yo_nombre  FROM public.config_empresa ce WHERE ce.tenant_id = v_tenant LIMIT 1;

  RETURN QUERY
  SELECT c.id,
         c.nombre,
         NULLIF(btrim(COALESCE(c.rnc, '')), '') AS documento,
         c.tenant_id,
         CASE WHEN c.tenant_id = v_fin
              THEN COALESCE(v_fin_nombre, 'Financiera')
              ELSE COALESCE(v_yo_nombre, 'Esta empresa') END AS origen,
         (c.tenant_id = v_fin) AS es_financiera
  FROM public.clientes c
  WHERE (c.tenant_id = v_tenant OR (v_fin IS NOT NULL AND c.tenant_id = v_fin))
    AND COALESCE(c.activo, true) = true
    AND (btrim(COALESCE(p_busqueda, '')) = ''
         OR c.nombre ILIKE v_q
         OR COALESCE(c.rnc, '') ILIKE v_q)
  -- Los de la financiera primero: ahí vive el cliente de verdad, el que
  -- tiene el préstamo de la moto.
  ORDER BY (c.tenant_id = v_fin) DESC, c.nombre ASC
  LIMIT v_lim;
END $$;

GRANT EXECUTE ON FUNCTION public.buscar_clientes_con_financiera(text, integer) TO authenticated;

-- Búsqueda por nombre sobre 9,234 filas en cada tecleo.
CREATE INDEX IF NOT EXISTS idx_clientes_tenant_nombre
  ON public.clientes (tenant_id, nombre);

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('clientes_terceros_financiera.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- OJO: get_user_tenant() es NULL en el editor SQL (no hay sesión), así que
-- la función devuelve vacío si se llama aquí. Se comprueba con la consulta
-- equivalente, fijando el tenant a mano.

-- 1) EL COMPRADOR DUPLICADO EN LAS DOS EMPRESAS
SELECT c.nombre, c.rnc,
       CASE c.tenant_id
         WHEN 'b39506c3-27dc-467d-830b-096731b83113' THEN 'CAMINERO MOTORS'
         WHEN '766fe3d6-6885-4f2b-b2cc-1a91db696fb4' THEN 'MOTOPRESTAMOS'
       END AS empresa
FROM public.clientes c
WHERE c.tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113',
                      '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
  AND c.nombre ILIKE '%KERVENS%'
ORDER BY c.nombre;
-- esperado: KERVENS DAJILIQUE dos veces, una por empresa.

-- 2) LO QUE VERÁ EL BUSCADOR DE CAMINERO AL ESCRIBIR "GUIL"
SELECT c.nombre, c.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4' AS es_financiera
FROM public.clientes c
WHERE c.tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113',
                      '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
  AND COALESCE(c.activo, true) = true
  AND c.nombre ILIKE '%GUIL%'
ORDER BY (c.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4') DESC, c.nombre
LIMIT 40;
-- esperado: los de MotoPréstamos arriba, GUILLAUME JUDELOR en ambos.
