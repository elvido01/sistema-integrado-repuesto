// (15/10/2026) Montos con separador de miles y 2 decimales: 17118.26 → "17,118.26".
// Mismo locale que formatCurrencyDOP (es-DO), pero sin el "RD$" delante: en la
// pantalla de Ventas el prefijo ya está escrito al lado cuando hace falta.
const formato = new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function montoConComas(valor) {
  const n = Number(valor);
  // "-0.00" no existe: un cambio de -0.0000001 es cero.
  return formato.format(Number.isFinite(n) ? (Math.round(n * 100) / 100 || 0) : 0);
}
