import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Save, X, Loader2 } from 'lucide-react';
import ProductSearchModal from '@/components/ventas/ProductSearchModal';
import { useNavigate } from 'react-router-dom';
import CompraHeader from '@/components/compras/CompraHeader';
import CompraDetalles from '@/components/compras/CompraDetalles';
import CompraFooter from '@/components/compras/CompraFooter';
import { getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';

const ComprasPage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [proveedores, setProveedores] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);

  const initialState = {
    numero: '',
    fecha: getCurrentDateInTimeZone(),
    ncf: '',
    referencia: '',
    tipo_bienes_servicios: '09',
    sub_tipo: 'Compra de Merc',
    suplidor_id: null,
    almacen_id: null,
    itbis_incluido: false,
    actualizar_precios: true,
    forma_pago: 'Contado',
    dias_credito: 0,
  };

  const initialDetalleState = {
    codigo: '',
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
  const [pagos, setPagos] = useState([{ tipo: '01', referencia: '', monto: 0, id: Date.now() }]);
  const [isSaving, setIsSaving] = useState(false);

  const fetchInitialData = useCallback(async () => {
    const { data: provData, error: provError } = await supabase.from('proveedores').select('*');
    if (provError) toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los proveedores.' });
    else setProveedores(provData);

    const { data: almData, error: almError } = await supabase.from('almacenes').select('*');
    if (almError) toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los almacenes.' });
    else setAlmacenes(almData);
  }, [toast]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);
  
  const resetForm = useCallback(() => {
    setCompra(initialState);
    setDetalles([]);
    setCurrentDetalle(initialDetalleState);
    setPagos([{ tipo: '01', referencia: '', monto: 0, id: Date.now() }]);
  }, []);

  const totals = useMemo(() => {
    let exento = 0;
    let gravado = 0;
    let descuento = 0;
    let itbis = 0;

    detalles.forEach(d => {
      const subtotalItem = d.cantidad * d.costo_unitario;
      const descuentoItem = subtotalItem * (d.descuento_pct / 100);
      descuento += descuentoItem;

      if (d.itbis_pct > 0) {
        gravado += subtotalItem - descuentoItem;
        itbis += (subtotalItem - descuentoItem) * d.itbis_pct;
      } else {
        exento += subtotalItem - descuentoItem;
      }
    });

    const total = gravado + exento + itbis;
    return { exento, gravado, descuento, itbis, total };
  }, [detalles]);
  
  const handleProductSelect = (product) => {
    const itbisPct = product.itbis_pct / 100;
    setCurrentDetalle(prev => ({
      ...prev,
      codigo: product.codigo,
      descripcion: product.descripcion,
      costo_unitario: product.precio || 0,
      itbis_pct: itbisPct,
      producto_id: product.id,
    }));
    setIsSearchModalOpen(false);
    document.getElementById('cantidad-producto')?.focus();
  };

  const addDetalle = () => {
    const cantidad = parseFloat(currentDetalle.cantidad);
    if (!currentDetalle.codigo || !currentDetalle.descripcion || !cantidad || cantidad <= 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Complete los datos del producto.' });
      return;
    }
    const costo = parseFloat(currentDetalle.costo_unitario) || 0;
    const descuento = parseFloat(currentDetalle.descuento_pct) || 0;
    const importe = cantidad * costo * (1 - descuento / 100);

    setDetalles([...detalles, { ...currentDetalle, cantidad, costo_unitario: costo, descuento_pct: descuento, importe, id: Date.now() }]);
    setCurrentDetalle(initialDetalleState);
    document.getElementById('codigo-producto')?.focus();
  };

  const removeDetalle = (id) => {
    setDetalles(detalles.filter(d => d.id !== id));
  };
  
  const handleSave = async () => {
    if (!compra.suplidor_id || !compra.almacen_id || detalles.length === 0) {
        toast({ variant: "destructive", title: "Datos incompletos", description: "Debe seleccionar un suplidor, un almacén y añadir al menos un producto." });
        return;
    }
    setIsSaving(true);
    
    const compraData = {
        ...compra,
        fecha: formatDateForSupabase(compra.fecha),
        total_exento: totals.exento,
        total_gravado: totals.gravado,
        descuento_total: totals.descuento,
        itbis_total: totals.itbis,
        total_compra: totals.total,
        pagos: pagos.filter(p => p.monto > 0)
    };

    const { data: savedCompra, error: compraError } = await supabase.from('compras').insert(compraData).select().single();

    if (compraError) {
        toast({ variant: "destructive", title: "Error al guardar la compra", description: compraError.message });
        setIsSaving(false);
        return;
    }

    const detallesData = detalles.map(d => ({
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
        const movimientos = detalles.map(d => ({
            producto_id: d.producto_id,
            tipo: 'ENTRADA',
            cantidad: d.cantidad,
            costo_unitario: d.costo_unitario,
            referencia_doc: `COMPRA-${savedCompra.numero || savedCompra.id}`,
            fecha: formatDateForSupabase(compra.fecha)
        }));
        await supabase.from('inventario_movimientos').insert(movimientos);

        toast({ title: 'Éxito', description: 'Compra guardada y existencia actualizada correctamente.' });
        resetForm();
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
    <>
      <Helmet>
        <title>Compra de Mercancía - Repuestos Morla</title>
      </Helmet>
      <ProductSearchModal isOpen={isSearchModalOpen} onClose={() => setIsSearchModalOpen(false)} onProductSelect={handleProductSelect} />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 bg-gray-100 min-h-full"
      >
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="bg-morla-blue text-white text-center py-2 rounded-t-lg">
            <h1 className="text-xl font-bold">COMPRA DE MERCANCÍA</h1>
          </div>
          
          <CompraHeader 
            compra={compra}
            setCompra={setCompra}
            proveedores={proveedores}
            almacenes={almacenes}
          />

          <CompraDetalles
            currentDetalle={currentDetalle}
            setCurrentDetalle={setCurrentDetalle}
            detalles={detalles}
            addDetalle={addDetalle}
            removeDetalle={removeDetalle}
            setIsSearchModalOpen={setIsSearchModalOpen}
          />

          <CompraFooter
            compra={compra}
            setCompra={setCompra}
            pagos={pagos}
            setPagos={setPagos}
            totals={totals}
          />

          <div className="mt-6 flex justify-end space-x-4">
            <Button variant="outline" onClick={() => navigate(-1)} disabled={isSaving}>
              <X className="mr-2 h-4 w-4" /> ESC - Retornar
            </Button>
            <Button className="bg-morla-blue hover:bg-morla-blue/90" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} F10 - Grabar
            </Button>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default ComprasPage;