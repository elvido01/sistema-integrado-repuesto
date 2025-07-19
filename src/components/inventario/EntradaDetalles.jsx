import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableRow, TableHeader, TableHead } from '@/components/ui/table';
import { Trash2, Search } from 'lucide-react';

const EntradaDetalles = ({ currentDetalle, setCurrentDetalle, detalles, addDetalle, removeDetalle, updateDetalle, setIsSearchModalOpen }) => {
  
  const handleInputChange = (field, value) => {
    const newDetalle = { ...currentDetalle, [field]: value };
    if (field === 'cantidad' || field === 'costo_unitario') {
      newDetalle.importe = (parseFloat(newDetalle.cantidad) || 0) * (parseFloat(newDetalle.costo_unitario) || 0);
    }
    setCurrentDetalle(newDetalle);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDetalle();
    }
  };

  return (
    <div className="mt-4 flex-grow flex flex-col">
      <div className="grid grid-cols-[150px_1fr_90px_90px_110px_130px_40px] gap-2 items-end p-2 bg-gray-200 rounded-t-lg">
        <div className="relative flex items-center">
          <Input 
            id="codigo-producto" 
            placeholder="Código (F3)"
            value={currentDetalle.codigo} 
            onChange={e => handleInputChange('codigo', e.target.value)} 
            onKeyDown={handleKeyDown} 
          />
          <Button variant="ghost" size="icon" className="h-8 w-8 absolute right-0" onClick={() => setIsSearchModalOpen(true)}>
            <Search className="h-4 w-4 text-gray-400" />
          </Button>
        </div>
        <Input placeholder="Descripción" value={currentDetalle.descripcion} readOnly disabled className="bg-gray-100" />
        <Input id="cantidad-producto" type="number" placeholder="Cant." className="text-right" value={currentDetalle.cantidad} onChange={e => handleInputChange('cantidad', e.target.value)} onKeyDown={handleKeyDown} />
        <Select value={currentDetalle.unidad} onValueChange={v => handleInputChange('unidad', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="UND">UND</SelectItem>
            <SelectItem value="CAJA">CAJA</SelectItem>
            <SelectItem value="PAQUETE">PAQUETE</SelectItem>
          </SelectContent>
        </Select>
        <Input type="number" placeholder="Costo" className="text-right" value={currentDetalle.costo_unitario} onChange={e => handleInputChange('costo_unitario', e.target.value)} onKeyDown={handleKeyDown} />
        <Input className="text-right bg-gray-100" placeholder="Importe" value={currentDetalle.importe.toFixed(2)} readOnly disabled />
        <Button size="sm" onClick={addDetalle}>Ok</Button>
      </div>

      <div className="flex-grow overflow-y-auto border-x border-b rounded-b-lg">
        <Table>
          <TableHeader className="sticky top-0 bg-gray-50 z-10">
              <TableRow>
                  <TableHead className="w-[150px]">CÓDIGO</TableHead>
                  <TableHead>DESCRIPCIÓN</TableHead>
                  <TableHead className="text-right w-[90px]">CANT.</TableHead>
                  <TableHead className="w-[90px]">UND</TableHead>
                  <TableHead className="text-right w-[110px]">COSTO</TableHead>
                  <TableHead className="text-right w-[130px]">IMPORTE</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
              </TableRow>
          </TableHeader>
          <TableBody>
            {detalles.map(d => (
              <TableRow key={d.id}>
                <TableCell>{d.codigo}</TableCell>
                <TableCell>{d.descripcion}</TableCell>
                <TableCell className="text-right">
                  <Input 
                    type="number"
                    value={d.cantidad}
                    onChange={e => updateDetalle(d.id, 'cantidad', e.target.value)}
                    className="h-8 text-right"
                  />
                </TableCell>
                <TableCell>
                   <Select value={d.unidad} onValueChange={v => updateDetalle(d.id, 'unidad', v)}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UND">UND</SelectItem>
                        <SelectItem value="CAJA">CAJA</SelectItem>
                        <SelectItem value="PAQUETE">PAQUETE</SelectItem>
                      </SelectContent>
                    </Select>
                </TableCell>
                <TableCell className="text-right">
                   <Input 
                    type="number"
                    value={d.costo_unitario}
                    onChange={e => updateDetalle(d.id, 'costo_unitario', e.target.value)}
                    className="h-8 text-right"
                  />
                </TableCell>
                <TableCell className="text-right font-bold">{Number(d.importe).toFixed(2)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeDetalle(d.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </TableCell>
              </TableRow>
            ))}
             {detalles.length === 0 && (
                <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Añada productos a la entrada.
                    </TableCell>
                </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default EntradaDetalles;