import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';

export const useProducts = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('productos')
        .select('*, tipos_producto(nombre), marcas(nombre), modelos(nombre)')
        .eq('activo', true)
        .order('codigo');

      if (error) throw error;

      const productsWithStock = await Promise.all(
        data.map(async (product) => {
          const { data: stockData, error: stockError } = await supabase
            .rpc('get_stock_actual', { producto_uuid: product.id });

          if (stockError) {
             console.error(`Error fetching stock for product ${product.id}:`, stockError);
             return { ...product, existencia: 0 };
          }
          
          return {
            ...product,
            existencia: Math.trunc(stockData || 0),
            tipo: product.tipos_producto?.nombre || '',
            marca: product.marcas?.nombre || '',
            modelo: product.modelos?.nombre || '',
          };
        })
      );

      setProducts(productsWithStock);
    } catch (error) {
       toast({
        variant: "destructive",
        title: "Error al cargar productos",
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const createProduct = async (productData) => {
    try {
      const { data, error } = await supabase
        .from('productos')
        .insert([productData])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Producto creado",
        description: "El producto se ha guardado exitosamente"
      });

      await fetchProducts();
      return { data, error: null };
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error al crear producto",
        description: error.message
      });
      return { data: null, error };
    }
  };

  const updateProduct = async (id, productData) => {
    try {
      const { data, error } = await supabase
        .from('productos')
        .update(productData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Producto actualizado",
        description: "Los cambios se han guardado exitosamente"
      });

      await fetchProducts();
      return { data, error: null };
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error al actualizar producto",
        description: error.message
      });
      return { data: null, error };
    }
  };

  const deleteProduct = async (id) => {
    try {
      const { error } = await supabase
        .from('productos')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Producto eliminado",
        description: "El producto se ha eliminado exitosamente"
      });

      await fetchProducts();
      return { error: null };
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error al eliminar producto",
        description: error.message
      });
      return { error };
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  return {
    products,
    loading,
    fetchProducts,
    createProduct,
    updateProduct,
    deleteProduct
  };
};

export const useClients = () => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchClients = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('activo', true)
        .order('nombre');

      if (error) throw error;
      setClients(data);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error al cargar clientes",
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  return { clients, loading, fetchClients };
};

export const useFacturas = () => {
  const [facturas, setFacturas] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const createFactura = async (facturaData, detalles) => {
    try {
      const { data: factura, error: facturaError } = await supabase
        .from('facturas')
        .insert([facturaData])
        .select()
        .single();

      if (facturaError) throw facturaError;

      const detallesWithFacturaId = detalles.map(detalle => ({
        ...detalle,
        factura_id: factura.id
      }));

      const { error: detallesError } = await supabase
        .from('facturas_detalle')
        .insert(detallesWithFacturaId);

      if (detallesError) throw detallesError;

      for (const detalle of detalles) {
        if (detalle.producto_id) {
          await supabase
            .from('inventario_movimientos')
            .insert({
              producto_id: detalle.producto_id,
              tipo: 'SALIDA',
              cantidad: detalle.cantidad,
              costo_unitario: detalle.precio,
              referencia_doc: `FACTURA-${factura.numero}`
            });
        }
      }

      toast({
        title: "Factura creada",
        description: `Factura #${factura.numero} guardada exitosamente`
      });

      return { data: factura, error: null };
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error al crear factura",
        description: error.message
      });
      return { data: null, error };
    }
  };

  return { facturas, loading, createFactura };
};

export const useCatalogData = () => {
  const [tipos, setTipos] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [tiposPresentacion, setTiposPresentacion] = useState([]);
  const { toast } = useToast();

  const fetchCatalogs = useCallback(async () => {
    try {
      const [tiposRes, marcasRes, modelosRes, proveedoresRes, almacenesRes, tiposPresentacionRes] = await Promise.all([
        supabase.from('tipos_producto').select('*').order('nombre'),
        supabase.from('marcas').select('*').order('nombre'),
        supabase.from('modelos').select('*').order('nombre'),
        supabase.from('proveedores').select('*').order('nombre'),
        supabase.from('almacenes').select('*').order('nombre'),
        supabase.from('tipos_presentacion').select('*').order('nombre')
      ]);

      if (tiposRes.error) throw tiposRes.error;
      if (marcasRes.error) throw marcasRes.error;
      if (modelosRes.error) throw modelosRes.error;
      if (proveedoresRes.error) throw proveedoresRes.error;
      if (almacenesRes.error) throw almacenesRes.error;
      if (tiposPresentacionRes.error) throw tiposPresentacionRes.error;

      setTipos(tiposRes.data || []);
      setMarcas(marcasRes.data || []);
      setModelos(modelosRes.data || []);
      setProveedores(proveedoresRes.data || []);
      setAlmacenes(almacenesRes.data || []);
      setTiposPresentacion(tiposPresentacionRes.data || []);
    } catch (error) {
      console.error('Error fetching catalog data:', error);
      toast({
        variant: "destructive",
        title: "Error al cargar catálogos",
        description: "No se pudieron obtener los datos para los selectores."
      });
    }
  }, [toast]);

  useEffect(() => {
    fetchCatalogs();
  }, [fetchCatalogs]);

  return { tipos, marcas, modelos, proveedores, almacenes, tiposPresentacion, fetchCatalogs };
};