import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { Save, X, Loader2, Plus, Trash2, Bot, FileDown, Search, ArrowRightCircle, ShoppingCart, PackageX, Wallet } from 'lucide-react';
import { addDays } from 'date-fns';
import { formatInTimeZone, getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';
import { useNavigate } from 'react-router-dom';
import { usePanels } from '@/contexts/PanelContext';
import { useCompras } from '@/contexts/ComprasContext';
import ProductSearchModal from '@/components/ventas/ProductSearchModal';
import SuplidorSearchModal from '@/components/compras/SuplidorSearchModal';
// import AgenteCambioSuplidor from '@/components/compras/AgenteCambioSuplidor'; // desactivado temporalmente
import SuplidorVirtualMenu from '@/components/compras/SuplidorVirtualMenu';
import CompraInteligentePanel from '@/components/compras/CompraInteligentePanel';
import { getPresupuestoCompras, analizarOrdenActual } from '@/services/comprasInteligentesService';
import SuplidorVirtualPage from '@/pages/SuplidorVirtualPage';
import { generateOrderPDF } from '@/components/common/PDFGenerator';
import { printOrdenCompraPOS } from '@/lib/printPOS';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { loadDraft, useAutoDraft, clearDraft } from '@/lib/drafts';
import { useCatalogData } from '@/hooks/useSupabase';
import { onProveedoresActualizado, onInventarioActualizado } from '@/lib/catalogEvents';

const CAMINERO_MOTORS_TENANT = 'b39506c3-27dc-467d-830b-096731b83113';

const normalizeTaxRate = (value) => {
  const raw = parseFloat(value) || 0;
  return raw > 1 ? raw / 100 : raw;
};

const getDetalleBase = (detalle) => {
  const cantidad = parseFloat(detalle.cantidad) || 0;
  const precio = parseFloat(detalle.precio) || 0;
  const descuento = parseFloat(detalle.descuento_pct) || 0;
  const subtotal = cantidad * precio;
  return subtotal - (subtotal * (descuento / 100));
};

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
  const { empresa, tenantId } = useAuth();
  const navigate = useNavigate();
  const { openPanel } = usePanels();
  const { setOrdenParaFacturar } = useCompras();
  const isVehicleDealer = tenantId === CAMINERO_MOTORS_TENANT;
  const { marcas: catalogMarcas = [], modelos: catalogModelos = [] } = useCatalogData() ?? {};

  // --- VIEW STATE ---
  const [view, setView] = useState('list'); // 'list' | 'form' | 'suplidor-virtual'
  const [supVirtPendingCount, setSupVirtPendingCount] = useState(0);
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
  // Menú contextual "Suplidor Virtual" (clic derecho en línea de detalle)
  const [supVirtMenu, setSupVirtMenu] = useState(null);
  const [orden, setOrden] = useState({
    numero: '',
    fecha_orden: getCurrentDateInTimeZone(),
    fecha_vencimiento: addDays(getCurrentDateInTimeZone(), 30),
    notas: '',
    aplicar_itbis: true,
    itbis_incluido: true,
    direccion_entrega: '',
  });
  const [detalles, setDetalles] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showInteligente, setShowInteligente] = useState(false);
  const [sugerenciaCompra, setSugerenciaCompra] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false); // Flag to skip draft clobbering
  const [printMethod, setPrintMethod] = useState('pos');
  const [paperSize, setPaperSize] = useState('4inch');

  // --- STAGING ITEM STATE (New for Form) ---
  const [stagingItem, setStagingItem] = useState({
    producto_id: '', codigo: '', descripcion: '', cantidad: 0, unidad: 'UND', precio: 0, descuento_pct: 0, itbis_pct: 0, importe: 0, existencia: 0,
    // Vehicle dealer fields
    marca_nombre: '', modelo_nombre: '', anio: new Date().getFullYear(), color: ''
  });
  const [editingDetalleId, setEditingDetalleId] = useState(null);


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

    // Mostrar solo las últimas 6 órdenes guardadas (las más recientes).
    query = query.limit(6);

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

  // Contador de items pendientes en Suplidor Virtual (badge en toolbar)
  useEffect(() => {
    if (!tenantId || view !== 'list') return;
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from('suplidor_virtual_items')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('estado', 'pendiente')
        .gt('expira_at', new Date().toISOString());
      if (!cancelled) setSupVirtPendingCount(count || 0);
    })();
    return () => { cancelled = true; };
  }, [tenantId, view]);

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

  // Refrescar cuando otro módulo crea/edita/elimina un suplidor, sin remontar el panel.
  useEffect(() => onProveedoresActualizado(fetchProveedores), [fetchProveedores]);

  // Mantener una referencia a los detalles actuales para el listener de inventario,
  // que se registra una sola vez y no debe quedar atado a un closure viejo.
  const detallesRef = useRef(detalles);
  useEffect(() => { detallesRef.current = detalles; }, [detalles]);

  // Cuando se registra una venta en otro panel (baja el stock), re-consultar la
  // existencia real de los productos ya cargados en la orden para que la columna
  // "Existencia" no quede desactualizada.
  useEffect(() => onInventarioActualizado(async () => {
    const current = detallesRef.current;
    if (!current || current.length === 0) return;
    const refreshed = await Promise.all(current.map(async (d) => {
      if (!d.producto_id) return d;
      const { data: stockVal } = await supabase.rpc('get_stock_actual', { producto_uuid: d.producto_id });
      return { ...d, existencia: stockVal ?? 0 };
    }));
    setDetalles(refreshed);
  }), []);

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
      producto_id: '', codigo: '', descripcion: '', cantidad: 0, unidad: 'UND', precio: 0, descuento_pct: 0, itbis_pct: 0, importe: 0, existencia: 0,
      marca_nombre: '', modelo_nombre: '', anio: new Date().getFullYear(), color: ''
    });
    setEditingDetalleId(null);
    // Devolver el foco al campo de código para seguir capturando productos.
    setTimeout(() => {
      document.getElementById('staging-codigo-input')?.focus();
    }, 50);
  };

  const addStagingToDetails = () => {
    if (isVehicleDealer) {
      // Para dealers de vehículos: validar marca y modelo
      if (!stagingItem.marca_nombre || !stagingItem.modelo_nombre) {
        toast({ variant: 'destructive', title: 'Error', description: 'Seleccione marca y modelo.' });
        return;
      }
      // Auto-generar descripcion y codigo basados en marca/modelo/color/año
      const desc = `${stagingItem.marca_nombre} ${stagingItem.modelo_nombre} ${stagingItem.anio || ''} ${stagingItem.color || ''}`.trim().toUpperCase();
      const autoCode = `${stagingItem.marca_nombre}-${stagingItem.modelo_nombre}`.toUpperCase().replace(/\s+/g, '');
      stagingItem.descripcion = desc;
      stagingItem.codigo = autoCode;
    } else {
      if (!stagingItem.producto_id && !stagingItem.codigo) {
        toast({ variant: 'destructive', title: 'Error', description: 'Seleccione un producto.' });
        return;
      }
    }

    // Mode: editing an existing item in-place
    if (editingDetalleId) {
      setDetalles(prev => {
        const updated = prev.map(d => d.id === editingDetalleId ? { ...d, ...stagingItem, id: d.id } : d);
        return calculateAllImportes(updated);
      });
      resetStaging();
      return;
    }

    // Mode: adding new — check duplicates
    if (!isVehicleDealer) {
      const existingIndex = detalles.findIndex(d =>
        (stagingItem.producto_id && d.producto_id === stagingItem.producto_id) ||
        (stagingItem.codigo && d.codigo === stagingItem.codigo)
      );
      if (existingIndex >= 0) {
        setDetalles(prev => {
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            cantidad: (parseFloat(updated[existingIndex].cantidad) || 0) + (parseFloat(stagingItem.cantidad) || 1)
          };
          return calculateAllImportes(updated);
        });
        toast({ title: 'Cantidad actualizada', description: `Se sumó la cantidad al producto ${stagingItem.codigo} existente.` });
        resetStaging();
        return;
      }
    }
    setDetalles(prev => calculateAllImportes([...prev, { ...stagingItem, id: Date.now() + Math.random() }]));
    resetStaging();
  };

  // Calcular existencia por marca/modelo/color para dealers de vehículos
  const fetchVehicleStock = useCallback(async (marca, modelo, color) => {
    if (!marca || !modelo) return 0;
    try {
      let query = supabase.from('productos').select('id', { count: 'exact', head: true });
      // Buscar por descripcion que contenga marca y modelo
      query = query.ilike('descripcion', `%${marca}%`).ilike('descripcion', `%${modelo}%`);
      if (color) query = query.ilike('descripcion', `%${color}%`);
      const { count } = await query;
      return count || 0;
    } catch { return 0; }
  }, []);

  const handleSelectProduct = (product) => {
    setStagingItem({
      ...stagingItem,
      producto_id: product.id,
      codigo: product.codigo,
      descripcion: product.descripcion,
      precio: product.costo || product.precio || 0,
      itbis_pct: product.itbis_pct || 0,
      cantidad: 1,
      existencia: product.existencia ?? 0
    });
    setIsSearchModalOpen(false);
  };

  // Busca un producto por código exacto y lo carga al staging.
  // Si no encuentra coincidencia exacta, abre el modal de búsqueda.
  const lookupProductByCode = async (codigo) => {
    const code = (codigo || '').trim();
    if (!code) return;
    try {
      const { data, error } = await supabase
        .from('productos')
        .select('id, codigo, descripcion, costo, precio, itbis_pct')
        .ilike('codigo', code)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        // Obtener existencia real desde la RPC (productos no almacena existencia).
        const { data: stockVal } = await supabase.rpc('get_stock_actual', { producto_uuid: data.id });
        handleSelectProduct({ ...data, existencia: stockVal || 0 });
        // Mover foco al campo de cantidad después de cargar
        setTimeout(() => {
          document.getElementById('staging-cantidad-input')?.focus();
        }, 50);
      } else {
        toast({ variant: 'destructive', title: 'Producto no encontrado', description: `No existe un producto con código "${code}".` });
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message || 'No se pudo buscar el producto.' });
    }
  };

  // --- ACTIONS ---
  const handleNew = () => {
    clearDraft(DRAFT_KEY);
    setSelectedProveedor(null);
    setOrden({
      numero: '',
      fecha_orden: getCurrentDateInTimeZone(),
      fecha_vencimiento: addDays(getCurrentDateInTimeZone(), 30),
      notas: '',
      aplicar_itbis: true,
      itbis_incluido: true,
      direccion_entrega: '',
    });
    setDetalles([]);
    resetStaging();
    setIsEditMode(false);
    setView('form');
  };

  const addProductToOrder = (product) => {
    // Verificar duplicados por producto_id O por código
    if (detalles.find((d) => d.producto_id === product.id || d.codigo === product.codigo)) {
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
      existencia: product.existencia ?? 0,
    };

    setDetalles((prev) => calculateAllImportes([...prev, newDetalle]));
  };

  const calculateImporte = (detalle) => {
    const itbisPct = normalizeTaxRate(detalle.itbis_pct);
    const baseItbis = getDetalleBase(detalle);
    const montoItbis = orden.aplicar_itbis ? baseItbis * itbisPct : 0;

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
    // If there's already an item being edited, commit it back first
    if (editingDetalleId && stagingItem.producto_id) {
      setDetalles(prev => {
        const updated = prev.map(d => d.id === editingDetalleId ? { ...d, ...stagingItem, id: d.id } : d);
        return calculateAllImportes(updated);
      });
    }

    // Copy to staging for editing — item stays in the list
    setEditingDetalleId(detalle.id);
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

      // 3. Enrich details with current product stock (existencia)
      let enhancedDetails = detailsData;
      if (detailsData.length > 0) {
        enhancedDetails = await Promise.all(detailsData.map(async (detail) => {
          // Call the same function the product search modal uses internally
          const { data: stockVal } = await supabase.rpc('get_stock_actual', { producto_uuid: detail.producto_id });
          return {
            ...detail,
            existencia: stockVal || 0
          };
        }));
      }

      // 4. Set states
      setSelectedProveedor(orderData.proveedores);
      setOrden({
        ...orderData,
        numero: orderData.numero || '',
        notas: orderData.notas || '',
        direccion_entrega: orderData.direccion_entrega || '',
        fecha_orden: orderData.fecha_orden ? new Date(orderData.fecha_orden + 'T00:00:00') : new Date(),
        fecha_vencimiento: orderData.fecha_vencimiento ? new Date(orderData.fecha_vencimiento + 'T00:00:00') : new Date()
      });
      setDetalles(enhancedDetails.map(d => ({ ...d, id: d.id || Date.now() + Math.random() })));

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
      const itbisPct = normalizeTaxRate(d.itbis_pct);

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

    // Deduplicar resultados de la RPC (puede devolver el mismo producto más de una vez)
    const uniqueData = data.filter((p, index, self) =>
      index === self.findIndex(x => x.id === p.id)
    );

    const newDetalles = uniqueData
      .filter(p => !detalles.find(d => d.producto_id === p.id || d.codigo === p.codigo))
      .map((p) => {
        // Usar la cantidad sugerida calculada por el backend (max_stock - existencia)
        const sugerida = p.cantidad_sugerida || Math.max(1, Math.ceil((p.max_stock || p.min_stock || 0) - (p.existencia || 0)));
        return {
          id: Date.now() + Math.random(),
          producto_id: p.id,
          codigo: p.codigo,
          descripcion: p.descripcion,
          cantidad: sugerida,
          sugerida,
          unidad: 'UND',
          precio: p.costo || p.precio || 0,  // Usar COSTO del producto, no precio de venta
          descuento_pct: 0,
          itbis_pct: p.itbis_pct || 0,
          importe: 0,
          existencia: p.existencia ?? 0,
        };
      });

    // Merge con los existentes en lugar de reemplazar
    setDetalles(prev => calculateAllImportes([...prev, ...newDetalles]));

    const totalVentas90d = uniqueData.reduce((sum, p) => sum + (p.ventas_90d || 0), 0);
    toast({ title: 'Orden Automática Generada', description: `${newDetalles.length} productos bajo stock añadidos. Ventas 90d del suplidor: ${totalVentas90d} unidades.` });
  };

  // Aplica las cantidades recomendadas por el panel de Compra Inteligente (ajustadas a la caja)
  const aplicarCompraInteligente = (items) => {
    const nuevos = items
      .filter(p => !detalles.find(d => d.producto_id === p.id || d.codigo === p.codigo))
      .map((p) => ({
        id: Date.now() + Math.random(),
        producto_id: p.id,
        codigo: p.codigo,
        descripcion: p.descripcion,
        cantidad: p.cantidad_recomendada,
        sugerida: p.cantidad_ideal,
        unidad: 'UND',
        precio: p.costo || p.precio || 0,
        descuento_pct: 0,
        itbis_pct: p.itbis_pct || 0,
        importe: 0,
        existencia: p.existencia ?? 0,
      }));
    setDetalles(prev => calculateAllImportes([...prev, ...nuevos]));
    toast({ title: 'Compra inteligente aplicada', description: `${nuevos.length} productos añadidos según tu presupuesto de caja.` });
  };

  // Calcula el monto de compra sugerido (lo urgente) para el aviso junto a los botones.
  useEffect(() => {
    let cancel = false;
    const calc = async () => {
      const conProd = (detalles || []).filter(d => d.producto_id);
      if (!selectedProveedor?.id || !tenantId || conProd.length === 0) {
        setSugerenciaCompra(null);
        return;
      }
      try {
        const [pres, analisis] = await Promise.all([
          getPresupuestoCompras(tenantId, 15, 0),
          analizarOrdenActual(conProd),
        ]);
        if (!cancel) setSugerenciaCompra({
          totalUrgente: analisis.totalUrgente,
          totalOrden: analisis.totalOrden,
          presupuesto: Number(pres?.presupuesto_sugerido || 0),
          salud: pres?.salud_caja,
        });
      } catch {
        if (!cancel) setSugerenciaCompra(null);
      }
    };
    calc();
    return () => { cancel = true; };
  }, [selectedProveedor?.id, detalles.length, tenantId]);

  const handleSave = async () => {
    if (isSaving) return;
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

    let savedOrden;
    let ordenError;

    if (isEditMode && orden.id) {
      const { data: updated, error: updateErr } = await supabase
        .from('ordenes_compra')
        .update(ordenData)
        .eq('id', orden.id)
        .select()
        .single();
      savedOrden = updated;
      ordenError = updateErr;

      if (!ordenError) {
        // Delete old details because we will re-insert them 
        await supabase.from('ordenes_compra_detalle').delete().eq('orden_compra_id', orden.id);
      }
    } else {
      let finalData = { ...ordenData };
      if (!finalData.numero) {
        const { data: nextNum } = await supabase.rpc('get_next_orden_compra_numero');
        finalData.numero = nextNum;
      }
      const { data: inserted, error: insertErr } = await supabase
        .from('ordenes_compra')
        .insert(finalData)
        .select()
        .single();
      savedOrden = inserted;
      ordenError = insertErr;
    }

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

      toast({ title: 'Éxito', description: 'Orden de compra guardada correctamente.' });

      if (printMethod === 'pos') {
        printOrdenCompraPOS(savedOrden, selectedProveedor, detallesData, paperSize);
      } else {
        generateOrderPDF(savedOrden, selectedProveedor, detallesData, empresa);
      }

      clearDraft(DRAFT_KEY);
      // Reset
      setSelectedProveedor(null);
      setIsEditMode(false);
      setOrden({
        numero: '',
        fecha_orden: getCurrentDateInTimeZone(),
        fecha_vencimiento: addDays(getCurrentDateInTimeZone(), 30),
        notas: '',
        aplicar_itbis: true,
        itbis_incluido: true,
        direccion_entrega: '',
      });
      setDetalles([]);
      setSelectedOrderID(savedOrden.id);
      setView('list');
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
            if (current) {
              if (printMethod === 'pos') {
                 printOrdenCompraPOS(current, current.proveedores, previewDetails, paperSize);
              } else {
                 generateOrderPDF(current, current.proveedores, previewDetails, empresa);
              }
            }
          }}>
            <FileDown className="h-5 w-5 mb-0.5 text-red-600" />
            IMPRIMIR
          </Button>
          <Button variant="ghost" className="h-10 flex flex-col items-center px-2 py-1 text-[10px]" disabled={!selectedOrderID} onClick={handleProcessToCompra}>
            <ShoppingCart className="h-5 w-5 mb-0.5 text-orange-600" />
            FACTURAR
          </Button>
          <Button
            variant="ghost"
            className="h-10 flex flex-col items-center px-2 py-1 text-[10px] relative"
            onClick={() => setView('suplidor-virtual')}
            title="Productos enviados al Suplidor Virtual (agotados al suplidor original)"
          >
            <PackageX className="h-5 w-5 mb-0.5 text-amber-600" />
            SUPLIDOR VIRTUAL
            {supVirtPendingCount > 0 && (
              <span className="absolute top-0 right-1 bg-amber-500 text-white text-[9px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center">
                {supVirtPendingCount > 99 ? '99+' : supVirtPendingCount}
              </span>
            )}
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
        <h1 className="text-sm font-bold tracking-widest uppercase text-white">Orden de Compra</h1>
        <div className="text-[10px] font-medium opacity-80 italic text-white">Sistema de Gestión Morla</div>
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
        {/* Staging Row - Condicional por tipo de tenant */}
        {isVehicleDealer ? (
          /* ── STAGING ROW PARA DEALER DE VEHÍCULOS ── */
          <div className="bg-yellow-100/80 p-1 flex items-center gap-1 border-b border-slate-200 shadow-sm flex-wrap">
            <Select value={stagingItem.marca_nombre} onValueChange={(v) => setStagingItem({ ...stagingItem, marca_nombre: v, modelo_nombre: '' })}>
              <SelectTrigger className="w-36 h-7 text-xs border-slate-400 bg-white"><SelectValue placeholder="Marca" /></SelectTrigger>
              <SelectContent>
                {catalogMarcas.filter(m => m.activo).sort((a,b) => a.nombre.localeCompare(b.nombre)).map(m => (
                  <SelectItem key={m.id} value={m.nombre}>{m.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stagingItem.modelo_nombre} onValueChange={(v) => setStagingItem({ ...stagingItem, modelo_nombre: v })}>
              <SelectTrigger className="w-36 h-7 text-xs border-slate-400 bg-white"><SelectValue placeholder="Modelo" /></SelectTrigger>
              <SelectContent>
                {catalogModelos
                  .filter(m => m.activo && (!stagingItem.marca_nombre || catalogMarcas.find(ma => ma.nombre === stagingItem.marca_nombre && ma.id === m.marca_id)))
                  .sort((a,b) => a.nombre.localeCompare(b.nombre))
                  .map(m => (
                    <SelectItem key={m.id} value={m.nombre}>{m.nombre}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              className="w-20 h-7 text-xs border-slate-400 bg-white text-center"
              placeholder="Año"
              value={stagingItem.anio || ''}
              onChange={(e) => setStagingItem({ ...stagingItem, anio: parseInt(e.target.value) || '' })}
            />
            <Input
              className="w-28 h-7 text-xs border-slate-400 bg-white"
              placeholder="Color"
              value={stagingItem.color || ''}
              onChange={(e) => setStagingItem({ ...stagingItem, color: e.target.value.toUpperCase() })}
            />
            <Input
              type="number"
              className="w-16 h-7 text-xs border-slate-400 bg-white text-center"
              placeholder="Cant."
              value={stagingItem.cantidad || ''}
              onChange={(e) => setStagingItem({ ...stagingItem, cantidad: parseFloat(e.target.value) || 0 })}
            />
            <Input
              type="number"
              className="w-24 h-7 text-xs border-slate-400 bg-white text-right"
              placeholder="Precio"
              value={stagingItem.precio || ''}
              onChange={(e) => setStagingItem({ ...stagingItem, precio: parseFloat(e.target.value) || 0 })}
            />
            <Button className="h-7 px-3 bg-morla-blue text-white" onClick={addStagingToDetails}>Ok</Button>
            <Button variant="outline" className="h-7 w-7 p-0 text-red-600" onClick={resetStaging}><X className="h-4 w-4" /></Button>
          </div>
        ) : (
          /* ── STAGING ROW ORIGINAL (REPUESTOS) ── */
          <div className="bg-yellow-100/80 p-1 flex items-center gap-1 border-b border-slate-200 shadow-sm">
            <div className="relative">
              <Input
                id="staging-codigo-input"
                className="w-32 h-7 text-xs border-slate-400 bg-white pr-7"
                placeholder="Codigo"
                value={stagingItem.codigo}
                onChange={(e) => setStagingItem({ ...stagingItem, codigo: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'F3') {
                    setIsSearchModalOpen(true);
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    lookupProductByCode(stagingItem.codigo);
                  }
                }}
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
              id="staging-cantidad-input"
              type="number"
              className="w-16 h-7 text-xs border-slate-400 bg-white text-center"
              value={stagingItem.cantidad || ''}
              onChange={(e) => setStagingItem({ ...stagingItem, cantidad: parseFloat(e.target.value) || 0 })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  document.getElementById('staging-ok-button')?.focus();
                }
              }}
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
            <Button id="staging-ok-button" className="h-7 px-3 bg-morla-blue text-white" onClick={addStagingToDetails}>Ok</Button>
            <Button variant="ghost" className="h-7 w-7 p-0" onClick={() => setIsSearchModalOpen(true)}><Bot className="h-4 w-4" /></Button>
            <Button variant="outline" className="h-7 w-7 p-0 text-red-600" onClick={resetStaging}><X className="h-4 w-4" /></Button>
          </div>
        )}

        <div className="max-h-[350px] overflow-y-auto">
          <Table className="text-[12px]">
            <TableHeader className="bg-slate-50 sticky top-0 z-10 shadow-sm">
              {isVehicleDealer ? (
                /* ── ENCABEZADOS DEALER VEHÍCULOS ── */
                <TableRow className="[&_th]:py-1.5 [&_th]:text-slate-600 uppercase text-[11px]">
                  <TableHead className="w-28">Marca</TableHead>
                  <TableHead className="w-32">Modelo</TableHead>
                  <TableHead className="w-16 text-center">Año</TableHead>
                  <TableHead className="w-28">Color</TableHead>
                  <TableHead className="w-20 text-center">Cant.</TableHead>
                  <TableHead className="w-20 text-center">EXIST.</TableHead>
                  <TableHead className="w-28 text-right">Precio</TableHead>
                  <TableHead className="w-24 text-right">ITBIS</TableHead>
                  <TableHead className="w-32 text-right">Importe</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              ) : (
                /* ── ENCABEZADOS ORIGINALES ── */
                <TableRow className="[&_th]:py-1.5 [&_th]:text-slate-600 uppercase text-[11px]">
                  <TableHead className="w-32">Codigo</TableHead>
                  <TableHead>Descripcion</TableHead>
                  <TableHead className="w-24 text-center">Cant.</TableHead>
                  <TableHead className="w-20 text-center">EXIST.</TableHead>
                  <TableHead className="w-28 text-right">Precio</TableHead>
                  <TableHead className="w-20 text-right">Desc.</TableHead>
                  <TableHead className="w-24 text-right">ITBIS</TableHead>
                  <TableHead className="w-32 text-right">Importe</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              )}
            </TableHeader>
            <TableBody>
              {detalles.length === 0 ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i} className="h-7 border-b border-slate-100">
                    {Array.from({ length: isVehicleDealer ? 10 : 9 }).map((_, j) => (
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
                    onContextMenu={(e) => {
                      // Clic derecho → menú "Enviar a Suplidor Virtual"
                      if (!d.producto_id) return;
                      e.preventDefault();
                      setSupVirtMenu({ detalle: d, x: e.clientX, y: e.clientY });
                    }}
                  >
                    {isVehicleDealer ? (
                      /* ── FILA DEALER VEHÍCULOS ── */
                      <>
                        <TableCell className="py-0 px-2 font-bold text-slate-700">{d.marca_nombre || '—'}</TableCell>
                        <TableCell className="py-0 px-2 font-medium">{d.modelo_nombre || '—'}</TableCell>
                        <TableCell className="py-0 px-2 text-center">{d.anio || '—'}</TableCell>
                        <TableCell className="py-0 px-2 uppercase">{d.color || '—'}</TableCell>
                        <TableCell className="py-0 px-2 text-center text-blue-700 font-bold">{d.cantidad}</TableCell>
                        <TableCell className="py-0 px-2 text-center font-bold" style={{ color: (d.existencia ?? 0) <= 0 ? '#dc2626' : '#059669' }}>{d.existencia ?? 0}</TableCell>
                        <TableCell className="py-0 px-2 text-right font-mono">{d.precio?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className="py-0 px-2 text-right text-slate-500 text-[10px]">{(orden.aplicar_itbis ? normalizeTaxRate(d.itbis_pct) * getDetalleBase(d) : 0).toFixed(2)}</TableCell>
                        <TableCell className="py-0 px-2 text-right font-bold text-slate-800">{d.importe?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                      </>
                    ) : (
                      /* ── FILA ORIGINAL ── */
                      <>
                        <TableCell className="py-0 px-2 text-slate-700 font-medium">{d.codigo}</TableCell>
                        <TableCell className="py-0 px-2 uppercase truncate max-w-[300px]">{d.descripcion}</TableCell>
                        <TableCell className="py-0 px-2 text-center text-blue-700 font-bold select-none">{d.cantidad} {d.unidad}</TableCell>
                        <TableCell className="py-0 px-2 text-center font-bold" style={{ color: (d.existencia ?? 0) <= 0 ? '#dc2626' : '#059669' }}>{d.existencia ?? 0}</TableCell>
                        <TableCell className="py-0 px-2 text-right font-mono">{d.precio?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className="py-0 px-2 text-right text-slate-500">{d.descuento_pct}%</TableCell>
                        <TableCell className="py-0 px-2 text-right text-slate-500 text-[10px]">{(orden.aplicar_itbis ? normalizeTaxRate(d.itbis_pct) * getDetalleBase(d) : 0).toFixed(2)}</TableCell>
                        <TableCell className="py-0 px-2 text-right font-bold text-slate-800">{d.importe?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                      </>
                    )}
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
          <div className="flex gap-2 flex-wrap">
            <Button className="bg-slate-800 text-white hover:bg-slate-700" onClick={handleOrdenAutomatica} disabled={!selectedProveedor || isGenerating}>
              {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4 text-green-400" />}
              ORDEN AUTOMATICA
            </Button>
            <Button className="bg-violet-600 text-white hover:bg-violet-700" onClick={() => setShowInteligente(true)} disabled={!selectedProveedor}>
              <Wallet className="mr-2 h-4 w-4" />
              COMPRA INTELIGENTE
            </Button>
            {sugerenciaCompra && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-violet-200 bg-violet-50">
                {sugerenciaCompra.totalUrgente > 0 ? (
                  <>
                    <span className="text-xs text-slate-500">💡 Compra urgente sugerida:</span>
                    <span className="font-bold text-violet-700">RD$ {sugerenciaCompra.totalUrgente.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                    <span className="text-[11px] text-slate-400">de RD$ {sugerenciaCompra.totalOrden.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                  </>
                ) : (
                  <span className="text-xs text-slate-500">💡 Sin compras urgentes por ahora · orden RD$ {sugerenciaCompra.totalOrden.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                )}
              </div>
            )}
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

        </div>
      </div>

      {/* Buttons */}
      <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-200 pt-3 flex-wrap">
        <div className="flex items-end gap-3">
          <div>
            <Label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Método Impresión</Label>
            <Select value={printMethod} onValueChange={setPrintMethod}>
              <SelectTrigger className="h-9 w-44 text-xs font-bold bg-white border-slate-400">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">📄 PDF (ESTÁNDAR)</SelectItem>
                <SelectItem value="pos">📑 POS (TÉRMICO)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {printMethod === 'pos' && (
            <div>
              <Label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Tamaño Papel</Label>
              <Select value={paperSize} onValueChange={setPaperSize}>
                <SelectTrigger className="h-9 w-44 text-xs font-bold bg-white italic border-slate-400">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="80mm">80mm (3 pulgadas)</SelectItem>
                  <SelectItem value="4inch">101.6mm (4 pulgadas)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="flex items-end gap-3">
          <Button variant="outline" className="h-9 px-6 text-xs uppercase font-bold border-slate-400 hover:bg-slate-50" onClick={() => clearDraft(DRAFT_KEY)}>F12 - Limpiar</Button>
          <Button variant="outline" className="h-9 px-6 text-xs uppercase font-bold border-slate-400 hover:bg-slate-50" onClick={() => setView('list')} disabled={isSaving}>ESC - Retornar</Button>
          <Button className="h-9 px-8 bg-morla-blue hover:bg-morla-blue/90 text-white text-xs uppercase font-bold shadow-lg" onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} F10 - Continuar
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <Helmet><title>Orden de Compra — {empresa?.nombre || 'Sistema'}</title></Helmet>

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
        {view === 'list' && renderListView()}
        {view === 'form' && renderFormView()}
        {view === 'suplidor-virtual' && (
          <SuplidorVirtualPage onBack={() => setView('list')} />
        )}
      </motion.div>

      {/* Suplidor Virtual: clic derecho en una línea del detalle */}
      <SuplidorVirtualMenu
        contextMenu={supVirtMenu}
        suplidor_actual_id={selectedProveedor?.id || null}
        orden_compra_id={selectedOrderID || null}
        onClose={() => setSupVirtMenu(null)}
        onSent={(detalleOriginal) => {
          // Saca la línea de la OC en curso
          removeDetalle(detalleOriginal.id);
          setSupVirtMenu(null);
        }}
      />

      <CompraInteligentePanel
        open={showInteligente}
        onClose={() => setShowInteligente(false)}
        suplidor={selectedProveedor}
        orderLines={detalles}
        onApply={aplicarCompraInteligente}
      />
    </>
  );
};

export default OrdenCompraPage;

