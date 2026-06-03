// ============================================================
// printerAdapter.ts
// ============================================================
// Adaptador único de impresión que prioriza:
//   1. Motoflow Print Agent (HTTP local 127.0.0.1:9123)
//   2. QZ Tray (fallback si el agente no está)
//
// Los consumidores (printPOS, etiquetas, etc.) deben usar este
// adaptador en lugar de llamar directo a qzTrayService.
// ============================================================

import {
    agentIsAvailable,
    agentListPrinters,
    agentPrintRaw,
    AgentPrinter,
} from './motoflowPrintAgent';

const QZ_RECEIPT_KEY = 'qz_receipt_printer';
const QZ_LABEL_KEY = 'qz_label_printer';
const BACKEND_PREF_KEY = 'printer_backend';

/**
 * Devuelve la preferencia de backend guardada por el usuario.
 *   'auto'  — Agent si está disponible, sino QZ Tray (default)
 *   'agent' — Forzar solo Motoflow Print Agent
 *   'qz'    — Forzar solo QZ Tray
 */
export function getPreferredBackend(): 'auto' | 'agent' | 'qz' {
    const v = localStorage.getItem(BACKEND_PREF_KEY);
    if (v === 'agent' || v === 'qz' || v === 'auto') return v;
    return 'auto';
}

export function setPreferredBackend(b: 'auto' | 'agent' | 'qz') {
    localStorage.setItem(BACKEND_PREF_KEY, b);
}

/**
 * Decide qué backend usar según preferencia + disponibilidad.
 */
async function pickBackend(): Promise<'agent' | 'qz'> {
    const pref = getPreferredBackend();
    if (pref === 'agent') return 'agent';
    if (pref === 'qz') return 'qz';
    // auto
    return (await agentIsAvailable()) ? 'agent' : 'qz';
}

/**
 * Busca en una lista de impresoras alguna que coincida (caseinsensitive)
 * con alguno de los nombres preferidos. Retorna el primero que matchee
 * exacto, sino el primero que contenga alguna substring conocida.
 */
function matchPrinter(printers: string[], preferred: string[] = []): string | null {
    const lowerList = printers.map((p) => p.toLowerCase());

    // 1. Match exacto
    for (const name of preferred) {
        if (!name) continue;
        const idx = lowerList.indexOf(name.toLowerCase());
        if (idx >= 0) return printers[idx];
    }
    // 2. Match por substring
    for (const name of preferred) {
        if (!name) continue;
        const t = name.toLowerCase();
        const idx = lowerList.findIndex((p) => p.includes(t) || t.includes(p));
        if (idx >= 0) return printers[idx];
    }
    return null;
}

/**
 * Lista todas las impresoras disponibles del backend activo.
 */
export async function listPrinters(): Promise<{ source: 'agent' | 'qz'; names: string[] }> {
    const pref = getPreferredBackend();
    const backend = await pickBackend();
    if (backend === 'agent') {
        try {
            const list: AgentPrinter[] = await agentListPrinters();
            return { source: 'agent', names: list.map((p) => p.name) };
        } catch (err) {
            if (pref === 'agent') throw err;
            console.warn('[PrinterAdapter] Agent /printers fallo; usando QZ Tray:', err);
        }
    }
    const { qzListAllPrinters } = await import('./qzTrayService');
    const list = await qzListAllPrinters();
    return { source: 'qz', names: list };
}

async function listPrintersForKind(
    kind: 'receipt' | 'label',
    preferred: string[] = [],
): Promise<{ source: 'agent' | 'qz'; names: string[] }> {
    try {
        return await listPrinters();
    } catch (err) {
        if (getPreferredBackend() !== 'agent') throw err;

        const savedKey = kind === 'label' ? QZ_LABEL_KEY : QZ_RECEIPT_KEY;
        const saved = localStorage.getItem(savedKey);
        const fallbackNames = [saved, ...preferred].filter((name): name is string => Boolean(name));
        if (fallbackNames.length > 0) {
            console.warn('[PrinterAdapter] Agent /printers fallo; probando impresora conocida:', err);
            return { source: 'agent', names: fallbackNames };
        }

        throw err;
    }
}

/**
 * Encuentra la impresora de recibos.
 * Prioridad:
 *   1. La configurada en localStorage (qz_receipt_printer) — la que el user eligió
 *   2. Coincidencias por nombre en `preferred[]`
 *   3. Heurísticas (POS/thermal/receipt)
 */
export async function findReceiptPrinter(preferred: string[] = []): Promise<string> {
    const { source, names } = await listPrintersForKind('receipt', preferred);

    // 1. localStorage (la que eligió el usuario en Configuración)
    const saved = localStorage.getItem(QZ_RECEIPT_KEY);
    if (saved && names.includes(saved)) return saved;

    // 2. Preferidos pasados como parámetro
    const byPref = matchPrinter(names, preferred);
    if (byPref) return byPref;

    // 3. Heurísticas comunes de impresoras térmicas POS
    const heur = matchPrinter(names, [
        'star tsp', 'tsp100', 'tsp143', 'tsp650',
        'epson tm', 'tm-t', 'tm-u',
        'pos-58', 'pos-80',
        'receipt', 'ticket', 'thermal',
        'xprinter', '58mm', '80mm',
    ]);
    if (heur) return heur;

    throw new Error(
        `No se encontró impresora de recibos. Backend ${source} detectó: ${names.join(', ')}`,
    );
}

/**
 * Encuentra la impresora de etiquetas (EPL2/ZPL).
 */
export async function findLabelPrinter(preferred: string[] = []): Promise<string> {
    const { source, names } = await listPrintersForKind('label', preferred);

    const saved = localStorage.getItem(QZ_LABEL_KEY);
    if (saved && names.includes(saved)) return saved;

    const byPref = matchPrinter(names, preferred);
    if (byPref) return byPref;

    const heur = matchPrinter(names, [
        'zdesigner', 'lp 2824', 'lp2824', 'zebra',
        '4barcode', 'godex', 'tsc', 'argox',
    ]);
    if (heur) return heur;

    throw new Error(
        `No se encontró impresora de etiquetas. Backend ${source} detectó: ${names.join(', ')}`,
    );
}

/**
 * Imprime bytes RAW. El backend lo elige automáticamente.
 */
export async function printRaw(
    printerName: string,
    data: string,
    opts: { format?: 'escpos' | 'epl' | 'zpl' | 'raw' } = {},
): Promise<{ ok: boolean; backend: 'agent' | 'qz' }> {
    const pref = getPreferredBackend();
    const backend = await pickBackend();
    if (backend === 'agent') {
        try {
            await agentPrintRaw(printerName, data, { format: opts.format });
            return { ok: true, backend: 'agent' };
        } catch (err) {
            if (pref === 'agent') throw err;
            console.warn('[PrinterAdapter] Agent print fallo; usando QZ Tray:', err);
        }
    }
    const { qzPrintRawEscPos, qzPrintRawEpl } = await import('./qzTrayService');
    if (opts.format === 'epl' || opts.format === 'zpl') {
        await qzPrintRawEpl(printerName, data);
    } else {
        await qzPrintRawEscPos(printerName, data);
    }
    return { ok: true, backend: 'qz' };
}

/**
 * Wrappers cómodos por tipo.
 */
export async function printRawEscPos(printerName: string, escpos: string) {
    return printRaw(printerName, escpos, { format: 'escpos' });
}

export async function printRawEpl(printerName: string, epl: string) {
    return printRaw(printerName, epl, { format: 'epl' });
}

export { agentIsAvailable };
