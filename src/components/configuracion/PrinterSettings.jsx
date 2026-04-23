import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Printer, Usb, Trash2, RefreshCw, AlertTriangle, Check } from 'lucide-react';
import {
  isWebUsbSupported,
  webUsbSelectReceiptPrinter,
  webUsbSelectLabelPrinter,
  webUsbGetPairedPrinters,
  webUsbForgetPrinter
} from '@/services/webUsbPrintService';

const PrinterSettings = () => {
  const { toast } = useToast();
  const [printers, setPrinters] = useState({ receipt: null, label: null });
  const [loading, setLoading] = useState(false);
  const supported = isWebUsbSupported();

  const refreshPrinters = async () => {
    if (!supported) return;
    const paired = await webUsbGetPairedPrinters();
    setPrinters(paired);
  };

  useEffect(() => { refreshPrinters(); }, []);

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
    </div>
  );
};

export default PrinterSettings;
