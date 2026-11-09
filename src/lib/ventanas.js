// =====================================================================
// Ventanas y aluminio (09/11/2026): medidas en pulgadas con fracciones,
// estados del proyecto y ayudas comunes (web y lo que use la app).
// =====================================================================

// "40" · "40.25" · "40 1/4" · "40-1/4" · "40 1 4" (número, numerador y
// denominador separados por espacio, como se escribe en el teclado del
// celular sin buscar la barra). Devuelve pulgadas en decimal o null.
export function leerPulgadas(texto) {
  const t = String(texto ?? '').trim().replace(/,/g, '.').replace(/[″"]/g, '').replace(/\s*-\s*/g, ' ');
  if (!t) return null;
  let m = t.match(/^(\d+(?:\.\d+)?)$/);
  if (m) return Number(m[1]);
  m = t.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/) || t.match(/^(\d+)\s+(\d+)\s+(\d+)$/);
  if (m) {
    const [, ent, num, den] = m.map(Number);
    if (!den || num >= den) return null;
    return ent + num / den;
  }
  m = t.match(/^(\d+)\s*\/\s*(\d+)$/);            // solo fracción: "3/4"
  if (m) {
    const [, num, den] = m.map(Number);
    if (!den || num >= den) return null;
    return num / den;
  }
  return null;
}

// 40.25 → "40 1/4" (a 1/16 más cercano). 40 → "40".
export function pulgadasTexto(valor) {
  const v = Number(valor);
  if (!Number.isFinite(v)) return '';
  let ent = Math.floor(v);
  let n16 = Math.round((v - ent) * 16);
  if (n16 === 16) { ent += 1; n16 = 0; }
  if (!n16) return String(ent);
  let num = n16; let den = 16;
  while (num % 2 === 0) { num /= 2; den /= 2; }
  return `${ent} ${num}/${den}`;
}

// Medida razonable para una ventana o puerta (pulgadas). Fuera de esto:
// "Revise la medida".
export const MEDIDA_MIN = 6;
export const MEDIDA_MAX = 400;
export const medidaRazonable = (v) => v != null && v >= MEDIDA_MIN && v <= MEDIDA_MAX;

export const ESTADOS_PROYECTO = [
  { k: 'sin_medir', t: 'Sin medir', c: 'bg-gray-100 text-gray-700 border-gray-300' },
  { k: 'medido', t: 'Medido', c: 'bg-sky-50 text-sky-700 border-sky-300' },
  { k: 'cotizado', t: 'Cotizado', c: 'bg-amber-50 text-amber-700 border-amber-300' },
  { k: 'aprobado', t: 'Aprobado', c: 'bg-indigo-50 text-indigo-700 border-indigo-300' },
  { k: 'fabricacion', t: 'En fabricación', c: 'bg-orange-50 text-orange-700 border-orange-300' },
  { k: 'instalado', t: 'Instalado', c: 'bg-teal-50 text-teal-700 border-teal-300' },
  { k: 'cobrado', t: 'Cobrado', c: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
  { k: 'cancelado', t: 'Cancelado', c: 'bg-red-50 text-red-700 border-red-300' },
];
export const estadoProyecto = (k) => ESTADOS_PROYECTO.find((e) => e.k === k) || ESTADOS_PROYECTO[0];

export const COLORES_ALUMINIO = ['Blanco', 'Negro', 'Inox', 'Plata', 'Bronce', 'Caoba'];

export const numeroProyecto = (n) => `PRY-${String(n || 0).padStart(4, '0')}`;
