import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useCatalogData } from '@/hooks/useSupabase';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const CAMINERO_MOTORS_TENANT = 'b39506c3-27dc-467d-830b-096731b83113';
import ProductBasicInfo from './form/ProductBasicInfo';
import ProductPlaceholderTab from './form/ProductPlaceholderTab';
import ProductEcommerceTab from './form/ProductEcommerceTab';
import PresentationsTab from './PresentationsTab';

const initialFormData = {
  id: null,
  codigo: '',
  referencia: '',
  descripcion: '',
  precio: 0,
  costo: 0,
  ubicacion: '',
  tipo_id: null,
  marca_id: null,
  modelos_ids: [],
  suplidor_id: null,
  garantia_meses: 0,
  itbis_pct: 0.18,
  min_stock: 0,
  max_stock: 0,
  imagen_url: '',
  activo: true,
  existencia: 0,
  stock_mode: 'auto',
  chasis: '',
  motor: '',
  color: '',
  anio: '',
  condicion: 'NUEVA',
  placa: '',
  matricula: false,
  // Ecommerce fields
  ecommerce_visible: false,
  ecommerce_slug: '',
  ecommerce_descripcion: '',
  ecommerce_orden: 0,
};

const ProductFormModal = ({ isOpen, onClose, onSave, product }) => {
  const { toast } = useToast();
  const { tenantId } = useAuth();
  const hasVehicleFields = tenantId === CAMINERO_MOTORS_TENANT;

  // Check if tenant has tienda feature enabled
  const [hasTienda, setHasTienda] = useState(false);
  const [tenantDominio, setTenantDominio] = useState('');
  useEffect(() => {
    if (!tenantId) return;
    supabase
      .from('tenants')
      .select('feat_tienda, dominio')
      .eq('id', tenantId)
      .maybeSingle()
      .then(({ data }) => {
        setHasTienda(!!data?.feat_tienda);
        setTenantDominio(data?.dominio || '');
      });
  }, [tenantId]);
  const { tiposPresentacion, tipos, marcas, modelos, proveedores, ubicaciones, fetchCatalogs } = useCatalogData();

  const createNewPresentation = useCallback(() => ({
    id: `new-${Date.now()}`,
    tipo: 'UND - Unidad',
    cantidad: '1',
    costo: '0.00',
    margen_pct: '0',
    precio1: '0.00',
    precio2: '0.00',
    precio3: '0.00',
    auto_precio2: true,
    auto_precio3: true,
    descuento_pct: '0',
    precio_final: '0.00',
    afecta_ft: true,
    afecta_inv: true
  }), []);

  const [formData, setFormData] = useState(initialFormData);
  const [presentations, setPresentations] = useState(() => [createNewPresentation()]);
  const [isEditing, setIsEditing] = useState(false);
  // Se incrementa cada vez que populateForm reescribe el formData. Sirve
  // para que ProductBasicInfo dispare el auto-cálculo de Mín/Máx incluso
  // cuando el padre re-fetchea el producto y nos sobrescribe los valores.
  const [loadVersion, setLoadVersion] = useState(0);

  const populateForm = useCallback(async (p) => {
    console.log("populateForm received object (p):", p);
    setLoadVersion(v => v + 1);
    setFormData({
      id: p.id || null,
      codigo: p.codigo || '',
      referencia: p.referencia || '',
      descripcion: p.descripcion || '',
      precio: p.precio || 0,
      costo: p.costo || 0,
      ubicacion: p.ubicacion ? String(p.ubicacion) : '',
      tipo_id: p.tipo_id?.toString() || (p.tipo?.id ? String(p.tipo.id) : null),
      marca_id: p.marca_id?.toString() || (p.marca?.id ? String(p.marca.id) : null),
      modelos_ids: p.modelos_ids || (p.modelo_id ? [p.modelo_id] : []),
      suplidor_id: p.suplidor_id?.toString() || (p.suplidor?.id ? String(p.suplidor.id) : null),
      garantia_meses: p.garantia_meses || 0,
      itbis_pct: (p.itbis_pct !== undefined && p.itbis_pct !== null) ? parseFloat(p.itbis_pct) : 0.18,
      min_stock: p.min_stock || 0,
      max_stock: p.max_stock || 0,
      imagen_url: p.imagen_url || '',
      activo: p.activo !== false,
      existencia: p.existencia || 0,
      stock_mode: p.stock_mode || 'auto',
      chasis: p.chasis || '',
      motor: p.motor || '',
      color: p.color || '',
      anio: p.anio || '',
      condicion: p.condicion || 'NUEVA',
      placa: p.placa || '',
      matricula: !!p.matricula,
      // Ecommerce fields
      ecommerce_visible: !!p.ecommerce_visible,
      ecommerce_slug: p.ecommerce_slug || '',
      ecommerce_descripcion: p.ecommerce_descripcion || '',
      ecommerce_orden: p.ecommerce_orden || 0,
    });

    if (p.presentaciones && p.presentaciones.length > 0) {
      setPresentations(p.presentaciones);
    } else if (p.id) {
      const { data: presData, error } = await supabase
        .from('presentaciones')
        .select('*')
        .eq('producto_id', p.id);

      if (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar las presentaciones.' });
        setPresentations([createNewPresentation()]);
      } else if (presData.length > 0) {
        setPresentations(presData);
      } else {
        // Pre-llenar con datos del producto para no mostrar 0.00
        const fallbackPres = createNewPresentation();
        fallbackPres.costo = String(p.costo || 0);
        fallbackPres.precio1 = String(p.precio || 0);
        fallbackPres.precio_final = String(p.precio || 0);
        setPresentations([fallbackPres]);
      }
    } else {
      // Para productos nuevos pre-llenados (ej. desde OCR)
      const initialPres = createNewPresentation();
      if (p.costo) {
        initialPres.costo = String(p.costo);
        initialPres.precio_final = String(p.precio || 0); // Opcional
      }
      setPresentations([initialPres]);
    }
  }, [toast, createNewPresentation]);

  const resetForm = useCallback(() => {
    // Caminero Motors: por defecto 0% ITBIS (vehículos de motor no llevan ITBIS en RD)
    setFormData({ ...initialFormData, itbis_pct: hasVehicleFields ? 0 : 0.18 });
    setPresentations([createNewPresentation()]);
    setIsEditing(false);
  }, [createNewPresentation, hasVehicleFields]);

  const handleClose = useCallback(() => {
    onClose();
    setTimeout(() => {
      resetForm();
    }, 300);
  }, [onClose, resetForm]);

  useEffect(() => {
    if (isOpen) {
      if (product) {
        setIsEditing(!!product.id);
        populateForm(product);
      } else {
        resetForm();
      }
    }
  }, [isOpen, product, populateForm, resetForm]);


  const handleFetchProductByCode = useCallback(async (codigo) => {
    if (!codigo?.trim()) return;

    try {
      const { data, error } = await supabase
        .from('productos')
        .select(`
          *,
          presentaciones(*)
        `)
        .ilike('codigo', codigo)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        // Fetch current stock
        const { data: stockData } = await supabase.rpc('get_stock_actual', { producto_uuid: data.id });
        const productWithStock = { ...data, existencia: stockData || 0 };

        setIsEditing(true);
        await populateForm(productWithStock);
        toast({
          title: "Producto encontrado",
          description: `Se han cargado los datos del producto ${data.codigo}.`,
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error de búsqueda',
        description: `No se pudo buscar el producto. ${error.message}`
      });
    }
  }, [toast, populateForm]);

  const handleProductSelect = useCallback(async (selectedProduct) => {
    if (selectedProduct?.id) {
      setIsEditing(true);

      const { data, error } = await supabase
        .from('productos')
        .select('*, presentaciones(*)')
        .eq('id', selectedProduct.id)
        .single();

      if (error) {
        toast({
          variant: 'destructive',
          title: 'Error al cargar detalles',
          description: 'No se pudieron cargar los detalles completos del producto.',
        });
        await populateForm(selectedProduct);
      } else {
        // Fetch current stock
        const { data: stockData } = await supabase.rpc('get_stock_actual', { producto_uuid: data.id });
        const productWithStock = { ...data, existencia: stockData || 0 };

        await populateForm(productWithStock);
        toast({
          title: "Producto cargado",
          description: `Se han cargado los datos del producto ${data.codigo}.`,
        });
      }
    }
  }, [populateForm, toast]);


  const handleSubmit = useCallback((e) => {
    e.preventDefault();

    if (!formData.codigo.trim()) {
      toast({ variant: "destructive", title: "Error de validación", description: "El código es requerido" });
      return;
    }

    if (!formData.descripcion.trim()) {
      toast({ variant: "destructive", title: "Error de validación", description: "La descripción es requerida" });
      return;
    }

    const mainPresentation = presentations.find(p => p.afecta_ft) || presentations[0];
    const mainPrice = mainPresentation ? parseFloat(mainPresentation.precio1) : 0;
    const mainCost = mainPresentation ? parseFloat(mainPresentation.costo) : 0;

    const { chasis, motor, color, anio, condicion, placa, matricula, kilometraje,
            ecommerce_visible, ecommerce_slug, ecommerce_descripcion, ecommerce_orden,
            ...restFormData } = formData;
    const cleanedData = {
      ...restFormData,
      tipo_id: formData.tipo_id || null,
      marca_id: formData.marca_id || null,
      modelos_ids: formData.modelos_ids || [],
      suplidor_id: formData.suplidor_id || null,
      referencia: formData.referencia || null,
      ubicacion: formData.ubicacion || null,
      imagen_url: formData.imagen_url || null,
      precio: mainPrice,
      costo: mainCost,
      garantia_meses: parseInt(formData.garantia_meses) || 0,
      min_stock: parseFloat(formData.min_stock) || 0,
      max_stock: parseFloat(formData.max_stock) || 0,
      itbis_pct: parseFloat(formData.itbis_pct) || 0.18,
      stock_mode: formData.stock_mode || 'auto',
      ...(hasVehicleFields && {
        chasis: chasis || null,
        motor: motor || null,
        color: color || null,
        anio: anio ? parseInt(anio) : null,
        condicion: condicion || null,
        placa: condicion === 'USADA' ? (placa || null) : null,
        matricula: condicion === 'USADA' ? !!matricula : false,
        kilometraje: kilometraje ? parseInt(kilometraje) : null,
      }),
      // Ecommerce fields — always included, safe defaults
      ecommerce_visible: !!ecommerce_visible,
      ecommerce_slug: ecommerce_visible ? (ecommerce_slug || null) : null,
      ecommerce_descripcion: ecommerce_descripcion || null,
      ecommerce_orden: parseInt(ecommerce_orden) || 0,
    };

    // Clean presentations to ensure numeric values and include new pricing fields
    const cleanedPresentations = presentations.map(p => ({
      ...p,
      cantidad: parseFloat(p.cantidad) || 0,
      costo: parseFloat(p.costo) || 0,
      margen_pct: parseFloat(p.margen_pct) || 0,
      precio1: parseFloat(p.precio1) || 0,
      precio2: parseFloat(p.precio2) || 0,
      precio3: parseFloat(p.precio3) || 0,
      auto_precio2: !!p.auto_precio2,
      auto_precio3: !!p.auto_precio3,
      descuento_pct: parseFloat(p.descuento_pct) || 0,
      precio_final: parseFloat(p.precio_final) || 0,
    }));

    onSave(cleanedData, cleanedPresentations, isEditing);

    // Emitir evento para sincronizar el costo en una compra abierta en pantalla
    // (Caminero Motors: compran en USD, registran el costo manualmente al crear
    // la mercancía, y ese costo debe reflejarse en la compra que tienen abierta).
    if (isEditing && product?.id) {
      window.dispatchEvent(new CustomEvent('producto:costo-actualizado', {
        detail: { producto_id: product.id, costo: mainCost }
      }));
    }
  }, [formData, presentations, hasVehicleFields, isEditing, onSave, toast, product?.id]);

  // Ref para que el listener de teclado no se re-registre en cada keystroke
  const handleSubmitRef = useRef(handleSubmit);
  const handleCloseRef = useRef(handleClose);
  useEffect(() => { handleSubmitRef.current = handleSubmit; }, [handleSubmit]);
  useEffect(() => { handleCloseRef.current = handleClose; }, [handleClose]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'F10' || (e.ctrlKey && e.key === 's')) {
      e.preventDefault();
      handleSubmitRef.current(e);
    }
    if (e.key === 'Escape') {
      e.stopPropagation();
      handleCloseRef.current();
    }
  }, []);

  const handleNotImplemented = (feature) => {
    toast({
      title: `🚧 ${feature} no implementado`,
      description: "Esta función aún no está disponible. ¡Puedes solicitarla en tu próximo prompt! 🚀",
    });
  };

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <motion.div
            key="modal-panel"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="relative bg-white rounded-lg border-2 border-morla-gold shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-blue-300 border-b border-blue-400 px-4 py-2 flex items-center justify-between flex-shrink-0">
              <h2 className="text-md font-bold text-blue-900 uppercase tracking-wider">Información de la Mercancía</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="text-blue-900 hover:bg-white/20 h-7 w-7 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="overflow-y-auto flex-grow bg-gray-50/30">
              <form onSubmit={handleSubmit} className="p-2">
                <div className="bg-white border rounded-md shadow-sm p-3 mb-2">
                  <ProductBasicInfo
                    formData={formData}
                    setFormData={setFormData}
                    handleNotImplemented={handleNotImplemented}
                    onCodigoBlur={handleFetchProductByCode}
                    onProductSelect={handleProductSelect}
                    isEditing={isEditing}
                    tipos={tipos}
                    marcas={marcas}
                    modelos={modelos}
                    proveedores={proveedores}
                    ubicaciones={ubicaciones}
                    fetchCatalogs={fetchCatalogs}
                    loadVersion={loadVersion}
                  />
                </div>

                <Tabs defaultValue="presentaciones" className="w-full">
                  <TabsList className={`grid ${hasTienda ? 'grid-cols-4' : 'grid-cols-3'} w-full ${hasTienda ? 'max-w-lg' : 'max-w-md'} h-9`}>
                    <TabsTrigger value="presentaciones" className="text-xs">1. Presentación</TabsTrigger>
                    <TabsTrigger value="componentes" className="text-xs">2. Componentes/Produccion</TabsTrigger>
                    <TabsTrigger value="contabilidad" className="text-xs">3. Contabilidad</TabsTrigger>
                    {hasTienda && (
                      <TabsTrigger value="tienda" className="text-xs">4. Tienda 🛒</TabsTrigger>
                    )}
                  </TabsList>

                  <div className="mt-2 bg-white border rounded-md shadow-sm p-3 min-h-[140px]">
                    <TabsContent value="presentaciones" className="m-0 border-0 p-0 shadow-none">
                      <PresentationsTab
                        presentations={presentations}
                        setPresentations={setPresentations}
                        tiposPresentacion={tiposPresentacion}
                        onNotImplemented={handleNotImplemented}
                      />
                    </TabsContent>

                    <TabsContent value="componentes" className="m-0 border-0 p-0 shadow-none">
                      <ProductPlaceholderTab
                        title="🚧 Tabla de componentes no implementada"
                        message="¡Puedes solicitarla en tu próximo prompt! 🚀"
                      />
                    </TabsContent>

                    <TabsContent value="contabilidad" className="m-0 border-0 p-0 shadow-none">
                      <ProductPlaceholderTab
                        title="🚧 Cuentas contables no implementadas"
                        message="¡Puedes solicitarlas en tu próximo prompt! 🚀"
                      />
                    </TabsContent>

                    {hasTienda && (
                      <TabsContent value="tienda" className="m-0 border-0 p-0 shadow-none">
                        <ProductEcommerceTab
                          formData={formData}
                          setFormData={setFormData}
                          tenantDominio={tenantDominio}
                        />
                      </TabsContent>
                    )}
                  </div>
                </Tabs>
              </form>
            </div>

            <div className="border-t bg-gray-100 px-4 py-2 flex justify-end gap-3 flex-shrink-0">
              <Button
                id="btn-grabar-producto"
                onClick={handleSubmit}
                className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 shadow-sm px-8"
              >
                F10 - Grabar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 shadow-sm px-8"
              >
                ESC - Salir
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ProductFormModal;