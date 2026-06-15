# Target ideal

## Quién encaja perfectamente

**Negocio de repuestos de motos en RD** con:
- 1 sucursal (o 2-3 con almacenes separados)
- Factura mensual RD$200K - 5M
- 1-10 empleados
- Vendedores que también cobran (no separados de cajeros)
- Dueño es el que toma decisiones de compra
- Usan WhatsApp para pedidos y cobranza
- Tienen contador externo
- Quieren cumplir DGII pero no quieren contratar un Microsoft Dynamics

## Casos confirmados que funcionan

- **Repuestos Morla** — cliente cero. Validó:
  - facturación POS térmica
  - DGII e-CF B01/B02
  - Compra Inteligente
  - Productos Equivalentes
  - reposición automática

- **Caminero Motors** — caso adyacente:
  - Vende motos completas (no solo repuestos)
  - Financia a clientes
  - Necesitaba **GPS para recuperar motos** de morosos
  - Por eso existe el módulo GPS (no es target principal, es vertical específica)

## Quién NO encaja

- Negocios que solo venden online (no necesitan POS térmico, no son target)
- Multinacionales con ERP propio (Microsoft Dynamics, SAP)
- Tiendas que NO son de motos — el sistema sabe demasiado de motos (modelos, marcas, equivalentes)
- Negocios fuera de RD (la integración DGII solo aplica a RD)
- Negocios con 50+ empleados (volumen probablemente requiere ERP serio)

## Casos límite a evaluar

- **Talleres mecánicos** — venden repuestos pero también servicios. ¿MotoFlow podría servir? Sí en parte, pero el módulo de "servicios y mano de obra" no existe. Pendiente decidir.
- **Distribuidores mayoristas** — operan con márgenes muy bajos y alto volumen. Compra Inteligente les sirve pero el flujo de facturación es distinto (más enfocado a cuentas por cobrar).

## Pista que un cliente NO es target

- "Tenemos sucursales en Colombia/USA/etc" — fuera de scope
- "Vendemos 50K productos distintos" — el sistema funciona, pero la UX de búsqueda no está optimizada para ese volumen
- "Tengo equipo de IT propio" — probablemente ya tienen sistema y solo quieren outsourcing
- "Necesitamos integración con SAP" — no, otro target

## Cliente fácil de convertir

Negocio que:
- Acaba de empezar a usar DGII e-CF y le duele Alegra
- Tiene cuaderno de cuentas por cobrar y se cansa
- Le piden cosas en WhatsApp y se le pierden los pedidos
- Ya intentó otro sistema y lo dejó porque no entendía motos
- El dueño es relativamente joven (40-50) o el hijo está empujando a digitalizar
