import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

const ProductHeader = ({ onAdd }) => {
  return (
    <div className="flex justify-between items-center pb-4 border-b">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Maestro de Artículos</h1>
        <p className="text-gray-500">Administra y organiza todos tus productos.</p>
      </div>
      <Button onClick={onAdd}>
        <Plus className="mr-2 h-4 w-4" /> Nuevo
      </Button>
    </div>
  );
};

export default ProductHeader;