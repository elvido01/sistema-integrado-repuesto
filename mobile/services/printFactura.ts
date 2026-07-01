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
const REPUESTOS_MORLA_EMPRESA = {
    nombre: 'REPUESTOS MORLA',
    razon_social: 'REPUESTOS MORLA',
    rnc: '',
    direccion1: 'Av. Duarte, esq. Baldemiro Rijo',
    direccion2: 'Higuey, Rep. Dom.',
    telefono: '809-390-5965',
};
const isCamineroHeader = (empresa: any) => {
    const text = `${empresa?.nombre || ''} ${empresa?.razon_social || ''}`.toUpperCase();
    return text.includes('MPN') || text.includes('CAMINERO');
};
const normalizePosEmpresa = (empresa: any) => (
    isCamineroHeader(empresa) ? { ...empresa, ...REPUESTOS_MORLA_EMPRESA } : empresa
);

function padLeft(s: string, n: number) { return s.length >= n ? s.slice(0, n) : ' '.repeat(n - s.length) + s; }
function padRight(s: string, n: number) { return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }

function labelVal(label: string, value: string, width: number): string {
    const v = String(value);
    const spaces = Math.max(1, width - label.length - v.length);
    return label + ' '.repeat(spaces) + v;
}

export async function printFacturaPos(f: any, { width = 32 } = {}) {
    const lines: TicketLine[] = [];
    const empresa = normalizePosEmpresa(f?.empresa || {});
    const EMPRESA = {
        nombre: empresa.razon_social || empresa.nombre || 'MotoFlow',
        direccion: empresa.direccion1 || empresa.direccion || '',
        direccion2: empresa.direccion2 || '',
        telefono: empresa.telefono || '',
        rnc: empresa.rnc || f.rnc || '',
    };

    const fecha = f.fecha instanceof Date ? f.fecha : new Date(f.fecha);
    const fechaStr = fecha.toLocaleDateString('es-DO');
    const horaStr = fecha.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
    const numStr = f.numero
        ? `FT-${String(f.numero).padStart(7, '0').slice(-7)}`
        : `FT-${String(f.id || '0').replace(/[^0-9]/g, '').padStart(7, '0').slice(-7)}`;

    // Header
    lines.push({ type: 'text', text: EMPRESA.nombre, align: 'center', bold: true, double: true });
    if (EMPRESA.direccion) lines.push({ type: 'text', text: EMPRESA.direccion, align: 'center' });
    if (EMPRESA.direccion2) lines.push({ type: 'text', text: EMPRESA.direccion2, align: 'center' });
    if (EMPRESA.telefono) lines.push({ type: 'text', text: `Tel: ${EMPRESA.telefono}`, align: 'center' });
    if (EMPRESA.rnc) lines.push({ type: 'text', text: `RNC: ${EMPRESA.rnc}`, align: 'center' });
    lines.push({ type: 'feed', lines: 1 });
    lines.push({ type: 'text', text: 'FACTURA', align: 'center', bold: true });
    if (f.ncf) lines.push({ type: 'text', text: `NCF: ${f.ncf}`, align: 'center' });
    if (f.cotizacionNumero) lines.push({ type: 'text', text: `Desde cot. #${f.cotizacionNumero}`, align: 'center' });
    if (f.pedidoNumero) lines.push({ type: 'text', text: `Desde pedido #${f.pedidoNumero}`, align: 'center' });
    lines.push({ type: 'sep' });

    // Datos
    lines.push({ type: 'text', text: labelVal(`No: ${numStr}`, horaStr, width) });
    lines.push({ type: 'text', text: `Fecha   : ${fechaStr}` });
    lines.push({ type: 'text', text: `Vence   : CONTADO` });
    lines.push({ type: 'text', text: `Cliente : ${f.cliente || 'CLIENTE GENERICO'}` });
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

    lines.push({ type: 'feed', lines: 1 });
    lines.push({ type: 'text', text: 'GRACIAS POR SU COMPRA', align: 'center', bold: true });
    lines.push({ type: 'text', text: 'www.motoflow.app', align: 'center' });

    await printTicket(lines, { cut: true, width });
}
