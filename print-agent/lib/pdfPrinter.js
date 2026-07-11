// ============================================================
// pdfPrinter.js — impresión SILENCIOSA de PDF en Windows
// ============================================================
// Para hojas grandes (carta/A4: facturas dealer, cierres de caja,
// informes, listas) que no son ESC/POS. Usa SumatraPDF portable:
//   SumatraPDF.exe -print-to "Impresora" -print-settings "shrink,2x"
//                  -silent -exit-when-done archivo.pdf
//
// SumatraPDF se busca en este orden:
//   1. Junto al agente (misma carpeta del .exe / del proyecto)
//   2. Carpetas de instalación de Motoflow PrintAgent
//   3. Instalaciones estándar de SumatraPDF
// Si no aparece, /print/pdf responde con instrucciones claras.
// ============================================================

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP_DIR = path.join(os.tmpdir(), 'motoflow-print-agent');
try { fs.mkdirSync(TMP_DIR, { recursive: true }); } catch (_) {}

let cachedSumatra = null;

function candidatePaths() {
  const exeDir = path.dirname(process.execPath); // carpeta del exe (pkg) o de node
  const appDir = path.dirname(__dirname);        // carpeta del proyecto (modo fuente)
  const local = process.env.LOCALAPPDATA || '';
  const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  return [
    path.join(exeDir, 'SumatraPDF.exe'),
    path.join(appDir, 'SumatraPDF.exe'),
    path.join(appDir, 'bin', 'SumatraPDF.exe'),
    'C:\\Program Files\\Motoflow\\PrintAgent\\SumatraPDF.exe',
    local && path.join(local, 'Motoflow', 'PrintAgent', 'SumatraPDF.exe'),
    local && path.join(local, 'SumatraPDF', 'SumatraPDF.exe'),
    path.join(pf, 'SumatraPDF', 'SumatraPDF.exe'),
    path.join(pf86, 'SumatraPDF', 'SumatraPDF.exe'),
  ].filter(Boolean);
}

function findSumatra() {
  if (cachedSumatra && fs.existsSync(cachedSumatra)) return cachedSumatra;
  cachedSumatra = null;
  for (const p of candidatePaths()) {
    try { if (fs.existsSync(p)) { cachedSumatra = p; break; } } catch (_) {}
  }
  return cachedSumatra;
}

function pdfSupportInfo() {
  const exe = findSumatra();
  return { available