import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Save, X, Loader2, Plus, Trash2, Bot, FileDown } from 'lucide-react';
import { addDays } from 'date-fns';
import { formatInTimeZone, getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';
import { useNavigate } from 'react-router-dom';
import ProductSearchModal from '@/components/ventas/ProductSearchModal';
import { generateOrderPDF } from '@/components/common/PDFGenerator';

const OrdenCompraPage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [proveedores, setProveedores] = useState([]);
  const [selectedProveedor, setSelectedProveedor] = useState(null);
  const [orden, setOrden] = useState({
    numero: '',
    fecha_orden: getCurrentDateInTimeZone(),
    fecha_vencimiento: addDays(getCurrentDateInTimeZone(), 30),
    notas: '',
    aplicar_itbis: true,
    itbis_incluido: false,
  });
  const [detalles, setDetalles] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const fetchProveedores = useCallback(async () => {
    const { data, error } = await supabase.from('proveedores').select('*').eq('activo', true);
    if (error) toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los proveedores.' });
    else setProveedores(data);
  }, [toast]);

  useEffect(() => {
    fetchProveedores();
  }, [fetchProveedores]);

  const handleProveedorChange = (id) => {
    const prov = proveedores.find(p => p.id === id);
    setSelectedProveedor(prov || null);
  };

  const addProductToOrder = (product) => {
    if (detalles.find(d => d.producto_id === product.id)) {
      toast({ title: "Producto ya agregado", description: "Este producto ya se encuentra en la orden." });
      return;
    }
    const itbisPct = product.itbis_pct || 0;
    const precio = product.costo || product.precio || 0; // Prioritize cost for purchases
    
    const newDetalle = {
      id: Date.now(),
      producto_id: product.id,
      codigo: product.codigo,
      descripcion: product.descripcion,
      cantidad: 1,
      unidad: 'UND',
      precio: precio,
      descuento_pct: 0,
      itbis_pct: itbisPct,
      importe: 0, // Will be calculated by handleUpdateDetalle
    };
    const tempDetalles = [...detalles, newDetalle];
    setDetalles(calculateAllImportes(tempDetalles));
  };
  
  const calculateImporte = (detalle) => {
    const cantidad = parseFloat(detalle.cantidad) || 0;
    const precio = parseFloat(detalle.precio) || 0;
    const descuento = parseFloat(detalle.descuento_pct) || 0;
    const itbis_pct = parseFloat(detalle.itbis_pct) || 0;

    const subtotal = cantidad * precio;
    const montoDescuento = subtotal * (descuento / 100);
    const baseItbis = subtotal - montoDescuento;
    const montoItbis = orden.aplicar_itbis ? baseItbis * (itbis_pct / 100) : 0;
    
    return baseItbis + montoItbis;
  }
  
  const calculateAllImportes = (detallesList) => {
      return detallesList.map(d => ({...d, importe: calculateImporte(d)}));
  }

  const handleUpdateDetalle = (id, field, value) => {
    setDetalles(prev => {
        const updatedList = prev.map(d => 
            d.id === id ? { ...d, [field]: value } : d
        );
        return calculateAllImportes(updatedList);
    });
  };

  const removeDetalle = (id) => {
    setDetalles(prev => prev.filter(d => d.id !== id));
  };
  
  useEffect(() => {
    setDetalles(prev => calculateAllImportes(prev));
  }, [orden.aplicar_itbis]);

  const totals = useMemo(() => {
    let total_exento = 0;
    let total_gravado = 0;
    let descuento_total = 0;
    let itbis_total = 0;

    detalles.forEach(d => {
      const subtotal = d.cantidad * d.precio;
      const descuento = subtotal * (d.descuento_pct / 100);
      const base = subtotal - descuento;
      
      descuento_total += descuento;

      if (d.itbis_pct > 0 && orden.aplicar_itbis) {
        total_gravado += base;
        itbis_total += base * (d.itbis_pct / 100);
      } else {
        total_exento += base;
      }
    });
    
    const total_orden = total_gravado + total_exento + itbis_total;
    return { total_exento, total_gravado, descuento_total, itbis_total, total_orden };
  }, [detalles, orden.aplicar_itbis]);

  const handleOrdenAutomatica = async () => {
    if (!selectedProveedor) {
      toast({ variant: 'destructive', title: 'Seleccione un suplidor', description: 'Debe seleccionar un suplidor para generar una orden automática.' });
      return;
    }
    setIsGenerating(true);
    const { data, error } = await supabase.rpc('get_productos_para_orden_automatica', { p_suplidor_id: selectedProveedor.id });
    setIsGenerating(false);

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron obtener los productos bajo stock.' });
      return;
    }
    if (data.length === 0) {
      toast({ title: 'Sin productos', description: 'No hay productos bajo el stock mínimo para este suplidor.' });
      return;
    }
    const newDetalles = data.map(p => {
        const cantidadSugerida = (p.max_stock || p.min_stock || 0) - (p.existencia || 0);
        return {
            id: Date.now() + Math.random(),
            producto_id: p.id,
            codigo: p.codigo,
            descripcion: p.descripcion,
            cantidad: cantidadSugerida > 0 ? Math.ceil(cantidadSugerida) : 1,
            unidad: 'UND',
            precio: p.precio || 0,
            descuento_pct: 0,
            itbis_pct: p.itbis_pct || 0,
            importe: 0, // se calculará después
        };
    });

    setDetalles(calculateAllImportes(newDetalles));
    toast({ title: 'Orden Automática Generada', description: `${data.length} productos bajo stock fueron añadidos.` });
  };

  const handleSave = async () => {
    if (!selectedProveedor || detalles.length === 0) {
      toast({ variant: "destructive", title: "Datos incompletos", description: "Debe seleccionar un suplidor y añadir al menos un producto." });
      return;
    }
    setIsSaving(true);
    
    const ordenData = {
      ...orden,
      fecha_orden: formatDateForSupabase(orden.fecha_orden),
      fecha_vencimiento: formatDateForSupabase(orden.fecha_vencimiento),
      suplidor_id: selectedProveedor.id,
      ...totals
    };

    const { data: savedOrden, error: ordenError } = await supabase.from('ordenes_compra').insert(ordenData).select().single();

    if (ordenError) {
      toast({ variant: "destructive", title: "Error al guardar la orden", description: ordenError.message });
      setIsSaving(false);
      return;
    }

    const detallesData = detalles.map(d => ({
      orden_compra_id: savedOrden.id,
      producto_id: d.producto_id,
      codigo: d.codigo,
      descripcion: d.descripcion,
      cantidad: d.cantidad,
      unidad: d.unidad,
      precio: d.precio,
      descuento_pct: d.descuento_pct,
      itbis_pct: d.itbis_pct,
      importe: d.importe,
    }));

    const { error: detallesError } = await supabase.from('ordenes_compra_detalle').insert(detallesData);

    if (detallesError) {
      toast({ variant: "destructive", title: "Error al guardar detalles", description: detallesError.message });
    } else {
      toast({ title: 'Éxito', description: 'Orden de compra guardada correctamente.' });
      
      generateOrderPDF(savedOrden, selectedProveedor, detalles);

      // Reset form logic here
      setSelectedProveedor(null);
      setOrden({
        numero: '',
        fecha_orden: getCurrentDateInTimeZone(),
        fecha_vencimiento: addDays(getCurrentDateInTimeZone(), 30),
        notas: '',
        aplicar_itbis: true,
        itbis_incluido: false,
      });
      setDetalles([]);
    }
    
    setIsSaving(false);
  };

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'F10') { e.preventDefault(); handleSave(); }
    if (e.key === 'Escape') { e.preventDefault(); navigate(-1); }
  }, [navigate, handleSave]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      <Helmet><title>Orden de Compra - Repuestos Morla</title></Helmet>
      <ProductSearchModal isOpen={isSearchModalOpen} onClose={() => setIsSearchModalOpen(false)} onSelectProduct={addProductToOrder} />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-gray-100 min-h-full text-sm">
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="bg-morla-blue text-white text-center py-2 rounded-t-lg mb-4">
            <h1 className="text-xl font-bold">ORDEN DE COMPRA</h1>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="md:col-span-2 p-4 border rounded-lg space-y-2 relative">
              <Label className="absolute -top-2.5 left-2 bg-white px-1 font-semibold text-gray-600">Datos de Suplidor</Label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Suplidor</Label>
                  <Select onValueChange={handleProveedorChange} value={selectedProveedor?.id || ''}>
                    <SelectTrigger><SelectValue placeholder="Seleccione un suplidor..." /></SelectTrigger>
                    <SelectContent>
                      {proveedores.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>RNC</Label><Input value={selectedProveedor?.rnc || ''} readOnly disabled /></div>
              </div>
              <div><Label>Nombre</Label><Input value={selectedProveedor?.nombre || ''} readOnly disabled /></div>
              <div><Label>Dirección</Label><Input value={selectedProveedor?.direccion || ''} readOnly disabled /></div>
              <div><Label>Teléfonos</Label><Input value={selectedProveedor?.telefono || ''} readOnly disabled /></div>
            </div>
            <div className="p-4 border rounded-lg space-y-2 relative">
              <Label className="absolute -top-2.5 left-2 bg-white px-1 font-semibold text-gray-600">Detalles de la Orden</Label>
              <div><Label>NÚMERO</Label><Input value={orden.numero} onChange={e => setOrden({...orden, numero: e.target.value})} /></div>
              <div>
                <Label>FECHA</Label>
                <Popover>
                  <PopoverTrigger asChild><Button variant="outline" className="w-full justify-start font-normal"><span className="lucide lucide-calendar mr-2 h-4 w-4"></span>{formatInTimeZone(orden.fecha_orden, "dd/MM/yyyy")}</Button></PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={orden.fecha_orden} onSelect={d => setOrden({...orden, fecha_orden: d})} /></PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>VENCE</Label>
                <Popover>
                  <PopoverTrigger asChild><Button variant="outline" className="w-full justify-start font-normal"><span className="lucide lucide-calendar mr-2 h-4 w-4"></span>{formatInTimeZone(orden.fecha_vencimiento, "dd/MM/yyyy")}</Button></PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={orden.fecha_vencimiento} onSelect={d => setOrden({...orden, fecha_vencimiento: d})} /></PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader className="bg-gray-200">
                <TableRow>
                  <TableHead className="w-[120px]">CÓDIGO</TableHead>
                  <TableHead>DESCRIPCIÓN</TableHead>
                  <TableHead className="w-[80px]">CANT.</TableHead>
                  <TableHead className="w-[80px]">UNIDAD</TableHead>
                  <TableHead className="w-[100px]">PRECIO</TableHead>
                  <TableHead className="w-[80px]">DESC.%</TableHead>
                  <TableHead className="w-[80px]">ITBIS</TableHead>
                  <TableHead className="w-[120px]">IMPORTE</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detalles.map(d => (
                  <TableRow key={d.id}>
                    <TableCell>{d.codigo}</TableCell>
                    <TableCell>{d.descripcion}</TableCell>
                    <TableCell><Input type="number" value={d.cantidad} onChange={e => handleUpdateDetalle(d.id, 'cantidad', e.target.value)} className="h-8 text-right" /></TableCell>
                    <TableCell>
                        <Select value={d.unidad} onValueChange={v => handleUpdateDetalle(d.id, 'unidad', v)}>
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="UND">UND</SelectItem>
                                <SelectItem value="CAJA">CAJA</SelectItem>
                                <SelectItem value="PAR">PAR</SelectItem>
                            </SelectContent>
                        </Select>
                    </TableCell>
                    <TableCell><Input type="number" value={d.precio} onChange={e => handleUpdateDetalle(d.id, 'precio', e.target.value)} className="h-8 text-right" /></TableCell>
                    <TableCell><Input type="number" value={d.descuento_pct} onChange={e => handleUpdateDetalle(d.id, 'descuento_pct', e.target.value)} className="h-8 text-right" /></TableCell>
                    <TableCell className="text-right">{d.itbis_pct.toFixed(2)}%</TableCell>
                    <TableCell className="text-right font-bold">{d.importe.toFixed(2)}</TableCell>
                    <TableCell><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeDetalle(d.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="p-2 bg-gray-50 border-t">
              <Button size="sm" onClick={() => setIsSearchModalOpen(true)}><Plus className="mr-2 h-4 w-4" /> Añadir Producto</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="md:col-span-2 space-y-2">
              <Label>Notas / Comentario</Label>
              <Textarea value={orden.notas} onChange={e => setOrden({...orden, notas: e.target.value})} rows={5} />
              <div className="flex space-x-2">
                <Button onClick={handleOrdenAutomatica} disabled={!selectedProveedor || isGenerating}>
                    {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Bot className="mr-2 h-4 w-4" />} ORDEN AUTOMÁTICA
                </Button>
                 <Button variant="secondary" onClick={() => generateOrderPDF({...orden, ...totals}, selectedProveedor, detalles)} disabled={detalles.length === 0 || !selectedProveedor}>
                    <FileDown className="mr-2 h-4 w-4" /> Generar PDF
                </Button>
              </div>
            </div>
            <div className="p-4 border rounded-lg space-y-2">
              <div className="flex items-center space-x-2"><Checkbox id="aplicar-itbis" checked={orden.aplicar_itbis} onCheckedChange={c => setOrden({...orden, aplicar_itbis: !!c})} /><Label htmlFor="aplicar-itbis">Aplicar ITBIS</Label></div>
              <div className="flex items-center space-x-2"><Checkbox id="itbis-incluido" checked={orden.itbis_incluido} onCheckedChange={c => setOrden({...orden, itbis_incluido: !!c})} /><Label htmlFor="itbis-incluido">ITBIS incluido?</Label></div>
              <div className="border-t pt-2 mt-2 space-y-1">
                <div className="flex justify-between"><span>Total Exento:</span><span className="font-mono">{totals.total_exento.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Total Gravado:</span><span className="font-mono">{totals.total_gravado.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Descuento:</span><span className="font-mono text-red-500">{totals.descuento_total.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>ITBIS:</span><span className="font-mono">{totals.itbis_total.toFixed(2)}</span></div>
                <div className="flex justify-between text-lg font-bold border-t mt-1 pt-1"><span>TOTAL:</span><span className="font-mono text-red-600">{totals.total_orden.toFixed(2)}</span></div>
              </div>
              <div className="pt-2">
                <Label>Imprimir en</Label>
                <Select defaultValue="normal"><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">8.5 Pulgadas (Papel Normal)</SelectItem></SelectContent></Select>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end space-x-4">
            <Button variant="outline" onClick={() => navigate(-1)} disabled={isSaving}><X className="mr-2 h-4 w-4" /> ESC - Retornar</Button>
            <Button className="bg-morla-blue hover:bg-morla-blue/90" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} F10 - Continuar
            </Button>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default OrdenCompraPage;