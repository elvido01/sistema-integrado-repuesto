-- =====================================================================
-- CENTINELAS DEL FLUJO — Fase 1
-- ---------------------------------------------------------------------
-- (2026-08-23) El dueno encontro cinco errores del modulo de compras con
-- su propio conocimiento del negocio, y le costo tiempo y dinero llegar
-- ahi. Ninguno de los cinco rompio nada: no hubo pantalla roja, no hubo
-- excepcion, no hubo registro. El sistema contesto, y contesto mal.
--
-- >>> POR QUE NO SIRVE LO QUE YA HAY <<<
-- Ya existe `ai_alerts` y corre a diario. Hoy tiene 297 avisos pendientes
-- sin tocar desde mayo. Y esta ciego donde importa: ai_detect_stock_bajo
-- exige min_stock > 0, y solo 339 de 3,749 productos activos (9%) lo
-- tienen. El cilindro que motivo todo esto vivia en el 91% invisible.
--
-- Un sistema que avisa de 297 cosas no avisa de ninguna.
--
-- >>> LA IDEA <<<
-- Un centinela no vigila errores: vigila UNA FRASE QUE TIENE QUE SER
-- VERDAD. Si deja de serlo, hay dinero moviendose mal. Tres familias:
--
--   contradiccion — el dato se contradice solo
--   silencio      — algo que pasa todos los dias dejo de pasar
--   fuga          — dinero saliendo callado
--   autochequeo   — el sistema mismo dejo de hacer su trabajo (fase 3)
--
-- >>> LAS DOS REGLAS QUE EVITAN LOS 297 <<<
--
-- 1. EL HALLAZGO MUERE SOLO. No hay "marcar como leido". Cada corrida
--    mata lo que ya no aparece. Nadie mantiene una bandeja: si el
--    problema se arreglo, el aviso desaparece sin que nadie lo toque.
--    Eso es exactamente lo que ai_alerts no hace y por eso lleva 297.
--
-- 2. SOLO SE HABLA CUANDO ALGO CAMBIA. Un "todo bien" diario entrena a
--    ignorar el canal. Si no hay nada nuevo, Hermes se calla.
--
-- Y para el falso positivo, que siempre lo hay: se silencia a mano. No se
-- intenta adivinar con reglas cada excepcion del negocio — el dueno sabe
-- cual es un servicio de taller y cual es una pieza, y decirlo una vez es
-- mas barato que una regla que se equivoque para siempre.
--
-- Idempotente.
-- =====================================================================

-- ------------------------------------------------------------
-- 1. Las definiciones
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.centinelas (
  clave        text PRIMARY KEY,
  titulo       text NOT NULL,
  familia      text NOT NULL CHECK (familia IN ('contradiccion','silencio','fuga','autochequeo')),
  severidad    text NOT NULL CHECK (severidad IN ('rojo','amarillo','gris')),
  funcion      text NOT NULL,          -- public.<funcion>(tenant) -> hallazgos
  descripcion  text,
  activo       boolean NOT NULL DEFAULT true,
  orden        int NOT NULL DEFAULT 100,
  ultima_corrida timestamptz,
  ultimo_error   text
);

COMMENT ON TABLE public.centinelas IS
  'Cada fila es una frase que tiene que ser verdad en el negocio. Si deja de serlo, aparece un hallazgo.';

-- ------------------------------------------------------------
-- 2. Los hallazgos — con muerte automatica
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.centinela_hallazgos (
  id            bigserial PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  centinela     text NOT NULL REFERENCES public.centinelas(clave) ON DELETE CASCADE,
  -- Identifica el hallazgo CONCRETO (un producto, una orden, un dia). Es
  -- lo que permite reconocerlo entre corridas en vez de crear uno nuevo
  -- cada vez — que es como ai_alerts llego a 100 filas del mismo aviso.
  huella        text NOT NULL,
  titulo        text NOT NULL,
  detalle       text,
  monto         numeric,               -- el dinero en juego, si se puede medir
  datos         jsonb NOT NULL DEFAULT '{}'::jsonb,
  visto_primero timestamptz NOT NULL DEFAULT now(),
  visto_ultimo  timestamptz NOT NULL DEFAULT now(),
  murio_en      timestamptz,           -- NULL = vivo
  avisado_en    timestamptz,           -- cuando se conto por el canal
  UNIQUE (tenant_id, centinela, huella)
);

CREATE INDEX IF NOT EXISTS ix_hallazgos_vivos
  ON public.centinela_hallazgos (tenant_id, centinela)
  WHERE murio_en IS NULL;

CREATE INDEX IF NOT EXISTS ix_hallazgos_por_avisar
  ON public.centinela_hallazgos (tenant_id)
  WHERE murio_en IS NULL AND avisado_en IS NULL;

-- ------------------------------------------------------------
-- 3. Lo que el dueno no quiere volver a oir
-- ------------------------------------------------------------
-- SERV-MAGNA es un servicio de taller, no una pieza: sale en "agotado sin
-- pedir" y nunca hay que comprarlo. Ninguna regla automatica va a saber
-- eso. La persona lo dice una vez y se acabo.
CREATE TABLE IF NOT EXISTS public.centinela_silenciados (
  tenant_id  uuid NOT NULL,
  centinela  text NOT NULL,
  huella     text NOT NULL,            -- '*' silencia el centinela entero
  motivo     text,
  hasta      date,                     -- NULL = para siempre
  creado_en  timestamptz NOT NULL DEFAULT now(),
  creado_por uuid,
  PRIMARY KEY (tenant_id, centinela, huella)
);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE public.centinela_hallazgos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.centinela_silenciados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hallazgos_propios ON public.centinela_hallazgos;
CREATE POLICY hallazgos_propios ON public.centinela_hallazgos
  FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

DROP POLICY IF EXISTS silenciados_propios ON public.centinela_silenciados;
CREATE POLICY silenciados_propios ON public.centinela_silenciados
  FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant())
  WITH CHECK (tenant_id = public.get_user_tenant());

-- Las definiciones son del sistema, iguales para todos: se leen, no se tocan.
ALTER TABLE public.centinelas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS centinelas_lectura ON public.centinelas;
CREATE POLICY centinelas_lectura ON public.centinelas
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.centinelas TO authenticated;
GRANT SELECT ON public.centinela_hallazgos TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.centinela_silenciados TO authenticated;


-- =====================================================================
-- LOS CENTINELAS DE LA FASE 1
-- ---------------------------------------------------------------------
-- Todos devuelven la misma forma para que el motor no sepa de negocio:
--   huella, titulo, detalle, monto, datos
-- =====================================================================

-- ------------------------------------------------------------
-- FUGA — Agotado, con venta, y en ninguna orden
-- ------------------------------------------------------------
-- El bug del cilindro, generalizado. Un producto que se vende, que esta
-- en cero, y que no esta en ninguna orden abierta no se va a reponer
-- solo: cada dia que pasa es una venta que se va donde el de al lado.
--
-- Se exige que haya tenido ENTRADA alguna vez — sin eso entran productos
-- que nunca se compraron y solo ensucian.
CREATE OR REPLACE FUNCTION public.centinela_agotado_sin_pedir(p_tenant_id uuid)
RETURNS TABLE(huella text, titulo text, detalle text, monto numeric, datos jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  WITH vend AS (
    SELECT fd.producto_id, SUM(fd.cantidad) AS und, SUM(fd.importe) AS fact
    FROM public.facturas_detalle fd
    JOIN public.facturas f ON f.id = fd.factura_id
    WHERE fd.tenant_id = p_tenant_id
      AND f.fecha >= now() - interval '60 days'
      AND COALESCE(f.estado, '') <> 'ANULADA'
      AND fd.producto_id IS NOT NULL
    GROUP BY 1
  ),
  en_orden AS (
    -- Cualquier orden viva cuenta, incluido el BORRADOR: si ya esta
    -- apuntado para la proxima visita del suplidor, no hay nada que avisar.
    SELECT DISTINCT d.producto_id
    FROM public.ordenes_compra_detalle d
    JOIN public.ordenes_compra oc ON oc.id = d.orden_compra_id
    WHERE oc.tenant_id = p_tenant_id
      AND COALESCE(oc.estado, 'Pendiente') IN ('Pendiente', 'Enviada', 'Parcial')
      AND COALESCE(d.estado_linea, 'pendiente') IN ('pendiente', 'parcial')
      AND d.producto_id IS NOT NULL
  )
  SELECT
    p.id::text,
    format('%s sin existencia y sin pedir', COALESCE(p.codigo, '?')),
    format('%s — vendio %s und. en 60 dias (RD$%s) y esta en cero. No aparece en ninguna orden%s.',
           left(COALESCE(p.descripcion, ''), 48),
           round(v.und, 0),
           to_char(round(v.fact, 0), 'FM999,999,999'),
           CASE WHEN pr.nombre IS NULL THEN ', y ademas no tiene suplidor asignado'
                ELSE format('. Suplidor: %s', pr.nombre) END),
    round(v.fact, 2),
    jsonb_build_object(
      'producto_id', p.id, 'codigo', p.codigo, 'descripcion', p.descripcion,
      'und_60d', v.und, 'facturado_60d', round(v.fact, 2),
      'suplidor_id', p.suplidor_id, 'suplidor', pr.nombre)
  FROM public.productos p
  JOIN vend v ON v.producto_id = p.id
  LEFT JOIN public.proveedores pr ON pr.id = p.suplidor_id
  WHERE p.tenant_id = p_tenant_id
    AND COALESCE(p.activo, true)
    AND public.get_stock_actual(p.id) <= 0
    AND NOT EXISTS (SELECT 1 FROM en_orden e WHERE e.producto_id = p.id)
    AND EXISTS (SELECT 1 FROM public.inventario_movimientos im
                 WHERE im.producto_id = p.id AND im.tipo::text = 'ENTRADA')
  ORDER BY v.fact DESC;
$fn$;

-- ------------------------------------------------------------
-- CONTRADICCION — Mercancia en camino que nunca llego
-- ------------------------------------------------------------
-- Una orden pedida hace mas de su ventana con lineas todavia "pendientes"
-- es una mentira: el calculo de reposicion las cuenta como en camino y
-- por eso no vuelve a pedir la pieza. Un hallazgo por ORDEN, no por
-- linea: lo que se hace con esto es reclamarle al suplidor, y se le
-- reclama la orden entera.
CREATE OR REPLACE FUNCTION public.centinela_camino_fantasma(p_tenant_id uuid)
RETURNS TABLE(huella text, titulo text, detalle text, monto numeric, datos jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT
    oc.id::text,
    format('%s lleva %s dias sin completarse', oc.numero,
           (CURRENT_DATE - oc.fecha_orden::date)),
    format('%s: %s lineas (%s und.) siguen contando como "en camino" desde el %s. Mientras esten asi, la reposicion automatica no vuelve a pedir esas piezas.',
           COALESCE(pr.nombre, 'Suplidor sin nombre'),
           count(*), round(SUM(x.falto), 0),
           to_char(oc.fecha_orden::date, 'DD/MM/YYYY')),
    round(SUM(x.falto * COALESCE(x.precio, 0)), 2),
    jsonb_build_object(
      'orden_id', oc.id, 'numero', oc.numero,
      'suplidor_id', oc.suplidor_id, 'suplidor', pr.nombre,
      'fecha_orden', oc.fecha_orden, 'lineas', count(*),
      'unidades', round(SUM(x.falto), 0),
      'ventana_dias', public.dias_caducidad_orden(oc.suplidor_id))
  FROM public.ordenes_compra oc
  JOIN public.proveedores pr ON pr.id = oc.suplidor_id
  JOIN LATERAL (
    SELECT d.precio,
           GREATEST(COALESCE(d.cantidad_pedida, d.cantidad, 0)
                    - COALESCE(d.cantidad_recibida, 0), 0) AS falto
    FROM public.ordenes_compra_detalle d
    WHERE d.orden_compra_id = oc.id
      AND COALESCE(d.estado_linea, 'pendiente') IN ('pendiente', 'parcial')
      AND d.reclamada_at IS NULL
  ) x ON true
  WHERE oc.tenant_id = p_tenant_id
    AND COALESCE(oc.estado, 'Pendiente') IN ('Enviada', 'Parcial')
    AND oc.fecha_orden < CURRENT_DATE - public.dias_caducidad_orden(oc.suplidor_id)
  GROUP BY oc.id, oc.numero, oc.suplidor_id, oc.fecha_orden, pr.nombre
  HAVING SUM(x.falto) > 0;
$fn$;

-- ------------------------------------------------------------
-- CONTRADICCION — Producto sin suplidor
-- ------------------------------------------------------------
-- Un producto sin suplidor no entra en NINGUNA orden automatica, para
-- siempre. Es invisible por diseno. Va como UN solo hallazgo: no son 54
-- problemas, es un problema de 54 piezas y se resuelve de una sentada.
CREATE OR REPLACE FUNCTION public.centinela_sin_suplidor(p_tenant_id uuid)
RETURNS TABLE(huella text, titulo text, detalle text, monto numeric, datos jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  WITH huerfanos AS (
    SELECT p.id, p.codigo, p.descripcion,
           (public.get_stock_actual(p.id) <= 0) AS agotado
    FROM public.productos p
    WHERE p.tenant_id = p_tenant_id
      AND COALESCE(p.activo, true)
      AND p.suplidor_id IS NULL
  )
  SELECT
    'todos'::text,
    format('%s productos activos no tienen suplidor', count(*)),
    format('Ninguno puede entrar en una orden automatica. %s de ellos ya estan agotados: %s%s',
           count(*) FILTER (WHERE agotado),
           (SELECT string_agg(codigo, ', ') FROM (
              SELECT codigo FROM huerfanos WHERE agotado ORDER BY codigo LIMIT 6) t),
           CASE WHEN count(*) FILTER (WHERE agotado) > 6 THEN '...' ELSE '' END),
    NULL::numeric,
    jsonb_build_object(
      'total', count(*),
      'agotados', count(*) FILTER (WHERE agotado),
      'codigos', (SELECT jsonb_agg(codigo ORDER BY codigo)
                    FROM (SELECT codigo FROM huerfanos ORDER BY agotado DESC, codigo LIMIT 60) t))
  FROM huerfanos
  HAVING count(*) > 0;
$fn$;

-- ------------------------------------------------------------
-- FUGA — Vendido por debajo del costo
-- ------------------------------------------------------------
-- Hoy da cero, y eso es justo lo que se quiere ver: confirma que el
-- bloqueo de venta bajo costo sigue vivo. Un centinela en cero es una
-- defensa que respira; el dia que de distinto de cero, el bloqueo se
-- rompio o alguien lo esquivo.
CREATE OR REPLACE FUNCTION public.centinela_venta_bajo_costo(p_tenant_id uuid)
RETURNS TABLE(huella text, titulo text, detalle text, monto numeric, datos jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT
    fd.id::text,
    format('%s se vendio bajo costo', COALESCE(fd.codigo, '?')),
    format('%s — se cobro RD$%s la unidad y cuesta RD$%s. Factura %s del %s.',
           left(COALESCE(fd.descripcion, ''), 40),
           to_char(round(fd.importe / NULLIF(fd.cantidad, 0), 2), 'FM999,999.00'),
           to_char(round(fd.costo_unitario, 2), 'FM999,999.00'),
           COALESCE(f.ncf, f.id::text), to_char(f.fecha, 'DD/MM/YYYY')),
    round((fd.costo_unitario - (fd.importe / NULLIF(fd.cantidad, 0))) * fd.cantidad, 2),
    jsonb_build_object('factura_id', f.id, 'detalle_id', fd.id,
                       'codigo', fd.codigo, 'cantidad', fd.cantidad)
  FROM public.facturas_detalle fd
  JOIN public.facturas f ON f.id = fd.factura_id
  WHERE fd.tenant_id = p_tenant_id
    AND f.fecha >= now() - interval '30 days'
    AND COALESCE(f.estado, '') <> 'ANULADA'
    AND COALESCE(fd.costo_unitario, 0) > 0
    AND fd.cantidad > 0
    AND (fd.importe / NULLIF(fd.cantidad, 0)) < fd.costo_unitario;
$fn$;


-- =====================================================================
-- EL MOTOR
-- =====================================================================
CREATE OR REPLACE FUNCTION public.correr_centinelas(
  p_tenant_id uuid DEFAULT NULL,
  p_solo      text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant  uuid := COALESCE(p_tenant_id, public.get_user_tenant());
  c         record;
  v_marca   timestamptz;
  v_nuevos  int := 0;
  v_vivos   int := 0;
  v_muertos int := 0;
  v_n       int;
  v_detalle jsonb := '[]'::jsonb;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin empresa'; END IF;

  FOR c IN
    SELECT clave, funcion, titulo FROM public.centinelas
    WHERE activo AND (p_solo IS NULL OR clave = p_solo)
    ORDER BY orden, clave
  LOOP
    -- La marca separa "lo que vi en ESTA corrida" de lo anterior. Es lo
    -- que permite matar solo. clock_timestamp() y no now(): now() es fijo
    -- durante toda la transaccion y no distinguiria una corrida de otra.
    v_marca := clock_timestamp();

    BEGIN
      EXECUTE format($q$
        INSERT INTO public.centinela_hallazgos
          (tenant_id, centinela, huella, titulo, detalle, monto, datos, visto_ultimo)
        SELECT $1, $2, h.huella, h.titulo, h.detalle, h.monto, h.datos, $3
        FROM public.%I($1) h
        ON CONFLICT (tenant_id, centinela, huella) DO UPDATE
          SET titulo       = EXCLUDED.titulo,
              detalle      = EXCLUDED.detalle,
              monto        = EXCLUDED.monto,
              datos        = EXCLUDED.datos,
              visto_ultimo = EXCLUDED.visto_ultimo,
              -- Si estaba muerto y volvio, resucita Y se vuelve a contar.
              murio_en     = NULL,
              avisado_en   = CASE WHEN centinela_hallazgos.murio_en IS NOT NULL
                                  THEN NULL ELSE centinela_hallazgos.avisado_en END
      $q$, c.funcion)
      USING v_tenant, c.clave, v_marca;

      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_vivos := v_vivos + v_n;

      -- Lo que estaba vivo y no aparecio en esta corrida: se resolvio.
      -- Muere solo. Aqui es donde este sistema se separa de ai_alerts.
      UPDATE public.centinela_hallazgos
      SET murio_en = now()
      WHERE tenant_id = v_tenant AND centinela = c.clave
        AND murio_en IS NULL AND visto_ultimo < v_marca;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_muertos := v_muertos + v_n;

      UPDATE public.centinelas
      SET ultima_corrida = now(), ultimo_error = NULL WHERE clave = c.clave;

    EXCEPTION WHEN OTHERS THEN
      -- Un centinela roto no puede tumbar a los demas. Pero tampoco puede
      -- quedarse callado: un centinela que falla en silencio es
      -- exactamente el problema que este archivo viene a resolver.
      UPDATE public.centinelas
      SET ultima_corrida = now(), ultimo_error = SQLERRM WHERE clave = c.clave;
      v_detalle := v_detalle || jsonb_build_object('centinela', c.clave, 'error', SQLERRM);
    END;
  END LOOP;

  SELECT count(*) INTO v_nuevos
  FROM public.centinela_hallazgos
  WHERE tenant_id = v_tenant AND murio_en IS NULL AND avisado_en IS NULL;

  RETURN json_build_object(
    'ok', true, 'tenant', v_tenant,
    'vivos', v_vivos, 'murieron', v_muertos, 'por_avisar', v_nuevos,
    'fallos', v_detalle);
END $fn$;

GRANT EXECUTE ON FUNCTION public.correr_centinelas(uuid, text) TO authenticated, service_role;


-- =====================================================================
-- QUE HERMES PUEDA EMPEZAR A HABLAR
-- ---------------------------------------------------------------------
-- Todo el contrato del canal es de tiron: chat_pendientes -> chat_tomar_v5
-- -> chat_responder(p_mensaje_id, ...). TODAS las funciones necesitan el
-- id de un mensaje que ya entro. O sea que hasta hoy Hermes solo sabia
-- hablar cuando le hablaban, y un centinela que no puede avisar no sirve
-- de nada.
--
-- La fila va con rol='hermes' y responde_a NULL. El widget ya sondea
-- hermes_chat cada 4 segundos y pinta como suya cualquier fila
-- rol='hermes': no hace falta tocar nada mas para que aparezca.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.hermes_decir(
  p_tenant_id uuid,
  p_texto     text,
  p_acciones  jsonb DEFAULT NULL,
  p_origen    text  DEFAULT 'centinela'
)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_id bigint;
BEGIN
  IF p_tenant_id IS NULL OR COALESCE(btrim(p_texto), '') = '' THEN RETURN NULL; END IF;

  INSERT INTO public.hermes_chat
    (tenant_id, rol, texto, acciones, estado, respondido, respondido_en,
     responde_a, source_surface)
  VALUES
    (p_tenant_id, 'hermes', p_texto, p_acciones, 'respondido', true, now(),
     NULL, p_origen)
  RETURNING id INTO v_id;

  RETURN v_id;
END $fn$;

GRANT EXECUTE ON FUNCTION public.hermes_decir(uuid, text, jsonb, text) TO authenticated, service_role;

-- El atajo para el gateway del VPS, que trabaja siempre contra Morla —
-- igual que el resto de hermes.chat_*.
CREATE OR REPLACE FUNCTION hermes.chat_iniciar(
  p_texto    text,
  p_acciones jsonb DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT public.hermes_decir('00000000-0000-0000-0000-000000000001'::uuid,
                             p_texto, p_acciones, 'hermes_vps');
$fn$;

GRANT EXECUTE ON FUNCTION hermes.chat_iniciar(text, jsonb) TO service_role;
DO $g$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hermes_readonly') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION hermes.chat_iniciar(text, jsonb) TO hermes_readonly';
  END IF;
END $g$;


-- =====================================================================
-- EL AVISO
-- ---------------------------------------------------------------------
-- p_resumen = false : solo lo ROJO. Es lo que corre cada hora.
-- p_resumen = true  : rojo + amarillo + gris, junto. Una vez en la manana.
--
-- Si no hay nada que contar NO ESCRIBE NADA. Esa es toda la diferencia
-- entre un canal que se lee y uno que se ignora.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.centinelas_avisar(
  p_tenant_id uuid DEFAULT NULL,
  p_resumen   boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant uuid := COALESCE(p_tenant_id, public.get_user_tenant());
  v_sev    text[] := CASE WHEN p_resumen THEN ARRAY['rojo','amarillo','gris']
                                         ELSE ARRAY['rojo'] END;
  v_ids    bigint[];
  v_texto  text := '';
  v_n      int := 0;
  v_plata  numeric := 0;
  v_msg    bigint;
  g        record;
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin empresa'; END IF;

  SELECT array_agg(h.id), count(*), COALESCE(SUM(h.monto), 0)
    INTO v_ids, v_n, v_plata
  FROM public.centinela_hallazgos h
  JOIN public.centinelas c ON c.clave = h.centinela
  WHERE h.tenant_id = v_tenant
    AND h.murio_en IS NULL
    AND h.avisado_en IS NULL
    AND c.severidad = ANY (v_sev)
    AND NOT EXISTS (
      SELECT 1 FROM public.centinela_silenciados s
      WHERE s.tenant_id = v_tenant AND s.centinela = h.centinela
        AND s.huella IN (h.huella, '*')
        AND (s.hasta IS NULL OR s.hasta >= CURRENT_DATE));

  IF COALESCE(v_n, 0) = 0 THEN
    RETURN json_build_object('ok', true, 'avisos', 0, 'callado', true);
  END IF;

  -- Se agrupa por centinela: seis lineas sueltas del mismo problema se
  -- leen como ruido; una frase con seis ejemplos se lee como un aviso.
  FOR g IN
    SELECT c.titulo, c.severidad, count(*) n,
           COALESCE(SUM(h.monto), 0) plata,
           (array_agg(h.detalle ORDER BY COALESCE(h.monto, 0) DESC))[1:4] muestras
    FROM public.centinela_hallazgos h
    JOIN public.centinelas c ON c.clave = h.centinela
    WHERE h.id = ANY (v_ids)
    GROUP BY c.clave, c.titulo, c.severidad, c.orden
    ORDER BY CASE c.severidad WHEN 'rojo' THEN 1 WHEN 'amarillo' THEN 2 ELSE 3 END,
             COALESCE(SUM(h.monto), 0) DESC
  LOOP
    v_texto := v_texto
      || CASE g.severidad WHEN 'rojo' THEN '🔴 ' WHEN 'amarillo' THEN '🟡 ' ELSE '⚪ ' END
      || g.titulo
      || CASE WHEN g.n > 1 THEN format(' (%s)', g.n) ELSE '' END
      || CASE WHEN g.plata > 0
              THEN format(' — RD$%s', to_char(round(g.plata, 0), 'FM999,999,999')) ELSE '' END
      || E'\n';
    v_texto := v_texto || '   • ' || array_to_string(g.muestras, E'\n   • ') || E'\n\n';
  END LOOP;

  v_texto := CASE WHEN p_resumen
                  THEN format('Reviso el flujo de la empresa. %s cosa(s) que mirar hoy:', v_n)
                  ELSE format('Encontre %s cosa(s) que le estan costando dinero ahora mismo:', v_n)
             END || E'\n\n' || v_texto
             || 'Preguntame por cualquiera y lo miro a fondo.';

  v_msg := public.hermes_decir(v_tenant, btrim(v_texto), NULL, 'centinela');

  UPDATE public.centinela_hallazgos SET avisado_en = now() WHERE id = ANY (v_ids);

  RETURN json_build_object('ok', true, 'avisos', v_n,
                           'monto', round(v_plata, 2), 'mensaje_id', v_msg);
END $fn$;

GRANT EXECUTE ON FUNCTION public.centinelas_avisar(uuid, boolean) TO authenticated, service_role;

-- Silenciar un falso positivo desde el chat o desde la pantalla.
CREATE OR REPLACE FUNCTION public.centinela_silenciar(
  p_centinela text,
  p_huella    text,
  p_motivo    text DEFAULT NULL,
  p_hasta     date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_tenant uuid := public.get_user_tenant();
BEGIN
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Sin empresa'; END IF;

  INSERT INTO public.centinela_silenciados (tenant_id, centinela, huella, motivo, hasta, creado_por)
  VALUES (v_tenant, p_centinela, p_huella, p_motivo, p_hasta, auth.uid())
  ON CONFLICT (tenant_id, centinela, huella) DO UPDATE
    SET motivo = EXCLUDED.motivo, hasta = EXCLUDED.hasta, creado_en = now();

  -- Y se da por avisado lo que ya estaba vivo, para que no salga esta noche.
  UPDATE public.centinela_hallazgos
  SET avisado_en = COALESCE(avisado_en, now())
  WHERE tenant_id = v_tenant AND centinela = p_centinela
    AND (p_huella = '*' OR huella = p_huella);

  RETURN json_build_object('ok', true);
END $fn$;

GRANT EXECUTE ON FUNCTION public.centinela_silenciar(text, text, text, date) TO authenticated, service_role;

-- Lo que esta vivo ahora mismo, para la pantalla y para Jarvis.
CREATE OR REPLACE FUNCTION public.get_centinela_hallazgos(p_solo_nuevos boolean DEFAULT false)
RETURNS TABLE(
  id bigint, centinela text, centinela_titulo text, familia text, severidad text,
  huella text, titulo text, detalle text, monto numeric, datos jsonb,
  visto_primero timestamptz, dias int, avisado boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT h.id, h.centinela, c.titulo, c.familia, c.severidad,
         h.huella, h.titulo, h.detalle, h.monto, h.datos,
         h.visto_primero, (CURRENT_DATE - h.visto_primero::date)::int,
         (h.avisado_en IS NOT NULL)
  FROM public.centinela_hallazgos h
  JOIN public.centinelas c ON c.clave = h.centinela
  WHERE h.tenant_id = public.get_user_tenant()
    AND h.murio_en IS NULL
    AND (NOT p_solo_nuevos OR h.avisado_en IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.centinela_silenciados s
      WHERE s.tenant_id = h.tenant_id AND s.centinela = h.centinela
        AND s.huella IN (h.huella, '*')
        AND (s.hasta IS NULL OR s.hasta >= CURRENT_DATE))
  ORDER BY CASE c.severidad WHEN 'rojo' THEN 1 WHEN 'amarillo' THEN 2 ELSE 3 END,
           COALESCE(h.monto, 0) DESC;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_centinela_hallazgos(boolean) TO authenticated, service_role;


-- =====================================================================
-- LAS DEFINICIONES DE LA FASE 1
-- =====================================================================
INSERT INTO public.centinelas (clave, titulo, familia, severidad, funcion, descripcion, orden) VALUES
  ('agotado_sin_pedir',  'Se esta vendiendo y no hay, ni viene',
   'fuga', 'rojo', 'centinela_agotado_sin_pedir',
   'Producto con venta en 60 dias, existencia en cero y ausente de toda orden abierta.', 10),

  ('camino_fantasma',    'Mercancia "en camino" que nunca llego',
   'contradiccion', 'amarillo', 'centinela_camino_fantasma',
   'Orden pedida hace mas de su ventana con lineas aun pendientes: bloquea la reposicion.', 20),

  ('venta_bajo_costo',   'Se vendio por debajo del costo',
   'fuga', 'rojo', 'centinela_venta_bajo_costo',
   'Linea de factura cobrada por menos de lo que costo. En cero significa que el bloqueo sigue vivo.', 15),

  ('sin_suplidor',       'Productos que ninguna orden puede pedir',
   'contradiccion', 'amarillo', 'centinela_sin_suplidor',
   'Activos sin suplidor asignado: invisibles para la orden automatica.', 30)
ON CONFLICT (clave) DO UPDATE
  SET titulo = EXCLUDED.titulo, familia = EXCLUDED.familia,
      severidad = EXCLUDED.severidad, funcion = EXCLUDED.funcion,
      descripcion = EXCLUDED.descripcion, orden = EXCLUDED.orden;

NOTIFY pgrst, 'reload schema';

SELECT public.registrar_migracion('centinelas_del_flujo.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
-- Se corren los centinelas de verdad (solo leen) pero NO se avisa: el
-- primer mensaje al canal lo dispara el dueno cuando quiera verlo.
SELECT public.correr_centinelas('00000000-0000-0000-0000-000000000001'::uuid) AS corrida;

SELECT c.severidad, c.titulo, count(h.id) AS hallazgos,
       COALESCE(round(SUM(h.monto), 0), 0) AS monto
FROM public.centinelas c
LEFT JOIN public.centinela_hallazgos h
       ON h.centinela = c.clave AND h.murio_en IS NULL
      AND h.tenant_id = '00000000-0000-0000-0000-000000000001'
GROUP BY c.clave, c.severidad, c.titulo, c.orden
ORDER BY c.orden;

SELECT clave, ultimo_error FROM public.centinelas WHERE ultimo_error IS NOT NULL;
