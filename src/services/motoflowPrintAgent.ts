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
const AGENT_PRINT_TIMEOUT = 30000;
// El agente es local y responde en <50ms, pero mientras imprime puede tardar
// más en atender el /health. Con 800 ms una impresión en curso bastaba para
// que la pantalla lo diera por apagado.
const AGENT_TIMEOUT = 2500;

export interface AgentPrinter {
    name: string;
    status: number;
    isDefault: boolean;
    driver?: string;
    portName?: string;
}

export interface AgentJob {
    jobID: string;
    printer: string;
    bytes: number;
    status: 'queued' | 'printing' | 'complete' | 'failed';
    ok: boolean | null;
    error?: string | null;
    createdAt: string;
    startedAt?: string | null;
    finishedAt?: string | null;
    windowsBytes?: number;
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
// Un "sí" se puede reusar 5s sin riesgo; un "no" se reintenta enseguida,
// porque suele venir de un tropiezo (el agente ocupado, recién encendido) y
// quedarse pegado hace que el sistema lo dé por ausente estando presente.
const CACHE_MS_NEGATIVO = 1000;

/**
 * Verifica si el agente está corriendo. Cachea el resultado por 5 segundos
 * para evitar fetch en cada operación.
 */
export async function agentIsAvailable(): Promise<boolean> {
    const ttl = availabilityCache?.available ? CACHE_MS : CACHE_MS_NEGATIVO;
    if (availabilityCache && Date.now() - availabilityCache.ts < ttl) {
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
    const payloadData = opts.encoding === 'base64' ? data : binaryStringToBase64(data);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AGENT_PRINT_TIMEOUT);

    try {
        const r = await fetch(`${AGENT_URL}/print/raw`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: ctrl.signal,
            body: JSON.stringify({
                printer: printerName,
                data: payloadData,
                format: opts.format || 'raw',
                encoding: 'base64',
            }),
        });
        const json = await r.json();
        if (!r.ok || !json.ok) {
            throw new Error(json.error || `Agent /print/raw HTTP ${r.status}`);
        }
        return json;
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            throw new Error('Motoflow Print Agent no respondio a tiempo al imprimir.');
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

function binaryStringToBase64(data: string): string {
    const bytes = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i) & 0xff;

    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
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
 * Imprime un PNG (base64, sin prefijo) via GDI en cualquier impresora Windows,
 * SIN diálogo. widthMM = ancho del papel térmico (ej. 72); 0 = hoja completa
 * (carta/A4). Requiere agente v0.7+.
 */
export async function agentPrintImage(
    printerName: string,
    pngBase64: string,
    opts: { widthMM?: number; copies?: number } = {},
): Promise<{ ok: boolean; bytes?: number; error?: string }> {
    if (!(await agentIsAvailable())) {
        throw new AgentNotAvailableError('Motoflow Print Agent no detectado');
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AGENT_PRINT_TIMEOUT);
    try {
        const r = await fetch(`${AGENT_URL}/print/image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: ctrl.signal,
            body: JSON.stringify({
                printer: printerName,
                data: pngBase64,
                widthMM: opts.widthMM || 0,
                copies: opts.copies || 1,
            }),
        });
        const json = await r.json();
        if (!r.ok || !json.ok) throw new Error(json.error || `Agent /print/image HTTP ${r.status}`);
        return json;
    } catch (err: any) {
        if (err?.name === 'AbortError') throw new Error('Motoflow Print Agent no respondió al imprimir la imagen.');
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Stats del agente (uptime, prints OK/fallidos, ultimo error, etc.)
 * Util para mostrar estado en UI de configuración.
 */
export async function agentGetHealth(): Promise<any | null> {
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), AGENT_TIMEOUT);
        const r = await fetch(`${AGENT_URL}/health`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!r.ok) return null;
        return await r.json();
    } catch (_) {
        return null;
    }
}

export async function agentGetPrinterStatus(printerName?: string): Promise<any[]> {
    if (!(await agentIsAvailable())) {
        throw new AgentNotAvailableError('Motoflow Print Agent no detectado');
    }
    const qs = printerName ? `?printer=${encodeURIComponent(printerName)}` : '';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AGENT_PRINTERS_TIMEOUT);
    try {
        const r = await fetch(`${AGENT_URL}/printers/status${qs}`, { signal: ctrl.signal });
        const json = await r.json();
        if (!r.ok || !json.ok) throw new Error(json.error || `Agent /printers/status HTTP ${r.status}`);
        return json.printers || [];
    } finally {
        clearTimeout(timer);
    }
}

export async function agentGetJobs(): Promise<AgentJob[]> {
    if (!(await agentIsAvailable())) {
        throw new AgentNotAvailableError('Motoflow Print Agent no detectado');
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AGENT_TIMEOUT);
    try {
        const r = await fetch(`${AGENT_URL}/jobs`, { signal: ctrl.signal });
        const json = await r.json();
        if (!r.ok || !json.ok) throw new Error(json.error || `Agent /jobs HTTP ${r.status}`);
        return json.jobs || [];
    } finally {
        clearTimeout(timer);
    }
}

export async function agentGetJob(jobID: string): Promise<AgentJob | null> {
    if (!(await agentIsAvailable())) {
        throw new AgentNotAvailableError('Motoflow Print Agent no detectado');
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AGENT_TIMEOUT);
    try {
        const r = await fetch(`${AGENT_URL}/jobs/${encodeURIComponent(jobID)}`, { signal: ctrl.signal });
        if (r.status === 404) return null;
        const json = await r.json();
        if (!r.ok || !json.ok) throw new Error(json.error || `Agent /jobs/${jobID} HTTP ${r.status}`);
        return json.job || null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Reinicia el servicio "Print Spooler" de Windows. Resuelve el 90% de
 * los casos donde la impresion se cuelga despues de muchos trabajos
 * sin necesidad de reiniciar la PC.
 * Puede requerir admin si el agente no corre como admin.
 */
export async function agentRestartSpooler(): Promise<{ ok: boolean; message?: string; error?: string; hint?: string }> {
    if (!(await agentIsAvailable())) {
        throw new AgentNotAvailableError('Motoflow Print Agent no detectado');
    }
    const r = await fetch(`${AGENT_URL}/spooler/restart`, { method: 'POST' });
    const json = await r.json();
    if (!r.ok || !json.ok) {
        return { ok: false, error: json.error || `HTTP ${r.status}`, hint: json.hint };
    }
    return json;
}

export async function agentClearStalePrintJobs(
    olderThanMinutes = 30,
    printerName?: string,
): Promise<{ ok: boolean; olderThanMinutes?: number; removed?: any[]; failed?: any[]; error?: string; hint?: string }> {
    if (!(await agentIsAvailable())) {
        throw new AgentNotAvailableError('Motoflow Print Agent no detectado');
    }
    const r = await fetch(`${AGENT_URL}/spooler/clear-stale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            olderThanMinutes,
            printer: printerName || '',
        }),
    });
    const json = await r.json();
    if (!r.ok && r.status !== 207) {
        return { ok: false, error: json.error || `HTTP ${r.status}`, hint: json.hint };
    }
    return json;
}

/**
 * Reinicia el agente. Si esta corriendo con start.bat (wrapper),
 * el wrapper lo relanza automaticamente. Si no, hay que reabrirlo manual.
 */
export async function agentRestartSelf(): Promise<{ ok: boolean; message?: string; error?: string }> {
    if (!(await agentIsAvailable())) {
        throw new AgentNotAvailableError('Motoflow Print Agent no detectado');
    }
    try {
        const r = await fetch(`${AGENT_URL}/restart-self`, { method: 'POST' });
        const json = await r.json();
        // Limpiamos el cache para que la proxima llamada a agentIsAvailable
        // verifique de verdad si volvio a estar arriba.
        availabilityCache = null;
        return json;
    } catch (e: any) {
        availabilityCache = null;
        return { ok: false, error: e?.message || 'Error desconocido' };
    }
}

/**
 * Invalida el cache de disponibilidad (útil después de instalar el agente).
 */
export function agentInvalidateCache() {
    availabilityCache = null;
}

export { AgentNotAvailableError };
