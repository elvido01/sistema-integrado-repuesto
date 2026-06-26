import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, X, Search } from 'lucide-react';
import ClienteSearchModal from '@/components/ventas/ClienteSearchModal';

const fmt = (v) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);
const hoy = () => new Date().toISOString().slice(0, 10);

// Texto del Monto con separador de miles y decimales (igual que Recibo de Pago)
const fmtMontoInput = (raw) => {
  if (raw === '' || raw == null) return '';
  const [ip, dp] = String(raw).split('.');
  const intFmt = ip ? Number(ip).toLocaleString('en-US') : '0';
  return dp !== undefined ? `${intFmt}.${dp}` : intFmt;
};

// Listas fijas (ampliadas) del modulo
const TIPOS = ['CARGO POR ABOGADOS', 'GASTOS DE COBRO', 'GASTOS LEGALES', 'OTROS'];
const CONCEPTOS = ['INTERÉS O MORAS', 'GASTOS', 'OTROS'];

const OtrasTransaccionesModal = ({ isOpen, onClose, clientePreseleccionado = null }) => {
  const { toast } = useToast();

  const [cliente, setCliente] = useState(null);
  const [codigoInput, setCodigoInput] = useState('');
  const [buscarOpen, setBuscarOpen] = useState(false);
  const [tipo, setTipo] = useState(TIPOS[0]);
  const [concepto, setConcepto] = useState(CONCEPTOS[0]);
  const [fecha, setFecha] = useState(hoy());
  const [descripcion, setDescripcion] = useState('');
  const [montoText, setMontoText] = useState('');
  const [balanceAnt, setBalanceAnt] = useState(0);
  const [imprimir, setImprimir] = useState(true);
  const [saving, setSaving] = useState(false);

  const monto = Number(montoText) || 0;
  const balanceActual = Math.round((balanceAnt + monto) * 100) / 100;

  const cargarBalance = useCallback(async (clienteId) => {
    try {
      const { data, error } = await supabase.rpc('get_prestamos_cliente', { p_cliente_id: clienteId });
      if (error) throw error;
      setBalanceAnt(Number(data?.balance_total) || 0);
    } catch {
      setBalanceAnt(0);
    }
  }, []);

  const reset = useCallback(() => {
    setCliente(null); setCodigoInput(''); setTipo(TIPOS[0]); setConcepto(CONCEPTOS[0]);
    setFecha(hoy()); setDescripcion(''); setMontoText(''); setBalanceAnt(0);
  }, []);

  // Al abrir: si llega un cliente preseleccionado (desde Recibo de Pago), cargarlo
  useEffect(() => {
    if (!isOpen) return;
    if (clientePreseleccionado?.id) {
      setCliente(clientePreseleccionado);
      setCodigoInput(clientePreseleccionado.codigo || clientePreseleccionado.rnc || '');
      cargarBalance(clientePreseleccionado.id);
    } else {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const seleccionarCliente = (c) => {
    setCliente(c); setBuscarOpen(false);
    setCodigoInput(c.codigo || c.rnc || '');
    cargarBalance(c.id);
  };

  const buscarPorCodigo = async () => {
    const q = codigoInput.trim();
    if (!q) return;
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nombre, codigo, rnc, direccion, telefono')
        .or(`codigo.eq.${q},rnc.eq.${q}`).eq('activo', true).limit(1);
      if (error) throw error;
      if (data && data.length) seleccionarCliente(data[0]);
      else toast({ variant: 'destructive', title: 'Cliente no encontrado', description: `No hay cliente con código/cédula ${q}.` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Error al buscar', description: e.message });
    }
  };

  const onMontoChange = (e) => {
    let raw = e.target.value.replace(/,/g, '').replace(/[^\d.]/g, '');
    const parts = raw.split('.');
    if (parts.length > 2) raw = `${parts[0]}.${parts.slice(1).join('')}`;
    const [ip, dp] = raw.split('.');
    raw = dp !== undefined ? `${ip}.${dp.slice(0, 2)}` : ip;
    setMontoText(raw);
  };

  const handleGrabar = async () => {
    if (!cliente?.id) { toast({ variant: 'destructive', title: 'Selecciona un cliente' }); return; }
    if (!(monto > 0)) { toast({ variant: 'destructive', title: 'El monto de la transacción debe ser mayor que cero' }); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('crear_cargo_cliente', {
        p_cliente_id: cliente.id,
        p_monto: monto,
        p_tipo: tipo,
        p_concepto: concepto,
        p_descripcion: descripcion || null,
        p_fecha: fecha || null,
      });
      if (error) throw error;
      toast({ title: 'Cargo registrado', description: `${data?.numero} · ${tipo} · ${fmt(data?.monto)}` });
      onClose(true);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo registrar el cargo', description: e.message });
    }
    setSaving(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose(false)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Otras Transacciones</DialogTitle>
          <DialogDescription>Aplicar un cargo al cliente (ej. Cargo por Abogados / Gastos de Cobro).</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Cliente */}
          <div className="border rounded-md p-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">Código de Cliente</span>
              <Input
                value={codigoInput}
                onChange={(e) => setCodigoInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarPorCodigo(); } }}
                placeholder="Código o cédula"
                className="flex-1 h-8 text-sm"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => setBuscarOpen(true)}>
                <Search className="w-3.5 h-3.5 mr-1" />F3
              </Button>
            </div>
            <div className="mt-2 text-sm font-bold text-blue-700 leading-tight truncate" title={cliente?.nombre || ''}>{cliente?.nombre || '—'}</div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 truncate flex-1 min-w-0" title={cliente?.direccion || ''}>{cliente?.direccion || '—'}</span>
              <span className="text-emerald-600 whitespace-nowrap font-semibold">{cliente?.telefono || '—'}</span>
            </div>
          </div>

          {/* Tipo / Fecha */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Tipo de Transacción</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>

          {/* Concepto */}
          <div className="space-y-1">
            <Label className="text-[10px] font-bold text-slate-500 uppercase">Concepto</Label>
            <Select value={concepto} onValueChange={setConcepto}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>{CONCEPTOS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {/* Descripción */}
          <div className="space-y-1">
            <Label className="text-[10px] font-bold text-slate-500 uppercase">Descripción</Label>
            <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="h-12 text-sm resize-none" placeholder="Ej. COB / detalle del cargo" />
          </div>

          {/* Balances + Monto */}
          <div className="border rounded-md p-3 bg-slate-50 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 font-medium">Balance Anterior</span>
              <span className="font-mono font-bold text-blue-700">{fmt(balanceAnt)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm font-bold text-slate-600 whitespace-nowrap">Monto de la Transacción</Label>
              <Input
                type="text" inputMode="decimal"
                value={fmtMontoInput(montoText)} onChange={onMontoChange}
                placeholder="0.00"
                className="text-right font-bold text-lg h-9 w-44"
              />
            </div>
            <div className="flex items-center justify-between text-sm border-t pt-2">
              <span className="text-red-600 font-bold">Balance Actual</span>
              <span className="font-mono font-bold text-red-600">{fmt(balanceActual)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <label className="flex items-center gap-2 text-sm mr-auto">
            <Checkbox checked={imprimir} onCheckedChange={(c) => setImprimir(!!c)} /> Imprimir
          </label>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => onClose(false)}><X className="w-4 h-4 mr-1" />Salir</Button>
            <Button type="button" onClick={handleGrabar} disabled={saving || !cliente}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}Grabar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <ClienteSearchModal isOpen={buscarOpen} onClose={() => setBuscarOpen(false)} onSelectCliente={seleccionarCliente} />
    </Dialog>
  );
};

export default OtrasTransaccionesModal;
