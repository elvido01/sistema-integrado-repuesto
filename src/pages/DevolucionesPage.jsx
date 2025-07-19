import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Save, X, Loader2, Search, CalendarPlus as CalendarIcon, Printer, AlertTriangle } from 'lucide-react';
import { formatInTimeZone, getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';
import { es } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { generateDevolucionPDF } from '@/components/common/pdf/devolucionPDF';


const DevolucionesPage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [facturaNumero, setFacturaNumero] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const [fecha, setFecha] = useState(getCurrentDateInTimeZone());
  const [factura, setFactura] = useState(null);
  const [cliente, setCliente] = useState(null);
  const [detalles, setDetalles] = useState([]);
  const [notas, setNotas] = useState('');
  const [imprimir, setImprimir] = useState(false);

  const handleSearchFactura = async () => {
    if (!facturaNumero) {
      toast({ variant: 'destructive', title: 'Error', description: 'Por favor, ingrese un número de factura.' });
      return;
    }
    setIsSearching(true);
    resetForm(false);

    try {
      const { data: facturaData, error: facturaError } = await supabase
        .from('facturas')
        .select('*, cliente:clientes(*)')
        .eq('numero', facturaNumero)
        .single();

      if (facturaError || !facturaData) {
        toast({ variant: 'destructive', title: 'No Encontrada', description: 'Factura no encontrada. Verifique el número e intente nuevamente.' });
        throw new Error('Factura no encontrada');
      }

      const { data: detallesData, error: detallesError } = await supabase
        .from('facturas_detalle')
        .select('*, producto:productos(ubicacion)')
        .eq('factura_id', facturaData.id);

      if (detallesError) throw detallesError;

      setFactura(facturaData);
      setCliente(facturaData.cliente);
      setDetalles(detallesData.map(d => ({
        ...d,
        ubicacion: d.producto?.ubicacion || 'N/A',
        devolver: true, // Por defecto todos marcados
        cantidad_devuelta: d.cantidad,
      })));

    } catch (error) {
      console.error("Error buscando factura:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleQtyChange = (id, newQty) => {
    setDetalles(detalles.map(d => {
      if (d.id === id) {
        const originalQty = d.cantidad;
        const qtyToReturn = Math.max(0, Math.min(originalQty, parseFloat(newQty) || 0));
        return { ...d, cantidad_devuelta: qtyToReturn };
      }
      return d;
    }));
  };

  const totals = useMemo(() => {
    return detalles.filter(d => d.devolver && d.cantidad_devuelta > 0).reduce((acc, item) => {
      const importe = item.precio * item.cantidad_devuelta;
      const descuento = (item.descuento / item.cantidad) * item.cantidad_devuelta;
      const itbis = (item.itbis / item.cantidad) * item.cantidad_devuelta;
      
      acc.subtotal += importe;
      acc.descuento += descuento;
      acc.itbis += itbis;
      return acc;
    }, { subtotal: 0, descuento: 0, itbis: 0 });
  }, [detalles]);

  const totalDevolucion = useMemo(() => {
    return totals.subtotal - totals.descuento + totals.itbis;
  }, [totals]);

  const handleSave = async () => {
    if (!factura) {
      toast({ variant: 'destructive', title: 'Error', description: 'Debe cargar una factura.' });
      return;
    }
    const itemsADevolver = detalles.filter(d => d.devolver && d.cantidad_devuelta > 0);
    if (itemsADevolver.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Debe seleccionar al menos un artículo con cantidad a devolver mayor a cero.' });
      return;
    }
    setIsSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Insertar en devoluciones
      const { data: devolucion, error: devError } = await supabase.from('devoluciones').insert({
        fecha_devolucion: formatDateForSupabase(fecha),
        factura_id: factura.id,
        cliente_id: cliente.id,
        cliente_info: { nombre: cliente.nombre, rnc: cliente.rnc, direccion: cliente.direccion, telefono: cliente.telefono },
        subtotal: totals.subtotal,
        descuento_total: totals.descuento,
        itbis_total: totals.itbis,
        total_devolucion: totalDevolucion,
        notas: notas,
        usuario_id: user?.id
      }).select().single();
      if (devError) throw devError;

      // 2. Insertar en devoluciones_detalle
      const detallesDevolucion = itemsADevolver.map(d => ({
        devolucion_id: devolucion.id,
        producto_id: d.producto_id,
        cantidad: d.cantidad_devuelta,
        precio: d.precio,
        descuento: (d.descuento / d.cantidad) * d.cantidad_devuelta,
        itbis: (d.itbis / d.cantidad) * d.cantidad_devuelta,
        importe: d.precio * d.cantidad_devuelta
      }));
      const { error: detError } = await supabase.from('devoluciones_detalle').insert(detallesDevolucion);
      if (detError) throw detError;

      // 3. Actualizar inventario
      const movimientosInventario = itemsADevolver.map(d => ({
        producto_id: d.producto_id,
        tipo: 'ENTRADA',
        cantidad: d.cantidad_devuelta,
        referencia_doc: `DEVOLUCION-${devolucion.numero}`,
        fecha: formatDateForSupabase(fecha)
      }));
      const { error: invError } = await supabase.from('inventario_movimientos').insert(movimientosInventario);
      if (invError) throw invError;

      toast({ title: '✅ Éxito', description: 'Devolución guardada y artículos reintegrados al inventario.' });

      if (imprimir) {
        generateDevolucionPDF(devolucion, factura, cliente, detallesDevolucion);
      }
      
      resetForm(true);

    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al guardar', description: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = (fullReset = true) => {
    if (fullReset) {
      setFacturaNumero('');
    }
    setFactura(null);
    setCliente(null);
    setDetalles([]);
    setNotas('');
    setFecha(getCurrentDateInTimeZone());
    setImprimir(false);
  };

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'F10') { e.preventDefault(); document.getElementById('save-trigger')?.click(); }
    if (e.key === 'Escape') { e.preventDefault(); navigate(-1); }
  }, [navigate]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      <Helmet><title>Devoluciones - Repuestos Morla</title></Helmet>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-gray-50 min-h-full">
        <div className="bg-white p-6 rounded-xl shadow-lg max-w-7xl mx-auto">
          <div className="bg-morla-blue text-white text-center py-3 rounded-t-lg mb-6">
            <h1 className="text-2xl font-bold tracking-wide">MÓDULO DE DEVOLUCIONES</h1>
          </div>

          {/* Header */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4 items-end border p-4 rounded-lg bg-gray-50">
              <div>
                <Label htmlFor="factura-numero" className="font-semibold text-gray-600">Nº Factura</Label>
                <Input id="factura-numero" value={facturaNumero} onChange={e => setFacturaNumero(e.target.value)} placeholder="Ingrese número..." />
              </div>
              <Button onClick={handleSearchFactura} disabled={isSearching} className="sm:col-span-2 bg-blue-600 hover:bg-blue-700">
                {isSearching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                Buscar Factura
              </Button>
            </div>
            <div className="border p-4 rounded-lg bg-gray-50 flex flex-col justify-center">
              <Label className="font-semibold text-gray-600">Fecha Devolución</Label>
              <Popover>
                <PopoverTrigger asChild><Button variant="outline" className="w-full justify-start font-normal text-base"><CalendarIcon className="mr-2 h-4 w-4" />{formatInTimeZone(fecha, "dd/MM/yyyy")}</Button></PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={fecha} onSelect={setFecha} locale={es} /></PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Client and Details */}
          {factura && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="border p-4 rounded-lg space-y-2">
                  <h3 className="font-bold text-morla-blue text-lg mb-2">Datos del Cliente</h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <Label>Cliente</Label><Input value={cliente?.nombre || ''} readOnly disabled className="col-span-2" />
                    <Label>RNC</Label><Input value={cliente?.rnc || ''} readOnly disabled />
                    <Label>Teléfono</Label><Input value={cliente?.telefono || ''} readOnly disabled />
                    <Label>Dirección</Label><Input value={cliente?.direccion || ''} readOnly disabled className="col-span-2" />
                  </div>
                </div>
                <div className="border p-4 rounded-lg space-y-2">
                  <h3 className="font-bold text-morla-blue text-lg mb-2">Detalles de Factura Original</h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <Label>Factura #</Label><Input value={factura?.numero || ''} readOnly disabled />
                    <Label>Fecha Factura</Label><Input value={formatInTimeZone(new Date(factura.fecha), 'dd/MM/yyyy')} readOnly disabled />
                    <Label>NCF</Label><Input value={factura?.ncf || ''} readOnly disabled className="col-span-2" />
                  </div>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden mb-6">
                <div className="max-h-[22rem] overflow-y-auto">
                  <Table>
                    <TableHeader className="bg-gray-100 sticky top-0 z-10">
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="text-center">Facturado</TableHead>
                        <TableHead className="text-center w-32">A Devolver</TableHead>
                        <TableHead>Almacén</TableHead>
                        <TableHead className="text-right">Precio</TableHead>
                        <TableHead className="text-right">Descuento</TableHead>
                        <TableHead className="text-right">ITBIS</TableHead>
                        <TableHead className="text-right">Importe</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalles.map(d => (
                        <TableRow key={d.id}>
                          <TableCell>{d.codigo}</TableCell>
                          <TableCell>{d.descripcion}</TableCell>
                          <TableCell className="text-center">{d.cantidad.toFixed(2)}</TableCell>
                          <TableCell><Input type="number" value={d.cantidad_devuelta} onChange={e => handleQtyChange(d.id, e.target.value)} className="h-8 text-center bg-yellow-100" /></TableCell>
                          <TableCell>{d.ubicacion}</TableCell>
                          <TableCell className="text-right">{d.precio.toFixed(2)}</TableCell>
                          <TableCell className="text-right text-red-500">{((d.descuento / d.cantidad) * d.cantidad_devuelta).toFixed(2)}</TableCell>
                          <TableCell className="text-right">{((d.itbis / d.cantidad) * d.cantidad_devuelta).toFixed(2)}</TableCell>
                          <TableCell className="text-right font-bold">{(d.precio * d.cantidad_devuelta).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2">
                  <Label htmlFor="notas" className="font-semibold text-gray-600">Notas y Comentarios</Label>
                  <Textarea id="notas" value={notas} onChange={e => setNotas(e.target.value)} rows="6" placeholder="Añada cualquier observación relevante aquí..." />
                  <div className="flex items-center space-x-2 mt-4">
                    <Checkbox id="imprimir" checked={imprimir} onCheckedChange={setImprimir} />
                    <Label htmlFor="imprimir" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Imprimir comprobante al guardar
                    </Label>
                  </div>
                </div>
                <div className="p-4 bg-gray-50 border rounded-lg space-y-2">
                  <div className="flex justify-between text-sm"><span>Sub-Total:</span><span className="font-mono">{totals.subtotal.toFixed(2)}</span></div>
                  <div className="flex justify-between text-sm"><span>Descuento:</span><span className="font-mono text-red-500">{totals.descuento.toFixed(2)}</span></div>
                  <div className="flex justify-between text-sm"><span>TOTAL ITBIS:</span><span className="font-mono">{totals.itbis.toFixed(2)}</span></div>
                  <div className="flex justify-between text-xl font-bold border-t-2 border-gray-300 mt-2 pt-2 text-morla-blue"><span>TOTAL:</span><span className="font-mono">{totalDevolucion.toFixed(2)}</span></div>
                </div>
              </div>
            </motion.div>
          )}

          <div className="mt-8 flex justify-end space-x-4">
            <Button variant="outline" onClick={() => navigate(-1)} disabled={isSaving}><X className="mr-2 h-4 w-4" /> ESC - Cancelar</Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button id="save-trigger" className="bg-morla-blue hover:bg-morla-blue/90" disabled={isSaving || !factura}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} F10 - Grabar Devolución
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center"><AlertTriangle className="text-yellow-500 mr-2" />¿Confirmar Devolución?</AlertDialogTitle>
                  <AlertDialogDescription>
                    ¿Está seguro que desea grabar esta devolución? Esta acción es irreversible y reintegrará los artículos seleccionados al inventario.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSave} className="bg-morla-blue hover:bg-morla-blue/90">Confirmar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default DevolucionesPage;