import { Plus, X, RefreshCw, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const ProductHeader = ({ onAdd, onDelete, onChangeCode, onImageStudio, hasSelection }) => {
  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-2 gap-4">
      <div>
        <h1 className="text-3xl font-black text-morla-blue uppercase tracking-tight">
          Maestro de Artículos
        </h1>
        <p className="text-gray-500 text-sm font-medium">
          Control total de inventario y catalogación de productos.
        </p>
      </div>
      <div className="flex items-center gap-3 w-full md:w-auto justify-end">
        <TooltipProvider>
          <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200 shadow-sm">
            <AlertDialog>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-red-500 hover:bg-red-50 hover:text-red-700 transition-all active:scale-90"
                      disabled={!hasSelection}
                    >
                      <X className="h-5 w-5 stroke-[3]" />
                    </Button>
                  </AlertDialogTrigger>
                </TooltipTrigger>
                <TooltipContent><p className="text-xs">Eliminar Seleccionado</p></TooltipContent>
              </Tooltip>

              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-red-600">
                    <AlertTriangle className="h-5 w-5" />
                    Confirmar Eliminación
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-base text-gray-700">
                    Está a punto de eliminar un producto. ¿Desea continuar?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="font-semibold">Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onDelete}
                    className="bg-red-600 hover:bg-red-700 text-white font-semibold"
                  >
                    Aceptar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-all active:scale-90"
                  onClick={onChangeCode}
                  disabled={!hasSelection}
                >
                  <RefreshCw className="h-5 w-5 stroke-[3]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Cambiar Código</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-violet-600 hover:bg-violet-50 hover:text-violet-700 transition-all active:scale-90"
                  onClick={onImageStudio}
                  disabled={!hasSelection}
                >
                  <ImageIcon className="h-5 w-5 stroke-[3]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Producto Studio</p></TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>

        <Button
          onClick={onImageStudio}
          disabled={!hasSelection}
          variant="outline"
          className="h-10 px-4 border-violet-200 bg-white text-violet-700 hover:bg-violet-50 font-bold uppercase tracking-wider shadow-sm transition-all active:scale-95 flex items-center gap-2"
          title={hasSelection ? 'Limpiar imagen del producto seleccionado' : 'Selecciona un articulo para limpiar su imagen'}
        >
          <ImageIcon className="h-5 w-5" />
          <span>Producto Studio</span>
        </Button>

        <Button
          onClick={onAdd}
          className="h-10 px-6 bg-morla-blue hover:bg-blue-900 text-white font-bold uppercase tracking-wider shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center gap-2 border-b-4 border-blue-950"
        >
          <Plus className="h-5 w-5" />
          <span>Nuevo Artículo</span>
        </Button>
      </div>
    </div>
  );
};

export default ProductHeader;
