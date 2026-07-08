// Verificación masiva: TODOS los cargos del viejo (AB/MR/AD/ND/IN/IC) con
// pendiente > 0 vs lo cargado en prestamo_cargos de MotoFlow, por empresa.
// Compara numero, pendiente y cédula del cliente. Reporta diferencias.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { parseTable } from './lib/parseDump.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const FECHA = '2026-07-07';
const BASE = path.join('E:\\COPIAS', FECHA);
const TIPOS_CARGO = new Set(['AB', 'MR', 'AD', 'ND', 'IN', 'IC']);
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const txt = (v) => (v == null ? '' : String(v).trim());
const pad7 = (x) => String(x).padStart(7, '0');
const r2 = (x) => Math.round(x * 100) / 100;

const EMPRESAS = [
  { nombre: 'NARANJOS', tenant: '766fe3d6-6885-4f2b-b2cc-1a91db696fb4',
    files: [`prestamos_01.${FECHA}.SQL`, `prestamos_02.${FECHA}.SQL`] },
  { nombre: 'ODALYS', tenant: 'c05a1d05-0d1e-4a2b-8c3f-0da1e5000005',
    files: [`prestamos_05.${FECHA}.SQL`] },
  { nombre: 'INVERSIONES', tenant: 'c07a1d07-1e2f-4b3c-9d4a-107a10500007',
    files: [`cpf_inv_los_naranjos.${FECHA}.SQL`] },
];

for (const emp of EMPRESAS) {
  console.log(`\n===== ${emp.nombre} =====`);
  // 1) Cargos del dump (misma lógica del loader: dedupe por numero, suma parcialidades)
  const porNumero = new Map();
  const colisiones = [];
  for (const file of emp.files) {
    const fp = path.join(BASE, file);
    if (!fs.existsSync(fp)) { console.log(`  (no existe ${file})`); continue; }
    const { rows } = await parseTable(fp, 'cxc_pendiente');
    for (const r of rows) {
      const tip = txt(r.tip_transaccion);
      if (!TIPOS_CARGO.has(tip)) continue;
      const monto = n(r.debito) || n(r.pendiente);
      if (monto <= 0.005) continue;
      const numero = `${tip}-${pad7(r.num_transaccion)}`;
      const prev = porNumero.get(numero);
      if (!prev) {
        porNumero.set(numero, { numero, cedula: txt(r.cliente), monto: r2(monto), pendiente: r2(Math.max(n(r.pendiente), 0)), file });
      } else {
        if (prev.file !== file && prev.cedula !== txt(r.cliente)) colisiones.push(numero);
        prev.monto = r2(prev.monto + monto);
        prev.pendiente = r2(prev.pendiente + Math.max(n(r.pendiente), 0));
      }
    }
  }
  const viejosPend = [...porNumero.values()].filter(c => c.pendiente > 0.005);
  const totalViejo = r2(viejosPend.reduce((a, c) => a + c.pendiente, 0));
  console.log(`  Cargos con pendiente en el viejo: ${viejosPend.length} | RD$ ${totalViejo.toFixed(2)} | colisiones entre bases: ${colisiones.length}${colisiones.length ? ' -> ' + colisiones.join(', ') : ''}`);

  // 2) Cargos en prod (todos, paginado) + cédulas de sus clientes
  const prodMap = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('prestamo_cargos')
      .select('numero, monto, monto_pagado, estado, anulado, cliente_id')
      .eq('tenant_id', emp.tenant).range(from, from + 999);
    if (error) { console.error('  prod:', error.message); process.exit(1); }
    for (const c of data) prodMap.set(c.numero, c);
    if (data.length < 1000) break;
  }

  // cédulas de los clientes involucrados
  const cliIds = [...new Set(viejosPend.map(v => prodMap.get(v.numero)?.cliente_id).filter(Boolean))];
  const cedulaByCli = new Map();
  for (let i = 0; i < cliIds.length; i += 200) {
    const { data } = await supabase.from('clientes').select('id, codigo, rnc').in('id', cliIds.slice(i, i + 200));
    (data || []).forEach(c => cedulaByCli.set(c.id, { codigo: txt(c.codigo), rnc: txt(c.rnc) }));
  }

  // 3) Comparar
  let ok = 0; const faltan = []; const montoDif = []; const clienteDif = [];
  for (const v of viejosPend) {
    const p = prodMap.get(v.numero);
    if (!p || p.anulado) { faltan.push(v); continue; }
    const pendProd = r2(Math.max(n(p.monto) - n(p.monto_pagado), 0));
    if (Math.abs(pendProd - v.pendiente) > 0.01) { montoDif.push({ ...v, pendProd }); continue; }
    const ced = cedulaByCli.get(p.cliente_id);
    if (ced && v.cedula && ced.codigo !== v.cedula && ced.rnc !== v.cedula) { clienteDif.push({ ...v, prodCed: ced.codigo }); continue; }
    ok++;
  }
  console.log(`  ✔ Exactos (numero+pendiente+cliente): ${ok}/${viejosPend.length}`);
  if (faltan.length) { console.log(`  ✘ FALTAN en prod: ${faltan.length}`); faltan.slice(0, 10).forEach(f => console.log(`     ${f.numero} ${f.cedula} RD$${f.pendiente}`)); }
  if (montoDif.length) { console.log(`  ✘ PENDIENTE distinto: ${montoDif.length}`); montoDif.slice(0, 10).forEach(f => console.log(`     ${f.numero} viejo ${f.pendiente} vs prod ${f.pendProd}`)); }
  if (clienteDif.length) { console.log(`  ✘ CLIENTE distinto: ${clienteDif.length}`); clienteDif.slice(0, 10).forEach(f => console.log(`     ${f.numero} viejo ${f.cedula} vs prod ${f.prodCed}`)); }

  // 4) Inverso: cargos con pendiente en prod que el viejo ya no tiene pendiente
  let inversos = 0;
  for (const [num, p] of prodMap) {
    if (p.anulado || p.estado === 'pagado') continue;
    const pendProd = r2(Math.max(n(p.monto) - n(p.monto_pagado), 0));
    if (pendProd <= 0.005) continue;
    const v = porNumero.get(num);
    if (!v || v.pendiente <= 0.005) inversos++;
  }
  console.log(`  Cargos pendientes en prod que el viejo ya salda/no trae: ${inversos}${inversos ? ' (revisar)' : ''}`);
}
process.exit(0);
