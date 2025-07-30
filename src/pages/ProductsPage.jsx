import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Plus, Download, Upload } from 'lucide-react';
import Papa from 'papaparse';
import { exportToExcel } from '@/lib/excelExport';
import { usePanels } from '@/contexts/PanelContext';

import ProductHeader from '@/components/products/ProductHeader';
import ProductFilters from '@/components/products/ProductFilters';
import ProductTable from '@/components/products/ProductTable';
import ProductTableFooter from '@/components/products/ProductTableFooter';
import ProductFormModal from '@/components/products/ProductFormModal';
import ChangeProductCodeModal from '@/components/products/ChangeProductCodeModal';

const ProductsPage = () => {
  const { toast } = useToast();
  const { openPanel } = usePanels();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({ marca_id: '', tipo_id: '' });
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0 });
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isChangeCodeModalOpen, setIsChangeCodeModalOpen] = useState(false);

  const observer = useRef();
  
  const lastProductElementRef = useCallback(node => {
      if (loading) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver(entries => {
          if (entries[0].isIntersecting && products.length < pagination.total) {
              setPagination(prev => ({ ...prev, page: prev.page + 1 }));
          }
      });
      if (node) observer.current.observe(node);
  }, [loading, products.length, pagination.total]);

  const fetchProducts = useCallback(async (isNewSearch = false) => {
    setLoading(true);
    try {
      const currentPage = isNewSearch ? 1 : pagination.page;
      const offset = (currentPage - 1) * pagination.limit;
      
      const { data, error } = await supabase.rpc('get_productos_paginados', {
          p_limit: pagination.limit,
          p_offset: offset,
          p_search_term: searchTerm,
          p_marca_filter: filters.marca_id,
          p_modelo_filter: '' // Modelo filter not implemented in UI yet
      });

      if (error) throw error;
      
      const newProducts = data || [];

      if (isNewSearch) {
        setProducts(newProducts);
      } else {
        setProducts(prev => [...prev, ...newProducts]);
      }
      
      if(newProducts.length > 0) {
        setPagination(prev => ({...prev, total: newProducts[0].total_count, page: currentPage}));
      } else if (isNewSearch) {
        setPagination(prev => ({...prev, total: 0, page: 1}));
      }

    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error al cargar productos',
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, searchTerm, filters, toast]);
  
  useEffect(() => {
    const handler = setTimeout(() => {
      fetchProducts(true);
    }, 500); 

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm, filters]);

  useEffect(() => {
      if (pagination.page > 1) {
          fetchProducts();
      }
  }, [pagination.page]);
  
  const refreshProducts = () => {
    setProducts([]);
    setPagination(prev => ({...prev, page: 1}));
    fetchProducts(true);
  };
  
  const handleSaveProduct = async (productData, presentations, isEditing) => {
    try {
      let savedProduct;
  
      const parseNumeric = (value) => {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? 0 : parsed;
      };
  
      const productPayload = {
        ...productData,
        costo: parseNumeric(productData.costo),
        precio: parseNumeric(productData.precio),
        itbis_pct: parseNumeric(productData.itbis_pct),
        min_stock: parseNumeric(productData.min_stock),
        max_stock: parseNumeric(productData.max_stock),
        garantia_meses: parseInt(productData.garantia_meses, 10) || 0,
      };
      
      if (!isEditing) {
        delete productPayload.id;
      }
  
      if (isEditing) {
        const { id, ...updateData } = productPayload;
        const { data, error } = await supabase
          .from('productos')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        savedProduct = data;
        toast({ title: 'Éxito', description: 'Producto actualizado correctamente.' });
      } else {
        const { data, error } = await supabase
          .from('productos')
          .insert(productPayload)
          .select()
          .single();
        if (error) throw error;
        savedProduct = data;
        toast({ title: 'Éxito', description: 'Producto creado correctamente.' });
      }
  
      if (savedProduct && presentations.length > 0) {
        const presentationsToUpsert = presentations.map(p => {
          const { id, ...rest } = p;
          const presentationPayload = {
            ...rest,
            producto_id: savedProduct.id,
            cantidad: parseNumeric(p.cantidad),
            costo: parseNumeric(p.costo),
            margen_pct: parseNumeric(p.margen_pct),
            precio1: parseNumeric(p.precio1),
            descuento_pct: parseNumeric(p.descuento_pct),
            precio_final: parseNumeric(p.precio_final),
          };
          if (id && !id.toString().startsWith('new-')) {
            presentationPayload.id = id;
          }
          return presentationPayload;
        });
  
        const { error: presError } = await supabase.from('presentaciones').upsert(presentationsToUpsert);
        if (presError) throw presError;
      }
  
      setIsFormModalOpen(false); // Solo cierra el modal principal desde aquí
      refreshProducts();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error al guardar el producto',
        description: error.message,
      });
    }
  };

  const handleDeleteProduct = async (productId) => {
    try {
      const { error } = await supabase
        .from('productos')
        .update({ activo: false })
        .eq('id', productId);

      if (error) throw error;
      toast({ title: 'Éxito', description: 'Producto desactivado correctamente.' });
      refreshProducts();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error al desactivar el producto',
        description: error.message,
      });
    }
  };

  const handleOpenFormModal = async (product = null) => {
    if (product?.id) {
        setLoading(true);
        const { data, error } = await supabase
            .from('productos')
            .select('*, presentaciones(*), tipo:tipos_producto(id), marca:marcas(id), modelo:modelos(id), suplidor:proveedores(id)')
            .eq('id', product.id)
            .single();
        setLoading(false);

        if (error) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los datos completos del producto.' });
            setSelectedProduct(product);
        } else {
            setSelectedProduct(data);
        }
    } else {
        setSelectedProduct(null);
    }
    setIsFormModalOpen(true);
  };
  
  const handleOpenChangeCodeModal = (product) => {
    setSelectedProduct(product);
    setIsChangeCodeModalOpen(true);
  }

  const handleExport = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('productos')
        .select('*, tipo:tipos_producto(nombre), marca:marcas(nombre), modelo:modelos(nombre)')
        .eq('activo', true)
        .order('codigo');

      if (error) throw error;

      const productsWithStock = await Promise.all(data.map(async (p) => {
        const { data: stock } = await supabase.rpc('get_stock_actual', { producto_uuid: p.id });
        return {
          ...p,
          existencia: stock || 0,
          tipo_nombre: p.tipo?.nombre || '',
          marca_nombre: p.marca?.nombre || '',
          modelo_nombre: p.modelo?.nombre || '',
        };
      }));

      const dataToExport = productsWithStock.map(p => ({
        'Código': p.codigo,
        'Descripción': p.descripcion,
        'Referencia': p.referencia,
        'Existencia': p.existencia,
        'Costo': p.costo,
        'Precio': p.precio,
        'ITBIS %': p.itbis_pct,
        'Tipo': p.tipo_nombre,
        'Marca': p.marca_nombre,
        'Modelo': p.modelo_nombre,
        'Ubicación': p.ubicacion,
      }));
      
      exportToExcel(dataToExport, 'Listado_de_Productos');
      toast({title: 'Exportación Exitosa', description: 'El listado de productos se ha exportado a Excel.'});
    } catch (error) {
       toast({variant: 'destructive', title: 'Error de Exportación', description: error.message});
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          try {
            const updates = results.data
              .filter(row => row.codigo && row.existencia !== undefined)
              .map(row => ({
                codigo: row.codigo,
                existencia: parseFloat(row.existencia)
              }));
            
            if (updates.length > 0) {
              setLoading(true);
              const { error } = await supabase.rpc('ajustar_inventario_batch', { p_ajustes: updates });
              if (error) throw error;
              toast({ title: 'Importación Exitosa', description: `${updates.length} existencias han sido actualizadas.` });
              refreshProducts();
            } else {
              toast({ variant: 'destructive', title: 'Archivo Inválido', description: 'El archivo CSV debe tener columnas "codigo" y "existencia".' });
            }
          } catch(err) {
            toast({ variant: 'destructive', title: 'Error al procesar archivo', description: err.message });
          } finally {
            setLoading(false);
            event.target.value = null;
          }
        },
        error: (error) => {
          toast({ variant: 'destructive', title: 'Error al leer CSV', description: error.message });
        },
      });
    }
  };

  return (
    <>
      <Helmet>
        <title>Maestro de Artículos - Repuestos Morla</title>
      </Helmet>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="p-4 sm:p-6"
      >
        <ProductHeader onAdd={() => handleOpenFormModal()} />

        <div className="bg-white p-4 rounded-lg shadow-sm mt-4">
          <ProductFilters
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            filters={filters}
            setFilters={setFilters}
            onExport={handleExport}
            onFileUpload={handleFileUpload}
            onUpdateLocation={() => openPanel('update-location')}
          />
          <ProductTable
            products={products}
            loading={loading && pagination.page === 1}
            onEdit={handleOpenFormModal}
            onDelete={handleDeleteProduct}
            onChangeCode={handleOpenChangeCodeModal}
            lastProductElementRef={lastProductElementRef}
          />
          <ProductTableFooter
            pagination={pagination}
            setPagination={setPagination}
            productsLength={products.length}
            loading={loading}
          />
        </div>
      </motion.div>

      {/* Aquí el modal principal - NO PASAR este onClose a ningún modal hijo */}
      <ProductFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSave={handleSaveProduct}
        product={selectedProduct}
      />
      {/* Fin del modal principal */}
      
      <ChangeProductCodeModal
        isOpen={isChangeCodeOpen}
        onClose={() => setIsChangeCodeModalOpen(false)}
        product={selectedProduct}
        onCodeChanged={refreshProducts}
      />
    </>
  );
};

export default ProductsPage;