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
    CUT: GS + 'V' + 'A' + '\x00', // Partial cut
    FEED_3: ESC + 'd' + '\x03',
    FEED_5: ESC + 'd' + '\x05',
    LF: '\n',
} as const;

// ── Width: Star TSP143 = 42 chars/line (Font A, 80mm) ──
const W = 42;

// Column widths for item detail rows
const COL_CANT = 8;   // "  1 UND "
const COL_PRECIO = 10;  // "   355.00"
const COL_ITBIS = 8;   // "  54.15"
const COL_MONTO = W - COL_CANT - COL_PRECIO - COL_ITBIS; // 16 remaining

// ── Helpers ──────────────────────────────────────────────
const fmt = (val: number): string =>
    (val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
function buildHeader(): string {
    const lines: string[] = [];
    lines.push(CMD.BOLD_ON + centerLine('REPUESTOS MORLA') + CMD.BOLD_OFF);
    lines.push(centerLine('Av. Duarte, esq. Baldemiro Rijo'));
    lines.push(centerLine('Higuey, Rep. Dom.'));
    lines.push(centerLine('809-390-5965'));
    lines.push('');
    return lines.join(CMD.LF);
}

// ═══════════════════════════════════════════════════════════
// FACTURA
// ═══════════════════════════════════════════════════════════

interface FacturaData {
    numero?: number | string;
    fecha?: string;
    forma_pago?: string;
    dias_credito?: number;
    subtotal?: number;
    descuento?: number;
    itbis?: number;
    total?: number;
    monto_recibido?: number;
    cambio?: number;
    vendedor?: string;
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
    }>;
}

export function buildFacturaEscPos(factura: FacturaData): string {
    const details = factura.facturas_detalle || [];
    const client = factura.clientes || {};
    const seller = factura.perfiles || {};

    const fechaStr = factura.fecha
        ? new Date(factura.fecha).toLocaleDateString('es-DO', { day: 'numeric', month: 'numeric', year: 'numeric' })
        : 'N/A';
    const horaStr = new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: false });
    const numeroStr = `FT-${String(factura.numero || 'N/A').padStart(7, '0')}`;

    // Client name
    const genericIds = ['00000000-0000-0000-0000-000000000000', '2749fa36-3d7c-4bdf-ad61-df88eda8365a'];
    const isGeneric = !client.id || genericIds.includes(client.id) || (client.nombre?.toUpperCase().includes('GENERICO'));
    const clientName = (isGeneric && factura.manual_cliente_nombre)
        ? factura.manual_cliente_nombre.toUpperCase()
        : (client.nombre || 'CLIENTE GENERICO').toUpperCase();

    const vence = factura.forma_pago === 'CREDITO'
        ? `Credito ${factura.dias_credito} dias`
        : 'CONTADO';

    const lines: string[] = [];

    // ── Init + Header ──
    lines.push(CMD.INIT);
    lines.push(buildHeader());
    lines.push(CMD.BOLD_ON + centerLine('FACTURA') + CMD.BOLD_OFF);
    lines.push('');

    // ── Info ──
    lines.push(leftRight(`Numero : ${numeroStr}`, horaStr));
    lines.push(`Fecha  : ${fechaStr}`);
    lines.push(`Vence  : ${CMD.BOLD_ON}${vence}${CMD.BOLD_OFF}`);
    lines.push(`${CMD.BOLD_ON}Cliente : ${clientName}${CMD.BOLD_OFF}`);
    lines.push(`Direccion : ${client.direccion || 'N/A'}`);
    lines.push(`Tel. : ${client.telefono || 'N/A'}`);

    // ── Items Section ──
    lines.push(dashLine());
    lines.push(centerLine('Descripcion de la Mercancia'));
    lines.push(itemRow('CANT.', 'PRECIO', 'ITBIS', 'MONTO'));
    lines.push(dashLine());

    for (const item of details) {
        const desc = (item.descripcion || '').toUpperCase();
        // Description on full line(s)
        for (let i = 0; i < desc.length; i += W) {
            lines.push(CMD.BOLD_ON + desc.slice(i, i + W) + CMD.BOLD_OFF);
        }
        // Detail row
        lines.push(itemRow(
            `  ${item.cantidad || 0} UND`,
            fmt(item.precio || 0),
            fmt(item.itbis || 0),
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
    lines.push(totalsRow('Sub-Total :', fmt(factura.subtotal || 0)));
    lines.push(totalsRow('Descuento en Items:', fmt(factura.descuento || 0)));
    lines.push(totalsRow('Otros Descuento:', fmt(0)));
    lines.push(totalsRow('Recargo :', fmt(0)));
    lines.push(totalsRow('ITBIS :', fmt(factura.itbis || 0)));
    lines.push(padR('Valores en', W - 12) + padL('============', 12));
    lines.push(padR('DOP', 10) + CMD.BOLD_ON + padL('TOTAL :', W - 10 - 12) + padL(fmt(factura.total || 0), 12) + CMD.BOLD_OFF);

    // ── Payment (contado) ──
    if (factura.forma_pago === 'CONTADO') {
        lines.push(dashLine());
        lines.push(totalsRow('PAGADO:', fmt(factura.monto_recibido || 0)));
        lines.push(totalsRow('CAMBIO:', fmt(factura.cambio || 0)));
    }

    // ── Footer ──
    lines.push(dashLine());
    lines.push(`Le Atendio : ${seller?.email?.split('@')[0] || 'N/A'}`);
    lines.push(`Vendedor : ${factura.vendedor || 'REPUESTOS MORLA'}`);
    lines.push(CMD.BOLD_ON + centerLine('*** GRACIAS POR SU COMPRA ***') + CMD.BOLD_OFF);
    lines.push(CMD.FEED_3);
    lines.push(CMD.CUT);

    return lines.join(CMD.LF);
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
    detalles: CotizacionDetalle[]
): string {
    const fechaStr = cotizacion.fecha_cotizacion
        ? new Date(cotizacion.fecha_cotizacion).toLocaleDateString('es-DO', { day: 'numeric', month: 'numeric', year: 'numeric' })
        : 'N/A';
    const horaStr = new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: false });
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
    lines.push(buildHeader());
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
            lines.push(CMD.BOLD_ON + desc.slice(i, i + W) + CMD.BOLD_OFF);
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
    lines.push(totalsRow('Otros Descuento:', fmt(0)));
    lines.push(totalsRow('Recargo :', fmt(0)));
    lines.push(totalsRow('ITBIS :', fmt(itbisTotal)));
    lines.push(padR('Valores en', W - 12) + padL('============', 12));
    lines.push(padR('DOP', 10) + CMD.BOLD_ON + padL('TOTAL :', W - 10 - 12) + padL(fmt(total), 12) + CMD.BOLD_OFF);

    // ── Footer ──
    lines.push(dashLine());
    lines.push(CMD.BOLD_ON + centerLine('*** COTIZACION -- NO ES FACTURA ***') + CMD.BOLD_OFF);
    lines.push(centerLine('Los precios estan sujetos a cambios'));
    lines.push(centerLine('sin previo aviso.'));
    lines.push('');
    lines.push(centerLine('REPUESTOS MORLA'));
    lines.push(CMD.FEED_3);
    lines.push(CMD.CUT);

    return lines.join(CMD.LF);
}
