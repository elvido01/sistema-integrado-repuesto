import React, { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Plus } from 'lucide-react';

const CompraFooter = ({ compra, setCompra, pagos, setPagos, totals }) => {
  
  const handlePaymentChange = (id, field, value) => {
    setPagos(pagos.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const addPaymentRow = () => {
    setPagos([...pagos, { tipo: '01', referencia: '', monto: 0, id: Date.now() }]);
  };

  const totalPagado = useMemo(() => pagos.reduce((sum, p) => sum + (parseFloat(p.monto) || 0), 0), [pagos]);

  return (
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="border p-4 rounded-lg space-y-3">
        <h3 className="font-bold text-morla-blue">Forma de Pago</h3>
        <RadioGroup value={compra.forma_pago} onValueChange={v => setCompra({...compra, forma_pago: v})} className="flex space-x-4">
          <div className="flex items-center space-x-2"><RadioGroupItem value="Contado" id="contado" /><Label htmlFor="contado">Contado</Label></div>
          <div className="flex items-center space-x-2"><RadioGroupItem value="Credito" id="credito" /><Label htmlFor="credito">Crédito</Label></div>
        </RadioGroup>
        {compra.forma_pago === 'Credito' && (
          <div className="flex items-center space-x-2">
            <Label>Días de crédito</Label>
            <Input type="number" value={compra.dias_credito} onChange={e => setCompra({...compra, dias_credito: e.target.value})} className="w-24" />
          </div>
        )}
        <div className="space-y-2">
          {pagos.map((pago, index) => (
            <div key={pago.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
              <Select value={pago.tipo} onValueChange={v => handlePaymentChange(pago.id, 'tipo', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="01">Efectivo</SelectItem>
                  <SelectItem value="02">Cheque</SelectItem>
                  <SelectItem value="03">Transferencia</SelectItem>
                  <SelectItem value="04">Tarjeta</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Referencia" value={pago.referencia} onChange={e => handlePaymentChange(pago.id, 'referencia', e.target.value)} />
              <Input type="number" placeholder="Monto" value={pago.monto} onChange={e => handlePaymentChange(pago.id, 'monto', e.target.value)} className="text-right" />
              {index === pagos.length - 1 && <Button size="sm" onClick={addPaymentRow}><Plus className="h-4 w-4" /></Button>}
            </div>
          ))}
        </div>
        <div className="flex justify-between font-bold pt-2 border-t">
          <span>Total Pagado:</span>
          <span>{totalPagado.toFixed(2)}</span>
        </div>
      </div>
      <div className="border p-4 rounded-lg space-y-2">
        <div className="flex justify-between"><p>Total Exento:</p><p className="font-bold">{totals.exento.toFixed(2)}</p></div>
        <div className="flex justify-between"><p>Total Gravado:</p><p className="font-bold">{totals.gravado.toFixed(2)}</p></div>
        <div className="flex justify-between"><p>Descuento:</p><p className="font-bold text-red-500">{totals.descuento.toFixed(2)}</p></div>
        <div className="flex justify-between"><p>ITBIS:</p><p className="font-bold">{totals.itbis.toFixed(2)}</p></div>
        <div className="flex justify-between text-xl font-bold text-red-600 border-t pt-2 mt-2"><p>TOTAL COMPRA:</p><p>{totals.total.toFixed(2)}</p></div>
        <div className="flex items-center space-x-2 pt-2">
          <Checkbox id="itbis-incluido" checked={compra.itbis_incluido} onCheckedChange={c => setCompra({...compra, itbis_incluido: c})} />
          <Label htmlFor="itbis-incluido">ITBIS incluido?</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox id="actualizar-precios" checked={compra.actualizar_precios} onCheckedChange={c => setCompra({...compra, actualizar_precios: c})} />
          <Label htmlFor="actualizar-precios">Actualizar precios?</Label>
        </div>
      </div>
    </div>
  );
};

export default CompraFooter;