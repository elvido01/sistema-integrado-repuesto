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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Save, X, Loader2, Plus, Trash2, Bot, FileDown, Search, ArrowRightCircle, ShoppingCart, PackageX, Wallet, Brain, KeyRound, Lock, AlertTriangle, Settings as Cog } from 'lucide-react';
import { addDays } from 'date-fns';
import { formatInTimeZone, getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';
import { useNavigate } from 'react-router-dom';
import { usePanels } from '@/contexts/PanelContext';
import { useCompras } from '@/contexts/ComprasContext';
import ProductSearchModal from '@/components/ventas/ProductSearchModal';
import SuplidorSearchModal from '@/components/compras/SuplidorSearchModal';
// import AgenteCambioSuplidor from '@/components/compras/AgenteCambioSuplidor'; // desactivado temporalmente
import SuplidorVirtualMenu from '@/components/compras/SuplidorVirtualMenu';
import { getPresupuestoCompras, analizarOrdenActual, asesorCompras } from '@/services/comprasInteligentesService';

const PRIO_BADGE = {
  urgente: { txt: 'URGENTE', cls: 'bg-red-100 text-red-700' },
  proxima: { txt: 'PRÓXIMA', cls: 'bg-amber-100 text-amber-700' },
  puede_esperar: { txt: 'ESPERAR', cls: 'bg-slate-200 text-slate-600' },
};
import SuplidorVirtualPage from '@/pages/SuplidorVirtualPage';
import AprobacionesComprasPage from '@/pages/AprobacionesComprasPage';
import { generateOrderPDF } from '@/components/common/PDFGenerator';
import { printOrdenCompraPOS } from '@/lib/printPOS';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useSuscripcion } from '@/contexts/SuscripcionContext';
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
  const { empresa, tenantId, isSuperAdmin } = useAuth();
  const { planActual } = useSuscripcion();
  // Compra Inteligente = función Plus: solo planes PRO y ENTERPRISE (y super admin).
  const puedeCompraInteligente = isSuperAdmin || ['PRO', 'ENTERPRISE'].includes((planActual || '').toUpperCase());
  const navigate = useNavigate();
  const { openPanel } = usePanels();
  const { setOrdenParaFacturar } = useCompras();
  const isVehicleDealer = tenantId === CAMINERO_MOTORS_TENANT;
  const { marcas: catalogMarcas = [], modelos: catalogModelos = [] } = useCatalogData() ?? {};

  // --- VIEW STATE ---
  const [view, setView] = useState('list'); // 'list' | 'form' | 'suplidor-virtual'
  const [supVirtPendingCount, setSupVirtPendingCount] = useState(0);
  const [aprobacionesPendCount, setAprobacionesPendCount] = useState(0);
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
  const [mostrarInteligente, setMostrarInteligente] = useState(false);
  const [sugerenciaCompra, setSugerenciaCompra] = useState(null);
  const [prioridadMap, setPrioridadMap] = useState({});
  const [analisisItems, setAnalisisItems] = useState([]);
  const [presData, setPresData] = useState(null);
  const [asesor, setAsesor] = useState(null);
  const [asesorLoading, setAsesorLoading] = useState(false);

  // Fase A v2: bloqueo F10 + PIN supervisor
  const [presupuestoV2, setPresupuestoV2] = useState(null);   // { control_estricto, disponible, limite_aprobacion, ... }
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinReason, setPinReason] = useState('');
  const [pinVerifying, setPinVerifying] = useState(false);
  const [pinGateInfo, setPinGateInfo] = useState(null);        // { motivo, exceso, monto_orden, disponible, limite }

  // Fase B v2: Optimizar Compra
  const [optimizando, setOptimizando] = useState(false);
  const [previewOptim, setPreviewOptim] = useState(null);      // { items: [{ producto_id, accion, cantidad_nueva, ... }], total_antes, total_despues, ahorro }
  const [optimModalOpen, setOptimModalOpen] = useState(false);

  // Fase B v2: Info por suplidor (cuando distribuir_por = 'suplidor' o 'mixto')
  const [infoSuplidor, setInfoSuplidor] = useState(null);     // { tiene_asignacion, asignado, comprado, disponible, color }

  // Fase C v2: Workflow modal (envia a cola en vez de PIN)
  const [workflowModalOpen, setWorkflowModalOpen] = useState(false);
  const [enviandoCola, setEnviandoCola] = useState(false);

  // Equivalentes por producto (mostrados debajo de cada linea)
  const [equivalentesMap, setEquivalentesMap] = useState({});  // { producto_id: [{...}, ...] }

  // Detectar pares de productos equivalentes EN LA MISMA ORDEN
  // (potencial duplicacion de stock)
  const equivalentesDuplicados = useMemo(() => {
    if (!detalles?.length || !equivalentesMap) return [];
    const ids = new Set(detalles.filter(d => d.producto_id).map(d => d.producto_id));
    const pares = [];
    detalles.forEach(d => {
      if (!d.producto_id || !equivalentesMap[d.producto_id]) return;
      equivalentesMap[d.producto_id].forEach(eq => {
        if (ids.has(eq.producto_id) && eq.producto_id !== d.producto_id) {
          const a = d.producto_id < eq.producto_id ? d.producto_id : eq.producto_id;
          const b = d.producto_id < eq.producto_id ? eq.producto_id : d.producto_id;
          if (!pares.some(p => p.a === a && p.b === b)) {
            pares.push({ a, b, grupo_nombre: eq.grupo_nombre });
          }
        }
      });
    });
    return pares;
  }, [detalles, equivalentesMap]);

  // Cargar equivalentes de los productos en la orden
  useEffect(() => {
    let cancel = false;
    const cargarEquiv = async () => {
      const ids = Array.from(new Set(detalles.map(d => d.producto_id).filter(Boolean)));
      if (ids.length === 0) { setEquivalentesMap({}); return; }
      try {
        const results = await Promise.all(ids.map(id =>
          supabase.rpc('get_equivalentes_producto', { p_producto_id: id }).then(r => ({ id, data: r.data || [] }))
        ));
        if (cancel) return;
        const map = {};
        for (const r of results) {
          if (r.data && r.data.length > 0) map[r.id] = r.data;
        }
        setEquivalentesMap(map);
      } catch (_) {
        if (!cancel) setEquivalentesMap({});
      }
    };
    cargarEquiv();
    return () => { cancel = true; };
  }, [detalles.map(d => d.producto_id).filter(Boolean).sort().join(',')]);

  // Nuevo Producto Rapido (sin salir de la OC)
  const [quickProdModalOpen, setQuickProdModalOpen] = useState(false);
  const [quickProd, setQuickProd] = useState({
    codigo: '',
    descripcion: '',
    costo: 0,
    itbis_pct: 0,
    unidad: 'UND',
    cantidad: 1,
  });
  const [creandoProducto, setCreandoProducto] = useState(false);

  const abrirNuevoProducto = () => {
    setQuickProd({
      codigo: stagingItem.codigo || '',
      descripcion: '',
      costo: 0,
      itbis_pct: 0,
      unidad: 'UND',
      cantidad: 1,
    });
    setQuickProdModalOpen(true);
  };

  const crearProductoYAgregar = async () => {
    if (!quickProd.codigo?.trim() || !quickProd.descripcion?.trim()) {
      toast({ variant: 'destructive', title: 'Datos incompletos', description: 'Código y descripción son obligatorios.' });
      return;
    }
    setCreandoProducto(true);
    try {
      // 1. Crear el producto
      const { data: nuevo, error: prodErr } = await supabase
        .from('productos')
        .insert({
          tenant_id: tenantId,
          codigo: quickProd.codigo.trim().toUpperCase(),
          descripcion: quickProd.descripcion.trim().toUpperCase(),
          costo: Number(quickProd.costo) || 0,
          precio: Number(quickProd.costo) || 0,  // precio default = costo (se ajusta despues)
          itbis_pct: Number(quickProd.itbis_pct) || 0,
          unidad: quickProd.unidad || 'UND',
          existencia: 0,
          activo: true,
          suplidor_id: selectedProveedor?.id || null,
        })
        .select()
        .single();
      if (prodErr) throw prodErr;

      // 2. Agregar como linea a la OC actual
      const cant = Number(quickProd.cantidad) || 1;
      const itbisPct = Number(quickProd.itbis_pct) || 0;
      const precio = Number(quickProd.costo) || 0;
      setDetalles(prev => [...prev, {
        id: `new-${Date.now()}`,
        producto_id: nuevo.id,
        codigo: nuevo.codigo,
        descripcion: nuevo.descripcion,
        cantidad: cant,
        unidad: nuevo.unidad,
        precio,
        descuento_pct: 0,
        itbis_pct: itbisPct,
        importe: cant * precio,
        existencia: 0,
        _is_new_product: true,
      }]);

      toast({
        title: '✅ Producto creado y agregado',
        description: `${nuevo.codigo} — ${nuevo.descripcion}`,
      });
      setQuickProdModalOpen(false);
      // Focus de vuelta al codigo input para seguir dictando
      setTimeout(() => document.getElementById('staging-codigo-input')?.focus(), 100);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setCreandoProducto(false);
    }
  };

  // Fase A v2: modal inline de configuracion del presupuesto
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configForm, setConfigForm] = useState({
    monto_base_mensual: '',
    incremento_mensual_pct: 0,
    caja_minima: 0,
    control_estricto: false,
    workflow_aprobacion: false,
  });
  const [configPinNuevo, setConfigPinNuevo] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);

  // Cuando se abre el modal, precargamos el config actual
  const abrirConfigModal = async () => {
    setConfigModalOpen(true);
    try {
      const { data } = await supabase
        .from('presupuesto_config')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (data) {
        setConfigForm({
          monto_base_mensual: data.monto_base_mensual ?? '',
          incremento_mensual_pct: data.incremento_mensual_pct ?? 0,
          caja_minima: data.caja_minima ?? 0,
          control_estricto: !!data.control_estricto,
          workflow_aprobacion: !!data.workflow_aprobacion,
        });
      }
    } catch (_) { /* tabla puede no existir si SQL no corrido */ }
  };

  const guardarConfig = async () => {
    if (!tenantId) return;
    setSavingConfig(true);
    try {
      const payload = {
        tenant_id: tenantId,
        monto_base_mensual: configForm.monto_base_mensual === '' ? null : Number(configForm.monto_base_mensual),
        incremento_mensual_pct: Number(configForm.incremento_mensual_pct) || 0,
        caja_minima: Number(configForm.caja_minima) || 0,
        control_estricto: !!configForm.control_estricto,
        workflow_aprobacion: !!configForm.workflow_aprobacion,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('presupuesto_config').upsert(payload, { onConflict: 'tenant_id' });
      if (error) throw error;
      // Setear PIN si lo ingreso
      if (configPinNuevo && configPinNuevo.length >= 4) {
        await supabase.rpc('set_pin_supervisor', { p_pin: configPinNuevo });
        setConfigPinNuevo('');
      }
      toast({ title: '✅ Presupuesto configurado', description: 'Se aplicará a las próximas órdenes.' });
      setConfigModalOpen(false);
      refreshPresupuestoV2();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setSavingConfig(false);
    }
  };
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

  // Calcula el monto de compra sugerido (lo urgente) para el aviso junto a los botones.
  useEffect(() => {
    let cancel = false;
    const calc = async () => {
      const conProd = (detalles || []).filter(d => d.producto_id);
      if (!mostrarInteligente || !selectedProveedor?.id || !tenantId || conProd.length === 0) {
        setSugerenciaCompra(null);
        setPrioridadMap({});
        setAnalisisItems([]);
        setPresData(null);
        setAsesor(null);
        return;
      }
      try {
        // FUENTE UNICA: si hay suplidor seleccionado, usamos el RPC
        // por-suplidor (con share automatico segun movimiento 90d).
        // Si no, usamos el total del tenant.
        const presPromise = selectedProveedor?.id
          ? supabase.rpc('get_presupuesto_suplidor_auto', { p_suplidor_id: selectedProveedor.id })
          : supabase.rpc('get_presupuesto_compras_v2');

        const [presRes, analisis] = await Promise.all([
          presPromise,
          analizarOrdenActual(conProd),
        ]);
        const presRaw = presRes.data || {};
        // Normalizamos para que las cards y el gate usen el mismo shape:
        const esPorSuplidor = !!presRaw.suplidor_id;
        const presV2 = esPorSuplidor
          ? {
              modo:                    presRaw.modo_distribucion,   // 'manual' | 'auto_movimiento' | 'auto_minimo'
              monto_base_mensual:      presRaw.presupuesto_suplidor,
              comprado_mes:            presRaw.comprado_suplidor,
              disponible:              presRaw.disponible_suplidor,
              color:                   presRaw.color,
              salud:                   presRaw.color === 'rojo' ? 'agotado' : presRaw.color === 'amarillo' ? 'limite_cerca' : 'sano',
              factor_salud:            presRaw.presupuesto_total_json?.factor_salud,
              ratio_cxp_ventas:        presRaw.presupuesto_total_json?.ratio_cxp_ventas,
              legacy_calculo:          presRaw.presupuesto_total_json?.legacy_calculo,
              // datos extra del suplidor:
              share_pct:               presRaw.share_pct,
              presupuesto_total:       presRaw.presupuesto_total,
              modo_distribucion:       presRaw.modo_distribucion,
            }
          : presRaw;
        const map = {};
        for (const it of analisis.items || []) map[it.producto_id] = it.urgencia;
        // Mantenemos presData para el asesor IA (necesita formato v1)
        const presParaAsesor = {
          presupuesto_sugerido: Number(presV2.monto_base_mensual || 0),
          ventas_recientes: Number(presV2.legacy_calculo?.ventas_recientes || 0),
          cxp_pendiente: Number(presV2.legacy_calculo?.cxp_pendiente || 0),
          cxc_pendiente: Number(presV2.legacy_calculo?.cxc_pendiente || 0),
          salud_caja: presV2.legacy_calculo?.salud_caja || presV2.salud,
          factor_reinversion: Number(presV2.legacy_calculo?.factor_reinversion || 0),
          dias: 30,
        };
        if (!cancel) {
          setPrioridadMap(map);
          setAnalisisItems(analisis.items || []);
          setPresData(presParaAsesor);
          setAsesor(null);
        }
        if (!cancel) setSugerenciaCompra({
          totalOrden: analisis.totalOrden,
          totalUrgente: analisis.totalUrgente,
          totalProxima: analisis.totalProxima,
          totalEsperar: analisis.totalEsperar,
          countUrgente: analisis.countUrgente,
          countProxima: analisis.countProxima,
          countEsperar: analisis.countEsperar,
          // Datos UNIFICADOS del v2:
          presupuesto:  Number(presV2.monto_base_mensual || 0),  // tope mensual
          comprado:     Number(presV2.comprado_mes || 0),
          disponible:   Number(presV2.disponible || 0),
          modo:         presV2.modo || 'auto',
          color:        presV2.color,
          salud:        presV2.salud,
          // El "salud_caja" estilo v1 (sana/ajustada/tension) sale del factor_salud:
          salud_caja: (presV2.factor_salud === undefined)
            ? presV2.legacy_calculo?.salud_caja
            : presV2.factor_salud >= 1.0 ? 'sana'
            : presV2.factor_salud >= 0.7 ? 'ajustada'
            : 'tension',
        });
      } catch {
        if (!cancel) setSugerenciaCompra(null);
      }
    };
    calc();
    return () => { cancel = true; };
  }, [mostrarInteligente, selectedProveedor?.id, detalles.length, tenantId]);

  // Fase A v2: cargar presupuesto_compras_v2 (control estricto, disponible, limite)
  // Se carga al montar y cuando cambia tenant. Se refresca tras guardar una orden.
  const refreshPresupuestoV2 = useCallback(async () => {
    if (!tenantId) return;
    try {
      const { data, error } = await supabase.rpc('get_presupuesto_compras_v2');
      if (error) {
        // Si el SQL Fase A no esta corrido todavia, el gate queda inactivo (no rompemos nada).
        console.warn('[OrdenCompra] presupuesto_v2 no disponible:', error.message);
        setPresupuestoV2(null);
        return;
      }
      setPresupuestoV2(data || null);
    } catch (err) {
      console.warn('[OrdenCompra] presupuesto_v2 error:', err.message);
      setPresupuestoV2(null);
    }
  }, [tenantId]);

  useEffect(() => { refreshPresupuestoV2(); }, [refreshPresupuestoV2]);

  // Contador de aprobaciones pendientes (para el badge del boton APROBACIONES)
  useEffect(() => {
    if (!tenantId) return;
    let cancel = false;
    const fetch = async () => {
      try {
        const { count } = await supabase
          .from('compras_aprobaciones')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('estado', 'pendiente');
        if (!cancel) setAprobacionesPendCount(count || 0);
      } catch (_) {
        if (!cancel) setAprobacionesPendCount(0);
      }
    };
    fetch();
    return () => { cancel = true; };
  }, [tenantId, view]);

  // Fase B v2: cargar info presupuesto del suplidor al cambiar seleccion.
  // Solo si la config distribuir_por incluye 'suplidor'.
  useEffect(() => {
    let cancel = false;
    const fetch = async () => {
      const distrib = presupuestoV2?.distribuir_por;
      if (!selectedProveedor?.id || !tenantId || !distrib || (distrib !== 'suplidor' && distrib !== 'mixto')) {
        setInfoSuplidor(null);
        return;
      }
      try {
        const { data, error } = await supabase.rpc('get_presupuesto_por_suplidor', {
          p_tenant_id: tenantId,
          p_suplidor_id: selectedProveedor.id,
        });
        if (error) {
          console.warn('[OrdenCompra] info suplidor:', error.message);
          if (!cancel) setInfoSuplidor(null);
          return;
        }
        if (!cancel) setInfoSuplidor(data || null);
      } catch (e) {
        if (!cancel) setInfoSuplidor(null);
      }
    };
    fetch();
    return () => { cancel = true; };
  }, [selectedProveedor?.id, tenantId, presupuestoV2?.distribuir_por]);

  // Fase B v2: pedir sugerencia de optimizacion. Llama el RPC que
  // decide que recortar (sin tocar urgentes) para entrar en el
  // presupuesto disponible. Abre modal de preview antes de aplicar.
  const handleOptimizarOrden = async () => {
    if (!presupuestoV2 || !detalles?.length) return;
    const objetivo = Number(presupuestoV2.disponible) || 0;
    if (objetivo <= 0) {
      toast({ variant: 'destructive', title: 'Sin presupuesto', description: 'No queda disponible este mes para optimizar.' });
      return;
    }
    setOptimizando(true);
    try {
      const items = detalles
        .filter(d => d.producto_id && Number(d.cantidad) > 0)
        .map(d => {
          const cant = Number(d.cantidad) || 0;
          const precio = Number(d.precio) || 0;
          const descPct = (Number(d.descuento_pct) || 0) / 100;
          const subtotal = cant * precio * (1 - descPct);
          return {
            producto_id: d.producto_id,
            cantidad: cant,
            subtotal: Number(subtotal.toFixed(2)),
          };
        });
      const { data, error } = await supabase.rpc('optimizar_orden_compra', {
        p_tenant_id: tenantId,
        p_items: items,
        p_presupuesto: objetivo,
      });
      if (error) throw error;
      if (!data?.optimizada) {
        toast({ title: 'Sin recortes', description: 'La orden ya entra en el presupuesto disponible.' });
        return;
      }
      setPreviewOptim(data);
      setOptimModalOpen(true);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error optimizando', description: err.message });
    } finally {
      setOptimizando(false);
    }
  };

  // Aplica el preview de optimizacion a los detalles de la orden.
  const aplicarOptimizacion = () => {
    if (!previewOptim?.items) return;
    const mapAcciones = new Map();
    for (const it of previewOptim.items) {
      mapAcciones.set(it.producto_id, it);
    }
    setDetalles(prev => prev.flatMap(d => {
      const acc = mapAcciones.get(d.producto_id);
      if (!acc) return [d]; // no estaba en el analisis -> lo dejamos
      if (acc.accion === 'quitar') return [];
      if (acc.accion === 'reducir' || acc.accion === 'mantener') {
        const cantidadNueva = Number(acc.cantidad_nueva) || 0;
        if (cantidadNueva <= 0) return [];
        return [{ ...d, cantidad: cantidadNueva }];
      }
      return [d];
    }));
    setOptimModalOpen(false);
    setPreviewOptim(null);
    toast({
      title: '✨ Orden optimizada',
      description: `Ahorro estimado: RD$ ${Number(previewOptim.ahorro).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`,
    });
  };

  // Solicita aprobacion MANUAL (sin que el gate haya disparado). Util para
  // ordenes que aunque no excedan presupuesto el operador quiere revisar
  // con un supervisor antes de grabarse en firme.
  const solicitarAprobacionManual = () => {
    if (!selectedProveedor || detalles.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Datos incompletos',
        description: 'Debe seleccionar un suplidor y añadir al menos un producto.',
      });
      return;
    }
    setPinGateInfo({
      motivo: 'SOLICITADO_POR_OPERADOR',
      monto_orden: Number(totals.total_orden) || 0,
      disponible: Number(presupuestoV2?.disponible) || 0,
      limite: Number(presupuestoV2?.limite_aprobacion) || 0,
      exceso: 0,
    });
    setPinReason('');
    setWorkflowModalOpen(true);
  };

  // Fase C v2: enviar orden a cola de aprobaciones en vez de grabar directo.
  // Setea flag via_workflow en pinGateInfo y llama handleSave(true).
  // El handler detecta el flag y, en vez de loguear excepcion, llama el RPC
  // solicitar_aprobacion_orden que marca la orden pendiente.
  const enviarACola = async () => {
    if (!pinGateInfo) return;
    setEnviandoCola(true);
    try {
      setPinGateInfo({ ...pinGateInfo, via_workflow: true });
      setWorkflowModalOpen(false);
      await handleSave(true);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setEnviandoCola(false);
    }
  };

  // Verifica el PIN del supervisor y dispara el guardado de la orden
  // bypaseando el gate. Si el PIN es incorrecto, queda el modal abierto
  // y el usuario puede reintentar o cancelar.
  const onPinConfirm = async () => {
    if (!pinInput) return;
    setPinVerifying(true);
    try {
      const { data, error } = await supabase.rpc('verificar_pin_supervisor', { p_pin: pinInput });
      if (error) throw error;
      if (data !== true) {
        toast({
          variant: 'destructive',
          title: 'PIN incorrecto',
          description: 'Verificá el PIN con el supervisor e intentá de nuevo.',
        });
        setPinInput('');
        return;
      }
      // PIN OK — cerramos el modal y disparamos el guardado bypaseando el gate.
      setPinModalOpen(false);
      setPinInput('');
      // pinGateInfo y pinReason se mantienen hasta despues del save para
      // que el handler los persista en presupuesto_excepciones.
      await handleSave(true);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error verificando PIN', description: err.message });
    } finally {
      setPinVerifying(false);
    }
  };

  // Asesor IA de caja: analiza la orden actual y devuelve recomendaciones.
  const pedirAsesorCaja = async () => {
    if (analisisItems.length === 0) {
      toast({ title: 'Sin productos', description: 'La orden no tiene productos para analizar.' });
      return;
    }
    setAsesorLoading(true);
    try {
      const itemsParaIA = analisisItems.map((it) => ({
        codigo: it.codigo, descripcion: it.descripcion,
        cantidad_ideal: it.cantidad,
        cantidad_recomendada: it.urgencia === 'urgente' ? it.cantidad : 0,
        costo: it.costo, margen_pct: it.margen_pct, ventas_90d: it.ventas_90d,
        existencia: it.existencia, costo_ideal: it.subtotal,
        costo_recomendado: it.urgencia === 'urgente' ? it.subtotal : 0,
      }));
      const res = await asesorCompras(Number(presData?.presupuesto_sugerido || 0), presData, itemsParaIA);
      setAsesor(res.analisis);
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error', description: e.message });
    } finally {
      setAsesorLoading(false);
    }
  };

  const handleSave = async (bypassGate = false) => {
    if (isSaving) return;
    if (!selectedProveedor || detalles.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Datos incompletos',
        description: 'Debe seleccionar un suplidor y añadir al menos un producto.',
      });
      return;
    }

    // ── Gate Fase A v2: control estricto + PIN supervisor o workflow ──
    if (!bypassGate && presupuestoV2?.control_estricto) {
      const total = Number(totals.total_orden) || 0;
      const dispo = Number(presupuestoV2.disponible) || 0;
      const limite = Number(presupuestoV2.limite_aprobacion) || 0;
      let motivo = null;
      if (total > dispo) motivo = 'EXCEDE_PRESUPUESTO_DISPONIBLE';
      else if (limite > 0 && total > limite) motivo = 'EXCEDE_LIMITE_APROBACION';
      if (motivo) {
        // Fase C: si workflow_aprobacion=true, abre modal de razon + envia a cola.
        if (presupuestoV2.workflow_aprobacion) {
          setPinGateInfo({
            motivo,
            monto_orden: total,
            disponible: dispo,
            limite,
            exceso: Math.max(0, total - dispo),
          });
          setPinReason('');
          setWorkflowModalOpen(true);
          return;
        }
        // Fase A: PIN supervisor sincronico
        setPinGateInfo({
          motivo,
          monto_orden: total,
          disponible: dispo,
          limite,
          exceso: Math.max(0, total - dispo),
        });
        setPinInput('');
        setPinReason('');
        setPinModalOpen(true);
        return; // espera al PIN
      }
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
      // Manejo post-save segun como se llego aqui
      if (pinGateInfo?.via_workflow) {
        // Fase C: enviar a cola de aprobaciones (no grabar directo)
        try {
          const { error: solErr } = await supabase.rpc('solicitar_aprobacion_orden', {
            p_orden_id: savedOrden.id,
            p_motivo_gate: pinGateInfo.motivo,
            p_monto: pinGateInfo.monto_orden,
            p_presupuesto_dispo: pinGateInfo.disponible,
            p_razon: pinReason || null,
          });
          if (solErr) throw solErr;
          toast({
            title: '📋 Enviada a Cola de Aprobaciones',
            description: `Orden ${savedOrden.numero} quedó pendiente. Un supervisor recibirá la solicitud.`,
          });
        } catch (solErr) {
          toast({ variant: 'destructive', title: 'Error enviando a cola', description: solErr.message });
        }
        setPinGateInfo(null);
        setPinReason('');
      } else if (pinGateInfo) {
        // Fase A: PIN supervisor — loguear excepcion para auditoria
        try {
          const { data: userRes } = await supabase.auth.getUser();
          await supabase.from('presupuesto_excepciones').insert({
            tenant_id: tenantId,
            orden_compra_id: savedOrden.id,
            usuario_id: userRes?.user?.id || null,
            monto_orden: pinGateInfo.monto_orden,
            presupuesto_dispo: pinGateInfo.disponible,
            razon: pinReason || `Override (${pinGateInfo.motivo})`,
          });
        } catch (excErr) {
          console.warn('[OrdenCompra] no se pudo loguear excepcion:', excErr.message);
        }
        setPinGateInfo(null);
        setPinReason('');
        toast({ title: 'Éxito', description: 'Orden de compra guardada correctamente.' });
      } else {
        toast({ title: 'Éxito', description: 'Orden de compra guardada correctamente.' });
      }

      if (printMethod === 'pos') {
        printOrdenCompraPOS(savedOrden, selectedProveedor, detallesData, paperSize);
      } else {
        generateOrderPDF(savedOrden, selectedProveedor, detallesData, empresa);
      }

      // Refrescar presupuesto v2 para reflejar comprado_mes actualizado
      refreshPresupuestoV2();
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
          <Button
            variant="ghost"
            className="h-10 flex flex-col items-center px-2 py-1 text-[10px] relative"
            onClick={() => setView('aprobaciones')}
            title="Cola de Aprobaciones de Compras (Control Inteligente)"
          >
            <Cog className="h-5 w-5 mb-0.5 text-violet-600" />
            APROBACIONES
            {aprobacionesPendCount > 0 && (
              <span className="absolute top-0 right-1 bg-red-500 text-white text-[9px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center animate-pulse">
                {aprobacionesPendCount > 99 ? '99+' : aprobacionesPendCount}
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
                  <TableCell className="py-0 px-2 h-7 text-right font-bold">{Number(o.total_orden || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                  <TableCell className="py-0 px-2 h-7 text-center text-[10px] font-bold">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className={`px-2 py-0.5 rounded-full ${o.estado === 'Recibida' ? 'bg-green-100 text-green-700' : o.estado === 'Anulada' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                        {o.estado?.toUpperCase() || 'PENDIENTE'}
                      </span>
                      {o.estado_aprobacion && o.estado_aprobacion !== 'no_requerida' && (
                        <span className={`px-1.5 py-0 rounded-full text-[9px] ${
                          o.estado_aprobacion === 'pendiente' ? 'bg-amber-100 text-amber-800 animate-pulse' :
                          o.estado_aprobacion === 'aprobada' ? 'bg-emerald-100 text-emerald-800' :
                          o.estado_aprobacion === 'rechazada' ? 'bg-red-200 text-red-900' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {o.estado_aprobacion === 'pendiente' ? '⏳ ESPERA SUP.' :
                           o.estado_aprobacion === 'aprobada' ? '✅ APROBADA' :
                           o.estado_aprobacion === 'rechazada' ? '🚫 RECHAZADA' :
                           o.estado_aprobacion.toUpperCase()}
                        </span>
                      )}
                    </div>
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

          {/* Card Info Suplidor (Fase B v2) — solo si hay distribución por suplidor */}
          {selectedProveedor && infoSuplidor && infoSuplidor.tiene_asignacion && (
            <div className={`mt-2 rounded-md border-2 p-2 ${
              infoSuplidor.color === 'verde' ? 'border-emerald-300 bg-emerald-50' :
              infoSuplidor.color === 'amarillo' ? 'border-amber-300 bg-amber-50' :
              infoSuplidor.color === 'rojo' ? 'border-red-300 bg-red-50' :
              'border-slate-300 bg-slate-50'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] uppercase font-bold text-slate-600">Presupuesto este mes para este suplidor</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[9px] uppercase text-slate-500">Asignado</p>
                  <p className="text-xs font-mono font-black text-slate-800">
                    RD$ {Number(infoSuplidor.asignado).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] uppercase text-slate-500">Comprado</p>
                  <p className="text-xs font-mono font-black text-blue-700">
                    RD$ {Number(infoSuplidor.comprado).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] uppercase text-slate-500">Disponible</p>
                  <p className={`text-xs font-mono font-black ${
                    infoSuplidor.color === 'verde' ? 'text-emerald-700' :
                    infoSuplidor.color === 'amarillo' ? 'text-amber-700' :
                    'text-red-700'
                  }`}>
                    RD$ {Number(infoSuplidor.disponible).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </div>
          )}
          {selectedProveedor && infoSuplidor && !infoSuplidor.tiene_asignacion && (presupuestoV2?.distribuir_por === 'suplidor' || presupuestoV2?.distribuir_por === 'mixto') && (
            <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2">
              <p className="text-[10px] text-slate-500 italic">
                Este suplidor no tiene asignación. Sin límite por proveedor — solo aplica el presupuesto total.
              </p>
            </div>
          )}
        </div>

        {/* Asesor IA de caja (reemplaza Dirección de Entrega, sin uso) */}
        <div className="h-full flex flex-col p-3 border border-gray-300 rounded-sm bg-white space-y-2 relative [&_label]:text-[11px] min-h-[140px]">
          <Label className="absolute -top-2 left-3 bg-white px-1 text-violet-600 font-bold text-[10px] uppercase">Asesor IA de caja</Label>
          {!mostrarInteligente ? (
            <div className="flex-1 flex items-center justify-center text-center text-slate-400 text-[12px] px-2">
              {puedeCompraInteligente
                ? <span>Activa <b className="mx-1 text-violet-600">Compra Inteligente</b> (botón abajo) para ver el análisis de caja.</span>
                : <span>🔒 <b className="mx-1 text-violet-600">Asesor IA de caja</b> — disponible en los planes <b>PRO</b> y <b>Enterprise</b>.</span>}
            </div>
          ) : (
          <>
          <Button
            size="sm"
            onClick={pedirAsesorCaja}
            disabled={asesorLoading || analisisItems.length === 0}
            className="bg-violet-600 hover:bg-violet-700 text-white self-start"
          >
            {asesorLoading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analizando...</> : <><Brain className="h-4 w-4 mr-1" /> Pedir análisis</>}
          </Button>
          <div className="flex-1 overflow-y-auto text-[12px] pr-1">
            {asesor ? (
              <div className="space-y-1.5">
                <p className="text-slate-700">{asesor.resumen}</p>
                {asesor.riesgos?.length > 0 && (
                  <div>
                    <p className="font-bold text-red-600 text-[11px]">Riesgos</p>
                    <ul className="list-disc ml-4 text-slate-600">{asesor.riesgos.map((r, i) => <li key={i}>{r}</li>)}</ul>
                  </div>
                )}
                {asesor.recomendaciones?.length > 0 && (
                  <div>
                    <p className="font-bold text-emerald-700 text-[11px]">Recomendaciones</p>
                    <ul className="list-disc ml-4 text-slate-600">{asesor.recomendaciones.map((r, i) => <li key={i}>{r}</li>)}</ul>
                  </div>
                )}
                {asesor.prioridad_pago && <p className="text-slate-500 italic">💸 {asesor.prioridad_pago}</p>}
              </div>
            ) : (
              <p className="text-slate-400">Presiona "Pedir análisis" para que la IA evalúe tu orden y la caja (riesgos, qué priorizar y pagos).</p>
            )}
          </div>
          </>
          )}
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
            <Button
              variant="outline"
              className="h-7 w-7 p-0 border-emerald-500 text-emerald-700 hover:bg-emerald-50"
              onClick={abrirNuevoProducto}
              title="Crear producto nuevo y agregarlo a esta orden"
            >
              <Plus className="h-4 w-4" />
            </Button>
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
                  {mostrarInteligente && <TableHead className="w-24 text-center">Prioridad</TableHead>}
                  <TableHead className="w-10" />
                </TableRow>
              )}
            </TableHeader>
            <TableBody>
              {detalles.length === 0 ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i} className="h-7 border-b border-slate-100">
                    {Array.from({ length: isVehicleDealer ? 10 : (mostrarInteligente ? 10 : 9) }).map((_, j) => (
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
                        <TableCell className="py-0 px-2 text-right font-mono">{Number(d.precio || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                        <TableCell className="py-0 px-2 text-right text-slate-500 text-[10px]">{(orden.aplicar_itbis ? normalizeTaxRate(d.itbis_pct) * getDetalleBase(d) : 0).toFixed(2)}</TableCell>
                        <TableCell className="py-0 px-2 text-right font-bold text-slate-800">{Number(d.importe || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                      </>
                    ) : (
                      /* ── FILA ORIGINAL ── */
                      <>
                        <TableCell className="py-0 px-2 text-slate-700 font-medium">
                          <div className="flex items-center gap-1">
                            {d.codigo}
                            {equivalentesMap[d.producto_id] && (
                              <Popover>
                                <PopoverTrigger asChild>
                                  <button
                                    onClick={(e) => e.stopPropagation()}
                                    className="px-1 py-0 rounded text-[9px] font-bold bg-purple-100 text-purple-700 hover:bg-purple-200 flex items-center gap-0.5"
                                    title="Productos equivalentes disponibles"
                                  >
                                    🔗 {equivalentesMap[d.producto_id].length}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80 p-2" align="start" onClick={(e) => e.stopPropagation()}>
                                  <p className="text-[11px] font-bold text-purple-700 mb-1 pb-1 border-b border-purple-100">
                                    🔗 Equivalentes del mismo grupo
                                  </p>
                                  <div className="space-y-1">
                                    {equivalentesMap[d.producto_id].map(eq => (
                                      <div key={eq.producto_id} className="text-[10px] bg-slate-50 rounded p-1.5">
                                        <div className="flex items-center gap-1">
                                          <span className="font-mono font-bold text-slate-700">{eq.codigo}</span>
                                          {eq.prioridad === 1 && <span className="text-amber-500" title="Preferido">⭐</span>}
                                          <span className="ml-auto font-mono text-[9px] text-slate-500">RD$ {Number(eq.precio).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        <p className="text-slate-600 truncate">{eq.descripcion}</p>
                                        <div className="flex items-center gap-3 mt-0.5 text-[9px]">
                                          <span className={eq.existencia > 0 ? 'text-emerald-700 font-bold' : 'text-red-600'}>
                                            Stock: {eq.existencia}
                                          </span>
                                          <span className="text-slate-500">Vendió 30d: <b>{eq.ventas_30d}</b></span>
                                          {eq.margen_pct > 0 && <span className="text-slate-500">Mg: {eq.margen_pct}%</span>}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  <p className="text-[9px] text-slate-400 italic mt-2">
                                    💡 Considerá la rotación combinada al definir cantidad
                                  </p>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-0 px-2 uppercase truncate max-w-[300px]">{d.descripcion}</TableCell>
                        <TableCell className="py-0 px-2 text-center text-blue-700 font-bold select-none">{d.cantidad} {d.unidad}</TableCell>
                        <TableCell className="py-0 px-2 text-center font-bold" style={{ color: (d.existencia ?? 0) <= 0 ? '#dc2626' : '#059669' }}>{d.existencia ?? 0}</TableCell>
                        <TableCell className="py-0 px-2 text-right font-mono">{Number(d.precio || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                        <TableCell className="py-0 px-2 text-right text-slate-500">{d.descuento_pct}%</TableCell>
                        <TableCell className="py-0 px-2 text-right text-slate-500 text-[10px]">{(orden.aplicar_itbis ? normalizeTaxRate(d.itbis_pct) * getDetalleBase(d) : 0).toFixed(2)}</TableCell>
                        <TableCell className="py-0 px-2 text-right font-bold text-slate-800">{Number(d.importe || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                        {mostrarInteligente && (
                          <TableCell className="py-0 px-2 text-center">
                            {d.producto_id && prioridadMap[d.producto_id] ? (
                              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${PRIO_BADGE[prioridadMap[d.producto_id]].cls}`}>{PRIO_BADGE[prioridadMap[d.producto_id]].txt}</span>
                            ) : null}
                          </TableCell>
                        )}
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
            {puedeCompraInteligente && (
              <Button
                className={`text-white ${mostrarInteligente ? 'bg-violet-800 hover:bg-violet-900' : 'bg-violet-600 hover:bg-violet-700'}`}
                onClick={() => setMostrarInteligente(v => !v)}
                disabled={!selectedProveedor}
              >
                <Wallet className="mr-2 h-4 w-4" />
                COMPRA INTELIGENTE {mostrarInteligente ? '✓' : ''}
              </Button>
            )}
            {puedeCompraInteligente && (
              <Button
                variant="outline"
                className="border-violet-300 text-violet-700 hover:bg-violet-50"
                onClick={abrirConfigModal}
                title="Configurar presupuesto mensual, incremento automático y control estricto"
              >
                <Cog className="h-4 w-4" />
              </Button>
            )}
            {/* Alerta de equivalentes en la misma orden (potencial duplicacion) */}
            {equivalentesDuplicados.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-amber-300 bg-amber-50 animate-pulse">
                <AlertTriangle className="h-4 w-4 text-amber-700 flex-shrink-0" />
                <div className="text-[11px] leading-tight">
                  <p className="font-bold text-amber-900">
                    ⚠️ {equivalentesDuplicados.length} par{equivalentesDuplicados.length !== 1 ? 'es' : ''} equivalente{equivalentesDuplicados.length !== 1 ? 's' : ''} en esta orden
                  </p>
                  <p className="text-amber-700 text-[10px]">
                    Posible duplicación de stock. Revisá los códigos con 🔗 violeta.
                  </p>
                </div>
              </div>
            )}
            {mostrarInteligente && sugerenciaCompra && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${sugerenciaCompra.totalUrgente > 0 ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
                {sugerenciaCompra.totalUrgente > 0 ? (
                  <>
                    <span className="text-xs text-slate-500">💡 Compra urgente sugerida:</span>
                    <span className="font-bold text-red-600">RD$ {sugerenciaCompra.totalUrgente.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                  </>
                ) : (
                  <span className="text-xs text-slate-500">💡 Sin compras urgentes por ahora</span>
                )}
              </div>
            )}

            {/* Boton Optimizar Compra (Fase B v2) — aparece cuando la orden excede el presupuesto disponible */}
            {presupuestoV2 && Number(totals.total_orden) > Number(presupuestoV2.disponible || 0) && Number(presupuestoV2.disponible || 0) > 0 && (
              <Button
                onClick={handleOptimizarOrden}
                disabled={optimizando || !detalles?.length}
                className="bg-amber-500 hover:bg-amber-600 text-white font-bold"
                title={`Tu orden de RD$ ${Number(totals.total_orden).toLocaleString('es-DO', { minimumFractionDigits: 2 })} excede el presupuesto disponible de RD$ ${Number(presupuestoV2.disponible).toLocaleString('es-DO', { minimumFractionDigits: 2 })}. Hacé click para recortar items sin rotación.`}
              >
                {optimizando
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Optimizando...</>
                  : <>✨ Optimizar Compra</>}
              </Button>
            )}
          </div>

          {/* Franja de análisis de caja (inline, sin ventana aparte) */}
          {mostrarInteligente && sugerenciaCompra && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="text-[10px] uppercase text-slate-400 font-bold">Total orden</p>
                <p className="font-bold text-slate-800 text-sm">RD$ {sugerenciaCompra.totalOrden.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-[10px] uppercase text-red-500 font-bold">🔴 Urgente {sugerenciaCompra.countUrgente ? `(${sugerenciaCompra.countUrgente})` : ''}</p>
                <p className="font-bold text-red-700 text-sm">RD$ {sugerenciaCompra.totalUrgente.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-[10px] uppercase text-amber-600 font-bold">🟡 Próxima {sugerenciaCompra.countProxima ? `(${sugerenciaCompra.countProxima})` : ''}</p>
                <p className="font-bold text-amber-700 text-sm">RD$ {sugerenciaCompra.totalProxima.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[10px] uppercase text-slate-400 font-bold">⚪ Puede esperar {sugerenciaCompra.countEsperar ? `(${sugerenciaCompra.countEsperar})` : ''}</p>
                <p className="font-bold text-slate-600 text-sm">RD$ {sugerenciaCompra.totalEsperar.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</p>
              </div>
              {(() => {
                const presup = Number(sugerenciaCompra.presupuesto) || 0;
                const dispOriginal = Number(sugerenciaCompra.disponible) || 0;
                const ordenActual = Number(totals.total_orden) || 0;
                const dispDespues = dispOriginal - ordenActual;
                const ratioOrden = presup > 0 ? ordenActual / presup : 0;
                const ratioDisp = presup > 0 ? Math.max(0, dispDespues) / presup : 0;
                const colorDispDespues = dispDespues < 0 ? 'text-red-600' : dispDespues / Math.max(1, presup) < 0.10 ? 'text-amber-600' : 'text-emerald-600';
                return (
                  <div className={`rounded-lg border-2 px-3 py-2 ${dispDespues < 0 ? 'border-red-400 bg-red-50 animate-pulse' : dispDespues / Math.max(1, presup) < 0.10 ? 'border-amber-300 bg-amber-50' : 'border-violet-200 bg-violet-50'}`}>
                    <p className="text-[10px] uppercase text-violet-500 font-bold leading-tight">
                      {sugerenciaCompra.modo_distribucion
                        ? `Presup. ${selectedProveedor?.nombre?.slice(0, 12) || 'suplidor'}${sugerenciaCompra.share_pct ? ` (${sugerenciaCompra.share_pct}%)` : ''}`
                        : `Presupuesto mes ${sugerenciaCompra.modo === 'manual' ? '(manual)' : '(auto)'}`}
                    </p>
                    <p className="font-bold text-violet-700 text-sm">
                      RD$ {presup.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </p>

                    {/* Barra visual del progreso disponible */}
                    <div className="h-1.5 w-full bg-slate-200 rounded-full mt-1 overflow-hidden">
                      <div
                        className={`h-full transition-all ${dispDespues < 0 ? 'bg-red-500' : dispDespues / Math.max(1, presup) < 0.10 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(100, Math.max(0, ratioDisp * 100))}%` }}
                      />
                    </div>

                    <div className="text-[9px] mt-1 leading-tight space-y-0.5">
                      <p className="text-violet-600">
                        Disp ahora: <span className="font-bold">RD$ {dispOriginal.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                      </p>
                      {ordenActual > 0 && (
                        <>
                          <p className="text-slate-500">
                            − Esta orden: <span className="font-mono">RD$ {ordenActual.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                          </p>
                          <p className={`font-bold ${colorDispDespues}`}>
                            = Quedaría: RD$ {dispDespues.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                            {dispDespues < 0 && ' ⚠️'}
                          </p>
                        </>
                      )}
                    </div>

                    {sugerenciaCompra.modo_distribucion && (
                      <p className="text-[9px] text-slate-400 italic leading-tight mt-1">
                        Total tenant: RD$ {Number(sugerenciaCompra.presupuesto_total || 0).toLocaleString('es-DO')}
                      </p>
                    )}
                  </div>
                );
              })()}
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex flex-col justify-center">
                <p className="text-[10px] uppercase text-slate-400 font-bold">Salud de caja</p>
                <p className={`font-bold text-sm ${sugerenciaCompra.salud_caja === 'tension' ? 'text-red-600' : sugerenciaCompra.salud_caja === 'ajustada' ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {sugerenciaCompra.salud_caja === 'tension' ? 'En tensión' : sugerenciaCompra.salud_caja === 'ajustada' ? 'Ajustada' : 'Sana'}
                </p>
              </div>
            </div>
          )}
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
            <div className="flex justify-between text-slate-600"><span>Total Exento</span><span className="font-bold">{Number(totals.total_exento || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between text-slate-600"><span>Total Gravado</span><span className="font-bold">{Number(totals.total_gravado || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between text-slate-600"><span>Descuento</span><span className="font-bold text-red-600">{Number(totals.descuento_total || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between text-slate-600 border-b border-slate-200 pb-1.5"><span>ITBIS</span><span className="font-bold">{Number(totals.itbis_total || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
            <div className="flex justify-between items-center bg-yellow-50 p-2 mt-1 border border-yellow-200 rounded-sm">
              <span className="text-morla-blue font-bold text-xl">TOTAL</span>
              <span className="text-red-700 font-bold text-2xl tracking-tighter">{Number(totals.total_orden || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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
          <Button
            variant="outline"
            className="h-9 px-5 text-xs uppercase font-bold border-blue-400 text-blue-700 hover:bg-blue-50"
            onClick={solicitarAprobacionManual}
            disabled={isSaving || !selectedProveedor || detalles.length === 0}
            title="Mandar la orden a Cola de Aprobaciones sin importar si excede o no el presupuesto"
          >
            📋 Pedir Aprobación
          </Button>
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
        {view === 'aprobaciones' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1 mt-2">
              <Button variant="outline" size="sm" onClick={() => setView('list')}>
                ← Volver a Órdenes
              </Button>
            </div>
            <AprobacionesComprasPage />
          </div>
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

      {/* ════════════════════════════════════════════════════ */}
      {/* Modal PIN supervisor — Compra Inteligente v2 Fase A  */}
      {/* ════════════════════════════════════════════════════ */}
      <Dialog open={pinModalOpen} onOpenChange={(open) => { if (!open) { setPinModalOpen(false); setPinInput(''); setPinReason(''); setPinGateInfo(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Lock className="w-5 h-5" />
              Autorización requerida
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              Esta orden requiere el PIN del supervisor para grabarse.
            </DialogDescription>
          </DialogHeader>

          {pinGateInfo && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs space-y-1">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-bold text-amber-900">
                    {pinGateInfo.motivo === 'EXCEDE_PRESUPUESTO_DISPONIBLE'
                      ? 'La orden excede el presupuesto disponible del mes.'
                      : 'La orden supera el límite de aprobación manual.'}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-amber-800">
                    <span>Total de la orden:</span>
                    <span className="text-right font-mono font-bold">
                      RD$ {Number(pinGateInfo.monto_orden).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </span>
                    {pinGateInfo.motivo === 'EXCEDE_PRESUPUESTO_DISPONIBLE' ? (
                      <>
                        <span>Disponible este mes:</span>
                        <span className="text-right font-mono">
                          RD$ {Number(pinGateInfo.disponible).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-red-700 font-bold">Exceso:</span>
                        <span className="text-right font-mono text-red-700 font-bold">
                          RD$ {Number(pinGateInfo.exceso).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </span>
                      </>
                    ) : (
                      <>
                        <span>Límite aprobación:</span>
                        <span className="text-right font-mono">
                          RD$ {Number(pinGateInfo.limite).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <Label className="text-[11px] font-bold uppercase text-slate-700 flex items-center gap-1">
                <KeyRound className="w-3 h-3" /> PIN del supervisor
              </Label>
              <Input
                type="password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="• • • •"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && pinInput && !pinVerifying) {
                    onPinConfirm();
                  }
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-bold uppercase text-slate-700">Razón (opcional)</Label>
              <Textarea
                rows={2}
                value={pinReason}
                onChange={(e) => setPinReason(e.target.value)}
                placeholder="Ej: Stock crítico, suplidor exclusivo, oferta limitada..."
              />
              <p className="text-[10px] text-slate-500 italic">Queda guardada en el log de excepciones.</p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setPinModalOpen(false); setPinInput(''); setPinReason(''); setPinGateInfo(null); }}
              disabled={pinVerifying}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={onPinConfirm}
              disabled={pinVerifying || !pinInput}
              className="bg-red-600 hover:bg-red-700 text-white font-bold"
            >
              {pinVerifying
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verificando...</>
                : <><Lock className="w-4 h-4 mr-2" /> Autorizar y grabar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════ */}
      {/* Modal Quick Product: crear producto sin salir de la OC */}
      {/* ════════════════════════════════════════════════════ */}
      <Dialog open={quickProdModalOpen} onOpenChange={(open) => { if (!open) setQuickProdModalOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700">
              <Plus className="w-5 h-5" /> Producto Nuevo Rápido
            </DialogTitle>
            <DialogDescription className="text-slate-600 text-xs">
              Creá el producto y agregalo a esta orden en un solo paso. Después podés afinar precio/categoría desde Mercancías.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1 space-y-1">
                <Label className="text-[11px] uppercase font-bold text-slate-700">Código *</Label>
                <Input
                  value={quickProd.codigo}
                  onChange={(e) => setQuickProd(p => ({ ...p, codigo: e.target.value.toUpperCase() }))}
                  placeholder="Ej: GAX-099"
                  autoFocus
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-[11px] uppercase font-bold text-slate-700">Descripción *</Label>
                <Input
                  value={quickProd.descripcion}
                  onChange={(e) => setQuickProd(p => ({ ...p, descripcion: e.target.value }))}
                  placeholder="Ej: FILTRO ACEITE GTS"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] uppercase font-bold text-slate-700">Costo (RD$)</Label>
                <Input
                  type="number" step="0.01" min={0}
                  value={quickProd.costo || ''}
                  onChange={(e) => setQuickProd(p => ({ ...p, costo: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase font-bold text-slate-700">ITBIS %</Label>
                <Input
                  type="number" step="0.01" min={0} max={100}
                  value={quickProd.itbis_pct || ''}
                  onChange={(e) => setQuickProd(p => ({ ...p, itbis_pct: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase font-bold text-slate-700">Cantidad</Label>
                <Input
                  type="number" min={1}
                  value={quickProd.cantidad || ''}
                  onChange={(e) => setQuickProd(p => ({ ...p, cantidad: e.target.value }))}
                  placeholder="1"
                />
              </div>
            </div>

            <p className="text-[10px] text-slate-500 italic">
              💡 El producto se crea con costo = precio (igual). Cuando llegue la compra, el OCR puede ajustar el costo real y vos podés definir el precio de venta en el módulo Mercancías.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setQuickProdModalOpen(false)} disabled={creandoProducto}>
              Cancelar (ESC)
            </Button>
            <Button
              onClick={crearProductoYAgregar}
              disabled={creandoProducto || !quickProd.codigo?.trim() || !quickProd.descripcion?.trim()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {creandoProducto ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Crear y agregar a la orden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════ */}
      {/* Modal Config Presupuesto (inline, sin modulo aparte) */}
      {/* ════════════════════════════════════════════════════ */}
      <Dialog open={configModalOpen} onOpenChange={(open) => { if (!open) setConfigModalOpen(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-violet-700">
              <Cog className="w-5 h-5" /> Configurar Presupuesto Inteligente
            </DialogTitle>
            <DialogDescription className="text-slate-600 text-xs">
              Definí cuánto podés gastar en compras al mes. Si lo dejás vacío, el sistema lo calcula automático según tus ventas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] uppercase font-bold text-slate-700">Monto base mensual (RD$)</Label>
                <Input
                  type="number" min={0} step="0.01"
                  value={configForm.monto_base_mensual}
                  onChange={(e) => setConfigForm(p => ({ ...p, monto_base_mensual: e.target.value }))}
                  placeholder="Ej: 300000"
                />
                <p className="text-[10px] text-slate-500">Vacío = automático según ventas.</p>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase font-bold text-slate-700">Incremento MÁXIMO mensual (%)</Label>
                <Input
                  type="number" min={0} max={100} step="0.5"
                  value={configForm.incremento_mensual_pct}
                  onChange={(e) => setConfigForm(p => ({ ...p, incremento_mensual_pct: e.target.value }))}
                  placeholder="Ej: 5"
                />
                <p className="text-[10px] text-slate-500">
                  Tope. El sistema aplica menos si la deuda es alta. Solo se setea 1 vez.
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] uppercase font-bold text-slate-700">Caja mínima de seguridad (RD$)</Label>
              <Input
                type="number" min={0} step="0.01"
                value={configForm.caja_minima}
                onChange={(e) => setConfigForm(p => ({ ...p, caja_minima: e.target.value }))}
                placeholder="Ej: 50000"
              />
              <p className="text-[10px] text-slate-500">Monto que SIEMPRE debe quedar en caja, no se compromete.</p>
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center gap-2 p-2 rounded-md border border-amber-200 bg-amber-50">
                <Checkbox
                  id="cfg-estricto"
                  checked={configForm.control_estricto}
                  onCheckedChange={(v) => setConfigForm(p => ({ ...p, control_estricto: !!v }))}
                />
                <Label htmlFor="cfg-estricto" className="text-xs font-bold text-amber-900 cursor-pointer flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Control estricto (bloquea F10 si excede presupuesto)
                </Label>
              </div>

              <div className={`flex items-center gap-2 p-2 rounded-md border ${configForm.control_estricto ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50 opacity-50'}`}>
                <Checkbox
                  id="cfg-workflow"
                  checked={configForm.workflow_aprobacion}
                  onCheckedChange={(v) => setConfigForm(p => ({ ...p, workflow_aprobacion: !!v }))}
                  disabled={!configForm.control_estricto}
                />
                <Label htmlFor="cfg-workflow" className="text-xs font-bold text-blue-900 cursor-pointer">
                  Usar Cola de Aprobaciones en lugar de PIN supervisor
                </Label>
              </div>
            </div>

            {configForm.control_estricto && (
              <div className="border-t pt-3 space-y-1">
                <Label className="text-[11px] uppercase font-bold text-slate-700 flex items-center gap-1">
                  <KeyRound className="w-3 h-3" /> PIN supervisor (opcional)
                </Label>
                <Input
                  type="password"
                  value={configPinNuevo}
                  onChange={(e) => setConfigPinNuevo(e.target.value)}
                  placeholder="Ingresá un nuevo PIN para cambiarlo (vacío = mantener actual)"
                />
                <p className="text-[10px] text-slate-500">Mínimo 4 caracteres. Solo se actualiza si ingresás uno nuevo.</p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfigModalOpen(false)} disabled={savingConfig}>
              Cancelar
            </Button>
            <Button onClick={guardarConfig} disabled={savingConfig} className="bg-violet-600 hover:bg-violet-700 text-white">
              {savingConfig ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Guardar configuración
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════ */}
      {/* Modal Workflow (envia a Cola de Aprobaciones) — Fase C */}
      {/* ════════════════════════════════════════════════════ */}
      <Dialog open={workflowModalOpen} onOpenChange={(open) => { if (!open) { setWorkflowModalOpen(false); setPinReason(''); setPinGateInfo(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-700">
              📋 Enviar a Cola de Aprobaciones
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              Esta orden excede el presupuesto. Como el modo workflow está activo, no se graba inmediatamente — entra a la cola y un supervisor la aprueba o rechaza.
            </DialogDescription>
          </DialogHeader>

          {pinGateInfo && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs space-y-1">
              <div className="grid grid-cols-2 gap-1 text-[11px] text-amber-800">
                <span>Total orden:</span>
                <span className="text-right font-mono font-bold">
                  RD$ {Number(pinGateInfo.monto_orden).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </span>
                <span>Disponible:</span>
                <span className="text-right font-mono">
                  RD$ {Number(pinGateInfo.disponible).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-red-700 font-bold">Exceso:</span>
                <span className="text-right font-mono text-red-700 font-bold">
                  RD$ {Number(pinGateInfo.exceso).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-[11px] font-bold uppercase text-slate-700">Razón para el supervisor</Label>
            <Textarea
              rows={3}
              value={pinReason}
              onChange={(e) => setPinReason(e.target.value)}
              placeholder="Ej: Stock crítico de filtros, cierre de mes apretado, oferta exclusiva..."
            />
            <p className="text-[10px] text-slate-500 italic">El supervisor verá esto al revisar.</p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setWorkflowModalOpen(false); setPinReason(''); setPinGateInfo(null); }}
              disabled={enviandoCola}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={enviarACola}
              disabled={enviandoCola}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
            >
              {enviandoCola
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                : <>📋 Enviar a aprobación</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════ */}
      {/* Modal Optimizar Compra — Fase B v2                   */}
      {/* ════════════════════════════════════════════════════ */}
      <Dialog open={optimModalOpen} onOpenChange={(open) => { if (!open) { setOptimModalOpen(false); setPreviewOptim(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              ✨ Vista previa de optimización
            </DialogTitle>
            <DialogDescription className="text-slate-600">
              El sistema redujo o quitó items sin rotación para entrar en el presupuesto disponible. Los items URGENTES se mantienen aunque excedan.
            </DialogDescription>
          </DialogHeader>

          {previewOptim && (
            <>
              <div className="grid grid-cols-3 gap-2 my-2">
                <div className="bg-slate-50 border border-slate-200 rounded-md p-2 text-center">
                  <p className="text-[10px] uppercase font-bold text-slate-500">Antes</p>
                  <p className="text-sm font-mono font-black text-slate-700">RD$ {Number(previewOptim.total_antes).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-md p-2 text-center">
                  <p className="text-[10px] uppercase font-bold text-emerald-600">Después</p>
                  <p className="text-sm font-mono font-black text-emerald-700">RD$ {Number(previewOptim.total_despues).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-md p-2 text-center">
                  <p className="text-[10px] uppercase font-bold text-amber-600">Ahorro</p>
                  <p className="text-sm font-mono font-black text-amber-700">RD$ {Number(previewOptim.ahorro).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>

              <div className="max-h-[40vh] overflow-y-auto border border-slate-200 rounded-md">
                <Table>
                  <TableHeader className="bg-slate-100 sticky top-0">
                    <TableRow>
                      <TableHead className="text-[10px] uppercase">Producto</TableHead>
                      <TableHead className="text-[10px] uppercase">Urgencia</TableHead>
                      <TableHead className="text-[10px] uppercase">Acción</TableHead>
                      <TableHead className="text-right text-[10px] uppercase">Cant.</TableHead>
                      <TableHead className="text-right text-[10px] uppercase">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewOptim.items.map((it, idx) => {
                      const orig = detalles.find(d => d.producto_id === it.producto_id);
                      const accClr = it.accion === 'mantener' ? 'text-emerald-700 bg-emerald-50'
                                     : it.accion === 'reducir' ? 'text-amber-700 bg-amber-50'
                                     : 'text-red-700 bg-red-50';
                      const urgClr = it.urgencia === 'urgente' ? 'text-red-700'
                                     : it.urgencia === 'proxima' ? 'text-amber-700'
                                     : 'text-slate-500';
                      return (
                        <TableRow key={`${it.producto_id}-${idx}`}>
                          <TableCell className="text-xs">
                            <p className="font-bold">{orig?.codigo || '—'}</p>
                            <p className="text-[10px] text-slate-500 truncate max-w-[200px]">{orig?.descripcion}</p>
                          </TableCell>
                          <TableCell className={`text-[10px] uppercase font-bold ${urgClr}`}>
                            {it.urgencia}
                          </TableCell>
                          <TableCell>
                            <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded ${accClr}`}>
                              {it.accion}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {orig?.cantidad || 0} → <b>{Number(it.cantidad_nueva).toLocaleString('es-DO')}</b>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            RD$ {Number(it.subtotal_nuevo).toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <p className="text-[10px] text-slate-500 italic">
                💡 Los items URGENTE (sin stock + ventas recientes) se mantienen aunque hagan exceder el presupuesto.
              </p>
            </>
          )}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setOptimModalOpen(false); setPreviewOptim(null); }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={aplicarOptimizacion}
              className="bg-amber-500 hover:bg-amber-600 text-white font-bold"
            >
              Aplicar a la orden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default OrdenCompraPage;

