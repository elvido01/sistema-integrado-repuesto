import React, { useState } from 'react';
import { Edit, Trash2, Loader2, RefreshCw, Package, Barcode, Store, Eye, EyeOff, Image as ImageIcon } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu';
import { useToast } from '@/components/ui/use-toast';
import { sendProductToOrdenCompra } from '@/services/sendToOrdenCompra';

const ProductTable = ({
  products, loading, onEdit, onDelete, onChangeCode,
  selectedProduct, onSelectProduct, onPrintLabel, onImageStudio, onToggleEcommerce,
  agrupandoMode = false, seleccionados, onToggleSeleccion,
  gruposMap = {},
}) => {
  const { toast } = useToast();
  const [sendingToOrder, setSendingToOrder] = useState(null);

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
  const getStockBadge = (stock, minStock) => {
    const s = stock || 0;
    // ... (rest of helper functions)
    return <Badge variant="secondary" className="text-xs">Normal</Badge>;
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 2
    }).format(price || 0);
  };

  return (
    <div className="overflow-x-auto">
      <TooltipProvider>
        <Table>
          <TableHeader className="sticky top-[var(--filters-h,0px)] bg-gray-50 z-10">
            <TableRow>
              {agrupandoMode && <TableHead className="w-[40px]"></TableHead>}
              <TableHead className="w-[120px]">Código</TableHead>
              <TableHead className="w-[120px]">Referencia</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="w-[120px] text-right">Precio</TableHead>
              <TableHead className="w-[120px]">Ubicación</TableHead>
              <TableHead className="w-[100px]">Marca</TableHead>
              <TableHead className="w-[100px]">Modelo</TableHead>
              <TableHead className="w-[100px] text-right">Existencia</TableHead>
              <TableHead className="w-[100px]">Estado</TableHead>
              <TableHead className="w-[40px] text-center" title="Tienda pública">🛒</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  <div className="flex justify-center items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Cargando productos...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : products.length > 0 ? (
              products.map((product) => (
                <ContextMenu key={product.id}>
                  <ContextMenuTrigger asChild>
                    <TableRow
                      onClick={() => {
                        if (agrupandoMode && onToggleSeleccion) {
                          onToggleSeleccion(product.id);
                        } else {
                          onSelectProduct(product);
                        }
                      }}
                      onDoubleClick={() => !agrupandoMode && onEdit(product)}
                      className={`cursor-pointer transition-colors relative ${
                        agrupandoMode && seleccionados?.has(product.id)
                          ? 'bg-purple-100 hover:bg-purple-100 border-l-4 border-l-purple-600'
                          : selectedProduct?.id === product.id
                            ? 'bg-blue-100 hover:bg-blue-100 border-l-4 border-l-blue-600'
                            : 'hover:bg-gray-50'
                        }`}
                    >
                      {agrupandoMode && (
                        <TableCell className="text-center">
                          <input
                            type="checkbox"
                            className="w-4 h-4 accent-purple-600 cursor-pointer"
                            checked={!!seleccionados?.has(product.id)}
                            onChange={(e) => { e.stopPropagation(); onToggleSeleccion?.(product.id); }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-mono text-sm">
                        <div className="flex items-center gap-1.5">
                          <span>{product.codigo}</span>
                          {gruposMap[product.id] && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full bg-purple-100 text-purple-700 text-[9px] font-bold whitespace-nowrap cursor-help"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  🔗 {gruposMap[product.id].total_miembros}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs font-bold">{gruposMap[product.id].grupo_nombre}</p>
                                <p className="text-[10px] text-slate-500">
                                  {gruposMap[product.id].total_miembros} equivalentes
                                  {gruposMap[product.id].prioridad === 1 && ' · ⭐ Preferido'}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{product.referencia || '-'}</TableCell>
                      <TableCell className="text-sm">{product.descripcion}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold text-green-600">
                        {formatPrice(product.precio)}
                      </TableCell>
                      <TableCell className="text-sm">{product.ubicacion || '-'}</TableCell>
                      <TableCell className="text-sm">{product.marca_nombre || '-'}</TableCell>
                      <TableCell className="text-sm">{product.modelo_nombre || '-'}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {product.existencia?.toFixed(2) || '0.00'}
                      </TableCell>
                      <TableCell>
                        {getStockBadge(product.existencia, product.min_stock)}
                      </TableCell>
                      <TableCell className="text-center">
                        {product.ecommerce_visible ? (
                          <Store className="w-4 h-4 text-green-500 mx-auto" title="Publicado en tienda" />
                        ) : (
                          <span className="text-gray-200">—</span>
                        )}
                      </TableCell>
                      {sendingToOrder === product.id && (
                        <div className="absolute inset-0 bg-white/50 flex items-center justify-center pointer-events-none">
                          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                        </div>
                      )}
                    </TableRow>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-56" style={{ zIndex: 10000 }}>
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
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      className="font-bold text-gray-700 cursor-pointer flex items-center gap-2 py-2"
                      onSelect={(e) => {
                        e.preventDefault();
                        setTimeout(() => {
                          onPrintLabel && onPrintLabel(product);
                        }, 0);
                      }}
                    >
                      <Barcode className="w-4 h-4 text-emerald-600" />
                      Imprimir Etiqueta
                    </ContextMenuItem>
                    <ContextMenuItem
                      className="font-bold text-violet-700 cursor-pointer flex items-center gap-2 py-2"
                      onSelect={(e) => {
                        e.preventDefault();
                        setTimeout(() => {
                          onImageStudio && onImageStudio(product);
                        }, 0);
                      }}
                    >
                      <ImageIcon className="w-4 h-4" />
                      Producto Studio
                    </ContextMenuItem>
                    {onToggleEcommerce && (
                      <ContextMenuItem
                        className={`font-bold cursor-pointer flex items-center gap-2 py-2 ${
                          product.ecommerce_visible ? 'text-orange-600' : 'text-green-600'
                        }`}
                        onSelect={(e) => {
                          e.preventDefault();
                          onToggleEcommerce(product);
                        }}
                      >
                        {product.ecommerce_visible ? (
                          <><EyeOff className="w-4 h-4" /> Quitar de Tienda</>
                        ) : (
                          <><Eye className="w-4 h-4" /> Publicar en Tienda</>
                        )}
                      </ContextMenuItem>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-gray-500">
                  No se encontraron productos que coincidan con los filtros.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TooltipProvider>
    </div>
  );
};

export default ProductTable;
