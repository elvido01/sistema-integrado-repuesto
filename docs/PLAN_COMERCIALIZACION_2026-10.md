# Plan de comercialización de MotoFlow — 11 al 25 de octubre de 2026

Sale de la auditoría del 10/10/2026. Regla del dueño: **nada que pueda tumbar
el sistema en horario de trabajo**. Los cambios con riesgo van en **ventana**:
domingo todo el día, o de lunes a sábado **después de las 8:00 pm**. Lo
"invisible" (código nuevo apagado, lecturas, alertas) puede ir de día.

Cada paso tiene: qué cambia, riesgo, cómo se verifica y cómo se deshace.
Marcar con [x] al terminar.

## Semana 1 — seguridad y facturación electrónica

### Sáb 10/10, después de las 8:00 pm — Cerrar la fuga de datos
- [x] (10/10, verificado: sin sesión da "permission denied") Correr `sql/seguridad_fase1_cerrar_fugas.sql` (38 funciones sin acceso
      público + 9 permisos de inserción abiertos).
- Riesgo: bajo (solo permisos; la app no usa esas vías sin sesión).
- Verificar: la prueba sin sesión debe dar "permission denied"; el domingo,
  una venta, una compra y un recibo de prueba.
- Deshacer: `sql/seguridad_fase1_revertir.sql`.

### Dom 11/10 (ventana larga) — Red de seguridad para lo que sigue
- [x] (10/10, web publicada; falta correr `sql/errores_app.sql`) Registro de errores propio: los errores de la web y de las funciones
      van a una tabla, con un aviso diario. Sin servicios de terceros.
- [x] (10/10) Las 590 pruebas corren solas antes de cada publicación (`npm run
      deploy` se detiene si alguna falla).
- [x] (10/10, acción publicada y probada; falta correr el SQL local `sql/dgii_cron_revisar_pendientes.sql`, que no va a git porque lleva la clave) Consulta automática de los e-CF "enviados" (E31): cada 10 min se
      pregunta a la DGII si se aceptaron o se rechazaron. Solo lectura.
- Deshacer: apagar la tarea programada; quitar el paso de pruebas del deploy.

### Lun 12/10, noche — Cola de reintento de e-CF
- [x] (10/10, publicada y probada: 0 candidatas; la tarea va en el mismo SQL local) Una venta que se graba sin comprobante por un fallo de la DGII queda
      en una cola, y se reintenta sola cada 5 minutos con el mismo e-NCF.
- [ ] Botón "Reintentar e-CF" en el historial de ventas.
- Riesgo: medio (toca emitir-fiscal). Probar primero con D Mario.
- Deshacer: desactivar la tarea; volver a la versión anterior de la función.

### Mar 13/10, noche — Alertas de certificados y secuencias
- [x] (10/10, acción dgii_salud publicada y probada: 2 empresas, 0 avisos) Aviso a los 30, 15 y 7 días antes de que venza el certificado de cada
      empresa.
- [x] (10/10) Aviso cuando quede menos del 10 % de una secuencia autorizada, o cuando
      esté por vencer.
- Riesgo: bajo (solo lee y avisa).

### Mié 14/10, noche — Seguridad, fase 2 (A)
- [x] (10/10, verificado sin sesión) Las 4 funciones que usa la web verifican que la empresa pedida sea la
      del usuario.
- [x] (10/10, verificado sin sesión) Notificaciones: permiso de inserción por empresa, más una excepción
      controlada para el par Caminero ↔ MotoPréstamos.
- Deshacer: SQL de reversa propio.

### Jue 15/10, noche — Seguridad, fase 2 (B)
- [x] (10/10, verificado sin sesión) Revisar las ~200 funciones con permisos elevados que se pueden llamar
      sin sesión. Cerrarlas por lotes con la regla "cerrado por defecto",
      dejando una lista blanca de las públicas a propósito (promos,
      webhooks).
- Riesgo: medio. Un lote por noche si hace falta; cada lote con su reversa.

### Vie 16/10, noche — Funciones sin código y llave de QZ
- [x] (10/10: 4 al repo; morla-video-runner-temp borrada y archivada sin su clave) Bajar al repositorio el código de las 5 funciones desplegadas sin
      fuente; borrar las temporales (`morla-video-runner-temp`).
- [x] (10/10: firma en el servidor con qz-firmar; las PCs no cambian) Sacar la llave privada de QZ Tray de la web (el agente ya la
      reemplaza). Confirmar antes que ninguna PC sigue en QZ.

### Dom 18/10 (ventana larga) — Archivos públicos y librerías
- [x] (10/10: `pagos` privado con enlace firmado; `whatsapp-media` queda público a propósito: ids de Meta no adivinables y Meta descarga por URL) Buckets `pagos` y `whatsapp-media` → privados, servidos con enlaces
      temporales.
- [~] (10/10: arreglos menores aplicados, 594 pruebas OK. Pendiente: jsPDF 3→4 (falla de Node, no aplica en navegador) y xlsx sin arreglo) Actualizar jsPDF (crítica) y las librerías con fallas altas. Probar
      todas las impresiones y PDF: ticket, carta, cotización, pedido.
- Riesgo: el más alto de la semana, por eso va el domingo.

### Agregado el 10/10 — Publicaciones que venden (solo Morla)
- [x] Tope de IA US$20/mes (imágenes US$18.50; sin presupuesto, plantilla).
- [x] Errores de IA en lenguaje claro en Equipo IA.
- [x] Medición: movimiento de la pieza 7 días antes vs 7 después (tarjeta "¿Qué publicación vende?").
- [x] Alertas de servicios sin saldo / token vencido (sql/alertas_salud.sql).
- [ ] Alcance: horarios 13:30 / 17:30 / 19:30, TikTok en todas las promociones, Facebook feed casi sin alcance (5 vistas).

## Semana 2 — escalar a muchos clientes

### Lun 19 – Mar 20/10, noche — Módulos por configuración
- [x] (11/10: config_empresa.modulos; 0 uuids de empresas en pantallas; + almacén de Compras) Quitar los identificadores fijos de clientes del código (GPS de
      Caminero en el menú, etc.) y pasarlos a interruptores en la
      configuración de la empresa.
- [~] (lo que era lógica por empresa ya es módulo; quedan nombres en comentarios) Revisar los 103 archivos que nombran clientes. Lo que sea lógica pasa
      a configuración; los comentarios se quedan.

### Mié 21/10, noche — Web más liviana
- [ ] Partir el código de 5.7 MB: cada pantalla y el módulo de IA (23 MB) se
      cargan solo cuando se abren.
- Verificar: tiempo de carga en celular antes y después.

### Jue 22/10, noche — Entorno de pruebas
- [ ] Un entorno aparte para probar antes de producción (decisión de costo
      del dueño: rama de Supabase o proyecto aparte).

### Vie 23/10 — Alta de clientes nuevos
- [ ] Lista de pasos para dar de alta una empresa: registro, plan,
      certificado, certificación DGII con los runners, secuencias,
      impresión.
- [ ] Probar el alta completa con una empresa de prueba.

### Dom 25/10 (ventana larga) — Cierre
- [ ] Repetir la auditoría completa y comparar contra la del 10/10.
- [ ] Unificar ramas (`main` al día con `feat/mercancias-filtros`).

## En paralelo, sin ventana
- [ ] Correo a facturacionelectronica@dgii.gov.do: ¿MotoFlow, que guarda y
      usa los certificados de sus clientes, debe autorizarse como Proveedor
      de Servicios de Facturación Electrónica?
- [ ] Elegir la pasarela de pago para cobrar las suscripciones (decisión del
      dueño; la integración va después de estos 15 días).
