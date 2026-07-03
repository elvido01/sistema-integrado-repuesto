import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const TID = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// prestamos activos
const activos = new Set(); let f = 0;
for (;;) {
  const { data } = await supabase.from('prestamos').select('id').eq('tenant_id', TID).eq('estado', 'activo').range(f, f + 999);
  for (const r of data) activos.add(r.id);
  if (data.length < 1000) break; f += 1000;
}
// max vencimiento de cuota PENDIENTE por prestamo
const maxVence = new Map(); let g = 0;
for (;;) {
  const { data } = await supabase.from('prestamo_cuotas')
    .select('prestamo_id, fecha_vencimiento, capital, interes, capital_pagado, interes_pagado')
    .eq('tenant_id', TID).neq('estado', 'pagada').range(g, g + 999);
  for (const c of data) {
    const pend = (Number(c.capital) + Number(c.interes)) - (Number(c.capital_pagado) + Number(c.interes_pagado));
    if (pend <= 0.005 || !activos.has(c.prestamo_id)) continue;
    const cur = maxVence.get(c.prestamo_id);
    if (!cur || c.fecha_vencimiento > cur) maxVence.set(c.prestamo_id, c.fecha_vencimiento);
  }
  if (data.length < 1000) break; g += 1000;
}
const years = {};
for (const v of maxVence.values()) { const y = v.slice(0, 4); years[y] = (years[y] || 0) + 1; }
console.log('Préstamos activos con saldo:', maxVence.size);
console.log('\nPor año de su ÚLTIMA cuota pendiente:');
for (const y of Object.keys(years).sort()) console.log(`  ${y}: ${years[y]}`);
// cortes acumulados (cuántos quedarían EXCLUIDOS si el corte es "última cuota antes de X")
console.log('\nSe EXCLUIRÍAN (última cuota venció antes de):');
for (const corte of ['2018-01-01', '2020-01-01', '2022-01-01', '2023-01-01', '2024-01-01', '2025-01-01']) {
  const n = [...maxVence.values()].filter((v) => v < corte).length;
  console.log(`  ${corte}: ${n} préstamos`);
}
process.exit(0);
