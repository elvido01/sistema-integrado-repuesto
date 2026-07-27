import React, { useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const CompraFooter = ({
  compra,
  setCompra,
  pagos,
  setPagos,
  totals,
  printFormat = 'pos_4inch',
  setPrintFormat = () => {},
  financiamiento = { activo: false, num_cuotas: 6, frecuencia: 'mensual', fecha_primera: '', cuotas: [] },
  setFinanciamiento = () => {},
  esUSD = false,
}) => {
  const [activeTab, setActiveTab] = useState('pago');

  const handlePaymentChange = (id, field, value) => {
    setPagos(pagos.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  // ===== Financiamiento por cuotas (pagarés) =====
  const moneda = esUSD ? 'US$' : 'RD$';
  const esCredito = compra.forma_pago === 'Credito';
  const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pad2 = (n) => String(n).padStart(2, '0');
  const toISO = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const baseFechaISO = () => {
    const f = compra?.fecha;
    if (!f) return toISO(new Date());
    if (typeof f === 'string') return f.slice(0, 10);
    try { return toISO(new Date(f)); } catch { return toISO(new Date()); }
  };
  const addMonthsISO = (iso, m) => { const d = new Date(`${iso}T00:00:00`); d.setMonth(d.getMonth() + m); return toISO(d); };
  const addDaysISO = (iso, days) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate() + days); return toISO(d); };

  const generarPagares = () => {
    const n = Math.max(2, parseInt(financiamiento.num_cuotas, 10) || 2);
    const total = Number(totals.total) || 0;
    if (total <= 0) return;
    const fecha1 = financiamiento.fecha_primera || addMonthsISO(baseFechaISO(), 1);
    const base = Math.floor((total / n) * 100) / 100;
    const cuotas = [];
    let acc = 0;
    for (let i = 0; i < n; i++) {
      const monto = i === n - 1 ? Number((total - acc).toFixed(2)) : base;
      acc = Number((acc + base).toFixed(2));
      const fecha = financiamiento.frecuencia === 'quincenal' ? addDaysISO(fecha1, 15 * i) : addMonthsISO(fecha1, i);
      cuotas.push({ n: i + 1, fecha, monto });
    }
    setFinanciamiento((f) => ({ ...f, fecha_primera: fecha1, cuotas }));
  };

  const toggleFinanciar = (checked) => {
    setFinanciamiento((f) => ({ ...f, activo: !!checked, fecha_primera: f.fecha_primera || addMonthsISO(baseFechaISO(), 1) }));
    if (checked) setActiveTab('financiamiento');
  };

  const updateCuota = (idx, field, value) => {
    setFinanciamiento((f) => ({ ...f, cuotas: f.cuotas.map((c, i) => (i === idx ? { ...c, [field]: value } : c)) }));
  };
  const removeCuota = (idx) => {
    setFinanciamiento((f) => ({ ...f, cuotas: f.cuotas.filter((_, i) => i !== idx).map((c, i) => ({ ...c, n: i + 1 })) }));
  };
  const addCuota = () => {
    setFinanciamiento((f) => {
      const last = f.cuotas[f.cuotas.length - 1];
      const nextFecha = last
        ? (f.frecuencia === 'quincenal' ? addDaysISO(last.fecha, 15) : addMonthsISO(last.fecha, 1))
        : (f.fecha_primera || addMonthsISO(baseFechaISO(), 1));
      return { ...f, cuotas: [...f.cuotas, { n: f.cuotas.length + 1, fecha: nextFecha, monto: 0 }] };
    });
  };

  const sumaPagares = (financiamiento.cuotas || []).reduce((s, c) => s + (Number(c.monto) || 0), 0);
  const totalCompra = Number(totals.total) || 0;
  const difPagares = Number((totalCompra - sumaPagares).toFixed(2));
  const pagaresCuadran = Math.abs(difPagares) < 0.01 && (financiamiento.cuotas || []).length >= 2;

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
                  <RadioGroup value={compra.forma_pago} onValueChange={v => { setCompra({ ...compra, forma_pago: v }); if (v !== 'Credito') setFinanciamiento(f => ({ ...f, activo: false })); }} className="flex space-x-6">
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
                      onChange={e => setCompra({ ...compra, dias_credito: parseInt(e.target.value) || 0 })}
                      className="w-16 h-7 text-xs text-center"
                      disabled={compra.forma_pago !== 'Credito'}
                    />
                    <Label className="text-[11px] text-gray-500 font-bold uppercase">Dias</Label>
                    <div className="flex items-center gap-1 ml-1">
                      {[30, 60, 90].map(d => (
                        <button
                          key={d}
                          type="button"
                          disabled={compra.forma_pago !== 'Credito'}
                          onClick={() => setCompra({ ...compra, dias_credito: d })}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors disabled:opacity-40 ${Number(compra.dias_credito) === d ? 'bg-morla-blue text-white border-morla-blue' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}`}
                        >
                          {d}d
                        </button>
                      ))}
                    </div>
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

            {activeTab === 'financiamiento' && (
              <motion.div
                key="financiamiento"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-4"
              >
                {!esCredito ? (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
                    Para financiar en pagarés, seleccione <b>Crédito</b> en la pestaña "Forma de Pago".
                  </div>
                ) : (
                  <>
                    <div className="flex items-center space-x-3 bg-white p-2 rounded border border-gray-100 shadow-sm">
                      <Checkbox
                        id="fin-activo"
                        checked={financiamiento.activo}
                        onCheckedChange={toggleFinanciar}
                        className="h-5 w-5 border-2 border-gray-300 data-[state=checked]:bg-morla-blue data-[state=checked]:border-morla-blue"
                      />
                      <Label htmlFor="fin-activo" className="text-[11px] font-black text-gray-700 uppercase cursor-pointer">
                        Financiar esta compra en pagarés ({moneda})
                      </Label>
                    </div>

                    {financiamiento.activo && (
                      <>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold text-gray-500 uppercase">N° de pagarés</Label>
                            <Input
                              type="number"
                              min="2"
                              value={financiamiento.num_cuotas}
                              onChange={e => setFinanciamiento(f => ({ ...f, num_cuotas: parseInt(e.target.value, 10) || 0 }))}
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold text-gray-500 uppercase">Frecuencia</Label>
                            <Select value={financiamiento.frecuencia} onValueChange={v => setFinanciamiento(f => ({ ...f, frecuencia: v }))}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="mensual">Mensual</SelectItem>
                                <SelectItem value="quincenal">Quincenal</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold text-gray-500 uppercase">1er vencimiento</Label>
                            <Input
                              type="date"
                              value={financiamiento.fecha_primera}
                              onChange={e => setFinanciamiento(f => ({ ...f, fecha_primera: e.target.value }))}
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <Button onClick={generarPagares} className="h-8 text-xs bg-morla-blue text-white hover:bg-morla-blue/90">
                            Generar {financiamiento.num_cuotas || 0} pagarés
                          </Button>
                          <span className="text-[11px] text-gray-500">
                            Total a financiar: <b className="font-mono">{moneda} {fmt(totalCompra)}</b>
                          </span>
                        </div>

                        {financiamiento.cuotas.length > 0 && (
                          <div className={`text-[11px] font-bold ${pagaresCuadran ? 'text-emerald-600' : 'text-red-500'}`}>
                            {financiamiento.cuotas.length} pagarés listos — revíselos y edítelos en la pestaña "Pagareses".
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </motion.div>
            )}

            {activeTab === 'pagareses' && (
              <motion.div
                key="pagareses"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
              >
                {!financiamiento.activo ? (
                  <div className="text-xs text-gray-400 italic">Active el financiamiento en la pestaña "Financiamiento".</div>
                ) : financiamiento.cuotas.length === 0 ? (
                  <div className="text-xs text-gray-400 italic">Genere los pagarés en la pestaña "Financiamiento".</div>
                ) : (
                  <div className="space-y-2">
                    <div className="max-h-[220px] overflow-y-auto border rounded">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr className="text-[10px] uppercase text-gray-500">
                            <th className="p-2 text-left w-12">#</th>
                            <th className="p-2 text-left">Vencimiento</th>
                            <th className="p-2 text-right">Monto ({moneda})</th>
                            <th className="p-2 w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {financiamiento.cuotas.map((c, idx) => (
                            <tr key={idx} className="border-t">
                              <td className="p-1.5 font-bold text-gray-600">{idx + 1}/{financiamiento.cuotas.length}</td>
                              <td className="p-1.5">
                                <Input type="date" value={c.fecha} onChange={e => updateCuota(idx, 'fecha', e.target.value)} className="h-7 text-xs" />
                              </td>
                              <td className="p-1.5">
                                <Input
                                  type="number"
                                  value={c.monto}
                                  onChange={e => updateCuota(idx, 'monto', e.target.value === '' ? '' : parseFloat(e.target.value))}
                                  className="h-7 text-xs text-right font-mono"
                                />
                              </td>
                              <td className="p-1.5 text-center">
                                <button type="button" onClick={() => removeCuota(idx)} className="text-red-400 hover:text-red-600">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between">
                      <Button variant="outline" onClick={addCuota} className="h-7 text-[11px] text-blue-600 border-blue-200">
                        <Plus className="h-3.5 w-3.5 mr-1" /> Agregar pagaré
                      </Button>
                      <div className="text-[11px] text-right space-y-0.5">
                        <div>Suma pagarés: <b className="font-mono">{moneda} {fmt(sumaPagares)}</b></div>
                        <div className={pagaresCuadran ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold'}>
                          {pagaresCuadran ? '✓ Cuadra con el total' : `Diferencia: ${moneda} ${fmt(difPagares)}`}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
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

        {/* Un solo control. Antes eran dos (método + tamaño) y la hoja carta
            quedaba escondida detrás de "PDF", así que parecía que no existía. */}
        <div className="mt-3 pt-3 border-t space-y-2">
          <div>
            <Label className="text-[11px] font-bold text-gray-500 uppercase mb-1 block tracking-wider">Formato de Impresión</Label>
            <Select value={printFormat} onValueChange={setPrintFormat}>
              <SelectTrigger className="h-8 text-xs font-bold bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">📄 Hoja Carta (8.5 x 11)</SelectItem>
                <SelectItem value="pos_4inch">📑 Ticket 101.6mm (4 pulgadas)</SelectItem>
                <SelectItem value="pos_80mm">📑 Ticket 80mm (3 pulgadas)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-gray-400 italic mt-1">
              Se recuerda en esta PC. El valor por defecto se pone en Configuración del Sistema.
            </p>
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