/**
 * WebUSB Print Service
 * Permite imprimir directamente desde el navegador a impresoras térmicas USB
 * sin necesidad de instalar QZ Tray ni ningún software adicional.
 *
 * Compatible: Chrome 61+, Edge 79+ (Chromium-based)
 * NO compatible: Firefox, Safari
 *
 * Soporta:
 * - ESC/POS (impresoras de recibos: Star TSP143, Epson TM-T20, etc.)
 * - EPL2 (impresoras de etiquetas: Zebra LP 2824, etc.)
 */

// ── Estado global del dispositivo pareado ──
let _receiptDevice = null;
let _labelDevice = null;

// ── Constantes USB para impresoras térmicas ──
// Filtros genéricos para impresoras USB (clase 7 = Printer)
const PRINTER_FILTERS = [
  { classCode: 7 }, // USB Printer Class
];

// Filtros específicos por marca
const RECEIPT_PRINTER_FILTERS = [
  { classCode: 7 },
  { vendorId: 0x0519 }, // Star Micronics
  { vendorId: 0x04B8 }, // Epson
  { vendorId: 0x0DD4 }, // Custom (Italia)
  { vendorId: 0x0FE6 }, // Kontron
  { vendorId: 0x20D1 }, // DIGI
  { vendorId: 0x0416 }, // Winbond (POS printers)
];

const LABEL_PRINTER_FILTERS = [
  { classCode: 7 },
  { vendorId: 0x0A5F }, // Zebra Technologies
  { vendorId: 0x04F9 }, // Brother
  { vendorId: 0x1CBE }, // Luminary Micro (TSC)
];

/**
 * Verifica si el navegador soporta WebUSB
 */
export function isWebUsbSupported() {
  return !!(navigator.usb);
}

/**
 * Obtiene un nombre legible del dispositivo USB
 */
function getDeviceName(device) {
  if (device.productName) return device.productName;
  if (device.manufacturerName) return `${device.manufacturerName} (${device.vendorId.toString(16)})`;
  return `USB Printer (${device.vendorId.toString(16)}:${device.productId.toString(16)})`;
}

/**
 * Busca el endpoint OUT (bulk transfer) de la impresora
 */
function findBulkOutEndpoint(device) {
  for (const config of device.configurations) {
    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        // Buscar en interfaces de clase Printer (7) o Vendor-Specific (255)
        if (alt.interfaceClass === 7 || alt.interfaceClass === 255) {
          for (const ep of alt.endpoints) {
            if (ep.direction === 'out' && ep.type === 'bulk') {
              return {
                interfaceNumber: iface.interfaceNumber,
                endpointNumber: ep.endpointNumber,
                alternateIndex: alt.alternateSetting
              };
            }
          }
        }
      }
    }
  }

  // Fallback: buscar cualquier endpoint OUT bulk
  for (const config of device.configurations) {
    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        for (const ep of alt.endpoints) {
          if (ep.direction === 'out' && ep.type === 'bulk') {
            return {
              interfaceNumber: iface.interfaceNumber,
              endpointNumber: ep.endpointNumber,
              alternateIndex: alt.alternateSetting
            };
          }
        }
      }
    }
  }

  return null;
}

/**
 * Conecta y envía datos raw a un dispositivo USB
 */
async function sendRawToDevice(device, data) {
  try {
    await device.open();

    if (device.configuration === null) {
      await device.selectConfiguration(1);
    }

    const endpoint = findBulkOutEndpoint(device);
    if (!endpoint) {
      throw new Error('No se encontró endpoint de salida en la impresora. La impresora puede no ser compatible con WebUSB.');
    }

    await device.claimInterface(endpoint.interfaceNumber);

    // Convertir string a Uint8Array
    const encoder = new TextEncoder();
    const rawData = encoder.encode(data);

    // Enviar en chunks de 64 bytes (tamaño típico de endpoint bulk)
    const CHUNK_SIZE = 64;
    for (let offset = 0; offset < rawData.length; offset += CHUNK_SIZE) {
      const chunk = rawData.slice(offset, offset + CHUNK_SIZE);
      await device.transferOut(endpoint.endpointNumber, chunk);
    }

    await device.releaseInterface(endpoint.interfaceNumber);
    await device.close();

    return true;
  } catch (err) {
    // Intentar cerrar el dispositivo si quedó abierto
    try { await device.close(); } catch (_) {}
    throw err;
  }
}

// ── Almacenar dispositivos pareados en localStorage ──
const STORAGE_KEY_RECEIPT = 'webusb_receipt_printer';
const STORAGE_KEY_LABEL = 'webusb_label_printer';

function saveDeviceInfo(key, device) {
  if (!device) return;
  localStorage.setItem(key, JSON.stringify({
    vendorId: device.vendorId,
    productId: device.productId,
    name: getDeviceName(device)
  }));
}

function getSavedDeviceInfo(key) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}

/**
 * Intenta reconectar con un dispositivo previamente pareado
 */
async function reconnectDevice(key) {
  if (!isWebUsbSupported()) return null;

  const saved = getSavedDeviceInfo(key);
  if (!saved) return null;

  try {
    const devices = await navigator.usb.getDevices();
    const device = devices.find(d =>
      d.vendorId === saved.vendorId && d.productId === saved.productId
    );
    return device || null;
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════════
// API PÚBLICA - Impresora de Recibos (ESC/POS)
// ════════════════════════════════════════════════════════

/**
 * Solicita al usuario seleccionar una impresora de recibos via WebUSB
 */
export async function webUsbSelectReceiptPrinter() {
  if (!isWebUsbSupported()) {
    throw new Error('WebUSB no disponible. Use Chrome o Edge (versión 61+).');
  }

  try {
    const device = await navigator.usb.requestDevice({
      filters: RECEIPT_PRINTER_FILTERS
    });

    _receiptDevice = device;
    saveDeviceInfo(STORAGE_KEY_RECEIPT, device);

    return {
      name: getDeviceName(device),
      vendorId: device.vendorId,
      productId: device.productId
    };
  } catch (err) {
    if (err.name === 'NotFoundError') {
      throw new Error('No se seleccionó ninguna impresora. Intente de nuevo.');
    }
    throw err;
  }
}

/**
 * Obtiene la impresora de recibos pareada (o reconecta automáticamente)
 */
export async function webUsbGetReceiptPrinter() {
  if (_receiptDevice) return _receiptDevice;

  const device = await reconnectDevice(STORAGE_KEY_RECEIPT);
  if (device) {
    _receiptDevice = device;
    return device;
  }

  return null;
}

/**
 * Envía datos ESC/POS raw a la impresora de recibos
 */
export async function webUsbPrintEscPos(escposData) {
  let device = await webUsbGetReceiptPrinter();

  if (!device) {
    // Solicitar selección si no hay dispositivo pareado
    await webUsbSelectReceiptPrinter();
    device = _receiptDevice;
  }

  if (!device) {
    throw new Error('No hay impresora de recibos configurada. Seleccione una primero.');
  }

  try {
    await sendRawToDevice(device, escposData);
    console.log('[WebUSB] ESC/POS enviado a:', getDeviceName(device));
  } catch (err) {
    // Si falla, limpiar dispositivo cacheado para que pida de nuevo
    _receiptDevice = null;
    throw new Error(`Error enviando a ${getDeviceName(device)}: ${err.message}`);
  }
}

// ════════════════════════════════════════════════════════
// API PÚBLICA - Impresora de Etiquetas (EPL2/ZPL)
// ════════════════════════════════════════════════════════

/**
 * Solicita al usuario seleccionar una impresora de etiquetas via WebUSB
 */
export async function webUsbSelectLabelPrinter() {
  if (!isWebUsbSupported()) {
    throw new Error('WebUSB no disponible. Use Chrome o Edge (versión 61+).');
  }

  try {
    const device = await navigator.usb.requestDevice({
      filters: LABEL_PRINTER_FILTERS
    });

    _labelDevice = device;
    saveDeviceInfo(STORAGE_KEY_LABEL, device);

    return {
      name: getDeviceName(device),
      vendorId: device.vendorId,
      productId: device.productId
    };
  } catch (err) {
    if (err.name === 'NotFoundError') {
      throw new Error('No se seleccionó ninguna impresora. Intente de nuevo.');
    }
    throw err;
  }
}

/**
 * Obtiene la impresora de etiquetas pareada (o reconecta automáticamente)
 */
export async function webUsbGetLabelPrinter() {
  if (_labelDevice) return _labelDevice;

  const device = await reconnectDevice(STORAGE_KEY_LABEL);
  if (device) {
    _labelDevice = device;
    return device;
  }

  return null;
}

/**
 * Envía datos EPL2 raw a la impresora de etiquetas
 */
export async function webUsbPrintEpl(eplData) {
  let device = await webUsbGetLabelPrinter();

  if (!device) {
    await webUsbSelectLabelPrinter();
    device = _labelDevice;
  }

  if (!device) {
    throw new Error('No hay impresora de etiquetas configurada. Seleccione una primero.');
  }

  try {
    await sendRawToDevice(device, eplData);
    console.log('[WebUSB] EPL2 enviado a:', getDeviceName(device));
  } catch (err) {
    _labelDevice = null;
    throw new Error(`Error enviando a ${getDeviceName(device)}: ${err.message}`);
  }
}

// ════════════════════════════════════════════════════════
// API PÚBLICA - Información y gestión
// ════════════════════════════════════════════════════════

/**
 * Obtiene info de las impresoras pareadas
 */
export async function webUsbGetPairedPrinters() {
  if (!isWebUsbSupported()) return { receipt: null, label: null };

  const receipt = await webUsbGetReceiptPrinter();
  const label = await webUsbGetLabelPrinter();

  return {
    receipt: receipt ? {
      name: getDeviceName(receipt),
      vendorId: receipt.vendorId,
      productId: receipt.productId
    } : getSavedDeviceInfo(STORAGE_KEY_RECEIPT),
    label: label ? {
      name: getDeviceName(label),
      vendorId: label.vendorId,
      productId: label.productId
    } : getSavedDeviceInfo(STORAGE_KEY_LABEL)
  };
}

/**
 * Desvincula una impresora (limpia el cache)
 */
export function webUsbForgetPrinter(type = 'receipt') {
  if (type === 'receipt') {
    _receiptDevice = null;
    localStorage.removeItem(STORAGE_KEY_RECEIPT);
  } else {
    _labelDevice = null;
    localStorage.removeItem(STORAGE_KEY_LABEL);
  }
}

/**
 * Desvincula todas las impresoras
 */
export function webUsbForgetAll() {
  webUsbForgetPrinter('receipt');
  webUsbForgetPrinter('label');
}
