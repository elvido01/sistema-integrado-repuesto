# Decisión — Sistema de paneles propio en lugar de React Router

**Fecha**: original del proyecto, ~2023
**Status**: Activa
**Re-evaluado**: 2026-06-15 (decisión sigue siendo correcta)

## Contexto

Apps SaaS modernas usan React Router para navegación. Cada "página" es una ruta `/orden-compra`, `/ventas`, etc. URL refleja el estado.

MotoFlow hizo lo contrario: **no hay rutas**. Existe un `PanelContext` que mantiene una lista de paneles abiertos y cuál está activo. Cambiar de panel es estado local, no URL.

## Opciones consideradas

### A. React Router clásico

```jsx
<Route path="/ventas" element={<VentasPage />} />
<Route path="/orden-compra" element={<OrdenCompraPage />} />
```

URL refleja la página actual.

### B. Sistema de paneles (lo que se eligió)

```jsx
const componentMapping = {
  'ventas': { component: VentasPage, ... },
  'orden-compra': { component: OrdenCompraPage, ... },
};

// Click en sidebar:
openPanel('orden-compra');
```

URL siempre es `/`. Estado de paneles vive en `PanelContext`.

## Decisión: B

## Por qué

El usuario quiere que el sistema se comporte como **un ERP tradicional** (tipo Mind, Profit, Visual Office) donde:

- Abre Ventas en una pestaña
- Mientras llena la factura, abre Mercancías en otra pestaña para buscar un producto
- Vuelve a Ventas y la factura sigue como la dejó
- Múltiples paneles abiertos simultáneamente, cada uno con su estado

Con React Router clásico cada navegación pierde el estado. Volver a Ventas la página re-monta y pierde la factura a medio llenar. Para preservar estado necesitas Redux/Zustand global o `keepalive` que no es nativo de React.

Con paneles: el componente sigue montado. Su estado React local persiste. El usuario cambia entre paneles sin perder nada.

## Costos

- **No hay deep linking**: no puedes compartir un link a "la factura del cliente X". El usuario tiene que navegar siempre desde sidebar.
- **No hay back/forward del navegador**: el botón "atrás" sale del sistema o no hace nada útil.
- **SEO no aplica** (es app interna, no importa)
- **Onboarding al desarrollador**: cuesta entender que no hay `<Route>`. Hay que leer `PanelContext.jsx`.

## Re-evaluación 2026-06-15

Sigue siendo correcta. El usuario USA múltiples paneles simultáneamente (validado con Morla). React Router complicaría el caso típico.

**Cuándo reconsiderar**:
- Si surge demanda de "compartir link a factura X por WhatsApp"
- Si MotoFlow se vuelve también una vista pública con clientes finales (tipo tienda online — ya existe `TiendaPage` pero usa una variante diferente del sistema)
- Si el equipo crece y los devs nuevos se confunden constantemente

## Consecuencia que no era obvia

El `componentMapping` en `PanelContext.jsx` importa TODAS las páginas en un solo archivo. Eso causa:
- Bundle más grande (no se puede tree-shake fácil)
- 8 import cycles detectados por Graphify

Fase 2.1 (2026-06-15) resolvió 7 de 8 cycles extrayendo `panelCore.js` con solo el Context+hook. El último cycle es cosmético por re-export.

Si en el futuro queremos code-splitting por panel, se puede usar `React.lazy()` en el `componentMapping`. Por ahora no se necesita.

## Referencias

- [src/contexts/PanelContext.jsx](../../src/contexts/PanelContext.jsx)
- [src/contexts/panelCore.js](../../src/contexts/panelCore.js) (creado en Fase 2.1)
- [[../modulos/]] (cada módulo es un panel)
