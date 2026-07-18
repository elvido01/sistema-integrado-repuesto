-- =====================================================================
-- ETAPA 2.1 / TAREA 1 — INSPECCIÓN DEL MODELO (solo lectura, sin cambios)
-- ---------------------------------------------------------------------
-- Confirma nombres, tipos y llaves de las fuentes de la cola de
-- oportunidades ANTES de crear vistas. Ejecutable con el rol
-- hermes_readonly (todo es SELECT sobre el schema hermes + catálogos).
--
-- HALLAZGOS (verificados en prod 2026-07-18, sesión Claude):
--   * hermes.product_image_status: product_id (uuid = productos.id),
--     codigo, descripcion, activo (siempre true: la vista ya filtra),
--     stock_actual numeric (SUM kardex), precio, has_image, sales_30d,
--     last_sale_at timestamptz, first_stock_entry_at timestamptz.
--   * hermes.crm_hoy: seguimiento_id, cliente_nombre, telefono, estado,
--     prioridad, proxima_accion, fecha_seguimiento, producto_consultado,
--     codigo_producto. Ya viene filtrada a "requiere acción hoy".
--   * Tenant: todas las vistas del schema hermes están FIJADAS a Morla
--     (00000000-0000-0000-0000-000000000001); el enlace producto↔ventas es
--     productos.id ↔ facturas_detalle.producto_id; cliente↔CRM por
--     teléfono normalizado (crm_whatsapp_phone_key).
--   * Historial anti-repetición: public.ai_product_content_history
--     (tenant_id, producto_id, accion, created_at; índice
--     idx_ai_prod_content_hist). Es la única fuente en MotoFlow de
--     "producto ya recomendado" → last_recommended_at = MAX(created_at).
--     LÍMITE DOCUMENTADO: las recomendaciones que Hermes hace por
--     Telegram NO se registran en MotoFlow; Hermes mantiene su propia
--     regla de 5 días. (Etapa posterior: registrar recomendaciones.)
--     Esta tabla vive en public → hermes_readonly NO la lee directo;
--     la vista de oportunidades la consulta como dueño.
-- =====================================================================

-- 1) Columnas y tipos de las fuentes del schema hermes
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'hermes'
  AND table_name IN ('product_image_status', 'crm_hoy', 'crm_seguimiento',
                     'productos', 'facturas', 'facturas_detalle', 'inventario_movimientos')
ORDER BY table_name, ordinal_position;

-- 2) Muestra de cada fuente (1 fila)
SELECT 'product_image_status' AS fuente, codigo, descripcion, stock_actual, precio, has_image, sales_30d
FROM hermes.product_image_status LIMIT 1;

SELECT 'crm_hoy' AS fuente, seguimiento_id, cliente_nombre, estado, prioridad, proxima_accion, fecha_seguimiento
FROM hermes.crm_hoy LIMIT 1;

-- 3) Verificación de aislamiento: todo lo visible es de Morla
SELECT DISTINCT tenant_id FROM hermes.product_image_status
UNION
SELECT DISTINCT tenant_id FROM hermes.crm_seguimiento;
-- esperado: una sola fila = 00000000-0000-0000-0000-000000000001

-- 4) Grupos excluidos de promoción (conteo de afectados, referencia)
SELECT count(*) AS excluidos_de_promocion
FROM hermes.product_image_status
WHERE descripcion ~* '(arandela|tornillo|tuerca|aceite|filtro|parcho|cadena)';
