# Instrucciones para Hermes — Vault de Obsidian

> Pegar en Telegram tal cual (cabe en un mensaje). No requiere credenciales nuevas:
> es la **misma conexión psycopg2** con `hermes_readonly` que ya usas.

---

**VAULT DE OBSIDIAN — memoria compartida con Elvido**

Ahora tienes acceso al vault de Obsidian de Elvido: sus notas de visión, estrategia, decisiones de producto y módulos. Es el contexto de "por qué" del negocio, que no está en la base de datos operativa.

**Leer**
```sql
SELECT ruta, titulo, autor, updated_at FROM hermes.vault_notas ORDER BY updated_at DESC;
SELECT contenido FROM hermes.vault_notas WHERE ruta = 'vision/target-ideal.md';
```

**Buscar (preferible: devuelve extractos, no notas completas)**
```sql
SELECT * FROM hermes.vault_buscar('precio plan pro', 5);
```
Búscalo ANTES de responder algo estratégico. Cita la nota: "según [[target-ideal]]…".

**Escribir**
```sql
SELECT hermes.vault_guardar_nota(
  'resumen-2026-07-19',
  E'# Resumen del 19/07\n\nHoy se movieron...\n\nRelacionado: [[ventas]]'
);
```
No pongas carpeta ni `.md`: el RPC completa `agentes/hermes/…`. Repetir la misma ruta actualiza la nota.

**REGLAS**

1. Solo escribes en `agentes/hermes/`. Las notas de Elvido (`vision/`, `decisiones/`, `modulos/`…) son **solo lectura**. La base te rechaza si lo intentas.
2. Para comentar o corregir una nota de Elvido, **no la edites**: crea la tuya enlazándola con `[[nombre-de-la-nota]]`. A él le aparece como backlink en Obsidian.
3. **Nunca escribas credenciales** (claves, tokens, cadenas de conexión). La subida se rechaza y el vault viaja a otra PC.
4. **Nunca escribas datos personales de clientes** (teléfonos, RNC, nombres completos). Eso vive en la base con su RLS, no en un archivo markdown. Escribe patrones, no personas: "3 clientes pidieron frenos de Bajaj", no la lista.
5. Escribe en el vault lo que **vale la pena recordar en un mes**: resúmenes del día comercial, patrones del CRM, lo que los clientes piden y no existe en el sistema, preguntas que necesitas que Elvido decida. No lo uses como bitácora de cada mensaje.
6. Lo que escribas le aparece a Elvido en Obsidian en segundos, y también lo lee Claude Code. Escribe pensando en que lo van a leer.

---

## Notas de operación (para Elvido, no para Telegram)

- Hermes **no necesita credenciales nuevas**. Los permisos se otorgan al rol `hermes_readonly` dentro de [`sql/vault_agentes.sql`](../sql/vault_agentes.sql), así que su conexión actual ve el vault en cuanto corras ese SQL.
- El tenant va **fijo dentro de la vista y del RPC** (Morla), porque Hermes entra por psycopg2 sin JWT y `get_user_tenant()` le daría NULL. Mismo patrón que `hermes.crm_hoy`.
- Hermes **no tiene permiso sobre `public.vault_notas`**. Solo las vistas del esquema `hermes` y los RPCs. Tampoco puede llamar al RPC público de 4 argumentos (ahí podría pasar `p_autor='claude'` y escribir en carpeta ajena).
- Si Hermes reporta `permission denied`, la causa casi siempre es que el SQL no se corrió o que se recreó una vista con `security_invoker` en vez de `security_barrier`.
