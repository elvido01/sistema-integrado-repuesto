-- =====================================================================
-- Separación Caminero Motors / MotoPréstamos: deuda cruzada y suplidores
-- ---------------------------------------------------------------------
-- (17/10/2026) Decisión del dueño al separar las empresas:
--
-- 1) DEUDA CRUZADA SALDADA. Las ventas financiadas por terceros dejaron
--    a Caminero con una cuenta por cobrar contra MotoPréstamos (52 facturas,
--    RD$4,209,458.08) y a MotoPréstamos con la cuenta por pagar a Caminero
--    (592 cuotas, RD$4,155,058.08). Son del mismo dueño: las dos puntas
--    quedan en cero. Los préstamos de los clientes siguen en MotoPréstamos.
--    La diferencia de RD$54,400 son las facturas 16 y 17 (la que ya se sabía
--    fuera, sin investigar): también se salda del lado de Caminero.
--
--    NO es un recibo ni un pago a suplidor: la caja suma TODOS los recibos
--    y pagos sin mirar la forma (sql/gasto_no_afecta_caja.sql), y meter
--    RD$4.2M de compensación inflaría la caja de una y vaciaría la de la
--    otra. Se salda el documento y queda la constancia en
--    compensaciones_entre_empresas (una fila por factura y por cuota).
--
--    La factura de JOSE FELICIANO LADO MORALE (RD$12,540) no es de
--    MotoPréstamos: se queda en Caminero.
--
-- 2) SUPLIDORES COPIADOS. Los de Caminero se copian a MotoPréstamos (los
--    dos quedan con ellos; Caminero conserva sus compras y deudas). Menos
--    "CLINTE GENERICO", que es un cliente puesto como suplidor.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.compensaciones_entre_empresas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha          timestamptz NOT NULL DEFAULT now(),
  tenant_id      uuid NOT NULL,            -- la empresa del documento saldado
  contraparte_id uuid NOT NULL,            -- la otra empresa
  documento      text NOT NULL CHECK (documento IN ('factura', 'compra')),
  documento_id   uuid NOT NULL,
  numero         text,
  monto          numeric NOT NULL,
  motivo         text NOT NULL
);
ALTER TABLE public.compensaciones_entre_empresas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compensaciones_ver ON public.compensaciones_entre_empresas;
CREATE POLICY compensaciones_ver ON public.compensaciones_entre_empresas
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant());
REVOKE INSERT, UPDATE, DELETE ON public.compensaciones_entre_empresas FROM anon, authenticated;

DO $$
DECLARE
  c_cam uuid := 'b39506c3-27dc-467d-830b-096731b83113';
  c_mp  uuid := '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
  c_motivo text := 'Separación de empresas 17/10/2026: deuda cruzada Caminero↔MotoPréstamos saldada por compensación (sin dinero)';
  v_cliente_mp uuid[];
  v_prov_cam uuid[];
BEGIN
  -- La ficha de MotoPréstamos como cliente en Caminero, y la de Caminero
  -- como suplidor en MotoPréstamos.
  SELECT array_agg(id) INTO v_cliente_mp FROM public.clientes
   WHERE tenant_id = c_cam AND nombre ILIKE 'Motoprestamos los naraj%';
  SELECT array_agg(id) INTO v_prov_cam FROM public.proveedores
   WHERE tenant_id = c_mp AND nombre ILIKE 'CAMINERO MOTORS%';

  -- 1a) Caminero: facturas contra MotoPréstamos
  INSERT INTO public.compensaciones_entre_empresas (tenant_id, contraparte_id, documento, documento_id, numero, monto, motivo)
  SELECT c_cam, c_mp, 'factura', f.id, f.numero::text, f.monto_pendiente, c_motivo
    FROM public.facturas f
   WHERE f.tenant_id = c_cam AND f.cliente_id = ANY (v_cliente_mp)
     AND f.estado = 'PENDIENTE' AND f.monto_pendiente > 0;

  UPDATE public.facturas f
     SET monto_pendiente = 0, estado = 'PAGADA',
         notas = concat_ws(E'\n', NULLIF(f.notas, ''), 'COMPENSADA ' || to_char(now() AT TIME ZONE 'America/Santo_Domingo', 'DD/MM/YYYY') || ': deuda cruzada con MotoPréstamos saldada al separar las empresas (sin dinero).')
   WHERE f.tenant_id = c_cam AND f.cliente_id = ANY (v_cliente_mp)
     AND f.estado = 'PENDIENTE' AND f.monto_pendiente > 0;

  -- 1b) MotoPréstamos: cuotas por pagar a Caminero
  INSERT INTO public.compensaciones_entre_empresas (tenant_id, contraparte_id, documento, documento_id, numero, monto, motivo)
  SELECT c_mp, c_cam, 'compra', c.id, c.numero::text, c.monto_pendiente, c_motivo
    FROM public.compras c
   WHERE c.tenant_id = c_mp AND c.suplidor_id = ANY (v_prov_cam)
     AND c.estado = 'PENDIENTE' AND c.monto_pendiente > 0;

  UPDATE public.compras c
     SET monto_pagado = COALESCE(c.monto_pagado, 0) + c.monto_pendiente,
         monto_pendiente = 0, estado = 'PAGADA',
         notas = concat_ws(E'\n', NULLIF(c.notas, ''), 'COMPENSADA ' || to_char(now() AT TIME ZONE 'America/Santo_Domingo', 'DD/MM/YYYY') || ': deuda cruzada con Caminero saldada al separar las empresas (sin dinero).')
   WHERE c.tenant_id = c_mp AND c.suplidor_id = ANY (v_prov_cam)
     AND c.estado = 'PENDIENTE' AND c.monto_pendiente > 0;

  -- 2) Suplidores de Caminero → MotoPréstamos (los que no tenga ya)
  INSERT INTO public.proveedores (nombre, rnc, telefono, email, activo, dias_credito, vende_a_credito, tenant_id, moneda, empresa_grupo_tenant_id)
  SELECT p.nombre, p.rnc, p.telefono, p.email, p.activo, p.dias_credito, p.vende_a_credito, c_mp, p.moneda, p.empresa_grupo_tenant_id
    FROM public.proveedores p
   WHERE p.tenant_id = c_cam
     AND p.nombre NOT ILIKE 'CLINTE GENERICO%'
     AND NOT EXISTS (SELECT 1 FROM public.proveedores x WHERE x.tenant_id = c_mp AND upper(btrim(x.nombre)) = upper(btrim(p.nombre)));
END $$;

SELECT public.registrar_migracion('separacion_caminero_motoprestamos_cxc_suplidores.sql');

-- =====================================================================
-- VERIFICACIÓN
-- =====================================================================
SELECT
  (SELECT COALESCE(SUM(monto_pendiente), 0) FROM public.facturas
    WHERE tenant_id = 'b39506c3-27dc-467d-830b-096731b83113' AND estado = 'PENDIENTE') AS caminero_cxc_queda,
  (SELECT COALESCE(SUM(c.monto_pendiente), 0) FROM public.compras c JOIN public.proveedores p ON p.id = c.suplidor_id
    WHERE c.tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4' AND p.nombre ILIKE 'CAMINERO MOTORS%' AND c.estado = 'PENDIENTE') AS motoprestamos_debe_a_caminero,
  (SELECT json_object_agg(documento, json_build_object('n', n, 'monto', m)) FROM (
     SELECT documento, count(*) n, SUM(monto) m FROM public.compensaciones_entre_empresas GROUP BY 1) x) AS compensado,
  (SELECT json_agg(nombre ORDER BY nombre) FROM public.proveedores WHERE tenant_id = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4') AS suplidores_motoprestamos;
