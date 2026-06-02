// ============================================================
// Motoflow Print Agent — entrypoint
// ============================================================
// Servicio HTTP local que recibe órdenes de impresión desde la
// web de Motoflow y las envía a impresoras instaladas en Windows.
//
// Endpoints:
//   GET  /health        → confirma que el agente está vivo
//   GET  /printers      → lista impresoras Windows
//   POST /print/raw     → imprime bytes RAW (ESC/POS, EPL2, ZPL)
//
// Escucha SOLO en 127.0.0.1 (no expuesto a red). CORS estricto.
// Sin módulos nativos — usa PowerShell + winspool API.
// ============================================================

const express = require('express');
const cors = require('cors');
const { rawPrint, listPrinters } = require('./lib/winRawPrinter');

const VERSION = '0.1.0';
const PORT = Number(process.env.PORT) || 9123;

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
// HTTPS pública (ej. Cloudflare Pages) hace fetch a 127.0.0.1. El servidor
// local debe responder al preflight OPTIONS con el header
// `Access-Control-Allow-Private-Network: true`. Sin esto, el fetch falla
// silenciosamente con "Failed to fetch" en consola.
// Ref: https://wicg.github.io/private-network-access/
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
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

app.use(
  cors({
    origin: (origin, cb) => {
      // Permite herramientas locales sin Origin (curl, postman)
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGIN_PATTERNS.some((p) => p.test(origin))) {
        return cb(null, true);
      }
      console.warn('[CORS] origen bloqueado:', origin);
      return cb(new Error('CORS: origen no permitido — ' + origin));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
  }),
);

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
  });
});

app.get('/printers', async (req, res) => {
  try {
    const list = await listPrinters();
    res.json(list);
  } catch (err) {
    console.error('[printers] error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/print/raw', async (req, res) => {
  const body = req.body || {};
  const { printer: printerName, data, format, encoding } = body;

  if (!printerName) return res.status(400).json({ ok: false, error: 'printer requerido' });
  if (!data) return res.status(400).json({ ok: false, error: 'data requerido' });

  let buffer;
  try {
    if (encoding === 'base64') {
      buffer = Buffer.from(data, 'base64');
    } else {
      buffer = Buffer.from(data, 'binary');
    }
  } catch (err) {
    return res.status(400).json({ ok: false, error: 'data inválido: ' + err.message });
  }

  console.log(`[print] ${printerName} ${buffer.length} bytes (format=${format || 'raw'})`);

  const result = await rawPrint(printerName, buffer);
  if (result.ok) {
    res.json({ ok: true, bytes: buffer.length, printer: printerName });
  } else {
    console.error('[print] error:', result.error);
    res.status(500).json({ ok: false, error: result.error });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'ruta no encontrada' });
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (err.message?.startsWith('CORS')) {
    return res.status(403).json({ ok: false, error: err.message });
  }
  res.status(500).json({ ok: false, error: err.message });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Motoflow Print Agent v${VERSION}`);
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Escuchando en: http://127.0.0.1:${PORT}`);
  console.log('  Endpoints:');
  console.log('    GET  /health');
  console.log('    GET  /printers');
  console.log('    POST /print/raw');
  console.log('');
  console.log('  Orígenes permitidos (regex):');
  ALLOWED_ORIGIN_PATTERNS.forEach((p) => console.log(`    · ${p}`));
  console.log('═══════════════════════════════════════════════════');
});
