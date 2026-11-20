-- =====================================================================
-- "Primeros pasos" — Fase 2 del onboarding (19/11/2026)
-- ---------------------------------------------------------------------
-- La lista de configuración inicial que sale en Inicio (web y app). Cada
-- paso se marca cuando la operación EXISTE en la base, no porque la persona
-- abrió un módulo o terminó una guía (decisión del dueño).
--
-- La arma el servidor (títulos, opcionales, hechos) para que la web y la
-- app muestren exactamente lo mismo; cada una solo decide a dónde lleva el
-- botón de cada paso.
--
--   * Servicios e inmobiliaria no compran mercancía: sin suplidor ni compra.
--   * Vendedor y cliente son opcionales: el dueño de una microempresa vende
--     solo y al consumidor final sin registrarlo.
--   * No hay apertura de caja en MotoFlow: el paso de caja es el cierre.
--   * Aplica a comercio (repuestos, dealer, cafetería) y servicios
--     (servicios, inmobiliaria), a empresas de 90 días o menos o en FREE /
--     prueba. Colegio, financiera y aluminio tienen otro arranque.
-- =====================================================================

CREATE OR REPLACE FUNCTION private._primeros_pasos(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_tipo    text;
  v_creada  timestamptz;
  v_plan    text;
  v_compra  boolean;   -- ¿este tipo de empresa compra mercancía?
  v_pasos   jsonb := '[]'::jsonb;
  v_hechos  integer := 0;
  v_req     integer := 0;
  v_req_ok  integer := 0;
  r         record;
BEGIN
  SELECT COALESCE(NULLIF(lower(ce.tipo_negocio), ''), 'repuestos') INTO v_tipo
    FROM public.config_empresa ce WHERE ce.tenant_id = p_tenant;
  v_tipo := COALESCE(v_tipo, 'repuestos');
  SELECT created_at INTO v_creada FROM public.tenants WHERE id = p_tenant;
  v_plan := public._plan_vigente(p_tenant);
  v_compra := v_tipo NOT IN ('servicios', 'inmobiliaria');

  FOR r IN
    SELECT * FROM (VALUES
      (1, 'empresa',  'Completa los datos de tu empresa', 'Teléfono, dirección y logo: salen en tus facturas.', false, true,
         EXISTS (SELECT 1 FROM public.config_empresa WHERE tenant_id = p_tenant
                  AND NULLIF(btrim(COALESCE(telefono, '')), '') IS NOT NULL
                  -- Perfil Empresa guarda la dirección en direccion1 (direccion es la vieja).
                  AND NULLIF(btrim(COALESCE(direccion1, direccion, '')), '') IS NOT NULL)),
      (2, 'vendedor', 'Registra tu primer vendedor', 'Para saber quién vendió y calcular comisiones. No necesita usuario ni clave.', true, true,
         EXISTS (SELECT 1 FROM public.vendedores WHERE tenant_id = p_tenant)),
      (3, 'producto',
         CASE v_tipo WHEN 'servicios' THEN 'Crea tu primer servicio'
                     WHEN 'inmobiliaria' THEN 'Crea tu primer inmueble o servicio'
                     WHEN 'cafeteria' THEN 'Crea tu primer producto del menú'
                     ELSE 'Crea tu primer artículo' END,
         'Con su código, costo y precio de venta.', false, true,
         EXISTS (SELECT 1 FROM public.productos WHERE tenant_id = p_tenant AND codigo <> 'SERV-GENERAL')),
      (4, 'cliente',  'Registra tu primer cliente', 'Para venderle a su nombre. Al consumidor final le vendes sin registrarlo.', true, true,
         EXISTS (SELECT 1 FROM public.clientes WHERE tenant_id = p_tenant)),
      (5, 'suplidor', 'Registra tu primer suplidor', 'El negocio al que le compras la mercancía.', false, v_compra,
         EXISTS (SELECT 1 FROM public.proveedores WHERE tenant_id = p_tenant)),
      (6, 'compra',   'Registra tu primera compra', 'Así entra la mercancía a tu inventario con su costo.', false, v_compra,
         EXISTS (SELECT 1 FROM public.compras WHERE tenant_id = p_tenant AND NOT COALESCE(es_saldo_inicial, false))),
      (7, 'venta',    'Haz tu primera venta', 'Desde el punto de venta: productos, cliente y forma de pago.', false, true,
         EXISTS (SELECT 1 FROM public.facturas WHERE tenant_id = p_tenant AND NOT COALESCE(es_saldo_inicial, false))),
      (8, 'cierre',   'Haz tu primer cierre de caja', 'Al final del día: cuadra lo vendido con el efectivo.', false, true,
         EXISTS (SELECT 1 FROM public.cierres_caja WHERE tenant_id = p_tenant))
    ) AS t(orden, id, titulo, detalle, opcional, aplica, hecho)
    ORDER BY orden
  LOOP
    CONTINUE WHEN NOT r.aplica;
    v_pasos := v_pasos || jsonb_build_object('id', r.id, 'titulo', r.titulo, 'detalle', r.detalle,
                                             'opcional', r.opcional, 'hecho', r.hecho);
    IF r.hecho THEN v_hechos := v_hechos + 1; END IF;
    IF NOT r.opcional THEN
      v_req := v_req + 1;
      IF r.hecho THEN v_req_ok := v_req_ok + 1; END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'aplica', v_tipo IN ('repuestos', 'dealer', 'cafeteria', 'servicios', 'inmobiliaria')
              AND (v_creada > now() - interval '90 days' OR v_plan IN ('FREE', 'TRIAL')
                   OR EXISTS (SELECT 1 FROM public.suscripciones s
                               WHERE s.tenant_id = p_tenant AND s.es_prueba AND s.fecha_fin > now())),
    'tipo', v_tipo,
    'pasos', v_pasos,
    'hechos', v_hechos,
    'total', jsonb_array_length(v_pasos),
    'completo', v_req_ok = v_req);
END;
$function$;
REVOKE ALL ON FUNCTION private._primeros_pasos(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.primeros_pasos()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT private._primeros_pasos(public.get_user_tenant())
   WHERE auth.uid() IS NOT NULL AND public.get_user_tenant() IS NOT NULL
$function$;
REVOKE ALL ON FUNCTION public.primeros_pasos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.primeros_pasos() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Prueba ──
DO $prueba$
DECLARE
  v_morla uuid := '00000000-0000-0000-0000-000000000001';
  v_elite uuid;
  m jsonb; e jsonb;
BEGIN
  m := private._primeros_pasos(v_morla);
  -- Morla: vieja y ENTERPRISE → no se le enseña; tiene artículos y ventas.
  IF (m->>'aplica')::boolean THEN RAISE EXCEPTION 'prueba: a Morla se le enseñaría la lista: %', m; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(m->'pasos') p WHERE p->>'id' = 'venta' AND (p->>'hecho')::boolean) THEN
    RAISE EXCEPTION 'prueba: Morla sin primera venta: %', m;
  END IF;
  IF jsonb_array_length(m->'pasos') <> 8 THEN RAISE EXCEPTION 'prueba: un repuestos debe tener 8 pasos: %', m; END IF;

  -- La empresa en prueba sí aplica.
  SELECT id INTO v_elite FROM public.tenants WHERE nombre ILIKE 'ELITE SOLUTIONS%' ORDER BY created_at LIMIT 1;
  e := private._primeros_pasos(v_elite);
  IF NOT (e->>'aplica')::boolean THEN RAISE EXCEPTION 'prueba: a la empresa en prueba no se le enseña la lista: %', e; END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(e->'pasos') p WHERE p->>'id' = 'producto' AND (p->>'hecho')::boolean) THEN
    RAISE EXCEPTION 'prueba: la empresa en prueba tiene artículos y el paso no sale hecho: %', e;
  END IF;

  -- Una empresa de servicios no tiene suplidor ni compra (dentro de un bloque que se deshace).
  BEGIN
    UPDATE public.config_empresa SET tipo_negocio = 'servicios' WHERE tenant_id = v_elite;
    e := private._primeros_pasos(v_elite);
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(e->'pasos') p WHERE p->>'id' IN ('suplidor', 'compra')) THEN
      RAISE EXCEPTION 'prueba: servicios con pasos de compra: %', e;
    END IF;
    IF jsonb_array_length(e->'pasos') <> 6 THEN RAISE EXCEPTION 'prueba: servicios debe tener 6 pasos: %', e; END IF;
    RAISE EXCEPTION 'deshacer';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'deshacer' THEN RAISE; END IF;
  END;
END
$prueba$;

SELECT public.registrar_migracion('primeros_pasos.sql');
