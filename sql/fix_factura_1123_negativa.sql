-- ============================================================
-- FIX: Factura FT-1123 de CAMINERO MOTORS (Cobrador REPUESTOS MORLA)
-- con monto_pendiente negativo (-388.00 según screenshot, o -130 según usuario)
-- ============================================================
-- El problema fue que al crear una venta a crédito con abono parcial,
-- el sistema restaba el abono DOS veces:
--   1) Al insertar la factura (monto_pendiente = total - abono)
--   2) La RPC crear_recibo_ingreso_y_actualizar_facturas restaba OTRA VEZ
-- ============================================================

-- PASO 1: Diagnosticar - Ver el estado actual de la factura 1123
SELECT 
    id,
    numero,
    cliente_id,
    total,
    monto_pendiente,
    monto_recibido,
    estado,
    forma_pago,
    tipo_pago,
    fecha
FROM facturas 
WHERE numero = 1123;

-- PASO 2: Ver todos los abonos que se han hecho a esta factura
SELECT 
    ri.numero as recibo_numero,
    ri.fecha,
    rid.monto_abonado,
    ri.concepto
FROM recibos_ingreso_detalle rid
JOIN recibos_ingreso ri ON ri.id = rid.recibo_id
JOIN facturas f ON f.id = rid.factura_id
WHERE f.numero = 1123
ORDER BY ri.fecha;

-- PASO 3: Corregir el monto_pendiente
-- El monto correcto es: total - SUM(abonos reales)
-- EJECUTAR ESTO después de verificar los datos en los pasos 1 y 2:

UPDATE facturas f
SET monto_pendiente = f.total - COALESCE((
    SELECT SUM(rid.monto_abonado) 
    FROM recibos_ingreso_detalle rid 
    WHERE rid.factura_id = f.id
), 0),
estado = CASE 
    WHEN (f.total - COALESCE((
        SELECT SUM(rid.monto_abonado) 
        FROM recibos_ingreso_detalle rid 
        WHERE rid.factura_id = f.id
    ), 0)) <= 0.01 THEN 'PAGADA'
    ELSE 'PENDIENTE'
END
WHERE f.numero = 1123;

-- PASO 4: Actualizar el balance del cliente
UPDATE clientes c
SET balance = (
    SELECT COALESCE(SUM(f.monto_pendiente), 0) 
    FROM facturas f 
    WHERE f.cliente_id = c.id AND f.estado = 'PENDIENTE'
)
WHERE c.id = (SELECT cliente_id FROM facturas WHERE numero = 1123 LIMIT 1);

-- PASO 5: Verificar la corrección
SELECT 
    f.numero,
    f.total,
    f.monto_pendiente,
    f.estado,
    COALESCE((
        SELECT SUM(rid.monto_abonado) 
        FROM recibos_ingreso_detalle rid 
        WHERE rid.factura_id = f.id
    ), 0) as total_abonado
FROM facturas f
WHERE f.numero = 1123;
