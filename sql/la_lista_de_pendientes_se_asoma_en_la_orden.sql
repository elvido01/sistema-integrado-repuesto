-- ============================================================
-- LA LISTA DE PENDIENTES SE ASOMA EN LA ORDEN
-- ============================================================
-- El Suplidor Virtual se volvió un cementerio: 46 notas, 39 escritas a mano
-- ("guia valvula platina 125"), 30 todavía en Pendiente y 29 de ellas pasadas
-- de los 30 días. Como esas piezas NO existen en el catálogo, nada más en el
-- sistema las recuerda. Si el dueño no entra a esa pantalla, se olvidan.
--
-- >>> LA IDEA DEL DUEÑO, COMPROBADA CONTRA SUS COMPRAS <<<
-- «Si me aparece sugerido en la compra de MAGNA, que es el suplidor que más
--  mercancía PLATINA le compro, no se quedaría en el olvido.»
-- Y es verdad: el 74% de lo que compró en 12 meses con PLATINA en la
-- descripción salió de MAGNA MOTORS. STRYKER->G&G 84%, APACHE->G&G 83%,
-- PRUSS/GY3->MOTORES DEL SUR 60%, GATO->SUPER GATO 96%. La asociación que él
-- hace de memoria ya está escrita en sus propias facturas.
--
-- >>> QUÉ HACE ESTE ARCHIVO <<<
--   FASE 1  get_sugerencias_suplidor_virtual(suplidor) — al elegir suplidor en
--           la Orden de Compra, dice qué pendientes parecen de él y POR QUÉ.
--   FASE 2  suplidor_virtual_aprendizaje — cada vez que el dueño acepta o
--           rechaza una sugerencia, esa corrección pesa más que la estadística.
--   FASE 3  las notas a mano dejan de vencerse, y se cierran solas cuando la
--           orden donde entraron se recibe.
--
-- >>> CÓMO ADIVINA (y por qué no inventa) <<<
-- De sus compras (18 meses, peso 1) y su catálogo (peso 0.5) sale un
-- diccionario de palabras y pares de palabras. Cada palabra vale según lo
-- CONCENTRADA que esté en un suplidor (conc²): "platina" delata, "eje" no dice
-- nada porque todos se lo venden. La nota se parte igual y gana el suplidor con
-- más votos. Se devuelve el porcentaje y las palabras que decidieron, para que
-- el dueño juzgue — nada entra solo a la orden.
--
-- Probado contra las 30 notas reales de Repuestos Morla: las 14 con respuesta
-- defendible salieron correctas (4 de PLATINA->MAGNA, 3 de STRYKER->G&G, 3 de
-- PRESS CUB->PEDRO RACING, HLX150->G&G, APACHE->G&G, XPRESS->PEDRO RACING
-- ECOSPEED, PRUSS/GY3->MOTORES DEL SUR). Ninguna quedó sin pista, ninguna mal.
--
-- >>> LA REGLA QUE NO SE PUEDE ROMPER <<<
-- Si la nota salió de un producto que un suplidor NO TENÍA, jamás se le vuelve
-- a sugerir a ese mismo suplidor. Ese es el sentido del Suplidor Virtual. Se
-- ofrece al segundo.
-- ============================================================

SELECT public.registrar_migracion('la_lista_de_pendientes_se_asoma_en_la_orden.sql');

-- ============================================================
-- FASE 3 — La nota a mano no se vence (y se cierra sola)
-- ============================================================
-- El reloj de 30 días existe para dejar de pedirle una pieza al suplidor que no
-- la tenía. Una nota escrita a mano no bloquea a nadie: es una lista de compras.
-- Por eso las notas libres (producto_id IS NULL) pasan a no tener vencimiento.
ALTER TABLE public.suplidor_virtual_items
  ALTER COLUMN expira_at DROP NOT NULL;

COMMENT ON COLUMN public.suplidor_virtual_items.expira_at IS
  'Hasta cuando NO se le pide la pieza al suplidor original. NULL = nota escrita a mano: no vence, sale de la lista cuando se compra o se cancela.';

UPDATE public.suplidor_virtual_items
   SET expira_at = NULL, updated_at = NOW()
 WHERE producto_id IS NULL
   AND estado = 'pendiente';

-- Dónde se pidió por fin
ALTER TABLE public.suplidor_virtual_items
  ADD COLUMN IF NOT EXISTS orden_compra_pedida_id UUID,
  ADD COLUMN IF NOT EXISTS pedida_at TIMESTAMPTZ;

COMMENT ON COLUMN public.suplidor_virtual_items.orden_compra_pedida_id IS
  'Orden de compra donde el pendiente entro como linea. Al recibirse, la nota se marca comprada sola.';

CREATE INDEX IF NOT EXISTS idx_supvirt_orden_pedida
  ON public.suplidor_virtual_items(orden_compra_pedida_id)
  WHERE orden_compra_pedida_id IS NOT NULL;

-- El bloqueo al suplidor original: NULL ya no significa "bloqueado para siempre".
CREATE OR REPLACE FUNCTION public.producto_en_suplidor_virtual(p_producto_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $fn$
  SELECT EXISTS(
    SELECT 1
    FROM public.suplidor_virtual_items
    WHERE tenant_id = public.get_user_tenant()
      AND producto_id = p_producto_id
      AND estado = 'pendiente'
      AND expira_at IS NOT NULL
      AND expira_at > NOW()
  );
$fn$;

-- Cuando la línea de la orden se recibe, el pendiente se cierra solo.
CREATE OR REPLACE FUNCTION public.suplidor_virtual_cerrar_al_recibir()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_suplidor UUID;
BEGIN
  IF NEW.estado_linea IS DISTINCT FROM 'recibida'
     OR COALESCE(OLD.estado_linea, '') = 'recibida' THEN
    RETURN NEW;
  END IF;

  SELECT suplidor_id INTO v_suplidor
    FROM public.ordenes_compra WHERE id = NEW.orden_compra_id;

  -- 1) La línea que llegó cierra su nota (por producto o por el texto tal cual).
  UPDATE public.suplidor_virtual_items s
     SET estado = 'comprado',
         comprado_a_suplidor_id = COALESCE(s.comprado_a_suplidor_id, v_suplidor),
         updated_at = NOW()
   WHERE s.orden_compra_pedida_id = NEW.orden_compra_id
     AND s.estado = 'pendiente'
     AND (
          (NEW.producto_id IS NOT NULL AND s.producto_id = NEW.producto_id)
       OR upper(public._sin_tildes(COALESCE(s.descripcion, '')))
        = upper(public._sin_tildes(COALESCE(NEW.descripcion, '')))
     );

  -- 2) Si ya no queda nada por recibir en esa orden, se cierra el resto
  --    (cubre las líneas cuyo texto el dueño editó antes de mandarla).
  IF NOT EXISTS (
    SELECT 1 FROM public.ordenes_compra_detalle x
     WHERE x.orden_compra_id = NEW.orden_compra_id
       AND x.estado_linea IN ('pendiente', 'parcial')
  ) THEN
    UPDATE public.suplidor_virtual_items s
       SET estado = 'comprado',
           comprado_a_suplidor_id = COALESCE(s.comprado_a_suplidor_id, v_suplidor),
           updated_at = NOW()
     WHERE s.orden_compra_pedida_id = NEW.orden_compra_id
       AND s.estado = 'pendiente';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_supvirt_cerrar_al_recibir ON public.ordenes_compra_detalle;
CREATE TRIGGER trg_supvirt_cerrar_al_recibir
  AFTER UPDATE OF estado_linea ON public.ordenes_compra_detalle
  FOR EACH ROW
  EXECUTE FUNCTION public.suplidor_virtual_cerrar_al_recibir();

-- ============================================================
-- FASE 2 — Lo que el dueño corrige pesa más que la estadística
-- ============================================================
CREATE TABLE IF NOT EXISTS public.suplidor_virtual_aprendizaje (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  palabra      TEXT NOT NULL,
  suplidor_id  UUID NOT NULL REFERENCES public.proveedores(id) ON DELETE CASCADE,
  aciertos     INT  NOT NULL DEFAULT 0,
  rechazos     INT  NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, palabra, suplidor_id)
);

COMMENT ON TABLE public.suplidor_virtual_aprendizaje IS
  'Cada vez que el dueno mete un pendiente en la orden de X (o dice "no es de aqui"), las palabras de esa nota votan por X. Manda sobre la estadistica de compras.';

CREATE INDEX IF NOT EXISTS idx_supvirt_aprend_tenant_palabra
  ON public.suplidor_virtual_aprendizaje(tenant_id, palabra);

ALTER TABLE public.suplidor_virtual_aprendizaje ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supvirt_aprend_select ON public.suplidor_virtual_aprendizaje;
CREATE POLICY supvirt_aprend_select ON public.suplidor_virtual_aprendizaje
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS supvirt_aprend_insert ON public.suplidor_virtual_aprendizaje;
CREATE POLICY supvirt_aprend_insert ON public.suplidor_virtual_aprendizaje
  FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS supvirt_aprend_update ON public.suplidor_virtual_aprendizaje;
CREATE POLICY supvirt_aprend_update ON public.suplidor_virtual_aprendizaje
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

-- ============================================================
-- El tokenizador: una sola forma de partir el texto
-- ============================================================
-- Palabras sueltas (peso 1) y pares de palabras seguidas (peso 2, delatan más).
-- Fuera lo de menos de 3 letras y los números pelados: "125" está en media
-- tienda. Lo usan el diccionario, las notas y el aprendizaje — si esto cambia,
-- cambia para los tres a la vez.
CREATE OR REPLACE FUNCTION public._sv_tokens(p_texto TEXT)
RETURNS TABLE (w TEXT, f NUMERIC)
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $fn$
  WITH t AS (
    SELECT u.w AS w, u.o AS o
    FROM unnest(regexp_split_to_array(
           lower(public._sin_tildes(COALESCE(p_texto, ''))), '[^a-z0-9]+'
         )) WITH ORDINALITY AS u(w, o)
    WHERE length(u.w) >= 3 AND u.w !~ '^[0-9]+$'
  )
  SELECT t.w, 1::numeric FROM t
  UNION ALL
  SELECT a.w || ' ' || b.w, 2::numeric
  FROM t a JOIN t b ON b.o = a.o + 1;
$fn$;

GRANT EXECUTE ON FUNCTION public._sv_tokens(TEXT) TO authenticated;

-- ============================================================
-- FASE 1 — Qué pendientes parecen de este suplidor
-- ============================================================
-- p_suplidor_id NULL = "dime de quién parece cada pendiente" (para la pantalla
-- del Suplidor Virtual). Con suplidor = marca cuáles son de él (coincide).
CREATE OR REPLACE FUNCTION public.get_sugerencias_suplidor_virtual(
  p_suplidor_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id                   UUID,
  descripcion          TEXT,
  codigo               TEXT,
  producto_id          UUID,
  cantidad_sugerida    NUMERIC,
  precio_referencia    NUMERIC,
  marcado_at           TIMESTAMPTZ,
  dias_esperando       INT,
  suplidor_original_id UUID,
  suplidor_original    TEXT,
  suplidor_sugerido_id UUID,
  suplidor_sugerido    TEXT,
  confianza            INT,
  motivo               TEXT,
  coincide             BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
WITH tenant AS (SELECT public.get_user_tenant() AS t),

-- De dónde sale el diccionario: lo que compró y lo que tiene catalogado
fuente AS (
  SELECT c.suplidor_id, cd.descripcion AS d, 1.0::numeric AS peso
  FROM public.compras_detalle cd
  JOIN public.compras c ON c.id = cd.compra_id
  CROSS JOIN tenant
  WHERE cd.tenant_id = tenant.t
    AND c.suplidor_id IS NOT NULL
    AND c.fecha >= current_date - 540
    AND cd.descripcion IS NOT NULL
  UNION ALL
  SELECT p.suplidor_id, p.descripcion, 0.5
  FROM public.productos p
  CROSS JOIN tenant
  WHERE p.tenant_id = tenant.t
    AND p.suplidor_id IS NOT NULL
    AND p.descripcion IS NOT NULL
),
corpus AS (
  SELECT f.suplidor_id, tk.w, sum(f.peso) AS n
  FROM fuente f, LATERAL public._sv_tokens(f.d) tk
  GROUP BY 1, 2
),
suma AS (
  SELECT w, suplidor_id, n, sum(n) OVER (PARTITION BY w) AS tot
  FROM corpus
),
-- La palabra vale según lo concentrada que esté (conc²) y cuánto se ha visto.
dic AS (
  SELECT w, suplidor_id,
         n / tot                            AS p,
         tot,
         max(n / tot) OVER (PARTITION BY w) AS conc
  FROM suma
  WHERE tot >= 4
),

-- Lo que el dueño ya corrigió a mano manda sobre lo anterior
apr AS (
  SELECT a.palabra AS w, a.suplidor_id,
         GREATEST(a.aciertos - a.rechazos, 0)::numeric AS v
  FROM public.suplidor_virtual_aprendizaje a
  CROSS JOIN tenant
  WHERE a.tenant_id = tenant.t
),
apr_suma AS (
  SELECT w, suplidor_id, v, sum(v) OVER (PARTITION BY w) AS tot
  FROM apr WHERE v > 0
),
apr_dic AS (
  SELECT w, suplidor_id, v / tot AS p, tot,
         max(v / tot) OVER (PARTITION BY w) AS conc
  FROM apr_suma WHERE tot > 0
),

-- Los pendientes
notas AS (
  SELECT s.id, s.descripcion, s.codigo, s.producto_id, s.cantidad_sugerida,
         s.precio_referencia, s.marcado_at, s.suplidor_original_id
  FROM public.suplidor_virtual_items s
  CROSS JOIN tenant
  WHERE s.tenant_id = tenant.t
    AND s.estado = 'pendiente'
    AND s.orden_compra_pedida_id IS NULL
),
nw AS (
  SELECT n.id, tk.w, tk.f
  FROM notas n, LATERAL public._sv_tokens(n.descripcion) tk
),

-- Camino corto: la nota nació de un producto de verdad.
-- A quién se lo compró la última vez vale más que cualquier estadística.
por_producto AS (
  SELECT DISTINCT ON (n.id)
         n.id, c.suplidor_id, 95 AS confianza, 'ya se lo compraste a él'::text AS motivo
  FROM notas n
  JOIN public.compras_detalle cd ON cd.producto_id = n.producto_id
  JOIN public.compras c ON c.id = cd.compra_id AND c.suplidor_id IS NOT NULL
  CROSS JOIN tenant
  WHERE n.producto_id IS NOT NULL
    AND cd.tenant_id = tenant.t
    AND c.suplidor_id IS DISTINCT FROM n.suplidor_original_id
  ORDER BY n.id, c.fecha DESC
),
por_catalogo AS (
  SELECT n.id, p.suplidor_id, 80 AS confianza, 'es su suplidor en la mercancía'::text AS motivo
  FROM notas n
  JOIN public.productos p ON p.id = n.producto_id
  WHERE p.suplidor_id IS NOT NULL
    AND p.suplidor_id IS DISTINCT FROM n.suplidor_original_id
    AND NOT EXISTS (SELECT 1 FROM por_producto pp WHERE pp.id = n.id)
),

-- Camino largo: adivinar por el texto
voto AS (
  SELECT nw.id, d.suplidor_id,
         sum(nw.f * d.p * d.conc * d.conc * ln(1 + d.tot)) AS score,
         (array_agg(d.w ORDER BY nw.f * d.p * d.conc * d.conc * ln(1 + d.tot) DESC))[1:2] AS palabras
  FROM nw
  JOIN dic d ON d.w = nw.w
  GROUP BY 1, 2
  UNION ALL
  -- una corrección del dueño vale por tres facturas
  SELECT nw.id, a.suplidor_id,
         sum(3 * nw.f * a.p * a.conc * a.conc * ln(2 + a.tot)),
         (array_agg(a.w ORDER BY a.p * a.conc DESC))[1:2]
  FROM nw
  JOIN apr_dic a ON a.w = nw.w
  GROUP BY 1, 2
),
-- Se suman los dos votos (facturas + correcciones) pero las palabras que se
-- muestran son las del voto más fuerte, en su orden — no en orden alfabético.
voto_junto AS (
  SELECT DISTINCT ON (v.id, v.suplidor_id)
         v.id, v.suplidor_id,
         sum(v.score) OVER (PARTITION BY v.id, v.suplidor_id) AS score,
         v.palabras
  FROM voto v
  ORDER BY v.id, v.suplidor_id, v.score DESC
),
-- Al que no la tenía no se le vuelve a pedir.
voto_limpio AS (
  SELECT v.*
  FROM voto_junto v
  JOIN notas n ON n.id = v.id
  WHERE v.suplidor_id IS DISTINCT FROM n.suplidor_original_id
    AND NOT EXISTS (SELECT 1 FROM por_producto pp WHERE pp.id = v.id)
    AND NOT EXISTS (SELECT 1 FROM por_catalogo pc WHERE pc.id = v.id)
),
por_texto AS (
  SELECT DISTINCT ON (id) id, suplidor_id,
         round(100 * score / NULLIF(sum(score) OVER (PARTITION BY id), 0))::int AS confianza,
         'por: ' || array_to_string(palabras, ', ') AS motivo
  FROM voto_limpio
  ORDER BY id, score DESC
),
elegido AS (
  SELECT * FROM por_producto
  UNION ALL SELECT * FROM por_catalogo
  UNION ALL SELECT * FROM por_texto
)
SELECT n.id, n.descripcion, n.codigo, n.producto_id,
       n.cantidad_sugerida, n.precio_referencia, n.marcado_at,
       GREATEST(0, (current_date - n.marcado_at::date))::int AS dias_esperando,
       n.suplidor_original_id,
       po.nombre AS suplidor_original,
       e.suplidor_id AS suplidor_sugerido_id,
       pr.nombre     AS suplidor_sugerido,
       e.confianza,
       e.motivo,
       (p_suplidor_id IS NOT NULL AND e.suplidor_id = p_suplidor_id) AS coincide
FROM notas n
LEFT JOIN elegido e ON e.id = n.id
LEFT JOIN public.proveedores pr ON pr.id = e.suplidor_id
LEFT JOIN public.proveedores po ON po.id = n.suplidor_original_id
ORDER BY (p_suplidor_id IS NOT NULL AND e.suplidor_id = p_suplidor_id) DESC,
         e.confianza DESC NULLS LAST,
         n.marcado_at DESC;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_sugerencias_suplidor_virtual(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_sugerencias_suplidor_virtual(UUID) IS
  'Pendientes del Suplidor Virtual con el suplidor que parece dueno de cada uno, el porcentaje y las palabras que lo decidieron. Nunca sugiere al suplidor que no la tenia.';

-- ============================================================
-- FASE 2 (bis) — Guardar la corrección
-- ============================================================
-- p_acierto true  = el dueño metió el pendiente en la orden de ese suplidor
-- p_acierto false = dijo "no es de aquí"
CREATE OR REPLACE FUNCTION public.aprender_suplidor_virtual(
  p_item_id     UUID,
  p_suplidor_id UUID,
  p_acierto     BOOLEAN DEFAULT true
)
RETURNS INT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant UUID := public.get_user_tenant();
  v_texto  TEXT;
  n        INT;
BEGIN
  SELECT descripcion INTO v_texto
    FROM public.suplidor_virtual_items
   WHERE id = p_item_id AND tenant_id = v_tenant;

  IF v_texto IS NULL OR p_suplidor_id IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.suplidor_virtual_aprendizaje
        (tenant_id, palabra, suplidor_id, aciertos, rechazos)
  SELECT v_tenant, tk.w, p_suplidor_id,
         CASE WHEN p_acierto THEN 1 ELSE 0 END,
         CASE WHEN p_acierto THEN 0 ELSE 1 END
  FROM public._sv_tokens(v_texto) tk
  GROUP BY tk.w
  ON CONFLICT (tenant_id, palabra, suplidor_id) DO UPDATE
     SET aciertos   = public.suplidor_virtual_aprendizaje.aciertos
                    + CASE WHEN p_acierto THEN 1 ELSE 0 END,
         rechazos   = public.suplidor_virtual_aprendizaje.rechazos
                    + CASE WHEN p_acierto THEN 0 ELSE 1 END,
         updated_at = NOW();

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.aprender_suplidor_virtual(UUID, UUID, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- PRUEBA — contra los pendientes de verdad, no contra un invento
-- ============================================================
-- Solo revienta si falla: este archivo cambia datos y estructura, y una
-- excepción se llevaría el trabajo por delante.
DO $prueba$
DECLARE
  v_tenant   UUID;
  v_usuario  UUID;
  v_platina  UUID;
  v_nombre   TEXT;
  v_total    INT;
  v_conpista INT;
  v_ok       INT := 0;
  v_mal      INT := 0;
BEGIN
  -- La empresa que tiene pendientes escritos a mano y compras que consultar.
  SELECT s.tenant_id INTO v_tenant
    FROM public.suplidor_virtual_items s
   WHERE s.estado = 'pendiente'
   GROUP BY s.tenant_id
   ORDER BY count(*) DESC
   LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE NOTICE 'No hay pendientes en ninguna empresa. Funciones creadas igual.';
    RETURN;
  END IF;

  SELECT p.id INTO v_usuario
    FROM public.profiles p
    JOIN public.usuario_tenant_activo a ON a.user_id = p.id AND a.tenant_id = p.tenant_id
   WHERE p.tenant_id = v_tenant
   LIMIT 1;

  IF v_usuario IS NULL THEN
    RAISE NOTICE 'La empresa % no tiene usuario con sesion para impersonar. Funciones creadas igual.', v_tenant;
    RETURN;
  END IF;

  -- Quién le vende de verdad lo de PLATINA, calculado aparte de la funcion.
  SELECT c.suplidor_id, pr.nombre INTO v_platina, v_nombre
    FROM public.compras_detalle cd
    JOIN public.compras c ON c.id = cd.compra_id
    JOIN public.proveedores pr ON pr.id = c.suplidor_id
   WHERE cd.tenant_id = v_tenant
     AND c.fecha >= current_date - 540
     AND public._sin_tildes(cd.descripcion) ILIKE '%PLATINA%'
   GROUP BY c.suplidor_id, pr.nombre
   ORDER BY count(*) DESC
   LIMIT 1;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  SELECT count(*), count(*) FILTER (WHERE g.suplidor_sugerido_id IS NOT NULL)
    INTO v_total, v_conpista
    FROM public.get_sugerencias_suplidor_virtual(NULL) g;

  IF v_platina IS NOT NULL THEN
    SELECT count(*) FILTER (WHERE g.suplidor_sugerido_id = v_platina),
           count(*) FILTER (WHERE g.suplidor_sugerido_id IS DISTINCT FROM v_platina)
      INTO v_ok, v_mal
      FROM public.get_sugerencias_suplidor_virtual(v_platina) g
     WHERE public._sin_tildes(g.descripcion) ILIKE '%platina%'
       AND g.producto_id IS NULL;
  END IF;

  RESET ROLE;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'La funcion no devolvio ni un pendiente para la empresa %. Revisa RLS o el estado.', v_tenant;
  END IF;

  IF v_platina IS NOT NULL AND v_ok = 0 AND v_mal > 0 THEN
    RAISE EXCEPTION 'Las % notas de PLATINA no cayeron en % — el motor no esta leyendo las compras.', v_mal, v_nombre;
  END IF;

  RAISE NOTICE 'Pendientes vistos: %  ·  con suplidor sugerido: %', v_total, v_conpista;
  IF v_platina IS NOT NULL THEN
    RAISE NOTICE 'Notas de PLATINA que caen en %: % (fuera: %)', v_nombre, v_ok, v_mal;
  END IF;
END $prueba$;
