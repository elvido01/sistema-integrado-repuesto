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

// Orden: generar JSON clientes → cargar clientes → cargar préstamos.
// NOTA: MotoPréstamos Los Naranjos es SOLO financiera; el catálogo de vehículos/
// motos es de CAMINERO MOTORS (tenant aparte). Por eso Fase 2 (vehículos→productos)
// queda FUERA del pipeline de este tenant. Los vehículos ya viven como `garantia`
// en cada préstamo (Fase 3). Ver memoria project_caminero_motoprestalos.
const pasos = [
  // Financiera (MotoPréstamos Los Naranjos) → tenant 766fe3d6
  { desc: 'Fase 1 · extraer clientes',        cmd: 'fase1-clientes.mjs' },
  { desc: 'Fase 1 · cargar clientes',         cmd: `fase1-cargar-clientes.mjs${commit}` },
  { desc: 'Fase 3 · cargar préstamos',        cmd: `fase3-cargar-prestamos.mjs${commit}` },
  // Dealer (Caminero Motors) → tenant b39506c3. Su catálogo vive en la tabla
  // mercancias de scv8_mp_los_naranjos (aunque el archivo tenga otro nombre).
  { desc: 'Caminero · catálogo → dealer',     cmd: `fase-caminero-catalogo.mjs${commit}` },
  { desc: 'Caminero · inventario (kardex)',   cmd: `fase-caminero-inventario.mjs${commit}` },
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
