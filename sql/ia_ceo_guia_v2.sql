-- =====================================================================
-- IA CEO · GUÍA v2: DEALER, FINANCIERA Y TELÉFONOS (21/10/2026)
-- ---------------------------------------------------------------------
-- Primer día de la guía (20/10): Morla y MotoPréstamos salieron concretas,
-- pero Caminero genérica ("Organiza una estrategia para aumentar las
-- ventas") porque el CEO no veía nada de motos; y a MotoPréstamos le
-- propuso "subir las ventas" cuando una financiera crece prestando y
-- cobrando. ia_ceo_contexto suma:
--   dealer      motos en inventario (producto con chasis y existencia),
--               cuántas llevan +90 días, las más viejas, motos vendidas 30
--               días contra los 30 anteriores, solicitudes por estado y las
--               APROBADAS sin carta de ruta (venta atascada).
--   financiera  préstamos colocados y monto colocado en 30 días, cobrado en
--               30 días, y el TELÉFONO de los más atrasados.
--   crm         el teléfono de los listos para comprar por WhatsApp.
-- Con el teléfono, la tarea trae botón de Llamar / WhatsApp directo.
-- Parte de la versión de sql/ia_ceo_guia.sql (20/10/2026).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.ia_ceo_contexto(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_out   jsonb := '{}'::jsonb;
  v_user  uuid;
  v_ok    boolean := false;
  v_tmp   jsonb;
  v_tipo  text;
BEGIN
  SELECT jsonb_build_object('nombre', ce.nombre, 'tipo_negocio', coalesce(ce.tipo_negocio, 'repuestos')),
         coalesce(ce.tipo_negocio, 'repuestos')
    INTO v_tmp, v_tipo
    FROM public.config_empresa ce WHERE ce.tenant_id = p_tenant_id;
  v_out := v_out || jsonb_build_object('empresa', v_tmp);

  -- Mirar como el dueño/admin de esa empresa (solo en esta transacción).
  FOR v_user IN
    SELECT p.id FROM public.profiles p
     WHERE p.tenant_id = p_tenant_id AND p.role IN ('owner', 'admin')
     ORDER BY (p.role = 'owner') DESC, coalesce(p.is_superadmin, false), p.created_at
  LOOP
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    IF public.get_user_tenant() = p_tenant_id THEN v_ok := true; EXIT; END IF;
  END LOOP;

  -- ── Grupo (Gestión Empresarial IA) ─────────────────────────────────
  IF v_ok THEN
    BEGIN
      v_tmp := to_jsonb(public.get_gestion_empresarial_ia(3));
      v_out := v_out || jsonb_build_object('grupo', jsonb_build_object(
        'posicion', v_tmp -> 'posicion', 'estado_actual', v_tmp -> 'estado_actual',
        'totales', v_tmp -> 'totales', 'margen_pct', v_tmp -> 'margen_pct',
        'ventas_mes', v_tmp -> 'ventas_mes', 'gasto_diario', v_tmp -> 'gasto_diario',
        'empresas_grupo', v_tmp -> 'empresas_grupo'));
    EXCEPTION WHEN others THEN
      v_out := v_out || jsonb_build_object('grupo', jsonb_build_object('error', SQLERRM));
    END;
  END IF;

  -- ── Publicaciones: qué movió la pieza (Equipo IA) ──────────────────
  IF v_ok THEN
    BEGIN
      WITH e AS (SELECT * FROM public.efectividad_publicaciones(30))
      SELECT jsonb_build_object(
        'por_objetivo', (SELECT jsonb_agg(jsonb_build_object('objetivo', objetivo, 'piezas', n,
                           'alcance_prom', alc, 'interacciones_prom', inter, 'uds_vendidas_despues', uds))
                           FROM (SELECT objetivo, count(*) n, round(avg(alcance)) alc, round(avg(interacciones)) inter,
                                        sum(uds_despues) uds FROM e GROUP BY objetivo) o),
        'mejores', (SELECT jsonb_agg(jsonb_build_object('pieza', descripcion, 'publicado', publicado_at::date,
                      'alcance', alcance, 'uds_dia_antes', uds_dia_antes, 'uds_dia_despues', uds_dia_despues))
                      FROM (SELECT * FROM e ORDER BY (uds_dia_despues - uds_dia_antes) DESC, alcance DESC LIMIT 3) m),
        'sin_efecto', (SELECT count(*) FROM e WHERE dias_despues >= 7 AND uds_despues = 0))
        INTO v_tmp;
      v_out := v_out || jsonb_build_object('publicaciones', v_tmp);
    EXCEPTION WHEN others THEN
      v_out := v_out || jsonb_build_object('publicaciones', jsonb_build_object('error', SQLERRM));
    END;
  END IF;

  -- ── Agotados que se venden y qué promocionar (Equipo IA) ───────────
  -- Solo empresas con Equipo IA (hoy Morla); las demás no lo traen.
  IF v_ok AND public.equipo_ia_permitido() THEN
    BEGIN
      SELECT jsonb_agg(jsonb_build_object('codigo', x->>'codigo', 'pieza', btrim(x->>'descripcion'),
               'estado', x->>'estado', 'existencia', (x->>'existencia')::numeric,
               'vendidos_30d', (x->>'vendidos_30d')::numeric, 'sugerido_pedir', (x->>'sugerido')::numeric,
               'ya_en_orden', x->'en_orden'->>'numero'))
        INTO v_tmp FROM jsonb_array_elements(to_jsonb(public.equipo_agotados_que_se_venden(10))) x;
      v_out := v_out || jsonb_build_object('agotados', coalesce(v_tmp, '[]'::jsonb));
    EXCEPTION WHEN others THEN
      v_out := v_out || jsonb_build_object('agotados', jsonb_build_object('error', SQLERRM));
    END;
    BEGIN
      SELECT jsonb_agg(jsonb_build_object('codigo', x->>'codigo', 'pieza', btrim(x->>'descripcion'),
               'existencia', (x->>'existencia')::numeric, 'razon', x->>'razon'))
        INTO v_tmp FROM jsonb_array_elements(to_jsonb(public.equipo_candidatos_promocion(6))) x;
      v_out := v_out || jsonb_build_object('promocionar', coalesce(v_tmp, '[]'::jsonb));
    EXCEPTION WHEN others THEN
      v_out := v_out || jsonb_build_object('promocionar', jsonb_build_object('error', SQLERRM));
    END;
  END IF;

  -- ── Ventas y cuentas por cobrar (20/10/2026, para medir los planes) ─
  BEGIN
    SELECT jsonb_build_object(
      'ventas_30d', round(coalesce(sum(f.total) FILTER (WHERE f.fecha > now() - interval '30 days'), 0)),
      'ventas_30d_anterior', round(coalesce(sum(f.total) FILTER (WHERE f.fecha <= now() - interval '30 days'), 0)),
      'facturas_30d', count(*) FILTER (WHERE f.fecha > now() - interval '30 days'),
      'cxc_pendiente', (SELECT round(coalesce(sum(x.monto_pendiente), 0)) FROM public.facturas x
                         WHERE x.tenant_id = p_tenant_id AND x.estado = 'PENDIENTE'))
      INTO v_tmp
      FROM public.facturas f
     WHERE f.tenant_id = p_tenant_id AND f.estado IS DISTINCT FROM 'ANULADA'
       AND coalesce(f.es_saldo_inicial, false) = false
       AND f.fecha > now() - interval '60 days';
    v_out := v_out || jsonb_build_object('ventas', v_tmp);
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('ventas', jsonb_build_object('error', SQLERRM));
  END;

  -- ── CRM: embudo, listos, casos, perdidos, sin respuesta ────────────
  BEGIN
    SELECT jsonb_build_object(
      'embudo_30d', (SELECT jsonb_object_agg(etapa, n) FROM (
          SELECT coalesce(c.etapa, 'nuevo') etapa, count(*) n FROM public.sales_conversations c
           WHERE c.tenant_id = p_tenant_id AND c.last_user_message_at > now() - interval '30 days'
           GROUP BY 1) e),
      'listos_para_comprar', (SELECT jsonb_agg(jsonb_build_object('cliente', nombre, 'canal', platform,
            'quiere', producto, 'desde', desde, 'telefono', tel)) FROM (
          SELECT coalesce(nullif(btrim(c.customer_name), ''), 'cliente') nombre, c.platform,
                 c.clasificacion ->> 'producto' producto, c.etapa_cambiada_at::date desde,
                 CASE WHEN c.platform = 'whatsapp' AND length(regexp_replace(coalesce(c.customer_phone, ''), '\D', '', 'g')) >= 10
                      THEN regexp_replace(c.customer_phone, '\D', '', 'g') END tel
            FROM public.sales_conversations c
           WHERE c.tenant_id = p_tenant_id AND c.etapa = 'listo_para_comprar'
             AND c.last_user_message_at > now() - interval '14 days'
           ORDER BY c.last_user_message_at DESC LIMIT 6) l),
      'casos_abiertos', (SELECT jsonb_agg(jsonb_build_object('motivo', k.motivo, 'quiere', k.quiere, 'falta', k.falta))
          FROM (SELECT * FROM public.crm_casos k WHERE k.tenant_id = p_tenant_id AND k.estado = 'abierto'
                 ORDER BY k.creado_at DESC LIMIT 6) k),
      'perdidos_por_no_tenerlo', (SELECT jsonb_agg(jsonb_build_object('pieza', pieza, 'veces', n)) FROM (
          SELECT coalesce(nullif(c.clasificacion ->> 'producto', ''), c.etapa_motivo) pieza, count(*) n
            FROM public.sales_conversations c
           WHERE c.tenant_id = p_tenant_id AND c.etapa = 'perdido'
             AND c.etapa_motivo ILIKE 'No lo tenemos%'
             AND c.etapa_cambiada_at > now() - interval '30 days'
           GROUP BY 1 ORDER BY 2 DESC LIMIT 8) p),
      'esperando_respuesta_mas_1h', (SELECT count(*) FROM public.sales_conversations c
           WHERE c.tenant_id = p_tenant_id
             AND c.last_user_message_at > now() - interval '3 days'
             AND c.last_user_message_at < now() - interval '1 hour'
             AND (c.last_agent_message_at IS NULL OR c.last_agent_message_at < c.last_user_message_at)
             AND coalesce(c.etapa, '') NOT IN ('perdido', 'spam')))
      INTO v_tmp;
    v_out := v_out || jsonb_build_object('crm', v_tmp);
  EXCEPTION WHEN others THEN
    v_out := v_out || jsonb_build_object('crm', jsonb_build_object('error', SQLERRM));
  END;

  -- ── Financiera: cartera y mora ─────────────────────────────────────
  IF EXISTS (SELECT 1 FROM public.prestamos WHERE tenant_id = p_tenant_id AND estado = 'activo') THEN
    BEGIN
      WITH venc AS (
        SELECT q.prestamo_id, count(*) cuotas,
               sum(greatest(q.monto_cuota - coalesce(q.capital_pagado, 0) - coalesce(q.interes_pagado, 0), 0)) monto,
               current_date - min(q.fecha_vencimiento) dias
          FROM public.prestamo_cuotas q
          JOIN public.prestamos p ON p.id = q.prestamo_id AND p.estado = 'activo'
         WHERE q.tenant_id = p_tenant_id AND q.estado IN ('pendiente', 'parcial')
           AND q.fecha_vencimiento < current_date
         GROUP BY q.prestamo_id)
      SELECT jsonb_build_object(
        'prestamos_activos', (SELECT count(*) FROM public.prestamos WHERE tenant_id = p_tenant_id AND estado = 'activo'),
        'capital_prestado_activo', (SELECT round(sum(monto_capital)) FROM public.prestamos WHERE tenant_id = p_tenant_id AND estado = 'activo'),
        'prestamos_con_atraso', (SELECT count(*) FROM venc),
        'monto_vencido', (SELECT round(sum(monto)) FROM venc),
        'atraso_mas_30_dias', (SELECT count(*) FROM venc WHERE dias > 30),
        'prestamos_nuevos_30d', (SELECT count(*) FROM public.prestamos
                                  WHERE tenant_id = p_tenant_id AND fecha_inicio > now() - interval '30 days'),
        'colocado_30d', (SELECT round(coalesce(sum(monto_capital), 0)) FROM public.prestamos
                          WHERE tenant_id = p_tenant_id AND fecha_inicio > now() - interval '30 days'),
        'cobrado_30d', (SELECT round(coalesce(sum(total_pagado), 0)) FROM public.prestamo_pagos
                         WHERE tenant_id = p_tenant_id AND fecha > now() - interval '30 days'
                           AND NOT coalesce(anulado, false)),
        'mas_atrasados', (SELECT jsonb_agg(jsonb_build_object('prestamo', p.numero, 'cliente', cl.nombre,
              'cuotas_vencidas', v.cuotas, 'monto', round(v.monto), 'dias', v.dias,
              'telefono', nullif(regexp_replace(coalesce(cl.telefono, ''), '\D', '', 'g'), '')))
            FROM (SELECT * FROM venc ORDER BY monto DESC LIMIT 8) v
            JOIN public.prestamos p ON p.id = v.prestamo_id
            LEFT JOIN public.clientes cl ON cl.id = p.cliente_id))
        INTO v_tmp;
      v_out := v_out || jsonb_build_object('financiera', v_tmp);
    EXCEPTION WHEN others THEN
      v_out := v_out || jsonb_build_object('financiera', jsonb_build_object('error', SQLERRM));
    END;
  END IF;

  -- ── Dealer: motos en inventario, ventas de motos, solicitudes ──────
  -- (21/10/2026) Caminero salía genérico: el CEO no veía nada de motos.
  -- Una "moto" es un producto con chasis. Solo si la empresa tiene alguna.
  IF EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = p_tenant_id AND activo
              AND nullif(btrim(chasis), '') IS NOT NULL LIMIT 1) THEN
    BEGIN
      WITH st AS (
        SELECT m.producto_id, sum(m.cantidad) q, min(m.fecha) desde
          FROM public.inventario_movimientos m
         WHERE m.tenant_id = p_tenant_id
         GROUP BY m.producto_id HAVING sum(m.cantidad) > 0),
      motos AS (
        SELECT p.id, p.descripcion, p.chasis, p.color, p.anio, p.costo, p.precio, st.desde
          FROM st JOIN public.productos p ON p.id = st.producto_id
         WHERE p.tenant_id = p_tenant_id AND nullif(btrim(p.chasis), '') IS NOT NULL),
      vend AS (
        SELECT d.importe, f.fecha, f.tipo_pago
          FROM public.facturas_detalle d
          JOIN public.facturas f ON f.id = d.factura_id
          JOIN public.productos p ON p.id = d.producto_id
         WHERE d.tenant_id = p_tenant_id AND f.estado IS DISTINCT FROM 'ANULADA'
           AND nullif(btrim(p.chasis), '') IS NOT NULL
           AND f.fecha > now() - interval '60 days')
      SELECT jsonb_build_object(
        'motos_en_inventario', (SELECT count(*) FROM motos),
        'valor_al_costo', (SELECT round(coalesce(sum(costo), 0)) FROM motos),
        'mas_de_90_dias', (SELECT count(*) FROM motos WHERE desde < now() - interval '90 days'
                                                          AND desde >= now() - interval '730 days'),
        -- Más de 2 años "en inventario": casi seguro existencia que la
        -- migración del sistema viejo nunca sacó. No se liquida: se verifica.
        'mas_de_2_anios_verificar_si_existen', (SELECT count(*) FROM motos WHERE desde < now() - interval '730 days'),
        'mas_viejas', (SELECT jsonb_agg(jsonb_build_object('moto', descripcion, 'chasis', chasis,
                          'dias', (current_date - desde::date), 'precio', round(precio)))
                         FROM (SELECT * FROM motos WHERE desde >= now() - interval '730 days'
                                ORDER BY desde LIMIT 6) v),
        'motos_vendidas_30d', (SELECT count(*) FROM vend WHERE fecha > now() - interval '30 days'),
        'motos_vendidas_30d_anterior', (SELECT count(*) FROM vend WHERE fecha <= now() - interval '30 days'),
        'solicitudes_30d', (SELECT jsonb_object_agg(estado, n) FROM (
             SELECT coalesce(estado, 'sin estado') estado, count(*) n FROM public.solicitudes_compras
              WHERE tenant_id = p_tenant_id AND fecha > now() - interval '30 days' GROUP BY 1) e),
        'aprobadas_sin_carta_de_ruta', (SELECT jsonb_agg(jsonb_build_object('solicitud', s.numero, 'cliente', s.cliente_nombre,
              'moto', concat_ws(' ', s.marca, s.modelo, s.color), 'dias', current_date - s.fecha::date))
            FROM (SELECT * FROM public.solicitudes_compras s
                   WHERE s.tenant_id = p_tenant_id AND s.estado = 'Aprobada'
                     AND s.fecha > now() - interval '60 days'
                     AND NOT EXISTS (SELECT 1 FROM public.cartas_ruta c
                                      WHERE c.solicitud_id = s.id
                                         OR (c.tenant_id = s.tenant_id AND (
                                              nullif(c.solicitud_numero::text, '') = s.numero::text
                                              -- las cartas de hoy no guardan la solicitud: se enlazan por chasis o cliente
                                              OR (nullif(btrim(s.chasis), '') IS NOT NULL AND c.chasis = s.chasis)
                                              OR upper(btrim(c.cliente_nombre)) = upper(btrim(s.cliente_nombre)))))
                   ORDER BY s.fecha LIMIT 6) s),
        'aprobadas_sin_carta_total', (SELECT count(*) FROM public.solicitudes_compras s
                   WHERE s.tenant_id = p_tenant_id AND s.estado = 'Aprobada'
                     AND s.fecha > now() - interval '60 days'
                     AND NOT EXISTS (SELECT 1 FROM public.cartas_ruta c
                                      WHERE c.solicitud_id = s.id
                                         OR (c.tenant_id = s.tenant_id AND (
                                              nullif(c.solicitud_numero::text, '') = s.numero::text
                                              -- las cartas de hoy no guardan la solicitud: se enlazan por chasis o cliente
                                              OR (nullif(btrim(s.chasis), '') IS NOT NULL AND c.chasis = s.chasis)
                                              OR upper(btrim(c.cliente_nombre)) = upper(btrim(s.cliente_nombre)))))),
        'cartas_ruta_30d', (SELECT count(*) FROM public.cartas_ruta
                             WHERE tenant_id = p_tenant_id AND fecha > now() - interval '30 days'))
        INTO v_tmp;
      v_out := v_out || jsonb_build_object('dealer', v_tmp);
    EXCEPTION WHEN others THEN
      v_out := v_out || jsonb_build_object('dealer', jsonb_build_object('error', SQLERRM));
    END;
  END IF;

  -- ── Decisiones que siguen pendientes (no repetirlas) ───────────────
  SELECT jsonb_agg(jsonb_build_object('titulo', d.title, 'area', d.area, 'desde', d.created_at::date))
    INTO v_tmp
    FROM (SELECT * FROM public.ai_decisions WHERE tenant_id = p_tenant_id AND status = 'pending'
           ORDER BY created_at DESC LIMIT 10) d;
  v_out := v_out || jsonb_build_object('decisiones_pendientes', coalesce(v_tmp, '[]'::jsonb));

  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_out;
END $fn$;

REVOKE ALL ON FUNCTION public.ia_ceo_contexto(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ia_ceo_contexto(uuid) TO service_role;

SELECT public.registrar_migracion('ia_ceo_guia_v2.sql');
