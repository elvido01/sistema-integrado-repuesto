// Desplegar una Edge Function sin que el token pase por ningún lado visible.
//
//   npm run deploy:funcion jarvis-transcribir
//
// >>> POR QUE UN SCRIPT Y NO EL COMANDO A PELO <<<
// La forma corta sería:
//
//     SUPABASE_ACCESS_TOKEN=sbp_... supabase functions deploy jarvis-transcribir
//
// y ahí el token queda en el historial del shell, en la lista de procesos, y
// en cualquier registro de lo que se ejecutó. Aquí entra por el entorno del
// proceso hijo y no aparece en ninguna de las tres.
//
// El CLI de npm de Supabase crashea en Windows; se usa el binario directo
// (ver la nota de siempre sobre supabase-go.exe).

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { leerToken } from './secretoLocal.mjs';

const RAIZ = path.resolve(import.meta.dirname, '..');
const PROD = 'zdvxowpuklbypweyqqki';

const funcion = process.argv[2];
if (!funcion) {
  console.error('Uso: node scripts/desplegar-funcion.mjs <nombre-de-la-funcion>');
  process.exit(1);
}

const carpeta = path.join(RAIZ, 'supabase/functions', funcion);
if (!existsSync(carpeta)) {
  console.error(`No existe supabase/functions/${funcion}. ¿Nombre mal escrito?`);
  process.exit(1);
}

const TOKEN = leerToken('SUPABASE_ACCESS_TOKEN');

// El binario del CLI. El wrapper de npm crashea en Windows.
const CANDIDATOS = [
  'C:/Users/PC/supabase-cli/supabase-go.exe',
  'supabase',
];
const cli = CANDIDATOS.find((c) => c === 'supabase' || existsSync(c)) || 'supabase';

console.log(`\n  Desplegando ${funcion} a ${PROD}...\n`);

// Lo que venga despues del nombre se le pasa tal cual al CLI. Hace falta
// para --no-verify-jwt: un webhook que recibe de fuera (TikTok, Meta) no
// puede exigir un JWT que el que llama no tiene, y sin esto responde 401 a
// todo y la plataforma da la URL por muerta.
const extras = process.argv.slice(3);

// (10/10/2026) Las que reciben llamadas SIN sesión (webhooks, el receptor de
// la DGII, la escena del Creativo con su permiso de un solo uso...). Se les
// pone --no-verify-jwt solas: redesplegar creativo-escena sin el flag la dejó
// respondiendo 401 y el Creativo salió con la plantilla hasta que se notó.
// Si una función nueva va sin sesión, agrégala aquí.
const SIN_JWT = new Set([
  'cotizar-morla', 'creativo-escena', 'dgii-receptor', 'hermes-publication-bridge',
  'meta-add-ig-tester', 'meta-messages-webhook', 'meta-subscribe-pages',
  'product-image-upload-bridge', 'social-oauth', 'tiktok-legal', 'tiktok-webhook', 'whatsapp-crm-webhook',
]);
if (SIN_JWT.has(funcion) && !extras.includes('--no-verify-jwt')) {
  extras.push('--no-verify-jwt');
  console.log('  (sin sesión: --no-verify-jwt agregado solo)\n');
}

const hijo = spawn(cli, ['functions', 'deploy', funcion, '--project-ref', PROD, ...extras], {
  cwd: RAIZ,
  // El token va SOLO aquí: ni en el comando, ni en el historial, ni en ps.
  env: { ...process.env, SUPABASE_ACCESS_TOKEN: TOKEN },
  stdio: 'inherit',
  shell: false,
});

hijo.on('error', (e) => {
  console.error(`\n  No se pudo ejecutar el CLI (${cli}): ${e.message}`);
  console.error('  Si no está instalado, se despliega desde el panel de Supabase.\n');
  process.exit(1);
});

hijo.on('exit', (codigo) => {
  console.log(codigo === 0
    ? `\n  ${funcion} desplegada.\n`
    : `\n  Falló el despliegue (código ${codigo}).\n`);
  process.exit(codigo ?? 1);
});
