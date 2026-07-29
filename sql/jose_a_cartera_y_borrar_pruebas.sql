-- =====================================================================
-- JOSÉ va a la cartera · JUAN ALONZO y PAPOLO se borran (eran pruebas)
-- ---------------------------------------------------------------------
-- (2026-07-29) "Esa es la deuda real de José y tienes que integrarlo en la
-- cartera de MotoPréstamos Los Naranjos. Juan Alonzo y Papolo eran pruebas,
-- elimínalas."
--
-- >>> 1) JOSÉ: la venta y el préstamo son el mismo negocio <<<
-- La factura FT-0000003 de Caminero (24/07/2025, MOTOCICLETA X1000 SUPER
-- GATO, pendiente 12,540) y el préstamo PT-0026114 de MotoPréstamos
-- (24/07/2025, JOSE F. LADO MORALES) son la misma venta financiada. Nunca
-- se enlazaron, así que el panel la contaba como "venta a crédito sin
-- préstamo" — la alerta hizo su trabajo.
--
-- Se enlazan con la marca que ya usa el sistema: "[FT:<id de la factura>]"
-- en las notas del préstamo. Con eso la deuda de José la cuenta la CARTERA,
-- que es donde vive de verdad (balance 7,847.48: capital 7,675.29 + mora
-- 172.19), y deja de aparecer como cobranza suelta de Caminero.
--
-- El RNC difiere en el último dígito entre las dos empresas
-- (402-1441052-2 en Caminero, 402-1441052-0 en MotoPréstamos). Por eso el
-- enlace se hace por la FACTURA, no cruzando cédulas.
--
-- >>> 2) JUAN ALONZO Y PAPOLO: se borran <<<
-- Dos ventas de prueba de NIPPONIA BRIO-110 (24/06/2026), con RNC
-- inventados a partir del de la empresa: 028-0099156-4 y 028-0099156-8,
-- cuando el real es 028-0099156-0.
--
-- El borrado se maneja por CLIENTE, no por número de factura: así arrastra
-- todo lo que cuelga de ellos de una vez. Yendo factura por factura, la
-- base fue rechazando el borrado tabla por tabla — primero los recibos,
-- después los pedidos — y cada intento revertía TODO el bloque, porque es
-- una sola transacción.
--
-- Se borran de verdad, no se anulan: una venta que nunca existió no debe
-- quedar como ANULADA ensuciando los reportes.
--
-- >>> LAS DOS MOTOCICLETAS VUELVEN AL INVENTARIO <<<
-- Al borrar las facturas, sus dos unidades dejan de estar vendidas y el
-- inventario pasa de 78 a 80 motos. Es lo correcto: nunca se vendieron, las
-- motos están en el patio.
--
-- >>> SE VA TODO EL RASTRO, EN ORDEN <<<
-- La prueba no dejó solo dos facturas. Buscando qué apunta a esos dos
-- clientes aparecieron cinco tablas, y la base las fue frenando de una en
-- una hasta que se listaron todas:
--
--   clientes ─┬─ facturas ─┬─ facturas_detalle
--             │            └─ recibos_ingreso_detalle
--             ├─ recibos_ingreso  (RI-000003, RI-000004 — la inicial)
--             ├─ pedidos ── pedidos_detalle        (4)
--             └─ solicitudes_compras               (4)
--
-- Se borran de adentro hacia afuera. Un recibo de un cobro que nunca
-- ocurrió no puede quedar suelto: seguiría contando como dinero entrado
-- ese día. Y un pedido "Facturado" cuya factura ya no existe queda
-- apuntando al vacío.
--
-- El recibo padre solo se borra si TODAS sus líneas son de estas facturas.
-- Si alguno cobrara además otra factura de verdad, se le quita solo la
-- línea de la prueba y el recibo se queda.
--
-- >>> CANDADOS <<<
-- Solo borra facturas SIN NCF. Una factura con comprobante fiscal no se
-- borra jamás — se anula — y si alguna de estas tuviera uno, el script se
-- detiene sin tocar nada.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

DO $$
DECLARE
  v_cam  uuid := 'b39506c3-27dc-467d-830b-096731b83113';
  v_fin  uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
  v_ft3  uuid;
  v_pt   uuid;
  v_ids  uuid[];
  v_recibos uuid[];
  v_clientes uuid[];
  v_pedidos uuid[];
  v_con_ncf int;
  v_n    int;
BEGIN
  -- ---------- 1) JOSÉ ----------
  SELECT id INTO v_ft3 FROM public.facturas
   WHERE tenant_id = v_cam AND numero = 3 AND COALESCE(estado,'') <> 'ANULADA';
  SELECT id INTO v_pt  FROM public.prestamos
   WHERE tenant_id = v_fin AND numero = 'PT-0026114';

  IF v_ft3 IS NULL OR v_pt IS NULL THEN
    RAISE NOTICE 'No se encontró FT-0000003 o PT-0026114 — no se enlaza nada.';
  ELSIF EXISTS (SELECT 1 FROM public.prestamos
                 WHERE id = v_pt AND notas LIKE '%[FT:' || v_ft3::text || '%') THEN
    RAISE NOTICE 'José ya estaba enlazado a su préstamo.';
  ELSE
    UPDATE public.prestamos
       SET notas = COALESCE(NULLIF(btrim(COALESCE(notas, '')), '') || ' | ', '')
                   || 'Origen: factura #3 (CAMINERO MOTORS) | Comprador: JOSE FELICIANO LADO MORALE [FT:'
                   || v_ft3::text || ']'
     WHERE id = v_pt;
    RAISE NOTICE 'FT-0000003 enlazada a PT-0026114: la deuda de José la cuenta la cartera.';
  END IF;

  -- ---------- 2) LAS PRUEBAS ----------
  -- Se manejan por CLIENTE, no por número de factura: así se arrastra todo
  -- lo que cuelga de ellos y no aparece una tabla nueva en cada intento.
  SELECT array_agg(id) INTO v_clientes
  FROM public.clientes
  WHERE tenant_id = v_cam AND rnc IN ('028-0099156-4', '028-0099156-8');

  IF v_clientes IS NULL THEN
    RAISE NOTICE 'Los clientes de prueba ya no están — nada que borrar.';
  ELSE
    SELECT array_agg(id), count(*) FILTER (WHERE NULLIF(btrim(COALESCE(ncf,'')),'') IS NOT NULL)
      INTO v_ids, v_con_ncf
    FROM public.facturas
    WHERE tenant_id = v_cam AND cliente_id = ANY(v_clientes);

    -- Candado: con comprobante fiscal no se borra, se anula. Y eso lo decide
    -- una persona, no un script.
    IF COALESCE(v_con_ncf, 0) > 0 THEN
      RAISE EXCEPTION 'Una factura de prueba tiene NCF: no se borra una factura fiscal. Revisar a mano.';
    END IF;

    -- 2.a) Los recibos de la inicial
    IF v_ids IS NOT NULL THEN
      SELECT array_agg(DISTINCT d.recibo_id) INTO v_recibos
      FROM public.recibos_ingreso_detalle d WHERE d.factura_id = ANY(v_ids);

      DELETE FROM public.recibos_ingreso_detalle WHERE factura_id = ANY(v_ids);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      RAISE NOTICE 'Líneas de recibo borradas: %', v_n;
    END IF;

    -- Los recibos del cliente, aunque no colgaran de una factura
    SELECT array_cat(COALESCE(v_recibos, '{}'), COALESCE(array_agg(id), '{}')) INTO v_recibos
    FROM public.recibos_ingreso
    WHERE tenant_id = v_cam AND cliente_id = ANY(v_clientes);

    IF v_recibos IS NOT NULL AND array_length(v_recibos, 1) > 0 THEN
      DELETE FROM public.recibos_ingreso_detalle WHERE recibo_id = ANY(v_recibos);
      DELETE FROM public.movimientos_bancarios
       WHERE origen_tipo = 'recibo' AND origen_id = ANY(v_recibos);
      DELETE FROM public.recibos_ingreso r
       WHERE r.id = ANY(v_recibos)
         AND NOT EXISTS (SELECT 1 FROM public.recibos_ingreso_detalle d
                          WHERE d.recibo_id = r.id AND NOT (d.factura_id = ANY(COALESCE(v_ids, '{}'))));
      GET DIAGNOSTICS v_n = ROW_COUNT;
      RAISE NOTICE 'Recibos borrados: %', v_n;
    END IF;

    -- 2.b) Las facturas. Aquí las motocicletas vuelven al patio.
    IF v_ids IS NOT NULL THEN
      DELETE FROM public.facturas_detalle WHERE factura_id = ANY(v_ids);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      RAISE NOTICE 'Líneas de factura borradas: % (sus motocicletas vuelven al inventario)', v_n;

      DELETE FROM public.facturas WHERE id = ANY(v_ids);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      RAISE NOTICE 'Facturas de prueba borradas: %', v_n;
    END IF;

    -- 2.c) Los pedidos que originaron esas ventas
    SELECT array_agg(id) INTO v_pedidos
    FROM public.pedidos WHERE cliente_id = ANY(v_clientes);

    IF v_pedidos IS NOT NULL THEN
      DELETE FROM public.pedidos_detalle WHERE pedido_id = ANY(v_pedidos);
      DELETE FROM public.pedidos WHERE id = ANY(v_pedidos);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      RAISE NOTICE 'Pedidos de prueba borrados: %', v_n;
    END IF;

    -- 2.d) Y las solicitudes de compra
    DELETE FROM public.solicitudes_compras WHERE cliente_id = ANY(v_clientes);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'Solicitudes de prueba borradas: %', v_n;

    -- 2.e) Por fin, los clientes
    DELETE FROM public.clientes WHERE id = ANY(v_clientes);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'Clientes de prueba borrados: % (JUAN ALONZO, PAPOLO)', v_n;
  END IF;
END $$;

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('jose_a_cartera_y_borrar_pruebas.sql');
  END IF;
END $$;

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) JOSÉ: su factura ya cuelga del préstamo
SELECT p.numero AS prestamo, p.estado, p.monto_capital, p.fecha_inicio,
       c.nombre AS cliente, left(p.notas, 90) AS notas
FROM public.prestamos p
JOIN public.clientes c ON c.id = p.cliente_id
WHERE p.numero = 'PT-0026114';
-- esperado: notas con "[FT:<id>]" al final

-- 2) LA ALERTA DEL PANEL: debería quedar vacía
SELECT f.numero, f.fecha::date, c.nombre, f.monto_pendiente
FROM public.facturas f
LEFT JOIN public.clientes c ON c.id = f.cliente_id
WHERE f.tenant_id IN ('b39506c3-27dc-467d-830b-096731b83113',
                      '766fe3d6-6885-4f2b-b2cc-1a91db696fb4')
  AND COALESCE(f.monto_pendiente, 0) > 0
  AND COALESCE(f.estado, '') <> 'ANULADA'
  AND NOT EXISTS (SELECT 1 FROM public.prestamos p
                   WHERE p.estado = 'activo'
                     AND p.notas LIKE '%[FT:' || f.id::text || '%')
ORDER BY f.fecha;
-- esperado: 0 filas → la línea ámbar desaparece del panel

-- 3) LAS MOTOS VUELVEN AL INVENTARIO
SELECT count(*) AS motos_en_inventario,
       COALESCE(SUM(p.costo), 0) AS valor_al_costo
FROM public.productos p
WHERE p.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  AND COALESCE(p.activo, true) AND p.chasis IS NOT NULL AND btrim(p.chasis) <> ''
  AND public.get_stock_actual(p.id) > 0;
-- esperado: 80 (antes 78) — las dos NIPPONIA BRIO-110 de las pruebas

-- 4) Que no quedó rastro de las pruebas
SELECT 'facturas'  AS que, count(*) AS quedan FROM public.facturas
 WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113' AND numero IN (4, 5)
UNION ALL
SELECT 'recibos de su inicial', count(*) FROM public.recibos_ingreso
 WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
   AND numero IN ('RI-000003', 'RI-000004')
UNION ALL
SELECT 'clientes de prueba', count(*) FROM public.clientes
 WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
   AND rnc IN ('028-0099156-4', '028-0099156-8')
UNION ALL
SELECT 'pedidos', count(*) FROM public.pedidos p
 WHERE EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = p.cliente_id
                 AND c.rnc IN ('028-0099156-4', '028-0099156-8'))
UNION ALL
SELECT 'solicitudes', count(*) FROM public.solicitudes_compras s
 WHERE EXISTS (SELECT 1 FROM public.clientes c WHERE c.id = s.cliente_id
                 AND c.rnc IN ('028-0099156-4', '028-0099156-8'));
-- esperado: 0 en las cinco
