// =====================================================================
// play-testers.mjs — testers de la prueba cerrada de MotoFlow en Google Play
// ---------------------------------------------------------------------
// (19/11/2026) Para publicar la app, Google exige 12 testers en prueba
// CERRADA durante 14 días seguidos. La API de Play solo deja poner GRUPOS de
// Google como testers (no correos sueltos), así que el camino automático es:
//   1. Un Grupo de Google abierto ("cualquiera puede unirse").
//   2. Ese grupo como tester de la pista cerrada (este script).
//   3. El botón "Instalar en Android" de MotoFlow guía a cada persona:
//      unirse al grupo → aceptar la prueba → instalar.
//
// Uso (desde la raíz del repo):
//   node scripts/play-testers.mjs                      # ver pistas y testers
//   node scripts/play-testers.mjs --grupo x@googlegroups.com [--pista alpha]
//
// Clave: mobile/play-service-account.json (SECRETO, nunca al repo).
// =====================================================================
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const PAQUETE = 'com.motoflow.app';
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PAQUETE}`;
const args = process.argv.slice(2);
const valor = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const grupo = valor('--grupo');
const pista = valor('--pista') || 'alpha';

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
for (const tr of tracks) {
  const rel = (tr.releases || []).map((x) => `${x.name || '?'} [${(x.versionCodes || []).join(',')}] ${x.status}`).join(' | ');
  let testers = '';
  if (['alpha', 'beta', 'internal'].includes(tr.track) || !['production'].includes(tr.track)) {
    try { testers = JSON.stringify((await llamar('GET', `${e}/testers/${tr.track}`)).googleGroups || []); } catch (er) { testers = `(${er.message.slice(0, 80)})`; }
  }
  console.log(`${tr.track.padEnd(12)} ${rel || '(sin versiones)'}  grupos=${testers}`);
}

if (grupo) {
  const actual = await llamar('GET', `${e}/testers/${pista}`).catch(() => ({}));
  const grupos = [...new Set([...(actual.googleGroups || []), grupo])];
  await llamar('PUT', `${e}/testers/${pista}`, { googleGroups: grupos });
  await llamar('POST', `${e}:commit`);
  console.log(`✔ ${pista}: grupos de testers = ${grupos.join(', ')}`);
} else {
  await llamar('DELETE', e).catch(() => {});
}
