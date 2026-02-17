import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Search } from 'lucide-react';

const CompraDetalles = ({ currentDetalle, setCurrentDetalle, detalles, addDetalle, removeDetalle, setIsSearchModalOpen, onCreateProduct, itbisIncluido }) => {

  const handleInputChange = (field, value) => {
    setCurrentDetalle(prev => ({ ...prev, [field]: value }));
  };

  const calculateImporte = () => {
    const cant = parseFloat(currentDetalle.cantidad) || 0;
    const costo = parseFloat(currentDetalle.costo_unitario) || 0;
    const desc = parseFloat(currentDetalle.descuento_pct) || 0;
    return (cant * costo * (1 - desc / 100)).toFixed(2);
  };

  return (
    <div className="mt-4 border rounded shadow-sm bg-white overflow-hidden">
      {/* Header Row */}
      <div className="grid grid-cols-[120px_1fr_70px_70px_100px_80px_100px_40px_120px_40px] gap-0 bg-gray-100 border-b divide-x divide-gray-300">
        <div className="px-2 py-1 text-[10px] font-bold text-gray-600 uppercase">CODIGO</div>
        <div className="px-2 py-1 text-[10px] font-bold text-gray-600 uppercase">DESCRIPCION</div>
        <div className="px-2 py-1 text-[10px] font-bold text-gray-600 uppercase text-center">CANT.</div>
        <div className="px-2 py-1 text-[10px] font-bold text-gray-600 uppercase text-center">UND</div>
        <div className="px-2 py-1 text-[10px] font-bold text-gray-600 uppercase text-right">COSTO</div>
        <div className="px-2 py-1 text-[10px] font-bold text-gray-600 uppercase text-right">DESC.</div>
        <div className="px-2 py-1 text-[10px] font-bold text-gray-600 uppercase text-right">ITBIS</div>
        <div className="px-2 py-1 text-[10px] font-bold text-gray-600 uppercase text-center">Ok</div>
        <div className="px-2 py-1 text-[10px] font-bold text-gray-600 uppercase text-right">IMPORTE</div>
        <div className="px-1 py-1"></div>
      </div>

      {/* Staging Entry Row (Yellow) */}
      <div className="grid grid-cols-[120px_1fr_70px_70px_100px_80px_100px_40px_120px_40px] gap-0 bg-yellow-50/80 border-b divide-x divide-gray-200">
        <div className="relative group">
          <Input
            id="codigo-producto"
            value={currentDetalle.codigo}
            className="h-8 border-none bg-transparent text-xs focus-visible:ring-0 focus-visible:ring-offset-0 font-mono"
            onChange={e => handleInputChange('codigo', e.target.value)}
            placeholder="F3 Búscar"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 absolute right-1 top-1 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => setIsSearchModalOpen(true)}
          >
            <Search className="h-3 w-3" />
          </Button>
        </div>
        <div>
          <Input
            value={currentDetalle.descripcion}
            readOnly
            disabled
            className="h-8 border-none bg-transparent text-xs focus-visible:ring-0 focus-visible:ring-offset-0 italic"
          />
        </div>
        <Input
          id="cantidad-producto"
          type="number"
          className="h-8 border-none bg-transparent text-xs text-center focus-visible:ring-0 focus-visible:ring-offset-0"
          value={currentDetalle.cantidad}
          onChange={e => handleInputChange('cantidad', e.target.value)}
          onFocus={e => e.target.select()}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              document.getElementById('costo-unitario')?.focus();
            }
          }}
        />
        <Select value={currentDetalle.unidad} onValueChange={v => handleInputChange('unidad', v)}>
          <SelectTrigger className="h-8 border-none bg-transparent text-xs shadow-none focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="UND">UND</SelectItem>
            <SelectItem value="CAJA">CAJA</SelectItem>
          </SelectContent>
        </Select>
        <Input
          id="costo-unitario"
          type="number"
          className="h-8 border-none bg-transparent text-xs text-right focus-visible:ring-0 focus-visible:ring-offset-0"
          value={currentDetalle.costo_unitario}
          onChange={e => handleInputChange('costo_unitario', e.target.value)}
          onFocus={e => e.target.select()}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              document.getElementById('descuento-producto')?.focus();
            }
          }}
        />
        <div className="flex items-center gap-0.5 px-1 bg-white/50">
          <Input
            id="descuento-producto"
            type="number"
            className="h-8 border-none bg-transparent text-xs text-right w-full p-1 focus-visible:ring-0"
            value={currentDetalle.descuento_pct}
            onChange={e => handleInputChange('descuento_pct', e.target.value)}
            onFocus={e => e.target.select()}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addDetalle();
              }
            }}
          />
          <span className="text-[10px] text-gray-400">%</span>
        </div>
        <div className="flex items-center justify-end px-2 text-xs text-gray-500 font-mono">
          {((currentDetalle.itbis_pct || 0) * 100).toFixed(0)}%
        </div>
        <div className="flex items-center justify-center">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
            onClick={addDetalle}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center justify-end px-2 text-xs font-bold text-gray-700 font-mono bg-white/30">
          {calculateImporte()}
        </div>
        <div className="flex items-center justify-center bg-white/10 opacity-30">
          <Trash2 className="h-3 w-3 text-gray-400" />
        </div>
      </div>

      {/* Items List Table */}
      <div className="max-h-[350px] overflow-y-auto">
        <Table className="border-collapse">
          <TableBody>
            {detalles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="h-32 text-center text-gray-400 text-xs italic">
                  No hay productos registrados en esta compra.
                </TableCell>
              </TableRow>
            ) : (
              detalles.map(d => (
                <TableRow key={d.id} className={`group divide-x divide-gray-100 hover:bg-gray-50 transition-colors h-9 ${!d.producto_id ? 'bg-red-50/50' : ''}`}>
                  <TableCell className="w-[120px] p-0 px-2 font-mono text-[11px] h-9">
                    <div className="flex items-center justify-between">
                      <span>{d.codigo}</span>
                      {!d.producto_id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-red-600"
                          title="Crear este producto"
                          onClick={() => onCreateProduct?.(d)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="p-0 px-2 text-[11px] h-9">{d.descripcion}</TableCell>
                  <TableCell className="w-[70px] p-0 px-2 text-center text-[11px] h-9 font-mono">{Number(d.cantidad).toFixed(2)}</TableCell>
                  <TableCell className="w-[70px] p-0 px-2 text-center text-[11px] h-9">{d.unidad}</TableCell>
                  <TableCell className="w-[100px] p-0 px-2 text-right text-[11px] h-9 font-mono">{Number(d.costo_unitario).toFixed(2)}</TableCell>
                  <TableCell className="w-[80px] p-0 px-2 text-right text-[11px] h-9 font-mono text-gray-500">
                    {d.descuento_pct > 0 ? `${Number(d.descuento_pct).toFixed(0)}%` : '-'}
                  </TableCell>
                  <TableCell className="w-[100px] p-0 px-2 text-right text-[11px] h-9 text-gray-600 font-mono">
                    {(() => {
                      const sub = Number(d.cantidad) * Number(d.costo_unitario);
                      const desc = sub * (Number(d.descuento_pct) / 100);
                      const base = sub - desc;
                      const itbis = d.itbis_pct > 0
                        ? (itbisIncluido ? (base - (base / (1 + d.itbis_pct))) : (base * d.itbis_pct))
                        : 0;
                      return itbis.toFixed(2);
                    })()}
                  </TableCell>
                  <TableCell className="w-[40px] p-0 h-9 text-center">
                    <div className="w-2 h-2 rounded-full bg-green-500/20 mx-auto border border-green-500/30"></div>
                  </TableCell>
                  <TableCell className="w-[120px] p-0 px-2 text-right text-[11px] font-bold h-9 font-mono text-gray-800">
                    {Number(d.importe).toFixed(2)}
                  </TableCell>
                  <TableCell className="w-[40px] p-0 h-9 text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100"
                      onClick={() => removeDetalle(d.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default CompraDetalles;