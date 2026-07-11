// ============================================================
// Motoflow Print Agent — entrypoint
// ============================================================
// Servicio HTTP local que recibe órdenes de impresión desde la
// web de Motoflow y las envía a impresoras instaladas en Windows.
//
// Endpoints:
//   GET  /health            → confirma que el agente está vivo
//   GET  /printers          → lista impresoras Windows
//   POST /print/raw         → imprime bytes RAW (ESC/POS, EPL2, ZPL)
//   POST /spooler/restart   → reinicia el servicio Print Spooler de Windows
//   POST /restart-self      → reinicia este agente (requiere wrapper .bat)
//
// Escucha SOLO en 127.0.0.1 (no expuesto a red). CORS estricto.
// Sin módulos nativos — usa PowerShell + winspool API.
// ============================================================

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { rawPrint, printImage, listPrinters, getPrinterStatus, cancelStalePrintJobs } = require('./lib/winRawPrinter');

const VERSION = '0.7.0';
const PORT = Number(process.env.PORT) || 9123;
const MAX_PRINT_BYTES = 5 * 1024 * 1024;
const MAX_RECENT_JOBS = 100;

// Log persistente a archivo para diagnosticar cuelgues sin tener la consola abierta.
const LOG_DIR = path.join(os.tmpdir(), 'motoflow-print-agent');
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch (_) {}
const LOG_FILE = path.join(LOG_DIR, 'agent.log');
function flog(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch (_) {}
  console.log(msg);
}

// Stats en memoria para health check enriquecido.
const stats = {
  startedAt: new Date().toISOString(),
  printsOk: 0,
  printsFailed: 0,
  lastPrintAt: null,
  lastError: null,
  queueLength: 0,
};

let nextJobId = 1;
const recentJobs = new Map();

function rememberJob(job) {
  recentJobs.set(job.jobID, job);
  while (recentJobs.size > MAX_RECENT_JOBS) {
    const oldest = recentJobs.keys().next().value;
    recentJobs.delete(oldest);
  }
}

function publicJob(job) {
  if (!job) return null;
  return {
    jobID: job.jobID,
    printer: job.printerName,
    bytes: job.bytes,
    status: job.status,
    ok: job.ok,
    error: job.error,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    windowsBytes: job.windowsBytes,
  };
}

// Patrones de orígenes permitidos. Soporta subdominios dinámicos
// de Cloudflare Pages (ej: ed5cb1ad.repuestos-morla.pages.dev) y
// dominios personalizados de Motoflow.
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/([a-z0-9-]+\.)*repuestos-morla\.pages\.dev$/i,
  /^https:\/\/([a-z0-9-]+\.)*motoflow\.com\.do$/i,
  /^http:\/\/localhost(:\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/i,
];

const app = express();
app.use(express.json({ limit: '10mb' }));

// Chrome/Edge requieren "Private Network Access" (PNA) cuando una página
// HTTPS pública (ej. Cloudflare Pages) hace fetch a 127.0.0.1.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGIN_PATTERNS.some((p) => p.test(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGIN_PATTERNS.some((p) => p.test(origin))) return cb(null, true);
    flog('[CORS] origen bloqueado: ' + origin);
    return cb(new Error('CORS: origen no permitido — ' + origin));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
}));

// ────────────────────────────────────────────────
// Cola serial: un print a la vez para evitar race
// conditions con el spooler de Windows. Si llegan
// muchos prints, los procesa secuencialmente.
// ────────────────────────────────────────────────
const printQueue = [];
let queueRunning = false;

async function processQueue() {
  if (queueRunning) return;
  queueRunning = true;
  while (printQueue.length > 0) {
    stats.queueLength = printQueue.length;
    const job = printQueue.shift();
    try {
      job.status = 'printing';
      job.startedAt = new Date().toISOString();
      flog(`[queue] start job=${job.jobID} kind=${job.kind || 'raw'} printer="${job.printerName}" bytes=${job.buffer.length}`);
      const result = job.kind === 'image'
        ? await printImage(job.printerName, job.buffer, job.opts || {})
        : await rawPrint(job.printerName, job.buffer, job.opts || {});
      job.finishedAt = new Date().toISOString();
      job.ok = !!result.ok;
      job.status = result.ok ? 'complete' : 'failed';
      job.error = result.error || null;
      job.windowsBytes = result.bytes || 0;
      flog(`[queue] done job=${job.jobID} ok=${!!result.ok} bytes=${result.bytes || 0}${result.error ? ' error=' + result.error : ''}`);
      job.resolve(result);
    } catch (err) {
      job.finishedAt = new Date().toISOString();
      job.ok = false;
      job.status = 'failed';
      job.error = err.message;
      job.resolve({ ok: false, error: err.message });
    }
  }
  queueRunning = false;
  stats.queueLength = 0;
}

function enqueuePrint(printerName, buffer, kind = 'raw', opts = {}) {
  const jobID = `mf-${Date.now()}-${nextJobId++}`;
  return new Promise((resolve) => {
    const job = {
      jobID,
      kind,
      opts,
      printerName,
      buffer,
      bytes: buffer.length,
      status: 'queued',
      ok: null,
      error: null,
      windowsBytes: 0,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      resolve: (result) => resolve({ ...result, jobID }),
    };
    rememberJob(job);
    printQueue.push(job);
    stats.queueLength = printQueue.length;
    processQueue();
  });
}

// ────────────────────────────────────────────────
// Endpoints
// ────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    agent: 'motoflow-print-agent',
    version: VERSION,
    platform: process.platform,
    node: process.version,
    stats,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.get('/printers', async (req, res) => {
  try {
    const list = await listPrinters();
    res.json(list);
  } catch (err) {
    flog('[printers] error: ' + err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/printers/status', async (req, res) => {
  try {
    const printerName = typeof req.query.printer === 'string' ? req.query.printer : '';
    const status = await getPrinterStatus(printerName);
    res.json({ ok: true, printers: status });
  } catch (err) {
    flog('[printers/status] error: ' + err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/jobs', (req, res) => {
  res.json({
    ok: true,
    jobs: Array.from(recentJobs.values()).map(publicJob).reverse(),
    queueLength: printQueue.length,
  });
});

app.get('/jobs/:jobID', (req, res) => {
  const job = recentJobs.get(req.params.jobID);
  if (!job) return res.status(404).json({ ok: false, error: 'job no encontrado' });
  res.json({ ok: true, job: publicJob(job) });
});

app.post('/print/raw', async (req, res) => {
  try {
    const body = req.body || {};
    const { printer: printerName, data, format, encoding } = body;
    const copies = Math.max(1, Math.min(20, Math.round(Number(body.copies) || 1)));

    if (!printerName || typeof printerName !== 'string') return res.status(400).json({ ok: false, error: 'printer requerido' });
    if (!data || typeof data !== 'string') return res.status(400).json({ ok: false, error: 'data requerido' });
    if (encoding && !['base64', 'binary'].includes(encoding)) {
      return res.status(400).json({ ok: false, error: 'encoding debe ser base64 o binary' });
    }
    if (format && !['escpos', 'epl', 'zpl', 'raw'].includes(format)) {
      return res.status(400).json({ ok: false, error: 'format debe ser escpos, epl, zpl o raw' });
    }

    let buffer;
    try {
      buffer = encoding === 'base64' ? Buffer.from(data, 'base64') : Buffer.from(data, 'binary');
    } catch (err) {
      return res.status(400).json({ ok: false, error: 'data inválido: ' + err.message });
    }

    if (!buffer.length) return res.status(400).json({ ok: false, error: 'data vacio' });
    if (buffer.length > MAX_PRINT_BYTES) {
      return res.status(413).json({ ok: false, error: `Trabajo demasiado grande (${buffer.length} bytes)` });
    }

    flog(`[print] ${printerName} ${buffer.length} bytes (format=${format || 'raw'}, copies=${copies}) [cola=${printQueue.length}]`);

    const result = await enqueuePrint(printerName, buffer, 'raw', { copies });
    stats.lastPrintAt = new Date().toISOString();
    if (result.ok) {
      stats.printsOk++;
      res.json({ ok: true, jobID: result.jobID, bytes: buffer.length, printer: printerName });
    } else {
      stats.printsFailed++;
      stats.lastError = result.error;
      flog('[print] FAILED: ' + result.error);
      res.status(500).json({ ok: false, jobID: result.jobID, error: result.error });
    }
  } catch (err) {
    flog('[print] EXCEPTION: ' + err.message);
    stats.printsFailed++;
    stats.lastError = err.message;
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ────────────────────────────────────────────────
// /print/image — imprime un PNG (base64) via GDI, SIN diálogo.
// La web renderiza cualquier plantilla HTML a imagen y la manda aquí:
// sirve para facturas/tickets térmicos Y para hojas carta/A4 en
// impresoras láser/inkjet, fiel al diseño y sin ventana del navegador.
//   body: { printer, data(base64 png), widthMM?, copies? }
//     widthMM = ancho del papel térmico (ej. 72). 0/omitido = hoja completa.
// ────────────────────────────────────────────────
app.post('/print/image', async (req, res) => {
  try {
    const body = req.body || {};
    const { printer: printerName, data } = body;
    const widthMM = Math.max(0, Math.min(300, Math.round(Number(body.widthMM) || 0)));
    const copies = Math.max(1, Math.min(20, Math.round(Number(body.copies) || 1)));

    if (!printerName || typeof printerName !== 'string') return res.status(400).json({ ok: false, error: 'printer requerido' });
    if (!data || typeof data !== 'string') return res.status(400).json({ ok: false, error: 'data (png base64) requerido' });

    let buffer;
    try {
      // acepta con o sin prefijo data:image/png;base64,
      const b64 = data.replace(/^data:image\/\w+;base64,/, '');
      buffer = Buffer.from(b64, 'base64');
    } catch (err) {
      return res.status(400).json({ ok: false, error: 'data inválido: ' + err.message });
    }
    if (!buffer.length) return res.status(400).json({ ok: false, error: 'data vacio' });
    if (buffer.length > MAX_PRINT_BYTES) return res.status(413).json({ ok: false, error: `Imagen demasiado grande (${buffer.length} bytes)` });

    flog(`[image] ${printerName} ${buffer.length} bytes (widthMM=${widthMM}, copies=${copies}) [cola=${printQueue.length}]`);
    const result = await enqueuePrint(printerName, buffer, 'image', { widthMM, copies });
    stats.lastPrintAt = new Date().toISOString();
    if (result.ok) {
      stats.printsOk++;
      res.json({ ok: true, jobID: result.jobID, bytes: buffer.length, printer: printerName });
    } else {
      stats.printsFailed++;
      stats.lastError = result.error;
      flog('[image] FAILED: ' + result.error);
      res.status(500).json({ ok: false, jobID: result.jobID, error: result.error });
    }
  } catch (err) {
    flog('[image] EXCEPTION: ' + err.message);
    stats.printsFailed++;
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ────────────────────────────────────────────────
// /spooler/restart — reinicia el Print Spooler de Windows
// ────────────────────────────────────────────────
// El spooler de Windows a veces se cuelga después de muchos
// trabajos. Reiniciarlo destraba la mayoría de los bloqueos
// sin necesidad de reiniciar la PC.
// Requiere admin si el agente NO corre como admin.
app.post('/spooler/restart', async (req, res) => {
  flog('[spooler] reinicio solicitado');
  const ps = spawn('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-Command',
    `try { Restart-Service -Name Spooler -Force -ErrorAction Stop; Write-Output 'OK' } catch { Write-Output ('ERR:' + $_.Exception.Message) }`,
  ]);
  let out = '';
  ps.stdout.on('data', (d) => (out += d.toString()));
  ps.stderr.on('data', (d) => (out += d.toString()));
  const timer = setTimeout(() => { try { ps.kill(); } catch (_) {} }, 15000);
  ps.on('close', () => {
    clearTimeout(timer);
    const trimmed = out.trim();
    if (trimmed.startsWith('OK')) {
      flog('[spooler] reiniciado OK');
      res.json({ ok: true, message: 'Print Spooler reiniciado' });
    } else {
      flog('[spooler] FAILED: ' + trimmed);
      res.status(500).json({
        ok: false,
        error: trimmed,
        hint: 'Puede requerir ejecutar el agente como Administrador',
      });
    }
  });
});

// ────────────────────────────────────────────────
// /restart-self — reinicia el agente
// ────────────────────────────────────────────────
// Si lo instalaste con el wrapper restart.bat, este endpoint
// hace exit(0) y el wrapper lo relanza. Si lo corres directo,
// solo termina el proceso (tienes que reiniciarlo manualmente).
app.post('/spooler/clear-stale', async (req, res) => {
  try {
    const body = req.body || {};
    const olderThanMinutes = Number(body.olderThanMinutes) || 30;
    const printerName = typeof body.printer === 'string' ? body.printer : '';
    flog(`[spooler] limpiar trabajos viejos printer="${printerName || '*'}" olderThan=${olderThanMinutes}m`);
    const result = await cancelStalePrintJobs({ printerName, olderThanMinutes });
    const removedCount = Array.isArray(result.removed) ? result.removed.length : 0;
    const failedCount = Array.isArray(result.failed) ? result.failed.length : 0;
    flog(`[spooler] limpieza complete removed=${removedCount} failed=${failedCount}`);
    res.status(result.ok ? 200 : 207).json(result);
  } catch (err) {
    flog('[spooler] clear-stale FAILED: ' + err.message);
    res.status(500).json({
      ok: false,
      error: err.message,
      hint: 'Puede requerir ejecutar el agente como Administrador',
    });
  }
});

app.post('/restart-self', (req, res) => {
  flog('[restart-self] solicitado, saliendo en 500ms');
  res.json({ ok: true, message: 'Agente se reiniciará en 500ms' });
  setTimeout(() => process.exit(42), 500); // exit code 42 = restart
});

// 404
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'ruta no encontrada' });
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  flog('[error] ' + (err.stack || err.message));
  if (err.message?.startsWith('CORS')) {
    return res.status(403).json({ ok: false, error: err.message });
  }
  res.status(500).json({ ok: false, error: err.message });
});

// Captura cualquier excepción no manejada. Loguea y sale con exit code 1
// para que el wrapper start-as-service.bat lo relance.
// (Si solo logueamos sin salir, Node sigue con estado posiblemente corrupto.)
process.on('uncaughtException', (err) => {
  if (err.code === 'EADDRINUSE') {
    flog(`[startup] puerto ${PORT} ya esta en uso; otro agente esta corriendo. Saliendo sin relanzar.`);
    setTimeout(() => process.exit(0), 100);
    return;
  }
  flog('[uncaughtException] ' + (err.stack || err.message));
  flog('[exit] saliendo con code 1 para que el wrapper relance');
  setTimeout(() => process.exit(1), 100);
});
process.on('unhandledRejection', (reason) => {
  flog('[unhandledRejection] ' + (reason?.stack || reason));
  flog('[exit] saliendo con code 1 para que el wrapper relance');
  setTimeout(() => process.exit(1), 100);
});

// Handlers de señales para diagnosticar QUE mato el agente cuando
// "se cae solo". Loguea y sale con exit 1 (el wrapper relanza).
// SIGBREAK lo manda Windows al cerrar sesion RDP / logoff.
['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP'].forEach((sig) => {
  process.on(sig, () => {
    flog(`[signal] recibido ${sig}, saliendo con code 1 para relanzar`);
    setTimeout(() => process.exit(1), 100);
  });
});

// Heartbeat: cada 60s loguea que sigue vivo. Sirve para distinguir
// "el agente murio en silencio" vs "esta vivo pero no responde".
setInterval(() => {
  flog(`[heartbeat] uptime=${Math.round(process.uptime())}s prints=${stats.printsOk}/${stats.printsFailed} queue=${printQueue.length}`);
}, 60000).unref();

app.listen(PORT, '127.0.0.1', () => {
  flog('═══════════════════════════════════════════════════');
  flog(`  Motoflow Print Agent v${VERSION}`);
  flog('═══════════════════════════════════════════════════');
  flog(`  Escuchando en: http://127.0.0.1:${PORT}`);
  flog(`  Log: ${LOG_FILE}`);
  flog('  Endpoints:');
  flog('    GET  /health');
  flog('    GET  /printers');
  flog('    GET  /printers/status');
  flog('    GET  /jobs');
  flog('    GET  /jobs/:jobID');
  flog('    POST /print/raw');
  flog('    POST /print/image');
  flog('    POST /spooler/restart');
  flog('    POST /spooler/clear-stale');
  flog('    POST /restart-self');
  flog('═══════════════════════════════════════════════════');
});
