import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatInTimeZone, getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';
import { Calendar as CalendarIcon, Search, Printer, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePanels } from '@/contexts/PanelContext';

const ReporteTransaccionesDiariasPage = () => {
  const { toast } = useToast();
  const { closePanel } = usePanels();
  const [transactions, setTransactions] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    clienteId: 'all',
    tipoCliente: 'all',
    fechaDesde: getCurrentDateInTimeZone(),
    fechaHasta: getCurrentDateInTimeZone(),
    tipoTransaccion: 'all',
    numeroTransaccion: '',
    descripcion: '',
    concepto: 'all',
  });

  const fetchClients = useCallback(async () => {
    const { data, error } = await supabase.from('clientes').select('id, nombre').eq('activo', true);
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los clientes.' });
    } else {
      setClients(data);
    }
  }, [toast]);
  
  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    
    const { data, error } = await supabase.rpc('get_transacciones_diarias_sin_limite', {
        p_fecha_desde: formatDateForSupabase(filters.fechaDesde),
        p_fecha_hasta: formatDateForSupabase(filters.fechaHasta),
        p_cliente_id: filters.clienteId === 'all' ? null : filters.clienteId,
        p_tipo_transaccion: filters.tipoTransaccion === 'all' ? null : filters.tipoTransaccion
    })

    if (error) {
      console.error("Error fetching transactions: ", error)
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar las transacciones.' });
    } else {
      let filteredData = data;
      if (filters.numeroTransaccion) {
        filteredData = filteredData.filter(t => t.transaccion.includes(filters.numeroTransaccion));
      }
      if (filters.descripcion) {
        filteredData = filteredData.filter(t => t.descripcion?.toLowerCase().includes(filters.descripcion.toLowerCase()));
      }
      setTransactions(filteredData);
    }
    setLoading(false);
  }, [filters, toast]);

  useEffect(() => {
    fetchClients();
    fetchTransactions();
  }, [fetchClients, fetchTransactions]);

  useEffect(() => {
    const handleRealtimeUpdate = (payload) => {
      console.log('Realtime event received:', payload);
      toast({
        title: 'Lista actualizada',
        description: 'Nuevas transacciones han sido registradas.',
      });
      fetchTransactions();
    };

    const facturasChannel = supabase
      .channel('public:facturas')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'facturas' }, handleRealtimeUpdate)
      .subscribe();

    const devolucionesChannel = supabase
      .channel('public:devoluciones')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'devoluciones' }, handleRealtimeUpdate)
      .subscribe();
      
    const recibosChannel = supabase
      .channel('public:recibos_ingreso')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'recibos_ingreso' }, handleRealtimeUpdate)
      .subscribe();

    return () => {
      supabase.removeChannel(facturasChannel);
      supabase.removeChannel(devolucionesChannel);
      supabase.removeChannel(recibosChannel);
    };
  }, [fetchTransactions, toast]);

  const handleConsultar = () => {
    fetchTransactions();
  };

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'F10') {
      e.preventDefault();
      handleConsultar();
    }
    if (e.key === 'F5') {
        e.preventDefault();
        // TODO: Implement print
         toast({ title: 'Info', description: 'La función de imprimir no está implementada todavía.' });
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closePanel('reporte-transacciones-diarias');
    }
  }, [closePanel, fetchTransactions, toast]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const totals = useMemo(() => {
    return transactions.reduce((acc, t) => {
      acc.debitos += Number(t.debito) || 0;
      acc.creditos += Number(t.credito) || 0;
      return acc;
    }, { debitos: 0, creditos: 0 });
  }, [transactions]);
  
  const formatCurrency = (value) => new Intl.NumberFormat('es-DO', { style: 'decimal', minimumFractionDigits: 2 }).format(value || 0);

  return (
    <>
      <Helmet>
        <title>Lista de Transacciones Diarias - Repuestos Morla</title>
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-1 md:p-4 bg-gray-100 min-h-full flex flex-col"
      >
        <div className="bg-white p-4 rounded-lg shadow-md flex-grow flex flex-col">
          <div className="bg-morla-blue text-white text-center py-2 rounded-t-lg mb-4">
            <h1 className="text-xl font-bold">Lista de Transacciones</h1>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 border rounded-lg mb-4">
            {/* Col 1 */}
            <div className="space-y-4">
               <div className="space-y-1">
                <Label>Código de Cliente</Label>
                <Select value={filters.clienteId} onValueChange={(value) => setFilters(prev => ({...prev, clienteId: value}))}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los clientes</SelectItem>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tipo de Cliente</Label>
                <Select value={filters.tipoCliente} onValueChange={(value) => setFilters(prev => ({...prev, tipoCliente: value}))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">-*- Todos los Tipos -*-</SelectItem>
                      <SelectItem value="credito">Crédito</SelectItem>
                      <SelectItem value="contado">Contado</SelectItem>
                    </SelectContent>
                </Select>
              </div>
            </div>
            {/* Col 2 */}
            <div className="space-y-4">
                <div className="space-y-1">
                    <Label>Fecha Desde</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !filters.fechaDesde && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {filters.fechaDesde ? formatInTimeZone(filters.fechaDesde, "dd/MM/yyyy") : <span>Seleccione fecha</span>}
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={filters.fechaDesde} onSelect={date => setFilters(prev => ({ ...prev, fechaDesde: date }))} initialFocus /></PopoverContent>
                    </Popover>
                </div>
                <div className="space-y-1">
                    <Label>Fecha Hasta</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !filters.fechaHasta && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {filters.fechaHasta ? formatInTimeZone(filters.fechaHasta, "dd/MM/yyyy") : <span>Seleccione fecha</span>}
                        </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={filters.fechaHasta} onSelect={date => setFilters(prev => ({ ...prev, fechaHasta: date }))} initialFocus /></PopoverContent>
                    </Popover>
                </div>
            </div>
            {/* Col 3 */}
            <div className="space-y-4">
                 <div className="space-y-1">
                    <Label>Transacción</Label>
                    <Select value={filters.tipoTransaccion} onValueChange={(value) => setFilters(prev => ({...prev, tipoTransaccion: value}))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas las transacciones</SelectItem>
                          <SelectItem value="FT">Ventas (FT)</SelectItem>
                          <SelectItem value="DV">Devoluciones (DV)</SelectItem>
                          <SelectItem value="PG">Pagos (PG)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <Label>Número</Label>
                    <Input placeholder="Número de transacción" value={filters.numeroTransaccion} onChange={e => setFilters(prev => ({...prev, numeroTransaccion: e.target.value}))}/>
                </div>
            </div>
             {/* Col 4 */}
            <div className="space-y-4">
                <div className="space-y-1">
                    <Label>Descripción</Label>
                    <Input placeholder="Buscar por descripción" value={filters.descripcion} onChange={e => setFilters(prev => ({...prev, descripcion: e.target.value}))}/>
                </div>
                <div className="space-y-1">
                    <Label>Concepto</Label>
                    <Select value={filters.concepto} onValueChange={(value) => setFilters(prev => ({...prev, concepto: value}))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">-*- Todos -*-</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
          </div>
          
          <ScrollArea className="flex-grow border rounded-lg bg-lime-50/20">
            <Table>
              <TableHeader className="bg-gray-200 sticky top-0 z-10">
                <TableRow>
                  <TableHead>FECHA</TableHead>
                  <TableHead>TRANSACCION</TableHead>
                  <TableHead>NCF</TableHead>
                  <TableHead>CLIENTE</TableHead>
                  <TableHead>NOMBRE</TableHead>
                  <TableHead>DESCRIPCION</TableHead>
                  <TableHead className="text-right">DEBITOS</TableHead>
                  <TableHead className="text-right">CREDITOS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan="8" className="text-center h-48">Cargando datos...</TableCell></TableRow>
                ) : transactions.length === 0 ? (
                  <TableRow><TableCell colSpan="8" className="text-center h-48">No se encontraron transacciones con los filtros seleccionados.</TableCell></TableRow>
                ) : (
                  transactions.map((t, index) => (
                    <TableRow key={index} className="hover:bg-lime-100/50">
                      <TableCell>{formatInTimeZone(t.fecha, 'dd/MM/yyyy HH:mm:ss')}</TableCell>
                      <TableCell>{t.transaccion}</TableCell>
                      <TableCell>{t.ncf}</TableCell>
                      <TableCell>{t.cliente_codigo}</TableCell>
                      <TableCell>{t.cliente_nombre}</TableCell>
                      <TableCell>{t.descripcion}</TableCell>
                      <TableCell className="text-right text-blue-600 font-semibold">{formatCurrency(t.debito)}</TableCell>
                      <TableCell className="text-right text-red-600 font-semibold">{formatCurrency(t.credito)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              <TableFooter className="sticky bottom-0 bg-gray-200 z-10">
                <TableRow className="font-bold">
                    <TableCell colSpan={6} className="text-right">TOTAL -></TableCell>
                    <TableCell className="text-right text-blue-700">{formatCurrency(totals.debitos)}</TableCell>
                    <TableCell className="text-right text-red-700">{formatCurrency(totals.creditos)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </ScrollArea>

           <div className="mt-4 flex justify-end items-center space-x-4">
            <Button onClick={handleConsultar} disabled={loading} className="bg-gray-200 text-black hover:bg-gray-300">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />} F10 - Consultar
            </Button>
            <Button variant="outline" onClick={() => {toast({ title: 'Info', description: 'Imprimir no implementado' })}}>
              <Printer className="mr-2 h-4 w-4" /> F5 - Imprimir
            </Button>
            <Button variant="outline" onClick={() => closePanel('reporte-transacciones-diarias')} disabled={loading}>
                <X className="mr-2 h-4 w-4" /> ESC - Salir
            </Button>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default ReporteTransaccionesDiariasPage;