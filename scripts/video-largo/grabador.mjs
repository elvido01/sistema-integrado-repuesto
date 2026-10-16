// ============================================================
// GRABADOR DE VOZ EN OFF — teleprompter local para los videos largos
// ============================================================
// (16/10/2026) El dueño no quiere pagar un clon de voz: lee el guion él
// mismo con el micrófono de la PC. Esta página (solo en esta PC,
// http://localhost:5199) muestra cada sección en grande, graba, deja
// escuchar y repetir, limpia el audio y con un botón arma el video con SU voz
// (armar.mjs). Los videos viven en C:\RepuestosMorla\Videos\NN-tema\.
//
// Arranque: doble clic en "Grabar videos.cmd" del Escritorio, o
//   node scripts/video-largo/grabador.mjs
// ============================================================
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { armarVideo, archivoVoz, duracion, leerVideo, limpiarGrabacion } from './armar.mjs';

const PUERTO = Number(process.env.GRABADOR_PUERTO || 5199);
const RAIZ = process.env.VIDEOS_DIR || 'C:/RepuestosMorla/Videos';
const AQUI = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1');
const trabajos = new Map();   // carpeta -> { estado, log[], resultado, error }

const carpetaValida = (c) => /^[\w-]+$/.test(c || '') && existsSync(path.join(RAIZ, c, 'guion.json'));
const json = (res, codigo, cuerpo) => {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(cuerpo));
};
const leerCuerpo = (req, max = 200 * 1024 * 1024) => new Promise((res, rej) => {
  const partes = []; let n = 0;
  req.on('data', (d) => { n += d.length; if (n > max) { rej(new Error('Grabación demasiado grande')); req.destroy(); } else partes.push(d); });
  req.on('end', () => res(Buffer.concat(partes)));
  req.on('error', rej);
});

// Archivos de audio y video con soporte de "Range" (para poder adelantar).
function servirArchivo(req, res, archivo, tipo) {
  if (!existsSync(archivo)) { res.writeHead(404); res.end(); return; }
  const tam = statSync(archivo).size;
  const rango = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (rango) {
    const ini = rango[1] ? Number(rango[1]) : 0;
    const fin = rango[2] ? Math.min(Number(rango[2]), tam - 1) : tam - 1;
    res.writeHead(206, { 'Content-Type': tipo, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${ini}-${fin}/${tam}`,
      'Content-Length': fin - ini + 1, 'Cache-Control': 'no-store' });
    createReadStream(archivo, { start: ini, end: fin }).pipe(res);
    return;
  }
  res.writeHead(200, { 'Content-Type': tipo, 'Content-Length': tam, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' });
  createReadStream(archivo).pipe(res);
}

async function estadoVideo(carpeta) {
  const dir = path.join(RAIZ, carpeta);
  const { guion } = leerVideo(dir);
  const secciones = [];
  for (const [i, s] of guion.secciones.entries()) {
    const f = archivoVoz(dir, i);
    secciones.push({ i, titulo: s.titulo, puntos: s.puntos || [], voz: s.voz,
      grabada: existsSync(f), dur: existsSync(f) ? await duracion(f).catch(() => 0) : 0 });
  }
  return { carpeta, titulo: guion.titulo, secciones,
    video: existsSync(path.join(dir, 'salida', 'video.mp4')) ? statSync(path.join(dir, 'salida', 'video.mp4')).mtimeMs : null };
}

const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PUERTO}`);
    const p = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(readFileSync(path.join(AQUI, 'grabador.html')));
      return;
    }
    if (p[0] !== 'api') { res.writeHead(404); res.end(); return; }

    // Lista de videos
    if (req.method === 'GET' && p[1] === 'videos') {
      mkdirSync(RAIZ, { recursive: true });
      const lista = [];
      for (const c of readdirSync(RAIZ).sort()) {
        if (!carpetaValida(c)) continue;
        const e = await estadoVideo(c);
        lista.push({ carpeta: c, titulo: e.titulo, total: e.secciones.length, grabadas: e.secciones.filter((s) => s.grabada).length });
      }
      json(res, 200, lista);
      return;
    }

    const carpeta = p[2];
    if (!carpetaValida(carpeta)) { json(res, 404, { error: 'Ese video no existe' }); return; }
    const dir = path.join(RAIZ, carpeta);

    if (req.method === 'GET' && p[1] === 'video') { json(res, 200, await estadoVideo(carpeta)); return; }

    // Subir la grabación de una sección: se guarda la original y se limpia.
    if (p[1] === 'audio' && p[3] !== undefined) {
      const i = Number(p[3]);
      const { guion } = leerVideo(dir);
      if (!Number.isInteger(i) || i < 0 || i >= guion.secciones.length) { json(res, 400, { error: 'Sección no válida' }); return; }
      if (req.method === 'POST') {
        const cuerpo = await leerCuerpo(req);
        if (cuerpo.length < 2000) { json(res, 400, { error: 'La grabación salió vacía. Revisa el micrófono.' }); return; }
        mkdirSync(path.join(dir, 'voz', 'original'), { recursive: true });
        const original = path.join(dir, 'voz', 'original', `s${i}-${Date.now()}.webm`);
        writeFileSync(original, cuerpo);
        const dur = await limpiarGrabacion(original, archivoVoz(dir, i));
        json(res, 200, { ok: true, dur });
        return;
      }
      if (req.method === 'GET') { servirArchivo(req, res, archivoVoz(dir, i), 'audio/wav'); return; }
    }

    // Armar el video (en segundo plano; la página pregunta cómo va).
    if (p[1] === 'armar') {
      if (req.method === 'POST') {
        const t = trabajos.get(carpeta);
        if (t?.estado === 'armando') { json(res, 409, { error: 'Ya se está armando' }); return; }
        const trabajo = { estado: 'armando', log: [], resultado: null, error: null };
        trabajos.set(carpeta, trabajo);
        armarVideo(dir, { log: (l) => trabajo.log.push(l) })
          .then((r) => { trabajo.estado = 'listo'; trabajo.resultado = r; })
          .catch((e) => { trabajo.estado = 'error'; trabajo.error = e.message; });
        json(res, 200, { ok: true });
        return;
      }
      json(res, 200, trabajos.get(carpeta) || { estado: 'nada', log: [] });
      return;
    }

    if (req.method === 'GET' && p[1] === 'salida' && ['video.mp4', 'miniatura.jpg'].includes(p[3])) {
      servirArchivo(req, res, path.join(dir, 'salida', p[3]), p[3].endsWith('.mp4') ? 'video/mp4' : 'image/jpeg');
      return;
    }
    if (req.method === 'POST' && p[1] === 'abrir') {
      spawn('explorer.exe', [path.join(dir, 'salida').replace(/\//g, '\\')], { detached: true, stdio: 'ignore' }).unref();
      json(res, 200, { ok: true });
      return;
    }
    json(res, 404, { error: 'No encontrado' });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

// Solo esta PC: nadie de la red puede entrar.
servidor.listen(PUERTO, '127.0.0.1', () => {
  const url = `http://localhost:${PUERTO}`;
  console.log(`Grabador listo en ${url}  (deja esta ventana abierta mientras grabas)`);
  if (!process.env.NO_ABRIR) spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
});
