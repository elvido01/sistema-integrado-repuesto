// Carga el listado de contribuyentes de la DGII en public.dgii_contribuyentes.
//
//   node scripts/cargar-rnc-dgii.mjs <ruta a DGII_RNC.zip | DGII_RNC.TXT | .csv>
//
// El archivo sale de https://dgii.gov.do/app/WebApps/ConsultasWeb2/ConsultasWeb/consultas/rnc.aspx
// (botones "Descargar listado de todos los RNC": TXT o CSV). Viene en
// latin1, separado por "|" (TXT) o "," (CSV), con estas columnas:
//   RNC | RAZÓN SOCIAL | NOMBRE COMERCIAL | ACTIVIDAD | ... | FECHA | ESTADO | RÉGIMEN
// Se hace upsert por RNC (solo dígitos), en lotes, con la clave de servicio.
// Volver a correrlo actualiza: lo que la DGII cambió se pisa.
//
// Secretos: solo por scripts/secretoLocal.mjs (nunca escritos aquí).
import { readFileSync } from 'fs';
import path from 'path';
import { leerToken } from './secretoLocal.mjs';

const PROYECTO = 'zdvxowpuklbypweyqqki';
const LOTE = 4000;

const ruta = process.argv[2];
if (!ruta) {
  console.error('Uso: node scripts/cargar-rnc-dgii.mjs <DGII_RNC.zip | .TXT | .csv>');
  process.exit(1);
}

// 1. Leer el archivo (de dentro del zip si hace falta).
let bytes = readFileSync(ruta);
if (/\.zip$/i.test(ruta)) {
  // fflate viene con jspdf; si algún día falta, se descomprime a mano.
  let unzipSync;
  try { ({ unzipSync } = await import('fflate')); } catch {
    console.error('No se puede abrir el .zip aquí: descomprímelo y pasa el DGII_RNC.TXT.'); process.exit(1);
  }
  const dentro = unzipSync(new Uint8Array(bytes));
  const nombre = Object.keys(dentro).find((n) => /\.(txt|csv)$/i.test(n));
  if (!nombre) { console.error('El zip no trae un .TXT ni un .CSV'); process.exit(1); }
  console.log(`Dentro del zip: ${nombre}`);
  bytes = Buffer.from(dentro[nombre]);
}
// La DGII lo publica en latin1; si viniera en UTF-8 se nota por los caracteres de reemplazo.
let texto = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
if ((texto.match(/�/g) || []).length > 20) texto = new TextDecoder('latin1').decode(bytes);

const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
const sep = (lineas[0].match(/\|/g) || []).length >= 3 ? '|' : ',';
console.log(`${lineas.length.toLocaleString()} líneas · separador "${sep}"`);

// CSV con comillas: separar respetando "a, b".
const partirCsv = (l) => {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === ',' && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
};
const partir = (l) => (sep === '|' ? l.split('|') : partirCsv(l)).map((x) => x.trim());
const limpio = (v) => { const s = String(v || '').replace(/\s+/g, ' ').trim(); return s || null; };
// Estado: un campo que sea EXACTAMENTE uno de estos, buscado desde el final
// (un nombre como "ACTIVOS Y SERVICIOS SRL" no es un estado).
const ESTADOS = /^(ACTIVO|SUSPENDIDO|DADO DE BAJA|BAJA|CESE TEMPORAL|ANULADO|INACTIVO|RECHAZADO)$/i;

// 2. Convertir filas.
const filas = new Map();
let saltadas = 0;
for (const l of lineas) {
  const c = partir(l);
  const rnc = String(c[0] || '').replace(/\D/g, '');
  if (rnc.length !== 9 && rnc.length !== 11) { saltadas++; continue; } // encabezado o basura
  if (!limpio(c[1])) { saltadas++; continue; }
  const estado = [...c].reverse().find((x) => ESTADOS.test(x)) || null;
  filas.set(rnc, {
    rnc,
    razon_social: limpio(c[1]),
    nombre_comercial: limpio(c[2]),
    actividad: limpio(c[3]),
    estado: limpio(estado)?.toUpperCase() || null,
    regimen: limpio(c[c.length - 1]),
    actualizado_en: new Date().toISOString(),
  });
}
console.log(`${filas.size.toLocaleString()} contribuyentes · ${saltadas} líneas saltadas`);
if (filas.size < 1000) { console.error('Muy pocas filas: ¿es el archivo correcto? No se carga nada.'); process.exit(1); }

// 3. Clave de servicio (por la API de administración, como los demás scripts).
const T = leerToken('SUPABASE_ACCESS_TOKEN');
const respKeys = await fetch(`https://api.supabase.com/v1/projects/${PROYECTO}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${T}` } });
if (!respKeys.ok) { console.error(`La API de Supabase respondió ${respKeys.status}: ¿venció SUPABASE_ACCESS_TOKEN?`); process.exit(1); }
const ks = await respKeys.json();
const KEY = Array.isArray(ks) ? ks.find((k) => k.type === 'secret')?.api_key : null;
if (!KEY) { console.error('No se pudo obtener la clave de servicio'); process.exit(1); }

// 4. Upsert por lotes.
const inicio = new Date(Date.now() - 60000).toISOString();
const todas = [...filas.values()];
let hechas = 0;
for (let i = 0; i < todas.length; i += LOTE) {
  const lote = todas.slice(i, i + LOTE);
  let intento = 0;
  for (;;) {
    const r = await fetch(`https://${PROYECTO}.supabase.co/rest/v1/dgii_contribuyentes?on_conflict=rnc`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(lote),
    });
    if (r.ok) break;
    const msg = (await r.text()).slice(0, 300);
    if (++intento >= 3) { console.error(`Lote ${i}: ${r.status} ${msg}`); process.exit(1); }
    await new Promise((res) => setTimeout(res, 2000 * intento));
  }
  hechas += lote.length;
  if ((i / LOTE) % 10 === 0 || hechas === todas.length) {
    process.stdout.write(`\r${hechas.toLocaleString()} / ${todas.length.toLocaleString()}`);
  }
}
console.log(`\nListo: ${hechas.toLocaleString()} contribuyentes cargados desde ${path.basename(ruta)}.`);

// 5. Los que la DGII ya no publica se quitan (solo con un listado completo:
// uno cortado borraría contribuyentes que siguen vivos).
if (filas.size >= 300000) {
  const r = await fetch(`https://${PROYECTO}.supabase.co/rest/v1/dgii_contribuyentes?actualizado_en=lt.${encodeURIComponent(inicio)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, Prefer: 'return=minimal' },
  });
  console.log(r.ok ? 'Quitados los que la DGII ya no publica.' : `No se pudieron quitar los viejos: ${r.status}`);
} else {
  console.log('Listado de menos de 300,000: no se quita nada (por si vino incompleto).');
}
