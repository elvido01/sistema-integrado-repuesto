import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Calendar as CalendarIcon, Loader2, Search, Printer, CheckSquare, DollarSign } from 'lucide-react';
import { startOfMonth } from 'date-fns';
import { formatInTimeZone, getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';
import { generateComisionPDF } from '@/components/common/pdf/comisionPDF';
import { printPagoCompromisoPOS } from '@/lib/printPOS';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { fmtMontoInput, parseMontoInput } from '@/lib/numberFormat';

const ROLES_ADMIN = ['admin', 'owner', 'manager', 'gerente'];

const PagoComisionesPage = () => {
  const { empresa, profile } = useAuth();
  const { toast } = useToast();
  // ... (state follows)
  const [vendedores, setVendedores] = useState([]);
  const [selectedVendedor, setSelectedVendedor] = useState('');
  const [fechaDesde, setFechaDesde] = useState(startOfMonth(getCurrentDateInTimeZone()));
  const [fechaHasta, setFechaHasta] = useState(getCurrentDateInTimeZone());
  const [porcentaje, setPorcentaje] = useState(1);
  const [tipoReporte, setTipoReporte] = useState('ventas'); // ventas | cobros
  const [filtroPago, setFiltroPago] = useState('todas'); // todas | credito | contado
  const [comisiones, setComisiones] = useState([]);
  const [totales, setTotales] = useState({ monto: 0, impuestos: 0, aPagar: 0 });
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);

  // Pago de comisión (botón PAGAR)
  const [pagarOpen, setPagarOpen] = useState(false);
  const [montoPagar, setMontoPagar] = useState('');
  const [formaPago, setFormaPago] = useState('EFECTIVO');
  const [bancoPago, setBancoPago] = useState('');
  const [referenciaPago, setReferenciaPago] = useState('');
  const [notasPago, setNotasPago] = useState('');
  const [pagando, setPagando] = useState(false);
  const [ultimosPagos, setUltimosPagos] = useState([]);
  const esAdmin = ROLES_ADMIN.includes(profile?.role);

  const formatCurrency = (value) => new Intl.NumberFormat('es-DO', { style: 'decimal', minimumFractionDigits: 2 }).format(value || 0);

  const cargarUltimosPagos = useCallback(async () => {
    const { data } = await supabase
      .from('pagos_comisiones')
      .select('id, numero, fecha_pago, periodo_desde, periodo_hasta, total_comision, forma_pago, referencia, notas, vendedores(nombre)')
      .eq('anulado', false)
      .order('created_at', { ascending: false })
      .limit(8);
    setUltimosPagos(data || []);
  }, []);

  useEffect(() => { cargarUltimosPagos(); }, [cargarUltimosPagos]);

  useEffect(() => {
    const fetchVendedores = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('vendedores')
        .select('id, nombre, comision_pct')
        .eq('activo', true)
        .order('nombre', { ascending: true });
      if (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los vendedores.' });
      } else {
        setVendedores(data);
        if (data.length > 0) {
          setSelectedVendedor(data[0].id);
          // Auto-llenar el % con el valor predeterminado del primer vendedor
          if (data[0].comision_pct != null && Number(data[0].comision_pct) > 0) {
            setPorcentaje(Number(data[0].comision_pct));
          }
        }
      }
      setLoading(false);
    };
    fetchVendedores();
  }, [toast]);

  // Auto-llenar % cuando cambia el vendedor seleccionado (lookup local en el array)
  useEffect(() => {
    if (!selectedVendedor || vendedores.length === 0) return;
    const v = vendedores.find(x => x.id === selectedVendedor);
    if (v?.comision_pct != null && Number(v.comision_pct) > 0) {
      setPorcentaje(Number(v.comision_pct));
    }
  }, [selectedVendedor, vendedores]);

  const handleConsultar = useCallback(async () => {
    if (!selectedVendedor) {
      toast({ variant: 'destructive', title: 'Error', description: 'Por favor, seleccione un vendedor.' });
      return;
    }
    setCalculating(true);
    try {
      const { data, error } = await supabase.rpc('calcular_comisiones_vendedor', {
        p_vendedor_id: selectedVendedor,
        p_fecha_desde: formatDateForSupabase(fechaDesde),
        p_fecha_hasta: formatDateForSupabase(fechaHasta),
      });

      if (error) throw error;

      // Filter by payment type if needed
      let filteredData = data;
      if (filtroPago === 'credito') {
        filteredData = data.filter(f => f.forma_pago === 'CREDITO');
      } else if (filtroPago === 'contado') {
        filteredData = data.filter(f => f.forma_pago === 'CONTADO');
      }

      const comisionesCalculadas = filteredData.map(factura => {
        const ventaNeta = (factura.subtotal || 0); // Total - ITBIS
        const valorComision = ventaNeta * (porcentaje / 100);
        return {
          ...factura,
          venta_neta: ventaNeta,
          monto_itbis: factura.monto_itbis || 0,
          valor_comision: valorComision
        };
      });

      const totalMonto = comisionesCalculadas.reduce((acc, curr) => acc + curr.monto_factura, 0);
      const totalImpuestos = comisionesCalculadas.reduce((acc, curr) => acc + curr.monto_itbis, 0);
      const totalAPagar = comisionesCalculadas.reduce((acc, curr) => acc + curr.valor_comision, 0);

      setComisiones(comisionesCalculadas);
      setTotales({ monto: totalMonto, impuestos: totalImpuestos, aPagar: totalAPagar });

      if (comisionesCalculadas.length === 0) {
        toast({ title: 'Sin resultados', description: 'No se encontraron ventas para este vendedor en el período seleccionado.' });
      }

    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al calcular', description: error.message });
    } finally {
      setCalculating(false);
    }
  }, [selectedVendedor, fechaDesde, fechaHasta, porcentaje, filtroPago, toast]);

  const imprimirComprobantePago = (pago) => {
    printPagoCompromisoPOS({
      numero: pago.numero,
      fecha_pago: pago.fecha_pago,
      nombre: `COMISIÓN ${(pago.vendedorNombre || '').toUpperCase()} · ${formatInTimeZone(pago.periodo_desde, 'dd/MM/yyyy')} a ${formatInTimeZone(pago.periodo_hasta, 'dd/MM/yyyy')}`,
      tipo: 'COMISIONES',
      forma_pago: pago.forma_pago,
      referencia_pago: pago.referencia || pago.banco || '',
      monto: pago.total_comision,
      recurrente: false,
    });
  };

  const abrirPagar = () => {
    if (comisiones.length === 0 || !(totales.aPagar > 0)) {
      toast({ variant: 'destructive', title: 'Nada que pagar', description: 'Consulta primero las comisiones pendientes del vendedor.' });
      return;
    }
    setMontoPagar(String(Math.round(totales.aPagar * 100) / 100));
    setFormaPago('EFECTIVO'); setBancoPago(''); setReferenciaPago(''); setNotasPago('');
    setPagarOpen(true);
  };

  const handlePagar = async () => {
    const monto = parseFloat(montoPagar) || 0;
    if (monto <= 0) { toast({ variant: 'destructive', title: 'Monto inválido' }); return; }
    setPagando(true);
    try {
      const { data, error } = await supabase.rpc('pagar_comision', {
        p_vendedor_id: selectedVendedor,
        p_periodo_desde: formatDateForSupabase(fechaDesde),
        p_periodo_hasta: formatDateForSupabase(fechaHasta),
        p_total_ventas: totales.monto,
        p_porcentaje: porcentaje,
        p_total_comision: monto,
        p_forma_pago: formaPago,
        p_banco: bancoPago || null,
        p_referencia: referenciaPago || null,
        p_notas: notasPago || null,
        p_factura_ids: comisiones.map(c => c.factura_id).filter(Boolean),
      });
      if (error) throw error;
      toast({
        title: `💰 Comisión pagada — ${data?.numero}`,
        description: `${currentVendedorName}: RD$ ${formatCurrency(data?.monto)} (${formaPago === 'EFECTIVO' ? 'efectivo, descontado de la caja del día' : 'transferencia, descontado de la caja actual'})`,
      });
      imprimirComprobantePago({
        numero: data?.numero,
        fecha_pago: new Date(),
        vendedorNombre: currentVendedorName,
        periodo_desde: fechaDesde,
        periodo_hasta: fechaHasta,
        forma_pago: formaPago,
        referencia: referenciaPago,
        banco: bancoPago,
        total_comision: data?.monto,
      });
      setPagarOpen(false);
      await cargarUltimosPagos();
      await handleConsultar(); // el reporte excluye las facturas ya pagadas -> queda en 0
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo pagar la comisión', description: e.message });
    }
    setPagando(false);
  };

  const handleImprimir = () => {
    if (comisiones.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'No hay datos para imprimir. Realice una consulta primero.' });
      return;
    }

    const filters = {
      vendedorName: currentVendedorName,
      fechaDesde,
      fechaHasta,
      tipoReporte,
      filtroPago,
      porcentaje
    };

    generateComisionPDF(comisiones, filters);
    toast({ title: 'Éxito', description: 'Generando reporte para impresión...' });
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F10') {
        e.preventDefault();
        handleConsultar();
      }
      if (e.key === 'F5') {
        e.preventDefault();
        handleImprimir();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleConsultar]);

  const currentVendedorName = vendedores.find(v => v.id === selectedVendedor)?.nombre || '';

  return (
    <>
      <Helmet>
        <title>Reporte de Comisiones — {empresa?.nombre || 'Sistema'}</title>
      </Helmet>
      <div className="flex flex-col h-full bg-[#f0f0f0] overflow-hidden">
        {/* Header Style match from image */}
        <div className="bg-[#a8c6f7] py-1 px-4 border-b border-gray-400 shadow-sm text-center">
          <h1 className="text-[20px] font-black tracking-widest text-[#0a1e3a] uppercase italic">Reporte de Comisiones</h1>
        </div>

        <div className="p-4 space-y-4 flex-grow overflow-hidden flex flex-col">
          {/* Filter Panel */}
          <div className="bg-white p-4 rounded-sm border border-gray-300 shadow-sm grid grid-cols-12 gap-4 items-start">

            {/* Left Section: Radio Groups */}
            <div className="col-span-3 space-y-4">
              <RadioGroup value={tipoReporte} onValueChange={setTipoReporte} className="space-y-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="ventas" id="r-ventas" className="w-4 h-4 text-blue-600 focus:ring-blue-500" />
                  <Label htmlFor="r-ventas" className="text-[13px] font-bold text-gray-700">Comisiones por Ventas</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="cobros" id="r-cobros" className="w-4 h-4 text-blue-600 focus:ring-blue-500" />
                  <Label htmlFor="r-cobros" className="text-[13px] font-bold text-gray-700">Comisiones por Cobros</Label>
                </div>
              </RadioGroup>

              <div className="p-2 border border-blue-100 bg-blue-50/30 rounded-sm">
                <RadioGroup value={filtroPago} onValueChange={setFiltroPago} className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="todas" id="f-todas" className="w-3.5 h-3.5" />
                    <Label htmlFor="f-todas" className="text-[12px] font-bold text-gray-600">Todas</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="credito" id="f-credito" className="w-3.5 h-3.5" />
                    <Label htmlFor="f-credito" className="text-[12px] font-bold text-gray-600">Crédito</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="contado" id="f-contado" className="w-3.5 h-3.5" />
                    <Label htmlFor="f-contado" className="text-[12px] font-bold text-gray-600">Contado</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            {/* Middle Section: Dates and Vendor */}
            <div className="col-span-7 space-y-4 border-x border-gray-100 px-4">
              <div className="flex items-center gap-4">
                <div className="flex-grow">
                  <Label className="text-[11px] font-black text-gray-400 uppercase mb-1 block">Vendedor</Label>
                  <Select value={selectedVendedor} onValueChange={setSelectedVendedor} disabled={loading}>
                    <SelectTrigger className="h-8 text-[12px] font-bold border-gray-300 rounded-none bg-gray-50">
                      <SelectValue placeholder="Seleccione..." />
                    </SelectTrigger>
                    <SelectContent className="bg-white">
                      {vendedores.map(v => <SelectItem key={v.id} value={v.id} className="text-xs">{v.nombre?.toUpperCase()}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] font-black text-gray-400 uppercase mb-1 block">% a Pagar</Label>
                  <Input
                    type="number"
                    className="h-8 w-24 text-right font-bold text-blue-600 rounded-none border-gray-300 bg-gray-50"
                    value={porcentaje}
                    onChange={e => setPorcentaje(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Label className="text-[12px] font-bold text-gray-500">Fecha Desde</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-7 w-[120px] text-[11px] font-bold border-gray-300 rounded-none px-2 justify-between">
                        {formatInTimeZone(fechaDesde, 'dd/MM/yyyy')}
                        <CalendarIcon className="w-3.5 h-3.5 text-blue-400" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={fechaDesde} onSelect={setFechaDesde} /></PopoverContent>
                  </Popover>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-[12px] font-bold text-gray-500">Hasta</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-7 w-[120px] text-[11px] font-bold border-gray-300 rounded-none px-2 justify-between">
                        {formatInTimeZone(fechaHasta, 'dd/MM/yyyy')}
                        <CalendarIcon className="w-3.5 h-3.5 text-blue-400" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={fechaHasta} onSelect={setFechaHasta} /></PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            {/* Right Section: Action Buttons */}
            <div className="col-span-2 flex flex-col gap-2">
              <Button
                onClick={handleConsultar}
                className="h-9 bg-[#0a1e3a] hover:bg-[#0a1e3a]/90 text-white font-bold rounded-none border border-[#0a1e3a] uppercase text-[11px] w-full justify-between px-3"
                disabled={calculating}
              >
                {calculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>F10 - Consultar</span>}
                <Search className="w-4 h-4" />
              </Button>
              <Button
                onClick={handleImprimir}
                className="h-9 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-none border border-gray-300 uppercase text-[11px] w-full justify-between px-3"
              >
                <span>F5 - Imprimir</span>
                <Printer className="w-4 h-4 text-gray-500" />
              </Button>
              {esAdmin && (
                <Button
                  onClick={abrirPagar}
                  disabled={pagando || comisiones.length === 0 || !(totales.aPagar > 0)}
                  className="h-9 bg-green-700 hover:bg-green-800 text-white font-bold rounded-none border border-green-800 uppercase text-[11px] w-full justify-between px-3"
                >
                  <span>Pagar Comisión</span>
                  <DollarSign className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Table Legend */}
          <div className="flex items-center gap-2 border-b border-gray-200 pb-1">
            <h3 className="text-[13px] font-black text-[#0a1e3a] uppercase">Resumen por Vendedor</h3>
          </div>

          {/* Results Table */}
          <div className="flex-grow bg-white border border-gray-300 shadow-inner overflow-hidden flex flex-col">
            <div className="overflow-y-auto flex-grow">
              <Table>
                <TableHeader className="bg-[#dce6f2] sticky top-0 z-10 shadow-sm">
                  <TableRow className="h-8 border-gray-300">
                    <TableHead className="text-[11px] font-black text-gray-500 uppercase h-8 px-2">Fecha</TableHead>
                    <TableHead className="text-[11px] font-black text-gray-500 uppercase h-8 px-2">Transaccion</TableHead>
                    <TableHead className="text-[11px] font-black text-gray-500 uppercase h-8 px-2">Cliente</TableHead>
                    <TableHead className="text-[11px] font-black text-gray-500 uppercase h-8 px-2">Nombre</TableHead>
                    <TableHead className="text-[11px] font-black text-gray-500 uppercase h-8 px-2 text-right">Monto</TableHead>
                    <TableHead className="text-[11px] font-black text-gray-500 uppercase h-8 px-2 text-right">Impuestos</TableHead>
                    <TableHead className="text-[11px] font-black text-gray-500 uppercase h-8 px-1 text-center">%</TableHead>
                    <TableHead className="text-[11px] font-black text-[#0a1e3a] uppercase h-8 px-2 text-right bg-blue-50/50">A Pagar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calculating ? (
                    <TableRow><TableCell colSpan={8} className="text-center h-40"><Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" /></TableCell></TableRow>
                  ) : comisiones.length > 0 ? (
                    <TableRow className="h-7 border-b border-gray-100 hover:bg-green-50/50 transition-colors">
                      <TableCell className="text-[11px] font-medium py-1 px-2"></TableCell>
                      <TableCell className="text-[11px] font-bold text-blue-600 py-1 px-2"></TableCell>
                      <TableCell className="text-[11px] font-medium py-1 px-2"></TableCell>
                      <TableCell className="text-[11px] font-black text-gray-700 py-1 px-2 bg-green-50/30 uppercase">{currentVendedorName}</TableCell>
                      <TableCell className="text-[11px] font-bold text-right py-1 px-2">{formatCurrency(totales.monto)}</TableCell>
                      <TableCell className="text-[11px] font-medium text-gray-500 text-right py-1 px-2 italic">{formatCurrency(totales.impuestos)}</TableCell>
                      <TableCell className="text-[10px] font-bold text-center py-1 px-1 text-gray-400"></TableCell>
                      <TableCell className="text-[11px] font-black text-right py-1 px-2 text-green-700 bg-blue-50/20">{formatCurrency(totales.aPagar)}</TableCell>
                    </TableRow>
                  ) : (
                    <TableRow><TableCell colSpan={8} className="text-center text-gray-400 py-12 text-[12px] italic">No hay comisiones para mostrar. Realice un cálculo.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Table Footer / Totals block match image */}
            <div className="border-t-2 border-gray-400 bg-white">
              <div className="flex justify-end p-2 gap-8 items-center">
                <div className="text-[13px] font-black text-gray-700 tracking-tighter uppercase">TOTAL --&gt;</div>
                <div className="min-w-[110px] text-right">
                  <div className="text-[11px] font-black text-gray-600 uppercase mb-0.5">Monto Total</div>
                  <div className="text-[14px] font-black border-t border-gray-900 pt-0.5">{formatCurrency(totales.monto)}</div>
                </div>
                <div className="min-w-[110px] text-right">
                  <div className="text-[11px] font-black text-gray-600 uppercase mb-0.5">Impuestos</div>
                  <div className="text-[14px] font-black border-t border-gray-900 pt-0.5 text-gray-500">{formatCurrency(totales.impuestos)}</div>
                </div>
                <div className="min-w-[120px] text-right">
                  <div className="text-[11px] font-black text-[#0a1e3a] uppercase mb-0.5">A Pagar</div>
                  <div className="text-[16px] font-black border-t-2 border-gray-900 pt-0.5 text-green-700">{formatCurrency(totales.aPagar)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Historial de pagos de comisiones */}
          {ultimosPagos.length > 0 && (
            <div className="bg-white border border-gray-300 shadow-sm">
              <div className="bg-[#dce6f2] px-2 py-1 text-[11px] font-black text-gray-600 uppercase">Últimos pagos de comisiones</div>
              <Table>
                <TableBody>
                  {ultimosPagos.map(p => (
                    <TableRow key={p.id} className="h-7 border-b border-gray-100">
                      <TableCell className="text-[11px] font-bold text-blue-700 py-1 px-2">{p.numero}</TableCell>
                      <TableCell className="text-[11px] py-1 px-2">{formatInTimeZone(p.fecha_pago, 'dd/MM/yyyy')}</TableCell>
                      <TableCell className="text-[11px] font-bold py-1 px-2 uppercase">{p.vendedores?.nombre || '—'}</TableCell>
                      <TableCell className="text-[11px] py-1 px-2">{formatInTimeZone(p.periodo_desde, 'dd/MM/yyyy')} → {formatInTimeZone(p.periodo_hasta, 'dd/MM/yyyy')}</TableCell>
                      <TableCell className="text-[11px] py-1 px-2">{p.forma_pago}</TableCell>
                      <TableCell className="text-[11px] font-black text-right py-1 px-2 text-green-700">{formatCurrency(p.total_comision)}</TableCell>
                      <TableCell className="py-1 px-2 text-right">
                        <Button
                          variant="outline" size="sm" className="h-6 text-[10px] px-2"
                          onClick={() => imprimirComprobantePago({ ...p, vendedorNombre: p.vendedores?.nombre })}
                        >
                          <Printer className="w-3 h-3 mr-1" />Reimprimir
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Modal de confirmación de pago */}
      <Dialog open={pagarOpen} onOpenChange={setPagarOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-[#0a1e3a]">Pagar comisión — {currentVendedorName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs space-y-1">
              <div className="flex justify-between"><span>Período</span><b>{formatInTimeZone(fechaDesde, 'dd/MM/yyyy')} → {formatInTimeZone(fechaHasta, 'dd/MM/yyyy')}</b></div>
              <div className="flex justify-between"><span>Facturas incluidas</span><b>{comisiones.length}</b></div>
              <div className="flex justify-between"><span>Ventas del período</span><b>{formatCurrency(totales.monto)}</b></div>
              <div className="flex justify-between"><span>% aplicado</span><b>{porcentaje}%</b></div>
            </div>
            <div>
              <Label className="text-xs font-bold">Monto a pagar (RD$)</Label>
              <Input
                type="text" inputMode="decimal" value={fmtMontoInput(montoPagar)}
                onChange={e => setMontoPagar(parseMontoInput(e.target.value))}
                className="mt-1 text-right font-black text-lg text-green-700"
              />
            </div>
            <div>
              <Label className="text-xs font-bold">Forma de pago</Label>
              <Select value={formaPago} onValueChange={setFormaPago}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="EFECTIVO">Efectivo (descuenta de la caja del día)</SelectItem>
                  <SelectItem value="TRANSFERENCIA">Transferencia (descuenta de la caja actual)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formaPago === 'TRANSFERENCIA' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs font-bold">Banco</Label>
                  <Input value={bancoPago} onChange={e => setBancoPago(e.target.value)} className="mt-1 h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-xs font-bold">Referencia</Label>
                  <Input value={referenciaPago} onChange={e => setReferenciaPago(e.target.value)} className="mt-1 h-8 text-xs" />
                </div>
              </div>
            )}
            <div>
              <Label className="text-xs font-bold">Notas</Label>
              <Textarea value={notasPago} onChange={e => setNotasPago(e.target.value)} className="mt-1 h-14 text-sm resize-none" />
            </div>
            <p className="text-[11px] text-slate-500 leading-tight">
              Las facturas de esta consulta quedarán marcadas como comisionadas: si vuelves a consultar el mismo período no se pagarán dos veces.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPagarOpen(false)} disabled={pagando}>Cancelar</Button>
            <Button onClick={handlePagar} disabled={pagando} className="bg-green-700 hover:bg-green-800 text-white font-bold">
              {pagando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <DollarSign className="w-4 h-4 mr-1" />}
              Confirmar pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PagoComisionesPage;
