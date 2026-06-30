// Parser de volcados mysqldump (SiiF/SCV8) SIN necesidad de MySQL.
// Lee el archivo .SQL en streaming y extrae las filas de una tabla a objetos.
//
// Formato esperado (extended insert con lista de columnas explícita):
//   INSERT INTO `tabla` (`col1`, `col2`, ...) VALUES (v,'s',NULL,...),(...),...;
// Cada sentencia INSERT viene en UNA sola línea (mysqldump escapa los saltos).

import fs from 'node:fs';
import readline from 'node:readline';

// Separa la lista de columnas del bloque VALUES de una línea INSERT.
function splitColumnsAndValues(line) {
  const sep = ') VALUES ';
  const idx = line.indexOf(sep);
  if (idx === -1) return null;
  const colsPart = line.slice(line.indexOf('(') + 1, idx); // entre el 1er '(' y ') VALUES '
  const columns = colsPart.split(',').map((c) => c.trim().replace(/^`|`$/g, ''));
  const values = line.slice(idx + sep.length); // empieza en '(' de la 1ra fila
  return { columns, values };
}

function finalizeBare(v) {
  const t = v.trim();
  if (t === '' || t.toUpperCase() === 'NULL') return null;
  return t; // número o palabra clave; se deja como texto
}

// Tokeniza el bloque VALUES en filas (arrays de campos), respetando comillas y escapes.
function parseValues(s, columns, rows) {
  const n = s.length;
  let i = 0;
  while (i < n) {
    while (i < n && s[i] !== '(') i++; // ir al inicio de la tupla
    if (i >= n) break;
    i++; // saltar '('
    const fields = [];
    let cur = '';
    let inStr = false;
    let quoted = false;
    while (i < n) {
      const ch = s[i];
      if (inStr) {
        if (ch === '\\') { cur += s[i + 1] ?? ''; i += 2; continue; }
        if (ch === "'") {
          if (s[i + 1] === "'") { cur += "'"; i += 2; continue; } // '' escapado
          inStr = false; i++; continue;
        }
        cur += ch; i++; continue;
      }
      if (ch === "'") { inStr = true; quoted = true; i++; continue; }
      if (ch === ',') { fields.push(quoted ? cur : finalizeBare(cur)); cur = ''; quoted = false; i++; continue; }
      if (ch === ')') { fields.push(quoted ? cur : finalizeBare(cur)); i++; break; }
      cur += ch; i++;
    }
    const obj = {};
    for (let k = 0; k < columns.length; k++) obj[columns[k]] = fields[k] ?? null;
    rows.push(obj);
  }
}

// Devuelve { columns, rows } de una tabla dentro de un dump.
export async function parseTable(filePath, table) {
  const prefix = 'INSERT INTO `' + table + '` (';
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });
  let columns = null;
  const rows = [];
  for await (const line of rl) {
    if (!line.startsWith(prefix)) continue;
    const parsed = splitColumnsAndValues(line);
    if (!parsed) continue;
    if (!columns) columns = parsed.columns;
    parseValues(parsed.values, parsed.columns, rows);
  }
  rl.close();
  return { columns, rows };
}
