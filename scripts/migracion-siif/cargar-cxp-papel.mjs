// Carga UNICA de las Cuentas por Pagar reales de CAMINERO MOTORS.
//
// Fuente: papel escrito a mano por el usuario (2026-07-14), confirmado por el
// en el chat. El libro CxP del SiiF (cxp_mov_master) esta OBSOLETO — pendientes
// de 2013-2015 ya pagados; solo MOTOPRESTAMOS CASTILLO cuadraba (RD$1,269,000
// exacto vs suplidores.balance). Por eso NO se migra el historico: se cargan
// los 6 saldos vivos como "SALDO INICIAL" y de aqui en adelante la CxP se
// maneja en MotoFlow (Pago a Suplidores).
//
// Moneda: todos en US$ excepto MOTOPRESTAMOS CASTILLO (RD$). La deuda USD
// queda en pendiente_usd (autoritativa); el equivalente RD$ se guarda a la
// tasa del dia de la carga (60) solo como referencia — cada pago futuro usa
// la tasa que se digite ese dia (asi lo pidio el usuario: "tiene que ser
// variable").
//
// Idempotente por compras.legacy_id (papel:cxp:2026-07-14:<n>).
//
//   node scripts/migracion-siif/cargar-cxp-papel.mjs           (simula)
//   node scripts/migracion-siif/cargar-cxp-papel.mjs --commit  (carga)

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));

const DEALER = 'b39506c3-27dc-467d-830b-096731b83113'; // CAMINERO MOTORS
const TASA = 60;              // RD$ por US$ el dia de la carga (referencial)
const FECHA = '2026-07-14';
const COMMIT = process.argv.includes('--commit');

// Nombres igual que en el SiiF (suplidores) para que cualquier cruce futuro case.
// Telefonos tomados de suplidores del SiiF donde existian.
const SALDOS = [
  { n: 1, nombre: 'TUCAN',                        moneda: 'USD', saldo: 16580,   telefono: null },
  { n: 2, nombre: 'MOTORES DEL SUR S.R.L',        moneda: 'USD', saldo: 68111,   telefono: '809-527-7811' }, // contacto: Jomin
  { n: 3, nombre: 'MOTOPRESTAMOS CASTILLO S.R.L.', moneda: 'DOP', saldo: 1269000, telefono: '809-554-0221' },
  { n: 4, nombre: 'TERUEL & COMPANIA SRL',        moneda: 'USD', saldo: 89885,   telefono: null },
  { n: 5, nombre: 'NIPPONIA CARIBE SRL',          moneda: 'USD', saldo: 30860,   telefono: null },
  { n: 6, nombre: 'SUPER GATO',                   moneda: 'USD', saldo: 29920,   telefono: null },
];

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

console.log(`CxP Caminero desde papel ${FECHA} | tasa referencial ${TASA} | commit=${COMMIT}\n`);
let totalUsd = 0, totalDop = 0;
for (const s of SALDOS) {
  if (s.moneda === 'USD') totalUsd += s.saldo; else totalDop += s.saldo;
  console.log(`  ${s.nombre.padEnd(35)} ${s.moneda === 'USD' ? 'US$' : 'RD$'} ${s.saldo.toLocaleString('en-US')}`);
}
console.log(`\n  TOTAL: US$ ${totalUsd.toLocaleString('en-US')} + RD$ ${totalDop.toLocaleString('en-US')} (≈ RD$ ${(totalUsd * TASA + totalDop).toLocaleString('en-US')} a ${TASA})`);

if (!COMMIT) { console.log('\n(Simulación — agrega --commit para cargar.)'); process.exit(0); }

// 1) Proveedores: find-or-create por nombre; asegurar moneda/telefono correctos
const { data: provs, error: eProv } = await supabase.from('proveedores')
  .select('id, nombre, moneda, telefono').eq('tenant_id', DEALER);
if (eProv) { console.error('Error leyendo proveedores:', eProv.message); process.exit(1); }
const porNombre = new Map((provs || []).map((p) => [String(p.nombre).trim().toUpperCase(), p]));

for (const s of SALDOS) {
  const existente = porNombre.get(s.nombre.toUpperCase());
  if (!existente) {
    const { data, error } = await supabase.from('proveedores')
      .insert({ tenant_id: DEALER, nombre: s.nombre, activo: true, dias_credito: 0, vende_a_credito: true, moneda: s.moneda, telefono: s.telefono })
      .select('id, nombre, moneda, telefono').single();
    if (error) { console.error(`Error creando ${s.nombre}:`, error.message); process.exit(1); }
    porNombre.set(s.nombre.toUpperCase(), data);
    console.log(`+ proveedor creado: ${s.nombre} (${s.moneda})`);
  } else if (existente.moneda !== s.moneda || (s.telefono && !existente.telefono)) {
    const { error } = await supabase.from('proveedores')
      .update({ moneda: s.moneda, telefono: existente.telefono || s.telefono })
      .eq('id', existente.id);
    if (error) { console.error(`Error actualizando ${s.nombre}:`, error.message); process.exit(1); }
    existente.moneda = s.moneda;
    console.log(`~ proveedor actualizado: ${s.nombre} → moneda ${s.moneda}`);
  }
}

// 2) Compras de saldo inicial (idempotente por legacy_id)
const legacies = SALDOS.map((s) => `papel:cxp:${FECHA}:${s.n}`);
const { data: previas, error: ePrev } = await supabase.from('compras')
  .select('id, legacy_id').eq('tenant_id', DEALER).in('legacy_id', legacies);
if (ePrev) { console.error('Error leyendo compras previas:', ePrev.message); process.exit(1); }
const yaCargadas = new Set((previas || []).map((c) => c.legacy_id));

let insertadas = 0, saltadas = 0;
for (const s of SALDOS) {
  const legacy = `papel:cxp:${FECHA}:${s.n}`;
  if (yaCargadas.has(legacy)) { saltadas++; console.log(`= ya existe: ${s.nombre} (${legacy})`); continue; }
  const usd = s.moneda === 'USD';
  const totalDOP = usd ? Number((s.saldo * TASA).toFixed(2)) : s.saldo;
  const fila = {
    tenant_id: DEALER,
    legacy_id: legacy,
    numero: `SI-CXP-${s.n}`,
    referencia: `SALDO INICIAL papel ${FECHA}`,
    fecha: FECHA,
    ncf: '',
    suplidor_id: porNombre.get(s.nombre.toUpperCase()).id,
    forma_pago: 'Credito',
    dias_credito: 0,
    total_exento: 0,
    total_gravado: totalDOP,
    descuento_total: 0,
    itbis_total: 0,
    itbis_incluido: true,
    actualizar_precios: false,
    total_compra: totalDOP,
    monto_pagado: 0,
    monto_pendiente: totalDOP,
    estado: 'PENDIENTE',
    moneda: s.moneda,
    tasa_cambio: usd ? TASA : null,
    total_usd: usd ? s.saldo : null,
    pendiente_usd: usd ? s.saldo : null,
    created_at: `${FECHA}T12:00:00-04:00`,
  };
  const { error } = await supabase.from('compras').insert(fila);
  if (error) { console.error(`Error insertando ${s.nombre}:`, error.message); process.exit(1); }
  insertadas++;
  console.log(`+ compra saldo inicial: ${s.nombre} → ${usd ? `US$ ${s.saldo.toLocaleString('en-US')} (≈RD$ ${totalDOP.toLocaleString('en-US')})` : `RD$ ${totalDOP.toLocaleString('en-US')}`}`);
}

console.log(`\n✅ Listo: ${insertadas} saldos cargados, ${saltadas} ya existían.`);
process.exit(0);
