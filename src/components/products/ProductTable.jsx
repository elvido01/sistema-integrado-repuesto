import React from 'react';
    import { Edit, Trash2, Loader2, RefreshCw } from 'lucide-react';
    import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
    import { Badge } from '@/components/ui/badge';
    import { Button } from '@/components/ui/button';
    import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

    const ProductTable = ({ products, loading, onEdit, onDelete, onChangeCode, lastProductElementRef }) => {
      
      const getStockBadge = (stock, minStock) => {
        const s = stock || 0;
        const min = minStock || 0;
        if (s <= 0) {
          return <Badge variant="destructive" className="text-xs">Agotado</Badge>;
        }
        if (s > 0 && s <= min) {
          return <Badge variant="destructive" className="text-xs">Stock Bajo</Badge>;
        }
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
              <TableHeader className="sticky top-0 bg-gray-50 z-10">
                <TableRow>
                  <TableHead className="w-[120px]">Código</TableHead>
                  <TableHead className="w-[120px]">Referencia</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="w-[120px] text-right">Precio</TableHead>
                  <TableHead className="w-[120px]">Ubicación</TableHead>
                  <TableHead className="w-[100px]">Marca</TableHead>
                  <TableHead className="w-[100px]">Modelo</TableHead>
                  <TableHead className="w-[100px] text-right">Existencia</TableHead>
                  <TableHead className="w-[100px]">Estado</TableHead>
                  
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8">
                      <div className="flex justify-center items-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Cargando productos...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : products.length > 0 ? (
                  products.map((product, index) => (
                    <TableRow 
                      ref={index === products.length - 1 ? lastProductElementRef : null}
                      key={product.id} 
                      onDoubleClick={() => onEdit(product)}
                      className="hover:bg-gray-50"
                    >
                      <TableCell className="font-mono text-sm">{product.codigo}</TableCell>
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
                      
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-gray-500">
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