import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, CalendarPlus as CalendarIcon, Search, Loader2, AlertTriangle, UserX } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { generateCotizacionPDF } from '@/components/common/PDFGenerator';
import ProductSearchModal from '@/components/ventas/ProductSearchModal';
import ClienteSearchModal from '@/components/ventas/ClienteSearchModal';

const CLIENTE_GENERICO = {
  id: '00000000-0000-0000-0000-000000000000',
  nombre: 'Cliente Genérico',
  rnc: '000000000',
  direccion: 'N/A',
  telefono: 'N/A',
};

const CotizacionFormModal = ({ isOpen, onClose }) => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
  const [isClienteSearchOpen, setIsClienteSearchOpen] = useState(false);

  // Form state
  const [cliente, setCliente] = useState(CLIENTE_GENERICO);
  const [fechaCotizacion, setFechaCotizacion] = useState(new Date());
  const [fechaVencimiento, setFechaVencimiento] = useState(addDays(new Date(), 7));
  const [articulos, setArticulos] = useState([]);
  const [notas, setNotas] = useState('');
  const [imprimir, setImprimir] = useState(true);

  const resetForm = useCallback(() => {
    setCliente(CLIENTE_GENERICO);
    setFechaCotizacion(new Date());
    setFechaVencimiento(addDays(new Date(), 7));
    setArticulos([]);
    setNotas('');
    setImprimir(true);
    setIsSubmitting(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      resetForm();
    }
  }, [isOpen, resetForm]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isOpen && e.key === 'F3') {
        e.preventDefault();
        setIsClienteSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSelectCliente = (c) => {
    setCliente(c);
    setIsClienteSearchOpen(false);
  };
  
  const handleClearCliente = () => {
    setCliente(CLIENTE_GENERICO);
  };

  const handleSelectProduct = (product) => {
    if (articulos.some(a => a.producto_id === product.id)) {
      toast({ title: 'Artículo duplicado', description: 'Este artículo ya está en la cotización.', variant: 'destructive' });
      return;
    }
    const newArticle = {
      producto_id: product.id,
      codigo: product.codigo,
      descripcion: product.descripcion,
      cantidad: 1,
      unidad: 'UND', // Placeholder
      precio_unitario: product.precio || 0,
      itbis_pct: product.itbis_pct || 0.18,
      descuento_pct: 0,
    };
    setArticulos(prev => [...prev, newArticle]);
    setIsProductSearchOpen(false);
  };

  const handleUpdateArticle = (index, field, value) => {
    const updatedArticulos = [...articulos];
    const numericValue = parseFloat(value);
    if ((field === 'cantidad' || field === 'precio_unitario') && (isNaN(numericValue) || numericValue < 0)) return;
    if (field === 'descuento_pct' && (isNaN(numericValue) || numericValue < 0 || numericValue > 100)) return;
    
    updatedArticulos[index][field] = (field === 'cantidad' || field === 'precio_unitario' || field === 'descuento_pct') ? numericValue : value;
    setArticulos(updatedArticulos);
  };

  const handleRemoveArticle = (index) => {
    setArticulos(prev => prev.filter((_, i) => i !== index));
  };

  const totals = useMemo(() => {
    let subtotal = 0;
    let descuento_total = 0;
    let itbis_total = 0;

    articulos.forEach(item => {
      const itemSubtotal = (item.cantidad || 0) * (item.precio_unitario || 0);
      const itemDescuento = itemSubtotal * ((item.descuento_pct || 0) / 100);
      const baseImponible = itemSubtotal - itemDescuento;
      const itemItbis = baseImponible * (item.itbis_pct || 0);

      subtotal += itemSubtotal;
      descuento_total += itemDescuento;
      itbis_total += itemItbis;
    });

    const total_cotizacion = subtotal - descuento_total + itbis_total;
    return { subtotal, descuento_total, itbis_total, total_cotizacion };
  }, [articulos]);

  const handleSubmit = async () => {
    if (articulos.length === 0 || articulos.every(a => a.cantidad <= 0)) {
      toast({ title: 'Error de validación', description: 'Debe agregar al menos un artículo con cantidad mayor a cero.', variant: 'destructive' });
      return;
    }
    if (fechaVencimiento < fechaCotizacion) {
      toast({ title: 'Error de validación', description: 'La fecha de vigencia no puede ser anterior a la fecha de cotización.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);

    try {
      const isGenericClient = cliente.id === CLIENTE_GENERICO.id;
      
      if (!isGenericClient) {
          const { data: pending, error: pendingError } = await supabase
            .from('cotizaciones')
            .select('id')
            .eq('cliente_id', cliente.id)
            .eq('estado', 'Pendiente')
            .limit(1);

          if (pendingError) throw pendingError;

          if (pending.length > 0) {
            const continueAnyway = window.confirm('Este cliente ya tiene una cotización pendiente. ¿Desea crear una nueva?');
            if (!continueAnyway) {
              setIsSubmitting(false);
              return;
            }
          }
      }

      const { data: numeroData, error: numeroError } = await supabase.rpc('get_next_cotizacion_numero');
      if (numeroError) throw numeroError;
      const numeroCotizacion = numeroData;

      const cotizacionData = {
        numero: numeroCotizacion,
        fecha_cotizacion: format(fechaCotizacion, 'yyyy-MM-dd'),
        fecha_vencimiento: format(fechaVencimiento, 'yyyy-MM-dd'),
        cliente_id: cliente.id,
        subtotal: totals.subtotal,
        descuento_total: totals.descuento_total,
        itbis_total: totals.itbis_total,
        total_cotizacion: totals.total_cotizacion,
        notas,
        estado: 'Pendiente',
      };

      const { data: newCotizacion, error: cotizacionError } = await supabase
        .from('cotizaciones')
        .insert(cotizacionData)
        .select()
        .single();
      
      if (cotizacionError) throw cotizacionError;

      const detallesData = articulos.map(item => {
        const itemSubtotal = (item.cantidad || 0) * (item.precio_unitario || 0);
        const itemDescuento = itemSubtotal * ((item.descuento_pct || 0) / 100);
        const baseImponible = itemSubtotal - itemDescuento;
        const itemItbis = baseImponible * (item.itbis_pct || 0);
        return {
          cotizacion_id: newCotizacion.id,
          producto_id: item.producto_id,
          codigo: item.codigo,
          descripcion: item.descripcion,
          cantidad: item.cantidad,
          unidad: item.unidad,
          precio_unitario: item.precio_unitario,
          descuento_pct: item.descuento_pct,
          descuento_valor: itemDescuento,
          itbis_valor: itemItbis,
          importe: baseImponible + itemItbis,
        };
      });

      const { error: detallesError } = await supabase.from('cotizaciones_detalle').insert(detallesData);
      if (detallesError) throw detallesError;

      toast({ title: 'Éxito', description: `Cotización ${numeroCotizacion} creada correctamente.` });

      if (imprimir) {
        generateCotizacionPDF(newCotizacion, cliente, detallesData);
      }

      onClose(true); // Pass true to indicate success
    } catch (error) {
      console.error('Error creating cotizacion:', error);
      toast({ title: 'Error al guardar', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-6xl h-[95vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Crear Nueva Cotización</DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 border-b">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="cliente-search">Cliente <span className="text-morla-blue font-bold">[F3]</span></Label>
              <div className="flex gap-2">
                  <Button variant="outline" className="flex-grow justify-start text-left font-normal" onClick={() => setIsClienteSearchOpen(true)}>
                    <Search className="mr-2 h-4 w-4" />
                    {cliente?.nombre || "Seleccionar Cliente"}
                  </Button>
                  {cliente?.id !== CLIENTE_GENERICO.id && (
                    <Button variant="ghost" size="icon" onClick={handleClearCliente}>
                      <UserX className="h-4 w-4 text-red-500" />
                    </Button>
                  )}
              </div>
              {cliente && (
                <div className="text-xs text-muted-foreground mt-1">
                  RNC: {cliente.rnc || 'N/A'} | Tel: {cliente.telefono || 'N/A'}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Fecha Cotización</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(fechaCotizacion, 'PPP', { locale: es })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={fechaCotizacion} onSelect={setFechaCotizacion} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Fecha Vigencia</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(fechaVencimiento, 'PPP', { locale: es })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={fechaVencimiento} onSelect={setFechaVencimiento} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          <div className="flex-grow p-4 min-h-0 flex flex-col">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold">Artículos</h3>
              <Button size="sm" onClick={() => setIsProductSearchOpen(true)}>Agregar Artículo</Button>
            </div>
            <ScrollArea className="flex-grow border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-gray-50 z-10">
                  <TableRow>
                    <TableHead className="w-[100px]">Código</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="w-[100px]">Cant.</TableHead>
                    <TableHead className="w-[120px]">Precio U.</TableHead>
                    <TableHead className="w-[100px]">Desc. %</TableHead>
                    <TableHead className="w-[120px]">Importe</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {articulos.length > 0 ? articulos.map((item, index) => {
                    const itemSubtotal = (item.cantidad || 0) * (item.precio_unitario || 0);
                    const itemDescuento = itemSubtotal * ((item.descuento_pct || 0) / 100);
                    const baseImponible = itemSubtotal - itemDescuento;
                    const itemItbis = baseImponible * (item.itbis_pct || 0);
                    const importe = baseImponible + itemItbis;
                    return (
                      <TableRow key={index}>
                        <TableCell>{item.codigo}</TableCell>
                        <TableCell>{item.descripcion}</TableCell>
                        <TableCell>
                          <Input type="number" value={item.cantidad || 0} onChange={e => handleUpdateArticle(index, 'cantidad', e.target.value)} className="h-8" />
                        </TableCell>
                        <TableCell>
                           <Input type="number" value={item.precio_unitario || 0} onChange={e => handleUpdateArticle(index, 'precio_unitario', e.target.value)} className="h-8 text-right" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" value={item.descuento_pct || 0} onChange={e => handleUpdateArticle(index, 'descuento_pct', e.target.value)} className="h-8" />
                        </TableCell>
                        <TableCell className="text-right font-medium">{importe.toFixed(2)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRemoveArticle(index)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  }) : (
                    <TableRow>
                      <TableCell colSpan="7" className="text-center h-24 text-muted-foreground">
                        Agregue artículos a la cotización.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border-t">
            <div>
              <Label htmlFor="notas">Notas y Comentarios</Label>
              <Textarea id="notas" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Condiciones de pago, tiempo de entrega, etc." />
            </div>
            <div className="flex flex-col items-end">
              <div className="w-full max-w-xs space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotal:</span><span>{totals.subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Descuento:</span><span>- {totals.descuento_total.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>ITBIS:</span><span>+ {totals.itbis_total.toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-base border-t pt-1 mt-1"><span>TOTAL:</span><span>DOP {totals.total_cotizacion.toFixed(2)}</span></div>
              </div>
            </div>
          </div>

          <DialogFooter className="p-4 border-t">
            <div className="flex items-center space-x-2">
              <Checkbox id="imprimir" checked={imprimir} onCheckedChange={setImprimir} />
              <Label htmlFor="imprimir">Imprimir al guardar</Label>
            </div>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar Cotización
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ProductSearchModal isOpen={isProductSearchOpen} onClose={() => setIsProductSearchOpen(false)} onSelectProduct={handleSelectProduct} />
      <ClienteSearchModal isOpen={isClienteSearchOpen} onClose={() => setIsClienteSearchOpen(false)} onSelectCliente={handleSelectCliente} />
    </>
  );
};

export default CotizacionFormModal;