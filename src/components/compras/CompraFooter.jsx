import React, { useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const CompraFooter = ({ compra, setCompra, pagos, setPagos, totals }) => {
  const [activeTab, setActiveTab] = useState('pago');

  const handlePaymentChange = (id, field, value) => {
    setPagos(pagos.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const addPaymentRow = () => {
    setPagos([...pagos, { tipo: '01', referencia: '', monto: 0, id: Date.now() }]);
  };

  const removePaymentRow = (id) => {
    if (pagos.length > 1) {
      setPagos(pagos.filter(p => p.id !== id));
    }
  };

  const totalPagado = useMemo(() => pagos.reduce((sum, p) => sum + (parseFloat(p.monto) || 0), 0), [pagos]);
  const pendiente = useMemo(() => Math.max(0, totals.total - totalPagado), [totals.total, totalPagado]);

  return (
    <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6">
      {/* Left Column: Tabs Content */}
      <div className="border rounded shadow-sm bg-white overflow-hidden flex flex-col">
        {/* Tab Headers */}
        <div className="flex bg-gray-100 border-b overflow-x-auto">
          {[
            { id: 'pago', label: 'Forma de Pago' },
            { id: 'financiamiento', label: 'Financiamiento' },
            { id: 'pagareses', label: 'Pagareses' },
            { id: 'notas', label: 'Notas/Comentarios' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-1.5 text-[11px] font-bold uppercase transition-colors shrink-0 ${activeTab === tab.id
                ? 'bg-white text-morla-blue border-r border-l first:border-l-0 border-t-2 border-t-morla-blue'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content Area */}
        <div className="p-4 flex-1 min-h-[160px]">
          <AnimatePresence mode="wait">
            {activeTab === 'pago' && (
              <motion.div
                key="pago"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-6">
                  <RadioGroup value={compra.forma_pago} onValueChange={v => setCompra({ ...compra, forma_pago: v })} className="flex space-x-6">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="Contado" id="contado" className="h-4 w-4" />
                      <Label htmlFor="contado" className="text-xs font-bold">Contado</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="Credito" id="credito" className="h-4 w-4" />
                      <Label htmlFor="credito" className="text-xs font-bold">Crédito</Label>
                    </div>
                  </RadioGroup>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={compra.dias_credito}
                      onChange={e => setCompra({ ...compra, dias_credito: e.target.value })}
                      className="w-16 h-7 text-xs text-center"
                      disabled={compra.forma_pago !== 'Credito'}
                    />
                    <Label className="text-[11px] text-gray-500 font-bold uppercase">Dias</Label>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-[11px] font-bold text-gray-700 block uppercase">Monto Pagado</Label>
                  {pagos.map((pago, index) => (
                    <div key={pago.id} className="flex gap-2 items-center">
                      <Select value={pago.tipo} onValueChange={v => handlePaymentChange(pago.id, 'tipo', v)}>
                        <SelectTrigger className="h-8 text-xs bg-gray-50 w-32"><SelectValue /></SelectTrigger>
                        <SelectContent className="text-xs">
                          <SelectItem value="01">Efectivo</SelectItem>
                          <SelectItem value="02">Cheque</SelectItem>
                          <SelectItem value="03">Transferencia</SelectItem>
                          <SelectItem value="04">Tarjeta</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Referencia / No. Voucher"
                        value={pago.referencia}
                        onChange={e => handlePaymentChange(pago.id, 'referencia', e.target.value)}
                        className="h-8 text-xs flex-1"
                      />
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={pago.monto}
                        onChange={e => handlePaymentChange(pago.id, 'monto', e.target.value)}
                        className="h-8 text-xs text-right w-32 font-mono font-bold"
                      />
                      <div className="flex gap-1">
                        {index === pagos.length - 1 ? (
                          <Button variant="outline" size="icon" className="h-8 w-8 text-blue-600 border-blue-200" onClick={addPaymentRow}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600" onClick={() => removePaymentRow(pago.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4 pt-3 border-t">
                  <div className="space-y-1">
                    <div className="flex justify-between items-center px-1">
                      <span className="text-[10px] font-bold text-gray-500 uppercase">Total Pagado :</span>
                      <span className="text-sm font-bold text-morla-blue font-mono">{totalPagado.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center px-1">
                      <span className="text-[10px] font-bold text-gray-500 uppercase">Pendiente :</span>
                      <span className="text-sm font-bold text-red-500 font-mono">{pendiente.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex gap-2">
                      <Select defaultValue="0">
                        <SelectTrigger className="h-7 text-[10px] bg-gray-50 uppercase font-bold"><SelectValue placeholder="Elja ITBIS Retenid" /></SelectTrigger>
                        <SelectContent><SelectItem value="0">0.00</SelectItem></SelectContent>
                      </Select>
                      <span className="text-xs font-mono py-1">0.00</span>
                    </div>
                    <div className="flex gap-2">
                      <Select defaultValue="0">
                        <SelectTrigger className="h-7 text-[10px] bg-gray-50 uppercase font-bold"><SelectValue placeholder="Elja ISR Retenido" /></SelectTrigger>
                        <SelectContent><SelectItem value="0">0.00</SelectItem></SelectContent>
                      </Select>
                      <span className="text-xs font-mono py-1">0.00</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'notas' && (
              <motion.div
                key="notas"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
              >
                <Label className="text-[11px] font-bold text-gray-400 uppercase mb-2 block">Notas Internas o Comentarios</Label>
                <textarea
                  className="w-full h-32 p-3 text-xs border rounded-md bg-gray-50/50 focus:outline-none focus:ring-1 focus:ring-morla-blue/30 resize-none font-sans"
                  placeholder="Escriba aquí cualquier observación relevante..."
                  value={compra.notas || ''}
                  onChange={e => setCompra({ ...compra, notas: e.target.value })}
                ></textarea>
              </motion.div>
            )}

            {(activeTab === 'financiamiento' || activeTab === 'pagareses') && (
              <motion.div
                key="placeholder"
                className="h-full flex items-center justify-center text-gray-400 italic text-xs"
              >
                Sección en desarrollo...
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Right Column: Totals */}
      <div className="border rounded shadow-sm bg-gray-50/50 p-4 space-y-3">
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs text-gray-600">
            <span className="uppercase font-bold">Total Exento</span>
            <span className="font-mono font-bold tracking-tight">{totals.exento.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center text-xs text-gray-600">
            <span className="uppercase font-bold">Total Gravado</span>
            <span className="font-mono font-bold tracking-tight">{totals.gravado.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center text-xs text-gray-600">
            <span className="uppercase font-bold">Descuento</span>
            <span className="font-mono font-bold tracking-tight text-red-500">{totals.descuento.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center text-xs text-gray-600">
            <span className="uppercase font-bold">ITBIS</span>
            <span className="font-mono font-bold tracking-tight">{totals.itbis.toFixed(2)}</span>
          </div>
        </div>

        <div className="border-t border-gray-300 pt-3 mt-3">
          <div className="flex justify-between items-end">
            <span className="text-sm font-black text-red-600 uppercase tracking-tighter">TOTAL COMPRA</span>
            <span className="text-3xl font-black text-red-600 font-mono leading-none tracking-tighter">
              {totals.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        <div className="pt-4 space-y-2 border-t mt-4 border-gray-200">
          <div className="flex items-center space-x-3 cursor-pointer group bg-white p-2 rounded border border-gray-100 shadow-sm hover:border-morla-blue/30 transition-all">
            <Checkbox
              id="itbis-incluido"
              checked={compra.itbis_incluido}
              onCheckedChange={c => setCompra({ ...compra, itbis_incluido: c })}
              className="h-5 w-5 border-2 border-gray-300 data-[state=checked]:bg-morla-blue data-[state=checked]:border-morla-blue transition-all"
            />
            <Label htmlFor="itbis-incluido" className="text-[11px] font-black text-gray-700 uppercase cursor-pointer group-hover:text-morla-blue transition-colors">ITBIS incluido?</Label>
          </div>
          <div className="flex items-center space-x-3 cursor-pointer group bg-white p-2 rounded border border-gray-100 shadow-sm hover:border-morla-blue/30 transition-all">
            <Checkbox
              id="actualizar-precios"
              checked={compra.actualizar_precios}
              onCheckedChange={c => setCompra({ ...compra, actualizar_precios: c })}
              className="h-5 w-5 border-2 border-gray-300 data-[state=checked]:bg-morla-blue data-[state=checked]:border-morla-blue transition-all"
            />
            <Label htmlFor="actualizar-precios" className="text-[11px] font-black text-gray-700 uppercase cursor-pointer group-hover:text-morla-blue transition-colors">Actualizar precios?</Label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompraFooter;