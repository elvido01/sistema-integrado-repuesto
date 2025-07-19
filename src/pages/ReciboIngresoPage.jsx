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

const initialState = {
  numero: '',
  fecha: getCurrentDateInTimeZone(),
  clienteId: null,
  clienteNombre: '',
  balanceAnterior: 0,
  totalPagado: 0,
  balanceActual: 0,
  imprimir: false,
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

  const formatCurrency = (value) => new Intl.NumberFormat('es-DO', { style: 'decimal', minimumFractionDigits: 2 }).format(value || 0);

  const fetchInitialData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: clientesData, error: clientesError } = await supabase.from('clientes').select('id, nombre').eq('activo', true);
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

  const totalAbonos = useMemo(() => {
    return facturas.reduce((sum, f) => sum + Number(f.abono), 0);
  }, [facturas]);

  useEffect(() => {
    const balanceActual = recibo.balanceAnterior - totalAbonos;
    setRecibo(prev => ({ ...prev, totalPagado: totalAbonos, balanceActual }));
    if (pagos.length === 1) {
      setPagos([{ ...pagos[0], monto: totalAbonos }]);
    }
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

  const totalPagadoFormas = useMemo(() => {
    return pagos.reduce((sum, p) => sum + Number(p.monto), 0);
  }, [pagos]);

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
      // TODO: Implementar impresión
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
    fetchInitialData();
  }, [fetchInitialData]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'F10') {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closePanel('recibo-ingreso');
    }
  }, [handleSave, closePanel]);

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
        <div className="bg-white p-4 rounded-lg shadow-md flex-grow flex flex-col">
          <div className="bg-morla-blue text-white text-center py-2 rounded-t-lg mb-4">
            <h1 className="text-xl font-bold">Recibo de Ingreso</h1>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-4">
            {/* Columna Izquierda - Datos Cliente y Recibo */}
            <div className="lg:col-span-2 space-y-4 p-4 border rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>No. Recibo</Label>
                  <Input value={recibo.numero} readOnly disabled className="bg-gray-100" />
                </div>
                <div>
                  <Label>Fecha</Label>
                  <Input value={formatInTimeZone(recibo.fecha, 'dd/MM/yyyy')} readOnly disabled className="bg-gray-100" />
                </div>
              </div>
              <div>
                <Label>Cliente</Label>
                <Select onValueChange={handleClientSelect} disabled={isLoading}>
                  <SelectTrigger>
                    <SelectValue placeholder={isLoading ? "Cargando clientes..." : "Seleccione un cliente"} />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="p-2 bg-gray-50 rounded">
                  <span className="font-semibold">Último Pago:</span> 
                  {datosCliente.ultimo_pago ? ` ${formatCurrency(datosCliente.ultimo_pago.monto_pagado)} el ${formatInTimeZone(new Date(datosCliente.ultimo_pago.fecha), 'dd/MM/yyyy')}` : ' N/A'}
                </div>
                <div className="p-2 bg-gray-50 rounded">
                  <span className="font-semibold">Balance Anterior:</span>
                  <span className="font-bold ml-2 text-red-600">{formatCurrency(datosCliente.balance_anterior)}</span>
                </div>
              </div>
            </div>

            {/* Columna Derecha - Formas de Pago */}
            <div className="p-4 border rounded-lg">
              <h3 className="font-bold mb-2 border-b pb-1">Formas de Pago</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {pagos.map((pago, index) => (
                  <div key={pago.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                    <Select value={pago.forma} onValueChange={(v) => handlePagoChange(pago.id, 'forma', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Efectivo">Efectivo</SelectItem>
                        <SelectItem value="Cheque">Cheque</SelectItem>
                        <SelectItem value="Tarjeta de Crédito">T. Crédito</SelectItem>
                        <SelectItem value="Tarjeta de Débito">T. Débito</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input type="number" placeholder="Monto" value={pago.monto} onChange={(e) => handlePagoChange(pago.id, 'monto', e.target.value)} className="text-right" />
                    <Button variant="ghost" size="icon" onClick={() => removePago(pago.id)} disabled={pagos.length === 1}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                    {pago.forma !== 'Efectivo' && (
                      <Input placeholder={pago.forma === 'Cheque' ? 'No. Cheque' : 'No. Autorización'} value={pago.referencia} onChange={(e) => handlePagoChange(pago.id, 'referencia', e.target.value)} className="col-span-3" />
                    )}
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={addPago} className="mt-2 w-full">
                <PlusCircle className="h-4 w-4 mr-2" /> Añadir Forma de Pago
              </Button>
            </div>
          </div>

          {/* Tabla de Facturas Pendientes */}
          <div className="flex-grow overflow-y-auto border rounded-lg">
            <Table>
              <TableHeader className="bg-gray-200">
                <TableRow>
                  <TableHead>Fecha Emisión</TableHead>
                  <TableHead>Fecha Vence</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Monto Total</TableHead>
                  <TableHead>Monto Pendiente</TableHead>
                  <TableHead className="w-[150px] text-right">Abono</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan="7" className="text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                ) : facturas.length === 0 ? (
                  <TableRow><TableCell colSpan="7" className="text-center text-muted-foreground py-8">Seleccione un cliente para ver sus facturas pendientes.</TableCell></TableRow>
                ) : (
                  facturas.map(f => (
                    <TableRow key={f.id}>
                      <TableCell>{formatInTimeZone(new Date(f.fecha), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>{formatInTimeZone(new Date(f.fecha_vencimiento), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>{f.origen}</TableCell>
                      <TableCell>{f.referencia}</TableCell>
                      <TableCell>{formatCurrency(f.monto_total)}</TableCell>
                      <TableCell className="font-semibold">{formatCurrency(f.monto_pendiente)}</TableCell>
                      <TableCell className="text-right">
                        <Input type="number" value={f.abono} onChange={(e) => handleAbonoChange(f.id, e.target.value)} className="text-right h-8 bg-yellow-100" />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Footer con Totales y Acciones */}
          <div className="mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <Checkbox id="imprimir" checked={recibo.imprimir} onCheckedChange={(checked) => setRecibo(prev => ({ ...prev, imprimir: checked }))} />
                <Label htmlFor="imprimir">Imprimir al guardar</Label>
              </div>
            </div>
            <div className="space-y-2 text-right font-semibold">
              <div className="flex justify-between"><span className="text-gray-600">Balance Anterior:</span><span>{formatCurrency(recibo.balanceAnterior)}</span></div>
              <div className="flex justify-between text-blue-600"><span >Total Pagado:</span><span>{formatCurrency(recibo.totalPagado)}</span></div>
              <div className="flex justify-between text-red-600 text-lg border-t pt-1"><span >Balance Actual:</span><span>{formatCurrency(recibo.balanceActual)}</span></div>
            </div>
          </div>

          <div className="mt-6 flex justify-between items-center">
            <Button variant="outline" onClick={resetForm} disabled={isSaving}>
              <FilePlus className="mr-2 h-4 w-4" /> Nuevo
            </Button>
            <div className="flex space-x-4">
              <Button variant="outline" onClick={() => closePanel('recibo-ingreso')} disabled={isSaving}>
                <X className="mr-2 h-4 w-4" /> ESC - Salir
              </Button>
              <Button className="bg-morla-blue hover:bg-morla-blue/90" onClick={handleSave} disabled={isSaving || isLoading}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} F10 - Grabar
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default ReciboIngresoPage;