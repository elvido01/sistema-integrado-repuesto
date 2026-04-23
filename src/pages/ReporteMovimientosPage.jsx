import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
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
import { Calendar as CalendarIcon, Search, FileText, Printer, X, ArrowDownCircle, ArrowUpCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { generateEntradaPDF, generateSalidaPDF } from '@/components/common/PDFGenerator';
import { printEntradaPOS, printSalidaPOS } from '@/lib/printPOS';

const formatCurrency = (val) => (parseFloat(val) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ReporteMovimientosPage = () => {
  const { toast } = useToast();
  const { empresa } = useAuth();
  const [movimientos, setMovimientos] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detalleModal, setDetalleModal] = useState(null); // { tipo, data, detalles }
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  const [filters, setFilters] = useState({
    tipo: 'all', // 'all', 'entradas', 'salidas'
    almacenId: 'all',
    dateRange: {
      from: subDays(getCurrentDateInTimeZone(), 30),
      to: getCurrentDateInTimeZone(),
    },
  });

  const fetchAlmacenes = useCallback(async () => {
    const { data } = await supabase.from('almacenes').select('id, nombre, codigo').eq('activo', true).order('nombre');
    if (data) setAlmacenes(data);
  }, []);

  const fetchMovimientos = useCallback(async () => {
    setLoading(true);
    const results = [];

    const buildQuery = (table) => {
      let query = supabase.from(table).select('*').order('fecha', { ascending: false });
      if (filters.dateRange?.from) query = query.gte('fecha', formatDateForSupabase(filters.dateRange.from));
      if (filters.dateRange?.to) query = query.lte('fecha', formatDateForSupabase(filters.dateRange.to));
      if (filters.almacenId && filters.almacenId !== 'all') query = query.eq('almacen_id', filters.almacenId);
      return query;
    };

    try {
      if (filters.tipo === 'all' || filters.tipo === 'entradas') {
        const { data, error } = await buildQuery('entradas_inventario');
        if (error) throw error;
        if (data) results.push(...data.map(d => ({ ...d, _tipo: 'ENTRADA' })));
      }

      if (filters.tipo === 'all' || filters.tipo === 'salidas') {
        const { data, error } = await buildQuery('salidas_inventario');
        if (error) throw error;
        if (data) results.push(...data.map(d => ({ ...d, _tipo: 'SALIDA' })));
      }

      // Ordenar por fecha descendente
      results.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      setMovimientos(results);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
    setLoading(false);
  }, [filters, toast]);

  useEffect(() => {
    fetchAlmacenes();
    fetchMovimientos();
  }, [fetchAlmacenes, fetchMovimientos]);

  // Abrir modal de detalle
  const handleVerDetalle = useCallback(async (mov) => {
    setLoadingDetalle(true);
    setDetalleModal({ tipo: mov._tipo, data: mov, detalles: [] });

    try {
      const detalleTable = mov._tipo === 'ENTRADA' ? 'entradas_inventario_detalle' : 'salidas_inventario_detalle';
      const fkColumn = mov._tipo === 'ENTRADA' ? 'entrada_id' : 'salida_id';

      const { data, error } = await supabase
        .from(detalleTable)
        .select('*')
        .eq(fkColumn, mov.id);

      if (error) throw error;

      // Buscar nombre del almacén
      const almacen = almacenes.find(a => a.id === mov.almacen_id);

      setDetalleModal({ tipo: mov._tipo, data: mov, detalles: data || [], almacen });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
    setLoadingDetalle(false);
  }, [almacenes, toast]);

  // Reimprimir
  const handleReimprimir = useCallback((formato) => {
    if (!detalleModal) return;
    const { tipo, data, detalles, almacen } = detalleModal;

    if (formato === 'pdf') {
      if (tipo === 'ENTRADA') {
        generateEntradaPDF(data, almacen, detalles, empresa);
      } else {
        generateSalidaPDF(data, almacen, detalles, empresa);
      }
    } else {
      // POS 72mm
      if (tipo === 'ENTRADA') {
        printEntradaPOS(data, almacen, detalles, empresa);
      } else {
        printSalidaPOS(data, almacen, detalles, empresa);
      }
    }
  }, [detalleModal, empresa]);

  const getAlmacenNombre = useCallback((almacenId) => {
    const alm = almacenes.find(a => a.id === almacenId);
    return alm ? `${alm.codigo || ''} - ${alm.nombre}`.trim() : 'N/A';
  }, [almacenes]);

  const totales = useMemo(() => {
    const totalEntradas = movimientos.filter(m => m._tipo === 'ENTRADA').reduce((s, m) => s + (parseFloat(m.total_costo) || 0), 0);
    const totalSalidas = movimientos.filter(m => m._tipo === 'SALIDA').reduce((s, m) => s + (parseFloat(m.total_costo) || 0), 0);
    return { totalEntradas, totalSalidas, count: movimientos.length };
  }, [movimientos]);

  return (
    <>
      <Helmet>
        <title>Reporte de Entradas y Salidas — {empresa?.nombre || 'Sistema'}</title>
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 bg-gray-100 min-h-full"
      >
        <div className="bg-white p-4 rounded-lg shadow-md">
          <div className="bg-morla-blue text-white text-center py-2 rounded-t-lg mb-4">
            <h1 className="text-white font-black tracking-[0.25em] italic uppercase text-lg drop-shadow-sm">REPORTE DE ENTRADAS Y SALIDAS</h1>
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap items-end gap-4 p-4 border rounded-lg mb-4">
            <div className="space-y-1">
              <Label>Fecha</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-[280px] justify-start text-left font-normal", !filters.dateRange && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.dateRange?.from ? (
                      filters.dateRange.to ? (
                        <>
                          {formatInTimeZone(filters.dateRange.from, "LLL dd, y")} -{" "}
                          {formatInTimeZone(filters.dateRange.to, "LLL dd, y")}
                        </>
                      ) : formatInTimeZone(filters.dateRange.from, "LLL dd, y")
                    ) : <span>Seleccione un rango</span>}
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

            <div className="space-y-1 w-[180px]">
              <Label>Tipo</Label>
              <Select value={filters.tipo} onValueChange={(v) => setFilters(prev => ({ ...prev, tipo: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="entradas">Solo Entradas</SelectItem>
                  <SelectItem value="salidas">Solo Salidas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 flex-1 min-w-[180px]">
              <Label>Almacén</Label>
              <Select value={filters.almacenId} onValueChange={(v) => setFilters(prev => ({ ...prev, almacenId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los almacenes</SelectItem>
                  {almacenes.map(a => <SelectItem key={a.id} value={a.id}>{a.codigo} - {a.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={fetchMovimientos} disabled={loading}>
              <Search className="mr-2 h-4 w-4" />
              {loading ? 'Buscando...' : 'Filtrar'}
            </Button>
          </div>

          {/* Resumen */}
          <div className="flex gap-4 mb-4">
            <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-3 text-center">
              <p className="text-xs text-green-600 font-bold uppercase">Total Entradas</p>
              <p className="text-lg font-black text-green-700">RD$ {formatCurrency(totales.totalEntradas)}</p>
            </div>
            <div className="flex-1 bg-red-50 border border-red-200 rounded-lg p-3 text-center">
              <p className="text-xs text-red-600 font-bold uppercase">Total Salidas</p>
              <p className="text-lg font-black text-red-700">RD$ {formatCurrency(totales.totalSalidas)}</p>
            </div>
            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-600 font-bold uppercase">Documentos</p>
              <p className="text-lg font-black text-slate-700">{totales.count}</p>
            </div>
          </div>

          {/* Tabla */}
          <div className="max-h-[55vh] overflow-y-auto">
            <Table>
              <TableHeader className="bg-gray-200 sticky top-0">
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Almacén</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead className="text-right">Total Costo</TableHead>
                  <TableHead className="text-center w-20">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : movimientos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                      No se encontraron movimientos con los filtros seleccionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  movimientos.map(mov => (
                    <TableRow
                      key={`${mov._tipo}-${mov.id}`}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => handleVerDetalle(mov)}
                    >
                      <TableCell>
                        {mov._tipo === 'ENTRADA' ? (
                          <ArrowDownCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <ArrowUpCircle className="h-4 w-4 text-red-500" />
                        )}
                      </TableCell>
                      <TableCell>{formatInTimeZone(new Date(mov.fecha), 'dd/MM/yyyy')}</TableCell>
                      <TableCell className="font-bold">{mov.numero}</TableCell>
                      <TableCell>{mov.concepto}</TableCell>
                      <TableCell>{getAlmacenNombre(mov.almacen_id)}</TableCell>
                      <TableCell>{mov.referencia || '—'}</TableCell>
                      <TableCell className="text-right font-bold">RD$ {formatCurrency(mov.total_costo)}</TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-slate-500 hover:bg-slate-100"
                          title="Ver Detalle"
                          onClick={(e) => { e.stopPropagation(); handleVerDetalle(mov); }}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </motion.div>

      {/* Modal de Detalle */}
      <AnimatePresence>
        {detalleModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setDetalleModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[85vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className={cn(
                "px-6 py-3 flex items-center justify-between",
                detalleModal.tipo === 'ENTRADA' ? 'bg-green-600' : 'bg-red-600'
              )}>
                <div className="flex items-center gap-3">
                  {detalleModal.tipo === 'ENTRADA' ? (
                    <ArrowDownCircle className="h-5 w-5 text-white" />
                  ) : (
                    <ArrowUpCircle className="h-5 w-5 text-white" />
                  )}
                  <h2 className="text-white font-bold text-lg">
                    {detalleModal.tipo === 'ENTRADA' ? 'ENTRADA' : 'SALIDA'} — {detalleModal.data.numero}
                  </h2>
                </div>
                <Button variant="ghost" size="sm" className="text-white hover:bg-white/20" onClick={() => setDetalleModal(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Info */}
              <div className="px-6 py-4 border-b">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-500 font-bold">FECHA</p>
                    <p className="font-bold">{formatInTimeZone(new Date(detalleModal.data.fecha), 'dd/MM/yyyy')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-bold">CONCEPTO</p>
                    <p className="font-bold">{detalleModal.data.concepto}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-bold">ALMACEN</p>
                    <p className="font-bold">{detalleModal.almacen ? `${detalleModal.almacen.codigo} - ${detalleModal.almacen.nombre}` : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-bold">REFERENCIA</p>
                    <p className="font-bold">{detalleModal.data.referencia || '—'}</p>
                  </div>
                </div>
                {detalleModal.data.notas && (
                  <div className="mt-2">
                    <p className="text-xs text-slate-500 font-bold">NOTAS</p>
                    <p className="text-sm">{detalleModal.data.notas}</p>
                  </div>
                )}
              </div>

              {/* Detalle Items */}
              <div className="px-6 py-3 max-h-[40vh] overflow-y-auto">
                {loadingDetalle ? (
                  <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Codigo</TableHead>
                        <TableHead>Descripcion</TableHead>
                        <TableHead className="text-center">Cant.</TableHead>
                        <TableHead>Und.</TableHead>
                        <TableHead className="text-right">Costo Unit.</TableHead>
                        <TableHead className="text-right">Importe</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalleModal.detalles.map((d, i) => (
                        <TableRow key={d.id || i}>
                          <TableCell className="font-mono text-xs">{d.codigo}</TableCell>
                          <TableCell>{d.descripcion}</TableCell>
                          <TableCell className="text-center">{d.cantidad}</TableCell>
                          <TableCell>{d.unidad || 'UND'}</TableCell>
                          <TableCell className="text-right">{formatCurrency(d.costo_unitario)}</TableCell>
                          <TableCell className="text-right font-bold">{formatCurrency(d.importe)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* Footer con Total y Botones de Reimprimir */}
              <div className="px-6 py-4 border-t bg-slate-50 flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-bold">TOTAL COSTO</p>
                  <p className="text-xl font-black">RD$ {formatCurrency(detalleModal.data.total_costo)}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleReimprimir('pos')}>
                    <Printer className="mr-2 h-4 w-4" />
                    POS (72mm)
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleReimprimir('pdf')}>
                    <FileText className="mr-2 h-4 w-4" />
                    PDF (Carta)
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ReporteMovimientosPage;
