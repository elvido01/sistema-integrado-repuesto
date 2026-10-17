-- =====================================================================
-- MotoPréstamos compra y paga por las dos empresas (17/10/2026)
-- ---------------------------------------------------------------------
-- Decisión del dueño: "de ahora en adelante MotoPréstamos Los Naranjos
-- realizará las compras de inventario de ambas compañías y también las
-- pagará". El inventario ya es compartido
-- (sql/inventario_compartido_caminero_motoprestamos.sql): lo que compre
-- MotoPréstamos aparece en Caminero solo.
--
-- 1) DEUDAS DE CAMINERO CON SUPLIDORES → MotoPréstamos. Cada compra
--    pendiente de Caminero (86, ~RD$11.7M, casi todas en US$) aparece en
--    MotoPréstamos como una cuenta por pagar con lo que falta: mismo
--    suplidor (por nombre), misma fecha y días de crédito (mismo
--    vencimiento), moneda, tasa y pendiente en US$. Número "CAM-<numero>".
--    · Va SIN NCF (el NCF queda en la referencia): la compra fiscal es de
--      Caminero y sigue en SU 606; en el de MotoPréstamos no debe salir.
--    · NO se marca es_saldo_inicial: Gestión Empresarial excluye los saldos
--      iniciales y la deuda desaparecería del panel.
--    · Sin líneas ni inventario: la mercancía ya entró (en Caminero, y por
--      el espejo en MotoPréstamos).
--    La original en Caminero conserva su historial, su inventario y su 606,
--    y queda saldada ("deuda asumida por MotoPréstamos"); constancia en
--    compensaciones_entre_empresas. Sin recibos ni pagos: la caja no se mueve.
--
-- 2) ÓRDENES DE COMPRA ABIERTAS (Pendiente/Enviada/Parcial) de Caminero →
--    MotoPréstamos: la orden cambia de empresa con sus líneas apuntando al
--    gemelo de cada producto y el suplidor de MotoPréstamos.
--
-- 3) MÓDULOS. Caminero: Compras, Orden de Compra, Pago a Suplidores y
--    Aprobaciones apagados (el trigger frena grabar compras allí).
--    MotoPréstamos: Compras y Orden de Compra encendidos.
--
-- Idempotente: lo ya pasado no se vuelve a pasar (legacy_id
-- 'traspaso:<id de la compra de Caminero>').
-- =====================================================================

DO $$
DECLARE
  c_cam uuid := 'b39506c3-27dc-467d-830b-096731b83113';
  c_mp  uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
  c_hoy text := to_char(now() AT TIME ZONE 'America/Santo_Domingo', 'DD/MM/YYYY');
  r record; v_prov uuid;
BEGIN
  -- Suplidores que falten en MotoPréstamos (las órdenes pueden traer alguno).
  INSERT INTO public.proveedores (nombre, rnc, telefono, email, activo, dias_credito, vende_a_credito, tenant_id, moneda, empresa_grupo_tenant_id)
  SELECT p.nombre, p.rnc, p.telefono, p.email, p.activo, p.dias_credito, p.vende_a_credito, c_mp, p.moneda, p.empresa_grupo_tenant_id
    FROM public.proveedores p
   WHERE p.tenant_id = c_cam
     AND (EXISTS (SELECT 1 FROM public.compras c WHERE c.suplidor_id = p.id AND c.estado = 'PENDIENTE' AND c.monto_pendiente > 0)
          OR EXISTS (SELECT 1 FROM public.ordenes_compra o WHERE o.suplidor_id = p.id AND o.estado IN ('Pendiente', 'Enviada', 'Parcial')))
     AND NOT EXISTS (SELECT 1 FROM public.proveedores x WHERE x.tenant_id = c_mp AND upper(btrim(x.nombre)) = upper(btrim(p.nombre)));

  -- 1) Deudas
  FOR r IN
    SELECT c.*, p.nombre AS prov_nombre
      FROM public.compras c JOIN public.proveedores p ON p.id = c.suplidor_id
     WHERE c.tenant_id = c_cam AND c.estado = 'PENDIENTE' AND c.monto_pendiente > 0
       AND NOT EXISTS (SELECT 1 FROM public.compras x WHERE x.tenant_id = c_mp AND x.legacy_id = 'traspaso:' || c.id)
  LOOP
    SELECT id INTO v_prov FROM public.proveedores
     WHERE tenant_id = c_mp AND upper(btrim(nombre)) = upper(btrim(r.prov_nombre)) LIMIT 1;

    INSERT INTO public.compras (numero, fecha, ncf, referencia, suplidor_id, total_exento, total_gravado, descuento_total,
      itbis_total, total_compra, itbis_incluido, actualizar_precios, forma_pago, dias_credito, monto_pagado, pagos,
      monto_pendiente, estado, tenant_id, moneda, tasa_cambio, total_usd, pendiente_usd, legacy_id, notas, es_saldo_inicial)
    VALUES ('CAM-' || r.numero, r.fecha, '',
      concat_ws(' · ', 'Deuda de CAMINERO MOTORS (compra ' || r.numero || ')', 'NCF ' || NULLIF(r.ncf, ''), NULLIF(r.referencia, '')),
      v_prov, 0, r.monto_pendiente, 0, 0, r.monto_pendiente, true, false, COALESCE(r.forma_pago, 'Credito'), r.dias_credito,
      0, '[]'::jsonb, r.monto_pendiente, 'PENDIENTE', c_mp, r.moneda, r.tasa_cambio,
      CASE WHEN r.moneda = 'USD' THEN r.pendiente_usd END, CASE WHEN r.moneda = 'USD' THEN r.pendiente_usd END,
      'traspaso:' || r.id,
      'Pasada de Caminero Motors el ' || c_hoy || ': MotoPréstamos paga las compras de las dos empresas. Total original RD$'
        || to_char(r.total_compra, 'FM999,999,990.00') || ', ya pagado en Caminero RD$' || to_char(COALESCE(r.monto_pagado, 0), 'FM999,999,990.00') || '.',
      false);

    INSERT INTO public.compensaciones_entre_empresas (tenant_id, contraparte_id, documento, documento_id, numero, monto, motivo)
    VALUES (c_cam, c_mp, 'compra', r.id, r.numero, r.monto_pendiente,
            'Deuda con ' || r.prov_nombre || ' asumida por MotoPréstamos (compra CAM-' || r.numero || ') el ' || c_hoy);

    UPDATE public.compras SET
      monto_pagado = COALESCE(monto_pagado, 0) + monto_pendiente, monto_pendiente = 0,
      pendiente_usd = CASE WHEN moneda = 'USD' THEN 0 ELSE pendiente_usd END, estado = 'PAGADA',
      notas = concat_ws(E'\n', NULLIF(notas, ''), 'DEUDA ASUMIDA POR MOTOPRÉSTAMOS ' || c_hoy || ': se paga allá (compra CAM-' || numero || '). Sin dinero en esta empresa.')
    WHERE id = r.id;
  END LOOP;

  -- 2) Órdenes de compra abiertas
  UPDATE public.ordenes_compra_detalle d
     SET producto_id = COALESCE((SELECT e.par_id FROM public.productos_espejo e WHERE e.producto_id = d.producto_id), d.producto_id),
         tenant_id = c_mp
    FROM public.ordenes_compra o
   WHERE d.orden_compra_id = o.id AND o.tenant_id = c_cam AND o.estado IN ('Pendiente', 'Enviada', 'Parcial');

  UPDATE public.ordenes_compra o
     SET tenant_id = c_mp,
         suplidor_id = (SELECT x.id FROM public.proveedores x JOIN public.proveedores p ON p.id = o.suplidor_id
                         WHERE x.tenant_id = c_mp AND upper(btrim(x.nombre)) = upper(btrim(p.nombre)) LIMIT 1),
         notas = concat_ws(E'\n', NULLIF(o.notas, ''), 'Pasada de Caminero Motors el ' || c_hoy || '.')
   WHERE o.tenant_id = c_cam AND o.estado IN ('Pendiente', 'Enviada', 'Parcial');

  -- 3) Módulos
  UPDATE public.config_empresa
     SET modulos_deshabilitados = ARRAY(SELECT DISTINCT m FROM unnest(COALESCE(modulos_deshabilitados, '{}')
           || ARRAY['compras', 'orden-compra', 'pago-suplidores', 'aprobaciones-compras']) m)
   WHERE tenant_id = c_cam;
  UPDATE public.config_empresa
     SET modulos_deshabilitados = ARRAY(SELECT m FROM unnest(modulos_deshabilitados) m
                                         WHERE m NOT IN ('compras', 'orden-compra', 'pago-suplidores'))
   WHERE tenant_id = c_mp;
END $$;

SELECT public.registrar_migracion('compras_y_deudas_a_motoprestamos.sql');

-- =====================================================================
-- VERIFICACIÓN
-- =====================================================================
SELECT
  (SELECT COALESCE(SUM(monto_pendiente), 0) FROM public.compras
    WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113' AND estado = 'PENDIENTE') AS caminero_debe_a_suplidores,
  (SELECT json_agg(x ORDER BY x.suplidor) FROM (
     SELECT p.nombre AS suplidor, count(*) AS compras, SUM(c.monto_pendiente) AS pendiente_rd, SUM(c.pendiente_usd) AS pendiente_usd
       FROM public.compras c JOIN public.proveedores p ON p.id = c.suplidor_id
      WHERE c.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4' AND c.legacy_id LIKE 'traspaso:%' AND c.estado = 'PENDIENTE'
      GROUP BY 1) x) AS motoprestamos_debe,
  (SELECT count(*) FROM public.ordenes_compra WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4') AS ordenes_en_motoprestamos,
  (SELECT modulos_deshabilitados FROM public.config_empresa WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113') AS caminero_apagados,
  (SELECT modulos_deshabilitados FROM public.config_empresa WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4') AS motoprestamos_apagados;
