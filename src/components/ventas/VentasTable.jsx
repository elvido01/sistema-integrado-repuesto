import React from 'react';
import { Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const VentasTable = ({
  items,
  itemCode,
  setItemCode,
  onItemCodeKeyDown,
  onProductSearch,
  onUpdateItem,
  onDeleteItem,
  currentItem = null,
  updateCurrentItem = () => { },
  commitCurrentItem = () => { },
  clearCurrentItem = () => { },
  userRole = 'seller'
}) => {
  // Debug log to catch the crash data
  console.log('VentasTable Render Check:', { itemsCount: items?.length, currentItemExists: !!currentItem });
  const emptyRowsCount = Math.max(0, 12 - items.length);

  const prevItemIdRef = React.useRef(null);

  React.useEffect(() => {
    // Only focus Quantity if it's a DIFFERENT product being loaded
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

  // Helper for double-click focus
  const handleInputDoubleClick = (e) => {
    e.currentTarget.focus();
    e.currentTarget.select();
  };

  return (
    <div className="flex-grow border border-gray-600 bg-white flex flex-col shadow-inner">
      <div className="flex-grow overflow-y-auto scrollbar-thin scrollbar-thumb-gray-400">
        <Table className="border-collapse">
          <TableHeader className="sticky top-0 bg-[#eee] z-10 border-b border-gray-600 shadow-sm">
            <TableRow className="hover:bg-transparent border-none h-6">
              <TableHead className="h-6 p-1 w-[120px] text-[13px] font-bold text-gray-700 border-r border-gray-400">CODIGO</TableHead>
              <TableHead className="h-6 p-1 text-[13px] font-bold text-gray-700 border-r border-gray-400">DESCRIPCION</TableHead>
              <TableHead className="h-6 p-1 w-[110px] text-[13px] font-bold text-gray-700 border-r border-gray-400 text-center">UBICACION</TableHead>
              <TableHead className="h-6 p-1 w-[60px] text-[13px] font-bold text-gray-700 border-r border-gray-400 text-center">CANT.</TableHead>
              <TableHead className="h-6 p-1 w-[90px] text-[13px] font-bold text-gray-700 border-r border-gray-400 text-right">PRECIO</TableHead>
              <TableHead className="h-6 p-1 w-[65px] text-[13px] font-bold text-gray-700 border-r border-gray-400 text-right">DESC.</TableHead>
              <TableHead className="h-6 p-1 w-[80px] text-[13px] font-bold text-gray-700 border-r border-gray-400 text-right">ITBIS</TableHead>
              <TableHead className="h-6 p-1 w-[100px] text-[13px] font-bold text-gray-700 text-right">IMPORTE</TableHead>
              <TableHead className="h-6 p-1 w-[30px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* STAGING ROW (Input Row) - Legacy High Contrast Style */}
            <TableRow className="sticky top-6 bg-[#ffffbf] z-20 border-b border-gray-600 shadow-md h-8 group">
              <TableCell className="p-0.5 border-r border-gray-400">
                <div className="flex items-center">
                  <Input
                    id="input-codigo"
                    placeholder="Código..."
                    className="h-6 text-[14px] font-black rounded-none border-blue-600 focus:ring-0 bg-white uppercase placeholder:italic"
                    value={itemCode}
                    onChange={(e) => setItemCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'F3') { e.preventDefault(); onProductSearch(); }
                      else { onItemCodeKeyDown(e); }
                    }}
                    autoComplete="off"
                  />
                  <Button size="sm" variant="outline" className="h-6 px-1 rounded-none border-gray-400 bg-gray-100 hover:bg-white" onClick={onProductSearch} tabIndex="-1">
                    <Search className="w-3 h-3 text-blue-800" />
                  </Button>
                </div>
              </TableCell>
              <TableCell className="p-1 border-r border-gray-400">
                <div className="text-[14px] font-black text-blue-900 leading-tight uppercase truncate max-w-[400px]" title={currentItem?.descripcion}>
                  {currentItem ? currentItem.descripcion : <span className="text-gray-400 italic">... BUSQUE POR CODIGO O F3</span>}
                </div>
              </TableCell>
              <TableCell className="p-1 border-r border-gray-400 text-center">
                <span className="text-[13px] font-bold text-gray-600 bg-gray-100/50 px-1 rounded">{currentItem ? currentItem.ubicacion : ''}</span>
              </TableCell>
              <TableCell className="p-0.5 border-r border-gray-400">
                <Input
                  id="input-cantidad"
                  type="number"
                  className="h-6 text-center font-black text-blue-900 border-blue-600 focus:ring-0 bg-white hide-spinner text-[14px]"
                  value={currentItem ? currentItem.cantidad : ''}
                  onChange={(e) => updateCurrentItem && updateCurrentItem('cantidad', e.target.value)}
                  disabled={!currentItem}
                  min="1"
                  onDoubleClick={handleInputDoubleClick}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
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
              <TableCell className="p-0.5 border-r border-gray-400">
                <Input
                  id="input-precio"
                  type="number"
                  className="h-6 text-right font-black text-blue-900 border-blue-600 focus:ring-0 bg-white hide-spinner text-[14px]"
                  value={currentItem ? currentItem.precio : ''}
                  onChange={(e) => updateCurrentItem && updateCurrentItem('precio', e.target.value)}
                  disabled={!currentItem || userRole !== 'admin'}
                  min="0"
                  onDoubleClick={handleInputDoubleClick}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('input-descuento')?.focus(); document.getElementById('input-descuento')?.select(); } }}
                />
              </TableCell>
              <TableCell className="p-0.5 border-r border-gray-400">
                <Input
                  id="input-descuento"
                  type="number"
                  step="0.01"
                  className="h-6 text-right font-black text-red-600 border-blue-600 focus:ring-0 bg-white hide-spinner text-[14px]"
                  value={currentItem ? currentItem.descuento : ''}
                  onChange={(e) => updateCurrentItem && updateCurrentItem('descuento', e.target.value)}
                  disabled={!currentItem}
                  min="0"
                  onDoubleClick={handleInputDoubleClick}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (commitCurrentItem) commitCurrentItem(); setTimeout(() => document.getElementById('input-codigo')?.focus(), 50); } }}
                />
              </TableCell>
              <TableCell className="h-6 p-1 text-right border-r border-gray-400 text-[13px] font-bold text-gray-700 bg-gray-50/30">
                {currentItem?.itbis != null ? Number(currentItem.itbis).toFixed(2) : '0.00'}
              </TableCell>
              <TableCell className="h-6 p-1 text-right text-[15px] font-black text-blue-800 bg-blue-50/30">
                {currentItem?.importe != null ? Number(currentItem.importe).toFixed(2) : '0.00'}
              </TableCell>
              <TableCell className="p-1 text-center">
                {currentItem && (
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-600 hover:bg-red-50" onClick={clearCurrentItem}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </TableCell>
            </TableRow>

            {/* Main Item List - Precise High Density Grid */}
            {items.map((item, index) => {
              if (!item) return null;
              return (
                <TableRow key={item.id || index} className={`h-6 border-b border-gray-300 hover:bg-[#fff9e6] ${index % 2 === 0 ? 'bg-white' : 'bg-[#f9f9f9]'}`}>
                  <TableCell className="p-1 text-[14px] font-bold border-r border-gray-300">{item.codigo}</TableCell>
                  <TableCell className="p-1 text-[13px] font-semibold text-gray-800 border-r border-gray-300 uppercase truncate max-w-[400px]">{item.descripcion}</TableCell>
                  <TableCell className="p-1 text-[13px] text-gray-500 border-r border-gray-300 text-center italic">{item.ubicacion}</TableCell>
                  <TableCell className="p-0 border-r border-gray-300">
                    <input type="number" value={item.cantidad} onChange={(e) => onUpdateItem(item.id, 'cantidad', e.target.value)} className="w-full h-full bg-transparent text-center text-[14px] font-bold focus:bg-white outline-none hide-spinner" />
                  </TableCell>
                  <TableCell className="p-1 text-right text-[14px] font-bold border-r border-gray-300">
                    {userRole === 'admin' ? (
                      <input
                        type="number"
                        value={item.precio}
                        onChange={(e) => onUpdateItem(item.id, 'precio', e.target.value)}
                        className="w-full h-full bg-transparent text-right text-[14px] font-bold focus:bg-white outline-none hide-spinner"
                      />
                    ) : (
                      Number(item.precio || 0).toFixed(2)
                    )}
                  </TableCell>
                  <TableCell className="p-0 border-r border-gray-300">
                    <input
                      type="number"
                      step="0.01"
                      value={Number((item.precio * item.cantidad) * (item.descuento / 100)).toFixed(2)}
                      onChange={(e) => {
                        const newAmount = parseFloat(e.target.value) || 0;
                        const totalBruto = (item.precio * item.cantidad);
                        const newPct = totalBruto > 0 ? (newAmount / totalBruto) * 100 : 0;
                        onUpdateItem(item.id, 'descuento', newPct);
                      }}
                      className="w-full h-full bg-transparent text-right text-[14px] font-bold text-red-600 focus:bg-white outline-none px-1 hide-spinner"
                    />
                  </TableCell>
                  <TableCell className="p-1 text-right text-[14px] font-semibold text-gray-600 border-r border-gray-300">{Number(item.itbis || 0).toFixed(2)}</TableCell>
                  <TableCell className="p-1 text-right text-[14px] font-black text-blue-900">{Number(item.importe || 0).toFixed(2)}</TableCell>
                  <TableCell className="p-0 text-center">
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-500 hover:text-red-700" onClick={() => onDeleteItem(item.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}

            {/* Fill remaining space with empty grid lines */}
            {Array.from({ length: emptyRowsCount }).map((_, i) => (
              <TableRow key={`empty-${i}`} className="h-6 border-b border-gray-200">
                <TableCell className="border-r border-gray-200"></TableCell>
                <TableCell className="border-r border-gray-200"></TableCell>
                <TableCell className="border-r border-gray-200"></TableCell>
                <TableCell className="border-r border-gray-200"></TableCell>
                <TableCell className="border-r border-gray-200"></TableCell>
                <TableCell className="border-r border-gray-200"></TableCell>
                <TableCell className="border-r border-gray-200"></TableCell>
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