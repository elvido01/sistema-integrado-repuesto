// Correr un archivo SQL del repo en la base de PRODUCCIÓN (12/11/2026).
//
//   node scripts/correr-sql.mjs sql/archivo.sql
//
// Lo mismo que pegarlo en el SQL Editor de Supabase: va por la API de
// administración con el token local (scripts/secretoLocal.mjs), sin que el
// token aparezca en pantalla. Todo el archivo corre en UNA transacción: si
// una sentencia falla, no queda nada a medias. Imprime lo que devuelva la
// última consulta (las "pruebas" del final de cada archivo).
//
// El dueño pidió (12/11/2026) que los SQL los corra Claude en vez de él.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { leerToken } from './secretoLocal.mjs';

const archivo = process.argv[2];
if (!archivo || !/\.sql$/i.test(archivo)) {
  console.error('Uso: node scripts/correr-sql.mjs sql/archivo.sql');
  process.exit(1);
}
const sql = readFileSync(path.resolve(archivo), 'utf8');
const REF = 'zdvxowpuklbypweyqqki';
const token = leerToken('SUPABASE_ACCESS_TOKEN');

const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `BEGIN;\n${sql}\n;COMMIT;` }),
});
const texto = await r.text();
if (!r.ok) {
  let msg = texto;
  try { msg = JSON.parse(texto).message || texto; } catch { /* texto plano */ }
  console.error(`✖ ${path.basename(archivo)} NO se aplicó (nada quedó a medias):\n${msg}`);
  process.exit(1);
}
console.log(`✔ ${path.basename(archivo)} aplicado en producción.`);
try {
  const filas = JSON.parse(texto);
  if (Array.isArray(filas) && filas.length) console.log(JSON.stringify(filas, null, 1));
} catch { /* sin filas */ }
