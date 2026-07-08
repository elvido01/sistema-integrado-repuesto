// Notas de clientes (SiiF clientes_notas -> MotoFlow cliente_notas).
// El viejo guarda la bitácora "Notas y Comentarios" por cédula del cliente:
//   prestamos_01          -> MotoPréstamos Los Naranjos
//   prestamos_05          -> Moto Préstamos Odalys
//   cpf_inv_los_naranjos  -> Inversiones Los Naranjos
// Idempotente: id determinístico por (base, id legacy) => upsert sin duplicar.
//   node fase-notas-clientes.mjs [--commit] ["E:\\COPIAS"]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { parseTable } from './lib/parseDump.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.join(__dirname, '.env'));
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const COMMIT = process.argv.includes('--commit');

const baseDir = process.argv.slice(2).find((a) => a !== '--commit') || 'E:\\COPIAS';
const dirs = fs.readdirSync(baseDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
  .map((d) => d.name).sort();
const fecha = dirs[dirs.length - 1];
const folder = path.join(baseDir, fecha);
console.log(`Notas de clientes | respaldo ${fecha} | commit=${COMMIT}\n`);

const FUENTES = [
  { key: 'prestamos_01', file: `prestamos_01.${fecha}.SQL`, tenant: '766fe3d6-6885-4f2b-b2cc-1a91db696fb4', nombre: 'MotoPréstamos Los Naranjos' },
  { key: 'prestamos_05', file: `prestamos_05.${fecha}.SQL`, tenant: 'c05a1d05-0d1e-4a2b-8c3f-0da1e5000005', nombre: 'Moto Préstamos Odalys' },
  { key: 'cpf_inv_los_naranjos', file: `cpf_inv_los_naranjos.${fecha}.SQL`, tenant: 'c07a1d07-1e2f-4b3c-9d4a-107a10500007', nombre: 'Inversiones Los Naranjos' },
];

// UUID determinístico (estilo v5) a partir de la base y el id legacy
const notaUuid = (dbKey, legacyId) => {
  const h = crypto.createHash('sha1').update(`cliente_nota|${dbKey}|${legacyId}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const soloDigitos = (v) => String(v || '').replace(/\D/g, '');
const fechaValida = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !String(v).startsWith('0000') ? String(v) : null;

const cargarClientesTenant = async (tenant) => {
  const porDigitos = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await s.from('clientes')
      .select('id, codigo, rnc')
      .eq('tenant_id', tenant)
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const c of data || []) {
      const dRnc = soloDigitos(c.rnc);
      const dCod = soloDigitos(c.codigo);
      if (dRnc && !porDigitos.has(dRnc)) porDigitos.set(dRnc, c.id);
      if (dCod && !porDigitos.has(dCod)) porDigitos.set(dCod, c.id);
    }
    if (!data || data.length < 1000) break;
  }
  return porDigitos;
};

let totalUpserts = 0;
for (const fuente of FUENTES) {
  const fp = path.join(folder, fuente.file);
  if (!fs.existsSync(fp)) { console.log(`── ${fuente.key}: archivo no encontrado, se omite`); continue; }

  const { rows } = await parseTable(fp, 'clientes_notas');
  const clientes = await cargarClientesTenant(fuente.tenant);

  let sinTexto = 0, sinFecha = 0, huerfanas = 0;
  const notas = [];
  for (const r of rows || []) {
    const texto = String(r.nota || '').trim();
    if (!texto) { sinTexto++; continue; }
    const f = fechaValida(r.fecha) || fechaValida(r.fecha_cumple);
    if (!f) { sinFecha++; continue; }
    const clienteId = clientes.get(soloDigitos(r.cliente));
    if (!clienteId) { huerfanas++; continue; }
    notas.push({
      id: notaUuid(fuente.key, r.id),
      tenant_id: fuente.tenant,
      cliente_id: clienteId,
      cliente_cedula: String(r.cliente || '').trim() || null,
      fecha: f,
      nota: texto,
      usuario_nombre: String(r.usuario || '').trim() || null,
      created_at: `${f}T12:00:00-04:00`,
    });
  }

  console.log(`── ${fuente.nombre} (${fuente.key})`);
  console.log(`   en el viejo: ${rows.length} | a migrar: ${notas.length} | vacías: ${sinTexto} | sin fecha: ${sinFecha} | sin cliente en MotoFlow: ${huerfanas}`);
  if (notas.length) {
    const m = notas[notas.length - 1];
    console.log(`   última: ${m.fecha} [${m.usuario_nombre}] ${m.nota.slice(0, 70)}`);
  }

  if (!COMMIT) continue;
  for (let i = 0; i < notas.length; i += 500) {
    const lote = notas.slice(i, i + 500);
    const { error } = await s.from('cliente_notas').upsert(lote, { onConflict: 'id' });
    if (error) { console.error(`   ❌ lote ${i}: ${error.message}`); process.exit(1); }
  }
  totalUpserts += notas.length;
  console.log(`   ✅ ${notas.length} notas cargadas/actualizadas`);
}

console.log(COMMIT ? `\n✅ Notas migradas: ${totalUpserts}` : '\n(DRY-RUN — nada escrito. Agrega --commit)');
