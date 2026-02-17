import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Loader2, Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const DocumentSearchModal = ({
    isOpen,
    onClose,
    onSelect,
    type = 'cotizacion', // 'cotizacion' or 'pedido'
    vendedores = []
}) => {
    const { toast } = useToast();
    const [documents, setDocuments] = useState([]);
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [details, setDetails] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingDetails, setLoadingDetails] = useState(false);

    // Filters
    const [clienteId, setClienteId] = useState('');
    const [vendedorId, setVendedorId] = useState('all');
    const [dateDesde, setDateDesde] = useState(format(new Date(), 'yyyy-MM-01'));
    const [dateHasta, setDateHasta] = useState(format(new Date(), 'yyyy-MM-dd'));

    const title = type === 'cotizacion' ? 'Lista de Cotizaciones' : 'Lista de Pedidos';
    const tableHeader = type === 'cotizacion' ? 'Cotizaciones Pendientes' : 'Pedidos Pendientes';

    const fetchDocuments = async () => {
        setLoading(true);
        setSelectedDoc(null);
        setDetails([]);
        try {
            const table = type === 'cotizacion' ? 'cotizaciones' : 'pedidos';
            const dateField = type === 'cotizacion' ? 'fecha_cotizacion' : 'fecha';

            let query = supabase
                .from(table)
                .select(`*, clientes(nombre)`)
                .eq('estado', 'Facturando')
                .gte(dateField, dateDesde)
                .lte(dateField, dateHasta)
                .order(dateField, { ascending: false });

            if (vendedorId !== 'all') {
                query = query.eq('vendedor_id', vendedorId);
            }

            // If we had a view or joined properly we'd filter by clienteId more easily
            // Pre-filtering if clienteId is provided
            if (clienteId) {
                // This assumes clienteId is a UUID or a code. Let's try to match by id for now.
            }

            const { data, error } = await query;
            if (error) throw error;
            setDocuments(data || []);
        } catch (error) {
            console.error(error);
            toast({ title: 'Error', description: 'No se pudieron cargar los documentos.', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    const fetchDetails = async (doc) => {
        setLoadingDetails(true);
        try {
            const tableDetails = type === 'cotizacion' ? 'cotizaciones_detalle' : 'pedidos_detalle';
            const fkField = type === 'cotizacion' ? 'cotizacion_id' : 'pedido_id';

            const { data, error } = await supabase
                .from(tableDetails)
                .select(`*`)
                .eq(fkField, doc.id);

            if (error) throw error;
            setDetails(data || []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoadingDetails(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchDocuments();
        }
    }, [isOpen]);

    const handleRowClick = (doc) => {
        setSelectedDoc(doc);
        fetchDetails(doc);
    };

    const handleConfirm = async () => {
        if (selectedDoc) {
            try {
                // Update state to 'Facturada' so it disappears from the search modal queue
                const table = type === 'cotizacion' ? 'cotizaciones' : 'pedidos';
                const { error } = await supabase
                    .from(table)
                    .update({ estado: 'Facturada' })
                    .eq('id', selectedDoc.id);

                if (error) throw error;

                onSelect(selectedDoc, details);
                onClose();
            } catch (error) {
                console.error('Error updating status on select:', error);
                toast({ title: 'Error', description: 'No se pudo actualizar el estado del documento.', variant: 'destructive' });
            }
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 gap-0 border-gray-400 shadow-2xl overflow-hidden rounded-none">
                {/* Title Bar - Classic Style */}
                <div className="bg-[#f0f0f0] border-b border-gray-400 px-3 py-1 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-[12px] font-bold text-gray-700">{title}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-5 w-5 p-0 hover:bg-red-500 hover:text-white rounded-none" onClick={onClose}>
                        <X className="w-3 h-3" />
                    </Button>
                </div>

                {/* Filters Section */}
                <div className="bg-[#f5f5f5] p-3 border-b border-gray-300 space-y-3">
                    <div className="grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-6 flex items-center gap-2">
                            <Label className="text-[11px] font-bold text-gray-600 min-w-[100px]">Codigo de Cliente</Label>
                            <div className="flex-grow flex gap-1">
                                <Input
                                    className="h-6 text-[11px] border-gray-400 bg-white rounded-none"
                                    value={clienteId}
                                    onChange={(e) => setClienteId(e.target.value)}
                                />
                                <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] font-bold border-gray-400 rounded-none bg-gray-100">F3</Button>
                            </div>
                        </div>
                        <div className="col-span-6 flex items-center gap-2">
                            <Label className="text-[11px] font-bold text-gray-600 min-w-[100px]">Sub-Cliente</Label>
                            <Select defaultValue="all">
                                <SelectTrigger className="h-6 text-[11px] border-gray-400 bg-white rounded-none">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">--- TODOS ---</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-3 flex items-center gap-2">
                            <Label className="text-[11px] font-bold text-gray-600 min-w-[70px]">Fecha Desde</Label>
                            <Input
                                type="date"
                                className="h-6 text-[11px] border-gray-400 bg-white rounded-none p-1"
                                value={dateDesde}
                                onChange={(e) => setDateDesde(e.target.value)}
                            />
                        </div>
                        <div className="col-span-3 flex items-center gap-2">
                            <Label className="text-[11px] font-bold text-gray-600 min-w-[70px]">Fecha Hasta</Label>
                            <Input
                                type="date"
                                className="h-6 text-[11px] border-gray-400 bg-white rounded-none p-1"
                                value={dateHasta}
                                onChange={(e) => setDateHasta(e.target.value)}
                            />
                        </div>
                        <div className="col-span-3 flex items-center gap-2">
                            <Label className="text-[11px] font-bold text-gray-600 min-w-[60px]">Vendedor</Label>
                            <Select value={vendedorId} onValueChange={setVendedorId}>
                                <SelectTrigger className="h-6 text-[11px] border-gray-400 bg-white rounded-none">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-white">
                                    <SelectItem value="all">Pendiente</SelectItem>
                                    {vendedores.map(v => (
                                        <SelectItem key={v.id} value={v.id}>{v.nombre}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="col-span-3 flex justify-end">
                            <Button
                                variant="default"
                                className="h-8 bg-[#0a1e3a] hover:bg-[#0a1e3a]/90 text-white font-bold text-[11px] px-6 rounded-none shadow-sm"
                                onClick={fetchDocuments}
                            >
                                F10 - Consultar
                            </Button>
                        </div>
                    </div>
                </div>

                {/* List Section */}
                <div className="flex-grow flex flex-col bg-[#e8f4ea] overflow-hidden">
                    <div className="overflow-y-auto border-b border-gray-400" style={{ height: '50%' }}>
                        <Table className="border-collapse">
                            <TableHeader className="sticky top-0 bg-[#eee] z-10 border-b border-gray-400 shadow-sm">
                                <TableRow className="h-6 hover:bg-transparent">
                                    <TableHead className="h-6 p-1 text-[11px] font-bold border-r border-gray-300">Fecha</TableHead>
                                    <TableHead className="h-6 p-1 text-[11px] font-bold border-r border-gray-300">Numero</TableHead>
                                    <TableHead className="h-6 p-1 text-[11px] font-bold border-r border-gray-300">Cliente</TableHead>
                                    <TableHead className="h-6 p-1 text-[11px] font-bold border-r border-gray-300">Nombre</TableHead>
                                    <TableHead className="h-6 p-1 text-[11px] font-bold border-r border-gray-300">Descripcion</TableHead>
                                    <TableHead className="h-6 p-1 text-[11px] font-bold border-r border-gray-300 text-right">Monto</TableHead>
                                    <TableHead className="h-6 p-1 text-[11px] font-bold text-center">Estatus</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow><TableCell colSpan={7} className="text-center py-10"><Loader2 className="animate-spin inline-block mr-2" /> Cargando...</TableCell></TableRow>
                                ) : documents.map(doc => (
                                    <TableRow
                                        key={doc.id}
                                        className={`h-6 cursor-pointer border-b border-gray-200 transition-colors ${selectedDoc?.id === doc.id ? 'bg-blue-100' : 'hover:bg-blue-50/50'}`}
                                        onClick={() => handleRowClick(doc)}
                                        onDoubleClick={handleConfirm}
                                    >
                                        <TableCell className="p-1 text-[11px] font-medium border-r border-gray-200">{format(new Date(type === 'cotizacion' ? doc.fecha_cotizacion : doc.fecha), 'dd/MM/yyyy')}</TableCell>
                                        <TableCell className="p-1 text-[11px] font-bold border-r border-gray-200 text-blue-700">{doc.numero}</TableCell>
                                        <TableCell className="p-1 text-[11px] border-r border-gray-200">{doc.cliente_id?.split('-')[0] || 'GENERICO'}</TableCell>
                                        <TableCell className="p-1 text-[11px] border-r border-gray-200 truncate">
                                            {(() => {
                                                const genericIds = ['2749fa36-3d7c-4bdf-ad61-df88eda8365a', '00000000-0000-0000-0000-000000000000'];
                                                const isGeneric = !doc.cliente_id || genericIds.includes(doc.cliente_id) || doc.clientes?.nombre?.toUpperCase().includes('GENERICO');
                                                return (isGeneric && doc.manual_cliente_nombre) ? doc.manual_cliente_nombre.toUpperCase() : (doc.clientes?.nombre || 'CLIENTE GENERICO').toUpperCase();
                                            })()}
                                        </TableCell>
                                        <TableCell className="p-1 text-[11px] border-r border-gray-200 italic text-gray-500 truncate max-w-[200px]">{doc.notas || 'N/A'}</TableCell>
                                        <TableCell className="p-1 text-[11px] font-bold text-right border-r border-gray-200">{parseFloat(type === 'cotizacion' ? doc.total_cotizacion : doc.monto_total).toLocaleString('en-US', { minimumFractionDigits: 2 })}</TableCell>
                                        <TableCell className="p-1 text-[10px] font-black text-center">
                                            <span className={`px-1.5 py-0.5 rounded ${doc.estado === 'Pendiente' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
                                                {doc.estado?.toUpperCase()}
                                            </span>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Details Section */}
                    <div className="flex-grow overflow-y-auto bg-white">
                        <Table className="border-collapse">
                            <TableHeader className="sticky top-0 bg-gray-100 z-10 border-b border-gray-300">
                                <TableRow className="h-6 hover:bg-transparent">
                                    <TableHead className="h-6 p-1 text-[11px] font-bold border-r border-gray-200">CODIGO</TableHead>
                                    <TableHead className="h-6 p-1 text-[11px] font-bold border-r border-gray-200">DESCRIPCION</TableHead>
                                    <TableHead className="h-6 p-1 text-[11px] font-bold border-r border-gray-200 text-center">CANT.</TableHead>
                                    <TableHead className="h-6 p-1 text-[11px] font-bold border-r border-gray-200 text-center">UND</TableHead>
                                    <TableHead className="h-6 p-1 text-[11px] font-bold border-r border-gray-200 text-right">PRECIO</TableHead>
                                    <TableHead className="h-6 p-1 text-[11px] font-bold border-r border-gray-200 text-right">%De...</TableHead>
                                    <TableHead className="h-6 p-1 text-[11px] font-bold text-right">IMPORTE</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingDetails ? (
                                    <TableRow><TableCell colSpan={7} className="text-center py-4"><Loader2 className="animate-spin" /></TableCell></TableRow>
                                ) : details.length > 0 ? details.map(d => (
                                    <TableRow key={d.id} className="h-6 border-b border-dashed border-gray-200">
                                        <TableCell className="p-1 text-[11px] font-bold border-r border-gray-100">{d.codigo}</TableCell>
                                        <TableCell className="p-1 text-[11px] border-r border-gray-100 truncate max-w-[300px]">{d.descripcion}</TableCell>
                                        <TableCell className="p-1 text-[11px] font-bold text-center border-r border-gray-100 text-blue-600">{d.cantidad}</TableCell>
                                        <TableCell className="p-1 text-[11px] text-center border-r border-gray-100">{d.unidad || 'UND'}</TableCell>
                                        <TableCell className="p-1 text-[11px] text-right border-r border-gray-100">{parseFloat(d.precio_unitario || d.precio).toFixed(2)}</TableCell>
                                        <TableCell className="p-1 text-[11px] text-right border-r border-gray-100">{parseFloat(d.descuento_pct || d.descuento || 0).toFixed(1)}%</TableCell>
                                        <TableCell className="p-1 text-[11px] font-black text-right ">{parseFloat(d.importe).toLocaleString('en-US', { minimumFractionDigits: 2 })}</TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow><TableCell colSpan={7} className="text-center py-10 text-gray-400 italic">Seleccione un documento para ver los detalles</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="bg-[#f0f0f0] border-t border-gray-400 p-2 flex justify-end gap-2 px-4">
                    <Button
                        variant="default"
                        className="h-8 bg-[#0a1e3a] hover:bg-[#0a1e3a]/90 text-white font-bold text-[12px] px-8 rounded-none shadow-md border-b-2 border-black/20 active:border-0"
                        onClick={handleConfirm}
                        disabled={!selectedDoc}
                    >
                        Seleccionar
                    </Button>
                    <Button
                        variant="outline"
                        className="h-8 border-gray-400 text-gray-700 font-bold text-[12px] px-8 rounded-none bg-white hover:bg-gray-100"
                        onClick={onClose}
                    >
                        ESC - Salir
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default DocumentSearchModal;

const X = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
);
