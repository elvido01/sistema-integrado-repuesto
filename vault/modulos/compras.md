# Módulo Compras

## Cómo nació

Originalmente era simple: "Orden de Compra" con cabecera + detalle + un suplidor.

Evolucionó cuando el dueño de Morla preguntó: **"¿cómo sé cuánto puedo comprar este mes sin quedarme sin caja?"**

De ahí surgió **Compra Inteligente v2** que:
- Mira ventas últimas 30 días → estima ingresos reales
- Mira cuentas por pagar → sabe cuánto debes
- Calcula `caja_disponible` operacional (NO usa cierres de caja porque pueden estar viejos)
- Sugiere presupuesto de compra del mes
- Distribuye ese presupuesto entre suplidores según historial de compras (90 días)
- Si una OC excede el disponible del suplidor → entra a cola de aprobaciones (PIN supervisor bcrypt)

## Tres formas de llegar a una OC

1. **Manual**: usuario crea OC, agrega líneas
2. **Automática (botón)**: el sistema sugiere comprar lo que está bajo `min_stock` del suplidor
3. **Reposición automática (desde ventas)**: cada venta dispara revisión. Si producto cae a min_stock, se agrega a la OC pendiente del suplidor

## Decisiones de diseño

### `productos.suplidor_id` único (no many-to-many)

Decisión: cada producto tiene UN suplidor preferente.

Por qué: simplifica reposición automática. El 80-90% de los productos tienen un suplidor claro.

Costo: si un producto se compra a 2 suplidores distintos (mismo SKU, dos fuentes), el sistema no lo soporta. Hay que duplicar producto.

Cuándo revisar: si surge demanda real de multi-suplidor, hacer migración a tabla `producto_suplidores`.

### Reorganizar por suplidor (Fase 0.5)

Bug descubierto: cuando se cambiaba `productos.suplidor_id` después de que el producto ya estuviera en una OC pendiente, la línea quedaba "huérfana" (suplidor de la OC ≠ suplidor real del producto).

Solución:
- Trigger `trg_productos_suplidor_change` mueve líneas automáticamente cuando cambias suplidor del producto
- Botón "Reorganizar por suplidor" para limpiar inconsistencias acumuladas

Ver [[../decisiones/]] (cuando documentes esto formalmente).

### Productos Equivalentes en Orden Automática

Cuando el sistema sugiere comprar batería Y-7443 (3 und.) y batería YTX5A-BS (5 und.), pero ambas son equivalentes y juntas tienen 8 und. en stock:

Decisión: si stock combinado del grupo ≥ 1.5x demanda del grupo, NO compra. Si el preferido (⭐) tiene déficit, lo aumenta. Si es sustituto, lo reduce a 30%.

Por qué: evita comprar 2 versiones del mismo producto. Mejora rotación.

Costo: complica el algoritmo. Hay que mantener `producto_grupos` y `producto_grupo_miembros`.

## Compra Inteligente v2 — qué quería el cliente

Frase textual de Elvido: **"el sistema debe distribuir el presupuesto de compra a cada suplidor dependiendo del movimiento de cada uno"**

Algoritmo:
1. Calcula movimiento histórico 90d por suplidor (total comprado)
2. Cada suplidor tiene su % del total
3. Esa % se aplica al presupuesto mensual
4. Cuando creas OC nueva, el sistema mira si excede ese % del suplidor
5. Si excede → requiere aprobación

### Caja disponible operacional

Frase clave: **"el sistema no puede tomar en cuenta el cierre de caja porque puede estar viejo, tiene que tomar las ventas"**

Por eso `caja_disponible` se calcula con flujo operacional últimos 30 días, NO con `cierres_caja.efectivo_en_caja`.

## god page: `OrdenCompraPage.jsx`

1500+ líneas. Mezcla:
- CRUD de OC
- Compra Inteligente (banner, presupuesto disponible, alertas)
- Reorganizar por suplidor
- Equivalentes (indicador 🔗 + popover)
- Productos equivalentes en duplicado
- Compra Automática
- Aprobaciones

Igual que `useVentas.js`, refactor pendiente (ver [[../roadmap/migracion-features.md]]).

## Lecciones aprendidas

- **El reorganizar por suplidor descubrió un bug histórico** — había productos que terminaban en OC del suplidor equivocado. La solución (Fase 0.5) implicó limpiar 6 duplicados en `documentos_fiscales` antes de poder aplicar el UNIQUE
- **Compra Inteligente fue una iteración larga**: empezó con caja = `cierres_caja`, después se cambió a operacional 30d. Lección: cuando el usuario dice "mira las ventas, no el cierre", escúchalo
- **El asesor IA de compras** consume tokens cada vez que se abre el panel — pendiente cachear las recomendaciones por 30 min para reducir costo
