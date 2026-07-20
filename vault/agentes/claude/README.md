# Notas de Claude

Claude corre en tu misma PC (Claude Code), así que escribe estos archivos directamente. El demonio los sube para que Hermes también los vea.

Qué tiene sentido dejar aquí:

- **Contexto de sesiones largas** — decisiones tomadas durante una implementación que no quedan claras leyendo solo el commit
- **Deuda técnica detectada** — cosas que vi de paso pero no tocamos, para que no se pierdan
- **Auditorías** — resultados de revisiones de arquitectura o seguridad
- **Por qué NO hicimos algo** — las alternativas descartadas y el motivo, que es lo que siempre se olvida

Esto es distinto de mi memoria en `.claude/memory/`: esa es privada de mi sesión y no sale de esta PC. Lo que ponga aquí lo ve Hermes y lo ves tú en Obsidian.

## Relación con `docs/`

| Va en `docs/` | Va aquí |
|---|---|
| Cómo funciona el módulo hoy | Por qué quedó así y qué se descartó |
| Esquema, reglas de negocio, ADR técnicas | Contexto de una sesión, deuda pendiente |
| Lo que un agente necesita para tocar código | Lo que un humano necesita para entender la historia |
