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
const { rawPrint, listPrinters } = require('./lib/winRawPrinter');

const VERSION = '0.4.0';
const PORT = Number(process.env.PORT) || 9123;

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
      const result = await rawPrint(job.printerName, job.buffer);
      job.resolve(result);
    } catch (err) {
      job.resolve({ ok: false, error: err.message });
    }
  }
  queueRunning = false;
  stats.queueLength = 0;
}

function enqueuePrint(printerName, buffer) {
  return new Promise((resolve) => {
    printQueue.push({ printerName, buffer, resolve });
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

app.post('/print/raw', async (req, res) => {
  try {
    const body = req.body || {};
    const { printer: printerName, data, format, encoding } = body;

    if (!printerName) return res.status(400).json({ ok: false, error: 'printer requerido' });
    if (!data) return res.status(400).json({ ok: false, error: 'data requerido' });

    let buffer;
    try {
      buffer = encoding === 'base64' ? Buffer.from(data, 'base64') : Buffer.from(data, 'binary');
    } catch (err) {
      return res.status(400).json({ ok: false, error: 'data inválido: ' + err.message });
    }

    flog(`[print] ${printerName} ${buffer.length} bytes (format=${format || 'raw'}) [cola=${printQueue.length}]`);

    const result = await enqueuePrint(printerName, buffer);
    stats.lastPrintAt = new Date().toISOString();
    if (result.ok) {
      stats.printsOk++;
      res.json({ ok: true, bytes: buffer.length, printer: printerName });
    } else {
      stats.printsFailed++;
      stats.lastError = result.error;
      flog('[print] FAILED: ' + result.error);
      res.status(500).json({ ok: false, error: result.error });
    }
  } catch (err) {
    flog('[print] EXCEPTION: ' + err.message);
    stats.printsFailed++;
    stats.lastError = err.message;
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

// Captura cualquier excepción no manejada para que el proceso NO muera silenciosamente
process.on('uncaughtException', (err) => {
  flog('[uncaughtException] ' + (err.stack || err.message));
});
process.on('unhandledRejection', (reason) => {
  flog('[unhandledRejection] ' + (reason?.stack || reason));
});

app.listen(PORT, '127.0.0.1', () => {
  flog('═══════════════════════════════════════════════════');
  flog(`  Motoflow Print Agent v${VERSION}`);
  flog('═══════════════════════════════════════════════════');
  flog(`  Escuchando en: http://127.0.0.1:${PORT}`);
  flog(`  Log: ${LOG_FILE}`);
  flog('  Endpoints:');
  flog('    GET  /health');
  flog('    GET  /printers');
  flog('    POST /print/raw');
  flog('    POST /spooler/restart');
  flog('    POST /restart-self');
  flog('═══════════════════════════════════════════════════');
});
