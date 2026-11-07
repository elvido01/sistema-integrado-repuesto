// =====================================================================
// Conservar los archivos de la publicación anterior (07/11/2026)
// ---------------------------------------------------------------------
// Cada build borra dist/assets y los archivos cambian de nombre. Una
// pestaña abierta desde ANTES de publicar (el sistema nunca se recarga solo,
// a propósito) pide los nombres viejos al imprimir o abrir un panel, y falla:
// "Failed to fetch dynamically imported module …/escposReceipt-xxxx.js".
//
//   node scripts/conservar-assets.mjs guardar    → antes del build
//   node scripts/conservar-assets.mjs restaurar  → después del build
//
// Los archivos viejos vuelven a dist/assets (sin pisar los nuevos) y se
// borran los que tengan más de DIAS días, para que la carpeta no crezca sin fin.
// =====================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIAS = 2;
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(raiz, 'dist', 'assets');
const guardados = path.join(raiz, '.assets-anteriores');
const modo = process.argv[2];

if (modo === 'guardar') {
  fs.rmSync(guardados, { recursive: true, force: true });
  if (fs.existsSync(assets)) fs.cpSync(assets, guardados, { recursive: true, preserveTimestamps: true });
  console.log(`  ✔ Archivos de la publicación anterior guardados (${fs.existsSync(guardados) ? fs.readdirSync(guardados).length : 0}).`);
} else if (modo === 'restaurar') {
  if (!fs.existsSync(guardados)) { console.log('  · No había archivos anteriores que conservar.'); process.exit(0); }
  const limite = Date.now() - DIAS * 86400000;
  let vueltos = 0, viejos = 0;
  for (const nombre of fs.readdirSync(guardados)) {
    const origen = path.join(guardados, nombre);
    const destino = path.join(assets, nombre);
    if (fs.existsSync(destino)) continue;               // el build nuevo manda
    if (fs.statSync(origen).mtimeMs < limite) { viejos++; continue; }
    fs.copyFileSync(origen, destino);
    fs.utimesSync(destino, fs.statSync(origen).atime, fs.statSync(origen).mtime); // conserva la fecha para saber cuándo vence
    vueltos++;
  }
  fs.rmSync(guardados, { recursive: true, force: true });
  console.log(`  ✔ ${vueltos} archivos anteriores conservados para pestañas abiertas (${viejos} de más de ${DIAS} días se descartan).`);
} else {
  console.error('uso: node scripts/conservar-assets.mjs guardar|restaurar');
  process.exit(1);
}
