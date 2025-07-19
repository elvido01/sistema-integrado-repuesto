import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, Search } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import useDebounce from '@/hooks/useDebounce';

const PAGE_LIMIT = 20;

const ProductSearchModal = ({ isOpen, onClose, onSelectProduct = () => {} }) => {
  const { toast } = useToast();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [marcaFilter, setMarcaFilter] = useState('');
  const [modeloFilter, setModeloFilter] = useState('');
  const [includeZeroStock, setIncludeZeroStock] = useState(true);

  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const debouncedMarcaFilter = useDebounce(marcaFilter, 300);
  const debouncedModeloFilter = useDebounce(modeloFilter, 300);

  const loaderRef = useRef(null);

  const fetchProducts = useCallback(async (page, isNewSearch = false) => {
    setLoading(true);
    try {
      const offset = page * PAGE_LIMIT;
      
      let query = supabase.rpc('get_productos_paginados', {
        p_limit: PAGE_LIMIT,
        p_offset: offset,
        p_search_term: debouncedSearchTerm,
        p_marca_filter: debouncedMarcaFilter,
        p_modelo_filter: debouncedModeloFilter,
      });

      if (!includeZeroStock) {
          query = query.gt('existencia', 0);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;

      const newProducts = data || [];
      setProducts(prev => isNewSearch ? newProducts : [...prev, ...newProducts]);
      setHasMore(newProducts.length === PAGE_LIMIT);
      setCurrentPage(page);

    } catch (error) {
      console.error("Error fetching products in modal:", error);
      toast({
        variant: 'destructive',
        title: 'Error al buscar productos',
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  }, [toast, debouncedSearchTerm, debouncedMarcaFilter, debouncedModeloFilter, includeZeroStock]);

  useEffect(() => {
    if (isOpen) {
      setCurrentPage(0);
      setProducts([]);
      setHasMore(true);
      fetchProducts(0, true);
    } else {
        setProducts([]);
        setCurrentPage(0);
        setHasMore(true);
        setSearchTerm('');
        setMarcaFilter('');
        setModeloFilter('');
        setIncludeZeroStock(true);
    }
  }, [isOpen, debouncedSearchTerm, debouncedMarcaFilter, debouncedModeloFilter, includeZeroStock]);
  
  const handleLoadMore = useCallback(() => {
      if (hasMore && !loading) {
          fetchProducts(currentPage + 1, false);
      }
  }, [currentPage, hasMore, loading, fetchProducts]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          handleLoadMore();
        }
      },
      { threshold: 1.0 }
    );

    const currentLoaderRef = loaderRef.current;
    if (currentLoaderRef) {
      observer.observe(currentLoaderRef);
    }

    return () => {
      if (currentLoaderRef) {
        observer.unobserve(currentLoaderRef);
      }
    };
  }, [handleLoadMore]);

  const formatPrice = (price) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2
    }).format(price || 0);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Buscar Producto</DialogTitle>
        </DialogHeader>
        <div className="p-4 border-b space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-grow">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                    placeholder="Buscar por código, ref, descripción..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                    />
                </div>
                <Input
                    placeholder="Modelo"
                    value={modeloFilter}
                    onChange={(e) => setModeloFilter(e.target.value)}
                    className="md:w-48"
                />
                <Input
                    placeholder="Marca"
                    value={marcaFilter}
                    onChange={(e) => setMarcaFilter(e.target.value)}
                    className="md:w-48"
                />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-zero-stock"
                checked={includeZeroStock}
                onCheckedChange={setIncludeZeroStock}
              />
              <Label htmlFor="include-zero-stock">Incluir Existencias en cero</Label>
            </div>
        </div>

        <div className="flex-grow overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-white z-10">
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Referencia</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Marca</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Ubicación</TableHead>
                <TableHead className="text-right">Existencia</TableHead>
                <TableHead className="text-right">Precio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow
                  key={product.id}
                  onDoubleClick={() => {
                    onSelectProduct(product);
                    onClose();
                  }}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell>{product.codigo}</TableCell>
                  <TableCell>{product.referencia || '-'}</TableCell>
                  <TableCell>{product.descripcion}</TableCell>
                  <TableCell>{product.marca_nombre || '-'}</TableCell>
                  <TableCell>{product.modelo_nombre || '-'}</TableCell>
                  <TableCell>{product.ubicacion || '-'}</TableCell>
                  <TableCell className="text-right">{product.existencia?.toFixed(2) || '0.00'}</TableCell>
                  <TableCell className="text-right font-semibold text-green-600">{formatPrice(product.precio)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div ref={loaderRef} className="h-8 flex justify-center items-center">
            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
            {!loading && !hasMore && products.length > 0 && <p className="text-sm text-muted-foreground">No hay más resultados.</p>}
            {!loading && products.length === 0 && <p className="text-sm text-muted-foreground">No se encontraron productos.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProductSearchModal;