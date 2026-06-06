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
import { X, CalendarPlus as CalendarIcon, Search, Loader2, AlertTriangle, UserX, PlusCircle, Share2, Plus, FileDown, ListOrdered, Tags } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { generateCotizacionPDF } from '@/components/common/PDFGenerator';
import ProductSearchModal from '@/components/ventas/ProductSearchModal';
import ClienteSearchModal from '@/components/ventas/ClienteSearchModal';

// Input con formato de miles es-DO (oculta la coma al editar)
const MoneyInput = React.forwardRef(({ value, onChange, className = '', ...rest }, ref) => {
    const [focused, setFocused] = React.useState(false);
    const [draft, setDraft] = React.useState('');
    const display = focused
        ? draft
        : Number(value || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (
        <Input
            ref={ref}
            type="text"
            inputMode="decimal"
            value={display}
            onFocus={(e) => { setFocused(true); setDraft(String(value ?? '')); setTimeout(() => e.target.select?.(), 0); }}
            onChange={(e) => {
                const cleaned = e.target.value.replace(/[^0-9.,]/g, '').replace(/,/g, '');
                setDraft(cleaned);
                onChange?.({ target: { value: cleaned } });
            }}
            onBlur={() => setFocused(false)}
            className={className}
            {...rest}
        />
    );
});
MoneyInput.displayName = 'MoneyInput';

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
  const [modalSessionKey, setModalSessionKey] = useState(0);
  const [isClienteSearchOpen, setIsClienteSearchOpen] = useState(false);
  const [vendedores, setVendedores] = useState([]);

  // Form state
  const [cliente, setCliente] = useState(CLIENTE_GENERICO);
  const [vendedorId, setVendedorId] = useState('');
  const [fechaCotizacion, setFechaCotizacion] = useState(new Date());
  const [fechaVencimiento, setFechaVencimiento] = useState(addDays(new Date(), 15));
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
    setFechaCotizacion(cot.fecha_cotizacion ? new Date(cot.fecha_cotizacion + "T12:00:00") : new Date());
    setFechaVencimiento(cot.fecha_vencimiento ? new Date(cot.fecha_vencimiento + "T12:00:00") : addDays(new Date(), 15));
    setNotas(cot.notas || '');
    setManualClienteNombre(cot.manual_cliente_nombre || '');

    // Fetch details
    const { data: details, error } = await supabase
      .from('cotizaciones_detalle')
      .select('*, productos(imagen_url)')
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
        imagen_url: d.productos?.imagen_url,
      })));
    }
  }, [toast]);

  const resetForm = useCallback(() => {
    setCliente(CLIENTE_GENERICO);
    setVendedorId(vendedores.length > 0 ? vendedores[0].id : '');
    setFechaCotizacion(new Date());
    setFechaVencimiento(addDays(new Date(), 15));
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
      max_descuento: maxDesc,
      imagen_url: product.imagen_url
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

  // Share product image via Web Share API or open in new tab
  const handleShareImage = async (item) => {
    const imageUrl = item.imagen_url;
    if (!imageUrl) return;

    try {
      if (navigator.share) {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File([blob], `${item.codigo || 'producto'}.jpg`, { type: blob.type });

        await navigator.share({
          title: item.descripcion || 'Imagen del producto',
          text: `${item.descripcion} — Código: ${item.codigo}`,
          files: [file],
        });
        toast({ title: 'Compartido', description: 'Imagen compartida exitosamente.' });
      } else {
        window.open(imageUrl, '_blank');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[Share] Error:', err);
        window.open(imageUrl, '_blank');
      }
    }
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
      .ilike('codigo', code.trim())
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
    let total_cotizacion = 0;

    articulos.forEach(item => {
      const importeBruto = (item.cantidad || 0) * (item.precio_unitario || 0);
      const itemDescuento = importeBruto * ((item.descuento_pct || 0) / 100);
      const importeFinal = importeBruto - itemDescuento;

      const baseImponible = importeFinal / (1 + (item.itbis_pct || 0.18));
      const itemItbis = importeFinal - baseImponible;

      subtotal += baseImponible;
      descuento_total += itemDescuento;
      itbis_total += itemItbis;
      total_cotizacion += importeFinal;
    });

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
        const importeBruto = (item.cantidad || 0) * (item.precio_unitario || 0);
        const itemDescuento = importeBruto * ((item.descuento_pct || 0) / 100);
        const importeFinal = importeBruto - itemDescuento;
        
        const baseImponible = importeFinal / (1 + (item.itbis_pct || 0.18));
        const itemItbis = importeFinal - baseImponible;

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
          importe: importeFinal,
        };
      });

      const { error: detallesError } = await supabase.from('cotizaciones_detalle').insert(detallesData);
      if (detallesError) throw detallesError;

      toast({ title: 'Éxito', description: `Cotización guardada correctamente.` });
      setModalSessionKey(k => k + 1);

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

  const { empresa } = useAuth();
  const isGenericClient = (() => {
    const genericIds = ['2749fa36-3d7c-4bdf-ad61-df88eda8365a', '00000000-0000-0000-0000-000000000000'];
    return !cliente?.id || genericIds.includes(cliente.id) || cliente.nombre?.toUpperCase().includes('GENERICO');
  })();

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-[98vw] w-[1500px] h-[95vh] flex flex-col p-0 gap-0 overflow-hidden bg-slate-50 border-none shadow-2xl [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:opacity-100 [&>button]:top-3 [&>button]:right-3 [&>button]:z-50">

          {/* Header dark estilo Facturacion */}
          <div className="bg-slate-900 text-white px-4 py-2 flex items-center justify-between border-b border-slate-700">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <button className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300" title="Nuevo">
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300" title="Guardar">
                  <FileDown className="w-3.5 h-3.5" />
                </button>
                <button className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300" title="Listar">
                  <ListOrdered className="w-3.5 h-3.5" />
                </button>
              </div>
              <h2 className="text-lg font-bold tracking-tight flex items-center gap-3">
                <span className="text-amber-400">{empresa?.nombre?.toUpperCase() || 'REPUESTOS MORLA'}</span>
                <span className="text-slate-500">|</span>
                <span className="uppercase tracking-widest text-sm text-sky-300 font-black">
                  {editingCotizacion ? `Cotización ${editingCotizacion.numero}` : 'Cotización'}
                </span>
              </h2>
            </div>
            <div className="bg-red-600 px-2.5 py-0.5 rounded text-xs font-black tracking-wider mr-8">V2.0 PRO</div>
          </div>

          {/* Datos del cliente + Detalles cotización */}
          <div className="bg-white border-b border-slate-200 grid grid-cols-12">
            {/* Izq: cliente */}
            <div className="col-span-8 p-2.5 border-r border-slate-200">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-black uppercase text-slate-700 tracking-wider">Datos del cliente</span>
                <span className="text-[10px] text-slate-400 italic">TECLA F3 PARA BUSCAR</span>
              </div>
              <div className="grid grid-cols-12 gap-x-3 gap-y-1.5 items-center text-xs">
                <Label className="col-span-2 text-[11px] font-bold text-slate-500 uppercase text-right">Cliente:</Label>
                <div className="col-span-7">
                  <Button variant="outline" className="w-full h-7 justify-start text-left font-normal text-xs border-slate-300" onClick={() => setIsClienteSearchOpen(true)}>
                    <Search className="mr-2 h-3 w-3" />
                    {cliente?.nombre || "Seleccionar Cliente"}
                  </Button>
                </div>
                <div className="col-span-3">
                  {cliente?.id !== CLIENTE_GENERICO.id && (
                    <Button variant="ghost" size="sm" onClick={handleClearCliente} className="h-7 text-xs text-red-600 hover:text-red-700">
                      <UserX className="h-3 w-3 mr-1" /> Quitar
                    </Button>
                  )}
                </div>

                <Label className="col-span-2 text-[11px] font-bold text-slate-500 uppercase text-right">Nombre:</Label>
                <div className="col-span-10">
                  <Input
                    value={manualClienteNombre}
                    onChange={e => setManualClienteNombre(e.target.value)}
                    className={`h-7 text-xs border-slate-300 uppercase ${isGenericClient ? 'bg-yellow-50' : 'bg-slate-50 opacity-70'}`}
                    placeholder={isGenericClient ? 'ESCRIBA NOMBRE O VEHICULO DEL CLIENTE...' : 'SOLO PARA CLIENTE GENERICO'}
                    disabled={!isGenericClient}
                  />
                </div>

                <Label className="col-span-2 text-[11px] font-bold text-slate-500 uppercase text-right">RNC:</Label>
                <div className="col-span-10">
                  <Input readOnly value={cliente?.rnc || '000000000'} className="h-7 bg-slate-50 border-slate-300 text-xs font-mono" />
                </div>
              </div>
            </div>

            {/* Der: detalles cotización */}
            <div className="col-span-4 p-2.5 bg-slate-50/50">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-black uppercase text-slate-700 tracking-wider">Detalles Cotización</span>
                <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded font-black">Nº {editingCotizacion?.numero || 'NUEVA'}</span>
              </div>
              <div className="grid grid-cols-12 gap-x-2 gap-y-1.5 items-center">
                <Label className="col-span-3 text-[11px] font-bold text-slate-500 uppercase text-right">Vendedor:</Label>
                <div className="col-span-9">
                  <select
                    value={vendedorId}
                    onChange={e => setVendedorId(e.target.value)}
                    className="w-full h-7 px-2 text-xs border border-slate-300 rounded-md"
                  >
                    <option value="">Seleccione...</option>
                    {vendedores.map(v => (
                      <option key={v.id} value={v.id}>{v.nombre}</option>
                    ))}
                  </select>
                </div>
                <Label className="col-span-3 text-[11px] font-bold text-slate-500 uppercase text-right">Fecha:</Label>
                <div className="col-span-9">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full h-7 justify-start text-left font-normal text-xs border-slate-300">
                        {format(fechaCotizacion, 'dd/MM/yyyy')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={fechaCotizacion} onSelect={setFechaCotizacion} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
                <Label className="col-span-3 text-[11px] font-bold text-slate-500 uppercase text-right">Vence:</Label>
                <div className="col-span-9">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full h-7 justify-start text-left font-normal text-xs border-slate-300">
                        {format(fechaVencimiento, 'dd/MM/yyyy')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={fechaVencimiento} onSelect={setFechaVencimiento} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
          </div>

          {/* Tabla compacta */}
          <div className="flex-grow overflow-hidden bg-white">
            <div className="h-full overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-slate-100 z-20 shadow-sm">
                  <TableRow className="border-b-2 border-slate-300 hover:bg-transparent">
                    <TableHead className="text-[11px] font-black uppercase text-slate-700 py-1.5 px-2 h-8 w-[140px]">
                      <div className="flex items-center gap-1.5">
                        Código
                        <Button variant="ghost" size="icon" onClick={() => setIsProductSearchOpen(true)} className="h-5 w-5 text-blue-600 hover:bg-blue-100" title="Buscar">
                          <Search className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableHead>
                    <TableHead className="text-[11px] font-black uppercase text-slate-700 py-1.5 px-2">Descripción</TableHead>
                    <TableHead className="text-[11px] font-black uppercase text-slate-700 py-1.5 px-2 text-center w-16">Cant.</TableHead>
                    <TableHead className="text-[11px] font-black uppercase text-slate-700 py-1.5 px-2 text-right w-24">Precio</TableHead>
                    <TableHead className="text-[11px] font-black uppercase text-slate-700 py-1.5 px-2 text-right w-20">Desc. $</TableHead>
                    <TableHead className="text-[11px] font-black uppercase text-slate-700 py-1.5 px-2 text-right w-24">Importe</TableHead>
                    <TableHead className="w-12 py-1.5" />
                  </TableRow>
                  {/* Staging row */}
                  <TableRow className="bg-[#ffffbf] border-b-2 border-gray-600 shadow-md h-10 group">
                    <TableCell className="p-1 border-r border-gray-300">
                      <Input
                        id="cot-input-codigo"
                        placeholder="F9..."
                        value={itemCode}
                        onChange={e => setItemCode(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleAddByCode(itemCode);
                          if (e.key === 'F9') setIsProductSearchOpen(true);
                        }}
                        className="h-7 text-[11px] font-black border-blue-600 focus:ring-0 bg-white uppercase"
                      />
                    </TableCell>
                    <TableCell className="p-1 border-r border-gray-300 font-bold text-blue-900 uppercase truncate max-w-[300px] text-xs" title={currentItem?.descripcion}>
                      {currentItem?.descripcion || <span className="text-gray-400 italic">... busque por código</span>}
                    </TableCell>
                    <TableCell className="p-1 border-r border-gray-300">
                      <Input
                        id="cot-input-cantidad"
                        type="number"
                        value={currentItem?.cantidad || ''}
                        onChange={e => updateCurrentItem('cantidad', e.target.value)}
                        className="h-7 text-xs text-center font-black text-blue-900 border-blue-600 focus:ring-0 bg-white"
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            if (profile?.role === 'admin' || profile?.role === 'owner') {
                              document.getElementById('cot-input-precio')?.focus();
                            } else {
                              document.getElementById('cot-input-descuento')?.focus();
                            }
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell className="p-1 border-r border-gray-300">
                      <MoneyInput
                        id="cot-input-precio"
                        value={currentItem?.precio_unitario || ''}
                        onChange={e => updateCurrentItem('precio_unitario', e.target.value)}
                        className="h-7 text-xs text-right font-black text-blue-900 border-blue-600 focus:ring-0 bg-white"
                        onKeyDown={e => { if (e.key === 'Enter') document.getElementById('cot-input-descuento')?.focus(); }}
                        disabled={profile?.role !== 'admin' && profile?.role !== 'owner'}
                      />
                    </TableCell>
                    <TableCell className="p-1 border-r border-gray-300">
                      <Input
                        id="cot-input-descuento"
                        type="number"
                        value={currentItem?.descuento_pct || ''}
                        onChange={e => updateCurrentItem('descuento_pct', e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitCurrentItem(); setTimeout(() => document.getElementById('cot-input-codigo')?.focus(), 50); } }}
                        className="h-7 text-xs text-center font-black text-red-600 border-blue-600 focus:ring-0 bg-white"
                      />
                    </TableCell>
                    <TableCell className="p-1 text-right font-black text-blue-800 bg-blue-50/30 border-r border-gray-300">
                      {currentItem ? Number((currentItem.cantidad * currentItem.precio_unitario) * (1 - (currentItem.descuento_pct || 0) / 100)).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                    </TableCell>
                    <TableCell className="p-1 text-center">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:bg-green-50" onClick={commitCurrentItem}><PlusCircle className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs">
                  {articulos.length > 0 ? articulos.map((item, index) => {
                    const importeBruto = (item.cantidad || 0) * (item.precio_unitario || 0);
                    const itemDescuento = importeBruto * ((item.descuento_pct || 0) / 100);
                    const importeFinal = importeBruto - itemDescuento;
                    return (
                      <TableRow key={index} className={`group hover:bg-blue-50/40 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                        <TableCell className="font-mono text-xs font-bold text-slate-800 py-1 px-2">{item.codigo}</TableCell>
                        <TableCell className="text-xs font-medium text-slate-700 py-1 px-2">{item.descripcion}</TableCell>
                        <TableCell className="py-1 px-1">
                          <Input type="number" value={item.cantidad || 0} onChange={e => handleUpdateArticle(index, 'cantidad', e.target.value)} className="h-6 text-xs text-center border-slate-200 focus:border-blue-400 font-bold px-1" />
                        </TableCell>
                        <TableCell className="py-1 px-1">
                          <MoneyInput
                            value={item.precio_unitario || 0}
                            onChange={e => handleUpdateArticle(index, 'precio_unitario', e.target.value)}
                            className="h-6 text-xs text-right border-slate-200 focus:border-blue-400 font-bold px-1"
                            disabled={profile?.role !== 'admin' && profile?.role !== 'owner'}
                          />
                        </TableCell>
                        <TableCell className="py-1 px-1">
                          <MoneyInput
                            value={Number(itemDescuento || 0)}
                            onChange={e => handleUpdateArticle(index, 'descuento_valor', e.target.value)}
                            className="h-6 text-xs text-right border-slate-200 focus:border-blue-400 font-bold text-red-600 px-1"
                          />
                        </TableCell>
                        <TableCell className="text-right font-bold text-blue-700 py-1 px-2">{Number(importeFinal || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                        <TableCell className="py-1 px-1">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 text-blue-600 disabled:opacity-30 disabled:text-gray-400"
                              disabled={!item.imagen_url}
                              title={item.imagen_url ? "Compartir Imagen" : "Sin imagen"}
                              onClick={() => handleShareImage(item)}
                            >
                              <Share2 className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-5 w-5 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleRemoveArticle(index)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }) : (
                    <TableRow>
                      <TableCell colSpan="7" className="text-center h-32 text-muted-foreground italic">
                        Agregue artículos a la cotización.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Footer 3 columnas: Notas | Resumen | Total */}
          <div className="border-t-2 border-slate-300 bg-white">
            <div className="grid grid-cols-12 divide-x divide-slate-200">
              {/* Col 1: Notas */}
              <div className="col-span-5 px-2 py-1.5 flex items-start gap-1.5">
                <Tags className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-1" />
                <div className="flex-1">
                  <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Notas y comentarios</Label>
                  <Textarea
                    value={notas}
                    onChange={e => setNotas(e.target.value)}
                    className="mt-0.5 h-[52px] min-h-0 text-xs border-slate-200 resize-none py-1"
                    placeholder="Condiciones de pago, tiempo de entrega, etc."
                  />
                </div>
              </div>

              {/* Col 2: Resumen */}
              <div className="col-span-4 px-3 py-1.5 bg-slate-50/40">
                <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider block">Resumen</Label>
                <div className="space-y-0.5 text-sm mt-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-700 uppercase tracking-wide text-xs">Sub-total</span>
                    <span className="font-mono font-bold text-emerald-700">{Number(totals.subtotal || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-600 uppercase tracking-wide text-xs">Descuento</span>
                    <span className="font-mono text-red-600">{Number(totals.descuento_total || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-600 uppercase tracking-wide text-xs">Total ITBIS</span>
                    <span className="font-mono">{Number(totals.itbis_total || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              {/* Col 3: TOTAL */}
              <div className="col-span-3 px-2 py-1.5 bg-red-50/30 flex flex-col items-center justify-center">
                <span className="text-xs font-black text-red-600 uppercase tracking-widest">Total Cotización</span>
                <span className="font-mono font-black text-red-600 text-3xl tracking-tight leading-none mt-0.5">
                  {Number(totals.total_cotizacion || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Fila botones */}
            <div className="bg-slate-100 border-t border-slate-300 px-3 py-1.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Checkbox id="imprimir" checked={imprimir} onCheckedChange={setImprimir} />
                <Label htmlFor="imprimir" className="text-xs">Imprimir al guardar</Label>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={onClose} className="h-9 px-4 border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-200">
                  <X className="w-4 h-4 mr-1.5" /> ESC - Salir
                </Button>
                <Button onClick={handleSubmit} disabled={isSubmitting} className="h-9 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-md">
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><FileDown className="w-4 h-4 mr-1.5" /> F10 - {editingCotizacion ? 'Actualizar' : 'Guardar'}</>}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ProductSearchModal isOpen={isProductSearchOpen} onClose={() => setIsProductSearchOpen(false)} onSelectProduct={handleSelectProduct} sessionKey={modalSessionKey} />
      <ClienteSearchModal isOpen={isClienteSearchOpen} onClose={() => setIsClienteSearchOpen(false)} onSelectCliente={handleSelectCliente} />
    </>
  );
};
export default CotizacionFormModal;
