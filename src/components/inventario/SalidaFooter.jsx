import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

const SalidaFooter = ({ totals, salida, setSalida }) => {
  return (
    <div className="mt-4 flex justify-between items-center p-4 border-t">
      <div className="flex items-center space-x-2">
        <Checkbox 
          id="imprimir" 
          checked={salida.imprimir} 
          onCheckedChange={checked => setSalida({...salida, imprimir: checked})}
        />
        <Label htmlFor="imprimir">Imprimir al guardar</Label>
      </div>
      <div className="flex space-x-8">
        <div className="text-right">
          <p className="text-sm text-gray-500">Total de Items</p>
          <p className="font-bold text-lg">{totals.totalItems.toFixed(2)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">Total Costo</p>
          <p className="font-bold text-lg text-red-600">{totals.totalCosto.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
};

export default SalidaFooter;