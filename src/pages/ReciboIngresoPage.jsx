import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { formatInTimeZone, getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';
import { Save, X, Loader2, FilePlus, Search, Trash2, PlusCircle } from 'lucide-react';
import { usePanels } from '@/contexts/PanelContext';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import ClienteSearchModal from '@/components/ventas/ClienteSearchModal';
import { printReciboPOS, printRecibo4Pulgadas } from '@/lib/printPOS';
import { generateReciboPDF } from '@/components/common/PDFGenerator';

const initialState = {
  numero: '',
  fecha: getCurrentDateInTimeZone(),
  clienteId: null,
  clienteNombre: '',
  balanceAnterior: 0,
  totalPagado: 0,
  balanceActual: 0,
  imprimir: true,
};

const ReciboIngresoPage = () => {
  const { toast } = useToast();
  const { closePanel } = usePanels();
  const [recibo, setRecibo] = useState(initialState);
  const [clientes, setClientes] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [pagos, setPagos] = useState([{ id: 1, forma: 'Efectivo', monto: 0, referencia: '' }]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [datosCliente, setDatosCliente] = useState({ balance_anterior: 0, ultimo_pago: null });
  const [isClienteSearchModalOpen, setIsClienteSearchModalOpen] = useState(false);
  const [tipoPapel, setTipoPapel] = useState('4 Pulgadas');

  const formatCurrency = (value) => new Intl.NumberFormat('es-DO', { style: 'decimal', minimumFractionDigits: 2 }).format(value || 0);

  const fetchInitialData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: clientesData, error: clientesError } = await supabase.from('clientes').select('id, nombre, rnc, direccion, telefono').eq('activo', true);
      if (clientesError) throw clientesError;
      setClientes(clientesData);

      const { data: nextNumData, error: nextNumError } = await supabase.rpc('get_next_recibo_ingreso_numero');
      if (nextNumError) throw nextNumError;
      setRecibo(prev => ({ ...prev, numero: nextNumData }));
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al cargar datos iniciales', description: error.message });
    }
    setIsLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const handleClientSelect = async (clienteId) => {
    if (!clienteId) {
      setRecibo(prev => ({ ...prev, clienteId: null, clienteNombre: '', balanceAnterior: 0 }));
      setFacturas([]);
      setDatosCliente({ balance_anterior: 0, ultimo_pago: null });
      return;
    }
    setIsLoading(true);
    const selectedClient = clientes.find(c => c.id === clienteId);
    try {
      const { data, error } = await supabase.rpc('get_datos_cliente_para_recibo', { p_cliente_id: clienteId });
      if (error) throw error;

      const facturasConAbono = data.facturas_pendientes.map(f => ({ ...f, abono: 0 }));

      setFacturas(facturasConAbono);
      setDatosCliente({ balance_anterior: data.balance_anterior, ultimo_pago: data.ultimo_pago });
      setRecibo(prev => ({
        ...prev,
        clienteId,
        clienteNombre: selectedClient?.nombre || '',
        balanceAnterior: data.balance_anterior,
        balanceActual: data.balance_anterior,
        fecha: getCurrentDateInTimeZone(),
      }));
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al cargar facturas', description: error.message });
    }
    setIsLoading(false);
  };

  const handleAbonoChange = (facturaId, abono) => {
    const abonoValue = parseFloat(abono) || 0;
    setFacturas(facturas.map(f => {
      if (f.id === facturaId) {
        const montoPendiente = parseFloat(f.monto_pendiente);
        const newAbono = abonoValue > montoPendiente ? montoPendiente : abonoValue;
        return { ...f, abono: newAbono };
      }
      return f;
    }));
  };

  const totalPagadoFormas = useMemo(() => {
    return pagos.reduce((sum, p) => sum + Number(p.monto), 0);
  }, [pagos]);

  const totalAbonos = useMemo(() => {
    return facturas.reduce((sum, f) => sum + Number(f.abono), 0);
  }, [facturas]);

  // FIFO Auto-distribution logic
  useEffect(() => {
    let remaining = totalPagadoFormas;
    const sortedFacturas = [...facturas].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    const newFacturas = facturas.map(f => {
      // Find where this invoice stands in the FIFO queue
      const montoPendiente = parseFloat(f.monto_pendiente);
      let abono = 0;

      // Find the equivalent sorted invoice to determine allocation order
      const sortedIdx = sortedFacturas.findIndex(sf => sf.id === f.id);

      // Calculate how much prior invoices in the queue took
      let takenBefore = 0;
      for (let i = 0; i < sortedIdx; i++) {
        takenBefore += parseFloat(sortedFacturas[i].monto_pendiente);
      }

      const availableForThis = Math.max(0, totalPagadoFormas - takenBefore);
      abono = Math.min(montoPendiente, availableForThis);

      return { ...f, abono: Number(abono.toFixed(2)) };
    });

    // Only update if the result is different from current abonos to prevent loops
    const currentTotalAbonos = facturas.reduce((sum, f) => sum + Number(f.abono), 0);
    if (Math.abs(currentTotalAbonos - totalPagadoFormas) > 0.01) {
      setFacturas(newFacturas);
    }
  }, [totalPagadoFormas, facturas.length]);

  useEffect(() => {
    const balanceActual = Number((recibo.balanceAnterior - totalAbonos).toFixed(2));
    setRecibo(prev => ({ ...prev, totalPagado: totalAbonos, balanceActual }));
  }, [totalAbonos, recibo.balanceAnterior]);

  const handlePagoChange = (id, field, value) => {
    setPagos(pagos.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const addPago = () => {
    setPagos([...pagos, { id: Date.now(), forma: 'Efectivo', monto: 0, referencia: '' }]);
  };

  const removePago = (id) => {
    if (pagos.length > 1) {
      setPagos(pagos.filter(p => p.id !== id));
    }
  };

  const handleSave = async () => {
    if (!recibo.clienteId) {
      toast({ variant: 'destructive', title: 'Error de validación', description: 'Debe seleccionar un cliente.' });
      return;
    }
    if (totalAbonos <= 0) {
      toast({ variant: 'destructive', title: 'Error de validación', description: 'Debe ingresar al menos un abono.' });
      return;
    }
    if (Math.abs(totalAbonos - totalPagadoFormas) > 0.01) {
      toast({ variant: 'destructive', title: 'Error de validación', description: 'El total de formas de pago no coincide con el total a pagar.' });
      return;
    }

    setIsSaving(true);
    const reciboData = {
      cliente_id: recibo.clienteId,
      fecha: formatDateForSupabase(recibo.fecha),
      monto_pagado: totalAbonos,
      concepto: `Pago/Abono a facturas`,
      formas_pago: pagos,
    };

    const abonosData = facturas
      .filter(f => f.abono > 0)
      .map(f => ({
        factura_id: f.id,
        monto_abono: f.abono,
      }));

    try {
      const { data: reciboNumero, error } = await supabase.rpc('crear_recibo_ingreso_y_actualizar_facturas', {
        p_recibo_data: reciboData,
        p_abonos_data: abonosData,
      });

      if (error) throw error;

      toast({ title: 'Éxito', description: `Recibo ${reciboNumero} guardado correctamente.` });

      if (recibo.imprimir) {
        const clientFullInfo = clientes.find(c => c.id === recibo.clienteId);
        const dataForPrint = {
          numero: reciboNumero,
          fecha: recibo.fecha,
          clienteNombre: recibo.clienteNombre,
          balanceAnterior: recibo.balanceAnterior,
          totalPagado: totalAbonos,
          balanceActual: recibo.balanceActual,
          abonos: facturas.filter(f => f.abono > 0).map(f => ({
            referencia: f.referencia,
            monto_pendiente: f.monto_pendiente,
            monto_abono: f.abono
          })),
          formasPago: pagos
        };

        if (tipoPapel === '80mm') {
          printReciboPOS(dataForPrint);
        } else if (tipoPapel === '4 Pulgadas') {
          printRecibo4Pulgadas(dataForPrint);
        } else {
          generateReciboPDF(dataForPrint, clientFullInfo, dataForPrint.abonos, dataForPrint.formasPago);
        }
      }

      resetForm();

    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al guardar el recibo', description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = useCallback(() => {
    setRecibo(initialState);
    setFacturas([]);
    setPagos([{ id: 1, forma: 'Efectivo', monto: 0, referencia: '' }]);
    setDatosCliente({ balance_anterior: 0, ultimo_pago: null });
    setTipoPapel('4 Pulgadas');
    fetchInitialData();
  }, [fetchInitialData]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'F3') {
      e.preventDefault();
      setIsClienteSearchModalOpen(true);
    }
    if (e.key === 'F10') {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closePanel('recibo-ingreso');
    }
  }, [handleSave, closePanel, setIsClienteSearchModalOpen]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      <Helmet>
        <title>Recibo de Ingreso - Repuestos Morla</title>
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-1 md:p-4 bg-gray-100 min-h-full flex flex-col"
      >
        <div className="bg-[#f0f0f0] border border-gray-300 rounded shadow-lg flex-grow flex flex-col overflow-hidden">
          {/* LEGACY HEADER STYLE */}
          <div className="bg-[#b4c7e7] text-[#0a1e3a] text-center py-1 border-b border-gray-400 relative">
            <h1 className="text-2xl font-black uppercase tracking-widest italic" style={{ textShadow: '1px 1px 0px white' }}>RECIBO DE INGRESO</h1>
          </div>

          <div className="p-3 flex-grow flex flex-col space-y-3">
            <div className="grid grid-cols-12 gap-4">
              {/* SECCIÓN CLIENTE (IZQUIERDA) */}
              <div className="col-span-12 lg:col-span-8 space-y-2">
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-6 bg-white border border-gray-300 p-2 rounded shadow-sm relative">
                    <div className="absolute -top-2 left-2 bg-gray-100 px-1 text-[10px] font-bold text-gray-500 uppercase">Cliente</div>
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-2">
                        <Label className="text-[11px] font-black w-24">Código de Cliente</Label>
                        <Select onValueChange={handleClientSelect} disabled={isLoading} value={recibo.clienteId || ''}>
                          <SelectTrigger className="h-7 text-[11px] font-bold border-gray-400">
                            <SelectValue placeholder="Busque un cliente..." />
                          </SelectTrigger>
                          <SelectContent>
                            {clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 font-bold bg-gray-100"
                          onClick={() => setIsClienteSearchModalOpen(true)}
                        >
                          F3
                        </Button>
                      </div>
                      <div className="pl-24">
                        <div className="text-[12px] font-black text-blue-800 uppercase leading-tight">{recibo.clienteNombre || '---'}</div>
                        <div className="text-[10px] text-gray-600 italic">AV. JUAN XXIII, LOS NARANJOS, HIGUEY</div>
                      </div>
                    </div>
                  </div>

                  <div className="col-span-6 flex flex-col gap-2">
                    <div className="bg-white border border-gray-300 p-2 rounded shadow-sm flex items-center justify-between">
                      <div className="text-[11px] font-black uppercase">Cobrador</div>
                      <Select defaultValue="REPUESTOS MORLA">
                        <SelectTrigger className="h-7 w-40 text-[11px] font-bold border-gray-400">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="REPUESTOS MORLA">REPUESTOS MORLA</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="text-[10px] italic text-blue-600 font-bold ml-2">
                        Ultimo Pago --{'>'} {datosCliente.ultimo_pago ? formatInTimeZone(new Date(datosCliente.ultimo_pago.fecha), 'dd/MM/yyyy') : 'N/A'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      <Button variant="destructive" size="sm" className="h-7 px-4 font-black text-[11px] uppercase shadow-md hover:scale-105 transition-transform">
                        Generar Proxima Cuota
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECCIÓN PAGO (DERECHA) */}
              <div className="col-span-12 lg:col-span-4 space-y-2">
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="flex flex-col items-end">
                    <Label className="text-[11px] font-bold uppercase mr-2">Numero :</Label>
                    <Input value={recibo.numero} readOnly className="h-7 w-24 text-[11px] font-black text-center bg-gray-50 border-gray-400 shadow-inner" />
                  </div>
                  <div className="flex flex-col items-end">
                    <Label className="text-[11px] font-bold uppercase mr-2">Fecha :</Label>
                    <Input value={formatInTimeZone(recibo.fecha, 'dd/MM/yyyy')} readOnly className="h-7 w-28 text-[11px] font-black text-center bg-gray-50 border-gray-400 shadow-inner" />
                  </div>
                </div>

                <div className="bg-white border border-gray-400 overflow-hidden shadow-sm">
                  <Table className="border-collapse">
                    <TableHeader className="bg-gray-100 border-b border-gray-400">
                      <TableRow className="h-6">
                        <TableHead className="text-[10px] font-black text-center uppercase p-0 h-6 border-r border-gray-300">Forma de Pago</TableHead>
                        <TableHead className="text-[10px] font-black text-center uppercase p-0 h-6 border-r border-gray-300">NUMERO</TableHead>
                        <TableHead className="text-[10px] font-black text-center uppercase p-0 h-6">MONTO</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagos.map((pago) => (
                        <TableRow key={pago.id} className="h-7 border-b border-gray-200 group">
                          <TableCell className="p-0 border-r border-gray-300">
                            <Select value={pago.forma} onValueChange={(v) => handlePagoChange(pago.id, 'forma', v)}>
                              <SelectTrigger className="h-6 border-0 rounded-none text-[10px] font-bold focus:ring-0 shadow-none">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Efectivo">EFECTIVO</SelectItem>
                                <SelectItem value="Cheque">CHEQUE</SelectItem>
                                <SelectItem value="Tarjeta de Crédito">TARJ. CREDITO</SelectItem>
                                <SelectItem value="Tarjeta de Débito">TARJ. DEBITO</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="p-0 border-r border-gray-300">
                            <Input
                              placeholder=""
                              value={pago.referencia}
                              onChange={(e) => handlePagoChange(pago.id, 'referencia', e.target.value)}
                              className="h-6 border-0 rounded-none text-[10px] font-bold focus:ring-0 shadow-none text-center uppercase"
                            />
                          </TableCell>
                          <TableCell className="p-0">
                            <Input
                              type="number"
                              value={pago.monto}
                              onChange={(e) => handlePagoChange(pago.id, 'monto', e.target.value)}
                              className="h-6 border-0 rounded-none text-[11px] font-black text-right pr-2 focus:ring-0 shadow-none text-red-600"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-blue-50/50 h-7 border-t border-gray-400 font-black">
                        <TableCell colSpan={2} className="text-[12px] text-right pr-4 uppercase border-r border-gray-300">Total a Pagar</TableCell>
                        <TableCell className="text-[13px] text-right pr-2 text-blue-900 leading-none">{formatCurrency(totalPagadoFormas)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-end pt-1">
                  <Button variant="ghost" size="sm" onClick={addPago} className="h-5 text-[10px] font-black uppercase text-blue-700 hover:bg-blue-100 p-1">
                    [+] Agregar Forma
                  </Button>
                </div>
              </div>
            </div>

            {/* TABLA DE FACTURAS PENDIENTES */}
            <div className="flex-grow overflow-hidden border border-gray-400 rounded bg-[#f5fff5] shadow-inner group">
              <ScrollArea className="h-full">
                <Table className="border-collapse">
                  <TableHeader className="bg-white border-b border-gray-400 sticky top-0 z-10 shadow-sm">
                    <TableRow className="h-7">
                      <TableHead className="text-[11px] font-black uppercase h-7 border-r border-gray-300 px-2">Fecha</TableHead>
                      <TableHead className="text-[11px] font-black uppercase h-7 border-r border-gray-300 px-2">Vence</TableHead>
                      <TableHead className="text-[11px] font-black uppercase h-7 border-r border-gray-300 px-2">Origen</TableHead>
                      <TableHead className="text-[11px] font-black uppercase h-7 border-r border-gray-300 px-2">Referencia</TableHead>
                      <TableHead className="text-[11px] font-black uppercase h-7 border-r border-gray-300 px-2">Descripcion</TableHead>
                      <TableHead className="text-[11px] font-black uppercase h-7 border-r border-gray-300 px-2 text-right">Monto</TableHead>
                      <TableHead className="text-[11px] font-black uppercase h-7 border-r border-gray-300 px-2 text-right">Pendiente</TableHead>
                      <TableHead className="text-[11px] font-black uppercase h-7 px-2 text-right text-red-700 bg-red-50/50">Abono</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan="8" className="text-center h-40"><Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" /></TableCell></TableRow>
                    ) : facturas.length === 0 ? (
                      <TableRow><TableCell colSpan="8" className="text-center text-gray-400 py-12 text-[12px] italic uppercase font-bold">--- Seleccione un cliente para ver registros ---</TableCell></TableRow>
                    ) : (
                      facturas.map(f => (
                        <TableRow key={f.id} className="h-7 border-b border-gray-200 hover:bg-white transition-colors even:bg-green-50/30">
                          <TableCell className="text-[11px] font-bold px-2 py-0 border-r border-gray-300">{f.fecha ? formatInTimeZone(new Date(f.fecha), 'd/L/yyyy') : '---'}</TableCell>
                          <TableCell className="text-[11px] font-bold px-2 py-0 border-r border-gray-300 text-gray-500">{f.fecha_vencimiento ? formatInTimeZone(new Date(f.fecha_vencimiento), 'd/L/yyyy') : '---'}</TableCell>
                          <TableCell className="text-[11px] font-black px-2 py-0 border-r border-gray-300 text-blue-700 uppercase">{f.origen}</TableCell>
                          <TableCell className="text-[11px] font-black px-2 py-0 border-r border-gray-300 uppercase">{f.referencia}</TableCell>
                          <TableCell className="text-[11px] font-medium px-2 py-0 border-r border-gray-300 italic text-gray-400">---</TableCell>
                          <TableCell className="text-[11px] font-bold px-2 py-0 border-r border-gray-300 text-right text-blue-600 bg-blue-50/10 font-mono">{formatCurrency(f.monto_total)}</TableCell>
                          <TableCell className="text-[11px] font-black px-2 py-0 border-r border-gray-300 text-right text-red-600 bg-red-50/10 font-mono">{formatCurrency(f.monto_pendiente)}</TableCell>
                          <TableCell className="p-0 text-right bg-yellow-50/50">
                            <Input
                              type="number"
                              value={f.abono}
                              onChange={(e) => handleAbonoChange(f.id, e.target.value)}
                              className="text-[12px] font-black text-right h-7 border-0 rounded-none bg-transparent focus:ring-0 shadow-none text-red-700 font-mono"
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>

            {/* BARRA DE TOTALES (INFERIOR) */}
            <div className="flex flex-col md:flex-row justify-between items-end pb-1 border-t border-gray-400 pt-2 bg-gray-50/50 px-2 rounded">
              <div className="flex items-center gap-4 mb-2 md:mb-0">
                <div className="flex items-center space-x-2 bg-white px-2 py-1 rounded border border-gray-300 shadow-sm">
                  <Checkbox
                    id="imprimir"
                    checked={recibo.imprimir}
                    onCheckedChange={(checked) => setRecibo(prev => ({ ...prev, imprimir: checked }))}
                    className="border-gray-500"
                  />
                  <Label htmlFor="imprimir" className="text-[11px] font-black uppercase cursor-pointer text-gray-600">Imprimir</Label>
                  <Select value={tipoPapel} onValueChange={setTipoPapel}>
                    <SelectTrigger className="h-6 w-40 text-[10px] font-bold border-gray-300 bg-gray-50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="8.5 x 11 Pulgadas">8.5 x 11 Pulgadas (Papel Normal)</SelectItem>
                      <SelectItem value="4 Pulgadas">4 Pulgadas (Recibo Compacto)</SelectItem>
                      <SelectItem value="80mm">80mm (Ticket Térmico)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-8 gap-y-0.5 min-w-[300px]">
                <div className="text-[12px] font-bold text-gray-500 text-right uppercase italic">Balance Anterior</div>
                <div className="text-[13px] font-black text-right border-b border-gray-300 font-mono">{formatCurrency(recibo.balanceAnterior)}</div>

                <div className="text-[14px] font-black text-[#0a1e3a] text-right uppercase tracking-tighter">Total Pagado</div>
                <div className="text-[16px] font-black text-right text-blue-800 border-b-2 border-[#0a1e3a] font-mono leading-none">{formatCurrency(recibo.totalPagado)}</div>

                <div className="text-[12px] font-bold text-red-600 text-right uppercase italic">Balance Actual</div>
                <div className="text-[13px] font-black text-right text-red-700 font-mono">{formatCurrency(recibo.balanceActual)}</div>
              </div>
            </div>
          </div>

          {/* ACCIONES (FOOTER) */}
          <div className="bg-[#e9e9e9] border-t border-gray-400 p-2 flex justify-between gap-4">
            <Button
              variant="outline"
              onClick={resetForm}
              disabled={isSaving}
              className="h-8 text-[11px] font-black uppercase border-gray-400 shadow-sm hover:bg-white flex items-center gap-2"
            >
              <PlusCircle className="w-4 h-4 text-green-600" /> Nuevo
            </Button>

            <div className="flex gap-4">
              <Button
                variant="outline"
                onClick={() => closePanel('recibo-ingreso')}
                disabled={isSaving}
                className="h-8 text-[11px] font-black uppercase border-gray-400 shadow-sm hover:bg-white flex items-center gap-2 px-6"
              >
                <X className="w-4 h-4 text-red-600" /> ESC - Retornar
              </Button>

              <Button
                className="h-8 text-[11px] font-black uppercase bg-[#0a1e3a] hover:bg-[#0a1e3a]/90 text-white shadow-md border border-[#0a1e3a] flex items-center gap-2 px-10"
                onClick={handleSave}
                disabled={isSaving || isLoading}
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 text-green-400" />} F10 - Grabar
              </Button>
            </div>
          </div>
        </div>
      </motion.div>

      <ClienteSearchModal
        isOpen={isClienteSearchModalOpen}
        onClose={() => setIsClienteSearchModalOpen(false)}
        onSelectCliente={(cliente) => {
          handleClientSelect(cliente.id);
          setIsClienteSearchModalOpen(false);
        }}
      />
    </>
  );
};

export default ReciboIngresoPage;
