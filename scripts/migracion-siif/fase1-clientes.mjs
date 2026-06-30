// Fase 1 — Clientes de MotoPréstamos Los Naranjos (DRY-RUN).
// Lee el respaldo más reciente de E:\COPIAS, parsea clientes de
// scv8_mp_los_naranjos (+ une los de prestamos_01 por código), los transforma
// al esquema MotoFlow y ESCRIBE SOLO archivos de revisión en ./out.
// NO toca ninguna base de datos.
//
// Uso:  node scripts/migracion-siif/fase1-clientes.mjs ["E:\\COPIAS"]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTable } from './lib/parseDump.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

// --- localizar el respaldo más reciente (carpeta YYYY-MM-DD) ---
function latestBackup(baseDir) {
  const dirs = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
    .map((d) => d.name)
    .sort();
  if (!dirs.length) throw new Error(`No hay carpetas de respaldo en ${baseDir}`);
  return dirs[dirs.length - 1];
}

const baseDir = process.argv[2] || 'E:\\COPIAS';
const fecha = latestBackup(baseDir);
const folder = path.join(baseDir, fecha);
console.log(`Respaldo más reciente: ${fecha}`);

// --- helpers de transformación ---
const s = (v) => (v == null ? '' : String(v).trim());
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const bool01 = (v, def = false) => { if (v == null || v === '') return def; return Number(v) === 1; };

// offset: namespacing del legacy_id por base de origen (scv8 vs prestamos)
// para evitar colisiones (los dos usan espacios de id independientes).
function mapCliente(r, offset = 0) {
  const nombre = [s(r.nombre), s(r.apellido)].filter(Boolean).join(' ').trim();
  return {
    legacy_id: r.id ? Number(r.id) + offset : null,
    codigo: s(r.codigo),
    nombre: nombre || s(r.sobrenombre) || '(SIN NOMBRE)',
    cedula_rnc: s(r.cedula) || s(r.rnc) || s(r.codigo) || null,
    telefono: s(r.telefono) || s(r.celular) || null,
    email: s(r.email) || null,
    direccion: s(r.direccion) || null,
    activo: r.activo == null ? true : Number(r.activo) !== 0,
    autorizar_credito: s(r.autorizar_credito).toUpperCase() === 'S',
    limite_credito: num(r.credito),
    dias_credito: num(r.plazo),
    generar_mora: bool01(r.cargar_mora, true), // gate de mora; default true como el form
    notas: s(r.notas) || null,
  };
}

// --- parseo: scv8 (master) + las 3 bases de préstamos (para no perder clientes) ---
const fileLN = path.join(folder, `scv8_mp_los_naranjos.${fecha}.SQL`);
const ln = await parseTable(fileLN, 'clientes');
console.log(`scv8_mp_los_naranjos.clientes: ${ln.rows.length}`);

// offsets de legacy_id por base de origen (espacios de id independientes)
const PRESTAMOS = [
  { file: `prestamos_01.${fecha}.SQL`, offset: 200000000 },
  { file: `prestamos_02.${fecha}.SQL`, offset: 300000000 },
  { file: `prestamos_05.${fecha}.SQL`, offset: 500000000 },
];

// --- unir por código (prioriza el registro de scv8, más completo) ---
const byCodigo = new Map();
for (const r of ln.rows) { const c = s(r.codigo); if (c) byCodigo.set(c, mapCliente(r, 0)); }
let agregadosDePrestamos = 0;
for (const src of PRESTAMOS) {
  const fp = path.join(folder, src.file);
  if (!fs.existsSync(fp)) continue;
  const pr = await parseTable(fp, 'clientes');
  console.log(`${src.file}.clientes: ${pr.rows.length}`);
  for (const r of pr.rows) {
    const c = s(r.codigo);
    if (c && !byCodigo.has(c)) { byCodigo.set(c, mapCliente(r, src.offset)); agregadosDePrestamos++; }
  }
}

const clientes = [...byCodigo.values()];

// --- métricas de revisión ---
const sinTelefono = clientes.filter((c) => !c.telefono).length;
const sinCedula = clientes.filter((c) => !c.cedula_rnc).length;
const sinNombre = clientes.filter((c) => c.nombre === '(SIN NOMBRE)').length;
const conCredito = clientes.filter((c) => c.autorizar_credito).length;

// --- salidas ---
fs.writeFileSync(path.join(OUT, 'clientes-los-naranjos.json'), JSON.stringify(clientes, null, 2), 'utf8');

const resumen = {
  fecha_respaldo: fecha,
  total_clientes: clientes.length,
  de_scv8_mp_los_naranjos: ln.rows.length,
  extra_solo_en_prestamos: agregadosDePrestamos,
  sin_telefono: sinTelefono,
  sin_cedula: sinCedula,
  sin_nombre: sinNombre,
  con_credito_autorizado: conCredito,
};
fs.writeFileSync(path.join(OUT, 'clientes-los-naranjos.resumen.json'), JSON.stringify(resumen, null, 2), 'utf8');

console.log('\n=== RESUMEN (dry-run, no se escribió en ninguna base) ===');
console.log(resumen);
console.log('\nMuestra de 5 clientes transformados:');
console.log(JSON.stringify(clientes.slice(0, 5), null, 2));
console.log(`\nArchivos generados en: ${OUT}`);
