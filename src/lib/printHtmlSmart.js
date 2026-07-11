// ============================================================
// printHtmlSmart.js
// ============================================================
// Punto ÚNICO de impresión de MotoFlow. Recibe el HTML que ya
// generan las plantillas (printPOS, informes, etc.) y decide cómo
// imprimirlo:
//
//   1. Si el Motoflow Print Agent está activo y el usuario habilitó
//      "impresión sin diálogo" → lo manda al agente (silencioso):
//        • tipo 'ticket' → ESC/POS raster a la impresora térmica (con corte)
//        • tipo 'carta'  → PNG a la impresora (láser/inkjet) vía GDI
//   2. Si no → cae al método de siempre: iframe + window.print()
//      (idéntico comportamiento actual, sin regresiones).
//
// Así TODAS las impresiones de MotoFlow pueden salir por el agente sin
// reescribir una sola plantilla. Cada plantilla solo tiene que llamar a
// printHtmlSmart(html, { tipo, anchoMM }) en vez de crear su iframe.
// ============================================================

import { agentIsAvailable, agentPrintImage, agentPrintRaw } from '@/services/motoflowPrintAgent';
import { findReceiptPrinter, findLabelPrinter } from '@/services/printerAdapter';

const PREF_KEY = 'mf_print_sin_dialogo'; // '1' = usar agente para imprimir sin diálogo

export function isSilentPrintEnabled() {
    return localStorage.getItem(PREF_KEY) === '1';
}
export function setSilentPrintEnabled(on) {
    localStorage.setItem(PREF_KEY, on ? '1' : '0');
}

// Fallback histórico: iframe oculto + window.print() (lo que se hacía siempre)
export function printViaBrowser(html) {
    const iframe = document.createElement('iframe');
    Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    // Muchas plantillas ya traen onload="window.print()"; si no, lo forzamos.
    if (!/window\.print\(\)/.test(html)) {
        setTimeout(() => { try { iframe.contentWindow.print(); } catch (_) { /* noop */ } }, 250);
    }
    setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 3000);
}

/**
 * Imprime una plantilla HTML por el mejor canal disponible.
 *
 * @param {string} html  HTML completo de la plantilla (como el que ya generan).
 * @param {object} opts
 * @param {'ticket'|'carta'} [opts.tipo='ticket']  térmico vs hoja completa.
 * @param {number} [opts.anchoMM]  ancho del papel térmico (72 para 80mm, 48 para 58mm).
 * @param {number} [opts.copies=1]
 * @param {string[]} [opts.preferPrinter]  nombres de impresora preferidos.
 * @returns {Promise<{ backend: 'agent'|'browser' }>}
 */
export async function printHtmlSmart(html, opts = {}) {
    const { tipo = 'ticket', anchoMM, copies = 1, preferPrinter = [] } = opts;

    if (isSilentPrintEnabled()) {
        try {
            if (!(await agentIsAvailable())) throw new Error('agente no disponible');
            const { htmlToEscposRaster, htmlToPngBase64, DOTS_80MM, DOTS_58MM } = await import('@/services/escposRaster');

            if (tipo === 'carta') {
                const printer = await findLabelPrinterOrReceipt(preferPrinter);
                const png = await htmlToPngBase64(html, 816); // ~8.5in @96dpi
                await agentPrintImage(printer, png, { widthMM: 0, copies });
                return { backend: 'agent' };
            }

            // ticket térmico
            const anchoDots = (anchoMM && anchoMM <= 58) ? DOTS_58MM : DOTS_80MM;
            const printer = await findReceiptPrinter(preferPrinter);
            const escpos = await htmlToEscposRaster(html, anchoDots);
            await agentPrintRaw(printer, escpos, { format: 'escpos', copies });
            return { backend: 'agent' };
        } catch (err) {
            console.warn('[printHtmlSmart] agente falló, uso navegador:', err?.message || err);
            // Cae al navegador para NO perder la impresión.
        }
    }

    printViaBrowser(html);
    return { backend: 'browser' };
}

async function findLabelPrinterOrReceipt(preferred) {
    // Para carta usamos la impresora normal (láser/inkjet). Si el usuario tiene
    // una configurada como "recibos" la reutilizamos como respaldo.
    try {
        return await findReceiptPrinter(preferred);
    } catch {
        return await findLabelPrinter(preferred);
    }
}
