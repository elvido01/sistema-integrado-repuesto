import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Loader2, Search, X, Package, PackageX } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import useDebounce from '@/hooks/useDebounce';
import { orNull } from '@/lib/rpc-helpers';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from '@/components/ui/context-menu';
import { sendProductToOrdenCompra } from '@/services/sendToOrdenCompra';
import { sendNotaToSuplidorVirtual } from '@/services/sendToSuplidorVirtual';

const PAGE_LIMIT = 20;

// ✅ firma corregida (no ejecutar hooks en default params)
// useConfigDefault: si true, respeta empresa.incluir_existencias_cero_default
//   (configurable por tenant en Configuración del Sistema).
//   Solo Ventas lo activa — Compras/Mercancías/etc siempre arrancan en true.
const ProductSearchModal = ({
  isOpen,
  onClose,
  onSelectProduct = () => { },
  sessionKey = null,
  useConfigDefault = false,
  onlyWithStock = false, // si true: solo productos con existencia > 0 y oculta el checkbox
}) => {
  const { toast } = useToast();
  const { tenantId, user, empresa } = useAuth();
  // Dealers y financieras manejan códigos largos (chasis/VIN) que deben verse
  // completos; repuestos usa códigos cortos en columna angosta.
  const codigosLargos = empresa?.tipo_negocio === 'dealer' || empresa?.tipo_negocio === 'financiera';
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const [marcaFilter, setMarcaFilter] = useState('');
  const [modeloFilter, setModeloFilter] = useState('');
  // Si el caller habilita useConfigDefault, leemos el flag del tenant.
  // Cuando NO lo habilita (la mayoría: Compras, Mercancías, Cotizaciones,
  // Solicitudes, etc.) siempre arranca en true.
  const includeZeroStockDefault = onlyWithStock
    ? false
    : useConfigDefault
      ? (empresa?.incluir_existencias_cero_default ?? true)
      : true;
  const [includeZeroStock, setIncludeZeroStock] = useState(includeZeroStockDefault);
  const [sendingToOrder, setSendingToOrder] = useState(null); // product id being sent
  const [sendingNote, setSendingNote] = useState(false);
  const [quickNote, setQuickNote] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const debouncedMarcaFilter = useDebounce(marcaFilter, 300);
  const debouncedModeloFilter = useDebounce(modeloFilter, 300);

  /* Ref for auto-focus */
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      // Small timeout to allow modal animation/render
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Contador de petición: evita que una respuesta VIEJA (p.ej. el fetch inicial
  // con búsqueda vacía, que es más lento) sobrescriba el resultado de una
  // búsqueda más nueva. Sin esto, "gana" la última que resuelve, no la última
  // que se pidió, y el filtro se revertía a la lista completa.
  const requestIdRef = useRef(0);

  const fetchProducts = useCallback(
    async (page, isNewSearch = false) => {
      const reqId = ++requestIdRef.current;
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

        // Respuesta obsoleta: ya se disparó una búsqueda más reciente -> ignorar.
        if (reqId !== requestIdRef.current) return;
        if (error) throw error;

        const newProducts = data || [];
        setProducts((prev) => (isNewSearch ? newProducts : [...prev, ...newProducts]));
        if (isNewSearch) {
          setSelectedIndex(-1);
        }
        setHasMore(newProducts.length === PAGE_LIMIT);
        setCurrentPage(page);
      } catch (error) {
        if (reqId !== requestIdRef.current) return;
        console.error('Error fetching products in modal:', error);
        toast({
          variant: 'destructive',
          title: 'Error al buscar productos',
          description: error.message,
        });
      } finally {
        // Solo apaga el spinner si esta es la petición vigente.
        if (reqId === requestIdRef.current) setLoading(false);
      }
    },
    [toast, debouncedSearchTerm, debouncedMarcaFilter, debouncedModeloFilter, includeZeroStock]
  );
  const loaderRef = useRef(null);

  // Reset search term on open, but keep marca/modelo filters.
  // Tambien resetea includeZeroStock al default configurado por el tenant.
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setCurrentPage(0);
      setHasMore(true);
      setProducts([]);
      setSelectedIndex(-1);
      setIncludeZeroStock(includeZeroStockDefault);
    }
  }, [isOpen, includeZeroStockDefault]);

  // Reset ALL filters (including marca/modelo) when sessionKey changes (e.g. new invoice)
  const prevSessionKeyRef = useRef(sessionKey);
  useEffect(() => {
    if (sessionKey !== null && sessionKey !== prevSessionKeyRef.current) {
      prevSessionKeyRef.current = sessionKey;
      setSearchTerm('');
      setMarcaFilter('');
      setModeloFilter('');
      setIncludeZeroStock(includeZeroStockDefault);
    }
  }, [sessionKey, includeZeroStockDefault]);

  // Selected index reset on new search (handled in fetchProducts)

  // Keyboard navigation listener
  useEffect(() => {
    if (!isOpen || products.length === 0) return;

    const handleGlobalKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => {
          const next = Math.min(prev + 1, products.length - 1);
          // Scroll into view logic
          const row = document.getElementById(`product-row-${next}`);
          row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => {
          const next = Math.max(prev - 1, 0);
          // Scroll into view logic
          const row = document.getElementById(`product-row-${next}`);
          row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          return next;
        });
      } else if (e.key === 'Enter') {
        if (selectedIndex >= 0 && selectedIndex < products.length) {
          e.preventDefault();
          onSelectProduct(products[selectedIndex]);
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isOpen, products, selectedIndex, onSelectProduct, onClose]);

  // Initial fetch on open
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

  // Infinite scroll observer
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

  const handleSendToOrden = async (product) => {
    if (sendingToOrder) return;
    setSendingToOrder(product.id);
    try {
      const result = await sendProductToOrdenCompra(product);
      if (result.success) {
        toast({
          title: result.isNew ? '📦 Orden de Compra Creada' : '📦 Agregado a Orden Existente',
          description: result.message,
          duration: 4000,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.message,
          duration: 5000,
        });
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error inesperado',
        description: err.message,
      });
    } finally {
      setSendingToOrder(null);
    }
  };

  const handleSendNotaToSuplidorVirtual = async () => {
    setSendingNote(true);
    try {
      const result = await sendNotaToSuplidorVirtual({
        nota: quickNote,
        tenantId,
        userId: user?.id,
      });
      toast({
        variant: result.success ? 'default' : 'destructive',
        title: result.success ? 'Enviado a Suplidor Virtual' : 'Error',
        description: result.message,
      });
      if (result.success) setQuickNote('');
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error inesperado', description: err.message });
    } finally {
      setSendingNote(false);
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-gray-50/30 border-2 border-morla-gold shadow-2xl [&>button[class*='absolute']]:hidden">
        {/* Custom Header matching "información de la mercancía" */}
        <div className="bg-blue-300 border-b border-blue-400 px-4 py-2 flex items-center justify-between flex-shrink-0">
          <h2 className="text-md font-bold text-blue-900 uppercase tracking-wider">Buscar Producto</h2>
          <Button
            variant="ghost"
            size="sm"
            tabIndex={-1}
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
                    ref={searchInputRef}
                    placeholder="Buscar por código, ref, descripción…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-[#ffffd9] border-gray-300 focus:ring-blue-500"
                  />
                </div>
                <div className="relative md:w-48">
                  <Input
                    placeholder="Modelo"
                    value={modeloFilter}
                    onChange={(e) => setModeloFilter(e.target.value)}
                    className="border-gray-300 pr-7"
                  />
                  {modeloFilter && (
                    <button type="button" tabIndex={-1} onClick={() => setModeloFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="relative md:w-48">
                  <Input
                    placeholder="Marca"
                    value={marcaFilter}
                    onChange={(e) => setMarcaFilter(e.target.value)}
                    className="border-gray-300 pr-7"
                  />
                  {marcaFilter && (
                    <button type="button" tabIndex={-1} onClick={() => setMarcaFilter('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {!onlyWithStock && (
                <div className="flex items-center space-x-2">
                  <Checkbox id="include-zero-stock" checked={includeZeroStock} onCheckedChange={setIncludeZeroStock} />
                  <Label htmlFor="include-zero-stock" className="text-sm font-medium text-gray-700">Incluir Existencias en cero</Label>
                </div>
              )}
            </div>
          </div>

          {/* Table Area also in a White Card wrapper */}
          <div className="flex-grow overflow-hidden px-4 pb-4">
            <div className="h-full bg-white border rounded-md shadow-sm overflow-hidden flex flex-col">
              {/* Single Horizontal Scroll Container */}
              <div className="flex-grow overflow-auto scrollbar-thin scrollbar-thumb-slate-300">
                <div className="min-w-[960px]">
                  <Table className="w-full table-fixed overflow-visible">
                    <TableHeader className="sticky top-0 bg-gray-100 z-10 shadow-sm">
                      <TableRow className="hover:bg-transparent border-b">
                        <TableHead className={`font-bold text-gray-700 ${codigosLargos ? 'w-[220px]' : 'w-[150px]'}`}>Código</TableHead>
                        <TableHead className="font-bold text-gray-700 w-[110px]">Referencia</TableHead>
                        <TableHead className={`font-bold text-gray-700 ${codigosLargos ? 'w-[300px]' : 'w-[360px]'}`}>Descripción</TableHead>
                        <TableHead className="font-bold text-gray-700 w-[120px]">Ubicación</TableHead>
                        <TableHead className="text-right font-bold text-gray-700 w-[90px]">Existencia</TableHead>
                        <TableHead className="text-right font-bold text-gray-700 w-[140px]">Precio+Imp</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {products.map((product, idx) => (
                        <ContextMenu key={product.id}>
                          <ContextMenuTrigger asChild>
                            <TableRow
                              id={`product-row-${idx}`}
                              onClick={() => {
                                setSelectedIndex(idx);
                              }}
                              onDoubleClick={() => {
                                onSelectProduct(product);
                                onClose();
                              }}
                              className={`cursor-pointer transition-colors border-b select-none text-xs relative ${
                                idx === selectedIndex 
                                  ? 'bg-blue-500 text-white hover:bg-blue-500' 
                                  : idx % 2 === 0 
                                    ? 'bg-white hover:bg-white' 
                                    : 'bg-[#e0fadd] hover:bg-[#e0fadd]'
                              }`}
                            >
                                <TableCell title={product.codigo} className={`text-sm py-2 whitespace-nowrap font-bold ${codigosLargos ? '' : 'overflow-hidden text-ellipsis'} ${idx === selectedIndex ? 'text-white' : 'text-blue-900'}`}>
                                  {product.codigo}
                                </TableCell>
                              <TableCell className={`font-medium py-2 whitespace-nowrap overflow-hidden text-ellipsis ${idx === selectedIndex ? 'text-white' : 'text-slate-600'}`}>
                                {product.referencia || '-'}
                              </TableCell>
                                <TableCell className={`font-medium py-2 leading-tight ${idx === selectedIndex ? 'text-white' : 'text-slate-800'}`}>
                                  {product.descripcion}
                                </TableCell>
                              <TableCell className={`italic py-2 whitespace-nowrap overflow-hidden text-ellipsis ${idx === selectedIndex ? 'text-white' : 'text-slate-500'}`}>
                                {product.ubicacion || '-'}
                              </TableCell>
                              <TableCell className={`text-right font-bold py-2 ${idx === selectedIndex ? 'text-white' : product.existencia > 0 ? 'text-green-700' : 'text-red-600'}`}>
                                {(product.existencia ?? 0).toFixed(2)}
                              </TableCell>
                                <TableCell className={`text-right font-black py-2 whitespace-nowrap text-sm ${idx === selectedIndex ? 'text-white bg-transparent' : 'text-blue-900 bg-blue-50/20'}`}>
                                  {formatPrice(product.precio)}
                                </TableCell>
                              {sendingToOrder === product.id && (
                                <div className="absolute inset-0 bg-white/50 flex items-center justify-center pointer-events-none">
                                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                                </div>
                              )}
                            </TableRow>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-64" style={{ zIndex: 10000 }}>
                            <ContextMenuItem
                              className="font-bold text-blue-700 cursor-pointer flex items-center gap-2 py-2"
                              onSelect={(e) => {
                                e.preventDefault();
                                handleSendToOrden(product);
                              }}
                              disabled={!!sendingToOrder}
                            >
                              {sendingToOrder === product.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                              Enviar a Orden de Compra
                            </ContextMenuItem>
                            <div
                              className="border-t border-slate-100 px-2 py-2 space-y-2"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <Input
                                value={quickNote}
                                maxLength={50}
                                placeholder="Nota de producto faltante"
                                className="h-8 text-xs"
                                onChange={(e) => setQuickNote(e.target.value)}
                              />
                              <button
                                type="button"
                                disabled={sendingNote || !quickNote.trim()}
                                onClick={handleSendNotaToSuplidorVirtual}
                                className="w-full text-left px-2 py-1.5 rounded text-sm font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                              >
                                {sendingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageX className="w-4 h-4" />}
                                Enviar nota a Suplidor Virtual
                              </button>
                            </div>
                          </ContextMenuContent>
                        </ContextMenu>
                      ))}
                    </TableBody>
                  </Table>
                  <div ref={loaderRef} className="h-12 flex justify-center items-center bg-white">
                    {loading && <Loader2 className="w-5 h-5 animate-spin text-blue-600" />}
                    {!loading && !hasMore && products.length > 0 && (
                      <p className="text-xs text-muted-foreground italic">No hay más resultados.</p>
                    )}
                    {!loading && products.length === 0 && (
                      <div className="py-8 px-4 flex flex-col items-center gap-2">
                        <p className="text-sm text-muted-foreground">No se encontraron productos.</p>
                        <div className="flex w-full max-w-md gap-2">
                          <Input
                            value={quickNote}
                            maxLength={50}
                            placeholder="Nota de producto faltante"
                            className="h-9 text-xs"
                            onChange={(e) => setQuickNote(e.target.value)}
                          />
                          <Button
                            size="sm"
                            disabled={sendingNote || !quickNote.trim()}
                            onClick={handleSendNotaToSuplidorVirtual}
                            className="h-9 bg-amber-600 hover:bg-amber-700 text-white"
                          >
                            {sendingNote ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <PackageX className="w-4 h-4 mr-1" />}
                            Enviar
                          </Button>
                        </div>
                      </div>
                    )}
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
