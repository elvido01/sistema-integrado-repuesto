import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { usePanels } from '@/contexts/PanelContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';

import ProductHeader from '@/components/products/ProductHeader';
import ProductFilters from '@/components/products/ProductFilters';
import ProductTable from '@/components/products/ProductTable';
import ProductTableFooter from '@/components/products/ProductTableFooter';
import ProductFormModal from '@/components/products/ProductFormModal';
import ChangeProductCodeModal from '@/components/products/ChangeProductCodeModal';
import PrintLabelModal from '@/components/products/PrintLabelModal';

import Papa from 'papaparse';
import { exportToExcel } from '@/lib/excelExport';

// 👇 helpers y catálogos
import { useCatalogData } from '@/hooks/useSupabase';
import { orNull, nombreById } from '@/lib/rpc-helpers';
import { getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';

const ProductsPage = () => {
  const { toast } = useToast();
  const { openPanel } = usePanels();
  const { empresa, tenantId } = useAuth();

  // Check if tenant has tienda feature
  const [hasTienda, setHasTienda] = useState(false);
  useEffect(() => {
    if (!tenantId) return;
    supabase.from('tenants').select('feat_tienda').eq('id', tenantId).maybeSingle()
      .then(({ data }) => setHasTienda(!!data?.feat_tienda));
  }, [tenantId]);

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({ marca_id: null, modelo_id: null, tipo_id: null });
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0 });

  const {
    marcas: catalogMarcas = [],
    modelos: catalogModelos = [],
    tipos: catalogTipos = [],
    almacenes = [],
  } = useCatalogData() ?? {};

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [isChangeCodeModalOpen, setIsChangeCodeModalOpen] = useState(false);
  const [isPrintLabelModalOpen, setIsPrintLabelModalOpen] = useState(false);
  // Estado independiente para impresión: evita que abrir la etiqueta con clic
  // derecho mientras el modal de edición está abierto deje los dos modales
  // peleando por el mismo `selectedProduct` y bloquee la UI con un backdrop residual.
  const [productForPrint, setProductForPrint] = useState(null);

  // ✅ Se eliminó el observer (Infinite Scroll) para evitar saltos de pantalla
  // por requerimiento del usuario. La carga se controla por el selector de límites.

  // Refs para mantener fetchProducts estable y evitar bucles de actualización
  const searchTermRef = useRef(searchTerm);
  const filtersRef = useRef(filters);
  const paginationRef = useRef(pagination);

  useEffect(() => { searchTermRef.current = searchTerm; }, [searchTerm]);
  useEffect(() => { filtersRef.current = filters; }, [filters]);
  useEffect(() => { paginationRef.current = pagination; }, [pagination]);

  const fetchProducts = useCallback(
    async (isNewSearch = false) => {
      setLoading(true);
      try {
        const currentPage = isNewSearch ? 1 : paginationRef.current.page;
        const currentLimit = paginationRef.current.limit;
        const offset = (currentPage - 1) * currentLimit;

        const marcaNombre = nombreById(catalogMarcas, filtersRef.current?.marca_id ?? filtersRef.current?.marcaId);
        const modeloNombre = nombreById(catalogModelos, filtersRef.current?.modelo_id ?? filtersRef.current?.modeloId);

        const { data, error } = await supabase.rpc('get_productos_paginados', {
          p_limit: currentLimit,
          p_offset: offset,
          p_search_term: orNull(searchTermRef.current),
          p_marca_filter: orNull(marcaNombre),
          p_modelo_filter: orNull(modeloNombre),
          p_include_zero_stock: true,
        });

        if (error) throw error;

        const newProducts = data || [];
        setProducts(newProducts);

        if (newProducts.length > 0) {
          setPagination((prev) => ({
            ...prev,
            total: newProducts[0].total_count,
            page: currentPage,
          }));
        } else {
          setPagination((prev) => ({ ...prev, total: 0, page: 1 }));
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
    },
    [toast, catalogMarcas, catalogModelos]
  );

  // Efecto para búsqueda y filtros debounced (RESETEAN página)
  useEffect(() => {
    const handler = setTimeout(() => {
      fetchProducts(true);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm, filters, fetchProducts]);

  // Efecto para cambios de página y límite (MANTIENEN página)
  useEffect(() => {
    fetchProducts(false);
  }, [pagination.page, pagination.limit, fetchProducts]);

  const refreshProducts = (keepPage = false) => {
    setProducts([]);
    if (!keepPage) {
      setPagination((prev) => ({ ...prev, page: 1 }));
    }
    fetchProducts(keepPage ? false : true);
  };

  const handleSaveProduct = async (productData, presentations, isEditing) => {
    try {
      let savedProduct;

      const parseNumeric = (value) => {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? 0 : parsed;
      };

      const { existencia, ...productDataWithoutStock } = productData;

      const productPayload = {
        ...productDataWithoutStock,
        costo: parseNumeric(productData.costo),
        precio: parseNumeric(productData.precio),
        itbis_pct: parseNumeric(productData.itbis_pct),
        min_stock: parseNumeric(productData.min_stock),
        max_stock: parseNumeric(productData.max_stock),
        garantia_meses: parseInt(productData.garantia_meses, 10) || 0,
      };

      if (!isEditing) delete productPayload.id;

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
        const { data, error } = await supabase.from('productos').insert(productPayload).select().single();
        if (error) throw error;
        savedProduct = data;
        toast({ title: 'Éxito', description: 'Producto creado correctamente.' });
      }

      if (savedProduct) {
        // 1. Recopilar IDs de presentaciones que el usuario conservó (las que ya existían en BD)
        const keepIds = presentations
          .map(p => p.id)
          .filter(id => id && !id.toString().startsWith('new-'));

        // 2. Eliminar de la BD las presentaciones que el usuario borró
        if (isEditing) {
          let deleteQuery = supabase
            .from('presentaciones')
            .delete()
            .eq('producto_id', savedProduct.id);

          if (keepIds.length > 0) {
            // Borrar solo las que NO están en la lista actual
            deleteQuery = deleteQuery.not('id', 'in', `(${keepIds.join(',')})`);
          }
          // Si keepIds está vacío, borra todas (el usuario las eliminó todas)

          const { error: delError } = await deleteQuery;
          if (delError) console.error('Error eliminando presentaciones:', delError);
        }

        // 3. Upsert las presentaciones que quedaron
        if (presentations.length > 0) {
          const presentationsToUpsert = presentations.map((p) => {
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

        // 4. Ajustar inventario automáticamente si hubo cambio en 'existencia'
        const currentExistencia = selectedProduct?.existencia || 0;
        const newExistencia = productData.existencia || 0;
        const diff = parseFloat(newExistencia) - parseFloat(currentExistencia);

        if (Math.abs(diff) > 0.001) {
          const almacenId = almacenes[0]?.id;
          if (!almacenId) {
            toast({
              variant: 'destructive',
              title: 'Falta el Almacén Principal',
              description: 'La mercancía se guardó, pero no se pudo generar el ajuste de inventario porque esta empresa aún no tiene un almacén. Crea el Almacén Principal en Inventario → Almacenes.',
            });
            setIsFormModalOpen(false);
            refreshProducts(isEditing);
            return;
          }

          const mainPresentation = presentations.find(p => p.afecta_ft) || presentations[0];
          const unitToUse = mainPresentation ? mainPresentation.tipo : 'UND - Unidad';

          if (diff > 0) {
            // ENTRADA
            const { data: numData } = await supabase.rpc('get_next_entrada_numero');
            const entradaData = {
              numero: numData,
              fecha: formatDateForSupabase(getCurrentDateInTimeZone()),
              referencia: `AJUSTE DESDE FICHA`,
              concepto: 'AJUSTE DE INVENTARIO',
              almacen_id: almacenId,
              notas: `Ajuste automático creado al editar/crear producto ${savedProduct.codigo}`,
              total_costo: (diff * savedProduct.costo) || 0
            };
            const detallesData = [{
              producto_id: savedProduct.id,
              codigo: savedProduct.codigo,
              descripcion: savedProduct.descripcion,
              cantidad: diff,
              unidad: unitToUse,
              costo_unitario: savedProduct.costo || 0,
              importe: (diff * savedProduct.costo) || 0
            }];

            const { error: entError } = await supabase.rpc('crear_entrada_inventario', {
              p_entrada_data: entradaData,
              p_detalles_data: detallesData,
              p_tipo_movimiento: 'AJUSTE'
            });

            if (entError) {
              console.error("Error creating auto entrada:", entError);
              toast({ variant: 'destructive', title: 'Advertencia', description: 'Se guardó la mercancía pero falló el ajuste automático de entrada.' });
            } else {
              toast({ title: 'Ajuste automático', description: `Se autogeneró una Entrada de Mercancía (${numData}) por +${diff} uds.` });
            }
          } else {
            // SALIDA
            const absDiff = Math.abs(diff);
            const { data: numData } = await supabase.rpc('get_next_salida_numero');
            const salidaData = {
              numero: numData,
              fecha: formatDateForSupabase(getCurrentDateInTimeZone()),
              referencia: `AJUSTE DESDE FICHA`,
              concepto: 'AJUSTE DE SALIDA',
              almacen_id: almacenId,
              notas: `Ajuste automático creado al editar producto ${savedProduct.codigo}`,
              total_costo: (absDiff * savedProduct.costo) || 0
            };
            const detallesData = [{
              producto_id: savedProduct.id,
              codigo: savedProduct.codigo,
              descripcion: savedProduct.descripcion,
              cantidad: absDiff,
              unidad: unitToUse,
              costo_unitario: savedProduct.costo || 0,
              importe: (absDiff * savedProduct.costo) || 0
            }];

            const { error: salError } = await supabase.rpc('crear_salida_inventario', {
              p_salida_data: salidaData,
              p_detalles_data: detallesData,
              p_tipo_movimiento: 'AJUSTE'
            });

            if (salError) {
              console.error("Error creating auto salida:", salError);
              toast({ variant: 'destructive', title: 'Advertencia', description: 'Se guardó la mercancía pero falló el ajuste automático de salida.' });
            } else {
              toast({ title: 'Ajuste automático', description: `Se autogeneró una Salida de Mercancía (${numData}) por -${absDiff} uds.` });
            }
          }
        }
      }

      setIsFormModalOpen(false);
      refreshProducts(isEditing);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error al guardar el producto',
        description: error.message,
      });
    }
  };

  const handleDeleteProduct = async (productId) => {
    setLoading(true);
    try {
      // 1. Verificar movimientos en varias tablas
      const tablesToCheck = [
        { name: 'facturas_detalle', label: 'facturas' },
        { name: 'pedidos_detalle', label: 'pedidos' },
        { name: 'compras_detalle', label: 'compras' },
        { name: 'inventario_movimientos', label: 'movimientos de inventario' }
      ];

      for (const table of tablesToCheck) {
        const { count, error: checkError } = await supabase
          .from(table.name)
          .select('*', { count: 'exact', head: true })
          .eq('producto_id', productId);

        if (checkError) throw checkError;

        if (count > 0) {
          toast({
            variant: 'destructive',
            title: 'No se puede eliminar',
            description: 'Esta mercancia no puede ser eliminada porque ya tiene movimientos.',
          });
          return;
        }
      }

      // 2. Si no hay movimientos, proceder con la desactivación (soft delete)
      const { error } = await supabase.from('productos').update({ activo: false }).eq('id', productId);
      if (error) throw error;

      toast({ title: 'Éxito', description: 'Producto eliminado correctamente.' });
      setSelectedProduct(null);
      refreshProducts(true);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error al eliminar el producto',
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  // ── Toggle ecommerce visibility (right-click action) ──
  const handleToggleEcommerce = async (product) => {
    const newVisible = !product.ecommerce_visible;
    const updates = { ecommerce_visible: newVisible };

    // Auto-generate slug when publishing for the first time
    if (newVisible && !product.ecommerce_slug) {
      const slug = product.descripcion
        ?.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120);
      updates.ecommerce_slug = slug;
    }

    try {
      const { error } = await supabase
        .from('productos')
        .update(updates)
        .eq('id', product.id);
      if (error) throw error;

      // Update local state immediately
      setProducts(prev => prev.map(p =>
        p.id === product.id ? { ...p, ...updates } : p
      ));

      toast({
        title: newVisible ? '🛒 Publicado en tienda' : 'Quitado de tienda',
        description: `${product.descripcion} ${newVisible ? 'ahora es visible' : 'ya no es visible'} en la tienda pública.`,
        duration: 3000,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message,
      });
    }
  };

  const handleOpenFormModal = async (product = null) => {
    // Si no hay producto, es una creación nueva
    if (!product?.id) {
      setSelectedProduct(null);
      setIsFormModalOpen(true);
      return;
    }

    const initialProduct = {
      ...product,
      tipo_id: product.tipo_id?.toString() || '',
      marca_id: product.marca_id?.toString() || '',
      modelos_ids: product.modelos_ids || (product.modelo_id ? [product.modelo_id] : []),
      suplidor_id: product.suplidor_id?.toString() || '',
    };

    // Mostrar modal con datos iniciales inmediatamente para mejor UX
    setSelectedProduct(initialProduct);
    setIsFormModalOpen(true);
    setLoading(true);

    try {
      // Re-fetch detalles profundos (presentaciones y stock actualizado)
      const { data, error } = await supabase
        .from('productos')
        .select(
          '*, presentaciones(*), tipo:tipos_producto(id, nombre), marca:marcas(id, nombre), modelo:modelos(id, nombre), suplidor:proveedores(id, nombre)'
        )
        .eq('id', product.id)
        .single();

      if (error) throw error;

      // Obtener stock actual
      const { data: stockData } = await supabase.rpc('get_stock_actual', { producto_uuid: product.id });

      const fullProduct = {
        ...data,
        tipo_id: data.tipo?.id?.toString() || data.tipo_id?.toString() || '',
        marca_id: data.marca?.id?.toString() || data.marca_id?.toString() || '',
        modelos_ids: data.modelos_ids || (data.modelo_id ? [data.modelo_id] : []),
        suplidor_id: data.suplidor?.id?.toString() || data.suplidor_id?.toString() || '',
        existencia: stockData || 0,
      };

      setSelectedProduct(fullProduct);
    } catch (error) {
      console.error("Error al cargar detalles del producto:", error);
      toast({
        variant: 'destructive',
        title: 'Aviso',
        description: 'Usando datos locales. Los precios y presentaciones podrían no estar actualizados.',
      });
      // Mantenemos el initialProduct que ya pusimos en el estado
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChangeCodeModal = (product) => {
    setSelectedProduct(product);
    setIsChangeCodeModalOpen(true);
  };

  const handleExport = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('v_productos_export')
        .select('*')
        .order('Codigo');

      if (error) throw error;

      exportToExcel(data, 'Listado_de_Productos');
      toast({ title: 'Exportación Exitosa', description: 'El listado de productos se ha exportado a Excel.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error de Exportación', description: error.message });
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
              .filter((row) => row.codigo && row.existencia !== undefined)
              .map((row) => ({
                codigo: row.codigo,
                existencia: parseFloat(row.existencia),
              }));

            if (updates.length > 0) {
              setLoading(true);
              const { error } = await supabase.rpc('ajustar_inventario_batch', { p_ajustes: updates });
              if (error) throw error;
              toast({ title: 'Importación Exitosa', description: `${updates.length} existencias han sido actualizadas.` });
              refreshProducts();
            } else {
              toast({
                variant: 'destructive',
                title: 'Archivo Inválido',
                description: 'El archivo CSV debe tener columnas "codigo" y "existencia".',
              });
            }
          } catch (err) {
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
        <title>Maestro de Artículos — {empresa?.nombre || 'MotoFlow'}</title>
      </Helmet>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="p-4 sm:p-6"
      >
        <div className="sticky top-0 z-50 bg-gray-100/95 backdrop-blur supports-[backdrop-filter]:bg-gray-100/75 pt-4 pb-2 -mt-4 mb-4 border-b border-gray-200">
          <ProductHeader
            onAdd={() => handleOpenFormModal()}
            onDelete={() => selectedProduct && handleDeleteProduct(selectedProduct.id)}
            onChangeCode={() => selectedProduct && handleOpenChangeCodeModal(selectedProduct)}
            hasSelection={!!selectedProduct}
          />
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm mt-4">
          {/* Barra de filtros sticky */}
          <div
            className="sticky top-[88px] z-40 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 py-2 -mx-4 px-4"
            style={{ '--filters-h': '56px' }}
          >
            <ProductFilters
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              filters={filters}
              setFilters={setFilters}
              limit={pagination.limit}
              setLimit={(newLimit) => setPagination(prev => ({ ...prev, limit: newLimit, page: 1 }))}
              onExport={handleExport}
              onFileUpload={handleFileUpload}
              onUpdateLocation={() => openPanel('update-location')}
            />
          </div>

          <ProductTable
            products={products}
            loading={loading && pagination.page === 1}
            loadingMore={loading && pagination.page > 1}
            onEdit={handleOpenFormModal}
            onDelete={handleDeleteProduct}
            onChangeCode={handleOpenChangeCodeModal}
            selectedProduct={selectedProduct}
            onSelectProduct={setSelectedProduct}
            onPrintLabel={(prod) => {
              setIsFormModalOpen(false);
              setIsChangeCodeModalOpen(false);
              setProductForPrint(prod);
              setIsPrintLabelModalOpen(true);
            }}
            onToggleEcommerce={hasTienda ? handleToggleEcommerce : undefined}
          />

          <ProductTableFooter
            pagination={pagination}
            setPagination={setPagination}
            productsLength={products.length}
            loading={loading}
          />
        </div>
      </motion.div>

      {/* Modal principal */}
      <ProductFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSave={handleSaveProduct}
        product={selectedProduct}
      />

      <ChangeProductCodeModal
        isOpen={isChangeCodeModalOpen}
        onClose={() => setIsChangeCodeModalOpen(false)}
        product={selectedProduct}
        onCodeChanged={refreshProducts}
      />

      <PrintLabelModal
        isOpen={isPrintLabelModalOpen}
        onClose={() => {
          setIsPrintLabelModalOpen(false);
          setProductForPrint(null);
        }}
        product={productForPrint}
      />
    </>
  );
};

export default ProductsPage;
