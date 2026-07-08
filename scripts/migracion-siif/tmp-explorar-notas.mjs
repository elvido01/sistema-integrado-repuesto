// Exploración: ¿el respaldo SiiF tiene tablas de notas/comentarios de clientes?
// Escanea TODOS los .SQL del respaldo más reciente: lista tablas (CREATE TABLE),
// marca candidatas (nota|coment|observ|seguim|gestion|bitacora|memo|diario) y
// muestra columnas + filas de muestra + conteo estimado.
//   node tmp-explorar-notas.mjs ["E:\\COPIAS"]
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const baseDir = process.argv[2] || 'E:\\COPIAS';
const dirs = fs.readdirSync(baseDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
  .map((d) => d.name).sort();
const fecha = dirs[dirs.length - 1];
const folder = path.join(baseDir, fecha);
console.log(`Respaldo: ${folder}\n`);

const CANDIDATA = /nota|coment|observ|seguim|gestion|bitacora|memo|diario|llamada|visita/i;
const MAX_SAMPLES = 5;

// tokenizador de tuplas (mismo formato que lib/parseDump.mjs)
function parseValues(s, columns, rows, max) {
  const n = s.length; let i = 0;
  while (i < n && rows.length < max) {
    while (i < n && s[i] !== '(') i++;
    if (i >= n) break;
    i++;
    const fields = []; let cur = ''; let inStr = false; let quoted = false;
    while (i < n) {
      const ch = s[i];
      if (inStr) {
        if (ch === '\\') { cur += s[i + 1] ?? ''; i += 2; continue; }
        if (ch === "'") { if (s[i + 1] === "'") { cur += "'"; i += 2; continue; } inStr = false; i++; continue; }
        cur += ch; i++; continue;
      }
      if (ch === "'") { inStr = true; quoted = true; i++; continue; }
      if (ch === ',') { fields.push(quoted || cur.trim().toUpperCase() !== 'NULL' ? cur : null); cur = ''; quoted = false; i++; continue; }
      if (ch === ')') { fields.push(quoted || cur.trim().toUpperCase() !== 'NULL' ? cur : null); i++; break; }
      cur += ch; i++;
    }
    const obj = {};
    for (let k = 0; k < columns.length; k++) obj[columns[k]] = fields[k] ?? null;
    rows.push(obj);
  }
}

for (const f of fs.readdirSync(folder).filter((x) => x.toUpperCase().endsWith('.SQL')).sort()) {
  const fp = path.join(folder, f);
  const rl = readline.createInterface({ input: fs.createReadStream(fp, { encoding: 'utf8' }), crlfDelay: Infinity });
  const tablas = [];            // todas las tablas del dump
  const info = new Map();       // tabla candidata -> { cols, samples, rowCount }
  let current = null;           // dentro de un CREATE TABLE
  for await (const line of rl) {
    const mCreate = /^CREATE TABLE `([^`]+)`/.exec(line);
    if (mCreate) { current = mCreate[1]; tablas.push(current); if (CANDIDATA.test(current)) info.set(current, { cols: [], samples: [], rowCount: 0 }); continue; }
    if (current && info.has(current)) {
      const mCol = /^\s*`([^`]+)`\s+(\S+)/.exec(line);
      if (mCol) info.get(current).cols.push(`${mCol[1]} ${mCol[2]}`);
    }
    if (current && /^\)/.test(line)) current = null;
    if (line.startsWith('INSERT INTO `')) {
      const mIns = /^INSERT INTO `([^`]+)` \(([^)]*)\) VALUES /.exec(line);
      if (!mIns || !info.has(mIns[1])) continue;
      const rec = info.get(mIns[1]);
      // conteo estimado de filas de esta sentencia
      rec.rowCount += (line.match(/\),\(/g) || []).length + 1;
      if (rec.samples.length < MAX_SAMPLES) {
        const columns = mIns[2].split(',').map((c) => c.trim().replace(/^`|`$/g, ''));
        parseValues(line.slice(line.indexOf(') VALUES ') + 9), columns, rec.samples, MAX_SAMPLES);
      }
    }
  }
  rl.close();
  console.log(`── ${f} (${tablas.length} tablas)`);
  const cands = [...info.entries()];
  if (!cands.length) { console.log('   sin tablas candidatas'); continue; }
  for (const [t, rec] of cands) {
    console.log(`   ★ ${t} — ~${rec.rowCount} filas`);
    console.log(`     columnas: ${rec.cols.join(', ') || '(no capturadas)'}`);
    rec.samples.forEach((r, i) => console.log(`     [${i + 1}] ${JSON.stringify(r).slice(0, 400)}`));
  }
  // por si el nombre no delata: listar todas las tablas para revisión manual
  console.log(`   todas: ${tablas.join(', ')}`);
}
