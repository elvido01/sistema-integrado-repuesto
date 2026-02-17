import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, Search, X } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import useDebounce from '@/hooks/useDebounce';
import { orNull } from '@/lib/rpc-helpers';

const PAGE_LIMIT = 20;

// ✅ firma corregida (no ejecutar hooks en default params)
const ProductSearchModal = ({ isOpen, onClose, onSelectProduct = () => { } }) => {
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

  const fetchProducts = useCallback(
    async (page, isNewSearch = false) => {
      setLoading(true);
      try {
        const offset = page * PAGE_LIMIT;

        const { data, error } = await supabase.rpc('get_productos_paginados', {
          p_limit: PAGE_LIMIT,
          p_offset: offset,
          p_search_term: orNull(debouncedSearchTerm),
          p_marca_filter: orNull(debouncedMarcaFilter),   // TEXT (nombre)
          p_modelo_filter: orNull(debouncedModeloFilter), // TEXT (nombre)
          p_include_zero_stock: !!includeZeroStock,
        });

        if (error) throw error;

        const newProducts = data || [];
        setProducts((prev) => (isNewSearch ? newProducts : [...prev, ...newProducts]));
        setHasMore(newProducts.length === PAGE_LIMIT);
        setCurrentPage(page);
      } catch (error) {
        console.error('Error fetching products in modal:', error);
        toast({
          variant: 'destructive',
          title: 'Error al buscar productos',
          description: error.message,
        });
      } finally {
        setLoading(false);
      }
    },
    [toast, debouncedSearchTerm, debouncedMarcaFilter, debouncedModeloFilter, includeZeroStock]
  );

  useEffect(() => {
    if (isOpen) {
      // reset al abrir
      setSearchTerm('');
      setMarcaFilter('');
      setModeloFilter('');
      setCurrentPage(0);
      setHasMore(true);
      setProducts([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      fetchProducts(0, true);
    }
  }, [isOpen, fetchProducts]);

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
    if (currentLoaderRef) observer.observe(currentLoaderRef);
    return () => {
      if (currentLoaderRef) observer.unobserve(currentLoaderRef);
    };
  }, [handleLoadMore]);

  const formatPrice = (price) =>
    new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(price || 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-gray-50/30 border-2 border-morla-gold shadow-2xl">
        {/* Custom Header matching "información de la mercancía" */}
        <div className="bg-blue-300 border-b border-blue-400 px-4 py-2 flex items-center justify-between flex-shrink-0">
          <h2 className="text-md font-bold text-blue-900 uppercase tracking-wider">Buscar Producto</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-blue-900 hover:bg-white/20 h-7 w-7 p-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex-grow flex flex-col overflow-hidden">
          {/* Filter Area in a White Card */}
          <div className="p-4 flex-shrink-0">
            <div className="bg-white border rounded-md shadow-sm p-4 space-y-4">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-grow">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Buscar por código, ref, descripción…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-[#ffffd9] border-gray-300 focus:ring-blue-500"
                  />
                </div>
                <Input
                  placeholder="Modelo"
                  value={modeloFilter}
                  onChange={(e) => setModeloFilter(e.target.value)}
                  className="md:w-48 border-gray-300"
                />
                <Input
                  placeholder="Marca"
                  value={marcaFilter}
                  onChange={(e) => setMarcaFilter(e.target.value)}
                  className="md:w-48 border-gray-300"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox id="include-zero-stock" checked={includeZeroStock} onCheckedChange={setIncludeZeroStock} />
                <Label htmlFor="include-zero-stock" className="text-sm font-medium text-gray-700">Incluir Existencias en cero</Label>
              </div>
            </div>
          </div>

          {/* Table Area also in a White Card wrapper */}
          <div className="flex-grow overflow-hidden px-4 pb-4">
            <div className="h-full bg-white border rounded-md shadow-sm overflow-hidden flex flex-col">
              {/* Single Horizontal Scroll Container */}
              <div className="flex-grow overflow-auto scrollbar-thin scrollbar-thumb-slate-300">
                <div className="min-w-[1250px]">
                  <Table className="w-full table-fixed overflow-visible">
                    <TableHeader className="sticky top-0 bg-gray-100 z-10 shadow-sm">
                      <TableRow className="hover:bg-transparent border-b">
                        <TableHead className="font-bold text-gray-700 w-[130px]">Código</TableHead>
                        <TableHead className="font-bold text-gray-700 w-[110px]">Referencia</TableHead>
                        <TableHead className="font-bold text-gray-700 w-[350px]">Descripción</TableHead>
                        <TableHead className="font-bold text-gray-700 w-[130px]">Ubicación</TableHead>
                        <TableHead className="text-right font-bold text-gray-700 w-[90px]">Existencia</TableHead>
                        <TableHead className="text-right font-bold text-gray-700 w-[130px]">Precio+Imp</TableHead>
                        <TableHead className="font-bold text-gray-700 w-[150px]">Marca</TableHead>
                        <TableHead className="font-bold text-gray-700 w-[150px]">Modelo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map((product, idx) => (
                        <TableRow
                          key={product.id}
                          onClick={() => {
                            onSelectProduct(product);
                            onClose();
                          }}
                          className={`cursor-pointer transition-colors border-b ${idx % 2 === 0 ? 'bg-white' : 'bg-[#e0fadd]'} hover:bg-blue-50 text-xs`}
                        >
                          <TableCell className="text-sm text-blue-900 py-2 whitespace-nowrap overflow-hidden text-ellipsis">
                            {product.codigo}
                          </TableCell>
                          <TableCell className="font-medium text-slate-600 py-2 whitespace-nowrap overflow-hidden text-ellipsis">
                            {product.referencia || '-'}
                          </TableCell>
                          <TableCell className="font-medium text-slate-800 py-2 leading-tight">
                            {product.descripcion}
                          </TableCell>
                          <TableCell className="text-slate-500 italic py-2 whitespace-nowrap overflow-hidden text-ellipsis">
                            {product.ubicacion || '-'}
                          </TableCell>
                          <TableCell className={`text-right font-bold py-2 ${product.existencia > 0 ? 'text-green-700' : 'text-red-600'}`}>
                            {(product.existencia ?? 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-black text-blue-900 bg-blue-50/20 py-2 whitespace-nowrap text-sm">
                            {formatPrice(product.precio)}
                          </TableCell>
                          <TableCell className="text-slate-500 py-2 whitespace-nowrap overflow-hidden text-ellipsis">
                            {product.marca_nombre || '-'}
                          </TableCell>
                          <TableCell className="text-slate-500 py-2 whitespace-nowrap overflow-hidden text-ellipsis">
                            {product.modelo_nombre || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div ref={loaderRef} className="h-12 flex justify-center items-center bg-white">
                    {loading && <Loader2 className="w-5 h-5 animate-spin text-blue-600" />}
                    {!loading && !hasMore && products.length > 0 && (
                      <p className="text-xs text-muted-foreground italic">No hay más resultados.</p>
                    )}
                    {!loading && products.length === 0 && <p className="text-sm text-muted-foreground py-10">No se encontraron productos.</p>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Consistent Footer */}
        <div className="border-t bg-gray-100 px-6 py-3 flex justify-end gap-3 flex-shrink-0">
          <Button
            variant="outline"
            onClick={onClose}
            className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 shadow-sm px-8"
          >
            ESC - Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ProductSearchModal;
