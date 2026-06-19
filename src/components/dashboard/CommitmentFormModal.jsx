import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CommitmentFormModal = ({ compromiso, isOpen, onClose, tenantId }) => {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    monto: 0,
    fecha: '',
    tipo: 'Fijo',
    activo: true,
    recurrente: false,
    frecuencia: 'mensual',
  });

  useEffect(() => {
    if (isOpen) {
      if (compromiso) {
        setFormData({
          nombre: compromiso.nombre || '',
          monto: compromiso.monto || 0,
          // Format date for input type="date" (YYYY-MM-DD)
          fecha: compromiso.fecha ? new Date(compromiso.fecha).toISOString().split('T')[0] : '',
          tipo: compromiso.tipo || 'Fijo',
          activo: compromiso.activo ?? true,
          recurrente: compromiso.recurrente ?? false,
          frecuencia: compromiso.frecuencia || 'mensual',
        });
      } else {
        // Reset for new commitment
        setFormData({
          nombre: '',
          monto: 0,
          fecha: new Date().toISOString().split('T')[0],
          tipo: 'Fijo',
          activo: true,
          recurrente: true,
          frecuencia: 'mensual',
        });
      }
    }
  }, [compromiso, isOpen]);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    const parsedValue = type === 'number' ? parseFloat(value) || 0 : value;
    setFormData((prev) => ({ ...prev, [name]: parsedValue }));
  };

  const handleCheckedChange = (name, checked) => {
    setFormData((prev) => ({ ...prev, [name]: checked }));
  };

  const handleSelectChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!compromiso && !tenantId) {
      toast({
        title: 'Error',
        description: 'No se encontro el tenant de la empresa.',
        variant: 'destructive',
      });
      return;
    }
    setIsSubmitting(true);

    let result;
    if (compromiso && compromiso.id) {
      // Update
      result = await supabase.from('compromisos').update(formData).eq('id', compromiso.id).select();
    } else {
      // Insert
      result = await supabase.from('compromisos').insert({ ...formData, tenant_id: tenantId }).select();
    }

    const { error } = result;

    if (error) {
      toast({
        title: 'Error',
        description: `No se pudo guardar el compromiso. ${error.message}`,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Éxito',
        description: `Compromiso ${compromiso ? 'actualizado' : 'creado'} correctamente.`,
      });
      onClose(true); // pass true to indicate success and trigger refresh
    }
    setIsSubmitting(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(false); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{compromiso ? 'Editar Compromiso' : 'Nuevo Compromiso'}</DialogTitle>
          <DialogDescription>
            {compromiso ? 'Modifica los datos del compromiso.' : 'Agrega un nuevo compromiso financiero.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="nombre">Descripción / Nombre</Label>
            <Input id="nombre" name="nombre" value={formData.nombre} onChange={handleChange} placeholder="Ej: Pago de Luz" required />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="monto">Monto (DOP)</Label>
              <Input id="monto" name="monto" type="number" step="0.01" min="0" value={formData.monto} onChange={handleChange} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fecha">Fecha Límite</Label>
              <Input id="fecha" name="fecha" type="date" value={formData.fecha} onChange={handleChange} required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tipo">Tipo de Gasto</Label>
            <Select name="tipo" value={formData.tipo} onValueChange={(value) => handleSelectChange('tipo', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccione el tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Fijo">Fijo (Mensualidades, Préstamos)</SelectItem>
                <SelectItem value="Variable">Variable (Servicios, Compras)</SelectItem>
                <SelectItem value="Extraordinario">Extraordinario</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <Checkbox id="activo" checked={formData.activo} onCheckedChange={(checked) => handleCheckedChange('activo', checked)} />
            <Label htmlFor="activo">Compromiso Activo</Label>
          </div>

          <div className="rounded-md border border-indigo-100 bg-indigo-50/40 p-3 space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="recurrente"
                checked={formData.recurrente}
                onCheckedChange={(checked) => handleCheckedChange('recurrente', !!checked)}
              />
              <Label htmlFor="recurrente" className="font-medium">
                Recurrente — al pagarlo, crear el siguiente automáticamente
              </Label>
            </div>
            {formData.recurrente && (
              <div className="space-y-2">
                <Label htmlFor="frecuencia">Frecuencia</Label>
                <Select
                  name="frecuencia"
                  value={formData.frecuencia}
                  onValueChange={(value) => handleSelectChange('frecuencia', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione la frecuencia" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semanal">Semanal (cada 7 días)</SelectItem>
                    <SelectItem value="quincenal">Quincenal (cada 15 días)</SelectItem>
                    <SelectItem value="mensual">Mensual (cada mes)</SelectItem>
                    <SelectItem value="anual">Anual (cada año)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter className="pt-4 mt-4 border-t">
            <DialogClose asChild>
              <Button type="button" variant="secondary">Cancelar</Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {compromiso ? 'Guardar Cambios' : 'Crear'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CommitmentFormModal;
