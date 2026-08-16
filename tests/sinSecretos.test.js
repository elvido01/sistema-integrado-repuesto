// Que no vuelva a entrar un secreto al repositorio.
//
// >>> POR QUÉ EXISTE ESTA PRUEBA <<<
// (2026-08-16) Un token de administración de Supabase estuvo escrito en
// cuatro scripts y commiteado. Ese token daba acceso total al proyecto —
// leer, crear y borrar bases enteras — y nadie lo notó porque nada lo
// vigilaba: quien lo puso lo puso trabajando, no con mala intención.
//
// Un secreto se saca una vez; que no vuelva es lo difícil. Esto lo vigila
// en cada `npm test`.
//
// >>> LO QUE NO ES UN SECRETO <<<
// La clave ANON de Supabase sí puede estar en el código: viaja dentro del
// bundle que se descarga el navegador, así que esconderla no esconde nada.
// Lo que la protege es RLS. Por eso aquí se distingue por el rol que lleva
// dentro el JWT y no por su forma.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { readFileSync, statSync } from 'fs';
import { join, extname } from 'path';

const RAIZ = join(import.meta.dirname, '..');

// >>> POR QUÉ NO SE REUSA pareceCredencial() DE vault-sync <<<
// Aquel detector está calibrado para NOTAS: su patrón de JWT le pega a
// cualquiera, y la clave anon es un JWT que aparece a propósito en el código
// del cliente y en todo lo construido. Aquí eso serían decenas de falsos
// positivos y la prueba acabaría desactivada, que es la peor forma de fallar.
// Este scan busca menos cosas y con más puntería: lo que nunca debe estar.

const EXENTOS = new Set([
  // Nombra los patrones que busca.
  'tests/sinSecretos.test.js',
  // Sus fixtures son credenciales falsas a propósito: es la prueba del
  // detector de credenciales del vault.
  'tests/vaultCredenciales.test.js',
]);

const BINARIOS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.pdf', '.zip',
  '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.xlsx', '.db',
]);

const MAX_BYTES = 3_000_000;

// La configuración de Claude Code NO está versionada (.claude/ va en
// .gitignore), así que `git ls-files` no la ve. Y sin embargo ahí aparecieron
// DOS tokens de administración escritos dentro de reglas de permisos: uno
// nunca salió a GitHub y aun así estaba en el disco de la máquina.
// Se vigila aparte, por nombre.
const NO_VERSIONADOS = [
  '.claude/settings.json',
  '.claude/settings.local.json',
];

function archivosDelRepo() {
  const versionados = execFileSync('git', ['ls-files'], { cwd: RAIZ, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  return [...versionados, ...NO_VERSIONADOS]
    .filter((f) => !EXENTOS.has(f))
    .filter((f) => !BINARIOS.has(extname(f).toLowerCase()));
}

function leer(f) {
  try {
    if (statSync(join(RAIZ, f)).size > MAX_BYTES) return null;
    return readFileSync(join(RAIZ, f), 'utf8');
  } catch { return null; }
}

const ARCHIVOS = archivosDelRepo();

// Se arman en trozos para que el patrón no aparezca escrito de corrido en
// ningún sitio y esta prueba no se encuentre a sí misma si algún día deja de
// estar exenta.
const PATRONES = [
  { nombre: 'token de administración de Supabase', re: new RegExp('sb' + 'p_[a-z0-9]{30,}') },
  { nombre: 'clave de OpenAI', re: new RegExp('sk-' + '(proj-)?[A-Za-z0-9_-]{30,}') },
  { nombre: 'clave de Anthropic', re: new RegExp('sk-' + 'ant-[A-Za-z0-9_-]{30,}') },
];

describe('no hay secretos en el repositorio', () => {
  it('lista los archivos versionados', () => {
    // Si esto falla, todo lo de abajo pasaría por vacío y la prueba estaría
    // dando un verde que no significa nada.
    expect(ARCHIVOS.length).toBeGreaterThan(100);
  });

  it.each(PATRONES)('ningún archivo trae $nombre', ({ re }) => {
    const encontrados = [];
    for (const f of ARCHIVOS) {
      const texto = leer(f);
      if (texto && re.test(texto)) encontrados.push(f);
    }
    expect(encontrados, `secreto en: ${encontrados.join(', ')}`).toEqual([]);
  });

  it('ningún JWT lleva el rol service_role', () => {
    // La anon es pública por diseño; la service_role se salta RLS entera y
    // no tiene nada que hacer en el código del cliente ni en un script.
    const jwt = /eyJ[A-Za-z0-9_-]{6,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;
    const encontrados = [];

    for (const f of ARCHIVOS) {
      const texto = leer(f);
      if (!texto) continue;
      for (const m of texto.matchAll(jwt)) {
        let carga;
        try { carga = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8')); } catch { continue; }
        if (carga?.role === 'service_role') encontrados.push(f);
      }
    }

    expect([...new Set(encontrados)], `service_role en: ${encontrados.join(', ')}`).toEqual([]);
  });
});
