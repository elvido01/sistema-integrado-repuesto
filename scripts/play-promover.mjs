// =====================================================================
// play-promover.mjs — poner una versión de la app en otra pista de Play
// ---------------------------------------------------------------------
// (21/11/2026) EAS manda cada build a la pista ALPHA (prueba cerrada), pero
// el teléfono del dueño está en INTERNAL: si no se copia, la versión nueva
// no le llega (pasó el 30/10 con la 1.0.1). Este script la copia.
//
// Uso (desde la raíz del repo):
//   node scripts/play-promover.mjs 31              # versionCode 31 → internal
//   node scripts/play-promover.mjs 31 --pista beta
//
// Clave: mobile/play-service-account.json (SECRETO, nunca al repo).
// =====================================================================
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const PAQUETE = 'com.motoflow.app';
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PAQUETE}`;
const args = process.argv.slice(2);
const codigo = args.find((a) => /^\d+$/.test(a));
const pista = (() => { const i = args.indexOf('--pista'); return i >= 0 ? args[i + 1] : 'internal'; })();
if (!codigo) { console.error('Uso: node scripts/play-promover.mjs <versionCode> [--pista internal]'); process.exit(1); }

const sa = JSON.parse(readFileSync(new URL('../mobile/play-service-account.json', import.meta.url), 'utf8'));

async function token() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const ahora = Math.floor(Date.now() / 1000);
  const cuerpo = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600,
  })}`;
  const firma = createSign('RSA-SHA256').update(cuerpo).sign(sa.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${cuerpo}.${firma}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`token: ${JSON.stringify(j)}`);
  return j.access_token;
}

const t = await token();
const llamar = async (metodo, ruta, body) => {
  const r = await fetch(`${API}${ruta}`, {
    method: metodo, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${metodo} ${ruta}: ${r.status} ${JSON.stringify(j.error?.message || j)}`);
  return j;
};

const edit = await llamar('POST', '/edits', {});
const e = `/edits/${edit.id}`;
const { tracks = [] } = await llamar('GET', `${e}/tracks`);
const origen = tracks.flatMap((tr) => tr.releases || []).find((r) => (r.versionCodes || []).includes(codigo));
if (!origen) throw new Error(`No encontré el versionCode ${codigo} en ninguna pista.`);

await llamar('PUT', `${e}/tracks/${pista}`, {
  track: pista,
  releases: [{ name: origen.name, versionCodes: [codigo], status: 'completed', releaseNotes: origen.releaseNotes }],
});
await llamar('POST', `${e}:commit`);
console.log(`✔ ${origen.name || codigo} (code ${codigo}) puesta en la pista ${pista}.`);
