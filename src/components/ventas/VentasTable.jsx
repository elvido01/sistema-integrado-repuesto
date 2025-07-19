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
}) => {
  const emptyRowsCount = Math.max(0, 12 - items.length);

  return (
    <div className="flex-grow border border-gray-500 bg-white flex flex-col">
      <div className="flex-grow overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-gray-200 z-10">
            <TableRow className="border-b-2 border-gray-400">
              <TableHead className="h-6 p-1 w-[150px]">CODIGO</TableHead>
              <TableHead className="h-6 p-1">DESCRIPCION</TableHead>
              <TableHead className="h-6 p-1 w-[100px]">UBICACION</TableHead>
              <TableHead className="h-6 p-1 w-[60px] text-center">CANT.</TableHead>
              <TableHead className="h-6 p-1 w-[90px] text-right">PRECIO</TableHead>
              <TableHead className="h-6 p-1 w-[70px] text-right">DESC.</TableHead>
              <TableHead className="h-6 p-1 w-[70px] text-right">ITBIS</TableHead>
              <TableHead className="h-6 p-1 w-[100px] text-right">IMPORTE</TableHead>
              <TableHead className="h-6 p-1 w-[30px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="sticky top-6 bg-white z-10 border-b border-gray-400">
              <TableCell className="p-0.5">
                <div className="flex items-center">
                  <Input 
                    placeholder="Código..." 
                    className="h-6 text-xs rounded-r-none" 
                    value={itemCode} 
                    onChange={(e) => setItemCode(e.target.value)} 
                    onKeyDown={onItemCodeKeyDown} 
                  />
                  <Button size="sm" variant="outline" className="h-6 px-2 rounded-l-none border-l-0" onClick={onProductSearch}>
                    <Search className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </TableCell>
              <TableCell className="p-0.5 text-muted-foreground text-xs" colSpan="8">
                ... o buscar por descripción
              </TableCell>
            </TableRow>
            {items.map((item) => {
              const itbisTotal = item.itbis;
              return (
                <TableRow key={item.id} className="border-b border-dotted border-gray-300 hover:bg-yellow-50">
                  <TableCell className="h-6 p-1 font-medium">{item.codigo}</TableCell>
                  <TableCell className="h-6 p-1">{item.descripcion}</TableCell>
                  <TableCell className="h-6 p-1">{item.ubicacion}</TableCell>
                  <TableCell className="h-6 p-1"><Input type="number" value={item.cantidad} onChange={(e) => onUpdateItem(item.id, 'cantidad', e.target.value)} className="h-6 text-center text-xs w-full" min="1" /></TableCell>
                  <TableCell className="h-6 p-1 text-right">{Number(item.precio).toFixed(2)}</TableCell>
                  <TableCell className="h-6 p-1"><Input type="number" value={item.descuento} onChange={(e) => onUpdateItem(item.id, 'descuento', e.target.value)} className="h-6 text-right text-xs w-full" min="0" /></TableCell>
                  <TableCell className="h-6 p-1 text-right">{itbisTotal.toFixed(2)}</TableCell>
                  <TableCell className="h-6 p-1 text-right font-semibold">{item.importe.toFixed(2)}</TableCell>
                  <TableCell className="p-1 text-center"><Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-500 hover:text-red-700" onClick={() => onDeleteItem(item.id)}><Trash2 className="w-3 h-3" /></Button></TableCell>
                </TableRow>
              );
            })}
            {Array.from({ length: emptyRowsCount }).map((_, i) => (<TableRow key={`empty-${i}`} className="border-b border-dotted border-gray-300"><TableCell colSpan="9" className="h-6 p-1"></TableCell></TableRow>))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default VentasTable;