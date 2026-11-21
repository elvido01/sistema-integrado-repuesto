// =====================================================================
// Genera src/styles/modo-oscuro.css (21/11/2026)
// ---------------------------------------------------------------------
// El modo oscuro solo cambiaba las variables de los componentes base (las
// cajas de texto se ponían negras), pero casi todas las pantallas escriben
// sus colores fijos en claro (bg-white, text-gray-700, bg-amber-50…). Eso
// dejaba cajas negras sobre tarjetas blancas y letras invisibles.
// Esta hoja traduce, SOLO bajo .dark, cada color claro a su equivalente
// oscuro, para todas las pantallas a la vez. En modo claro no cambia nada.
// Uso: node scripts/generar-modo-oscuro.mjs   (vuelve a escribir el .css)
// =====================================================================
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Rutas desde la raíz del repo, se corra desde donde se corra.
const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const SRC = `${RAIZ}src`;
const SALIDA = `${SRC}/styles/modo-oscuro.css`;

const NEUTROS = ['gray', 'slate', 'zinc', 'neutral', 'stone'];
// Color 500 (para tintes translúcidos) y 200/300 (para letras) de Tailwind.
const COLORES = {
  red: ['239 68 68', '#fecaca', '#fca5a5'], orange: ['249 115 22', '#fed7aa', '#fdba74'],
  amber: ['245 158 11', '#fde68a', '#fcd34d'], yellow: ['234 179 8', '#fef08a', '#fde047'],
  lime: ['132 204 22', '#d9f99d', '#bef264'], green: ['34 197 94', '#bbf7d0', '#86efac'],
  emerald: ['16 185 129', '#a7f3d0', '#6ee7b7'], teal: ['20 184 166', '#99f6e4', '#5eead4'],
  cyan: ['6 182 212', '#a5f3fc', '#67e8f9'], sky: ['14 165 233', '#bae6fd', '#7dd3fc'],
  blue: ['59 130 246', '#bfdbfe', '#93c5fd'], indigo: ['99 102 241', '#c7d2fe', '#a5b4fc'],
  violet: ['139 92 246', '#ddd6fe', '#c4b5fd'], purple: ['168 85 247', '#e9d5ff', '#d8b4fe'],
  fuchsia: ['217 70 239', '#f5d0fe', '#f0abfc'], pink: ['236 72 153', '#fbcfe8', '#f9a8d4'],
  rose: ['244 63 94', '#fecdd3', '#fda4af'],
};

// Superficies: en claro la página es gris y la tarjeta blanca; en oscuro la
// tarjeta queda un poco más clara que la página.
const SUP = { white: '#1e293b', 50: '#223047', 100: '#172133', 200: '#2c3a52', 300: '#3b4a63' };
const TXT = { black: '#f1f5f9', 950: '#f8fafc', 900: '#f1f5f9', 800: '#e2e8f0', 700: '#dbe3ee', 600: '#cbd5e1', 500: '#9fb0c6', 400: '#8696ad', 300: '#64748b' };
const BRD = { white: '#334155', 50: '#263247', 100: '#2a3649', 200: '#334155', 300: '#41506a', 400: '#52627c' };
const HOVER = '#2f3d55';

const esc = (c) => c.replace(/:/g, '\\:').replace(/\//g, '\\/');
const L = [];
const r = (sel, decl) => L.push(`.dark ${sel} { ${decl} }`);

L.push('/* GENERADO por scripts/generar-modo-oscuro.mjs — no editar a mano. */');
L.push('/* Solo actúa con la clase .dark en <html>; el modo claro no cambia. */');

// Fondos neutros
r('.bg-white', `background-color: ${SUP.white};`);
// Blanco translúcido dentro de filas de color: casi transparente en oscuro (el /10 del encabezado azul se deja).
for (const op of ['20', '30', '40', '50', '60', '70']) r(`.${esc(`bg-white/${op}`)}`, 'background-color: rgb(148 163 184 / 0.06);');
for (const op of ['80', '90', '95']) r(`.${esc(`bg-white/${op}`)}`, `background-color: rgb(30 41 59 / 0.${op === '95' ? '95' : op});`);
for (const n of NEUTROS) for (const t of [50, 100, 200, 300]) {
  r(`.bg-${n}-${t}`, `background-color: ${SUP[t]};`);
  for (const op of ['50', '60', '70', '80', '90', '95']) r(`.${esc(`bg-${n}-${t}/${op}`)}`, `background-color: ${SUP[t]};`);
}
// Letras neutras
r('.text-black', `color: ${TXT.black};`);
for (const n of NEUTROS) for (const t of [300, 400, 500, 600, 700, 800, 900, 950]) r(`.text-${n}-${t}`, `color: ${TXT[t]};`);
// Bordes y divisores neutros
r('.border-white', `border-color: ${BRD.white};`);
for (const n of NEUTROS) for (const t of [50, 100, 200, 300, 400]) {
  r(`.border-${n}-${t}`, `border-color: ${BRD[t]};`);
  r(`.divide-${n}-${t} > :not([hidden]) ~ :not([hidden])`, `border-color: ${BRD[t]};`);
}
// Hover / focus neutros
for (const n of ['white', ...NEUTROS.flatMap((x) => [50, 100, 200].map((t) => `${x}-${t}`))]) {
  r(`.${esc(`hover:bg-${n}`)}:hover`, `background-color: ${HOVER};`);
}
for (const n of NEUTROS) for (const t of [600, 700, 800, 900]) r(`.${esc(`hover:text-${n}-${t}`)}:hover`, `color: ${TXT[t]};`);

// Colores: tintes pálidos → translúcidos; letras oscuras → claras
for (const [c, [rgb, t200, t300]] of Object.entries(COLORES)) {
  const tinte = { 50: 0.10, 100: 0.16, 200: 0.24, 300: 0.32 };
  for (const [t, a] of Object.entries(tinte)) {
    r(`.bg-${c}-${t}`, `background-color: rgb(${rgb} / ${a});`);
    for (const op of ['50', '60', '70', '80']) r(`.${esc(`bg-${c}-${t}/${op}`)}`, `background-color: rgb(${rgb} / ${a});`);
    r(`.${esc(`hover:bg-${c}-${t}`)}:hover`, `background-color: rgb(${rgb} / ${Math.min(a + 0.08, 0.4)});`);
  }
  for (const t of [800, 900, 950]) r(`.text-${c}-${t}`, `color: ${t200};`);
  for (const t of [600, 700]) r(`.text-${c}-${t}`, `color: ${t300};`);
  for (const t of [100, 200, 300]) r(`.border-${c}-${t}`, `border-color: rgb(${rgb} / 0.35);`);
  r(`.border-${c}-400`, `border-color: rgb(${rgb} / 0.55);`);
  for (const t of [700, 800]) r(`.${esc(`hover:text-${c}-${t}`)}:hover`, `color: ${t200};`);
}

// Colores escritos a mano (bg-[#f8f9fa], text-[#333]…): se buscan en el código
// y se oscurecen según su luz. Los oscuros (p. ej. el azul marino) se dejan.
{
  const archivos = [];
  const recorrer = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) recorrer(p); else if (/\.(jsx|js|tsx)$/.test(e.name)) archivos.push(p); } };
  recorrer(SRC);
  const vistos = new Set();
  for (const a of archivos) for (const m of fs.readFileSync(a, 'utf8').matchAll(/\b(bg|text|border)-\[#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\]/g)) vistos.add(`${m[1]}|${m[2].toLowerCase()}`);
  const rgbDe = (h) => { const x = h.length === 3 ? h.split('').map((c) => c + c).join('') : h; return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)); };
  const luz = ([r_, g, b]) => (0.2126 * r_ + 0.7152 * g + 0.0722 * b) / 255;
  const saturado = ([r_, g, b]) => Math.max(r_, g, b) - Math.min(r_, g, b) > 30;
  for (const v of [...vistos].sort()) {
    const [tipo, hex] = v.split('|');
    const rgb = rgbDe(hex); const l = luz(rgb);
    const cls = `.${tipo}-\\[\\#${hex}\\]`;
    if (tipo === 'bg' && l > 0.72) {
      r(cls, saturado(rgb) ? `background-color: rgb(${rgb.join(' ')} / 0.14);` : `background-color: ${SUP[50]};`);
    } else if (tipo === 'text' && l < 0.45) {
      r(cls, `color: ${TXT[700]};`);
    } else if (tipo === 'border' && l > 0.72) {
      r(cls, `border-color: ${BRD[200]};`);
    }
  }
}

// Cajas de texto y listas nativas (sin clase de fondo salían blancas con letra clara)
// Las cajas sin borde y transparentes (p. ej. la fila amarilla de captura) se dejan transparentes.
// Peso cero (:where): cualquier clase de la caja (bg-amber-50 de un aviso, dark:…) gana.
L.push(`.dark :where(input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not(.bg-transparent), select:not(.bg-transparent), textarea:not(.bg-transparent)) { background-color: #0f172a; color: #e2e8f0; border-color: #334155; color-scheme: dark; }`);
L.push(`.dark :where(input:disabled, select:disabled, textarea:disabled, input[readonly]:not(.bg-transparent):not(.cursor-pointer)) { background-color: #172133; color: #9fb0c6; }`);
L.push(`.dark input::placeholder, .dark textarea::placeholder { color: #64748b; }`);
L.push(`.dark input[type=checkbox], .dark input[type=radio] { color-scheme: dark; }`);
// Botones redondos y casillas de los componentes (su borde era azul marino: invisible).
L.push(`.dark [role=radio], .dark [role=checkbox] { border-color: #64748b; color: #93c5fd; }`);
L.push(`.dark option { background-color: #0f172a; color: #e2e8f0; }`);
// Tablas: el encabezado y las filas alternas toman los fondos de arriba;
// las sombras grandes se ven como manchas en oscuro.
L.push(`.dark .shadow-2xl, .dark .shadow-xl, .dark .shadow-lg { box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.5); }`);

fs.mkdirSync(`${SRC}/styles`, { recursive: true });
// :where(.dark) no suma peso: si un componente ya trae su propio color oscuro
// (dark:bg-…), ese gana; esta hoja solo cubre lo que no tiene nada.
fs.writeFileSync(SALIDA, L.map((l) => (l.startsWith('.dark ') ? l.replace(/\.dark /g, ':where(.dark) ') : l)).join('\n') + '\n');
console.log(SALIDA, L.length, 'reglas');
