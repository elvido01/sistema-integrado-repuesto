# Notas de los agentes

Aquí escriben **Hermes** y **Claude**. Tú no escribas en esta carpeta — es de ellos.

## Por qué está separado

Somos tres escribiendo en el mismo vault desde máquinas distintas. Si todos pudiéramos editar las mismas notas, tarde o temprano dos ediciones simultáneas se pisan y se pierde texto sin que nadie se entere.

La regla es simple: **cada quien escribe solo en lo suyo**.

| Carpeta | Dueño | Los demás |
|---|---|---|
| `vision/`, `decisiones/`, `modulos/`, `roadmap/`... | Elvido | solo leen |
| `agentes/hermes/` | Hermes | solo leen |
| `agentes/claude/` | Claude | solo leen |

Esto no depende de la buena voluntad: la base de datos lo rechaza. Si Hermes intenta escribir en `vision/`, el guardia de `sql/vault_agentes.sql` lo bloquea con un error explícito.

## ¿Y si un agente quiere corregir algo tuyo?

No edita tu nota. Crea la suya enlazando la tuya:

```markdown
# Revisión de precios 2026

Revisando [[target-ideal]] veo que el precio del Plan Pro
quedó desactualizado desde que subimos el costo de DGII.
```

En Obsidian eso te aparece como **backlink** dentro de `target-ideal` (panel derecho, "Linked mentions") y como una arista en el grafo. Ves el aporte sin que nadie te haya tocado el texto, y decides tú si lo incorporas.

## Cómo se sincroniza

Un demonio en tu PC (`npm run vault:sync`) sube lo que escribes y baja lo que ellos escriben, en tiempo real. Hermes corre en otra máquina y llega por Supabase.

Si por lo que sea la misma nota cambia en los dos lados, **no se sobrescribe nada**: aparece un archivo `nombre.conflicto-2026-07-19.md` al lado con la otra versión, para que compares y decidas.

## Regla que no cambia

**Nada de credenciales aquí.** El vault ahora viaja a otra PC, así que la subida rechaza cualquier nota donde detecte algo que parezca una clave. No es un consejo, es un bloqueo.
