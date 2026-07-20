#!/usr/bin/env node
// =====================================================================
// Sincronizador del vault de Obsidian <-> Supabase
// ---------------------------------------------------------------------
// Corre en la PC de Elvido. Sube lo que él escribe en Obsidian y baja lo
// que escriben Hermes (otra PC) y Claude. Así los tres ven lo mismo.
//
//   node scripts/vault-sync/sync.mjs            # sincroniza y queda vigilando
//   node scripts/vault-sync/sync.mjs --una-vez  # sincroniza y sale
//   node scripts/vault-sync/sync.mjs --simular  # muestra qué haría, sin tocar nada
//
// Requiere en scripts/migracion-siif/.env:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// y VAULT_TENANT_ID (la empresa bajo la que viven las notas).
// =====================================================================

import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile, readdir, mkdir, unlink, stat } from 'node:fs/promises';
import { existsSync, watch } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  hashContenido, parsearNota, duenoDeRuta, decidirAccion, nombreConflicto,
  pareceCredencial,
} from './vaultSyncCore.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..', '..');
const VAULT = join(RAIZ, 'vault');
const ESTADO = join(AQUI, '.estado.json');

const SIMULAR = process.argv.includes('--simular');
const UNA_VEZ = process.argv.includes('--una-vez');

// --- credenciales -----------------------------------------------------
const envMigracion = join(RAIZ, 'scripts', 'migracion-siif', '.env');
if (existsSync(envMigracion)) {
  const texto = await readFile(envMigracion, 'utf8');
  for (const linea of texto.split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT = process.env.VAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';

if (!URL || !KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (scripts/migracion-siif/.env)');
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });

// --- utilidades -------------------------------------------------------
const log = (icono, msg) => console.log(`${icono} ${msg}`);
const hoyISO = () => new Date().toISOString().slice(0, 10);
const aRuta = (abs) => relative(VAULT, abs).split(sep).join('/');

const IGNORAR = (ruta) =>
  ruta.startsWith('.obsidian/') ||
  ruta.includes('/.obsidian/') ||
  /\.conflicto-\d{4}-\d{2}-\d{2}\.md$/.test(ruta) ||
  !ruta.endsWith('.md');

async function listarArchivos(dir = VAULT) {
  const salida = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === '.obsidian' || e.name === '.git') continue;
    const abs = join(dir, e.name);
    if (e.isDirectory()) salida.push(...(await listarArchivos(abs)));
    else if (e.isFile()) {
      const ruta = aRuta(abs);
      if (!IGNORAR(ruta)) salida.push(ruta);
    }
  }
  return salida;
}

async function leerEstado() {
  try { return JSON.parse(await readFile(ESTADO, 'utf8')); } catch { return {}; }
}
async function guardarEstado(e) {
  if (!SIMULAR) await writeFile(ESTADO, JSON.stringify(e, null, 2), 'utf8');
}

// --- sincronización ---------------------------------------------------
async function sincronizar() {
  const base = await leerEstado();

  const rutasLocales = await listarArchivos();
  const locales = new Map();
  for (const ruta of rutasLocales) {
    const contenido = await readFile(join(VAULT, ruta), 'utf8');
    locales.set(ruta, { contenido, hash: hashContenido(contenido) });
  }

  const { data: filas, error } = await db
    .from('vault_notas')
    .select('ruta, contenido, hash, autor, borrada, updated_at')
    .eq('tenant_id', TENANT);
  if (error) throw error;

  const remotos = new Map();
  for (const f of filas || []) {
    if (f.borrada) continue;
    remotos.set(f.ruta, { ...f, hash: f.hash || hashContenido(f.contenido) });
  }

  const todas = new Set([...locales.keys(), ...remotos.keys()]);
  const resumen = { subidas: 0, bajadas: 0, conflictos: 0, borradas: 0, sinCambio: 0 };

  for (const ruta of [...todas].sort()) {
    const local = locales.get(ruta) || null;
    const remoto = remotos.get(ruta) || null;

    const { accion, motivo } = decidirAccion({
      hashLocal: local?.hash ?? null,
      hashRemoto: remoto?.hash ?? null,
      hashBase: base[ruta] ?? null,
    });

    if (accion === 'nada') {
      resumen.sinCambio++;
      if (local) base[ruta] = local.hash;
      continue;
    }

    if (accion === 'subir') {
      // Cortamos aquí: mejor no mandar la credencial a la red aunque el
      // trigger la fuera a rechazar igual.
      if (pareceCredencial(local.contenido)) {
        log('🔒', `${ruta} NO se sube: parece contener una credencial. Sácala y vuelve a guardar.`);
        continue;
      }
      const autor = duenoDeRuta(ruta);
      const meta = parsearNota(local.contenido, ruta);
      log('↑', `${ruta}  (${motivo})`);
      if (!SIMULAR) {
        const { error: e } = await db.from('vault_notas').upsert({
          tenant_id: TENANT,
          ruta,
          titulo: meta.titulo,
          contenido: local.contenido,
          autor,
          wikilinks: meta.wikilinks,
          tags: meta.tags,
          hash: local.hash,
          borrada: false,
        }, { onConflict: 'tenant_id,ruta' });
        if (e) { log('✗', `  no se pudo subir: ${e.message}`); continue; }
      }
      base[ruta] = local.hash;
      resumen.subidas++;
      continue;
    }

    if (accion === 'bajar') {
      log('↓', `${ruta}  (${motivo}, por ${remoto.autor})`);
      if (!SIMULAR) {
        const abs = join(VAULT, ruta);
        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, remoto.contenido, 'utf8');
      }
      base[ruta] = remoto.hash;
      resumen.bajadas++;
      continue;
    }

    if (accion === 'borrar-remoto') {
      log('␡', `${ruta}  (${motivo})`);
      if (!SIMULAR) {
        // Borrado suave: la fila queda, el texto no se pierde.
        await db.from('vault_notas').update({ borrada: true })
          .eq('tenant_id', TENANT).eq('ruta', ruta);
      }
      delete base[ruta];
      resumen.borradas++;
      continue;
    }

    if (accion === 'borrar-local') {
      log('␡', `${ruta}  (${motivo})`);
      if (!SIMULAR && existsSync(join(VAULT, ruta))) await unlink(join(VAULT, ruta));
      delete base[ruta];
      resumen.borradas++;
      continue;
    }

    if (accion === 'conflicto') {
      // Nunca pisamos. Dejamos la versión remota al lado y avisamos.
      const rutaConf = nombreConflicto(ruta, hoyISO());
      log('⚠', `CONFLICTO en ${ruta} — la versión de ${remoto.autor} quedó en ${rutaConf}`);
      if (!SIMULAR) {
        const abs = join(VAULT, rutaConf);
        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, remoto.contenido, 'utf8');
      }
      resumen.conflictos++;
      continue;
    }
  }

  await guardarEstado(base);

  const partes = [];
  if (resumen.subidas)    partes.push(`${resumen.subidas} subida(s)`);
  if (resumen.bajadas)    partes.push(`${resumen.bajadas} bajada(s)`);
  if (resumen.borradas)   partes.push(`${resumen.borradas} borrada(s)`);
  if (resumen.conflictos) partes.push(`${resumen.conflictos} CONFLICTO(S)`);
  log('✓', partes.length
    ? `Sincronizado: ${partes.join(', ')} · ${resumen.sinCambio} sin cambio`
    : `Todo al día (${resumen.sinCambio} notas)`);

  return resumen;
}

// --- vigilancia -------------------------------------------------------
let pendiente = null;
const programar = (razon) => {
  clearTimeout(pendiente);
  pendiente = setTimeout(() => {
    sincronizar().catch((e) => log('✗', `Error sincronizando: ${e.message}`));
  }, 1500);   // debounce: Obsidian guarda varias veces seguidas
};

async function vigilar() {
  log('👁', `Vigilando ${VAULT}`);
  watch(VAULT, { recursive: true }, (_tipo, archivo) => {
    if (!archivo) return;
    const ruta = archivo.split(sep).join('/');
    if (IGNORAR(ruta)) return;
    programar(`disco: ${ruta}`);
  });

  db.channel('vault-sync')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'vault_notas', filter: `tenant_id=eq.${TENANT}` },
      (p) => {
        // Ignoramos el eco de lo que acabamos de subir nosotros
        if (p.new?.autor === 'elvido') return;
        programar('supabase');
      })
    .subscribe((estado) => {
      if (estado === 'SUBSCRIBED') log('📡', 'Escuchando cambios de Hermes en tiempo real');
    });

  log('', 'Ctrl+C para salir.');
}

// --- arranque ---------------------------------------------------------
if (SIMULAR) log('🔍', 'MODO SIMULACIÓN — no se escribe nada');
log('🗂', `Vault: ${VAULT}`);
log('🏢', `Empresa: ${TENANT}`);

try {
  await sincronizar();
  if (!UNA_VEZ) await vigilar();
} catch (e) {
  console.error('✗', e.message);
  process.exit(1);
}
