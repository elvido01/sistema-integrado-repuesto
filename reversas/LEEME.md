# Reversas de SQL — NO se aplican en orden

Estos archivos DESHACEN una migración de `sql/`. Viven fuera de `sql/` a
propósito: el 22/11/2026 la reversa de la fase 3 de seguridad se aplicó sin
querer 40 segundos después de la fase 3 (alguien corrió los archivos nuevos
de `sql/` en orden) y la fuga quedó abierta otra vez. Lo mismo le pasó a la
fase 2 el 10/10.

Correr uno SOLO si la migración rompió algo, sabiendo qué se rompió:

    node scripts/correr-sql.mjs reversas/<archivo>.sql
