import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from 'lucide-react';

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
}) => {
  const onNotImplemented = (feature) => {
    // Placeholder for toast notification
    console.log(`${feature} not implemented`);
  };

  return (
    <div className="grid grid-cols-12 gap-2">
      <div className="col-span-5">
        <Tabs defaultValue="pago" className="w-full">
          <TabsList className="h-7 p-0.5">
            <TabsTrigger value="pago" className="h-6 text-xs px-2 py-1">Forma de Pago</TabsTrigger>
            <TabsTrigger value="notas" className="h-6 text-xs px-2 py-1">Notas y Comentarios</TabsTrigger>
            <Button variant="ghost" className="h-6 text-xs px-2 py-1 bg-gray-300 hover:bg-gray-400" onClick={() => onNotImplemented('Financiamiento')}>Realizar Financiamiento</Button>
          </TabsList>
          <TabsContent value="pago" className="border border-gray-400 rounded bg-gray-200 p-2 mt-1">
            <div className="flex gap-4">
              <RadioGroup value={paymentType} onValueChange={setPaymentType} className="flex gap-4">
                <div className="flex items-center space-x-1"><RadioGroupItem value="contado" id="contado" /><Label htmlFor="contado">Contado</Label></div>
                <div className="flex items-center space-x-1"><RadioGroupItem value="credito" id="credito" disabled={!cliente?.autorizar_credito} /><Label htmlFor="credito" className={!cliente?.autorizar_credito ? 'text-gray-400' : ''}>Crédito</Label></div>
              </RadioGroup>
              {paymentType === 'credito' && <div className="flex items-center gap-1"><Input type="number" className="h-6 w-16 text-xs" placeholder="Días" value={diasCredito} onChange={(e) => setDiasCredito(e.target.value)} /><Label>Días</Label></div>}
            </div>
            <div className="border rounded p-1 bg-green-100/50 mt-1">
              <div className="grid grid-cols-3 gap-1">
                <Select disabled={paymentType === 'credito'}><SelectTrigger className="h-6 text-xs"><SelectValue placeholder="EFECTIVO" /></SelectTrigger><SelectContent><SelectItem value="efectivo">EFECTIVO</SelectItem></SelectContent></Select>
                <Input className="h-6 text-xs" placeholder="Número" disabled={paymentType === 'credito'} />
                <Input type="number" className="h-6 text-xs text-right" placeholder="Monto" value={montoRecibido} onChange={e => setMontoRecibido(e.target.value)} disabled={paymentType === 'credito'} />
              </div>
              <div className="h-12 mt-1 bg-white border"></div>
            </div>
            <div className="flex justify-around mt-1">
              <div className="text-center"><p>Recibido</p><p className="font-bold font-mono">{paymentType === 'credito' ? '0.00' : Number(montoRecibido).toFixed(2)}</p></div>
              <div className="text-center"><p>Cambio</p><p className="font-bold font-mono text-green-600">{cambio.toFixed(2)}</p></div>
            </div>
          </TabsContent>
          <TabsContent value="notas" className="border border-gray-400 rounded bg-gray-200 p-2 mt-1 h-[124px]">Notas y comentarios...</TabsContent>
        </Tabs>
      </div>
      <div className="col-span-7 border border-gray-400 rounded p-2 bg-blue-100/50 flex flex-col justify-between">
        <div className="grid grid-cols-2 gap-x-4">
          <div className="space-y-1">
            <div className="flex justify-between"><span>Sub-Total</span><span className="font-mono font-semibold">{totals.subTotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><Button variant="link" className="p-0 h-auto text-blue-600 text-xs" onClick={() => onNotImplemented('Descuento global')}>F8 - Descuento</Button><span className="font-mono font-semibold">0.00</span></div>
            <div className="flex justify-between"><span>Descuento en Items</span><span className="font-mono font-semibold">{totals.totalDescuento.toFixed(2)}</span></div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between"><Button variant="link" className="p-0 h-auto text-blue-600 text-xs" onClick={() => onNotImplemented('Recargo')}>F7 - Recargo</Button><span className="font-mono font-semibold">0.00</span></div>
            <div className="flex justify-between"><span>TOTAL ITBIS</span><span className="font-mono font-semibold">{totals.totalItbis.toFixed(2)}</span></div>
          </div>
        </div>
        <div className="border-t-2 border-gray-400 pt-1 mt-1 flex justify-between items-center text-red-600 text-lg font-bold">
          <span>TOTAL FACTURA</span>
          <span className="font-mono">{totals.totalFactura.toFixed(2)}</span>
        </div>
        <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => onNotImplemented('F12 - Limpiar')}>F12 - Limpiar</Button>
            <Button className="bg-morla-blue hover:bg-morla-blue-dark" onClick={onFacturar} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                F10 - Grabar
            </Button>
        </div>
      </div>
    </div>
  );
};

export default VentasFooter;