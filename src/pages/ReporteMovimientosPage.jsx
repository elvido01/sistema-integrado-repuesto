import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { subDays } from 'date-fns';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar as CalendarIcon,
  FileSearch,
  Loader2,
  PackageSearch,
  RefreshCw,
  Search,
  Truck,
} from 'lucide-react';

import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useLayout } from '@/contexts/LayoutContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { formatDateForSupabase, formatInTimeZone, getCurrentDateInTimeZone } from '@/lib/dateUtils';

const fmtNumber = (value) => Number(value || 0).toLocaleString('es-DO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtQty = (value) => Number(value || 0).toLocaleString('es-DO', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

// Quita el prefijo redundante de direccion (ej: "ENTRADA-EN-000002" -> "EN-000002").
const cleanDoc = (ref) => String(ref || '').replace(/^(ENTRADA|SALIDA)-/i, '').trim() || '-';

// Estilos compactos para una tabla mas armonica.
const TH = 'h-auto px-2 py-1.5 text-[11px] leading-tight';
const TD = 'px-2 py-1.5 text-[12px] leading-tight';

const MovimientoMercanciasPage = () => {
  const { empresa } = useAuth();
  const { toast } = useToast();
  const { setSidebarOpen } = useLayout();

  const [loading, setLoading] = useState(false);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);
  const [movimientos, setMovimientos] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [productos, setProductos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [filters, setFilters] = useState({
    productoId: '',
    suplidorId: 'all',
    direccion: 'all',
    referencia: '',
    dateRange: {
      from: subDays(getCurrentDateInTimeZone(), 30),
      to: getCurrentDateInTimeZone(),
    },
  });

  const cargarCatalogos = useCallback(async () => {
    setLoadingCatalogs(true);
    try {
      const [productosRes, proveedoresRes] = await Promise.all([
        supabase
          .from('productos')
          .select('id, codigo, descripcion, suplidor_id')
          .eq('activo', true)
          .order('codigo', { ascending: true })
          .limit(5000),
        supabase
          .from('proveedores')
          .select('id, nombre')
          .eq('activo', true)
          .order('nombre', { ascending: true }),
      ]);

      if (productosRes.error) throw productosRes.error;
      if (proveedoresRes.error) throw proveedoresRes.error;

      setProductos(productosRes.data || []);
      setProveedores(proveedoresRes.data || []);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `No se pudieron cargar los catalogos: ${error.message}`,
      });
    } finally {
      setLoadingCatalogs(false);
    }
  }, [toast]);

  const cargarMovimientos = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('inventario_movimientos')
        .select(`
          id,
          producto_id,
          tipo,
          cantidad,
          costo_unitario,
          referencia_doc,
          fecha,
          productos!inner (
            id,
            codigo,
            descripcion,
            suplidor_id,
            suplidor:proveedores (
              id,
              nombre
            )
          )
        `)
        .order('fecha', { ascending: true })
        .limit(10000);

      if (filters.dateRange?.from) {
        query = query.gte('fecha', formatDateForSupabase(filters.dateRange.from));
      }
      if (filters.dateRange?.to) {
        query = query.lte('fecha', `${formatDateForSupabase(filters.dateRange.to)}T23:59:59`);
      }
      if (filters.productoId) {
        query = query.eq('producto_id', filters.productoId);
      }
      if (filters.suplidorId && filters.suplidorId !== 'all') {
        query = query.eq('productos.suplidor_id', filters.suplidorId);
      }
      if (filters.direccion === 'entrada') {
        query = query.gt('cantidad', 0);
      }
      if (filters.direccion === 'salida') {
        query = query.lt('cantidad', 0);
      }
      if (filters.referencia.trim()) {
        query = query.ilike('referencia_doc', `%${filters.referencia.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      setMovimientos(data || []);
      setHasSearched(true);
      setLastSync(new Date());
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error al cargar movimientos',
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  // Colapsa el menu lateral al entrar para dar mas ancho al reporte.
  useEffect(() => { setSidebarOpen(false); }, [setSidebarOpen]);

  useEffect(() => {
    cargarCatalogos();
  }, [cargarCatalogos]);

  // No se consulta la base hasta que el usuario presione "Filtrar".

  const resumen = useMemo(() => {
    return movimientos.reduce((acc, mov) => {
      const cantidad = Number(mov.cantidad || 0);
      const costo = Number(mov.costo_unitario || 0);
      const importe = Math.abs(cantidad) * costo;

      if (cantidad > 0) {
        acc.entradas += cantidad;
        acc.valorEntradas += importe;
      } else if (cantidad < 0) {
        acc.salidas += Math.abs(cantidad);
        acc.valorSalidas += importe;
      }

      acc.neto += cantidad;
      return acc;
    }, {
      entradas: 0,
      salidas: 0,
      neto: 0,
      valorEntradas: 0,
      valorSalidas: 0,
    });
  }, [movimientos]);

  const selectedProducto = useMemo(() => (
    productos.find((producto) => String(producto.id) === String(filters.productoId))
  ), [filters.productoId, productos]);

  const selectedSuplidor = useMemo(() => (
    proveedores.find((proveedor) => String(proveedor.id) === String(filters.suplidorId))
  ), [filters.suplidorId, proveedores]);

  const setFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const limpiarFiltros = () => {
    setFilters({
      productoId: '',
      suplidorId: 'all',
      direccion: 'all',
      referencia: '',
      dateRange: {
        from: subDays(getCurrentDateInTimeZone(), 30),
        to: getCurrentDateInTimeZone(),
      },
    });
  };

  return (
    <>
      <Helmet>
        <title>Transacciones de Inventario - {empresa?.nombre || 'Sistema'}</title>
      </Helmet>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="h-full overflow-y-auto bg-slate-100 p-4"
      >
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
          <div className="bg-morla-blue text-white px-4 py-3">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
              <div>
                <h1 className="text-white font-black uppercase tracking-[0.18em] text-lg">
                  Transacciones de Inventario
                </h1>
                <p className="text-blue-100 text-xs mt-1">
                  Entradas y salidas por mercancia, periodo y suplidor (de fecha antigua a reciente).
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-blue-100">
                {lastSync && <span>Actualizado {lastSync.toLocaleTimeString('es-DO')}</span>}
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 bg-white/95 text-morla-blue hover:bg-white"
                  onClick={cargarMovimientos}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Actualizar
                </Button>
              </div>
            </div>
          </div>

          <div className="p-4 border-b border-slate-200 bg-white">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3 items-end">
              <div className="space-y-1 xl:col-span-2">
                <Label>Mercancia</Label>
                <ProductSearchSelect
                  placeholder={loadingCatalogs ? 'Cargando mercancias...' : 'Todas las mercancias'}
                  value={filters.productoId}
                  selectedProducto={selectedProducto}
                  suplidorId={filters.suplidorId}
                  onChange={(value, producto) => {
                    setFilter('productoId', value);
                    if (producto) {
                      setProductos((prev) => (
                        prev.some((item) => String(item.id) === String(producto.id))
                          ? prev
                          : [producto, ...prev]
                      ));
                    }
                  }}
                  disabled={loadingCatalogs}
                />
              </div>

              <div className="space-y-1">
                <Label>Suplidor</Label>
                <Select value={filters.suplidorId} onValueChange={(value) => setFilter('suplidorId', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los suplidores</SelectItem>
                    {proveedores.map((proveedor) => (
                      <SelectItem key={proveedor.id} value={proveedor.id}>
                        {proveedor.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Periodo</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn('w-full justify-start text-left font-normal', !filters.dateRange && 'text-muted-foreground')}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      <span className="truncate">
                        {filters.dateRange?.from ? (
                          filters.dateRange.to ? (
                            `${formatInTimeZone(filters.dateRange.from, 'dd/MM/y')} - ${formatInTimeZone(filters.dateRange.to, 'dd/MM/y')}`
                          ) : (
                            formatInTimeZone(filters.dateRange.from, 'dd/MM/y')
                          )
                        ) : (
                          'Seleccione rango'
                        )}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={filters.dateRange?.from}
                      selected={filters.dateRange}
                      onSelect={(range) => setFilter('dateRange', range)}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1">
                <Label>Movimiento</Label>
                <Select value={filters.direccion} onValueChange={(value) => setFilter('direccion', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="entrada">Entradas</SelectItem>
                    <SelectItem value="salida">Salidas</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Documento</Label>
                <Input
                  value={filters.referencia}
                  onChange={(event) => setFilter('referencia', event.target.value)}
                  placeholder="Factura, compra..."
                />
              </div>
            </div>

            <div className="mt-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {selectedProducto && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700 border border-blue-100">
                    <PackageSearch className="h-3.5 w-3.5" />
                    {selectedProducto.codigo}
                  </span>
                )}
                {selectedSuplidor && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 border border-emerald-100">
                    <Truck className="h-3.5 w-3.5" />
                    {selectedSuplidor.nombre}
                  </span>
                )}
                {!selectedProducto && !selectedSuplidor && <span>Use mercancia o suplidor para enfocar el reporte.</span>}
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={limpiarFiltros} disabled={loading}>
                  Limpiar
                </Button>
                <Button onClick={cargarMovimientos} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                  Filtrar
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 bg-slate-50 border-b border-slate-200">
            <Metric title="Entradas" value={fmtQty(resumen.entradas)} detail={`RD$ ${fmtNumber(resumen.valorEntradas)}`} tone="emerald" icon={ArrowDownCircle} />
            <Metric title="Salidas" value={fmtQty(resumen.salidas)} detail={`RD$ ${fmtNumber(resumen.valorSalidas)}`} tone="red" icon={ArrowUpCircle} />
            <Metric title="Neto unidades" value={fmtQty(resumen.neto)} detail="Entradas menos salidas" tone="blue" icon={RefreshCw} />
            <Metric title="Movimientos" value={movimientos.length} detail="Lineas encontradas" tone="slate" icon={FileSearch} />
          </div>

          <div className="max-h-[58vh] overflow-auto px-4 pb-4">
            <Table className="text-xs">
              <TableHeader className="sticky top-0 z-10 bg-slate-200">
                <TableRow>
                  <TableHead rowSpan={2} className={cn(TH, 'align-bottom')}>Fecha</TableHead>
                  <TableHead rowSpan={2} className={cn(TH, 'align-bottom')}>Transacción</TableHead>
                  <TableHead rowSpan={2} className={cn(TH, 'align-bottom')}>Código</TableHead>
                  <TableHead rowSpan={2} className={cn(TH, 'align-bottom')}>Descripción</TableHead>
                  <TableHead colSpan={3} className={cn(TH, 'text-center border-l border-slate-300 bg-emerald-100 text-emerald-800 font-black uppercase')}>
                    Entradas
                  </TableHead>
                  <TableHead colSpan={3} className={cn(TH, 'text-center border-l border-slate-300 bg-red-100 text-red-800 font-black uppercase')}>
                    Salidas
                  </TableHead>
                </TableRow>
                <TableRow>
                  <TableHead className={cn(TH, 'text-right border-l border-slate-300 bg-emerald-50')}>Cant.</TableHead>
                  <TableHead className={cn(TH, 'text-right bg-emerald-50')}>Costo c/u</TableHead>
                  <TableHead className={cn(TH, 'text-right bg-emerald-50')}>Costo Total</TableHead>
                  <TableHead className={cn(TH, 'text-right border-l border-slate-300 bg-red-50')}>Cant.</TableHead>
                  <TableHead className={cn(TH, 'text-right bg-red-50')}>Costo c/u</TableHead>
                  <TableHead className={cn(TH, 'text-right bg-red-50')}>Costo Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-10 text-center text-slate-500">
                      <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                      Cargando movimientos...
                    </TableCell>
                  </TableRow>
                ) : !hasSearched ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-10 text-center text-slate-500">
                      Configure los filtros y presione <span className="font-semibold">Filtrar</span> para ver las transacciones.
                    </TableCell>
                  </TableRow>
                ) : movimientos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-10 text-center text-slate-500">
                      No se encontraron movimientos con los filtros seleccionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  movimientos.map((mov) => {
                    const cantidad = Number(mov.cantidad || 0);
                    const entrada = cantidad > 0 ? cantidad : 0;
                    const salida = cantidad < 0 ? Math.abs(cantidad) : 0;
                    const costoCU = Number(mov.costo_unitario || 0);
                    const costoTotal = Math.abs(cantidad) * costoCU;
                    const producto = mov.productos || {};
                    const esEntrada = cantidad > 0;

                    return (
                      <TableRow key={mov.id} className="hover:bg-slate-50">
                        <TableCell className={cn(TD, 'whitespace-nowrap')}>
                          {mov.fecha ? formatInTimeZone(new Date(mov.fecha), 'dd/MM/yyyy') : 'N/A'}
                        </TableCell>
                        <TableCell className={cn(TD, 'font-mono whitespace-nowrap')}>
                          <div className="font-bold text-slate-700">{cleanDoc(mov.referencia_doc)}</div>
                          {mov.tipo && (
                            <div className="text-[10px] uppercase text-slate-400">{mov.tipo}</div>
                          )}
                        </TableCell>
                        <TableCell className={cn(TD, 'font-bold text-slate-800 whitespace-nowrap')}>
                          {producto.codigo || 'S/C'}
                        </TableCell>
                        <TableCell className={cn(TD, 'max-w-[280px] truncate text-slate-600')} title={producto.descripcion}>
                          {producto.descripcion || 'Sin descripcion'}
                        </TableCell>
                        <TableCell className={cn(TD, 'text-right tabular-nums border-l border-slate-200 text-emerald-700 font-semibold')}>
                          {esEntrada ? fmtQty(entrada) : '-'}
                        </TableCell>
                        <TableCell className={cn(TD, 'text-right tabular-nums text-slate-600 whitespace-nowrap')}>
                          {esEntrada ? `RD$ ${fmtNumber(costoCU)}` : '-'}
                        </TableCell>
                        <TableCell className={cn(TD, 'text-right tabular-nums font-bold text-emerald-700 whitespace-nowrap')}>
                          {esEntrada ? `RD$ ${fmtNumber(costoTotal)}` : '-'}
                        </TableCell>
                        <TableCell className={cn(TD, 'text-right tabular-nums border-l border-slate-200 text-red-700 font-semibold')}>
                          {!esEntrada && salida ? fmtQty(salida) : '-'}
                        </TableCell>
                        <TableCell className={cn(TD, 'text-right tabular-nums text-slate-600 whitespace-nowrap')}>
                          {!esEntrada && salida ? `RD$ ${fmtNumber(costoCU)}` : '-'}
                        </TableCell>
                        <TableCell className={cn(TD, 'text-right tabular-nums font-bold text-red-700 whitespace-nowrap')}>
                          {!esEntrada && salida ? `RD$ ${fmtNumber(costoTotal)}` : '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              {!loading && movimientos.length > 0 && (
                <TableFooter className="sticky bottom-0 bg-slate-800">
                  <TableRow className="hover:bg-slate-800">
                    <TableCell colSpan={4} className={cn(TD, 'text-right font-black uppercase tracking-wide text-white')}>
                      Total General
                    </TableCell>
                    <TableCell className={cn(TD, 'text-right tabular-nums border-l border-slate-600 font-black text-emerald-300')}>
                      {fmtQty(resumen.entradas)}
                    </TableCell>
                    <TableCell />
                    <TableCell className={cn(TD, 'text-right tabular-nums font-black text-emerald-300 whitespace-nowrap')}>
                      RD$ {fmtNumber(resumen.valorEntradas)}
                    </TableCell>
                    <TableCell className={cn(TD, 'text-right tabular-nums border-l border-slate-600 font-black text-red-300')}>
                      {fmtQty(resumen.salidas)}
                    </TableCell>
                    <TableCell />
                    <TableCell className={cn(TD, 'text-right tabular-nums font-black text-red-300 whitespace-nowrap')}>
                      RD$ {fmtNumber(resumen.valorSalidas)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </div>
      </motion.div>
    </>
  );
};

const metricTones = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  blue: 'bg-blue-50 text-blue-700 border-blue-200',
  slate: 'bg-white text-slate-700 border-slate-200',
};

const ProductSearchSelect = ({
  value,
  selectedProducto,
  suplidorId,
  onChange,
  placeholder,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState([]);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const selectedLabel = selectedProducto
    ? `${selectedProducto.codigo || 'S/C'} - ${selectedProducto.descripcion || 'Sin descripcion'}`
    : placeholder;

  const searchProducts = useCallback(async (term) => {
    setLoading(true);
    try {
      const text = term.trim();
      const limit = text ? 30 : 20;

      const applyBaseFilters = (queryBuilder) => {
        let q = queryBuilder.eq('activo', true);
        if (suplidorId && suplidorId !== 'all') q = q.eq('suplidor_id', suplidorId);
        return q;
      };

      let byCode = applyBaseFilters(
        supabase
          .from('productos')
          .select('id, codigo, descripcion, suplidor_id')
          .order('codigo', { ascending: true })
          .limit(limit)
      );

      byCode = text ? byCode.ilike('codigo', `%${text}%`) : byCode;
      const { data: codeData, error: codeError } = await byCode;
      if (codeError) throw codeError;

      let merged = codeData || [];
      if (text && merged.length < limit) {
        const remaining = limit - merged.length;
        const { data: descData, error: descError } = await applyBaseFilters(
          supabase
            .from('productos')
            .select('id, codigo, descripcion, suplidor_id')
            .ilike('descripcion', `%${text}%`)
            .order('codigo', { ascending: true })
            .limit(remaining)
        );
        if (descError) throw descError;

        const seen = new Set(merged.map((item) => String(item.id)));
        merged = [
          ...merged,
          ...(descData || []).filter((item) => !seen.has(String(item.id))),
        ];
      }

      setOptions(merged);
    } catch (error) {
      console.error('[MovimientoMercancias] producto search:', error);
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [suplidorId]);

  const openMenu = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    searchProducts('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const closeMenu = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const timeout = setTimeout(() => searchProducts(query), 250);
    return () => clearTimeout(timeout);
  }, [open, query, searchProducts]);

  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (event) => {
      if (!rootRef.current?.contains(event.target)) closeMenu();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [closeMenu, open]);

  const handleSelect = (producto) => {
    onChange(producto.id, producto);
    closeMenu();
  };

  const clearValue = (event) => {
    event.stopPropagation();
    onChange('', null);
    setOptions([]);
    setQuery('');
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className={cn(
          'w-full inline-flex items-center justify-between h-11 rounded-md border px-3 text-left bg-white',
          disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50',
        )}
        onClick={() => (open ? closeMenu() : openMenu())}
        disabled={disabled}
      >
        <span className={cn('truncate', !value && 'text-slate-400')}>{selectedLabel}</span>
        <span className="ml-2 flex items-center gap-2 text-slate-400">
          {value ? (
            <span role="button" tabIndex={0} title="Limpiar mercancía" onClick={clearValue}>
              x
            </span>
          ) : null}
          <span className={cn('transition-transform', open && 'rotate-180')}>⌃</span>
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg">
          <div className="p-2 border-b">
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por código o descripción..."
              className="h-9"
            />
          </div>

          <div className="max-h-64 overflow-auto py-1">
            {loading ? (
              <div className="px-3 py-3 text-sm text-slate-500 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando mercancías...
              </div>
            ) : options.length === 0 ? (
              <div className="px-3 py-3 text-sm text-slate-500">Sin resultados</div>
            ) : (
              options.map((producto) => (
                <button
                  key={producto.id}
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-slate-50"
                  onClick={() => handleSelect(producto)}
                >
                  <div className="font-bold text-sm text-slate-800">{producto.codigo || 'S/C'}</div>
                  <div className="text-xs text-slate-500 truncate">{producto.descripcion || 'Sin descripcion'}</div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const Metric = ({ title, value, detail, tone, icon: Icon }) => (
  <div className={cn('rounded-lg border p-3', metricTones[tone] || metricTones.slate)}>
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-black uppercase tracking-wide">{title}</span>
      <Icon className="h-4 w-4 shrink-0" />
    </div>
    <div className="mt-1 text-2xl font-black tabular-nums">{value}</div>
    <div className="mt-0.5 text-[11px] opacity-80 truncate">{detail}</div>
  </div>
);

export default MovimientoMercanciasPage;
