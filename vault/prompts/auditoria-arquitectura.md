# Prompt — Auditoría completa de arquitectura

**Cuándo usarlo**: cada 3-6 meses, o cuando sientas que el repo se "salió de control".

**Variables**:
- Ninguna — es genérico

**Outputs esperados**:
- Reporte en `docs/architecture-analysis/AUDIT-AAAA-MM-DD.md` con:
  - Resumen ejecutivo (15 puntos)
  - Matriz de riesgos
  - Auditoría multiempresa
  - Auditoría ITBIS
  - Ciclos de importación
  - Acoplamiento Supabase
  - Dominio abastecimiento
  - Flujo DGII
  - Organización frontend
  - Plan por fases
  - Backlog priorizado
  - Lista de NO tocar

---

# PROMPT MAESTRO — AUDITORÍA Y PLAN DE MEJORA ARQUITECTÓNICA DE MOTOFLOW

Quiero que analices el repositorio completo de MotoFlow y tomes en cuenta las siguientes recomendaciones arquitectónicas.

No empieces modificando código inmediatamente.

Primero debes:

1. Analizar la estructura actual.
2. Confirmar cada hallazgo con evidencia real del repositorio.
3. Identificar riesgos.
4. Proponer un plan por fases.
5. Esperar mi aprobación antes de realizar refactorizaciones grandes o cambios destructivos.

## CONTEXTO DEL PROYECTO

MotoFlow es un sistema SaaS multiempresa para negocios relacionados con motocicletas.

Stack principal: React, Vite, TailwindCSS, Supabase, PostgreSQL, Supabase Auth, Row Level Security, Edge Functions, mobile (React Native + Expo), WhatsApp, DGII, IA, GPS.

El sistema está en producción y NO se puede romper la operación existente.

Debes conservar: compatibilidad con datos existentes, aislamiento multiempresa, flujos actuales de ventas/órdenes de compra/inventario/facturación electrónica/CRM/app móvil/impresión/integraciones externas.

## REGLAS GENERALES

Antes de cambiar cualquier archivo:
- Lee `CLAUDE.md`.
- Lee todos los archivos relevantes dentro de `docs/`.
- Revisa migraciones SQL.
- Revisa Edge Functions.
- Revisa hooks, servicios, contextos y páginas relacionadas.
- Verifica los hallazgos con búsquedas reales.
- No asumas nombres de tablas, columnas, funciones o archivos.
- No inventes estructuras.
- No elimines lógica aparentemente duplicada sin entender su propósito.
- No cambies contratos públicos sin indicar todas las dependencias.
- No ejecutes migraciones destructivas.
- No modifiques producción directamente.
- No reemplaces módulos completos si una mejora incremental es suficiente.
- No crees abstracciones innecesarias.

(... continúa con los 8 objetivos: multi-tenant, ITBIS, ciclos, acoplamiento, abastecimiento, DGII, organización, documentación ...)

## FORMATO DE RESPUESTA

1. Resumen ejecutivo (máx 15 puntos)
2. Matriz de riesgos (tabla con ID, área, hallazgo, severidad, evidencia, impacto, recomendación)
3-9. Una sección por objetivo
10. Plan por fases (Fase 0 seguridad, Fase 1 pruebas, Fase 2 refactor, Fase 3 dominios, Fase 4 frontend, Fase 5 docs)
11. Backlog priorizado
12. Archivos que NO deben modificarse todavía

## RESTRICCIONES DE IMPLEMENTACIÓN

NO implementar todavía:
- Migraciones destructivas
- Cambios masivos de carpetas
- Renombrado general de tablas
- Eliminación de columnas
- Reescritura completa de useVentas
- Reescritura completa de órdenes de compra
- Reemplazo del flujo DGII
- Cambio de proveedor / arquitectura de base de datos
- Nueva dependencia pesada
- Cambios de contratos API
- Cambios que rompan la aplicación móvil

Puedes implementar sin aprobación únicamente:
- Documentación
- Scripts de auditoría de solo lectura
- Pruebas que no cambien comportamiento
- Consultas SQL de diagnóstico
- Reportes
- Diagramas
- Comentarios técnicos útiles

Al finalizar, detente y pregúntame qué fase deseo ejecutar primero.

---

## Notas de uso (de mi experiencia 2026-06-15)

- La auditoría tomó ~30 min en spawn de 4 agents Explore paralelos
- El reporte final tuvo ~750 líneas
- Después siguieron Fases 0-3 que aplicamos en sesión
- Costo total tokens: ~$5-10
- Resultado neto: 22 SQLs aplicados, 5 edge functions redesplegadas, 41 tests verde, 0 alertas multi-tenant
