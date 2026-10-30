// ============================================================
// printFactura.ts — Convertir factura del POS movil en ticket ESC/POS
// ============================================================
// Toma el objeto factura como lo arma POSScreen y lo manda a la
// impresora Bluetooth. Mantiene el mismo layout visual que el
// preview en pantalla (32 columnas).
// ============================================================
import { printTicket, type TicketLine } from './bluetoothPrinter';

const W = 32; // 58mm impresora térmica estándar
// Para 80mm (576 dots) usar W = 48. La 2C-P80-C dice "Printing width 72mm"
// asi que 48 columnas es seguro. La dejamos como parametro.

const fmt = (n: number) => Number(n || 0).toFixed(2);
// Encabezado del emisor, igual que la web (src/lib/printPOS.js): arriba el
// nombre comercial, debajo la razón social si es distinta (una persona física
// como Morla factura a nombre del dueño y el comprobante tiene que decirlo) y
// el RNC. (30/10/2026) Antes se detectaba la empresa por el NOMBRE: todo lo
// que dijera "CAMINERO" o "MPN" salía como REPUESTOS MORLA y SIN RNC,
// también Caminero Motors, que emite e-CF.
export function encabezadoEmpresa(empresa: any) {
    const e = empresa || {};
    const nombre = String(e.nombre || e.razon_social || 'MotoFlow').trim();
    const rs = String(e.razon_social || '').trim();
    return {
        nombre,
        razonSocial: rs && rs.toUpperCase() !== nombre.toUpperCase() ? rs : '',
        direccion: e.direccion1 || e.direccion || '',
        direccion2: e.direccion2 || '',
        telefono: e.telefono || '',
        rnc: e.rnc || '',
    };
}
// El título del e-CF cabe en una línea del papel de 58 mm.
export const tituloCorto = (t: string, width: number) => (t.length > width ? t.replace('ELECTRONICA', 'ELECT.') : t);

function padLeft(s: string, n: number) { return s.length >= n ? s.slice(0, n) : ' '.repeat(n - s.length) + s; }
function padRight(s: string, n: number) { return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }

function labelVal(label: string, value: string, width: number): string {
    const v = String(value);
    const spaces = Math.max(1, width - label.length - v.length);
    return label + ' '.repeat(spaces) + v;
}

export async function printFacturaPos(f: any, { width = 32 } = {}) {
    const lines: TicketLine[] = [];
    const EMPRESA = encabezadoEmpresa(f?.empresa);

    const fecha = f.fecha instanceof Date ? f.fecha : new Date(f.fecha);
    const fechaStr = fecha.toLocaleDateString('es-DO');
    const horaStr = fecha.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
    const numStr = f.numero
        ? `FT-${String(f.numero).padStart(7, '0').slice(-7)}`
        : `FT-${String(f.id || '0').replace(/[^0-9]/g, '').padStart(7, '0').slice(-7)}`;

    // Header
    lines.push({ type: 'text', text: EMPRESA.nombre, align: 'center', bold: true, double: true });
    if (EMPRESA.razonSocial) lines.push({ type: 'text', text: EMPRESA.razonSocial, align: 'center' });
    if (EMPRESA.direccion) lines.push({ type: 'text', text: EMPRESA.direccion, align: 'center' });
    if (EMPRESA.direccion2) lines.push({ type: 'text', text: EMPRESA.direccion2, align: 'center' });
    if (EMPRESA.telefono) lines.push({ type: 'text', text: `Tel: ${EMPRESA.telefono}`, align: 'center' });
    if (EMPRESA.rnc) lines.push({ type: 'text', text: `RNC: ${EMPRESA.rnc}`, align: 'center' });
    lines.push({ type: 'feed', lines: 1 });
    // e-CF (30/10/2026): título del tipo + e-NCF (+ vencimiento si aplica).
    if (f.ecf) {
        lines.push({ type: 'text', text: tituloCorto(f.ecf.titulo, width), align: 'center', bold: true });
        lines.push({ type: 'text', text: `e-NCF: ${f.ecf.encf}`, align: 'center', bold: true });
        if (f.ecf.fecha_vencimiento) lines.push({ type: 'text', text: `Valida hasta: ${f.ecf.fecha_vencimiento}`, align: 'center' });
    } else {
        lines.push({ type: 'text', text: 'FACTURA', align: 'center', bold: true });
        if (f.ncf) lines.push({ type: 'text', text: `NCF: ${f.ncf}`, align: 'center' });
    }
    if (f.cotizacionNumero) lines.push({ type: 'text', text: `Desde cot. #${f.cotizacionNumero}`, align: 'center' });
    if (f.pedidoNumero) lines.push({ type: 'text', text: `Desde pedido #${f.pedidoNumero}`, align: 'center' });
    lines.push({ type: 'sep' });

    // Datos
    lines.push({ type: 'text', text: labelVal(`No: ${numStr}`, horaStr, width) });
    lines.push({ type: 'text', text: `Fecha   : ${fechaStr}` });
    lines.push({ type: 'text', text: `Vence   : CONTADO` });
    lines.push({ type: 'text', text: `Cliente : ${f.cliente || 'CLIENTE GENERICO'}` });
    if (f.clienteRnc) lines.push({ type: 'text', text: `RNC/Ced : ${f.clienteRnc}` });
    if (f.clienteTel) lines.push({ type: 'text', text: `Tel.    : ${f.clienteTel}` });
    lines.push({ type: 'sep' });

    // Header de columnas
    const CANT_W = 6;
    const PRECIO_W = 8;
    const ITBIS_W = 7;
    const MONTO_W = width - CANT_W - PRECIO_W - ITBIS_W;
    lines.push({
        type: 'text',
        text: padRight('CANT', CANT_W) + padLeft('PRECIO', PRECIO_W) + padLeft('ITBIS', ITBIS_W) + padLeft('MONTO', MONTO_W),
        bold: true,
    });
    lines.push({ type: 'sep' });

    // Items
    let subtotal = 0;
    let itbisTotal = 0;
    for (const it of (f.items || [])) {
        const importe = Number(it.importe) || 0;
        const itbis = Number(it.itbis || 0);
        subtotal += Math.max(0, importe - itbis);
        itbisTotal += itbis;

        // Descripción (puede ocupar 2 líneas si es larga)
        const desc = String(it.descripcion || '').slice(0, width);
        lines.push({ type: 'text', text: desc });

        const cantStr = padRight(`${it.cantidad} ${it.unidad || 'UND'}`, CANT_W);
        const precioStr = padLeft(fmt(it.precio), PRECIO_W);
        const itbisStr = padLeft(fmt(itbis), ITBIS_W);
        const montoStr = padLeft(fmt(importe), MONTO_W);
        lines.push({ type: 'text', text: cantStr + precioStr + itbisStr + montoStr });
    }

    lines.push({ type: 'sep' });

    // Totales
    const total = Number(f.total ?? (subtotal + itbisTotal));
    lines.push({ type: 'text', text: labelVal('Subtotal', `RD$ ${fmt(subtotal)}`, width) });
    if (itbisTotal > 0) {
        lines.push({ type: 'text', text: labelVal('ITBIS', `RD$ ${fmt(itbisTotal)}`, width) });
    }
    lines.push({ type: 'text', text: labelVal('TOTAL', `RD$ ${fmt(total)}`, width), bold: true });

    if (f.formaPago) {
        lines.push({ type: 'feed', lines: 1 });
        lines.push({ type: 'text', text: `Pago: ${f.formaPago}`, align: 'center' });
        if (f.efectivo != null) {
            lines.push({ type: 'text', text: labelVal('Efectivo', `RD$ ${fmt(f.efectivo)}`, width) });
        }
        if (f.devuelto != null && Number(f.devuelto) > 0) {
            lines.push({ type: 'text', text: labelVal('Devuelto', `RD$ ${fmt(f.devuelto)}`, width) });
        }
    }

    // Representación impresa del e-CF: QR de consulta DGII + código de
    // seguridad + fecha de firma digital.
    if (f.ecf) {
        lines.push({ type: 'feed', lines: 1 });
        if (f.ecf.qr_url) lines.push({ type: 'qr', data: f.ecf.qr_url, size: width >= 48 ? 6 : 4 });
        if (f.ecf.codigo_seguridad) lines.push({ type: 'text', text: `Codigo de seguridad: ${f.ecf.codigo_seguridad}`, align: 'center' });
        if (f.ecf.fecha_firma) lines.push({ type: 'text', text: `Fecha firma: ${f.ecf.fecha_firma}`, align: 'center' });
    }

    lines.push({ type: 'feed', lines: 1 });
    lines.push({ type: 'text', text: 'GRACIAS POR SU COMPRA', align: 'center', bold: true });
    lines.push({ type: 'text', text: 'www.motoflow.app', align: 'center' });

    await printTicket(lines, { cut: true, width });
}
