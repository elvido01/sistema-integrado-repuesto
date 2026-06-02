// ============================================================
// bluetoothPrinter.ts — Impresion Bluetooth (BLE) ESC/POS
// ============================================================
// Soporta impresoras termicas estilo 2C-P80-C (2connet), MTP-3,
// generic-pos-80mm y similares que hablan ESC/POS sobre BLE.
//
// Funciones:
//   - scanForPrinters()  -> busca y devuelve dispositivos cercanos
//   - connect(deviceId)  -> conecta y descubre el characteristic de escritura
//   - printText(text)    -> envia bytes ESC/POS (UTF-8 + CP437)
//   - printTicket(opts)  -> ticket formateado con header/items/totales
//   - disconnect()       -> cierra la conexion
//
// IMPORTANTE — requiere instalar 2 paquetes y hacer Development Build:
//   npx expo install react-native-ble-plx
//   npx expo install @config-plugins/react-native-ble-plx
// Luego agregar en app.json (plugins):
//   "@config-plugins/react-native-ble-plx"
//
// Y crear el dev build:
//   npx expo prebuild
//   npx expo run:android   (o eas build --profile development)
// ============================================================
import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Lazy-import para que la app no rompa si la lib no esta instalada todavia.
// Cuando se instale react-native-ble-plx, este modulo se enciende solo.
let BleManager: any = null;
let bleAvailable = false;
async function loadBleLib() {
    if (BleManager) return BleManager;
    try {
        const mod = await import('react-native-ble-plx');
        BleManager = mod.BleManager;
        bleAvailable = true;
        return BleManager;
    } catch (e) {
        bleAvailable = false;
        throw new Error('Falta instalar react-native-ble-plx. Corre: npx expo install react-native-ble-plx');
    }
}

// Service UUIDs comunes de impresoras termicas ESC/POS BLE.
// La 2C-P80-C suele exponer el FFE0/FFE1 (Nordic UART o serial-over-BLE).
const PRINTER_SERVICE_UUIDS = [
    '0000ff00-0000-1000-8000-00805f9b34fb', // serie comun en chinas
    '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / nordic serial
    '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC printer
    '000018f0-0000-1000-8000-00805f9b34fb', // gprinter / xprinter
];

// Characteristics de escritura (donde se envian los bytes ESC/POS)
const PRINTER_WRITE_CHARACTERISTICS = [
    '0000ff02-0000-1000-8000-00805f9b34fb',
    '0000ffe1-0000-1000-8000-00805f9b34fb',
    '49535343-8841-43f4-a8d4-ecbe34729bb3',
    '00002af1-0000-1000-8000-00805f9b34fb',
];

const STORAGE_KEY = 'motoflow:printer:selected';

// ── ESC/POS commands ──────────────────────────────────────
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export const PosCommands = {
    INIT: [ESC, 0x40],                    // ESC @
    ALIGN_LEFT: [ESC, 0x61, 0x00],        // ESC a 0
    ALIGN_CENTER: [ESC, 0x61, 0x01],      // ESC a 1
    ALIGN_RIGHT: [ESC, 0x61, 0x02],       // ESC a 2
    BOLD_ON: [ESC, 0x45, 0x01],
    BOLD_OFF: [ESC, 0x45, 0x00],
    DOUBLE_HEIGHT_ON: [ESC, 0x21, 0x10],
    DOUBLE_HEIGHT_OFF: [ESC, 0x21, 0x00],
    CUT: [GS, 0x56, 0x00],                // corte total
    PARTIAL_CUT: [GS, 0x56, 0x01],
    FEED: (n: number) => [ESC, 0x64, n],  // alimentar n lineas
    NEWLINE: [LF],
};

// ── Estado global ──────────────────────────────────────
type ConnState = {
    manager: any | null;
    device: any | null;
    writeService: string | null;
    writeChar: string | null;
};
const conn: ConnState = { manager: null, device: null, writeService: null, writeChar: null };

async function getManager() {
    if (conn.manager) return conn.manager;
    await loadBleLib();
    conn.manager = new BleManager();
    return conn.manager;
}

// ── Permisos Android ──────────────────────────────────────
async function ensurePermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    const SDK = Platform.Version as number;
    try {
        if (SDK >= 31) {
            const r = await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            ]);
            return Object.values(r).every(v => v === 'granted');
        }
        const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        return r === 'granted';
    } catch { return false; }
}

// ── Escanear ──────────────────────────────────────
export type DiscoveredPrinter = {
    id: string;
    name: string | null;
    rssi: number | null;
};

export async function scanForPrinters(durationMs = 6000): Promise<DiscoveredPrinter[]> {
    const ok = await ensurePermissions();
    if (!ok) throw new Error('Faltan permisos de Bluetooth/Ubicacion');
    const manager = await getManager();
    const found = new Map<string, DiscoveredPrinter>();

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            manager.stopDeviceScan();
            resolve(Array.from(found.values()).sort((a, b) => (b.rssi || -999) - (a.rssi || -999)));
        }, durationMs);

        manager.startDeviceScan(null, { allowDuplicates: false }, (err: any, device: any) => {
            if (err) {
                clearTimeout(timer);
                manager.stopDeviceScan();
                reject(err);
                return;
            }
            if (!device) return;
            // Filtramos por nombre tipico de impresora: empieza por "Printer", "POS", "BT", "MTP", o tiene servicio conocido
            const name = (device.name || device.localName || '').toString();
            const looksLikePrinter = /printer|p80|p58|pos|bt\-|mtp|escpos|xprinter|gprinter|2connet/i.test(name);
            if (name && (looksLikePrinter || found.size < 30)) {
                found.set(device.id, { id: device.id, name: name || null, rssi: device.rssi });
            }
        });
    });
}

// ── Conectar ──────────────────────────────────────
export async function connect(deviceId: string): Promise<void> {
    const manager = await getManager();
    const ok = await ensurePermissions();
    if (!ok) throw new Error('Faltan permisos de Bluetooth');

    const device = await manager.connectToDevice(deviceId, { requestMTU: 256 });
    await device.discoverAllServicesAndCharacteristics();

    // Buscar el characteristic de escritura
    const services = await device.services();
    let writeService: string | null = null;
    let writeChar: string | null = null;

    for (const svc of services) {
        const chars = await svc.characteristics();
        for (const c of chars) {
            const props = c.properties || c;
            const isWritable = c.isWritableWithoutResponse || c.isWritableWithResponse || c.writableWithoutResponse || c.writableWithResponse;
            if (isWritable) {
                // Preferir characteristics conocidos
                if (PRINTER_WRITE_CHARACTERISTICS.includes(c.uuid.toLowerCase())) {
                    writeService = svc.uuid;
                    writeChar = c.uuid;
                    break;
                }
                if (!writeChar) {
                    writeService = svc.uuid;
                    writeChar = c.uuid;
                }
            }
        }
        if (writeService && PRINTER_WRITE_CHARACTERISTICS.includes(writeChar?.toLowerCase() || '')) break;
    }

    if (!writeService || !writeChar) {
        throw new Error('La impresora no expone characteristic de escritura ESC/POS');
    }

    conn.device = device;
    conn.writeService = writeService;
    conn.writeChar = writeChar;

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ id: deviceId, name: device.name || null }));
}

export async function getSavedPrinter(): Promise<{ id: string; name: string | null } | null> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

export async function forgetPrinter(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEY);
    await disconnect();
}

export async function isConnected(): Promise<boolean> {
    if (!conn.device) return false;
    try { return await conn.device.isConnected(); } catch { return false; }
}

export async function ensureConnected(): Promise<void> {
    if (await isConnected()) return;
    const saved = await getSavedPrinter();
    if (!saved) throw new Error('No hay impresora guardada. Configura una primero.');
    await connect(saved.id);
}

// ── Enviar bytes ──────────────────────────────────────
function bytesToBase64(bytes: number[]): string {
    // base64 sin Buffer (compatible con RN)
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let str = '';
    let i = 0;
    while (i < bytes.length) {
        const b1 = bytes[i++] || 0;
        const b2 = bytes[i++] || 0;
        const b3 = bytes[i++] || 0;
        const enc1 = b1 >> 2;
        const enc2 = ((b1 & 3) << 4) | (b2 >> 4);
        const enc3 = ((b2 & 15) << 2) | (b3 >> 6);
        const enc4 = b3 & 63;
        str += chars.charAt(enc1) + chars.charAt(enc2);
        str += i - 1 > bytes.length ? '=' : chars.charAt(enc3);
        str += i > bytes.length ? '=' : chars.charAt(enc4);
    }
    return str;
}

async function writeBytes(bytes: number[]): Promise<void> {
    if (!conn.device || !conn.writeService || !conn.writeChar) {
        throw new Error('Impresora no conectada');
    }
    // BLE tiene un limite de MTU. Mandamos en chunks de 180 bytes (margen seguro).
    const CHUNK = 180;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        const slice = bytes.slice(i, i + CHUNK);
        const b64 = bytesToBase64(slice);
        try {
            await conn.device.writeCharacteristicWithoutResponseForService(conn.writeService, conn.writeChar, b64);
        } catch {
            await conn.device.writeCharacteristicWithResponseForService(conn.writeService, conn.writeChar, b64);
        }
    }
}

// ── API publica de impresion ──────────────────────────────────────

// Convierte string a bytes (CP437 para tildes/ñ). Soporta basico ASCII.
function strToBytes(s: string): number[] {
    const out: number[] = [];
    for (const ch of s) {
        const c = ch.charCodeAt(0);
        if (c < 128) { out.push(c); continue; }
        // Mapeo CP437 para caracteres comunes en espan~ol
        const map: Record<string, number> = {
            'á':0xa0,'é':0x82,'í':0xa1,'ó':0xa2,'ú':0xa3,
            'Á':0xb5,'É':0x90,'Í':0xd6,'Ó':0xe0,'Ú':0xe9,
            'ñ':0xa4,'Ñ':0xa5,
            'ü':0x81,'Ü':0x9a,
            '¿':0xa8,'¡':0xad,'°':0xf8,'°':0xf8,
        };
        out.push(map[ch] ?? 0x3f); // ? si no esta en el map
    }
    return out;
}

export async function printText(text: string, opts: { cut?: boolean; feed?: number } = {}) {
    await ensureConnected();
    const bytes: number[] = [];
    bytes.push(...PosCommands.INIT);
    // CP437 (default), set code page
    bytes.push(ESC, 0x74, 0x00);
    bytes.push(...strToBytes(text));
    if (opts.feed) bytes.push(...PosCommands.FEED(opts.feed));
    else bytes.push(LF, LF, LF, LF);
    if (opts.cut !== false) bytes.push(...PosCommands.CUT);
    await writeBytes(bytes);
}

export type TicketLine =
    | { type: 'text'; text: string; align?: 'left' | 'center' | 'right'; bold?: boolean; double?: boolean }
    | { type: 'sep'; char?: string }
    | { type: 'feed'; lines?: number };

export async function printTicket(lines: TicketLine[], { cut = true, width = 32 } = {}) {
    await ensureConnected();
    const bytes: number[] = [];
    bytes.push(...PosCommands.INIT);
    bytes.push(ESC, 0x74, 0x00);

    for (const l of lines) {
        if (l.type === 'text') {
            if (l.align === 'center') bytes.push(...PosCommands.ALIGN_CENTER);
            else if (l.align === 'right') bytes.push(...PosCommands.ALIGN_RIGHT);
            else bytes.push(...PosCommands.ALIGN_LEFT);
            if (l.bold) bytes.push(...PosCommands.BOLD_ON);
            if (l.double) bytes.push(...PosCommands.DOUBLE_HEIGHT_ON);
            bytes.push(...strToBytes(l.text));
            bytes.push(LF);
            if (l.double) bytes.push(...PosCommands.DOUBLE_HEIGHT_OFF);
            if (l.bold) bytes.push(...PosCommands.BOLD_OFF);
        } else if (l.type === 'sep') {
            bytes.push(...strToBytes((l.char || '-').repeat(width)));
            bytes.push(LF);
        } else if (l.type === 'feed') {
            for (let i = 0; i < (l.lines || 1); i++) bytes.push(LF);
        }
    }

    bytes.push(LF, LF, LF, LF);
    if (cut) bytes.push(...PosCommands.CUT);
    await writeBytes(bytes);
}

// Impresion de prueba — util para validar conexion
export async function printTestPage() {
    await printTicket([
        { type: 'text', text: 'MOTOFLOW', align: 'center', bold: true, double: true },
        { type: 'text', text: 'Prueba de impresion', align: 'center' },
        { type: 'sep' },
        { type: 'text', text: 'Si lees esto, la' },
        { type: 'text', text: 'impresora esta lista.' },
        { type: 'sep' },
        { type: 'text', text: 'OK', align: 'center', bold: true },
        { type: 'feed', lines: 2 },
    ]);
}

export async function disconnect(): Promise<void> {
    if (conn.device) {
        try { await conn.device.cancelConnection(); } catch {}
    }
    conn.device = null;
    conn.writeService = null;
    conn.writeChar = null;
}

export function isLibAvailable(): boolean {
    return bleAvailable;
}
