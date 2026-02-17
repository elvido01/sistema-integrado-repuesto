import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, X } from 'lucide-react';

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
}) => {
  const onNotImplemented = (feature) => {
    // Placeholder for toast notification
    console.log(`${feature} not implemented`);
  };

  return (
    <div className="grid grid-cols-12 gap-0 bg-white p-0 border-t border-gray-300 items-end">
      {/* Left Section: Pago and Notas (Compras Style) */}
      <div className="col-span-5 flex flex-col border-r border-gray-300 bg-white h-full justify-end">
        <div className="px-2 py-0.5 border-b border-gray-200 flex items-center justify-between">
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

              {/* Removing 'extra' fields if any, keeping clear inputs */}
              <div className="grid grid-cols-12 gap-0.5">
                <div className="col-span-4 bg-gray-50 border border-gray-200 rounded-none h-6 px-1 text-[10px] font-black text-gray-400 flex items-center justify-center uppercase tracking-tighter">
                  EFECTIVO
                </div>
                <Input className="col-span-4 h-6 text-[11px] font-bold border-gray-300 rounded-none bg-white placeholder:text-gray-300 uppercase" placeholder="REF..." disabled={paymentType === 'credito'} />
                <Input
                  type="number"
                  className="col-span-4 h-6 text-right text-[14px] font-black text-green-700 border-gray-300 rounded-none bg-white focus:ring-green-500 shadow-inner"
                  placeholder="0.00"
                  value={montoRecibido}
                  onChange={e => setMontoRecibido(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const total = totals.totalFactura;
                      if (Number(montoRecibido) >= total) {
                        grabarBtnRef.current?.focus();
                      }
                    }
                  }}
                  disabled={paymentType === 'credito'}
                />
              </div>

              <div className="grid grid-cols-2 gap-0.5 mt-0.5">
                <div className="bg-gray-50 rounded-none border border-gray-200 p-0.5 flex flex-col items-center justify-center shadow-[inset_0_1px_1px_rgba(0,0,0,0.02)]">
                  <span className="text-[10px] font-black text-gray-400 uppercase">RECIBIDO</span>
                  <span className="text-[15px] font-black text-[#0a1e3a] font-mono italic leading-none">RD$ {paymentType === 'credito' ? '0.00' : Number(montoRecibido).toFixed(2)}</span>
                </div>
                <div className="bg-green-50 rounded-none border border-green-200 p-0.5 flex flex-col items-center justify-center shadow-[inset_0_1px_1px_rgba(0,0,0,0.02)]">
                  <span className="text-[10px] font-black text-green-600 uppercase">CAMBIO</span>
                  <span className="text-[15px] font-black text-green-700 font-mono italic leading-none">RD$ {cambio.toFixed(2)}</span>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="notas" className="m-0 bg-gray-50 border border-gray-200 rounded-none p-1 h-[60px] text-[10px] italic text-gray-400 flex items-center justify-center">
              SIN NOTAS ADICIONALES.
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Right Section: Detailed Totals Grid - Compressed */}
      <div className="col-span-7 flex flex-col gap-0 h-full justify-end">
        <div className="totals-grid-legacy p-0 shadow-sm overflow-hidden bg-white !rounded-none !border-0 flex-grow">
          <div className="grid grid-cols-2">
            {/* Left Column of Totals Row 1 */}
            <div className="totals-row-zebra flex justify-between items-center h-6 px-2 border-b border-gray-200 border-r">
              <span className="text-[13px] font-black text-[#006400] uppercase">SUB-TOTAL</span>
              <span className="font-mono font-black text-[14px] text-[#008000]">{totals.subTotal.toFixed(2)}</span>
            </div>
            {/* Right Column of Totals Row 1 */}
            <div className="totals-row-zebra totals-separator flex justify-between items-center h-6 px-2 border-b border-gray-200">
              <div className="flex items-center gap-1 cursor-pointer" onClick={() => onNotImplemented('Recargo')}>
                <span className="text-[13px] font-black text-gray-800 uppercase">F7 - RECARGO</span>
              </div>
              <span className="font-mono font-black text-[14px] text-black">{Number(recargo || 0).toFixed(2)}</span>
            </div>

            {/* Row 2 */}
            <div className="totals-row-zebra flex justify-between items-center h-6 px-2 border-b border-gray-200 border-r">
              <span className="text-[13px] font-black text-black uppercase">F8 - DESCUENTO</span>
              <span className="font-mono font-black text-[14px] text-black">0.00</span>
            </div>
            <div className="totals-row-zebra totals-separator flex justify-between items-center h-6 px-2 border-b border-gray-200">
              <span className="text-[13px] font-black text-black uppercase">TOTAL ITBIS</span>
              <span className="font-mono font-black text-[14px] text-black">{totals.totalItbis.toFixed(2)}</span>
            </div>

            {/* Row 3 */}
            <div className="totals-row-zebra flex justify-between items-center h-6 px-2 border-r">
              <span className="text-[13px] font-black text-black uppercase">DSCTO. ITEMS</span>
              <span className="font-mono font-black text-[14px] text-black">{totals.totalDescuento.toFixed(2)}</span>
            </div>
            <div className="totals-row-zebra totals-separator flex justify-between items-center h-6 px-2">
              {/* Empty */}
            </div>
          </div>

          {/* TOTAL FACTURA Section */}
          <div className="border-t border-gray-400 h-7 flex justify-between items-center px-2 bg-white">
            <span className="text-[16px] font-black text-[#ff0000] uppercase tracking-tighter">TOTAL FACTURA</span>
            <span className="font-mono text-[20px] font-black text-[#ff0000] tracking-tighter leading-none">
              {totals.totalFactura.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Print Selection and Actions Container - Styled like Compras */}
        <div className="flex items-center bg-gray-100 border-t border-gray-300 p-1">
          {/* Print Selector Area */}
          <div className="flex-grow flex gap-2">
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
          <div className="flex justify-end gap-2">
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
              onClick={onFacturar}
              disabled={isSaving}
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <img src="https://img.icons8.com/color/48/save.png" className="w-4 h-4 grayscale brightness-0 invert" alt="save" />}
              F10 - Grabar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VentasFooter;