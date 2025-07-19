
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Loader2 } from 'lucide-react';
import useDebounce from '@/hooks/useDebounce';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const CotizacionSearchModal = ({ isOpen, onClose, onSelectCotizacion }) => {
  const { toast } = useToast();
  const [cotizaciones, setCotizaciones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  useEffect(() => {
    if (isOpen) {
      fetchCotizaciones();
    }
  }, [isOpen, debouncedSearchTerm]);

  const fetchCotizaciones = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('cotizaciones_list_view')
        .select('*')
        .eq('estado', 'Pendiente')
        .order('created_at', { ascending: false });

      if (debouncedSearchTerm) {
        query = query.or(`numero.ilike.%${debouncedSearchTerm}%,cliente_nombre.ilike.%${debouncedSearchTerm}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setCotizaciones(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las cotizaciones.',
        variant: 'destructive',
      });
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (cotizacion) => {
    onSelectCotizacion(cotizacion);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Buscar Cotización Pendiente</DialogTitle>
        </DialogHeader>
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Buscar por número o cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <div className="flex-grow min-h-0">
          <ScrollArea className="h-full">
            <Table>
              <TableHeader className="sticky top-0 bg-secondary">
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center">
                      <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                    </TableCell>
                  </TableRow>
                ) : cotizaciones.length > 0 ? (
                  cotizaciones.map((cot) => (
                    <TableRow key={cot.id} className="cursor-pointer hover:bg-muted/50" onDoubleClick={() => handleSelect(cot)}>
                      <TableCell className="font-medium">{cot.numero}</TableCell>
                      <TableCell>{format(new Date(cot.fecha_cotizacion), 'PPP', { locale: es })}</TableCell>
                      <TableCell>{cot.cliente_nombre}</TableCell>
                      <TableCell className="text-right">{parseFloat(cot.total_cotizacion).toFixed(2)}</TableCell>
                      <TableCell>
                        <Button size="sm" onClick={() => handleSelect(cot)}>
                          Seleccionar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center h-24">
                      No se encontraron cotizaciones pendientes.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cerrar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CotizacionSearchModal;
