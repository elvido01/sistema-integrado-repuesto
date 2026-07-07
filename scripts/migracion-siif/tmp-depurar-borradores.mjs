// Depuración masiva de borradores de Orden de Compra (Repuestos Morla):
// quita de TODAS las órdenes Pendiente las líneas de productos
// desactivados o YA REPUESTOS (existencia > mínimo, o > 0 sin mínimo).
// Misma regla que ahora aplica el frontend al cargar cada borrador.
//   node tmp-depurar-borradores.mjs [--commit]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const COMMIT = process.argv.includes('--commit');
const TENANT = '00000000-0000-0000-0000-000000000001'; // Repuestos Morla

const { data: ordenes, error: e1 } = await supabase
  .from('ordenes_compra')
  .select('id, numero, estado, proveedores(nombre)')
  .eq('tenant_id', TENANT)
  .eq('estado', 'Pendiente');
if (e1) { console.error(e1.message); process.exit(1); }
console.log(`Borradores Pendiente: ${ordenes.length} | commit=${COMMIT}\n`);

let totalQuitar = 0;
for (const oc of ordenes) {
  const { data: det } = await supabase
    .from('ordenes_compra_detalle')
    .select('id, producto_id, codigo, descripcion, cantidad')
    .eq('orden_compra_id', oc.id);
  if (!det?.length) continue;

  const prodIds = [...new Set(det.map(d => d.producto_id).filter(Boolean))];
  const { data: prods } = await supabase
    .from('productos').select('id, activo, min_stock').in('id', prodIds);
  const pMap = new Map((prods || []).map(p => [p.id, p]));

  const aQuitar = [];
  for (const d of det) {
    if (!d.producto_id) continue;
    const p = pMap.get(d.producto_id);
    if (!p) continue;
    if (p.activo === false) { aQuitar.push({ ...d, motivo: 'desactivado' }); continue; }
    const { data: st } = await supabase.rpc('get_stock_actual', { producto_uuid: d.producto_id });
    const exist = Number(st) || 0;
    const min = Number(p.min_stock) || 0;
    const necesita = min > 0 ? exist <= min : exist <= 0;
    if (!necesita) aQuitar.push({ ...d, motivo: `repuesto (stock ${exist}, min ${min})` });
  }

  if (!aQuitar.length) continue;
  totalQuitar += aQuitar.length;
  console.log(`${oc.numero} (${oc.proveedores?.nombre || '?'}): quitar ${aQuitar.length} de ${det.length}`);
  aQuitar.forEach(d => console.log(`   - ${d.codigo} x${d.cantidad} · ${d.motivo}`));

  if (COMMIT) {
    const { error } = await supabase.from('ordenes_compra_detalle')
      .delete().in('id', aQuitar.map(d => d.id));
    if (error) { console.error('   ❌', error.message); process.exit(1); }
  }
}
console.log(`\n${COMMIT ? '✅ Eliminadas' : '(dry-run) Se eliminarían'}: ${totalQuitar} líneas.`);
process.exit(0);
