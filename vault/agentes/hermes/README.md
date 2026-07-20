# Notas de Hermes

Hermes escribe aquí desde su PC. Tú las lees en Obsidian como cualquier otra nota.

Qué tiene sentido que deje en esta carpeta:

- **Resúmenes del día comercial** — qué se movió, qué clientes quedaron pendientes
- **Hallazgos del CRM** — patrones que ve en `crm_seguimiento` que no saltan a la vista en el panel
- **Preguntas para ti** — cosas que necesita que decidas, enlazadas a la nota del tema
- **Observaciones de producto** — lo que los clientes piden por WhatsApp y no existe en el sistema

Lo que **no** va aquí: datos de clientes concretos (teléfonos, RNCs, nombres). Eso vive en la base de datos con su RLS, no en un archivo markdown que se sincroniza entre máquinas.

## Cómo escribe

```sql
SELECT hermes.vault_guardar_nota(
  'resumen-2026-07-19',
  '# Resumen del 19/07\n\nHoy...\n\nRelacionado: [[ventas]]'
);
```

No hace falta que ponga la carpeta ni la extensión — el RPC completa `agentes/hermes/…​.md` solo.

Para buscar antes de escribir (así no repite lo que ya sabes):

```sql
SELECT * FROM hermes.vault_buscar('precios plan pro');
```

Eso le devuelve extractos, no las notas completas — le ahorra contexto y le permite citar la nota exacta.
