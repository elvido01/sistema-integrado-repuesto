// Crea los tenants de la separación de financieras (idempotente).
// Mismo contenido que sql/crear_tenants_odalys_inversiones.sql pero ejecutable
// con la service key (sin abrir el SQL Editor).
//
//   node crear-tenants-financieras.mjs
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const NARANJOS = '766fe3d6-6885-4f2b-b2cc-1a91db696fb4';
const EMPRESAS = [
  { id: 'c05a1d05-0d1e-4a2b-8c3f-0da1e5000005', nombre: 'MOTO PRESTAMOS ODALYS' },
  { id: 'c07a1d07-1e2f-4b3c-9d4a-107a10500007', nombre: 'INVERSIONES LOS NARANJOS' },
];

// Config financiera base (copiada de Naranjos)
const { data: base, error: baseErr } = await supabase
  .from('config_empresa')
  .select('itbis_pct, moneda_principal, moneda_precios, modo_fecha, plantilla_cobro, cobranza_hora_corte')
  .eq('tenant_id', NARANJOS)
  .maybeSingle();
if (baseErr || !base) { console.error('No pude leer la config de Naranjos:', baseErr?.message); process.exit(1); }

const { data: plan } = await supabase
  .from('planes').select('id, nombre').eq('activo', true)
  .order('precio', { ascending: false }).limit(1).maybeSingle();

for (const e of EMPRESAS) {
  // 1) tenants
  const { error: tErr } = await supabase.from('tenants').upsert({
    id: e.id,
    nombre: e.nombre,
    direccion: 'Av. Juan XXIII esq. Altagracia, Higuey, Rep. Dom.',
    telefono: '809-554-4181',
    activo: true,
    plan: plan?.nombre || 'Enterprise',
  }, { onConflict: 'id' });
  if (tErr) { console.error(`tenants ${e.nombre}:`, tErr.message); process.exit(1); }

  // 2) config_empresa (solo si no existe)
  const { data: existing } = await supabase.from('config_empresa').select('tenant_id').eq('tenant_id', e.id).maybeSingle();
  if (!existing) {
    const { error: cErr } = await supabase.from('config_empresa').insert({
      id: crypto.randomUUID(),
      tenant_id: e.id,
      nombre: e.nombre,
      direccion1: 'Av. Juan XXIII esq. Altagracia',
      direccion2: 'Higuey, Rep. Dom.',
      telefono: '809-554-4181',
      itbis_pct: base.itbis_pct ?? 18,
      moneda_principal: base.moneda_principal || 'DOP - PESOS',
      moneda_precios: base.moneda_precios || 'DOP - PESOS',
      modo_fecha: base.modo_fecha ?? 1,
      tipo_negocio: 'financiera',
      feat_financiera: true,
      financiamiento_tipo: 'propio',
      plantilla_cobro: base.plantilla_cobro || null,
      cobranza_hora_corte: base.cobranza_hora_corte || '17:50',
    });
    if (cErr) { console.error(`config_empresa ${e.nombre}:`, cErr.message); process.exit(1); }
  }

  // 3) suscripción activa 1 año (si no tiene vigente)
  const { data: sub } = await supabase.from('suscripciones')
    .select('id').eq('tenant_id', e.id).in('estado', ['trial', 'activo'])
    .gt('fecha_fin', new Date().toISOString()).limit(1).maybeSingle();
  if (!sub && plan?.id) {
    const fin = new Date(); fin.setFullYear(fin.getFullYear() + 1);
    const { error: sErr } = await supabase.from('suscripciones').insert({
      tenant_id: e.id, plan_id: plan.id, estado: 'activo',
      fecha_inicio: new Date().toISOString(), fecha_fin: fin.toISOString(),
      monto_pagado: 0, auto_renovar: false,
    });
    if (sErr) { console.error(`suscripciones ${e.nombre}:`, sErr.message); process.exit(1); }
  }

  console.log(`✅ ${e.nombre} → ${e.id}`);
}
console.log('Tenants listos.');
