import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Save, X, Loader2, Plus, FilePlus } from 'lucide-react';
import ProductSearchModal from '@/components/ventas/ProductSearchModal';
import { usePanels } from '@/contexts/PanelContext';
import EntradaHeader from '@/components/inventario/EntradaHeader';
import EntradaDetalles from '@/components/inventario/EntradaDetalles';
import EntradaFooter from '@/components/inventario/EntradaFooter';
import SalidaFooter from '@/components/inventario/SalidaFooter';
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
import { formatInTimeZone, getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';

const initialState = {
  numero: '',
  fecha: getCurrentDateInTimeZone(),
  referencia: '',
  concepto: 'AJUSTE DE INVENTARIO',
  almacen_id: 'a01dc84d-a24d-417d-b30b-72d41a2a8fd7', // ALM01 default
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

const EntradaMercanciaPage = () => {
  const { toast } = useToast();
  const { closePanel } = usePanels();
  const [almacenes, setAlmacenes] = useState([]);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const [entrada, setEntrada] = useState(initialState);
  const [detalles, setDetalles] = useState([]);
  const [currentDetalle, setCurrentDetalle] = useState(initialDetalleState);
  const [isSaving, setIsSaving] = useState(false);

  const fetchInitialData = useCallback(async () => {
    try {
      const { data: almData, error: almError } = await supabase.from('almacenes').select('*').eq('activo', true);
      if (almError) throw almError;
      setAlmacenes(almData);

      const { data: nextNumData, error: nextNumError } = await supabase.rpc('get_next_entrada_numero');
      if (nextNumError) throw nextNumError;

      const defaultAlmacen = almData.find(a => a.id === 'a01dc84d-a24d-417d-b30b-72d41a2a8fd7');
      setEntrada(prev => ({
        ...prev,
        numero: nextNumData,
        almacen_id: defaultAlmacen ? defaultAlmacen.id : (almData[0]?.id || prev.almacen_id)
      }));

    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al cargar datos', description: error.message });
    }
  }, [toast]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const resetForm = useCallback(() => {
    setEntrada(initialState);
    setDetalles([]);
    setCurrentDetalle(initialDetalleState);
    fetchInitialData();
  }, [fetchInitialData]);

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

  const addDetalle = () => {
    if (!currentDetalle.codigo || !currentDetalle.descripcion) {
      toast({ variant: 'destructive', title: 'Producto no válido', description: 'Por favor, seleccione un producto de la lista.' });
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
    if (!entrada.almacen_id || detalles.length === 0) {
      toast({ variant: "destructive", title: "Datos incompletos", description: "Debe seleccionar un almacén y añadir al menos un producto." });
      return;
    }
    setIsConfirming(true);
  }

  const handleSave = async () => {
    setIsSaving(true);

    const entradaData = {
      ...entrada,
      fecha: formatDateForSupabase(entrada.fecha),
      total_costo: totals.totalCosto,
      numero: entrada.numero
    };
    delete entradaData.imprimir;

    const detallesData = detalles.map(d => ({
      producto_id: d.producto_id,
      codigo: d.codigo,
      descripcion: d.descripcion,
      cantidad: d.cantidad,
      unidad: d.unidad,
      costo_unitario: d.costo_unitario,
      importe: d.importe,
    }));

    const tipoMovimiento = entrada.concepto === 'AJUSTE DE INVENTARIO' ? 'AJUSTE' : 'ENTRADA';

    try {
      const { data, error } = await supabase.rpc('crear_entrada_inventario', {
        p_entrada_data: entradaData,
        p_detalles_data: detallesData,
        p_tipo_movimiento: tipoMovimiento
      });

      if (error) throw error;

      toast({ title: 'Éxito', description: `Entrada ${entrada.numero} guardada y existencia actualizada.` });

      //TODO: Implementar impresión de PDF si entrada.imprimir es true

      resetForm();

    } catch (error) {
      toast({ variant: "destructive", title: "Error al guardar la entrada", description: error.message });
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
      closePanel('entrada-mercancia');
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
        <title>Entrada de Mercancía - Repuestos Morla</title>
      </Helmet>
      <ProductSearchModal isOpen={isSearchModalOpen} onClose={() => setIsSearchModalOpen(false)} onSelectProduct={handleProductSelect} />

      <AlertDialog open={isConfirming} onOpenChange={setIsConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Confirmar Entrada?</AlertDialogTitle>
            <AlertDialogDescription>
              Se creará la entrada de mercancía N° <span className="font-bold">{entrada.numero}</span> por un total de <span className="font-bold">{totals.totalCosto.toFixed(2)}</span>. Esta acción actualizará el inventario y no se puede deshacer.
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
            <h1 className="text-xl font-bold">ENTRADA DE MERCANCÍAS</h1>
          </div>

          <EntradaHeader
            entrada={entrada}
            setEntrada={setEntrada}
            almacenes={almacenes}
          />

          <EntradaDetalles
            currentDetalle={currentDetalle}
            setCurrentDetalle={setCurrentDetalle}
            detalles={detalles}
            addDetalle={addDetalle}
            removeDetalle={removeDetalle}
            updateDetalle={updateDetalle}
            setIsSearchModalOpen={setIsSearchModalOpen}
          />

          <div className="flex-grow"></div>

          <EntradaFooter
            totals={totals}
            entrada={entrada}
            setEntrada={setEntrada}
          />

          <div className="mt-6 flex justify-between items-center">
            <Button variant="outline" onClick={resetForm} disabled={isSaving}>
              <FilePlus className="mr-2 h-4 w-4" /> Nuevo
            </Button>
            <div className="flex space-x-4">
              <Button variant="outline" onClick={() => closePanel('entrada-mercancia')} disabled={isSaving}>
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

export default EntradaMercanciaPage;