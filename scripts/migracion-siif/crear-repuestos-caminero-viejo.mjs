// Crea la empresa REPUESTOS CAMINERO VIEJO (vacia) clonando la config de
// REPUESTOS CAMINERO, y da acceso a Elvido (elvidocaminero@gmail.com).
// Analogo a REPUESTOS MORLA VIEJA: tenant separado que luego recibira el
// catalogo historico cuando llegue su respaldo viejo.
//
//   node crear-repuestos-caminero-viejo.mjs            (dry-run: muestra el plan)
//   node crear-repuestos-caminero-viejo.mjs --commit   (crea de verdad)
//
// Idempotente: si ya existe una empresa "REPUESTOS CAMINERO VIEJO" reusa su
// tenant y solo asegura el acceso.

import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const COMMIT = process.argv.includes('--commit');
const MOLDE = '91cc1e82-441e-4c22-8e30-9c8866294c00';           // REPUESTOS CAMINERO
const ELVIDO = 'a9a2d9fd-c408-4d33-b1c7-1f7f29e397fb';          // elvidocaminero@gmail.com (superadmin)
const NOMBRE = 'REPUESTOS CAMINERO VIEJO';

const log = (m) => console.log(m);
log(`\n=== Crear ${NOMBRE} (commit=${COMMIT}) ===`);

// 0) idempotencia: ¿ya existe?
const { data: ya } = await supabase.from('config_empresa').select('tenant_id').eq('nombre', NOMBRE).maybeSingle();
const TENANT = ya?.tenant_id || crypto.randomUUID();
log(`Tenant destino: ${TENANT}${ya ? ' (ya existia)' : ' (nuevo)'}`);

// 1) moldes
const { data: tnBase, error: e1 } = await supabase.from('tenants').select('*').eq('id', MOLDE).single();
const { data: ceBase, error: e2 } = await supabase.from('config_empresa').select('*').eq('tenant_id', MOLDE).single();
const { data: subBase } = await supabase.from('suscripciones').select('plan_id').eq('tenant_id', MOLDE).eq('estado', 'activo').limit(1).maybeSingle();
if (e1 || e2) { console.error('No pude leer el molde:', e1?.message || e2?.message); process.exit(1); }

const hoy = new Date().toISOString().slice(0, 10);
const finSub = new Date(); finSub.setFullYear(finSub.getFullYear() + 1);

// 2) armar filas (clonando el molde, cambiando lo propio)
const tenantRow = {
  ...tnBase,
  id: TENANT, nombre: NOMBRE,
  trial_start_date: hoy, trial_end_date: finSub.toISOString().slice(0, 10),
  created_at: undefined, updated_at: undefined,
};
const configRow = {
  ...ceBase,
  id: ya ? undefined : crypto.randomUUID(),
  tenant_id: TENANT, nombre: NOMBRE,
  codigo: '03V',                       // distinto de REPUESTOS CAMINERO ('03')
  saldo_inicial_caja: 0, caja_historial_desde: hoy,
  updated_at: undefined,
};
const subRow = subBase?.plan_id ? {
  tenant_id: TENANT, plan_id: subBase.plan_id, estado: 'activo',
  fecha_inicio: new Date().toISOString(), fecha_fin: finSub.toISOString(),
  monto_pagado: 0, auto_renovar: false,
} : null;
const accesoRow = { user_id: ELVIDO, tenant_id: TENANT, rol: 'owner' };

log('\nPlan:');
log(`  tenants           → id=${TENANT}, nombre="${NOMBRE}", plan=${tenantRow.plan}, activo=${tenantRow.activo}`);
log(`  config_empresa    → tipo_negocio=${configRow.tipo_negocio}, itbis=${configRow.itbis_pct}, codigo=${configRow.codigo}, caja=0`);
log(`  suscripciones     → ${subRow ? `activa hasta ${subRow.fecha_fin.slice(0,10)} (plan ${subRow.plan_id})` : '(sin plan activo molde — omitida)'}`);
log(`  usuarios_empresas → user ${ELVIDO} (elvidocaminero) como '${accesoRow.rol}'`);

if (!COMMIT) { log('\n(DRY-RUN — no se escribio nada.)'); process.exit(0); }

// 3) commit (cada paso idempotente)
{
  const { error } = await supabase.from('tenants').upsert(tenantRow, { onConflict: 'id' });
  if (error) { console.error('tenants:', error.message); process.exit(1); }
}
{
  // config_empresa: si ya existe la fila del tenant, update; si no, insert
  const { data: exists } = await supabase.from('config_empresa').select('id').eq('tenant_id', TENANT).maybeSingle();
  if (exists) {
    const { id, ...upd } = configRow;
    const { error } = await supabase.from('config_empresa').update(upd).eq('tenant_id', TENANT);
    if (error) { console.error('config_empresa update:', error.message); process.exit(1); }
  } else {
    const { error } = await supabase.from('config_empresa').insert(configRow);
    if (error) { console.error('config_empresa insert:', error.message); process.exit(1); }
  }
}
if (subRow) {
  const { data: sub } = await supabase.from('suscripciones').select('id')
    .eq('tenant_id', TENANT).eq('estado', 'activo').gt('fecha_fin', new Date().toISOString()).limit(1).maybeSingle();
  if (!sub) {
    const { error } = await supabase.from('suscripciones').insert(subRow);
    if (error) { console.error('suscripciones:', error.message); process.exit(1); }
  }
}
{
  const { error } = await supabase.from('usuarios_empresas').upsert(accesoRow, { onConflict: 'user_id,tenant_id' });
  if (error) { console.error('usuarios_empresas:', error.message); process.exit(1); }
}

log(`\n✅ ${NOMBRE} creada → ${TENANT}. Acceso dado a elvidocaminero. Aparece en el selector de empresas.`);
process.exit(0);
