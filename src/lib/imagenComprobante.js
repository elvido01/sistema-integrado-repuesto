// Fotos de comprobantes (ayudante contable, Fase 2 — 12/11/2026).
// Se achican ANTES de subirlas: una foto de teléfono pesa 3–6 MB y para leer
// un NCF sobran 1600 px. Así cada comprobante ocupa ~200 KB y se pueden
// conservar los 10 años que pide la ley sin llenar el almacenamiento.

export const LADO_MAXIMO = 1600;
export const CALIDAD_JPEG = 0.72;

/** Medidas finales conservando la proporción (nunca agranda). */
export function medidasAchicadas(ancho, alto, max = LADO_MAXIMO) {
  const k = Math.min(1, max / Math.max(ancho || 1, alto || 1));
  return { ancho: Math.max(1, Math.round(ancho * k)), alto: Math.max(1, Math.round(alto * k)) };
}

/** Ruta en el bucket "comprobantes": <empresa>/<año>/<mes>/<id>.jpg */
export function rutaComprobante(tenantId, fecha = new Date(), id = (crypto?.randomUUID?.() || String(Date.now()))) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${tenantId}/${y}/${m}/${id}.jpg`;
}

/** File/Blob de imagen → Blob JPEG achicado. null si el navegador no puede leerla
 * (p. ej. HEIC de iPhone en Chrome): no se sube un archivo que no es JPEG. */
export function achicarFoto(archivo, max = LADO_MAXIMO, calidad = CALIDAD_JPEG) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      try {
        const { ancho, alto } = medidasAchicadas(img.naturalWidth, img.naturalHeight, max);
        const c = document.createElement('canvas');
        c.width = ancho; c.height = alto;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, ancho, alto);   // PNG con transparencia → fondo blanco
        ctx.drawImage(img, 0, 0, ancho, alto);
        c.toBlob((b) => resolve(b || null), 'image/jpeg', calidad);
      } catch { resolve(null); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/** 'YYYY-MM-DD' que además es una fecha real (2026-02-30 no lo es). */
export function fechaValida(f) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(f || ''));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

// Tipo de bienes y servicios del 606 (los que aplican a gastos).
export const TIPOS_GASTO_606 = [
  [2, '02 · Trabajos, suministros y servicios'],
  [1, '01 · Gastos de personal'],
  [3, '03 · Arrendamientos'],
  [4, '04 · Gastos de activos fijos'],
  [5, '05 · Gastos de representación'],
  [6, '06 · Otras deducciones admitidas'],
  [7, '07 · Gastos financieros'],
  [8, '08 · Gastos extraordinarios'],
  [9, '09 · Compras y gastos que forman parte del costo de venta'],
  [10, '10 · Adquisiciones de activos'],
  [11, '11 · Gastos de seguros'],
];
export const FORMAS_PAGO_606 = [['01', 'Efectivo'], ['02', 'Cheque / transferencia'], ['03', 'Tarjeta'], ['04', 'A crédito']];
