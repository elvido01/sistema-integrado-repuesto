// Fase 2 — Vehículos/mercancías de Los Naranjos → productos (DRY-RUN).
// Parsea mercancias de scv8_mp_los_naranjos, transforma al esquema productos
// y escribe out/vehiculos-los-naranjos.json. No toca la base.
//
// Uso: node scripts/migracion-siif/fase2-vehiculos.mjs ["E:\\COPIAS"]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTable } from './lib/parseDump.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

function latestBackup(baseDir) {
  const dirs = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name)).map((d) => d.name).sort();
  if (!dirs.length) throw new Error(`No hay respaldos en ${baseDir}`);
  return dirs[dirs.length - 1];
}

const baseDir = process.argv[2] || 'E:\\COPIAS';
const fecha = latestBackup(baseDir);
console.log('Respaldo:', fecha);

const s = (v) => (v == null ? '' : String(v).trim());
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function mapProducto(r) {
  const codigo = s(r.codigo);
  const itbisTxt = s(r.itbis);
  return {
    legacy_id: r.id ? Number(r.id) : null,
    codigo,
    referencia: s(r.referencia) || null,
    descripcion: s(r.descripcion) || s(r.nombre) || codigo,
    costo: num(r.costo_1),
    precio: num(r.precio_1),
    itbis_pct: itbisTxt.includes('18') ? 0.18 : 0, // colateral usado: casi siempre exento
    chasis: codigo, // el código en Los Naranjos ES el chasis/VIN
    activo: s(r.activo).toUpperCase() === 'S' || Number(r.activo) === 1,
    min_stock: num(r.minimo),
    max_stock: num(r.maximo),
  };
}

const file = path.join(baseDir, fecha, `scv8_mp_los_naranjos.${fecha}.SQL`);
const { rows } = await parseTable(file, 'mercancias');
console.log('mercancias en dump:', rows.length);

// dedup por código (conserva la primera)
const byCodigo = new Map();
let dupCodigo = 0;
for (const r of rows) {
  const c = s(r.codigo);
  if (!c) continue;
  if (byCodigo.has(c)) { dupCodigo++; continue; }
  byCodigo.set(c, mapProducto(r));
}
const productos = [...byCodigo.values()];

fs.writeFileSync(path.join(OUT, 'vehiculos-los-naranjos.json'), JSON.stringify(productos, null, 2), 'utf8');
const resumen = {
  fecha, total: productos.length, codigos_duplicados_descartados: dupCodigo,
  con_costo: productos.filter((p) => p.costo > 0).length,
  con_precio: productos.filter((p) => p.precio > 0).length,
  activos: productos.filter((p) => p.activo).length,
};
console.log('\n=== RESUMEN (dry-run) ===');
console.log(resumen);
console.log('\nMuestra:');
console.log(JSON.stringify(productos.slice(0, 5), null, 2));
