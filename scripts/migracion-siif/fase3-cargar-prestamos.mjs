// Fase 3 — Préstamos de Los Naranjos → prestamos + prestamo_cuotas.
// - Todas las cabeceras (prestamos_01/02/05).
// - Cuotas (amortización interés simple) solo para activos (balance>0).
// - Enlaza al cliente por CÉDULA (codigo/rnc de clientes ya migrados).
// - Idempotente por legacy_id (con offset por base de origen).
//
// Uso:
//   node fase3-cargar-prestamos.mjs            (dry-run: plan, match de cédulas, muestra)
//   node fase3-cargar-prestamos.mjs --limit 50 --commit
//   node fase3-cargar-prestamos.mjs --commit   (todos)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { parseTable } from './lib/parseDump.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const TENANT_ID = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const limIdx = args.indexOf('--limit');
const LIMIT = limIdx >= 0 ? parseInt(args[limIdx + 1], 10) : Infinity;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const FECHA = '2026-06-30';
const SOURCES = [
  { file: `prestamos_01.${FECHA}.SQL`, offset: 0 },
  { file: `prestamos_02.${FECHA}.SQL`, offset: 200_000_000 },
  { file: `prestamos_05.${FECHA}.SQL`, offset: 500_000_000 },
];
const BASE = 'E:\\COPIAS\\' + FECHA + '\\';

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const cedula = (v) => (v == null ? '' : String(v).trim());

// fecha válida o null (descarta corruptas tipo año 0200)
function fecha(v) {
  const s = cedula(v); const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const y = +m[1]; if (y < 1990 || y > 2100) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}
function addPeriodo(iso, frec, k) {
  const d = new Date(iso + 'T12:00:00');
  if (frec === 'semanal') d.setDate(d.getDate() + 7 * k);
  else if (frec === 'quincenal') d.setDate(d.getDate() + 15 * k);
  else d.setMonth(d.getMonth() + k); // mensual
  return d.toISOString().slice(0, 10);
}
function mapFrecuencia(forma) {
  // forma_pago viejo: no documentado con certeza → default mensual.
  return 'mensual';
}

// 1. Parsear y transformar cabeceras
const headers = [];
for (const src of SOURCES) {
  const fpath = BASE + src.file;
  if (!fs.existsSync(fpath)) continue;
  const { rows } = await parseTable(fpath, 'prestamos');
  for (const r of rows) {
    if (!r.id) continue;
    const legacy = Number(r.id) + src.offset;
    const capital = n(r.capital);
    const balance = n(r.balance);
    const plazo = parseInt(r.cantidad_cuotas, 10) || parseInt(r.cant_cuotas, 10) || 0;
    const tasa = n(r.interes);
    const fiRaw = fecha(r.fecha_inicio) || fecha(r.fecha);
    const fpcRaw = fecha(r.vence);
    // fecha_inicio es NOT NULL: fallback a primera cuota o marcador 2000-01-01.
    const fi = fiRaw || fpcRaw || '2000-01-01';
    const fpc = fpcRaw || addPeriodo(fi, 'mensual', 1);
    const garantia = [cedula(r.vhmarca), cedula(r.vhmodelo), cedula(r.vhano), cedula(r.vhchasis), cedula(r.vhmatricula) ? 'Mat: ' + cedula(r.vhmatricula) : ''].filter(Boolean).join(' ').trim() || null;
    const garante = cedula(r.grnombre) ? `Garante: ${cedula(r.grnombre)} ${cedula(r.grcedula)}`.trim() : null;
    headers.push({
      legacy_id: legacy,
      cedula: cedula(r.cliente),
      numero: `PT-${String(legacy).padStart(8, '0')}`,
      monto_capital: capital,
      tasa_interes: tasa,
      mora_pct: n(r.mora),
      plazo_cuotas: plazo || 1,
      frecuencia: mapFrecuencia(r.forma_pago),
      metodo_interes: 'simple',
      tipo: 'financiamiento',
      estado: balance > 0 ? 'activo' : 'saldado',
      fecha_inicio: fi,
      fecha_primera_cuota: fpc,
      garantia,
      notas: garante,
      _balance: balance,
    });
  }
}
console.log(`Cabeceras parseadas: ${headers.length}`);

// 2. Mapa cédula -> cliente_id (de clientes migrados del tenant)
const cliByCedula = new Map();
let from = 0;
for (;;) {
  const { data, error } = await supabase.from('clientes').select('id, codigo, rnc').eq('tenant_id', TENANT_ID).range(from, from + 999);
  if (error) { console.error('Error leyendo clientes:', error.message); process.exit(1); }
  for (const c of data) {
    if (c.codigo) cliByCedula.set(String(c.codigo).trim(), c.id);
    if (c.rnc) cliByCedula.set(String(c.rnc).trim(), c.id);
  }
  if (data.length < 1000) break;
  from += 1000;
}
console.log(`Clientes indexados por cédula: ${cliByCedula.size}`);

// 3. Resolver cliente y filtrar
let sinCliente = 0;
for (const h of headers) {
  h.cliente_id = cliByCedula.get(h.cedula) || null;
  if (!h.cliente_id) sinCliente++;
}
const lista = (Number.isFinite(LIMIT) ? headers.slice(0, LIMIT) : headers).filter((h) => h.cliente_id);
const activos = lista.filter((h) => h._balance > 0);
console.log(`Sin cliente (cédula no encontrada): ${sinCliente} → se omiten`);
console.log(`A cargar: ${lista.length} cabeceras (${activos.length} activos con cuotas).`);

// 4. Generar cuotas (interés simple) para activos
function cuotasDe(h, prestamoId) {
  const out = [];
  const cap = h.monto_capital, plazo = Math.max(1, h.plazo_cuotas), rate = h.tasa_interes / 100;
  const capCuota = Math.round((cap / plazo) * 100) / 100;
  const intCuota = Math.round(cap * rate * 100) / 100;
  let pagadoCapital = Math.max(0, cap - h._balance); // capital ya abonado (aprox)
  const fpc = h.fecha_primera_cuota || h.fecha_inicio || FECHA;
  for (let i = 1; i <= plazo; i++) {
    const capi = i === plazo ? Math.round((cap - capCuota * (plazo - 1)) * 100) / 100 : capCuota;
    const aboCap = Math.min(capi, pagadoCapital); pagadoCapital = Math.round((pagadoCapital - aboCap) * 100) / 100;
    const fullPaid = aboCap >= capi - 0.005;
    out.push({
      prestamo_id: prestamoId, tenant_id: TENANT_ID, numero_cuota: i,
      fecha_vencimiento: addPeriodo(fpc, h.frecuencia, i - 1),
      capital: capi, interes: intCuota, monto_cuota: Math.round((capi + intCuota) * 100) / 100,
      capital_pagado: aboCap, interes_pagado: fullPaid ? intCuota : 0, mora_pagada: 0,
      estado: fullPaid ? 'pagada' : (aboCap > 0 ? 'parcial' : 'pendiente'),
    });
  }
  return out;
}

if (!COMMIT) {
  console.log('\n=== DRY-RUN (no se escribió nada) ===');
  const ej = activos[0];
  if (ej) {
    console.log('Ejemplo cabecera:', JSON.stringify({ numero: ej.numero, cedula: ej.cedula, capital: ej.monto_capital, tasa: ej.tasa_interes, plazo: ej.plazo_cuotas, balance: ej._balance, estado: ej.estado, garantia: ej.garantia }));
    console.log('Cuotas generadas (primeras 3):', JSON.stringify(cuotasDe(ej, 'demo').slice(0, 3)));
  }
  process.exit(0);
}

// 5. Cargar cabeceras (upsert por legacy_id → casa por numero/legacy). Usamos id propio.
const byLegacy = new Map();
let f2 = 0;
for (;;) {
  const { data, error } = await supabase.from('prestamos').select('id, legacy_id').eq('tenant_id', TENANT_ID).not('legacy_id', 'is', null).range(f2, f2 + 999);
  if (error) { console.error('Error leyendo prestamos:', error.message); process.exit(1); }
  for (const r of data) byLegacy.set(Number(r.legacy_id), r.id);
  if (data.length < 1000) break;
  f2 += 1000;
}

const headerRows = lista.map((h) => {
  const id = byLegacy.get(h.legacy_id) || crypto.randomUUID();
  h._id = id;
  return {
    id, tenant_id: TENANT_ID, legacy_id: h.legacy_id, cliente_id: h.cliente_id,
    numero: h.numero, monto_capital: h.monto_capital, tasa_interes: h.tasa_interes,
    mora_pct: h.mora_pct, plazo_cuotas: h.plazo_cuotas, frecuencia: h.frecuencia,
    metodo_interes: h.metodo_interes, tipo: h.tipo, estado: h.estado,
    fecha_inicio: h.fecha_inicio, fecha_primera_cuota: h.fecha_primera_cuota,
    garantia: h.garantia, notas: h.notas,
  };
});

async function up(table, rows, label) {
  const B = 500; let ok = 0;
  for (let i = 0; i < rows.length; i += B) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + B), { onConflict: 'id' });
    if (error) { console.error(`❌ ${label} lote ${i}: ${error.message}`); process.exit(1); }
    ok += Math.min(B, rows.length - i);
    if (ok % 2500 === 0 || ok === rows.length) console.log(`  ${label}: ${ok}/${rows.length}`);
  }
}

await up('prestamos', headerRows, 'cabeceras');

// 6. Cuotas de activos: borra las viejas del préstamo y reinserta (idempotente)
const activosCargar = lista.filter((h) => h._balance > 0);
const ids = activosCargar.map((h) => h._id);
for (let i = 0; i < ids.length; i += 200) {
  const { error } = await supabase.from('prestamo_cuotas').delete().in('prestamo_id', ids.slice(i, i + 200));
  if (error) { console.error('❌ limpiando cuotas:', error.message); process.exit(1); }
}
let cuotas = [];
for (const h of activosCargar) cuotas = cuotas.concat(cuotasDe(h, h._id));
await up('prestamo_cuotas', cuotas, 'cuotas');

console.log(`\n✅ Listo. ${headerRows.length} préstamos y ${cuotas.length} cuotas cargados en Los Naranjos.`);
process.exit(0);
