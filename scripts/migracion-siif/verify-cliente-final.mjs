import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const TID = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
const cod = process.argv[2] || 'R11164274';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: cli } = await supabase.from('clientes').select('id, codigo, nombre').eq('tenant_id', TID).eq('codigo', cod).maybeSingle();
console.log('Cliente:', cli?.nombre, cli?.codigo);

const { data: prs } = await supabase.from('prestamos').select('id, numero, estado, monto_capital').eq('tenant_id', TID).eq('cliente_id', cli.id);
const activos = prs.filter((p) => p.estado === 'activo');
console.log(`Préstamos: ${prs.length} (${activos.length} activos)`);
for (const p of activos) {
  const { data: cs } = await supabase.from('prestamo_cuotas').select('capital, interes, capital_pagado, interes_pagado').eq('prestamo_id', p.id);
  const capPend = cs.reduce((s, c) => s + (Number(c.capital) - Number(c.capital_pagado)), 0);
  const intPend = cs.reduce((s, c) => s + (Number(c.interes) - Number(c.interes_pagado)), 0);
  console.log(`  ${p.numero}: capital pend ${capPend.toFixed(2)} + interés pend ${intPend.toFixed(2)} = ${(capPend + intPend).toFixed(2)} (${cs.length} cuotas)`);
}

const { data: pagos, count } = await supabase.from('prestamo_pagos').select('fecha, total_pagado', { count: 'exact' }).eq('tenant_id', TID).eq('cliente_id', cli.id).order('fecha', { ascending: false }).limit(3);
console.log(`\nPagos del cliente: ${count}. Últimos 3:`);
for (const p of pagos) console.log(`  ${p.fecha}: RD$${p.total_pagado}`);
process.exit(0);
