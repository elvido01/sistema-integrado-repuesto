import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Search, PlusCircle } from 'lucide-react';
import CotizacionFormModal from '@/components/cotizaciones/CotizacionFormModal';
import { formatInTimeZone } from '@/lib/dateUtils';

const CotizacionPage = () => {
  const { toast } = useToast();
  const [cotizaciones, setCotizaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filteredCotizaciones = useMemo(() => {
    if (!searchTerm) {
      return cotizaciones;
    }
    return cotizaciones.filter(c =>
      c.cliente_nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.numero?.toString().includes(searchTerm)
    );
  }, [cotizaciones, searchTerm]);

  const fetchCotizaciones = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('cotizaciones_list_view').select('*').order('created_at', { ascending: false });
    
    if (error) {
      toast({ title: 'Error', description: 'No se pudieron cargar las cotizaciones.', variant: 'destructive' });
      console.error(error);
    } else {
      setCotizaciones(data);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchCotizaciones();
  }, [fetchCotizaciones]);

  const handleModalClose = (cotizacionCreada) => {
    setIsModalOpen(false);
    if (cotizacionCreada) {
      fetchCotizaciones();
    }
  };

  return (
    <>
      <Helmet>
        <title>Cotizaciones - Repuestos Morla</title>
      </Helmet>
      <div className="h-full flex flex-col p-4 bg-gray-50 space-y-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border flex justify-between items-center">
            <h1 className="text-2xl font-bold text-morla-blue">Gestión de Cotizaciones</h1>
            <div className="flex items-center gap-2">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar por cliente o número..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 w-64"/>
                </div>
                <Button onClick={() => setIsModalOpen(true)}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Crear Cotización
                </Button>
            </div>
        </div>
        <div className="bg-white p-2 rounded-lg shadow-sm border flex-grow min-h-0">
          <div className="h-full overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-gray-100">
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan="6" className="text-center">
                      <Loader2 className="mx-auto my-4 h-6 w-6 animate-spin" />
                    </TableCell>
                  </TableRow>
                ) : filteredCotizaciones.length > 0 ? (
                  filteredCotizaciones.map(cotizacion => (
                    <TableRow key={cotizacion.id}>
                      <TableCell className="font-medium">{cotizacion.numero}</TableCell>
                      <TableCell>{formatInTimeZone(new Date(cotizacion.fecha_cotizacion), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>{cotizacion.cliente_nombre}</TableCell>
                      <TableCell>{formatInTimeZone(new Date(cotizacion.fecha_vencimiento), 'dd/MM/yyyy')}</TableCell>
                      <TableCell className="text-right">{new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(cotizacion.total_cotizacion)}</TableCell>
                      <TableCell>{cotizacion.estado}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan="6" className="text-center text-gray-500 py-8">
                      No hay cotizaciones para mostrar.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
      <CotizacionFormModal isOpen={isModalOpen} onClose={handleModalClose} />
    </>
  );
};

export default CotizacionPage;