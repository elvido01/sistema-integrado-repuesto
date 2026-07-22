# Integración Hermes + MotoFlow — estado operativo

Relacionado: [[target-ideal]] · [[por-que-existe-motoflow]] · [[multi-tenant-compartido]]

## Propósito
Hermes es la capa comercial y operativa que consulta datos reales de MotoFlow, prioriza acciones y prepara trabajo para el equipo. MotoFlow conserva la fuente de verdad de catálogo, inventario, CRM, conversaciones, cotizaciones y facturación.

## Reglas de integración
- Hermes lee solo vistas seguras y filtradas al tenant de Repuestos Morla.
- Hermes actualiza CRM únicamente mediante la RPC autorizada; no escribe directo sobre tablas de negocio.
- Una conversación individual requiere teléfono verificable; nombre visible sirve para atención personalizada, pero el teléfono/JID es el identificador y destino.
- Una cotización necesita producto/código estructurado para que un seguimiento pueda enlazarse y cerrarse automáticamente al facturar.
- No se envían mensajes externos, publicaciones, descuentos, créditos ni excepciones sin autorización explícita.

## Estado de trabajo
- El reporte diario comercial unificado prioriza promociones con foto real, producto frío, seguimientos, llegadas y fotos pendientes.
- La biblioteca de fotos reales es condición para promociones seguras; no se completa una cuota con productos sin imagen oficial.
- El siguiente hito de validación es el flujo completo: conversación individual con teléfono y nombre → cotización estructurada → CRM enlazado → factura → cierre automático.

## Seguridad
Las vistas destinadas a Hermes deben excluir conversaciones sin identidad individual verificable y no exponer secretos, tokens, credenciales, costos ni márgenes.
