import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { subDays } from 'date-fns';
import { formatInTimeZone, getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';
import { Calendar as CalendarIcon, Search, FileText, Barcode, Pencil, ShoppingCart, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePanels } from '@/contexts/PanelContext';
import { generateCompraPDF, generatePagoSuplidorPDF } from '@/components/common/PDFGenerator';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const fmt = (n) => Number(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ReporteComprasPage = () => {
  const { toast } = useToast();
  const { openPanel } = usePanels();
  const { user, empresa } = useAuth();

  const [tab, setTab] = useState('compras'); // 'compras' | 'pagos'
  const [compras, setCompras] = useState([]);
  const [pagos, setPagos] = useState([]);
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
      setProveedores(data || []);
    }
  }, [toast]);

  const fetchCompras = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('compras')
      .select(`*, proveedores (*), compras_detalle (*)`)
      .order('fecha', { ascending: false });
    if (filters.dateRange.from) query = query.gte('fecha', formatDateForSupabase(filters.dateRange.from));
    if (filters.dateRange.to)   query = query.lte('fecha', formatDateForSupabase(filters.dateRange.to));
    if (filters.proveedorId && filters.proveedorId !== 'all') query = query.eq('suplidor_id', filters.proveedorId);

    const { data, error } = await query;
    if (error) toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar las compras.' });
    else setCompras(data || []);
    setLoading(false);
  }, [filters, toast]);

  const fetchPagos = useCallback(async () => {
    setLoading(true);
    // Trae los pagos con su suplidor y detalles para reimpresion.
    let query = supabase
      .from('pagos_suplidores')
      .select(`*, proveedores (id, nombre), pagos_suplidores_detalle (*)`)
      .order('fecha', { ascending: false });
    if (filters.dateRange.from) query = query.gte('fecha', formatDateForSupabase(filters.dateRange.from));
    if (filters.dateRange.to)   query = query.lte('fecha', formatDateForSupabase(filters.dateRange.to));
    if (filters.proveedorId && filters.proveedorId !== 'all') query = query.eq('suplidor_id', filters.proveedorId);

    const { data, error } = await query;
    if (error) {
      console.error('[ReporteCompras] pagos:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los pagos a suplidores.' });
    } else {
      setPagos(data || []);
    }
    setLoading(false);
  }, [filters, toast]);

  useEffect(() => {
    fetchProveedores();
  }, [fetchProveedores]);

  useEffect(() => {
    if (tab === 'compras') fetchCompras();
    else fetchPagos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleFilter = () => {
    if (tab === 'compras') fetchCompras();
    else fetchPagos();
  };

  // Totales para el header de cada tab
  const totalCompras = compras.reduce((sum, c) => sum + Number(c.total_compra || 0), 0);
  const totalPagos = pagos.reduce((sum, p) => sum + Number(p.total_pagado || p.monto || 0), 0);

  return (
    <>
      <Helmet>
        <title>Reporte de Compras y Pagos — {empresa?.nombre || 'Sistema'}</title>
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 bg-gray-100 min-h-full"
      >
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-morla-blue text-white text-center py-2">
            <h1 className="text-white font-black tracking-[0.25em] italic uppercase text-lg drop-shadow-sm">
              REPORTE DE COMPRAS Y PAGOS A SUPLIDORES
            </h1>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-200 bg-slate-50">
            <button
              onClick={() => setTab('compras')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold uppercase tracking-wider transition ${
                tab === 'compras'
                  ? 'bg-white text-morla-blue border-b-2 border-morla-blue -mb-px'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              <ShoppingCart className="h-4 w-4" />
              Compras
              <span className="ml-1 text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">{compras.length}</span>
            </button>
            <button
              onClick={() => setTab('pagos')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold uppercase tracking-wider transition ${
                tab === 'pagos'
                  ? 'bg-white text-emerald-700 border-b-2 border-emerald-600 -mb-px'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              <Wallet className="h-4 w-4" />
              Pagos a Suplidores
              <span className="ml-1 text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">{pagos.length}</span>
            </button>
          </div>

          {/* Filtros */}
          <div className="flex items-end gap-4 p-4 border-b border-slate-200 bg-white">
            <div className="space-y-1">
              <Label>Fecha</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="date"
                    variant="outline"
                    className={cn("w-[300px] justify-start text-left font-normal", !filters.dateRange && "text-muted-foreground")}
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

          {/* Total resumen */}
          <div className={`px-4 py-2 flex items-center justify-end gap-3 text-sm ${tab === 'compras' ? 'bg-blue-50 text-blue-900' : 'bg-emerald-50 text-emerald-900'}`}>
            <span className="font-bold uppercase tracking-wider text-xs">
              Total {tab === 'compras' ? 'comprado' : 'pagado'} en periodo:
            </span>
            <span className="font-mono font-black text-lg">
              RD$ {fmt(tab === 'compras' ? totalCompras : totalPagos)}
            </span>
          </div>

          {/* Tabla */}
          <div className="max-h-[60vh] overflow-y-auto px-4 pb-4">
            <Table>
              <TableHeader className="bg-slate-200 sticky top-0 z-10">
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Suplidor</TableHead>
                  <TableHead className="text-right">{tab === 'compras' ? 'Total Compra' : 'Total Pagado'}</TableHead>
                  {tab === 'compras' ? (
                    <TableHead>NCF</TableHead>
                  ) : (
                    <TableHead>Notas</TableHead>
                  )}
                  <TableHead className="text-center w-28">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">Cargando datos...</TableCell></TableRow>
                ) : tab === 'compras' ? (
                  compras.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400 italic">No se encontraron compras en el rango seleccionado.</TableCell></TableRow>
                  ) : (
                    compras.map(compra => (
                      <TableRow key={compra.id}>
                        <TableCell>{formatInTimeZone(new Date(compra.fecha), 'dd/MM/yyyy')}</TableCell>
                        <TableCell className="font-mono">{compra.numero}</TableCell>
                        <TableCell>{compra.proveedores?.nombre || 'N/A'}</TableCell>
                        <TableCell className="text-right font-bold">RD$ {fmt(compra.total_compra)}</TableCell>
                        <TableCell className="font-mono text-xs">{compra.ncf}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-amber-500 hover:bg-amber-50" title="Editar Compra"
                              onClick={() => openPanel('compras', { compraParaEditar: compra })}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-morla-blue hover:bg-morla-blue/10" title="Imprimir Etiquetas"
                              onClick={() => openPanel('etiquetas-masivas', { docNumber: compra.numero })}>
                              <Barcode className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-500 hover:bg-slate-100" title="Reimprimir Factura"
                              onClick={() => generateCompraPDF(compra, compra.proveedores, compra.compras_detalle, user, empresa)}>
                              <FileText className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )
                ) : (
                  pagos.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400 italic">No se encontraron pagos en el rango seleccionado.</TableCell></TableRow>
                  ) : (
                    pagos.map(pago => (
                      <TableRow key={pago.id}>
                        <TableCell>{formatInTimeZone(new Date(pago.fecha), 'dd/MM/yyyy')}</TableCell>
                        <TableCell className="font-mono">{String(pago.numero || '').padStart(7, '0')}</TableCell>
                        <TableCell>{pago.proveedores?.nombre || 'N/A'}</TableCell>
                        <TableCell className="text-right font-bold text-emerald-700">RD$ {fmt(pago.total_pagado || pago.monto)}</TableCell>
                        <TableCell className="text-xs text-slate-500 truncate max-w-[260px]" title={pago.notas}>{pago.notas || pago.referencia || '—'}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-slate-500 hover:bg-slate-100"
                              title="Reimprimir Recibo de Pago"
                              onClick={() => {
                                try {
                                  generatePagoSuplidorPDF(
                                    pago,
                                    pago.proveedores?.nombre || 'Suplidor',
                                    pago.pagos_suplidores_detalle || [],
                                    pago.formas_pago || [],
                                    empresa
                                  );
                                } catch (e) {
                                  toast({ variant: 'destructive', title: 'Error', description: e.message });
                                }
                              }}
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )
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
