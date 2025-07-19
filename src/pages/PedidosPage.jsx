import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Edit, Trash2, Send, FileDown, RefreshCw, X, Loader2, Search, Package, User, Calendar as CalendarIcon, Wallet, Tags, Percent, Hash } from 'lucide-react';
import { formatInTimeZone, getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';
import { es } from 'date-fns/locale';
import ProductSearchModal from '@/components/ventas/ProductSearchModal';
import { generatePedidoPDF } from '@/components/common/PDFGenerator';
import { useFacturacion } from '@/contexts/FacturacionContext';
import { usePanels } from '@/contexts/PanelContext';

const PedidoFormModal = ({ isOpen, onClose, pedido, onSave, clientes, vendedores }) => {
  const { toast } = useToast();
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
  const [currentPedido, setCurrentPedido] = useState(null);
  const [detalles, setDetalles] = useState([]);

  useEffect(() => {
    if (pedido) {
      setCurrentPedido({ ...pedido });
      const fetchDetails = async () => {
        const { data } = await supabase.from('pedidos_detalle').select('*, productos(ubicacion)').eq('pedido_id', pedido.id);
        const detailsWithLocation = data.map(d => ({...d, ubicacion: d.productos?.ubicacion || ''}));
        setDetalles(detailsWithLocation || []);
      };
      fetchDetails();
    } else {
      setCurrentPedido({
        cliente_id: null,
        vendedor_id: null,
        notas: '',
        fecha: getCurrentDateInTimeZone(),
      });
      setDetalles([]);
    }
  }, [pedido, isOpen]);

  const handleUpdateDetail = (id, field, value) => {
    setDetalles(prev => prev.map(d => (d.producto_id === id ? { ...d, [field]: value } : d)));
  };
  
  const handleAddProduct = (product) => {
     if (detalles.find(d => d.producto_id === product.id)) {
      toast({ title: "Producto ya agregado", description: "Este producto ya se encuentra en el pedido." });
      return;
    }
    const newDetail = {
      producto_id: product.id,
      codigo: product.codigo,
      descripcion: product.descripcion,
      ubicacion: product.ubicacion || '',
      cantidad: 1,
      unidad: 'UND',
      precio: product.precio || 0,
      descuento: 0,
      itbis: (product.precio || 0) * (product.itbis_pct / 100 || 0.18)
    };
    setDetalles(prev => [...prev, newDetail]);
  };

  const handleRemoveDetail = (id) => {
    setDetalles(prev => prev.filter(d => d.producto_id !== id));
  };
  
  const totals = useMemo(() => {
    return detalles.reduce((acc, item) => {
      const cantidad = parseFloat(item.cantidad) || 0;
      const precio = parseFloat(item.precio) || 0;
      const descuento = parseFloat(item.descuento) || 0;
      const subtotalItem = cantidad * precio;
      const itbisItem = (subtotalItem - descuento) * 0.18; // Asumiendo 18%
      
      acc.subtotal += subtotalItem;
      acc.descuento_total += descuento;
      acc.itbis_total += itbisItem;
      item.importe = subtotalItem - descuento + itbisItem;
      item.itbis = itbisItem;
      return acc;
    }, { subtotal: 0, descuento_total: 0, itbis_total: 0 });
  }, [detalles]);
  
  const montoTotal = useMemo(() => totals.subtotal - totals.descuento_total + totals.itbis_total, [totals]);

  const handleSave = async () => {
    if (!currentPedido.cliente_id || !currentPedido.vendedor_id) {
        toast({variant: 'destructive', title: "Datos incompletos", description: "Debe seleccionar un cliente y un vendedor."});
        return;
    }
    const pedidoData = {
        ...currentPedido,
        fecha: formatDateForSupabase(currentPedido.fecha),
        subtotal: totals.subtotal,
        descuento_total: totals.descuento_total,
        itbis_total: totals.itbis_total,
        monto_total: montoTotal,
    };
    onSave(pedidoData, detalles);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <ProductSearchModal isOpen={isProductSearchOpen} onClose={() => setIsProductSearchOpen(false)} onSelectProduct={handleAddProduct} />
      <Dialog open={isOpen} onOpenChange={onClose} >
        <DialogContent className="max-w-7xl h-[95vh] flex flex-col">
          <DialogHeader><DialogTitle>{pedido ? `Modificar Pedido #${pedido.numero}` : 'Crear Nuevo Pedido'}</DialogTitle></DialogHeader>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 border rounded-lg bg-gray-50">
             <div>
                <Label>Cliente</Label>
                <Select value={currentPedido.cliente_id} onValueChange={val => setCurrentPedido(p => ({...p, cliente_id: val}))}>
                    <SelectTrigger><SelectValue placeholder="Seleccione un cliente..."/></SelectTrigger>
                    <SelectContent>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
                </Select>
             </div>
             <div>
                <Label>Vendedor</Label>
                <Select value={currentPedido.vendedor_id} onValueChange={val => setCurrentPedido(p => ({...p, vendedor_id: val}))}>
                    <SelectTrigger><SelectValue placeholder="Seleccione un vendedor..."/></SelectTrigger>
                    <SelectContent>{vendedores.map(v => <SelectItem key={v.id} value={v.id}>{v.nombre_completo}</SelectItem>)}</SelectContent>
                </Select>
             </div>
             <div>
                 <Label>Fecha</Label>
                 <Input type="date" value={formatInTimeZone(new Date(currentPedido.fecha), 'yyyy-MM-dd')} onChange={e => setCurrentPedido(p => ({...p, fecha: new Date(e.target.value)}))} />
             </div>
          </div>
          
          <div className="flex-grow overflow-y-auto border rounded-lg">
             <Table>
                <TableHeader className="sticky top-0 bg-gray-100">
                    <TableRow>
                        <TableHead>Código</TableHead><TableHead>Descripción</TableHead><TableHead>Ubicación</TableHead>
                        <TableHead>Cant.</TableHead><TableHead>Unidad</TableHead>
                        <TableHead>Precio</TableHead><TableHead>Descuento</TableHead>
                        <TableHead>ITBIS</TableHead><TableHead>Importe</TableHead><TableHead />
                    </TableRow>
                </TableHeader>
                <TableBody>
                   {detalles.map(d => (
                       <TableRow key={d.producto_id}>
                           <TableCell>{d.codigo}</TableCell><TableCell>{d.descripcion}</TableCell><TableCell>{d.ubicacion}</TableCell>
                           <TableCell><Input type="number" value={d.cantidad} onChange={e => handleUpdateDetail(d.producto_id, 'cantidad', e.target.value)} className="w-20 h-8"/></TableCell>
                           <TableCell><Input value={d.unidad} onChange={e => handleUpdateDetail(d.producto_id, 'unidad', e.target.value)} className="w-20 h-8"/></TableCell>
                           <TableCell><Input type="number" value={d.precio} onChange={e => handleUpdateDetail(d.producto_id, 'precio', e.target.value)} className="w-24 h-8"/></TableCell>
                           <TableCell><Input type="number" value={d.descuento} onChange={e => handleUpdateDetail(d.producto_id, 'descuento', e.target.value)} className="w-24 h-8"/></TableCell>
                           <TableCell className="text-right">{((d.cantidad * d.precio - d.descuento) * 0.18).toFixed(2)}</TableCell>
                           <TableCell className="text-right font-bold">{d.importe?.toFixed(2)}</TableCell>
                           <TableCell><Button variant="ghost" size="icon" onClick={() => handleRemoveDetail(d.producto_id)}><Trash2 className="h-4 w-4 text-red-500"/></Button></TableCell>
                       </TableRow>
                   ))}
                </TableBody>
             </Table>
          </div>
          <Button onClick={() => setIsProductSearchOpen(true)} className="self-start"><Plus className="mr-2 h-4 w-4"/>Añadir Artículo</Button>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
                <Label>Notas</Label>
                <Textarea value={currentPedido.notas} onChange={e => setCurrentPedido(p => ({...p, notas: e.target.value}))} rows={4}/>
            </div>
            <div className="p-4 bg-gray-100 border rounded-lg space-y-2">
                <div className="flex justify-between"><span>Subtotal:</span><span>{totals.subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-red-500"><span>Descuento:</span><span>- {totals.descuento_total.toFixed(2)}</span></div>
                <div className="flex justify-between"><span>ITBIS:</span><span>{totals.itbis_total.toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-lg border-t pt-2"><span>TOTAL:</span><span>{montoTotal.toFixed(2)}</span></div>
            </div>
          </div>
          
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button onClick={handleSave}>Guardar Pedido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};


const PedidosPage = () => {
    const { toast } = useToast();
    const [pedidos, setPedidos] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [vendedores, setVendedores] = useState([]);
    const [selectedPedido, setSelectedPedido] = useState(null);
    const [detalles, setDetalles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPedido, setEditingPedido] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const { setPedidoParaFacturar } = useFacturacion();
    const { openPanel } = usePanels();

    const fetchData = useCallback(async () => {
        setLoading(true);
        const [pedidosRes, clientesRes, vendedoresRes] = await Promise.all([
            supabase.from('pedidos_list_view').select('*').order('fecha', { ascending: false }),
            supabase.from('clientes').select('*').eq('activo', true),
            supabase.from('perfiles').select('id, nombre_completo').eq('activo', true)
        ]);
        if (pedidosRes.error) toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar los pedidos.' });
        else setPedidos(pedidosRes.data);
        setClientes(clientesRes.data || []);
        setVendedores(vendedoresRes.data || []);
        setLoading(false);
    }, [toast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSelectPedido = async (pedido) => {
        setSelectedPedido(pedido);
        const { data } = await supabase.from('pedidos_detalle').select('*, productos(ubicacion)').eq('pedido_id', pedido.id);
        const detailsWithLocation = data.map(d => ({...d, ubicacion: d.productos?.ubicacion || ''}));
        setDetalles(detailsWithLocation || []);
    };
    
    const handleSavePedido = async (pedidoData, detallesData) => {
        try {
            const { error } = await supabase.rpc('crear_o_actualizar_pedido', {
                p_pedido_data: pedidoData,
                p_detalles_data: detallesData
            });

            if (error) throw error;

            toast({ title: "Éxito", description: "Pedido guardado correctamente." });
            fetchData();
        } catch (error) {
            toast({ variant: 'destructive', title: 'Error al guardar', description: error.message });
        }
    };
    
    const handleAnularPedido = async () => {
        if(!selectedPedido) return;
        try {
            await supabase.from('pedidos').update({ estado: 'Anulado' }).eq('id', selectedPedido.id);
            toast({title: 'Pedido Anulado', description: `El pedido #${selectedPedido.numero} ha sido anulado.`});
            fetchData();
            setSelectedPedido(null);
            setDetalles([]);
        } catch(error) {
            toast({ variant: 'destructive', title: 'Error al anular', description: error.message });
        }
    };
    
    const handleEnviarAFacturacion = () => {
        if (!selectedPedido || !detalles.length) return;
    
        const cliente = clientes.find(c => c.id === selectedPedido.cliente_id);

        const pedidoCompleto = {
            ...selectedPedido,
            cliente,
            detalles,
        };
        
        setPedidoParaFacturar(pedidoCompleto);
        openPanel('ventas');
    };

    const handleKeyDown = useCallback((e) => {
        if (e.key.toLowerCase() === 'insert') { e.preventDefault(); setEditingPedido(null); setIsModalOpen(true); }
        if (e.key === 'Enter' && selectedPedido) { e.preventDefault(); setEditingPedido(selectedPedido); setIsModalOpen(true); }
        if (e.key.toLowerCase() === 'delete' && selectedPedido) { e.preventDefault(); document.getElementById('delete-trigger')?.click(); }
        if (e.key === 'F5' && selectedPedido) { e.preventDefault(); handleEnviarAFacturacion(); }
    }, [selectedPedido, detalles]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
    
    const filteredPedidos = useMemo(() => {
        if (!searchTerm) return pedidos;
        return pedidos.filter(p => 
            p.numero?.toString().includes(searchTerm) || 
            p.cliente_nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            formatInTimeZone(new Date(p.fecha), 'dd/MM/yyyy').includes(searchTerm)
        );
    }, [pedidos, searchTerm]);
    
    const handleNotImplemented = () => toast({title: "🚧 No implementado", description: "Esta función estará disponible próximamente."});


  return (
    <>
      <Helmet><title>Pedidos - Repuestos Morla</title></Helmet>
      <PedidoFormModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} pedido={editingPedido} onSave={handleSavePedido} clientes={clientes} vendedores={vendedores} />
      
      <div className="h-full flex flex-col p-4 bg-gray-50 space-y-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border flex justify-between items-center">
            <h1 className="text-2xl font-bold text-morla-blue">Gestión de Pedidos / Pre-Factura</h1>
            <div className="flex items-center gap-2">
                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar por #, cliente, fecha..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 w-64"/>
                </div>
                <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}/></Button>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 flex-grow min-h-0">
            <div className="lg:col-span-3 flex flex-col gap-4">
                <div className="bg-white p-2 rounded-lg shadow-sm border flex-grow min-h-0">
                    <div className="h-full overflow-y-auto">
                    <Table>
                        <TableHeader className="sticky top-0 bg-gray-100">
                            <TableRow><TableHead>Fecha</TableHead><TableHead>Pedido</TableHead><TableHead>Usuario</TableHead><TableHead>Vendedor</TableHead><TableHead>Cliente</TableHead><TableHead>Monto</TableHead><TableHead>Estado</TableHead></TableRow>
                        </TableHeader>
                        <TableBody>
                        {loading ? <TableRow><TableCell colSpan="7" className="text-center"><Loader2 className="mx-auto my-4 h-6 w-6 animate-spin"/></TableCell></TableRow> :
                         filteredPedidos.map(p => (
                            <TableRow key={p.id} onClick={() => handleSelectPedido(p)} className={`cursor-pointer ${selectedPedido?.id === p.id ? 'bg-blue-100' : ''}`}>
                                <TableCell>{formatInTimeZone(new Date(p.fecha), 'dd/MM/yyyy')}</TableCell>
                                <TableCell>{p.numero}</TableCell>
                                <TableCell>{p.usuario_email}</TableCell>
                                <TableCell>{p.vendedor_nombre}</TableCell>
                                <TableCell>{p.cliente_nombre}</TableCell>
                                <TableCell className="text-right font-semibold">{p.monto_total.toFixed(2)}</TableCell>
                                <TableCell>{p.estado}</TableCell>
                            </TableRow>
                        ))}
                        </TableBody>
                    </Table>
                    </div>
                </div>
                <div className="bg-white p-2 rounded-lg shadow-sm border flex-grow min-h-0">
                     <h2 className="text-lg font-semibold mb-2 p-2">Mercancía en Pedido Seleccionado #{selectedPedido?.numero}</h2>
                     <div className="h-[25vh] overflow-y-auto">
                     <Table>
                        <TableHeader className="sticky top-0 bg-gray-100">
                            <TableRow><TableHead>Código</TableHead><TableHead>Descripción</TableHead><TableHead>Ubicación</TableHead><TableHead>Cant.</TableHead><TableHead>Unidad</TableHead><TableHead>Precio</TableHead><TableHead>Desc.</TableHead><TableHead>ITBIS</TableHead><TableHead>Importe</TableHead></TableRow>
                        </TableHeader>
                        <TableBody>
                        {detalles.map(d => (
                            <TableRow key={d.id}>
                                <TableCell>{d.codigo}</TableCell><TableCell>{d.descripcion}</TableCell><TableCell>{d.ubicacion}</TableCell>
                                <TableCell>{d.cantidad}</TableCell><TableCell>{d.unidad}</TableCell>
                                <TableCell>{d.precio.toFixed(2)}</TableCell><TableCell>{d.descuento.toFixed(2)}</TableCell>
                                <TableCell>{d.itbis.toFixed(2)}</TableCell><TableCell>{d.importe.toFixed(2)}</TableCell>
                            </TableRow>
                        ))}
                        </TableBody>
                     </Table>
                     </div>
                </div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border space-y-2 flex flex-col">
                <h2 className="text-lg font-bold text-center mb-2">Acciones</h2>
                <Button onClick={() => { setEditingPedido(null); setIsModalOpen(true); }} className="w-full justify-between"><span>INS - Crear Nuevo Pedido</span><Plus/></Button>
                <Button onClick={() => { if(selectedPedido) {setEditingPedido(selectedPedido); setIsModalOpen(true);}}} disabled={!selectedPedido || selectedPedido.estado !== 'Pendiente'} className="w-full justify-between"><span>ENTER - Modificar Pedido</span><Edit/></Button>
                <Button onClick={handleEnviarAFacturacion} disabled={!selectedPedido || selectedPedido.estado !== 'Pendiente'} className="w-full justify-between bg-green-600 hover:bg-green-700"><span>F5 - Enviar a Facturación</span><Send/></Button>
                
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button id="delete-trigger" variant="destructive" disabled={!selectedPedido || selectedPedido.estado !== 'Pendiente'} className="w-full justify-between"><span>DEL - Anular Pedido</span><Trash2/></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>¿Anular Pedido?</AlertDialogTitle><AlertDialogDescription>Esta acción no se puede deshacer. El pedido #{selectedPedido?.numero} será marcado como anulado.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleAnularPedido}>Confirmar Anulación</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
                
                <Button variant="secondary" onClick={handleNotImplemented} disabled={!selectedPedido} className="w-full justify-between mt-auto"><span>Mover Mercancía</span><Package/></Button>
                <Button variant="outline" onClick={() => generatePedidoPDF(selectedPedido, clientes.find(c=>c.id === selectedPedido.cliente_id), vendedores.find(v=>v.id === selectedPedido.vendedor_id), detalles)} disabled={!selectedPedido} className="w-full justify-between"><span>Imprimir Pedido</span><FileDown/></Button>
            </div>
        </div>
      </div>
    </>
  );
};

export default PedidosPage;