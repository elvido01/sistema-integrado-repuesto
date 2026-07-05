// Parte 2: ¿de dónde saca CPF la tasa de mora? + suma de intereses del préstamo
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { parseTable } from './lib/parseDump.mjs';

const fecha = '2026-07-03';
const file = path.join('E:\\COPIAS', fecha, `prestamos_01.${fecha}.SQL`);
const s = (v) => (v == null ? '' : String(v).trim());
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

// 1) Listar tablas del dump (CREATE TABLE)
const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'latin1' }) });
const tablas = [];
for await (const line of rl) {
  const m = /^CREATE TABLE `?(\w+)`?/.exec(line);
  if (m) tablas.push(m[1]);
}
console.log('Tablas en prestamos_01:', tablas.join(', '));

// 2) Tablas candidatas a configuración (mora global)
for (const t of tablas.filter((t) => /conf|param|ajuste|empresa|general|opcion/i.test(t))) {
  const { rows } = await parseTable(file, t).catch(() => ({ rows: [] }));
  console.log(`\n--- ${t} (${rows.length} filas) ---`);
  rows.slice(0, 3).forEach((r) => {
    const keys = Object.entries(r).filter(([k, v]) => v != null && String(v).trim() !== '');
    console.log(JSON.stringify(Object.fromEntries(keys)));
  });
}

// 3) Intereses del préstamo 26270: suma de interes en filas pendientes
const cxc = await parseTable(file, 'cxc_pendiente');
const rows = cxc.rows.filter((r) => Number(r.num_transaccion) === 26270 && s(r.tip_transaccion) === 'PT');
const pendientes = rows.filter((r) => n(r.pendiente) > 0.005);
const sumaInteres = pendientes.reduce((a, r) => a + n(r.interes), 0);
const sumaPend = pendientes.reduce((a, r) => a + n(r.pendiente), 0);
console.log(`\nPT-0026270: cuotas pendientes=${pendientes.length} | SUM(pendiente)=${sumaPend.toFixed(2)} | SUM(interes)=${sumaInteres.toFixed(2)}`);
console.log('(el sistema viejo muestra Intereses Pendientes 48,266.12 y Mora 1,507.19)');
