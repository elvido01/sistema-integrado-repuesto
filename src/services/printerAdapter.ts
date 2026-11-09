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
const isCopyName = (name: string) => /\((?:copia|copiar|copy)\s*\d+\)/i.test(name);

// Cuando varias impresoras coinciden, prefiere la que NO es una cola
// duplicada "(Copia N)" de Windows y, a igualdad, el nombre más corto.
// El agente v0.7.3+ además redirige a la hermana viva; esto ayuda cuando
// la web corre contra un agente viejo o QZ Tray.
function pickBest(matches: string[]): string | null {
    if (!matches.length) return null;
    return [...matches].sort((a, b) => {
        const ac = isCopyName(a) ? 1 : 0;
        const bc = isCopyName(b) ? 1 : 0;
        if (ac !== bc) return ac - bc;
        return a.length - b.length;
    })[0];
}

function matchPrinter(printers: string[], preferred: string[] = []): string | null {
    const lowerList = printers.map((p) => p.toLowerCase());

    // 1. Match exacto
    for (const name of preferred) {
        if (!name) continue;
        const idx = lowerList.indexOf(name.toLowerCase());
        if (idx >= 0) return printers[idx];
    }
    // 2. Match por substring — recoge TODOS los que coinciden y elige el mejor
    //    (sin sufijo "(Copia N)"), no el primero según el orden de Windows.
    for (const name of preferred) {
        if (!name) continue;
        const t = name.toLowerCase();
        const matches = printers.filter((p) => {
            const lp = p.toLowerCase();
            return lp.includes(t) || t.includes(lp);
        });
        const best = pickBest(matches);
        if (best) return best;
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
/**
 * (07/11/2026) Las Star de Morla trabajan en modo Star: ahí el avance final
 * (ESC d 3) YA corta, y el corte ESC/POS (GS V …) no lo entienden y salía
 * como una "v" arriba del ticket siguiente. En una Star se quita.
 */
/** Star (modo Star) por el nombre: una sola regla para el corte y el logo. */
// 3nStar (clónica ESC/POS, 09/11/2026) lleva "star" en el nombre pero NO es Star.
// (09/11/2026) Cada PC puede decir qué es su impresora de recibos
// (Configuración → Impresoras → Tipo de impresora): 'star', 'escpos' o
// 'auto' (por el nombre, lo de siempre). Se guarda en esta PC (localStorage).
export const TIPO_IMPRESORA_KEY = 'mf.tipoImpresoraRecibos';
export type TipoImpresora = 'auto' | 'star' | 'escpos';
export function getTipoImpresora(): TipoImpresora {
    try {
        const v = globalThis.localStorage?.getItem(TIPO_IMPRESORA_KEY);
        return v === 'star' || v === 'escpos' ? v : 'auto';
    } catch { return 'auto'; }
}
export function setTipoImpresora(t: TipoImpresora) {
    try {
        if (t === 'auto') globalThis.localStorage?.removeItem(TIPO_IMPRESORA_KEY);
        else globalThis.localStorage?.setItem(TIPO_IMPRESORA_KEY, t);
    } catch { /* sin almacenamiento: queda por el nombre */ }
}
export const esImpresoraStar = (printerName: string): boolean => {
    const tipo = getTipoImpresora();
    if (tipo !== 'auto') return tipo === 'star';
    const n = String(printerName || '');
    return /star|tsp/i.test(n) && !/3n[\s-]*star/i.test(n);
};

export function ajustarParaImpresora(printerName: string, escpos: string): string {
    if (!esImpresoraStar(printerName)) return escpos;
    let s = escpos.replace(/\x1DV[\x00\x01\x30\x31]/g, '').replace(/\x1DV[\x41\x42][\s\S]/g, '');
    // (08/11/2026) Texto con ñ/tildes (tabla 437): la Star la escoge con
    // ESC GS t 1 (probado en papel); cada ESC @ la reinicia, se pone detrás.
    // Solo si hay bytes así (letras, o el largo de un QR): los tickets de solo
    // ASCII quedan igual. Escoger la tabla no cambia el texto ASCII.
    if (/[\x80-\xFF]/.test(s)) s = s.replace(/\x1B@/g, '\x1B@\x1B\x1Dt\x01');
    // FS . (modo chino de las clónicas) no está probado en la Star: fuera.
    return s.replace(/\x1C\./g, '');
}

export async function printRawEscPos(printerName: string, escpos: string) {
    return printRaw(printerName, ajustarParaImpresora(printerName, escpos), { format: 'escpos' });
}

/**
 * (08/11/2026) ESC/POS directo al agente, SIN tocar la preferencia guardada
 * (setPreferredBackend('agent') + restaurar dejaba la preferencia cambiada si
 * se imprimían dos cosas a la vez o se cerraba la pestaña a mitad).
 */
export async function printEscPosPorAgente(printerName: string, escpos: string, imagenAntes = '') {
    // imagenAntes (logo en bytes crudos) va tal cual: el ajuste de la Star
    // busca bytes de corte y podría tocar los datos de la imagen.
    await agentPrintRaw(printerName, imagenAntes + ajustarParaImpresora(printerName, escpos), { format: 'escpos' });
}

export async function printRawEpl(printerName: string, epl: string) {
    return printRaw(printerName, epl, { format: 'epl' });
}

export { agentIsAvailable };
