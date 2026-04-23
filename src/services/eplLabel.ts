/**
 * Utilitario para convertir datos de producto a comandos EPL2 nativos.
 * Optimizado para Zebra LP 2824 (203 DPI) - Etiqueta 56mm x 50.8mm.
 */

interface EplLabelData {
    descripcion: string;
    codigo: string;
    precio: number | string;
    ubicacion: string;
    includeUb: boolean;
    copies?: number;
    empresaNombre?: string;
}

export function buildEplLabel({
    descripcion,
    codigo,
    precio,
    ubicacion,
    includeUb,
    copies = 1,
    empresaNombre = 'Sistema'
}: EplLabelData) {
    const maxChars = 24;
    const cleanDesc = (descripcion || "").toUpperCase().trim();

    const line1 = cleanDesc.slice(0, maxChars);
    const line2 = cleanDesc.length > maxChars
        ? cleanDesc.slice(maxChars, maxChars * 2)
        : "";

    const epl = [
        "N",
        "q380",
        "Q406,24",
        "",
        `; Empresa en font 3 (mismo grosor que el precio)`,
        `A55,15,0,3,1,1,N,"${empresaNombre}"`,
        "",
        `A55,45,0,2,1,1,N,"${line1}"`,
        `A55,65,0,2,1,1,N,"${line2}"`,
        "",
        `; Barcode SIN texto debajo (human readable OFF)`,
        `B80,90,0,1,2,4,55,N,"${codigo}"`,
        "",
        `; Código escrito SOLO aquí (una sola vez)`,
        `A55,150,0,2,1,1,N,"${codigo}"`,
        "",
        `; Precio alineado con código escrito`,
        `A240,150,0,3,1,1,N,"${precio}"`,
        "",
        `; Ubicación centrada abajo`,
        includeUb ? `A155,180,0,2,1,1,N,"${ubicacion}"` : "",
        "",
        `P${Math.max(1, Math.floor(Number(copies)))}`,
        ""
    ].join("\n");

    console.log("[EPL Generated]:\n", epl);
    return epl;
}
