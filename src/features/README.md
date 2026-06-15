# `src/features/`

Reorganización por **feature** (dominio funcional) — Fase 4 de la auditoría 2026-06-15.

## Estado actual

> ⚠️ **Esta carpeta es nueva (Fase 4 inicial)**. Aún hay 304 archivos en `src/pages/`, `src/components/`, `src/hooks/` que NO se han movido. La migración es gradual feature-por-feature para no romper imports.

## Convención

Una **feature** = un dominio funcional cohesivo que puede tener UI + estado + servicios + hooks propios. Equivale a las "comunidades" cohesivas que detectó Graphify.

```
features/<dominio>/
├── pages/              ← pantallas top-level del dominio
├── components/         ← componentes específicos de la feature
├── hooks/              ← lógica reutilizable del dominio
├── services/           ← side-effects (delgados — repository es preferido)
├── utils/              ← helpers puros del dominio
└── README.md           ← qué resuelve, archivos clave, dependencias
```

## Plan de migración por feature

Orden recomendado (de fácil a difícil):

| # | Feature | Dificultad | Justificación |
|---|---|---|---|
| 1 | `gps/` | 🟢 Fácil | Ya está aislado en `src/pages/gps/`. Cohesión Graphify 0.27. |
| 2 | `subscription/` | 🟢 Fácil | 9 nodos, cohesión 0.19. PlanGate, SuscripcionContext. |
| 3 | `print/` | 🟡 Media | Toca Print Agent + QZ + WebUSB + ESC/POS. ~20 archivos. |
| 4 | `equivalentes/` | 🟡 Media | Recién creado en Fase 1-4 (memoria). Componente nuevo aislado. |
| 5 | `dgii/` | 🟡 Media | Bien modular (3 comunidades Graphify). Toca `IntegracionFiscalSettings`, Runners. |
| 6 | `whatsapp-crm/` | 🟡 Media | Comunidad de 28 nodos cohesiva. |
| 7 | `marketing-ia/` | 🟡 Media | Diseños, copywriting, métricas. |
| 8 | `inventario/` | 🟠 Alta | Mercancías + entradas + salidas + grupos. ~30 archivos. |
| 9 | `compras/` | 🔴 Crítica | Orden de Compra (1500 LOC), Compras, Aprobaciones, Compra Inteligente. Tocar solo con tests. |
| 10 | `ventas/` | 🔴 Crítica | `useVentas.js` (1156 LOC). Última en migrarse. |

## Reglas no negociables al mover una feature

1. **Mover SIN cambiar comportamiento**. No mezclar reorganización con refactor de lógica.
2. **Usar tooling para actualizar imports**. Buscar y reemplazar con cuidado. Probar con build después.
3. **Mantener `@/` alias funcionando** para los imports tipo `@/components/ui/button`. Solo migrar lo específico de la feature.
4. **Componentes UI primitivos (`shadcn`) NO se mueven** — quedan en `src/components/ui/`.
5. **Hooks/libs cross-feature NO se mueven** — quedan en `src/hooks/` y `src/lib/`.
6. **Repositorios NO se mueven** — quedan en `src/repositories/` (estructurados por dominio ya).
7. **Cada feature lleva README explicando responsabilidades y dependencias críticas**.

## Anti-patrones a evitar

- ❌ Crear `features/shared/` con todo lo dudoso. Si no es claramente de una feature, queda fuera.
- ❌ Mover una feature parcialmente — todos los archivos pertinentes al mismo tiempo.
- ❌ Renombrar archivos al mover. Mismo nombre, nueva ubicación. Mantener historial git.

## Cómo hacer una migración

```bash
# 1. Identificar archivos de la feature
grep -rln "GpsDashboardPage\|GpsDeviceCard\|GpsMap\|gpsService" src/ --include="*.{js,jsx,ts,tsx}"

# 2. Crear estructura
mkdir -p src/features/gps/{pages,components,hooks,services}

# 3. Mover archivos (git mv preserva historial)
git mv src/pages/gps/GpsDashboardPage.jsx src/features/gps/pages/
git mv src/components/gps/GpsDeviceCard.jsx src/features/gps/components/
# ... etc

# 4. Actualizar imports masivamente (probar con dry run primero)
grep -rl "@/pages/gps/" src/ | xargs sed -i 's|@/pages/gps/|@/features/gps/pages/|g'
grep -rl "@/components/gps/" src/ | xargs sed -i 's|@/components/gps/|@/features/gps/components/|g'

# 5. Verificar build
npm run build

# 6. Verificar tests
npm test

# 7. Verificar smoke manual de la feature
npm run dev
```

## Tracking del progreso

Estado de migración por feature (actualizar al mover):

- [ ] gps
- [ ] subscription
- [ ] print
- [ ] equivalentes
- [ ] dgii
- [ ] whatsapp-crm
- [ ] marketing-ia
- [ ] inventario
- [ ] compras
- [ ] ventas

## ¿Por qué no se hizo de una vez?

La auditoría 2026-06-15 (sección 10, Fase 4) lo deja explícito:

> "Mover archivos a `src/features/` dominio por dominio. **Empezar por ventas** (mejor cohesión actual) **y dgii** (ya está modular). Restricción: no romper imports — usar tooling (codemod) para actualizar paths."

> "Esfuerzo: 3-4 semanas, gradual."

Para no introducir 304 cambios simultáneos riesgosos, se prefiere:
1. Validar primero la operación con Fase 0-3 ya aplicadas (en curso)
2. Migrar una feature a la vez con tests
3. Probar cada migración en operación real antes de seguir
