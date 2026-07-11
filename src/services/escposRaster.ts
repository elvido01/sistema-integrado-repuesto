// ============================================================
// escposRaster.ts
// ============================================================
// Convierte CUALQUIER plantilla HTML de MotoFlow en algo que el
// Motoflow Print Agent puede imprimir SIN el diálogo del navegador:
//
//   • htmlToEscposRaster(html, widthDots)  → bytes ESC/POS (GS v 0)
//       para impresoras TÉRMICAS (rápido, con corte automático).
//   • htmlToPngBase64(html, widthPx)       → PNG base64 para /print/image
//       (impresoras láser/inkjet carta/A4 vía GDI, fiel al diseño).
//
// La gracia: NO hay que reescribir las 17 plantillas a comandos ESC/POS;
// se renderiza el mismo HTML a imagen y se manda tal cual.
// ============================================================

import { toCanvas } from 'html-to-image';

// Anchos típicos en puntos (dots) a 203 dpi
export const DOTS_80MM = 576; // 72 mm útiles
export const DOTS_58MM = 384; // 48 mm útiles

const ESC = '\x1B';
const GS = '\x1D';

/**
 * Renderiza un string HTML a un <canvas> del ancho pedido (en px).
 * Usa un contenedor oculto fuera de pantalla. 1px = 1 dot para térmica.
 */
async function renderHtmlToCanvas(html: string, widthPx: number): Promise<HTMLCanvasElement> {
    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '-100000px';
    host.style.top = '0';
    host.style.width = `${widthPx}px`;
    host.style.background = '#ffffff';
    // El contenido de las plantillas trae su propio <style>; lo respetamos.
    host.innerHTML = `<div style="width:${widthPx}px;background:#fff;color:#000;">${stripAutoPrint(html)}</div>`;
    document.body.appendChild(host);
    try {
        // Espera a que rendericen fuentes/imágenes embebidas
        if ((document as any).fonts?.ready) { try { await (document as any).fonts.ready; } catch { /* noop */ } }
        await new Promise((r) => setTimeout(r, 30));
        const node = host.firstElementChild as HTMLElement;
        const canvas = await toCanvas(node, {
            backgroundColor: '#ffffff',
            pixelRatio: 1,
            width: widthPx,
            cacheBust: true,
        });
        return canvas;
    } finally {
        document.body.removeChild(host);
    }
}

/** Quita el `onload="window.print()"` para que el render NO dispare el diálogo. */
function stripAutoPrint(html: string): string {
    return html.replace(/onload\s*=\s*(["'])\s*window\.print\(\)\s*\1/gi, '');
}

/**
 * HTML → PNG base64 (sin prefijo data:) para el endpoint /print/image.
 * widthPx: ancho de render. Para carta usar ~816 (8.5in @ 96dpi) o mayor
 * para más nitidez; para térmica usar DOTS_80MM / DOTS_58MM.
 */
export async function htmlToPngBase64(html: string, widthPx: number): Promise<string> {
    const canvas = await renderHtmlToCanvas(html, widthPx);
    const dataUrl = canvas.toDataURL('image/png');
    return dataUrl.replace(/^data:image\/png;base64,/, '');
}

/**
 * HTML → bytes ESC/POS raster (GS v 0) como binary string, con corte final.
 * Para impresoras térmicas. widthDots debe ser múltiplo de 8 (576 u 384).
 */
export async function htmlToEscposRaster(html: string, widthDots: number = DOTS_80MM): Promise<string> {
    const width = Math.floor(widthDots / 8) * 8; // asegura múltiplo de 8
    const canvas = await renderHtmlToCanvas(html, width);
    const ctx = canvas.getContext('2d')!;
    const h = canvas.height;
    const img = ctx.getImageData(0, 0, width, h).data;

    const bytesPerRow = width / 8;
    // Umbral + dithering ligero (Floyd–Steinberg) para grises/logos
    const gray = new Float32Array(width * h);
    for (let i = 0; i < width * h; i++) {
        const r = img[i * 4], g = img[i * 4 + 1], b = img[i * 4 + 2], a = img[i * 4 + 3];
        // fondo transparente = blanco
        const lum = a === 0 ? 255 : 0.299 * r + 0.587 * g + 0.114 * b;
        gray[i] = lum;
    }
    const mono = new Uint8Array(bytesPerRow * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const old = gray[idx];
            const newVal = old < 160 ? 0 : 255; // negro si oscuro
            const err = old - newVal;
            if (newVal === 0) mono[y * bytesPerRow + (x >> 3)] |= (0x80 >> (x & 7));
            // difundir error a vecinos
            if (x + 1 < width) gray[idx + 1] += err * 7 / 16;
            if (y + 1 < h) {
                if (x > 0) gray[idx + width - 1] += err * 3 / 16;
                gray[idx + width] += err * 5 / 16;
                if (x + 1 < width) gray[idx + width + 1] += err * 1 / 16;
            }
        }
    }

    // Ensamblar comandos. GS v 0 tiene límite de alto por bloque (~255*? ),
    // por seguridad partimos en bandas de 128 filas.
    let out = ESC + '@'; // init
    const BAND = 128;
    for (let y0 = 0; y0 < h; y0 += BAND) {
        const rows = Math.min(BAND, h - y0);
        const xL = bytesPerRow & 0xff, xH = (bytesPerRow >> 8) & 0xff;
        const yL = rows & 0xff, yH = (rows >> 8) & 0xff;
        out += GS + 'v' + '0' + '\x00' + String.fromCharCode(xL, xH, yL, yH);
        for (let y = 0; y < rows; y++) {
            const start = (y0 + y) * bytesPerRow;
            for (let b = 0; b < bytesPerRow; b++) out += String.fromCharCode(mono[start + b]);
        }
    }
    out += '\n\n\n\n'; // avance
    out += GS + 'V' + '\x00'; // corte total
    return out;
}
