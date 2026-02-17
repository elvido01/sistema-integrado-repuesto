import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { subDays } from 'date-fns';
import { formatInTimeZone, getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';
import { Calendar as CalendarIcon, Search, Printer, FileText, Barcode } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePanels } from '@/contexts/PanelContext';
import { generateCompraPDF } from '@/components/common/PDFGenerator';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const ReporteComprasPage = () => {
  const { toast } = useToast();
  const { openPanel } = usePanels();
  const { user } = useAuth();
  const [compras, setCompras] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    proveedorId: 'all',
    dateRange: {
      from: subDays(getCurrentDateInTimeZone(), 30),
      to: getCurrentDateInTimeZone(),
    },
  });

  const fetchProveedores = useCallback(async () => {
    const { data, error } = await supabase.from('proveedores').select('id, nombre');
    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los proveedores.' });
    } else {
      setProveedores(data);
    }
  }, [toast]);

  const fetchCompras = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('compras')
      .select(`
        *,
        proveedores (nombre),
        compras_detalle (
          descripcion,
          cantidad,
          costo_unitario,
          importe
        )
      `)
      .order('fecha', { ascending: false });

    if (filters.dateRange.from) {
      query = query.gte('fecha', formatDateForSupabase(filters.dateRange.from));
    }
    if (filters.dateRange.to) {
      query = query.lte('fecha', formatDateForSupabase(filters.dateRange.to));
    }
    if (filters.proveedorId && filters.proveedorId !== 'all') {
      query = query.eq('suplidor_id', filters.proveedorId);
    }

    const { data, error } = await query;

    if (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar las compras.' });
    } else {
      setCompras(data);
    }
    setLoading(false);
  }, [filters, toast]);

  useEffect(() => {
    fetchProveedores();
    fetchCompras();
  }, [fetchProveedores, fetchCompras]);

  const handleFilter = () => {
    fetchCompras();
  };

  return (
    <>
      <Helmet>
        <title>Reporte de Compras - Repuestos Morla</title>
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 bg-gray-100 min-h-full"
      >
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="bg-morla-blue text-white text-center py-2 rounded-t-lg mb-4">
            <h1 className="text-xl font-bold">REPORTE DE COMPRAS</h1>
          </div>

          <div className="flex items-end gap-4 p-4 border rounded-lg mb-4">
            <div className="space-y-1">
              <Label>Fecha</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="date"
                    variant={"outline"}
                    className={cn(
                      "w-[300px] justify-start text-left font-normal",
                      !filters.dateRange && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.dateRange?.from ? (
                      filters.dateRange.to ? (
                        <>
                          {formatInTimeZone(filters.dateRange.from, "LLL dd, y")} -{" "}
                          {formatInTimeZone(filters.dateRange.to, "LLL dd, y")}
                        </>
                      ) : (
                        formatInTimeZone(filters.dateRange.from, "LLL dd, y")
                      )
                    ) : (
                      <span>Seleccione un rango</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={filters.dateRange?.from}
                    selected={filters.dateRange}
                    onSelect={(range) => setFilters(prev => ({ ...prev, dateRange: range }))}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1 flex-1">
              <Label>Suplidor</Label>
              <Select value={filters.proveedorId} onValueChange={(value) => setFilters(prev => ({ ...prev, proveedorId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los suplidores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los suplidores</SelectItem>
                  {proveedores.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleFilter} disabled={loading}>
              <Search className="mr-2 h-4 w-4" />
              {loading ? 'Buscando...' : 'Filtrar'}
            </Button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader className="bg-gray-200">
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Suplidor</TableHead>
                  <TableHead className="text-right">Total Compra</TableHead>
                  <TableHead>NCF</TableHead>
                  <TableHead className="text-center w-24">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan="5" className="text-center">Cargando datos...</TableCell>
                  </TableRow>
                ) : compras.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan="5" className="text-center">No se encontraron compras con los filtros seleccionados.</TableCell>
                  </TableRow>
                ) : (
                  compras.map(compra => (
                    <TableRow key={compra.id}>
                      <TableCell>{formatInTimeZone(new Date(compra.fecha), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>{compra.numero}</TableCell>
                      <TableCell>{compra.proveedores?.nombre || 'N/A'}</TableCell>
                      <TableCell className="text-right font-bold">RD$ {Number(compra.total_compra).toFixed(2)}</TableCell>
                      <TableCell>{compra.ncf}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-morla-blue hover:bg-morla-blue/10"
                            title="Imprimir Etiquetas"
                            onClick={() => openPanel('etiquetas-masivas', { docNumber: compra.numero })}
                          >
                            <Barcode className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-slate-500 hover:bg-slate-100"
                            title="Reimprimir Factura"
                            onClick={() => generateCompraPDF(compra, compra.proveedores, compra.compras_detalle, user)}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default ReporteComprasPage;