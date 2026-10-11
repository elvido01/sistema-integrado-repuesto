-- =====================================================================
-- SALDOS INICIALES DE CLIENTES (cuentas por cobrar del sistema anterior)
-- =====================================================================
-- (11/10/2026) Una tienda que se cambia a MotoFlow trae clientes que le
-- deben. Hay que poder COBRARLES en MotoFlow sin que esos saldos cuenten
-- como ventas.
--
-- Diseño: cada saldo es una FACTURA marcada es_saldo_inicial = true:
--   · a CRÉDITO, PENDIENTE, sin detalle de productos, ITBIS 0, con la fecha
--     del documento original (o la de corte), y vendedor 'SALDO INICIAL'.
--   · Así el recibo de ingreso, el estado de cuenta, la cartera, la mora y
--     el balance del cliente funcionan SIN TOCARLOS (leen facturas
--     PENDIENTE a CRÉDITO).
--   · No entra a la caja (es crédito), ni a rentabilidad/comisiones (sin
--     detalle ni vendedor real), ni a "ventas de hoy/del mes" (fecha vieja).
--   · Se excluye a propósito en los dos sitios donde sí estorbaría: la cola
--     de reintento e-CF (emitir-fiscal) y el reporte 607 (ReportesDGIIPage).
--   · Gasta números FT internos (no fiscales): la primera venta real sale
--     después de los saldos.
--
-- importar_saldos_iniciales(p_filas jsonb, p_simular boolean)
--   p_filas: [{cliente (código), rnc, documento, fecha (YYYY-MM-DD), monto, dias_credito}]
--   · El cliente tiene que existir (por código, o por RNC/cédula):
--     se importan primero los clientes.
--   · Monto > 0. Fecha no futura; vacía = último día del mes anterior
--     (los reportes de ventas suman por fecha: así no inflan el mes en que
--     la empresa arranca; con fechas reales viejas tampoco).
--   · Mismo cliente + mismo documento ya importado → se salta (se puede
--     volver a correr el archivo sin duplicar).
--   · Al final recalcula clientes.balance igual que el recibo de ingreso.
-- =====================================================================

BEGIN;

ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS es_saldo_inicial boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_facturas_saldo_inicial
  ON public.facturas (tenant_id) WHERE es_saldo_inicial;

CREATE OR REPLACE FUNCTION public.importar_saldos_iniciales(
  p_filas jsonb, p_simular boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant   uuid := public.get_user_tenant();
  v_ok       int := 0;
  v_monto    numeric := 0;
  v_repet    int := 0;
  v_errores  jsonb := '[]'::jsonb;
  v_clientes uuid[] := '{}';
  r          record;
  v_doc      text;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'No hay empresa activa.';
  END IF;
  IF jsonb_typeof(p_filas) <> 'array' OR jsonb_array_length(p_filas) > 2000 THEN
    RAISE EXCEPTION 'Envía entre 1 y 2000 filas por vez.';
  END IF;

  FOR r IN
    SELECT x.*, row_number() OVER () AS orden,
           coalesce(
             (SELECT k.id FROM clientes k WHERE k.tenant_id = v_tenant AND nullif(trim(x.cliente), '') IS NOT NULL
                AND upper(k.codigo) = upper(trim(x.cliente)) ORDER BY k.id LIMIT 1),
             (SELECT k.id FROM clientes k WHERE k.tenant_id = v_tenant
                AND nullif(regexp_replace(coalesce(x.rnc, ''), '\D', '', 'g'), '') IS NOT NULL
                AND regexp_replace(coalesce(k.rnc, ''), '\D', '', 'g') = regexp_replace(x.rnc, '\D', '', 'g')
                ORDER BY k.id LIMIT 1)) AS cliente_id
      FROM jsonb_to_recordset(p_filas) AS x(cliente text, rnc text, documento text, fecha date, monto numeric, dias_credito numeric)
  LOOP
    v_doc := coalesce(nullif(trim(r.documento), ''), 'fila ' || r.orden);
    IF r.cliente_id IS NULL THEN
      v_errores := v_errores || jsonb_build_object('fila', coalesce(r.cliente, r.rnc, v_doc),
        'motivo', 'El cliente no existe (impórtalo primero en Clientes)');
      CONTINUE;
    END IF;
    IF coalesce(r.monto, 0) <= 0 THEN
      v_errores := v_errores || jsonb_build_object('fila', coalesce(r.cliente, r.rnc) || ' / ' || v_doc, 'motivo', 'Monto vacío, cero o negativo');
      CONTINUE;
    END IF;
    IF r.fecha > current_date THEN
      v_errores := v_errores || jsonb_build_object('fila', coalesce(r.cliente, r.rnc) || ' / ' || v_doc, 'motivo', 'Fecha en el futuro');
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM facturas f WHERE f.tenant_id = v_tenant AND f.es_saldo_inicial
                 AND f.cliente_id = r.cliente_id AND f.notas = 'SALDO INICIAL: ' || v_doc) THEN
      v_repet := v_repet + 1;
      CONTINUE;
    END IF;

    v_ok := v_ok + 1;
    v_monto := v_monto + r.monto;
    CONTINUE WHEN p_simular;

    INSERT INTO facturas (tenant_id, fecha, cliente_id, subtotal, descuento, recargo, itbis, total,
                          forma_pago, tipo_pago, dias_credito, monto_recibido, cambio, monto_pendiente,
                          estado, vendedor, notas, es_saldo_inicial, usuario_id)
    VALUES (v_tenant,
            ((coalesce(r.fecha, (date_trunc('month', current_date) - interval '1 day')::date))::timestamp + time '12:00') AT TIME ZONE 'America/Santo_Domingo',
            r.cliente_id, r.monto, 0, 0, 0, r.monto,
            'CREDITO', 'SALDO INICIAL', coalesce(r.dias_credito, 30)::int, 0, 0, r.monto,
            'PENDIENTE', 'SALDO INICIAL', 'SALDO INICIAL: ' || v_doc, true, auth.uid());
    v_clientes := array_append(v_clientes, r.cliente_id);
  END LOOP;

  -- Balance del cliente: la misma cuenta que hace el recibo de ingreso.
  IF NOT p_simular AND array_length(v_clientes, 1) > 0 THEN
    UPDATE clientes c
       SET balance = (SELECT coalesce(sum(f.monto_pendiente), 0) FROM facturas f
                       WHERE f.cliente_id = c.id AND f.estado = 'PENDIENTE')
     WHERE c.id = ANY (v_clientes) AND c.tenant_id = v_tenant;
  END IF;

  RETURN jsonb_build_object('simulado', p_simular, 'nuevos', v_ok, 'monto_total', v_monto,
                            'ya_importados', v_repet, 'errores', v_errores);
END
$fn$;

REVOKE ALL ON FUNCTION public.importar_saldos_iniciales(jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.importar_saldos_iniciales(jsonb, boolean) TO authenticated;

COMMIT;

SELECT public.registrar_migracion('saldos_iniciales_clientes.sql');
