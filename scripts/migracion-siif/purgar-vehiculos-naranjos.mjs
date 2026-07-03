// Quita del catalogo de MotoPrestamos Los Naranjos (tenant financiera) los
// vehiculos que Fase 2 cargo por error como `productos`. MotoPrestamos es SOLO
// financiera; el catalogo es de CAMINERO MOTORS. La info del vehiculo ya vive
// en el campo `garantia` de cada prestamo (Fase 3), asi que esto no pierde datos.
//
// Objetivo: productos del tenant con chasis IS NOT NULL y legacy_id IS NOT NULL
// (exactamente los 3,488 vehiculos migrados).
//
//   node purgar-vehiculos-naranjos.mjs            (dry-run: cuenta, no borra)
//   node purgar-vehiculos-naranjos.mjs --commit   (borra de verdad)

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const TENANT_ID = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4'; // Motoprestamos los narajos
const COMMIT = process.argv.includes('--commit');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// 1. Reunir ids objetivo (vehiculos migrados)
const ids = [];
let from = 0;
for (;;) {
  const { data, error } = await supabase
    .from('productos')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .not('chasis', 'is', null)
    .not('legacy_id', 'is', null)
    .range(from, from + 999);
  if (error) { console.error('Error leyendo productos:', error.message); process.exit(1); }
  for (const r of data) ids.push(r.id);
  if (data.length < 1000) break;
  from += 1000;
}

const { count: total } = await supabase.from('productos').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
console.log(`Productos totales en Naranjos: ${total} | vehiculos migrados a borrar: ${ids.length} | commit=${COMMIT}`);

if (!COMMIT) { console.log('\n(Dry-run — no se borro nada. Corre con --commit para ejecutar.)'); process.exit(0); }

let borrados = 0;
for (let i = 0; i < ids.length; i += 200) {
  const chunk = ids.slice(i, i + 200);
  const { error } = await supabase.from('productos').delete().in('id', chunk);
  if (error) { console.error(`❌ borrando lote ${i}: ${error.message}`); process.exit(1); }
  borrados += chunk.length;
  console.log(`  borrados ${borrados}/${ids.length}`);
}

const { count: quedan } = await supabase.from('productos').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
console.log(`\n✅ Listo. ${borrados} vehiculos removidos. Productos restantes en Naranjos: ${quedan}.`);
process.exit(0);
