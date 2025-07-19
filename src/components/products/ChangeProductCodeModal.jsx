import React, { useState } from 'react';
    import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { useToast } from '@/components/ui/use-toast';
    import { supabase } from '@/lib/customSupabaseClient';
    import { RefreshCw, Loader2 } from 'lucide-react';

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
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RefreshCw className="w-6 h-6 text-morla-blue" />
                <span className="text-xl">Cambio de Código de Mercancía</span>
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="codigo-anterior">Código Anterior</Label>
                <Input id="codigo-anterior" value={product.codigo} disabled />
                <p className="text-sm text-gray-500 pl-1">{product.descripcion}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nuevo-codigo">Nuevo Código</Label>
                <Input
                  id="nuevo-codigo"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="Ingrese el nuevo código"
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Salir</Button>
              <Button onClick={handleChangeCode} disabled={loading} className="bg-morla-blue hover:bg-morla-blue-dark">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Realizar Cambio
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );
    };

    export default ChangeProductCodeModal;