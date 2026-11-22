# Plan: facturar sin internet (e-CF en contingencia)

> Escrito el 22/11/2026. **No empezado.** Nació de un anuncio de WIPOS: un
> cliente suyo estuvo 3 días sin internet, siguió facturando con e-CF y, al
> volver la conexión, todo subió solo. El dueño pidió el plan para decidir
> si se hace ahora o más adelante.

## 1. Qué dice la DGII

| Situación | Qué se hace | Plazo |
|---|---|---|
| **La tienda no tiene internet** (o es intermitente) | Se generan los e-CF **fuera de línea** (firmados, con su código de seguridad y QR) y se envían cuando vuelve la conexión. La factura impresa lleva la leyenda **"e-CF emitido en modalidad de Contingencia"**. | Envío a la DGII en **máximo 72 horas**. |
| **No se puede emitir e-CF en absoluto** (sistema caído, sin certificado) | Se usan las secuencias **B** (comprobantes no electrónicos) que la DGII autoriza para contingencia. Después se reemplazan por e-CF. | Contingencia de **máximo 15 días**. Versiones anteriores del Informe Técnico daban 30 días para reemplazar; la versión nueva quitó ese plazo expreso. |
| **La DGII está caída** | Se guardan los e-CF y se envían cuando la DGII vuelve. | — |

- Base legal: Ley 32-23 y Decreto 587-24, artículos 40 a 43 (contingencia).
- La contingencia **se declara en la Oficina Virtual**: Facturación Electrónica → Contingencia FE. Facturar fuera de línea sin declararla puede interpretarse como emisión fuera de norma.
- **72 horas es el techo.** Los "3 días" del video están justo en el límite: pasado ese tiempo hay que pasar a comprobantes B.
- ⚠ **Antes de programar, leer el texto oficial vigente:**
  - el Informe Técnico e-CF;
  - el Instructivo de Contingencia de la DGII;
  - si hay un formato o una posición exacta para la leyenda;
  - si el código de seguridad o la fecha de firma cambian en contingencia.

  Las fuentes de abajo son en su mayoría proveedores y blogs; la única oficial es la ayuda de la DGII, que tiene años.

## 2. Dónde está MotoFlow hoy

**Ya tenemos:**
- **Cola de reintento de e-CF (10/10/2026), en `emitir-fiscal`.** Si la DGII falla, la venta guarda su e-NCF y su XML firmado, y se reenvía sola por hasta 72 horas con el mismo número, el mismo código de seguridad y el mismo QR. Cubre la fila "la DGII está caída".
- **Agente de impresión en cada caja ([print-agent/](../print-agent/README.md)).** Es un servicio Node que ya corre en Windows en `127.0.0.1:9123`. Es el lugar natural para firmar fuera de línea.
- **Un firmador probado byte a byte contra la DGII** (`supabase/functions/emitir-fiscal/dgii_signer.ts`). Está escrito para Deno y se puede llevar a Node.

**Nos falta. Hoy, sin internet, la caja no hace nada:**
- la web no abre: no hay PWA ni service worker;
- no hay copia local de productos, precios ni clientes;
- la factura solo se guarda en Supabase;
- el siguiente e-NCF lo da el servidor;
- el certificado y la firma viven en el servidor;
- la app móvil tampoco trabaja sin conexión.

## 3. Decisiones del dueño antes de empezar

1. **¿Crédito sin internet?** Recomendado: **no**, solo contado (efectivo y tarjeta) en la fase 1. Sin conexión no se puede verificar el límite, la mora ni el bloqueo del cliente.
2. **¿Vender con existencia 0 en la copia local?** Recomendado: **avisar y dejar vender**. La copia local puede estar atrasada y otra caja pudo vender esa pieza; al subir, el sistema lo marca.
3. **¿Cerrar la caja con ventas por subir?** Recomendado: **no**. El cierre espera a que todo suba, o se hace con un aviso visible.
4. **¿Quién puede facturar sin internet?** ¿Todas las cajas o solo las que el dueño habilite? Cada caja que firma tiene el certificado en su PC.
5. **¿Las 72 horas?** Recomendado: a las 48 horas sin subir, aviso fuerte al dueño. A las 72 horas, la caja deja de emitir e-CF y pide comprobantes B, según la norma.

## 4. Fases

Cada fase se publica sola, toca ventas, inventario o DGII, y pasa por `/code-review high` y el candado. Riesgo: en ventana (domingo o después de las 8 pm), como en el plan de comercialización.

### Fase 0: verificación y piloto (1 a 2 días)
- Leer el Informe Técnico y el Instructivo de Contingencia vigentes, y anotar en este archivo:
  - la leyenda exacta;
  - el plazo;
  - cómo se declara en la OFV;
  - si las facturas de consumo (E32 menores de RD$250 mil, que van como RFCE) tienen regla propia.
- Elegir la caja piloto. Recomendado: Repuestos Morla, caja 1.
- Medir cuántas ventas hace esa caja en un día malo, para dimensionar el bloque de e-NCF.

### Fase 1: la caja abre y vende sin internet (sin e-CF todavía) (~1 semana)
- **PWA:** la web se instala y abre sin conexión. Cuidado: hoy, cuando se publica, la página se recarga sola si detecta una versión nueva (PanelManager). Sin internet eso no debe pasar.
- **Copia local en el navegador (IndexedDB) de lo que usa Ventas:**
  - productos, precios por nivel e ITBIS;
  - existencia;
  - clientes de contado y Cliente Genérico;
  - configuración de la empresa e impresoras.

  Se refresca sola cada pocos minutos mientras hay internet.
- **Ventas guardadas en la PC.** Cada venta nace con su id (uuid) creado en la caja y queda en una cola local. Al volver internet, sube con ese id, así que **nunca se duplica**: el servidor ignora un id que ya existe.
- **Indicador siempre visible:** "Sin conexión: 3 ventas por subir".
- En esta fase, sin internet sale un **ticket provisional sin comprobante**. Al subir, la venta toma su e-CF por la cola que ya existe. **Esto solo sirve si el corte dura poco** (menos de 72 horas y con el cliente avisado). Por eso la fase 2 es la que de verdad cumple la norma.

### Fase 2: e-CF de verdad sin internet (~1 a 2 semanas)
- **Bloque de e-NCF apartado por caja.** Mientras hay internet, cada caja reserva, por ejemplo, 200 números de cada tipo (E31, E32) en una tabla nueva (`ecf_bloques_caja`). Sin internet usa los suyos y nunca choca con otra caja. Si el bloque se acaba, pasa a comprobantes B.
- **Firma en el agente.**
  - Se lleva `dgii_signer.ts` a Node dentro de `print-agent`.
  - El certificado .p12 se guarda cifrado en esa PC (Windows DPAPI) y solo se usa para firmar.
  - Hay que probar que el XML firmado por el agente sea **idéntico byte a byte** al del servidor (ver `feedback_dgii_signer_byte_perfect` en la memoria).
- **La factura impresa** lleva el código de seguridad y el QR calculados localmente, más la leyenda **"e-CF emitido en modalidad de Contingencia"**.
- **Al volver internet:**
  - sube la venta con su XML ya firmado;
  - la cola de `emitir-fiscal` lo envía tal cual, sin volver a firmarlo, porque eso cambiaría el código de seguridad;
  - se anotan la fecha de firma y la de envío.
- **Fecha de la venta:** cuenta la de la caja, no la de subida. Así los reportes del día quedan correctos.

### Fase 3: el resto del sistema (~1 semana)
- **Inventario:** las ventas que suben tarde descuentan existencia en el orden en que se hicieron. Si algo quedó en negativo, el centinela lo avisa.
- **Caja y cuadre:** el cierre cuenta las ventas que subieron tarde, y no deja cerrar con ventas pendientes (decisión 3).
- **Aviso de contingencia a los 48 y 72 horas** (decisión 5), por la campanita y el push del teléfono.
- **Recordatorio de declarar la contingencia en la OFV**, o hacerlo automático si la DGII ofrece la vía.
- **App móvil (POS):** la misma cola local. Ya hay un patrón parecido en `mobile/src/features/hermes/cola.ts`.

### Fase 4 (opcional): crédito sin internet
- Solo si el dueño la quiere, con reglas propias: tope por cliente guardado en la copia local y aprobación con PIN de supervisor.

## 5. Riesgos

| Riesgo | Cómo se controla |
|---|---|
| Venta duplicada al subir | El id nace en la caja y el servidor ignora un id repetido. |
| Dos cajas con el mismo e-NCF | Bloques apartados por caja; nunca se pide "el siguiente" sin conexión. |
| Robo del certificado en la PC | Guardado cifrado (DPAPI). El agente solo firma y nunca exporta la llave. Lo ideal es usar solo las cajas que el dueño autorice. |
| Pasar de 72 horas sin enviar | Aviso a las 48 horas; a las 72, la caja deja de emitir e-CF y pide comprobantes B. |
| Precio o existencia viejos en la copia local | Se refresca cada pocos minutos con internet; la venta guarda el precio con que se hizo; el centinela avisa negativos. |
| La PC se apaga con ventas sin subir | IndexedDB sobrevive al reinicio. Hacer un respaldo diario de la cola en el agente. |
| La web se recarga sola sin internet y pierde la venta en curso | La PWA no recarga sin conexión. Ver `feedback_no_recargar_sola`. |

## 6. Orden recomendado

**Fase 0 → 1 → 2 → 3**, con piloto en Morla caja 1 antes de abrirlo a las demás empresas. La fase 1 sola ya resuelve un apagón corto. Hasta la fase 2 no se cumple la norma de contingencia, y es la que permite decirlo en la publicidad, como hace WIPOS.

## Fuentes (consultadas el 22/11/2026)

- [DGII, ayuda CA4283: ¿qué significa el estado "En Contingencia"?](https://ayuda.dgii.gov.do/conversations/facturacin-electrnica/ca4283-en-la-facturacin-electrnica-qu-significa-el-estado-en-contingencia/5f3c17ca8cd858ce87aad7ff)
- [LLB Solutions: la DGII publica el Instructivo de Contingencia](https://llbsolutions.com/es/dgii-publica-el-instructivo-de-contingencia-de-facturacion-electronica-en-republica-dominicana/)
- [Gosocket: la DGII publicó el instructivo de contingencia](https://gosocket.net/centro-de-recursos/la-dgii-publico-el-instructivo-de-contingencia-de-facturacion-electronica/)
- [Siempre al Día: contingencia en la facturación electrónica (uso de B)](https://siemprealdia.co/republica-dominicana/impuestos/contingencia-en-la-facturacion-electronica/)
- [Siempre al Día: cómo manejar una contingencia](https://siemprealdia.co/republica-dominicana/impuestos/manejar-una-contingencia-en-la-facturacion-electronica/)
- [LLB Solutions: cambios en el Informe Técnico e-CF](https://llbsolutions.com/es/republica-dominicana-cambios-informe-tecnico-ecf-dgii/)
- [Gosocket: la DGII actualiza el Informe Técnico e-CF v1.0](https://gosocket.net/centro-de-recursos/la-dgii-actualiza-el-documento-informe-tecnico-e-cf-v1-0/)
- [Listín Diario: facturación electrónica después del 15 de noviembre de 2026](https://listindiario.com/economia/finanzas/20261111/facturacion-electronica-que-pasara-15-noviembre-2026_929561.html)
