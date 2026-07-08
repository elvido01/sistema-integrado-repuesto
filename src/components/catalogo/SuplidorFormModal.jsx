import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { emitProveedoresActualizado } from '@/lib/catalogEvents';

const SuplidorFormModal = ({ suplidor, isOpen, onClose }) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    nombre: '',
    rnc: '',
    telefono: '',
    email: '',
    activo: true,
    vende_a_credito: false,
    dias_credito: 0,
    moneda: 'DOP',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (suplidor) {
      setFormData({
        nombre: suplidor.nombre || '',
        rnc: suplidor.rnc || '',
        telefono: suplidor.telefono || '',
        email: suplidor.email || '',
        activo: suplidor.activo ?? true,
        vende_a_credito: suplidor.vende_a_credito ?? false,
        dias_credito: suplidor.dias_credito || 0,
        moneda: suplidor.moneda || 'DOP',
      });
    } else {
      setFormData({
        nombre: '',
        rnc: '',
        telefono: '',
        email: '',
        activo: true,
        vende_a_credito: false,
        dias_credito: 0,
        moneda: 'DOP',
      });
    }
  }, [suplidor, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCheckedChange = (name, checked) => {
    setFormData((prev) => ({ ...prev, [name]: checked }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    let result;
    if (suplidor) {
      // Update
      result = await supabase.from('proveedores').update(formData).eq('id', suplidor.id).select();
    } else {
      // Insert
      result = await supabase.from('proveedores').insert(formData).select();
    }

    const { data, error } = result;

    if (error) {
      toast({
        title: 'Error',
        description: `No se pudo guardar el suplidor. ${error.message}`,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Éxito',
        description: `Suplidor ${suplidor ? 'actualizado' : 'creado'} correctamente.`,
      });
      emitProveedoresActualizado(); // refresca selectores en Mercancía/Compras/Orden de Compra
      onClose(true); // pass true to indicate success and trigger refresh
    }
    setIsSubmitting(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{suplidor ? 'Editar Suplidor' : 'Crear Suplidor'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="nombre" className="text-right">Nombre</Label>
            <Input id="nombre" name="nombre" value={formData.nombre} onChange={handleChange} className="col-span-3" required />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="rnc" className="text-right">RNC</Label>
            <Input id="rnc" name="rnc" value={formData.rnc} onChange={handleChange} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="telefono" className="text-right">Teléfono</Label>
            <Input id="telefono" name="telefono" value={formData.telefono} onChange={handleChange} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="email" className="text-right">Email</Label>
            <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="activo" className="text-right">Activo</Label>
            <Checkbox id="activo" checked={formData.activo} onCheckedChange={(checked) => handleCheckedChange('activo', checked)} />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="vende_a_credito" className="text-right">Vende a Crédito</Label>
            <Checkbox id="vende_a_credito" checked={formData.vende_a_credito} onCheckedChange={(checked) => handleCheckedChange('vende_a_credito', checked)} />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="factura_usd" className="text-right">Factura en US$</Label>
            <div className="col-span-3 flex items-center gap-2">
              <Checkbox id="factura_usd" checked={formData.moneda === 'USD'} onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, moneda: checked ? 'USD' : 'DOP' }))} />
              <span className="text-xs text-muted-foreground">Sus compras se digitan en dólares a la tasa del día</span>
            </div>
          </div>
          {formData.vende_a_credito && (
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="dias_credito" className="text-right">Días Crédito</Label>
              <Input id="dias_credito" name="dias_credito" type="number" value={formData.dias_credito} onChange={handleChange} className="col-span-3" />
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">Cancelar</Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {suplidor ? 'Guardar Cambios' : 'Crear Suplidor'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default SuplidorFormModal;