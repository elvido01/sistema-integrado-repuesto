# Motoflow Print Agent

Agente local de impresión que reemplaza QZ Tray para Motoflow. Sin licencias de $599/año, sin popups de autorización, sin firmas digitales.

## Arquitectura

```
Motoflow Web (React, Cloudflare Pages)
        ↓ HTTP POST localhost:9123/print/raw
Motoflow Print Agent (Node.js en Windows)
        ↓ bytes RAW (ESC/POS, EPL2, ZPL)
Impresora Star / Zebra / EPSON / etc.
```

## Endpoints

| Método | Ruta | Body | Devuelve |
|---|---|---|---|
| `GET` | `/health` | — | `{ ok, agent, version, platform, node }` |
| `GET` | `/printers` | — | `[{ name, status, isDefault, driver, portName }, ...]` |
| `GET` | `/printers/status` | `?printer=Nombre` opcional | `{ ok, printers: [{ name, status, jobs, ... }] }` |
| `GET` | `/jobs` | — | `{ ok, jobs, queueLength }` |
| `GET` | `/jobs/:jobID` | — | `{ ok, job }` |
| `POST` | `/print/raw` | `{ printer, data, format?, encoding? }` | `{ ok, jobID, bytes, printer }` |
| `POST` | `/spooler/restart` | - | Reinicia el Print Spooler de Windows |
| `POST` | `/spooler/clear-stale` | `{ olderThanMinutes?, printer? }` | Limpia trabajos viejos retenidos en Windows |

### Ejemplo de impresión

```js
// Desde Motoflow web
await fetch('http://127.0.0.1:9123/print/raw', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    printer: 'Star TSP100 Cutter (TSP143)',
    format: 'escpos',
    data: '\x1B@Hola Motoflow\n\n\n\x1Bi', // bytes ESC/POS
    encoding: 'binary', // o 'base64' si el data viene codificado
  }),
});
```

## Setup local (desarrollo)

```bash
cd print-agent
npm install
npm start
```

El agente queda escuchando en `http://127.0.0.1:9123`. Verifica con:

```bash
curl http://127.0.0.1:9123/health
```

## Seguridad

- Escucha **solo en 127.0.0.1** (no expuesto a la red local)
- CORS estricto: solo acepta `repuestos-morla.pages.dev`, `motoflow.com.do`, `localhost:5173/4173`
- Sin autenticación adicional (v0.1) — agregar token en v0.2 si publicas el dominio fuera de Motoflow

## Compilar a `.exe` standalone

```bash
npm install
npm run build
# Output: dist/motoflow-print-agent.exe (~30-40 MB, no requiere Node instalado)
```

Nota: el agente no usa `node-printer`; compila un worker C# temporal (`rawprinter.exe`) contra Winspool. Si esa compilacion falla, cae a PowerShell/Add-Type para mantener compatibilidad.

## Instalar como servicio Windows (autostart)

Estado actual:
- `installer.bat` copia el exe a `C:\Program Files\Motoflow\PrintAgent\`
- Autostart por una sola via: Task Scheduler con privilegios altos. Si falla, usa HKLM Run como respaldo unico.
- `install-user.bat` instala sin administrador en `%LOCALAPPDATA%\Motoflow\PrintAgent\` y registra HKCU\Run
- Pendiente: tray icon con menu de diagnostico

## Integración con Motoflow Web

En `src/services/`, crear `motoflowPrintAgent.ts` que detecte si el agente está disponible (`fetch /health` con timeout 500ms). Si responde → usar agente. Si no → fallback a QZ Tray (transición gradual).

```ts
async function isAgentAvailable() {
  try {
    const r = await fetch('http://127.0.0.1:9123/health', {
      signal: AbortSignal.timeout(500),
    });
    return r.ok;
  } catch {
    return false;
  }
}
```

## Roadmap

- [x] v0.1 — POC: HTTP local + listar impresoras + RAW print
- [x] v0.2 — Autostart con Task Scheduler/Run/Startup
- [x] v0.4 — UI de configuracion + diagnostico del agente
- [x] v0.6 — Worker C# rapido, RAW base64, jobID e historial de trabajos
- [ ] v0.7 — Servicio Windows real + tray icon
- [ ] v0.8 — Instalador `.msi` con certificado de firma
- [ ] v0.9 — Auto-actualizacion (descarga nuevas versiones del agente)
- [ ] v1.0 — Soporte multi-tenant (cada empresa con su token)

## ¿Por qué no QZ Tray?

| | QZ Tray Pro | Motoflow Print Agent |
|---|---|---|
| Costo | $599/año por sitio | Gratis |
| Popups | Sí (sin licencia) | No |
| Firma digital | Requiere cert | No necesaria (HTTP local) |
| Tamaño | ~80 MB (Java) | ~35 MB (Node compilado) |
| Custom branding | No | Sí ("Motoflow") |
| Funcionalidades | 50+ features | Solo lo que Motoflow usa |
