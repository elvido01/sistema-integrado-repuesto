# Mini-plan 30 dias — MotoFlow / Repuestos Morla

**Del 8 de junio al 7 de julio de 2026**

Marca con `[x]` lo que vayas completando.

---

## Metas del mes (concretas, medibles)

| Metrica | Meta | Real |
|---|---|---|
| Nuevos clientes MotoFlow firmados | 3 (minimo 1 plan PRO) | _ |
| Ingresos recurrentes nuevos (MRR) | +RD$ 15,000 | _ |
| Bugs criticos abiertos al final | 0 (Print Agent + Mercancias cerrados) | _ |
| Modulos productivos nuevos | DGII e-CF + WhatsApp Live | _ |
| Demos / llamadas con prospects | 12 (3/semana) | _ |

---

## SEMANA 1 — 8 al 14 jun (estabilizacion)

### Desarrollo
- [ ] **Lun-Mar**: Cerrar Print Agent v0.4 — revisar logs del crash post-impresion, agregar reintento + watchdog si exit code = 0 anomalo. Soltar v0.4.1 estable.
- [ ] **Mie-Jue**: Reproducir bug de Mercancias (Codex en eso, tu validas).
- [ ] **Vie**: Subir dist con Marketing IA + Compra Inteligente activos en prod (correr SQLs pendientes).

### Ventas
- [ ] Lista de 20 prospects (talleres y repuestos en Santiago/STO Dgo) — sacar de Google Maps + tu red.
- [ ] Grabar video demo de 90 seg mostrando: facturacion rapida + OCR de compras + etiquetas. Subir a Drive.
- [ ] Pago en Meta Business -> desbloquear WhatsApp para empezar campañas.

### Finanzas
- [ ] Revisar gasto OpenAI mes pasado (clave AI CEO). Confirmar que `gpt-4o-mini` sigue siendo el default.
- [ ] Confirmar plan Supabase actual y si DEV+PROD se acercan a limite del free tier.

---

## SEMANA 2 — 15 al 21 jun (DGII certificacion)

> NOTA (revisado 2026-06-08): Fase 3d (firma XAdES) y 3e (envio a DGII)
> YA estaban completadas. Primer e-CF aceptado por CerteCF el 2026-05-15.
> Lo que realmente falta para que un cliente nuevo facture en produccion:

### Desarrollo (foco maximo)
- [ ] **Auto-fallback config_empresa**: el handler en `index.ts` debe leer direccion/municipio/provincia/email desde `config_empresa` cuando `integraciones_fiscales.config` no los tenga. Sin esto, cada tenant nuevo requiere UPDATE manual de SQL.
- [ ] **Set de certificacion CerteCF**: correr las 25 pruebas oficiales DGII con `DgiiCertificacionRunner` para que tenants nuevos puedan pasar a produccion legal.
- [ ] **Fase 3f**: endpoint publico que reciba callbacks ARECF/AECF de DGII (necesita URL con SSL — puede ser ruta nueva en `emitir-fiscal` o Edge Function separada).
- [ ] **Tipos pendientes**: completar 34 (Nota de Credito) que es el mas pedido; 33 (Nota de Debito) y anulacion. Los demas (41/43/44/45/46/47) cuando aparezca un cliente que los necesite.

### Ventas
- [ ] Iniciar App Review de Meta para WhatsApp modo Live (toma 1-2 semanas Meta).
- [ ] Mandar el video demo a los 20 prospects + propuesta inicial (3 planes).
- [ ] Agendar 3 demos para semana 3.

### Finanzas
- [ ] Calcular costo real por tenant (Supabase rows + edge functions + OpenAI). Saber si BASICO RD$1,500/mes deja margen.

---

## SEMANA 3 — 22 al 28 jun (cerrar ventas)

### Desarrollo
- [ ] DGII e-CF en produccion — primer e-CF emitido por Repuestos Morla (tu mismo eres el conejillo).
- [ ] WhatsApp CRM en modo Live (cuando Meta apruebe).
- [ ] Marketing IA Fase 2b — empezar OAuth de YouTube (publicar Shorts auto).

### Ventas
- [ ] Hacer las 3 demos agendadas en semana 2.
- [ ] Cerrar minimo 1 cliente con plan PRO. Plantilla de contrato lista.
- [ ] Activar onboarding del cliente cerrado (crear tenant, capacitacion 1h por Zoom).

### Finanzas
- [ ] Primera factura emitida con e-CF (validar todo el flujo de cobro).
- [ ] Revisar conversion: de 20 prospects -> 3 demos -> 1 cliente = embudo 5%. Documentar para iterar.

---

## SEMANA 4 — 29 jun al 5 jul (consolidar + escalar)

### Desarrollo
- [ ] Bugs que aparecieron del primer cliente real (siempre hay 3-5).
- [ ] Marketing IA Fase 2b YouTube terminada.
- [ ] Promover app movil de Play Internal -> Produccion (proceso ~3 dias review Google).

### Ventas
- [ ] Segunda tanda de 20 prospects nuevos.
- [ ] Cerrar 2 clientes mas (meta acumulada del mes: 3 clientes).
- [ ] Pedir testimonio en video al primer cliente para usar en marketing.

### Finanzas
- [ ] Cierre de mes: MRR real vs meta RD$15,000.
- [ ] Reporte de costos vs ingresos (P&L simple).

---

## CIERRE — 6 y 7 jul

- [ ] Revisar las metas del mes vs lo real.
- [ ] Documentar 3 cosas que funcionaron + 3 que no.
- [ ] Armar plan de los proximos 30 dias (8 jul - 7 ago) con aprendizajes.

---

## RUTINAS DIARIAS (las 4 semanas)

- **8:00-8:30** — Revisar inbox/WhatsApp de prospects, responder
- **9:00-10:00** — Operacion Repuestos Morla (lo que el negocio real necesite)
- **10:00-12:00** — Dev focus (tareas de la semana)
- **Tarde** — Llamadas/demos + operacion
- **20:00-20:30** — Revisar logs produccion (Print Agent, DGII, errores)

---

## Riesgos a vigilar

1. **Meta tarda mas de 2 semanas** en aprobar App Review -> plan B: usar WhatsApp Business app normal hasta entonces.
2. **DGII Fase 3d se complica** (firma XAdES siempre da problemas) -> reservar buffer de 3 dias extra en semana 2.
3. **Cliente cerrado pide features custom** -> decir NO al principio, solo lo que ya esta. Una excepcion y se descarrila el mes.
4. **Print Agent sigue inestable** -> los clientes nuevos no aceptan etiquetas que se cuelgan. Bloquea el cierre.
