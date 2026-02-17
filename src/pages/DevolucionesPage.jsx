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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { printDevolucionPOS } from '@/lib/printPOS';

const DevolucionesPage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [facturaNumero, setFacturaNumero] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const [fecha, setFecha] = useState(getCurrentDateInTimeZone());
  const [factura, setFactura] = useState(null);
  const [cliente, setCliente] = useState(null);
  const [availableItems, setAvailableItems] = useState([]); // All items in the invoice
  const [itemsADevolver, setItemsADevolver] = useState([]); // Items explicitly added for return
  const [stagingItem, setStagingItem] = useState({
    id: '',
    codigo: '',
    descripcion: '',
    cantidad: 0,
    precio: 0,
    itbis: 0,
    descuento: 0,
    importe: 0,
    ubicacion: ''
  });
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
      // 1. Check if a return already exists for this invoice
      const { data: existingReturn, error: checkError } = await supabase
        .from('devoluciones')
        .select('id, numero')
        .eq('factura_id', (await supabase.from('facturas').select('id').eq('numero', facturaNumero).single()).data?.id)
        .maybeSingle();

      if (existingReturn) {
        toast({
          variant: 'destructive',
          title: 'Factura ya devuelta',
          description: `Esta factura ya tiene una devolución registrada (#${existingReturn.numero}). Solo se permite una devolución por factura.`
        });
        return;
      }

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
      setAvailableItems(detallesData.map(d => ({
        ...d,
        ubicacion: d.producto?.ubicacion || 'N/A'
      })));
      setItemsADevolver([]); // Start empty as per video request
      resetStaging();

    } catch (error) {
      console.error("Error buscando factura:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const resetStaging = () => {
    setStagingItem({
      id: '',
      codigo: '',
      descripcion: '',
      cantidad: 0,
      precio: 0,
      itbis: 0,
      descuento: 0,
      importe: 0,
      ubicacion: ''
    });
  };

  const handleSelectItem = (val) => {
    if (val === 'ALL') {
      handleIncludeAll();
      return;
    }

    const item = availableItems.find(i => i.id === val);
    if (!item) return;

    setStagingItem({
      ...item,
      cantidad: item.cantidad // Iniciar con la cantidad completa original
    });
  };

  const handleIncludeAll = () => {
    setItemsADevolver(availableItems.map(item => ({
      ...item,
      cantidad_devuelta: item.cantidad
    })));
    resetStaging();
  };

  const handleAddToReturnList = () => {
    if (!stagingItem.id) return;

    // Validar si ya está en la lista
    if (itemsADevolver.some(i => i.id === stagingItem.id)) {
      toast({ title: 'Aviso', description: 'Este artículo ya está en la lista de devolución.' });
      return;
    }

    // Validar cantidad
    if (stagingItem.cantidad <= 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'La cantidad a devolver debe ser mayor a cero.' });
      return;
    }

    setItemsADevolver([...itemsADevolver, {
      ...stagingItem,
      cantidad_devuelta: stagingItem.cantidad
    }]);
    resetStaging();
  };

  const handleQtyChange = (id, newQty) => {
    setItemsADevolver(itemsADevolver.map(d => {
      if (d.id === id) {
        const originalQtyInFactura = availableItems.find(ai => ai.id === id)?.cantidad || 0;
        const qtyToReturn = Math.max(0, Math.min(originalQtyInFactura, parseFloat(newQty) || 0));
        return { ...d, cantidad_devuelta: qtyToReturn };
      }
      return d;
    }));
  };

  const totals = useMemo(() => {
    return itemsADevolver.reduce((acc, item) => {
      const ratio = item.cantidad_devuelta / item.cantidad;
      const subtotal = item.precio * item.cantidad_devuelta;
      const descuento = item.descuento * ratio;
      const itbis = item.itbis * ratio;

      acc.subtotal += subtotal;
      acc.descuento += descuento;
      acc.itbis += itbis;
      return acc;
    }, { subtotal: 0, descuento: 0, itbis: 0 });
  }, [itemsADevolver]);

  const totalDevolucion = useMemo(() => {
    return totals.subtotal - totals.descuento + totals.itbis;
  }, [totals]);

  const handleSave = async () => {
    if (!factura) {
      toast({ variant: 'destructive', title: 'Error', description: 'Debe cargar una factura.' });
      return;
    }
    if (itemsADevolver.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Debe seleccionar al menos un artículo para devolver.' });
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
      const detallesDevolucion = itemsADevolver.filter(i => i.cantidad_devuelta > 0).map(d => {
        const ratio = d.cantidad_devuelta / d.cantidad;
        return {
          devolucion_id: devolucion.id,
          producto_id: d.producto_id,
          cantidad: d.cantidad_devuelta,
          precio: d.precio,
          descuento: d.descuento * ratio,
          itbis: d.itbis * ratio,
          importe: d.precio * d.cantidad_devuelta
        };
      });
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
        printDevolucionPOS(devolucion, factura, cliente, detallesDevolucion);
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
    setAvailableItems([]);
    setItemsADevolver([]);
    resetStaging();
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
      <div className="h-full flex flex-col p-4 bg-gray-100 space-y-4 overflow-hidden">

        {/* Title Bar */}
        <div className="bg-[#a3c2f0] py-1 px-4 flex justify-center items-center border-b border-blue-400 shadow-sm">
          <h2 className="text-xl font-bold text-slate-800 tracking-widest uppercase flex items-center gap-4">
            DEVOLUCION
          </h2>
        </div>

        {/* Top Section: Split Header */}
        <div className="grid grid-cols-12 gap-4">

          {/* Box 1: Detalles de la Devolución */}
          <div className="col-span-4 bg-[#f8f9fa] border-2 border-slate-300 rounded p-4 relative shadow-sm">
            <span className="absolute -top-3 left-3 bg-[#f8f9fa] px-2 text-[10px] font-black text-slate-500 uppercase">Detalles de la Devolución</span>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] font-bold text-slate-600 uppercase w-16">NUMERO</Label>
                  <Input readOnly value="---" className="h-7 w-20 bg-white border-slate-400 text-center font-bold" />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] font-bold text-slate-600 uppercase">FECHA</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-7 border-slate-400 text-xs px-2 bg-white flex items-center gap-2">
                        {formatInTimeZone(fecha, "dd/MM/yyyy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={fecha} onSelect={setFecha} locale={es} /></PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <RadioGroup defaultValue="factura" className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="factura" id="t-ft" className="w-3 h-3 border-slate-500 text-blue-600" />
                    <Label htmlFor="t-ft" className="text-[10px] font-bold text-slate-700">FT - Factura</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="proforma" id="t-fp" className="w-3 h-3 border-slate-500 text-blue-600" />
                    <Label htmlFor="t-fp" className="text-[10px] font-bold text-slate-700">FP - Proforma</Label>
                  </div>
                </RadioGroup>

                <div className="flex items-center gap-3">
                  <Label className="text-[11px] font-black text-slate-800 uppercase">Factura #</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      value={facturaNumero}
                      onChange={e => setFacturaNumero(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSearchFactura()}
                      className="h-7 w-24 border-blue-600 focus:ring-0 font-bold bg-white"
                    />
                    <Button size="icon" onClick={handleSearchFactura} className="h-7 w-7 bg-blue-600 hover:bg-blue-700 text-white shadow-md">
                      {isSearching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                    </Button>
                  </div>
                  <span className="text-[11px] font-black text-slate-800 uppercase ml-2">
                    {factura?.forma_pago || '---'}
                  </span>
                </div>

                <div className="pt-2 border-t border-dashed border-slate-300">
                  <div className="flex flex-col gap-1">
                    <Label className="text-[10px] font-bold text-red-600 uppercase text-center w-full">NCF</Label>
                    <Input readOnly value={factura?.ncf || ''} className="h-7 border-slate-400 text-center font-mono text-xs bg-slate-50" />
                    <Label className="text-[10px] font-bold text-slate-500 uppercase text-xs mt-1">NCF Modificado</Label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Box 2: Datos de Cliente */}
          <div className="col-span-8 bg-[#f8f9fa] border-2 border-slate-300 rounded p-4 relative shadow-sm h-full flex flex-col justify-between">
            <span className="absolute -top-3 left-3 bg-[#f8f9fa] px-2 text-[10px] font-black text-slate-500 uppercase">Datos de Cliente</span>
            <div className="grid grid-cols-12 gap-x-6 gap-y-3">
              <div className="col-span-7 flex items-center gap-3">
                <Label className="text-[10px] font-bold text-slate-600 uppercase w-16 text-right">Cliente</Label>
                <Input readOnly value={cliente?.id || ''} className="h-7 flex-grow font-mono text-[11px] bg-slate-50 border-slate-300" />
              </div>
              <div className="col-span-5 flex items-center gap-3">
                <Label className="text-[10px] font-bold text-slate-600 uppercase w-12 text-right">RNC</Label>
                <Input readOnly value={cliente?.rnc || ''} className="h-7 flex-grow font-mono text-[11px] bg-slate-50 border-slate-300" />
              </div>

              <div className="col-span-12 flex items-center gap-3">
                <Label className="text-[10px] font-bold text-slate-600 uppercase w-16 text-right">Nombre</Label>
                <Input readOnly value={cliente?.nombre || ''} className="h-7 flex-grow font-bold text-[11px] bg-slate-50 border-slate-300" />
              </div>

              <div className="col-span-12 flex items-start gap-3">
                <Label className="text-[10px] font-bold text-slate-600 uppercase w-16 text-right mt-1.5">Direccion</Label>
                <Textarea readOnly value={cliente?.direccion || ''} className="min-h-[40px] flex-grow text-[11px] bg-slate-50 border-slate-300 resize-none p-2" />
              </div>

              <div className="col-span-12 flex items-center gap-3">
                <Label className="text-[10px] font-bold text-slate-600 uppercase w-16 text-right">Telefonos</Label>
                <Input readOnly value={cliente?.telefono || ''} className="h-7 flex-grow font-mono text-[11px] bg-slate-50 border-slate-300" />
              </div>
            </div>
          </div>
        </div>

        {/* Main Section: Table and Staging Row */}
        <div className="flex-grow bg-white border-2 border-slate-300 rounded shadow-inner flex flex-col overflow-hidden">
          <div className="overflow-y-auto flex-grow">
            <Table>
              <TableHeader className="sticky top-0 bg-slate-100 z-20 shadow-sm border-b-2 border-slate-400">
                {/* Yellow Staging Row Header (Placeholder/Logic Row) */}
                <TableRow className="bg-[#ffffdf] hover:bg-[#ffffdf] border-b-2 border-slate-500 h-10 group">
                  <TableCell colSpan={2} className="p-1">
                    <Select disabled={!factura} onValueChange={handleSelectItem} value={stagingItem.id}>
                      <SelectTrigger className="w-full h-8 border-slate-400 bg-white text-xs">
                        <SelectValue placeholder="--^-- Seleccione la Mercancia que desea Devolver --^--" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL" className="text-xs font-bold text-blue-700">{"\u00BB\u00BB\u00BB"} Incluir Todos</SelectItem>
                        {availableItems.filter(ai => !itemsADevolver.some(idv => idv.id === ai.id)).map(d => (
                          <SelectItem key={d.id} value={d.id} className="text-xs">
                            {d.codigo} - {d.descripcion}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="p-1">
                    <Input
                      type="number"
                      value={stagingItem.cantidad}
                      onChange={e => setStagingItem({ ...stagingItem, cantidad: parseFloat(e.target.value) || 0 })}
                      className="h-7 text-center font-bold bg-white border-slate-400 text-xs"
                    />
                  </TableCell>
                  <TableCell className="p-1"><Input value="UND" readOnly className="h-7 text-center bg-slate-50 border-slate-400 text-[10px]" /></TableCell>
                  <TableCell className="p-1"><Input value={stagingItem.ubicacion || ''} readOnly className="h-7 text-center bg-slate-50 border-slate-400 text-xs" /></TableCell>
                  <TableCell className="p-1"><Input value={stagingItem.precio.toFixed(2)} readOnly className="h-7 text-right font-bold bg-slate-50 border-slate-400 text-xs" /></TableCell>
                  <TableCell className="p-1"><Input value={(stagingItem.descuento * (stagingItem.cantidad / (stagingItem.cantidad || 1))).toFixed(2)} readOnly className="h-7 text-right font-bold bg-slate-50 border-slate-400 text-xs" /></TableCell>
                  <TableCell className="p-1"><Input value={(stagingItem.itbis * (stagingItem.cantidad / (stagingItem.cantidad || 1))).toFixed(2)} readOnly className="h-7 text-right bg-slate-50 border-slate-400 text-xs" /></TableCell>
                  <TableCell className="p-1 flex items-center gap-1">
                    <Input value={(stagingItem.precio * stagingItem.cantidad).toFixed(2)} readOnly className="h-7 text-right bg-slate-50 border-slate-400 font-bold text-xs flex-grow" />
                    <Button onClick={handleAddToReturnList} size="icon" variant="ghost" className="h-7 w-7 bg-slate-300 hover:bg-slate-400 text-slate-800 font-bold text-xs border border-slate-400">Ok</Button>
                  </TableCell>
                </TableRow>

                <TableRow className="bg-slate-50 h-8">
                  <TableHead className="text-[10px] font-black uppercase text-slate-800 border-r py-0 h-8">CODIGO</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-800 border-r py-0 h-8 flex-grow">DESCRIPCION</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-800 border-r py-0 h-8 text-center w-20">CANT.</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-800 border-r py-0 h-8 text-center w-16">UND</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-800 border-r py-0 h-8 text-center w-16">ALM</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-800 border-r py-0 h-8 text-right w-24">PRECIO</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-800 border-r py-0 h-8 text-right w-20">DESC.</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-800 border-r py-0 h-8 text-right w-24">ITBIS</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-800 py-0 h-8 text-right w-32">IMPORTE</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemsADevolver.length === 0 ? (
                  Array.from({ length: 15 }).map((_, i) => (
                    <TableRow key={i} className="h-7 border-b border-slate-200">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j} className="p-0 border-r border-slate-100 last:border-r-0 h-7" />
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <>
                    {itemsADevolver.map(d => (
                      <TableRow key={d.id} className="h-8 hover:bg-slate-50 border-b border-slate-200">
                        <TableCell className="py-1 text-[11px] font-mono border-r border-slate-200">{d.codigo}</TableCell>
                        <TableCell className="py-1 text-[11px] border-r border-slate-200">{d.descripcion?.toUpperCase()}</TableCell>
                        <TableCell className="py-1 border-r border-slate-200">
                          <Input
                            type="number"
                            value={d.cantidad_devuelta}
                            onChange={e => handleQtyChange(d.id, e.target.value)}
                            className="h-6 w-16 mx-auto text-center font-bold bg-yellow-100 border-slate-400 text-xs"
                          />
                        </TableCell>
                        <TableCell className="py-1 text-[10px] text-center border-r border-slate-200">UND</TableCell>
                        <TableCell className="py-1 text-[10px] text-center border-r border-slate-200">{d.ubicacion}</TableCell>
                        <TableCell className="py-1 text-right text-[11px] border-r border-slate-200 font-mono">{d.precio.toFixed(2)}</TableCell>
                        <TableCell className="py-1 text-right text-[11px] border-r border-slate-200 text-red-600 font-mono">{((d.descuento / d.cantidad) * d.cantidad_devuelta).toFixed(2)}</TableCell>
                        <TableCell className="py-1 text-right text-[11px] border-r border-slate-200 font-mono">{((d.itbis / d.cantidad) * d.cantidad_devuelta).toFixed(2)}</TableCell>
                        <TableCell className="py-1 text-right text-[11px] font-bold font-mono">{(d.precio * d.cantidad_devuelta).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                    {Array.from({ length: Math.max(0, 15 - itemsADevolver.length) }).map((_, i) => (
                      <TableRow key={`empty-${i}`} className="h-7 border-b border-slate-200">
                        {Array.from({ length: 9 }).map((_, j) => (
                          <TableCell key={j} className="p-0 border-r border-slate-100 last:border-r-0 h-7" />
                        ))}
                      </TableRow>
                    ))}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Footer Area */}
        <div className="grid grid-cols-12 gap-4 h-48">

          {/* Notes Box */}
          <div className="col-span-8 bg-[#f8f9fa] border-2 border-slate-300 rounded p-4 relative shadow-sm">
            <span className="absolute -top-3 left-3 bg-[#f8f9fa] px-2 text-[10px] font-black text-slate-500 uppercase">Notas y Comentarios</span>
            <Textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              className="w-full h-full text-[11px] bg-white border-slate-300 resize-none"
              placeholder="Ingrese notas sobre la devolución aquí..."
            />
          </div>

          {/* Totals and Buttons */}
          <div className="col-span-4 flex flex-col gap-3">

            {/* Totals Box */}
            <div className="bg-white border-2 border-slate-300 rounded shadow-sm p-3 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-600 uppercase">Sub-Total</span>
                <span className="font-mono text-xs font-bold">{totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-600 uppercase">Descuento</span>
                <span className="font-mono text-xs font-bold text-red-600">{totals.descuento.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-600 uppercase">Recargo</span>
                <span className="font-mono text-xs font-bold">0.00</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-600 uppercase">TOTAL ITBIS</span>
                <span className="font-mono text-xs font-bold">{totals.itbis.toFixed(2)}</span>
              </div>
              <div className="h-px bg-slate-300 my-1" />
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-black text-slate-800 uppercase">TOTAL DEVOLUCION</span>
                <span className="font-mono text-base font-black text-blue-800">{totalDevolucion.toFixed(2)}</span>
              </div>
            </div>

            {/* Print Checkbox */}
            <div className="flex items-center gap-2 px-1">
              <Checkbox id="imprimir" checked={imprimir} onCheckedChange={setImprimir} className="border-slate-400" />
              <Label htmlFor="imprimir" className="text-[10px] font-bold text-slate-600 uppercase cursor-pointer">Imprimir comprobante al grabar</Label>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => navigate(-1)}
                className="flex-grow h-9 bg-slate-100 hover:bg-slate-200 border-slate-400 text-[11px] font-black uppercase text-slate-700 shadow-sm"
              >
                <X className="w-4 h-4 mr-2" /> ESC - Retornar
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    id="save-trigger"
                    className="flex-grow h-9 bg-[#a3c2f0] hover:bg-[#92b1e0] border-2 border-blue-400 text-[11px] font-black uppercase text-slate-800 shadow-md"
                    disabled={isSaving || !factura}
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} F10 - Grabar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="text-yellow-500 h-5 w-5" /> ¿Confirmar Devolución?</AlertDialogTitle>
                    <AlertDialogDescription className="text-sm">
                      ¿Está seguro que desea grabar esta devolución? Esta acción reintegrará los artículos al inventario.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="text-xs uppercase font-bold">Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-xs uppercase font-bold text-white">Confirmar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default DevolucionesPage;
