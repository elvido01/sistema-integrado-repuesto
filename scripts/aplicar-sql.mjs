// Aplicar un archivo de sql/ a PRODUCCION desde la linea de comandos.
//
//   npm run sql sql/interes_no_desaparece_sin_pago.sql
//
// Nacio el 2026-08-17: habia un arreglo urgente de dinero listo y el unico
// camino era copiar y pegar en el editor de Supabase. El script corre el
// archivo, separa la parte de VERIFICACION y te muestra lo que devolvio, que
// es justo lo que uno quiere ver despues de tocar produccion.
//
// >>> EL TOKEN NO VA AQUI <<< Se saca de
// https://supabase.com/dashboard/account/tokens y se pasa por el entorno:
//
//   PowerShell:  $env:SUPABASE_ACCESS_TOKEN = "sbp_..."
//   bash:        export SUPABASE_ACCESS_TOKEN="sbp_..."

import { readFileSync } from 'fs';
import { leerToken } from './secretoLocal.mjs';

const TOKEN = leerToken('SUPABASE_ACCESS_TOKEN');
const PROD = 'zdvxowpuklbypweyqqki';
const archivo = process.argv[2];

if (!archivo) {
  console.error('Uso: node scripts/aplicar-sql.mjs sql/archivo.sql');
  process.exit(1);
}
if (!TOKEN) {
  console.error(`
  Falta SUPABASE_ACCESS_TOKEN. Este script escribe en PRODUCCION.

    $env:SUPABASE_ACCESS_TOKEN = "sbp_..."      (PowerShell)
    export SUPABASE_ACCESS_TOKEN="sbp_..."      (bash)

  Se saca de https://supabase.com/dashboard/account/tokens
  No se guarda en el repo a proposito.
`);
  process.exit(1);
}

const correr = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROD}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(JSON.stringify(d).slice(0, 500));
  return d;
};

// El banner de VERIFICACION parte el archivo: antes va lo que cambia la base,
// despues lo que solo mira. Se corren por separado para que un SELECT de
// comprobacion no quede dentro de la misma transaccion que el cambio.
const texto = readFileSync(archivo, 'utf8');
const corte = texto.search(/^-- =+\s*\n-- VERIFICACION/m);
const cambio = corte > 0 ? texto.slice(0, corte) : texto;
const revision = corte > 0 ? texto.slice(corte) : '';

console.log(`\n  Aplicando ${archivo} a PRODUCCION (${PROD})...\n`);
await correr(cambio);
console.log('  Aplicado.');

if (revision.trim()) {
  console.log('\n  --- VERIFICACION ---');
  const r = await correr(revision);
  console.log(JSON.stringify(r, null, 1));
}

// Que quede constancia de que corrio, sin preguntarselo a nadie.
const reg = await correr(
  `SELECT archivo, ejecutado_at FROM public.schema_migraciones
    WHERE archivo = '${archivo.split(/[\\/]/).pop().replace(/'/g, "''")}'`
);
console.log('\n  En schema_migraciones:', JSON.stringify(reg));
