# Arquitectura

## Stack

| Capa | Tecnología |
|---|---|
| Frontend web | React 18 + Vite 4, TailwindCSS, shadcn/ui (Radix), framer-motion |
| Estado global | React Context (no Redux/Zustand para datos; Zustand presente pero uso menor) |
| Mobile | React Native + Expo (carpeta `mobile/`) |
| Backend | Supabase (PostgreSQL + RLS + Edge Functions Deno) |
| Hosting web | Cloudflare Pages (deploy automático en push a `feat/mercancias-filtros`) |
| Impresión | Print Agent local (carpeta `print-agent/`) + QZ Tray + WebUSB |
| Build output | `dist/` se commitea force-add porque el hosting es estático |

## Modelo de despliegue

```
GitHub (feat/mercancias-filtros)
       │ push
       ▼
Cloudflare Pages ──► CDN ──► usuarios
       │
       └─ build = el contenido de dist/ commiteado (no rebuild remoto)
```

Importante: `dist/` está en `.gitignore` pero se fuerza con `git add -f dist/` antes de cada push. **No hay build en CI** — el agente local (Claude) corre `npm run build` y commitea el resultado.

## Routing — Panel-based, NO React Router

No hay `<Route>`. Toda la navegación se maneja con `PanelContext` ([src/contexts/PanelContext.jsx](../src/contexts/PanelContext.jsx)).

- Cada panel tiene una `id` (string, ej. `'ventas'`, `'orden-compra'`, `'mercancias'`)
- `componentMapping[id]` mapea id → `{ component, icon, name }`
- El `Sidebar` invoca `openPanel('xxx')`; `MainLayout` renderiza el panel activo
- Cada panel se envuelve en `<Protected module="xxx">` → `RouteGuard` → consulta `user_module_permissions`

**Para agregar un panel nuevo:**

1. Crear el componente en `src/pages/`
2. Importarlo en `PanelContext.jsx`
3. Agregar entrada a `componentMapping`
4. Agregar `module_key` correspondiente en la tabla `user_module_permissions` para los tenants/usuarios que lo necesiten
5. (Opcional) agregar item al `Sidebar` con el feature flag adecuado de `config_empresa`

## Contextos principales

| Context | Responsabilidad |
|---|---|
| [SupabaseAuthContext](../src/contexts/SupabaseAuthContext.jsx) | Auth, profile, permissions, `tenant_id`, empresa, `fiscalActivo` |
| [PanelContext](../src/contexts/PanelContext.jsx) | Paneles abiertos + activo, `openPanel/closePanel` |
| [SuscripcionContext](../src/contexts/SuscripcionContext.jsx) | Plan activo y bloqueo por límites |
| [FacturacionContext](../src/contexts/FacturacionContext.jsx) | Comunicación cross-panel ventas ↔ pedidos ↔ órdenes |
| [ComprasContext](../src/contexts/ComprasContext.jsx) | State temporal del flujo de compras |
| [WhatsAppNotificationContext](../src/contexts/WhatsAppNotificationContext.jsx) | Badge global de mensajes |
| [ThemeContext](../src/contexts/ThemeContext.jsx) | Dark/light mode |
| [LayoutContext](../src/contexts/LayoutContext.jsx) | Sidebar collapsed, layout shell |

## Capas / separación

```
src/
├── pages/              ─ contenedores por panel (renderizan + orquestan)
├── components/         ─ presentacionales reutilizables por módulo
│   ├── ventas/
│   ├── compras/
│   ├── products/
│   ├── orden-compra/
│   ├── dgii/
│   ├── common/         ─ PDFs, modales genéricos
│   └── ui/             ─ shadcn primitives (Button, Dialog, etc.)
├── contexts/           ─ React Contexts
├── hooks/              ─ lógica de negocio reutilizable (useVentas, useCompras...)
├── services/           ─ side-effects con BD/APIs externas
├── lib/                ─ utilidades puras + supabase client
└── pages/Configuracion ─ pantallas de configuración (anidadas)
```

Convención: las **services** no llevan UI; las **pages** no llaman a Supabase directo si hay un hook o service que ya lo hace.

## Comunicación cross-panel

Como cada panel es independiente y mantiene su propio state, para sincronizar (ej. cuando ventas cambia stock y mercancías está abierto), se usan **`window.CustomEvent`**:

```js
// emitter
window.dispatchEvent(new CustomEvent('inventario-actualizado', { detail: { ... } }));

// listener
window.addEventListener('inventario-actualizado', handler);
```

Esto está documentado en [memory/feedback_cross_panel_events.md](../memory/feedback_cross_panel_events.md). No usar Context para esto — los paneles son aislados a propósito.

## Alias de import

`@/` → `src/`. Configurado en `vite.config.js`. Usar siempre `@/components/...`, nunca paths relativos largos.

## Build / dev

```bash
npm run dev      # Vite en :5173 (mata el puerto si está ocupado)
npm run build    # Genera dist/
npm test         # Vitest
```

## Mobile

`mobile/` es una app React Native + Expo separada con su propio `package.json`. Comparte la misma BD Supabase pero usa **policies RLS** específicas porque las RPCs y queries móviles tienen flujos distintos (ej. reimpresión de recibos en `mobile/app/(tabs)/recibo.tsx`).

Publicación: `eas build --auto-submit` (Play Store interna) o `eas update` (OTA JS). Detalles en [memory/project_eas_publicacion_automatica.md](../memory/project_eas_publicacion_automatica.md).

## Print Agent

`print-agent/` es un servicio Node.js local que corre en la PC del cliente para hablar con impresoras térmicas (USB/serial). Es independiente del despliegue web — se instala con el `.bat` en `print-agent/installer/`.
