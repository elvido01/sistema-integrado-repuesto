-- ============================================================
-- >>> NO CORRAS ESTE ARCHIVO. HISTÓRICO. (aviso del 01/09/2026) <<<
-- ============================================================
-- La `equipo_cerrar_al_aprobar` viva en producción es más nueva que la de
-- aquí abajo. La de este archivo escribe el encargo de ARTE FINAL a mano; la
-- viva llama a `hermes.equipo_brief_arte()`, que además le manda al creativo
-- las REGLAS DE LA CASA y las REFERENCIAS que subió el dueño.
--
-- Correrlo no rompe nada visible: las promociones siguen saliendo, solo que
-- dejan de respetar las reglas y las referencias, en silencio.
--
-- Si hay que restaurarlo:  sql/rescatar_al_firmar_el_concepto.sql
-- ============================================================

-- ============================================================
-- DOS FIRMAS: EL CONCEPTO Y EL ARTE
-- ============================================================
-- Corrección del dueño, la misma noche:
--
--   "Estoy aprobando es que la imagen original es la correcta. Aún falta que
--    Comercial-Creativo realice el diseño final utilizando la foto original y
--    el logo original de Repuestos Morla, agregue títulos y dé ejemplo de
--    título y descripción para cada red social, y luego vuelva a pedir
--    aprobación del arte. Y si se le acepta, entonces proceda a las
--    publicaciones."
--
-- Tenía razón y el circuito estaba cerrando una firma antes de tiempo. Lo que
-- se aprobó fue el CONCEPTO —el enfoque, el copy, que la foto es la correcta—
-- y eso no es la pieza. Aprobar el concepto y publicar sería publicar algo
-- que nadie ha visto.
--
-- Quedan dos firmas, y significan cosas distintas:
--
--   1ª · el CONCEPTO   "sí, ese producto, esa foto, ese enfoque"
--   2ª · el ARTE       "sí, esta pieza sale así"
--
-- Aprobar la primera NO cierra el trabajo: abre la segunda ronda, y el
-- encargo del arte va con la foto del catálogo, el logo oficial y el teléfono
-- de la empresa. El creativo no busca nada; se le entrega.
--
-- >>> Y APROBAR EL ARTE TAMPOCO PUBLICA. <<<
-- El dueño dijo "entonces proceda a las publicaciones", y así será — pero
-- publicar en redes no está construido todavía. Cuando lo esté, se engancha
-- aquí. Mientras tanto el trabajo se cierra diciendo la verdad: aprobado,
-- listo para publicar, sin publicar.
--
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.equipo_cerrar_al_aprobar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_w     record;
  v_txt   text;
  v_foto  text;
  v_logo  text;
  v_tel   text;
  v_nom   text;
  v_ronda integer;
  v_esArte boolean;
BEGIN
  IF NEW.estado <> 'approved' OR COALESCE(OLD.estado, '') = 'approved' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_w FROM public.equipo_trabajos WHERE id = NEW.trabajo_id;
  IF v_w.id IS NULL THEN RETURN NULL; END IF;

  -- ¿Lo que se firmó era el arte o todavía el concepto? Lo dice el propio
  -- entregable: el creativo marca `estado` en su payload.
  v_esArte := COALESCE(NEW.contenido ->> 'estado', 'borrador') IN ('arte', 'final', 'arte_final');

  -- El mensaje del borrador ya cumplió, en los dos casos.
  UPDATE public.equipo_mensajes
     SET status = 'completed'
   WHERE id = NEW.mensaje_id AND status = 'pending';

  -- ── CASO 1: se firmó el CONCEPTO → se pide el ARTE ───────────────
  IF NOT v_esArte AND v_w.tipo = 'promocion' THEN
    v_foto := substring(COALESCE(NEW.contenido, '{}'::jsonb)::text
                        from 'https?://[^"\s]+[.](?:png|jpe?g|webp)');

    SELECT e.logo_url, e.telefono, e.nombre INTO v_logo, v_tel, v_nom
    FROM public.config_empresa e WHERE e.tenant_id = v_w.tenant_id;

    SELECT count(*) + 1 INTO v_ronda FROM public.equipo_mensajes m
    WHERE m.trabajo_id = v_w.id AND m.to_agent = 'comercial_creativo';

    PERFORM hermes.equipo_encargar_a(v_w.id, 'comercial_creativo', v_ronda,
      'CONCEPTO APROBADO por el dueño. Ahora prepara el ARTE FINAL.'
      || E'\n\nMateriales (úsalos tal cual, no busques ni generes otros):'
      || COALESCE(E'\n· Foto real del producto: ' || v_foto, E'\n· Foto del producto: no se pudo recuperar, pídela')
      || COALESCE(E'\n· Logo oficial de la empresa: ' || v_logo, '')
      || COALESCE(E'\n· Empresa: ' || v_nom, '')
      || COALESCE(E'\n· Teléfono: ' || v_tel, '')
      || E'\n\nEl arte debe llevar: la foto real del producto, el logo oficial, un TÍTULO'
      || ' bien visible, el precio y el teléfono.'
      || E'\n\nY entrega además, para CADA red (WhatsApp, Facebook, Instagram), un ejemplo de'
      || ' TÍTULO y otro de DESCRIPCIÓN, listos para copiar y pegar.'
      || E'\n\nCuando termines, marca en tu respuesta el campo "estado" con el valor "arte"'
      || ' para que se sepa que ya es la pieza final y no otro concepto.'
      || E'\n\nSigue sin publicarse nada: esto vuelve a pasar por aprobación.');

    UPDATE public.equipo_trabajos
       SET estado = 'processing'
     WHERE id = v_w.id AND estado NOT IN ('cancelled', 'failed');

    v_txt := '✅ **Concepto aprobado** — ' || COALESCE(v_w.titulo, 'el trabajo')
          || E'\nSe lo devolví al Comercial-Creativo para que monte el arte final con la foto real, el logo y los títulos.'
          || E'\n\nTe lo traigo cuando esté, para que apruebes la pieza. Todavía no se publica nada.';

  -- ── CASO 2: se firmó el ARTE → se cierra ─────────────────────────
  ELSE
    UPDATE public.equipo_trabajos
       SET estado = 'completed', terminado_en = now(),
           resultado = COALESCE(NEW.contenido, resultado)
     WHERE id = v_w.id AND estado NOT IN ('cancelled', 'failed');

    v_txt := '✅ **Arte aprobado** — ' || COALESCE(v_w.titulo, 'el trabajo')
          || E'\nLa pieza queda guardada y lista para publicar.'
          || E'\n\nOjo: la publicación a redes todavía NO es automática. Nada ha salido.';
  END IF;

  INSERT INTO public.hermes_chat
    (tenant_id, rol, texto, conversation_key, context_epoch,
     estado, respondido, respondido_en, message_type)
  VALUES
    (v_w.tenant_id, 'hermes', v_txt, v_w.conversation_key,
     COALESCE(v_w.context_epoch, 1), 'respondido', true, now(), 'text');

  RETURN NULL;
END $fn$;

-- ------------------------------------------------------------
-- EL DE ESTA NOCHE: SE CERRÓ ANTES DE TIEMPO
-- ------------------------------------------------------------
-- Se aprobó el concepto y el trabajo se dio por terminado. Se reabre y se
-- pide el arte, que es lo que faltaba.
DO $rescate$
DECLARE
  v_w    record;
  v_a    record;
  v_foto text; v_logo text; v_tel text; v_nom text; v_ronda integer;
BEGIN
  SELECT w.* INTO v_w FROM public.equipo_trabajos w
  WHERE w.tenant_id = '00000000-0000-0000-0000-000000000001'
    AND w.tipo = 'promocion' AND w.estado = 'completed'
  ORDER BY w.creado_en DESC LIMIT 1;
  IF v_w.id IS NULL THEN RETURN; END IF;

  SELECT a.* INTO v_a FROM public.equipo_aprobaciones a
  WHERE a.trabajo_id = v_w.id AND a.estado = 'approved'
  ORDER BY a.decidido_en DESC LIMIT 1;
  IF v_a.id IS NULL THEN RETURN; END IF;

  -- Solo si lo aprobado era concepto, no arte.
  IF COALESCE(v_a.contenido ->> 'estado', 'borrador') IN ('arte','final','arte_final') THEN
    RETURN;
  END IF;

  v_foto := substring(COALESCE(v_a.contenido, '{}'::jsonb)::text
                      from 'https?://[^"\s]+[.](?:png|jpe?g|webp)');
  SELECT e.logo_url, e.telefono, e.nombre INTO v_logo, v_tel, v_nom
  FROM public.config_empresa e WHERE e.tenant_id = v_w.tenant_id;
  SELECT count(*) + 1 INTO v_ronda FROM public.equipo_mensajes m
  WHERE m.trabajo_id = v_w.id AND m.to_agent = 'comercial_creativo';

  PERFORM hermes.equipo_encargar_a(v_w.id, 'comercial_creativo', v_ronda,
    'CONCEPTO APROBADO por el dueño. Ahora prepara el ARTE FINAL.'
    || E'\n\nMateriales (úsalos tal cual, no busques ni generes otros):'
    || COALESCE(E'\n· Foto real del producto: ' || v_foto, '')
    || COALESCE(E'\n· Logo oficial de la empresa: ' || v_logo, '')
    || COALESCE(E'\n· Empresa: ' || v_nom, '')
    || COALESCE(E'\n· Teléfono: ' || v_tel, '')
    || E'\n\nEl arte debe llevar: la foto real del producto, el logo oficial, un TÍTULO'
    || ' bien visible, el precio y el teléfono.'
    || E'\n\nY entrega además, para CADA red (WhatsApp, Facebook, Instagram), un ejemplo de'
    || ' TÍTULO y otro de DESCRIPCIÓN, listos para copiar y pegar.'
    || E'\n\nCuando termines, marca en tu respuesta el campo "estado" con el valor "arte".'
    || E'\n\nSigue sin publicarse nada: esto vuelve a pasar por aprobación.');

  UPDATE public.equipo_trabajos SET estado = 'processing', terminado_en = NULL
   WHERE id = v_w.id;
END $rescate$;

SELECT public.registrar_migracion('dos_firmas_concepto_y_arte.sql');

-- ===================================================================
-- VERIFICACION
-- ===================================================================
SELECT json_build_object(
 'trabajo', (SELECT json_build_object('titulo', left(w.titulo,40), 'estado', w.estado)
   FROM public.equipo_trabajos w
   WHERE w.tenant_id='00000000-0000-0000-0000-000000000001' AND w.tipo='promocion'
   ORDER BY w.creado_en DESC LIMIT 1),
 'encargo_del_arte', (SELECT json_build_object('status', m.status,
     'ronda', m.payload ->> 'ronda', 'tomado', m.claimed_at,
     'lleva_logo', m.payload ->> 'texto' LIKE '%logo_empresa%',
     'lleva_foto', m.payload ->> 'texto' LIKE '%product-images/2312%',
     'pide_titulos', m.payload ->> 'texto' LIKE '%TÍTULO%')
   FROM public.equipo_mensajes m
   WHERE m.to_agent = 'comercial_creativo'
   ORDER BY m.created_at DESC LIMIT 1)
) AS r;
