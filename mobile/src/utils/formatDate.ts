// Formatea una fecha SOLO para mostrar, en dd/MM/yyyy. No usar para guardar.
// Acepta string ISO ('2026-06-30' o con hora) o Date. Devuelve '' si viene vacía.
// Hace el formateo por texto para 'YYYY-MM-DD' y evitar desfases de zona horaria
// (y la inconsistencia de toLocaleDateString en Hermes/Android).
export function formatFechaDMY(value?: string | Date | null): string {
  if (!value) return '';
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}
