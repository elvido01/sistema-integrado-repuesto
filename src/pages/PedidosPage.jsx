import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Edit, Trash2, Send, FileDown, RefreshCw, X, Loader2, Search, Package, User, Calendar as CalendarIcon, Wallet, Tags, Percent, Hash, ListOrdered, ShoppingCart, BarChart2 } from 'lucide-react';
import { format } from 'date-fns';
import { formatInTimeZone, getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';
import { es } from 'date-fns/locale';
import ProductSearchModal from '@/components/ventas/ProductSearchModal';
import { generatePedidoPDF } from '@/components/common/PDFGenerator';
import { useFacturacion } from '@/contexts/FacturacionContext';
import { usePanels } from '@/contexts/PanelContext';

const PedidoFormModal = ({ isOpen, onClose, pedido, onSave, clientes, vendedores }) => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
  const [currentPedido, setCurrentPedido] = useState(null);
  const [detalles, setDetalles] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Staging state
  const [stagingItem, setStagingItem] = useState(null);
  const [itemCode, setItemCode] = useState('');

  useEffect(() => {
    if (pedido) {
      setCurrentPedido({ ...pedido });
      const fetchDetails = async () => {
        const { data } = await supabase.from('pedidos_detalle').select('*, productos(ubicacion)').eq('pedido_id', pedido.id);
        const detailsWithLocation = data.map(d => ({ ...d, ubicacion: d.productos?.ubicacion || '' }));
        setDetalles(detailsWithLocation || []);
      };
      fetchDetails();
    } else {
      setCurrentPedido({
        cliente_id: '',
        notas: '',
        manual_cliente_nombre: '',
        placa_vehiculo: '',
        vendedor_id: vendedores.length > 0 ? vendedores[0].id : '',
        fecha: getCurrentDateInTimeZone(),
      });
      setDetalles([]);
    }
  }, [pedido, isOpen]);

  const handleUpdateDetail = (id, field, value) => {
    setDetalles(prev => prev.map(d => {
      if (d.producto_id === id) {
        const updated = { ...d, [field]: value };
        if (field === 'descuento') {
          const discountVal = parseFloat(value) || 0;
          const itemTotalBruto = (updated.cantidad || 0) * (updated.precio || 0);
          const pct = itemTotalBruto > 0 ? (discountVal / itemTotalBruto) * 100 : 0;
          const maxDesc = d.max_descuento_pct || 0;

          if (pct > maxDesc) {
            toast({ title: "Descuento Excedido", description: `Máximo permitido: ${maxDesc}%`, variant: "destructive" });
            updated.descuento = itemTotalBruto * (maxDesc / 100);
          } else {
            updated.descuento = discountVal;
          }
        }
        return updated;
      }
      return d;
    }));
  };

  const handleAddProduct = (product) => {
    const itbis_pct = product.itbis_pct || 18;
    const precio = product.precio || 0;

    // Apply price level logic
    const level = selectedCliente?.precio_nivel || 1;
    let finalPrice = product.precio || 0;
    let maxDesc = 0;

    if (product.presentaciones && product.presentaciones.length > 0) {
      const mainPres = product.presentaciones.find(p => p.afecta_ft) || product.presentaciones[0];
      if (mainPres) {
        const p1 = parseFloat(mainPres.precio1 || 0);
        const p2 = parseFloat(mainPres.precio2 || 0);
        const p3 = parseFloat(mainPres.precio3 || 0);
        const auto2 = !!mainPres.auto_precio2;
        const auto3 = !!mainPres.auto_precio3;

        finalPrice = p1;

        if (level === 3) {
          if (auto3 || p3 > 0) {
            finalPrice = p3;
          } else if (auto2 || p2 > 0) {
            finalPrice = p2;
          } else {
            finalPrice = p1;
          }
        } else if (level === 2) {
          if (auto2 || p2 > 0) {
            finalPrice = p2;
          } else {
            finalPrice = p1;
          }
        }

        // Level 2 and 3 do NOT get discounts
        if (level === 2 || level === 3) {
          maxDesc = 0;
        } else {
          maxDesc = parseFloat(mainPres.descuento_pct || 0);
        }
      }
    }

    const newItem = {
      producto_id: product.id,
      codigo: product.codigo,
      descripcion: product.descripcion,
      ubicacion: product.ubicacion || '',
      cantidad: 1,
      unidad: 'UND',
      precio: finalPrice,
      descuento: 0,
      itbis_pct: itbis_pct,
      itbis: finalPrice * (itbis_pct / 100),
      max_descuento_pct: maxDesc
    };
    setStagingItem(newItem);
    setItemCode(product.codigo);
    setIsProductSearchOpen(false);

    // Focus Cantidad after selection
    setTimeout(() => {
      document.getElementById('ped-input-cantidad')?.focus();
      document.getElementById('ped-input-cantidad')?.select();
    }, 100);
  };

  const updateStagingItem = (field, value) => {
    setStagingItem(prev => {
      if (!prev) return null;
      const updated = { ...prev, [field]: parseFloat(value) || 0 };

      if (field === 'descuento') {
        const itemTotalBruto = updated.cantidad * updated.precio;
        const pct = itemTotalBruto > 0 ? (updated.descuento / itemTotalBruto) * 100 : 0;
        const maxDesc = prev.max_descuento_pct || 0;

        if (pct > maxDesc) {
          toast({
            title: "Descuento Excedido",
            description: `El máximo permitido para este nivel es ${maxDesc}%`,
            variant: "destructive"
          });
          updated.descuento = itemTotalBruto * (maxDesc / 100);
        }
      }
      return updated;
    });
  };

  const commitStagingItem = () => {
    if (!stagingItem || !stagingItem.cantidad || stagingItem.cantidad <= 0) return;

    setDetalles(prev => {
      const existingIndex = prev.findIndex(d => d.producto_id === stagingItem.producto_id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex].cantidad += stagingItem.cantidad;
        return updated;
      }
      return [...prev, stagingItem];
    });
    setStagingItem(null);
    setItemCode('');
  };

  const handleAddByCode = async (code) => {
    if (!code.trim()) return;
    const { data, error } = await supabase
      .from('productos')
      .select('*, presentaciones(*)')
      .eq('codigo', code.trim())
      .maybeSingle();
    if (data) handleAddProduct(data);
    else toast({ title: 'No encontrado', description: 'Producto no existe', variant: 'destructive' });
  };

  const handleRemoveDetail = (id) => {
    setDetalles(prev => prev.filter(d => d.producto_id !== id));
  };

  const totals = useMemo(() => {
    return detalles.reduce((acc, item) => {
      const cantidad = parseFloat(item.cantidad) || 0;
      const precio = parseFloat(item.precio) || 0;
      const descuento = parseFloat(item.descuento) || 0;
      const itbis_pct = parseFloat(item.itbis_pct || 18) / 100;

      const subtotalItem = cantidad * precio;
      const baseImponible = subtotalItem - descuento;
      const itbisItem = baseImponible * itbis_pct;

      acc.subtotal += subtotalItem;
      acc.descuento_total += descuento;
      acc.itbis_total += itbisItem;
      item.importe = baseImponible + itbisItem;
      item.itbis = itbisItem;
      return acc;
    }, { subtotal: 0, descuento_total: 0, itbis_total: 0 });
  }, [detalles]);

  const montoTotal = useMemo(() => totals.subtotal - totals.descuento_total + totals.itbis_total, [totals]);

  const selectedCliente = useMemo(() => clientes.find(c => c.id === currentPedido?.cliente_id), [clientes, currentPedido?.cliente_id]);
  const isGenericClient = useMemo(() => {
    const genericIds = ['2749fa36-3d7c-4bdf-ad61-df88eda8365a', '00000000-0000-0000-0000-000000000000'];
    if (!currentPedido?.cliente_id) return true;
    if (genericIds.includes(currentPedido.cliente_id)) return true;
    return selectedCliente?.nombre?.toUpperCase().includes('GENERICO') || false;
  }, [currentPedido?.cliente_id, selectedCliente]);

  const handleSave = async () => {
    // Validation: Require vendor and (either a selected client OR a manual name)
    const hasClient = currentPedido.cliente_id || currentPedido.manual_cliente_nombre?.trim();
    if (!hasClient || !currentPedido.vendedor_id) {
      toast({
        variant: 'destructive',
        title: "Datos incompletos",
        description: !hasClient ? "Debe seleccionar un cliente o escribir un nombre." : "Debe seleccionar un vendedor."
      });
      return;
    }

    setIsSubmitting(true);

    // If no specific client is selected, use the official generic client ID
    const FINAL_GENERIC_ID = '2749fa36-3d7c-4bdf-ad61-df88eda8365a';
    const finalClienteId = currentPedido.cliente_id || FINAL_GENERIC_ID;

    const pedidoData = {
      ...currentPedido,
      cliente_id: finalClienteId,
      fecha: formatDateForSupabase(currentPedido.fecha),
      subtotal: totals.subtotal,
      descuento_total: totals.descuento_total,
      itbis_total: totals.itbis_total,
      monto_total: montoTotal,
    };
    await onSave(pedidoData, detalles);
    setIsSubmitting(false);
    onClose();
  };

  if (!isOpen || !currentPedido) return null;

  return (
    <>
      <ProductSearchModal isOpen={isProductSearchOpen} onClose={() => setIsProductSearchOpen(false)} onSelectProduct={handleAddProduct} />
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-[95vw] w-[1400px] h-[95vh] flex flex-col p-0 gap-0 overflow-hidden bg-slate-50 border-none shadow-2xl">

          {/* Custom Header matching Image 2 Title Bar */}
          <div className="bg-[#a3c2f0] py-1 px-4 flex justify-between items-center border-b border-blue-300">
            <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <ListOrdered className="w-5 h-5" /> PEDIDOS / PRE-FACTURA
            </h2>
            <div className="flex items-center gap-4">
              <div className="bg-white/80 backdrop-blur px-3 py-0.5 rounded border border-blue-400 flex items-center gap-2 shadow-sm">
                <span className="text-xs font-bold text-slate-500 uppercase">Número:</span>
                <span className="text-sm font-mono font-bold text-blue-700">{pedido?.numero || 'NUEVO'}</span>
              </div>
              <div className="bg-white/80 backdrop-blur px-3 py-0.5 rounded border border-blue-400 flex items-center gap-2 shadow-sm">
                <span className="text-xs font-bold text-slate-500 uppercase">Fecha:</span>
                <span className="text-sm font-bold text-slate-700">{format(new Date(currentPedido.fecha), 'dd/MM/yyyy')}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} className="h-6 w-6 hover:bg-red-500 hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Quick Info Bar */}
          <div className="bg-white border-b px-4 py-2 flex gap-6 items-center shadow-sm z-10">
            <div className="flex items-center gap-2 min-w-[250px]">
              <Label className="text-[10px] font-bold text-slate-400 uppercase">Vendedor</Label>
              <Select value={currentPedido.vendedor_id} onValueChange={val => setCurrentPedido(p => ({ ...p, vendedor_id: val }))}>
                <SelectTrigger className="h-8 border-slate-200 bg-slate-50/50 focus:ring-blue-500"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                <SelectContent>{vendedores.map(v => <SelectItem key={v.id} value={v.id}>{v.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <div className="flex items-center gap-4 flex-grow">
              <span className="text-[10px] text-slate-400 animate-pulse font-medium italic">F10 para guardar • ESC para salir • INS para buscar artículos</span>
            </div>
          </div>

          {/* Main Table Container */}
          <div className="flex-grow overflow-hidden p-4">
            <div className="h-full bg-white rounded-xl shadow-inner border border-slate-200 flex flex-col overflow-hidden">
              <div className="overflow-y-auto flex-grow scrollbar-thin scrollbar-thumb-slate-200">
                <Table>
                  <TableHeader className="sticky top-0 bg-slate-100/95 backdrop-blur z-20 shadow-sm">
                    <TableRow className="border-b border-slate-200 hover:bg-transparent">
                      <TableHead className="text-xs font-bold uppercase text-slate-600 py-3">
                        <div className="flex items-center gap-2">
                          Código
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsProductSearchOpen(true)}
                            className="h-6 w-6 text-blue-600 hover:bg-blue-100 border border-blue-200 shadow-sm"
                            title="Añadir Artículo [INS]"
                          >
                            <Search className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableHead>
                      <TableHead className="text-xs font-bold uppercase text-slate-600">Descripción</TableHead>
                      <TableHead className="text-xs font-bold uppercase text-slate-600">Ubicación</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase text-slate-600 text-center w-20">Cant.</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase text-slate-600 text-center w-20">Unidad</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase text-slate-600 text-right w-28">Precio</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase text-slate-600 text-right w-24">Desc. %</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase text-slate-600 text-right w-24">ITBIS</TableHead>
                      <TableHead className="text-[11px] font-bold uppercase text-slate-600 text-right w-32 bg-blue-50/50">Importe</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                    {/* Staging Row */}
                    <TableRow className="bg-[#ffffbf] border-b-2 border-gray-600 shadow-md h-10 group">
                      <TableCell className="p-1 border-r border-gray-300">
                        <Input
                          id="ped-input-codigo"
                          placeholder="F9..."
                          value={itemCode}
                          onChange={e => setItemCode(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleAddByCode(itemCode);
                            if (e.key === 'F9') setIsProductSearchOpen(true);
                          }}
                          className="h-7 text-[11px] font-black border-blue-600 focus:ring-0 bg-white uppercase"
                        />
                      </TableCell>
                      <TableCell className="p-1 border-r border-gray-300"><Input value={stagingItem?.descripcion || ''} readOnly className="h-7 text-[11px] bg-slate-100/50 border-slate-200" /></TableCell>
                      <TableCell className="p-1 border-r border-gray-300"><Input value={stagingItem?.ubicacion || ''} readOnly className="h-7 text-[11px] bg-slate-100/50 border-slate-200" /></TableCell>
                      <TableCell className="p-1 border-r border-gray-300">
                        <Input
                          id="ped-input-cantidad"
                          type="number"
                          value={stagingItem?.cantidad || ''}
                          onChange={e => updateStagingItem('cantidad', e.target.value)}
                          className="h-7 text-xs text-center font-black text-blue-900 border-blue-600 focus:ring-0 bg-white"
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              if (profile?.role === 'admin') {
                                document.getElementById('ped-input-precio')?.focus();
                              } else {
                                document.getElementById('ped-input-descuento')?.focus();
                              }
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="p-1 font-bold text-center text-[10px] text-slate-400 border-r border-gray-300">{stagingItem?.unidad || '---'}</TableCell>
                      <TableCell className="p-1 border-r border-gray-300">
                        <Input
                          id="ped-input-precio"
                          type="number"
                          value={stagingItem?.precio || ''}
                          onChange={e => updateStagingItem('precio', e.target.value)}
                          className="h-7 text-xs text-right font-black text-blue-900 border-blue-600 focus:ring-0 bg-white"
                          onKeyDown={e => { if (e.key === 'Enter') document.getElementById('ped-input-descuento')?.focus(); }}
                          disabled={profile?.role !== 'admin'}
                        />
                      </TableCell>
                      <TableCell className="p-1 border-r border-gray-300">
                        <Input
                          id="ped-input-descuento"
                          type="number"
                          value={stagingItem?.descuento || ''}
                          onChange={e => updateStagingItem('descuento', e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitStagingItem(); setTimeout(() => document.getElementById('ped-input-codigo')?.focus(), 50); } }}
                          className="h-7 text-xs text-center font-black text-red-600 border-blue-600 focus:ring-0 bg-white"
                        />
                      </TableCell>
                      <TableCell className="p-1 text-right text-[10px] font-black text-slate-500 border-r border-gray-300">
                        {stagingItem ? (stagingItem.precio * stagingItem.cantidad * (1 - stagingItem.descuento / 100) * (stagingItem.itbis_pct / 100)).toFixed(2) : '0.00'}
                      </TableCell>
                      <TableCell className="p-1 text-right font-black text-blue-900 bg-blue-100/30 border-r border-gray-300">
                        {stagingItem ? (stagingItem.precio * stagingItem.cantidad * (1 - stagingItem.descuento / 100) * (1 + stagingItem.itbis_pct / 100)).toFixed(2) : '0.00'}
                      </TableCell>
                      <TableCell className="p-1 text-center">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:bg-green-50" onClick={commitStagingItem}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detalles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="h-64 text-center">
                          <div className="flex flex-col items-center justify-center text-slate-300 gap-2">
                            <ShoppingCart className="w-12 h-12 opacity-20" />
                            <p className="text-sm italic">No hay productos en este pedido</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : detalles.map((d, idx) => (
                      <TableRow key={d.producto_id} className={`group hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                        <TableCell className="font-mono text-xs font-bold text-slate-700">{d.codigo}</TableCell>
                        <TableCell className="text-xs font-medium text-slate-600">{d.descripcion}</TableCell>
                        <TableCell className="text-[10px] text-slate-400 italic">{d.ubicacion}</TableCell>
                        <TableCell><Input type="number" value={d.cantidad} onChange={e => handleUpdateDetail(d.producto_id, 'cantidad', e.target.value)} className="w-20 h-7 text-xs text-center border-slate-200 focus:border-blue-400" /></TableCell>
                        <TableCell className="text-center font-bold text-slate-500 text-[10px]">{d.unidad}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={d.precio}
                            onChange={e => handleUpdateDetail(d.producto_id, 'precio', e.target.value)}
                            className="w-24 h-7 text-xs text-right border-slate-200 focus:border-blue-400 font-bold"
                            disabled={profile?.role !== 'admin'}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={d.descuento}
                            onChange={e => handleUpdateDetail(d.producto_id, 'descuento', e.target.value)}
                            className="w-24 h-7 text-xs text-right border-slate-200 focus:border-blue-400 font-bold text-red-600"
                          />
                        </TableCell>
                        <TableCell className="text-right text-[10px] text-slate-500 font-medium">RD$ {d.itbis.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-bold text-blue-800 bg-blue-50/30">RD$ {d.importe?.toFixed(2)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600" onClick={() => handleRemoveDetail(d.producto_id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          {/* Bottom Panels - Legacy Structure with Modern Style */}
          <div className="bg-[#f0f4f8] p-4 grid grid-cols-12 gap-4 border-t border-slate-200 shadow-[0_-4px_10px_-5px_rgba(0,0,0,0.1)]">

            {/* Left Column: Data Cliente & Vehicle & Notes */}
            <div className="col-span-8 flex flex-col gap-3">
              <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                <h3 className="text-[10px] font-extrabold text-blue-800 uppercase mb-3 flex items-center gap-1.5 opacity-70 border-b pb-1.5">
                  <User className="w-3 h-3" /> Datos del Cliente
                </h3>
                <div className="grid grid-cols-12 gap-3 items-start">
                  <div className="col-span-12 md:col-span-5 space-y-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase">Cliente [F3]</Label>
                      <Select value={currentPedido.cliente_id} onValueChange={val => setCurrentPedido(p => ({ ...p, cliente_id: val }))}>
                        <SelectTrigger className="h-8 border-slate-200 focus:border-blue-500"><SelectValue placeholder="Presione F3 para buscar cliente..." /></SelectTrigger>
                        <SelectContent>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase">Nombre de Cliente / Vehículo</Label>
                      <Input
                        value={currentPedido.manual_cliente_nombre || ''}
                        onChange={e => setCurrentPedido(p => ({ ...p, manual_cliente_nombre: e.target.value }))}
                        className={`h-8 border-slate-200 text-xs transition-all ${isGenericClient ? 'bg-yellow-50/50 border-yellow-200' : 'bg-slate-50 opacity-50'}`}
                        placeholder={isGenericClient ? "Escriba nombre del cliente o motocicleta..." : "Solo para Cliente Genérico"}
                        disabled={!isGenericClient}
                      />
                    </div>
                  </div>
                  <div className="col-span-12 md:col-span-7 flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase">RNC / Cédula</Label>
                        <Input readOnly value={selectedCliente?.rnc || ''} className="h-8 bg-slate-50 border-slate-200 text-xs font-mono" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase">Placa / Vehículo</Label>
                        <Input value={currentPedido.placa_vehiculo || ''} onChange={e => setCurrentPedido(p => ({ ...p, placa_vehiculo: e.target.value }))} className="h-8 border-slate-200 text-xs" />
                      </div>
                    </div>
                    <div className="flex gap-3 overflow-x-auto">
                      <div className="text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-500 flex-grow"><span className="font-bold">DIR:</span> {selectedCliente?.direccion || '---'}</div>
                      <div className="text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-500"><span className="font-bold">TEL:</span> {selectedCliente?.telefono || '---'}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex-grow">
                  <h3 className="text-[10px] font-extrabold text-blue-800 uppercase mb-1 flex items-center gap-1.5 opacity-70">
                    <Tags className="w-3 h-3" /> Notas y Comentarios
                  </h3>
                  <Textarea
                    value={currentPedido.notas}
                    onChange={e => setCurrentPedido(p => ({ ...p, notas: e.target.value }))}
                    className="min-h-[60px] text-xs border-slate-200 focus:border-blue-400 resize-none h-full"
                    placeholder="Escriba aquí notas internas o condiciones especiales..."
                  />
                </div>
              </div>
            </div>

            {/* Right Column: Totals & Final Actions */}
            <div className="col-span-4 flex flex-col gap-3">
              <div className="bg-[#fffbe6]/80 backdrop-blur rounded-lg border border-yellow-200 p-4 shadow-sm relative overflow-hidden flex-grow flex flex-col justify-center">
                <div className="absolute top-0 right-0 p-4 opacity-5"><BarChart2 className="w-16 h-16" /></div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs text-slate-600">
                    <span className="font-medium">Total Exento:</span>
                    <span className="font-mono">RD$ 0.00</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-600">
                    <span className="font-medium">Total Gravado:</span>
                    <span className="font-mono">RD$ {totals.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-red-500">
                    <span className="font-medium">Descuento:</span>
                    <span className="font-mono">- RD$ {totals.descuento_total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-600">
                    <span className="font-medium uppercase tracking-tighter">ITBIS Liquidado:</span>
                    <span className="font-mono">RD$ {totals.itbis_total.toFixed(2)}</span>
                  </div>

                  <div className="h-px bg-yellow-300/30 my-2" />

                  <div className="flex justify-between items-end">
                    <span className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">TOTAL FACTURADO</span>
                    <div className="text-right">
                      <span className="text-[10px] block text-red-500 font-bold -mb-1">RD$ TRANSACCIONAL</span>
                      <span className="text-3xl font-black text-red-600 drop-shadow-sm font-mono tracking-tighter">
                        {montoTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={onClose} className="h-10 border-slate-300 hover:bg-slate-100 text-slate-600 font-bold uppercase text-[11px] tracking-widest shadow-sm">
                  <X className="w-4 h-4 mr-2" /> Cancelar [ESC]
                </Button>
                <Button onClick={handleSave} disabled={isSubmitting} className="h-10 bg-blue-900 hover:bg-blue-950 text-white font-bold uppercase text-[11px] tracking-widest shadow-md active:translate-y-0.5 transition-all">
                  {isSubmitting ? <Loader2 className="animate-spin" /> : <><Send className="w-4 h-4 mr-2" /> Guardar [F10]</>}
                </Button>
              </div>
            </div>

          </div>

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
      supabase.from('pedidos_list_view').select('*').eq('estado', 'Pendiente').order('fecha', { ascending: false }),
      supabase.from('clientes').select('*').eq('activo', true),
      supabase.from('vendedores').select('id, nombre').eq('activo', true).order('nombre', { ascending: true })
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
    const { data } = await supabase.from('pedidos_detalle').select('*, productos(ubicacion, itbis_pct)').eq('pedido_id', pedido.id);
    const detailsWithLocation = data.map(d => ({ ...d, ubicacion: d.productos?.ubicacion || '' }));
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
    if (!selectedPedido) return;
    try {
      await supabase.from('pedidos').update({ estado: 'Anulado' }).eq('id', selectedPedido.id);
      toast({ title: 'Pedido Anulado', description: `El pedido #${selectedPedido.numero} ha sido anulado.` });
      fetchData();
      setSelectedPedido(null);
      setDetalles([]);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al anular', description: error.message });
    }
  };

  const handleEnviarAFacturacion = async () => {
    if (!selectedPedido || !detalles.length) return;

    try {
      // 1. Update status to 'Facturando' so it disappears from 'Pendiente' list
      // but stays available for the sales search modal
      const { error } = await supabase
        .from('pedidos')
        .update({ estado: 'Facturando' })
        .eq('id', selectedPedido.id);

      if (error) throw error;

      // 2. Preparar datos para facturación
      const cliente = clientes.find(c => c.id === selectedPedido.cliente_id);
      const pedidoCompleto = {
        type: 'pedido',
        ...selectedPedido,
        cliente,
        detalles,
      };

      toast({ title: "Preparado", description: "Pedido listo en el módulo de Ventas." });
      fetchData();
      setSelectedPedido(null);
      setDetalles([]);

    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se pudo procesar el envío.' });
    }
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
      (p.fecha ? formatInTimeZone(new Date(p.fecha), 'dd/MM/yyyy').includes(searchTerm) : false)
    );
  }, [pedidos, searchTerm]);

  const handleNotImplemented = () => toast({ title: "🚧 No implementado", description: "Esta función estará disponible próximamente." });


  return (
    <>
      <Helmet><title>Pedidos - Repuestos Morla</title></Helmet>
      <PedidoFormModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} pedido={editingPedido} onSave={handleSavePedido} clientes={clientes} vendedores={vendedores} />

      <div className="h-full flex flex-col p-4 bg-gray-50 space-y-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border flex justify-between items-center">
          <h1 className="text-2xl font-bold text-morla-blue">Gestión de Pedidos</h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por #, cliente, fecha..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 w-64" />
            </div>
            <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></Button>
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
                    {loading ? <TableRow><TableCell colSpan="7" className="text-center"><Loader2 className="mx-auto my-4 h-6 w-6 animate-spin" /></TableCell></TableRow> :
                      filteredPedidos.map(p => (
                        <TableRow
                          key={p.id}
                          onClick={() => handleSelectPedido(p)}
                          onDoubleClick={() => {
                            if (p.estado === 'Pendiente') {
                              setEditingPedido(p);
                              setIsModalOpen(true);
                            }
                          }}
                          className={`cursor-pointer ${selectedPedido?.id === p.id ? 'bg-blue-100' : ''}`}
                        >
                          <TableCell>
                            {p.fecha && !isNaN(new Date(p.fecha))
                              ? formatInTimeZone(new Date(p.fecha), 'dd/MM/yyyy')
                              : '---'}
                          </TableCell>
                          <TableCell>{p.numero}</TableCell>
                          <TableCell>{p.usuario_email}</TableCell>
                          <TableCell>{p.vendedor_nombre}</TableCell>
                          <TableCell>{p.cliente_nombre}</TableCell>
                          <TableCell className="text-right font-semibold">{Number(p.monto_total || 0).toFixed(2)}</TableCell>
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
                        <TableCell>{Number(d.precio || 0).toFixed(2)}</TableCell><TableCell>{Number(d.descuento || 0).toFixed(2)}</TableCell>
                        <TableCell>{Number(d.itbis || 0).toFixed(2)}</TableCell><TableCell>{Number(d.importe || 0).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border space-y-2 flex flex-col">
            <h2 className="text-lg font-bold text-center mb-2">Acciones</h2>
            <Button onClick={() => { setEditingPedido(null); setIsModalOpen(true); }} className="w-full justify-between"><span>INS - Crear Nuevo Pedido</span><Plus /></Button>
            <Button onClick={() => { if (selectedPedido) { setEditingPedido(selectedPedido); setIsModalOpen(true); } }} disabled={!selectedPedido || selectedPedido.estado !== 'Pendiente'} className="w-full justify-between"><span>ENTER - Modificar Pedido</span><Edit /></Button>
            <Button onClick={handleEnviarAFacturacion} disabled={!selectedPedido || selectedPedido.estado !== 'Pendiente'} className="w-full justify-between bg-green-600 hover:bg-green-700"><span>F5 - Enviar a Facturación</span><Send /></Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button id="delete-trigger" variant="destructive" disabled={!selectedPedido || selectedPedido.estado !== 'Pendiente'} className="w-full justify-between"><span>DEL - Anular Pedido</span><Trash2 /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>¿Anular Pedido?</AlertDialogTitle><AlertDialogDescription>Esta acción no se puede deshacer. El pedido #{selectedPedido?.numero} será marcado como anulado.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleAnularPedido}>Confirmar Anulación</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button variant="secondary" onClick={handleNotImplemented} disabled={!selectedPedido} className="w-full justify-between mt-auto"><span>Mover Mercancía</span><Package /></Button>
            <Button variant="outline" onClick={() => generatePedidoPDF(selectedPedido, clientes.find(c => c.id === selectedPedido.cliente_id), vendedores.find(v => v.id === selectedPedido.vendedor_id), detalles)} disabled={!selectedPedido} className="w-full justify-between"><span>Imprimir Pedido</span><FileDown /></Button>
          </div>
        </div>
      </div >
    </>
  );
};

export default PedidosPage;