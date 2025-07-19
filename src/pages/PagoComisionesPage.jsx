import React, { useState, useEffect } from 'react';
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
import { Calendar as CalendarIcon, Loader2, Calculator, DollarSign } from 'lucide-react';
import { startOfMonth } from 'date-fns';
import { formatInTimeZone, getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';

const PagoComisionesPage = () => {
  const { toast } = useToast();
  const [vendedores, setVendedores] = useState([]);
  const [selectedVendedor, setSelectedVendedor] = useState('');
  const [fechaDesde, setFechaDesde] = useState(startOfMonth(getCurrentDateInTimeZone()));
  const [fechaHasta, setFechaHasta] = useState(getCurrentDateInTimeZone());
  const [porcentaje, setPorcentaje] = useState(1);
  const [comisiones, setComisiones] = useState([]);
  const [totales, setTotales] = useState({ ventas: 0, comision: 0 });
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);

  const formatCurrency = (value) => new Intl.NumberFormat('es-DO', { style: 'decimal', minimumFractionDigits: 2 }).format(value || 0);

  useEffect(() => {
    const fetchVendedores = async () => {
      setLoading(true);
      const { data, error } = await supabase.from('perfiles').select('id, nombre_completo').eq('rol', 'Vendedor').eq('activo', true);
      if (error) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los vendedores.' });
      } else {
        setVendedores(data);
      }
      setLoading(false);
    };
    fetchVendedores();
  }, [toast]);

  const handleCalcularComisiones = async () => {
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

      const comisionesCalculadas = data.map(factura => {
        const ventaNeta = (factura.subtotal || 0);
        const valorComision = ventaNeta * (porcentaje / 100);
        return { ...factura, venta_neta: ventaNeta, valor_comision: valorComision };
      });

      const totalVentas = comisionesCalculadas.reduce((acc, curr) => acc + curr.venta_neta, 0);
      const totalComision = comisionesCalculadas.reduce((acc, curr) => acc + curr.valor_comision, 0);

      setComisiones(comisionesCalculadas);
      setTotales({ ventas: totalVentas, comision: totalComision });

      if (comisionesCalculadas.length === 0) {
        toast({ title: 'Sin resultados', description: 'No se encontraron ventas para este vendedor en el período seleccionado.' });
      }

    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al calcular', description: error.message });
    } finally {
      setCalculating(false);
    }
  };

  const handlePagarComisiones = () => {
    toast({
      title: '🚧 Funcionalidad no implementada',
      description: 'El pago de comisiones aún no está disponible. ¡Puedes solicitarlo en tu próximo prompt! 🚀',
    });
  };

  return (
    <>
      <Helmet>
        <title>Pago de Comisiones - Repuestos Morla</title>
      </Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 bg-gray-100 min-h-full flex flex-col"
      >
        <div className="bg-white p-4 rounded-lg shadow-md">
          <h1 className="text-2xl font-bold text-morla-blue mb-4">Pago de Comisiones a Vendedores</h1>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end mb-6 p-4 border rounded-lg bg-gray-50">
            <div>
              <Label htmlFor="vendedor">Vendedor</Label>
              <Select value={selectedVendedor} onValueChange={setSelectedVendedor} disabled={loading}>
                <SelectTrigger id="vendedor">
                  <SelectValue placeholder={loading ? "Cargando..." : "Seleccione un vendedor"} />
                </SelectTrigger>
                <SelectContent>
                  {vendedores.map(v => <SelectItem key={v.id} value={v.id}>{v.nombre_completo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="fecha-desde">Fecha Desde</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button id="fecha-desde" variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formatInTimeZone(fechaDesde, 'dd/MM/yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={fechaDesde} onSelect={setFechaDesde} /></PopoverContent>
              </Popover>
            </div>
            <div>
              <Label htmlFor="fecha-hasta">Fecha Hasta</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button id="fecha-hasta" variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formatInTimeZone(fechaHasta, 'dd/MM/yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={fechaHasta} onSelect={setFechaHasta} /></PopoverContent>
              </Popover>
            </div>
            <div>
              <Label htmlFor="porcentaje">% a Pagar</Label>
              <Input id="porcentaje" type="number" value={porcentaje} onChange={e => setPorcentaje(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="lg:col-span-4 flex justify-end gap-2">
              <Button onClick={handleCalcularComisiones} disabled={calculating}>
                {calculating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calculator className="mr-2 h-4 w-4" />}
                Calcular Comisiones
              </Button>
              <Button onClick={handlePagarComisiones} disabled={comisiones.length === 0} className="bg-green-600 hover:bg-green-700">
                <DollarSign className="mr-2 h-4 w-4" />
                Pagar Comisiones
              </Button>
            </div>
          </div>

          <div className="flex-grow overflow-y-auto border rounded-lg">
            <Table>
              <TableHeader className="bg-gray-200">
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Factura</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Monto Factura</TableHead>
                  <TableHead className="text-right">Monto Itbis</TableHead>
                  <TableHead className="text-right">Venta Neta</TableHead>
                  <TableHead className="text-right">% Comisión</TableHead>
                  <TableHead className="text-right">Valor Comisión</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calculating ? (
                  <TableRow><TableCell colSpan="8" className="text-center h-24"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></TableCell></TableRow>
                ) : comisiones.length > 0 ? (
                  comisiones.map(c => (
                    <TableRow key={c.factura_id}>
                      <TableCell>{formatInTimeZone(new Date(c.fecha), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>{c.factura_numero}</TableCell>
                      <TableCell>{c.cliente_nombre}</TableCell>
                      <TableCell className="text-right">{formatCurrency(c.monto_factura)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(c.monto_itbis)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(c.venta_neta)}</TableCell>
                      <TableCell className="text-right">{porcentaje.toFixed(2)}%</TableCell>
                      <TableCell className="text-right font-bold text-green-600">{formatCurrency(c.valor_comision)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan="8" className="text-center text-muted-foreground py-8">No hay comisiones para mostrar. Realice un cálculo.</TableCell></TableRow>
                )}
              </TableBody>
              <TableFooter className="bg-gray-100 font-bold">
                <TableRow>
                  <TableCell colSpan="5">Totales</TableCell>
                  <TableCell className="text-right">{formatCurrency(totales.ventas)}</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right text-lg text-green-700">{formatCurrency(totales.comision)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default PagoComisionesPage;