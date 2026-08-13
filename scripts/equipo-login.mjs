#!/usr/bin/env node
// ============================================================
// Iniciar sesión con la cuenta del AGENTE
// ------------------------------------------------------------
//   npm run equipo:login       inicia sesion (o la cambia)
//   npm run equipo:cuenta      solo dice cual esta puesta
//
// Abre el login de Claude Code en ~/.claude-agente, no en ~/.claude. Tu
// sesión de VS Code no se toca: son dos casas distintas y pueden estar las
// dos abiertas a la vez con cuentas distintas.
//
// Al terminar dice qué cuenta quedó, que es justo lo que la pantalla del
// módulo no puede saber sola.
// ============================================================

import { spawnSync } from 'node:child_process';
import { CONFIG_DIR, resolverClaude, entorno, cuenta } from './claude-agente.mjs';

const soloVer = process.argv.includes('--ver');
const { cmd, origen } = resolverClaude();

console.log(`
  Claude Code : ${cmd}
                (${origen})
  Casa        : ${CONFIG_DIR}
`);

if (origen === 'no encontrado') {
  console.log(`  No encuentro Claude Code en esta maquina.

  Instalalo, o apunta a el:
    $env:CLAUDE_CMD = "C:\\ruta\\a\\claude.exe"
`);
  process.exit(1);
}

const antes = cuenta(cmd);
if (antes.ok) console.log(`  Cuenta actual del agente: ${antes.email} (${antes.plan || 'plan desconocido'})\n`);
else console.log('  El agente no tiene sesion propia todavia.\n');

if (soloVer) process.exit(antes.ok ? 0 : 1);

// Interactivo a proposito: el login abre el navegador y hay que aprobar.
// stdio heredado para que se vea y se pueda responder.
console.log('  Abriendo el login. Elige la cuenta que quieres para el agente…\n');
const r = spawnSync(cmd, ['auth', 'login'], {
  env: entorno(),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (r.error) {
  console.log(`\n  No se pudo abrir el login: ${r.error.message}`);
  process.exit(1);
}

const despues = cuenta(cmd);
if (!despues.ok) {
  console.log(`\n  Sigue sin sesion. ${despues.motivo || ''}`);
  process.exit(1);
}

console.log(`
  Listo. El agente contesta con: ${despues.email}
  Plan: ${despues.plan || '(no dice)'}${despues.org ? ` · ${despues.org}` : ''}

  Comprueba cuando quieras con:  npm run equipo:cuenta
`);

if (antes.ok && antes.email === despues.email) {
  console.log(`  OJO: quedo la MISMA cuenta que antes (${despues.email}).
  Si querias la otra, vuelve a correrlo y cambia de cuenta en el navegador.
`);
}
