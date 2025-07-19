import React, { useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ScanLine, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import BarcodeScanner from '@/components/common/BarcodeScanner';

const UpdateLocationForm = () => {
  const { toast } = useToast();
  const [codigo, setCodigo] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanningField, setScanningField] = useState(null);

  const ubicacionRef = useRef(null);
  const codigoRef = useRef(null);

  const resetForm = useCallback(() => {
    setCodigo('');
    setUbicacion('');
    setProduct(null);
    setLoading(false);
    setIsSaving(false);
    codigoRef.current?.focus();
  }, []);

  const handleProductSearch = useCallback(async (searchCodigo) => {
    if (!searchCodigo) return;
    setLoading(true);
    setProduct(null);

    try {
      const { data, error } = await supabase
        .from('productos')
        .select('id, descripcion, ubicacion')
        .or(`codigo.eq.${searchCodigo},referencia.eq.${searchCodigo}`)
        .limit(1);

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        throw new Error('Producto no encontrado.');
      }
      
      const foundProduct = data[0];
      setProduct(foundProduct);
      setUbicacion(foundProduct.ubicacion || '');
      toast({
        title: 'Producto encontrado',
        description: foundProduct.descripcion,
      });
      ubicacionRef.current?.focus();
      ubicacionRef.current?.select();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.message,
      });
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!product || !product.id) {
      toast({
        variant: 'destructive',
        title: 'Producto no seleccionado',
        description: 'Primero debe buscar y encontrar un producto válido.',
      });
      return;
    }
    if (!ubicacion) {
      toast({
        variant: 'destructive',
        title: 'Ubicación requerida',
        description: 'Debe especificar una nueva ubicación.',
      });
      return;
    }
    
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('productos')
        .update({ ubicacion: ubicacion.toUpperCase() })
        .eq('id', product.id);

      if (error) throw error;

      toast({
        title: '¡Éxito!',
        description: `La ubicación de "${product.descripcion}" se ha actualizado a ${ubicacion.toUpperCase()}.`,
        className: 'bg-green-100 text-green-800'
      });
      resetForm();
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Error al guardar',
        description: 'No se pudo actualizar la ubicación del producto.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleScanClick = (field) => {
    setScanningField(field);
    setIsScannerOpen(true);
  };

  const handleScanSuccess = (decodedText) => {
    setIsScannerOpen(false);
    if (!decodedText) {
      toast({
        variant: 'destructive',
        title: 'Escaneo cancelado',
        description: 'No se detectó ningún código.',
      });
      return;
    }

    toast({
      title: '✅ Código escaneado correctamente',
    });

    if (scanningField === 'product') {
      setCodigo(decodedText);
      handleProductSearch(decodedText);
    } else if (scanningField === 'location') {
      setUbicacion(decodedText);
      ubicacionRef.current?.focus();
    }
  };
  
  const handleCodigoKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleProductSearch(codigo);
    }
  };

  return (
    <>
      <BarcodeScanner
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
        title={`Escanear Código de ${scanningField === 'product' ? 'Producto' : 'Ubicación'}`}
        description={`Apunta la cámara al código de barras del ${scanningField === 'product' ? 'producto' : 'la nueva ubicación'}.`}
      />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-white p-6 md:p-8 rounded-lg shadow-lg border-2 border-morla-gold"
      >
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-morla-blue">Actualizar Ubicación</h1>
          <p className="text-gray-500 text-sm">Escanee o ingrese el código del producto y su nueva ubicación.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="id-producto" className="text-morla-blue font-bold">IDPRODUCTO*</Label>
            <div className="relative">
              <Input
                id="id-producto"
                ref={codigoRef}
                type="text"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                onBlur={() => codigo && handleProductSearch(codigo)}
                onKeyDown={handleCodigoKeyDown}
                placeholder="Ingrese o escanee el código"
                className="pr-10"
                disabled={loading || isSaving}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0 text-gray-500 hover:text-morla-blue"
                onClick={() => handleScanClick('product')}
                disabled={loading || isSaving}
              >
                <ScanLine className="w-5 h-5" />
              </Button>
            </div>
            {loading && (
              <div className="flex items-center text-sm text-gray-500 mt-2">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Buscando producto...
              </div>
            )}
            {product && !loading && (
              <div className="bg-green-50 text-green-800 border-l-4 border-green-400 p-2 mt-2 rounded-r-md">
                <p className="font-semibold text-sm">{product.descripcion}</p>
                <p className="text-xs">Ubicación Actual: {product.ubicacion || 'N/A'}</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ubicacion" className="text-morla-blue font-bold">UBICACIÓN*</Label>
            <div className="relative">
              <Input
                id="ubicacion"
                ref={ubicacionRef}
                type="text"
                value={ubicacion}
                onChange={(e) => setUbicacion(e.target.value)}
                placeholder="Ingrese o escanee la nueva ubicación"
                className="pr-10"
                disabled={!product || loading || isSaving}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0 text-gray-500 hover:text-morla-blue"
                onClick={() => handleScanClick('location')}
                disabled={!product || loading || isSaving}
              >
                <ScanLine className="w-5 h-5" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-4 space-y-2 space-y-reverse sm:space-y-0 pt-4">
            <Button type="button" variant="outline" onClick={resetForm} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" className="bg-morla-blue hover:bg-morla-blue/90" disabled={!product || loading || isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Guardar Cambios'
              )}
            </Button>
          </div>
        </form>
      </motion.div>
    </>
  );
};

export default UpdateLocationForm;