import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
}) => {
  const { empresa } = useAuth();
  const nombreEmpresa = empresa?.nombre || 'Sistema';
  const [alertOpen, setAlertOpen] = useState(false);
  const [currentRef, setCurrentRef] = useState('');

  const onNotImplemented = (feature) => {
    console.log(`${feature} not implemented`);
  };

  const handleFacturar = () => {
    // Validar monto recibido para ventas de contado
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

  return (
    <div className="grid grid-cols-12 gap-0 bg-[#f0efe8] p-0 border-t-2 border-gray-500 items-end">
      {/* Left Section: Pago and Notas (Compras Style) */}
      <div className="col-span-5 flex flex-col border-r-2 border-gray-500 bg-[#faf9f4] h-full justify-end">
        <div className="px-2 py-0.5 border-b-2 border-gray-500 flex items-center justify-between bg-gradient-to-r from-[#d4d4cc] to-[#c8c8c0]">
          <h2 className="text-[13px] font-black text-[#0a1e3a] uppercase tracking-wider border-b-2 border-[#0a1e3a] pb-0.5">FORMA DE PAGO & NOTAS</h2>
          <div className="flex gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${paymentType === 'contado' ? 'bg-green-500 border border-green-600' : 'bg-blue-500 border border-blue-600'}`}></div>
          </div>
        </div>
        <div className="p-1">
          <Tabs defaultValue="pago" className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-7 bg-gray-100 p-0 rounded-none mb-1 border border-gray-200">
              <TabsTrigger value="pago" className="text-[11px] font-black uppercase rounded-none data-[state=active]:bg-[#0a1e3a] data-[state=active]:text-white">PAGO</TabsTrigger>
              <TabsTrigger value="notas" className="text-[11px] font-black uppercase rounded-none data-[state=active]:bg-[#0a1e3a] data-[state=active]:text-white">NOTAS</TabsTrigger>
              <Button variant="ghost" className="h-full text-[11px] font-black uppercase rounded-none hover:bg-gray-200 text-gray-600 px-2" onClick={() => onNotImplemented('Financiamiento')}>FINANC.</Button>
            </TabsList>

            <TabsContent value="pago" className="m-0 space-y-1">
              <div className="flex gap-2 items-center bg-[#0a1e3a]/5 p-0.5 rounded-none border border-[#0a1e3a]/10">
                <RadioGroup value={paymentType} onValueChange={setPaymentType} className="flex gap-2">
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
                  <div className="flex items-center gap-1 border-l border-[#0a1e3a]/20 pl-1 ml-auto text-[10px]">
                    <Label className="font-black text-gray-500 uppercase">DÍAS:</Label>
                    <Input type="number" className="h-5 w-10 text-[11px] font-black border-gray-300 rounded-none bg-white text-center text-[#0a1e3a]" value={diasCredito} onChange={(e) => setDiasCredito(e.target.value)} />
                  </div>
                )}
              </div>

              {/* Forma de pago selector + referencia + monto */}
              {paymentType === 'credito' && (
                <div className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 p-1 rounded mb-0.5">
                  💡 Puede registrar un abono parcial en efectivo o tarjeta
                </div>
              )}
              <div className="grid grid-cols-12 gap-0.5">
                <Select value={tipoPago} onValueChange={setTipoPago}>
                  <SelectTrigger className="col-span-4 h-6 px-1 text-[10px] font-black border-gray-300 rounded-none bg-gray-50 uppercase tracking-tighter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-400">
                    <SelectItem value="EFECTIVO" className="text-[11px] font-bold">EFECTIVO</SelectItem>
                    <SelectItem value="TARJETA" className="text-[11px] font-bold">TARJETA</SelectItem>
                  </SelectContent>
                </Select>
                <Input 
                  className="col-span-4 h-6 text-[11px] font-bold border-gray-300 rounded-none bg-white placeholder:text-gray-300 uppercase" 
                  placeholder="REF..." 
                  value={currentRef}
                  onChange={e => setCurrentRef(e.target.value)}
                />
                <Input
                  id="input-monto-pago"
                  type="number"
                  className="col-span-4 h-6 text-right text-[14px] font-black text-green-700 border-gray-300 rounded-none bg-white focus:ring-green-500 shadow-inner"
                  placeholder={paymentType === 'credito' ? 'Abono...' : '0.00'}
                  value={montoRecibido}
                  onChange={e => setMontoRecibido(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const val = parseFloat(montoRecibido) || 0;
                      const totalPagosActual = pagos.reduce((sum, p) => sum + Number(p.monto), 0);

                      if (val > 0) {
                        // Si el primer ingreso (o acumulado + este) cubre o supera el total, agregar y saltar a Grabar
                        const totalConEsteIngreso = totalPagosActual + val;
                        if (paymentType === 'contado' && totalConEsteIngreso >= totals.totalFactura) {
                          addPago();
                          // Ir directo al botón Grabar
                          setTimeout(() => grabarBtnRef.current?.focus(), 50);
                        } else if (paymentType === 'credito') {
                          // En crédito cualquier abono es válido, agregar e ir a Grabar
                          addPago();
                          setTimeout(() => grabarBtnRef.current?.focus(), 50);
                        } else {
                          // No cubre el total, agregar el pago parcial y dejar que ingrese otro
                          addPago();
                        }
                      } else {
                        // Campo vacío: si ya hay pagos suficientes, ir a Grabar
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

              {pagos.length > 0 && (
                <div className="overflow-y-auto max-h-[46px] border border-gray-200 mt-1">
                  <table className="w-full text-[9px] text-left">
                    <thead className="bg-[#f0efe8] uppercase sticky top-0 font-bold border-b border-gray-300 text-gray-700">
                      <tr>
                        <th className="px-1 leading-tight">Forma</th>
                        <th className="px-1 leading-tight">Ref</th>
                        <th className="px-1 text-right leading-tight">Monto</th>
                        <th className="px-1 leading-tight w-4"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagos.map((p, idx) => (
                        <tr key={idx} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 group bg-white">
                          <td className="px-1 font-bold">{p.tipo}</td>
                          <td className="px-1">{p.ref}</td>
                          <td className="px-1 text-right font-black text-green-700">{(Number(p.monto)).toFixed(2)}</td>
                          <td className="px-1 text-center">
                            <Trash2 className="w-[10px] h-[10px] text-red-500 cursor-pointer opacity-50 hover:opacity-100" onClick={() => removePago(idx)} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {(() => {
                const totalAbonado = pagos.reduce((s,p)=>s+p.monto,0) + (parseFloat(montoRecibido)||0);
                const pendiente = totals.totalFactura - totalAbonado;
                const isCredit = paymentType === 'credito';
                return (
                  <div className={`grid grid-cols-2 gap-0.5 ${pagos.length > 0 ? 'mt-0' : 'mt-0.5'}`}>
                    <div className={`rounded-none border p-0.5 flex flex-col items-center justify-center shadow-[inset_0_1px_1px_rgba(0,0,0,0.02)] ${isCredit && totalAbonado > 0 ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200'}`}>
                      <span className="text-[10px] font-black text-gray-400 uppercase">{isCredit ? 'ABONO' : 'RECIBIDO'}</span>
                      <span className={`text-[15px] font-black font-mono italic leading-none ${isCredit && totalAbonado > 0 ? 'text-green-700' : 'text-[#0a1e3a]'}`}>RD$ {totalAbonado.toFixed(2)}</span>
                    </div>
                    <div className={`rounded-none border p-0.5 flex flex-col items-center justify-center shadow-[inset_0_1px_1px_rgba(0,0,0,0.02)] ${
                      isCredit
                        ? (pendiente > 0 ? 'bg-orange-50 border-orange-300' : 'bg-green-50 border-green-200')
                        : (cambio < 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200')
                    }`}>
                      <span className={`text-[10px] font-black uppercase ${
                        isCredit
                          ? (pendiente > 0 ? 'text-orange-600' : 'text-green-600')
                          : (cambio < 0 ? 'text-red-500' : 'text-green-600')
                      }`}>{isCredit ? 'PENDIENTE' : 'CAMBIO'}</span>
                      <span className={`text-[15px] font-black font-mono italic leading-none ${
                        isCredit
                          ? (pendiente > 0 ? 'text-orange-700' : 'text-green-700')
                          : (cambio < 0 ? 'text-red-600' : 'text-green-700')
                      }`}>RD$ {isCredit ? pendiente.toFixed(2) : cambio.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })()}
            </TabsContent>
            <TabsContent value="notas" className="m-0 bg-gray-50 border border-gray-200 rounded-none p-1 h-[60px] text-[10px] italic text-gray-400 flex items-center justify-center">
              SIN NOTAS ADICIONALES.
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Right Section: Detailed Totals Grid - Compressed */}
      <div className="col-span-7 flex flex-col gap-0 h-full justify-end">
        <div className="totals-grid-legacy p-0 shadow-sm overflow-hidden bg-[#faf9f4] !rounded-none !border-0 flex-grow">
          <div className="grid grid-cols-2">
            {/* Left Column of Totals Row 1 */}
            <div className="totals-row-zebra flex justify-between items-center h-7 px-2 border-b border-r border-gray-400 bg-[#f0efe8]">
              <span className="text-[13px] font-black text-[#006400] uppercase">SUB-TOTAL</span>
              <span className="font-mono font-black text-[14px] text-[#008000]">{totals.subTotal.toFixed(2)}</span>
            </div>
            {/* Right Column of Totals Row 1 */}
            <div className="totals-row-zebra totals-separator flex justify-between items-center h-7 px-2 border-b border-gray-400 bg-[#f5f4ef]">
              <div className="flex items-center gap-1 cursor-pointer" onClick={() => onNotImplemented('Recargo')}>
                <span className="text-[13px] font-black text-gray-800 uppercase">F7 - RECARGO</span>
              </div>
              <span className="font-mono font-black text-[14px] text-black">{Number(recargo || 0).toFixed(2)}</span>
            </div>

            {/* Row 2 */}
            <div className="totals-row-zebra flex justify-between items-center h-7 px-2 border-b border-r border-gray-400 bg-[#f0efe8]">
              <span className="text-[13px] font-black text-black uppercase">F8 - DESCUENTO</span>
              <span className="font-mono font-black text-[14px] text-black">0.00</span>
            </div>
            <div className="totals-row-zebra totals-separator flex justify-between items-center h-7 px-2 border-b border-gray-400 bg-[#f5f4ef]">
              <span className="text-[13px] font-black text-black uppercase">TOTAL ITBIS</span>
              <span className="font-mono font-black text-[14px] text-black">{totals.totalItbis.toFixed(2)}</span>
            </div>

            {/* Row 3 */}
            <div className="totals-row-zebra flex justify-between items-center h-7 px-2 border-r border-gray-400 bg-[#f0efe8]">
              <span className="text-[13px] font-black text-black uppercase">DSCTO. ITEMS</span>
              <span className="font-mono font-black text-[14px] text-black">{totals.totalDescuento.toFixed(2)}</span>
            </div>
            <div className="totals-row-zebra totals-separator flex justify-between items-center h-7 px-2 bg-[#f5f4ef]">
              {/* Empty */}
            </div>
          </div>

          {/* TOTAL FACTURA Section */}
          <div className="border-t-2 border-gray-600 h-8 flex justify-between items-center px-3 bg-gradient-to-r from-[#fff8e0] to-[#fff0c0] shadow-inner">
            <span className="text-[16px] font-black text-[#ff0000] uppercase tracking-tighter">TOTAL FACTURA</span>
            <span className="font-mono text-[20px] font-black text-[#ff0000] tracking-tighter leading-none">
              {totals.totalFactura.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Print Selection and Actions Container - Styled like Compras */}
        <div className="flex items-center bg-gray-100 border-t border-gray-300 p-1">
          {/* Print Selector Area */}
          <div className="hidden">
            <Select value={printMethod} onValueChange={setPrintMethod}>
              <SelectTrigger className="h-8 w-40 text-[12px] font-bold border border-gray-400 rounded bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border border-gray-500">
                <SelectItem value="qz" className="text-[13px] font-bold uppercase">QZ Tray (Nativo)</SelectItem>
                <SelectItem value="browser" className="text-[13px] font-bold uppercase">Navegador (HTML)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={printFormat} onValueChange={setPrintFormat}>
              <SelectTrigger className="h-8 w-36 text-[12px] font-bold border border-gray-400 rounded bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white border border-gray-500">
                <SelectItem value="pos_4inch" className="text-[13px] font-bold uppercase">POS 4"</SelectItem>
                <SelectItem value="half_page" className="text-[13px] font-bold uppercase">8.5 X 8.5 (1/2)</SelectItem>
                <SelectItem value="full_page" className="text-[13px] font-bold uppercase">8.5 X 11 (FULL)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Actions Area */}
          <div className="flex justify-end gap-2 ml-auto">
            <Button
              className="h-9 px-4 text-[13px] font-bold flex gap-2 items-center min-w-[130px] uppercase bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 shadow-sm"
              onClick={() => resetVenta()}
            >
              <X className="w-4 h-4 text-red-600 stroke-[3]" />
              ESC - Retornar
            </Button>
            <Button
              ref={grabarBtnRef}
              className="h-9 px-4 text-[13px] font-bold flex gap-2 items-center min-w-[130px] uppercase bg-[#0a1e3a] hover:bg-[#0a1e3a]/90 text-white shadow-sm border border-[#0a1e3a]"
              onClick={handleFacturar}
              disabled={isSaving}
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <img src="https://img.icons8.com/color/48/save.png" className="w-4 h-4 grayscale brightness-0 invert" alt="save" />}
              F10 - Grabar
            </Button>
          </div>
        </div>
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
                Monto Recibido: RD$ {(pagos.reduce((s,p)=>s+p.monto,0) + (parseFloat(montoRecibido)||0)).toFixed(2)}
                <br />
                Total Factura: RD$ {totals.totalFactura.toFixed(2)}
                <br />
                Faltante: RD$ {Math.max(0, totals.totalFactura - (pagos.reduce((s,p)=>s+p.monto,0) + (parseFloat(montoRecibido)||0))).toFixed(2)}
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