import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Printer, Usb, Trash2, RefreshCw, AlertTriangle, Check, Server, Download, Zap } from 'lucide-react';
import {
  isWebUsbSupported,
  webUsbSelectReceiptPrinter,
  webUsbSelectLabelPrinter,
  webUsbGetPairedPrinters,
  webUsbForgetPrinter
} from '@/services/webUsbPrintService';
import { qzListAllPrinters, qzIsAvailable } from '@/services/qzTrayService';
import {
  agentIsAvailable,
  agentListPrinters,
  agentInvalidateCache,
  agentGetHealth,
  agentGetJobs,
  agentGetPrinterStatus,
  agentRestartSpooler,
  agentRestartSelf,
} from '@/services/motoflowPrintAgent';
import { setPreferredBackend, getPreferredBackend } from '@/services/printerAdapter';

// localStorage keys para impresoras QZ Tray (todas las Windows)
const QZ_RECEIPT_KEY = 'qz_receipt_printer';
const QZ_LABEL_KEY = 'qz_label_printer';
const QZ_INVOICE_KEY = 'qz_invoice_printer';

const PrinterSettings = () => {
  const { toast } = useToast();
  const [printers, setPrinters] = useState({ receipt: null, label: null });
  const [loading, setLoading] = useState(false);
  const supported = isWebUsbSupported();

  // Estado QZ Tray
  const [qzAvailable, setQzAvailable] = useState(false);
  const [qzPrinters, setQzPrinters] = useState([]);
  const [qzReceipt, setQzReceipt] = useState(() => localStorage.getItem(QZ_RECEIPT_KEY) || '');
  const [qzLabel, setQzLabel] = useState(() => localStorage.getItem(QZ_LABEL_KEY) || '');
  const [qzInvoice, setQzInvoice] = useState(() => localStorage.getItem(QZ_INVOICE_KEY) || '');
  const [qzLoading, setQzLoading] = useState(false);

  // Estado Motoflow Print Agent
  const [agentAvailable, setAgentAvailable] = useState(false);
  const [agentPrintersCount, setAgentPrintersCount] = useState(0);
  const [agentChecking, setAgentChecking] = useState(false);
  const [agentHealth, setAgentHealth] = useState(null);
  const [agentJobs, setAgentJobs] = useState([]);
  const [agentPrinterStatus, setAgentPrinterStatus] = useState([]);
  const [restartingSpooler, setRestartingSpooler] = useState(false);
  const [restartingAgent, setRestartingAgent] = useState(false);

  // Selector de backend activo
  const [backend, setBackend] = useState(() => getPreferredBackend());

  const handleBackendChange = (newBackend) => {
    setPreferredBackend(newBackend);
    setBackend(newBackend);
    const labels = {
      auto: 'Auto (recomendado)',
      agent: 'Solo Motoflow Print Agent',
      qz: 'Solo QZ Tray',
    };
    toast({ title: 'Backend cambiado', description: labels[newBackend] });
  };

  // Resuelve cuál backend se está USANDO realmente (no solo la preferencia)
  const resolvedBackend =
    backend === 'agent' ? 'agent'
    : backend === 'qz' ? 'qz'
    : agentAvailable ? 'agent'
    : qzAvailable ? 'qz'
    : 'none';

  const refreshPrinters = async () => {
    if (!supported) return;
    const paired = await webUsbGetPairedPrinters();
    setPrinters(paired);
  };

  const refreshQzPrinters = async () => {
    setQzLoading(true);
    try {
      const isUp = await qzIsAvailable();
      setQzAvailable(isUp);
      if (isUp) {
        const list = await qzListAllPrinters();
        setQzPrinters(list);
      } else {
        setQzPrinters([]);
      }
    } catch (err) {
      console.warn('[QZ] error listando impresoras:', err.message);
      setQzAvailable(false);
      setQzPrinters([]);
    } finally {
      setQzLoading(false);
    }
  };

  const refreshAgent = async () => {
    setAgentChecking(true);
    try {
      agentInvalidateCache();
      const ok = await agentIsAvailable();
      setAgentAvailable(ok);
      console.log('[Agent] /health respondió:', ok);
      if (ok) {
        // El agente responde — traemos health (stats) e impresoras en paralelo
        const [health, list, jobs, status] = await Promise.all([
          agentGetHealth().catch(() => null),
          agentListPrinters().catch((e) => {
            console.warn('[Agent] /printers falló pero /health OK:', e.message);
            return [];
          }),
          agentGetJobs().catch(() => []),
          agentGetPrinterStatus().catch(() => []),
        ]);
        setAgentHealth(health);
        setAgentPrintersCount(list?.length || 0);
        setAgentJobs(jobs || []);
        setAgentPrinterStatus(status || []);
        console.log('[Agent] health:', health);
      } else {
        setAgentPrintersCount(0);
        setAgentHealth(null);
        setAgentJobs([]);
        setAgentPrinterStatus([]);
      }
    } catch (err) {
      console.warn('[Agent] no disponible:', err.message);
      setAgentAvailable(false);
      setAgentPrintersCount(0);
      setAgentJobs([]);
      setAgentPrinterStatus([]);
    } finally {
      setAgentChecking(false);
    }
  };

  useEffect(() => {
    refreshPrinters();
    refreshQzPrinters();
    refreshAgent();
  }, []);

  const handleQzSelect = (type, name) => {
    const key = type === 'receipt' ? QZ_RECEIPT_KEY : type === 'label' ? QZ_LABEL_KEY : QZ_INVOICE_KEY;
    const setter = type === 'receipt' ? setQzReceipt : type === 'label' ? setQzLabel : setQzInvoice;
    if (name) {
      localStorage.setItem(key, name);
      toast({ title: 'Impresora QZ guardada', description: `${name} configurada para ${type === 'receipt' ? 'recibos' : type === 'label' ? 'etiquetas' : 'facturas'}.` });
    } else {
      localStorage.removeItem(key);
    }
    setter(name);
  };

  const handlePairReceipt = async () => {
    setLoading(true);
    try {
      const info = await webUsbSelectReceiptPrinter();
      toast({ title: 'Impresora pareada', description: `${info.name} conectada como impresora de recibos.` });
      await refreshPrinters();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handlePairLabel = async () => {
    setLoading(true);
    try {
      const info = await webUsbSelectLabelPrinter();
      toast({ title: 'Impresora pareada', description: `${info.name} conectada como impresora de etiquetas.` });
      await refreshPrinters();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleForget = async (type) => {
    webUsbForgetPrinter(type);
    toast({ title: 'Desvinculada', description: `Impresora de ${type === 'receipt' ? 'recibos' : 'etiquetas'} desvinculada.` });
    await refreshPrinters();
  };

  return (
    <div className="space-y-4">
      {/* ===========================================================
          Selector de backend — qué motor usar al imprimir
          =========================================================== */}
      <div className="border-2 border-slate-300 rounded-lg p-3 bg-slate-50">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-[11px] font-bold text-slate-700 uppercase">Motor de impresión activo</p>
            <p className="text-[11px] text-slate-600 mt-0.5">
              {resolvedBackend === 'agent' && '✅ Usando Motoflow Print Agent (recomendado)'}
              {resolvedBackend === 'qz' && '⚙️ Usando QZ Tray (legado)'}
              {resolvedBackend === 'none' && '⚠️ Ningún backend disponible — el sistema imprimirá con el diálogo nativo del navegador'}
            </p>
          </div>
          <select
            value={backend}
            onChange={(e) => handleBackendChange(e.target.value)}
            className="text-[11px] border border-slate-300 rounded px-2 py-1.5 bg-white font-bold"
          >
            <option value="auto">🔄 Auto (recomendado)</option>
            <option value="agent">⚡ Solo Motoflow Print Agent</option>
            <option value="qz">🖨️ Solo QZ Tray</option>
          </select>
        </div>
        <p className="text-[10px] text-slate-500 mt-2">
          <b>Auto:</b> usa Motoflow Print Agent si está instalado, sino QZ Tray como fallback. Ideal para que cada cliente use lo que ya tiene.
        </p>
      </div>

      {/* ===========================================================
          Motoflow Print Agent — la opción recomendada
          =========================================================== */}
      <div className="border border-emerald-200 rounded-lg p-4 bg-emerald-50">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-5 h-5 text-emerald-700" />
          <h3 className="text-sm font-bold uppercase text-emerald-900">Motoflow Print Agent</h3>
          {agentAvailable ? (
            <span className="text-[10px] font-bold bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded-full">ACTIVO</span>
          ) : (
            <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">NO INSTALADO</span>
          )}
          <span className="ml-auto text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">RECOMENDADO</span>
        </div>

        {agentAvailable ? (
          <div className="text-xs text-emerald-900 space-y-2">
            <p>
              ✅ Agente corriendo en <code className="bg-white px-1 rounded">127.0.0.1:9123</code> · <b>{agentPrintersCount}</b> impresoras detectadas.
              {agentHealth?.version && <span className="ml-1 text-[10px] text-emerald-700">v{agentHealth.version}</span>}
            </p>

            {/* Stats del agente */}
            {agentHealth?.stats && (
              <div className="grid grid-cols-4 gap-2 bg-white rounded p-2 border border-emerald-100">
                <div className="text-center">
                  <p className="text-[9px] uppercase text-slate-500 font-bold">Uptime</p>
                  <p className="text-sm font-mono font-bold text-slate-700">
                    {agentHealth.uptimeSeconds < 3600
                      ? `${Math.round(agentHealth.uptimeSeconds / 60)}m`
                      : `${Math.round(agentHealth.uptimeSeconds / 3600)}h`}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] uppercase text-slate-500 font-bold">Prints OK</p>
                  <p className="text-sm font-mono font-bold text-emerald-700">{agentHealth.stats.printsOk}</p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] uppercase text-slate-500 font-bold">Fallidos</p>
                  <p className={`text-sm font-mono font-bold ${agentHealth.stats.printsFailed > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                    {agentHealth.stats.printsFailed}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[9px] uppercase text-slate-500 font-bold">En cola</p>
                  <p className={`text-sm font-mono font-bold ${agentHealth.stats.queueLength > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                    {agentHealth.stats.queueLength}
                  </p>
                </div>
              </div>
            )}

            {agentHealth?.stats?.lastError && (
              <div className="text-[10px] bg-red-50 border border-red-200 rounded p-2 text-red-700">
                <span className="font-bold">Último error:</span> {agentHealth.stats.lastError}
              </div>
            )}

            <p className="text-[11px]">
              Imprime sin popups, sin licencias QZ Tray. Cubre todas las impresoras Windows automáticamente.
            </p>

            {/* Botones de mantenimiento (solo en v0.4+) */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-emerald-200">
              <Button size="sm" variant="ghost" className="h-7 text-[11px] text-emerald-700" onClick={refreshAgent} disabled={agentChecking}>
                <RefreshCw className={`w-3 h-3 mr-1 ${agentChecking ? 'animate-spin' : ''}`} /> Reconectar
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] border-amber-300 text-amber-700 hover:bg-amber-50"
                disabled={restartingSpooler}
                onClick={async () => {
                  if (!window.confirm('Reiniciar el servicio "Print Spooler" de Windows? Resuelve la mayoria de cuelgues de impresion sin reiniciar la PC.')) return;
                  setRestartingSpooler(true);
                  try {
                    const r = await agentRestartSpooler();
                    if (r.ok) {
                      toast({ title: 'Spooler reiniciado', description: 'El servicio de impresion de Windows se reinicio correctamente.' });
                      setTimeout(refreshAgent, 1000);
                    } else {
                      toast({
                        variant: 'destructive',
                        title: 'No se pudo reiniciar',
                        description: (r.error || '') + (r.hint ? `\n${r.hint}` : ''),
                      });
                    }
                  } catch (e) {
                    toast({ variant: 'destructive', title: 'Error', description: e.message });
                  } finally {
                    setRestartingSpooler(false);
                  }
                }}
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${restartingSpooler ? 'animate-spin' : ''}`} />
                Reiniciar Spooler de Windows
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] border-red-300 text-red-700 hover:bg-red-50"
                disabled={restartingAgent}
                onClick={async () => {
                  if (!window.confirm('Reiniciar el Print Agent? Si lo instalaste con start.bat se relanza solo en 2 segundos.')) return;
                  setRestartingAgent(true);
                  try {
                    await agentRestartSelf();
                    toast({ title: 'Agente reiniciandose', description: 'Esperando 3 segundos a que vuelva a arrancar...' });
                    setTimeout(() => { refreshAgent(); setRestartingAgent(false); }, 3500);
                  } catch (e) {
                    toast({ variant: 'destructive', title: 'Error', description: e.message });
                    setRestartingAgent(false);
                  }
                }}
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${restartingAgent ? 'animate-spin' : ''}`} />
                Reiniciar Agente
              </Button>
            </div>
            <p className="text-[10px] text-slate-500 italic">
              💡 Si la impresion se cuelga: primero "Reiniciar Spooler". Si persiste, "Reiniciar Agente". Solo si ambos fallan, reiniciar la PC.
            </p>
          </div>
        ) : (
          <div className="text-xs text-slate-800 space-y-2">
            <p>
              Agente local de impresión que reemplaza QZ Tray. <b>Gratis</b>, sin licencias, sin popups de autorización.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href="/downloads/motoflow-print-agent.zip"
                download
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold"
              >
                <Download className="w-3 h-3" /> Descargar para Windows (40 MB)
              </a>
              <Button size="sm" variant="ghost" className="h-7 text-[11px] text-slate-600" onClick={refreshAgent} disabled={agentChecking}>
                <RefreshCw className={`w-3 h-3 mr-1 ${agentChecking ? 'animate-spin' : ''}`} /> Detectar
              </Button>
            </div>
            <details className="text-[11px] text-slate-600">
              <summary className="cursor-pointer hover:text-emerald-700 font-bold">Instrucciones</summary>
              <ol className="list-decimal ml-5 mt-2 space-y-1">
                <li>Descarga el ZIP del agente</li>
                <li>Descomprime en cualquier carpeta</li>
                <li>Doble clic en <code className="bg-white px-1 rounded">installer/install.bat</code> → <b>Ejecutar como administrador</b></li>
                <li>Recarga esta página (Ctrl+Shift+R)</li>
                <li>El badge cambiará a "ACTIVO"</li>
              </ol>
            </details>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <Usb className="w-5 h-5 text-blue-600" />
        <h3 className="text-sm font-bold uppercase text-slate-700">Impresión WebUSB</h3>
        {supported ? (
          <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">COMPATIBLE</span>
        ) : (
          <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">NO COMPATIBLE</span>
        )}
      </div>

      {!supported ? (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-800">
            <p className="font-bold">Navegador no compatible con WebUSB</p>
            <p className="mt-1">WebUSB requiere <strong>Chrome 61+</strong> o <strong>Edge 79+</strong>. Puede seguir usando QZ Tray o impresión por navegador.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            WebUSB permite imprimir directamente desde el navegador sin instalar software adicional.
            Parée sus impresoras una vez y quedarán guardadas.
          </p>

          {/* Impresora de Recibos */}
          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex items-center gap-3">
              <Printer className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-xs font-bold text-slate-700">Impresora de Recibos (ESC/POS)</p>
                {printers.receipt ? (
                  <p className="text-[11px] text-green-600 font-semibold flex items-center gap-1">
                    <Check className="w-3 h-3" /> {printers.receipt.name}
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400">No configurada</p>
                )}
              </div>
            </div>
            <div className="flex gap-1">
              {printers.receipt && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:text-red-700" onClick={() => handleForget('receipt')}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-7 text-[11px] font-bold" onClick={handlePairReceipt} disabled={loading}>
                {printers.receipt ? 'Cambiar' : 'Parear'}
              </Button>
            </div>
          </div>

          {/* Impresora de Etiquetas */}
          <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex items-center gap-3">
              <Printer className="w-5 h-5 text-slate-400" />
              <div>
                <p className="text-xs font-bold text-slate-700">Impresora de Etiquetas (EPL2/ZPL)</p>
                {printers.label ? (
                  <p className="text-[11px] text-green-600 font-semibold flex items-center gap-1">
                    <Check className="w-3 h-3" /> {printers.label.name}
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400">No configurada</p>
                )}
              </div>
            </div>
            <div className="flex gap-1">
              {printers.label && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-red-500 hover:text-red-700" onClick={() => handleForget('label')}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
              <Button size="sm" variant="outline" className="h-7 text-[11px] font-bold" onClick={handlePairLabel} disabled={loading}>
                {printers.label ? 'Cambiar' : 'Parear'}
              </Button>
            </div>
          </div>

          <Button size="sm" variant="ghost" className="h-7 text-[11px] text-slate-500" onClick={refreshPrinters}>
            <RefreshCw className="w-3 h-3 mr-1" /> Actualizar estado
          </Button>
        </div>
      )}

      {/* ===========================================================
          QZ Tray — TODAS las impresoras Windows (Star, Epson, Zebra,
          Microsoft Print to PDF, etc.). Requiere QZ Tray instalado.
          =========================================================== */}
      <div className="border-t border-slate-200 pt-4 mt-2">
        <div className="flex items-center gap-2 mb-3">
          <Server className="w-5 h-5 text-purple-600" />
          <h3 className="text-sm font-bold uppercase text-slate-700">Imprimir por QZ Tray (Windows)</h3>
          {qzAvailable ? (
            <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">CONECTADO</span>
          ) : (
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">NO DETECTADO</span>
          )}
        </div>

        {!qzAvailable ? (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-800 flex-1">
              <p className="font-bold">QZ Tray no está corriendo en este PC</p>
              <p className="mt-1">
                Para imprimir a <strong>cualquier impresora de Windows</strong> (EPSON, Microsoft Print to PDF, etc.),
                instala QZ Tray (gratis). Solo una vez.
              </p>
              <a
                href="https://qz.io/download/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-purple-700 font-bold hover:underline"
              >
                <Download className="w-3 h-3" /> Descargar QZ Tray
              </a>
              <Button size="sm" variant="ghost" className="h-7 text-[11px] text-amber-700 ml-3" onClick={refreshQzPrinters}>
                <RefreshCw className="w-3 h-3 mr-1" /> Reintentar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              QZ Tray detectó <strong>{qzPrinters.length}</strong> impresoras instaladas en Windows. Selecciona qué impresora usar para cada tipo de impresión:
            </p>

            {/* Recibos */}
            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Printer className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-700">Recibos (POS / térmica)</p>
                  <select
                    value={qzReceipt}
                    onChange={(e) => handleQzSelect('receipt', e.target.value)}
                    className="mt-1 text-[11px] border border-slate-300 rounded px-2 py-1 w-full bg-white"
                  >
                    <option value="">— Sin configurar —</option>
                    {qzPrinters.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Etiquetas */}
            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Printer className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-700">Etiquetas (EPL2 / ZPL)</p>
                  <select
                    value={qzLabel}
                    onChange={(e) => handleQzSelect('label', e.target.value)}
                    className="mt-1 text-[11px] border border-slate-300 rounded px-2 py-1 w-full bg-white"
                  >
                    <option value="">— Sin configurar —</option>
                    {qzPrinters.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Facturas / hoja completa */}
            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Printer className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-700">Facturas (hoja completa / PDF)</p>
                  <select
                    value={qzInvoice}
                    onChange={(e) => handleQzSelect('invoice', e.target.value)}
                    className="mt-1 text-[11px] border border-slate-300 rounded px-2 py-1 w-full bg-white"
                  >
                    <option value="">— Sin configurar —</option>
                    {qzPrinters.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <Button size="sm" variant="ghost" className="h-7 text-[11px] text-slate-500" onClick={refreshQzPrinters} disabled={qzLoading}>
              <RefreshCw className={`w-3 h-3 mr-1 ${qzLoading ? 'animate-spin' : ''}`} /> Actualizar lista de impresoras
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PrinterSettings;
