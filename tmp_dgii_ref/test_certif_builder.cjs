// Test del builder de certificacion contra el set de pruebas real.
const fs = require('fs');
const path = require('path');

// Cargar el builder (port a CJS)
const builderTs = fs.readFileSync(
  path.resolve(__dirname, '../supabase/functions/emitir-fiscal/dgii_certif_builder.ts'),
  'utf-8'
);
// Quitar @ts-nocheck, deno-lint, y exports
const builderJs = builderTs
  .replace(/^\/\/.*$/gm, '')
  .replace(/^export /gm, '')
  .replace(/import [^;]+;/g, '');

// Eval
const m = { exports: {} };
const fn = new Function('module', 'exports', builderJs + '\n; module.exports = { buildEcfFromTestRow, buildRfceFromTestRow };');
fn(m, m.exports);
const { buildEcfFromTestRow, buildRfceFromTestRow } = m.exports;

const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'set_pruebas.json'), 'utf-8'));

// Crear directorio de salida
const outDir = path.resolve(__dirname, 'xmls_generados');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

console.log('=== Generando XMLs de prueba ===\n');

let okCount = 0;
let errCount = 0;
const errores = [];

// ECF
for (const row of data.ECF) {
  try {
    const xml = buildEcfFromTestRow(row);
    const outPath = path.resolve(outDir, `${row.CasoPrueba}.xml`);
    fs.writeFileSync(outPath, xml);
    console.log(`✓ ECF Tipo ${row.TipoeCF} - ${row.CasoPrueba} (${xml.length} bytes)`);
    okCount++;
  } catch (e) {
    console.log(`✗ ECF ${row.CasoPrueba}: ${e.message}`);
    errores.push({ caso: row.CasoPrueba, error: e.message });
    errCount++;
  }
}

// RFCE
for (const row of data.RFCE) {
  try {
    const xml = buildRfceFromTestRow(row);
    const outPath = path.resolve(outDir, `RFCE_${row.CasoPrueba}.xml`);
    fs.writeFileSync(outPath, xml);
    console.log(`✓ RFCE - ${row.CasoPrueba} (${xml.length} bytes)`);
    okCount++;
  } catch (e) {
    console.log(`✗ RFCE ${row.CasoPrueba}: ${e.message}`);
    errores.push({ caso: row.CasoPrueba, error: e.message });
    errCount++;
  }
}

console.log(`\n=== Resultado: ${okCount} ok, ${errCount} errores ===`);
if (errores.length) {
  console.log('Errores:');
  for (const e of errores) console.log(' -', e.caso, ':', e.error);
}

// Mostrar primer XML generado para inspeccion
const muestra = path.resolve(outDir, '133267772E320000000006.xml');
if (fs.existsSync(muestra)) {
  console.log('\n=== Muestra: Tipo 32 (133267772E320000000006.xml) ===');
  const xml = fs.readFileSync(muestra, 'utf-8');
  // Pretty print: agregar saltos de linea entre tags principales
  const pretty = xml.replace(/></g, '>\n<');
  console.log(pretty.slice(0, 3000));
  if (pretty.length > 3000) console.log('... [' + (pretty.length - 3000) + ' chars mas]');
}
