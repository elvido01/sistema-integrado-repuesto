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

const DailyExpenseModal = ({ isOpen, onClose }) => {
  const { toast } = useToast();
  const { user, tenantId } = useAuth();
  const montoInputRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    fecha: todayISO(),
    tipo_gasto: 'Operativo',
    monto: '',
    descripcion: '',
  });

  useEffect(() => {
    if (isOpen) {
      setFormData({
        fecha: todayISO(),
        tipo_gasto: 'Operativo',
        monto: '',
        descripcion: '',
      });
      setTimeout(() => {
        montoInputRef.current?.focus();
        montoInputRef.current?.select();
      }, 80);
    }
  }, [isOpen]);

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
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(false); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gastos Diarios</DialogTitle>
          <DialogDescription>
            Registra una salida de efectivo para rebajarla de caja.
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
            <Button type="button" variant="secondary" onClick={() => onClose(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default DailyExpenseModal;
