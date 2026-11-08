import QRCode from 'qrcode';
import { importeLineaCompra } from '@/lib/compraLinea';
import { numeroRecibo, NOTA_FISCAL_COLEGIO } from '@/lib/printColegio';
/**
 * ESC/POS command builder for Star TSP143 receipt printer.
 * Generates raw text commands for native printer font output via QZ Tray.
 * 
 * Star TSP143 Font A: 42 chars/line (80mm paper)
 */

// ── ESC/POS control codes ──────────────────────────────
const ESC = '\x1B';
const GS = '\x1D';

const CMD = {
    INIT: ESC + '@',           // Initialize printer
    CENTER: ESC + 'a' + '\x01',  // Center alignment
    LEFT: ESC + 'a' + '\x00',  // Left alignment
    RIGHT: ESC + 'a' + '\x02',  // Right alignment
    BOLD_ON: ESC + 'E' + '\x01',  // Bold on
    BOLD_OFF: ESC + 'E' + '\x00',  // Bold off
    DOUBLE_H: ESC + '!' + '\x10',  // Double height
    NORMAL: ESC + '!' + '\x00',  // Normal size
    CUT: GS + 'V' + '\x00', // Corte total (GS V 0) — el mas compatible; antes
    // GS V A ('A'=0x41) salia impreso como "VA" en algunas impresoras.
    FEED_3: ESC + 'd' + '\x03',
    FEED_5: ESC + 'd' + '\x05',
    LF: '\n',
} as const;

// Los recibos termicos no tienen los acentos en su tabla de caracteres:
// "GENÉRICO" salia con un simbolo raro. Se quitan tildes/ñ y cualquier
// caracter no-ASCII (los codigos de control ESC/POS son < 0x20, se conservan).
const toAscii = (s: string): string =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[¿¡]/g, '')
        .replace(/[^\x00-\x7F]/g, '');

// ── Width: Star TSP143 = 42 chars/line (Font A, 80mm) ──
const W = 42;

// Column widths for item detail rows (07/11/2026: repartidas parejo; antes
// MONTO tenía 16 y PRECIO/ITBIS quedaban apretados a la izquierda)
const COL_CANT = 9;   // "  1 UND "
const COL_PRECIO = 11;  // "   355.00"
const COL_ITBIS = 10;   // "  54.15"
const COL_MONTO = W - COL_CANT - COL_PRECIO - COL_ITBIS; // 12 restantes

// ── Helpers ──────────────────────────────────────────────
const fmt = (val: number): string =>
    (val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const normalizeTaxRate = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

type FacturaDetalle = NonNullable<FacturaData['facturas_detalle']>[number];

const lineItbis = (item: FacturaDetalle): number => {
    const saved = Number(item.itbis || 0);
    if (saved > 0) return saved;

    const rate = normalizeTaxRate(item.productos?.itbis_pct);
    const importe = Number(item.importe || 0);
    if (!rate || importe <= 0) return 0;

    return importe - (importe / (1 + rate));
};

const lineSubtotal = (item: FacturaDetalle): number => Math.max(0, Number(item.importe || 0) - lineItbis(item));

const padR = (s: string, w: number) => s.slice(0, w).padEnd(w);
const padL = (s: string, w: number) => s.slice(0, w).padStart(w);
const dashLine = () => '-'.repeat(W);

/** Center text manually with leading spaces (ESC a is ignored by Star TSP143) */
const centerLine = (text: string) => {
    if (text.length >= W) return text.slice(0, W);
    const pad = Math.floor((W - text.length) / 2);
    return ' '.repeat(pad) + text;
};

/** Join left + right text with space fill */
const leftRight = (left: string, right: string) => {
    const space = W - left.length - right.length;
    return left + ' '.repeat(Math.max(1, space)) + right;
};

const wrapLines = (text: string, width = W): string[] => {
    const words = String(text || '').replace(/\r/g, '').split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';

    for (const word of words) {
        if (word.length > width) {
            if (line) {
                lines.push(line);
                line = '';
            }
            for (let i = 0; i < word.length; i += width) {
                lines.push(word.slice(i, i + width));
            }
            continue;
        }

        const next = line ? `${line} ${word}` : word;
        if (next.length > width) {
            lines.push(line);
            line = word;
        } else {
            line = next;
        }
    }

    if (line) lines.push(line);
    return lines;
};

/** Build an item detail row: CANT  PRECIO  ITBIS  MONTO */
const itemRow = (cant: string, precio: string, itbis: string, monto: string) =>
    padR(cant, COL_CANT) + padL(precio, COL_PRECIO) + padL(itbis, COL_ITBIS) + padL(monto, COL_MONTO);

/** Build a totals row:  "         Label :    value" */
const totalsRow = (label: string, value: string) => {
    const valStr = padL(value, 12);
    const lblStr = padL(label, W - 12);
    return lblStr + valStr;
};

// ── Common Header ────────────────────────────────────────
interface EmpresaConfig {
    nombre?: string;
    direccion?: string;
    ciudad?: string;
    telefono?: string;
    rnc?: string;
}

function buildHeader(empresa?: EmpresaConfig, overrideName?: string): string {
    const lines: string[] = [];
    // (07/11/2026) Sin datos de la empresa no se ponen los de Morla (estaban
    // fijos aquí: la cotización salía "MOTOFLOW" con la dirección de Morla).
    const nombre = (overrideName || empresa?.nombre || 'MotoFlow').toUpperCase();
    lines.push(CMD.BOLD_ON + centerLine(nombre) + CMD.BOLD_OFF);
    if (empresa?.direccion) lines.push(centerLine(empresa.direccion));
    if (empresa?.ciudad) lines.push(centerLine(empresa.ciudad));
    if (empresa?.telefono) lines.push(centerLine(empresa.telefono));
    if (empresa?.rnc) {
        lines.push(centerLine(`RNC: ${empresa.rnc}`));
    }
    lines.push('');
    return toAscii(lines.join(CMD.LF));
}

// ═══════════════════════════════════════════════════════════
// FACTURA
// ═══════════════════════════════════════════════════════════

interface FacturaData {
    numero?: number | string;
    ncf?: string;
    // (10/10/2026) Representación impresa del e-CF (lib/ecfImpresion.js)
    ecf?: {
        encf: string;
        titulo: string;
        codigo_seguridad?: string | null;
        fecha_firma?: string | null;
        fecha_vencimiento?: string | null;
        qr_url?: string | null;
    } | null;
    nombre_emisor_ncf?: string;
    // (27/10/2026) Retenciones del cliente agente de retención y aviso del
    // inmueble (lib/ecfImpresion.js → completarExtras).
    itbis_retenido?: number;
    isr_retenido?: number;
    _tiene_inmueble?: boolean;
    _moneda?: string;
    _tasa?: number;
    _total_rd?: number;
    fecha?: string;
    forma_pago?: string;
    dias_credito?: number;
    subtotal?: number;
    descuento?: number;
    itbis?: number;
    total?: number;
    monto_recibido?: number;
    monto_pendiente?: number;
    cambio?: number;
    vendedor?: string;
    notas?: string;
    manual_cliente_nombre?: string;
    clientes?: {
        id?: string;
        nombre?: string;
        direccion?: string;
        telefono?: string;
    };
    perfiles?: {
        email?: string;
    };
    facturas_detalle?: Array<{
        descripcion?: string;
        cantidad?: number;
        precio?: number;
        itbis?: number;
        importe?: number;
        descuento?: number;
        productos?: {
            itbis_pct?: number | null;
        };
    }>;
}

/**
 * Cómo va el QR del e-CF en el ticket nativo:
 *  'star'   → comando QR del modo Star (ESC GS y). Las Star TSP143 de Morla
 *             trabajan en modo Star: ahí GS ( k y GS v 0 salen como basura
 *             (prueba impresa del 07/11/2026: solo la C salió).
 *  'escpos' → comando QR ESC/POS estándar (GS ( k): Epson, Xprinter…
 *  'raster' → el QR como imagen (GS v 0), lo de antes.
 */
export type ModoQr = 'star' | 'escpos' | 'raster';

export function qrNativo(texto: string, modo: ModoQr = 'raster'): string {
    const b = (n: number) => String.fromCharCode(n & 0xff);
    if (modo === 'star') {
        // Centrado del modo Star (ESC GS a n), modelo 2, corrección M, celda 5
        // (~2.5 cm: lo mínimo legible; con 6 salía de ~3 cm y el dueño lo quiso más chico).
        return ESC + GS + 'a' + b(1)
            + ESC + GS + 'yS0' + b(2) + ESC + GS + 'yS1' + b(1) + ESC + GS + 'yS2' + b(5)
            + ESC + GS + 'yD1' + b(0) + b(texto.length) + b(texto.length >> 8) + texto
            + ESC + GS + 'yP'
            + ESC + GS + 'a' + b(0);
    }
    if (modo === 'escpos') {
        const len = texto.length + 3;
        return CMD.CENTER
            + GS + '(k' + b(4) + b(0) + '1A2' + b(0)
            + GS + '(k' + b(3) + b(0) + '1C' + b(5)
            + GS + '(k' + b(3) + b(0) + '1E1'
            + GS + '(k' + b(len) + b(len >> 8) + '1P0' + texto
            + GS + '(k' + b(3) + b(0) + '1Q0'
            + CMD.LEFT;
    }
    return CMD.CENTER + qrRasterEscPos(texto) + CMD.LEFT;
}

export function buildFacturaEscPos(factura: FacturaData, empresa?: EmpresaConfig, opciones: { qr?: ModoQr } = {}): string {
    const details = factura.facturas_detalle || [];
    const client = factura.clientes || {};
    const formaPago = String(factura.forma_pago || '').toUpperCase();
    const totalItbis = Number(factura.itbis || 0) || details.reduce((sum, item) => sum + lineItbis(item), 0);
    const subtotal = Number(factura.subtotal || 0) || details.reduce((sum, item) => sum + lineSubtotal(item), 0);
    const cambio = factura.cambio != null
        ? Number(factura.cambio || 0)
        : Math.max(0, Number(factura.monto_recibido || 0) - Number(factura.total || 0));

    const fechaStr = factura.fecha
        ? new Date(factura.fecha).toLocaleDateString('es-DO', { day: 'numeric', month: 'numeric', year: 'numeric' })
        : 'N/A';
    // (07/11/2026) Hora de la VENTA (antes salía la hora de imprimir) en
    // 12 horas con AM/PM, hora de RD. Una fecha sin hora usa la de ahora.
    const conHora = typeof factura.fecha === 'string' ? factura.fecha.length > 10 : !!factura.fecha;
    const horaStr = (conHora ? new Date(factura.fecha as string) : new Date())
        .toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Santo_Domingo' });
    const numeroStr = `FT-${String(factura.numero || 'N/A').padStart(7, '0')}`;

    // Client name
    const genericIds = ['00000000-0000-0000-0000-000000000000', '2749fa36-3d7c-4bdf-ad61-df88eda8365a'];
    const isGeneric = !client.id || genericIds.includes(client.id) || (client.nombre?.toUpperCase().includes('GENERICO'));
    const clientName = (isGeneric && factura.manual_cliente_nombre)
        ? factura.manual_cliente_nombre.toUpperCase()
        : (client.nombre || 'CLIENTE GENERICO').toUpperCase();

    const vence = formaPago === 'CREDITO'
        ? `Credito ${factura.dias_credito} dias`
        : 'CONTADO';

    const lines: string[] = [];

    // ── Init + Header ──
    lines.push(CMD.INIT);
    lines.push(buildHeader(empresa, factura.nombre_emisor_ncf));
    const ecf = factura.ecf || null;
    if (ecf) {
        // "FACTURA DE CREDITO FISCAL ELECTRONICA" no cabe en 42: en dos líneas.
        for (const l of wrapLines(ecf.titulo)) lines.push(CMD.BOLD_ON + centerLine(l) + CMD.BOLD_OFF);
    } else {
        lines.push(CMD.BOLD_ON + centerLine('FACTURA') + CMD.BOLD_OFF);
    }
    lines.push('');

    // ── Info ──
    lines.push(leftRight(`Numero : ${numeroStr}`, horaStr));
    if (ecf) {
        lines.push(`e-NCF  : ${CMD.BOLD_ON}${ecf.encf}${CMD.BOLD_OFF}`);
        if (ecf.fecha_vencimiento) lines.push(`Valida hasta: ${ecf.fecha_vencimiento}`);
    } else if (factura.ncf) {
        lines.push(`NCF    : ${CMD.BOLD_ON}${factura.ncf}${CMD.BOLD_OFF}`);
    }
    lines.push(`Fecha  : ${fechaStr}`);
    lines.push(`Vence  : ${CMD.BOLD_ON}${vence}${CMD.BOLD_OFF}`);
    lines.push(`${CMD.BOLD_ON}Cliente : ${clientName}${CMD.BOLD_OFF}`);
    // Sin dirección o teléfono (el cliente genérico) no se gastan líneas en "N/A".
    const conDato = (v: unknown) => { const t = String(v ?? '').trim(); return t && !/^n\/?a$/i.test(t) ? t : ''; };
    if (conDato(client.direccion)) lines.push(`Direccion : ${conDato(client.direccion)}`);
    if (conDato(client.telefono)) lines.push(`Tel. : ${conDato(client.telefono)}`);

    // ── Items Section ──
    lines.push(dashLine());
    lines.push(centerLine('Descripcion de la Mercancia'));
    lines.push(itemRow('CANT.', 'PRECIO', 'ITBIS', 'MONTO'));
    lines.push(dashLine());

    for (const item of details) {
        const desc = (item.descripcion || '').toUpperCase();
        const itemItbis = lineItbis(item);
        // Description on full line(s)
        for (let i = 0; i < desc.length; i += W) {
            lines.push(desc.slice(i, i + W));
        }
        // Detail row
        lines.push(itemRow(
            `  ${item.cantidad || 0} UND`,
            fmt(item.precio || 0),
            fmt(itemItbis),
            fmt(item.importe || 0)
        ));
        // Discount line if applicable
        if ((item.descuento || 0) > 0) {
            lines.push(itemRow(
                '  Desc.',
                '',
                fmt(-(item.descuento || 0) * 0.18),
                fmt(-(item.descuento || 0))
            ));
        }
    }

    // ── Totals ──
    lines.push(dashLine());
    lines.push(totalsRow('Sub-Total :', fmt(subtotal)));
    lines.push(totalsRow('Descuento en Items:', fmt(factura.descuento || 0)));
    lines.push(totalsRow('ITBIS :', fmt(totalItbis)));
    lines.push(padR('Valores en', W - 12) + padL('============', 12));
    lines.push(padR(factura._moneda === 'USD' ? 'USD' : 'DOP', 10) + CMD.BOLD_ON + padL('TOTAL :', W - 10 - 12) + padL(fmt(factura.total || 0), 12) + CMD.BOLD_OFF);
    if (factura._moneda === 'USD' && factura._tasa) {
        lines.push(totalsRow('Tasa RD$ x US$:', fmt(factura._tasa)));
        lines.push(totalsRow('Equivale RD$:', fmt(factura._total_rd || 0)));
    }

    // ── Retenciones (cliente agente de retención): se cobra el neto ──
    const retItbis = Number(factura.itbis_retenido) || 0;
    const retIsr = Number(factura.isr_retenido) || 0;
    if (retItbis + retIsr > 0) {
        if (retItbis > 0) lines.push(totalsRow('ITBIS retenido:', '-' + fmt(retItbis)));
        if (retIsr > 0) lines.push(totalsRow('ISR retenido:', '-' + fmt(retIsr)));
        lines.push(CMD.BOLD_ON + totalsRow('NETO A COBRAR:', fmt((Number(factura.total) || 0) - retItbis - retIsr)) + CMD.BOLD_OFF);
    }
    if (factura._tiene_inmueble) {
        lines.push(dashLine());
        for (const l of wrapLines('Inmueble: no gravado con ITBIS. El 3% de transferencia lo paga el comprador en la DGII dentro de 6 meses.')) lines.push(l);
    }

    // ── Payment ──
    if (formaPago === 'CONTADO') {
        lines.push(dashLine());
        lines.push(totalsRow('PAGADO:', fmt(factura.monto_recibido || 0)));
        lines.push(totalsRow('CAMBIO:', fmt(cambio)));
    } else {
        // Credito: mostrar el abono (si hubo) y el saldo pendiente.
        lines.push(dashLine());
        if ((factura.monto_recibido || 0) > 0) {
            lines.push(totalsRow('ABONO:', fmt(factura.monto_recibido || 0)));
        }
        const pendiente = factura.monto_pendiente != null
            ? factura.monto_pendiente
            : (factura.total || 0) - (factura.monto_recibido || 0);
        lines.push(CMD.BOLD_ON + totalsRow('PENDIENTE:', fmt(pendiente)) + CMD.BOLD_OFF);
    }

    // ── Footer ──
    lines.push(dashLine());
    if (factura.notas) {
        lines.push(CMD.BOLD_ON + 'Notas:' + CMD.BOLD_OFF);
        lines.push(...wrapLines(factura.notas));
        lines.push(dashLine());
    }
    lines.push(`Vendedor : ${factura.vendedor || 'MotoFlow'}`);

    // ── Representación impresa del e-CF: QR + código + fecha de firma ──
    // El QR va como IMAGEN (GS v 0), que es lo que ya usa el sistema para
    // imprimir raster: el comando nativo de QR (GS ( k) no lo tienen todas.
    // Va FUERA de toAscii, que borraría los bytes > 0x7F de la imagen.
    if (ecf && (ecf.qr_url || ecf.codigo_seguridad)) {
        const antes = toAscii(lines.join(CMD.LF)) + CMD.LF + CMD.LF; // aire entre el vendedor y el QR
        const despues: string[] = [];
        if (ecf.codigo_seguridad) despues.push(centerLine(`Codigo de seguridad: ${ecf.codigo_seguridad}`));
        if (ecf.fecha_firma) despues.push(centerLine(`Fecha firma digital: ${ecf.fecha_firma}`));
        despues.push(CMD.BOLD_ON + centerLine('*** GRACIAS POR SU COMPRA ***') + CMD.BOLD_OFF);
        despues.push(CMD.FEED_3);
        despues.push(CMD.CUT);
        return antes
            + (ecf.qr_url ? qrNativo(toAscii(ecf.qr_url), opciones.qr || 'raster') : '') + CMD.LF
            + toAscii(despues.join(CMD.LF));
    }

    lines.push(CMD.BOLD_ON + centerLine('*** GRACIAS POR SU COMPRA ***') + CMD.BOLD_OFF);
    lines.push(CMD.FEED_3);
    lines.push(CMD.CUT);

    return toAscii(lines.join(CMD.LF));
}

/**
 * QR como imagen ESC/POS (GS v 0), en binary string. Cada módulo del QR son
 * `escala` puntos; con margen de 4 módulos (lo que piden los lectores).
 * Un e-CF típico sale en ~45 módulos → ~265 puntos (≈ 33 mm a 203 dpi).
 */
export function qrRasterEscPos(texto: string, escala = 5): string {
    const qr = QRCode.create(texto, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    const margen = 4;
    const lado = (n + margen * 2) * escala;
    const anchoBytes = Math.ceil(lado / 8);
    let datos = '';
    for (let y = 0; y < lado; y++) {
        const fila = Math.floor(y / escala) - margen;
        for (let bx = 0; bx < anchoBytes; bx++) {
            let byte = 0;
            for (let bit = 0; bit < 8; bit++) {
                const x = bx * 8 + bit;
                const col = Math.floor(x / escala) - margen;
                const negro = x < lado && fila >= 0 && fila < n && col >= 0 && col < n && qr.modules.get(fila, col);
                if (negro) byte |= 0x80 >> bit;
            }
            datos += String.fromCharCode(byte);
        }
    }
    return GS + 'v' + '0' + '\x00'
        + String.fromCharCode(anchoBytes & 0xff, (anchoBytes >> 8) & 0xff, lado & 0xff, (lado >> 8) & 0xff)
        + datos;
}

// ═══════════════════════════════════════════════════════════
// COTIZACION
// ═══════════════════════════════════════════════════════════

interface CotizacionData {
    numero?: number | string;
    fecha_cotizacion?: string;
    total_cotizacion?: number;
    cliente_nombre?: string;
    vendedor_nombre?: string;
}

interface CotizacionDetalle {
    descripcion?: string;
    cantidad?: number;
    precio_unitario?: number;
    importe?: number;
    descuento?: number;
    productos?: {
        itbis_pct?: number;
    };
}

export function buildCotizacionEscPos(
    cotizacion: CotizacionData,
    detalles: CotizacionDetalle[],
    empresa?: EmpresaConfig,
): string {
    // Fecha sin hora ("2026-11-06") se toma tal cual: new Date() la corría un día.
    const fc = String(cotizacion.fecha_cotizacion || '');
    const fechaStr = /^\d{4}-\d{2}-\d{2}$/.test(fc)
        ? `${Number(fc.slice(8, 10))}/${Number(fc.slice(5, 7))}/${fc.slice(0, 4)}`
        : fc ? new Date(fc).toLocaleDateString('es-DO', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'America/Santo_Domingo' }) : 'N/A';
    const horaStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Santo_Domingo' });
    const numeroStr = `COT-${String(cotizacion.numero || 'N/A').padStart(7, '0')}`;

    // Calculate totals
    let subtotal = 0;
    let itbisTotal = 0;
    let descuentoItems = 0;
    const itemsCalc = detalles.map(d => {
        const importe = parseFloat(String(d.importe)) || 0;
        const itbisPct = parseFloat(String(d.productos?.itbis_pct)) || 0.18;
        const base = importe / (1 + itbisPct);
        const itbis = importe - base;
        subtotal += base;
        itbisTotal += itbis;
        descuentoItems += parseFloat(String(d.descuento)) || 0;
        return { ...d, _itbis: itbis };
    });
    const total = parseFloat(String(cotizacion.total_cotizacion)) || (subtotal + itbisTotal);

    const lines: string[] = [];

    // ── Init + Header ──
    lines.push(CMD.INIT);
    lines.push(buildHeader(empresa));
    lines.push(CMD.BOLD_ON + centerLine('COTIZACION') + CMD.BOLD_OFF);
    lines.push('');

    // ── Info ──
    lines.push(leftRight(`Numero : ${numeroStr}`, horaStr));
    lines.push(`Fecha  : ${fechaStr}`);
    lines.push(`Vigencia : 15 dias`);
    lines.push(`${CMD.BOLD_ON}Cliente : ${(cotizacion.cliente_nombre || 'CLIENTE GENERICO').toUpperCase()}${CMD.BOLD_OFF}`);
    if (cotizacion.vendedor_nombre) {
        lines.push(`Vendedor : ${cotizacion.vendedor_nombre}`);
    }

    // ── Items Section ──
    lines.push(dashLine());
    lines.push(centerLine('Descripcion de la Mercancia'));
    lines.push(itemRow('CANT.', 'PRECIO', 'ITBIS', 'MONTO'));
    lines.push(dashLine());

    for (const item of itemsCalc) {
        const desc = (item.descripcion || '').toUpperCase();
        for (let i = 0; i < desc.length; i += W) {
            lines.push(desc.slice(i, i + W));
        }
        lines.push(itemRow(
            `  ${item.cantidad || 0} UND`,
            fmt(item.precio_unitario || 0),
            fmt(item._itbis),
            fmt(item.importe || 0)
        ));
    }

    // ── Totals ──
    lines.push(dashLine());
    lines.push(totalsRow('Sub-Total :', fmt(subtotal)));
    lines.push(totalsRow('Descuento en Items:', fmt(descuentoItems)));
    lines.push(totalsRow('ITBIS :', fmt(itbisTotal)));
    lines.push(padR('Valores en', W - 12) + padL('============', 12));
    lines.push(padR('DOP', 10) + CMD.BOLD_ON + padL('TOTAL :', W - 10 - 12) + padL(fmt(total), 12) + CMD.BOLD_OFF);

    // ── Footer ──
    lines.push(dashLine());
    lines.push(CMD.BOLD_ON + centerLine('*** COTIZACION -- NO ES FACTURA ***') + CMD.BOLD_OFF);
    lines.push(centerLine('Los precios estan sujetos a cambios'));
    lines.push(centerLine('sin previo aviso.'));
    lines.push('');
    lines.push(centerLine(String(empresa?.nombre || 'MotoFlow').toUpperCase()));
    lines.push(CMD.FEED_3);
    lines.push(CMD.CUT);

    return toAscii(lines.join(CMD.LF));
}

// ═══════════════════════════════════════════════════════════
// RECIBO DE INGRESO
// ═══════════════════════════════════════════════════════════

interface ReciboIngresoData {
    numero?: number | string;
    fecha?: string;
    clienteNombre?: string;
    balanceAnterior?: number;
    totalPagado?: number;
    balanceActual?: number;
    abonos?: Array<{
        referencia?: string;
        monto_abono?: number;
    }>;
    formasPago?: Array<{
        forma?: string;
        referencia?: string;
        monto?: number;
    }>;
}

export function buildReciboIngresoEscPos(
    recibo: ReciboIngresoData,
    empresa?: EmpresaConfig
): string {
    const fechaStr = recibo.fecha
        ? new Date(recibo.fecha).toLocaleDateString('es-DO', { day: 'numeric', month: 'numeric', year: 'numeric' })
        : 'N/A';
    const horaStr = new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: false });
    const numeroStr = `RI-${String(recibo.numero || 'N/A').padStart(6, '0')}`;

    const lines: string[] = [];

    lines.push(CMD.INIT);
    lines.push(buildHeader(empresa));
    lines.push(CMD.DOUBLE_H);
    lines.push(CMD.BOLD_ON + centerLine('RECIBO DE INGRESO') + CMD.BOLD_OFF);
    lines.push('');

    // ── Info ──
    lines.push(leftRight(`No. Recibo : ${numeroStr}`, horaStr));
    lines.push(`Fecha  : ${fechaStr}`);
    lines.push(`${CMD.BOLD_ON}CLIENTE: ${(recibo.clienteNombre || 'N/A').toUpperCase()}${CMD.BOLD_OFF}`);

    // ── Abonos ──
    lines.push(dashLine());
    lines.push(CMD.BOLD_ON + 'FACTURAS ABONADAS:' + CMD.BOLD_OFF);
    lines.push(leftRight('REFERENCIA', 'ABONO'));
    for (const a of (recibo.abonos || [])) {
        lines.push(leftRight(a.referencia || '---', fmt(a.monto_abono || 0)));
    }

    // ── Formas de pago ──
    lines.push(dashLine());
    lines.push(CMD.BOLD_ON + 'DETALLE DE PAGO:' + CMD.BOLD_OFF);
    for (const f of (recibo.formasPago || [])) {
        const forma = (f.forma || '').toUpperCase();
        const label = f.referencia ? `${forma} (${f.referencia})` : forma;
        lines.push(leftRight(label, fmt(f.monto || 0)));
    }

    // ── Totales ──
    lines.push(dashLine());
    lines.push(totalsRow('Balance Anterior:', fmt(recibo.balanceAnterior || 0)));
    lines.push(CMD.BOLD_ON + totalsRow('TOTAL PAGADO:', fmt(recibo.totalPagado || 0)) + CMD.BOLD_OFF);
    lines.push(CMD.BOLD_ON + totalsRow('Balance Actual:', fmt(recibo.balanceActual || 0)) + CMD.BOLD_OFF);

    // ── Footer ──
    lines.push('');
    lines.push(CMD.BOLD_ON + centerLine('*** GRACIAS POR SU PAGO ***') + CMD.BOLD_OFF);
    lines.push('');
    lines.push('Recibido por: ____________________________');
    lines.push(CMD.NORMAL);
    lines.push(CMD.FEED_3);
    lines.push(CMD.CUT);

    return toAscii(lines.join(CMD.LF));
}

// ═══════════════════════════════════════════════════════════
// COMPRA DE MERCANCÍA (07/11/2026)
// ═══════════════════════════════════════════════════════════
// El mismo ticket de compra de 4"/80mm (printPOS → printCompraPOS), con las
// fuentes de la impresora por el agente, como la factura. Columnas:
// CANT · COSTO · DESC · TOTAL (el total de la línea ya trae el ITBIS).

interface CompraData {
    numero?: string | number;
    fecha?: string;
    created_at?: string;
    ncf?: string | null;
    referencia?: string | null;
    total_exento?: number;
    total_gravado?: number;
    descuento_total?: number;
    itbis_total?: number;
    total_compra?: number;
    forma_pago?: string | null;
    itbis_incluido?: boolean;
}
interface CompraDetalle {
    descripcion?: string;
    cantidad?: number;
    unidad?: string;
    costo_unitario?: number;
    descuento_pct?: number;
    itbis_pct?: number;
    importe?: number;
}

// Total de la línea con ITBIS. Se calcula (no se toma importe): con "ITBIS
// incluido" compras_detalle.importe trae el ITBIS sumado dos veces y las líneas
// no cuadraban con el TOTAL (OC-0393: 12,330.80 contra 10,449.84).
export const totalLineaCompra = (item: CompraDetalle, itbisIncluido = false): number =>
    importeLineaCompra(item, itbisIncluido);

export function buildCompraEscPos(
    compra: CompraData,
    suplidor: { nombre?: string; rnc?: string } | null,
    detalles: CompraDetalle[],
    empresa?: EmpresaConfig,
): string {
    // Fecha de la compra tal cual (es fecha sin hora: new Date() la corría un día).
    const f = String(compra.fecha || '');
    const fechaStr = /^\d{4}-\d{2}-\d{2}/.test(f) ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : 'N/A';
    const horaStr = (compra.created_at ? new Date(compra.created_at) : new Date())
        .toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Santo_Domingo' });
    const conDato = (v: unknown) => { const t = String(v ?? '').trim(); return t && !/^n\/?a$/i.test(t) ? t : ''; };
    const credito = /CR[EÉ]DITO/i.test(String(compra.forma_pago || ''));

    const lines: string[] = [];
    lines.push(CMD.INIT);
    lines.push(buildHeader(empresa));
    lines.push(CMD.BOLD_ON + centerLine('COMPRA DE MERCANCIA') + CMD.BOLD_OFF);
    lines.push('');
    lines.push(leftRight(`Numero : ${compra.numero || 'N/A'}`, horaStr));
    lines.push(`Fecha  : ${fechaStr}`);
    lines.push(`Pago   : ${CMD.BOLD_ON}${credito ? 'CREDITO' : 'CONTADO'}${CMD.BOLD_OFF}`);
    lines.push(`${CMD.BOLD_ON}Suplidor: ${String(suplidor?.nombre || 'N/A').toUpperCase()}${CMD.BOLD_OFF}`);
    if (conDato(suplidor?.rnc)) lines.push(`RNC    : ${conDato(suplidor?.rnc)}`);
    if (conDato(compra.ncf)) lines.push(`NCF    : ${CMD.BOLD_ON}${conDato(compra.ncf)}${CMD.BOLD_OFF}`);
    if (conDato(compra.referencia)) lines.push(`REF    : ${conDato(compra.referencia)}`);

    lines.push(dashLine());
    lines.push(itemRow('CANT.', 'COSTO', 'DESC', 'TOTAL'));
    lines.push(dashLine());
    for (const item of detalles || []) {
        for (const l of wrapLines(String(item.descripcion || '').trim().toUpperCase())) lines.push(l);
        lines.push(itemRow(
            `  ${Number(item.cantidad || 0)} ${item.unidad || 'UND'}`,
            fmt(Number(item.costo_unitario || 0)),
            `${Number(item.descuento_pct || 0)}%`,
            fmt(totalLineaCompra(item, !!compra.itbis_incluido)),
        ));
    }
    lines.push(dashLine());
    if (Number(compra.total_exento || 0) > 0) lines.push(totalsRow('Exento :', fmt(Number(compra.total_exento))));
    lines.push(totalsRow('Gravado :', fmt(Number(compra.total_gravado || 0))));
    if (Number(compra.descuento_total || 0) > 0) lines.push(totalsRow('Descuento :', fmt(Number(compra.descuento_total))));
    lines.push(totalsRow('ITBIS :', fmt(Number(compra.itbis_total || 0))));
    lines.push(padL('==========', W));
    lines.push(CMD.BOLD_ON + totalsRow('TOTAL :', fmt(Number(compra.total_compra || 0))) + CMD.BOLD_OFF);
    lines.push(dashLine());
    lines.push(CMD.BOLD_ON + centerLine('*** COMPRA DE MERCANCIA ***') + CMD.BOLD_OFF);
    if (empresa?.nombre) lines.push(centerLine(String(empresa.nombre)));
    lines.push(CMD.FEED_3);
    lines.push(CMD.CUT);
    return toAscii(lines.join(CMD.LF));
}

// ── Recibo de la Caja del Colegio (08/11/2026) ─────────────────────────────
// Con las letras de la impresora, como la factura de Repuestos Morla (por
// imagen salía muy pequeño). Mismo contenido que reciboColegioTicketHTML.
export interface ReciboColegioData {
    colegio?: EmpresaConfig;
    pago: {
        numero: number; fecha?: string; created_at?: string; total?: number; anulado?: boolean; recibo_ingreso?: string;
        anio_completo?: boolean; tasa_usd?: number; usuario?: string;
        formas_pago?: { forma: string; monto: number; referencia?: string }[];
    };
    familia?: { nombre?: string; madre_nombre?: string; padre_nombre?: string; tutor_nombre?: string };
    anio?: { nombre?: string } | null;
    estudiantes: {
        nombre: string; curso?: string; tanda?: string; pendiente?: number;
        lineas: { descripcion: string; moneda?: string; monto_moneda?: number; monto: number }[];
    }[];
    proximoPago?: string;
}

export function buildReciboColegioEscPos(d: ReciboColegioData): string {
    const p = d.pago;
    const n2 = (v: unknown) => fmt(Number(v || 0));
    // Fila "texto ....... monto": si no cabe, el texto va arriba y el monto solo.
    const fila = (texto: string, monto: string): string[] => {
        const partes = wrapLines(texto.trim() || '(sin descripcion)', W - monto.length - 1);
        return partes.map((t, i) => (i === partes.length - 1 ? leftRight(t, monto) : t));
    };
    const f = String(p.fecha || '');
    const fecha = /^\d{4}-\d{2}-\d{2}/.test(f) ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '';
    const hora = p.created_at
        ? new Date(p.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Santo_Domingo' })
        : '';
    const varios = d.estudiantes.length > 1;
    const pendiente = d.estudiantes.reduce((s, e) => s + Number(e.pendiente || 0), 0);
    const fam = d.familia || {};

    const lines: string[] = [];
    lines.push(CMD.INIT);
    // Cabecera propia: buildHeader corta en 42 y la dirección del colegio es larga.
    const c = d.colegio || {};
    for (const l of wrapLines(String(c.nombre || '').toUpperCase())) lines.push(CMD.BOLD_ON + centerLine(l) + CMD.BOLD_OFF);
    if (c.rnc) lines.push(centerLine(`RNC ${c.rnc}`));
    for (const l of wrapLines(String(c.direccion || ''))) lines.push(centerLine(l));
    if (c.telefono) lines.push(centerLine(`Tel. ${c.telefono}`));
    lines.push(dashLine());
    lines.push(CMD.BOLD_ON + centerLine('RECIBO DE INGRESO') + CMD.BOLD_OFF);
    if (p.anulado) lines.push(CMD.BOLD_ON + centerLine('*** ANULADO ***') + CMD.BOLD_OFF);
    lines.push('');
    lines.push(leftRight('No.', numeroRecibo(p.numero)));
    lines.push(leftRight('Fecha', `${fecha} ${hora}`.trim()));
    if (p.recibo_ingreso) lines.push(...fila('Ref. caja', String(p.recibo_ingreso)));
    lines.push(dashLine());
    for (const e of d.estudiantes) {
        for (const l of wrapLines(`Estudiante: ${e.nombre}`.toUpperCase())) lines.push(CMD.BOLD_ON + l + CMD.BOLD_OFF);
        for (const l of wrapLines(`Curso: ${e.curso || ''}${e.tanda ? ` - ${e.tanda}` : ''}`)) lines.push(l);
    }
    const quien = fam.tutor_nombre || fam.madre_nombre || fam.padre_nombre || fam.nombre || '';
    for (const l of wrapLines(`${fam.tutor_nombre ? 'Tutor' : 'Familia'}: ${quien}`)) lines.push(l);
    lines.push(`Año escolar: ${d.anio?.nombre || ''}`);
    lines.push(dashLine());
    for (const e of d.estudiantes) {
        for (const l of e.lineas) {
            const desc = `${String(l.descripcion || '').trim() || '(sin descripcion)'}${varios ? ` (${e.nombre.split(' ')[0]})` : ''}`;
            lines.push(...fila(desc, l.moneda === 'USD' ? `US$${n2(l.monto_moneda)}` : n2(l.monto)));
        }
    }
    if (p.anio_completo) for (const l of wrapLines('Año completo con descuento en las mensualidades')) lines.push(l);
    lines.push(dashLine());
    lines.push(CMD.BOLD_ON + leftRight('TOTAL RD$', n2(p.total)) + CMD.BOLD_OFF);
    if (p.tasa_usd && d.estudiantes.some((e) => e.lineas.some((l) => l.moneda === 'USD'))) lines.push(`Tasa US$: ${n2(p.tasa_usd)}`);
    for (const fp of (p.formas_pago || []).filter((x) => Number(x.monto) > 0)) {
        lines.push(...fila(`${fp.forma}${fp.referencia ? ` #${fp.referencia}` : ''}`, n2(fp.monto)));
    }
    lines.push(dashLine());
    lines.push(leftRight('Pendiente del año', n2(pendiente)));
    if (d.proximoPago) for (const l of wrapLines(`Próximo pago: ${d.proximoPago}`)) lines.push(l);
    lines.push(dashLine());
    if (p.usuario) for (const l of wrapLines(`Atendido por: ${p.usuario}`)) lines.push(l);
    for (const l of wrapLines(NOTA_FISCAL_COLEGIO)) lines.push(l);
    lines.push('');
    lines.push(centerLine('¡Gracias!'));
    lines.push(CMD.FEED_3);
    lines.push(CMD.CUT);
    return toAscii(lines.join(CMD.LF));
}
