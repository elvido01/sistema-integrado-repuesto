// ════════════════════════════════════════════════════════════════════════
//  estados-whatsapp-pc — la carpeta de la PC para el Estado de WhatsApp
// ════════════════════════════════════════════════════════════════════════
//  30/09/2026. WhatsApp no tiene API para publicar Estados: el dueño los sube
//  a mano desde WhatsApp Web. Pidió que la imagen aprobada esté SIEMPRE en una
//  carpeta fija y que el Estado salga en el historial de Equipo IA.
//
//  Cada minuto:
//   1. Lo que la pantalla apuntó en promo_estados_whatsapp y aún no bajó →
//      se descarga a Pendientes\ con nombre predecible:
//        2026-09-30_banda-delantera-platina-125_historia_9x16.png
//        2026-09-30_banda-delantera-platina-125_reel_9x16.mp4
//   2. Lo que el dueño marcó "ya lo publiqué" → se mueve a Publicados\AAAA-MM\.
//   3. Si una descarga falla, deja una nota en Error\ y lo reintenta.
//
//  Arranca con Windows (acceso directo en la carpeta Inicio, ver
//  scripts/estados-whatsapp-pc.cmd). Una sola copia a la vez (candado).
//
//    node scripts/estados-whatsapp-pc.mjs          (se queda mirando)
//    node scripts/estados-whatsapp-pc.mjs --una    (una vuelta y sale)
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(readFileSync(join(AQUI, 'migracion-siif', '.env'), 'utf8').split(/\r?\n/)
  .filter((l) => l.includes('=') && !l.startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));

const URL_BASE = env.SUPABASE_URL;
const LLAVE = env.SUPABASE_SERVICE_ROLE_KEY;
const TENANT = process.env.ESTADOS_TENANT || '00000000-0000-0000-0000-000000000001';   // Repuestos Morla
const RAIZ = process.env.ESTADOS_CARPETA || 'C:\\RepuestosMorla\\Publicaciones';
const CARPETA = {
  pendientes: join(RAIZ, 'Pendientes'),
  publicados: join(RAIZ, 'Publicados'),
  error: join(RAIZ, 'Error'),
};
const CADA_MS = 60 * 1000;

const log = (...a) => console.log(new Date().toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' }), ...a);

// ── Una sola copia: si ya hay otra viva, esta se va ───────────────────────
const CANDADO = join(RAIZ, '.programa-activo.pid');
function tomarCandado() {
  mkdirSync(RAIZ, { recursive: true });
  if (existsSync(CANDADO)) {
    const pid = Number(readFileSync(CANDADO, 'utf8'));
    try { if (pid && pid !== process.pid) { process.kill(pid, 0); return false; } } catch { /* murió: se toma */ }
  }
  writeFileSync(CANDADO, String(process.pid));
  return true;
}

// ── Base: la API REST con la llave de servicio (esta PC ya la tiene) ──────
async function rest(ruta, init = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/${ruta}`, {
    ...init,
    headers: { apikey: LLAVE, Authorization: `Bearer ${LLAVE}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}
const anotar = (id, campos) => rest(`promo_estados_whatsapp?bundle_id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(campos) });

// ── Nombres predecibles ───────────────────────────────────────────────────
export const slug = (t) => String(t || 'promocion').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'promocion';
const fechaSD = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });   // AAAA-MM-DD
const extension = (url, porDefecto) => (String(url).split('?')[0].match(/\.([a-z0-9]{3,4})$/i)?.[1] || porDefecto).toLowerCase();

export function nombresDe(fila) {
  const base = `${fechaSD(fila.creado_en)}_${slug(fila.titulo)}`;
  return {
    imagen: fila.imagen_url ? `${base}_historia_9x16.${extension(fila.imagen_url, 'png')}` : null,
    video: fila.video_url ? `${base}_reel_9x16.${extension(fila.video_url, 'mp4')}` : null,
  };
}

async function bajar(url, destino) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`no se pudo bajar ${url}: HTTP ${r.status}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  if (!bytes.length) throw new Error(`archivo vacío: ${url}`);
  // A un temporal y luego se renombra: un archivo a medio bajar no debe
  // aparecer en Pendientes como si estuviera listo.
  writeFileSync(`${destino}.bajando`, bytes);
  renameSync(`${destino}.bajando`, destino);
}

function mover(nombre, haciaCarpeta) {
  if (!nombre) return;
  const desde = join(CARPETA.pendientes, nombre);
  if (!existsSync(desde)) return;
  mkdirSync(haciaCarpeta, { recursive: true });
  renameSync(desde, join(haciaCarpeta, nombre));
}

async function vuelta() {
  Object.values(CARPETA).forEach((c) => mkdirSync(c, { recursive: true }));

  // 1) Lo pendiente que aún no bajó.
  const porBajar = await rest(`promo_estados_whatsapp?tenant_id=eq.${TENANT}&descargado_en=is.null&select=*`);
  for (const f of porBajar) {
    const n = nombresDe(f);
    try {
      if (n.imagen) await bajar(f.imagen_url, join(CARPETA.pendientes, n.imagen));
      if (n.video) await bajar(f.video_url, join(CARPETA.pendientes, n.video));
      await anotar(f.bundle_id, { descargado_en: new Date().toISOString(), archivo: n.imagen || n.video, error: null });
      log('bajado:', n.imagen || '', n.video || '');
      const nota = join(CARPETA.error, `${slug(f.titulo)}.txt`);
      if (existsSync(nota)) unlinkSync(nota);
    } catch (e) {
      log('ERROR bajando', f.titulo, e.message);
      writeFileSync(join(CARPETA.error, `${slug(f.titulo)}.txt`), `${new Date().toISOString()}\n${f.titulo}\n${e.message}\n(se reintenta solo cada minuto)\n`);
      await anotar(f.bundle_id, { error: String(e.message).slice(0, 300) }).catch(() => {});
    }
  }

  // 2) Lo ya publicado que sigue en Pendientes.
  const publicados = await rest(`promo_estados_whatsapp?tenant_id=eq.${TENANT}&estado=eq.publicado&descargado_en=not.is.null&movido_en=is.null&select=*`);
  for (const f of publicados) {
    const n = nombresDe(f);
    const mes = fechaSD(f.publicado_en || f.creado_en).slice(0, 7);
    mover(n.imagen, join(CARPETA.publicados, mes));
    mover(n.video, join(CARPETA.publicados, mes));
    await anotar(f.bundle_id, { movido_en: new Date().toISOString() });
    log('movido a Publicados\\' + mes + ':', n.imagen || n.video);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!tomarCandado()) { log('Ya hay otra copia trabajando. Esta se cierra.'); process.exit(0); }
  const una = process.argv.includes('--una');
  log(`Carpeta: ${RAIZ}`);
  do {
    try { await vuelta(); } catch (e) { log('ERROR en la vuelta:', e.message); }
    if (!una) await new Promise((ok) => setTimeout(ok, CADA_MS));
  } while (!una);
}
