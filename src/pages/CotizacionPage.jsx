import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, Search, PlusCircle, Send, Edit, Trash2, X, Printer } from 'lucide-react';
import CotizacionFormModal from '@/components/cotizaciones/CotizacionFormModal';
import { formatInTimeZone } from '@/lib/dateUtils';
import { printCotizacionPOS, printCotizacionQZ } from '@/lib/printPOS';
import { usePanels } from '@/contexts/PanelContext';
import { useFacturacion } from '@/contexts/FacturacionContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const CotizacionPage = () => {
  const { toast } = useToast();
  const { openPanel } = usePanels();
  const { setPedidoParaFacturar } = useFacturacion();

  const [cotizaciones, setCotizaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedCotizacion, setSelectedCotizacion] = useState(null);
  const [detalles, setDetalles] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCotizacion, setEditingCotizacion] = useState(null);
  const [paperSize, setPaperSize] = useState(() => localStorage.getItem('cot_paper_size') || '4inch');
  const [printMethod, setPrintMethod] = useState(() => localStorage.getItem('cot_print_method') || 'qz');
  const [isPrinting, setIsPrinting] = useState(false);
  const containerRef = useRef(null);

  const handlePaperSizeChange = (val) => {
    setPaperSize(val);
    localStorage.setItem('cot_paper_size', val);
  };

  const handlePrintMethodChange = (val) => {
    setPrintMethod(val);
    localStorage.setItem('cot_print_method', val);
  };

  const handlePrint = async () => {
    if (!selectedCotizacion || !detalles.length || isPrinting) return;
    setIsPrinting(true);
    try {
      if (printMethod === 'qz') {
        await printCotizacionQZ(selectedCotizacion, detalles, paperSize);
        toast({ title: 'Impresión enviada', description: 'Cotización enviada a la impresora via QZ Tray.' });
      } else {
        printCotizacionPOS(selectedCotizacion, detalles, paperSize);
      }
    } catch (err) {
      console.error('[Print] Error:', err);
      toast({
        variant: 'destructive',
        title: 'Error de impresión',
        description: err?.message || 'No se pudo imprimir. Verifique QZ Tray.'
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const fetchCotizaciones = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('cotizaciones_list_view')
      .select('*')
      .eq('estado', 'Pendiente')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('FETCH COTIZACIONES ERROR:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar las cotizaciones.', variant: 'destructive' });
    } else {
      console.log('FETCH COTIZACIONES SUCCESS:', data);
      setCotizaciones(data || []);
    }
    setLoading(false);
  }, [toast]);

  const fetchDetalles = useCallback(async (cotId) => {
    const { data, error } = await supabase
      .from('cotizaciones_detalle')
      .select('*, productos(itbis_pct)')
      .eq('cotizacion_id', cotId);

    if (error) {
      toast({ title: 'Error', description: 'No se pudieron cargar los detalles.', variant: 'destructive' });
    } else {
      setDetalles(data);
    }
  }, [toast]);

  useEffect(() => {
    console.log('ALIVE: CotizacionPage mounted');
    fetchCotizaciones();
  }, [fetchCotizaciones]);

  useEffect(() => {
    if (selectedCotizacion) {
      fetchDetalles(selectedCotizacion.id);
    } else {
      setDetalles([]);
    }
  }, [selectedCotizacion, fetchDetalles]);

  const handleSelectCotizacion = (c) => {
    setSelectedCotizacion(selectedCotizacion?.id === c.id ? null : c);
  };

  const handleEnviarAFacturacion = async () => {
    if (!selectedCotizacion || !detalles.length) return;

    try {
      // 1. Update status to 'Facturando' so it disappears from 'Pendiente' list
      // but stays available for the sales search modal
      const { error } = await supabase
        .from('cotizaciones')
        .update({ estado: 'Facturando' })
        .eq('id', selectedCotizacion.id);

      if (error) throw error;

      // 2. Fetch full client data for sync
      const { data: cliente } = await supabase.from('clientes').select('*').eq('id', selectedCotizacion.cliente_id).single();

      // 3. Prepare data (No longer needed for auto-load, but we'll show success)

      // 4. Notify user (No redirection as requested)
      toast({ title: "Preparado", description: "Cotización lista en el módulo de Ventas." });
      fetchCotizaciones();
      setSelectedCotizacion(null);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo procesar el envío.' });
    }
  };

  const handleAnular = async () => {
    if (!selectedCotizacion) return;

    try {
      const { error } = await supabase
        .from('cotizaciones')
        .update({ estado: 'Anulada' })
        .eq('id', selectedCotizacion.id);

      if (error) throw error;

      toast({ title: "Cotización Anulada", description: `La cotización #${selectedCotizacion.numero} ha sido anulada.` });
      fetchCotizaciones();
      setSelectedCotizacion(null);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo anular la cotización.' });
    }
  };

  const handleKeyDown = useCallback((e) => {
    // Only handle keyboard shortcuts when CotizacionPage is the active panel
    const activeEl = document.activeElement;
    if (containerRef.current && !containerRef.current.contains(activeEl)) return;

    if (e.key.toLowerCase() === 'insert') {
      e.preventDefault();
      setEditingCotizacion(null);
      setIsModalOpen(true);
    }
    if (e.key === 'Enter' && selectedCotizacion) {
      e.preventDefault();
      setEditingCotizacion(selectedCotizacion);
      setIsModalOpen(true);
    }
    if (e.key.toLowerCase() === 'delete' && selectedCotizacion) {
      e.preventDefault();
      document.getElementById('annul-trigger')?.click();
    }
    if (e.key === 'F5' && selectedCotizacion) {
      e.preventDefault();
      handleEnviarAFacturacion();
    }
    if (e.key === 'F6' && selectedCotizacion && detalles.length) {
      e.preventDefault();
      handlePrint();
    }
  }, [selectedCotizacion, handleEnviarAFacturacion]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const filteredCotizaciones = useMemo(() => {
    try {
      if (!Array.isArray(cotizaciones)) return [];
      const lowerSearch = searchTerm?.toLowerCase() || '';
      return cotizaciones.filter(c => {
        const nombre = (c.cliente_nombre || '').toLowerCase();
        const numero = (c.numero || '').toString();
        return nombre.includes(lowerSearch) || numero.includes(lowerSearch);
      });
    } catch (err) {
      console.error('Error in filteredCotizaciones useMemo:', err);
      return [];
    }
  }, [cotizaciones, searchTerm]);

  const handleModalClose = (success) => {
    setIsModalOpen(false);
    setEditingCotizacion(null);
    if (success) fetchCotizaciones();
  };

  console.log('CotizacionPage Rendering... Status:', { loading, cotizacionesCount: cotizaciones?.length, filteredCount: filteredCotizaciones?.length });

  return (
    <>
      <Helmet>
        <title>Cotizaciones - Repuestos Morla</title>
      </Helmet>
      <div ref={containerRef} tabIndex={-1} className="h-full grid grid-cols-12 gap-4 p-4 bg-gray-50 overflow-hidden">

        {/* Main Content */}
        <div className="col-span-10 flex flex-col space-y-4 min-h-0">

          {/* Header */}
          <div className="bg-white p-4 rounded-lg shadow-sm border flex justify-between items-center">
            <h1 className="text-2xl font-bold text-morla-blue">Gestión de Cotizaciones</h1>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por cliente o número..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 w-64 h-9" />
            </div>
          </div>

          {/* Master Table */}
          <div className="bg-white rounded-lg shadow-sm border flex-grow overflow-hidden flex flex-col">
            <div className="overflow-y-auto flex-grow">
              <Table>
                <TableHeader className="sticky top-0 bg-gray-100 z-10">
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan="6" className="text-center py-10"><Loader2 className="mx-auto h-8 w-8 animate-spin text-morla-blue" /></TableCell></TableRow>
                  ) : filteredCotizaciones.map(c => (
                    <TableRow
                      key={c.id}
                      onClick={() => handleSelectCotizacion(c)}
                      onDoubleClick={() => {
                        setEditingCotizacion(c);
                        setIsModalOpen(true);
                      }}
                      className={`cursor-pointer ${selectedCotizacion?.id === c.id ? 'bg-blue-100' : ''}`}
                    >
                      <TableCell className="font-bold">{c.numero}</TableCell>
                      <TableCell>
                        {c.fecha_cotizacion && !isNaN(new Date(c.fecha_cotizacion))
                          ? formatInTimeZone(new Date(c.fecha_cotizacion), 'dd/MM/yyyy')
                          : '---'}
                      </TableCell>
                      <TableCell>{c.cliente_nombre}</TableCell>
                      <TableCell>{c.vendedor_nombre || 'N/A'}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {/* More robust currency display */}
                        {new Intl.NumberFormat('es-DO', {
                          style: 'currency',
                          currency: 'DOP',
                          minimumFractionDigits: 2
                        }).format(parseFloat(c.total_cotizacion) || 0)}
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${c.estado === 'Pendiente' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                          {c.estado}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Details Table */}
          <div className="bg-white rounded-lg shadow-sm border h-1/3 flex flex-col overflow-hidden">
            <div className="bg-gray-100 px-4 py-2 border-b font-semibold text-sm flex justify-between">
              <span>Detalle de Cotización: {selectedCotizacion?.numero || '---'}</span>
              <span>{detalles.length} Artículos</span>
            </div>
            <div className="overflow-y-auto flex-grow">
              <Table>
                <TableHeader>
                  <TableRow className="h-8">
                    <TableHead className="text-xs">Código</TableHead>
                    <TableHead className="text-xs">Descripción</TableHead>
                    <TableHead className="text-xs text-right">Cant.</TableHead>
                    <TableHead className="text-xs text-right">Precio</TableHead>
                    <TableHead className="text-xs text-right">Importe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detalles.map(d => (
                    <TableRow key={d.id} className="h-8">
                      <TableCell className="py-1 text-xs">{d.codigo}</TableCell>
                      <TableCell className="py-1 text-xs">{d.descripcion}</TableCell>
                      <TableCell className="py-1 text-xs text-right">{d.cantidad || 0}</TableCell>
                      <TableCell className="py-1 text-xs text-right">{Number(d.precio_unitario || 0).toFixed(2)}</TableCell>
                      <TableCell className="py-1 text-xs text-right font-medium">{Number(d.importe || 0).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  {!selectedCotizacion && (
                    <TableRow><TableCell colSpan="5" className="text-center py-4 text-gray-400 text-xs">Seleccione una cotización para ver sus detalles</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {/* Actions Sidebar */}
        <div className="col-span-2 space-y-2">
          <div className="bg-morla-blue text-white p-3 rounded-t-lg font-bold flex items-center gap-2">
            <PlusCircle className="w-5 h-5" /> Acciones
          </div>
          <div className="bg-white p-4 rounded-b-lg shadow-sm border space-y-2">
            <Button onClick={() => setIsModalOpen(true)} className="w-full justify-between bg-green-600 hover:bg-green-700">
              <span>INS - Crear Cotización</span>
              <PlusCircle size={18} />
            </Button>

            <Button
              onClick={() => { setEditingCotizacion(selectedCotizacion); setIsModalOpen(true); }}
              disabled={!selectedCotizacion}
              className="w-full justify-between"
            >
              <span>ENTER - Modificar</span>
              <Edit size={18} />
            </Button>

            <Button
              onClick={handleEnviarAFacturacion}
              disabled={!selectedCotizacion}
              className="w-full justify-between bg-morla-blue"
            >
              <span>F5 - Facturar</span>
              <Send size={18} />
            </Button>

            <Button
              onClick={handlePrint}
              disabled={!selectedCotizacion || !detalles.length || isPrinting}
              className="w-full justify-between bg-purple-600 hover:bg-purple-700"
            >
              <span>{isPrinting ? 'Imprimiendo...' : 'F6 - Imprimir'}</span>
              <Printer size={18} />
            </Button>

            <div className="mt-3 pt-3 border-t space-y-2">
              <div>
                <Label className="text-[11px] font-bold text-gray-500 uppercase mb-1 block">Método Impresión</Label>
                <Select value={printMethod} onValueChange={handlePrintMethodChange}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qz">QZ Tray (Nativo)</SelectItem>
                    <SelectItem value="browser">Navegador (HTML)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px] font-bold text-gray-500 uppercase mb-1 block">Tamaño Papel</Label>
                <Select value={paperSize} onValueChange={handlePaperSizeChange}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="80mm">80mm (3 pulgadas)</SelectItem>
                    <SelectItem value="4inch">101mm (4 pulgadas)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="pt-4 border-t mt-4">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    id="annul-trigger"
                    variant="destructive"
                    disabled={!selectedCotizacion}
                    className="w-full justify-between"
                  >
                    <span>DEL - Anular</span>
                    <Trash2 size={18} />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Anular Cotización?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta acción marcará la cotización #{selectedCotizacion?.numero} como anulada y no podrá ser facturada.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleAnular} className="bg-red-600 hover:bg-red-700">
                      Confirmar Anulación
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <div className="bg-gray-100 p-4 rounded-lg border text-xs text-gray-500 space-y-1">
            <p>• Haga doble clic para editar</p>
            <p>• Los pedidos facturados se archivan</p>
          </div>
        </div>

      </div>
      <CotizacionFormModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        editingCotizacion={editingCotizacion}
      />
    </>
  );
};

export default CotizacionPage;