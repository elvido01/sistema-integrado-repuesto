import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { RefreshCw, Loader2, X } from 'lucide-react';

const ChangeProductCodeModal = ({ product, isOpen, onClose, onCodeChanged }) => {
  const { toast } = useToast();
  const [newCode, setNewCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChangeCode = async () => {
    if (!newCode.trim()) {
      toast({
        variant: 'destructive',
        title: 'Error de Validación',
        description: 'El nuevo código no puede estar vacío.',
      });
      return;
    }

    if (newCode.trim() === product.codigo) {
      toast({
        variant: 'destructive',
        title: 'Error de Validación',
        description: 'El nuevo código no puede ser igual al código anterior.',
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.rpc('cambiar_codigo_producto', {
        p_producto_id: product.id,
        p_nuevo_codigo: newCode.trim(),
      });

      if (error) {
        throw error;
      }

      toast({
        title: '¡Éxito!',
        description: `El código del producto ha sido cambiado de "${product.codigo}" a "${newCode.trim()}".`,
        className: 'bg-green-100 text-green-800',
      });
      if (onCodeChanged) onCodeChanged();
      handleClose();
    } catch (error) {
      console.error('Error changing product code:', error);
      toast({
        variant: 'destructive',
        title: 'Error al cambiar código',
        description: error.message || 'Ocurrió un error inesperado.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setNewCode('');
    onClose();
  };

  if (!product) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden border-none shadow-2xl">
        {/* Styled Header matching Image 3 */}
        <div className="bg-[#a3c2f0] py-2 px-6 flex justify-between items-center border-b border-blue-300">
          <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
            <RefreshCw className="w-6 h-6 text-blue-700" /> Cambio de Codigo de Mercancia...
          </h2>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-red-500 hover:text-white">
              <X className="h-4 w-4" />
            </Button>
          </DialogClose>
        </div>

        <div className="bg-slate-100 p-8 space-y-8">
          <div className="bg-[#6fa8dc] py-3 text-center rounded shadow-sm">
            <h3 className="text-3xl font-black text-slate-900 tracking-tight">
              Cambio de Codigo de Mercancia
            </h3>
          </div>

          <div className="space-y-6 px-4">
            <div className="grid grid-cols-3 items-center gap-4">
              <Label htmlFor="codigo-anterior" className="text-xl font-bold text-right">Codigo Anterior</Label>
              <div className="col-span-2 space-y-1">
                <Input
                  id="codigo-anterior"
                  value={product.codigo}
                  disabled
                  className="text-xl font-mono bg-slate-200 border-slate-400 text-slate-700 h-10"
                />
                <p className="text-lg font-black text-slate-900 uppercase pl-1">{product.descripcion}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 items-center gap-4 pt-4">
              <Label htmlFor="nuevo-codigo" className="text-xl font-bold text-right">Nuevo Codigo</Label>
              <Input
                id="nuevo-codigo"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder=""
                autoFocus
                className="col-span-2 text-xl font-mono bg-[#ffffbf] border-blue-500 text-slate-900 h-11 focus:ring-2 focus:ring-blue-400 shadow-inner"
              />
            </div>
          </div>

          <div className="h-px bg-slate-300 w-full" />

          <div className="flex justify-end gap-3 px-4">
            <Button
              onClick={handleChangeCode}
              disabled={loading}
              className="bg-slate-200 text-slate-900 hover:bg-slate-300 border border-slate-400 px-8 py-6 text-xl font-bold rounded-none shadow-sm"
            >
              {loading ? <Loader2 className="mr-2 h-6 w-6 animate-spin" /> : null}
              Realizar <u>C</u>ambio
            </Button>
            <Button
              variant="outline"
              onClick={handleClose}
              className="bg-slate-200 text-slate-900 hover:bg-slate-300 border border-slate-400 px-12 py-6 text-xl font-bold rounded-none shadow-sm"
            >
              <u>S</u>alir
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ChangeProductCodeModal;