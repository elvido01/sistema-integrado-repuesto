-- =====================================================================
-- Llenar el chasis de las motos que lo tienen vacío (su código ES el VIN)
-- ---------------------------------------------------------------------
-- (2026-07-30) Continuación de sql/chasis_una_sola_unidad.sql.
--
-- En Caminero hay 39 productos con el campo `chasis` vacío. Los 39 son de
-- tipo MOTOCICLETA y su código es el número de chasis:
--
--   LLCLHMP04TP020064   LONCIN LX250ZH-13 MAX 2026
--   TBLPCG4J1N2001368   MOTOCICLETA AZUL X1000 2026 DIAMONS
--   LLCLT1S0XTCK02296   LONCIN NATIVA 125 SPORT 2026 …
--
-- Entraron sin llenar el campo, y por eso:
--   · Gestión Empresarial no las cuenta (pide `chasis` lleno) — el panel
--     dice 78 motos cuando hay más.
--   · El candado de "un chasis, una moto" no las protege.
--
-- >>> LA REGLA <<<
-- Producto de tipo MOTOCICLETA con el chasis vacío → chasis = su código.
-- Se ata al TIPO, no al largo del código ni al texto de la descripción: el
-- tipo es un dato que el usuario eligió a propósito al crear la mercancía,
-- no una adivinanza. Ningún repuesto se toca.
--
-- >>> LO QUE NO HACE ESTE SCRIPT, Y HAY QUE MIRAR <<<
-- Al revisar aparecieron 4 motos registradas DOS VECES, con el VIN escrito
-- con la letra I en lugar del número 1:
--
--   XFINC1102TL533399  stock 0   ←  XF1NC1102TL533399  stock 1
--   XFINC1102TL533447  stock 0   ←  XF1NC1102TL533447  stock 1
--   XFINC1102TL533675  stock 0   ←  XF1NC1102TL533675  stock 1
--   XFINC1102TL533686  stock 0   ←  XF1NC1102TL533686  stock 1
--
-- Un VIN de verdad NUNCA lleva I, O ni Q (norma ISO 3779), justo para que no
-- se confundan con 1 y 0. Las "XFI" están en cero, así que no descuadran
-- nada hoy, pero son fichas fantasma de motos que ya existen bien escritas.
-- No las toco: darlas de baja es tu decisión. La verificación 3 las lista.
--
-- Idempotente / re-ejecutable.
-- =====================================================================

-- ------------------------------------------------------------
-- 1) EL CHASIS SALE DEL CÓDIGO
-- ------------------------------------------------------------
UPDATE public.productos p
   SET chasis = btrim(p.codigo)
  FROM public.tipos_producto t
 WHERE t.id = p.tipo_id
   AND upper(btrim(t.nombre)) = 'MOTOCICLETA'
   AND COALESCE(btrim(p.chasis), '') = ''
   AND COALESCE(btrim(p.codigo), '') <> '';

DO $$ BEGIN
  IF to_regprocedure('public.registrar_migracion(text)') IS NOT NULL THEN
    PERFORM public.registrar_migracion('chasis_llenar_desde_codigo.sql');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- VERIFICACIÓN
-- ------------------------------------------------------------
-- 1) NO DEBE QUEDAR NINGUNA MOTO SIN CHASIS
SELECT COUNT(*) AS motos_sin_chasis
FROM public.productos p
JOIN public.tipos_producto t ON t.id = p.tipo_id
WHERE upper(btrim(t.nombre)) = 'MOTOCICLETA'
  AND COALESCE(btrim(p.chasis), '') = '';
-- esperado: 0  (eran 39 en Caminero)

-- 2) LO QUE VA A DECIR AHORA GESTIÓN EMPRESARIAL
WITH stock AS (
  SELECT m.producto_id, SUM(m.cantidad) AS existencia
  FROM public.inventario_movimientos m
  WHERE m.tenant_id = 'b39506c3-27dc-467d-830b-096731b83113'
  GROUP BY m.producto_id
  HAVING SUM(m.cantidad) > 0
)
SELECT COUNT(*) AS productos_con_existencia,
       SUM(s.existencia) AS unidades,
       COUNT(*) FILTER (WHERE p.chasis IS NOT NULL AND btrim(p.chasis) <> ''
                          AND COALESCE(p.activo, true))          AS motos_del_panel,
       ROUND(SUM(COALESCE(p.costo, 0)) FILTER (WHERE p.chasis IS NOT NULL
                          AND btrim(p.chasis) <> ''
                          AND COALESCE(p.activo, true)), 2)      AS costo_del_panel,
       COUNT(*) FILTER (WHERE p.activo = false)                  AS inactivos_con_stock
FROM stock s JOIN public.productos p ON p.id = s.producto_id;
-- El panel subía de 78 porque ahora ve las que le faltaban. Los inactivos
-- con existencia siguen fuera: son motos dadas de baja que aún tienen stock,
-- y eso hay que resolverlo a mano (¿se venden o se dan de baja de verdad?).

-- 3) LAS FICHAS DUPLICADAS POR TIPEO (I por 1, O por 0)
-- Un VIN no lleva I, O ni Q. Si al cambiarlas por 1 y 0 dos códigos se
-- vuelven el mismo, es la misma moto escrita dos veces.
WITH motos AS (
  SELECT p.id, p.codigo, p.descripcion, p.activo, p.tenant_id,
         translate(upper(btrim(p.codigo)), 'IOQ', '100') AS vin_normalizado,
         COALESCE((SELECT SUM(m.cantidad) FROM public.inventario_movimientos m
                    WHERE m.producto_id = p.id), 0) AS existencia
  FROM public.productos p
  JOIN public.tipos_producto t ON t.id = p.tipo_id
  WHERE upper(btrim(t.nombre)) = 'MOTOCICLETA'
)
SELECT a.vin_normalizado, a.codigo, a.descripcion, a.existencia, a.activo
FROM motos a
WHERE EXISTS (SELECT 1 FROM motos b
               WHERE b.tenant_id = a.tenant_id
                 AND b.vin_normalizado = a.vin_normalizado
                 AND b.id <> a.id)
ORDER BY a.vin_normalizado, a.codigo;
-- esperado: 8 filas = 4 pares. En cada par, la del código con "I" está en 0
-- y la del código con "1" tiene la moto. Las de cero se pueden dar de baja.

-- 4) MOTOS CON UN VIN QUE NO PUEDE SER (lleva I, O o Q)
SELECT p.codigo, p.descripcion,
       COALESCE((SELECT SUM(m.cantidad) FROM public.inventario_movimientos m
                  WHERE m.producto_id = p.id), 0) AS existencia
FROM public.productos p
JOIN public.tipos_producto t ON t.id = p.tipo_id
WHERE upper(btrim(t.nombre)) = 'MOTOCICLETA'
  AND upper(btrim(p.codigo)) ~ '[IOQ]'
ORDER BY existencia DESC, p.codigo;
-- Estas tienen el VIN mal escrito aunque no tengan pareja. Las que traen
-- existencia son motos reales con el chasis mal tecleado: conviene
-- corregirlas contra la matrícula antes de venderlas.
