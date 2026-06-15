# Prompts maestros

Prompts que ya refinaste y querés reusar. Cuando llegue un caso similar, copy-paste y ajustás.

## Categorías sugeridas

- `auditoria.md` — el prompt maestro que diste hoy 2026-06-15
- `revision-pr.md` — cuando le pidas a Claude que revise un PR
- `diagnostico-bug.md` — para que Claude diagnostique un bug productivo
- `refactor-feature.md` — para mover un feature a `src/features/`

## Convención

Cada prompt:
- **Título descriptivo**
- **Cuándo usarlo** (en qué situación)
- **Variables a reemplazar** (entre `{{ }}`)
- **Outputs esperados** (qué debería entregar)

## Plantilla

```markdown
# Nombre del prompt

**Cuándo usarlo**: 

**Variables**: 
- {{ARCHIVO}}
- {{MODULO}}

---

(prompt completo aquí)
```
