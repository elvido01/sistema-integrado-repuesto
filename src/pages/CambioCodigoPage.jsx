import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Search, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { usePanels } from '@/contexts/PanelContext';

const CambioCodigoPage = () => {
  const { toast } = useToast();
  const { closePanel } = usePanels();
  const [currentCode, setCurrentCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [product, setProduct] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleSearchProduct = useCallback(async () => {
    if (!currentCode.trim()) {
      setProduct(null);
      return;
    }

    setIsSearching(true);
    setProduct(null);
    try {
      const { data, error } = await supabase
        .from('productos')
        .select('id, codigo, descripcion')
        .eq('codigo', currentCode.trim())
        .single();

      if (error) {
        if (error.code === 'PGRST116') { // "Not a single row" means not found
          toast({
            variant: 'destructive',
            title: 'Producto no encontrado',
            description: `No se encontró ningún producto con el código "${currentCode.trim()}".`,
          });
        } else {
          throw error;
        }
      }
      setProduct(data);
    } catch (error) {
      console.error('Error searching product:', error);
      toast({
        variant: 'destructive',
        title: 'Error de Búsqueda',
        description: 'Ocurrió un error al buscar el producto.',
      });
      setProduct(null);
    } finally {
      setIsSearching(false);
    }
  }, [currentCode, toast]);

  const handleCurrentCodeKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearchProduct();
    }
  };

  const resetForm = () => {
    setCurrentCode('');
    setNewCode('');
    setProduct(null);
  };

  const handleChangeCode = async () => {
    if (!product) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Primero debe buscar y encontrar un producto válido.',
      });
      return;
    }

    if (!newCode.trim()) {
      toast({
        variant: 'destructive',
        title: 'Error de Validación',
        description: 'El nuevo código no puede estar vacío.',
      });
      return;
    }

    if (newCode.trim().toLowerCase() === currentCode.trim().toLowerCase()) {
      toast({
        variant: 'destructive',
        title: 'Error de Validación',
        description: 'El nuevo código debe ser diferente al código actual.',
      });
      return;
    }

    setIsUpdating(true);
    try {
      const { error } = await supabase.rpc('cambiar_codigo_producto', {
        p_producto_id: product.id,
        p_nuevo_codigo: newCode.trim(),
      });

      if (error) throw error;

      toast({
        title: '¡Éxito!',
        description: `El código del producto ha sido cambiado de "${product.codigo}" a "${newCode.trim()}".`,
        className: 'bg-green-100 text-green-800',
      });
      resetForm();

    } catch (error) {
      console.error('Error changing product code:', error);
      toast({
        variant: 'destructive',
        title: 'Error al Cambiar Código',
        description: error.message || 'Ocurrió un error inesperado. Verifique si el nuevo código ya existe.',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="h-full w-full flex items-center justify-center bg-gray-100 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md bg-white rounded-lg shadow-2xl border border-gray-200"
      >
        <div className="bg-morla-blue text-white px-6 py-4 flex items-center gap-3 rounded-t-lg">
          <RefreshCw className="w-6 h-6" />
          <h1 className="text-xl font-bold">Cambio de Código de Mercancía</h1>
        </div>

        <div className="p-8 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="codigo-anterior" className="text-lg font-semibold text-gray-700">Código Anterior</Label>
            <div className="relative flex items-center">
              <Input
                id="codigo-anterior"
                value={currentCode}
                onChange={(e) => setCurrentCode(e.target.value)}
                onKeyDown={handleCurrentCodeKeyDown}
                onBlur={handleSearchProduct}
                placeholder="Ingrese o escanee el código"
                className="text-base"
                disabled={isSearching}
              />
              <div className="absolute right-3">
                {isSearching ? (
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                ) : (
                  <Search className="w-5 h-5 text-gray-400" />
                )}
              </div>
            </div>
            {product && (
              <motion.p 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="pt-2 text-morla-blue font-medium text-center text-lg bg-gray-50 p-2 rounded-md border"
              >
                {product.descripcion}
              </motion.p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="nuevo-codigo" className="text-lg font-semibold text-gray-700">Nuevo Código</Label>
            <Input
              id="nuevo-codigo"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="Ingrese el nuevo código"
              className="text-base"
              disabled={!product || isUpdating}
            />
          </div>
        </div>

        <div className="bg-gray-50 px-8 py-4 flex justify-end gap-3 rounded-b-lg border-t">
          <Button variant="outline" onClick={() => closePanel('cambio-codigo')}>Salir</Button>
          <Button 
            onClick={handleChangeCode} 
            disabled={!product || !newCode.trim() || isUpdating}
            className="bg-morla-blue hover:bg-morla-blue/90"
          >
            {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Realizar Cambio
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export default CambioCodigoPage;