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
  const { profile , empresa} = useAuth();
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
  const [modalSessionKey, setModalSessionKey] = useState(0);
  const [currentPedido, setCurrentPedido] = useState(null);
  const [detalles, setDetalles] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Staging state
  const [stagingItem, setStagingItem] = useState(null);
  const [itemCode, setItemCode] = useState('');

  useEffect(() => {
    if (pedido) {
      const fetchPedidoCompleto = async () => {
        // El listado viene de pedidos_list_view, que no incluye notas
        // ni manual_cliente_nombre/placa_vehiculo. Traer el row completo
        // de la tabla `pedidos` para que el formulario muestre todo.
        const { data: pedidoCompleto } = await supabase
          .from('pedidos')
          .select('*')
          .eq('id', pedido.id)
          .maybeSingle();
        setCurrentPedido({ ...pedido, ...(pedidoCompleto || {}) });

        const { data } = await supabase.from('pedidos_detalle').select('*, productos(ubicacion)').eq('pedido_id', pedido.id);
        const detailsWithLocation = (data || []).map(d => ({ ...d, ubicacion: d.productos?.ubicacion || '' }));
        setDetalles(detailsWithLocation);
      };
      fetchPedidoCompleto();
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
      precio: finalPrice, // Price is ITBIS-inclusive
      descuento: 0,
      itbis_pct: itbis_pct,
      itbis: finalPrice - (finalPrice / (1 + (itbis_pct / 100))),
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
      .ilike('codigo', code.trim())
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
      const precioInclusive = parseFloat(item.precio) || 0;
      const descuentoInclusive = parseFloat(item.descuento) || 0;
      const itbis_pct_raw = parseFloat(item.itbis_pct || 18);
      const itbis_pct = itbis_pct_raw > 1 ? itbis_pct_raw / 100 : itbis_pct_raw;

      const importeBruto = cantidad * precioInclusive;
      const importeNeto = importeBruto - descuentoInclusive;
      
      const baseImponible = importeNeto / (1 + itbis_pct);
      const itbisItem = importeNeto - baseImponible;

      acc.subtotal += baseImponible;
      acc.descuento_total += descuentoInclusive;
      acc.itbis_total += itbisItem;
      item.importe = importeNeto;
      item.itbis = itbisItem;
      return acc;
    }, { subtotal: 0, descuento_total: 0, itbis_total: 0 });
  }, [detalles]);

  const montoTotal = useMemo(() => totals.subtotal + totals.itbis_total, [totals]);

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

    // Recalculate totals cleanly to avoid stale/NaN values
    let calcSubtotal = 0, calcDescuento = 0, calcItbis = 0;
    const cleanDetalles = detalles.map(d => {
      const cantidad = parseFloat(d.cantidad) || 0;
      const precio = parseFloat(d.precio) || 0;
      const descuento = parseFloat(d.descuento) || 0;
      const itbis_pct_raw = parseFloat(d.itbis_pct || 18);
      const itbis_pct = itbis_pct_raw > 1 ? itbis_pct_raw / 100 : itbis_pct_raw;

      const importeBruto = cantidad * precio;
      const importeNeto = importeBruto - descuento;
      const baseImponible = importeNeto / (1 + itbis_pct);
      const itbisItem = importeNeto - baseImponible;

      calcSubtotal += baseImponible;
      calcDescuento += descuento;
      calcItbis += itbisItem;

      return {
        producto_id: d.producto_id,
        codigo: d.codigo || '',
        descripcion: d.descripcion || '',
        cantidad,
        unidad: d.unidad || 'UND',
        precio,
        descuento,
        itbis_pct: itbis_pct_raw,
        itbis: Math.round(itbisItem * 100) / 100,
        importe: Math.round(importeNeto * 100) / 100,
      };
    });

    const pedidoData = {
      ...(currentPedido.id ? { id: currentPedido.id } : {}),
      cliente_id: finalClienteId,
      vendedor_id: currentPedido.vendedor_id,
      fecha: formatDateForSupabase(currentPedido.fecha),
      notas: currentPedido.notas || '',
      manual_cliente_nombre: currentPedido.manual_cliente_nombre || '',
      placa_vehiculo: currentPedido.placa_vehiculo || '',
      subtotal: Math.round(calcSubtotal * 100) / 100,
      descuento_total: Math.round(calcDescuento * 100) / 100,
      itbis_total: Math.round(calcItbis * 100) / 100,
      monto_total: Math.round((calcSubtotal + calcItbis) * 100) / 100,
    };

    const success = await onSave(pedidoData, cleanDetalles);
    setIsSubmitting(false);
    if (success) {
      setModalSessionKey(k => k + 1);
      onClose();
    }
  };

  if (!isOpen || !currentPedido) return null;

  return (
    <>
      <ProductSearchModal isOpen={isProductSearchOpen} onClose={() => setIsProductSearchOpen(false)} onSelectProduct={handleAddProduct} sessionKey={modalSessionKey} />
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-[98vw] w-[1500px] h-[95vh] flex flex-col p-0 gap-0 overflow-hidden bg-slate-50 border-none shadow-2xl">

          {/* Header dark estilo Facturacion */}
          <div className="bg-slate-900 text-white px-4 py-2 flex items-center justify-between border-b border-slate-700">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <button className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300" title="Nuevo">
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300" title="Guardar">
                  <FileDown className="w-3.5 h-3.5" />
                </button>
                <button className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300" title="Listar">
                  <ListOrdered className="w-3.5 h-3.5" />
                </button>
              </div>
              <h2 className="text-lg font-bold tracking-tight flex items-center gap-3">
                <span className="text-amber-400">{empresa?.nombre?.toUpperCase() || 'REPUESTOS MORLA'}</span>
                <span className="text-slate-500">|</span>
                <span className="uppercase tracking-widest text-sm">Pedido / Pre-Factura</span>
              </h2>
            </div>
            <div className="bg-red-600 px-2.5 py-0.5 rounded text-xs font-black tracking-wider">V2.0 PRO</div>
          </div>

          {/* Datos del cliente + Detalles compactos (estilo Facturacion) */}
          <div className="bg-white border-b border-slate-200 grid grid-cols-12">
            {/* Izq: datos cliente */}
            <div className="col-span-8 p-2.5 border-r border-slate-200">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-black uppercase text-slate-700 tracking-wider">Datos del cliente</span>
                <span className="text-[10px] text-slate-400 italic">TECLA F3 PARA BUSCAR</span>
              </div>
              <div className="grid grid-cols-12 gap-x-3 gap-y-1.5 items-center text-xs">
                <Label className="col-span-2 text-[11px] font-bold text-slate-500 uppercase text-right">Cliente ID:</Label>
                <div className="col-span-4">
                  <Select value={currentPedido.cliente_id} onValueChange={val => setCurrentPedido(p => ({ ...p, cliente_id: val }))}>
                    <SelectTrigger className="h-7 border-slate-300 text-xs"><SelectValue placeholder="CÓDIGO DEL CLIENTE..." /></SelectTrigger>
                    <SelectContent>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Label className="col-span-1 text-[11px] font-bold text-slate-500 uppercase text-right">RNC:</Label>
                <div className="col-span-5">
                  <Input readOnly value={selectedCliente?.rnc || '000000000'} className="h-7 bg-slate-50 border-slate-300 text-xs font-mono" />
                </div>

                <Label className="col-span-2 text-[11px] font-bold text-slate-500 uppercase text-right">Nombre:</Label>
                <div className="col-span-10">
                  <Input
                    value={currentPedido.manual_cliente_nombre || ''}
                    onChange={e => setCurrentPedido(p => ({ ...p, manual_cliente_nombre: e.target.value }))}
                    className={`h-7 text-xs border-slate-300 uppercase ${isGenericClient ? 'bg-yellow-50' : 'bg-slate-50 opacity-70'}`}
                    placeholder={isGenericClient ? 'ESCRIBA NOMBRE O VEHICULO DEL CLIENTE...' : 'SOLO PARA CLIENTE GENERICO'}
                    disabled={!isGenericClient}
                  />
                </div>

                <Label className="col-span-2 text-[11px] font-bold text-slate-500 uppercase text-right">Dirección:</Label>
                <div className="col-span-7">
                  <Input readOnly value={selectedCliente?.direccion || 'N/A'} className="h-7 bg-slate-50 border-slate-300 text-xs" />
                </div>
                <Label className="col-span-1 text-[11px] font-bold text-slate-500 uppercase text-right">Tel:</Label>
                <div className="col-span-2">
                  <Input readOnly value={selectedCliente?.telefono || 'N/A'} className="h-7 bg-slate-50 border-slate-300 text-xs" />
                </div>
              </div>
            </div>

            {/* Der: detalles pedido */}
            <div className="col-span-4 p-2.5 bg-slate-50/50">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-black uppercase text-slate-700 tracking-wider">Detalles Pedido</span>
                <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded font-black">Nº {pedido?.numero || 'NUEVO'}</span>
              </div>
              <div className="grid grid-cols-12 gap-x-2 gap-y-1.5 items-center">
                <Label className="col-span-3 text-[11px] font-bold text-slate-500 uppercase text-right">Fecha:</Label>
                <div className="col-span-9">
                  <Input
                    value={format(new Date(currentPedido.fecha), 'dd/MM/yyyy')}
                    readOnly
                    className="h-7 bg-white border-slate-300 text-xs font-bold"
                  />
                </div>
                <Label className="col-span-3 text-[11px] font-bold text-slate-500 uppercase text-right">Vendedor:</Label>
                <div className="col-span-9">
                  <Select value={currentPedido.vendedor_id} onValueChange={val => setCurrentPedido(p => ({ ...p, vendedor_id: val }))}>
                    <SelectTrigger className="h-7 border-slate-300 text-xs"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                    <SelectContent>{vendedores.map(v => <SelectItem key={v.id} value={v.id}>{v.nombre}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Label className="col-span-3 text-[11px] font-bold text-slate-500 uppercase text-right">Placa:</Label>
                <div className="col-span-9">
                  <Input
                    value={currentPedido.placa_vehiculo || ''}
                    onChange={e => setCurrentPedido(p => ({ ...p, placa_vehiculo: e.target.value }))}
                    className="h-7 border-slate-300 text-xs uppercase"
                    placeholder="Placa / Vehículo"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Tabla compacta */}
          <div className="flex-grow overflow-hidden bg-white">
            <div className="h-full overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-slate-100 z-20 shadow-sm">
                    <TableRow className="border-b-2 border-slate-300 hover:bg-transparent">
                      <TableHead className="text-[11px] font-black uppercase text-slate-700 py-1.5 px-2 h-8">
                        <div className="flex items-center gap-1.5">
                          Código
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsProductSearchOpen(true)}
                            className="h-5 w-5 text-blue-600 hover:bg-blue-100"
                            title="Añadir Artículo [INS]"
                          >
                            <Search className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableHead>
                      <TableHead className="text-[11px] font-black uppercase text-slate-700 py-1.5 px-2">Descripción</TableHead>
                      <TableHead className="text-[11px] font-black uppercase text-slate-700 py-1.5 px-2">Ubicación</TableHead>
                      <TableHead className="text-[11px] font-black uppercase text-slate-700 py-1.5 px-2 text-center w-16">Cant.</TableHead>
                      <TableHead className="text-[11px] font-black uppercase text-slate-700 py-1.5 px-2 text-right w-20">Precio</TableHead>
                      <TableHead className="text-[11px] font-black uppercase text-slate-700 py-1.5 px-2 text-right w-20">Desc.</TableHead>
                      <TableHead className="text-[11px] font-black uppercase text-slate-700 py-1.5 px-2 text-right w-20">ITBIS</TableHead>
                      <TableHead className="text-[11px] font-black uppercase text-slate-700 py-1.5 px-2 text-right w-24">Importe</TableHead>
                      <TableHead className="w-8 py-1.5" />
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
                              if (profile?.role === 'admin' || profile?.role === 'owner') {
                                document.getElementById('ped-input-precio')?.focus();
                              } else {
                                document.getElementById('ped-input-descuento')?.focus();
                              }
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="p-1 border-r border-gray-300">
                        <Input
                          id="ped-input-precio"
                          type="number"
                          value={stagingItem?.precio || ''}
                          onChange={e => updateStagingItem('precio', e.target.value)}
                          className="h-7 text-xs text-right font-black text-blue-900 border-blue-600 focus:ring-0 bg-white"
                          onKeyDown={e => { if (e.key === 'Enter') document.getElementById('ped-input-descuento')?.focus(); }}
                          disabled={profile?.role !== 'admin' && profile?.role !== 'owner'}
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
                        {stagingItem ? (() => {
                          const itbis_pct = (stagingItem.itbis_pct || 18) > 1 ? (stagingItem.itbis_pct / 100) : (stagingItem.itbis_pct || 0.18);
                          const net = (stagingItem.precio * stagingItem.cantidad) - (stagingItem.descuento || 0);
                          const itbis = net - (net / (1 + itbis_pct));
                          return itbis.toFixed(2);
                        })() : '0.00'}
                      </TableCell>
                      <TableCell className="p-1 text-right font-black text-blue-900 bg-blue-100/30 border-r border-gray-300">
                        {stagingItem ? ((stagingItem.precio * stagingItem.cantidad) - (stagingItem.descuento || 0)).toFixed(2) : '0.00'}
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
                        <TableCell colSpan={9} className="h-64 text-center">
                          <div className="flex flex-col items-center justify-center text-slate-300 gap-2">
                            <ShoppingCart className="w-12 h-12 opacity-20" />
                            <p className="text-sm italic">No hay productos en este pedido</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : detalles.map((d, idx) => (
                      <TableRow key={d.producto_id} className={`group hover:bg-blue-50/40 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                        <TableCell className="font-mono text-xs font-bold text-slate-800 py-1 px-2">{d.codigo}</TableCell>
                        <TableCell className="text-xs font-medium text-slate-700 py-1 px-2">{d.descripcion}</TableCell>
                        <TableCell className="text-[11px] text-slate-500 py-1 px-2">{d.ubicacion}</TableCell>
                        <TableCell className="py-1 px-1"><Input type="number" value={d.cantidad} onChange={e => handleUpdateDetail(d.producto_id, 'cantidad', e.target.value)} className="h-6 text-xs text-center border-slate-200 focus:border-blue-400 font-bold px-1" /></TableCell>
                        <TableCell className="py-1 px-1">
                          <Input
                            type="number"
                            value={d.precio}
                            onChange={e => handleUpdateDetail(d.producto_id, 'precio', e.target.value)}
                            className="h-6 text-xs text-right border-slate-200 focus:border-blue-400 font-bold px-1"
                            disabled={profile?.role !== 'admin' && profile?.role !== 'owner'}
                          />
                        </TableCell>
                        <TableCell className="py-1 px-1">
                          <Input
                            type="number"
                            value={d.descuento}
                            onChange={e => handleUpdateDetail(d.producto_id, 'descuento', e.target.value)}
                            className="h-6 text-xs text-right border-slate-200 focus:border-blue-400 font-bold text-red-600 px-1"
                          />
                        </TableCell>
                        <TableCell className="text-right text-[11px] text-slate-600 font-medium py-1 px-2">{Number(d.itbis || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right font-bold text-blue-700 py-1 px-2">{Number(d.importe || 0).toFixed(2)}</TableCell>
                        <TableCell className="py-1 px-1">
                          <Button variant="ghost" size="icon" className="h-5 w-5 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleRemoveDetail(d.producto_id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
          </div>

          {/* Footer: 3 columnas (notas | resumen | total) + fila de botones */}
          <div className="border-t-2 border-slate-300 bg-white">
            {/* Fila superior: 3 columnas alineadas */}
            <div className="grid grid-cols-12 divide-x divide-slate-200">
              {/* Col 1: Notas */}
              <div className="col-span-5 p-3 flex items-start gap-2">
                <Tags className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
                <div className="flex-1">
                  <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Notas y comentarios</Label>
                  <Textarea
                    value={currentPedido.notas}
                    onChange={e => setCurrentPedido(p => ({ ...p, notas: e.target.value }))}
                    className="mt-1 min-h-[68px] text-xs border-slate-200 resize-none"
                    placeholder="Notas u observaciones del pedido..."
                  />
                </div>
              </div>

              {/* Col 2: Resumen (Sub-total / Descuento / Total ITBIS) */}
              <div className="col-span-4 p-3 bg-slate-50/40">
                <Label className="text-[10px] font-black uppercase text-slate-500 tracking-wider mb-2 block">Resumen</Label>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-700 uppercase tracking-wide text-xs">Sub-total</span>
                    <span className="font-mono font-bold text-emerald-700">{totals.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-600 uppercase tracking-wide text-xs">Descuento</span>
                    <span className="font-mono text-red-600">{totals.descuento_total.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-600 uppercase tracking-wide text-xs">Total ITBIS</span>
                    <span className="font-mono">{totals.itbis_total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Col 3: TOTAL FACTURA grande */}
              <div className="col-span-3 p-3 bg-red-50/30 flex flex-col items-end justify-center">
                <span className="text-xs font-black text-red-600 uppercase tracking-widest">Total Factura</span>
                <span className="font-mono font-black text-red-600 text-3xl tracking-tight leading-none mt-1">{montoTotal.toFixed(2)}</span>
              </div>
            </div>

            {/* Fila inferior: botones a la derecha */}
            <div className="bg-slate-100 border-t border-slate-300 px-3 py-2 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={onClose} className="h-10 px-5 border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-200">
                <X className="w-4 h-4 mr-2" /> ESC - Salir
              </Button>
              <Button onClick={handleSave} disabled={isSubmitting} className="h-10 px-5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm shadow-md">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><FileDown className="w-4 h-4 mr-2" /> F10 - Grabar</>}
              </Button>
            </div>
          </div>

        </DialogContent>
      </Dialog>
    </>
  );
};


const PedidosPage = () => {
  const { toast } = useToast();
  const { empresa } = useAuth();
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
  const { openPanel, activePanel } = usePanels();

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
      return true;
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al guardar', description: error.message });
      return false;
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
    // Solo responder si el panel activo es 'pedidos'
    if (activePanel !== 'pedidos') return;

    // No procesar atajos de la tabla/página si hay algún modal abierto
    if (document.querySelector('[role="dialog"]')) return;

    // Si el usuario está escribiendo en cualquier input, no procesar estas teclas globales
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key.toLowerCase() === 'insert') { e.preventDefault(); setEditingPedido(null); setIsModalOpen(true); }
    if (e.key === 'Enter' && selectedPedido) { e.preventDefault(); setEditingPedido(selectedPedido); setIsModalOpen(true); }
    if (e.key.toLowerCase() === 'delete' && selectedPedido) { e.preventDefault(); document.getElementById('delete-trigger')?.click(); }
    if (e.key === 'F5' && selectedPedido) { e.preventDefault(); handleEnviarAFacturacion(); }
  }, [selectedPedido, detalles, handleEnviarAFacturacion, activePanel]);

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
      <Helmet><title>Pedidos — {empresa?.nombre || 'Sistema'}</title></Helmet>
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