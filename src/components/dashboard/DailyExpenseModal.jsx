import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { generateGastoDiarioPDF } from '@/components/common/pdf/gastoDiarioPDF';
import { printGastoDiarioPOS } from '@/lib/printPOS';

const todayISO = () => new Date().toISOString().split('T')[0];

const TIPOS_GASTO = [
  'Operativo',
  'Combustible',
  'Comida y dieta',
  'Casa',
  'Transporte',
  'Servicios',
  'Mantenimiento',
  'Nomina',
  'Administrativo',
  'Otro',
];

const DailyExpenseModal = ({ isOpen, onClose, gasto = null }) => {
  const { toast } = useToast();
  const { user, tenantId, empresa } = useAuth();
  const montoInputRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    fecha: todayISO(),
    tipo_gasto: 'Operativo',
    monto: '',
    descripcion: '',
  });
  // Gastos ya registrados hoy: clic para EDITAR (ej. el mandado costó menos)
  const [gastosHoy, setGastosHoy] = useState([]);
  const [editandoId, setEditandoId] = useState(null);
  const [huboCambios, setHuboCambios] = useState(false);

  const cargarGastosHoy = async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from('gastos_diarios')
      .select('id, fecha, tipo_gasto, monto, descripcion')
      .eq('tenant_id', tenantId)
      .eq('fecha', todayISO())
      .eq('anulado', false)
      .order('created_at', { ascending: false });
    setGastosHoy(data || []);
  };

  const resetForm = () => {
    setEditandoId(null);
    setFormData({ fecha: todayISO(), tipo_gasto: 'Operativo', monto: '', descripcion: '' });
  };

  const editarGasto = (g) => {
    setEditandoId(g.id);
    setFormData({ fecha: g.fecha, tipo_gasto: g.tipo_gasto || 'Operativo', monto: String(g.monto), descripcion: g.descripcion || '' });
    setTimeout(() => { montoInputRef.current?.focus(); montoInputRef.current?.select(); }, 80);
  };

  // Eliminar (anular): p. ej. se mandó a comprar algo y no se compró
  const eliminarGasto = async () => {
    if (!editandoId) return;
    if (!window.confirm(`¿Eliminar este gasto de RD$${formData.monto}? El dinero vuelve a la caja.`)) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('gastos_diarios').update({ anulado: true }).eq('id', editandoId);
      if (error) throw error;
      toast({ title: 'Gasto eliminado', description: 'El monto regresó a la caja del día.' });
      setHuboCambios(true);
      resetForm();
      await cargarGastosHoy();
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo eliminar', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      // Doble clic en la tarjeta del dashboard: abre directo en edición
      if (gasto?.id) editarGasto(gasto);
      else resetForm();
      setHuboCambios(false);
      cargarGastosHoy();
      setTimeout(() => {
        montoInputRef.current?.focus();
        montoInputRef.current?.select();
      }, 80);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, gasto]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleTipoChange = (value) => {
    setFormData(prev => ({ ...prev, tipo_gasto: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const monto = Number(formData.monto);

    if (!tenantId) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se encontro el tenant de la empresa.' });
      return;
    }

    if (!Number.isFinite(monto) || monto <= 0) {
      toast({ variant: 'destructive', title: 'Monto invalido', description: 'Digite un monto mayor que cero.' });
      return;
    }

    setIsSubmitting(true);
    try {
      if (editandoId) {
        // Corrección de un gasto ya registrado (ej. costó menos de lo anotado)
        const { error } = await supabase.from('gastos_diarios').update({
          fecha: formData.fecha,
          tipo_gasto: formData.tipo_gasto,
          monto,
          descripcion: formData.descripcion.trim(),
        }).eq('id', editandoId);
        if (error) throw error;
        toast({ title: 'Gasto actualizado', description: 'La caja se recalcula con el nuevo monto.' });
        setHuboCambios(true);
        resetForm();
        await cargarGastosHoy();
        setIsSubmitting(false);
        return; // el modal queda abierto para seguir revisando
      }

      const { error } = await supabase.from('gastos_diarios').insert({
        tenant_id: tenantId,
        fecha: formData.fecha,
        tipo_gasto: formData.tipo_gasto,
        monto,
        descripcion: formData.descripcion.trim(),
        usuario_id: user?.id || null,
      });

      if (error) throw error;

      toast({
        title: 'Gasto diario registrado',
        description: 'El gasto fue descontado de caja.',
      });

      // Comprobante de gasto segun el formato configurado (Config. del Sistema)
      try {
        const gastoComprobante = {
          fecha: formData.fecha,
          tipo_gasto: formData.tipo_gasto,
          monto,
          descripcion: formData.descripcion.trim(),
        };
        const formato = empresa?.formato_comprobante_pago || 'pdf';
        if (formato === 'pos_80mm') {
          printGastoDiarioPOS(gastoComprobante, '80mm');
        } else if (formato === 'pos_4inch') {
          printGastoDiarioPOS(gastoComprobante, '4inch');
        } else {
          generateGastoDiarioPDF(gastoComprobante, empresa || {});
        }
      } catch (pdfErr) {
        console.warn('No se pudo generar el comprobante de gasto:', pdfErr);
      }

      onClose(true);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error al guardar',
        description: error.message || 'No se pudo registrar el gasto diario.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(huboCambios); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editandoId ? 'Editar Gasto' : 'Gastos Diarios'}</DialogTitle>
          <DialogDescription>
            {editandoId
              ? 'Corrige el monto o la descripción del gasto seleccionado.'
              : 'Registra una salida de efectivo para rebajarla de caja.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fecha-gasto">Fecha</Label>
              <Input
                id="fecha-gasto"
                name="fecha"
                type="date"
                value={formData.fecha}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipo-gasto">Tipo de gasto</Label>
              <Select value={formData.tipo_gasto} onValueChange={handleTipoChange}>
                <SelectTrigger id="tipo-gasto">
                  <SelectValue placeholder="Seleccione" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_GASTO.map(tipo => (
                    <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="monto-gasto">Monto (DOP)</Label>
            <Input
              ref={montoInputRef}
              id="monto-gasto"
              name="monto"
              type="number"
              step="0.01"
              min="0.01"
              value={formData.monto}
              onChange={handleChange}
              placeholder="0.00"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="descripcion-gasto">Descripcion</Label>
            <Textarea
              id="descripcion-gasto"
              name="descripcion"
              value={formData.descripcion}
              onChange={handleChange}
              placeholder="Ej: Combustible, merienda, envio..."
              required
            />
          </div>

          <DialogFooter className="pt-4 mt-4 border-t">
            {editandoId && (
              <>
                <Button type="button" variant="destructive" onClick={eliminarGasto} disabled={isSubmitting}>
                  Eliminar
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar edición
                </Button>
              </>
            )}
            <Button type="button" variant="secondary" onClick={() => onClose(huboCambios)}>
              Cerrar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editandoId ? 'Actualizar' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>

        {/* Gastos ya registrados HOY — clic para corregir */}
        {gastosHoy.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-[11px] font-bold text-slate-400 uppercase mb-1.5">Gastos de hoy (clic para editar)</p>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {gastosHoy.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => editarGasto(g)}
                  className={`w-full flex items-center justify-between gap-2 text-left text-sm px-2 py-1 rounded border transition-colors ${editandoId === g.id ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
                >
                  <span className="truncate">{g.tipo_gasto} — {g.descripcion}</span>
                  <span className="font-mono font-bold shrink-0">{Number(g.monto).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DailyExpenseModal;
