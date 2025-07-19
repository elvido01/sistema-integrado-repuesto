import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Search } from 'lucide-react';

const CompraDetalles = ({ currentDetalle, setCurrentDetalle, detalles, addDetalle, removeDetalle, setIsSearchModalOpen }) => {
  
  const handleInputChange = (field, value) => {
    setCurrentDetalle(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="mt-4">
      <div className="grid grid-cols-[150px_1fr_90px_90px_110px_90px_110px_130px_40px] gap-2 items-end p-2 bg-gray-200 rounded-t-lg">
        <Label>CÓDIGO (F3)</Label>
        <Label>DESCRIPCIÓN</Label>
        <Label className="text-right">CANT.</Label>
        <Label>UND</Label>
        <Label className="text-right">COSTO</Label>
        <Label className="text-right">DESC.%</Label>
        <Label className="text-right">ITBIS</Label>
        <Label className="text-right">IMPORTE</Label>
        <div></div>
      </div>
      <div className="grid grid-cols-[150px_1fr_90px_90px_110px_90px_110px_130px_40px] gap-2 items-center p-2 border-b">
        <div className="relative flex items-center">
          <Input id="codigo-producto" value={currentDetalle.codigo} onChange={e => handleInputChange('codigo', e.target.value)} />
          <Button variant="ghost" size="icon" className="h-8 w-8 absolute right-0" onClick={() => setIsSearchModalOpen(true)}>
            <Search className="h-4 w-4 text-gray-400" />
          </Button>
        </div>
        <Input value={currentDetalle.descripcion} readOnly disabled className="bg-gray-100" />
        <Input id="cantidad-producto" type="number" className="text-right" value={currentDetalle.cantidad} onChange={e => handleInputChange('cantidad', e.target.value)} />
        <Select value={currentDetalle.unidad} onValueChange={v => handleInputChange('unidad', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="UND">UND</SelectItem>
            <SelectItem value="CAJA">CAJA</SelectItem>
          </SelectContent>
        </Select>
        <Input type="number" className="text-right" value={currentDetalle.costo_unitario} onChange={e => handleInputChange('costo_unitario', e.target.value)} />
        <Input type="number" className="text-right" value={currentDetalle.descuento_pct} onChange={e => handleInputChange('descuento_pct', e.target.value)} />
        <Input type="number" className="text-right" value={(currentDetalle.itbis_pct * 100).toFixed(2)} readOnly disabled />
        <Input className="text-right bg-gray-100" value={( (parseFloat(currentDetalle.cantidad) || 0) * (parseFloat(currentDetalle.costo_unitario) || 0) * (1 - (parseFloat(currentDetalle.descuento_pct) || 0) / 100)).toFixed(2)} readOnly disabled />
        <Button size="sm" onClick={addDetalle}><Plus className="h-4 w-4" /></Button>
      </div>
      <div className="max-h-64 overflow-y-auto">
        <Table>
          <TableBody>
            {detalles.map(d => (
              <TableRow key={d.id}>
                <TableCell className="w-[150px]">{d.codigo}</TableCell>
                <TableCell>{d.descripcion}</TableCell>
                <TableCell className="text-right w-[90px]">{Number(d.cantidad).toFixed(2)}</TableCell>
                <TableCell className="w-[90px]">{d.unidad}</TableCell>
                <TableCell className="text-right w-[110px]">{Number(d.costo_unitario).toFixed(2)}</TableCell>
                <TableCell className="text-right w-[90px]">{Number(d.descuento_pct).toFixed(2)}%</TableCell>
                <TableCell className="text-right w-[110px]">{(Number(d.itbis_pct) * 100).toFixed(2)}%</TableCell>
                <TableCell className="text-right font-bold w-[130px]">{Number(d.importe).toFixed(2)}</TableCell>
                <TableCell className="w-[40px]">
                  <Button variant="ghost" size="sm" onClick={() => removeDetalle(d.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default CompraDetalles;