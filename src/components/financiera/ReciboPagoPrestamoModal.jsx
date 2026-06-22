import React, { useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Search } from 'lucide-react';
import ClienteSearchModal from '@/components/ventas/ClienteSearchModal';
import { distribuirAbono, round2 } from './amortizacion';

const fmt = (v) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);

const FORMAS = ['Efectivo', 'Cheque', 'Tarjeta'];

const ReciboPagoPrestamoModal = ({ isOpen, onClose }) => {
  const { toast } = useToast();
  const [cliente, setCliente] = useState(null);
  const [buscarOpen, setBuscarOpen] = useState(false);
  const [estado, setEstado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [monto, setMonto] = useState('');
  const [forma, setForma] = useState('Efectivo');
  const [cuenta, setCuenta] = useState('');
  const [banco, setBanco] = useState('');
  const [comentarios, setComentarios] = useState('');

  const cargarEstado = async (clienteId) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_prestamos_cliente', { p_cliente_id: clienteId });
      if (error) throw error;
      setEstado(data);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo cargar el estado', description: e.message });
      setEstado(null);
    }
    setLoading(false);
  };

  const seleccionarCliente = (c) => {
    setCliente(c);
    setBuscarOpen(false);
    setMonto('');
    setComentarios('');
    cargarEstado(c.id);
  };

  const cuotas = estado?.cuotas || [];
  const balanceAnterior = Number(estado?.balance_total) || 0;
  const montoNum = round2(Number(monto) || 0);
  const balanceActual = Math.max(round2(balanceAnterior - montoNum), 0);
  const cuotasConAbono = useMemo(() => distribuirAbono(cuotas, montoNum), [cuotas, montoNum]);

  const limpiar = () => {
    setCliente(null); setEstado(null); setMonto(''); setForma('Efectivo');
    setCuenta(''); setBanco(''); setComentarios('');
  };

  const handleGrabar = async () => {
    if (!cliente?.id) { toast({ variant: 'destructive', title: 'Selecciona un cliente' }); return; }
    if (!(montoNum > 0)) { toast({ variant: 'destructive', title: 'Ingresa el monto pagado' }); return; }
    if (montoNum > balanceAnterior + 0.01) {
      toast({ variant: 'destructive', title: 'El monto excede el balance pendiente' });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('registrar_pago_prestamo', {
        p_cliente_id: cliente.id,
        p_monto: montoNum,
        p_forma_pago: forma,
        p_cuenta: cuenta || null,
        p_banco: banco || null,
        p_comentarios: comentarios || null,
        p_fecha: null,
      });
      if (error) throw error;
      toast({ title: 'Pago registrado', description: `Recibo ${data?.numero} · Total ${fmt(data?.total_pagado)}` });
      setMonto(''); setComentarios('');
      await cargarEstado(cliente.id);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo registrar el pago', description: e.message });
    }
    setSaving(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose(false)}>
      <DialogContent className="max-w-4xl max-h-[94vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-blue-700">RECIBO DE PAGO</DialogTitle>
        </DialogHeader>

        {/* Cliente + forma de pago */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2 space-y-1.5">
            <Label>Cliente</Label>
            <div className="flex gap-2">
              <Input readOnly value={cliente ? `${cliente.codigo || ''} ${cliente.nombre}`.trim() : ''} placeholder="Selecciona un cliente" />
              <Button type="button" variant="outline" onClick={() => setBuscarOpen(true)}><Search className="w-4 h-4 mr-1" />Buscar</Button>
            </div>
            {cliente && (
              <p className="text-xs text-slate-500">{cliente.direccion || ''} {cliente.telefono ? `· ${cliente.telefono}` : ''}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Forma de Pago</Label>
            <div className="flex gap-3 text-sm pt-2">
              {FORMAS.map((f) => (
                <label key={f} className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="forma" checked={forma === f} onChange={() => setForma(f)} />
                  {f}
                </label>
              ))}
            </div>
          </div>
        </div>

        {forma !== 'Efectivo' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Cta. Número</Label><Input value={cuenta} onChange={(e) => setCuenta(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Banco</Label><Input value={banco} onChange={(e) => setBanco(e.target.value)} /></div>
          </div>
        )}

        {/* Tabla de cuotas */}
        <div className="border rounded-md">
          <div className="px-3 py-2 bg-slate-50 border-b text-xs font-bold text-slate-600">Cuotas pendientes</div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white border-b text-slate-500">
                <tr>
                  <th className="text-left p-2">Vence</th>
                  <th className="text-left p-2">Referencia</th>
                  <th className="text-right p-2">Cuota</th>
                  <th className="text-right p-2">Mora</th>
                  <th className="text-right p-2">Pendiente</th>
                  <th className="text-right p-2">Abono</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={6} className="p-3 text-center text-slate-400">Cargando…</td></tr>}
                {!loading && cliente && cuotasConAbono.length === 0 && (
                  <tr><td colSpan={6} className="p-3 text-center text-slate-400">Sin cuotas pendientes.</td></tr>
                )}
                {!loading && !cliente && (
                  <tr><td colSpan={6} className="p-3 text-center text-slate-400">Selecciona un cliente.</td></tr>
                )}
                {cuotasConAbono.map((c) => (
                  <tr key={c.cuota_id} className={`border-b last:border-0 ${c.vencida ? 'bg-red-50' : ''}`}>
                    <td className="p-2">{c.fecha_vencimiento}</td>
                    <td className="p-2">{c.prestamo_numero} · {c.referencia}</td>
                    <td className="p-2 text-right">{fmt(c.monto_cuota)}</td>
                    <td className="p-2 text-right text-red-600">{fmt(c.mora_pend)}</td>
                    <td className="p-2 text-right">{fmt(c.pendiente)}</td>
                    <td className="p-2 text-right font-semibold text-emerald-700">{fmt(c.abono)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totales + monto */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="text-xs space-y-1 border rounded-md p-3 bg-slate-50">
            <div className="font-bold text-slate-600 mb-1">Otras Informaciones</div>
            <div className="flex justify-between"><span>Capital Pendiente</span><b>{fmt(estado?.capital_pendiente)}</b></div>
            <div className="flex justify-between"><span>Intereses Pendientes</span><b>{fmt(estado?.intereses_pendientes)}</b></div>
            <div className="flex justify-between"><span>Mora Pendiente</span><b className="text-red-600">{fmt(estado?.mora_pendiente)}</b></div>
          </div>
          <div className="space-y-2">
            <div className="space-y-1.5">
              <Label>Monto Pagado</Label>
              <Input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0.00" className="text-right font-bold text-lg" />
            </div>
            <div className="text-xs space-y-1 px-1">
              <div className="flex justify-between"><span>Balance Anterior</span><b>{fmt(balanceAnterior)}</b></div>
              <div className="flex justify-between"><span>Total Pagado</span><b>{fmt(montoNum)}</b></div>
              <div className="flex justify-between text-red-600"><span>Balance Actual</span><b>{fmt(balanceActual)}</b></div>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Comentarios</Label>
          <Input value={comentarios} onChange={(e) => setComentarios(e.target.value)} />
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => { limpiar(); onClose(false); }}>Salir</Button>
          <Button type="button" onClick={handleGrabar} disabled={saving || !cliente}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Grabar
          </Button>
        </DialogFooter>
      </DialogContent>

      <ClienteSearchModal
        isOpen={buscarOpen}
        onClose={() => setBuscarOpen(false)}
        onSelectCliente={seleccionarCliente}
      />
    </Dialog>
  );
};

export default ReciboPagoPrestamoModal;
