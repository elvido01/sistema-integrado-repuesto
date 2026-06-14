# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **For deep context** (architecture, DB schema, modules, business rules, RLS, integrations) read [`docs/`](docs/). Especially [`docs/README.md`](docs/README.md) as index. ADRs in [`docs/DECISIONS/`](docs/DECISIONS/).

## Commands

```bash
npm run dev        # Start dev server on port 5173 (kills port first via PowerShell script)
npm run build      # Build to dist/ for production deployment
npm run preview    # Preview production build
npm test           # Run tests with vitest
```

> The `dist/` folder is in `.gitignore` but is force-committed (`git add -f dist/`) because the hosting is static file deployment — the built output is what gets uploaded to the web.

## Environment Setup

Create `.env.local` in the project root:
```
VITE_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR_ANON_KEY"
```

The `.env.production` file (untracked) holds the production keys. Never commit it.

## Git Workflow — Critical

**The active branch is `feat/mercancias-filtros`**, not `main`. The `main` branch is several commits behind.

```bash
# Before closing the project on any PC
git add src/
git commit -m "descripción"
git push origin feat/mercancias-filtros

# Before starting work on any PC
git pull origin feat/mercancias-filtros
```

**Never leave files untracked.** New pages, components, and SQL migrations must be committed the same day or they will be lost when switching PCs.

## Architecture

### Multi-tenant SaaS
The system serves multiple clients (tenants) from a single Supabase project. Each tenant is identified by a `tenant_id` stored in `profiles`. White-labeling (logo, colors, login page) is resolved at runtime by domain via `config_empresa` table. Feature flags per tenant (e.g., `feat_carta_ruta`, `feat_solicitudes_compras`) control which modules appear in the sidebar.

### Routing — Panel-based, not React Router
There are **no `<Route>` components**. Navigation is managed by `PanelContext` (`src/contexts/PanelContext.jsx`), which maps string keys (e.g., `'compras'`, `'ventas'`) to page components. The `Sidebar` sets the active panel key; `MainLayout` renders the corresponding component. Adding a new page requires:
1. Creating the page file in `src/pages/`
2. Importing it in `PanelContext.jsx`
3. Adding it to `componentMapping`
4. Adding it to the tenant's sidebar config in the DB

### Auth & Permissions
`SupabaseAuthContext` (`src/contexts/SupabaseAuthContext.jsx`) loads the user's profile, `tenant_id`, permissions, and empresa config on login. The `RouteGuard` component wraps each page in `PanelContext` — it checks `user_module_permissions` table. `SuscripcionContext` handles plan-based access blocking.

### Compras Module
The purchase flow has three entry points, all landing in `ComprasPage.jsx`:
- **Manual entry**: typing a code in the yellow staging row triggers `handleSearchByCode` (looks up product by code, fills cost/description/itbis)
- **Product search modal**: `handleProductSelect` fills staging row from the modal result
- **Invoice OCR**: `handleDataExtracted` calls the `extract_purchase_from_image` Edge Function, then matches returned codes against `productos` table — if matched, uses the stored `costo`; if unmatched, the line shows red and a `+` button to open `ProductFormModal` and create/link the product. Saving from that modal (F10) syncs `costo_unitario`, `descripcion`, `codigo` back to the compra line via `handleSaveProductFromOCR`.

### Supabase Edge Functions
Located in `supabase/functions/`:
- `extract_purchase_from_image` — OCR via Google Vision + GPT to extract invoice line items from images
- `admin-management` — super-admin operations
- `emitir-fiscal` — fiscal document emission

### Key Conventions
- `@/` alias maps to `src/`
- All DB access goes through `src/lib/customSupabaseClient.js` — the single `supabase` export
- Paginated product search uses the `get_productos_paginados` RPC function — it returns `costo`, `precio`, `itbis_pct`, `existencia`, etc.
- `itbis_pct` is stored as a decimal (0.18), not a percentage (18)
