import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, Search, PlusCircle, Edit, Trash2, Printer, Receipt } from 'lucide-react';
import CotizacionMagnaFormModal from '@/components/cotizaciones_magna/CotizacionMagnaFormModal';
import { formatInTimeZone } from '@/lib/dateUtils';
import { printCotizacionMagnaPOS } from '@/lib/printPOS';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useFacturacion } from '@/contexts/FacturacionContext';
import { usePanels } from '@/contexts/PanelContext';
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

const CotizacionesMagnaPage = () => {
  const { empresa } = useAuth();
    const { toast } = useToast();
    const { setPedidoParaFacturar } = useFacturacion();
    const { openPanel } = usePanels();

    const [cotizaciones, setCotizaciones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCot, setSelectedCot] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCot, setEditingCot] = useState(null);
    const [paperSize, setPaperSize] = useState(() => localStorage.getItem('magna_paper_size') || '4inch');
    const [isPrinting, setIsPrinting] = useState(false);
    const [detailLines, setDetailLines] = useState([]);
    const containerRef = useRef(null);

    const handlePaperSizeChange = (val) => {
        setPaperSize(val);
        localStorage.setItem('magna_paper_size', val);
    };

    const formatCurrency = (val) =>
        new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP', minimumFractionDigits: 2 }).format(parseFloat(val) || 0);

    // Fetch all cotizaciones
    const fetchCotizaciones = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('cotizaciones_magna')
            .select('*, cotizaciones_magna_detalle(count)')
            .neq('estado', 'Anulada')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('FETCH COTIZACIONES MAGNA ERROR:', error);
            toast({ title: 'Error', description: 'No se pudieron cargar las cotizaciones.', variant: 'destructive' });
        } else {
            // Map count from nested relation
            const mapped = (data || []).map(c => ({
                ...c,
                lineas_count: c.cotizaciones_magna_detalle?.[0]?.count || 0,
            }));
            setCotizaciones(mapped);
        }
        setLoading(false);
    }, [toast]);

    useEffect(() => {
        fetchCotizaciones();
    }, [fetchCotizaciones]);

    const handleSelect = async (c) => {
        if (selectedCot?.id === c.id) {
            setSelectedCot(null);
            setDetailLines([]);
            return;
        }
        setSelectedCot(c);
        // Fetch detail lines
        const { data } = await supabase
            .from('cotizaciones_magna_detalle')
            .select('*')
            .eq('cotizacion_id', c.id)
            .order('created_at', { ascending: true });
        setDetailLines(data || []);
    };

    const handlePrint = async () => {
        if (!selectedCot || isPrinting) return;
        setIsPrinting(true);
        try {
            // Ensure we have detail lines
            let lines = detailLines;
            if (!lines || lines.length === 0) {
                const { data } = await supabase
                    .from('cotizaciones_magna_detalle')
                    .select('*')
                    .eq('cotizacion_id', selectedCot.id)
                    .order('created_at', { ascending: true });
                lines = data || [];
            }
            printCotizacionMagnaPOS(selectedCot, paperSize, lines);
        } catch (err) {
            console.error('[Print Magna] Error:', err);
            toast({ variant: 'destructive', title: 'Error de impresión', description: err?.message || 'No se pudo imprimir.' });
        } finally {
            setIsPrinting(false);
        }
    };

    // A FACTURACION. El modulo cotizaba y ahi se quedaba: para cobrarle a
    // Magna habia que teclear la factura a mano, orden por orden, con el
    // riesgo de equivocar un monto o saltarse una orden.
    const handleFacturar = async () => {
        if (!selectedCot) return;
        if (selectedCot.estado === 'Facturada') {
            toast({ variant: 'destructive', title: 'Ya está facturada', description: `La cotización #${selectedCot.numero} ya se facturó.` });
            return;
        }
        // El cierre (estado = Facturada) lo hace Ventas AL GUARDAR la factura,
        // no aqui: si se marcara ahora y la factura no se llega a guardar, la
        // cotizacion quedaria muerta sin haber cobrado nada.
        setPedidoParaFacturar({ ...selectedCot, type: 'cotizacion_magna' });
        openPanel('ventas');
    };

    const handleAnular = async () => {
        if (!selectedCot) return;
        try {
            const { error } = await supabase
                .from('cotizaciones_magna')
                .update({ estado: 'Anulada', updated_at: new Date().toISOString() })
                .eq('id', selectedCot.id);
            if (error) throw error;
            toast({ title: 'Anulada', description: `Cotización #${selectedCot.numero} ha sido anulada.` });
            fetchCotizaciones();
            setSelectedCot(null);
            setDetailLines([]);
        } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo anular.' });
        }
    };

    // Keyboard shortcuts
    const handleKeyDown = useCallback((e) => {
        const activeEl = document.activeElement;
        if (containerRef.current && !containerRef.current.contains(activeEl)) return;

        if (e.key.toLowerCase() === 'insert') {
            e.preventDefault();
            setEditingCot(null);
            setIsModalOpen(true);
        }
        if (e.key === 'Enter' && selectedCot) {
            e.preventDefault();
            setEditingCot(selectedCot);
            setIsModalOpen(true);
        }
        if (e.key.toLowerCase() === 'delete' && selectedCot) {
            e.preventDefault();
            document.getElementById('magna-annul-trigger')?.click();
        }
        if (e.key === 'F5' && selectedCot) {
            e.preventDefault();
            handleFacturar();
        }
        if (e.key === 'F6' && selectedCot) {
            e.preventDefault();
            handlePrint();
        }
    }, [selectedCot]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    // Search filter
    const filtered = useMemo(() => {
        if (!Array.isArray(cotizaciones)) return [];
        const lower = (searchTerm || '').toLowerCase();
        return cotizaciones.filter(c => {
            const orden = (c.numero_orden || '').toLowerCase();
            const chasis = (c.chasis || '').toLowerCase();
            const numero = (c.numero || '').toString();
            return orden.includes(lower) || chasis.includes(lower) || numero.includes(lower);
        });
    }, [cotizaciones, searchTerm]);

    const handleModalClose = (success) => {
        setIsModalOpen(false);
        setEditingCot(null);
        if (success) fetchCotizaciones();
    };

    return (
        <>
            <Helmet>
                <title>Cotización y Facturas Magna — {empresa?.nombre || 'Sistema'}</title>
            </Helmet>
            <div ref={containerRef} tabIndex={-1} className="h-full grid grid-cols-12 gap-4 p-4 bg-gray-50 overflow-hidden">

                {/* Main Content */}
                <div className="col-span-10 flex flex-col space-y-4 min-h-0">

                    {/* Header */}
                    <div className="bg-white p-4 rounded-lg shadow-sm border flex justify-between items-center">
                        <h1 className="text-2xl font-bold text-morla-blue">Cotización y Facturas Magna</h1>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por orden, chasis o número..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="pl-8 w-72 h-9"
                            />
                        </div>
                    </div>

                    {/* Table */}
                    <div className="bg-white rounded-lg shadow-sm border flex-grow overflow-hidden flex flex-col">
                        <div className="overflow-y-auto flex-grow">
                            <Table>
                                <TableHeader className="sticky top-0 bg-gray-100 z-10">
                                    <TableRow>
                                        <TableHead className="w-[80px]">No.</TableHead>
                                        <TableHead className="w-[100px]">Fecha</TableHead>
                                        <TableHead className="text-right">Subtotal</TableHead>
                                        <TableHead className="text-right">ITBIS</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                        <TableHead className="w-[70px]">Líneas</TableHead>
                                        <TableHead className="w-[90px]">Estado</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan="7" className="text-center py-10">
                                                <Loader2 className="mx-auto h-8 w-8 animate-spin text-morla-blue" />
                                            </TableCell>
                                        </TableRow>
                                    ) : filtered.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan="7" className="text-center py-10 text-gray-400">
                                                No se encontraron cotizaciones
                                            </TableCell>
                                        </TableRow>
                                    ) : filtered.map(c => (
                                        <TableRow
                                            key={c.id}
                                            onClick={() => handleSelect(c)}
                                            onDoubleClick={() => {
                                                setEditingCot(c);
                                                setIsModalOpen(true);
                                            }}
                                            className={`cursor-pointer ${selectedCot?.id === c.id ? 'bg-blue-100' : ''}`}
                                        >
                                            <TableCell className="font-bold">{c.numero}</TableCell>
                                            <TableCell>
                                                {c.fecha && !isNaN(new Date(c.fecha + "T12:00:00"))
                                                    ? formatInTimeZone(new Date(c.fecha + "T12:00:00"), 'dd/MM/yyyy')
                                                    : '---'}
                                            </TableCell>
                                            <TableCell className="text-right">{formatCurrency(c.subtotal)}</TableCell>
                                            <TableCell className="text-right">{formatCurrency(c.itbis)}</TableCell>
                                            <TableCell className="text-right font-bold">{formatCurrency(c.total)}</TableCell>
                                            <TableCell className="text-center font-semibold">{c.lineas_count || '—'}</TableCell>
                                            <TableCell>
                                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${c.estado === 'Pendiente' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                                                    }`}>
                                                    {c.estado}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </div>

                    {/* Detail panel (selected cotización summary) */}
                    {selectedCot && detailLines.length > 0 && (
                        <div className="bg-white rounded-lg shadow-sm border p-3 overflow-auto max-h-[200px]">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-gray-500 uppercase border-b">
                                        <th className="text-left pb-2 px-2">No. Orden</th>
                                        <th className="text-left pb-2 px-2">Chasis</th>
                                        <th className="text-right pb-2 px-2">Repuestos</th>
                                        <th className="text-right pb-2 px-2">Mano de Obra</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {detailLines.map((dl, i) => (
                                        <tr key={dl.id || i} className="border-b last:border-0">
                                            <td className="py-1.5 px-2 font-semibold">{dl.numero_orden || '—'}</td>
                                            <td className="py-1.5 px-2">{dl.chasis || '—'}</td>
                                            <td className="py-1.5 px-2 text-right">{formatCurrency(dl.valor_repuestos)}</td>
                                            <td className="py-1.5 px-2 text-right">{formatCurrency(dl.valor_mano_obra)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 font-bold">
                                        <td colSpan="2" className="py-2 px-2 text-right">Totales:</td>
                                        <td className="py-2 px-2 text-right">{formatCurrency(detailLines.reduce((s, d) => s + (parseFloat(d.valor_repuestos) || 0), 0))}</td>
                                        <td className="py-2 px-2 text-right">{formatCurrency(detailLines.reduce((s, d) => s + (parseFloat(d.valor_mano_obra) || 0), 0))}</td>
                                    </tr>
                                    <tr className="font-bold text-morla-blue">
                                        <td colSpan="3" className="py-1 px-2 text-right">Total con ITBIS:</td>
                                        <td className="py-1 px-2 text-right text-lg">{formatCurrency(selectedCot.total)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                            {selectedCot.notas && (
                                <div className="mt-2 text-xs text-gray-600 border-t pt-2">
                                    <span className="font-semibold">Notas:</span> {selectedCot.notas}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Actions Sidebar */}
                <div className="col-span-2 space-y-2">
                    <div className="bg-morla-blue text-white p-3 rounded-t-lg font-bold flex items-center gap-2">
                        <PlusCircle className="w-5 h-5" /> Acciones
                    </div>
                    <div className="bg-white p-4 rounded-b-lg shadow-sm border space-y-2">
                        <Button
                            onClick={() => { setEditingCot(null); setIsModalOpen(true); }}
                            className="w-full justify-between bg-green-600 hover:bg-green-700"
                        >
                            <span>INS - Crear</span>
                            <PlusCircle size={18} />
                        </Button>

                        <Button
                            onClick={() => { setEditingCot(selectedCot); setIsModalOpen(true); }}
                            disabled={!selectedCot}
                            className="w-full justify-between"
                        >
                            <span>ENTER - Modificar</span>
                            <Edit size={18} />
                        </Button>

                        <Button
                            onClick={handleFacturar}
                            disabled={!selectedCot || selectedCot.estado === 'Facturada'}
                            className="w-full justify-between bg-blue-600 hover:bg-blue-700"
                        >
                            <span>{selectedCot?.estado === 'Facturada' ? 'Ya facturada' : 'F5 - Facturar'}</span>
                            <Receipt size={18} />
                        </Button>

                        <Button
                            onClick={handlePrint}
                            disabled={!selectedCot || isPrinting}
                            className="w-full justify-between bg-purple-600 hover:bg-purple-700"
                        >
                            <span>{isPrinting ? 'Imprimiendo...' : 'F6 - Imprimir'}</span>
                            <Printer size={18} />
                        </Button>

                        <div className="mt-3 pt-3 border-t space-y-2">
                            <div>
                                <Label className="text-[11px] font-bold text-gray-500 uppercase mb-1 block">Tamaño Papel</Label>
                                <Select value={paperSize} onValueChange={handlePaperSizeChange}>
                                    <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="80mm">80mm (3 pulgadas)</SelectItem>
                                        <SelectItem value="4inch">101mm (4 pulgadas)</SelectItem>
                                        <SelectItem value="letter">8.5 x 11 (Carta)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="pt-4 border-t mt-4">
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        id="magna-annul-trigger"
                                        variant="destructive"
                                        disabled={!selectedCot}
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
                                            Esta acción marcará la cotización #{selectedCot?.numero} como anulada.
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
                        <p>• Busque por orden o chasis</p>
                        <p>• Encabezado: Motopréstamos Los Naranjos</p>
                    </div>
                </div>

            </div>

            <CotizacionMagnaFormModal
                isOpen={isModalOpen}
                onClose={handleModalClose}
                editingCotizacion={editingCot}
            />
        </>
    );
};

export default CotizacionesMagnaPage;
