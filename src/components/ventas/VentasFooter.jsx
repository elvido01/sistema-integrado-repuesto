import React, { useState, useMemo, useEffect, useRef } from 'react';
import { agentIsAvailable } from '@/services/motoflowPrintAgent';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Loader2, X, AlertCircle, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const VentasFooter = ({
  cliente,
  paymentType,
  setPaymentType,
  diasCredito,
  setDiasCredito,
  montoRecibido,
  setMontoRecibido,
  cambio,
  totals,
  onFacturar,
  isSaving,
  printFormat,
  setPrintFormat,
  printMethod,
  setPrintMethod,
  recargo,
  setRecargo,
  resetVenta,
  grabarBtnRef,
  tipoPago,
  setTipoPago,
  pagos = [],
  setPagos,
  notas = '',
  setNotas,
}) => {
  const { empresa } = useAuth();
  const nombreEmpresa = empresa?.nombre || 'Sistema';
  const [alertOpen, setAlertOpen] = useState(false);
  const [currentRef, setCurrentRef] = useState('');
  const [showNotas, setShowNotas] = useState(false);
  const [showPrintOptions, setShowPrintOptions] = useState(false);
  const [hasAgent, setHasAgent] = useState(false);
  const [isMontoFocused, setIsMontoFocused] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const montoInputRef = useRef(null);

  useEffect(() => {
    if (showPrintOptions) {
      agentIsAvailable().then(setHasAgent).catch(() => setHasAgent(false));
    }
  }, [showPrintOptions]);

  useEffect(() => {
    if (!isMontoFocused) {
      setKeyboardInset(0);
      return;
    }

    const updateKeyboardInset = () => {
      if (window.innerWidth > 768 || !window.visualViewport) {
        setKeyboardInset(0);
        return;
      }

      const viewport = window.visualViewport;
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setKeyboardInset(inset);
    };

    updateKeyboardInset();
    window.visualViewport?.addEventListener('resize', updateKeyboardInset);
    window.visualViewport?.addEventListener('scroll', updateKeyboardInset);
    window.addEventListener('orientationchange', updateKeyboardInset);

    return () => {
      window.visualViewport?.removeEventListener('resize', updateKeyboardInset);
      window.visualViewport?.removeEventListener('scroll', updateKeyboardInset);
      window.removeEventListener('orientationchange', updateKeyboardInset);
    };
  }, [isMontoFocused]);

  const handleMontoFocus = () => {
    setIsMontoFocused(true);
    setTimeout(() => {
      montoInputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      montoInputRef.current?.select();
    }, 80);
  };

  const pairedReceiptPrinterName = useMemo(() => {
    try {
      const saved = localStorage.getItem('webusb_receipt_printer');
      if (saved) { const info = JSON.parse(saved); return info.name || null; }
    } catch {}
    return null;
  }, []);

  const handleFacturar = () => {
    if (paymentType === 'contado') {
      const totalPagos = pagos.reduce((sum, p) => sum + Number(p.monto), 0);
      const recibido = totalPagos + (parseFloat(montoRecibido) || 0);
      if (recibido < totals.totalFactura) {
        setAlertOpen(true);
        return;
      }
    }
    onFacturar();
  };

  const addPago = () => {
    const val = parseFloat(montoRecibido) || 0;
    if (val > 0) {
      setPagos(prev => [...prev, { tipo: tipoPago, ref: currentRef, monto: val }]);
      setMontoRecibido('');
      setCurrentRef('');
    }
  };

  const removePago = (index) => {
    setPagos(prev => prev.filter((_, i) => i !== index));
  };

  const totalAbonado = pagos.reduce((s, p) => s + p.monto, 0) + (parseFloat(montoRecibido) || 0);
  const pendiente = totals.totalFactura - totalAbonado;
  const isCredit = paymentType === 'credito';

  const printLabel = printFormat === 'pos_4inch' ? '4 Pulgadas' : printFormat === 'half_page' ? '8.5 X 5.5' : '8.5 X 11';

  return (
    <div
      className={`flex-shrink-0 border-t-2 border-gray-500 bg-[#f0efe8] relative ${
        isMontoFocused ? 'max-md:fixed max-md:left-0 max-md:right-0 max-md:z-[70] max-md:shadow-2xl' : ''
      }`}
      style={isMontoFocused ? { bottom: `${keyboardInset}px` } : undefined}
    >

      {/* Popup panel: Notas - opens UPWARD from the bar */}
      {showNotas && (
        <div className="absolute bottom-full left-0 w-[41.666%] border-2 border-gray-500 border-b-0 bg-[#faf9f4] shadow-lg z-30">
          <div className="px-2 py-1 bg-gradient-to-r from-[#d4d4cc] to-[#c8c8c0] border-b border-gray-400">
            <span className="text-[11px] font-black text-[#0a1e3a] uppercase">Notas y Comentarios</span>
          </div>
          <div className="p-1.5">
            <textarea
              className="w-full h-[60px] text-[11px] bg-[#ffffd9] border border-gray-400 rounded-none p-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-[#0a1e3a]"
              placeholder="Agregar nota a la factura..."
              value={notas}
              onChange={e => setNotas && setNotas(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Popup panel: Print Options - opens UPWARD from the bar */}
      {showPrintOptions && (
        <div className="absolute bottom-full right-0 w-[58.333%] border-2 border-gray-500 border-b-0 bg-[#faf9f4] shadow-lg z-30">
          <div className="px-2 py-1 bg-gradient-to-r from-[#d4d4cc] to-[#c8c8c0] border-b border-gray-400">
            <span className="text-[11px] font-black text-[#0a1e3a] uppercase">Formato de Impresión</span>
          </div>
          <div className="p-1.5 flex gap-2">
            <Select value={printFormat} onValueChange={(v) => { setPrintFormat(v); setShowPrintOptions(false); }}>
              <SelectTrigger className="h-7 flex-1 text-[11px] font-bold border-gray-400 rounded-none bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border border-gray-500">
                <SelectItem value="pos_4inch" className="text-[11px] font-bold">4 Pulgadas (Punto de Ventas)</SelectItem>
                <SelectItem value="half_page" className="text-[11px] font-bold">8.5 x 5.5 (Media Página)</SelectItem>
                <SelectItem value="full_page" className="text-[11px] font-bold">8.5 x 11 (Página Completa)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={printMethod} onValueChange={(v) => { setPrintMethod(v); setShowPrintOptions(false); }}>
              <SelectTrigger className="h-7 w-[180px] text-[11px] font-bold border-gray-400 rounded-none bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border border-gray-500">
                <SelectItem value="browser" className="text-[11px] font-bold">Navegador (HTML)</SelectItem>
                <SelectItem value="agent" className="text-[11px] font-bold" disabled={!hasAgent}>
                  ⚡ Motoflow Print Agent {hasAgent ? '' : '(No detectado)'}
                </SelectItem>
                <SelectItem value="qz" className="text-[11px] font-bold">QZ Tray (Nativo)</SelectItem>
                <SelectItem value="webusb" className="text-[11px] font-bold" disabled={!navigator.usb}>
                  {pairedReceiptPrinterName ? `WebUSB — ${pairedReceiptPrinterName}` : 'WebUSB (Sin Instalar)'}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div className="grid grid-cols-12 gap-0">

        {/* ===== LEFT: Forma de Pago ===== */}
        <div className="col-span-5 border-r-2 border-gray-500 bg-[#faf9f4]">
          {/* Row 1: Tipo de pago */}
          <div className="flex items-center gap-2 px-2 py-1 border-b border-gray-300 bg-[#0a1e3a]/5">
            <RadioGroup value={paymentType} onValueChange={setPaymentType} className="flex gap-3">
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="contado" id="contado" className="text-[#0a1e3a] w-3 h-3" />
                <Label htmlFor="contado" className="text-[11px] font-black text-[#0a1e3a] cursor-pointer">CONTADO</Label>
              </div>
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="credito" id="credito" disabled={!cliente?.autorizar_credito} className="text-[#0a1e3a] w-3 h-3" />
                <Label htmlFor="credito" className={`text-[11px] font-black cursor-pointer ${!cliente?.autorizar_credito ? 'text-gray-400' : 'text-[#0a1e3a]'}`}>CRÉDITO</Label>
              </div>
            </RadioGroup>
            {paymentType === 'credito' && (
              <div className="flex items-center gap-1 border-l border-[#0a1e3a]/20 pl-2 ml-auto">
                <Label className="text-[10px] font-black text-gray-500 uppercase">DÍAS:</Label>
                <Input type="number" className="h-5 w-10 text-[11px] font-black border-gray-300 rounded-none bg-white text-center text-[#0a1e3a]" value={diasCredito} onChange={(e) => setDiasCredito(e.target.value)} />
              </div>
            )}
            <div className={`w-2 h-2 rounded-full ml-auto ${paymentType === 'contado' ? 'bg-green-500' : 'bg-blue-500'}`}></div>
          </div>

          {/* Row 2: Inputs de pago */}
          <div className="flex items-center gap-0.5 px-1 py-1">
            <Select value={tipoPago} onValueChange={setTipoPago}>
              <SelectTrigger className="h-7 w-[90px] px-1 text-[10px] font-black border-gray-300 rounded-none bg-gray-50 uppercase">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border border-gray-400">
                <SelectItem value="EFECTIVO" className="text-[11px] font-bold">EFECTIVO</SelectItem>
                <SelectItem value="TARJETA" className="text-[11px] font-bold">TARJETA</SelectItem>
              </SelectContent>
            </Select>
            <Input
              className="h-7 flex-1 text-[11px] font-bold border-gray-300 rounded-none bg-white placeholder:text-gray-300 uppercase"
              placeholder="REF..."
              value={currentRef}
              onChange={e => setCurrentRef(e.target.value)}
            />
            <Input
              ref={montoInputRef}
              id="input-monto-pago"
              type="number"
              inputMode="decimal"
              className="h-7 w-[100px] text-right text-[14px] font-black text-green-700 border-gray-300 rounded-none bg-white focus:ring-green-500 shadow-inner"
              placeholder={isCredit ? 'Abono...' : '0.00'}
              value={montoRecibido}
              onChange={e => setMontoRecibido(e.target.value)}
              onFocus={handleMontoFocus}
              onBlur={() => setTimeout(() => setIsMontoFocused(false), 120)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const val = parseFloat(montoRecibido) || 0;
                  const totalPagosActual = pagos.reduce((sum, p) => sum + Number(p.monto), 0);
                  if (val > 0) {
                    const totalConEsteIngreso = totalPagosActual + val;
                    if (paymentType === 'contado' && totalConEsteIngreso >= totals.totalFactura) {
                      addPago();
                      setTimeout(() => grabarBtnRef.current?.focus(), 50);
                    } else if (paymentType === 'credito') {
                      addPago();
                      setTimeout(() => grabarBtnRef.current?.focus(), 50);
                    } else {
                      addPago();
                    }
                  } else {
                    if (paymentType === 'contado' && totalPagosActual >= totals.totalFactura) {
                      grabarBtnRef.current?.focus();
                    } else if (paymentType === 'credito' && totalPagosActual > 0) {
                      grabarBtnRef.current?.focus();
                    }
                  }
                }
              }}
            />
          </div>

          {/* Pagos table (only if there are payments) */}
          {pagos.length > 0 && (
            <div className="overflow-y-auto max-h-[40px] border-t border-gray-200 mx-1">
              <table className="w-full text-[9px] text-left">
                <tbody>
                  {pagos.map((p, idx) => (
                    <tr key={idx} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 bg-white">
                      <td className="px-1 font-bold">{p.tipo}</td>
                      <td className="px-1">{p.ref}</td>
                      <td className="px-1 text-right font-black text-green-700">{(Number(p.monto)).toFixed(2)}</td>
                      <td className="px-1 text-center w-4">
                        <Trash2 className="w-[10px] h-[10px] text-red-500 cursor-pointer opacity-50 hover:opacity-100" onClick={() => removePago(idx)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Row 3: Recibido / Cambio inline */}
          <div className="flex items-center border-t border-gray-300 bg-[#f5f4ef]">
            <div className={`flex-1 flex items-center justify-between px-2 py-1 border-r border-gray-300 ${isCredit && totalAbonado > 0 ? 'bg-green-50' : ''}`}>
              <span className="text-[10px] font-black text-gray-500 uppercase">{isCredit ? 'ABONO' : 'RECIBIDO'}</span>
              <span className={`text-[14px] font-black font-mono leading-none ${isCredit && totalAbonado > 0 ? 'text-green-700' : 'text-[#0a1e3a]'}`}>RD$ {totalAbonado.toFixed(2)}</span>
            </div>
            <div className={`flex-1 flex items-center justify-between px-2 py-1 ${
              isCredit
                ? (pendiente > 0 ? 'bg-orange-50' : 'bg-green-50')
                : (cambio < 0 ? 'bg-red-50' : 'bg-green-50')
            }`}>
              <span className={`text-[10px] font-black uppercase ${
                isCredit
                  ? (pendiente > 0 ? 'text-orange-600' : 'text-green-600')
                  : (cambio < 0 ? 'text-red-500' : 'text-green-600')
              }`}>{isCredit ? 'PENDIENTE' : 'CAMBIO'}</span>
              <span className={`text-[14px] font-black font-mono leading-none ${
                isCredit
                  ? (pendiente > 0 ? 'text-orange-700' : 'text-green-700')
                  : (cambio < 0 ? 'text-red-600' : 'text-green-700')
              }`}>RD$ {isCredit ? pendiente.toFixed(2) : cambio.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* ===== RIGHT: Totales + Actions ===== */}
        <div className="col-span-7 flex flex-col">
          {/* Totals grid */}
          <div className="grid grid-cols-2">
            <div className="flex justify-between items-center h-7 px-2 border-b border-r border-gray-400 bg-[#f0efe8]">
              <span className="text-[13px] font-black text-[#006400] uppercase">SUB-TOTAL</span>
              <span className="font-mono font-black text-[14px] text-[#008000]">{totals.subTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center h-7 px-2 border-b border-gray-400 bg-[#f5f4ef]">
              <span className="text-[13px] font-black text-gray-800 uppercase">F7 - RECARGO</span>
              <span className="font-mono font-black text-[14px] text-black">{Number(recargo || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center h-7 px-2 border-r border-gray-400 bg-[#f0efe8]">
              <span className="text-[13px] font-black text-black uppercase">DESCUENTO</span>
              <span className="font-mono font-black text-[14px] text-black">{totals.totalDescuento.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center h-7 px-2 bg-[#f5f4ef]">
              <span className="text-[13px] font-black text-black uppercase">TOTAL ITBIS</span>
              <span className="font-mono font-black text-[14px] text-black">{totals.totalItbis.toFixed(2)}</span>
            </div>
          </div>

          {/* TOTAL FACTURA + Buttons */}
          <div className="flex items-center border-t-2 border-gray-600 bg-gradient-to-r from-[#fff8e0] to-[#fff0c0]">
            <div className="flex justify-between items-center flex-1 px-3 h-9">
              <span className="text-[16px] font-black text-[#ff0000] uppercase tracking-tighter">TOTAL FACTURA</span>
              <span className="font-mono text-[20px] font-black text-[#ff0000] tracking-tighter leading-none">
                {totals.totalFactura.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-2 px-2 border-l border-gray-400">
              <Button
                className="h-8 px-3 text-[12px] font-bold flex gap-1.5 items-center uppercase bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 shadow-sm"
                onClick={() => resetVenta()}
              >
                <X className="w-4 h-4 text-red-600 stroke-[3]" />
                ESC
              </Button>
              <Button
                ref={grabarBtnRef}
                className="h-8 px-3 text-[12px] font-bold flex gap-1.5 items-center uppercase bg-[#0a1e3a] hover:bg-[#0a1e3a]/90 text-white shadow-sm border border-[#0a1e3a]"
                onClick={handleFacturar}
                disabled={isSaving}
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <img src="https://img.icons8.com/color/48/save.png" className="w-4 h-4 grayscale brightness-0 invert" alt="save" />}
                F10 - GRABAR
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom toolbar: aligned with grid columns (5/12 left, 7/12 right) */}
      <div className="grid grid-cols-12 gap-0 border-t border-gray-400 bg-gradient-to-b from-[#e8e8e0] to-[#d8d8d0]">
        <button
          className={`col-span-5 h-6 text-[11px] font-bold uppercase border-r-2 border-gray-500 transition-colors ${showNotas ? 'bg-[#0a1e3a] text-white' : 'text-gray-700 hover:bg-gray-300'}`}
          onClick={() => { setShowNotas(!showNotas); setShowPrintOptions(false); }}
        >
          Notas y Comentarios
        </button>
        <button
          className={`col-span-7 h-6 text-[11px] font-bold uppercase transition-colors ${showPrintOptions ? 'bg-[#0a1e3a] text-white' : 'text-gray-700 hover:bg-gray-300'}`}
          onClick={() => { setShowPrintOptions(!showPrintOptions); setShowNotas(false); }}
        >
          {printLabel} ▾
        </button>
      </div>

      {/* Alert Dialog - Pago insuficiente */}
      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent className="max-w-[400px] border-2 border-gray-400 bg-[#f0f0f0] p-0 rounded-lg shadow-2xl">
          <AlertDialogHeader className="bg-gradient-to-r from-[#0a1e3a] to-[#1a3a5c] px-4 py-2 rounded-t-md">
            <AlertDialogTitle className="text-white text-sm font-bold">{nombreEmpresa} - Punto de Venta</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="flex items-start gap-4 px-6 py-5">
            <div className="flex-shrink-0">
              <AlertCircle className="w-10 h-10 text-red-600" />
            </div>
            <AlertDialogDescription className="text-[14px] text-gray-900 font-semibold leading-snug pt-1">
              El Cambio NO puede ser Menor que 0.00 (cero).
              <br />
              <span className="text-[12px] text-gray-600 font-normal mt-1 block">
                Monto Recibido: RD$ {(pagos.reduce((s, p) => s + p.monto, 0) + (parseFloat(montoRecibido) || 0)).toFixed(2)}
                <br />
                Total Factura: RD$ {totals.totalFactura.toFixed(2)}
                <br />
                Faltante: RD$ {Math.max(0, totals.totalFactura - (pagos.reduce((s, p) => s + p.monto, 0) + (parseFloat(montoRecibido) || 0))).toFixed(2)}
              </span>
            </AlertDialogDescription>
          </div>
          <AlertDialogFooter className="px-4 py-3 bg-gray-100 border-t border-gray-300 rounded-b-md">
            <AlertDialogAction className="bg-[#0a1e3a] hover:bg-[#0a1e3a]/90 text-white font-bold px-8 h-9" onClick={() => setAlertOpen(false)}>
              Aceptar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default VentasFooter;
