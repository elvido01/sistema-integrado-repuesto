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
import { Save, X, Loader2, Plus, Trash2, Bot, FileDown, Search, ArrowRightCircle, ShoppingCart } from 'lucide-react';
import { addDays } from 'date-fns';
import { formatInTimeZone, getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';
import { useNavigate } from 'react-router-dom';
import { usePanels } from '@/contexts/PanelContext';
import { useCompras } from '@/contexts/ComprasContext';
import ProductSearchModal from '@/components/ventas/ProductSearchModal';
import SuplidorSearchModal from '@/components/compras/SuplidorSearchModal';
import { generateOrderPDF } from '@/components/common/PDFGenerator';
import { loadDraft, useAutoDraft, clearDraft } from '@/lib/drafts';

const formatDateForTable = (dateStr) => {
  if (!dateStr) return '---';
  try {
    return formatInTimeZone(dateStr, 'dd/MM/yyyy');
  } catch (e) {
    return dateStr;
  }
};

const OrdenCompraPage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { openPanel } = usePanels();
  const { setOrdenParaFacturar } = useCompras();

  // --- VIEW STATE ---
  const [view, setView] = useState('list'); // 'list' or 'form'
  const [orders, setOrders] = useState([]);
  const [selectedOrderID, setSelectedOrderID] = useState(null);
  const [isLoadingList, setIsLoadingList] = useState(false);

  // --- MODAL STATES ---
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isSuplidorModalOpen, setIsSuplidorModalOpen] = useState(false);

  // --- FILTERS STATE ---
  const [filters, setFilters] = useState({
    suplidorId: '',
    fechaDesde: formatDateForSupabase(addDays(new Date(), -30)),
    fechaHasta: formatDateForSupabase(new Date()),
    estado: 'Pendiente'
  });

  // --- FORM STATES (Existing) ---
  const [proveedores, setProveedores] = useState([]);
  const [selectedProveedor, setSelectedProveedor] = useState(null);
  const [orden, setOrden] = useState({
    numero: '',
    fecha_orden: getCurrentDateInTimeZone(),
    fecha_vencimiento: addDays(getCurrentDateInTimeZone(), 30),
    notas: '',
    aplicar_itbis: false,
    itbis_incluido: true,
    direccion_entrega: '',
  });
  const [detalles, setDetalles] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false); // Flag to skip draft clobbering

  // --- STAGING ITEM STATE (New for Form) ---
  const [stagingItem, setStagingItem] = useState({
    producto_id: '', codigo: '', descripcion: '', cantidad: 0, unidad: 'UND', precio: 0, descuento_pct: 0, itbis_pct: 0, importe: 0
  });


  const DRAFT_KEY = 'orden-compra';

  // --- DATA FETCHING (List) ---
  const fetchOrders = useCallback(async () => {
    setIsLoadingList(true);
    let query = supabase
      .from('ordenes_compra')
      .select(`
        *,
        proveedores(nombre, rnc)
      `)
      .gte('fecha_orden', filters.fechaDesde)
      .lte('fecha_orden', filters.fechaHasta)
      .order('fecha_orden', { ascending: false });

    if (filters.suplidorId) {
      query = query.eq('suplidor_id', filters.suplidorId);
    }
    if (filters.estado && filters.estado !== 'Todos') {
      query = query.eq('estado', filters.estado);
    } else {
      // Por defecto no mostrar las Recibidas
      query = query.neq('estado', 'Recibida');
    }

    const { data, error } = await query;
    setIsLoadingList(false);

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar las órdenes.' });
    } else {
      setOrders(data || []);
      if (data && data.length > 0 && !selectedOrderID) {
        setSelectedOrderID(data[0].id);
      }
    }
  }, [filters, toast, selectedOrderID]);

  useEffect(() => {
    if (view === 'list') {
      fetchOrders();
    }
  }, [view, fetchOrders]);

  // --- PREVIEW DETAILS (List) ---
  const [previewDetails, setPreviewDetails] = useState([]);
  useEffect(() => {
    const fetchPreview = async () => {
      if (!selectedOrderID) {
        setPreviewDetails([]);
        return;
      }
      const { data, error } = await supabase
        .from('ordenes_compra_detalle')
        .select('*')
        .eq('orden_compra_id', selectedOrderID);

      if (!error) setPreviewDetails(data || []);
    };
    fetchPreview();
  }, [selectedOrderID]);

  // --- FORM LOGIC (Existing) ---
  const fetchProveedores = useCallback(async () => {
    const { data, error } = await supabase
      .from('proveedores')
      .select('*')
      .eq('activo', true);
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los proveedores.' });
    } else {
      setProveedores(data);
    }
  }, [toast]);

  useEffect(() => {
    fetchProveedores();
  }, [fetchProveedores]);

  const fetchNextNumber = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_next_orden_compra_numero');
    if (error) {
      console.error('Error fetching next order number:', error);
    } else {
      setOrden(prev => ({ ...prev, numero: data }));
    }
  }, []);


  useEffect(() => {
    if (isEditMode || view !== 'form') return;

    const draft = loadDraft(DRAFT_KEY);
    if (draft) {
      if (draft.selectedProveedor) setSelectedProveedor(draft.selectedProveedor);
      if (draft.orden) {
        setOrden(prev => ({
          ...prev,
          ...draft.orden,
          fecha_orden: draft.orden.fecha_orden ? new Date(draft.orden.fecha_orden) : prev.fecha_orden,
          fecha_vencimiento: draft.orden.fecha_vencimiento ? new Date(draft.orden.fecha_vencimiento) : prev.fecha_vencimiento,
        }));
      }
      if (Array.isArray(draft.detalles)) setDetalles(draft.detalles);
    }
  }, [view, isEditMode]);

  // Separate effect for numbering to ensure it's called if needed
  useEffect(() => {
    if (view === 'form' && !isEditMode && !orden.numero) {
      fetchNextNumber();
    }
  }, [view, isEditMode, orden.numero, fetchNextNumber]);

  const handleProveedorChange = (id) => {
    const prov = proveedores.find((p) => p.id === id);
    setSelectedProveedor(prov || null);
  };

  // --- STAGING ROW HANDLERS (New) ---
  const resetStaging = () => {
    setStagingItem({
      producto_id: '', codigo: '', descripcion: '', cantidad: 0, unidad: 'UND', precio: 0, descuento_pct: 0, itbis_pct: 0, importe: 0
    });
  };

  const addStagingToDetails = () => {
    if (!stagingItem.producto_id) {
      toast({ variant: 'destructive', title: 'Error', description: 'Seleccione un producto.' });
      return;
    }
    if (detalles.find(d => d.producto_id === stagingItem.producto_id)) {
      toast({ title: 'Aviso', description: 'El producto ya está en la lista.' });
      return;
    }
    setDetalles(prev => calculateAllImportes([...prev, { ...stagingItem, id: Date.now() + Math.random() }]));
    resetStaging();
  };

  const handleSelectProduct = (product) => {
    setStagingItem({
      ...stagingItem,
      producto_id: product.id,
      codigo: product.codigo,
      descripcion: product.descripcion,
      precio: product.costo || product.precio || 0,
      itbis_pct: product.itbis_pct || 0,
      cantidad: 1
    });
    setIsSearchModalOpen(false);
  };

  // --- ACTIONS ---
  const handleNew = () => {
    setSelectedProveedor(null);
    setOrden({
      numero: '',
      fecha_orden: getCurrentDateInTimeZone(),
      fecha_vencimiento: addDays(getCurrentDateInTimeZone(), 30),
      notas: '',
      aplicar_itbis: false,
      itbis_incluido: true,
      direccion_entrega: '',
    });
    setDetalles([]);
    resetStaging();
    setIsEditMode(false);
    setView('form');
  };

  const addProductToOrder = (product) => {
    if (detalles.find((d) => d.producto_id === product.id)) {
      toast({ title: 'Producto ya agregado', description: 'Este producto ya se encuentra en la orden.' });
      return;
    }
    const itbisPct = product.itbis_pct || 0;
    const precio = product.costo || product.precio || 0;

    const newDetalle = {
      id: Date.now(),
      producto_id: product.id,
      codigo: product.codigo,
      descripcion: product.descripcion,
      cantidad: 1,
      sugerida: 1,
      unidad: 'UND',
      precio,
      descuento_pct: 0,
      itbis_pct: itbisPct,
      importe: 0,
    };

    setDetalles((prev) => calculateAllImportes([...prev, newDetalle]));
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
  };

  const calculateAllImportes = (list) => list.map((d) => ({ ...d, importe: calculateImporte(d) }));

  // Si se edita cantidad, sincronizo sugerida (manejamos un solo nÃºmero visible)
  const handleUpdateDetalle = (id, field, value) => {
    setDetalles((prev) => {
      const updated = prev.map((d) => {
        if (d.id !== id) return d;
        const patch = { ...d, [field]: value };
        if (field === 'cantidad') patch.sugerida = value;
        return patch;
      });
      return calculateAllImportes(updated);
    });
  };

  const removeDetalle = (id) => {
    setDetalles((prev) => prev.filter((d) => d.id !== id));
  };

  const handleEditDetalle = (detalle) => {
    setStagingItem({
      producto_id: detalle.producto_id,
      codigo: detalle.codigo,
      descripcion: detalle.descripcion,
      cantidad: detalle.cantidad,
      unidad: detalle.unidad,
      precio: detalle.precio,
      descuento_pct: detalle.descuento_pct,
      itbis_pct: detalle.itbis_pct,
      importe: detalle.importe
    });
    removeDetalle(detalle.id);
  };

  const handleEditOrder = async (orderId) => {
    setIsLoadingList(true);
    try {
      // 1. Fetch complete order
      const { data: orderData, error: orderError } = await supabase
        .from('ordenes_compra')
        .select('*, proveedores(*)')
        .eq('id', orderId)
        .single();

      if (orderError) throw orderError;

      // 2. Fetch details
      const { data: detailsData, error: detailsError } = await supabase
        .from('ordenes_compra_detalle')
        .select('*')
        .eq('orden_compra_id', orderId);

      if (detailsError) throw detailsError;

      // 3. Set states
      setSelectedProveedor(orderData.proveedores);
      setOrden({
        ...orderData,
        fecha_orden: new Date(orderData.fecha_orden),
        fecha_vencimiento: new Date(orderData.fecha_vencimiento)
      });
      setDetalles(detailsData.map(d => ({ ...d, id: d.id || Date.now() + Math.random() })));

      setIsEditMode(true);
      setView('form');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar la orden para editar.' });
    } finally {
      setIsLoadingList(false);
    }
  };

  const handleDeleteOrder = async (orderId) => {
    if (!confirm('¿Está seguro de que desea eliminar esta orden de compra?')) return;

    setIsLoadingList(true);
    try {
      // Deleting details first due to FK
      await supabase.from('ordenes_compra_detalle').delete().eq('orden_compra_id', orderId);
      const { error } = await supabase.from('ordenes_compra').delete().eq('id', orderId);

      if (error) throw error;

      toast({ title: 'Éxito', description: 'Orden eliminada correctamente.' });
      setOrders(prev => prev.filter(o => o.id !== orderId));
      if (selectedOrderID === orderId) setSelectedOrderID(null);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo eliminar la orden.' });
    } finally {
      setIsLoadingList(false);
    }
  };

  const handleProcessToCompra = async () => {
    const selected = orders.find(o => o.id === selectedOrderID);
    if (!selected) return;

    try {
      setIsLoadingList(true);
      // Fetch fresh details for the transfer
      const { data: detailsData, error: detailsError } = await supabase
        .from('ordenes_compra_detalle')
        .select('*')
        .eq('orden_compra_id', selectedOrderID);

      if (detailsError) throw detailsError;

      // We pass the data through context and open panel
      setOrdenParaFacturar({
        orderData: selected,
        details: detailsData
      });

      // Automatically mark as Recibida so it leaves the pending list
      await supabase
        .from('ordenes_compra')
        .update({ estado: 'Recibida' })
        .eq('id', selectedOrderID);

      // Immediately remove from the current list view to confirm it's "no longer pending"
      setOrders(prev => prev.filter(o => o.id !== selectedOrderID));
      setSelectedOrderID(null);

      openPanel('compras');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo procesar la orden para facturar.' });
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    setDetalles((prev) => calculateAllImportes(prev));
  }, [orden.aplicar_itbis]);

  const draftData = useMemo(() => ({
    selectedProveedor,
    orden: {
      ...orden,
      fecha_orden: orden.fecha_orden instanceof Date ? orden.fecha_orden.toISOString() : orden.fecha_orden,
      fecha_vencimiento: orden.fecha_vencimiento instanceof Date ? orden.fecha_vencimiento.toISOString() : orden.fecha_vencimiento,
    },
    detalles,
  }), [selectedProveedor, orden, detalles]);

  useAutoDraft(DRAFT_KEY, draftData, 400);
  const totals = useMemo(() => {
    let total_exento = 0;
    let total_gravado = 0;
    let descuento_total = 0;
    let itbis_total = 0;

    detalles.forEach((d) => {
      const cantidad = parseFloat(d.cantidad) || 0;
      const precio = parseFloat(d.precio) || 0;
      const descPct = (parseFloat(d.descuento_pct) || 0) / 100;
      const itbisPct = (parseFloat(d.itbis_pct) || 0) / 100;

      const subtotal = cantidad * precio;
      const descMonto = subtotal * descPct;
      const base = subtotal - descMonto;

      descuento_total += descMonto;

      if (itbisPct > 0 && orden.aplicar_itbis) {
        total_gravado += base;
        itbis_total += base * itbisPct;
      } else {
        total_exento += base;
      }
    });

    const total_orden = total_gravado + total_exento + itbis_total;
    return { total_exento, total_gravado, descuento_total, itbis_total, total_orden };
  }, [detalles, orden.aplicar_itbis]);

  const handleOrdenAutomatica = async () => {
    if (!selectedProveedor) {
      toast({
        variant: 'destructive',
        title: 'Seleccione un suplidor',
        description: 'Debe seleccionar un suplidor para generar una orden automÃ¡tica.',
      });
      return;
    }
    setIsGenerating(true);
    const { data, error } = await supabase.rpc('get_productos_para_orden_automatica', {
      p_suplidor_id: selectedProveedor.id,
    });
    setIsGenerating(false);

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron obtener los productos bajo stock.' });
      return;
    }
    if (!data || data.length === 0) {
      toast({ title: 'Sin productos', description: 'No hay productos bajo el stock mÃ­nimo para este suplidor.' });
      return;
    }

    const newDetalles = data.map((p) => {
      const diff = (p.max_stock || p.min_stock || 0) - (p.existencia || 0);
      const sugerida = diff > 0 ? Math.ceil(diff) : 1;
      return {
        id: Date.now() + Math.random(),
        producto_id: p.id,
        codigo: p.codigo,
        descripcion: p.descripcion,
        cantidad: sugerida,
        sugerida,
        unidad: 'UND',
        precio: p.precio || 0,
        descuento_pct: 0,
        itbis_pct: p.itbis_pct || 0,
        importe: 0,
      };
    });

    setDetalles(calculateAllImportes(newDetalles));
    toast({ title: 'Orden AutomÃ¡tica Generada', description: `${data.length} productos bajo stock fueron aÃ±adidos.` });
  };

  const handleSave = async () => {
    if (!selectedProveedor || detalles.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Datos incompletos',
        description: 'Debe seleccionar un suplidor y aÃ±adir al menos un producto.',
      });
      return;
    }
    setIsSaving(true);

    const ordenData = {
      numero: orden.numero,
      fecha_orden: formatDateForSupabase(orden.fecha_orden),
      fecha_vencimiento: formatDateForSupabase(orden.fecha_vencimiento),
      notas: orden.notas,
      aplicar_itbis: orden.aplicar_itbis,
      itbis_incluido: orden.itbis_incluido,
      suplidor_id: selectedProveedor.id,
      ...totals,
      // direccion_entrega: orden.direccion_entrega, // descomentar si existe en DB
    };

    const { data: savedOrden, error: ordenError } = await supabase
      .from('ordenes_compra')
      .insert(ordenData)
      .select()
      .single();

    if (ordenError) {
      toast({ variant: 'destructive', title: 'Error al guardar la orden', description: ordenError.message });
      setIsSaving(false);
      return;
    }

    const detallesData = detalles.map((d) => ({
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
      toast({ variant: 'destructive', title: 'Error al guardar detalles', description: detallesError.message });
    } else {
      toast({ title: 'Ã‰xito', description: 'Orden de compra guardada correctamente.' });

      generateOrderPDF(savedOrden, selectedProveedor, detalles);


      clearDraft(DRAFT_KEY);
      // Reset
      setSelectedProveedor(null);
      setOrden({
        numero: '',
        fecha_orden: getCurrentDateInTimeZone(),
        fecha_vencimiento: addDays(getCurrentDateInTimeZone(), 30),
        notas: '',
        aplicar_itbis: false,
        itbis_incluido: true,
        direccion_entrega: '',
      });
      setDetalles([]);
    }

    setIsSaving(false);
  };

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'F10') { e.preventDefault(); handleSave(); }
      if (e.key === 'Escape') { e.preventDefault(); navigate(-1); }
    },
    [navigate]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const renderListView = () => (
    <div className="flex flex-col h-full space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 bg-slate-200 border border-slate-300 rounded-sm">
        <div className="flex space-x-2">
          <Button variant="ghost" className="h-10 flex flex-col items-center px-2 py-1 text-[10px]" onClick={handleNew}>
            <Plus className="h-5 w-5 mb-0.5 text-green-600" />
            NUEVO
          </Button>
          <Button variant="ghost" className="h-10 flex flex-col items-center px-2 py-1 text-[10px]" onClick={fetchOrders}>
            <Loader2 className={`h-5 w-5 mb-0.5 text-blue-600 ${isLoadingList ? 'animate-spin' : ''}`} />
            CONSULTAR
          </Button>
          <Button variant="ghost" className="h-10 flex flex-col items-center px-2 py-1 text-[10px]" disabled={!selectedOrderID} onClick={() => {
            const current = orders.find(o => o.id === selectedOrderID);
            if (current) generateOrderPDF(current, current.proveedores, previewDetails);
          }}>
            <FileDown className="h-5 w-5 mb-0.5 text-red-600" />
            IMPRIMIR
          </Button>
          <Button variant="ghost" className="h-10 flex flex-col items-center px-2 py-1 text-[10px]" disabled={!selectedOrderID} onClick={handleProcessToCompra}>
            <ShoppingCart className="h-5 w-5 mb-0.5 text-orange-600" />
            FACTURAR
          </Button>
        </div>
        <div className="text-morla-blue font-bold text-lg mr-4">Lista de Ordenes Realizadas</div>
      </div>

      {/* Filters Area */}
      <div className="flex flex-wrap items-end gap-3 p-3 bg-white border border-slate-300 rounded-sm shadow-sm">
        <div className="flex flex-col space-y-1">
          <Label className="text-[11px] text-slate-500 font-semibold uppercase">Codigo de Suplidor</Label>
          <div className="flex items-center space-x-1">
            <Input
              className="h-7 w-32 text-xs border-slate-400"
              value={filters.suplidorId}
              onChange={(e) => setFilters({ ...filters, suplidorId: e.target.value })}
            />
            <Button variant="secondary" className="h-7 w-8 px-0" onClick={() => setIsSuplidorModalOpen(true)}>F3</Button>
          </div>
        </div>

        <div className="flex flex-col space-y-1">
          <Label className="text-[11px] text-slate-500 font-semibold uppercase">Fecha Desde</Label>
          <Input
            type="date"
            className="h-7 text-xs border-slate-400"
            value={filters.fechaDesde}
            onChange={(e) => setFilters({ ...filters, fechaDesde: e.target.value })}
          />
        </div>

        <div className="flex flex-col space-y-1">
          <Label className="text-[11px] text-slate-500 font-semibold uppercase">Fecha Hasta</Label>
          <Input
            type="date"
            className="h-7 text-xs border-slate-400"
            value={filters.fechaHasta}
            onChange={(e) => setFilters({ ...filters, fechaHasta: e.target.value })}
          />
        </div>

        <div className="flex flex-col space-y-1">
          <Label className="text-[11px] text-slate-500 font-semibold uppercase">Estatus</Label>
          <Select value={filters.estado} onValueChange={(v) => setFilters({ ...filters, estado: v })}>
            <SelectTrigger className="h-7 w-32 text-xs border-slate-400">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todos">Todos</SelectItem>
              <SelectItem value="Pendiente">Pendiente</SelectItem>
              <SelectItem value="Recibida">Recibida</SelectItem>
              <SelectItem value="Anulada">Anulada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button className="h-8 bg-morla-blue hover:bg-morla-blue/90 text-xs px-4 ml-auto" onClick={fetchOrders}>F10 - Consultar</Button>
      </div>

      {/* Main Table Area */}
      <div className="flex-1 bg-green-50/30 border border-slate-300 rounded-sm overflow-hidden flex flex-col min-h-[300px]">
        <Table className="text-[12px] border-collapse">
          <TableHeader className="bg-slate-50 sticky top-0 z-10">
            <TableRow className="h-7 hover:bg-transparent [&_th]:border-r [&_th]:border-slate-300 [&_th]:last:border-0 [&_th]:py-0 [&_th]:text-slate-700">
              <TableHead className="w-24">Fecha</TableHead>
              <TableHead className="w-24">Numero</TableHead>
              <TableHead className="w-32">Cliente</TableHead>
              <TableHead className="w-64">Nombre</TableHead>
              <TableHead>Descripcion</TableHead>
              <TableHead className="w-28 text-right">Monto</TableHead>
              <TableHead className="w-28 text-center">Estatus</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i} className="h-7 border-b border-slate-200">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <TableCell key={j} className="p-0 border-r border-slate-100 last:border-r-0 h-7" />
                  ))}
                </TableRow>
              ))
            ) : (
              orders.map((o) => (
                <TableRow
                  key={o.id}
                  className={`h-7 cursor-pointer border-b border-slate-200 transition-colors group ${selectedOrderID === o.id ? 'bg-blue-100 border-blue-400 font-bold' : 'hover:bg-slate-50'}`}
                  onClick={() => setSelectedOrderID(o.id)}
                  onDoubleClick={() => handleEditOrder(o.id)}
                >
                  <TableCell className="py-0 px-2 h-7 font-mono">{formatDateForTable(o.fecha_orden)}</TableCell>
                  <TableCell className="py-0 px-2 h-7 font-bold text-blue-800">{o.numero || '---'}</TableCell>
                  <TableCell className="py-0 px-2 h-7 font-mono text-slate-600">{o.proveedores?.rnc || ''}</TableCell>
                  <TableCell className="py-0 px-2 h-7 font-semibold truncate">{o.proveedores?.nombre || ''}</TableCell>
                  <TableCell className="py-0 px-2 h-7 italic text-slate-500 truncate">{o.notas}</TableCell>
                  <TableCell className="py-0 px-2 h-7 text-right font-bold">{o.total_orden?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="py-0 px-2 h-7 text-center text-[10px] font-bold">
                    <span className={`px-2 py-0.5 rounded-full ${o.estado === 'Recibida' ? 'bg-green-100 text-green-700' : o.estado === 'Anulada' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                      {o.estado?.toUpperCase() || 'PENDIENTE'}
                    </span>
                  </TableCell>
                  <TableCell className="py-0 px-2 h-7 text-center w-10">
                    <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); handleDeleteOrder(o.id); }}>
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Details Preview Table (Sub-table) */}
      <div className="h-64 border border-slate-300 rounded-sm overflow-auto shadow-inner bg-white">
        <Table className="text-[11px] border-collapse">
          <TableHeader className="bg-slate-100 sticky top-0 z-10">
            <TableRow className="h-6 hover:bg-transparent [&_th]:border-r [&_th]:border-slate-200 [&_th]:last:border-0 [&_th]:py-0 [&_th]:text-slate-600">
              <TableHead className="w-32">CODIGO</TableHead>
              <TableHead>DESCRIPCION</TableHead>
              <TableHead className="w-20 text-center">CANT.</TableHead>
              <TableHead className="w-20 text-center">UND</TableHead>
              <TableHead className="w-28 text-right">PRECIO</TableHead>
              <TableHead className="w-20 text-right">%Desc.</TableHead>
              <TableHead className="w-28 text-right border-r-0">IMPORTE</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {previewDetails.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i} className="h-6 border-b border-slate-100">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j} className="p-0 border-r border-slate-50 last:border-r-0 h-6" />
                  ))}
                </TableRow>
              ))
            ) : (
              previewDetails.map((pd) => (
                <TableRow key={pd.id} className="h-6 border-b border-slate-100 hover:bg-slate-50">
                  <TableCell className="py-0 px-2 h-6">{pd.codigo}</TableCell>
                  <TableCell className="py-0 px-2 h-6">{pd.descripcion}</TableCell>
                  <TableCell className="py-0 px-2 h-6 text-center">{pd.cantidad}</TableCell>
                  <TableCell className="py-0 px-2 h-6 text-center">{pd.unidad}</TableCell>
                  <TableCell className="py-0 px-2 h-6 text-right">{pd.precio?.toFixed(2)}</TableCell>
                  <TableCell className="py-0 px-2 h-6 text-right">{pd.descuento_pct}%</TableCell>
                  <TableCell className="py-0 px-2 h-6 text-right border-r-0">{pd.importe?.toFixed(2)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  const renderFormView = () => (
    <div className="bg-white p-4 rounded-sm shadow-sm border border-gray-200">
      {/* TÃ­tulo Blue Bar */}
      <div className="bg-morla-blue text-white py-1 px-4 mb-3 rounded-t-sm flex justify-between items-center shadow-md">
        <h1 className="text-sm font-bold tracking-widest uppercase">Orden de Compra</h1>
        <div className="text-[10px] font-medium opacity-80 italic">Sistema de Gestión Morla</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[28%_42%_30%] items-stretch gap-3 mb-3">
        {/* Datos de Suplidor */}
        <div className="h-full flex flex-col p-3 border border-gray-300 rounded-sm bg-white space-y-1 relative [&_label]:text-[11px] [&_input]:h-7 [&_input]:text-[12px]">
          <Label className="absolute -top-2 left-3 bg-white px-1 text-slate-500 font-bold text-[10px] uppercase">Datos de Suplidor</Label>

          <div className="flex items-center gap-2">
            <Label className="text-gray-500 w-16 text-right">Suplidor</Label>
            <div className="flex-1 flex gap-1">
              <Input value={selectedProveedor?.id || ''} className="bg-slate-50 h-7 text-center font-bold flex-1" readOnly />
              <Button variant="secondary" className="h-7 w-8 px-0" onClick={() => setIsSuplidorModalOpen(true)}>F3</Button>
            </div>
            <Label className="text-gray-500 w-10 text-right">RNC</Label>
            <Input value={selectedProveedor?.rnc || ''} className="bg-slate-50 h-7 w-32 text-center" readOnly />
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-gray-500 w-16 text-right">Nombre</Label>
            <Input value={(selectedProveedor?.nombre || '').toUpperCase()} readOnly className="bg-slate-50 font-bold flex-1" />
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-gray-500 w-16 text-right">Dirección</Label>
            <Input value={(selectedProveedor?.direccion || '').toUpperCase()} readOnly className="bg-slate-50 flex-1" />
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-gray-500 w-16 text-right">Teléfono</Label>
            <Input value={selectedProveedor?.telefono || ''} readOnly className="bg-slate-50 flex-1" />
          </div>
        </div>

        {/* Dirección de Entrega */}
        <div className="h-full flex flex-col p-3 border border-gray-300 rounded-sm bg-white space-y-2 relative [&_label]:text-[11px]">
          <Label className="absolute -top-2 left-3 bg-white px-1 text-slate-500 font-bold text-[10px] uppercase">Direccion de Entrega</Label>
          <Textarea
            rows={4}
            className="w-full flex-1 resize-none text-[12px] border-slate-300"
            value={orden.direccion_entrega}
            onChange={(e) => setOrden({ ...orden, direccion_entrega: e.target.value })}
          />
        </div>

        {/* Detalles de la Orden */}
        <div className="h-full flex flex-col p-3 border border-gray-300 rounded-sm bg-white space-y-2 relative [&_label]:text-[11px] [&_input]:h-7 [&_input]:text-[12px]">
          <Label className="absolute -top-2 left-3 bg-white px-1 text-slate-500 font-bold text-[10px] uppercase">Detalles de la Orden</Label>
          <div className="flex justify-between items-center px-1">
            <Label className="text-gray-500">NUMERO</Label>
            <Input className="w-24 text-center border-slate-400 font-bold" value={orden.numero} onChange={(e) => setOrden({ ...orden, numero: e.target.value })} />
          </div>
          <div className="flex justify-between items-center px-1">
            <Label className="text-gray-500 uppercase">Fecha</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-32 justify-end font-normal h-7 text-[12px] px-2">
                  {formatInTimeZone(orden.fecha_orden, 'dd/MM/yyyy')}
                  <Plus className="ml-2 h-3 w-3 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={orden.fecha_orden} onSelect={(d) => setOrden({ ...orden, fecha_orden: d })} /></PopoverContent>
            </Popover>
          </div>
          <div className="flex justify-between items-center px-1">
            <Label className="text-gray-500 uppercase">Vence</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-32 justify-end font-normal h-7 text-[12px] px-2">
                  {formatInTimeZone(orden.fecha_vencimiento, 'dd/MM/yyyy')}
                  <Plus className="ml-2 h-3 w-3 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={orden.fecha_vencimiento} onSelect={(d) => setOrden({ ...orden, fecha_vencimiento: d })} /></PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* YELLOW STAGING ROW + TABLE */}
      <div className="border border-slate-300 rounded-sm overflow-hidden mb-3 shadow-sm">
        <div className="bg-yellow-100/80 p-1 flex items-center gap-1 border-b border-slate-200 shadow-sm">
          <div className="relative">
            <Input
              className="w-32 h-7 text-xs border-slate-400 bg-white pr-7"
              placeholder="Codigo"
              value={stagingItem.codigo}
              onChange={(e) => setStagingItem({ ...stagingItem, codigo: e.target.value })}
              onKeyDown={(e) => e.key === 'F3' && setIsSearchModalOpen(true)}
            />
            <Button
              variant="ghost"
              className="absolute right-0 top-0 h-7 w-7 p-0 hover:bg-transparent"
              onClick={() => setIsSearchModalOpen(true)}
            >
              <Search className="h-3 w-3 text-slate-500" />
            </Button>
          </div>
          <Input
            className="flex-1 h-7 text-xs border-slate-400 bg-slate-50 font-medium truncate"
            placeholder="Descripcion del Producto"
            value={stagingItem.descripcion}
            readOnly
          />
          <Input
            type="number"
            className="w-16 h-7 text-xs border-slate-400 bg-white text-center"
            value={stagingItem.cantidad || ''}
            onChange={(e) => setStagingItem({ ...stagingItem, cantidad: parseFloat(e.target.value) || 0 })}
          />
          <Select value={stagingItem.unidad} onValueChange={(v) => setStagingItem({ ...stagingItem, unidad: v })}>
            <SelectTrigger className="w-20 h-7 text-xs border-slate-400 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="UND">UND</SelectItem>
              <SelectItem value="CAJA">CAJA</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            className="w-24 h-7 text-xs border-slate-400 bg-white text-right"
            value={stagingItem.precio || ''}
            onChange={(e) => setStagingItem({ ...stagingItem, precio: parseFloat(e.target.value) || 0 })}
          />
          <Input
            type="number"
            className="w-16 h-7 text-xs border-slate-400 bg-white text-right"
            placeholder="%Desc"
            value={stagingItem.descuento_pct || ''}
            onChange={(e) => setStagingItem({ ...stagingItem, descuento_pct: parseFloat(e.target.value) || 0 })}
          />
          <Button className="h-7 px-3 bg-morla-blue text-white" onClick={addStagingToDetails}>Ok</Button>
          <Button variant="ghost" className="h-7 w-7 p-0" onClick={() => setIsSearchModalOpen(true)}><Bot className="h-4 w-4" /></Button>
          <Button variant="outline" className="h-7 w-7 p-0 text-red-600" onClick={resetStaging}><X className="h-4 w-4" /></Button>
        </div>

        <div className="max-h-[350px] overflow-y-auto">
          <Table className="text-[12px]">
            <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
              <TableRow className="[&_th]:py-1.5 [&_th]:text-slate-600 uppercase text-[11px]">
                <TableHead className="w-32">Codigo</TableHead>
                <TableHead>Descripcion</TableHead>
                <TableHead className="w-24 text-center">Cant.</TableHead>
                <TableHead className="w-20 text-center">UND</TableHead>
                <TableHead className="w-28 text-right">Precio</TableHead>
                <TableHead className="w-20 text-right">Desc.</TableHead>
                <TableHead className="w-24 text-right">ITBIS</TableHead>
                <TableHead className="w-32 text-right">Importe</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {detalles.length === 0 ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i} className="h-7 border-b border-slate-100">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <TableCell key={j} className="p-0 border-r border-slate-50 last:border-r-0 h-7" />
                    ))}
                  </TableRow>
                ))
              ) : (
                detalles.map((d) => (
                  <TableRow
                    key={d.id}
                    className="h-7 border-b border-slate-100 hover:bg-blue-50 cursor-pointer transition-colors group"
                    onDoubleClick={() => handleEditDetalle(d)}
                  >
                    <TableCell className="py-0 px-2 text-slate-700 font-medium">{d.codigo}</TableCell>
                    <TableCell className="py-0 px-2 uppercase truncate max-w-[300px]">{d.descripcion}</TableCell>
                    <TableCell className="py-0 px-2 text-center text-blue-700 font-bold select-none">{d.cantidad} {d.unidad}</TableCell>
                    <TableCell className="py-0 px-2 text-center text-slate-500 lowercase">{d.unidad}</TableCell>
                    <TableCell className="py-0 px-2 text-right font-mono">{d.precio?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="py-0 px-2 text-right text-slate-500">{d.descuento_pct}%</TableCell>
                    <TableCell className="py-0 px-2 text-right text-slate-500 text-[10px]">{((d.itbis_pct / 100) * d.precio * d.cantidad).toFixed(2)}</TableCell>
                    <TableCell className="py-0 px-2 text-right font-bold text-slate-800">{d.importe?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="py-0 px-1 text-center">
                      <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeDetalle(d.id)}>
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Footer Area */}
      <div className="grid grid-cols-1 md:grid-cols-[70%_30%] gap-4 mt-2">
        <div className="space-y-3">
          <div className="relative">
            <Label className="absolute -top-2 left-3 bg-white px-1 text-slate-500 font-bold text-[10px] uppercase">Notas / Comentario</Label>
            <Textarea value={orden.notas} onChange={(e) => setOrden({ ...orden, notas: e.target.value })} rows={4} className="border-slate-300 shadow-inner" />
          </div>
          <div className="flex gap-2">
            <Button className="bg-slate-800 text-white hover:bg-slate-700" onClick={handleOrdenAutomatica} disabled={!selectedProveedor || isGenerating}>
              {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4 text-green-400" />}
              ORDEN AUTOMATICA
            </Button>
          </div>
        </div>

        <div className="p-3 border border-slate-300 rounded-sm bg-slate-50/50 space-y-2 relative shadow-md">
          <div className="flex flex-col space-y-1.5 mb-2 border-b border-slate-200 pb-2">
            <div className="flex items-center space-x-2">
              <Checkbox id="f-itbis" checked={orden.aplicar_itbis} onCheckedChange={(c) => setOrden({ ...orden, aplicar_itbis: !!c })} />
              <Label htmlFor="f-itbis" className="text-xs font-medium">Aplicar ITBIS</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="f-incluido" checked={orden.itbis_incluido} onCheckedChange={(c) => setOrden({ ...orden, itbis_incluido: !!c })} />
              <Label htmlFor="f-incluido" className="text-xs font-medium">ITBIS incluido?</Label>
            </div>
          </div>

          <div className="flex flex-col space-y-0.5 text-[12px]">
            <div className="flex justify-between text-slate-600"><span>Total Exento</span><span className="font-bold">{totals.total_exento.toLocaleString()}</span></div>
            <div className="flex justify-between text-slate-600"><span>Total Gravado</span><span className="font-bold">{totals.total_gravado.toLocaleString()}</span></div>
            <div className="flex justify-between text-slate-600"><span>Descuento</span><span className="font-bold text-red-600">{totals.descuento_total.toLocaleString()}</span></div>
            <div className="flex justify-between text-slate-600 border-b border-slate-200 pb-1.5"><span>ITBIS</span><span className="font-bold">{totals.itbis_total.toLocaleString()}</span></div>
            <div className="flex justify-between items-center bg-yellow-50 p-2 mt-1 border border-yellow-200 rounded-sm">
              <span className="text-morla-blue font-bold text-xl">TOTAL</span>
              <span className="text-red-700 font-bold text-2xl tracking-tighter">{totals.total_orden.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>

          <div className="pt-2 flex flex-col space-y-1">
            <Label className="text-[10px] text-slate-500 uppercase font-bold">Imprimir en</Label>
            <Select defaultValue="normal">
              <SelectTrigger className="h-7 text-xs border-slate-400"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="normal">8.5 Pulgadas (Papel Normal)</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="mt-4 flex justify-end gap-3 border-t border-slate-200 pt-3">
        <Button variant="outline" className="h-9 px-6 text-xs uppercase font-bold border-slate-400 hover:bg-slate-50" onClick={() => clearDraft(DRAFT_KEY)}>F12 - Limpiar</Button>
        <Button variant="outline" className="h-9 px-6 text-xs uppercase font-bold border-slate-400 hover:bg-slate-50" onClick={() => setView('list')} disabled={isSaving}>ESC - Retornar</Button>
        <Button className="h-9 px-8 bg-morla-blue hover:bg-morla-blue/90 text-white text-xs uppercase font-bold shadow-lg" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} F10 - Continuar
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <Helmet><title>Orden de Compra - Repuestos Morla</title></Helmet>

      <ProductSearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        onSelectProduct={handleSelectProduct}
      />

      <SuplidorSearchModal
        isOpen={isSuplidorModalOpen}
        onClose={() => setIsSuplidorModalOpen(false)}
        onSelectSuplidor={(s) => {
          if (view === 'list') {
            setFilters({ ...filters, suplidorId: s.id });
          } else {
            handleProveedorChange(s.id);
          }
          setIsSuplidorModalOpen(false);
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-3 bg-slate-100 min-h-screen font-sans selection:bg-blue-100"
      >
        {(view === 'list') ? renderListView() : renderFormView()}
      </motion.div>
    </>
  );
};

export default OrdenCompraPage;

