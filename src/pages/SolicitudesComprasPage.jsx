import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Edit, Trash2, Send, FileDown, RefreshCw, X, Loader2, Search, User, Bike, Calculator, DollarSign, Calendar as CalendarIcon, ClipboardList } from 'lucide-react';
import { format } from 'date-fns';
import { formatInTimeZone, getCurrentDateInTimeZone, formatDateForSupabase } from '@/lib/dateUtils';
import ProductSearchModal from '@/components/ventas/ProductSearchModal';
import { usePanels } from '@/contexts/PanelContext';

// ── Formulario de Solicitud ──
const SolicitudFormModal = ({ isOpen, onClose, solicitud, onSave, clientes, vendedores }) => {
  const { toast } = useToast();
  const { profile, tenantId } = useAuth();
  const [isProductSearchOpen, setIsProductSearchOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const empty = {
    cliente_id: '',
    cliente_nombre: '',
    vendedor_id: vendedores.length > 0 ? vendedores[0].id : '',
    fecha: getCurrentDateInTimeZone(),
    producto_id: null,
    chasis: '',
    motor: '',
    marca: '',
    modelo: '',
    color: '',
    anio: '',
    condicion: 'NUEVA',
    valor_contado: 0,
    inicial: 0,
    financiamiento: 0,
    adicional: 0,
    tiempo_meses: 12,
    tasa_interes: 0,
    total_pagares: 0,
    cuota_mensual: 0,
    fecha_vencimiento: '',
    incluye_placa: false,
    notas: '',
  };

  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (solicitud) {
      setForm({
        ...empty,
        ...solicitud,
        fecha: solicitud.fecha || getCurrentDateInTimeZone(),
        fecha_vencimiento: solicitud.fecha_vencimiento || '',
      });
    } else {
      setForm(empty);
    }
  }, [solicitud, isOpen]);

  // ── Auto-cálculos de financiamiento ──
  useEffect(() => {
    const valor = parseFloat(form.valor_contado) || 0;
    const inic = parseFloat(form.inicial) || 0;
    const adic = parseFloat(form.adicional) || 0;
    const tasa = parseFloat(form.tasa_interes) || 0;
    const meses = parseInt(form.tiempo_meses) || 0;

    const montoFinanciado = valor - inic + adic;
    let totalPagares = 0;
    let cuota = 0;

    if (meses > 0 && montoFinanciado > 0) {
      if (tasa > 0) {
        // Fórmula PMT (amortización francesa)
        const tasaMensual = tasa / 100 / 12;
        cuota = montoFinanciado * tasaMensual / (1 - Math.pow(1 + tasaMensual, -meses));
        totalPagares = cuota * meses;
      } else {
        // Sin interés
        totalPagares = montoFinanciado;
        cuota = montoFinanciado / meses;
      }
    }

    setForm(prev => ({
      ...prev,
      financiamiento: Math.round(montoFinanciado * 100) / 100,
      total_pagares: Math.round(totalPagares * 100) / 100,
      cuota_mensual: Math.round(cuota * 100) / 100,
    }));
  }, [form.valor_contado, form.inicial, form.adicional, form.tasa_interes, form.tiempo_meses]);

  // ── Seleccionar producto (motocicleta) ──
  const handleSelectProduct = async (product) => {
    // Obtener nombre de marca y modelo desde catálogos
    let marcaNombre = '';
    let modeloNombre = '';

    if (product.marca_id) {
      const { data: m } = await supabase.from('marcas').select('nombre').eq('id', product.marca_id).maybeSingle();
      marcaNombre = m?.nombre || '';
    }

    if (product.modelos_ids?.length > 0) {
      const { data: mods } = await supabase.from('modelos').select('nombre').in('id', product.modelos_ids);
      modeloNombre = mods?.map(m => m.nombre).join(', ') || '';
    }

    // Obtener precio de la presentación principal
    let precio = parseFloat(product.precio) || 0;
    if (product.presentaciones?.length > 0) {
      const main = product.presentaciones.find(p => p.afecta_ft) || product.presentaciones[0];
      precio = parseFloat(main?.precio1) || precio;
    }

    setForm(prev => ({
      ...prev,
      producto_id: product.id,
      chasis: product.chasis || '',
      motor: product.motor || '',
      marca: marcaNombre,
      modelo: modeloNombre,
      color: product.color || '',
      anio: product.anio || '',
      condicion: product.condicion || 'NUEVA',
      valor_contado: precio,
    }));

    setIsProductSearchOpen(false);
  };

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const selectedCliente = useMemo(
    () => clientes.find(c => c.id === form.cliente_id),
    [clientes, form.cliente_id]
  );

  const handleSave = async () => {
    if (!form.cliente_id && !form.cliente_nombre?.trim()) {
      toast({ variant: 'destructive', title: 'Datos incompletos', description: 'Debe seleccionar un cliente o escribir un nombre.' });
      return;
    }
    if (!form.vendedor_id) {
      toast({ variant: 'destructive', title: 'Datos incompletos', description: 'Debe seleccionar un vendedor.' });
      return;
    }
    if (!form.producto_id) {
      toast({ variant: 'destructive', title: 'Datos incompletos', description: 'Debe seleccionar un vehículo del inventario.' });
      return;
    }

    setIsSubmitting(true);
    const success = await onSave({
      ...(solicitud?.id ? { id: solicitud.id } : {}),
      cliente_id: form.cliente_id || null,
      cliente_nombre: form.cliente_nombre || selectedCliente?.nombre || '',
      vendedor_id: form.vendedor_id,
      fecha: formatDateForSupabase(form.fecha),
      producto_id: form.producto_id,
      chasis: form.chasis,
      motor: form.motor,
      marca: form.marca,
      modelo: form.modelo,
      color: form.color,
      anio: form.anio ? parseInt(form.anio) : null,
      condicion: form.condicion,
      valor_contado: parseFloat(form.valor_contado) || 0,
      inicial: parseFloat(form.inicial) || 0,
      financiamiento: parseFloat(form.financiamiento) || 0,
      adicional: parseFloat(form.adicional) || 0,
      tiempo_meses: parseInt(form.tiempo_meses) || 0,
      tasa_interes: parseFloat(form.tasa_interes) || 0,
      total_pagares: parseFloat(form.total_pagares) || 0,
      cuota_mensual: parseFloat(form.cuota_mensual) || 0,
      fecha_vencimiento: form.fecha_vencimiento || null,
      incluye_placa: form.incluye_placa,
      notas: form.notas || '',
    });
    setIsSubmitting(false);
    if (success) onClose();
  };

  // ── Atajos de teclado dentro del modal ──
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'F10') { e.preventDefault(); handleSave(); }
      if (e.key === 'Escape' && !isProductSearchOpen) { e.preventDefault(); onClose(); }
      if (e.key === 'F9') { e.preventDefault(); setIsProductSearchOpen(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, isProductSearchOpen, handleSave]);

  if (!isOpen) return null;

  return (
    <>
      <ProductSearchModal isOpen={isProductSearchOpen} onClose={() => setIsProductSearchOpen(false)} onSelectProduct={handleSelectProduct} />
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-[95vw] w-[1200px] h-[95vh] flex flex-col p-0 gap-0 overflow-hidden bg-slate-50 border-none shadow-2xl">

          {/* Header */}
          <div className="bg-[#a3c2f0] py-1 px-4 flex justify-between items-center border-b border-blue-300">
            <h2 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <ClipboardList className="w-5 h-5" /> SOLICITUD DE COMPRA
            </h2>
            <div className="flex items-center gap-4">
              <div className="bg-white/80 backdrop-blur px-3 py-0.5 rounded border border-blue-400 flex items-center gap-2 shadow-sm">
                <span className="text-xs font-bold text-slate-500 uppercase">Número:</span>
                <span className="text-sm font-mono font-bold text-blue-700">{solicitud?.numero || 'NUEVO'}</span>
              </div>
              <div className="bg-white/80 backdrop-blur px-3 py-0.5 rounded border border-blue-400 flex items-center gap-2 shadow-sm">
                <span className="text-xs font-bold text-slate-500 uppercase">Fecha:</span>
                <span className="text-sm font-bold text-slate-700">{format(new Date(form.fecha), 'dd/MM/yyyy')}</span>
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
              <Select value={form.vendedor_id} onValueChange={val => updateField('vendedor_id', val)}>
                <SelectTrigger className="h-8 border-slate-200 bg-slate-50/50 focus:ring-blue-500"><SelectValue placeholder="Seleccione..." /></SelectTrigger>
                <SelectContent>{vendedores.map(v => <SelectItem key={v.id} value={v.id}>{v.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <span className="text-[10px] text-slate-400 animate-pulse font-medium italic">F10 para guardar &bull; ESC para salir &bull; F9 buscar vehículo</span>
          </div>

          {/* Main Content - Scrollable */}
          <div className="flex-grow overflow-y-auto p-4 space-y-4">

            {/* Datos del Cliente */}
            <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
              <h3 className="text-[10px] font-extrabold text-blue-800 uppercase mb-3 flex items-center gap-1.5 opacity-70 border-b pb-1.5">
                <User className="w-3 h-3" /> Datos del Cliente
              </h3>
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-5 space-y-1">
                  <Label className="text-[10px] font-bold text-slate-500 uppercase">Cliente</Label>
                  <Select value={form.cliente_id} onValueChange={val => updateField('cliente_id', val)}>
                    <SelectTrigger className="h-8 border-slate-200"><SelectValue placeholder="Seleccione cliente..." /></SelectTrigger>
                    <SelectContent>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-4 space-y-1">
                  <Label className="text-[10px] font-bold text-slate-500 uppercase">Nombre Manual</Label>
                  <Input value={form.cliente_nombre} onChange={e => updateField('cliente_nombre', e.target.value)} className="h-8 text-xs" placeholder="O escriba nombre..." />
                </div>
                <div className="col-span-3 space-y-1">
                  <Label className="text-[10px] font-bold text-slate-500 uppercase">RNC / Cédula</Label>
                  <Input readOnly value={selectedCliente?.rnc || ''} className="h-8 bg-slate-50 text-xs font-mono" />
                </div>
              </div>
            </div>

            {/* Datos del Vehículo */}
            <div className="bg-white p-4 rounded-lg border border-amber-200 shadow-sm">
              <div className="flex justify-between items-center mb-3 border-b pb-1.5">
                <h3 className="text-[10px] font-extrabold text-amber-800 uppercase flex items-center gap-1.5">
                  <Bike className="w-3 h-3" /> Datos del Vehículo
                </h3>
                <Button size="sm" variant="outline" onClick={() => setIsProductSearchOpen(true)} className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50">
                  <Search className="w-3 h-3 mr-1" /> Buscar Vehículo [F9]
                </Button>
              </div>

              {!form.producto_id ? (
                <div className="text-center py-8 text-slate-400">
                  <Bike className="w-12 h-12 mx-auto mb-2 opacity-20" />
                  <p className="text-sm italic">Presione F9 o el botón para buscar un vehículo del inventario</p>
                </div>
              ) : (
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-6 space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Chasis</Label>
                    <Input value={form.chasis} onChange={e => updateField('chasis', e.target.value.toUpperCase())} className="h-8 text-xs font-mono font-bold bg-amber-50" />
                  </div>
                  <div className="col-span-6 space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Motor</Label>
                    <Input value={form.motor} onChange={e => updateField('motor', e.target.value.toUpperCase())} className="h-8 text-xs font-mono font-bold bg-amber-50" />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Marca</Label>
                    <Input value={form.marca} readOnly className="h-8 text-xs bg-slate-50 font-semibold" />
                  </div>
                  <div className="col-span-3 space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Modelo</Label>
                    <Input value={form.modelo} readOnly className="h-8 text-xs bg-slate-50 font-semibold" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Color</Label>
                    <Input value={form.color} onChange={e => updateField('color', e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Año</Label>
                    <Input type="number" value={form.anio} onChange={e => updateField('anio', e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Condición</Label>
                    <Select value={form.condicion} onValueChange={val => updateField('condicion', val)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NUEVA">NUEVA</SelectItem>
                        <SelectItem value="USADA">USADA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {/* Opciones de Préstamos / Financiamiento */}
            <div className="bg-white p-4 rounded-lg border border-green-200 shadow-sm">
              <h3 className="text-[10px] font-extrabold text-green-800 uppercase mb-3 flex items-center gap-1.5 border-b pb-1.5">
                <Calculator className="w-3 h-3" /> Opciones de Préstamos
              </h3>
              <div className="grid grid-cols-12 gap-4">
                {/* Columna izquierda - Inputs */}
                <div className="col-span-7 grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Valor al Contado RD$</Label>
                    <Input type="number" value={form.valor_contado} onChange={e => updateField('valor_contado', e.target.value)} className="h-9 text-sm font-bold text-green-800 bg-green-50 border-green-300" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Inicial RD$</Label>
                    <Input type="number" value={form.inicial} onChange={e => updateField('inicial', e.target.value)} className="h-9 text-sm font-bold" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Adicional RD$</Label>
                    <Input type="number" value={form.adicional} onChange={e => updateField('adicional', e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Tiempo (Meses)</Label>
                    <Input type="number" value={form.tiempo_meses} onChange={e => updateField('tiempo_meses', e.target.value)} className="h-9 text-sm" min="1" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Tasa de Interés %</Label>
                    <Input type="number" step="0.01" value={form.tasa_interes} onChange={e => updateField('tasa_interes', e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase">Vencimiento 1ra Cuota</Label>
                    <Input type="date" value={form.fecha_vencimiento} onChange={e => updateField('fecha_vencimiento', e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div className="col-span-2 flex items-center gap-2 pt-1">
                    <Checkbox checked={form.incluye_placa} onCheckedChange={val => updateField('incluye_placa', val)} id="incluye_placa" />
                    <Label htmlFor="incluye_placa" className="text-xs font-bold text-slate-600 cursor-pointer">INCLUYE PLACA</Label>
                  </div>
                </div>

                {/* Columna derecha - Resumen calculado */}
                <div className="col-span-5 bg-gradient-to-br from-slate-50 to-green-50 rounded-lg p-4 border border-green-100 flex flex-col justify-center space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">Financiamiento:</span>
                    <span className="font-mono font-bold text-slate-700">RD$ {(parseFloat(form.financiamiento) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="h-px bg-green-200" />
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">Total de Pagarés:</span>
                    <span className="font-mono font-bold text-slate-700">RD$ {(parseFloat(form.total_pagares) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="h-px bg-green-200" />
                  <div className="flex justify-between items-end pt-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cuota Mensual</span>
                    <div className="text-right">
                      <span className="text-[10px] block text-green-600 font-bold -mb-1">A RD$</span>
                      <span className="text-2xl font-black text-green-700 font-mono tracking-tighter">
                        {(parseFloat(form.cuota_mensual) || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Notas */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
              <Label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Notas y Observaciones</Label>
              <Textarea value={form.notas} onChange={e => updateField('notas', e.target.value)} className="min-h-[50px] text-xs resize-none" placeholder="Notas adicionales..." />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="bg-[#f0f4f8] p-3 border-t border-slate-200 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} className="h-10 px-6 font-bold uppercase text-[11px] tracking-widest">
              <X className="w-4 h-4 mr-2" /> Cancelar [ESC]
            </Button>
            <Button onClick={handleSave} disabled={isSubmitting} className="h-10 px-8 bg-blue-900 hover:bg-blue-950 text-white font-bold uppercase text-[11px] tracking-widest shadow-md">
              {isSubmitting ? <Loader2 className="animate-spin" /> : <><Send className="w-4 h-4 mr-2" /> Guardar [F10]</>}
            </Button>
          </div>

        </DialogContent>
      </Dialog>
    </>
  );
};


// ── Página Principal ──
const SolicitudesComprasPage = () => {
  const { toast } = useToast();
  const { empresa, tenantId, profile } = useAuth();
  const [solicitudes, setSolicitudes] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [selectedSolicitud, setSelectedSolicitud] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSolicitud, setEditingSolicitud] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const { activePanel } = usePanels();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [solRes, cliRes, venRes] = await Promise.all([
      supabase
        .from('solicitudes_compras')
        .select('*')
        .eq('estado', 'Pendiente')
        .order('fecha', { ascending: false }),
      supabase.from('clientes').select('*').eq('activo', true),
      supabase.from('vendedores').select('id, nombre').eq('activo', true).order('nombre'),
    ]);
    if (solRes.error) toast({ variant: 'destructive', title: 'Error', description: 'No se pudieron cargar las solicitudes.' });
    else setSolicitudes(solRes.data);
    setClientes(cliRes.data || []);
    setVendedores(venRes.data || []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaveSolicitud = async (data) => {
    try {
      const payload = {
        ...data,
        tenant_id: tenantId,
      };

      if (data.id) {
        const { id, ...updateData } = payload;
        const { error } = await supabase.from('solicitudes_compras').update(updateData).eq('id', id);
        if (error) throw error;
      } else {
        delete payload.id;
        const { error } = await supabase.from('solicitudes_compras').insert(payload);
        if (error) throw error;
      }

      toast({ title: 'Éxito', description: 'Solicitud guardada correctamente.' });
      fetchData();
      return true;
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al guardar', description: error.message });
      return false;
    }
  };

  const handleAnular = async () => {
    if (!selectedSolicitud) return;
    try {
      await supabase.from('solicitudes_compras').update({ estado: 'Anulada' }).eq('id', selectedSolicitud.id);
      toast({ title: 'Solicitud Anulada', description: `La solicitud #${selectedSolicitud.numero} ha sido anulada.` });
      fetchData();
      setSelectedSolicitud(null);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error al anular', description: error.message });
    }
  };

  const handleAprobar = async () => {
    if (!selectedSolicitud) return;
    try {
      await supabase.from('solicitudes_compras').update({ estado: 'Aprobada' }).eq('id', selectedSolicitud.id);
      toast({ title: 'Solicitud Aprobada', description: `La solicitud #${selectedSolicitud.numero} ha sido aprobada.` });
      fetchData();
      setSelectedSolicitud(null);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  // ── Atajos de teclado de la página ──
  const handleKeyDown = useCallback((e) => {
    if (activePanel !== 'solicitudes-compras') return;
    if (document.querySelector('[role="dialog"]')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.key.toLowerCase() === 'insert') { e.preventDefault(); setEditingSolicitud(null); setIsModalOpen(true); }
    if (e.key === 'Enter' && selectedSolicitud) { e.preventDefault(); setEditingSolicitud(selectedSolicitud); setIsModalOpen(true); }
    if (e.key.toLowerCase() === 'delete' && selectedSolicitud) { e.preventDefault(); document.getElementById('sol-delete-trigger')?.click(); }
    if (e.key === 'F5' && selectedSolicitud) { e.preventDefault(); handleAprobar(); }
  }, [selectedSolicitud, activePanel, handleAprobar]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const filteredSolicitudes = useMemo(() => {
    if (!searchTerm) return solicitudes;
    const term = searchTerm.toLowerCase();
    return solicitudes.filter(s =>
      s.numero?.toString().includes(term) ||
      s.cliente_nombre?.toLowerCase().includes(term) ||
      s.marca?.toLowerCase().includes(term) ||
      s.modelo?.toLowerCase().includes(term) ||
      s.chasis?.toLowerCase().includes(term)
    );
  }, [solicitudes, searchTerm]);

  return (
    <>
      <Helmet><title>Solicitudes de Compras — {empresa?.nombre || 'Sistema'}</title></Helmet>
      <SolicitudFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        solicitud={editingSolicitud}
        onSave={handleSaveSolicitud}
        clientes={clientes}
        vendedores={vendedores}
      />

      <div className="h-full flex flex-col p-4 bg-gray-50 space-y-4">
        {/* Header */}
        <div className="bg-white p-4 rounded-lg shadow-sm border flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-800 flex items-center gap-2">
            <ClipboardList className="w-6 h-6" /> Solicitudes de Compras
          </h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por #, cliente, marca, chasis..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-8 w-72" />
            </div>
            <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Grid principal */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 flex-grow min-h-0">
          {/* Tabla de solicitudes */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            <div className="bg-white p-2 rounded-lg shadow-sm border flex-grow min-h-0">
              <div className="h-full overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-gray-100">
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>#</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Chasis</TableHead>
                      <TableHead>Condición</TableHead>
                      <TableHead className="text-right">Valor RD$</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan="9" className="text-center"><Loader2 className="mx-auto my-4 h-6 w-6 animate-spin" /></TableCell></TableRow>
                    ) : filteredSolicitudes.length === 0 ? (
                      <TableRow><TableCell colSpan="9" className="text-center text-slate-400 py-8">No hay solicitudes pendientes</TableCell></TableRow>
                    ) : filteredSolicitudes.map(s => (
                      <TableRow
                        key={s.id}
                        onClick={() => setSelectedSolicitud(s)}
                        onDoubleClick={() => { if (s.estado === 'Pendiente') { setEditingSolicitud(s); setIsModalOpen(true); } }}
                        className={`cursor-pointer ${selectedSolicitud?.id === s.id ? 'bg-blue-100' : ''}`}
                      >
                        <TableCell>{s.fecha ? formatInTimeZone(new Date(s.fecha), 'dd/MM/yyyy') : '---'}</TableCell>
                        <TableCell className="font-mono font-bold">{s.numero}</TableCell>
                        <TableCell>{s.cliente_nombre}</TableCell>
                        <TableCell className="font-semibold">{s.marca}</TableCell>
                        <TableCell>{s.modelo}</TableCell>
                        <TableCell className="font-mono text-xs">{s.chasis}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${s.condicion === 'NUEVA' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                            {s.condicion}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{Number(s.valor_contado || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-700">{s.estado}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Detalle de la solicitud seleccionada */}
            {selectedSolicitud && (
              <div className="bg-white p-4 rounded-lg shadow-sm border">
                <h2 className="text-sm font-bold text-blue-800 mb-3">Detalle Solicitud #{selectedSolicitud.numero}</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 font-bold uppercase block">Chasis</span>
                    <span className="font-mono font-bold">{selectedSolicitud.chasis || '---'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase block">Motor</span>
                    <span className="font-mono font-bold">{selectedSolicitud.motor || '---'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase block">Marca / Modelo</span>
                    <span className="font-semibold">{selectedSolicitud.marca} {selectedSolicitud.modelo}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase block">Color / Año</span>
                    <span className="font-semibold">{selectedSolicitud.color || '---'} / {selectedSolicitud.anio || '---'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase block">Valor Contado</span>
                    <span className="font-bold text-green-700">RD$ {Number(selectedSolicitud.valor_contado || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase block">Inicial</span>
                    <span className="font-bold">RD$ {Number(selectedSolicitud.inicial || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase block">Financiamiento</span>
                    <span className="font-bold">RD$ {Number(selectedSolicitud.financiamiento || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase block">Cuota Mensual</span>
                    <span className="font-bold text-blue-700">RD$ {Number(selectedSolicitud.cuota_mensual || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase block">Tiempo</span>
                    <span className="font-semibold">{selectedSolicitud.tiempo_meses || 0} meses</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase block">Tasa Interés</span>
                    <span className="font-semibold">{selectedSolicitud.tasa_interes || 0}%</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase block">Total Pagarés</span>
                    <span className="font-bold">RD$ {Number(selectedSolicitud.total_pagares || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold uppercase block">Incluye Placa</span>
                    <span className="font-semibold">{selectedSolicitud.incluye_placa ? 'SÍ' : 'NO'}</span>
                  </div>
                </div>
                {selectedSolicitud.notas && (
                  <div className="mt-2 pt-2 border-t">
                    <span className="text-slate-400 font-bold uppercase text-[10px] block">Notas</span>
                    <span className="text-xs text-slate-600">{selectedSolicitud.notas}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Panel de acciones */}
          <div className="bg-white p-4 rounded-lg shadow-sm border space-y-2 flex flex-col">
            <h2 className="text-lg font-bold text-center mb-2">Acciones</h2>
            <Button onClick={() => { setEditingSolicitud(null); setIsModalOpen(true); }} className="w-full justify-between">
              <span>INS - Nueva Solicitud</span><Plus />
            </Button>
            <Button
              onClick={() => { if (selectedSolicitud) { setEditingSolicitud(selectedSolicitud); setIsModalOpen(true); } }}
              disabled={!selectedSolicitud || selectedSolicitud.estado !== 'Pendiente'}
              className="w-full justify-between"
            >
              <span>ENTER - Modificar</span><Edit />
            </Button>
            <Button
              onClick={handleAprobar}
              disabled={!selectedSolicitud || selectedSolicitud.estado !== 'Pendiente'}
              className="w-full justify-between bg-green-600 hover:bg-green-700"
            >
              <span>F5 - Aprobar Solicitud</span><Send />
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button id="sol-delete-trigger" variant="destructive" disabled={!selectedSolicitud || selectedSolicitud.estado !== 'Pendiente'} className="w-full justify-between">
                  <span>DEL - Anular</span><Trash2 />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Anular Solicitud?</AlertDialogTitle>
                  <AlertDialogDescription>Esta acción no se puede deshacer. La solicitud #{selectedSolicitud?.numero} será anulada.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleAnular}>Confirmar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <div className="flex-grow" />

            <Button variant="outline" disabled={!selectedSolicitud} className="w-full justify-between" onClick={() => toast({ title: 'Próximamente', description: 'Impresión de solicitud en desarrollo.' })}>
              <span>Imprimir Solicitud</span><FileDown />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default SolicitudesComprasPage;
