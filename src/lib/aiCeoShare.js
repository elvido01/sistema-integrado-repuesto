// ============================================================
// aiCeoShare.js — Utilidades para compartir reportes AI CEO
// ============================================================
// Centraliza la generación del mensaje WhatsApp + URL wa.me
// para que tanto el InsightsBanner como el AiReportViewer usen
// el mismo formato.
// ============================================================

const AREA_EMOJI = {
    finanzas:    '💰',
    inventario:  '📦',
    credito:     '💳',
    ventas:      '📈',
    compras:     '🛒',
    marketing:   '📣',
    operaciones: '⚡',
};

/**
 * Construye el mensaje WhatsApp del reporte CEO Principal.
 * Funciona con reportes nuevos (con whatsapp_summary pre-computado)
 * y con reportes viejos (lo arma desde top_acciones).
 */
export function buildAiCeoWhatsAppMessage(report) {
    if (!report) return '';

    // Si el edge function ya lo dejó pre-armado, úsalo
    const preBuilt = report.detalles?.whatsapp_summary;
    if (preBuilt && typeof preBuilt === 'string') return preBuilt;

    // Fallback: generar desde lo que haya en el reporte
    const parsed = report.detalles?.parsed || {};
    const acciones = parsed.top_acciones || [];
    const snapshot = report.detalles?.snapshot;
    const fechaFmt = report.fecha
        ? new Date(report.fecha + 'T00:00:00').toLocaleDateString('es-DO', { weekday: 'long', day: '2-digit', month: 'long' })
        : new Date().toLocaleDateString('es-DO', { weekday: 'long', day: '2-digit', month: 'long' });

    const lines = [
        `📊 *${report.titulo || 'Resumen ejecutivo'}*`,
        '',
        report.resumen || '',
        '',
    ];

    if (acciones.length > 0) {
        lines.push('*Top acciones:*');
        acciones.slice(0, 5).forEach((a, i) => {
            const emoji = AREA_EMOJI[a.area] || '⚡';
            lines.push(`${i + 1}. ${emoji} ${a.accion || ''}`);
        });
        lines.push('');
    }

    if (snapshot?.score != null) {
        lines.push(`📈 Salud del negocio: *${snapshot.score}/100*`);
    }

    lines.push(`_Reporte IA · ${fechaFmt} · MOTOFLOW IA CEO_`);

    return lines.filter((l) => l != null).join('\n');
}

/**
 * URL wa.me lista para abrir con click.
 * Prefiere la pre-computada del edge function, fallback a generar.
 */
export function buildAiCeoWhatsAppUrl(report) {
    if (!report) return null;
    const preBuilt = report.detalles?.whatsapp_url;
    if (preBuilt) return preBuilt;
    const msg = buildAiCeoWhatsAppMessage(report);
    if (!msg) return null;
    return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}
