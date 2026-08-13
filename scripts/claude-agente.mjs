// ============================================================
// La cuenta de Claude del agente — separada de la tuya
// ------------------------------------------------------------
// Con el motor `claude_suscripcion`, la cuenta NO sale de la base de
// MotoFlow: sale de la sesión de Claude Code de la máquina donde corre el
// worker. Eso deja una pregunta sin respuesta desde la pantalla —"¿con
// cuál de mis cuentas está contestando?"— y este archivo es lo que la
// contesta.
//
// >>> DOS CASAS, NO UNA <<<
//   ~/.claude          la cuenta con la que TÚ trabajas en VS Code
//   ~/.claude-agente   la cuenta que atiende la cola del equipo
//
// Claude Code lee CLAUDE_CONFIG_DIR para saber dónde vive su sesión. Con
// dos directorios hay dos sesiones a la vez en la misma PC, sin pisarse:
//
//   · el consumo del agente no se come tu cuota, y se ve en qué cuenta va
//   · cerrar sesión en una no deja muda a la otra
//   · `claude auth status` dice cuál es cada una, sin adivinar
//
// Se prepara una sola vez:  npm run equipo:login
// ============================================================

import path from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';

// A propósito NO es ~/.claude. Si alguien quiere que el agente use su
// misma cuenta, lo pone explícito y sabe lo que hace.
export const CONFIG_DIR = process.env.EQUIPO_CLAUDE_CONFIG_DIR
  || process.env.CLAUDE_CONFIG_DIR
  || path.join(homedir(), '.claude-agente');

const EXTS = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];

const enPath = (nombre) => (process.env.PATH || '')
  .split(path.delimiter)
  .filter(Boolean)
  .some((d) => EXTS.some((e) => { try { return existsSync(path.join(d, nombre + e)); } catch { return false; } }));

// Claude Code puede estar instalado de verdad o venir dentro de la
// extensión de VS Code. Lo segundo funciona, pero la ruta lleva el número
// de versión dentro: sirve hoy y se rompe en la próxima actualización. Por
// eso se busca primero en el PATH y el respaldo avisa de lo que es.
const enExtensionVSCode = () => {
  const base = path.join(homedir(), '.vscode', 'extensions');
  if (!existsSync(base)) return null;
  const cands = readdirSync(base)
    .filter((d) => d.startsWith('anthropic.claude-code-'))
    .map((d) => path.join(base, d, 'resources', 'native-binary',
                          process.platform === 'win32' ? 'claude.exe' : 'claude'))
    .filter((f) => existsSync(f))
    // Por fecha y no por nombre: "2.1.229" ordena por encima de "2.1.231"
    // si se comparan como texto.
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return cands[0] || null;
};

export const resolverClaude = () => {
  if (process.env.CLAUDE_CMD) return { cmd: process.env.CLAUDE_CMD, origen: 'CLAUDE_CMD' };
  if (enPath('claude')) return { cmd: 'claude', origen: 'PATH' };
  const ext = enExtensionVSCode();
  if (ext) return { cmd: ext, origen: 'extension de VS Code' };
  return { cmd: 'claude', origen: 'no encontrado' };
};

export const entorno = () => ({ ...process.env, CLAUDE_CONFIG_DIR: CONFIG_DIR });

// `claude auth status` contesta JSON: loggedIn, email, subscriptionType.
// Se pregunta en vez de leer los archivos de sesión a mano — el formato de
// esos archivos es asunto de Claude Code y puede cambiar; el comando es la
// interfaz.
export const cuenta = (cmd) => {
  try {
    const r = spawnSync(cmd, ['auth', 'status'], {
      env: entorno(),
      encoding: 'utf8',
      shell: process.platform === 'win32',
      timeout: 30000,
    });
    if (r.error || r.status !== 0) {
      return { ok: false, motivo: (r.stderr || r.error?.message || `codigo ${r.status}`).trim().slice(0, 300) };
    }
    const j = JSON.parse(String(r.stdout).trim());
    return { ok: !!j.loggedIn, email: j.email, plan: j.subscriptionType, org: j.orgName };
  } catch (e) {
    return { ok: false, motivo: e.message };
  }
};

export const comoIniciarSesion = () => `
  El agente no tiene sesion propia de Claude todavia.

    npm run equipo:login

  Eso abre el login en ${CONFIG_DIR} —una casa aparte— y ahi eliges la
  cuenta que quieres que atienda la cola. Tu sesion de VS Code no se toca.
`;
