import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
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
import { X, CalendarPlus as CalendarIcon, Search, Loader2, AlertTriangle, UserX, PlusCircle } from 'lucide-react';
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

const CotizacionFormModal = ({ isOpen, onClose, editingCotizacion = null }) => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
  const [isClienteSearchOpen, setIsClienteSearchOpen] = useState(false);
  const [vendedores, setVendedores] = useState([]);

  // Form state
  const [cliente, setCliente] = useState(CLIENTE_GENERICO);
  const [vendedorId, setVendedorId] = useState('');
  const [fechaCotizacion, setFechaCotizacion] = useState(new Date());
  const [fechaVencimiento, setFechaVencimiento] = useState(addDays(new Date(), 7));
  const [articulos, setArticulos] = useState([]);
  const [notas, setNotas] = useState('');
  const [manualClienteNombre, setManualClienteNombre] = useState('');
  const [imprimir, setImprimir] = useState(true);

  // Staging state
  const [currentItem, setCurrentItem] = useState(null);
  const [itemCode, setItemCode] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const { data: vData } = await supabase.from('vendedores').select('id, nombre').eq('activo', true).order('nombre', { ascending: true });
      setVendedores(vData || []);
    } catch (error) {
      console.error("Error fetching vendors", error);
    }
  }, []);

  const loadCotizacionData = useCallback(async (cot) => {
    setCliente({
      id: cot.cliente_id,
      nombre: cot.cliente_nombre || 'Cliente',
      rnc: cot.cliente_rnc || 'N/A',
      direccion: cot.cliente_direccion || 'N/A',
      telefono: cot.cliente_telefono || 'N/A'
    });
    setVendedorId(cot.vendedor_id || '');
    setFechaCotizacion(new Date(cot.fecha_cotizacion));
    setFechaVencimiento(new Date(cot.fecha_vencimiento));
    setNotas(cot.notas || '');
    setManualClienteNombre(cot.manual_cliente_nombre || '');

    // Fetch details
    const { data: details, error } = await supabase
      .from('cotizaciones_detalle')
      .select('*')
      .eq('cotizacion_id', cot.id);

    if (error) {
      toast({ title: 'Error', description: 'No se pudieron cargar los detalles de la cotización.', variant: 'destructive' });
    } else {
      setArticulos(details.map(d => ({
        id: d.id, // For existing items
        producto_id: d.producto_id,
        codigo: d.codigo,
        descripcion: d.descripcion,
        cantidad: d.cantidad,
        unidad: d.unidad,
        precio_unitario: d.precio_unitario,
        itbis_pct: (d.itbis_valor / (d.importe - d.itbis_valor)) || 0.18, // Rough estimate if not in row
        descuento_pct: d.descuento_pct || 0,
      })));
    }
  }, [toast]);

  const resetForm = useCallback(() => {
    setCliente(CLIENTE_GENERICO);
    setVendedorId(vendedores.length > 0 ? vendedores[0].id : '');
    setFechaCotizacion(new Date());
    setFechaVencimiento(addDays(new Date(), 7));
    setArticulos([]);
    setNotas('');
    setManualClienteNombre('');
    setImprimir(true);
    setIsSubmitting(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchData();
      if (editingCotizacion) {
        loadCotizacionData(editingCotizacion);
      } else {
        resetForm();
      }
    }
  }, [isOpen, editingCotizacion, resetForm, fetchData, loadCotizacionData]);

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
    // Apply price level logic
    const nivel = cliente?.precio_nivel || 1;
    const p1 = product.presentaciones && product.presentaciones.length > 0
      ? parseFloat((product.presentaciones.find(p => p.afecta_ft) || product.presentaciones[0]).precio1 || 0)
      : (product.precio || 0);
    const p2 = product.presentaciones && product.presentaciones.length > 0
      ? parseFloat((product.presentaciones.find(p => p.afecta_ft) || product.presentaciones[0]).precio2 || 0)
      : 0;
    const p3 = product.presentaciones && product.presentaciones.length > 0
      ? parseFloat((product.presentaciones.find(p => p.afecta_ft) || product.presentaciones[0]).precio3 || 0)
      : 0;
    const auto2 = product.presentaciones && product.presentaciones.length > 0
      ? !!(product.presentaciones.find(p => p.afecta_ft) || product.presentaciones[0]).auto_precio2
      : false;
    const auto3 = product.presentaciones && product.presentaciones.length > 0
      ? !!(product.presentaciones.find(p => p.afecta_ft) || product.presentaciones[0]).auto_precio3
      : false;

    let finalPrice = p1;
    let maxDesc = parseFloat(product.max_descuento || 0);

    if (nivel === 3) {
      if (auto3 || p3 > 0) {
        finalPrice = p3;
      } else if (auto2 || p2 > 0) {
        finalPrice = p2;
      } else {
        finalPrice = p1;
      }
    } else if (nivel === 2) {
      if (auto2 || p2 > 0) {
        finalPrice = p2;
      } else {
        finalPrice = p1;
      }
    }

    // Set maxDesc based on level
    if (nivel === 2 || nivel === 3) {
      maxDesc = 0;
    } else if (product.presentaciones && product.presentaciones.length > 0) {
      const mainPres = product.presentaciones.find(p => p.afecta_ft) || product.presentaciones[0];
      maxDesc = parseFloat(mainPres.descuento_pct || 0);
    }

    const newItem = {
      producto_id: product.id,
      codigo: product.codigo,
      descripcion: product.descripcion,
      ubicacion: product.ubicacion || '',
      cantidad: 1,
      unidad: 'UND',
      precio_unitario: finalPrice,
      itbis_pct: product.itbis_pct || 0.18,
      descuento_pct: 0,
      max_descuento: maxDesc
    };
    setCurrentItem(newItem);
    setItemCode(product.codigo);
    setIsProductSearchOpen(false);

    // Focus Cantidad after selection
    setTimeout(() => {
      document.getElementById('cot-input-cantidad')?.focus();
      document.getElementById('cot-input-cantidad')?.select();
    }, 100);
  };

  const updateCurrentItem = (field, value) => {
    setCurrentItem(prev => {
      if (!prev) return null;
      const updated = { ...prev, [field]: (field === 'descripcion' || field === 'unidad') ? value : parseFloat(value) || 0 };

      if (field === 'descuento_pct') {
        const maxDisc = prev.max_descuento || 0;
        if (updated.descuento_pct > maxDisc) {
          toast({
            title: "Descuento Excedido",
            description: `El descuento máximo permitido es ${maxDisc}%`,
            variant: "destructive"
          });
          updated.descuento_pct = maxDisc;
        }
      }

      return updated;
    });
  };

  const commitCurrentItem = () => {
    if (!currentItem || !currentItem.cantidad || currentItem.cantidad <= 0) return;

    setArticulos(prev => {
      const existingIndex = prev.findIndex(a => a.producto_id === currentItem.producto_id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex].cantidad += currentItem.cantidad;
        return updated;
      }
      return [...prev, currentItem];
    });
    setCurrentItem(null);
    setItemCode('');
  };

  const handleAddByCode = async (code) => {
    if (!code.trim()) return;
    const { data, error } = await supabase
      .from('productos')
      .select('*, presentaciones(*)')
      .eq('codigo', code.trim())
      .maybeSingle();
    if (data) handleSelectProduct(data);
    else toast({ title: 'No encontrado', description: 'Producto no existe', variant: 'destructive' });
  };

  const handleUpdateArticle = (index, field, value) => {
    const updatedArticulos = [...articulos];
    const item = updatedArticulos[index];

    if (field === 'descuento_valor') {
      const amount = parseFloat(value) || 0;
      const totalBruto = (item.cantidad || 0) * (item.precio_unitario || 0);
      const pct = totalBruto > 0 ? (amount / totalBruto) * 100 : 0;

      const maxDisc = item.max_descuento || 0;
      if (pct > maxDisc) {
        toast({ title: "Descuento Excedido", description: `El máximo es ${maxDisc}%`, variant: "destructive" });
        item.descuento_pct = maxDisc;
      } else {
        item.descuento_pct = pct;
      }
    } else {
      const numericValue = parseFloat(value);
      if ((field === 'cantidad' || field === 'precio_unitario') && (isNaN(numericValue) || numericValue < 0)) return;
      if (field === 'descuento_pct') {
        if (isNaN(numericValue) || numericValue < 0) return;
        const maxDisc = item.max_descuento || 0;
        if (numericValue > maxDisc) {
          toast({ title: "Descuento Excedido", description: `El máximo es ${maxDisc}%`, variant: "destructive" });
          item.descuento_pct = maxDisc;
        } else {
          item.descuento_pct = numericValue;
        }
      } else {
        updatedArticulos[index][field] = value;
      }
    }
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

    const hasClient = cliente?.id || manualClienteNombre?.trim();
    if (!hasClient) {
      toast({ title: 'Error de validación', description: 'Debe seleccionar un cliente o escribir un nombre.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);

    try {
      // If no specific client is selected or it's empty, use the official generic client ID
      const FINAL_GENERIC_ID = '2749fa36-3d7c-4bdf-ad61-df88eda8365a';
      const finalClienteId = cliente?.id || FINAL_GENERIC_ID;

      const cotizacionData = {
        fecha_cotizacion: format(fechaCotizacion, 'yyyy-MM-dd'),
        fecha_vencimiento: format(fechaVencimiento, 'yyyy-MM-dd'),
        cliente_id: finalClienteId,
        vendedor_id: vendedorId || null,
        subtotal: totals.subtotal,
        descuento_total: totals.descuento_total,
        itbis_total: totals.itbis_total,
        total_cotizacion: totals.total_cotizacion,
        notas,
        manual_cliente_nombre: (finalClienteId === FINAL_GENERIC_ID || finalClienteId === '00000000-0000-0000-0000-000000000000') ? manualClienteNombre : null,
        estado: editingCotizacion ? editingCotizacion.estado : 'Pendiente',
      };

      let cotId = editingCotizacion?.id;

      if (editingCotizacion) {
        const { error: updateError } = await supabase
          .from('cotizaciones')
          .update(cotizacionData)
          .eq('id', cotId);
        if (updateError) throw updateError;

        // Delete old details
        const { error: deleteError } = await supabase.from('cotizaciones_detalle').delete().eq('cotizacion_id', cotId);
        if (deleteError) throw deleteError;
      } else {
        const { data: numeroData, error: numeroError } = await supabase.rpc('get_next_cotizacion_numero');
        if (numeroError) throw numeroError;
        cotizacionData.numero = numeroData;

        const { data: newCot, error: insertError } = await supabase
          .from('cotizaciones')
          .insert(cotizacionData)
          .select()
          .single();
        if (insertError) throw insertError;
        cotId = newCot.id;
      }

      const detallesData = articulos.map(item => {
        const itemSubtotal = (item.cantidad || 0) * (item.precio_unitario || 0);
        const itemDescuento = itemSubtotal * ((item.descuento_pct || 0) / 100);
        const baseImponible = itemSubtotal - itemDescuento;
        const itemItbis = baseImponible * (item.itbis_pct || 0);
        return {
          cotizacion_id: cotId,
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

      toast({ title: 'Éxito', description: `Cotización guardada correctamente.` });

      if (imprimir) {
        generateCotizacionPDF({ ...cotizacionData, id: cotId, numero: editingCotizacion?.numero || cotizacionData.numero }, cliente, detallesData);
      }

      onClose(true);
    } catch (error) {
      console.error('Error saving cotizacion:', error);
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
            <DialogTitle>{editingCotizacion ? `Modificando Cotización ${editingCotizacion.numero}` : 'Crear Nueva Cotización'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 border-b">
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
              {(() => {
                const genericIds = ['2749fa36-3d7c-4bdf-ad61-df88eda8365a', '00000000-0000-0000-0000-000000000000'];
                const isGeneric = !cliente?.id || genericIds.includes(cliente.id) || cliente.nombre?.toUpperCase().includes('GENERICO');

                if (isGeneric) {
                  return (
                    <div className="mt-2 space-y-1">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase">Nombre de Cliente / Vehículo</Label>
                      <Input
                        value={manualClienteNombre}
                        onChange={e => setManualClienteNombre(e.target.value)}
                        className="h-8 border-yellow-400 bg-yellow-50 text-xs text-[#0a1e3a] font-bold uppercase ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        placeholder="ESCRIBA NOMBRE O VEHICULO..."
                      />
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            <div className="space-y-2">
              <Label>Vendedor</Label>
              <select
                value={vendedorId}
                onChange={e => setVendedorId(e.target.value)}
                className="w-full h-10 px-3 py-2 text-sm border rounded-md"
              >
                <option value="">Seleccione...</option>
                {vendedores.map(v => (
                  <option key={v.id} value={v.id}>{v.nombre}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Fecha</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal p-2 h-10 text-xs">
                      {format(fechaCotizacion, 'dd/MM/yy')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={fechaCotizacion} onSelect={setFechaCotizacion} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Vence</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal p-2 h-10 text-xs">
                      {format(fechaVencimiento, 'dd/MM/yy')}
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
                <TableHeader className="sticky top-0 bg-gray-50 z-10 text-xs">
                  <TableRow className="bg-[#ffffbf] hover:bg-[#ffffbf] border-b-2 border-gray-600 shadow-md h-10 group">
                    <TableCell className="p-1 border-r border-gray-400">
                      <div className="flex items-center">
                        <Input
                          id="cot-input-codigo"
                          placeholder="F9..."
                          value={itemCode}
                          onChange={e => setItemCode(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleAddByCode(itemCode);
                            if (e.key === 'F9') setIsProductSearchOpen(true);
                          }}
                          className="h-7 text-xs font-black border-blue-600 focus:ring-0 bg-white uppercase"
                        />
                        <Button size="sm" variant="outline" className="h-7 px-1 rounded-none border-gray-400 bg-gray-100" onClick={() => setIsProductSearchOpen(true)} tabIndex="-1">
                          <Search className="w-3 h-3 text-blue-800" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="p-1 border-r border-gray-400 font-bold text-blue-900 uppercase truncate max-w-[300px]" title={currentItem?.descripcion}>
                      {currentItem?.descripcion || <span className="text-gray-400 italic">... BUSQUE POR CODIGO</span>}
                    </TableCell>
                    <TableCell className="p-1 border-r border-gray-400">
                      <Input
                        id="cot-input-cantidad"
                        type="number"
                        value={currentItem?.cantidad || ''}
                        onChange={e => updateCurrentItem('cantidad', e.target.value)}
                        className="h-7 text-xs text-center font-black text-blue-900 border-blue-600 focus:ring-0 bg-white"
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            if (profile?.role === 'admin') {
                              document.getElementById('cot-input-precio')?.focus();
                            } else {
                              document.getElementById('cot-input-descuento')?.focus();
                            }
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell className="p-1 border-r border-gray-400">
                      <Input
                        id="cot-input-precio"
                        type="number"
                        value={currentItem?.precio_unitario || ''}
                        onChange={e => updateCurrentItem('precio_unitario', e.target.value)}
                        className="h-7 text-xs text-right font-black text-blue-900 border-blue-600 focus:ring-0 bg-white"
                        onKeyDown={e => { if (e.key === 'Enter') document.getElementById('cot-input-descuento')?.focus(); }}
                        disabled={profile?.role !== 'admin'}
                      />
                    </TableCell>
                    <TableCell className="p-1 border-r border-gray-400">
                      <Input
                        id="cot-input-descuento"
                        type="number"
                        value={currentItem?.descuento_pct || ''}
                        onChange={e => updateCurrentItem('descuento_pct', e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitCurrentItem(); setTimeout(() => document.getElementById('cot-input-codigo')?.focus(), 50); } }}
                        className="h-7 text-xs text-center font-black text-red-600 border-blue-600 focus:ring-0 bg-white"
                      />
                    </TableCell>
                    <TableCell className="p-1 text-right font-black text-blue-800 bg-blue-50/30 border-r border-gray-400">
                      {currentItem ? (Number((currentItem.cantidad * currentItem.precio_unitario) * (1 - currentItem.descuento_pct / 100) * (1 + currentItem.itbis_pct))).toFixed(2) : '0.00'}
                    </TableCell>
                    <TableCell className="p-1 text-center">
                      <Button size="sm" variant="ghost" className="h-7 w-7 text-green-600 hover:bg-green-50" onClick={commitCurrentItem}><PlusCircle className="h-5 w-5" /></Button>
                    </TableCell>
                  </TableRow>
                  <TableRow className="bg-gray-100">
                    <TableHead className="w-[150px] font-bold text-gray-700">Código</TableHead>
                    <TableHead className="font-bold text-gray-700">Descripción</TableHead>
                    <TableHead className="w-[80px] text-center font-bold text-gray-700">Cant.</TableHead>
                    <TableHead className="w-[110px] text-right font-bold text-gray-700">Precio</TableHead>
                    <TableHead className="w-[100px] text-right font-bold text-gray-700">Desc. $</TableHead>
                    <TableHead className="w-[110px] text-right font-bold text-gray-700">Importe</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {articulos.length > 0 ? articulos.map((item, index) => {
                    const itemSubtotal = (item.cantidad || 0) * (item.precio_unitario || 0);
                    const itemDescuento = itemSubtotal * ((item.descuento_pct || 0) / 100);
                    const baseImponible = itemSubtotal - itemDescuento;
                    const itemItbis = baseImponible * (item.itbis_pct || 0);
                    const importe = baseImponible + itemItbis;
                    return (
                      <TableRow key={index} className="hover:bg-gray-50">
                        <TableCell className="font-bold">{item.codigo}</TableCell>
                        <TableCell>{item.descripcion}</TableCell>
                        <TableCell>
                          <Input type="number" value={item.cantidad || 0} onChange={e => handleUpdateArticle(index, 'cantidad', e.target.value)} className="h-7 text-xs text-center border-gray-300" />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={item.precio_unitario || 0}
                            onChange={e => handleUpdateArticle(index, 'precio_unitario', e.target.value)}
                            className="h-7 text-xs text-right border-gray-300"
                            disabled={profile?.role !== 'admin'}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={Number(itemDescuento || 0).toFixed(2)}
                            onChange={e => handleUpdateArticle(index, 'descuento_valor', e.target.value)}
                            className="h-7 text-xs text-right border-gray-300 font-bold text-red-600"
                          />
                        </TableCell>
                        <TableCell className="text-right font-black text-blue-900 bg-blue-50/20">{Number(importe || 0).toFixed(2)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemoveArticle(index)}>
                            <X className="h-3 w-3" />
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
              <Textarea id="notas" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Condiciones de pago, tiempo de entrega, etc." className="h-20" />
            </div>
            <div className="flex flex-col items-end">
              <div className="w-full max-w-xs space-y-1 text-xs">
                <div className="flex justify-between"><span>Subtotal:</span><span>{Number(totals.subtotal || 0).toFixed(2)}</span></div>
                <div className="flex justify-between"><span>Descuento:</span><span>- {Number(totals.descuento_total || 0).toFixed(2)}</span></div>
                <div className="flex justify-between"><span>ITBIS:</span><span>+ {Number(totals.itbis_total || 0).toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-base border-t pt-1 mt-1"><span>TOTAL:</span><span>DOP {Number(totals.total_cotizacion || 0).toFixed(2)}</span></div>
              </div>
            </div>
          </div>

          <DialogFooter className="p-4 border-t">
            <div className="flex items-center space-x-2 mr-auto">
              <Checkbox id="imprimir" checked={imprimir} onCheckedChange={setImprimir} />
              <Label htmlFor="imprimir" className="text-xs">Imprimir al guardar</Label>
            </div>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingCotizacion ? 'Actualizar Cotización' : 'Guardar Cotización'}
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
