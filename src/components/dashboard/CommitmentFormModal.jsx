import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from '@/contexts/SupabaseAuthContext';

const CommitmentFormModal = ({ compromiso, isOpen, onClose, tenantId }) => {
  const { toast } = useToast();
  const { profile } = useAuth();
  // Solo las cuentas administrativas pueden crear/ver gastos reservados
  const esAdmin = ['admin', 'owner'].includes(profile?.role);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [deNomina, setDeNomina] = useState(false);   // lo creo el modulo de Nomina

  // Al abrir en edicion se revisa si el compromiso pertenece a una nomina:
  // borrarlo no borra la nomina, solo la deja sin su compromiso.
  useEffect(() => {
    let vivo = true;
    if (isOpen && compromiso?.id) {
      supabase.from('nominas').select('id').eq('compromiso_id', compromiso.id).limit(1)
        .then(({ data }) => { if (vivo) setDeNomina(!!(data && data.length)); }, () => {});
    } else setDeNomina(false);
    return () => { vivo = false; };
  }, [isOpen, compromiso?.id]);

  const eliminar = async () => {
    if (!compromiso?.id) return;
    setBorrando(true);
    try {
      const { error } = await supabase.from('compromisos').delete().eq('id', compromiso.id);
      if (error) throw error;
      toast({ title: 'Compromiso eliminado', description: `"${compromiso.nombre}" ya no aparece en Compromisos a Pagar.` });
      setConfirmarBorrar(false);
      onClose(true);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo eliminar', description: e.message });
    }
    setBorrando(false);
  };
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    monto: 0,
    fecha: '',
    tipo: 'Fijo',
    activo: true,
    recurrente: false,
    frecuencia: 'mensual',
    solo_admin: false,
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
          solo_admin: compromiso.solo_admin ?? false,
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
          solo_admin: false,
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

          {esAdmin && (
            <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 space-y-1">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="solo_admin"
                  checked={formData.solo_admin}
                  onCheckedChange={(checked) => handleCheckedChange('solo_admin', !!checked)}
                />
                <Label htmlFor="solo_admin" className="font-medium">
                  Solo administración
                </Label>
              </div>
              <p className="text-xs text-amber-700 pl-6">
                Este gasto no aparece a los demás usuarios; al pagarlo, la rebaja
                de caja sí la ve todo el que vea el balance.
              </p>
            </div>
          )}

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

          <DialogFooter className="pt-4 mt-4 border-t sm:justify-between">
            {/* Eliminar solo tiene sentido sobre uno que ya existe */}
            {compromiso?.id ? (
              <Button type="button" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => setConfirmarBorrar(true)}>
                <Trash2 className="w-4 h-4 mr-1" />Eliminar
              </Button>
            ) : <span />}
            <div className="flex gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">Cancelar</Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {compromiso ? 'Guardar Cambios' : 'Crear'}
            </Button>
            </div>
          </DialogFooter>
        </form>

        <AlertDialog open={confirmarBorrar} onOpenChange={setConfirmarBorrar}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar «{compromiso?.nombre}»?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <p>Se borra del todo. Deja de contarse en <b>Compromisos a Pagar</b> y en la
                    proyección de Gestión Empresarial.</p>
                  {deNomina && (
                    <p className="font-semibold text-amber-700">
                      Ojo: este compromiso lo creó el módulo de Nómina. Borrarlo NO borra la
                      nómina — solo la deja sin su compromiso en el dashboard.
                    </p>
                  )}
                  <p className="text-muted-foreground">
                    Si solo quieres dejar de verlo pero conservar el historial, cancela y
                    desmarca <b>Activo</b> en su lugar.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={borrando}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={(e) => { e.preventDefault(); eliminar(); }}
                disabled={borrando} className="bg-red-600 hover:bg-red-700">
                {borrando ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                Sí, eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
};

export default CommitmentFormModal;
