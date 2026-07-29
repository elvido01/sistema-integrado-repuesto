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
import { generateTransaccionesReportePDF, generateFacturaPDF, generateFacturaCartaPDF, generateDevolucionPDF, generateReciboPDF } from '@/components/common/PDFGenerator';
import { printListaTransacciones } from '@/lib/printListaTransacciones';
import { printReciboIngresoQZ, printRecibo4Pulgadas, printDevolucionPOS, printNotaCreditoPOS, printFacturaPOS } from '@/lib/printPOS';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const ReporteTransaccionesDiariasPage = () => {
  const { toast } = useToast();
  const { empresa } = useAuth();
  const { closePanel } = usePanels();
  const [transactions, setTransactions] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    fechaDesde: getCurrentDateInTimeZone(),
    fechaHasta: getCurrentDateInTimeZone(),
    clienteId: 'all',
    tipoTransaccion: 'all',
    numeroTransaccion: '',
    descripcion: '',
    tipoCliente: 'all',
    concepto: 'all'
  });

  const updateFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value ?? null }));
  const clearFilters = () => setFilters({
    fechaDesde: getCurrentDateInTimeZone(),
    fechaHasta: getCurrentDateInTimeZone(),
    clienteId: 'all',
    tipoTransaccion: 'all',
    numeroTransaccion: '',
    descripcion: '',
    tipoCliente: 'all',
    concepto: 'all'
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
        filteredData = filteredData.filter(t => t.transaccion.toLowerCase().includes(filters.numeroTransaccion.toLowerCase()));
      }
      if (filters.descripcion) {
        filteredData = filteredData.filter(t => t.descripcion?.toLowerCase().includes(filters.descripcion.toLowerCase()));
      }
      if (filters.concepto && filters.concepto !== 'all') {
        // Concepto = tipo de documento por prefijo (RI y PG son recibos de ingreso)
        filteredData = filteredData.filter(t => {
          const prefix = String(t.transaccion || '').split('-')[0].toUpperCase();
          if (filters.concepto === 'PG') return prefix === 'PG' || prefix === 'RI';
          return prefix === filters.concepto;
        });
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

  // Doble clic = reimprimir. Ctrl + doble clic = BAJAR EL PDF en hoja carta,
  // que es lo que hace falta para mandarle la factura a un cliente por
  // correo o WhatsApp: el dialogo de impresion no deja archivo.
  const handleRowDoubleClick = async (transaction, comoPdf = false) => {
    const parts = transaction.transaccion.split('-');
    if (parts.length < 2) return;
    const prefix = parts[0];
    const numeroStr = parts.slice(1).join('-');
    const numeroInt = parseInt(numeroStr, 10);

    try {
      if (prefix === 'FT') {
        const { data: factura, error } = await supabase
          .from('facturas')
          .select('*, facturas_detalle(*, productos(*)), clientes(*), perfiles:usuario_id(email, nombre_completo)')
          .eq('numero', numeroInt)
          .single();
        if (error) throw error;
        if (!factura) return;
        // Respetar el formato de factura de la empresa. Caminero (y otros
        // dealers) imprimen en HOJA GRANDE (full_page/half_page); el resto en
        // POS. La venta en vivo ya lo respeta, aquí igualamos la reimpresión.
        const formato = empresa?.formato_factura || 'pos_4inch';
        if (formato === 'full_page' || formato === 'half_page') {
          // Si la venta salió de una solicitud financiada (dealer), re-adjuntar
          // sus datos para el formato dealer (vehículo + inicial/pagarés),
          // igual que al facturar. Se busca la solicitud por el vehículo.
          const det0 = (factura.facturas_detalle || [])[0];
          if (det0?.producto_id || det0?.codigo) {
            let solQuery = supabase
              .from('solicitudes_compras')
              .select('*')
              .eq('tenant_id', factura.tenant_id)
              .order('fecha', { ascending: false })
              .limit(1);
            solQuery = det0.producto_id
              ? solQuery.eq('producto_id', det0.producto_id)
              : solQuery.eq('chasis', det0.codigo);
            const { data: sols } = await solQuery;
            if (sols && sols[0]) {
              factura.solicitud = {
                ...sols[0],
                _placa: det0.productos?.placa || 'TRÁMITE',
                _matricula: det0.productos?.matricula || 'TRÁMITE',
              };
            }
          }
          if (comoPdf) generateFacturaCartaPDF(factura, empresa, 'descargar');
          else printFacturaPOS(factura, formato);
        } else if (comoPdf) {
          // Aunque la empresa imprima en POS, el PDF para enviar va en hoja
          // carta: un ticket de 80mm no es un documento presentable.
          generateFacturaCartaPDF(factura, empresa, 'descargar');
        } else {
          generateFacturaPDF(factura, empresa);
        }
      } else if (prefix === 'DV') {
        const { data: devolucion, error } = await supabase
          .from('devoluciones')
          .select('*, devoluciones_detalle(*, productos(*)), facturas(*), clientes(*)')
          .eq('numero', numeroInt)
          .maybeSingle();
        if (error) throw error;
        if (!devolucion) {
          toast({ title: 'No encontrado', description: `Devolución ${transaction.transaccion} no encontrada.`, variant: 'destructive' });
          return;
        }
        // Cliente puede venir en clientes(*) o en cliente_info (jsonb) para genéricos
        const cliente = devolucion.clientes || devolucion.cliente_info || { nombre: 'Cliente Genérico', direccion: 'N/A', telefono: 'N/A' };
        try {
          printDevolucionPOS(devolucion, devolucion.facturas, cliente, devolucion.devoluciones_detalle);
        } catch (printErr) {
          console.error('[DV] Fallback a PDF:', printErr);
          generateDevolucionPDF(devolucion, devolucion.facturas, cliente, devolucion.devoluciones_detalle);
        }
      } else if (prefix === 'PG' || prefix === 'RI') {
        // recibos_ingreso.numero is stored as full text (e.g. "RI-000226"),
        // so we query by the full transaccion string.
        const { data: recibo, error } = await supabase
          .from('recibos_ingreso')
          .select('*, clientes(*), recibos_ingreso_detalle(*, facturas(numero, total))')
          .eq('numero', transaction.transaccion)
          .maybeSingle();

        if (error) throw error;
        if (!recibo) {
          toast({ title: 'No encontrado', description: `Recibo ${transaction.transaccion} no encontrado.`, variant: 'destructive' });
          return;
        }

        const abonos = (recibo.recibos_ingreso_detalle || []).map(d => ({
          referencia: d.facturas?.numero ? `FT-${d.facturas.numero}` : 'N/A',
          monto_pendiente: d.monto_abonado,
          monto_abono: d.monto_abonado
        }));
        const formasPago = Array.isArray(recibo.formas_pago)
          ? recibo.formas_pago.map(p => ({
              forma: p.forma || p.metodo_pago || 'EFECTIVO',
              referencia: p.referencia || '',
              monto: p.monto || 0
            }))
          : [{ forma: 'EFECTIVO', referencia: '', monto: recibo.monto_pagado || 0 }];

        const totalPagado = formasPago.reduce((sum, p) => sum + (parseFloat(p.monto) || 0), 0);
        const balanceActual = parseFloat(recibo.clientes?.balance || 0);
        const balanceAnterior = balanceActual + totalPagado;

        const reciboData = {
          numero: recibo.numero,
          fecha: recibo.fecha,
          clienteNombre: recibo.clientes?.nombre || 'N/A',
          balanceAnterior,
          totalPagado,
          balanceActual,
          abonos,
          formasPago
        };

        try {
          await printReciboIngresoQZ(reciboData);
        } catch (printErr) {
          console.error('[RI] Fallback a HTML:', printErr);
          printRecibo4Pulgadas(reciboData);
        }
      } else if (prefix === 'NC') {
        // prestamo_notas_credito.numero guarda el texto completo (NC-0000001)
        const { data: nota, error } = await supabase
          .from('prestamo_notas_credito')
          .select('*, clientes(nombre), prestamo_nota_credito_detalle(abono_total, abono_mora, cuota_id, cargo_id)')
          .eq('numero', transaction.transaccion)
          .maybeSingle();
        if (error) throw error;
        if (!nota) {
          toast({ title: 'No encontrado', description: `Nota de crédito ${transaction.transaccion} no encontrada.`, variant: 'destructive' });
          return;
        }
        printNotaCreditoPOS({
          numero: nota.numero,
          fecha: nota.fecha,
          clienteNombre: nota.clientes?.nombre || transaction.cliente_nombre,
          balanceAnterior: nota.balance_anterior,
          totalAcreditado: nota.monto,
          balanceActual: nota.balance_actual,
          lineas: (nota.prestamo_nota_credito_detalle || []).map(d => ({
            referencia: d.cargo_id ? 'Cargo (Otras Transacciones)' : 'Cuota de préstamo',
            descripcion: Number(d.abono_mora) > 0 ? 'incluye mora' : '',
            monto: d.abono_total,
          })),
          comentarios: nota.comentarios || '',
        });
      } else if (prefix === 'AB') {
        toast({ title: 'Cargo al cliente', description: `${transaction.transaccion}: ${transaction.descripcion || 'Otras Transacciones'} — sin documento imprimible.` });
      } else {
        toast({ title: 'Aviso', description: 'Tipo de transacción no soportada para visualizar.' });
      }
    } catch (err) {
      console.error("Error loading transaction PDF:", err);
      toast({ title: 'Error', description: `No se pudo cargar el documento: ${err.message || err}`, variant: 'destructive' });
    }
  };

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'F10') {
      e.preventDefault();
      handleConsultar();
    }
    if (e.key === 'F5') {
      e.preventDefault();
      handlePrint();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closePanel('reporte-transacciones-diarias');
    }
  }, [closePanel, fetchTransactions, toast]);

  const TIPO_LABEL = {
    all: 'Todas', FT: 'VENTAS', DV: 'DEVOLUCIONES', PG: 'RECIBO DE INGRESO', NC: 'NOTAS DE CREDITO', AB: 'OTRAS TRANSACCIONES',
  };

  const handlePrint = () => {
    if (transactions.length === 0) {
      toast({ title: 'Aviso', description: 'No hay transacciones para imprimir.' });
      return;
    }
    // Hoja carta con el formato "Lista de Transacciones" del sistema viejo
    printListaTransacciones({
      empresa,
      filtros: {
        desde: filters.fechaDesde,
        hasta: filters.fechaHasta,
        clienteNombre: filters.clienteId === 'all' ? '' : (clients.find((c) => c.id === filters.clienteId)?.nombre || ''),
        transaccion: TIPO_LABEL[filters.tipoTransaccion] || 'Todas',
        numero: filters.numeroTransaccion || '',
        descripcion: filters.descripcion || '',
      },
      transacciones: transactions,
      totales: totals,
    });
  };

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
        <title>Lista de Transacciones Diarias — {empresa?.nombre || 'Sistema'}</title>
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-1 md:p-4 bg-gray-100 min-h-full flex flex-col"
      >
        <div className="bg-white p-4 rounded-lg shadow-md flex-grow flex flex-col">
          <div className="bg-morla-blue text-white text-center py-2 rounded-t-lg mb-4">
            <h1 className="text-white font-black tracking-[0.25em] italic uppercase text-lg drop-shadow-sm">LISTA DE TRANSACCIONES</h1>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 border rounded-lg mb-4">
            {/* Col 1 */}
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Código de Cliente</Label>
                <Select value={filters.clienteId} onValueChange={(value) => setFilters(prev => ({ ...prev, clienteId: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los clientes</SelectItem>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tipo de Cliente</Label>
                <Select value={filters.tipoCliente} onValueChange={(value) => setFilters(prev => ({ ...prev, tipoCliente: value }))}>
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
                <Select value={filters.tipoTransaccion} onValueChange={(value) => setFilters(prev => ({ ...prev, tipoTransaccion: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las transacciones</SelectItem>
                    <SelectItem value="FT">Ventas (FT)</SelectItem>
                    <SelectItem value="DV">Devoluciones (DV)</SelectItem>
                    <SelectItem value="PG">Recibos de Ingreso (PG/RI)</SelectItem>
                    <SelectItem value="NC">Notas de Crédito (NC)</SelectItem>
                    <SelectItem value="AB">Otras Transacciones (AB)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Número</Label>
                <Input placeholder="Número de transacción" value={filters.numeroTransaccion} onChange={e => setFilters(prev => ({ ...prev, numeroTransaccion: e.target.value }))} />
              </div>
            </div>
            {/* Col 4 */}
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Descripción</Label>
                <Input placeholder="Buscar por descripción" value={filters.descripcion} onChange={e => setFilters(prev => ({ ...prev, descripcion: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Concepto</Label>
                <Select value={filters.concepto} onValueChange={(value) => setFilters(prev => ({ ...prev, concepto: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">-*- Todos -*-</SelectItem>
                    <SelectItem value="FT">Venta de Mercancías (FT)</SelectItem>
                    <SelectItem value="DV">Devolución (DV)</SelectItem>
                    <SelectItem value="PG">Recibo de Ingreso (RI/PG)</SelectItem>
                    <SelectItem value="NC">Nota de Crédito (NC)</SelectItem>
                    <SelectItem value="AB">Otras Transacciones (AB)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <ScrollArea className="flex-grow border rounded-lg bg-white">
            <Table>
              <TableHeader className="bg-slate-200 sticky top-0 z-10">
                <TableRow className="[&>th]:h-8 [&>th]:text-slate-700 [&>th]:font-bold [&>th]:italic [&>th]:text-xs">
                  <TableHead className="w-24">Fecha</TableHead>
                  <TableHead className="w-28">Transaccion</TableHead>
                  <TableHead className="w-24">Referencia</TableHead>
                  <TableHead className="w-32">Cliente</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Descripcion</TableHead>
                  <TableHead className="text-right w-24">Debitos</TableHead>
                  <TableHead className="text-right w-28">Creditos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan="8" className="text-center h-48">Cargando datos...</TableCell></TableRow>
                ) : transactions.length === 0 ? (
                  <TableRow><TableCell colSpan="8" className="text-center h-48">No se encontraron transacciones con los filtros seleccionados.</TableCell></TableRow>
                ) : (
                  transactions.map((t, index) => (
                    <TableRow
                      key={index}
                      className="hover:bg-slate-50 cursor-pointer [&>td]:py-1 [&>td]:text-[13px]"
                      title="Doble clic: reimprimir · Ctrl + doble clic: descargar PDF (hoja carta)"
                      onDoubleClick={(e) => handleRowDoubleClick(t, e.ctrlKey || e.metaKey)}
                    >
                      <TableCell className="whitespace-nowrap">{formatInTimeZone(t.fecha, 'dd/MM/yyyy')}</TableCell>
                      <TableCell className="font-mono">{t.transaccion}</TableCell>
                      <TableCell className="font-mono text-slate-500">{t.ncf}</TableCell>
                      <TableCell className="font-mono">{t.cliente_codigo}</TableCell>
                      <TableCell className="truncate max-w-[220px]" title={t.cliente_nombre || ''}>{t.cliente_nombre}</TableCell>
                      <TableCell className="truncate max-w-[260px]" title={t.descripcion || ''}>{t.descripcion}</TableCell>
                      <TableCell className="text-right font-mono">{Number(t.debito) > 0 ? formatCurrency(t.debito) : ''}</TableCell>
                      <TableCell className="text-right font-mono">{Number(t.credito) > 0 ? formatCurrency(t.credito) : ''}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              <TableFooter className="sticky bottom-0 bg-slate-200 z-10">
                <TableRow className="font-bold text-slate-900 hover:bg-slate-200">
                  <TableCell colSpan={6} className="text-right uppercase text-xs text-slate-900">Totales →</TableCell>
                  <TableCell className="text-right font-mono text-slate-900">{formatCurrency(totals.debitos)}</TableCell>
                  <TableCell className="text-right font-mono text-slate-900">{formatCurrency(totals.creditos)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </ScrollArea>

          <div className="mt-4 flex justify-end items-center space-x-4">
            <Button onClick={handleConsultar} disabled={loading} className="bg-gray-200 text-black hover:bg-gray-300">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />} F10 - Consultar
            </Button>
            <Button variant="outline" onClick={handlePrint} disabled={loading}>
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
