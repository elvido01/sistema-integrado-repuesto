import React, { useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search } from 'lucide-react';
import ClienteSearchModal from '@/components/ventas/ClienteSearchModal';
import { calcAmortizacion } from './amortizacion';

const fmt = (v) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0);

const proximoMes = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
};

const initial = {
  tipo: 'financiamiento',
  metodo: 'simple',
  frecuencia: 'mensual',
  monto: '',
  tasa: '',
  plazo: '',
  mora: '',
  fechaPrimera: proximoMes(),
  garantia: '',
  notas: '',
};

const NuevoPrestamoModal = ({ isOpen, onClose }) => {
  const { toast } = useToast();
  const [form, setForm] = useState(initial);
  const [cliente, setCliente] = useState(null);
  const [buscarOpen, setBuscarOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const cuotas = useMemo(
    () => calcAmortizacion({
      monto: form.monto,
      tasa: form.tasa,
      plazo: form.plazo,
      metodo: form.metodo,
      frecuencia: form.frecuencia,
      fechaPrimera: form.fechaPrimera,
    }),
    [form.monto, form.tasa, form.plazo, form.metodo, form.frecuencia, form.fechaPrimera]
  );

  const totalInteres = cuotas.reduce((a, c) => a + c.interes, 0);
  const totalAPagar = cuotas.reduce((a, c) => a + c.monto_cuota, 0);

  const reset = () => { setForm(initial); setCliente(null); };

  const handleGuardar = async () => {
    if (!cliente?.id) { toast({ variant: 'destructive', title: 'Selecciona un cliente' }); return; }
    if (!(Number(form.monto) > 0) || !(parseInt(form.plazo, 10) > 0)) {
      toast({ variant: 'destructive', title: 'Monto y plazo son requeridos' });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('crear_prestamo', {
        p_cliente_id: cliente.id,
        p_monto: Number(form.monto),
        p_tasa: Number(form.tasa) || 0,
        p_plazo: parseInt(form.plazo, 10),
        p_metodo: form.metodo,
        p_frecuencia: form.frecuencia,
        p_mora_pct: Number(form.mora) || 0,
        p_tipo: form.tipo,
        p_fecha_primera: form.fechaPrimera || null,
        p_garantia: form.garantia || null,
        p_notas: form.notas || null,
      });
      if (error) throw error;
      toast({ title: 'Préstamo creado', description: `${data?.numero} · ${cliente.nombre}` });
      reset();
      onClose(true);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo crear el préstamo', description: e.message });
    }
    setSaving(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose(false)}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo Préstamo</DialogTitle>
          <DialogDescription>Originar un préstamo y generar su tabla de cuotas.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Cliente */}
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <div className="flex gap-2">
              <Input readOnly value={cliente ? `${cliente.codigo || ''} ${cliente.nombre}`.trim() : ''} placeholder="Selecciona un cliente" />
              <Button type="button" variant="outline" onClick={() => setBuscarOpen(true)}><Search className="w-4 h-4 mr-1" />Buscar</Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => set('tipo', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="financiamiento">Financiamiento de moto</SelectItem>
                  <SelectItem value="personal">Préstamo personal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Monto (capital)</Label>
              <Input type="number" value={form.monto} onChange={(e) => set('monto', e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Tasa % por cuota</Label>
              <Input type="number" value={form.tasa} onChange={(e) => set('tasa', e.target.value)} placeholder="Ej: 5" />
            </div>
            <div className="space-y-1.5">
              <Label>Plazo (cuotas)</Label>
              <Input type="number" value={form.plazo} onChange={(e) => set('plazo', e.target.value)} placeholder="Ej: 12" />
            </div>
            <div className="space-y-1.5">
              <Label>Frecuencia</Label>
              <Select value={form.frecuencia} onValueChange={(v) => set('frecuencia', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensual">Mensual</SelectItem>
                  <SelectItem value="quincenal">Quincenal</SelectItem>
                  <SelectItem value="semanal">Semanal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Método de interés</Label>
              <Select value={form.metodo} onValueChange={(v) => set('metodo', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simple (cuota fija)</SelectItem>
                  <SelectItem value="frances">Francés (amortiza capital)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mora % (por mes atraso)</Label>
              <Input type="number" value={form.mora} onChange={(e) => set('mora', e.target.value)} placeholder="Ej: 5" />
            </div>
            <div className="space-y-1.5">
              <Label>1ª cuota vence</Label>
              <Input type="date" value={form.fechaPrimera} onChange={(e) => set('fechaPrimera', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Garantía</Label>
              <Input value={form.garantia} onChange={(e) => set('garantia', e.target.value)} placeholder="Matrícula / vehículo" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Input value={form.notas} onChange={(e) => set('notas', e.target.value)} />
          </div>

          {/* Vista previa de la amortización */}
          <div className="border rounded-md">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b text-xs font-bold text-slate-600">
              <span>Vista previa de cuotas ({cuotas.length})</span>
              <span>Interés: {fmt(totalInteres)} · Total a pagar: {fmt(totalAPagar)}</span>
            </div>
            <div className="max-h-52 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white border-b text-slate-500">
                  <tr>
                    <th className="text-left p-2">#</th>
                    <th className="text-left p-2">Vence</th>
                    <th className="text-right p-2">Capital</th>
                    <th className="text-right p-2">Interés</th>
                    <th className="text-right p-2">Cuota</th>
                  </tr>
                </thead>
                <tbody>
                  {cuotas.length === 0 && (
                    <tr><td colSpan={5} className="p-3 text-center text-slate-400">Ingresa monto y plazo para ver las cuotas.</td></tr>
                  )}
                  {cuotas.map((c) => (
                    <tr key={c.numero_cuota} className="border-b last:border-0">
                      <td className="p-2">{c.numero_cuota}</td>
                      <td className="p-2">{c.fecha_vencimiento}</td>
                      <td className="p-2 text-right">{fmt(c.capital)}</td>
                      <td className="p-2 text-right">{fmt(c.interes)}</td>
                      <td className="p-2 text-right font-semibold">{fmt(c.monto_cuota)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onClose(false)}>Cancelar</Button>
          <Button type="button" onClick={handleGuardar} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Crear Préstamo
          </Button>
        </DialogFooter>
      </DialogContent>

      <ClienteSearchModal
        isOpen={buscarOpen}
        onClose={() => setBuscarOpen(false)}
        onSelectCliente={(c) => { setCliente(c); setBuscarOpen(false); }}
      />
    </Dialog>
  );
};

export default NuevoPrestamoModal;
