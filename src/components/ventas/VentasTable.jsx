import React, { useState } from 'react';
import { Search, Trash2, Loader2, Package, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from '@/components/ui/context-menu';
import { useToast } from '@/components/ui/use-toast';
import { sendProductToOrdenCompra } from '@/services/sendToOrdenCompra';

const VentasTable = ({
  items,
  itemCode,
  setItemCode,
  onItemCodeKeyDown,
  onProductSearch,
  onUpdateItem,
  onDeleteItem,
  onEditItem = null,
  currentItem = null,
  updateCurrentItem = () => { },
  commitCurrentItem = () => { },
  clearCurrentItem = () => { },
  userRole = 'seller'
}) => {
  const { toast } = useToast();
  const [sendingToOrder, setSendingToOrder] = useState(null);

  const handleSendToOrden = async (item) => {
    if (sendingToOrder) return;
    setSendingToOrder(item.id);
    try {
      const result = await sendProductToOrdenCompra(item);
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
  console.log('VentasTable Render Check:', { itemsCount: items?.length, currentItemExists: !!currentItem });
  const emptyRowsCount = Math.max(0, 12 - items.length);

  const prevItemIdRef = React.useRef(null);

  React.useEffect(() => {
    if (currentItem && currentItem.id !== prevItemIdRef.current) {
      prevItemIdRef.current = currentItem.id;
      setTimeout(() => {
        document.getElementById('input-cantidad')?.focus();
        document.getElementById('input-cantidad')?.select();
      }, 100);
    } else if (!currentItem) {
      prevItemIdRef.current = null;
    }
  }, [currentItem]);

  const handleInputDoubleClick = (e) => {
    e.currentTarget.focus();
    e.currentTarget.select();
  };

  const shouldShowLocalSupplier = (item) => {
    if (!item?.local_suplidor_sugerido) return false;
    return Number(item.existencia_morla || 0) < Number(item.cantidad || 1);
  };

  const LocalSupplierHint = ({ item }) => {
    if (!shouldShowLocalSupplier(item)) return null;
    const option = item.local_suplidor_sugerido;
    return (
      <span
        className="inline-flex flex-shrink-0 items-center gap-1 rounded border border-emerald-500 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-black leading-none text-emerald-800"
        title={`Disponible localmente: ${option.suplidor}. Codigo suplidor: ${option.codigo_suplidor || 'N/A'}`}
      >
        <Truck className="h-3 w-3" />
        {option.suplidor} {option.entrega_min_minutos}-{option.entrega_max_minutos}m
      </span>
    );
  };

  return (
    <div className="flex-grow border-2 border-gray-500 bg-[#f5f5f0] flex flex-col shadow-inner">
      <div className="flex-grow overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400">
        <Table className="border-collapse">
          <TableHeader className="sticky top-0 z-10 border-b-2 border-gray-600 shadow-sm">
            <TableRow className="hover:bg-transparent border-none h-7 bg-gradient-to-b from-[#d4d4cc] to-[#c0c0b8]">
              <TableHead className="h-7 p-1 w-[120px] text-[13px] font-black text-gray-800 border-r border-gray-500 uppercase">
                <div className="flex items-center justify-between">
                  <span>CODIGO</span>
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0 hover:bg-white/50 ml-1" onClick={onProductSearch} tabIndex="-1" title="Buscar Producto (F3)">
                    <Search className="w-3.5 h-3.5 text-gray-700" />
                  </Button>
                </div>
              </TableHead>
              <TableHead className="h-7 p-1 text-[13px] font-black text-gray-800 border-r border-gray-500 uppercase">DESCRIPCION</TableHead>
              <TableHead className="h-7 p-1 w-[110px] text-[13px] font-black text-gray-800 border-r border-gray-500 text-center uppercase">UBICACION</TableHead>
              <TableHead className="h-7 p-1 w-[60px] text-[13px] font-black text-gray-800 border-r border-gray-500 text-center uppercase">CANT.</TableHead>
              <TableHead className="h-7 p-1 w-[90px] text-[13px] font-black text-gray-800 border-r border-gray-500 text-right uppercase">PRECIO</TableHead>
              <TableHead className="h-7 p-1 w-[65px] text-[13px] font-black text-gray-800 border-r border-gray-500 text-right uppercase">DESC.</TableHead>
              <TableHead className="h-7 p-1 w-[80px] text-[13px] font-black text-gray-800 border-r border-gray-500 text-right uppercase">ITBIS</TableHead>
              <TableHead className="h-7 p-1 w-[100px] text-[13px] font-black text-gray-800 text-right uppercase">IMPORTE</TableHead>
              <TableHead className="h-7 p-1 w-[30px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* STAGING ROW - Amarillo fuerte como el sistema antiguo */}
            <TableRow className="sticky top-7 bg-[#fff8b0] z-20 border-b-2 border-gray-600 shadow-lg h-8 group">
              <TableCell className="p-1 border-r border-gray-500">
                <input
                  id="input-codigo"
                  placeholder="F3..."
                  className="w-full h-6 text-[14px] font-black bg-transparent border-none outline-none uppercase placeholder:italic placeholder:text-gray-400 text-[#0a1e3a] focus:bg-white/50"
                  value={itemCode}
                  onChange={(e) => setItemCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'F3') { e.preventDefault(); onProductSearch(); }
                    else { onItemCodeKeyDown(e); }
                  }}
                  autoComplete="off"
                />
              </TableCell>
              <TableCell className="p-1 border-r border-gray-500">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="text-[14px] font-black text-blue-900 leading-tight uppercase truncate max-w-[400px]" title={currentItem?.descripcion}>
                    {currentItem ? currentItem.descripcion : <span className="text-gray-500 italic">... BUSQUE POR CODIGO O F3</span>}
                  </div>
                  <LocalSupplierHint item={currentItem} />
                </div>
              </TableCell>
              <TableCell className="p-1 border-r border-gray-500 text-center">
                <span className="text-[13px] font-black text-gray-700">{currentItem ? currentItem.ubicacion : ''}</span>
              </TableCell>
              <TableCell className="p-1 border-r border-gray-500">
                <input
                  id="input-cantidad"
                  type="number"
                  className="w-full h-6 text-center font-black text-blue-900 bg-transparent border-none outline-none hide-spinner text-[14px] focus:bg-white/50"
                  value={currentItem ? currentItem.cantidad : ''}
                  onChange={(e) => updateCurrentItem && updateCurrentItem('cantidad', e.target.value)}
                  disabled={!currentItem}
                  min="1"
                  onDoubleClick={handleInputDoubleClick}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation(); // Evitar que llegue a listeners globales
                      if (userRole === 'admin') {
                        document.getElementById('input-precio')?.focus();
                        document.getElementById('input-precio')?.select();
                      } else {
                        document.getElementById('input-descuento')?.focus();
                        document.getElementById('input-descuento')?.select();
                      }
                    }
                  }}
                />
              </TableCell>
              <TableCell className="p-1 border-r border-gray-500">
                <input
                  id="input-precio"
                  type="number"
                  className="w-full h-6 text-right font-black text-blue-900 bg-transparent border-none outline-none hide-spinner text-[14px] focus:bg-white/50"
                  value={currentItem ? currentItem.precio : ''}
                  onChange={(e) => updateCurrentItem && updateCurrentItem('precio', e.target.value)}
                  disabled={!currentItem || (userRole !== 'admin' && userRole !== 'owner')}
                  min="0"
                  onDoubleClick={handleInputDoubleClick}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); document.getElementById('input-descuento')?.focus(); document.getElementById('input-descuento')?.select(); } }}
                />
              </TableCell>
              <TableCell className="p-1 border-r border-gray-500">
                <input
                  id="input-descuento"
                  type="number"
                  step="0.01"
                  className="w-full h-6 text-right font-black text-red-600 bg-transparent border-none outline-none hide-spinner text-[14px] focus:bg-white/50"
                  value={currentItem ? currentItem.descuento : ''}
                  onChange={(e) => updateCurrentItem && updateCurrentItem('descuento', e.target.value)}
                  disabled={!currentItem}
                  min="0"
                  onDoubleClick={handleInputDoubleClick}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (commitCurrentItem) commitCurrentItem(); setTimeout(() => document.getElementById('input-codigo')?.focus(), 50); } }}
                />
              </TableCell>
              <TableCell className="h-7 p-1 text-right border-r border-gray-500 text-[13px] font-black text-gray-700">
                {currentItem?.itbis != null ? Number(currentItem.itbis).toFixed(2) : '0.00'}
              </TableCell>
              <TableCell className="h-7 p-1 text-right text-[15px] font-black text-blue-800">
                {currentItem?.importe != null ? Number(currentItem.importe).toFixed(2) : '0.00'}
              </TableCell>
              <TableCell className="p-1 text-center">
                {currentItem && (
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-600 hover:bg-red-100" onClick={clearCurrentItem}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </TableCell>
            </TableRow>

            {/* Main Item List - Filas con colores alternados más visibles */}
            {items.map((item, index) => {
              if (!item) return null;
              return (
                <ContextMenu key={item.id || index}>
                  <ContextMenuTrigger asChild>
                    <TableRow
                      className={`h-7 relative border-b border-gray-400 hover:bg-[#fff4c8] transition-colors cursor-pointer ${index % 2 === 0 ? 'bg-white' : 'bg-[#f0efe8]'}`}
                      onDoubleClick={() => onEditItem && onEditItem(item)}
                    >
                      <TableCell className="p-1 text-[14px] font-bold border-r border-gray-400 text-[#0a1e3a]">{item.codigo}</TableCell>
                  <TableCell className="p-1 text-[13px] font-semibold text-gray-800 border-r border-gray-400 uppercase max-w-[400px]">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{item.descripcion}</span>
                      <LocalSupplierHint item={item} />
                    </div>
                  </TableCell>
                  <TableCell className="p-1 text-[13px] text-gray-600 border-r border-gray-400 text-center font-medium">{item.ubicacion}</TableCell>
                  <TableCell className="p-1 text-center text-[14px] font-bold border-r border-gray-400">
                    {item.cantidad}
                  </TableCell>
                  <TableCell className="p-1 text-right text-[14px] font-bold border-r border-gray-400">
                    {Number(item.precio || 0).toFixed(2)}
                  </TableCell>
                  <TableCell className="p-1 text-right text-[14px] font-bold text-red-600 border-r border-gray-400">
                    {Number((item.precio * item.cantidad) * (item.descuento / 100)).toFixed(2)}
                  </TableCell>
                  <TableCell className="p-1 text-right text-[14px] font-semibold text-gray-600 border-r border-gray-400">{Number(item.itbis || 0).toFixed(2)}</TableCell>
                  <TableCell className="p-1 text-right text-[14px] font-black text-blue-900">{Number(item.importe || 0).toFixed(2)}</TableCell>
                  <TableCell className="p-0 text-center">
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => onDeleteItem(item.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </TableCell>
                  {sendingToOrder === item.id && (
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
                        handleSendToOrden(item);
                      }}
                      disabled={!!sendingToOrder}
                    >
                      {sendingToOrder === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                      Enviar a Orden de Compra
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}

            {/* Filas vacías con líneas de grilla visibles */}
            {Array.from({ length: emptyRowsCount }).map((_, i) => (
              <TableRow key={`empty-${i}`} className={`h-7 border-b border-gray-300 ${i % 2 === 0 ? 'bg-[#fafaf5]' : 'bg-[#f2f2eb]'}`}>
                <TableCell className="border-r border-gray-300"></TableCell>
                <TableCell className="border-r border-gray-300"></TableCell>
                <TableCell className="border-r border-gray-300"></TableCell>
                <TableCell className="border-r border-gray-300"></TableCell>
                <TableCell className="border-r border-gray-300"></TableCell>
                <TableCell className="border-r border-gray-300"></TableCell>
                <TableCell className="border-r border-gray-300"></TableCell>
                <TableCell colSpan="2"></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default VentasTable;
