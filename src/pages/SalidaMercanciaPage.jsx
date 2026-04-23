import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Save, X, Loader2, FilePlus, FileText } from 'lucide-react';
import ProductSearchModal from '@/components/ventas/ProductSearchModal';
import { usePanels } from '@/contexts/PanelContext';
import SalidaHeader from '@/components/inventario/SalidaHeader';
import SalidaDetalles from '@/components/inventario/SalidaDetalles';
import SalidaFooter from '@/components/inventario/SalidaFooter';
import { generateSalidaPDF } from '@/components/common/PDFGenerator';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';
import { findAlmacenPrincipal } from '@/lib/almacenUtils';

const initialState = {
  numero: '',
  fecha: getCurrentDateInTimeZone(),
  referencia: '',
  concepto: 'AJUSTE DE SALIDA',
  almacen_id: '', // Dinámico
  notas: '',
  imprimir: false,
};

const initialDetalleState = {
  codigo: '',
  descripcion: '',
  cantidad: 1,
  unidad: 'UND',
  costo_unitario: 0,
  importe: 0,
  producto_id: null,
};

const SalidaMercanciaPage = () => {
  const { toast } = useToast();
  const { empresa } = useAuth();
  const { closePanel } = usePanels();
  const [almacenes, setAlmacenes] = useState([]);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const [salida, setSalida] = useState(initialState);
  const [detalles, setDetalles] = useState([]);
  const [currentDetalle, setCurrentDetalle] = useState(initialDetalleState);
  const [isSaving, setIsSaving] = useState(false);

  // Estado para salida por factura
  const [facturaItems, setFacturaItems] = useState([]);
  const [facturaInfo, setFacturaInfo] = useState(null);
  const [isSearchingFactura, setIsSearchingFactura] = useState(false);

  const fetchInitialData = useCallback(async () => {
    try {
      const { data: almData, error: almError } = await supabase.from('almacenes').select('*').eq('activo', true);
      if (almError) throw almError;
      setAlmacenes(almData);

      const { data: nextNumData, error: nextNumError } = await supabase.rpc('get_next_salida_numero');
      if (nextNumError) throw nextNumError;

      const defaultAlmacen = findAlmacenPrincipal(almData);
      setSalida(prev => ({
        ...prev,
        numero: nextNumData,
        almacen_id: defaultAlmacen ? defaultAlmacen.id : prev.almacen_id
      }));

    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al cargar datos', description: error.message });
    }
  }, [toast]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const resetForm = useCallback(() => {
    setSalida(initialState);
    setDetalles([]);
    setCurrentDetalle(initialDetalleState);
    setFacturaItems([]);
    setFacturaInfo(null);
    fetchInitialData();
  }, [fetchInitialData]);

  // Buscar compra (OC) por número para cargar sus productos
  const handleBuscarFactura = useCallback(async (numero) => {
    if (!numero) {
      toast({ variant: 'destructive', title: 'Error', description: 'Ingrese un número de compra.' });
      return;
    }
    setIsSearchingFactura(true);
    setFacturaItems([]);
    setFacturaInfo(null);
    setDetalles([]);

    try {
      // Buscar en compras (ilike como en EtiquetasMasivasPage)
      const { data: compraData, error: compraError } = await supabase
        .from('compras')
        .select('id, numero, total_compra, suplidor_id')
        .ilike('numero', numero.trim())
        .maybeSingle();

      if (compraError) throw compraError;

      if (!compraData) {
        toast({ variant: 'destructive', title: 'No encontrada', description: `No se encontró compra con número "${numero}".` });
        return;
      }

      // Obtener nombre del suplidor
      let suplidorNombre = '';
      if (compraData.suplidor_id) {
        const { data: sup } = await supabase.from('proveedores').select('nombre').eq('id', compraData.suplidor_id).single();
        if (sup) suplidorNombre = sup.nombre;
      }

      // Buscar detalles de la compra
      const { data: detallesData, error: detallesError } = await supabase
        .from('compras_detalle')
        .select('id, producto_id, codigo, descripcion, cantidad, costo_unitario')
        .eq('compra_id', compraData.id);

      if (detallesError) throw detallesError;

      if (!detallesData || detallesData.length === 0) {
        toast({ variant: 'destructive', title: 'Sin detalles', description: 'La compra no tiene productos asociados.' });
        return;
      }

      // Obtener costo actual de los productos
      const productIds = [...new Set(detallesData.map(d => d.producto_id).filter(Boolean))];
      let productosMap = {};
      if (productIds.length > 0) {
        const { data: productosData } = await supabase
          .from('productos')
          .select('id, costo')
          .in('id', productIds);
        if (productosData) {
          productosMap = productosData.reduce((acc, p) => ({ ...acc, [p.id]: p }), {});
        }
      }

      // Preparar items con costo actual del producto
      const items = detallesData.map(d => {
        const costoActual = productosMap[d.producto_id]?.costo;
        return {
          id: d.id,
          producto_id: d.producto_id,
          codigo: d.codigo,
          descripcion: d.descripcion,
          cantidad_factura: Number(d.cantidad),
          cantidad: Number(d.cantidad),
          costo_unitario: Number(costoActual ?? d.costo_unitario) || 0,
          unidad: 'UND',
          selected: true,
        };
      });

      setFacturaItems(items);
      setFacturaInfo({
        numero: compraData.numero,
        clienteNombre: suplidorNombre || 'Sin suplidor',
        total: compraData.total_compra,
      });

      setSalida(prev => ({ ...prev, referencia: compraData.numero }));
      syncDetallesFromFactura(items);

      toast({ title: 'Compra cargada', description: `${items.length} producto(s) encontrados en ${compraData.numero}.` });

    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al buscar', description: error.message });
    } finally {
      setIsSearchingFactura(false);
    }
  }, [toast]);

  // Sincronizar detalles desde items de factura seleccionados
  const syncDetallesFromFactura = (items) => {
    const selectedItems = items.filter(i => i.selected && i.cantidad > 0);
    const newDetalles = selectedItems.map(i => ({
      id: i.id,
      producto_id: i.producto_id,
      codigo: i.codigo,
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      unidad: i.unidad,
      costo_unitario: i.costo_unitario,
      importe: i.cantidad * i.costo_unitario,
    }));
    setDetalles(newDetalles);
  };

  // Toggle individual item
  const handleFacturaItemToggle = useCallback((itemId) => {
    setFacturaItems(prev => {
      const updated = prev.map(i => i.id === itemId ? { ...i, selected: !i.selected } : i);
      syncDetallesFromFactura(updated);
      return updated;
    });
  }, []);

  // Toggle all items
  const handleFacturaItemToggleAll = useCallback((checked) => {
    setFacturaItems(prev => {
      const updated = prev.map(i => ({ ...i, selected: checked }));
      syncDetallesFromFactura(updated);
      return updated;
    });
  }, []);

  // Cambiar cantidad de un item de factura
  const handleFacturaItemQtyChange = useCallback((itemId, newQty) => {
    setFacturaItems(prev => {
      const updated = prev.map(i => {
        if (i.id === itemId) {
          const qty = Math.max(0, Math.min(i.cantidad_factura, parseFloat(newQty) || 0));
          return { ...i, cantidad: qty };
        }
        return i;
      });
      syncDetallesFromFactura(updated);
      return updated;
    });
  }, []);

  const [ultimaCompraNumero, setUltimaCompraNumero] = useState('');

  // Limpiar datos de factura cuando cambia el concepto
  const handleConceptoChange = useCallback(async (concepto) => {
    setSalida(prev => ({ ...prev, concepto }));
    if (concepto !== 'SALIDA POR FACTURA') {
      setFacturaItems([]);
      setFacturaInfo(null);
      setDetalles([]);
      setUltimaCompraNumero('');
    } else {
      // Precargar el número de la última compra
      const { data } = await supabase
        .from('compras')
        .select('numero')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (data) setUltimaCompraNumero(data.numero);
    }
  }, []);

  const totals = useMemo(() => {
    const totalItems = detalles.reduce((sum, item) => sum + Number(item.cantidad), 0);
    const totalCosto = detalles.reduce((sum, item) => sum + item.importe, 0);
    return { totalItems, totalCosto };
  }, [detalles]);

  const handleProductSelect = (product) => {
    setCurrentDetalle({
      codigo: product.codigo,
      descripcion: product.descripcion,
      costo_unitario: product.costo || 0,
      producto_id: product.id,
      cantidad: 1,
      unidad: 'UND',
      importe: product.costo || 0,
    });
    setIsSearchModalOpen(false);
    setTimeout(() => document.getElementById('cantidad-producto')?.focus(), 100);
  };

  const fetchProductByCode = async (code) => {
    if (!code) return;
    try {
      const { data, error } = await supabase
        .from('productos')
        .select('id, codigo, descripcion, costo')
        .ilike('codigo', code)
        .eq('activo', true)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        handleProductSelect(data);
        return true;
      } else {
        toast({ variant: 'destructive', title: 'Producto no encontrado', description: `No existe un producto activo con el código "${code}".` });
        return false;
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al buscar producto', description: error.message });
      return false;
    }
  };

  const addDetalle = async () => {
    // Si tiene código pero no descripción/id, intentamos buscarlo primero
    if (currentDetalle.codigo && !currentDetalle.producto_id) {
      const found = await fetchProductByCode(currentDetalle.codigo);
      if (!found) return;
      // No agregamos inmediatamente, dejamos que el usuario ajuste la cantidad
      return;
    }

    if (!currentDetalle.codigo || !currentDetalle.descripcion) {
      toast({ variant: 'destructive', title: 'Producto no válido', description: 'Por favor, ingrese un código válido o seleccione de la lista.' });
      return;
    }
    const cantidad = parseFloat(currentDetalle.cantidad);
    if (!cantidad || cantidad <= 0) {
      toast({ variant: 'destructive', title: 'Cantidad no válida', description: 'La cantidad debe ser mayor a cero.' });
      return;
    }
    const costo = parseFloat(currentDetalle.costo_unitario) || 0;
    const importe = cantidad * costo;

    const existingIndex = detalles.findIndex(d => d.producto_id === currentDetalle.producto_id);

    if (existingIndex > -1) {
      const newDetalles = [...detalles];
      newDetalles[existingIndex].cantidad += cantidad;
      newDetalles[existingIndex].importe = newDetalles[existingIndex].cantidad * newDetalles[existingIndex].costo_unitario;
      setDetalles(newDetalles);
    } else {
      setDetalles([...detalles, { ...currentDetalle, cantidad, costo_unitario: costo, importe, id: Date.now() }]);
    }

    setCurrentDetalle(initialDetalleState);
    document.getElementById('codigo-producto')?.focus();
  };

  const removeDetalle = (id) => {
    setDetalles(detalles.filter(d => d.id !== id));
  };

  const updateDetalle = (id, field, value) => {
    setDetalles(detalles.map(d => {
      if (d.id === id) {
        const newDetalle = { ...d, [field]: value };
        if (field === 'cantidad' || field === 'costo_unitario') {
          newDetalle.importe = (parseFloat(newDetalle.cantidad) || 0) * (parseFloat(newDetalle.costo_unitario) || 0);
        }
        return newDetalle;
      }
      return d;
    }));
  };

  const handleConfirmSave = () => {
    if (!salida.almacen_id || detalles.length === 0) {
      toast({ variant: "destructive", title: "Datos incompletos", description: "Debe seleccionar un almacén y añadir al menos un producto." });
      return;
    }
    setIsConfirming(true);
  }

  const handleSave = async () => {
    setIsSaving(true);

    const salidaData = {
      ...salida,
      fecha: formatDateForSupabase(salida.fecha),
      total_costo: totals.totalCosto,
      numero: salida.numero
    };
    delete salidaData.imprimir;

    const detallesData = detalles.map(d => ({
      producto_id: d.producto_id,
      codigo: d.codigo,
      descripcion: d.descripcion,
      cantidad: d.cantidad,
      unidad: d.unidad,
      costo_unitario: d.costo_unitario,
      importe: d.importe,
    }));

    const tipoMovimiento = salida.concepto === 'AJUSTE DE SALIDA' ? 'AJUSTE' : 'SALIDA';

    try {
      const { data, error } = await supabase.rpc('crear_salida_inventario', {
        p_salida_data: salidaData,
        p_detalles_data: detallesData,
        p_tipo_movimiento: tipoMovimiento
      });

      if (error) throw error;

      toast({ title: 'Éxito', description: `Salida ${salida.numero} guardada y existencia actualizada.` });

      if (salida.imprimir) {
        const almacen = almacenes.find(a => a.id === salida.almacen_id);
        generateSalidaPDF(salidaData, almacen, detallesData, empresa);
      }

      resetForm();

    } catch (error) {
      toast({ variant: "destructive", title: "Error al guardar la salida", description: error.message });
    } finally {
      setIsSaving(false);
      setIsConfirming(false);
    }
  };

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'F10') {
      e.preventDefault();
      handleConfirmSave();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closePanel('salida-mercancia');
    }
    if (e.key === 'F3') {
      e.preventDefault();
      setIsSearchModalOpen(true);
    }
  }, [closePanel, handleConfirmSave]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      <Helmet>
        <title>Salida de Mercancía — {empresa?.nombre || 'Sistema'}</title>
      </Helmet>
      <ProductSearchModal isOpen={isSearchModalOpen} onClose={() => setIsSearchModalOpen(false)} onSelectProduct={handleProductSelect} />

      <AlertDialog open={isConfirming} onOpenChange={setIsConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar Salida?</AlertDialogTitle>
            <AlertDialogDescription>
              Se creará la salida de mercancía N° <span className="font-bold">{salida.numero}</span> por un total de <span className="font-bold">{totals.totalCosto.toFixed(2)}</span>. Esta acción actualizará el inventario y no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Confirmar y Guardar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-1 md:p-4 bg-gray-100 min-h-full flex flex-col"
      >
        <div className="bg-white p-4 rounded-lg shadow-md flex-grow flex flex-col">
          <div className="bg-morla-blue text-white text-center py-2 rounded-t-lg">
            <h1 className="text-white font-black tracking-[0.25em] italic uppercase text-lg drop-shadow-sm">SALIDA DE MERCANCÍAS</h1>
          </div>

          <SalidaHeader
            salida={salida}
            setSalida={(val) => {
              // Interceptar cambio de concepto
              if (typeof val === 'function') {
                setSalida(val);
              } else if (val.concepto !== salida.concepto) {
                handleConceptoChange(val.concepto);
                setSalida(prev => ({ ...prev, ...val }));
              } else {
                setSalida(val);
              }
            }}
            almacenes={almacenes}
            onBuscarFactura={handleBuscarFactura}
            isSearchingFactura={isSearchingFactura}
            facturaInfo={facturaInfo}
            ultimaCompraNumero={ultimaCompraNumero}
          />

          <SalidaDetalles
            currentDetalle={currentDetalle}
            setCurrentDetalle={setCurrentDetalle}
            detalles={detalles}
            addDetalle={addDetalle}
            removeDetalle={removeDetalle}
            updateDetalle={updateDetalle}
            setIsSearchModalOpen={setIsSearchModalOpen}
            isFacturaMode={salida.concepto === 'SALIDA POR FACTURA'}
            facturaItems={facturaItems}
            onToggleItem={handleFacturaItemToggle}
            onToggleAll={handleFacturaItemToggleAll}
            onQtyChange={handleFacturaItemQtyChange}
          />

          <div className="flex-grow"></div>

          <SalidaFooter
            totals={totals}
            salida={salida}
            setSalida={setSalida}
          />

          <div className="mt-6 flex justify-between items-center">
            <Button variant="outline" onClick={resetForm} disabled={isSaving}>
              <FilePlus className="mr-2 h-4 w-4" /> Nuevo
            </Button>
            <div className="flex space-x-4">
              <Button variant="outline" onClick={() => closePanel('salida-mercancia')} disabled={isSaving}>
                <X className="mr-2 h-4 w-4" /> ESC - Salir
              </Button>
              <Button className="bg-morla-blue hover:bg-morla-blue/90" onClick={handleConfirmSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} F10 - Grabar
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default SalidaMercanciaPage;