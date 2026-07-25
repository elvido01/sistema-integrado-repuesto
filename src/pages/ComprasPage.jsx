import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, X, Loader2 } from 'lucide-react';
import ProductSearchModal from '@/components/ventas/ProductSearchModal';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCompras } from '@/contexts/ComprasContext';
import CompraHeader from '@/components/compras/CompraHeader';
import CompraDetalles from '@/components/compras/CompraDetalles';
import CompraFooter from '@/components/compras/CompraFooter';
import SuplidorSearchModal from '@/components/compras/SuplidorSearchModal';
import { getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';
import InvoiceUploadModal from '@/components/compras/InvoiceUploadModal';
import ProductFormModal from '@/components/products/ProductFormModal';
import SuplidorFormModal from '@/components/catalogo/SuplidorFormModal';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/PanelContext';
import { ImagePlus, Printer } from 'lucide-react';
import { generateCompraPDF } from '@/components/common/PDFGenerator';
import { printCompraPOS } from '@/lib/printPOS';
import { onProveedoresActualizado } from '@/lib/catalogEvents';

const ComprasPage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, empresa } = useAuth();
  const precio2DescuentoPct = Math.max(0, Math.min(100, parseFloat(empresa?.precio2_descuento_pct) || 10));
  const precio3DescuentoPct = Math.max(0, Math.min(100, parseFloat(empresa?.precio3_descuento_pct) || 15));
  const precioCubreCostoReal = (precio, costo) => {
    return (parseFloat(precio) || 0) >= (parseFloat(costo) || 0);
  };
  const { ordenParaFacturar, setOrdenParaFacturar } = useCompras();
  const { panels, activePanel, closePanel } = usePanels();
  const currentPanel = panels.find(p => p.id === activePanel);
  const compraParaEditar = currentPanel?.extraData?.compraParaEditar;
  const [isEditMode, setIsEditMode] = useState(false);
  const [proveedores, setProveedores] = useState([]);
  const [tasaDia, setTasaDia] = useState(0); // RD$ por US$ (suplidores que facturan en dólares)
  const [almacenes, setAlmacenes] = useState([]);
  const [catalogTipos, setCatalogTipos] = useState([]);
  const [catalogMarcas, setCatalogMarcas] = useState([]);
  const [catalogModelos, setCatalogModelos] = useState([]);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isSuplidorModalOpen, setIsSuplidorModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isEditSuplidorModalOpen, setIsEditSuplidorModalOpen] = useState(false);
  const [tempProductData, setTempProductData] = useState(null);
  const [selectedSuplidorToEdit, setSelectedSuplidorToEdit] = useState(null);
  const [activeLineId, setActiveLineId] = useState(null);
  const [ocrData, setOcrData] = useState(null);

  const initialState = {
    numero: '',
    fecha: getCurrentDateInTimeZone(),
    ncf: '',
    referencia: '',
    tipo_bienes_servicios: '09',
    sub_tipo: 'Compra de Merc',
    suplidor_id: null,
    almacen_id: 'a01dc84d-a24d-417d-b30b-72d41a2a8fd7',
    itbis_incluido: false,
    actualizar_precios: true,
    forma_pago: 'Contado',
    dias_credito: 0,
    id_orden_origen: null,
  };

  const initialDetalleState = {
    codigo: '',
    referencia: '',
    descripcion: '',
    cantidad: 1,
    unidad: 'UND',
    costo_unitario: 0,
    descuento_pct: 0,
    itbis_pct: 0.18,
    importe: 0,
    producto_id: null,
  };

  const [compra, setCompra] = useState(initialState);
  const [detalles, setDetalles] = useState([]);
  const [currentDetalle, setCurrentDetalle] = useState(initialDetalleState);
  // Índice del detalle que está siendo editado desde la lista (null = staging para nuevo).
  // Mismo patrón que useVentas.editingItemIndex para evitar que el doble-click
  // accidental sustituya y elimine productos.
  const [editingDetalleIndex, setEditingDetalleIndex] = useState(null);
  const [pagos, setPagos] = useState([{ tipo: '01', referencia: '', monto: 0, id: Date.now() }]);
  const [isSaving, setIsSaving] = useState(false);
  const [printMethod, setPrintMethod] = useState('pos');
  const [paperSize, setPaperSize] = useState('4inch');
  // Financiamiento de la compra por cuotas (pagarés). Cada cuota se guarda como
  // una fila 'compras' CREDITO/PENDIENTE, igual que los pagarés de Motores del
  // Sur; el inventario/detalle se registra una sola vez (en la primera cuota).
  const initialFinanciamiento = { activo: false, num_cuotas: 6, frecuencia: 'mensual', fecha_primera: '', cuotas: [] };
  const [financiamiento, setFinanciamiento] = useState(initialFinanciamiento);
  // Al editar un financiamiento existente: ids/numeros de todas sus filas-pagaré
  // (para borrarlas y recrearlas). Solo se llena si NINGÚN pagaré tiene pagos.
  const [financiamientoGrupo, setFinanciamientoGrupo] = useState(null);
  const [compraConPagos, setCompraConPagos] = useState(false);

  const fetchInitialData = useCallback(async () => {
    const { data: provData, error: provError } = await supabase.from('proveedores').select('*');
    if (provError) toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los proveedores.' });
    else setProveedores(provData);

    const { data: almData, error: almError } = await supabase.from('almacenes').select('*');
    if (almError) toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los almacenes.' });
    else {
      setAlmacenes(almData);
      // Ensure ALM01 is selected if it exists and no other is set
      if (almData.length > 0) {
        setCompra(prev => ({ ...prev, almacen_id: prev.almacen_id || 'a01dc84d-a24d-417d-b30b-72d41a2a8fd7' }));
      }
    }

    // Cargar catálogos de marcas y modelos para auto-detección OCR
    const { data: tiposData } = await supabase.from('tipos_producto').select('id, nombre').order('nombre');
    if (tiposData) setCatalogTipos(tiposData);

    const { data: marcasData } = await supabase.from('marcas').select('id, nombre').order('nombre');
    if (marcasData) setCatalogMarcas(marcasData);

    const { data: modelosData } = await supabase.from('modelos').select('id, nombre').order('nombre');
    if (modelosData) setCatalogModelos(modelosData);

    const { data: nextNum, error: numError } = await supabase.rpc('get_next_compra_numero');
    if (!numError && nextNum) {
      setCompra(prev => ({ ...prev, numero: nextNum }));
    }
  }, [toast]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Refrescar la lista de proveedores cuando otro módulo crea/edita/elimina un
  // suplidor, sin reiniciar el resto del formulario de compra en curso.
  useEffect(() => onProveedoresActualizado(async () => {
    const { data } = await supabase.from('proveedores').select('*');
    if (data) setProveedores(data);
  }), []);

  const resetForm = useCallback(async () => {
    setCompra(initialState);
    setDetalles([]);
    setCurrentDetalle(initialDetalleState);
    setEditingDetalleIndex(null);
    setPagos([{ tipo: '01', referencia: '', monto: 0, id: Date.now() }]);
    setFinanciamiento({ activo: false, num_cuotas: 6, frecuencia: 'mensual', fecha_primera: '', cuotas: [] });
    setFinanciamientoGrupo(null);
    setCompraConPagos(false);

    // Fetch new number after reset
    const { data: nextNum, error: numError } = await supabase.rpc('get_next_compra_numero');
    if (!numError && nextNum) {
      setCompra(prev => ({ ...prev, numero: nextNum }));
    }
  }, []);

  // --- EDICION DE COMPRA ---
  useEffect(() => {
    const loadCompraData = async () => {
      if (!compraParaEditar) return;
      setIsEditMode(true);
      
      const { data, error } = await supabase
        .from('compras')
        .select(`*, compras_detalle(*)`)
        .eq('id', compraParaEditar.id)
        .single();

      if (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cargar la compra.' });
        return;
      }

      // ¿Es parte de un financiamiento por cuotas? Los pagarés comparten el
      // número base y llevan sufijo '-01', '-02'... (o '-AD'). Si el usuario
      // abrió cualquiera de ellos, cargamos TODO el grupo para editarlo junto.
      const mGrupo = String(data.numero || '').match(/^(.*)-(\d{2}|AD)$/);
      let grupo = null;
      let baseNum = null;
      if (mGrupo) {
        baseNum = mGrupo[1];
        const { data: hermanos } = await supabase
          .from('compras')
          .select('*, compras_detalle(*)')
          .eq('suplidor_id', data.suplidor_id)
          .like('numero', `${baseNum}-%`)
          .order('numero', { ascending: true });
        if (hermanos && hermanos.length >= 2) grupo = hermanos;
      }

      const esGrupo = !!grupo;
      // Editable solo si NINGÚN pagaré tiene pagos aplicados.
      const grupoConPagos = esGrupo && grupo.some(g => Number(g.monto_pagado || 0) > 0 || (g.estado && g.estado !== 'PENDIENTE'));
      const conPagos = esGrupo ? grupoConPagos : (Number(data.monto_pagado || 0) > 0);
      setCompraConPagos(conPagos);
      // La fila que tiene el detalle/inventario (normalmente '-01').
      const filaDetalle = esGrupo
        ? (grupo.find(g => Array.isArray(g.compras_detalle) && g.compras_detalle.length > 0) || grupo[0])
        : data;

      setCompra({
        id: filaDetalle.id,
        numero: esGrupo ? baseNum : data.numero,   // en grupo, el número base (sin sufijo)
        fecha: new Date(filaDetalle.fecha),
        ncf: filaDetalle.ncf || '',
        referencia: data.referencia || '',
        tipo_bienes_servicios: filaDetalle.tipo_bienes_servicios || '09',
        sub_tipo: filaDetalle.sub_tipo || 'Compra de Merc',
        suplidor_id: data.suplidor_id,
        almacen_id: filaDetalle.almacen_id || 'a01dc84d-a24d-417d-b30b-72d41a2a8fd7',
        itbis_incluido: filaDetalle.itbis_incluido ?? false,
        actualizar_precios: filaDetalle.actualizar_precios ?? true,
        forma_pago: esGrupo ? 'Credito' : (data.forma_pago || 'Contado'),
        dias_credito: filaDetalle.dias_credito || 0,
        id_orden_origen: filaDetalle.id_orden_origen || null,
      });

      // Compra en US$: en la BD todo está en RD$; en pantalla se edita en
      // dólares con la tasa con la que se grabó
      const monedaRef = esGrupo ? filaDetalle.moneda : data.moneda;
      const tasaRef = Number(esGrupo ? filaDetalle.tasa_cambio : data.tasa_cambio);
      const tasaCompraUSD = monedaRef === 'USD' && tasaRef > 0 ? tasaRef : 0;
      if (tasaCompraUSD) setTasaDia(tasaCompraUSD);
      const aUSD = (v) => Number(((Number(v) || 0) / tasaCompraUSD).toFixed(2));

      if (filaDetalle.compras_detalle) {
        setDetalles(filaDetalle.compras_detalle.map(d => ({
          ...d,
          costo_unitario: tasaCompraUSD ? aUSD(d.costo_unitario) : d.costo_unitario,
          importe: tasaCompraUSD ? aUSD(d.importe) : d.importe,
          original_id: d.id,
          id: Math.random() // for local unique key rendering
        })));
      }

      if (esGrupo) {
        // Reconstruir el calendario de pagarés desde las filas hermanas.
        const cuotas = grupo
          .slice()
          .sort((a, b) => String(a.numero).localeCompare(String(b.numero), undefined, { numeric: true }))
          .map((g, i) => {
            const dias = Number(g.dias_credito || 0);
            const venc = new Date(new Date(g.fecha).getTime() + dias * 86400000);
            const monto = tasaCompraUSD ? Number(g.total_usd ?? aUSD(g.total_compra)) : Number(g.total_compra || 0);
            const y = venc.getFullYear();
            const m = String(venc.getMonth() + 1).padStart(2, '0');
            const d = String(venc.getDate()).padStart(2, '0');
            return { n: i + 1, fecha: `${y}-${m}-${d}`, monto };
          });
        setFinanciamiento({
          activo: !grupoConPagos,
          num_cuotas: cuotas.length,
          frecuencia: 'mensual',
          fecha_primera: cuotas[0]?.fecha || '',
          cuotas,
        });
        setFinanciamientoGrupo(grupoConPagos ? null : { ids: grupo.map(g => g.id), numeros: grupo.map(g => g.numero) });
      } else {
        const rawPagos = data.pagos || [];
        if (rawPagos.length > 0) {
            setPagos(tasaCompraUSD ? rawPagos.map(p => ({ ...p, monto: p.monto_usd ?? aUSD(p.monto) })) : rawPagos);
        } else if (data.monto_pagado > 0) {
            setPagos([{ tipo: '01', referencia: '', monto: tasaCompraUSD ? aUSD(data.monto_pagado) : data.monto_pagado, id: Date.now() }]);
        }
      }

      if (esGrupo && grupoConPagos) {
        toast({ variant: 'destructive', title: 'Financiamiento con pagos', description: `Este financiamiento (${grupo.length} pagarés) ya tiene pagos aplicados; no se puede editar.` });
      } else {
        toast({ title: 'Modo Edición', description: esGrupo ? `Editando financiamiento ${baseNum} (${grupo.length} pagarés)` : `Editando compra ${data.numero}` });
      }
    };
    
    loadCompraData();
  }, [compraParaEditar, toast]);

  // --- Integration with Orden de Compra ---
  useEffect(() => {
    if (!ordenParaFacturar) return;
    const cargarOrden = async () => {
      const { orderData, details } = ordenParaFacturar;

      setCompra(prev => ({
        ...prev,
        suplidor_id: orderData.suplidor_id,
        itbis_incluido: orderData.itbis_incluido ?? true,
        referencia: '', // Dejar vacío para número de factura del suplidor
        id_orden_origen: orderData.id
      }));

      // Suplidor que factura en US$: los precios de la orden están en RD$
      // (catálogo); se convierten a dólares con la tasa del día
      let tasaOrden = 0;
      const { data: prov } = await supabase
        .from('proveedores').select('moneda').eq('id', orderData.suplidor_id).maybeSingle();
      if (prov?.moneda === 'USD') {
        const { data: t } = await supabase.rpc('get_tasa_dia');
        tasaOrden = Number(t) || 0;
        if (tasaOrden > 0) setTasaDia(tasaOrden);
      }
      const aUSD = (v) => Number(((Number(v) || 0) / tasaOrden).toFixed(2));

      const loadedDetails = details.map(d => ({
        id: Math.random(),
        codigo: d.codigo,
        descripcion: d.descripcion,
        cantidad: d.cantidad,
        unidad: d.unidad || 'UND',
        costo_unitario: tasaOrden > 0 ? aUSD(d.precio) : (d.precio || 0),
        descuento_pct: d.descuento_pct || 0,
        itbis_pct: d.itbis_pct ? (parseFloat(d.itbis_pct) / 100) : 0.18,
        importe: tasaOrden > 0 ? aUSD(d.importe) : d.importe,
        producto_id: d.producto_id,
        is_matched: true
      }));

      setDetalles(loadedDetails);

      if (prov?.moneda === 'USD' && !(tasaOrden > 0)) {
        toast({
          variant: 'destructive',
          title: 'Suplidor en US$ sin tasa del día',
          description: 'Los costos llegaron en RD$. Pon la tasa del día y re-digita los costos en dólares según la factura.',
        });
      } else {
        toast({
          title: 'Orden de Compra Cargada',
          description: `Se han importado ${loadedDetails.length} productos de la orden ${orderData.numero || ''}.${tasaOrden > 0 ? ` Costos convertidos a US$ (tasa ${tasaOrden}).` : ''}`
        });
      }

      // Clear the context state so it doesn't reload on next visit
      setOrdenParaFacturar(null);
    };
    cargarOrden();
  }, [ordenParaFacturar, setOrdenParaFacturar, toast]);

  const totals = useMemo(() => {
    let exento = 0;
    let gravado = 0;
    let descuento = 0;
    let itbis = 0;

    detalles.forEach(d => {
      const subtotalItem = Number((d.cantidad * d.costo_unitario).toFixed(2));
      const descuentoItem = Number((subtotalItem * (d.descuento_pct / 100)).toFixed(2));
      descuento += descuentoItem;

      const baseCalculo = Number((subtotalItem - descuentoItem).toFixed(2));

      if (d.itbis_pct > 0) {
        if (compra.itbis_incluido) {
          // Si está incluido, la base es (Total / 1.18) y el ITBIS es (Total - Base)
          const baseSinItbis = Number((baseCalculo / (1 + d.itbis_pct)).toFixed(2));
          gravado += baseSinItbis;
          itbis += Number((baseCalculo - baseSinItbis).toFixed(2));
        } else {
          // TRUNCAR A 2 DECIMALES SEGUN REQUERIMIENTO USER
          const itbisItem = Math.trunc((baseCalculo * d.itbis_pct) * 100) / 100;
          gravado += baseCalculo;
          itbis += itbisItem;
        }
      } else {
        exento += baseCalculo;
      }
    });

    const total = Number((gravado + exento + itbis).toFixed(2));
    return { exento, gravado, descuento, itbis, total };
  }, [detalles, compra.itbis_incluido]);

  // --- Suplidor que factura en US$: la compra se digita en dólares y el
  // sistema convierte a RD$ con la tasa del día al grabar (costo/precio
  // del producto y la contabilidad siguen en pesos) ---
  const suplidorActivo = useMemo(() => proveedores.find(p => p.id === compra.suplidor_id), [proveedores, compra.suplidor_id]);
  const esUSD = suplidorActivo?.moneda === 'USD';

  useEffect(() => {
    if (!esUSD) return;
    supabase.rpc('get_tasa_dia').then(({ data }) => {
      setTasaDia(prev => (prev > 0 ? prev : Number(data) || 0));
    });
  }, [esUSD]);

  const handleProductSelect = (product) => {
    // product.itbis_pct ya viene como decimal (0.18) de la DB
    const itbisPct = product.itbis_pct ?? 0.18;
    // El costo del catálogo está en RD$; si el suplidor factura en US$,
    // se sugiere convertido a dólares con la tasa del día
    const costoCatalogo = product.costo || 0;
    setCurrentDetalle(prev => ({
      ...prev,
      codigo: product.codigo,
      descripcion: product.descripcion,
      costo_unitario: esUSD && tasaDia > 0 ? Number((costoCatalogo / tasaDia).toFixed(2)) : costoCatalogo,
      itbis_pct: itbisPct,
      producto_id: product.id,
    }));
    setIsSearchModalOpen(false);
    setTimeout(() => {
      const input = document.getElementById('cantidad-producto');
      if (input) {
        input.focus();
        input.select();
      }
    }, 150);
  };

  const handleSearchByCode = async (code, crearSiNoExiste = false) => {
    if (!code) return;
    try {
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .ilike('codigo', code)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        handleProductSelect(data);
      } else if (crearSiNoExiste) {
        // Dealers/financieras: cada unidad (chasis) tiene código único que no
        // se repite — se crea aquí mismo sin salir de la compra. El costo va
        // al catálogo en RD$ (si el suplidor factura en US$, se convierte).
        const costoDigitado = parseFloat(currentDetalle.costo_unitario) || 0;
        setActiveLineId('staging');
        const sugerido = await buildSuggestedProductFromLine({
          codigo: code.trim(),
          descripcion: currentDetalle.descripcion || '',
          costo_unitario: esUSD && tasaDia > 0 ? Number((costoDigitado * tasaDia).toFixed(2)) : costoDigitado,
        });
        setTempProductData(sugerido);
        setIsProductModalOpen(true);
      } else {
        toast({ variant: 'destructive', title: 'No encontrado', description: 'Producto no encontrado con ese código. Presiona Enter sobre el código para crearlo.' });
      }
    } catch (e) {
      console.error(e);
      toast({ variant: 'destructive', title: 'Error', description: 'Error al buscar producto.' });
    }
  };

  const handleSuplidorSelect = (suplidor) => {
    setCompra(prev => ({
      ...prev,
      suplidor_id: suplidor.id,
      forma_pago: suplidor.vende_a_credito ? 'Credito' : prev.forma_pago,
      dias_credito: suplidor.vende_a_credito ? suplidor.dias_credito : prev.dias_credito
    }));
    setIsSuplidorModalOpen(false);
  };

  const handleEditSuplidor = (suplidor) => {
    setSelectedSuplidorToEdit(suplidor);
    setIsEditSuplidorModalOpen(true);
  };

  const handleEditSuplidorClose = (refresh) => {
    setIsEditSuplidorModalOpen(false);
    setSelectedSuplidorToEdit(null);
    if (refresh) {
      fetchInitialData();
    }
  };

  // --- Helpers para auto-detectar marca y modelos en la descripción ---
  const detectMarcaFromDescription = useCallback((descripcion) => {
    if (!descripcion || catalogMarcas.length === 0) return null;
    const desc = descripcion.toUpperCase();
    // Buscar marcas en la descripción, priorizando las más largas (para evitar falsos positivos)
    const sortedMarcas = [...catalogMarcas].sort((a, b) => b.nombre.length - a.nombre.length);
    for (const marca of sortedMarcas) {
      // Usar boundary check: la marca debe estar como palabra completa
      const regex = new RegExp(`\\b${marca.nombre.toUpperCase().replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`);
      if (regex.test(desc)) {
        return marca.id;
      }
    }
    return null;
  }, [catalogMarcas]);

  const detectModelosFromDescription = useCallback((descripcion) => {
    if (!descripcion || catalogModelos.length === 0) return [];
    const desc = descripcion.toUpperCase();
    const foundIds = [];
    const seenNames = new Set();
    // Buscar modelos, priorizando los más largos
    const sortedModelos = [...catalogModelos].sort((a, b) => b.nombre.length - a.nombre.length);
    for (const modelo of sortedModelos) {
      const nombreUpper = modelo.nombre.toUpperCase();
      if (seenNames.has(nombreUpper)) continue;
      // Solo buscar modelos con al menos 2 caracteres para evitar falsos positivos
      if (nombreUpper.length < 2) continue;
      const regex = new RegExp(`\\b${nombreUpper.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`);
      if (regex.test(desc)) {
        foundIds.push(modelo.id);
        seenNames.add(nombreUpper);
      }
    }
    return foundIds;
  }, [catalogModelos]);

  const detectTipoFromDescription = useCallback((descripcion) => {
    if (!descripcion || catalogTipos.length === 0) return null;
    const desc = descripcion.toUpperCase();
    const sortedTipos = [...catalogTipos].sort((a, b) => b.nombre.length - a.nombre.length);
    for (const tipo of sortedTipos) {
      const nombreUpper = tipo.nombre.toUpperCase();
      if (nombreUpper.length < 3) continue;
      const regex = new RegExp(`\\b${nombreUpper.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`);
      if (regex.test(desc)) return tipo.id;
    }
    return null;
  }, [catalogTipos]);

  const normalizeSuggestionText = useCallback((value = '') => (
    value
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  ), []);

  const getSuggestionTokens = useCallback((descripcion = '') => {
    const stopWords = new Set(['DEL', 'DE', 'LA', 'EL', 'LOS', 'LAS', 'PARA', 'POR', 'CON', 'SIN', 'UN', 'UNA', 'Y', 'O', 'EN', 'A', 'AL', 'UNIVERSAL', 'PRODUCTO']);
    return normalizeSuggestionText(descripcion)
      .split(' ')
      .filter(token => token.length >= 2 && !stopWords.has(token) && !/^\d+$/.test(token));
  }, [normalizeSuggestionText]);

  const pickWeightedValue = useCallback((matches, selector) => {
    const scoreByValue = new Map();
    matches.forEach(match => {
      const value = selector(match.product);
      if (value === null || value === undefined || value === '') return;
      scoreByValue.set(String(value), (scoreByValue.get(String(value)) || 0) + match.score);
    });
    return [...scoreByValue.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }, []);

  const pickWeightedArrayValues = useCallback((matches, selector, max = 4) => {
    const scoreByValue = new Map();
    matches.forEach(match => {
      const values = selector(match.product) || [];
      values.forEach(value => {
        if (!value) return;
        scoreByValue.set(String(value), (scoreByValue.get(String(value)) || 0) + match.score);
      });
    });
    return [...scoreByValue.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([value]) => value);
  }, []);

  const buildSuggestedProductFromLine = useCallback(async (line) => {
    const descripcion = line.descripcion || '';
    const tokens = getSuggestionTokens(descripcion);
    const tokenSet = new Set(tokens);
    const autoMarcaId = detectMarcaFromDescription(descripcion);
    const autoModelosIds = detectModelosFromDescription(descripcion).map(String);
    const autoTipoId = detectTipoFromDescription(descripcion);
    const fallbackCost = parseFloat(line.costo_unitario) || 0;
    const fallbackDiscount = 3;
    let matches = [];

    if (tokens.length > 0) {
      try {
        const { data: candidates, error } = await supabase
          .from('productos')
          .select('id, codigo, descripcion, ubicacion, tipo_id, marca_id, modelos_ids, suplidor_id, itbis_pct, costo, precio, presentaciones(*)')
          .eq('activo', true)
          .limit(300);

        if (error) throw error;

        matches = (candidates || [])
          .map(product => {
            const candidateTokens = new Set(getSuggestionTokens(product.descripcion || ''));
            const shared = [...tokenSet].filter(token => candidateTokens.has(token));
            let score = shared.reduce((sum, token) => sum + Math.min(4, token.length / 2), 0);

            if (autoMarcaId && String(product.marca_id) === String(autoMarcaId)) score += 3;
            if (autoTipoId && String(product.tipo_id) === String(autoTipoId)) score += 2;
            if (compra.suplidor_id && String(product.suplidor_id) === String(compra.suplidor_id)) score += 1.5;
            if (autoModelosIds.length > 0 && (product.modelos_ids || []).some(id => autoModelosIds.includes(String(id)))) score += 3;

            return { product, score, sharedCount: shared.length };
          })
          .filter(match => match.score >= 3 && match.sharedCount > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 25);
      } catch (error) {
        console.error('Error calculando sugerencias de mercancia:', error);
      }
    }

    const suggestedTipoId = autoTipoId ? String(autoTipoId) : pickWeightedValue(matches, product => product.tipo_id);
    const suggestedMarcaId = autoMarcaId ? String(autoMarcaId) : pickWeightedValue(matches, product => product.marca_id);
    const suggestedModelosIds = autoModelosIds.length > 0 ? autoModelosIds : pickWeightedArrayValues(matches, product => product.modelos_ids || []);
    const suggestedUbicacion = pickWeightedValue(matches, product => product.ubicacion);
    const suggestedItbis = pickWeightedValue(matches, product => product.itbis_pct);
    const similarPresentations = matches
      .flatMap(match => (match.product.presentaciones || []).map(presentation => ({ presentation, score: match.score })))
      .filter(({ presentation }) => (parseFloat(presentation.margen_pct) || 0) > 0);
    const marginSum = similarPresentations.reduce((sum, item) => sum + ((parseFloat(item.presentation.margen_pct) || 0) * item.score), 0);
    const marginWeight = similarPresentations.reduce((sum, item) => sum + item.score, 0);
    const suggestedMargin = marginWeight > 0 ? Math.round((marginSum / marginWeight) * 100) / 100 : 0;
    const suggestedPrice = suggestedMargin > 0 && fallbackCost > 0 ? Number((fallbackCost * (1 + suggestedMargin / 100)).toFixed(2)) : 0;

    return {
      codigo: line.codigo || '',
      referencia: line.referencia || '',
      descripcion,
      costo: fallbackCost,
      suplidor_id: compra.suplidor_id || null,
      tipo_id: suggestedTipoId,
      marca_id: suggestedMarcaId,
      modelos_ids: suggestedModelosIds,
      ubicacion: suggestedUbicacion || '',
      itbis_pct: suggestedItbis !== null && suggestedItbis !== undefined ? parseFloat(suggestedItbis) : (line.itbis_pct ?? 0.18),
      presentaciones: [{
        id: `new-${Date.now()}`,
        tipo: line.unidad === 'UND' ? 'UND - Unidad' : (line.unidad || 'UND - Unidad'),
        cantidad: '1',
        costo: fallbackCost.toFixed(2),
        margen_pct: suggestedMargin ? String(suggestedMargin) : '0',
        precio1: suggestedPrice ? suggestedPrice.toFixed(2) : '0.00',
        precio2: suggestedPrice ? (suggestedPrice * (1 - precio2DescuentoPct / 100)).toFixed(2) : '0.00',
        precio3: suggestedPrice ? (suggestedPrice * (1 - precio3DescuentoPct / 100)).toFixed(2) : '0.00',
        auto_precio2: true,
        auto_precio3: true,
        descuento_pct: String(fallbackDiscount),
        precio_final: suggestedPrice ? (suggestedPrice * (1 - fallbackDiscount / 100)).toFixed(2) : '0.00',
        afecta_ft: true,
        afecta_inv: true,
      }],
      suggestion_info: {
        similar_count: matches.length,
        descuento_maximo_pct: fallbackDiscount,
      },
    };
  }, [compra.suplidor_id, detectMarcaFromDescription, detectModelosFromDescription, detectTipoFromDescription, getSuggestionTokens, pickWeightedArrayValues, pickWeightedValue, precio2DescuentoPct, precio3DescuentoPct]);

  const handleCreateProductFromLine = async (line) => {
    setActiveLineId(line.id);
    // El costo del catálogo vive en RD$; si la compra se digita en US$, se convierte
    const lineaCatalogo = esUSD && tasaDia > 0
      ? { ...line, costo_unitario: Number(((parseFloat(line.costo_unitario) || 0) * tasaDia).toFixed(2)) }
      : line;
    const suggestedProduct = await buildSuggestedProductFromLine(lineaCatalogo);
    setTempProductData(suggestedProduct);
    setIsProductModalOpen(true);
  };

  const handleSaveProductFromOCR = async (productData, presentations, isEditing) => {
    try {
      const parseNumeric = (value) => {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? 0 : parsed;
      };

      const { existencia, id: _, ...restProductData } = productData;

      const productPayload = {
        ...restProductData,
        costo: parseNumeric(productData.costo),
        precio: parseNumeric(productData.precio),
        itbis_pct: parseNumeric(productData.itbis_pct),
        min_stock: parseNumeric(productData.min_stock),
        max_stock: parseNumeric(productData.max_stock),
        garantia_meses: parseInt(productData.garantia_meses, 10) || 0,
      };

      if (!isEditing) delete productPayload.id;

      // Candado: el código es único por empresa (dealers/financieras usan el
      // chasis como código y NO puede repetirse)
      if (!isEditing && productPayload.codigo) {
        const { data: existentes } = await supabase
          .from('productos')
          .select('id, codigo, descripcion')
          .ilike('codigo', productPayload.codigo.trim())
          .limit(1);
        if (existentes && existentes.length > 0) {
          toast({
            variant: 'destructive',
            title: 'Código duplicado',
            description: `El código "${productPayload.codigo}" ya existe en el catálogo (${existentes[0].descripcion}). Cada unidad debe tener su código único.`,
          });
          return;
        }
      }

      // Insertar nuevo producto
      const { data: savedProduct, error } = await supabase
        .from('productos')
        .insert(productPayload)
        .select()
        .single();

      if (error) throw error;

      // Guardar presentaciones si existen
      if (savedProduct && presentations.length > 0) {
        const presentationsToUpsert = presentations.map((p) => {
          const { id, ...rest } = p;
          return {
            ...rest,
            producto_id: savedProduct.id,
            cantidad: parseNumeric(p.cantidad),
            costo: parseNumeric(p.costo),
            margen_pct: parseNumeric(p.margen_pct),
            precio1: parseNumeric(p.precio1),
            descuento_pct: parseNumeric(p.descuento_pct),
            precio_final: parseNumeric(p.precio_final),
          };
        });

        const { error: presError } = await supabase.from('presentaciones').upsert(presentationsToUpsert);
        if (presError) throw presError;
      }

      if (activeLineId === 'staging') {
        // Producto creado desde la casilla amarilla (código nuevo digitado a
        // mano): se llena la casilla y solo falta cantidad + botón verde
        handleProductSelect(savedProduct);
      } else {
        // VINCULAR EN LA TABLA DE COMPRA — reflejar todos los cambios hechos en el formulario
        // (si la compra se digita en US$, el costo del catálogo RD$ se convierte a dólares)
        const costoLinea = esUSD && tasaDia > 0
          ? Number(((savedProduct.costo || 0) / tasaDia).toFixed(2))
          : savedProduct.costo;
        setDetalles(prev => prev.map(d =>
          d.id === activeLineId
            ? {
                ...d,
                producto_id: savedProduct.id,
                is_matched: true,
                codigo: savedProduct.codigo || d.codigo,
                descripcion: savedProduct.descripcion || d.descripcion,
                referencia: savedProduct.referencia || d.referencia,
                costo_unitario: costoLinea || d.costo_unitario,
                itbis_pct: savedProduct.itbis_pct ?? d.itbis_pct,
              }
            : d
        ));
      }

      setIsProductModalOpen(false);
      toast({ title: 'Éxito', description: 'Producto creado y vinculado a la compra correctamente.' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error al crear producto',
        description: error.message,
      });
    }
  };

  const handleDataExtracted = async (data) => {
    setOcrData({
      image_paths: data.image_paths,
      ocr_text: data.ocr_text,
      extracted_json: data
    });

    const { invoice, items: extractedItems } = data;

    // El suplidor ya fue seleccionado previamente (requerido antes de subir foto)
    // Solo actualizamos datos de encabezado de la factura

    // 2. Mapear Datos de Encabezado
    setCompra(prev => ({
      ...prev,
      // No reemplazamos 'numero' para mantener el orden del sistema
      ncf: invoice.ncf || prev.ncf,
      referencia: invoice.invoice_number || invoice.reference || prev.referencia, // Factura subida va a referencia
      // Añadimos T12:00:00 para evitar que el ajuste de zona horaria retrase la fecha un día
      fecha: invoice.date ? new Date(`${invoice.date}T12:00:00`) : prev.fecha,
    }));

    // 3. Procesar Items y buscar en Inventario
    const processedItems = await Promise.all(extractedItems.map(async (item) => {
      let producto_id = null;
      let matched = false;
      let descripcion = item.description || '';

      // Pre-procesar porcentajes (si vienen como 18 en lugar de 0.18)
      let itbis_pct = item.itbis_pct || 0.18;
      if (itbis_pct > 1) itbis_pct = itbis_pct / 100;

      let discount_pct = item.discount_pct || 0;
      if (discount_pct > 1) discount_pct = discount_pct / 100;

      let productoCosto = 0;
      let productoItbis = null;

      if (item.code) {
        // Corrección de OCR: Si la IA lee '1-' o 'l-' al inicio de un código, reemplazarlo por 'I-' mayúscula
        item.code = item.code.replace(/^[1l]-/i, 'I-');

        const { data: product } = await supabase
          .from('productos')
          .select('id, descripcion, costo, itbis_pct, referencia, suplidor_id, marca_id, modelos_ids')
          .ilike('codigo', item.code)
          .maybeSingle();

        if (product) {
          producto_id = product.id;
          matched = true;
          productoCosto = product.costo || 0;
          productoItbis = product.itbis_pct ?? null;
          descripcion = product.descripcion;

          // Campos a actualizar si están vacíos en el producto existente
          const updateFields = {};

          if (!product.referencia && item.reference) {
            updateFields.referencia = item.reference;
          }

          if (!product.suplidor_id && compra.suplidor_id) {
            updateFields.suplidor_id = compra.suplidor_id;
          }

          if (!product.marca_id) {
            const detectedMarca = detectMarcaFromDescription(product.descripcion || descripcion);
            if (detectedMarca) {
              updateFields.marca_id = detectedMarca;
            }
          }

          if (!product.modelos_ids || product.modelos_ids.length === 0) {
            const detectedModelos = detectModelosFromDescription(product.descripcion || descripcion);
            if (detectedModelos.length > 0) {
              updateFields.modelos_ids = detectedModelos;
            }
          }

          if (Object.keys(updateFields).length > 0) {
            await supabase
              .from('productos')
              .update(updateFields)
              .eq('id', product.id);
          }
        }
      }

      if (productoItbis !== null) itbis_pct = productoItbis;
      const costo = item.unit_cost || productoCosto;
      const cantidad = item.qty || 0;

      // La base se calcula restando el descuento
      const baseCalculo = cantidad * costo * (1 - discount_pct);

      // Si el ITBIS no está incluido, lo sumamos al importe de la línea (TRUNCANDO ITBIS)
      let importe = baseCalculo;
      if (itbis_pct > 0 && !compra.itbis_incluido) {
        const itbisValor = Math.trunc((baseCalculo * itbis_pct) * 100) / 100;
        importe = baseCalculo + itbisValor;
      }

      return {
        id: Math.random(),
        codigo: item.code || '',
        referencia: item.reference || '',
        descripcion,
        cantidad,
        unidad: item.unit || 'UND',
        costo_unitario: costo,
        descuento_pct: discount_pct * 100, // Lo guardamos como entero (e.g. 15) para el resto del sistema
        itbis_pct,
        importe,
        producto_id,
        is_matched: matched
      };
    }));

    setDetalles(processedItems);

    toast({
      title: "Factura Procesada",
      description: `Se extrajeron ${processedItems.length} items. Por favor revise los datos.`
    });
  };

  const addDetalle = () => {
    const cantidad = parseFloat(currentDetalle.cantidad);
    if (!currentDetalle.codigo || !currentDetalle.descripcion || !cantidad || cantidad <= 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Complete los datos del producto.' });
      return;
    }
    const costo = parseFloat(currentDetalle.costo_unitario) || 0;
    const descuento = parseFloat(currentDetalle.descuento_pct) || 0;

    let importe = 0;
    const subtotal = Number((cantidad * costo).toFixed(2));
    const descValor = Number((subtotal * (descuento / 100)).toFixed(2));
    const baseCalculo = Number((subtotal - descValor).toFixed(2));

    if (currentDetalle.itbis_pct > 0) {
      if (compra.itbis_incluido) {
        importe = baseCalculo;
      } else {
        // TRUNCAR A 2 DECIMALES SEGUN REQUERIMIENTO USER
        const itbisValor = Math.trunc((baseCalculo * currentDetalle.itbis_pct) * 100) / 100;
        importe = Number((baseCalculo + itbisValor).toFixed(2));
      }
    } else {
      importe = baseCalculo;
    }

    const lineaFinal = { ...currentDetalle, cantidad, costo_unitario: costo, descuento_pct: descuento, importe: Number(importe.toFixed(2)) };

    if (editingDetalleIndex !== null && editingDetalleIndex >= 0) {
      // Actualizar en su slot original (no mueve el producto al final)
      setDetalles(prev => {
        const next = [...prev];
        if (editingDetalleIndex < next.length) {
          next[editingDetalleIndex] = { ...lineaFinal, id: next[editingDetalleIndex].id };
        }
        return next;
      });
      setEditingDetalleIndex(null);
    } else {
      setDetalles([...detalles, { ...lineaFinal, id: Date.now() }]);
    }
    setCurrentDetalle(initialDetalleState);
    document.getElementById('codigo-producto')?.focus();
  };

  const removeDetalle = (id) => {
    const idx = detalles.findIndex(d => d.id === id);
    setDetalles(detalles.filter(d => d.id !== id));
    // Si se eliminó el que estaba siendo editado, limpiar staging.
    if (editingDetalleIndex !== null && idx === editingDetalleIndex) {
      setEditingDetalleIndex(null);
      setCurrentDetalle(initialDetalleState);
    } else if (editingDetalleIndex !== null && idx < editingDetalleIndex) {
      // Si se quitó una línea antes de la editada, reindexar.
      setEditingDetalleIndex(editingDetalleIndex - 1);
    }
  };

  const handleEditLine = (line) => {
    // Patrón igual al de Ventas (useVentas.editItem): el doble-click sube
    // una copia al staging para editar, pero el producto PERMANECE en la
    // lista. Si ya había algo siendo editado, primero se confirma ese
    // cambio en su slot original para no perderlo.
    const idx = detalles.findIndex(d => d.id === line.id);
    if (idx < 0) return;

    if (editingDetalleIndex !== null && editingDetalleIndex >= 0 && currentDetalle.codigo) {
      const cantPrev = parseFloat(currentDetalle.cantidad) || 0;
      const costoPrev = parseFloat(currentDetalle.costo_unitario) || 0;
      const descPrev = parseFloat(currentDetalle.descuento_pct) || 0;
      const subtotalPrev = Number((cantPrev * costoPrev).toFixed(2));
      const descValorPrev = Number((subtotalPrev * (descPrev / 100)).toFixed(2));
      const basePrev = Number((subtotalPrev - descValorPrev).toFixed(2));
      let importePrev = basePrev;
      if (currentDetalle.itbis_pct > 0 && !compra.itbis_incluido) {
        const itbisVal = Math.trunc((basePrev * currentDetalle.itbis_pct) * 100) / 100;
        importePrev = Number((basePrev + itbisVal).toFixed(2));
      }
      setDetalles(prev => {
        const next = [...prev];
        if (editingDetalleIndex < next.length) {
          next[editingDetalleIndex] = {
            ...currentDetalle,
            cantidad: cantPrev,
            costo_unitario: costoPrev,
            descuento_pct: descPrev,
            importe: Number(importePrev.toFixed(2)),
            id: next[editingDetalleIndex].id,
          };
        }
        return next;
      });
    }

    setEditingDetalleIndex(idx);
    setCurrentDetalle({
      codigo: line.codigo,
      referencia: line.referencia || '',
      descripcion: line.descripcion,
      cantidad: line.cantidad,
      unidad: line.unidad || 'UND',
      costo_unitario: line.costo_unitario,
      descuento_pct: line.descuento_pct,
      itbis_pct: line.itbis_pct,
      importe: line.importe,
      producto_id: line.producto_id,
    });

    setTimeout(() => {
      const input = document.getElementById('cantidad-producto');
      input?.focus();
      input?.select?.();
    }, 100);
  };

  const handleSave = async () => {
    if (isSaving) return;

    if (!compra.suplidor_id || !compra.almacen_id || detalles.length === 0 || (!compra.referencia || compra.referencia.trim() === '')) {
      toast({ 
        variant: "destructive", 
        title: "Datos incompletos", 
        description: "Debe seleccionar un suplidor, añadir al menos un producto y especificar la Referencia (No. Factura)." 
      });
      return;
    }

    if (esUSD && !(Number(tasaDia) > 0)) {
      toast({
        variant: "destructive",
        title: "Falta la tasa del día",
        description: "Este suplidor factura en US$. Indica la tasa de cambio del día para poder grabar la compra."
      });
      return;
    }

    const totalPagado = pagos.reduce((sum, p) => sum + (parseFloat(p.monto) || 0), 0);
    const diferencia = Math.abs(totalPagado - totals.total);

    // Solo exigimos pago completo si NO es crédito
    if (compra.forma_pago !== 'Credito' && diferencia > 0.01) {
      toast({
        variant: "destructive",
        title: "Diferencia en Montos",
        description: `El total pagado (${totalPagado.toFixed(2)}) debe ser igual al total de la compra (${totals.total.toFixed(2)}).`
      });
      return;
    }

    // Explicitly get user session to avoid RLS issues
    const { data: { user: authUser } } = await supabase.auth.getUser();
    setIsSaving(true);

    const aplicarRecepcionOrdenes = async (savedCompra) => {
      const pendientesCompra = detalles
        .filter((d) => d.producto_id || d.codigo)
        .map((d) => ({
          producto_id: d.producto_id,
          codigo: d.codigo,
          cantidad_restante: Number(d.cantidad || 0),
        }));

      const aplicarEnOrden = async (ordenId) => {
        const { data: ordenDetalles, error: ordenDetallesError } = await supabase
          .from('ordenes_compra_detalle')
          .select('*')
          .eq('orden_compra_id', ordenId)
          .neq('estado_linea', 'recibida')
          .order('id', { ascending: true });

        if (ordenDetallesError) throw ordenDetallesError;

        for (const od of ordenDetalles || []) {
          const pendienteOrden = Number(od.cantidad_pendiente ?? Math.max(0, Number(od.cantidad_pedida ?? od.cantidad ?? 0) - Number(od.cantidad_recibida ?? 0)));
          if (pendienteOrden <= 0) continue;

          const lineaCompra = pendientesCompra.find((d) => (
            d.cantidad_restante > 0
            && (
              (d.producto_id && od.producto_id && String(d.producto_id) === String(od.producto_id))
              || (d.codigo && od.codigo && String(d.codigo).toUpperCase() === String(od.codigo).toUpperCase())
            )
          ));

          if (!lineaCompra) continue;

          const recibidoAhora = Math.min(pendienteOrden, Number(lineaCompra.cantidad_restante || 0));
          const cantidadPedida = Number(od.cantidad_pedida ?? od.cantidad ?? 0);
          const totalRecibido = Number(od.cantidad_recibida || 0) + recibidoAhora;
          const pendienteNuevo = Math.max(0, cantidadPedida - totalRecibido);

          await supabase
            .from('ordenes_compra_detalle')
            .update({
              cantidad_pedida: cantidadPedida,
              cantidad_recibida: totalRecibido,
              cantidad_pendiente: pendienteNuevo,
              estado_linea: pendienteNuevo <= 0 ? 'recibida' : 'parcial',
            })
            .eq('id', od.id);

          lineaCompra.cantidad_restante -= recibidoAhora;
        }

        await supabase.rpc('recalcular_estado_recepcion_orden', { p_orden_id: ordenId });
      };

      if (savedCompra.id_orden_origen) {
        await aplicarEnOrden(savedCompra.id_orden_origen);
        return;
      }

      const { data: ordenesEnCamino, error: ordenesError } = await supabase
        .from('ordenes_compra')
        .select('id, numero')
        .eq('suplidor_id', savedCompra.suplidor_id)
        .in('estado', ['Enviada', 'Parcial'])
        .order('fecha_enviada', { ascending: true, nullsFirst: false })
        .limit(10);

      if (ordenesError) throw ordenesError;

      for (const ordenPendiente of ordenesEnCamino || []) {
        if (!pendientesCompra.some((d) => d.cantidad_restante > 0)) break;
        await aplicarEnOrden(ordenPendiente.id);
      }

      // Fase 1 (cierre del ciclo): si quedó mercancía sin conciliar, rebajar
      // también los BORRADORES Pendiente del suplidor. Antes solo se tocaban
      // las Enviadas, y como el paso "Enviar" se olvidaba, las órdenes
      // quedaban vivas para siempre pidiendo lo que ya llegó.
      if (pendientesCompra.some((d) => d.cantidad_restante > 0)) {
        const { data: borradores } = await supabase
          .from('ordenes_compra')
          .select('id, numero')
          .eq('suplidor_id', savedCompra.suplidor_id)
          .eq('estado', 'Pendiente')
          .order('fecha_orden', { ascending: true })
          .limit(10);
        for (const ordenBorrador of borradores || []) {
          if (!pendientesCompra.some((d) => d.cantidad_restante > 0)) break;
          await aplicarEnOrden(ordenBorrador.id);
        }
      }
    };

    // Validación de duplicidad (Mismo Suplidor con misma Referencia o NCF)
    let queryVal = supabase.from('compras').select('id, referencia, ncf').eq('suplidor_id', compra.suplidor_id);
    const orConds = [];
    if (compra.referencia && compra.referencia.trim() !== '') {
      orConds.push(`referencia.eq."${compra.referencia}"`);
    }
    if (compra.ncf && compra.ncf.trim() !== '') {
      orConds.push(`ncf.eq."${compra.ncf}"`);
    }
    
    if (orConds.length > 0) {
      queryVal = queryVal.or(orConds.join(','));
      if (isEditMode && compra.id) {
        queryVal = queryVal.neq('id', compra.id);
      }
      // Al editar un financiamiento, sus propias filas-pagaré comparten la
      // referencia: excluirlas para que no se detecten como duplicado.
      if (isEditMode && financiamientoGrupo?.ids?.length) {
        queryVal = queryVal.not('id', 'in', `(${financiamientoGrupo.ids.join(',')})`);
      }

      const { data: posiblesDuplicados, error: dupError } = await queryVal;
      
      if (!dupError && posiblesDuplicados && posiblesDuplicados.length > 0) {
        const refUpper = compra.referencia?.toUpperCase() || '';
        const ncfUpper = compra.ncf?.toUpperCase() || '';
        
        const matchRef = posiblesDuplicados.some(c => c.referencia?.toUpperCase() === refUpper);
        const matchNCF = posiblesDuplicados.some(c => c.ncf?.toUpperCase() === ncfUpper && ncfUpper !== '');
        
        let msj = '';
        if (matchRef && matchNCF) msj = 'La Referencia (Factura) y el NCF ya existen';
        else if (matchRef) msj = `La Factura N° "${compra.referencia}" ya existe`;
        else if (matchNCF) msj = `El NCF "${compra.ncf}" ya existe`;
        
        if (msj) {
           toast({
             variant: "destructive",
             title: "Bloqueo: Factura Duplicada",
             description: `${msj} para este suplidor en una compra anterior.`
           });
           setIsSaving(false);
           return;
        }
      }
    }

    // Suplidor en US$: en pantalla todo se digitó en dólares; a la BD va
    // convertido a RD$ con la tasa del día (la deuda queda en US$)
    const usd = esUSD && Number(tasaDia) > 0;
    const tasa = Number(tasaDia) || 0;
    const rd = (v) => Number(((Number(v) || 0) * tasa).toFixed(2));
    const detallesGuardar = usd
      ? detalles.map(d => ({ ...d, costo_unitario: rd(d.costo_unitario), importe: rd(d.importe) }))
      : detalles;
    const totalsGuardar = usd
      ? { exento: rd(totals.exento), gravado: rd(totals.gravado), descuento: rd(totals.descuento), itbis: rd(totals.itbis), total: rd(totals.total) }
      : totals;

    const compraData = {
      ...compra,
      fecha: formatDateForSupabase(compra.fecha),
      total_exento: totalsGuardar.exento,
      total_gravado: totalsGuardar.gravado,
      descuento_total: totalsGuardar.descuento,
      itbis_total: totalsGuardar.itbis,
      total_compra: totalsGuardar.total,
      monto_pagado: compra.forma_pago === 'Credito' ? 0 : totalsGuardar.total,
      monto_pendiente: compra.forma_pago === 'Credito' ? totalsGuardar.total : 0,
      estado: compra.forma_pago === 'Credito' ? 'PENDIENTE' : 'PAGADA',
      moneda: usd ? 'USD' : 'DOP',
      tasa_cambio: usd ? tasa : null,
      total_usd: usd ? totals.total : null,
      pendiente_usd: usd ? (compra.forma_pago === 'Credito' ? totals.total : 0) : null,
      pagos: pagos.filter(p => p.monto > 0).map(p => usd ? { ...p, monto: rd(p.monto), monto_usd: Number(p.monto) } : p),
      usuario_id: authUser?.id || user?.id,
      invoice_image_path: ocrData?.image_paths,
      ocr_text: ocrData?.ocr_text,
      extracted_json: ocrData?.extracted_json,
      id_orden_origen: null // Will be set below if valid
    };

    // Validate id_orden_origen existence
    if (compra.id_orden_origen && compra.id_orden_origen.length > 10) {
      const { data: ordenExists } = await supabase
        .from('ordenes_compra')
        .select('id')
        .eq('id', compra.id_orden_origen)
        .maybeSingle();

      if (ordenExists) {
        compraData.id_orden_origen = compra.id_orden_origen;
      }
    }

    // ===== Financiamiento por cuotas (pagarés) =====
    // Cuando el suplidor factura a pagarés, la deuda se divide en N filas
    // 'compras' CREDITO/PENDIENTE (una por cuota, con su vencimiento vía
    // dias_credito), igual que los pagarés de Motores del Sur. El inventario,
    // el detalle y la actualización de precios se registran UNA sola vez, en la
    // primera cuota. La suma de las N filas = total de la compra (no duplica).
    const financiar = compra.forma_pago === 'Credito'
      && financiamiento?.activo
      && Array.isArray(financiamiento?.cuotas)
      && financiamiento.cuotas.length >= 2;

    let pagareRowsExtra = [];
    if (financiar) {
      const cuotas = financiamiento.cuotas;
      const sumaCuotas = cuotas.reduce((s, c) => s + (Number(c.monto) || 0), 0);
      if (Math.abs(sumaCuotas - Number(totals.total || 0)) > 0.01) {
        toast({
          variant: 'destructive',
          title: 'Los pagarés no cuadran',
          description: `La suma de los pagarés (${sumaCuotas.toFixed(2)}) debe ser igual al total de la compra (${Number(totals.total).toFixed(2)}).`,
        });
        setIsSaving(false);
        return;
      }

      const baseNum = compra.numero || compra.referencia || 'COMPRA';
      const fechaBase = String(compraData.fecha).slice(0, 10);
      const diasHasta = (fstr) => {
        const dias = Math.round(
          (new Date(`${String(fstr).slice(0, 10)}T00:00:00`) - new Date(`${fechaBase}T00:00:00`)) / 86400000
        );
        return Math.max(0, dias || 0);
      };
      const plazo = cuotas.length;
      const mkRow = (c, idx) => {
        const montoDisp = Number(c.monto) || 0;
        const montoRD = usd ? rd(montoDisp) : montoDisp;
        return {
          ...compraData,
          id: undefined, // cada pagaré es una fila nueva (evita PK duplicada al editar)
          numero: `${baseNum}-${String(idx + 1).padStart(2, '0')}`,
          referencia: compra.referencia,
          ncf: idx === 0 ? (compra.ncf || null) : null,
          total_exento: montoRD,
          total_gravado: 0,
          descuento_total: 0,
          itbis_total: 0,
          total_compra: montoRD,
          monto_pagado: 0,
          monto_pendiente: montoRD,
          estado: 'PENDIENTE',
          forma_pago: 'Credito',
          dias_credito: diasHasta(c.fecha),
          moneda: usd ? 'USD' : 'DOP',
          tasa_cambio: usd ? tasa : null,
          total_usd: usd ? montoDisp : null,
          pendiente_usd: usd ? montoDisp : null,
          pagos: [],
          invoice_image_path: idx === 0 ? compraData.invoice_image_path : null,
          ocr_text: idx === 0 ? compraData.ocr_text : null,
          extracted_json: idx === 0 ? compraData.extracted_json : null,
          notas: `${compra.notas ? compra.notas + ' | ' : ''}Pagaré ${idx + 1}/${plazo} - factura ${compra.referencia || ''}`.trim(),
        };
      };
      // La primera cuota lleva el inventario/detalle: reemplaza compraData.
      Object.assign(compraData, mkRow(cuotas[0], 0));
      pagareRowsExtra = cuotas.slice(1).map((c, i) => mkRow(c, i + 1));
    }

    // La columna `notas` de compras es opcional (ver sql/compras_notas.sql).
    // Si la base todavía no la tiene, se quita del payload en vez de fallar
    // ("Could not find the 'notas' column of 'compras'"): el guardado nunca se
    // bloquea por el comentario. Al correr el SQL, las notas ya se guardan.
    if ('notas' in compraData || pagareRowsExtra.some(r => 'notas' in r)) {
      const { error: probeErr } = await supabase.from('compras').select('notas').limit(1);
      if (probeErr && /notas/i.test(probeErr.message)) {
        delete compraData.notas;
        pagareRowsExtra.forEach(r => { delete r.notas; });
      }
    }

    // TODAS las filas de la compra en UNA sola llamada (la 1ra lleva el
    // inventario/detalle; en pagarés las demás son solo deuda). Antes se
    // insertaba la 1ra y luego el resto por separado: si el 2do insert
    // fallaba quedaba una compra A MEDIAS (factura huérfana, sin detalle y
    // bloqueada por "factura duplicada" al reintentar). Así es todo o nada.
    const filasCompra = (financiar && pagareRowsExtra.length > 0)
      ? [compraData, ...pagareRowsExtra]
      : [compraData];

    // Editar un financiamiento (o convertir una compra a pagarés) exige
    // recrear las filas: se borra el conjunto viejo y se inserta el nuevo.
    const editandoGrupo = isEditMode && financiamientoGrupo?.ids?.length > 0;
    const usaDeleteInsert = editandoGrupo || (isEditMode && financiar);

    if (usaDeleteInsert && compraConPagos) {
      toast({ variant: "destructive", title: "No se puede editar", description: "Esta compra financiada ya tiene pagos registrados." });
      setIsSaving(false);
      return;
    }

    let savedCompra;
    if (usaDeleteInsert) {
      delete compraData.id; // se reinserta como fila(s) nueva(s); no reusar el id viejo
      const oldIds = editandoGrupo ? financiamientoGrupo.ids : (compra.id ? [compra.id] : []);
      const oldNums = editandoGrupo ? financiamientoGrupo.numeros : (compra.numero ? [compra.numero] : []);
      for (const oid of oldIds) {
        await supabase.from('compras_detalle').delete().eq('compra_id', oid);
      }
      for (const onum of oldNums) {
        await supabase.from('inventario_movimientos').delete().eq('referencia_doc', `COMPRA-${onum}`);
      }
      if (oldIds.length > 0) {
        const { error: delErr } = await supabase.from('compras').delete().in('id', oldIds);
        if (delErr) {
          toast({ variant: "destructive", title: "Error al reemplazar la compra", description: delErr.message });
          setIsSaving(false);
          return;
        }
      }

      const { data, error: compraError } = await supabase.from('compras').insert(filasCompra).select();
      if (compraError) {
        toast({ variant: "destructive", title: "Error al guardar la compra", description: compraError.message });
        setIsSaving(false);
        return;
      }
      savedCompra = (data || []).find(r => r.numero === compraData.numero) || (data || [])[0];
    } else if (isEditMode) {
      const { data, error: compraError } = await supabase.from('compras').update(compraData).eq('id', compra.id).select().single();
      if (compraError) {
        toast({ variant: "destructive", title: "Error al actualizar la compra", description: compraError.message });
        setIsSaving(false);
        return;
      }
      savedCompra = data;

      // Limpiar detalles y movimientos previos para repoblarlos frescos con los cambios
      await supabase.from('compras_detalle').delete().eq('compra_id', savedCompra.id);
      await supabase.from('inventario_movimientos').delete().eq('referencia_doc', `COMPRA-${savedCompra.numero || savedCompra.id}`);
    } else {
      // Compra + filas-pagaré (cuotas 2..N, pura deuda) en un solo insert.
      const { data, error: compraError } = await supabase.from('compras').insert(filasCompra).select();
      if (compraError) {
        toast({ variant: "destructive", title: "Error al guardar la compra", description: compraError.message });
        setIsSaving(false);
        return;
      }
      savedCompra = (data || []).find(r => r.numero === compraData.numero) || (data || [])[0];
    }

    // La tasa usada queda registrada como la tasa del día de la empresa
    if (usd) supabase.rpc('set_tasa_dia', { p_tasa: tasa }).then(() => {}, () => {});

    const detallesData = detallesGuardar.map(d => ({
      compra_id: savedCompra.id,
      producto_id: d.producto_id,
      codigo: d.codigo,
      descripcion: d.descripcion,
      cantidad: d.cantidad,
      unidad: d.unidad,
      costo_unitario: d.costo_unitario,
      descuento_pct: d.descuento_pct,
      itbis_pct: d.itbis_pct,
      importe: d.importe,
    }));

    const { error: detallesError } = await supabase.from('compras_detalle').insert(detallesData);
    
    if (detallesError) {
      toast({ variant: "destructive", title: "Error al guardar detalles de la compra", description: detallesError.message });
    } else {
      // ============================================
      // RECEPCION CONTRA ORDENES ENVIADAS/PARCIALES
      // ============================================
      try {
        await aplicarRecepcionOrdenes(savedCompra);
      } catch (err) {
        console.error("Error aplicando recepcion de ordenes:", err);
        toast({
          variant: 'destructive',
          title: 'Advertencia',
          description: 'La compra se guardo, pero no se pudo actualizar la recepcion de la orden.',
        });
      }

      const movimientos = detallesGuardar.map(d => ({
        producto_id: d.producto_id,
        tipo: 'ENTRADA',
        cantidad: d.cantidad,
        costo_unitario: d.costo_unitario,
        referencia_doc: `COMPRA-${savedCompra.numero || savedCompra.id}`,
        usuario_id: authUser?.id || user?.id,
        fecha: formatDateForSupabase(compra.fecha)
      }));
      await supabase.from('inventario_movimientos').insert(movimientos);

      // Sync product costs and prices if requested
      if (compra.actualizar_precios) {
        for (const d of detallesGuardar) {
          if (!d.producto_id) continue;

          // Fetch ALL presentations for this product to ensure proper synchronization
          const { data: allPres } = await supabase
            .from('presentaciones')
            .select('*')
            .eq('producto_id', d.producto_id);

          if (allPres && allPres.length > 0) {
            // Costo real unitario considerando descuento e ITBIS (TRUNCANDO ITBIS)
            const costoSinITBIS = d.costo_unitario * (1 - (d.descuento_pct / 100));
            const itbisMonto = d.itbis_pct > 0 && !compra.itbis_incluido
              ? Math.trunc((costoSinITBIS * d.itbis_pct) * 100) / 100
              : 0;

            const costoRealUnitario = Number((costoSinITBIS + itbisMonto).toFixed(2));

            const newBaseCosto = costoRealUnitario;
            let mainProductPrecio = 0;

            for (const pres of allPres) {
              const qty = parseFloat(pres.cantidad) || 1;
              const markup = parseFloat(pres.margen_pct) || 0;
              // Cost for this presentation = unit cost * units in presentation
              const newPresCosto = Number((newBaseCosto * qty).toFixed(2));
              // Price for this presentation = cost * (1 + markup%)
              const newPresPrecio = Number((newPresCosto * (1 + markup / 100)).toFixed(2));

              // Recalculate auto prices
              const updateObj = {
                costo: newPresCosto,
                precio1: newPresPrecio
              };

              if (pres.auto_precio2) {
                const precio2 = Number((newPresPrecio * (1 - precio2DescuentoPct / 100)).toFixed(2));
                if (precioCubreCostoReal(precio2, newPresCosto)) {
                  updateObj.precio2 = precio2;
                } else {
                  updateObj.precio2 = 0;
                  updateObj.auto_precio2 = false;
                }
              }
              if (pres.auto_precio3) {
                const precio3 = Number((newPresPrecio * (1 - precio3DescuentoPct / 100)).toFixed(2));
                if (precioCubreCostoReal(precio3, newPresCosto)) {
                  updateObj.precio3 = precio3;
                } else {
                  updateObj.precio3 = 0;
                  updateObj.auto_precio3 = false;
                }
              }

              // Update this specific presentation
              await supabase
                .from('presentaciones')
                .update(updateObj)
                .eq('id', pres.id);

              // If this is the main presentation for the technical sheet, use its price for the main product entry
              if (pres.afecta_ft) {
                mainProductPrecio = newPresPrecio;
              }
            }

            // Update main product table with base cost and main price
            await supabase
              .from('productos')
              .update({
                costo: newBaseCosto,
                precio: mainProductPrecio || (parseFloat(allPres[0]?.precio1) || 0),
                updated_at: new Date().toISOString()
              })
              .eq('id', d.producto_id);
          } else {
            // Fallback: Si no hay presentaciones, crear una y actualizar el producto
            // USAR COSTO REAL (CON DESCUENTO E ITBIS)
            const costoSinITBIS = d.costo_unitario * (1 - (d.descuento_pct / 100));
            const itbisMonto = d.itbis_pct > 0 && !compra.itbis_incluido
              ? Math.trunc((costoSinITBIS * d.itbis_pct) * 100) / 100
              : 0;
            const costoRealUnitario = Number((costoSinITBIS + itbisMonto).toFixed(2));

            // Crear presentación base automáticamente para que el formulario muestre datos correctos
            await supabase
              .from('presentaciones')
              .insert({
                producto_id: d.producto_id,
                tipo: 'UND - Unidad',
                cantidad: 1,
                costo: costoRealUnitario,
                margen_pct: 0,
                precio1: costoRealUnitario,
                precio2: 0,
                precio3: 0,
                auto_precio2: true,
                auto_precio3: true,
                descuento_pct: 0,
                precio_final: costoRealUnitario,
                afecta_ft: true,
                afecta_inv: true,
              });

            await supabase
              .from('productos')
              .update({
                costo: costoRealUnitario,
                precio: costoRealUnitario,
                updated_at: new Date().toISOString()
              })
              .eq('id', d.producto_id);
          }
        }
      }

      toast({ title: 'Éxito', description: 'Compra guardada, existencia y precios actualizados correctamente.' });

      // ============================================
      // COMPROBAR Y RECIBIR SOLICITUDES AGOTADAS
      // ============================================
      try {
        const { data: todasSolicitudesPendientes, error: errorSols } = await supabase
          .from('solicitudes_clientes')
          .select('id, producto_id, estado, productos(descripcion, codigo), clientes(nombre), notas, producto_texto')
          .in('estado', ['abierta', 'solicitado']);

        if (!errorSols && todasSolicitudesPendientes && todasSolicitudesPendientes.length > 0) {
          const idsToUpdate = [];
          const notificaciones = [];

          for (const s of todasSolicitudesPendientes) {
            let matched = false;

            for (const d of detalles) {
              // 1. Coincidencia exacta por ID de producto
              if (s.producto_id && d.producto_id && s.producto_id === d.producto_id) {
                matched = true;
                break;
              }

              // 2. Coincidencia por texto libre o notas (Primera Compra)
              const isPrimeraCompra = s.productos?.codigo === '01';
              if (!s.producto_id || isPrimeraCompra) {
                const descCompra = (d.descripcion || '').toLowerCase().trim();
                const codCompra = (d.codigo || '').toLowerCase().trim();
                
                const textoSol = (s.producto_texto || '').toLowerCase().trim();
                const notasSol = (s.notas || '').toLowerCase().trim();

                const safeMatch = (str1, str2) => {
                  if (!str1 || !str2) return false;
                  if (str1.length < 4 || str2.length < 4) return false;
                  return str1.includes(str2) || str2.includes(str1);
                };

                if (
                  safeMatch(descCompra, textoSol) ||
                  safeMatch(descCompra, notasSol) ||
                  safeMatch(codCompra, textoSol) ||
                  safeMatch(codCompra, notasSol)
                ) {
                  matched = true;
                  break;
                }
              }
            }

            if (matched) {
              idsToUpdate.push(s.id);
              const productName = s.productos?.descripcion || s.producto_texto || 'Producto desconocido';
              const clientName = s.clientes?.nombre || 'Cliente sin registrar';
              notificaciones.push({ productName, clientName });
            }
          }

          if (idsToUpdate.length > 0) {
            // Detector de llegada persistente: sella available_at +
            // notification_created_at y crea la notificación en la campana
            // (recordatorio que no se esfuma). El trigger del kardex ya cubre
            // los productos con código; esta RPC cubre el caso "texto libre"
            // (piezas de WhatsApp aún sin código en el catálogo). Si la RPC
            // no está desplegada, degrada al marcado simple para no romper
            // el guardado de la compra.
            const { error: rpcLlegadaErr } = await supabase.rpc('registrar_llegada_solicitudes', { p_ids: idsToUpdate });
            if (rpcLlegadaErr) {
              await supabase
                .from('solicitudes_clientes')
                .update({ estado: 'notificada', available_at: new Date().toISOString() })
                .in('id', idsToUpdate);
            }

            const listItems = notificaciones.map(n => `${n.productName} (Para: ${n.clientName})`).slice(0, 3).join(", ");
            const countExt = idsToUpdate.length > 3 ? ` y ${idsToUpdate.length - 3} más...` : '';

            toast({
              title: '⭐ ¡Artículos Agotados Recibidos!',
              description: `Se notificaron ${idsToUpdate.length} solicitudes en espera: ${listItems}${countExt}`,
              duration: 7000,
            });
          }
        }
      } catch (e) {
        console.error("Error al actualizar solicitudes agotadas:", e);
      }
      // ============================================

      // Generate PDF
      const selectedSuplidor = proveedores.find(p => p.id === savedCompra.suplidor_id);

      // Al financiar, savedCompra es solo la 1ra cuota; el comprobante debe
      // reflejar el total completo de la factura y su detalle.
      const compraParaImprimir = financiar
        ? {
            ...savedCompra,
            numero: (compra.numero || compra.referencia || savedCompra.numero),
            total_exento: totalsGuardar.exento,
            total_gravado: totalsGuardar.gravado,
            descuento_total: totalsGuardar.descuento,
            itbis_total: totalsGuardar.itbis,
            total_compra: totalsGuardar.total,
            monto_pagado: 0,
            monto_pendiente: totalsGuardar.total,
          }
        : savedCompra;

      if (printMethod === 'pos') {
        printCompraPOS(compraParaImprimir, selectedSuplidor, detalles, paperSize);
      } else {
        generateCompraPDF(compraParaImprimir, selectedSuplidor, detalles, authUser || user, empresa);
      }

      resetForm();
      
      if (isEditMode) {
        setIsEditMode(false);
        closePanel('compras');
        openPanel('reporte-compras');
      }
    }

    setIsSaving(false);
  };

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'F10') {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      navigate(-1);
    }
    if (e.key === 'F3') {
      e.preventDefault();
      setIsSearchModalOpen(true);
    }
  }, [navigate, handleSave]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="bg-gray-100 min-h-screen pb-8">
      <Helmet>
        <title>Compra de Mercancía - MotoFlow</title>
      </Helmet>

      <ProductSearchModal isOpen={isSearchModalOpen} onClose={() => setIsSearchModalOpen(false)} onSelectProduct={handleProductSelect} />
      <SuplidorSearchModal isOpen={isSuplidorModalOpen} onClose={() => setIsSuplidorModalOpen(false)} onSelectSuplidor={handleSuplidorSelect} />
      <InvoiceUploadModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        onDataExtracted={handleDataExtracted}
      />
      <ProductFormModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        onSave={handleSaveProductFromOCR}
        product={tempProductData}
      />
      <SuplidorFormModal
        isOpen={isEditSuplidorModalOpen}
        onClose={handleEditSuplidorClose}
        suplidor={selectedSuplidorToEdit}
      />

      {/* Blue Header Bar */}
      <div className="bg-morla-blue shadow-md mb-2 border-b-2 border-morla-blue/20">
        <div className="container mx-auto px-4 h-11 flex items-center justify-between">
          <div className="w-32"></div>
          <h1 className="text-white font-black tracking-[0.25em] italic uppercase text-lg drop-shadow-sm">
            {isEditMode ? 'EDITAR COMPRA DE MERCANCIA' : 'COMPRA DE MERCANCIA'}
          </h1>
          <Button
            size="sm"
            className="bg-white/10 hover:bg-white/20 text-white border border-white/20 h-7 text-[10px] font-bold uppercase transition-all"
            onClick={() => {
              if (!compra.suplidor_id) {
                toast({
                  variant: 'destructive',
                  title: 'Suplidor requerido',
                  description: 'Debe seleccionar un suplidor antes de subir una factura.'
                });
                return;
              }
              setIsInvoiceModalOpen(true);
            }}
          >
            <ImagePlus className="mr-1.5 h-3.5 w-3.5" /> Subir Factura
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-4">
        {/* Main Content Area */}
        <div className="bg-white shadow-2xl border rounded-lg overflow-hidden flex flex-col min-h-[85vh]">
          <div className="flex-1 p-4 lg:p-6 space-y-2">
            <CompraHeader
              compra={compra}
              setCompra={setCompra}
              proveedores={proveedores}
              almacenes={almacenes}
              onOpenSuplidorSearch={() => setIsSuplidorModalOpen(true)}
              onEditSuplidor={handleEditSuplidor}
            />

            {esUSD && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2">
                <span className="text-sm font-black text-emerald-800">💵 SUPLIDOR EN US$</span>
                <span className="text-xs text-emerald-700">Digita los montos en dólares (como la factura)</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-emerald-800 uppercase">Tasa del día</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={tasaDia || ''}
                    onChange={(e) => setTasaDia(parseFloat(e.target.value) || 0)}
                    placeholder="RD$ x US$"
                    className="h-8 w-28 text-right font-bold bg-white border-emerald-400"
                  />
                </div>
                <span className="ml-auto text-sm font-bold text-emerald-900">
                  Total US$ {totals.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  {tasaDia > 0 && (
                    <span className="text-emerald-700"> ≈ RD$ {(totals.total * tasaDia).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  )}
                </span>
              </div>
            )}

            <CompraDetalles
              currentDetalle={currentDetalle}
              setCurrentDetalle={setCurrentDetalle}
              detalles={detalles}
              addDetalle={addDetalle}
              removeDetalle={removeDetalle}
              onEditLine={handleEditLine}
              setIsSearchModalOpen={setIsSearchModalOpen}
              onCreateProduct={handleCreateProductFromLine}
              itbisIncluido={compra.itbis_incluido}
              onSearchByCode={handleSearchByCode}
            />

            <CompraFooter
              compra={compra}
              setCompra={setCompra}
              pagos={pagos}
              setPagos={setPagos}
              totals={totals}
              printMethod={printMethod}
              setPrintMethod={setPrintMethod}
              paperSize={paperSize}
              setPaperSize={setPaperSize}
              financiamiento={financiamiento}
              setFinanciamiento={setFinanciamiento}
              esUSD={esUSD}
            />
          </div>

          {/* Action Buttons Footer */}
          <div className="bg-gray-50 p-4 border-t flex justify-end items-center gap-5">
            <Button
              variant="outline"
              className="px-6 py-5 bg-white border-gray-300 shadow-sm hover:bg-gray-100 flex items-center gap-3 group transition-all h-11 border-b-[3px]"
              onClick={() => navigate(-1)}
              disabled={isSaving}
            >
              <div className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded text-[10px] font-black group-hover:bg-gray-300 transition-colors">ESC</div>
              <span className="font-black uppercase text-xs text-gray-700 tracking-wider">Retornar</span>
            </Button>

            <Button
              className="px-8 py-5 bg-white border-2 border-morla-blue text-morla-blue hover:bg-morla-blue hover:text-white shadow-lg flex items-center gap-3 group transition-all h-11 border-b-[4px]"
              onClick={handleSave}
              disabled={isSaving}
            >
              <div className="bg-morla-blue text-white px-1.5 py-0.5 rounded text-[10px] font-black group-hover:bg-white group-hover:text-morla-blue transition-colors">F10</div>
              {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              <span className="font-black uppercase text-xs tracking-widest">Grabar Compra</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};


export default ComprasPage;
