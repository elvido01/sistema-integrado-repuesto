// Orquestador — corre TODA la migración desde el respaldo más reciente de E:\COPIAS.
// Idempotente: se puede correr cada vez que haya un respaldo nuevo (upsert, no duplica).
//
//   node scripts/migracion-siif/migrar-todo.mjs          (simula todo, no escribe)
//   node scripts/migracion-siif/migrar-todo.mjs --commit (extrae y carga de verdad)

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const commit = process.argv.includes('--commit') ? ' --commit' : '';

// Orden: generar JSON (clientes, vehículos) → cargar clientes → cargar vehículos → cargar préstamos.
const pasos = [
  { desc: 'Fase 1 · extraer clientes',   cmd: 'fase1-clientes.mjs' },
  { desc: 'Fase 1 · cargar clientes',    cmd: `fase1-cargar-clientes.mjs${commit}` },
  { desc: 'Fase 2 · extraer vehículos',  cmd: 'fase2-vehiculos.mjs' },
  { desc: 'Fase 2 · cargar vehículos',   cmd: `fase2-cargar-vehiculos.mjs${commit}` },
  { desc: 'Fase 3 · cargar préstamos',   cmd: `fase3-cargar-prestamos.mjs${commit}` },
];

console.log(`\n===== MIGRACIÓN SiiF → MotoFlow ${commit ? '(CARGA REAL)' : '(SIMULACIÓN)'} =====`);
const t0 = Date.now();
for (const p of pasos) {
  console.log(`\n──────── ${p.desc} ────────`);
  try {
    execSync(`node "${path.join(__dirname, p.cmd.split(' ')[0])}" ${p.cmd.split(' ').slice(1).join(' ')}`.trim(), { stdio: 'inherit' });
  } catch (e) {
    console.error(`\n❌ Falló: ${p.desc}. Se detiene la migración.`);
    process.exit(1);
  }
}
console.log(`\n✅ Migración completa en ${Math.round((Date.now() - t0) / 1000)}s.`);
