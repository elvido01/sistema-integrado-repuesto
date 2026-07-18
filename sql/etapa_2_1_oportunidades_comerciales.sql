-- =====================================================================
-- ETAPA 2.1 — COLA DE OPORTUNIDADES COMERCIALES (Repuestos Morla)
-- ---------------------------------------------------------------------
-- hermes.oportunidades_comerciales: unifica en UNA vista explicable las
-- señales comerciales (solo lectura):
--   promocion      → listo para publicar (foto real + stock >= 2 + precio >= 100,
--                    sin grupos excluidos), score por margen/stock/ventas/precio
--   requiere_foto  → promocionable pero SIN foto: pedir foto, nunca publicar
--   producto_frio  → con stock y sin ventas: acción concreta para moverlo
--   seguimiento    → fichas de hermes.crm_hoy (sin agotado_solicitado)
--
-- hermes.oportunidades_hoy: la cola diaria lista para Hermes:
--   máx 2 promociones (score DESC) + máx 1 frío + máx 5 requiere_foto
--   + TODOS los seguimientos, alta primero.
--
-- Reglas duras: nunca promoción sin stock o sin foto real (no se degrada
-- la regla si no hay candidatos); excluidos como promoción individual:
-- arandelas, tornillos, tuercas, aceites, filtros, parchos y cadenas.
-- El codigo va solo como referencia técnica (no para contenido publicado).
-- Sin costos internos: el margen se usa DENTRO del score y la razón lo
-- describe cualitativo (alto/medio/bajo), nunca en números.
--
-- Anti-repetición: last_recommended_at = MAX(created_at) en
-- ai_product_content_history (lo escribe el módulo Marketing IA);
-- oportunidades_hoy no repite promociones con actividad en los últimos
-- 5 días. LÍMITE: lo recomendado por Hermes vía Telegram no se registra
-- en MotoFlow todavía — Hermes mantiene además su propia regla de 5 días.
--
-- Se apoya en vistas del schema hermes ya fijadas a Morla (dueño→dueño,
-- sin problema security_invoker). ⚠ Si se re-ejecuta hermes_readonly.sql
-- (borra las vistas del schema hermes), re-correr hermes_readonly_vistas.sql
-- y LUEGO este archivo. Idempotente / re-ejecutable.
-- =====================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'hermes')
     OR to_regclass('hermes.product_image_status') IS NULL
     OR to_regclass('hermes.crm_hoy') IS NULL THEN
    RAISE EXCEPTION 'Faltan las vistas base del schema hermes: correr sql/hermes_readonly_vistas.sql primero';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 1) Vista base: todas las oportunidades con score y razón
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW hermes.oportunidades_comerciales AS
WITH candidatos AS (
  -- catálogo activo de Morla + margen interno + historial de recomendación
  SELECT
    s.*,
    CASE WHEN p.costo > 0 AND s.precio > 0
         THEN (s.precio - p.costo) / s.precio END AS margen_pct,
    h.last_rec
  FROM hermes.product_image_status s
  JOIN public.productos p
    ON p.id = s.product_id AND p.tenant_id = s.tenant_id
  LEFT JOIN LATERAL (
    SELECT MAX(hh.created_at) AS last_rec
    FROM public.ai_product_content_history hh
    WHERE hh.tenant_id = s.tenant_id AND hh.producto_id = s.product_id
  ) h ON true
  WHERE s.descripcion !~* '(arandela|tornillo|tuerca|aceite|filtro|parcho|cadena)'
),

promocion AS (
  SELECT c.*,
    round(
      LEAST(COALESCE(c.margen_pct, 0.30), 0.60) / 0.60 * 35
      + LEAST(c.stock_actual, 10) / 10.0 * 25
      + CASE WHEN c.sales_30d BETWEEN 1 AND 5 THEN 20
             WHEN c.sales_30d = 0            THEN 12
             WHEN c.sales_30d <= 10          THEN 6
             ELSE 0 END
      + LEAST(c.precio, 10000) / 10000.0 * 20
      - CASE WHEN c.sales_30d > 10 THEN 10 ELSE 0 END
    , 1) AS score
  FROM candidatos c
  WHERE c.has_image = true
    AND c.stock_actual >= 2
    AND c.precio >= 100
),

requiere_foto AS (
  SELECT c.*,
    round(
      LEAST(c.precio, 10000) / 10000.0 * 60
      + LEAST(c.stock_actual, 10) / 10.0 * 20
      + CASE WHEN c.sales_30d > 0 THEN 20 ELSE 0 END
    , 1) AS score
  FROM candidatos c
  WHERE c.has_image = false
    AND c.stock_actual >= 1
    AND c.precio >= 100
    AND c.sales_30d <= 3
),

producto_frio AS (
  SELECT c.*,
    round(
      LEAST(c.precio, 10000) / 10000.0 * 40
      + LEAST(c.stock_actual, 10) / 10.0 * 20
      + LEAST(extract(day FROM now() - COALESCE(c.last_sale_at, c.first_stock_entry_at))::numeric, 180) / 180.0 * 40
    , 1) AS score
  FROM candidatos c
  WHERE c.stock_actual >= 1
    AND c.sales_30d = 0
    AND (c.last_sale_at IS NULL OR c.last_sale_at < now() - interval '45 days')
    AND c.first_stock_entry_at IS NOT NULL
    AND c.first_stock_entry_at < now() - interval '30 days'
    AND c.precio >= 200
    -- si califica como promoción lista, va por esa rama (no duplicar)
    AND NOT (c.has_image = true AND c.stock_actual >= 2)
)

-- ===== promoción lista para publicar =====
SELECT
  pr.tenant_id,
  'promocion'::text AS tipo,
  CASE WHEN pr.score >= 70 THEN 'alta' WHEN pr.score >= 45 THEN 'media' ELSE 'baja' END AS prioridad,
  pr.score,
  pr.product_id AS producto_id,
  pr.codigo,                                  -- referencia técnica, no publicar
  pr.descripcion,
  pr.precio,
  pr.stock_actual,
  pr.has_image,
  pr.sales_30d,
  pr.last_sale_at,
  NULL::uuid AS seguimiento_id,
  NULL::text AS cliente_nombre,
  NULL::text AS telefono,
  NULL::text AS estado_crm,
  NULL::date AS fecha_seguimiento,
  concat_ws(', ',
    CASE WHEN pr.margen_pct IS NULL      THEN 'margen sin costo registrado'
         WHEN pr.margen_pct >= 0.40      THEN 'margen alto'
         WHEN pr.margen_pct >= 0.20      THEN 'margen medio'
         ELSE 'margen bajo' END,
    'stock ' || round(pr.stock_actual)::int || ' und',
    CASE WHEN pr.sales_30d = 0   THEN 'sin ventas en 30 días'
         WHEN pr.sales_30d <= 5  THEN 'ventas moderadas (' || round(pr.sales_30d)::int || ' en 30d)'
         WHEN pr.sales_30d <= 10 THEN 'ventas buenas (' || round(pr.sales_30d)::int || ' en 30d)'
         ELSE 'venta natural alta (' || round(pr.sales_30d)::int || ' en 30d), penalizada' END,
    'foto real lista') AS razon,
  'Publicar promoción (foto real disponible)'::text AS accion_recomendada,
  pr.last_rec AS last_recommended_at
FROM promocion pr

UNION ALL

-- ===== requiere foto (nunca publicar sin foto real) =====
SELECT
  rf.tenant_id, 'requiere_foto',
  CASE WHEN rf.sales_30d > 0 THEN 'alta' ELSE 'media' END,
  rf.score,
  rf.product_id, rf.codigo, rf.descripcion, rf.precio, rf.stock_actual,
  rf.has_image, rf.sales_30d, rf.last_sale_at,
  NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::date,
  'Sin foto real; stock ' || round(rf.stock_actual)::int || ' und, precio RD$'
    || to_char(rf.precio, 'FM999,999,990')
    || CASE WHEN rf.sales_30d > 0
            THEN ', ya registra ' || round(rf.sales_30d)::int || ' venta(s) en 30d'
            ELSE '' END,
  'Solicitar foto real antes de promover',
  rf.last_rec
FROM requiere_foto rf

UNION ALL

-- ===== producto frío: moverlo con una acción concreta =====
SELECT
  pf.tenant_id, 'producto_frio', 'media',
  pf.score,
  pf.product_id, pf.codigo, pf.descripcion, pf.precio, pf.stock_actual,
  pf.has_image, pf.sales_30d, pf.last_sale_at,
  NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::date,
  'Sin ventas en 30d (última venta: '
    || COALESCE(to_char(pf.last_sale_at, 'DD/MM/YY'), 'nunca')
    || '), en tienda desde ' || to_char(pf.first_stock_entry_at, 'DD/MM/YY')
    || ', stock ' || round(pf.stock_actual)::int || ' und',
  CASE WHEN pf.has_image
       THEN 'Publicar en Estados de WhatsApp como combo/complemento de un producto que rota'
       ELSE 'Exhibición física en mostrador y ofrecerlo como complemento en ventas relacionadas' END,
  pf.last_rec
FROM producto_frio pf

UNION ALL

-- ===== seguimientos del CRM que requieren acción hoy =====
SELECT
  ch.tenant_id, 'seguimiento', ch.prioridad,
  (CASE ch.prioridad WHEN 'alta' THEN 90 WHEN 'media' THEN 60 ELSE 30 END
   + CASE WHEN ch.fecha_seguimiento IS NOT NULL
          THEN LEAST(GREATEST((now() AT TIME ZONE 'America/Santo_Domingo')::date - ch.fecha_seguimiento, 0), 10)
          ELSE 0 END)::numeric AS score,
  NULL::uuid, ch.codigo_producto, ch.producto_consultado,
  NULL::numeric, NULL::numeric, NULL::boolean, NULL::numeric, NULL::timestamptz,
  ch.seguimiento_id, ch.cliente_nombre, ch.telefono, ch.estado,
  ch.fecha_seguimiento,
  'Ficha ' || ch.estado ||
    CASE WHEN ch.fecha_seguimiento IS NULL THEN ', sin fecha asignada'
         WHEN ch.fecha_seguimiento < (now() AT TIME ZONE 'America/Santo_Domingo')::date
           THEN ', vencida desde ' || to_char(ch.fecha_seguimiento, 'DD/MM')
         ELSE ', toca hoy' END,
  ch.proxima_accion,                          -- del CRM, sin inventar texto
  NULL::timestamptz
FROM hermes.crm_hoy ch
WHERE ch.estado <> 'agotado_solicitado';

-- ------------------------------------------------------------
-- 2) Cola diaria: límites por tipo + anti-repetición 5 días
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW hermes.oportunidades_hoy AS
WITH filtradas AS (
  SELECT o.*
  FROM hermes.oportunidades_comerciales o
  WHERE o.tipo <> 'promocion'
     OR o.last_recommended_at IS NULL
     OR o.last_recommended_at < now() - interval '5 days'
),
ranked AS (
  SELECT f.*,
         row_number() OVER (PARTITION BY f.tipo
                            ORDER BY f.score DESC, f.precio DESC NULLS LAST) AS rn
  FROM filtradas f
)
SELECT
  tenant_id, tipo, prioridad, score, producto_id, codigo, descripcion,
  precio, stock_actual, has_image, sales_30d, last_sale_at,
  seguimiento_id, cliente_nombre, telefono, estado_crm, fecha_seguimiento,
  razon, accion_recomendada, last_recommended_at
FROM ranked
WHERE (tipo = 'promocion'     AND rn <= 2)
   OR (tipo = 'producto_frio' AND rn <= 1)
   OR (tipo = 'requiere_foto' AND rn <= 5)
   OR  tipo = 'seguimiento'
ORDER BY CASE tipo WHEN 'seguimiento' THEN 1 WHEN 'promocion' THEN 2
                   WHEN 'producto_frio' THEN 3 ELSE 4 END,
         CASE prioridad WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
         score DESC;

-- ------------------------------------------------------------
-- 3) Permisos: solo lectura para Hermes; espejos public SOLO service_role
--    (verificación/integraciones — las vistas están fijadas a Morla, por
--    eso NO se dan a authenticated)
-- ------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hermes_readonly') THEN
    GRANT SELECT ON hermes.oportunidades_comerciales, hermes.oportunidades_hoy TO hermes_readonly;
  END IF;
END $$;

CREATE OR REPLACE VIEW public.hermes_oportunidades_comerciales AS
  SELECT * FROM hermes.oportunidades_comerciales;
CREATE OR REPLACE VIEW public.hermes_oportunidades_hoy AS
  SELECT * FROM hermes.oportunidades_hoy;

REVOKE ALL ON public.hermes_oportunidades_comerciales, public.hermes_oportunidades_hoy
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.hermes_oportunidades_comerciales, public.hermes_oportunidades_hoy
  TO service_role;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('etapa_2_1_oportunidades_comerciales.sql');
  END IF;
END $$;

SELECT 'Cola de oportunidades lista (hermes.oportunidades_comerciales + oportunidades_hoy)' AS status;
