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

import { agentIsAvailable, agentPrintImage } from '@/services/motoflowPrintAgent';
import { findReceiptPrinter, findLabelPrinter } from '@/services/printerAdapter';

const PREF_KEY = 'mf_print_sin_dialogo'; // '1' = usar agente para imprimir sin diálogo

export function isSilentPrintEnabled() {
    return localStorage.getItem(PREF_KEY) === '1';
}
export function setSilentPrintEnabled(on) {
    localStorage.setItem(PREF_KEY, on ? '1' : '0');
}

// (26/11/2026) El "largo exacto" (abajo) queda como OPCIÓN DE ESTA PC, apagada.
// Encendido para todos encogía la factura (Morla FT-5183: letra diminuta y QR
// que no se lee): si el papel del driver no es de 80 mm x ese largo, Chrome
// ENCOGE la página para que quepa. Lo de siempre (papel del driver, 1:1) es lo
// seguro; solo la PC cuyo driver tira papel en blanco hasta el corte lo enciende.
const LARGO_KEY = 'mf_ticket_largo_exacto';
export function isTicketLargoExacto() {
    try { return localStorage.getItem(LARGO_KEY) === '1'; } catch (_) { return false; }
}
export function setTicketLargoExacto(on) {
    try { localStorage.setItem(LARGO_KEY, on ? '1' : '0'); } catch (_) { /* noop */ }
}

// (24/11/2026) Tickets térmicos: el largo EXACTO de la página.
// Las plantillas piden `@page { size: 80mm auto }`, pero "ancho auto" NO es
// un tamaño válido en CSS: Chrome descarta la regla y usa el papel del
// driver (probado: sale una hoja CARTA de 279 mm para un ticket de 3
// líneas). En la térmica eso es el ticket + medio metro de papel en blanco
// hasta el corte (le pasó a la cafetería). Aquí se mide el ticket ya
// dibujado y se le da a la página ese largo, con el ancho de la plantilla.
// Solo dentro de una regla @page: "background-size: 40mm auto" no es un ticket.
const TICKET_AUTO = /@page\s*\{[^}]*?\bsize:\s*([\d.]+mm)\s+auto/i;
function imprimirTicketMedido(html, anchoPagina) {
    const anchoMm = parseFloat(anchoPagina);
    const iframe = document.createElement('iframe');
    // Fuera de la pantalla pero con el ancho del papel: medido a 0 px el
    // texto se partiría y el alto saldría falso.
    Object.assign(iframe.style, {
        position: 'fixed', left: '-10000px', top: '0', width: `${anchoMm}mm`, height: '10px',
        border: '0', visibility: 'hidden',
    });
    iframe.setAttribute('scrolling', 'no');
    document.body.appendChild(iframe);
    const win = iframe.contentWindow;
    const imprimir = win.print.bind(win);
    // La plantilla no imprime sola (onload o script): imprime esto, ya medido.
    win.print = () => {};
    const doc = win.document;
    doc.open();
    doc.write(html.replace(/\sonload=(["'])\s*window\.print\(\)\s*;?\s*\1/i, ''));
    doc.close();
    try { win.print = () => {}; } catch (_) { /* noop */ }
    const quitar = () => setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 3000);
    let hecho = false;
    const lanzar = () => {
        if (hecho) return;
        hecho = true;
        try {
            const px = Math.max(doc.documentElement.scrollHeight, doc.body ? doc.body.scrollHeight : 0);
            // 96 px = 1 pulgada = 25.4 mm. Aire proporcional (+4 %) y 6 mm fijos:
            // al imprimir la letra puede partir distinto y un ticket largo crecer
            // unos milímetros; sin ese aire saldría una 2.ª página en blanco.
            const mm = (px * 25.4) / 96;
            const altoMm = Math.ceil(mm * 1.04) + 6;
            const st = doc.createElement('style');
            st.textContent = `@page { size: ${anchoMm}mm ${altoMm}mm; margin: 0; } html { overflow: hidden; }`;
            (doc.head || doc.documentElement).appendChild(st);
        } catch (err) {
            console.warn('[printHtmlSmart] no se pudo medir el ticket, imprimo igual:', err?.message || err);
        }
        try { win.focus(); imprimir(); } catch (err) { console.warn('[printHtmlSmart] print falló:', err?.message || err); }
        quitar();
    };
    // Se mide cuando TODO cargó (logo, QR, fuentes): el alto cambia al aparecer.
    // Tope largo (15 s) solo para no quedarse esperando para siempre.
    if (doc.readyState === 'complete' && Array.from(doc.images || []).every((i) => i.complete)) {
        setTimeout(lanzar, 250);
    } else {
        win.addEventListener('load', () => setTimeout(lanzar, 100));
        setTimeout(lanzar, 15000);
    }
}

// Fallback histórico: iframe oculto + window.print() (lo que se hacía siempre)
export function printViaBrowser(html) {
    const ticket = TICKET_AUTO.exec(html || '');
    if (ticket && isTicketLargoExacto()) { imprimirTicketMedido(html, ticket[1]); return; }
    const iframe = document.createElement('iframe');
    Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
    // Muchas plantillas ya traen onload="window.print()"; si no, lo forzamos.
    const quitar = () => setTimeout(() => { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 3000);
    if (!/window\.print\(\)/.test(html)) {
        // (12/11/2026) Logo, firma y sello vienen de internet: se espera a que
        // carguen (máximo 4 s) para que no salgan en blanco en el papel.
        const lanzar = () => { try { iframe.contentWindow.print(); } catch (_) { /* noop */ } quitar(); };
        const pend = Array.from(doc.images || []).filter((i) => !i.complete);
        if (!pend.length) {
            setTimeout(lanzar, 250);
        } else {
            let listo = false;
            const fin = () => { if (!listo && pend.every((i) => i.complete)) { listo = true; setTimeout(lanzar, 100); } };
            pend.forEach((i) => { i.addEventListener('load', fin); i.addEventListener('error', fin); });
            setTimeout(() => { if (!listo) { listo = true; lanzar(); } }, 4000);
        }
    } else {
        quitar();
    }
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
            const { htmlToPngBase64, DOTS_80MM, DOTS_58MM } = await import('@/services/escposRaster');

            if (tipo === 'carta') {
                const printer = await findLabelPrinterOrReceipt(preferPrinter);
                const png = await htmlToPngBase64(html, 816); // ~8.5in @96dpi
                await agentPrintImage(printer, png, { widthMM: 0, copies });
                return { backend: 'agent' };
            }

            // Ticket térmico → SIEMPRE por imagen GDI (pasa por el driver de
            // Windows, funciona en CUALQUIER impresora: Star, Epson, Xprinter…).
            // El ESC/POS raster nativo NO sirve en Star y da basura, por eso no
            // se usa aquí. El ancho lo fija el driver a `anchoMM`.
            const es58 = anchoMM && anchoMM <= 58;
            const anchoDots = es58 ? DOTS_58MM : DOTS_80MM;
            const printer = await findReceiptPrinter(preferPrinter);
            const png = await htmlToPngBase64(html, anchoDots);
            await agentPrintImage(printer, png, { widthMM: es58 ? 48 : 72, copies });
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
