# Módulo Ventas

## Cómo funciona el flujo en cabeza

El cajero/vendedor:
1. Selecciona cliente (o usa CLIENTE GENERICO)
2. Tipea código del producto + Enter → el sistema busca y mete la línea
3. Si stock = 0, el sistema sugiere equivalente con stock (Fase 4 equivalentes)
4. F10 graba la factura
5. Si fiscal está activo → emite e-CF a DGII automáticamente
6. Imprime ticket POS térmico (o PDF)

## Decisiones de diseño históricas

### Precio incluye ITBIS

Decisión: el precio que ves en el sistema **YA incluye el 18% ITBIS**. No se suma al final.

Por qué: en RD el cliente final ve precio "RD$118" y entiende que es el total. Si mostrabas "RD$100 + ITBIS RD$18" el cliente se confunde.

Costo: complica el cálculo de base imponible (base = precio / 1.18). Por eso `useVentas.js` tiene fórmulas que extraen base de precio.

### 3 niveles de precio

`precio1`, `precio2`, `precio3` por presentación:
- Nivel 1: público general
- Nivel 2: mayorista pequeño (sin descuento adicional)
- Nivel 3: mayorista grande (sin descuento adicional)

El cliente tiene `precio_nivel` en su perfil. Cuando se elige el cliente, automáticamente se usa su nivel.

Decisión: niveles 2 y 3 NO permiten descuento manual. Solo nivel 1 lo permite. Esto es para que los vendedores no acumulen descuentos sobre niveles ya descontados.

### CLIENTE GENERICO

Decisión: las ventas sin cliente identificado van con un "CLIENTE GENERICO" virtual. Sin RNC. Sin cuentas por cobrar.

Por qué: en repuestos de barrio el 60-70% de las ventas son cash al público sin facturar. No tiene sentido obligar al cajero a crear un cliente cada vez.

Costo: el reporte de "cartera de clientes" excluye CLIENTE GENERICO. Eso es intencional.

### Vendedor obligatorio

Toda factura tiene un `vendedor_id`. Aunque no haya comisión, queda para auditoría de quién cobró.

## god hook: `useVentas.js`

1156 líneas. Mezcla:
- State UI (items, montos, formas de pago)
- Lógica de cálculo (ITBIS, descuentos, base imponible)
- Llamadas a Supabase (factura, recibos, ajustes inventario)
- Coordinación con DGII (emitir-fiscal edge function)
- Coordinación con impresión (POS / QZ / WebUSB)

Por qué no se ha refactorizado: cualquier cambio puede romper el flujo más crítico del sistema (la facturación). Refactor requiere tests de integración que aún no existen.

Plan: ver [[../roadmap/migracion-features.md]] (Fase 4 de la auditoría 2026-06-15).

## Lo que no obvio del código

- `existencia_morla` es un campo histórico del cliente cero. Mantiene la existencia real del almacén Morla. Cuando se agregaron multi-almacén, se mantuvo el nombre para compatibilidad
- El descuento se aplica ANTES del ITBIS — el campo `descuento` es en monto, no en %
- Las facturas con tipo de pago `credito` generan automáticamente entrada en cartera y cliente acumula deuda

## Edge cases conocidos

- **Devolución parcial**: el sistema soporta devolver 2 de 5 unidades vendidas. Pero la NC DGII (tipo 34) solo aplica si fiscalActivo
- **Precio modificado por vendedor**: si baja el precio de RD$100 a RD$95, el sistema valida que esté dentro del descuento máximo permitido. Si excede, pide PIN supervisor (PendiInte de Compra Inteligente — pero también se aplica a ventas)
- **Cliente sin RNC pero quiere factura B01**: no se puede. B01 requiere RNC. Se le emite B02 (Consumidor Final)

## Lecciones aprendidas

- **No mezclar precio "incluye" y "no incluye"** en la misma vista. El reporte DGII 606 fue un dolor porque internamente algunos cálculos usaban una convención y otros otra. Fix Fase 0.4 normalizó esto en el XML
- **Truncar vs redondear** tiene diferencias acumulables. `ComprasPage` usaba `Math.trunc()` mientras useVentas usaba `.toFixed(2)`. Pendiente unificar (Fase 3)
