// ============================================================
// winRawPrinter.js — v0.3
// ============================================================
// Impresión RAW en Windows sin módulos nativos.
//
// Diseño v0.3 (rápido y robusto):
//   - Al arranque, EXTRAE el código C# a un archivo temporal .cs
//   - Compila a DLL con csc.exe (incluido en .NET Framework de Windows)
//     → produce motoflow-rawprinter.dll en TEMP
//   - Cada print: spawn powershell breve que LoadFrom el DLL y llama
//     SendBytes. Sin Add-Type cada vez (es lo que tardaba 1.5s).
//
// Latencia esperada:
//   - Arranque: 2-3s (compila DLL una sola vez)
//   - Cada print: 200-400ms (spawn PowerShell + LoadFrom DLL ≈ 200ms)
//
// Si la compilación de DLL falla, hay fallback a Add-Type inline.
// ============================================================

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ────────────────────────────────────────────────
// Código C# para impresión RAW (winspool API)
// ────────────────────────────────────────────────
const CSHARP_CODE = `
using System;
using System.IO;
using System.Runtime.InteropServices;

public static class RawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    public static int SendFile(string printerName, string bytesFile) {
        byte[] bytes = File.ReadAllBytes(bytesFile);
        IntPtr hPrinter = IntPtr.Zero;
        IntPtr pUnmanagedBytes = IntPtr.Zero;
        int dwWritten = 0;
        try {
            if (!OpenPrinter(printerName.Normalize(), out hPrinter, IntPtr.Zero))
                throw new Exception("OpenPrinter failed: " + Marshal.GetLastWin32Error());
            DOCINFOA di = new DOCINFOA();
            di.pDocName = "Motoflow Print Job";
            di.pDataType = "RAW";
            if (!StartDocPrinter(hPrinter, 1, di))
                throw new Exception("StartDocPrinter failed: " + Marshal.GetLastWin32Error());
            if (!StartPagePrinter(hPrinter))
                throw new Exception("StartPagePrinter failed: " + Marshal.GetLastWin32Error());
            pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
            Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
            if (!WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten))
                throw new Exception("WritePrinter failed: " + Marshal.GetLastWin32Error());
            EndPagePrinter(hPrinter);
            EndDocPrinter(hPrinter);
            return dwWritten;
        } finally {
            if (pUnmanagedBytes != IntPtr.Zero) Marshal.FreeCoTaskMem(pUnmanagedBytes);
            if (hPrinter != IntPtr.Zero) ClosePrinter(hPrinter);
        }
    }
}
`;

// ────────────────────────────────────────────────
// Setup: compila el DLL una vez al cargar el módulo
// ────────────────────────────────────────────────
const DLL_DIR = path.join(os.tmpdir(), 'motoflow-print-agent');
const DLL_PATH = path.join(DLL_DIR, 'rawprinter.dll');
const CS_PATH = path.join(DLL_DIR, 'rawprinter.cs');

let setupPromise = null;
let setupOk = false;

function findCscExe() {
    // Buscar csc.exe en .NET Framework v4 (incluido por defecto en Windows)
    const candidates = [
        'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
        'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return null;
}

async function setupDll() {
    if (setupPromise) return setupPromise;
    setupPromise = (async () => {
        try {
            if (!fs.existsSync(DLL_DIR)) fs.mkdirSync(DLL_DIR, { recursive: true });
            fs.writeFileSync(CS_PATH, CSHARP_CODE, 'utf8');

            // Si el DLL ya existe y es más nuevo que el .cs, no recompilamos
            if (fs.existsSync(DLL_PATH)) {
                const dllMtime = fs.statSync(DLL_PATH).mtimeMs;
                const csMtime = fs.statSync(CS_PATH).mtimeMs;
                if (dllMtime >= csMtime) {
                    console.log('[PrintAgent] DLL ya existe, no recompilo.');
                    setupOk = true;
                    return;
                }
            }

            const csc = findCscExe();
            if (!csc) {
                console.warn('[PrintAgent] csc.exe no encontrado, usando fallback Add-Type por print.');
                return;
            }

            console.log('[PrintAgent] Compilando DLL con csc.exe...');
            execSync(`"${csc}" /target:library /out:"${DLL_PATH}" "${CS_PATH}"`, {
                stdio: ['ignore', 'pipe', 'pipe'],
                timeout: 30000,
            });
            setupOk = true;
            console.log('[PrintAgent] DLL compilado:', DLL_PATH);
        } catch (err) {
            console.warn('[PrintAgent] Compilación de DLL falló:', err.message);
            console.warn('[PrintAgent] Usando fallback (Add-Type por print, más lento).');
        }
    })();
    return setupPromise;
}

function escapePsString(s) {
    return String(s).replace(/'/g, "''");
}

// ────────────────────────────────────────────────
// rawPrint: imprime bytes RAW
// ────────────────────────────────────────────────

async function rawPrint(printerName, bytes) {
    await setupDll();

    const tempFile = path.join(
        os.tmpdir(),
        `motoflow-print-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.bin`,
    );
    try {
        fs.writeFileSync(tempFile, bytes);
    } catch (err) {
        return { ok: false, error: `No se pudo escribir archivo temp: ${err.message}` };
    }

    const printerEsc = escapePsString(printerName);
    const fileEsc = escapePsString(tempFile);

    // Script PowerShell ONE-LINE con todo encadenado por ;
    let script;
    if (setupOk) {
        // Path rápido: usa el DLL precompilado
        const dllEsc = escapePsString(DLL_PATH);
        script = `try { [Reflection.Assembly]::LoadFrom('${dllEsc}') | Out-Null; $w = [RawPrinter]::SendFile('${printerEsc}', '${fileEsc}'); Write-Output ('OK:' + $w) } catch { Write-Output ('ERR:' + $_.Exception.Message) } finally { Remove-Item -LiteralPath '${fileEsc}' -ErrorAction SilentlyContinue }`;
    } else {
        // Fallback lento: Add-Type inline (cada print compila)
        const csEsc = CSHARP_CODE.replace(/"/g, '\\"').replace(/\$/g, '`$');
        script = `try { Add-Type -TypeDefinition "${csEsc}"; $w = [RawPrinter]::SendFile('${printerEsc}', '${fileEsc}'); Write-Output ('OK:' + $w) } catch { Write-Output ('ERR:' + $_.Exception.Message) } finally { Remove-Item -LiteralPath '${fileEsc}' -ErrorAction SilentlyContinue }`;
    }

    return new Promise((resolve) => {
        const ps = spawn('powershell.exe', [
            '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-Command', script,
        ]);

        let stdout = '';
        let stderr = '';
        ps.stdout.on('data', (d) => (stdout += d.toString()));
        ps.stderr.on('data', (d) => (stderr += d.toString()));

        const timer = setTimeout(() => {
            try { ps.kill(); } catch (_) { /* ignore */ }
            try { fs.unlinkSync(tempFile); } catch (_) { /* ignore */ }
            resolve({ ok: false, error: 'Timeout (20s) esperando respuesta de PowerShell' });
        }, 20000);

        ps.on('close', (code) => {
            clearTimeout(timer);
            try { fs.unlinkSync(tempFile); } catch (_) { /* ignore */ }
            const out = stdout.trim();
            const okLine = out.split(/\r?\n/).reverse().find((l) => l.startsWith('OK:') || l.startsWith('ERR:'));
            if (okLine?.startsWith('OK:')) {
                resolve({ ok: true, bytes: parseInt(okLine.slice(3), 10) || 0 });
            } else if (okLine?.startsWith('ERR:')) {
                resolve({ ok: false, error: okLine.slice(4) });
            } else if (code !== 0) {
                resolve({ ok: false, error: stderr.trim() || `PowerShell exit code ${code}` });
            } else {
                resolve({ ok: false, error: 'Respuesta inesperada de PowerShell: ' + out });
            }
        });

        ps.on('error', (err) => {
            clearTimeout(timer);
            try { fs.unlinkSync(tempFile); } catch (_) { /* ignore */ }
            resolve({ ok: false, error: 'No se pudo iniciar PowerShell: ' + err.message });
        });
    });
}

// ────────────────────────────────────────────────
// listPrinters: lista impresoras Windows
// ────────────────────────────────────────────────

function listPrinters() {
    return new Promise((resolve, reject) => {
        const ps = spawn('powershell.exe', [
            '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-Command',
            `$ErrorActionPreference = 'Stop';
try {
  Get-Printer | Select-Object Name,PrinterStatus,DriverName,PortName | ConvertTo-Json -Compress
} catch {
  Add-Type -AssemblyName System.Drawing;
  [System.Drawing.Printing.PrinterSettings]::InstalledPrinters |
    ForEach-Object { [pscustomobject]@{ Name = $_; PrinterStatus = 0; DriverName = $null; PortName = $null } } |
    ConvertTo-Json -Compress
}`,
        ]);
        const timer = setTimeout(() => {
            ps.kill('SIGKILL');
            reject(new Error('Timeout listando impresoras de Windows'));
        }, 4000);
        let stdout = '';
        let stderr = '';
        ps.stdout.on('data', (d) => (stdout += d.toString()));
        ps.stderr.on('data', (d) => (stderr += d.toString()));
        ps.on('close', (code) => {
            clearTimeout(timer);
            if (code !== 0) return reject(new Error(stderr || `PowerShell exit code ${code}`));
            try {
                const trimmed = stdout.trim();
                if (!trimmed) return resolve([]);
                const parsed = JSON.parse(trimmed);
                const arr = Array.isArray(parsed) ? parsed : [parsed];
                resolve(arr.map((p) => ({
                    name: p.Name,
                    status: p.PrinterStatus,
                    driver: p.DriverName,
                    portName: p.PortName,
                    isDefault: false,
                })));
            } catch (err) {
                reject(new Error('No se pudo parsear: ' + err.message));
            }
        });
        ps.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

// Pre-arrancar la compilación del DLL al cargar el módulo
setupDll().catch((err) => console.warn('[PrintAgent] setupDll error:', err.message));

module.exports = { rawPrint, listPrinters };
