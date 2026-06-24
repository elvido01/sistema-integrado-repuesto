import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, Search, PlusCircle, Send, Edit, Trash2, X, Printer, Share2, ChevronDown, ChevronUp, Image as ImageIcon } from 'lucide-react';
import CotizacionFormModal from '@/components/cotizaciones/CotizacionFormModal';
import { formatInTimeZone } from '@/lib/dateUtils';
import { printCotizacionPOS, printCotizacionQZ, printCotizacionWebUsb } from '@/lib/printPOS';
import { setPreferredBackend, getPreferredBackend } from '@/services/printerAdapter';
import { agentIsAvailable } from '@/services/motoflowPrintAgent';
import { usePanels } from '@/contexts/PanelContext';
import { useFacturacion } from '@/contexts/FacturacionContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
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

const COTIZACION_VISIBILITY_DAYS = 15;

const getCotizacionCutoffDate = () => {
  const date = new Date();
  date.setDate(date.getDate() - COTIZACION_VISIBILITY_DAYS);
  return date.toISOString().slice(0, 10);
};

const CotizacionPage = () => {
  const { empresa, profile } = useAuth();
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
  const [hasAgent, setHasAgent] = useState(false);
  useEffect(() => {
    agentIsAvailable().then(setHasAgent).catch(() => setHasAgent(false));
  }, []);
  const [isPrinting, setIsPrinting] = useState(false);
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [sharingImageId, setSharingImageId] = useState(null);
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
    const previousBackend = getPreferredBackend();
    if (printMethod === 'agent') setPreferredBackend('agent');
    else if (printMethod === 'qz') setPreferredBackend('qz');
    try {
      if (printMethod === 'qz' || printMethod === 'agent') {
        await printCotizacionQZ(selectedCotizacion, detalles, paperSize);
        toast({ title: 'Impresión enviada', description: `Cotización enviada via ${printMethod === 'agent' ? 'Motoflow Print Agent' : 'QZ Tray'}.` });
      } else if (printMethod === 'webusb') {
        await printCotizacionWebUsb(selectedCotizacion, detalles);
        toast({ title: 'Impresión enviada', description: 'Cotización enviada via WebUSB.' });
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
      setPreferredBackend(previousBackend);
      setIsPrinting(false);
    }
  };

  const fetchCotizaciones = useCallback(async () => {
    setLoading(true);
    const cutoffDate = getCotizacionCutoffDate();
    const tenantId = profile?.tenant_id;

    const { error: purgeError } = await supabase.rpc('purge_expired_cotizaciones', {
      p_days: COTIZACION_VISIBILITY_DAYS,
    });
    if (purgeError) {
      console.warn('[Cotizaciones] No se pudo purgar cotizaciones vencidas:', purgeError.message);
    }

    if (!tenantId) { setCotizaciones([]); setLoading(false); return; }

    const { data, error } = await supabase
      .from('cotizaciones_list_view')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('estado', 'Pendiente')
      .gt('fecha_cotizacion', cutoffDate)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('FETCH COTIZACIONES ERROR:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar las cotizaciones.', variant: 'destructive' });
    } else {
      setCotizaciones(data || []);
    }
    setLoading(false);
  }, [toast, profile?.tenant_id]);

  const fetchDetalles = useCallback(async (cotId) => {
    const { data, error } = await supabase
      .from('cotizaciones_detalle')
      .select('*, productos(itbis_pct, imagen_url)')
      .eq('cotizacion_id', cotId);

    if (error) {
      toast({ title: 'Error', description: 'No se pudieron cargar los detalles.', variant: 'destructive' });
    } else {
      setDetalles(data);
    }
  }, [toast]);

  // Share product image via Web Share API or open in new tab
  const handleShareImage = async (detalle) => {
    const imageUrl = detalle.productos?.imagen_url;
    if (!imageUrl) return;

    setSharingImageId(detalle.id);
    try {
      // Try Web Share API (works great on mobile)
      if (navigator.share) {
        // Fetch the image as a blob for native sharing
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File([blob], `${detalle.codigo || 'producto'}.jpg`, { type: blob.type });

        await navigator.share({
          title: detalle.descripcion || 'Imagen del producto',
          text: `${detalle.descripcion} — Código: ${detalle.codigo}`,
          files: [file],
        });
        toast({ title: 'Compartido', description: 'Imagen compartida exitosamente.' });
      } else {
        // Fallback: open image in new tab
        window.open(imageUrl, '_blank');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[Share] Error:', err);
        // Fallback to opening in new tab
        window.open(imageUrl, '_blank');
      }
    } finally {
      setSharingImageId(null);
    }
  };

  useEffect(() => {
    console.log('ALIVE: CotizacionPage mounted');
    fetchCotizaciones();
  }, [fetchCotizaciones]);

  // Una cotizacion puede crearse desde Sales Hub mientras este panel sigue
  // montado. Mantener la bandeja sincronizada evita que se quede mostrando el
  // ultimo numero que existia cuando el usuario entro a la pantalla.
  useEffect(() => {
    const tenantId = profile?.tenant_id;
    if (!tenantId) return undefined;

    const channel = supabase
      .channel(`cotizaciones-list-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cotizaciones',
          filter: `tenant_id=eq.${tenantId}`,
        },
        () => fetchCotizaciones()
      )
      .subscribe();

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') fetchCotizaciones();
    };

    window.addEventListener('focus', fetchCotizaciones);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.removeEventListener('focus', fetchCotizaciones);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      supabase.removeChannel(channel);
    };
  }, [profile?.tenant_id, fetchCotizaciones]);

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
        <title>Cotizaciones — {empresa?.nombre || 'Sistema'}</title>
      </Helmet>
      <div ref={containerRef} tabIndex={-1} className="h-full flex flex-col lg:grid lg:grid-cols-12 gap-4 p-4 bg-gray-50 overflow-y-auto lg:overflow-hidden">

        {/* Main Content */}
        <div className="lg:col-span-10 flex flex-col space-y-4 lg:min-h-0">

          {/* Header */}
          <div className="bg-white p-4 rounded-lg shadow-sm border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-morla-blue">Gestión de Cotizaciones</h1>
              <p className="text-xs text-slate-500 mt-1">Solo visibles por {COTIZACION_VISIBILITY_DAYS} días; luego se eliminan automáticamente.</p>
            </div>
            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por cliente o número..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 w-full sm:w-64 h-9" />
            </div>
          </div>

          {/* Master Table */}
          <div className="bg-white rounded-lg shadow-sm border lg:flex-grow min-h-[350px] lg:min-h-0 flex flex-col overflow-hidden">
            <div className="overflow-y-auto overflow-x-auto flex-grow">
              <Table className="min-w-[800px]">
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
                        {c.fecha_cotizacion && !isNaN(new Date(c.fecha_cotizacion + "T12:00:00"))
                          ? formatInTimeZone(new Date(c.fecha_cotizacion + "T12:00:00"), 'dd/MM/yyyy')
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
          <div className="bg-white rounded-lg shadow-sm border lg:h-1/3 min-h-[250px] lg:min-h-0 flex flex-col overflow-hidden">
            <div className="bg-gray-100 px-4 py-2 border-b font-semibold text-sm flex justify-between">
              <span>Detalle de Cotización: {selectedCotizacion?.numero || '---'}</span>
              <span>{detalles.length} Artículos</span>
            </div>
            <div className="overflow-y-auto overflow-x-auto flex-grow">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow className="h-8">
                    <TableHead className="text-xs">Código</TableHead>
                    <TableHead className="text-xs">Descripción</TableHead>
                    <TableHead className="text-xs text-right">Cant.</TableHead>
                    <TableHead className="text-xs text-right">Precio</TableHead>
                    <TableHead className="text-xs text-right">Importe</TableHead>
                    <TableHead className="text-xs text-center w-[50px]">Img</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detalles.map(d => (
                    <TableRow key={d.id} className="h-8">
                      <TableCell className="py-1 text-xs">{d.codigo}</TableCell>
                      <TableCell className="py-1 text-xs">{d.descripcion}</TableCell>
                      <TableCell className="py-1 text-xs text-right">{d.cantidad || 0}</TableCell>
                      <TableCell className="py-1 text-xs text-right">{Number(d.precio_unitario || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                      <TableCell className="py-1 text-xs text-right font-medium">{Number(d.importe || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                      <TableCell className="py-1 text-center">
                        {d.productos?.imagen_url ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                            onClick={() => handleShareImage(d)}
                            disabled={sharingImageId === d.id}
                            title="Compartir imagen del producto"
                          >
                            {sharingImageId === d.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Share2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        ) : (
                          <span className="text-gray-300" title="Sin imagen">
                            <ImageIcon className="h-3.5 w-3.5 mx-auto" />
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!selectedCotizacion && (
                    <TableRow><TableCell colSpan="6" className="text-center py-4 text-gray-400 text-xs">Seleccione una cotización para ver sus detalles</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {/* Actions Sidebar — hidden on mobile by default, toggleable */}
        <div className="lg:col-span-2 space-y-2 order-first lg:order-last mb-4 lg:mb-0">
          {/* Mobile toggle header */}
          <button
            onClick={() => setShowMobileActions(prev => !prev)}
            className="lg:hidden w-full bg-morla-blue text-white p-3 rounded-lg font-bold flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <PlusCircle className="w-5 h-5" /> Acciones
            </div>
            {showMobileActions ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>

          {/* Desktop header (always visible on lg) */}
          <div className="hidden lg:flex bg-morla-blue text-white p-3 rounded-t-lg font-bold items-center gap-2">
            <PlusCircle className="w-5 h-5" /> Acciones
          </div>

          {/* Actions content — always visible on desktop, toggleable on mobile */}
          <div className={`bg-white p-4 rounded-b-lg shadow-sm border space-y-2 ${showMobileActions ? 'block' : 'hidden lg:block'}`}>
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
                    <SelectItem value="agent" disabled={!hasAgent}>
                      ⚡ Motoflow Print Agent {hasAgent ? '' : '(No detectado)'}
                    </SelectItem>
                    <SelectItem value="qz">🖨️ QZ Tray (Nativo)</SelectItem>
                    <SelectItem value="browser">Navegador (HTML)</SelectItem>
                    <SelectItem value="webusb" disabled={!navigator.usb}>WebUSB (Sin Instalar)</SelectItem>
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

          <div className={`bg-gray-100 p-4 rounded-lg border text-xs text-gray-500 space-y-1 ${showMobileActions ? 'block' : 'hidden lg:block'}`}>
            <p>• Haga doble clic para editar</p>
            <p>• Los pedidos facturados se archivan</p>
            <p>• Toque el ícono <Share2 className="inline h-3 w-3" /> para compartir imagen</p>
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
