# MotoFlow Vault — Estrategia, decisiones y conocimiento del producto

Este directorio es un **vault de Obsidian** — notas en markdown enlazadas con `[[wikilinks]]`. Vive aquí lo que NO debe vivir en código pero sí debe persistir entre sesiones, reuniones y agentes.

## ⚠️ Reglas básicas

- **NO secretos** — `.env`, API keys, tokens NUNCA aquí
- **NO datos de clientes** — emails, RNCs, RUTs, números de teléfono concretos NUNCA aquí
- Tono y formato libre — Obsidian es tu segundo cerebro, no documentación pública
- El **código sigue siendo la fuente de verdad** — si una nota aquí dice una cosa y `src/` dice otra, gana `src/`

## Cómo abrir

1. Instalar [Obsidian](https://obsidian.md/) (gratis)
2. **Open folder as vault** → seleccionar esta carpeta `vault/`
3. Listo. Las notas se sincronizan vía git como el resto del repo

## Estructura

```
vault/
├── README.md               ← este archivo
├── vision/                 ← Por qué existe MotoFlow, hacia dónde va
├── decisiones/             ← Decisiones de producto/negocio (no técnicas — esas van a docs/DECISIONS/)
├── modulos/                ← Notas conceptuales de cada módulo
├── reuniones/              ← Resúmenes de calls importantes
├── prompts/                ← Prompts que has refinado para Claude/Codex/agentes
├── roadmap/                ← Iniciativas grandes en curso
├── investigacion/          ← Hallazgos de mercado, competencia, ideas sueltas
└── pendientes/             ← Tareas dispersas (mejor en Linear/Github Issues, pero útil para drafts)
```

## Diferencia con `docs/` del código

| Vive en `docs/` (técnico) | Vive en `vault/` (negocio/personal) |
|---|---|
| ARCHITECTURE, DATABASE, MODULES técnicos | Visión, estrategia, mercado |
| ADR técnicas (decisiones de código) | Decisiones de producto (¿hacemos Plan Pro? ¿precio? ¿target?) |
| BUSINESS_RULES (cálculos, fórmulas) | Filosofía de cómo deberían SER los flujos |
| INTEGRATIONS (DGII, OpenAI, Meta) | Lo que aprendiste hablando con clientes reales |

Si no estás seguro dónde va algo, pregúntate: "¿esto le sirve a Claude/agente al modificar código?" → docs/. "¿esto le sirve a mí o a un futuro yo para pensar?" → vault/.

## Convenciones de Obsidian que ayudan

- **`[[wikilinks]]`** entre notas — Obsidian construye un grafo
- **Tags `#estrategia`, `#cliente-morla`, `#dgii`** para filtrar
- **Daily notes** opcionales — fechan automáticamente lo que escribes
- **Templates** opcionales (Settings → Core plugins → Templates)
- **Graph view** (cmd+G) — visualiza relaciones entre notas

## Cómo se sincroniza

- Las notas son `.md` → git las versiona como cualquier código
- `git pull` trae lo nuevo
- `git push` lo manda
- Sin servidor central, sin sincronización pagada de Obsidian

## ¿Por qué git en lugar de Obsidian Sync ($$)?

- Ya tienes git para el código
- 1 repo = código + docs técnica + vault. Todo junto, todo versionado
- Si cambias de PC, `git pull` y abres vault. Cero fricción
- Múltiples colaboradores: ramas + PRs si quieres revisión

## Plantillas iniciales

Cada subcarpeta lleva un `README.md` corto explicando qué va ahí. Puedes empezar a escribir sin pensar en estructura — luego mueves las notas si se acumulan en una sola carpeta.
