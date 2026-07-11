# Motoflow Print Agent — Análisis y plan de cobertura total

Objetivo: que **todas** las impresiones de MotoFlow salgan por el agente
local, sin el diálogo del navegador (que es lento y hay que confirmar a mano).

## Diagnóstico

Hoy conviven 3 caminos de impresión:

| Camino | Cómo imprime | Problema |
|---|---|---|
| `window.print()` en iframe (17 plantillas de `printPOS.js` + informes) | Abre el diálogo del navegador | **Lento, requiere clic, es lo que hace perder tiempo** |
| `printFacturaQZ` / `printReciboIngresoQZ` / `printCotizacionQZ` | ESC/POS nativo por QZ Tray / agente (`buildFacturaEscPos`) | Solo cubre 3 documentos, y hay que mantener plantillas ESC/POS a mano |
| `printFacturaWebUsb` | WebUSB directo | Frágil, depende del navegador y permisos USB |

La plantilla ESC/POS a mano (`escposReceipt.ts`) solo sabe factura, recibo de
ingreso y cotización. Reescribir las 17 plantillas a comandos ESC/POS sería
enorme y frágil.

## Solución adoptada: HTML → imagen → agente

En vez de reescribir plantillas, **se renderiza el mismo HTML a imagen** y se
manda al agente. Dos modos:

- **Ticket térmico**: HTML → PNG (`html-to-image`) → **ESC/POS raster GS v 0**
  (`src/services/escposRaster.ts`) → `POST /print/raw` con corte automático.
  Rápido y fiel al diseño.
- **Hoja carta/A4**: HTML → PNG → **`POST /print/image`** → el agente lo
  imprime por **GDI** (`System.Drawing.Printing`) en cualquier impresora
  láser/inkjet, sin diálogo.

Punto único: **`src/lib/printHtmlSmart.js`** → `printHtmlSmart(html, { tipo, anchoMM })`.
Si el usuario activó "Imprimir sin diálogo" y el agente responde, sale por el
agente; si no, cae a `window.print()` (comportamiento de siempre, sin
regresiones). En `printPOS.js` se expone como `emitirImpresion(html, opts)`.

## Agente v0.7 (novedades)

- `POST /print/image` — imprime PNG (base64) por GDI. `widthMM` = ancho del
  papel térmico (72 = 80mm, 48 = 58mm); `0` = hoja completa (carta/A4).
- `POST /print/raw` ahora acepta `copies`.
- Worker C# de imagen (`rawimage.exe`) compilado en runtime con
  `System.Drawing`. Si falta .NET/System.Drawing, el modo imagen se desactiva
  y se usa RAW/navegador.
- Cola serial única para RAW e imagen (evita choques con el spooler).

## Estado de cobertura por documento

**Leyenda:** ✅ conectado al agente (sale sin diálogo si está activo) · 🔁 pendiente

Todo `printPOS.js` (17 documentos) quedó conectado vía `emitirImpresion(...)`:

| Documento | Función | Tipo | Estado |
|---|---|---|---|
| Factura POS (58/80/4") | `printFacturaPOS` | ticket | ✅ |
| Factura carta/dealer | `printFacturaFullPage` / `printFacturaDealerFullPage` | 📄 carta | ✅ |
| Devolución | `printDevolucionPOS` | ticket | ✅ |
| Recibo de ingreso | `printReciboPOS` / `printRecibo4Pulgadas` | ticket | ✅ |
| Nota de crédito | `printNotaCreditoPOS` | ticket | ✅ |
| Recibo pago financiera | `printReciboPagoFinancieraPOS` | ticket | ✅ |
| Pago de compromiso | `printPagoCompromisoPOS` | ticket | ✅ |
| Gasto diario | `printGastoDiarioPOS` | ticket | ✅ |
| Cotización | `printCotizacionPOS` | ticket | ✅ |
| Cotización Magna | `printCotizacionMagnaPOS` | ticket | ✅ |
| Compra | `printCompraPOS` | ticket | ✅ |
| Orden de compra | `printOrdenCompraPOS` | ticket | ✅ |
| Pago a suplidor | `printPagoSuplidorPOS` | ticket | ✅ |
| Entrada de mercancía | `printEntradaPOS` | ticket | ✅ |
| Salida de mercancía | `printSalidaPOS` | ticket | ✅ |

**Pendientes (archivos aparte, mismo cambio de 1 línea):**

| Documento | Archivo | Tipo | Estado |
|---|---|---|---|
| Cierre de caja (POS + carta) | `CierreCajaPage.jsx` | ticket + 📄 | 🔁 |
| Informe de préstamo | `printInformePrestamo.js` | 📄 carta | 🔁 |
| Lista de transacciones | `printListaTransacciones.js` | 📄 carta | 🔁 |

### Cómo conectar las pendientes (mecánico)

Importar el helper y reemplazar el bloque de iframe/`window.print()` por:

```js
import { printHtmlSmart } from '@/lib/printHtmlSmart';
// ticket térmico:  printHtmlSmart(html, { tipo: 'ticket', anchoMM: 72 });
// hoja carta/A4:   printHtmlSmart(html, { tipo: 'carta' });
```

## Configuración (usuario)

En **Configuración → Impresoras**: casilla **"Imprimir SIN diálogo del
navegador"**. Al activarla, con el agente corriendo, facturas y tickets salen
directo a la impresora. Cada PC guarda su preferencia (`localStorage`
`mf_print_sin_dialogo`).

## Pendiente / roadmap del agente

- Conectar las 🔁 (cambio de 1 línea por función).
- Autoactualización del agente (descargar nueva versión).
- Servicio Windows real + tray icon (roadmap v0.7/v0.8 del README).
- Multi-copia por documento configurable por tipo.
