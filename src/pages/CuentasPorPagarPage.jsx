import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { Save, X, Loader2, FilePlus, Trash2, PlusCircle } from 'lucide-react';
import { usePanels } from '@/contexts/PanelContext';
import { Checkbox } from '@/components/ui/checkbox';

const initialState = {
  numero: '',
  fecha: new Date(),
  suplidorId: null,
  suplidorNombre: '',
  balanceAnterior: 0,
  totalPagado: 0,
  balanceActual: 0,
  imprimir: false,
};

const CuentasPorPagarPage = () => {
  const { toast } = useToast();
  const { closePanel } = usePanels();
  const [pago, setPago] = useState(initialState);
  const [suplidores, setSuplidores] = useState([]);
  const [compras, setCompras] = useState([]);
  const [formasPago, setFormasPago] = useState([{ id: 1, forma: 'Efectivo', monto: 0, referencia: '' }]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const formatCurrency = (value) => new Intl.NumberFormat('es-DO', { style: 'decimal', minimumFractionDigits: 2 }).format(value);

  const fetchInitialData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: suplidoresData, error: suplidoresError } = await supabase.from('proveedores').select('id, nombre').eq('activo', true);
      if (suplidoresError) throw suplidoresError;
      setSuplidores(suplidoresData);

      const { data: nextNumData, error: nextNumError } = await supabase.rpc('get_next_pago_suplidor_numero');
      if (nextNumError) throw nextNumError;
      setPago(prev => ({ ...prev, numero: nextNumData }));
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al cargar datos iniciales', description: error.message });
    }
    setIsLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const handleSuplidorSelect = async (suplidorId) => {
    if (!suplidorId) {
      setPago(prev => ({ ...prev, suplidorId: null, suplidorNombre: '', balanceAnterior: 0 }));
      setCompras([]);
      return;
    }
    setIsLoading(true);
    const selectedSuplidor = suplidores.find(s => s.id === suplidorId);
    try {
      const { data, error } = await supabase.rpc('get_compras_pendientes_suplidor', { p_suplidor_id: suplidorId });
      if (error) throw error;

      const comprasConAbono = data.map(c => ({ ...c, abono: 0 }));
      const balanceAnterior = comprasConAbono.reduce((sum, c) => sum + Number(c.monto_pendiente), 0);

      setCompras(comprasConAbono);
      setPago(prev => ({
        ...prev,
        suplidorId,
        suplidorNombre: selectedSuplidor?.nombre || '',
        balanceAnterior,
        balanceActual: balanceAnterior,
      }));
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al cargar compras pendientes', description: error.message });
    }
    setIsLoading(false);
  };

  const handleAbonoChange = (compraId, abono) => {
    const abonoValue = parseFloat(abono) || 0;
    setCompras(compras.map(c => {
      if (c.id === compraId) {
        const montoPendiente = parseFloat(c.monto_pendiente);
        const newAbono = abonoValue > montoPendiente ? montoPendiente : abonoValue;
        return { ...c, abono: newAbono };
      }
      return c;
    }));
  };

  const totalAbonos = useMemo(() => {
    return compras.reduce((sum, c) => sum + Number(c.abono), 0);
  }, [compras]);

  useEffect(() => {
    const balanceActual = pago.balanceAnterior - totalAbonos;
    setPago(prev => ({ ...prev, totalPagado: totalAbonos, balanceActual }));
    if (formasPago.length === 1) {
      setFormasPago([{ ...formasPago[0], monto: totalAbonos }]);
    }
  }, [totalAbonos, pago.balanceAnterior]);

  const handleFormaPagoChange = (id, field, value) => {
    setFormasPago(formasPago.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const addFormaPago = () => {
    setFormasPago([...formasPago, { id: Date.now(), forma: 'Efectivo', monto: 0, referencia: '' }]);
  };

  const removeFormaPago = (id) => {
    if (formasPago.length > 1) {
      setFormasPago(formasPago.filter(p => p.id !== id));
    }
  };

  const totalPagadoFormas = useMemo(() => {
    return formasPago.reduce((sum, p) => sum + Number(p.monto), 0);
  }, [formasPago]);

  const handleSave = async () => {
    if (!pago.suplidorId) {
      toast({ variant: 'destructive', title: 'Error de validación', description: 'Debe seleccionar un suplidor.' });
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
    const pagoData = {
      fecha: format(pago.fecha, 'yyyy-MM-dd'),
      suplidor_id: pago.suplidorId,
      total_pagado: totalAbonos,
      concepto: 'Pago a suplidor',
      formas_pago: formasPago,
    };

    const detallesData = compras
      .filter(c => c.abono > 0)
      .map(c => ({
        compra_id: c.id,
        monto_abonado: c.abono,
      }));

    try {
      const { data, error } = await supabase.rpc('procesar_pago_suplidor', {
        p_pago_data: pagoData,
        p_detalles_data: detallesData,
      });

      if (error) throw error;

      toast({ title: 'Éxito', description: `Pago ${data} guardado correctamente.` });
      // TODO: Implementar impresión
      resetForm();

    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al guardar el pago', description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = useCallback(() => {
    setPago(initialState);
    setCompras([]);
    setFormasPago([{ id: 1, forma: 'Efectivo', monto: 0, referencia: '' }]);
    fetchInitialData();
  }, [fetchInitialData]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'F10') {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closePanel('cuentas-por-pagar');
    }
  }, [handleSave, closePanel]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      <Helmet>
        <title>Cuentas por Pagar - Repuestos Morla</title>
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-1 md:p-4 bg-gray-100 min-h-full flex flex-col"
      >
        <div className="bg-white p-4 rounded-lg shadow-md flex-grow flex flex-col">
          <div className="bg-morla-blue text-white text-center py-2 rounded-t-lg mb-4">
            <h1 className="text-xl font-bold">Pago a Suplidores (Cuentas por Pagar)</h1>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-4">
            <div className="lg:col-span-2 space-y-4 p-4 border rounded-lg">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>No. Pago</Label>
                  <Input value={pago.numero} readOnly disabled className="bg-gray-100" />
                </div>
                <div>
                  <Label>Fecha</Label>
                  <Input value={format(pago.fecha, 'dd/MM/yyyy')} readOnly disabled className="bg-gray-100" />
                </div>
              </div>
              <div>
                <Label>Suplidor</Label>
                <Select onValueChange={handleSuplidorSelect} disabled={isLoading}>
                  <SelectTrigger>
                    <SelectValue placeholder={isLoading ? "Cargando suplidores..." : "Seleccione un suplidor"} />
                  </SelectTrigger>
                  <SelectContent>
                    {suplidores.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="p-2 bg-gray-50 rounded">
                  <span className="font-semibold">Balance Anterior:</span>
                  <span className="font-bold ml-2 text-red-600">{formatCurrency(pago.balanceAnterior)}</span>
                </div>
              </div>
            </div>

            <div className="p-4 border rounded-lg">
              <h3 className="font-bold mb-2 border-b pb-1">Formas de Pago</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {formasPago.map((fp) => (
                  <div key={fp.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                    <Select value={fp.forma} onValueChange={(v) => handleFormaPagoChange(fp.id, 'forma', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Efectivo">Efectivo</SelectItem>
                        <SelectItem value="Cheque">Cheque</SelectItem>
                        <SelectItem value="Transferencia">Transferencia</SelectItem>
                        <SelectItem value="Tarjeta de Crédito">T. Crédito</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input type="number" placeholder="Monto" value={fp.monto} onChange={(e) => handleFormaPagoChange(fp.id, 'monto', e.target.value)} className="text-right" />
                    <Button variant="ghost" size="icon" onClick={() => removeFormaPago(fp.id)} disabled={formasPago.length === 1}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                    {fp.forma !== 'Efectivo' && (
                      <Input placeholder={fp.forma === 'Cheque' ? 'No. Cheque' : 'Referencia'} value={fp.referencia} onChange={(e) => handleFormaPagoChange(fp.id, 'referencia', e.target.value)} className="col-span-3" />
                    )}
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={addFormaPago} className="mt-2 w-full">
                <PlusCircle className="h-4 w-4 mr-2" /> Añadir Forma de Pago
              </Button>
            </div>
          </div>

          <div className="flex-grow overflow-y-auto border rounded-lg">
            <Table>
              <TableHeader className="bg-gray-200">
                <TableRow>
                  <TableHead>Fecha Emisión</TableHead>
                  <TableHead>Fecha Vence</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Monto Total</TableHead>
                  <TableHead>Monto Pendiente</TableHead>
                  <TableHead className="w-[150px] text-right">Abono</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan="6" className="text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                ) : compras.length === 0 ? (
                  <TableRow><TableCell colSpan="6" className="text-center text-muted-foreground py-8">Seleccione un suplidor para ver sus compras pendientes.</TableCell></TableRow>
                ) : (
                  compras.map(c => (
                    <TableRow key={c.id}>
                      <TableCell>{format(new Date(c.fecha_emision), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>{format(new Date(c.fecha_vencimiento), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>{c.referencia}</TableCell>
                      <TableCell>{formatCurrency(c.monto_total)}</TableCell>
                      <TableCell className="font-semibold">{formatCurrency(c.monto_pendiente)}</TableCell>
                      <TableCell className="text-right">
                        <Input type="number" value={c.abono} onChange={(e) => handleAbonoChange(c.id, e.target.value)} className="text-right h-8 bg-yellow-100" />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <Checkbox id="imprimir" checked={pago.imprimir} onCheckedChange={(checked) => setPago(prev => ({ ...prev, imprimir: checked }))} />
                <Label htmlFor="imprimir">Imprimir al guardar</Label>
              </div>
            </div>
            <div className="space-y-2 text-right font-semibold">
              <div className="flex justify-between"><span className="text-gray-600">Balance Anterior:</span><span>{formatCurrency(pago.balanceAnterior)}</span></div>
              <div className="flex justify-between text-blue-600"><span>Total Pagado:</span><span>{formatCurrency(pago.totalPagado)}</span></div>
              <div className="flex justify-between text-red-600 text-lg border-t pt-1"><span>Balance Actual:</span><span>{formatCurrency(pago.balanceActual)}</span></div>
            </div>
          </div>

          <div className="mt-6 flex justify-between items-center">
            <Button variant="outline" onClick={resetForm} disabled={isSaving}>
              <FilePlus className="mr-2 h-4 w-4" /> Nuevo
            </Button>
            <div className="flex space-x-4">
              <Button variant="outline" onClick={() => closePanel('cuentas-por-pagar')} disabled={isSaving}>
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

export default CuentasPorPagarPage;