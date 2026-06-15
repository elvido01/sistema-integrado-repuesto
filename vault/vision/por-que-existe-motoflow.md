# Por qué existe MotoFlow

## Problema concreto

Los negocios de repuestos de motos en República Dominicana operaban con:

- **Hojas de Excel y cuadernos** para inventario y ventas
- **Sistemas POS genéricos** que no entienden el negocio (no saben que una batería puede tener equivalente, que un tubo 2.75-17 puede sustituir a un 2.75-18 en algunos casos, que ciertos productos van por marca + modelo de moto)
- **DGII e-CF** mandatorio desde 2024-2025 pero los sistemas que existen son caros (Alegra, Microsoft Dynamics tipo enterprise) o muy básicos
- **Compras a ciegas**: no saben cuándo reponer ni cuánto ni a quién hasta que el vendedor pide algo que no hay
- **WhatsApp como CRM informal** sin trazabilidad

## A quién le pasa

- Repuestos Morla (cliente cero, validó todo)
- Caminero Motors (cliente con módulo GPS para financiamiento de motos)
- Negocios de barrio con 1-5 empleados que venden repuestos de motos AX-100, CG-150, Honda, Yamaha
- Mayoristas pequeños que también venden al detalle

Perfil típico: dueño 40-60 años, no técnico, factura entre RD$200K-2M al mes, tiene 1 contador que le hace los reportes a fin de mes.

## Cómo lo resuelven hoy (sin MotoFlow)

- Excel maestro de productos con códigos manuales
- Cuaderno físico de cuentas por cobrar
- WhatsApp Business para pedidos de clientes y suplidores
- Alegra o Macros DGII como sistema externo de facturación (paralelo al inventario real)
- Contador procesa todo a fin de mes

## Cómo lo cambia MotoFlow

1. **Un solo sistema** que sabe que esto es repuestos de motos (no genérico)
2. **DGII e-CF integrado nativo** — emite, recibe callbacks, guarda XMLs firmados, sin depender de proveedor externo. Camino B: cada tenant es su propio emisor (no usamos Morla como hub)
3. **Compra Inteligente** — el sistema dice "no compres más de X de este suplidor porque tu caja solo aguanta Y"
4. **Productos Equivalentes** — el cajero ve al instante que la batería del cliente está agotada PERO hay otra que sirve
5. **Reposición automática** — cuando vendes la última unidad, el suplidor correcto ya tiene una OC pendiente
6. **App móvil** para cobranza y vendedores en calle
7. **WhatsApp CRM** unificado (bloqueado por pago Meta)
8. **AI CEO** que mira tus datos y propone decisiones (Marketing IA, alertas, insights)

## Quién paga por eso

- Plan **Básico**: facturación + inventario, RD$X/mes
- Plan **Pro**: + DGII e-CF, + reportes contables
- Plan **Enterprise**: + Compra Inteligente, + AI CEO, + WhatsApp CRM, + GPS

El precio exacto, plan-feature mapping y umbral de Enterprise están en [[decisiones/]] (cuando los escribas allá).

## Lo que NO quiere ser

Ver [[que-no-es]].
