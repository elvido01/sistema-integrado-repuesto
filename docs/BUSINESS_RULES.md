# Reglas de Negocio

Reglas no obvias que NO se derivan trivialmente de leer el código. Si cambias algo aquí, actualiza este doc.

## ITBIS

- **Formato en BD**: decimal (0.18) NO porcentaje (18). Validar al recibir input
- **Configuración por línea**: `itbis_pct` está en `productos`, se copia a `facturas_detalle.itbis_pct` al vender
- **Orden de compra**: respeta `aplicar_itbis` de la cabecera. `itbis_incluido=true` significa que el precio ya incluye ITBIS
- **Bug histórico**: `total_itbis_general` ya no se usa — solo `TotalITBIS1`, `TotalITBIS2`, `TotalITBIS3` en e-CF. Ver [memory/feedback_dgii_xml_totales.md](../memory/feedback_dgii_xml_totales.md)

## Reposición automática (ventas → orden de compra)

Implementado en `enviarReposicionAutomatica` en [src/hooks/useVentas.js](../src/hooks/useVentas.js) (~líneas 542-614).

**Cuándo dispara:**
- Producto vendido tiene `suplidor_id` asignado y está `activo`
- Si tiene `min_stock > 0`: dispara cuando `existencia ≤ min_stock` (NO espera al 0)
- Si NO tiene `min_stock`: dispara solo cuando `existencia ≤ 0`

**Cuánto compra:**
```
objetivo = max(max_stock, max(min_stock, 1))
cantidad_sugerida = ceil(objetivo - existencia_actual)  # mínimo 1
```

**Dónde lo agrega:**
- Busca orden `Pendiente` del `productos.suplidor_id` (el campo del producto, NO del cliente)
- Si existe: suma cantidad si el producto ya está, o agrega línea nueva. **Refresca `fecha_orden` a hoy**
- Si NO existe: crea orden nueva con vencimiento +15 días

## Envío manual a Orden de Compra

Desde el botón "Enviar a OC" en ProductSearchModal (ventas) o ProductTable (mercancías) → llama `sendProductToOrdenCompra(product)` **sin `quantity`** → siempre suma `+1` a la orden Pendiente del suplidor.

**No respeta `max_stock`** ni `min_stock` en este flujo — es intencional, el usuario está agregando manualmente "uno más" para una venta esperada.

## Reorganizar por suplidor

Botón en Orden de Compra → recorre todas las órdenes `Pendiente` y para cada línea cuyo `productos.suplidor_id ≠ ordenes_compra.suplidor_id`:

- Si el suplidor correcto tiene orden Pendiente → mueve la línea ahí (suma cantidad si ya existe). Refresca fecha.
- Si NO → crea nueva orden Pendiente con fecha hoy + 15 días

Trigger automático: cuando se hace `UPDATE` de `productos.suplidor_id`, mueve solo las líneas pendientes de ese producto al nuevo suplidor (sin tocar las del suplidor viejo de otros productos).

## Compra Inteligente v2

Implementado en `sql/compra_inteligente_v2_*.sql`.

**Conceptos:**
- `presupuesto_mensual` — monto máximo de compra del mes (se incrementa solo la primera vez y luego se ajusta automático al desempeño)
- `caja_minima_pct` — colchón obligatorio en caja (NO se puede tocar)
- `caja_disponible` — calculada con flujo operacional 30 días, NO con `cierres_caja` (decisión del usuario, ver [memory/project_compras_inteligentes.md](../memory/project_compras_inteligentes.md))
- `disponible_para_compras` = `min(presupuesto_remaining, caja_disponible - caja_minima)`

**Reparto entre suplidores:**
Se distribuye por movimiento histórico 90 días. Cada suplidor tiene su % de compras del total → se asigna esa misma % del presupuesto.

**Aprobación:**
Si una orden excede el disponible del suplidor → entra a cola `aprobaciones-compras` y requiere PIN supervisor (bcrypt en `pin_supervisor_hash`).

## Productos Equivalentes

**Objetivo:** agrupar SKUs que son intercambiables (ej. BATERIA HOSUYA YTX5A-BS = Y-7443) para:

1. Sugerir alternativa cuando se vende un agotado
2. Evitar duplicar compras en Orden Automática
3. Asignar un "preferido" (⭐) que cubre el grueso de la demanda

**Scoring del preferido (weighted multi-criterio):**
```
score = 0.45 × margen_pct
      + 0.30 × rotacion_score (ventas_30d / (stock+1) × 10)
      + 0.15 × confiabilidad (% días con stock 90d)
      + 0.10 × vol_relativo (% del total del grupo 30d)

penalty = 50 si confiabilidad < 10%
score_final = max(0, score - penalty)
```

**Estabilidad:** el preferido solo cambia si el nuevo ganador supera al actual por ≥ 5 puntos. Evita oscilaciones.

**Manual override:** `prioridad_manual = true` excluye al grupo del recalculo automático.

**Cron semanal:** edge function `cron-recalcular-preferidos` (lunes 06:00 UTC) llama `cron_recalcular_preferidos_all_tenants()`.

## Orden Automática con conciencia de grupos

`get_productos_para_orden_automatica_v2` envuelve el v1 y para cada línea cuyo producto está en grupo:

- Si `grupo_stock_combinado ≥ grupo_demanda_30d × 1.5` → `cantidad_ajustada = 0` ("Grupo ya tiene N días de stock")
- Si es **preferido** (⭐) → aumenta para cubrir déficit total del grupo, no solo el suyo
- Si es **sustituto** → reduce a 30% de la cantidad original ("el ⭐ cubre el grueso")

UI muestra badge 🔗 con popover explicativo en las líneas ajustadas.

## Precios y descuentos

- **3 niveles**: `precio1`, `precio2`, `precio3` por presentación
- **Nivel del cliente**: en `clientes.precio_nivel` (1, 2 o 3)
- **Auto-fallback**: si nivel 3 está activo (`auto_precio3=true`) y `precio3 > 0`, usa precio3, sino cae a 2, sino a 1
- **Descuentos**: NIVEL 2 y 3 NO permiten descuento adicional. Solo nivel 1 puede tener `max_descuento > 0`
- **Configuración por tenant**: `config_empresa.precio2_descuento_pct` y `precio3_descuento_pct` controlan los % por defecto

## Numeración

- **Por tenant**: cada documento tiene secuencia propia. NUNCA generar número en JS — usar `get_next_*_numero()` RPC
- **NCF**: configurado por tipo (B01, B02, B03, B04, E31, E32, E33, E34, E41, E43, E44, E45, E46, E47) en `dgii_secuencias_ncf`. Cuando se agota o vence, alerta al admin
- **Órdenes**: si una orden Pendiente no tenía número y se reutiliza, se le asigna número en ese momento

## Cierre de Caja

- Campo correcto: `efectivo_en_caja` (NO `saldo_final`)
- **Compra Inteligente NO usa cierres** — usa flujo operacional 30d
- Saldo inicial configurable en `sql/config_saldo_inicial_caja.sql`

## DGII (e-CF)

**Camino B**: cada tenant es su propio Emisor (no usamos Repuestos Morla como hub). Cada tenant tiene su certificado .p12, sus secuencias, sus credenciales DGII.

**Endpoints case-sensitive**: `TesteCF`, `CerteCF`, `eCF` + paths como `recepcion/api/FacturasElectronicas`. Ver [memory/reference_dgii_endpoints.md](../memory/reference_dgii_endpoints.md).

**Reglas de firma XML**:
- Siempre stripear `<Signature>` pre-existente antes de canonicalizar/firmar
- Digest del root: parse + sort xmlns root + serialize + SHA256 (NO usar C14N W3C)
- 3 reglas byte-perfect: digest sobre root sin xml-decl, ancestor ns en SignedInfo, output sin sort xmlns
- En `<Totales>` solo van `TotalITBIS1/2/3` con sufijo (el sin sufijo causa 400 RecepcionECF)

**Fase pendiente**: 3d firma XAdES-BES + 3f set certificación CerteCF (25 pruebas) + tipo 33 (Nota de Débito).

## Comisiones a vendedores

- Campo: `vendedores.comision_pct` (decimal, 0.05 = 5%)
- Cálculo: en RPC `calcular_comisiones_vendedor(vendedor_id, fecha_desde, fecha_hasta)`
- Solo sobre facturas pagadas (no las anuladas, no las pendientes de cobro)
- Pago: registrado en `pagos_comisiones` con `monto` y `aplicacion_a` (facturas cubiertas)

## Devoluciones / NC

- Estado `Activa` → afecta inventario y contabilidad
- Estado `Anulada` → no afecta nada (se ignora en reportes)
- DGII tipo 33 pendiente de implementación

## RPCs y JSONB

⚠️ **NO** usar `JSON.stringify(array)` al llamar RPCs jsonb. Pasar el array directo. El bug del abono a crédito que no restaba pendiente fue exactamente esto. Ver [memory/feedback_supabase_rpc_jsonb.md](../memory/feedback_supabase_rpc_jsonb.md).

## Memoria operativa relevante

Ver carpeta [memory/](../memory/) — entradas como `project_*` y `feedback_*` documentan reglas, decisiones y aprendizajes que no quedaron en código.
