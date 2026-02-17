import { Plus, X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const ProductHeader = ({ onAdd, onDelete, onChangeCode, hasSelection }) => {
  return (
    <div className="flex justify-between items-center pb-4 border-b">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Maestro de Artículos</h1>
        <p className="text-gray-500">Administra y organiza todos tus productos.</p>
      </div>
      <div className="flex items-center gap-2">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 shadow-sm"
                onClick={onDelete}
                disabled={!hasSelection}
              >
                <X className="h-6 w-6 stroke-[3]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Eliminar Mercancía</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-700 shadow-sm"
                onClick={onChangeCode}
                disabled={!hasSelection}
              >
                <RefreshCw className="h-6 w-6 stroke-[3]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Cambiar Código de Mercancía</p></TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Button onClick={onAdd} variant="accent" className="h-10 px-4">
          <Plus className="mr-2 h-5 w-5" /> Nuevo
        </Button>
      </div>
    </div>
  );
};

export default ProductHeader;