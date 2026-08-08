#!/usr/bin/env node
// =====================================================================
// ¿Está Hermes conectado al canal de MotoFlow?
// ---------------------------------------------------------------------
//   node scripts/hermes-estado.mjs
//
// Hermes vive en otra PC. Cuando algo no funciona, la pregunta siempre es
// la misma: ¿está conectado, o le está fallando algo suyo? Esto lo responde
// sin tener que escribirle y esperar.
//
// Mira tres cosas, en el orden en que se rompen:
//   1. ¿Existe el canal?          -> ¿se corrió hermes_canal_motoflow.sql?
//   2. ¿Hay latido reciente?      -> ¿su gateway está encendido y conectado?
//   3. ¿Hay mensajes sin contestar? -> ¿está vivo pero no está atendiendo?
//
// Requiere scripts/migracion-siif/.env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');

const envMigracion = join(RAIZ, 'scripts', 'migracion-siif', '.env');
if (existsSync(envMigracion)) {
  const texto = await readFile(envMigracion, 'utf8');
  for (const linea of texto.split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT = process.env.VAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';

if (!URL || !KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (scripts/migracion-siif/.env)');
  process.exit(1);
}

const s = createClient(URL, KEY, { auth: { persistSession: false } });

const hace = (iso) => {
  const seg = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seg < 60) return `hace ${seg}s`;
  if (seg < 3600) return `hace ${Math.round(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.round(seg / 3600)} h`;
  return `hace ${Math.round(seg / 86400)} días`;
};

// --- 1. ¿existe el canal? --------------------------------------------
const { error: eTabla } = await s.from('hermes_presencia').select('tenant_id').limit(1);
if (eTabla) {
  console.log('✗ El canal no existe todavía.');
  console.log('  Corre sql/hermes_canal_motoflow.sql en el SQL Editor.');
  console.log(`  (${eTabla.message})`);
  process.exit(1);
}

// --- 2. ¿hay latido? --------------------------------------------------
const { data: pres } = await s.from('hermes_presencia').select('*').eq('tenant_id', TENANT).maybeSingle();

// Los mismos dos minutos que usa hermes_estado_canal(): si aquí decimos
// "conectado" y la pantalla dice que no, el que está mal es este script.
const VENTANA_MS = 2 * 60 * 1000;
const vivo = pres && Date.now() - new Date(pres.ultimo).getTime() < VENTANA_MS;

if (!pres) {
  console.log('✗ Hermes nunca ha mandado un latido.');
  console.log('  Su gateway no ha logrado conectarse a Supabase ni una vez.');
} else if (vivo) {
  console.log(`✓ Hermes conectado — último latido ${hace(pres.ultimo)}`);
  if (pres.detalle) console.log(`  ${JSON.stringify(pres.detalle)}`);
} else {
  console.log(`✗ Hermes desconectado — último latido ${hace(pres.ultimo)}`);
  console.log('  Llegó a conectar alguna vez, así que la clave y el host sirven:');
  console.log('  lo más probable es que su PC esté apagada o el gateway caído.');
}

// --- 3. ¿está atendiendo? --------------------------------------------
const { data: msgs } = await s
  .from('hermes_chat')
  .select('id, rol, texto, respondido, creado_en')
  .eq('tenant_id', TENANT)
  .order('creado_en', { ascending: false })
  .limit(6);

// Se cuenta contra la tabla, NO sobre los seis que se muestran. Contándolo
// sobre la lista recortada dijo "6 pendientes" cuando había 17, y con ese
// número se diagnosticó mal el problema durante media hora.
const { count: pendientes } = await s
  .from('hermes_chat')
  .select('id', { count: 'exact', head: true })
  .eq('tenant_id', TENANT)
  .eq('rol', 'usuario')
  .eq('respondido', false);

console.log('');
if (!msgs?.length) {
  console.log('Conversación: vacía, nadie le ha escrito desde MotoFlow.');
} else {
  if (pendientes) {
    // Vivo y con cola es peor que muerto: alguien está esperando en pantalla.
    console.log(`⚠ ${pendientes} mensaje(s) sin contestar${vivo ? ' — y está conectado' : ''}`);
  }
  console.log('Últimos mensajes:');
  for (const m of msgs.reverse()) {
    const quien = m.rol === 'hermes' ? 'Hermes' : 'Tienda';
    const marca = m.rol === 'usuario' && !m.respondido ? ' ⏳' : '';
    console.log(`  ${hace(m.creado_en).padEnd(14)} ${quien.padEnd(7)} ${m.texto.slice(0, 60)}${marca}`);
  }
}
