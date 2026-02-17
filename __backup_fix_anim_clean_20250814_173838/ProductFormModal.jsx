import React, { useState, useEffect, useCallback } from 'react';
import {  } from 'framer-motion';
import { X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/components/ui/use-toast';
import { useCatalogData } from '@/hooks/useSupabase';
import PresentationsTab from '@/components/products/PresentationsTab';
import ProductBasicInfo from '@/components/products/form/ProductBasicInfo';
import ProductPlaceholderTab from '@/components/products/form/ProductPlaceholderTab';
import { supabase } from '@/lib/customSupabaseClient';

const ProductFormModal = ({ isOpen, onClose, onSave, product }) => {
  console.log("ProductFormModal received product prop:", product); // Log product prop
  const { toast } = useToast();
  const { tiposPresentacion, tipos, marcas, modelos, proveedores, almacenes, fetchCatalogs } = useCatalogData();
  
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
    modelo_id: null,
    suplidor_id: null,
    garantia_meses: 0,
    itbis_pct: 0.18,
    min_stock: 0,
    max_stock: 0,
    imagen_url: '',
    activo: true
  };

  const createNewPresentation = useCallback(() => ({
    id: `new-${Date.now()}`,
    tipo: 'UND - Unidad',
    cantidad: '1',
    costo: '0.00',
    margen_pct: '0',
    precio1: '0.00',
    descuento_pct: '0',
    precio_final: '0.00',
    afecta_ft: true,
    afecta_inv: true
  }), []);

  const [formData, setFormData] = useState(initialFormData);
  const [presentations, setPresentations] = useState(() => [createNewPresentation()]);
  const [isEditing, setIsEditing] = useState(false);

  const populateForm = useCallback(async (p) => {
    console.log("populateForm received object (p):", p); // Log object received by populateForm
    setFormData({
      id: p.id || null,
      codigo: p.codigo || '',
      referencia: p.referencia || '',
      descripcion: p.descripcion || '',
      precio: p.precio || 0,
      costo: p.costo || 0,
      ubicacion: p.ubicacion ? String(p.ubicacion) : '',
      tipo_id: p.tipo_id || (p.tipo?.id ? String(p.tipo.id) : null),
      marca_id: p.marca_id || (p.marca?.id ? String(p.marca.id) : null),
      modelo_id: p.modelo_id || (p.modelo?.id ? String(p.modelo.id) : null),
      suplidor_id: p.suplidor_id || (p.suplidor?.id ? String(p.suplidor.id) : null),
      garantia_meses: p.garantia_meses || 0,
      itbis_pct: p.itbis_pct || 0.18,
      min_stock: p.min_stock || 0,
      max_stock: p.max_stock || 0,
      imagen_url: '',
      activo: p.activo !== false
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
      } else {
        setPresentations(presData.length > 0 ? presData : [createNewPresentation()]);
      }
    } else {
      setPresentations([createNewPresentation()]);
    }
  }, [toast, createNewPresentation]);

  const resetForm = useCallback(() => {
    setFormData(initialFormData);
    setPresentations([createNewPresentation()]);
    setIsEditing(false);
  }, [createNewPresentation]);

  const handleClose = useCallback(() => {
    onClose();
    // We delay the reset slightly to allow the closing animation to complete.
    setTimeout(() => {
      resetForm();
    }, 300);
  }, [onClose, resetForm]);

  useEffect(() => {
    if (isOpen) {
      if (product?.id) {
        setIsEditing(true);
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
        .eq('codigo', codigo)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        setIsEditing(true);
        await populateForm(data);
        toast({
          title: "Producto encontrado",
          description: `Se han cargado los datos del producto ${data.codigo}.`,
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error de bÃºsqueda',
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
            await populateForm(data);
            toast({
                title: "Producto cargado",
                description: `Se han cargado los datos del producto ${data.codigo}.`,
            });
        }
    }
  }, [populateForm, toast]);


  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.codigo.trim()) {
      toast({ variant: "destructive", title: "Error de validaciÃ³n", description: "El cÃ³digo es requerido" });
      return;
    }

    if (!formData.descripcion.trim()) {
      toast({ variant: "destructive", title: "Error de validaciÃ³n", description: "La descripciÃ³n es requerida" });
      return;
    }
    
    const mainPresentation = presentations.find(p => p.afecta_ft) || presentations[0];
    const mainPrice = mainPresentation ? parseFloat(mainPresentation.precio1) : 0;
    const mainCost = mainPresentation ? parseFloat(mainPresentation.costo) : 0;

    const cleanedData = {
      ...formData,
      tipo_id: formData.tipo_id || null,
      marca_id: formData.marca_id || null,
      modelo_id: formData.modelo_id || null,
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
    };

    onSave(cleanedData, presentations, isEditing);
  };

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'F10' || (e.ctrlKey && e.key === 's')) {
      e.preventDefault();
      handleSubmit(e);
    }
    if (e.key === 'Escape') {
      e.stopPropagation(); // â† evita que llegue al padre
      handleClose();
    }
  }, [handleClose, handleSubmit]);

  const handleNotImplemented = (feature) => {
    toast({
      title: `ðŸš§ ${feature} no implementado`,
      description: "Esta funciÃ³n aÃºn no estÃ¡ disponible. Â¡Puedes solicitarla en tu prÃ³ximo prompt! ðŸš€",
    });
  };

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, formData, presentations, handleKeyDown]);

  return (
    
  <motion.div key="product-form-0">

      {isOpen && (
        <motion.div
          key="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
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
            <div className="bg-morla-blue text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
              <h2 className="text-lg font-bold">Información de la Mercancía</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="text-white hover:bg-white/20 h-8 w-8 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="overflow-y-auto flex-grow">
              <form onSubmit={handleSubmit} className="p-6">
                <Accordion type="multiple" defaultValue={["datos-basicos"]} className="space-y-4">
                  <AccordionItem value="datos-basicos" className="border rounded-lg">
                    <AccordionTrigger className="px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-t-lg">
                      <span className="font-bold text-sm">Datos Básicos & Clasificación</span>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 py-4 bg-white">
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
                        almacenes={almacenes}
                        fetchCatalogs={fetchCatalogs}
                      />
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="presentaciones" className="border rounded-lg">
                    <AccordionTrigger className="px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-t-lg">
                      <span className="font-bold text-sm">Presentaciones</span>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 py-4 bg-white">
                      <PresentationsTab
                        presentations={presentations}
                        setPresentations={setPresentations}
                        tiposPresentacion={tiposPresentacion}
                        onNotImplemented={handleNotImplemented}
                      />
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="componentes" className="border rounded-lg">
                    <AccordionTrigger className="px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-t-lg">
                      <span className="font-bold text-sm">Componentes / Producción</span>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 py-4 bg-white">
                      <ProductPlaceholderTab
                        title="ðŸš§ Tabla de componentes no implementada"
                        message="Â¡Puedes solicitarla en tu prÃ³ximo prompt! ðŸš€"
                      />
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="contabilidad" className="border rounded-lg">
                    <AccordionTrigger className="px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-t-lg">
                      <span className="font-bold text-sm">Contabilidad</span>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 py-4 bg-white">
                      <ProductPlaceholderTab
                        title="ðŸš§ Cuentas contables no implementadas"
                        message="Â¡Puedes solicitarlas en tu prÃ³ximo prompt! ðŸš€"
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </form>
            </div>

            <div className="border-t bg-gray-50 px-6 py-4 flex justify-end gap-3 flex-shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSubmit}
                className="bg-morla-blue hover:bg-morla-blue/90"
              >
                <Save className="w-4 h-4 mr-2" />
                F10 - Guardar
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    
  </motion.div>

  );
};

export default ProductFormModal;


