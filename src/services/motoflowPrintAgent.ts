// ============================================================
// motoflowPrintAgent.ts
// ============================================================
// Cliente para el Motoflow Print Agent (reemplazo de QZ Tray).
// Habla con un servicio HTTP local en http://127.0.0.1:9123
//
// El agente debe estar instalado y corriendo en la PC.
// Si no está disponible, las funciones lanzan error con flag
// `agentNotAvailable: true` para que el caller pueda fallback a QZ Tray.
// ============================================================

const AGENT_URL = 'http://127.0.0.1:9123';
const AGENT_PRINTERS_TIMEOUT = 5000;
const AGENT_TIMEOUT = 800; // ms — el agente es local, debería responder en <50ms

export interface AgentPrinter {
    name: string;
    status: number;
    isDefault: boolean;
    driver?: string;
    portName?: string;
}

class AgentNotAvailableError extends Error {
    agentNotAvailable = true;
    constructor(message: string) {
        super(message);
        this.name = 'AgentNotAvailableError';
    }
}

let availabilityCache: { ts: number; available: boolean } | null = null;
const CACHE_MS = 5000; // ré-verificar cada 5s

/**
 * Verifica si el agente está corriendo. Cachea el resultado por 5 segundos
 * para evitar fetch en cada operación.
 */
export async function agentIsAvailable(): Promise<boolean> {
    if (availabilityCache && Date.now() - availabilityCache.ts < CACHE_MS) {
        return availabilityCache.available;
    }
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), AGENT_TIMEOUT);
        const r = await fetch(`${AGENT_URL}/health`, { signal: ctrl.signal });
        clearTimeout(timer);
        const ok = r.ok;
        availabilityCache = { ts: Date.now(), available: ok };
        return ok;
    } catch (_) {
        availabilityCache = { ts: Date.now(), available: false };
        return false;
    }
}

/**
 * Lista todas las impresoras instaladas en Windows.
 */
export async function agentListPrinters(): Promise<AgentPrinter[]> {
    if (!(await agentIsAvailable())) {
        throw new AgentNotAvailableError('Motoflow Print Agent no detectado en 127.0.0.1:9123');
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AGENT_PRINTERS_TIMEOUT);
    try {
        const r = await fetch(`${AGENT_URL}/printers`, { signal: ctrl.signal });
        if (!r.ok) throw new Error(`Agent /printers HTTP ${r.status}`);
        return await r.json();
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Imprime bytes RAW (ESC/POS, EPL2, ZPL) a la impresora especificada.
 *
 * @param printerName Nombre exacto (como aparece en Windows)
 * @param data Cadena con los bytes (usar binary encoding o base64)
 * @param opts.format Etiqueta opcional: "escpos" | "epl" | "zpl"
 * @param opts.encoding "binary" (default) o "base64" si data está codificado
 */
export async function agentPrintRaw(
    printerName: string,
    data: string,
    opts: { format?: 'escpos' | 'epl' | 'zpl' | 'raw'; encoding?: 'binary' | 'base64' } = {},
): Promise<{ ok: boolean; bytes?: number; error?: string }> {
    if (!(await agentIsAvailable())) {
        throw new AgentNotAvailableError('Motoflow Print Agent no detectado');
    }
    const r = await fetch(`${AGENT_URL}/print/raw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            printer: printerName,
            data,
            format: opts.format || 'raw',
            encoding: opts.encoding || 'binary',
        }),
    });
    const json = await r.json();
    if (!r.ok || !json.ok) {
        throw new Error(json.error || `Agent /print/raw HTTP ${r.status}`);
    }
    return json;
}

/**
 * Wrappers cómodos por tipo de impresora.
 */
export function agentPrintEpl(printerName: string, epl: string) {
    return agentPrintRaw(printerName, epl, { format: 'epl' });
}

export function agentPrintEscPos(printerName: string, escpos: string) {
    return agentPrintRaw(printerName, escpos, { format: 'escpos' });
}

/**
 * Invalida el cache de disponibilidad (útil después de instalar el agente).
 */
export function agentInvalidateCache() {
    availabilityCache = null;
}

export { AgentNotAvailableError };
